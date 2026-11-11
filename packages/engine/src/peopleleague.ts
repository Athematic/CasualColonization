/**
 * Leagues of peoples (docs/design/native-nations.md, T14 "Confederacy"; Beta 3 step 7): the
 * treaty kind `league`, between three or more peoples, playing or nobody's, with several parties as
 * Beta 1's `alliance`. A league is what the `confederacy` victory reads (peoplevictory.ts).
 *
 * - **Who may join:** a people (a playing people, or a people nobody plays with settlements left)
 *   in no other league, at peace with every member, holding a mutual defence pact with at least one
 *   of them, and in good standing with all (Beta 2's record: written, good relations now, no
 *   waiting or distrust after a broken treaty). Two peoples nobody plays have no record between
 *   them (Beta 2 keeps none) and count as in good standing while at peace.
 * - **Making one:** a playing people proposes a new league to two or more peoples, or, as a member,
 *   invites a people into its league (as the Tuscarora joined the Haudenosaunee). Computer peoples
 *   and peoples nobody plays answer at once by Beta 2's rule for a people's answer (`accept` times
 *   the people's temperament, never within `landYears` of land taken from it), drawn from the
 *   pair's own stream; a person answers later (`GameState.leagueProposals`). The league is made
 *   when every invited people has said yes, the conditions checked again.
 * - **Members at peace:** a war between two members takes the one that declared it out of the
 *   league (combat.ts `declareWar` through `onPairWar`); a member gone from the map leaves it; a
 *   league left with one member ends. A member may also leave by choice (`leaveLeague`).
 * - Switched on by the scenario: leagues exist where mutual defence pacts with peoples do
 *   (`mechanics.peopleTreaties` names `defence`) and the scenario plays for `confederacy`.
 */
import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { message } from './queries.js';
import { peoplePairRandom } from './relations.js';
import { kindOfId } from './playerkind.js';
import { calendarOf, scenarioOf, turnAfterYears } from './scenarios/index.js';
import { peopleTreatyOn, peopleTreatyRules, temperamentOf } from './peopletreaties.js';
import { pairAtWar, pairTreaty, playingPeople, sideName, standingOf, standingPair, stillThere } from './peoplediplomacy.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import { track } from './telemetry.js';
import { addTreaty, endTreaty, peopleParty, treatyPeoples } from './treaties.js';
import type { GameState, LeagueProposal, Treaty } from './types.js';

/** The fewest peoples a new league is made with. */
export const LEAGUE_MIN = 3;

/** Whether the scenario has leagues: mutual defence pacts with peoples, and the `confederacy` victory. */
export function leaguesOn(s: GameState): boolean {
  return peopleTreatyOn(s, 'defence') && scenarioOf(s).victory.some((v) => v.id === 'confederacy');
}

/** The leagues in force, in the order made. */
export function leagues(s: GameState): Treaty[] {
  const out: Treaty[] = [];
  for (const t of s.treaties ?? []) if (!t.end && t.kind === 'league') out.push(t);
  return out;
}

/** The league a people belongs to, if any (a people belongs to one at most). */
export function leagueOf(s: GameState, people: PlayerId): Treaty | undefined {
  for (const t of s.treaties ?? []) if (!t.end && t.kind === 'league' && t.parties.some((p) => p.id === people)) return t;
  return undefined;
}

/** A league's members now, in the order they joined. */
export function leagueMembers(t: Treaty): TribeId[] {
  return treatyPeoples(t);
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function names(s: GameState, ids: readonly PlayerId[]): string {
  const list = ids.map((id) => sideName(s, id));
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : (list[0] ?? '');
}

/** Whether two peoples stand well with each other: Beta 2's record written, good relations now, no waiting or distrust. */
export function goodStanding(s: GameState, a: PlayerId, b: PlayerId): boolean {
  if (!playingPeople(s, a) && !playingPeople(s, b)) return !pairAtWar(s, a, b);
  const rel = standingOf(s, a, b);
  if (!rel || rel.goodSince === undefined) return false;
  if (rel.waitUntil !== undefined && s.turn < rel.waitUntil) return false;
  if (rel.hostileUntil !== undefined && s.turn < rel.hostileUntil) return false;
  return true;
}

/**
 * Why `from` cannot propose a league with `peoples` now (a new league, or, when `from` belongs to
 * one, `peoples` invited into it), or null. What the proposer can know, in words.
 */
export function leagueProblem(s: GameState, from: PlayerId, peoples: readonly PlayerId[]): string | null {
  if (!leaguesOn(s)) return 'There are no leagues of peoples in this scenario.';
  if (!playingPeople(s, from)) return 'Only a playing people proposes a league.';
  if (!peoples.length) return 'Name the peoples to ask.';
  if (new Set(peoples).size !== peoples.length || peoples.includes(from)) return 'Name each people once, and not yourself.';
  const own = leagueOf(s, from);
  const members: PlayerId[] = own ? leagueMembers(own) : [from];
  if (!own && members.length + peoples.length < LEAGUE_MIN) return `A league is made by at least ${LEAGUE_MIN} peoples.`;
  if (s.leagueProposals?.some((p) => p.by === from)) return 'Your last proposal of a league has not been answered yet.';
  const after = [...members, ...peoples];
  for (const id of peoples) {
    const name = sideName(s, id);
    if (kindOfId(id) !== 'people') return `Only peoples join a league: ${capital(name)} is a nation.`;
    if (!stillThere(s, id)) return `${capital(name)} are no longer on the map.`;
    if (leagueOf(s, id)) return `${capital(name)} already belong to a league.`;
    if (s.leagueProposals?.some((p) => p.waiting.includes(id as TribeId))) return `${capital(name)} are still answering another proposal of a league.`;
    for (const m of after) {
      if (m === id) continue;
      if (pairAtWar(s, id, m)) return `${capital(name)} are at war with ${sideName(s, m)}.`;
      if (!goodStanding(s, id, m)) return `${capital(name)} and ${sideName(s, m)} do not stand well enough with each other yet.`;
    }
    if (!after.some((m) => m !== id && pairTreaty(s, 'defence', id, m))) return `${capital(name)} hold no mutual defence pact with any people of the league.`;
  }
  return null;
}

/** A computer people's, or a people nobody plays, answer to a league: Beta 2's rule for a people's answer, from the pair's own stream. */
function computerJoins(s: GameState, from: PlayerId, to: PlayerId): boolean {
  const took = standingOf(s, to, from)?.tookLand;
  if (took !== undefined && s.turn < turnAfterYears(took, peopleTreatyRules(s).landYears, calendarOf(s))) return false;
  const [n, p] = standingPair(from, to);
  return peoplePairRandom(s, n, p, `league answer ${from} ${s.turn}`) < peopleTreatyRules(s).accept * temperamentOf(s, to as TribeId).accept;
}

/**
 * `from` proposes a league to `peoples` (a new league, or `peoples` invited into `from`'s). Computer
 * peoples and peoples nobody plays answer at once; persons answer later (`answerLeague`). Returns
 * the outcome in words.
 */
export function proposeLeague(s: GameState, from: PlayerId, peoples: readonly PlayerId[]): string {
  const problem = leagueProblem(s, from, peoples);
  if (problem) fail(problem);
  track(from, 'cmd:proposeLeague');
  const persons: TribeId[] = [];
  for (const id of peoples) {
    if (playingPeople(s, id)?.human) {
      persons.push(id as TribeId);
      continue;
    }
    if (!computerJoins(s, from, id)) {
      const text = `${capital(sideName(s, id))} thank you, but are not ready to join a league${peoples.length > 1 ? ` with ${names(s, peoples.filter((o) => o !== id))}` : ''}.`;
      message(s, text, from);
      return text;
    }
  }
  const own = leagueOf(s, from);
  if (persons.length) {
    (s.leagueProposals ??= []).push({ by: from as TribeId, peoples: [...peoples] as TribeId[], ...(own ? { league: own.id } : {}), waiting: persons, turn: s.turn });
    for (const id of persons) message(s, `${capital(sideName(s, from))} propose ${own ? 'that you join their league' : `a league with ${names(s, [from, ...peoples].filter((o) => o !== id))}`}.`, id);
    return `Your proposal has been sent to ${names(s, persons)}.`;
  }
  return makeLeague(s, from, peoples);
}

/** The proposal of a league `by` made that waits for `me`, if any. */
export function leagueProposalFor(s: GameState, me: PlayerId, by?: PlayerId): LeagueProposal | undefined {
  return s.leagueProposals?.find((p) => p.waiting.includes(me as TribeId) && (by === undefined || p.by === by));
}

/** A person answers the proposal of a league `by` made. The league is made once every person has said yes. */
export function answerLeague(s: GameState, me: PlayerId, by: PlayerId, accept: boolean): string {
  const prop = leagueProposalFor(s, me, by);
  if (!prop) fail(`${capital(sideName(s, by))} have proposed no league to you.`);
  track(me, 'cmd:answerLeague');
  const drop = () => {
    s.leagueProposals = s.leagueProposals!.filter((p) => p !== prop);
    if (!s.leagueProposals.length) delete s.leagueProposals;
  };
  if (!accept) {
    drop();
    message(s, `${capital(sideName(s, me))} decline the league.`, by);
    return `You decline the league with ${sideName(s, by)}.`;
  }
  prop.waiting = prop.waiting.filter((id) => id !== me);
  if (prop.waiting.length) return `You agree; the league waits for ${names(s, prop.waiting)}.`;
  drop();
  const own = leagueOf(s, by);
  if (prop.league && own?.id !== prop.league) return 'The proposal no longer stands: the league has changed.';
  const problem = leagueProblem(s, by, prop.peoples);
  if (problem) {
    const text = `The proposal no longer stands. ${problem}`;
    message(s, text, me);
    return text;
  }
  return makeLeague(s, by, prop.peoples);
}

/** Makes a league of `by` and `peoples`, or brings `peoples` into `by`'s league. */
export function makeLeague(s: GameState, by: PlayerId, peoples: readonly PlayerId[]): string {
  const own = leagueOf(s, by);
  let text: string;
  if (own) {
    for (const id of peoples) own.parties.push(peopleParty(id as TribeId));
    text = `${capital(names(s, peoples))} join the league of ${names(s, leagueMembers(own).filter((m) => !peoples.includes(m)))}.`;
  } else {
    addTreaty(s, 'league', [by, ...peoples].map((id) => peopleParty(id as TribeId)));
    text = `${capital(names(s, [by, ...peoples]))} make a league: they will settle their common affairs together and keep the peace among themselves.`;
  }
  track(by, own ? 'natives:league joined' : 'natives:league made');
  const t = leagueOf(s, by)!;
  for (const id of leagueMembers(t)) if (playingPeople(s, id)) message(s, text, id);
  noteHistory(s, 'tribe', leagueMembers(t).filter((id) => s.players.some((p) => p.id === id)), text);
  return text;
}

/** `people` leaves its league: by choice, for a war it declared on a member, or because it is gone. A league left with one member ends. */
export function leaveLeague(s: GameState, people: PlayerId, why: 'left' | 'war' | 'lapsed' = 'left'): string {
  const t = leagueOf(s, people);
  if (!t) fail('You belong to no league.');
  if (why === 'left') track(people, 'cmd:leaveLeague');
  const party = peopleParty(people as TribeId);
  t.parties = t.parties.filter((p) => p.id !== people);
  (t.left ??= []).push({ party, turn: s.turn });
  const rest = leagueMembers(t);
  if (rest.length < 2) endTreaty(s, t, why === 'war' ? 'war' : why === 'lapsed' ? 'lapsed' : 'left', why === 'lapsed' ? undefined : party);
  const how = why === 'war' ? ' by going to war with a member' : why === 'lapsed' ? ', being no longer on the map' : '';
  const text = `${capital(sideName(s, people))} have left the league of ${names(s, rest)}${how}.${t.end ? ' The league is over.' : ''}`;
  for (const id of [people, ...rest]) if (playingPeople(s, id)) message(s, text, id);
  noteHistory(s, 'cancel', [people, ...rest].filter((id) => s.players.some((p) => p.id === id)), text);
  return text;
}

/** War between `a` and `b` (combat.ts, through `onPairWar`): when both are in one league, `a`, who declared it, leaves. */
export function leagueWar(s: GameState, a: PlayerId, b: PlayerId): void {
  const t = leagueOf(s, a);
  if (t && t.parties.some((p) => p.id === b)) leaveLeague(s, a, 'war');
}

/**
 * Once a round (peoplediplomacy.ts `processPeopleDiplomacy`): members gone from the map leave their
 * league; a league whose members are at war with each other ends (a safety net: a declared war
 * already takes the declarer out). Waiting proposals whose people are gone are dropped.
 */
export function processLeagues(s: GameState): void {
  for (const t of leagues(s)) {
    for (const id of leagueMembers(t)) if (!stillThere(s, id)) leaveLeague(s, id, 'lapsed');
    if (t.end) continue;
    const members = leagueMembers(t);
    if (members.some((a, i) => members.slice(i + 1).some((b) => pairAtWar(s, a, b)))) {
      endTreaty(s, t, 'war');
      const text = `The league of ${names(s, members)} has ended in war among its members.`;
      for (const id of members) if (playingPeople(s, id)) message(s, text, id);
    }
  }
  if (s.leagueProposals) {
    s.leagueProposals = s.leagueProposals.filter((p) => stillThere(s, p.by) && p.peoples.every((id) => stillThere(s, id)));
    if (!s.leagueProposals.length) delete s.leagueProposals;
  }
}

/**
 * A computer people's league diplomacy (until step 9's profiles), every fifth turn with its other
 * proposals: outside a league, it proposes one to the peoples it holds defence pacts with and
 * their own pact partners, when they are enough; inside one, it invites a pact partner outside any
 * league. At Beta 2's `offer` chance times its temperament, drawn from the pair's own stream.
 */
export function computerLeague(s: GameState, people: PlayerId, chance: number): void {
  if (!leaguesOn(s)) return;
  const pacts = (id: PlayerId): PlayerId[] => {
    const out: PlayerId[] = [];
    for (const t of s.treaties ?? []) {
      if (t.end || t.kind !== 'defence' || !t.parties.some((p) => p.id === id)) continue;
      for (const p of t.parties) if (p.id !== id && p.kind === 'people' && !out.includes(p.id)) out.push(p.id);
    }
    return out;
  };
  const partners = pacts(people).filter((id) => !leagueOf(s, id));
  if (!partners.length) return;
  const own = leagueOf(s, people);
  let ask: PlayerId[];
  if (own) ask = [partners[0]];
  else {
    ask = [...partners];
    for (const id of partners) for (const o of pacts(id)) if (o !== people && !ask.includes(o) && !leagueOf(s, o)) ask.push(o);
    if (ask.length + 1 < LEAGUE_MIN) return;
  }
  if (leagueProblem(s, people, ask)) return;
  const [n, p] = standingPair(people, ask[0]);
  if (peoplePairRandom(s, n, p, `league offer ${s.turn}`) >= chance) return;
  proposeLeague(s, people, ask);
}
