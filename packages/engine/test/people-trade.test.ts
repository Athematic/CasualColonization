/**
 * Beta 2, step 1 (docs/design/native-partners.md, section 5): the trade treaty with a people
 * (`people-trade`): unlocking from the standing record (N3), proposals and the people's answers
 * and own offers (N8), the effects (N4), trade route stops at a partner's settlement, breaking
 * faith and the people's own ending (N8), the computer players (N11), and the switch.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  CARIBBEAN,
  addTreaty,
  aiAcceptsPeopleOffer,
  allTreaties,
  applyCommand,
  attack,
  bravesOf,
  buyFromSettlement,
  createGame,
  createRoute,
  assignRoute,
  createUnit,
  describeTreaty,
  deserialize,
  establishMission,
  foundColony,
  colonySiteProblem,
  gridOf,
  hasPeopleTrade,
  inciteTribe,
  isWater,
  makePeopleTreaty,
  nationParty,
  nativeOffer,
  nativeUnitPrice,
  neighbours,
  pendingDemands,
  peopleParty,
  peopleRelation,
  peopleRelationOf,
  peopleStanding,
  peopleTradeThresholds,
  peopleTradeUnlocked,
  peopleTreatyProblem,
  peopleTreatyRules,
  player,
  processNatives,
  proposePeopleTreaty,
  registerScenario,
  serialize,
  settlementProduce,
  speakToChief,
  takeLand,
  tensionOf,
  tileAt,
  treatyEndedBy,
  type GameState,
  type NationId,
  type Scenario,
  type Settlement,
  PEOPLE_TREATY_RULES,
  LEVEL_COOPERATION,
} from '../src/index.js';
import { manageLogistics } from '../src/ai/logistics.js';

/** The Americas with trade treaties with peoples switched on (hidden, for these tests). */
const TREATIES: Scenario = { ...AMERICAS, id: 'test-people-trade', name: 'test-people-trade', hidden: true, mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade'] } };
// The Americas switch them on themselves.
it('are on in the Americas and the Caribbean', () => {
  expect(AMERICAS.mechanics.peopleTreaties).toEqual(['people-trade', 'land-use', 'exchange', 'defence']);
  expect(CARIBBEAN.mechanics.peopleTreaties).toEqual(['people-trade', 'land-use', 'exchange', 'defence']);
  expect(CARIBBEAN.peopleTreaties?.trade?.volume).toEqual({ min: 0, max: 0 });
});
registerScenario(TREATIES);

/** The same, with every people open and a scenario's own numbers. */
const OPEN: Scenario = {
  ...TREATIES,
  id: 'test-people-trade-open',
  name: 'test-people-trade-open',
  peoples: { ...AMERICAS.peoples, overrides: Object.fromEntries(AMERICAS.peoples.ids.map((id) => [id, { temperament: 'open' as const }])) },
  peopleTreaties: { accept: 1, trade: { sell: 1.5 }, temperaments: { open: { accept: 1 } } },
};
registerScenario(OPEN);

/** The Americas without treaties with peoples, to check the switch. */
const OFF: Scenario = { ...AMERICAS, id: 'test-people-trade-off', name: 'test-people-trade-off', hidden: true, mechanics: { ...AMERICAS.mechanics, peopleTreaties: undefined } };
registerScenario(OFF);

function game(scenario: string | undefined = TREATIES.id, humans: NationId[] = ['england', 'france'], seed = 42): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans, ...(scenario ? { scenario } : {}) });
}

function landBeside(s: GameState, x: number, y: number): { x: number; y: number } {
  const n = neighbours(s, x, y).find(
    (p) => !isWater(tileAt(s, p.x, p.y)) && !Object.values(s.colonies).some((c) => c.x === p.x && c.y === p.y) && !Object.values(s.settlements).some((o) => o.x === p.x && o.y === p.y),
  );
  if (!n) throw new Error('no land');
  return n;
}

function firstSettlement(s: GameState): Settlement {
  return Object.values(s.settlements)[0];
}

function settlementsOf(s: GameState, st: Settlement): Settlement[] {
  return Object.values(s.settlements).filter((o) => o.tribe === st.tribe);
}

/** Makes `nation`'s standing with the settlement's people reach the hidden thresholds: contact, years of good relations and trade. */
function unlock(s: GameState, nation: NationId, st: Settlement): void {
  const rel = peopleRelation(s, nation, st.tribe);
  const need = peopleTradeThresholds(s, nation, st.tribe);
  rel.volume = need.volume;
  rel.goodSince = 0;
  s.turn = Math.max(s.turn, need.years * 2 + 10);
  for (const o of settlementsOf(s, st)) o.tension[nation] = 0;
}

/** A wagon train of `nation` next to a settlement. */
function wagonBeside(s: GameState, nation: NationId, st: Settlement) {
  const w = createUnit(s, nation, 'wagonTrain', { kind: 'map', ...landBeside(s, st.x, st.y) });
  w.moves = 2;
  return w;
}

describe('unlocking a trade treaty (N3)', () => {
  it('needs contact first: a scout\'s visit or a mission writes the standing, only with the switch on', () => {
    const s = game();
    const st = firstSettlement(s);
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/have not met/);
    const scout = createUnit(s, 'england', 'seasonedScout', { kind: 'map', ...landBeside(s, st.x, st.y) });
    scout.role = 'scout';
    scout.moves = 3;
    st.tension.england = 0;
    speakToChief(s, scout.id, st.id);
    expect(peopleRelationOf(s, 'england', st.tribe)).toBeDefined();
    // A mission is contact too.
    const other = Object.values(s.settlements).find((o) => o.tribe !== st.tribe)!;
    const m = createUnit(s, 'france', 'freeColonist', { kind: 'map', ...landBeside(s, other.x, other.y) });
    m.role = 'missionary';
    m.moves = 3;
    other.tension.france = 0;
    establishMission(s, m.id, other.id);
    expect(peopleRelationOf(s, 'france', other.tribe)).toBeDefined();
    // Without the switch, contact writes nothing (save texts of other games stay as they were).
    const off = game(OFF.id);
    const st2 = firstSettlement(off);
    const scout2 = createUnit(off, 'england', 'seasonedScout', { kind: 'map', ...landBeside(off, st2.x, st2.y) });
    scout2.role = 'scout';
    scout2.moves = 3;
    st2.tension.england = 0;
    speakToChief(off, scout2.id, st2.id);
    expect(off.peopleRelations).toBeUndefined();
  });

  it('opens once years of good relations and trade reach the hidden thresholds, drawn per pair', () => {
    const s = game();
    const st = firstSettlement(s);
    const rel = peopleRelation(s, 'england', st.tribe);
    const need = peopleTradeThresholds(s, 'england', st.tribe);
    const rules = PEOPLE_TREATY_RULES.trade;
    expect(need.years).toBeGreaterThanOrEqual(rules.years.base - rules.years.spread);
    expect(need.years).toBeLessThanOrEqual(rules.years.base + rules.years.spread);
    expect(need.volume).toBeGreaterThanOrEqual(rules.volume.min);
    expect(need.volume).toBeLessThanOrEqual(rules.volume.max);
    expect(peopleTradeThresholds(s, 'england', st.tribe)).toEqual(need);
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/do not know you well enough/);
    expect(peopleStanding(s, 'england', st.tribe)).toBe('Barely knows you');
    rel.volume = need.volume;
    rel.goodSince = 0;
    s.turn = need.years * 2 + 10;
    for (const o of settlementsOf(s, st)) o.tension.england = 0;
    expect(peopleTradeUnlocked(s, 'england', st.tribe)).toBe(true);
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toBeNull();
    expect(peopleStanding(s, 'england', st.tribe)).toBe('Trusts you');
    // Thresholds are never stored, and never touch the game's random numbers.
    expect(JSON.stringify(s.peopleRelations)).not.toMatch(/years|need/);
  });

  it('is refused for war, submission and the scenario switch', () => {
    const s = game();
    const st = firstSettlement(s);
    unlock(s, 'england', st);
    const tribe = s.tribes.find((t) => t.id === st.tribe)!;
    tribe.stance.england = 'war';
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/at war/);
    tribe.stance.england = 'peace';
    tribe.submitted = ['england'];
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/submitted/);
    delete tribe.submitted;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'land-use')).toMatch(/no land use/);
    const off = game(OFF.id);
    expect(peopleTreatyProblem(off, 'england', firstSettlement(off).tribe)).toMatch(/no treaties with native peoples/);
    expect(applyCommand(off, { type: 'proposePeopleTreaty', people: firstSettlement(off).tribe }).ok).toBe(false);
  });
});

describe('proposals and the people\'s answers (N8)', () => {
  it('are answered at once: accepted at the seeded chance, refused while a settlement is angry or after land was taken', () => {
    const s = game(OPEN.id);
    const st = firstSettlement(s);
    unlock(s, 'england', st);
    const rng = s.rng;
    // An angry settlement refuses, whatever the chance.
    st.tension.england = 700;
    expect(proposePeopleTreaty(s, 'england', st.tribe)).toMatch(/refuse: the .* is angry/);
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(false);
    st.tension.england = 0;
    // Land taken within the years set refuses too.
    peopleRelation(s, 'england', st.tribe).tookLand = s.turn - 2;
    expect(proposePeopleTreaty(s, 'england', st.tribe)).toMatch(/not forgotten the land/);
    delete peopleRelation(s, 'england', st.tribe).tookLand;
    // Open peoples with accept 1 always agree here.
    applyCommand(s, { type: 'proposePeopleTreaty', people: st.tribe });
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(true);
    expect(s.rng).toBe(rng);
    const t = allTreaties(s).find((o) => o.kind === 'people-trade')!;
    expect(t.parties).toEqual([nationParty('england'), peopleParty(st.tribe)]);
    expect(peopleStanding(s, 'england', st.tribe)).toBe('Partners in trade');
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/already have a trade treaty/);
  });

  it('follow the scenario\'s numbers and the people\'s temperament', () => {
    const s = game(OPEN.id);
    const rules = peopleTreatyRules(s);
    expect(rules.accept).toBe(1);
    expect(rules.trade.sell).toBe(1.5);
    expect(rules.trade.buy).toBe(PEOPLE_TREATY_RULES.trade.buy);
    expect(rules.temperaments.open).toEqual({ ...PEOPLE_TREATY_RULES.temperaments.open, accept: 1 });
    // An open people needs less: its thresholds are scaled down.
    const plain = game();
    const st = firstSettlement(s);
    expect(peopleTradeThresholds(s, 'england', st.tribe).volume).toBeLessThan(peopleTradeThresholds(plain, 'england', st.tribe).volume);
  });

  it('refuse at times when unlocked, by a seeded chance per turn that is the same when asked again', () => {
    const s = game();
    const st = firstSettlement(s);
    unlock(s, 'england', st);
    let accepted = 0;
    let refused = 0;
    for (let i = 0; i < 60 && !(accepted && refused); i++) {
      s.turn++;
      const copy = deserialize(serialize(s));
      const text = proposePeopleTreaty(copy, 'england', st.tribe);
      if (hasPeopleTrade(copy, 'england', st.tribe)) accepted++;
      else {
        expect(text).toMatch(/not ready/);
        refused++;
        // The same turn gives the same answer.
        expect(hasPeopleTrade(deserialize(serialize(s)), 'england', st.tribe)).toBe(false);
        const again = deserialize(serialize(s));
        proposePeopleTreaty(again, 'england', st.tribe);
        expect(hasPeopleTrade(again, 'england', st.tribe)).toBe(false);
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });
});

describe('the people\'s own offers', () => {
  /** A colony of `nation` within a brave's reach of a settlement, and the settlement. */
  function colonyNear(s: GameState, nation: NationId) {
    const grid = gridOf(s);
    for (const st of Object.values(s.settlements)) {
      for (let i = 0; i < s.map.tiles.length; i++) {
        const x = i % s.map.width;
        const y = Math.floor(i / s.map.width);
        const d = grid.distance(x, y, st.x, st.y);
        if (d < 2 || d > 3 || colonySiteProblem(s, x, y)) continue;
        const u = createUnit(s, nation, 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        const c = foundColony(s, u.id, 'Test');
        return { st, c };
      }
    }
    throw new Error('no site');
  }

  /** Plays native rounds until a brave of the people offers a treaty (or a treaty is made). */
  function untilOffer(s: GameState, nation: NationId, st: Settlement): boolean {
    for (let i = 0; i < 400; i++) {
      for (const o of settlementsOf(s, st)) o.tension[nation] = 0;
      processNatives(s);
      if (pendingDemands(s, nation).some((d) => d.kind === 'treaty') || hasPeopleTrade(s, nation, st.tribe)) return true;
    }
    return false;
  }

  it('come to a person through a visiting brave, as a turn-start notice to accept or decline', () => {
    const s = game(OPEN.id, ['england', 'france']);
    const { st } = colonyNear(s, 'england');
    unlock(s, 'england', st);
    expect(untilOffer(s, 'england', st)).toBe(true);
    const d = pendingDemands(s, 'england').find((o) => o.kind === 'treaty')!;
    expect(d).toMatchObject({ kind: 'treaty', treaty: 'people-trade', nation: 'england', amount: 0 });
    expect(s.settlements[d.settlementId].tribe).toBe(st.tribe);
    expect(bravesOf(s)[d.braveId].task).toMatchObject({ kind: 'wait', demandId: d.id });
    // While it waits, a proposal of one's own is not needed.
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/waiting for your answer/);
    const copy = deserialize(serialize(s));
    applyCommand(s, { type: 'answerNativeDemand', demandId: d.id, accept: true });
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(true);
    applyCommand(copy, { type: 'answerNativeDemand', demandId: d.id, accept: false });
    expect(hasPeopleTrade(copy, 'england', st.tribe)).toBe(false);
    expect(pendingDemands(copy, 'england')).toEqual([]);
  });

  it('are answered at once by a computer player, by its level\'s share', () => {
    const s = game(OPEN.id, []);
    player(s, 'england').ai = 'creative';
    const { st } = colonyNear(s, 'england');
    unlock(s, 'england', st);
    expect(untilOffer(s, 'england', st)).toBe(true);
    expect(pendingDemands(s, 'england')).toEqual([]);
    // Naive accepts less often than Creative, and never proposes.
    expect(LEVEL_COOPERATION.naive.people).toBe(0);
    expect(LEVEL_COOPERATION.naive.peopleAccept).toBeGreaterThan(0);
    player(s, 'france').ai = 'naive';
    const answers = new Set<boolean>();
    for (let t = 0; t < 40; t++) {
      s.turn++;
      answers.add(aiAcceptsPeopleOffer(s, 'france', st.tribe));
    }
    expect(answers.size).toBe(2);
  });
});

describe('effects of a trade treaty (N4)', () => {
  it('pay 20% more for goods sold and ask 20% less for goods bought, only from the partner', () => {
    const s = game();
    const st = firstSettlement(s);
    st.gold = 100_000;
    st.goods = { furs: 150 };
    const sell = nativeOffer(s, st, 'tradeGoods', 100, 'england');
    const buy = nativeUnitPrice(s, st, 'furs', 'england');
    makePeopleTreaty(s, 'england', st.tribe);
    expect(nativeOffer(s, st, 'tradeGoods', 100, 'england')).toBe(Math.round(sell * 1.2));
    expect(nativeOffer(s, st, 'tradeGoods', 100, 'france')).toBe(sell);
    expect(nativeOffer(s, st, 'tradeGoods', 100)).toBe(sell);
    expect(nativeUnitPrice(s, st, 'furs', 'england')).toBeLessThan(buy);
    expect(nativeUnitPrice(s, st, 'furs', 'france')).toBe(buy);
  });

  it('let the people gather 25% more for sale, and calm faster towards the partner', () => {
    const s = game();
    const st = Object.values(s.settlements).find((o) => Object.values(settlementProduce(s, o)).some((n) => (n ?? 0) >= 4))!;
    const before = settlementProduce(s, st);
    makePeopleTreaty(s, 'england', st.tribe);
    const after = settlementProduce(s, st);
    for (const g of Object.keys(before) as (keyof typeof before)[]) expect(after[g]!).toBeGreaterThanOrEqual(before[g]!);
    expect(Object.values(after).reduce((a, b) => a! + b!, 0)!).toBeGreaterThan(Object.values(before).reduce((a, b) => a! + b!, 0)!);
    for (const o of Object.values(s.settlements)) {
      o.tension.england = 100;
      o.tension.france = 100;
    }
    processNatives(s);
    const mine = settlementsOf(s, st).find((o) => tensionOf(o, 'france') === 96);
    if (mine) expect(tensionOf(mine, 'england')).toBe(94);
  });

  it('bring the partner\'s braves to trade twice as often', () => {
    const rules = peopleTreatyRules(game());
    expect(rules.trade.braveTrade).toBe(2);
    expect(rules.trade.tensionFall).toBe(2);
    expect(rules.trade.gather).toBe(1.25);
  });

  it('let a trade route stop at a partner\'s settlement, selling and buying as a wagon train does', () => {
    const s = game();
    const grid = gridOf(s);
    // A colony of England's two to four tiles from a settlement, on land a wagon can walk.
    let found: { st: Settlement; c: { id: string; x: number; y: number } } | undefined;
    for (const st of Object.values(s.settlements)) {
      for (let i = 0; i < s.map.tiles.length && !found; i++) {
        const x = i % s.map.width;
        const y = Math.floor(i / s.map.width);
        const d = grid.distance(x, y, st.x, st.y);
        if (d < 2 || d > 4 || colonySiteProblem(s, x, y)) continue;
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        found = { st, c: foundColony(s, u.id, 'Route') };
      }
      if (found) break;
    }
    const { st, c } = found!;
    const stop = { at: st.id, load: [{ good: 'furs' as const }], unload: [{ good: 'tradeGoods' as const }] };
    const home = { at: c.id, load: [{ good: 'tradeGoods' as const }], unload: [{ good: 'furs' as const }] };
    // Without a treaty the settlement is no stop.
    expect(() => createRoute(s, 'england', 'Furs', [home, stop])).toThrow(/trade treaty/);
    makePeopleTreaty(s, 'england', st.tribe);
    for (const o of settlementsOf(s, st)) o.tension.england = 0;
    const route = createRoute(s, 'england', 'Furs', [home, stop]);
    st.gold = 10_000;
    st.goods = { furs: 150 };
    s.colonies[c.id].goods.tradeGoods = 100;
    player(s, 'england').gold = 5_000;
    const w = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: c.x, y: c.y });
    w.moves = 3;
    assignRoute(s, w.id, route.id);
    let sold = false;
    let bought = false;
    for (let turn = 0; turn < 12 && !(sold && bought); turn++) {
      const gold = player(s, 'england').gold;
      const furs = st.goods.furs ?? 0;
      applyCommand(s, { type: 'endTurn' });
      applyCommand(s, { type: 'endTurn' });
      if ((st.goods?.furs ?? 0) < furs) bought = true;
      if (player(s, 'england').gold > gold && (w.cargo?.tradeGoods ?? 0) === 0) sold = true;
    }
    expect(bought).toBe(true);
    expect(sold).toBe(true);
    expect(peopleRelationOf(s, 'england', st.tribe)!.volume).toBeGreaterThan(0);
  });

  it('computer nations put an idle wagon train on a route to a partner\'s settlement that pays for their spare goods (step 6)', () => {
    const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['france'], ai: { england: 'creative' }, scenario: TREATIES.id });
    const grid = gridOf(s);
    let found: { st: Settlement; c: { id: string; x: number; y: number } } | undefined;
    for (const st of Object.values(s.settlements)) {
      for (let i = 0; i < s.map.tiles.length && !found; i++) {
        const x = i % s.map.width;
        const y = Math.floor(i / s.map.width);
        const d = grid.distance(x, y, st.x, st.y);
        if (d < 2 || d > 4 || colonySiteProblem(s, x, y)) continue;
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        found = { st, c: foundColony(s, u.id, 'Route') };
      }
      if (found) break;
    }
    const { st, c } = found!;
    const colony = s.colonies[c.id];
    for (const g of ['furs', 'sugar', 'tobacco', 'cotton', 'cloth', 'coats', 'rum', 'cigars'] as const) colony.goods[g] = 150;
    st.gold = 10_000;
    const wagon = () => {
      const w = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: c.x, y: c.y });
      w.moves = 3;
      return w;
    };
    // Without a treaty the wagon train trades on its own.
    const first = wagon();
    manageLogistics(s, player(s, 'england'));
    expect(first.route).toBeUndefined();
    makePeopleTreaty(s, 'england', st.tribe);
    for (const o of settlementsOf(s, st)) o.tension.england = 0;
    const w = wagon();
    manageLogistics(s, player(s, 'england'));
    const routed = [first, w].find((u) => u.route);
    expect(routed).toBeDefined();
    const route = s.routes![routed!.route!.id];
    expect(route.stops.map((o) => o.at)).toEqual([c.id, st.id]);
    expect(route.stops[1].unload.length).toBeGreaterThan(0);
    expect(route.name).toMatch(/^Route to the /);
  });
});

describe('breaking faith (N8)', () => {
  function partners(s: GameState) {
    const st = firstSettlement(s);
    unlock(s, 'england', st);
    makePeopleTreaty(s, 'england', st.tribe);
    return st;
  }

  it('taking a partner\'s land ends every treaty, raises tension and sets waiting and hostility', () => {
    const s = game();
    const st = partners(s);
    const tile = landBeside(s, st.x, st.y);
    const others = settlementsOf(s, st).filter((o) => o.id !== st.id);
    takeLand(s, 'england', tile.x, tile.y);
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(false);
    const t = allTreaties(s).find((o) => o.kind === 'people-trade')!;
    expect(t.end).toMatchObject({ why: 'broken', by: 'england' });
    expect(treatyEndedBy(t)).toEqual(nationParty('england'));
    expect(describeTreaty(s, t)).toMatch(/broken by England$/);
    for (const o of others) expect(tensionOf(o, 'england')).toBeGreaterThanOrEqual(200);
    const rel = peopleRelationOf(s, 'england', st.tribe)!;
    expect(rel.breaks).toBe(1);
    expect(rel.waitUntil).toBeGreaterThan(s.turn);
    expect(rel.hostileUntil).toBeGreaterThan(rel.waitUntil!);
    expect(rel.tookLand).toBe(s.turn);
    expect(peopleTreatyProblem(s, 'england', st.tribe)).toMatch(/do not trust you again/);
    expect(peopleStanding(s, 'england', st.tribe)).toBe('Distrusts you');
  });

  it('attacking a partner\'s brave or settlement breaks faith too', () => {
    const s = game();
    const st = partners(s);
    const spot = landBeside(s, st.x, st.y);
    const soldier = createUnit(s, 'england', 'veteranSoldier', { kind: 'map', ...spot });
    soldier.role = 'soldier';
    soldier.moves = 3;
    attack(s, soldier.id, { settlementId: st.id });
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(false);
    expect(peopleRelationOf(s, 'england', st.tribe)!.breaks).toBe(1);
  });

  it('inciting a partner against a rival breaks faith; inciting others does not', () => {
    const s = game();
    const st = partners(s);
    const m = createUnit(s, 'england', 'freeColonist', { kind: 'map', ...landBeside(s, st.x, st.y) });
    m.role = 'missionary';
    m.moves = 3;
    player(s, 'england').gold = 10_000;
    inciteTribe(s, m.id, st.id, 'france');
    expect(hasPeopleTrade(s, 'england', st.tribe)).toBe(false);
    expect(allTreaties(s)[0].end?.why).toBe('broken');
  });

  it('the people ends its treaties when a settlement turns angry, or with war, and names itself', () => {
    const s = game();
    const st = partners(s);
    st.tension.england = 650;
    processNatives(s);
    const t = allTreaties(s)[0];
    expect(t.end).toMatchObject({ why: 'cancelled', by: { kind: 'people', id: st.tribe } });
    expect(treatyEndedBy(t)).toEqual(peopleParty(st.tribe));
    expect(describeTreaty(s, t)).toMatch(/cancelled by the /);
    // No breach: no waiting or hostility.
    expect(peopleRelationOf(s, 'england', st.tribe)!.waitUntil).toBeUndefined();
    // War ends it too.
    const s2 = game();
    const st2 = partners(s2);
    s2.tribes.find((o) => o.id === st2.tribe)!.stance.england = 'war';
    for (const o of settlementsOf(s2, st2)) o.tension.england = 900;
    processNatives(s2);
    expect(allTreaties(s2)[0].end?.why).toBe('war');
  });

  it('a route stop at the settlement is dropped when the treaty ends', () => {
    const s = game();
    const st = partners(s);
    const other = Object.values(s.settlements).find((o) => o.tribe !== st.tribe)!;
    addTreaty(s, 'people-trade', [nationParty('england'), peopleParty(other.tribe)]);
    for (const o of Object.values(s.settlements)) o.tension.england = 0;
    const r = createRoute(s, 'england', 'Two peoples', [{ at: st.id, load: [], unload: [] }, { at: other.id, load: [], unload: [] }]);
    const tile = landBeside(s, st.x, st.y);
    takeLand(s, 'england', tile.x, tile.y);
    expect(s.routes![r.id].stops.map((o) => o.at)).toEqual([other.id]);
  });

  it('nothing happens without a treaty, beyond noting the land taken', () => {
    const s = game();
    const st = firstSettlement(s);
    peopleRelation(s, 'england', st.tribe);
    const tile = landBeside(s, st.x, st.y);
    takeLand(s, 'england', tile.x, tile.y);
    expect(peopleRelationOf(s, 'england', st.tribe)!.breaks).toBeUndefined();
    expect(peopleRelationOf(s, 'england', st.tribe)!.tookLand).toBe(s.turn);
  });
});

describe('computer players and the switch', () => {
  it('make trade treaties with peoples in computer games, and the save stays a plain JSON tree', () => {
    const s = createGame({ seed: 1000, mapSize: 'medium', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: TREATIES.id });
    let made = 0;
    for (let i = 0; i < 200 * 4 && !s.gameOver && !made; i++) {
      applyCommand(s, { type: 'endTurn' });
      made = allTreaties(s).filter((t) => t.kind === 'people-trade').length;
    }
    expect(made).toBeGreaterThan(0);
    const back = deserialize(serialize(s));
    expect(serialize(back)).toBe(serialize(s));
  });

  it('is off in a scenario without the switch: no record on contact, no treaty, no offer', () => {
    const s = game(OFF.id, []);
    for (let i = 0; i < 60; i++) applyCommand(s, { type: 'endTurn' });
    expect(allTreaties(s).some((t) => t.kind === 'people-trade')).toBe(false);
    expect((s.nativeDemands ?? []).some((d) => d.kind === 'treaty')).toBe(false);
  });

  it('buys with a wagon train from a partner at the lower price', () => {
    const s = game();
    const st = firstSettlement(s);
    makePeopleTreaty(s, 'england', st.tribe);
    st.goods = { furs: 150 };
    const w = wagonBeside(s, 'england', st);
    player(s, 'england').gold = 5000;
    const each = nativeUnitPrice(s, st, 'furs', 'england');
    buyFromSettlement(s, w.id, st.id, 'furs', 50);
    expect(5000 - player(s, 'england').gold).toBe(each * 50);
  });
});
