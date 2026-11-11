/**
 * Rules for native braves, native trade and the tribes' other classic reactions, in one place: the
 * settlement kinds (SETTLEMENT_KINDS) and the engine's NATIVE_RULES, which a scenario changes with
 * `peoples.rules`. The behaviour itself is in braves.ts and natives.ts.
 */
import type { GoodId } from './goods.js';

/** The procedural styles' drawings of a settlement; a new kind names the one it looks most like. */
export type SettlementLook = 'camp' | 'village' | 'city';

/**
 * A kind of native settlement with every number that depends on it, in one row
 * (docs/design/scenario-framework.md, row 20). A scenario's peoples live in the kind its table
 * gives their lifeway (`Scenario.peoples.settlements`); a scenario may add kinds of its own.
 */
export interface SettlementKindDef {
  /** 'camp', 'village', 'city'. */
  id: string;
  /** Shown after the people's name: "Sioux camp". */
  name: string;
  /** How the procedural styles draw it. */
  look: SettlementLook;
  /** Sets a new settlement's defenders (size, +2 for a capital, +0–1) and gold ((size × 150 + 0–199), ×2 for a capital). */
  size: number;
  /** Braves it keeps out on the land at most (a capital one more, CAPITAL_EXTRA_BRAVES). */
  braves: number;
  /** Rounds it needs to send out a new brave after one is killed or leaves for good. */
  respawn: number;
  /** Share of the land's yield (its own tile and its neighbours) it gathers per round. */
  produceRate: number;
  /** Most of each good it stores for sale. */
  produceCap: number;
  /** Goods whose yield counts more than once when it gathers (cities mine silver). */
  gather?: Partial<Record<GoodId, number>>;
  /** Gold to incite its people against a nation (a capital ×1.5). */
  incitePrice: number;
  /** Price of a tile of its land at no tension, and what a capital adds. */
  landPrice: { base: number; capital: number };
  /** Treasure found when it is burned: `base` plus 0 to `spread` − 1 gold. */
  treasure?: { base: number; spread: number };
  /** Treasure when it is a capital and has no `treasure` of its own. */
  capitalTreasure?: { base: number; spread: number };
}

/** The catalogue's settlement kinds, as in the original game. */
export const SETTLEMENT_KINDS = {
  camp: {
    id: 'camp', name: 'camp', look: 'camp', size: 1, braves: 1, respawn: 12, produceRate: 0.12, produceCap: 100,
    incitePrice: 300, landPrice: { base: 80, capital: 80 }, capitalTreasure: { base: 300, spread: 500 },
  },
  village: {
    id: 'village', name: 'village', look: 'village', size: 2, braves: 2, respawn: 10, produceRate: 0.16, produceCap: 150,
    incitePrice: 450, landPrice: { base: 80, capital: 80 }, capitalTreasure: { base: 300, spread: 500 },
  },
  city: {
    id: 'city', name: 'city', look: 'city', size: 3, braves: 2, respawn: 8, produceRate: 0.2, produceCap: 200,
    gather: { silver: 3 }, incitePrice: 700, landPrice: { base: 200, capital: 80 }, treasure: { base: 1500, spread: 3500 },
  },
} satisfies Record<string, SettlementKindDef>;

/** Combat values and moves, as in the original: brave 1/1, armed or mounted 2/2, both 3/3; mounted braves move 4. */
export function braveCombat(b: { armed?: boolean; mounted?: boolean }): { offence: number; defence: number; moves: number } {
  const strength = 1 + (b.armed ? 1 : 0) + (b.mounted ? 1 : 0);
  return { offence: strength, defence: strength, moves: b.mounted ? 4 : 1 };
}

/** Tension thresholds (0–1000) that the braves and the tribes act on. */
export interface TensionThresholds {
  /** Below it a settlement is content: its braves bring gifts and come to trade. */
  content: number;
  /** From it braves demand tribute. */
  uneasy: number;
  /** From it braves attack (before any war). */
  angry: number;
  /** From it the people goes to war (unless it submitted). */
  war: number;
}

/**
 * Chance per round that an idle brave at home sets out, by mood towards the nearest colony's owner.
 * Attack chances are multiplied by that nation's difficulty `raidChance`, demands by it too.
 */
export interface BraveChances {
  /** At war with the colony's owner. */
  attackAtWar: number;
  /** Tension at or above `angry` (not yet at war). */
  attackAngry: number;
  /** Tension from `uneasy` to `angry`: a demand for tribute. */
  demand: number;
  /** Content (below `content`): a gift of food or goods. */
  gift: number;
  /** Content: a visit to trade. */
  trade: number;
  /** Otherwise: a walk on the tribe's land. */
  wander: number;
}

/**
 * The numbers of the braves, tension, demands, trade, burial grounds, surrender and missions
 * (docs/design/scenario-framework.md, row 22): a scenario changes them with `peoples.rules`
 * (a partial override, read with `nativeRulesOf(s)`). The behaviour is in braves.ts, natives.ts,
 * rumours.ts and combat.ts. The numbers that depend on the kind of settlement are in its row of
 * SETTLEMENT_KINDS instead.
 */
export interface NativeRules {
  /** Braves a capital keeps out beyond its kind's `braves`. */
  capitalExtraBraves: number;
  /** Hard cap on braves on the map, so large maps stay fast. */
  maxBraves: number;
  /** A settlement sends out its first brave after this many rounds. */
  firstBraveAfter: number;
  /** Muskets or horses a brave takes from its settlement's stock to arm or mount itself. */
  braveEquipment: number;
  /** How far from home a brave wanders. */
  wanderRadius: number;
  /** The furthest colony a brave visits or attacks. */
  visitRange: number;
  /** Rounds a brave wanders before it goes home. */
  wanderTurns: number;
  braveChances: BraveChances;
  tension: TensionThresholds;
  /** Rounds a brave waits beside a colony for a person to answer its demand before it attacks. */
  demandWait: number;
  /** Tension change when a demand is met, or refused. */
  demandMetTension: number;
  demandRefusedTension: number;
  /** Tension a settlement gains when one of its braves is killed (others of the tribe get a third). */
  braveKilledTension: number;
  /**
   * Price per unit a settlement asks for its goods: the good's starting European price times
   * `buyPriceFactor`, which grows with tension (an angry tribe asks up to twice as much), times
   * `buyPricePlenty` when the settlement holds plenty.
   */
  buyPriceFactor: number;
  buyPricePlenty: number;
  /**
   * Lost City Rumours on tribal land (within this distance of a settlement, not bought or taken)
   * may be a burial ground (`mechanics.burialGrounds`; the outcome's weight is in the rumour table).
   */
  burialRadius: number;
  /**
   * Surrender (`mechanics.surrender`): when a tribe's capital is burned, its remaining settlements
   * submit to the attacker with `surrenderChance` (one seeded roll per tribe), unless the attacker
   * desecrated its burial ground. Submitting resets their tension to 0, makes peace, ends attacks
   * and demands on that nation, gives its land freely and pays `surrenderTribute` of each
   * settlement's gold.
   */
  surrenderChance: number;
  surrenderTribute: number;
  /** A missionary's chance to have a rival's mission expelled. */
  denounceChance: number;
  /** Added for a firebrand preacher; subtracted when the rival's missionary is one. */
  denounceExpert: number;
  /** Chance that a missionary whose denunciation fails is killed. */
  denounceFailDeath: number;
  /** Tension the tribe gains towards the target of inciting: this settlement, and the tribe's other settlements. */
  inciteTension: number;
  inciteTensionOthers: number;
}

/** A scenario's changes to NATIVE_RULES (`Scenario.peoples.rules`): any field, and any part of the two tables. */
export type NativeRulesOverride = Partial<Omit<NativeRules, 'braveChances' | 'tension'>> & {
  braveChances?: Partial<BraveChances>;
  tension?: Partial<TensionThresholds>;
};

/** The engine's native rules, as in the original game: the Americas' and the Caribbean's. */
export const NATIVE_RULES: NativeRules = {
  capitalExtraBraves: 1,
  maxBraves: 80,
  firstBraveAfter: 4,
  braveEquipment: 50,
  wanderRadius: 4,
  visitRange: 6,
  wanderTurns: 4,
  braveChances: { attackAtWar: 0.3, attackAngry: 0.1, demand: 0.06, gift: 0.03, trade: 0.06, wander: 0.35 },
  tension: { content: 200, uneasy: 300, angry: 600, war: 800 },
  demandWait: 2,
  demandMetTension: -60,
  demandRefusedTension: 100,
  braveKilledTension: 150,
  buyPriceFactor: 0.5,
  buyPricePlenty: 0.8,
  burialRadius: 2,
  surrenderChance: 0.6,
  surrenderTribute: 0.5,
  denounceChance: 0.4,
  denounceExpert: 0.2,
  denounceFailDeath: 0.5,
  inciteTension: 350,
  inciteTensionOthers: 150,
};

/** NATIVE_RULES with a scenario's override merged over it (the tables field by field). */
export function mergeNativeRules(over: NativeRulesOverride | undefined): NativeRules {
  if (!over) return NATIVE_RULES;
  return {
    ...NATIVE_RULES,
    ...over,
    braveChances: { ...NATIVE_RULES.braveChances, ...over.braveChances },
    tension: { ...NATIVE_RULES.tension, ...over.tension },
  };
}

/** Goods native settlements gather from their land and sell, as in the original (the Americas' `peoples.produce`). */
export const NATIVE_PRODUCE: GoodId[] = ['furs', 'sugar', 'tobacco', 'cotton', 'silver'];

/** The burial ground's weight among the rumour outcomes (the Americas' rumour table), multiplied by the difficulty's `burialGrounds`. */
export const BURIAL_WEIGHT = 4;
