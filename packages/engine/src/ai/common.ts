import { colonySiteProblem } from '../colony.js';
import { braveDefence } from '../braves.js';
import { attack, defencePower, offencePower } from '../combat.js';
import { UNIT_TYPES } from '../rules/units.js';
import { RuleError } from '../errors.js';
import { describeMove, findPath, leaveShip, moveUnit, setDestination } from '../movement.js';
import { baseTileYield } from '../production.js';
import {
  cargoFree,
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
import type { Brave, Colony, GameState, Player, Tile, Unit } from '../types.js';
import { goodsOf } from '../scenarios/index.js';

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

/**
 * While bestColonySite searches (scoring sites changes nothing): the colonies that can be near a
 * site in its square, and the land values (landValue) worked out so far, by tile index. Each tile
 * belongs to up to nine sites.
 */
let search: { x: number; y: number; radius: number; colonies: Colony[]; land: Map<number, number> } | null = null;

/** Colonies close enough to share a work tile with a colony at x, y. */
function neighbourColonies(s: GameState, x: number, y: number): Colony[] {
  // Within the search's square, only the colonies within two tiles of it can be (in the same order).
  const pool = search && distance(search.x, search.y, x, y) <= search.radius ? search.colonies : Object.values(s.colonies);
  return pool.filter((c) => distance(c.x, c.y, x, y) <= 2);
}

const shared = (near: Colony[], x: number, y: number) => near.some((c) => distance(c.x, c.y, x, y) <= 1);

export function siteScore(s: GameState, x: number, y: number): number {
  if (colonySiteProblem(s, x, y)) return -Infinity;
  return plainSiteScore(s, x, y, neighbourColonies(s, x, y));
}

/**
 * siteScore of a site that passed colonySiteProblem, with its neighbouring colonies. That check
 * leaves no colony on the site or next to it, so none of its tiles is a colony's.
 */
function plainSiteScore(s: GameState, x: number, y: number, near: Colony[]): number {
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
    score += landValue(s, p.y * s.map.width + p.x, tile) * weight;
  }
  // A river through the centre: road-speed travel inland, and its yield bonus counted above.
  const centre = tileAt(s, x, y)!;
  if (centre.rv) score += 2 * centre.rv;
  if (water > 0 && water < 6) score += 8;
  if (water >= 6) score -= 10;
  return score;
}

/** A land tile's worth to a site: its food and its best other good. */
function landValue(s: GameState, i: number, tile: Tile): number {
  const known = search?.land.get(i);
  if (known !== undefined) return known;
  let best = 0;
  for (const g of goodsOf(s)) if (g !== 'food') best = Math.max(best, baseTileYield(tile, g));
  const value = baseTileYield(tile, 'food') * 1.2 + best * 0.6;
  search?.land.set(i, value);
  return value;
}

/**
 * The advanced levels' view of a site: siteScore plus a clear premium for what makes a colony
 * worth the investment (bonus resources, rivers, rich food tiles, sea access), on the tiles no
 * other colony works. Chasing these spreads colonies out irregularly instead of in a grid.
 */
export function keenSiteScore(s: GameState, x: number, y: number): number {
  if (colonySiteProblem(s, x, y)) return -Infinity;
  const near = neighbourColonies(s, x, y);
  const base = plainSiteScore(s, x, y, near);
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
  const outer = search;
  search = { x, y, radius: opts.radius, colonies: Object.values(s.colonies).filter((c) => distance(c.x, c.y, x, y) <= opts.radius + 2), land: new Map() };
  try {
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
  } finally {
    search = outer;
  }
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
  const out: Colony[] = [];
  for (const id in s.colonies) {
    const c = s.colonies[id];
    if (c.owner === p.id) out.push(c);
  }
  return out;
}

/** How many of the player's units pass the test (a plain loop, in record order). */
export function countUnits(s: GameState, p: Player, test: (u: Unit) => boolean): number {
  let n = 0;
  for (const id in s.units) {
    const u = s.units[id];
    if (u.owner === p.id && test(u)) n++;
  }
  return n;
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

/** What stands on one tile next to a unit (tilesAround). */
interface TileAround {
  units: Unit[];
  colony?: Colony;
  braves: Brave[];
}

/**
 * The units on the map, the colony and the braves on each tile next to x, y (not x, y itself), at
 * (dy + 1) × 3 + (dx + 1); undefined where nothing stands. Each list is in the order unitsAt,
 * colonyAt and bravesAt would give.
 */
function tilesAround(s: GameState, x: number, y: number): (TileAround | undefined)[] {
  const out: (TileAround | undefined)[] = new Array(9);
  const at = (tx: number, ty: number): TileAround | undefined => {
    const dx = tx - x;
    const dy = ty - y;
    if (dx < -1 || dx > 1 || dy < -1 || dy > 1 || (dx === 0 && dy === 0)) return undefined;
    const i = (dy + 1) * 3 + (dx + 1);
    return (out[i] ??= { units: [], braves: [] });
  };
  for (const id in s.units) {
    const o = s.units[id];
    if (o.loc.kind === 'map') at(o.loc.x, o.loc.y)?.units.push(o);
  }
  for (const id in s.colonies) {
    const c = s.colonies[id];
    const t = at(c.x, c.y);
    if (t && !t.colony) t.colony = c;
  }
  for (const b of Object.values(s.braves ?? {})) at(b.x, b.y)?.braves.push(b);
  return out;
}

/** Armed units strike adjacent enemies when the odds favour them. */
export function aiFight(s: GameState, p: Player, u: Unit): boolean {
  const pos = unitPosition(s, u);
  if (!pos || u.moves <= 0) return false;
  const atWar = (owner: string) => p.stance[owner] === 'war';
  // Artillery is costly to lose: it only fights with a clear edge, damaged artillery with a larger one.
  const margin = u.type === 'damagedArtillery' ? 1.5 : UNIT_TYPES[u.type].kind === 'artillery' ? 1.25 : 1;
  // What stands on the tiles around, gathered in one pass over the units, colonies and braves
  // (in their usual order, as unitsAt, colonyAt and hostileBraveAt see them) instead of one per tile.
  const around = tilesAround(s, pos.x, pos.y);
  for (const n of neighbours(s, pos.x, pos.y)) {
    const near = around[(n.y - pos.y + 1) * 3 + (n.x - pos.x + 1)];
    if (!near) continue;
    const colony = near.colony;
    if (colony && atWar(colony.owner)) {
      const defenders = near.units.filter((o) => o.owner === colony.owner && !isShip(o));
      const best = Math.max(0, ...defenders.map((d) => defencePower(s, d)));
      if (offencePower(s, u) >= best * margin) {
        attack(s, u.id, { colonyId: colony.id });
        return true;
      }
    }
    const enemy = near.units.find((o) => atWar(o.owner) && isShip(o) === isShip(u));
    if (enemy && offencePower(s, u, enemy) >= defencePower(s, enemy) * margin) {
      attack(s, u.id, { unitId: enemy.id });
      return true;
    }
    // Hostile braves next to the unit, when the odds are good.
    const brave = !isShip(u) ? near.braves.find((b) => s.tribes.find((t) => t.id === b.tribe)?.stance[p.id] === 'war') : undefined;
    if (brave && offencePower(s, u) >= braveDefence(s, brave) * 2.5 * margin) {
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

/**
 * Colonists of a nation that has no colony yet, put ashore where no colony can be founded within
 * reach on foot: another nation founded one on the same small island first. On a continent this
 * hardly happens; among small islands (the Caribbean) it strands a nation's first landing for the
 * whole game unless a ship takes them off again (`fetchStranded`, `boardRescue`).
 */
export function strandedSettlers(s: GameState, p: Player): Unit[] {
  if (Object.values(s.colonies).some((c) => c.owner === p.id)) return [];
  return Object.values(s.units).filter((u) => u.owner === p.id && u.loc.kind === 'map' && u.role !== 'scout' && UNIT_TYPES[u.type].kind === 'colonist' && stranded(s, u));
}

/** Whether a colonist ashore has no tile it could found a colony on within 5 tiles' walk. */
function stranded(s: GameState, u: Unit): boolean {
  if (u.loc.kind !== 'map') return false;
  const w = s.map.width;
  for (const i of landReach(s, u.loc.x, u.loc.y, 5)) if (siteScore(s, i % w, Math.floor(i / w)) > 0) return false;
  return true;
}

/**
 * An empty ship of a nation with stranded first settlers sails next to them, so they can board.
 * Returns whether it is on that errand.
 */
export function fetchStranded(s: GameState, p: Player, ship: Unit): boolean {
  if (ship.loc.kind !== 'map' || cargoFree(s, ship) <= 0) return false;
  const units = strandedSettlers(s, p);
  if (!units.length) return false;
  for (const u of units) {
    if (u.loc.kind !== 'map') continue;
    const { x, y } = u.loc;
    if (distance(ship.loc.x, ship.loc.y, x, y) <= 1) return true;
    const spot = neighbours(s, x, y).find((n) => isWater(tileAt(s, n.x, n.y)!) && !unitsAt(s, n.x, n.y).some((o) => o.owner !== p.id));
    if (spot && findPath(s, ship, spot.x, spot.y)) {
      setDestination(s, ship.id, spot);
      return true;
    }
  }
  return false;
}

/** A stranded settler boards an own ship with room next to it. Returns whether it did. */
export function boardRescue(s: GameState, p: Player, u: Unit): boolean {
  if (u.loc.kind !== 'map' || u.moves <= 0 || Object.values(s.colonies).some((c) => c.owner === p.id) || !stranded(s, u)) return false;
  const { x, y } = u.loc;
  for (const n of neighbours(s, x, y)) {
    const ship = unitsAt(s, n.x, n.y).find((o) => o.owner === p.id && isShip(o) && cargoFree(s, o) > 0);
    if (!ship) continue;
    const dir = directionTo(x, y, n.x, n.y)!;
    if (describeMove(s, u.id, dir).kind !== 'board') continue;
    moveUnit(s, u.id, dir);
    return true;
  }
  return false;
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

