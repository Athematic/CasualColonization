/**
 * A native people's ways of living from the land (docs/design/native-nations.md T6, T10; Beta 3
 * step 2). Drafted for Simon's review: the numbers are a first tuning, to be measured in step 9.
 *
 * Every food a town gathers is food in the warehouse: fish, game and the gardens' maize, beans
 * and squash are told apart by the way they are got (`wayOf`), not stored as goods of their own.
 * A worker's `ways` (rules/units.ts) multiply the land's yield for the ways it knows; land health
 * (land.ts) wears and scales the hunting way only.
 */
import type { GoodId } from './goods.js';
import { TERRAIN, type TerrainId } from './terrain.js';
import type { Tile } from '../types.js';

/**
 * The ways of getting food and goods from a tile:
 * - `fishing`: food from water.
 * - `gardens`: food from open land where gardens grow (maize, beans and squash).
 * - `hunting`: furs anywhere, and food from forest or from open land where gardens do not grow
 *   (deer and moose in the woods, caribou on the barrens). The way land health wears (T10).
 * - `other`: anything else (wood, stone, ore).
 */
export type WayId = 'hunting' | 'fishing' | 'gardens' | 'other';

/** The rules of a people's stores and gardens; a scenario changes them with `Scenario.peopleEconomy`. */
export interface PeopleEconomy {
  /**
   * Years of its people's food a town keeps as its reserve (T10, default 1): food below the
   * reserve is the store; only food above it counts towards a birth. A people may have its own
   * (`PeopleDef.storeYears`, through `peoples.overrides`).
   */
  storeYears: number;
  /** Food any town can keep in store, before drying racks, smokehouses and storage pits add theirs. */
  storeBase: number;
  /**
   * Terrains where gardens of maize, beans and squash grow (T6: where the climate allows, the St
   * Lawrence valley and south, not Newfoundland). Elsewhere food from open land is hunted.
   */
  gardens: readonly TerrainId[];
}

/** The engine's rules for a people's economy. */
export const PEOPLE_ECONOMY: PeopleEconomy = {
  storeYears: 1,
  storeBase: 50,
  gardens: ['plains', 'grassland', 'prairie', 'savannah', 'hills'],
};

/** The way a tile's good is got (`gardens` reads the economy's garden terrains). */
export function wayOf(tile: Tile, good: GoodId, gardens: readonly TerrainId[]): WayId {
  if (good === 'furs') return 'hunting';
  if (good !== 'food') return 'other';
  if (TERRAIN[tile.t].water) return 'fishing';
  if (tile.f && TERRAIN[tile.t].forest) return 'hunting';
  return gardens.includes(tile.t) ? 'gardens' : 'hunting';
}
