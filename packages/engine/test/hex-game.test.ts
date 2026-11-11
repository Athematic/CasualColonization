/**
 * Whole games on hexes (docs/design/hex-maps.md, step 1): the hidden hex test scenarios, both
 * orientations, a generated map and computer players only. They must play many rounds without
 * crashing, keep every colonist on a tile its colony can work, use the second work ring, and come
 * through save and load unchanged. The unit index and the computer players' job search are checked
 * against their plain versions for part of the game (as CC_INDEX_CHECKS=1 CC_AI_CHECKS=1 do).
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGame,
  deserialize,
  getScenario,
  gridOf,
  headStartConfig,
  HEX_FLAT,
  HEX_POINTY,
  indexChecks,
  inColonyWorkArea,
  nationSet,
  openRings,
  serialize,
  setIndexChecks,
  setJobSearchChecks,
  type GameConfig,
  type GameState,
} from '../src/index.js';
import { colonyList, unitList } from '../src/unitindex.js';

/** Where two saved states first differ, with some context, or '' when they are the same. */
function firstDifference(a: string, b: string): string {
  if (a === b) return '';
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}: …${a.slice(Math.max(0, i - 80), i + 40)}… vs …${b.slice(Math.max(0, i - 80), i + 40)}…`;
}

/** Four computer players of every level on a medium generated map, events and the charter on. */
function hexConfig(seed: number, scenario: string): GameConfig {
  const nations = nationSet(getScenario(scenario)!, undefined).slice(0, 4).map((e) => e.id);
  const levels = ['naive', 'competent', 'combative', 'creative'] as const;
  const config: GameConfig = {
    seed,
    mapSize: 'medium',
    nations,
    humans: [nations[0]],
    ai: Object.fromEntries(nations.slice(1).map((n, i) => [n, levels[i + 1]])),
    difficulty: 'conquistador',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    scenario,
  };
  // Everyone a computer (the first as the naive level), so endTurn plays whole rounds.
  const { headStart: _, ...all } = headStartConfig(config, 1000);
  return { ...all, ai: { ...all.ai, [nations[0]]: 'naive' } };
}

/** Problems with colonists' tiles: each worked tile is in its colony's open rings, worked once. */
function workProblems(s: GameState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of unitList(s)) {
    if (u.loc.kind !== 'colony' || u.loc.job.kind !== 'tile') continue;
    const c = s.colonies[u.loc.colonyId];
    const { x, y } = u.loc.job;
    if (!inColonyWorkArea(s, c, x, y)) out.push(`${u.id} in ${c.name} works ${x},${y}, outside its ${openRings(s, c)} ring(s)`);
    const key = `${x},${y}`;
    if (seen.has(key)) out.push(`${x},${y} is worked twice`);
    seen.add(key);
  }
  return out;
}

const roundTrip = (s: GameState) => deserialize(serialize(s));

const checksBefore = indexChecks();
afterAll(() => {
  setIndexChecks(checksBefore);
  setJobSearchChecks(false);
});

describe.each([
  ['hex-test', HEX_POINTY],
  ['hex-test-flat', HEX_FLAT],
] as const)('a computer game on %s', (scenario, grid) => {
  it('plays 200 rounds, works up to two rings and survives save and load', () => {
    const config = hexConfig(11, scenario);
    let a = createGame(config);
    let b = roundTrip(createGame(config));
    expect(gridOf(a)).toBe(grid);
    let outerWorked = 0;
    for (let r = 0; r < 200 && !a.gameOver; r++) {
      // The last 30 rounds with the index and job search checks on (slow).
      const checking = r >= 170;
      setIndexChecks(checking);
      setJobSearchChecks(checking);
      applyCommand(a, { type: 'endTurn' });
      applyCommand(b, { type: 'endTurn' });
      if (r % 10 === 9) {
        b = roundTrip(b);
        expect(firstDifference(serialize(a), serialize(b)), `round ${r}`).toBe('');
      }
      expect(workProblems(a)).toEqual([]);
      for (const u of unitList(a)) {
        if (u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && gridOf(a).distance(u.loc.job.x, u.loc.job.y, a.colonies[u.loc.colonyId].x, a.colonies[u.loc.colonyId].y) === 2) outerWorked++;
      }
    }
    setIndexChecks(false);
    setJobSearchChecks(false);
    expect(a.turn).toBeGreaterThan(150);
    // Every nation founded colonies, and colonies grew far enough to work their second ring.
    for (const p of a.players) expect(colonyList(a).some((c) => c.owner === p.id), `${p.id} has a colony`).toBe(true);
    expect(outerWorked).toBeGreaterThan(0);
    // Nothing tried to step in a direction the grid lacks: all units on the map are on it.
    for (const u of unitList(a)) if (u.loc.kind === 'map') expect(grid.inBounds(a.map, u.loc.x, u.loc.y)).toBe(true);
    a = roundTrip(a);
    expect(workProblems(a)).toEqual([]);
  }, 600_000);
});
