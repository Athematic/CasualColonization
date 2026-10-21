import { fail } from './errors.js';
import { canAttack } from './movement.js';
import { settlementName } from './natives.js';
import {
  colonyAt,
  colonyWorkers,
  distance,
  isShip,
  message,
  player,
  tileAt,
  tileDefence,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAt,
} from './queries.js';
import { random } from './rng.js';
import { STOCKADE_DEFENCE } from './rules/buildings.js';
import { NATIONS, TRIBES } from './rules/nations.js';
import { ROLES, UNIT_TYPES } from './rules/units.js';
import type { Colony, GameState, Unit } from './types.js';

export function offencePower(u: Unit): number {
  const def = UNIT_TYPES[u.type];
  let power = def.kind === 'colonist' ? ROLES[u.role].offence : def.offence;
  if (u.type === 'veteranSoldier' && (u.role === 'soldier' || u.role === 'dragoon')) power *= 1.5;
  return power * 1.5; // attack bonus
}

export function defencePower(s: GameState, u: Unit): number {
  const def = UNIT_TYPES[u.type];
  let power = def.kind === 'colonist' ? ROLES[u.role].defence : def.defence;
  if (u.type === 'veteranSoldier' && (u.role === 'soldier' || u.role === 'dragoon')) power *= 1.5;
  if (isShip(u)) return power;
  const pos = unitPosition(s, u);
  if (!pos) return power;
  const colony = colonyAt(s, pos.x, pos.y);
  let bonus = 0;
  if (colony) {
    const level = colony.buildings.stockade;
    bonus = level > 0 ? STOCKADE_DEFENCE[level - 1] : 0;
    if (def.kind === 'artillery') bonus += 75;
  } else {
    bonus = tileDefence(tileAt(s, pos.x, pos.y)!);
  }
  if (u.state === 'fortified') bonus += 50;
  return power * (1 + bonus / 100);
}

/** The unit that defends a tile: the strongest one. */
export function chooseDefender(s: GameState, units: Unit[]): Unit | undefined {
  return [...units].sort((a, b) => defencePower(s, b) - defencePower(s, a))[0];
}

function colonyDefender(s: GameState, colony: Colony): Unit | undefined {
  const outside = unitsAt(s, colony.x, colony.y).filter((u) => !isShip(u));
  return chooseDefender(s, outside) ?? colonyWorkers(s, colony)[0];
}

function declareWar(s: GameState, attacker: Unit, defenderOwner: string): void {
  const a = player(s, attacker.owner);
  if (a.stance[defenderOwner] !== 'war') {
    a.stance[defenderOwner] = 'war';
    const d = s.players.find((p) => p.id === defenderOwner);
    if (d) d.stance[attacker.owner] = 'war';
    if (d) message(s, `${NATIONS[a.id].name} has declared war on ${NATIONS[d.id].name}!`);
  }
}

/** Loser of a fight drops equipment or is destroyed. Returns a description. */
function demote(s: GameState, u: Unit, winner: Unit): string {
  const name = unitName(u);
  const def = UNIT_TYPES[u.type];
  if (def.kind === 'colonist') {
    if (u.role === 'dragoon') {
      u.role = 'soldier';
      return `${name} loses its horses`;
    }
    if (u.role === 'soldier') {
      u.role = 'none';
      return `${name} is disarmed`;
    }
    // Unarmed colonists are captured.
    u.owner = winner.owner;
    u.role = 'none';
    u.tools = 0;
    u.moves = 0;
    delete u.dest;
    delete u.work;
    const pos = unitPosition(s, winner);
    if (pos && u.loc.kind === 'map') u.loc = { kind: 'map', x: pos.x, y: pos.y };
    return `${name} is captured`;
  }
  for (const p of unitsAboard(s, u)) delete s.units[p.id];
  delete s.units[u.id];
  return `${name} is destroyed`;
}

export interface CombatResult {
  attackerWon: boolean;
  text: string;
}

export function attack(s: GameState, unitId: string, target: { unitId?: string; colonyId?: string; settlementId?: string }): CombatResult {
  const u = s.units[unitId];
  if (!u || !canAttack(u)) fail('That unit cannot attack.');
  if (u.moves <= 0) fail(`${unitName(u)} has no moves left.`);
  const pos = unitPosition(s, u);
  if (!pos) fail('The unit is not on the map.');
  u.moves = 0;
  u.state = 'active';
  delete u.dest;

  if (target.settlementId) return attackSettlement(s, u, target.settlementId);

  let defender: Unit | undefined;
  let colony: Colony | undefined;
  if (target.colonyId) {
    colony = s.colonies[target.colonyId];
    if (!colony || distance(colony.x, colony.y, pos.x, pos.y) !== 1) fail('The colony is not next to the unit.');
    defender = colonyDefender(s, colony);
  } else if (target.unitId) {
    const t = s.units[target.unitId];
    const tp = t && unitPosition(s, t);
    if (!tp || distance(tp.x, tp.y, pos.x, pos.y) !== 1) fail('The target is not next to the unit.');
    defender = chooseDefender(s, unitsAt(s, tp.x, tp.y).filter((o) => o.owner === t.owner));
  }
  if (!defender) fail('There is nothing to attack.');
  declareWar(s, u, defender.owner);

  const off = offencePower(u);
  const def = defencePower(s, defender);
  const won = random(s) < off / (off + def);
  const attackerName = unitName(u);
  let text: string;
  if (won) {
    const unarmed = UNIT_TYPES[defender.type].kind === 'colonist' && ROLES[defender.role].offence === 0;
    if (colony && (unarmed || defender.loc.kind === 'colony')) {
      text = captureColony(s, u, colony);
    } else {
      text = `${attackerName} wins: ${demote(s, defender, u)}.`;
    }
  } else {
    text = `${attackerName} is defeated: ${demote(s, u, defender)}.`;
  }
  message(s, text, u.owner, pos);
  if (defender.owner !== u.owner) message(s, text, defender.owner, pos);
  return { attackerWon: won, text };
}

function captureColony(s: GameState, attacker: Unit, colony: Colony): string {
  const previous = colony.owner;
  colony.owner = attacker.owner;
  for (const w of colonyWorkers(s, colony)) w.owner = attacker.owner;
  for (const o of unitsAt(s, colony.x, colony.y)) {
    if (o.owner !== previous) continue;
    if (isShip(o)) demote(s, o, attacker);
    else o.owner = attacker.owner;
  }
  if (attacker.loc.kind === 'map') attacker.loc = { kind: 'map', x: colony.x, y: colony.y };
  return `${NATIONS[attacker.owner].name} captures ${colony.name}!`;
}

function attackSettlement(s: GameState, u: Unit, settlementId: string): CombatResult {
  const st = s.settlements[settlementId];
  const pos = unitPosition(s, u)!;
  if (!st || distance(st.x, st.y, pos.x, pos.y) !== 1) fail('The settlement is not next to the unit.');
  const tribe = s.tribes.find((t) => t.id === st.tribe)!;
  if (tribe.stance[u.owner] !== 'war') {
    tribe.stance[u.owner] = 'war';
    message(s, `The ${TRIBES[st.tribe].name} now consider ${NATIONS[u.owner].name} an enemy.`, u.owner, st);
  }
  let off = offencePower(u);
  if (u.owner === 'spain') off *= 1.5;
  const def = 1 * (1 + (st.capital ? 100 : 50) / 100);
  const won = random(s) < off / (off + def);
  let text: string;
  if (won) {
    st.defenders--;
    if (st.defenders <= 0) {
      const plunder = st.gold;
      player(s, u.owner).gold += plunder;
      delete s.settlements[st.id];
      text = `The ${settlementName(st)} has been burned. ${plunder} gold was plundered.`;
    } else {
      text = `${unitName(u)} defeats a ${TRIBES[st.tribe].name} brave.`;
    }
  } else {
    text = `${unitName(u)} is driven back by the ${TRIBES[st.tribe].name}: ${demote(s, u, u)}.`;
  }
  message(s, text, u.owner, st);
  return { attackerWon: won, text };
}
