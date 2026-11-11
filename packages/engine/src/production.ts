import { BUILDINGS, BUILDING_SKILL_OUTPUT, PRINTING_BELL_BONUS, type BuildingKind } from './rules/buildings.js';
import { buildingsOf } from './scenarios/index.js';
import { GOODS, type GoodId, type ProductId } from './rules/goods.js';
import { TERRAIN } from './rules/terrain.js';
import { UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import { yieldMultiplier } from './cheats.js';
import { modifiers, setOr } from './scenarios/modifiers.js';
import { applyEventModifiers } from './events/modifiers.js';
import { colonyWorkers, isWater, tileAt } from './queries.js';
import type { Colony, GameState, Tile, Unit } from './types.js';

export const FOOD_PER_COLONIST = 2;

/** Food a colony needs to grow a colonist (a nation's bonus may lower it). */
export function foodToGrow(s: GameState, colony: Colony): number {
  return setOr(modifiers(s, colony.owner, 'foodToGrow'), 200);
}

/** Sons of Liberty membership in percent. */
export function sonsOfLiberty(s: GameState, colony: Colony, pop = colonyWorkers(s, colony).length): number {
  if (pop === 0) return 0;
  return Math.min(100, Math.floor((colony.liberty / 200 / pop) * 100));
}

/** Royalists in a colony beyond these counts slow production down. */
export const TORY_PENALTY_AT = [6, 10];

/**
 * After a declaration of independence, a colony with Sons of Liberty below this share is a Tory
 * colony: it resists the cause (one less per worker, see `libertyBonus`, and the unrest in
 * rebellion.ts).
 */
export const TORY_COLONY_BELOW = 30;

/** Production bonus per worker from Sons of Liberty membership, less the Tory penalty. */
export function libertyBonus(s: GameState, colony: Colony, pop = colonyWorkers(s, colony).length): number {
  const sol = sonsOfLiberty(s, colony, pop);
  const tories = pop - Math.round((pop * sol) / 100);
  const penalty = tories > TORY_PENALTY_AT[1] ? 2 : tories > TORY_PENALTY_AT[0] ? 1 : 0;
  // Tories resist a declared rebellion.
  const rebel = s.players.find((p) => p.id === colony.owner)?.independence === 'declared';
  const resisting = rebel && pop > 0 && sol < TORY_COLONY_BELOW ? 1 : 0;
  return (sol >= 100 ? 2 : sol >= 50 ? 1 : 0) - penalty - resisting;
}

/**
 * What a river adds to a tile's yield, by river size (1 minor, 2 major), for the goods the tile
 * already produces; a river never creates a good the land does not yield. Based on the original
 * game and FreeCol's classic rules: farm goods, furs, lumber and ore gain 1 on a minor and 2 on a
 * major river; silver gains 1 on either. The centre tile of a colony on a river gets it too.
 * One table so a scenario can tune it.
 */
export const RIVER_YIELD_BONUS: Record<1 | 2, Partial<Record<GoodId, number>>> = {
  1: { food: 1, sugar: 1, tobacco: 1, cotton: 1, furs: 1, lumber: 1, ore: 1, silver: 1 },
  2: { food: 2, sugar: 2, tobacco: 2, cotton: 2, furs: 2, lumber: 2, ore: 2, silver: 1 },
};

/** Raw yield of a tile for a good before colonist skill. */
export function baseTileYield(tile: Tile, good: GoodId): number {
  return tileYieldOf(tile, good, !!tile.p);
}

/** baseTileYield with the tile taken as plowed or not (`plowed`), whatever `tile.p` says. */
function tileYieldOf(tile: Tile, good: GoodId, plowed: boolean): number {
  const def = TERRAIN[tile.t];
  const yields = tile.f && def.forest ? def.forest.yields : def.yields;
  let amount = yields[good] ?? 0;
  if (amount === 0) return 0;
  if (plowed && !tile.f && (good === 'food' || good === 'sugar' || good === 'tobacco' || good === 'cotton')) amount += 1;
  if (tile.r && (good === 'lumber' || good === 'ore' || good === 'silver' || good === 'furs')) amount += 1;
  const bonusGood = tile.f ? 'furs' : def.bonusGood;
  if (tile.b && bonusGood === good) amount *= 2;
  if (tile.rv) amount += RIVER_YIELD_BONUS[tile.rv][good] ?? 0;
  if (tile.d && good === 'silver') amount = Math.max(1, Math.floor(amount / 2));
  return amount;
}

/** `bonus` is the colony's liberty bonus, when the caller has already worked it out. */
export function tileYield(s: GameState, colony: Colony, x: number, y: number, good: GoodId, unitType: UnitTypeId, bonus = libertyBonus(s, colony)): number {
  const tile = tileAt(s, x, y);
  return workerTileYield(s, colony, tile, good, unitType, landYield(s, colony, tile, good), bonus);
}

/**
 * The part of tileYield that is the same for every worker: the land's yield of the good for the
 * colony, 0 where no worker can produce it there.
 */
export function landYield(s: GameState, colony: Colony, tile: Tile | undefined, good: GoodId): number {
  if (!tile) return 0;
  if (isWater(tile) && colony.buildings.docks === 0) return 0;
  return baseTileYield(tile, good) * yieldMultiplier(s);
}

/** tileYield for a worker, from the tile's `land` (landYield). */
export function workerTileYield(s: GameState, colony: Colony, tile: Tile | undefined, good: GoodId, unitType: UnitTypeId, land: number, bonus: number): number {
  if (!tile) return 0;
  let amount = land;
  if (amount === 0) return 0;
  const def = UNIT_TYPES[unitType];
  const expert =
    def.expertFor === good &&
    (good !== 'food' || (unitType === 'expertFisherman') === isWater(tile));
  if (expert) amount *= 2;
  for (const m of modifiers(s, colony.owner, 'tileYield')) if (m.good === good) amount *= m.mul;
  // Converts know the land: better at farming, fishing and trapping.
  if (unitType === 'nativeConvert' && (good === 'food' || good === 'sugar' || good === 'tobacco' || good === 'cotton' || good === 'furs')) amount += 1;
  return Math.max(0, amount + bonus);
}

/** Goods produced by the colony's centre tile without a worker. */
export function centreProduction(s: GameState, colony: Colony): Partial<Record<GoodId, number>> {
  const centre = centreGoods(s, colony);
  if (!centre) return {};
  const out: Partial<Record<GoodId, number>> = {};
  if (centre.food > 0) out.food = centre.food;
  if (centre.best) out[centre.best] = centre.bestAmount;
  const mult = yieldMultiplier(s);
  if (mult !== 1) for (const g of Object.keys(out) as GoodId[]) out[g]! *= mult;
  return out;
}

/** The goods of a terrain's yields table, in key order, by table (the tables never change). */
const yieldGoods = new WeakMap<object, GoodId[]>();

/**
 * centreProduction before the yield multiplier, without building objects: the centre's food (the
 * tile taken as plowed) and its best other good but lumber (the first in the terrain's yields with
 * the highest yield as the tile is), at its yield as plowed. Null off the map.
 */
function centreGoods(s: GameState, colony: Colony): { food: number; best: GoodId | undefined; bestAmount: number } | null {
  const tile = tileAt(s, colony.x, colony.y);
  if (!tile) return null;
  const def = TERRAIN[tile.t];
  const yields = tile.f && def.forest ? def.forest.yields : def.yields;
  let goods = yieldGoods.get(yields);
  if (!goods) yieldGoods.set(yields, (goods = Object.keys(yields) as GoodId[]));
  let best: GoodId | undefined;
  let bestYield = 0;
  for (const g of goods) {
    if (g === 'food' || g === 'lumber') continue;
    const y = baseTileYield(tile, g);
    if (!best || y > bestYield) {
      best = g;
      bestYield = y;
    }
  }
  return { food: tileYieldOf(tile, 'food', true), best, bestAmount: best ? tileYieldOf(tile, best, true) : 0 };
}

export function buildingCapacityPerWorker(s: GameState, colony: Colony, kind: BuildingKind, unitType: UnitTypeId, bonus = libertyBonus(s, colony)): number {
  const def = BUILDINGS[kind];
  const level = colony.buildings[kind];
  if (level === 0 || !def.output) return 0;
  const u = UNIT_TYPES[unitType];
  const expert = u.expertFor === def.output;
  const skillIndex = expert ? 3 : unitType === 'nativeConvert' ? 1 : Math.max(0, Math.min(2, u.skill + 2));
  const levelFactor = level >= 2 ? 2 : 1;
  return Math.max(0, BUILDING_SKILL_OUTPUT[skillIndex] * levelFactor + bonus);
}

export interface ColonyReport {
  /** Gross production of each product this turn. */
  produced: Record<ProductId, number>;
  /** Consumption of goods (food eaten, raw materials used). */
  consumed: Record<ProductId, number>;
  /** Net change of each good in storage. */
  net: Record<ProductId, number>;
  /** Output of each building and the capacity it could reach with unlimited input. */
  buildings: Partial<Record<BuildingKind, { output: number; capacity: number }>>;
  /** Production per worked tile, keyed by unit id. */
  workers: Record<string, number>;
  population: number;
  sonsOfLiberty: number;
}

// Reports have a zero for every catalogue good: a good a scenario leaves out stays 0 and is
// never added to a warehouse (processColony adds only the goods in play).
const ZERO = (() => {
  const out = Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<ProductId, number>;
  out.hammers = 0;
  out.bells = 0;
  out.crosses = 0;
  return Object.freeze(out);
})();

function zero(): Record<ProductId, number> {
  return { ...ZERO };
}

/** The products of a report in ZERO's key order, which is the key order of every zero(). */
const PRODUCTS = Object.keys(ZERO) as ProductId[];

/**
 * An empty record for keys that come and go, such as unit ids. It starts in V8's dictionary mode
 * (deleting a property other than the last one puts it there), which fills with ever-new keys
 * several times faster than `{}`, whose hidden classes grow a new branch for every new key. In
 * every other way it is `{}`: the same prototype, the same key order.
 */
function idRecord<T>(): Record<string, T> {
  const out: Record<string, unknown> = { a: 0, b: 0 };
  delete out.a;
  delete out.b;
  return out as Record<string, T>;
}

export function colonyReport(s: GameState, colony: Colony): ColonyReport {
  const produced = zero();
  const consumed = zero();
  const workers = idRecord<number>();
  const buildings: ColonyReport['buildings'] = {};
  const units = colonyWorkers(s, colony);
  const bonus = libertyBonus(s, colony, units.length);

  // The centre tile's goods, as centreProduction gives them: two different goods, each added to a zero.
  const centre = centreGoods(s, colony);
  if (centre) {
    const mult = yieldMultiplier(s);
    if (centre.food > 0) produced.food += mult !== 1 ? centre.food * mult : centre.food;
    if (centre.best) produced[centre.best] += mult !== 1 ? centre.bestAmount * mult : centre.bestAmount;
  }

  // Workers in buildings, by building, each list in the workers' order.
  let inBuilding: Map<BuildingKind, Unit[]> | undefined;
  for (const u of units) {
    if (u.loc.kind !== 'colony') continue;
    const job = u.loc.job;
    if (job.kind === 'building') {
      inBuilding ??= new Map();
      const list = inBuilding.get(job.building);
      if (list) list.push(u);
      else inBuilding.set(job.building, [u]);
      continue;
    }
    const n = tileYield(s, colony, job.x, job.y, job.good, u.type, bonus);
    produced[job.good] += n;
    workers[u.id] = n;
  }

  consumed.food += units.length * FOOD_PER_COLONIST;

  // Buildings run in dependency order: tools are made before the armory uses them.
  for (const kind of buildingsOf(s)) {
    const def = BUILDINGS[kind];
    const level = colony.buildings[kind];
    if (!def.output || level === 0) continue;
    let capacity = def.baseOutput?.[level - 1] ?? 0;
    const here = inBuilding?.get(kind);
    if (here) {
      for (const u of here) {
        const n = buildingCapacityPerWorker(s, colony, kind, u.type, bonus);
        capacity += n;
        workers[u.id] = n;
      }
    }
    if (def.input) for (const m of modifiers(s, colony.owner, 'manufactureCapacity')) if (!m.except?.includes(kind)) capacity = Math.round(capacity * m.mul);
    let output = capacity;
    if (def.input) {
      const available = colony.goods[def.input] + produced[def.input] - consumed[def.input];
      output = Math.max(0, Math.min(capacity, available));
      consumed[def.input] += output;
    }
    if (kind === 'townHall') {
      let bonus = colony.buildings.printingPress > 0 ? PRINTING_BELL_BONUS[colony.buildings.printingPress - 1] : 0;
      for (const m of modifiers(s, colony.owner, 'bellsBonus')) bonus += m.add === 'tax' ? (s.players.find((p) => p.id === colony.owner)?.tax ?? 0) : m.add;
      output = Math.round(output * (1 + bonus / 100));
    }
    for (const m of modifiers(s, colony.owner, 'buildingOutput')) if (m.building === kind) output = Math.round(output * m.mul);
    produced[def.output] += output;
    buildings[kind] = { output, capacity };
  }

  // Storms, sickness, bumper harvests and the like (events/): a percentage on gross production.
  applyEventModifiers(s, colony, produced);

  const net = zero();
  for (const key of PRODUCTS) net[key] = produced[key] - consumed[key];
  return { produced, consumed, net, buildings, workers, population: units.length, sonsOfLiberty: sonsOfLiberty(s, colony, units.length) };
}
