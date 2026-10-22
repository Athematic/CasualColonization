/**
 * Native braves: real units of a tribe on the map, moved in the native phase of each round
 * (`processNatives`, after every nation has moved). Each settlement keeps a few braves out on its
 * land. They wander, visit colonies with gifts or to trade, demand tribute when tense and attack
 * colonies and units when angry or at war, with the ordinary combat values (rules/natives.ts).
 * They can be killed, which costs the settlement a brave until it sends out another one and
 * raises the tribe's tension. Everything is seeded and runs in a fixed order, so games stay
 * deterministic.
 */
import { chooseDefender, defencePower, promote } from './combat.js';
import { fail } from './errors.js';
import { sellPrice } from './europe.js';
import { noteGoods } from './history.js';
import { addTension, nativeOffer, tensionOf } from './natives.js';
import {
  colonyWorkers,
  DIRECTIONS,
  distance,
  inBounds,
  isShip,
  isWater,
  message,
  newId,
  player,
  tileAt,
  unitName,
  unitsAt,
} from './queries.js';
import { random, randInt } from './rng.js';
import { noteTrade } from './stats.js';
import { track } from './telemetry.js';
import { BUILDINGS, type BuildingKind } from './rules/buildings.js';
import { difficultyRules } from './rules/difficulty.js';
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { TRIBES, type NationId } from './rules/nations.js';
import {
  BRAVE_CHANCES,
  BRAVE_EQUIPMENT,
  BRAVE_KILLED_TENSION,
  BRAVE_RESPAWN,
  BRAVES_PER_SETTLEMENT,
  braveCombat,
  BUY_PRICE_FACTOR,
  BUY_PRICE_PLENTY,
  CAPITAL_EXTRA_BRAVES,
  CITY_SILVER,
  DEMAND_MET_TENSION,
  DEMAND_REFUSED_TENSION,
  DEMAND_WAIT,
  MAX_BRAVES,
  NATIVE_PRODUCE,
  PRODUCE_CAP,
  PRODUCE_RATE,
  TENSION,
  VISIT_RANGE,
  WANDER_RADIUS,
  WANDER_TURNS,
  type SettlementKind,
} from './rules/natives.js';
import { TERRAIN } from './rules/terrain.js';
import type { Brave, Colony, GameState, NativeDemand, Settlement, Unit } from './types.js';

export function settlementKind(st: Settlement): SettlementKind {
  return TRIBES[st.tribe].settlement;
}

export function bravesOf(s: GameState): Record<string, Brave> {
  return (s.braves = s.braves ?? {});
}

/** Braves a settlement keeps out at most. */
export function maxBraves(st: Settlement): number {
  return BRAVES_PER_SETTLEMENT[settlementKind(st)] + (st.capital ? CAPITAL_EXTRA_BRAVES : 0);
}

/** The braves standing on a tile. */
export function bravesAt(s: GameState, x: number, y: number): Brave[] {
  const out: Brave[] = [];
  for (const b of Object.values(s.braves ?? {})) if (b.x === x && b.y === y) out.push(b);
  return out;
}

export function braveName(b: Brave): string {
  const kind = b.armed && b.mounted ? 'Mounted armed brave' : b.armed ? 'Armed brave' : b.mounted ? 'Mounted brave' : 'Brave';
  return `${TRIBES[b.tribe].name} ${kind.toLowerCase()}`;
}

function tribeOf(s: GameState, st: { tribe: Settlement['tribe'] }) {
  return s.tribes.find((t) => t.id === st.tribe)!;
}

/** Whether a tribe has submitted to a nation (no attacks or demands on it). */
export function hasSubmitted(s: GameState, tribe: Settlement['tribe'], nation: NationId): boolean {
  return !!s.tribes.find((t) => t.id === tribe)?.submitted?.includes(nation);
}

/** Removes a brave. With a killer, the tribe mourns: tension rises towards that nation. */
export function killBrave(s: GameState, b: Brave, killer?: NationId): void {
  delete bravesOf(s)[b.id];
  s.nativeDemands = (s.nativeDemands ?? []).filter((d) => d.braveId !== b.id);
  const home = s.settlements[b.home];
  if (!home) return;
  home.braveTimer = Math.max(home.braveTimer ?? 0, BRAVE_RESPAWN[settlementKind(home)]);
  if (!killer || killer === 'crown') return;
  for (const st of Object.values(s.settlements)) {
    if (st.tribe !== b.tribe) continue;
    addTension(st, killer, st.id === home.id ? BRAVE_KILLED_TENSION : Math.round(BRAVE_KILLED_TENSION / 3));
  }
}

// ---------------------------------------------------------------------------
// Goods the settlements gather and sell

/** Goods a settlement gathers from its land each round. */
export function settlementProduce(s: GameState, st: Settlement): Partial<Record<GoodId, number>> {
  const kind = settlementKind(st);
  const sums: Partial<Record<GoodId, number>> = {};
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tile = tileAt(s, st.x + dx, st.y + dy);
      if (!tile || tile.claim || TERRAIN[tile.t].water) continue;
      const def = TERRAIN[tile.t];
      const yields = tile.f && def.forest ? def.forest.yields : def.yields;
      for (const g of NATIVE_PRODUCE) {
        const y = yields[g] ?? 0;
        if (y > 0) sums[g] = (sums[g] ?? 0) + y * (g === 'silver' && kind === 'city' ? CITY_SILVER : 1);
      }
    }
  }
  const out: Partial<Record<GoodId, number>> = {};
  for (const g of NATIVE_PRODUCE) {
    const n = Math.round((sums[g] ?? 0) * PRODUCE_RATE[kind]);
    if (n > 0) out[g] = n;
  }
  return out;
}

function gatherGoods(s: GameState, st: Settlement): void {
  const cap = PRODUCE_CAP[settlementKind(st)];
  const produce = settlementProduce(s, st);
  for (const g of NATIVE_PRODUCE) {
    const n = produce[g];
    if (!n) continue;
    const goods = (st.goods = st.goods ?? {});
    goods[g] = Math.min(cap, (goods[g] ?? 0) + n);
  }
}

/** Goods a settlement has for sale (its produce, not the muskets and horses it keeps). */
export function settlementForSale(st: Settlement): { good: GoodId; amount: number }[] {
  return NATIVE_PRODUCE.map((good) => ({ good, amount: st.goods?.[good] ?? 0 })).filter((r) => r.amount > 0);
}

/** Price per unit a settlement asks a nation for one of its goods: dearer when tense, cheaper when it has plenty. */
export function nativeUnitPrice(st: Settlement, good: GoodId, nation: NationId): number {
  const stock = st.goods?.[good] ?? 0;
  const plenty = stock >= PRODUCE_CAP[settlementKind(st)] * 0.75 ? BUY_PRICE_PLENTY : 1;
  const mood = 1 + tensionOf(st, nation) / 1000;
  return Math.max(1, Math.round(GOOD_DEFS[good].price * BUY_PRICE_FACTOR * mood * plenty * (st.capital ? 1.1 : 1)));
}

// ---------------------------------------------------------------------------
// The native phase

interface PhaseIndex {
  /** Tiles with a colony, and with European units on land. */
  colonies: Map<number, Colony>;
  units: Map<number, Unit[]>;
  settlements: Set<number>;
}

function buildIndex(s: GameState): PhaseIndex {
  const w = s.map.width;
  const colonies = new Map<number, Colony>();
  for (const c of Object.values(s.colonies)) colonies.set(c.y * w + c.x, c);
  const units = new Map<number, Unit[]>();
  for (const u of Object.values(s.units)) {
    if (u.loc.kind !== 'map' || isShip(u)) continue;
    const i = u.loc.y * w + u.loc.x;
    const list = units.get(i);
    if (list) list.push(u);
    else units.set(i, [u]);
  }
  const settlements = new Set<number>();
  for (const st of Object.values(s.settlements)) settlements.add(st.y * w + st.x);
  return { colonies, units, settlements };
}

/**
 * Once per round, after the settlements' own business: gather goods, send out new braves, arm
 * braves at home and move every brave. Called from processNatives.
 */
export function processBraves(s: GameState): void {
  const braves = bravesOf(s);
  for (const b of Object.values(braves)) if (!s.settlements[b.home]) delete braves[b.id];
  let total = Object.keys(braves).length;
  const counts = new Map<string, number>();
  for (const b of Object.values(braves)) counts.set(b.home, (counts.get(b.home) ?? 0) + 1);
  for (const st of Object.values(s.settlements)) {
    gatherGoods(s, st);
    if (st.braveTimer && st.braveTimer > 0) {
      st.braveTimer--;
      continue;
    }
    if ((counts.get(st.id) ?? 0) >= maxBraves(st) || total >= MAX_BRAVES) continue;
    const b: Brave = { id: newId(s, 'b'), tribe: st.tribe, home: st.id, x: st.x, y: st.y };
    braves[b.id] = b;
    total++;
    // The next one follows after half the time a lost brave takes to replace.
    st.braveTimer = Math.ceil(BRAVE_RESPAWN[settlementKind(st)] / 2);
  }
  const index = buildIndex(s);
  for (const id of Object.keys(braves)) {
    const b = braves[id];
    if (b) actBrave(s, b, index);
  }
  expireDemands(s);
}

function equipAtHome(st: Settlement, b: Brave): void {
  const goods = st.goods;
  if (!goods) return;
  if (!b.armed && (goods.muskets ?? 0) >= BRAVE_EQUIPMENT) {
    goods.muskets! -= BRAVE_EQUIPMENT;
    b.armed = true;
  }
  if (!b.mounted && (goods.horses ?? 0) >= BRAVE_EQUIPMENT) {
    goods.horses! -= BRAVE_EQUIPMENT;
    b.mounted = true;
  }
}

function actBrave(s: GameState, b: Brave, index: PhaseIndex): void {
  const st = s.settlements[b.home];
  if (!st) return;
  const home = b.x === st.x && b.y === st.y;
  if (home) equipAtHome(st, b);
  const points = braveCombat(b).moves * 3;
  if (!b.task) {
    if (home) chooseTask(s, b, st, index);
    if (!b.task) {
      if (!home) walk(s, b, st.x, st.y, points, index, true);
      return;
    }
  }
  const task = b.task!;
  switch (task.kind) {
    case 'wander': {
      task.turns--;
      wanderStep(s, b, st, points, index);
      if (task.turns <= 0) delete b.task;
      return;
    }
    case 'wait': {
      task.turns--;
      if (task.turns > 0) return;
      // Nobody answered: a demand counts as refused, an offer is withdrawn.
      const d = (s.nativeDemands ?? []).find((o) => o.id === task.demandId);
      if (d) resolveDemand(s, d, false);
      else delete b.task;
      return;
    }
    case 'visit':
    case 'attack': {
      if (task.kind === 'attack' && task.unitId) {
        const target = s.units[task.unitId];
        if (!target || target.loc.kind !== 'map' || distance(target.loc.x, target.loc.y, st.x, st.y) > VISIT_RANGE) {
          delete b.task;
          return;
        }
        if (distance(b.x, b.y, target.loc.x, target.loc.y) > 1) walk(s, b, target.loc.x, target.loc.y, points, index, false);
        if (distance(b.x, b.y, target.loc.x, target.loc.y) === 1) {
          attackUnit(s, b, target);
          if (bravesOf(s)[b.id]) delete b.task;
        }
        return;
      }
      const c = task.colonyId ? s.colonies[task.colonyId] : undefined;
      if (!c || c.owner === 'crown') {
        delete b.task;
        return;
      }
      if (distance(b.x, b.y, c.x, c.y) > 1) walk(s, b, c.x, c.y, points, index, false);
      if (distance(b.x, b.y, c.x, c.y) !== 1) return;
      if (task.kind === 'attack') {
        attackColony(s, b, c);
        if (bravesOf(s)[b.id]) delete b.task;
      } else arrive(s, b, st, c, task.purpose);
      return;
    }
  }
}

/** The nearest colony within reach of a settlement, if any. */
function nearestColony(s: GameState, st: Settlement): Colony | undefined {
  let best: Colony | undefined;
  let bestD = Infinity;
  for (const c of Object.values(s.colonies)) {
    if (c.owner === 'crown') continue;
    const d = distance(c.x, c.y, st.x, st.y);
    if (d <= VISIT_RANGE && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** An enemy unit in the open near the settlement, for a tribe at war. */
function nearbyEnemy(s: GameState, st: Settlement, index: PhaseIndex): Unit | undefined {
  const tribe = tribeOf(s, st);
  const w = s.map.width;
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const [i, units] of index.units) {
    const x = i % w;
    const y = Math.floor(i / w);
    const d = distance(x, y, st.x, st.y);
    if (d > 3 || d >= bestD || index.colonies.has(i)) continue;
    const u = units.find((o) => o.owner !== 'crown' && tribe.stance[o.owner] === 'war' && !hasSubmitted(s, st.tribe, o.owner));
    if (u) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

function chooseTask(s: GameState, b: Brave, st: Settlement, index: PhaseIndex): void {
  const tribe = tribeOf(s, st);
  const c = nearestColony(s, st);
  const roll = random(s);
  if (c) {
    const nation = c.owner;
    const t = tensionOf(st, nation);
    const submitted = hasSubmitted(s, st.tribe, nation);
    const raid = difficultyRules(player(s, nation)).raidChance;
    if (!submitted && tribe.stance[nation] === 'war') {
      if (roll < BRAVE_CHANCES.attackAtWar * raid) b.task = { kind: 'attack', colonyId: c.id };
    } else if (!submitted && t >= TENSION.angry) {
      if (roll < BRAVE_CHANCES.attackAngry * raid) b.task = { kind: 'attack', colonyId: c.id };
    } else if (!submitted && t >= TENSION.uneasy) {
      if (roll < BRAVE_CHANCES.demand * raid) b.task = { kind: 'visit', colonyId: c.id, purpose: 'demand' };
    } else if (t < TENSION.content) {
      if (roll < BRAVE_CHANCES.gift) b.task = { kind: 'visit', colonyId: c.id, purpose: 'gift' };
      else if (roll < BRAVE_CHANCES.gift + BRAVE_CHANCES.trade) b.task = { kind: 'visit', colonyId: c.id, purpose: 'trade' };
    }
    if (b.task) return;
  }
  if (Object.values(tribe.stance).includes('war')) {
    const enemy = nearbyEnemy(s, st, index);
    if (enemy && roll < BRAVE_CHANCES.attackAtWar) {
      b.task = { kind: 'attack', unitId: enemy.id };
      return;
    }
  }
  if (random(s) < BRAVE_CHANCES.wander) b.task = { kind: 'wander', turns: WANDER_TURNS };
}

/** Whether a brave may step onto a tile: open land, no colony, no other settlement, no European unit. */
function open(s: GameState, b: Brave, x: number, y: number, index: PhaseIndex): boolean {
  if (!inBounds(s, x, y) || isWater(tileAt(s, x, y))) return false;
  const i = y * s.map.width + x;
  if (index.colonies.has(i) || index.units.has(i)) return false;
  if (index.settlements.has(i)) {
    const home = s.settlements[b.home];
    return !!home && home.x === x && home.y === y;
  }
  return true;
}

function stepCost(s: GameState, x: number, y: number): number {
  const tile = tileAt(s, x, y)!;
  if (tile.r) return 1;
  return tile.f ? 6 : TERRAIN[tile.t].moveCost;
}

/**
 * Walks greedily towards a tile, as far as the move points allow (a brave can always make one
 * step). Stops next to the target unless `onto` is set.
 */
function walk(s: GameState, b: Brave, tx: number, ty: number, points: number, index: PhaseIndex, onto: boolean): void {
  let left = points;
  while (left > 0) {
    const d = distance(b.x, b.y, tx, ty);
    if (d === 0 || (!onto && d === 1)) return;
    let best: { x: number; y: number; d: number } | undefined;
    for (const dir of DIRECTIONS) {
      const x = b.x + dir.dx;
      const y = b.y + dir.dy;
      const nd = distance(x, y, tx, ty);
      if (nd >= d || (best && nd >= best.d)) continue;
      if (!open(s, b, x, y, index)) continue;
      best = { x, y, d: nd };
    }
    if (!best) return;
    b.x = best.x;
    b.y = best.y;
    left -= stepCost(s, best.x, best.y);
  }
}

function wanderStep(s: GameState, b: Brave, st: Settlement, points: number, index: PhaseIndex): void {
  let left = points;
  let guard = 4;
  while (left > 0 && guard-- > 0) {
    const options = DIRECTIONS.map((d) => ({ x: b.x + d.dx, y: b.y + d.dy })).filter(
      (p) => distance(p.x, p.y, st.x, st.y) <= WANDER_RADIUS && open(s, b, p.x, p.y, index),
    );
    if (!options.length) return;
    const p = options[randInt(s, options.length)];
    b.x = p.x;
    b.y = p.y;
    left -= stepCost(s, p.x, p.y);
  }
}

// ---------------------------------------------------------------------------
// Visits

const NOT_FOR_SALE = new Set<GoodId>(['muskets', 'horses', 'tools']);

function arrive(s: GameState, b: Brave, st: Settlement, c: Colony, purpose: 'gift' | 'trade' | 'demand'): void {
  const tribe = TRIBES[st.tribe].name;
  const nation = c.owner;
  const p = player(s, nation);
  delete b.task;
  if (purpose === 'gift') {
    const goods = settlementForSale(st).filter((r) => r.amount >= 20).sort((x, y) => y.amount - x.amount);
    if (goods.length && random(s) < 0.4) {
      const g = goods[0];
      const n = Math.min(g.amount, 20 + randInt(s, 40));
      st.goods![g.good]! -= n;
      c.goods[g.good] += n;
      message(s, `The ${tribe} bring ${n} ${GOOD_DEFS[g.good].name.toLowerCase()} to ${c.name} as a gift.`, nation, c);
    } else {
      const food = 20 + randInt(s, 60);
      c.goods.food += food;
      message(s, `The ${tribe} bring ${food} food to ${c.name} as a gift.`, nation, c);
    }
    track(nation, 'natives:gift received');
    addTension(st, nation, -10);
    return;
  }
  if (purpose === 'demand') {
    makeDemand(s, b, st, c);
    return;
  }
  // Trade: the brave buys goods the tribe wants, then offers the settlement's own goods.
  for (const g of TRIBES[st.tribe].wants) {
    if (NOT_FOR_SALE.has(g) || c.goods[g] < 50) continue;
    const amount = Math.min(100, Math.floor(c.goods[g] / 2));
    const gold = nativeOffer(st, g, amount);
    if (gold < 10) continue;
    c.goods[g] -= amount;
    st.gold -= gold;
    p.gold += gold;
    noteTrade(s, nation, gold);
    track(nation, 'natives:sold to visiting brave');
    track(nation, 'natives:gold from sales', gold);
    noteGoods(s, nation, 'natives', g, amount);
    addTension(st, nation, -10);
    message(s, `A ${tribe} brave buys ${amount} ${GOOD_DEFS[g].name.toLowerCase()} in ${c.name} for ${gold} gold.`, nation, c);
    break;
  }
  const offer = settlementForSale(st)
    .filter((r) => r.amount >= 30)
    .map((r) => ({ ...r, amount: Math.min(100, r.amount), unit: nativeUnitPrice(st, r.good, nation) }))
    .sort((x, y) => GOOD_DEFS[y.good].price * y.amount - GOOD_DEFS[x.good].price * x.amount)[0];
  if (!offer) return;
  const price = offer.unit * offer.amount;
  if (p.gold < price) return;
  if (p.human) {
    const d = addDemand(s, { kind: 'offer', nation, colonyId: c.id, settlementId: st.id, braveId: b.id, good: offer.good, amount: offer.amount, price });
    b.task = { kind: 'wait', demandId: d.id, turns: DEMAND_WAIT };
    message(s, `A ${tribe} brave at ${c.name} offers ${offer.amount} ${GOOD_DEFS[offer.good].name.toLowerCase()} for ${price} gold.`, nation, c);
    return;
  }
  // A computer player buys when the goods fetch clearly more in Europe, and it can spare the gold.
  const worth = offer.amount * sellPrice(p, offer.good) * (1 - p.tax / 100);
  if (p.ai && p.ai !== 'naive' && worth >= price * 1.3 && p.gold >= price + 500 && p.independence === 'none') {
    buyOffer(s, st, c, offer.good, offer.amount, price);
  }
}

function buyOffer(s: GameState, st: Settlement, c: Colony, good: GoodId, amount: number, price: number): void {
  const p = player(s, c.owner);
  p.gold -= price;
  st.gold += price;
  st.goods![good] = Math.max(0, (st.goods![good] ?? 0) - amount);
  c.goods[good] += amount;
  addTension(st, c.owner, -10);
  track(c.owner, 'natives:bought from visiting brave');
  track(c.owner, 'natives:gold spent buying', price);
  noteGoods(s, c.owner, 'fromNatives', good, amount);
  message(s, `${c.name} buys ${amount} ${GOOD_DEFS[good].name.toLowerCase()} from the ${TRIBES[st.tribe].name} for ${price} gold.`, c.owner, c);
}

function addDemand(s: GameState, d: Omit<NativeDemand, 'id' | 'turn'>): NativeDemand {
  const full: NativeDemand = { id: newId(s, 'd'), turn: s.turn, ...d };
  (s.nativeDemands = s.nativeDemands ?? []).push(full);
  return full;
}

/** What a brave asks of a colony: its most plentiful goods, or some of the treasury. */
function demandFor(s: GameState, c: Colony): { good?: GoodId; amount: number } | undefined {
  const goods = GOODS.filter((g) => g !== 'food' && c.goods[g] >= 50).sort((a, b) => c.goods[b] - c.goods[a]);
  if (goods.length) return { good: goods[0], amount: Math.min(100, Math.max(25, Math.round(c.goods[goods[0]] * 0.4))) };
  const gold = player(s, c.owner).gold;
  if (gold < 50) return undefined;
  return { amount: Math.min(300, 50 + Math.round(gold * 0.05)) };
}

function makeDemand(s: GameState, b: Brave, st: Settlement, c: Colony): void {
  const what = demandFor(s, c);
  const tribe = TRIBES[st.tribe].name;
  if (!what) return;
  const d = addDemand(s, { kind: 'demand', nation: c.owner, colonyId: c.id, settlementId: st.id, braveId: b.id, ...what });
  track(c.owner, 'natives:tribute demanded');
  const p = player(s, c.owner);
  if (p.human) {
    b.task = { kind: 'wait', demandId: d.id, turns: DEMAND_WAIT };
    message(s, `A ${tribe} brave at ${c.name} demands ${demandText(d)} as tribute.`, c.owner, c);
    return;
  }
  resolveDemand(s, d, aiPaysTribute(s, b, c, d));
}

export function demandText(d: Pick<NativeDemand, 'good' | 'amount'>): string {
  return d.good ? `${d.amount} ${GOOD_DEFS[d.good].name.toLowerCase()}` : `${d.amount} gold`;
}

/**
 * A computer player pays when the colony could lose the fight that a refusal brings, or when the
 * tribute is cheap; otherwise it refuses and lets the garrison deal with the brave.
 */
export function aiPaysTribute(s: GameState, b: Brave, c: Colony, d: Pick<NativeDemand, 'good' | 'amount'>): boolean {
  const p = player(s, c.owner);
  const defenders = unitsAt(s, c.x, c.y).filter((u) => u.owner === c.owner && !isShip(u));
  const defender = chooseDefender(s, defenders) ?? colonyWorkers(s, c)[0];
  const def = defender ? defencePower(s, defender) : 1;
  const off = braveCombat(b).offence * 1.5;
  const risk = off / (off + def);
  const value = d.good ? d.amount * sellPrice(p, d.good) : d.amount;
  if (!d.good && p.gold < d.amount) return false;
  return risk >= 0.35 || value <= 120;
}

/** Answers a demand (pay or refuse) or an offer (buy or decline). */
export function resolveDemand(s: GameState, d: NativeDemand, accept: boolean): string {
  s.nativeDemands = (s.nativeDemands ?? []).filter((o) => o.id !== d.id);
  const b = bravesOf(s)[d.braveId];
  const st = s.settlements[d.settlementId];
  const c = s.colonies[d.colonyId];
  const tribe = st ? TRIBES[st.tribe].name : 'natives';
  if (b) delete b.task;
  if (!st || !c || c.owner !== d.nation) return 'The natives have gone.';
  const p = player(s, d.nation);
  if (d.kind === 'offer') {
    if (!accept) return `You decline the ${tribe} offer.`;
    const price = d.price ?? 0;
    if (p.gold < price) fail(`You need ${price} gold.`);
    const amount = Math.min(d.amount, st.goods?.[d.good!] ?? 0);
    if (amount <= 0) return 'The goods are no longer for sale.';
    buyOffer(s, st, c, d.good!, amount, Math.round((price * amount) / d.amount));
    return `You buy ${amount} ${GOOD_DEFS[d.good!].name.toLowerCase()} from the ${tribe}.`;
  }
  if (accept) {
    let text: string;
    if (d.good) {
      const n = Math.min(d.amount, c.goods[d.good]);
      c.goods[d.good] -= n;
      // Muskets and horses arm the tribe's braves; other goods are used up.
      if (d.good === 'muskets' || d.good === 'horses') {
        const goods = (st.goods = st.goods ?? {});
        goods[d.good] = (goods[d.good] ?? 0) + n;
      }
      text = `${c.name} hands over ${n} ${GOOD_DEFS[d.good].name.toLowerCase()} to the ${tribe}.`;
    } else {
      const n = Math.min(d.amount, p.gold);
      p.gold -= n;
      st.gold += n;
      text = `You pay the ${tribe} ${n} gold.`;
    }
    addTension(st, d.nation, DEMAND_MET_TENSION);
    track(d.nation, 'natives:tribute paid');
    message(s, text, d.nation, c);
    return text;
  }
  addTension(st, d.nation, DEMAND_REFUSED_TENSION);
  track(d.nation, 'natives:tribute refused');
  const text = `${c.name} refuses the ${tribe} demand. The brave attacks!`;
  message(s, text, d.nation, c);
  if (b && distance(b.x, b.y, c.x, c.y) === 1) attackColony(s, b, c);
  return text;
}

/** Answers a waiting demand or offer for a nation (the `answerNativeDemand` command). */
export function answerNativeDemand(s: GameState, nation: NationId, demandId: string, accept: boolean): string {
  const d = (s.nativeDemands ?? []).find((o) => o.id === demandId);
  if (!d || d.nation !== nation) fail('There is no such native demand.');
  track(nation, 'cmd:answerNativeDemand');
  return resolveDemand(s, d, accept);
}

/** Drops demands whose brave, colony or settlement is gone. */
function expireDemands(s: GameState): void {
  if (!s.nativeDemands?.length) return;
  s.nativeDemands = s.nativeDemands.filter((d) => {
    const c = s.colonies[d.colonyId];
    return !!bravesOf(s)[d.braveId] && !!s.settlements[d.settlementId] && !!c && c.owner === d.nation;
  });
}

/** Demands and offers waiting for a nation's answer. */
export function pendingDemands(s: GameState, nation: NationId): NativeDemand[] {
  return (s.nativeDemands ?? []).filter((d) => d.nation === nation);
}

// ---------------------------------------------------------------------------
// Fighting

const isArmed = (u: Unit) => u.role === 'soldier' || u.role === 'dragoon';

/**
 * A beaten European unit loses its horses or muskets (re-equipping from the colony's stores
 * if it can), and the brave takes them. Returns what happened, or null when the unit was unarmed.
 */
function strip(b: Brave, u: Unit, store?: Colony['goods']): string | null {
  const name = unitName(u);
  if (u.role === 'dragoon' || u.role === 'scout') {
    b.mounted = true;
    if (u.role === 'dragoon' && store && store.horses >= 50) {
      store.horses -= 50;
      return `${name} loses its horses but takes fresh ones from the stables`;
    }
    u.role = u.role === 'dragoon' ? 'soldier' : 'none';
    return `${name} loses its horses`;
  }
  if (u.role === 'soldier') {
    b.armed = true;
    if (store && store.muskets >= 50) {
      store.muskets -= 50;
      return `${name} loses its muskets but re-arms from the warehouse`;
    }
    u.role = 'none';
    return `${name} is disarmed`;
  }
  return null;
}

/** A brave attacks a colony with the ordinary combat rules. Winning against an unarmed colony pillages it. */
export function attackColony(s: GameState, b: Brave, c: Colony): void {
  const defenders = unitsAt(s, c.x, c.y).filter((u) => u.owner === c.owner && !isShip(u));
  const defender = chooseDefender(s, defenders) ?? colonyWorkers(s, c)[0];
  if (!defender) return;
  const tribe = TRIBES[b.tribe].name;
  const st = s.settlements[b.home];
  track(c.owner, 'natives:raid suffered');
  const off = braveCombat(b).offence * 1.5;
  const def = defencePower(s, defender);
  if (random(s) >= off / (off + def)) {
    killBrave(s, b);
    if (st) addTension(st, c.owner, -30);
    track(c.owner, 'natives:brave killed');
    message(s, `${c.name} beats off an attack by the ${tribe}: the ${braveName(b).toLowerCase()} is killed.${promote(s, defender)}`, c.owner, c);
    return;
  }
  if (isArmed(defender) && defender.loc.kind === 'map') {
    message(s, `The ${tribe} attack ${c.name}: ${strip(b, defender, c.goods)}.`, c.owner, c);
    return;
  }
  pillage(s, b, c);
}

/** What a successful raid on an undefended colony does, as in the original. */
function pillage(s: GameState, b: Brave, c: Colony): void {
  const tribe = TRIBES[b.tribe].name;
  const goods = GOODS.filter((g) => g !== 'food' && c.goods[g] >= 20).sort((x, y) => c.goods[y] - c.goods[x]);
  const r = random(s);
  const workers = colonyWorkers(s, c);
  if (r < 0.4 && goods.length) {
    const g = goods[0];
    const stolen = Math.ceil(c.goods[g] / 2);
    c.goods[g] -= stolen;
    if (g === 'muskets' || g === 'horses') {
      const st = s.settlements[b.home];
      if (st) (st.goods = st.goods ?? {})[g] = (st.goods[g] ?? 0) + stolen;
    }
    message(s, `The ${tribe} raid ${c.name} and carry off ${stolen} ${GOOD_DEFS[g].name.toLowerCase()}.`, c.owner, c);
    return;
  }
  if (r < 0.55 && c.hammers > 0) {
    c.hammers = 0;
    message(s, `The ${tribe} raid ${c.name} and burn the work in progress.`, c.owner, c);
    return;
  }
  if (r < 0.8) {
    const kinds = (['stockade', 'docks', 'printingPress', 'warehouse', 'armory', 'schoolhouse', 'church'] as BuildingKind[]).filter((k) => c.buildings[k] > 0);
    if (kinds.length) {
      const k = kinds[randInt(s, kinds.length)];
      c.buildings[k]--;
      message(s, `The ${tribe} raid ${c.name} and damage the ${BUILDINGS[k].levels[c.buildings[k]].name}.`, c.owner, c);
      return;
    }
  }
  if (r >= 0.9 && workers.length > 1) {
    const victim = workers[workers.length - 1];
    delete s.units[victim.id];
    track(c.owner, 'natives:colonist killed');
    message(s, `The ${tribe} raid ${c.name} and kill a ${unitName(victim)}.`, c.owner, c);
    return;
  }
  const p = player(s, c.owner);
  const gold = Math.min(p.gold, 50 + randInt(s, 100));
  p.gold -= gold;
  const st = s.settlements[b.home];
  if (st) st.gold += gold;
  message(s, `The ${tribe} raid ${c.name} and steal ${gold} gold.`, c.owner, c);
}

/** A brave attacks a unit in the open. Unarmed units that lose are killed; armed ones lose their arms to the brave. */
function attackUnit(s: GameState, b: Brave, target: Unit): void {
  if (target.loc.kind !== 'map') return;
  const units = unitsAt(s, target.loc.x, target.loc.y).filter((u) => u.owner === target.owner && !isShip(u));
  const defender = chooseDefender(s, units);
  if (!defender) return;
  const tribe = TRIBES[b.tribe].name;
  const at = { x: target.loc.x, y: target.loc.y };
  const off = braveCombat(b).offence * 1.5;
  const def = defencePower(s, defender);
  track(defender.owner, 'natives:unit attacked');
  if (random(s) >= off / (off + def)) {
    killBrave(s, b);
    track(defender.owner, 'natives:brave killed');
    message(s, `${unitName(defender)} beats off an attack by the ${tribe}.${promote(s, defender)}`, defender.owner, at);
    return;
  }
  const stripped = strip(b, defender);
  if (stripped) {
    message(s, `The ${tribe} attack: ${stripped}.`, defender.owner, at);
    return;
  }
  const name = unitName(defender);
  for (const o of Object.values(s.units)) if (o.loc.kind === 'carrier' && o.loc.carrierId === defender.id) delete s.units[o.id];
  delete s.units[defender.id];
  track(defender.owner, 'natives:unit killed');
  message(s, `The ${tribe} attack and kill your ${name}.`, defender.owner, at);
}

/** Combat values of a brave defending its tile against a European attacker. */
export function braveDefence(s: GameState, b: Brave): number {
  const tile = tileAt(s, b.x, b.y)!;
  const bonus = tile.f ? 50 : TERRAIN[tile.t].defence;
  return braveCombat(b).defence * (1 + bonus / 100);
}

/** Whether a tile holds a brave of a tribe at war with the nation. */
export function hostileBraveAt(s: GameState, nation: NationId, x: number, y: number): Brave | undefined {
  return bravesAt(s, x, y).find((b) => s.tribes.find((t) => t.id === b.tribe)?.stance[nation] === 'war');
}
