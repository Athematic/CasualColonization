import json, math, sys
D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
rows = json.load(open(D + 'terrain.json'))['rows']
COL = 0.25 / math.cos(math.radians(49.25))
pts = [(-63.6, 58.4), (-73.93, 44.11), (-71.3, 44.27), (-65.95, 48.95), (-68.92, 45.9),
       (-62.6, 58.2), (-65.0, 54.0), (-55.6, 48.95), (-75.0, 55.0), (-63.0, 58.0),
       (-64.5, 45.0), (-66.5, 46.5), (-77.5, 46.0), (-73.6, 45.5), (-76.6, 43.0), (-79.88, 44.6), (-71.4, 42.6),
       (-72.7, 41.7), (-74.4, 40.5), (-64.25, 45.88), (-51.0, 45.0), (-62.0, 48.5)]
for lon, lat in pts:
    x, y = int(math.floor((lon + 82) / COL)), int(math.floor((58.5 - lat) / 0.25))
    print(lon, lat, x, y, repr(rows[y][x]) if 0 <= y < len(rows) else 'OFF')
