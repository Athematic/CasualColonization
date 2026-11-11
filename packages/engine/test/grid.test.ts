import { describe, expect, it } from 'vitest';
import { AMERICAS, CARIBBEAN, createGame, gridIn, gridOf, neighbours, SQUARE, workArea, type Direction } from '../src/index.js';

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
    expect(() => gridIn({ map: { ...AMERICAS.map, grid: 'hex' as 'square' } })).toThrow(/Unknown grid/);
    const s = createGame({ seed: 5, nations: ['england', 'france'], humans: [], mapSize: 'small' });
    expect(gridOf(s)).toBe(SQUARE);
    expect(neighbours(s, 0, 0)).toEqual(SQUARE.neighbours(s.map, 0, 0));
    expect(workArea(s, 4, 4)).toEqual(SQUARE.workArea(s.map, 4, 4));
  });
});
