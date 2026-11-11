/**
 * The computer players' colony job search (optimiseWorkers in src/ai/advanced.ts) keeps tile
 * yields per colony and updates who works where after each change instead of starting over. With
 * setJobSearchChecks(true) every search also runs the plain version (every job option listed and
 * valued) and throws if the chosen job or its value differs; these games run with the checks on,
 * over many colonies of every computer level. CC_AI_CHECKS=1 turns the checks on for the bench too.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createGame, headStartConfig, playUntil, setJobSearchChecks, type GameConfig } from '../src/index.js';

function config(seed: number, scenario?: string): GameConfig {
  return {
    seed,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands', 'spain'],
    humans: [],
    ai: { england: 'creative', france: 'competent', netherlands: 'combative', spain: 'naive' },
    difficulty: 'conquistador',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...(scenario ? { scenario } : {}),
  };
}

afterEach(() => {
  setJobSearchChecks(false);
});

describe('colony job search', () => {
  it('chooses as the plain search does (Americas, 220 turns)', () => {
    const before = setJobSearchChecks(true);
    const s = createGame(headStartConfig(config(21), 220));
    expect(() => playUntil(s, 220)).not.toThrow();
    // Thousands of searches, in more than ten colonies.
    expect(setJobSearchChecks(true) - before).toBeGreaterThan(5000);
    expect(Object.keys(s.colonies).length).toBeGreaterThan(10);
  }, 120_000);
});
