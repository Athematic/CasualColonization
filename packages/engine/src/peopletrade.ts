/**
 * Trade with a playing people (docs/design/native-nations.md, T10 and T11; Beta 3 step 4).
 *
 * **Gold only from European trade (T10).** A playing people earns gold only by selling to
 * Europeans and spends it only on buying from them. A carrier (a wagon train, a ship, a canoe) next
 * to a town or colony of the other side trades there, at the prices of Beta 2's settlement trade:
 * - a people's goods (furs, food above its towns' reserve, anything it holds) cost a European what a
 *   settlement asks (`GOOD_DEFS.price` times `buyPriceFactor`, natives.ts `nativeUnitPrice` without
 *   the mood of a settlement);
 * - European goods (iron tools, cloth, trade goods and kettles, muskets, horses, anything) cost the
 *   people what a settlement pays (`nativeValue`, twice for the good it wants most and half as much
 *   again for the others it wants, natives.ts `nativeOffer`).
 * Either side may set the deal going: the carrier's owner, or the owner of the town or colony (a
 * people selling to a European ship next to its town). A **trade treaty** gives the side that came
 * to trade, the carrier's owner, the treaty's prices (Beta 2's `sell` and `buy`): Beta 2's
 * settlement trade, where the nation always came, read from either side.
 *
 * **Between peoples, barter.** No gold: a playing people's carrier next to another people's town
 * (playing) or settlement (nobody plays it) gives goods for goods of the same worth (`nativeValue`),
 * the one who came getting the treaty's `sell` more under a trade treaty. What is traded counts for
 * the pair's standing at its worth in gold (`volume`).
 */
import { fail } from './errors.js';
import { gridOf } from './grid.js';
import { notePeopleTrade, settlementName } from './natives.js';
import { pairAtWar, pairTreaty, playingPeople, sideName, standingWith } from './peoplediplomacy.js';
import { reserveOf } from './peopleeconomy.js';
import { peopleTreatyRules } from './peopletreaties.js';
import { kindOfId, systemsOfId } from './playerkind.js';
import { cargoRoomFor, message, player, unitName, unitPosition, warehouseCapacity } from './queries.js';
import { GOOD_DEFS, type GoodId } from './rules/goods.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import { UNIT_TYPES } from './rules/units.js';
import { goodsOf, nativeRulesOf, peopleOf } from './scenarios/index.js';
import { track } from './telemetry.js';
import type { Colony, GameState, Settlement, Unit } from './types.js';

/** What a European pays a people for a unit of its goods (a settlement's asking price, Beta 2). */
export function peopleGoodsPrice(s: GameState, good: GoodId): number {
  return Math.max(1, Math.round(GOOD_DEFS[good].price * nativeRulesOf(s).buyPriceFactor));
}

/** What a people pays a European for a unit of its goods (what a settlement pays, Beta 2: more for the goods it wants). */
export function europeanGoodsPrice(s: GameState, people: PlayerId, good: GoodId): number {
  const wanted = peopleOf(s, people as TribeId).wants.indexOf(good);
  const factor = wanted === 0 ? 2 : wanted > 0 ? 1.5 : 1;
  return Math.max(1, Math.round(GOOD_DEFS[good].nativeValue * factor));
}

/**
 * The price per unit of `good` sold by `seller` to `buyer` (a nation and a playing people), the
 * carrier's owner (`trader`) getting the trade treaty's prices if the two have one.
 */
export function pairPrice(s: GameState, seller: PlayerId, buyer: PlayerId, good: GoodId, trader: PlayerId): number {
  const base = kindOfId(seller) === 'people' ? peopleGoodsPrice(s, good) : europeanGoodsPrice(s, buyer, good);
  if (!pairTreaty(s, 'people-trade', seller, buyer)) return base;
  const r = peopleTreatyRules(s).trade;
  return Math.max(1, Math.round(base * (trader === seller ? r.sell : r.buy)));
}

/** How much of a good a town or colony can let go: a people's town keeps its reserve of food. */
function spare(s: GameState, c: Colony, good: GoodId): number {
  const have = c.goods[good] ?? 0;
  if (good === 'food' && kindOfId(c.owner) === 'people') return Math.max(0, have - reserveOf(s, c));
  return Math.max(0, have);
}

function carrierBeside(s: GameState, unitId: string, x: number, y: number, what: string): Unit {
  const u = s.units[unitId];
  if (!u || UNIT_TYPES[u.type].cargo <= 0) fail('Only wagon trains, ships and canoes carry goods to trade.');
  const pos = unitPosition(s, u);
  if (!pos || u.loc.kind !== 'map' || gridOf(s).distance(pos.x, pos.y, x, y) !== 1) fail(`${unitName(u)} must be next to the ${what}.`);
  return u;
}

/**
 * A carrier next to a town or colony of the other side trades `amount` of `good` there: it sells
 * from its hold (`load` false) or buys into it (`load` true). One of the two is a European nation,
 * the other a playing people; `by` is the player setting the deal going (either owner). Gold goes
 * from the buyer to the seller as far as the buyer can pay.
 */
export function tradeWithPeople(s: GameState, by: PlayerId, unitId: string, colonyId: string, good: GoodId, amount: number, load: boolean): string {
  const c = s.colonies[colonyId];
  if (!c) fail('There is no such town or colony.');
  const u = carrierBeside(s, unitId, c.x, c.y, kindOfId(c.owner) === 'people' ? 'town' : 'colony');
  if (by !== u.owner && by !== c.owner) fail('Only the owner of the carrier or of the town trades here.');
  const people = kindOfId(u.owner) === 'people' ? u.owner : c.owner;
  const nation = people === u.owner ? c.owner : u.owner;
  if (!playingPeople(s, people) || kindOfId(nation) === 'people' || !systemsOfId(nation).peoples) fail('Trade for gold is between a European nation and a playing people.');
  if (!goodsOf(s).includes(good)) fail('There is no such good here.');
  if (pairAtWar(s, nation, people)) fail(`${sideName(s, nation)} and ${sideName(s, people)} are at war.`);
  const seller = load ? c.owner : u.owner;
  const buyer = load ? u.owner : c.owner;
  const cargo = (u.cargo ??= {});
  const stock = load ? spare(s, c, good) : cargo[good] ?? 0;
  const room = load ? cargoRoomFor(s, u, good) : Math.max(0, warehouseCapacity(c) - c.goods[good]);
  const price = pairPrice(s, seller, buyer, good, u.owner);
  const afford = Math.floor(Math.max(0, player(s, buyer).gold) / price);
  const name = GOOD_DEFS[good].name.toLowerCase();
  if (stock <= 0) fail(`There is no ${name} to sell.`);
  if (room <= 0) fail(`There is no room for more ${name}.`);
  const n = Math.min(Math.max(0, Math.floor(amount)), stock, room, afford);
  if (n <= 0) fail(`${sideName(s, buyer)} cannot pay ${price} gold a unit for ${name}.`);
  const gold = n * price;
  if (load) {
    c.goods[good] -= n;
    cargo[good] = (cargo[good] ?? 0) + n;
  } else {
    cargo[good] = (cargo[good] ?? 0) - n;
    c.goods[good] += n;
  }
  if (!cargo[good]) delete cargo[good];
  player(s, buyer).gold -= gold;
  player(s, seller).gold += gold;
  notePeopleTrade(s, nation, people as TribeId, gold);
  track(by, 'cmd:tradeWithPeople');
  track(people, seller === people ? 'trade:people sold' : 'trade:people bought', gold);
  const text = `${sideName(s, seller).replace(/^the /, 'The ')} sell ${n} ${name} to ${sideName(s, buyer)} at ${c.name} for ${gold} gold (${price} a unit).`;
  message(s, text, seller, c);
  message(s, text, buyer, c);
  return text;
}

/**
 * A playing people's carrier next to another people's town (playing) or settlement (nobody plays
 * it) barters: it gives up to `amount` of `give` for goods `take` of the same worth (`nativeValue`),
 * as far as the other side holds them and the hold has room; under a trade treaty what it brings is
 * worth the treaty's `sell` more. Muskets and horses a settlement takes arm its braves.
 */
export function barter(s: GameState, by: PlayerId, unitId: string, at: { colonyId?: string; settlementId?: string }, give: GoodId, amount: number, take: GoodId): string {
  const town = at.colonyId ? s.colonies[at.colonyId] : undefined;
  const st: Settlement | undefined = at.settlementId ? s.settlements[at.settlementId] : undefined;
  if (!town && !st) fail('There is no such town or settlement.');
  const place = (town ?? st)!;
  const u = carrierBeside(s, unitId, place.x, place.y, town ? 'town' : 'settlement');
  if (by !== u.owner) fail('Only the carrier’s owner barters.');
  if (!playingPeople(s, u.owner)) fail('Barter is between peoples: only a playing people’s carrier barters.');
  const other: PlayerId = town ? town.owner : st!.tribe;
  if (other === u.owner || kindOfId(other) !== 'people' || (town && !playingPeople(s, other))) fail('Barter is between peoples.');
  if (pairAtWar(s, u.owner, other)) fail(`You are at war with ${sideName(s, other)}.`);
  if (give === take) fail('Barter one good for another.');
  const cargo = (u.cargo ??= {});
  const have = Math.min(cargo[give] ?? 0, Math.max(0, Math.floor(amount)));
  if (have <= 0) fail(`There is no ${GOOD_DEFS[give].name.toLowerCase()} aboard.`);
  const worth = GOOD_DEFS[give].nativeValue * (pairTreaty(s, 'people-trade', u.owner, other) ? peopleTreatyRules(s).trade.sell : 1);
  const stock = town ? spare(s, town, take) : st!.goods?.[take] ?? 0;
  const n = Math.min(Math.floor((have * worth) / GOOD_DEFS[take].nativeValue), stock, cargoRoomFor(s, u, take) + (give === take ? have : 0));
  if (n <= 0) fail(`${sideName(s, other).replace(/^the /, 'The ')} have no ${GOOD_DEFS[take].name.toLowerCase()} to spare for it.`);
  const given = Math.min(have, Math.ceil((n * GOOD_DEFS[take].nativeValue) / worth));
  cargo[give] = (cargo[give] ?? 0) - given;
  if (!cargo[give]) delete cargo[give];
  cargo[take] = (cargo[take] ?? 0) + n;
  if (town) {
    town.goods[take] -= n;
    town.goods[give] += given;
  } else {
    const goods = (st!.goods ??= {});
    goods[take] = (goods[take] ?? 0) - n;
    if (give === 'muskets' || give === 'horses') goods[give] = (goods[give] ?? 0) + given;
  }
  standingWith(s, u.owner, other).volume += Math.round(n * GOOD_DEFS[take].nativeValue);
  track(u.owner, 'cmd:barter');
  const where = town ? town.name : settlementName(s, st!);
  const text = `At ${where}, ${sideName(s, u.owner)} give ${given} ${GOOD_DEFS[give].name.toLowerCase()} for ${n} ${GOOD_DEFS[take].name.toLowerCase()} of ${sideName(s, other)}.`;
  message(s, text, u.owner, place);
  if (town) message(s, text, town.owner, place);
  return text;
}
