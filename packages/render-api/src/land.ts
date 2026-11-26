/**
 * The land as a people sees it (native-nations.md T5, T10; Beta 3 step 10), drawn the same way by
 * every style: the borders of a playing people's claimed land, and on request (`Scene.overlay`
 * 'land') a map of the land's health by region with each region's name and health, every claim's
 * border and the regions having a hard year. Styles call these after their terrain and before
 * their towns and units; a style may draw its own instead.
 */
import { healthWords, isHardYear, kindOfId, nationOf, regionHealth, regionName, regionOf, type GameState, type PlayerId } from '@cc/engine';
import { isTileExplored, tileToScreen, visibleRange, type Scene } from './index.js';

type Ctx2D = CanvasRenderingContext2D;

/** The colour of a region's health: green when whole, amber when thinning or worn, red when emptied. */
export function healthColor(health: number): string {
  if (health >= 90) return '#4caf50';
  if (health >= 70) return '#b5c43a';
  if (health >= 40) return '#e0a030';
  return '#d0453a';
}

/**
 * Borders of claimed land: an edge in the claimant's colour wherever a tile it claims meets a tile
 * it does not. Always for a playing people's land; with the land overlay, every claim.
 */
export function drawClaimBorders(ctx: Ctx2D, scene: Scene, opts: { width?: number; ink?: string; dashed?: boolean } = {}): void {
  const s = scene.state as GameState;
  const all = scene.overlay === 'land';
  const z = scene.camera.zoom;
  const r = visibleRange(scene);
  const w = s.map.width;
  const claimOf = (x: number, y: number): PlayerId | undefined => (x < 0 || y < 0 || x >= w || y >= s.map.height ? undefined : s.map.tiles[y * w + x].claim);
  const lw = opts.width ?? Math.max(1.5, z * 0.05);
  const inset = lw / 2 + 1;
  ctx.save();
  ctx.lineCap = 'round';
  // Dashed where a style's roads are lines of the same colour.
  if (opts.dashed) ctx.setLineDash([lw * 2.5, lw * 2]);
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const claim = claimOf(x, y);
      if (!claim || (!all && kindOfId(claim) !== 'people') || !isTileExplored(scene, x, y)) continue;
      const p = tileToScreen(scene, x, y);
      const edges: [number, number, number, number, boolean][] = [
        [p.x + inset, p.y + inset, p.x + z - inset, p.y + inset, claimOf(x, y - 1) !== claim],
        [p.x + z - inset, p.y + inset, p.x + z - inset, p.y + z - inset, claimOf(x + 1, y) !== claim],
        [p.x + inset, p.y + z - inset, p.x + z - inset, p.y + z - inset, claimOf(x, y + 1) !== claim],
        [p.x + inset, p.y + inset, p.x + inset, p.y + z - inset, claimOf(x - 1, y) !== claim],
      ];
      ctx.beginPath();
      for (const [x0, y0, x1, y1, on] of edges) {
        if (!on) continue;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      if (opts.ink) {
        ctx.strokeStyle = opts.ink;
        ctx.lineWidth = lw + 1.5;
        ctx.stroke();
      }
      ctx.strokeStyle = nationOf(s, claim).color;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * The land overlay (`Scene.overlay` 'land'): each explored land tile tinted by its region's health
 * (or by its claimant where the game keeps no health), region edges as faint lines, and each
 * region's name and health in words at the middle of its tiles in view.
 */
export function drawLandOverlay(ctx: Ctx2D, scene: Scene): void {
  if (scene.overlay !== 'land') return;
  const s = scene.state as GameState;
  const land = s.land;
  const z = scene.camera.zoom;
  const r = visibleRange(scene);
  const w = s.map.width;
  ctx.save();
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const tile = s.map.tiles[y * w + x];
      if (!isTileExplored(scene, x, y)) continue;
      const p = tileToScreen(scene, x, y);
      const water = tile.t === 'ocean' || tile.t === 'highSeas';
      if (land && !water) {
        const region = regionOf(land, x, y);
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = land.health ? healthColor(regionHealth(s, region)) : tile.claim ? nationOf(s, tile.claim).color : 'transparent';
        ctx.fillRect(p.x, p.y, z, z);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (x + 1 < w && regionOf(land, x + 1, y) !== region) {
          ctx.moveTo(p.x + z, p.y);
          ctx.lineTo(p.x + z, p.y + z);
        }
        if (y + 1 < s.map.height && regionOf(land, x, y + 1) !== region) {
          ctx.moveTo(p.x, p.y + z);
          ctx.lineTo(p.x + z, p.y + z);
        }
        ctx.stroke();
      } else if (!land && tile.claim) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = nationOf(s, tile.claim).color;
        ctx.fillRect(p.x, p.y, z, z);
      }
    }
  }
  ctx.restore();
}

/**
 * The land overlay's labels: each region's name, its health in words and a hard year, at the
 * middle of its tiles in view. Drawn last, over towns and units, so they stay readable.
 */
export function drawLandLabels(ctx: Ctx2D, scene: Scene, font: string): void {
  if (scene.overlay !== 'land') return;
  const s = scene.state as GameState;
  const land = s.land;
  if (!land) return;
  const z = scene.camera.zoom;
  const r = visibleRange(scene);
  const w = s.map.width;
  const centres = new Map<number, { x: number; y: number; n: number }>();
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const t = s.map.tiles[y * w + x].t;
      if (t === 'ocean' || t === 'highSeas' || !isTileExplored(scene, x, y)) continue;
      const region = regionOf(land, x, y);
      const c = centres.get(region) ?? { x: 0, y: 0, n: 0 };
      c.x += x;
      c.y += y;
      c.n++;
      centres.set(region, c);
    }
  }
  ctx.save();
  // The region's name and health, where enough of it is in view to carry a label.
  const size = Math.max(10, Math.min(14, z * 0.28));
  ctx.font = `600 ${Math.round(size)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [region, c] of centres) {
    if (c.n < 9) continue;
    const p = tileToScreen(scene, c.x / c.n, c.y / c.n);
    const health = land.health ? regionHealth(s, region) : undefined;
    const lines = [regionName(s, region), health === undefined ? '' : `${healthWords(health)} (${health})`, isHardYear(s, region) ? 'hard year' : ''].filter(Boolean);
    lines.forEach((text, i) => {
      const ty = p.y + z / 2 + (i - (lines.length - 1) / 2) * size * 1.2;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(text, p.x + z / 2, ty);
      ctx.fillStyle = i === 0 ? '#ffffff' : health !== undefined && i === 1 ? healthColor(health) : '#ffd27a';
      ctx.fillText(text, p.x + z / 2, ty);
    });
  }
  ctx.restore();
}
