/**
 * The map layers a sprite pack paints over its fallback style, as MapLayerHooks. Each hook returns
 * false when its sprite is missing or not loaded yet, and the fallback draws that piece instead.
 */
import { NATIONS, TERRAIN, type GameState } from '@cc/engine';
import type { LayerTile, MapLayerHooks } from '@cc/render-api';
import type { SpriteIds } from './ids.js';
import type { PackLayer, Placement, SpritePack } from './pack.js';
import type { Painter } from './painter.js';

/** Neighbour offsets clockwise from north: N, NE, E, SE, S, SW, W, NW. */
export const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

function isLand(s: Readonly<GameState>, x: number, y: number, outside: boolean): boolean {
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return outside;
  return !TERRAIN[s.map.tiles[y * s.map.width + x].t].water;
}

function hasRoadAt(s: Readonly<GameState>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return false;
  return !!s.map.tiles[y * s.map.width + x].r || Object.values(s.colonies).some((c) => c.x === x && c.y === y);
}

/** Whether a land tile's outline has a rounded corner (water on two adjacent sides; off-map counts as land). */
function roundedCorner(s: Readonly<GameState>, x: number, y: number): boolean {
  const water = (i: number) => !isLand(s, x + DIRS[i][0], y + DIRS[i][1], true);
  return (water(0) && water(2)) || (water(2) && water(4)) || (water(4) && water(6)) || (water(6) && water(0));
}

/**
 * Which quarter-turned coast pieces a water tile needs, from its eight neighbours (`land[i]` for
 * DIRS[i]). Pieces point north (edge), north and west (inner) or north-west (outer) unturned.
 */
export function coastPieces(land: readonly boolean[], hasInner: boolean): { piece: 'edge' | 'inner' | 'outer'; turns: number }[] {
  const out: { piece: 'edge' | 'inner' | 'outer'; turns: number }[] = [];
  const side = (k: number) => land[(2 * k) % 8];
  const corner = (k: number) => land[(2 * k + 7) % 8];
  const covered = [false, false, false, false];
  if (hasInner) {
    for (let k = 0; k < 4; k++) {
      const prev = (k + 3) % 4;
      if (side(k) && side(prev)) {
        out.push({ piece: 'inner', turns: k });
        covered[k] = covered[prev] = true;
      }
    }
  }
  for (let k = 0; k < 4; k++) if (side(k) && !covered[k]) out.push({ piece: 'edge', turns: k });
  for (let k = 0; k < 4; k++) if (corner(k) && !side(k) && !side((k + 3) % 4)) out.push({ piece: 'outer', turns: k });
  return out;
}

/** Quarter turns for a road spoke towards neighbour DIRS[i]: spokes point north, diagonals north-west. */
export function roadTurns(i: number): { diagonal: boolean; turns: number } {
  return i % 2 === 0 ? { diagonal: false, turns: i / 2 } : { diagonal: true, turns: ((i + 1) / 2) % 4 };
}

export function createLayerHooks(pack: SpritePack, ids: SpriteIds, painter: Painter, ink: string): MapLayerHooks {
  const off = new Set<PackLayer>(pack.procedural ?? []);
  const rules = pack.rules;
  let dpr = 1;
  const plowed = new Set<LayerTile>();

  const placed = (ctx: CanvasRenderingContext2D, list: string[], p: Placement, px: number, py: number, z: number) =>
    painter.anchored(ctx, list, px + p.x * z, py + p.y * z, p.scale * z, dpr);

  const hooks: MapLayerHooks = {
    beginFrame(_ctx, scene) {
      dpr = scene.pixelRatio;
      plowed.clear();
    },
  };

  if (!off.has('water')) {
    hooks.water = (ctx, t, z) => painter.square(ctx, ids.water(t.tile.t), t.px, t.py, z, dpr, { fill: true, bleed: 0.5 });
  }

  if (!off.has('land')) {
    hooks.land = (ctx, t, z, shape, s) => {
      const list = ids.terrain(t.tile);
      const pick = painter.pick(list, z, dpr, true);
      if (!pick) return false;
      // Clip only where the outline is rounded: elsewhere tiles overlap a little, without seams.
      const clip = roundedCorner(s, t.x, t.y);
      if (clip) {
        ctx.save();
        ctx.beginPath();
        shape();
        ctx.clip();
      }
      painter.square(ctx, list, t.px, t.py, z, dpr, { fill: true, bleed: clip ? 0 : 0.5 });
      if (clip) ctx.restore();
      if (t.tile.p && ids.plowed(t.tile.t).includes(pick.id)) plowed.add(t);
      return true;
    };
    hooks.plowed = (_ctx, t) => plowed.has(t);
  }

  if (!off.has('shore')) {
    const coast = ids.coast();
    hooks.shore = (ctx, tiles, z, s) => {
      if (!painter.pick(coast.edge, z, dpr, true)) return;
      const hasInner = !!painter.pick(coast.inner, z, dpr, true);
      const hasOuter = !!painter.pick(coast.outer, z, dpr, true);
      for (const t of tiles) {
        if (!TERRAIN[t.tile.t].water) continue;
        const land = DIRS.map(([dx, dy]) => isLand(s, t.x + dx, t.y + dy, false));
        if (!land.some(Boolean)) continue;
        for (const { piece, turns } of coastPieces(land, hasInner)) {
          if (piece === 'outer' && !hasOuter) continue;
          painter.square(ctx, coast[piece], t.px, t.py, z, dpr, { fill: true, rotate: turns });
        }
      }
    };
  }

  if (!off.has('roads')) {
    const road = ids.road();
    hooks.road = (ctx, t, z, s) => {
      const links = DIRS.map(([dx, dy]) => hasRoadAt(s, t.x + dx, t.y + dy));
      const ready =
        painter.pick(road.hub, z, dpr, true) &&
        (!links.some((l, i) => l && i % 2 === 0) || painter.pick(road.spoke, z, dpr, true)) &&
        (!links.some((l, i) => l && i % 2 === 1) || painter.pick(road.diagonal, z, dpr, true));
      if (!ready) return false;
      links.forEach((l, i) => {
        if (!l) return;
        const { diagonal, turns } = roadTurns(i);
        painter.square(ctx, diagonal ? road.diagonal : road.spoke, t.px, t.py, z, dpr, { fill: true, rotate: turns });
      });
      painter.square(ctx, road.hub, t.px, t.py, z, dpr, { fill: true });
      return true;
    };
  }

  if (!off.has('relief')) {
    hooks.relief = (ctx, t, z) => {
      const r = ids.relief(t.tile);
      return !!r && placed(ctx, r.ids, rules[r.kind], t.px, t.py, z);
    };
  }

  if (!off.has('bonus')) {
    hooks.bonus = (ctx, t, z) => {
      const b = rules.bonus;
      return painter.square(ctx, ids.bonus(t.tile), t.px + b.x * z, t.py + b.y * z, b.size * z, dpr);
    };
  }

  if (!off.has('rumour')) hooks.rumour = (ctx, t, z) => placed(ctx, ids.rumour(), rules.rumour, t.px, t.py, z);

  if (!off.has('settlements')) {
    const mission = ids.overlay('mission');
    hooks.settlement = (ctx, st, px, py, z) => {
      if (!placed(ctx, ids.settlement(st.tribe, st.capital), rules.settlement, px, py, z)) return false;
      const m = rules.mission;
      if (st.mission && m) painter.tinted(ctx, mission, px + m.x * z, py + m.y * z, m.size * z, dpr, NATIONS[st.mission].color);
      return true;
    };
  }

  if (!off.has('colonies')) {
    const flagIds = ids.overlay('flag');
    hooks.colony = (ctx, c, size, px, py, z) => {
      const p = rules.colony;
      const town = ids.colony(size);
      if (!painter.pick(town, p.scale * z, dpr)) return false;
      const walls = ids.defence(c.buildings.stockade);
      const w = rules.defence;
      // Walls that cannot be drawn yet: the whole colony falls back, so the stockade still shows.
      if (walls.length && !painter.pick(walls, w.scale * z, dpr)) return false;
      const wall = (part: 'back' | 'front') => painter.anchored(ctx, walls, px + w.x * z, py + w.y * z, w.scale * z, dpr, { part });
      if (walls.length) wall('back');
      const f = rules.colonyFlag;
      if (f) colonyFlag(ctx, painter, flagIds, px + f.x * z, py + f.y * z, f.height * z, dpr, NATIONS[c.owner].color, ink, z);
      placed(ctx, town, p, px, py, z);
      if (walls.length) wall('front');
      return true;
    };
  }

  if (!off.has('units')) {
    hooks.unit = (ctx, stack, x, y, s) => {
      const box = s * rules.unit.scale;
      return painter.square(ctx, ids.unit(stack.top.type, stack.top.role), x - box / 2, y - box / 2 + s * rules.unit.dy, box, dpr);
    };
  }

  return hooks;
}

/** A flagpole with the owner's flag: the tinted flag sprite, or a plain inked pennant. */
function colonyFlag(
  ctx: CanvasRenderingContext2D,
  painter: Painter,
  flagIds: string[],
  x: number,
  y: number,
  h: number,
  dpr: number,
  color: string,
  ink: string,
  z: number,
): void {
  const lw = Math.max(1.1, z * 0.032);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  const size = h * 0.62;
  // The flag sprite has its own bit of pole on the left, at about 18% of its width.
  if (!painter.tinted(ctx, flagIds, x - size * 0.18, y - h - size * 0.12, size, dpr, color)) {
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h * 0.6, y - h * 0.86);
    ctx.lineTo(x, y - h * 0.68);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
