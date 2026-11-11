/**
 * The map grid: which tiles are next to which, how far apart two tiles are, the tiles within a
 * distance and a colony's work area. Every rule that means "next to", "within N tiles" or "the
 * colony's tiles" asks the game's grid (`gridOf(s)`) instead of looping over a square itself, so a
 * scenario can choose another grid (docs/ROADMAP.md, "Hex maps as a scenario option").
 *
 * Only squares exist today (`SQUARE`), and a scenario that sets no `map.grid` plays on them. The
 * map itself stays a rectangle of rows (`y * width + x`) whatever the grid: bounds, row scans and
 * whole-map passes are not the grid's business.
 *
 * Orders are part of the contract, because the computer players take the first of equals:
 * - `directions`, `neighbours` and `workArea` go round from the north, clockwise
 *   (n, ne, e, se, s, sw, w, nw on squares). Rivers store their course as one bit per direction in
 *   this order (types.ts `Tile.rd`).
 * - `tilesWithin` and `ring` go row by row, top to bottom and left to right within a row: the order
 *   of the `for dy … for dx …` loops they replace.
 *
 * The `…Offsets` functions are the allocation-free forms for hot loops: flat arrays
 * `[dx0, dy0, dx1, dy1, …]` that must not be changed. They take the tile because on some grids
 * (hexagons in offset rows) the offsets depend on it; on squares they do not.
 */
import { scenarioOf } from './scenarios/index.js';
import type { Scenario } from './scenarios/types.js';
import type { GameConfig } from './types.js';

/** The grids a scenario can choose (`Scenario.map.grid`). */
export type GridKind = 'square';

/** A direction a unit can move in. */
export type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface GridDirection {
  readonly id: Direction;
  readonly dx: number;
  readonly dy: number;
}

export interface MapBounds {
  readonly width: number;
  readonly height: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

export interface Grid {
  readonly kind: GridKind;
  /** The directions, clockwise from the north. */
  readonly directions: readonly GridDirection[];
  /** How far from the colony its work area reaches (in `distance`). */
  readonly workRadius: number;
  /** Steps between two tiles, ignoring terrain. */
  distance(ax: number, ay: number, bx: number, by: number): number;
  /** Whether the tile is on the map. */
  inBounds(map: MapBounds, x: number, y: number): boolean;
  /** The tile one step away in a direction (it may be off the map). Throws for an unknown direction. */
  step(x: number, y: number, dir: Direction): GridPoint;
  /** The direction of the first step from one tile towards another; undefined for the same tile. */
  directionTowards(fx: number, fy: number, tx: number, ty: number): Direction | undefined;
  /** Offsets of the neighbours, in `directions` order. */
  neighbourOffsets(x: number, y: number): readonly number[];
  /** Offsets of the tiles within `r` (the tile itself included), row by row. */
  withinOffsets(x: number, y: number, r: number): readonly number[];
  /** Offsets of the tiles exactly `r` away (r ≥ 1), row by row. */
  ringOffsets(x: number, y: number, r: number): readonly number[];
  /** Offsets of a colony's work area (its own tile left out), in `directions` order. */
  workOffsets(x: number, y: number): readonly number[];
  /** The neighbours on the map, in `directions` order. */
  neighbours(map: MapBounds, x: number, y: number): GridPoint[];
  /** The tiles on the map within `r` (the tile itself included), row by row. */
  tilesWithin(map: MapBounds, x: number, y: number, r: number): GridPoint[];
  /** The tiles on the map exactly `r` away (r ≥ 1), row by row. */
  ring(map: MapBounds, x: number, y: number, r: number): GridPoint[];
  /** The work area on the map of a colony on this tile (its own tile left out), in `directions` order. */
  workArea(map: MapBounds, x: number, y: number): GridPoint[];
}

const SQUARE_DIRECTIONS = [
  { id: 'n', dx: 0, dy: -1 },
  { id: 'ne', dx: 1, dy: -1 },
  { id: 'e', dx: 1, dy: 0 },
  { id: 'se', dx: 1, dy: 1 },
  { id: 's', dx: 0, dy: 1 },
  { id: 'sw', dx: -1, dy: 1 },
  { id: 'w', dx: -1, dy: 0 },
  { id: 'nw', dx: -1, dy: -1 },
] as const satisfies readonly GridDirection[];

const SQUARE_NEIGHBOURS: readonly number[] = SQUARE_DIRECTIONS.flatMap((d) => [d.dx, d.dy]);
const squareWithin: number[][] = [];
const squareRing: number[][] = [];
const squareWithinOffsets = (r: number): readonly number[] => (squareWithin[r] ??= squareRows(r, false));
const squareRingOffsets = (r: number): readonly number[] => (squareRing[r] ??= squareRows(r, true));

function squareRows(r: number, ringOnly: boolean): number[] {
  const out: number[] = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (ringOnly && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      out.push(dx, dy);
    }
  }
  return out;
}

function points(map: MapBounds, x: number, y: number, offsets: readonly number[]): GridPoint[] {
  const out: GridPoint[] = [];
  for (let k = 0; k < offsets.length; k += 2) {
    const nx = x + offsets[k];
    const ny = y + offsets[k + 1];
    if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height) out.push({ x: nx, y: ny });
  }
  return out;
}

/** Square tiles with eight neighbours; distance is the larger of the two axes (Chebyshev). */
export const SQUARE: Grid = {
  kind: 'square',
  directions: SQUARE_DIRECTIONS,
  workRadius: 1,
  distance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  },
  inBounds(map, x, y) {
    return x >= 0 && y >= 0 && x < map.width && y < map.height;
  },
  step(x, y, dir) {
    const d = SQUARE_DIRECTIONS.find((d) => d.id === dir);
    if (!d) throw new Error(`Unknown direction ${dir}`);
    return { x: x + d.dx, y: y + d.dy };
  },
  directionTowards(fx, fy, tx, ty) {
    const dx = Math.sign(tx - fx);
    const dy = Math.sign(ty - fy);
    return SQUARE_DIRECTIONS.find((d) => d.dx === dx && d.dy === dy)?.id;
  },
  neighbourOffsets() {
    return SQUARE_NEIGHBOURS;
  },
  withinOffsets(_x, _y, r) {
    return squareWithinOffsets(r);
  },
  ringOffsets(_x, _y, r) {
    return squareRingOffsets(r);
  },
  workOffsets() {
    return SQUARE_NEIGHBOURS;
  },
  neighbours(map, x, y) {
    return points(map, x, y, SQUARE_NEIGHBOURS);
  },
  tilesWithin(map, x, y, r) {
    return points(map, x, y, squareWithinOffsets(r));
  },
  ring(map, x, y, r) {
    return points(map, x, y, squareRingOffsets(r));
  },
  workArea(map, x, y) {
    return points(map, x, y, SQUARE_NEIGHBOURS);
  },
};

const GRIDS: Readonly<Record<GridKind, Grid>> = { square: SQUARE };

/** The grid a scenario's maps use: `map.grid`, squares when it sets none. */
export function gridIn(scenario: Pick<Scenario, 'map'>): Grid {
  const kind = scenario.map.grid ?? 'square';
  const grid = GRIDS[kind];
  if (!grid) throw new Error(`Unknown grid "${kind}".`);
  return grid;
}

/**
 * The grid a game is played on (its scenario's). Cheap, but hot loops read it once, before the loop.
 */
export function gridOf(s: { config: Pick<GameConfig, 'scenario'> }): Grid {
  return gridIn(scenarioOf(s));
}
