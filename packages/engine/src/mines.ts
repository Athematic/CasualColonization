import { MINES } from './rules/mines.js';
import { TERRAIN } from './rules/terrain.js';
import { noteHistory } from './history.js';
import { message, tileAt } from './queries.js';
import type { GoodId } from './rules/goods.js';
import type { Colony, GameState, Tile } from './types.js';

export const mineKey = (x: number, y: number): string => `${x},${y}`;

/** The good a tile is mined for (its silver or ore resource), or null if it is not a mining tile. */
export function minedGood(tile: Tile): GoodId | null {
  if (tile.f) return null;
  const g = TERRAIN[tile.t].bonusGood;
  if (g !== 'silver' && g !== 'ore') return null;
  if (g === 'silver' || tile.b) return g;
  return null;
}

/** Counts what a colony's workers dug this turn and depletes tiles that have given all they will. */
export function noteMining(s: GameState, colony: Colony, workers: Record<string, number>): void {
  for (const id of Object.keys(workers)) {
    const u = s.units[id];
    if (!u || u.loc.kind !== 'colony' || u.loc.job.kind !== 'tile') continue;
    const { x, y, good } = u.loc.job;
    const tile = tileAt(s, x, y);
    if (!tile || (good !== 'silver' && good !== 'ore') || minedGood(tile) !== good) continue;
    const amount = workers[id];
    if (amount <= 0) continue;
    const mined = (s.mined ??= {});
    const key = mineKey(x, y);
    const total = (mined[key] ?? 0) + amount;
    mined[key] = total;
    const at = { x, y };
    const name = TERRAIN[tile.t].name.toLowerCase();
    if (tile.b && total >= (MINES.bonusLimit[good] ?? Infinity)) {
      delete tile.b;
      const text = `The ${good} deposit in the ${name} near ${colony.name} has run out.`;
      message(s, text, colony.owner, at);
      noteHistory(s, 'event', [colony.owner], text, { at });
    }
    if (good === 'silver' && !tile.d && total >= MINES.thinLimit) {
      tile.d = true;
      const text = `The silver in the ${name} near ${colony.name} is running thin.`;
      message(s, text, colony.owner, at);
      noteHistory(s, 'event', [colony.owner], text, { at });
    }
  }
}
