import { TRIBES, type TribeId } from './rules/nations.js';
import type { SettlementKindDef } from './rules/natives.js';
import { TERRAIN, type TerrainId } from './rules/terrain.js';
import type { UnitTypeId } from './rules/units.js';
import { FIRST_BRAVE_AFTER } from './rules/natives.js';
import { random, randInt, pick } from './rng.js';
import { generateRivers } from './rivers.js';
import type { GameMap, MapSize, Settlement, Tile } from './types.js';
import { AMERICAS, AMERICAS_GENERATOR } from './scenarios/americas.js';
import { peopleIn, settlementKindIn } from './scenarios/index.js';
import type { ClimateZone, GeneratorSettings, MapExtras, Scenario } from './scenarios/types.js';

/** The Americas' generated map sizes (the New game screen's choice until it offers each scenario's). */
export const MAP_SIZES: Record<MapSize, { width: number; height: number }> = AMERICAS_GENERATOR.sizes;

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

/** The terrain of a temperature zone: by elevation first, then by moisture. */
function zoneTerrain(zone: ClimateZone, m: number, e: number): TerrainId {
  for (const h of zone.heights ?? []) if (e > h.above) return h.terrain;
  for (const b of zone.moisture) if (b.below === undefined || m < b.below) return b.terrain;
  throw new Error('A climate zone needs a last moisture band without `below`.');
}

/** The terrain a land tile gets from its temperature, moisture and elevation. */
function climateTerrain(climate: GeneratorSettings['climate'], temp: number, m: number, e: number): TerrainId {
  for (const zone of climate.zones) if (zone.below === undefined || temp < zone.below) return zoneTerrain(zone, m, e);
  throw new Error('The climate needs a last zone without `below`.');
}

/**
 * A generated world for a scenario, made by its generator settings (scenarios/types.ts
 * GeneratorSettings). Its peoples, north to south, each get a band of the map.
 */
export function generateMap(rng: { rng: number }, size: MapSize, scenario: Scenario = AMERICAS): GeneratedWorld {
  const gen = scenario.map.generator;
  if (!gen) throw new Error(`${scenario.name} has no generated maps.`);
  const { width, height } = gen.sizes[size];
  const land = octaves(rng, width, height, gen.noise.land);
  const heat = octaves(rng, width, height, gen.noise.heat);
  const wet = octaves(rng, width, height, gen.noise.wet);
  const elev = octaves(rng, width, height, gen.noise.elevation);
  const wood = octaves(rng, width, height, gen.noise.wood);

  const { centre, spread, falloff: fall, threshold, margin: edge } = gen.land;
  const isLand: boolean[] = new Array(width * height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The New World sits around the centre; Europe lies across the high seas on the arrival edge.
      const cx = (x - width * centre[0]) / (width * spread[0]);
      const cy = (y - height * centre[1]) / (height * spread[1]);
      const falloff = cx * cx * fall.x + Math.pow(Math.abs(cy), 4) * fall.y;
      const v = land(x, y) - falloff * fall.strength;
      const margin = x < edge.west || x >= width - edge.east || y < edge.north || y >= height - edge.south;
      isLand[y * width + x] = !margin && v > threshold;
    }
  }

  const { climate } = gen;
  const poles = climate.poles.rows;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isLand[y * width + x]) {
        tiles.push({ t: 'ocean' });
        continue;
      }
      const lat = Math.abs(y - height / 2) / (height / 2);
      const temp = 1 - lat + (heat(x, y) - 0.5) * climate.heatNoise + climate.warmth;
      const m = wet(x, y);
      const e = elev(x, y);
      const t = y < poles || y >= height - poles ? climate.poles.terrain : climateTerrain(climate, temp, m, e);
      const tile: Tile = { t };
      if (TERRAIN[t].forest && wood(x, y) > gen.forest) tile.f = true;
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
      if (tile.t === 'ocean' && !landNear(x, y, gen.highSeas.distance)) tile.t = 'highSeas';
    }
  }
  // The columns along the arrival edge are always high seas.
  const west = gen.entrySide === 'west';
  const [x0, x1] = west ? [0, gen.highSeas.columns] : [width - gen.highSeas.columns, width];
  for (let y = 0; y < height; y++) {
    for (let x = x0; x < x1; x++) tiles[idx(x, y)].t = 'highSeas';
  }

  const map = { width, height, tiles };
  // Rivers draw on their own generator, seeded from this one without advancing it, so the rest of
  // the world (bonuses, rumours, settlements) stays what the seed has always made.
  generateRivers({ rng: (rng.rng ^ 0x2c1b3c6d) | 0 }, map, elev, wet);
  sprinkleExtras(rng, map, scenario.map.extras);
  const settlements = placeSettlements(rng, tiles, width, height, scenario, gen.peoples);
  for (const st of settlements) {
    const tile = tiles[idx(st.x, st.y)];
    delete tile.lcr;
  }
  const entryRows: [number, number] = [0, height - 1];
  return west ? { map, settlements, entryRows, entrySide: 'west' } : { map, settlements, entryRows };
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

/** Scatters bonus resources (on land and on coastal ocean) and Lost City Rumours, at the scenario's odds. */
export function sprinkleExtras(rng: { rng: number }, map: GameMap, extras: MapExtras = AMERICAS.map.extras): void {
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
      if (def.bonusGood && random(rng) < (def.water ? (landNear(x, y) ? extras.coastalBonus : 0) : extras.bonus)) tile.b = true;
      if (!def.water && !extras.noRumours.includes(tile.t) && random(rng) < extras.rumours) tile.lcr = true;
    }
  }
}

/** A native settlement of a kind, with a random skill, defenders and gold for its tribe. */
export function newSettlement(rng: { rng: number }, id: string, tribe: TribeId, x: number, y: number, capital: boolean, kind: SettlementKindDef, skills: readonly UnitTypeId[] = TRIBES[tribe].skills): Settlement {
  const { size } = kind;
  return {
    id,
    tribe,
    x,
    y,
    capital,
    skill: pick(rng, skills),
    visited: [],
    defenders: size + (capital ? 2 : 0) + randInt(rng, 2),
    gold: (size * 150 + randInt(rng, 200)) * (capital ? 2 : 1),
    tension: {},
    braveTimer: FIRST_BRAVE_AFTER,
  };
}

/** Whether a native settlement may stand on a terrain in a scenario. */
export function settlementGround(scenario: Scenario, t: TerrainId): boolean {
  return !TERRAIN[t].water && !scenario.map.settlements.avoid.includes(t);
}

function placeSettlements(rng: { rng: number }, tiles: Tile[], width: number, height: number, scenario: Scenario, rules: GeneratorSettings['peoples']): Settlement[] {
  const peoples = scenario.peoples.ids;
  const { spacing } = scenario.map.settlements;
  const edge = rules.edgeRows;
  const candidates: { x: number; y: number }[] = [];
  for (let y = edge; y < height - edge; y++) {
    for (let x = 0; x < width; x++) {
      if (settlementGround(scenario, tiles[y * width + x].t)) candidates.push({ x, y });
    }
  }
  // Shuffle so placement is spread out.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const target = Math.max(rules.min, Math.round(candidates.length / rules.perTiles));
  const placed: Settlement[] = [];
  const capitals = new Set<TribeId>();
  for (const c of candidates) {
    if (placed.length >= target) break;
    if (placed.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) < spacing)) continue;
    const band = Math.min(peoples.length - 1, Math.floor(((c.y - edge) / (height - 2 * edge)) * peoples.length));
    const tribe = peoples[band];
    const capital = !capitals.has(tribe);
    capitals.add(tribe);
    placed.push(newSettlement(rng, `s${placed.length + 1}`, tribe, c.x, c.y, capital, settlementKindIn(scenario, tribe), peopleIn(scenario, tribe).skills));
  }
  return placed;
}
