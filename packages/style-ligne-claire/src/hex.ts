/**
 * Ligne claire on hexes (docs/design/hex-maps.md H16, Beta 4 step 6): the tile shapes the renderer
 * draws when the game's grid is hexagonal. The square drawing in renderer.ts is untouched; these are
 * its hex counterparts, built on render-api's geometry so every style agrees on where a hex is.
 *
 * - The land outline is the hex with its corners rounded where both edges meeting there face water,
 *   as squares round a corner between two water sides: a lone island becomes a disc, a cape a
 *   rounded point.
 * - The coastline's ink runs along every water-facing edge, following those rounded corners.
 * - Between two land hexes of different terrain the faint border line lies on their shared edge,
 *   as on squares (the style has no other transition between terrains).
 */
import { gridOf, TERRAIN, type GameState, type Grid } from '@cc/engine';
import { edgeCorners, hash2, tileOutline, type Point, type Scene } from '@cc/render-api';

type Ctx = CanvasRenderingContext2D;

/** How round a corner between two water edges is, in tiles (the arc's radius; 0.5 would make a lone island a circle). */
const CORNER = 0.42;

function isWater(s: Readonly<GameState>, x: number, y: number): boolean {
  // Off the map counts as land, as on squares: no coast along the map's edge.
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return false;
  return TERRAIN[s.map.tiles[y * s.map.width + x].t].water;
}

/** For each edge of the tile's outline (edge i runs from corner i to corner i + 1), whether water lies across it. */
export function waterEdges(s: Readonly<GameState>, grid: Grid, x: number, y: number): boolean[] {
  const o = grid.neighbourOffsets(x, y);
  const edges = new Array<boolean>(6).fill(false);
  for (let d = 0; d < grid.directions.length; d++) {
    if (isWater(s, x + o[2 * d], y + o[2 * d + 1])) edges[edgeCorners(grid, d)[0]] = true;
  }
  return edges;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The land outline of a hex (expanded by `grow` px so neighbours overlap without seams), corners rounded towards water. */
export function hexLandPath(ctx: Ctx, scene: Scene, x: number, y: number, z: number, grow = 0.5): void {
  const s = scene.state;
  const water = waterEdges(s, gridOf(s), x, y);
  const p = tileOutline(scene, x, y, -grow);
  const n = p.length;
  const r = z * CORNER;
  const start = mid(p[0], p[1]);
  ctx.moveTo(start.x, start.y);
  for (let k = 1; k <= n; k++) {
    const corner = p[k % n];
    const next = mid(corner, p[(k + 1) % n]);
    ctx.arcTo(corner.x, corner.y, next.x, next.y, water[(k - 1) % n] && water[k % n] ? r : 0);
  }
  ctx.closePath();
}

/** The coastline's ink along the water-facing edges of a land hex, round where two meet at a corner. */
export function hexCoastPath(ctx: Ctx, scene: Scene, x: number, y: number, z: number): void {
  const s = scene.state;
  const water = waterEdges(s, gridOf(s), x, y);
  if (!water.some(Boolean)) return;
  const p = tileOutline(scene, x, y);
  const n = p.length;
  const r = z * CORNER;
  for (let k = 0; k < n; k++) {
    // Corner k lies between edge a (k - 1) and edge b (k); each draws its half next to the corner.
    const a = (k + n - 1) % n;
    const b = k;
    const c = p[k];
    const ma = mid(p[a], c);
    const mb = mid(c, p[(k + 1) % n]);
    if (water[a] && water[b]) {
      ctx.moveTo(ma.x, ma.y);
      ctx.arcTo(c.x, c.y, mb.x, mb.y, r);
      ctx.lineTo(mb.x, mb.y);
    } else {
      if (water[a]) {
        ctx.moveTo(ma.x, ma.y);
        ctx.lineTo(c.x, c.y);
      }
      if (water[b]) {
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(mb.x, mb.y);
      }
    }
  }
}

/**
 * The faint borders between neighbouring land hexes of different terrain, each shared edge once,
 * unless `hide` says the edge is blended.
 */
export function hexBorders(ctx: Ctx, scene: Scene, tiles: readonly { x: number; y: number }[], hide?: (ax: number, ay: number, bx: number, by: number) => boolean): void {
  const s = scene.state;
  const grid = gridOf(s);
  const { width, height } = s.map;
  for (const { x, y } of tiles) {
    const t = s.map.tiles[y * width + x];
    if (TERRAIN[t.t].water) continue;
    const o = grid.neighbourOffsets(x, y);
    let p: Point[] | undefined;
    for (let d = 0; d < grid.directions.length; d++) {
      const nx = x + o[2 * d];
      const ny = y + o[2 * d + 1];
      // Each edge once: from the tile that comes first in the map's order.
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || ny * width + nx < y * width + x) continue;
      const n = s.map.tiles[ny * width + nx];
      if (TERRAIN[n.t].water || n.t === t.t) continue;
      if (hide?.(x, y, nx, ny)) continue;
      p ??= tileOutline(scene, x, y);
      const [a, b] = edgeCorners(grid, d);
      ctx.moveTo(p[a].x, p[a].y);
      ctx.lineTo(p[b].x, p[b].y);
    }
  }
}

/** A plain hex outline (`inset` px inwards; negative grows it). */
export function hexPath(ctx: Ctx, scene: Scene, x: number, y: number, inset = 0): void {
  const p = tileOutline(scene, x, y, inset);
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
}

/** A wave mark on a water hex, kept well inside it (the inscribed circle) so it never spills onto a neighbour. */
export function hexWaves(ctx: Ctx, x: number, y: number, cx: number, cy: number, z: number, lw: number, color: string): void {
  if (hash2(x, y, 3) > 0.38) return;
  const w = z * 0.13;
  const wx = cx + z * (-0.28 + hash2(x, y, 4) * 0.3);
  const wy = cy + z * (-0.2 + hash2(x, y, 5) * 0.4);
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.quadraticCurveTo(wx + w / 2, wy - w * 0.6, wx + w, wy);
  ctx.quadraticCurveTo(wx + w * 1.5, wy - w * 0.6, wx + w * 2, wy);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw * 0.8;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Plowed furrows across a hex, clipped a little inside its outline. */
export function hexFurrows(ctx: Ctx, scene: Scene, x: number, y: number, cx: number, cy: number, z: number, color: string, lw: number): void {
  ctx.save();
  ctx.beginPath();
  hexPath(ctx, scene, x, y, z * 0.08);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw * 0.9;
  // The same slant and spacing as on squares, over the hex's whole height.
  for (let i = -5; i <= 5; i++) {
    const bx = cx + i * z * 0.22;
    ctx.beginPath();
    ctx.moveTo(bx - z * 0.3, cy + z * 0.6);
    ctx.lineTo(bx + z * 0.3, cy - z * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}
