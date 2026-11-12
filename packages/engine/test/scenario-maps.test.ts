/**
 * Maps as scenario data (docs/design/scenario-framework.md, step 6): the generator's settings, the
 * terrains in play, the scenario's stored maps with its peoples on them, and the edge the Crown's
 * forces arrive at. Test-only scenarios with other values show the data drives the game; the
 * Americas reproduce the old generator exactly (golden.test.ts and `npm run bench -- --verify`).
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  AMERICAS_GENERATOR,
  colonySiteProblem,
  createGame,
  createUnit,
  crownSideOf,
  declareIndependence,
  entrySideOf,
  foundColony,
  isCoastal,
  registerScenario,
  TERRAIN,
  type GameConfig,
  type GameState,
  type NationId,
  type Scenario,
  type TerrainId,
} from '../src/index.js';

/**
 * A warm, wet archipelago reached from the west: three land terrains only, small square maps, the
 * high seas on the west edge, no rumours and a bonus on every other tile, settlements 6 tiles apart.
 */
const ISLANDS: Scenario = {
  ...AMERICAS,
  id: 'test-islands',
  name: 'Test: islands from the west',
  terrain: ['ocean', 'highSeas', 'savannah', 'swamp', 'hills'],
  map: {
    ...AMERICAS.map,
    stored: [],
    generator: {
      ...AMERICAS_GENERATOR,
      sizes: { small: { width: 30, height: 30 }, medium: { width: 40, height: 40 }, large: { width: 50, height: 50 } },
      land: { ...AMERICAS_GENERATOR.land, centre: [0.55, 0.5], threshold: 0.3, margin: { west: 5, east: 3, north: 1, south: 1 } },
      climate: {
        heatNoise: 0.35,
        warmth: 0.5,
        poles: { rows: 0, terrain: 'swamp' },
        zones: [{ heights: [{ above: 0.7, terrain: 'hills' }], moisture: [{ below: 0.5, terrain: 'savannah' }, { terrain: 'swamp' }] }],
      },
      entrySide: 'west',
      peoples: { perTiles: 20, min: 3, edgeRows: 1 },
    },
    extras: { bonus: 0.5, coastalBonus: 0, rumours: 0, noRumours: [] },
    settlements: { avoid: ['hills'], spacing: 6 },
    crown: 'entry',
  },
};

/** The Americas' North America map with only the Inca on it, and the Crown always from the east. */
const INCA_NORTH: Scenario = {
  ...AMERICAS,
  id: 'test-inca-north',
  name: 'Test: the Inca in the north',
  map: {
    ...AMERICAS.map,
    stored: [
      { id: 'north-america', peoples: [{ tribe: 'inca', region: [0, 0, 200, 200], count: 9 }] },
      { id: 'australia', peoples: [{ tribe: 'haudenosaunee', region: [0, 0, 200, 200], count: 6 }] },
    ],
    generator: undefined,
    default: 'north-america',
    crown: 'east',
  },
};
registerScenario(ISLANDS);
registerScenario(INCA_NORTH);

const config = (extra: Partial<GameConfig> = {}): GameConfig => ({ seed: 4, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], ...extra });

const land = (s: GameState) => s.map.tiles.filter((t) => !TERRAIN[t.t].water);

describe('generator settings', () => {
  it('the Americas keep the old constants', () => {
    expect(AMERICAS_GENERATOR.sizes).toEqual({ small: { width: 36, height: 44 }, medium: { width: 46, height: 58 }, large: { width: 58, height: 72 } });
    expect(AMERICAS_GENERATOR.entrySide).toBe('east');
    expect(AMERICAS.map.extras).toEqual({ bonus: 0.05, coastalBonus: 0.06, rumours: 0.03, noRumours: ['arctic'] });
    const s = createGame(config());
    const kinds = new Set(land(s).map((t) => t.t));
    for (const t of ['arctic', 'tundra', 'plains'] as TerrainId[]) expect(kinds.has(t)).toBe(true);
    for (let y = 0; y < s.map.height; y++) expect(s.map.tiles[y * s.map.width + s.map.width - 1].t).toBe('highSeas');
    expect(s.map.tiles.some((t) => t.lcr)).toBe(true);
  });

  it('a scenario’s settings decide the size, the terrains, the arrival edge and the extras', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = createGame(config({ seed, scenario: 'test-islands' }));
      expect([s.map.width, s.map.height]).toEqual([30, 30]);
      const kinds = new Set(land(s).map((t) => t.t));
      expect(kinds.size).toBeGreaterThan(0);
      for (const t of kinds) expect(['savannah', 'swamp', 'hills']).toContain(t);
      // Europe lies west: the high seas columns and the arrival points are on the west edge.
      for (let y = 0; y < 30; y++) for (const x of [0, 1]) expect(s.map.tiles[y * 30 + x].t).toBe('highSeas');
      for (const p of s.players) expect(p.entry.x).toBe(1);
      expect(s.messages.some((m) => m.text.includes('Sail east to find land!'))).toBe(true);
      expect(entrySideOf(s)).toBe('west');
      expect(s.map.tiles.some((t) => t.lcr)).toBe(false);
      const bonus = land(s).filter((t) => t.b).length;
      expect(bonus).toBeGreaterThan(land(s).length * 0.3);
      // Settlements avoid hills and keep 6 tiles apart.
      const sts = Object.values(s.settlements);
      expect(sts.length).toBeGreaterThanOrEqual(3);
      for (const a of sts) {
        expect(s.map.tiles[a.y * 30 + a.x].t).not.toBe('hills');
        for (const b of sts) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('a scenario without a generator only offers its stored maps', () => {
    expect(() => createGame(config({ scenario: 'test-inca-north' }))).toThrow(/no generated maps/);
  });
});

describe('stored maps per scenario', () => {
  it('places the scenario’s peoples, not the map’s', () => {
    const americas = createGame(config({ map: 'north-america' }));
    expect(new Set(Object.values(americas.settlements).map((st) => st.tribe)).has('inca')).toBe(false);
    const s = createGame(config({ map: 'north-america', scenario: 'test-inca-north' }));
    const tribes = new Set(Object.values(s.settlements).map((st) => st.tribe));
    expect([...tribes]).toEqual(['inca']);
    expect(Object.values(s.settlements).length).toBeGreaterThanOrEqual(5);
    // The terrain is the map's either way.
    expect(s.map.tiles.map((t) => t.t)).toEqual(americas.map.tiles.map((t) => t.t));
  });

  it('refuses a map the scenario does not list', () => {
    expect(() => createGame(config({ map: 'south-america', scenario: 'test-inca-north' }))).toThrow('Test: the Inca in the north has no map "south-america".');
  });
});

/** Declares independence for England with one rebel colony, and returns the Crown's arrival point. */
function crownEntry(s: GameState): { x: number; y: number } {
  const owner: NationId = 'england';
  found: for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - 3; x++) {
      if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      foundColony(s, u.id, 'Testtown').liberty = 100_000;
      break found;
    }
  }
  declareIndependence(s, owner);
  return s.players.find((p) => p.id === 'crown')!.entry;
}

describe('the Crown’s arrival edge', () => {
  it('the Americas: the map’s arrival edge, east on the generated map and west on the Australia map', () => {
    const generated = createGame(config());
    expect(crownSideOf(generated)).toBe('east');
    expect(crownEntry(generated).x).toBe(generated.map.width - 2);
    const australia = createGame(config({ map: 'australia' }));
    expect(crownSideOf(australia)).toBe('west');
    expect(crownEntry(australia).x).toBe(1);
  });

  it('a scenario can fix the edge', () => {
    const s = createGame(config({ map: 'australia', scenario: 'test-inca-north' }));
    expect(entrySideOf(s)).toBe('west');
    expect(crownSideOf(s)).toBe('east');
    expect(crownEntry(s).x).toBe(s.map.width - 2);
  });

  it('follows a generator’s arrival edge', () => {
    const s = createGame(config({ scenario: 'test-islands' }));
    expect(crownSideOf(s)).toBe('west');
  });
});
