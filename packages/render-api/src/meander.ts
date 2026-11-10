/**
 * Meandering rivers and roads: the shared, deterministic geometry styles draw them with.
 *
 * Every tile has a "hub": its centre pushed a little to one side, by a fixed amount taken from a
 * hash of its coordinates (up to RIVER_MEANDER on a river tile, ROAD_MEANDER elsewhere). A river or
 * road is a smooth curve through the hubs of the tiles it links, like a Catmull-Rom spline: on each
 * tile it is made of strands, one cubic Bézier per linked neighbour, from the tile's hub to the
 * point halfway to the neighbour's hub, where it runs straight towards that hub. So:
 *
 * - the curve is the same in every frame, at every zoom and pan (it is stored in tile units);
 * - both tiles compute the same meeting point and direction for the strands on either side of
 *   their shared edge, so the curve runs on across it without a seam or a kink;
 * - the wander is gentle: it changes side at most once per tile, and stays within the hubs' reach,
 *   close enough to the centre that the river visibly runs through the tile;
 * - at the hub, a river's main stream (or a road with two links) has one tangent, so it bends
 *   smoothly; side branches (confluences) and road junctions meet there; a spring ends there;
 * - at a mouth the strand ends on the middle of the coastal edge, running straight out to sea.
 *
 * Nothing here is game state: it is derived from the tile's coordinates and its river bits.
 */
import { RIVER_DIRS, TERRAIN, type GameState, type Tile } from '@cc/engine';

/** Largest sideways push of a river tile's hub, in tiles. */
export const RIVER_MEANDER = 0.15;
/** Largest sideways push of a road tile's hub (without a river), in tiles. */
export const ROAD_MEANDER = 0.09;

const RIVER_SALT = 4101;
const ROAD_SALT = 4211;

/** The same small hash as `hash2` in this package (kept local to avoid an import cycle). */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A strand: one cubic Bézier from the tile's hub (sx, sy) to the meeting point (ex, ey) towards the
 * neighbour in direction `dir`, in tile units from the tile's centre.
 */
export interface Strand {
  /** Direction index into RIVER_DIRS (the engine's DIRECTIONS order: n, ne, e, se, s, sw, w, nw). */
  dir: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  ex: number;
  ey: number;
}

type Vec = readonly [number, number];

const norm = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

function inBounds(s: Readonly<GameState>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.map.width && y < s.map.height;
}

/** The push of tile (x, y)'s hub from its centre, for a reach of `amp` tiles. */
export function hubOffset(x: number, y: number, amp: number, salt: number): [number, number] {
  const a = hash(x, y, salt) * Math.PI * 2;
  const r = amp * (0.3 + 0.7 * hash(x, y, salt + 1));
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** Where the curves through tile (x, y) meet, relative to its centre: rivers and roads share it on a river tile. */
export function tileHub(s: Readonly<GameState>, x: number, y: number): [number, number] {
  const tile = inBounds(s, x, y) ? s.map.tiles[y * s.map.width + x] : undefined;
  return tile?.rv ? hubOffset(x, y, RIVER_MEANDER, RIVER_SALT) : hubOffset(x, y, ROAD_MEANDER, ROAD_SALT);
}

/**
 * The meeting point on the way from tile (x, y) to its neighbour in direction `dir`, relative to
 * the tile's centre, and the direction the curve runs there (towards the neighbour). `mouth`: the
 * neighbour is water, and the point is the middle of the shared edge (or corner).
 */
export function meetingPoint(s: Readonly<GameState>, x: number, y: number, dir: number, mouth = false): { e: Vec; t: Vec } {
  const [dx, dy] = RIVER_DIRS[dir];
  if (mouth) return { e: [dx / 2, dy / 2], t: norm(dx, dy) };
  const [ax, ay] = tileHub(s, x, y);
  const [bx, by] = tileHub(s, x + dx, y + dy);
  return { e: [(ax + bx + dx) / 2, (ay + by + dy) / 2], t: norm(bx + dx - ax, by + dy - ay) };
}

/** The strand from the hub `p` to the meeting point towards `dir`; `u` is the unit tangent at the hub (default: straight at the meeting point). */
function strand(s: Readonly<GameState>, x: number, y: number, p: Vec, dir: number, mouth: boolean, u?: Vec): Strand {
  const [dx, dy] = RIVER_DIRS[dir];
  const { e, t } = meetingPoint(s, x, y, dir, mouth);
  const len = Math.hypot(e[0] - p[0], e[1] - p[1]);
  const [ux, uy] = u ?? norm(e[0] - p[0], e[1] - p[1]);
  const k = len * 0.38;
  return {
    dir,
    dx,
    dy,
    sx: p[0],
    sy: p[1],
    c1x: p[0] + ux * k,
    c1y: p[1] + uy * k,
    c2x: e[0] - t[0] * k,
    c2y: e[1] - t[1] * k,
    ex: e[0],
    ey: e[1],
  };
}

/**
 * Tangents at the hub for a set of strands: a smooth line through the hub for the pair `main`
 * (along the line between their meeting points, leaned towards each strand where the bend is
 * sharp); the others leave it straight towards their meeting points.
 */
function hubTangents(s: Readonly<GameState>, x: number, y: number, p: Vec, main: readonly [number, number], mouths: (dir: number) => boolean): Map<number, Vec> {
  const [a, b] = main;
  const ea = meetingPoint(s, x, y, a, mouths(a)).e;
  const eb = meetingPoint(s, x, y, b, mouths(b)).e;
  const [tx, ty] = norm(eb[0] - ea[0], eb[1] - ea[1]);
  const lean = (e: Vec, ux: number, uy: number): Vec => {
    const [dx, dy] = norm(e[0] - p[0], e[1] - p[1]);
    if (ux * dx + uy * dy >= 0.5) return [ux, uy];
    return norm(ux + dx, uy + dy);
  };
  return new Map([
    [b, lean(eb, tx, ty)],
    [a, lean(ea, -tx, -ty)],
  ]);
}

/** What `traceStrand` draws into: a canvas context or a Path2D. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
}

/**
 * Adds a strand to a path, scaled to `z` pixels per tile around the tile centre (cx, cy): from the
 * hub out to the meeting point (`outward`) or back in. With `move` false it continues the current
 * subpath (which must end where the strand starts).
 */
export function traceStrand(p: PathSink, st: Strand, cx: number, cy: number, z: number, outward: boolean, move = true): void {
  if (outward) {
    if (move) p.moveTo(cx + st.sx * z, cy + st.sy * z);
    p.bezierCurveTo(cx + st.c1x * z, cy + st.c1y * z, cx + st.c2x * z, cy + st.c2y * z, cx + st.ex * z, cy + st.ey * z);
  } else {
    if (move) p.moveTo(cx + st.ex * z, cy + st.ey * z);
    p.bezierCurveTo(cx + st.c2x * z, cy + st.c2y * z, cx + st.c1x * z, cy + st.c1y * z, cx + st.sx * z, cy + st.sy * z);
  }
}

function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
}

/** `n + 1` points along a strand from the hub outwards, in tile units from the tile's centre. */
export function strandPoints(st: Strand, n = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([bezier(st.sx, st.c1x, st.c2x, st.ex, t), bezier(st.sy, st.c1y, st.c2y, st.ey, t)]);
  }
  return out;
}

// ---- Rivers ----

/** One stretch of a tile's river, towards a linked neighbour. */
export interface RiverStrand extends Strand {
  /** River size of the stretch: where a minor river joins a major one, the stretch between them stays minor. */
  size: 1 | 2;
  /** The neighbour is water (or off the map): the river flows out to sea here. */
  mouth: boolean;
}

/** A tile's river: its strands, and the two that form the main stream when there are two or more. */
export interface RiverCourse {
  strands: RiverStrand[];
  main?: readonly [RiverStrand, RiverStrand];
}

const NO_RIVER: RiverCourse = { strands: [] };
const riverCache = new WeakMap<Tile, { x: number; y: number; rd: number; rv: number; course: RiverCourse }>();

/**
 * The river on tile (x, y), with each strand's meandering curve. Cached per tile (rivers never
 * change once the map is made), so renderers can ask for it in every frame.
 */
export function riverCourse(s: Readonly<GameState>, x: number, y: number): RiverCourse {
  const { width, tiles } = s.map;
  const tile = inBounds(s, x, y) ? tiles[y * width + x] : undefined;
  if (!tile?.rv || !tile.rd) return NO_RIVER;
  const hit = riverCache.get(tile);
  if (hit && hit.x === x && hit.y === y && hit.rd === tile.rd && hit.rv === tile.rv) return hit.course;
  const links: { dir: number; size: 1 | 2; mouth: boolean }[] = [];
  RIVER_DIRS.forEach(([dx, dy], dir) => {
    if (!(tile.rd! & (1 << dir))) return;
    const n = inBounds(s, x + dx, y + dy) ? tiles[(y + dy) * width + x + dx] : undefined;
    const mouth = !n || TERRAIN[n.t].water;
    links.push({ dir, mouth, size: (mouth ? tile.rv! : Math.min(tile.rv!, n!.rv ?? tile.rv!)) as 1 | 2 });
  });
  const p = tileHub(s, x, y);
  let main: [number, number] | undefined;
  if (links.length >= 2) {
    // The main stream: the widest pair of links, the straightest of those. (The weights keep the
    // order the renderers have always used: size first, then straightness.)
    let best = -Infinity;
    for (let i = 0; i < links.length; i++)
      for (let j = i + 1; j < links.length; j++) {
        const [ax, ay] = norm(...RIVER_DIRS[links[i].dir]);
        const [bx, by] = norm(...RIVER_DIRS[links[j].dir]);
        const score = (links[i].size + links[j].size) * 0.9 - (ax * bx + ay * by);
        if (score > best) {
          best = score;
          main = [links[i].dir, links[j].dir];
        }
      }
  }
  const isMouth = (dir: number) => links.some((l) => l.dir === dir && l.mouth);
  const tangents = main ? hubTangents(s, x, y, p, main, isMouth) : undefined;
  const strands: RiverStrand[] = links.map((l) => ({ ...strand(s, x, y, p, l.dir, l.mouth, tangents?.get(l.dir)), size: l.size, mouth: l.mouth }));
  const pick = (dir: number) => strands.find((st) => st.dir === dir)!;
  const course: RiverCourse = { strands, main: main && [pick(main[0]), pick(main[1])] };
  riverCache.set(tile, { x, y, rd: tile.rd, rv: tile.rv, course });
  return course;
}

// ---- Roads ----

const roadCache = new WeakMap<Tile, { x: number; y: number; byMask: Map<number, Strand[]> }>();

/**
 * The road strands of tile (x, y) towards the neighbours whose bits are set in `mask` (bit i for
 * RIVER_DIRS[i]: neighbours with a road or a colony). A road with two links bends smoothly through
 * the hub; more meet there as a junction. Where the tile's river runs the same way, the road
 * follows the river's curve, so the two never cross back and forth. Cached per tile and mask.
 */
export function roadStrands(s: Readonly<GameState>, x: number, y: number, mask: number): Strand[] {
  if (!mask) return [];
  const tile = s.map.tiles[y * s.map.width + x];
  let hit = roadCache.get(tile);
  if (!hit || hit.x !== x || hit.y !== y) {
    hit = { x, y, byMask: new Map() };
    roadCache.set(tile, hit);
  }
  const cached = hit.byMask.get(mask);
  if (cached) return cached;
  const dirs = RIVER_DIRS.map((_, i) => i).filter((i) => mask & (1 << i));
  const river = riverCourse(s, x, y);
  const p = tileHub(s, x, y);
  const tangents = dirs.length === 2 ? hubTangents(s, x, y, p, [dirs[0], dirs[1]], () => false) : undefined;
  const out = dirs.map((dir) => river.strands.find((st) => st.dir === dir && !st.mouth) ?? strand(s, x, y, p, dir, false, tangents?.get(dir)));
  hit.byMask.set(mask, out);
  return out;
}

// ---- Roads on river tiles ----

/** Where a road crosses its tile's river: the hub, and the river's unit direction there (tile units from the tile's centre). */
export interface Bridge {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** River size under the bridge. */
  size: 1 | 2;
}

/** What to draw for a tile's road: the strands, and a bridge where it crosses the tile's river. */
export interface RoadDrawing {
  strands: Strand[];
  bridge?: Bridge;
}

/**
 * The road of tile (x, y) as it is drawn. A road that runs along the river (towards a neighbour the
 * river links, on the river's own curve) is not drawn on top of the water: the river carries it.
 * Only the strands that leave the river for another tile are drawn, and where they start at the
 * river there is a `bridge` across it. On a tile without a river this is `roadStrands`.
 */
export function roadDrawing(s: Readonly<GameState>, x: number, y: number, mask: number): RoadDrawing {
  const all = roadStrands(s, x, y, mask);
  const river = riverCourse(s, x, y);
  if (!river.strands.length) return { strands: all };
  const strands = all.filter((st) => !river.strands.includes(st as RiverStrand));
  if (!strands.length) return { strands };
  // The river's direction at the hub: along its main stream, else out of its only (or first) strand.
  const lead = river.main?.[1] ?? river.strands[0];
  const [tx, ty] = norm(lead.c1x - lead.sx, lead.c1y - lead.sy);
  return { strands, bridge: { x: lead.sx, y: lead.sy, tx, ty, size: lead.size } };
}
