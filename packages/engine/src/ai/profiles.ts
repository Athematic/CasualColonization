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
  independence: { minTurn: number; minShare: number; armyPerColony: number } | null;
  /** Re-plans its focus every few turns (Creative). */
  adaptive: boolean;
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
  independence: { minTurn: 200, minShare: 55, armyPerColony: 1 },
  adaptive: false,
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
    independence: { minTurn: 170, minShare: 50, armyPerColony: 1.5 },
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
  /** The colony that should build a wagon train for a trade route to a partner's colony, until the turn given. */
  foreignWagon?: { colony: string; until: number };
  /** Wagon trains carrying goods bought from natives, and the port each is taking them to. */
  nativeHaul?: Record<string, string>;
  /** Turn a missionary last incited a tribe (Combative). */
  lastIncite?: number;
}
