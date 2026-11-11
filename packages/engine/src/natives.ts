import { gridOf } from './grid.js';
import { fail } from './errors.js';
import { track } from './telemetry.js';
import { describeMove } from './movement.js';
import { perfEnd, perfStart } from './perf.js';
import { hasSubmitted, nativeUnitPrice, processBraves, settlementKind } from './braves.js';
import { addOf, modifiers, mulOf } from './scenarios/modifiers.js';
import { noteGoods, noteHistory } from './history.js';
import { cargoRoomFor, colonyPopulation, createUnit, message, player, reveal, tileAt, unitName, unitPosition } from './queries.js';
import { random, randInt } from './rng.js';
import { noteTrade } from './stats.js';
import { GOOD_DEFS, type GoodId } from './rules/goods.js';
import { isCompanyIdent, TRIBES, type NationId, type TribeId } from './rules/nations.js';
import { NATIVE_RULES, type TensionThresholds } from './rules/natives.js';
import { TERRAIN } from './rules/terrain.js';
import { UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import type { Colony, GameState, PeopleRelation, Settlement, Unit } from './types.js';
import { calendarOf, difficultyOf, goodsOf, landReachOf, mechanicsOf, nationOf, nativeProduceOf, nativeRulesOf, peopleOf, yearValue } from './scenarios/index.js';
import { peoplePairRandom } from './relations.js';
import { removeUnit, colonyList } from './unitindex.js';
import { breakFaith, leasedFromBeside, noteLandTaken, notePeopleContact, peopleSellFactor, peopleTensionFall, peopleTreatyRules, processPeopleTreaties } from './peopletreaties.js';

/**
 * The settlement next to a unit, checked for a visit. A wagon train or ship trading there may
 * make one sale and one purchase in the same turn: `deal` names the one it is about to make.
 */
function adjacentSettlement(s: GameState, u: Unit, settlementId: string, deal?: 'sold' | 'bought', routed = false): Settlement {
  const grid = gridOf(s);
  const st = s.settlements[settlementId];
  const pos = unitPosition(s, u);
  if (!st || !pos || grid.distance(pos.x, pos.y, st.x, st.y) !== 1) fail('The unit must be next to the settlement.');
  const visit = u.trade && u.trade.at === st.id && u.trade.turn === s.turn ? u.trade : undefined;
  if (deal && visit?.[deal]) fail(deal === 'sold' ? 'You have already sold goods here this turn.' : 'You have already bought goods here this turn.');
  // A unit on a trade route trades at the stop it has just reached, as at a partner's colony.
  if (u.moves <= 0 && !(deal && visit) && !routed) fail(`${unitName(u)} has no moves left.`);
  const tribe = s.tribes.find((t) => t.id === st.tribe)!;
  if (tribe.stance[u.owner] === 'war') fail(`The ${TRIBES[st.tribe].name} refuse to meet you.`);
  return st;
}

function noteDeal(s: GameState, u: Unit, st: Settlement, deal: 'sold' | 'bought'): void {
  const visit = u.trade && u.trade.at === st.id && u.trade.turn === s.turn ? u.trade : { at: st.id, turn: s.turn };
  visit[deal] = true;
  u.trade = visit;
  u.moves = 0;
}

export function settlementName(s: GameState, st: Settlement): string {
  return `${TRIBES[st.tribe].name} ${st.capital ? 'capital' : settlementKind(s, st).name}`;
}

/** A scout speaks with the chief: gifts, knowledge of the land or nothing. */
export function speakToChief(s: GameState, unitId: string, settlementId: string): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId);
  if (u.role !== 'scout') fail('Only scouts can speak with the chief.');
  u.moves = 0;
  track(u.owner, 'cmd:speak');
  if (tensionOf(st, u.owner) > 500 && random(s) < 0.3) {
    removeUnit(s, u.id);
    const text = `The angry ${TRIBES[st.tribe].name} have killed your scout.`;
    message(s, text, u.owner, st);
    return text;
  }
  if (st.visited.includes(u.owner)) {
    const text = 'The chief has already spoken with your scouts.';
    message(s, text, u.owner, st);
    return text;
  }
  st.visited.push(u.owner);
  notePeopleContact(s, u.owner, st.tribe);
  const generous = addOf(modifiers(s, u.owner, 'nativeGifts'));
  const r = random(s);
  let text: string;
  if (r < 0.4) {
    reveal(s, u.owner, st.x, st.y, 6);
    text = `The chief of the ${settlementName(s, st)} tells tales of the surrounding lands.`;
  } else if (r < 0.8 + generous) {
    const gold = (50 + randInt(s, 200)) * (st.capital ? 2 : 1);
    player(s, u.owner).gold += gold;
    text = `The chief of the ${settlementName(s, st)} offers a gift of ${gold} gold.`;
  } else {
    text = `The chief of the ${settlementName(s, st)} listens politely, then sends your scout on its way.`;
  }
  message(s, text, u.owner, st);
  return text;
}

/** A colonist lives among the natives and learns their skill. */
export function learnSkill(s: GameState, unitId: string, settlementId: string): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId);
  const def = UNIT_TYPES[u.type];
  if (def.kind !== 'colonist' || u.role !== 'none') fail('Only unarmed, unequipped colonists can learn from natives.');
  if (def.skill > 0) fail('This colonist is already an expert.');
  if (u.type === 'pettyCriminal' && !modifiers(s, u.owner, 'nativesTeach').some((m) => m.units.includes(u.type))) fail('The natives will not teach a petty criminal.');
  if (!st.skill) fail('This settlement has nothing more to teach.');
  const skill = st.skill;
  u.type = skill;
  u.moves = 0;
  st.skill = null;
  track(u.owner, 'cmd:learn');
  const text = `Your colonist has lived among the ${TRIBES[st.tribe].name} and become a ${UNIT_TYPES[skill].name}.`;
  message(s, text, u.owner, st);
  return text;
}

/**
 * Gold a settlement pays for goods, at most what it holds. With `nation`, a trade treaty between it
 * and the settlement's people raises the price (N4).
 */
export function nativeOffer(s: GameState, st: Settlement, good: GoodId, amount: number, nation?: NationId): number {
  const tribe = peopleOf(s, st.tribe);
  const wanted = tribe.wants.indexOf(good);
  const factor = wanted === 0 ? 2 : wanted > 0 ? 1.5 : 1;
  const offer = Math.round(amount * GOOD_DEFS[good].nativeValue * factor * (st.capital ? 1.3 : 1) * peopleSellFactor(s, nation, st.tribe));
  return Math.min(offer, st.gold);
}

/**
 * Sells one kind of cargo from a wagon train or ship to a native settlement. `routed`: a unit on a
 * trade route at a partner's settlement (routes.ts), which may trade on the turn it arrives.
 */
export function tradeWithSettlement(s: GameState, unitId: string, settlementId: string, good?: GoodId, routed = false): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId, 'sold', routed);
  const cargo = u.cargo ?? {};
  const chosen = good ?? goodsOf(s).filter((g) => (cargo[g] ?? 0) > 0).sort((a, b) => nativeOffer(s, st, b, cargo[b]!, u.owner) - nativeOffer(s, st, a, cargo[a]!, u.owner))[0];
  if (!chosen || !(cargo[chosen] ?? 0)) fail('There is nothing to trade.');
  const amount = Math.min(100, cargo[chosen]!);
  const gold = nativeOffer(s, st, chosen, amount, u.owner);
  if (gold <= 0) fail('The natives have no gold left to trade.');
  cargo[chosen] = cargo[chosen]! - amount;
  st.gold -= gold;
  // Muskets and horses arm and mount the tribe's braves (see braves.ts); other goods are used up.
  if (chosen === 'muskets' || chosen === 'horses') {
    const goods = (st.goods = st.goods ?? {});
    goods[chosen] = (goods[chosen] ?? 0) + amount;
  }
  addTension(st, u.owner, -15);
  player(s, u.owner).gold += gold;
  notePeopleTrade(s, u.owner, st.tribe, gold);
  noteTrade(s, u.owner, gold);
  noteDeal(s, u, st, 'sold');
  track(u.owner, 'cmd:tradeNatives');
  track(u.owner, 'natives:gold from sales', gold);
  noteGoods(s, u.owner, 'natives', chosen, amount);
  track(u.owner, UNIT_TYPES[u.type].kind === 'wagon' ? 'natives:sold by wagon train' : 'natives:sold by ship');
  const text = `The ${settlementName(s, st)} buys ${amount} ${GOOD_DEFS[chosen].name.toLowerCase()} for ${gold} gold.`;
  message(s, text, u.owner, st);
  return text;
}

/**
 * Buys goods the settlement has gathered (furs, sugar, tobacco, cotton, silver, by its land) with
 * a wagon train or ship next to it, at the settlement's price (see nativeUnitPrice).
 */
export function buyFromSettlement(s: GameState, unitId: string, settlementId: string, good: GoodId, amount = 100, routed = false): string {
  const u = s.units[unitId];
  if (!u || !['wagon', 'ship'].includes(UNIT_TYPES[u.type].kind) || UNIT_TYPES[u.type].cargo <= 0) fail('Only wagon trains and ships can buy goods.');
  const st = adjacentSettlement(s, u, settlementId, 'bought', routed);
  if (!nativeProduceOf(s).includes(good)) fail(`The ${TRIBES[st.tribe].name} do not sell ${GOOD_DEFS[good].name.toLowerCase()}.`);
  const stock = st.goods?.[good] ?? 0;
  const n = Math.min(amount, stock, cargoRoomFor(s, u, good));
  if (stock <= 0) fail(`The ${settlementName(s, st)} has no ${GOOD_DEFS[good].name.toLowerCase()} to sell.`);
  if (n <= 0) fail('There is no room aboard.');
  const price = nativeUnitPrice(s, st, good, u.owner) * n;
  const p = player(s, u.owner);
  if (p.gold < price) fail(`The ${TRIBES[st.tribe].name} ask ${price} gold for ${n} ${GOOD_DEFS[good].name.toLowerCase()}.`);
  p.gold -= price;
  notePeopleTrade(s, u.owner, st.tribe, price);
  st.gold += price;
  st.goods![good] = stock - n;
  u.cargo = u.cargo ?? {};
  u.cargo[good] = (u.cargo[good] ?? 0) + n;
  addTension(st, u.owner, -10);
  noteDeal(s, u, st, 'bought');
  track(u.owner, 'cmd:buyNatives');
  track(u.owner, 'natives:goods bought', n);
  noteGoods(s, u.owner, 'fromNatives', good, n);
  track(u.owner, 'natives:gold spent buying', price);
  const text = `You buy ${n} ${GOOD_DEFS[good].name.toLowerCase()} from the ${settlementName(s, st)} for ${price} gold.`;
  message(s, text, u.owner, st);
  return text;
}

export function tensionOf(st: Settlement, nation: NationId): number {
  return st.tension[nation] ?? 0;
}

/**
 * A settlement's mood towards a nation in a word, at the thresholds its braves and its people act
 * on (fix b; pass the game's `nativeRulesOf(s).tension`): content (gifts and trade visits), wary,
 * uneasy (demands for tribute), angry (attacks) and furious (war, unless the people submitted).
 */
export function tensionLabel(t: number, tension: TensionThresholds = NATIVE_RULES.tension): string {
  return t >= tension.war ? 'furious' : t >= tension.angry ? 'angry' : t >= tension.uneasy ? 'uneasy' : t >= tension.content ? 'wary' : 'content';
}

/** How the interface colours a mood: good while no demands come, a warning while they do, bad once braves attack. */
export function tensionSeverity(t: number, tension: TensionThresholds = NATIVE_RULES.tension): 'good' | 'warn' | 'bad' {
  return t >= tension.angry ? 'bad' : t >= tension.uneasy ? 'warn' : 'good';
}

export function addTension(st: Settlement, nation: NationId, amount: number): void {
  // The Crown's forces and the chartered companies (neutral to the peoples, fix c) raise no tension.
  if (nation === 'crown' || isCompanyIdent(nation)) return;
  st.tension[nation] = Math.max(0, Math.min(1000, tensionOf(st, nation) + amount));
}

function tribeOf(s: GameState, st: Settlement) {
  return s.tribes.find((t) => t.id === st.tribe)!;
}

/**
 * The settlement whose land this tile is, unless a European has bought or taken it: the nearest
 * settlement whose land reaches the tile (its kind's `landRadius`, 1 when absent: the eight tiles
 * around it), the first in the settlements' order on a tie. The one place that knows how far
 * native land reaches (N6).
 */
export function nativeLandOwner(s: GameState, x: number, y: number): Settlement | undefined {
  const grid = gridOf(s);
  const tile = tileAt(s, x, y);
  if (!tile || tile.claim || TERRAIN[tile.t].water) return undefined;
  const reach = landReachOf(s);
  let best: Settlement | undefined;
  let bestD = Infinity;
  for (const id in s.settlements) {
    const st = s.settlements[id];
    const d = grid.distance(st.x, st.y, x, y);
    if (d < 1 || d > reach.max || d >= bestD) continue;
    if (!reach.uniform && d > (settlementKind(s, st).landRadius ?? 1)) continue;
    best = st;
    bestD = d;
  }
  return best;
}

/**
 * The settlement whose land this tile is, if that keeps `nation`'s colonies from working it: native
 * land not leased to the nation (`Tile.use`, a land use treaty, N5). What colonies read.
 */
export function nativeLandClosedTo(s: GameState, nation: NationId, x: number, y: number): Settlement | undefined {
  const st = nativeLandOwner(s, x, y);
  return st && tileAt(s, x, y)!.use !== nation ? st : undefined;
}

export function landPrice(s: GameState, nation: NationId, x: number, y: number): number {
  const st = nativeLandOwner(s, x, y);
  if (!st) return 0;
  const set = modifiers(s, nation, 'landPrice');
  if (set.length) return set[set.length - 1].set;
  if (hasSubmitted(s, st.tribe, nation)) return 0;
  const land = settlementKind(s, st).landPrice;
  return Math.round((land.base + (st.capital ? land.capital : 0)) * (1 + tensionOf(st, nation) / 500));
}

export function buyLand(s: GameState, nation: NationId, x: number, y: number): string {
  const st = nativeLandOwner(s, x, y);
  if (!st) fail('Nobody claims that land.');
  const price = landPrice(s, nation, x, y);
  const p = player(s, nation);
  if (p.gold < price) fail(`The ${TRIBES[st.tribe].name} ask ${price} gold for this land.`);
  p.gold -= price;
  st.gold += price;
  const tile = tileAt(s, x, y)!;
  tile.claim = nation;
  // A leased tile bought is the buyer's own: the lease no longer covers it (N5).
  delete tile.use;
  addTension(st, nation, -20);
  track(nation, 'cmd:buyLand');
  return price ? `You buy the land from the ${TRIBES[st.tribe].name} for ${price} gold.` : `The ${TRIBES[st.tribe].name} let you use the land freely.`;
}

export function takeLand(s: GameState, nation: NationId, x: number, y: number): string {
  const st = nativeLandOwner(s, x, y);
  if (!st) fail('Nobody claims that land.');
  // The tile is the taker's first, so a colonist working it under a lease stays (N5).
  const tile = tileAt(s, x, y)!;
  tile.claim = nation;
  delete tile.use;
  // Taking a partner's land breaks faith with it (N8); any land taken keeps treaties away for years.
  breakFaith(s, nation, st.tribe, 'land');
  noteLandTaken(s, nation, st.tribe);
  const anger = difficultyOf(s, player(s, nation)).nativeTension;
  addTension(st, nation, Math.round(250 * anger));
  track(nation, 'cmd:takeLand');
  for (const other of Object.values(s.settlements)) if (other.tribe === st.tribe && other.id !== st.id) addTension(other, nation, Math.round(60 * anger));
  const text = `You take the land. The ${TRIBES[st.tribe].name} are ${tensionLabel(tensionOf(st, nation), nativeRulesOf(s).tension)}.`;
  message(s, text, nation, st);
  return text;
}

/** New colonies unsettle the natives nearby. */
export function onColonyFounded(s: GameState, colony: { owner: NationId; x: number; y: number }): void {
  const grid = gridOf(s);
  const anger = colony.owner === 'crown' ? 1 : difficultyOf(s, player(s, colony.owner)).nativeTension;
  for (const st of Object.values(s.settlements)) {
    const d = grid.distance(st.x, st.y, colony.x, colony.y);
    if (d <= 3) addTension(st, colony.owner, Math.round((d <= 2 ? 150 : 80) * anger));
  }
}

/** Gold given to a tribe calms every one of its settlements. */
export function giftToTribe(s: GameState, nation: NationId, tribe: TribeId, gold: number): string {
  const p = player(s, nation);
  if (gold <= 0 || p.gold < gold) fail('You do not have that much gold.');
  const settlements = Object.values(s.settlements).filter((st) => st.tribe === tribe);
  if (!settlements.length) fail('That tribe has no settlements left.');
  p.gold -= gold;
  track(nation, 'cmd:giftTribe');
  for (const st of settlements) {
    st.gold += Math.round(gold / settlements.length);
    addTension(st, nation, -Math.round((gold * 1.5) / settlements.length));
  }
  return `The ${TRIBES[tribe].name} accept your gift of ${gold} gold.`;
}

/** A missionary settles in the village and starts a mission. */
export function establishMission(s: GameState, unitId: string, settlementId: string): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId);
  if (u.role !== 'missionary') fail('Only missionaries can found missions.');
  if (!mechanicsOf(s).missions) fail('There are no missions in this scenario.');
  if (st.mission) fail(`There is already a ${nationOf(s, st.mission).adjective} mission here.`);
  removeUnit(s, u.id);
  track(u.owner, 'cmd:mission');
  let text: string;
  if (tensionOf(st, u.owner) > 600) {
    track(u.owner, 'natives:missionary killed');
    text = `The ${TRIBES[st.tribe].name} have killed your missionary.`;
  } else {
    track(u.owner, 'natives:mission founded');
    st.mission = u.owner;
    st.missionExpert = u.type === 'firebrandPreacher';
    addTension(st, u.owner, -100);
    notePeopleContact(s, u.owner, st.tribe);
    text = `A mission has been established among the ${TRIBES[st.tribe].name}.`;
  }
  message(s, text, u.owner, st);
  return text;
}

function nearestColony(s: GameState, nation: NationId, x: number, y: number, within: number) {
  const grid = gridOf(s);
  let best: Colony | undefined;
  for (const c of colonyList(s)) {
    if (c.owner !== nation) continue;
    const d = grid.distance(c.x, c.y, x, y);
    if (d <= within && (!best || d < grid.distance(best.x, best.y, x, y))) best = c;
  }
  return best;
}

/**
 * Once per round: trade gold recovers, tension drifts, missions convert, tribes go to war or make
 * peace, and then the braves move (braves.ts): gifts, trade, demands and raids are their doing.
 */
/** The chance each round that a settlement's mission (of `nation`) wins a convert. */
export function conversionChance(s: GameState, st: Settlement, nation: NationId): number {
  return 0.03 * (st.missionExpert ? 2 : 1) * mulOf(modifiers(s, nation, 'conversionChance'));
}

/** What a mission's convert becomes for a nation (Bartolomé de las Casas: a free colonist). */
export function convertType(s: GameState, nation: NationId): UnitTypeId {
  return modifiers(s, nation, 'convertsBecome').at(-1)?.unit ?? 'nativeConvert';
}

export function processNatives(s: GameState): void {
  const grid = gridOf(s);
  // Chartered companies are neutral to the peoples (fix c): no pressure, no drift, no war.
  const nations = s.players.filter((p) => p.id !== 'crown' && p.kind !== 'company').map((p) => p.id);
  const difficulty = new Map(s.players.map((p) => [p.id, difficultyOf(s, p)]));
  const rules = nativeRulesOf(s);
  // Nearby colonies press on native land, more so as they grow: 3 and one per two colonists for
  // each colony within 3 tiles. Nothing below founds, moves, gives away or repeoples a colony (a
  // convert joins on the map), so each colony's pressure is worked out once; the sums are of whole
  // numbers, so their order does not matter.
  const colonies = colonyList(s);
  const weight = colonies.map((c) => 3 + Math.floor(colonyPopulation(s, c) / 2));
  // A colony with land leased from a people beside it presses less on that people (N5).
  const leased = leasedFromBeside(s, colonies);
  const leasePressure = leased.size ? peopleTreatyRules(s).landUse.pressure : 1;
  const pressureOn = new Map<string, number>();
  for (const st of Object.values(s.settlements)) {
    st.gold += st.capital ? 6 : 3;
    const tribe = tribeOf(s, st);
    pressureOn.clear();
    for (let i = 0; i < colonies.length; i++) {
      const c = colonies[i];
      if (grid.distance(c.x, c.y, st.x, st.y) <= 3) pressureOn.set(c.owner, (pressureOn.get(c.owner) ?? 0) + (leased.get(i)?.has(st.tribe) ? weight[i] * leasePressure : weight[i]));
    }
    for (const nation of nations) {
      const pressure = pressureOn.get(nation) ?? 0;
      const mission = st.mission === nation;
      const r = difficulty.get(nation)!;
      // A trade treaty calms the people faster (N4).
      addTension(st, nation, Math.round(pressure * r.nativeTension) - 4 - (mission ? 5 : 0) - peopleTensionFall(s, nation, st.tribe));
      // A desecrated burial ground is never forgiven.
      const burial = !!tribe.burial?.includes(nation);
      if (burial && tensionOf(st, nation) < rules.tension.war) st.tension[nation] = rules.tension.war;
      const t = tensionOf(st, nation);
      const atWar = tribe.stance[nation] === 'war';
      if (!atWar && (burial || (t >= rules.tension.war && !hasSubmitted(s, st.tribe, nation)))) {
        tribe.stance[nation] = 'war';
        track(nation, 'natives:tribe went to war');
        message(s, `The ${TRIBES[st.tribe].name} have dug up the hatchet against ${nationOf(s, nation).name}!`, nation, st);
        noteHistory(s, 'tribe', [nation], `The ${TRIBES[st.tribe].name} go to war with ${nationOf(s, nation).name}${burial ? ' over a desecrated burial ground' : ', their anger risen too far'}.`, { secret: true, at: st });
      } else if (atWar && !burial && t < 250 && !Object.values(s.settlements).some((o) => o.tribe === st.tribe && tensionOf(o, nation) >= 250)) {
        tribe.stance[nation] = 'peace';
        message(s, `The ${TRIBES[st.tribe].name} have made peace with ${nationOf(s, nation).name}.`, nation, st);
        noteHistory(s, 'tribe', [nation], `The ${TRIBES[st.tribe].name} make peace with ${nationOf(s, nation).name}.`, { secret: true, at: st });
      }
    }
    if (st.mission) {
      const chance = conversionChance(s, st, st.mission);
      const colony = nearestColony(s, st.mission, st.x, st.y, 8);
      if (colony && random(s) < chance) {
        const type = convertType(s, st.mission);
        createUnit(s, st.mission, type, { kind: 'map', x: colony.x, y: colony.y });
        track(st.mission, 'natives:convert joined');
        message(s, `A ${TRIBES[st.tribe].name} convert has joined ${colony.name}.`, st.mission, colony);
      }
    }
  }
  const t = perfStart();
  processBraves(s);
  perfEnd('natives > braves', t);
  updatePeopleRelations(s);
  processPeopleTreaties(s);
}

// ---------------------------------------------------------------------------
// Missionaries against rival nations

/** A missionary next to a settlement whose mission belongs to a rival denounces it: the rival may be expelled. */
export function denounceMission(s: GameState, unitId: string, settlementId: string): string {
  const u = s.units[unitId];
  const rules = nativeRulesOf(s);
  const st = adjacentSettlement(s, u, settlementId);
  if (u.role !== 'missionary') fail('Only missionaries can denounce a mission.');
  if (!mechanicsOf(s).missions) fail('There are no missions in this scenario.');
  const rival = st.mission;
  if (!rival || rival === u.owner) fail('There is no rival mission here.');
  u.moves = 0;
  track(u.owner, 'cmd:denounce');
  const chance = rules.denounceChance + (u.type === 'firebrandPreacher' ? rules.denounceExpert : 0) - (st.missionExpert ? rules.denounceExpert : 0);
  let text: string;
  if (random(s) < chance) {
    delete st.mission;
    delete st.missionExpert;
    track(u.owner, 'natives:rival mission expelled');
    noteHistory(s, 'tribe', [u.owner, rival], `${nationOf(s, u.owner).adjective} missionaries have the ${nationOf(s, rival).adjective} mission among the ${TRIBES[st.tribe].name} expelled.`, { secret: true, at: st });
    text = `Your missionary denounces the ${nationOf(s, rival).adjective} mission. The ${TRIBES[st.tribe].name} expel it.`;
    message(s, `The ${TRIBES[st.tribe].name} have expelled your mission at the ${settlementName(s, st)}, denounced by ${nationOf(s, u.owner).adjective} missionaries.`, rival, st);
  } else if (random(s) < rules.denounceFailDeath) {
    removeUnit(s, u.id);
    track(u.owner, 'natives:missionary killed');
    text = `The ${TRIBES[st.tribe].name} side with the ${nationOf(s, rival).adjective} mission and kill your missionary.`;
  } else {
    text = `The ${TRIBES[st.tribe].name} listen, but keep the ${nationOf(s, rival).adjective} mission.`;
  }
  message(s, text, u.owner, st);
  return text;
}

/** Gold a missionary pays to incite a settlement's tribe against a nation. */
export function incitePrice(s: GameState, st: Settlement): number {
  return Math.round(settlementKind(s, st).incitePrice * (st.capital ? 1.5 : 1));
}

/** A missionary pays the tribe to turn against a rival nation: its tension rises and it may go to war. */
export function inciteTribe(s: GameState, unitId: string, settlementId: string, target: NationId): string {
  const u = s.units[unitId];
  const rules = nativeRulesOf(s);
  const st = adjacentSettlement(s, u, settlementId);
  if (u.role !== 'missionary') fail('Only missionaries can incite the natives.');
  if (target === u.owner || target === 'crown' || isCompanyIdent(target) || !s.players.some((p) => p.id === target)) fail('Choose a rival European nation.');
  if (tensionOf(st, u.owner) >= rules.tension.angry) fail(`The ${TRIBES[st.tribe].name} will not listen to you.`);
  const tribe = tribeOf(s, st);
  if (tribe.stance[target] === 'war') fail(`The ${TRIBES[st.tribe].name} are already at war with ${nationOf(s, target).name}.`);
  const price = incitePrice(s, st);
  const p = player(s, u.owner);
  if (p.gold < price) fail(`The ${TRIBES[st.tribe].name} want ${price} gold to take up arms.`);
  p.gold -= price;
  st.gold += price;
  u.moves = 0;
  track(u.owner, 'cmd:incite');
  // Paying a partner people to make war breaks faith with it (N8).
  breakFaith(s, u.owner, st.tribe, 'incite');
  noteHistory(s, 'tribe', [u.owner], `${nationOf(s, u.owner).adjective} missionaries pay the ${TRIBES[st.tribe].name} ${price} gold to turn against ${nationOf(s, target).name}.`, { secret: true, at: st });
  for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) addTension(o, target, o.id === st.id ? rules.inciteTension : rules.inciteTensionOthers);
  let text = `For ${price} gold, the ${TRIBES[st.tribe].name} agree to make trouble for ${nationOf(s, target).name}.`;
  if (tensionOf(st, target) >= rules.tension.war) {
    tribe.stance[target] = 'war';
    if (tribe.submitted) tribe.submitted = tribe.submitted.filter((n) => n !== target);
    track(target, 'natives:tribe went to war');
    track(u.owner, 'natives:tribe incited to war');
    message(s, `The ${TRIBES[st.tribe].name} have dug up the hatchet against ${nationOf(s, target).name}!`, target, st);
    noteHistory(s, 'tribe', [u.owner, target], `${nationOf(s, u.owner).adjective} missionaries incite the ${TRIBES[st.tribe].name} to war with ${nationOf(s, target).name}.`, { secret: true, at: st });
    text += ' They go to war!';
  }
  message(s, text, u.owner, st);
  return text;
}

export function settlementActions(s: GameState, unitId: string, settlementId: string) {
  const st = s.settlements[settlementId];
  const u = s.units[unitId];
  const pos = unitPosition(s, u);
  if (!pos || !st) return [];
  const dx = Math.sign(st.x - pos.x);
  const dy = Math.sign(st.y - pos.y);
  const dirs = { '0,-1': 'n', '1,-1': 'ne', '1,0': 'e', '1,1': 'se', '0,1': 's', '-1,1': 'sw', '-1,0': 'w', '-1,-1': 'nw' } as const;
  const dir = dirs[`${dx},${dy}` as keyof typeof dirs];
  if (!dir) return [];
  const option = describeMove(s, unitId, dir);
  return option.kind === 'settlement' ? option.actions : [];
}

// ---------------------------------------------------------------------------
// Standing with a people (native-partners.md N3)

/** The key of a nation's standing with a people in `GameState.peopleRelations`: "france|arawak". */
export function peopleRelationKey(nation: NationId, people: TribeId): string {
  return `${nation}|${people}`;
}

/** A nation's standing with a people, if it has been written (it is written on the first trade). */
export function peopleRelationOf(s: GameState, nation: NationId, people: TribeId): PeopleRelation | undefined {
  return s.peopleRelations?.[peopleRelationKey(nation, people)];
}

/** Whether a nation can stand in relations with a people: a European nation, neither the Crown nor a company. */
function standsWithPeoples(nation: NationId): boolean {
  return nation !== 'crown' && !isCompanyIdent(nation);
}

/**
 * Whether a nation's relations with a people are good now: at peace with it, and its settlements
 * content on average (below the `content` threshold). A people with no settlements left has none.
 */
export function goodRelations(s: GameState, nation: NationId, people: TribeId): boolean {
  const tribe = s.tribes.find((t) => t.id === people);
  if (!tribe || tribe.stance[nation] === 'war') return false;
  let n = 0;
  let sum = 0;
  for (const id in s.settlements) {
    const st = s.settlements[id];
    if (st.tribe !== people) continue;
    n++;
    sum += tensionOf(st, nation);
  }
  return n > 0 && sum / n < nativeRulesOf(s).tension.content;
}

/** A nation's standing with a people, written now if it was not yet (with the run of good relations, if any, starting now). */
export function peopleRelation(s: GameState, nation: NationId, people: TribeId): PeopleRelation {
  const key = peopleRelationKey(nation, people);
  const list = (s.peopleRelations = s.peopleRelations ?? {});
  let rel = list[key];
  if (!rel) {
    rel = { nation, people, volume: 0 };
    if (goodRelations(s, nation, people)) rel.goodSince = s.turn;
    list[key] = rel;
  }
  return rel;
}

/** Notes gold that changed hands in trade between a nation and a people (sales and purchases, at settlements and with braves). */
export function notePeopleTrade(s: GameState, nation: NationId, people: TribeId, gold: number): void {
  if (gold <= 0 || !standsWithPeoples(nation)) return;
  peopleRelation(s, nation, people).volume += gold;
}

/** Whole years of the current run of good relations between a nation and a people (0 while they are not good). */
export function yearsOfGoodRelations(s: GameState, nation: NationId, people: TribeId): number {
  const since = peopleRelationOf(s, nation, people)?.goodSince;
  if (since === undefined) return 0;
  const cal = calendarOf(s);
  return yearValue(s.turn, cal) - yearValue(since, cal);
}

/**
 * A hidden threshold for a nation and a people, `base − spread` to `base + spread`, drawn from the
 * pair's own seeded stream for `purpose` each time it is asked for and never stored (as Favoured
 * Nation's and alliances' thresholds are). For the treaties of later steps.
 */
export function peopleThreshold(s: GameState, nation: NationId, people: TribeId, purpose: string, v: { base: number; spread: number }): number {
  return v.base - v.spread + Math.floor(peoplePairRandom(s, nation, people, purpose) * (2 * v.spread + 1));
}

/**
 * Once a round, after the braves: keeps each written standing's run of good relations. Only
 * records already written are looked at, so a game without native trade keeps no record at all.
 */
function updatePeopleRelations(s: GameState): void {
  const list = s.peopleRelations;
  if (!list) return;
  for (const key in list) {
    const rel = list[key];
    const good = goodRelations(s, rel.nation, rel.people);
    if (good && rel.goodSince === undefined) rel.goodSince = s.turn;
    else if (!good && rel.goodSince !== undefined) delete rel.goodSince;
  }
}
