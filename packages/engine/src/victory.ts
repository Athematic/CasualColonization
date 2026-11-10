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
 * Kinds are pure functions of the state and draw no random numbers. `gameOver.winners` lists every
 * winner, best first; `gameOver.winner` is the first of them, for code that knows one winner only.
 */
import { finalScores, scoreBreakdown } from './score.js';
import { calendarOf, lastTurn, nationOf, scenarioOf, term } from './scenarios/index.js';
import { treatyNations } from './treaties.js';
import type { NationId } from './rules/nations.js';
import type { GameState, Player } from './types.js';
import { removeUnit } from './unitindex.js';

export type GameOver = NonNullable<GameState['gameOver']>;

/** What a victory kind returns: a game over whose `winners` default to its `winner`. */
export type VictoryResult = Omit<GameOver, 'winners'> & { winners?: NationId[] };

/** Concord's default: the share of the total score an alliance must hold at the end to win together. */
export const CONCORD_SHARE = 0.55;

/** When the victory rules are asked. */
export type VictoryMoment =
  /** After a round, once the turn counter has moved on. */
  | { kind: 'round' }
  /** A nation's War of Independence has just ended; `text` is the news. */
  | { kind: 'warEnded'; nation: NationId; outcome: 'won' | 'lost'; text: string };

export interface VictoryKind {
  id: string;
  /** Shown name, for the New game screen. */
  name: string;
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

/** Asks the scenario's victory rules, in order; the first that ends the game sets `s.gameOver`. */
export function checkVictory(s: GameState, moment: VictoryMoment): void {
  if (s.gameOver) return;
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
function leader(scores: Partial<Record<NationId, number>>): NationId | undefined {
  return (Object.entries(scores) as [NationId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
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

/**
 * The members of the alliance that holds more than `share` of the total score, best first by
 * their own score (ties in turn order), or null. With a share below one half two alliances could
 * both qualify; the larger share wins.
 */
export function concordWinners(s: GameState, scores: Partial<Record<NationId, number>>, share: number): NationId[] | null {
  const total = Object.values(scores).reduce((n: number, v) => n + (v ?? 0), 0);
  if (total <= 0) return null;
  let best: { members: NationId[]; part: number } | null = null;
  for (const t of s.treaties ?? []) {
    if (t.end || t.kind !== 'alliance') continue;
    const members = treatyNations(t).filter((n) => scores[n] !== undefined);
    if (members.length < 2) continue;
    const part = members.reduce((n, m) => n + (scores[m] ?? 0), 0) / total;
    if (part > share && (!best || part > best.part)) best = { members, part };
  }
  if (!best) return null;
  const order = s.config.nations;
  return [...best.members].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || order.indexOf(a) - order.indexOf(b));
}

registerVictory({
  id: 'independence-war',
  name: 'Independence by war',
  check(s, moment) {
    if (moment.kind !== 'warEnded') return null;
    if (s.config.playOn) {
      // Arena play-on: the game goes on while any nation still plays.
      if (s.players.some((p) => p.id !== 'crown' && !p.finished)) return null;
      const scores = finalScores(s);
      return { turn: s.turn, reason: term(s, 'gameOver.playOn'), winner: leader(scores), scores };
    }
    if (moment.outcome === 'won') return { turn: s.turn, reason: moment.text, winner: moment.nation, scores: finalScores(s) };
    const humansLeft = s.players.some((o) => o.human && o.independence !== 'lost');
    return humansLeft ? null : { turn: s.turn, reason: moment.text, scores: finalScores(s) };
  },
});

/**
 * Arena play-on (`GameConfig.playOn`): a nation whose War of Independence is over is finished. Its
 * score is kept as it stands now, the Crown's troops sent against it go home, and it takes no more
 * turns (turn.ts); the other nations play on to the end of the calendar.
 */
export function finishNation(s: GameState, p: Player): void {
  const breakdown = scoreBreakdown(s, p);
  p.finished = { turn: s.turn, score: breakdown.total, parts: Object.fromEntries(breakdown.lines.map((l) => [l.key, l.points])) };
  for (const u of Object.values(s.units)) if (u.owner === 'crown' && u.against === p.id) removeUnit(s, u.id);
}
