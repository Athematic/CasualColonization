import type { GoodId, ProductId } from './goods.js';

export type BuildingKind =
  | 'townHall'
  | 'carpenter'
  | 'blacksmith'
  | 'tobacconist'
  | 'weaver'
  | 'distiller'
  | 'furTrader'
  | 'armory'
  | 'church'
  | 'docks'
  | 'warehouse'
  | 'stockade'
  | 'printingPress';

export interface BuildingLevel {
  name: string;
  hammers: number;
  tools: number;
  minPop: number;
}

export interface BuildingDef {
  kind: BuildingKind;
  /** Index 0 is level 1. */
  levels: BuildingLevel[];
  /** Level a new colony starts with (0 = not built). */
  initialLevel: number;
  workplaces: number;
  input?: GoodId;
  output?: ProductId;
  /** Free production with no workers, per level. */
  baseOutput?: number[];
  coastalOnly?: boolean;
}

const lvl = (name: string, hammers: number, tools: number, minPop: number): BuildingLevel => ({ name, hammers, tools, minPop });

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  townHall: { kind: 'townHall', levels: [lvl('Town Hall', 0, 0, 1)], initialLevel: 1, workplaces: 3, output: 'bells', baseOutput: [1] },
  carpenter: {
    kind: 'carpenter', levels: [lvl("Carpenter's House", 0, 0, 1), lvl('Lumber Mill', 52, 0, 3)],
    initialLevel: 1, workplaces: 3, input: 'lumber', output: 'hammers',
  },
  blacksmith: {
    kind: 'blacksmith', levels: [lvl("Blacksmith's House", 0, 0, 1), lvl("Blacksmith's Shop", 64, 20, 4)],
    initialLevel: 1, workplaces: 3, input: 'ore', output: 'tools',
  },
  tobacconist: {
    kind: 'tobacconist', levels: [lvl("Tobacconist's House", 0, 0, 1), lvl("Tobacconist's Shop", 64, 20, 4)],
    initialLevel: 1, workplaces: 3, input: 'tobacco', output: 'cigars',
  },
  weaver: {
    kind: 'weaver', levels: [lvl("Weaver's House", 0, 0, 1), lvl("Weaver's Shop", 64, 20, 4)],
    initialLevel: 1, workplaces: 3, input: 'cotton', output: 'cloth',
  },
  distiller: {
    kind: 'distiller', levels: [lvl("Distiller's House", 0, 0, 1), lvl("Distiller's Shop", 64, 20, 4)],
    initialLevel: 1, workplaces: 3, input: 'sugar', output: 'rum',
  },
  furTrader: {
    kind: 'furTrader', levels: [lvl("Fur Trader's House", 0, 0, 1), lvl('Fur Trading Post', 56, 20, 3)],
    initialLevel: 1, workplaces: 3, input: 'furs', output: 'coats',
  },
  armory: {
    kind: 'armory', levels: [lvl('Armory', 52, 0, 1), lvl('Magazine', 120, 50, 8)],
    initialLevel: 0, workplaces: 3, input: 'tools', output: 'muskets',
  },
  church: {
    kind: 'church', levels: [lvl('Chapel', 0, 0, 1), lvl('Church', 64, 0, 3)],
    initialLevel: 1, workplaces: 3, output: 'crosses', baseOutput: [1, 2],
  },
  docks: { kind: 'docks', levels: [lvl('Docks', 52, 0, 1)], initialLevel: 0, workplaces: 0, coastalOnly: true },
  warehouse: {
    kind: 'warehouse', levels: [lvl('Warehouse', 80, 0, 1), lvl('Warehouse Expansion', 80, 20, 1)],
    initialLevel: 0, workplaces: 0,
  },
  stockade: { kind: 'stockade', levels: [lvl('Stockade', 64, 0, 3), lvl('Fort', 120, 100, 4)], initialLevel: 0, workplaces: 0 },
  printingPress: {
    kind: 'printingPress', levels: [lvl('Printing Press', 52, 20, 1), lvl('Newspaper', 120, 50, 4)],
    initialLevel: 0, workplaces: 0,
  },
};

export const BUILDING_ORDER: BuildingKind[] = Object.keys(BUILDINGS) as BuildingKind[];

/** Production per worker in a level-1 building, indexed by skill + 2 (criminal..expert). */
export const BUILDING_SKILL_OUTPUT = [1, 2, 3, 6];

export const STOCKADE_DEFENCE = [100, 150];
export const WAREHOUSE_CAPACITY = [100, 200, 300];
export const PRINTING_BELL_BONUS = [50, 100];

export function buildingName(kind: BuildingKind, level: number): string {
  const def = BUILDINGS[kind];
  return level > 0 ? def.levels[level - 1].name : def.levels[0].name;
}
