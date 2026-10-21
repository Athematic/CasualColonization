import { fail } from './errors.js';
import { track } from './telemetry.js';
import { describeMove } from './movement.js';
import { chooseDefender, defencePower } from './combat.js';
import { hasFather } from './fathers.js';
import { colonyWorkers, createUnit, distance, message, player, reveal, tileAt, unitName, unitPosition, unitsAt } from './queries.js';
import { random, randInt } from './rng.js';
import { BUILDINGS, type BuildingKind } from './rules/buildings.js';
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { NATIONS, TRIBES, type NationId, type TribeId } from './rules/nations.js';
import { TERRAIN } from './rules/terrain.js';
import { UNIT_TYPES } from './rules/units.js';
import type { Colony, GameState, Settlement, Unit } from './types.js';

function adjacentSettlement(s: GameState, u: Unit, settlementId: string): Settlement {
  const st = s.settlements[settlementId];
  const pos = unitPosition(s, u);
  if (!st || !pos || distance(pos.x, pos.y, st.x, st.y) !== 1) fail('The unit must be next to the settlement.');
  if (u.moves <= 0) fail(`${unitName(u)} has no moves left.`);
  const tribe = s.tribes.find((t) => t.id === st.tribe)!;
  if (tribe.stance[u.owner] === 'war') fail(`The ${TRIBES[st.tribe].name} refuse to meet you.`);
  return st;
}

export function settlementName(st: Settlement): string {
  const def = TRIBES[st.tribe];
  const kind = def.settlement === 'city' ? 'city' : def.settlement === 'village' ? 'village' : 'camp';
  return `${def.name} ${st.capital ? 'capital' : kind}`;
}

/** A scout speaks with the chief: gifts, knowledge of the land or nothing. */
export function speakToChief(s: GameState, unitId: string, settlementId: string): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId);
  if (u.role !== 'scout') fail('Only scouts can speak with the chief.');
  u.moves = 0;
  track(u.owner, 'cmd:speak');
  if (tensionOf(st, u.owner) > 500 && random(s) < 0.3) {
    delete s.units[u.id];
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
  const generous = u.owner === 'france' ? 0.15 : 0;
  const r = random(s);
  let text: string;
  if (r < 0.4) {
    reveal(s, u.owner, st.x, st.y, 6);
    text = `The chief of the ${settlementName(st)} tells tales of the surrounding lands.`;
  } else if (r < 0.8 + generous) {
    const gold = (50 + randInt(s, 200)) * (st.capital ? 2 : 1);
    player(s, u.owner).gold += gold;
    text = `The chief of the ${settlementName(st)} offers a gift of ${gold} gold.`;
  } else {
    text = `The chief of the ${settlementName(st)} listens politely, then sends your scout on its way.`;
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
  if (u.type === 'pettyCriminal' && u.owner !== 'france') fail('The natives will not teach a petty criminal.');
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

export function nativeOffer(st: Settlement, good: GoodId, amount: number): number {
  const tribe = TRIBES[st.tribe];
  const wanted = tribe.wants.indexOf(good);
  const factor = wanted === 0 ? 2 : wanted > 0 ? 1.5 : 1;
  const offer = Math.round(amount * GOOD_DEFS[good].nativeValue * factor * (st.capital ? 1.3 : 1));
  return Math.min(offer, st.gold);
}

/** Sells one kind of cargo from a wagon train or ship to a native settlement. */
export function tradeWithSettlement(s: GameState, unitId: string, settlementId: string, good?: GoodId): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId);
  const cargo = u.cargo ?? {};
  const chosen = good ?? GOODS.filter((g) => (cargo[g] ?? 0) > 0).sort((a, b) => nativeOffer(st, b, cargo[b]!) - nativeOffer(st, a, cargo[a]!))[0];
  if (!chosen || !(cargo[chosen] ?? 0)) fail('There is nothing to trade.');
  const amount = Math.min(100, cargo[chosen]!);
  const gold = nativeOffer(st, chosen, amount);
  if (gold <= 0) fail('The natives have no gold left to trade.');
  cargo[chosen] = cargo[chosen]! - amount;
  st.gold -= gold;
  addTension(st, u.owner, -15);
  player(s, u.owner).gold += gold;
  u.moves = 0;
  track(u.owner, 'cmd:tradeNatives');
  track(u.owner, UNIT_TYPES[u.type].kind === 'wagon' ? 'natives:sold by wagon train' : 'natives:sold by ship');
  const text = `The ${settlementName(st)} buys ${amount} ${GOOD_DEFS[chosen].name.toLowerCase()} for ${gold} gold.`;
  message(s, text, u.owner, st);
  return text;
}

export function tensionOf(st: Settlement, nation: NationId): number {
  return st.tension[nation] ?? 0;
}

export function tensionLabel(t: number): string {
  return t < 200 ? 'content' : t < 400 ? 'uneasy' : t < 700 ? 'angry' : 'furious';
}

export function addTension(st: Settlement, nation: NationId, amount: number): void {
  if (nation === 'crown') return;
  st.tension[nation] = Math.max(0, Math.min(1000, tensionOf(st, nation) + amount));
}

function tribeOf(s: GameState, st: Settlement) {
  return s.tribes.find((t) => t.id === st.tribe)!;
}

/** The settlement whose land this tile is, unless a European has bought or taken it. */
export function nativeLandOwner(s: GameState, x: number, y: number): Settlement | undefined {
  const tile = tileAt(s, x, y);
  if (!tile || tile.claim || TERRAIN[tile.t].water) return undefined;
  return Object.values(s.settlements).find((st) => distance(st.x, st.y, x, y) === 1);
}

export function landPrice(s: GameState, nation: NationId, x: number, y: number): number {
  const st = nativeLandOwner(s, x, y);
  if (!st || hasFather(s, nation, 'peterMinuit')) return 0;
  const city = TRIBES[st.tribe].settlement === 'city';
  return Math.round((80 + (city ? 120 : 0) + (st.capital ? 80 : 0)) * (1 + tensionOf(st, nation) / 500));
}

export function buyLand(s: GameState, nation: NationId, x: number, y: number): string {
  const st = nativeLandOwner(s, x, y);
  if (!st) fail('Nobody claims that land.');
  const price = landPrice(s, nation, x, y);
  const p = player(s, nation);
  if (p.gold < price) fail(`The ${TRIBES[st.tribe].name} ask ${price} gold for this land.`);
  p.gold -= price;
  st.gold += price;
  tileAt(s, x, y)!.claim = nation;
  addTension(st, nation, -20);
  track(nation, 'cmd:buyLand');
  return price ? `You buy the land from the ${TRIBES[st.tribe].name} for ${price} gold.` : `The ${TRIBES[st.tribe].name} let you use the land freely.`;
}

export function takeLand(s: GameState, nation: NationId, x: number, y: number): string {
  const st = nativeLandOwner(s, x, y);
  if (!st) fail('Nobody claims that land.');
  tileAt(s, x, y)!.claim = nation;
  addTension(st, nation, 250);
  track(nation, 'cmd:takeLand');
  for (const other of Object.values(s.settlements)) if (other.tribe === st.tribe && other.id !== st.id) addTension(other, nation, 60);
  const text = `You take the land. The ${TRIBES[st.tribe].name} are ${tensionLabel(tensionOf(st, nation))}.`;
  message(s, text, nation, st);
  return text;
}

/** New colonies unsettle the natives nearby. */
export function onColonyFounded(s: GameState, colony: { owner: NationId; x: number; y: number }): void {
  for (const st of Object.values(s.settlements)) {
    const d = distance(st.x, st.y, colony.x, colony.y);
    if (d <= 3) addTension(st, colony.owner, d <= 2 ? 150 : 80);
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
  if (st.mission) fail(`There is already a ${NATIONS[st.mission].adjective} mission here.`);
  delete s.units[u.id];
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
    text = `A mission has been established among the ${TRIBES[st.tribe].name}.`;
  }
  message(s, text, u.owner, st);
  return text;
}

function nearestColony(s: GameState, nation: NationId, x: number, y: number, within: number) {
  let best: Colony | undefined;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== nation) continue;
    const d = distance(c.x, c.y, x, y);
    if (d <= within && (!best || d < distance(best.x, best.y, x, y))) best = c;
  }
  return best;
}

/** A band of braves strikes a colony. */
function raid(s: GameState, st: Settlement, colony: Colony): void {
  const defenders = unitsAt(s, colony.x, colony.y).filter((u) => u.owner === colony.owner && UNIT_TYPES[u.type].kind !== 'ship');
  const defender = chooseDefender(s, defenders) ?? colonyWorkers(s, colony)[0];
  const tribe = TRIBES[st.tribe].name;
  if (!defender) return;
  track(colony.owner, 'natives:raid suffered');
  const off = 1.5 * (TRIBES[st.tribe].settlement === 'city' ? 1.5 : 1);
  const def = defencePower(s, defender);
  if (random(s) >= off / (off + def)) {
    addTension(st, colony.owner, -30);
    message(s, `${colony.name} beats off a raid by the ${tribe}.`, colony.owner, colony);
    return;
  }
  const armed = defender.role === 'soldier' || defender.role === 'dragoon';
  if (armed) {
    defender.role = defender.role === 'dragoon' ? 'soldier' : 'none';
  }
  const goods = GOODS.filter((g) => g !== 'food' && colony.goods[g] >= 20).sort((a, b) => colony.goods[b] - colony.goods[a]);
  const r = random(s);
  if (r < 0.5 && goods.length) {
    const g = goods[0];
    const stolen = Math.ceil(colony.goods[g] / 2);
    colony.goods[g] -= stolen;
    message(s, `The ${tribe} raid ${colony.name} and carry off ${stolen} ${GOOD_DEFS[g].name.toLowerCase()}.`, colony.owner, colony);
  } else if (r < 0.75 && colony.hammers > 0) {
    colony.hammers = 0;
    message(s, `The ${tribe} raid ${colony.name} and burn the work in progress.`, colony.owner, colony);
  } else {
    const kinds = (['stockade', 'docks', 'printingPress', 'warehouse', 'armory'] as BuildingKind[]).filter((k) => colony.buildings[k] > 0);
    if (kinds.length) {
      const k = kinds[Math.floor(random(s) * kinds.length)];
      colony.buildings[k]--;
      message(s, `The ${tribe} raid ${colony.name} and damage the ${BUILDINGS[k].levels[colony.buildings[k]].name}.`, colony.owner, colony);
    } else {
      const gold = Math.min(player(s, colony.owner).gold, 50 + Math.floor(random(s) * 100));
      player(s, colony.owner).gold -= gold;
      message(s, `The ${tribe} raid ${colony.name} and steal ${gold} gold.`, colony.owner, colony);
    }
  }
}

/** Once per round: trade gold recovers, tension drifts, missions convert and angry tribes raid. */
export function processNatives(s: GameState): void {
  const nations = s.players.filter((p) => p.id !== 'crown').map((p) => p.id);
  for (const st of Object.values(s.settlements)) {
    st.gold += st.capital ? 6 : 3;
    const tribe = tribeOf(s, st);
    for (const nation of nations) {
      // Nearby colonies press on native land, more so as they grow.
      const pressure = Object.values(s.colonies)
        .filter((c) => c.owner === nation && distance(c.x, c.y, st.x, st.y) <= 3)
        .reduce((sum, c) => sum + 3 + Math.floor(colonyWorkers(s, c).length / 2), 0);
      const mission = st.mission === nation;
      addTension(st, nation, pressure - 4 - (mission ? 5 : 0));
      const t = tensionOf(st, nation);
      const atWar = tribe.stance[nation] === 'war';
      if (!atWar && t >= 800) {
        tribe.stance[nation] = 'war';
        track(nation, 'natives:tribe went to war');
        message(s, `The ${TRIBES[st.tribe].name} have dug up the hatchet against ${NATIONS[nation].name}!`, nation, st);
      } else if (atWar && t < 250 && !Object.values(s.settlements).some((o) => o.tribe === st.tribe && tensionOf(o, nation) >= 250)) {
        tribe.stance[nation] = 'peace';
        message(s, `The ${TRIBES[st.tribe].name} have made peace with ${NATIONS[nation].name}.`, nation, st);
      }
      if (t > 600 || tribe.stance[nation] === 'war') {
        const target = nearestColony(s, nation, st.x, st.y, 6);
        if (target && random(s) < (tribe.stance[nation] === 'war' ? 0.2 : 0.08)) raid(s, st, target);
      } else if (t < 150 && random(s) < 0.015) {
        const target = nearestColony(s, nation, st.x, st.y, 5);
        if (target) {
          const food = 20 + Math.floor(random(s) * 60);
          target.goods.food += food;
          message(s, `The ${TRIBES[st.tribe].name} bring ${food} food to ${target.name} as a gift.`, nation, target);
        }
      }
    }
    if (st.mission) {
      const chance = 0.03 * (st.missionExpert ? 2 : 1) * (hasFather(s, st.mission, 'jeanDeBrebeuf') ? 2 : 1);
      const colony = nearestColony(s, st.mission, st.x, st.y, 8);
      if (colony && random(s) < chance) {
        const type = hasFather(s, st.mission, 'bartolomeDeLasCasas') ? 'freeColonist' : 'nativeConvert';
        createUnit(s, st.mission, type, { kind: 'map', x: colony.x, y: colony.y });
        track(st.mission, 'natives:convert joined');
        message(s, `A ${TRIBES[st.tribe].name} convert has joined ${colony.name}.`, st.mission, colony);
      }
    }
  }
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
