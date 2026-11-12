import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  AMERICAS_GENERATOR,
  BUILDING_ORDER,
  BUILDINGS,
  checkSavedScenario,
  createGame,
  deserialize,
  DIFFICULTY,
  FATHER_CATEGORIES,
  councilById,
  councilIdOf,
  nationTypeIn,
  FATHERS,
  getScenario,
  GOODS,
  hasEventSet,
  HOME_PORTS,
  listScenarios,
  MAP_SIZES,
  parseStoredMap,
  storedMap,
  TERRAIN,
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
  NATION_IDS,
  peopleIn,
  type AmericasNationId,
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
    // The catalogue's first eight peoples; the Kalinago belong to the Caribbean.
    expect(AMERICAS.peoples.ids).toEqual(Object.keys(TRIBES).slice(0, 8));
    expect(AMERICAS.peoples.overrides).toBeUndefined();
    expect(AMERICAS.peoples.produce).toEqual(NATIVE_PRODUCE);
    expect(AMERICAS.councils.congress.members).toEqual(Object.keys(FATHERS).slice(0, 25));
    expect(AMERICAS.councils.congress.members).toHaveLength(25);
    expect(AMERICAS.councils.congress.categories).toEqual(FATHER_CATEGORIES);
  });

  it('units and buildings: all of them, in catalogue order', () => {
    // Every European entry; a native people's own (Beta 3 step 2) come after them in the catalogue.
    expect(AMERICAS.nationTypes.european.units).toEqual(Object.keys(UNIT_TYPES).slice(0, AMERICAS.nationTypes.european.units.length));
    expect(AMERICAS.nationTypes.european.units).toEqual(Object.keys(UNIT_TYPES).filter((t) => !UNIT_TYPES[t as keyof typeof UNIT_TYPES].people));
    expect(AMERICAS.nationTypes.european.buildings).toEqual(BUILDING_ORDER.slice(0, AMERICAS.nationTypes.european.buildings.length));
    expect(AMERICAS.nationTypes.european.buildings).toEqual(BUILDING_ORDER.filter((b) => !BUILDINGS[b].people));
  });

  it('nations: all eight as alternative history (the default), the original four as real rivals', () => {
    const { sets, default: def, max } = AMERICAS.nations;
    expect(def).toBe('alternative');
    expect(max).toBe(8);
    expect(sets.alternative.map((e) => e.id)).toEqual(NATION_ORDER);
    expect(sets.real?.map((e) => e.id)).toEqual(['england', 'france', 'netherlands', 'spain']);
    for (const e of [...sets.alternative, ...(sets.real ?? []), AMERICAS.nations.crown]) {
      // Q2: nations are per scenario; the Americas' are the catalogue's values.
      const id = e.id as AmericasNationId | 'crown';
      expect([e.name, e.adjective, e.color]).toEqual([NATIONS[id].name, NATIONS[id].adjective, NATIONS[id].color]);
      expect(e.bonus.text).toBe(NATIONS[id].bonus);
      expect(e.colonyNames).toEqual(NATIONS[id].colonyNames);
      expect(e.port).toEqual(PORT_CHARACTER[e.id] ?? { name: HOME_PORTS[id] });
      expect(e.port.name).toBe(HOME_PORTS[id]);
    }
  });

  it('events, maps, difficulty and score', () => {
    expect(AMERICAS.events).toBe('americas');
    // Every stored map but the Caribbean's and the North-east's, which belong to their scenarios: the Americas'
    // New game screen offers what it always has.
    expect(AMERICAS.map.stored.map((e) => e.id)).toEqual(['north-america', 'south-america', 'americas', 'australia']);
    expect(STORED_MAPS.map((m) => m.id)).toEqual([...AMERICAS.map.stored.map((e) => e.id), 'caribbean', 'north-east']);
    expect(AMERICAS.map.generator).toBe(AMERICAS_GENERATOR);
    expect(AMERICAS_GENERATOR.sizes).toBe(MAP_SIZES);
    expect(AMERICAS.map.crown).toBe('entry');
    expect(AMERICAS.terrain).toEqual(Object.keys(TERRAIN));
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
    for (const c of Object.values(sc.councils)) unique(c.members);
    for (const type of ['european', 'people'] as const) {
      const sel = nationTypeIn(sc, type);
      unique(sel.units);
      unique(sel.buildings);
      for (const u of sel.units) expect(UNIT_TYPES[u], `${type} ${u}`).toBeDefined();
      for (const b of sel.buildings) expect(BUILDINGS[b], `${type} ${b}`).toBeDefined();
    }
    for (const g of sc.goods) expect(GOODS).toContain(g);
    for (const t of sc.peoples.ids) expect(TRIBES[t]).toBeDefined();
    for (const t of sc.peoples.ids) expect(sc.peoples.settlements[TRIBES[t].lifeway], `a settlement kind for the ${TRIBES[t].lifeway} ${t}`).toBeDefined();
    for (const c of Object.values(sc.councils)) for (const f of c.members) expect(FATHERS[f]).toBeDefined();
    unique(sc.terrain);
    unique(sc.map.stored.map((e) => e.id));
    for (const t of sc.terrain) expect(TERRAIN[t]).toBeDefined();
    for (const m of sc.map.stored) expect(STORED_MAPS.some((d) => d.id === m.id)).toBe(true);
    expect(sc.map.default === 'generated' ? !!sc.map.generator : sc.map.stored.some((e) => e.id === sc.map.default)).toBe(true);
    expect(hasEventSet(sc.events)).toBe(true);
  });

  it('maps use only its terrains and place only its peoples', () => {
    const terrain = new Set(sc.terrain);
    for (const t of ['ocean', 'highSeas'] as const) expect(terrain.has(t)).toBe(true);
    for (const t of [...sc.map.extras.noRumours, ...sc.map.settlements.avoid]) expect(terrain.has(t)).toBe(true);
    for (const e of sc.map.stored) {
      const map = parseStoredMap(storedMap(e.id));
      for (const tile of map.tiles) expect(terrain.has(tile.t), `${tile.t} on ${e.id}`).toBe(true);
      expect(e.peoples.length).toBeGreaterThan(0);
      for (const r of e.peoples) expect(sc.peoples.ids, `${r.tribe} on ${e.id}`).toContain(r.tribe);
    }
    const gen = sc.map.generator;
    if (gen) {
      const { zones, poles } = gen.climate;
      expect(terrain.has(poles.terrain)).toBe(true);
      zones.forEach((z, i) => {
        expect(z.below === undefined, `only the last zone is open-ended`).toBe(i === zones.length - 1);
        for (const h of z.heights ?? []) expect(terrain.has(h.terrain)).toBe(true);
        z.moisture.forEach((b, j) => {
          expect(terrain.has(b.terrain)).toBe(true);
          expect(b.below === undefined).toBe(j === z.moisture.length - 1);
        });
      });
    }
  });

  it('nation sets fit the limit and name real nations', () => {
    const { sets, max } = sc.nations;
    for (const set of [sets.alternative, sets.real]) {
      if (!set) continue;
      expect(set.length).toBeGreaterThan(0);
      expect(set.length).toBeLessThanOrEqual(max);
      expect(new Set(set.map((e) => e.id)).size).toBe(set.length);
      for (const e of set) {
        expect(NATION_IDS).toContain(e.id);
        expect(e.id).not.toBe('crown');
        expect(e.name && e.adjective && e.color).toBeTruthy();
        expect(e.port.name).toBeTruthy();
        expect(e.colonyNames.length).toBeGreaterThan(0);
      }
    }
    expect(nationSet(sc, undefined)).toBe(sc.nations.default === 'real' ? sets.real : sets.alternative);
  });

  it('goods references are closed', () => {
    for (const g of sc.peoples.produce) expect(sc.goods).toContain(g);
    for (const t of sc.peoples.ids) {
      // As the scenario has the people (its overrides of the catalogue's skills and wants).
      const people = peopleIn(sc, t);
      for (const g of people.wants) expect(sc.goods, `${t} want ${g}`).toContain(g);
      for (const u of people.skills) expect(sc.nationTypes.european.units, `${t} teach ${u}`).toContain(u);
    }
    for (const t of Object.keys(sc.peoples.overrides ?? {})) expect(sc.peoples.ids).toContain(t);
    const isGood = (g: string) => (GOODS as readonly string[]).includes(g);
    for (const b of sc.nationTypes.european.buildings) {
      const { input, output } = BUILDINGS[b];
      if (input) expect(sc.goods).toContain(input);
      if (output && isGood(output)) expect(sc.goods).toContain(output);
    }
    for (const u of sc.nationTypes.european.units) {
      const g = UNIT_TYPES[u].expertFor;
      if (g && isGood(g)) expect(sc.goods).toContain(g);
    }
    for (const list of Object.values(sc.ai.goods)) for (const g of list) expect(sc.goods).toContain(g);
  });

  it('has a council for each nation type, with members in its categories', () => {
    // The European nations' council is the scenario's; a people's may be the engine's (rules/councils.ts).
    expect(Object.hasOwn(sc.councils, councilIdOf(sc, 'european'))).toBe(true);
    for (const type of ['european', 'people'] as const) {
      const council = councilById(sc, councilIdOf(sc, type))!;
      expect(council, type).toBeDefined();
      expect(council.categories.length).toBeGreaterThan(0);
      for (const f of council.members) expect(council.categories).toContain(FATHERS[f].category);
    }
  });

  it('switches mechanics on consistently', () => {
    const m = sc.mechanics;
    // A War of Independence needs a Royal Expeditionary Force to fight; boycotts need taxes to refuse.
    if (m.independence) expect(m.ref).toBe(true);
    if (m.boycotts) expect(m.taxes).toBe(true);
    if (m.charter) expect(m.charter.base).toBeGreaterThan(0);
    // Units the mechanics need are in play.
    if (m.ref) for (const u of ['kingsRegular', 'artillery', 'manOfWar'] as const) expect(sc.nationTypes.european.units).toContain(u);
    if (m.customHouse) expect(sc.nationTypes.european.buildings).toContain('customHouse');
  });

  it('has a rumour table with odds', () => {
    expect(sc.rumours.length).toBeGreaterThan(0);
    expect(sc.rumours.some((r) => !r.tribal && r.weight > 0)).toBe(true);
    for (const r of sc.rumours) for (const w of [r.weight, r.scout, r.expert]) if (w !== undefined) expect(w).toBeGreaterThanOrEqual(0);
    if (sc.rumours.some((r) => r.outcome === 'colonist' || r.outcome === 'fountain')) expect(sc.nationTypes.european.units).toContain('freeColonist');
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
