/**
 * Golden hashes: short seeded games whose final saved state must stay bit-identical. They guard
 * the 0.9 scenario framework (docs/design/scenario-framework.md, step 0): moving a table into a
 * scenario must not change a single game. CI runs this with `npm test`; `npm run bench -- --verify`
 * checks longer games by hand.
 *
 * The games are the bench's (scripts/bench.ts): the New game screen's defaults with England as
 * the player, played as a head start by the computer and handed over. The first is the bench's
 * seed 7 game, so its hash equals the one in scripts/bench-hashes.json.
 *
 * The hashes are a Vitest snapshot (__snapshots__/golden.test.ts.snap). When a change is meant to
 * change games, re-record with `npm run test:golden:write` (Vitest's -u for this file) and the
 * bench's with `npm run bench -- --verify --write`, and say so in the commit message.
 */
import { describe, expect, it } from 'vitest';
import { createGame, handOver, headStartConfig, playUntil, serialize, type GameConfig, type GameState } from '../src/index.js';

/** The New game screen's defaults, with England as the player (as in scripts/bench.ts). */
function webConfig(seed: number, map?: string): GameConfig {
  return {
    seed,
    mapSize: 'medium',
    ...(map ? { map } : {}),
    nations: ['england', 'france', 'netherlands', 'spain'],
    humans: ['england'],
    ai: { france: 'competent', netherlands: 'competent', spain: 'competent' },
    difficulty: 'conquistador',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
  };
}

/** Plays a head start to the turn and hands over, as the web game's "Skip ahead" does. */
function headStart(config: GameConfig, turn: number): GameState {
  const s = createGame(headStartConfig(config, turn));
  playUntil(s, turn);
  handOver(s);
  return s;
}

/** The first 16 hex digits of the SHA-256 of the saved state, as scripts/bench.ts prints them. */
async function hash(s: GameState): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(s)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

const GAMES: Record<string, () => GameState> = {
  'generated map, seed 7, 150 rounds': () => headStart(webConfig(7), 150),
  'stored americas map, seed 1492, 60 rounds': () => headStart(webConfig(1492, 'americas'), 60),
};

const RERECORD =
  'This game played differently. If the change is meant to change games, re-record with ' +
  '`npm run test:golden:write` (and `npm run bench -- --verify --write`) and say so in the commit message; ' +
  'otherwise the change broke determinism';

describe('golden hashes (games stay bit-identical)', () => {
  for (const [name, play] of Object.entries(GAMES)) {
    it(name, async () => {
      expect(await hash(play()), RERECORD).toMatchSnapshot();
    }, 120_000);
  }
});
