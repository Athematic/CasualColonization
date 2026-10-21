/**
 * Relations with the other Europeans for the advanced computer levels (Competent, Combative and
 * Creative): proposing trade agreements and Favoured Nation status, answering the Crown's tax
 * raises, choosing a European port, triangle trading (Creative only) and, rarely, cancelling
 * Favoured Nation. Trade routes to partners' colonies are built in logistics.ts. The rules
 * chosen are described in docs/design/favoured-nation.md ("Computer players", step 2).
 *
 * Every random decision here draws from `pairRandom` (a seeded stream per pair of nations and
 * purpose), never from `GameState.rng`, so these decisions shift no other random outcome.
 */
import { defencePower } from '../combat.js';
import {
  answerTax,
  arrears,
  buyGoods,
  buyPrice,
  payArrears,
  portOf,
  portsFor,
  recruitPrice,
  sellPrice,
} from '../europe.js';
import { findPath } from '../movement.js';
import { colonyReport } from '../production.js';
import { cargoFree, colonyAt, distance, isCoastal, isShip, isWater, neighbours, player, tileAt, unitsAt } from '../queries.js';
import {
  atPeace,
  cancelFavoured,
  favouredPartners,
  favouredProblem,
  HOSTILE_AGGRESSION,
  HOSTILITY_WEIGHT,
  hasTradeAgreement,
  isFavoured,
  isHostile,
  pairRandom,
  proposeFavoured,
  proposeTrade,
  tradeProblem,
} from '../relations.js';
import type { GoodId } from '../rules/goods.js';
import { UNIT_TYPES } from '../rules/units.js';
import type { NationId } from '../rules/nations.js';
import { track } from '../telemetry.js';
import type { Colony, GameState, Player, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';
import type { AiProfile } from './profiles.js';

/** Goods the computer players export, and so weigh in tax decisions and port choice. */
export const EXPORT_GOODS: GoodId[] = ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'];

/** Turns between reviews of relations (each nation reviews on a different turn of the cycle). */
export const FOREIGN_REVIEW_EVERY = 5;
/** Colonies at most this far apart make two nations trade neighbours. */
export const TRADE_NEIGHBOUR_TILES = 8;
/** A wagon train must reach the partner's colony within this many steps. */
export const WAGON_REACH = 10;
/** Turns without a new proposal of the same kind to the same nation after one that was not agreed: 10 to 20 (seeded). */
export const PROPOSAL_COOLDOWN = { min: 10, max: 20 };
/** A raise of this many points or more is large. */
export const LARGE_TAX_RAISE = 3;
/** A good whose share of the nation's exports is below this matters little (also: when to pay arrears). */
export const MINOR_GOOD_SHARE = 0.1;
/** Share of a boycotted good's sales a partner's port is reckoned to save (free ships carry it there; routes cannot). */
export const OUTLET_SAVES = 0.5;
/** A raise is refused only when the boycott is reckoned to cost less than this share of what the raise costs. */
export const REFUSAL_MARGIN = 0.7;
/** Gold a trip to a partner's port costs per colonist waiting on the home docks (colonists board only at home). */
export const COLONIST_TRIP_COST = 250;
/** Gold the partner's port must bring above the home port before a ship goes there. */
export const PORT_MARGIN = 25;
/** Triangle trading: least gain per unit, as a share of the buying price (and at least 1 gold). */
export const TRIANGLE_MARGIN = 0.1;
/** Triangle trading: least gain per hold of 100 units. */
export const TRIANGLE_MIN_GAIN = 100;
/** Triangle trading: goods not sold where planned are sold anywhere after this many turns. */
export const TRIANGLE_PATIENCE = 30;
/** Turns between cancelling Favoured Nation and declaring the war it was cancelled for. */
export const WAR_AFTER_CANCEL = 2;
/** Chance per review that a partner at war with natives we run missions among loses its Favoured Nation status. */
export const NATIVE_GRIEVANCE_CHANCE = 0.25;

function reviewTurn(s: GameState, p: Player): boolean {
  const i = Math.max(0, s.config.nations.indexOf(p.id));
  return (s.turn + i) % FOREIGN_REVIEW_EVERY === 0;
}

/** Plays the nation's relations with other Europeans for one turn. Call early in the turn. */
export function foreignAffairs(s: GameState, p: Player, prof: AiProfile, strength: number, army: number): void {
  answerTaxRaise(s, p);
  if (!reviewTurn(s, p)) return;
  safely(() => maybePayArrears(s, p, prof));
  safely(() => reconsiderFavoured(s, p, prof, strength, army));
  if (!s.config.noFavoured) safely(() => makeProposals(s, p, prof, strength));
  pruneTriangles(s, p);
}

// ---------------------------------------------------------------------------
// Proposals

function cooldownKey(kind: 'trade' | 'favoured', nation: NationId): string {
  return `${kind}:${nation}`;
}

function coolingDown(s: GameState, p: Player, kind: 'trade' | 'favoured', nation: NationId): boolean {
  return (p.aiMemory?.proposalCooldown?.[cooldownKey(kind, nation)] ?? -1) > s.turn;
}

function startCooldown(s: GameState, p: Player, kind: 'trade' | 'favoured', nation: NationId): void {
  const memory = (p.aiMemory = p.aiMemory ?? {});
  const cool = (memory.proposalCooldown = memory.proposalCooldown ?? {});
  const r = pairRandom(s, p.id, nation, `${p.id} cooldown ${kind} ${s.turn}`);
  cool[cooldownKey(kind, nation)] = s.turn + PROPOSAL_COOLDOWN.min + Math.floor(r * (PROPOSAL_COOLDOWN.max - PROPOSAL_COOLDOWN.min + 1));
}

/** A wagon-train stand-in at a colony, for path checks. */
function ghost(p: Player, c: { x: number; y: number }): Unit {
  return { id: 'ghost', owner: p.id, type: 'wagonTrain', role: 'none', tools: 0, loc: { kind: 'map', x: c.x, y: c.y }, moves: 0, state: 'active' };
}

/** Steps a wagon train needs from `from` to a land tile next to `to`, or null when it cannot get there. */
export function wagonSteps(s: GameState, p: Player, from: Colony, to: Colony): number | null {
  const g = ghost(p, from);
  let best: number | null = null;
  for (const n of neighbours(s, to.x, to.y)) {
    const t = tileAt(s, n.x, n.y);
    if (!t || isWater(t) || colonyAt(s, n.x, n.y)) continue;
    if (distance(n.x, n.y, from.x, from.y) > WAGON_REACH) continue;
    const path = findPath(s, g, n.x, n.y);
    if (path && path.length <= WAGON_REACH && (best === null || path.length < best)) best = path.length;
  }
  return best;
}

/**
 * Whether two nations are trade neighbours: a colony of each within TRADE_NEIGHBOUR_TILES, both on
 * the coast (ships can trade) or joined by land a wagon train can cross.
 */
export function tradeNeighbours(s: GameState, p: Player, other: NationId): boolean {
  const theirs = Object.values(s.colonies).filter((c) => c.owner === other);
  if (!theirs.length) return false;
  let checks = 0;
  for (const c of ownColonies(s, p)) {
    for (const f of theirs) {
      if (distance(c.x, c.y, f.x, f.y) > TRADE_NEIGHBOUR_TILES) continue;
      if (isCoastal(s, c.x, c.y) && isCoastal(s, f.x, f.y)) return true;
      if (checks++ < 4 && wagonSteps(s, p, c, f) !== null) return true;
    }
  }
  return false;
}

/**
 * Whether Favoured Nation pays for this nation with `other`. It always does for peaceful
 * nations: a second port, sales that bring no tax raise, and a partner that will not attack.
 * A nation bent on war (aggression 0.5 or more) keeps its hands free towards a nation it could
 * attack: one with a colony its spare army would beat, near its own colonies.
 */
export function favouredPays(s: GameState, p: Player, prof: AiProfile, other: NationId, strength: number): boolean {
  if (prof.aggression < 0.5) return true;
  const own = ownColonies(s, p);
  return !Object.values(s.colonies).some(
    (c) => c.owner === other && own.some((o) => distance(o.x, o.y, c.x, c.y) <= 10) && strength / (colonyDefence(s, c) + 1) >= (2.5 / prof.aggression) * 0.6,
  );
}

function makeProposals(s: GameState, p: Player, prof: AiProfile, strength: number): void {
  const memory = p.aiMemory ?? {};
  for (const o of s.players) {
    if (o.id === p.id || o.id === 'crown' || !atPeace(s, p.id, o.id) || isHostile(s, p.id, o.id)) continue;
    if (memory.warTarget && s.colonies[memory.warTarget]?.owner === o.id) continue;
    if (memory.warPlan?.nation === o.id) continue;
    if (!hasTradeAgreement(s, p.id, o.id)) {
      if (coolingDown(s, p, 'trade', o.id) || tradeProblem(s, p.id, o.id) || !tradeNeighbours(s, p, o.id)) continue;
      safely(() => proposeTrade(s, p.id, o.id));
      if (!hasTradeAgreement(s, p.id, o.id)) startCooldown(s, p, 'trade', o.id);
    } else if (!isFavoured(s, p.id, o.id)) {
      // favouredProblem includes the hidden thresholds: like a person, the computer only learns
      // whether relations are close enough, never the numbers.
      if (coolingDown(s, p, 'favoured', o.id) || favouredProblem(s, p.id, o.id) || !favouredPays(s, p, prof, o.id, strength)) continue;
      safely(() => proposeFavoured(s, p.id, o.id));
      if (!isFavoured(s, p.id, o.id)) startCooldown(s, p, 'favoured', o.id);
    }
  }
}

// ---------------------------------------------------------------------------
// War targets (shared with advanced.ts) and cancelling Favoured Nation

export function colonyDefence(s: GameState, c: Colony): number {
  return unitsAt(s, c.x, c.y)
    .filter((u) => u.owner === c.owner && !isShip(u))
    .reduce((sum, u) => sum + defencePower(s, u), 0);
}

export interface WarTarget {
  c: Colony;
  score: number;
  aggression: number;
  /** The score reaches the level at which the nation declares war. */
  ready: boolean;
}

/**
 * The foreign colony the nation would most like to attack with an army of the given strength.
 * Favoured Nations are left out unless `favoured` is set (to weigh cancelling first); a nation
 * whose cancellation still makes it hostile weighs HOSTILITY_WEIGHT times as attractive and is
 * looked for further away.
 */
export function bestWarTarget(s: GameState, p: Player, prof: AiProfile, strength: number, favoured = false): WarTarget | null {
  const colonies = ownColonies(s, p);
  const memory = p.aiMemory ?? {};
  let best: WarTarget | null = null;
  for (const c of Object.values(s.colonies)) {
    if (c.owner === p.id || c.owner === 'crown' || p.stance[c.owner] === 'war') continue;
    if (!favoured && isFavoured(s, p.id, c.owner)) continue;
    if (memory.warPlan && memory.warPlan.nation === c.owner && s.turn < memory.warPlan.turn) continue;
    const enemy = s.players.find((o) => o.id === c.owner);
    if (!enemy || enemy.independence !== 'none') continue;
    const hostile = isHostile(s, p.id, c.owner);
    const aggression = hostile ? Math.max(prof.aggression, HOSTILE_AGGRESSION) : prof.aggression;
    if (aggression <= 0) continue;
    const near = colonies.some((own) => distance(own.x, own.y, c.x, c.y) <= (hostile ? 14 : 10));
    if (!near) continue;
    const score = (strength / (colonyDefence(s, c) + 1)) * (hostile ? HOSTILITY_WEIGHT : 1);
    if (!best || score / (2.5 / aggression) > best.score / (2.5 / best.aggression)) best = { c, score, aggression, ready: score >= 2.5 / aggression };
  }
  return best;
}

/**
 * Cancels Favoured Nation, rarely and only for a reason:
 * - the partner is at war with a tribe this nation runs a mission among (a seeded chance per
 *   review, NATIVE_GRIEVANCE_CHANCE), or
 * - the nation wants war (aggression 1: Combative, or Creative set on war), no other nation offers
 *   a target it would attack, and a partner's colony makes a clearly good one (half as good again
 *   as the level at which it declares war). It cancels first; the war comes WAR_AFTER_CANCEL turns
 *   later at the earliest, once the cancellation's penalties (routes ended, goods seized, waiting
 *   and hostility) apply, so the war itself is not the cancellation.
 */
function reconsiderFavoured(s: GameState, p: Player, prof: AiProfile, strength: number, army: number): void {
  const partners = favouredPartners(s, p.id);
  if (!partners.length || p.independence !== 'none') return;
  const memory = (p.aiMemory = p.aiMemory ?? {});
  const missions = new Set(Object.values(s.settlements).filter((st) => st.mission === p.id).map((st) => st.tribe));
  for (const o of partners) {
    const grievance = s.tribes.some((t) => missions.has(t.id) && t.stance[p.id] !== 'war' && t.stance[o] === 'war');
    if (grievance && pairRandom(s, p.id, o, `${p.id} natives ${s.turn}`) < NATIVE_GRIEVANCE_CHANCE) {
      track(p.id, 'diplomacy:favoured nation cancelled over natives');
      cancelFavoured(s, p.id, o);
      return;
    }
  }
  if (prof.aggression < 1 || army < 2 || s.turn <= 50 || s.turn - (memory.lastWar ?? -100) <= 40 || memory.warPlan) return;
  if (bestWarTarget(s, p, prof, strength)?.ready) return;
  const target = bestWarTarget(s, p, prof, strength, true);
  if (!target || !isFavoured(s, p.id, target.c.owner) || target.score < 1.5 * (2.5 / target.aggression)) return;
  track(p.id, 'diplomacy:favoured nation cancelled for war');
  cancelFavoured(s, p.id, target.c.owner);
  memory.warPlan = { nation: target.c.owner, turn: s.turn + WAR_AFTER_CANCEL };
}

// ---------------------------------------------------------------------------
// Taxes

/** A good's share of the nation's exports: what its colonies hold and make of it, at home prices. */
export function exportShare(s: GameState, p: Player, good: GoodId): number {
  let total = 0;
  let mine = 0;
  for (const c of ownColonies(s, p)) {
    const report = colonyReport(s, c);
    for (const g of EXPORT_GOODS) {
      const v = (c.goods[g] + Math.max(0, report.net[g]) * 8) * Math.max(1, sellPrice(p, g));
      total += v;
      if (g === good) mine += v;
    }
  }
  return total > 0 ? mine / total : 0;
}

/** Gold one unit of a good fetches in a port after that port's tax; 0 where it cannot be sold. */
export function portNet(s: GameState, p: Player, port: NationId, good: GoodId): number {
  const market = port === p.id ? p : player(s, port);
  if (port === p.id && p.boycotts[good]) return 0;
  return (sellPrice(market, good) * (100 - market.tax)) / 100;
}

/** Whether a Favoured Nation partner's port sells the good for at least 70% of the home price after the new tax. */
function partnerOutlet(s: GameState, p: Player, good: GoodId, rate: number): boolean {
  const home = (sellPrice(p, good) * (100 - rate)) / 100;
  return favouredPartners(s, p.id).some((o) => portNet(s, p, o, good) >= home * 0.7);
}

/**
 * Whether to refuse a tax raise (and boycott the good). Never for goods the nation buys (tools,
 * muskets, horses, trade goods) or food and lumber. Otherwise it weighs the two costs, as shares
 * of the nation's export income: accepting costs the raise on everything else it sells, refusing
 * costs the good's own sales (half of them when a Favoured Nation partner's port pays at least 70%
 * of the home price for it, since free ships can sell it there). It refuses when refusing costs
 * less than REFUSAL_MARGIN of accepting, and, without a partner's port, only a large raise
 * (LARGE_TAX_RAISE points or more) on a good below MINOR_GOOD_SHARE of its exports.
 */
export function refusesTax(s: GameState, p: Player, pending: { rate: number; good: GoodId }): boolean {
  if (!EXPORT_GOODS.includes(pending.good)) return false;
  const raise = pending.rate - p.tax;
  if (raise <= 0) return false;
  const share = exportShare(s, p, pending.good);
  const outlet = partnerOutlet(s, p, pending.good, pending.rate);
  if (!outlet && (raise < LARGE_TAX_RAISE || share >= MINOR_GOOD_SHARE)) return false;
  const refusing = share * (100 - p.tax) * (outlet ? 1 - OUTLET_SAVES : 1);
  const accepting = (1 - share) * raise;
  return refusing < accepting * REFUSAL_MARGIN;
}

function answerTaxRaise(s: GameState, p: Player): void {
  const pending = p.pendingTax;
  if (!pending) return;
  safely(() => {
    answerTax(s, p.id, !refusesTax(s, p, pending));
  });
}

/**
 * Pays the arrears on a boycotted good when it is worth it: no partner port takes it, and either it
 * has become a real export (MINOR_GOOD_SHARE or more) or the colonies hold at least twice the
 * arrears' worth of it. Only with the arrears plus 1,000 gold to spare above the reserve.
 */
function maybePayArrears(s: GameState, p: Player, prof: AiProfile): void {
  if (p.independence !== 'none') return;
  for (const g of Object.keys(p.boycotts) as GoodId[]) {
    if (!p.boycotts[g]) continue;
    const cost = arrears(p, g);
    if (p.gold < prof.reserve + cost + 1000 || partnerOutlet(s, p, g, p.tax)) continue;
    const stock = ownColonies(s, p).reduce((n, c) => n + c.goods[g], 0);
    const worth = stock * ((sellPrice(p, g) * (100 - p.tax)) / 100);
    if (exportShare(s, p, g) >= MINOR_GOOD_SHARE || worth >= cost * 2) payArrears(s, p.id, g);
  }
}

// ---------------------------------------------------------------------------
// Ports and triangle trading

/** Colonists a trip home would bring: those waiting on the docks, and recruits the treasury pays for (up to 3). */
function colonistsForTrip(s: GameState, p: Player): number {
  let n = 0;
  for (const u of Object.values(s.units)) if (u.owner === p.id && u.loc.kind === 'europe' && !isShip(u)) n++;
  const price = recruitPrice(p);
  return n + Math.min(4, Math.floor(Math.max(0, p.gold - 300) / price));
}

/** What a ship's cargo fetches in a port, after the port's tax. Supplies are not for sale. */
export function cargoValue(s: GameState, p: Player, ship: Unit, port: NationId): number {
  let v = 0;
  for (const [g, n] of Object.entries(ship.cargo ?? {}) as [GoodId, number][]) {
    if (n > 0 && (EXPORT_GOODS.includes(g) || g === 'tradeGoods')) v += n * portNet(s, p, port, g);
  }
  return v;
}

/**
 * The European port a ship should sail to: the home port, or a Favoured Nation partner's when its
 * cargo fetches more there after tax. Every port is reached from the same high seas in the same
 * number of turns (the engine has one Atlantic crossing), so distance does not count. What does
 * count is that colonists board only in the home port: each one the trip could bring home (waiting
 * on the docks, or recruits the treasury pays for), up to the ship's holds, costs a partner trip
 * COLONIST_TRIP_COST, and the partner must also beat home by PORT_MARGIN.
 */
export function choosePort(s: GameState, p: Player, ship: Unit): NationId {
  const ports = portsFor(s, p.id);
  if (ports.length < 2 || !ship.cargo) return p.id;
  const home = cargoValue(s, p, ship, p.id);
  const delay = Math.min(colonistsForTrip(s, p), UNIT_TYPES[ship.type].cargo) * COLONIST_TRIP_COST + PORT_MARGIN;
  let best: { port: NationId; value: number } = { port: p.id, value: home };
  for (const port of ports.slice(1)) {
    const v = cargoValue(s, p, ship, port) - delay;
    if (v > best.value) best = { port, value: v };
  }
  return best.port;
}

/** Whether a ship in Europe should sell this good now, or keep it for the port it was bought for. */
export function sellHere(s: GameState, p: Player, ship: Unit, good: GoodId): boolean {
  const plan = p.aiMemory?.triangle?.[ship.id];
  if (!plan || plan.good !== good) return true;
  const here = portOf(ship);
  return here === plan.port || s.turn - plan.turn > TRIANGLE_PATIENCE || !portsFor(s, p.id).includes(plan.port) || portNet(s, p, here, good) >= plan.net;
}

/** After a sale: a triangle trade completes when its goods are sold in the port they were bought for. */
export function noteSale(p: Player, ship: Unit, good: GoodId): void {
  const memory = p.aiMemory;
  const plan = memory?.triangle?.[ship.id];
  if (!plan || plan.good !== good) return;
  if (portOf(ship) === plan.port) track(p.id, 'trade:triangle trade');
  delete memory!.triangle![ship.id];
}

/**
 * Creative's triangle trading: with holds to spare in one port, buy a good that another port the
 * nation can use (home or a Favoured Nation partner's) pays clearly more for after its tax, and
 * sell it there on the next crossing. At most two holds, and half the gold above the reserve.
 */
export function triangleBuy(s: GameState, p: Player, ship: Unit, prof: AiProfile): void {
  if (!prof.adaptive || ship.loc.kind !== 'europe' || p.aiMemory?.triangle?.[ship.id]) return;
  const ports = portsFor(s, p.id);
  if (ports.length < 2) return;
  const here = portOf(ship);
  const market = here === p.id ? p : player(s, here);
  const holds = Math.min(2, cargoFree(s, ship));
  if (holds <= 0) return;
  let best: { good: GoodId; port: NationId; gain: number; net: number; price: number } | null = null;
  for (const g of EXPORT_GOODS) {
    if (here === p.id && p.boycotts[g]) continue;
    const price = buyPrice(market, g);
    for (const port of ports) {
      if (port === here) continue;
      const net = portNet(s, p, port, g);
      const gain = net - price;
      if (gain < Math.max(1, price * TRIANGLE_MARGIN) || gain * 100 < TRIANGLE_MIN_GAIN) continue;
      if (!best || gain > best.gain) best = { good: g, port, gain, net, price };
    }
  }
  if (!best) return;
  const budget = Math.floor((p.gold - prof.reserve) / 2);
  const amount = Math.min(holds * 100, Math.floor(budget / best.price / 100) * 100);
  if (amount < 100) return;
  buyGoods(s, ship.id, best.good, amount);
  const memory = (p.aiMemory = p.aiMemory ?? {});
  memory.triangle = memory.triangle ?? {};
  memory.triangle[ship.id] = { good: best.good, port: best.port, turn: s.turn, net: best.net };
  track(p.id, 'trade:triangle goods bought', amount);
}

/** Forgets triangle plans of ships that are gone or no longer carry the goods. */
function pruneTriangles(s: GameState, p: Player): void {
  const plans = p.aiMemory?.triangle;
  if (!plans) return;
  for (const [id, plan] of Object.entries(plans)) {
    const ship = s.units[id];
    if (!ship || ship.owner !== p.id || !(ship.cargo?.[plan.good] ?? 0)) delete plans[id];
  }
  if (!Object.keys(plans).length) delete p.aiMemory!.triangle;
}
