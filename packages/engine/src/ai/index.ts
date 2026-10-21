import { runCrown } from '../independence.js';
import type { GameState, Player } from '../types.js';
import { runAdvanced } from './advanced.js';
import { creativeProfile } from './creative.js';
import { runNaive } from './naive.js';
import { AI_PROFILES } from './profiles.js';

/** Plays one turn for a computer-controlled nation at its level. */
export function runAi(s: GameState, p: Player): void {
  if (p.id === 'crown') return runCrown(s);
  const level = p.ai ?? 'naive';
  if (level === 'naive') return runNaive(s, p);
  const base = AI_PROFILES[level];
  runAdvanced(s, p, base.adaptive ? creativeProfile(s, p, base) : base);
}
