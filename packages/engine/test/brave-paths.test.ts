import { describe, expect, it } from 'vitest';
import {
  braveRoute,
  bravesOf,
  buildIndex,
  createGame,
  createUnit,
  foundColony,
  processBraves,
  removeUnit,
  tileAt,
  SQUARE,
  type Brave,
  type GameState,
  type Settlement,
} from '../src/index.js';
import { unitList } from '../src/unitindex.js';

/**
 * A game with one settlement alone on open plains (no forest, rivers, roads or rumours) for eight
 * tiles round it, no other settlements, units or braves there; and that settlement, its braves'
 * timer held so that none set out on their own.
 */
function openGround(): { s: GameState; st: Settlement } {
  const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: [] });
  const R = 8;
  const st = Object.values(s.settlements).find((o) => o.x >= R && o.y >= R && o.x < s.map.width - R && o.y < s.map.height - R)!;
  expect(st).toBeDefined();
  for (let y = st.y - R; y <= st.y + R; y++)
    for (let x = st.x - R; x <= st.x + R; x++) {
      const t = tileAt(s, x, y)!;
      t.t = 'plains';
      for (const k of ['f', 'r', 'rv', 'rd', 'lcr', 'claim', 'use', 'p', 'b'] as const) delete t[k];
    }
  for (const id of Object.keys(s.settlements)) if (id !== st.id && SQUARE.distance(s.settlements[id].x, s.settlements[id].y, st.x, st.y) <= R + 1) delete s.settlements[id];
  for (const u of unitList(s)) if (u.loc.kind === 'map' && SQUARE.distance(u.loc.x, u.loc.y, st.x, st.y) <= R + 1) removeUnit(s, u.id);
  s.braves = {};
  st.braveTimer = 1000;
  return { s, st };
}

/**
 * An English colony three tiles east of the settlement and English soldiers on the two tiles north
 * and south of it: a wall five tiles long that a brave walking straight at its target cannot pass.
 */
function wall(s: GameState, st: Settlement): void {
  const founder = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: st.x + 3, y: st.y });
  founder.moves = 3;
  foundColony(s, founder.id, 'Wallton');
  for (const dy of [-2, -1, 1, 2]) createUnit(s, 'england', 'freeColonist', { kind: 'map', x: st.x + 3, y: st.y + dy }).role = 'soldier';
}

function brave(s: GameState, st: Settlement, x: number, y: number, extra: Partial<Brave> = {}): Brave {
  const b: Brave = { id: `bt${Object.keys(bravesOf(s)).length}`, tribe: st.tribe, home: st.id, x, y, ...extra };
  bravesOf(s)[b.id] = b;
  return b;
}

describe('brave paths', () => {
  it('a brave goes round a colony and the units beside it to get home', () => {
    const { s, st } = openGround();
    wall(s, st);
    const b = brave(s, st, st.x + 5, st.y);
    const route = braveRoute(s, b, st.x, st.y, true, buildIndex(s))!;
    expect(route).not.toBeNull();
    // Round the end of the wall, never through it.
    for (const p of route) expect(p.x === st.x + 3 && Math.abs(p.y - st.y) <= 2).toBe(false);
    expect(route.some((p) => p.x === st.x + 3 && Math.abs(p.y - st.y) === 3)).toBe(true);
    expect(route[route.length - 1]).toEqual({ x: st.x, y: st.y });
    // Walking it (one plains step a round on foot), the brave is home within the route's length.
    let rounds = 0;
    while ((b.x !== st.x || b.y !== st.y) && rounds < 20) {
      processBraves(s);
      rounds++;
    }
    expect({ x: b.x, y: b.y }).toEqual({ x: st.x, y: st.y });
    expect(rounds).toBe(route.length);
  });

  it('a brave goes round a colony to its target and attacks it', () => {
    const { s, st } = openGround();
    wall(s, st);
    const enemy = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: st.x + 1, y: st.y + 1 });
    const b = brave(s, st, st.x + 5, st.y, { task: { kind: 'attack', unitId: enemy.id } });
    for (let i = 0; i < 6 && bravesOf(s)[b.id]?.task; i++) processBraves(s);
    // The task ends with the attack (the brave won, or was killed, or the colonist died).
    expect(bravesOf(s)[b.id]?.task).toBeUndefined();
    const after = bravesOf(s)[b.id];
    if (after) expect(SQUARE.distance(after.x, after.y, st.x + 1, st.y + 1)).toBeLessThanOrEqual(1);
  });

  it('a brave with no way to its target gives the task up', () => {
    const { s, st } = openGround();
    const enemy = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: st.x + 4, y: st.y });
    // English soldiers on every tile round the French colonist.
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) createUnit(s, 'england', 'freeColonist', { kind: 'map', x: st.x + 4 + dx, y: st.y + dy }).role = 'soldier';
    const b = brave(s, st, st.x, st.y - 1, { task: { kind: 'attack', unitId: enemy.id } });
    expect(braveRoute(s, b, st.x + 4, st.y, false, buildIndex(s))).toBeNull();
    processBraves(s);
    expect(b.task).toBeUndefined();
  });
});
