/**
 * Types of the event framework (docs/design/events.md). Event definitions are plain data plus a
 * few small functions, so a scenario can supply its own set.
 */
import type { BuildingKind } from '../rules/buildings.js';
import type { GoodId, ProductId } from '../rules/goods.js';
import type { PlayerId, TribeId } from '../rules/nations.js';
import type { UnitTypeId } from '../rules/units.js';
import type { GameState } from '../types.js';

export type EventKind = 'historical' | 'random';

/** What an event is about: filled in by its target selector and `prepare`. Stored with a pending choice. */
export interface EventVars {
  nation: PlayerId;
  colony?: string;
  tribe?: TribeId;
  settlement?: string;
  good?: GoodId;
  building?: BuildingKind;
  /** A ship (unit id). */
  ship?: string;
  unit?: UnitTypeId;
  amount?: number;
  cost?: number;
}

/** A number, or the name of a numeric variable (`'$cost'`, `'$amount'`). */
export type Num = number | `$${'amount' | 'cost'}`;

/** A good, or the event's chosen good. */
export type GoodRef = GoodId | '$good';

export type Effect =
  /** Gold for the nation (negative takes gold, never below 0). */
  | { kind: 'gold'; amount: Num }
  /** Goods added to (or taken from) the target colony. */
  | { kind: 'goods'; good: GoodRef; amount: Num }
  /** A share of a good in the target colony is lost. */
  | { kind: 'loseGoods'; good: GoodRef; pct: number }
  /**
   * Production changed by `pct` percent for `turns` turns: in the target colony, or in all the
   * nation's colonies (`scope: 'nation'`). `products` missing means every product.
   */
  | { kind: 'production'; pct: number; turns: number; products?: ProductId[]; scope?: 'colony' | 'nation' }
  /** Tension of the target tribe's settlements towards the nation (negative calms them). */
  | { kind: 'tension'; amount: number }
  /** Price change in the nation's home port: `delta` gold, or `pct` percent of the price. */
  | { kind: 'price'; good: GoodRef; delta?: number; pct?: number }
  /** Crosses towards the next immigrant. */
  | { kind: 'crosses'; amount: Num }
  /** Tax rate change in percentage points (up to the difficulty's ceiling). */
  | { kind: 'tax'; delta: number }
  /**
   * A new unit: in the target colony, or on the docks in Europe. `type` missing means the event's
   * `unit`. Units for the docks only come before independence unless `always` (John Paul Jones' frigate).
   */
  | { kind: 'unit'; type?: UnitTypeId; where: 'colony' | 'europe'; always?: boolean }
  /** The target ship is laid up for repairs and loses a share of its cargo. */
  | { kind: 'damageShip'; turns: number; cargoPct: number }
  /** The target building drops one level (never below its starting level); without one, half the hammers burn. */
  | { kind: 'damageBuilding' }
  /** A tile next to the target colony gets a bonus resource. */
  | { kind: 'bonusResource' }
  /** The effects happen with probability `p` (drawn from the event stream). */
  | { kind: 'chance'; p: number; effects: Effect[]; text?: string; elseText?: string }
  /** Another (usually hidden) event fires `turns` turns later, for the same nation (or the world). */
  | { kind: 'followUp'; event: string; turns: number }
  // Council members' joining effects (MemberEffects.onJoin); events may use them too.
  /** Every native settlement forgets its tension towards the nation, and every people makes peace (Pocahontas). */
  | { kind: 'peaceWithPeoples' }
  /** The nation's colonies of at least `minColonists` colonists without a stockade get one (La Salle). */
  | { kind: 'stockades'; minColonists: number }
  /** The land within `radius` of every colony, anyone's, is revealed to the nation (Francisco de Coronado). */
  | { kind: 'revealColonies'; radius: number }
  /** Each of the nation's colonies gains this share of its colonists as Sons of Liberty, in bells (Simón Bolívar: 0.2). */
  | { kind: 'liberty'; share: number }
  /** The nation's units of one type become another (Bartolomé de las Casas: converts become free colonists). */
  | { kind: 'convertUnits'; from: UnitTypeId; to: UnitTypeId }
  /** All the nation's boycotts end without arrears (Jakob Fugger). */
  | { kind: 'liftBoycotts' }
  /** The nation makes peace with every player it is at war with, but the Crown (Garakontié). */
  | { kind: 'makePeace' };

export interface EventChoice {
  label: string;
  /** Shown after the choice is made. Placeholders as in the event text. */
  result?: string;
  effects: Effect[];
  /** Gold the choice costs (taken when chosen); it is offered only when affordable. */
  cost?: Num;
  /** Computer players' value of the choice, in gold; missing means the value of its effects. */
  ai?: (s: GameState, v: EventVars) => number;
}

/** Picks what an event targets for one nation, or null when the nation has nothing to target. */
export type TargetSelector = (s: GameState, nation: PlayerId, r: () => number) => EventVars | null;

export interface EventDef {
  id: string;
  kind: EventKind;
  title: string;
  text: string;
  /** Historical: the years in which it may fire, inclusive. */
  years?: [number, number];
  /** Historical: chance per round inside the window (it fires at the latest in the last round). */
  chance?: number;
  /** Random: relative weight. */
  weight?: number;
  /** Random: turns before it can strike the same nation again. Default RANDOM_COOLDOWN. */
  cooldown?: number;
  /** Not drawn by itself: only fired as a follow-up. */
  hidden?: boolean;
  target: TargetSelector;
  /** An extra condition on the game state. */
  when?: (s: GameState, v: EventVars) => boolean;
  /** Works out amounts and costs; returning false skips the nation. */
  prepare?: (s: GameState, v: EventVars, r: () => number) => boolean | void;
  effects?: Effect[];
  choices?: EventChoice[];
  /** The choice taken when a person leaves it unanswered; default the last. */
  defaultChoice?: number;
  /** Message when a production modifier this event set runs out. */
  endText?: string;
}

/** A temporary production modifier (stored compactly in the save). */
export interface EventModifier {
  nation: PlayerId;
  /** Colony id; missing means all the nation's colonies. */
  colony?: string;
  /** Products affected; missing means all. */
  products?: ProductId[];
  pct: number;
  /** The modifier applies while `turn < until`. */
  until: number;
  /** Event id. */
  source: string;
}

/** An event choice waiting for a person's answer. */
export interface PendingEvent {
  id: string;
  event: string;
  turn: number;
  vars: EventVars;
  /** The event's text as announced. */
  text: string;
}

/** Everything the framework keeps in the game state. Missing until events are first used. */
export interface EventsState {
  /** Last turn each event fired: `id` for historical events, `id|nation` for random ones. */
  fired: Record<string, number>;
  mods: EventModifier[];
  pending: PendingEvent[];
  /** Follow-up events due on a turn; `vars` missing means a world (historical) event. */
  queue: { event: string; turn: number; vars?: EventVars }[];
  /** Counter for pending ids. */
  seq: number;
}
