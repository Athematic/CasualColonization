import { fail } from './errors.js';
import { track } from './telemetry.js';
import { hasFather } from './fathers.js';
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
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { IMMIGRANT_WEIGHTS, PIONEER_MAX_TOOLS, PURCHASABLE, ROLES, TRAINABLE, UNIT_TYPES, type RoleId, type UnitTypeId } from './rules/units.js';
import type { GameState, MarketEntry, Player, Unit } from './types.js';

export const SAIL_TURNS = 3;

export function sailTurns(s: GameState, nation: Player['id']): number {
  return hasFather(s, nation, 'ferdinandMagellan') ? SAIL_TURNS - 1 : SAIL_TURNS;
}

/** Gold needed to lift a boycott. */
export function arrears(p: Player, good: GoodId): number {
  return Math.max(500, 100 * buyPrice(p, good) * 3);
}

function requireTrade(p: Player, good: GoodId): void {
  if (p.independence !== 'none') fail('Europe does not trade with rebels.');
  if (p.boycotts[good]) fail(`${GOOD_DEFS[good].name} is under boycott. Pay the arrears to trade it again.`);
}

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
    // A price above the maximum (after the double-prices cheat) does not jump back down on a purchase.
    if (m.price < def.maxPrice) m.price += 1;
  }
}

export function recruitPrice(p: Player): number {
  const progress = Math.min(1, p.crosses / p.crossesRequired);
  return Math.max(80, Math.round((300 + 40 * p.recruited) * (1 - progress * 0.6)));
}

export function randomImmigrant(s: GameState, nation?: Player['id']): UnitTypeId {
  const brewster = nation && hasFather(s, nation, 'williamBrewster');
  return weightedPick(s, brewster ? IMMIGRANT_WEIGHTS.filter(([t]) => t !== 'pettyCriminal' && t !== 'indenturedServant') : IMMIGRANT_WEIGHTS);
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
  noteTrade(s, p.id, net);
  adjustMarket(p, good, amount);
  maybeRaiseTax(s, p, gross, good);
  return net;
}

function maybeRaiseTax(s: GameState, p: Player, gross: number, good: GoodId): void {
  if (p.tax >= 70 || gross < 100 || p.pendingTax) return;
  const chance = Math.min(0.12, 0.015 + s.turn / 3000);
  if (random(s) >= chance) return;
  const rate = Math.min(70, p.tax + 1 + randInt(s, 4));
  if (p.human) {
    // People decide: accept, or refuse and hold a party with the goods.
    p.pendingTax = { rate, good };
  } else {
    p.tax = rate;
    track(p.id, 'tax:raise accepted');
    message(s, `The Crown has raised the tax rate to ${p.tax}%.`, p.id);
  }
}

/** Accepts or refuses a pending tax raise. Refusing boycotts the good and dumps it from one colony. */
export function answerTax(s: GameState, nation: Player['id'], accept: boolean): string {
  const p = player(s, nation);
  const pending = p.pendingTax;
  if (!pending) fail('There is no tax raise to answer.');
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
  const colony = Object.values(s.colonies)
    .filter((c) => c.owner === nation)
    .sort((a, b) => b.goods[pending.good] - a.goods[pending.good])[0];
  let text = `You refuse the tax. ${GOOD_DEFS[pending.good].name} is now boycotted in Europe.`;
  if (colony && colony.goods[pending.good] > 0) {
    text = `Colonists in ${colony.name} throw ${colony.goods[pending.good]} ${name} into the harbour in protest. ${GOOD_DEFS[pending.good].name} is now boycotted in Europe.`;
    colony.goods[pending.good] = 0;
    colony.liberty += 50;
  }
  message(s, text, nation, colony);
  return text;
}

export function payArrears(s: GameState, nation: Player['id'], good: GoodId): void {
  const p = player(s, nation);
  if (!p.boycotts[good]) fail('That good is not boycotted.');
  const cost = arrears(p, good);
  if (p.gold < cost) fail(`The arrears are ${cost} gold.`);
  p.gold -= cost;
  delete p.boycotts[good];
  track(nation, 'cmd:payArrears');
}

/** End-of-turn sales by a colony's custom house; keeps 50 of each exported good. */
export function runCustomHouse(s: GameState, colonyId: string): void {
  const colony = s.colonies[colonyId];
  if (!colony || colony.buildings.customHouse === 0) return;
  const p = player(s, colony.owner);
  if (p.independence === 'declared') return;
  let total = 0;
  for (const g of GOODS) {
    if (!colony.exports[g] || p.boycotts[g]) continue;
    const amount = colony.goods[g] - 50;
    if (amount <= 0) continue;
    colony.goods[g] -= amount;
    total += sellToMarket(s, p, g, amount);
  }
  if (total > 0) track(colony.owner, 'trade:custom house sales');
  if (total > 0) message(s, `The custom house in ${colony.name} sold goods for ${total} gold.`, colony.owner, colony);
}

export function sellGoods(s: GameState, carrierId: string, good: GoodId, amount: number): number {
  const ship = s.units[carrierId];
  requireInEurope(ship);
  const have = ship.cargo?.[good] ?? 0;
  amount = Math.min(amount, have);
  if (amount <= 0) fail('Nothing to sell.');
  const p = player(s, ship.owner);
  requireTrade(p, good);
  ship.cargo![good] = have - amount;
  track(p.id, 'cmd:sellGoods');
  return sellToMarket(s, p, good, amount);
}

export function buyGoods(s: GameState, carrierId: string, good: GoodId, amount: number): void {
  const ship = s.units[carrierId];
  requireInEurope(ship);
  if (!isShip(ship)) fail('Only ships carry goods from Europe.');
  amount = Math.min(amount, cargoRoomFor(s, ship, good));
  if (amount <= 0) fail('The ship has no room.');
  const p = player(s, ship.owner);
  requireTrade(p, good);
  const cost = amount * buyPrice(p, good);
  if (cost > p.gold) fail(`You need ${cost} gold.`);
  p.gold -= cost;
  ship.cargo = ship.cargo ?? {};
  ship.cargo[good] = (ship.cargo[good] ?? 0) + amount;
  adjustMarket(p, good, -amount);
  track(p.id, 'cmd:buyGoods');
  track(p.id, `europe:bought ${GOOD_DEFS[good].name.toLowerCase()}`);
}

export function recruit(s: GameState, nation: Player['id'], slot: number): Unit {
  const p = player(s, nation);
  if (p.independence !== 'none') fail('Europe sends no colonists to rebels.');
  if (slot < 0 || slot >= p.recruitPool.length) fail('No such recruit.');
  const price = recruitPrice(p);
  if (p.gold < price) fail(`Recruiting costs ${price} gold.`);
  p.gold -= price;
  p.recruited++;
  const type = p.recruitPool[slot];
  p.recruitPool[slot] = randomImmigrant(s, nation);
  track(nation, 'cmd:recruit');
  return createUnit(s, nation, type, { kind: 'europe' });
}

export function train(s: GameState, nation: Player['id'], type: UnitTypeId): Unit {
  const p = player(s, nation);
  const def = UNIT_TYPES[type];
  if (p.independence !== 'none') fail('Europe does not trade with rebels.');
  if (!TRAINABLE.includes(type) && !PURCHASABLE.includes(type)) fail(`${def.name} cannot be bought in Europe.`);
  const price = def.price!;
  if (p.gold < price) fail(`${def.name} costs ${price} gold.`);
  p.gold -= price;
  track(nation, 'cmd:train');
  track(nation, `${def.kind === 'colonist' ? 'trained expert' : 'bought unit'}:${def.name}`);
  return createUnit(s, nation, type, { kind: 'europe' });
}

/** Called each turn: crosses bring a new immigrant to the docks. */
export function processImmigration(s: GameState, p: Player): void {
  if (p.crosses < p.crossesRequired || p.independence !== 'none') return;
  p.crosses -= p.crossesRequired;
  p.crossesRequired += p.id === 'england' ? 12 : 20;
  // Brewster lets the colony pick the best candidate; otherwise chance decides.
  const slot = hasFather(s, p.id, 'williamBrewster')
    ? p.recruitPool.reduce((best, t, i) => (UNIT_TYPES[t].skill > UNIT_TYPES[p.recruitPool[best]].skill ? i : best), 0)
    : randInt(s, p.recruitPool.length);
  const type = p.recruitPool[slot];
  p.recruitPool[slot] = randomImmigrant(s, p.id);
  createUnit(s, p.id, type, { kind: 'europe' });
  track(p.id, 'europe:immigrant (crosses)');
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
  for (const g of Object.keys(want) as GoodId[]) requireTrade(p, g);
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
  track(u.owner, 'cmd:equip');
  track(u.owner, `equip:${role}`);
}

export function boardInEurope(s: GameState, unitId: string, carrierId: string): void {
  const u = s.units[unitId];
  const ship = s.units[carrierId];
  requireInEurope(u);
  requireInEurope(ship);
  if (isShip(u)) fail('Ships cannot board ships.');
  if (cargoFree(s, ship) <= 0) fail('The ship is full.');
  if (ship.repair) fail(`${unitName(ship)} is under repair.`);
  u.loc = { kind: 'carrier', carrierId };
  u.state = 'sentry';
  track(u.owner, 'cmd:board');
}

export function sailToAmerica(s: GameState, carrierId: string): void {
  const ship = s.units[carrierId];
  requireInEurope(ship);
  if (!isShip(ship)) fail('Only ships can sail.');
  if (ship.repair) fail(`${unitName(ship)} is under repair for ${ship.repair} more turns.`);
  ship.loc = { kind: 'sailing', to: 'america', turnsLeft: sailTurns(s, ship.owner) };
  ship.moves = 0;
  track(ship.owner, 'cmd:sailToAmerica');
}

export function sailToEurope(s: GameState, carrierId: string): void {
  const ship = s.units[carrierId];
  if (!ship || !isShip(ship)) fail('Only ships can sail to Europe.');
  if (ship.loc.kind !== 'map') fail('The ship must be at sea.');
  const tile = s.map.tiles[ship.loc.y * s.map.width + ship.loc.x];
  if (tile.t !== 'highSeas') fail('Ships can only sail to Europe from the high seas.');
  if (colonyAt(s, ship.loc.x, ship.loc.y)) fail('The ship is in port.');
  if (player(s, ship.owner).independence !== 'none') fail('Rebel ships are not welcome in Europe.');
  player(s, ship.owner).entry = { x: ship.loc.x, y: ship.loc.y };
  ship.loc = { kind: 'sailing', to: 'europe', turnsLeft: sailTurns(s, ship.owner) };
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
    ship.loc = { kind: 'europe' };
    message(s, `${unitName(ship)} has arrived in Europe.`, ship.owner);
    for (const u of unitsAboard(s, ship)) {
      u.state = 'active';
      if (u.type === 'treasure') {
        const gross = u.treasure ?? 0;
        const net = gross - Math.floor((gross * p.tax) / 100);
        p.gold += net;
        delete s.units[u.id];
        track(p.id, 'treasure:shipped by galleon');
        message(s, `The treasure reaches Europe safely: ${net} gold after tax.`, ship.owner);
      }
    }
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
  track(u.owner, 'cmd:unboard');
}

/** Drifts prices back toward their starting value. */
export function recoverMarkets(s: GameState): void {
  for (const p of s.players) {
    const chance = (p.id === 'netherlands' ? 0.2 : 0.1) * (hasFather(s, p.id, 'janDeWitt') ? 2 : 1);
    for (const g of GOODS) {
      if (random(s) >= chance) continue;
      const m = p.market[g];
      const base = GOOD_DEFS[g].price;
      if (m.price < base) m.price++;
      else if (m.price > base) m.price--;
    }
  }
}
