import { assignJob, bestJob, canBuild, colonySiteProblem, foundColony, jobOptions, setBuild } from './colony.js';
import { RuleError } from './errors.js';
import { boardInEurope, recruit, recruitPrice, sailToAmerica, sellGoods } from './europe.js';
import { describeMove, findPath, leaveShip, moveUnit, setDestination, startImprovement, canImprove } from './movement.js';
import { colonyReport, baseTileYield } from './production.js';
import {
  cargoFree,
  cargoRoomFor,
  colonyAt,
  colonyWorkers,
  DIRECTIONS,
  distance,
  isCoastal,
  isShip,
  isWater,
  neighbours,
  tileAt,
  unitPosition,
  unitsAboard,
  type Direction,
} from './queries.js';
import type { BuildingKind } from './rules/buildings.js';
import { GOODS, type GoodId } from './rules/goods.js';
import { UNIT_TYPES } from './rules/units.js';
import type { Colony, GameState, Player, Unit } from './types.js';

const SELLABLE: GoodId[] = ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'];
const BUILD_PREFERENCE: BuildingKind[] = ['docks', 'stockade', 'warehouse', 'carpenter', 'printingPress', 'church', 'armory'];

/** Runs an AI action, ignoring moves the rules turn down. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
  }
}

/** Plays one turn for a computer-controlled European nation. */
export function runAi(s: GameState, p: Player): void {
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

export function siteScore(s: GameState, x: number, y: number): number {
  if (colonySiteProblem(s, x, y)) return -Infinity;
  let score = 0;
  let water = 0;
  for (const p of [{ x, y }, ...neighbours(s, x, y)]) {
    const tile = tileAt(s, p.x, p.y)!;
    if (isWater(tile)) {
      water++;
      score += 1.5;
      continue;
    }
    if (colonyAt(s, p.x, p.y)) continue;
    score += baseTileYield(tile, 'food') * 1.2;
    let best = 0;
    for (const g of GOODS) if (g !== 'food') best = Math.max(best, baseTileYield(tile, g));
    score += best * 0.6;
  }
  if (water > 0 && water < 6) score += 8;
  if (water >= 6) score -= 10;
  return score;
}

function directionTo(fx: number, fy: number, tx: number, ty: number): Direction | undefined {
  return DIRECTIONS.find((d) => d.dx === Math.sign(tx - fx) && d.dy === Math.sign(ty - fy))?.id;
}

function nearestColony(s: GameState, p: Player, x: number, y: number, coastalOnly = false): Colony | undefined {
  let best: Colony | undefined;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== p.id) continue;
    if (coastalOnly && !isCoastal(s, c.x, c.y)) continue;
    if (!best || distance(c.x, c.y, x, y) < distance(best.x, best.y, x, y)) best = c;
  }
  return best;
}

function ownColonies(s: GameState, p: Player): Colony[] {
  return Object.values(s.colonies).filter((c) => c.owner === p.id);
}

function aiUnit(s: GameState, p: Player, u: Unit): void {
  if (u.loc.kind !== 'map' || u.work) return;
  const def = UNIT_TYPES[u.type];
  if (def.kind === 'ship') return aiShip(s, p, u);
  if (def.kind === 'colonist') return aiColonist(s, p, u);
  if (def.kind === 'artillery') return guardColony(s, p, u);
}

function guardColony(s: GameState, p: Player, u: Unit): void {
  if (u.loc.kind !== 'map') return;
  const here = colonyAt(s, u.loc.x, u.loc.y);
  if (here && here.owner === p.id) {
    u.state = 'fortified';
    return;
  }
  const target = nearestColony(s, p, u.loc.x, u.loc.y);
  if (target) setDestination(s, u.id, { x: target.x, y: target.y });
}

function aiColonist(s: GameState, p: Player, u: Unit): void {
  if (u.loc.kind !== 'map') return;
  const { x, y } = u.loc;
  if (u.role === 'soldier' || u.role === 'dragoon') {
    // Keep one guard per colony; extra soldiers settle down.
    const guarded = ownColonies(s, p).filter((c) =>
      Object.values(s.units).some((o) => o.owner === p.id && o.id !== u.id && o.loc.kind === 'map' && o.loc.x === c.x && o.loc.y === c.y && (o.role === 'soldier' || o.role === 'dragoon')),
    );
    if (ownColonies(s, p).length === 0 || guarded.length < ownColonies(s, p).length) return guardColony(s, p, u);
  }
  if (u.role === 'pioneer' && aiPioneer(s, p, u)) return;

  const here = colonyAt(s, x, y);
  if (here && here.owner === p.id) {
    if (bestJob(s, here, u)) assignJob(s, u.id, here.id);
    return;
  }

  const colonies = ownColonies(s, p);
  const wanted = 2 + Math.floor(s.turn / 12);
  if (colonies.length < wanted) {
    let best = { x, y, score: siteScore(s, x, y) };
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!tileAt(s, nx, ny)) continue;
        const score = siteScore(s, nx, ny) - distance(x, y, nx, ny) * 1.5;
        if (score > best.score) best = { x: nx, y: ny, score };
      }
    }
    if (best.score > 18) {
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
    for (const g of SELLABLE) {
      if (here.goods[g] >= 100 && cargoFree(s, ship) > 0) {
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
  }
}

function landingSpot(s: GameState, p: Player, ship: Unit): { x: number; y: number } | null {
  const pos = unitPosition(s, ship)!;
  const colony = nearestColony(s, p, pos.x, pos.y, true);
  if (colony && findPath(s, ship, colony.x, colony.y)) return { x: colony.x, y: colony.y };
  // Breadth-first search over water for a tile next to a promising site.
  const w = s.map.width;
  const seen = new Set([pos.y * w + pos.x]);
  const queue = [pos];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbours(s, cur.x, cur.y)) {
      const tile = tileAt(s, n.x, n.y)!;
      if (!isWater(tile)) {
        if (siteScore(s, n.x, n.y) > 18 && !(cur.x === pos.x && cur.y === pos.y)) return cur;
        continue;
      }
      const i = n.y * w + n.x;
      if (seen.has(i)) continue;
      seen.add(i);
      queue.push(n);
    }
  }
  return null;
}

function disembarkAll(s: GameState, ship: Unit): boolean {
  if (ship.loc.kind !== 'map') return false;
  const passengers = unitsAboard(s, ship);
  if (colonyAt(s, ship.loc.x, ship.loc.y)) {
    for (const u of passengers) leaveShip(s, u.id);
    return true;
  }
  let best: { x: number; y: number; score: number } | null = null;
  for (const n of neighbours(s, ship.loc.x, ship.loc.y)) {
    const tile = tileAt(s, n.x, n.y)!;
    if (isWater(tile)) continue;
    const score = siteScore(s, n.x, n.y);
    if (!best || score > best.score) best = { ...n, score };
  }
  if (!best || best.score < 10) return false;
  const dir = directionTo(ship.loc.x, ship.loc.y, best.x, best.y)!;
  let landed = false;
  for (const u of passengers) {
    u.moves = Math.max(u.moves, 3);
    const option = describeMove(s, u.id, dir);
    if (option.kind === 'disembark' || option.kind === 'move') {
      moveUnit(s, u.id, dir);
      landed = true;
    }
  }
  if (landed) delete ship.dest;
  return landed;
}

function aiEurope(s: GameState, p: Player): void {
  const ships = Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'europe' && isShip(u));
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
