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
  equipInColony,
  foundColony,
  hurryBuild,
  hurryPrice,
  jobOptions,
  leaveColony,
  setBuild,
} from '../colony.js';
import { attack, cashTreasure, defencePower, offencePower } from '../combat.js';
import { proposePeace, startWar } from '../diplomacy.js';
import { boardInEurope, buyGoods, buyPrice, recruit, recruitPrice, sailToAmerica, sellGoods, train } from '../europe.js';
import { canDeclareIndependence, declareIndependence, rebelShare } from '../independence.js';
import { canImprove, findPath, setDestination, startImprovement } from '../movement.js';
import { buyLand, establishMission, giftToTribe, landPrice, learnSkill, nativeLandOwner, speakToChief, takeLand, tensionOf } from '../natives.js';
import { colonyReport, sonsOfLiberty, type ColonyReport } from '../production.js';
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
  tileAt,
  unitPosition,
  unitsAboard,
  unitsAt,
  warehouseCapacity,
} from '../queries.js';
import { BUILDINGS, type BuildingKind } from '../rules/buildings.js';
import { GOODS, type GoodId, type ProductId } from '../rules/goods.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import type { BuildTarget, Colony, GameState, Job, Player, Unit } from '../types.js';
import { aiFight, disembarkAll, landingSpot, nearestColony, ownColonies, safely, siteScore } from './common.js';
import { buyShips, shipToBuild } from './fleet.js';
import { manageLogistics, overflowSoon, wantsWagon } from './logistics.js';
import { equippedPrice, trainEquipped } from './outfit.js';
import type { AiProfile } from './profiles.js';
import { buildRoads, equipPioneer, pioneerToolsWanted } from './roads.js';

const SELLABLE: GoodId[] = ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'];
const SUPPLIES: GoodId[] = ['tools', 'muskets', 'horses'];

/** Plays one turn with the given profile. */
export function runAdvanced(s: GameState, p: Player, prof: AiProfile): void {
  turnShare = rebelShare(s, p.id);
  safely(() => diplomacy(s, p, prof));
  for (const c of ownColonies(s, p)) safely(() => manageColony(s, p, c, prof));
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

/** Armies, artillery and armories are for nations that mean to fight (Combative, or Creative at war). */
const militant = (prof: AiProfile) => prof.aggression >= 0.5;

const isArmed = (u: Unit) => u.role === 'soldier' || u.role === 'dragoon' || UNIT_TYPES[u.type].kind === 'artillery';

function armedAt(s: GameState, p: Player, x: number, y: number): Unit[] {
  return unitsAt(s, x, y).filter((u) => u.owner === p.id && isArmed(u));
}

function colonyDefence(s: GameState, c: Colony): number {
  return unitsAt(s, c.x, c.y)
    .filter((u) => u.owner === c.owner && !isShip(u))
    .reduce((sum, u) => sum + defencePower(s, u), 0);
}

/** Armed units not needed for garrison duty. */
function spareArmy(s: GameState, p: Player, prof: AiProfile): Unit[] {
  const out: Unit[] = [];
  const kept = new Map<string, number>();
  for (const u of Object.values(s.units)) {
    if (u.owner !== p.id || !isArmed(u) || u.loc.kind !== 'map') continue;
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
  const preparing = prof.independence && turnShare >= prof.independence.minShare - 15;
  let n = prof.garrison;
  if (atWar) n += 1;
  if (preparing && prof.independence) n = Math.max(n, prof.independence.armyPerColony);
  return n;
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
      return sol >= 100 ? 0.5 : 2.5 * prof.liberty;
    case 'crosses':
      return 1.2;
    case 'hammers': {
      // A wagon train that saves goods from rotting is worth a carpenter's time.
      const urgent = c.build?.kind === 'unit' && c.build.id === 'wagonTrain';
      return c.build ? (urgent ? 7 : 3.2) : 0.4;
    }
    case 'lumber':
      return report.produced.lumber < report.consumed.lumber + 3 && c.goods.lumber < 60 ? 3 : 0.8;
    case 'tools':
      return 3;
    case 'muskets':
      return 3.5;
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

function bestJobFor(s: GameState, p: Player, c: Colony, u: Unit, prof: AiProfile): { job: Job; value: number } | null {
  const report = colonyReport(s, c);
  const sol = sonsOfLiberty(s, c);
  let best: { job: Job; value: number } | null = null;
  for (const opt of jobOptions(s, c, u)) {
    const v = jobValueFor(p, c, u, opt.job, opt.amount, report, prof, sol);
    if (!best || v > best.value) best = { job: opt.job, value: v };
  }
  return best;
}

/** Shuffles a few workers to better jobs each turn. */
function optimiseWorkers(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  let changes = 0;
  const workers = colonyWorkers(s, c).sort((a, b) => UNIT_TYPES[b.type].skill - UNIT_TYPES[a.type].skill);
  for (const u of workers) {
    if (changes >= 3) break;
    const report = colonyReport(s, c);
    const now = currentValue(p, c, u, report, prof, sonsOfLiberty(s, c));
    const best = bestJobFor(s, p, c, u, prof);
    if (best && best.value > now * 1.15 + 0.5) {
      assignJob(s, u.id, c.id, best.job);
      changes++;
    }
  }
  // Never starve: move people onto food until the colony breaks even.
  for (const u of colonyWorkers(s, c)) {
    if (colonyReport(s, c).net.food >= 0) break;
    if (u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && u.loc.job.good === 'food') continue;
    const food = jobOptions(s, c, u).filter((o) => o.job.kind === 'tile' && o.job.good === 'food').sort((a, b) => b.amount - a.amount)[0];
    if (food && food.amount > 2) assignJob(s, u.id, c.id, food.job);
  }
}

function buildPlan(s: GameState, p: Player, c: Colony, prof: AiProfile): BuildTarget | null {
  const threatened = Object.values(p.stance).includes('war') || Object.values(s.settlements).some((st) => distance(st.x, st.y, c.x, c.y) <= 5 && tensionOf(st, p.id) > 500);
  const preparing = !!prof.independence && turnShare >= prof.independence.minShare - 20;
  const pop = colonyWorkers(s, c).length;
  const staffed = (k: BuildingKind) => colonyWorkers(s, c).filter((w) => w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === k).length;
  const plan: BuildTarget[] = [];
  const b = (id: BuildingKind) => plan.push({ kind: 'building', id });
  if (threatened || preparing || prof.garrison > 1) b('stockade');
  // Goods about to rot: more storage, and a wagon train to carry them to a port.
  const overflow = overflowSoon(s, c, 6);
  if (wantsWagon(s, p, c)) plan.push({ kind: 'unit', id: 'wagonTrain' });
  b('docks');
  if (overflow > 0) b('warehouse');
  if (prof.liberty > 1) b('printingPress');
  b('carpenter');
  b('warehouse');
  if (militant(prof) || preparing) b('armory');
  if (prof.schools && pop >= 4) b('schoolhouse');
  for (const k of ['weaver', 'distiller', 'tobacconist', 'furTrader', 'blacksmith'] as BuildingKind[]) if (staffed(k) >= 2) b(k);
  b('church');
  b('customHouse');
  b('printingPress');
  b('stockade');
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
    if (price > 0 && price < 1500 && p.gold > prof.reserve + price * 1.5 && colonyReport(s, c).produced.hammers > 0 && c.hammers >= cost.hammers / 3) {
      hurryBuild(s, c.id);
    }
  }
  manageRest(s, p, c, prof);
}

function manageRest(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  if (c.buildings.customHouse) for (const g of SELLABLE) c.exports[g] = true;
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
  const workers = colonyWorkers(s, c);
  if (workers.length < 3 || c.goods.muskets < 50) return;
  if (armedAt(s, p, c.x, c.y).length >= garrisonFor(p, prof)) return;
  const recruit = workers
    .filter((w) => UNIT_TYPES[w.type].skill <= 0 && w.type !== 'nativeConvert')
    .sort((a, b) => UNIT_TYPES[a.type].skill - UNIT_TYPES[b.type].skill)[0];
  if (!recruit) return;
  leaveColony(s, recruit.id);
  equipInColony(s, recruit.id, 'soldier');
  recruit.state = 'fortified';
}

/** Buys (or takes) good native land next to a growing colony. */
function acquireLand(s: GameState, p: Player, c: Colony, prof: AiProfile): void {
  if (prof.land === 'avoid' || colonyWorkers(s, c).length < 3) return;
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
    if (p.gold > prof.reserve + price) {
      buyLand(s, p.id, n.x, n.y);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Units

function unitTurn(s: GameState, p: Player, u: Unit, prof: AiProfile): void {
  if (u.loc.kind !== 'map' || u.work || u.repair || u.route) return;
  const def = UNIT_TYPES[u.type];
  if (def.kind === 'ship') return shipTurn(s, p, u, prof);
  if (def.kind === 'treasure') return treasureTurn(s, p, u);
  if (def.kind === 'artillery') return soldierTurn(s, p, u, prof);
  if (def.kind !== 'colonist') return;
  // Before the first colony exists, whoever lands first founds it.
  if (!ownColonies(s, p).length && u.role !== 'scout') return colonistTurn(s, p, u, prof);
  if (u.role === 'soldier' || u.role === 'dragoon') return soldierTurn(s, p, u, prof);
  if (u.role === 'scout') return scoutTurn(s, p, u);
  if (u.role === 'pioneer') return pioneerTurn(s, p, u);
  if (u.role === 'missionary') return missionaryTurn(s, p, u);
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
  if (aiFight(s, p, u)) return;
  const pos = unitPosition(s, u)!;
  const colonies = ownColonies(s, p);
  // Fill garrisons first, nearest colony short of troops.
  const here = colonyAt(s, pos.x, pos.y);
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
    if (!prof.independence || turnShare < prof.independence.minShare - 15) {
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
  if (frontier && findPath(s, u, frontier.x, frontier.y)) {
    setDestination(s, u.id, { x: frontier.x, y: frontier.y });
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
      const farm = t.good === 'food' || t.good === 'sugar' || t.good === 'tobacco' || t.good === 'cotton';
      const kind = farm ? (tile.f ? 'clear' : tile.p ? null : 'plow') : tile.r ? null : 'road';
      if (!kind || (kind === 'plow' && (tile.t === 'hills' || tile.t === 'mountains'))) continue;
      if (pos.x === t.x && pos.y === t.y) {
        if (canImprove(s, u, kind) === null) {
          startImprovement(s, u.id, kind);
          return;
        }
        continue;
      }
      if (findPath(s, u, t.x, t.y)) {
        setDestination(s, u.id, { x: t.x, y: t.y });
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

function missionaryTurn(s: GameState, p: Player, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const st = Object.values(s.settlements)
    .filter((o) => !o.mission && tensionOf(o, p.id) < 500 && s.tribes.find((t) => t.id === o.tribe)?.stance[p.id] !== 'war')
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0];
  if (!st) return;
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
  const expand = colonies.length < prof.colonyTarget(s.turn) && (!here || colonyWorkers(s, here).length >= 3);
  if (expand) {
    const radius = here ? 8 : 5;
    let best = { x: pos.x, y: pos.y, score: here ? -Infinity : siteScore(s, pos.x, pos.y) };
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        if (!tileAt(s, nx, ny)) continue;
        // Keep a little distance from the natives so tension stays low.
        const crowding = Object.values(s.settlements).filter((st) => distance(st.x, st.y, nx, ny) <= 2).length * 4;
        const score = siteScore(s, nx, ny) - distance(pos.x, pos.y, nx, ny) * 1.1 - crowding;
        if (score > best.score) best = { x: nx, y: ny, score };
      }
    }
    if (best.score > 14) {
      if (best.x === pos.x && best.y === pos.y) {
        foundColony(s, u.id);
        return;
      }
      if (findPath(s, u, best.x, best.y)) {
        setDestination(s, u.id, { x: best.x, y: best.y });
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
  const home = colonies
    .filter((c) => findPath(s, u, c.x, c.y))
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - colonyReport(s, a).net.food / 2 - (distance(b.x, b.y, pos.x, pos.y) - colonyReport(s, b).net.food / 2))[0];
  if (home) {
    setDestination(s, u.id, { x: home.x, y: home.y });
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
  // Deliver supplies bought in Europe.
  if (mine) {
    for (const g of SUPPLIES) {
      const n = ship.cargo?.[g] ?? 0;
      if (n > 0) {
        ship.cargo![g] = 0;
        mine.goods[g] += n;
      }
    }
    for (const g of SELLABLE) {
      if (mine.goods[g] >= 50 && cargoFree(s, ship) + (ship.cargo?.[g] ? 1 : 0) > 0) {
        const amount = Math.min(mine.goods[g], cargoRoomFor(s, ship, g));
        if (amount <= 0) continue;
        mine.goods[g] -= amount;
        ship.cargo = ship.cargo ?? {};
        ship.cargo[g] = (ship.cargo[g] ?? 0) + amount;
      }
    }
  }
  const carrying = SELLABLE.reduce((n, g) => n + (ship.cargo?.[g] ?? 0), 0);
  const supplies = SUPPLIES.reduce((n, g) => n + (ship.cargo?.[g] ?? 0), 0);
  if (supplies > 0) {
    const port = nearestColony(s, p, pos.x, pos.y, true);
    if (port) setDestination(s, ship.id, { x: port.x, y: port.y });
    return;
  }
  // Pick up from the colony with the most goods waiting, unless the hold is mostly full.
  const capacity = UNIT_TYPES[ship.type].cargo * 100;
  if (carrying < capacity * 0.5) {
    const pickup = ownColonies(s, p)
      .filter((c) => isCoastal(s, c.x, c.y) && c.id !== mine?.id)
      .map((c) => ({ c, goods: SELLABLE.reduce((n, g) => n + (c.goods[g] >= 50 ? c.goods[g] : 0), 0) }))
      .filter((r) => r.goods >= 100)
      .sort((a, b) => b.goods - a.goods)[0];
    if (pickup && findPath(s, ship, pickup.c.x, pickup.c.y)) {
      setDestination(s, ship.id, { x: pickup.c.x, y: pickup.c.y });
      return;
    }
  }
  const docks = Object.values(s.units).some((u) => u.owner === p.id && u.loc.kind === 'europe' && !isShip(u));
  if (p.independence === 'none' && (carrying > 0 || docks || p.gold > prof.reserve + recruitPrice(p))) {
    if (!ship.dest) setDestination(s, ship.id, { europe: true });
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
  const prey = (o: Unit) => o.owner !== p.id && isShip(o) && UNIT_TYPES[o.type].offence === 0 && o.owner !== 'crown';
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
  return Object.values(s.units).filter((u) => u.owner === p.id && test(u)).length;
}

function europe(s: GameState, p: Player, prof: AiProfile): void {
  if (p.independence !== 'none') return;
  const ships = Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && isShip(u) && !u.repair && !u.route);
  // Ships on routes that call at Europe pick up colonists from the docks as they pass.
  const liners = countOwned(s, p, (u) => isShip(u) && !!u.route && !!s.routes?.[u.route.id]?.stops.some((st) => st.passengers));
  if (!ships.length && !liners) return;
  for (const ship of ships) for (const g of GOODS) if ((ship.cargo?.[g] ?? 0) > 0 && !SUPPLIES.includes(g)) safely(() => sellGoods(s, ship.id, g, ship.cargo![g]!));

  const colonies = ownColonies(s, p);
  const docks = () => Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && !isShip(u));
  const room = () => ships.filter((sh) => UNIT_TYPES[sh.type].offence === 0).reduce((n, sh) => n + cargoFree(s, sh), 0) + liners * 2 - docks().length;
  const afford = (price: number) => p.gold >= prof.reserve + price;
  const buyUnit = (type: UnitTypeId) => {
    if (room() > 0 && afford(equippedPrice(p, type))) safely(() => trainEquipped(s, p, type));
  };

  // More ships once trade outgrows the fleet, before anything else: spoiling goods cost more than a ship.
  buyShips(s, p, prof);
  if (prof.scouting && s.turn < 100 && !countOwned(s, p, (u) => u.role === 'scout')) buyUnit('seasonedScout');
  // A worn-out hardy pioneer is given fresh tools in a colony rather than replaced.
  if (!countOwned(s, p, (u) => u.role === 'pioneer' || u.type === 'hardyPioneer') && colonies.length) buyUnit('hardyPioneer');
  const statesmen = countOwned(s, p, (u) => u.type === 'elderStatesman');
  if (prof.liberty > 1.3 && s.turn > 30 && statesmen < colonies.length) buyUnit('elderStatesman');
  const armed = countOwned(s, p, isArmed);
  if (armed < colonies.length * garrisonFor(p, prof) && (armed === 0 || (militant(prof) && p.gold > prof.reserve + 4000))) buyUnit('veteranSoldier');
  if (militant(prof) && s.turn > 80 && countOwned(s, p, (u) => u.type === 'artillery') < Math.ceil(colonies.length / 2)) {
    if (room() >= 0 && afford(UNIT_TYPES.artillery.price!)) safely(() => train(s, p.id, 'artillery'));
  }
  const fishable = colonies.some((c) => c.buildings.docks > 0) && !countOwned(s, p, (u) => u.type === 'expertFisherman');
  if (fishable) buyUnit('expertFisherman');
  if (prof.missions && s.turn < 160 && !countOwned(s, p, (u) => u.type === 'firebrandPreacher')) buyUnit('firebrandPreacher');
  // Recruit the best of the pool while it is cheap.
  for (let i = 0; i < 3 && room() > 0 && afford(recruitPrice(p)) && recruitPrice(p) < 500; i++) {
    const slot = p.recruitPool.map((t, j) => [UNIT_TYPES[t].skill, j] as const).sort((a, b) => b[0] - a[0])[0][1];
    safely(() => recruit(s, p.id, slot));
  }

  for (const ship of Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && isShip(u) && !u.repair && !u.route)) {
    const warship = UNIT_TYPES[ship.type].offence > 0;
    if (!warship) for (const u of docks()) if (cargoFree(s, ship) > 0) safely(() => boardInEurope(s, u.id, ship.id));
    // Supplies: tools for builds and pioneers, muskets when war or independence is coming.
    const toolsNeeded = colonies.reduce((n, c) => (c.build ? n + Math.max(0, buildTargetCost(c.build, c).tools - c.goods.tools) : n), 0) + pioneerToolsWanted(s, p);
    if (toolsNeeded > 0 && afford(buyPrice(p, 'tools') * 100)) safely(() => buyGoods(s, ship.id, 'tools', Math.min(100, Math.ceil(toolsNeeded / 10) * 10)));
    const preparing = !!prof.independence && turnShare >= prof.independence.minShare - 15;
    const muskets = colonies.reduce((n, c) => n + c.goods.muskets, 0);
    if ((preparing || militant(prof)) && muskets < colonies.length * 50 && afford(buyPrice(p, 'muskets') * 100 + 300)) safely(() => buyGoods(s, ship.id, 'muskets', 100));
    if (!colonies.some((c) => c.goods.horses >= 2) && colonies.length && afford(buyPrice(p, 'horses') * 50)) safely(() => buyGoods(s, ship.id, 'horses', 50));
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
  if (prof.raidNatives && army.length >= 2 && s.turn > 40) {
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

  // Start a war against a weak neighbour when it pays.
  if (prof.aggression > 0 && p.independence === 'none' && s.turn - (memory.lastWar ?? -100) > 40 && s.turn > 50) {
    let best: { c: Colony; score: number } | null = null;
    for (const c of Object.values(s.colonies)) {
      if (c.owner === p.id || c.owner === 'crown' || p.stance[c.owner] === 'war') continue;
      const enemy = s.players.find((o) => o.id === c.owner);
      if (!enemy || enemy.independence !== 'none') continue;
      const near = colonies.some((own) => distance(own.x, own.y, c.x, c.y) <= 10);
      if (!near) continue;
      const def = colonyDefence(s, c) + 1;
      const score = strength / def;
      if (!best || score > best.score) best = { c, score };
    }
    if (best && best.score >= 2.5 / prof.aggression && army.length >= 2) {
      startWar(s, p.id, best.c.owner);
      memory.lastWar = s.turn;
      memory.warTarget = best.c.id;
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

function independence(s: GameState, p: Player, prof: AiProfile): void {
  const plan = prof.independence;
  if (!plan || p.independence !== 'none' || s.turn < plan.minTurn) return;
  const colonies = ownColonies(s, p);
  if (!colonies.length || turnShare < plan.minShare) return;
  const armed = countOwned(s, p, isArmed);
  const fortified = colonies.filter((c) => c.buildings.stockade > 0).length;
  const muskets = colonies.reduce((n, c) => n + c.goods.muskets, 0);
  if (armed < colonies.length * plan.armyPerColony || fortified < colonies.length / 3 || muskets < colonies.length * 25) return;
  if (canDeclareIndependence(s, p.id) === null) declareIndependence(s, p.id);
}

