# specframe-check — Creator Asset & Safe-Zone CLI + Open Specs (2026)

Zero-dependency Node.js CLI and machine-readable JSON specifications to validate creator & indie-game store assets locally or in CI before upload—catching common rejection traps automatically:

- **Steamworks 6-in-1 Capsules (`steam`)**: Verifies all 6 store/library dimensions (`920×430`, `462×174`, `1232×706`, `748×896`, `600×900`, `3840×1240`), flags missing assets in a folder, and reminds you that `Library Hero (3840×1240)` forbids baked-in logos/text.
- **LINE Creators Market Stickers (`line`)**: Enforces `<=370×320`, **even width & height**, PNG alpha channel, `<=1 MB`, and decodes actual RGBA scanlines to check the **10px transparent border margin** on all 4 edges.
- **Chrome Web Store Assets (`chrome-store`)**: Checks promo tiles (`1280×800`, `440×280`, `1400×560`) and verifies the official **16px transparent margin** on the `128×128` store icon.
- **Discord, Twitch, pixiv/BOOTH & Short-Video Safe Zones**: Validates `discord`, `twitch`, `pixiv-booth`, `youtube-thumb`, `tiktok`, `shorts`, `reels`, `youtube-banner`, and `x-header`.

Specs are auto-exported from the single source of truth backing the browser-local workbench at [SpecFrame Studio](https://frame.ai-purplemaple.com/).

## Quick Start (Zero Dependencies · Node.js 18+)

```bash
# Run directly from GitHub without installing dependencies
npx github:tbpfs/creator-safe-zone-specs --list

# Validate an entire Steam capsule folder in your game repo
npx github:tbpfs/creator-safe-zone-specs steam ./store-assets

# Validate LINE stickers (even pixels + true 10px transparent margin check)
npx github:tbpfs/creator-safe-zone-specs line ./stickers --json

# Validate Chrome Web Store promo images & 128x128 16px-padded icon
npx github:tbpfs/creator-safe-zone-specs chrome-store ./cws-art
```

## Use in GitHub Actions CI

```yaml
- name: Check Steamworks store capsules before release
  run: npx --yes github:tbpfs/creator-safe-zone-specs steam ./assets/steam
```

Exits `0` when all assets pass and `1` on any dimension, byte-limit, transparent-margin, or missing-asset failure.

## Run Tests Locally

```bash
python3 -W error -m unittest discover -s tests -v
node --test tests/test_cli.mjs
```

## License

Released under the [MIT License](LICENSE).
