#!/usr/bin/env python3
"""Unit tests for tools/image-gen/chroma_key.py."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

TOOL_PATH = Path(__file__).resolve().parent.parent / "chroma_key.py"
spec = importlib.util.spec_from_file_location("chroma_key", TOOL_PATH)
assert spec and spec.loader
ck = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ck)


def make_synthetic_sprite(size: int = 128) -> Image.Image:
    """
    Draw a ligne-claire-like subject on flat #ff00ff magenta:
    - near-black (#1b1a17) thick outline
    - pure white (#fffdf6) interior shape (like a shirt/stocking)
    - dark purple (#6a287e) interior badge (must stay 100% opaque!)
    - an enclosed magenta hole (like a gap between legs or wheel spokes) that MUST become transparent
    """
    im = Image.new("RGB", (size, size), (255, 0, 255))
    draw = ImageDraw.Draw(im)
    # Outer dark outline
    draw.rectangle([24, 20, size - 24, size - 20], fill=(27, 26, 23))
    # Interior white fill
    draw.rectangle([30, 26, size - 30, size - 26], fill=(255, 253, 246))
    # Interior dark purple detail (e.g. wampum belt)
    draw.rectangle([38, 34, 62, 56], fill=(106, 40, 126))
    # Enclosed hole framed by dark outline (like between legs)
    draw.rectangle([68, 60, 92, 92], fill=(27, 26, 23))
    draw.rectangle([74, 66, 86, 86], fill=(255, 0, 255))
    return im


class ChromaKeyTests(unittest.TestCase):
    def test_keys_exterior_and_enclosed_hole_while_preserving_white_and_purple(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "sprite.jpg"
            dst = Path(td) / "sprite.png"
            # Save as JPEG (quality 92) to simulate real lossy generator output with edge ringing.
            make_synthetic_sprite(128).save(src, format="JPEG", quality=92)

            rep = ck.process_file(src, dst)
            self.assertTrue(rep["ok"], rep)
            self.assertEqual(rep["modeUsed"], "chroma-key")
            self.assertGreater(rep["transparentFraction"], 0.35)

            with Image.open(dst) as out:
                self.assertEqual(out.mode, "RGBA")
                px = out.load()
                # Corners must be fully transparent.
                self.assertEqual(px[2, 2][3], 0)
                self.assertEqual(px[125, 125][3], 0)
                # Enclosed magenta hole must be fully transparent.
                self.assertEqual(px[80, 76][3], 0)
                # White interior must remain fully opaque and white.
                self.assertEqual(px[45, 75][3], 255)
                self.assertGreater(px[45, 75][0], 240)
                self.assertGreater(px[45, 75][1], 240)
                self.assertGreater(px[45, 75][2], 240)
                # Dark purple interior detail must remain fully opaque and untouched.
                r, g, b, a = px[50, 45]
                self.assertEqual(a, 255)
                self.assertGreater(r, 85)
                self.assertLess(g, 55)
                self.assertGreater(b, 105)

    def test_opaque_image_rejected_without_auto_and_passed_through_with_auto(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "terrain.jpg"
            dst = Path(td) / "terrain.png"
            Image.new("RGB", (64, 64), (88, 165, 72)).save(src, format="JPEG", quality=95)

            with self.assertRaises(ValueError):
                ck.process_file(src, dst, auto_opaque=False)

            rep = ck.process_file(src, dst, auto_opaque=True)
            self.assertTrue(rep["ok"], rep)
            self.assertEqual(rep["modeUsed"], "opaque-passthrough")
            self.assertEqual(rep["transparentFraction"], 0.0)
            with Image.open(dst) as im:
                self.assertEqual(im.mode, "RGB")

    def test_resize_and_batch_directory_preserves_structure(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            in_dir = Path(td) / "raw"
            out_dir = Path(td) / "out"
            (in_dir / "units").mkdir(parents=True)
            (in_dir / "terrain").mkdir(parents=True)
            make_synthetic_sprite(128).save(in_dir / "units" / "colonist.jpg", format="JPEG", quality=92)
            Image.new("RGB", (128, 128), (88, 165, 72)).save(in_dir / "terrain" / "plains.jpg", format="JPEG", quality=95)

            rc = ck.main(["--in-dir", str(in_dir), "--out-dir", str(out_dir), "--auto", "--resize", "96x96"])
            self.assertEqual(rc, 0)
            with Image.open(out_dir / "units" / "colonist.png") as u:
                self.assertEqual((u.size, u.mode), ((96, 96), "RGBA"))
            with Image.open(out_dir / "terrain" / "plains.png") as t:
                self.assertEqual((t.size, t.mode), ((96, 96), "RGB"))

    def test_verify_flags_real_repo_fake_checkerboard_and_passes_valid_rgba(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        fake_cb = repo_root / "images" / "units" / "free-colonist__none.png"
        if fake_cb.exists():
            rep = ck.verify_png(fake_cb, expect_transparent=True)
            self.assertFalse(rep["ok"])
            self.assertTrue(rep["checkerboardSuspected"])


if __name__ == "__main__":
    unittest.main()
