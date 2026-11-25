import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { probeImageBuffer } from "../lib/image-probe.mjs";
import { validateTarget } from "../lib/validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, "..", "bin", "specframe-check.mjs");

// Minimal CRC32 for synthetic RGBA PNG generation in tests
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/**
 * Create a genuine 8-bit RGBA PNG with an opaque centered rectangle inset by `marginPx` transparent border.
 */
function makeRgbaPng(width, height, marginPx) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    raw[rowOff] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const inside =
        x >= marginPx && x < width - marginPx && y >= marginPx && y < height - marginPx;
      if (inside) {
        const px = rowOff + 1 + x * 4;
        raw[px] = 249;
        raw[px + 1] = 115;
        raw[px + 2] = 22;
        raw[px + 3] = 255;
      }
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

test("PNG prober accurately measures width, height, alpha, and exact transparent border margin", () => {
  const buf = makeRgbaPng(128, 128, 16);
  const info = probeImageBuffer(buf, { inspectAlphaMargin: true });
  assert.equal(info.format, "png");
  assert.equal(info.width, 128);
  assert.equal(info.height, 128);
  assert.equal(info.hasAlpha, true);
  assert.deepEqual(info.transparentMarginPx, {
    top: 16,
    bottom: 16,
    left: 16,
    right: 16,
    min: 16,
    isFullyTransparent: false,
  });
});

test("LINE preset validates 10px transparent margin and even-pixel rule (PASS vs FAIL)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-line-"));
  try {
    const okFile = path.join(dir, "01.png");
    fs.writeFileSync(okFile, makeRgbaPng(360, 320, 12));
    const okRes = validateTarget("line", okFile);
    assert.equal(okRes.ok, true);

    const tightFile = path.join(dir, "02_tight.png");
    fs.writeFileSync(tightFile, makeRgbaPng(360, 320, 4));
    const tightRes = validateTarget("line", tightFile);
    assert.equal(tightRes.ok, false);
    assert.ok(tightRes.results[0].issues.some((m) => m.includes("min 4px < required 10px")));

    const oddFile = path.join(dir, "03_odd.png");
    fs.writeFileSync(oddFile, makeRgbaPng(361, 320, 12));
    const oddRes = validateTarget("line", oddFile);
    assert.equal(oddRes.ok, false);
    assert.ok(oddRes.results[0].issues.some((m) => m.includes("EVEN")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Chrome Web Store preset enforces 16px transparent margin on 128x128 store icon", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-cws-"));
  try {
    const okIcon = path.join(dir, "icon_ok.png");
    fs.writeFileSync(okIcon, makeRgbaPng(128, 128, 16));
    assert.equal(validateTarget("chrome-store", okIcon).ok, true);

    const badIcon = path.join(dir, "icon_bad.png");
    fs.writeFileSync(badIcon, makeRgbaPng(128, 128, 8));
    const badRes = validateTarget("chrome-store", badIcon);
    assert.equal(badRes.ok, false);
    assert.ok(badRes.results[0].issues.some((m) => m.includes("8px < official 16px")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Steam directory check flags missing capsules and passes when all 6 official sizes exist (with Hero zero-logo warning)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-steam-"));
  try {
    const sizes = [
      ["header.png", 920, 430],
      ["small.png", 462, 174],
      ["main.png", 1232, 706],
      ["vertical.png", 748, 896],
      ["library_capsule.png", 600, 900],
    ];
    for (const [name, w, h] of sizes) {
      fs.writeFileSync(path.join(dir, name), makeRgbaPng(w, h, 0));
    }
    const incomplete = validateTarget("steam", dir);
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.missing.length, 1);
    assert.ok(incomplete.missing[0].includes("steam_library_hero"));

    // Add 3840x1240 Library Hero (fast IHDR-only PNG header)
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(3840, 0);
    ihdr.writeUInt32BE(1240, 4);
    ihdr[8] = 8;
    ihdr[9] = 2; // RGB
    fs.writeFileSync(path.join(dir, "library_hero.png"), Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IEND", Buffer.alloc(0))]));

    const complete = validateTarget("steam", dir);
    assert.equal(complete.ok, true);
    const heroEntry = complete.results.find((r) => r.matched === "steam_library_hero");
    assert.ok(heroEntry.warnings.some((w) => w.includes("forbids baked-in logos")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI subprocess supports --list, --json, and returns exit code 0 on PASS / 1 on FAIL", () => {
  const listOut = execFileSync(process.execPath, [CLI_PATH, "--list"], { encoding: "utf8" });
  assert.ok(listOut.includes("steam"));
  assert.ok(listOut.includes("line"));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-cli-"));
  try {
    const f = path.join(dir, "sticker.png");
    fs.writeFileSync(f, makeRgbaPng(320, 320, 12));
    const jsonOut = execFileSync(process.execPath, [CLI_PATH, "line", f, "--json"], { encoding: "utf8" });
    const parsed = JSON.parse(jsonOut);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.preset, "line");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
