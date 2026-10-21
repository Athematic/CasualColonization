import { assignJob, equipInColony, foundColony, hurryBuild, leaveColony, setBuild } from './colony.js';
import { attack } from './combat.js';
import { fail, RuleError } from './errors.js';
import {
  boardInEurope,
  buyGoods,
  equipInEurope,
  recruit,
  sailToAmerica,
  sailToEurope,
  sellGoods,
  train,
  unboardInEurope,
} from './europe.js';
import { boardShip, leaveShip, moveUnit, setDestination, startImprovement } from './movement.js';
import { learnSkill, speakToChief, tradeWithSettlement } from './natives.js';
import { cargoRoomFor, colonyAt, currentPlayer, type Direction } from './queries.js';
import type { GoodId } from './rules/goods.js';
import type { NationId } from './rules/nations.js';
import type { RoleId, UnitTypeId } from './rules/units.js';
import { endTurn } from './turn.js';
import type { BuildTarget, GameState, ImprovementKind, Job } from './types.js';

export type Command =
  | { type: 'move'; unitId: string; dir: Direction }
  | { type: 'goto'; unitId: string; x: number; y: number }
  | { type: 'gotoEurope'; unitId: string }
  | { type: 'clearOrders'; unitId: string }
  | { type: 'foundColony'; unitId: string; name?: string }
  | { type: 'attack'; unitId: string; target: { unitId?: string; colonyId?: string; settlementId?: string } }
  | { type: 'speak'; unitId: string; settlementId: string }
  | { type: 'learn'; unitId: string; settlementId: string }
  | { type: 'tradeNatives'; unitId: string; settlementId: string; good?: GoodId }
  | { type: 'fortify'; unitId: string }
  | { type: 'sentry'; unitId: string }
  | { type: 'activate'; unitId: string }
  | { type: 'skip'; unitId: string }
  | { type: 'improve'; unitId: string; kind: ImprovementKind }
  | { type: 'assignJob'; unitId: string; colonyId: string; job?: Job }
  | { type: 'leaveColony'; unitId: string }
  | { type: 'equip'; unitId: string; role: RoleId }
  | { type: 'board'; unitId: string; carrierId: string }
  | { type: 'unboard'; unitId: string }
  | { type: 'loadGoods'; carrierId: string; good: GoodId; amount: number }
  | { type: 'unloadGoods'; carrierId: string; good: GoodId; amount: number }
  | { type: 'setBuild'; colonyId: string; target: BuildTarget | null }
  | { type: 'hurry'; colonyId: string }
  | { type: 'sellGoods'; carrierId: string; good: GoodId; amount: number }
  | { type: 'buyGoods'; carrierId: string; good: GoodId; amount: number }
  | { type: 'recruit'; slot: number }
  | { type: 'train'; unitType: UnitTypeId }
  | { type: 'sailToEurope'; unitId: string }
  | { type: 'sailToAmerica'; unitId: string }
  | { type: 'disband'; unitId: string }
  | { type: 'endTurn' };

export type CommandResult = { ok: true; text?: string } | { ok: false; error: string };

function ownUnit(s: GameState, nation: NationId, unitId: string) {
  const u = s.units[unitId];
  if (!u) fail('No such unit.');
  if (u.owner !== nation) fail('That is not your unit.');
  return u;
}

function ownColony(s: GameState, nation: NationId, colonyId: string) {
  const c = s.colonies[colonyId];
  if (!c) fail('No such colony.');
  if (c.owner !== nation) fail('That is not your colony.');
  return c;
}

/** Loads or unloads goods between a carrier and the colony it is in. */
function transferGoods(s: GameState, nation: NationId, carrierId: string, good: GoodId, amount: number, load: boolean): void {
  const carrier = ownUnit(s, nation, carrierId);
  if (carrier.loc.kind !== 'map') fail('The carrier must be in a colony.');
  const colony = colonyAt(s, carrier.loc.x, carrier.loc.y);
  if (!colony || colony.owner !== nation) fail('The carrier must be in one of your colonies.');
  carrier.cargo = carrier.cargo ?? {};
  if (load) {
    const n = Math.min(amount, colony.goods[good], cargoRoomFor(s, carrier, good));
    if (n <= 0) fail('Nothing to load.');
    colony.goods[good] -= n;
    carrier.cargo[good] = (carrier.cargo[good] ?? 0) + n;
  } else {
    const n = Math.min(amount, carrier.cargo[good] ?? 0);
    if (n <= 0) fail('Nothing to unload.');
    carrier.cargo[good] = (carrier.cargo[good] ?? 0) - n;
    colony.goods[good] += n;
  }
}

/** Validates and applies a command for the nation whose turn it is. Mutates the state. */
export function applyCommand(s: GameState, cmd: Command): CommandResult {
  const nation = currentPlayer(s).id;
  try {
    let text: string | undefined;
    switch (cmd.type) {
      case 'move':
        ownUnit(s, nation, cmd.unitId);
        moveUnit(s, cmd.unitId, cmd.dir);
        break;
      case 'goto':
        ownUnit(s, nation, cmd.unitId);
        setDestination(s, cmd.unitId, { x: cmd.x, y: cmd.y });
        break;
      case 'gotoEurope':
        ownUnit(s, nation, cmd.unitId);
        setDestination(s, cmd.unitId, { europe: true });
        break;
      case 'clearOrders': {
        const u = ownUnit(s, nation, cmd.unitId);
        delete u.dest;
        delete u.work;
        u.state = 'active';
        break;
      }
      case 'foundColony':
        ownUnit(s, nation, cmd.unitId);
        text = `${foundColony(s, cmd.unitId, cmd.name).name} has been founded.`;
        break;
      case 'attack':
        ownUnit(s, nation, cmd.unitId);
        text = attack(s, cmd.unitId, cmd.target).text;
        break;
      case 'speak':
        ownUnit(s, nation, cmd.unitId);
        text = speakToChief(s, cmd.unitId, cmd.settlementId);
        break;
      case 'learn':
        ownUnit(s, nation, cmd.unitId);
        text = learnSkill(s, cmd.unitId, cmd.settlementId);
        break;
      case 'tradeNatives':
        ownUnit(s, nation, cmd.unitId);
        text = tradeWithSettlement(s, cmd.unitId, cmd.settlementId, cmd.good);
        break;
      case 'fortify': {
        const u = ownUnit(s, nation, cmd.unitId);
        u.state = 'fortified';
        u.moves = 0;
        delete u.dest;
        break;
      }
      case 'sentry': {
        const u = ownUnit(s, nation, cmd.unitId);
        u.state = 'sentry';
        delete u.dest;
        break;
      }
      case 'activate': {
        const u = ownUnit(s, nation, cmd.unitId);
        u.state = 'active';
        break;
      }
      case 'skip': {
        const u = ownUnit(s, nation, cmd.unitId);
        u.moves = 0;
        break;
      }
      case 'improve':
        ownUnit(s, nation, cmd.unitId);
        startImprovement(s, cmd.unitId, cmd.kind);
        break;
      case 'assignJob':
        ownUnit(s, nation, cmd.unitId);
        ownColony(s, nation, cmd.colonyId);
        assignJob(s, cmd.unitId, cmd.colonyId, cmd.job);
        break;
      case 'leaveColony':
        ownUnit(s, nation, cmd.unitId);
        leaveColony(s, cmd.unitId);
        break;
      case 'equip': {
        const u = ownUnit(s, nation, cmd.unitId);
        if (u.loc.kind === 'europe') equipInEurope(s, cmd.unitId, cmd.role);
        else equipInColony(s, cmd.unitId, cmd.role);
        break;
      }
      case 'board': {
        const u = ownUnit(s, nation, cmd.unitId);
        ownUnit(s, nation, cmd.carrierId);
        if (u.loc.kind === 'europe') boardInEurope(s, cmd.unitId, cmd.carrierId);
        else boardShip(s, cmd.unitId, cmd.carrierId);
        break;
      }
      case 'unboard': {
        const u = ownUnit(s, nation, cmd.unitId);
        if (u.loc.kind !== 'carrier') fail('The unit is not aboard.');
        const carrier = s.units[u.loc.carrierId];
        if (carrier.loc.kind === 'europe') unboardInEurope(s, cmd.unitId);
        else leaveShip(s, cmd.unitId);
        break;
      }
      case 'loadGoods':
        transferGoods(s, nation, cmd.carrierId, cmd.good, cmd.amount, true);
        break;
      case 'unloadGoods':
        transferGoods(s, nation, cmd.carrierId, cmd.good, cmd.amount, false);
        break;
      case 'setBuild':
        ownColony(s, nation, cmd.colonyId);
        setBuild(s, cmd.colonyId, cmd.target);
        break;
      case 'hurry':
        ownColony(s, nation, cmd.colonyId);
        hurryBuild(s, cmd.colonyId);
        break;
      case 'sellGoods':
        ownUnit(s, nation, cmd.carrierId);
        text = `Sold for ${sellGoods(s, cmd.carrierId, cmd.good, cmd.amount)} gold after tax.`;
        break;
      case 'buyGoods':
        ownUnit(s, nation, cmd.carrierId);
        buyGoods(s, cmd.carrierId, cmd.good, cmd.amount);
        break;
      case 'recruit':
        recruit(s, nation, cmd.slot);
        break;
      case 'train':
        train(s, nation, cmd.unitType);
        break;
      case 'sailToEurope':
        ownUnit(s, nation, cmd.unitId);
        sailToEurope(s, cmd.unitId);
        break;
      case 'sailToAmerica':
        ownUnit(s, nation, cmd.unitId);
        sailToAmerica(s, cmd.unitId);
        break;
      case 'disband': {
        const u = ownUnit(s, nation, cmd.unitId);
        if (u.loc.kind === 'colony') fail('Remove the colonist from the colony first.');
        for (const o of Object.values(s.units)) if (o.loc.kind === 'carrier' && o.loc.carrierId === u.id) delete s.units[o.id];
        delete s.units[u.id];
        break;
      }
      case 'endTurn':
        endTurn(s);
        break;
      default: {
        const never: never = cmd;
        fail(`Unknown command ${(never as { type: string }).type}`);
      }
    }
    return { ok: true, text };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
