import type { ProductId } from './goods.js';
import type { GoodId } from './goods.js';

export type UnitTypeId =
  | 'freeColonist'
  | 'indenturedServant'
  | 'pettyCriminal'
  | 'expertFarmer'
  | 'expertFisherman'
  | 'expertFurTrapper'
  | 'expertSilverMiner'
  | 'expertLumberjack'
  | 'expertOreMiner'
  | 'masterSugarPlanter'
  | 'masterCottonPlanter'
  | 'masterTobaccoPlanter'
  | 'masterCarpenter'
  | 'masterBlacksmith'
  | 'masterGunsmith'
  | 'masterDistiller'
  | 'masterTobacconist'
  | 'masterWeaver'
  | 'masterFurTrader'
  | 'elderStatesman'
  | 'firebrandPreacher'
  | 'hardyPioneer'
  | 'seasonedScout'
  | 'veteranSoldier'
  | 'continentalSoldier'
  | 'kingsRegular'
  | 'nativeConvert'
  | 'treasure'
  | 'wagonTrain'
  | 'artillery'
  | 'caravel'
  | 'merchantman'
  | 'galleon'
  | 'privateer'
  | 'frigate'
  | 'manOfWar';

export type UnitKind = 'colonist' | 'wagon' | 'artillery' | 'ship' | 'treasure';

export interface UnitTypeDef {
  id: UnitTypeId;
  name: string;
  kind: UnitKind;
  /** Moves per turn (each move is 3 move points). */
  moves: number;
  cargo: number;
  offence: number;
  defence: number;
  /** -2 criminal, -1 servant, 0 free colonist, 1 expert. */
  skill: number;
  expertFor?: ProductId;
  /** Role this expert is especially good at. */
  expertRole?: RoleId;
  /** Price to train (colonists) or purchase (others) in Europe. */
  price?: number;
  /** School level needed to teach this expert's skill (1 schoolhouse, 2 college, 3 university). */
  teach?: number;
  /** Cannot be trained or bought; only appears through events. */
  special?: boolean;
}

const colonist = (
  id: UnitTypeId,
  name: string,
  skill: number,
  expertFor?: ProductId,
  price?: number,
  expertRole?: RoleId,
  teach?: number,
): UnitTypeDef => ({ id, name, kind: 'colonist', moves: 1, cargo: 0, offence: 0, defence: 1, skill, expertFor, price, expertRole, teach });

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDef> = {
  freeColonist: colonist('freeColonist', 'Free Colonist', 0),
  indenturedServant: colonist('indenturedServant', 'Indentured Servant', -1),
  pettyCriminal: colonist('pettyCriminal', 'Petty Criminal', -2),
  expertFarmer: colonist('expertFarmer', 'Expert Farmer', 1, 'food', 1100, undefined, 1),
  expertFisherman: colonist('expertFisherman', 'Expert Fisherman', 1, 'food', 1000, undefined, 1),
  expertFurTrapper: colonist('expertFurTrapper', 'Expert Fur Trapper', 1, 'furs', undefined, undefined, 1),
  expertSilverMiner: colonist('expertSilverMiner', 'Expert Silver Miner', 1, 'silver', 900, undefined, 1),
  expertLumberjack: colonist('expertLumberjack', 'Expert Lumberjack', 1, 'lumber', 700, undefined, 1),
  expertOreMiner: colonist('expertOreMiner', 'Expert Ore Miner', 1, 'ore', 600, undefined, 1),
  masterSugarPlanter: colonist('masterSugarPlanter', 'Master Sugar Planter', 1, 'sugar', undefined, undefined, 1),
  masterCottonPlanter: colonist('masterCottonPlanter', 'Master Cotton Planter', 1, 'cotton', undefined, undefined, 1),
  masterTobaccoPlanter: colonist('masterTobaccoPlanter', 'Master Tobacco Planter', 1, 'tobacco', undefined, undefined, 1),
  masterCarpenter: colonist('masterCarpenter', 'Master Carpenter', 1, 'hammers', 800, undefined, 2),
  masterBlacksmith: colonist('masterBlacksmith', 'Master Blacksmith', 1, 'tools', 1050, undefined, 2),
  masterGunsmith: colonist('masterGunsmith', 'Master Gunsmith', 1, 'muskets', 850, undefined, 2),
  masterDistiller: colonist('masterDistiller', 'Master Distiller', 1, 'rum', undefined, undefined, 2),
  masterTobacconist: colonist('masterTobacconist', 'Master Tobacconist', 1, 'cigars', undefined, undefined, 2),
  masterWeaver: colonist('masterWeaver', 'Master Weaver', 1, 'cloth', undefined, undefined, 2),
  masterFurTrader: colonist('masterFurTrader', 'Master Fur Trader', 1, 'coats', undefined, undefined, 2),
  elderStatesman: colonist('elderStatesman', 'Elder Statesman', 1, 'bells', 1900, undefined, 3),
  firebrandPreacher: colonist('firebrandPreacher', 'Firebrand Preacher', 1, 'crosses', 1500, undefined, 3),
  hardyPioneer: colonist('hardyPioneer', 'Hardy Pioneer', 1, undefined, 1200, 'pioneer', 2),
  seasonedScout: colonist('seasonedScout', 'Seasoned Scout', 1, undefined, 600, 'scout', 2),
  veteranSoldier: colonist('veteranSoldier', 'Veteran Soldier', 1, undefined, 2000, 'soldier', 2),
  continentalSoldier: { ...colonist('continentalSoldier', 'Continental Soldier', 1, undefined, undefined, 'soldier'), special: true },
  kingsRegular: { ...colonist('kingsRegular', "King's Regular", 1, undefined, undefined, 'soldier'), special: true },
  nativeConvert: { ...colonist('nativeConvert', 'Native Convert', 0), special: true },
  treasure: { id: 'treasure', name: 'Treasure Train', kind: 'treasure', moves: 1, cargo: 0, offence: 0, defence: 1, skill: 0, special: true },
  wagonTrain: { id: 'wagonTrain', name: 'Wagon Train', kind: 'wagon', moves: 2, cargo: 2, offence: 0, defence: 1, skill: 0 },
  artillery: { id: 'artillery', name: 'Artillery', kind: 'artillery', moves: 1, cargo: 0, offence: 5, defence: 3, skill: 0, price: 500 },
  caravel: { id: 'caravel', name: 'Caravel', kind: 'ship', moves: 4, cargo: 2, offence: 0, defence: 2, skill: 0, price: 1000 },
  merchantman: { id: 'merchantman', name: 'Merchantman', kind: 'ship', moves: 5, cargo: 4, offence: 0, defence: 6, skill: 0, price: 2000 },
  galleon: { id: 'galleon', name: 'Galleon', kind: 'ship', moves: 6, cargo: 6, offence: 0, defence: 10, skill: 0, price: 3000 },
  privateer: { id: 'privateer', name: 'Privateer', kind: 'ship', moves: 8, cargo: 2, offence: 8, defence: 8, skill: 0, price: 2000 },
  frigate: { id: 'frigate', name: 'Frigate', kind: 'ship', moves: 6, cargo: 4, offence: 16, defence: 16, skill: 0, price: 5000 },
  manOfWar: { id: 'manOfWar', name: 'Man-of-War', kind: 'ship', moves: 6, cargo: 6, offence: 24, defence: 24, skill: 0, special: true },
};

/** Hammers and tools to build a ship at a shipyard (docks level 3), or a land unit anywhere. */
export const COLONY_BUILDS: Partial<Record<UnitTypeId, { hammers: number; tools: number; docks?: number; armory?: boolean }>> = {
  wagonTrain: { hammers: 40, tools: 0 },
  artillery: { hammers: 192, tools: 40, armory: true },
  caravel: { hammers: 128, tools: 40, docks: 3 },
  merchantman: { hammers: 192, tools: 80, docks: 3 },
  galleon: { hammers: 320, tools: 100, docks: 3 },
  privateer: { hammers: 256, tools: 120, docks: 3 },
  frigate: { hammers: 512, tools: 200, docks: 3 },
};

export type RoleId = 'none' | 'soldier' | 'dragoon' | 'pioneer' | 'scout' | 'missionary';

export interface RoleDef {
  id: RoleId;
  name: string;
  /** Goods needed to take this role (pioneers may carry 20..100 tools in steps of 20). */
  goods: Partial<Record<GoodId, number>>;
  moves?: number;
  offence: number;
  defence: number;
}

export const ROLES: Record<RoleId, RoleDef> = {
  none: { id: 'none', name: 'Colonist', goods: {}, offence: 0, defence: 1 },
  soldier: { id: 'soldier', name: 'Soldier', goods: { muskets: 50 }, offence: 2, defence: 2 },
  dragoon: { id: 'dragoon', name: 'Dragoon', goods: { muskets: 50, horses: 50 }, moves: 4, offence: 3, defence: 3 },
  pioneer: { id: 'pioneer', name: 'Pioneer', goods: { tools: 20 }, offence: 0, defence: 1 },
  scout: { id: 'scout', name: 'Scout', goods: { horses: 50 }, moves: 4, offence: 0, defence: 1 },
  missionary: { id: 'missionary', name: 'Missionary', goods: {}, offence: 0, defence: 1 },
};

export const PIONEER_MAX_TOOLS = 100;
export const TOOLS_PER_IMPROVEMENT = 20;

/** Weighted pool of colonists that arrive on the docks as immigrants. */
export const IMMIGRANT_WEIGHTS: [UnitTypeId, number][] = [
  ['freeColonist', 40],
  ['indenturedServant', 18],
  ['pettyCriminal', 12],
  ['expertFarmer', 4],
  ['expertFisherman', 4],
  ['expertLumberjack', 3],
  ['expertOreMiner', 3],
  ['expertFurTrapper', 3],
  ['masterCarpenter', 2],
  ['masterBlacksmith', 2],
  ['hardyPioneer', 2],
  ['seasonedScout', 2],
  ['veteranSoldier', 2],
  ['firebrandPreacher', 1],
  ['elderStatesman', 1],
  ['masterCottonPlanter', 1],
];

export const TRAINABLE: UnitTypeId[] = (Object.values(UNIT_TYPES) as UnitTypeDef[])
  .filter((u) => u.kind === 'colonist' && u.price && !u.special)
  .map((u) => u.id);

export const PURCHASABLE: UnitTypeId[] = ['artillery', 'caravel', 'merchantman', 'galleon', 'privateer', 'frigate'];
