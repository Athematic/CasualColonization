/**
 * Rules for native braves, native trade and the tribes' other classic reactions, in one place so a
 * scenario can later adjust them. The behaviour itself is in braves.ts and natives.ts.
 */
import type { GoodId } from './goods.js';

export type SettlementKind = 'camp' | 'village' | 'city';

/** Braves a settlement keeps out on the land at most: by settlement kind, plus one for a capital. */
export const BRAVES_PER_SETTLEMENT: Record<SettlementKind, number> = { camp: 1, village: 2, city: 2 };
export const CAPITAL_EXTRA_BRAVES = 1;
/** Hard cap on braves on the map, so large maps stay fast. */
export const MAX_BRAVES = 80;
/** Rounds a settlement needs to send out a new brave after one is killed or leaves for good. */
export const BRAVE_RESPAWN: Record<SettlementKind, number> = { camp: 12, village: 10, city: 8 };
/** A settlement sends out its first brave after this many rounds. */
export const FIRST_BRAVE_AFTER = 4;

/** Combat values and moves, as in the original: brave 1/1, armed or mounted 2/2, both 3/3; mounted braves move 4. */
export function braveCombat(b: { armed?: boolean; mounted?: boolean }): { offence: number; defence: number; moves: number } {
  const strength = 1 + (b.armed ? 1 : 0) + (b.mounted ? 1 : 0);
  return { offence: strength, defence: strength, moves: b.mounted ? 4 : 1 };
}

/** Muskets or horses a brave takes from its settlement's stock to arm or mount itself. */
export const BRAVE_EQUIPMENT = 50;

/** How far from home a brave wanders, and the furthest colony it visits or attacks. */
export const WANDER_RADIUS = 4;
export const VISIT_RANGE = 6;
/** Rounds a brave wanders before it goes home. */
export const WANDER_TURNS = 4;

/**
 * Chance per round that an idle brave at home sets out, by mood towards the nearest colony's owner.
 * Attack chances are multiplied by that nation's difficulty `raidChance`, demands by it too.
 */
export const BRAVE_CHANCES = {
  /** At war with the colony's owner. */
  attackAtWar: 0.3,
  /** Tension above ANGRY (not yet at war). */
  attackAngry: 0.1,
  /** Tension between UNEASY and ANGRY: a demand for tribute. */
  demand: 0.06,
  /** Content (below CONTENT): a gift of food or goods. */
  gift: 0.03,
  /** Content: a visit to trade. */
  trade: 0.06,
  /** Otherwise: a walk on the tribe's land. */
  wander: 0.35,
};
/** Tension thresholds used by braves (0–1000). */
export const TENSION = { content: 200, uneasy: 300, angry: 600, war: 800 };

/** Rounds a brave waits beside a colony for a person to answer its demand before it attacks. */
export const DEMAND_WAIT = 2;
/** Tension change when a demand is met, or refused. */
export const DEMAND_MET_TENSION = -60;
export const DEMAND_REFUSED_TENSION = 100;

/** Tension a settlement gains when one of its braves is killed (others of the tribe get a third). */
export const BRAVE_KILLED_TENSION = 150;

/** Goods native settlements gather from their land and sell, as in the original. */
export const NATIVE_PRODUCE: GoodId[] = ['furs', 'sugar', 'tobacco', 'cotton', 'silver'];
/** Share of the land's yield (the settlement's own tile and its neighbours) a settlement gathers per round. */
export const PRODUCE_RATE: Record<SettlementKind, number> = { camp: 0.12, village: 0.16, city: 0.2 };
/** Most of each good a settlement stores for sale. */
export const PRODUCE_CAP: Record<SettlementKind, number> = { camp: 100, village: 150, city: 200 };
/** Cities mine silver: their silver yield counts this many times. */
export const CITY_SILVER = 3;

/**
 * Price per unit a settlement asks for its goods: the good's starting European price times this
 * factor, which grows with tension (an angry tribe asks up to twice as much) and falls when the
 * settlement holds plenty.
 */
export const BUY_PRICE_FACTOR = 0.5;
export const BUY_PRICE_PLENTY = 0.8;

/**
 * Lost City Rumours on tribal land (within this distance of a settlement, not bought or taken) may
 * be a burial ground. Weight among the rumour outcomes, multiplied by the difficulty's `burialGrounds`.
 */
export const BURIAL_RADIUS = 2;
export const BURIAL_WEIGHT = 4;

/**
 * Surrender: when a tribe's capital is burned, its remaining settlements submit to the attacker
 * with this chance (one seeded roll per tribe), unless the attacker desecrated its burial ground.
 * Submitting resets their tension to 0, makes peace, ends attacks and demands on that nation,
 * gives its land freely and pays a tribute of this share of each settlement's gold.
 */
export const SURRENDER_CHANCE = 0.6;
export const SURRENDER_TRIBUTE = 0.5;

/** Missionary actions. */
export const DENOUNCE_CHANCE = 0.4;
/** Added for a firebrand preacher; subtracted when the rival's missionary is one. */
export const DENOUNCE_EXPERT = 0.2;
/** Chance that a missionary whose denunciation fails is killed. */
export const DENOUNCE_FAIL_DEATH = 0.5;
/** Gold to incite a settlement's tribe, by settlement kind (capital ×1.5). */
export const INCITE_PRICE: Record<SettlementKind, number> = { camp: 300, village: 450, city: 700 };
/** Tension the tribe gains towards the target: this settlement, and the tribe's other settlements. */
export const INCITE_TENSION = 350;
export const INCITE_TENSION_OTHERS = 150;
