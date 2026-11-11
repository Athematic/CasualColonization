import { fail } from './errors.js';
import { noteGoods } from './history.js';
import { track } from './telemetry.js';
import { addOf, hasModifier, modifiers, mulOf, setOr } from './scenarios/modifiers.js';
import {
  cargoFree,
  cargoRoomFor,
  colonyAt,
  createUnit,
  isShip,
  message,
  player,
  unitName,
  unitsAboard,
} from './queries.js';
import { random, randInt, weightedPick } from './rng.js';
import { noteTrade } from './stats.js';
import { favouredPartners, isFavoured } from './relations.js';
import type { NationId } from './rules/nations.js';
import { portBasePrice, portCharacter, portDepth, portPriceBand, type PortRef } from './rules/ports.js';
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { PIONEER_MAX_TOOLS, PURCHASABLE, ROLES, UNIT_TYPES, type RoleId, type UnitTypeId } from './rules/units.js';
import type { GameState, MarketEntry, Player, Unit, UnitLocation } from './types.js';
import { difficultyOf, goodsOf, mechanicsOf, nationOf, portMarketOf, term, Term, unitsOf, type ScenarioLike } from './scenarios/index.js';
import { setUnitLoc, removeUnit, colonyList, unitList } from './unitindex.js';
import { systemsOf } from './playerkind.js';

export const SAIL_TURNS = 3;

export function sailTurns(s: GameState, nation: Player['id']): number {
  return SAIL_TURNS + addOf(modifiers(s, nation, 'sailTurns'));
}

/** Gold needed to lift a boycott. */
export function arrears(s: GameState, p: Player, good: GoodId): number {
  return Math.max(500, 100 * buyPrice(s, p, good) * 3);
}

function requireTrade(s: GameState, p: Player, good: GoodId): void {
  if (p.independence !== 'none') fail(`${Term(s, 'homeland')} does not trade with rebels.`);
  if (p.boycotts[good]) fail(`${GOOD_DEFS[good].name} is under boycott. Pay the arrears to trade it again.`);
}

/** A home port's market at the start of the game: its starting prices (rules/ports.ts), or the plain ones without `port`. */
export function initialMarket(port?: PortRef, goods: readonly GoodId[] = GOODS): Record<GoodId, MarketEntry> {
  return Object.fromEntries(goods.map((g) => [g, { price: port ? portBasePrice(port, g) : GOOD_DEFS[g].price, volume: 0 }])) as Record<GoodId, MarketEntry>;
}

export function sellPrice(p: Player, good: GoodId): number {
  return p.market[good].price;
}

export function buyPrice(s: GameState, p: Player, good: GoodId): number {
  return p.market[good].price + priceSpread(s, p, good);
}

/** Gap between buy and sell price, widened or narrowed by the nation's difficulty (at least 1). */
export function priceSpread(s: GameState, p: Player, good: GoodId): number {
  const spread = GOOD_DEFS[good].spread;
  const m = difficultyOf(s, p).priceSpread;
  return m === 1 ? spread : Math.max(1, Math.round(spread * m));
}

/** Units of a good traded in a port's market before its price moves one step. */
export function marketElasticity(s: GameState, p: Player, good: GoodId): number {
  return Math.max(1, Math.round(GOOD_DEFS[good].elasticity * portDepth(portMarketOf(s, p.id), good) * difficultyOf(s, p).priceElasticity));
}

function adjustMarket(s: GameState, p: Player, good: GoodId, sold: number): void {
  const band = portPriceBand(portMarketOf(s, p.id), good);
  const m = p.market[good];
  const elasticity = marketElasticity(s, p, good);
  m.volume += sold;
  while (m.volume >= elasticity) {
    m.volume -= elasticity;
    m.price = Math.max(band.min, m.price - 1);
  }
  while (m.volume <= -elasticity) {
    m.volume += elasticity;
    // A price above the maximum (after the double-prices cheat) does not jump back down on a purchase.
    if (m.price < band.max) m.price += 1;
  }
}

export function recruitPrice(s: GameState, p: Player): number {
  const progress = Math.min(1, p.crosses / p.crossesRequired);
  const cost = difficultyOf(s, p).recruitCost;
  return Math.max(Math.round(80 * cost), Math.round((300 + 40 * p.recruited) * (1 - progress * 0.6) * cost));
}

/**
 * Price of training an expert, or buying a ship or artillery, in Europe. `p` is the nation whose
 * port it is bought in (its difficulty and, for ships, its port's ship prices).
 */
export function trainPrice(s: GameState, p: Player, type: UnitTypeId): number {
  const price = UNIT_TYPES[type].price;
  if (price === undefined) return Infinity;
  const ships = UNIT_TYPES[type].kind === 'ship' ? portCharacter(portMarketOf(s, p.id)).ships ?? 1 : 1;
  return Math.round(price * difficultyOf(s, p).trainCost * ships);
}

export function randomImmigrant(s: GameState, nation?: Player['id']): UnitTypeId {
  const excluded = nation ? modifiers(s, nation, 'immigrantsExcluded') : [];
  const pool = unitsOf(s).immigrants;
  return weightedPick(s, excluded.length ? pool.filter(([t]) => !excluded.some((m) => m.units.includes(t))) : pool);
}

function requireInEurope(s: GameState, u: Unit | undefined): asserts u is Unit {
  if (!u) fail('No such unit.');
  if (u.loc.kind !== 'europe') fail(`${unitName(u)} is not in ${term(s, 'homeland')}.`);
}

/**
 * The home port a unit is in, or sailing to: its owner's own, or a Favoured Nation partner's.
 * Units on the docks are always in their own home port.
 */
export function portOf(u: Unit): NationId {
  return (u.loc.kind === 'europe' || u.loc.kind === 'sailing') && u.loc.port ? u.loc.port : u.owner;
}

/** Whether a unit is in Europe at its owner's own home port. */
export function inHomePort(u: Unit): boolean {
  return u.loc.kind === 'europe' && portOf(u) === u.owner;
}

/** Name of a nation's home port in its game's scenario, e.g. "Amsterdam". */
export function portName(s: ScenarioLike, nation: NationId): string {
  return nationOf(s, nation).port.name;
}

/** The ports a nation's ships may sail to: its own, then its Favoured Nation partners'. */
export function portsFor(s: GameState, nation: NationId): NationId[] {
  return [nation, ...favouredPartners(s, nation)];
}

/** Why a nation's ships may not use a port, or null. */
export function portProblem(s: GameState, nation: NationId, port: NationId): string | null {
  if (port === nation) return null;
  const host = s.players.find((p) => p.id === port);
  if (!host || port === 'crown') return 'There is no such port.';
  if (!isFavoured(s, nation, port)) return `${nationOf(s, port).name} is not a Favoured Nation; its port is closed to your ships.`;
  if (host.independence !== 'none') return `${nationOf(s, port).name} no longer has a home port in ${term(s, 'homeland')}.`;
  return null;
}

/**
 * Sale proceeds after tax, and the market effect. Used for ships in Europe and custom houses alike.
 * `market` is the nation whose port the goods are sold in (its prices, tax and market move); by
 * default the seller's own. Only sales in the seller's own port can bring a tax raise.
 */
export function sellToMarket(s: GameState, p: Player, good: GoodId, amount: number, market: Player = p): number {
  const gross = amount * sellPrice(market, good);
  const net = gross - Math.floor((gross * market.tax) / 100);
  p.gold += net;
  noteTrade(s, p.id, net);
  noteGoods(s, p.id, 'europe', good, amount);
  adjustMarket(s, market, good, amount);
  if (market === p) maybeRaiseTax(s, p, gross, good);
  return net;
}

function maybeRaiseTax(s: GameState, p: Player, gross: number, good: GoodId): void {
  const mechanics = mechanicsOf(s);
  // A chartered company has no Crown to tax it (companies.ts; playerkind.ts `taxes`).
  if (!mechanics.taxes || !systemsOf(p).taxes) return;
  const rules = difficultyOf(s, p);
  if (p.tax >= rules.taxCeiling || gross < 100 || p.pendingTax) return;
  const chance = Math.min(0.12, 0.015 + s.turn / 3000) * rules.taxChance;
  if (random(s) >= chance) return;
  const rate = Math.min(rules.taxCeiling, p.tax + Math.max(1, Math.round((1 + randInt(s, 4)) * rules.taxRaise)));
  if (mechanics.boycotts && (p.human || (p.ai && p.ai !== 'naive'))) {
    // People decide: accept, or refuse and hold a party with the goods. The advanced computer
    // levels decide too, at the start of their next turn (ai/foreign.ts); Naive always accepts,
    // and without boycotts in the scenario every raise simply applies.
    p.pendingTax = { rate, good };
  } else {
    p.tax = rate;
    track(p.id, 'tax:raise accepted');
    message(s, `${Term(s, 'crown')} has raised the tax rate to ${p.tax}%.`, p.id);
  }
}

/** Accepts or refuses a pending tax raise. Refusing boycotts the good and dumps it from one colony. */
export function answerTax(s: GameState, nation: Player['id'], accept: boolean): string {
  const p = player(s, nation);
  const pending = p.pendingTax;
  if (!pending) fail('There is no tax raise to answer.');
  if (!accept && !mechanicsOf(s).boycotts) fail('A tax raise cannot be refused in this scenario.');
  p.pendingTax = null;
  track(nation, 'cmd:answerTax');
  track(nation, accept ? 'tax:raise accepted' : 'tax:refused (boycott)');
  if (accept) {
    p.tax = pending.rate;
    const text = `The tax rate is now ${p.tax}%.`;
    message(s, text, nation);
    return text;
  }
  p.boycotts[pending.good] = true;
  const name = GOOD_DEFS[pending.good].name.toLowerCase();
  const colony = colonyList(s)
    .filter((c) => c.owner === nation)
    .sort((a, b) => b.goods[pending.good] - a.goods[pending.good])[0];
  let text = `You refuse the tax. ${GOOD_DEFS[pending.good].name} is now boycotted in ${term(s, 'homeland')}.`;
  if (colony && colony.goods[pending.good] > 0) {
    text = `Colonists in ${colony.name} throw ${colony.goods[pending.good]} ${name} into the harbour in protest. ${GOOD_DEFS[pending.good].name} is now boycotted in ${term(s, 'homeland')}.`;
    colony.goods[pending.good] = 0;
    colony.liberty += 50;
  }
  message(s, text, nation, colony);
  return text;
}

export function payArrears(s: GameState, nation: Player['id'], good: GoodId): void {
  const p = player(s, nation);
  if (!p.boycotts[good]) fail('That good is not boycotted.');
  const cost = arrears(s, p, good);
  if (p.gold < cost) fail(`The arrears are ${cost} gold.`);
  p.gold -= cost;
  delete p.boycotts[good];
  track(nation, 'cmd:payArrears');
}

/** End-of-turn sales by a colony's custom house; keeps 50 of each exported good. */
export function runCustomHouse(s: GameState, colonyId: string): void {
  const colony = s.colonies[colonyId];
  if (!colony || colony.buildings.customHouse === 0 || !mechanicsOf(s).customHouse) return;
  const p = player(s, colony.owner);
  if (p.independence === 'declared') return;
  let total = 0;
  for (const g of goodsOf(s)) {
    if (!colony.exports[g] || p.boycotts[g]) continue;
    const amount = colony.goods[g] - 50;
    if (amount <= 0) continue;
    colony.goods[g] -= amount;
    total += sellToMarket(s, p, g, amount);
    noteGoods(s, p.id, 'custom', g, amount);
  }
  if (total > 0) track(colony.owner, 'trade:custom house sales');
  if (total > 0) message(s, `The custom house in ${colony.name} sold goods for ${total} gold.`, colony.owner, colony);
}

/**
 * The market a ship in Europe trades in: its own nation's, or a Favoured Nation partner's when it
 * is in the partner's port. In a partner's port neither side's boycotts apply: a boycott is
 * between a nation's colonies and its own Crown.
 */
export function shipMarket(s: GameState, ship: Unit, good?: GoodId): { p: Player; market: Player } {
  const p = player(s, ship.owner);
  const port = portOf(ship);
  if (port === p.id) {
    if (good) requireTrade(s, p, good);
    return { p, market: p };
  }
  if (p.independence !== 'none') fail(`${Term(s, 'homeland')} does not trade with rebels.`);
  const problem = portProblem(s, p.id, port);
  if (problem) fail(problem);
  return { p, market: player(s, port) };
}

export function sellGoods(s: GameState, carrierId: string, good: GoodId, amount: number): number {
  const ship = s.units[carrierId];
  requireInEurope(s, ship);
  const have = ship.cargo?.[good] ?? 0;
  amount = Math.min(amount, have);
  if (amount <= 0) fail('Nothing to sell.');
  const { p, market } = shipMarket(s, ship, good);
  ship.cargo![good] = have - amount;
  track(p.id, 'cmd:sellGoods');
  if (market !== p) track(p.id, 'europe:partner port sales', amount);
  return sellToMarket(s, p, good, amount, market);
}

export function buyGoods(s: GameState, carrierId: string, good: GoodId, amount: number): void {
  const ship = s.units[carrierId];
  requireInEurope(s, ship);
  if (!isShip(ship)) fail(`Only ships carry goods from ${term(s, 'homeland')}.`);
  amount = Math.min(amount, cargoRoomFor(s, ship, good));
  if (amount <= 0) fail('The ship has no room.');
  const { p, market } = shipMarket(s, ship, good);
  const cost = amount * buyPrice(s, market, good);
  if (cost > p.gold) fail(`You need ${cost} gold.`);
  p.gold -= cost;
  ship.cargo = ship.cargo ?? {};
  ship.cargo[good] = (ship.cargo[good] ?? 0) + amount;
  adjustMarket(s, market, good, -amount);
  track(p.id, 'cmd:buyGoods');
  track(p.id, `europe:bought ${GOOD_DEFS[good].name.toLowerCase()}`);
  if (market !== p) track(p.id, 'europe:partner port purchases', amount);
}

export function recruit(s: GameState, nation: Player['id'], slot: number): Unit {
  const p = player(s, nation);
  if (p.independence !== 'none') fail(`${Term(s, 'homeland')} sends no colonists to rebels.`);
  if (slot < 0 || slot >= p.recruitPool.length) fail('No such recruit.');
  const price = recruitPrice(s, p);
  if (p.gold < price) fail(`Recruiting costs ${price} gold.`);
  p.gold -= price;
  p.recruited++;
  const type = p.recruitPool[slot];
  p.recruitPool[slot] = randomImmigrant(s, nation);
  track(nation, 'cmd:recruit');
  return createUnit(s, nation, type, { kind: 'europe' });
}

/** Whether a unit type can be bought in a Favoured Nation partner's port: ships, but not warships. */
export function buyableInPartnerPort(type: UnitTypeId): boolean {
  const def = UNIT_TYPES[type];
  return PURCHASABLE.includes(type) && def.kind === 'ship' && def.offence === 0;
}

/**
 * Trains an expert or buys a unit in Europe. With `port` set to a Favoured Nation partner, buys a
 * merchant ship in that partner's port at its prices; one of the nation's ships must be there.
 */
export function train(s: GameState, nation: Player['id'], type: UnitTypeId, port?: NationId): Unit {
  const p = player(s, nation);
  const def = UNIT_TYPES[type];
  if (p.independence !== 'none') fail(`${Term(s, 'homeland')} does not trade with rebels.`);
  if (port && port !== nation) {
    const problem = portProblem(s, nation, port);
    if (problem) fail(problem);
    if (!buyableInPartnerPort(type) || !unitsOf(s).units.has(type)) fail(`Only merchant ships can be bought in ${portName(s, port)}. Warships, artillery and colonists come from your own port.`);
    if (!unitList(s).some((u) => u.owner === nation && u.loc.kind === 'europe' && u.loc.port === port)) fail(`You need a ship in ${portName(s, port)} to buy there.`);
    const price = trainPrice(s, player(s, port), type);
    if (p.gold < price) fail(`${def.name} costs ${price} gold in ${portName(s, port)}.`);
    p.gold -= price;
    track(nation, 'cmd:train');
    track(nation, `bought unit:${def.name}`);
    track(nation, 'europe:partner port ship bought');
    return createUnit(s, nation, type, { kind: 'europe', port });
  }
  const offer = unitsOf(s);
  if (!offer.trainable.includes(type) && !offer.purchasable.includes(type)) fail(`${def.name} cannot be bought in ${term(s, 'homeland')}.`);
  const price = trainPrice(s, p, type);
  if (p.gold < price) fail(`${def.name} costs ${price} gold.`);
  p.gold -= price;
  track(nation, 'cmd:train');
  track(nation, `${def.kind === 'colonist' ? 'trained expert' : 'bought unit'}:${def.name}`);
  return createUnit(s, nation, type, { kind: 'europe' });
}

/** Called each turn: crosses bring a new immigrant to the docks. */
export function processImmigration(s: GameState, p: Player): void {
  // The Crown (holding colonies it retook) has no docks to send immigrants to (playerkind.ts `immigration`).
  if (p.crosses < p.crossesRequired || p.independence !== 'none' || !systemsOf(p).immigration || !p.recruitPool.length) return;
  p.crosses -= p.crossesRequired;
  p.crossesRequired += Math.round(setOr(modifiers(s, p.id, 'crossesStep'), 20) * difficultyOf(s, p).crosses);
  // Brewster lets the colony pick the best candidate; otherwise chance decides.
  const slot = hasModifier(s, p.id, 'chooseImmigrant')
    ? p.recruitPool.reduce((best, t, i) => (UNIT_TYPES[t].skill > UNIT_TYPES[p.recruitPool[best]].skill ? i : best), 0)
    : randInt(s, p.recruitPool.length);
  const type = p.recruitPool[slot];
  p.recruitPool[slot] = randomImmigrant(s, p.id);
  createUnit(s, p.id, type, { kind: 'europe' });
  track(p.id, 'europe:immigrant (crosses)');
  message(s, `Religious unrest in ${term(s, 'homeland')}: a ${UNIT_TYPES[type].name} has arrived on the docks.`, p.id);
}

export function equipInEurope(s: GameState, unitId: string, role: RoleId): void {
  const u = s.units[unitId];
  requireInEurope(s, u);
  if (UNIT_TYPES[u.type].kind !== 'colonist') fail('Only colonists can be equipped.');
  const p = player(s, u.owner);
  // Sell back current equipment first.
  const current = u.role === 'pioneer' ? { tools: u.tools } : ROLES[u.role].goods;
  const want = role === 'pioneer' ? { tools: PIONEER_MAX_TOOLS } : ROLES[role].goods;
  for (const g of Object.keys(want) as GoodId[]) requireTrade(s, p, g);
  let cost = 0;
  for (const [g, n] of Object.entries(want) as [GoodId, number][]) cost += n * buyPrice(s, p, g);
  let refund = 0;
  for (const [g, n] of Object.entries(current) as [GoodId, number][]) refund += n * sellPrice(p, g);
  if (p.gold + refund < cost) fail(`Equipping costs ${cost} gold.`);
  for (const [g, n] of Object.entries(current) as [GoodId, number][]) if (n) sellToMarket(s, p, g, n);
  p.gold -= cost;
  for (const [g, n] of Object.entries(want) as [GoodId, number][]) adjustMarket(s, p, g, -n);
  u.role = role;
  u.tools = role === 'pioneer' ? PIONEER_MAX_TOOLS : 0;
  track(u.owner, 'cmd:equip');
  track(u.owner, `equip:${role}`);
}

export function boardInEurope(s: GameState, unitId: string, carrierId: string): void {
  const u = s.units[unitId];
  const ship = s.units[carrierId];
  requireInEurope(s, u);
  requireInEurope(s, ship);
  if (isShip(u)) fail('Ships cannot board ships.');
  if (portOf(u) !== portOf(ship)) fail(`${unitName(ship)} is in another port.`);
  if (cargoFree(s, ship) <= 0) fail('The ship is full.');
  if (ship.repair) fail(`${unitName(ship)} is under repair.`);
  setUnitLoc(s, u, { kind: 'carrier', carrierId });
  u.state = 'sentry';
  track(u.owner, 'cmd:board');
}

export function sailToAmerica(s: GameState, carrierId: string): void {
  const ship = s.units[carrierId];
  requireInEurope(s, ship);
  if (!isShip(ship)) fail('Only ships can sail.');
  if (ship.repair) fail(`${unitName(ship)} is under repair for ${ship.repair} more turns.`);
  setUnitLoc(s, ship, { kind: 'sailing', to: 'america', turnsLeft: sailTurns(s, ship.owner) });
  ship.moves = 0;
  track(ship.owner, 'cmd:sailToAmerica');
}

/** Sails a ship from the high seas to Europe: to its own home port, or to `port`, a Favoured Nation partner's. */
export function sailToEurope(s: GameState, carrierId: string, port?: NationId): void {
  const ship = s.units[carrierId];
  if (!ship || !isShip(ship)) fail(`Only ships can sail to ${term(s, 'homeland')}.`);
  if (ship.loc.kind !== 'map') fail('The ship must be at sea.');
  const tile = s.map.tiles[ship.loc.y * s.map.width + ship.loc.x];
  if (tile.t !== 'highSeas') fail(`Ships can only sail to ${term(s, 'homeland')} from the high seas.`);
  if (colonyAt(s, ship.loc.x, ship.loc.y)) fail('The ship is in port.');
  if (player(s, ship.owner).independence !== 'none') fail(`Rebel ships are not welcome in ${term(s, 'homeland')}.`);
  const target = port ?? ship.owner;
  const problem = portProblem(s, ship.owner, target);
  if (problem) fail(problem);
  player(s, ship.owner).entry = { x: ship.loc.x, y: ship.loc.y };
  const sailing: UnitLocation = { kind: 'sailing', to: 'europe', turnsLeft: sailTurns(s, ship.owner) };
  if (target !== ship.owner) {
    sailing.port = target;
    track(ship.owner, 'europe:sailed to a partner port');
  }
  setUnitLoc(s, ship, sailing);
  ship.moves = 0;
  delete ship.dest;
  track(ship.owner, 'cmd:sailToEurope');
}

/** Ships at sea between the continents advance one turn. */
export function advanceSailing(s: GameState, ship: Unit): void {
  if (ship.loc.kind !== 'sailing') return;
  ship.loc.turnsLeft--;
  if (ship.loc.turnsLeft > 0) return;
  const p = player(s, ship.owner);
  if (ship.loc.to === 'europe') {
    // A partner's port that has closed meanwhile sends the ship on to its own.
    const port = ship.loc.port && !portProblem(s, ship.owner, ship.loc.port) ? ship.loc.port : undefined;
    setUnitLoc(s, ship, port ? { kind: 'europe', port } : { kind: 'europe' });
    message(s, port ? `${unitName(ship)} has arrived in ${term(s, 'homeland')} at the ${nationOf(s, port).adjective} port of ${portName(s, port)}.` : `${unitName(ship)} has arrived in ${term(s, 'homeland')}.`, ship.owner);
    const host = port ? player(s, port) : p;
    for (const u of unitsAboard(s, ship)) {
      u.state = 'active';
      if (u.type === 'treasure') {
        const gross = u.treasure ?? 0;
        const net = gross - Math.floor((gross * host.tax) / 100);
        p.gold += net;
        removeUnit(s, u.id);
        track(p.id, 'treasure:shipped by galleon');
        message(s, `The treasure reaches ${term(s, 'homeland')} safely: ${net} gold after tax.`, ship.owner);
      }
    }
  } else {
    setUnitLoc(s, ship, { kind: 'map', x: p.entry.x, y: p.entry.y });
    message(s, `${unitName(ship)} has arrived in ${term(s, 'colonyLand')}.`, ship.owner, p.entry);
  }
}

export function unboardInEurope(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'carrier') fail('The unit is not on a ship.');
  const ship = s.units[u.loc.carrierId];
  requireInEurope(s, ship);
  if (portOf(ship) !== u.owner) fail('Colonists can only go ashore in your own home port.');
  setUnitLoc(s, u, { kind: 'europe' });
  u.state = 'active';
  track(u.owner, 'cmd:unboard');
}

/** The chance each round that a good's price in the nation's home port drifts back a step. */
export function priceRecoveryChance(s: GameState, p: Player): number {
  const mods = modifiers(s, p.id, 'priceRecovery');
  return setOr(mods, 0.1) * mulOf(mods) * difficultyOf(s, p).priceRecovery * (portCharacter(portMarketOf(s, p.id)).recovery ?? 1);
}

/** Drifts prices back toward their starting value in each home port (its own, rules/ports.ts). */
export function recoverMarkets(s: GameState): void {
  for (const p of s.players) {
    const chance = priceRecoveryChance(s, p);
    const market = portMarketOf(s, p.id);
    for (const g of goodsOf(s)) {
      if (random(s) >= chance) continue;
      const m = p.market[g];
      const base = portBasePrice(market, g);
      if (m.price < base) m.price++;
      else if (m.price > base) m.price--;
    }
  }
}
