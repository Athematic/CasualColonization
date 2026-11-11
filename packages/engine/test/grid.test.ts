import { describe, expect, it } from 'vitest';
import { AMERICAS, CARIBBEAN, createGame, gridIn, gridOf, HEX_FLAT, HEX_POINTY, HEX_TEST, HEX_TEST_FLAT, MAX_WORK_RINGS, neighbours, reachOffsets, SQUARE, workArea, workReachIn, type Direction, type Grid } from '../src/index.js';

// The square grid must give exactly what the hand-written loops it replaced gave, in the same
// order: the computer players take the first of equals, so the order is part of every game.

const OLD_DIRECTIONS: { id: Direction; dx: number; dy: number }[] = [
  { id: 'n', dx: 0, dy: -1 },
  { id: 'ne', dx: 1, dy: -1 },
  { id: 'e', dx: 1, dy: 0 },
  { id: 'se', dx: 1, dy: 1 },
  { id: 's', dx: 0, dy: 1 },
  { id: 'sw', dx: -1, dy: 1 },
  { id: 'w', dx: -1, dy: 0 },
  { id: 'nw', dx: -1, dy: -1 },
];

const map = { width: 7, height: 5 };
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;

/** The old `for dy = -r..r / for dx = -r..r` loop. */
function oldSquare(x: number, y: number, r: number, skip?: (dx: number, dy: number) => boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (skip?.(dx, dy)) continue;
      if (inMap(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    }
  }
  return out;
}

/** The old queries.ts neighbours: DIRECTIONS order, on the map. */
function oldNeighbours(x: number, y: number): { x: number; y: number }[] {
  return OLD_DIRECTIONS.map((d) => ({ x: x + d.dx, y: y + d.dy })).filter((p) => inMap(p.x, p.y));
}

const oldDistance = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const offsetsAt = (x: number, y: number, offsets: readonly number[]) => {
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < offsets.length; k += 2) if (inMap(x + offsets[k], y + offsets[k + 1])) out.push({ x: x + offsets[k], y: y + offsets[k + 1] });
  return out;
};

const tiles: [number, number][] = [];
for (let y = -1; y <= map.height; y++) for (let x = -1; x <= map.width; x++) tiles.push([x, y]);

describe('square grid', () => {
  it('has the old directions in the old order', () => {
    expect(SQUARE.directions.map((d) => ({ id: d.id, dx: d.dx, dy: d.dy }))).toEqual(OLD_DIRECTIONS);
    for (const d of OLD_DIRECTIONS) expect(SQUARE.step(3, 2, d.id)).toEqual({ x: 3 + d.dx, y: 2 + d.dy });
    expect(() => SQUARE.step(0, 0, 'up' as Direction)).toThrow();
  });

  it('measures distance as the larger of the two axes', () => {
    for (const [ax, ay] of tiles) for (const [bx, by] of tiles) expect(SQUARE.distance(ax, ay, bx, by)).toBe(oldDistance(ax, ay, bx, by));
  });

  it('gives the neighbours and the work area in the old direction order', () => {
    for (const [x, y] of tiles) {
      expect(SQUARE.neighbours(map, x, y)).toEqual(oldNeighbours(x, y));
      expect(offsetsAt(x, y, SQUARE.neighbourOffsets(x, y))).toEqual(oldNeighbours(x, y));
      expect(SQUARE.workArea(map, x, y)).toEqual(oldNeighbours(x, y));
      expect(offsetsAt(x, y, SQUARE.workOffsets(x, y))).toEqual(oldNeighbours(x, y));
    }
    expect(SQUARE.workRadius).toBe(1);
  });

  it('gives the tiles within r and the ring at r in the old row-by-row order', () => {
    for (const r of [0, 1, 2, 3, 4, 7]) {
      for (const [x, y] of tiles) {
        expect(SQUARE.tilesWithin(map, x, y, r)).toEqual(oldSquare(x, y, r));
        expect(offsetsAt(x, y, SQUARE.withinOffsets(x, y, r))).toEqual(oldSquare(x, y, r));
        if (r === 0) continue;
        const ring = oldSquare(x, y, r, (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy)) !== r);
        expect(SQUARE.ring(map, x, y, r)).toEqual(ring);
        expect(offsetsAt(x, y, SQUARE.ringOffsets(x, y, r))).toEqual(ring);
      }
    }
    // The ring at 1 is the old "around, not the centre" loop.
    expect(SQUARE.ring(map, 3, 2, 1)).toEqual(oldSquare(3, 2, 1, (dx, dy) => !dx && !dy));
    // Offsets are cached, not rebuilt on every call.
    expect(SQUARE.withinOffsets(0, 0, 3)).toBe(SQUARE.withinOffsets(5, 5, 3));
  });

  it('steps towards a tile as the old sign lookup did', () => {
    for (const [fx, fy] of tiles) {
      for (const [tx, ty] of tiles) {
        const old = OLD_DIRECTIONS.find((d) => d.dx === Math.sign(tx - fx) && d.dy === Math.sign(ty - fy))?.id;
        expect(SQUARE.directionTowards(fx, fy, tx, ty)).toBe(old);
      }
    }
  });
});

describe('the game grid', () => {
  it('is squares for scenarios that set no grid', () => {
    expect(AMERICAS.map.grid).toBeUndefined();
    expect(gridIn(AMERICAS)).toBe(SQUARE);
    expect(gridIn(CARIBBEAN)).toBe(SQUARE);
    expect(gridIn({ map: { ...AMERICAS.map, grid: 'square' } })).toBe(SQUARE);
    expect(() => gridIn({ map: { ...AMERICAS.map, grid: 'triangle' as 'square' } })).toThrow(/Unknown grid/);
    const s = createGame({ seed: 5, nations: ['england', 'france'], humans: [], mapSize: 'small' });
    expect(gridOf(s)).toBe(SQUARE);
    expect(neighbours(s, 0, 0)).toEqual(SQUARE.neighbours(s.map, 0, 0));
    expect(workArea(s, 4, 4)).toEqual(SQUARE.workArea(s.map, 4, 4));
  });
});

// ---- Hexagons (docs/design/hex-maps.md H1, H2, H5, H18) ----

const HEX_IDS = { pointy: ['ne', 'e', 'se', 'sw', 'w', 'nw'], flat: ['n', 'ne', 'se', 's', 'sw', 'nw'] } as const;
const OPPOSITE: Record<Direction, Direction> = { n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e', nw: 'se' };
const big = { width: 15, height: 13 };
const bigTiles: [number, number][] = [];
for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) bigTiles.push([x, y]);

/** Steps on an open map from a tile to every other, breadth first over the grid's neighbours. */
function bfs(grid: Grid, x: number, y: number): Map<string, number> {
  const out = new Map([[`${x},${y}`, 0]]);
  const queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const n of grid.neighbours(big, cx, cy)) {
      const k = `${n.x},${n.y}`;
      if (out.has(k)) continue;
      out.set(k, out.get(`${cx},${cy}`)! + 1);
      queue.push([n.x, n.y]);
    }
  }
  return out;
}

describe.each([
  ['pointy', HEX_POINTY],
  ['flat', HEX_FLAT],
] as const)('%s-top hex grid', (orientation, grid) => {
  it('has six directions clockwise from the north, and refuses the two it lacks', () => {
    expect(grid.kind).toBe('hex');
    expect(grid.orientation).toBe(orientation);
    expect(grid.directions.map((d) => d.id)).toEqual(HEX_IDS[orientation]);
    const missing = (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as Direction[]).filter((d) => !(HEX_IDS[orientation] as readonly string[]).includes(d));
    expect(missing).toHaveLength(2);
    for (const d of missing) expect(() => grid.step(3, 3, d)).toThrow();
    expect(grid.workRadius).toBe(1);
  });

  it('steps both ways on both parities: neighbours are symmetric, distinct and one step away', () => {
    for (const [x, y] of tiles) {
      const near = grid.neighbourOffsets(x, y);
      expect(near).toHaveLength(12);
      const seen = new Set<string>();
      grid.directions.forEach((d, i) => {
        const n = grid.step(x, y, d.id);
        expect(n).toEqual({ x: x + near[2 * i], y: y + near[2 * i + 1] });
        expect(grid.step(n.x, n.y, OPPOSITE[d.id])).toEqual({ x, y });
        expect(grid.distance(x, y, n.x, n.y)).toBe(1);
        expect(grid.directionIndex(x, y, n.x - x, n.y - y)).toBe(i);
        expect(grid.directionTowards(x, y, n.x, n.y)).toBe(d.id);
        // The neighbour has this tile among its own, in the opposite direction (index + 3).
        expect(grid.directionIndex(n.x, n.y, x - n.x, y - n.y)).toBe((i + 3) % 6);
        seen.add(`${n.x},${n.y}`);
      });
      expect(seen.size).toBe(6);
      // Every neighbour is within one tile on both axes (ai/common.ts tilesAround relies on it).
      for (let k = 0; k < near.length; k++) expect(Math.abs(near[k])).toBeLessThanOrEqual(1);
      expect(grid.directionIndex(x, y, 0, 0)).toBe(-1);
      expect(grid.workArea(map, x, y)).toEqual(grid.neighbours(map, x, y));
      expect(grid.workOffsets(x, y)).toBe(near);
    }
    // From column 0, row 0 the directions' own steps.
    expect(grid.directions.map((d) => grid.step(0, 0, d.id))).toEqual(grid.directions.map((d) => ({ x: d.dx, y: d.dy })));
  });

  it('measures distance as the steps of a path on open land', () => {
    for (const [x, y] of [[7, 6], [0, 0], [14, 12], [3, 8], [8, 3]] as const) {
      const steps = bfs(grid, x, y);
      for (const [bx, by] of bigTiles) {
        expect(grid.distance(x, y, bx, by), `${x},${y} to ${bx},${by}`).toBe(steps.get(`${bx},${by}`));
        expect(grid.distance(bx, by, x, y)).toBe(grid.distance(x, y, bx, by));
      }
    }
  });

  it('has rings of 6r tiles and 3r(r+1)+1 tiles within r, row by row', () => {
    for (const [x, y] of [[7, 6], [6, 6], [7, 5], [6, 5]] as const) {
      for (const r of [0, 1, 2, 3, 5]) {
        const within = grid.tilesWithin(big, x, y, r);
        expect(within).toHaveLength(3 * r * (r + 1) + 1);
        for (const p of within) expect(grid.distance(x, y, p.x, p.y)).toBeLessThanOrEqual(r);
        expect(within).toEqual([...within].sort((a, b) => a.y - b.y || a.x - b.x));
        if (r === 0) continue;
        const ring = grid.ring(big, x, y, r);
        expect(ring).toHaveLength(6 * r);
        expect(ring).toEqual(within.filter((p) => grid.distance(x, y, p.x, p.y) === r));
      }
    }
    // One cached array per parity: the same for tiles of the same row (or column) parity.
    const same = orientation === 'pointy' ? ([3, 2] as const) : ([2, 3] as const);
    expect(grid.withinOffsets(0, 0, 3)).toBe(grid.withinOffsets(same[0], same[1], 3));
    expect(grid.ringOffsets(0, 0, 2)).toBe(grid.ringOffsets(same[0], same[1], 2));
    expect(grid.neighbourOffsets(0, 0)).not.toEqual(grid.neighbourOffsets(1, 1));
  });

  it('draws straight lines of neighbours, and directionTowards always gets nearer', () => {
    for (const [ax, ay] of bigTiles) {
      for (const [bx, by] of [[7, 6], [0, 0], [14, 12], [3, 11], [12, 1]] as const) {
        const d = grid.distance(ax, ay, bx, by);
        const line = grid.line(ax, ay, bx, by);
        expect(line).toHaveLength(d + 1);
        expect(line[0]).toEqual({ x: ax, y: ay });
        expect(line[d]).toEqual({ x: bx, y: by });
        for (let i = 1; i <= d; i++) expect(grid.distance(line[i - 1].x, line[i - 1].y, line[i].x, line[i].y)).toBe(1);
        const dir = grid.directionTowards(ax, ay, bx, by);
        if (d === 0) {
          expect(dir).toBeUndefined();
          continue;
        }
        const next = grid.step(ax, ay, dir!);
        expect(grid.distance(next.x, next.y, bx, by)).toBe(d - 1);
        expect(next).toEqual(line[1]);
      }
    }
  });

  it('places neighbouring tile centres one tile width apart', () => {
    for (const [x, y] of [[4, 4], [5, 5], [4, 5], [5, 4]] as const) {
      const c = grid.centre(x, y);
      for (const n of grid.neighbours(big, x, y)) {
        const m = grid.centre(n.x, n.y);
        expect(Math.hypot(m.x - c.x, m.y - c.y)).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('hex scenarios', () => {
  it('choose their grid and orientation', () => {
    expect(gridIn(HEX_TEST)).toBe(HEX_POINTY);
    expect(gridIn(HEX_TEST_FLAT)).toBe(HEX_FLAT);
    expect(gridIn({ map: { ...AMERICAS.map, grid: 'hex' } })).toBe(HEX_POINTY);
    expect(() => gridIn({ map: { ...AMERICAS.map, grid: 'hex', hex: { orientation: 'round' as 'flat' } } })).toThrow(/orientation/);
    expect(HEX_TEST.hidden).toBe(true);
    expect(HEX_TEST_FLAT.hidden).toBe(true);
  });

  it('leave square lines the rounded straight steps stored rivers have always used', () => {
    for (const [ax, ay] of tiles) {
      for (const [bx, by] of [[3, 2], [0, 0], [6, 4], [-1, 5]] as const) {
        const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        const want = [{ x: ax, y: ay }];
        for (let i = 1; i <= steps; i++) want.push({ x: Math.round(ax + ((bx - ax) * i) / steps), y: Math.round(ay + ((by - ay) * i) / steps) });
        expect(SQUARE.line(ax, ay, bx, by)).toEqual(want);
      }
      for (let i = 0; i < 8; i++) expect(SQUARE.directionIndex(ax, ay, OLD_DIRECTIONS[i].dx, OLD_DIRECTIONS[i].dy)).toBe(i);
      expect(SQUARE.centre(ax, ay)).toEqual({ x: ax, y: ay });
    }
  });
});

describe('a colony work area of up to two rings (H7)', () => {
  it('is the first ring, then the second ring row by row, cached per parity', () => {
    for (const grid of [SQUARE, HEX_POINTY, HEX_FLAT]) {
      for (const [x, y] of [[6, 6], [7, 7], [6, 7], [7, 6]] as const) {
        const one = reachOffsets(grid, x, y, 1);
        expect(one).toBe(grid.workOffsets(x, y));
        const two = reachOffsets(grid, x, y, 2);
        expect(two.slice(0, one.length)).toEqual([...one]);
        expect(two.slice(one.length)).toEqual([...grid.ringOffsets(x, y, 2)]);
        expect(reachOffsets(grid, x, y, 2)).toBe(two);
        expect(two.length / 2).toBe(grid === SQUARE ? 24 : 18);
      }
    }
    expect(() => reachOffsets(HEX_POINTY, 0, 0, 3)).toThrow();
  });

  it('reaches one ring unless the scenario lists more', () => {
    expect(workReachIn(AMERICAS)).toBe(1);
    expect(workReachIn(CARIBBEAN)).toBe(1);
    expect(workReachIn({ map: { ...AMERICAS.map, workArea: { rings: [{ size: 3 }] } } })).toBe(1);
    expect(workReachIn(HEX_TEST)).toBe(2);
    expect(workReachIn(HEX_TEST_FLAT)).toBe(2);
    expect(MAX_WORK_RINGS).toBe(2);
  });
});
