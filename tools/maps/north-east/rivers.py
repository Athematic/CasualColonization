"""Step 3: river courses (lon/lat from the atlas) as the stored map's waypoints."""
import json, math
D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
rows = json.load(open(D + 'terrain.json'))['rows']
H, W = len(rows), len(rows[0])
COL = 0.25 / math.cos(math.radians(49.25))


def tile(lon, lat):
    return int(math.floor((lon + 82) / COL)), int(math.floor((58.5 - lat) / 0.25))


water = lambda x, y: rows[y][x] in '.~'

# Main rivers first, tributaries after the river they join. Each point: lon, lat and the size of the
# stretch that follows it ('m' minor, 'M' major).
RIVERS = [
    ('St. Lawrence', [(-76.4, 44.15, 'M'), (-75.7, 44.6, 'M'), (-74.75, 45.0, 'M'), (-74.2, 45.25, 'M'), (-73.55, 45.5, 'M'),
                      (-73.1, 45.95, 'M'), (-72.55, 46.35, 'M'), (-71.9, 46.6, 'M'), (-71.25, 46.8, 'M'), (-70.85, 47.05, 'M')]),
    ('Ottawa', [(-79.45, 47.35, 'm'), (-78.7, 46.32, 'M'), (-77.1, 45.83, 'M'), (-75.7, 45.42, 'M'), (-74.6, 45.58, 'M'), (-73.95, 45.42, 'M')]),
    ('Saguenay', [(-71.65, 48.5, 'M'), (-71.0, 48.42, 'M'), (-70.2, 48.25, 'M'), (-69.4, 48.1, 'M')]),
    ('Saint-Maurice', [(-73.6, 48.0, 'm'), (-72.85, 47.4, 'm'), (-72.65, 46.7, 'm'), (-72.55, 46.35, 'm')]),
    ('Richelieu', [(-73.3, 44.95, 'm'), (-72.95, 45.3, 'm'), (-72.95, 45.8, 'm')]),
    ('Hudson', [(-74.05, 44.1, 'm'), (-73.85, 43.4, 'm'), (-73.65, 43.25, 'm'), (-73.68, 42.75, 'M'), (-73.75, 42.6, 'M'), (-73.9, 42.0, 'M'),
                (-73.95, 41.4, "M"), (-73.97, 40.9, "M"), (-73.95, 40.6, "M")]),
    ('Mohawk', [(-75.45, 43.25, 'm'), (-75.0, 43.0, 'm'), (-74.3, 42.95, 'm'), (-73.68, 42.75, 'm')]),
    ('Connecticut', [(-71.5, 45.05, 'm'), (-72.05, 44.3, 'm'), (-72.45, 43.3, 'm'), (-72.6, 42.6, 'm'), (-72.62, 42.1, 'M'), (-72.65, 41.75, 'M'),
                     (-72.35, 41.25, 'M')]),
    ('Merrimack', [(-71.65, 43.65, 'm'), (-71.45, 43.0, 'm'), (-71.3, 42.65, 'm'), (-70.8, 42.8, 'm')]),
    ('Kennebec', [(-69.7, 45.6, 'm'), (-69.95, 45.0, 'm'), (-69.7, 44.55, 'm'), (-69.8, 43.8, 'm')]),
    ('Penobscot', [(-69.0, 46.0, 'm'), (-68.7, 45.3, 'm'), (-68.75, 44.8, 'm'), (-68.8, 44.3, 'm')]),
    ('Saint John', [(-69.3, 46.7, 'm'), (-68.5, 47.2, 'm'), (-68.3, 47.37, 'm'), (-67.75, 47.05, 'M'), (-67.6, 46.2, 'M'), (-66.65, 45.95, 'M'),
                    (-66.1, 45.6, 'M'), (-66.05, 45.1, 'M')]),
    ('Miramichi', [(-66.6, 46.6, 'm'), (-65.6, 46.95, 'm'), (-65.0, 47.1, 'm')]),
    ('Restigouche', [(-67.3, 47.6, 'm'), (-66.5, 48.0, 'm'), (-65.9, 47.95, 'm')]),
    ('Exploits', [(-56.7, 48.65, 'm'), (-55.65, 48.95, 'm'), (-55.0, 49.3, 'm')]),
    ('Humber', [(-57.2, 49.4, 'm'), (-57.4, 49.17, 'm'), (-58.85, 48.95, 'm')]),
    ('Churchill', [(-64.5, 53.5, 'M'), (-63.0, 53.3, 'M'), (-62.0, 53.25, 'M'), (-60.9, 53.25, 'M'), (-60.2, 53.45, 'M'), (-59.9, 53.7, 'M')]),
    ('Natashquan', [(-62.0, 51.6, 'm'), (-61.85, 50.8, 'm'), (-61.8, 50.0, 'm')]),
    ('Moisie', [(-66.5, 51.9, 'm'), (-66.2, 51.0, 'm'), (-66.1, 50.0, 'm')]),
    ('Manicouagan', [(-68.7, 51.3, 'm'), (-68.6, 50.3, 'm'), (-68.2, 49.0, 'm')]),
    ('Péribonka', [(-71.1, 50.6, 'm'), (-71.2, 49.3, 'm'), (-72.1, 48.6, 'm')]),
    ('Niagara', [(-78.95, 42.85, 'm'), (-79.05, 43.1, 'm'), (-79.07, 43.4, 'm')]),
    ('Grand', [(-80.4, 44.0, 'm'), (-80.3, 43.4, 'm'), (-79.9, 42.85, 'm')]),
    ('French', [(-79.95, 46.15, 'm'), (-80.6, 46.0, 'm'), (-81.0, 45.95, 'm')]),
    ('Trent', [(-78.4, 44.6, 'm'), (-77.9, 44.3, 'm'), (-77.55, 44.1, 'm'), (-77.55, 43.95, 'm')]),
    ('Genesee', [(-77.9, 42.2, 'm'), (-77.8, 42.8, 'm'), (-77.6, 43.3, 'm')]),
    ('Oswego', [(-76.2, 43.15, 'm'), (-76.5, 43.45, 'm')]),
    ('Eastmain', [(-73.8, 52.2, 'm'), (-76.5, 52.2, 'm'), (-78.6, 52.25, 'm')]),
    ('Rupert', [(-73.5, 51.2, 'm'), (-76.0, 51.4, 'm'), (-78.7, 51.45, 'm')]),
    ('La Grande', [(-73.8, 53.7, 'm'), (-77.0, 53.75, 'm'), (-79.1, 53.8, 'm')]),
    ('Gatineau', [(-75.9, 47.1, 'm'), (-75.8, 46.3, 'm'), (-75.75, 45.48, 'm')]),
]


def path(points):
    out = []
    for (a, b, s), (c, d, _) in zip(points, points[1:]):
        n = 200
        for i in range(n + 1):
            t = tile(a + (c - a) * i / n, b + (d - b) * i / n)
            if not out or out[-1][:2] != t:
                if out:
                    px, py = out[-1][:2]
                    # Straight steps between tiles more than one apart.
                    while max(abs(t[0] - px), abs(t[1] - py)) > 1:
                        px += (t[0] > px) - (t[0] < px)
                        py += (t[1] > py) - (t[1] < py)
                        out.append((px, py, s))
                out.append((t[0], t[1], s))
    return out


rv = set()
lines = []
for name, pts in RIVERS:
    p = path(pts)
    # Remove loops: a tile visited twice drops what lies between.
    seen = {}
    q = []
    for t in p:
        if t[:2] in seen:
            q = q[:seen[t[:2]] + 1]
            seen = {u[:2]: i for i, u in enumerate(q)}
            continue
        seen[t[:2]] = len(q)
        q.append(t)
    # Start on the first land tile (a lake source keeps its last water tile as the first waypoint).
    i = 0
    while i + 1 < len(q) and water(*q[i + 1][:2]) and water(*q[i][:2]):
        i += 1
    q = q[i:]
    # End at the first water tile or the first tile of a river already drawn.
    end = None
    for j in range(1, len(q)):
        if water(*q[j][:2]) or q[j][:2] in rv:
            end = j
            break
    if end is None:
        # Run on in the last direction until water or a river.
        print('extending', name, q[-1])
        x, y, s = q[-1]
        dx, dy = x - q[-2][0], y - q[-2][1]
        while not (water(x, y) or (x, y) in rv):
            x, y = x + dx, y + dy
            q.append((x, y, s))
        end = len(q) - 1
    q = q[:end + 1]
    for t in q[1:-1]:
        rv.add(t[:2])
    rv.add(q[0][:2])
    # Waypoints: the turning points and where the size changes.
    keep = [q[0]]
    for k in range(1, len(q) - 1):
        a, b, c = q[k - 1], q[k], q[k + 1]
        if (b[0] - a[0], b[1] - a[1]) != (c[0] - b[0], c[1] - b[1]) or b[2] != c[2]:
            keep.append(b)
    keep.append(q[-1])
    toks = ['%d,%d' % keep[0][:2]]
    size = 'm'
    for t in keep[1:]:
        if t[2] != size:
            toks.append(t[2])
            size = t[2]
        toks.append('%d,%d' % t[:2])
    lines.append('    %s: %s' % (name, ' '.join(toks)))
open(D + 'rivers.txt', 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
