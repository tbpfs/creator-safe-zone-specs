---
name: creator-safe-zone-specs
description: Validate 2026 social video UI safe zones (TikTok, YouTube Shorts, Instagram Reels, YouTube Banner, X Header, YouTube Thumbnail) and creator store asset packs (Steamworks 6-in-1 capsules, LINE Creators Market stickers with 10px transparent margin, Chrome Web Store 16px-padded icons, Twitch emotes, Discord emojis, pixiv/BOOTH covers) using machine-readable JSON specs and the zero-dependency specframe-check CLI.
---

# Creator Safe-Zone & Store Asset Specs Skill (`creator-safe-zone-specs`)

Use this skill whenever an AI coding, video-editing, or game-release agent generates, crops, overlays captions on, or validates creator media assets for short-form video platforms or digital storefronts.

## When to Activate

- Placing subtitles, captions, hooks, or CTA elements on 9:16 vertical videos (`TikTok`, `YouTube Shorts`, `Instagram Reels`) with FFmpeg, Remotion, or Canvas.
- Exporting or auditing **Steamworks store/library capsules** (`920×430`, `462×174`, `1232×706`, `748×896`, `600×900`, `3840×1240` no-logo hero).
- Preparing **LINE Creators Market stickers** (even dimensions `<= 370×320`, RGBA PNG, `<= 1 MB`, true `10px` transparent edge margin).
- Preparing **Chrome Web Store**, **Twitch Emote**, **Discord Emoji**, **pixiv/BOOTH**, **YouTube Thumbnail**, **YouTube Banner**, or **X Header** assets.

## Single Source of Truth Files

- **Machine-Readable Specs**: `specs/platform_safe_zones_2026.json` (auto-synced with [SpecFrame Studio](https://frame.ai-purplemaple.com/)).
- **Zero-Dependency Validator CLI (Node.js 18+)**: `bin/specframe-check.mjs`

## Quick CLI Commands

```bash
# List all supported platform presets
npx github:tbpfs/creator-safe-zone-specs --list

# Validate Steamworks 6-in-1 capsule folder before release
npx github:tbpfs/creator-safe-zone-specs steam ./store-assets

# Validate LINE stickers (even pixels + RGBA 10px transparent margin)
npx github:tbpfs/creator-safe-zone-specs line ./stickers --json

# Validate Chrome Web Store promo tiles & 128x128 16px-padded icon
npx github:tbpfs/creator-safe-zone-specs chrome-store ./cws-art

# Validate short-video 9:16 creative dimensions
npx github:tbpfs/creator-safe-zone-specs tiktok ./video-frames
npx github:tbpfs/creator-safe-zone-specs shorts ./video-frames
npx github:tbpfs/creator-safe-zone-specs reels ./video-frames
```

## 2026 Safe-Zone & Asset Pack Quick Reference

| Preset ID | Canvas / Key Rule | Interactive Browser Workbench (Zero Upload) |
| :--- | :--- | :--- |
| `tiktok-safe-zone` | `1080×1920` (9:16) · Organic safe box `x:4%..83%, y:9%..76%`; Paid Ad bottom margin `29%` (`556px`) | [TikTok Safe Zone Checker](https://frame.ai-purplemaple.com/tools/tiktok-safe-zone/) |
| `youtube-shorts-safe-zone` | `1080×1920` (9:16) · Avoid right engagement rail & bottom title/channel bar | [YouTube Shorts Safe Zone](https://frame.ai-purplemaple.com/tools/youtube-shorts-safe-zone/) |
| `instagram-reels-safe-zone` | `1080×1920` (9:16) · Guard top bar, right rail & 4:5 profile grid crop | [Instagram Reels Safe Zone](https://frame.ai-purplemaple.com/tools/instagram-reels-safe-zone/) |
| `youtube-thumbnail-tester` | `1280×720` (16:9), `min 640px`, `<= 2 MB` · Avoid bottom-right duration pill (`x:82%, y:83%`) | [YouTube Thumbnail Tester](https://frame.ai-purplemaple.com/tools/youtube-thumbnail-tester/) |
| `youtube-banner-safe-area` | `2560×1440` (16:9) · Center `1546×423` visible across mobile & desktop | [YouTube Banner Safe Area](https://frame.ai-purplemaple.com/tools/youtube-banner-safe-area/) |
| `x-header-safe-zone` | `1500×500` (3:1) · Guard bottom-left avatar overlap & mobile crop | [X Header Safe Zone](https://frame.ai-purplemaple.com/tools/x-header-safe-zone/) |
| `steam-capsule-resizer` | 6 store/library assets (`920×430`..`3840×1240`); Library Hero forbids baked-in logos | [Steam Capsule Resizer](https://frame.ai-purplemaple.com/tools/steam-capsule-resizer/) |
| `line-sticker-resizer` | Even width/height `<= 370×320`, PNG alpha, `<= 1 MB`, `10px` transparent padding | [LINE Sticker Resizer (JA)](https://frame.ai-purplemaple.com/ja/tools/line-sticker-resizer/) |
| `chrome-web-store-resizer` | 4 store assets incl. `128×128` icon with `16px` transparent margin | [Chrome Web Store Resizer](https://frame.ai-purplemaple.com/tools/chrome-web-store-resizer/) |
| `twitch-emote-resizer` | 6 emote/badge PNG outputs | [Twitch Emote Resizer](https://frame.ai-purplemaple.com/tools/twitch-emote-resizer/) |
| `discord-emoji-resizer` | 3 emoji/sticker PNG outputs within byte caps | [Discord Emoji Resizer](https://frame.ai-purplemaple.com/tools/discord-emoji-resizer/) |
| `pixiv-booth-cover-resizer` | 4 pixiv/BOOTH cover & thumbnail sizes | [pixiv/BOOTH Cover Resizer](https://frame.ai-purplemaple.com/tools/pixiv-booth-cover-resizer/) |

## Agent Workflow Rules

1. **Always read coordinates from `specs/platform_safe_zones_2026.json`** instead of hardcoding guessed margins in FFmpeg `drawtext`, ASS subtitles, or Remotion layouts.
2. **Convert normalized ratios `(x, y, w, h)` to pixels** using `canvas.width` and `canvas.height` (e.g., for TikTok organic on `1080×1920`, keep subtitles strictly above `y = 0.76 * 1920 = 1459px` and left of `x = 0.83 * 1080 = 896px`).
3. **Run `specframe-check` in CI or before delivery**; fail the release whenever exit code is non-zero (`1`).
4. **Never upload confidential or unreleased client media** to remote servers—both this CLI and the interactive [SpecFrame Studio](https://frame.ai-purplemaple.com/) workbench run 100% locally.
