/**
 * Beta 4 step 6 (docs/design/hex-maps.md H16): Ligne claire on hexes. The hex outlines, coastline
 * and borders, and whole frames of played hex games in both orientations. (Squares are checked by a
 * pixel comparison in the browser: they go through the unchanged square code.)
 */
import { describe, expect, it } from 'vitest';
import { createGame, gridOf, headStartConfig, playUntil, TERRAIN, type GameConfig, type GameState } from '@cc/engine';
import { computeVisibility, drawsGrid, edgeCorners, type MapLayerHooks, type Scene } from '@cc/render-api';
import ligneClaire from '../src/index.js';
import { hexBorders, hexCoastPath, hexLandPath, waterEdges } from '../src/hex.js';

type Call = { name: string; args: unknown[] };

/** A 2D context that records the methods called on it, with their arguments (no pixels). */
function recorder(): CanvasRenderingContext2D & { calls: Call[] } {
  const target: Record<string | symbol, unknown> = { calls: [] as Call[] };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0 });
      return (...args: unknown[]) => {
        (t.calls as Call[]).push({ name: String(k), args });
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & { calls: Call[] };
}

const fakeCanvas = (ctx: CanvasRenderingContext2D) => ({ width: 0, height: 0, getContext: () => ctx }) as unknown as HTMLCanvasElement;

function playedGame(scenario: string): GameState {
  const config: GameConfig = { seed: 5, mapSize: 'medium', nations: ['england', 'france'], humans: [], scenario };
  const s = createGame(headStartConfig(config, 60));
  playUntil(s, 60);
  return s;
}

function sceneOf(s: GameState, zoom = 48): Scene {
  const c = Object.values(s.colonies)[0];
  return {
    state: s,
    viewer: 'england',
    camera: { x: c ? c.x + 0.5 : s.map.width / 2, y: c ? c.y + 0.5 : s.map.height / 2, zoom },
    width: 800,
    height: 600,
    pixelRatio: 1,
    visible: computeVisibility(s, 'england'),
    revealAll: true,
  };
}

const isWater = (s: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < s.map.width && y < s.map.height && TERRAIN[s.map.tiles[y * s.map.width + x].t].water;

const games = Object.fromEntries(['hex-test', 'hex-test-flat'].map((id) => [id, playedGame(id)])) as Record<string, GameState>;

describe('Ligne claire on hexes', () => {
  it('draws squares and hexes', () => {
    expect(ligneClaire.grids).toEqual(['square', 'hex']);
    expect(drawsGrid(ligneClaire, 'hex')).toBe(true);
    expect(drawsGrid(ligneClaire, 'square')).toBe(true);
  });

  describe.each(Object.keys(games))('%s', (id) => {
    const s = games[id];
    const grid = gridOf(s);
    const scene = sceneOf(s, 64);
    const land: [number, number][] = [];
    for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) if (!isWater(s, x, y)) land.push([x, y]);

    it('marks the edges facing water, in the outline order of edgeCorners', () => {
      for (const [x, y] of land) {
        const edges = waterEdges(s, grid, x, y);
        const o = grid.neighbourOffsets(x, y);
        const expected = new Array(6).fill(false);
        for (let d = 0; d < 6; d++) if (isWater(s, x + o[2 * d], y + o[2 * d + 1])) expected[edgeCorners(grid, d)[0]] = true;
        expect(edges).toEqual(expected);
      }
    });

    it('rounds a land hex corner exactly where both edges meeting there face water', () => {
      let rounded = 0;
      for (const [x, y] of land) {
        const edges = waterEdges(s, grid, x, y);
        const ctx = recorder();
        hexLandPath(ctx, scene, x, y, 64);
        const arcs = ctx.calls.filter((c) => c.name === 'arcTo');
        expect(arcs).toHaveLength(6);
        // arcTo k (k = 1..6) goes round corner k % 6, between edges k - 1 and k.
        arcs.forEach((c, i) => {
          const k = i + 1;
          const round = edges[(k - 1) % 6] && edges[k % 6];
          expect((c.args[4] as number) > 0).toBe(round);
          if (round) rounded++;
        });
        expect(ctx.calls.at(-1)?.name).toBe('closePath');
      }
      expect(rounded).toBeGreaterThan(0);
    });

    it('inks the coast along water edges only', () => {
      let inked = 0;
      for (const [x, y] of land) {
        const edges = waterEdges(s, grid, x, y);
        const ctx = recorder();
        hexCoastPath(ctx, scene, x, y, 64);
        if (!edges.some(Boolean)) expect(ctx.calls).toHaveLength(0);
        else {
          expect(ctx.calls.length).toBeGreaterThan(0);
          inked++;
        }
      }
      expect(inked).toBeGreaterThan(0);
    });

    it('draws each border between different land terrains once', () => {
      const tiles = land.map(([x, y]) => ({ x, y }));
      const ctx = recorder();
      hexBorders(ctx, scene, tiles);
      const pairs = new Set<string>();
      for (const [x, y] of land) {
        const o = grid.neighbourOffsets(x, y);
        for (let d = 0; d < 6; d++) {
          const nx = x + o[2 * d];
          const ny = y + o[2 * d + 1];
          if (nx < 0 || ny < 0 || nx >= s.map.width || ny >= s.map.height || isWater(s, nx, ny)) continue;
          if (s.map.tiles[ny * s.map.width + nx].t === s.map.tiles[y * s.map.width + x].t) continue;
          const a = y * s.map.width + x;
          const b = ny * s.map.width + nx;
          pairs.add(a < b ? `${a}-${b}` : `${b}-${a}`);
        }
      }
      expect(pairs.size).toBeGreaterThan(0);
      expect(ctx.calls.filter((c) => c.name === 'lineTo')).toHaveLength(pairs.size);
      // A hook that blends every border leaves none.
      const none = recorder();
      hexBorders(none, scene, tiles, () => true);
      expect(none.calls).toHaveLength(0);
    });

    it('renders a played game at several zooms without errors', () => {
      const ctx = recorder();
      const r = ligneClaire.createMapRenderer(fakeCanvas(ctx));
      for (const zoom of [12, 48, 120]) r.render({ ...sceneOf(s, zoom), hover: { x: 3, y: 3 }, labels: true });
      r.dispose();
      expect(ctx.calls.length).toBeGreaterThan(1000);
      expect(ctx.calls.some((c) => c.name === 'arcTo')).toBe(true);
    });

    it('offers every layer to its hooks, with the hex outline as the shape', () => {
      const count: Record<string, number> = {};
      const shapes: Record<string, number> = {};
      const hit = (k: string) => (...args: unknown[]) => {
        count[k] = (count[k] ?? 0) + 1;
        if (typeof args[3] === 'function') shapes[k] = (shapes[k] ?? 0) + 1;
        return false;
      };
      const hooks: MapLayerHooks = {
        water: hit('water'),
        land: hit('land'),
        relief: hit('relief'),
        road: hit('road'),
        bonus: hit('bonus'),
        settlement: hit('settlement'),
        colony: hit('colony'),
        unit: hit('unit'),
        shore: () => {
          count.shore = (count.shore ?? 0) + 1;
        },
      };
      const ctx = recorder();
      ligneClaire.createMapRenderer(fakeCanvas(ctx), hooks).render(sceneOf(s, 24));
      for (const k of ['water', 'land', 'relief', 'settlement', 'colony', 'unit', 'shore']) expect(count[k], k).toBeGreaterThan(0);
      // On hexes the water hook is given the hex outline too (a square sprite must be clipped to it).
      expect(shapes.water).toBe(count.water);
      expect(shapes.land).toBe(count.land);
    });
  });
});
