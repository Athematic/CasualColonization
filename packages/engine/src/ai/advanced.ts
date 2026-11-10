/**
 * The computer player behind the Competent, Combative and Creative levels. One set of
 * behaviours, steered by an AiProfile: how far to expand, how much to value liberty,
 * how big a garrison to keep, whether to start wars, and so on.
 */
import {
  assignJob,
  buildTargetCost,
  canBuild,
  canTeachHere,
  charterCost,
  equipInColony,
  foundColony,
  hurryBuild,
  hurryPrice,
  colonyOccupancy,
  jobOptions,
  type ColonyOccupancy,
  leaveColony,
  setBuild,
} from '../colony.js';
import { attack, cashTreasure, defencePower, offencePower, repairArtillery } from '../combat.js';
import { proposePeace, startWar } from '../diplomacy.js';
import { favouredPartners, hasTradeAgreement, isHostile } from '../relations.js';
import { boardInEurope, buyGoods, buyPrice, inHomePort, portOf, recruit, recruitPrice, sailToAmerica, sellGoods, train, trainPrice } from '../europe.js';
import { canDeclareIndependence, declareIndependence, rebelShare } from '../independence.js';
import { abandonColony } from '../leaving.js';
import { boardShip, canImprove, findPath, goTo, setDestination, startImprovement } from '../movement.js';
import { buyLand, establishMission, giftToTribe, landPrice, learnSkill, nativeLandOwner, speakToChief, takeLand, tensionOf } from '../natives.js';
import { type ColonyReport } from '../production.js';
import { aiColonyReport } from './reports.js';
import {
  cargoFree,
  cargoRoomFor,
  colonyAt,
  colonyWorkers,
  distance,
  isCoastal,
  isShip,
  isWater,
  neighbours,
  settlementAt,
  tileAt,
  unitPosition,
  unitsAboard,
  unitsAt,
  warehouseCapacity,
} from '../queries.js';
import { BUILDINGS, type BuildingKind } from '../rules/buildings.js';
import type { GoodId, ProductId } from '../rules/goods.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import type { BuildTarget, Colony, GameState, Job, Player, Unit } from '../types.js';
import { aiFight, bestColonySite, boardRescue, countUnits, disembarkAll, fetchStranded, keenSiteScore, landingSpot, nearestColony, ownColonies, safely, siteScore } from './common.js';
import { buyShips, shipToBuild } from './fleet.js';
import { bestWarTarget, choosePort, foreignAffairs, noteSale, sellHere, triangleBuy } from './foreign.js';
import { manageLogistics, overflowSoon, wantsWagon } from './logistics.js';
import { stopPort } from '../routes.js';
import { forEachUnitNear } from '../unitindex.js';
import { maybeIncite } from './natives.js';
import { armyForIndependence, colonyDefences, supportParts, rebelColonyDefence, rebelPower, crownAffairs, defenceShort, hireMercenaries, holdsAlone, powerNeeded, REBEL_DEFENCE, weakColonies } from './royal.js';
import { NO_PLAN, PLAN_LIBERTY, planLiberty, planTurn, type PlanTurn } from './plan.js';
import { equippedPrice, trainEquipped } from './outfit.js';
import type { AiProfile } from './profiles.js';
import { buildRoads, equipPioneer, pioneerToolsWanted } from './roads.js';
import { aiGoodsOf, aiTurn, goodsOf, scenarioOf } from '../scenarios/index.js';

const SUPPLIES: GoodId[] = ['tools', 'muskets', 'horses'];

/** Plays one turn with the given profile. */
export function runAdvanced(s: GameState, p: Player, base: AiProfile): void {
  turnShare = rebelShare(s, p.id);
  const plan = base.independence;
  // Mercenaries and a foreign intervention count towards the defence (ai/royal.ts, rebellion.ts).
  // (expectedSupport, with its parts kept: planning changes nothing they depend on.)
  const parts = plan && p.independence === 'none' && (preparingIndependence(base, 20) || p.aiMemory?.independencePlan !== undefined) ? supportParts(s, p) : undefined;
  const support = parts ? parts.mercenaries + parts.intervention : 0;
  turnSupport = support;
  // The independence plan (ai/plan.ts): adopted from mid-game, it rings more bells, builds
  // defences and, once the rebels are close to a majority, arms.
  turnPlan = plan ? planTurn(s, p, base, turnShare, () => !!plan.arm && p.independence === 'none' && !readyToFight(s, p, plan.ratio, support, parts?.mercenaries), support) : NO_PLAN;
  // Close to a declaration, and during the war, no more colonies (ai/plan.ts).
  const colonies = ownColonies(s, p).length;
  const settled = colonies > 0 && (p.independence === 'declared' || (turnPlan.arming && turnShare >= (plan?.minShare ?? 0) - FOUND_BELOW));
  const prof: AiProfile =
    turnPlan.adopted || p.independence === 'declared'
      ? { ...base, liberty: planLiberty(p, base, turnPlan), ...(settled ? { colonyTarget: () => colonies } : {}) }
      : base;
  turnExpansion = expansionCheck(s, p, prof);
  turnSaving = turnExpansion === 'ready' || turnExpansion === 'gold' ? charterCost(s, p.id) : 0;
  turnArmy = plan ? (plan.arm ? armyForIndependence(s, p, plan, support) : plan.armyPerColony) : 0;
  turnArming = !!plan?.arm && turnPlan.arming;
  const army = spareArmy(s, p, prof);
  const strength = army.reduce((n, u) => n + offencePower(s, u), 0);
  safely(() => foreignAffairs(s, p, prof, strength, army.length));
  // The King's demands and wars (ai/royal.ts).
  crownAffairs(s, p, prof, preparingIndependence(prof, 20), strength);
  // A mercenary company offering its services during the War of Independence.
  if (p.mercenaryOffer) hireMercenaries(s, p, prof, plan?.ratio ?? 1.2);
  safely(() => diplomacy(s, p, prof));
  for (const c of ownColonies(s, p)) safely(() => manageColony(s, p, c, prof));
  safely(() => sendSettler(s, p, prof));
  safely(() => manageLogistics(s, p));
  const units = Object.values(s.units).filter((u) => u.owner === p.id);
  for (const u of units) {
    if (!s.units[u.id] || u.owner !== p.id) continue;
    safely(() => unitTurn(s, p, u, prof));
  }
  safely(() => europe(s, p, prof));
  safely(() => independence(s, p, prof));
}

// ---------------------------------------------------------------------------
// Helpers

/** The nation's rebel share, worked out once per turn: it is needed constantly. */
let turnShare = 0;

/** Armed units per colony wanted for independence, against the force the Crown has built up (ai/royal.ts); also once per turn. */
let turnArmy = 0;

/** Getting ready for independence while the defence is still short of the Royal Expeditionary Force: arm. */
let turnArming = false;

/** While arming, no colony is founded once the rebel share is this close to the share needed to declare (ai/plan.ts). */
const FOUND_BELOW = 5;

/** The independence plan's steps this turn (ai/plan.ts). */
let turnPlan: PlanTurn = NO_PLAN;

/** Help expected from mercenaries and a foreign intervention, for a nation planning independence. */
let turnSupport = 0;

/**
 * Whether the nation's defence is ready for a War of Independence (ai/royal.ts): `ratio` times the
 * royal force with the help it can expect, enough to hold until the intervention comes, and no
 * third of the colonies weak. `mercenaries` are those of `supportParts`, when the caller has them.
 * The colonies' defences are worked out once for all three.
 */
function readyToFight(s: GameState, p: Player, ratio: number, support: number, mercenaries = supportParts(s, p).mercenaries): boolean {
  const defences = colonyDefences(s, p);
  const power = rebelPower(s, p, defences);
  if (defenceShort(s, p, ratio, support, power) || !holdsAlone(s, p, mercenaries, power)) return false;
  // Last: weakColonies adds the mercenaries to the defences.
  return weakColonies(s, p, mercenaries, defences).length * 3 < ownColonies(s, p).length;
}

/** Whether the nation's rebel share is within `margin` points of the share at which it means to declare. */
function preparingIndependence(prof: AiProfile, margin = 15): boolean {
  return !!prof.independence && turnShare >= prof.independence.minShare - margin;
}

/** Armies, artillery and armories are for nations that mean to fight (Combative, or Creative at war). */
const militant = (prof: AiProfile) => prof.aggression >= 0.5;

const isArmed = (u: Unit) => u.role === 'soldier' || u.role === 'dragoon' || UNIT_TYPES[u.type].kind === 'artillery';

function armedAt(s: GameState, p: Player, x: number, y: number): Unit[] {
  return unitsAt(s, x, y).filter((u) => u.owner === p.id && isArmed(u));
}

/** Armed units not needed for garrison duty. */
function spareArmy(s: GameState, p: Player, prof: AiProfile): Unit[] {
  const out: Unit[] = [];
  const kept = new Map<string, number>();
  for (const u of Object.values(s.units)) {
    if (u.owner !== p.id || !isArmed(u) || u.loc.kind !== 'map' || u.ally) continue;
    const c = colonyAt(s, u.loc.x, u.loc.y);
    if (c && c.owner === p.id) {
      const n = kept.get(c.id) ?? 0;
      if (n < garrisonFor(p, prof)) {
        kept.set(c.id, n + 1);
        continue;
      }
    }
    out.push(u);
  }
  return out;
}

function garrisonFor(p: Player, prof: AiProfile): number {
  const atWar = Object.values(p.stance).includes('war');
  let n = prof.garrison;
  if (atWar) n += 1;
  if (preparingIndependence(prof) || p.independence === 'declared') n = Math.max(n, turnArmy);
  return n;
}

/** What holds back the nation's next colony this turn (expansionCheck), worked out once per turn. */
let turnExpansion: ExpansionCheck = 'ready';

/** Gold put aside for the next colony charter: purchases in Europe leave it alone. */
let turnSaving = 0;

export type ExpansionCheck = 'ready' | 'enough' | 'population' | 'pace' | 'defence' | 'gold';

/**
 * Whether the nation is ready to invest in another colony (AiProfile.expansion), or what it waits
 * for: 'enough' colonies for now, the colonies' 'population', the 'pace' of founding, a spare
 * 'defence', or the charter's 'gold'. The first colony is always ready.
 */
export function expansionCheck(s: GameState, p: Player, prof: AiProfile, colonies = ownColonies(s, p)): ExpansionCheck {
  if (!colonies.length) return 'ready';
  if (colonies.length >= prof.colonyTarget(s.turn)) return 'enough';
  const rule = prof.expansion;
  // The established colonies: the youngest (founded within two founding intervals) are still
  // being settled. A lone first colony only needs to be more than a camp, so that a poor site
  // does not stall the nation.
  const established = colonies.length === 1 ? colonies : colonies.filter((c) => s.turn - c.founded >= rule.everyTurns * 2);
  const population = established.reduce((n, c) => n + colonyWorkers(s, c).length, 0);
  if (!established.length || population < (colonies.length === 1 ? 2 : rule.minPopulation * established.length)) return 'population';
  if (s.turn - Math.max(...colonies.map((c) => c.founded)) < rule.everyTurns) return 'pace';
  // A defender to spare: as many armed units and stockades as colonies beyond the first few that
  // have had the time and the people (three, as a stockade needs) to raise one. buildPlan puts the
  // stockade first there; soldiers and militia fill garrisons.
  const settled = outposts(colonies, prof).filter((c) => s.turn - c.founded >= rule.graceTurns && colonyWorkers(s, c).length >= 3).length;
  if (settled > 0) {
    const defences = countOwned(s, p, (u) => isArmed(u) && u.loc.kind !== 'europe') + colonies.filter((c) => c.buildings.stockade > 0 && !armedAt(s, p, c.x, c.y).length).length;
    if (defences < settled) return 'defence';
  }
  const charter = charterCost(s, p.id);
  if (charter > 0 && p.gold < charter + prof.reserve) return 'gold';
  return 'ready';
}

/** The colonies beyond the first `undefended` founded, which must be defended before the nation expands further. */
function outposts(colonies: Colony[], prof: AiProfile): Colony[] {
  return [...colonies].sort((a, b) => a.founded - b.founded || (a.id < b.id ? -1 : 1)).slice(prof.expansion.undefended);
}

export const expansionReady = (s: GameState, p: Player, prof: AiProfile, colonies = ownColonies(s, p)) => expansionCheck(s, p, prof, colonies) === 'ready';

/** A site's penalty for native villages within two tiles: colonies there raise tension. */
const nativeCrowding = (s: GameState) => {
  const villages = Object.values(s.settlements);
  return (x: number, y: number) => villages.filter((st) => distance(st.x, st.y, x, y) <= 2).length * 4;
};

/** The colonists sent out to found colonies, while they are on their way (forgetting the others). */
function settlersOnTheWay(s: GameState, p: Player): Unit[] {
  const memory = p.aiMemory;
  if (!memory?.settlers) return [];
  // Out of the colony and still a plain colonist (one that rejoined a colony or took up a role is not).
  const out = memory.settlers.map((id) => s.units[id]).filter((u) => u && u.owner === p.id && u.loc.kind === 'map' && u.role === 'none');
  if (out.length) memory.settlers = out.map((u) => u.id);
  else delete memory.settlers;
  return out;
}

function markSettler(p: Player, u: Unit): void {
  const memory = (p.aiMemory = p.aiMemory ?? {});
  if (!memory.settlers?.includes(u.id)) memory.settlers = [...(memory.settlers ?? []), u.id];
}

/**
 * Once the nation is ready for another colony and fewer than `expansion.settlers` are on their way,
 * its largest colony sends one out: the least skilled colonist of the colony with the most people,
 * if a good site lies within walking distance. Once sent, the settler only needs the charter in
 * hand and the pace of founding to found (colonistTurn), so it does not turn back half way.
 */
function sendSettler(s: GameState, p: Player, prof: AiProfile): void {
  const colonies = ownColonies(s, p);
  if (!colonies.length || turnExpansion !== 'ready' || settlersOnTheWay(s, p).length >= prof.expansion.settlers) return;
  const keep = Math.max(3, Math.ceil(prof.expansion.minPopulation));
  const from = colonies
    .map((c) => ({ c, workers: colonyWorkers(s, c) }))
    .filter((e) => e.workers.length > keep)
    .sort((a, b) => b.workers.length - a.workers.length || (a.c.id < b.c.id ? -1 : 1))[0];
  if (!from) return;
  const site = bestColonySite(s, from.c.x, from.c.y, { radius: 8, score: (x, y) => keenSiteScore(s, x, y), perTile: 1.1, stay: false, overLand: true, penalty: nativeCrowding(s) });
  if (site.score <= 14) {
    if (scenarioOf(s).ai.islands) sendSeaSettler(s, p, colonies, keep);
    return;
  }
  const settler = from.workers
    .filter((w) => w.type !== 'nativeConvert' && !w.teach)
    .sort((a, b) => UNIT_TYPES[a.type].skill - UNIT_TYPES[b.type].skill || (a.id < b.id ? -1 : 1))[0];
  if (!settler) return;
  leaveColony(s, settler.id);
  markSettler(p, settler);
}

/**
 * Among islands (`ai.islands`): with no site within walking distance, the largest coastal colony
 * sends a settler to wait on its quay for a ship to the best site on another island within 12
 * tiles (carrySeaSettler). One at a time.
 */
function sendSeaSettler(s: GameState, p: Player, colonies: Colony[], keep: number): void {
  const memory = (p.aiMemory = p.aiMemory ?? {});
  const sea = (memory.seaSettlers = memory.seaSettlers ?? {});
  for (const id of Object.keys(sea)) if (!s.units[id] || s.units[id].owner !== p.id) delete sea[id];
  if (Object.keys(sea).length) return;
  const from = colonies
    .filter((c) => isCoastal(s, c.x, c.y))
    .map((c) => ({ c, workers: colonyWorkers(s, c) }))
    .filter((e) => e.workers.length > keep)
    .sort((a, b) => b.workers.length - a.workers.length || (a.c.id < b.c.id ? -1 : 1))[0];
  if (!from) return;
  const site = bestColonySite(s, from.c.x, from.c.y, {
    radius: 12,
    score: (x, y) => (isCoastal(s, x, y) ? keenSiteScore(s, x, y) : -Infinity),
    perTile: 0.5,
    stay: false,
    penalty: nativeCrowding(s),
  });
  if (site.score <= 14) return;
  const settler = from.workers
    .filter((w) => w.type !== 'nativeConvert' && !w.teach)
    .sort((a, b) => UNIT_TYPES[a.type].skill - UNIT_TYPES[b.type].skill || (a.id < b.id ? -1 : 1))[0];
  if (!settler) return;
  leaveColony(s, settler.id);
  settler.state = 'sentry';
  sea[settler.id] = { x: site.x, y: site.y };
}

/**
 * A ship in a colony where a sea settler waits takes it aboard, and carries it to water next to its
 * site; there the usual landing (disembarkAll) puts it ashore and it founds the colony
 * (colonistTurn). Returns whether the ship is on that errand this turn.
 */
function carrySeaSettler(s: GameState, p: Player, ship: Unit, here: Colony | undefined): boolean {
  const sea = p.aiMemory?.seaSettlers;
  if (!sea) return false;
  const passengers = unitsAboard(s, ship);
  let settler = passengers.find((u) => sea[u.id]);
  if (!settler && !passengers.length && here && here.owner === p.id && cargoFree(s, ship) > 0) {
    settler = Object.keys(sea)
      .map((id) => s.units[id])
      .find((u) => u && u.owner === p.id && u.loc.kind === 'map' && u.loc.x === here.x && u.loc.y === here.y);
    if (!settler) return false;
    // A site taken in the meantime: the settler goes back to work.
    if (keenSiteScore(s, sea[settler.id].x, sea[settler.id].y) === -Infinity) {
      delete sea[settler.id];
      return false;
    }
    boardShip(s, settler.id, ship.id);
  }
  if (!settler) return false;
  const target = sea[settler.id];
  const pos = unitPosition(s, ship)!;
  // Next to the site (and not in a colony): the usual landing puts the settler ashore.
  if (distance(pos.x, pos.y, target.x, target.y) <= 1 && !colonyAt(s, pos.x, pos.y)) return false;
  let found: { x: number; y: number }[] | null = null;
  const spot = neighbours(s, target.x, target.y).find((n) => isWater(tileAt(s, n.x, n.y)!) && (found = findPath(s, ship, n.x, n.y)));
  if (!spot) {
    delete sea[settler.id];
    return false;
  }
  setDestination(s, ship.id, spot, found ?? undefined);
  return true;
}

function adjacentTileTowards(s: GameState, u: Unit, tx: number, ty: number): { x: number; y: number } | null {
  let best: { x: number; y: number; len: number } | null = null;
  for (const n of neighbours(s, tx, ty)) {
    const t = tileAt(s, n.x, n.y)!;
    if (isWater(t) !== isShip(u) || colonyAt(s, n.x, n.y)) continue;
    const pos = unitPosition(s, u);
    if (pos && pos.x === n.x && pos.y === n.y) return n;
    const path = findPath(s, u, n.x, n.y);
    if (path && (!best || path.length < best.len)) best = { ...n, len: path.length };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Colonies

function productValue(p: Player, c: Colony, report: ColonyReport, product: ProductId, prof: AiProfile, sol: number): number {
  switch (product) {
    case 'food':
      return report.net.food < 2 ? 10 : report.net.food < 6 ? 4 : 2;
    case 'bells':
      // Curbing bells (ai/plan.ts) spares colonies with fewer than half their people in the Sons of Liberty.
      if (turnPlan.curb && sol < 50) return 2.5 * PLAN_LIBERTY;
      return sol >= 100 ? 0.5 : 2.5 * prof.liberty;
    case 'crosses':
      return 1.2;
    case 'hammers': {
      // A wagon train that saves goods from rotting is worth a carpenter's time.
      const urgent = c.build?.kind === 'unit' && c.build.id === 'wagonTrain';
      if (!c.build) return 0.4;
      if (urgent) return 7;
      // A building is worth its score and what it makes possible: in a colony of BUILDER_POP, the
      // first carpenters (up to BUILDER_HAMMERS a turn) are valued highly enough to beat most farm
      // and craft jobs. Smaller colonies need their farmers more.
      return builds(c) && report.produced.hammers <= BUILDER_HAMMERS && report.population >= BUILDER_POP ? 7 : 3.2;
    }
    case 'lumber': {
      // The carpenters' lumber, while the woodpile is low.
      const short = report.produced.lumber < report.consumed.lumber + 3 && c.goods.lumber < 60;
      return short ? (builds(c) ? 5 : 3) : 0.8;
    }
    case 'tools':
      return turnArming ? 4 : 3;
    case 'muskets':
      return turnArming ? 7 : 3.5;
    default: {
      const g = product as GoodId;
      // Goods that will only spoil in a full warehouse are worth little.
      const room = warehouseCapacity(c) - c.goods[g] - Math.max(0, report.net[g]) * 2;
      const exported = c.buildings.customHouse > 0 && c.exports[g];
      const full = exported ? 1 : room <= 0 ? 0.1 : room <= 20 ? 0.15 : room < 50 ? 0.5 : 1;
      return Math.max(1, p.market[g].price) * full;
    }
  }
}

/** Hammers a turn up to which carpenters count as builders (productValue): about two colonists' work. */
const BUILDER_HAMMERS = 6;
/** Colonists a colony needs before carpenters count as builders. */
const BUILDER_POP = 4;

/** The colony is building a building (or, arming for independence, artillery). */
const builds = (c: Colony) => c.build?.kind === 'building' || (turnArming && c.build?.kind === 'unit' && c.build.id === 'artillery');

function jobValueFor(p: Player, c: Colony, u: Unit, job: Job, amount: number, report: ColonyReport, prof: AiProfile, sol: number): number {
  if (job.kind === 'building' && job.building === 'schoolhouse') return -1;
  const def = job.kind === 'tile' ? null : BUILDINGS[job.building];
  const product = job.kind === 'tile' ? job.good : def!.output!;
  let value = amount * productValue(p, c, report, product, prof, sol);
  if (def?.input) {
    const supply = c.goods[def.input] + report.net[def.input];
    if (supply < amount) value *= Math.max(0.05, supply / Math.max(1, amount));
    value -= Math.min(amount, Math.max(0, supply)) * productValue(p, c, report, def.input, prof, sol) * 0.4;
  }
  const expertFor = UNIT_TYPES[u.type].expertFor;
  if (expertFor && expertFor !== product) value *= 0.6;
  return value;
}

function currentValue(p: Player, c: Colony, u: Unit, report: ColonyReport, prof: AiProfile, sol: number): number {
  if (u.loc.kind !== 'colony') return -Infinity;
  const job = u.loc.job;
  if (job.kind === 'building' && job.building === 'schoolhouse') return Infinity;
  const amount = report.workers[u.id] ?? 0;
  return jobValueFor(p, c, u, job, amount, report, prof, sol);
}

/** `report`, `sol` and `occupancy` are the colony's current report, Sons of Liberty share and occupancy. */
function bestJobFor(s: GameState, p: Player, c: Colony, u: Unit, prof: AiProfile, report: ColonyReport, sol: number, occupancy: ColonyOccupancy): { job: Job; value: number } | null {
  let best: { job: Job; value: number } | null = null;
  for (const opt of jobOptions(s, c, u, occupancy)) {
    const v = jobValueFor(p, c, u, opt.job, opt.amount, report, prof, sol);
    if (!best || v > best.value) best = { job: opt.job, value: v };
  }
  return best;
}

/** Shuffles a few workers to better jobs each turn. */
function optimiseWorkers(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  let changes = 0;
  const workers = colonyWorkers(s, c).sort((a, b) => UNIT_TYPES[b.type].skill - UNIT_TYPES[a.type].skill);
  // The report, the Sons of Liberty share (the report's) and who works where only change when
  // someone changes jobs.
  let report = aiColonyReport(s, c);
  let occupancy = colonyOccupancy(s, c);
  for (const u of workers) {
    if (changes >= 3) break;
    const now = currentValue(p, c, u, report, prof, report.sonsOfLiberty);
    const best = bestJobFor(s, p, c, u, prof, report, report.sonsOfLiberty, occupancy);
    if (best && best.value > now * 1.15 + 0.5) {
      assignJob(s, u.id, c.id, best.job);
      changes++;
      report = aiColonyReport(s, c);
      occupancy = colonyOccupancy(s, c);
    }
  }
  // Never starve: move people onto food until the colony breaks even.
  for (const u of colonyWorkers(s, c)) {
    if (report.net.food >= 0) break;
    if (u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && u.loc.job.good === 'food') continue;
    const food = jobOptions(s, c, u, occupancy).filter((o) => o.job.kind === 'tile' && o.job.good === 'food').sort((a, b) => b.amount - a.amount)[0];
    if (food && food.amount > 2) {
      assignJob(s, u.id, c.id, food.job);
      report = aiColonyReport(s, c);
      occupancy = colonyOccupancy(s, c);
    }
  }
}

function buildPlan(s: GameState, p: Player, c: Colony, prof: AiProfile): BuildTarget | null {
  const threatened = Object.values(p.stance).includes('war') || Object.values(s.settlements).some((st) => distance(st.x, st.y, c.x, c.y) <= 5 && tensionOf(st, p.id) > 500);
  // Following an independence plan (ai/plan.ts), or at war with the Crown.
  const planning = turnPlan.adopted || p.independence === 'declared';
  const preparing = planning || (!!prof.independence && turnShare >= prof.independence.minShare - 20);
  // Read-only below: the workers stay where they are.
  const workers = colonyWorkers(s, c);
  const pop = workers.length;
  const staffed = (k: BuildingKind) => workers.filter((w) => w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === k).length;
  const plan: BuildTarget[] = [];
  const b = (id: BuildingKind) => plan.push({ kind: 'building', id });
  // An outpost without soldiers holds up expansion until it has a stockade (expansionCheck).
  const outpost = !armedAt(s, p, c.x, c.y).length && outposts(ownColonies(s, p), prof).includes(c);
  const walls = c.buildings.stockade;
  // The fortress (third level) is for colonies of eight under threat. A stockade comes first where
  // there is a threat or a big garrison, and for a nation preparing independence; the fort too,
  // except that a plan builds it later in colonies of five (after the armory and the press).
  if (walls < 2 ? threatened || prof.garrison > 1 || outpost || (preparing && (!planning || walls === 0)) : walls === 2 && pop >= 8 && (threatened || preparing)) b('stockade');
  // Goods about to rot: more storage, and a wagon train to carry them to a port.
  const overflow = overflowSoon(s, c, 6);
  if (wantsWagon(s, p, c)) plan.push({ kind: 'unit', id: 'wagonTrain' });
  b('docks');
  if (overflow > 0) b('warehouse');
  if (prof.liberty > 1 || planning) b('printingPress');
  b('carpenter');
  b('warehouse');
  if (militant(prof) || preparing) b('armory');
  // An independence plan: forts in colonies of five, a newspaper, and room to store muskets and horses.
  if (planning && pop >= 5) b('stockade');
  if (planning && pop >= 4 && c.buildings.printingPress > 0) b('printingPress');
  if (planning) b('warehouse');
  // Artillery defends a colony best of all against the Royal Expeditionary Force.
  if (turnArming && c.buildings.armory > 0 && c.buildings.stockade > 0) plan.push({ kind: 'unit', id: 'artillery' });
  if (prof.schools && pop >= 4) b('schoolhouse');
  // Shops for the goods the colony makes: someone at work there, and the people a shop needs.
  for (const k of ['weaver', 'distiller', 'tobacconist', 'furTrader', 'blacksmith'] as BuildingKind[]) if (staffed(k) >= (pop >= 6 ? 1 : 2)) b(k);
  b('church');
  b('customHouse');
  b('printingPress');
  if (walls < 2) b('stockade');
  b('warehouse');
  const ship = shipToBuild(s, p, c, prof);
  if (ship) plan.push(ship);
  if (militant(prof) && c.buildings.armory > 0) plan.push({ kind: 'unit', id: 'artillery' });
  if (pop >= 8) b('docks');
  return plan.find((t) => canBuild(s, c, t)) ?? null;
}

function manageColony(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  optimiseWorkers(s, p, c, prof);
  const plan = buildPlan(s, p, c, prof);
  const sameTarget = (a: BuildTarget | null, b: BuildTarget | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;
  // Keep a build that already has progress unless it can no longer be made.
  // (Units are repeated otherwise, so a finished one gives way to the plan at once.)
  if (!c.build || !canBuild(s, c, c.build) || ((c.hammers === 0 || c.build.kind === 'unit') && !sameTarget(c.build, plan))) setBuild(s, c.id, plan);
  if (c.build) {
    const price = hurryPrice(s, c);
    const cost = buildTargetCost(c.build, c);
    // A wagon train to save goods from rotting is worth buying outright.
    if (c.build.kind === 'unit' && c.build.id === 'wagonTrain' && price > 0 && price <= 1000 && p.gold > prof.reserve + price + 200) {
      hurryBuild(s, c.id);
      return manageRest(s, p, c, prof);
    }
    // A building is hurried once a third is built, or outright in a colony of BUILDER_POP with
    // gold to spare: idle gold scores little, a building more. While arming, gold goes to
    // defences first.
    // Walls, wanted for independence, are bought outright with the gold above the reserve.
    const defence = c.build.kind === 'building' ? c.build.id === 'stockade' || c.build.id === 'armory' : c.build.id === 'artillery';
    const spare = p.gold - prof.reserve - turnSaving - (turnArming && !defence ? 2500 : 0);
    const started = aiColonyReport(s, c).produced.hammers > 0 && c.hammers >= cost.hammers / 3;
    const walls = turnArming && c.build.kind === 'building' && c.build.id === 'stockade';
    const outright = c.build.kind === 'building' && colonyWorkers(s, c).length >= BUILDER_POP && spare > price * 3;
    if (price > 0 && price < 1500 && (started || walls ? spare > price * 1.5 : outright)) {
      hurryBuild(s, c.id);
    }
  }
  manageRest(s, p, c, prof);
}

function manageRest(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  if (c.buildings.customHouse) for (const g of aiGoodsOf(s).export) c.exports[g] = true;
  acquireLand(s, p, c, prof);
  raiseMilitia(s, p, c, prof);
  equipPioneer(s, p, c, c.build ? buildTargetCost(c.build, c).tools : 0);
  if (prof.schools) staffSchool(s, c);
}

/** Puts an expert in the school when there are unskilled colonists to teach. */
function staffSchool(s: GameState, c: Colony): void {
  const level = c.buildings.schoolhouse;
  if (!level) return;
  const workers = colonyWorkers(s, c);
  const teaching = workers.some((w) => w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === 'schoolhouse');
  const students = workers.filter((w) => UNIT_TYPES[w.type].skill <= 0 && w.type !== 'nativeConvert').length;
  if (teaching || students < 2) return;
  const teacher = workers
    .filter((w) => (UNIT_TYPES[w.type].teach ?? 99) <= level)
    .sort((a, b) => (UNIT_TYPES[a.type].teach ?? 0) - (UNIT_TYPES[b.type].teach ?? 0))[0];
  if (teacher && canTeachHere(s, c, teacher, teacher.id)) assignJob(s, teacher.id, c.id, { kind: 'building', building: 'schoolhouse' });
}

/** Arms a colonist with stored muskets when the garrison is short: far cheaper than buying soldiers. */
function raiseMilitia(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  mountTroops(s, p, c);
  const workers = colonyWorkers(s, c);
  if (workers.length < 3 || c.goods.muskets < 50) return;
  // Before a declaration, muskets in store are as good as militia (they arm a colonist, or re-arm a
  // beaten soldier, when the war comes: ai/royal.ts), so colonists stay at work beyond
  // PEACE_MILITIA armed units a colony. During the war the muskets re-arm beaten soldiers
  // (Continentals among them), so colonists take them up only while the colony has fewer than
  // WAR_MILITIA armed units.
  const garrison = p.independence === 'declared' ? WAR_MILITIA : turnArming ? Math.min(garrisonFor(p, prof), PEACE_MILITIA) : garrisonFor(p, prof);
  // Arming for independence, a port with the muskets also raises troops for colonies still short
  // of their garrison (they march there); otherwise only for its own garrison.
  // So does a nation whose expansion waits for a defender for an outpost.
  const short = (turnArming || turnExpansion === 'defence') && p.independence !== 'declared' && countOwned(s, p, isArmed) < ownColonies(s, p).length * garrison;
  if (armedAt(s, p, c.x, c.y).length >= garrison && !short) return;
  // Arming, experts take up muskets too once no unskilled colonist is left (veterans first).
  const recruit = workers
    .filter((w) => (UNIT_TYPES[w.type].skill <= 0 || ((turnArming || turnExpansion === 'defence') && (w.type === 'veteranSoldier' || workers.length >= 4))) && w.type !== 'nativeConvert')
    .sort((a, b) => Number(b.type === 'veteranSoldier') - Number(a.type === 'veteranSoldier') || UNIT_TYPES[a.type].skill - UNIT_TYPES[b.type].skill)[0];
  if (!recruit) return;
  leaveColony(s, recruit.id);
  equipInColony(s, recruit.id, 'soldier');
  recruit.state = 'fortified';
  mountTroops(s, p, c);
}

/** Armed units a colony raises from its colonists while arming for independence, before the war (raiseMilitia). */
const PEACE_MILITIA = 2;
/** Armed units below which colonists take up the muskets in store during the war (raiseMilitia). */
const WAR_MILITIA = 2;

/**
 * Arming for independence or at war with the Crown, soldiers in a colony with horses in store
 * mount up: a dragoon defends half again as well, and loses its horses before its muskets. A
 * couple of horses stay behind to breed.
 */
function mountTroops(s: GameState, p: Player, c: Colony): void {
  if (!turnArming && p.independence !== 'declared') return;
  // (The horses first: without them no one mounts, and the armed units need no looking up.)
  if (c.goods.horses < 52) return;
  for (const u of armedAt(s, p, c.x, c.y)) {
    if (c.goods.horses < 52) return;
    if (u.role !== 'soldier' || UNIT_TYPES[u.type].kind !== 'colonist') continue;
    safely(() => equipInColony(s, u.id, 'dragoon'));
    u.state = 'fortified';
  }
}

/** Buys (or takes) good native land next to a growing colony. */
function acquireLand(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  if (prof.land === 'avoid') return;
  // Native land next to the colony before its people: most colonies have none left to acquire.
  if (!neighbours(s, c.x, c.y).some((n) => nativeLandOwner(s, n.x, n.y)) || colonyWorkers(s, c).length < 3) return;
  for (const n of neighbours(s, c.x, c.y)) {
    const st = nativeLandOwner(s, n.x, n.y);
    if (!st) continue;
    const tile = tileAt(s, n.x, n.y)!;
    const def = tile.f ? 'forest' : tile.t;
    if (def === 'arctic' || def === 'mountains') continue;
    if (prof.land === 'take' && tensionOf(st, p.id) < 600) {
      takeLand(s, p.id, n.x, n.y);
      return;
    }
    const price = landPrice(s, p.id, n.x, n.y);
    if (p.gold > prof.reserve + turnSaving + price) {
      buyLand(s, p.id, n.x, n.y);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Units

function unitTurn(s: GameState, p: Player, u: Unit, prof: AiProfile): void {
  // The intervention force fights on its own (rebellion.ts).
  if (u.loc.kind !== 'map' || u.work || u.repair || u.route || u.ally) return;
  const def = UNIT_TYPES[u.type];
  if (def.kind === 'ship') return shipTurn(s, p, u, prof);
  if (def.kind === 'treasure') return treasureTurn(s, p, u);
  if (def.kind === 'artillery') return soldierTurn(s, p, u, prof);
  if (def.kind !== 'colonist') return;
  // Before the first colony exists, whoever lands first founds it; settlers stranded where they
  // cannot (another nation's colony took their island) board a ship that comes for them.
  if (!ownColonies(s, p).length && u.role !== 'scout') return boardRescue(s, p, u) ? undefined : colonistTurn(s, p, u, prof);
  if (u.role === 'soldier' || u.role === 'dragoon') return soldierTurn(s, p, u, prof);
  if (u.role === 'scout') return scoutTurn(s, p, u);
  if (u.role === 'pioneer') return pioneerTurn(s, p, u);
  if (u.role === 'missionary') return missionaryTurn(s, p, u, prof);
  colonistTurn(s, p, u, prof);
}

function treasureTurn(s: GameState, p: Player, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const here = colonyAt(s, pos.x, pos.y);
  if (here && here.owner === p.id && isCoastal(s, here.x, here.y) && p.independence === 'none') {
    cashTreasure(s, u.id);
    return;
  }
  const port = nearestColony(s, p, pos.x, pos.y, true);
  if (port) setDestination(s, u.id, { x: port.x, y: port.y });
}

function soldierTurn(s: GameState, p: Player, u: Unit, prof: AiProfile): void {
  // Damaged artillery is mended where it can be, before it goes anywhere.
  if (u.type === 'damagedArtillery') safely(() => repairArtillery(s, p.id, u.id));
  if (p.independence === 'declared') return warTurn(s, p, u);
  if (aiFight(s, p, u)) return;
  const pos = unitPosition(s, u)!;
  const colonies = ownColonies(s, p);
  const here = colonyAt(s, pos.x, pos.y);
  // Getting ready for independence, troops in a colony with more defence than it needs to hold
  // out alone (ai/royal.ts, powerNeeded) march to the nearest colony with too little.
  if (turnArming && here && here.owner === p.id) {
    const need = powerNeeded(s, p);
    // Each colony's defence is worked out only when needed (most garrisons have nothing to spare).
    const surplus = (c: Colony) => rebelColonyDefence(s, p, c) - need;
    const thin = surplus(here) >= REBEL_DEFENCE
      ? colonies
          .filter((c) => c.id !== here.id && distance(c.x, c.y, pos.x, pos.y) <= REINFORCE_RANGE && colonyWorkers(s, c).length > 0 && surplus(c) < 0)
          .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0]
      : undefined;
    if (thin && goTo(s, u, thin.x, thin.y)) {
      return;
    }
  }
  // Fill garrisons first, nearest colony short of troops.
  const need = garrisonFor(p, prof);
  if (here && here.owner === p.id && armedAt(s, p, here.x, here.y).filter((o) => o.id !== u.id).length < need) {
    u.state = 'fortified';
    return;
  }
  const short = colonies
    .filter((c) => armedAt(s, p, c.x, c.y).length < need)
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0];
  // Spare troops march on a war target when there is one.
  const target = p.aiMemory?.warTarget ? s.colonies[p.aiMemory.warTarget] : undefined;
  if (target && target.owner !== p.id && p.stance[target.owner] === 'war' && !short) {
    if (distance(target.x, target.y, pos.x, pos.y) === 1) {
      attack(s, u.id, { colonyId: target.id });
      return;
    }
    const step = adjacentTileTowards(s, u, target.x, target.y);
    if (step) {
      setDestination(s, u.id, step);
      return;
    }
  }
  if (short) {
    setDestination(s, u.id, { x: short.x, y: short.y });
    return;
  }
  // Peaceful nations put surplus soldiers back to work.
  if (prof.aggression === 0 && UNIT_TYPES[u.type].kind === 'colonist' && UNIT_TYPES[u.type].skill <= 0 && here && here.owner === p.id && !Object.values(p.stance).includes('war')) {
    if (!preparingIndependence(prof)) {
      assignJob(s, u.id, here.id);
      return;
    }
  }
  if (here && here.owner === p.id) u.state = 'fortified';
  else if (colonies.length) {
    const home = nearestColony(s, p, pos.x, pos.y);
    if (home) setDestination(s, u.id, { x: home.x, y: home.y });
  }
}

/**
 * A soldier, dragoon or artillery in the War of Independence. The royal troops land next to a
 * coastal colony and attack the nearest one, so troops hold their colonies: they strike at royal
 * troops in the open next to them (sortie), march from a colony nobody threatens to the most
 * threatened one nearby (reinforce), and otherwise stay fortified. Troops in the open go to the
 * nearest colony.
 */
function warTurn(s: GameState, p: Player, u: Unit): void {
  if (sortie(s, p, u) || reinforce(s, p, u)) return;
  const pos = unitPosition(s, u)!;
  const here = colonyAt(s, pos.x, pos.y);
  if (here && here.owner === p.id) {
    // Orders given before the war (a march to another garrison) are dropped: troops hold.
    delete u.dest;
    u.state = 'fortified';
    return;
  }
  if (aiFight(s, p, u)) return;
  const home = nearestColony(s, p, pos.x, pos.y);
  if (home) setDestination(s, u.id, { x: home.x, y: home.y });
}

/** Royal land units within `range` tiles of a colony (the War of Independence). */
function royalsNear(s: GameState, p: Player, c: Colony, range = 2): number {
  let n = 0;
  forEachUnitNear(s, c.x, c.y, range, (o) => {
    if (o.owner === 'crown' && o.against === p.id && !isShip(o)) n++;
  });
  return n;
}

/**
 * The War of Independence: a soldier, dragoon or artillery in a colony strikes at royal troops
 * next to it in the open when the odds are even (artillery: a quarter better). A soldier that
 * loses there re-arms from the warehouse and a dragoon takes fresh horses (combat.ts), so with
 * muskets or horses in store and another defender left behind, it strikes at somewhat worse
 * odds (SORTIE_ODDS).
 */
function sortie(s: GameState, p: Player, u: Unit): boolean {
  const pos = unitPosition(s, u);
  if (!pos || u.moves <= 0) return false;
  const here = colonyAt(s, pos.x, pos.y);
  const artillery = UNIT_TYPES[u.type].kind === 'artillery';
  let margin = u.type === 'damagedArtillery' ? 1.5 : artillery ? 1.25 : 1;
  if (here && here.owner === p.id && !artillery && armedAt(s, p, here.x, here.y).length > 1) {
    const stored = u.role === 'dragoon' ? here.goods.horses >= 50 : here.goods.muskets >= 50;
    if (stored) margin = SORTIE_ODDS;
  }
  let best: { target: Unit; odds: number } | null = null;
  for (const n of neighbours(s, pos.x, pos.y)) {
    if (colonyAt(s, n.x, n.y)) continue;
    const enemies = unitsAt(s, n.x, n.y).filter((o) => o.owner === 'crown' && !isShip(o));
    if (!enemies.length) continue;
    const defender = enemies.reduce((a, b) => (defencePower(s, b) > defencePower(s, a) ? b : a));
    const odds = offencePower(s, u, defender) / defencePower(s, defender);
    if (odds >= margin && (!best || odds > best.odds)) best = { target: defender, odds };
  }
  if (!best) return false;
  attack(s, u.id, { unitId: best.target.id });
  return true;
}

/** Odds at which a soldier or dragoon with a re-arm in store strikes from its colony (sortie). */
const SORTIE_ODDS = 0.8;

/**
 * The War of Independence: troops in a colony that no royal troops threaten march to the most
 * threatened colony within REINFORCE_RANGE tiles, leaving behind the defence the colony needs to
 * hold out itself (ai/royal.ts, powerNeeded; twice that on the coast, where the King's next troops
 * land next to the weakest colony, which one stripped of its garrison would become).
 */
function reinforce(s: GameState, p: Player, u: Unit): boolean {
  const pos = unitPosition(s, u);
  if (!pos || u.moves <= 0) return false;
  const here = colonyAt(s, pos.x, pos.y);
  if (!here || here.owner !== p.id || royalsNear(s, p, here, 3) > 0) return false;
  const defence = rebelColonyDefence(s, p, here);
  const keep = powerNeeded(s, p) * (isCoastal(s, here.x, here.y) ? 2 : 1);
  if (defence - keep < REBEL_DEFENCE || armedAt(s, p, here.x, here.y).length <= 1) return false;
  const target = ownColonies(s, p)
    .filter((c) => c.id !== here.id && distance(c.x, c.y, pos.x, pos.y) <= REINFORCE_RANGE)
    .map((c) => ({ c, threat: royalsNear(s, p, c) - armedAt(s, p, c.x, c.y).length }))
    .filter((e) => e.threat > 0)
    .sort((a, b) => b.threat - a.threat || distance(a.c.x, a.c.y, pos.x, pos.y) - distance(b.c.x, b.c.y, pos.x, pos.y))[0];
  return !!target && goTo(s, u, target.c.x, target.c.y);
}

/** Tiles troops march to help a threatened colony in the War of Independence. */
const REINFORCE_RANGE = 12;

/** Scouts chase rumours, then chiefs, then the edge of the known world. */
function scoutTurn(s: GameState, p: Player, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const w = s.map.width;
  const known = (x: number, y: number) => p.explored[y * w + x] === 1;
  for (const n of neighbours(s, pos.x, pos.y)) {
    const st = Object.values(s.settlements).find((o) => o.x === n.x && o.y === n.y);
    if (st && !st.visited.includes(p.id) && tensionOf(st, p.id) < 500 && u.moves > 0) {
      speakToChief(s, u.id, st.id);
      return;
    }
  }
  const targets: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < s.map.height; y++) {
    for (let x = 0; x < w; x++) {
      if (!known(x, y)) continue;
      const t = s.map.tiles[y * w + x];
      if (t.lcr) targets.push({ x, y, d: distance(x, y, pos.x, pos.y) });
    }
  }
  for (const st of Object.values(s.settlements)) {
    if (known(st.x, st.y) && !st.visited.includes(p.id) && tensionOf(st, p.id) < 500) targets.push({ x: st.x, y: st.y, d: distance(st.x, st.y, pos.x, pos.y) + 2 });
  }
  targets.sort((a, b) => a.d - b.d);
  for (const t of targets.slice(0, 6)) {
    const settlement = Object.values(s.settlements).some((st) => st.x === t.x && st.y === t.y);
    const goal = settlement ? adjacentTileTowards(s, u, t.x, t.y) : findPath(s, u, t.x, t.y) ? t : null;
    if (goal) {
      setDestination(s, u.id, { x: goal.x, y: goal.y });
      return;
    }
  }
  // Frontier: a known land tile next to unknown land.
  let frontier: { x: number; y: number; d: number } | null = null;
  for (let y = 1; y < s.map.height - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!known(x, y) || isWater(s.map.tiles[y * w + x])) continue;
      if (!neighbours(s, x, y).some((n) => !known(n.x, n.y))) continue;
      const d = distance(x, y, pos.x, pos.y);
      if (d > 0 && (!frontier || d < frontier.d)) frontier = { x, y, d };
    }
  }
  if (frontier && goTo(s, u, frontier.x, frontier.y)) {
    return;
  }
  // Nothing left to explore: settle down.
  const home = nearestColony(s, p, pos.x, pos.y);
  if (home && pos.x === home.x && pos.y === home.y) assignJob(s, u.id, home.id);
  else if (home) setDestination(s, u.id, { x: home.x, y: home.y });
}

function pioneerTurn(s: GameState, p: Player, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const colonies = ownColonies(s, p).sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y));
  for (const c of colonies.slice(0, 4)) {
    const spots = [{ x: c.x, y: c.y, good: 'food' as GoodId }, ...colonyWorkers(s, c).flatMap((w) => (w.loc.kind === 'colony' && w.loc.job.kind === 'tile' ? [w.loc.job] : []))];
    for (const t of spots) {
      const tile = tileAt(s, t.x, t.y)!;
      if (isWater(tile)) continue;
      const farm = aiGoodsOf(s).farm.includes(t.good);
      const kind = farm ? (tile.f ? 'clear' : tile.p ? null : 'plow') : tile.r ? null : 'road';
      if (!kind || (kind === 'plow' && (tile.t === 'hills' || tile.t === 'mountains'))) continue;
      if (pos.x === t.x && pos.y === t.y) {
        if (canImprove(s, u, kind) === null) {
          startImprovement(s, u.id, kind);
          return;
        }
        continue;
      }
      if (goTo(s, u, t.x, t.y)) {
        const now = unitPosition(s, u)!;
        if (now.x === t.x && now.y === t.y && u.moves > 0 && canImprove(s, u, kind) === null) startImprovement(s, u.id, kind);
        return;
      }
    }
  }
  // Nothing to plow or clear: lay roads, and only then join the nearest colony.
  if (buildRoads(s, p, u)) return;
  const home = colonies[0];
  if (home && pos.x === home.x && pos.y === home.y) assignJob(s, u.id, home.id);
  else if (home) setDestination(s, u.id, { x: home.x, y: home.y });
}

function missionaryTurn(s: GameState, p: Player, u: Unit, prof: AiProfile): void {
  const pos = unitPosition(s, u)!;
  // Combative first stirs a nearby tribe against an enemy, now and then (ai/natives.ts).
  for (const n of neighbours(s, pos.x, pos.y)) {
    const near = settlementAt(s, n.x, n.y);
    if (near && u.moves > 0 && maybeIncite(s, p, u, near, prof)) return;
  }
  const st = Object.values(s.settlements)
    .filter((o) => !o.mission && tensionOf(o, p.id) < 500 && s.tribes.find((t) => t.id === o.tribe)?.stance[p.id] !== 'war')
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0];
  if (!st || !prof.missions) return;
  if (distance(st.x, st.y, pos.x, pos.y) === 1) {
    establishMission(s, u.id, st.id);
    return;
  }
  const step = adjacentTileTowards(s, u, st.x, st.y);
  if (step) setDestination(s, u.id, step);
}

function colonistTurn(s: GameState, p: Player, u: Unit, prof: AiProfile): void {
  const pos = unitPosition(s, u)!;
  const here = colonyAt(s, pos.x, pos.y);
  // A settler waiting on the quay for a ship to another island (sendSeaSettler); once ashore, it founds as any settler.
  const sea = p.aiMemory?.seaSettlers;
  if (sea?.[u.id]) {
    if (here) return;
    delete sea[u.id];
    markSettler(p, u);
  }
  // Unskilled colonists learn a trade from the natives first.
  if (prof.learnFromNatives && UNIT_TYPES[u.type].skill <= 0 && u.type !== 'pettyCriminal' && u.type !== 'nativeConvert') {
    const teacher = Object.values(s.settlements)
      .filter((st) => st.skill && tensionOf(st, p.id) < 400 && distance(st.x, st.y, pos.x, pos.y) <= 8 && p.explored[st.y * s.map.width + st.x])
      .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0];
    if (teacher) {
      if (distance(teacher.x, teacher.y, pos.x, pos.y) === 1 && u.moves > 0) {
        learnSkill(s, u.id, teacher.id);
        return;
      }
      const step = adjacentTileTowards(s, u, teacher.x, teacher.y);
      if (step) {
        setDestination(s, u.id, step);
        return;
      }
    }
  }
  // A missionary for an unconverted village, if a church can bless one.
  if (prof.missions && here && here.owner === p.id && here.buildings.church >= 2 && u.type !== 'nativeConvert') {
    const busy = Object.values(s.units).some((o) => o.owner === p.id && o.role === 'missionary');
    const open = Object.values(s.settlements).some((st) => !st.mission && distance(st.x, st.y, here.x, here.y) <= 10);
    if (!busy && open && (u.type === 'pettyCriminal' || u.type === 'indenturedServant' || u.type === 'firebrandPreacher')) {
      equipInColony(s, u.id, 'missionary');
      return;
    }
  }
  const colonies = ownColonies(s, p);
  let reachable: Colony[] | undefined;
  const reachableColonies = () => (reachable ??= colonies.filter((c) => findPath(s, u, c.x, c.y)));
  // A new colony is an investment: settlers go out (a few at a time) once the colonies are
  // established (expansionCheck); one on its way only needs the charter in hand and the pace of
  // founding. A colonist with no colony to go to founds one anyway.
  const sent = colonies.length ? settlersOnTheWay(s, p) : [];
  const charterInHand = charterCost(s, p.id) <= p.gold;
  const paced = !colonies.length || s.turn - Math.max(...colonies.map((c) => c.founded)) >= prof.expansion.everyTurns;
  const expand =
    colonies.length < prof.colonyTarget(s.turn) &&
    (!here || colonyWorkers(s, here).length >= 3) &&
    (sent.some((o) => o.id === u.id)
      ? charterInHand && paced
      : (sent.length < prof.expansion.settlers && expansionReady(s, p, prof, colonies)) || (!here && charterInHand && !reachableColonies().length));
  if (expand) {
    const best = bestColonySite(s, pos.x, pos.y, {
      radius: here ? 8 : 5,
      // The first colony is placed as it always was; later ones chase the best land, away from other colonies.
      score: colonies.length ? (x, y) => keenSiteScore(s, x, y) : (x, y) => siteScore(s, x, y),
      perTile: 1.1,
      stay: !here,
      // Later colonies only where the colonist can walk (an unreachable site would leave it idle).
      overLand: colonies.length > 0,
      // Keep a little distance from the natives so tension stays low.
      penalty: nativeCrowding(s),
    });
    if (best.score > 14) {
      if (best.x === pos.x && best.y === pos.y) {
        foundColony(s, u.id);
        return;
      }
      if (goTo(s, u, best.x, best.y)) {
        if (colonies.length) markSettler(p, u);
        const now = unitPosition(s, u)!;
        if (now.x === best.x && now.y === best.y && u.moves > 0) foundColony(s, u.id);
        return;
      }
    }
  }
  // Join the colony that can use the colonist best.
  if (here && here.owner === p.id) {
    assignJob(s, u.id, here.id);
    return;
  }
  // The nearest reachable colony, counting food to spare as nearness. Ranked first (each colony's
  // report once), so that only the colonies up to the first reachable one need a path.
  const ranked = (reachable ?? colonies)
    .map((c) => ({ c, near: distance(c.x, c.y, pos.x, pos.y) - aiColonyReport(s, c).net.food / 2 }))
    .sort((a, b) => a.near - b.near);
  let found: { x: number; y: number }[] | null | undefined;
  const home = reachable ? ranked[0]?.c : ranked.find((e) => (found = findPath(s, u, e.c.x, e.c.y)))?.c;
  if (home) {
    setDestination(s, u.id, { x: home.x, y: home.y }, found ?? undefined);
    const now = unitPosition(s, u)!;
    if (now.x === home.x && now.y === home.y) assignJob(s, u.id, home.id);
  } else if (siteScore(s, pos.x, pos.y) > 0) {
    foundColony(s, u.id);
  }
}

// ---------------------------------------------------------------------------
// Ships and trade

function shipTurn(s: GameState, p: Player, ship: Unit, prof: AiProfile): void {
  const def = UNIT_TYPES[ship.type];
  if (def.offence > 0 && aiFight(s, p, ship)) return;
  if (ship.type === 'privateer' && prof.piracy && !unitsAboard(s, ship).length && privateer(s, p, ship)) return;
  const pos = unitPosition(s, ship)!;
  const here = colonyAt(s, pos.x, pos.y);
  const mine = here && here.owner === p.id ? here : undefined;
  if (carrySeaSettler(s, p, ship, mine)) return;
  const passengers = unitsAboard(s, ship);

  if (passengers.length) {
    if (disembarkAll(s, ship)) return;
    if (!ship.dest) {
      const target = landingSpot(s, p, ship);
      if (target) setDestination(s, ship.id, target);
    }
    disembarkAll(s, ship);
    return;
  }
  if (fetchStranded(s, p, ship)) return;
  // Goods boycotted at home and with no partner port to sell them in stay in the colonies.
  const outlet = favouredPartners(s, p.id).length > 0;
  const shippable = (g: GoodId) => outlet || !p.boycotts[g];
  // Deliver supplies bought in Europe.
  if (mine) {
    for (const g of aiGoodsOf(s).export) {
      const n = shippable(g) ? 0 : Math.min(ship.cargo?.[g] ?? 0, Math.max(0, warehouseCapacity(mine) - mine.goods[g]));
      if (n > 0) {
        ship.cargo![g]! -= n;
        mine.goods[g] += n;
      }
    }
    // Only what the warehouse holds: the rest goes on to a port with room, rather than spoil.
    for (const g of SUPPLIES) {
      const n = Math.min(ship.cargo?.[g] ?? 0, Math.max(0, warehouseCapacity(mine) - mine.goods[g]));
      if (n > 0) {
        ship.cargo![g]! -= n;
        mine.goods[g] += n;
      }
    }
    for (const g of aiGoodsOf(s).export) {
      if (shippable(g) && mine.goods[g] >= 50 && cargoFree(s, ship) + (ship.cargo?.[g] ? 1 : 0) > 0) {
        const amount = Math.min(mine.goods[g], cargoRoomFor(s, ship, g));
        if (amount <= 0) continue;
        mine.goods[g] -= amount;
        ship.cargo = ship.cargo ?? {};
        ship.cargo[g] = (ship.cargo[g] ?? 0) + amount;
      }
    }
  }
  const carrying = aiGoodsOf(s).export.reduce((n, g) => n + (ship.cargo?.[g] ?? 0), 0);
  const supplies = SUPPLIES.reduce((n, g) => n + (ship.cargo?.[g] ?? 0), 0);
  if (supplies > 0) {
    const room = (c: Colony) => SUPPLIES.some((g) => (ship.cargo?.[g] ?? 0) > 0 && c.goods[g] < warehouseCapacity(c) - 20);
    // Arming for independence, muskets and horses go first to the coastal colonies least able to hold out (ai/royal.ts).
    const weak = turnArming ? new Set(weakColonies(s, p).map((c) => c.id)) : new Set<string>();
    const port = ownColonies(s, p)
      .filter((c) => c.id !== mine?.id && isCoastal(s, c.x, c.y) && room(c))
      .sort((a, b) => Number(weak.has(b.id)) - Number(weak.has(a.id)) || distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0];
    if (port) {
      setDestination(s, ship.id, { x: port.x, y: port.y });
      return;
    }
    // Nowhere has room: keep the supplies aboard and trade as usual.
  }
  // Pick up from the colony with the most goods waiting, unless the hold is mostly full.
  const capacity = UNIT_TYPES[ship.type].cargo * 100;
  if (carrying < capacity * 0.5) {
    const pickup = ownColonies(s, p)
      .filter((c) => isCoastal(s, c.x, c.y) && c.id !== mine?.id)
      .map((c) => ({ c, goods: aiGoodsOf(s).export.reduce((n, g) => n + (c.goods[g] >= 50 && shippable(g) ? c.goods[g] : 0), 0) }))
      .filter((r) => r.goods >= 100)
      .sort((a, b) => b.goods - a.goods)[0];
    if (pickup && goTo(s, ship, pickup.c.x, pickup.c.y)) {
      return;
    }
  }
  const docks = Object.values(s.units).some((u) => u.owner === p.id && u.loc.kind === 'europe' && !isShip(u));
  if (p.independence === 'none' && (carrying > 0 || docks || p.gold > prof.reserve + recruitPrice(s, p))) {
    // Home, or a Favoured Nation partner's port where the cargo fetches more (foreign.ts).
    if (!ship.dest) setDestination(s, ship.id, { europe: true, port: choosePort(s, p, ship) });
    return;
  }
  if (!mine) {
    const port = nearestColony(s, p, pos.x, pos.y, true);
    if (port) setDestination(s, ship.id, { x: port.x, y: port.y });
  }
}

/** Privateers hunt foreign merchant ships; their attacks start no wars. */
function privateer(s: GameState, p: Player, ship: Unit): boolean {
  const pos = unitPosition(s, ship)!;
  // Never a Favoured Nation's ships, nor a trade partner's.
  const prey = (o: Unit) => o.owner !== p.id && isShip(o) && UNIT_TYPES[o.type].offence === 0 && o.owner !== 'crown' && !hasTradeAgreement(s, p.id, o.owner);
  for (const n of neighbours(s, pos.x, pos.y)) {
    const target = unitsAt(s, n.x, n.y).find(prey);
    if (target && ship.moves > 0 && offencePower(s, ship) > defencePower(s, target)) {
      attack(s, ship.id, { unitId: target.id });
      return true;
    }
  }
  const near = Object.values(s.units)
    .filter((o) => prey(o) && o.loc.kind === 'map' && distance(o.loc.x, o.loc.y, pos.x, pos.y) <= 8)
    .sort((a, b) => distance((a.loc as { x: number }).x, (a.loc as { y: number }).y, pos.x, pos.y) - distance((b.loc as { x: number }).x, (b.loc as { y: number }).y, pos.x, pos.y))[0];
  if (near && near.loc.kind === 'map') {
    const step = adjacentTileTowards(s, ship, near.loc.x, near.loc.y);
    if (step) {
      setDestination(s, ship.id, step);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Europe

function countOwned(s: GameState, p: Player, test: (u: Unit) => boolean): number {
  return countUnits(s, p, test);
}

/** Muskets a colony stocks while arming for independence, before veterans and artillery are bought. */
const MUSKETS_PER_COLONY = 100;

function europe(s: GameState, p: Player, prof: AiProfile): void {
  if (p.independence !== 'none') return;
  const inEurope = () => Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && isShip(u) && !u.repair && !u.route);
  const ships = inEurope();
  // Ships on routes that call at Europe pick up colonists from the docks as they pass.
  // Only routes calling at the home port: colonists board only there.
  const liners = countOwned(s, p, (u) => isShip(u) && !!u.route && !!s.routes?.[u.route.id]?.stops.some((st) => st.passengers && stopPort(s, p.id, st) === p.id));
  if (!ships.length && !liners) return;
  // Sell everything but supplies, in whichever port the ship is in; goods bought for a triangle
  // trade wait for the port they were bought for (foreign.ts).
  for (const ship of ships) {
    for (const g of goodsOf(s)) {
      if ((ship.cargo?.[g] ?? 0) <= 0 || SUPPLIES.includes(g) || !sellHere(s, p, ship, g)) continue;
      safely(() => {
        sellGoods(s, ship.id, g, ship.cargo![g]!);
        noteSale(p, ship, g);
      });
    }
  }

  const colonies = ownColonies(s, p);
  const docks = () => Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && !isShip(u));
  // Colonists board only in the home port, so only ships there count as room for them. A ship in
  // a partner's port lets two wait on the docks for the next ship home (port choice brings it).
  const abroad = ships.some((sh) => !inHomePort(sh)) ? 2 : 0;
  const room = () => ships.filter((sh) => UNIT_TYPES[sh.type].offence === 0 && inHomePort(sh)).reduce((n, sh) => n + cargoFree(s, sh), 0) + liners * 2 + abroad - docks().length;
  // The next colony charter is saved for, on top of the reserve.
  const afford = (price: number) => p.gold >= prof.reserve + turnSaving + price;
  const buyUnit = (type: UnitTypeId) => {
    if (room() > 0 && afford(equippedPrice(s, p, type))) safely(() => trainEquipped(s, p, type));
  };

  // More ships once trade outgrows the fleet, before anything else: spoiling goods cost more than a ship.
  buyShips(s, p, prof);
  if (prof.scouting && s.turn < aiTurn(s, 100) && !countOwned(s, p, (u) => u.role === 'scout')) buyUnit('seasonedScout');
  // A worn-out hardy pioneer is given fresh tools in a colony rather than replaced.
  if (!countOwned(s, p, (u) => u.role === 'pioneer' || u.type === 'hardyPioneer') && colonies.length) buyUnit('hardyPioneer');
  const statesmen = countOwned(s, p, (u) => u.type === 'elderStatesman');
  // Under an independence plan, statesmen only while the rebels still need to grow (ai/plan.ts).
  if (prof.liberty > 1.3 && s.turn > aiTurn(s, 30) && statesmen < colonies.length && (!turnPlan.adopted || turnPlan.boost)) buyUnit('elderStatesman');
  const armed = countOwned(s, p, isArmed);
  // A nation getting ready for independence also buys veterans and artillery against the Royal
  // Expeditionary Force, once the colonies hold the muskets they want: 50 muskets defend about as
  // well as a veteran or a gun for a fraction of the price (ai/royal.ts).
  const stocked = colonies.reduce((n, c) => n + c.goods.muskets, 0) >= colonies.length * MUSKETS_PER_COLONY;
  const arming = turnArming && stocked;
  if (armed < colonies.length * garrisonFor(p, prof) && (armed === 0 || (militant(prof) && p.gold > prof.reserve + 4000) || (arming && p.gold > prof.reserve + 2500))) buyUnit('veteranSoldier');
  if ((militant(prof) || arming) && s.turn > aiTurn(s, 80) && countOwned(s, p, (u) => u.type === 'artillery') < Math.ceil(colonies.length / (arming ? 1 : 2))) {
    if (room() >= 0 && afford(trainPrice(s, p, 'artillery'))) safely(() => train(s, p.id, 'artillery'));
  }
  const fishable = colonies.some((c) => c.buildings.docks > 0) && !countOwned(s, p, (u) => u.type === 'expertFisherman');
  if (fishable) buyUnit('expertFisherman');
  if (prof.missions && s.turn < aiTurn(s, 160) && !countOwned(s, p, (u) => u.type === 'firebrandPreacher')) buyUnit('firebrandPreacher');
  // Recruit the best of the pool while it is cheap.
  // (Dearer recruits too once trade has filled the treasury: idle gold scores next to nothing.)
  // While arming for independence, muskets come first (bought below): recruits only with gold to spare.
  for (let i = 0; i < 3 && room() > 0 && afford(recruitPrice(s, p) + (turnArming ? 1500 : 0)) && (recruitPrice(s, p) < 500 || p.gold > prof.reserve + recruitPrice(s, p) * 4); i++) {
    const slot = p.recruitPool.map((t, j) => [UNIT_TYPES[t].skill, j] as const).sort((a, b) => b[0] - a[0])[0][1];
    safely(() => recruit(s, p.id, slot));
  }

  // Ships bought this turn sail too; a ship in a partner's port buys there, at that port's prices.
  for (const ship of inEurope()) {
    const warship = UNIT_TYPES[ship.type].offence > 0;
    const market = portOf(ship) === p.id ? p : s.players.find((o) => o.id === portOf(ship)) ?? p;
    // Arming for independence: muskets for militia are the cheapest defence (50 a soldier), so
    // they go aboard first, in every hold but one, as far as the gold above the reserve allows.
    if (turnArming && !warship) {
      for (let i = 0; i < 6 && cargoFree(s, ship) > 1 && afford(buyPrice(s, market, 'muskets') * 100); i++) safely(() => buyGoods(s, ship.id, 'muskets', 100));
    }
    // Expansion waits for a defender: muskets, loaded before the colonists board, let a colony arm
    // a colonist as militia (raiseMilitia).
    const stored = colonies.reduce((n, c) => n + c.goods.muskets, 0) + (ship.cargo?.muskets ?? 0);
    if (turnExpansion === 'defence' && !warship && stored < 50 && afford(buyPrice(s, market, 'muskets') * 50)) safely(() => buyGoods(s, ship.id, 'muskets', 50));
    if (!warship && inHomePort(ship)) for (const u of docks()) if (cargoFree(s, ship) > 0) safely(() => boardInEurope(s, u.id, ship.id));
    // Supplies: tools for builds and pioneers, muskets when war or independence is coming.
    const toolsNeeded = colonies.reduce((n, c) => (c.build ? n + Math.max(0, buildTargetCost(c.build, c).tools - c.goods.tools) : n), 0) + pioneerToolsWanted(s, p);
    if (toolsNeeded > 0 && afford(buyPrice(s, market, 'tools') * 100)) safely(() => buyGoods(s, ship.id, 'tools', Math.min(100, Math.ceil(toolsNeeded / 10) * 10)));
    const preparing = !!prof.independence && turnShare >= prof.independence.minShare - 15;
    const muskets = colonies.reduce((n, c) => n + c.goods.muskets, 0);
    // Arming for independence: up to three holds of muskets a trip, to arm colonists as militia.
    for (let i = 0; i < (turnArming ? 3 : 1); i++) {
      const stock = muskets + (ship.cargo?.muskets ?? 0);
      if ((preparing || militant(prof)) && stock < colonies.length * 50 * (preparing ? Math.max(1, turnArmy) : 1) && afford(buyPrice(s, market, 'muskets') * 100 + 300)) safely(() => buyGoods(s, ship.id, 'muskets', 100));
    }
    if (!colonies.some((c) => c.goods.horses >= 2) && colonies.length && afford(buyPrice(s, market, 'horses') * 50)) safely(() => buyGoods(s, ship.id, 'horses', 50));
    // Arming for independence: horses to mount the garrisons as dragoons (mountTroops), a hold a trip.
    const horses = colonies.reduce((n, c) => n + c.goods.horses, 0) + (ship.cargo?.horses ?? 0);
    const dragoons = countOwned(s, p, (u) => u.role === 'dragoon');
    if (turnArming && !warship && cargoFree(s, ship) > 0 && horses + dragoons * 50 < countOwned(s, p, isArmed) * 50 + colonies.length * 50 && afford(buyPrice(s, market, 'horses') * 100 + 300)) safely(() => buyGoods(s, ship.id, 'horses', 100));
    // Creative: holds left over carry goods that another port pays clearly more for.
    if (!warship) safely(() => triangleBuy(s, p, ship, prof));
    sailToAmerica(s, ship.id);
  }
}

// ---------------------------------------------------------------------------
// Diplomacy and war

function diplomacy(s: GameState, p: Player, prof: AiProfile): void {
  const colonies = ownColonies(s, p);
  // Calm angry neighbours with gifts.
  if (prof.gifts) {
    for (const t of s.tribes) {
      const near = Object.values(s.settlements).filter((st) => st.tribe === t.id && colonies.some((c) => distance(c.x, c.y, st.x, st.y) <= 6));
      if (!near.length) continue;
      const worst = Math.max(...near.map((st) => tensionOf(st, p.id)));
      if ((worst > 450 || t.stance[p.id] === 'war') && p.gold > prof.reserve + 200) {
        giftToTribe(s, p.id, t.id, Math.min(300, p.gold - prof.reserve));
      }
    }
  }
  const memory = (p.aiMemory = p.aiMemory ?? {});
  const army = spareArmy(s, p, prof);
  const strength = army.reduce((n, u) => n + offencePower(s, u), 0);

  // Raid nearby native settlements for treasure.
  if (prof.raidNatives && army.length >= 2 && s.turn > aiTurn(s, 40)) {
    const st = Object.values(s.settlements)
      .filter((o) => colonies.some((c) => distance(c.x, c.y, o.x, o.y) <= 6))
      .sort((a, b) => a.defenders - b.defenders)[0];
    if (st) {
      for (const u of army) {
        const pos = unitPosition(s, u)!;
        if (distance(st.x, st.y, pos.x, pos.y) === 1 && u.moves > 0) safely(() => attack(s, u.id, { settlementId: st.id }));
        else {
          const step = adjacentTileTowards(s, u, st.x, st.y);
          if (step) safely(() => setDestination(s, u.id, step));
        }
      }
    }
  }

  // Start a war against a weak neighbour when it pays. Never against a Favoured Nation; a nation
  // that broke a Favoured Nation agreement is a likely target, even for peaceful levels. After
  // cancelling Favoured Nation to go to war (foreign.ts), the war waits until the planned turn.
  const hostileTo = s.players.filter((o) => isHostile(s, p.id, o.id)).map((o) => o.id);
  if (memory.warPlan && (s.turn > memory.warPlan.turn + 20 || p.stance[memory.warPlan.nation] === 'war')) delete memory.warPlan;
  if ((prof.aggression > 0 || hostileTo.length) && p.independence === 'none' && s.turn - (memory.lastWar ?? -100) > 40 && s.turn > aiTurn(s, 50)) {
    const best = bestWarTarget(s, p, prof, strength);
    if (best && best.ready && army.length >= 2) {
      startWar(s, p.id, best.c.owner);
      memory.lastWar = s.turn;
      memory.warTarget = best.c.id;
      if (memory.warPlan?.nation === best.c.owner) delete memory.warPlan;
    }
  }
  if (memory.warTarget) {
    const t = s.colonies[memory.warTarget];
    if (!t || t.owner === p.id || p.stance[t.owner] !== 'war') delete memory.warTarget;
  }
  // Make peace when the war is going nowhere.
  for (const [other, stance] of Object.entries(p.stance)) {
    if (stance !== 'war' || other === 'crown') continue;
    const o = s.players.find((x) => x.id === other);
    if (!o || o.human) continue;
    const long = s.turn - (p.warSince[other] ?? s.turn) > 15;
    if ((long && !memory.warTarget) || army.length === 0) safely(() => proposePeace(s, p.id, other as typeof p.id));
  }
}

/** Colonists at most in an outpost given up before a declaration (abandonOutposts). */
const OUTPOST_COLONISTS = 2;

/**
 * Ready to declare but for weak colonies: tiny outposts (OUTPOST_COLONISTS or fewer, no
 * stockade) that could not hold are abandoned first, as the original game allows (leaving.ts).
 * Each colony held at the declaration counts towards the half that must be kept (independence.ts),
 * and a weak one would only feed the royal troops. Their colonists join another colony. At least
 * three colonies are kept.
 */
function abandonOutposts(s: GameState, p: Player): void {
  const weak = new Set(weakColonies(s, p).map((c) => c.id));
  for (const c of ownColonies(s, p)) {
    if (ownColonies(s, p).length <= 3) return;
    if (!weak.has(c.id) || c.buildings.stockade > 0 || colonyWorkers(s, c).length > OUTPOST_COLONISTS) continue;
    safely(() => void abandonColony(s, c.id));
  }
}

function independence(s: GameState, p: Player, prof: AiProfile): void {
  const plan = prof.independence;
  if (!plan || p.independence !== 'none' || s.turn < aiTurn(s, plan.minTurn)) return;
  const colonies = ownColonies(s, p);
  if (!colonies.length || turnShare < plan.minShare) return;
  const armed = countOwned(s, p, isArmed);
  const fortified = colonies.filter((c) => c.buildings.stockade > 0).length;
  if (armed < colonies.length * plan.armyPerColony || fortified < colonies.length / 3) return;
  // The Royal Expeditionary Force has grown all game: declare only when the defence can plausibly
  // beat it, counting the mercenaries the treasury can hire and the intervention the bells bring,
  // can hold until the intervention comes, and no third of the colonies is weak.
  const power = rebelPower(s, p);
  if (defenceShort(s, p, plan.ratio, turnSupport, power) || !holdsAlone(s, p, supportParts(s, p).mercenaries, power)) return;
  abandonOutposts(s, p);
  if (!readyToFight(s, p, plan.ratio, turnSupport)) return;
  if (canDeclareIndependence(s, p.id) !== null) return;
  declareIndependence(s, p.id);
  hireMercenaries(s, p, prof, plan.ratio);
}

