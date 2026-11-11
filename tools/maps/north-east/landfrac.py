"""Step 1: the land fraction of every tile of the North-east map (Natural Earth 1:10m)."""
import json, math, sys
import numpy as np
from shapely.geometry import shape, box
from shapely.ops import unary_union
import shapely

D = '/tmp/claude-0/-home-user-CasualColonization/b9a40597-a79c-5e47-82fb-9e655e0414a5/scratchpad/ne/'
LON0, LAT0 = -82.0, 58.5
ROW = 0.25
COL = ROW / math.cos(math.radians(49.25))
W, H = 84, 74
bbox = box(LON0 - 1, LAT0 - ROW * H - 1, LON0 + COL * W + 1, LAT0 + 1)

def load(fn, keep=lambda p: True):
    d = json.load(open(D + fn + '.geojson'))
    out = []
    for f in d['features']:
        g = shape(f['geometry'])
        if g.intersects(bbox) and keep(f['properties']):
            out.append(g.intersection(bbox))
    return out

land = unary_union(load('ne_10m_land') + load('ne_10m_minor_islands'))
NATURAL_RESERVOIRS = {'Lac Saint-Jean', 'Lake Abitibi'}
lakes = unary_union(load('ne_10m_lakes', lambda p: p.get('featurecla') == 'Lake' or p.get('name') in NATURAL_RESERVOIRS)
                    + load('ne_10m_lakes_north_america', lambda p: p.get('featurecla') == 'Lake'))
land = land.difference(lakes)
shapely.prepare(land)
shapely.prepare(lakes)

N = 5
frac = np.zeros((H, W))
lakefrac = np.zeros((H, W))
for y in range(H):
    for x in range(W):
        xs, ys = [], []
        for i in range(N):
            for j in range(N):
                xs.append(LON0 + COL * (x + (i + 0.5) / N))
                ys.append(LAT0 - ROW * (y + (j + 0.5) / N))
        xs, ys = np.array(xs), np.array(ys)
        frac[y, x] = shapely.contains_xy(land, xs, ys).mean()
        lakefrac[y, x] = shapely.contains_xy(lakes, xs, ys).mean()
np.save(D + 'frac.npy', frac)
np.save(D + 'lakefrac.npy', lakefrac)

# Islands: each island polygon of 150 km2 or more, with the tile holding most of it.
islands = []
geoms = list(land.geoms) if land.geom_type == 'MultiPolygon' else [land]
for g in geoms:
    c = g.representative_point()
    area = g.area * 111.32 * 111.32 * math.cos(math.radians(c.y))
    if area >= 150 and area < 2_000_000:
        islands.append((round(area), c.x, c.y))
json.dump(islands, open(D + 'islands.json', 'w'))
print('done', len(islands))
