import { assignJob, equipInColony, foundColony, hurryBuild, leaveColony, setBuild } from './colony.js';
import { applyCheat, type CheatId } from './cheats.js';
import { track } from './telemetry.js';
import { attack, cashTreasure, repairArtillery } from './combat.js';
import { fail, RuleError } from './errors.js';
import {
  answerTax,
  boardInEurope,
  payArrears,
  buyGoods,
  equipInEurope,
  recruit,
  sailToAmerica,
  sailToEurope,
  sellGoods,
  train,
  unboardInEurope,
} from './europe.js';
import { boardShip, leaveShip, moveUnit, setDestination, setRoadTo, startImprovement } from './movement.js';
import { answerNativeDemand } from './braves.js';
import { buyFromSettlement, buyLand, denounceMission, establishMission, giftToTribe, inciteTribe, learnSkill, speakToChief, takeLand, tradeWithSettlement } from './natives.js';
import { chooseFather } from './fathers.js';
import { proposePeace, startWar } from './diplomacy.js';
import { answerProposal, cancelFavoured, cancelTrade, proposeAlliance, proposeExpedition, proposeFavoured, proposeTrade } from './relations.js';
import { leaveAlliance, tradeInColony } from './alliances.js';
import { buyShares, foundCompany } from './chartered.js';
import { proposeConfederation } from './confederation.js';
import { abandonColony, retire } from './leaving.js';
import { declareIndependence } from './independence.js';
import { answerDemand } from './crown.js';
import { answerMercenaries } from './rebellion.js';
import { answerEvent, setEvents } from './events/index.js';
import type { FatherId } from './rules/fathers.js';
import type { Direction } from './grid.js';
import { cargoRoomFor, colonyAt, currentPlayer } from './queries.js';
import type { GoodId } from './rules/goods.js';
import type { NationId, TribeId } from './rules/nations.js';
import type { RoleId, UnitTypeId } from './rules/units.js';
import { endTurn } from './turn.js';
import { assignRoute, createRoute, deleteRoute, editRoute, unassignRoute } from './routes.js';
import type { BuildTarget, GameState, ImprovementKind, Job, RouteStop } from './types.js';
import { removeUnit, unitList } from './unitindex.js';

export type Command =
  | { type: 'move'; unitId: string; dir: Direction }
  | { type: 'goto'; unitId: string; x: number; y: number }
  | { type: 'roadTo'; unitId: string; x: number; y: number }
  /** `port`: a Favoured Nation partner's home port to sail to; missing means the ship's own. */
  | { type: 'gotoEurope'; unitId: string; port?: NationId }
  | { type: 'clearOrders'; unitId: string }
  | { type: 'foundColony'; unitId: string; name?: string }
  | { type: 'attack'; unitId: string; target: { unitId?: string; colonyId?: string; settlementId?: string; braveId?: string } }
  | { type: 'speak'; unitId: string; settlementId: string }
  | { type: 'learn'; unitId: string; settlementId: string }
  | { type: 'tradeNatives'; unitId: string; settlementId: string; good?: GoodId }
  /** A wagon train or ship next to a settlement buys goods it has gathered (up to `amount`, default 100). */
  | { type: 'buyNatives'; unitId: string; settlementId: string; good: GoodId; amount?: number }
  /** A missionary next to a settlement denounces a rival nation's mission there. */
  | { type: 'denounce'; unitId: string; settlementId: string }
  /** A missionary pays a settlement's tribe to turn against a rival nation. */
  | { type: 'incite'; unitId: string; settlementId: string; nation: NationId }
  /** Pays (or refuses) a brave's demand for tribute, or buys (or declines) goods a brave offers. */
  | { type: 'answerNativeDemand'; demandId: string; accept: boolean }
  | { type: 'fortify'; unitId: string }
  | { type: 'repairArtillery'; unitId: string }
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
  /** `port`: buy a merchant ship in a Favoured Nation partner's port, where one of your ships is. */
  | { type: 'train'; unitType: UnitTypeId; port?: NationId }
  | { type: 'sailToEurope'; unitId: string; port?: NationId }
  | { type: 'sailToAmerica'; unitId: string }
  | { type: 'disband'; unitId: string }
  | { type: 'chooseFather'; father: FatherId }
  | { type: 'buyLand'; x: number; y: number }
  | { type: 'takeLand'; x: number; y: number }
  | { type: 'mission'; unitId: string; settlementId: string }
  | { type: 'cashTreasure'; unitId: string }
  | { type: 'answerTax'; accept: boolean }
  /** Pays (or refuses) the King's demand for gold. */
  | { type: 'answerDemand'; pay: boolean }
  /** Hires (or turns away) the mercenary company offering its services during the War of Independence. */
  | { type: 'answerMercenaries'; hire: boolean }
  /** Answers a pending event (events/): `choice` is the index of the choice taken. */
  | { type: 'answerEvent'; eventId: string; choice: number }
  /** Switches historical and/or random events on or off for the rest of the game. */
  | { type: 'setEvents'; historical?: boolean; random?: boolean }
  | { type: 'payArrears'; good: GoodId }
  | { type: 'setExport'; colonyId: string; good: GoodId; on: boolean }
  | { type: 'declareWar'; nation: NationId }
  | { type: 'proposePeace'; nation: NationId }
  | { type: 'proposeTrade'; nation: NationId }
  | { type: 'proposeFavoured'; nation: NationId }
  /** Answers the proposal (trade agreement or Favoured Nation) that `nation` made. */
  | { type: 'answerProposal'; nation: NationId; accept: boolean }
  | { type: 'cancelTrade'; nation: NationId }
  | { type: 'cancelFavoured'; nation: NationId }
  /** Proposes an alliance to `nation`, or invites it to join yours (alliances.ts). */
  | { type: 'proposeAlliance'; nation: NationId }
  | { type: 'leaveAlliance' }
  /** Proposes a joint expedition to an ally: each pays half, the gold it finds is shared (alliances.ts). */
  | { type: 'proposeExpedition'; nation: NationId }
  /** Proposes to an ally that both declare independence now, together (confederation.ts). */
  | { type: 'proposeConfederation'; nation: NationId }
  /** Founds a chartered company from the scenario's list, or buys new shares in one (companies.ts). */
  | { type: 'foundCompany'; company: NationId }
  | { type: 'buyShares'; company: NationId; count: number }
  /** A ship or wagon train in an ally's colony sells goods to it, or buys goods from it (alliances.ts). */
  | { type: 'sellInColony'; carrierId: string; good: GoodId; amount: number }
  | { type: 'buyInColony'; carrierId: string; good: GoodId; amount: number }
  | { type: 'giftTribe'; tribe: TribeId; gold: number }
  | { type: 'declareIndependence' }
  /** Abandons a small colony without a stockade (leaving.ts). */
  | { type: 'abandonColony'; colonyId: string }
  /** Ends the game now with the current score. */
  | { type: 'retire' }
  | { type: 'createRoute'; name: string; stops?: RouteStop[] }
  | { type: 'editRoute'; routeId: string; name?: string; stops?: RouteStop[] }
  | { type: 'deleteRoute'; routeId: string }
  | { type: 'assignRoute'; unitId: string; routeId: string }
  | { type: 'unassignRoute'; unitId: string }
  /** A cheat (see cheats.ts). `nation` defaults to the nation whose turn it is; `on` sets a toggle, omitted flips it. */
  | { type: 'cheat'; cheat: CheatId; nation?: NationId; on?: boolean }
  | { type: 'endTurn' };

/** `id` names what the command created (a new trade route). */
export type CommandResult = { ok: true; text?: string; id?: string } | { ok: false; error: string };

function ownUnit(s: GameState, nation: NationId, unitId: string) {
  const u = s.units[unitId];
  if (!u) fail('No such unit.');
  if (u.owner !== nation) fail('That is not your unit.');
  if (u.ally) fail('The intervention force fights on its own and takes no orders.');
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

/** Command types that change the state directly here rather than through an engine function. */
const DIRECT_COMMANDS = new Set<Command['type']>(['clearOrders', 'fortify', 'sentry', 'activate', 'skip', 'loadGoods', 'unloadGoods', 'disband', 'setExport']);

/** Validates and applies a command for the nation whose turn it is. Mutates the state. */
export function applyCommand(s: GameState, cmd: Command): CommandResult {
  const nation = currentPlayer(s).id;
  try {
    let text: string | undefined;
    let id: string | undefined;
    // Commands with no engine function of their own are counted here; the rest where they act.
    if (DIRECT_COMMANDS.has(cmd.type)) track(nation, `cmd:${cmd.type}`);
    switch (cmd.type) {
      case 'move':
        delete ownUnit(s, nation, cmd.unitId).roadTo;
        moveUnit(s, cmd.unitId, cmd.dir);
        break;
      case 'goto':
        ownUnit(s, nation, cmd.unitId);
        setDestination(s, cmd.unitId, { x: cmd.x, y: cmd.y });
        break;
      case 'roadTo':
        ownUnit(s, nation, cmd.unitId);
        setRoadTo(s, cmd.unitId, cmd.x, cmd.y);
        break;
      case 'gotoEurope':
        ownUnit(s, nation, cmd.unitId);
        setDestination(s, cmd.unitId, cmd.port ? { europe: true, port: cmd.port } : { europe: true });
        break;
      case 'clearOrders': {
        const u = ownUnit(s, nation, cmd.unitId);
        delete u.dest;
        delete u.roadTo;
        delete u.work;
        delete u.route;
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
      case 'buyNatives':
        ownUnit(s, nation, cmd.unitId);
        text = buyFromSettlement(s, cmd.unitId, cmd.settlementId, cmd.good, cmd.amount);
        break;
      case 'denounce':
        ownUnit(s, nation, cmd.unitId);
        text = denounceMission(s, cmd.unitId, cmd.settlementId);
        break;
      case 'incite':
        ownUnit(s, nation, cmd.unitId);
        text = inciteTribe(s, cmd.unitId, cmd.settlementId, cmd.nation);
        break;
      case 'answerNativeDemand':
        text = answerNativeDemand(s, nation, cmd.demandId, cmd.accept);
        break;
      case 'fortify': {
        const u = ownUnit(s, nation, cmd.unitId);
        u.state = 'fortified';
        u.moves = 0;
        delete u.dest;
        delete u.roadTo;
        break;
      }
      case 'repairArtillery':
        text = repairArtillery(s, nation, cmd.unitId);
        break;
      case 'sentry': {
        const u = ownUnit(s, nation, cmd.unitId);
        u.state = 'sentry';
        delete u.dest;
        delete u.roadTo;
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
        delete ownUnit(s, nation, cmd.unitId).roadTo;
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
        train(s, nation, cmd.unitType, cmd.port);
        break;
      case 'sailToEurope':
        ownUnit(s, nation, cmd.unitId);
        sailToEurope(s, cmd.unitId, cmd.port);
        break;
      case 'sailToAmerica':
        ownUnit(s, nation, cmd.unitId);
        sailToAmerica(s, cmd.unitId);
        break;
      case 'disband': {
        const u = ownUnit(s, nation, cmd.unitId);
        if (u.loc.kind === 'colony') fail('Remove the colonist from the colony first.');
        for (const o of unitList(s)) if (o.loc.kind === 'carrier' && o.loc.carrierId === u.id) removeUnit(s, o.id);
        removeUnit(s, u.id);
        break;
      }
      case 'chooseFather':
        chooseFather(s, nation, cmd.father);
        break;
      case 'buyLand':
        text = buyLand(s, nation, cmd.x, cmd.y);
        break;
      case 'takeLand':
        text = takeLand(s, nation, cmd.x, cmd.y);
        break;
      case 'mission':
        ownUnit(s, nation, cmd.unitId);
        text = establishMission(s, cmd.unitId, cmd.settlementId);
        break;
      case 'cashTreasure':
        ownUnit(s, nation, cmd.unitId);
        text = cashTreasure(s, cmd.unitId);
        break;
      case 'answerTax':
        text = answerTax(s, nation, cmd.accept);
        break;
      case 'answerDemand':
        text = answerDemand(s, nation, cmd.pay);
        break;
      case 'answerMercenaries':
        text = answerMercenaries(s, nation, cmd.hire);
        break;
      case 'answerEvent':
        text = answerEvent(s, nation, cmd.eventId, cmd.choice);
        break;
      case 'setEvents':
        text = setEvents(s, { historical: cmd.historical, random: cmd.random });
        break;
      case 'payArrears':
        payArrears(s, nation, cmd.good);
        break;
      case 'setExport': {
        const c = ownColony(s, nation, cmd.colonyId);
        if (cmd.on) c.exports[cmd.good] = true;
        else delete c.exports[cmd.good];
        break;
      }
      case 'declareWar':
        text = startWar(s, nation, cmd.nation);
        break;
      case 'proposePeace':
        text = proposePeace(s, nation, cmd.nation);
        break;
      case 'proposeTrade':
        text = proposeTrade(s, nation, cmd.nation);
        break;
      case 'proposeFavoured':
        text = proposeFavoured(s, nation, cmd.nation);
        break;
      case 'answerProposal':
        text = answerProposal(s, nation, cmd.nation, cmd.accept);
        break;
      case 'cancelTrade':
        text = cancelTrade(s, nation, cmd.nation);
        break;
      case 'cancelFavoured':
        text = cancelFavoured(s, nation, cmd.nation);
        break;
      case 'proposeAlliance':
        text = proposeAlliance(s, nation, cmd.nation);
        break;
      case 'leaveAlliance':
        text = leaveAlliance(s, nation);
        break;
      case 'proposeExpedition':
        text = proposeExpedition(s, nation, cmd.nation);
        break;
      case 'proposeConfederation':
        text = proposeConfederation(s, nation, cmd.nation);
        break;
      case 'foundCompany':
        track(nation, 'cmd:foundCompany');
        text = foundCompany(s, nation, cmd.company);
        break;
      case 'buyShares':
        track(nation, 'cmd:buyShares');
        text = buyShares(s, nation, cmd.company, cmd.count);
        break;
      case 'sellInColony':
      case 'buyInColony':
        ownUnit(s, nation, cmd.carrierId);
        text = tradeInColony(s, nation, cmd.carrierId, cmd.good, cmd.amount, cmd.type === 'buyInColony');
        break;
      case 'giftTribe':
        text = giftToTribe(s, nation, cmd.tribe, cmd.gold);
        break;
      case 'abandonColony':
        ownColony(s, nation, cmd.colonyId);
        text = abandonColony(s, cmd.colonyId);
        break;
      case 'retire':
        text = retire(s);
        break;
      case 'declareIndependence':
        text = declareIndependence(s, nation);
        break;
      case 'createRoute': {
        const route = createRoute(s, nation, cmd.name, cmd.stops);
        id = route.id;
        text = `The ${route.name} route has been set up.`;
        break;
      }
      case 'editRoute':
        editRoute(s, nation, cmd.routeId, { name: cmd.name, stops: cmd.stops });
        break;
      case 'deleteRoute':
        deleteRoute(s, nation, cmd.routeId);
        break;
      case 'assignRoute':
        ownUnit(s, nation, cmd.unitId);
        assignRoute(s, cmd.unitId, cmd.routeId);
        break;
      case 'unassignRoute':
        ownUnit(s, nation, cmd.unitId);
        unassignRoute(s, cmd.unitId);
        break;
      case 'cheat':
        text = applyCheat(s, cmd.cheat, cmd.nation ?? nation, cmd.on);
        break;
      case 'endTurn':
        endTurn(s);
        break;
      default: {
        const never: never = cmd;
        fail(`Unknown command ${(never as { type: string }).type}`);
      }
    }
    return id ? { ok: true, text, id } : { ok: true, text };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
