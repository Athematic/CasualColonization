/**
 * Relations between European nations: years of peace, trade agreements, trade routes between
 * them, Favoured Nation status and what cancelling it costs. See docs/design/favoured-nation.md.
 *
 * Hidden values (the thresholds for Favoured Nation, the waiting and hostility periods after a
 * cancellation) come from a dedicated random stream seeded by the game seed, the pair of nations
 * and a counter, never from `GameState.rng`. So the same seed always gives the same values, and
 * drawing them does not shift any other random outcome of the game.
 */
import { fail } from './errors.js';
import { buyPrice, sellPrice } from './europe.js';
import { noteTrade } from './stats.js';
import { cargoRoomFor, colonyAt, distance, isShip, message, player, unitName, unitPosition, warehouseCapacity } from './queries.js';
import { random } from './rng.js';
import { GOODS } from './rules/goods.js';
import { NATIONS, type NationId } from './rules/nations.js';
import { track } from './telemetry.js';
import type { GameState, ProposalKind, Relation, RouteCargo, Unit } from './types.js';

/** Years of peace needed for Favoured Nation: 10, plus or minus up to 2. */
export const PEACE_YEARS = { base: 10, spread: 2 };
/** Active trade routes between the two nations needed: 2 to 4. */
export const ROUTES_NEEDED = { min: 2, max: 4 };
/** After a cancellation: no new trade agreements or routes for 10 years, plus or minus up to 3. */
export const WAITING_YEARS = { base: 10, spread: 3 };
/** After a cancellation: computer players treat the other side as a target for 15 years, plus or minus up to 5. */
export const HOSTILITY_YEARS = { base: 15, spread: 5 };
/** Gold that must have changed hands at each other's colonies before a computer player sees Favoured Nation as profitable. */
export const FAVOURED_MIN_VOLUME = 300;
/** How much more readily a computer player attacks a nation it is hostile to (see ai/advanced.ts). */
export const HOSTILITY_WEIGHT = 1.6;
/** The least aggression a computer player shows towards a nation it is hostile to, even a peaceful level (profiles.ts). */
export const HOSTILE_AGGRESSION = 0.3;
/** Units of each good a colony keeps when a foreign trade route buys from it. */
export const FOREIGN_KEEP = 50;

const SALT = 0x0fa7_0e1d;

/** A small seeded stream for one pair of nations and one purpose; independent of `GameState.rng`. */
function stream(s: GameState, a: NationId, b: NationId, purpose: string): { rng: number } {
  // FNV-1a over the purpose and the pair (in a fixed order), mixed with the game seed.
  const [x, y] = [a, b].sort();
  let h = 0x811c9dc5 ^ SALT;
  for (const ch of `${purpose}|${x}|${y}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  const holder = { rng: (h ^ Math.imul(s.config.seed | 0, 0x9e3779b1)) | 0 };
  random(holder);
  return holder;
}

/** A whole number from base − spread to base + spread, both included. */
function around(r: { rng: number }, v: { base: number; spread: number }): number {
  return v.base - v.spread + Math.floor(random(r) * (2 * v.spread + 1));
}

export function relationKey(a: NationId, b: NationId): string {
  return [a, b].sort().join('|');
}

/** Whether two nations can have relations at all: two different European nations. */
function europeanPair(a: NationId, b: NationId): boolean {
  return a !== b && a !== 'crown' && b !== 'crown';
}

/** The relation between two nations, created (with its seeded thresholds) when first needed. */
export function relation(s: GameState, a: NationId, b: NationId): Relation {
  s.relations = s.relations ?? {};
  const key = relationKey(a, b);
  let rel = s.relations[key];
  if (!rel) {
    const r = stream(s, a, b, 'thresholds');
    const order = s.config.nations;
    const [first, second] = order.indexOf(a) <= order.indexOf(b) ? [a, b] : [b, a];
    rel = {
      a: first,
      b: second,
      peaceSince: 0,
      peaceNeeded: around(r, PEACE_YEARS),
      routesNeeded: ROUTES_NEEDED.min + Math.floor(random(r) * (ROUTES_NEEDED.max - ROUTES_NEEDED.min + 1)),
      volume: 0,
    };
    s.relations[key] = rel;
  }
  return rel;
}

/** Draws every pair's hidden thresholds at the start of a game. */
export function initRelations(s: GameState): void {
  const nations = s.config.nations;
  for (let i = 0; i < nations.length; i++) for (let j = i + 1; j < nations.length; j++) relation(s, nations[i], nations[j]);
}

/** The game year of a turn, with autumn turns as half years. */
export function yearValue(turn: number): number {
  return turn < 108 ? 1492 + turn : 1600 + (turn - 108) / 2;
}

/** The first turn at least `years` years after `turn`. */
export function turnAfterYears(turn: number, years: number): number {
  const goal = yearValue(turn) + years;
  let t = turn;
  while (yearValue(t) < goal) t++;
  return t;
}

function other(rel: Relation, nation: NationId): NationId {
  return rel.a === nation ? rel.b : rel.a;
}

function takePart(s: GameState, a: NationId, b: NationId): boolean {
  return s.players.some((p) => p.id === a) && s.players.some((p) => p.id === b);
}

export function atPeace(s: GameState, a: NationId, b: NationId): boolean {
  return player(s, a).stance[b] !== 'war';
}

/** Years of continuous peace between two nations; 0 while at war. */
export function yearsOfPeace(s: GameState, a: NationId, b: NationId): number {
  if (!europeanPair(a, b) || !atPeace(s, a, b)) return 0;
  return yearValue(s.turn) - yearValue(relation(s, a, b).peaceSince);
}

export function hasTradeAgreement(s: GameState, a: NationId, b: NationId): boolean {
  return europeanPair(a, b) && !!s.relations?.[relationKey(a, b)]?.trade;
}

export function isFavoured(s: GameState, a: NationId, b: NationId): boolean {
  return europeanPair(a, b) && !!s.relations?.[relationKey(a, b)]?.favoured;
}

/** Whether the hostility after a cancellation still lasts. Hidden from players; computer players act on it. */
export function isHostile(s: GameState, a: NationId, b: NationId): boolean {
  const rel = europeanPair(a, b) ? s.relations?.[relationKey(a, b)] : undefined;
  return !!rel?.hostileUntil && s.turn < rel.hostileUntil;
}

/** Whether the waiting period after a cancellation still lasts. */
export function inWaitingPeriod(s: GameState, a: NationId, b: NationId): boolean {
  const rel = europeanPair(a, b) ? s.relations?.[relationKey(a, b)] : undefined;
  return !!rel?.waitUntil && s.turn < rel.waitUntil;
}

/** Nations whose home ports a nation's ships may use: its Favoured Nation partners that still have one. */
export function favouredPartners(s: GameState, nation: NationId): NationId[] {
  return s.players.filter((p) => p.id !== nation && p.independence === 'none' && isFavoured(s, nation, p.id)).map((p) => p.id);
}

function bothHuman(s: GameState, a: NationId, b: NationId): boolean {
  return player(s, a).human && player(s, b).human;
}

/** Whether a route stops at a colony of `of`. */
function stopsAt(s: GameState, stops: { at: string }[], of: NationId): boolean {
  return stops.some((st) => s.colonies[st.at]?.owner === of);
}

/**
 * Active trade routes between two nations: routes of either one that stop at a colony of the
 * other and have at least one ship or wagon train following them.
 */
export function routesBetween(s: GameState, a: NationId, b: NationId): number {
  const used = new Set<string>();
  for (const u of Object.values(s.units)) if (u.route) used.add(u.route.id);
  let n = 0;
  for (const r of Object.values(s.routes ?? {})) {
    if (!used.has(r.id)) continue;
    if ((r.owner === a && stopsAt(s, r.stops, b)) || (r.owner === b && stopsAt(s, r.stops, a))) n++;
  }
  return n;
}

/** Whether the years of peace and the trade routes between two nations both reach the hidden thresholds. */
export function favouredUnlocked(s: GameState, a: NationId, b: NationId): boolean {
  const rel = relation(s, a, b);
  return yearsOfPeace(s, a, b) >= rel.peaceNeeded && routesBetween(s, a, b) >= rel.routesNeeded;
}

/** Why `from` cannot propose a trade agreement to `to` now, or null. */
export function tradeProblem(s: GameState, from: NationId, to: NationId): string | null {
  if (!europeanPair(from, to)) return 'Trade agreements are made between two European nations.';
  if (!takePart(s, from, to)) return `${NATIONS[to].name} is not taking part.`;
  const name = NATIONS[to].name;
  if (!atPeace(s, from, to)) return `You are at war with ${name}.`;
  if (hasTradeAgreement(s, from, to)) return `You already have a trade agreement with ${name}.`;
  if (!bothHuman(s, from, to) && inWaitingPeriod(s, from, to)) return `${nationTitleOf(to)} will not talk trade so soon after the last agreement was broken.`;
  const pending = relation(s, from, to).proposal;
  if (pending) return pending.from === from ? `${nationTitleOf(to)} has not answered your last proposal yet.` : `${nationTitleOf(to)} is waiting for your answer to its proposal.`;
  return null;
}

/** Why `from` cannot propose Favoured Nation status to `to` now, or null. */
export function favouredProblem(s: GameState, from: NationId, to: NationId): string | null {
  if (!europeanPair(from, to)) return 'Favoured Nation status is agreed between two European nations.';
  if (!takePart(s, from, to)) return `${NATIONS[to].name} is not taking part.`;
  const name = NATIONS[to].name;
  if (!atPeace(s, from, to)) return `You are at war with ${name}.`;
  if (isFavoured(s, from, to)) return `${nationTitleOf(to)} is already a Favoured Nation.`;
  if (player(s, from).independence !== 'none' || player(s, to).independence !== 'none') return 'Only nations with a home port in Europe can become Favoured Nations.';
  const pending = relation(s, from, to).proposal;
  if (pending) return pending.from === from ? `${nationTitleOf(to)} has not answered your last proposal yet.` : `${nationTitleOf(to)} is waiting for your answer to its proposal.`;
  // Two people can agree at any time; otherwise peace and trade must have grown first.
  if (bothHuman(s, from, to)) return null;
  if (inWaitingPeriod(s, from, to)) return `${nationTitleOf(to)} does not trust you again yet.`;
  if (!hasTradeAgreement(s, from, to)) return `You need a trade agreement with ${name} first.`;
  if (!favouredUnlocked(s, from, to)) return `Relations with ${name} are not yet close enough: they need more years of peace and more trade routes between you.`;
  return null;
}

function nationTitleOf(n: NationId): string {
  const name = NATIONS[n].name;
  return name[0].toUpperCase() + name.slice(1);
}

/** Computer players accept a trade agreement when at peace and not hostile. */
export function aiAcceptsTrade(s: GameState, ai: NationId, from: NationId): boolean {
  return atPeace(s, ai, from) && !isHostile(s, ai, from) && !inWaitingPeriod(s, ai, from);
}

/**
 * Computer players accept Favoured Nation when not hostile, at peace, and the relationship
 * pays: enough gold has changed hands between them, or the peace has lasted twice as long as
 * needed. A computer player that has picked one of the proposer's colonies as a war target refuses.
 */
export function aiAcceptsFavoured(s: GameState, ai: NationId, from: NationId): boolean {
  if (!atPeace(s, ai, from) || isHostile(s, ai, from)) return false;
  const target = player(s, ai).aiMemory?.warTarget;
  if (target && s.colonies[target]?.owner === from) return false;
  const rel = relation(s, ai, from);
  return rel.volume >= FAVOURED_MIN_VOLUME || yearsOfPeace(s, ai, from) >= rel.peaceNeeded * 2;
}

export function proposeTrade(s: GameState, from: NationId, to: NationId): string {
  const problem = tradeProblem(s, from, to);
  if (problem) fail(problem);
  track(from, 'cmd:proposeTrade');
  return propose(s, 'trade', from, to);
}

export function proposeFavoured(s: GameState, from: NationId, to: NationId): string {
  const problem = favouredProblem(s, from, to);
  if (problem) fail(problem);
  track(from, 'cmd:proposeFavoured');
  return propose(s, 'favoured', from, to);
}

const KIND_NAME: Record<ProposalKind, string> = { trade: 'a trade agreement', favoured: 'Favoured Nation status' };

function propose(s: GameState, kind: ProposalKind, from: NationId, to: NationId): string {
  const target = player(s, to);
  if (target.human) {
    relation(s, from, to).proposal = { kind, from, turn: s.turn };
    message(s, `${nationTitleOf(from)} proposes ${KIND_NAME[kind]}.`, to);
    return `Your proposal of ${KIND_NAME[kind]} has been sent to ${NATIONS[to].name}.`;
  }
  const yes = kind === 'trade' ? aiAcceptsTrade(s, to, from) : aiAcceptsFavoured(s, to, from);
  if (!yes) {
    const text = `${nationTitleOf(to)} turns down ${KIND_NAME[kind]}.`;
    message(s, text, from);
    return text;
  }
  return kind === 'trade' ? makeTradeAgreement(s, from, to) : makeFavoured(s, from, to);
}

/** A person answers a proposal from `from`. */
export function answerProposal(s: GameState, nation: NationId, from: NationId, accept: boolean): string {
  if (!europeanPair(nation, from)) fail('There is no such proposal.');
  const rel = relation(s, nation, from);
  const p = rel.proposal;
  if (!p || p.from !== from) fail(`${nationTitleOf(from)} has made no proposal.`);
  delete rel.proposal;
  track(nation, 'cmd:answerProposal');
  if (!accept) {
    message(s, `${nationTitleOf(nation)} turns down ${KIND_NAME[p.kind]}.`, from);
    return `You turn down ${KIND_NAME[p.kind]} with ${NATIONS[from].name}.`;
  }
  // Check again: things may have changed since the proposal was made.
  const problem = p.kind === 'trade' ? tradeProblem(s, from, nation) : favouredProblem(s, from, nation);
  if (problem) fail(problem);
  return p.kind === 'trade' ? makeTradeAgreement(s, from, nation) : makeFavoured(s, from, nation);
}

export function makeTradeAgreement(s: GameState, a: NationId, b: NationId): string {
  relation(s, a, b).trade = true;
  track(a, 'diplomacy:trade agreement made');
  track(b, 'diplomacy:trade agreement made');
  const text = `${nationTitleOf(a)} and ${NATIONS[b].name} have signed a trade agreement. Their trade routes may now call at each other's colonies.`;
  message(s, text);
  return text;
}

export function makeFavoured(s: GameState, a: NationId, b: NationId): string {
  const rel = relation(s, a, b);
  rel.trade = true;
  rel.favoured = true;
  track(a, 'diplomacy:favoured nation made');
  track(b, 'diplomacy:favoured nation made');
  const text = `${nationTitleOf(a)} and ${NATIONS[b].name} are now Favoured Nations: their ships may trade, and buy merchant ships, in each other's home ports.`;
  message(s, text);
  return text;
}

/**
 * Ends a plain trade agreement (one without Favoured Nation status): the stops at each other's
 * colonies are dropped from both nations' routes. No goods are seized and no penalty follows.
 */
export function cancelTrade(s: GameState, by: NationId, to: NationId): string {
  if (!hasTradeAgreement(s, by, to)) fail(`You have no trade agreement with ${NATIONS[to].name}.`);
  if (isFavoured(s, by, to)) fail('Cancel the Favoured Nation status instead; that ends the trade agreement too.');
  track(by, 'cmd:cancelTrade');
  const rel = relation(s, by, to);
  delete rel.trade;
  delete rel.proposal;
  pruneRoutes(s, by, to);
  const text = `${nationTitleOf(by)} has ended its trade agreement with ${NATIONS[to].name}.`;
  message(s, text);
  return text;
}

/**
 * Cancels Favoured Nation status, with the consequences agreed in the design: the trade
 * agreement and every trade route stop between the two end, goods near the other side's
 * colonies are seized, and (unless both are people) a hidden waiting period and a hidden
 * period of hostility begin. Both sides suffer, whoever cancels.
 */
export function cancelFavoured(s: GameState, by: NationId, to: NationId, why: 'cancel' | 'war' = 'cancel'): string {
  if (!isFavoured(s, by, to)) fail(`${nationTitleOf(to)} is not a Favoured Nation.`);
  if (why === 'cancel') track(by, 'cmd:cancelFavoured');
  track(by, 'diplomacy:favoured nation cancelled');
  const rel = relation(s, by, to);
  delete rel.favoured;
  delete rel.trade;
  delete rel.proposal;
  pruneRoutes(s, by, to);
  sendShipsHome(s, by, to);
  const seized = [seizeGoods(s, to, by), seizeGoods(s, by, to)];
  if (!bothHuman(s, by, to)) {
    rel.cancels = (rel.cancels ?? 0) + 1;
    const r = stream(s, by, to, `cancel ${rel.cancels}`);
    rel.waitUntil = turnAfterYears(s.turn, around(r, WAITING_YEARS));
    rel.hostileUntil = turnAfterYears(s.turn, around(r, HOSTILITY_YEARS));
  }
  // Favoured Nation status needs a new run of peace.
  rel.peaceSince = s.turn;
  const parts = seized.filter(Boolean);
  const text = `${nationTitleOf(by)} has cancelled the Favoured Nation status with ${NATIONS[to].name}${why === 'war' ? ' by declaring war' : ''}. Trade routes between them are cancelled.${parts.length ? ` ${parts.join(' ')}` : ''}`;
  message(s, text);
  return text;
}

/**
 * When a nation declares independence it loses its home port, and with it every Favoured Nation
 * status. This lapse is not a cancellation: no goods are seized and no penalty follows. The trade
 * agreements stay.
 */
export function lapseFavoured(s: GameState, nation: NationId): void {
  for (const rel of Object.values(s.relations ?? {})) {
    if (!rel.favoured || (rel.a !== nation && rel.b !== nation)) continue;
    const partner = other(rel, nation);
    delete rel.favoured;
    if (rel.proposal?.kind === 'favoured') delete rel.proposal;
    sendShipsHome(s, nation, partner);
    message(s, `With ${NATIONS[nation].name}'s declaration of independence, its Favoured Nation status with ${NATIONS[partner].name} has lapsed.`);
  }
}

/** Called when a war starts: a trade agreement ends, and Favoured Nation status is cancelled by the nation that declared war. */
export function onWar(s: GameState, by: NationId, to: NationId): void {
  if (!europeanPair(by, to) || !s.relations?.[relationKey(by, to)]) return;
  const rel = relation(s, by, to);
  delete rel.proposal;
  if (rel.favoured) cancelFavoured(s, by, to, 'war');
  else if (rel.trade) {
    delete rel.trade;
    pruneRoutes(s, by, to);
    message(s, `The trade agreement between ${NATIONS[by].name} and ${NATIONS[to].name} ends with the war.`);
  }
}

/** Called when peace is made: a new run of peace begins. */
export function onPeace(s: GameState, a: NationId, b: NationId): void {
  if (europeanPair(a, b)) relation(s, a, b).peaceSince = s.turn;
}

/**
 * Drops every stop at the other nation's colonies from both nations' trade routes. A route left
 * with fewer than two stops lets its units go, and they wait for orders.
 */
function pruneRoutes(s: GameState, a: NationId, b: NationId): void {
  for (const route of Object.values(s.routes ?? {})) {
    const partner = route.owner === a ? b : route.owner === b ? a : null;
    if (!partner) continue;
    const keep = route.stops.filter((st) => s.colonies[st.at]?.owner !== partner);
    if (keep.length === route.stops.length) continue;
    route.stops = keep;
    for (const u of Object.values(s.units)) {
      if (u.route?.id !== route.id) continue;
      if (keep.length < 2) {
        delete u.route;
        delete u.dest;
        message(s, `${unitName(u)} leaves the ${route.name} route, which no longer has two stops, and waits for orders.`, u.owner, unitPosition(s, u));
      } else {
        u.route.stop = u.route.stop % keep.length;
        delete u.dest;
      }
    }
    message(s, `The ${route.name} route no longer calls at ${NATIONS[partner].adjective} colonies.`, route.owner);
  }
}

/** Ships of either nation in, or sailing to, the other's home port go to their own. */
function sendShipsHome(s: GameState, a: NationId, b: NationId): void {
  for (const u of Object.values(s.units)) {
    const partner = u.owner === a ? b : u.owner === b ? a : null;
    if (!partner || (u.loc.kind !== 'europe' && u.loc.kind !== 'sailing') || u.loc.port !== partner) continue;
    delete u.loc.port;
    if (u.dest && 'europe' in u.dest) delete u.dest.port;
    message(s, `${unitName(u)} has to leave the ${NATIONS[partner].adjective} port and returns to its own.`, u.owner);
  }
}

/**
 * Goods carried by `from`'s ships and wagon trains in or next to a colony of `by` are seized by
 * `by`, and put into the nearest such colony as far as its warehouse has room; the rest is lost.
 * Returns a report, or '' when nothing was seized.
 */
function seizeGoods(s: GameState, by: NationId, from: NationId): string {
  const colonies = Object.values(s.colonies).filter((c) => c.owner === by);
  if (!colonies.length) return '';
  let total = 0;
  for (const u of Object.values(s.units)) {
    if (u.owner !== from || u.loc.kind !== 'map' || !u.cargo) continue;
    const { x, y } = u.loc;
    const colony = colonies.filter((c) => distance(c.x, c.y, x, y) <= 1).sort((p, q) => distance(p.x, p.y, x, y) - distance(q.x, q.y, x, y))[0];
    if (!colony) continue;
    let taken = 0;
    for (const g of GOODS) {
      const n = u.cargo[g] ?? 0;
      if (n <= 0) continue;
      const room = g === 'food' ? n : Math.max(0, warehouseCapacity(colony) - colony.goods[g]);
      colony.goods[g] += Math.min(n, room);
      taken += n;
      delete u.cargo[g];
    }
    if (!taken) continue;
    total += taken;
    track(by, 'diplomacy:goods seized', taken);
    message(s, `${nationTitleOf(by)} seizes the ${taken} goods aboard ${unitName(u)} near ${colony.name}.`, from, { x, y });
    message(s, `Our people in ${colony.name} seize ${taken} goods from a ${NATIONS[from].adjective} ${isShip(u) ? 'ship' : 'wagon train'}.`, by, colony);
  }
  return total ? `${nationTitleOf(by)} seizes ${total} ${NATIONS[from].adjective} goods near its colonies.` : '';
}

/** A vague description of how close two nations are, for the diplomacy screen. Never shows the hidden numbers. */
export function relationsMood(s: GameState, a: NationId, b: NationId): string {
  if (!atPeace(s, a, b)) return 'At war';
  if (isFavoured(s, a, b)) return 'Favoured Nations';
  const human = bothHuman(s, a, b);
  if (!human && isHostile(s, a, b)) return 'Relations are hostile';
  if (!human && inWaitingPeriod(s, a, b)) return 'Trust has to be rebuilt';
  const rel = relation(s, a, b);
  const share = yearsOfPeace(s, a, b) / rel.peaceNeeded;
  if (share < 0.3) return 'Relations are cool';
  if (share < 0.7) return 'Relations are warming';
  if (share < 1) return 'Relations are friendly';
  return 'A long friendship';
}

/** A vague description of the trade ties between two nations. */
export function tradeTies(s: GameState, a: NationId, b: NationId): string {
  const n = routesBetween(s, a, b);
  if (!hasTradeAgreement(s, a, b)) return n ? 'Some trade' : 'No trade';
  if (n === 0) return 'No routes yet';
  return n >= relation(s, a, b).routesNeeded ? 'Strong trade ties' : 'Trade is growing';
}

// ---------------------------------------------------------------------------
// Trading at a foreign colony (a trade route stop)

export interface ForeignTrade {
  sold: number;
  earned: number;
  bought: number;
  spent: number;
  /** The colony could not pay for everything that was to be unloaded. */
  short: boolean;
}

/**
 * Unloads (sells) and loads (buys) at a trade partner's colony. Unloaded goods go into the
 * colony's warehouse as far as there is room, and its owner pays its own home-market sell price,
 * with no tax, as far as its treasury allows. Loaded goods are the colony's surplus above
 * FOREIGN_KEEP (or the rule's amount), bought at the owner's home-market buy price.
 */
export function tradeAtForeignColony(
  s: GameState,
  u: Unit,
  colonyId: string,
  unload: RouteCargo[],
  load: RouteCargo[],
): ForeignTrade {
  const colony = s.colonies[colonyId];
  const owner = player(s, colony.owner);
  const me = player(s, u.owner);
  const rel = relation(s, u.owner, colony.owner);
  const out: ForeignTrade = { sold: 0, earned: 0, bought: 0, spent: 0, short: false };
  u.cargo = u.cargo ?? {};
  for (const r of unload) {
    const have = u.cargo[r.good] ?? 0;
    if (have <= 0) continue;
    const limit = r.amount ?? warehouseCapacity(colony);
    const room = Math.max(0, limit - colony.goods[r.good]);
    const price = sellPrice(owner, r.good);
    let n = Math.min(have, room);
    const afford = price > 0 ? Math.floor(Math.max(0, owner.gold) / price) : n;
    if (afford < n) {
      out.short = true;
      n = afford;
    }
    if (n <= 0) continue;
    const gold = n * price;
    u.cargo[r.good] = have - n;
    colony.goods[r.good] += n;
    owner.gold -= gold;
    me.gold += gold;
    noteTrade(s, me.id, gold);
    rel.volume += gold;
    out.sold += n;
    out.earned += gold;
  }
  for (const r of load) {
    const keep = Math.max(FOREIGN_KEEP, r.amount ?? 0);
    const price = buyPrice(owner, r.good);
    const n = Math.min(colony.goods[r.good] - keep, cargoRoomFor(s, u, r.good), Math.floor(Math.max(0, me.gold) / price));
    if (n <= 0) continue;
    const gold = n * price;
    colony.goods[r.good] -= n;
    u.cargo[r.good] = (u.cargo[r.good] ?? 0) + n;
    me.gold -= gold;
    owner.gold += gold;
    noteTrade(s, owner.id, gold);
    rel.volume += gold;
    out.bought += n;
    out.spent += gold;
  }
  for (const g of GOODS) if (u.cargo[g] === 0) delete u.cargo[g];
  if (out.sold) track(me.id, 'trade:foreign stop sales', out.sold);
  if (out.bought) track(me.id, 'trade:foreign stop purchases', out.bought);
  return out;
}

/** Whether a unit is at a foreign colony's stop: on the map, next to it (ships on water, wagons on land). */
export function besideColony(s: GameState, u: Unit, colonyId: string): boolean {
  const c = s.colonies[colonyId];
  if (!c || u.loc.kind !== 'map') return false;
  const { x, y } = u.loc;
  return distance(c.x, c.y, x, y) === 1 && !colonyAt(s, x, y);
}
