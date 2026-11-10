import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { colonyWorkers, currentPlayer, formatDate, maxMoves, message, yearOf } from './queries.js';
import { finalScores } from './score.js';
import { track } from './telemetry.js';
import type { GameState } from './types.js';

/** A colony of more than this many colonists cannot be abandoned. */
export const ABANDON_MAX_COLONISTS = 3;

/** Why a colony cannot be abandoned, or null if it can. */
export function abandonProblem(s: GameState, colonyId: string): string | null {
  const colony = s.colonies[colonyId];
  if (!colony) return 'No such colony.';
  if (colony.buildings.stockade > 0) return `${colony.name} has a stockade; its people will not leave it.`;
  const pop = colonyWorkers(s, colony).length;
  if (pop > ABANDON_MAX_COLONISTS) return `${colony.name} is too large to abandon (at most ${ABANDON_MAX_COLONISTS} colonists).`;
  return null;
}

/**
 * Abandons a colony as in the original game: only small colonies without a stockade. The
 * colonists step out onto the tile as units, the goods and buildings are lost. The computer
 * players issue it only just before declaring independence, for a tiny outpost that could not
 * hold (ai/advanced.ts, abandonOutposts), never for a starving one-colonist colony.
 */
export function abandonColony(s: GameState, colonyId: string): string {
  const colony = s.colonies[colonyId];
  const reason = abandonProblem(s, colonyId);
  if (reason) fail(reason);
  for (const u of colonyWorkers(s, colony)) {
    u.loc = { kind: 'map', x: colony.x, y: colony.y };
    u.moves = maxMoves(u, s);
    u.state = 'active';
    delete u.teach;
  }
  delete s.colonies[colony.id];
  track(colony.owner, 'cmd:abandonColony');
  const text = `${colony.name} has been abandoned.`;
  message(s, text, colony.owner, colony);
  noteHistory(s, 'colony', [colony.owner], text, { secret: true, at: { x: colony.x, y: colony.y } });
  return text;
}

/** Ends the game now for a person who has had enough; the score is counted as usual. */
export function retire(s: GameState): string {
  const p = currentPlayer(s);
  if (!p.human) fail('Only a person can retire.');
  if (s.gameOver) fail('The game is already over.');
  const text = `Retired in ${yearOf(s.turn).year}.`;
  s.gameOver = { turn: s.turn, reason: text, scores: finalScores(s), retired: true };
  track(p.id, 'cmd:retire');
  noteHistory(s, 'event', [p.id], `${p.id} retired in ${formatDate(s.turn)}.`);
  return text;
}
