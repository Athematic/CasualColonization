/**
 * The computer players and the Crown (Alpha 0.5): answering the King's demands for gold,
 * reacting to the wars the King declares for them, and weighing the Royal Expeditionary Force
 * the Crown has built up when deciding on independence. The rules are in crown.ts; the numbers
 * here are tuned with tournaments (docs/AI_FEATURE_AUDIT.md, "The Crown").
 */
import { defencePower } from '../combat.js';
import { answerDemand, demandPenalty, REF_ON_REFUSAL } from '../crown.js';
import { WAVE } from '../independence.js';
import { sonsOfLiberty, TORY_COLONY_BELOW } from '../production.js';
import { aiColonyReport } from './reports.js';
import { answerMercenaries, INTERVENTION, interventionBells, interventionForce, mercenaryCompany, TORY_LANDING } from '../rebellion.js';
import { proposePeace, WAR_WEARINESS } from '../diplomacy.js';
import { colonyWorkers, distance, isCoastal, isShip, unitsAt } from '../queries.js';
import { STOCKADE_DEFENCE } from '../rules/buildings.js';
import { ROLES, UNIT_TYPES } from '../rules/units.js';
import type { Colony, GameState, Player, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';
import type { AiProfile } from './profiles.js';

/** A demand at most this share of the treasury is cheap: paid whatever refusing would cost. */
export const CHEAP_DEMAND = 0.15;
/** Gold a royal regular added on refusal is reckoned to cost a nation that plans independence. */
export const REGULAR_COST = 600;
/** Defence a typical armed rebel brings once fortified in a colony after the declaration (a militia soldier in a committed colony with a stockade: 9). */
export const REBEL_DEFENCE = 9;

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

/** A colony whose Sons of Liberty are at least this share fights harder after a declaration (combat.ts) and turns half its soldiers into Continentals. */
const COMMITTED = 50;

/**
 * The defence an armed unit (or a militia soldier, for `u` undefined) would put up in colony `c`
 * after a declaration, fortified: veterans become Continentals (twice as strong), so do half the
 * soldiers of a committed colony; the walls, artillery's bonus in a colony, fortification and,
 * in a committed colony, the rebels' own +50%.
 */
function rebelDefence(c: Colony, committed: boolean, u?: Unit): number {
  const def = u ? UNIT_TYPES[u.type] : UNIT_TYPES.freeColonist;
  const artillery = def.kind === 'artillery';
  const base = artillery ? def.defence : ROLES[u?.role ?? 'soldier'].defence;
  const troop = artillery ? 1 : u?.type === 'veteranSoldier' || u?.type === 'continentalSoldier' ? 2 : committed ? 1.5 : 1;
  const walls = c.buildings.stockade > 0 ? STOCKADE_DEFENCE[c.buildings.stockade - 1] : 0;
  const bonus = walls + (artillery ? 75 : 0) + 50 + (committed ? 50 : 0);
  return base * troop * (1 + bonus / 100);
}

/** What a colony would hold out with after a declaration: its armed units, and the muskets and horses that re-arm them. */
export interface ColonyDefence {
  colony: Colony;
  /** Defence of its armed units and stores, as `rebelDefence`. */
  power: number;
}

/**
 * Each colony's defence after a declaration: its armed units, every 50 muskets in the warehouse
 * (a beaten soldier re-arms from it, or a colonist takes up arms), and every 50 horses where
 * dragoons are (a beaten dragoon takes fresh ones).
 */
export function colonyDefences(s: GameState, p: Player): ColonyDefence[] {
  return ownColonies(s, p).map((c) => {
    const committed = sonsOfLiberty(s, c) >= COMMITTED;
    const armed = unitsAt(s, c.x, c.y).filter((u) => u.owner === p.id && !isShip(u) && isArmed(u) && !u.ally);
    let power = armed.reduce((n, u) => n + rebelDefence(c, committed, u), 0);
    const muskets = Math.floor(c.goods.muskets / 50);
    const dragoons = armed.filter((u) => u.role === 'dragoon');
    const horses = dragoons.length ? Math.floor(c.goods.horses / 50) : 0;
    power += muskets * rebelDefence(c, committed);
    if (horses) power += horses * rebelDefence(c, committed, dragoons[0]);
    return { colony: c, power };
  });
}

/**
 * The defence the nation could put up after a declaration (see `colonyDefences`): the sum over its
 * colonies, a colony that would be a Tory colony after the declaration (Sons of Liberty below
 * TORY_COLONY_BELOW) counting for less: landings there bring TORY_LANDING troops instead of WAVE
 * (rebellion.ts). Compared with the Royal Expeditionary Force's attack power (`refPower`).
 * `defences` are the nation's `colonyDefences`, when the caller has them.
 */
export function rebelPower(s: GameState, p: Player, defences = colonyDefences(s, p)): number {
  return defences.reduce((n, d) => n + d.power * (sonsOfLiberty(s, d.colony) < TORY_COLONY_BELOW ? WAVE / TORY_LANDING : 1), 0);
}

/**
 * The defence a colony should have: an even share of HOLD_ALONE times the royal force. The King's
 * troops land next to the weakest coastal colony and those ashore march on the nearest colony
 * (independence.ts), so troops in a strong colony do not help a weak one: probe wars were lost
 * colony by colony while the sum of the defence was higher than the King's force.
 */
export function powerNeeded(s: GameState, p: Player): number {
  return (refPower(p) * HOLD_ALONE) / Math.max(1, ownColonies(s, p).length);
}

/** Share of `powerNeeded` below which a colony is weak: it would fall to the first royal troops. */
export const WEAK_BELOW = 0.5;

/**
 * Colonies with less than WEAK_BELOW of `powerNeeded`. Muskets, horses and spare troops go there
 * first, and a declaration waits while a third of the colonies are weak: the war is lost once half
 * are taken (independence.ts). `mercenaries` (their defence, as `supportParts`) join the weakest
 * coastal colony at the declaration (rebellion.ts, weakestColony). `defences` are the nation's
 * `colonyDefences`, when the caller has them; the mercenaries are added to them.
 */
export function weakColonies(s: GameState, p: Player, mercenaries = 0, defences = colonyDefences(s, p)): Colony[] {
  const need = powerNeeded(s, p) * WEAK_BELOW;
  if (mercenaries > 0) {
    const coastal = defences.filter((d) => isCoastal(s, d.colony.x, d.colony.y));
    const landing = (coastal.length ? coastal : defences).reduce<ColonyDefence | null>((a, d) => (!a || d.power < a.power ? d : a), null);
    if (landing) landing.power += mercenaries;
  }
  return defences.filter((d) => d.power < need && colonyWorkers(s, d.colony).length > 0).map((d) => d.colony);
}

/** Most armed units a colony keeps while arming for independence (muskets and horses in store add to them). */
export const MAX_GARRISON = 4;

/**
 * Armed units per colony a nation planning independence wants: enough for its defence to reach
 * `ratio` of the Royal Expeditionary Force, between the plan's own minimum and MAX_GARRISON.
 */
export function armyForIndependence(s: GameState, p: Player, plan: { armyPerColony: number; ratio: number }, support = 0): number {
  const colonies = ownColonies(s, p).length;
  if (!colonies) return plan.armyPerColony;
  const units = Math.max(0, refPower(p) * plan.ratio - support) / REBEL_DEFENCE;
  return Math.min(MAX_GARRISON, Math.max(plan.armyPerColony, Math.ceil(units / colonies)));
}

/** Whether the defence, with `support`, is still short of `ratio` times the Royal Expeditionary Force. `power` is the nation's `rebelPower`, when the caller has it. */
export function defenceShort(s: GameState, p: Player, ratio: number, support = 0, power = rebelPower(s, p)): boolean {
  return power + support < refPower(p) * ratio;
}

/**
 * Whether the nation's defence can plausibly beat the Royal Expeditionary Force waiting for it,
 * with `support` (see `expectedSupport`) from mercenaries and a foreign intervention.
 */
export function canBeatRef(s: GameState, p: Player, ratio: number, support = 0): boolean {
  return rebelPower(s, p) + support >= refPower(p) * ratio;
}

/**
 * Defence one mercenary or intervention soldier, dragoon or artillery brings once fortified in a
 * committed rebel colony with a stockade (a veteran soldier there defends at about 9, a veteran
 * dragoon at 13, artillery at 11: the same measure as `rebelPower`).
 */
export const SUPPORT_DEFENCE = { soldiers: 9, dragoons: 13, artillery: 11 };
/**
 * Share of the intervention force a nation counts on before declaring: it comes only if the
 * rebellion lasts and holds, and it lands in the middle of the war, not at the start.
 */
export const INTERVENTION_TRUST = 0.6;
/** The intervention counts only if the nation's bells would bring it within this many turns of the declaration. */
export const INTERVENTION_HORIZON = 20;

const supportPower = (c: { soldiers: number; dragoons: number; artillery: number }) =>
  c.soldiers * SUPPORT_DEFENCE.soldiers + c.dragoons * SUPPORT_DEFENCE.dragoons + c.artillery * SUPPORT_DEFENCE.artillery;

/**
 * The help a nation can expect if it declares now (rebellion.ts): the mercenary company that
 * would offer its services at the declaration, if the treasury can pay for it, and
 * INTERVENTION_TRUST of the intervention force when the colonies ring enough bells for it to come
 * within INTERVENTION_HORIZON turns.
 */
export function expectedSupport(s: GameState, p: Player): number {
  const { mercenaries, intervention } = supportParts(s, p);
  return mercenaries + intervention;
}

/** The two parts of `expectedSupport`: the mercenaries, there from the start, and the intervention, which comes later. */
export function supportParts(s: GameState, p: Player): { mercenaries: number; intervention: number } {
  if (p.independence !== 'none') return { mercenaries: 0, intervention: 0 };
  const company = mercenaryCompany(s, p.id);
  const mercenaries = company ? supportPower(company) : 0;
  const bells = ownColonies(s, p).reduce((n, c) => n + aiColonyReport(s, c).produced.bells, 0);
  const turns = bells > 0 ? Math.max(INTERVENTION.minTurns, Math.ceil(interventionBells(s, p) / bells)) : Infinity;
  return { mercenaries, intervention: turns <= INTERVENTION_HORIZON ? supportPower(interventionForce(p)) * INTERVENTION_TRUST : 0 };
}

/**
 * Share of the royal force's power the rebels' own defence (`rebelPower`) and the mercenaries must
 * reach without the intervention: it comes INTERVENTION.minTurns into the war at the earliest, and
 * a rebellion that cannot hold that long is crushed before it lands (probe games: wars declared
 * on the strength of the intervention were lost in 5–9 turns).
 */
export const HOLD_ALONE = 1;

/** Whether the nation's own defence and the mercenaries can hold until the intervention comes (HOLD_ALONE). `power` is the nation's `rebelPower`, when the caller has it. */
export function holdsAlone(s: GameState, p: Player, mercenaries = supportParts(s, p).mercenaries, power = rebelPower(s, p)): boolean {
  return power + mercenaries >= refPower(p) * HOLD_ALONE;
}

/**
 * Hires the mercenary company offering its services, or turns it away. Naive never hires. The
 * advanced levels hire a company they can pay at the declaration (their decision to declare
 * counted on it), and later in the war whenever their defence is short of `ratio` times the
 * royal troops still to land and already ashore.
 */
export function hireMercenaries(s: GameState, p: Player, prof: AiProfile | null, ratio: number): void {
  const offer = p.mercenaryOffer;
  if (!offer) return;
  let hire = !!prof && p.gold >= offer.price && p.independence === 'declared';
  if (hire && offer.turn !== p.refAtDeclaration?.turn) {
    const ashore = Object.values(s.units).filter((u) => u.owner === 'crown' && u.against === p.id && !isShip(u)).length;
    const threat = refPower(p) + ashore * REGULAR;
    hire = rebelPower(s, p) < threat * ratio;
  }
  safely(() => void answerMercenaries(s, p.id, hire));
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
 * enemy colony within 10 tiles that its spare army (of the given attack strength) could take
 * marches on it; otherwise it offers peace once the enemy can be tired of the war
 * (WAR_WEARINESS turns), unless it already has a war target there.
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

/**
 * One colony's power in `colonyDefences`, worked out alone (the same sum): for a caller that needs
 * only a few colonies, such as a soldier weighing its own colony against those nearby.
 */
export function rebelColonyDefence(s: GameState, p: Player, c: Colony): number {
  const committed = sonsOfLiberty(s, c) >= COMMITTED;
  const armed = unitsAt(s, c.x, c.y).filter((u) => u.owner === p.id && !isShip(u) && isArmed(u) && !u.ally);
  let power = armed.reduce((n, u) => n + rebelDefence(c, committed, u), 0);
  const muskets = Math.floor(c.goods.muskets / 50);
  const dragoons = armed.filter((u) => u.role === 'dragoon');
  const horses = dragoons.length ? Math.floor(c.goods.horses / 50) : 0;
  power += muskets * rebelDefence(c, committed);
  if (horses) power += horses * rebelDefence(c, committed, dragoons[0]);
  return power;
}
