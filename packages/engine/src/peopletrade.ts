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
import { noteGoods } from './history.js';
import { notePeopleTrade, settlementName } from './natives.js';
import { pairAtWar, pairTreaty, playingPeople, sideName, standingWith } from './peoplediplomacy.js';
import { reserveOf } from './peopleeconomy.js';
import { peopleTreatyRules } from './peopletreaties.js';
import { kindOfId, systemsOfId } from './playerkind.js';
import { cargoFree, cargoRoomFor, message, player, unitName, unitPosition, warehouseCapacity } from './queries.js';
import { GOOD_DEFS, type GoodId } from './rules/goods.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import { UNIT_TYPES } from './rules/units.js';
import { goodsOf, nativeRulesOf, peopleOf } from './scenarios/index.js';
import { track } from './telemetry.js';
import type { Colony, GameState, Settlement, Unit } from './types.js';
import { colonyList } from './unitindex.js';
import { sellPrice } from './europe.js';

/** Notes a playing people's sale to, or purchase from, a European nation in its ledger (its Trade report). */
function noteDeal(s: GameState, people: PlayerId, sold: boolean, good: GoodId, n: number, gold: number): void {
  noteGoods(s, people, sold ? 'toNations' : 'fromNations', good, n);
  noteGoods(s, people, sold ? 'toNationsGold' : 'fromNationsGold', good, gold);
}

/** Notes a barter in the ledger of each playing people in it. */
function noteBarter(s: GameState, by: PlayerId, other: PlayerId, give: GoodId, given: number, take: GoodId, taken: number): void {
  noteGoods(s, by, 'barterGiven', give, given);
  noteGoods(s, by, 'barterTaken', take, taken);
  if (!playingPeople(s, other)) return;
  noteGoods(s, other, 'barterGiven', take, taken);
  noteGoods(s, other, 'barterTaken', give, given);
}

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
 * carrier's owner (`trader`) getting the trade treaty's prices if the two have one. Not rounded:
 * a deal's gold is the whole amount's price, rounded (`dealGold`).
 */
export function pairPrice(s: GameState, seller: PlayerId, buyer: PlayerId, good: GoodId, trader: PlayerId): number {
  const base = kindOfId(seller) === 'people' ? peopleGoodsPrice(s, good) : europeanGoodsPrice(s, buyer, good);
  if (!pairTreaty(s, 'people-trade', seller, buyer)) return base;
  const r = peopleTreatyRules(s).trade;
  return base * (trader === seller ? r.sell : r.buy);
}

/** The gold for `n` units at a unit price, rounded. */
export function dealGold(n: number, price: number): number {
  return Math.round(n * price);
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
  let afford = Math.floor(Math.max(0, player(s, buyer).gold) / price);
  while (afford > 0 && dealGold(afford, price) > player(s, buyer).gold) afford--;
  const name = GOOD_DEFS[good].name.toLowerCase();
  if (stock <= 0) fail(`There is no ${name} to sell.`);
  if (room <= 0) fail(`There is no room for more ${name}.`);
  const n = Math.min(Math.max(0, Math.floor(amount)), stock, room, afford);
  if (n <= 0) fail(`${sideName(s, buyer)} cannot pay ${Math.round(price * 10) / 10} gold a unit for ${name}.`);
  const gold = dealGold(n, price);
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
  noteDeal(s, people, seller === people, good, n, gold);
  track(by, 'cmd:tradeWithPeople');
  track(people, seller === people ? 'trade:people sold' : 'trade:people bought', gold);
  const text = `${sideName(s, seller).replace(/^the /, 'The ')} sell ${n} ${name} to ${sideName(s, buyer)} at ${c.name} for ${gold} gold.`;
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
  // The hold's room once what is given is out of it.
  const held = cargo[give] ?? 0;
  cargo[give] = held - have;
  const room = cargoRoomFor(s, u, take);
  cargo[give] = held;
  let n = Math.min(Math.floor((have * worth) / GOOD_DEFS[take].nativeValue), stock, room);
  // What is left of the goods given must still fit beside the goods taken.
  const fits = (k: number) => {
    const left = held - Math.min(have, Math.ceil((k * GOOD_DEFS[take].nativeValue) / worth));
    cargo[give] = left;
    cargo[take] = (cargo[take] ?? 0) + k;
    const ok = cargoFree(s, u) >= 0;
    cargo[take] -= k;
    cargo[give] = held;
    return ok;
  };
  while (n > 0 && !fits(n)) n--;
  if (!cargo[take]) delete cargo[take];
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
  noteBarter(s, u.owner, other, give, given, take, n);
  track(u.owner, 'cmd:barter');
  const where = town ? town.name : settlementName(s, st!);
  const text = `At ${where}, ${sideName(s, u.owner)} give ${given} ${GOOD_DEFS[give].name.toLowerCase()} for ${n} ${GOOD_DEFS[take].name.toLowerCase()} of ${sideName(s, other)}.`;
  message(s, text, u.owner, place);
  if (town) message(s, text, town.owner, place);
  return text;
}

// ---------------------------------------------------------------------------
// A computer people's trade visits and barter (ai/people.ts, Beta 3 step 9)

/** Furs a computer people's town takes to a European colony on a trade visit, at most. */
export const TRADE_VISIT_FURS = 100;

/** Food a Naive people's town sells to a European colony short of it on a trade visit, at most. */
export const TRADE_VISIT_FOOD = 50;

/** What a computer people's town wants to hold of each good it buys: muskets and horses for its warriors, tools for its builds, cloth and trade goods for barter. */
const WANTS: Partial<Record<GoodId, number>> = { muskets: 100, horses: 50, tools: 100, cloth: 50, tradeGoods: 50 };

/** What a computer European colony keeps of a good before it sells any to a people (its own builds and soldiers). */
const KEEP: Partial<Record<GoodId, number>> = { muskets: 25, horses: 50, tools: 50 };

/**
 * A computer people trades as the braves of Beta 2 do, once a year (ai/people.ts): each of its
 * towns visits the nearest colony, within its braves' reach (`visitRange`), of a computer European
 * nation at peace with it. It sells up to `TRADE_VISIT_FURS` spare furs, which the nation buys when
 * they fetch more in Europe than they cost and it can pay (as a computer nation buys what a brave
 * offers); a people whose profile sells food (Naive) sells food above its reserve to a colony short
 * of it; and it buys the European goods its profile names (ai/profiles.ts `buys`) that the colony
 * can spare, as far as its gold goes, at the prices of Beta 2's settlement trade (a people pays
 * more for the goods it wants most), when they fetch the nation at least what they would in
 * Europe. The people comes to trade, so a trade treaty gives it the treaty's prices. Colonies of
 * nations a person plays are left to the person (`tradeWithPeople`).
 */
export function computerTradeVisits(s: GameState, people: PlayerId, prof?: { sellsFood: boolean; buys: readonly GoodId[] }): void {
  const grid = gridOf(s);
  const range = nativeRulesOf(s).visitRange;
  const colonies = colonyList(s).filter((c) => {
    if (kindOfId(c.owner) === 'people' || !systemsOfId(c.owner).peoples) return false;
    const o = player(s, c.owner);
    return !o.human && !pairAtWar(s, c.owner, people);
  });
  if (!colonies.length) return;
  const me = player(s, people);
  for (const town of colonyList(s)) {
    if (town.owner !== people) continue;
    let best: Colony | undefined;
    let bestD = Infinity;
    for (const c of colonies) {
      const d = grid.distance(c.x, c.y, town.x, town.y);
      if (d <= range && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) continue;
    const buyer = player(s, best.owner);
    const furs = Math.min(TRADE_VISIT_FURS, spare(s, town, 'furs'));
    if (furs > 0) {
      const price = pairPrice(s, people, best.owner, 'furs', people);
      const worth = sellPrice(buyer, 'furs') * (1 - buyer.tax / 100);
      if (worth > price) {
        let n = Math.min(furs, Math.max(0, warehouseCapacity(best) - best.goods.furs));
        while (n > 0 && dealGold(n, price) > buyer.gold) n--;
        if (n > 0) sellTo(s, people, town, best, 'furs', n, dealGold(n, price));
      }
    }
    // Food to a colony short of it (Naive): the price is high where food is scarce.
    if (prof?.sellsFood && best.goods.food < TRADE_VISIT_FOOD) {
      const price = pairPrice(s, people, best.owner, 'food', people);
      let n = Math.min(TRADE_VISIT_FOOD, spare(s, town, 'food'));
      while (n > 0 && dealGold(n, price) > buyer.gold) n--;
      if (n > 0) sellTo(s, people, town, best, 'food', n, dealGold(n, price));
    }
    for (const good of prof?.buys ?? []) {
      if (!goodsOf(s).includes(good)) continue;
      const want = Math.min(WANTS[good] ?? 50, warehouseCapacity(town)) - (town.goods[good] ?? 0);
      const stock = (best.goods[good] ?? 0) - (KEEP[good] ?? 0);
      if (want <= 0 || stock <= 0) continue;
      const price = pairPrice(s, best.owner, people, good, people);
      // The nation sells when the people pays at least what the good fetches in Europe.
      if (price < sellPrice(buyer, good) * (1 - buyer.tax / 100)) continue;
      let n = Math.min(want, stock);
      while (n > 0 && dealGold(n, price) > me.gold) n--;
      if (n <= 0) continue;
      const gold = dealGold(n, price);
      best.goods[good] -= n;
      town.goods[good] += n;
      me.gold -= gold;
      buyer.gold += gold;
      notePeopleTrade(s, best.owner, people as TribeId, gold);
      noteDeal(s, people, false, good, n, gold);
      track(people, 'trade:people bought', gold);
      track(people, `trade:people bought ${good}`, n);
      const text = `${sideName(s, people).replace(/^the /, 'The ')} buy ${n} ${GOOD_DEFS[good].name.toLowerCase()} at ${best.name} for ${gold} gold and take them to ${town.name}.`;
      message(s, text, people, best);
      message(s, text, best.owner, best);
    }
  }
}

/** A people's town sells goods to a colony on a trade visit: the goods move, the gold the other way, the trade counts for their standing. */
function sellTo(s: GameState, people: PlayerId, town: Colony, colony: Colony, good: GoodId, n: number, gold: number): void {
  town.goods[good] -= n;
  colony.goods[good] += n;
  player(s, colony.owner).gold -= gold;
  player(s, people).gold += gold;
  notePeopleTrade(s, colony.owner, people as TribeId, gold);
  noteDeal(s, people, true, good, n, gold);
  track(people, 'trade:people sold', gold);
  const text = `${sideName(s, people).replace(/^the /, 'The ')} bring ${n} ${GOOD_DEFS[good].name.toLowerCase()} from ${town.name} to ${colony.name} and sell them for ${gold} gold.`;
  message(s, text, people, colony);
  message(s, text, colony.owner, colony);
}

/** The worth a computer people's barter visit trades at most, in `nativeValue` (furs 1, food 0.5, cloth 3). */
export const BARTER_WORTH = 60;

/** Goods a town gives in barter, in order: European goods others want, then food above its reserve, then furs. */
const BARTER_GIVES: readonly GoodId[] = ['cloth', 'tradeGoods', 'tools', 'food', 'furs'];

/**
 * A computer people's barter visits, once a year (ai/people.ts): its towns visit up to `visits`
 * other peoples (playing or nobody's) whose town or settlement lies within its braves' reach, at
 * peace with it and not distrusting it, nearest first, each people once. A visit gives up to
 * `BARTER_WORTH` of the town's goods (European goods others want, food above its reserve, furs)
 * for goods of the same worth the other side can spare (a town's food above its reserve and furs,
 * a settlement's goods), as `barter` does, a trade treaty adding its `sell` to what is brought.
 * What is traded counts for the pair's standing (`volume`), so trade treaties, pacts and leagues
 * can follow between peoples.
 */
export function computerBarter(s: GameState, people: PlayerId, visits: number): void {
  if (visits <= 0) return;
  const grid = gridOf(s);
  const range = nativeRulesOf(s).visitRange;
  const done = new Set<PlayerId>();
  const places: { owner: PlayerId; town?: Colony; st?: Settlement; d: number; from: Colony }[] = [];
  for (const from of colonyList(s)) {
    if (from.owner !== people) continue;
    for (const c of colonyList(s)) {
      if (c.owner === people || kindOfId(c.owner) !== 'people') continue;
      const d = grid.distance(c.x, c.y, from.x, from.y);
      if (d <= range) places.push({ owner: c.owner, town: c, d, from });
    }
    for (const k in s.settlements) {
      const st = s.settlements[k];
      const d = grid.distance(st.x, st.y, from.x, from.y);
      if (d <= range) places.push({ owner: st.tribe, st, d, from });
    }
  }
  // Nearest first; ties in the order found.
  places.sort((a, b) => a.d - b.d);
  for (const place of places) {
    if (done.size >= visits) break;
    if (done.has(place.owner) || pairAtWar(s, people, place.owner)) continue;
    const rel = standingWith(s, people, place.owner);
    if (rel.hostileUntil !== undefined && s.turn < rel.hostileUntil) continue;
    if (barterVisit(s, people, place.from, place.owner, place.town, place.st)) done.add(place.owner);
  }
}

/** One barter visit from a town to another people's town or settlement; returns whether anything changed hands. */
function barterVisit(s: GameState, people: PlayerId, from: Colony, other: PlayerId, town?: Colony, st?: Settlement): boolean {
  const bonus = pairTreaty(s, 'people-trade', people, other) ? peopleTreatyRules(s).trade.sell : 1;
  const theirs = (g: GoodId) => (town ? spare(s, town, g) : Math.max(0, st!.goods?.[g] ?? 0));
  const takes: GoodId[] = town ? ['food', 'furs', 'tobacco'] : (Object.keys(st!.goods ?? {}) as GoodId[]);
  for (const give of BARTER_GIVES) {
    const have = spare(s, from, give);
    if (have <= 0) continue;
    for (const take of takes) {
      if (take === give || !goodsOf(s).includes(take)) continue;
      const stock = theirs(take);
      if (stock <= 0) continue;
      const room = Math.max(0, warehouseCapacity(from) - (from.goods[take] ?? 0));
      const giveN = Math.min(have, Math.floor(BARTER_WORTH / GOOD_DEFS[give].nativeValue));
      const n = Math.min(stock, room, Math.floor((giveN * GOOD_DEFS[give].nativeValue * bonus) / GOOD_DEFS[take].nativeValue));
      if (n <= 0) continue;
      const given = Math.min(giveN, Math.ceil((n * GOOD_DEFS[take].nativeValue) / (GOOD_DEFS[give].nativeValue * bonus)));
      from.goods[give] -= given;
      from.goods[take] += n;
      if (town) {
        town.goods[take] -= n;
        town.goods[give] += given;
      } else {
        const goods = (st!.goods ??= {});
        goods[take] = (goods[take] ?? 0) - n;
        if (give === 'muskets' || give === 'horses') goods[give] = (goods[give] ?? 0) + given;
      }
      standingWith(s, people, other).volume += Math.round(n * GOOD_DEFS[take].nativeValue);
      noteBarter(s, people, other, give, given, take, n);
      track(people, 'trade:people barter');
      const where = town ? town.name : settlementName(s, st!);
      const text = `At ${where}, ${sideName(s, people)} give ${given} ${GOOD_DEFS[give].name.toLowerCase()} from ${from.name} for ${n} ${GOOD_DEFS[take].name.toLowerCase()} of ${sideName(s, other)}.`;
      message(s, text, people, from);
      if (town) message(s, text, town.owner, town);
      return true;
    }
  }
  return false;
}
