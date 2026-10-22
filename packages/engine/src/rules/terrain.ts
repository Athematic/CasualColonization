import type { GoodId } from './goods.js';

export type TerrainId =
  | 'ocean'
  | 'highSeas'
  | 'plains'
  | 'grassland'
  | 'prairie'
  | 'savannah'
  | 'marsh'
  | 'swamp'
  | 'desert'
  | 'tundra'
  | 'arctic'
  | 'hills'
  | 'mountains';

export type Yields = Partial<Record<GoodId, number>>;

export interface TerrainDef {
  id: TerrainId;
  name: string;
  water: boolean;
  /** Movement cost in move points (3 points = one move). */
  moveCost: number;
  yields: Yields;
  /** Name and yields when the tile is forested; absent if it cannot carry forest. */
  forest?: { name: string; yields: Yields };
  /** Defence bonus in percent for units standing here. */
  defence: number;
  /** The good that a bonus resource on this tile multiplies. */
  bonusGood?: GoodId;
}

const t = (def: TerrainDef) => def;

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  ocean: t({ id: 'ocean', name: 'Ocean', water: true, moveCost: 3, yields: { food: 4 }, defence: 0, bonusGood: 'food' }),
  highSeas: t({ id: 'highSeas', name: 'High Seas', water: true, moveCost: 3, yields: { food: 2 }, defence: 0 }),
  plains: t({
    id: 'plains', name: 'Plains', water: false, moveCost: 3, yields: { food: 5, cotton: 2 }, defence: 0, bonusGood: 'food',
    forest: { name: 'Mixed Forest', yields: { food: 3, furs: 3, lumber: 6 } },
  }),
  grassland: t({
    id: 'grassland', name: 'Grassland', water: false, moveCost: 3, yields: { food: 3, tobacco: 3 }, defence: 0, bonusGood: 'tobacco',
    forest: { name: 'Conifer Forest', yields: { food: 2, furs: 2, lumber: 6 } },
  }),
  prairie: t({
    id: 'prairie', name: 'Prairie', water: false, moveCost: 3, yields: { food: 3, cotton: 3 }, defence: 0, bonusGood: 'cotton',
    forest: { name: 'Broadleaf Forest', yields: { food: 2, furs: 3, lumber: 4 } },
  }),
  savannah: t({
    id: 'savannah', name: 'Savannah', water: false, moveCost: 3, yields: { food: 4, sugar: 3 }, defence: 0, bonusGood: 'sugar',
    forest: { name: 'Tropical Forest', yields: { food: 3, furs: 2, lumber: 4 } },
  }),
  marsh: t({
    id: 'marsh', name: 'Marsh', water: false, moveCost: 6, yields: { food: 3, tobacco: 2, ore: 2 }, defence: 0, bonusGood: 'ore',
    forest: { name: 'Wetland Forest', yields: { food: 2, furs: 2, lumber: 4, ore: 1 } },
  }),
  swamp: t({
    id: 'swamp', name: 'Swamp', water: false, moveCost: 6, yields: { food: 3, sugar: 2, ore: 2 }, defence: 0, bonusGood: 'sugar',
    forest: { name: 'Rain Forest', yields: { food: 2, furs: 1, lumber: 4, ore: 1 } },
  }),
  desert: t({
    id: 'desert', name: 'Desert', water: false, moveCost: 3, yields: { food: 2, cotton: 1, ore: 2 }, defence: 0, bonusGood: 'food',
    forest: { name: 'Scrub Forest', yields: { food: 2, furs: 2, lumber: 2, ore: 1 } },
  }),
  tundra: t({
    id: 'tundra', name: 'Tundra', water: false, moveCost: 3, yields: { food: 3, ore: 2 }, defence: 0, bonusGood: 'ore',
    forest: { name: 'Boreal Forest', yields: { food: 2, furs: 3, lumber: 4, ore: 1 } },
  }),
  arctic: t({ id: 'arctic', name: 'Arctic', water: false, moveCost: 6, yields: {}, defence: 0 }),
  hills: t({ id: 'hills', name: 'Hills', water: false, moveCost: 6, yields: { food: 4, ore: 4 }, defence: 50, bonusGood: 'ore' }),
  mountains: t({ id: 'mountains', name: 'Mountains', water: false, moveCost: 9, yields: { ore: 4, silver: 1 }, defence: 150, bonusGood: 'silver' }),
};

export const FOREST_MOVE_COST = 6;
export const FOREST_DEFENCE = 50;
export const ROAD_MOVE_COST = 1;
/**
 * Moving along a river, between two neighbouring river tiles that the river links, costs the
 * same as a road (1/3 of a move), as in the original game. Road and river do not add up.
 */
export const RIVER_MOVE_COST = ROAD_MOVE_COST;
