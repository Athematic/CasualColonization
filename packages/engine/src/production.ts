import { BUILDINGS, BUILDING_ORDER, BUILDING_SKILL_OUTPUT, PRINTING_BELL_BONUS, type BuildingKind } from './rules/buildings.js';
import { GOODS, type GoodId, type ProductId } from './rules/goods.js';
import { TERRAIN } from './rules/terrain.js';
import { UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import { yieldMultiplier } from './cheats.js';
import { hasFather } from './fathers.js';
import { colonyWorkers, isWater, tileAt } from './queries.js';
import type { Colony, GameState, Tile } from './types.js';

export const FOOD_PER_COLONIST = 2;

export function foodToGrow(colony: Colony): number {
  return colony.owner === 'denmark' ? 160 : 200;
}

/** Sons of Liberty membership in percent. */
export function sonsOfLiberty(s: GameState, colony: Colony, pop = colonyWorkers(s, colony).length): number {
  if (pop === 0) return 0;
  return Math.min(100, Math.floor((colony.liberty / 200 / pop) * 100));
}

/** Royalists in a colony beyond these counts slow production down. */
export const TORY_PENALTY_AT = [6, 10];

/** Production bonus per worker from Sons of Liberty membership, less the Tory penalty. */
export function libertyBonus(s: GameState, colony: Colony, pop = colonyWorkers(s, colony).length): number {
  const sol = sonsOfLiberty(s, colony, pop);
  const tories = pop - Math.round((pop * sol) / 100);
  const penalty = tories > TORY_PENALTY_AT[1] ? 2 : tories > TORY_PENALTY_AT[0] ? 1 : 0;
  return (sol >= 100 ? 2 : sol >= 50 ? 1 : 0) - penalty;
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
  const def = TERRAIN[tile.t];
  const yields = tile.f && def.forest ? def.forest.yields : def.yields;
  let amount = yields[good] ?? 0;
  if (amount === 0) return 0;
  if (tile.p && !tile.f && (good === 'food' || good === 'sugar' || good === 'tobacco' || good === 'cotton')) amount += 1;
  if (tile.r && (good === 'lumber' || good === 'ore' || good === 'silver' || good === 'furs')) amount += 1;
  const bonusGood = tile.f ? 'furs' : def.bonusGood;
  if (tile.b && bonusGood === good) amount *= 2;
  if (tile.rv) amount += RIVER_YIELD_BONUS[tile.rv][good] ?? 0;
  return amount;
}

/** `bonus` is the colony's liberty bonus, when the caller has already worked it out. */
export function tileYield(s: GameState, colony: Colony, x: number, y: number, good: GoodId, unitType: UnitTypeId, bonus = libertyBonus(s, colony)): number {
  const tile = tileAt(s, x, y);
  if (!tile) return 0;
  if (isWater(tile) && colony.buildings.docks === 0) return 0;
  let amount = baseTileYield(tile, good) * yieldMultiplier(s);
  if (amount === 0) return 0;
  const def = UNIT_TYPES[unitType];
  const expert =
    def.expertFor === good &&
    (good !== 'food' || (unitType === 'expertFisherman') === isWater(tile));
  if (expert) amount *= 2;
  if (good === 'furs' && hasFather(s, colony.owner, 'henryHudson')) amount *= 2;
  // Converts know the land: better at farming, fishing and trapping.
  if (unitType === 'nativeConvert' && (good === 'food' || good === 'sugar' || good === 'tobacco' || good === 'cotton' || good === 'furs')) amount += 1;
  return Math.max(0, amount + bonus);
}

/** Goods produced by the colony's centre tile without a worker. */
export function centreProduction(s: GameState, colony: Colony): Partial<Record<GoodId, number>> {
  const tile = tileAt(s, colony.x, colony.y);
  if (!tile) return {};
  const def = TERRAIN[tile.t];
  const yields = tile.f && def.forest ? def.forest.yields : def.yields;
  const out: Partial<Record<GoodId, number>> = {};
  const food = baseTileYield({ ...tile, p: true }, 'food');
  if (food > 0) out.food = food;
  let best: GoodId | undefined;
  for (const g of Object.keys(yields) as GoodId[]) {
    if (g === 'food' || g === 'lumber') continue;
    if (!best || baseTileYield(tile, g) > baseTileYield(tile, best)) best = g;
  }
  if (best) out[best] = baseTileYield({ ...tile, p: true }, best);
  const mult = yieldMultiplier(s);
  if (mult !== 1) for (const g of Object.keys(out) as GoodId[]) out[g]! *= mult;
  return out;
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

function zero(): Record<ProductId, number> {
  const out = Object.fromEntries(GOODS.map((g) => [g, 0])) as Record<ProductId, number>;
  out.hammers = 0;
  out.bells = 0;
  out.crosses = 0;
  return out;
}

export function colonyReport(s: GameState, colony: Colony): ColonyReport {
  const produced = zero();
  const consumed = zero();
  const workers: Record<string, number> = {};
  const buildings: ColonyReport['buildings'] = {};
  const units = colonyWorkers(s, colony);
  const bonus = libertyBonus(s, colony, units.length);

  for (const [g, n] of Object.entries(centreProduction(s, colony)) as [GoodId, number][]) produced[g] += n;

  for (const u of units) {
    if (u.loc.kind !== 'colony' || u.loc.job.kind !== 'tile') continue;
    const n = tileYield(s, colony, u.loc.job.x, u.loc.job.y, u.loc.job.good, u.type, bonus);
    produced[u.loc.job.good] += n;
    workers[u.id] = n;
  }

  consumed.food += units.length * FOOD_PER_COLONIST;

  // Buildings run in dependency order: tools are made before the armory uses them.
  for (const kind of BUILDING_ORDER) {
    const def = BUILDINGS[kind];
    const level = colony.buildings[kind];
    if (!def.output || level === 0) continue;
    let capacity = def.baseOutput?.[level - 1] ?? 0;
    for (const u of units) {
      if (u.loc.kind === 'colony' && u.loc.job.kind === 'building' && u.loc.job.building === kind) {
        const n = buildingCapacityPerWorker(s, colony, kind, u.type, bonus);
        capacity += n;
        workers[u.id] = n;
      }
    }
    if (def.input && kind !== 'carpenter' && hasFather(s, colony.owner, 'adamSmith')) capacity = Math.round(capacity * 1.5);
    let output = capacity;
    if (def.input) {
      const available = colony.goods[def.input] + produced[def.input] - consumed[def.input];
      output = Math.max(0, Math.min(capacity, available));
      consumed[def.input] += output;
    }
    if (kind === 'townHall') {
      let bonus = colony.buildings.printingPress > 0 ? PRINTING_BELL_BONUS[colony.buildings.printingPress - 1] : 0;
      if (hasFather(s, colony.owner, 'thomasJefferson')) bonus += 10;
      if (hasFather(s, colony.owner, 'thomasPaine')) bonus += s.players.find((p) => p.id === colony.owner)?.tax ?? 0;
      output = Math.round(output * (1 + bonus / 100));
    }
    if (kind === 'church' && hasFather(s, colony.owner, 'williamPenn')) output = Math.round(output * 1.5);
    produced[def.output] += output;
    buildings[kind] = { output, capacity };
  }

  const net = zero();
  for (const key of Object.keys(net) as ProductId[]) net[key] = produced[key] - consumed[key];
  return { produced, consumed, net, buildings, workers, population: units.length, sonsOfLiberty: sonsOfLiberty(s, colony, units.length) };
}
