import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  BUILDING_ORDER,
  BUILDINGS,
  checkSavedScenario,
  createGame,
  deserialize,
  DIFFICULTY,
  FATHER_CATEGORIES,
  FATHERS,
  getScenario,
  GOODS,
  hasEventSet,
  HOME_PORTS,
  listScenarios,
  NATION_ORDER,
  NATIONS,
  NATIVE_PRODUCE,
  nationSet,
  PORT_CHARACTER,
  registerScenario,
  difficultyTable,
  SaveVersionError,
  scenarioOf,
  serialize,
  STORED_MAPS,
  TRIBE_ORDER,
  TRIBES,
  UNIT_TYPES,
  type GameConfig,
  type Scenario,
} from '../src/index.js';

const small = (extra: Partial<GameConfig> = {}): GameConfig => ({ seed: 3, mapSize: 'small', nations: ['england'], humans: ['england'], ...extra });

describe('scenario registry', () => {
  it('has the Americas first, and games without a scenario play it', () => {
    expect(listScenarios()[0]).toBe(AMERICAS);
    expect(getScenario('americas')).toBe(AMERICAS);
    expect(getScenario('nowhere')).toBeUndefined();
    expect(scenarioOf({ config: {} })).toBe(AMERICAS);
    expect(scenarioOf({ config: { scenario: 'americas' } })).toBe(AMERICAS);
    expect(() => scenarioOf({ config: { scenario: 'nowhere' } })).toThrow('Unknown scenario "nowhere".');
  });

  it('new Americas games do not write the scenario fields, so saves and hashes are unchanged', () => {
    const s = createGame(small());
    expect('scenario' in s.config).toBe(false);
    expect('scenarioVersion' in s.config).toBe(false);
    expect('rivals' in s.config).toBe(false);
    expect(scenarioOf(s)).toBe(AMERICAS);
  });
});

describe('the Americas scenario is today’s tables', () => {
  it('goods, peoples and council', () => {
    expect(AMERICAS.goods).toEqual([...GOODS]);
    expect(AMERICAS.peoples.ids).toEqual(TRIBE_ORDER);
    expect(AMERICAS.peoples.ids).toEqual(Object.keys(TRIBES));
    expect(AMERICAS.peoples.produce).toEqual(NATIVE_PRODUCE);
    expect(AMERICAS.council.members).toEqual(Object.keys(FATHERS));
    expect(AMERICAS.council.members).toHaveLength(25);
    expect(AMERICAS.council.categories).toEqual(FATHER_CATEGORIES);
  });

  it('units and buildings: all of them, in catalogue order', () => {
    expect(AMERICAS.units).toEqual(Object.keys(UNIT_TYPES));
    expect(AMERICAS.buildings).toEqual(BUILDING_ORDER);
  });

  it('nations: all eight as alternative history (the default), the original four as real rivals', () => {
    const { sets, default: def, max } = AMERICAS.nations;
    expect(def).toBe('alternative');
    expect(max).toBe(8);
    expect(sets.alternative.map((e) => e.id)).toEqual(NATION_ORDER);
    expect(sets.real?.map((e) => e.id)).toEqual(['england', 'france', 'netherlands', 'spain']);
    for (const e of [...sets.alternative, ...(sets.real ?? [])]) {
      expect(e.bonus.text).toBe(NATIONS[e.id].bonus);
      expect(e.colonyNames).toEqual(NATIONS[e.id].colonyNames);
      expect(e.port).toEqual(PORT_CHARACTER[e.id]);
      expect(e.port.name).toBe(HOME_PORTS[e.id]);
    }
  });

  it('events, maps, difficulty and score', () => {
    expect(AMERICAS.events).toBe('americas');
    expect(AMERICAS.map.stored).toEqual(STORED_MAPS.map((m) => m.id));
    expect(AMERICAS.map.generated).toBe(true);
    expect(AMERICAS.map.default).toBe('generated');
    // No overrides: the engine's own tables (test/overrides.test.ts).
    expect(difficultyTable(AMERICAS)).toBe(DIFFICULTY);
    expect(AMERICAS.score).toBeUndefined();
    expect(AMERICAS.version).toBe(1);
  });
});

/** Checks that hold for every registered scenario (docs/design/scenario-framework.md, section 5). */
describe.each(listScenarios().map((sc) => [sc.id, sc] as const))('conformance: %s', (_id, sc: Scenario) => {
  it('names only catalogue entries, each once', () => {
    const unique = (ids: readonly string[]) => expect(new Set(ids).size).toBe(ids.length);
    unique(sc.goods);
    unique(sc.peoples.ids);
    unique(sc.council.members);
    unique(sc.units);
    unique(sc.buildings);
    for (const u of sc.units) expect(UNIT_TYPES[u]).toBeDefined();
    for (const b of sc.buildings) expect(BUILDINGS[b]).toBeDefined();
    for (const g of sc.goods) expect(GOODS).toContain(g);
    for (const t of sc.peoples.ids) expect(TRIBES[t]).toBeDefined();
    for (const f of sc.council.members) expect(FATHERS[f]).toBeDefined();
    for (const m of sc.map.stored) expect(STORED_MAPS.some((d) => d.id === m)).toBe(true);
    expect(sc.map.default === 'generated' ? sc.map.generated : sc.map.stored.includes(sc.map.default)).toBe(true);
    expect(hasEventSet(sc.events)).toBe(true);
  });

  it('nation sets fit the limit and name real nations', () => {
    const { sets, max } = sc.nations;
    for (const set of [sets.alternative, sets.real]) {
      if (!set) continue;
      expect(set.length).toBeGreaterThan(0);
      expect(set.length).toBeLessThanOrEqual(max);
      expect(new Set(set.map((e) => e.id)).size).toBe(set.length);
      for (const e of set) {
        expect(NATIONS[e.id]).toBeDefined();
        expect(e.id).not.toBe('crown');
        expect(e.port.name).toBeTruthy();
        expect(e.colonyNames.length).toBeGreaterThan(0);
      }
    }
    expect(nationSet(sc, undefined)).toBe(sc.nations.default === 'real' ? sets.real : sets.alternative);
  });

  it('goods references are closed', () => {
    for (const g of sc.peoples.produce) expect(sc.goods).toContain(g);
    for (const t of sc.peoples.ids) {
      for (const g of TRIBES[t].wants) expect(sc.goods).toContain(g);
      for (const u of TRIBES[t].skills) expect(sc.units).toContain(u);
    }
    const isGood = (g: string) => (GOODS as readonly string[]).includes(g);
    for (const b of sc.buildings) {
      const { input, output } = BUILDINGS[b];
      if (input) expect(sc.goods).toContain(input);
      if (output && isGood(output)) expect(sc.goods).toContain(output);
    }
    for (const u of sc.units) {
      const g = UNIT_TYPES[u].expertFor;
      if (g && isGood(g)) expect(sc.goods).toContain(g);
    }
    for (const list of Object.values(sc.ai.goods)) for (const g of list) expect(sc.goods).toContain(g);
  });

  it('has a council with members in its categories', () => {
    expect(sc.council.categories.length).toBeGreaterThan(0);
    for (const f of sc.council.members) expect(sc.council.categories).toContain(FATHERS[f].category);
  });
});

describe('game settings and the scenario', () => {
  it('refuses unknown scenarios, too many nations and nations outside the chosen set', () => {
    expect(() => createGame(small({ scenario: 'nowhere' }))).toThrow('Unknown scenario "nowhere".');
    expect(() => createGame(small({ nations: [...NATION_ORDER, 'crown'] }))).toThrow('Between 1 and 8 nations can take part.');
    expect(() => createGame(small({ nations: ['portugal'], humans: ['portugal'], rivals: 'real' }))).toThrow('portugal is not one of the nations of The Americas');
    expect(createGame(small({ rivals: 'real' })).config.rivals).toBe('real');
    expect(createGame(small({ nations: ['portugal'], humans: ['portugal'], rivals: 'alternative' })).players[0].id).toBe('portugal');
  });
});

describe('loading saves (Q3)', () => {
  const save = (edit: (config: GameConfig) => void) => {
    const raw = JSON.parse(serialize(createGame(small())));
    edit(raw.config);
    return JSON.stringify(raw);
  };

  it('loads saves without a scenario as the Americas', () => {
    const s = deserialize(save(() => {}));
    expect(scenarioOf(s)).toBe(AMERICAS);
    expect(deserialize(save((c) => { c.scenario = 'americas'; c.scenarioVersion = 1; })).config.scenario).toBe('americas');
  });

  it('refuses a scenario this version does not have', () => {
    const json = save((c) => { c.scenario = 'atlantis'; });
    expect(() => deserialize(json)).toThrow(SaveVersionError);
    expect(() => deserialize(json)).toThrow('This save is from the scenario "atlantis", which this version of the game does not have.');
  });

  it('refuses a newer version of the scenario', () => {
    expect(() => deserialize(save((c) => { c.scenarioVersion = 2; }))).toThrow('This save is from a newer version of The Americas, 1492–1850 (version 2; this game has version 1).');
  });

  it('loads an older version only through the scenario’s migrate step', () => {
    const base = { ...AMERICAS, id: 'test-older', name: 'Test', version: 3 };
    registerScenario(base);
    expect(() => deserialize(save((c) => { c.scenario = 'test-older'; c.scenarioVersion = 2; }))).toThrow('older version of Test (version 2)');

    const seen: number[] = [];
    registerScenario({ ...base, migrate: (from) => seen.push(from) });
    const s = deserialize(save((c) => { c.scenario = 'test-older'; c.scenarioVersion = 2; }));
    expect(seen).toEqual([2]);
    expect(s.config.scenarioVersion).toBe(3);
    expect(checkSavedScenario(s).id).toBe('test-older');
  });
});
