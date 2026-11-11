import { anyPlayingPeople, onPairWar, pactPlayersOf } from './peoplediplomacy.js';
import { nationsPresent } from './presence.js';
import { gridOf } from './grid.js';
import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { hasModifier, modifiers, mulOf } from './scenarios/modifiers.js';
import { mechanicsOf, nationOf, nationTitle, nativeRulesOf, settlementKindOf, term, Term } from './scenarios/index.js';
import { canAttack } from './movement.js';
import { braveDefence, braveName, bravesOf, killBrave } from './braves.js';
import { addTension, settlementName } from './natives.js';
import { breakFaith, callToDefence, defendedByFriend, defencePartner } from './peopletreaties.js';
import { notePeopleWarEnded, noteSettlementBurned } from './prosperity.js';
import { sonsOfLiberty } from './production.js';
import {
  colonyAt,
  colonyWorkers,
  createUnit,
  isCoastal,
  isShip,
  message,
  player,
  tileAt,
  tileDefence,
  maxMoves,
  neighbours,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAt,
} from './queries.js';
import { random, randInt } from './rng.js';
import { riverLinked } from './rivers.js';
import { isFavoured, onWar } from './relations.js';
import { pactAllies, sendOut, warOnFriend } from './alliances.js';
import { kindOfId, systemsOfId } from './playerkind.js';
import { BUILDINGS, STOCKADE_DEFENCE } from './rules/buildings.js';
import { AMBUSH_BONUS, BOMBARD_CHANCE, CAPTURE_CHANCE, REPAIR_COST, RIVER_DEFENCE } from './rules/combat.js';
import { TRIBES, type PlayerId, type TribeId } from './rules/nations.js';
import { TERRAIN } from './rules/terrain.js';
import { ROLES, UNIT_TYPES } from './rules/units.js';
import type { Colony, GameState, Unit } from './types.js';
import { setUnitLoc, setUnitOwner, removeUnit, colonyList } from './unitindex.js';

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
    // A people's warrior armed with muskets fights as a veteran does (native-nations.md T6).
    case 'warrior':
      return 1.5;
    case 'kingsRegular':
      return attacking ? 1.5 : 1.75;
    default:
      return 1;
  }
}

/** Cover bonus (percent) of a unit that attacks out of forest, hills or mountains against a unit in the open. */
export function ambushBonus(s: GameState, attacker: { x: number; y: number }, defender: Unit): number {
  const from = tileAt(s, attacker.x, attacker.y);
  if (!from || colonyAt(s, attacker.x, attacker.y)) return 0;
  const cover = from.f ? AMBUSH_BONUS.forest : from.t === 'mountains' ? AMBUSH_BONUS.mountains : from.t === 'hills' ? AMBUSH_BONUS.hills : 0;
  if (!cover) return 0;
  const dp = unitPosition(s, defender);
  if (!dp || isShip(defender) || colonyAt(s, dp.x, dp.y) || defender.state === 'fortified') return 0;
  const to = tileAt(s, dp.x, dp.y);
  return to && tileDefence(to) === 0 ? cover : 0;
}

export function offencePower(s: GameState, u: Unit, target?: Unit): number {
  const def = UNIT_TYPES[u.type];
  // A colonist fights by its role; a people's warrior has its bow (`def.offence`) without one.
  let power = def.kind === 'colonist' ? Math.max(ROLES[u.role].offence, def.offence) : def.offence;
  power *= troopBonus(u, true);
  for (const m of modifiers(s, u.owner, 'unitOffence')) if (m.unit === u.type) power *= m.mul;
  const pos = target && !isShip(u) ? unitPosition(s, u) : undefined;
  const ambush = target && pos ? ambushBonus(s, pos, target) : 0;
  return power * 1.5 * (1 + ambush / 100); // attack bonus, and the bonus for attacking out of cover
}

/**
 * Whether an attack from `from` crosses a river to reach a unit in the open on tile `to`: the
 * defender stands on a river tile and the attacker is on land that the river does not link to it.
 */
export function riverCrossing(s: GameState, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const target = tileAt(s, to.x, to.y);
  const source = tileAt(s, from.x, from.y);
  if (!target?.rv || !source || TERRAIN[source.t].water || colonyAt(s, to.x, to.y)) return false;
  return !riverLinked(s.map, from.x, from.y, to.x, to.y);
}

/** `attackFrom`: where the attack comes from, for the river defence bonus (a unit in the open defending against a crossing attacker). */
export function defencePower(s: GameState, u: Unit, attackFrom?: { x: number; y: number }): number {
  const def = UNIT_TYPES[u.type];
  let power = def.kind === 'colonist' ? Math.max(ROLES[u.role].defence, def.defence) : def.defence;
  power *= troopBonus(u, false);
  if (isShip(u)) return power;
  const pos = unitPosition(s, u);
  if (!pos) return power;
  const colony = colonyAt(s, pos.x, pos.y);
  let bonus = 0;
  if (colony) {
    const level = colony.buildings.stockade;
    bonus = level > 0 ? STOCKADE_DEFENCE[level - 1] : 0;
    // A people's palisade (native-nations.md T7).
    const palisade = colony.buildings.palisade;
    if (palisade) bonus = Math.max(bonus, BUILDINGS.palisade.defence![palisade - 1]);
    if (def.kind === 'artillery') bonus += 75;
    // Paul Revere: colonists take up stored muskets.
    if (def.kind === 'colonist' && !isArmed(u) && modifiers(s, colony.owner, 'armedFromStock').some((m) => colony.goods.muskets >= m.muskets)) power = ROLES.soldier.defence;
    // Rebels fight hardest for colonies that believe in independence.
    if (player(s, colony.owner).independence === 'declared' && sonsOfLiberty(s, colony) >= 50) bonus += 50;
  } else {
    bonus = tileDefence(tileAt(s, pos.x, pos.y)!);
    if (attackFrom && riverCrossing(s, attackFrom, pos)) bonus += RIVER_DEFENCE;
  }
  if (u.state === 'fortified') bonus += 50;
  return power * (1 + bonus / 100);
}

/** The unit that defends a tile: the strongest one. */
export function chooseDefender(s: GameState, units: Unit[], attackFrom?: { x: number; y: number }): Unit | undefined {
  return [...units].sort((a, b) => defencePower(s, b, attackFrom) - defencePower(s, a, attackFrom))[0];
}

/**
 * The unit that defends a colony against `attacker`: the strongest land unit on its tile, the
 * owner's or, under a defensive pact, an ally's garrison (alliances.ts); otherwise a colonist.
 */
function colonyDefender(s: GameState, colony: Colony, attacker: PlayerId): Unit | undefined {
  const allies = s.treaties ? pactAllies(s, colony.owner, attacker) : [];
  const outside = unitsAt(s, colony.x, colony.y).filter((u) => !isShip(u) && (u.owner === colony.owner || allies.includes(u.owner)));
  return chooseDefender(s, outside) ?? colonyWorkers(s, colony)[0];
}

export function declareWar(s: GameState, a: string, b: string): void {
  const pa = s.players.find((p) => p.id === a);
  const pb = s.players.find((p) => p.id === b);
  if (!pa || !pb || pa.stance[b] === 'war') return;
  // A trade agreement ends; Favoured Nation status is cancelled by the nation that declares war,
  // and war on an ally is leaving the alliance (alliances.ts).
  onWar(s, pa.id, pb.id);
  pa.stance[b] = 'war';
  pb.stance[a] = 'war';
  pa.warSince[b] = s.turn;
  pb.warSince[a] = s.turn;
  if (b !== 'crown') track(a, 'diplomacy:war started');
  if (a !== 'crown' && b !== 'crown') message(s, `${nationOf(s, pa.id).name} has declared war on ${nationOf(s, pb.id).name}!`);
  if (a !== 'crown' && b !== 'crown') noteHistory(s, 'war', [pa.id, pb.id], `${nationTitle(s, pa.id)} declares war on ${nationOf(s, pb.id).name}.`);
  // The defensive pact: war on a member of an alliance is war with all its members.
  if (s.treaties) {
    for (const ally of pactAllies(s, pb.id, pa.id)) {
      if (pa.stance[ally] === 'war') continue;
      track(ally, 'diplomacy:ally defended');
      message(s, `${nationOf(s, ally).name} stands by its ally ${nationOf(s, pb.id).name}.`);
      declareWar(s, pa.id, ally);
    }
    // Treaties with a playing people end with the war, and its defence partners stand by it (peoplediplomacy.ts, Beta 3 step 4).
    if (anyPlayingPeople(s)) for (const id of onPairWar(s, pa.id, pb.id)) if (pa.stance[id] !== 'war') declareWar(s, pa.id, id);
  }
}

/** Sends a beaten ship to the nearest drydock, or home to Europe, for repairs. Cargo and passengers are lost. */
function damageShip(s: GameState, ship: Unit): string {
  const grid = gridOf(s);
  const name = unitName(ship);
  for (const p of unitsAboard(s, ship)) removeUnit(s, p.id);
  ship.cargo = {};
  delete ship.dest;
  const pos = unitPosition(s, ship);
  const drydock = colonyList(s)
    .filter((c) => c.owner === ship.owner && c.buildings.docks >= 2)
    .sort((a, b) => (pos ? grid.distance(a.x, a.y, pos.x, pos.y) - grid.distance(b.x, b.y, pos.x, pos.y) : 0))[0];
  if (drydock) {
    setUnitLoc(s, ship, { kind: 'map', x: drydock.x, y: drydock.y });
    ship.repair = 4;
    return `${name} is damaged and limps to ${drydock.name} for repairs`;
  }
  if (player(s, ship.owner).independence === 'none' && ship.owner !== 'crown' && systemsOfId(ship.owner).homePort) {
    setUnitLoc(s, ship, { kind: 'europe' });
    ship.repair = 6;
    return `${name} is damaged and returns to ${term(s, 'homeland')} for repairs`;
  }
  removeUnit(s, ship.id);
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
        removeUnit(s, u.id);
        return `${name} is destroyed`;
      }
      return `${name} is disarmed`;
    }
    // No captives where a people plays (native-nations.md, out of scope for Beta 3): a beaten
    // unarmed person of a people, or beaten by one, is lost.
    if (systemsOfId(u.owner).ai === 'people' || systemsOfId(winner.owner).ai === 'people') {
      removeUnit(s, u.id);
      return `${name} is lost`;
    }
    // Unarmed colonists and treasure are captured.
    setUnitOwner(s, u, winner.owner);
    u.role = 'none';
    u.tools = 0;
    u.moves = 0;
    delete u.dest;
    delete u.roadTo;
    delete u.work;
    const pos = unitPosition(s, winner);
    if (pos && u.loc.kind === 'map') setUnitLoc(s, u, { kind: 'map', x: pos.x, y: pos.y });
    return `${name} is captured`;
  }
  if (def.kind === 'treasure' || def.kind === 'wagon') {
    setUnitOwner(s, u, winner.owner);
    delete u.dest;
    return `${name} is captured`;
  }
  if (def.kind === 'artillery' && u.type === 'artillery') {
    u.type = 'damagedArtillery';
    u.state = 'active';
    return `${name} is damaged`;
  }
  removeUnit(s, u.id);
  return `${name} is destroyed`;
}

/**
 * The winner of a fight in the open takes the loser's dropped horses or muskets, with a seeded
 * chance: a soldier gets the horses and becomes a dragoon, an unarmed colonist gets the muskets.
 * `before` is the loser's role before the fight; nothing happens when the loser re-armed or was
 * in a colony. Returns text for the report.
 */
function takeEquipment(s: GameState, winner: Unit, loser: Unit, before: Unit['role'], at: { x: number; y: number } | null): string {
  if (!at || colonyAt(s, at.x, at.y) || !s.units[loser.id] || UNIT_TYPES[winner.type].kind !== 'colonist') return '';
  const horses = before === 'dragoon' && loser.role === 'soldier';
  const muskets = before === 'soldier' && loser.role === 'none';
  if (horses && winner.role === 'soldier' && random(s) < CAPTURE_CHANCE) {
    winner.role = 'dragoon';
    winner.moves = Math.min(winner.moves, maxMoves(winner, s));
    return ` ${unitName(winner)} takes the horses.`;
  }
  if (muskets && winner.role === 'none' && random(s) < CAPTURE_CHANCE) {
    winner.role = 'soldier';
    return ` ${unitName(winner)} takes the muskets.`;
  }
  return '';
}

/** A damaged artillery piece in a colony with an armory (or in Europe) is mended for hammers and tools (or gold). */
export function repairArtillery(s: GameState, nation: PlayerId, unitId: string): string {
  const u = s.units[unitId];
  if (!u || u.owner !== nation) fail('That is not your unit.');
  if (u.type !== 'damagedArtillery') fail('Only damaged artillery needs repairs.');
  const p = player(s, nation);
  if (u.loc.kind === 'europe') {
    if (p.gold < REPAIR_COST.gold) fail(`Repairs cost ${REPAIR_COST.gold} gold.`);
    p.gold -= REPAIR_COST.gold;
  } else if (u.loc.kind === 'map') {
    const colony = colonyAt(s, u.loc.x, u.loc.y);
    if (!colony || colony.owner !== nation) fail('Bring the artillery into one of your colonies.');
    if (colony.buildings.armory === 0) fail(`${colony.name} needs an armory to repair artillery.`);
    if (colony.hammers < REPAIR_COST.hammers || colony.goods.tools < REPAIR_COST.tools) fail(`Repairs need ${REPAIR_COST.hammers} hammers (built up) and ${REPAIR_COST.tools} tools in the warehouse.`);
    colony.hammers -= REPAIR_COST.hammers;
    colony.goods.tools -= REPAIR_COST.tools;
  } else fail(`The artillery must be in a colony or in ${term(s, 'homeland')}.`);
  u.type = 'artillery';
  u.moves = 0;
  return `${unitName(u)} has been repaired.`;
}

/**
 * At the start of a nation's turn, its coastal forts and fortresses fire on adjacent enemy ships
 * (nations at war with the owner; one seeded roll per ship). A hit damages the ship as in combat.
 */
export function bombardShips(s: GameState, nation: PlayerId): void {
  const me = player(s, nation);
  for (const colony of colonyList(s)) {
    const level = colony.buildings.stockade;
    if (colony.owner !== nation || level < 2 || !isCoastal(s, colony.x, colony.y)) continue;
    for (const n of neighbours(s, colony.x, colony.y)) {
      for (const ship of unitsAt(s, n.x, n.y)) {
        if (!isShip(ship) || ship.owner === nation || ship.loc.kind !== 'map' || me.stance[ship.owner] !== 'war') continue;
        if (random(s) >= BOMBARD_CHANCE[level - 1]) continue;
        const text = `${colony.name}'s ${level > 2 ? 'fortress' : 'fort'} bombards ${unitName(ship)}: ${damageShip(s, ship)}.`;
        message(s, text, nation, colony);
        message(s, text, ship.owner, n);
      }
    }
  }
}

/** Winning soldiers may become veterans; George Washington makes it certain. */
export function promote(s: GameState, u: Unit): string {
  // A people's townsperson who wins a fight may become a warrior, armed or not (native-nations.md T6).
  const people = kindOfId(u.owner) === 'people';
  if (people) {
    // The War Leaders (a people's council) make it certain.
    if (!s.units[u.id] || u.type !== 'townsperson' || (!hasModifier(s, u.owner, 'alwaysPromote') && random(s) >= 0.2)) return '';
    u.type = 'warrior';
    return ` The victors become ${UNIT_TYPES.warrior.name.toLowerCase()}s.`;
  }
  if (!s.units[u.id] || !isArmed(u) || UNIT_TYPES[u.type].skill > 0 || u.type === 'nativeConvert') return '';
  if (!hasModifier(s, u.owner, 'alwaysPromote') && random(s) >= 0.2) return '';
  u.type = player(s, u.owner).independence === 'declared' ? 'continentalSoldier' : 'veteranSoldier';
  return ` The victors are promoted to ${UNIT_TYPES[u.type].name}s.`;
}

export interface CombatResult {
  attackerWon: boolean;
  text: string;
}

export function attack(s: GameState, unitId: string, target: { unitId?: string; colonyId?: string; settlementId?: string; braveId?: string }): CombatResult {
  const grid = gridOf(s);
  const u = s.units[unitId];
  if (!u || !canAttack(u)) fail('That unit cannot attack.');
  if (u.moves <= 0) fail(`${unitName(u)} has no moves left.`);
  const pos = unitPosition(s, u);
  if (!pos) fail('The unit is not on the map.');
  u.moves = 0;
  u.state = 'active';
  delete u.dest;
  delete u.roadTo;
  track(u.owner, 'cmd:attack');
  if (u.type === 'privateer') track(u.owner, 'combat:privateer attack');

  if (target.settlementId) return attackSettlement(s, u, target.settlementId);
  if (target.braveId) return attackBrave(s, u, target.braveId);

  let defender: Unit | undefined;
  let colony: Colony | undefined;
  if (target.colonyId) {
    colony = s.colonies[target.colonyId];
    if (!colony || grid.distance(colony.x, colony.y, pos.x, pos.y) !== 1) fail('The colony is not next to the unit.');
    defender = colonyDefender(s, colony, u.owner);
  } else if (target.unitId) {
    const t = s.units[target.unitId];
    const tp = t && unitPosition(s, t);
    if (!tp || grid.distance(tp.x, tp.y, pos.x, pos.y) !== 1) fail('The target is not next to the unit.');
    defender = chooseDefender(s, unitsAt(s, tp.x, tp.y).filter((o) => o.owner === t.owner), pos);
  }
  if (!defender) fail('There is nothing to attack.');
  // A people's town attacked has no birth this year (native-nations.md T10).
  if (colony && kindOfId(colony.owner) === 'people') colony.foughtAt = s.turn;
  // The nation attacked: a colony's owner (its allies' garrison defends it), else the defender's.
  const enemy = colony ? colony.owner : defender.owner;
  if (s.players.length > nationsPresent(s) && (!systemsOfId(enemy).war || !systemsOfId(u.owner).war)) fail('Chartered companies are neutral: they are not attacked and do not attack.');
  if (!player(s, u.owner).human && (isFavoured(s, u.owner, enemy) || (s.treaties && warOnFriend(s, u.owner, enemy)))) fail('Computer players never attack a Favoured Nation or an ally.');
  // Privateers sail under no flag, so their attacks do not start wars.
  if (u.type !== 'privateer') declareWar(s, u.owner, enemy);
  // A people with a defence pact with the colony's owner comes to its defence (native-partners.md N7).
  if (colony && s.treaties) callToDefence(s, colony, u);

  const off = offencePower(s, u, defender);
  const def = defencePower(s, defender, target.colonyId ? undefined : pos);
  const won = random(s) < off / (off + def);
  const attackerName = unitName(u);
  const defenderAt = unitPosition(s, defender);
  const defenderRole = defender.role;
  const attackerRole = u.role;
  let text: string;
  if (won) {
    const unarmed = UNIT_TYPES[defender.type].kind === 'colonist' && !isArmed(defender) && UNIT_TYPES[defender.type].offence === 0;
    if (colony && (unarmed || defender.loc.kind === 'colony')) {
      text = captureColony(s, u, colony);
    } else {
      text = `${attackerName} wins: ${demote(s, defender, u)}.`;
      text += takeEquipment(s, u, defender, defenderRole, defenderAt ?? null);
    }
    text += promote(s, u);
  } else {
    text = `${attackerName} is defeated: ${demote(s, u, defender)}.`;
    text += takeEquipment(s, defender, u, attackerRole, pos);
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
    setUnitOwner(s, w, attacker.owner);
    delete w.teach;
  }
  for (const o of unitsAt(s, colony.x, colony.y)) {
    if (o.owner === attacker.owner) continue;
    // Allies' units in the colony are taken with it when at war with the attacker, else sent out.
    if (o.owner !== previous && player(s, o.owner).stance[attacker.owner] !== 'war') {
      sendOut(s, o, colony);
      continue;
    }
    if (isShip(o)) damageShip(s, o);
    else setUnitOwner(s, o, attacker.owner);
  }
  if (attacker.loc.kind === 'map') setUnitLoc(s, attacker, { kind: 'map', x: colony.x, y: colony.y });
  const by = attacker.owner === 'crown' ? `${Term(s, 'royalTroops')}` : nationTitle(s, attacker.owner);
  noteHistory(s, 'captured', [attacker.owner, previous], `${by} capture${attacker.owner === 'crown' ? '' : 's'} ${colony.name} from ${nationOf(s, previous).name}.`, { secret: true, at: colony });
  return `${nationOf(s, attacker.owner).name} captures ${colony.name}!`;
}

/**
 * Attacking a tribe makes it an enemy, ends any submission to the attacker, and breaks faith with
 * it (its treaties end). An attack on a people with a mutual defence pact is war with its partner
 * (native-partners.md N7); a partner allied with the attacker sees it leave the alliance (N9).
 */
function hostile(s: GameState, tribeId: TribeId, nation: PlayerId, at: { x: number; y: number }, cause: string): void {
  const tribe = s.tribes.find((t) => t.id === tribeId)!;
  // Attacking a partner breaks faith with it (native-partners.md N8).
  breakFaith(s, nation, tribeId, 'attack');
  const partner = s.treaties ? defencePartner(s, tribeId) : undefined;
  if (partner && partner !== nation && nation !== 'crown' && player(s, nation).stance[partner] !== 'war') {
    track(partner, 'natives:pact war');
    message(s, `${nationOf(s, partner).name} stands by its pact with the ${TRIBES[tribeId].name}: the attack on them is war.`);
    noteHistory(s, 'war', [nation, partner], `${nationOf(s, partner).name} goes to war with ${nationOf(s, nation).name} to defend the ${TRIBES[tribeId].name}, its partners in a mutual defence pact.`);
    declareWar(s, nation, partner);
  }
  // A playing people bound by a pact to the people attacked stands by it (Beta 3 step 4).
  if (s.treaties && anyPlayingPeople(s)) {
    for (const id of pactPlayersOf(s, tribeId, nation)) {
      message(s, `${nationOf(s, id).name} stand by their pact with the ${TRIBES[tribeId].name}: the attack on them is war.`);
      declareWar(s, nation, id);
    }
  }
  if (tribe.submitted?.includes(nation)) tribe.submitted = tribe.submitted.filter((n) => n !== nation);
  if (tribe.stance[nation] !== 'war') {
    tribe.stance[nation] = 'war';
    message(s, `The ${TRIBES[tribeId].name} now consider ${nationOf(s, nation).name} an enemy.`, nation, at);
    noteHistory(s, 'tribe', [nation], `War with the ${TRIBES[tribeId].name}, after ${cause}.`, { secret: true, at });
  }
}

/** Computer players never attack a people whose defence partner is their Favoured Nation or ally (N9, as for nations). */
function noFriendsPeople(s: GameState, nation: PlayerId, people: TribeId): void {
  if (s.treaties && !player(s, nation).human && defendedByFriend(s, nation, people)) fail('Computer players never attack a people defended by a Favoured Nation or an ally.');
}

/** A European unit attacks a brave in the open. The brave defends with its own values and the terrain. */
function attackBrave(s: GameState, u: Unit, braveId: string): CombatResult {
  const grid = gridOf(s);
  const b = bravesOf(s)[braveId];
  const pos = unitPosition(s, u)!;
  if (!b || grid.distance(b.x, b.y, pos.x, pos.y) !== 1) fail('The brave is not next to the unit.');
  if (isShip(u)) fail('Ships cannot attack braves on land.');
  noFriendsPeople(s, u.owner, b.tribe);
  const atWar = s.tribes.find((t) => t.id === b.tribe)?.stance[u.owner] === 'war';
  hostile(s, b.tribe, u.owner, b, `an attack on one of their braves`);
  const off = offencePower(s, u);
  const def = braveDefence(s, b);
  const braveGear = { armed: !!b.armed, mounted: !!b.mounted };
  const won = random(s) < off / (off + def);
  const name = braveName(b);
  let text: string;
  if (won) {
    killBrave(s, b, u.owner, atWar);
    track(u.owner, 'combat:brave killed');
    text = `${unitName(u)} kills the ${name}.`;
    // A brave's horses and muskets are taken like a European's.
    if (braveGear.mounted && u.role === 'soldier' && !colonyAt(s, pos.x, pos.y) && random(s) < CAPTURE_CHANCE) {
      u.role = 'dragoon';
      text += ` ${unitName(u)} takes the horses.`;
    } else if (braveGear.armed && u.role === 'none' && UNIT_TYPES[u.type].kind === 'colonist' && random(s) < CAPTURE_CHANCE) {
      u.role = 'soldier';
      text += ` ${unitName(u)} takes the muskets.`;
    }
    text += promote(s, u);
  } else {
    const role = u.role;
    text = `${unitName(u)} is beaten by the ${name}: ${demote(s, u, u)}.`;
    // The brave keeps what the loser dropped.
    if (role === 'dragoon') b.mounted = true;
    else if (role === 'soldier') b.armed = true;
  }
  message(s, text, u.owner, b);
  return { attackerWon: won, text };
}

/** A unit's offence against a native settlement (a nation's bonus may raise it: Spain × 1.5). */
export function offenceVsSettlement(s: GameState, u: Unit): number {
  let off = offencePower(s, u);
  for (const m of modifiers(s, u.owner, 'offenceVsSettlements')) off *= m.mul;
  return off;
}

function attackSettlement(s: GameState, u: Unit, settlementId: string): CombatResult {
  const grid = gridOf(s);
  const st = s.settlements[settlementId];
  const pos = unitPosition(s, u)!;
  if (!st || grid.distance(st.x, st.y, pos.x, pos.y) !== 1) fail('The settlement is not next to the unit.');
  noFriendsPeople(s, u.owner, st.tribe);
  hostile(s, st.tribe, u.owner, st, `an attack on the ${settlementName(s, st)}`);
  for (const other of Object.values(s.settlements)) if (other.tribe === st.tribe) addTension(other, u.owner, other.id === st.id ? 300 : 150);
  const off = offenceVsSettlement(s, u);
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
  delete s.settlements[st.id];
  for (const b of Object.values(bravesOf(s))) if (b.home === st.id) delete bravesOf(s)[b.id];
  track(u.owner, 'combat:settlement burned');
  const burnedTribe = s.tribes.find((t) => t.id === st.tribe);
  if (burnedTribe) noteSettlementBurned(s, burnedTribe, u.owner);
  const plunder = st.gold;
  player(s, u.owner).gold += plunder;
  let text = `The ${settlementName(s, st)} has been burned. ${plunder} gold was plundered.`;
  // Cities and capitals hide real treasure, which has to be carried away.
  const kind = settlementKindOf(s, st);
  const hoard = kind.treasure ?? (st.capital ? kind.capitalTreasure : undefined);
  if (hoard) {
    const base = hoard.base + randInt(s, hoard.spread);
    const treasure = createUnit(s, u.owner, 'treasure', { kind: 'map', x: pos.x, y: pos.y });
    treasure.treasure = Math.round(base * mulOf(modifiers(s, u.owner, 'conquestTreasure')));
    track(u.owner, 'treasure:found');
    text += ` A treasure worth ${treasure.treasure} gold has been found.`;
  }
  const survivors = modifiers(s, u.owner, 'conquestConverts').at(-1);
  if (survivors) {
    const converts = survivors.min + randInt(s, survivors.spread);
    for (let i = 0; i < converts; i++) createUnit(s, u.owner, survivors.unit, { kind: 'map', x: pos.x, y: pos.y });
    text += ` ${converts} survivor${converts > 1 ? 's' : ''} join you as converts.`;
  }
  if (st.capital) text += surrender(s, st.tribe, u.owner, st);
  noteHistory(s, 'burned', [u.owner], text, { secret: true, at: st });
  return text;
}

/**
 * When a tribe's capital burns, its other settlements may submit to the attacker (one seeded roll
 * per tribe; never after a desecrated burial ground; only with `mechanics.surrender`). They make peace, forget their anger, pay a
 * tribute, no longer attack or make demands, and give their land freely. Attacking the tribe
 * again ends it. Otherwise they fight on.
 */
function surrender(s: GameState, tribeId: TribeId, nation: PlayerId, at: { x: number; y: number }): string {
  if (nation === 'crown' || !mechanicsOf(s).surrender) return '';
  const rules = nativeRulesOf(s);
  const tribe = s.tribes.find((t) => t.id === tribeId)!;
  const rest = Object.values(s.settlements).filter((o) => o.tribe === tribeId);
  if (!rest.length || tribe.burial?.includes(nation) || random(s) >= rules.surrenderChance) return '';
  if (tribe.stance[nation] === 'war') notePeopleWarEnded(s, tribe, nation);
  tribe.stance[nation] = 'peace';
  tribe.submitted = [...(tribe.submitted ?? []).filter((n) => n !== nation), nation];
  let tribute = 0;
  for (const o of rest) {
    o.tension[nation] = 0;
    const gold = Math.floor(o.gold * rules.surrenderTribute);
    o.gold -= gold;
    tribute += gold;
  }
  player(s, nation).gold += tribute;
  track(nation, 'natives:tribe surrendered');
  noteHistory(s, 'tribe', [nation], `The ${TRIBES[tribeId].name} surrender to ${nationOf(s, nation).name} after losing their capital, and pay ${tribute} gold.`, { at });
  return ` The remaining ${TRIBES[tribeId].name} settlements surrender and pay a tribute of ${tribute} gold; their land is now open to you.`;
}

/** The Crown carries a treasure home from a coastal colony, for a fee unless Cortés is in Congress. */
export function cashTreasure(s: GameState, unitId: string): string {
  const u = s.units[unitId];
  if (!u || u.type !== 'treasure' || u.loc.kind !== 'map') fail('That is not a treasure train on the map.');
  const colony = colonyAt(s, u.loc.x, u.loc.y);
  if (!colony || colony.owner !== u.owner) fail('Bring the treasure into one of your colonies first.');
  const p = player(s, u.owner);
  if (p.independence !== 'none') fail(`${Term(s, 'crown')} will not carry treasure for rebels; use your own galleon.`);
  if (!isCoastal(s, colony.x, colony.y)) fail('The treasure must reach a coastal colony.');
  const gross = u.treasure ?? 0;
  const fee = modifiers(s, u.owner, 'treasureFee').at(-1)?.set ?? Math.round(gross / 2);
  const afterFee = gross - fee;
  const net = afterFee - Math.floor((afterFee * p.tax) / 100);
  p.gold += net;
  removeUnit(s, u.id);
  track(u.owner, 'cmd:cashTreasure');
  const text = `${Term(s, 'crown')} carries the treasure to ${term(s, 'homeland')}${fee ? ` for half its value` : ''}: ${net} gold after tax.`;
  message(s, text, u.owner, colony);
  noteHistory(s, 'treasure', [u.owner], `A treasure of ${gross} gold reaches ${term(s, 'homeland')} from ${colony.name}: ${net} gold after ${term(s, 'crown')}'s share and tax.`, { secret: true, at: colony });
  return text;
}
