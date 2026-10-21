import { assignJob, bestJob, canBuild, foundColony, jobOptions, setBuild } from '../colony.js';
import { aiPeace } from '../diplomacy.js';
import { boardInEurope, recruit, recruitPrice, sailToAmerica, sellGoods } from '../europe.js';
import { canImprove, findPath, setDestination, startImprovement } from '../movement.js';
import { colonyReport } from '../production.js';
import { cargoFree, cargoRoomFor, colonyAt, colonyWorkers, distance, isCoastal, isShip, isWater, tileAt, unitsAboard, warehouseCapacity } from '../queries.js';
import type { BuildingKind } from '../rules/buildings.js';
import { GOODS, type GoodId } from '../rules/goods.js';
import { UNIT_TYPES } from '../rules/units.js';
import type { Colony, GameState, Player, Unit } from '../types.js';
import { aiFight, disembarkAll, guardColony, landingSpot, nearestColony, ownColonies, safely, siteScore } from './common.js';

const SELLABLE: GoodId[] = ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'];
const BUILD_PREFERENCE: BuildingKind[] = ['docks', 'stockade', 'warehouse', 'carpenter', 'printingPress', 'church', 'schoolhouse', 'customHouse', 'armory'];

/** The Naive level: settles, works the land and trades, but plans nothing ahead. */
export function runNaive(s: GameState, p: Player): void {
  aiPeace(s, p.id);
  const units = Object.values(s.units).filter((u) => u.owner === p.id);
  for (const u of units) {
    if (!s.units[u.id] || u.owner !== p.id) continue;
    safely(() => aiUnit(s, p, u));
  }
  safely(() => aiEurope(s, p));
  for (const c of Object.values(s.colonies)) {
    if (c.owner === p.id) safely(() => aiColony(s, c));
  }
}

function aiUnit(s: GameState, p: Player, u: Unit): void {
  if (u.loc.kind !== 'map' || u.work || u.route) return;
  const def = UNIT_TYPES[u.type];
  if (def.kind === 'ship') {
    if (def.offence > 0 && aiFight(s, p, u)) return;
    return aiShip(s, p, u);
  }
  if (def.kind === 'colonist') return aiColonist(s, p, u);
  if (def.kind === 'artillery') {
    if (aiFight(s, p, u)) return;
    return guardColony(s, p, u);
  }
}

function aiColonist(s: GameState, p: Player, u: Unit): void {
  if (u.loc.kind !== 'map') return;
  const { x, y } = u.loc;
  if ((u.role === 'soldier' || u.role === 'dragoon') && aiFight(s, p, u)) return;
  if (u.role === 'soldier' || u.role === 'dragoon') {
    // Keep one guard per colony; extra soldiers settle down.
    const guarded = ownColonies(s, p).filter((c) =>
      Object.values(s.units).some((o) => o.owner === p.id && o.id !== u.id && o.loc.kind === 'map' && o.loc.x === c.x && o.loc.y === c.y && (o.role === 'soldier' || o.role === 'dragoon')),
    );
    if (ownColonies(s, p).length === 0 || guarded.length < ownColonies(s, p).length) return guardColony(s, p, u);
  }
  if (u.role === 'pioneer' && aiPioneer(s, p, u)) return;

  const colonies = ownColonies(s, p);
  const wanted = 2 + Math.floor(s.turn / 12);
  const here = colonyAt(s, x, y);
  // Established colonies send settlers out until the nation has enough colonies.
  const expand = colonies.length < wanted && (!here || colonyWorkers(s, here).length >= 3);
  if (here && here.owner === p.id && !expand) {
    if (bestJob(s, here, u)) assignJob(s, u.id, here.id);
    return;
  }

  if (expand) {
    const radius = here ? 7 : 4;
    let best = { x, y, score: siteScore(s, x, y) };
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!tileAt(s, nx, ny)) continue;
        const score = siteScore(s, nx, ny) - distance(x, y, nx, ny) * 1.2;
        if (score > best.score) best = { x: nx, y: ny, score };
      }
    }
    if (best.score > 15) {
      if (best.x === x && best.y === y) {
        foundColony(s, u.id);
        return;
      }
      if (findPath(s, u, best.x, best.y)) {
        setDestination(s, u.id, { x: best.x, y: best.y });
        if (u.loc.kind === 'map' && u.loc.x === best.x && u.loc.y === best.y && u.moves > 0) foundColony(s, u.id);
        return;
      }
    }
  }
  const target = nearestColony(s, p, x, y);
  if (target && findPath(s, u, target.x, target.y)) {
    setDestination(s, u.id, { x: target.x, y: target.y });
    const now = u.loc.kind === 'map' ? colonyAt(s, u.loc.x, u.loc.y) : undefined;
    if (now && now.id === target.id) assignJob(s, u.id, target.id);
  } else if (siteScore(s, x, y) > 0 && u.moves > 0) {
    foundColony(s, u.id);
  }
}

/** Returns true if the pioneer found something to do. */
function aiPioneer(s: GameState, p: Player, u: Unit): boolean {
  if (u.loc.kind !== 'map') return false;
  const colony = nearestColony(s, p, u.loc.x, u.loc.y);
  if (!colony) return false;
  const workedTiles = colonyWorkers(s, colony)
    .map((w) => (w.loc.kind === 'colony' && w.loc.job.kind === 'tile' ? w.loc.job : null))
    .filter((j): j is NonNullable<typeof j> => !!j && j.good !== 'lumber' && j.good !== 'furs');
  const targets = [{ x: colony.x, y: colony.y }, ...workedTiles];
  for (const t of targets) {
    const tile = tileAt(s, t.x, t.y)!;
    if (tile.p || tile.t === 'hills' || tile.t === 'mountains' || isWater(tile)) continue;
    const kind = tile.f ? 'clear' : 'plow';
    if (u.loc.x === t.x && u.loc.y === t.y) {
      if (canImprove(s, u, kind) === null) {
        startImprovement(s, u.id, kind);
        return true;
      }
      continue;
    }
    if (findPath(s, u, t.x, t.y)) {
      setDestination(s, u.id, { x: t.x, y: t.y });
      if (u.loc.x === t.x && u.loc.y === t.y && canImprove(s, u, kind) === null) startImprovement(s, u.id, kind);
      return true;
    }
  }
  return false;
}

function aiShip(s: GameState, p: Player, ship: Unit): void {
  if (ship.loc.kind !== 'map') return;
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
  const here = colonyAt(s, ship.loc.x, ship.loc.y);
  if (here && here.owner === p.id) {
    // Full loads, or anything about to spill out of the warehouse.
    const nearlyFull = (g: GoodId) => here.goods[g] >= 30 && here.goods[g] >= warehouseCapacity(here) - 30;
    for (const g of SELLABLE) {
      if ((here.goods[g] >= 100 || nearlyFull(g)) && cargoFree(s, ship) > 0) {
        const amount = Math.min(here.goods[g], cargoRoomFor(s, ship, g));
        here.goods[g] -= amount;
        ship.cargo = ship.cargo ?? {};
        ship.cargo[g] = (ship.cargo[g] ?? 0) + amount;
      }
    }
  }
  const loaded = Object.values(ship.cargo ?? {}).some((n) => (n ?? 0) > 0);
  const docks = Object.values(s.units).some((u) => u.owner === p.id && u.loc.kind === 'europe' && !isShip(u));
  if (loaded || docks || p.gold >= recruitPrice(p) + 200 || !here) {
    if (!ship.dest) setDestination(s, ship.id, { europe: true });
    return;
  }
  // An idle ship fetches goods that would otherwise rot in another port.
  if (ship.dest) return;
  const rotting = ownColonies(s, p)
    .filter((c) => c.id !== here?.id && isCoastal(s, c.x, c.y))
    .map((c) => ({ c, n: Math.max(...SELLABLE.map((g) => c.goods[g] - (warehouseCapacity(c) - 30))) }))
    .filter((r) => r.n >= 0)
    .sort((a, b) => b.n - a.n)[0];
  if (rotting && findPath(s, ship, rotting.c.x, rotting.c.y)) setDestination(s, ship.id, { x: rotting.c.x, y: rotting.c.y });
}

function aiEurope(s: GameState, p: Player): void {
  const ships = Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && isShip(u) && !u.route);
  for (const ship of ships) {
    for (const g of GOODS) if ((ship.cargo?.[g] ?? 0) > 0) sellGoods(s, ship.id, g, ship.cargo![g]!);
    const totalUnits = Object.values(s.units).filter((u) => u.owner === p.id).length;
    while (cargoFree(s, ship) > 0 && p.gold >= recruitPrice(p) + 300 && totalUnits < 60) {
      const docksCount = Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && !isShip(u)).length;
      if (docksCount >= cargoFree(s, ship)) break;
      safely(() => {
        const slot = p.recruitPool.findIndex((t) => t !== 'pettyCriminal');
        recruit(s, p.id, slot >= 0 ? slot : 0);
      });
      break;
    }
    for (const u of Object.values(s.units)) {
      if (u.owner === p.id && u.loc.kind === 'europe' && !isShip(u) && cargoFree(s, ship) > 0) boardInEurope(s, u.id, ship.id);
    }
    sailToAmerica(s, ship.id);
  }
}

function aiColony(s: GameState, c: Colony): void {
  if (!c.build || !canBuild(s, c, c.build)) {
    const next = BUILD_PREFERENCE.map((id) => ({ kind: 'building' as const, id })).find((t) => canBuild(s, c, t));
    setBuild(s, c.id, next ?? null);
  }
  // Move workers onto food until the colony stops starving.
  for (const worker of colonyWorkers(s, c)) {
    if (colonyReport(s, c).net.food >= 0) break;
    if (worker.loc.kind === 'colony' && worker.loc.job.kind === 'tile' && worker.loc.job.good === 'food') continue;
    const food = jobOptions(s, c, worker)
      .filter((o) => o.job.kind === 'tile' && o.job.good === 'food')
      .sort((a, b) => b.amount - a.amount)[0];
    if (food && food.amount > 2) assignJob(s, worker.id, c.id, food.job);
  }
}
