/**
 * Ways to win (docs/design/scenario-framework.md, sections 3.11 and 4.3). A victory kind is a
 * registered function that looks at the game at a moment (the end of a round, the end of a nation's
 * War of Independence) and may end it. A scenario lists the kinds it plays with, in order
 * (`Scenario.victory`); the first that ends the game decides the reason and the winner.
 *
 * Kinds here:
 * - `time`: the game ends after the calendar's last turn; the highest score wins.
 * - `independence-war`: winning the War of Independence ends the game, with the winner; losing it
 *   ends the game once no person is left to play. With `GameConfig.playOn` (computer tournaments)
 *   neither ends it: the nation is finished (`Player.finished`) and the others play on.
 *
 * - `concord` (Beta 1, docs/design/cooperation.md): at the end of the calendar, an alliance whose
 *   members together hold more than `params.share` of the total score (default CONCORD_SHARE)
 *   wins together; its members are the winners, ranked by their own score. List it before `time`.
 *
 * - `prosperity` (Beta 2, docs/design/native-partners.md N10, prosperity.ts): at the end of the
 *   calendar, every nation at peace with the peoples it has met for the last 30 years, that never
 *   burned a settlement, holds treaties with at least half of them and has at least 0.8 of the best
 *   score wins; `gameOver.partners` names its partner peoples. List it after `concord`, so an
 *   alliance that also qualifies wins as an alliance, and before `time`.
 *
 * Kinds are pure functions of the state and draw no random numbers. `gameOver.winners` lists every
 * winner, best first; `gameOver.winner` is the first of them, for code that knows one winner only.
 *
 * **Games with a playing people** (docs/design/native-nations.md T14, Beta 3 step 7) add the
 * peoples' kinds (`military`, `confederacy`, `continuity`, `good-life`, peoplevictory.ts) and are
 * judged on both sides: the kinds are asked in VICTORY_ORDER (immediate kinds first; at the end year
 * groups before single winners), `military` may end the game after any round, and at the end year
 * every kind is asked and each player is judged once, by the first kind that names it.
 * `gameOver.ways` names each winner's way and `gameOver.peopleScores` the peoples' scores. A nation
 * that wins its War of Independence is finished with its win recorded (`Player.victory`) and play
 * goes on to the end year; `time` names the best-scoring European only if no European won another
 * way, and never a people. Without a playing people nothing of this runs: the first kind in the
 * scenario's list that ends the game decides it, as before.
 *
 * **Independence and a people at war** (T14, Simon): when a person's nation wins its War of
 * Independence while at war with any people (a playing people or a people nobody plays), the game
 * asks whether to keep playing (`Player.independenceChoice`, `answerIndependence`): no, the
 * victory as usual; yes, play goes on, the independence kept, and the game ends by the scenario's
 * other kinds or the end year. Computer nations take the win at once.
 */
import { finalScores, peopleScores, scoreBreakdown } from './score.js';
import { calendarOf, lastTurn, nationOf, scenarioOf, term, yearValue } from './scenarios/index.js';
import { anyPlayingPeople, sideName } from './peoplediplomacy.js';
import { confederacyLeagues, continuityStanding, europeansDefeated, goodLifeStanding, militaryWinners, MILITARY, victoryParams } from './peoplevictory.js';
import { fail } from './errors.js';
import { treatyNations } from './treaties.js';
import { peopleList, prosperityParams, prosperityWinners } from './prosperity.js';
import type { PlayerId } from './rules/nations.js';
import { kindOfId, systemsOf } from './playerkind.js';
import type { GameState, Player } from './types.js';
import type { VictoryRule } from './scenarios/types.js';
import type { TribeId } from './rules/nations.js';
import { removeUnit, unitList } from './unitindex.js';

export type GameOver = NonNullable<GameState['gameOver']>;

/** What a victory kind returns: a game over whose `winners` default to its `winner`. */
export type VictoryResult = Omit<GameOver, 'winners'> & { winners?: PlayerId[] };

/** Concord's default: the share of the total score an alliance must hold at the end to win together. */
export const CONCORD_SHARE = 0.7;

/** When the victory rules are asked. */
export type VictoryMoment =
  /** After a round, once the turn counter has moved on. */
  | { kind: 'round' }
  /** A nation's War of Independence has just ended; `text` is the news. */
  | { kind: 'warEnded'; nation: PlayerId; outcome: 'won' | 'lost'; text: string; together?: PlayerId[] };

export interface VictoryKind {
  id: string;
  /** Shown name, for the New game screen. */
  name: string;
  /** Ends the game the moment it holds (after any round), rather than at the end year: judged first in games with a playing people. */
  immediate?: boolean;
  /** The end of the game this rule calls at this moment, or null. */
  check(s: GameState, moment: VictoryMoment, params: Record<string, unknown>): VictoryResult | null;
}

const KINDS = new Map<string, VictoryKind>();

/** Registers a victory kind, replacing one with the same id. */
export function registerVictory(kind: VictoryKind): void {
  KINDS.set(kind.id, kind);
}

/** The registered victory kind with this id, if any. */
export function getVictory(id: string): VictoryKind | undefined {
  return KINDS.get(id);
}

/**
 * The order kinds are judged in where a people plays (T14): immediate kinds first, then, at the end
 * year, groups before single winners. Kinds not listed here come just before `time`.
 */
export const VICTORY_ORDER = ['military', 'independence-war', 'confederacy', 'concord', 'prosperity', 'continuity', 'good-life', 'time'];

/** The scenario's victory rules in VICTORY_ORDER (a stable sort; unknown kinds just before `time`). */
export function orderedVictory(s: GameState): VictoryRule[] {
  const rank = (id: string) => {
    const i = VICTORY_ORDER.indexOf(id);
    return i >= 0 ? i : VICTORY_ORDER.length - 1.5;
  };
  return [...scenarioOf(s).victory].sort((a, b) => rank(a.id) - rank(b.id));
}

/** Asks the scenario's victory rules, in order; the first that ends the game sets `s.gameOver`. */
export function checkVictory(s: GameState, moment: VictoryMoment): void {
  if (s.gameOver) return;
  // A playing people: both sides judged (T14).
  if (anyPlayingPeople(s)) return judgeBothSides(s, moment);
  for (const rule of scenarioOf(s).victory) {
    const kind = KINDS.get(rule.id);
    if (!kind) throw new Error(`Unknown victory rule "${rule.id}".`);
    const over = kind.check(s, moment, rule.params ?? {});
    if (over) {
      s.gameOver = { ...over, winners: over.winners ?? (over.winner ? [over.winner] : []) };
      return;
    }
  }
}

/** The nation with the highest score, if any. */
function leader(scores: Partial<Record<PlayerId, number>>): PlayerId | undefined {
  return (Object.entries(scores) as [PlayerId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
}

registerVictory({
  id: 'time',
  name: 'Highest score when time runs out',
  check(s, moment) {
    if (moment.kind !== 'round') return null;
    const cal = calendarOf(s);
    if (s.turn < lastTurn(cal)) return null;
    const scores = finalScores(s);
    return { turn: s.turn, reason: term(s, 'gameOver.time', { year: cal.end.year }), winner: leader(scores), scores };
  },
});

registerVictory({
  id: 'concord',
  name: 'An alliance holding most of the score at the end wins together',
  check(s, moment, params) {
    if (moment.kind !== 'round') return null;
    const cal = calendarOf(s);
    if (s.turn < lastTurn(cal)) return null;
    const scores = finalScores(s);
    const winners = concordWinners(s, scores, typeof params.share === 'number' ? params.share : CONCORD_SHARE);
    if (!winners) return null;
    const names = winners.map((n) => nationOf(s, n).name);
    const allies = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    return { turn: s.turn, reason: term(s, 'gameOver.concord', { year: cal.end.year, allies }), winner: winners[0], winners, scores };
  },
});

registerVictory({
  id: 'prosperity',
  name: 'Prosperity in peace and partnership with the native peoples',
  check(s, moment, params) {
    if (moment.kind !== 'round') return null;
    const cal = calendarOf(s);
    if (s.turn < lastTurn(cal)) return null;
    const scores = finalScores(s);
    const won = prosperityWinners(s, scores, prosperityParams(params));
    if (!won) return null;
    const names = won.winners.map((n) => nationOf(s, n).name);
    const winners = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    const reason = term(s, 'gameOver.prosperity', { year: cal.end.year, winners, partners: peopleList(s, won.partners), win: names.length > 1 ? 'win together' : 'wins' });
    return { turn: s.turn, reason, winner: won.winners[0], winners: won.winners, partners: won.partners, scores };
  },
});

/**
 * The members of the alliance that holds more than `share` of the total score, best first by
 * their own score (ties in turn order), or null. With a share below one half two alliances could
 * both qualify; the larger share wins.
 */
export function concordWinners(s: GameState, scores: Partial<Record<PlayerId, number>>, share: number): PlayerId[] | null {
  const total = Object.values(scores).reduce((n: number, v) => n + (v ?? 0), 0);
  if (total <= 0) return null;
  let best: { members: PlayerId[]; part: number } | null = null;
  for (const t of s.treaties ?? []) {
    if (t.end || t.kind !== 'alliance') continue;
    const members = treatyNations(t).filter((n) => scores[n] !== undefined);
    // Winning together needs someone left outside: an alliance of every nation wins nothing.
    if (members.length < 2 || members.length >= Object.keys(scores).length) continue;
    const part = members.reduce((n, m) => n + (scores[m] ?? 0), 0) / total;
    if (part > share && (!best || part > best.part)) best = { members, part };
  }
  if (!best) return null;
  const order: readonly PlayerId[] = s.config.nations;
  return [...best.members].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || order.indexOf(a) - order.indexOf(b));
}

registerVictory({
  id: 'independence-war',
  name: 'Independence by war',
  check(s, moment) {
    if (moment.kind !== 'warEnded') return null;
    if (s.config.playOn) {
      // Arena play-on: the game goes on while any nation still plays.
      if (s.players.some((p) => systemsOf(p).ranked && !p.finished)) return null;
      const scores = finalScores(s);
      return { turn: s.turn, reason: term(s, 'gameOver.playOn'), winner: leader(scores), scores };
    }
    if (moment.outcome === 'won') {
      // A person at war with a people is asked first whether to keep playing (T14).
      if (askToKeepPlaying(s, moment)) return null;
      return independenceResult(s, moment.text, moment.nation, moment.together);
    }
    const humansLeft = s.players.some((o) => o.human && o.independence !== 'lost');
    return humansLeft ? null : { turn: s.turn, reason: moment.text, scores: finalScores(s) };
  },
});

/** The end of the game by a won War of Independence: the nation, or a confederation together, best score first. */
function independenceResult(s: GameState, text: string, nation: PlayerId, together?: PlayerId[]): VictoryResult {
  const scores = finalScores(s);
  // A confederation (confederation.ts) wins together, best score first.
  if (together && together.length > 1) {
    const order: readonly PlayerId[] = s.config.nations;
    const winners = [...together].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || order.indexOf(a) - order.indexOf(b));
    return { turn: s.turn, reason: text, winner: winners[0], winners, scores };
  }
  return { turn: s.turn, reason: text, winner: nation, scores };
}

/** The peoples a player is at war with: playing peoples by stance, peoples nobody plays (with settlements left) by theirs. */
export function peoplesAtWarWith(s: GameState, id: PlayerId): PlayerId[] {
  const out: PlayerId[] = [];
  const p = s.players.find((o) => o.id === id);
  for (const o of s.players) if (o.kind === 'people' && (p?.stance[o.id] === 'war' || o.stance[id] === 'war')) out.push(o.id);
  for (const t of s.tribes) {
    if (t.stance[id] !== 'war' || out.includes(t.id)) continue;
    for (const k in s.settlements) {
      if (s.settlements[k].tribe !== t.id) continue;
      out.push(t.id);
      break;
    }
  }
  return out;
}

/**
 * A won War of Independence and a person's nation at war with a people (T14): the question waits on
 * the person (`Player.independenceChoice`) and the game goes on until it is answered. Returns
 * whether it was asked.
 */
function askToKeepPlaying(s: GameState, moment: Extract<VictoryMoment, { kind: 'warEnded' }>): boolean {
  const members = moment.together?.length ? moment.together : [moment.nation];
  const asked = members.map((id) => s.players.find((o) => o.id === id)).find((p) => p?.human && peoplesAtWarWith(s, p.id).length);
  if (!asked) return false;
  asked.independenceChoice = { turn: s.turn, text: moment.text, ...(moment.together && moment.together.length > 1 ? { together: [...moment.together] } : {}) };
  return true;
}

/** The question a person's nation is asked after winning its War of Independence at war with a people, in words; null when none waits. */
export function independenceQuestion(s: GameState, id: PlayerId): string | null {
  const p = s.players.find((o) => o.id === id);
  if (!p?.independenceChoice) return null;
  const peoples = peoplesAtWarWith(s, id).map((o) => sideName(s, o));
  const list = peoples.length > 1 ? `${peoples.slice(0, -1).join(', ')} and ${peoples.at(-1)}` : (peoples[0] ?? 'a people');
  return term(s, 'independence.keepPlaying', { nation: nationOf(s, id).name, peoples: list });
}

/**
 * A person answers whether to keep playing after winning the War of Independence at war with a
 * people (T14). No (`keepPlaying` false): the victory as usual (in a game with a playing people, the
 * win recorded and the game ending if no person is left playing). Yes: play goes on, the
 * independence kept, and the game ends by the scenario's other kinds or the end year.
 */
export function answerIndependence(s: GameState, id: PlayerId, keepPlaying: boolean): string {
  const p = s.players.find((o) => o.id === id);
  const choice = p?.independenceChoice;
  if (!p || !choice) fail('There is no question about the War of Independence to answer.');
  delete p.independenceChoice;
  if (keepPlaying) return 'You keep playing: making peace or fighting on is yours to choose.';
  if (s.gameOver) return choice.text;
  if (anyPlayingPeople(s)) {
    recordIndependence(s, choice.together?.length ? choice.together : [p.id]);
    endIfNobodyPlays(s, choice.text);
  } else {
    const over = independenceResult(s, choice.text, p.id, choice.together);
    s.gameOver = { ...over, winners: over.winners ?? (over.winner ? [over.winner] : []) };
  }
  return choice.text;
}

// ---------------------------------------------------------------------------
// Both sides judged (games with a playing people, T14)

/** Whether a player is a European one that can win (a nation or a company; the Crown never wins). */
function european(id: PlayerId): boolean {
  const k = kindOfId(id);
  return k === 'nation' || k === 'company';
}

/** Nations that won their War of Independence: finished, the win recorded, play going on (T14). */
function recordIndependence(s: GameState, members: readonly PlayerId[]): void {
  for (const id of members) {
    const m = s.players.find((o) => o.id === id);
    if (!m) continue;
    m.victory = { way: 'independence-war', turn: s.turn };
    if (!m.finished) finishNation(s, m);
  }
}

/** Whether a person still plays: some person's player neither finished nor beaten in its War of Independence. */
function personPlays(s: GameState): boolean {
  return s.players.some((o) => o.human && !o.finished && o.independence !== 'lost');
}

/** A game with persons where none plays any more ends now, with the wins recorded so far as its winners. */
function endIfNobodyPlays(s: GameState, text: string): void {
  if (!s.config.humans.length || personPlays(s)) return;
  const winners = recordedWins(s);
  const ways = Object.fromEntries(winners.map((id) => [id, 'independence-war']));
  s.gameOver = { turn: s.turn, reason: text, ...(winners.length ? { winner: winners[0] } : {}), winners, scores: finalScores(s), ways, peopleScores: peopleScores(s) };
}

/** The nations whose War of Independence was won and recorded, in the order won (ties in turn order). */
function recordedWins(s: GameState): PlayerId[] {
  const order: readonly PlayerId[] = s.config.nations;
  return s.players
    .filter((p) => p.victory?.way === 'independence-war')
    .sort((a, b) => a.victory!.turn - b.victory!.turn || order.indexOf(a.id) - order.indexOf(b.id))
    .map((p) => p.id);
}

/** One verdict: "France wins by prosperity, with the Wendat", "the Haudenosaunee win by continuity, still on their homeland". */
function verdict(s: GameState, way: string, winners: readonly PlayerId[], partners: readonly TribeId[]): string {
  const names = winners.map((n) => nationOf(s, n).name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const win = names.length === 1 && european(winners[0]) ? 'wins' : 'win';
  const key = way === 'confederacy' && partners.length ? 'gameOver.way.confederacy.partners' : `gameOver.way.${way}`;
  return term(s, key as Parameters<typeof term>[1], { winners: list, win, partners: peopleList(s, partners) });
}

function judgeBothSides(s: GameState, moment: VictoryMoment): void {
  const rules = orderedVictory(s);
  if (moment.kind === 'warEnded') {
    if (!rules.some((r) => r.id === 'independence-war')) return;
    if (moment.outcome === 'won') {
      if (!s.config.playOn && askToKeepPlaying(s, moment)) return;
      recordIndependence(s, moment.together?.length ? moment.together : [moment.nation]);
    }
    endIfNobodyPlays(s, moment.text);
    return;
  }
  // Immediate kinds after any round.
  for (const rule of rules) {
    const kind = KINDS.get(rule.id);
    if (!kind) throw new Error(`Unknown victory rule "${rule.id}".`);
    if (!kind.immediate) continue;
    const over = kind.check(s, moment, rule.params ?? {});
    if (!over) continue;
    const winners = over.winners ?? (over.winner ? [over.winner] : []);
    s.gameOver = { ...over, winners, ways: Object.fromEntries(winners.map((id) => [id, rule.id])), peopleScores: peopleScores(s) };
    return;
  }
  const cal = calendarOf(s);
  if (s.turn < lastTurn(cal)) return;
  // The end year: every kind asked, each player judged once, by the first kind that names it.
  const scores = finalScores(s);
  const winners: PlayerId[] = [];
  const ways: Partial<Record<PlayerId, string>> = {};
  const partners: TribeId[] = [];
  const verdicts: string[] = [];
  for (const rule of rules) {
    const kind = KINDS.get(rule.id);
    if (!kind) throw new Error(`Unknown victory rule "${rule.id}".`);
    if (kind.immediate) continue;
    let named: PlayerId[];
    let alongside: TribeId[] = [];
    if (rule.id === 'independence-war') named = recordedWins(s);
    else if (rule.id === 'time') {
      // The best-scoring European, only if no European won another way; never a people.
      if (winners.some(european)) continue;
      const best = leader(scores);
      named = best ? [best] : [];
    } else {
      const over = kind.check(s, moment, rule.params ?? {});
      if (!over) continue;
      named = over.winners ?? (over.winner ? [over.winner] : []);
      alongside = over.partners ?? [];
    }
    named = named.filter((id) => !(id in ways));
    if (!named.length) continue;
    for (const id of named) {
      winners.push(id);
      ways[id] = rule.id;
    }
    for (const t of alongside) if (!partners.includes(t)) partners.push(t);
    verdicts.push(verdict(s, rule.id, named, alongside));
  }
  const reason = verdicts.length ? term(s, 'gameOver.judged', { year: cal.end.year, verdicts: verdicts.join('; ') }) : term(s, 'gameOver.time', { year: cal.end.year });
  s.gameOver = { turn: s.turn, reason, ...(winners.length ? { winner: winners[0] } : {}), winners, scores, ways, peopleScores: peopleScores(s), ...(partners.length ? { partners } : {}) };
}

/** Whole years since a turn. */
function yearsSince(s: GameState, turn: number): number {
  const cal = calendarOf(s);
  return yearValue(s.turn, cal) - yearValue(turn, cal);
}

/** The playing peoples that pass a people's kind, ranked by their score among peoples (ties in turn order). */
function peopleWinners(s: GameState, pass: (id: PlayerId) => boolean): PlayerId[] {
  const scores = peopleScores(s);
  const order = s.players.map((p) => p.id);
  return s.players
    .filter((p) => p.kind === 'people' && pass(p.id))
    .map((p) => p.id)
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || order.indexOf(a) - order.indexOf(b));
}

/** The end year, in a game with a playing people. */
function atEnd(s: GameState, moment: VictoryMoment): boolean {
  return moment.kind === 'round' && s.turn >= lastTurn(calendarOf(s)) && anyPlayingPeople(s);
}

function capitalFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

registerVictory({
  id: 'military',
  name: 'Every European nation defeated: the peoples win together',
  immediate: true,
  check(s, moment, params) {
    if (moment.kind !== 'round' || !anyPlayingPeople(s)) return null;
    if (!europeansDefeated(s)) {
      delete s.europeansDefeated;
      return null;
    }
    const years = victoryParams(s, 'military', MILITARY, params).years;
    if (years > 0) {
      s.europeansDefeated ??= s.turn;
      if (yearsSince(s, s.europeansDefeated) < years) return null;
    }
    const winners = militaryWinners(s, peopleScores(s));
    if (!winners.length) return null;
    const names = winners.map((n) => nationOf(s, n).name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    return { turn: s.turn, reason: term(s, 'gameOver.military', { winners: capitalFirst(list), win: 'win' }), winner: winners[0], winners, scores: finalScores(s) };
  },
});

registerVictory({
  id: 'continuity',
  name: 'A people still on its homeland, and thriving',
  check(s, moment, params) {
    if (!atEnd(s, moment)) return null;
    const winners = peopleWinners(s, (id) => continuityStanding(s, id, params).fails.length === 0);
    return winners.length ? { turn: s.turn, reason: verdict(s, 'continuity', winners, []), winner: winners[0], winners, scores: finalScores(s) } : null;
  },
});

registerVictory({
  id: 'good-life',
  name: 'A people fed, at peace, its land whole and its faith kept',
  check(s, moment, params) {
    if (!atEnd(s, moment)) return null;
    const winners = peopleWinners(s, (id) => goodLifeStanding(s, id, params).fails.length === 0);
    return winners.length ? { turn: s.turn, reason: verdict(s, 'good-life', winners, []), winner: winners[0], winners, scores: finalScores(s) } : null;
  },
});

registerVictory({
  id: 'confederacy',
  name: 'A lasting league of peoples wins together',
  check(s, moment, params) {
    if (!atEnd(s, moment)) return null;
    const won = confederacyLeagues(s, params);
    if (!won.length) return null;
    const scores = peopleScores(s);
    const winners = won.flatMap((l) => l.winners).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    const partners = won.flatMap((l) => l.partners);
    return { turn: s.turn, reason: verdict(s, 'confederacy', winners, partners), winner: winners[0], winners, partners, scores: finalScores(s) };
  },
});

/**
 * Each winner's way (T14): `gameOver.ways` where the game wrote it (a game with a playing people);
 * otherwise worked out from the ending: before the calendar's last turn, a War of Independence (or,
 * in play-on, the end of the last one, by score); at the end, partners mean prosperity and several
 * winners concord, one winner the best score.
 */
export function waysOf(s: GameState): Partial<Record<PlayerId, string>> {
  const over = s.gameOver;
  if (!over) return {};
  if (over.ways) return over.ways;
  let way: string;
  if (over.retired) way = 'retired';
  else if (over.turn < lastTurn(calendarOf(s))) way = over.reason === term(s, 'gameOver.playOn') ? 'time' : 'independence-war';
  else if (over.partners?.length) way = 'prosperity';
  else if (over.winners.length > 1) way = 'concord';
  else way = 'time';
  return Object.fromEntries(over.winners.map((id) => [id, way]));
}


/**
 * Arena play-on (`GameConfig.playOn`): a nation whose War of Independence is over is finished. Its
 * score is kept as it stands now, the Crown's troops sent against it go home, and it takes no more
 * turns (turn.ts); the other nations play on to the end of the calendar.
 */
export function finishNation(s: GameState, p: Player): void {
  const breakdown = scoreBreakdown(s, p);
  p.finished = { turn: s.turn, score: breakdown.total, parts: Object.fromEntries(breakdown.lines.map((l) => [l.key, l.points])) };
  for (const u of unitList(s)) if (u.owner === 'crown' && u.against === p.id) removeUnit(s, u.id);
}
