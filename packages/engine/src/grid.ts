/**
 * The map grid: which tiles are next to which, how far apart two tiles are, the tiles within a
 * distance and a colony's work area. Every rule that means "next to", "within N tiles" or "the
 * colony's tiles" asks the game's grid (`gridOf(s)`) instead of looping over a square itself, so a
 * scenario can choose another grid (docs/design/hex-maps.md).
 *
 * Three grids exist: squares (`SQUARE`), and hexagons in two orientations (Beta 4, hex-maps.md H1,
 * H2, H5): pointy-top hexes in offset rows (`HEX_POINTY`, odd rows shifted half a tile east,
 * "odd-r") and flat-top hexes in offset columns (`HEX_FLAT`, odd columns shifted half a tile
 * south, "odd-q"). A scenario that sets no `map.grid` plays on squares. The map itself stays a
 * rectangle of rows (`y * width + x`) whatever the grid, and positions stay `{ x, y }` columns and
 * rows: bounds, row scans and whole-map passes are not the grid's business. On hexes, distances,
 * rings, lines and directions go through cube coordinates inside this file; nothing outside sees
 * them.
 *
 * Orders are part of the contract, because the computer players take the first of equals:
 * - `directions`, `neighbours` and `workArea` go round from the north, clockwise: n, ne, e, se, s,
 *   sw, w, nw on squares; ne, e, se, sw, w, nw on pointy hexes (no n or s); n, ne, se, s, sw, nw
 *   on flat hexes (no e or w). Rivers store their course as one bit per direction in this order
 *   (types.ts `Tile.rd`).
 * - `tilesWithin` and `ring` go row by row, top to bottom and left to right within a row: the order
 *   of the `for dy … for dx …` loops they replace.
 *
 * The `…Offsets` functions are the allocation-free forms for hot loops: flat arrays
 * `[dx0, dy0, dx1, dy1, …]` that must not be changed. They take the tile because on hexagons the
 * offsets depend on its row (pointy) or column (flat) parity; on squares they do not. Each grid
 * caches one array per parity and radius.
 */
import { scenarioOf } from './scenarios/index.js';
import type { Scenario } from './scenarios/types.js';
import type { GameConfig } from './types.js';

/** The grids a scenario can choose (`Scenario.map.grid`). */
export type GridKind = 'square' | 'hex';

/** How a hex scenario lays out its hexes (`Scenario.map.hex.orientation`). */
export type HexOrientation = 'pointy' | 'flat';

/** A direction a unit can move in. */
export type Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface GridDirection {
  readonly id: Direction;
  /**
   * The step in this direction from the tile at column 0, row 0. On squares that is the step from
   * every tile; on hexes it depends on the row (pointy) or column (flat), so use `step` or
   * `neighbourOffsets` for a given tile.
   */
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
  /** On hexes, their orientation; absent on squares. */
  readonly orientation?: HexOrientation;
  /** The directions, clockwise from the north. */
  readonly directions: readonly GridDirection[];
  /** How far from the colony its first work ring reaches (in `distance`); workarea.ts adds rings. */
  readonly workRadius: number;
  /** Steps between two tiles, ignoring terrain. */
  distance(ax: number, ay: number, bx: number, by: number): number;
  /** Whether the tile is on the map. */
  inBounds(map: MapBounds, x: number, y: number): boolean;
  /** The tile one step away in a direction (it may be off the map). Throws for a direction the grid lacks. */
  step(x: number, y: number, dir: Direction): GridPoint;
  /**
   * The direction of the first step from one tile towards another; undefined for the same tile.
   * On hexes it is the first step of `line`, so it always gets one step nearer.
   */
  directionTowards(fx: number, fy: number, tx: number, ty: number): Direction | undefined;
  /** The index in `directions` of the neighbour at (x + dx, y + dy), or -1 when that is not a neighbour. */
  directionIndex(x: number, y: number, dx: number, dy: number): number;
  /**
   * A straight line of tiles from one tile to another, both ends included: `distance + 1` tiles,
   * each a neighbour of the one before.
   */
  line(ax: number, ay: number, bx: number, by: number): GridPoint[];
  /** Offsets of the neighbours, in `directions` order. */
  neighbourOffsets(x: number, y: number): readonly number[];
  /** Offsets of the tiles within `r` (the tile itself included), row by row. */
  withinOffsets(x: number, y: number, r: number): readonly number[];
  /** Offsets of the tiles exactly `r` away (r ≥ 1), row by row. */
  ringOffsets(x: number, y: number, r: number): readonly number[];
  /** Offsets of a colony's first work ring (its own tile left out), in `directions` order. */
  workOffsets(x: number, y: number): readonly number[];
  /** The neighbours on the map, in `directions` order. */
  neighbours(map: MapBounds, x: number, y: number): GridPoint[];
  /** The tiles on the map within `r` (the tile itself included), row by row. */
  tilesWithin(map: MapBounds, x: number, y: number, r: number): GridPoint[];
  /** The tiles on the map exactly `r` away (r ≥ 1), row by row. */
  ring(map: MapBounds, x: number, y: number, r: number): GridPoint[];
  /** The first work ring on the map of a colony on this tile (its own tile left out), in `directions` order. */
  workArea(map: MapBounds, x: number, y: number): GridPoint[];
  /**
   * The tile's centre in tile widths, for sampling noise over the map (mapgen.ts): (x, y) on
   * squares; on hexes rows (pointy) or columns (flat) are √3/2 apart and every other one is
   * shifted by half a tile. Drawing has its own geometry (render API).
   */
  centre(x: number, y: number): GridPoint;
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

const inBounds = (map: MapBounds, x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;

/** Square tiles with eight neighbours; distance is the larger of the two axes (Chebyshev). */
export const SQUARE: Grid = {
  kind: 'square',
  directions: SQUARE_DIRECTIONS,
  workRadius: 1,
  distance(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  },
  inBounds,
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
  directionIndex(_x, _y, dx, dy) {
    for (let i = 0; i < SQUARE_DIRECTIONS.length; i++) if (SQUARE_DIRECTIONS[i].dx === dx && SQUARE_DIRECTIONS[i].dy === dy) return i;
    return -1;
  },
  line(ax, ay, bx, by) {
    // Rounded straight steps, as stored rivers have always been read (rivers.ts parseRivers).
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const out: GridPoint[] = [{ x: ax, y: ay }];
    for (let i = 1; i <= steps; i++) out.push({ x: Math.round(ax + ((bx - ax) * i) / steps), y: Math.round(ay + ((by - ay) * i) / steps) });
    return out;
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
  centre(x, y) {
    return { x, y };
  },
};

// ---- Hexagons ----

/** Rows (pointy) or columns (flat) of hexes are this many tile widths apart. */
const HEX_ROW = Math.sqrt(3) / 2;

/**
 * One hex orientation: the offset layout's conversion to and from cube coordinates (q, r; the
 * third, s, is -q - r) and the directions' cube steps, clockwise from the north.
 */
interface HexLayout {
  readonly orientation: HexOrientation;
  /** 0 or 1: the parity of the tile's row (pointy) or column (flat). */
  parity(x: number, y: number): number;
  toQ(x: number, y: number): number;
  toR(x: number, y: number): number;
  fromCube(q: number, r: number): GridPoint;
  readonly cube: readonly { id: Direction; dq: number; dr: number }[];
  centre(x: number, y: number): GridPoint;
}

// Odd rows shifted east: q = x - (y - (y & 1)) / 2, r = y. (`y & 1` is 1 for odd negatives too.)
const POINTY: HexLayout = {
  orientation: 'pointy',
  parity: (_x, y) => y & 1,
  toQ: (x, y) => x - ((y - (y & 1)) >> 1),
  toR: (_x, y) => y,
  fromCube: (q, r) => ({ x: q + ((r - (r & 1)) >> 1), y: r }),
  cube: [
    { id: 'ne', dq: 1, dr: -1 },
    { id: 'e', dq: 1, dr: 0 },
    { id: 'se', dq: 0, dr: 1 },
    { id: 'sw', dq: -1, dr: 1 },
    { id: 'w', dq: -1, dr: 0 },
    { id: 'nw', dq: 0, dr: -1 },
  ],
  centre: (x, y) => ({ x: x + 0.5 * (y & 1), y: y * HEX_ROW }),
};

// Odd columns shifted south: q = x, r = y - (x - (x & 1)) / 2.
const FLAT: HexLayout = {
  orientation: 'flat',
  parity: (x) => x & 1,
  toQ: (x) => x,
  toR: (x, y) => y - ((x - (x & 1)) >> 1),
  fromCube: (q, r) => ({ x: q, y: r + ((q - (q & 1)) >> 1) }),
  cube: [
    { id: 'n', dq: 0, dr: -1 },
    { id: 'ne', dq: 1, dr: -1 },
    { id: 'se', dq: 1, dr: 0 },
    { id: 's', dq: 0, dr: 1 },
    { id: 'sw', dq: -1, dr: 1 },
    { id: 'nw', dq: -1, dr: 0 },
  ],
  centre: (x, y) => ({ x: x * HEX_ROW, y: y + 0.5 * (x & 1) }),
};

/** Rounds fractional cube coordinates to the nearest hex (the standard cube rounding). */
function cubeRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const eq = Math.abs(rq - q);
  const er = Math.abs(rr - r);
  const es = Math.abs(rs - s);
  if (eq > er && eq > es) rq = -rr - rs;
  else if (er > es) rr = -rq - rs;
  return [rq, rr];
}

function makeHex(layout: HexLayout): Grid {
  const { toQ, toR, parity } = layout;
  const directions: GridDirection[] = layout.cube.map((d) => {
    const p = layout.fromCube(d.dq, d.dr);
    return { id: d.id, dx: p.x, dy: p.y };
  });
  /** A tile of each parity at q = r = 0's row or column, to build offsets from. */
  const base = (p: number): GridPoint => (layout.orientation === 'pointy' ? { x: 0, y: p } : { x: p, y: 0 });
  const neighbourTable = [0, 1].map((p) => {
    const b = base(p);
    const q = toQ(b.x, b.y);
    const r = toR(b.x, b.y);
    return layout.cube.flatMap((d) => {
      const n = layout.fromCube(q + d.dq, r + d.dr);
      return [n.x - b.x, n.y - b.y];
    });
  });
  const distance = (ax: number, ay: number, bx: number, by: number) => {
    const dq = toQ(ax, ay) - toQ(bx, by);
    const dr = toR(ax, ay) - toR(bx, by);
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  };
  const rows = (p: number, r: number, ringOnly: boolean): number[] => {
    const b = base(p);
    const out: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = distance(b.x, b.y, b.x + dx, b.y + dy);
        if (ringOnly ? d === r : d <= r) out.push(dx, dy);
      }
    }
    return out;
  };
  const within: number[][][] = [[], []];
  const rings: number[][][] = [[], []];
  const withinOffsets = (x: number, y: number, r: number): readonly number[] => {
    const p = parity(x, y);
    return (within[p][r] ??= rows(p, r, false));
  };
  const ringOffsets = (x: number, y: number, r: number): readonly number[] => {
    const p = parity(x, y);
    return (rings[p][r] ??= rows(p, r, true));
  };
  const neighbourOffsets = (x: number, y: number): readonly number[] => neighbourTable[parity(x, y)];
  const directionIndex = (x: number, y: number, dx: number, dy: number) => {
    const t = neighbourTable[parity(x, y)];
    for (let k = 0; k < t.length; k += 2) if (t[k] === dx && t[k + 1] === dy) return k >> 1;
    return -1;
  };
  // A tiny nudge keeps lines that run exactly between two hexes on one side of them.
  const EPS_Q = 1e-6;
  const EPS_R = 2e-6;
  const line = (ax: number, ay: number, bx: number, by: number): GridPoint[] => {
    const n = distance(ax, ay, bx, by);
    const aq = toQ(ax, ay) + EPS_Q;
    const ar = toR(ax, ay) + EPS_R;
    const bq = toQ(bx, by) + EPS_Q;
    const br = toR(bx, by) + EPS_R;
    const out: GridPoint[] = [{ x: ax, y: ay }];
    for (let i = 1; i <= n; i++) {
      const [q, r] = cubeRound(aq + ((bq - aq) * i) / n, ar + ((br - ar) * i) / n);
      out.push(layout.fromCube(q, r));
    }
    return out;
  };
  return {
    kind: 'hex',
    orientation: layout.orientation,
    directions,
    workRadius: 1,
    distance,
    inBounds,
    step(x, y, dir) {
      const i = directions.findIndex((d) => d.id === dir);
      if (i < 0) throw new Error(`Unknown direction ${dir} on ${layout.orientation} hexes`);
      const t = neighbourTable[parity(x, y)];
      return { x: x + t[2 * i], y: y + t[2 * i + 1] };
    },
    directionTowards(fx, fy, tx, ty) {
      if (fx === tx && fy === ty) return undefined;
      const n = distance(fx, fy, tx, ty);
      let nx = tx;
      let ny = ty;
      if (n > 1) {
        const aq = toQ(fx, fy) + EPS_Q;
        const ar = toR(fx, fy) + EPS_R;
        const [q, r] = cubeRound(aq + (toQ(tx, ty) + EPS_Q - aq) / n, ar + (toR(tx, ty) + EPS_R - ar) / n);
        const p = layout.fromCube(q, r);
        nx = p.x;
        ny = p.y;
      }
      return directions[directionIndex(fx, fy, nx - fx, ny - fy)].id;
    },
    directionIndex,
    line,
    neighbourOffsets,
    withinOffsets,
    ringOffsets,
    workOffsets: neighbourOffsets,
    neighbours(map, x, y) {
      return points(map, x, y, neighbourOffsets(x, y));
    },
    tilesWithin(map, x, y, r) {
      return points(map, x, y, withinOffsets(x, y, r));
    },
    ring(map, x, y, r) {
      return points(map, x, y, ringOffsets(x, y, r));
    },
    workArea(map, x, y) {
      return points(map, x, y, neighbourOffsets(x, y));
    },
    centre: layout.centre,
  };
}

/** Pointy-top hexes in offset rows, odd rows shifted half a tile east (six directions: ne, e, se, sw, w, nw). */
export const HEX_POINTY: Grid = makeHex(POINTY);

/** Flat-top hexes in offset columns, odd columns shifted half a tile south (six directions: n, ne, se, s, sw, nw). */
export const HEX_FLAT: Grid = makeHex(FLAT);

/** The grid a scenario's maps use: `map.grid` (and on hexes `map.hex.orientation`), squares when it sets none. */
export function gridIn(scenario: Pick<Scenario, 'map'>): Grid {
  const kind = scenario.map.grid ?? 'square';
  if (kind === 'square') return SQUARE;
  if (kind === 'hex') {
    const orientation = scenario.map.hex?.orientation ?? 'pointy';
    if (orientation === 'pointy') return HEX_POINTY;
    if (orientation === 'flat') return HEX_FLAT;
    throw new Error(`Unknown hex orientation "${orientation as string}".`);
  }
  throw new Error(`Unknown grid "${kind as string}".`);
}

/**
 * The grid a game is played on (its scenario's). Cheap, but hot loops read it once, before the loop.
 */
export function gridOf(s: { config: Pick<GameConfig, 'scenario'> }): Grid {
  return gridIn(scenarioOf(s));
}
