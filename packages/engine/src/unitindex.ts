// Indexes of units by where they are (map tile, colony, carrier, worked tile) and of colonies by
// tile, for the hot lookups in queries.ts. They replace linear scans over every unit and return
// exactly what those scans returned, in the same order: the order `for (id in s.units)` visits
// the units, which is the order their ids were added to the record.
//
// Why they cannot go stale: the index lives beside the state (a WeakMap keyed on the `units`
// record, never in the state, so saves and hashes are unchanged), and every change to what it
// indexes goes through the functions here. The types enforce that: `GameState.units` and
// `GameState.colonies` are read-only records, and a unit's `loc` (with every field of every
// location and job) is read-only, so the compiler refuses `u.loc = ...`, `u.loc.x = ...`,
// `s.units[id] = u` and `delete s.units[id]` everywhere else. Use setUnitLoc, addUnit,
// removeUnit, addColony and removeColony. A new `units` or `colonies` record (a loaded save, a
// copied state) gets an index of its own on its first lookup.
//
// setIndexChecks(true), or CC_INDEX_CHECKS=1 in the environment, makes every lookup also run the
// old linear scan and throw if the two differ; test/unitindex.test.ts plays games with it on.
import type { Colony, GameState, Unit, UnitLocation } from './types.js';

type Units = GameState['units'];
type Colonies = GameState['colonies'];

interface UnitIndex {
  width: number;
  height: number;
  /** Each unit id's place in the record's key order. */
  rank: Map<string, number>;
  next: number;
  /** Units on the map, by tile (y * width + x), each list in key order. */
  onMap: Map<number, Unit[]>;
  /** Units working in a colony, by colony id. */
  inColony: Map<string, Unit[]>;
  /** Units aboard a carrier, by carrier id. */
  aboard: Map<string, Unit[]>;
  /** Colony workers on a tile job, by the worked tile. */
  worked: Map<number, Unit[]>;
}

const unitIndexes = new WeakMap<Units, UnitIndex>();

/** On with CC_INDEX_CHECKS=1 in the environment (for example `CC_INDEX_CHECKS=1 npm test`). */
let checks = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CC_INDEX_CHECKS === '1';

/** Turns on checking every indexed lookup against a linear scan (for tests; slow). */
export function setIndexChecks(on: boolean): void {
  checks = on;
}

export function indexChecks(): boolean {
  return checks;
}

/** True for keys that objects order before all others (array-index-like), which ranks can't follow. */
const INDEX_LIKE = /^(0|[1-9]\d*)$/;

function tileKey(ix: UnitIndex, x: number, y: number): number {
  return x >= 0 && y >= 0 && x < ix.width && y < ix.height && Number.isInteger(x) && Number.isInteger(y) ? y * ix.width + x : -1;
}

function insert<K>(ix: UnitIndex, map: Map<K, Unit[]>, key: K, u: Unit): void {
  const list = map.get(key);
  if (!list) {
    map.set(key, [u]);
    return;
  }
  const r = ix.rank.get(u.id)!;
  let i = list.length;
  while (i > 0 && ix.rank.get(list[i - 1].id)! > r) i--;
  list.splice(i, 0, u);
}

function remove<K>(map: Map<K, Unit[]>, key: K, u: Unit): void {
  const list = map.get(key);
  if (!list) return;
  const i = list.indexOf(u);
  if (i < 0) return;
  if (list.length === 1) map.delete(key);
  else list.splice(i, 1);
}

function place(ix: UnitIndex, u: Unit, loc: UnitLocation, add: boolean): void {
  const put = <K>(map: Map<K, Unit[]>, key: K) => (add ? insert(ix, map, key, u) : remove(map, key, u));
  switch (loc.kind) {
    case 'map': {
      const k = tileKey(ix, loc.x, loc.y);
      if (k >= 0) put(ix.onMap, k);
      break;
    }
    case 'colony': {
      put(ix.inColony, loc.colonyId);
      if (loc.job.kind === 'tile') {
        const k = tileKey(ix, loc.job.x, loc.job.y);
        if (k >= 0) put(ix.worked, k);
      }
      break;
    }
    case 'carrier':
      put(ix.aboard, loc.carrierId);
      break;
  }
}

/** The index for the state's units, built on first use; undefined when key order can't be ranked (then lookups scan). */
function unitIndex(s: GameState): UnitIndex | undefined {
  let ix = unitIndexes.get(s.units);
  if (ix && ix.width === s.map.width && ix.height === s.map.height) return ix;
  ix = { width: s.map.width, height: s.map.height, rank: new Map(), next: 0, onMap: new Map(), inColony: new Map(), aboard: new Map(), worked: new Map() };
  for (const id in s.units) {
    if (INDEX_LIKE.test(id)) return undefined;
    ix.rank.set(id, ix.next++);
  }
  for (const id in s.units) {
    const u = s.units[id];
    place(ix, u, u.loc, true);
  }
  unitIndexes.set(s.units, ix);
  return ix;
}

/** Moves a unit: the only way to change `u.loc` (see the top of this file). */
export function setUnitLoc(s: GameState, u: Unit, loc: UnitLocation): void {
  const old = u.loc;
  (u as { loc: UnitLocation }).loc = loc;
  const ix = unitIndexes.get(s.units);
  if (!ix || s.units[u.id] !== u) return;
  place(ix, u, old, false);
  place(ix, u, loc, true);
}

/** Adds a unit to the state (or replaces the unit with its id). */
export function addUnit(s: GameState, u: Unit): void {
  const units = s.units as Record<string, Unit>;
  const ix = unitIndexes.get(s.units);
  const before = units[u.id];
  units[u.id] = u;
  if (!ix) return;
  if (INDEX_LIKE.test(u.id)) {
    unitIndexes.delete(s.units);
    return;
  }
  if (before) place(ix, before, before.loc, false);
  else ix.rank.set(u.id, ix.next++);
  place(ix, u, u.loc, true);
}

/** Removes a unit from the state. */
export function removeUnit(s: GameState, id: string): void {
  const units = s.units as Record<string, Unit>;
  const u = units[id];
  delete units[id];
  const ix = unitIndexes.get(s.units);
  if (!ix || !u) return;
  place(ix, u, u.loc, false);
  ix.rank.delete(id);
}

function scan(s: GameState, test: (u: Unit) => boolean): Unit[] {
  const out: Unit[] = [];
  for (const id in s.units) {
    const u = s.units[id];
    if (test(u)) out.push(u);
  }
  return out;
}

function checked(s: GameState, what: string, got: Unit[], test: (u: Unit) => boolean): Unit[] {
  if (!checks) return got;
  const want = scan(s, test);
  if (want.length !== got.length || want.some((u, i) => u !== got[i])) {
    throw new Error(`Stale unit index for ${what}: [${got.map((u) => u.id).join(',')}] instead of [${want.map((u) => u.id).join(',')}]`);
  }
  return got;
}

const onTile = (x: number, y: number) => (u: Unit) => u.loc.kind === 'map' && u.loc.x === x && u.loc.y === y;
const inColony = (id: string) => (u: Unit) => u.loc.kind === 'colony' && u.loc.colonyId === id;
const aboard = (id: string) => (u: Unit) => u.loc.kind === 'carrier' && u.loc.carrierId === id;
const workingTile = (x: number, y: number) => (u: Unit) => u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && u.loc.job.x === x && u.loc.job.y === y;

/** Units on a map tile, in key order (a new array). */
export function indexedUnitsAt(s: GameState, x: number, y: number): Unit[] {
  const ix = unitIndex(s);
  const k = ix ? tileKey(ix, x, y) : -1;
  const got = k >= 0 ? (ix!.onMap.get(k)?.slice() ?? []) : scan(s, onTile(x, y));
  return checked(s, `tile ${x},${y}`, got, onTile(x, y));
}

/** Units working in a colony, in key order (a new array). */
export function indexedColonyWorkers(s: GameState, colonyId: string): Unit[] {
  const ix = unitIndex(s);
  const got = ix ? (ix.inColony.get(colonyId)?.slice() ?? []) : scan(s, inColony(colonyId));
  return checked(s, `colony ${colonyId}`, got, inColony(colonyId));
}

/** How many units work in a colony. */
export function indexedColonyPopulation(s: GameState, colonyId: string): number {
  const ix = unitIndex(s);
  if (!ix || checks) return indexedColonyWorkers(s, colonyId).length;
  return ix.inColony.get(colonyId)?.length ?? 0;
}

/** Units aboard a carrier, in key order (a new array). */
export function indexedUnitsAboard(s: GameState, carrierId: string): Unit[] {
  const ix = unitIndex(s);
  const got = ix ? (ix.aboard.get(carrierId)?.slice() ?? []) : scan(s, aboard(carrierId));
  return checked(s, `carrier ${carrierId}`, got, aboard(carrierId));
}

/** Colony workers on a tile job at the tile, in key order (a new array). */
export function indexedTileWorkers(s: GameState, x: number, y: number): Unit[] {
  const ix = unitIndex(s);
  const k = ix ? tileKey(ix, x, y) : -1;
  const got = k >= 0 ? (ix!.worked.get(k)?.slice() ?? []) : scan(s, workingTile(x, y));
  return checked(s, `worked tile ${x},${y}`, got, workingTile(x, y));
}

/** The first colony worker (in key order) on a tile job at the tile, without copying. */
export function indexedTileWorker(s: GameState, x: number, y: number): Unit | undefined {
  const ix = unitIndex(s);
  const k = ix && !checks ? tileKey(ix, x, y) : -1;
  if (k >= 0) return ix!.worked.get(k)?.[0];
  return indexedTileWorkers(s, x, y)[0];
}

// Colonies by tile. Colonies are few and rarely founded or lost, so the index is rebuilt after
// each addColony or removeColony. A colony's x and y never change (read-only in types.ts).

interface ColonyIndex {
  width: number;
  height: number;
  byTile: Map<number, Colony>;
}

const colonyIndexes = new WeakMap<Colonies, ColonyIndex>();

function colonyIndex(s: GameState): ColonyIndex | undefined {
  let ix = colonyIndexes.get(s.colonies);
  if (ix && ix.width === s.map.width && ix.height === s.map.height) return ix;
  ix = { width: s.map.width, height: s.map.height, byTile: new Map() };
  for (const id in s.colonies) {
    if (INDEX_LIKE.test(id)) return undefined;
    const c = s.colonies[id];
    const k = colonyTileKey(ix, c.x, c.y);
    // The first colony in key order wins, as in the scan.
    if (k >= 0 && !ix.byTile.has(k)) ix.byTile.set(k, c);
  }
  colonyIndexes.set(s.colonies, ix);
  return ix;
}

function colonyTileKey(ix: ColonyIndex, x: number, y: number): number {
  return x >= 0 && y >= 0 && x < ix.width && y < ix.height && Number.isInteger(x) && Number.isInteger(y) ? y * ix.width + x : -1;
}

function scanColonyAt(s: GameState, x: number, y: number): Colony | undefined {
  for (const id in s.colonies) {
    const c = s.colonies[id];
    if (c.x === x && c.y === y) return c;
  }
  return undefined;
}

/** The colony on a tile (the first in key order, as the scan found it). */
export function indexedColonyAt(s: GameState, x: number, y: number): Colony | undefined {
  const ix = colonyIndex(s);
  const k = ix ? colonyTileKey(ix, x, y) : -1;
  const got = k >= 0 ? ix!.byTile.get(k) : scanColonyAt(s, x, y);
  if (checks && got !== scanColonyAt(s, x, y)) throw new Error(`Stale colony index at ${x},${y}`);
  return got;
}

/** Adds a colony to the state (or replaces the colony with its id). */
export function addColony(s: GameState, c: Colony): void {
  (s.colonies as Record<string, Colony>)[c.id] = c;
  colonyIndexes.delete(s.colonies);
}

/** Removes a colony from the state. */
export function removeColony(s: GameState, id: string): void {
  delete (s.colonies as Record<string, Colony>)[id];
  colonyIndexes.delete(s.colonies);
}
