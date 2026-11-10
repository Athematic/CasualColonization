import { createGame, deserialize, RIVER_DIRS, serialize, TERRAIN, type GameState } from '@cc/engine';
import { describe, expect, it } from 'vitest';
import { hubOffset, RIVER_MEANDER, riverCourse, ROAD_MEANDER, roadStrands, strandPoints, type Strand } from '../src/index.js';

const game = createGame({ seed: 7, mapSize: 'medium', map: 'north-america', nations: ['england'], humans: ['england'] });

function riverTiles(s: GameState): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < s.map.tiles.length; i++) if (s.map.tiles[i].rv) out.push([i % s.map.width, Math.floor(i / s.map.width)]);
  return out;
}

/** Distance of a point from the segment between the tile's centre and the neighbour's centre. */
function offLine(p: [number, number], st: Strand): number {
  const [dx, dy] = [st.dx, st.dy];
  const t = Math.max(0, Math.min(1, (p[0] * dx + p[1] * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - dx * t, p[1] - dy * t);
}

/** Unit direction the strand runs in at its meeting point. */
const endTangent = (st: Strand) => {
  const l = Math.hypot(st.ex - st.c2x, st.ey - st.c2y);
  return [(st.ex - st.c2x) / l, (st.ey - st.c2y) / l];
};

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

/** Every strand towards a neighbour that has the matching strand back meets it end to end, running the same way. */
function checkJoins(strandsAt: (x: number, y: number) => Strand[], tiles: [number, number][]): number {
  let joins = 0;
  for (const [x, y] of tiles) {
    for (const st of strandsAt(x, y)) {
      const back = strandsAt(x + st.dx, y + st.dy).find((b) => b.dir === (st.dir + 4) % 8);
      if (!back) continue;
      joins++;
      close(st.ex, back.ex + st.dx);
      close(st.ey, back.ey + st.dy);
      const [ax, ay] = endTangent(st);
      const [bx, by] = endTangent(back);
      close(ax, -bx);
      close(ay, -by);
    }
  }
  return joins;
}

describe('meandering rivers and roads', () => {
  const tiles = riverTiles(game);

  it('gives the same tile the same curve, whatever the tile objects', () => {
    const copy = deserialize(serialize(game));
    expect(tiles.length).toBeGreaterThan(100);
    for (const [x, y] of tiles) {
      const a = riverCourse(game, x, y);
      expect(riverCourse(game, x, y)).toBe(a);
      expect(riverCourse(copy, x, y)).toEqual(a);
    }
  });

  it('joins river strands of neighbouring tiles at the same point with the same direction', () => {
    expect(checkJoins((x, y) => riverCourse(game, x, y).strands, tiles)).toBeGreaterThan(100);
  });

  it('ends a river on the middle of the coastal edge at its mouth, running straight out', () => {
    let mouths = 0;
    for (const [x, y] of tiles)
      for (const st of riverCourse(game, x, y).strands) {
        if (!st.mouth) continue;
        mouths++;
        close(st.ex, st.dx / 2);
        close(st.ey, st.dy / 2);
        const [tx, ty] = endTangent(st);
        const l = Math.hypot(st.dx, st.dy);
        close(tx, st.dx / l);
        close(ty, st.dy / l);
      }
    expect(mouths).toBeGreaterThan(5);
  });

  it('wanders a little, but within bounds', () => {
    let widest = 0;
    for (const [x, y] of tiles) {
      const [hx, hy] = hubOffset(x, y, RIVER_MEANDER, 0);
      expect(Math.hypot(hx, hy)).toBeLessThanOrEqual(RIVER_MEANDER + 1e-12);
      const course = riverCourse(game, x, y);
      for (const st of course.strands) {
        expect(Math.hypot(st.sx, st.sy)).toBeLessThanOrEqual(RIVER_MEANDER + 1e-12);
        // A straight stream stays close to the line between the tile centres.
        const straight = course.main && course.main.includes(st) && course.main[0].dir === (course.main[1].dir + 4) % 8;
        if (!straight) continue;
        for (const p of strandPoints(st, 16)) {
          const d = offLine(p, st);
          widest = Math.max(widest, d);
          expect(d).toBeLessThan(RIVER_MEANDER * 1.2);
        }
      }
    }
    // ...and does not run dead straight.
    expect(widest).toBeGreaterThan(RIVER_MEANDER * 0.5);
  });

  it('joins roads end to end, and runs them along a river on the river curve', () => {
    const s = deserialize(serialize(game));
    const roads: [number, number][] = [];
    for (let y = 30; y <= 40; y++)
      for (let x = 26; x <= 40; x++)
        if (!TERRAIN[s.map.tiles[y * s.map.width + x].t].water) {
          s.map.tiles[y * s.map.width + x].r = true;
          roads.push([x, y]);
        }
    const mask = (x: number, y: number) =>
      RIVER_DIRS.reduce((m, [dx, dy], i) => (s.map.tiles[(y + dy) * s.map.width + x + dx]?.r ? m | (1 << i) : m), 0);
    const at = (x: number, y: number) => (s.map.tiles[y * s.map.width + x]?.r ? roadStrands(s, x, y, mask(x, y)) : []);
    expect(checkJoins(at, roads)).toBeGreaterThan(500);
    let along = 0;
    for (const [x, y] of roads) {
      const river = riverCourse(s, x, y);
      for (const st of at(x, y)) {
        expect(Math.hypot(st.sx, st.sy)).toBeLessThanOrEqual(Math.max(RIVER_MEANDER, ROAD_MEANDER) + 1e-12);
        const r = river.strands.find((rs) => rs.dir === st.dir);
        if (r) {
          along++;
          expect(st).toBe(r);
        }
      }
    }
    expect(along).toBeGreaterThan(5);
    // The same tile and links give the same road.
    const [x, y] = roads[0];
    expect(roadStrands(s, x, y, mask(x, y))).toBe(at(x, y));
  });
});
