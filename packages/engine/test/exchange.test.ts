/**
 * Beta 2, step 3 (docs/design/native-partners.md, section 5): cultural exchange with a people
 * (`exchange`, N7): unlocking on the ladder (N2, N3), proposals and the people's answers (N8),
 * renewed teaching 25 ± 5 years after a settlement last taught, scouts welcome again once a decade,
 * the people gathering more, the endings, computer players (N11) and the switch.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  allTreaties,
  applyCommand,
  calendarOf,
  chiefAgainTurn,
  chiefWelcomes,
  createGame,
  createUnit,
  deserialize,
  exchangeBenefits,
  exchangeThreshold,
  exchangeTreaty,
  exchangeUnlocked,
  gridOf,
  isWater,
  hasExchange,
  hasPeopleTrade,
  learnSkill,
  makePeopleTreaty,
  peopleOf,
  peopleRelation,
  peopleTradeThresholds,
  peopleTreatyProblem,
  player,
  processNatives,
  proposePeopleTreaty,
  registerScenario,
  renewalsSpent,
  renewedSkill,
  peopleTreatyRules,
  serialize,
  settlementProduce,
  settlementTeaches,
  speakToChief,
  takeLand,
  teachAgainTurn,
  turnAfterYears,
  nativeLandOwner,
  yearValue,
  type GameState,
  type NationId,
  type Scenario,
  type Settlement,
  type Unit,
  LEVEL_COOPERATION,
  PEOPLE_TREATY_RULES,
} from '../src/index.js';

/** The Americas with every built kind switched on, and peoples that always say yes when free to (hidden, for these tests). */
const EXCHANGE: Scenario = {
  ...AMERICAS,
  id: 'test-exchange',
  name: 'test-exchange',
  hidden: true,
  mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade', 'land-use', 'exchange'] },
  peopleTreaties: { accept: 1 },
};
registerScenario(EXCHANGE);

/** The same, with quick thresholds and teaching, for computer games. */
const QUICK: Scenario = {
  ...EXCHANGE,
  id: 'test-exchange-quick',
  name: 'test-exchange-quick',
  peopleTreaties: { exchange: { years: { base: 2, spread: 1 }, teachYears: { base: 6, spread: 1 } } },
  // Every Creative and Competent nation seeks an exchange with each trade partner.
  ai: { ...EXCHANGE.ai, cooperation: { ...EXCHANGE.ai.cooperation, proposeExchange: 1 / LEVEL_COOPERATION.competent.exchange } },
};
registerScenario(QUICK);

/** Trade treaties and land use only, as the Americas shipped after step 2. */
const NO_EXCHANGE: Scenario = { ...AMERICAS, id: 'test-exchange-off', name: 'test-exchange-off', hidden: true, mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade', 'land-use'] } };
registerScenario(NO_EXCHANGE);

function game(scenario: string = EXCHANGE.id, seed = 42): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans: ['england', 'france'], scenario });
}

function firstSettlement(s: GameState): Settlement {
  return Object.values(s.settlements)[0];
}

/** A unit of `nation` next to a settlement, with its moves. */
function beside(s: GameState, nation: NationId, st: Settlement, type: Parameters<typeof createUnit>[2] = 'freeColonist'): Unit {
  const grid = gridOf(s);
  for (let i = 0; i < s.map.tiles.length; i++) {
    const x = i % s.map.width;
    const y = Math.floor(i / s.map.width);
    const t = s.map.tiles[i];
    if (grid.distance(x, y, st.x, st.y) !== 1 || isWater(t)) continue;
    if (Object.values(s.settlements).some((o) => o.x === x && o.y === y)) continue;
    const u = createUnit(s, nation, type, { kind: 'map', x, y });
    u.moves = 3;
    return u;
  }
  throw new Error('no tile beside the settlement');
}

function scout(s: GameState, nation: NationId, st: Settlement): Unit {
  const u = beside(s, nation, st, 'seasonedScout');
  u.role = 'scout';
  return u;
}

/** Good relations long enough for every threshold, every settlement content, and a trade treaty. */
function partners(s: GameState, nation: NationId, st: Settlement): void {
  const rel = peopleRelation(s, nation, st.tribe);
  rel.volume = peopleTradeThresholds(s, nation, st.tribe).volume;
  rel.goodSince = 0;
  s.turn = Math.max(s.turn, 200);
  for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) o.tension[nation] = 0;
  makePeopleTreaty(s, nation, st.tribe);
}

/** Partners in trade and in a cultural exchange. */
function exchanging(s: GameState = game(), nation: NationId = 'england') {
  const st = firstSettlement(s);
  partners(s, nation, st);
  proposePeopleTreaty(s, nation, st.tribe, 'exchange');
  return { s, st };
}

/** Moves the game on by whole years (turns as the calendar counts them). */
function yearsOn(s: GameState, years: number): void {
  s.turn = turnAfterYears(s.turn, years, calendarOf(s));
}

describe('unlocking a cultural exchange (N2, N3)', () => {
  it('is off unless the scenario names it', () => {
    const s = game(NO_EXCHANGE.id);
    const st = firstSettlement(s);
    partners(s, 'england', st);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'exchange')).toMatch(/no cultural exchange with native peoples/);
  });

  it('needs a trade treaty first (the ladder), then years of good relations of its own', () => {
    const s = game();
    const st = firstSettlement(s);
    const rel = peopleRelation(s, 'england', st.tribe);
    rel.goodSince = 0;
    s.turn = 200;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'exchange')).toMatch(/needs a trade treaty/);
    partners(s, 'england', st);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'exchange')).toBeNull();
    // Fewer years of good relations than the hidden threshold: not yet.
    const need = exchangeThreshold(s, 'england', st.tribe);
    const r = PEOPLE_TREATY_RULES.exchange.years;
    expect(need).toBeGreaterThanOrEqual(r.base - r.spread);
    expect(need).toBeLessThanOrEqual(r.base + r.spread);
    rel.goodSince = s.turn;
    expect(exchangeUnlocked(s, 'england', st.tribe)).toBe(false);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'exchange')).toMatch(/do not know you well enough for a cultural exchange/);
  });

  it('is agreed when proposed and free, and refused while a settlement is angry', () => {
    const { s, st } = exchanging();
    expect(hasExchange(s, 'england', st.tribe)).toBe(true);
    expect(exchangeTreaty(s, 'england', st.tribe)!.parties).toEqual([{ kind: 'nation', id: 'england' }, { kind: 'people', id: st.tribe }]);
    expect(s.messages.some((m) => m.to === 'england' && m.text.includes('cultural exchange'))).toBe(true);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'exchange')).toMatch(/already have a cultural exchange/);

    const other = game();
    const ost = firstSettlement(other);
    partners(other, 'england', ost);
    ost.tension.england = 650;
    const text = proposePeopleTreaty(other, 'england', ost.tribe, 'exchange');
    expect(text).toMatch(/refuse/);
    expect(hasExchange(other, 'england', ost.tribe)).toBe(false);
  });

  it('describes its benefits from the numbers', () => {
    expect(exchangeBenefits(game())).toBe('each of their settlements teaches your colonists again 25 years or so after it last taught (up to twice), their chiefs welcome your scouts again once a decade, and they gather 25% more for sale');
  });
});

describe('renewed teaching (N7)', () => {
  it('teaches once without an exchange, as before', () => {
    const s = game();
    const st = firstSettlement(s);
    const first = st.skill!;
    const u = beside(s, 'england', st);
    learnSkill(s, u.id, st.id);
    expect(u.type).toBe(first);
    expect(st.skill).toBeNull();
    expect(st.taughtAt).toBe(s.turn);
    yearsOn(s, 40);
    expect(settlementTeaches(s, st, 'england')).toBeNull();
    const v = beside(s, 'england', st);
    expect(() => learnSkill(s, v.id, st.id)).toThrow(/nothing more to teach/);
  });

  it('teaches a partner again 25 ± 5 years after it last taught, a skill of its people', () => {
    const { s, st } = exchanging();
    const u = beside(s, 'england', st);
    learnSkill(s, u.id, st.id);
    const taught = st.taughtAt!;
    const again = teachAgainTurn(s, st)!;
    const cal = calendarOf(s);
    const years = yearValue(again, cal) - yearValue(taught, cal);
    expect(years).toBeGreaterThanOrEqual(20);
    expect(years).toBeLessThanOrEqual(30);
    expect(settlementTeaches(s, st, 'england')).toBeNull();
    s.turn = again - 1;
    expect(settlementTeaches(s, st, 'england')).toBeNull();
    s.turn = again;
    const skill = settlementTeaches(s, st, 'england');
    expect(skill).toBe(renewedSkill(s, st));
    expect(peopleOf(s, st.tribe).skills).toContain(skill);
    // Only the partner: France has no exchange with the people.
    expect(settlementTeaches(s, st, 'france')).toBeNull();
    const f = beside(s, 'france', st);
    expect(() => learnSkill(s, f.id, st.id)).toThrow(/nothing more to teach/);
    const v = beside(s, 'england', st);
    learnSkill(s, v.id, st.id);
    expect(v.type).toBe(skill);
    expect(st.taughtAt).toBe(again);
    // And again a generation later, not at once.
    expect(settlementTeaches(s, st, 'england')).toBeNull();
    expect(teachAgainTurn(s, st)!).toBeGreaterThan(again);
    expect(st.renewed).toBe(1);
  });

  it('teaches again at most `renewals` times (twice in the engine), then has nothing more to teach', () => {
    const { s, st } = exchanging();
    expect(peopleTreatyRules(s).exchange.renewals).toBe(2);
    learnSkill(s, beside(s, 'england', st).id, st.id);
    expect(st.renewed).toBeUndefined();
    for (let i = 1; i <= 2; i++) {
      s.turn = teachAgainTurn(s, st)!;
      learnSkill(s, beside(s, 'england', st).id, st.id);
      expect(st.renewed).toBe(i);
    }
    expect(renewalsSpent(s, st)).toBe(true);
    expect(teachAgainTurn(s, st)).toBeUndefined();
    yearsOn(s, 60);
    expect(settlementTeaches(s, st, 'england')).toBeNull();
    const v = beside(s, 'england', st);
    expect(() => learnSkill(s, v.id, st.id)).toThrow(/nothing more to teach/);
    // The count survives a save.
    expect(deserialize(serialize(s)).settlements[st.id].renewed).toBe(2);
  });

  it('teaches a skill drawn per settlement and teaching, the same each time it is asked', () => {
    const { s, st } = exchanging();
    st.skill = null;
    st.taughtAt = s.turn;
    const a = renewedSkill(s, st);
    expect(renewedSkill(deserialize(serialize(s)), deserialize(serialize(s)).settlements[st.id])).toBe(a);
    expect(teachAgainTurn(s, st)).toBe(teachAgainTurn(s, st));
  });

  it('ends with the exchange', () => {
    const { s, st } = exchanging();
    st.skill = null;
    st.taughtAt = 0;
    expect(settlementTeaches(s, st, 'england')).not.toBeNull();
    for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) o.tension.england = 700;
    processNatives(s);
    expect(hasExchange(s, 'england', st.tribe)).toBe(false);
    expect(settlementTeaches(s, st, 'england')).toBeNull();
  });
});

describe('scouts welcome again (N7)', () => {
  it('a chief speaks with a partner\'s scouts again once a decade, and only with a partner\'s', () => {
    const { s, st } = exchanging();
    const u = scout(s, 'england', st);
    for (const o of Object.values(s.settlements)) o.tension.england = 0;
    speakToChief(s, u.id, st.id);
    expect(st.visited).toContain('england');
    expect(st.spokeAt?.england).toBe(s.turn);
    expect(chiefWelcomes(s, st, 'england')).toBe(false);
    u.moves = 3;
    expect(speakToChief(s, u.id, st.id)).toMatch(/welcome them again in 10 years/);
    s.turn = chiefAgainTurn(s, st, 'england')!;
    expect(chiefWelcomes(s, st, 'england')).toBe(true);
    u.moves = 3;
    const gold = player(s, 'england').gold;
    const text = speakToChief(s, u.id, st.id);
    expect(text).not.toMatch(/already spoken/);
    expect(st.visited.filter((n) => n === 'england')).toHaveLength(1);
    expect(st.spokeAt?.england).toBe(s.turn);
    expect(player(s, 'england').gold).toBeGreaterThanOrEqual(gold);
    // France, with no exchange, is spoken with once.
    const f = scout(s, 'france', st);
    st.tension.france = 0;
    speakToChief(s, f.id, st.id);
    yearsOn(s, 20);
    f.moves = 3;
    expect(chiefWelcomes(s, st, 'france')).toBe(false);
    expect(speakToChief(s, f.id, st.id)).toBe('The chief has already spoken with your scouts.');
  });
});

describe('gathering, endings', () => {
  it('the people gathers 25% more while it has an exchange with anyone', () => {
    const s = game();
    const total = (o: Settlement) => Object.values(settlementProduce(s, o)).reduce((n, v) => n + (v ?? 0), 0);
    const st = Object.values(s.settlements).sort((a, b) => total(b) - total(a))[0];
    expect(total(st)).toBeGreaterThan(4);
    partners(s, 'england', st);
    const trade = deserialize(serialize(s));
    proposePeopleTreaty(s, 'england', st.tribe, 'exchange');
    expect(hasExchange(s, 'england', st.tribe)).toBe(true);
    const sum = (g: GameState) => Object.values(settlementProduce(g, g.settlements[st.id])).reduce((n, v) => n + (v ?? 0), 0);
    const without = sum(trade);
    const withExchange = sum(s);
    expect(withExchange).toBeGreaterThan(without);
    expect(Math.abs(withExchange - without * 1.25)).toBeLessThanOrEqual(2);
  });

  it('ends when the trade treaty ends, and with breaking faith', () => {
    const { s, st } = exchanging();
    const trade = allTreaties(s).find((t) => t.kind === 'people-trade')!;
    trade.end = { turn: s.turn, why: 'cancelled', by: { kind: 'people', id: st.tribe } };
    processNatives(s);
    expect(hasExchange(s, 'england', st.tribe)).toBe(false);
    expect(allTreaties(s).find((t) => t.kind === 'exchange')!.end).toMatchObject({ why: 'cancelled' });

    const g = game();
    const gst = firstSettlement(g);
    partners(g, 'england', gst);
    proposePeopleTreaty(g, 'england', gst.tribe, 'exchange');
    const land = g.map.tiles.findIndex((_, i) => nativeLandOwner(g, i % g.map.width, Math.floor(i / g.map.width))?.tribe === gst.tribe);
    takeLand(g, 'england', land % g.map.width, Math.floor(land / g.map.width));
    expect(hasExchange(g, 'england', gst.tribe)).toBe(false);
    expect(hasPeopleTrade(g, 'england', gst.tribe)).toBe(false);
    expect(allTreaties(g).find((t) => t.kind === 'exchange')!.end).toMatchObject({ why: 'broken', by: 'england' });
  });
});

describe('computer players and the switch', () => {
  it('are shared per level as N11 says: Creative seeks it, Competent at 0.6, Combative and Naive do not propose', () => {
    expect(LEVEL_COOPERATION.creative.exchange).toBe(1);
    expect(LEVEL_COOPERATION.competent.exchange).toBe(0.6);
    expect(LEVEL_COOPERATION.combative.exchange).toBe(0);
    expect(LEVEL_COOPERATION.naive.exchange).toBe(0);
  });

  it('agree on exchanges in computer games and learn again, and the save stays a plain JSON tree', () => {
    const s = createGame({ seed: 1000, mapSize: 'medium', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: QUICK.id });
    const taught = new Map<string, number>();
    let renewed = 0;
    for (let i = 0; i < 300 * 4 && !s.gameOver && !renewed; i++) {
      applyCommand(s, { type: 'endTurn' });
      for (const st of Object.values(s.settlements)) {
        const before = taught.get(st.id);
        if (st.taughtAt !== undefined && before !== undefined && st.taughtAt !== before) renewed++;
        if (st.taughtAt !== undefined) taught.set(st.id, st.taughtAt);
      }
    }
    const exchanges = allTreaties(s).filter((t) => t.kind === 'exchange');
    expect(exchanges.length).toBeGreaterThan(0);
    for (const t of exchanges) expect(['creative', 'competent']).toContain(player(s, t.parties[0].id as NationId).ai);
    expect(renewed).toBeGreaterThan(0);
    const back = deserialize(serialize(s));
    expect(serialize(back)).toBe(serialize(s));
    expect(JSON.parse(JSON.stringify(s.settlements))).toEqual(s.settlements);
  }, 120_000);

  it('is off without the switch: nothing is noted, no exchange is made', () => {
    const s = createGame({ seed: 1000, mapSize: 'small', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: NO_EXCHANGE.id });
    for (let i = 0; i < 60 * 4 && !s.gameOver; i++) applyCommand(s, { type: 'endTurn' });
    expect(Object.values(s.settlements).some((st) => st.taughtAt !== undefined || st.spokeAt !== undefined)).toBe(false);
    expect(allTreaties(s).some((t) => t.kind === 'exchange')).toBe(false);
  }, 60_000);
});
