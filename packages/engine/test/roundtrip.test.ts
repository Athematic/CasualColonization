/**
 * Save and load must not change a game: a game whose state goes through the engine's own save
 * and load (serialize, then deserialize, the way the web game's saves, autosave and `?game=` codes
 * do) after every turn must play exactly as the same game played straight through. Replays, game
 * codes and network play depend on it.
 *
 * Each case plays two copies of a game side by side, one straight and one saved and loaded after
 * every round, and compares their saved states each round; on a difference it reports the first
 * differing round and the first differing path in the state.
 *
 * The fast cases run with `npm test`. CC_SLOW_TESTS=1 adds longer games.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGame,
  deserialize,
  getScenario,
  handOver,
  headStartConfig,
  nationSet,
  newGameOptions,
  serialize,
  type GameConfig,
  type GameState,
} from '../src/index.js';

/** The New game screen's defaults for a scenario, with its first nation as the player. */
function webConfig(seed: number, scenarioId: string, events: boolean): GameConfig {
  const scenario = getScenario(scenarioId)!;
  const [first, ...rest] = nationSet(scenario, undefined).slice(0, 4).map((e) => e.id);
  const map = newGameOptions(scenario).defaultMap;
  return {
    seed,
    mapSize: 'medium',
    ...(map ? { map } : {}),
    nations: [first, ...rest],
    humans: [first],
    ai: Object.fromEntries(rest.map((n) => [n, 'competent'])),
    difficulty: 'conquistador',
    historicalEvents: events,
    randomEvents: events,
    colonyCharter: true,
    ...(scenarioId === 'americas' ? {} : { scenario: scenarioId }),
  };
}

/** The path of the first difference between two JSON values, or null when they are equal. */
export function firstDifference(a: unknown, b: unknown, path = '$'): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${short(a)} vs ${short(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const k = ka[i] ?? kb[i];
    if (!(k in (a as object)) || !(k in (b as object))) return `${path}.${k}: ${k in (a as object) ? 'present' : 'absent'} vs ${k in (b as object) ? 'present' : 'absent'}`;
    const d = firstDifference((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    if (d) return d;
  }
  if (ka.join() !== kb.join()) return `${path}: key order ${ka.join(',').slice(0, 200)} vs ${kb.join(',').slice(0, 200)}`;
  return null;
}

function short(v: unknown): string {
  const t = JSON.stringify(v);
  return t === undefined ? String(v) : t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

const roundTrip = (s: GameState) => deserialize(serialize(s));

/**
 * Plays a game `rounds` rounds straight and with a save and load after every round; returns the
 * first round at which the saved states differ, with the path, or null.
 */
function compare(config: GameConfig, rounds: number, headStartTurn?: number): string | null {
  let a: GameState;
  let b: GameState;
  if (headStartTurn) {
    const hs = headStartConfig(config, headStartTurn);
    a = createGame(hs);
    b = roundTrip(createGame(hs));
    while (a.turn < headStartTurn && !a.gameOver) {
      applyCommand(a, { type: 'endTurn' });
      applyCommand(b, { type: 'endTurn' });
      b = roundTrip(b);
      const d = check(a, b);
      if (d) return d;
    }
    handOver(a);
    handOver(b);
    b = roundTrip(b);
    const d = check(a, b);
    if (d) return `after the hand-over: ${d}`;
    // The person plays on, ending their turns.
  } else {
    // Everyone a computer, so endTurn plays whole rounds.
    const { headStart: _, ...all } = headStartConfig(config, rounds);
    a = createGame(all);
    b = roundTrip(createGame(all));
  }
  const d0 = check(a, b);
  if (d0) return `at the start: ${d0}`;
  for (let r = 0; r < rounds && !a.gameOver; r++) {
    applyCommand(a, { type: 'endTurn' });
    applyCommand(b, { type: 'endTurn' });
    b = roundTrip(b);
    const d = check(a, b);
    if (d) return d;
  }
  return null;
}

function check(a: GameState, b: GameState): string | null {
  const problem = notATree(a);
  if (problem) return `turn ${a.turn}: the state played straight is not a plain JSON tree: ${problem}`;
  const sa = serialize(a);
  const sb = serialize(b);
  if (sa === sb) return null;
  return `turn ${a.turn}: ${firstDifference(JSON.parse(sa), JSON.parse(sb))}`;
}

/**
 * The first place where a state is not a plain JSON tree (see GameState): an object held twice,
 * or a value JSON does not keep as it is. Null when there is none.
 */
export function notATree(s: GameState): string | null {
  const seen = new Map<object, string>();
  const walk = (v: unknown, path: string): string | null => {
    if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? null : `${path} is ${Object.is(v, -0) ? '-0' : v}`;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return null;
    if (v === undefined) return null;
    if (typeof v !== 'object') return `${path} is a ${typeof v}`;
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return `${path} is a ${proto?.constructor?.name ?? 'non-plain object'}`;
    const before = seen.get(v);
    if (before !== undefined) return `${path} is the same object as ${before}`;
    seen.set(v, path);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (v[i] === undefined) return `${path}.${i} is undefined (null after a load)`;
        const p = walk(v[i], `${path}.${i}`);
        if (p) return p;
      }
      return null;
    }
    for (const [k, c] of Object.entries(v)) {
      const p = walk(c, `${path}.${k}`);
      if (p) return p;
    }
    return null;
  };
  return walk(s, '$');
}

const SLOW = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CC_SLOW_TESTS === '1';

describe('save and load do not change a game', () => {
  const cases: [string, GameConfig, number, number?][] = [
    ['americas, events, seed 7', webConfig(7, 'americas', true), 60],
    ['americas, no events, seed 21', webConfig(21, 'americas', false), 60],
    ['caribbean, events, seed 7', webConfig(7, 'caribbean', true), 60],
    ['caribbean, no events, seed 21', webConfig(21, 'caribbean', false), 60],
    ['americas head start to 30, seed 3', webConfig(3, 'americas', true), 10, 30],
    ['caribbean head start to 20, seed 5', webConfig(5, 'caribbean', true), 10, 20],
  ];
  for (const [name, config, rounds, hs] of cases) {
    it(name, () => {
      expect(compare(config, rounds, hs)).toBeNull();
    }, 120_000);
  }
  it.skipIf(!SLOW)('longer games (CC_SLOW_TESTS=1)', () => {
    for (const scenario of ['americas', 'caribbean']) for (const seed of [1492, 99]) expect(compare(webConfig(seed, scenario, true), 250), `${scenario} ${seed}`).toBeNull();
  }, 1_200_000);
});
