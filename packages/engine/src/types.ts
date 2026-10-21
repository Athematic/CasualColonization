import type { BuildingKind } from './rules/buildings.js';
import type { FatherCategory, FatherId } from './rules/fathers.js';
import type { GoodId } from './rules/goods.js';
import type { NationId, TribeId } from './rules/nations.js';
import type { TerrainId } from './rules/terrain.js';
import type { RoleId, UnitTypeId } from './rules/units.js';

export type MapSize = 'small' | 'medium' | 'large';

export interface GameConfig {
  seed: number;
  mapSize: MapSize;
  /** Id of a stored map (see STORED_MAPS); absent means a generated map. `mapSize` is then ignored. */
  map?: string;
  /** European nations taking part, in turn order. Between 1 and 8. */
  nations: NationId[];
  /** Nations controlled by people (hot-seat); the rest are AI. */
  humans: NationId[];
}

export interface Tile {
  t: TerrainId;
  /** Forested. */
  f?: boolean;
  /** Plowed. */
  p?: boolean;
  /** Road. */
  r?: boolean;
  /** Bonus resource. */
  b?: boolean;
  /** Lost City Rumour. */
  lcr?: boolean;
  /** European nation that bought or took this land from the natives. */
  claim?: NationId;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[];
}

export interface MarketEntry {
  /** Sell price; buy price is price + spread. */
  price: number;
  /** Net units sold since the last price change (negative = bought). */
  volume: number;
}

export type Stance = 'peace' | 'war';

export interface Player {
  id: NationId;
  human: boolean;
  gold: number;
  /** Tax rate in percent. */
  tax: number;
  market: Record<GoodId, MarketEntry>;
  crosses: number;
  crossesRequired: number;
  recruitPool: UnitTypeId[];
  recruited: number;
  /** One byte per tile: 1 when explored. */
  explored: number[];
  /** Where ships sailing from Europe arrive. */
  entry: { x: number; y: number };
  stance: Partial<Record<string, Stance>>;
  coloniesFounded: number;
  bells: number;
  /** Members of the Continental Congress. */
  fathers: FatherId[];
  /** One candidate per category to choose the next father from. */
  fatherOffer: Partial<Record<FatherCategory, FatherId>>;
  currentFather: FatherId | null;
  /** Bells collected towards the current father. */
  fatherBells: number;
  /** Goods the player may not trade in Europe until arrears are paid. */
  boycotts: Partial<Record<GoodId, boolean>>;
  /** A tax raise waiting for the player to accept or refuse. */
  pendingTax: { rate: number; good: GoodId } | null;
  independence: 'none' | 'declared' | 'won' | 'lost';
  /** The Royal Expeditionary Force still waiting to sail against this player. */
  ref: { regulars: number; dragoons: number; artillery: number; menOfWar: number };
  /** Turn on which each war started, keyed by nation id. */
  warSince: Partial<Record<string, number>>;
  /** Colonies held when independence was declared. */
  coloniesAtDeclaration?: number;
}

export type Job =
  | { kind: 'tile'; x: number; y: number; good: GoodId }
  | { kind: 'building'; building: BuildingKind };

export type UnitLocation =
  | { kind: 'map'; x: number; y: number }
  | { kind: 'colony'; colonyId: string; job: Job }
  | { kind: 'carrier'; carrierId: string }
  | { kind: 'europe' }
  | { kind: 'sailing'; to: 'europe' | 'america'; turnsLeft: number };

export type UnitState = 'active' | 'fortified' | 'sentry';

export type ImprovementKind = 'plow' | 'road' | 'clear';

export interface Unit {
  id: string;
  owner: NationId;
  type: UnitTypeId;
  role: RoleId;
  /** Tools carried by a pioneer. */
  tools: number;
  loc: UnitLocation;
  /** Move points left this turn (3 per move). */
  moves: number;
  state: UnitState;
  work?: { kind: ImprovementKind; turnsLeft: number };
  /** Teaching progress in turns, for a teacher in a school. */
  teach?: number;
  /** Gold carried by a treasure train. */
  treasure?: number;
  /** Turns left until a damaged ship is repaired. */
  repair?: number;
  /** For Royal troops: the rebel nation they were sent against. */
  against?: NationId;
  dest?: { x: number; y: number } | { europe: true };
  cargo?: Partial<Record<GoodId, number>>;
}

export type BuildTarget = { kind: 'building'; id: BuildingKind } | { kind: 'unit'; id: UnitTypeId };

export interface Colony {
  id: string;
  owner: NationId;
  name: string;
  x: number;
  y: number;
  goods: Record<GoodId, number>;
  buildings: Record<BuildingKind, number>;
  build: BuildTarget | null;
  hammers: number;
  liberty: number;
  founded: number;
  /** Goods the custom house exports. */
  exports: Partial<Record<GoodId, boolean>>;
  /** For a colony the Crown has retaken: who held it before. */
  takenFrom?: NationId;
}

export interface Tribe {
  id: TribeId;
  /** Per-European-nation stance; tribes become hostile when attacked. */
  stance: Partial<Record<NationId, Stance>>;
}

export interface Settlement {
  id: string;
  tribe: TribeId;
  x: number;
  y: number;
  capital: boolean;
  /** Skill taught to one colonist; null once taught. */
  skill: UnitTypeId | null;
  /** Nations whose scouts have spoken with the chief. */
  visited: NationId[];
  defenders: number;
  gold: number;
  /** 0 (content) to 1000 (furious), per European nation. */
  tension: Partial<Record<NationId, number>>;
  /** Nation that runs a mission here. */
  mission?: NationId;
  missionExpert?: boolean;
}

export interface GameMessage {
  turn: number;
  /** Nation this message is for; absent means everyone. */
  to?: NationId;
  text: string;
  at?: { x: number; y: number };
}

export interface GameState {
  version: 2;
  config: GameConfig;
  turn: number;
  /** Index into players of the nation whose turn it is. */
  current: number;
  rng: number;
  nextId: number;
  map: GameMap;
  players: Player[];
  units: Record<string, Unit>;
  colonies: Record<string, Colony>;
  tribes: Tribe[];
  settlements: Record<string, Settlement>;
  messages: GameMessage[];
  gameOver?: { turn: number; reason: string; winner?: NationId; scores: Partial<Record<NationId, number>> };
}
