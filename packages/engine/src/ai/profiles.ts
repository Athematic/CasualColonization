import type { GoodId } from '../rules/goods.js';
import type { NationId } from '../rules/nations.js';
export type AiLevel = 'naive' | 'competent' | 'combative' | 'creative';

export const AI_LEVELS: AiLevel[] = ['naive', 'competent', 'combative', 'creative'];

export const AI_LEVEL_INFO: Record<AiLevel, { name: string; description: string }> = {
  naive: {
    name: 'Naive',
    description: 'Settles and works the land, ships goods home and recruits, but plans nothing ahead.',
  },
  competent: {
    name: 'Competent',
    description: 'Runs an efficient economy: scouts, trains experts, manages colonies and trade, keeps the natives calm and works towards independence.',
  },
  combative: {
    name: 'Combative',
    description: 'A competent economy behind an aggressive army: takes native land, raids settlements, preys on shipping and attacks weak neighbours.',
  },
  creative: {
    name: 'Creative',
    description: 'Plays like a person: reassesses the game every few turns, shifts focus between exploring, growing, liberty, defence and independence, and seizes opportunities.',
  },
};

/** Tunable behaviour shared by every level above Naive. */
export interface AiProfile {
  /** Colonies the nation wants by a given turn. */
  colonyTarget: (turn: number) => number;
  /** Gold kept in reserve before spending. */
  reserve: number;
  scouting: boolean;
  learnFromNatives: boolean;
  /** How native land next to colonies is acquired. */
  land: 'avoid' | 'buy' | 'take';
  /** Weight of liberty bells against other production. */
  liberty: number;
  /** Armed units kept in each colony. */
  garrison: number;
  /** 0 never starts wars; 1 attacks whenever it has the upper hand. */
  aggression: number;
  raidNatives: boolean;
  piracy: boolean;
  missions: boolean;
  schools: boolean;
  gifts: boolean;
  /**
   * When to declare independence: not before `minTurn`, with at least `minShare` percent rebels,
   * at least `armyPerColony` armed units per colony, and a defence of at least `ratio` times the
   * Royal Expeditionary Force built up by then (ai/royal.ts). With `arm` the nation also arms for
   * it: garrisons sized against the REF, muskets and horses first, militia, artillery.
   *
   * `adopt` is when the nation takes up an independence plan (ai/plan.ts): once `share` percent of
   * its colonists are rebels, or from `turn`, and, with `strength`, only once its defence (with the
   * help it can expect) is that share of what the declaration needs. A plan, once adopted, raises
   * liberty until the rebels are a safe majority and builds printing presses, armories, stockades
   * and forts; once the rebels are close to a majority it arms.
   */
  independence: {
    minTurn: number;
    minShare: number;
    armyPerColony: number;
    ratio: number;
    arm?: boolean;
    adopt?: { share: number; turn: number; strength?: number };
  } | null;
  /** Re-plans its focus every few turns (Creative). */
  adaptive: boolean;
  /**
   * A new colony is an investment (ai/advanced.ts, expansionReady). Beyond the first colony, a
   * colonist founds one only when the colonies have on average `minPopulation` colonists, the last
   * colony is at least `everyTurns` old, the charter (if the game uses it) leaves `reserve` gold,
   * and the nation can spare a defender: every colony beyond the first `undefended` has an armed
   * unit or a stockade once it is `graceTurns` old, with one more armed unit for the new colony.
   * A colonist with no colony to reach founds one anyway.
   */
  expansion: { minPopulation: number; everyTurns: number; undefended: number; graceTurns: number; settlers: number };
}

const competent: AiProfile = {
  colonyTarget: (turn) => Math.min(24, 3 + Math.floor(turn / 9)),
  reserve: 300,
  scouting: true,
  learnFromNatives: true,
  land: 'buy',
  liberty: 1.4,
  garrison: 1,
  aggression: 0,
  raidNatives: false,
  piracy: false,
  missions: true,
  schools: true,
  gifts: true,
  independence: { minTurn: 200, minShare: 55, armyPerColony: 1, ratio: 1.25, arm: true, adopt: { share: 45, turn: 240 } },
  adaptive: false,
  expansion: { minPopulation: 3, everyTurns: 6, undefended: 2, graceTurns: 20, settlers: 2 },
};

export const AI_PROFILES: Record<Exclude<AiLevel, 'naive'>, AiProfile> = {
  competent,
  combative: {
    ...competent,
    land: 'take',
    liberty: 1.2,
    garrison: 2,
    aggression: 1,
    raidNatives: true,
    piracy: true,
    gifts: false,
    // Takes up an independence plan only once its army is strong: 60% of what the declaration needs;
    // declares only with a clear margin (its declarations at 1.1 were crushed in probe games).
    independence: { minTurn: 170, minShare: 50, armyPerColony: 1.5, ratio: 1.35, arm: true, adopt: { share: 35, turn: Infinity, strength: 0.6 } },
    // Grabs land sooner and faster than the others, but still not with one-man colonies.
    expansion: { minPopulation: 2.5, everyTurns: 4, undefended: 2, graceTurns: 20, settlers: 2 },
  },
  creative: { ...competent, adaptive: true },
};

/** What a Creative nation is concentrating on at the moment. */
export type AiFocus = 'explore' | 'expand' | 'develop' | 'liberty' | 'independence' | 'defend' | 'war';

/** Long-term memory a computer nation keeps between turns. Plain data, saved with the game. */
export interface AiMemory {
  focus?: AiFocus;
  /** Turn the focus was last reviewed. */
  reviewed?: number;
  personality?: { aggression: number; trade: number; liberty: number };
  /** Colony the army is marching on. */
  warTarget?: string;
  /** Turn the last war was started, to avoid constant warfare. */
  lastWar?: number;
  /** No new proposal of this kind to this nation before the turn given, keyed `trade:france` or `favoured:france`. */
  proposalCooldown?: Record<string, number>;
  /** Goods bought in one European port to sell in another (Creative's triangle trading), by ship id. */
  triangle?: Record<string, { good: GoodId; port: NationId; turn: number; net: number }>;
  /** After cancelling Favoured Nation to go to war: the nation, and the first turn war may be declared. */
  warPlan?: { nation: NationId; turn: number };
  /** Wagon trains carrying goods bought from natives, and the port each is taking them to. */
  nativeHaul?: Record<string, string>;
  /** Turn a missionary last incited a tribe (Combative). */
  lastIncite?: number;
  /** Colonists sent out to found colonies, by unit id (ai/advanced.ts, sendSettler). */
  settlers?: string[];
  /** Turn the nation adopted its independence plan (ai/plan.ts). */
  independencePlan?: number;
}
