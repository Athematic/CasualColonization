/**
 * Beta 2, step 4 (docs/design/native-partners.md, section 5): mutual defence with a people
 * (`defence`, N7, N9): the ladder (N2), one nation at a time, war on the people drawing in its
 * partner, braves defending the partner's colony, braves against the King's troops, no inciting
 * against the partner, the ally's partner (leaving the alliance), the endings, computer players
 * (N11) and the switch.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  allTreaties,
  applyCommand,
  attack,
  bravesOf,
  colonySiteProblem,
  createGame,
  createUnit,
  declareIndependence,
  defenceBenefits,
  defenceEnemy,
  defencePartner,
  defenceThreshold,
  defenceTreaty,
  deserialize,
  foundColony,
  gridOf,
  hasDefence,
  inciteTribe,
  isAllied,
  isWater,
  makeAlliance,
  makePeopleTreaty,
  peopleRelation,
  peopleTradeThresholds,
  peopleTreatyProblem,
  player,
  processNatives,
  proposePeopleTreaty,
  registerScenario,
  serialize,
  workArea,
  nativeLandOwner,
  type Colony,
  type GameState,
  type NationId,
  type Scenario,
  type Settlement,
  type Unit,
  LEVEL_COOPERATION,
  PEOPLE_TREATY_RULES,
} from '../src/index.js';

/** The Americas with every kind switched on, peoples that say yes when free to, and braves that always answer the call (hidden, for these tests). */
const DEFENCE: Scenario = {
  ...AMERICAS,
  id: 'test-defence',
  name: 'test-defence',
  hidden: true,
  mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade', 'land-use', 'exchange', 'defence'] },
  peopleTreaties: { accept: 1, defence: { defend: 1 } },
};
registerScenario(DEFENCE);

/** Quick thresholds and every computer nation seeking a pact with each trade partner, for computer games. */
const QUICK: Scenario = {
  ...DEFENCE,
  id: 'test-defence-quick',
  name: 'test-defence-quick',
  peopleTreaties: { exchange: { years: { base: 2, spread: 1 } }, landUse: { years: { base: 2, spread: 1 } }, defence: { years: { base: 3, spread: 1 } } },
  ai: { ...DEFENCE.ai, cooperation: { ...DEFENCE.ai.cooperation, proposeExchange: 1 / LEVEL_COOPERATION.competent.exchange, proposeDefence: 1 / LEVEL_COOPERATION.competent.defence } },
};
registerScenario(QUICK);

/** Every kind but defence, as the Americas shipped after step 3. */
const NO_DEFENCE: Scenario = { ...AMERICAS, id: 'test-defence-off', name: 'test-defence-off', hidden: true, mechanics: { ...AMERICAS.mechanics, peopleTreaties: ['people-trade', 'land-use', 'exchange'] } };
registerScenario(NO_DEFENCE);

function game(scenario: string = DEFENCE.id, seed = 42): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: ['england', 'france', 'spain'], scenario });
}

function settlementsOf(s: GameState, st: Settlement): Settlement[] {
  return Object.values(s.settlements).filter((o) => o.tribe === st.tribe);
}

/** A colony of `nation` two tiles from a settlement, with some of the settlement's land beside it. */
function colonyBeside(s: GameState, nation: NationId): { st: Settlement; c: Colony } {
  const grid = gridOf(s);
  for (const st of Object.values(s.settlements)) {
    for (let i = 0; i < s.map.tiles.length; i++) {
      const x = i % s.map.width;
      const y = Math.floor(i / s.map.width);
      if (grid.distance(x, y, st.x, st.y) !== 2 || colonySiteProblem(s, x, y)) continue;
      if (workArea(s, x, y).filter((p) => nativeLandOwner(s, p.x, p.y)?.tribe === st.tribe).length < 2) continue;
      const u = createUnit(s, nation, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return { st, c: foundColony(s, u.id, `Test ${nation}`) };
    }
  }
  throw new Error('no site');
}

/** A unit of `nation` on open land `d` tiles from (x, y), not next to a settlement unless d is 1 from it. */
function unitNear(s: GameState, nation: NationId, at: { x: number; y: number }, d: number, type: Parameters<typeof createUnit>[2] = 'veteranSoldier', away?: { x: number; y: number }): Unit {
  const grid = gridOf(s);
  for (let i = 0; i < s.map.tiles.length; i++) {
    const x = i % s.map.width;
    const y = Math.floor(i / s.map.width);
    if (grid.distance(x, y, at.x, at.y) !== d || isWater(s.map.tiles[i])) continue;
    if (away && grid.distance(x, y, away.x, away.y) < 2) continue;
    if (Object.values(s.settlements).some((o) => o.x === x && o.y === y) || Object.values(s.colonies).some((c) => c.x === x && c.y === y)) continue;
    const u = createUnit(s, nation, type, { kind: 'map', x, y });
    u.role = 'soldier';
    u.moves = 3;
    return u;
  }
  throw new Error('no tile');
}

/** Good relations long enough for every threshold, every settlement content, and a trade treaty. */
function partners(s: GameState, nation: NationId, st: Settlement): void {
  const rel = peopleRelation(s, nation, st.tribe);
  rel.volume = peopleTradeThresholds(s, nation, st.tribe).volume;
  rel.goodSince = 0;
  s.turn = Math.max(s.turn, 200);
  for (const o of settlementsOf(s, st)) o.tension[nation] = 0;
  makePeopleTreaty(s, nation, st.tribe);
}

/** England's colony beside a people, partners in trade, exchange and defence. */
function defended(s: GameState = game()) {
  const { st, c } = colonyBeside(s, 'england');
  partners(s, 'england', st);
  makePeopleTreaty(s, 'england', st.tribe, 'exchange');
  proposePeopleTreaty(s, 'england', st.tribe, 'defence');
  expect(hasDefence(s, 'england', st.tribe)).toBe(true);
  return { s, st, c };
}

function rounds(s: GameState, n: number, until: () => boolean): void {
  for (let i = 0; i < n && !until(); i++) processNatives(s);
}

describe('the ladder (N2, N3)', () => {
  it('is off unless the scenario names it', () => {
    const s = game(NO_DEFENCE.id);
    const st = Object.values(s.settlements)[0];
    partners(s, 'england', st);
    makePeopleTreaty(s, 'england', st.tribe, 'exchange');
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toMatch(/no mutual defence pact with native peoples/);
  });

  it('needs a trade treaty, then land use or an exchange, then years of good relations of its own', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const rel = peopleRelation(s, 'england', st.tribe);
    rel.goodSince = 0;
    s.turn = 200;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toMatch(/needs a trade treaty/);
    partners(s, 'england', st);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toMatch(/needs land use or a cultural exchange/);
    makePeopleTreaty(s, 'england', st.tribe, 'exchange');
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toBeNull();
    const need = defenceThreshold(s, 'england', st.tribe);
    const r = PEOPLE_TREATY_RULES.defence.years;
    expect(need).toBeGreaterThanOrEqual(r.base - r.spread);
    expect(need).toBeLessThanOrEqual(r.base + r.spread);
    rel.goodSince = s.turn;
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toMatch(/do not know you well enough to stand with you/);
  });

  it('is made when proposed and free, and describes itself', () => {
    const { s, st } = defended();
    expect(defenceTreaty(s, 'england', st.tribe)!.parties).toEqual([{ kind: 'nation', id: 'england' }, { kind: 'people', id: st.tribe }]);
    expect(s.messages.some((m) => m.to === 'england' && m.text.includes('mutual defence pact'))).toBe(true);
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toMatch(/already have a mutual defence pact/);
    expect(defenceBenefits(s)).toMatch(/an attack on them is war with you, their braves come to defend your colonies near their land, also against royal troops/);
  });

  it('is kept with one nation at a time', () => {
    const { s, st } = defended();
    partners(s, 'france', st);
    makePeopleTreaty(s, 'france', st.tribe, 'exchange');
    expect(peopleTreatyProblem(s, 'france', st.tribe, 'defence')).toMatch(/already have a mutual defence pact with England/);
    expect(defencePartner(s, st.tribe)).toBe('england');
  });

  it('is not made by a people that submitted to the nation', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    partners(s, 'england', st);
    makePeopleTreaty(s, 'england', st.tribe, 'exchange');
    s.tribes.find((t) => t.id === st.tribe)!.submitted = ['england'];
    expect(peopleTreatyProblem(s, 'england', st.tribe, 'defence')).toMatch(/submitted to you/);
  });

  it('ends when the last of land use and the exchange ends', () => {
    const { s, st } = defended();
    const ex = allTreaties(s).find((t) => t.kind === 'exchange' && !t.end)!;
    ex.end = { turn: s.turn, why: 'cancelled', by: { kind: 'people', id: st.tribe } };
    processNatives(s);
    expect(hasDefence(s, 'england', st.tribe)).toBe(false);
    expect(allTreaties(s).find((t) => t.kind === 'defence')!.end).toMatchObject({ why: 'cancelled' });
  });
});

describe('the pact at war (N7, N9)', () => {
  it('makes an attack on the people war with its partner', () => {
    const { s, st } = defended();
    const u = unitNear(s, 'france', st, 1);
    attack(s, u.id, { settlementId: st.id });
    expect(player(s, 'france').stance.england).toBe('war');
    expect(player(s, 'england').stance.france).toBe('war');
    expect(hasDefence(s, 'england', st.tribe)).toBe(true);
    expect(s.messages.some((m) => m.text.includes('stands by its pact'))).toBe(true);
  });

  it('makes an attack on the people allied with your ally war with that ally: leaving the alliance', () => {
    const { s, st } = defended();
    makeAlliance(s, 'england', 'france');
    expect(isAllied(s, 'england', 'france')).toBe(true);
    const u = unitNear(s, 'france', st, 1);
    attack(s, u.id, { settlementId: st.id });
    expect(isAllied(s, 'england', 'france')).toBe(false);
    expect(player(s, 'france').stance.england).toBe('war');
    const alliance = allTreaties(s).find((t) => t.kind === 'alliance')!;
    expect(alliance.left ?? alliance.end).toBeTruthy();
  });

  it('keeps computer players from attacking a people defended by their ally', () => {
    const { s, st } = defended();
    makeAlliance(s, 'england', 'france');
    player(s, 'france').human = false;
    player(s, 'france').ai = 'competent';
    const u = unitNear(s, 'france', st, 1);
    expect(() => attack(s, u.id, { settlementId: st.id })).toThrow(/defended by a Favoured Nation or an ally/);
    expect(isAllied(s, 'england', 'france')).toBe(true);
  });

  it('brings the braves to defend the partner\'s colony: the people goes to war with the attacker', () => {
    const { s, st, c } = defended();
    rounds(s, 8, () => false);
    const u = unitNear(s, 'france', c, 1, 'veteranSoldier', st);
    u.role = 'dragoon';
    const before = Object.values(bravesOf(s)).filter((b) => s.settlements[b.home]?.tribe === st.tribe).length;
    expect(before).toBeGreaterThan(0);
    attack(s, u.id, { colonyId: c.id });
    const tribe = s.tribes.find((t) => t.id === st.tribe)!;
    expect(tribe.stance.france).toBe('war');
    for (const o of settlementsOf(s, st)) expect(o.tension.france).toBeGreaterThanOrEqual(PEOPLE_TREATY_RULES.defence.tension);
    const called = Object.values(bravesOf(s)).filter((b) => b.task?.kind === 'attack' && b.task.defend === 'england');
    expect(called.length).toBeGreaterThan(0);
    expect(s.messages.some((m) => m.to === 'england' && /come[s]? to defend Test england/.test(m.text))).toBe(true);
    expect(s.messages.some((m) => m.to === 'england' && m.text.includes('take up arms against France'))).toBe(true);
    // The braves reach the attacker and fight it.
    const fought = () => s.messages.some((m) => m.to === 'france' && (m.text.includes('beats off an attack by the') || m.text.startsWith('The ') && m.text.includes(' attack')) && !m.text.includes('hatchet'));
    rounds(s, 12, fought);
    expect(fought()).toBe(true);
    // The pact does not end with the war: the people is at war with France, not England.
    expect(hasDefence(s, 'england', st.tribe)).toBe(true);
  });

  it('sends the braves against the King\'s troops near the partner\'s colony after independence', () => {
    const { s, st, c } = defended();
    c.liberty = 10_000;
    declareIndependence(s, 'england');
    // Next to the colony and to the settlement, so the braves need not walk around the colony.
    const grid0 = gridOf(s);
    const spot = s.map.tiles.findIndex((tile, i) => {
      const x = i % s.map.width;
      const y = Math.floor(i / s.map.width);
      return !isWater(tile) && grid0.distance(x, y, c.x, c.y) === 1 && grid0.distance(x, y, st.x, st.y) === 1;
    });
    expect(spot).toBeGreaterThanOrEqual(0);
    const regular = createUnit(s, 'crown', 'kingsRegular', { kind: 'map', x: spot % s.map.width, y: Math.floor(spot / s.map.width) });
    regular.role = 'soldier';
    regular.against = 'england';
    const grid = gridOf(s);
    const near = settlementsOf(s, st).find((o) => grid.distance(o.x, o.y, c.x, c.y) <= 6)!;
    const index = new Map<number, Unit[]>([[regular.loc.kind === 'map' ? regular.loc.y * s.map.width + regular.loc.x : -1, [regular]]]);
    expect(defenceEnemy(s, near, index, new Map())?.id).toBe(regular.id);
    // No war of the people's own with the Crown; the braves fight for their partner.
    const fought = () => !s.units[regular.id] || regular.role !== 'soldier' || s.messages.some((m) => m.to === 'crown' && m.text.includes('beats off an attack'));
    rounds(s, 20, fought);
    expect(fought()).toBe(true);
    expect(s.messages.some((m) => m.to === 'england' && m.text.includes('fight for you')) || s.messages.some((m) => m.to === 'crown' && m.text.includes('beats off'))).toBe(true);
  });

  it('lets nobody incite the people against its partner', () => {
    const { s, st } = defended();
    const u = unitNear(s, 'france', st, 1, 'freeColonist');
    u.role = 'missionary';
    player(s, 'france').gold = 100_000;
    expect(() => inciteTribe(s, u.id, st.id, 'england')).toThrow(/bound to it by a mutual defence pact/);
    // Against another nation, as before.
    expect(inciteTribe(s, u.id, st.id, 'spain')).toMatch(/make trouble for Spain/);
  });

  it('raises no tension for the partner\'s soldiers standing next to a settlement', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    partners(s, 'england', st);
    makePeopleTreaty(s, 'england', st.tribe, 'exchange');
    proposePeopleTreaty(s, 'england', st.tribe, 'defence');
    const u = unitNear(s, 'england', st, 1);
    u.state = 'fortified';
    for (let i = 0; i < 5; i++) processNatives(s);
    expect(st.tension.england ?? 0).toBe(0);
  });
});

describe('computer players and the switch', () => {
  it('are shared per level as N11 says (Combative makes none: Simon, 11 November 2026)', () => {
    expect(LEVEL_COOPERATION.creative.defence).toBe(1);
    expect(LEVEL_COOPERATION.competent.defence).toBe(0.5);
    expect(LEVEL_COOPERATION.combative.defence).toBe(0);
    expect(LEVEL_COOPERATION.naive.defence).toBe(0);
  });

  it('make defence pacts in computer games, and the save stays a plain JSON tree', () => {
    const s = createGame({ seed: 1000, mapSize: 'medium', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: QUICK.id });
    for (let i = 0; i < 300 * 4 && !s.gameOver && !allTreaties(s).some((t) => t.kind === 'defence'); i++) applyCommand(s, { type: 'endTurn' });
    const pacts = allTreaties(s).filter((t) => t.kind === 'defence');
    expect(pacts.length).toBeGreaterThan(0);
    for (const t of pacts) expect(['creative', 'competent']).toContain(player(s, t.parties[0].id as NationId).ai);
    const back = deserialize(serialize(s));
    expect(serialize(back)).toBe(serialize(s));
    expect(JSON.parse(JSON.stringify(s.braves))).toEqual(s.braves);
  }, 120_000);

  it('is off without the switch: no pact is made', () => {
    const s = createGame({ seed: 1000, mapSize: 'small', nations: ['england', 'france', 'spain', 'netherlands'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'combative', netherlands: 'naive' }, scenario: NO_DEFENCE.id });
    for (let i = 0; i < 60 * 4 && !s.gameOver; i++) applyCommand(s, { type: 'endTurn' });
    expect(allTreaties(s).some((t) => t.kind === 'defence')).toBe(false);
    expect(Object.values(s.braves ?? {}).some((b) => b.task?.kind === 'attack' && b.task.defend)).toBe(false);
  }, 60_000);
});
