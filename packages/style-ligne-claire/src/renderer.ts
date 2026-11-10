import { colonyWorkers, nationOf, RIVER_DIRS, settlementKindOf, TERRAIN, type Colony, type GameState, type Settlement, type SettlementLook, type Tile } from '@cc/engine';
import {
  braveMarkers,
  hash2,
  isTileExplored,
  riverCourse,
  roadDrawing,
  strandPoints,
  traceStrand,
  isTileVisible,
  tileToScreen,
  tribeColor,
  unitStacks,
  visibleRange,
  type LayerTile,
  type MapBrave,
  type MapLayerHooks,
  type MapRenderer,
  type MapUnitStack,
  type RiverCourse,
  type RiverStrand,
  type Scene,
} from '@cc/render-api';
import { FOREST, HIGHLIGHT, INK, LAND, PAPER, PAPER_WASH, RIVER, ROAD, WAVE, WHITE, shade } from './palette.js';
import { FONT, braveSprite, colonySprite, hills, inked, mountains, ruins, settlementSprite, tree, unitSprite } from './sprites.js';

type Ctx = CanvasRenderingContext2D;

const N = [0, -1];
const E = [1, 0];
const S = [0, 1];
const W = [-1, 0];

export function lineWidthFor(zoom: number): number {
  return Math.max(1.1, zoom * 0.032);
}

function isWaterAt(s: Readonly<GameState>, x: number, y: number, fallback: boolean): boolean {
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return fallback;
  return TERRAIN[s.map.tiles[y * s.map.width + x].t].water;
}

/** Land tile outline with rounded convex corners where water meets on two sides. */
function landPath(ctx: Ctx, s: Readonly<GameState>, x: number, y: number, px: number, py: number, z: number): void {
  const water = (d: number[]) => isWaterAt(s, x + d[0], y + d[1], false);
  const r = z * 0.32;
  const rTL = water(N) && water(W) ? r : 0;
  const rTR = water(N) && water(E) ? r : 0;
  const rBR = water(S) && water(E) ? r : 0;
  const rBL = water(S) && water(W) ? r : 0;
  ctx.moveTo(px + z / 2, py);
  ctx.arcTo(px + z, py, px + z, py + z / 2, rTR);
  ctx.arcTo(px + z, py + z, px + z / 2, py + z, rBR);
  ctx.arcTo(px, py + z, px, py + z / 2, rBL);
  ctx.arcTo(px, py, px + z / 2, py, rTL);
  ctx.closePath();
}

/** Ink coastline along the water-facing edges of a land tile. */
function coastPath(ctx: Ctx, s: Readonly<GameState>, x: number, y: number, px: number, py: number, z: number): void {
  const water = (d: number[]) => isWaterAt(s, x + d[0], y + d[1], false);
  const r = z * 0.32;
  const mid = { n: [px + z / 2, py], e: [px + z, py + z / 2], s: [px + z / 2, py + z], w: [px, py + z / 2] };
  const corners: [keyof typeof mid, keyof typeof mid, number[], number[], number, number][] = [
    ['n', 'e', N, E, px + z, py],
    ['e', 's', E, S, px + z, py + z],
    ['s', 'w', S, W, px, py + z],
    ['w', 'n', W, N, px, py],
  ];
  for (const [a, b, da, db, cx, cy] of corners) {
    const wa = water(da);
    const wb = water(db);
    if (wa && wb) {
      ctx.moveTo(mid[a][0], mid[a][1]);
      ctx.arcTo(cx, cy, mid[b][0], mid[b][1], r);
      ctx.lineTo(mid[b][0], mid[b][1]);
    } else {
      if (wa) {
        ctx.moveTo(mid[a][0], mid[a][1]);
        ctx.lineTo(cx, cy);
      }
      if (wb) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(mid[b][0], mid[b][1]);
      }
    }
  }
}

function drawWaves(ctx: Ctx, x: number, y: number, px: number, py: number, z: number, lw: number): void {
  const h = hash2(x, y, 3);
  if (h > 0.38) return;
  const wx = px + z * (0.2 + hash2(x, y, 4) * 0.45);
  const wy = py + z * (0.25 + hash2(x, y, 5) * 0.5);
  const w = z * 0.13;
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.quadraticCurveTo(wx + w / 2, wy - w * 0.6, wx + w, wy);
  ctx.quadraticCurveTo(wx + w * 1.5, wy - w * 0.6, wx + w * 2, wy);
  ctx.strokeStyle = WAVE;
  ctx.lineWidth = lw * 0.8;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawFurrows(ctx: Ctx, px: number, py: number, z: number, color: string, lw: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px + z * 0.08, py + z * 0.08, z * 0.84, z * 0.84);
  ctx.clip();
  ctx.strokeStyle = shade(color, -0.18);
  ctx.lineWidth = lw * 0.9;
  for (let i = -1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(px + i * z * 0.22, py + z);
    ctx.lineTo(px + i * z * 0.22 + z * 0.5, py);
    ctx.stroke();
  }
  ctx.restore();
}

function drawForest(ctx: Ctx, tile: Tile, x: number, y: number, px: number, py: number, z: number, lw: number, avoid?: (sx: number, sy: number) => boolean): void {
  const style = FOREST[tile.t];
  if (!style) return;
  const spots = [
    [0.28, 0.3],
    [0.72, 0.34],
    [0.48, 0.62],
    [0.2, 0.74],
    [0.8, 0.76],
  ];
  const count = 3 + Math.floor(hash2(x, y, 7) * 3);
  const r = z * 0.17;
  const chosen = spots.slice(0, count).filter(([sx, sy]) => !avoid?.(sx, sy)).sort((a, b) => a[1] - b[1]);
  for (const [i, [sx, sy]] of chosen.entries()) {
    const jx = (hash2(x, y, 10 + i) - 0.5) * z * 0.1;
    const jy = (hash2(x, y, 20 + i) - 0.5) * z * 0.1;
    tree(ctx, px + sx * z + jx, py + sy * z + jy, r, style.color, style.shape, lw);
  }
}

const riverWidth = (size: number) => (size >= 2 ? 0.2 : 0.11);

/** A tile's river strands as polylines (tile fractions from the top-left), for keeping trees off them. */
type RiverSamples = { w: number; pts: [number, number][] }[];

function riverSamples(course: RiverCourse): RiverSamples {
  return course.strands.map((st) => ({ w: riverWidth(st.size), pts: strandPoints(st, 4).map(([x, y]) => [x + 0.5, y + 0.5]) }));
}

/** Whether a point (in tile fractions) lies on the river, so trees keep off it. */
function nearRiver(river: RiverSamples, sx: number, sy: number): boolean {
  return river.some(({ w, pts }) => {
    const limit = w / 2 + 0.17;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const ex = bx - ax;
      const ey = by - ay;
      const t = Math.max(0, Math.min(1, ((sx - ax) * ex + (sy - ay) * ey) / (ex * ex + ey * ey || 1)));
      if (Math.hypot(sx - ax - ex * t, sy - ay - ey * t) < limit) return true;
    }
    return false;
  });
}

/**
 * A river across one tile, drawn in two passes over all river tiles (ink banks, then water) so
 * that stretches join without seams.
 * The river meanders through each tile's hub, its centre pushed a little to one side, and the
 * strands of neighbouring tiles meet halfway between their hubs with the same direction (see
 * `riverCourse` in @cc/render-api). The main stream bends through the hub in one smooth curve; at a
 * confluence the side branches join it there; a source ends in a rounded spring. At a mouth the
 * water runs straight over the middle of the coastline into the sea.
 */
function drawRiver(ctx: Ctx, course: RiverCourse, px: number, py: number, z: number, lw: number, ink: boolean): void {
  const { strands, main } = course;
  if (!strands.length) return;
  const cx = px + z / 2;
  const cy = py + z / 2;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink ? INK : RIVER;
  ctx.fillStyle = ink ? INK : RIVER;
  const width = (st: RiverStrand) => riverWidth(st.size) * z + (ink ? lw * 2.2 : 0);
  // Out past the coastline, so the water covers the coast's ink where the river meets the sea.
  const overhang = (st: RiverStrand): [number, number] | undefined => {
    if (ink || !st.mouth) return undefined;
    const k = (lw * 2.5) / Math.hypot(st.dx, st.dy);
    return [cx + (st.dx * z) / 2 + st.dx * k, cy + (st.dy * z) / 2 + st.dy * k];
  };
  // A hair past the meeting point, along the stream, so that the butt ends of two tiles overlap
  // (anti-aliasing would otherwise show a faint seam, worst where the stretch crosses a corner).
  const lap = lw * 0.75;
  const lapPoint = (st: RiverStrand): [number, number] => {
    const l = Math.hypot(st.ex - st.c2x, st.ey - st.c2y) || 1;
    return [cx + st.ex * z + ((st.ex - st.c2x) / l) * lap, cy + st.ey * z + ((st.ey - st.c2y) / l) * lap];
  };
  const outward = (st: RiverStrand, move: boolean) => {
    traceStrand(ctx, st, cx, cy, z, true, move);
    const o = overhang(st);
    if (o) ctx.lineTo(o[0], o[1]);
    else if (!st.mouth) ctx.lineTo(...lapPoint(st));
  };
  const strokeOut = (st: RiverStrand) => {
    ctx.beginPath();
    outward(st, true);
    ctx.lineWidth = width(st);
    ctx.stroke();
  };
  if (main && main[0].size === main[1].size) {
    // One stroke from edge to edge through the hub.
    const [a, b] = main;
    ctx.beginPath();
    const o = overhang(a);
    if (o) {
      ctx.moveTo(o[0], o[1]);
      ctx.lineTo(cx + (a.dx * z) / 2, cy + (a.dy * z) / 2);
    } else if (!a.mouth) {
      // The mirror of the lap past b's end: start a hair before a's meeting point, along the stream.
      const l = Math.hypot(a.ex - a.c2x, a.ey - a.c2y) || 1;
      ctx.moveTo(cx + a.ex * z + ((a.ex - a.c2x) / l) * lap, cy + a.ey * z + ((a.ey - a.c2y) / l) * lap);
      ctx.lineTo(cx + a.ex * z, cy + a.ey * z);
    }
    traceStrand(ctx, a, cx, cy, z, false, !o && a.mouth);
    outward(b, false);
    ctx.lineWidth = width(a);
    ctx.stroke();
  } else if (main) {
    // Two widths: each half with its own; they meet at the hub with the same tangent.
    strokeOut(main[0]);
    strokeOut(main[1]);
  }
  for (const st of strands) if (!main || (st !== main[0] && st !== main[1])) strokeOut(st);
  if (strands.length === 1) {
    ctx.beginPath();
    ctx.arc(cx + strands[0].sx * z, cy + strands[0].sy * z, width(strands[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hasRoad(s: Readonly<GameState>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return false;
  const t = s.map.tiles[y * s.map.width + x];
  return !!t.r || Object.values(s.colonies).some((c) => c.x === x && c.y === y);
}

/**
 * Roads from the tile's hub towards every neighbour with a road or colony, each a gently
 * meandering strand that runs on smoothly into the neighbour's road (see `roadStrands` in
 * @cc/render-api). Along a river the road follows the river's curve.
 */
function drawRoads(ctx: Ctx, s: Readonly<GameState>, x: number, y: number, px: number, py: number, z: number, lw: number): void {
  const cx = px + z / 2;
  const cy = py + z / 2;
  let mask = 0;
  RIVER_DIRS.forEach(([dx, dy], dir) => {
    if (hasRoad(s, x + dx, y + dy)) mask |= 1 << dir;
  });
  const { strands: segs, bridge } = roadDrawing(s, x, y, mask);
  const onRiver = !!s.map.tiles[y * s.map.width + x].rv;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [color, width] of [[INK, lw * 3.4], [ROAD, lw * 1.6]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (!segs.length && !onRiver) {
      ctx.moveTo(cx - z * 0.12, cy);
      ctx.lineTo(cx + z * 0.12, cy);
    }
    for (const st of segs) traceStrand(ctx, st, cx, cy, z, true);
    ctx.stroke();
  }
  if (bridge) {
    // Two plank lines across the water, a little apart along the river, a bit wider than the stream.
    const half = (riverWidth(bridge.size) * z) / 2 + lw * 1.6;
    const gap = Math.max(lw * 1.6, z * 0.045);
    const hx = cx + bridge.x * z;
    const hy = cy + bridge.y * z;
    ctx.lineCap = 'butt';
    for (const [color, width] of [[INK, lw * 2.2], [ROAD, lw * 1.1]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const ox = hx + bridge.tx * gap * side;
        const oy = hy + bridge.ty * gap * side;
        ctx.moveTo(ox - bridge.ty * half, oy + bridge.tx * half);
        ctx.lineTo(ox + bridge.ty * half, oy - bridge.tx * half);
      }
      ctx.stroke();
    }
  }
}

function drawBonus(ctx: Ctx, px: number, py: number, z: number, lw: number): void {
  const x = px + z * 0.82;
  const y = py + z * 0.18;
  const r = z * 0.1;
  inked(ctx, '#ffd23f', lw * 0.8, () => {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  });
}

/** Comic-style caption box. */
export function caption(ctx: Ctx, text: string, cx: number, top: number, z: number, lw: number, badge?: { text: string; color: string }): void {
  const size = Math.max(10, Math.round(z * 0.25));
  ctx.font = `bold ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const pad = size * 0.4;
  const bw = badge ? size * 1.4 : 0;
  const w = tw + pad * 2 + bw;
  const h = size * 1.35;
  const x = cx - w / 2;
  inked(ctx, WHITE, lw, () => ctx.roundRect(x, top, w, h, h * 0.3));
  if (badge) {
    inked(ctx, badge.color, lw, () => ctx.roundRect(x, top, bw, h, [h * 0.3, 0, 0, h * 0.3]));
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge.text, x + bw / 2, top + h / 2 + 1);
  }
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + bw + pad, top + h / 2 + 1);
}

/** One explored tile in view, with its top-left corner on screen. */
export type MapTile = LayerTile;

/**
 * The Ligne claire map renderer. Each layer of a frame is drawn by a protected method that first
 * offers the layer to the optional `MapLayerHooks` (see @cc/render-api), so a sprite style can
 * paint single layers over this one and keep the rest.
 */
export class LigneClaireMapRenderer implements MapRenderer {
  protected ctx: Ctx;
  /** Tiles whose water hook drew them (their waves are part of it). */
  private hookedWater = new Set<MapTile>();

  constructor(
    protected canvas: HTMLCanvasElement,
    protected hooks: MapLayerHooks = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available.');
    this.ctx = ctx;
  }

  render(scene: Scene): void {
    const { canvas, ctx } = this;
    const dpr = scene.pixelRatio;
    const bw = Math.round(scene.width * dpr);
    const bh = Math.round(scene.height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, scene.width, scene.height);

    const s = scene.state;
    const z = scene.camera.zoom;
    const lw = lineWidthFor(z);
    const range = visibleRange(scene);
    this.beginFrame(scene);
    const tiles: MapTile[] = [];
    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        if (!isTileExplored(scene, x, y)) continue;
        const p = tileToScreen(scene, x, y);
        tiles.push({ x, y, px: p.x, py: p.y, tile: s.map.tiles[y * s.map.width + x] });
      }
    }

    // 1. Water everywhere we know, land shapes on top.
    for (const t of tiles) this.drawWaterBase(t, z);
    for (const t of tiles) {
      if (TERRAIN[t.tile.t].water) this.drawWaterDetail(t, z, lw);
      else this.drawLandBase(s, t, z);
    }
    this.drawShore(s, tiles, z, lw);

    // 2. Faint borders between land types, firm ink along the coast.
    ctx.beginPath();
    for (const t of tiles) {
      if (TERRAIN[t.tile.t].water) continue;
      for (const [d, edge] of [[E, 'e'], [S, 's']] as const) {
        const nx = t.x + d[0];
        const ny = t.y + d[1];
        if (nx >= s.map.width || ny >= s.map.height) continue;
        const n = s.map.tiles[ny * s.map.width + nx];
        if (TERRAIN[n.t].water || n.t === t.tile.t) continue;
        if (this.hooks.hideBorder?.(t.x, t.y, nx, ny, z, s)) continue;
        if (edge === 'e') {
          ctx.moveTo(t.px + z, t.py);
          ctx.lineTo(t.px + z, t.py + z);
        } else {
          ctx.moveTo(t.px, t.py + z);
          ctx.lineTo(t.px + z, t.py + z);
        }
      }
    }
    ctx.strokeStyle = 'rgba(27, 26, 23, 0.18)';
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();

    ctx.beginPath();
    for (const t of tiles) if (!TERRAIN[t.tile.t].water) coastPath(ctx, s, t.x, t.y, t.px, t.py, z);
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * 1.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 3. Landscape details, painted row by row so lower things overlap higher ones.
    for (const t of tiles) {
      if (TERRAIN[t.tile.t].water) continue;
      if (t.tile.p) this.drawPlowed(t, z, lw);
      if (hasRoad(s, t.x, t.y)) this.drawRoad(s, t, z, lw);
    }
    const rivers: { t: (typeof tiles)[number]; course: RiverCourse }[] = [];
    for (const t of tiles) {
      const river = t.tile.rv ? riverCourse(s, t.x, t.y) : undefined;
      this.drawRelief(t, z, lw, river);
      if (river?.strands.length) rivers.push({ t, course: river });
    }
    // Rivers over the landscape (trees keep clear of them), roads crossing on bridges.
    for (const ink of [true, false]) for (const r of rivers) drawRiver(ctx, r.course, r.t.px, r.t.py, z, lw, ink);
    for (const { t } of rivers) if (hasRoad(s, t.x, t.y)) this.drawRoad(s, t, z, lw);
    for (const t of tiles) {
      if (t.tile.b) this.drawBonusMarker(t, z, lw);
      if (t.tile.lcr) this.drawRumour(t, z, lw);
    }

    // 4. A light paper wash over what we know but cannot currently see.
    // One path so overlapping edges are not washed twice.
    ctx.beginPath();
    for (const t of tiles) if (!isTileVisible(scene, t.x, t.y)) ctx.rect(t.px, t.py, z + 0.5, z + 0.5);
    ctx.fillStyle = PAPER_WASH;
    ctx.fill();

    // 5. Settlements and colonies.
    // Painted from the top row down, so a town that spills over its tile overlaps the ones above it.
    for (const st of Object.values(s.settlements).sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (!isTileExplored(scene, st.x, st.y) || st.x < range.x0 - 1 || st.x > range.x1 + 1 || st.y < range.y0 - 1 || st.y > range.y1 + 1) continue;
      const p = tileToScreen(scene, st.x, st.y);
      this.drawSettlement(st, p.x, p.y, z, lw, settlementKindOf(s, st).look, s);
    }
    const labels: (() => void)[] = [];
    for (const c of Object.values(s.colonies).sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (!isTileExplored(scene, c.x, c.y) || c.x < range.x0 - 1 || c.x > range.x1 + 1 || c.y < range.y0 - 1 || c.y > range.y1 + 1) continue;
      const p = tileToScreen(scene, c.x, c.y);
      const size = colonyWorkers(s as GameState, c).length;
      this.drawColony(c, size, p.x, p.y, z, lw, s);
      if (scene.labels !== false) labels.push(() => caption(ctx, c.name, p.x + z / 2, p.y + z * 0.86, z, lw, { text: String(size), color: nationOf(scene.state, c.owner).color }));
    }

    // 6. Route and selection markers under the units.
    if (scene.path?.length && scene.pathKind === 'road') {
      // A planned road: dashed brown line through the tile centres.
      ctx.save();
      ctx.beginPath();
      for (const [i, step] of scene.path.entries()) {
        const p = tileToScreen(scene, step.x, step.y);
        if (i === 0) ctx.moveTo(p.x + z / 2, p.y + z / 2);
        else ctx.lineTo(p.x + z / 2, p.y + z / 2);
      }
      ctx.setLineDash([z * 0.2, z * 0.14]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = z * 0.11 + lw;
      ctx.stroke();
      ctx.strokeStyle = '#a0662f';
      ctx.lineWidth = z * 0.11;
      ctx.stroke();
      ctx.restore();
    } else if (scene.path?.length) {
      for (const [i, step] of scene.path.entries()) {
        const p = tileToScreen(scene, step.x, step.y);
        const last = i === scene.path.length - 1;
        inked(ctx, last ? HIGHLIGHT : WHITE, lw, () => ctx.arc(p.x + z / 2, p.y + z / 2, z * (last ? 0.12 : 0.07), 0, Math.PI * 2));
      }
    }

    // 7. Native braves out on the land, with a triangular pennant in the tribe's colour; smaller
    // in a corner when a European unit shares the tile. Then the units: one sprite per tile with
    // an ownership pennant and stack count.
    const stacks = unitStacks(scene);
    const occupied = new Set(stacks.map((st) => st.y * s.map.width + st.x));
    for (const b of braveMarkers(scene)) {
      const p = tileToScreen(scene, b.x, b.y);
      if (p.x < -z || p.y < -z || p.x > scene.width + z || p.y > scene.height + z) continue;
      const shared = occupied.has(b.y * s.map.width + b.x);
      const bx = shared ? p.x + z * 0.24 : p.x + z / 2;
      const by = shared ? p.y + z * 0.7 : p.y + z / 2;
      this.drawBrave(b, bx, by, shared ? z * 0.5 : z * 0.86, lw);
      if (shared) continue;
      const fx = p.x + z * 0.06;
      const fy = p.y + z * 0.06;
      const fw = z * 0.24;
      const fh = z * 0.2;
      inked(ctx, tribeColor(b.tribe), lw * 0.8, () => {
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + fw, fy + fh / 2);
        ctx.lineTo(fx, fy + fh);
        ctx.closePath();
      });
      if (b.count > 1) {
        ctx.fillStyle = WHITE;
        ctx.font = `bold ${Math.round(fh * 0.75)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.count), fx + fw * 0.36, fy + fh / 2 + 1);
      }
    }
    for (const stack of stacks) {
      const p = tileToScreen(scene, stack.x, stack.y);
      if (p.x < -z || p.y < -z || p.x > scene.width + z || p.y > scene.height + z) continue;
      const cx = p.x + z / 2;
      const cy = p.y + z / 2;
      const selected = stack.top.id === scene.selectedUnitId;
      if (selected) {
        inked(ctx, HIGHLIGHT, lw, () => ctx.ellipse(cx, p.y + z * 0.82, z * 0.4, z * 0.13, 0, 0, Math.PI * 2));
      }
      const inColony = Object.values(s.colonies).some((c) => c.x === stack.x && c.y === stack.y);
      const ux = inColony ? p.x + z * 0.78 : cx;
      const uy = inColony ? p.y + z * 0.28 : cy;
      const us = inColony ? z * 0.62 : z * 0.86;
      this.drawUnit(stack, ux, uy, us, lw, s);
      // Pennant in the owner's colour, with the unit's standing order.
      const fx = inColony ? p.x + z * 0.55 : p.x + z * 0.06;
      const fy = p.y + z * 0.06;
      const fw = z * 0.24;
      const fh = z * 0.2;
      inked(ctx, nationOf(scene.state, stack.top.owner).color, lw * 0.8, () => ctx.rect(fx, fy, fw, fh));
      const letter = stack.top.working ? 'W' : stack.top.state === 'fortified' ? 'F' : stack.top.state === 'sentry' ? 'S' : stack.count > 1 ? String(stack.count) : '';
      if (letter) {
        ctx.fillStyle = WHITE;
        ctx.font = `bold ${Math.round(fh * 0.85)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, fx + fw / 2, fy + fh / 2 + 1);
      }
      if (stack.top.cargo > 0) {
        for (let i = 0; i < stack.top.cargo; i++) {
          inked(ctx, WHITE, lw * 0.7, () => ctx.rect(p.x + z * (0.1 + i * 0.12), p.y + z * 0.84, z * 0.09, z * 0.09));
        }
      }
    }

    for (const draw of labels) draw();

    if (scene.hover && isTileExplored(scene, scene.hover.x, scene.hover.y)) {
      const p = tileToScreen(scene, scene.hover.x, scene.hover.y);
      ctx.setLineDash([lw * 3, lw * 3]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(p.x + lw, p.y + lw, z - lw * 2, z - lw * 2);
      ctx.setLineDash([]);
    }

    // 8. Journey length: a comic badge with the number of turns on the route's last tile.
    const end = scene.path?.[scene.path.length - 1];
    if (end && scene.pathTurns && scene.pathTurns > 1) {
      const p = tileToScreen(scene, end.x, end.y);
      const text = String(scene.pathTurns);
      const r = Math.max(8, z * 0.2);
      const fontSize = Math.round(r * 1.25);
      ctx.font = `bold ${fontSize}px ${FONT}`;
      const halfW = Math.max(r, ctx.measureText(text).width / 2 + r * 0.45);
      const bx = p.x + z * 0.78;
      const by = p.y + z * 0.22;
      inked(ctx, '#e8412c', lw * 1.2, () => ctx.roundRect(bx - halfW, by - r, halfW * 2, r * 2, r));
      ctx.fillStyle = WHITE;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx, by + fontSize * 0.06);
    }
  }

  dispose(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ---- Layers (override in derived styles) ----

  /** Called once per frame, after the canvas is sized and cleared. */
  protected beginFrame(scene: Scene): void {
    this.hookedWater.clear();
    this.hooks.beginFrame?.(this.ctx, scene);
  }

  /** Water under every known tile (land tiles get it too, for their rounded corners). */
  protected drawWaterBase(t: MapTile, z: number): void {
    if (this.hooks.water?.(this.ctx, t, z)) {
      this.hookedWater.add(t);
      return;
    }
    const def = TERRAIN[t.tile.t];
    const waterColor = t.tile.t === 'highSeas' ? LAND.highSeas : LAND.ocean;
    this.ctx.fillStyle = def.water ? waterColor : LAND.ocean;
    this.ctx.fillRect(t.px, t.py, z + 0.5, z + 0.5);
  }

  protected drawWaterDetail(t: MapTile, z: number, lw: number): void {
    if (this.hookedWater.has(t)) return;
    drawWaves(this.ctx, t.x, t.y, t.px, t.py, z, lw);
  }

  /** The land shape of a tile, with rounded corners towards the water. */
  protected drawLandBase(s: Readonly<GameState>, t: MapTile, z: number): void {
    const ctx = this.ctx;
    if (this.hooks.land?.(ctx, t, z, () => landPath(ctx, s, t.x, t.y, t.px, t.py, z), s)) return;
    ctx.beginPath();
    landPath(ctx, s, t.x, t.y, t.px, t.py, z);
    ctx.fillStyle = LAND[t.tile.t];
    ctx.fill();
  }

  /** Extra shoreline detail on the water, under the coastline's ink. Nothing in this style. */
  protected drawShore(s: Readonly<GameState>, tiles: MapTile[], z: number, _lw: number): void {
    this.hooks.shore?.(this.ctx, tiles, z, s);
  }

  protected drawPlowed(t: MapTile, z: number, lw: number): void {
    if (this.hooks.plowed?.(this.ctx, t, z)) return;
    drawFurrows(this.ctx, t.px, t.py, z, LAND[t.tile.t], lw);
  }

  protected drawRoad(s: Readonly<GameState>, t: MapTile, z: number, lw: number): void {
    if (this.hooks.road?.(this.ctx, t, z, s)) return;
    drawRoads(this.ctx, s, t.x, t.y, t.px, t.py, z, lw);
  }

  /** Hills, mountains or forest; trees keep clear of the tile's river. */
  protected drawRelief(t: MapTile, z: number, lw: number, river?: RiverCourse): void {
    if (this.hooks.relief?.(this.ctx, t, z)) return;
    const cx = t.px + z / 2;
    const cy = t.py + z / 2;
    if (t.tile.t === 'hills') hills(this.ctx, cx, cy, z * 0.9, LAND.hills, lw);
    else if (t.tile.t === 'mountains') mountains(this.ctx, cx, cy, z * 0.95, LAND.mountains, lw);
    else if (t.tile.f) {
      const samples = river?.strands.length ? riverSamples(river) : undefined;
      drawForest(this.ctx, t.tile, t.x, t.y, t.px, t.py, z, lw, samples ? (sx, sy) => nearRiver(samples, sx, sy) : undefined);
    }
  }

  protected drawBonusMarker(t: MapTile, z: number, lw: number): void {
    if (this.hooks.bonus?.(this.ctx, t, z)) return;
    drawBonus(this.ctx, t.px, t.py, z, lw);
  }

  protected drawRumour(t: MapTile, z: number, lw: number): void {
    if (this.hooks.rumour?.(this.ctx, t, z)) return;
    ruins(this.ctx, t.px + z / 2, t.py + z / 2, z * 0.7, lw);
  }

  protected drawSettlement(st: Readonly<Settlement>, px: number, py: number, z: number, lw: number, look: SettlementLook, state: Readonly<GameState>): void {
    if (this.hooks.settlement?.(this.ctx, st, px, py, z, state)) return;
    settlementSprite(this.ctx, px + z / 2, py + z / 2, z * 0.9, st.tribe, st.capital, lw, look);
  }

  protected drawColony(c: Readonly<Colony>, size: number, px: number, py: number, z: number, lw: number, state: Readonly<GameState>): void {
    if (this.hooks.colony?.(this.ctx, c, size, px, py, z, state)) return;
    colonySprite(this.ctx, px + z / 2, py + z / 2, z * 0.95, nationOf(state, c.owner).color, size, c.buildings.stockade, lw);
  }

  /** A native brave, centred at (x, y) in a box of size s. */
  protected drawBrave(b: MapBrave, x: number, y: number, s: number, lw: number): void {
    if (this.hooks.brave?.(this.ctx, b, x, y, s)) return;
    braveSprite(this.ctx, x, y, s, b.tribe, b.armed, b.mounted, lw);
  }

  /** The unit on top of a stack, centred at (x, y) in a box of size s. */
  protected drawUnit(stack: MapUnitStack, x: number, y: number, s: number, lw: number, state: Readonly<GameState>): void {
    if (this.hooks.unit?.(this.ctx, stack, x, y, s)) return;
    unitSprite(this.ctx, x, y, s, stack.top.type, stack.top.role, nationOf(state, stack.top.owner).color, lw);
  }
}
