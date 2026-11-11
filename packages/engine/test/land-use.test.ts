/**
 * Beta 2, step 2 (docs/design/native-partners.md, section 5): land use with a people
 * (`land-use`, a lease, N5): unlocking on the ladder (N2, N3), proposals and the people's answers
 * (N8), working a leased tile, the yearly rent and its lapse, the people still gathering from
 * leased land at half rate, colonies on leased land pressing half as hard, buying a leased tile
 * against taking one, computer players (N11) and the switch.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  allTreaties,
  applyCommand,
  assignJob,
  buyLand,
  colonyOccupancy,
  colonySiteProblem,
  createGame,
  createUnit,
  deserialize,
  foundColony,
  gridOf,
  hasLandUse,
  hasPeopleTrade,
  landPrice,
  landUseThreshold,
  landUseTreaty,
  landUseUnlocked,
  leasableTiles,
  leasedFromBeside,
  leasedTiles,
  leaseRent,
  leaseTerms,
  makePeopleTreaty,
  nativeLandOwner,
  peopleRelation,
  peopleTradeThresholds,
  peopleTreatyProblem,
  player,
  processNatives,
  proposePeopleTreaty,
  registerScenario,
  serialize,
  settlementProduce,
  takeLand,
  tileAt,
  tileWorkedBy,
  turnAfterYears,
  calendarOf,
  workArea,

  type Colony,
  type GameState,
  type NationId,
  type Scenario,
  type Settlement,
  PEOPLE_TREATY_RULES,
  LEVEL_COOPERATION,
} from '../src/index.js';
import { colonyList } from '../src/unitindex.js';

/** The Americas with trade treaties and land use switched on, and peoples that always say yes when free to (hidden, for these tests). */
const LAND: Scenario = {
  ...AMERICAS,
  id: 'test-land-use',
  name: 'test-land-use',
  hidden: true,
  mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade', 'land-use'] },
  peopleTreaties: { accept: 1 },
};
registerScenario(LAND);

/** The same, with a settlement gathering nothing from leased land, to measure the gathering. */
const NOTHING: Scenario = { ...LAND, id: 'test-land-use-nothing', name: 'test-land-use-nothing', peopleTreaties: { accept: 1, landUse: { gather: 0 } } };
registerScenario(NOTHING);

/** The same, with a lease that costs no fewer years than the trade treaty's, for computer games. */
const QUICK: Scenario = { ...LAND, id: 'test-land-use-quick', name: 'test-land-use-quick', peopleTreaties: { landUse: { years: { base: 2, spread: 1 } } } };
registerScenario(QUICK);

/** The Americas with only trade treaties, as the scenario ships now. */
const TRADE_ONLY: Scenario = { ...AMERICAS, id: 'test-land-use-off', name: 'test-land-use-off', hidden: true, mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade'] } };
registerScenario(TRADE_ONLY);

function game(scenario: string = LAND.id, seed = 42): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans: ['england', 'france'], scenario });
}

function settlementsOf(s: GameState, st: Settlement): Settlement[] {
  return Object.values(s.settlements).filter((o) => o.tribe === st.tribe);
}

/** A colony of `nation` two tiles from a settlement, so some of the settlement's land lies beside it. */
function colonyBeside(s: GameState, nation: NationId, not?: Settlement): { st: Settlement; c: Colony } {
  const grid = gridOf(s);
  for (const st of Object.values(s.settlements)) {
    if (not && st.tribe === not.tribe) continue;
    for (let i = 0; i < s.map.tiles.length; i++) {
      const x = i % s.map.width;
      const y = Math.floor(i / s.map.width);
      if (grid.distance(x, y, st.x, st.y) !== 2 || colonySiteProblem(s, x, y)) continue;
      const land = workArea(s, x, y).filter((p) => nativeLandOwner(s, p.x, p.y)?.tribe === st.tribe);
      if (land.length < 2) continue;
      const u = createUnit(s, nation, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      const c = foundColony(s, u.id, `Test ${nation}`);
      return { st, c };
    }
  }
  throw new Error('no site');
}

/** Good relations long enough for both thresholds, every settlement content, and a trade treaty. */
function partners(s: GameState, nation: NationId, st: Settlement): void {
  const rel = peopleRelation(s, nation, st.tribe);
  const need = peopleTradeThresholds(s, nation, st.tribe);
  rel.volume = need.volume;
  rel.goodSince = 0;
  s.turn = Math.max(s.turn, 200);
  for (const o of settlementsOf(s, st)) o.tension[nation] = 0;
  makePeopleTreaty(s, nation, st.tribe);
}

/** A colony beside a people's land, partners in trade, a lease made, and a worker on a leased tile. */
function leased(s: GameState = game()) {
  const { st, c } = colonyBeside(s, 'england');
  partners(s, 'england', st);
  player(s, 'england').gold = 2000;
  proposePeopleTreaty(s, 'england', st.tribe, 'land-use');
  const tiles = leasedTiles(s, 'england', st.tribe);
  const worker = createUnit(s, 'england', 'expertFarmer', { kind: 'map', x: c.x, y: c.y });
  assignJob(s, worker.id, c.id, { kind: 'tile', x: tiles[0].x, y: tiles[0].y, good: 'food' });
  return { s, st, c, tiles, worker };
}

describe('unlocking land use (N2, N3)', () => {
  it('is off unless the scenario names it', () => {
    const s = game(TRADE_ONLY.id);
    const { st } = colonyBeside(s, 'england');
    partners(s, 'england', st);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toMatch(/no land use treaty with native peoples/);
    expect(() => proposePeopleTreaty(s, 'england', st.tribe, 'land-use')).toThrow();
  });

  it('needs a trade treaty first, then its own years of good relations, drawn per pair', () => {
    const s = game();
    const { st } = colonyBeside(s, 'england');
    const rel = peopleRelation(s, 'england', st.tribe);
    rel.goodSince = 0;
    for (const o of settlementsOf(s, st)) o.tension.england = 0;
    s.turn = 200;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toMatch(/needs a trade treaty/);
    makePeopleTreaty(s, 'england', st.tribe);
    const years = landUseThreshold(s, 'england', st.tribe);
    const r = PEOPLE_TREATY_RULES.landUse.years;
    expect(years).toBeGreaterThanOrEqual(r.base - r.spread);
    expect(years).toBeLessThanOrEqual(r.base + r.spread);
    // The same each time asked, and its own draw: not the trade treaty's.
    expect(landUseThreshold(s, 'england', st.tribe)).toBe(years);
    const others = s.tribes.map((t) => landUseThreshold(s, 'france', t.id));
    expect(new Set(others).size).toBeGreaterThan(1);
    // Too few years: the relations began only lately.
    rel.goodSince = s.turn - 1;
    expect(landUseUnlocked(s, 'england', st.tribe)).toBe(false);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toMatch(/do not know you well enough to lend you land/);
    rel.goodSince = 0;
    expect(landUseUnlocked(s, 'england', st.tribe)).toBe(true);
    player(s, 'england').gold = 5000;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toBeNull();
  });

  it('needs the people\'s land beside a colony, and the first year\'s rent in hand', () => {
    const s = game();
    const { st, c } = colonyBeside(s, 'england');
    partners(s, 'england', st);
    const tiles = leasableTiles(s, 'england', st.tribe);
    expect(tiles.length).toBeGreaterThan(0);
    for (const p of tiles) expect(gridOf(s).distance(p.x, p.y, c.x, c.y)).toBe(1);
    player(s, 'england').gold = 0;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toMatch(/first year's rent/);
    // A people whose land lies beside none of the nation's colonies has nothing to lease.
    const far = s.tribes.find((t) => t.id !== st.tribe && !leasableTiles(s, 'england', t.id).length)!;
    const any = Object.values(s.settlements).find((o) => o.tribe === far.id)!;
    partners(s, 'england', any);
    player(s, 'england').gold = 5000;
    expect(peopleTreatyProblem(s, 'england', far.id, 'land-use')).toMatch(/None of the land/);
  });
});

describe('a lease (N5)', () => {
  it('is answered at once: made with the rent set and the first year paid, the tiles marked', () => {
    const s = game();
    const { st } = colonyBeside(s, 'england');
    partners(s, 'england', st);
    player(s, 'england').gold = 2000;
    const tiles = leasableTiles(s, 'england', st.tribe);
    const rent = leaseRent(s, 'england', tiles);
    const avg = tiles.reduce((n, p) => n + landPrice(s, 'england', p.x, p.y), 0) / tiles.length;
    expect(rent).toBe(Math.max(1, Math.round(avg * PEOPLE_TREATY_RULES.landUse.rent)));
    const gold = settlementsOf(s, st).reduce((n, o) => n + o.gold, 0);
    const text = proposePeopleTreaty(s, 'england', st.tribe, 'land-use');
    expect(text).toMatch(/agree on land use/);
    const t = landUseTreaty(s, 'england', st.tribe)!;
    expect(leaseTerms(t)).toEqual({ kind: 'land-use', rent, due: turnAfterYears(s.turn, 1, calendarOf(s)) });
    expect(player(s, 'england').gold).toBe(2000 - rent * tiles.length);
    expect(settlementsOf(s, st).reduce((n, o) => n + o.gold, 0)).toBe(gold + rent * tiles.length);
    for (const p of tiles) {
      expect(tileAt(s, p.x, p.y)!.use).toBe('england');
      // The land stays the people's.
      expect(nativeLandOwner(s, p.x, p.y)?.tribe).toBe(st.tribe);
    }
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toMatch(/already have a land use treaty/);
  });

  it('is refused while a settlement is angry, as every treaty', () => {
    const s = game();
    const { st } = colonyBeside(s, 'england');
    partners(s, 'england', st);
    player(s, 'england').gold = 2000;
    const other = settlementsOf(s, st).find((o) => o.id !== st.id) ?? st;
    other.tension.england = 650;
    // The years of good relations still stand (the record is checked once a round).
    expect(proposePeopleTreaty(s, 'england', st.tribe, 'land-use')).toMatch(/refuse: the .* is angry/);
    expect(hasLandUse(s, 'england', st.tribe)).toBe(false);
    expect(player(s, 'england').gold).toBe(2000);
  });

  it('lets the colony work a leased tile, and only the leasing nation\'s colony', () => {
    const s = game();
    const { st, c } = colonyBeside(s, 'england');
    partners(s, 'england', st);
    const tile = leasableTiles(s, 'england', st.tribe)[0];
    const worker = createUnit(s, 'england', 'expertFarmer', { kind: 'map', x: c.x, y: c.y });
    const job = { kind: 'tile' as const, x: tile.x, y: tile.y, good: 'food' as const };
    expect(() => assignJob(s, worker.id, c.id, job)).toThrow(/Buy it, take it or lease it first/);
    const i = tile.y * s.map.width + tile.x;
    expect(colonyOccupancy(s, c).closed.has(i)).toBe(true);
    player(s, 'england').gold = 2000;
    proposePeopleTreaty(s, 'england', st.tribe, 'land-use');
    expect(colonyOccupancy(s, c).closed.has(i)).toBe(false);
    assignJob(s, worker.id, c.id, job);
    expect(tileWorkedBy(s, tile.x, tile.y)?.id).toBe(worker.id);
    // Another nation's colony beside the same tile may not work it.
    const fake = { ...c, owner: 'france' as const };
    expect(colonyOccupancy(s, fake).closed.has(i)).toBe(true);
  });

  it('is paid each year from the making, to the settlements whose land it is', () => {
    const { s, st, tiles } = leased();
    const t = landUseTreaty(s, 'england', st.tribe)!;
    const terms = leaseTerms(t)!;
    const due = terms.due;
    player(s, 'england').gold = 1000;
    s.turn = due - 1;
    processNatives(s);
    expect(player(s, 'england').gold).toBe(1000);
    s.turn = due;
    processNatives(s);
    expect(player(s, 'england').gold).toBe(1000 - terms.rent * tiles.length);
    expect(terms.due).toBe(turnAfterYears(due, 1, calendarOf(s)));
  });

  it('lapses when the nation cannot pay: the people takes the land back, no breach', () => {
    const { s, st, worker, tiles, c } = leased();
    const t = landUseTreaty(s, 'england', st.tribe)!;
    player(s, 'england').gold = 0;
    s.turn = leaseTerms(t)!.due;
    processNatives(s);
    expect(t.end).toMatchObject({ why: 'lapsed', by: { kind: 'people', id: st.tribe } });
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(true);
    for (const p of tiles) expect(tileAt(s, p.x, p.y)!.use).toBeUndefined();
    // The worker found other work in the colony.
    expect(worker.loc).toMatchObject({ kind: 'colony', colonyId: c.id });
    expect(tileWorkedBy(s, tiles[0].x, tiles[0].y)).toBeUndefined();
    expect(peopleRelation(s, 'england', st.tribe).breaks ?? 0).toBe(0);
    expect((s.messages ?? []).some((m) => /lease has lapsed/.test(m.text))).toBe(true);
  });

  it('covers on rent day the land beside its colonies, and lets go of land no colony is beside', () => {
    const { s, st, tiles } = leased();
    const t = landUseTreaty(s, 'england', st.tribe)!;
    // A tile leased but no longer beside a colony of the nation (as after a colony was lost).
    const stray = Object.values(s.settlements).find((o) => o.tribe === st.tribe && o.id !== st.id);
    const spot = stray && workArea(s, stray.x, stray.y).find((p) => nativeLandOwner(s, p.x, p.y)?.id === stray.id && !tiles.some((q) => q.x === p.x && q.y === p.y));
    if (spot) tileAt(s, spot.x, spot.y)!.use = 'england';
    player(s, 'england').gold = 5000;
    s.turn = leaseTerms(t)!.due;
    processNatives(s);
    if (spot) expect(tileAt(s, spot.x, spot.y)!.use).toBeUndefined();
    for (const p of tiles) expect(tileAt(s, p.x, p.y)!.use).toBe('england');
  });

  it('leaves the settlement half of what it gathers from leased land', () => {
    const half = leased(game(LAND.id)).s;
    const none = leased(game(NOTHING.id)).s;
    const st = (s: GameState) => {
      const t = allTreaties(s).find((o) => o.kind === 'land-use')!;
      return Object.values(s.settlements).filter((o) => o.tribe === t.parties[1].id);
    };
    const sum = (s: GameState) => st(s).reduce((n, o) => n + Object.values(settlementProduce(s, o)).reduce((a, b) => a + (b ?? 0), 0), 0);
    const leasedTotal = sum(half);
    const nothing = sum(none);
    // Without the lease (the tiles unmarked) they gather the full amount.
    const full = deserialize(serialize(half));
    for (const tile of full.map.tiles) delete tile.use;
    const fullTotal = sum(full);
    expect(nothing).toBeLessThan(fullTotal);
    expect(leasedTotal).toBeGreaterThan(nothing);
    expect(leasedTotal).toBeLessThan(fullTotal);
    // Half way, give or take the rounding of each good.
    expect(Math.abs(leasedTotal - (nothing + fullTotal) / 2)).toBeLessThanOrEqual(2);
  });

  it('makes colonies beside leased land press half as hard on the people', () => {
    const { s, st, c } = leased();
    const i = colonyList(s).findIndex((o) => o.id === c.id);
    expect(leasedFromBeside(s, colonyList(s)).get(i)?.has(st.tribe)).toBe(true);
    const without = deserialize(serialize(s));
    for (const tile of without.map.tiles) delete tile.use;
    expect(leasedFromBeside(without, colonyList(without)).size).toBe(0);
    for (const g of [s, without]) {
      for (const o of Object.values(g.settlements)) o.tension.england = 300;
      g.braves = {};
      for (const o of Object.values(g.settlements)) o.braveTimer = 99;
    }
    processNatives(s);
    processNatives(without);
    const near = Object.values(s.settlements).find((o) => o.tribe === st.tribe && gridOf(s).distance(o.x, o.y, c.x, c.y) <= 3)!;
    expect(near.tension.england).toBeLessThan(without.settlements[near.id].tension.england!);
  });
});

describe('buying and taking leased land', () => {
  it('buying a leased tile stays possible at the usual price; the lease holds for the rest', () => {
    const { s, st, tiles, worker } = leased();
    const tile = tiles[0];
    const unleased = deserialize(serialize(s));
    delete unleased.map.tiles[tile.y * s.map.width + tile.x].use;
    const price = landPrice(s, 'england', tile.x, tile.y);
    expect(price).toBe(landPrice(unleased, 'england', tile.x, tile.y));
    player(s, 'england').gold = 5000;
    buyLand(s, 'england', tile.x, tile.y);
    expect(player(s, 'england').gold).toBe(5000 - price);
    expect(tileAt(s, tile.x, tile.y)).toMatchObject({ claim: 'england' });
    expect(tileAt(s, tile.x, tile.y)!.use).toBeUndefined();
    expect(hasLandUse(s, 'england', st.tribe)).toBe(true);
    expect(tileWorkedBy(s, tile.x, tile.y)?.id).toBe(worker.id);
  });

  it('taking a leased tile breaks faith: every treaty ends, the rest of the land goes back', () => {
    const { s, st, tiles, worker, c } = leased();
    // A second worker on another leased tile.
    const other = tiles[1];
    const second = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
    assignJob(s, second.id, c.id, { kind: 'tile', x: other.x, y: other.y, good: 'food' });
    takeLand(s, 'england', tiles[0].x, tiles[0].y);
    expect(hasLandUse(s, 'england', st.tribe)).toBe(false);
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(false);
    expect(allTreaties(s).find((t) => t.kind === 'land-use')!.end).toMatchObject({ why: 'broken', by: 'england' });
    expect(peopleRelation(s, 'england', st.tribe).breaks).toBe(1);
    // The taken tile is England's and its worker stays; the other leased tiles are the people's again.
    expect(tileWorkedBy(s, tiles[0].x, tiles[0].y)?.id).toBe(worker.id);
    for (const p of tiles) expect(tileAt(s, p.x, p.y)!.use).toBeUndefined();
    expect(tileWorkedBy(s, other.x, other.y)).toBeUndefined();
    expect(second.loc).toMatchObject({ kind: 'colony', colonyId: c.id });
  });

  it('a people ending its treaties in anger takes its land back too', () => {
    const { s, st, tiles } = leased();
    st.tension.england = 700;
    processNatives(s);
    expect(hasLandUse(s, 'england', st.tribe)).toBe(false);
    for (const p of tiles) expect(tileAt(s, p.x, p.y)!.use).toBeUndefined();
  });
});

describe('computer players and the switch', () => {
  it('are shared per level as N11 says: Creative and Competent lease, Combative and Naive do not propose', () => {
    expect(LEVEL_COOPERATION.creative.land).toBe(1);
    expect(LEVEL_COOPERATION.competent.land).toBeGreaterThan(0);
    expect(LEVEL_COOPERATION.combative.land).toBe(0);
    expect(LEVEL_COOPERATION.naive.land).toBe(0);
  });

  it('lease land in computer games and work it, and the save stays a plain JSON tree', () => {
    const s = createGame({ seed: 1000, mapSize: 'medium', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: QUICK.id });
    let worked = false;
    for (let i = 0; i < 300 * 4 && !s.gameOver && !worked; i++) {
      applyCommand(s, { type: 'endTurn' });
      worked = s.map.tiles.some((tile, k) => tile.use && tileWorkedBy(s, k % s.map.width, Math.floor(k / s.map.width))?.owner === tile.use);
    }
    const leases = allTreaties(s).filter((t) => t.kind === 'land-use');
    expect(leases.length).toBeGreaterThan(0);
    for (const t of leases) expect(['creative', 'competent']).toContain(player(s, t.parties[0].id as NationId).ai);
    expect(worked).toBe(true);
    const back = deserialize(serialize(s));
    expect(serialize(back)).toBe(serialize(s));
    expect(JSON.parse(JSON.stringify(s.map.tiles))).toEqual(s.map.tiles);
  }, 60_000);

  it('is off without the switch: no tile is ever leased', () => {
    const s = createGame({ seed: 1000, mapSize: 'small', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: TRADE_ONLY.id });
    for (let i = 0; i < 60 * 4 && !s.gameOver; i++) applyCommand(s, { type: 'endTurn' });
    expect(s.map.tiles.some((t) => t.use)).toBe(false);
    expect(allTreaties(s).some((t) => t.kind === 'land-use')).toBe(false);
  }, 60_000);
});
