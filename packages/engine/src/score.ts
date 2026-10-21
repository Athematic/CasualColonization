import { sonsOfLiberty } from './production.js';
import { colonyWorkers, yearOf } from './queries.js';
import { UNIT_TYPES } from './rules/units.js';
import type { GameState, Player } from './types.js';

/** The game ends after the autumn turn of this year. */
export const LAST_YEAR = 1850;

export function score(s: GameState, p: Player): number {
  let points = 0;
  for (const u of Object.values(s.units)) if (u.owner === p.id && UNIT_TYPES[u.type].kind === 'colonist') points += 1;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== p.id) continue;
    points += Math.round((colonyWorkers(s, c).length * sonsOfLiberty(s, c)) / 50);
  }
  points += p.fathers.length * 5;
  points += Math.floor(p.gold / 1000);
  if (p.independence === 'won') points += 250;
  return points;
}

export function finalScores(s: GameState): Partial<Record<Player['id'], number>> {
  const out: Partial<Record<Player['id'], number>> = {};
  for (const p of s.players) if (p.id !== 'crown') out[p.id] = score(s, p);
  return out;
}

/** Ends the game when time runs out. */
export function checkTimeLimit(s: GameState): void {
  if (s.gameOver) return;
  const { year, season } = yearOf(s.turn);
  if (year < LAST_YEAR || (year === LAST_YEAR && season !== 'autumn')) return;
  const scores = finalScores(s);
  const winner = (Object.entries(scores) as [Player['id'], number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  s.gameOver = { turn: s.turn, reason: `The year ${LAST_YEAR} has come and the age of colonization is over.`, winner, scores };
}
