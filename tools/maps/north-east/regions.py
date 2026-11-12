"""Step 4: the land's regions (land health, hard years, epidemics): nearest named centre on the same land mass."""
import json, math
D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
rows = json.load(open(D + 'terrain.json'))['rows']
H, W = len(rows), len(rows[0])
COL = 0.25 / math.cos(math.radians(49.25))
def tile(lon, lat):
    return int(math.floor((lon + 82) / COL)), int(math.floor((58.5 - lat) / 0.25))
water = lambda x, y: rows[y][x] in '.~'

# id, name, centre (lon, lat). Names are plain geographic names in English, with the peoples' own
# names only where they are well established.
REGIONS = [
    ('hudson-coast', 'The east coast of Hudson Bay', -77.0, 56.6),
    ('james-bay', 'The east coast of James Bay', -78.2, 52.6),
    ('mistassini', 'Lake Mistassini and the Rupert', -74.2, 51.0),
    ('caniapiscau', 'The Caniapiscau uplands', -71.0, 54.6),
    ('labrador-plateau', 'The Labrador plateau', -65.5, 53.6),
    ('labrador-north', 'The northern Labrador coast', -62.6, 57.4),
    ('labrador-central', 'The central Labrador coast', -61.0, 55.4),
    ('lake-melville', 'Lake Melville and the Churchill', -60.3, 53.3),
    ('labrador-south', 'The southern Labrador coast', -57.3, 52.6),
    ('mingan', 'The Mingan coast', -61.5, 50.7),
    ('manicouagan', 'The Manicouagan coast', -67.8, 50.0),
    ('saguenay', 'The Saguenay and Lac Saint-Jean', -71.8, 48.8),
    ('abitibi', 'Abitibi and Lake Timiskaming', -79.3, 48.3),
    ('upper-ottawa', 'The upper Ottawa', -77.5, 47.0),
    ('ottawa', 'The lower Ottawa', -75.6, 45.7),
    ('saint-maurice', 'The Saint-Maurice and the Laurentians', -73.6, 47.3),
    ('stadacona', 'Quebec and the estuary', -70.9, 47.3),
    ('hochelaga', 'The Montreal plain', -73.2, 45.6),
    ('gaspe', 'Gaspé', -65.8, 48.75),
    ('anticosti', 'Anticosti', -63.0, 49.45),
    ('wolastoq', 'The Saint John valley', -67.4, 46.6),
    ('miramichi', 'The Miramichi and Chaleur Bay', -65.6, 47.1),
    ('nova-scotia', 'The Nova Scotia peninsula', -64.3, 44.9),
    ('cape-breton', "Cape Breton Island (Unama'ki)", -60.8, 46.2),
    ('pei', 'Prince Edward Island (Epekwitk)', -63.3, 46.35),
    ('newfoundland-west', 'Western Newfoundland', -57.7, 48.9),
    ('newfoundland-north', 'The Great Northern Peninsula', -56.5, 50.8),
    ('exploits', 'The Exploits and Notre Dame Bay', -55.6, 49.1),
    ('avalon', 'The Avalon and the south coast', -54.0, 47.5),
    ('penobscot', 'The Penobscot and the Maine coast', -68.7, 45.0),
    ('kennebec', 'The Kennebec and the White Mountains', -70.3, 44.6),
    ('champlain', 'Lake Champlain and the Green Mountains', -73.0, 44.4),
    ('adirondacks', 'The Adirondacks', -74.6, 44.1),
    ('mohawk', 'The Mohawk valley', -74.5, 42.8),
    ('finger-lakes', 'The Finger Lakes', -76.6, 42.75),
    ('genesee', 'The Genesee', -78.2, 42.6),
    ('niagara', 'Niagara and the Grand River', -80.2, 43.2),
    ('huronia', 'Huronia and Lake Simcoe', -79.5, 44.6),
    ('georgian-bay', 'Georgian Bay and Lake Nipissing', -80.4, 45.9),
    ('upper-hudson', 'The upper Hudson', -73.8, 42.5),
    ('lower-hudson', 'The lower Hudson', -74.1, 41.2),
    ('connecticut', 'The Connecticut valley', -72.5, 42.2),
    ('merrimack', 'The Merrimack', -71.4, 43.3),
    ('massachusetts-bay', 'Massachusetts Bay', -71.1, 42.35),
    ('narragansett', 'Narragansett Bay', -71.5, 41.65),
    ('cape-cod', 'Cape Cod and the islands', -70.3, 41.7),
    ('long-island', 'Long Island', -72.8, 40.85),
    ('susquehanna', 'The upper Susquehanna', -76.3, 41.0),
    ('lake-erie', 'The shore of Lake Erie', -79.8, 42.1),
    ('ontario-north', 'The north shore of Lake Ontario', -77.8, 44.4),
]
CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
assert len(REGIONS) <= len(CHARS)

# Land masses (8-connected).
mass = [[-1] * W for _ in range(H)]
n = 0
for y in range(H):
    for x in range(W):
        if water(x, y) or mass[y][x] >= 0:
            continue
        st = [(x, y)]
        mass[y][x] = n
        while st:
            a, b = st.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    c, d = a + dx, b + dy
                    if 0 <= c < W and 0 <= d < H and mass[d][c] < 0 and not water(c, d):
                        mass[d][c] = n
                        st.append((c, d))
        n += 1

centres = []
for i, (rid, name, lon, lat) in enumerate(REGIONS):
    x, y = tile(lon, lat)
    if water(x, y):
        x, y = min(((a, b) for b in range(H) for a in range(W) if not water(a, b)), key=lambda t: (t[0] - x) ** 2 + (t[1] - y) ** 2)
        print("moved", rid, x, y)
    centres.append((i, x, y, mass[y][x]))

def dist(x, y, cx, cy):
    lat = 58.5 - 0.25 * (y + 0.5)
    k = math.cos(math.radians(lat)) / math.cos(math.radians(49.25))
    return math.hypot((x - cx) * k, y - cy)

grid = [[-1] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if water(x, y):
            continue
        same = [c for c in centres if c[3] == mass[y][x]] or centres
        grid[y][x] = min(same, key=lambda c: dist(x, y, c[1], c[2]))[0]
# Water takes the region of the nearest land (breadth first), so a coast and its fishing share a region.
frontier = [(x, y) for y in range(H) for x in range(W) if grid[y][x] >= 0]
while frontier:
    nxt = []
    for x, y in frontier:
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            c, d = x + dx, y + dy
            if 0 <= c < W and 0 <= d < H and grid[d][c] < 0:
                grid[d][c] = grid[y][x]
                nxt.append((c, d))
    frontier = nxt

RATE = {'p': 0.6, 'r': 0.6, 'g': 0.5, 't': 0.4, 'h': 0.4, '^': 0.1, 'm': 0.5}
stats = []
for i, (rid, name, lon, lat) in enumerate(REGIONS):
    tiles = [(x, y) for y in range(H) for x in range(W) if grid[y][x] == i and not water(x, y)]
    rate = 0
    for x, y in tiles:
        ch = rows[y][x]
        r = RATE[ch.lower()]
        # Open tundra north of the trees gives least.
        if ch == 't':
            r = 0.25
        rate += r
    stats.append((rid, name, len(tiles), round(rate)))
    print('%-20s %-45s %4d tiles  renewal %3d' % (rid, name, len(tiles), round(rate)))
text = [''.join(CHARS[grid[y][x]] for x in range(W)) for y in range(H)]
json.dump({'rows': text, 'regions': [{'id': r[0], 'name': r[1], 'char': CHARS[i], 'tiles': r[2], 'renewal': r[3]} for i, r in enumerate(stats)]}, open(D + 'regions.json', 'w'))
for t in text:
    print(t)
