import { describe, expect, it } from 'vitest';
import { HEX_FLAT, HEX_POINTY, SQUARE, type Grid } from '@cc/engine';
import {
  edgeCorners,
  HEX_RADIUS,
  neighbourVector,
  screenToTile,
  tileCentre,
  tileCentreOnScreen,
  tileCorners,
  tileOutline,
  tileShape,
  tileToScreen,
  visibleRange,
  worldSize,
  worldToTile,
} from '../src/index.js';

describe('square grid geometry', () => {
  const view = { camera: { x: 10.5, y: 20.5, zoom: 48 }, width: 800, height: 600 };

  it('puts the camera tile in the middle of the view', () => {
    expect(screenToTile(view, 400, 300)).toEqual({ x: 10, y: 20 });
  });

  it('round-trips tile corners', () => {
    for (const [x, y] of [[0, 0], [10, 20], [17, 3]]) {
      const p = tileToScreen(view, x, y);
      expect(screenToTile(view, p.x + 1, p.y + 1)).toEqual({ x, y });
    }
  });

  it('is unchanged: a tile is a zoom × zoom square at (x, y), with or without the grid named', () => {
    for (const v of [view, { ...view, grid: SQUARE }]) {
      for (const [x, y] of [[0, 0], [10, 20], [17, 3], [-2, 5]]) {
        expect(tileToScreen(v, x, y)).toEqual({ x: Math.round((x - 10.5) * 48 + 400), y: Math.round((y - 20.5) * 48 + 300) });
        expect(tileCentreOnScreen(v, x, y)).toEqual({ x: (x + 0.5 - 10.5) * 48 + 400, y: (y + 0.5 - 20.5) * 48 + 300 });
      }
      for (const [sx, sy] of [[0, 0], [399.5, 300.2], [799, 599], [123.4, 456.7]]) {
        expect(screenToTile(v, sx, sy)).toEqual({ x: Math.floor((sx - 400) / 48 + 10.5), y: Math.floor((sy - 300) / 48 + 20.5) });
      }
    }
    expect(tileCentre(SQUARE, 3, 4)).toEqual({ x: 3.5, y: 4.5 });
    expect(tileCorners(SQUARE, 3, 4)).toEqual([{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 3, y: 5 }]);
    expect(worldSize(SQUARE, { width: 40, height: 70 })).toEqual({ width: 40, height: 70 });
    for (let d = 0; d < 8; d++) {
      const o = SQUARE.neighbourOffsets(0, 0);
      expect(neighbourVector(SQUARE, 5, 5, d)).toEqual([o[2 * d], o[2 * d + 1]]);
    }
  });

  it('keeps the visible range of a tile margin', () => {
    const state = { config: {}, map: { width: 100, height: 100 } } as never;
    expect(visibleRange({ ...view, state })).toEqual({ x0: 1, y0: 13, x1: 19, y1: 27 });
  });
});

const HEXES: [string, Grid][] = [
  ['pointy', HEX_POINTY],
  ['flat', HEX_FLAT],
];

describe.each(HEXES)('%s hex geometry', (_name, grid) => {
  it('puts neighbouring centres one unit apart, in the direction of the grid’s steps', () => {
    for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5], [0, 0]]) {
      const c = tileCentre(grid, x, y);
      const o = grid.neighbourOffsets(x, y);
      for (let d = 0; d < 6; d++) {
        const n = tileCentre(grid, x + o[2 * d], y + o[2 * d + 1]);
        expect(Math.hypot(n.x - c.x, n.y - c.y)).toBeCloseTo(1, 9);
        const [vx, vy] = neighbourVector(grid, x, y, d);
        expect(vx).toBeCloseTo(n.x - c.x, 9);
        expect(vy).toBeCloseTo(n.y - c.y, 9);
        // Clockwise from the north: each direction 60° on from the one before.
        const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
        const first = grid.orientation === 'pointy' ? -60 : -90;
        expect(((angle - first - 60 * d + 720) % 360 + 360) % 360).toBeCloseTo(0, 6);
      }
    }
  });

  it('has six corners at the hex radius, shared with the neighbours across each edge', () => {
    expect(tileShape(grid)).toHaveLength(6);
    for (const p of tileShape(grid)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(HEX_RADIUS, 9);
    const x = 6;
    for (const y of [3, 4]) {
      const mine = tileCorners(grid, x, y);
      const o = grid.neighbourOffsets(x, y);
      for (let d = 0; d < 6; d++) {
        const [a, b] = edgeCorners(grid, d);
        const theirs = tileCorners(grid, x + o[2 * d], y + o[2 * d + 1]);
        // Both corners of the shared edge are corners of the neighbour too.
        for (const p of [mine[a], mine[b]]) expect(theirs.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true);
      }
    }
  });

  it('fits the map: the world starts at 0 and holds every tile', () => {
    const map = { width: 30, height: 20 };
    const size = worldSize(grid, map);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        for (const p of tileCorners(grid, x, y)) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
    expect(minX).toBeCloseTo(0, 9);
    expect(minY).toBeCloseTo(0, 9);
    expect(maxX).toBeCloseTo(size.width, 9);
    expect(maxY).toBeCloseTo(size.height, 9);
  });

  it('picks the tile under a point: centres, points inside, and the nearest centre near edges', () => {
    for (let y = -1; y < 9; y++) {
      for (let x = -1; x < 9; x++) {
        const c = tileCentre(grid, x, y);
        expect(worldToTile(grid, c.x, c.y)).toEqual({ x, y });
        // Points well inside the hex, towards each corner and each edge.
        for (const p of tileShape(grid)) expect(worldToTile(grid, c.x + p.x * 0.95, c.y + p.y * 0.95)).toEqual({ x, y });
        for (let d = 0; d < 6; d++) {
          const [vx, vy] = neighbourVector(grid, x, y, d);
          expect(worldToTile(grid, c.x + vx * 0.49, c.y + vy * 0.49)).toEqual({ x, y });
        }
      }
    }
    // Any point: the picked tile's centre is the nearest of all centres around.
    for (let i = 0; i < 2000; i++) {
      const wx = ((i * 7919) % 1000) / 100;
      const wy = ((i * 104729) % 1000) / 100;
      const t = worldToTile(grid, wx, wy);
      const c = tileCentre(grid, t.x, t.y);
      const d = Math.hypot(c.x - wx, c.y - wy);
      expect(d).toBeLessThanOrEqual(HEX_RADIUS + 1e-9);
      for (let y = t.y - 2; y <= t.y + 2; y++)
        for (let x = t.x - 2; x <= t.x + 2; x++) {
          const o = tileCentre(grid, x, y);
          expect(Math.hypot(o.x - wx, o.y - wy)).toBeGreaterThanOrEqual(d - 1e-9);
        }
    }
  });

  it('round-trips tiles through the screen at any camera and zoom', () => {
    for (const camera of [{ x: 10.3, y: 7.7, zoom: 48 }, { x: 0, y: 0, zoom: 23 }, { x: 31.9, y: 12.25, zoom: 128 }]) {
      const view = { camera, width: 900, height: 640, grid };
      for (let y = 0; y < 25; y += 3) {
        for (let x = 0; x < 35; x += 4) {
          const c = tileCentreOnScreen(view, x, y);
          expect(screenToTile(view, c.x, c.y)).toEqual({ x, y });
          // tileToScreen is the top-left of a zoom × zoom box centred on the hex.
          const p = tileToScreen(view, x, y);
          expect(Math.abs(p.x + camera.zoom / 2 - c.x)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(p.y + camera.zoom / 2 - c.y)).toBeLessThanOrEqual(0.5);
          expect(screenToTile(view, p.x + camera.zoom / 2, p.y + camera.zoom / 2)).toEqual({ x, y });
          // Corners pulled in by a pixel still pick the tile.
          for (const q of tileOutline(view, x, y, 1)) expect(screenToTile(view, q.x, q.y)).toEqual({ x, y });
        }
      }
    }
  });

  it('covers the view with its visible range', () => {
    const state = { map: { width: 60, height: 50 } } as never;
    const view = { camera: { x: 20.2, y: 18.6, zoom: 40 }, width: 1000, height: 700, grid, state };
    const r = visibleRange(view);
    // Every tile with a part on screen is in the range.
    for (let y = 0; y < 50; y++)
      for (let x = 0; x < 60; x++) {
        const on = tileOutline(view, x, y).some((p) => p.x >= 0 && p.y >= 0 && p.x <= 1000 && p.y <= 700);
        if (on) {
          expect(x >= r.x0 && x <= r.x1, `${x},${y}`).toBe(true);
          expect(y >= r.y0 && y <= r.y1, `${x},${y}`).toBe(true);
        }
      }
  });
});
