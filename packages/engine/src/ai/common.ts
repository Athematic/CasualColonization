import { gridOf, type Grid } from '../grid.js';
import { colonySiteProblem } from '../colony.js';
import { braveDefence } from '../braves.js';
import { defendedByFriend } from '../peopletreaties.js';
import { attack, defencePower, offencePower } from '../combat.js';
import { UNIT_TYPES } from '../rules/units.js';
import { RuleError } from '../errors.js';
import { describeMove, findPath, goTo, leaveShip, moveUnit, setDestination } from '../movement.js';
import { baseTileYield } from '../production.js';
import {
  cargoFree,
  colonyAt,
  isCoastal,
  isShip,
  isWater,
  neighbours,
  tileAt,
  unitPosition,
  unitsAboard,
  unitsAt,
} from '../queries.js';
import type { Brave, Colony, GameState, Player, Tile, Unit } from '../types.js';
import { goodsOf } from '../scenarios/index.js';
import { ownedUnitsView, colonyList } from '../unitindex.js';
import { reachOffsets, workReach } from '../workarea.js';

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
let search: { x: number; y: number; radius: number; colonies: Colony[]; land: Map<number, number>; scores: SiteScores } | null = null;

/**
 * Site scores (siteScore, keenSiteScore) by tile index, kept for the nation's turn: they depend
 * only on the land, the colonies and the native settlements, and the land changes only at the
 * start of a turn. NaN marks a tile not scored yet. Used while bestColonySite searches; a new
 * turn, another nation moving, or a colony or settlement founded, taken or lost starts afresh.
 */
interface SiteScores {
  key: string;
  plain: Float64Array;
  keen: Float64Array;
}

const siteScoreCache = new WeakMap<GameState, SiteScores>();

function siteScoresFor(s: GameState): SiteScores {
  const w = s.map.width;
  let colonies = 0;
  let settlements = 0;
  const all = colonyList(s);
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    colonies = (colonies * 31 + c.y * w + c.x + 1) % 2147483647;
  }
  for (const id in s.settlements) {
    const st = s.settlements[id];
    settlements = (settlements * 31 + st.y * w + st.x + 1) % 2147483647;
  }
  const key = `${s.turn}:${s.current}:${colonies}:${settlements}`;
  let kept = siteScoreCache.get(s);
  if (!kept || kept.key !== key || kept.plain.length !== s.map.tiles.length) {
    kept = { key, plain: new Float64Array(s.map.tiles.length).fill(NaN), keen: new Float64Array(s.map.tiles.length).fill(NaN) };
    siteScoreCache.set(s, kept);
  }
  return kept;
}

/** Colonies close enough to share a work tile with a colony at x, y. */
function neighbourColonies(s: GameState, x: number, y: number): Colony[] {
  const grid = gridOf(s);
  // Within the search's square, only the colonies within two tiles of it can be (in the same order).
  const pool = search && grid.distance(search.x, search.y, x, y) <= search.radius ? search.colonies : colonyList(s);
  const reach = workReach(s);
  return pool.filter((c) => grid.distance(c.x, c.y, x, y) <= 2 * reach);
}

/** Whether a tile is in the work area of one of these colonies, as far as it can reach (or under one). */
const shared = (grid: Grid, reach: number, near: Colony[], x: number, y: number) => near.some((c) => grid.distance(c.x, c.y, x, y) <= reach);

/**
 * Share of a tile's value a site counts for a tile in the second ring of its work area (hex-maps.md
 * H7): the ring opens later, when the colony grows (or builds), if ever.
 */
export const OUTER_RING_VALUE = 0.5;

export function siteScore(s: GameState, x: number, y: number): number {
  const memo = search?.scores.plain;
  const i = y * s.map.width + x;
  if (memo && !Number.isNaN(memo[i])) return memo[i];
  const score = colonySiteProblem(s, x, y) ? -Infinity : plainSiteScore(s, x, y, neighbourColonies(s, x, y));
  if (memo) memo[i] = score;
  return score;
}

/**
 * siteScore of a site that passed colonySiteProblem, with its neighbouring colonies. That check
 * leaves no colony on the site or next to it, so none of its tiles is a colony's.
 */
function plainSiteScore(s: GameState, x: number, y: number, near: Colony[]): number {
  const grid = gridOf(s);
  const reach = workReach(s);
  const work = reachOffsets(grid, x, y, reach);
  // Tiles past the first ring (only in a scenario whose colonies reach further) count less.
  const inner = grid.workOffsets(x, y).length;
  let score = 0;
  let water = 0;
  // The site itself (k = -2), then its work area.
  for (let k = -2; k < work.length; k += 2) {
    const px = k < 0 ? x : x + work[k];
    const py = k < 0 ? y : y + work[k + 1];
    const tile = tileAt(s, px, py);
    if (!tile) continue;
    let weight = shared(grid, reach, near, px, py) ? SHARED_TILE_VALUE : 1;
    if (k >= inner) weight *= OUTER_RING_VALUE;
    if (isWater(tile)) {
      if (k < inner) water++;
      score += 1.5 * weight;
      continue;
    }
    score += landValue(s, py * s.map.width + px, tile) * weight;
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
  const memo = search?.scores.keen;
  const i = y * s.map.width + x;
  if (memo && !Number.isNaN(memo[i])) return memo[i];
  const score = workKeenSiteScore(s, x, y);
  if (memo) memo[i] = score;
  return score;
}

function workKeenSiteScore(s: GameState, x: number, y: number): number {
  if (colonySiteProblem(s, x, y)) return -Infinity;
  const near = neighbourColonies(s, x, y);
  const base = plainSiteScore(s, x, y, near);
  const grid = gridOf(s);
  const reach = workReach(s);
  const work = reachOffsets(grid, x, y, reach);
  const inner = grid.workOffsets(x, y).length;
  let extra = 0;
  let water = 0;
  // The site itself (k = -2), then its work area.
  for (let k = -2; k < work.length; k += 2) {
    const px = k < 0 ? x : x + work[k];
    const py = k < 0 ? y : y + work[k + 1];
    const tile = tileAt(s, px, py);
    if (!tile) continue;
    let weight = shared(grid, reach, near, px, py) ? SHARED_TILE_VALUE : 1;
    if (k >= inner) weight *= OUTER_RING_VALUE;
    if (tile.b) extra += 5 * weight;
    if (isWater(tile)) {
      if (k < inner) water++;
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
  const grid = gridOf(s);
  const outer = search;
  search = { x, y, radius: opts.radius, colonies: colonyList(s).filter((c) => grid.distance(c.x, c.y, x, y) <= opts.radius + 2 * workReach(s)), land: new Map(), scores: siteScoresFor(s) };
  try {
    let best = { x, y, score: opts.stay ? opts.score(x, y) : -Infinity };
    const reach = opts.overLand ? landReach(s, x, y, opts.radius) : undefined;
    const within = grid.withinOffsets(x, y, opts.radius);
    for (let k = 0; k < within.length; k += 2) {
      const nx = x + within[k];
      const ny = y + within[k + 1];
      if (!tileAt(s, nx, ny)) continue;
      if (reach && !reach.has(ny * s.map.width + nx)) continue;
      const score = opts.score(nx, ny) - grid.distance(x, y, nx, ny) * opts.perTile - (opts.penalty?.(nx, ny) ?? 0);
      if (score > best.score) best = { x: nx, y: ny, score };
    }
    return best;
  } finally {
    search = outer;
  }
}

/** Land tiles (as y × width + x) a colonist at x, y can walk to without going further than the given radius. */
export function landReach(s: GameState, x: number, y: number, radius: number): Set<number> {
  const grid = gridOf(s);
  const w = s.map.width;
  const seen = new Set([y * w + x]);
  const queue = [{ x, y }];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbours(s, cur.x, cur.y)) {
      const i = n.y * w + n.x;
      if (seen.has(i) || grid.distance(n.x, n.y, x, y) > radius || isWater(tileAt(s, n.x, n.y)!)) continue;
      seen.add(i);
      queue.push(n);
    }
  }
  return seen;
}

export function nearestColony(s: GameState, p: Player, x: number, y: number, coastalOnly = false): Colony | undefined {
  const grid = gridOf(s);
  let best: Colony | undefined;
  for (const c of colonyList(s)) {
    if (c.owner !== p.id) continue;
    if (coastalOnly && !isCoastal(s, c.x, c.y)) continue;
    if (!best || grid.distance(c.x, c.y, x, y) < grid.distance(best.x, best.y, x, y)) best = c;
  }
  return best;
}

export function ownColonies(s: GameState, p: Player): Colony[] {
  const out: Colony[] = [];
  const all = colonyList(s);
  for (let i = 0; i < all.length; i++) if (all[i].owner === p.id) out.push(all[i]);
  return out;
}

/** How many of the player's units pass the test (a plain loop, in record order). */
export function countUnits(s: GameState, p: Player, test: (u: Unit) => boolean): number {
  let n = 0;
  const own = ownedUnitsView(s, p.id);
  for (let i = 0; i < own.length; i++) if (test(own[i])) n++;
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
 * The units on the map, the colony and the braves on each tile next to x, y (not x, y itself), by
 * the grid's direction index (`grid.neighbourOffsets` order); undefined where nothing stands or
 * off the map. Each list is in the order unitsAt, colonyAt and bravesAt would give.
 */
function tilesAround(s: GameState, grid: Grid, x: number, y: number): (TileAround | undefined)[] {
  const near = grid.neighbourOffsets(x, y);
  const out: (TileAround | undefined)[] = new Array(near.length >> 1);
  // Units and colonies from the tile indexes (each list in record order, as unitsAt and colonyAt
  // give them), braves in one pass.
  for (let d = 0; d < out.length; d++) {
    const nx = x + near[2 * d];
    const ny = y + near[2 * d + 1];
    if (!grid.inBounds(s.map, nx, ny)) continue;
    const units = unitsAt(s, nx, ny);
    const colony = colonyAt(s, nx, ny);
    if (units.length || colony) out[d] = { units, colony, braves: [] };
  }
  const braves = s.braves;
  if (braves) {
    for (const id in braves) {
      const b = braves[id];
      const dx = b.x - x;
      const dy = b.y - y;
      // Every grid's neighbours are within one tile on both axes.
      if (dx < -1 || dx > 1 || dy < -1 || dy > 1 || (dx === 0 && dy === 0)) continue;
      const d = grid.directionIndex(x, y, dx, dy);
      if (d < 0) continue;
      (out[d] ??= { units: [], braves: [] }).braves.push(b);
    }
  }
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
  const around = tilesAround(s, gridOf(s), pos.x, pos.y);
  for (const near of around) {
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
    const brave = !isShip(u) ? near.braves.find((b) => s.tribes.find((t) => t.id === b.tribe)?.stance[p.id] === 'war' && !(s.treaties && defendedByFriend(s, p.id, b.tribe))) : undefined;
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
  if (colonyList(s).some((c) => c.owner === p.id)) return [];
  return ownedUnitsView(s, p.id).filter((u) => u.loc.kind === 'map' && u.role !== 'scout' && UNIT_TYPES[u.type].kind === 'colonist' && stranded(s, u));
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
  const grid = gridOf(s);
  if (ship.loc.kind !== 'map' || cargoFree(s, ship) <= 0) return false;
  const units = strandedSettlers(s, p);
  if (!units.length) return false;
  for (const u of units) {
    if (u.loc.kind !== 'map') continue;
    const { x, y } = u.loc;
    if (grid.distance(ship.loc.x, ship.loc.y, x, y) <= 1) return true;
    const spot = neighbours(s, x, y).find((n) => isWater(tileAt(s, n.x, n.y)!) && !unitsAt(s, n.x, n.y).some((o) => o.owner !== p.id));
    if (spot && goTo(s, ship, spot.x, spot.y)) {
      return true;
    }
  }
  return false;
}

/** A stranded settler boards an own ship with room next to it. Returns whether it did. */
export function boardRescue(s: GameState, p: Player, u: Unit): boolean {
  if (u.loc.kind !== 'map' || u.moves <= 0 || colonyList(s).some((c) => c.owner === p.id) || !stranded(s, u)) return false;
  const { x, y } = u.loc;
  for (const n of neighbours(s, x, y)) {
    const ship = unitsAt(s, n.x, n.y).find((o) => o.owner === p.id && isShip(o) && cargoFree(s, o) > 0);
    if (!ship) continue;
    const dir = gridOf(s).directionTowards(x, y, n.x, n.y)!;
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
  const dir = gridOf(s).directionTowards(ship.loc.x, ship.loc.y, best.x, best.y)!;
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

