#!/usr/bin/env node
/**
 * specframe-check — Zero-dependency CLI validator for Steam capsules, LINE stickers,
 * Chrome Web Store tiles, Discord/Twitch emotes, YouTube thumbnails & short-video safe zones.
 */

import { PRESET_ALIASES, loadSpec, validateTarget } from "../lib/validator.mjs";

function printHelp() {
  console.log(`specframe-check — Zero-dependency creator asset & safe-zone CLI validator

Usage:
  specframe-check <preset> <file-or-dir> [--json]
  specframe-check --list

Presets:
  ${Object.keys(PRESET_ALIASES).join(", ")}

Examples:
  specframe-check steam ./steam-assets
  specframe-check line ./stickers --json
  specframe-check chrome-store ./store-art
  specframe-check reels ./cover.png
`);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }
  if (args.includes("--list")) {
    const spec = loadSpec();
    console.log(`Available presets (spec sha256=${spec.spec_sha256_16}):`);
    for (const [key, meta] of Object.entries(PRESET_ALIASES)) {
      console.log(`  - ${key.padEnd(16)} (${meta.kind}: ${meta.id})`);
    }
    process.exit(0);
  }

  const jsonMode = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("-"));
  if (positional.length < 2) {
    console.error("Error: expected <preset> <file-or-dir>. Run --help for usage.");
    process.exit(2);
  }

  const [preset, targetPath] = positional;
  let report;
  try {
    report = validateTarget(preset, targetPath);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log(`[specframe-check] preset=${report.preset} (spec=${report.specSha256}) files=${report.filesChecked}`);
  if (report.error) {
    console.error(`  FAIL: ${report.error}`);
    process.exit(1);
  }

  for (const r of report.results) {
    const status = r.ok ? "PASS" : "FAIL";
    const dims = r.info ? `${r.info.width}x${r.info.height} ${r.info.format.toUpperCase()} ${(r.info.bytes / 1024).toFixed(1)}KB` : "unreadable";
    console.log(`  [${status}] ${r.file} -> ${r.matched || "unmatched"} (${dims})`);
    for (const iss of r.issues) console.log(`         ERROR: ${iss}`);
    for (const w of r.warnings) console.log(`         NOTE:  ${w}`);
  }
  if (report.missing.length) {
    console.log(`  [FAIL] Missing required pack assets: ${report.missing.join(", ")}`);
  }
  console.log(`Result: ${report.ok ? "ALL CHECKS PASSED" : "FAILED"}`);
  process.exit(report.ok ? 0 : 1);
}

main();
