/**
 * Alliances between European nations (docs/design/cooperation.md, Beta 1 step 1): the rung after
 * Favoured Nation. An alliance is a treaty of kind 'alliance' (treaties.ts) with two or more
 * members; a nation belongs to at most one. Its terms (ALLIANCE_TERMS):
 * - a defensive pact: war on one member is war with every member (combat.ts declareWar). Joining
 *   a member's own war is optional; computer allies join when they gain (ai/foreign.ts);
 * - open colonies: members' units may enter, garrison and trade in each other's colonies without
 *   owning them (movement.ts, combat.ts, tradeInColony here);
 * - shared sight: members see what each other's units and colonies see (queries.ts reveal).
 *
 * Unlocking reuses Favoured Nation's rules: the two must already be each other's Favoured Nation,
 * with more years of peace and more trade between them, both thresholds hidden and drawn per pair
 * from the game seed (a stream of their own, so nothing is stored and no other random outcome
 * moves). Leaving costs more than cancelling Favoured Nation: the same cascade (trade agreement
 * and routes ended, goods seized) plus a longer waiting period and hostility. Between two people
 * none of the thresholds, waiting or hostility apply, as with Favoured Nation.
 *
 * Everything here is switched by the scenario's `mechanics.alliances`; the numbers are the
 * scenario's `alliances` merged over ALLIANCE_RULES.
 */
import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { cargoRoomFor, colonyAt, isShip, isWater, message, neighbours, player, tileAt, unitName, unitsAboard, unitsAt } from './queries.js';
import { atPeace, cancelFavoured, FOREIGN_KEEP, inWaitingPeriod, isFavoured, isHostile, pairRandom, relation, tradeAtForeignColony, yearsOfPeace } from './relations.js';
import type { NationId } from './rules/nations.js';
import { calendarOf, goodsOf, mechanicsOf, nationOf, nationTitle, scenarioOf, turnAfterYears } from './scenarios/index.js';
import type { AllianceRules, Cooperation, YearsAround } from './scenarios/types.js';
import type { AiLevel } from './ai/profiles.js';
import { track } from './telemetry.js';
import { addTreaty, bound, endTreaty, treatyNations } from './treaties.js';
import type { AllianceTerms, GameState, Treaty, Unit } from './types.js';
import { removeUnit, setUnitLoc } from './unitindex.js';
import type { GoodId } from './rules/goods.js';

/** The engine's alliance rules; a scenario's `alliances` is merged over them. */
export const ALLIANCE_RULES: AllianceRules = {
  // Favoured Nation needs 8–12 years of peace; an alliance about twice as long.
  peaceYears: { base: 18, spread: 4 },
  // Favoured Nation's computer players want 300 gold traded; an alliance more.
  volume: { min: 250, max: 750 },
  // Cancelling Favoured Nation: waiting 7–13 years, hostility 10–20.
  waitingYears: { base: 15, spread: 3 },
  hostilityYears: { base: 25, spread: 5 },
};

/**
 * How readily the computer players cooperate, for the most cooperative level (Creative); the
 * others take LEVEL_COOPERATION's share. A scenario's `ai.cooperation` is merged over it. Tuned for
 * computer-only tournaments to give an alliance in about one game in four and a concord victory
 * about once in 30–40 games (docs/design/cooperation.md, C11).
 */
export const COOPERATION: Cooperation = { proposeAlliance: 0.5, acceptAlliance: 0.8, joinWar: 0.8, foundCompany: 0.03, buyShares: 0.1 };

/** Each level's share of COOPERATION's chances: Creative seeks alliances out, Naive never proposes. */
export const LEVEL_COOPERATION: Record<AiLevel, { propose: number; accept: number }> = {
  naive: { propose: 0, accept: 0.5 },
  competent: { propose: 0.6, accept: 0.8 },
  combative: { propose: 0.5, accept: 0.7 },
  creative: { propose: 1, accept: 1 },
};

/** The game's cooperation: the scenario's `ai.cooperation` over COOPERATION. */
export function cooperationOf(s: GameState): Cooperation {
  const own = scenarioOf(s).ai.cooperation;
  return own ? { ...COOPERATION, ...own } : COOPERATION;
}

/** The terms every alliance is made with in Beta 1. */
export const ALLIANCE_TERMS: AllianceTerms = { kind: 'alliance', defensive: true, openColonies: true, sharedSight: true };

/** The game's alliance rules: the scenario's over the engine's. */
export function allianceRules(s: GameState): AllianceRules {
  const own = scenarioOf(s).alliances;
  return own ? { ...ALLIANCE_RULES, ...own } : ALLIANCE_RULES;
}

/** Whether the scenario has alliances. */
export function alliancesOn(s: GameState): boolean {
  return !!mechanicsOf(s).alliances;
}

/** The alliance a nation belongs to, if any. */
export function allianceOf(s: GameState, nation: NationId): Treaty | undefined {
  const list = s.treaties;
  if (!list) return undefined;
  for (const t of list) if (!t.end && t.kind === 'alliance' && bound(t, nation)) return t;
  return undefined;
}

/** The other members of a nation's alliance (none when it has none). */
export function alliesOf(s: GameState, nation: NationId): NationId[] {
  const t = allianceOf(s, nation);
  return t ? treatyNations(t).filter((n) => n !== nation) : [];
}

/** Whether two nations are allies. */
export function isAllied(s: GameState, a: NationId, b: NationId): boolean {
  if (a === b) return false;
  const t = allianceOf(s, a);
  return !!t && bound(t, b);
}

function terms(t: Treaty): AllianceTerms {
  return t.terms?.kind === 'alliance' ? t.terms : ALLIANCE_TERMS;
}

/** Whether `nation`'s units may enter, garrison and trade in `owner`'s colonies. */
export function colonyOpenTo(s: GameState, owner: NationId, nation: NationId): boolean {
  if (owner === nation || !s.treaties) return false;
  const t = allianceOf(s, owner);
  return !!t && bound(t, nation) && terms(t).openColonies;
}

/** The nations `nation` shares its sight with (its allies under shared sight). */
export function sightSharers(s: GameState, nation: NationId): NationId[] {
  if (!s.treaties) return [];
  const t = allianceOf(s, nation);
  return t && terms(t).sharedSight ? treatyNations(t).filter((n) => n !== nation) : [];
}

/** The nations `nation` is bound to defend when attacked by `attacker`: its allies under a defensive pact. */
export function pactAllies(s: GameState, nation: NationId, attacker: NationId): NationId[] {
  if (!s.treaties || attacker === 'crown' || nation === 'crown') return [];
  const t = allianceOf(s, nation);
  return t && terms(t).defensive ? treatyNations(t).filter((n) => n !== nation && n !== attacker) : [];
}

/**
 * Whether war by `a` on `b` would be war on a friend of `a`: `b` is its ally, or the defensive
 * pact would bring in one of `a`'s allies or Favoured Nations. Computer players never start such a war.
 */
export function warOnFriend(s: GameState, a: NationId, b: NationId): boolean {
  if (!s.treaties) return false;
  if (isAllied(s, a, b)) return true;
  return pactAllies(s, b, a).some((n) => isAllied(s, a, n) || isFavoured(s, a, n));
}

/** A whole number from base − spread to base + spread, from a seeded number in [0, 1). */
function around(r: number, v: YearsAround): number {
  return v.base - v.spread + Math.floor(r * (2 * v.spread + 1));
}

/** The hidden thresholds for an alliance between two nations, drawn from their own seeded stream (never stored). */
export function allianceThresholds(s: GameState, a: NationId, b: NationId): { years: number; volume: number } {
  const rules = allianceRules(s);
  const years = around(pairRandom(s, a, b, 'alliance years'), rules.peaceYears);
  const volume = rules.volume.min + Math.floor(pairRandom(s, a, b, 'alliance volume') * (rules.volume.max - rules.volume.min + 1));
  return { years, volume };
}

/** Whether two Favoured Nations' years of peace and trade both reach the hidden thresholds for an alliance. */
export function allianceUnlocked(s: GameState, a: NationId, b: NationId): boolean {
  if (!isFavoured(s, a, b)) return false;
  const need = allianceThresholds(s, a, b);
  return yearsOfPeace(s, a, b) >= need.years && relation(s, a, b).volume >= need.volume;
}

function bothHuman(s: GameState, a: NationId, b: NationId): boolean {
  return player(s, a).human && player(s, b).human;
}

/**
 * Why `from` cannot propose an alliance to `to` now, or null. `from` may already lead or belong to
 * an alliance (then `to` is invited to join it); `to` must belong to none. Every member of
 * `from`'s alliance must be at peace with `to` and not hostile to it.
 */
export function allianceProblem(s: GameState, from: NationId, to: NationId): string | null {
  if (!alliancesOn(s)) return 'There are no alliances in this scenario.';
  if (from === to || from === 'crown' || to === 'crown' || s.players.find((p) => p.id === from)?.kind === 'company' || s.players.find((p) => p.id === to)?.kind === 'company') return 'Alliances are made between European nations.';
  if (!s.players.some((p) => p.id === from) || !s.players.some((p) => p.id === to)) return `${nationOf(s, to).name} is not taking part.`;
  const name = nationOf(s, to).name;
  if (!atPeace(s, from, to)) return `You are at war with ${name}.`;
  if (isAllied(s, from, to)) return `${nationTitle(s, to)} is already your ally.`;
  if (allianceOf(s, to)) return `${nationTitle(s, to)} already belongs to another alliance.`;
  for (const m of alliesOf(s, from)) {
    if (!atPeace(s, m, to)) return `Your ally ${nationOf(s, m).name} is at war with ${name}.`;
    if (!bothHuman(s, m, to) && isHostile(s, m, to)) return `Your ally ${nationOf(s, m).name} does not trust ${name}.`;
  }
  const pending = relation(s, from, to).proposal;
  if (pending) return pending.from === from ? `${nationTitle(s, to)} has not answered your last proposal yet.` : `${nationTitle(s, to)} is waiting for your answer to its proposal.`;
  // Two people can ally at any time; otherwise Favoured Nation, and more peace and trade.
  if (bothHuman(s, from, to)) return null;
  if (isHostile(s, from, to) || inWaitingPeriod(s, from, to)) return `${nationTitle(s, to)} does not trust you again yet.`;
  if (!isFavoured(s, from, to)) return `You must be each other's Favoured Nation first.`;
  if (!allianceUnlocked(s, from, to)) return `Relations with ${name} are not yet close enough for an alliance: they need more years of peace and more trade between you.`;
  return null;
}

/**
 * Whether a computer player accepts an alliance (or an invitation to join one) from `from`: at
 * peace and not hostile with every member, none of them its war target, and then a seeded chance
 * (the scenario's `acceptAlliance` times its level's share).
 */
export function aiAcceptsAlliance(s: GameState, ai: NationId, from: NationId): boolean {
  const p = player(s, ai);
  const members = [from, ...alliesOf(s, from)];
  const target = p.aiMemory?.warTarget;
  for (const m of members) {
    if (!atPeace(s, ai, m) || isHostile(s, ai, m)) return false;
    if (target && s.colonies[target]?.owner === m) return false;
    if (p.aiMemory?.warPlan?.nation === m) return false;
  }
  const chance = cooperationOf(s).acceptAlliance * LEVEL_COOPERATION[p.ai ?? 'naive'].accept;
  return pairRandom(s, ai, from, `alliance answer ${s.turn}`) < chance;
}

/**
 * Makes `a` and `b` allies: a new alliance, or `b` joins `a`'s (or `a` joins `b`'s). Members
 * share what they have explored from now on.
 */
export function makeAlliance(s: GameState, a: NationId, b: NationId): string {
  const existing = allianceOf(s, a) ?? allianceOf(s, b);
  const newcomer = existing ? (bound(existing, a) ? b : a) : b;
  if (existing) existing.parties.push({ kind: 'nation', id: newcomer });
  else addTreaty(s, 'alliance', [relation(s, a, b).a, relation(s, a, b).b], { ...ALLIANCE_TERMS });
  const t = allianceOf(s, a)!;
  shareExplored(s, treatyNations(t));
  track(a, existing ? 'diplomacy:alliance joined' : 'diplomacy:alliance made');
  track(b, existing ? 'diplomacy:alliance joined' : 'diplomacy:alliance made');
  const others = treatyNations(t).filter((n) => n !== newcomer);
  const text = existing
    ? `${nationTitle(s, newcomer)} joins the alliance of ${others.map((n) => nationOf(s, n).name).join(' and ')}. An attack on one of them is war with all of them.`
    : `${nationTitle(s, a)} and ${nationOf(s, b).name} are now allies: an attack on one is war with both, their units may enter each other's colonies, and they share what they see.`;
  message(s, text);
  noteHistory(s, 'alliance', [a, b], existing ? `${nationTitle(s, newcomer)} joins the alliance with ${others.map((n) => nationOf(s, n).name).join(' and ')}.` : `${nationTitle(s, a)} and ${nationOf(s, b).name} make an alliance.`);
  return text;
}

/** Members see everything any of them has explored. */
function shareExplored(s: GameState, members: NationId[]): void {
  const maps = members.map((n) => player(s, n).explored);
  const n = s.map.width * s.map.height;
  for (let i = 0; i < n; i++) {
    if (!maps.some((m) => m[i] === 1)) continue;
    for (const m of maps) m[i] = 1;
  }
}

/**
 * `by` leaves its alliance. With each former ally, Favoured Nation is cancelled as if `by` had
 * cancelled it (trade agreement and routes ended, goods seized), and, unless both are people, a
 * longer waiting period and hostility than a cancellation alone follow. Units in each other's
 * colonies are sent out. An alliance left with one member ends. `war` names the ally `by` is
 * going to war with, if that is why.
 */
export function leaveAlliance(s: GameState, by: NationId, war?: NationId): string {
  const t = allianceOf(s, by);
  if (!t) fail('You belong to no alliance.');
  if (!war) track(by, 'cmd:leaveAlliance');
  track(by, 'diplomacy:alliance left');
  const former = treatyNations(t).filter((n) => n !== by);
  t.parties = t.parties.filter((p) => !(p.kind === 'nation' && p.id === by));
  (t.left = t.left ?? []).push({ party: { kind: 'nation', id: by }, turn: s.turn });
  if (t.parties.length < 2) endTreaty(s, t, war ? 'war' : 'left', by);
  const rules = allianceRules(s);
  for (const o of former) {
    if (isFavoured(s, by, o)) cancelFavoured(s, by, o, o === war ? 'war' : 'cancel');
    expelUnits(s, by, o);
    expelUnits(s, o, by);
    if (bothHuman(s, by, o)) continue;
    const rel = relation(s, by, o);
    rel.cancels = (rel.cancels ?? 0) + 1;
    const cal = calendarOf(s);
    const wait = turnAfterYears(s.turn, around(pairRandom(s, by, o, `leave wait ${rel.cancels}`), rules.waitingYears), cal);
    const hostile = turnAfterYears(s.turn, around(pairRandom(s, by, o, `leave hostility ${rel.cancels}`), rules.hostilityYears), cal);
    rel.waitUntil = Math.max(rel.waitUntil ?? 0, wait);
    rel.hostileUntil = Math.max(rel.hostileUntil ?? 0, hostile);
  }
  const names = former.map((n) => nationOf(s, n).name).join(' and ');
  const text = `${nationTitle(s, by)} has left its alliance with ${names}${war ? ' by going to war' : ''}.${t.end ? ' The alliance is over.' : ''}`;
  message(s, text);
  noteHistory(s, 'cancel', [by, ...former], text);
  return text;
}

/**
 * Units of `nation` in colonies of `from` (no longer open to them) leave: to the nearest free tile
 * next to the colony (water for ships, land for the rest), or are lost when there is none.
 */
export function expelUnits(s: GameState, nation: NationId, from: NationId): void {
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== from) continue;
    for (const u of unitsAt(s, c.x, c.y)) {
      if (u.owner !== nation || u.loc.kind !== 'map') continue;
      sendOut(s, u, c);
    }
  }
}

/** Moves a unit out of a colony it may no longer stay in. */
export function sendOut(s: GameState, u: Unit, c: { x: number; y: number; name: string }): void {
  const ship = isShip(u);
  const spot = neighbours(s, c.x, c.y).find((n) => {
    const t = tileAt(s, n.x, n.y);
    if (!t || isWater(t) !== ship || colonyAt(s, n.x, n.y)) return false;
    return unitsAt(s, n.x, n.y).every((o) => o.owner === u.owner);
  });
  if (spot) {
    setUnitLoc(s, u, { kind: 'map', x: spot.x, y: spot.y });
    delete u.dest;
    u.state = 'active';
    message(s, `${unitName(u)} has to leave ${c.name}.`, u.owner, spot);
  } else {
    message(s, `${unitName(u)} has to leave ${c.name} and, with nowhere to go, is lost.`, u.owner, c);
    for (const p of unitsAboard(s, u)) removeUnit(s, p.id);
    removeUnit(s, u.id);
  }
}

// ---------------------------------------------------------------------------
// Trading in an ally's colony

/**
 * A ship or wagon train in an ally's colony sells goods to it (`buy` false) or buys goods from it,
 * at the terms of a trade route's foreign stop (relations.ts tradeAtForeignColony): the colony's
 * owner pays its home sell price with no tax as far as its warehouse and treasury allow, and sells
 * its surplus above FOREIGN_KEEP at its home buy price.
 */
export function tradeInColony(s: GameState, nation: NationId, carrierId: string, good: GoodId, amount: number, buy: boolean): string {
  const u = s.units[carrierId];
  if (!u || u.owner !== nation) fail('That is not your unit.');
  if (u.loc.kind !== 'map') fail('The carrier must be in an allied colony.');
  const c = colonyAt(s, u.loc.x, u.loc.y);
  if (!c || !colonyOpenTo(s, c.owner, nation)) fail('The carrier must be in an allied colony.');
  if (!goodsOf(s).includes(good)) fail('No such goods here.');
  if (amount <= 0) fail('Nothing to trade.');
  track(nation, buy ? 'cmd:buyInColony' : 'cmd:sellInColony');
  if (buy) {
    const keep = Math.max(FOREIGN_KEEP, c.goods[good] - Math.min(amount, cargoRoomFor(s, u, good)));
    const r = tradeAtForeignColony(s, u, c.id, [], [{ good, amount: keep }]);
    if (!r.bought) fail(`${c.name} has no ${good} to spare, or you cannot pay for it.`);
    track(nation, 'trade:allied colony purchases', r.bought);
    return `Bought ${r.bought} ${good} in ${c.name} for ${r.spent} gold.`;
  }
  const r = tradeAtForeignColony(s, u, c.id, [{ good, amount: c.goods[good] + amount }], []);
  if (!r.sold) fail(r.short ? `${nationTitle(s, c.owner)} cannot pay for it.` : `${c.name} has no room for it.`);
  track(nation, 'trade:allied colony sales', r.sold);
  return `Sold ${r.sold} ${good} in ${c.name} for ${r.earned} gold.`;
}

/** Whether a unit stands in an ally's colony. */
export function inAlliedColony(s: GameState, u: Unit): boolean {
  if (u.loc.kind !== 'map') return false;
  const c = colonyAt(s, u.loc.x, u.loc.y);
  return !!c && colonyOpenTo(s, c.owner, u.owner);
}
