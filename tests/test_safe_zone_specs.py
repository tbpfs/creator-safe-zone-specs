"""Automated invariant test suite for SSOT-synced platform_safe_zones_2026.json."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SPEC_PATH = ROOT_DIR / "specs" / "platform_safe_zones_2026.json"


class TestCreatorSafeZoneSpecs(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))

    def test_safe_zone_platforms_and_bounds(self) -> None:
        platforms = self.spec["safe_zone_platforms"]
        self.assertEqual(len(platforms), 6)
        by_id = {p["id"]: p for p in platforms}

        for p in platforms:
            self.assertGreater(p["canvas"]["width"], 0)
            self.assertGreater(p["canvas"]["height"], 0)
            self.assertTrue(p["tool_url"].startswith("https://frame.ai-purplemaple.com/tools/"))
            self.assertTrue(p["modes"], f"No modes on {p['id']}")
            for m in p["modes"]:
                for z in m["zones"]:
                    for k in ("x", "y", "w", "h"):
                        if k in z:
                            self.assertGreaterEqual(z[k], 0.0)
                            self.assertLessEqual(z[k], 1.0)

        # Meta Paid Ad bottom 35% & top 14% official rule
        reels_ad = next(m for m in by_id["instagram-reels-safe-zone"]["modes"] if m["id"] == "paid_ad")
        safe_ad = next(z for z in reels_ad["zones"] if z["kind"] == "safe")
        self.assertAlmostEqual(safe_ad["y"], 0.14, places=3)
        self.assertAlmostEqual(1.0 - (safe_ad["y"] + safe_ad["h"]), 0.35, places=3)

        # X Header safe box starts at x=0.26 (390px) clearing the circular avatar
        x_mode = by_id["x-header-safe-zone"]["modes"][0]
        x_safe = next(z for z in x_mode["zones"] if z["kind"] == "safe")
        self.assertGreaterEqual(x_safe["x"], 0.25)

    def test_asset_packs_invariants_and_urls(self) -> None:
        packs = self.spec["asset_packs"]
        self.assertEqual(len(packs), 6)
        by_id = {p["id"]: p for p in packs}

        # Discord pack must point to discord-emoji-resizer (not twitch)
        self.assertIn("/tools/discord-emoji-resizer/", by_id["discord-emoji-resizer"]["tool_url"])

        # Steam Library Hero must strictly disallow baked-in logos
        steam_outs = {o["id"]: o for o in by_id["steam-capsule-resizer"]["outputs"]}
        self.assertEqual(len(steam_outs), 6)
        self.assertFalse(steam_outs["steam_library_hero"]["allow_logo_overlay"])

        # LINE stickers require 10px margin + even dimensions + 1MB limit
        line_outs = {o["id"]: o for o in by_id["line-sticker-resizer"]["outputs"]}
        self.assertEqual(line_outs["line_sticker_item"]["padding_px"], 10)
        self.assertTrue(line_outs["line_sticker_item"]["even_dimensions"])
        self.assertEqual(line_outs["line_sticker_item"]["max_bytes"], 1048576)

        # Chrome Web Store 128x128 icon requires official 16px transparent margin
        cws_outs = {o["id"]: o for o in by_id["chrome-web-store-resizer"]["outputs"]}
        self.assertEqual(cws_outs["cws_icon_128"]["padding_px"], 16)


if __name__ == "__main__":
    unittest.main()
