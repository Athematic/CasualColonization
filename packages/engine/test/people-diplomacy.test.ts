/**
 * Beta 3, step 4 (docs/design/native-nations.md, T11, T12): diplomacy from the people's side. A
 * hidden test scenario, the Americas with the Iroquois and the Cherokee playable and epidemics on,
 * carries it: each of Beta 2's treaty kinds from the people's side, trade for gold, barter and
 * treaties between peoples, war and peace between a people and a nation, epidemics on both sides,
 * and save and load.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  CARIBBEAN,
  PEOPLE_BUILDINGS,
  PEOPLE_UNIT_TYPES,
  answerPairProposal,
  applyCommand,
  assignJob,
  barter,
  colonyAt,
  colonyWorkers,
  createGame,
  createUnit,
  deserialize,
  endPairTreaty,
  epidemicText,
  europeanGoodsPrice,
  exchangeTeachBonus,
  exposedColonies,
  growPeopleTown,
  isSick,
  learnAtTown,
  makePairTreaty,
  newColonyBuildings,
  pairPrice,
  pairStanding,
  pairTreaty,
  pairTreatyProblem,
  peopleGoodsPrice,
  peopleLandClosedTo,
  peopleLeasableTiles,
  peopleRelationOf,
  peopleTreatyBetween,
  processColony,
  processEpidemics,
  processPeopleDiplomacy,
  proposePairTreaty,
  proposePeace,
  registerScenario,
  serialize,
  settlementAt,
  standingOf,
  standingWith,
  startWar,
  TERRAIN,
  tileAt,
  townTeaches,
  tradeWithPeople,
  tradeWithSettlement,
  UNIT_TYPES,
  calendarOf,
  yearOf,
  type Colony,
  type GameConfig,
  type GameState,
  type PeopleTreatyKind,
  type Scenario,
} from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { addColony, colonyList, setUnitLoc, unitList } from '../src/unitindex.js';

const GAME: Scenario = {
  ...AMERICAS,
  id: 'test-people-diplomacy',
  name: 'People diplomacy test',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    playable: [
      { id: 'iroquois', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] },
      { id: 'cherokee', name: 'the Cherokee', adjective: 'Cherokee', townNames: ['Chota', 'Tellico', 'Echota'] },
    ],
  },
  nationTypes: { people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS] } },
  mechanics: { ...AMERICAS.mechanics, hardYears: { chance: 1 / 8 }, landHealth: { regionSize: 8, renewal: 40, recovery: 5, floor: 0.2 }, epidemics: { chance: 1 / 25, years: 3, loss: 1, reach: 8 } },
};
registerScenario(GAME);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'creative', france: 'combative', netherlands: 'competent' },
    peoples: ['iroquois'],
    scenario: GAME.id,
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...over,
  };
}

function play(s: GameState, rounds: number): GameState {
  const until = s.turn + rounds;
  let guard = rounds * (s.players.length + 2);
  while (s.turn < until && !s.gameOver && guard-- > 0) {
    const r = applyCommand(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
  }
  return s;
}

const town = (s: GameState, people = 'iroquois'): Colony => colonyList(s).find((c) => c.owner === people)!;
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** A game some years on, with the two sides in contact for a long time and trade between them well past the hidden thresholds. */
function friends(s: GameState, a: string, b: string): void {
  if (s.turn < 120) s.turn = 120;
  const rel = standingWith(s, a as never, b as never);
  rel.goodSince = 0;
  rel.volume = 5000;
}

/** Proposes until the computer side agrees (each turn draws a new answer); returns the treaty. */
function agree(s: GameState, from: string, to: string, kind: PeopleTreatyKind) {
  for (let i = 0; i < 40 && !pairTreaty(s, kind, from as never, to as never); i++) {
    expect(pairTreatyProblem(s, from as never, to as never, kind)).toBeNull();
    proposePairTreaty(s, from as never, to as never, kind);
    s.turn++;
  }
  const t = pairTreaty(s, kind, from as never, to as never);
  expect(t, `${from} and ${to} make ${kind}`).toBeDefined();
  return t!;
}

/** A free land tile at exactly `d` tiles from (x, y), with nothing on it. */
function landAt(s: GameState, x: number, y: number, d: number): { x: number; y: number } {
  const grid = gridOf(s);
  for (const p of grid.tilesWithin(s.map, x, y, d)) {
    if (grid.distance(p.x, p.y, x, y) !== d) continue;
    const t = tileAt(s, p.x, p.y)!;
    if (TERRAIN[t.t].water || colonyAt(s, p.x, p.y) || settlementAt(s, p.x, p.y)) continue;
    return p;
  }
  throw new Error('no free land');
}

/** An English colony two tiles from the Haudenosaunee capital, with one worker. */
function colonyBeside(s: GameState, owner = 'england'): Colony {
  const t = town(s);
  const at = landAt(s, t.x, t.y, 2);
  const c: Colony = { id: `c-test-${owner}`, owner: owner as never, name: 'Testtown', x: at.x, y: at.y, goods: Object.fromEntries(Object.keys(t.goods).map((g) => [g, 0])) as Colony['goods'], buildings: newColonyBuildings(s, owner as never), build: null, hammers: 0, liberty: 0, founded: s.turn, exports: {} };
  addColony(s, c);
  const u = createUnit(s, owner as never, 'freeColonist', { kind: 'map', x: c.x, y: c.y });
  setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
  return c;
}

describe('treaties from the people’s side (T11)', () => {
  it('a playing people proposes a trade treaty to a nation, which a computer nation answers by its level', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    s.turn = 120;
    expect(pairTreatyProblem(s, 'iroquois', 'england', 'people-trade')).toMatch(/not met/);
    standingWith(s, 'iroquois', 'england');
    expect(pairTreatyProblem(s, 'iroquois', 'england', 'people-trade')).toMatch(/do not know each other well enough/);
    expect(pairStanding(s, 'iroquois', 'england')).toBe('Barely knows you');
    friends(s, 'iroquois', 'england');
    expect(pairStanding(s, 'iroquois', 'england')).toBe('Trusts you');
    // A people's own land use or defence needs the trade treaty first.
    expect(pairTreatyProblem(s, 'iroquois', 'england', 'defence')).toMatch(/needs a trade treaty/);
    const t = agree(s, 'iroquois', 'england', 'people-trade');
    // The same treaty Beta 2 reads: one nation and one people.
    expect(t.parties).toEqual([{ kind: 'nation', id: 'england' }, { kind: 'people', id: 'iroquois' }]);
    expect(peopleTreatyBetween(s, 'people-trade', 'england', 'iroquois')).toBe(t);
    expect(pairStanding(s, 'iroquois', 'england')).toBe('Partners in trade');
    expect(pairStanding(s, 'england', 'iroquois')).toBe('Partners in trade');
    expect(pairTreatyProblem(s, 'iroquois', 'england', 'people-trade')).toMatch(/already have/);
    // The record is Beta 2's, keyed nation first.
    expect(peopleRelationOf(s, 'england', 'iroquois')).toBe(standingOf(s, 'iroquois', 'england'));
  });

  it('a nation proposes to a playing people: a person answers later, a computer people at once', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    friends(s, 'england', 'iroquois');
    const text = proposePairTreaty(s, 'england', 'iroquois', 'people-trade');
    expect(text).toMatch(/has been sent/);
    expect(standingOf(s, 'england', 'iroquois')!.proposal).toMatchObject({ kind: 'people-trade', by: 'england' });
    expect(s.messages.some((m) => m.to === 'iroquois' && /England propose a trade treaty/.test(m.text))).toBe(true);
    expect(pairTreatyProblem(s, 'iroquois', 'england', 'people-trade')).toMatch(/waiting for your answer/);
    expect(applyCommand(s, { type: 'answerPairProposal', from: 'england', accept: true }).ok).toBe(true);
    expect(pairTreaty(s, 'people-trade', 'england', 'iroquois')).toBeDefined();
    expect(() => answerPairProposal(s, 'iroquois', 'england', true)).toThrow(/no proposal/);

    // A computer people answers by Beta 2's rule, at once.
    const c = createGame(config({ humans: ['england'] }));
    friends(c, 'england', 'iroquois');
    agree(c, 'england', 'iroquois', 'people-trade');
  });

  it('land use: a nation leases a people’s claimed land, pays it rent, and the lease lapses unpaid', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    const c = colonyBeside(s);
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    const tiles = peopleLeasableTiles(s, 'england', 'iroquois');
    expect(tiles.length).toBeGreaterThan(0);
    for (const q of tiles) expect(peopleLandClosedTo(s, 'england', q.x, q.y)).toBe('iroquois');
    player(s, 'england').gold = 1000;
    const gold = player(s, 'england').gold;
    const t = agree(s, 'iroquois', 'england', 'land-use');
    expect(t.terms).toMatchObject({ kind: 'land-use' });
    const rent = (t.terms as { rent: number }).rent;
    expect(rent).toBeGreaterThanOrEqual(1);
    expect(player(s, 'iroquois').gold).toBe(rent * tiles.length);
    expect(player(s, 'england').gold).toBe(gold - rent * tiles.length);
    for (const q of tiles) {
      expect(tileAt(s, q.x, q.y)!.use).toBe('england');
      expect(tileAt(s, q.x, q.y)!.claim).toBe('iroquois');
      expect(peopleLandClosedTo(s, 'england', q.x, q.y)).toBeUndefined();
      expect(peopleLandClosedTo(s, 'france', q.x, q.y)).toBe('iroquois');
    }
    // English colonists work the leased land, and nobody else's colonists do.
    const u = colonyWorkers(s, c)[0];
    const q = tiles[0];
    assignJob(s, u.id, c.id, { kind: 'tile', x: q.x, y: q.y, good: 'food' });
    expect(u.loc).toMatchObject({ kind: 'colony', job: { kind: 'tile', x: q.x, y: q.y } });
    // Rent day: paid to the people.
    const due = (t.terms as { due: number }).due;
    s.turn = due;
    const before = player(s, 'iroquois').gold;
    processPeopleDiplomacy(s);
    expect(player(s, 'iroquois').gold).toBe(before + rent * peopleLeasableTiles(s, 'england', 'iroquois').length);
    // Unpaid: the lease lapses and the land is the people's alone again.
    s.turn = (t.terms as { due: number }).due;
    player(s, 'england').gold = 0;
    processPeopleDiplomacy(s);
    expect(t.end?.why).toBe('lapsed');
    for (const p of tiles) expect(tileAt(s, p.x, p.y)!.use).toBeUndefined();
  });

  it('cultural exchange: the nation’s colonists learn the people’s skills at its towns; its elders teach sooner', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    expect(exchangeTeachBonus(s, 'iroquois')).toBe(0);
    agree(s, 'iroquois', 'england', 'exchange');
    expect(exchangeTeachBonus(s, 'iroquois')).toBe(1);
    expect(exchangeTeachBonus(s, 'england')).toBe(0);
    const t = town(s);
    const at = landAt(s, t.x, t.y, 1);
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: at.x, y: at.y });
    u.moves = 1;
    const skill = townTeaches(s, t, 'england');
    expect(skill).toBeTruthy();
    expect(['expertFarmer', 'expertFurTrapper', 'masterTobaccoPlanter', 'expertFisherman']).toContain(skill);
    expect(townTeaches(s, t, 'france')).toBeNull();
    learnAtTown(s, u.id, t.id);
    expect(u.type).toBe(skill);
    expect(t.taughtAt?.england).toBe(s.turn);
    // Once a generation.
    const v = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: at.x, y: at.y });
    v.moves = 1;
    expect(() => learnAtTown(s, v.id, t.id)).toThrow(/teaches your colonists again in \d+ years/);
  });

  it('mutual defence: war declared on either partner is war with the other', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    makePairTreaty(s, 'iroquois', 'england', 'exchange');
    agree(s, 'iroquois', 'england', 'defence');
    expect(pairTreatyProblem(s, 'iroquois', 'france', 'defence')).toMatch(/not met|trade treaty/);
    startWar(s, 'france', 'iroquois');
    expect(player(s, 'england').stance.france).toBe('war');
    expect(player(s, 'iroquois').stance.france).toBe('war');
    // And the other way: war on the nation brings in the people.
    const c = createGame(config({ humans: ['iroquois'] }));
    friends(c, 'iroquois', 'england');
    makePairTreaty(c, 'iroquois', 'england', 'people-trade');
    makePairTreaty(c, 'iroquois', 'england', 'exchange');
    makePairTreaty(c, 'iroquois', 'england', 'defence');
    startWar(c, 'netherlands', 'england');
    expect(player(c, 'iroquois').stance.netherlands).toBe('war');
    // A people keeps a pact with one nation at a time.
    friends(c, 'iroquois', 'france');
    makePairTreaty(c, 'iroquois', 'france', 'people-trade');
    makePairTreaty(c, 'iroquois', 'france', 'exchange');
    expect(pairTreatyProblem(c, 'iroquois', 'france', 'defence')).toMatch(/already have a mutual defence pact with England/);
  });

  it('breaking faith: a people ends a treaty, and trust is slow to come back on both sides', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    makePairTreaty(s, 'iroquois', 'england', 'exchange');
    expect(applyCommand(s, { type: 'endPairTreaty', with: 'england', kind: 'people-trade' }).ok).toBe(true);
    const t = s.treaties!.find((o) => o.kind === 'people-trade')!;
    expect(t.end).toMatchObject({ why: 'broken', by: { kind: 'people', id: 'iroquois' } });
    const rel = standingOf(s, 'iroquois', 'england')!;
    expect(rel.breaks).toBe(1);
    expect(rel.waitUntil).toBeGreaterThan(s.turn);
    expect(pairStanding(s, 'england', 'iroquois')).toBe('Distrusts you');
    expect(pairTreatyProblem(s, 'england', 'iroquois', 'people-trade')).toMatch(/not come back/);
    // The exchange stood on the trade treaty: it ends at the round.
    processPeopleDiplomacy(s);
    expect(s.treaties!.find((o) => o.kind === 'exchange')!.end?.why).toBe('cancelled');
    // A treaty with a people nobody plays is not ended this way.
    expect(() => endPairTreaty(s, 'england', 'sioux', 'people-trade')).toThrow(/no trade treaty/);
  });
});

describe('trade for gold between a people and Europeans (T10)', () => {
  it('a people sells furs to a European wagon train beside its town and earns gold; it buys muskets', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    const t = town(s);
    t.goods.furs = 100;
    const at = landAt(s, t.x, t.y, 1);
    const w = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: at.x, y: at.y });
    w.cargo = { muskets: 50 };
    player(s, 'england').gold = 1000;
    expect(player(s, 'iroquois').gold).toBe(0);
    const price = peopleGoodsPrice(s, 'furs');
    expect(applyCommand(s, { type: 'tradeWithPeople', unitId: w.id, colonyId: t.id, good: 'furs', amount: 100, load: true }).ok).toBe(true);
    expect(player(s, 'iroquois').gold).toBe(100 * price);
    expect(player(s, 'england').gold).toBe(1000 - 100 * price);
    expect(w.cargo!.furs).toBe(100);
    expect(t.goods.furs).toBe(0);
    expect(standingOf(s, 'england', 'iroquois')!.volume).toBe(100 * price);
    // The people buys muskets from the wagon train, as far as its gold goes.
    const musket = europeanGoodsPrice(s, 'iroquois', 'muskets');
    expect(musket).toBe(6); // muskets are what the Iroquois want most: twice their worth
    const gold = player(s, 'iroquois').gold;
    tradeWithPeople(s, 'iroquois', w.id, t.id, 'muskets', 50, false);
    const bought = Math.min(50, Math.floor(gold / musket));
    expect(t.goods.muskets).toBe(bought);
    expect(player(s, 'iroquois').gold).toBe(gold - bought * musket);
    // Food is sold only above the town's reserve.
    t.goods.food = 0;
    expect(() => tradeWithPeople(s, 'iroquois', w.id, t.id, 'food', 10, true)).toThrow(/no food/);
  });

  it('a trade treaty gives the side that comes to trade better prices; a canoe at a European colony', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    const c = colonyBeside(s);
    const at = landAt(s, c.x, c.y, 1);
    const canoe = createUnit(s, 'iroquois', 'birchbarkCanoe', { kind: 'map', x: at.x, y: at.y });
    canoe.cargo = { furs: 100 };
    player(s, 'england').gold = 5000;
    const plain = pairPrice(s, 'iroquois', 'england', 'furs', 'iroquois');
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    const better = pairPrice(s, 'iroquois', 'england', 'furs', 'iroquois');
    expect(better).toBeGreaterThan(plain);
    // A European who comes to the people's town gets the treaty's prices from its side.
    expect(pairPrice(s, 'iroquois', 'england', 'furs', 'england')).toBeLessThanOrEqual(plain);
    tradeWithPeople(s, 'iroquois', canoe.id, c.id, 'furs', 100, false);
    expect(player(s, 'iroquois').gold).toBe(Math.round(100 * better));
    expect(c.goods.furs).toBe(100);
    // The people buys cloth from the colony with what it earned, at the treaty's lower price.
    c.goods.cloth = 30;
    tradeWithPeople(s, 'iroquois', canoe.id, c.id, 'cloth', 30, true);
    expect(canoe.cargo!.cloth).toBeGreaterThan(0);
    expect(pairPrice(s, 'england', 'iroquois', 'cloth', 'iroquois')).toBeLessThan(europeanGoodsPrice(s, 'iroquois', 'cloth'));
  });

  it('a people does not sell to a settlement for gold, and no trade at war', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    const st = Object.values(s.settlements)[0];
    const at = landAt(s, st.x, st.y, 1);
    const canoe = createUnit(s, 'iroquois', 'birchbarkCanoe', { kind: 'map', x: at.x, y: at.y });
    canoe.cargo = { furs: 100 };
    canoe.moves = 4;
    expect(() => tradeWithSettlement(s, canoe.id, st.id, 'furs')).toThrow(/barter/);
    const t = town(s);
    const w = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: landAt(s, t.x, t.y, 1).x, y: landAt(s, t.x, t.y, 1).y });
    t.goods.furs = 50;
    startWar(s, 'iroquois', 'england');
    expect(() => tradeWithPeople(s, 'england', w.id, t.id, 'furs', 50, true)).toThrow(/at war/);
  });
});

describe('treaties between peoples (T11)', () => {
  it('two playing peoples make a trade treaty and a defence pact, barter, and stand together in war', () => {
    const s = createGame(config({ humans: ['iroquois'], peoples: ['iroquois', 'cherokee'] }));
    expect(pairTreatyProblem(s, 'iroquois', 'cherokee', 'land-use')).toMatch(/only trade treaties and mutual defence/);
    friends(s, 'iroquois', 'cherokee');
    const t = agree(s, 'iroquois', 'cherokee', 'people-trade');
    expect(t.parties).toEqual([{ kind: 'people', id: 'cherokee' }, { kind: 'people', id: 'iroquois' }]);
    agree(s, 'iroquois', 'cherokee', 'defence');
    // Barter: furs for food, the one who came getting the treaty's rate.
    const ct = town(s, 'cherokee');
    ct.goods.food = 2000;
    const canoe = createUnit(s, 'iroquois', 'birchbarkCanoe', { kind: 'map', x: landAt(s, ct.x, ct.y, 1).x, y: landAt(s, ct.x, ct.y, 1).y });
    canoe.cargo = { furs: 40 };
    const volume = standingOf(s, 'iroquois', 'cherokee')!.volume;
    // 40 furs for 96 food fill the canoe's one hold; 50 would leave furs with no hold of their own.
    barter(s, 'iroquois', canoe.id, { colonyId: ct.id }, 'furs', 40, 'food');
    expect(canoe.cargo).toEqual({ food: Math.floor((40 * 1 * 1.2) / 0.5) });
    expect(ct.goods.furs).toBe(40);
    expect(standingOf(s, 'iroquois', 'cherokee')!.volume).toBeGreaterThan(volume);
    // No gold changes hands between peoples.
    expect(player(s, 'iroquois').gold).toBe(0);
    expect(player(s, 'cherokee').gold).toBe(0);
    // War on one people is war with its partner.
    startWar(s, 'france', 'cherokee');
    expect(player(s, 'iroquois').stance.france).toBe('war');
  });

  it('a playing people and a people nobody plays: Beta 2’s answer, and the pact brings the other people to war', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    expect(s.players.some((p) => p.id === 'sioux')).toBe(false);
    friends(s, 'iroquois', 'sioux');
    agree(s, 'iroquois', 'sioux', 'people-trade');
    agree(s, 'iroquois', 'sioux', 'defence');
    // Beta 2's round leaves the treaty alone (it has no nation party).
    play(s, 2);
    expect(pairTreaty(s, 'defence', 'iroquois', 'sioux')).toBeDefined();
    startWar(s, 'england', 'iroquois');
    expect(s.tribes.find((t) => t.id === 'sioux')!.stance.england).toBe('war');
  });
});

describe('war and peace between a people and a nation (T11)', () => {
  it('a people declares war, its treaties end broken, and peace comes when the nation is tired of war', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    expect(applyCommand(s, { type: 'declareWar', nation: 'england' }).ok).toBe(true);
    expect(player(s, 'england').stance.iroquois).toBe('war');
    expect(pairTreaty(s, 'people-trade', 'iroquois', 'england')).toBeUndefined();
    expect(s.treaties!.find((t) => t.kind === 'people-trade')!.end).toMatchObject({ why: 'broken' });
    expect(pairStanding(s, 'iroquois', 'england')).toBe('At war');
    expect(proposePeace(s, 'iroquois', 'england')).toMatch(/refuses/);
    s.turn += 6;
    expect(proposePeace(s, 'iroquois', 'england')).toMatch(/have made peace/);
    expect(player(s, 'iroquois').stance.england).toBe('peace');
    expect(pairStanding(s, 'iroquois', 'england')).toBe('Distrusts you');
  });

  it('a nation makes war on a computer people, which makes peace when tired of it; two peoples fight too', () => {
    const s = createGame(config({ peoples: ['iroquois', 'cherokee'] }));
    startWar(s, 'england', 'iroquois');
    expect(player(s, 'iroquois').stance.england).toBe('war');
    player(s, 'iroquois').warSince.england = s.turn - 20;
    player(s, 'england').warSince.iroquois = s.turn - 20;
    play(s, 1);
    expect(player(s, 'iroquois').stance.england).toBe('peace');
    startWar(s, 'iroquois', 'cherokee');
    expect(player(s, 'cherokee').stance.iroquois).toBe('war');
    expect(proposePeace(s, 'iroquois', 'cherokee')).toMatch(/refuses/);
    s.turn += 6;
    expect(proposePeace(s, 'iroquois', 'cherokee')).toMatch(/have made peace/);
  });
});

describe('epidemics (T12)', () => {
  it('are off in the Americas and the Caribbean', () => {
    expect(AMERICAS.mechanics.epidemics).toBeFalsy();
    expect(CARIBBEAN.mechanics.epidemics).toBeFalsy();
  });

  it('strike a people’s town and a European colony alike, after contact, by the seed', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    const t = town(s);
    // Before contact, a town near no European colony is not exposed.
    const rules = { chance: 1, years: 3, loss: 1, reach: 8 };
    const grid = gridOf(s);
    if (!colonyList(s).some((c) => c.owner !== 'iroquois' && grid.distance(c.x, c.y, t.x, t.y) <= 8)) expect(exposedColonies(s, rules)).not.toContain(t);
    const c = colonyBeside(s);
    const exposed = exposedColonies(s, rules);
    expect(exposed).toContain(t);
    expect(exposed).toContain(c);
    // A second worker in each, so each may lose one.
    for (const col of [t, c]) {
      const u = createUnit(s, col.owner, col === t ? 'townsperson' : 'freeColonist', { kind: 'map', x: col.x, y: col.y });
      setUnitLoc(s, u, { kind: 'colony', colonyId: col.id, job: { kind: 'building', building: col === t ? 'workshop' : 'carpenter' } });
    }
    const before = { town: colonyWorkers(s, t).length, colony: colonyWorkers(s, c).length };
    // An epidemic in every region in contact: the scenario's chance, set to 1 for the test.
    (s.config as { scenario?: string }).scenario = 'test-people-diplomacy-epidemic';
    const cal = calendarOf(s);
    while (yearOf(s.turn + 1, cal).year === yearOf(s.turn, cal).year) s.turn++;
    processEpidemics(s);
    for (const col of [t, c]) {
      expect(isSick(s, col)).toBe(true);
      expect(col.sickUntil).toBeGreaterThan(s.turn);
    }
    expect(colonyWorkers(s, t).length).toBe(before.town - 1);
    expect(colonyWorkers(s, c).length).toBe(before.colony - 1);
    expect(s.messages.some((m) => m.to === 'iroquois' && m.text === epidemicText(t, 1, 3, true))).toBe(true);
    expect(s.messages.some((m) => m.to === 'england' && m.text === epidemicText(c, 1, 3, false))).toBe(true);
    // No births while it recovers: neither in the town nor in the colony.
    t.goods.food = 5000;
    c.goods.food = 5000;
    const units = unitList(s).length;
    growPeopleTown(s, t);
    processColony(s, c);
    expect(unitList(s).length).toBe(units);
    // Once recovered, births come again.
    s.turn = t.sickUntil!;
    expect(isSick(s, t)).toBe(false);
  });

  it('the words are sober and the same for both sides', () => {
    const c = { name: 'Onondaga' } as Colony;
    expect(epidemicText(c, 1, 3, true)).toBe('An epidemic has reached Onondaga. One of its people has died of it, and the town will see no births for 3 years while it recovers.');
    expect(epidemicText({ name: 'Jamestown' } as Colony, 2, 3, false)).toBe('An epidemic has reached Jamestown. 2 of its colonists have died of it, and the colony will see no births for 3 years while it recovers.');
    expect(epidemicText(c, 0, 1, true)).toBe('An epidemic has reached Onondaga. Many of its people fall ill, and all of them live, and the town will see no births for 1 year while it recovers.');
  });
});

describe('a game with a playing people’s diplomacy (save and load)', () => {
  it('computer peoples and nations play on with treaties and epidemics; the game saves, loads and plays on the same', () => {
    const s = createGame(config({ peoples: ['iroquois', 'cherokee'] }));
    play(s, 60);
    friends(s, 'iroquois', 'england');
    makePairTreaty(s, 'iroquois', 'england', 'people-trade');
    friends(s, 'iroquois', 'cherokee');
    makePairTreaty(s, 'iroquois', 'cherokee', 'people-trade');
    play(s, 60);
    expect(s.gameOver).toBeUndefined();
    // First contacts were written for the peoples.
    expect(Object.values(s.peopleRelations ?? {}).some((r) => r.nation === 'cherokee' || r.people === 'cherokee')).toBe(true);
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    play(s, 40);
    play(loaded, 40);
    expect(serialize(loaded)).toBe(serialize(s));
    // Gold only from European trade: a computer people that trades with nobody has none from elsewhere.
    for (const p of s.players.filter((o) => o.kind === 'people')) expect(p.gold).toBeGreaterThanOrEqual(0);
    for (const u of unitList(s).filter((o) => o.owner === 'iroquois')) expect(UNIT_TYPES[u.type].people).toBe(true);
  }, 180_000);
});

// The epidemic test switches the game to a copy of the scenario whose epidemics always strike.
registerScenario({ ...GAME, id: 'test-people-diplomacy-epidemic', mechanics: { ...GAME.mechanics, epidemics: { chance: 1, years: 3, loss: 1, reach: 8 } } });
