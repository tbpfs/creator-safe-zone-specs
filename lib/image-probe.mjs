/**
 * Zero-dependency binary image header & PNG alpha-margin prober (PNG, JPEG, WebP).
 * Strictly reads raw file bytes locally; enforces decompression bomb limits.
 */

import fs from "node:fs";
import zlib from "node:zlib";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PIXELS_FOR_DECODE = 16_000_000;
const MAX_INFLATE_BYTES = 64 * 1024 * 1024;

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(raw, width, height, bpp) {
  const stride = width * bpp;
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    throw new Error("PNG IDAT payload shorter than expected scanlines");
  }
  const out = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const ftype = raw[y * (stride + 1)];
    const srcOff = y * (stride + 1) + 1;
    const dstOff = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[srcOff + i];
      const a = i >= bpp ? out[dstOff + i - bpp] : 0;
      const b = y > 0 ? out[dstOff - stride + i] : 0;
      const c = y > 0 && i >= bpp ? out[dstOff - stride + i - bpp] : 0;
      let val;
      if (ftype === 0) val = x;
      else if (ftype === 1) val = (x + a) & 0xff;
      else if (ftype === 2) val = (x + b) & 0xff;
      else if (ftype === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (ftype === 4) val = (x + paethPredictor(a, b, c)) & 0xff;
      else throw new Error(`Unsupported PNG filter type: ${ftype}`);
      out[dstOff + i] = val;
    }
  }
  return out;
}

function parsePng(buf, { inspectAlphaMargin = false } = {}) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    return null;
  }
  const ihdrType = buf.subarray(12, 16).toString("ascii");
  if (ihdrType !== "IHDR") return null;

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];

  let hasTrns = false;
  const idatChunks = [];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString("ascii");
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) break;
    if (type === "tRNS") hasTrns = true;
    if (type === "IDAT" && inspectAlphaMargin) {
      idatChunks.push(buf.subarray(dataStart, dataEnd));
    }
    if (type === "IEND") break;
    pos = dataEnd + 4;
  }

  const hasAlpha = colorType === 4 || colorType === 6 || hasTrns;
  const info = {
    format: "png",
    width,
    height,
    bytes: buf.length,
    bitDepth,
    colorType,
    hasAlpha,
    transparentMarginPx: null,
  };

  if (
    inspectAlphaMargin &&
    interlace === 0 &&
    bitDepth === 8 &&
    (colorType === 6 || colorType === 4) &&
    width > 0 &&
    height > 0 &&
    width * height <= MAX_PIXELS_FOR_DECODE &&
    idatChunks.length > 0
  ) {
    try {
      const bpp = colorType === 6 ? 4 : 2;
      const alphaOffset = bpp - 1;
      const inflated = zlib.inflateSync(Buffer.concat(idatChunks), {
        maxOutputLength: MAX_INFLATE_BYTES,
      });
      const pixels = unfilterScanlines(inflated, width, height, bpp);
      const stride = width * bpp;

      let minX = width;
      let maxX = -1;
      let minY = height;
      let maxY = -1;
      const ALPHA_THRESHOLD = 8; // treat alpha <= 8 as transparent anti-alias fringe

      for (let y = 0; y < height; y++) {
        const rowOff = y * stride;
        for (let x = 0; x < width; x++) {
          if (pixels[rowOff + x * bpp + alphaOffset] > ALPHA_THRESHOLD) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX === -1) {
        info.transparentMarginPx = {
          top: height,
          bottom: height,
          left: width,
          right: width,
          min: Math.min(width, height),
          isFullyTransparent: true,
        };
      } else {
        const top = minY;
        const bottom = height - 1 - maxY;
        const left = minX;
        const right = width - 1 - maxX;
        info.transparentMarginPx = {
          top,
          bottom,
          left,
          right,
          min: Math.min(top, bottom, left, right),
          isFullyTransparent: false,
        };
      }
    } catch {
      info.transparentMarginPx = null;
    }
  }

  return info;
}

function parseJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < buf.length) {
    if (buf[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    while (pos < buf.length && buf[pos] === 0xff) pos += 1;
    if (pos >= buf.length) break;
    const marker = buf[pos];
    pos += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (pos + 2 > buf.length) break;
    const segLen = buf.readUInt16BE(pos);
    if (segLen < 2 || pos + segLen > buf.length) break;
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && pos + 7 < buf.length) {
      const height = buf.readUInt16BE(pos + 3);
      const width = buf.readUInt16BE(pos + 5);
      return {
        format: "jpeg",
        width,
        height,
        bytes: buf.length,
        hasAlpha: false,
        transparentMarginPx: null,
      };
    }
    pos += segLen;
  }
  return null;
}

function parseWebp(buf) {
  if (
    buf.length < 30 ||
    buf.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buf.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }
  const chunk = buf.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buf.length >= 30) {
    const flags = buf[20];
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return {
      format: "webp",
      width,
      height,
      bytes: buf.length,
      hasAlpha: Boolean(flags & 0x10),
      transparentMarginPx: null,
    };
  }
  if (chunk === "VP8 " && buf.length >= 30) {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return {
      format: "webp",
      width,
      height,
      bytes: buf.length,
      hasAlpha: false,
      transparentMarginPx: null,
    };
  }
  if (chunk === "VP8L" && buf.length >= 25 && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    const hasAlpha = Boolean((bits >> 28) & 1);
    return {
      format: "webp",
      width,
      height,
      bytes: buf.length,
      hasAlpha,
      transparentMarginPx: null,
    };
  }
  return null;
}

export function probeImageBuffer(buf, options = {}) {
  return parsePng(buf, options) || parseJpeg(buf) || parseWebp(buf) || null;
}

export function probeImageFile(filePath, options = {}) {
  const buf = fs.readFileSync(filePath);
  return probeImageBuffer(buf, options);
}
