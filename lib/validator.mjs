/**
 * Data-driven creator asset compliance validator.
 * Reads 100% of dimensions, byte limits, padding, and safe-zone boxes from specs/platform_safe_zones_2026.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeImageFile } from "./image-probe.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.join(__dirname, "..", "specs", "platform_safe_zones_2026.json");

export function loadSpec() {
  return JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export const PRESET_ALIASES = {
  steam: { kind: "pack", id: "steam-capsule-resizer" },
  line: { kind: "pack", id: "line-sticker-resizer" },
  "chrome-store": { kind: "pack", id: "chrome-web-store-resizer" },
  discord: { kind: "pack", id: "discord-emoji-resizer" },
  twitch: { kind: "pack", id: "twitch-emote-resizer" },
  "pixiv-booth": { kind: "pack", id: "pixiv-booth-cover-resizer" },
  tiktok: { kind: "safe-zone", id: "tiktok-safe-zone" },
  shorts: { kind: "safe-zone", id: "youtube-shorts-safe-zone" },
  reels: { kind: "safe-zone", id: "instagram-reels-safe-zone" },
  "youtube-banner": { kind: "safe-zone", id: "youtube-banner-safe-area" },
  "x-header": { kind: "safe-zone", id: "x-header-safe-zone" },
  "youtube-thumb": { kind: "safe-zone", id: "youtube-thumbnail-tester" },
};

export function collectImageFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  if (!stat.isDirectory()) return [];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      files.push(path.join(targetPath, e.name));
    }
  }
  return files.sort();
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function validateLineFile(filePath, info, pack) {
  const issues = [];
  const warnings = [];
  const base = path.basename(filePath).toLowerCase();
  const mainSpec = pack.outputs.find((o) => o.id === "line_main");
  const tabSpec = pack.outputs.find((o) => o.id === "line_tab");
  const stickerSpec = pack.outputs.find((o) => o.role === "item" || o.id === "line_sticker_item");

  let matchedRole = stickerSpec.id;
  let rule = stickerSpec;
  if (base === "main.png" || (info.width === mainSpec.width && info.height === mainSpec.height && base.includes("main"))) {
    matchedRole = "line_main";
    rule = mainSpec;
  } else if (base === "tab.png" || (info.width === tabSpec.width && info.height === tabSpec.height && base.includes("tab"))) {
    matchedRole = "line_tab";
    rule = tabSpec;
  }

  if (info.format !== "png") {
    issues.push(`LINE requires PNG format (got ${info.format.toUpperCase()}).`);
  }
  if (rule.max_bytes && info.bytes > rule.max_bytes) {
    issues.push(`File size ${fmtBytes(info.bytes)} exceeds LINE limit ${fmtBytes(rule.max_bytes)}.`);
  }

  if (matchedRole === stickerSpec.id) {
    if (info.width > rule.width || info.height > rule.height) {
      issues.push(`Dimensions ${info.width}×${info.height} exceed LINE max ${rule.width}×${rule.height}.`);
    }
    if (rule.even_dimensions && (info.width % 2 !== 0 || info.height % 2 !== 0)) {
      issues.push(`Dimensions ${info.width}×${info.height} must be EVEN numbers (LINE Creators Market rule).`);
    }
    if (!info.hasAlpha) {
      warnings.push("PNG has no alpha channel; LINE stickers should use a transparent background.");
    }
    if (rule.padding_px > 0 && info.transparentMarginPx) {
      if (info.transparentMarginPx.isFullyTransparent) {
        issues.push("Image appears completely transparent (no visible sticker content).");
      } else if (info.transparentMarginPx.min < rule.padding_px) {
        const m = info.transparentMarginPx;
        issues.push(
          `Transparent margin too tight (min ${m.min}px < required ${rule.padding_px}px; top=${m.top}px, right=${m.right}px, bottom=${m.bottom}px, left=${m.left}px).`
        );
      }
    }
  } else {
    if (info.width !== rule.width || info.height !== rule.height) {
      issues.push(`${matchedRole} must be exactly ${rule.width}×${rule.height} (got ${info.width}×${info.height}).`);
    }
  }

  return { file: path.basename(filePath), matched: matchedRole, info, issues, warnings, ok: issues.length === 0 };
}

function validatePackFiles(files, pack, isDir) {
  const results = [];
  const matchedIds = new Set();

  if (pack.id === "line-sticker-resizer") {
    for (const f of files) {
      const info = probeImageFile(f, { inspectAlphaMargin: true });
      if (!info) {
        results.push({ file: path.basename(f), matched: null, info: null, issues: ["Unreadable or unsupported image binary."], warnings: [], ok: false });
        continue;
      }
      const res = validateLineFile(f, info, pack);
      matchedIds.add(res.matched);
      results.push(res);
    }
    return { results, missing: [] };
  }

  for (const f of files) {
    const needAlpha = pack.outputs.some((o) => o.padding_px > 0);
    const info = probeImageFile(f, { inspectAlphaMargin: needAlpha });
    if (!info) {
      results.push({ file: path.basename(f), matched: null, info: null, issues: ["Unreadable or unsupported image binary."], warnings: [], ok: false });
      continue;
    }

    const exact = pack.outputs.find((o) => o.width === info.width && o.height === info.height);
    const issues = [];
    const warnings = [];
    if (!exact) {
      const allowed = pack.outputs.map((o) => `${o.width}×${o.height} (${o.id})`).join(", ");
      issues.push(`Dimensions ${info.width}×${info.height} do not match any ${pack.id} spec. Expected one of: ${allowed}`);
      results.push({ file: path.basename(f), matched: null, info, issues, warnings, ok: false });
      continue;
    }

    matchedIds.add(exact.id);
    if (exact.max_bytes && info.bytes > exact.max_bytes) {
      issues.push(`File size ${fmtBytes(info.bytes)} exceeds ${exact.id} limit ${fmtBytes(exact.max_bytes)}.`);
    }
    if (exact.padding_px > 0 && info.format === "png" && info.transparentMarginPx) {
      if (info.transparentMarginPx.isFullyTransparent) {
        issues.push(`${exact.id} appears completely transparent.`);
      } else if (info.transparentMarginPx.min < exact.padding_px) {
        const m = info.transparentMarginPx;
        issues.push(
          `${exact.id} transparent margin ${m.min}px < official ${exact.padding_px}px padding (top=${m.top}, right=${m.right}, bottom=${m.bottom}, left=${m.left}).`
        );
      }
    }
    if (exact.allow_logo_overlay === false) {
      warnings.push(`${exact.id}: platform rule forbids baked-in logos or title text (keep clean artwork only).`);
    }

    results.push({ file: path.basename(f), matched: exact.id, info, issues, warnings, ok: issues.length === 0 });
  }

  const missing = [];
  if (isDir && pack.id === "steam-capsule-resizer") {
    for (const o of pack.outputs) {
      if (!matchedIds.has(o.id)) {
        missing.push(`${o.id} (${o.width}×${o.height})`);
      }
    }
  }
  return { results, missing };
}

function validateSafeZoneFiles(files, platform) {
  const results = [];
  const cw = platform.canvas.width;
  const ch = platform.canvas.height;
  const targetRatio = cw / ch;

  const safeSummary = platform.modes.map((m) => {
    const safe = m.zones.find((z) => z.kind === "safe");
    if (!safe) return { mode: m.id, note: `${m.zones.length} overlay zone(s)` };
    return {
      mode: m.id,
      safeBoxPx: {
        x: Math.round(safe.x * cw),
        y: Math.round(safe.y * ch),
        w: Math.round(safe.w * cw),
        h: Math.round(safe.h * ch),
      },
    };
  });

  for (const f of files) {
    const info = probeImageFile(f);
    if (!info) {
      results.push({ file: path.basename(f), matched: platform.id, info: null, issues: ["Unreadable or unsupported image binary."], warnings: [], ok: false });
      continue;
    }
    const issues = [];
    const warnings = [];
    const ratio = info.width / info.height;
    if (Math.abs(ratio - targetRatio) > 0.02) {
      issues.push(
        `Aspect ratio ${info.width}×${info.height} (${ratio.toFixed(3)}) does not match ${platform.canvas.aspect_label} (${cw}×${ch}).`
      );
    }
    if (platform.min_width_px && info.width < platform.min_width_px) {
      issues.push(`Width ${info.width}px is below minimum ${platform.min_width_px}px.`);
    } else if (info.width < cw || info.height < ch) {
      warnings.push(`Resolution ${info.width}×${info.height} is below recommended ${cw}×${ch}.`);
    }
    if (platform.max_bytes && info.bytes > platform.max_bytes) {
      issues.push(`File size ${fmtBytes(info.bytes)} exceeds limit ${fmtBytes(platform.max_bytes)}.`);
    }
    results.push({ file: path.basename(f), matched: platform.id, info, issues, warnings, safeSummary, ok: issues.length === 0 });
  }
  return { results, missing: [] };
}

export function validateTarget(presetKey, targetPath) {
  const alias = PRESET_ALIASES[presetKey];
  if (!alias) {
    throw new Error(`Unknown preset "${presetKey}". Valid presets: ${Object.keys(PRESET_ALIASES).join(", ")}`);
  }
  const spec = loadSpec();
  const isDir = fs.statSync(targetPath).isDirectory();
  const files = collectImageFiles(targetPath);
  if (!files.length) {
    return {
      preset: presetKey,
      specSha256: spec.spec_sha256_16,
      ok: false,
      filesChecked: 0,
      results: [],
      missing: [],
      error: `No PNG/JPG/WebP image files found at ${targetPath}`,
    };
  }

  let out;
  let toolUrl;
  if (alias.kind === "pack") {
    const pack = spec.asset_packs.find((p) => p.id === alias.id);
    toolUrl = pack.tool_url;
    out = validatePackFiles(files, pack, isDir);
  } else {
    const plat = spec.safe_zone_platforms.find((p) => p.id === alias.id);
    toolUrl = plat.tool_url;
    out = validateSafeZoneFiles(files, plat);
  }

  const allOk = out.results.every((r) => r.ok) && out.missing.length === 0;
  return {
    preset: presetKey,
    specId: alias.id,
    specSha256: spec.spec_sha256_16,
    toolUrl,
    ok: allOk,
    filesChecked: files.length,
    results: out.results,
    missing: out.missing,
  };
}
