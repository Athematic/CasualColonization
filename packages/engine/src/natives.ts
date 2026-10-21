import { fail } from './errors.js';
import { describeMove } from './movement.js';
import { distance, message, player, reveal, unitName, unitPosition } from './queries.js';
import { random, randInt } from './rng.js';
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { TRIBES } from './rules/nations.js';
import { UNIT_TYPES } from './rules/units.js';
import type { GameState, Settlement, Unit } from './types.js';

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
  const text = `Your colonist has lived among the ${TRIBES[st.tribe].name} and become a ${UNIT_TYPES[skill].name}.`;
  message(s, text, u.owner, st);
  return text;
}

export function nativeOffer(s: GameState, st: Settlement, good: GoodId, amount: number): number {
  const tribe = TRIBES[st.tribe];
  const wanted = tribe.wants.indexOf(good);
  const factor = wanted === 0 ? 2 : wanted > 0 ? 1.5 : 1;
  const offer = Math.round(amount * GOOD_DEFS[good].nativeValue * factor * (st.capital ? 1.3 : 1));
  void s;
  return Math.min(offer, st.gold);
}

/** Sells one kind of cargo from a wagon train or ship to a native settlement. */
export function tradeWithSettlement(s: GameState, unitId: string, settlementId: string, good?: GoodId): string {
  const u = s.units[unitId];
  const st = adjacentSettlement(s, u, settlementId);
  const cargo = u.cargo ?? {};
  const chosen = good ?? GOODS.filter((g) => (cargo[g] ?? 0) > 0).sort((a, b) => nativeOffer(s, st, b, cargo[b]!) - nativeOffer(s, st, a, cargo[a]!))[0];
  if (!chosen || !(cargo[chosen] ?? 0)) fail('There is nothing to trade.');
  const amount = Math.min(100, cargo[chosen]!);
  const gold = nativeOffer(s, st, chosen, amount);
  if (gold <= 0) fail('The natives have no gold left to trade.');
  cargo[chosen] = cargo[chosen]! - amount;
  st.gold -= gold;
  player(s, u.owner).gold += gold;
  u.moves = 0;
  const text = `The ${settlementName(st)} buys ${amount} ${GOOD_DEFS[chosen].name.toLowerCase()} for ${gold} gold.`;
  message(s, text, u.owner, st);
  return text;
}

/** Native settlements slowly regain gold for trade. */
export function processNatives(s: GameState): void {
  for (const st of Object.values(s.settlements)) {
    st.gold += st.capital ? 6 : 3;
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
