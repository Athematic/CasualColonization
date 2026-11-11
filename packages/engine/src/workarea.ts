/**
 * A colony's work area: the rings of tiles around it its colonists can work (docs/design/hex-maps.md
 * H7). The grid gives the rings (grid.ts); the scenario says how many a colony may reach and what
 * opens each (`Scenario.map.workArea`, a size and/or a building). Absent, a colony works the first
 * ring only, `grid.workArea`, read exactly as before, so every scenario that sets nothing plays as
 * it always has.
 *
 * Two questions, two answers:
 * - "this colony now" (`colonyWorkArea`, `openRings`, `inColonyWorkArea`): its jobs, its
 *   production, the colony screen;
 * - "the most any colony can reach" (`workReach`, `reachOffsets`): claims, leases, native
 *   pressure, site scores and overlap checks.
 *
 * Tiles come in rings: the first ring in the grid's direction order (as `grid.workArea`), then the
 * second ring row by row (as `grid.ring`).
 */
import { gridOf, type Grid, type GridPoint } from './grid.js';
import { colonyWorkers } from './queries.js';
import { scenarioOf } from './scenarios/index.js';
import type { Scenario, WorkRing } from './scenarios/types.js';
import type { Colony, GameState } from './types.js';

/** The most rings a scenario may give a colony (hex-maps.md H7). */
export const MAX_WORK_RINGS = 2;

/** The rings a scenario lists; one (always open) when it lists none. */
function ringsIn(scenario: Pick<Scenario, 'map'>): readonly WorkRing[] | undefined {
  const rings = scenario.map.workArea?.rings;
  return rings && rings.length > 1 ? rings : undefined;
}

/** The most rings any colony can work in this scenario. */
export function workReachIn(scenario: Pick<Scenario, 'map'>): number {
  return ringsIn(scenario)?.length ?? 1;
}

/** The most rings any colony can work in this game (1 unless the scenario lists more). */
export function workReach(s: GameState): number {
  return workReachIn(scenarioOf(s));
}

/** Whether a ring's gate is open for a colony of this size with these buildings. */
function ringOpen(ring: WorkRing, colony: Colony, size: () => number): boolean {
  if (ring.building && !(colony.buildings[ring.building] > 0)) return false;
  return ring.size === undefined || size() >= ring.size;
}

/** How many rings the colony works now: the first, and each next one whose gate is open. */
export function openRings(s: GameState, colony: Colony): number {
  const rings = ringsIn(scenarioOf(s));
  if (!rings) return 1;
  let size: number | undefined;
  const measure = () => (size ??= colonyWorkers(s, colony).length);
  let open = 1;
  while (open < rings.length && ringOpen(rings[open], colony, measure)) open++;
  return open;
}

const reachCache = new WeakMap<readonly number[], number[]>();

/**
 * Offsets of the first `rings` rings around a tile (its own tile left out): the first ring in
 * direction order, then the second ring row by row. Cached; must not be changed.
 */
export function reachOffsets(grid: Grid, x: number, y: number, rings: number): readonly number[] {
  if (rings <= 1) return grid.workOffsets(x, y);
  if (rings > MAX_WORK_RINGS) throw new Error(`A colony works at most ${MAX_WORK_RINGS} rings.`);
  const second = grid.ringOffsets(x, y, 2);
  let out = reachCache.get(second);
  if (!out) {
    out = [...grid.workOffsets(x, y), ...second];
    reachCache.set(second, out);
  }
  return out;
}

function onMap(s: GameState, x: number, y: number, offsets: readonly number[]): GridPoint[] {
  const out: GridPoint[] = [];
  const { width, height } = s.map;
  for (let k = 0; k < offsets.length; k += 2) {
    const nx = x + offsets[k];
    const ny = y + offsets[k + 1];
    if (nx >= 0 && ny >= 0 && nx < width && ny < height) out.push({ x: nx, y: ny });
  }
  return out;
}

/** The tiles on the map the colony can work now (its own tile left out). */
export function colonyWorkArea(s: GameState, colony: Colony): GridPoint[] {
  const grid = gridOf(s);
  const rings = openRings(s, colony);
  if (rings === 1) return grid.workArea(s.map, colony.x, colony.y);
  return onMap(s, colony.x, colony.y, reachOffsets(grid, colony.x, colony.y, rings));
}

/** The tiles on the map any colony on this tile could ever work (its own tile left out). */
export function reachArea(s: GameState, x: number, y: number): GridPoint[] {
  const grid = gridOf(s);
  const reach = workReach(s);
  if (reach === 1) return grid.workArea(s.map, x, y);
  return onMap(s, x, y, reachOffsets(grid, x, y, reach));
}

/** Whether the colony can work this tile now: within its open rings, not its own tile. */
export function inColonyWorkArea(s: GameState, colony: Colony, x: number, y: number): boolean {
  const d = gridOf(s).distance(colony.x, colony.y, x, y);
  return d >= 1 && d <= openRings(s, colony);
}

/**
 * Whether a tile is too far out for the colony now (a ring it reached once has closed). Callers
 * move such workers (colony.ts `releaseClosedRings`).
 */
export function beyondOpenRings(s: GameState, colony: Colony, x: number, y: number): boolean {
  return gridOf(s).distance(colony.x, colony.y, x, y) > openRings(s, colony);
}
