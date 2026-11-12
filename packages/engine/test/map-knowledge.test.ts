/**
 * Beta 3, step 10b (docs/design/native-nations.md section 16): knowledge of the land, explored and
 * shared. A hidden test scenario, the Americas with the Iroquois and the Cherokee playable and
 * `mechanics.mapKnowledge` on: a people knows unclaimed land (T13) only once it has seen it, peoples
 * share their maps when they meet (not with an enemy, a Combative people or the enemy of an ally),
 * and computer peoples' runners explore. The Americas have none of it.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  CARIBBEAN,
  NORTH_EAST,
  PEOPLE_BUILDINGS,
  PEOPLE_PROFILES,
  PEOPLE_UNIT_TYPES,
  RIVER_MOVE_COST,
  applyCommand,
  createGame,
  createUnit,
  knownLand,
  landSeen,
  makePairTreaty,
  mapSharingBar,
  moveCost,
  processPeopleDiplomacy,
  registerScenario,
  shareMaps,
  standingOf,
  standingWith,
  startWar,
  tileAt,
  TERRAIN,
  type AiLevel,
  type GameConfig,
  type GameState,
  type Scenario,
  type Tile,
} from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { colonyList } from '../src/unitindex.js';

const GAME: Scenario = {
  ...AMERICAS,
  id: 'test-map-knowledge',
  name: 'Map knowledge test',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    playable: [
      { id: 'iroquois', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] },
      { id: 'cherokee', name: 'the Cherokee', adjective: 'Cherokee', townNames: ['Chota', 'Tellico', 'Echota'] },
    ],
  },
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
  mechanics: { ...AMERICAS.mechanics, mapKnowledge: { seen: true, share: { homeland: 3, every: 10 }, range: 8 } },
};
registerScenario(GAME);

/** The same game where computer peoples keep their runners home. */
const HOMEBOUND: Scenario = { ...GAME, id: 'test-map-knowledge-home', mechanics: { ...GAME.mechanics, mapKnowledge: { seen: true, share: false, range: 0 } } };
registerScenario(HOMEBOUND);

function config(over: Partial<GameConfig> = {}, cherokee: AiLevel = 'competent'): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: ['iroquois'],
    ai: { england: 'creative', france: 'combative', netherlands: 'competent', iroquois: 'competent', cherokee },
    peoples: ['iroquois', 'cherokee'],
    scenario: GAME.id,
    colonyCharter: true,
    ...over,
  };
}

const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const explored = (s: GameState, id: string) => (player(s, id).explored as ArrayLike<number> as number[]).reduce((n, v) => n + v, 0);

/** Makes `a` see a town of `b` (first contact), and gives `b` a tile of its own nobody else knows. */
function meet(s: GameState, a: string, b: string): number {
  const w = s.map.width;
  const town = colonyList(s).find((c) => c.owner === b)!;
  player(s, a).explored[town.y * w + town.x] = 1;
  const pb = player(s, b);
  const pa = player(s, a);
  for (let i = 0; i < pb.explored.length; i++) {
    if (!pb.explored[i] && !pa.explored[i]) {
      pb.explored[i] = 1;
      return i;
    }
  }
  throw new Error('no unknown tile');
}

describe('knowing the land once seen (mapKnowledge.seen)', () => {
  it('unclaimed land is known only once seen; own claimed land always; the Americas and the Caribbean ask nothing', () => {
    const tile: Tile = { t: 'hills' };
    expect(knownLand(tile, 'iroquois')).toBe(true);
    expect(knownLand(tile, 'iroquois', false)).toBe(false);
    expect(knownLand({ t: 'hills', claim: 'iroquois' }, 'iroquois', false)).toBe(true);
    expect(knownLand({ t: 'hills', claim: 'england' }, 'iroquois', true)).toBe(false);
    for (const sc of [AMERICAS, CARIBBEAN]) expect(sc.mechanics.mapKnowledge).toBeFalsy();
    expect(NORTH_EAST.mechanics.mapKnowledge).toMatchObject({ seen: true });
    const s = createGame(config());
    expect(landSeen(s, 'iroquois')).toBe(player(s, 'iroquois').explored);
  });

  it('a unit pays the terrain on unclaimed land it has not seen, and the river cost once it has', () => {
    const s = createGame(config());
    const grid = gridOf(s);
    const w = s.map.width;
    // An unclaimed, unplowed hills or forest tile beside unclaimed land, both unseen by the people.
    let found: { fx: number; fy: number; tx: number; ty: number } | undefined;
    for (let y = 2; y < s.map.height - 2 && !found; y++) {
      for (let x = 2; x < w - 2 && !found; x++) {
        const t = tileAt(s, x, y)!;
        if (TERRAIN[t.t].water || t.claim || t.p || t.r || t.rv || player(s, 'iroquois').explored[y * w + x]) continue;
        if (!(t.f || TERRAIN[t.t].moveCost > RIVER_MOVE_COST)) continue;
        const from = grid.tilesWithin(s.map, x, y, 1).find((q) => grid.distance(q.x, q.y, x, y) === 1 && !TERRAIN[tileAt(s, q.x, q.y)!.t].water && !tileAt(s, q.x, q.y)!.r);
        if (from) found = { fx: from.x, fy: from.y, tx: x, ty: y };
      }
    }
    const { fx, fy, tx, ty } = found!;
    const u = createUnit(s, 'iroquois', 'townsperson', { kind: 'map', x: fx, y: fy });
    expect(moveCost(s, u, fx, fy, tx, ty)).toBeGreaterThan(RIVER_MOVE_COST);
    player(s, 'iroquois').explored[ty * w + tx] = 1;
    expect(moveCost(s, u, fx, fy, tx, ty)).toBe(RIVER_MOVE_COST);
  });
});

describe('peoples share their maps when they meet (mapKnowledge.share)', () => {
  it('two playing peoples each give the other what they have explored, once met, and tell the person', () => {
    const s = createGame(config());
    const only = meet(s, 'iroquois', 'cherokee');
    const before = explored(s, 'iroquois');
    processPeopleDiplomacy(s);
    expect(standingOf(s, 'iroquois', 'cherokee')!.maps).toBe(s.turn);
    expect(player(s, 'iroquois').explored[only]).toBe(1);
    expect(explored(s, 'iroquois')).toBeGreaterThan(before);
    // Each now knows all the other knew.
    const a = player(s, 'iroquois').explored;
    const b = player(s, 'cherokee').explored;
    for (let i = 0; i < a.length; i++) if (b[i]) expect(a[i]).toBe(1);
    expect(s.messages.some((m) => m.to === 'iroquois' && /You and the Cherokee share what you know of the land: \d+ tiles? added to your map\./.test(m.text))).toBe(true);
    // Not again until `every` years have passed.
    const more = meet(s, 'cherokee', 'iroquois');
    shareMaps(s);
    expect(player(s, 'iroquois').explored[more]).toBe(1);
    expect(player(s, 'cherokee').explored[more]).toBe(0);
    s.turn += 10;
    shareMaps(s);
    expect(player(s, 'cherokee').explored[more]).toBe(1);
  });

  it('not at war, not with a Combative computer people, not with the enemy of an ally', () => {
    const war = createGame(config());
    meet(war, 'iroquois', 'cherokee');
    startWar(war, 'iroquois', 'cherokee');
    processPeopleDiplomacy(war);
    expect(standingOf(war, 'iroquois', 'cherokee')!.maps).toBeUndefined();
    expect(mapSharingBar(war, 'iroquois', 'cherokee')).toBe('at war');

    expect(PEOPLE_PROFILES.combative.shareMaps).toBe(false);
    const combative = createGame(config({}, 'combative'));
    meet(combative, 'iroquois', 'cherokee');
    processPeopleDiplomacy(combative);
    expect(standingOf(combative, 'iroquois', 'cherokee')!.maps).toBeUndefined();
    expect(mapSharingBar(combative, 'cherokee', 'iroquois')).toBe('keeps its maps');

    const ally = createGame(config());
    standingWith(ally, 'iroquois', 'england');
    makePairTreaty(ally, 'iroquois', 'england', 'people-trade');
    makePairTreaty(ally, 'iroquois', 'england', 'defence');
    // The Cherokee at war with England (set directly: a declared war would draw the Haudenosaunee in by their pact).
    player(ally, 'cherokee').stance.england = 'war';
    player(ally, 'england').stance.cherokee = 'war';
    expect(mapSharingBar(ally, 'iroquois', 'cherokee')).toBe('at war with an ally');
    // Once the war ends, they share.
    player(ally, 'cherokee').stance.england = 'peace';
    player(ally, 'england').stance.cherokee = 'peace';
    expect(mapSharingBar(ally, 'iroquois', 'cherokee')).toBeUndefined();
  });

  it('a people nobody plays gives a playing people its homeland, the land around its settlements', () => {
    const s = createGame(config());
    const w = s.map.width;
    const st = Object.values(s.settlements).find((x) => !player(s, 'iroquois').explored[x.y * w + x.x])!;
    player(s, 'iroquois').explored[st.y * w + st.x] = 1;
    processPeopleDiplomacy(s);
    expect(standingOf(s, 'iroquois', st.tribe)!.maps).toBe(s.turn);
    const grid = gridOf(s);
    for (const q of grid.tilesWithin(s.map, st.x, st.y, 3)) expect(player(s, 'iroquois').explored[q.y * w + q.x]).toBe(1);
  });
});

describe("computer peoples' runners explore (mapKnowledge.range)", () => {
  it('a computer people knows more of the map after some years when its runners explore than when they stay home', () => {
    const run = (scenario: string) => {
      const s = createGame(config({ humans: [], scenario }));
      const start = explored(s, 'iroquois');
      for (let i = 0; i < 12; i++) {
        const r = applyCommand(s, { type: 'endTurn' });
        if (!r.ok) throw new Error(r.error);
      }
      return { start, end: explored(s, 'iroquois'), s };
    };
    const out = run(GAME.id);
    const home = run(HOMEBOUND.id);
    expect(out.end).toBeGreaterThan(home.end);
    expect(out.end).toBeGreaterThan(out.start);
    // The state stays a plain JSON tree.
    expect(JSON.parse(JSON.stringify(out.s))).toEqual(out.s);
  });
});
