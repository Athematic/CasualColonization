/**
 * Trade routes, as in the original game: a named round trip of stops (the player's colonies,
 * or Europe for ships), each saying which goods to unload and which to load. Ships and wagon
 * trains assigned to a route move on their own at the start of their owner's turn, after
 * ships at sea have advanced and before the player (or the computer) gives any orders. A
 * routed unit is never "awaiting orders"; clearing its orders takes it off the route.
 */
import { fail, RuleError } from './errors.js';
import { boardInEurope, buyGoods, buyPrice, sailToAmerica, sellGoods } from './europe.js';
import { continueOrders, findPath } from './movement.js';
import { cargoFree, cargoRoomFor, isCoastal, isShip, message, newId, player, reveal, unitName, unitPosition, unitsAboard, warehouseCapacity } from './queries.js';
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import type { NationId } from './rules/nations.js';
import { UNIT_TYPES } from './rules/units.js';
import type { GameState, RouteCargo, RouteStop, TradeRoute, Unit } from './types.js';

export const EUROPE_STOP = 'europe';
export const MAX_ROUTE_STOPS = 12;
export const ROUTE_NAME_MAX = 40;
/** Units bought in Europe when a load rule gives no amount. */
export const DEFAULT_EUROPE_LOAD = 100;

export function routesOf(s: GameState, nation: NationId): TradeRoute[] {
  return Object.values(s.routes ?? {}).filter((r) => r.owner === nation);
}

/** Units following a route. */
export function routeUnits(s: GameState, routeId: string): Unit[] {
  return Object.values(s.units).filter((u) => u.route?.id === routeId);
}

export function routeStopName(s: GameState, stop: RouteStop): string {
  if (stop.at === EUROPE_STOP) return 'Europe';
  return s.colonies[stop.at]?.name ?? 'a lost colony';
}

/** Ships and wagon trains can follow routes. */
export function canUseRoutes(u: Unit): boolean {
  const kind = UNIT_TYPES[u.type].kind;
  return (kind === 'ship' || kind === 'wagon') && UNIT_TYPES[u.type].cargo > 0;
}

function cleanCargo(list: RouteCargo[] | undefined): RouteCargo[] {
  const out: RouteCargo[] = [];
  for (const r of list ?? []) {
    if (!r || !GOODS.includes(r.good)) fail('Unknown good in the route.');
    if (out.some((o) => o.good === r.good)) continue;
    const entry: RouteCargo = { good: r.good };
    if (r.amount !== undefined && r.amount !== null) {
      const n = Math.floor(Number(r.amount));
      if (!Number.isFinite(n) || n < 0) fail('Route amounts must be zero or more.');
      entry.amount = Math.min(n, 10000);
    }
    out.push(entry);
  }
  return out;
}

/** Checks stops from a command and returns a clean copy. */
function cleanStops(s: GameState, nation: NationId, stops: RouteStop[] | undefined): RouteStop[] {
  const list = stops ?? [];
  if (!Array.isArray(list)) fail('Route stops must be a list.');
  if (list.length > MAX_ROUTE_STOPS) fail(`A route can have at most ${MAX_ROUTE_STOPS} stops.`);
  return list.map((stop) => {
    if (stop.at !== EUROPE_STOP) {
      const c = s.colonies[stop.at];
      if (!c || c.owner !== nation) fail('Route stops must be your own colonies or Europe.');
    }
    const clean: RouteStop = { at: stop.at, load: cleanCargo(stop.load), unload: cleanCargo(stop.unload) };
    if (stop.passengers && stop.at === EUROPE_STOP) clean.passengers = true;
    return clean;
  });
}

function cleanName(name: string | undefined): string {
  const n = (name ?? '').trim().slice(0, ROUTE_NAME_MAX);
  if (!n) fail('The route needs a name.');
  return n;
}

function ownRoute(s: GameState, nation: NationId, routeId: string): TradeRoute {
  const r = s.routes?.[routeId];
  if (!r) fail('No such trade route.');
  if (r.owner !== nation) fail('That is not your trade route.');
  return r;
}

export function createRoute(s: GameState, nation: NationId, name: string, stops?: RouteStop[]): TradeRoute {
  const route: TradeRoute = { id: newId(s, 'r'), owner: nation, name: cleanName(name), stops: cleanStops(s, nation, stops) };
  s.routes = s.routes ?? {};
  s.routes[route.id] = route;
  return route;
}

export function editRoute(s: GameState, nation: NationId, routeId: string, changes: { name?: string; stops?: RouteStop[] }): TradeRoute {
  const route = ownRoute(s, nation, routeId);
  const name = changes.name !== undefined ? cleanName(changes.name) : route.name;
  const stops = changes.stops !== undefined ? cleanStops(s, nation, changes.stops) : route.stops;
  route.name = name;
  if (changes.stops !== undefined) {
    route.stops = stops;
    for (const u of routeUnits(s, routeId)) {
      const problem = routeProblem(s, u, route);
      if (problem) {
        delete u.route;
        message(s, `${unitName(u)} leaves the ${route.name} route: ${problem}`, u.owner, unitPosition(s, u));
      } else if (u.route) u.route.stop = stops.length ? u.route.stop % stops.length : 0;
    }
  }
  return route;
}

export function deleteRoute(s: GameState, nation: NationId, routeId: string): void {
  ownRoute(s, nation, routeId);
  for (const u of routeUnits(s, routeId)) {
    delete u.route;
    delete u.dest;
  }
  delete s.routes![routeId];
}

/** Why a unit cannot follow a route, or null. */
export function routeProblem(s: GameState, u: Unit, route: TradeRoute): string | null {
  if (!canUseRoutes(u)) return 'Only ships and wagon trains follow trade routes.';
  if (route.owner !== u.owner) return 'That is not your trade route.';
  if (route.stops.length < 2) return 'A route needs at least two stops.';
  const ship = isShip(u);
  for (const stop of route.stops) {
    if (stop.at === EUROPE_STOP) {
      if (!ship) return 'Wagon trains cannot go to Europe.';
      continue;
    }
    const c = s.colonies[stop.at];
    if (ship && c && !isCoastal(s, c.x, c.y)) return `${c.name} has no harbour.`;
  }
  return null;
}

/** Puts a ship or wagon train on a route and sets it moving with the moves it has left. */
export function assignRoute(s: GameState, unitId: string, routeId: string): void {
  const u = s.units[unitId];
  const route = ownRoute(s, u.owner, routeId);
  const problem = routeProblem(s, u, route);
  if (problem) fail(problem);
  if (u.loc.kind !== 'map' && u.loc.kind !== 'europe' && u.loc.kind !== 'sailing') fail('The unit must be on the map or in Europe.');
  // Start at the stop the unit is at, if any; otherwise at the first.
  const here = route.stops.findIndex((stop) => atStop(s, u, stop));
  u.route = { id: route.id, stop: Math.max(0, here) };
  u.state = 'active';
  delete u.dest;
  delete u.work;
  runRoute(s, u);
}

export function unassignRoute(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (!u.route) fail(`${unitName(u)} is not on a trade route.`);
  delete u.route;
  delete u.dest;
}

function atStop(s: GameState, u: Unit, stop: RouteStop): boolean {
  if (stop.at === EUROPE_STOP) return u.loc.kind === 'europe';
  const c = s.colonies[stop.at];
  return !!c && u.loc.kind === 'map' && u.loc.x === c.x && u.loc.y === c.y;
}

/** Why a routed unit has to pass a stop by this turn, or null. */
function stopProblem(s: GameState, u: Unit, stop: RouteStop): string | null {
  if (stop.at === EUROPE_STOP) {
    if (!isShip(u)) return 'wagon trains cannot go to Europe';
    if (player(s, u.owner).independence !== 'none') return 'Europe no longer trades with us';
    return null;
  }
  const c = s.colonies[stop.at];
  if (!c || c.owner !== u.owner) return 'the colony is no longer ours';
  if (isShip(u) && !isCoastal(s, c.x, c.y)) return `${c.name} has no harbour`;
  return null;
}

function move(from: Partial<Record<GoodId, number>>, to: Partial<Record<GoodId, number>>, good: GoodId, n: number): void {
  from[good] = (from[good] ?? 0) - n;
  to[good] = (to[good] ?? 0) + n;
}

/** Unloads, then loads, by the stop's rules. */
function serveStop(s: GameState, u: Unit, route: TradeRoute, stop: RouteStop): void {
  u.cargo = u.cargo ?? {};
  if (stop.at === EUROPE_STOP) return serveEurope(s, u, route, stop);
  const colony = s.colonies[stop.at];
  // Passengers from Europe go ashore at the first colony.
  if (isShip(u)) {
    for (const p of unitsAboard(s, u)) {
      if (p.type === 'treasure') continue;
      p.loc = { kind: 'map', x: colony.x, y: colony.y };
      p.state = 'active';
    }
  }
  for (const r of stop.unload) {
    const have = u.cargo[r.good] ?? 0;
    if (have <= 0) continue;
    const limit = r.amount ?? (r.good === 'food' ? Infinity : warehouseCapacity(colony));
    const n = Math.min(have, Math.max(0, limit - colony.goods[r.good]));
    if (n > 0) move(u.cargo, colony.goods, r.good, n);
  }
  // The goods with most to spare are loaded first, so a small hold carries what matters most.
  const spare = (r: RouteCargo) => colony.goods[r.good] - (r.amount ?? 0);
  for (const r of [...stop.load].sort((a, b) => spare(b) - spare(a))) {
    const n = Math.min(spare(r), cargoRoomFor(s, u, r.good));
    if (n > 0) move(colony.goods, u.cargo, r.good, n);
  }
  for (const g of GOODS) if (u.cargo[g] === 0) delete u.cargo[g];
}

function serveEurope(s: GameState, u: Unit, route: TradeRoute, stop: RouteStop): void {
  const p = player(s, u.owner);
  let earned = 0;
  let spent = 0;
  for (const r of stop.unload) {
    const have = u.cargo?.[r.good] ?? 0;
    if (have <= 0 || p.boycotts[r.good]) continue;
    earned += sellGoods(s, u.id, r.good, have);
  }
  // Colonists before goods: a person takes a whole hold.
  let boarded = 0;
  if (stop.passengers) {
    for (const o of Object.values(s.units)) {
      if (o.owner !== u.owner || o.loc.kind !== 'europe' || isShip(o) || cargoFree(s, u) <= 0) continue;
      boardInEurope(s, o.id, u.id);
      boarded++;
    }
  }
  for (const r of stop.load) {
    if (p.boycotts[r.good]) continue;
    const want = (r.amount ?? DEFAULT_EUROPE_LOAD) - (u.cargo?.[r.good] ?? 0);
    const price = buyPrice(p, r.good);
    const n = Math.min(want, cargoRoomFor(s, u, r.good), Math.floor(p.gold / price));
    if (n <= 0) continue;
    const before = p.gold;
    buyGoods(s, u.id, r.good, n);
    spent += before - p.gold;
  }
  for (const g of GOODS) if (u.cargo?.[g] === 0) delete u.cargo[g];
  const parts = [
    earned ? `sold goods for ${earned} gold after tax` : '',
    spent ? `bought goods for ${spent} gold` : '',
    boarded ? `took ${boarded} colonist${boarded > 1 ? 's' : ''} aboard` : '',
  ].filter(Boolean);
  if (parts.length) message(s, `${unitName(u)} on the ${route.name} route ${parts.join(', ')} in Europe.`, u.owner);
}

/**
 * Moves a routed unit as far as its moves allow: serves the stop it is at, then heads for the
 * next one. A turn serves each stop at most once, so short routes cannot loop forever.
 */
export function runRoute(s: GameState, u: Unit): void {
  const route = u.route && s.routes?.[u.route.id];
  if (!route || route.owner !== u.owner) {
    delete u.route;
    return;
  }
  if (u.repair || u.work) return;
  if (u.loc.kind !== 'map' && u.loc.kind !== 'europe') return;
  const n = route.stops.length;
  if (n < 2) return;
  const r = u.route!;
  let served = 0;
  let passed = 0;
  for (let guard = 0; guard < n * 3 + 4 && s.units[u.id]; guard++) {
    r.stop = ((r.stop % n) + n) % n;
    const stop = route.stops[r.stop];
    const next = () => (r.stop = (r.stop + 1) % n);
    if (stopProblem(s, u, stop)) {
      if (++passed >= n) {
        message(s, `${unitName(u)} can serve no stop of the ${route.name} route and waits for orders.`, u.owner, unitPosition(s, u));
        delete u.route;
        delete u.dest;
        return;
      }
      next();
      continue;
    }
    if (atStop(s, u, stop)) {
      if (served >= n) return;
      try {
        serveStop(s, u, route, stop);
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
      }
      served++;
      next();
      continue;
    }
    if (stop.at === EUROPE_STOP) {
      if (u.moves <= 0) return;
      u.dest = { europe: true };
      continueOrders(s, u);
      return;
    }
    const c = s.colonies[stop.at];
    if (u.loc.kind === 'europe') {
      try {
        sailToAmerica(s, u.id);
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
      }
      return;
    }
    if (u.moves <= 0) return;
    if (!findPath(s, u, c.x, c.y)) {
      // Blocked or unknown: try the next stop rather than stand still.
      if (++passed >= n) return;
      next();
      continue;
    }
    u.dest = { x: c.x, y: c.y };
    continueOrders(s, u);
    if (!atStop(s, u, stop)) return;
  }
}

/** Runs every routed unit of a player; called at the start of the player's turn. */
export function processRoutes(s: GameState, nation: NationId): void {
  if (!s.routes) return;
  for (const u of Object.values(s.units)) {
    if (u.owner === nation && u.route && s.units[u.id]) runRoute(s, u);
  }
}

/**
 * Makes sure a nation knows the land and sea its routes cross, so a route the computer set up
 * keeps working once a person takes over (people only path through explored tiles).
 */
export function revealRoutes(s: GameState, nation: NationId): void {
  for (const route of routesOf(s, nation)) {
    const users = routeUnits(s, route.id);
    for (const kind of [true, false]) {
      const u = users.find((o) => isShip(o) === kind);
      if (!u) continue;
      const colonies = route.stops.map((st) => s.colonies[st.at]).filter((c) => !!c && c.owner === nation);
      for (let i = 0; i < colonies.length; i++) {
        const a = colonies[i];
        const b = colonies[(i + 1) % colonies.length];
        if (a.id === b.id) continue;
        const ghost: Unit = { ...u, loc: { kind: 'map', x: a.x, y: a.y } };
        for (const step of findPath(s, ghost, b.x, b.y) ?? []) reveal(s, nation, step.x, step.y, 1);
      }
    }
  }
}

/** A short description of what a stop does, for reports and the route screen. */
export function describeStop(stop: RouteStop): string {
  const list = (rules: RouteCargo[]) => rules.map((r) => GOOD_DEFS[r.good].name.toLowerCase()).join(', ');
  const parts = [stop.unload.length ? `unload ${list(stop.unload)}` : '', stop.load.length ? `load ${list(stop.load)}` : ''].filter(Boolean);
  return parts.join('; ') || 'pass through';
}
