/**
 * Head starts: a computer plays a person's nation for the first part of the game, then hands
 * over. This lets people jump straight into a developed mid- or late-game position.
 */
import type { AiLevel } from './ai/profiles.js';
import { applyCommand } from './commands.js';
import { player } from './queries.js';
import { runAiUntilHuman } from './turn.js';
import type { GameConfig, GameState } from './types.js';
import type { NationId } from './rules/nations.js';

/** The level that plays for people during a head start (the strongest in tournaments). */
export const HEAD_START_LEVEL: AiLevel = 'creative';

/**
 * Game settings for a head start: everyone is a computer until the hand-over, the people's
 * nations at the given level.
 */
export function headStartConfig(config: GameConfig, turn: number, level: AiLevel = HEAD_START_LEVEL): GameConfig {
  const ai = { ...config.ai };
  for (const nation of config.humans) ai[nation] = level;
  return { ...config, humans: [], ai, headStart: { humans: [...config.humans], level, turn } };
}

/** Plays rounds until the turn is reached (or the game ends). Returns true when done. */
export function playUntil(s: GameState, turn: number, maxRounds = Infinity): boolean {
  let rounds = 0;
  while (s.turn < turn && !s.gameOver && rounds < maxRounds) {
    applyCommand(s, { type: 'endTurn' });
    rounds++;
  }
  return s.turn >= turn || !!s.gameOver;
}

/** Gives the nations back to the people who chose them, and moves play on to the first of them. */
export function handOver(s: GameState, nations: NationId[] = s.config.headStart?.humans ?? []): void {
  for (const nation of nations) {
    const p = player(s, nation);
    p.human = true;
    delete p.ai;
    delete p.aiMemory;
    // A pending decision the computer would have taken automatically.
    p.pendingTax = null;
  }
  s.config = { ...s.config, humans: [...nations] };
  delete s.config.headStart;
  runAiUntilHuman(s);
}
