#!/usr/bin/env python3
"""
Scripted below-panel comic typesetter ("Prince Valiant" / "Illustrated Classics" style).

Reads a comic script from docs/comics/<slug>.md and the silent art images from
tools/image-gen/output/comics/<slug>/ (either full pages page-01.png .. page-12.png
or individual panel images page-01-panel-1.png ...), slices each page into panels
along its gutters, and renders print-ready album pages with crisp captions, dialogue,
and sound effects typeset directly beneath every panel — plus an interactive HTML reader.

Usage:
    python3 tools/image-gen/letter_comic.py a-landfall
    python3 tools/image-gen/letter_comic.py a-landfall --pages 1-6
    python3 tools/image-gen/letter_comic.py a-landfall --width 1400 --out-dir /tmp/landfall
"""

from __future__ import annotations

import argparse
import html
import math
import os
import re
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_COMICS_DIR = REPO_ROOT / "docs" / "comics"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "tools" / "image-gen" / "output" / "comics"

# Album palette (aligned with docs/COMIC_PROMPTS.md)
INK = (27, 26, 23)            # #1b1a17
PAPER_CREAM = (245, 238, 220) # #f5eedc
BOX_IVORY = (255, 253, 246)   # #fffdf6
SFX_RED = (154, 49, 33)       # #9a3121
SPEAKER_INK = (42, 37, 32)    # #2a2520
MUTED_INK = (96, 88, 76)      # #60584c
RULE_LIGHT = (196, 185, 162)  # #c4b9a2

LETTERING_RE = re.compile(
    r"^(?P<who>[A-Z][A-Z0-9 .'\u2019/\-]*?)(?:\s*\((?P<note>[^)]*)\))?\s*:\s*(?P<text>.+)$"
)
NON_SPEAKER_LABELS = {"CAPTION", "SFX", "NOTE ON MAP"}

FONT_SEARCH = {
    "regular": [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/times.ttf",
    ],
    "bold": [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
        "C:/Windows/Fonts/timesbd.ttf",
    ],
    "italic": [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifItalic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
        "C:/Windows/Fonts/georgiai.ttf",
        "C:/Windows/Fonts/timesi.ttf",
    ],
    "bold_italic": [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifBoldItalic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf",
        "C:/Windows/Fonts/georgiaz.ttf",
        "C:/Windows/Fonts/timesbi.ttf",
    ],
}


@dataclass
class LetteringLine:
    kind: str  # "caption" | "sfx" | "dialogue"
    speaker: str
    note: str
    text: str


@dataclass
class ScriptPanel:
    number: int
    visual: str
    hint: str | None
    lines: list[LetteringLine] = field(default_factory=list)


@dataclass
class ScriptPage:
    number: int
    panels: list[ScriptPanel] = field(default_factory=list)


@dataclass
class ComicScript:
    slug: str
    title: str
    setting: str
    logline: str
    pages: list[ScriptPage] = field(default_factory=list)


def _plain_md(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\*`]", "", text)).strip()


def _panel_hint(visual: str) -> str | None:
    first = re.split(r"(?<=[.!?:])\s", visual, maxsplit=1)[0]
    words = first.split()
    lead = first if len(words) <= 10 else " ".join(words[:5])
    for name, pat in (
        ("splash", r"\bsplash\b"),
        ("wide", r"\b(wide|establishing|panoramic|full-width)\b"),
        ("tall", r"\b(tall|narrow)\b"),
        ("small", r"\b(small|tiny|inset)\b"),
    ):
        m = re.search(pat, lead, re.IGNORECASE)
        if m:
            return m.group(0).lower() if name == "wide" else name
    return None


def _format_speaker(raw: str) -> str:
    parts = [p.strip() for p in re.split(r"\s*/\s*", raw.strip()) if p.strip()]
    small_words = {"in", "on", "of", "the", "a", "an", "at", "by", "to", "from", "with"}
    formatted = []
    for p in parts:
        words = p.split()
        out_w = []
        for idx, w in enumerate(words):
            lw = w.lower()
            if idx > 0 and lw in small_words:
                out_w.append(lw)
            else:
                out_w.append(lw.capitalize())
        formatted.append(" ".join(out_w))
    if len(formatted) <= 1:
        return formatted[0] if formatted else raw
    if len(formatted) == 2:
        return f"{formatted[0]} & {formatted[1]}"
    return ", ".join(formatted[:-1]) + f" & {formatted[-1]}"


def parse_comic_script(path: Path) -> ComicScript:
    """Parse docs/comics/<slug>.md (both '**Panel N.**' and 'N.' writer formats)."""
    lines = path.read_text(encoding="utf-8").splitlines()
    slug = path.stem
    title = slug
    setting = ""
    logline = ""
    page_starts: list[tuple[int, int]] = []

    for i, line in enumerate(lines):
        if title == slug and line.startswith("# "):
            title = _plain_md(line[2:])
            continue
        m = re.match(r"^\*\*Setting[.:]?\*\*:?\s*(.+)$", line)
        if m:
            setting = _plain_md(m.group(1))
            continue
        m = re.match(r"^\*\*Logline[.:]?\*\*:?\s*(.+)$", line)
        if m:
            logline = _plain_md(m.group(1))
            continue
        m = re.match(r"^## PAGE (\d+)\b", line)
        if m:
            page_starts.append((int(m.group(1)), i))

    pages: list[ScriptPage] = []
    for p_idx, (pnum, start_i) in enumerate(page_starts):
        end_i = page_starts[p_idx + 1][1] - 1 if p_idx + 1 < len(page_starts) else len(lines) - 1
        for k in range(start_i + 1, end_i + 1):
            if lines[k].startswith("## "):
                end_i = k - 1
                break

        raw_panels: list[dict] = []
        cur: dict | None = None
        for k in range(start_i + 1, end_i + 1):
            l = lines[k]
            rest = None
            m = re.match(r"^\*\*Panel (\d+)\.?\*\*\s*(.*)$", l)
            if m:
                num, rest = int(m.group(1)), m.group(2)
            else:
                m2 = re.match(r"^(\d+)\.\s+(.*)$", l)
                if m2:
                    num, rest = int(m2.group(1)), m2.group(2)
            if rest is not None:
                cur = {"number": num, "visual": [], "lines": [], "state": "before"}
                raw_panels.append(cur)
                l = rest
            if cur is None:
                continue
            t = l.strip()
            if t == "---":
                continue
            if not t:
                if cur["state"] == "in":
                    cur["state"] = "done"
                continue
            lm = LETTERING_RE.match(t)
            if lm:
                cur["state"] = "done"
                who = lm.group("who").strip()
                note = (lm.group("note") or "").strip()
                text = lm.group("text").strip()
                if who in ("CAPTION", "NOTE ON MAP"):
                    kind = "caption"
                elif who == "SFX":
                    kind = "sfx"
                else:
                    kind = "dialogue"
                cur["lines"].append(LetteringLine(kind=kind, speaker=who, note=note, text=text))
                continue
            if cur["state"] != "done":
                cur["state"] = "in"
                cur["visual"].append(t)
            elif cur["lines"]:
                # Continuation line of a wrapped lettering entry
                cur["lines"][-1].text += " " + t

        panels = []
        for rp in raw_panels:
            vis = _plain_md(" ".join(rp["visual"]))
            panels.append(ScriptPanel(number=rp["number"], visual=vis, hint=_panel_hint(vis), lines=rp["lines"]))
        pages.append(ScriptPage(number=pnum, panels=panels))

    return ComicScript(slug=slug, title=title, setting=setting, logline=logline, pages=pages)


def _find_runs(mask: Sequence[bool], min_len: int = 40) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, val in enumerate(mask):
        if val and start is None:
            start = i
        elif not val and start is not None:
            if i - start >= min_len:
                runs.append((start, i))
            start = None
    if start is not None and len(mask) - start >= min_len:
        runs.append((start, len(mask)))
    return runs


def _detect_page_paper_rgb(im: Image.Image) -> tuple[int, int, int]:
    """Sample pixels along the outer 3 px rim to detect pure-white or cream album paper."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    rs, gs, bs = [], [], []
    step_x = max(1, w // 40)
    step_y = max(1, h // 40)
    for x in range(0, w, step_x):
        for y in (1, 2, h - 2, h - 3):
            if 0 <= y < h:
                r, g, b = px[x, y]
                rs.append(r)
                gs.append(g)
                bs.append(b)
    for y in range(0, h, step_y):
        for x in (1, 2, w - 2, w - 3):
            if 0 <= x < w:
                r, g, b = px[x, y]
                rs.append(r)
                gs.append(g)
                bs.append(b)
    return (
        int(round(statistics.median(rs))),
        int(round(statistics.median(gs))),
        int(round(statistics.median(bs))),
    )


def _is_paper(r: int, g: int, b: int, paper: tuple[int, int, int], tol: int = 24) -> bool:
    if abs(r - paper[0]) <= tol and abs(g - paper[1]) <= tol and abs(b - paper[2]) <= tol:
        return True
    # Also treat pure white / warm cream interior gutters as paper even when the outer margin is slightly tinted.
    return min(r, g, b) >= 234 and (max(r, g, b) - min(r, g, b)) <= 24


def detect_panel_tiers(im: Image.Image) -> list[list[tuple[int, int, int, int]]]:
    """
    Detect rectangular comic panels arranged in horizontal tiers by scanning
    paper-coloured margins and gutters. Returns a list of tiers, each a list of
    (x0, y0, x1, y1) bounding boxes ordered left-to-right.
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    paper = _detect_page_paper_rgb(rgb)

    min_tier_h = max(48, h // 12)
    min_panel_w = max(48, w // 10)

    row_has_art = []
    for y in range(h):
        non_paper = sum(1 for x in range(w) if not _is_paper(*px[x, y], paper))
        row_has_art.append(non_paper > w * 0.08)
    y_tiers = _find_runs(row_has_art, min_len=min_tier_h)

    tiers: list[list[tuple[int, int, int, int]]] = []
    for y0, y1 in y_tiers:
        th = y1 - y0
        col_has_art = []
        for x in range(w):
            non_paper = sum(1 for y in range(y0, y1) if not _is_paper(*px[x, y], paper))
            col_has_art.append(non_paper > th * 0.15)
        x_cols = _find_runs(col_has_art, min_len=min_panel_w)
        tier_boxes: list[tuple[int, int, int, int]] = []
        for x0, x1 in x_cols:
            # Trim any subtle leftover paper padding top/bottom inside each individual panel box.
            pw = x1 - x0
            ty0, ty1 = y0, y1
            while ty0 < ty1 - 10:
                if sum(1 for x in range(x0, x1) if not _is_paper(*px[x, ty0], paper)) > pw * 0.15:
                    break
                ty0 += 1
            while ty1 > ty0 + 10:
                if sum(1 for x in range(x0, x1) if not _is_paper(*px[x, ty1 - 1], paper)) > pw * 0.15:
                    break
                ty1 -= 1
            tier_boxes.append((x0, ty0, x1, ty1))
        if tier_boxes:
            tiers.append(tier_boxes)

    return tiers


def _strip_outer_ink_border(panel_im: Image.Image, max_trim: int = 8) -> Image.Image:
    """
    Strip an existing thin black ink border around a sliced panel so we can draw
    one uniform crisp border around the combined art + caption unit.
    """
    rgb = panel_im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    def row_is_dark(y: int) -> bool:
        dark = sum(1 for x in range(w) if max(px[x, y]) < 75)
        return dark > w * 0.72

    def col_is_dark(x: int) -> bool:
        dark = sum(1 for y in range(h) if max(px[x, y]) < 75)
        return dark > h * 0.72

    top = 0
    while top < max_trim and top < h // 4 and row_is_dark(top):
        top += 1
    bot = h
    while h - bot < max_trim and bot > h * 3 // 4 and row_is_dark(bot - 1):
        bot -= 1
    left = 0
    while left < max_trim and left < w // 4 and col_is_dark(left):
        left += 1
    right = w
    while w - right < max_trim and right > w * 3 // 4 and col_is_dark(right - 1):
        right -= 1

    if right - left >= 32 and bot - top >= 32:
        return rgb.crop((left, top, right, bot))
    return rgb


def _load_font_family(size: int) -> dict[str, ImageFont.FreeTypeFont | ImageFont.ImageFont]:
    out: dict[str, ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}
    for style, candidates in FONT_SEARCH.items():
        loaded = None
        for p in candidates:
            if os.path.exists(p):
                try:
                    loaded = ImageFont.truetype(p, size=size)
                    break
                except OSError:
                    pass
        out[style] = loaded or ImageFont.load_default()
    return out


def _split_inline_italics(text: str, base_style: str, italic_style: str, color: tuple[int, int, int]) -> list[tuple[str, str, tuple[int, int, int]]]:
    """Split *italic* spans into styled runs (toggling italic inside italic captions)."""
    runs: list[tuple[str, str, tuple[int, int, int]]] = []
    pos = 0
    for m in re.finditer(r"\*([^*]+)\*", text):
        if m.start() > pos:
            runs.append((text[pos : m.start()], base_style, color))
        runs.append((m.group(1), italic_style, color))
        pos = m.end()
    if pos < len(text):
        runs.append((text[pos:], base_style, color))
    return runs


def _runs_for_line(line: LetteringLine) -> list[tuple[str, str, tuple[int, int, int]]]:
    """Convert one parsed script LetteringLine into styled text runs."""
    clean_text = line.text.strip()
    if line.kind == "caption":
        return _split_inline_italics(clean_text, "italic", "regular", INK)
    if line.kind == "sfx":
        runs: list[tuple[str, str, tuple[int, int, int]]] = []
        if line.note:
            runs.append((f"({line.note}) ", "italic", MUTED_INK))
        runs.append((clean_text, "bold_italic", SFX_RED))
        return runs

    # Dialogue line: **Speaker:** (optional note) “Quoted dialogue” (optional trailing action)
    speaker_label = _format_speaker(line.speaker)
    runs = [(f"{speaker_label}: ", "bold", SPEAKER_INK)]
    lead_note = line.note
    body = clean_text
    m_lead = re.match(r"^\(([^)]+)\)\s+(.+)$", body)
    if m_lead:
        lead_note = f"{lead_note}; {m_lead.group(1)}" if lead_note else m_lead.group(1)
        body = m_lead.group(2).strip()
    trail_note = ""
    m_trail = re.match(r"^(.+?)\s+\(([^)]+)\)$", body)
    if m_trail:
        body = m_trail.group(1).strip()
        trail_note = m_trail.group(2).strip()
    if lead_note:
        runs.append((f"({lead_note}) ", "italic", MUTED_INK))
    if body.startswith(('"', "\u201c")):
        quoted = body
    else:
        quoted = f"\u201c{body}\u201d"
    runs.extend(_split_inline_italics(quoted, "regular", "italic", INK))
    if trail_note:
        runs.append((f" ({trail_note})", "italic", MUTED_INK))
    return runs


def _wrap_styled_paragraph(
    runs: list[tuple[str, str, tuple[int, int, int]]],
    fonts: dict[str, ImageFont.FreeTypeFont | ImageFont.ImageFont],
    max_width: int,
) -> list[list[tuple[str, str, tuple[int, int, int]]]]:
    """Word-wrap a list of (text, style, color) runs into visual lines fitting within max_width."""
    tokens: list[tuple[str, str, tuple[int, int, int]]] = []
    for txt, style, color in runs:
        for piece in re.findall(r"\S+\s*|\s+", txt):
            tokens.append((piece, style, color))

    lines: list[list[tuple[str, str, tuple[int, int, int]]]] = []
    cur_line: list[tuple[str, str, tuple[int, int, int]]] = []
    cur_w = 0.0

    for piece, style, color in tokens:
        if not cur_line and piece.isspace():
            continue
        f = fonts[style]
        w = f.getlength(piece)
        trimmed_w = f.getlength(piece.rstrip())
        if cur_line and cur_w + trimmed_w > max_width:
            # Strip trailing spaces on previous token before starting a new line
            last_t, last_s, last_c = cur_line[-1]
            cur_line[-1] = (last_t.rstrip(), last_s, last_c)
            lines.append(cur_line)
            cur_line = []
            cur_w = 0.0
            if piece.isspace():
                continue
        cur_line.append((piece, style, color))
        cur_w += w

    if cur_line:
        last_t, last_s, last_c = cur_line[-1]
        cur_line[-1] = (last_t.rstrip(), last_s, last_c)
        lines.append(cur_line)

    return lines


def _layout_caption_block(
    script_lines: list[LetteringLine],
    box_width: int,
    font_size: int,
    pad_x: int = 14,
    pad_y: int = 11,
) -> tuple[int, list[tuple[int, list[tuple[str, str, tuple[int, int, int]]]]], dict]:
    """
    Compute total height and positioned wrapped lines for a panel's below-panel caption box.
    Returns (total_box_height, [(y_offset, styled_line_tokens), ...], fonts).
    """
    fonts = _load_font_family(font_size)
    if not script_lines:
        return (0, [], fonts)

    inner_w = max(80, box_width - 2 * pad_x)
    line_step = int(round(font_size * 1.32))
    para_gap = max(5, int(round(font_size * 0.36)))

    positioned: list[tuple[int, list[tuple[str, str, tuple[int, int, int]]]]] = []
    y = pad_y
    for idx, sl in enumerate(script_lines):
        if idx > 0:
            y += para_gap
        wrapped = _wrap_styled_paragraph(_runs_for_line(sl), fonts, inner_w)
        for wl in wrapped:
            positioned.append((y, wl))
            y += line_step

    total_h = y + pad_y - int(round(font_size * 0.22))
    return (total_h, positioned, fonts)


def _group_individual_panels_into_tiers(
    panel_images: list[tuple[ScriptPanel, Image.Image]],
) -> list[list[tuple[ScriptPanel, Image.Image]]]:
    """Arrange individual per-panel images into album tiers using script size hints."""
    tiers: list[list[tuple[ScriptPanel, Image.Image]]] = []
    buf: list[tuple[ScriptPanel, Image.Image]] = []
    for sp, im in panel_images:
        is_full = sp.hint in ("splash", "wide", "establishing", "panoramic", "full-width") or (im.width / max(1, im.height) >= 1.35)
        if is_full:
            if buf:
                tiers.append(buf)
                buf = []
            tiers.append([(sp, im)])
        else:
            buf.append((sp, im))
            if len(buf) >= 2:
                tiers.append(buf)
                buf = []
    if buf:
        tiers.append(buf)
    return tiers


def render_lettered_page(
    script: ComicScript,
    page: ScriptPage,
    *,
    page_art_path: Path | None = None,
    panel_art_paths: list[Path] | None = None,
    page_width: int = 1280,
) -> Image.Image:
    """
    Compose one print-ready Prince Valiant / Illustrated Classics comic album page
    with each panel's narration, dialogue, and SFX typeset cleanly beneath it.
    """
    margin_x = max(36, int(round(page_width * 0.042)))
    margin_top = max(36, int(round(page_width * 0.038)))
    margin_bot = max(44, int(round(page_width * 0.044)))
    gutter_x = max(16, int(round(page_width * 0.017)))
    gutter_y = max(22, int(round(page_width * 0.022)))
    border_w = 2
    usable_w = page_width - 2 * margin_x

    # 1. Extract panel art grouped into tiers
    art_tiers: list[list[tuple[ScriptPanel, Image.Image]]] = []
    if page_art_path is not None:
        with Image.open(page_art_path) as raw_im:
            raw_rgb = raw_im.convert("RGB")
            detected_tiers = detect_panel_tiers(raw_rgb)
            flat_count = sum(len(t) for t in detected_tiers)
            if flat_count == 0:
                raise ValueError(f"{page_art_path}: could not detect any panels")
            p_idx = 0
            for t_boxes in detected_tiers:
                row: list[tuple[ScriptPanel, Image.Image]] = []
                for box in t_boxes:
                    crop = raw_rgb.crop(box)
                    if p_idx < len(page.panels):
                        sp = page.panels[p_idx]
                    else:
                        sp = ScriptPanel(number=p_idx + 1, visual="", hint=None, lines=[])
                    row.append((sp, crop))
                    p_idx += 1
                art_tiers.append(row)
            # If the art had fewer panels than the script, append overflow script lines to the last panel.
            if p_idx < len(page.panels) and art_tiers:
                last_sp, last_im = art_tiers[-1][-1]
                merged = list(last_sp.lines)
                for extra in page.panels[p_idx:]:
                    merged.extend(extra.lines)
                art_tiers[-1][-1] = (
                    ScriptPanel(number=last_sp.number, visual=last_sp.visual, hint=last_sp.hint, lines=merged),
                    last_im,
                )
    elif panel_art_paths:
        items: list[tuple[ScriptPanel, Image.Image]] = []
        for idx, pth in enumerate(panel_art_paths):
            with Image.open(pth) as pim:
                crop = pim.convert("RGB")
            sp = page.panels[idx] if idx < len(page.panels) else ScriptPanel(number=idx + 1, visual="", hint=None, lines=[])
            items.append((sp, crop))
        art_tiers = _group_individual_panels_into_tiers(items)
    else:
        raise ValueError("Provide either page_art_path or panel_art_paths")

    # 2. Compute header height (Page 1 gets an album title cartouche; Pages 2+ get a running header)
    is_first = page.number == 1
    title_font_big = _load_font_family(max(30, int(round(page_width * 0.034))))["bold"]
    sub_font = _load_font_family(max(15, int(round(page_width * 0.014))))["italic"]
    header_font = _load_font_family(max(14, int(round(page_width * 0.013))))["bold"]
    folio_font = _load_font_family(max(15, int(round(page_width * 0.013))))["regular"]

    if is_first:
        header_h = int(round(page_width * 0.095))
    else:
        header_h = int(round(page_width * 0.032))

    # 3. Measure every tier (scaled art height + borderless below-panel caption block height)
    base_font_size = max(16, int(round(page_width * 0.0155)))  # ~20px at 1280px wide
    tier_layouts = []
    y_cursor = margin_top + header_h

    for row in art_tiers:
        n = len(row)
        avail_w = usable_w - gutter_x * (n - 1)
        # Uniform height H such that sum(H * (w_i / h_i)) == avail_w
        sum_aspect = sum(im.width / max(1, im.height) for _, im in row)
        raw_h = avail_w / max(0.25, sum_aspect)
        # Keep single wide/splash panels from becoming excessively tall
        max_art_h = int(round(page_width * (0.64 if n == 1 else 0.56)))
        art_h = max(180, min(max_art_h, int(round(raw_h))))

        # Compute exact integer widths summing to avail_w
        widths = [max(100, int(round(avail_w * (im.width / max(1, im.height)) / sum_aspect))) for _, im in row]
        widths[-1] += avail_w - sum(widths)

        # Slightly tighten font on 3-panel rows so narrow boxes read cleanly
        row_font_size = base_font_size if n <= 2 else max(15, base_font_size - 2)
        pad_x = 6 if n <= 2 else 4
        pad_y = 9 if n <= 2 else 8

        cells = []
        max_cap_h = 0
        for (sp, im), cw in zip(row, widths):
            cap_h, cap_lines, fonts = _layout_caption_block(sp.lines, cw, row_font_size, pad_x=pad_x, pad_y=pad_y)
            max_cap_h = max(max_cap_h, cap_h)
            cells.append((sp, im, cw, cap_lines, fonts, pad_x))

        tier_total_h = art_h + max_cap_h
        tier_layouts.append((y_cursor, art_h, max_cap_h, cells))
        y_cursor += tier_total_h + gutter_y

    page_height = y_cursor - gutter_y + margin_bot

    # 4. Paint the album page
    canvas = Image.new("RGB", (page_width, page_height), PAPER_CREAM)
    draw = ImageDraw.Draw(canvas)

    # Header / Title Cartouche
    if is_first:
        box_y0 = margin_top
        box_y1 = margin_top + header_h - 14
        # Classic double-rule masthead
        draw.rectangle([margin_x, box_y0, page_width - margin_x, box_y1], fill=BOX_IVORY, outline=INK, width=2)
        draw.rectangle([margin_x + 5, box_y0 + 5, page_width - margin_x - 5, box_y1 - 5], outline=INK, width=1)
        title_str = "  ".join(script.title.upper())
        tw = title_font_big.getlength(title_str)
        draw.text(((page_width - tw) / 2, box_y0 + 14), title_str, font=title_font_big, fill=INK)
        if script.setting:
            sub_str = script.setting
            sw = sub_font.getlength(sub_str)
            draw.text(((page_width - sw) / 2, box_y1 - 32), sub_str, font=sub_font, fill=MUTED_INK)
    else:
        hdr_y = margin_top + 2
        draw.text((margin_x, hdr_y), script.title.upper(), font=header_font, fill=MUTED_INK)
        p_label = f"PAGE {page.number}"
        pw = header_font.getlength(p_label)
        draw.text((page_width - margin_x - pw, hdr_y), p_label, font=header_font, fill=MUTED_INK)
        line_y = margin_top + header_h - 14
        draw.line([(margin_x, line_y), (page_width - margin_x, line_y)], fill=RULE_LIGHT, width=1)

    # Panels (keeping their own drawn ink borders) + borderless caption text directly on the album paper below
    for tier_y, art_h, max_cap_h, cells in tier_layouts:
        x_cursor = margin_x
        for sp, im, cw, cap_lines, fonts, pad_x in cells:
            resized = im.resize((cw, art_h), Image.Resampling.LANCZOS)
            canvas.paste(resized, (x_cursor, tier_y))

            if max_cap_h > 0:
                text_top = tier_y + art_h
                for rel_y, line_tokens in cap_lines:
                    tx = x_cursor + pad_x
                    ty = text_top + rel_y
                    for piece, style, color in line_tokens:
                        f = fonts[style]
                        draw.text((tx, ty), piece, font=f, fill=color)
                        tx += f.getlength(piece)

            x_cursor += cw + gutter_x

    # Centered album page folio
    folio = f"\u2014 {page.number} \u2014"
    fw = folio_font.getlength(folio)
    draw.text(((page_width - fw) / 2, page_height - margin_bot + 14), folio, font=folio_font, fill=MUTED_INK)

    return canvas


def write_html_reader(
    script: ComicScript,
    lettered_dir: Path,
    entries: list[dict],
    *,
    cover_rel: str | None = None,
    cast_rel: str | None = None,
) -> Path:
    """Write a self-contained keyboard-navigable HTML comic album reader."""
    slides_js_items = []
    if cover_rel:
        slides_js_items.append(
            f'{{label:"Cover", lettered:{cover_rel!r}, raw:{cover_rel!r}}}'
        )
    if cast_rel:
        slides_js_items.append(
            f'{{label:"Cast Sheet", lettered:{cast_rel!r}, raw:{cast_rel!r}}}'
        )
    for e in entries:
        slides_js_items.append(
            f'{{label:"Page {e["page"]}", lettered:{e["lettered"]!r}, raw:{e["raw"]!r}}}'
        )

    title_esc = html.escape(script.title)
    setting_esc = html.escape(script.setting)
    reader_html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title_esc} — Casual Colonization Comic Album</title>
<style>
  :root {{ --bg:#23201c; --bar:#1b1a17; --paper:#f5eedc; --ink:#1b1a17; --accent:#d23c2a; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--paper); font-family:Georgia, 'Liberation Serif', serif; display:flex; flex-direction:column; min-height:100vh; }}
  header {{ background:var(--bar); padding:10px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border-bottom:1px solid #3c362e; }}
  header h1 {{ margin:0; font-size:18px; letter-spacing:0.08em; text-transform:uppercase; }}
  header .sub {{ font-size:13px; color:#c8bfa9; font-style:italic; }}
  .controls {{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }}
  button {{ background:#34302a; color:var(--paper); border:1px solid #595146; border-radius:4px; padding:6px 12px; cursor:pointer; font-family:inherit; font-size:13px; }}
  button:hover {{ background:#4a433a; }}
  button.active {{ background:var(--accent); border-color:var(--accent); color:#fff; }}
  button:disabled {{ opacity:0.4; cursor:default; }}
  main {{ flex:1; display:flex; justify-content:center; align-items:flex-start; padding:20px 16px 36px; }}
  .stage {{ display:flex; gap:14px; justify-content:center; align-items:flex-start; max-width:100%; }}
  .stage img {{ max-height:calc(100vh - 115px); max-width:100%; width:auto; height:auto; box-shadow:0 12px 36px rgba(0,0,0,0.55); border:1px solid #111; background:var(--paper); }}
  .spread .stage img {{ max-width:48vw; }}
  .page-ind {{ font-size:14px; min-width:90px; text-align:center; color:#dfd6c1; }}
</style>
</head>
<body>
<header>
  <div>
    <h1>{title_esc}</h1>
    <div class="sub">{setting_esc}</div>
  </div>
  <div class="controls">
    <button id="prevBtn">&larr; Prev</button>
    <span class="page-ind" id="pageInd"></span>
    <button id="nextBtn">Next &rarr;</button>
    <button id="modeBtn">Raw Art</button>
    <button id="spreadBtn">Spread View</button>
  </div>
</header>
<main><div class="stage" id="stage"></div></main>
<script>
const SLIDES = [{", ".join(slides_js_items)}];
let idx = 0, showRaw = false, spread = false;
const stage = document.getElementById('stage');
const ind = document.getElementById('pageInd');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const modeBtn = document.getElementById('modeBtn');
const spreadBtn = document.getElementById('spreadBtn');

function render() {{
  document.body.classList.toggle('spread', spread);
  stage.innerHTML = '';
  const step = spread && idx > 0 ? 2 : 1;
  const end = Math.min(SLIDES.length, idx + step);
  for (let i = idx; i < end; i++) {{
    const img = document.createElement('img');
    img.src = showRaw ? SLIDES[i].raw : SLIDES[i].lettered;
    img.alt = SLIDES[i].label;
    stage.appendChild(img);
  }}
  ind.textContent = end - idx > 1 ? SLIDES[idx].label + ' – ' + SLIDES[end-1].label : SLIDES[idx].label;
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = end >= SLIDES.length;
  modeBtn.classList.toggle('active', showRaw);
  modeBtn.textContent = showRaw ? 'Lettered' : 'Raw Art';
  spreadBtn.classList.toggle('active', spread);
}}
prevBtn.onclick = () => {{ idx = Math.max(0, idx - (spread ? 2 : 1)); render(); }};
nextBtn.onclick = () => {{ const step = spread && idx > 0 ? 2 : 1; if (idx + step < SLIDES.length) {{ idx += step; render(); }} }};
modeBtn.onclick = () => {{ showRaw = !showRaw; render(); }};
spreadBtn.onclick = () => {{ spread = !spread; render(); }};
window.addEventListener('keydown', e => {{
  if (e.key === 'ArrowLeft') prevBtn.click();
  if (e.key === 'ArrowRight' || e.key === ' ') {{ e.preventDefault(); nextBtn.click(); }}
}});
render();
</script>
</body>
</html>
"""
    reader_path = lettered_dir / "reader.html"
    reader_path.write_text(reader_html, encoding="utf-8")
    return reader_path


def _parse_page_filter(spec: str | None) -> set[int] | None:
    if not spec:
        return None
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Typeset comic script captions/dialogue beneath each panel (Prince Valiant / Illustrated Classics style)."
    )
    parser.add_argument("slug", help="Comic slug (e.g. a-landfall), matching docs/comics/<slug>.md.")
    parser.add_argument("--script", type=Path, help="Override path to the comic script Markdown file.")
    parser.add_argument("--in-dir", type=Path, help="Folder containing page-01.png ... (or page-01-panel-1.png ...).")
    parser.add_argument("--out-dir", type=Path, help="Output folder for lettered PNGs and reader.html.")
    parser.add_argument("--pages", help="Page subset to build, e.g. '1-6' or '1,3,5'.")
    parser.add_argument("--width", type=int, default=1280, help="Output page width in pixels (default: 1280).")
    args = parser.parse_args(argv)

    script_path = args.script or (DEFAULT_COMICS_DIR / f"{args.slug}.md")
    if not script_path.exists():
        print(f"Script not found: {script_path}", file=sys.stderr)
        return 1

    in_dir = args.in_dir or (DEFAULT_OUTPUT_ROOT / args.slug)
    out_dir = args.out_dir or (in_dir / "lettered")
    out_dir.mkdir(parents=True, exist_ok=True)

    script = parse_comic_script(script_path)
    wanted = _parse_page_filter(args.pages)

    entries: list[dict] = []
    for pg in script.pages:
        if wanted is not None and pg.number not in wanted:
            continue
        pn = f"{pg.number:02d}"
        page_art = None
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            cand = in_dir / f"page-{pn}{ext}"
            if cand.exists():
                page_art = cand
                break

        panel_arts: list[Path] = []
        if page_art is None:
            for pl in pg.panels:
                for ext in (".png", ".jpg", ".jpeg", ".webp"):
                    cand = in_dir / f"page-{pn}-panel-{pl.number}{ext}"
                    if cand.exists():
                        panel_arts.append(cand)
                        break

        if page_art is None and not panel_arts:
            continue

        out_img = render_lettered_page(
            script,
            pg,
            page_art_path=page_art,
            panel_art_paths=panel_arts or None,
            page_width=args.width,
        )
        out_png = out_dir / f"page-{pn}__lettered.png"
        out_img.save(out_png, format="PNG")
        rel_raw = os.path.relpath(page_art, out_dir) if page_art else out_png.name
        entries.append({"page": pg.number, "lettered": out_png.name, "raw": rel_raw})
        print(f"OK page-{pn}: {out_img.size[0]}x{out_img.size[1]} ({len(pg.panels)} panels) -> {out_png}")

    if not entries:
        print(f"No matching comic art found in {in_dir}", file=sys.stderr)
        return 1

    cast_rel = None
    for ext in (".png", ".jpg"):
        cpath = in_dir / f"cast{ext}"
        if cpath.exists():
            cast_rel = os.path.relpath(cpath, out_dir)
            break

    reader_path = write_html_reader(script, out_dir, entries, cast_rel=cast_rel)
    print(f"Wrote {len(entries)} lettered pages and reader to {reader_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
