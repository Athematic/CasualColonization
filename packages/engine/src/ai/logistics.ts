/**
 * Logistics for the advanced computer levels: keeping goods from rotting in full warehouses.
 * Inland colonies get a wagon train on a route to the nearest port, spare cargo ships run
 * trade routes from the busiest ports to Europe, warehouses go up before they overflow, and
 * wagon trains with no port to go to sell surplus to native settlements instead.
 */
import { buyPrice, sellPrice } from '../europe.js';
import { findPath, setDestination } from '../movement.js';
import { nativeOffer, tensionOf, tradeWithSettlement } from '../natives.js';
import { colonyReport, type ColonyReport } from '../production.js';
import { cargoRoomFor, colonyAt, distance, isCoastal, isShip, player, unitPosition, unitsAboard, warehouseCapacity } from '../queries.js';
import { favouredPartners, favouredUnlocked, FOREIGN_KEEP, hasTradeAgreement, inWaitingPeriod, isFavoured, routesBetween, ROUTES_NEEDED } from '../relations.js';
import { assignRoute, createRoute, deleteRoute, editRoute, EUROPE_STOP, foreignStopColonies, isForeignStop, routesOf, routeUnits } from '../routes.js';
import type { NationId } from '../rules/nations.js';
import { track } from '../telemetry.js';
import { BUILDINGS, type BuildingKind } from '../rules/buildings.js';
import type { GoodId } from '../rules/goods.js';
import { UNIT_TYPES } from '../rules/units.js';
import type { Colony, GameState, Player, RouteCargo, RouteStop, TradeRoute, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';
import { wagonSteps } from './foreign.js';
import { buyFromNatives } from './natives.js';

/** Goods worth carrying away from a colony to sell. */
export const TRADE_GOODS: GoodId[] = ['silver', 'furs', 'sugar', 'tobacco', 'cotton', 'ore', 'rum', 'cigars', 'cloth', 'coats', 'horses'];

/** Turns between reviews of the computer's routes. */
const REVIEW_EVERY = 10;
/** No wagon train is built for, or put on, a route to a partner's colony before this turn. */
const FOREIGN_WAGON_FROM = 80;

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

function loadRules(s: GameState, c: Colony, skip: (g: GoodId) => boolean = () => false): RouteCargo[] {
  const report = colonyReport(s, c);
  return TRADE_GOODS.filter((g) => !skip(g)).map((g) => {
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
  // A wagon train for a trade route to a partner's colony (see planForeignWagon).
  const fw = p.aiMemory?.foreignWagon;
  if (fw && fw.colony === c.id && fw.until > s.turn) {
    const idle = Object.values(s.units).some((u) => u.owner === p.id && isWagon(u) && !u.route);
    const building = ownColonies(s, p).some((o) => o.id !== c.id && o.build?.kind === 'unit' && o.build.id === 'wagonTrain');
    if (!idle && !building) return true;
  }
  const { waiting, yard } = cartingNeeds(s, p);
  // The colony with the most hammers builds wagon trains for its neighbours; failing one, a colony builds its own.
  if (yard ? yard !== c.id : !waiting.has(c.id)) return false;
  const colonies = ownColonies(s, p);
  const idle = Object.values(s.units).filter((u) => u.owner === p.id && isWagon(u) && !u.route).length;
  const building = colonies.filter((o) => o.id !== c.id && o.build?.kind === 'unit' && o.build.id === 'wagonTrain').length;
  return idle + building < Math.ceil(waiting.size / 2);
}

/** Worked out once per nation and turn: it is asked for every colony. */
const cartingCache = new WeakMap<GameState, { key: string; served: Set<string>; waiting: Set<string>; yard?: string }>();

function cartingNeeds(s: GameState, p: Player): { served: Set<string>; waiting: Set<string>; yard?: string } {
  const key = `${s.turn}:${p.id}`;
  const hit = cartingCache.get(s);
  if (hit && hit.key === key) return hit;
  const served = wagonServed(s, p);
  const colonies = ownColonies(s, p);
  const waiting = new Set(colonies.filter((o) => !served.has(o.id) && needsCarting(s, o)).map((o) => o.id));
  let yard: { id: string; hammers: number } | undefined;
  if (waiting.size) {
    for (const c of colonies) {
      if (![...waiting].some((id) => distance(s.colonies[id].x, s.colonies[id].y, c.x, c.y) <= 10)) continue;
      const hammers = colonyReport(s, c).produced.hammers;
      if (hammers >= 3 && (!yard || hammers > yard.hammers)) yard = { id: c.id, hammers };
    }
  }
  const entry = { key, served, waiting, yard: yard?.id };
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
  if (review) safely(() => planForeignWagon(s, p));
}

/** A route name like "Port to Europe", numbered if the nation already has one by that name. */
function routeName(s: GameState, p: Player, stops: RouteStop[], except?: string): string {
  const first = s.colonies[stops[0].at]?.name ?? 'Route';
  const last = stops[stops.length - 1].at === EUROPE_STOP ? 'Europe' : s.colonies[stops[stops.length - 1].at]?.name ?? 'port';
  const base = `${first} to ${last}`;
  const taken = new Set(routesOf(s, p.id).filter((r) => r.id !== except).map((r) => r.name));
  for (let i = 1; ; i++) {
    const name = i === 1 ? base : `${base} ${i}`;
    if (!taken.has(name)) return name;
  }
}

/** Keeps load amounts in step with the colonies' workshops, and ship stops with where goods pile up. */
function refreshRoute(s: GameState, p: Player, r: TradeRoute, users: Unit[]): void {
  const foreign = r.stops.find((st) => isForeignStop(s, st, p.id));
  let stops: RouteStop[] = r.stops.filter((st) => st.at === EUROPE_STOP || s.colonies[st.at]?.owner === p.id);
  const ship = users.some(isShip);
  const toEurope = stops.some((st) => st.at === EUROPE_STOP);
  if (ship && toEurope) {
    const others = shipStops(s, p, r.id);
    const ports = busiestPorts(s, p, others);
    if (ports.length) stops = [...ports.map((c) => ({ at: c.id, load: [], unload: [] })), { at: EUROPE_STOP, load: [], unload: [] }];
  }
  if (!ship && !toEurope && foreign && stops.length === 1) {
    // A wagon train's route to a partner's colony: kept while it still pays (or builds ties).
    const f = s.colonies[foreign.at];
    const own = s.colonies[stops[0].at];
    const rules = f && own ? wagonForeignRules(s, p, own, f) : null;
    if (!rules) {
      deleteRoute(s, p.id, r.id);
      return;
    }
    editRoute(s, p.id, r.id, { name: routeName(s, p, [rules.home, rules.stop], r.id), stops: [rules.home, rules.stop] });
    return;
  }
  if (stops.length < 2) {
    deleteRoute(s, p.id, r.id);
    return;
  }
  let ruled = stops.map((st) => withRules(s, p, st, stops));
  if (ship && toEurope) ruled = withForeignShipStop(s, p, ruled);
  editRoute(s, p.id, r.id, { name: routeName(s, p, stops, r.id), stops: ruled });
}

/** Whether a good can go to Europe: not boycotted at home, unless a partner's port takes it (free ships only). */
function exportable(s: GameState, p: Player, g: GoodId): boolean {
  return !p.boycotts[g] || favouredPartners(s, p.id).length > 0;
}

/**
 * The cargo rules for a stop: the last colony (or Europe) takes the goods, the others give them.
 * Trade routes call only at the home port, so goods boycotted there are not loaded for Europe;
 * any still aboard go back into the colonies' warehouses.
 */
function withRules(s: GameState, p: Player, stop: RouteStop, all: RouteStop[]): RouteStop {
  const end = all[all.length - 1];
  const europe = end.at === EUROPE_STOP;
  const banned = (g: GoodId) => !!p.boycotts[g] && (europe || !exportable(s, p, g));
  if (stop === end) {
    return europe ? { at: stop.at, load: [], unload: unloadRules().filter((r) => !banned(r.good)), passengers: true } : { at: stop.at, load: [], unload: unloadRules() };
  }
  return { at: stop.at, load: loadRules(s, s.colonies[stop.at], banned), unload: TRADE_GOODS.filter(banned).map((good) => ({ good })) };
}

// ---------------------------------------------------------------------------
// Trade with partners' colonies

/** What a unit of a good brings when shipped home and sold there after tax; 0 when boycotted. */
export function homeNet(p: Player, g: GoodId): number {
  return p.boycotts[g] ? 0 : (sellPrice(p, g) * (100 - p.tax)) / 100;
}

/** Gold per unit a partner's colony pays above what shipping the good home brings (its owner's price, untaxed). */
export function saleGain(s: GameState, p: Player, f: Colony, g: GoodId): number {
  return sellPrice(player(s, f.owner), g) - homeNet(p, g);
}

/** Gold per unit gained buying a good at a partner's colony and selling it at home. */
export function buyGain(s: GameState, p: Player, f: Colony, g: GoodId): number {
  return homeNet(p, g) - buyPrice(player(s, f.owner), g);
}

/**
 * Whether the nation is building trade ties with a partner towards Favoured Nation: it has a trade
 * agreement, no Favoured Nation status yet, the thresholds are not reached, and there are fewer
 * routes between them than the most that can be needed. While it is, a stop that sells at no loss
 * is worth adding; otherwise a stop must gain at least 1 gold per unit.
 */
export function buildingTies(s: GameState, p: Player, other: NationId): boolean {
  return (
    !s.config.noFavoured &&
    hasTradeAgreement(s, p.id, other) &&
    !isFavoured(s, p.id, other) &&
    !favouredUnlocked(s, p.id, other) &&
    routesBetween(s, p.id, other) < ROUTES_NEEDED.max
  );
}

/** Partners' colonies a route may call at now: a trade agreement, peace, no waiting period, and an owner with gold. */
function partnerColonies(s: GameState, p: Player): Colony[] {
  return foreignStopColonies(s, p.id).filter((f) => !inWaitingPeriod(s, p.id, f.owner) && player(s, f.owner).gold >= 200);
}

/** Goods a nation sells at partners' colonies: its exports, plus lumber and tools for their workshops and builds. */
const FOREIGN_GOODS: GoodId[] = [...TRADE_GOODS.filter((g) => g !== 'horses'), 'lumber', 'tools'];

/** A partner whose treasury is this full also buys goods its workshops do not use. */
const RICH_PARTNER = 4000;

/** Units of a good a colony's staffed workshops could use each turn. */
function workshopDemand(report: ColonyReport, g: GoodId): number {
  let n = 0;
  for (const [kind, b] of Object.entries(report.buildings) as [BuildingKind, { capacity: number }][]) if (BUILDINGS[kind].input === g) n += b.capacity;
  return n;
}

/**
 * The stop at a partner's colony for goods the unit brings. It sells what the colony's workshops
 * use and it does not make enough of itself (or, from a rich partner, anything it does not make),
 * where the colony pays more than home after tax (no less, while building ties), filling the
 * warehouse to its capacity less 20 (to 100 for goods no workshop uses). It buys the colony's
 * surplus above FOREIGN_KEEP where home pays more after tax. Selling only what the partner needs
 * keeps the trade good for both sides: a partner never pays for goods it can only ship on at a loss.
 * Returns null when there is nothing to trade, else the stop and the expected gain per trip.
 */
function foreignStop(s: GameState, p: Player, f: Colony, goods: GoodId[]): { stop: RouteStop; gain: number; sells: GoodId[]; buys: GoodId[] } | null {
  const ties = buildingTies(s, p, f.owner);
  const report = colonyReport(s, f);
  const cap = warehouseCapacity(f);
  const rich = player(s, f.owner).gold >= RICH_PARTNER;
  const unload: RouteCargo[] = [];
  const sells: GoodId[] = [];
  let gain = 0;
  for (const g of goods) {
    const demand = workshopDemand(report, g);
    const wanted = demand > 0 ? report.produced[g] < demand : rich && report.produced[g] === 0;
    if (!wanted) continue;
    const fill = demand > 0 ? cap - 20 : Math.min(cap - 20, 100);
    const room = fill - f.goods[g];
    const per = saleGain(s, p, f, g);
    if (room < 30 || per < (ties ? 0 : 1)) continue;
    unload.push({ good: g, amount: fill });
    sells.push(g);
    gain += per * Math.min(room, 100) + (demand > 0 ? 20 : 0);
  }
  const buys = TRADE_GOODS.filter((g) => g !== 'horses' && !p.boycotts[g] && f.goods[g] >= FOREIGN_KEEP + 30 && buyGain(s, p, f, g) >= 1);
  for (const g of buys) gain += buyGain(s, p, f, g) * Math.min(100, f.goods[g] - FOREIGN_KEEP);
  if (!unload.length && !buys.length) return null;
  return { stop: { at: f.id, load: buys.map((good) => ({ good })), unload }, gain, sells, buys };
}

/**
 * Adds a stop at a partner's coastal colony to a ship route from the nation's ports to Europe,
 * just before Europe, when one lies within 6 tiles of a port on the route and trading there pays
 * (or builds ties). Unsold goods go on to Europe as before, with whatever was bought there.
 */
function withForeignShipStop(s: GameState, p: Player, stops: RouteStop[]): RouteStop[] {
  const ports = stops.filter((st) => st.at !== EUROPE_STOP).map((st) => s.colonies[st.at]);
  if (!ports.length) return stops;
  const goods = [...new Set(stops.flatMap((st) => st.load.map((r) => r.good)))];
  let best: { stop: RouteStop; score: number } | null = null;
  for (const f of partnerColonies(s, p)) {
    if (!isCoastal(s, f.x, f.y)) continue;
    const d = Math.min(...ports.map((c) => distance(c.x, c.y, f.x, f.y)));
    if (d > 6) continue;
    const plan = foreignStop(s, p, f, goods);
    if (!plan) continue;
    const score = plan.gain + (buildingTies(s, p, f.owner) ? 200 : 0) - d * 10;
    if (score > 0 && (!best || score > best.score)) best = { stop: plan.stop, score };
  }
  if (!best) return stops;
  const end = stops[stops.length - 1];
  const stop = best.stop;
  const extra = stop.load.filter((r) => !end.unload.some((u) => u.good === r.good)).map((r) => ({ good: r.good }));
  return [...stops.slice(0, -1), stop, { ...end, unload: [...end.unload, ...extra] }];
}

/**
 * Goods a colony has to spare for a partner: goods it makes itself (never goods it bought, so two
 * partners' routes cannot pass the same goods back and forth), with at least 30 above what it
 * keeps, or 3 or more to spare every turn.
 */
function spareGoods(s: GameState, c: Colony): GoodId[] {
  const report = colonyReport(s, c);
  return FOREIGN_GOODS.filter((g) => report.produced[g] > 0 && (c.goods[g] - keepFor(c, report, g) >= 30 || report.net[g] >= 3));
}

/** The two stops of a wagon train's route between one of the nation's colonies and a partner's, or null when it does not pay. */
function wagonForeignRules(s: GameState, p: Player, own: Colony, f: Colony): { home: RouteStop; stop: RouteStop; gain: number } | null {
  if (!partnerColonies(s, p).some((o) => o.id === f.id)) return null;
  const plan = foreignStop(s, p, f, spareGoods(s, own));
  if (!plan || !plan.sells.length) return null;
  const report = colonyReport(s, own);
  const load = plan.sells.map((g) => {
    const keep = keepFor(own, report, g);
    return keep > 0 ? { good: g, amount: keep } : { good: g };
  });
  return { home: { at: own.id, load, unload: plan.buys.map((good) => ({ good })) }, stop: plan.stop, gain: plan.gain };
}

/** Partners' colonies already served by one of the nation's wagon train routes. */
function wagonForeignStops(s: GameState, p: Player): Set<string> {
  const out = new Set<string>();
  for (const r of routesOf(s, p.id)) {
    if (!routeUnits(s, r.id).some(isWagon)) continue;
    for (const st of r.stops) if (isForeignStop(s, st, p.id)) out.add(st.at);
  }
  return out;
}

/**
 * Puts an idle wagon train on a route to a partner's colony within reach: from the nation's colony
 * (within 8 tiles of the wagon) with the most to gain, to a partner's colony near it (WAGON_REACH
 * steps at most). Returns whether it did.
 */
function routeWagonForeign(s: GameState, p: Player, wagon: Unit): boolean {
  // Early on, a spare wagon train trades with the natives, which pays better and costs no ties.
  if (s.turn < FOREIGN_WAGON_FROM) return false;
  const pos = unitPosition(s, wagon)!;
  const partners = partnerColonies(s, p);
  if (!partners.length) return false;
  const taken = wagonForeignStops(s, p);
  let best: { own: Colony; f: Colony; score: number } | null = null;
  let checks = 0;
  for (const own of ownColonies(s, p)) {
    if (distance(own.x, own.y, pos.x, pos.y) > 8) continue;
    for (const f of partners) {
      if (taken.has(f.id) || distance(own.x, own.y, f.x, f.y) > 8 || checks++ > 6) continue;
      const rules = wagonForeignRules(s, p, own, f);
      if (!rules) continue;
      const score = rules.gain + (buildingTies(s, p, f.owner) ? 200 : 0) - distance(own.x, own.y, pos.x, pos.y) * 10;
      if (score <= 0 || (best && score <= best.score)) continue;
      if (wagonSteps(s, p, own, f) === null) continue;
      best = { own, f, score };
    }
  }
  if (!best) return false;
  const rules = wagonForeignRules(s, p, best.own, best.f)!;
  const route = createRoute(s, p.id, routeName(s, p, [rules.home, rules.stop]), [rules.home, rules.stop]);
  assignRoute(s, wagon.id, route.id);
  track(p.id, 'route:foreign route created');
  return true;
}

/**
 * Asks a colony near a partner to build a wagon train when the nation is building ties with that
 * partner and has no wagon train route to it yet: the colony within reach with the most hammers.
 * Worked out at route reviews; the choice is kept in the nation's memory until the next one.
 */
function planForeignWagon(s: GameState, p: Player): void {
  const memory = (p.aiMemory = p.aiMemory ?? {});
  delete memory.foreignWagon;
  // Not while the nation is young: early hammers go into growing.
  if (s.turn < FOREIGN_WAGON_FROM || ownColonies(s, p).length < 5) return;
  const partners = partnerColonies(s, p).filter((f) => buildingTies(s, p, f.owner));
  if (!partners.length) return;
  const served = new Set([...wagonForeignStops(s, p)].map((id) => s.colonies[id]?.owner));
  let best: { c: Colony; hammers: number } | null = null;
  let checks = 0;
  for (const f of partners) {
    if (served.has(f.owner)) continue;
    for (const c of ownColonies(s, p)) {
      if (distance(c.x, c.y, f.x, f.y) > 6 || checks++ > 6) continue;
      const hammers = colonyReport(s, c).produced.hammers;
      if (hammers < 3 || (best && hammers <= best.hammers)) continue;
      if (!wagonForeignRules(s, p, c, f) || wagonSteps(s, p, c, f) === null) continue;
      best = { c, hammers };
    }
  }
  if (best) memory.foreignWagon = { colony: best.c.id, until: s.turn + REVIEW_EVERY };
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
    const route = createRoute(s, p.id, routeName(s, p, stops), stops.map((st) => withRules(s, p, st, stops)));
    assignRoute(s, wagon.id, route.id);
    return;
  }
  if (routeWagonForeign(s, p, wagon)) return;
  nativeTrade(s, p, wagon);
}

/**
 * Goods a wagon train bought from natives go to the nation's nearest port, where they are
 * unloaded for the ship routes. Returns whether the wagon is busy hauling.
 */
function haulNativeGoods(s: GameState, p: Player, wagon: Unit): boolean {
  const memory = (p.aiMemory = p.aiMemory ?? {});
  const haul = memory.nativeHaul?.[wagon.id];
  if (!haul) return false;
  const pos = unitPosition(s, wagon)!;
  const c = s.colonies[haul];
  if (c && c.owner === p.id && pos.x === c.x && pos.y === c.y) {
    for (const [g, n] of Object.entries(wagon.cargo ?? {}) as [GoodId, number][]) {
      if (!n) continue;
      c.goods[g] += n;
      wagon.cargo![g] = 0;
    }
    track(p.id, 'natives:goods hauled to port');
  } else if (c && c.owner === p.id && findPath(s, wagon, c.x, c.y)) {
    if (!wagon.dest) setDestination(s, wagon.id, { x: c.x, y: c.y });
    return true;
  }
  delete memory.nativeHaul![wagon.id];
  return false;
}

/** After buying from natives: the nearest port the wagon train can reach takes the goods. */
function sendToPort(s: GameState, p: Player, wagon: Unit): void {
  const pos = unitPosition(s, wagon)!;
  const port = ownColonies(s, p)
    .filter((c) => isCoastal(s, c.x, c.y))
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))
    .find((c) => findPath(s, wagon, c.x, c.y));
  if (!port) return;
  const memory = (p.aiMemory = p.aiMemory ?? {});
  (memory.nativeHaul = memory.nativeHaul ?? {})[wagon.id] = port.id;
}

/**
 * A wagon train without a port sells its colony's surplus to the nearest settlement that pays,
 * and, while it is there, buys goods that fetch clearly more in Europe (ai/natives.ts) and carries
 * them to a port.
 */
function nativeTrade(s: GameState, p: Player, wagon: Unit): void {
  if (haulNativeGoods(s, p, wagon)) return;
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
      if (buyFromNatives(s, p, wagon, st)) sendToPort(s, p, wagon);
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
  const candidate = free.find((u) => (u.loc.kind === 'map' || u.loc.kind === 'europe') && !unitsAboard(s, u).length && !u.dest && !p.aiMemory?.triangle?.[u.id]);
  if (!candidate) return;
  const covered = shipStops(s, p);
  const ports = busiestPorts(s, p, covered);
  if (!ports.length) return;
  const stops: RouteStop[] = [...ports.map((c) => ({ at: c.id, load: [], unload: [] })), { at: EUROPE_STOP, load: [], unload: [] }];
  const route = createRoute(s, p.id, routeName(s, p, stops), withForeignShipStop(s, p, stops.map((st) => withRules(s, p, st, stops))));
  assignRoute(s, candidate.id, route.id);
}
