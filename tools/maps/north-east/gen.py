"""Step 2: the North-east map's terrain, water, rivers and regions, from the land fractions."""
import json, math, sys
import numpy as np

D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
LON0, LAT0 = -82.0, 58.5
ROW = 0.25
COL = ROW / math.cos(math.radians(49.25))
W, H = 84, 74
frac = np.load(D + 'frac.npy')
lakefrac = np.load(D + 'lakefrac.npy')
islands = json.load(open(D + 'islands.json'))


def tile(lon, lat):
    return int(math.floor((lon - LON0) / COL)), int(math.floor((LAT0 - lat) / ROW))


def centre(x, y):
    return LON0 + COL * (x + 0.5), LAT0 - ROW * (y + 0.5)


def h(x, y, salt=0):
    """A deterministic hash in [0, 1)."""
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / 0x1000000


land = frac >= 0.4
lake = (lakefrac > 0.3) & ~land  # remembered for the report only

# Every island of 150 km2 or more keeps at least its middle tile.
for area, lon, lat in islands:
    x, y = tile(lon, lat)
    if 0 <= x < W and 0 <= y < H:
        land[y, x] = True


def line(points, step=0.02):
    """Tiles along a polyline in lon/lat, in order, 8-connected, without repeats."""
    out = []
    for (a, b), (c, d) in zip(points, points[1:]):
        n = max(1, int(max(abs(c - a) / COL, abs(d - b) / ROW) * 6))
        for i in range(n + 1):
            t = tile(a + (c - a) * i / n, b + (d - b) * i / n)
            if not out or out[-1] != t:
                if out:
                    # Fill a diagonal jump with an edge step, so a forced channel never meets at a corner.
                    px, py = out[-1]
                    if abs(t[0] - px) == 1 and abs(t[1] - py) == 1:
                        out.append((t[0], py))
                out.append(t)
    return out


def force(points, value):
    for x, y in line(points):
        if 0 <= x < W and 0 <= y < H:
            land[y, x] = value


# --- Hand corrections where the sampling breaks a shape (each says why) ---
KEEP_WATER, KEEP_LAND = set(), set()


def tiles_to(cells, value):
    for x, y in cells:
        land[y, x] = value
        (KEEP_LAND if value else KEEP_WATER).add((x, y))


def force(points, value):
    tiles_to([t for t in line(points) if 0 <= t[0] < W and 0 <= t[1] < H], value)


# The St Lawrence estuary from below Tadoussac up to the Île d'Orléans: navigable water to Stadacona
# (Quebec), as Cartier sailed it in 1535. Above Quebec the river is too narrow for a tile of water and
# runs as a major river.
tiles_to([(34, 39), (34, 40), (33, 40), (33, 41), (32, 41), (32, 42), (31, 42), (31, 43), (31, 44), (30, 44), (30, 45), (29, 45)], False)
# The Strait of Belle Isle between Newfoundland and Labrador, open from the Gulf to the Atlantic.
tiles_to([(63, 29), (63, 28), (64, 28), (65, 28), (66, 28), (66, 27), (67, 27), (68, 27), (69, 27)], False)
# Lake Melville and the narrows at Rigolet, open to the sea.
tiles_to([(57, 19), (58, 19), (58, 18), (59, 18), (60, 18), (60, 17), (61, 17), (62, 17), (62, 16), (63, 16)], False)
# Lakes narrower than a tile: Lake Champlain, Lake Simcoe, Lake Nipissing, Lake Mistassini.
tiles_to([(22, 54), (22, 55), (22, 56), (22, 57)], False)
tiles_to([(6, 56)], False)
tiles_to([(5, 49), (6, 49)], False)
force([(-74.0, 50.2), (-73.4, 50.75), (-72.8, 51.25)], False)
# Long Island Sound, from the East River to Block Island Sound.
force([(-73.55, 41.1), (-73.3, 41.1), (-72.6, 41.15), (-72.0, 41.2), (-71.7, 41.25)], False)
# Cape Cod, too thin for the sampling: its arm from Sandwich to Chatham and up to Provincetown.
force([(-70.45, 41.72), (-69.98, 41.72), (-69.98, 41.95)], True)
# Stadacona's point at Quebec and the north shore at Tadoussac stay land beside the estuary.
tiles_to([(28, 46), (31, 41)], True)
# St. John's, on the Avalon's east coast, under half land at this scale.
tiles_to([(76, 43)], True)
# Upper New York Bay, where the Hudson meets the sea.
tiles_to([(21, 71)], False)

# Corner-only touches (a strait or isthmus meeting at a corner, docs/design/hex-maps.md H11): in each
# 2x2 block of land and water set as a checkerboard, the tile whose land share is nearest the
# threshold flips, unless a correction above fixed it.
def corners():
    found = []
    for y in range(H - 1):
        for x in range(W - 1):
            a, b, c, d = land[y, x], land[y, x + 1], land[y + 1, x], land[y + 1, x + 1]
            if a == d and b == c and a != b:
                found.append((x, y))
    return found


for _ in range(20):
    fixes = corners()
    if not fixes:
        break
    for x, y in fixes:
        cells = [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
        if not (land[y, x] == land[y + 1, x + 1] and land[y, x + 1] == land[y + 1, x] and land[y, x] != land[y, x + 1]):
            continue
        free = [c for c in cells if c not in KEEP_WATER and c not in KEEP_LAND]
        cx, cy = min(free, key=lambda c: abs(frac[c[1], c[0]] - 0.4))
        land[cy, cx] = not land[cy, cx]
assert not corners(), corners()

# --- Distance to land (Chebyshev), for high seas and coasts ---
INF = 99
dist = np.full((H, W), INF)
for y in range(H):
    for x in range(W):
        if land[y, x]:
            dist[y, x] = 0
for _ in range(8):
    for y in range(H):
        for x in range(W):
            if dist[y, x] == 0:
                continue
            best = dist[y, x]
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W:
                        best = min(best, dist[yy, xx] + 1)
            dist[y, x] = best


def in_ellipse(lon, lat, e):
    cx, cy, rx, ry = e[:4]
    return ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 <= 1


def near_line(lon, lat, pts, width):
    best = 9
    for (a, b), (c, d) in zip(pts, pts[1:]):
        k = math.cos(math.radians(lat))
        ax, ay, bx, by, px, py = a * k, b, c * k, d, lon * k, lat
        vx, vy = bx - ax, by - ay
        t = max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
        best = min(best, math.hypot(px - ax - t * vx, py - ay - t * vy))
    return best <= width


def in_poly(lon, lat, poly):
    inside = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


# Where maize, beans and squash grew (gardens): the St Lawrence valley up to Stadacona, Huronia, and south.
SOUTH = [(-82.5, 39.5), (-82.5, 44.2), (-81.2, 44.9), (-80.3, 45.0), (-79.2, 45.05), (-77.5, 45.3), (-76.0, 45.55),
         (-74.6, 45.85), (-73.3, 46.3), (-72.2, 46.65), (-71.4, 46.95), (-70.7, 47.15), (-70.3, 46.95), (-70.6, 46.4),
         (-70.4, 45.6), (-69.8, 44.9), (-69.4, 44.35), (-68.5, 43.2), (-66.0, 39.5)]
NEWFOUNDLAND = [(-59.6, 47.4), (-59.6, 48.8), (-57.8, 50.6), (-55.6, 51.8), (-55.0, 51.6), (-52.4, 48.4), (-52.4, 46.4), (-56.0, 46.5)]
LABRADOR = [(-67.5, 58.6), (-67.5, 52.0), (-64.0, 51.4), (-57.2, 51.4), (-55.0, 52.5), (-55.0, 58.6)]

MOUNTAINS = [
    (-63.6, 58.55, 0.9, 0.55), (-65.95, 48.95, 0.7, 0.13), (-71.3, 44.25, 0.3, 0.17), (-74.0, 44.15, 0.35, 0.22),
    (-74.3, 42.15, 0.25, 0.12), (-68.92, 45.9, 0.15, 0.1), (-72.8, 44.4, 0.12, 0.3), (-57.8, 49.55, 0.25, 0.2),
    (-74.58, 46.22, 0.15, 0.1), (-59.0, 53.25, 0.4, 0.12),
]
HILLS_E = [
    (-63.4, 57.8, 1.3, 1.0), (-62.0, 56.6, 1.0, 0.6), (-59.0, 53.25, 0.9, 0.22), (-65.8, 48.75, 1.7, 0.45),
    (-66.4, 47.3, 0.8, 0.4), (-60.7, 46.72, 0.35, 0.3), (-63.9, 45.5, 0.6, 0.12), (-70.5, 45.1, 0.9, 0.4),
    (-71.3, 44.2, 0.7, 0.45), (-73.2, 42.4, 0.25, 0.45), (-74.2, 44.1, 0.95, 0.65), (-74.3, 42.15, 0.6, 0.3),
    (-78.4, 45.6, 0.8, 0.4), (-71.3, 47.6, 0.6, 0.35), (-70.5, 52.3, 0.7, 0.35), (-68.5, 51.4, 0.5, 0.4),
    (-74.0, 41.4, 0.25, 0.12), (-68.9, 45.9, 0.5, 0.35),
]
HILL_LINES = [
    ([(-59.0, 47.8), (-58.1, 48.8), (-57.4, 49.6), (-56.6, 50.5), (-56.0, 51.2)], 0.25),  # the Long Range Mountains
    ([(-73.0, 42.8), (-72.85, 43.6), (-72.7, 44.4), (-72.6, 45.0)], 0.18),  # the Green Mountains
    ([(-75.6, 46.2), (-74.0, 46.6), (-72.5, 47.0), (-71.0, 47.4), (-70.3, 47.7)], 0.28),  # the Laurentians' southern edge
    ([(-79.6, 42.2), (-77.5, 42.2), (-75.3, 42.0)], 0.22),  # the Allegheny plateau (the Southern Tier)
    ([(-78.0, 40.4), (-76.2, 40.7), (-75.4, 41.1)], 0.3),  # the ridges of Pennsylvania
]
MARSH = [(-64.25, 45.88, 0.2, 0.1), (-76.75, 43.02, 0.18, 0.08), (-72.85, 46.2, 0.25, 0.08), (-73.1, 45.0, 0.1, 0.07),
         (-79.0, 51.4, 0.45, 0.3), (-74.1, 40.8, 0.08, 0.06), (-71.65, 41.47, 0.1, 0.05)]
OPEN = [  # the clearings around Iroquoian towns and the wide valley floors
    ((-79.75, 44.6, 0.4, 0.2), 0.6), ((-80.1, 43.15, 0.6, 0.3), 0.4), ((-76.8, 42.85, 1.4, 0.3), 0.45),
    ((-74.5, 42.9, 0.6, 0.12), 0.5), ((-73.6, 45.5, 0.4, 0.2), 0.45), ((-71.25, 46.85, 0.25, 0.1), 0.4),
    ((-72.6, 42.3, 0.15, 0.8), 0.4), ((-73.8, 42.0, 0.2, 0.9), 0.35), ((-71.2, 41.7, 0.8, 0.35), 0.35),
    ((-73.3, 44.6, 0.25, 0.4), 0.3), ((-73.4, 40.75, 0.5, 0.12), 0.5),
]

terr = [[None] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        lon, lat = centre(x, y)
        if not land[y, x]:
            # Open sea beyond 3 tiles of land on the Atlantic side is the high seas (the route to Europe);
            # never in the Gulf of St Lawrence, the bays or the lakes.
            atlantic = (lon > -66.5 and not (lon < -58.4 and lat > 46.3 and lat < 51.9)) or (lon > -70.5 and lat < 42.6)
            gulf_or_inland = lon < -77 or (lon < -58.4 and lat > 46.3 and lat < 51.9 and lon > -66.5)
            east_edge = x >= W - 2
            terr[y][x] = '~' if east_edge or (atlantic and not gulf_or_inland and dist[y, x] >= 3) else '.'
            continue
        r = h(x, y, 1)
        south = in_poly(lon, lat, SOUTH)
        nfld = in_poly(lon, lat, NEWFOUNDLAND)
        lab = in_poly(lon, lat, LABRADOR)
        if south:
            base = 'r' if lat < 42.0 else 'p'
            p_open = 0.12
        elif lat > 48.6 or nfld or lab or lon < -76.5 and lat > 47.5:
            base = 't'
            p_open = 0.12
            coast = dist[y, x] if False else None
            if lat > 57.4:
                p_open = 0.85
            elif lat > 56.2:
                p_open = 0.55
            elif lat > 55.0 and lon < -76.0:
                p_open = 0.45
            elif nfld:
                p_open = 0.22
        else:
            base = 'g'
            p_open = 0.07
        for e, p in OPEN:
            if in_ellipse(lon, lat, e):
                p_open = max(p_open, p)
        ch = base if r < p_open else base.upper()
        if any(in_ellipse(lon, lat, e) for e in MARSH):
            ch = 'm' if h(x, y, 2) < 0.6 else 'M'
        hill = any(in_ellipse(lon, lat, e) for e in HILLS_E) or any(near_line(lon, lat, pts, w) for pts, w in HILL_LINES)
        if hill and h(x, y, 3) < 0.7:
            ch = 'h'
        # The Laurentian and Labrador plateaus: hills here and there.
        if not south and not hill and lat > 46.5 and h(x, y, 4) < 0.08:
            ch = 'h'
        if any(in_ellipse(lon, lat, e) for e in MOUNTAINS):
            ch = '^'
        terr[y][x] = ch

rows = [''.join(r) for r in terr]
json.dump({'rows': rows}, open(D + 'terrain.json', 'w'))
print('   ' + ''.join(str(x // 10) for x in range(W)))
print('   ' + ''.join(str(x % 10) for x in range(W)))
for y, r in enumerate(rows):
    print('%2d %s' % (y, r))
