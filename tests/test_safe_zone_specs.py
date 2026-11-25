"""Independent schema & coordinate invariant checks for creator-safe-zone-specs."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

SPEC_PATH = Path(__file__).resolve().parent.parent / "specs" / "platform_safe_zones_2026.json"


class TestCreatorSafeZoneSpecs(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = json.loads(SPEC_PATH.read_text(encoding="utf-8"))

    def test_all_safe_zone_boxes_stay_strictly_inside_unit_canvas(self) -> None:
        canvases = self.data["safe_zone_canvases"]
        self.assertGreaterEqual(len(canvases), 6)
        for c in canvases:
            self.assertGreater(c["width"], 0)
            self.assertGreater(c["height"], 0)
            self.assertTrue(c["tool_url"].startswith("https://frame.ai-purplemaple.com/"))
            box = c.get("safe_box_norm") or c.get("timestamp_danger_box_norm")
            self.assertIsNotNone(box)
            for k in ("x", "y", "w", "h"):
                self.assertGreaterEqual(box[k], 0.0)
                self.assertLessEqual(box[k], 1.0)
            self.assertLessEqual(box["x"] + box["w"], 1.0 + 1e-6)
            self.assertLessEqual(box["y"] + box["h"], 1.0 + 1e-6)

    def test_line_sticker_even_dimension_and_10px_margin_invariant(self) -> None:
        line = next(p for p in self.data["asset_pack_specs"] if p["id"] == "line_creators_stickers")
        self.assertTrue(line["require_even_dimensions"])
        self.assertEqual(line["sticker_max_width"] % 2, 0)
        self.assertEqual(line["sticker_max_height"] % 2, 0)
        self.assertEqual(line["sticker_margin_px"], 10)
        self.assertEqual(line["main_icon"]["margin_px"], 0)
        self.assertEqual(line["tab_icon"]["margin_px"], 0)

    def test_steam_library_hero_forbids_baked_logo_overlay(self) -> None:
        steam = next(p for p in self.data["asset_pack_specs"] if p["id"] == "steam_store_capsules")
        hero = next(o for o in steam["outputs"] if o["id"] == "library_hero")
        self.assertEqual((hero["width"], hero["height"]), (3840, 1240))
        self.assertIs(hero["allow_logo_overlay"], False)

    def test_chrome_web_store_icon_enforces_16px_padding_inside_128px(self) -> None:
        cws = next(p for p in self.data["asset_pack_specs"] if p["id"] == "chrome_web_store")
        icon = next(o for o in cws["outputs"] if o["id"] == "store_icon")
        self.assertEqual((icon["width"], icon["height"], icon["margin_px"]), (128, 128, 16))


if __name__ == "__main__":
    unittest.main()
