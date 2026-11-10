/**
 * The unit and colony indexes (src/unitindex.ts) must answer exactly as the old linear scans did,
 * in the same order, after any change. With setIndexChecks(true) every lookup also runs the scan
 * and throws on a difference; these tests mutate units and colonies and query again, and play
 * computer games with the checks on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  addColony,
  addUnit,
  colonyAt,
  colonyWorkers,
  createGame,
  createUnit,
  deserialize,
  handOver,
  headStartConfig,
  indexChecks,
  playUntil,
  removeColony,
  removeUnit,
  serialize,
  setIndexChecks,
  setUnitLoc,
  tileWorkedBy,
  unitsAboard,
  unitsAt,
  type GameConfig,
  type GameState,
  type Unit,
} from '../src/index.js';

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

/** What the old scans returned. */
const scanAt = (s: GameState, x: number, y: number) => Object.values(s.units).filter((u) => u.loc.kind === 'map' && u.loc.x === x && u.loc.y === y);
const ids = (us: Unit[]) => us.map((u) => u.id);

const initialChecks = indexChecks();
afterEach(() => setIndexChecks(initialChecks));

describe('unit index', () => {
  it('follows moves, new units and removed units, in record order', () => {
    setIndexChecks(true);
    const s = createGame(config(11));
    const [a, b, c] = Object.values(s.units).filter((u) => u.loc.kind === 'europe' || u.loc.kind === 'carrier' || u.loc.kind === 'map').slice(0, 3);
    // Build the index, then move the units onto one tile in reverse record order.
    expect(unitsAt(s, 3, 3)).toEqual([]);
    setUnitLoc(s, c, { kind: 'map', x: 3, y: 3 });
    setUnitLoc(s, b, { kind: 'map', x: 3, y: 3 });
    setUnitLoc(s, a, { kind: 'map', x: 3, y: 3 });
    expect(ids(unitsAt(s, 3, 3))).toEqual(ids([a, b, c]));
    expect(ids(unitsAt(s, 3, 3))).toEqual(ids(scanAt(s, 3, 3)));
    // A new unit comes last; a removed one is gone; one moved away is gone from the old tile.
    const d = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 3, y: 3 });
    expect(ids(unitsAt(s, 3, 3))).toEqual(ids([a, b, c, d]));
    removeUnit(s, b.id);
    setUnitLoc(s, c, { kind: 'map', x: 4, y: 3 });
    expect(ids(unitsAt(s, 3, 3))).toEqual(ids([a, d]));
    expect(ids(unitsAt(s, 4, 3))).toEqual([c.id]);
    // Re-adding a removed id puts it last, as a new key of the record would be.
    setUnitLoc(s, b, { kind: 'map', x: 3, y: 3 });
    addUnit(s, b);
    expect(ids(unitsAt(s, 3, 3))).toEqual(ids([a, d, b]));
    // The returned list is a copy: changing it changes nothing.
    unitsAt(s, 3, 3).pop();
    expect(unitsAt(s, 3, 3)).toHaveLength(3);
    // Out-of-map tiles are answered by the scan.
    expect(unitsAt(s, -1, 3)).toEqual([]);
  });

  it('follows units joining and leaving colonies and carriers', () => {
    setIndexChecks(true);
    const s = createGame(config(12));
    const ship = Object.values(s.units).find((u) => u.type === 'caravel')!;
    const aboard = unitsAboard(s, ship);
    expect(aboard.length).toBeGreaterThan(0);
    const [first] = aboard;
    setUnitLoc(s, first, { kind: 'map', x: 2, y: 2 });
    expect(ids(unitsAboard(s, ship))).toEqual(ids(aboard.slice(1)));
    const colony = { ...Object.values(s.colonies)[0], id: 'cTest', owner: ship.owner, name: 'Test', x: 2, y: 2, goods: {}, buildings: {} } as unknown as GameState['colonies'][string];
    expect(colonyAt(s, 2, 2)).toBeUndefined();
    addColony(s, colony);
    expect(colonyAt(s, 2, 2)).toBe(colony);
    expect(colonyWorkers(s, colony)).toEqual([]);
    setUnitLoc(s, first, { kind: 'colony', colonyId: 'cTest', job: { kind: 'tile', x: 3, y: 2, good: 'food' } });
    expect(colonyWorkers(s, colony)).toEqual([first]);
    expect(tileWorkedBy(s, 3, 2)).toBe(first);
    setUnitLoc(s, first, { kind: 'colony', colonyId: 'cTest', job: { kind: 'building', building: 'townHall' } });
    expect(tileWorkedBy(s, 3, 2)).toBeUndefined();
    expect(colonyWorkers(s, colony)).toEqual([first]);
    removeUnit(s, first.id);
    expect(colonyWorkers(s, colony)).toEqual([]);
    removeColony(s, 'cTest');
    expect(colonyAt(s, 2, 2)).toBeUndefined();
  });

  it('gives a loaded save an index of its own', () => {
    setIndexChecks(true);
    const s = createGame(config(13));
    const u = Object.values(s.units)[0];
    setUnitLoc(s, u, { kind: 'map', x: 5, y: 5 });
    expect(unitsAt(s, 5, 5)).toEqual([u]);
    const t = deserialize(serialize(s));
    setUnitLoc(t, t.units[u.id], { kind: 'map', x: 6, y: 5 });
    expect(unitsAt(t, 5, 5)).toEqual([]);
    expect(unitsAt(s, 5, 5)).toEqual([u]);
  });

  // Computer games with every lookup checked against the scan: players of every level move, found
  // colonies, fight, train, load and unload. For longer games run the whole suite or the bench
  // with CC_INDEX_CHECKS=1 (both pass, including the bench's games to 1700).
  it('stays exact through a computer game (Americas, 80 turns)', () => {
    setIndexChecks(true);
    const s = createGame(headStartConfig(config(5), 80));
    expect(() => {
      playUntil(s, 80);
      handOver(s);
    }).not.toThrow();
  }, 120_000);

  it('stays exact through a computer game (Caribbean, 60 turns)', () => {
    setIndexChecks(true);
    const s = createGame(headStartConfig(config(6, 'caribbean'), 60));
    expect(() => playUntil(s, 60)).not.toThrow();
  }, 120_000);
});
