/**
 * Map geometry for every grid (docs/design/hex-maps.md H13): where a tile is in the world, its
 * outline, and the camera's mapping between the world and the screen. Every style, the minimap,
 * the colony screen and picking use these, so they all agree.
 *
 * **World units.** One unit is one tile across:
 * - squares: tile (x, y) covers [x, x + 1) × [y, y + 1), its centre at (x + 0.5, y + 0.5);
 * - pointy-top hexes (offset rows, odd rows shifted half a tile east): one unit wide across the
 *   flats, rows √3/2 apart, the top corner of row 0 at y = 0;
 * - flat-top hexes (offset columns, odd columns shifted half a tile south): one unit tall across
 *   the flats, columns √3/2 apart, the left corner of column 0 at x = 0.
 * So neighbouring tiles' centres are one unit apart on every hex grid (and on squares' edges).
 *
 * **The camera** (`Camera`) holds the world point at the middle of the view and the size of one
 * world unit in CSS pixels (`zoom`). `tileToScreen` gives the top-left corner of a `zoom × zoom`
 * box centred on the tile: on squares that is the tile itself, exactly as before; on hexes the box
 * sits inside the hex, so whatever a style draws at the box's centre lands at the hex's centre.
 */
import { gridOf, SQUARE, type GameMap, type GameState, type Grid } from '@cc/engine';
import type { Camera, Point } from './index.js';

/** Rows (pointy) or columns (flat) of hexes are this many world units apart. */
export const HEX_ROW = Math.sqrt(3) / 2;
/** A hex's circumradius (centre to corner) when it is one unit across the flats. */
export const HEX_RADIUS = 1 / Math.sqrt(3);

/** What the screen geometry needs to know about a view. `grid` wins over `state`'s; neither means squares. */
export interface ViewGeometry {
  camera: Camera;
  width: number;
  height: number;
  grid?: Grid;
  state?: Readonly<GameState>;
}

/** The grid of a view: its own, else its game's, else squares. */
export function viewGrid(view: { grid?: Grid; state?: Readonly<GameState> }): Grid {
  return view.grid ?? (view.state ? gridOf(view.state) : SQUARE);
}

const isHex = (grid: Grid) => grid.kind === 'hex';
const isFlat = (grid: Grid) => grid.orientation === 'flat';

/** The centre of tile (x, y) in world units. */
export function tileCentre(grid: Grid, x: number, y: number): Point {
  if (!isHex(grid)) return { x: x + 0.5, y: y + 0.5 };
  if (isFlat(grid)) return { x: HEX_RADIUS + x * HEX_ROW, y: 0.5 + y + 0.5 * (x & 1) };
  return { x: 0.5 + x + 0.5 * (y & 1), y: HEX_RADIUS + y * HEX_ROW };
}

/** Unit-circle corners of one tile shape, clockwise from the top (squares: top-left). */
const SQUARE_CORNERS: readonly Point[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];
const hexCorners = (start: number): Point[] =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((start + 60 * k) * Math.PI) / 180;
    return { x: HEX_RADIUS * Math.cos(a), y: HEX_RADIUS * Math.sin(a) };
  });
/** Pointy-top: the top corner first, clockwise. */
const POINTY_CORNERS: readonly Point[] = hexCorners(-90);
/** Flat-top: the upper-right corner first, clockwise (the right corner is last). */
const FLAT_CORNERS: readonly Point[] = hexCorners(-60);

/** A tile's corners relative to its centre, in world units, clockwise: 4 on squares, 6 on hexes. Must not be changed. */
export function tileShape(grid: Grid): readonly Point[] {
  return !isHex(grid) ? SQUARE_CORNERS : isFlat(grid) ? FLAT_CORNERS : POINTY_CORNERS;
}

/** The corners of tile (x, y) in world units, clockwise. */
export function tileCorners(grid: Grid, x: number, y: number): Point[] {
  const c = tileCentre(grid, x, y);
  return tileShape(grid).map((p) => ({ x: c.x + p.x, y: c.y + p.y }));
}

/** The size of the whole map in world units. */
export function worldSize(grid: Grid, map: Pick<GameMap, 'width' | 'height'>): { width: number; height: number } {
  if (!isHex(grid)) return { width: map.width, height: map.height };
  if (isFlat(grid)) return { width: 2 * HEX_RADIUS + (map.width - 1) * HEX_ROW, height: map.height + (map.width > 1 ? 0.5 : 0) };
  return { width: map.width + (map.height > 1 ? 0.5 : 0), height: 2 * HEX_RADIUS + (map.height - 1) * HEX_ROW };
}

/** The tile under a world point (it may be off the map). On hexes, the tile whose centre is nearest. */
export function worldToTile(grid: Grid, wx: number, wy: number): Point {
  if (!isHex(grid)) return { x: Math.floor(wx), y: Math.floor(wy) };
  // A first guess by row and column, then the nearest centre among it and the tiles around it.
  const flat = isFlat(grid);
  const gy = flat ? 0 : Math.round((wy - HEX_RADIUS) / HEX_ROW);
  const gx = flat ? Math.round((wx - HEX_RADIUS) / HEX_ROW) : Math.round(wx - 0.5 - 0.5 * (gy & 1));
  const gy2 = flat ? Math.round(wy - 0.5 - 0.5 * (gx & 1)) : gy;
  let best = { x: gx, y: gy2 };
  let bestD = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = tileCentre(grid, gx + dx, gy2 + dy);
      const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: gx + dx, y: gy2 + dy };
      }
    }
  }
  return best;
}

/**
 * The step from tile (x, y)'s centre to its neighbour's in river bit `dir` (the grid's direction
 * order, `grid.neighbourOffsets`), in world units: one unit long on hexes and on squares' edges.
 */
export function neighbourVector(grid: Grid, x: number, y: number, dir: number): [number, number] {
  const o = grid.neighbourOffsets(x, y);
  const dx = o[2 * dir];
  const dy = o[2 * dir + 1];
  if (!isHex(grid)) return [dx, dy];
  const a = tileCentre(grid, x, y);
  const b = tileCentre(grid, x + dx, y + dy);
  return [b.x - a.x, b.y - a.y];
}

const edgeCache = new Map<Grid, readonly (readonly [number, number])[]>();

/**
 * The edge a tile shares with its neighbour in direction `dir` (river bit order), as two indexes
 * into `tileShape(grid)`, in clockwise order. The same for every tile of the grid.
 */
export function edgeCorners(grid: Grid, dir: number): readonly [number, number] {
  let table = edgeCache.get(grid);
  if (!table) {
    const shape = tileShape(grid);
    const n = shape.length;
    table = grid.directions.map((_, d) => {
      const [vx, vy] = neighbourVector(grid, 0, 0, d);
      let best = 0;
      let bestDot = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = shape[i];
        const b = shape[(i + 1) % n];
        const dot = ((a.x + b.x) / 2) * vx + ((a.y + b.y) / 2) * vy;
        if (dot > bestDot) {
          bestDot = dot;
          best = i;
        }
      }
      return [best, (best + 1) % n] as const;
    });
    edgeCache.set(grid, table);
  }
  return table[dir];
}

// ---- The camera ----

/** A world point on the screen (CSS px, not rounded). */
export function worldToScreen(view: Pick<ViewGeometry, 'camera' | 'width' | 'height'>, wx: number, wy: number): Point {
  const { camera, width, height } = view;
  return { x: (wx - camera.x) * camera.zoom + width / 2, y: (wy - camera.y) * camera.zoom + height / 2 };
}

/** The world point under a screen point (CSS px). */
export function screenToWorld(view: Pick<ViewGeometry, 'camera' | 'width' | 'height'>, sx: number, sy: number): Point {
  const { camera, width, height } = view;
  return { x: (sx - width / 2) / camera.zoom + camera.x, y: (sy - height / 2) / camera.zoom + camera.y };
}

/**
 * The top-left corner (rounded CSS px) of a `zoom × zoom` box centred on the tile: on squares the
 * tile itself; on hexes the box inside the hex, so its centre is the hex's centre.
 */
export function tileToScreen(view: ViewGeometry, tx: number, ty: number): Point {
  const { camera, width, height } = view;
  const grid = viewGrid(view);
  if (!isHex(grid)) {
    return {
      x: Math.round((tx - camera.x) * camera.zoom + width / 2),
      y: Math.round((ty - camera.y) * camera.zoom + height / 2),
    };
  }
  const c = tileCentre(grid, tx, ty);
  return {
    x: Math.round((c.x - 0.5 - camera.x) * camera.zoom + width / 2),
    y: Math.round((c.y - 0.5 - camera.y) * camera.zoom + height / 2),
  };
}

/** The tile's centre on the screen (CSS px, not rounded). */
export function tileCentreOnScreen(view: ViewGeometry, tx: number, ty: number): Point {
  const c = tileCentre(viewGrid(view), tx, ty);
  return worldToScreen(view, c.x, c.y);
}

/** The tile's corners on the screen (CSS px, not rounded), clockwise; `inset` pulls them towards the centre by that many px. */
export function tileOutline(view: ViewGeometry, tx: number, ty: number, inset = 0): Point[] {
  const grid = viewGrid(view);
  const c = tileCentreOnScreen(view, tx, ty);
  const z = view.camera.zoom;
  const shape = tileShape(grid);
  // The corner's distance from the centre, so an inset of n px moves each edge n px inwards.
  const r = Math.hypot(shape[0].x, shape[0].y) * z;
  const edge = isHex(grid) ? Math.cos(Math.PI / 6) : Math.SQRT1_2;
  const k = r > 0 ? Math.max(0, (r - inset / edge) / r) : 0;
  return shape.map((p) => ({ x: c.x + p.x * z * k, y: c.y + p.y * z * k }));
}

/** What `traceTile` draws into: a canvas context or a Path2D. */
export interface PolygonSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** Adds the tile's outline (`tileOutline`) to a path as a closed polygon. */
export function traceTile(p: PolygonSink, view: ViewGeometry, tx: number, ty: number, inset = 0): void {
  const pts = tileOutline(view, tx, ty, inset);
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
  p.closePath();
}

/** The tile under a screen point (CSS px): squares by their edges, hexes by the nearest centre. */
export function screenToTile(view: ViewGeometry, sx: number, sy: number): Point {
  const { camera, width, height } = view;
  const grid = viewGrid(view);
  if (!isHex(grid)) {
    return {
      x: Math.floor((sx - width / 2) / camera.zoom + camera.x),
      y: Math.floor((sy - height / 2) / camera.zoom + camera.y),
    };
  }
  const w = screenToWorld(view, sx, sy);
  return worldToTile(grid, w.x, w.y);
}

/** Inclusive tile range covering the viewport (with a margin of a tile, two on hexes). */
export function visibleRange(view: ViewGeometry & { state: Readonly<GameState> }) {
  const a = screenToTile(view, 0, 0);
  const b = screenToTile(view, view.width, view.height);
  const m = isHex(viewGrid(view)) ? 2 : 1;
  return {
    x0: Math.max(0, a.x - m),
    y0: Math.max(0, a.y - m),
    x1: Math.min(view.state.map.width - 1, b.x + m),
    y1: Math.min(view.state.map.height - 1, b.y + m),
  };
}

/** Keeps the camera over the map: its centre within the world (`worldSize`). */
export function clampToWorld(camera: Camera, grid: Grid, map: Pick<GameMap, 'width' | 'height'>): void {
  const { width, height } = worldSize(grid, map);
  camera.x = Math.max(0, Math.min(width, camera.x));
  camera.y = Math.max(0, Math.min(height, camera.y));
}
