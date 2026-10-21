import type { BuildingKind } from './rules/buildings.js';
import type { GoodId } from './rules/goods.js';
import type { NationId, TribeId } from './rules/nations.js';
import type { TerrainId } from './rules/terrain.js';
import type { RoleId, UnitTypeId } from './rules/units.js';

export type MapSize = 'small' | 'medium' | 'large';

export interface GameConfig {
  seed: number;
  mapSize: MapSize;
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
}

export interface GameMessage {
  turn: number;
  /** Nation this message is for; absent means everyone. */
  to?: NationId;
  text: string;
  at?: { x: number; y: number };
}

export interface GameState {
  version: 1;
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
}
