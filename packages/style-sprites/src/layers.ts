/**
 * The map layers a sprite pack paints over its fallback style, as MapLayerHooks. Each hook returns
 * false when its sprite is missing or not loaded yet, and the fallback draws that piece instead.
 */
import { kindOfId, nationOf, TERRAIN, type GameState, type TerrainId, type TribeId } from '@cc/engine';
import type { LayerTile, MapLayerHooks } from '@cc/render-api';
import type { SpriteIds } from './ids.js';
import type { PackLayer, Placement, SpritePack } from './pack.js';
import type { Painter } from './painter.js';
import { coastPieces } from './coast.js';
import { isTakeOf, type VariantContext } from './variants.js';
import { transitionPieces, type TransitionPieces } from './transitions.js';

export { coastPieces };

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

/** The terrain of a land tile, undefined for water and off the map. */
function landTerrainAt(s: Readonly<GameState>, x: number, y: number): TerrainId | undefined {
  if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) return undefined;
  const t = s.map.tiles[y * s.map.width + x].t;
  return TERRAIN[t].water ? undefined : t;
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

/** Quarter turns for a road spoke towards neighbour DIRS[i]: spokes point north, diagonals north-west. */
export function roadTurns(i: number): { diagonal: boolean; turns: number } {
  return i % 2 === 0 ? { diagonal: false, turns: i / 2 } : { diagonal: true, turns: ((i + 1) / 2) % 4 };
}

export function createLayerHooks(pack: SpritePack, ids: SpriteIds, painter: Painter, ink: string): MapLayerHooks {
  const off = new Set<PackLayer>(pack.procedural ?? []);
  const rules = pack.rules;
  let dpr = 1;
  const plowed = new Set<LayerTile>();
  let seed = 0;
  // The variant choice of a tile: its position, the map seed, and what the manifest has (nothing, until it has loaded).
  const vary = (t: LayerTile): VariantContext | undefined =>
    rules.variants === 'off' ? undefined : { mode: rules.variants, seed, x: t.x, y: t.y, has: (id) => painter.store?.has(id) ?? false };

  const placed = (ctx: CanvasRenderingContext2D, list: string[], p: Placement, px: number, py: number, z: number) =>
    painter.anchored(ctx, list, px + p.x * z, py + p.y * z, p.scale * z, dpr);

  const hooks: MapLayerHooks = {
    beginFrame(_ctx, scene) {
      dpr = scene.pixelRatio;
      seed = scene.state?.config?.seed ?? 0;
      plowed.clear();
    },
  };

  if (!off.has('water')) {
    hooks.water = (ctx, t, z) => painter.square(ctx, ids.water(t.tile.t, vary(t)), t.px, t.py, z, dpr, { fill: true, bleed: 0.5 });
  }

  // Terrain transitions: bands of the higher-ranked neighbour over a tile's ground (rules.transitions).
  const blend = rules.transitions === 'overlay';
  const order = rules.transitionOrder;
  const hasPieces = (z: number) => (terrain: TerrainId): TransitionPieces | undefined => {
    const p = ids.transition(terrain);
    if (!painter.pick(p.edge, z, dpr, true)) return undefined;
    return { edge: true, inner: !!painter.pick(p.inner, z, dpr, true), outer: !!painter.pick(p.outer, z, dpr, true) };
  };
  const blendBorders = (ctx: CanvasRenderingContext2D, t: LayerTile, z: number, s: Readonly<GameState>) => {
    const nbr = DIRS.map(([dx, dy]) => landTerrainAt(s, t.x + dx, t.y + dy));
    for (const { terrain, piece, turns } of transitionPieces(order, t.tile.t, nbr, hasPieces(z))) {
      painter.square(ctx, ids.transition(terrain)[piece], t.px, t.py, z, dpr, { fill: true, rotate: turns });
    }
  };

  if (!off.has('land')) {
    // Where a band is drawn the terrain no longer changes at the straight tile edge: no grey line there.
    if (blend) {
      hooks.hideBorder = (ax, ay, bx, by, z, s) => {
        const a = landTerrainAt(s, ax, ay);
        const b = landTerrainAt(s, bx, by);
        if (!a || !b) return false;
        const ra = order.indexOf(a);
        const rb = order.indexOf(b);
        if (ra < 0 || rb < 0 || ra === rb) return false;
        return !!hasPieces(z)(ra > rb ? a : b);
      };
    }
    hooks.land = (ctx, t, z, shape, s) => {
      const list = ids.terrain(t.tile, vary(t));
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
      if (blend) blendBorders(ctx, t, z, s);
      if (clip) ctx.restore();
      if (t.tile.p && ids.plowed(t.tile.t).some((p) => isTakeOf(pick.id, p))) plowed.add(t);
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
      // On a river tile the road does not run along the water: spokes towards a neighbour the river
      // links are left out, and the hub (the bridge) stays where the road meets the river.
      const rd = t.tile.rd ?? 0;
      links.forEach((l, i) => {
        if (!l || rd & (1 << i)) return;
        const { diagonal, turns } = roadTurns(i);
        painter.square(ctx, diagonal ? road.diagonal : road.spoke, t.px, t.py, z, dpr, { fill: true, rotate: turns });
      });
      painter.square(ctx, road.hub, t.px, t.py, z, dpr, { fill: true });
      return true;
    };
  }

  if (!off.has('relief')) {
    hooks.relief = (ctx, t, z) => {
      const r = ids.relief(t.tile, vary(t));
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
    hooks.settlement = (ctx, st, px, py, z, state) => {
      if (!placed(ctx, ids.settlement(st.tribe, st.capital), rules.settlement, px, py, z)) return false;
      const m = rules.mission;
      if (st.mission && m) painter.tinted(ctx, mission, px + m.x * z, py + m.y * z, m.size * z, dpr, nationOf(state, st.mission).color);
      return true;
    };
  }

  if (!off.has('colonies')) {
    const flagIds = ids.overlay('flag');
    hooks.colony = (ctx, c, size, px, py, z, state) => {
      // A playing people's town (native-nations.md T2): its people's settlement sprite when the pack
      // has one, else the procedural town of the style underneath (never a European colony).
      if (kindOfId(c.owner) === 'people') return placed(ctx, ids.settlement(c.owner as TribeId, false), rules.settlement, px, py, z);
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
      if (f) colonyFlag(ctx, painter, flagIds, px + f.x * z, py + f.y * z, f.height * z, dpr, nationOf(state, c.owner).color, ink, z);
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
    // Braves: their own sprites when the pack has them, else drawn procedurally by the renderer.
    hooks.brave = (ctx, b, x, y, s) => {
      const box = s * rules.unit.scale;
      return painter.square(ctx, ids.brave(b.armed, b.mounted), x - box / 2, y - box / 2 + s * rules.unit.dy, box, dpr);
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
