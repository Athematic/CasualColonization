/**
 * Terms, nations per scenario and the New game screen's choices (docs/design/scenario-framework.md,
 * step 7). The Americas' terms are today's exact strings (the golden test checks whole games); a
 * test-only scenario that renames England, changes its colour, port and colony names and uses other
 * terms shows them in the game's messages, and a game code carries it.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  AMERICAS_TEXT,
  createGame,
  decodeGameCode,
  encodeGameCode,
  fillTemplate,
  MAP_SIZES,
  nationOf,
  nationTitle,
  newGameOptions,
  playableScenarios,
  playUntil,
  portName,
  portSummary,
  registerScenario,
  scenarioOf,
  settingsFromConfig,
  STAT_INFO,
  term,
  Term,
  turnOfYear,
  withTerms,
  type GameConfig,
  type NationEntry,
  type Scenario,
} from '../src/index.js';

const rename = (e: NationEntry): NationEntry =>
  e.id === 'england'
    ? { ...e, name: 'Great Britain', adjective: 'British', color: '#123456', colonyNames: ['Port Testing', 'New Testville'], port: { ...e.port, name: 'Portsmouth' } }
    : e;

/** The Americas with Britain for England, and other words for the homeland, the colonies and the council. */
const BRITAIN: Scenario = {
  ...AMERICAS,
  id: 'test-britain',
  name: 'Test: Britain',
  hidden: true,
  nations: {
    ...AMERICAS.nations,
    sets: { alternative: AMERICAS.nations.sets.alternative.map(rename), real: AMERICAS.nations.sets.real!.map(rename) },
    crown: { ...AMERICAS.nations.crown, name: 'the Admiralty', color: '#000001' },
  },
  text: { homeland: 'the Old Country', colonyLand: 'the Far Shore', council: 'Assembly of Notables', 'rumour.lost': 'Lost at {homeland}.' },
};
registerScenario(BRITAIN);

/** A scenario with stored maps only, a short calendar and no charter. */
const ISLANDS: Scenario = {
  ...AMERICAS,
  id: 'test-stored-only',
  name: 'Test: stored maps only',
  hidden: true,
  map: { ...AMERICAS.map, generator: undefined, default: 'generated', stored: AMERICAS.map.stored.filter((m) => m.id === 'south-america' || m.id === 'americas') },
  calendar: { eras: [{ from: 1650, turnsPerYear: 2, seasons: ['spring', 'autumn'] }], end: { year: 1750, season: 'autumn' }, headStartYears: [1675, 1700] },
  mechanics: { ...AMERICAS.mechanics, charter: false },
  victory: [{ id: 'time' }],
};
registerScenario(ISLANDS);

const config = (over: Partial<GameConfig> = {}): GameConfig => ({
  seed: 77,
  mapSize: 'small',
  nations: ['england', 'france', 'spain'],
  humans: [],
  ai: { england: 'competent', france: 'competent', spain: 'naive' },
  colonyCharter: true,
  ...over,
});

describe('terms', () => {
  it('are today\'s exact strings in the Americas', () => {
    const s = { config: {} };
    expect(term(s, 'homeland')).toBe('Europe');
    expect(term(s, 'colonyLand')).toBe('the New World');
    expect(term(s, 'council')).toBe('Continental Congress');
    expect(Term(s, 'crown')).toBe('The Crown');
    expect(term(s, 'arrival', { nation: 'England', heading: 'west' })).toBe("Your Majesty's expedition for England has reached the New World. Sail west to find land!");
    expect(term(s, 'rumour.fountain')).toBe('You have found the Fountain of Youth! Four new colonists wait on the docks in Europe.');
    expect(term(s, 'rumour.smallTreasure', { gold: 0 })).toBe('You find a small trinket cache worth 0 gold.');
    expect(term(s, 'gameOver.time', { year: 1850 })).toBe('The year 1850 has come and the age of colonization is over.');
    expect(term(s, 'gameOver.playOn')).toBe('Every nation has fought its War of Independence.');
    expect(term(s, 'gameOver.won', { nation: 'the Netherlands' })).toBe('the Netherlands has won the War of Independence! A new nation is born.');
    expect(withTerms(s, STAT_INFO.tax.description)).toBe('The Crown’s tax rate.');
    expect(withTerms(s, STAT_INFO.explored.description)).toBe('Share of the New World’s land explored.');
    expect(withTerms(s, STAT_INFO.fathers.name)).toBe('Founding Fathers');
  });

  it('fill templates from the variables, then the terms; a capital placeholder capitalises', () => {
    const terms = { homeland: 'the Old Country' };
    expect(fillTemplate('{Homeland} calls; {homeland} waits; {missing} stays', terms)).toBe('The Old Country calls; the Old Country waits; {missing} stays');
    expect(fillTemplate('{homeland}', terms, { homeland: 'given' })).toBe('given');
  });

  it('follow a scenario that changes them, the rest staying the Americas\'', () => {
    const s = { config: { scenario: BRITAIN.id } };
    expect(term(s, 'homeland')).toBe('the Old Country');
    expect(term(s, 'rumour.fountain')).toBe('You have found the Fountain of Youth! Four new colonists wait on the docks in the Old Country.');
    expect(term(s, 'rumour.lost')).toBe('Lost at the Old Country.');
    expect(term(s, 'king')).toBe(AMERICAS_TEXT.king);
  });
});

describe('nations per scenario', () => {
  it('read the Americas\' names, adjectives, colours and ports from the scenario', () => {
    const s = { config: {} };
    expect(nationOf(s, 'netherlands')).toMatchObject({ name: 'the Netherlands', adjective: 'Dutch', color: '#e8820c' });
    expect(nationTitle(s, 'netherlands')).toBe('The Netherlands');
    expect(portName(s, 'netherlands')).toBe('Amsterdam');
    expect(nationOf(s, 'crown').name).toBe('the Crown');
    expect(portName(s, 'crown')).toBe('London');
  });

  it('show a renamed nation, its colour, port and colony names in a game', () => {
    const s = createGame(config({ scenario: BRITAIN.id }));
    expect(nationOf(s, 'england')).toMatchObject({ name: 'Great Britain', adjective: 'British', color: '#123456' });
    expect(nationTitle(s, 'england')).toBe('Great Britain');
    expect(portName(s, 'england')).toBe('Portsmouth');
    expect(portSummary(nationOf(s, 'england').port, AMERICAS.goods)).toMatch(/^Portsmouth: /);
    expect(nationOf(s, 'crown').name).toBe('the Admiralty');
    const arrival = s.messages.find((m) => m.to === 'england')!.text;
    expect(arrival).toBe("Your Majesty's expedition for Great Britain has reached the Far Shore. Sail west to find land!");

    // Its first colony takes the scenario's colony names.
    playUntil(s, 40);
    const names = Object.values(s.colonies).filter((c) => c.owner === 'england').map((c) => c.name);
    expect(names[0]).toBe('Port Testing');
    // Nothing the engine wrote names England or Europe; the scenario's words are used instead.
    const texts = [...s.messages.map((m) => m.text), ...(s.history ?? []).map((e) => e.text)];
    expect(texts.filter((t) => /\bEngland\b|\bEnglish\b|\bEurope\b|the New World|Continental Congress/.test(t))).toEqual([]);
    expect(texts.some((t) => t.includes('Great Britain') || t.includes('British'))).toBe(true);
  });

  it('refuse a nation the scenario does not have', () => {
    const one: Scenario = { ...AMERICAS, id: 'test-one-nation', hidden: true, nations: { ...AMERICAS.nations, sets: { alternative: [AMERICAS.nations.sets.alternative[0]] }, default: 'alternative' } };
    registerScenario(one);
    expect(() => nationOf({ config: { scenario: one.id } }, 'russia')).toThrow(/not one of the nations/);
  });
});

describe('New game options', () => {
  it('list only the scenarios meant for people', () => {
    const ids = playableScenarios().map((sc) => sc.id);
    expect(ids).toContain('americas');
    expect(ids).not.toContain(BRITAIN.id);
    expect(ids).not.toContain(ISLANDS.id);
  });

  it('come from the Americas as the screen offered them before', () => {
    const o = newGameOptions(AMERICAS);
    expect(o.generated).toBe(true);
    expect(o.defaultMap).toBe('');
    expect(o.maps.map((m) => m.id)).toEqual(['north-america', 'south-america', 'americas', 'australia']);
    expect(o.sizes).toEqual((Object.keys(MAP_SIZES) as (keyof typeof MAP_SIZES)[]).map((id) => ({ id, ...MAP_SIZES[id] })));
    expect(o.firstYear).toBe(1492);
    expect(o.startYears.map((y) => y.year)).toEqual([1550, 1600, 1650, 1700, 1750, 1800]);
    expect(o.startYears[3].turn).toBe(turnOfYear(1700));
    expect(o.nations.alternative).toHaveLength(8);
    expect(o.nations.real).toEqual(['england', 'france', 'netherlands', 'spain']);
    expect(o.rivals).toBe('alternative');
    expect(o.charter).toEqual({ base: 100, cap: 2000 });
    expect(o.victory).toEqual(['Independence by war', 'An alliance holding most of the score at the end wins together', 'Highest score when time runs out']);
  });

  it('follow another scenario: its maps, no generated map, its calendar, no charter', () => {
    const o = newGameOptions(ISLANDS);
    expect(o.generated).toBe(false);
    expect(o.sizes).toEqual([]);
    expect(o.maps.map((m) => m.id)).toEqual(['south-america', 'americas']);
    expect(o.defaultMap).toBe('south-america');
    expect(o.firstYear).toBe(1650);
    expect(o.startYears).toEqual([{ year: 1675, turn: 50 }, { year: 1700, turn: 100 }]);
    expect(o.charter).toBe(false);
    expect(o.victory).toEqual(['Highest score when time runs out']);
  });
});

describe('game codes', () => {
  const americas = config({ humans: ['england'], ai: { france: 'competent', spain: 'naive' } });

  it('are unchanged for the Americas', () => {
    const code = encodeGameCode(settingsFromConfig(americas));
    const payload = JSON.parse(atob(code.split('~')[2].replace(/-/g, '+').replace(/_/g, '/'))) as unknown[];
    expect(payload).toHaveLength(8);
    expect(encodeGameCode(settingsFromConfig({ ...americas, scenario: 'americas' }))).toBe(code);
    const decoded = decodeGameCode(code);
    expect(decoded.ok).toBe(true);
    expect(decoded.ok ? decoded.settings.scenario : 'none').toBeUndefined();
  });

  it('carry another scenario, with or without real rivals', () => {
    for (const rivals of [undefined, 'real' as const]) {
      const cfg = { ...americas, scenario: BRITAIN.id, ...(rivals ? { rivals } : {}) };
      const settings = settingsFromConfig(cfg);
      expect(settings.scenario).toBe(BRITAIN.id);
      const decoded = decodeGameCode(encodeGameCode(settings));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(decoded.settings).toEqual(settings);
      expect(decoded.settings.rivals).toBe(rivals);
    }
  });

  it('refuse a scenario this version does not have', () => {
    const code = encodeGameCode({ ...settingsFromConfig(americas), scenario: 'test-no-such-scenario' });
    const decoded = decodeGameCode(code);
    expect(decoded.ok).toBe(false);
    expect(!decoded.ok && decoded.error).toMatch(/test-no-such-scenario/);
  });

  it('start the same game in the scenario', () => {
    const s = createGame(config({ scenario: BRITAIN.id }));
    expect(scenarioOf(s).id).toBe(BRITAIN.id);
    expect(s.config.scenarioVersion).toBeUndefined();
  });
});
