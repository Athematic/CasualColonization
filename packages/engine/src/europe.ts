import { fail } from './errors.js';
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
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { IMMIGRANT_WEIGHTS, PIONEER_MAX_TOOLS, PURCHASABLE, ROLES, TRAINABLE, UNIT_TYPES, type RoleId, type UnitTypeId } from './rules/units.js';
import type { GameState, MarketEntry, Player, Unit } from './types.js';

export const SAIL_TURNS = 2;

export function initialMarket(): Record<GoodId, MarketEntry> {
  return Object.fromEntries(GOODS.map((g) => [g, { price: GOOD_DEFS[g].price, volume: 0 }])) as Record<GoodId, MarketEntry>;
}

export function sellPrice(p: Player, good: GoodId): number {
  return p.market[good].price;
}

export function buyPrice(p: Player, good: GoodId): number {
  return p.market[good].price + GOOD_DEFS[good].spread;
}

function adjustMarket(p: Player, good: GoodId, sold: number): void {
  const def = GOOD_DEFS[good];
  const m = p.market[good];
  m.volume += sold;
  while (m.volume >= def.elasticity) {
    m.volume -= def.elasticity;
    m.price = Math.max(def.minPrice, m.price - 1);
  }
  while (m.volume <= -def.elasticity) {
    m.volume += def.elasticity;
    m.price = Math.min(def.maxPrice, m.price + 1);
  }
}

export function recruitPrice(p: Player): number {
  const progress = Math.min(1, p.crosses / p.crossesRequired);
  return Math.max(80, Math.round((300 + 40 * p.recruited) * (1 - progress * 0.6)));
}

export function randomImmigrant(s: GameState): UnitTypeId {
  return weightedPick(s, IMMIGRANT_WEIGHTS);
}

function requireInEurope(u: Unit | undefined): asserts u is Unit {
  if (!u) fail('No such unit.');
  if (u.loc.kind !== 'europe') fail(`${unitName(u)} is not in Europe.`);
}

/** Sale proceeds after tax, and the market effect. Used for ships in Europe and custom houses alike. */
export function sellToMarket(s: GameState, p: Player, good: GoodId, amount: number): number {
  const gross = amount * sellPrice(p, good);
  const net = gross - Math.floor((gross * p.tax) / 100);
  p.gold += net;
  adjustMarket(p, good, amount);
  maybeRaiseTax(s, p, gross);
  return net;
}

function maybeRaiseTax(s: GameState, p: Player, gross: number): void {
  if (p.tax >= 70 || gross < 100) return;
  const chance = Math.min(0.12, 0.015 + s.turn / 3000);
  if (random(s) < chance) {
    p.tax = Math.min(70, p.tax + 1 + randInt(s, 4));
    message(s, `The Crown has raised the tax rate to ${p.tax}%.`, p.id);
  }
}

export function sellGoods(s: GameState, carrierId: string, good: GoodId, amount: number): number {
  const ship = s.units[carrierId];
  requireInEurope(ship);
  const have = ship.cargo?.[good] ?? 0;
  amount = Math.min(amount, have);
  if (amount <= 0) fail('Nothing to sell.');
  ship.cargo![good] = have - amount;
  const p = player(s, ship.owner);
  return sellToMarket(s, p, good, amount);
}

export function buyGoods(s: GameState, carrierId: string, good: GoodId, amount: number): void {
  const ship = s.units[carrierId];
  requireInEurope(ship);
  if (!isShip(ship)) fail('Only ships carry goods from Europe.');
  amount = Math.min(amount, cargoRoomFor(s, ship, good));
  if (amount <= 0) fail('The ship has no room.');
  const p = player(s, ship.owner);
  const cost = amount * buyPrice(p, good);
  if (cost > p.gold) fail(`You need ${cost} gold.`);
  p.gold -= cost;
  ship.cargo = ship.cargo ?? {};
  ship.cargo[good] = (ship.cargo[good] ?? 0) + amount;
  adjustMarket(p, good, -amount);
}

export function recruit(s: GameState, nation: Player['id'], slot: number): Unit {
  const p = player(s, nation);
  if (slot < 0 || slot >= p.recruitPool.length) fail('No such recruit.');
  const price = recruitPrice(p);
  if (p.gold < price) fail(`Recruiting costs ${price} gold.`);
  p.gold -= price;
  p.recruited++;
  const type = p.recruitPool[slot];
  p.recruitPool[slot] = randomImmigrant(s);
  return createUnit(s, nation, type, { kind: 'europe' });
}

export function train(s: GameState, nation: Player['id'], type: UnitTypeId): Unit {
  const p = player(s, nation);
  const def = UNIT_TYPES[type];
  if (!TRAINABLE.includes(type) && !PURCHASABLE.includes(type)) fail(`${def.name} cannot be bought in Europe.`);
  const price = def.price!;
  if (p.gold < price) fail(`${def.name} costs ${price} gold.`);
  p.gold -= price;
  return createUnit(s, nation, type, { kind: 'europe' });
}

/** Called each turn: crosses bring a new immigrant to the docks. */
export function processImmigration(s: GameState, p: Player): void {
  if (p.crosses < p.crossesRequired) return;
  p.crosses -= p.crossesRequired;
  p.crossesRequired += p.id === 'england' ? 12 : 20;
  const slot = randInt(s, p.recruitPool.length);
  const type = p.recruitPool[slot];
  p.recruitPool[slot] = randomImmigrant(s);
  createUnit(s, p.id, type, { kind: 'europe' });
  message(s, `Religious unrest in Europe: a ${UNIT_TYPES[type].name} has arrived on the docks.`, p.id);
}

export function equipInEurope(s: GameState, unitId: string, role: RoleId): void {
  const u = s.units[unitId];
  requireInEurope(u);
  if (UNIT_TYPES[u.type].kind !== 'colonist') fail('Only colonists can be equipped.');
  const p = player(s, u.owner);
  // Sell back current equipment first.
  const current = u.role === 'pioneer' ? { tools: u.tools } : ROLES[u.role].goods;
  const want = role === 'pioneer' ? { tools: PIONEER_MAX_TOOLS } : ROLES[role].goods;
  let cost = 0;
  for (const [g, n] of Object.entries(want) as [GoodId, number][]) cost += n * buyPrice(p, g);
  let refund = 0;
  for (const [g, n] of Object.entries(current) as [GoodId, number][]) refund += n * sellPrice(p, g);
  if (p.gold + refund < cost) fail(`Equipping costs ${cost} gold.`);
  for (const [g, n] of Object.entries(current) as [GoodId, number][]) if (n) sellToMarket(s, p, g, n);
  p.gold -= cost;
  for (const [g, n] of Object.entries(want) as [GoodId, number][]) adjustMarket(p, g, -n);
  u.role = role;
  u.tools = role === 'pioneer' ? PIONEER_MAX_TOOLS : 0;
}

export function boardInEurope(s: GameState, unitId: string, carrierId: string): void {
  const u = s.units[unitId];
  const ship = s.units[carrierId];
  requireInEurope(u);
  requireInEurope(ship);
  if (isShip(u)) fail('Ships cannot board ships.');
  if (cargoFree(s, ship) <= 0) fail('The ship is full.');
  u.loc = { kind: 'carrier', carrierId };
  u.state = 'sentry';
}

export function sailToAmerica(s: GameState, carrierId: string): void {
  const ship = s.units[carrierId];
  requireInEurope(ship);
  if (!isShip(ship)) fail('Only ships can sail.');
  ship.loc = { kind: 'sailing', to: 'america', turnsLeft: SAIL_TURNS };
  ship.moves = 0;
}

export function sailToEurope(s: GameState, carrierId: string): void {
  const ship = s.units[carrierId];
  if (!ship || !isShip(ship)) fail('Only ships can sail to Europe.');
  if (ship.loc.kind !== 'map') fail('The ship must be at sea.');
  const tile = s.map.tiles[ship.loc.y * s.map.width + ship.loc.x];
  if (tile.t !== 'highSeas') fail('Ships can only sail to Europe from the high seas.');
  if (colonyAt(s, ship.loc.x, ship.loc.y)) fail('The ship is in port.');
  player(s, ship.owner).entry = { x: ship.loc.x, y: ship.loc.y };
  ship.loc = { kind: 'sailing', to: 'europe', turnsLeft: SAIL_TURNS };
  ship.moves = 0;
  delete ship.dest;
}

/** Ships at sea between the continents advance one turn. */
export function advanceSailing(s: GameState, ship: Unit): void {
  if (ship.loc.kind !== 'sailing') return;
  ship.loc.turnsLeft--;
  if (ship.loc.turnsLeft > 0) return;
  const p = player(s, ship.owner);
  if (ship.loc.to === 'europe') {
    ship.loc = { kind: 'europe' };
    message(s, `${unitName(ship)} has arrived in Europe.`, ship.owner);
    // Passengers step onto the docks.
    for (const u of unitsAboard(s, ship)) u.state = 'active';
  } else {
    ship.loc = { kind: 'map', x: p.entry.x, y: p.entry.y };
    message(s, `${unitName(ship)} has arrived in the New World.`, ship.owner, p.entry);
  }
}

export function unboardInEurope(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'carrier') fail('The unit is not on a ship.');
  const ship = s.units[u.loc.carrierId];
  requireInEurope(ship);
  u.loc = { kind: 'europe' };
  u.state = 'active';
}

/** Drifts prices back toward their starting value. */
export function recoverMarkets(s: GameState): void {
  for (const p of s.players) {
    const chance = p.id === 'netherlands' ? 0.2 : 0.1;
    for (const g of GOODS) {
      if (random(s) >= chance) continue;
      const m = p.market[g];
      const base = GOOD_DEFS[g].price;
      if (m.price < base) m.price++;
      else if (m.price > base) m.price--;
    }
  }
}
