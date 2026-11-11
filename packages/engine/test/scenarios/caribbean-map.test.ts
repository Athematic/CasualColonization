/**
 * The stored Caribbean map (maps/caribbean.ts), the Caribbean scenario's default: its landmarks at
 * their real coordinates, the straits between them, its terrain and peoples, and a full computer game
 * on it. The checks every stored map passes are in test/maps.test.ts and test/scenarios.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { CARIBBEAN, createGame, newGameOptions, parseStoredMap, storedMap, TERRAIN, type AiLevel, type GameMap, type GameState, type NationId, type TerrainId } from '../../src/index.js';
import { playArenaGame } from '../../src/arena.js';
import { caribbeanTile } from '../../src/maps/caribbean.js';

const map = parseStoredMap(storedMap('caribbean'));
const at = (lon: number, lat: number) => {
  const { x, y } = caribbeanTile(lon, lat);
  return { x, y, tile: map.tiles[y * map.width + x] };
};
const isLand = (lon: number, lat: number) => !TERRAIN[at(lon, lat).tile.t].water;

/** Land masses: each land tile's component number (8-connected, as units move). */
function components(m: GameMap): number[] {
  const comp = new Array<number>(m.tiles.length).fill(-1);
  let next = 0;
  m.tiles.forEach((t, i) => {
    if (TERRAIN[t.t].water || comp[i] >= 0) return;
    const stack = [i];
    comp[i] = next;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % m.width;
      const y = Math.floor(j / m.width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height) continue;
          const k = yy * m.width + xx;
          if (comp[k] < 0 && !TERRAIN[m.tiles[k].t].water) {
            comp[k] = next;
            stack.push(k);
          }
        }
      }
    }
    next++;
  });
  return comp;
}
const comp = components(map);
const massOf = (lon: number, lat: number) => {
  const { x, y } = caribbeanTile(lon, lat);
  return comp[y * map.width + x];
};
const sizeOf = (lon: number, lat: number) => comp.filter((c) => c === massOf(lon, lat)).length;

// Towns and islands at their real coordinates (longitude, latitude).
const PLACES: Record<string, [number, number]> = {
  Havana: [-82.36, 23.13],
  'Santiago de Cuba': [-75.82, 20.02],
  'Port Royal': [-76.84, 17.94],
  'Santo Domingo': [-69.93, 18.47],
  'Cap-Français': [-72.2, 19.76],
  'San Juan': [-66.1, 18.46],
  'Port of Spain': [-61.51, 10.66],
  // Barbados lies across a row boundary; its middle rather than Bridgetown on its south-west coast.
  Barbados: [-59.55, 13.17],
  // Nassau's island, New Providence, by its middle: the town lies on its north shore, across a row boundary.
  Nassau: [-77.4, 25.03],
  'Grand Cayman': [-81.25, 19.32],
  'St Thomas': [-64.93, 18.34],
  'St Croix': [-64.75, 17.73],
  'St Kitts': [-62.72, 17.3],
  Antigua: [-61.8, 17.07],
  Guadeloupe: [-61.55, 16.2],
  Dominica: [-61.37, 15.42],
  Martinique: [-61.02, 14.64],
  'St Lucia': [-60.97, 13.9],
  'St Vincent': [-61.2, 13.25],
  Grenada: [-61.68, 12.1],
  Tobago: [-60.7, 11.23],
  Curaçao: [-68.93, 12.17],
  Bonaire: [-68.27, 12.17],
  Cartagena: [-75.51, 10.42],
  Portobelo: [-79.65, 9.55],
  Campeche: [-90.4, 19.85],
  Maracaibo: [-71.8, 10.65],
};
const MAINLAND: [number, number] = [-66.9, 9.0];

describe('the stored Caribbean map', () => {
  it('is the scenario’s default map, with the generated archipelago still on offer', () => {
    const o = newGameOptions(CARIBBEAN);
    expect(o.maps.map((m) => m.id)).toEqual(['caribbean']);
    expect(o.defaultMap).toBe('caribbean');
    expect(o.generated).toBe(true);
    expect([map.width, map.height]).toEqual([100, 62]);
  });

  it('has the towns and islands on land at their real coordinates', () => {
    for (const [name, [lon, lat]] of Object.entries(PLACES)) expect(isLand(lon, lat), name).toBe(true);
  });

  it('keeps the islands apart from each other and from the mainland', () => {
    const islands = ['Havana', 'Port Royal', 'Santo Domingo', 'San Juan', 'Port of Spain', 'Barbados', 'Nassau', 'Grand Cayman', 'St Thomas', 'St Kitts', 'Antigua', 'Guadeloupe', 'Dominica', 'Martinique', 'St Lucia', 'St Vincent', 'Grenada', 'Tobago', 'Curaçao', 'Bonaire'];
    const masses = islands.map((n) => massOf(...PLACES[n]));
    expect(Object.fromEntries(islands.map((n, i) => [n, masses.filter((m) => m === masses[i]).length]))).toEqual(Object.fromEntries(islands.map((n) => [n, 1])));
    expect(masses).not.toContain(massOf(...MAINLAND));
    // Central and South America are one land mass from the Yucatán to the Guiana coast.
    expect(massOf(...PLACES.Campeche)).toBe(massOf(...MAINLAND));
    expect(massOf(...PLACES.Portobelo)).toBe(massOf(...MAINLAND));
    // The Greater Antilles in their order of size; Santiago de Cuba is on Cuba, Cap-Français on Hispaniola.
    const [cuba, hispaniola, jamaica, puertoRico] = ['Havana', 'Santo Domingo', 'Port Royal', 'San Juan'].map((n) => sizeOf(...PLACES[n]));
    expect(cuba).toBeGreaterThan(hispaniola);
    expect(hispaniola).toBeGreaterThan(jamaica);
    expect(jamaica).toBeGreaterThanOrEqual(puertoRico);
    expect(puertoRico).toBeGreaterThan(5);
    expect(massOf(...PLACES['Santiago de Cuba'])).toBe(massOf(...PLACES.Havana));
    expect(massOf(...PLACES['Cap-Français'])).toBe(massOf(...PLACES['Santo Domingo']));
  });

  it('has open water in the straits and passages', () => {
    const straits: Record<string, [number, number]> = {
      'Florida Straits': [-81.0, 24.1],
      'Yucatán Channel': [-85.8, 21.8],
      'Windward Passage': [-73.8, 20.0],
      'Jamaica Channel': [-75.5, 18.3],
      'Mona Passage': [-67.5, 18.6],
      'Anegada Passage': [-63.8, 18.0],
      'Dominica Passage': [-61.4, 15.75],
      'St Lucia Channel': [-60.95, 14.3],
      "Dragon's Mouth": [-62.0, 10.6],
      'Caribbean Sea': [-75.0, 14.0],
      'Gulf of Mexico': [-89.0, 25.0],
      'Gulf of Honduras': [-88.3, 16.2],
      'Gulf of Venezuela': [-71.0, 11.6],
    };
    for (const [name, [lon, lat]] of Object.entries(straits)) expect(isLand(lon, lat), name).toBe(false);
    // Lake Maracaibo opens to the Gulf of Venezuela; Lake Nicaragua is a lake.
    expect(isLand(-71.5, 9.8)).toBe(false);
    expect(isLand(-85.4, 11.6)).toBe(false);
  });

  it('follows the real terrain', () => {
    const terrain = (lon: number, lat: number): TerrainId => at(lon, lat).tile.t;
    // The Cordillera Central (Pico Duarte), the Sierra Maestra (Pico Turquino), the Blue Mountains,
    // the Sierra Nevada de Santa Marta, the Talamanca and the Andes of Mérida.
    for (const [lon, lat] of [[-70.99, 19.03], [-76.84, 19.99], [-76.6, 18.15], [-73.7, 10.85], [-83.5, 9.5], [-71.0, 8.6]]) expect(terrain(lon, lat), `${lon},${lat}`).toBe('mountains');
    // Swamp and marsh in the Orinoco delta, along the Mosquito Coast and in the Everglades.
    for (const [lon, lat] of [[-61.5, 9.0], [-83.5, 14.0], [-81.0, 25.6]]) expect(['swamp', 'marsh'], `${lon},${lat}`).toContain(terrain(lon, lat));
    // Savannah in the llanos; desert in the Guajira.
    expect(terrain(-67.5, 8.5)).toBe('savannah');
    expect(terrain(-71.9, 11.8)).toBe('desert');
    // The Atlantic beyond the Lesser Antilles is high seas, all the way to the arrival edge.
    expect(terrain(-57.0, 16.0)).toBe('highSeas');
    // The main rivers.
    expect(at(-63.5, 8.15).tile.rv).toBe(2);
    expect(at(-74.6, 9.6).tile.rv).toBe(2);
    expect(at(-84.2, 10.85).tile.rv).toBeDefined();
  });

  it('places the Kalinago on Dominica and St Vincent and leaves the Greater Antilles nearly empty', () => {
    for (const seed of [1, 2, 3]) {
      const s = createGame({ seed, mapSize: 'small', map: 'caribbean', nations: ['courland'], humans: [], scenario: 'caribbean' });
      const settlements = Object.values(s.settlements);
      const on = (name: string) => settlements.filter((st) => comp[st.y * map.width + st.x] === massOf(...PLACES[name]));
      for (const island of ['Dominica', 'St Vincent']) expect(on(island).map((st) => st.tribe), `${island}, seed ${seed}`).toEqual(['kalinago']);
      expect(on('Port of Spain').map((st) => st.tribe)).toEqual(['arawak']);
      expect([...on('Havana'), ...on('Santo Domingo'), ...on('Port Royal'), ...on('San Juan')].map((st) => st.tribe)).toEqual(['arawak']);
      expect(on('Nassau')).toHaveLength(0);
      expect(new Set(settlements.map((st) => st.tribe))).toEqual(new Set(['arawak', 'kalinago', 'tupi']));
    }
  });
});

describe('a full computer game on the stored Caribbean map', () => {
  const levels: AiLevel[] = ['competent', 'combative', 'creative', 'naive'];
  const ALL: NationId[] = ['england', 'france', 'netherlands', 'spain', 'denmark', 'courland', 'brandenburg', 'scotland', 'malta'];
  const line = ALL.map((nation, i) => ({ nation, level: levels[i % levels.length] }));
  let played: GameState | undefined;
  const play = () => (played ??= playArenaGame(1650, line, 300, 'medium', 'caribbean', false, undefined, false, true, true, { scenario: 'caribbean' }).state);

  it('runs its 202 turns to autumn 1750, and every nation founds a colony', () => {
    const s = play();
    expect(s.config.map).toBe('caribbean');
    expect(s.gameOver?.turn).toBe(201);
    expect(s.gameOver?.winner).toBeDefined();
    // A company chartered in the last years may not have founded one yet (the West India Company
    // in this game since Beta 2's treaties with peoples: chartered three turns before the end).
    for (const p of s.players) if (!p.company || p.company.founded < 180) expect(p.coloniesFounded, p.id).toBeGreaterThan(0);
  }, 180_000);
});
