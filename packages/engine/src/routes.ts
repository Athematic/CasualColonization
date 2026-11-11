/**
 * Trade routes, as in the original game: a named round trip of stops (the player's colonies,
 * or Europe for ships), each saying which goods to unload and which to load. A Europe stop calls
 * at the owner's home port, or at a Favoured Nation partner's (`RouteStop.port`), where it trades
 * at that port's prices and tax; when the partnership ends it falls back to the home port. With a trade
 * agreement (relations.ts), a stop can also be a trade partner's colony: the unit stops next to
 * it, sells what it unloads to the colony and buys what it loads. With a trade treaty with a native
 * people (peopletreaties.ts, native-partners.md N4), a stop can be one of the people's settlements:
 * the unit stops next to it and trades as a wagon train does there (one sale, one purchase). Ships and wagon
 * trains assigned to a route move on their own at the start of their owner's turn, after
 * ships at sea have advanced and before the player (or the computer) gives any orders. A
 * routed unit is never "awaiting orders"; clearing its orders takes it off the route.
 */
import { fail, RuleError } from './errors.js';
import { noteGoods } from './history.js';
import { boardInEurope, buyGoods, buyPrice, portName, portOf, portProblem, sailToAmerica, sellGoods, shipMarket } from './europe.js';
import { continueOrders, findPath, pathHint } from './movement.js';
import { cargoFree, cargoRoomFor, isCoastal, isShip, isWater, message, neighbours, newId, player, reveal, tileAt, unitName, unitPosition, unitsAboard, warehouseCapacity } from './queries.js';
import { atPeace, besideColony, closedRoutePorts, hasTradeAgreement, inWaitingPeriod, tradeAtForeignColony } from './relations.js';
import { GOOD_DEFS, type GoodId } from './rules/goods.js';
import { type PlayerId } from './rules/nations.js';
import { UNIT_TYPES } from './rules/units.js';
import { track } from './telemetry.js';
import type { GameState, RouteCargo, RouteStop, TradeRoute, Unit } from './types.js';
import { goodsOf, nationOf, term, Term } from './scenarios/index.js';
import { indexedUnitsOf, setUnitLoc, colonyList, unitList } from './unitindex.js';
import { gridOf } from './grid.js';
import { buyFromSettlement, nativeOffer, settlementName, tradeWithSettlement } from './natives.js';
import { settlementForSale } from './braves.js';
import { settlementStopOpen } from './peopletreaties.js';
import { TRIBES } from './rules/nations.js';

export const EUROPE_STOP = 'europe';
export const MAX_ROUTE_STOPS = 12;
export const ROUTE_NAME_MAX = 40;
/** Units bought in Europe when a load rule gives no amount. */
export const DEFAULT_EUROPE_LOAD = 100;

export function routesOf(s: GameState, nation: PlayerId): TradeRoute[] {
  return Object.values(s.routes ?? {}).filter((r) => r.owner === nation);
}

/** Units following a route. */
export function routeUnits(s: GameState, routeId: string): Unit[] {
  const out: Unit[] = [];
  const all = unitList(s);
  for (let i = 0; i < all.length; i++) if (all[i].route?.id === routeId) out.push(all[i]);
  return out;
}

/** A stop's name; with `owner` (the route's owner), a foreign colony's name carries its nation, e.g. "Québec (French)". */
export function routeStopName(s: GameState, stop: RouteStop, owner?: PlayerId): string {
  if (stop.at === EUROPE_STOP) return stop.port && stop.port !== owner ? `${Term(s, 'homeland')} (${portName(s, stop.port)})` : `${Term(s, 'homeland')}`;
  const st = s.settlements[stop.at];
  if (st) return settlementName(s, st);
  const c = s.colonies[stop.at];
  if (!c) return 'a lost colony';
  return owner && c.owner !== owner ? `${c.name} (${nationOf(s, c.owner).adjective})` : c.name;
}

/**
 * The home port a Europe stop calls at: the partner's it names while that port is open to the
 * route's owner, otherwise the owner's own.
 */
export function stopPort(s: GameState, owner: PlayerId, stop: RouteStop): PlayerId {
  return stop.port && stop.port !== owner && !portProblem(s, owner, stop.port) ? stop.port : owner;
}

/** Whether a stop is at a colony of another nation (a trade partner's). */
export function isForeignStop(s: GameState, stop: RouteStop, owner: PlayerId): boolean {
  const c = stop.at === EUROPE_STOP ? undefined : s.colonies[stop.at];
  return !!c && c.owner !== owner;
}

/** Whether a stop is at a native settlement (a trade treaty partner's, N4). */
export function isSettlementStop(s: GameState, stop: RouteStop): boolean {
  return stop.at !== EUROPE_STOP && !!s.settlements[stop.at];
}

/** Colonies of other nations a nation's routes may stop at: those of its trade partners. */
export function foreignStopColonies(s: GameState, nation: PlayerId) {
  return colonyList(s).filter((c) => c.owner !== nation && c.owner !== 'crown' && hasTradeAgreement(s, nation, c.owner) && atPeace(s, nation, c.owner));
}

/** Ships and wagon trains can follow routes. */
export function canUseRoutes(u: Unit): boolean {
  const kind = UNIT_TYPES[u.type].kind;
  return (kind === 'ship' || kind === 'wagon') && UNIT_TYPES[u.type].cargo > 0;
}

function cleanCargo(s: GameState, list: RouteCargo[] | undefined): RouteCargo[] {
  const out: RouteCargo[] = [];
  for (const r of list ?? []) {
    if (!r || !goodsOf(s).includes(r.good)) fail('Unknown good in the route.');
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
function cleanStops(s: GameState, nation: PlayerId, stops: RouteStop[] | undefined): RouteStop[] {
  const list = stops ?? [];
  if (!Array.isArray(list)) fail('Route stops must be a list.');
  if (list.length > MAX_ROUTE_STOPS) fail(`A route can have at most ${MAX_ROUTE_STOPS} stops.`);
  return list.map((stop) => {
    const settlement = stop.at !== EUROPE_STOP && !s.colonies[stop.at] ? s.settlements[stop.at] : undefined;
    if (settlement) {
      if (!settlementStopOpen(s, nation, settlement.id)) fail(`Route stops at a native settlement need a trade treaty with the ${TRIBES[settlement.tribe].name}.`);
    } else if (stop.at !== EUROPE_STOP) {
      const c = s.colonies[stop.at];
      if (!c) fail('No such colony.');
      if (c.owner !== nation) {
        if (inWaitingPeriod(s, nation, c.owner) && !player(s, c.owner).human) fail(`${nationOf(s, c.owner).name} will not let your routes call at its colonies for now.`);
        if (!hasTradeAgreement(s, nation, c.owner) || !atPeace(s, nation, c.owner)) {
          fail(`Route stops must be your own colonies, ${term(s, 'homeland')}, or colonies of a nation you have a trade agreement with.`);
        }
      }
    }
    const clean: RouteStop = { at: stop.at, load: cleanCargo(s, stop.load), unload: cleanCargo(s, stop.unload) };
    if (stop.passengers && stop.at === EUROPE_STOP) clean.passengers = true;
    if (stop.at === EUROPE_STOP && stop.port && stop.port !== nation) {
      const problem = portProblem(s, nation, stop.port);
      if (problem) fail(problem);
      clean.port = stop.port;
    }
    return clean;
  });
}

function cleanName(name: string | undefined): string {
  const n = (name ?? '').trim().slice(0, ROUTE_NAME_MAX);
  if (!n) fail('The route needs a name.');
  return n;
}

function ownRoute(s: GameState, nation: PlayerId, routeId: string): TradeRoute {
  const r = s.routes?.[routeId];
  if (!r) fail('No such trade route.');
  if (r.owner !== nation) fail('That is not your trade route.');
  return r;
}

export function createRoute(s: GameState, nation: PlayerId, name: string, stops?: RouteStop[]): TradeRoute {
  const route: TradeRoute = { id: newId(s, 'r'), owner: nation, name: cleanName(name), stops: cleanStops(s, nation, stops) };
  s.routes = s.routes ?? {};
  s.routes[route.id] = route;
  track(nation, 'cmd:createRoute');
  return route;
}

export function editRoute(s: GameState, nation: PlayerId, routeId: string, changes: { name?: string; stops?: RouteStop[] }): TradeRoute {
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

export function deleteRoute(s: GameState, nation: PlayerId, routeId: string): void {
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
      if (!ship) return `Wagon trains cannot go to ${term(s, 'homeland')}.`;
      continue;
    }
    const c = s.colonies[stop.at];
    if (ship && c && !isCoastal(s, c.x, c.y)) return `${c.name} has no harbour.`;
    const st = c ? undefined : s.settlements[stop.at];
    if (ship && st && !isCoastal(s, st.x, st.y)) return `The ${settlementName(s, st)} is not on the coast.`;
  }
  return null;
}

/** The tile next to a foreign colony (or a partner's settlement) from which a unit can trade with it most quickly, or null. */
function approach(s: GameState, u: Unit, c: { x: number; y: number }): { goal: { x: number; y: number }; path: { x: number; y: number }[] } | null {
  let best: { x: number; y: number; d: number } | null = null;
  let bestPath: { x: number; y: number }[] = [];
  for (const n of neighbours(s, c.x, c.y)) {
    if (isWater(tileAt(s, n.x, n.y)) !== isShip(u)) continue;
    const path = findPath(s, u, n.x, n.y);
    if (path && (!best || path.length < best.d)) {
      best = { ...n, d: path.length };
      bestPath = path;
    }
  }
  // The goal (kept as the unit's destination) and the route to it.
  return best && { goal: best, path: bestPath };
}

/** Puts a ship or wagon train on a route and sets it moving with the moves it has left. */
export function assignRoute(s: GameState, unitId: string, routeId: string): void {
  const u = s.units[unitId];
  const route = ownRoute(s, u.owner, routeId);
  const problem = routeProblem(s, u, route);
  if (problem) fail(problem);
  if (u.loc.kind !== 'map' && u.loc.kind !== 'europe' && u.loc.kind !== 'sailing') fail(`The unit must be on the map or in ${term(s, 'homeland')}.`);
  // Start at the stop the unit is at, if any; otherwise at the first.
  const here = route.stops.findIndex((stop) => atStop(s, u, stop));
  u.route = { id: route.id, stop: Math.max(0, here) };
  track(u.owner, 'cmd:assignRoute');
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
  // The home port the stop names (a Favoured Nation partner's), or the owner's own.
  if (stop.at === EUROPE_STOP) return u.loc.kind === 'europe' && portOf(u) === stopPort(s, u.owner, stop);
  const c = s.colonies[stop.at];
  if (!c) {
    // A partner's settlement is served from a tile next to it (water for a ship, land for a wagon train).
    const st = s.settlements[stop.at];
    return !!st && u.loc.kind === 'map' && gridOf(s).distance(u.loc.x, u.loc.y, st.x, st.y) === 1 && isWater(tileAt(s, u.loc.x, u.loc.y)) === isShip(u);
  }
  if (c.owner !== u.owner) return besideColony(s, u, c.id) && isWater(tileAt(s, (u.loc as { x: number }).x, (u.loc as { y: number }).y)) === isShip(u);
  return u.loc.kind === 'map' && u.loc.x === c.x && u.loc.y === c.y;
}

/** Why a routed unit has to pass a stop by this turn, or null. */
function stopProblem(s: GameState, u: Unit, stop: RouteStop): string | null {
  if (stop.at === EUROPE_STOP) {
    if (!isShip(u)) return `wagon trains cannot go to ${term(s, 'homeland')}`;
    if (player(s, u.owner).independence !== 'none') return `${Term(s, 'homeland')} no longer trades with us`;
    return null;
  }
  const c = s.colonies[stop.at];
  if (!c) {
    const st = s.settlements[stop.at];
    if (!st) return 'the colony is gone';
    if (!settlementStopOpen(s, u.owner, st.id)) return `we have no trade treaty with the ${TRIBES[st.tribe].name}`;
    if (isShip(u) && !isCoastal(s, st.x, st.y)) return `the ${settlementName(s, st)} is not on the coast`;
    return null;
  }
  if (c.owner !== u.owner && (!hasTradeAgreement(s, u.owner, c.owner) || !atPeace(s, u.owner, c.owner))) return `we have no trade agreement with ${nationOf(s, c.owner).name}`;
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
  if (!s.colonies[stop.at]) return serveSettlement(s, u, stop);
  const colony = s.colonies[stop.at];
  if (colony.owner !== u.owner) return serveForeign(s, u, route, stop);
  // Passengers from Europe go ashore at the first colony.
  if (isShip(u)) {
    for (const p of unitsAboard(s, u)) {
      if (p.type === 'treasure') continue;
      setUnitLoc(s, p, { kind: 'map', x: colony.x, y: colony.y });
      p.state = 'active';
    }
  }
  for (const r of stop.unload) {
    const have = u.cargo[r.good] ?? 0;
    if (have <= 0) continue;
    const limit = r.amount ?? (r.good === 'food' ? Infinity : warehouseCapacity(colony));
    const n = Math.min(have, Math.max(0, limit - colony.goods[r.good]));
    if (n > 0) {
      move(u.cargo, colony.goods, r.good, n);
      track(u.owner, 'route:goods delivered to a colony', n);
      noteGoods(s, u.owner, 'route', r.good, n);
    }
  }
  // The goods with most to spare are loaded first, so a small hold carries what matters most.
  const spare = (r: RouteCargo) => colony.goods[r.good] - (r.amount ?? 0);
  for (const r of [...stop.load].sort((a, b) => spare(b) - spare(a))) {
    const n = Math.min(spare(r), cargoRoomFor(s, u, r.good));
    if (n > 0) move(colony.goods, u.cargo, r.good, n);
  }
  for (const g of goodsOf(s)) if (u.cargo[g] === 0) delete u.cargo[g];
}

/** Sells to, and buys from, a trade partner's colony, and reports to both nations. */
function serveForeign(s: GameState, u: Unit, route: TradeRoute, stop: RouteStop): void {
  const colony = s.colonies[stop.at];
  const t = tradeAtForeignColony(s, u, colony.id, stop.unload, stop.load);
  const them = nationOf(s, colony.owner).adjective;
  const us = nationOf(s, u.owner).adjective;
  const parts = [
    t.sold ? `sold ${t.sold} goods for ${t.earned} gold` : '',
    t.bought ? `bought ${t.bought} goods for ${t.spent} gold` : '',
  ].filter(Boolean);
  if (parts.length) {
    message(s, `${unitName(u)} on the ${route.name} route ${parts.join(' and ')} at ${colony.name} (${them}).`, u.owner, colony);
    const theirs = [t.sold ? `bought ${t.sold} goods for ${t.earned} gold` : '', t.bought ? `sold ${t.bought} goods for ${t.spent} gold` : ''].filter(Boolean);
    message(s, `${colony.name} traded with a visiting ${us} ${isShip(u) ? 'ship' : 'wagon train'}: ${theirs.join(' and ')}.`, colony.owner, colony);
  }
  if (t.short) {
    message(s, `${colony.name} (${them}) could not pay for ${t.sold ? 'all ' : ''}the goods ${unitName(u)} brought${t.sold ? '' : '; the stop was skipped'}.`, u.owner, colony);
  }
}

/**
 * Trades at a partner's settlement as a wagon train does there (N4): sells the unloaded good it
 * pays most for, then buys the loaded good it has most of. Each deal reports itself.
 */
function serveSettlement(s: GameState, u: Unit, stop: RouteStop): void {
  const st = s.settlements[stop.at];
  const cargo = u.cargo ?? {};
  const sell = stop.unload.map((r) => r.good).filter((g) => (cargo[g] ?? 0) > 0);
  if (sell.length) {
    const best = sell.sort((a, b) => nativeOffer(s, st, b, Math.min(100, cargo[b]!), u.owner) - nativeOffer(s, st, a, Math.min(100, cargo[a]!), u.owner))[0];
    try {
      tradeWithSettlement(s, u.id, st.id, best, true);
      track(u.owner, 'route:settlement sales');
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
    }
  }
  const wanted = new Set(stop.load.map((r) => r.good));
  const buy = settlementForSale(s, st).filter((r) => wanted.has(r.good)).sort((a, b) => b.amount - a.amount);
  for (const r of buy) {
    try {
      buyFromSettlement(s, u.id, st.id, r.good, 100, true);
      track(u.owner, 'route:settlement purchases');
      break;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
    }
  }
  for (const g of goodsOf(s)) if (cargo[g] === 0) delete cargo[g];
}

/**
 * Sells and buys at the home port the ship is in: its owner's, or a Favoured Nation partner's at
 * that port's prices and tax (boycotts apply only at home). Colonists board only at home.
 */
function serveEurope(s: GameState, u: Unit, route: TradeRoute, stop: RouteStop): void {
  const { p, market } = shipMarket(s, u);
  const home = market === p;
  let earned = 0;
  let spent = 0;
  for (const r of stop.unload) {
    const have = u.cargo?.[r.good] ?? 0;
    if (have <= 0 || (home && p.boycotts[r.good])) continue;
    earned += sellGoods(s, u.id, r.good, have);
    track(u.owner, 'route:goods sold in Europe', have);
    if (!home) track(u.owner, 'route:goods sold in a partner port', have);
  }
  // Colonists before goods: a person takes a whole hold.
  let boarded = 0;
  if (stop.passengers && home) {
    for (const o of unitList(s)) {
      if (o.owner !== u.owner || o.loc.kind !== 'europe' || isShip(o) || cargoFree(s, u) <= 0) continue;
      boardInEurope(s, o.id, u.id);
      track(u.owner, 'route:colonists carried');
      boarded++;
    }
  }
  for (const r of stop.load) {
    if (home && p.boycotts[r.good]) continue;
    const want = (r.amount ?? DEFAULT_EUROPE_LOAD) - (u.cargo?.[r.good] ?? 0);
    const price = buyPrice(s, market, r.good);
    const n = Math.min(want, cargoRoomFor(s, u, r.good), Math.floor(p.gold / price));
    if (n <= 0) continue;
    const before = p.gold;
    buyGoods(s, u.id, r.good, n);
    spent += before - p.gold;
  }
  for (const g of goodsOf(s)) if (u.cargo?.[g] === 0) delete u.cargo[g];
  const parts = [
    earned ? `sold goods for ${earned} gold after tax` : '',
    spent ? `bought goods for ${spent} gold` : '',
    boarded ? `took ${boarded} colonist${boarded > 1 ? 's' : ''} aboard` : '',
  ].filter(Boolean);
  if (parts.length) message(s, `${unitName(u)} on the ${route.name} route ${parts.join(', ')} in ${home ? term(s, 'homeland') : portName(s, market.id)}.`, u.owner);
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
      // A ship in another port than the stop's first sails back out.
      if (u.loc.kind === 'europe') {
        try {
          sailToAmerica(s, u.id);
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
        }
        return;
      }
      if (u.moves <= 0) return;
      const port = stopPort(s, u.owner, stop);
      u.dest = port === u.owner ? { europe: true } : { europe: true, port };
      continueOrders(s, u);
      return;
    }
    const c = s.colonies[stop.at] ?? s.settlements[stop.at];
    if (u.loc.kind === 'europe') {
      try {
        sailToAmerica(s, u.id);
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
      }
      return;
    }
    if (u.moves <= 0) return;
    // A foreign colony is served from a tile next to it; one's own from the colony itself.
    let found: { goal: { x: number; y: number }; path: { x: number; y: number }[] } | null;
    if ('owner' in c && c.owner === u.owner) {
      const path = findPath(s, u, c.x, c.y);
      found = path && { goal: { x: c.x, y: c.y }, path };
    } else found = approach(s, u, c);
    if (!found) {
      // Blocked or unknown: try the next stop rather than stand still.
      if (++passed >= n) return;
      next();
      continue;
    }
    u.dest = { ...found.goal };
    // The route just found is the first step's: continueOrders need not search again.
    continueOrders(s, u, pathHint(u, found.goal, found.path));
    if (!atStop(s, u, stop)) return;
  }
}

/** Runs every routed unit of a player; called at the start of the player's turn. */
export function processRoutes(s: GameState, nation: PlayerId): void {
  if (!s.routes) return;
  // Europe stops at a port that has closed (the partnership ended) fall back to the home port.
  closedRoutePorts(s, nation);
  // The nation's units, as a filtered Object.values would list them (routes never change an owner).
  for (const u of indexedUnitsOf(s, nation)) {
    if (u.owner === nation && u.route && s.units[u.id]) runRoute(s, u);
  }
}

/**
 * Makes sure a nation knows the land and sea its routes cross, so a route the computer set up
 * keeps working once a person takes over (people only path through explored tiles).
 */
export function revealRoutes(s: GameState, nation: PlayerId): void {
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
