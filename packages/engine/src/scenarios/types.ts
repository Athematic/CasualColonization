/**
 * The scenario definition (docs/design/scenario-framework.md, section 3). A scenario is a package
 * of data the engine reads instead of its fixed tables. This is the 0.9 skeleton: it holds what
 * today's tables already say for the Americas; the optional fields are filled by later steps of
 * the plan (section 8) as the engine starts reading them.
 *
 * Definitions keyed by id (nations, peoples, goods, council members) stay in the global catalogue
 * (rules/*); a scenario only selects which are in play, in what order, with its own game facts
 * (section 3.1). Everything here is JSON-shaped except `migrate`.
 */
import type { BuildingKind } from '../rules/buildings.js';
import type { DifficultyId, DifficultyRules } from '../rules/difficulty.js';
import type { FatherCategory, FatherId } from '../rules/fathers.js';
import type { GoodId } from '../rules/goods.js';
import type { Modifier, RumourOutcome } from '../rules/modifiers.js';
import type { Effect } from '../events/types.js';
import type { NationId, TribeId } from '../rules/nations.js';
import type { PortEntry } from '../rules/ports.js';
import type { ScoreWeights } from '../rules/score.js';
import type { UnitTypeId } from '../rules/units.js';
import type { GameState } from '../types.js';
import type { Calendar } from './calendar.js';

export type ScenarioId = string;

/** Which nation set a game's setup offered: as in history, or any nations. */
export type Rivals = 'real' | 'alternative';

export interface Scenario {
  id: ScenarioId;
  /**
   * Bumped only when a change to this scenario's data would make old saves play wrongly (a removed
   * or renamed id, a changed calendar), not for tuning (section 3.14, Q3).
   */
  version: number;
  name: string;
  description: string;

  /** How turns map to years, when the game ends and where head starts can jump to. */
  calendar: Calendar;
  map: ScenarioMap;
  nations: ScenarioNations;
  peoples: ScenarioPeoples;
  /** Goods in play; the order is the order of keys in markets and warehouses. */
  goods: readonly GoodId[];
  /**
   * Unit types in play, in catalogue order. Only units on this list are offered in Europe, built
   * in colonies or arrive as immigrants; the engine's named slots (treasure, the REF's units, the
   * starting ship) are expected to be on it.
   */
  units: readonly UnitTypeId[];
  /**
   * Buildings in play, in catalogue order (the order production runs in: tools are made before
   * the armory uses them). Colonies only have these.
   */
  buildings: readonly BuildingKind[];
  council: Council;
  /** What the computer players need to know about the scenario's content. */
  ai: ScenarioAi;
  /** Id of a registered event set (events/index.ts). `config.eventSet` overrides it (tests). */
  events: string;
  /** Which of the engine's systems are in play (step 5). */
  mechanics: Mechanics;
  /**
   * How the game can end, checked in this order (victory.ts registers the kinds). The first rule
   * that ends the game decides the reason and the winner.
   */
  victory: VictoryRule[];
  /** The outcomes of a Lost City Rumour and their odds, in the order they are drawn (rumours.ts). */
  rumours: RumourEntry[];
  /** Overrides merged over the engine's DIFFICULTY per level; absent levels and fields keep the engine's values. */
  difficulty?: Partial<Record<DifficultyId, Partial<DifficultyRules>>>;
  /** Overrides merged over the engine's SCORE_WEIGHTS; absent fields keep the engine's values. */
  score?: Partial<ScoreWeights>;

  /**
   * Converts a save made with an older version of this scenario. Without it such saves are
   * refused (Q3). Must leave the state as if the game had been created with `version`.
   */
  migrate?: (from: number, s: GameState) => void;
}

/**
 * Switches for the engine's systems (docs/design/scenario-framework.md, section 3.12). A system
 * that is off is skipped where it would run, its commands are refused with a reason, the computer
 * players do not try it, and the web game hides its buttons. A system that is off draws no random
 * numbers. The Americas switch everything on.
 */
export interface Mechanics {
  /** The Crown raises the tax rate after sales in the home port (europe.ts). */
  taxes: boolean;
  /** A tax raise may be refused, boycotting the good until arrears are paid. Off: every raise simply applies. */
  boycotts: boolean;
  /** The King demands gold from the treasury (crown.ts). */
  demands: boolean;
  /** The King drags the nation into wars with other European nations (crown.ts). */
  royalWars: boolean;
  /**
   * The Crown builds up a Royal Expeditionary Force during the game (crown.ts), and adds regulars
   * when a demand is refused. `independence` needs it.
   */
  ref: boolean;
  /** Nations may declare independence and fight the War of Independence (independence.ts, rebellion.ts). */
  independence: boolean;
  /** Favoured Nation status between European nations (relations.ts). Trade agreements stay either way. */
  favoured: boolean;
  /**
   * The colony charter's price (rules/difficulty.ts COLONY_CHARTER: `base` gold per colony held, at
   * most `cap`), when the game uses the rule (`GameConfig.colonyCharter`); false: never a charter.
   */
  charter: false | { base: number; cap: number };
  /** The custom house can be built, and sells a colony's exports (europe.ts). */
  customHouse: boolean;
  /** Missionaries found missions among the natives and denounce rivals' missions (natives.ts). */
  missions: boolean;
}

/** One way the game can end: a registered victory kind (victory.ts) and its data. */
export interface VictoryRule {
  /** 'time', 'independence-war', or another registered kind. */
  id: string;
  params?: Record<string, unknown>;
}

/**
 * One outcome of a Lost City Rumour with its odds (rumours.ts). The weight is `weight` (or `scout`
 * for a unit in the scout role, `expert` for a seasoned scout), times the explorer's
 * `rumourOutcome` modifiers (Hernando de Soto), times the difficulty multiplier named by `difficulty`.
 */
export interface RumourEntry {
  outcome: RumourOutcome;
  weight: number;
  /** Weight for a unit in the scout role, instead of `weight`. */
  scout?: number;
  /** Weight for a seasoned scout, instead of `scout` and `weight`. */
  expert?: number;
  /** The difficulty rule that scales this outcome's odds (rules/difficulty.ts). */
  difficulty?: 'rumourGood' | 'rumourBad' | 'burialGrounds';
  /** Only on tribal land (a burial ground); otherwise left out of the draw. */
  tribal?: boolean;
}

export interface ScenarioMap {
  /** Ids of the stored maps (maps/index.ts) this scenario offers. */
  stored: string[];
  /** Whether a generated map can be played (the generator's settings come in step 6). */
  generated: boolean;
  /** 'generated', or the id of a stored map. */
  default: 'generated' | string;
}

export interface ScenarioNations {
  /** Alternative history (any nations) is always offered; real rivals when the scenario has them. */
  sets: { alternative: NationEntry[]; real?: NationEntry[] };
  default: Rivals;
  /** Most nations in one game. */
  max: number;
}

/**
 * A nation's game facts in this scenario. Its identity (name, adjective, colour) stays in the
 * catalogue (NATIONS).
 */
export interface NationEntry {
  id: NationId;
  /** The bonus: its shown text and the modifiers that make it work (rules/modifiers.ts). */
  bonus: { text: string; modifiers?: Modifier[] };
  colonyNames: string[];
  /** The home port and its character (rules/ports.ts). */
  port: PortEntry;
}

export interface ScenarioPeoples {
  /** Peoples in play, north to south (the generator's band order). */
  ids: TribeId[];
  /** Goods native settlements produce for trade. */
  produce: GoodId[];
}

/** The scenario's council (the Americas: the Continental Congress's Founding Fathers). */
export interface Council {
  categories: FatherCategory[];
  /** Ids in the global catalogue (FATHERS), in catalogue order. */
  members: FatherId[];
  /**
   * Members whose effects differ in this scenario from the catalogue's (FATHERS). A member not
   * listed here has the catalogue's modifiers and joining effects.
   */
  effects?: Partial<Record<FatherId, MemberEffects>>;
}

/** What a council member does: passive modifiers while in the council, and effects once on joining. */
export interface MemberEffects {
  /** Read at the engine's hook points (rules/modifiers.ts, scenarios/modifiers.ts). */
  modifiers?: Modifier[];
  /** Applied once, in order, when the member joins (the events' effects, events/effects.ts). */
  onJoin?: Effect[];
}

/**
 * The computer players' hand-kept goods lists (docs/design/scenario-framework.md, row 38). Each
 * list's order is the order the AI considers the goods in, which decides ties, so the Americas
 * keep today's order. Only goods in play may be named.
 */
export interface ScenarioAi {
  goods: {
    /** Goods ships move between colonies and sell (ai/logistics.ts), most valuable first. */
    trade: GoodId[];
    /** Cash crops and finished goods worth shipping to a port (naive, advanced, fleet and foreign trade). */
    export: GoodId[];
    /** Goods whose worked tiles a pioneer gives a road (ai/roads.ts). */
    road: GoodId[];
    /** Goods whose tiles a pioneer ploughs or clears rather than gives a road (ai/advanced.ts). */
    farm: GoodId[];
  };
}
