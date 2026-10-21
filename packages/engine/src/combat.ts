import { fail } from './errors.js';
import { track } from './telemetry.js';
import { hasFather } from './fathers.js';
import { canAttack } from './movement.js';
import { addTension, settlementName } from './natives.js';
import { sonsOfLiberty } from './production.js';
import {
  colonyAt,
  colonyWorkers,
  createUnit,
  distance,
  isCoastal,
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
import { random, randInt } from './rng.js';
import { isFavoured, onWar } from './relations.js';
import { STOCKADE_DEFENCE } from './rules/buildings.js';
import { NATIONS, TRIBES } from './rules/nations.js';
import { ROLES, UNIT_TYPES } from './rules/units.js';
import type { Colony, GameState, Unit } from './types.js';

function isArmed(u: Unit): boolean {
  return u.role === 'soldier' || u.role === 'dragoon';
}

/** Multiplier for trained troops. */
function troopBonus(u: Unit, attacking: boolean): number {
  if (!isArmed(u)) return 1;
  switch (u.type) {
    case 'veteranSoldier':
      return 1.5;
    case 'continentalSoldier':
      return 2;
    case 'kingsRegular':
      return attacking ? 1.5 : 1.75;
    default:
      return 1;
  }
}

export function offencePower(s: GameState, u: Unit): number {
  const def = UNIT_TYPES[u.type];
  let power = def.kind === 'colonist' ? ROLES[u.role].offence : def.offence;
  power *= troopBonus(u, true);
  if (u.type === 'privateer' && hasFather(s, u.owner, 'francisDrake')) power *= 1.5;
  return power * 1.5; // attack bonus
}

export function defencePower(s: GameState, u: Unit): number {
  const def = UNIT_TYPES[u.type];
  let power = def.kind === 'colonist' ? ROLES[u.role].defence : def.defence;
  power *= troopBonus(u, false);
  if (isShip(u)) return power;
  const pos = unitPosition(s, u);
  if (!pos) return power;
  const colony = colonyAt(s, pos.x, pos.y);
  let bonus = 0;
  if (colony) {
    const level = colony.buildings.stockade;
    bonus = level > 0 ? STOCKADE_DEFENCE[level - 1] : 0;
    if (def.kind === 'artillery') bonus += 75;
    // Paul Revere: colonists take up stored muskets.
    if (def.kind === 'colonist' && !isArmed(u) && colony.goods.muskets >= 50 && hasFather(s, colony.owner, 'paulRevere')) power = ROLES.soldier.defence;
    // Rebels fight hardest for colonies that believe in independence.
    if (player(s, colony.owner).independence === 'declared' && sonsOfLiberty(s, colony) >= 50) bonus += 50;
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
  const outside = unitsAt(s, colony.x, colony.y).filter((u) => !isShip(u) && u.owner === colony.owner);
  return chooseDefender(s, outside) ?? colonyWorkers(s, colony)[0];
}

export function declareWar(s: GameState, a: string, b: string): void {
  const pa = s.players.find((p) => p.id === a);
  const pb = s.players.find((p) => p.id === b);
  if (!pa || !pb || pa.stance[b] === 'war') return;
  // A trade agreement ends; Favoured Nation status is cancelled by the nation that declares war.
  onWar(s, pa.id, pb.id);
  pa.stance[b] = 'war';
  pb.stance[a] = 'war';
  pa.warSince[b] = s.turn;
  pb.warSince[a] = s.turn;
  if (b !== 'crown') track(a, 'diplomacy:war started');
  if (a !== 'crown' && b !== 'crown') message(s, `${NATIONS[pa.id].name} has declared war on ${NATIONS[pb.id].name}!`);
}

/** Sends a beaten ship to the nearest drydock, or home to Europe, for repairs. Cargo and passengers are lost. */
function damageShip(s: GameState, ship: Unit): string {
  const name = unitName(ship);
  for (const p of unitsAboard(s, ship)) delete s.units[p.id];
  ship.cargo = {};
  delete ship.dest;
  const pos = unitPosition(s, ship);
  const drydock = Object.values(s.colonies)
    .filter((c) => c.owner === ship.owner && c.buildings.docks >= 2)
    .sort((a, b) => (pos ? distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y) : 0))[0];
  if (drydock) {
    ship.loc = { kind: 'map', x: drydock.x, y: drydock.y };
    ship.repair = 4;
    return `${name} is damaged and limps to ${drydock.name} for repairs`;
  }
  if (player(s, ship.owner).independence === 'none' && ship.owner !== 'crown') {
    ship.loc = { kind: 'europe' };
    ship.repair = 6;
    return `${name} is damaged and returns to Europe for repairs`;
  }
  delete s.units[ship.id];
  return `${name} is sunk`;
}

/** Loser of a fight drops equipment, is captured or is destroyed. Returns a description. */
function demote(s: GameState, u: Unit, winner: Unit): string {
  const name = unitName(u);
  const def = UNIT_TYPES[u.type];
  if (def.kind === 'ship') return damageShip(s, u);
  if (def.kind === 'colonist') {
    // Beaten troops inside a colony re-equip from the warehouse.
    const here = unitPosition(s, u);
    const colony = here && u.loc.kind === 'map' ? colonyAt(s, here.x, here.y) : undefined;
    const store = colony && colony.owner === u.owner ? colony.goods : undefined;
    if (u.role === 'dragoon' && store && store.horses >= 50) {
      store.horses -= 50;
      return `${name} loses its horses but takes fresh ones from the stables`;
    }
    if (u.role === 'soldier' && store && store.muskets >= 50) {
      store.muskets -= 50;
      return `${name} loses its muskets but re-arms from the warehouse`;
    }
    if (u.role === 'dragoon') {
      u.role = 'soldier';
      return `${name} loses its horses`;
    }
    if (u.role === 'soldier') {
      u.role = 'none';
      if (u.type === 'kingsRegular') {
        delete s.units[u.id];
        return `${name} is destroyed`;
      }
      return `${name} is disarmed`;
    }
    // Unarmed colonists and treasure are captured.
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
  if (def.kind === 'treasure' || def.kind === 'wagon') {
    u.owner = winner.owner;
    delete u.dest;
    return `${name} is captured`;
  }
  delete s.units[u.id];
  return `${name} is destroyed`;
}

/** Winning soldiers may become veterans; George Washington makes it certain. */
function promote(s: GameState, u: Unit): string {
  if (!s.units[u.id] || !isArmed(u) || UNIT_TYPES[u.type].skill > 0 || u.type === 'nativeConvert') return '';
  if (!hasFather(s, u.owner, 'georgeWashington') && random(s) >= 0.2) return '';
  u.type = player(s, u.owner).independence === 'declared' ? 'continentalSoldier' : 'veteranSoldier';
  return ` The victors are promoted to ${UNIT_TYPES[u.type].name}s.`;
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
  track(u.owner, 'cmd:attack');
  if (u.type === 'privateer') track(u.owner, 'combat:privateer attack');

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
  if (!player(s, u.owner).human && isFavoured(s, u.owner, defender.owner)) fail('Computer players never attack a Favoured Nation.');
  // Privateers sail under no flag, so their attacks do not start wars.
  if (u.type !== 'privateer') declareWar(s, u.owner, defender.owner);

  const off = offencePower(s, u);
  const def = defencePower(s, defender);
  const won = random(s) < off / (off + def);
  const attackerName = unitName(u);
  let text: string;
  if (won) {
    const unarmed = UNIT_TYPES[defender.type].kind === 'colonist' && !isArmed(defender);
    if (colony && (unarmed || defender.loc.kind === 'colony')) {
      text = captureColony(s, u, colony);
    } else {
      text = `${attackerName} wins: ${demote(s, defender, u)}.`;
    }
    text += promote(s, u);
  } else {
    text = `${attackerName} is defeated: ${demote(s, u, defender)}.`;
    text += promote(s, defender);
  }
  message(s, text, u.owner, pos);
  if (defender.owner !== u.owner) message(s, text, defender.owner, pos);
  return { attackerWon: won, text };
}

function captureColony(s: GameState, attacker: Unit, colony: Colony): string {
  const previous = colony.owner;
  track(attacker.owner, 'combat:colony captured');
  track(previous, 'combat:colony lost');
  colony.owner = attacker.owner;
  colony.build = null;
  if (attacker.owner === 'crown') colony.takenFrom = previous;
  for (const w of colonyWorkers(s, colony)) {
    w.owner = attacker.owner;
    delete w.teach;
  }
  for (const o of unitsAt(s, colony.x, colony.y)) {
    if (o.owner !== previous) continue;
    if (isShip(o)) damageShip(s, o);
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
  for (const other of Object.values(s.settlements)) if (other.tribe === st.tribe) addTension(other, u.owner, other.id === st.id ? 300 : 150);
  let off = offencePower(s, u);
  if (u.owner === 'spain') off *= 1.5;
  const def = 1 * (1 + (st.capital ? 100 : 50) / 100);
  const won = random(s) < off / (off + def);
  let text: string;
  if (won) {
    st.defenders--;
    text = st.defenders <= 0 ? destroySettlement(s, u, settlementId) : `${unitName(u)} defeats a ${TRIBES[st.tribe].name} brave.`;
    text += promote(s, u);
  } else {
    text = `${unitName(u)} is driven back by the ${TRIBES[st.tribe].name}: ${demote(s, u, u)}.`;
  }
  message(s, text, u.owner, st);
  return { attackerWon: won, text };
}

function destroySettlement(s: GameState, u: Unit, settlementId: string): string {
  const st = s.settlements[settlementId];
  const pos = unitPosition(s, u)!;
  const def = TRIBES[st.tribe];
  delete s.settlements[st.id];
  track(u.owner, 'combat:settlement burned');
  const cortes = hasFather(s, u.owner, 'hernanCortes');
  const plunder = st.gold;
  player(s, u.owner).gold += plunder;
  let text = `The ${settlementName(st)} has been burned. ${plunder} gold was plundered.`;
  // Cities and capitals hide real treasure, which has to be carried away.
  if (def.settlement === 'city' || st.capital) {
    const base = def.settlement === 'city' ? 1500 + randInt(s, 3500) : 300 + randInt(s, 500);
    const treasure = createUnit(s, u.owner, 'treasure', { kind: 'map', x: pos.x, y: pos.y });
    treasure.treasure = Math.round(base * (cortes ? 1.5 : 1));
    track(u.owner, 'treasure:found');
    text += ` A treasure worth ${treasure.treasure} gold has been found.`;
  }
  if (hasFather(s, u.owner, 'juanDeSepulveda')) {
    const converts = 1 + randInt(s, 2);
    for (let i = 0; i < converts; i++) createUnit(s, u.owner, 'nativeConvert', { kind: 'map', x: pos.x, y: pos.y });
    text += ` ${converts} survivor${converts > 1 ? 's' : ''} join you as converts.`;
  }
  return text;
}

/** The Crown carries a treasure home from a coastal colony, for a fee unless Cortés is in Congress. */
export function cashTreasure(s: GameState, unitId: string): string {
  const u = s.units[unitId];
  if (!u || u.type !== 'treasure' || u.loc.kind !== 'map') fail('That is not a treasure train on the map.');
  const colony = colonyAt(s, u.loc.x, u.loc.y);
  if (!colony || colony.owner !== u.owner) fail('Bring the treasure into one of your colonies first.');
  const p = player(s, u.owner);
  if (p.independence !== 'none') fail('The Crown will not carry treasure for rebels; use your own galleon.');
  if (!isCoastal(s, colony.x, colony.y)) fail('The treasure must reach a coastal colony.');
  const gross = u.treasure ?? 0;
  const fee = hasFather(s, u.owner, 'hernanCortes') ? 0 : Math.round(gross / 2);
  const afterFee = gross - fee;
  const net = afterFee - Math.floor((afterFee * p.tax) / 100);
  p.gold += net;
  delete s.units[u.id];
  track(u.owner, 'cmd:cashTreasure');
  const text = `The Crown carries the treasure to Europe${fee ? ` for half its value` : ''}: ${net} gold after tax.`;
  message(s, text, u.owner, colony);
  return text;
}
