/**
 * Hand-made stored maps, an alternative to the generated map.
 *
 * Each map is drawn as text: one line per row of tiles, north at the top and one
 * character per tile. Lowercase letters are open land, the same letter in uppercase
 * is that land with forest on it.
 *
 *   ~  high seas (the route to Europe)   .  ocean, also lakes
 *   p  plains       P  mixed forest       g  grassland   G  conifer forest
 *   r  prairie      R  broadleaf forest   s  savannah    S  tropical forest
 *   m  marsh        M  wetland forest     w  swamp       W  rain forest
 *   d  desert       D  scrub forest       t  tundra      T  boreal forest
 *   a  arctic       h  hills              ^  mountains
 *
 * Rivers are an optional list of courses in tile coordinates, one river per line, from the
 * source to the water it runs into (or the river it joins); the format is described at
 * `parseRivers` in rivers.ts.
 *
 * Native settlements are placed by region rules: each tribe lists rectangles of the
 * map and how many settlements it should have there. The game seed picks the exact
 * spots, and also sprinkles bonus resources and Lost City Rumours.
 */
import type { TribeId } from '../rules/nations.js';
import { TERRAIN, type TerrainId } from '../rules/terrain.js';
import { randInt } from '../rng.js';
import { parseRivers } from '../rivers.js';
import { entryPoints, newSettlement, sprinkleExtras, type EntrySide, type GeneratedWorld } from '../mapgen.js';
import type { GameMap, Settlement, Tile } from '../types.js';
import { americas } from './americas.js';
import { australia } from './australia.js';
import { northAmerica } from './north-america.js';
import { southAmerica } from './south-america.js';

/** Where a tribe lives: an inclusive tile rectangle and the number of settlements in it. */
export interface TribeRegion {
  tribe: TribeId;
  /** [x0, y0, x1, y1], inclusive. */
  region: [number, number, number, number];
  count: number;
}

export interface StoredMap {
  id: string;
  name: string;
  description: string;
  /** Rows of terrain characters, see the legend above. Blank lines at either end are ignored. */
  rows: string;
  /** River courses, one per line, see `parseRivers` in rivers.ts. Optional. */
  rivers?: string;
  tribes: TribeRegion[];
  /** Rows (inclusive) along the arrival edge where European expeditions arrive. Defaults to the whole height. */
  entryRows?: [number, number];
  /**
   * The edge European expeditions arrive at, on the high seas one tile in from it. Defaults to the east.
   * Ships can sail to Europe from any high seas tile either way.
   */
  entrySide?: EntrySide;
}

export const STORED_MAPS: StoredMap[] = [northAmerica, southAmerica, americas, australia];

export function storedMap(id: string): StoredMap {
  const def = STORED_MAPS.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown map "${id}".`);
  return def;
}

const CHARS: Record<string, TerrainId> = {
  '~': 'highSeas', '.': 'ocean', p: 'plains', g: 'grassland', r: 'prairie', s: 'savannah', m: 'marsh',
  w: 'swamp', d: 'desert', t: 'tundra', a: 'arctic', h: 'hills', '^': 'mountains',
};

/** Turns a stored map's rows into map tiles. Throws on unknown characters or ragged rows. */
export function parseStoredMap(def: StoredMap): GameMap {
  const lines = def.rows.split('\n').map((l) => l.trimEnd());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const width = lines[0]?.length ?? 0;
  const tiles: Tile[] = [];
  lines.forEach((line, y) => {
    if (line.length !== width) throw new Error(`${def.id}: row ${y} has ${line.length} tiles, expected ${width}.`);
    for (const ch of line) {
      const t = CHARS[ch.toLowerCase()];
      const forest = ch !== ch.toLowerCase();
      if (!t || (forest && !TERRAIN[t].forest)) throw new Error(`${def.id}: unknown terrain "${ch}" in row ${y}.`);
      tiles.push(forest ? { t, f: true } : { t });
    }
  });
  const map = { width, height: lines.length, tiles };
  if (def.rivers) parseRivers(map, def.rivers, def.id);
  return map;
}

/** Builds the world for a stored map. The rng only places settlements, bonuses and rumours. */
export function storedWorld(rng: { rng: number }, id: string): GeneratedWorld {
  const def = storedMap(id);
  const map = parseStoredMap(def);
  sprinkleExtras(rng, map);
  const entryRows = def.entryRows ?? [0, map.height - 1];
  // Keep clear of every arrival point any number of nations could use.
  const arrivals = Array.from({ length: 8 }, (_, i) => entryPoints(map, i + 1, entryRows, def.entrySide)).flat();
  const settlements = placeRegionSettlements(rng, map, def.tribes, arrivals);
  for (const st of settlements) delete map.tiles[st.y * map.width + st.x].lcr;
  return def.entrySide ? { map, settlements, entryRows, entrySide: def.entrySide } : { map, settlements, entryRows };
}

const distance = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Places settlements tribe by tribe in turn, so every tribe gets its capital before any
 * tribe gets a second settlement. Settlements stay at least 4 tiles apart and away from
 * the European arrival points.
 */
function placeRegionSettlements(rng: { rng: number }, map: GameMap, regions: TribeRegion[], avoid: { x: number; y: number }[]): Settlement[] {
  const { width, height, tiles } = map;
  const lists = regions.map(({ region: [x0, y0, x1, y1] }) => {
    const list: { x: number; y: number }[] = [];
    for (let y = Math.max(1, y0); y <= Math.min(height - 2, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
        const t = tiles[y * width + x].t;
        if (!TERRAIN[t].water && t !== 'arctic' && t !== 'mountains') list.push({ x, y });
      }
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });
  const placed: Settlement[] = [];
  const counts = regions.map(() => 0);
  const capitals = new Set<TribeId>();
  for (let progress = true; progress; ) {
    progress = false;
    regions.forEach((r, i) => {
      if (counts[i] >= r.count) return;
      const list = lists[i];
      while (list.length) {
        const c = list.pop()!;
        if (placed.some((p) => distance(p.x, p.y, c.x, c.y) < 4)) continue;
        if (avoid.some((a) => distance(a.x, a.y, c.x, c.y) < 2)) continue;
        const capital = !capitals.has(r.tribe);
        capitals.add(r.tribe);
        placed.push(newSettlement(rng, `s${placed.length + 1}`, r.tribe, c.x, c.y, capital));
        counts[i]++;
        progress = true;
        break;
      }
    });
  }
  return placed;
}
