import { fail } from './errors.js';
import { track } from './telemetry.js';
import { portProblem, sailToEurope } from './europe.js';
import { resolveRumour } from './rumours.js';
import {
  cargoFree,
  colonyAt,
  dirOffset,
  distance,
  inBounds,
  isShip,
  isWater,
  maxMoves,
  message,
  neighbours,
  player,
  reveal,
  settlementAt,
  sightRadius,
  tileAt,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAt,
  type Direction,
} from './queries.js';
import { FOREST_MOVE_COST, RIVER_MOVE_COST, ROAD_MOVE_COST, TERRAIN } from './rules/terrain.js';
import { riverLinked } from './rivers.js';
import { TOOLS_PER_IMPROVEMENT, UNIT_TYPES } from './rules/units.js';
import type { GameState, ImprovementKind, Unit } from './types.js';

export type MoveOption =
  | { kind: 'move' }
  | { kind: 'board'; carrierId: string }
  | { kind: 'disembark' }
  | { kind: 'attack'; targetUnitId?: string; colonyId?: string; settlementId?: string }
  | { kind: 'settlement'; settlementId: string; actions: SettlementAction[] }
  | { kind: 'blocked'; reason: string };

export type SettlementAction = 'speak' | 'learn' | 'trade' | 'mission' | 'attack';

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
  const roadFrom = from.r || hasColony(fx, fy);
  const roadTo = to.r || hasColony(tx, ty);
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
  const { dx, dy } = dirOffset(dir);
  const x = pos.x + dx;
  const y = pos.y + dy;
  if (!inBounds(s, x, y)) return { kind: 'blocked', reason: 'The edge of the world.' };
  const tile = tileAt(s, x, y)!;
  const colony = colonyAt(s, x, y);
  const settlement = settlementAt(s, x, y);
  const foreign = unitsAt(s, x, y).filter((o) => o.owner !== u.owner);

  if (isShip(u)) {
    if (colony) {
      if (colony.owner === u.owner) return { kind: 'move' };
      return canAttack(u) ? { kind: 'blocked', reason: 'Ships cannot attack colonies yet.' } : { kind: 'blocked', reason: `${colony.name} belongs to another nation.` };
    }
    if (settlement) {
      const actions: SettlementAction[] = hasCargo(u) ? ['trade'] : [];
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
    if (UNIT_TYPES[u.type].kind === 'wagon' && hasCargo(u)) actions.push('trade');
    if (u.role === 'missionary') actions.push('mission');
    if (canAttack(u)) actions.push('attack');
    if (!actions.length) return { kind: 'blocked', reason: 'Only scouts, colonists, missionaries, wagon trains and soldiers can visit natives.' };
    return { kind: 'settlement', settlementId: settlement.id, actions };
  }
  if (colony && colony.owner !== u.owner) {
    return canAttack(u) ? { kind: 'attack', colonyId: colony.id } : { kind: 'blocked', reason: `${colony.name} belongs to another nation.` };
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

function hasCargo(u: Unit): boolean {
  return Object.values(u.cargo ?? {}).some((n) => (n ?? 0) > 0);
}

export function placeOnMap(s: GameState, u: Unit, x: number, y: number): void {
  u.loc = { kind: 'map', x, y };
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
  const { dx, dy } = dirOffset(dir);
  const x = pos.x + dx;
  const y = pos.y + dy;
  switch (option.kind) {
    case 'blocked':
      fail(option.reason);
    case 'attack':
    case 'settlement':
      fail('Choose what to do there first.');
    case 'board':
      u.loc = { kind: 'carrier', carrierId: option.carrierId };
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
  if (tile.lcr) {
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
  u.loc = { kind: 'carrier', carrierId };
  u.state = 'sentry';
  track(u.owner, 'cmd:board');
}

/** Leaves a ship docked in a colony (or in Europe, handled elsewhere). */
export function leaveShip(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'carrier') fail('The unit is not aboard a ship.');
  const ship = s.units[u.loc.carrierId];
  if (ship.loc.kind !== 'map' || !colonyAt(s, ship.loc.x, ship.loc.y)) fail('Units can only leave a ship in port; move onto land instead.');
  u.loc = { kind: 'map', x: ship.loc.x, y: ship.loc.y };
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
}

export function buildMapIndex(s: GameState): MapIndex {
  const w = s.map.width;
  const index: MapIndex = { colonies: new Map(), settlements: new Set(), units: new Map() };
  for (const c of Object.values(s.colonies)) index.colonies.set(c.y * w + c.x, c.owner);
  for (const st of Object.values(s.settlements)) index.settlements.add(st.y * w + st.x);
  for (const u of Object.values(s.units)) {
    if (u.loc.kind !== 'map') continue;
    const i = u.loc.y * w + u.loc.x;
    let owners = index.units.get(i);
    if (!owners) index.units.set(i, (owners = new Set()));
    owners.add(u.owner);
  }
  return index;
}

function passable(s: GameState, u: Unit, x: number, y: number, isGoal: boolean, index: MapIndex): boolean {
  const tile = tileAt(s, x, y);
  if (!tile) return false;
  const i = y * s.map.width + x;
  const colonyOwner = index.colonies.get(i);
  if (colonyOwner && colonyOwner !== u.owner) return false;
  if (index.settlements.has(i)) return false;
  const owners = index.units.get(i);
  if (owners && [...owners].some((o) => o !== u.owner)) return false;
  // People can only route through land they have seen; the AI knows the map.
  const owner = player(s, u.owner);
  if (owner.human && !owner.explored[i] && !isGoal) return false;
  if (isShip(u)) return isWater(tile) || colonyOwner === u.owner;
  return !isWater(tile);
}

/** Cheapest route by move points; returns the steps after the start, or null. */
export function findPath(s: GameState, u: Unit, tx: number, ty: number): { x: number; y: number }[] | null {
  const start = unitPosition(s, u);
  if (!start) return null;
  if (start.x === tx && start.y === ty) return [];
  const index = buildMapIndex(s);
  if (!passable(s, u, tx, ty, true, index)) return null;
  const w = s.map.width;
  const startIdx = start.y * w + start.x;
  const goalIdx = ty * w + tx;
  const cost = new Map<number, number>([[startIdx, 0]]);
  const prev = new Map<number, number>();
  const open: { idx: number; f: number }[] = [{ idx: startIdx, f: 0 }];
  const closed = new Set<number>();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { idx } = open.splice(bi, 1)[0];
    if (idx === goalIdx) break;
    if (closed.has(idx)) continue;
    closed.add(idx);
    const cx = idx % w;
    const cy = Math.floor(idx / w);
    for (const n of neighbours(s, cx, cy)) {
      const nIdx = n.y * w + n.x;
      if (closed.has(nIdx)) continue;
      if (!passable(s, u, n.x, n.y, nIdx === goalIdx, index)) continue;
      const c = cost.get(idx)! + moveCost(s, u, cx, cy, n.x, n.y, index);
      if (c < (cost.get(nIdx) ?? Infinity)) {
        cost.set(nIdx, c);
        prev.set(nIdx, idx);
        open.push({ idx: nIdx, f: c + distance(n.x, n.y, tx, ty) });
      }
    }
  }
  if (!prev.has(goalIdx)) return null;
  const path: { x: number; y: number }[] = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    path.unshift({ x: cur % w, y: Math.floor(cur / w) });
    cur = prev.get(cur)!;
  }
  return path;
}

/** Nearest high-seas tile a ship can reach. */
export function nearestHighSeas(s: GameState, ship: Unit): { x: number; y: number } | null {
  const start = unitPosition(s, ship);
  if (!start) return null;
  const w = s.map.width;
  const index = buildMapIndex(s);
  const seen = new Set([start.y * w + start.x]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    if (s.map.tiles[p.y * w + p.x].t === 'highSeas' && !index.colonies.has(p.y * w + p.x)) return p;
    for (const n of neighbours(s, p.x, p.y)) {
      const i = n.y * w + n.x;
      if (seen.has(i) || !passable(s, ship, n.x, n.y, true, index)) continue;
      seen.add(i);
      queue.push(n);
    }
  }
  return null;
}

function directionTo(fx: number, fy: number, tx: number, ty: number): Direction {
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  const table: Record<string, Direction> = { '0,-1': 'n', '1,-1': 'ne', '1,0': 'e', '1,1': 'se', '0,1': 's', '-1,1': 'sw', '-1,0': 'w', '-1,-1': 'nw' };
  return table[`${dx},${dy}`];
}

export function setDestination(s: GameState, unitId: string, dest: Unit['dest']): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'map') fail('Only units on the map can be given orders.');
  if (dest && 'europe' in dest && !isShip(u)) fail('Only ships can sail to Europe.');
  if (dest && 'europe' in dest && dest.port) {
    if (dest.port === u.owner) dest = { europe: true };
    else {
      const problem = portProblem(s, u.owner, dest.port);
      if (problem) fail(problem);
    }
  }
  if (dest && 'x' in dest && !findPath(s, u, dest.x, dest.y)) fail('There is no known route there.');
  u.dest = dest;
  u.state = 'active';
  track(u.owner, dest && 'europe' in dest ? 'cmd:gotoEurope' : 'cmd:goto');
  continueOrders(s, u);
}

/** Moves a unit along its standing orders as far as its moves allow. */
export function continueOrders(s: GameState, u: Unit): void {
  let guard = 64;
  while (u.dest && u.moves > 0 && u.loc.kind === 'map' && guard-- > 0) {
    let target: { x: number; y: number } | null;
    if ('europe' in u.dest) {
      const tile = tileAt(s, u.loc.x, u.loc.y)!;
      if (tile.t === 'highSeas' && !colonyAt(s, u.loc.x, u.loc.y)) {
        sailToEurope(s, u.id, u.dest.port && !portProblem(s, u.owner, u.dest.port) ? u.dest.port : undefined);
        return;
      }
      target = nearestHighSeas(s, u);
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
      continue;
    }
    const path = findPath(s, u, target.x, target.y);
    if (!path || !path.length) {
      delete u.dest;
      return;
    }
    const step = path[0];
    const dir = directionTo(u.loc.x, u.loc.y, step.x, step.y);
    const option = describeMove(s, u.id, dir);
    if (option.kind !== 'move') {
      // Something got in the way; try again next turn.
      return;
    }
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
    const colony = Object.values(s.colonies).find((c) => c.owner === u.owner && distance(c.x, c.y, at.x, at.y) <= 1);
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
