/**
 * Diplomacy from the people's side (docs/design/native-nations.md, T11; Beta 3 step 4).
 *
 * Beta 2's four treaty kinds (peopletreaties.ts) were made for one nation and one people nobody
 * plays. Here a **playing people** (a player of `kind: 'people'`) makes the same treaties itself:
 * - **With a European nation, all four kinds both ways:** the people proposes and the nation
 *   answers, or the nation proposes and the people answers. A person answers a proposal waiting on
 *   the standing record (`PeopleRelation.proposal`, with its proposer in `by`); a computer answers
 *   at once: a computer nation as it answers a people's offer in Beta 2 (`acceptPeopleOffer` times
 *   its level's share), a computer people by Beta 2's seeded rule for a people's answer (`accept`
 *   times its temperament, never within `landYears` of land taken). The treaty is the same record
 *   (`nationParty`, `peopleParty`), so everything that reads Beta 2's treaties reads these.
 * - **Between two peoples, trade and defence** (T11): two people parties, at least one of them
 *   playing; a people nobody plays answers by Beta 2's rule.
 * - **Unlocking** reads Beta 2's standing record (natives.ts `peopleRelation`) from either side: the
 *   record is kept per pair, keyed nation first, two peoples in id order (`standingPair`), and
 *   written on first contact (one has seen a town, colony or settlement of the other). Its years of
 *   good relations and its trade volume meet the same hidden thresholds, drawn per pair.
 * - **Effects, read from the other side:** a trade treaty gives the side that comes to trade the
 *   treaty's prices (peopletrade.ts); a lease lets the nation's colonies work the people's claimed
 *   land beside them for a yearly rent paid to the people (`Tile.use`); a cultural exchange lets
 *   the nation's colonists learn the people's skills at its towns once a generation and the
 *   people's elders teach a turn sooner; a mutual defence pact draws each side into a war declared
 *   on the other (`pactDefenders`, read by combat.ts `declareWar`).
 * - **Breaking faith** works both ways: either side may end a treaty, and war between the two ends
 *   every treaty between them; the breaker's side of the record then waits and is distrusted, as
 *   in Beta 2 (`breaks`, `waitUntil`, `hostileUntil`).
 *
 * Nothing here runs in a game without a playing people (the Americas and the Caribbean stay
 * bit-identical): every entry point checks for one first.
 */
import { fail } from './errors.js';
import { bestJob } from './colony.js';
import { noteHistory } from './history.js';
import { addTension, peopleRelation, peopleRelationOf } from './natives.js';
import { kindOfId, systemsOfId } from './playerkind.js';
import {
  defenceUnlocked,
  exchangeUnlocked,
  landUseUnlocked,
  peopleTradeThresholds,
  peopleTradeUnlocked,
  peopleTreatiesOn,
  peopleTreatyOn,
  peopleTreatyRules,
  peopleTreatyText,
  temperamentOf,
} from './peopletreaties.js';
import { message, player, tileAt, tileWorkedBy, unitName, unitPosition, workArea } from './queries.js';
import { peoplePairRandom } from './relations.js';
import { TRIBES, type PlayerId, type TribeId } from './rules/nations.js';
import { UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import { cooperationOf, LEVEL_COOPERATION } from './alliances.js';
import { calendarOf, nationOf, peopleOf, scenarioOf, settlementKindIn, turnAfterYears, yearOf, yearValue } from './scenarios/index.js';
import type { YearsAround } from './scenarios/types.js';
import { track } from './telemetry.js';
import { addTreaty, endTreaty, nationParty, peopleParty } from './treaties.js';
import type { Colony, GameState, PeopleRelation, PeopleTreatyKind, Player, Treaty, TreatyParty } from './types.js';
import { colonyList, setUnitLoc } from './unitindex.js';
import { gridOf } from './grid.js';
import { computerLeague, leagueWar, processLeagues } from './peopleleague.js';

// ---------------------------------------------------------------------------
// Who is who

/** The playing people with this id, if it plays in this game. */
export function playingPeople(s: GameState, id: PlayerId): Player | undefined {
  for (const p of s.players) if (p.id === id && p.kind === 'people') return p;
  return undefined;
}

/** Whether a people plays in this game (otherwise nothing in this module runs). */
export function anyPlayingPeople(s: GameState): boolean {
  for (const p of s.players) if (p.kind === 'people') return true;
  return false;
}

/** The side of a pair: a European nation, a playing people or a people nobody plays. */
type Side = 'nation' | 'playing' | 'settlements';

function sideOf(s: GameState, id: PlayerId): Side {
  if (kindOfId(id) !== 'people') return 'nation';
  return playingPeople(s, id) ? 'playing' : 'settlements';
}

/** The party an id is in a treaty: a people's id a people party, any other a nation. */
export function partyOf(id: PlayerId): TreatyParty {
  return kindOfId(id) === 'people' ? peopleParty(id as TribeId) : nationParty(id);
}

/** Whether the treaty binds this nation or people. */
export function partyBinds(t: Treaty, id: PlayerId): boolean {
  for (const p of t.parties) if (p.id === id) return true;
  return false;
}

/** Whether a playing people is among the treaty's parties. */
export function withPlayingPeople(s: GameState, t: Treaty): boolean {
  for (const p of t.parties) if (p.kind === 'people' && playingPeople(s, p.id)) return true;
  return false;
}

/** The treaty of this kind in force between two parties (any kinds), if any. */
export function pairTreaty(s: GameState, kind: PeopleTreatyKind, a: PlayerId, b: PlayerId): Treaty | undefined {
  for (const t of s.treaties ?? []) if (!t.end && t.kind === kind && partyBinds(t, a) && partyBinds(t, b)) return t;
  return undefined;
}

/** The treaties with peoples in force between two parties, in the order made. */
export function pairTreaties(s: GameState, a: PlayerId, b: PlayerId): Treaty[] {
  const out: Treaty[] = [];
  for (const t of s.treaties ?? []) if (!t.end && t.kind in KIND_NAME && partyBinds(t, a) && partyBinds(t, b)) out.push(t);
  return out;
}

/** A side's name in running text: "England", "the Haudenosaunee", "the Sioux". */
export function sideName(s: GameState, id: PlayerId): string {
  if (kindOfId(id) !== 'people' || playingPeople(s, id)) return nationOf(s, id).name;
  return `the ${TRIBES[id as TribeId].name}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const KIND_NAME: Record<PeopleTreatyKind, true> = { 'people-trade': true, 'land-use': true, exchange: true, defence: true };

// ---------------------------------------------------------------------------
// The standing record, read from either side

/**
 * The order a pair's standing record is kept in (`peopleRelations`, "nation|people"): a nation
 * first; two peoples in id order. Beta 2's records (a nation and a people nobody plays) keep their keys.
 */
export function standingPair(a: PlayerId, b: PlayerId): [PlayerId, TribeId] {
  const pa = kindOfId(a) === 'people';
  const pb = kindOfId(b) === 'people';
  if (pb && !pa) return [a, b as TribeId];
  if (pa && !pb) return [b, a as TribeId];
  return a < b ? [a, b as TribeId] : [b, a as TribeId];
}

/** The pair's standing record, if written (on first contact). */
export function standingOf(s: GameState, a: PlayerId, b: PlayerId): PeopleRelation | undefined {
  const [n, p] = standingPair(a, b);
  return peopleRelationOf(s, n, p);
}

/** The pair's standing record, written now if it was not yet. */
export function standingWith(s: GameState, a: PlayerId, b: PlayerId): PeopleRelation {
  const [n, p] = standingPair(a, b);
  return peopleRelation(s, n, p);
}

/** Whether two sides are at war: two players by their stance, a people nobody plays by its stance towards a nation. */
export function pairAtWar(s: GameState, a: PlayerId, b: PlayerId): boolean {
  const pa = s.players.find((p) => p.id === a);
  if (pa && s.players.some((p) => p.id === b)) return pa.stance[b] === 'war';
  const [n, p] = sideOf(s, a) === 'settlements' ? [b, a] : [a, b];
  return s.tribes.find((t) => t.id === p)?.stance[n] === 'war';
}

/** Whether a side is still in the game: a player with a colony or unit, a people nobody plays with a settlement. */
export function stillThere(s: GameState, id: PlayerId): boolean {
  if (s.players.some((p) => p.id === id)) {
    if (colonyList(s).some((c) => c.owner === id)) return true;
    for (const k in s.units) if (s.units[k].owner === id) return true;
    return false;
  }
  for (const k in s.settlements) if (s.settlements[k].tribe === id) return true;
  return false;
}

/** Whether `viewer` has seen a town, colony or settlement of `other` (first contact). */
function hasSeen(s: GameState, viewer: PlayerId, other: PlayerId): boolean {
  const p = s.players.find((o) => o.id === viewer);
  if (!p) return false;
  const w = s.map.width;
  if (s.players.some((o) => o.id === other)) {
    for (const c of colonyList(s)) if (c.owner === other && p.explored[c.y * w + c.x]) return true;
    return false;
  }
  for (const k in s.settlements) {
    const st = s.settlements[k];
    if (st.tribe === other && p.explored[st.y * w + st.x]) return true;
  }
  return false;
}

/** The sides a playing people may stand in relations with: European nations, the other peoples. */
function counterparts(s: GameState, people: PlayerId): PlayerId[] {
  const out: PlayerId[] = [];
  for (const p of s.players) if (p.id !== people && (systemsOfId(p.id).peoples || p.kind === 'people')) out.push(p.id);
  for (const t of s.tribes) if (t.id !== people && !out.includes(t.id)) out.push(t.id);
  return out;
}

/** First contact: a playing people's standing record with a nation or people is written once either has seen the other's towns. */
function noteContacts(s: GameState): void {
  for (const p of s.players) {
    if (p.kind !== 'people') continue;
    for (const other of counterparts(s, p.id)) {
      if (standingOf(s, p.id, other)) continue;
      if (hasSeen(s, p.id, other) || hasSeen(s, other, p.id)) standingWith(s, p.id, other);
    }
  }
}

/** Whole years of the pair's current run of good relations. */
function yearsOfGood(s: GameState, a: PlayerId, b: PlayerId): number {
  const since = standingOf(s, a, b)?.goodSince;
  if (since === undefined) return 0;
  const cal = calendarOf(s);
  return yearValue(s.turn, cal) - yearValue(since, cal);
}

function waiting(rel: PeopleRelation | undefined, turn: number): boolean {
  return (rel?.waitUntil !== undefined && turn < rel.waitUntil) || (rel?.hostileUntil !== undefined && turn < rel.hostileUntil);
}

/**
 * How the other side stands towards `viewer`, in words (Beta 2's words, read from either side):
 * "No contact yet", "At war", "Distrusts you", "Remembers the broken treaty", "Partners in trade",
 * or by how near the trade treaty's thresholds are.
 */
export function pairStanding(s: GameState, viewer: PlayerId, other: PlayerId): string {
  const rel = standingOf(s, viewer, other);
  if (!rel) return 'No contact yet';
  if (pairAtWar(s, viewer, other)) return 'At war';
  if (rel.hostileUntil !== undefined && s.turn < rel.hostileUntil) return 'Distrusts you';
  if (rel.waitUntil !== undefined && s.turn < rel.waitUntil) return 'Remembers the broken treaty';
  if (pairTreaty(s, 'people-trade', viewer, other)) return 'Partners in trade';
  const [n, p] = standingPair(viewer, other);
  const need = peopleTradeThresholds(s, n, p);
  const share = Math.min(need.years ? yearsOfGood(s, viewer, other) / need.years : 1, need.volume ? rel.volume / need.volume : 1);
  if (rel.goodSince === undefined || share < 0.3) return 'Barely knows you';
  if (share < 0.7) return 'Getting to know you';
  if (share < 1) return 'Thinks well of you';
  return 'Trusts you';
}

// ---------------------------------------------------------------------------
// Proposals and answers

/** The kinds two sides may make: all four between a nation and a people, trade and defence between peoples. */
export function pairKinds(s: GameState, a: PlayerId, b: PlayerId): PeopleTreatyKind[] {
  const all: PeopleTreatyKind[] = sideOf(s, a) !== 'nation' && sideOf(s, b) !== 'nation' ? ['people-trade', 'defence'] : ['people-trade', 'land-use', 'exchange', 'defence'];
  return all.filter((k) => peopleTreatyOn(s, k));
}

/** The nation a playing people has its mutual defence pact with, if any (one nation at a time, as Beta 2). */
export function peopleDefenceNation(s: GameState, people: PlayerId): PlayerId | undefined {
  for (const t of s.treaties ?? []) {
    if (t.end || t.kind !== 'defence' || !partyBinds(t, people)) continue;
    const n = t.parties.find((p) => p.kind === 'nation');
    if (n) return n.id;
  }
  return undefined;
}

/**
 * Why `from` cannot propose a treaty of `kind` to `to` now, or null: what the proposer can know
 * before asking, in words. One of the two must be a playing people; the other a European nation or
 * a people. The hidden thresholds are in here, shown only in words, as in Beta 2.
 */
export function pairTreatyProblem(s: GameState, from: PlayerId, to: PlayerId, kind: PeopleTreatyKind = 'people-trade'): string | null {
  if (!peopleTreatiesOn(s)) return 'There are no treaties with native peoples in this scenario.';
  if (!peopleTreatyOn(s, kind)) return `There is no ${peopleTreatyText(kind).replace(/^an? /, '')} in this scenario.`;
  if (from === to) return 'A people makes no treaty with itself.';
  const fs = sideOf(s, from);
  const ts = sideOf(s, to);
  if (fs !== 'playing' && ts !== 'playing') return 'Only a playing people makes treaties this way.';
  if (!s.players.some((p) => p.id === from)) return 'Only a player proposes a treaty.';
  for (const [id, side] of [[from, fs], [to, ts]] as const) if (side === 'nation' && !systemsOfId(id).peoples) return 'Treaties with native peoples are made by European nations.';
  const name = sideName(s, to);
  if (!stillThere(s, to)) return `${capital(name)} are no longer on the map.`;
  if (!pairKinds(s, from, to).includes(kind)) return 'Between peoples, only trade treaties and mutual defence pacts are made.';
  const rel = standingOf(s, from, to);
  if (!rel) return `You have not met ${name} yet: one of you must first see a town of the other.`;
  if (pairAtWar(s, from, to)) return `You are at war with ${name}.`;
  if (pairTreaty(s, kind, from, to)) return `You already have ${peopleTreatyText(kind)} with ${name}.`;
  if (rel.proposal?.by) return rel.proposal.by === from ? `${capital(name)} have not answered your last proposal yet.` : `${capital(name)} are waiting for your answer to their proposal.`;
  if (waiting(rel, s.turn)) return `Trust between you and ${name} has not come back yet, after the broken treaty.`;
  const [n, p] = standingPair(from, to);
  const people = fs === 'nation' ? to : ts === 'nation' ? from : undefined;
  const nation = fs === 'nation' ? from : ts === 'nation' ? to : undefined;
  if (kind !== 'people-trade' && !pairTreaty(s, 'people-trade', from, to)) return `${capital(peopleTreatyText(kind))} needs a trade treaty with ${name} first.`;
  if (kind === 'people-trade' && !peopleTradeUnlocked(s, n, p)) return `${capital(name)} and you do not know each other well enough yet: it takes more years of good relations${peopleTreatyRules(s).trade.volume.max > 0 ? ' and more trade' : ''}.`;
  if (kind === 'land-use') {
    if (!landUseUnlocked(s, n, p)) return `It takes more years of good relations before land is lent between you and ${name}.`;
    const tiles = peopleLeasableTiles(s, nation!, people!);
    if (!tiles.length) return `None of the land of ${sideName(s, people!)} lies beside the colonies of ${sideName(s, nation!)}.`;
    const first = peopleLeaseRent(s, people!) * tiles.length;
    if (player(s, nation!).gold < first) return `The first year's rent for ${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'} is ${first} gold, more than ${sideName(s, nation!)} hold.`;
  }
  if (kind === 'exchange' && !exchangeUnlocked(s, n, p)) return `It takes more years of good relations before a cultural exchange with ${name}.`;
  if (kind === 'defence') {
    if (nation && !pairTreaty(s, 'land-use', from, to) && !pairTreaty(s, 'exchange', from, to)) return `A mutual defence pact needs land use or a cultural exchange with ${name} first.`;
    if (nation) {
      const other = peopleDefenceNation(s, people!);
      if (other && other !== nation) return `${capital(sideName(s, people!))} already have a mutual defence pact with ${sideName(s, other)}.`;
    }
    if (!defenceUnlocked(s, n, p)) return `It takes more years of good relations before ${name} and you stand together in war.`;
  }
  return null;
}

/** A computer side's answer to a proposal, drawn from the pair's own stream (the same turn gives the same answer). */
function computerAccepts(s: GameState, from: PlayerId, to: PlayerId, kind: PeopleTreatyKind): boolean {
  const [n, p] = standingPair(from, to);
  const r = peoplePairRandom(s, n, p, `answer ${kind} ${from} ${s.turn}`);
  if (sideOf(s, to) === 'nation') {
    // As a computer nation answers a people's offer (Beta 2, N11), times its level's share of the kind.
    const level = LEVEL_COOPERATION[player(s, to).ai ?? 'naive'];
    const share = kind === 'land-use' ? level.land : kind === 'exchange' ? level.exchange : kind === 'defence' ? level.defence : 1;
    return r < cooperationOf(s).acceptPeopleOffer * level.peopleAccept * share;
  }
  // A people, playing by the computer or nobody plays: Beta 2's answer (N8).
  if (peopleRefuses(s, to, from)) return false;
  return r < peopleTreatyRules(s).accept * temperamentOf(s, to as TribeId).accept;
}

/** A people's own reason to say no: it has not forgotten land taken from it lately (N8). */
function peopleRefuses(s: GameState, people: PlayerId, other: PlayerId): string | null {
  const took = standingOf(s, people, other)?.tookLand;
  if (took !== undefined && s.turn < turnAfterYears(took, peopleTreatyRules(s).landYears, calendarOf(s))) return `${capital(sideName(s, people))} refuse: they have not forgotten the land taken from them.`;
  return null;
}

/**
 * `from` proposes a treaty of `kind` to `to` (one of the two a playing people). A person on the
 * other side answers later (`answerPairProposal`; the proposal waits on the standing record); a
 * computer, or a people nobody plays, answers at once.
 */
export function proposePairTreaty(s: GameState, from: PlayerId, to: PlayerId, kind: PeopleTreatyKind = 'people-trade'): string {
  const problem = pairTreatyProblem(s, from, to, kind);
  if (problem) fail(problem);
  track(from, 'cmd:proposePairTreaty');
  const target = s.players.find((p) => p.id === to);
  if (target?.human) {
    standingWith(s, from, to).proposal = { kind, from: sideOf(s, from) === 'nation' ? 'nation' : 'people', turn: s.turn, by: from };
    message(s, `${capital(sideName(s, from))} propose ${peopleTreatyText(kind)}.`, to);
    return `Your proposal of ${peopleTreatyText(kind)} has been sent to ${sideName(s, to)}.`;
  }
  if (!computerAccepts(s, from, to, kind)) {
    track(from, 'natives:people treaty refused');
    const text = (sideOf(s, to) !== 'nation' && peopleRefuses(s, to, from)) || `${capital(sideName(s, to))} thank you, but are not ready for ${peopleTreatyText(kind)} with ${sideName(s, from)}.`;
    message(s, text, from);
    return text;
  }
  return makePairTreaty(s, from, to, kind);
}

/** A person answers the proposal `from` made. */
export function answerPairProposal(s: GameState, me: PlayerId, from: PlayerId, accept: boolean): string {
  const rel = standingOf(s, me, from);
  const p = rel?.proposal;
  if (!rel || !p || p.by !== from) fail(`${capital(sideName(s, from))} have made no proposal.`);
  delete rel.proposal;
  track(me, 'cmd:answerPairProposal');
  if (!accept) {
    message(s, `${capital(sideName(s, me))} decline ${peopleTreatyText(p.kind)}.`, from);
    return `You decline ${peopleTreatyText(p.kind)} with ${sideName(s, from)}.`;
  }
  const problem = pairTreatyProblem(s, from, me, p.kind);
  if (problem) {
    const text = `The proposal no longer stands. ${problem}`;
    message(s, text, me);
    return text;
  }
  return makePairTreaty(s, from, me, p.kind);
}

/** The benefits of a treaty of `kind` between these two, in one line. */
export function pairBenefits(s: GameState, a: PlayerId, b: PlayerId, kind: PeopleTreatyKind): string {
  const peoples = sideOf(s, a) !== 'nation' && sideOf(s, b) !== 'nation';
  if (kind === 'people-trade') {
    const r = peopleTreatyRules(s).trade;
    return peoples
      ? `whoever comes to the other's towns to barter gets ${Math.round((r.sell - 1) * 100)}% more for what it brings`
      : `whoever comes to trade gets ${Math.round((r.sell - 1) * 100)}% more for what it sells and pays ${Math.round((1 - r.buy) * 100)}% less for what it buys`;
  }
  if (kind === 'land-use') return `the nation's colonies may work the people's claimed land beside them for a yearly rent in gold paid to the people; the land stays theirs`;
  if (kind === 'exchange') {
    const y = peopleTreatyRules(s).exchange.teachYears;
    return `the nation's colonists may learn the people's skills at its towns, each town teaching again ${y.spread ? `some ${y.base} years` : `${y.base} years`} after it last taught, and the people's elders teach a turn sooner`;
  }
  return `a war declared on one is war with the other`;
}

/** Makes a treaty between two sides (one a playing people), in force from now. */
export function makePairTreaty(s: GameState, a: PlayerId, b: PlayerId, kind: PeopleTreatyKind): string {
  const [n, p] = standingPair(a, b);
  if (kind === 'land-use') return makePeopleLease(s, n, p);
  if (!pairTreaty(s, kind, n, p)) addTreaty(s, kind, [partyOf(n), peopleParty(p)]);
  track(a, 'natives:people treaty made');
  if (kind === 'exchange') track(a, 'natives:exchange made');
  if (kind === 'defence') track(a, 'natives:defence made');
  const text = `${capital(sideName(s, n))} and ${sideName(s, p)} make ${peopleTreatyText(kind)}: ${pairBenefits(s, n, p, kind)}.`;
  tell(s, [n, p], text);
  noteHistory(s, 'tribe', [n, p].filter((id) => s.players.some((o) => o.id === id)), `${capital(sideName(s, n))} and ${sideName(s, p)} make ${peopleTreatyText(kind)}.`);
  return text;
}

/** A message to each side that plays. */
function tell(s: GameState, ids: readonly PlayerId[], text: string, at?: { x: number; y: number }): void {
  for (const id of ids) if (s.players.some((p) => p.id === id)) message(s, text, id, at);
}

// ---------------------------------------------------------------------------
// Land use from the people's side: a lease of a playing people's claimed land

/** The rent per tile a year a people asks: the scenario's `landUse.rent` share of its land's base price, at least 1 gold. */
export function peopleLeaseRent(s: GameState, people: PlayerId): number {
  const base = settlementKindIn(scenarioOf(s), people as TribeId).landPrice.base;
  return Math.max(1, Math.round(peopleTreatyRules(s).landUse.rent * base));
}

/**
 * The tiles of a playing people's claimed land a nation could lease: in its colonies' work areas,
 * claimed by the people, not leased to another, no town or colony on it and not worked by the
 * people's own towns. In the order of the colonies and their work areas, each tile once.
 */
export function peopleLeasableTiles(s: GameState, nation: PlayerId, people: PlayerId): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<number>();
  const w = s.map.width;
  for (const c of colonyList(s)) {
    if (c.owner !== nation) continue;
    for (const q of workArea(s, c.x, c.y)) {
      const i = q.y * w + q.x;
      if (seen.has(i)) continue;
      seen.add(i);
      const t = tileAt(s, q.x, q.y)!;
      if (t.claim !== people || (t.use && t.use !== nation)) continue;
      if (colonyList(s).some((o) => o.x === q.x && o.y === q.y)) continue;
      if (tileWorkedBy(s, q.x, q.y)?.owner === people) continue;
      out.push(q);
    }
  }
  return out;
}

function makePeopleLease(s: GameState, nation: PlayerId, people: PlayerId): string {
  const tiles = peopleLeasableTiles(s, nation, people);
  const rent = peopleLeaseRent(s, people);
  const paid = rent * tiles.length;
  player(s, nation).gold -= paid;
  player(s, people).gold += paid;
  addTreaty(s, 'land-use', [nationParty(nation), peopleParty(people as TribeId)], { kind: 'land-use', rent, due: turnAfterYears(s.turn, 1, calendarOf(s)) });
  for (const q of tiles) tileAt(s, q.x, q.y)!.use = nation;
  track(nation, 'natives:people treaty made');
  track(nation, 'natives:lease made');
  if (paid > 0) track(nation, 'natives:rent paid', paid);
  const n = `${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'}`;
  const text = `${capital(sideName(s, nation))} and ${sideName(s, people)} agree on land use: the colonies of ${sideName(s, nation)} may work ${n} of the land of ${sideName(s, people)} beside them for ${rent} gold a tile a year (${paid} gold paid for the first year). The land stays theirs.`;
  tell(s, [nation, people], text);
  noteHistory(s, 'tribe', [nation, people], `${capital(sideName(s, nation))} and ${sideName(s, people)} make ${peopleTreatyText('land-use')}.`);
  return text;
}

/** A lease of a playing people's land ended or shrank: tiles no longer leased go back, and whoever worked them finds other work. */
function releaseTiles(s: GameState, nation: PlayerId, people: PlayerId, keep?: ReadonlySet<number>): void {
  const { width, tiles } = s.map;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.use !== nation || t.claim !== people || keep?.has(i)) continue;
    delete t.use;
    const x = i % width;
    const y = (i - x) / width;
    const u = tileWorkedBy(s, x, y);
    if (!u || u.loc.kind !== 'colony' || u.owner !== nation) continue;
    const colony = s.colonies[u.loc.colonyId];
    const job = bestJob(s, colony, u);
    if (job) setUnitLoc(s, u, { kind: 'colony', colonyId: colony.id, job });
    else {
      setUnitLoc(s, u, { kind: 'map', x: colony.x, y: colony.y });
      u.moves = 0;
    }
    message(s, `${unitName(u)} in ${colony.name} may no longer work the land of ${sideName(s, people)} and finds other work.`, u.owner, colony);
  }
}

/** Rent day for a lease of a playing people's land: the tiles beside the nation's colonies now, paid for, or the lease lapses. */
function peopleRentDay(s: GameState, t: Treaty, nation: PlayerId, people: PlayerId): void {
  if (t.terms?.kind !== 'land-use') return;
  const terms = t.terms;
  const tiles = peopleLeasableTiles(s, nation, people);
  const due = terms.rent * tiles.length;
  if (player(s, nation).gold < due) {
    endTreaty(s, t, 'lapsed', peopleParty(people as TribeId));
    track(nation, 'natives:people treaty ended');
    track(nation, 'natives:lease lapsed');
    releaseTiles(s, nation, people);
    tell(s, [nation, people], `${capital(sideName(s, nation))} cannot pay the ${due} gold rent for the land of ${sideName(s, people)}: the lease has lapsed, and the land is theirs alone again.`);
    return;
  }
  const keep = new Set(tiles.map((q) => q.y * s.map.width + q.x));
  releaseTiles(s, nation, people, keep);
  for (const q of tiles) tileAt(s, q.x, q.y)!.use = nation;
  player(s, nation).gold -= due;
  player(s, people).gold += due;
  if (due > 0) track(nation, 'natives:rent paid', due);
  terms.due = turnAfterYears(terms.due, 1, calendarOf(s));
  if (due > 0) tell(s, [nation, people], `${capital(sideName(s, nation))} pay ${sideName(s, people)} ${due} gold rent for ${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'} of their land.`);
}

// ---------------------------------------------------------------------------
// Cultural exchange from the people's side

function around(r: number, v: YearsAround): number {
  return v.base - v.spread + Math.floor(r * (2 * v.spread + 1));
}

/** The turn a playing people's town teaches a partner's colonist again (`exchange.teachYears` after it last did), or now if it never has. */
export function townTeachesAgain(s: GameState, town: Colony, nation: PlayerId): number {
  const last = town.taughtAt?.[nation];
  if (last === undefined) return s.turn;
  const [n, p] = standingPair(nation, town.owner);
  return turnAfterYears(last, around(peoplePairRandom(s, n, p, `town teach years ${town.id} ${last}`), peopleTreatyRules(s).exchange.teachYears), calendarOf(s));
}

/** The skill a playing people's town would teach a colonist of `nation` now, under a cultural exchange; null otherwise. */
export function townTeaches(s: GameState, town: Colony, nation: PlayerId): UnitTypeId | null {
  if (!playingPeople(s, town.owner) || !pairTreaty(s, 'exchange', nation, town.owner)) return null;
  if (s.turn < townTeachesAgain(s, town, nation)) return null;
  const skills = peopleOf(s, town.owner as TribeId).skills;
  if (!skills.length) return null;
  const [n, p] = standingPair(nation, town.owner);
  return skills[Math.floor(peoplePairRandom(s, n, p, `town skill ${town.id} ${town.taughtAt?.[nation] ?? 0}`) * skills.length)];
}

/** A nation's colonist next to a playing people's town learns one of the people's skills there, under a cultural exchange. */
export function learnAtTown(s: GameState, unitId: string, colonyId: string): string {
  const u = s.units[unitId];
  const town = s.colonies[colonyId];
  const pos = u && unitPosition(s, u);
  if (!u || !town || !pos || gridOf(s).distance(pos.x, pos.y, town.x, town.y) !== 1) fail('The colonist must be next to the town.');
  if (u.moves <= 0) fail(`${unitName(u)} has no moves left.`);
  const def = UNIT_TYPES[u.type];
  if (def.kind !== 'colonist' || u.role !== 'none') fail('Only unarmed, unequipped colonists can learn at a town.');
  if (def.skill > 0) fail('This colonist is already an expert.');
  if (!playingPeople(s, town.owner)) fail('Only the towns of a playing people teach this way.');
  if (!pairTreaty(s, 'exchange', u.owner, town.owner)) fail(`Learning at the towns of ${sideName(s, town.owner)} needs a cultural exchange with them.`);
  const skill = townTeaches(s, town, u.owner);
  if (!skill) fail(`${town.name} teaches your colonists again in ${Math.max(1, yearValue(townTeachesAgain(s, town, u.owner), calendarOf(s)) - yearValue(s.turn, calendarOf(s)))} years.`);
  u.type = skill;
  u.moves = 0;
  (town.taughtAt ??= {})[u.owner] = s.turn;
  track(u.owner, 'cmd:learnAtTown');
  track(u.owner, 'natives:renewed teaching');
  const text = `Your colonist has lived at ${town.name} among ${sideName(s, town.owner)} and become a ${UNIT_TYPES[skill].name}.`;
  message(s, text, u.owner, town);
  message(s, `A colonist of ${sideName(s, u.owner)} has lived at ${town.name} and learned the work of a ${UNIT_TYPES[skill].name}, under your cultural exchange.`, town.owner, town);
  return text;
}

/** Turns sooner a playing people's elders teach while it has a cultural exchange with anyone (colony.ts teaching). */
export function exchangeTeachBonus(s: GameState, owner: PlayerId): number {
  if (!s.treaties || kindOfId(owner) !== 'people') return 0;
  for (const t of s.treaties) if (!t.end && t.kind === 'exchange' && partyBinds(t, owner)) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Mutual defence, war and breaking faith

/**
 * The sides bound to stand by `target` when `attacker` declares war on it: every party to a mutual
 * defence pact with `target` (with a playing people among the pact's parties), other than the
 * attacker. Ids of players and of peoples nobody plays.
 */
export function pactDefenders(s: GameState, target: PlayerId, attacker: PlayerId): PlayerId[] {
  const out: PlayerId[] = [];
  for (const t of s.treaties ?? []) {
    if (t.end || t.kind !== 'defence' || !partyBinds(t, target) || !withPlayingPeople(s, t)) continue;
    for (const p of t.parties) if (p.id !== target && p.id !== attacker && !out.includes(p.id)) out.push(p.id);
  }
  return out;
}

/**
 * War between `a` and `b` begins (combat.ts `declareWar`), in a game with a playing people: the
 * treaties between them end, broken by `a` (as breaking faith in Beta 2), and the defence partners
 * of `b` that are peoples nobody plays go to war with `a`. Returns the players bound to join `b`
 * (combat.ts declares those wars, as for an alliance's defensive pact).
 */
export function onPairWar(s: GameState, a: PlayerId, b: PlayerId): PlayerId[] {
  if (s.treaties && pairTreaties(s, a, b).some((t) => withPlayingPeople(s, t))) breakPairFaith(s, a, b, 'war');
  // A member that goes to war with another leaves their league (T14's confederacy, peopleleague.ts).
  if (s.treaties) leagueWar(s, a, b);
  const join: PlayerId[] = [];
  if (!s.treaties || a === 'crown' || b === 'crown') return join;
  for (const id of pactDefenders(s, b, a)) {
    if (s.players.some((p) => p.id === id)) {
      if (systemsOfId(id).war && player(s, id).stance[a] !== 'war') join.push(id);
      continue;
    }
    // A people nobody plays: its braves' war on a European attacker (as Beta 2's callToDefence).
    if (!systemsOfId(a).peoples) continue;
    const tribe = s.tribes.find((t) => t.id === id);
    if (!tribe || tribe.stance[a] === 'war') continue;
    tribe.stance[a] = 'war';
    for (const k in s.settlements) if (s.settlements[k].tribe === id) addTension(s.settlements[k], a, peopleTreatyRules(s).defence.tension);
    track(a, 'natives:tribe went to war');
    tell(s, [a, b], `${capital(sideName(s, id))} take up arms against ${sideName(s, a)}, as their pact with ${sideName(s, b)} binds them.`);
    noteHistory(s, 'tribe', [a, b], `${capital(sideName(s, id))} go to war with ${sideName(s, a)} to stand by ${sideName(s, b)}.`);
  }
  for (const id of join) {
    track(id, 'natives:pact war');
    message(s, `${capital(sideName(s, id))} stand by their pact with ${sideName(s, b)}: the war on them is war with ${sideName(s, id)} too.`);
    noteHistory(s, 'war', [a, id], `${capital(sideName(s, id))} go to war with ${sideName(s, a)} to stand by ${sideName(s, b)}, their partners in a mutual defence pact.`);
  }
  return join;
}

/** The playing peoples bound by a pact to a people nobody plays that `attacker` has just attacked (combat.ts), not yet at war with it. */
export function pactPlayersOf(s: GameState, people: TribeId, attacker: PlayerId): PlayerId[] {
  return pactDefenders(s, people, attacker).filter((id) => playingPeople(s, id) && systemsOfId(attacker).war && player(s, id).stance[attacker] !== 'war');
}

const BREACH_WORDS = { war: 'going to war with', ended: 'ending a treaty with' } as const;

/**
 * `by` breaks faith with `other`: every treaty between them ends (broken by `by`), and the two make
 * no new treaty for the waiting years, `other` treating `by` as hostile for longer (drawn from the
 * pair's own stream), as Beta 2's breach; only the treaties `only` names, when given.
 */
function breakPairFaith(s: GameState, by: PlayerId, other: PlayerId, why: keyof typeof BREACH_WORDS, only?: Treaty): void {
  const treaties = only ? [only] : pairTreaties(s, by, other);
  if (!treaties.length) return;
  const rules = peopleTreatyRules(s);
  for (const t of treaties) {
    endTreaty(s, t, 'broken', partyOf(by));
    track(by, 'natives:people treaty ended');
    if (t.kind === 'exchange') track(by, 'natives:exchange ended');
    if (t.kind === 'defence') track(by, 'natives:defence ended');
    if (t.kind === 'land-use') {
      const [n, p] = standingPair(by, other);
      releaseTiles(s, n, p);
    }
  }
  track(by, 'natives:faith broken');
  const rel = standingWith(s, by, other);
  rel.breaks = (rel.breaks ?? 0) + 1;
  const [n, p] = standingPair(by, other);
  const cal = calendarOf(s);
  rel.waitUntil = Math.max(rel.waitUntil ?? 0, turnAfterYears(s.turn, around(peoplePairRandom(s, n, p, `break wait ${rel.breaks}`), rules.waitingYears), cal));
  rel.hostileUntil = Math.max(rel.hostileUntil ?? 0, turnAfterYears(s.turn, around(peoplePairRandom(s, n, p, `break hostility ${rel.breaks}`), rules.hostilityYears), cal));
  delete rel.goodSince;
  delete rel.proposal;
  const what = only ? `${peopleTreatyText(only.kind as PeopleTreatyKind).replace(/^an? /, 'its ')}` : 'every treaty between them';
  tell(s, [by, other], `${capital(sideName(s, by))} have broken faith with ${sideName(s, other)} by ${BREACH_WORDS[why]} them: ${what} is over, and trust will be slow to come back.`);
  noteHistory(s, 'cancel', [by, other].filter((id) => s.players.some((o) => o.id === id)), `${capital(sideName(s, by))} break faith with ${sideName(s, other)}; ${what} ends.`);
}

/** A side ends a treaty with a people (or a people with a nation): breaking faith, as in Beta 2, mirrored. */
export function endPairTreaty(s: GameState, by: PlayerId, other: PlayerId, kind: PeopleTreatyKind): string {
  const t = pairTreaty(s, kind, by, other);
  if (!t) fail(`You have no ${peopleTreatyText(kind).replace(/^an? /, '')} with ${sideName(s, other)}.`);
  if (!withPlayingPeople(s, t)) fail('A treaty with a people nobody plays is ended only by the people, or by breaking faith with it.');
  track(by, 'cmd:endPairTreaty');
  breakPairFaith(s, by, other, 'ended', t);
  return `You have ended ${peopleTreatyText(kind)} with ${sideName(s, other)}. They will remember it.`;
}

/** A treaty ends without anyone breaking faith: lapsed, or the rung it stood on gone. */
function pairEnds(s: GameState, t: Treaty, why: 'lapsed' | 'cancelled' | 'war'): void {
  const [a, b] = [t.parties[0].id, t.parties[1].id];
  const people = t.parties.find((p) => p.kind === 'people' && playingPeople(s, p.id)) ?? t.parties[1];
  endTreaty(s, t, why, why === 'lapsed' ? undefined : people);
  track(a, 'natives:people treaty ended');
  if (t.kind === 'land-use') {
    const [n, p] = standingPair(a, b);
    releaseTiles(s, n, p);
  }
  const reason = why === 'war' ? 'with the war' : why === 'lapsed' ? 'as one of them is gone' : 'as the treaty it stood on has ended';
  tell(s, [a, b], `${capital(peopleTreatyText(t.kind as PeopleTreatyKind))} between ${sideName(s, a)} and ${sideName(s, b)} has ended ${reason}.`);
}

/**
 * Once a round (turn.ts), in a game with a playing people: first contacts; then the treaties with a
 * playing people: a side gone lapses them, war ends them, land use and an exchange end with the trade
 * treaty, a pact between a nation and a people with the trade treaty or the last of land use and an
 * exchange (Beta 2's ladder), and a lease's rent falls due.
 */
export function processPeopleDiplomacy(s: GameState): void {
  if (!peopleTreatiesOn(s)) return;
  noteContacts(s);
  for (const t of s.treaties ?? []) {
    if (t.end || !(t.kind in KIND_NAME) || !withPlayingPeople(s, t)) continue;
    const [a, b] = [t.parties[0].id, t.parties[1].id];
    if (!stillThere(s, a) || !stillThere(s, b)) pairEnds(s, t, 'lapsed');
    else if (pairAtWar(s, a, b)) pairEnds(s, t, 'war');
    else if (t.kind !== 'people-trade' && !pairTreaty(s, 'people-trade', a, b)) pairEnds(s, t, 'cancelled');
    else if (t.kind === 'defence' && t.parties.some((p) => p.kind === 'nation') && !pairTreaty(s, 'land-use', a, b) && !pairTreaty(s, 'exchange', a, b)) pairEnds(s, t, 'cancelled');
    else if (t.kind === 'land-use' && t.terms?.kind === 'land-use' && s.turn >= t.terms.due) {
      const [n, p] = standingPair(a, b);
      peopleRentDay(s, t, n, p);
    }
  }
  if (s.treaties || s.leagueProposals) processLeagues(s);
}

// ---------------------------------------------------------------------------
// A computer people's simple rules (until step 9)

/**
 * A computer people's diplomacy, once a turn (ai/index.ts): it settles wars it is tired of, as a
 * computer nation does, makes its trade visits once a year (peopletrade.ts `computerTradeVisits`,
 * passed in as `trade`), and every fifth turn offers a trade treaty to each side it may make one
 * with (and a defence pact to a people it trades with), at Beta 2's `offer` chance times its
 * temperament, drawn from the pair's own stream.
 */
export function peopleComputerDiplomacy(s: GameState, p: Player, peace: (s: GameState, id: PlayerId) => void, trade?: (s: GameState, id: PlayerId) => void): void {
  peace(s, p.id);
  // Trade visits once a year, on the year's first turn.
  const cal = calendarOf(s);
  if (trade && (s.turn === 0 || yearOf(s.turn, cal).year !== yearOf(s.turn - 1, cal).year)) trade(s, p.id);
  if (!peopleTreatiesOn(s) || s.turn % 5 !== 0) return;
  const chance = peopleTreatyRules(s).offer * temperamentOf(s, p.id as TribeId).offer;
  for (const other of counterparts(s, p.id)) {
    if (!standingOf(s, p.id, other)) continue;
    for (const kind of ['people-trade', 'defence'] as const) {
      if (kind === 'defence' && sideOf(s, other) === 'nation') continue;
      if (pairTreatyProblem(s, p.id, other, kind)) continue;
      const [n, q] = standingPair(p.id, other);
      if (peoplePairRandom(s, n, q, `offer ${kind} ${s.turn}`) >= chance) continue;
      proposePairTreaty(s, p.id, other, kind);
    }
  }
  // A league with its pact partners (T14's confederacy, peopleleague.ts).
  computerLeague(s, p.id, chance);
}
