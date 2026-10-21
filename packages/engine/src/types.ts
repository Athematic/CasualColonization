import type { AiLevel, AiMemory } from './ai/profiles.js';
import type { CheatId } from './cheats.js';
import type { BuildingKind } from './rules/buildings.js';
import type { DifficultyId } from './rules/difficulty.js';
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
  /** Nations controlled by people (hot-seat); the rest are AI. May be empty to let computers play each other. */
  humans: NationId[];
  /** Level of each computer nation; missing means Naive. */
  ai?: Partial<Record<NationId, AiLevel>>;
  /** While a head start runs: the people's nations, played by the computer until hand-over. */
  headStart?: { humans: NationId[]; level: AiLevel; turn: number };
  /** Difficulty level (see rules/difficulty.ts); missing means Conquistador, the standard rules. */
  difficulty?: DifficultyId;
  /** Give computer players the chosen difficulty's economics too (tournaments); by default only people get it. */
  difficultyForAll?: boolean;
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
  /** River: 1 minor, 2 major. A fixed map feature on land; absent means no river. See rivers.ts. */
  rv?: 1 | 2;
  /**
   * Where the river runs: one bit per neighbour in `DIRECTIONS` order (n 1, ne 2, e 4, se 8, s 16,
   * sw 32, w 64, nw 128). A bit towards a water tile is the river's mouth.
   */
  rd?: number;
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
  /** Computer level, for nations not played by people. */
  ai?: AiLevel;
  aiMemory?: AiMemory;
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
  /** Units of goods lost to full warehouses over the game; missing means none. */
  goodsSpoiled?: number;
  /** Difficulty whose economics this nation plays at; missing means Conquistador (computer players). */
  difficulty?: DifficultyId;
}

export type Job =
  | { kind: 'tile'; x: number; y: number; good: GoodId }
  | { kind: 'building'; building: BuildingKind };

export type UnitLocation =
  | { kind: 'map'; x: number; y: number }
  | { kind: 'colony'; colonyId: string; job: Job }
  | { kind: 'carrier'; carrierId: string }
  /** In a home port in Europe. `port` is a Favoured Nation partner whose port the ship visits; missing means the owner's own. */
  | { kind: 'europe'; port?: NationId }
  | { kind: 'sailing'; to: 'europe' | 'america'; turnsLeft: number; port?: NationId };

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
  /** Where the unit is going; for Europe, `port` is a Favoured Nation partner's port (missing: its own). */
  dest?: { x: number; y: number } | { europe: true; port?: NationId };
  cargo?: Partial<Record<GoodId, number>>;
  /** The trade route a ship or wagon train follows, and the index of the stop it is heading for. */
  route?: { id: string; stop: number };
}

/** What a carrier loads or unloads of one good at a trade route stop. */
export interface RouteCargo {
  good: GoodId;
  /**
   * Loading in a colony: units left in the warehouse (default 0). Loading in Europe: units to
   * have aboard after buying (default 100). Unloading in a colony: fill the warehouse up to this
   * (default its capacity, so nothing spoils). Unloading in Europe: ignored, all of it is sold.
   */
  amount?: number;
}

/** One stop of a trade route: a colony (own, or a trade partner's), or Europe for ships. */
export interface RouteStop {
  /** Colony id, or 'europe' (always the owner's own home port). */
  at: string;
  load: RouteCargo[];
  unload: RouteCargo[];
  /** In Europe: take aboard the colonists waiting on the docks. They go ashore at the next colony stop. */
  passengers?: boolean;
}

/** A named, ordered round trip that ships and wagon trains follow on their own. */
export interface TradeRoute {
  id: string;
  owner: NationId;
  name: string;
  stops: RouteStop[];
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

export type ProposalKind = 'trade' | 'favoured';

/**
 * Relations between two European nations (see relations.ts and docs/design/favoured-nation.md).
 * Turn numbers, not years; the thresholds are hidden from players.
 */
export interface Relation {
  /** The pair, in the order of `GameConfig.nations`. */
  a: NationId;
  b: NationId;
  /** Turn the current run of peace began: game start, the last peace treaty, or the last cancellation. */
  peaceSince: number;
  /** Hidden: years of continuous peace needed for Favoured Nation (8–12, from the seed). */
  peaceNeeded: number;
  /** Hidden: active trade routes between the two needed for Favoured Nation (2–4, from the seed). */
  routesNeeded: number;
  /** A trade agreement: route stops at each other's colonies are allowed. */
  trade?: boolean;
  /** Favoured Nation status (implies a trade agreement). */
  favoured?: boolean;
  /** Gold that has changed hands at each other's colonies, both ways, over the game. */
  volume: number;
  /** After a cancellation: no new agreements or foreign stops before this turn. */
  waitUntil?: number;
  /** After a cancellation: computer players on both sides treat the other as a target until this turn. */
  hostileUntil?: number;
  /** Cancellations so far; seeds the next waiting and hostility draws. */
  cancels?: number;
  /** A proposal waiting for the other side (a person) to answer. */
  proposal?: { kind: ProposalKind; from: NationId; turn: number };
}

export interface GameState {
  version: 3;
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
  /** The game's difficulty level, resolved from the config; missing (older saves) means Conquistador. */
  difficulty?: DifficultyId;
  /** Relations between each pair of European nations, keyed by relationKey(a, b). */
  relations: Record<string, Relation>;
  /** Trade routes by id; missing means none. */
  routes?: Record<string, TradeRoute>;
  gameOver?: { turn: number; reason: string; winner?: NationId; scores: Partial<Record<NationId, number>> };
  /** Set the first time a cheat is used and never cleared. Missing means the game is not cheated. */
  cheated?: { turn: number; cheats: CheatId[] };
  /** Game-wide modifiers set by cheats. Missing fields mean the normal rules. */
  modifiers?: {
    /** Multiplier on terrain yields (missing means 1). */
    yieldMultiplier?: number;
    /** Nations whose view shows the whole map without fog. */
    reveal?: NationId[];
  };
  /** Progress statistics, one snapshot per round (see stats.ts). Missing in older saves. */
  stats?: StatsHistory;
}

/**
 * Compact per-round statistics: `data[nation]` holds `keys.length` numbers per entry of `turns`,
 * each the change since the nation's previous entry (the first entry as is). Read it with statsHistory.
 */
export interface StatsHistory {
  keys: string[];
  turns: number[];
  data: Partial<Record<NationId, number[]>>;
  /** Trade income, goods produced and crosses since the last snapshot. */
  flows?: Partial<Record<NationId, { trade?: number; production?: number; crosses?: number }>>;
}
