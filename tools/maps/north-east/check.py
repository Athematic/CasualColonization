import json, math
D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
rows = json.load(open(D + 'terrain.json'))['rows']
H, W = len(rows), len(rows[0])
COL = 0.25 / math.cos(math.radians(49.25))
def tile(lon, lat):
    return int(math.floor((lon + 82) / COL)), int(math.floor((58.5 - lat) / 0.25))
def isLand(x, y):
    return rows[y][x] not in '.~'
def comps(landish):
    comp = [[-1] * W for _ in range(H)]
    n = 0
    for y in range(H):
        for x in range(W):
            if comp[y][x] >= 0 or landish(x, y) is False:
                continue
            st = [(x, y)]
            comp[y][x] = n
            while st:
                a, b = st.pop()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        c, d = a + dx, b + dy
                        if 0 <= c < W and 0 <= d < H and comp[d][c] < 0 and landish(c, d):
                            comp[d][c] = n
                            st.append((c, d))
            n += 1
    return comp
L = comps(lambda x, y: isLand(x, y))
Wt = comps(lambda x, y: not isLand(x, y))
PLACES = {
    "St. John's": (-52.75, 47.55), 'Quebec': (-71.25, 46.8), 'Montreal': (-73.6, 45.5), 'Trois-Rivieres': (-72.55, 46.35),
    'Tadoussac': (-69.75, 48.15), 'Ottawa': (-75.7, 45.4), 'Kingston': (-76.55, 44.35), 'Toronto': (-79.4, 43.7),
    'Niagara': (-79.05, 43.1), 'Albany': (-73.76, 42.65), 'Manhattan': (-73.97, 40.78), 'Boston': (-71.1, 42.36),
    'Plymouth': (-70.67, 41.96), 'Providence': (-71.41, 41.82), 'Hartford': (-72.68, 41.76), 'Portland': (-70.3, 43.66),
    'Halifax': (-63.6, 44.66), 'Annapolis Royal': (-65.51, 44.74), 'Saint John': (-66.06, 45.27), 'Charlottetown': (-63.13, 46.3),
    'Louisbourg': (-60.0, 45.92), 'Gaspe': (-64.5, 48.83), 'Corner Brook': (-57.95, 48.95), 'Red Bay': (-56.6, 51.8),
    'Nain': (-61.69, 56.54), 'Goose Bay': (-60.42, 53.3), 'Onondaga': (-76.15, 43.05), 'Huronia': (-79.88, 44.6),
    'Anticosti': (-63.0, 49.45), 'Long Island': (-73.0, 40.85), 'Hebron': (-62.6, 58.2), 'Stadacona': (-71.25, 46.82),
}
WATER = {
    'Strait of Belle Isle': (-56.6, 51.45), 'Cabot Strait': (-59.8, 47.3), 'Northumberland Strait': (-63.6, 46.1),
    'Gulf of St Lawrence': (-62.0, 48.5), 'Bay of Fundy': (-66.0, 45.0), 'Gulf of Maine': (-68.5, 43.0),
    'Long Island Sound': (-72.8, 41.12), 'Lake Ontario': (-77.5, 43.6), 'Lake Erie': (-81.0, 42.2),
    'Lake Champlain': (-73.3, 44.5), 'Lake Simcoe': (-79.4, 44.4), 'Georgian Bay': (-80.8, 45.2),
    'Lac Saint-Jean': (-72.05, 48.6), 'Lake Melville': (-59.5, 53.7), 'Lake Nipissing': (-79.9, 46.25),
    'Lake Mistassini': (-73.4, 50.8), 'Estuary at Rimouski': (-68.6, 48.6), 'Estuary below Quebec': (-70.7, 47.1),
    'James Bay': (-80.5, 52.5), 'Hudson Bay': (-79.5, 57.5), 'Atlantic': (-51.0, 45.0),
}
bad = 0
for n, (lon, lat) in PLACES.items():
    x, y = tile(lon, lat)
    if not isLand(x, y):
        print('NOT LAND', n, x, y); bad += 1
for n, (lon, lat) in WATER.items():
    x, y = tile(lon, lat)
    if isLand(x, y):
        print('NOT WATER', n, x, y); bad += 1
def lc(n):
    x, y = tile(*PLACES[n]); return L[y][x]
def wc(n):
    x, y = tile(*WATER[n]); return Wt[y][x]
islands = ["St. John's", 'Anticosti', 'Charlottetown']
for i in islands:
    for j in islands + ['Montreal', 'Nain']:
        if i != j and lc(i) == lc(j):
            print('JOINED', i, j); bad += 1
if lc('Nain') != lc('Montreal'): print('Labrador apart from the continent'); bad += 1
sea = wc('Atlantic')
for n in ['Strait of Belle Isle', 'Cabot Strait', 'Northumberland Strait', 'Gulf of St Lawrence', 'Bay of Fundy', 'Gulf of Maine', 'Long Island Sound', 'Lake Melville', 'Estuary at Rimouski', 'Estuary below Quebec']:
    if wc(n) != sea: print('NOT SEA', n); bad += 1
for n in ['Lake Ontario', 'Lake Erie', 'Lake Champlain', 'Lake Simcoe', 'Lac Saint-Jean', 'Lake Nipissing', 'Lake Mistassini']:
    if wc(n) == sea: print('LAKE OPEN TO SEA', n); bad += 1
# corner-only touches
for y in range(H - 1):
    for x in range(W - 1):
        a, b, c, d = isLand(x, y), isLand(x + 1, y), isLand(x, y + 1), isLand(x + 1, y + 1)
        if a == d and b == c and a != b:
            print('CORNER', x, y); bad += 1
sizes = {}
for y in range(H):
    for x in range(W):
        if L[y][x] >= 0: sizes[L[y][x]] = sizes.get(L[y][x], 0) + 1
print('land masses', sorted(sizes.values(), reverse=True)[:15], 'land tiles', sum(sizes.values()))
print('BAD', bad)
