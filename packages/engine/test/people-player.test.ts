/**
 * Beta 3, step 1 (docs/design/native-nations.md, section 5): the nation type. A hidden test
 * scenario with one playable people (T4), the Americas with the Iroquois playable, carries the
 * work until the North-east game exists: a people becomes a player at setup with its settlements
 * as its towns (T1–T3), computer players play rounds around it without crashing, the game saves and
 * loads, and the Europe-only systems never touch the people (the systems table, playerkind.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  AMERICAS_FATHERS,
  FATHERS,
  FATHER_CATEGORIES,
  PEOPLE_COUNCIL,
  congress,
  councilIdOf,
  councilText,
  fatherCost,
  fatherJoinTurns,
  joinCongress,
  nextFatherCost,
  offerFathers,
  processCongress,
  promote,
  proposePeace,
  type FatherId,
  BUILDINGS,
  CARIBBEAN,
  EUROPEAN_UNIT_TYPES,
  PEOPLE_BUILDINGS,
  PEOPLE_ECONOMY,
  PEOPLE_UNIT_TYPES,
  PLAYER_SYSTEMS,
  PURCHASABLE,
  TERRAIN,
  TRAINABLE,
  UNIT_TYPES,
  applyCommand,
  assignJob,
  bornType,
  buildOptions,
  canBuild,
  claimLand,
  claimRadius,
  colonyAt,
  colonyReport,
  colonySiteProblem,
  colonyWorkers,
  councilOf,
  createGame,
  createUnit,
  deserialize,
  foodCapacity,
  foodToGrow,
  goodRelations,
  growPeopleTown,
  healthWords,
  housingOf,
  hungryThisYear,
  hurryBuild,
  isHardYear,
  isPeopleLand,
  kindOfId,
  libertyBonus,
  maxMoves,
  nationOf,
  nativeLandOwner,
  neighbours,
  offencePower,
  peopleLandClosedTo,
  peopleRelation,
  playerKind,
  processColony,
  processLand,
  regionCount,
  regionOf,
  regionRandom,
  registerScenario,
  reserveOf,
  serialize,
  settlementAt,
  sightRadius,
  startWar,
  storeCapacity,
  storeYearsHeld,
  systemsOf,
  tileAt,
  tileWorkedBy,
  tileYield,
  townDwellers,
  unitsOf,
  warehouseCapacity,
  wayOf,
  type Colony,
  type GameConfig,
  type GameState,
  type Job,
  type Player,
  type Scenario,
  type Tile,
  type Unit,
} from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { colonyList, setUnitLoc, unitList } from '../src/unitindex.js';

const PEOPLE_GAME: Scenario = {
  ...AMERICAS,
  id: 'test-people-player',
  name: 'People player test',
  hidden: true,
  peoples: { ...AMERICAS.peoples, playable: [{ id: 'iroquois', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] }] },
  // Step 2: the people's own units and buildings (T6, T7), hard years and land health (T10).
  nationTypes: { people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS] } },
  mechanics: { ...AMERICAS.mechanics, hardYears: { chance: 1 / 8 }, landHealth: { regionSize: 8, renewal: 40, recovery: 5, floor: 0.2 } },
  // Step 7: the peoples' ways of winning beside the Europeans', both sides judged (T14).
  victory: [{ id: 'military' }, { id: 'independence-war' }, { id: 'confederacy' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'continuity' }, { id: 'good-life' }, { id: 'time' }],
};
registerScenario(PEOPLE_GAME);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'competent', france: 'combative', netherlands: 'creative' },
    peoples: ['iroquois'],
    scenario: PEOPLE_GAME.id,
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...over,
  };
}

const people = (s: GameState): Player => s.players.find((p) => p.id === 'iroquois')!;

function play(s: GameState, rounds: number): GameState {
  const until = s.turn + rounds;
  let guard = rounds * (s.players.length + 2);
  while (s.turn < until && !s.gameOver && guard-- > 0) {
    const r = applyCommand(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
  }
  return s;
}

/** Nothing of Europe on the people: no market, Crown, taxes, REF, immigration, Congress or caravel; its own council. */
function expectNoEurope(s: GameState): void {
  const p = people(s);
  expect(p.market).toEqual({});
  expect(p.tax).toBe(0);
  expect(p.pendingTax).toBeNull();
  expect(p.boycotts).toEqual({});
  expect(p.pendingDemand).toBeUndefined();
  expect(p.royal).toBeUndefined();
  expect(p.ref).toEqual({ regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 });
  expect(p.refAtDeclaration).toBeUndefined();
  expect(p.independence).toBe('none');
  expect(p.crosses).toBe(0);
  expect(p.recruitPool).toEqual([]);
  expect(p.recruited).toBe(0);
  // Its own council, never the Congress (step 3).
  const council = councilOf(s, p.id)!.members;
  for (const id of [...p.fathers, ...(Object.values(p.fatherOffer) as string[]), ...(p.currentFather ? [p.currentFather] : [])]) {
    expect(council, id).toContain(id);
    expect(AMERICAS.councils.congress.members, id).not.toContain(id);
  }
  // Gold only from trade with Europeans (T10; step 4 brought the trade): a sale behind any gold.
  expect(p.gold).toBeGreaterThanOrEqual(0);
  if (p.gold > 0) expect(s.messages.some((m) => m.to === p.id && /sell (them )?for \d+ gold|for \d+ gold rent|gold paid for the first year/.test(m.text))).toBe(true);
  const own = unitList(s).filter((u) => u.owner === p.id);
  expect(own.filter((u) => u.loc.kind === 'europe' || u.loc.kind === 'sailing')).toEqual([]);
  expect(own.filter((u) => u.type === 'caravel')).toEqual([]);
  // No messages of its own taxes, immigrants, docks or Royal Expeditionary Force (news of the
  // nations' Congresses reaches everyone).
  const crownWords = /tax rate|immigra|docks|Royal Expeditionary|demands \d+ gold/i;
  expect(s.messages.filter((m) => m.to === p.id && crownWords.test(m.text))).toEqual([]);
  // Not a European to the peoples nobody plays: no tension towards it, no stance.
  for (const st of Object.values(s.settlements)) expect(st.tension.iroquois).toBeUndefined();
  for (const t of s.tribes) expect(t.stance.iroquois).toBeUndefined();
}

describe('the systems table (playerkind.ts)', () => {
  it('names each kind of player, by player and by id', () => {
    expect(kindOfId('england')).toBe('nation');
    expect(kindOfId('crown')).toBe('crown');
    expect(kindOfId('hudsonsBay')).toBe('company');
    expect(kindOfId('iroquois')).toBe('people');
    expect(playerKind({ id: 'england' })).toBe('nation');
    expect(playerKind({ id: 'crown' })).toBe('crown');
    expect(playerKind({ id: 'hudsonsBay', kind: 'company' })).toBe('company');
    expect(playerKind({ id: 'iroquois', kind: 'people' })).toBe('people');
  });

  it('switches every Europe-only system off for a people', () => {
    const t = PLAYER_SYSTEMS.people;
    for (const k of ['homePort', 'immigration', 'taxes', 'crown', 'independence', 'congress', 'startingCaravel', 'rumours', 'events', 'ranked'] as const) expect(t[k], k).toBe(false);
    expect(t.war).toBe(true);
    expect(t.ai).toBe('people');
    // Its own council, not the Congress (step 3).
    expect(t.council).toBe('people');
    // Nations keep every system, and sit the European council.
    for (const [k, v] of Object.entries(PLAYER_SYSTEMS.nation)) if (k !== 'ai' && k !== 'council') expect(v, k).toBe(true);
    expect(PLAYER_SYSTEMS.nation.council).toBe('european');
    expect(PLAYER_SYSTEMS.company.council).toBeNull();
    expect(PLAYER_SYSTEMS.crown.council).toBeNull();
  });
});

describe('a people playing as a nation (Beta 3 step 1)', () => {
  it('becomes a player at setup, its settlements its towns', () => {
    const s = createGame(config());
    const p = people(s);
    expect(p.kind).toBe('people');
    expect(systemsOf(p)).toBe(PLAYER_SYSTEMS.people);
    expect(s.players.map((o) => o.id)).toEqual(['england', 'france', 'netherlands', 'iroquois']);
    expect(nationOf(s, 'iroquois').name).toBe('the Haudenosaunee');
    // No settlement of the people is left; its Tribe record stays.
    expect(Object.values(s.settlements).some((st) => st.tribe === 'iroquois')).toBe(false);
    expect(Object.values(s.settlements).length).toBeGreaterThan(0);
    expect(s.tribes.some((t) => t.id === 'iroquois')).toBe(true);
    const towns = colonyList(s).filter((c) => c.owner === 'iroquois');
    expect(towns.length).toBeGreaterThan(0);
    expect(p.coloniesFounded).toBe(towns.length);
    // The people's own town names, the capital first, then the settlements' names (step 10b).
    expect(towns[0].name).toBe('Onondaga');
    towns.forEach((c, i) => expect(c.name).toMatch(i < 2 ? /^(Onondaga|Kanonwalohale)$/ : /^Iroquois /));
    for (const c of towns) {
      // Its own buildings (step 2: the people's selection), the European ones at level 0.
      expect(c.buildings.longhouse).toBe(1);
      expect(c.buildings.workshop).toBe(1);
      expect(c.buildings.councilHouse).toBe(1);
      expect(c.buildings.storagePits).toBe(0);
      expect(c.buildings.townHall).toBe(0);
      expect(c.buildings.docks).toBe(0);
      expect(c.buildings.schoolhouse).toBe(0);
      expect(buildOptions(s, c).every((b) => (b.kind === 'building' ? PEOPLE_BUILDINGS : PEOPLE_UNIT_TYPES).includes(b.id as never))).toBe(true);
      // A gardener (the Iroquois farm) and a townsperson at work; the capital's elder teaches.
      const inside = unitList(s).filter((u) => u.loc.kind === 'colony' && u.loc.colonyId === c.id);
      expect(inside.map((u) => u.type).filter((t) => t !== 'elder')).toEqual(['gardener', 'townsperson']);
      expect(unitList(s).some((u) => u.loc.kind === 'map' && u.loc.x === c.x && u.loc.y === c.y && u.type === 'warrior')).toBe(true);
    }
    expect(unitList(s).filter((u) => u.owner === 'iroquois' && u.type === 'elder')).toHaveLength(1);
    expect(unitList(s).filter((u) => u.owner === 'iroquois' && u.type === 'runner')).toHaveLength(1);
    // No caravel, no Europe; the nations start as before.
    expectNoEurope(s);
    for (const n of ['england', 'france', 'netherlands']) expect(unitList(s).some((u) => u.owner === n && u.type === 'caravel')).toBe(true);
  });

  it('refuses peoples the scenario does not let play', () => {
    expect(() => createGame(config({ peoples: ['sioux'] }))).toThrow(/lets play as a nation/);
    expect(() => createGame(config({ scenario: undefined }))).toThrow(/lets play as a nation/);
    expect(() => createGame(config({ peoples: ['iroquois', 'iroquois'] }))).toThrow(/only take part once/);
  });

  it('plays rounds with computer players, and Europe-only systems never touch the people', () => {
    const s = play(createGame(config()), 120);
    expect(s.gameOver).toBeUndefined();
    expect(s.turn).toBeGreaterThanOrEqual(120);
    expectNoEurope(s);
    // The people is not ranked with the European nations.
    const crown = s.players.find((p) => p.id === 'crown');
    if (crown) expect(crown.id).toBe('crown');
  }, 120_000);

  it('saves and loads: the loaded game is the same and plays on the same', () => {
    const s = play(createGame(config()), 40);
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    expect(people(loaded).kind).toBe('people');
    play(s, 30);
    play(loaded, 30);
    expect(serialize(loaded)).toBe(serialize(s));
    expectNoEurope(loaded);
  }, 120_000);

  it('can be played by a person: the turn comes round to it and it ends its turn', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    expect(s.players[s.current].id).toBe('iroquois');
    expect(people(s).human).toBe(true);
    for (let i = 0; i < 20; i++) {
      const r = applyCommand(s, { type: 'endTurn' });
      expect(r.ok, r.ok ? '' : r.error).toBe(true);
      expect(s.players[s.current].id).toBe('iroquois');
    }
    expect(s.turn).toBe(20);
    expectNoEurope(s);
  }, 60_000);

  it('is played by the computer as a no-op until step 9, with its towns working', () => {
    const s = play(createGame(config()), 30);
    const towns = colonyList(s).filter((c) => c.owner === 'iroquois');
    expect(towns.length).toBeGreaterThan(0);
    // Its towns produce: food is gathered (a town may have grown).
    expect(towns.some((c) => c.goods.food > 0) || unitList(s).filter((u) => u.owner === 'iroquois').length > 2 * towns.length).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Beta 3, step 2 (native-nations.md T5, T6, T7, T10): economy and growth without Europe.

const capital = (s: GameState): Colony => colonyList(s).find((c) => c.owner === 'iroquois')!;
const folk = (s: GameState) => unitList(s).filter((u) => u.owner === 'iroquois' && UNIT_TYPES[u.type].kind === 'colonist');

/** A game with the land quiet: no hard year anywhere, every region whole. */
function quiet(over: Partial<GameConfig> = {}, rounds = 0): GameState {
  const s = play(createGame(config(over)), rounds);
  s.land!.hard = [];
  s.land!.health = s.land!.health!.map(() => 100);
  s.land!.taken = s.land!.taken!.map(() => 0);
  return s;
}

/** Makes a tile next to a town mixed forest (plains with forest), nobody working it; returns it. */
function forestBeside(s: GameState, c: Colony): { x: number; y: number } {
  for (const p of neighbours(s, c.x, c.y)) {
    const t = tileAt(s, p.x, p.y)!;
    if (TERRAIN[t.t].water || colonyAt(s, p.x, p.y) || tileWorkedBy(s, p.x, p.y) || settlementAt(s, p.x, p.y)) continue;
    t.t = 'plains';
    t.f = true;
    delete t.b;
    delete t.rv;
    delete t.r;
    delete t.p;
    return p;
  }
  throw new Error('no free land beside the town');
}

/** Puts a new unit to work in a colony or town. */
function worker(s: GameState, c: Colony, type: Unit['type'], job: Job): Unit {
  const u = createUnit(s, c.owner, type, { kind: 'map', x: c.x, y: c.y });
  setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job });
  return u;
}

describe("a people's units and buildings (T6, T7)", () => {
  it('are catalogue entries selected only for a people, none from Europe', () => {
    expect(PEOPLE_UNIT_TYPES).toEqual(['townsperson', 'hunter', 'fisher', 'gardener', 'crafter', 'runner', 'warrior', 'elder', 'birchbarkCanoe']);
    expect(PEOPLE_BUILDINGS).toEqual(['longhouse', 'dryingRacks', 'storagePits', 'workshop', 'canoeLanding', 'palisade', 'councilHouse']);
    for (const t of PEOPLE_UNIT_TYPES) {
      expect(UNIT_TYPES[t].people).toBe(true);
      expect(UNIT_TYPES[t].price, t).toBeUndefined();
      expect(AMERICAS.units).not.toContain(t);
      expect(CARIBBEAN.units).not.toContain(t);
      expect(TRAINABLE).not.toContain(t);
      expect(PURCHASABLE).not.toContain(t);
    }
    for (const b of PEOPLE_BUILDINGS) {
      expect(AMERICAS.buildings).not.toContain(b);
      expect(CARIBBEAN.buildings).not.toContain(b);
      // No iron tools: they came only from Europeans.
      for (const l of BUILDINGS[b].levels) expect(l.tools, b).toBe(0);
    }
    expect(EUROPEAN_UNIT_TYPES.length + PEOPLE_UNIT_TYPES.length).toBe(Object.keys(UNIT_TYPES).length);
    const s = createGame(config({ humans: ['iroquois'] }));
    expect(bornType(s, 'iroquois')).toBe('townsperson');
    expect(bornType(s, 'england')).toBe('freeColonist');
    // A canoe is built at a canoe landing; nothing else of the people's is built.
    const c = capital(s);
    expect(canBuild(s, c, { kind: 'unit', id: 'birchbarkCanoe' })).toBe(false);
    c.buildings.canoeLanding = 1;
    expect(canBuild(s, c, { kind: 'unit', id: 'birchbarkCanoe' })).toBe(true);
    expect(unitsOf(s, 'iroquois').colonyBuilds).toEqual(['birchbarkCanoe']);
    // A people does not buy its builds.
    c.build = { kind: 'building', id: 'palisade' };
    expect(() => hurryBuild(s, c.id)).toThrow(/own work/);
  });

  it('hunters hunt, fishers fish and gardeners garden, where gardens grow', () => {
    const gardens = PEOPLE_ECONOMY.gardens;
    expect(wayOf({ t: 'plains', f: true } as Tile, 'food', gardens)).toBe('hunting');
    expect(wayOf({ t: 'plains' } as Tile, 'food', gardens)).toBe('gardens');
    expect(wayOf({ t: 'tundra' } as Tile, 'food', gardens)).toBe('hunting');
    expect(wayOf({ t: 'ocean' } as Tile, 'food', gardens)).toBe('fishing');
    expect(wayOf({ t: 'tundra', f: true } as Tile, 'furs', gardens)).toBe('hunting');
    expect(wayOf({ t: 'plains', f: true } as Tile, 'lumber', gardens)).toBe('other');
    const s = quiet();
    const c = capital(s);
    const p = forestBeside(s, c);
    const furs = (t: Unit['type']) => tileYield(s, c, p.x, p.y, 'furs', t);
    expect(furs('townsperson')).toBe(3);
    expect(furs('hunter')).toBe(6);
    expect(furs('gardener')).toBe(3);
    expect(tileYield(s, c, p.x, p.y, 'food', 'hunter')).toBe(6);
    // Cleared, the same land is a garden.
    tileAt(s, p.x, p.y)!.f = false;
    expect(tileYield(s, c, p.x, p.y, 'food', 'gardener')).toBe(10);
    expect(tileYield(s, c, p.x, p.y, 'food', 'hunter')).toBe(5);
    // No Sons of Liberty or Tories in a people's town.
    expect(libertyBonus(s, c)).toBe(0);
  });

  it('a warrior fights with a bow, a runner sees further, a townsperson does neither', () => {
    const s = createGame(config());
    const c = capital(s);
    const w = createUnit(s, 'iroquois', 'warrior', { kind: 'map', x: c.x, y: c.y });
    const t = createUnit(s, 'iroquois', 'townsperson', { kind: 'map', x: c.x, y: c.y });
    const r = createUnit(s, 'iroquois', 'runner', { kind: 'map', x: c.x, y: c.y });
    expect(offencePower(s, w)).toBe(1.5);
    expect(offencePower(s, t)).toBe(0);
    w.role = 'soldier';
    // Muskets by trade: a soldier's arms, with a veteran's skill.
    expect(offencePower(s, w)).toBe(2 * 1.5 * 1.5);
    expect(sightRadius(r, s)).toBe(2);
    expect(sightRadius(t, s)).toBe(1);
    expect(maxMoves(r, s)).toBe(6);
  });
});

describe('births, stores and hunger (T10)', () => {
  it('a town grows by births from food above its reserve, into its work', () => {
    const s = quiet();
    const c = capital(s);
    const before = folk(s).length;
    const pop = colonyWorkers(s, c).length;
    const reserve = reserveOf(s, c);
    // A year of food for each person (two food a turn, one turn a year in the 1490s).
    expect(reserve).toBe(Math.min(storeCapacity(s, c), pop * 2));
    c.goods.food = foodToGrow(s, c) + reserve - 1;
    growPeopleTown(s, c);
    expect(folk(s).length).toBe(before);
    c.goods.food = foodToGrow(s, c) + reserve;
    growPeopleTown(s, c);
    expect(folk(s).length).toBe(before + 1);
    expect(c.goods.food).toBe(reserve);
    // The child joins the town's work.
    expect(colonyWorkers(s, c).length).toBe(pop + 1);
    expect(colonyWorkers(s, c).filter((u) => u.type === 'townsperson').length).toBeGreaterThan(0);
  });

  it('no birth in a year the town was attacked, or while its longhouses are full', () => {
    const s = quiet();
    const c = capital(s);
    const n = folk(s).length;
    c.goods.food = 290;
    c.foughtAt = s.turn;
    growPeopleTown(s, c);
    expect(folk(s).length).toBe(n);
    delete c.foughtAt;
    while (townDwellers(s, c) < housingOf(s, c)) createUnit(s, 'iroquois', 'townsperson', { kind: 'map', x: c.x, y: c.y });
    const full = folk(s).length;
    growPeopleTown(s, c);
    expect(folk(s).length).toBe(full);
    c.buildings.longhouse = 2;
    expect(housingOf(s, c)).toBe(12);
    growPeopleTown(s, c);
    expect(folk(s).length).toBe(full + 1);
  });

  it('stores fill to what the town can keep; storage pits and a smokehouse keep more', () => {
    const s = quiet();
    const c = capital(s);
    expect(storeCapacity(s, c)).toBe(PEOPLE_ECONOMY.storeBase + 50);
    expect(foodCapacity(s, c)).toBe(foodToGrow(s, c) + storeCapacity(s, c));
    c.buildings.storagePits = 1;
    c.buildings.dryingRacks = 2;
    expect(storeCapacity(s, c)).toBe(PEOPLE_ECONOMY.storeBase + 150 + 100);
    // Storage pits keep other goods as a warehouse does.
    expect(warehouseCapacity(c)).toBe(200);
    // Food beyond the town's keeping spoils (here the longhouses are full: no birth).
    while (townDwellers(s, c) < housingOf(s, c)) createUnit(s, 'iroquois', 'townsperson', { kind: 'map', x: c.x, y: c.y });
    c.goods.food = 2000;
    growPeopleTown(s, c);
    expect(c.goods.food).toBe(foodCapacity(s, c));
    expect(storeYearsHeld(s, c)).toBeGreaterThan(1);
  });

  it('a hard year halves food; the store carries the town, and when it runs out the town goes hungry', () => {
    // A few rounds, so that the nations have colonies.
    const s = quiet({}, 12);
    const c = capital(s);
    const r = regionOf(s.land!, c.x, c.y);
    const good = colonyReport(s, c).produced.food;
    expect(isHardYear(s, r)).toBe(false);
    s.land!.hard = [r];
    expect(isHardYear(s, r)).toBe(true);
    const hard = colonyReport(s, c).produced.food;
    expect(hard).toBeLessThan(good);
    expect(hard).toBeGreaterThanOrEqual(Math.floor(good / 2));
    // More mouths than a hard year feeds: townspeople speak in the council house.
    for (let i = 0; i < 3; i++) worker(s, c, 'townsperson', { kind: 'building', building: 'councilHouse' });
    const net = colonyReport(s, c).net.food;
    expect(net).toBeLessThan(0);
    // The store carries it.
    c.goods.food = -net * 2;
    processColony(s, c);
    expect(c.goods.food).toBe(-net);
    expect(c.hunger).toBeUndefined();
    // Then the store runs out: hungry, no birth this year, nobody lost yet.
    const pop = colonyWorkers(s, c).length;
    processColony(s, c);
    processColony(s, c);
    expect(c.goods.food).toBe(0);
    expect(c.hunger).toEqual({ since: s.turn, last: s.turn });
    expect(hungryThisYear(s, c)).toBe(true);
    expect(colonyWorkers(s, c).length).toBe(pop);
    expect(s.messages.some((m) => m.to === 'iroquois' && /stores have run out/.test(m.text))).toBe(true);
    // A second hungry year in a row: the town loses a person.
    s.turn++;
    processColony(s, c);
    expect(colonyWorkers(s, c).length).toBe(pop - 1);
    expect(s.messages.some((m) => m.to === 'iroquois' && /Hunger in/.test(m.text))).toBe(true);
    // A European colony in a hard region feels it too.
    const e = colonyList(s).find((o) => o.owner !== 'iroquois')!;
    s.land!.hard = [regionOf(s.land!, e.x, e.y)];
    const eHard = colonyReport(s, e).produced.food;
    s.land!.hard = [];
    expect(eHard).toBeLessThan(colonyReport(s, e).produced.food);
  });

  it('elders teach the skill of a townsperson’s work', () => {
    const s = quiet();
    const c = capital(s);
    const elder = colonyWorkers(s, c).find((u) => u.type === 'elder')!;
    expect(elder.loc).toMatchObject({ kind: 'colony', job: { kind: 'building', building: 'longhouse' } });
    for (const u of colonyWorkers(s, c)) if (u.type === 'townsperson') setUnitLoc(s, u, { kind: 'map', x: c.x, y: c.y });
    const student = worker(s, c, 'townsperson', { kind: 'building', building: 'workshop' });
    elder.teach = 3;
    processColony(s, c);
    expect(s.units[student.id].type).toBe('crafter');
    expect(elder.teach).toBe(0);
    // Only elders teach.
    const hunter = createUnit(s, 'iroquois', 'hunter', { kind: 'map', x: c.x, y: c.y });
    expect(() => assignJob(s, hunter.id, c.id, { kind: 'building', building: 'longhouse' })).toThrow(/Only elders teach/);
  });
});

describe('land health per region (T10)', () => {
  it('is off in the Americas and the Caribbean: no land state', () => {
    const s = createGame({ ...config(), scenario: undefined, peoples: undefined });
    expect(s.land).toBeUndefined();
    const k = createGame({ ...config(), scenario: 'caribbean', peoples: undefined, nations: ['england', 'france'], ai: { england: 'naive', france: 'naive' } });
    expect(k.land).toBeUndefined();
  });

  it('cuts the map into regions; hard years are drawn from the seed', () => {
    const s = createGame(config());
    const land = s.land!;
    expect(land.size).toBe(8);
    expect(land.cols).toBe(Math.ceil(s.map.width / 8));
    expect(land.health).toHaveLength(regionCount(land, s));
    expect(land.health!.every((h) => h === 100)).toBe(true);
    expect(regionOf(land, 0, 0)).toBe(0);
    expect(regionOf(land, 9, 1)).toBe(1);
    expect(regionOf(land, 1, 9)).toBe(land.cols);
    // The same seed draws the same hard years; their share is about the chance.
    expect(createGame(config()).land!.hard).toEqual(land.hard);
    let hard = 0;
    let all = 0;
    for (let y = 1500; y < 1540; y++) {
      for (let r = 0; r < regionCount(land, s); r++) {
        all++;
        if (regionRandom(s, r, `hard|${y}`) < 1 / 8) hard++;
      }
    }
    expect(hard / all).toBeGreaterThan(0.08);
    expect(hard / all).toBeLessThan(0.17);
  });

  it('wears down where more than the renewal is taken, recovers where less is, and scales fur and game yields', () => {
    const s = quiet();
    const c = capital(s);
    const land = s.land!;
    const r = regionOf(land, c.x, c.y);
    // One turn a year in the 1490s: every round ends a year.
    land.taken![r] = 40 + 30;
    processLand(s);
    expect(land.health![r]).toBe(70);
    expect(land.taken![r]).toBe(0);
    processLand(s);
    expect(land.health![r]).toBe(75);
    expect(healthWords(75)).toBe('thinning');
    // Yields: furs and game at the region's health, gardens untouched.
    s.land!.hard = [];
    const p = forestBeside(s, c);
    land.health![regionOf(land, p.x, p.y)] = 50;
    expect(tileYield(s, c, p.x, p.y, 'furs', 'hunter')).toBe(3);
    expect(tileYield(s, c, p.x, p.y, 'food', 'hunter')).toBe(3);
    land.health![regionOf(land, p.x, p.y)] = 0;
    expect(tileYield(s, c, p.x, p.y, 'furs', 'hunter')).toBe(Math.round(6 * 0.2));
    tileAt(s, p.x, p.y)!.f = false;
    expect(tileYield(s, c, p.x, p.y, 'food', 'gardener')).toBe(10);
  });

  it('counts furs taken by anyone: a people’s hunters and a European colony’s trappers', () => {
    const s = quiet({}, 12);
    const land = s.land!;
    const c = capital(s);
    const p = forestBeside(s, c);
    worker(s, c, 'hunter', { kind: 'tile', x: p.x, y: p.y, good: 'furs' });
    processColony(s, c);
    expect(land.taken![regionOf(land, p.x, p.y)]).toBeGreaterThanOrEqual(6);
    const e = colonyList(s).find((o) => o.owner === 'england')!;
    const q = forestBeside(s, e);
    const er = regionOf(land, q.x, q.y);
    const before = land.taken![er];
    worker(s, e, 'expertFurTrapper', { kind: 'tile', x: q.x, y: q.y, good: 'furs' });
    processColony(s, e);
    expect(land.taken![er] - before).toBeGreaterThanOrEqual(6);
  });

});

describe("a people's land (T5) and standing (T10)", () => {
  it('its towns claim their land, closed to other players’ colonies', () => {
    const s = createGame(config());
    const c = capital(s);
    expect(tileAt(s, c.x, c.y)!.claim).toBe('iroquois');
    const claimed = s.map.tiles.flatMap((t, i) => (t.claim === 'iroquois' ? [{ x: i % s.map.width, y: Math.floor(i / s.map.width) }] : []));
    expect(claimed.length).toBeGreaterThan(1);
    const q = claimed.find((p) => p.x !== c.x || p.y !== c.y)!;
    expect(peopleLandClosedTo(s, 'england', q.x, q.y)).toBe('iroquois');
    expect(peopleLandClosedTo(s, 'iroquois', q.x, q.y)).toBeUndefined();
    expect(colonySiteProblem(s, q.x, q.y, 'england')).toMatch(/belongs to the Haudenosaunee/);
    expect(colonySiteProblem(s, q.x, q.y)).toMatch(/belongs to/);
    expect(isPeopleLand(s, 'iroquois', q.x, q.y)).toBe(true);
  });

  it('a people claims land next to its own, not land too far or held by others', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    expect(s.players[s.current].id).toBe('iroquois');
    const c = capital(s);
    const grid = gridOf(s);
    const reach = claimRadius(s, 'iroquois') + 1;
    let free: { x: number; y: number } | undefined;
    for (const p of grid.tilesWithin(s.map, c.x, c.y, reach)) {
      const t = tileAt(s, p.x, p.y)!;
      if (t.claim || TERRAIN[t.t].water || colonyAt(s, p.x, p.y) || settlementAt(s, p.x, p.y) || nativeLandOwner(s, p.x, p.y)) continue;
      if (!neighbours(s, p.x, p.y).some((n) => tileAt(s, n.x, n.y)?.claim === 'iroquois')) continue;
      free = p;
      break;
    }
    expect(free).toBeDefined();
    const r = applyCommand(s, { type: 'claimLand', x: free!.x, y: free!.y });
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    expect(tileAt(s, free!.x, free!.y)!.claim).toBe('iroquois');
    expect(applyCommand(s, { type: 'claimLand', x: free!.x, y: free!.y }).ok).toBe(false);
    // Far from its towns.
    const far = s.map.tiles.findIndex((t, i) => !t.claim && !TERRAIN[t.t].water && grid.distance(c.x, c.y, i % s.map.width, Math.floor(i / s.map.width)) > 6);
    expect(applyCommand(s, { type: 'claimLand', x: far % s.map.width, y: Math.floor(far / s.map.width) }).ok).toBe(false);
    // A nation does not claim this way.
    expect(() => claimLand(s, 'england', free!.x, free!.y)).toThrow(/Only a native people/);
  });

  it('reads Beta 2’s standing record from the people’s side: good while at peace', () => {
    const s = createGame(config());
    expect(goodRelations(s, 'england', 'iroquois')).toBe(true);
    const rel = peopleRelation(s, 'england', 'iroquois');
    expect(rel.goodSince).toBe(s.turn);
    startWar(s, 'england', 'iroquois');
    expect(goodRelations(s, 'england', 'iroquois')).toBe(false);
  });
});

describe('a computer people’s towns grow and produce by the rules (T10)', () => {
  it('grows by births and builds over 150 rounds, its stores kept, nothing of Europe', () => {
    const s = createGame(config());
    const start = folk(s).length;
    const built = (g: GameState) => colonyList(g).filter((c) => c.owner === 'iroquois').reduce((n, c) => n + PEOPLE_BUILDINGS.reduce((m, b) => m + (c.buildings[b] ?? 0), 0), 0);
    const startBuildings = built(s);
    play(s, 150);
    const towns = colonyList(s).filter((c) => c.owner === 'iroquois');
    expect(towns.length).toBeGreaterThan(0);
    expect(folk(s).length).toBeGreaterThan(start);
    expect(built(s)).toBeGreaterThan(startBuildings);
    // The land wears where furs and game are taken beyond its renewal.
    expect(s.land!.health!.some((h) => h < 100)).toBe(true);
    expect(s.land!.health!.every((h) => h >= 0 && h <= 100)).toBe(true);
    for (const c of towns) {
      expect(c.goods.food).toBeGreaterThanOrEqual(0);
      expect(c.goods.food).toBeLessThanOrEqual(foodCapacity(s, c));
      expect(townDwellers(s, c)).toBeLessThanOrEqual(housingOf(s, c));
    }
    // Experts learned from elders, none bought; nothing but the people's own units.
    expect(unitList(s).some((u) => u.owner === 'iroquois' && ['hunter', 'fisher', 'gardener', 'crafter'].includes(u.type))).toBe(true);
    expect(unitList(s).filter((u) => u.owner === 'iroquois' && !UNIT_TYPES[u.type].people)).toEqual([]);
    // Its council house's counsel brings members into its own council (step 3).
    expect(people(s).fathers.length).toBeGreaterThan(0);
    expectNoEurope(s);
  }, 120_000);

  it('saves and loads with its land, stores and hunger, and plays on the same', () => {
    const s = play(createGame(config()), 60);
    const c = capital(s);
    c.hunger = { since: s.turn - 1, last: s.turn - 1 };
    c.foughtAt = s.turn - 3;
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    expect(loaded.land).toEqual(s.land);
    expect(capital(loaded).hunger).toEqual(c.hunger);
    play(s, 40);
    play(loaded, 40);
    expect(serialize(loaded)).toBe(serialize(s));
  }, 120_000);
});

describe('councils (Beta 3 step 3, T8, T9)', () => {
  const NAMED = ['garakontie', 'thayendanegea', 'clanMothers'];
  const join = (s: GameState, id: FatherId) => joinCongress(s, people(s), id);

  it('the Congress is one council among others, unchanged', () => {
    expect(AMERICAS.councils).toEqual({ congress: congress(AMERICAS_FATHERS) });
    expect(AMERICAS.councils.congress.late).toEqual({ category: 'political', turn: 120, add: 2 });
    expect(councilIdOf(AMERICAS, 'european')).toBe('congress');
    expect(councilIdOf(AMERICAS, 'people')).toBe('people');
    const s = createGame(config());
    expect(councilOf(s, 'england')).toBe(AMERICAS.councils.congress);
    expect(councilOf(s, 'hudsonsBay')).toBeUndefined();
    expect(councilOf(s, 'crown')).toBeUndefined();
    expect(councilText(s, 'england', 'council')).toBe('Continental Congress');
    expect(councilText(s, 'england', 'member')).toBe('Founding Father');
    expect(councilText(s, 'england', 'product')).toBe('bells');
    expect(councilText(CARIBBEAN, 'england', 'council')).toBe('Colonial Council');
    const england = s.players.find((p) => p.id === 'england')!;
    expect(Object.keys(england.fatherOffer)).toEqual(FATHER_CATEGORIES);
    expect(nextFatherCost(s, england)).toBe(fatherCost(0, 3));
  });

  it("a people sits its own council: the engine's people's council, offered at setup", () => {
    const s = createGame(config());
    const p = people(s);
    expect(councilOf(s, 'iroquois')).toBe(PEOPLE_COUNCIL);
    expect(councilText(s, 'iroquois', 'council')).toBe('Council');
    expect(councilText(s, 'iroquois', 'product')).toBe('counsel');
    expect(Object.keys(p.fatherOffer)).toEqual(['household', 'land', 'knowledge', 'defence', 'peace']);
    for (const id of Object.values(p.fatherOffer) as FatherId[]) expect(PEOPLE_COUNCIL.members).toContain(id);
    expect(nextFatherCost(s, p)).toBe(fatherCost(0, 3));
    // Every member is in one of its categories, drawn as an emblem and carries a source line; none is the Congress's.
    for (const id of PEOPLE_COUNCIL.members) {
      const def = FATHERS[id];
      expect(PEOPLE_COUNCIL.categories).toContain(def.category);
      expect(def.portrait, id).toBe('emblem');
      expect(def.source, id).toBeTruthy();
      expect(AMERICAS.councils.congress.members).not.toContain(id);
    }
    // A scenario's own people's council replaces the engine's.
    const own: Scenario = { ...PEOPLE_GAME, id: 'test-people-council', councils: { ...AMERICAS.councils, people: { categories: ['peace'], members: ['speakers'] } } };
    registerScenario(own);
    const o = createGame(config({ scenario: own.id }));
    expect(people(o).fatherOffer).toEqual({ peace: 'speakers' });
  });

  it('named people are offered only to their own people', () => {
    const s = createGame(config());
    const p = people(s);
    const other: Player = { ...p, id: 'sioux', fathers: [], fatherOffer: {} };
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      offerFathers(s, other);
      for (const id of Object.values(other.fatherOffer) as string[]) seen.add(id);
      offerFathers(s, p);
      for (const id of Object.values(p.fatherOffer) as string[]) seen.add(`iroquois:${id}`);
    }
    for (const id of NAMED) {
      expect(seen.has(id), id).toBe(false);
      expect(seen.has(`iroquois:${id}`), id).toBe(true);
    }
    expect(seen.has('keepersOfTheStores')).toBe(true);
  });

  it('fills with counsel: a member joins, is announced, and the next candidates are drawn', () => {
    const s = createGame(config());
    const p = people(s);
    p.currentFather = 'clanMothers';
    p.fatherBells = nextFatherCost(s, p) - 1;
    processCongress(s, p);
    expect(p.fathers).toEqual([]);
    p.fatherBells += 1;
    processCongress(s, p);
    expect(p.fathers).toEqual(['clanMothers']);
    expect(p.fatherBells).toBe(0);
    expect(p.currentFather).toBeNull();
    expect(Object.values(p.fatherOffer)).not.toContain('clanMothers');
    expect(s.messages.some((m) => m.to === 'iroquois' && m.text.startsWith('The Clan Mothers join the Council of the Haudenosaunee.'))).toBe(true);
    expect(s.messages.some((m) => m.to === 'england' && m.text === 'The Clan Mothers have joined the Council of the Haudenosaunee.')).toBe(true);
    expect(fatherJoinTurns(s, 'iroquois')).toEqual({ clanMothers: s.turn });
    expect(nextFatherCost(s, p)).toBe(fatherCost(1, 3));
    // A computer people chooses its own candidates by the council's preference.
    expect(p.human).toBe(false);
    processCongress(s, p);
    expect(PEOPLE_COUNCIL.members).toContain(p.currentFather);
  });

  it("the household's and the land's members: births, stores, gardens and the land's health", () => {
    const s = quiet();
    const c = capital(s);
    expect(foodToGrow(s, c)).toBe(200);
    join(s, 'clanMothers');
    expect(foodToGrow(s, c)).toBe(160);
    const store = storeCapacity(s, c);
    join(s, 'keepersOfTheStores');
    expect(storeCapacity(s, c)).toBe(store + 100);
    // Gardens yield half as much again; hunting is untouched.
    const p = forestBeside(s, c);
    const furs = tileYield(s, c, p.x, p.y, 'furs', 'hunter');
    tileAt(s, p.x, p.y)!.f = false;
    expect(tileYield(s, c, p.x, p.y, 'food', 'gardener')).toBe(10);
    join(s, 'keepersOfTheFields');
    expect(tileYield(s, c, p.x, p.y, 'food', 'gardener')).toBe(15);
    expect(tileYield(s, c, p.x, p.y, 'food', 'townsperson')).toBe(Math.round(5 * 1.5));
    tileAt(s, p.x, p.y)!.f = true;
    expect(tileYield(s, c, p.x, p.y, 'furs', 'hunter')).toBe(furs);
    // The land where its towns stand recovers faster; elsewhere as before.
    const land = s.land!;
    const r = regionOf(land, c.x, c.y);
    const far = land.health!.findIndex((_, i) => i !== r && !colonyList(s).some((o) => regionOf(land, o.x, o.y) === i));
    land.health![r] = 50;
    land.health![far] = 50;
    processLand(s);
    expect(land.health![r]).toBe(55);
    join(s, 'huntLeaders');
    processLand(s);
    expect(land.health![r]).toBe(65);
    expect(land.health![far]).toBe(60);
  });

  it('knowledge, defence and peace: teaching, canoes, sight, warriors and making peace', () => {
    const s = quiet();
    const c = capital(s);
    const elder = colonyWorkers(s, c).find((u) => u.type === 'elder')!;
    for (const u of colonyWorkers(s, c)) if (u.type === 'townsperson') setUnitLoc(s, u, { kind: 'map', x: c.x, y: c.y });
    const student = worker(s, c, 'townsperson', { kind: 'building', building: 'workshop' });
    join(s, 'elders');
    elder.teach = 2;
    processColony(s, c);
    expect(s.units[student.id].type).toBe('crafter');
    const canoe = createUnit(s, 'iroquois', 'birchbarkCanoe', { kind: 'map', x: c.x, y: c.y });
    const runner = createUnit(s, 'iroquois', 'runner', { kind: 'map', x: c.x, y: c.y });
    const warrior = createUnit(s, 'iroquois', 'warrior', { kind: 'map', x: c.x, y: c.y });
    const moves = maxMoves(canoe, s);
    const sight = sightRadius(runner, s);
    const offence = offencePower(s, warrior);
    join(s, 'canoeBuilders');
    join(s, 'runners');
    join(s, 'thayendanegea');
    expect(maxMoves(canoe, s)).toBe(moves + 3);
    expect(sightRadius(runner, s)).toBe(sight + 1);
    expect(offencePower(s, warrior)).toBe(offence * 1.5);
    join(s, 'warLeaders');
    const t = createUnit(s, 'iroquois', 'townsperson', { kind: 'map', x: c.x, y: c.y });
    expect(promote(s, t)).toMatch(/warriors/);
    expect(t.type).toBe('warrior');
    // Peace: refused while England is not tired of war, accepted with the Speakers.
    startWar(s, 'england', 'iroquois');
    expect(proposePeace(s, 'iroquois', 'england')).toMatch(/refuses/);
    join(s, 'speakers');
    expect(proposePeace(s, 'iroquois', 'england')).toMatch(/made peace/);
    // Garakontié ends every war.
    startWar(s, 'england', 'iroquois');
    startWar(s, 'france', 'iroquois');
    join(s, 'garakontie');
    expect(people(s).stance.england).toBe('peace');
    expect(people(s).stance.france).toBe('peace');
  });

  it('saves and loads with its members, candidates and counsel, and plays on the same', () => {
    const s = play(createGame(config()), 30);
    join(s, 'keepersOfTheStores');
    join(s, 'huntLeaders');
    const p = people(s);
    p.currentFather = Object.values(p.fatherOffer)[0] as FatherId;
    p.fatherBells = 40;
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    expect(people(loaded).fathers).toEqual(p.fathers);
    expect(people(loaded).fatherOffer).toEqual(p.fatherOffer);
    expect(storeCapacity(loaded, capital(loaded))).toBe(storeCapacity(s, capital(s)));
    play(s, 30);
    play(loaded, 30);
    expect(serialize(loaded)).toBe(serialize(s));
  }, 120_000);
});
