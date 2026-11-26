import json, sys, math
import numpy as np
D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
rows = json.load(open(D + 'terrain.json'))['rows']
f = np.load(D + 'frac.npy')
x0, x1, y0, y1 = map(int, sys.argv[1:5])
COL = 0.25 / math.cos(math.radians(49.25))
print('          ' + ''.join(str(x % 10) for x in range(x0, x1 + 1)) + '   ' + ' '.join('%2d' % (x % 100) for x in range(x0, x1 + 1)))
for y in range(y0, y1 + 1):
    print('%2d %5.2f  ' % (y, 58.5 - 0.25 * (y + 0.5)) + rows[y][x0:x1 + 1] + '   ' + ' '.join('%2d' % int(f[y, x] * 99) for x in range(x0, x1 + 1)))
print('lon of x0..x1 centres: %.2f .. %.2f' % (-82 + COL * (x0 + 0.5), -82 + COL * (x1 + 0.5)))
