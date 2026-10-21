/**
 * Logistics for the advanced computer levels: keeping goods from rotting in full warehouses.
 * Inland colonies get a wagon train on a route to the nearest port, spare cargo ships run
 * trade routes from the busiest ports to Europe, warehouses go up before they overflow, and
 * wagon trains with no port to go to sell surplus to native settlements instead.
 */
import { findPath, setDestination } from '../movement.js';
import { nativeOffer, tensionOf, tradeWithSettlement } from '../natives.js';
import { colonyReport, type ColonyReport } from '../production.js';
import { cargoRoomFor, colonyAt, distance, isCoastal, isShip, unitPosition, unitsAboard, warehouseCapacity } from '../queries.js';
import { assignRoute, createRoute, deleteRoute, editRoute, EUROPE_STOP, routesOf, routeUnits } from '../routes.js';
import type { GoodId } from '../rules/goods.js';
import { UNIT_TYPES } from '../rules/units.js';
import type { Colony, GameState, Player, RouteCargo, RouteStop, TradeRoute, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';

/** Goods worth carrying away from a colony to sell. */
export const TRADE_GOODS: GoodId[] = ['silver', 'furs', 'sugar', 'tobacco', 'cotton', 'ore', 'rum', 'cigars', 'cloth', 'coats', 'horses'];

/** Turns between reviews of the computer's routes. */
const REVIEW_EVERY = 10;

/** Goods a colony will lose to its full warehouse within the given number of turns. */
export function overflowSoon(s: GameState, c: Colony, turns = 4, report: ColonyReport = colonyReport(s, c)): number {
  const cap = warehouseCapacity(c);
  let lost = 0;
  for (const g of TRADE_GOODS) {
    if (c.buildings.customHouse && c.exports[g]) continue;
    lost += Math.max(0, c.goods[g] + Math.max(0, report.net[g]) * turns - cap);
  }
  // Lumber is used at home, so it only counts once it is about to spill over.
  lost += Math.max(0, c.goods.lumber + Math.max(0, report.net.lumber) * 2 - cap);
  return lost;
}

/** How much of a good a colony keeps for its own workshops (and horses for breeding). */
function keepFor(c: Colony, report: ColonyReport, g: GoodId): number {
  const cap = warehouseCapacity(c);
  if (g === 'horses') return Math.min(50, cap - 25);
  const used = report.consumed[g];
  return used > 0 ? Math.min(cap - 30, used * 8) : 0;
}

function loadRules(s: GameState, c: Colony): RouteCargo[] {
  const report = colonyReport(s, c);
  return TRADE_GOODS.map((g) => {
    const keep = keepFor(c, report, g);
    return keep > 0 ? { good: g, amount: keep } : { good: g };
  });
}

const unloadRules = (): RouteCargo[] => TRADE_GOODS.map((good) => ({ good }));

function ghostAt(u: Unit, c: Colony): Unit {
  return { ...u, loc: { kind: 'map', x: c.x, y: c.y } };
}

/** The nearest port a wagon train can reach overland from a colony. */
function portFor(s: GameState, p: Player, c: Colony, wagon: Unit): Colony | undefined {
  const ghost = ghostAt(wagon, c);
  let best: { c: Colony; len: number } | undefined;
  for (const port of ownColonies(s, p)) {
    if (port.id === c.id || !isCoastal(s, port.x, port.y) || distance(c.x, c.y, port.x, port.y) > 14) continue;
    if (best && distance(c.x, c.y, port.x, port.y) >= best.len) continue;
    const path = findPath(s, ghost, port.x, port.y);
    if (path && (!best || path.length < best.len)) best = { c: port, len: path.length };
  }
  return best?.c;
}

const isWagon = (u: Unit) => UNIT_TYPES[u.type].kind === 'wagon';
const isCargoShip = (u: Unit) => isShip(u) && UNIT_TYPES[u.type].offence === 0 && UNIT_TYPES[u.type].cargo > 0;

/** Inland colonies a wagon train route already serves. */
function wagonServed(s: GameState, p: Player): Set<string> {
  const out = new Set<string>();
  for (const r of routesOf(s, p.id)) {
    if (!routeUnits(s, r.id).some(isWagon)) continue;
    for (const st of r.stops) {
      const c = s.colonies[st.at];
      if (c && !isCoastal(s, c.x, c.y)) out.add(c.id);
    }
  }
  return out;
}

/** Inland colonies with goods to carry away. */
function needsCarting(s: GameState, c: Colony, report: ColonyReport = colonyReport(s, c)): boolean {
  if (isCoastal(s, c.x, c.y)) return false;
  const surplus = TRADE_GOODS.reduce((n, g) => n + Math.max(0, report.net[g]), 0);
  return surplus >= 3 || overflowSoon(s, c, 8, report) > 0;
}

/**
 * Whether this colony should build a wagon train: an inland colony with goods to carry away
 * that no route serves yet, while the nation has fewer wagons than one per two such colonies
 * (one wagon train serves up to three neighbouring colonies).
 */
export function wantsWagon(s: GameState, p: Player, c: Colony): boolean {
  const { waiting } = cartingNeeds(s, p);
  if (!waiting.has(c.id)) return false;
  const colonies = ownColonies(s, p);
  const idle = Object.values(s.units).filter((u) => u.owner === p.id && isWagon(u) && !u.route).length;
  const building = colonies.filter((o) => o.id !== c.id && o.build?.kind === 'unit' && o.build.id === 'wagonTrain').length;
  return idle + building < Math.ceil(waiting.size / 2);
}

/** Worked out once per nation and turn: it is asked for every colony. */
const cartingCache = new WeakMap<GameState, { key: string; served: Set<string>; waiting: Set<string> }>();

function cartingNeeds(s: GameState, p: Player): { served: Set<string>; waiting: Set<string> } {
  const key = `${s.turn}:${p.id}`;
  const hit = cartingCache.get(s);
  if (hit && hit.key === key) return hit;
  const served = wagonServed(s, p);
  const waiting = new Set(ownColonies(s, p).filter((o) => !served.has(o.id) && needsCarting(s, o)).map((o) => o.id));
  const entry = { key, served, waiting };
  cartingCache.set(s, entry);
  return entry;
}

/** Plays the nation's logistics for one turn. */
export function manageLogistics(s: GameState, p: Player): void {
  const review = s.turn % REVIEW_EVERY === 0;
  // Europe closes with independence; ship routes there make no sense any more.
  if (p.independence !== 'none') {
    for (const r of routesOf(s, p.id)) if (r.stops.some((st) => st.at === EUROPE_STOP)) deleteRoute(s, p.id, r.id);
  }
  for (const r of routesOf(s, p.id)) {
    const users = routeUnits(s, r.id);
    if (!users.length) {
      deleteRoute(s, p.id, r.id);
      continue;
    }
    if (review) safely(() => refreshRoute(s, p, r, users));
  }
  for (const u of Object.values(s.units)) {
    if (u.owner !== p.id || u.route) continue;
    if (isWagon(u) && u.loc.kind === 'map') safely(() => routeWagon(s, p, u));
  }
  if (p.independence === 'none') safely(() => routeShips(s, p));
}

/** Keeps load amounts in step with the colonies' workshops, and ship stops with where goods pile up. */
function refreshRoute(s: GameState, p: Player, r: TradeRoute, users: Unit[]): void {
  let stops: RouteStop[] = r.stops.filter((st) => st.at === EUROPE_STOP || s.colonies[st.at]?.owner === p.id);
  if (users.some(isShip) && stops.some((st) => st.at === EUROPE_STOP)) {
    const others = shipStops(s, p, r.id);
    const ports = busiestPorts(s, p, others);
    if (ports.length) stops = [...ports.map((c) => ({ at: c.id, load: [], unload: [] })), { at: EUROPE_STOP, load: [], unload: [] }];
  }
  if (stops.length < 2) {
    deleteRoute(s, p.id, r.id);
    return;
  }
  editRoute(s, p.id, r.id, { stops: stops.map((st) => withRules(s, st, stops)) });
}

/** The cargo rules for a stop: the last colony (or Europe) takes the goods, the others give them. */
function withRules(s: GameState, stop: RouteStop, all: RouteStop[]): RouteStop {
  const end = all[all.length - 1];
  if (stop === end) return stop.at === EUROPE_STOP ? { at: stop.at, load: [], unload: unloadRules(), passengers: true } : { at: stop.at, load: [], unload: unloadRules() };
  return { at: stop.at, load: loadRules(s, s.colonies[stop.at]), unload: [] };
}

/** Puts an idle wagon train on a route from up to three inland colonies to a port, or sends it to trade with natives. */
function routeWagon(s: GameState, p: Player, wagon: Unit): void {
  const pos = unitPosition(s, wagon)!;
  const served = wagonServed(s, p);
  const candidates = ownColonies(s, p)
    .filter((c) => !served.has(c.id) && needsCarting(s, c) && distance(c.x, c.y, pos.x, pos.y) <= 12)
    .map((c) => ({ c, score: overflowSoon(s, c, 8) + TRADE_GOODS.reduce((n, g) => n + c.goods[g], 0) - distance(c.x, c.y, pos.x, pos.y) * 10 }))
    .sort((a, b) => b.score - a.score);
  for (const { c } of candidates.slice(0, 3)) {
    const port = portFor(s, p, c, wagon);
    if (!port) continue;
    // Neighbours on the way, nearest first, as long as the wagon can reach them.
    const chain = [c];
    const ghost = ghostAt(wagon, c);
    for (const { c: o } of candidates) {
      if (chain.length >= 3) break;
      if (chain.includes(o) || distance(o.x, o.y, c.x, c.y) > 4 || distance(o.x, o.y, port.x, port.y) > distance(c.x, c.y, port.x, port.y) + 2) continue;
      if (findPath(s, ghost, o.x, o.y)) chain.push(o);
    }
    chain.sort((a, b) => distance(b.x, b.y, port.x, port.y) - distance(a.x, a.y, port.x, port.y));
    const stops: RouteStop[] = [...chain.map((o) => ({ at: o.id, load: [], unload: [] })), { at: port.id, load: [], unload: [] }];
    const route = createRoute(s, p.id, `${c.name} to ${port.name}`, stops.map((st) => withRules(s, st, stops)));
    assignRoute(s, wagon.id, route.id);
    return;
  }
  nativeTrade(s, p, wagon);
}

/** A wagon train without a port sells its colony's surplus to the nearest settlement that pays. */
function nativeTrade(s: GameState, p: Player, wagon: Unit): void {
  const pos = unitPosition(s, wagon)!;
  const cargo = wagon.cargo ?? {};
  const carrying = TRADE_GOODS.filter((g) => (cargo[g] ?? 0) > 0);
  const buyers = Object.values(s.settlements)
    .filter((st) => st.gold >= 60 && tensionOf(st, p.id) < 600 && s.tribes.find((t) => t.id === st.tribe)?.stance[p.id] !== 'war' && distance(st.x, st.y, pos.x, pos.y) <= 10)
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y));
  if (carrying.length) {
    const st = buyers.find((o) => carrying.some((g) => nativeOffer(o, g, Math.min(100, cargo[g]!)) >= 40));
    if (!st) return;
    if (distance(st.x, st.y, pos.x, pos.y) === 1) {
      if (wagon.moves > 0) tradeWithSettlement(s, wagon.id, st.id);
      return;
    }
    const step = besideSettlement(s, wagon, st.x, st.y);
    if (step) setDestination(s, wagon.id, step);
    return;
  }
  // Empty: load surplus at the colony it is in, or go to the fullest colony nearby.
  const here = colonyAt(s, pos.x, pos.y);
  if (here && here.owner === p.id && buyers.length) {
    const report = colonyReport(s, here);
    const spare = TRADE_GOODS.map((g) => ({ g, n: here.goods[g] - keepFor(here, report, g) })).filter((r) => r.n >= 50).sort((a, b) => b.n - a.n);
    for (const { g, n } of spare) {
      const amount = Math.min(n, cargoRoomFor(s, wagon, g));
      if (amount <= 0) continue;
      here.goods[g] -= amount;
      wagon.cargo = wagon.cargo ?? {};
      wagon.cargo[g] = (wagon.cargo[g] ?? 0) + amount;
    }
    if (Object.values(wagon.cargo ?? {}).some((n) => (n ?? 0) > 0)) return;
  }
  const fullest = ownColonies(s, p)
    .filter((c) => distance(c.x, c.y, pos.x, pos.y) <= 10 && (!here || c.id !== here.id))
    .map((c) => ({ c, n: TRADE_GOODS.reduce((m, g) => m + Math.max(0, c.goods[g] - 50), 0) }))
    .filter((r) => r.n >= 80)
    .sort((a, b) => b.n - a.n)[0];
  if (fullest && findPath(s, wagon, fullest.c.x, fullest.c.y)) setDestination(s, wagon.id, { x: fullest.c.x, y: fullest.c.y });
}

function besideSettlement(s: GameState, u: Unit, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number; len: number } | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const path = findPath(s, u, x + dx, y + dy);
      if (path && (!best || path.length < best.len)) best = { x: x + dx, y: y + dy, len: path.length };
    }
  }
  return best;
}

/** Colonies already visited by the nation's ship routes (other than the one given). */
function shipStops(s: GameState, p: Player, except?: string): Set<string> {
  const out = new Set<string>();
  for (const r of routesOf(s, p.id)) {
    if (r.id === except || !routeUnits(s, r.id).some(isShip)) continue;
    for (const st of r.stops) out.add(st.at);
  }
  return out;
}

/** Up to three ports with the most goods to sell, leaving out colonies another route already visits. */
function busiestPorts(s: GameState, p: Player, skip: Set<string>): Colony[] {
  const ranked = ownColonies(s, p)
    .filter((c) => isCoastal(s, c.x, c.y) && !skip.has(c.id))
    .map((c) => {
      const report = colonyReport(s, c);
      const score = TRADE_GOODS.reduce((n, g) => n + Math.max(0, c.goods[g] - keepFor(c, report, g)) + Math.max(0, report.net[g]) * 8, 0);
      return { c, score };
    })
    .filter((r) => r.score >= 120)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.c);
  // Visit them in a sensible order: nearest neighbour from the busiest.
  const out: Colony[] = [];
  const left = [...ranked];
  while (left.length) {
    const last = out[out.length - 1];
    left.sort((a, b) => (last ? distance(a.x, a.y, last.x, last.y) - distance(b.x, b.y, last.x, last.y) : 0));
    out.push(left.shift()!);
  }
  return out;
}

/**
 * Every cargo ship but one runs a route from the busiest ports to Europe; the free one ferries
 * colonists and supplies and picks up wherever goods are waiting.
 */
function routeShips(s: GameState, p: Player): void {
  const ships = Object.values(s.units).filter((u) => u.owner === p.id && isCargoShip(u) && !u.repair);
  const free = ships.filter((u) => !u.route);
  if (free.length < 2) return;
  const candidate = free.find((u) => (u.loc.kind === 'map' || u.loc.kind === 'europe') && !unitsAboard(s, u).length && !u.dest);
  if (!candidate) return;
  const covered = shipStops(s, p);
  const ports = busiestPorts(s, p, covered);
  if (!ports.length) return;
  const stops: RouteStop[] = [...ports.map((c) => ({ at: c.id, load: [], unload: [] })), { at: EUROPE_STOP, load: [], unload: [] }];
  const route = createRoute(s, p.id, `${ports[0].name} to Europe`, stops.map((st) => withRules(s, st, stops)));
  assignRoute(s, candidate.id, route.id);
}
