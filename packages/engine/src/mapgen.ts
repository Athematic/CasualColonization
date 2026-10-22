import { TRIBES, TRIBE_ORDER, type TribeId } from './rules/nations.js';
import { TERRAIN, type TerrainId } from './rules/terrain.js';
import { FIRST_BRAVE_AFTER } from './rules/natives.js';
import { random, randInt, pick } from './rng.js';
import { generateRivers } from './rivers.js';
import type { GameMap, MapSize, Settlement, Tile } from './types.js';

export const MAP_SIZES: Record<MapSize, { width: number; height: number }> = {
  small: { width: 36, height: 44 },
  medium: { width: 46, height: 58 },
  large: { width: 58, height: 72 },
};

/** Smooth value noise built from a coarse random lattice. */
function noiseField(rng: { rng: number }, width: number, height: number, cell: number): (x: number, y: number) => number {
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const grid = Array.from({ length: gw * gh }, () => random(rng));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const v = (i: number, j: number) => grid[(j % gh) * gw + (i % gw)];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

function octaves(rng: { rng: number }, width: number, height: number, cells: number[]): (x: number, y: number) => number {
  const fields = cells.map((c) => noiseField(rng, width, height, c));
  const total = cells.reduce((sum, _c, i) => sum + 1 / (i + 1), 0);
  return (x, y) => fields.reduce((sum, f, i) => sum + f(x, y) / (i + 1), 0) / total;
}

/** A new world, generated or loaded from a stored map. */
export interface GeneratedWorld {
  map: GameMap;
  settlements: Settlement[];
  /** Rows (inclusive) along the arrival edge where European expeditions arrive. */
  entryRows: [number, number];
  /** The map edge European expeditions arrive at. Absent means the east edge. */
  entrySide?: EntrySide;
}

/** The map edge whose high seas European expeditions arrive at. */
export type EntrySide = 'east' | 'west';

export function generateMap(rng: { rng: number }, size: MapSize): GeneratedWorld {
  const { width, height } = MAP_SIZES[size];
  const land = octaves(rng, width, height, [9, 4, 2]);
  const heat = octaves(rng, width, height, [7, 3]);
  const wet = octaves(rng, width, height, [6, 3]);
  const elev = octaves(rng, width, height, [5, 2]);
  const wood = octaves(rng, width, height, [4, 2]);

  const isLand: boolean[] = new Array(width * height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The New World sits in the middle; Europe lies across the eastern high seas.
      const cx = (x - width * 0.45) / (width * 0.3);
      const cy = (y - height / 2) / (height * 0.47);
      const falloff = cx * cx * 0.9 + Math.pow(Math.abs(cy), 4) * 0.6;
      const v = land(x, y) - falloff * 0.55;
      const margin = x < 3 || x >= width - 5 || y < 1 || y >= height - 1;
      isLand[y * width + x] = !margin && v > 0.33;
    }
  }

  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isLand[y * width + x]) {
        tiles.push({ t: 'ocean' });
        continue;
      }
      const lat = Math.abs(y - height / 2) / (height / 2);
      const temp = 1 - lat + (heat(x, y) - 0.5) * 0.35;
      const m = wet(x, y);
      const e = elev(x, y);
      let t: TerrainId;
      if (temp < 0.1 || y <= 1 || y >= height - 2) t = 'arctic';
      else if (temp < 0.25) t = e > 0.68 ? 'hills' : 'tundra';
      else if (e > 0.74) t = 'mountains';
      else if (e > 0.64) t = 'hills';
      else if (temp < 0.62) t = m < 0.36 ? 'prairie' : m < 0.52 ? 'plains' : m < 0.68 ? 'grassland' : 'marsh';
      else t = m < 0.33 ? 'desert' : m < 0.6 ? 'savannah' : 'swamp';
      const tile: Tile = { t };
      if (TERRAIN[t].forest && wood(x, y) > 0.47) tile.f = true;
      tiles.push(tile);
    }
  }

  const idx = (x: number, y: number) => y * width + x;
  const landNear = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && isLand[idx(nx, ny)]) return true;
      }
    }
    return false;
  };

  // Deep water far from any coast becomes high seas, the route to Europe.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[idx(x, y)];
      if (tile.t === 'ocean' && !landNear(x, y, 2)) tile.t = 'highSeas';
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = width - 2; x < width; x++) tiles[idx(x, y)].t = 'highSeas';
  }

  const map = { width, height, tiles };
  // Rivers draw on their own generator, seeded from this one without advancing it, so the rest of
  // the world (bonuses, rumours, settlements) stays what the seed has always made.
  generateRivers({ rng: (rng.rng ^ 0x2c1b3c6d) | 0 }, map, elev, wet);
  sprinkleExtras(rng, map);
  const settlements = placeSettlements(rng, tiles, width, height);
  for (const st of settlements) {
    const tile = tiles[idx(st.x, st.y)];
    delete tile.lcr;
  }
  return { map, settlements, entryRows: [0, height - 1] };
}

/**
 * Spreads up to `n` arrival points evenly along the east-edge (or west-edge) high seas between two rows.
 * Over the whole height this is the same spacing the generated map has always used.
 */
export function entryPoints(map: GameMap, n: number, rows: [number, number] = [0, map.height - 1], side: EntrySide = 'east'): { x: number; y: number }[] {
  const [top, bottom] = rows;
  const span = bottom - top + 1;
  const x = side === 'west' ? 1 : map.width - 2;
  return Array.from({ length: n }, (_, i) => ({ x, y: top + Math.round(((i + 1) * span) / (n + 1)) }));
}

/** Scatters bonus resources (on land and on coastal ocean) and Lost City Rumours. */
export function sprinkleExtras(rng: { rng: number }, map: GameMap): void {
  const { width, height, tiles } = map;
  const landNear = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && !TERRAIN[tiles[ny * width + nx].t].water) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y * width + x];
      const def = TERRAIN[tile.t];
      if (def.bonusGood && random(rng) < (def.water ? (landNear(x, y) ? 0.06 : 0) : 0.05)) tile.b = true;
      if (!def.water && tile.t !== 'arctic' && random(rng) < 0.03) tile.lcr = true;
    }
  }
}

/** A native settlement with a random skill, defenders and gold for its tribe. */
export function newSettlement(rng: { rng: number }, id: string, tribe: TribeId, x: number, y: number, capital: boolean): Settlement {
  const def = TRIBES[tribe];
  const size = def.settlement === 'city' ? 3 : def.settlement === 'village' ? 2 : 1;
  return {
    id,
    tribe,
    x,
    y,
    capital,
    skill: pick(rng, def.skills),
    visited: [],
    defenders: size + (capital ? 2 : 0) + randInt(rng, 2),
    gold: (size * 150 + randInt(rng, 200)) * (capital ? 2 : 1),
    tension: {},
    braveTimer: FIRST_BRAVE_AFTER,
  };
}

function placeSettlements(rng: { rng: number }, tiles: Tile[], width: number, height: number): Settlement[] {
  const candidates: { x: number; y: number }[] = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x].t;
      if (!TERRAIN[t].water && t !== 'arctic' && t !== 'mountains') candidates.push({ x, y });
    }
  }
  // Shuffle so placement is spread out.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const target = Math.max(8, Math.round(candidates.length / 34));
  const placed: Settlement[] = [];
  const capitals = new Set<TribeId>();
  for (const c of candidates) {
    if (placed.length >= target) break;
    if (placed.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < 4)) continue;
    const band = Math.min(TRIBE_ORDER.length - 1, Math.floor(((c.y - 2) / (height - 4)) * TRIBE_ORDER.length));
    const tribe = TRIBE_ORDER[band];
    const capital = !capitals.has(tribe);
    capitals.add(tribe);
    placed.push(newSettlement(rng, `s${placed.length + 1}`, tribe, c.x, c.y, capital));
  }
  return placed;
}
