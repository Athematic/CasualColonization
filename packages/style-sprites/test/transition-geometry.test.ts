import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@cc/engine';
import { BAND, FILLET, STRAIGHT, bandDepth, covers, coversTurned } from './fixtures/synthetic-geometry.js';
import { DEFAULT_TRANSITION_ORDER, transitionPieces } from '../src/transitions.js';

const ALL = () => ({ edge: true, inner: true, outer: true });
const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;

describe('transition piece geometry', () => {
  it('has a band boundary of exactly BAND depth with zero slope at both ends, mirror-symmetric', () => {
    expect(bandDepth(0)).toBe(BAND);
    expect(bandDepth(1)).toBe(BAND);
    for (let t = 0; t <= STRAIGHT; t += 0.01) {
      expect(bandDepth(t)).toBe(BAND);
      expect(bandDepth(1 - t)).toBe(BAND);
    }
    for (let t = 0; t <= 1; t += 0.013) {
      expect(bandDepth(t)).toBeCloseTo(bandDepth(1 - t), 12);
      expect(Math.abs(bandDepth(t) - BAND)).toBeLessThanOrEqual(0.03 + 1e-12);
    }
    // No step where the wave starts.
    expect(Math.abs(bandDepth(STRAIGHT + 1e-6) - BAND)).toBeLessThan(1e-9);
  });

  it('shapes the inner corner as a quarter-round fillet tangent to both band boundaries', () => {
    expect(covers('inner', 0.01, 0.9)).toBe(true);
    expect(covers('inner', 0.9, 0.01)).toBe(true);
    expect(covers('inner', 0.5, 0.5)).toBe(false);
    const c = BAND + FILLET;
    expect(covers('inner', BAND + 0.005, BAND + 0.005)).toBe(true);
    expect(covers('inner', c - FILLET * 0.5, c - FILLET * 0.5)).toBe(false);
    expect(covers('inner', c + 0.01, c + 0.01)).toBe(false);
    // The straight stretches next to the fillet stay exactly BAND deep.
    expect(covers('inner', 0.9, BAND - 1e-6)).toBe(true);
    expect(covers('inner', 0.9, BAND + 1e-6)).toBe(false);
    expect(covers('inner', BAND - 1e-6, 0.9)).toBe(true);
    expect(covers('inner', BAND + 1e-6, 0.9)).toBe(false);
  });

  it('shapes the outer corner as a quarter disc of the band depth, meeting the bands at BAND', () => {
    expect(covers('outer', BAND - 1e-6, 0)).toBe(true);
    expect(covers('outer', BAND + 1e-6, 0)).toBe(false);
    expect(covers('outer', 0, BAND - 1e-6)).toBe(true);
    expect(covers('outer', 0, BAND + 1e-6)).toBe(false);
    expect(covers('outer', BAND * 0.7, BAND * 0.7)).toBe(true);
    expect(covers('outer', BAND * 0.7, BAND * 0.7 + 0.1)).toBe(false);
  });

  it('turns pieces clockwise: the edge covers top, right, bottom, left for 0..3 turns', () => {
    const probes = [[0.5, 0.05], [0.95, 0.5], [0.5, 0.95], [0.05, 0.5]];
    for (let k = 0; k < 4; k++) {
      probes.forEach(([x, y], i) => expect(coversTurned('edge', k, x, y)).toBe(i === k));
    }
  });
});

/** A seeded random map of ranked terrains, with some water (undefined). */
function randomMap(seed: number, w: number, h: number): (TerrainId | undefined)[] {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const kinds: (TerrainId | undefined)[] = ['plains', 'plains', 'grassland', 'grassland', 'desert', undefined];
  return Array.from({ length: w * h }, () => kinds[Math.floor(rnd() * kinds.length)]);
}

describe('transition pieces join without steps or wedges', () => {
  const W = 9;
  const H = 9;
  type Map = (TerrainId | undefined)[];
  const pieces = (map: Map, x: number, y: number, bleeder: TerrainId) => {
    const own = map[y * W + x]!;
    const nbr = DIRS.map(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx < 0 || ny < 0 || nx >= W || ny >= H ? undefined : map[ny * W + nx];
    });
    return transitionPieces(DEFAULT_TRANSITION_ORDER, own, nbr, ALL).filter((p) => p.terrain === bleeder);
  };
  const covered = (map: Map, x: number, y: number, bleeder: TerrainId, u: number, v: number) =>
    pieces(map, x, y, bleeder).some((p) => coversTurned(p.piece, p.turns, u, v));
  const lower = (map: Map, x: number, y: number, bleeder: TerrainId) => {
    const t = map[y * W + x];
    const r = t ? DEFAULT_TRANSITION_ORDER.indexOf(t) : -1;
    return r >= 0 && r < DEFAULT_TRANSITION_ORDER.indexOf(bleeder);
  };

  it('agrees across every shared edge of two lower tiles, and fills every side facing the bleeder', () => {
    const e = 1e-6;
    for (let seed = 1; seed <= 60; seed++) {
      const map = randomMap(seed, W, H);
      for (const bleeder of ['grassland', 'plains'] as TerrainId[]) {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!lower(map, x, y, bleeder)) continue;
            for (let i = 0; i <= 40; i++) {
              const t = (i + 0.37) / 41;
              if (x + 1 < W && lower(map, x + 1, y, bleeder)) {
                expect(covered(map, x, y, bleeder, 1 - e, t), `seed ${seed} ${x},${y} east`).toBe(covered(map, x + 1, y, bleeder, e, t));
              }
              if (y + 1 < H && lower(map, x, y + 1, bleeder)) {
                expect(covered(map, x, y, bleeder, t, 1 - e), `seed ${seed} ${x},${y} south`).toBe(covered(map, x, y + 1, bleeder, t, e));
              }
              const sides: [number, number, number, number][] = [[0, -1, t, e], [1, 0, 1 - e, t], [0, 1, t, 1 - e], [-1, 0, e, t]];
              for (const [dx, dy, u, v] of sides) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H || map[ny * W + nx] !== bleeder) continue;
                expect(covered(map, x, y, bleeder, u, v), `seed ${seed} ${x},${y} facing ${dx},${dy}`).toBe(true);
              }
            }
          }
        }
      }
    }
    // 60 random maps take about 3 s alone on a loaded machine; the 5 s default timed out in full runs.
  }, 30_000);

  it('draws an L-shaped concave corner and a U-shaped inlet with filleted corners and a straight band', () => {
    const g: TerrainId = 'grassland';
    const p: TerrainId = 'plains';
    const map: Map = Array(W * H).fill(p);
    // L: grassland along the top row and the left column, so (1,1) has grassland north and west.
    for (let i = 0; i < W; i++) map[i] = g;
    for (let j = 0; j < H; j++) map[j * W] = g;
    // U: (5,3) has grassland north, west and east.
    map[2 * W + 5] = g;
    map[3 * W + 4] = g;
    map[3 * W + 6] = g;
    expect(pieces(map, 1, 1, g).map((q) => q.piece)).toEqual(['inner']);
    for (let t = 0.35; t <= 1; t += 0.05) {
      expect(covered(map, 1, 1, g, t, BAND - 0.031)).toBe(true);
      expect(covered(map, 1, 1, g, t, BAND + 0.031)).toBe(false);
    }
    expect(pieces(map, 5, 3, g).map((q) => q.piece)).toEqual(['inner', 'inner']);
    expect(covered(map, 5, 3, g, 0.5, 0.1)).toBe(true);
    expect(covered(map, 5, 3, g, BAND + 0.005, BAND + 0.005)).toBe(true);
    expect(covered(map, 5, 3, g, 1 - BAND - 0.005, BAND + 0.005)).toBe(true);
    expect(covered(map, 5, 3, g, 0.5, 0.5)).toBe(false);
    expect(covered(map, 5, 3, g, 0.5, 0.95)).toBe(false);
  });
});
