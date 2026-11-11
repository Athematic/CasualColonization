/**
 * The `prosperity` victory (Beta 2 step 5, docs/design/native-partners.md N10). At the end of the
 * calendar a nation wins by prosperity when
 * - it is at peace with every people it has met, and has been for the last `peaceYears` (30) years;
 * - it never burned a native settlement;
 * - it holds treaties (any kind with a people) with at least `treatyShare` (one half) of the peoples
 *   it has met that are still on the map, and at least one;
 * - its score is at least `scoreShare` (0.8) of the best score.
 * Every nation that qualifies wins, best score first; the peoples they hold treaties with are named
 * as their partners (`gameOver.partners`), not as winners.
 *
 * **Met** is read from what the game already records: a nation has met a people once its standing
 * with it is written (`GameState.peopleRelations`: a trade, a scout's visit to a chief, a mission,
 * a brave come to trade), or once it has fought it (at war now, a war that ended, a settlement
 * burned). A people it never dealt with in either way does not count.
 *
 * Two records serve the rule, written only while the scenario lists `prosperity` (so other games
 * keep their state): `Tribe.warEnded` (the turn the people's last war with each nation ended) and
 * `Tribe.burned` (the nations that burned one of its settlements). Both are absent until written.
 * The rule reads the state only and draws no random numbers.
 */
import { peopleRelationOf } from './natives.js';
import type { NationId, TribeId } from './rules/nations.js';
import { TRIBES } from './rules/nations.js';
import { calendarOf, scenarioOf, yearValue } from './scenarios/index.js';
import { bound, treatyPeoples } from './treaties.js';
import type { GameState, Tribe } from './types.js';

/** The rule's defaults; a scenario changes them in its victory entry's `params`. */
export const PROSPERITY = {
  /** Years of unbroken peace with every people met. */
  peaceYears: 30,
  /** Share of the peoples met (still on the map) the nation must hold a treaty with. */
  treatyShare: 0.5,
  /** Share of the best score the nation's score must reach. */
  scoreShare: 0.8,
};

export type ProsperityParams = typeof PROSPERITY;

/** The rule's numbers: the defaults with the scenario's `params` over them. */
export function prosperityParams(params: Record<string, unknown> = {}): ProsperityParams {
  const num = (k: keyof ProsperityParams) => (typeof params[k] === 'number' ? (params[k] as number) : PROSPERITY[k]);
  return { peaceYears: num('peaceYears'), treatyShare: num('treatyShare'), scoreShare: num('scoreShare') };
}

/** Whether the scenario plays for `prosperity`, so its records are kept. */
export function playsForProsperity(s: GameState): boolean {
  return scenarioOf(s).victory.some((v) => v.id === 'prosperity');
}

/** Notes that a people's war with a nation has ended now (only while the scenario plays for prosperity). */
export function notePeopleWarEnded(s: GameState, tribe: Tribe, nation: NationId): void {
  if (nation === 'crown' || !playsForProsperity(s)) return;
  tribe.warEnded = { ...tribe.warEnded, [nation]: s.turn };
}

/** Notes that a nation burned one of the people's settlements (only while the scenario plays for prosperity). */
export function noteSettlementBurned(s: GameState, tribe: Tribe, nation: NationId): void {
  if (nation === 'crown' || !playsForProsperity(s) || tribe.burned?.includes(nation)) return;
  tribe.burned = [...(tribe.burned ?? []), nation];
}

/** Whether the nation has met the people: its standing is written, or it has fought the people. */
export function hasMetPeople(s: GameState, nation: NationId, tribe: Tribe): boolean {
  return (
    !!peopleRelationOf(s, nation, tribe.id) ||
    tribe.stance[nation] === 'war' ||
    tribe.warEnded?.[nation] !== undefined ||
    !!tribe.burned?.includes(nation)
  );
}

/** The peoples a nation holds a treaty with (any kind with a people, in force), in the order the first was made. */
export function treatyPeoplesOf(s: GameState, nation: NationId): TribeId[] {
  const out: TribeId[] = [];
  for (const t of s.treaties ?? []) {
    if (t.end || !bound(t, nation)) continue;
    for (const people of treatyPeoples(t)) if (!out.includes(people)) out.push(people);
  }
  return out;
}

/** The conditions of the rule, as the tournament counts the ones a nation fails. */
export type ProsperityCondition = 'peace' | 'burned' | 'treaties' | 'score';

/** How a nation stands against the rule now. */
export interface ProsperityStanding {
  nation: NationId;
  /** The peoples it has met, in the game's order. */
  met: TribeId[];
  /** Peoples met it is at war with, or was within the last `peaceYears`. */
  notAtPeace: TribeId[];
  /** It burned a settlement. */
  burned: boolean;
  /** Peoples it holds a treaty with (its partners). */
  partners: TribeId[];
  /** Partners it needs: `treatyShare` of the peoples met still on the map, at least one. */
  needed: number;
  /** Its score over the best score (1 for the best). */
  scoreShare: number;
  /** The conditions it fails; empty when it qualifies. */
  fails: ProsperityCondition[];
}

/** How a European nation stands against the rule, given every nation's score. */
export function prosperityStanding(s: GameState, nation: NationId, scores: Partial<Record<NationId, number>>, params: ProsperityParams = PROSPERITY): ProsperityStanding {
  const cal = calendarOf(s);
  const now = yearValue(s.turn, cal);
  const living = new Set<TribeId>();
  for (const id in s.settlements) living.add(s.settlements[id].tribe);
  const met: TribeId[] = [];
  const notAtPeace: TribeId[] = [];
  let burned = false;
  for (const tribe of s.tribes) {
    if (tribe.burned?.includes(nation)) burned = true;
    if (!hasMetPeople(s, nation, tribe)) continue;
    met.push(tribe.id);
    const ended = tribe.warEnded?.[nation];
    if (tribe.stance[nation] === 'war' || (ended !== undefined && now - yearValue(ended, cal) < params.peaceYears)) notAtPeace.push(tribe.id);
  }
  const partners = treatyPeoplesOf(s, nation);
  const counted = met.filter((t) => living.has(t) || partners.includes(t)).length;
  const needed = Math.max(1, Math.ceil(params.treatyShare * counted - 1e-9));
  const best = Math.max(0, ...Object.values(scores).map((v) => v ?? 0));
  const mine = scores[nation] ?? 0;
  const share = best > 0 ? mine / best : 0;
  const fails: ProsperityCondition[] = [];
  if (notAtPeace.length) fails.push('peace');
  if (burned) fails.push('burned');
  if (partners.length < needed) fails.push('treaties');
  if (best <= 0 || mine < params.scoreShare * best) fails.push('score');
  return { nation, met, notAtPeace, burned, partners, needed, scoreShare: share, fails };
}

/**
 * The nations that win by prosperity, best score first (ties in turn order), and their partner
 * peoples in the order their first treaty was made; null when none qualifies.
 */
export function prosperityWinners(s: GameState, scores: Partial<Record<NationId, number>>, params: ProsperityParams = PROSPERITY): { winners: NationId[]; partners: TribeId[] } | null {
  const order = s.config.nations;
  const winners = (Object.keys(scores) as NationId[])
    .filter((n) => prosperityStanding(s, n, scores, params).fails.length === 0)
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || order.indexOf(a) - order.indexOf(b));
  if (!winners.length) return null;
  const partners: TribeId[] = [];
  for (const t of s.treaties ?? []) {
    if (t.end || !winners.some((n) => bound(t, n))) continue;
    for (const people of treatyPeoples(t)) if (!partners.includes(people)) partners.push(people);
  }
  return { winners, partners };
}

/** "the Kalinago and the Arawak", for the game-over texts. */
export function peopleList(peoples: readonly TribeId[]): string {
  const names = peoples.map((p) => `the ${TRIBES[p].name}`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}
