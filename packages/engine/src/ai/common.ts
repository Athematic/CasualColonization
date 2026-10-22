import { colonySiteProblem } from '../colony.js';
import { braveDefence, hostileBraveAt } from '../braves.js';
import { attack, defencePower, offencePower } from '../combat.js';
import { RuleError } from '../errors.js';
import { describeMove, findPath, leaveShip, moveUnit, setDestination } from '../movement.js';
import { baseTileYield } from '../production.js';
import {
  colonyAt,
  DIRECTIONS,
  distance,
  isCoastal,
  isShip,
  isWater,
  neighbours,
  tileAt,
  unitPosition,
  unitsAboard,
  unitsAt,
  type Direction,
} from '../queries.js';
import { GOODS } from '../rules/goods.js';
import type { Colony, GameState, Player, Unit } from '../types.js';

/** Runs an AI action, ignoring moves the rules turn down. */
export function safely(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
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
  // A river through the centre: road-speed travel inland, and its yield bonus counted above.
  const centre = tileAt(s, x, y)!;
  if (centre.rv) score += 2 * centre.rv;
  if (water > 0 && water < 6) score += 8;
  if (water >= 6) score -= 10;
  return score;
}

export function directionTo(fx: number, fy: number, tx: number, ty: number): Direction | undefined {
  return DIRECTIONS.find((d) => d.dx === Math.sign(tx - fx) && d.dy === Math.sign(ty - fy))?.id;
}

export function nearestColony(s: GameState, p: Player, x: number, y: number, coastalOnly = false): Colony | undefined {
  let best: Colony | undefined;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== p.id) continue;
    if (coastalOnly && !isCoastal(s, c.x, c.y)) continue;
    if (!best || distance(c.x, c.y, x, y) < distance(best.x, best.y, x, y)) best = c;
  }
  return best;
}

export function ownColonies(s: GameState, p: Player): Colony[] {
  return Object.values(s.colonies).filter((c) => c.owner === p.id);
}

export function guardColony(s: GameState, p: Player, u: Unit): void {
  if (u.loc.kind !== 'map') return;
  const here = colonyAt(s, u.loc.x, u.loc.y);
  if (here && here.owner === p.id) {
    u.state = 'fortified';
    return;
  }
  const target = nearestColony(s, p, u.loc.x, u.loc.y);
  if (target) setDestination(s, u.id, { x: target.x, y: target.y });
}

/** Armed units strike adjacent enemies when the odds favour them. */
export function aiFight(s: GameState, p: Player, u: Unit): boolean {
  const pos = unitPosition(s, u);
  if (!pos || u.moves <= 0) return false;
  const atWar = (owner: string) => p.stance[owner] === 'war';
  for (const n of neighbours(s, pos.x, pos.y)) {
    const colony = colonyAt(s, n.x, n.y);
    if (colony && atWar(colony.owner)) {
      const defenders = unitsAt(s, n.x, n.y).filter((o) => o.owner === colony.owner && !isShip(o));
      const best = Math.max(0, ...defenders.map((d) => defencePower(s, d)));
      if (offencePower(s, u) >= best) {
        attack(s, u.id, { colonyId: colony.id });
        return true;
      }
    }
    const enemy = unitsAt(s, n.x, n.y).find((o) => atWar(o.owner) && isShip(o) === isShip(u));
    if (enemy && offencePower(s, u) >= defencePower(s, enemy)) {
      attack(s, u.id, { unitId: enemy.id });
      return true;
    }
    // Hostile braves next to the unit, when the odds are good.
    const brave = !isShip(u) ? hostileBraveAt(s, p.id, n.x, n.y) : undefined;
    if (brave && offencePower(s, u) >= braveDefence(s, brave) * 1.5) {
      attack(s, u.id, { braveId: brave.id });
      return true;
    }
  }
  return false;
}

export function landingSpot(s: GameState, p: Player, ship: Unit): { x: number; y: number } | null {
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

export function disembarkAll(s: GameState, ship: Unit): boolean {
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

