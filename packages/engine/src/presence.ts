/**
 * Who is in the game yet (native-nations.md T18): a leaf module for the readers of
 * `GameState.arrivals` (arrivals.ts has the arrivals themselves), so the engine's modules can ask
 * without importing the setup code.
 */
import type { PlayerId } from './rules/nations.js';
import type { GameState } from './types.js';

/** Whether a nation of the game is still to arrive. */
export function yetToArrive(s: GameState, nation: PlayerId): boolean {
  return !!s.arrivals?.some((a) => a.nation === nation);
}

/** The nations of the game that are in it now (all of `config.nations` without arrivals). */
export function nationsPresent(s: GameState): number {
  return s.config.nations.length - (s.arrivals?.length ?? 0);
}

