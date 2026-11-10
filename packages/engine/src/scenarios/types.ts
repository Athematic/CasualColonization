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
import type { DifficultyId, DifficultyRules } from '../rules/difficulty.js';
import type { FatherCategory, FatherId } from '../rules/fathers.js';
import type { GoodId } from '../rules/goods.js';
import type { NationId, TribeId } from '../rules/nations.js';
import type { PortEntry } from '../rules/ports.js';
import type { ScoreWeights } from '../rules/score.js';
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
  council: Council;
  /** Id of a registered event set (events/index.ts). `config.eventSet` overrides it (tests). */
  events: string;
  /** Overrides merged over the engine's DIFFICULTY per level (step 5). */
  difficulty?: Partial<Record<DifficultyId, Partial<DifficultyRules>>>;
  /** Overrides merged over the engine's SCORE_WEIGHTS (step 5). */
  score?: Partial<ScoreWeights>;

  /**
   * Converts a save made with an older version of this scenario. Without it such saves are
   * refused (Q3). Must leave the state as if the game had been created with `version`.
   */
  migrate?: (from: number, s: GameState) => void;
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
 * catalogue (NATIONS); the bonus's modifiers come in step 4.
 */
export interface NationEntry {
  id: NationId;
  bonus: { text: string };
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
}
