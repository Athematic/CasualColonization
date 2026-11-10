/**
 * The independence plan of the advanced computer players (0.7). Instead of one late check, a
 * nation takes up a plan from mid-game (AiProfile.independence.adopt) and works towards a
 * declaration it can win:
 *
 * 1. **Liberty.** Until the rebels are BOOST_MARGIN points past the share needed to declare, bells
 *    weigh at least PLAN_LIBERTY, and every colony builds a printing press, later a newspaper.
 * 2. **Defences.** Armories, stockades first, forts in colonies of five, warehouses for muskets and
 *    horses (ai/advanced.ts, buildPlan).
 * 3. **Arms**, once the rebels are within ARM_BELOW points of the share needed and the nation is
 *    not ready yet: muskets and horses stocked in the colonies (a beaten soldier re-arms from the
 *    warehouse, a dragoon takes fresh horses; before the war they count as militia), up to two
 *    armed units in every colony, soldiers mounted as dragoons, then veterans and artillery bought
 *    with the gold. Gold is cheap in score; colonists taken from work are not, so most stay at work
 *    until the war. Troops and supplies go first to the weakest colonies.
 *    Within a few points of the share needed (ai/advanced.ts, FOUND_BELOW) the nation founds no
 *    more colonies: each one makes the King's force grow and is too small to hold out. (Freezing
 *    from the start of arming cost Creative a third of its colonists in the tournament.)
 *    Once the rebels are CURB_MARGIN points past the share needed it rings fewer bells
 *    (CURB_LIBERTY): the King adds troops for every bell (crown.ts), and Sons of Liberty
 *    membership does not fall without new colonists, the classic tactic of the original game.
 *    Colonies still short of half their people in the Sons of Liberty keep ringing (they would
 *    fight less hard, or turn Tory).
 * 4. **The declaration** (ai/royal.ts, ai/advanced.ts `independence`), once the defence with the
 *    help it can expect is `ratio` times the royal force, the defence and the mercenaries alone
 *    reach HOLD_ALONE times it (the intervention comes some turns into the war), and no third of
 *    the colonies is weak; tiny outposts that could not hold are abandoned first. During the war
 *    bells weigh at least WAR_LIBERTY: a foreign power intervenes once enough are rung
 *    (rebellion.ts).
 *
 * Curbing bells as soon as the rebels are a bare majority was tried first: it cost about 40 points
 * a game in rebels and Founding Fathers (see docs/AI_FEATURE_AUDIT.md, "Independence planning").
 */
import { aiTurn } from '../scenarios/index.js';
import type { GameState, Player } from '../types.js';
import type { AiProfile } from './profiles.js';
import { rebelPower, refPower } from './royal.js';

/** Arming starts once the rebel share is this many points below the share needed to declare. */
export const ARM_BELOW = 20;
/** Bells weigh more until the rebel share is this many points above the share needed to declare. */
export const BOOST_MARGIN = 6;
/** Weight of liberty bells while the plan still needs rebels (AiProfile.liberty; 1.4 is Competent's normal weight). */
export const PLAN_LIBERTY = 2;
/** Weight of liberty bells during the war: a foreign power intervenes once enough are rung. */
export const WAR_LIBERTY = 2.5;
/** Bells are curbed while arming once the rebel share is this many points above the share needed to declare. */
export const CURB_MARGIN = 15;
/** Weight of liberty bells while curbing them. */
export const CURB_LIBERTY = 0.3;

export interface PlanTurn {
  /** The nation follows an independence plan. */
  adopted: boolean;
  /** It arms: the defence is short of what the declaration needs and the rebels are close enough. */
  arming: boolean;
  /** Bells weigh more: the rebels are not yet a safe majority. */
  boost: boolean;
  /** Bells weigh less: arming, with the rebels a safe majority. */
  curb: boolean;
}

export const NO_PLAN: PlanTurn = { adopted: false, arming: false, boost: false, curb: false };

/**
 * Whether the nation adopts (or has adopted) an independence plan this turn. Adoption is
 * remembered (AiMemory.independencePlan), so the plan does not come and go with the share.
 */
export function adoptsPlan(s: GameState, p: Player, prof: AiProfile, share: number, support = 0): boolean {
  const plan = prof.independence;
  if (!plan?.adopt || p.independence !== 'none') return false;
  const memory = (p.aiMemory = p.aiMemory ?? {});
  if (memory.independencePlan !== undefined) return true;
  const { adopt } = plan;
  if (share < adopt.share && s.turn < aiTurn(s, adopt.turn)) return false;
  if (adopt.strength !== undefined && rebelPower(s, p) + support < refPower(p) * plan.ratio * adopt.strength) return false;
  memory.independencePlan = s.turn;
  return true;
}

/**
 * The plan's steps this turn: whether the nation arms and whether its bells weigh more. `short`
 * says whether its defence (with the help it can expect) is still below what the declaration
 * needs; it is only asked once the plan is adopted and the rebels are close enough to arm.
 */
export function planTurn(s: GameState, p: Player, prof: AiProfile, share: number, short: () => boolean, support = 0): PlanTurn {
  const plan = prof.independence;
  if (!plan || !adoptsPlan(s, p, prof, share, support)) return NO_PLAN;
  const arming = share >= plan.minShare - ARM_BELOW && short();
  return { adopted: true, arming, boost: share < plan.minShare + BOOST_MARGIN, curb: arming && share >= plan.minShare + CURB_MARGIN };
}

/** The weight of liberty bells under the plan (or during the war), else the profile's own. */
export function planLiberty(p: Player, prof: AiProfile, plan: PlanTurn): number {
  if (p.independence === 'declared') return Math.max(prof.liberty, WAR_LIBERTY);
  if (plan.curb) return CURB_LIBERTY;
  return plan.boost ? Math.max(prof.liberty, PLAN_LIBERTY) : prof.liberty;
}
