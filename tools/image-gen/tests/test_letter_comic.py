#!/usr/bin/env python3
"""Unit tests for tools/image-gen/letter_comic.py."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

TOOL_PATH = Path(__file__).resolve().parent.parent / "letter_comic.py"
spec = importlib.util.spec_from_file_location("letter_comic", TOOL_PATH)
assert spec and spec.loader
lc = importlib.util.module_from_spec(spec)
sys.modules["letter_comic"] = lc
spec.loader.exec_module(lc)

REPO_ROOT = Path(__file__).resolve().parents[3]
COMICS_DIR = REPO_ROOT / "docs" / "comics"


def make_synthetic_comic_page(paper: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """Create a 3-panel synthetic page (1 wide panel + 2 side-by-side panels) with crisp ink borders."""
    im = Image.new("RGB", (600, 900), paper)
    draw = ImageDraw.Draw(im)
    boxes = [
        (30, 30, 570, 360),
        (30, 390, 285, 860),
        (315, 390, 570, 860),
    ]
    fills = [(142, 208, 236), (88, 165, 72), (244, 227, 174)]
    for box, fill in zip(boxes, fills):
        draw.rectangle(box, fill=fill, outline=(27, 26, 23), width=3)
    return im


class LetterComicTests(unittest.TestCase):
    def test_parses_all_15_comic_scripts(self) -> None:
        scripts = sorted(p for p in COMICS_DIR.glob("*.md") if p.name != "README.md")
        self.assertEqual(len(scripts), 15)
        total_pages = 0
        total_panels = 0
        total_lines = 0
        for p in scripts:
            sc = lc.parse_comic_script(p)
            self.assertEqual(len(sc.pages), 12, p.name)
            total_pages += len(sc.pages)
            for pg in sc.pages:
                total_panels += len(pg.panels)
                for pl in pg.panels:
                    total_lines += len(pl.lines)
        self.assertEqual(total_pages, 180)
        self.assertEqual(total_panels, 919)
        self.assertGreater(total_lines, 1000)

    def test_detect_panels_on_white_and_cream_paper(self) -> None:
        for paper in ((255, 255, 255), (245, 238, 220)):
            tiers = lc.detect_panel_tiers(make_synthetic_comic_page(paper))
            self.assertEqual(len(tiers), 2)
            self.assertEqual([len(t) for t in tiers], [1, 2])

    def test_renders_page_mode_and_panel_mode_end_to_end(self) -> None:
        sc = lc.ComicScript(
            slug="test-comic",
            title="Test Comic",
            setting="A quiet harbour, 1662.",
            logline="",
            pages=[
                lc.ScriptPage(
                    number=1,
                    panels=[
                        lc.ScriptPanel(
                            number=1,
                            visual="Wide establishing shot.",
                            hint="wide",
                            lines=[lc.LetteringLine("caption", "CAPTION", "", "Spring, 1662. The *Kestrel* arrives.")],
                        ),
                        lc.ScriptPanel(
                            number=2,
                            visual="Two sailors.",
                            hint=None,
                            lines=[
                                lc.LetteringLine("dialogue", "FENWICK", "", "Dry land at last!"),
                                lc.LetteringLine("dialogue", "HOBB", "quietly", "Twenty past seven."),
                            ],
                        ),
                        lc.ScriptPanel(
                            number=3,
                            visual="The boat lands.",
                            hint=None,
                            lines=[lc.LetteringLine("sfx", "SFX", "sand", "SKRRRSH!")],
                        ),
                    ],
                )
            ],
        )
        with tempfile.TemporaryDirectory() as td:
            page_path = Path(td) / "page-01.png"
            make_synthetic_comic_page().save(page_path)
            rendered = lc.render_lettered_page(sc, sc.pages[0], page_art_path=page_path, page_width=900)
            self.assertEqual(rendered.width, 900)
            self.assertGreater(rendered.height, 900)

            # Individual panel mode
            p_paths = []
            for idx, sz in enumerate(((600, 320), (400, 400), (400, 400)), start=1):
                pp = Path(td) / f"page-01-panel-{idx}.png"
                Image.new("RGB", sz, (142, 208, 236)).save(pp)
                p_paths.append(pp)
            rendered_panels = lc.render_lettered_page(sc, sc.pages[0], panel_art_paths=p_paths, page_width=900)
            self.assertEqual(rendered_panels.width, 900)
            self.assertGreater(rendered_panels.height, 800)


if __name__ == "__main__":
    unittest.main()
