#!/usr/bin/env python3
"""
Convert chroma-keyed sprites (flat #ff00ff magenta backdrop, e.g. from opaque-only
image generators) into clean RGBA PNGs with real alpha transparency and zero fringe.

Single file:
    python3 tools/image-gen/chroma_key.py raw.jpg tools/image-gen/output/sprites/units/foo.png

Batch directory (preserves subdirectories like units/, fathers/, thumbs/):
    python3 tools/image-gen/chroma_key.py --in-dir raw/ --out-dir tools/image-gen/output/sprites --auto

Verify an existing PNG (mirrors PngInspector.cs checks):
    python3 tools/image-gen/chroma_key.py --verify-only sprite.png
"""

from __future__ import annotations

import argparse
import math
import os
import statistics
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def _magenta_score(r: int, g: int, b: int) -> int:
    """Pure magenta (255, 0, 255) scores 255; neutral/game-palette colors score <= 70."""
    return min(r, b) - g


def detect_corner_backdrop(im: Image.Image, patch: int = 8) -> tuple[bool, tuple[int, int, int], float]:
    """
    Sample small patches near all four corners and decide whether the image sits on
    a flat bright-magenta chroma-key backdrop.

    Returns (is_magenta, median_rgb, max_corner_spread).
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    margin = min(4, max(0, min(w, h) // 16))
    p = max(1, min(patch, w // 4, h // 4))

    coords = [
        (margin, margin),
        (w - margin - p, margin),
        (margin, h - margin - p),
        (w - margin - p, h - margin - p),
    ]
    rs: list[int] = []
    gs: list[int] = []
    bs: list[int] = []
    corner_scores: list[float] = []
    for cx, cy in coords:
        c_scores = []
        for y in range(cy, cy + p):
            for x in range(cx, cx + p):
                r, g, b = px[x, y]
                rs.append(r)
                gs.append(g)
                bs.append(b)
                c_scores.append(_magenta_score(r, g, b))
        corner_scores.append(sum(c_scores) / len(c_scores))

    med = (int(round(statistics.median(rs))), int(round(statistics.median(gs))), int(round(statistics.median(bs))))
    spread = max(
        math.dist((r, g, b), med)
        for r, g, b in zip(rs, gs, bs)
    )
    is_magenta = min(corner_scores) >= 165 and _magenta_score(*med) >= 180 and spread <= 60
    return is_magenta, med, spread


def _dilate_mask(mask: bytearray, w: int, h: int, radius: int) -> bytearray:
    """Fast box dilation of a boolean mask stored as a flat bytearray."""
    if radius <= 0:
        return bytearray(mask)
    cur = bytearray(mask)
    for _ in range(radius):
        nxt = bytearray(cur)
        for y in range(h):
            row = y * w
            y0 = max(0, y - 1)
            y1 = min(h - 1, y + 1)
            for x in range(w):
                if cur[row + x]:
                    continue
                x0 = max(0, x - 1)
                x1 = min(w - 1, x + 1)
                hit = False
                for ny in range(y0, y1 + 1):
                    nrow = ny * w
                    for nx in range(x0, x1 + 1):
                        if cur[nrow + nx]:
                            hit = True
                            break
                    if hit:
                        break
                if hit:
                    nxt[row + x] = 1
        cur = nxt
    return cur


def _get_pixels(im: Image.Image) -> list:
    if hasattr(im, "get_flattened_data"):
        return list(im.get_flattened_data())
    return list(im.getdata())


def chroma_key_image(
    im: Image.Image,
    bg_rgb: tuple[int, int, int] = (255, 0, 255),
    hi_score: int = 190,
    lo_score: int = 35,
    seed_dist: float = 95.0,
    fringe_radius: int = 2,
) -> Image.Image:
    """
    Two-stage chroma-key extraction designed for ligne claire sprites:
      1. Stage 1 marks every pixel strongly matching the magenta backdrop as fully
         transparent (catches both exterior background and enclosed holes such as
         gaps between legs, arms, wheel spokes, or rigging).
      2. Stage 2 operates ONLY within a narrow `fringe_radius`-pixel band around
         Stage 1 background pixels, computing smooth anti-aliased alpha and
         un-premultiplying magenta spill so interior sprite pixels (including
         purples, reds, and whites) are never altered.
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    data = _get_pixels(rgb)
    bg_r, bg_g, bg_b = bg_rgb
    bg_score = max(1, _magenta_score(bg_r, bg_g, bg_b))
    hi = min(hi_score, max(120, bg_score - 35))
    lo = min(lo_score, hi - 10)
    span = float(hi - lo)

    # Stage 1: definite background mask (exterior + enclosed magenta holes).
    bg_mask = bytearray(w * h)
    for idx, (r, g, b) in enumerate(data):
        score = _magenta_score(r, g, b)
        if score >= hi:
            dr = r - bg_r
            dg = g - bg_g
            db = b - bg_b
            if dr * dr + dg * dg + db * db <= seed_dist * seed_dist:
                bg_mask[idx] = 1

    # Stage 2: boundary band around definite background pixels.
    band = _dilate_mask(bg_mask, w, h, fringe_radius)

    out_pixels: list[tuple[int, int, int, int]] = [(0, 0, 0, 0)] * (w * h)
    for idx, (r, g, b) in enumerate(data):
        if bg_mask[idx]:
            out_pixels[idx] = (0, 0, 0, 0)
            continue
        if not band[idx]:
            out_pixels[idx] = (r, g, b, 255)
            continue

        score = _magenta_score(r, g, b)
        if score >= hi:
            out_pixels[idx] = (0, 0, 0, 0)
        elif score <= lo:
            out_pixels[idx] = (r, g, b, 255)
        else:
            alpha = (hi - score) / span
            # Un-premultiply edge blend against bg_rgb: C = alpha * fg + (1 - alpha) * bg
            inv_a = 1.0 / alpha
            one_minus_a = 1.0 - alpha
            nr = max(0, min(255, int(round((r - one_minus_a * bg_r) * inv_a))))
            ng = max(0, min(255, int(round((g - one_minus_a * bg_g) * inv_a))))
            nb = max(0, min(255, int(round((b - one_minus_a * bg_b) * inv_a))))
            # Clamp any residual magenta tint on dark outlines at the outer edge.
            if nb > nr and nb > ng and (min(nr, nb) - ng) > 25:
                avg = (nr + ng + nb) // 3
                nr = min(nr, avg)
                nb = min(nb, avg)
            ai = int(round(alpha * 255.0))
            if ai <= 4:
                out_pixels[idx] = (0, 0, 0, 0)
            else:
                out_pixels[idx] = (nr, ng, nb, ai)

    out = Image.new("RGBA", (w, h))
    out.putdata(out_pixels)
    return out


def verify_png(path: Path, expect_transparent: bool = True) -> dict:
    """
    Inspect a PNG file using the same criteria as tools/image-gen/PngInspector.cs:
    PNG format, RGBA alpha channel, transparent pixel share, and no corner checkerboard.
    """
    with Image.open(path) as im:
        is_png = im.format == "PNG"
        mode = im.mode
        w, h = im.size
        has_alpha = mode in ("RGBA", "LA") or "transparency" in im.info
        rgba = im.convert("RGBA")
        pixels = _get_pixels(rgba)

    total = w * h
    transparent = sum(1 for _, _, _, a in pixels if a <= 16)
    translucent = sum(1 for _, _, _, a in pixels if 16 < a < 240)
    trans_frac = transparent / total if total else 0.0

    # Mirror PngInspector.cs: check whether opaque corners are almost all light neutral
    # greys split between two clearly separated brightness bins (a drawn checkerboard).
    checkerboard = False
    if trans_frac < 0.01:
        cw = max(1, min(w // 4, max(32, w // 8)))
        ch = max(1, min(h // 4, max(32, h // 8)))
        bins = [0] * 32
        corner_total = 0
        corner_light = 0
        for y in range(h):
            if ch <= y < h - ch:
                continue
            row = y * w
            for x in range(w):
                if cw <= x < w - cw:
                    continue
                r, g, b, a = pixels[row + x]
                if a >= 240:
                    corner_total += 1
                    mx = max(r, g, b)
                    mn = min(r, g, b)
                    if mx - mn <= 18 and mn >= 150:
                        corner_light += 1
                        bins[(r + g + b) // 3 // 8] += 1
        if corner_total > 0 and corner_light >= 0.8 * corner_total:
            a_bin = max(range(32), key=lambda i: bins[i])
            b_candidates = [i for i in range(32) if abs(i - a_bin) >= 2]
            b_bin = max(b_candidates, key=lambda i: bins[i]) if b_candidates else -1
            if b_bin >= 0 and bins[a_bin] >= 0.15 * corner_total and bins[b_bin] >= 0.15 * corner_total:
                checkerboard = True

    issues: list[str] = []
    if not is_png:
        issues.append("not a PNG")
    if expect_transparent:
        if not has_alpha:
            issues.append("missing alpha channel")
        elif trans_frac < 0.01:
            issues.append(f"almost no transparent pixels ({trans_frac:.2%})")
        if checkerboard:
            issues.append("painted checkerboard suspected in corners")
    else:
        if trans_frac > 0.0:
            issues.append(f"opaque image contains {trans_frac:.2%} transparent pixels")

    return {
        "ok": len(issues) == 0,
        "path": str(path),
        "width": w,
        "height": h,
        "mode": mode,
        "hasAlpha": has_alpha,
        "transparentFraction": trans_frac,
        "translucentFraction": translucent / total if total else 0.0,
        "checkerboardSuspected": checkerboard,
        "issues": issues,
    }


def _parse_size(spec: str | None) -> tuple[int, int] | None:
    if not spec:
        return None
    parts = spec.lower().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid --resize '{spec}' (expected WIDTHxHEIGHT, e.g. 1024x1536)")
    w, h = int(parts[0]), int(parts[1])
    if w <= 0 or h <= 0:
        raise ValueError(f"Invalid --resize '{spec}': dimensions must be positive")
    return (w, h)


def process_file(
    src: Path,
    dst: Path,
    *,
    auto_opaque: bool = False,
    force: bool = False,
    resize: tuple[int, int] | None = None,
    fringe_radius: int = 2,
) -> dict:
    with Image.open(src) as im:
        is_magenta, med_bg, spread = detect_corner_backdrop(im)
        if not is_magenta and not force:
            if not auto_opaque:
                raise ValueError(
                    f"{src}: corners are not flat magenta (median RGB {med_bg}, spread {spread:.1f}). "
                    "Use --auto to copy opaque images as RGB PNG, or --force to key anyway."
                )
            out = im.convert("RGB")
            if resize and out.size != resize:
                out = out.resize(resize, Image.Resampling.LANCZOS)
            dst.parent.mkdir(parents=True, exist_ok=True)
            out.save(dst, format="PNG")
            rep = verify_png(dst, expect_transparent=False)
            rep["modeUsed"] = "opaque-passthrough"
            return rep

        bg = med_bg if is_magenta else (255, 0, 255)
        keyed = chroma_key_image(im, bg_rgb=bg, fringe_radius=fringe_radius)
        if resize and keyed.size != resize:
            keyed = keyed.resize(resize, Image.Resampling.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        keyed.save(dst, format="PNG")
        rep = verify_png(dst, expect_transparent=True)
        rep["modeUsed"] = "chroma-key"
        rep["detectedBackdrop"] = bg
        return rep


def iter_input_images(in_dir: Path) -> Iterable[Path]:
    for root, _, files in os.walk(in_dir):
        for name in sorted(files):
            p = Path(root) / name
            if p.suffix.lower() in IMAGE_EXTS:
                yield p


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert #ff00ff magenta chroma-key sprites to clean RGBA PNGs for Casual Colonization."
    )
    parser.add_argument("input", nargs="?", help="Input image path (single-file mode).")
    parser.add_argument("output", nargs="?", help="Output PNG path (single-file mode).")
    parser.add_argument("--in-dir", type=Path, help="Input directory for batch mode.")
    parser.add_argument("--out-dir", type=Path, help="Output directory for batch mode.")
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Pass non-magenta opaque images through as RGB PNGs instead of failing.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Key even if corners do not look like flat magenta (uses #ff00ff).",
    )
    parser.add_argument(
        "--resize",
        help="Optional target size WIDTHxHEIGHT (e.g. 1024x1536) after keying.",
    )
    parser.add_argument(
        "--fringe-radius",
        type=int,
        default=2,
        help="Anti-aliased boundary decontamination radius in pixels (default: 2).",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only inspect the given PNG(s) without modifying anything.",
    )
    parser.add_argument(
        "--expect-opaque",
        action="store_true",
        help="With --verify-only, expect an opaque PNG with zero transparent pixels.",
    )
    args = parser.parse_args(argv)

    if args.verify_only:
        if not args.input:
            parser.error("--verify-only requires an input PNG path.")
        rep = verify_png(Path(args.input), expect_transparent=not args.expect_opaque)
        status = "OK" if rep["ok"] else "FLAGGED: " + "; ".join(rep["issues"])
        print(
            f"{rep['path']}: {rep['width']}x{rep['height']} {rep['mode']} "
            f"transparent={rep['transparentFraction']:.1%} translucent={rep['translucentFraction']:.2%} -> {status}"
        )
        return 0 if rep["ok"] else 1

    resize = _parse_size(args.resize)

    if args.in_dir or args.out_dir:
        if not (args.in_dir and args.out_dir):
            parser.error("Batch mode requires both --in-dir and --out-dir.")
        files = list(iter_input_images(args.in_dir))
        if not files:
            print(f"No images found in {args.in_dir}", file=sys.stderr)
            return 1
        failed = 0
        for src in files:
            rel = src.relative_to(args.in_dir).with_suffix(".png")
            dst = args.out_dir / rel
            try:
                rep = process_file(
                    src,
                    dst,
                    auto_opaque=args.auto,
                    force=args.force,
                    resize=resize,
                    fringe_radius=args.fringe_radius,
                )
            except Exception as exc:
                print(f"FAIL {src}: {exc}", file=sys.stderr)
                failed += 1
                continue
            tag = "OK" if rep["ok"] else "FLAGGED"
            print(
                f"{tag} [{rep['modeUsed']}] {rel}: {rep['width']}x{rep['height']} "
                f"transparent={rep['transparentFraction']:.1%}"
            )
            if not rep["ok"]:
                print("  issues:", "; ".join(rep["issues"]), file=sys.stderr)
                failed += 1
        return 0 if failed == 0 else 1

    if not (args.input and args.output):
        parser.error("Provide <input> <output.png>, or --in-dir and --out-dir.")

    try:
        rep = process_file(
            Path(args.input),
            Path(args.output),
            auto_opaque=args.auto,
            force=args.force,
            resize=resize,
            fringe_radius=args.fringe_radius,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    tag = "OK" if rep["ok"] else "FLAGGED"
    print(
        f"{tag} [{rep['modeUsed']}] {rep['path']}: {rep['width']}x{rep['height']} {rep['mode']} "
        f"transparent={rep['transparentFraction']:.1%} translucent={rep['translucentFraction']:.2%}"
    )
    if not rep["ok"]:
        print("Issues:", "; ".join(rep["issues"]), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
