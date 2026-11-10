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

/**
 * Share of a tile's value a site counts when the tile is already next to a colony (any nation's):
 * that colony works it, so the tile is mostly unavailable. Colonies two tiles apart share up to
 * three tiles; from three tiles apart they share none, so the best sites end up there.
 */
export const SHARED_TILE_VALUE = 0.25;

/** Colonies close enough to share a work tile with a colony at x, y. */
function neighbourColonies(s: GameState, x: number, y: number): Colony[] {
  return Object.values(s.colonies).filter((c) => distance(c.x, c.y, x, y) <= 2);
}

const shared = (near: Colony[], x: number, y: number) => near.some((c) => distance(c.x, c.y, x, y) <= 1);

export function siteScore(s: GameState, x: number, y: number): number {
  if (colonySiteProblem(s, x, y)) return -Infinity;
  const near = neighbourColonies(s, x, y);
  let score = 0;
  let water = 0;
  for (const p of [{ x, y }, ...neighbours(s, x, y)]) {
    const tile = tileAt(s, p.x, p.y)!;
    const weight = shared(near, p.x, p.y) ? SHARED_TILE_VALUE : 1;
    if (isWater(tile)) {
      water++;
      score += 1.5 * weight;
      continue;
    }
    if (colonyAt(s, p.x, p.y)) continue;
    let best = 0;
    for (const g of GOODS) if (g !== 'food') best = Math.max(best, baseTileYield(tile, g));
    score += (baseTileYield(tile, 'food') * 1.2 + best * 0.6) * weight;
  }
  // A river through the centre: road-speed travel inland, and its yield bonus counted above.
  const centre = tileAt(s, x, y)!;
  if (centre.rv) score += 2 * centre.rv;
  if (water > 0 && water < 6) score += 8;
  if (water >= 6) score -= 10;
  return score;
}

/**
 * The advanced levels' view of a site: siteScore plus a clear premium for what makes a colony
 * worth the investment (bonus resources, rivers, rich food tiles, sea access), on the tiles no
 * other colony works. Chasing these spreads colonies out irregularly instead of in a grid.
 */
export function keenSiteScore(s: GameState, x: number, y: number): number {
  const base = siteScore(s, x, y);
  if (base === -Infinity) return base;
  const near = neighbourColonies(s, x, y);
  let extra = 0;
  let water = 0;
  for (const p of [{ x, y }, ...neighbours(s, x, y)]) {
    const tile = tileAt(s, p.x, p.y)!;
    const weight = shared(near, p.x, p.y) ? SHARED_TILE_VALUE : 1;
    if (tile.b) extra += 5 * weight;
    if (isWater(tile)) {
      water++;
      continue;
    }
    if (tile.rv) extra += 1.5 * weight;
    if (baseTileYield(tile, 'food') >= 4) extra += 1.5 * weight;
  }
  if (water > 0 && water < 6) extra += 2;
  return base + extra;
}

/**
 * The best place within `radius` of x, y to found a colony: the site's score less `perTile` for
 * every tile of the way and any `penalty`. With `stay`, the tile the unit stands on is the first
 * candidate (at its plain score) and wins ties; after that ties go to the first site found, row by
 * row, so the choice is deterministic.
 */
export function bestColonySite(
  s: GameState,
  x: number,
  y: number,
  opts: { radius: number; score: (x: number, y: number) => number; perTile: number; stay: boolean; penalty?: (x: number, y: number) => number; overLand?: boolean },
): { x: number; y: number; score: number } {
  let best = { x, y, score: opts.stay ? opts.score(x, y) : -Infinity };
  const reach = opts.overLand ? landReach(s, x, y, opts.radius) : undefined;
  for (let dy = -opts.radius; dy <= opts.radius; dy++) {
    for (let dx = -opts.radius; dx <= opts.radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!tileAt(s, nx, ny)) continue;
      if (reach && !reach.has(ny * s.map.width + nx)) continue;
      const score = opts.score(nx, ny) - distance(x, y, nx, ny) * opts.perTile - (opts.penalty?.(nx, ny) ?? 0);
      if (score > best.score) best = { x: nx, y: ny, score };
    }
  }
  return best;
}

/** Land tiles (as y × width + x) a colonist at x, y can walk to without leaving the square of the given radius. */
export function landReach(s: GameState, x: number, y: number, radius: number): Set<number> {
  const w = s.map.width;
  const seen = new Set([y * w + x]);
  const queue = [{ x, y }];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbours(s, cur.x, cur.y)) {
      const i = n.y * w + n.x;
      if (seen.has(i) || distance(n.x, n.y, x, y) > radius || isWater(tileAt(s, n.x, n.y)!)) continue;
      seen.add(i);
      queue.push(n);
    }
  }
  return seen;
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
    if (brave && offencePower(s, u) >= braveDefence(s, brave) * 2.5) {
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

