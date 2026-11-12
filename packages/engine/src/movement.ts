import { gridOf, type Direction } from './grid.js';
import { fail } from './errors.js';
import { track } from './telemetry.js';
import { portProblem, sailToEurope } from './europe.js';
import { braveName, hostileBraveAt } from './braves.js';
import { resolveRumour } from './rumours.js';
import {
  cargoFree,
  colonyAt,
  inBounds,
  isShip,
  isWater,
  maxMoves,
  message,
  neighbours,
  reveal,
  settlementAt,
  sightRadius,
  tileAt,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAt,
} from './queries.js';
import { FOREST_MOVE_COST, RIVER_MOVE_COST, ROAD_MOVE_COST, TERRAIN } from './rules/terrain.js';
import { riverLinked } from './rivers.js';
import { TOOLS_PER_IMPROVEMENT, UNIT_TYPES } from './rules/units.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import type { Colony, GameState, ImprovementKind, Player, Tile, Unit } from './types.js';
import { mechanicsOf, nationTypeOf, term } from './scenarios/index.js';
import { colonyTiles, setUnitLoc, unitTiles, colonyList, unitList } from './unitindex.js';
import { kindOfId, systemsOfId } from './playerkind.js';
import { alliesOf, colonyOpenTo, isAllied } from './alliances.js';

export type MoveOption =
  | { kind: 'move' }
  | { kind: 'board'; carrierId: string }
  | { kind: 'disembark' }
  | { kind: 'attack'; targetUnitId?: string; colonyId?: string; settlementId?: string; braveId?: string }
  | { kind: 'settlement'; settlementId: string; actions: SettlementAction[] }
  | { kind: 'blocked'; reason: string };

export type SettlementAction = 'speak' | 'learn' | 'trade' | 'mission' | 'denounce' | 'incite' | 'attack';

export function canAttack(u: Unit): boolean {
  const def = UNIT_TYPES[u.type];
  return def.offence > 0 || u.role === 'soldier' || u.role === 'dragoon';
}

function isLandUnit(u: Unit): boolean {
  return !isShip(u);
}

export function moveCost(s: GameState, u: Unit, fx: number, fy: number, tx: number, ty: number, index?: MapIndex): number {
  if (isShip(u)) return 3;
  const from = tileAt(s, fx, fy)!;
  const to = tileAt(s, tx, ty)!;
  const w = s.map.width;
  const hasColony = (x: number, y: number) => (index ? index.colonies.has(y * w + x) : !!colonyAt(s, x, y));
  const cost = landStepCost(s, from, to, fx, fy, tx, ty, from.r || hasColony(fx, fy), to.r || hasColony(tx, ty));
  if (!knowsLand(s, u.owner)) return cost;
  const seen = landSeen(s, u.owner);
  return knowingStepCost(cost, to, u.owner, !seen || seen[ty * w + tx] === 1);
}

/**
 * Whether a player's land units know the land (native-nations.md T13): a playing people's, unless
 * the scenario switches the trait off on the people's nation type (`nationTypes.people.knowsLand`
 * false). European nations, companies and the Crown never do. Braves of peoples nobody plays keep
 * Beta 2's rule instead (braves.ts, `braveStepCost`: at river cost only while defending).
 */
export function knowsLand(s: GameState, owner: PlayerId): boolean {
  return kindOfId(owner) === 'people' && nationTypeOf(s, 'people').knowsLand !== false;
}

/**
 * Whether a unit of `owner` that knows the land (`knowsLand`) moves onto this tile as along a river:
 * the owner's own claimed land or land nobody claims (`seen`: where the scenario asks it, only land
 * the people has explored, `landSeen`), unless it is plowed. Another player's land
 * (a nation's colonies' claims, another people's towns' land) is not known.
 * Railroads, once they exist, end the knowledge too: check them here beside `p`.
 */
export function knownLand(tile: Tile, owner: PlayerId, seen = true): boolean {
  return !tile.p && (tile.claim === owner || (tile.claim === undefined && seen));
}

/**
 * Where a people that knows the land has been (Beta 3 step 10b, `mechanics.mapKnowledge.seen`): its
 * `explored` map, so land nobody claims is known only once seen, or null where the scenario does not
 * ask it (every tile of unclaimed land is known, as in step 5).
 */
export function landSeen(s: GameState, owner: PlayerId): ArrayLike<number> | null {
  const rules = mechanicsOf(s).mapKnowledge;
  if (!rules || !rules.seen) return null;
  return s.players.find((p) => p.id === owner)?.explored ?? null;
}

/**
 * A step's cost (`landStepCost`) for a unit that knows the land: at most RIVER_MOVE_COST onto known
 * land (`knownLand`, judged by the tile entered, as terrain is), so a road or a river, never dearer,
 * still wins. `moveCost` and the path search (`stepCost`) both use it.
 */
export function knowingStepCost(cost: number, to: Tile, owner: PlayerId, seen = true): number {
  return cost > RIVER_MOVE_COST && knownLand(to, owner, seen) ? RIVER_MOVE_COST : cost;
}

/**
 * Move points a step on land costs, between two neighbouring tiles: ROAD_MOVE_COST when both ends
 * have a road (`roadFrom`, `roadTo`: a road, or for a unit a colony), RIVER_MOVE_COST along a river
 * that links the two tiles (road and river do not add up), else the forest's or the terrain's cost.
 * Units (moveCost and the path search) and braves (braves.ts, braveStepCost) share it.
 */
export function landStepCost(s: GameState, from: Tile, to: Tile, fx: number, fy: number, tx: number, ty: number, roadFrom: boolean, roadTo: boolean): number {
  if (roadFrom && roadTo) return ROAD_MOVE_COST;
  // Along a river: as cheap as a road, and the two do not add up.
  if (to.rv && from.rv && riverLinked(s.map, fx, fy, tx, ty)) return RIVER_MOVE_COST;
  if (to.f) return FOREST_MOVE_COST;
  return TERRAIN[to.t].moveCost;
}

/** Tells the client what moving a unit one step in a direction would do. */
export function describeMove(s: GameState, unitId: string, dir: Direction): MoveOption {
  const u = s.units[unitId];
  if (!u) return { kind: 'blocked', reason: 'No such unit.' };
  const pos = unitPosition(s, u);
  if (!pos || (u.loc.kind !== 'map' && u.loc.kind !== 'carrier')) return { kind: 'blocked', reason: 'The unit is not on the map.' };
  if (u.moves <= 0) return { kind: 'blocked', reason: `${unitName(u)} has no moves left.` };
  if (u.work) return { kind: 'blocked', reason: `${unitName(u)} is busy working.` };
  if (u.repair) return { kind: 'blocked', reason: `${unitName(u)} is under repair for ${u.repair} more turns.` };
  const { x, y } = gridOf(s).step(pos.x, pos.y, dir);
  if (!inBounds(s, x, y)) return { kind: 'blocked', reason: 'The edge of the world.' };
  const tile = tileAt(s, x, y)!;
  const colony = colonyAt(s, x, y);
  const settlement = settlementAt(s, x, y);
  // Allies' units do not block, and their colonies are open (alliances.ts).
  const foreign = unitsAt(s, x, y).filter((o) => o.owner !== u.owner && !(s.treaties && isAllied(s, u.owner, o.owner)));
  const open = !!colony && colony.owner !== u.owner && !!s.treaties && colonyOpenTo(s, colony.owner, u.owner);

  if (isShip(u)) {
    if (colony) {
      if (colony.owner === u.owner || open) return { kind: 'move' };
      return canAttack(u) ? { kind: 'blocked', reason: 'Ships cannot attack colonies yet.' } : { kind: 'blocked', reason: `${colony.name} belongs to another nation.` };
    }
    if (settlement) {
      // Ships with cargo sell, ships with room buy.
      const actions: SettlementAction[] = UNIT_TYPES[u.type].cargo > 0 ? ['trade'] : [];
      return actions.length ? { kind: 'settlement', settlementId: settlement.id, actions } : { kind: 'blocked', reason: 'Natives live there.' };
    }
    if (!isWater(tile)) return { kind: 'blocked', reason: 'Ships cannot sail onto land.' };
    if (foreign.length) {
      return canAttack(u) ? { kind: 'attack', targetUnitId: foreign[0].id } : { kind: 'blocked', reason: 'Another ship is in the way.' };
    }
    return { kind: 'move' };
  }

  // Land units.
  if (isWater(tile)) {
    const ship = unitsAt(s, x, y).find((o) => o.owner === u.owner && isShip(o) && canCarry(s, o, u));
    if (ship) return { kind: 'board', carrierId: ship.id };
    if (UNIT_TYPES[u.type].kind === 'wagon') return { kind: 'blocked', reason: 'Wagon trains cannot board ships.' };
    if (u.type === 'treasure') return { kind: 'blocked', reason: 'Only an empty galleon can carry treasure.' };
    return { kind: 'blocked', reason: 'You need a ship with room to cross the water.' };
  }
  if (settlement) {
    const actions: SettlementAction[] = [];
    if (u.role === 'scout') actions.push('speak');
    if (UNIT_TYPES[u.type].kind === 'colonist' && u.role === 'none' && UNIT_TYPES[u.type].skill <= 0) actions.push('learn');
    if (UNIT_TYPES[u.type].kind === 'wagon') actions.push('trade');
    if (u.role === 'missionary') {
      if (mechanicsOf(s).missions) {
        if (!settlement.mission) actions.push('mission');
        else if (settlement.mission !== u.owner) actions.push('denounce');
      }
      if (s.players.some((p) => p.id !== u.owner && p.id !== 'crown')) actions.push('incite');
    }
    if (canAttack(u)) actions.push('attack');
    if (!actions.length) return { kind: 'blocked', reason: 'Only scouts, colonists, missionaries, wagon trains and soldiers can visit natives.' };
    return { kind: 'settlement', settlementId: settlement.id, actions };
  }
  if (colony && colony.owner !== u.owner && !open) {
    return canAttack(u) ? { kind: 'attack', colonyId: colony.id } : { kind: 'blocked', reason: `${colony.name} belongs to another nation.` };
  }
  // Braves of a tribe at peace step aside; hostile ones must be fought.
  const brave = !colony ? hostileBraveAt(s, u.owner, x, y) : undefined;
  if (brave) {
    return canAttack(u) ? { kind: 'attack', braveId: brave.id } : { kind: 'blocked', reason: `A hostile ${braveName(s, brave)} is in the way.` };
  }
  if (foreign.length) {
    return canAttack(u) ? { kind: 'attack', targetUnitId: foreign[0].id } : { kind: 'blocked', reason: 'Foreign units block the way.' };
  }
  if (u.loc.kind === 'carrier') {
    const carrier = s.units[u.loc.carrierId];
    const carrierPos = carrier && unitPosition(s, carrier);
    if (carrierPos && isWater(tileAt(s, carrierPos.x, carrierPos.y))) return { kind: 'disembark' };
  }
  return { kind: 'move' };
}

/** Whether a ship has room for a unit; treasure needs a whole galleon. */
export function canCarry(s: GameState, ship: Unit, u: Unit): boolean {
  if (UNIT_TYPES[u.type].kind === 'wagon' || isShip(u) || ship.repair) return false;
  if (u.type === 'treasure') return ship.type === 'galleon' && cargoFree(s, ship) >= UNIT_TYPES.galleon.cargo;
  return cargoFree(s, ship) > 0;
}

export function placeOnMap(s: GameState, u: Unit, x: number, y: number): void {
  setUnitLoc(s, u, { kind: 'map', x, y });
  reveal(s, u.owner, x, y, sightRadius(u, s));
  for (const p of unitsAboard(s, u)) reveal(s, p.owner, x, y, sightRadius(p, s));
}

export function moveUnit(s: GameState, unitId: string, dir: Direction): void {
  const option = describeMove(s, unitId, dir);
  const u = s.units[unitId];
  if (option.kind !== 'blocked' && option.kind !== 'attack' && option.kind !== 'settlement') {
    track(u.owner, 'cmd:move');
    if (UNIT_TYPES[u.type].kind === 'wagon') track(u.owner, 'wagon:moves');
  }
  const pos = unitPosition(s, u)!;
  const { x, y } = gridOf(s).step(pos.x, pos.y, dir);
  switch (option.kind) {
    case 'blocked':
      fail(option.reason);
    case 'attack':
    case 'settlement':
      fail('Choose what to do there first.');
    case 'board':
      setUnitLoc(s, u, { kind: 'carrier', carrierId: option.carrierId });
      u.moves = 0;
      u.state = 'sentry';
      return;
    case 'disembark':
      placeOnMap(s, u, x, y);
      u.moves = 0;
      u.state = 'active';
      afterLandMove(s, u, x, y);
      return;
    case 'move': {
      const cost = moveCost(s, u, pos.x, pos.y, x, y);
      placeOnMap(s, u, x, y);
      u.moves = Math.max(0, u.moves - cost);
      u.state = 'active';
      if (isLandUnit(u)) afterLandMove(s, u, x, y);
      return;
    }
  }
}

function afterLandMove(s: GameState, u: Unit, x: number, y: number): void {
  const tile = tileAt(s, x, y)!;
  // A playing people's units leave the Lost City Rumours alone (playerkind.ts `rumours`).
  if (tile.lcr && systemsOfId(u.owner).rumours) {
    delete tile.lcr;
    resolveRumour(s, u);
  }
}

/** Boards a ship that shares the unit's colony square. */
export function boardShip(s: GameState, unitId: string, carrierId: string): void {
  const u = s.units[unitId];
  const ship = s.units[carrierId];
  if (!ship || !isShip(ship) || ship.owner !== u.owner) fail('No such ship.');
  if (UNIT_TYPES[u.type].kind === 'wagon' || isShip(u)) fail('That unit cannot board ships.');
  const up = unitPosition(s, u);
  const sp = unitPosition(s, ship);
  if (!up || !sp || up.x !== sp.x || up.y !== sp.y || u.loc.kind !== 'map') fail('The unit must be next to the ship in port.');
  if (!canCarry(s, ship, u)) fail(u.type === 'treasure' ? 'Only an empty galleon can carry treasure.' : 'The ship is full.');
  setUnitLoc(s, u, { kind: 'carrier', carrierId });
  u.state = 'sentry';
  track(u.owner, 'cmd:board');
}

/** Leaves a ship docked in a colony (or in Europe, handled elsewhere). */
export function leaveShip(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'carrier') fail('The unit is not aboard a ship.');
  const ship = s.units[u.loc.carrierId];
  if (ship.loc.kind !== 'map' || !colonyAt(s, ship.loc.x, ship.loc.y)) fail('Units can only leave a ship in port; move onto land instead.');
  setUnitLoc(s, u, { kind: 'map', x: ship.loc.x, y: ship.loc.y });
  u.state = 'active';
  track(u.owner, 'cmd:unboard');
}

/** Can the unit stand on this tile while pathing (ignoring move points)? */
/** Who occupies which tile, built once per search so pathfinding does not rescan every unit for every tile. */
export interface MapIndex {
  colonies: Map<number, string>;
  settlements: Set<number>;
  /** Owners of units standing on each tile. */
  units: Map<number, Set<string>>;
  /** Tribes whose braves stand on each tile (routes avoid hostile ones). Missing in indexes built elsewhere. */
  braves?: Map<number, TribeId[]>;
}

export function buildMapIndex(s: GameState): MapIndex {
  const w = s.map.width;
  const index: MapIndex = { colonies: new Map(), settlements: new Set(), units: new Map() };
  for (const c of colonyList(s)) index.colonies.set(c.y * w + c.x, c.owner);
  for (const id in s.settlements) {
    const st = s.settlements[id];
    index.settlements.add(st.y * w + st.x);
  }
  for (const u of unitList(s)) {
    if (u.loc.kind !== 'map') continue;
    const i = u.loc.y * w + u.loc.x;
    let owners = index.units.get(i);
    if (!owners) index.units.set(i, (owners = new Set()));
    owners.add(u.owner);
  }
  const braves = new Map<number, TribeId[]>();
  for (const b of Object.values(s.braves ?? {})) {
    const i = b.y * w + b.x;
    const list = braves.get(i);
    if (list) list.push(b.tribe);
    else braves.set(i, [b.tribe]);
  }
  index.braves = braves;
  return index;
}

/**
 * What a path search needs of the map's occupants. Answers as buildMapIndex's MapIndex would, but
 * the units and colonies come from the live indexes (unitindex.ts), so only settlements and braves
 * are gathered per search.
 */
interface PathIndex {
  /** The colony on each tile (its owner read live). */
  colonies: ReadonlyMap<number, Colony>;
  settlements: Set<number>;
  /** Units standing on each tile. */
  units: ReadonlyMap<number, readonly Unit[]>;
  /** Tribes whose braves stand on each tile. */
  braves: Map<number, TribeId[]>;
  /** Tiles with any of the above have `occupied[i] === gen`, tiles with a colony `colony[i] === gen`, so empty tiles skip the lookups. */
  occupied: Uint32Array;
  colony: Uint32Array;
  gen: number;
}

// Stamps for PathIndex, reused between searches as the search buffers are.
let occupiedStamp = new Uint32Array(0);
let colonyStamp = new Uint32Array(0);
let stampGen = 0;

function pathIndex(s: GameState): PathIndex {
  const w = s.map.width;
  const size = w * s.map.height;
  if (occupiedStamp.length !== size || stampGen >= 0xfffffff0) {
    occupiedStamp = new Uint32Array(size);
    colonyStamp = new Uint32Array(size);
    stampGen = 0;
  }
  const gen = ++stampGen;
  const occupied = occupiedStamp;
  const settlements = new Set<number>();
  for (const id in s.settlements) {
    const st = s.settlements[id];
    const i = st.y * w + st.x;
    settlements.add(i);
    occupied[i] = gen;
  }
  const braves = new Map<number, TribeId[]>();
  const all = s.braves;
  if (all) {
    for (const id in all) {
      const b = all[id];
      const i = b.y * w + b.x;
      const list = braves.get(i);
      if (list) list.push(b.tribe);
      else braves.set(i, [b.tribe]);
      occupied[i] = gen;
    }
  }
  const colonies = colonyTiles(s);
  for (const i of colonies.keys()) {
    occupied[i] = gen;
    colonyStamp[i] = gen;
  }
  const units = unitTiles(s);
  for (const i of units.keys()) occupied[i] = gen;
  return { colonies, settlements, units, braves, occupied, colony: colonyStamp, gen };
}

function passable(s: GameState, ctx: SearchContext, x: number, y: number, isGoal: boolean, index: PathIndex): boolean {
  if (!inBounds(s, x, y)) return false;
  return passableAt(s, ctx, y * s.map.width + x, isGoal, index);
}

/** What a path search needs to know about the unit, worked out once per search. */
interface SearchContext {
  owner: Unit['owner'];
  ship: boolean;
  /** The owner's player record (looked up as `player` would, failing only when needed). */
  player: Player | undefined;
  /** Tribes at war with the owner. */
  war: Set<TribeId>;
  /** Allies whose colonies are open to the owner and whose units do not block it (alliances.ts); null without any. */
  allies: Set<string> | null;
  /** Whether the owner's land units know the land (`knowsLand`, T13), so steps cost as `moveCost` says. */
  knowsLand: boolean;
  /** Where the owner has been, when unclaimed land is known only once seen (`landSeen`); null otherwise. */
  seen: ArrayLike<number> | null;
}

function searchContext(s: GameState, u: Unit): SearchContext {
  const war = new Set<TribeId>();
  const seen = new Set<TribeId>();
  // The first tribe of each id counts, as with s.tribes.find.
  for (const t of s.tribes) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    if (t.stance[u.owner] === 'war') war.add(t.id);
  }
  const allies = s.treaties ? alliesOf(s, u.owner).filter((a) => colonyOpenTo(s, a, u.owner)) : [];
  return { owner: u.owner, ship: isShip(u), player: s.players.find((p) => p.id === u.owner), war, allies: allies.length ? new Set(allies) : null, knowsLand: knowsLand(s, u.owner), seen: landSeen(s, u.owner) };
}

/** Whether the unit can stand on the tile with map index `i` (on the map) while pathing. */
function passableAt(s: GameState, ctx: SearchContext, i: number, isGoal: boolean, index: PathIndex): boolean {
  const tile = s.map.tiles[i];
  if (!tile) return false;
  let colonyOwner: string | undefined;
  if (index.occupied[i] === index.gen) {
    colonyOwner = index.colonies.get(i)?.owner;
    // An ally's colony is open, as one's own.
    if (colonyOwner && ctx.allies?.has(colonyOwner)) colonyOwner = ctx.owner;
    if (colonyOwner && colonyOwner !== ctx.owner) return false;
    if (index.settlements.has(i)) return false;
    // Any other nation's unit on the tile blocks it, but an ally's.
    const here = index.units.get(i);
    if (here) for (const v of here) if (v.owner !== ctx.owner && !ctx.allies?.has(v.owner)) return false;
    const tribes = isGoal ? undefined : index.braves.get(i);
    if (tribes) for (const t of tribes) if (ctx.war.has(t)) return false;
  }
  // People can only route through land they have seen; the AI knows the map.
  const owner = ctx.player;
  if (!owner) throw new Error(`No player ${ctx.owner}`);
  if (owner.human && !owner.explored[i] && !isGoal) return false;
  const water = TERRAIN[tile.t].water;
  if (ctx.ship) return water || colonyOwner === ctx.owner;
  return !water;
}

/** moveCost for a search: from tile `fi` to the neighbouring tile `ti`, both on the map. */
function stepCost(s: GameState, ctx: SearchContext, fi: number, ti: number, fx: number, fy: number, tx: number, ty: number, index: PathIndex): number {
  if (ctx.ship) return 3;
  const from = s.map.tiles[fi];
  const to = s.map.tiles[ti];
  const cost = landStepCost(s, from, to, fx, fy, tx, ty, from.r || index.colony[fi] === index.gen, to.r || index.colony[ti] === index.gen);
  return ctx.knowsLand ? knowingStepCost(cost, to, ctx.owner, !ctx.seen || ctx.seen[ti] === 1) : cost;
}

/**
 * Whether the goal has a neighbour the unit could ever stand on: the start, or for a ship water or
 * one of its owner's colonies, for anyone else land (passableAt allows no other tiles). Without
 * one the search cannot reach the goal, and would only find that out after visiting every tile it
 * can reach (a ship sent to an inland colony searched the whole ocean).
 */
function approachable(s: GameState, ctx: SearchContext, startIdx: number, tx: number, ty: number, index: PathIndex): boolean {
  const w = s.map.width;
  const h = s.map.height;
  const near = gridOf(s).neighbourOffsets(tx, ty);
  for (let k = 0; k < near.length; k += 2) {
    const nx = tx + near[k];
    const ny = ty + near[k + 1];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const i = ny * w + nx;
    if (i === startIdx) return true;
    const tile = s.map.tiles[i];
    if (!tile) continue;
    const water = TERRAIN[tile.t].water;
    if (ctx.ship ? water || index.colonies.get(i)?.owner === ctx.owner : !water) return true;
  }
  return false;
}

// Search buffers, reused between path searches: a tile's cost and previous tile count only when
// its stamp is the current search's, so nothing is cleared between searches.
let searchSize = 0;
let searchCost = new Float64Array(0);
let searchPrev = new Int32Array(0);
let searchSeen = new Uint32Array(0);
let searchDone = new Uint32Array(0);
let searchGen = 0;
// The open list: a binary heap of keys (estimate * 2^32 + insertion number, exact in a double
// because move costs and estimates are whole numbers) and their tiles.
let heapKey = new Float64Array(1024);
let heapTile = new Int32Array(1024);
const SEQ = 4294967296;

function searchBuffers(size: number): number {
  if (size !== searchSize || searchGen >= 0xfffffff0) {
    searchSize = size;
    searchCost = new Float64Array(size);
    searchPrev = new Int32Array(size);
    searchSeen = new Uint32Array(size);
    searchDone = new Uint32Array(size);
    searchGen = 0;
  }
  return ++searchGen;
}

/**
 * Cheapest route by move points; returns the steps after the start, or null.
 * A* with a binary heap ordered by estimate, then by insertion: the same order in which a plain
 * list scanned for its first lowest estimate gives up its entries, so routes are unchanged.
 */
export function findPath(s: GameState, u: Unit, tx: number, ty: number): { x: number; y: number }[] | null {
  const start = unitPosition(s, u);
  if (!start) return null;
  if (start.x === tx && start.y === ty) return [];
  const index = pathIndex(s);
  const ctx = searchContext(s, u);
  if (!passable(s, ctx, tx, ty, true, index)) return null;
  const w = s.map.width;
  const h = s.map.height;
  const grid = gridOf(s);
  if (!approachable(s, ctx, start.y * w + start.x, tx, ty, index)) return null;
  const gen = searchBuffers(w * h);
  const cost = searchCost;
  const prev = searchPrev;
  const seen = searchSeen;
  const done = searchDone;
  const startIdx = start.y * w + start.x;
  const goalIdx = ty * w + tx;
  seen[startIdx] = gen;
  cost[startIdx] = 0;
  prev[startIdx] = -1;
  // The heap is ordered by estimate, then by insertion: the same order in which a plain list
  // scanned for its first lowest estimate gives up its entries, so routes are unchanged.
  let keys = heapKey;
  let tiles = heapTile;
  keys[0] = 0;
  tiles[0] = startIdx;
  let size = 1;
  let seq = 1;
  let reached = false;
  while (size > 0) {
    // Pop the smallest key.
    const idx = tiles[0];
    size--;
    if (size > 0) {
      const k = keys[size];
      const t = tiles[size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= size) break;
        const r = l + 1;
        const m = r < size && keys[r] < keys[l] ? r : l;
        if (keys[m] >= k) break;
        keys[i] = keys[m];
        tiles[i] = tiles[m];
        i = m;
      }
      keys[i] = k;
      tiles[i] = t;
    }
    if (idx === goalIdx) break;
    if (done[idx] === gen) continue;
    done[idx] = gen;
    const cx = idx % w;
    const cy = (idx - cx) / w;
    const near = grid.neighbourOffsets(cx, cy);
    for (let d = 0; d < near.length; d += 2) {
      const nx = cx + near[d];
      const ny = cy + near[d + 1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (done[nIdx] === gen) continue;
      // Both tests only read the state, so the cheaper cost test goes first.
      const c = cost[idx] + stepCost(s, ctx, idx, nIdx, cx, cy, nx, ny, index);
      if (seen[nIdx] === gen && c >= cost[nIdx]) continue;
      if (!passableAt(s, ctx, nIdx, nIdx === goalIdx, index)) continue;
      {
        seen[nIdx] = gen;
        cost[nIdx] = c;
        prev[nIdx] = idx;
        if (nIdx === goalIdx) reached = true;
        // Push.
        if (size === keys.length) {
          const k2 = new Float64Array(size * 2);
          k2.set(keys);
          const t2 = new Int32Array(size * 2);
          t2.set(tiles);
          keys = heapKey = k2;
          tiles = heapTile = t2;
        }
        const key = (c + grid.distance(nx, ny, tx, ty)) * SEQ + seq++;
        let i = size++;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (keys[parent] <= key) break;
          keys[i] = keys[parent];
          tiles[i] = tiles[parent];
          i = parent;
        }
        keys[i] = key;
        tiles[i] = nIdx;
      }
    }
  }
  if (!reached) return null;
  const path: { x: number; y: number }[] = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    path.push({ x: cur % w, y: Math.floor(cur / w) });
    cur = prev[cur];
  }
  return path.reverse();
}

/** Nearest high-seas tile a ship can reach. */
export function nearestHighSeas(s: GameState, ship: Unit): { x: number; y: number } | null {
  const start = unitPosition(s, ship);
  if (!start) return null;
  const w = s.map.width;
  const index = pathIndex(s);
  const ctx = searchContext(s, ship);
  const seen = new Set([start.y * w + start.x]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    if (s.map.tiles[p.y * w + p.x].t === 'highSeas' && !index.colonies.has(p.y * w + p.x)) return p;
    for (const n of neighbours(s, p.x, p.y)) {
      const i = n.y * w + n.x;
      if (seen.has(i) || !passable(s, ctx, n.x, n.y, true, index)) continue;
      seen.add(i);
      queue.push(n);
    }
  }
  return null;
}

/**
 * Gives a unit on the map a destination and moves it along. `found` is a route to the destination
 * tile that the caller has just found with findPath, with nothing changed since: it saves a
 * second search.
 */
export function setDestination(s: GameState, unitId: string, dest: Unit['dest'], found?: { x: number; y: number }[]): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'map') fail('Only units on the map can be given orders.');
  if (dest && 'europe' in dest && !isShip(u)) fail(`Only ships can sail to ${term(s, 'homeland')}.`);
  if (dest && 'europe' in dest && dest.port) {
    if (dest.port === u.owner) dest = { europe: true };
    else {
      const problem = portProblem(s, u.owner, dest.port);
      if (problem) fail(problem);
    }
  }
  const path = dest && 'x' in dest ? found ?? findPath(s, u, dest.x, dest.y) : null;
  if (dest && 'x' in dest && !path) fail('There is no known route there.');
  delete u.roadTo;
  // A copy: callers pass tiles, jobs and goals that other parts of the state hold (see GameState).
  u.dest = dest && { ...dest };
  u.state = 'active';
  track(u.owner, dest && 'europe' in dest ? 'cmd:gotoEurope' : 'cmd:goto');
  continueOrders(s, u, path && dest && 'x' in dest ? pathHint(u, dest, path) : undefined);
}

/** Sends a unit on the map to a tile if it can find a route there; false when it cannot. One search. */
export function goTo(s: GameState, u: Unit, x: number, y: number): boolean {
  const path = findPath(s, u, x, y);
  if (!path) return false;
  setDestination(s, u.id, { x, y }, path);
  return true;
}

/**
 * A route a caller has just searched for, handed to continueOrders so that its first step does
 * not search again. Only valid while nothing has changed since the search.
 */
export interface PathHint {
  from: { x: number; y: number };
  to: { x: number; y: number };
  path: { x: number; y: number }[];
}

/** A hint for the path a unit on the map has just found to a tile. */
export function pathHint(u: Unit, to: { x: number; y: number }, path: { x: number; y: number }[]): PathHint | undefined {
  return u.loc.kind === 'map' ? { from: { x: u.loc.x, y: u.loc.y }, to: { x: to.x, y: to.y }, path } : undefined;
}

/**
 * Moves a unit along its standing orders as far as its moves allow. `hint` is a route the caller
 * has just found, from where the unit stands to its destination, with nothing changed since.
 * A route once found is followed for the rest of the call; it is searched again only when its
 * next step is blocked (by a unit, a colony, newly seen land or water) or the unit is not where
 * the route expects.
 */
export function continueOrders(s: GameState, u: Unit, hint?: PathHint): void {
  let guard = 64;
  let path: { x: number; y: number }[] | null =
    hint && u.loc.kind === 'map' && hint.from.x === u.loc.x && hint.from.y === u.loc.y ? hint.path : null;
  let pathTo: { x: number; y: number } | null = path ? hint!.to : null;
  // Where the route is followed from: path[step] is the next tile.
  let step = 0;
  // Whether the route was found in this step (a blocked fresh route waits for next turn).
  let fresh = !!path;
  while (u.dest && u.moves > 0 && u.loc.kind === 'map' && guard-- > 0) {
    let target: { x: number; y: number } | null;
    if ('europe' in u.dest) {
      const tile = tileAt(s, u.loc.x, u.loc.y)!;
      if (tile.t === 'highSeas' && !colonyAt(s, u.loc.x, u.loc.y)) {
        sailToEurope(s, u.id, u.dest.port && !portProblem(s, u.owner, u.dest.port) ? u.dest.port : undefined);
        return;
      }
      // The high seas found at the start are kept while the route there holds.
      target = path && pathTo ? pathTo : nearestHighSeas(s, u);
    } else {
      target = u.dest;
    }
    if (!target) {
      delete u.dest;
      message(s, `${unitName(u)} cannot find a route.`, u.owner, unitPosition(s, u));
      return;
    }
    if (u.loc.x === target.x && u.loc.y === target.y) {
      if (!('europe' in u.dest)) delete u.dest;
      path = null;
      continue;
    }
    if (!path || !pathTo || pathTo.x !== target.x || pathTo.y !== target.y || step >= path.length) {
      path = findPath(s, u, target.x, target.y);
      pathTo = { x: target.x, y: target.y };
      step = 0;
      fresh = true;
      if (!path || !path.length) {
        delete u.dest;
        return;
      }
    }
    const next = path[step];
    const grid = gridOf(s);
    const dir = grid.directionTowards(u.loc.x, u.loc.y, next.x, next.y)!;
    const option = grid.distance(u.loc.x, u.loc.y, next.x, next.y) === 1 ? describeMove(s, u.id, dir) : null;
    if (option?.kind !== 'move') {
      // Something got in the way of a route found earlier: search again from here. A route found
      // just now that is blocked waits for next turn.
      if (fresh) return;
      path = null;
      continue;
    }
    fresh = false;
    moveUnit(s, u.id, dir);
    step++;
    if ((u.loc as Unit['loc']).kind !== 'map' || u.loc.x !== next.x || u.loc.y !== next.y) path = null;
  }
}

/** Whether a pioneer may be sent to build a road to a tile; the reason when not. */
export function canRoadTo(s: GameState, u: Unit, x: number, y: number): string | null {
  if (u.role !== 'pioneer' || u.tools < TOOLS_PER_IMPROVEMENT) return 'Only pioneers with tools can build roads.';
  if (u.loc.kind !== 'map') return 'The pioneer must be on land.';
  const tile = tileAt(s, x, y);
  if (!tile || isWater(tile)) return 'Roads can only be built on land.';
  if (!findPath(s, u, x, y)) return 'There is no known route there.';
  return null;
}

/** Gives a pioneer the "Road to…" order and starts on it. */
export function setRoadTo(s: GameState, unitId: string, x: number, y: number): void {
  const u = s.units[unitId];
  const reason = canRoadTo(s, u, x, y);
  if (reason) fail(reason);
  delete u.dest;
  delete u.route;
  delete u.work;
  u.roadTo = { x, y };
  u.state = 'active';
  track(u.owner, 'cmd:roadTo');
  continueRoadTo(s, u);
}

/**
 * Carries on a "Road to…" order: build the road on this tile if it has none, otherwise step along
 * the cheapest path (planned afresh each time) and repeat while moves remain. Ends with a report
 * when the road is finished, or when tools, the way or the pioneer give out.
 */
export function continueRoadTo(s: GameState, u: Unit): void {
  let guard = 64;
  const stop = (why: string) => {
    delete u.roadTo;
    message(s, `${unitName(u)} stops building the road: ${why}`, u.owner, unitPosition(s, u));
  };
  while (u.roadTo && u.loc.kind === 'map' && !u.work && u.moves > 0 && guard-- > 0) {
    const { x: tx, y: ty } = u.roadTo;
    const here = { x: u.loc.x, y: u.loc.y };
    const tile = tileAt(s, here.x, here.y)!;
    const roaded = tile.r || !!colonyAt(s, here.x, here.y);
    if (roaded && here.x === tx && here.y === ty) {
      delete u.roadTo;
      message(s, `Road finished to ${tx},${ty}.`, u.owner, here);
      return;
    }
    if (!roaded) {
      const reason = canImprove(s, u, 'road');
      if (reason) return stop(u.role !== 'pioneer' || u.tools < TOOLS_PER_IMPROVEMENT ? 'out of tools.' : reason);
      startImprovement(s, u.id, 'road');
      return;
    }
    const path = findPath(s, u, tx, ty);
    if (!path || !path.length) return stop('the target cannot be reached.');
    const dir = gridOf(s).directionTowards(here.x, here.y, path[0].x, path[0].y)!;
    if (describeMove(s, u.id, dir).kind !== 'move') return stop('the way is blocked.');
    moveUnit(s, u.id, dir);
  }
}

export const IMPROVEMENT_TURNS: Record<ImprovementKind, number> = { plow: 5, road: 3, clear: 6 };

export function canImprove(s: GameState, u: Unit, kind: ImprovementKind): string | null {
  if (u.role !== 'pioneer' || u.tools < TOOLS_PER_IMPROVEMENT) return 'Only pioneers with tools can improve land.';
  if (u.loc.kind !== 'map') return 'The pioneer must be on land.';
  const tile = tileAt(s, u.loc.x, u.loc.y)!;
  if (isWater(tile)) return 'The pioneer must be on land.';
  if (u.moves <= 0) return 'The pioneer has no moves left.';
  if (kind === 'plow') {
    if (tile.f) return 'Clear the forest first.';
    if (tile.p) return 'Already plowed.';
    if (tile.t === 'hills' || tile.t === 'mountains' || tile.t === 'arctic') return 'This land cannot be plowed.';
  }
  if (kind === 'clear' && !tile.f) return 'There is no forest here.';
  if (kind === 'road' && (tile.r || colonyAt(s, u.loc.x, u.loc.y))) return 'There is already a road.';
  return null;
}

export function startImprovement(s: GameState, unitId: string, kind: ImprovementKind): void {
  const u = s.units[unitId];
  const reason = canImprove(s, u, kind);
  if (reason) fail(reason);
  const turns = IMPROVEMENT_TURNS[kind];
  u.work = { kind, turnsLeft: u.type === 'hardyPioneer' ? Math.ceil(turns / 2) : turns };
  track(u.owner, 'cmd:improve');
  u.moves = 0;
  delete u.dest;
}

/** Advances pioneer work at the start of the owner's turn. */
export function advanceWork(s: GameState, u: Unit): void {
  if (!u.work || u.loc.kind !== 'map') return;
  const at = { x: u.loc.x, y: u.loc.y };
  u.work.turnsLeft--;
  u.moves = 0;
  if (u.work.turnsLeft > 0) return;
  const tile = tileAt(s, at.x, at.y)!;
  const kind = u.work.kind;
  delete u.work;
  if (kind === 'plow') tile.p = true;
  if (kind === 'road') tile.r = true;
  track(u.owner, kind === 'plow' ? 'land:plowed' : kind === 'road' ? 'land:road built' : 'land:forest cleared');
  if (kind === 'clear') {
    delete tile.f;
    const grid = gridOf(s);
    const colony = colonyList(s).find((c) => c.owner === u.owner && grid.distance(c.x, c.y, at.x, at.y) <= grid.workRadius);
    if (colony) {
      colony.goods.lumber += 20;
      message(s, `Clearing the forest brought 20 lumber to ${colony.name}.`, u.owner, colony);
    }
  }
  u.tools -= TOOLS_PER_IMPROVEMENT;
  if (u.tools <= 0) {
    u.tools = 0;
    u.role = 'none';
    message(s, 'A pioneer has used up all of their tools.', u.owner, at);
  }
  u.moves = maxMoves(u, s);
}
