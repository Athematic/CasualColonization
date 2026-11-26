#!/usr/bin/env python3
"""
Builds packages/engine/src/maps/vinland-atlantic.ts (Beta 4 step 4; docs/design/hex-maps.md H21).

Takes the north-eastern 58x52 slice of packages/engine/src/maps/north-east.ts
(cols 26..83, rows 0..51 — Newfoundland, Labrador, Gulf of St. Lawrence, Gaspé,
PEI, Cape Breton, Saguenay) and places it at cols 0..57, rows 22..73 of an 84x74
pointy-top hex map, extending north and east to add:
  - Helluland (southern Baffin Island, rows 0..16, cols 0..30) across Hudson Strait
  - Southwestern Greenland (Western Settlement / Nuuk & Eastern Settlement / Brattahlíð
    & Herjólfsnes, rows 0..22, cols 52..76) across the Davis Strait
  - North Atlantic high seas along the eastern edge and south of Greenland

Projection stays 0.25° lat/row and ~0.383° lon/col (64.0°N..45.5°N, 72.0°W..39.8°W).
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
NE_PATH = ROOT / "packages/engine/src/maps/north-east.ts"
OUT_PATH = ROOT / "packages/engine/src/maps/vinland-atlantic.ts"

W, H = 84, 74
DX = -26  # ne_x + DX = va_x  (so ne_x in 26..83 -> va_x in 0..57)
DY = 22   # ne_y + DY = va_y  (so ne_y in 0..51 -> va_y in 22..73)

ne_text = NE_PATH.read_text()
ne_rows = [l for l in ne_text.split("rows: `")[1].split("`")[0].strip("\n").split("\n") if l]
ne_rivers_block = ne_text.split("rivers: `")[1].split("`")[0].strip().split("\n")

assert len(ne_rows) == 74 and len(ne_rows[0]) == 84

# Start with ocean everywhere
grid = [["." for _ in range(W)] for _ in range(H)]

# 1. Copy North-east slice (cols 26..83, rows 0..51) -> (cols 0..57, rows 22..73)
for ne_y in range(52):
    va_y = ne_y + DY
    for ne_x in range(26, 84):
        va_x = ne_x + DX
        ch = ne_rows[ne_y][ne_x]
        # Convert old highSeas to ocean first; we recompute highSeas cleanly for the whole Atlantic
        grid[va_y][va_x] = "." if ch == "~" else ch

# 2. Extend northern Labrador tip (Torngat / Cape Chidley, 58.5°N..60.3°N -> rows 15..21)
torngat_ext = [
    # (y, x_start, pattern)
    (21, 10, "tthTttTttthh^^h"),
    (20, 12, "ttthTttthh^^h"),
    (19, 14, "ttthhtth^h"),
    (18, 16, "tthh^h"),
    (17, 18, "thh"),
]
for y, x0, pat in torngat_ext:
    for i, ch in enumerate(pat):
        if 0 <= x0 + i < W:
            grid[y][x0 + i] = ch

# 3. Draw Helluland (southern Baffin Island: Meta Incognita & Hall Peninsulas, 64.0°N..61.5°N)
#    Separated from Cape Chidley (row 17) by Hudson Strait (rows 12..16).
helluland = [
    (0,  0, "aa^hhtttttttthtttth^aa"),
    (1,  0, "a^^hhtttttttthhttth^a"),
    (2,  0, "a^hhtttttttthhtthh^a"),
    (3,  0, "^hhtttttttthhtthh"),
    (4,  1, "hhttttttthhtthh"),
    (5,  2, "httttttthhtthh"),
    (6,  3, "ttttttthhtth...hht"),
    (7,  4, "tttttthhth....hh^t"),
    (8,  5, "ttttthh......htt"),
    (9,  7, "ttthh........tt"),
    (10, 9, "tth"),
]
for y, x0, pat in helluland:
    for i, ch in enumerate(pat):
        if ch != "." and 0 <= x0 + i < W:
            grid[y][x0 + i] = ch

# 4. Draw Southwestern Greenland (64.0°N..59.7°N, 52°W..43°W -> rows 0..17, cols 52..74)
#    Western Settlement (Vestribyggð / Nuuk) at rows 0..5, cols 53..58
#    Eastern Settlement (Eystribyggð / Brattahlíð, Garðar, Herjólfsnes) at rows 9..17, cols 60..71
#    Interior: mountains (^) and Greenland ice sheet (a); fjord coast: tundra (t), grassland (g), hills (h)
greenland = [
    (0,  53, "tghh^^aaaaaaaaaaaaaaa^h"),
    (1,  53, "tgth^^aaaaaaaaaaaaaa^hh"),
    (2,  54, "tghh^^aaaaaaaaaaaaa^ht"),
    (3,  54, "tth^^aaaaaaaaaaaaa^hh"),
    (4,  55, "tgh^^aaaaaaaaaaaa^ht"),
    (5,  56, "tth^^aaaaaaaaaaa^hh"),
    (6,  57, "tth^^aaaaaaaaaa^ht"),
    (7,  58, "tgh^^aaaaaaaaa^hh"),
    (8,  59, "tth^^aaaaaaaa^ht"),
    (9,  60, "tgph^^aaaaaa^hh"),
    (10, 60, "tgphh^^aaaa^ht"),
    (11, 61, "tgpth^^aaa^hh"),
    (12, 62, "tgpth^^aa^ht"),
    (13, 63, "tgpth^^^hh"),
    (14, 64, "tghh^^^h"),
    (15, 65, "tgth^^h"),
    (16, 66, "tghh"),
    (17, 67, "th"),
]
for y, x0, pat in greenland:
    for i, ch in enumerate(pat):
        if 0 <= x0 + i < W:
            grid[y][x0 + i] = ch

# 5. Compute high seas (~): any water tile on the Atlantic/Davis Strait side at distance >= 3
#    from land (using Chebyshev distance 2 for coastal ocean buffer), plus always cols 81..83.
#    Keep Gulf of St. Lawrence (x < 38 and y > 46) as coastal ocean, not high seas.
def is_land(x, y):
    return grid[y][x] not in (".", "~")

for y in range(H):
    for x in range(W):
        if grid[y][x] != ".":
            continue
        if x >= W - 2:
            grid[y][x] = "~"
            continue
        # Keep Gulf of St. Lawrence and inland lakes as ocean
        if x < 38 and y > 48:
            continue
        near_land = False
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and is_land(nx, ny):
                    near_land = True
                    break
            if near_land:
                break
        if not near_land:
            grid[y][x] = "~"

# 6. Shift rivers from north-east that fit completely inside the slice
shifted_rivers = []
for raw in ne_rivers_block:
    line = raw.strip()
    if not line:
        continue
    name, rest = line.split(":", 1)
    tokens = rest.strip().split()
    out_tokens = []
    ok = True
    for tok in tokens:
        if tok in ("m", "M"):
            out_tokens.append(tok)
            continue
        xs, ys = tok.split(",")
        nx, ny = int(xs) + DX, int(ys) + DY
        if not (0 <= nx < W and 0 <= ny < H):
            ok = False
            break
        out_tokens.append(f"{nx},{ny}")
    if ok:
        shifted_rivers.append(f"    {name.strip()}: {' '.join(out_tokens)}")

# Add a short river in Greenland's Eastern Settlement (Eiríksfjörðr) for flavour
shifted_rivers.append("    Eiríksfjörðr: 64,11 61,11 60,11")

# 7. Peoples on vinland-atlantic
peoples_ts = """export const VINLAND_ATLANTIC_PEOPLES: TribeRegion[] = [
  // The Dorset (Tuniit) of Helluland (southern Baffin Island) and northern Labrador.
  { tribe: 'dorset', region: [1, 1, 20, 10], count: 2 },
  { tribe: 'dorset', region: [10, 18, 22, 30], count: 2 },
  // The Innu of Markland (Labrador) and the North Shore of the St. Lawrence.
  { tribe: 'innu', region: [10, 32, 34, 49], count: 3 },
  { tribe: 'innu', region: [8, 50, 26, 56], count: 2 },
  // The Beothuk of Newfoundland (Vinland gateway), from the Exploits valley to the coasts.
  { tribe: 'beothuk', region: [37, 56, 48, 65], count: 3 },
  // The Mi'kmaq of the Gulf of St. Lawrence: Gaspé, eastern New Brunswick, PEI, Cape Breton.
  { tribe: 'mikmaq', region: [13, 59, 20, 71], count: 2 },
  { tribe: 'mikmaq', region: [27, 68, 31, 72], count: 1 },
  // The Wolastoqiyik along the Saint John.
  { tribe: 'wolastoqiyik', region: [8, 66, 15, 72], count: 2 },
  // The St. Lawrence Iroquoians near Stadacona (Quebec).
  { tribe: 'stLawrenceIroquoians', region: [0, 67, 4, 70], count: 1 },
];"""

rows_str = "\n".join("".join(row) for row in grid)
rivers_str = "\n".join(shifted_rivers)

ts = f"""import type {{ StoredMap, TribeRegion }} from './index.js';

/**
 * The Vinland Atlantic (Beta 4 step 4; docs/design/hex-maps.md H21): an expanded pointy-top hex
 * map extending the North-east north and east to include southwestern Greenland (the Eastern and
 * Western Settlements), Helluland (southern Baffin Island), Markland (Labrador) and Vinland
 * (Newfoundland and the Gulf of St. Lawrence).
 *
 * Built by `tools/maps/vinland/build_vinland_atlantic.py` from the north-eastern 58×52 slice of
 * `north-east.ts` (preserving exact coordinates and rivers for Newfoundland, Labrador and the
 * Gulf), plus southern Baffin Island and southwestern Greenland on the same 0.25° × 0.383° grid.
 */
export const vinlandAtlantic: StoredMap = {{
  id: 'vinland-atlantic',
  name: 'Vinland & Greenland (expanded)',
  description:
    'Expanded North Atlantic hex map from southwestern Greenland and Helluland (Baffin Island) across Markland (Labrador) to Newfoundland and the Gulf of St. Lawrence.',
  entryRows: [6, 58],
  rivers: `
{rivers_str}
  `,
  rows: `
{rows_str}
  `,
}};

{peoples_ts}
"""

OUT_PATH.write_text(ts)
land_tiles = sum(1 for y in range(H) for x in range(W) if is_land(x, y))
hs_tiles = sum(1 for y in range(H) for x in range(W) if grid[y][x] == "~")
print(f"Wrote {OUT_PATH} ({W}x{H}): land={land_tiles} ({land_tiles/(W*H)*100:.1f}%), highSeas={hs_tiles}, rivers={len(shifted_rivers)}")
