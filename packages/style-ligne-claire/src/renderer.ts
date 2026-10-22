import { colonyWorkers, NATIONS, RIVER_DIRS, TERRAIN, type Colony, type GameState, type Settlement, type Tile } from '@cc/engine';
import {
  braveMarkers,
  hash2,
  isTileExplored,
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

/** Where a tile's river runs: towards each linked neighbour, with the width of that stretch. */
export interface RiverLink {
  dx: number;
  dy: number;
  /** Width of the water in tile units. */
  w: number;
  mouth: boolean;
}

const riverWidth = (size: number) => (size >= 2 ? 0.2 : 0.11);

function riverLinks(s: Readonly<GameState>, x: number, y: number): RiverLink[] {
  const tile = s.map.tiles[y * s.map.width + x];
  if (!tile.rv || !tile.rd) return [];
  const out: RiverLink[] = [];
  RIVER_DIRS.forEach(([dx, dy], i) => {
    if (!(tile.rd! & (1 << i))) return;
    const nx = x + dx;
    const ny = y + dy;
    const n = nx >= 0 && ny >= 0 && nx < s.map.width && ny < s.map.height ? s.map.tiles[ny * s.map.width + nx] : undefined;
    const mouth = !n || TERRAIN[n.t].water;
    // Where a minor river joins a major one, the stretch between them keeps the minor width.
    out.push({ dx, dy, w: riverWidth(mouth ? tile.rv! : Math.min(tile.rv!, n!.rv ?? tile.rv!)), mouth });
  });
  return out;
}

/** Whether a point (in tile fractions) lies on the river, so trees keep off it. */
function nearRiver(links: RiverLink[], sx: number, sy: number): boolean {
  return links.some((l) => {
    const ex = l.dx / 2;
    const ey = l.dy / 2;
    const px = sx - 0.5;
    const py = sy - 0.5;
    const t = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
    return Math.hypot(px - ex * t, py - ey * t) < l.w / 2 + 0.17;
  });
}

/**
 * A river across one tile, drawn in two passes over all river tiles (ink banks, then water) so
 * that stretches join without seams.
 * Each link runs from the tile's centre to the middle of the shared edge (or the shared corner for a
 * diagonal), so the curves of neighbouring tiles meet end to end with the same direction. Two links
 * make one smooth curve; at a confluence the side branches curve into the main stream; a source
 * ends in a rounded spring. At a mouth the water runs on over the coastline into the sea.
 */
function drawRiver(ctx: Ctx, links: RiverLink[], px: number, py: number, z: number, lw: number, ink: boolean): void {
  if (!links.length) return;
  const cx = px + z / 2;
  const cy = py + z / 2;
  const end = (l: RiverLink) => [cx + (l.dx * z) / 2, cy + (l.dy * z) / 2] as const;
  type Piece = { from: RiverLink; to?: RiverLink; mid?: readonly [number, number] };
  const pieces: Piece[] = [];
  let spring: RiverLink | undefined;
  if (links.length === 1) {
    pieces.push({ from: links[0] });
    spring = links[0];
  } else {
    // The main stream: the widest pair of links, the straightest of those.
    let best: [RiverLink, RiverLink] = [links[0], links[1]];
    let bestScore = -Infinity;
    for (let i = 0; i < links.length; i++)
      for (let j = i + 1; j < links.length; j++) {
        const a = links[i];
        const b = links[j];
        const straight = -(a.dx * b.dx + a.dy * b.dy) / (Math.hypot(a.dx, a.dy) * Math.hypot(b.dx, b.dy));
        const score = (a.w + b.w) * 10 + straight;
        if (score > bestScore) {
          bestScore = score;
          best = [a, b];
        }
      }
    const [a, b] = best;
    const [ax, ay] = end(a);
    const [bx, by] = end(b);
    const mid = [(ax + 2 * cx + bx) / 4, (ay + 2 * cy + by) / 4] as const;
    pieces.push({ from: a, to: b, mid });
    for (const l of links) if (l !== a && l !== b) pieces.push({ from: l, mid });
  }
  const stroke = (ink: boolean) => {
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink ? INK : RIVER;
    ctx.fillStyle = ink ? INK : RIVER;
    const width = (l: RiverLink) => l.w * z + (ink ? lw * 2.2 : 0);
    // Out past the coastline, so the water covers the coast's ink where the river meets the sea.
    const overhang = (l: RiverLink, x: number, y: number) => {
      if (ink || !l.mouth) return;
      const k = (lw * 2.5) / Math.hypot(l.dx, l.dy);
      ctx.lineTo(x + l.dx * k, y + l.dy * k);
    };
    for (const p of pieces) {
      const [fx, fy] = end(p.from);
      if (!p.to) {
        // A side branch or a spring: from the edge into the stream (or the spring at the centre).
        const [mx, my] = p.mid ?? [cx, cy];
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.quadraticCurveTo(cx, cy, fx, fy);
        overhang(p.from, fx, fy);
        ctx.lineWidth = width(p.from);
        ctx.stroke();
        continue;
      }
      const [tx, ty] = end(p.to);
      if (p.from.w === p.to.w) {
        ctx.beginPath();
        const k = !ink && p.from.mouth ? (lw * 2.5) / Math.hypot(p.from.dx, p.from.dy) : 0;
        ctx.moveTo(fx + p.from.dx * k, fy + p.from.dy * k);
        ctx.lineTo(fx, fy);
        ctx.quadraticCurveTo(cx, cy, tx, ty);
        overhang(p.to, tx, ty);
        ctx.lineWidth = width(p.from);
        ctx.stroke();
      } else {
        // Two widths: split the curve at its middle, each half with its own width.
        const [mx, my] = p.mid!;
        for (const [l, x, y] of [[p.from, fx, fy], [p.to, tx, ty]] as const) {
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.quadraticCurveTo((x + cx) / 2, (y + cy) / 2, x, y);
          overhang(l, x, y);
          ctx.lineWidth = width(l);
          ctx.stroke();
        }
      }
    }
    if (spring) {
      ctx.beginPath();
      ctx.arc(cx, cy, width(spring) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  stroke(ink);
}

function hasRoad(s: Readonly<GameState>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return false;
  const t = s.map.tiles[y * s.map.width + x];
  return !!t.r || Object.values(s.colonies).some((c) => c.x === x && c.y === y);
}

function drawRoads(ctx: Ctx, s: Readonly<GameState>, x: number, y: number, px: number, py: number, z: number, lw: number): void {
  const cx = px + z / 2;
  const cy = py + z / 2;
  const segs: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && hasRoad(s, x + dx, y + dy)) segs.push([dx, dy]);
  ctx.lineCap = 'round';
  for (const [color, width] of [[INK, lw * 3.4], [ROAD, lw * 1.6]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (!segs.length) {
      ctx.moveTo(cx - z * 0.12, cy);
      ctx.lineTo(cx + z * 0.12, cy);
    }
    for (const [dx, dy] of segs) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (dx * z) / 2, cy + (dy * z) / 2);
    }
    ctx.stroke();
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
    const rivers: { t: (typeof tiles)[number]; links: RiverLink[] }[] = [];
    for (const t of tiles) {
      const river = t.tile.rv ? riverLinks(s, t.x, t.y) : [];
      this.drawRelief(t, z, lw, river);
      if (river.length) rivers.push({ t, links: river });
    }
    // Rivers over the landscape (trees keep clear of them), roads crossing on bridges.
    for (const ink of [true, false]) for (const r of rivers) drawRiver(ctx, r.links, r.t.px, r.t.py, z, lw, ink);
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
    for (const st of Object.values(s.settlements)) {
      if (!isTileExplored(scene, st.x, st.y) || st.x < range.x0 - 1 || st.x > range.x1 + 1 || st.y < range.y0 - 1 || st.y > range.y1 + 1) continue;
      const p = tileToScreen(scene, st.x, st.y);
      this.drawSettlement(st, p.x, p.y, z, lw);
    }
    const labels: (() => void)[] = [];
    for (const c of Object.values(s.colonies)) {
      if (!isTileExplored(scene, c.x, c.y) || c.x < range.x0 - 1 || c.x > range.x1 + 1 || c.y < range.y0 - 1 || c.y > range.y1 + 1) continue;
      const p = tileToScreen(scene, c.x, c.y);
      const size = colonyWorkers(s as GameState, c).length;
      this.drawColony(c, size, p.x, p.y, z, lw);
      if (scene.labels !== false) labels.push(() => caption(ctx, c.name, p.x + z / 2, p.y + z * 0.86, z, lw, { text: String(size), color: NATIONS[c.owner].color }));
    }

    // 6. Route and selection markers under the units.
    if (scene.path?.length) {
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
      this.drawUnit(stack, ux, uy, us, lw);
      // Pennant in the owner's colour, with the unit's standing order.
      const fx = inColony ? p.x + z * 0.55 : p.x + z * 0.06;
      const fy = p.y + z * 0.06;
      const fw = z * 0.24;
      const fh = z * 0.2;
      inked(ctx, NATIONS[stack.top.owner].color, lw * 0.8, () => ctx.rect(fx, fy, fw, fh));
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
  protected drawRelief(t: MapTile, z: number, lw: number, river: RiverLink[]): void {
    if (this.hooks.relief?.(this.ctx, t, z)) return;
    const cx = t.px + z / 2;
    const cy = t.py + z / 2;
    if (t.tile.t === 'hills') hills(this.ctx, cx, cy, z * 0.9, LAND.hills, lw);
    else if (t.tile.t === 'mountains') mountains(this.ctx, cx, cy, z * 0.95, LAND.mountains, lw);
    else if (t.tile.f) drawForest(this.ctx, t.tile, t.x, t.y, t.px, t.py, z, lw, river.length ? (sx, sy) => nearRiver(river, sx, sy) : undefined);
  }

  protected drawBonusMarker(t: MapTile, z: number, lw: number): void {
    if (this.hooks.bonus?.(this.ctx, t, z)) return;
    drawBonus(this.ctx, t.px, t.py, z, lw);
  }

  protected drawRumour(t: MapTile, z: number, lw: number): void {
    if (this.hooks.rumour?.(this.ctx, t, z)) return;
    ruins(this.ctx, t.px + z / 2, t.py + z / 2, z * 0.7, lw);
  }

  protected drawSettlement(st: Readonly<Settlement>, px: number, py: number, z: number, lw: number): void {
    if (this.hooks.settlement?.(this.ctx, st, px, py, z)) return;
    settlementSprite(this.ctx, px + z / 2, py + z / 2, z * 0.9, st.tribe, st.capital, lw);
  }

  protected drawColony(c: Readonly<Colony>, size: number, px: number, py: number, z: number, lw: number): void {
    if (this.hooks.colony?.(this.ctx, c, size, px, py, z)) return;
    colonySprite(this.ctx, px + z / 2, py + z / 2, z * 0.95, c.owner, size, c.buildings.stockade, lw);
  }

  /** A native brave, centred at (x, y) in a box of size s. */
  protected drawBrave(b: MapBrave, x: number, y: number, s: number, lw: number): void {
    if (this.hooks.brave?.(this.ctx, b, x, y, s)) return;
    braveSprite(this.ctx, x, y, s, b.tribe, b.armed, b.mounted, lw);
  }

  /** The unit on top of a stack, centred at (x, y) in a box of size s. */
  protected drawUnit(stack: MapUnitStack, x: number, y: number, s: number, lw: number): void {
    if (this.hooks.unit?.(this.ctx, stack, x, y, s)) return;
    unitSprite(this.ctx, x, y, s, stack.top.type, stack.top.role, stack.top.owner, lw);
  }
}
