import type { GoodId } from './goods.js';

/**
 * Mines running out, after the original game. Every tile whose bonus resource is silver or ore
 * counts the goods colonists have dug from it (`GameState.mined`, keyed "x,y"). All the numbers
 * are here so a scenario can tune them.
 *
 * - A silver bonus tile (a silver deposit in the mountains) loses its bonus after
 *   `bonusLimit.silver` silver; an ore bonus tile after `bonusLimit.ore` ore. It then yields as
 *   a plain tile of its terrain.
 * - A mountain tile of silver, bonus or not, is "worked out" after `thinLimit` silver in all:
 *   it gets `Tile.d` and its silver yield is halved (never below 1).
 *
 * An expert silver miner on a deposit digs about 4 to 6 a turn, so a deposit lasts roughly 80 to
 * 120 turns and a mountain is thin after about 300 turns of heavy mining.
 */
export const MINES = {
  bonusLimit: { silver: 500, ore: 1000 } as Partial<Record<GoodId, number>>,
  thinLimit: 1500,
};
