/**
 * The stored North-east map (maps/north-east.ts; native-nations.md T19 and section 13), the North-east
 * scenario's map: its landmarks at their real coordinates, the straits, lakes and islands, no strait
 * or isthmus meeting only at a corner (hex-maps.md H11), its terrain and rivers, its land-health
 * regions, and where its peoples live. The checks every stored map passes are in test/maps.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createGame, mapRegionGrid, NORTH_EAST, parseStoredMap, storedMap, storedMapEntry, TERRAIN, type GameMap, type GameState, type TerrainId } from '../../src/index.js';
import { NORTH_EAST_PEOPLES, NORTH_EAST_RENEWAL, northEastTile } from '../../src/maps/north-east.js';

const def = storedMap('north-east');
const map = parseStoredMap(def);
const at = (lon: number, lat: number) => {
  const { x, y } = northEastTile(lon, lat);
  return { x, y, tile: map.tiles[y * map.width + x] };
};
const isLand = (lon: number, lat: number) => !TERRAIN[at(lon, lat).tile.t].water;
const water = (x: number, y: number) => TERRAIN[map.tiles[y * map.width + x].t].water;

/** Each tile's component number (8-connected, as units and ships move): land masses, or bodies of water. */
function components(m: GameMap, wanted: (x: number, y: number) => boolean): number[] {
  const comp = new Array<number>(m.tiles.length).fill(-1);
  let next = 0;
  for (let i = 0; i < m.tiles.length; i++) {
    if (comp[i] >= 0 || !wanted(i % m.width, Math.floor(i / m.width))) continue;
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
          if (comp[k] < 0 && wanted(xx, yy)) {
            comp[k] = next;
            stack.push(k);
          }
        }
      }
    }
    next++;
  }
  return comp;
}
const lands = components(map, (x, y) => !water(x, y));
const waters = components(map, (x, y) => water(x, y));
const massOf = (lon: number, lat: number) => {
  const { x, y } = northEastTile(lon, lat);
  return lands[y * map.width + x];
};
const sheetOf = (lon: number, lat: number) => {
  const { x, y } = northEastTile(lon, lat);
  return waters[y * map.width + x];
};

// Towns, sites and islands at their real coordinates (longitude, latitude). Points on a shore are
// taken a little inland, where the coast falls across a tile's edge.
const PLACES: Record<string, [number, number]> = {
  "St. John's": [-52.75, 47.55],
  'Quebec (Stadacona)': [-71.25, 46.8],
  'Montreal (Hochelaga)': [-73.6, 45.5],
  'Trois-Rivières': [-72.55, 46.35],
  Tadoussac: [-69.75, 48.15],
  Ottawa: [-75.7, 45.4],
  Kingston: [-76.55, 44.35],
  Toronto: [-79.4, 43.7],
  Niagara: [-79.05, 43.1],
  Albany: [-73.76, 42.65],
  Manhattan: [-73.97, 40.78],
  Boston: [-71.1, 42.36],
  Plymouth: [-70.67, 41.96],
  Providence: [-71.41, 41.82],
  Hartford: [-72.68, 41.76],
  Portland: [-70.3, 43.66],
  Halifax: [-63.6, 44.66],
  'Annapolis Royal (Port-Royal)': [-65.51, 44.74],
  'Saint John': [-66.06, 45.27],
  Charlottetown: [-63.13, 46.3],
  Louisbourg: [-60.0, 45.92],
  Gaspé: [-64.5, 48.83],
  'Corner Brook': [-57.95, 48.95],
  'Red Bay (Butus), above the harbour': [-56.6, 51.8],
  Nain: [-61.69, 56.54],
  'Goose Bay': [-60.42, 53.3],
  'Onondaga (Syracuse)': [-76.15, 43.05],
  Huronia: [-79.88, 44.6],
  Anticosti: [-63.0, 49.45],
  'Long Island': [-73.0, 40.85],
  Hebron: [-62.6, 58.2],
};
const WATER: Record<string, [number, number]> = {
  'Strait of Belle Isle': [-56.6, 51.45],
  'Cabot Strait': [-59.8, 47.3],
  'Northumberland Strait': [-63.6, 46.1],
  'Gulf of St. Lawrence': [-62.0, 48.5],
  'Bay of Fundy': [-66.0, 45.0],
  'Gulf of Maine': [-68.5, 43.0],
  'Long Island Sound': [-72.8, 41.12],
  'Lake Melville': [-59.5, 53.7],
  'the estuary at Rimouski': [-68.6, 48.6],
  'the estuary below Quebec': [-70.7, 47.1],
  'Lake Ontario': [-77.5, 43.6],
  'Lake Erie': [-81.0, 42.2],
  'Lake Champlain': [-73.3, 44.5],
  'Lake Simcoe': [-79.4, 44.4],
  'Georgian Bay': [-80.8, 45.2],
  'Lac Saint-Jean': [-72.05, 48.6],
  'Lake Nipissing': [-79.9, 46.25],
  'Lake Mistassini': [-73.4, 50.8],
  'James Bay': [-80.5, 52.5],
  'Hudson Bay': [-79.5, 57.5],
  'the Atlantic': [-51.0, 45.0],
};

describe('the stored North-east map', () => {
  it('is the scenario’s only map, 84 by 74 tiles, with no generated map', () => {
    expect([map.width, map.height]).toEqual([84, 74]);
    expect(NORTH_EAST.map.stored.map((e) => e.id)).toEqual(['north-east']);
    expect(NORTH_EAST.map.default).toBe('north-east');
    expect(NORTH_EAST.map.generator).toBeUndefined();
    // The projection: the map's corners and middle.
    expect(northEastTile(-81.9, 58.4)).toEqual({ x: 0, y: 0 });
    expect(northEastTile(-50.0, 40.1)).toEqual({ x: 83, y: 73 });
    expect(northEastTile(-66.0, 49.25)).toEqual({ x: 41, y: 37 });
  });

  it('has the towns, sites and islands on land at their real coordinates', () => {
    for (const [name, [lon, lat]] of Object.entries(PLACES)) expect(isLand(lon, lat), name).toBe(true);
  });

  it('has open water in the straits, the gulf, the estuary and the lakes', () => {
    for (const [name, [lon, lat]] of Object.entries(WATER)) expect(isLand(lon, lat), name).toBe(false);
  });

  it('keeps the islands apart and Labrador on the continent', () => {
    const continent = massOf(...PLACES['Montreal (Hochelaga)']);
    for (const island of ["St. John's", 'Anticosti', 'Charlottetown']) {
      expect(massOf(...PLACES[island]), island).not.toBe(continent);
      for (const other of ["St. John's", 'Anticosti', 'Charlottetown']) if (other !== island) expect(massOf(...PLACES[island])).not.toBe(massOf(...PLACES[other]));
    }
    // Newfoundland is one island, from St. John's to Corner Brook; Labrador, Gaspé, Nova Scotia
    // (with Cape Breton, joined at this scale) and New England are the continent.
    expect(massOf(...PLACES['Corner Brook'])).toBe(massOf(...PLACES["St. John's"]));
    for (const place of ['Nain', 'Goose Bay', 'Hebron', 'Gaspé', 'Halifax', 'Louisbourg', 'Boston', 'Manhattan', 'Huronia']) expect(massOf(...PLACES[place]), place).toBe(continent);
    const size = (lon: number, lat: number) => lands.filter((c) => c === massOf(lon, lat)).length;
    expect(size(...PLACES["St. John's"])).toBeGreaterThan(100);
    expect(size(...PLACES.Anticosti)).toBeGreaterThan(5);
    expect(size(...PLACES.Charlottetown)).toBeGreaterThan(5);
  });

  it('joins the sea through the straits, and keeps the Great Lakes, Champlain and the inland lakes apart from it', () => {
    const sea = sheetOf(...WATER['the Atlantic']);
    for (const name of ['Strait of Belle Isle', 'Cabot Strait', 'Northumberland Strait', 'Gulf of St. Lawrence', 'Bay of Fundy', 'Gulf of Maine', 'Long Island Sound', 'Lake Melville', 'the estuary at Rimouski', 'the estuary below Quebec']) {
      expect(sheetOf(...WATER[name]), name).toBe(sea);
    }
    for (const name of ['Lake Ontario', 'Lake Erie', 'Lake Champlain', 'Lake Simcoe', 'Lac Saint-Jean', 'Lake Nipissing', 'Lake Mistassini']) expect(sheetOf(...WATER[name]), name).not.toBe(sea);
    // Hudson Bay and James Bay are reached through Hudson Strait, off the map.
    expect(sheetOf(...WATER['James Bay'])).toBe(sheetOf(...WATER['Hudson Bay']));
    expect(sheetOf(...WATER['James Bay'])).not.toBe(sea);
    // Ships reach Stadacona: Quebec's tile touches the estuary.
    const q = at(...PLACES['Quebec (Stadacona)']);
    let touches = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (water(q.x + dx, q.y + dy) && waters[(q.y + dy) * map.width + q.x + dx] === sea) touches = true;
    expect(touches).toBe(true);
  });

  it('has no strait or isthmus that meets only at a corner (hex-maps.md H11)', () => {
    const corners: string[] = [];
    for (let y = 0; y + 1 < map.height; y++) {
      for (let x = 0; x + 1 < map.width; x++) {
        const a = water(x, y);
        const d = water(x + 1, y + 1);
        if (a === d && water(x + 1, y) === water(x, y + 1) && a !== water(x + 1, y)) corners.push(`${x},${y}`);
      }
    }
    expect(corners).toEqual([]);
  });

  it('follows the real terrain', () => {
    const terrain = (lon: number, lat: number): TerrainId => at(lon, lat).tile.t;
    // The Torngats, Mount Marcy (the Adirondacks), Mount Washington, Mont Jacques-Cartier (the
    // Chic-Chocs) and Katahdin.
    for (const [lon, lat] of [[-63.6, 58.4], [-73.93, 44.11], [-71.3, 44.27], [-65.95, 48.95], [-68.92, 45.9]]) expect(terrain(lon, lat), `${lon},${lat}`).toBe('mountains');
    // Tundra and boreal forest in Labrador, Nunavik and Newfoundland; open tundra on the northern Labrador coast.
    for (const [lon, lat] of [[-63.0, 58.0], [-65.0, 54.0], [-55.6, 48.95], [-75.0, 55.0]]) expect(terrain(lon, lat), `${lon},${lat}`).toBe('tundra');
    expect(at(-63.0, 58.0).tile.f).toBeFalsy();
    // Conifer forest on the Shield and in the Maritimes; mixed forest from the St. Lawrence valley
    // and Huronia south, broadleaf in the south, open land around the Iroquoian towns.
    for (const [lon, lat] of [[-64.5, 45.0], [-66.5, 46.5], [-77.5, 46.0]]) expect(terrain(lon, lat), `${lon},${lat}`).toBe('grassland');
    for (const [lon, lat] of [[-73.6, 45.5], [-76.6, 43.0], [-79.88, 44.6], [-71.4, 42.6]]) expect(['plains', 'hills'], `${lon},${lat}`).toContain(terrain(lon, lat));
    for (const [lon, lat] of [[-72.7, 41.7], [-74.4, 40.5]]) expect(['prairie', 'hills'], `${lon},${lat}`).toContain(terrain(lon, lat));
    // The Tantramar marsh.
    expect(terrain(-64.25, 45.88)).toBe('marsh');
    // The Atlantic beyond Newfoundland is high seas, the Gulf of St. Lawrence is not.
    expect(terrain(-51.0, 45.0)).toBe('highSeas');
    expect(terrain(-62.0, 48.5)).toBe('ocean');
    // The gardens' terrains (plains, prairie) are not in Newfoundland or Labrador.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.tiles[y * map.width + x].t;
        if ((t === 'plains' || t === 'prairie') && massOf(...PLACES["St. John's"]) === lands[y * map.width + x]) throw new Error(`gardens in Newfoundland at ${x},${y}`);
      }
    }
  });

  it('has the main rivers', () => {
    // The St. Lawrence a major river from Lake Ontario to Quebec, through Montreal and Trois-Rivières.
    for (const place of ['Montreal (Hochelaga)', 'Trois-Rivières', 'Quebec (Stadacona)']) expect(at(...PLACES[place]).tile.rv, place).toBe(2);
    // The Hudson below Albany, the Saint John below Fredericton, the Ottawa at Ottawa: major.
    expect(at(-73.9, 42.0).tile.rv).toBe(2);
    expect(at(-66.6, 45.95).tile.rv).toBe(2);
    expect(at(-75.7, 45.42).tile.rv).toBe(2);
    // The Mohawk, the Connecticut, the Exploits (the Beothuk's river), the Churchill, the Saguenay.
    for (const [lon, lat] of [[-74.3, 42.95], [-72.6, 42.6], [-55.65, 48.95], [-62.0, 53.25], [-70.6, 48.3]]) expect(at(lon, lat).tile.rv, `${lon},${lat}`).toBeDefined();
  });

  it('has fifty land-health regions covering every tile, each with a renewal rate', () => {
    const grid = mapRegionGrid('north-east')!;
    expect(grid).toHaveLength(map.width * map.height);
    const list = def.regions!.list;
    expect(list).toHaveLength(50);
    expect(new Set(list.map((r) => r.id)).size).toBe(50);
    expect(new Set(list.map((r) => r.char)).size).toBe(50);
    for (let r = 0; r < list.length; r++) expect(grid.includes(r), list[r].id).toBe(true);
    // Every region has land and a positive renewal; more forest renews more.
    expect(Object.keys(NORTH_EAST_RENEWAL).sort()).toEqual(list.map((r) => r.id).sort());
    expect(storedMapEntry(NORTH_EAST, 'north-east').renewal).toBe(NORTH_EAST_RENEWAL);
    for (const r of list) expect(NORTH_EAST_RENEWAL[r.id], r.id).toBeGreaterThan(0);
    const regionAt = (lon: number, lat: number) => list[grid[at(lon, lat).y * map.width + at(lon, lat).x]].id;
    expect(regionAt(...PLACES['Onondaga (Syracuse)'])).toBe('finger-lakes');
    expect(regionAt(...PLACES.Huronia)).toBe('huronia');
    expect(regionAt(...PLACES['Quebec (Stadacona)'])).toBe('stadacona');
    expect(regionAt(...PLACES.Nain)).toBe('labrador-north');
    expect(regionAt(...PLACES.Charlottetown)).toBe('pei');
    // A coast's waters share its land's region.
    expect(regionAt(...WATER['Lake Simcoe'])).toBe('huronia');
  });
});

describe('the North-east’s peoples on the map', () => {
  const game = (seed: number): GameState =>
    createGame({ seed, mapSize: 'small', map: 'north-east', nations: ['england', 'france'], humans: [], peoples: ['innu'], scenario: 'north-east' });

  it('places every people of the scenario in its homeland, two tiles apart', () => {
    for (const seed of [1, 2, 3]) {
      const s = game(seed);
      const settlements = Object.values(s.settlements);
      const regionsOf = (tribe: string) => NORTH_EAST_PEOPLES.filter((r) => r.tribe === tribe);
      // Every people nobody plays is on the map, but the Inuit, who come in 1400.
      for (const id of NORTH_EAST.peoples.ids) {
        const own = settlements.filter((st) => st.tribe === id);
        if (id === 'innu' || id === 'inuit') expect(own, `${id}, seed ${seed}`).toHaveLength(0);
        else {
          expect(own.length, `${id}, seed ${seed}`).toBeGreaterThan(0);
          expect(own.filter((st) => st.capital), id).toHaveLength(1);
          for (const st of own) expect(regionsOf(id).some(({ region: [x0, y0, x1, y1] }) => st.x >= x0 && st.x <= x1 && st.y >= y0 && st.y <= y1), `${id} at ${st.x},${st.y}`).toBe(true);
        }
      }
      for (const a of settlements) {
        expect(TERRAIN[s.map.tiles[a.y * s.map.width + a.x].t].water).toBe(false);
        for (const b of settlements) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(2);
      }
      // The Haudenosaunee have a town for each of the Five Nations; the Beothuk are on Newfoundland.
      expect(settlements.filter((st) => st.tribe === 'haudenosaunee')).toHaveLength(5);
      for (const st of settlements.filter((x) => x.tribe === 'beothuk')) expect(lands[st.y * map.width + st.x]).toBe(massOf(...PLACES["St. John's"]));
      // The Innu play: their settlements are their towns.
      expect(Object.values(s.colonies).filter((c) => c.owner === 'innu').length).toBeGreaterThan(3);
    }
  });
});
