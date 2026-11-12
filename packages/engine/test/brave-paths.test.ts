import { describe, expect, it } from 'vitest';
import {
  braveDefending,
  braveRoute,
  braveStepCost,
  bravesOf,
  buildIndex,
  createGame,
  createUnit,
  firstMeetingText,
  foundColony,
  isExplored,
  meetPeople,
  moveCost,
  processBraves,
  removeUnit,
  reveal,
  setFeatureSink,
  tileAt,
  FOREST_MOVE_COST,
  RIVER_MOVE_COST,
  ROAD_MOVE_COST,
  SQUARE,
  TRIBES,
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

describe('braves moving to defend', () => {
  it('are those set against an enemy unit (their own land or a partner), not raids, visits, trade or demands', () => {
    const b = (task: Brave['task']): Brave => ({ id: 'b', tribe: 'arawak', home: 'x', x: 0, y: 0, task });
    expect(braveDefending(b({ kind: 'attack', unitId: 'u1' }))).toBe(true);
    expect(braveDefending(b({ kind: 'attack', unitId: 'u1', defend: 'england' }))).toBe(true);
    expect(braveDefending(b({ kind: 'attack', colonyId: 'c1' }))).toBe(false);
    expect(braveDefending(b({ kind: 'visit', colonyId: 'c1', purpose: 'trade' }))).toBe(false);
    expect(braveDefending(b({ kind: 'visit', colonyId: 'c1', purpose: 'demand' }))).toBe(false);
    expect(braveDefending(b({ kind: 'wander', turns: 2 }))).toBe(false);
    expect(braveDefending(b(undefined))).toBe(false);
  });

  it('step at the river cost on open land, forest and mountains, and the road cost on a road', () => {
    const { s, st } = openGround();
    const x = st.x + 2;
    const y = st.y;
    const t = tileAt(s, x, y)!;
    const step = (defending: boolean) => braveStepCost(s, x - 1, y, x, y, defending);
    expect(step(false)).toBe(3);
    expect(step(true)).toBe(RIVER_MOVE_COST);
    t.f = true;
    expect(step(false)).toBe(FOREST_MOVE_COST);
    expect(step(true)).toBe(RIVER_MOVE_COST);
    delete t.f;
    t.t = 'mountains';
    expect(step(true)).toBe(RIVER_MOVE_COST);
    t.t = 'plains';
    // A road needs both ends, as for units.
    t.r = true;
    expect(step(false)).toBe(3);
    expect(step(true)).toBe(RIVER_MOVE_COST);
    tileAt(s, x - 1, y)!.r = true;
    expect(step(false)).toBe(ROAD_MOVE_COST);
    expect(step(true)).toBe(ROAD_MOVE_COST);
  });
  it('cover three plains tiles a round on foot, for their own land or a partner, where a raiding or visiting brave covers one', () => {
    const { s, st } = openGround();
    const enemy = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: st.x + 6, y: st.y });
    // Against an enemy near their own land (nearbyEnemy sets no partner) and for a partner (N7).
    const own = brave(s, st, st.x, st.y - 1, { task: { kind: 'attack', unitId: enemy.id } });
    const partner = brave(s, st, st.x - 1, st.y, { task: { kind: 'attack', unitId: enemy.id, defend: 'england' } });
    const founder = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: st.x - 6, y: st.y });
    founder.moves = 3;
    const c = foundColony(s, founder.id, 'Raidville');
    const raider = brave(s, st, st.x, st.y + 1, { task: { kind: 'attack', colonyId: c.id } });
    const trader = brave(s, st, st.x + 1, st.y + 1, { task: { kind: 'visit', colonyId: c.id, purpose: 'trade' } });
    processBraves(s);
    expect(SQUARE.distance(own.x, own.y, st.x, st.y - 1)).toBe(3);
    expect(SQUARE.distance(partner.x, partner.y, st.x - 1, st.y)).toBe(3);
    expect(SQUARE.distance(raider.x, raider.y, st.x, st.y + 1)).toBe(1);
    expect(SQUARE.distance(trader.x, trader.y, st.x + 1, st.y + 1)).toBe(1);
  });

  it('include braves of a people at war that set out against an enemy near their settlement', () => {
    const { s, st } = openGround();
    s.tribes.find((t) => t.id === st.tribe)!.stance.france = 'war';
    const enemy = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: st.x + 3, y: st.y });
    enemy.role = 'soldier';
    st.braveTimer = 0;
    // The brave sets out and attacks in the same round (three steps at defence speed); catch it attacking.
    let set: Brave | undefined;
    const prev = setFeatureSink((_nation, feature) => {
      if (feature === 'natives:unit attacked') set = Object.values(bravesOf(s)).find((b) => b.task?.kind === 'attack' && b.task.unitId === enemy.id);
    });
    try {
      for (let i = 0; i < 40 && !set; i++) processBraves(s);
    } finally {
      setFeatureSink(prev);
    }
    expect(set).toBeDefined();
    expect(set!.task).toEqual({ kind: 'attack', unitId: enemy.id });
    expect(braveDefending(set!)).toBe(true);
  });
});

describe('braves follow rivers as units do', () => {
  /** A minor river from (x, y) east to (x + 1, y), both tiles forest; the river links them (and any river already there). */
  function river(s: GameState, x: number, y: number): void {
    const a = tileAt(s, x, y)!;
    const b = tileAt(s, x + 1, y)!;
    a.f = b.f = true;
    a.rv = b.rv = 1;
    a.rd = (a.rd ?? 0) | (1 << 2); // east (grid.ts direction order: n, ne, e, se, s, sw, w, nw)
    b.rd = (b.rd ?? 0) | (1 << 6); // west
  }

  it('a step along a river costs the river cost, as for a unit; a step onto a river tile it does not link costs the tile', () => {
    const { s, st } = openGround();
    const x = st.x + 2;
    const y = st.y;
    river(s, x, y);
    const unit = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: st.x - 4, y: st.y - 4 });
    // Along the river, both ways.
    expect(braveStepCost(s, x, y, x + 1, y, false)).toBe(RIVER_MOVE_COST);
    expect(braveStepCost(s, x + 1, y, x, y, false)).toBe(RIVER_MOVE_COST);
    expect(braveStepCost(s, x, y, x + 1, y, false)).toBe(moveCost(s, unit, x, y, x + 1, y));
    // Onto the river from the side (the river does not link the tiles): the forest's cost.
    expect(braveStepCost(s, x, y + 1, x, y, false)).toBe(FOREST_MOVE_COST);
    expect(braveStepCost(s, x, y + 1, x, y, false)).toBe(moveCost(s, unit, x, y + 1, x, y));
    // Off the river onto plains: the plains' cost.
    expect(braveStepCost(s, x + 1, y, x + 2, y, false)).toBe(3);
  });

  it('a raiding brave walks along a river three tiles a round where it walks one across the forest', () => {
    const { s, st } = openGround();
    const y = st.y + 2;
    // A river along four forest tiles south-east of the settlement, eastwards.
    for (let x = st.x; x < st.x + 4; x++) river(s, x, y);
    const founder = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: st.x + 7, y });
    founder.moves = 3;
    const c = foundColony(s, founder.id, 'Rivermouth');
    const raider = brave(s, st, st.x, y, { task: { kind: 'attack', colonyId: c.id } });
    processBraves(s);
    expect({ x: raider.x, y: raider.y }).toEqual({ x: st.x + 3, y });
  });

  it('a defending brave steps at the river cost along a river, off it, and on a road (the cheaper wins)', () => {
    const { s, st } = openGround();
    const x = st.x + 2;
    const y = st.y;
    river(s, x, y);
    expect(braveStepCost(s, x, y, x + 1, y, true)).toBe(RIVER_MOVE_COST);
    expect(braveStepCost(s, x, y + 1, x, y, true)).toBe(RIVER_MOVE_COST);
    tileAt(s, x, y + 1)!.r = tileAt(s, x, y + 2)!.r = true;
    expect(braveStepCost(s, x, y + 2, x, y + 1, true)).toBe(ROAD_MOVE_COST);
    expect(braveStepCost(s, x, y + 2, x, y + 1, true)).toBeLessThanOrEqual(RIVER_MOVE_COST);
  });
});

describe('the first meeting with a people', () => {
  const LINE = 'Their braves know the land so well that they move swiftly when they defend it.';

  it('tells a person once per people, when a settlement is first seen or a brave first comes; computer players are not told', () => {
    const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['england'] });
    const meetings = (nation: string) => s.messages.filter((m) => m.to === nation && m.text.includes(LINE));
    // A people with two settlements England has not seen, apart, and which it has not met.
    const unseen = Object.values(s.settlements).filter((st) => !isExplored(s, 'england', st.x, st.y) && !isExplored(s, 'france', st.x, st.y));
    let st: Settlement | undefined;
    let other: Settlement | undefined;
    for (const a of unseen) {
      other = unseen.find((o) => o.tribe === a.tribe && o.id !== a.id && SQUARE.distance(o.x, o.y, a.x, a.y) > 4);
      if (other && !s.tribes.find((t) => t.id === a.tribe)!.met) {
        st = a;
        break;
      }
    }
    expect(st && other).toBeDefined();
    const before = meetings('england').length;
    reveal(s, 'england', st!.x, st!.y, 1);
    const told = meetings('england');
    expect(told.length).toBe(before + 1);
    const last = told[told.length - 1];
    expect(last.text).toBe(firstMeetingText(s, st!.tribe));
    expect(last.text).toBe(`You have met the ${TRIBES[st!.tribe].name}. ${LINE}`);
    expect(last.at).toEqual({ x: st!.x, y: st!.y });
    expect(s.tribes.find((t) => t.id === st!.tribe)!.met).toEqual(['england']);
    // Another settlement of the same people, a brave come to the colonies: no second telling.
    reveal(s, 'england', other!.x, other!.y, 1);
    meetPeople(s, 'england', st!.tribe, st);
    expect(meetings('england').length).toBe(before + 1);
    // France, a computer player, is never told and nothing is written for it.
    reveal(s, 'france', st!.x, st!.y, 1);
    meetPeople(s, 'france', st!.tribe, st);
    expect(meetings('france')).toHaveLength(0);
    expect(s.tribes.find((t) => t.id === st!.tribe)!.met).toEqual(['england']);
  });

  it('tells a person whose colony a brave reaches, if no settlement of its people told it first', () => {
    const { s, st } = openGround();
    const founder = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: st.x + 2, y: st.y });
    founder.moves = 3;
    const c = foundColony(s, founder.id, 'Welcome');
    // England, played by a computer when it saw the settlement, is now a person's.
    s.players.find((p) => p.id === 'england')!.human = true;
    const tribe = s.tribes.find((t) => t.id === st.tribe)!;
    expect(tribe.met).toBeUndefined();
    const before = s.messages.length;
    brave(s, st, st.x + 1, st.y, { task: { kind: 'visit', colonyId: c.id, purpose: 'gift' } });
    processBraves(s);
    processBraves(s);
    const after = s.messages.slice(before);
    const told = after.filter((m) => m.text === firstMeetingText(s, st.tribe));
    expect(told).toHaveLength(1);
    expect(told[0].to).toBe('england');
    expect(tribe.met).toEqual(['england']);
    // The meeting comes before the gift's own message.
    const gift = after.findIndex((m) => m.text.includes('as a gift'));
    expect(gift).toBeGreaterThan(after.indexOf(told[0]));
  });
});
