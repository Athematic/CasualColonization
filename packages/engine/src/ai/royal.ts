/**
 * The computer players and the Crown (Alpha 0.5): answering the King's demands for gold,
 * reacting to the wars the King declares for them, and weighing the Royal Expeditionary Force
 * the Crown has built up when deciding on independence. The rules are in crown.ts; the numbers
 * here are tuned with tournaments (docs/AI_FEATURE_AUDIT.md, "The Crown").
 */
import { defencePower } from '../combat.js';
import { answerDemand, demandPenalty, REF_ON_REFUSAL } from '../crown.js';
import { proposePeace, WAR_WEARINESS } from '../diplomacy.js';
import { distance, isShip, unitsAt } from '../queries.js';
import { ROLES, UNIT_TYPES } from '../rules/units.js';
import type { GameState, Player, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';
import type { AiProfile } from './profiles.js';

/** A demand at most this share of the treasury is cheap: paid whatever refusing would cost. */
export const CHEAP_DEMAND = 0.15;
/** Gold a royal regular added on refusal is reckoned to cost a nation that plans independence. */
export const REGULAR_COST = 600;
/** Defence a typical armed rebel brings once fortified in a colony after the declaration. */
export const REBEL_DEFENCE = 7.5;

/** Attack power of a King's regular as a soldier and as a dragoon, and of royal artillery. */
const REGULAR = ROLES.soldier.offence * 1.5 * 1.5;
const DRAGOON = ROLES.dragoon.offence * 1.5 * 1.5;
const ARTILLERY = UNIT_TYPES.artillery.offence * 1.5;

/**
 * The Royal Expeditionary Force as attack power: what each unit brings to an attack, dragoons
 * counted half again as they lose their horses before they are beaten.
 */
export function refPower(p: Player): number {
  return p.ref.regulars * REGULAR + p.ref.dragoons * DRAGOON * 1.5 + p.ref.artillery * ARTILLERY;
}

const isArmed = (u: Unit) => u.role === 'soldier' || u.role === 'dragoon' || UNIT_TYPES[u.type].kind === 'artillery';

/**
 * The defence the nation could put up after a declaration: its armed units in its colonies, a
 * quarter stronger (rebels fight hardest for colonies that believe in independence, and veterans
 * become Continentals), and every 50 muskets in the warehouses re-arms a beaten soldier.
 */
export function rebelPower(s: GameState, p: Player): number {
  let power = 0;
  let muskets = 0;
  for (const c of ownColonies(s, p)) {
    muskets += c.goods.muskets;
    for (const u of unitsAt(s, c.x, c.y)) if (u.owner === p.id && !isShip(u) && isArmed(u)) power += defencePower(s, u) * 1.25;
  }
  return power + Math.floor(muskets / 50) * ROLES.soldier.defence;
}

/**
 * Armed units per colony a nation planning independence wants: enough, with the muskets it
 * holds, for its defence to reach `ratio` of the Royal Expeditionary Force, between the plan's
 * own minimum and 4.
 */
export function armyForIndependence(s: GameState, p: Player, plan: { armyPerColony: number; ratio: number }): number {
  const colonies = ownColonies(s, p).length;
  if (!colonies) return plan.armyPerColony;
  const units = (refPower(p) * plan.ratio) / REBEL_DEFENCE;
  return Math.min(4, Math.max(plan.armyPerColony, Math.ceil(units / colonies)));
}

/** Whether the nation's defence can plausibly beat the Royal Expeditionary Force waiting for it. */
export function canBeatRef(s: GameState, p: Player, ratio: number): boolean {
  return rebelPower(s, p) >= refPower(p) * ratio;
}

/**
 * Pays or refuses the King's demand. A cheap demand (CHEAP_DEMAND of the treasury or less) is paid
 * when the gold left covers the reserve; a dearer one only when refusing would cost more: the
 * goods seized, at home prices after tax, and for a nation that plans independence the regulars
 * the King adds. A demand the treasury cannot meet is refused.
 */
export function payDemand(s: GameState, p: Player, prof: AiProfile | null, planning: boolean): boolean {
  const demand = p.pendingDemand;
  if (!demand || p.gold < demand.gold) return false;
  if (!prof) return true; // Naive pays whatever it is asked, when it can.
  if (demand.gold <= p.gold * CHEAP_DEMAND && p.gold - demand.gold >= prof.reserve) return true;
  const penalty = (demandPenalty(s, p.id).value * (100 - p.tax)) / 100 + (planning ? REF_ON_REFUSAL * REGULAR_COST : 0);
  return demand.gold <= penalty;
}

/** Answers a pending demand, and handles a war the King has declared. Call early in the turn. */
export function crownAffairs(s: GameState, p: Player, prof: AiProfile | null, planning = false, strength = 0): void {
  if (p.pendingDemand) safely(() => void answerDemand(s, p.id, payDemand(s, p, prof, planning)));
  if (prof) safely(() => royalWarTurn(s, p, prof, strength));
}

/**
 * A war the King declared: a nation that means to fight (aggression 0.5 or more) and finds an
 * enemy colony within 10 tiles its spare army (of the given attack strength) could take marches on it; otherwise it offers
 * peace once the enemy can be tired of the war (WAR_WEARINESS turns), unless it already has a
 * war target there.
 */
function royalWarTurn(s: GameState, p: Player, prof: AiProfile, strength: number): void {
  const enemy = p.royal?.warOn;
  if (!enemy || p.stance[enemy] !== 'war' || (p.royal?.lastWar ?? -1) < (p.warSince[enemy] ?? Infinity)) return;
  const memory = (p.aiMemory = p.aiMemory ?? {});
  const target = memory.warTarget ? s.colonies[memory.warTarget] : undefined;
  if (target && target.owner === enemy) return;
  if (prof.aggression >= 0.5) {
    const ours = ownColonies(s, p);
    const prey = Object.values(s.colonies)
      .filter((c) => c.owner === enemy && ours.some((o) => distance(o.x, o.y, c.x, c.y) <= 10))
      .map((c) => ({ c, score: strength / (unitsAt(s, c.x, c.y).filter((u) => u.owner === enemy && !isShip(u)).reduce((n, u) => n + defencePower(s, u), 0) + 1) }))
      .sort((a, b) => b.score - a.score)[0];
    if (prey && prey.score >= 2.5 / prof.aggression) {
      memory.warTarget = prey.c.id;
      return;
    }
  }
  if (s.turn - (p.warSince[enemy] ?? s.turn) >= WAR_WEARINESS) proposePeace(s, p.id, enemy);
}
