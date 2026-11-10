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
 * Kinds are pure functions of the state and draw no random numbers.
 */
import { finalScores, scoreBreakdown } from './score.js';
import { calendarOf, lastTurn, scenarioOf, term } from './scenarios/index.js';
import type { NationId } from './rules/nations.js';
import type { GameState, Player } from './types.js';
import { removeUnit } from './unitindex.js';

export type GameOver = NonNullable<GameState['gameOver']>;

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
  check(s: GameState, moment: VictoryMoment, params: Record<string, unknown>): GameOver | null;
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
      s.gameOver = over;
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
