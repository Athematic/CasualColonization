/**
 * Plain placeholders for a sprite pack with `fallback: 'placeholder'` (docs/design/hex-maps.md H15): where a sprite
 * is missing, these draw instead of the fallback style's procedural drawing. A flat colour per terrain, a simple
 * silhouette per category for relief, towns, settlements and units (with a letter for a colonist's role), and
 * labelled shapes for icons. Nothing is loaded; everything is a few canvas paths, so they work on any grid: ground
 * fills the shape the renderer gives (a square or a hex), the rest sits at the tile's centre.
 *
 * The tables below are what the missing-ids check (missing.ts) reads to tell whether a placeholder exists for
 * an id a pack lacks: `placeholderCovers`.
 */
import {
  BUILDINGS,
  FATHERS,
  PRODUCT_NAMES,
  TERRAIN,
  TRIBES,
  UNIT_TYPES,
  type BuildingKind,
  type FatherCategory,
  type FatherId,
  type GameState,
  type ProductId,
  type RoleId,
  type SettlementLook,
  type TerrainId,
  type TribeId,
  type UnitKind,
  type UnitTypeId,
} from '@cc/engine';
import { fatherInitials, roadDrawing, roadMask, traceStrand, type IconRequest } from '@cc/render-api';

type Ctx = CanvasRenderingContext2D;

/** Outline colour of every placeholder shape. */
export const PLACEHOLDER_INK = '#1b1f24';

/** Flat ground colours, one per terrain (muted, so towns and units stand out). */
export const PLACEHOLDER_TERRAIN: Record<TerrainId, string> = {
  ocean: '#3f6f96',
  highSeas: '#2c5576',
  plains: '#a7bb72',
  grassland: '#86ad5c',
  prairie: '#c9b96e',
  savannah: '#c4a957',
  marsh: '#7f9a78',
  swamp: '#66876a',
  desert: '#d9c48e',
  tundra: '#aab3a6',
  arctic: '#eef3f5',
  hills: '#b09a6c',
  mountains: '#8d847c',
};

/** A silhouette in a unit box centred on the origin (−0.5 … 0.5), traced as one path. */
type Silhouette = (ctx: Ctx) => void;

const person: Silhouette = (ctx) => {
  ctx.moveTo(0.1, -0.26);
  ctx.arc(0, -0.26, 0.1, 0, Math.PI * 2);
  ctx.moveTo(-0.15, -0.12);
  ctx.lineTo(0.15, -0.12);
  ctx.lineTo(0.22, 0.36);
  ctx.lineTo(-0.22, 0.36);
  ctx.closePath();
};

/** One silhouette per unit kind. */
export const PLACEHOLDER_UNITS: Record<UnitKind, Silhouette> = {
  colonist: person,
  ship: (ctx) => {
    ctx.moveTo(-0.4, 0.1);
    ctx.lineTo(0.4, 0.1);
    ctx.lineTo(0.27, 0.32);
    ctx.lineTo(-0.27, 0.32);
    ctx.closePath();
    ctx.moveTo(0.03, -0.38);
    ctx.lineTo(0.3, 0.04);
    ctx.lineTo(0.03, 0.04);
    ctx.closePath();
    ctx.moveTo(-0.03, -0.3);
    ctx.lineTo(-0.03, 0.04);
    ctx.lineTo(-0.27, 0.04);
    ctx.closePath();
  },
  wagon: (ctx) => {
    ctx.rect(-0.36, -0.18, 0.72, 0.3);
    for (const x of [-0.2, 0.2]) {
      ctx.moveTo(x + 0.1, 0.22);
      ctx.arc(x, 0.22, 0.1, 0, Math.PI * 2);
    }
  },
  artillery: (ctx) => {
    ctx.moveTo(-0.38, 0.02);
    ctx.lineTo(0.3, -0.24);
    ctx.lineTo(0.36, -0.12);
    ctx.lineTo(-0.3, 0.14);
    ctx.closePath();
    ctx.moveTo(0.12, 0.18);
    ctx.arc(-0.02, 0.18, 0.14, 0, Math.PI * 2);
  },
  treasure: (ctx) => {
    ctx.rect(-0.32, -0.06, 0.64, 0.36);
    ctx.moveTo(-0.32, -0.06);
    ctx.quadraticCurveTo(0, -0.38, 0.32, -0.06);
    ctx.closePath();
  },
};

/** The letter on a colonist in a role ('' for none). */
export const PLACEHOLDER_ROLES: Record<RoleId, string> = {
  none: '',
  soldier: 'S',
  dragoon: 'D',
  pioneer: 'P',
  scout: 'Sc',
  missionary: 'M',
};

/** One silhouette per settlement look (rules/natives.ts SETTLEMENT_KINDS). */
export const PLACEHOLDER_SETTLEMENTS: Record<SettlementLook, Silhouette> = {
  camp: (ctx) => {
    ctx.moveTo(0, -0.34);
    ctx.lineTo(0.34, 0.3);
    ctx.lineTo(-0.34, 0.3);
    ctx.closePath();
  },
  village: (ctx) => {
    ctx.moveTo(-0.36, 0.3);
    ctx.lineTo(-0.36, 0.06);
    ctx.arc(0, 0.06, 0.36, Math.PI, 0);
    ctx.lineTo(0.36, 0.3);
    ctx.closePath();
  },
  city: (ctx) => {
    ctx.moveTo(-0.4, 0.3);
    for (const [x, y] of [
      [-0.4, 0.1],
      [-0.26, 0.1],
      [-0.26, -0.1],
      [-0.12, -0.1],
      [-0.12, -0.32],
      [0.12, -0.32],
      [0.12, -0.1],
      [0.26, -0.1],
      [0.26, 0.1],
      [0.4, 0.1],
      [0.4, 0.3],
    ]) {
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  },
};

const house: Silhouette = (ctx) => {
  ctx.moveTo(-0.32, 0.3);
  ctx.lineTo(-0.32, -0.04);
  ctx.lineTo(0, -0.32);
  ctx.lineTo(0.32, -0.04);
  ctx.lineTo(0.32, 0.3);
  ctx.closePath();
};

/** Relief: forest, hills and mountains, drawn in the lower part of the tile. */
export const PLACEHOLDER_RELIEF: Record<'forest' | 'hills' | 'mountains', { color: string; shape: Silhouette }> = {
  forest: {
    color: '#3f6b38',
    shape: (ctx) => {
      for (const [x, y] of [
        [-0.2, 0.06],
        [0.18, 0.02],
        [0, 0.24],
      ]) {
        ctx.moveTo(x, y - 0.2);
        ctx.lineTo(x + 0.12, y + 0.08);
        ctx.lineTo(x - 0.12, y + 0.08);
        ctx.closePath();
      }
    },
  },
  hills: {
    color: '#9c8558',
    shape: (ctx) => {
      ctx.moveTo(-0.38, 0.24);
      ctx.quadraticCurveTo(-0.18, -0.12, 0.02, 0.24);
      ctx.closePath();
      ctx.moveTo(-0.04, 0.24);
      ctx.quadraticCurveTo(0.18, -0.02, 0.38, 0.24);
      ctx.closePath();
    },
  },
  mountains: {
    color: '#77706a',
    shape: (ctx) => {
      ctx.moveTo(-0.4, 0.28);
      ctx.lineTo(-0.1, -0.3);
      ctx.lineTo(0.12, 0.1);
      ctx.lineTo(0.22, -0.08);
      ctx.lineTo(0.4, 0.28);
      ctx.closePath();
    },
  },
};

/** Line widths of the walls around a colony, by stockade level (1 stockade, 2 fort, 3 fortress). */
export const PLACEHOLDER_WALLS: Record<number, number> = { 1: 1.5, 2: 2.5, 3: 3.5 };

const CATEGORY_COLORS: Record<FatherCategory, string> = {
  trade: '#b8892f',
  exploration: '#3f7f6a',
  military: '#9b3b32',
  political: '#3d5f99',
  religious: '#6d4f8f',
};

/** Fills and outlines a silhouette scaled to a box of `s` px centred on (cx, cy). */
function shape(ctx: Ctx, sil: Silhouette, cx: number, cy: number, s: number, fill: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  sil(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.03) / s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.stroke();
  ctx.restore();
}

/** A short label in a small dark disc. */
function label(ctx: Ctx, text: string, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = PLACEHOLDER_INK;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.max(6, Math.round(r * (text.length > 1 ? 1.05 : 1.4)))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

// ---- The map ----

/** A tile's ground: its terrain's flat colour inside `shape` (the renderer's outline), else the box. */
export function placeholderGround(ctx: Ctx, terrain: TerrainId, px: number, py: number, z: number, outline?: () => void): void {
  ctx.save();
  ctx.beginPath();
  if (outline) outline();
  else ctx.rect(px, py, z + 0.5, z + 0.5);
  ctx.fillStyle = PLACEHOLDER_TERRAIN[terrain];
  ctx.fill();
  ctx.restore();
}

/** Plowed land: three short furrows across the middle of the tile. */
export function placeholderPlowed(ctx: Ctx, px: number, py: number, z: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(60,45,25,0.45)';
  ctx.lineWidth = Math.max(1, z * 0.03);
  ctx.beginPath();
  for (const d of [-0.16, 0, 0.16]) {
    ctx.moveTo(px + z * 0.26, py + z * (0.5 + d));
    ctx.lineTo(px + z * 0.74, py + z * (0.5 + d));
  }
  ctx.stroke();
  ctx.restore();
}

export function placeholderRelief(ctx: Ctx, kind: 'forest' | 'hills' | 'mountains', px: number, py: number, z: number): void {
  const r = PLACEHOLDER_RELIEF[kind];
  shape(ctx, r.shape, px + z / 2, py + z / 2, z * 0.8, r.color);
}

/** A bonus resource: a gold disc towards the top right. */
export function placeholderBonus(ctx: Ctx, px: number, py: number, z: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(px + z * 0.72, py + z * 0.26, z * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = '#f2c94c';
  ctx.fill();
  ctx.lineWidth = Math.max(1, z * 0.025);
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.stroke();
  ctx.restore();
}

/** A rumour: a question mark in a pale disc. */
export function placeholderRumour(ctx: Ctx, px: number, py: number, z: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(px + z / 2, py + z / 2, z * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff4c2';
  ctx.fill();
  ctx.lineWidth = Math.max(1, z * 0.03);
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.stroke();
  ctx.fillStyle = PLACEHOLDER_INK;
  ctx.font = `700 ${Math.round(z * 0.28)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', px + z / 2, py + z / 2 + 0.5);
  ctx.restore();
}

/** A road: plain brown lines through the tile's centre to its road neighbours (render-api's curves, any grid). */
export function placeholderRoad(ctx: Ctx, s: Readonly<GameState>, x: number, y: number, px: number, py: number, z: number): void {
  const towns = new Set(Object.values(s.colonies).map((c) => c.y * s.map.width + c.x));
  const linked = (nx: number, ny: number) => !!s.map.tiles[ny * s.map.width + nx].r || towns.has(ny * s.map.width + nx);
  const { strands } = roadDrawing(s, x, y, roadMask(s, x, y, linked));
  const cx = px + z / 2;
  const cy = py + z / 2;
  ctx.save();
  ctx.strokeStyle = '#6b5235';
  ctx.lineWidth = Math.max(1.2, z * 0.06);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const st of strands) traceStrand(ctx, st, cx, cy, z, true);
  ctx.stroke();
  const [hx, hy] = strands.length ? [cx + strands[0].sx * z, cy + strands[0].sy * z] : [cx, cy];
  ctx.fillStyle = '#6b5235';
  ctx.fillRect(hx - z * 0.05, hy - z * 0.05, z * 0.1, z * 0.1);
  ctx.restore();
}

/** A settlement: its look's silhouette in the tribe's colour, a gold star over a capital, a mission's cross. */
export function placeholderSettlement(ctx: Ctx, look: SettlementLook, tribe: TribeId, capital: boolean, mission: string | undefined, px: number, py: number, z: number): void {
  const cx = px + z / 2;
  const cy = py + z / 2;
  shape(ctx, PLACEHOLDER_SETTLEMENTS[look], cx, cy, z * 0.8, TRIBES[tribe].color);
  if (capital) label(ctx, '★', cx, cy - z * 0.34, z * 0.12);
  if (mission) {
    ctx.save();
    ctx.strokeStyle = PLACEHOLDER_INK;
    ctx.lineWidth = Math.max(2, z * 0.07);
    ctx.lineCap = 'round';
    const mx = cx + z * 0.3;
    const my = cy - z * 0.12;
    const cross = () => {
      ctx.beginPath();
      ctx.moveTo(mx, my - z * 0.12);
      ctx.lineTo(mx, my + z * 0.12);
      ctx.moveTo(mx - z * 0.07, my - z * 0.04);
      ctx.lineTo(mx + z * 0.07, my - z * 0.04);
      ctx.stroke();
    };
    cross();
    ctx.strokeStyle = mission;
    ctx.lineWidth = Math.max(1, z * 0.035);
    cross();
    ctx.restore();
  }
}

/** A colony: a house in the owner's colour, larger as it grows, inside a frame per wall level. */
export function placeholderColony(ctx: Ctx, color: string, size: number, stockade: number, px: number, py: number, z: number): void {
  const cx = px + z / 2;
  const cy = py + z / 2;
  const walls = PLACEHOLDER_WALLS[stockade];
  if (walls) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, z * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    ctx.fill();
    ctx.lineWidth = walls * Math.max(1, z / 40);
    ctx.strokeStyle = PLACEHOLDER_INK;
    ctx.stroke();
    ctx.restore();
  }
  const k = size >= 8 ? 0.82 : size >= 4 ? 0.72 : 0.62;
  shape(ctx, house, cx, cy, z * k, color);
}

/** A unit: its kind's silhouette in the owner's colour, with the role's letter on a colonist. */
export function placeholderUnit(ctx: Ctx, type: UnitTypeId, role: RoleId, color: string, cx: number, cy: number, s: number): void {
  shape(ctx, PLACEHOLDER_UNITS[UNIT_TYPES[type].kind], cx, cy, s * 0.9, color);
  const letter = PLACEHOLDER_ROLES[role];
  if (letter) label(ctx, letter, cx + s * 0.24, cy + s * 0.22, Math.max(5, s * 0.15));
}

/** A native brave: a figure in the tribe's colour with a feather, A (armed) and M (mounted) beside it. */
export function placeholderBrave(ctx: Ctx, tribe: TribeId, armed: boolean, mounted: boolean, cx: number, cy: number, s: number): void {
  shape(
    ctx,
    (c) => {
      person(c);
      c.moveTo(0.04, -0.36);
      c.lineTo(0.1, -0.5);
      c.lineTo(0.14, -0.34);
      c.closePath();
    },
    cx,
    cy,
    s * 0.9,
    TRIBES[tribe].color,
  );
  const letter = armed && mounted ? 'AM' : armed ? 'A' : mounted ? 'M' : '';
  if (letter) label(ctx, letter, cx + s * 0.24, cy + s * 0.22, Math.max(5, s * 0.15));
}

/** A pennant in a colour (unit icons of ships, soldiers and artillery). */
export function placeholderPennant(ctx: Ctx, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + size * 0.1, y + size * 0.15, size * 0.7, size * 0.5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.stroke();
  ctx.restore();
}

// ---- Icons ----

function initials(name: string): string {
  const words = name.replace(/['’]s\b/g, '').split(/[\s-]+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2);
}

/** A rounded tile with a label: goods, buildings. */
function plate(ctx: Ctx, text: string, fill: string, size: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(size * 0.08, size * 0.08, size * 0.84, size * 0.84, size * 0.14);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(size * 0.34)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 0.5);
  ctx.restore();
}

/** A colour from a string, for goods (stable, mid-dark so white text reads). */
function hashColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 38%, 38%)`;
}

/** An icon (size×size at the origin) drawn as a placeholder. */
export function placeholderIcon(ctx: Ctx, icon: IconRequest, size: number): void {
  switch (icon.kind) {
    case 'unit':
      placeholderUnit(ctx, icon.type, icon.role, icon.color, size / 2, size / 2, size);
      return;
    case 'product':
      plate(ctx, initials(PRODUCT_NAMES[icon.product]), hashColor(icon.product), size);
      return;
    case 'building': {
      const levels = BUILDINGS[icon.building].levels;
      const name = levels[Math.min(levels.length, Math.max(1, icon.level)) - 1].name;
      shape(ctx, house, size / 2, size / 2, size, '#7d8790');
      label(ctx, initials(name), size / 2, size * 0.6, size * 0.2);
      return;
    }
    case 'father': {
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = CATEGORY_COLORS[icon.category];
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.strokeStyle = PLACEHOLDER_INK;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.round(size * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fatherInitials(icon.id), size / 2, size / 2 + 0.5);
      ctx.restore();
      return;
    }
    case 'tile':
      ctx.fillStyle = PLACEHOLDER_TERRAIN[icon.tile.t];
      ctx.fillRect(0, 0, size, size);
      if (icon.tile.f && TERRAIN[icon.tile.t].forest) placeholderRelief(ctx, 'forest', 0, 0, size);
      else if (icon.tile.t === 'hills' || icon.tile.t === 'mountains') placeholderRelief(ctx, icon.tile.t, 0, 0, size);
      ctx.lineWidth = Math.max(1.1, size * 0.035);
      ctx.strokeStyle = PLACEHOLDER_INK;
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
      return;
  }
}

/** A full-frame backdrop: a flat panel with a horizon line. */
export function placeholderBackdrop(ctx: Ctx, width: number, height: number, panel: string, ink: string): void {
  ctx.save();
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = Math.max(1, height * 0.004);
  ctx.beginPath();
  ctx.moveTo(0, height * 0.62);
  ctx.lineTo(width, height * 0.62);
  ctx.stroke();
  ctx.restore();
}

// ---- What the placeholders cover (read by the missing-ids check) ----

/** Categories of sprites the missing-ids check reports on (missing.ts). */
export type SpriteCategory =
  | 'terrain'
  | 'relief'
  | 'bonus'
  | 'rumour'
  | 'roads'
  | 'coast'
  | 'transitions'
  | 'colonies'
  | 'defences'
  | 'settlements'
  | 'units'
  | 'braves'
  | 'buildings'
  | 'goods'
  | 'fathers'
  | 'overlays'
  | 'backdrops';

/**
 * The categories `fallback: 'placeholder'` draws a placeholder for. Coast bands and terrain transitions are extras
 * over the ground and have none: without them the ground's flat colours meet at the tile edge.
 */
export const PLACEHOLDER_CATEGORIES: readonly SpriteCategory[] = [
  'terrain',
  'relief',
  'bonus',
  'rumour',
  'roads',
  'colonies',
  'defences',
  'settlements',
  'units',
  'braves',
  'buildings',
  'goods',
  'fathers',
  'overlays',
  'backdrops',
];

/**
 * Whether a placeholder exists for one needed sprite (the keys missing.ts gives: a terrain id or `under-land`,
 * `forest:<terrain>`/`hills`/`mountains`, a stockade level, a tribe id (`<tribe>` or `<tribe>:capital`),
 * `<unitType>:<role>`, a building `<kind>:<level>`, a product id, a father id).
 */
export function placeholderCovers(category: SpriteCategory, key: string): boolean {
  if (!PLACEHOLDER_CATEGORIES.includes(category)) return false;
  const [a, b] = key.split(':');
  switch (category) {
    case 'terrain':
      return key === 'under-land' ? !!PLACEHOLDER_TERRAIN.ocean : !!PLACEHOLDER_TERRAIN[key as TerrainId];
    case 'relief':
      return a === 'forest' ? !!PLACEHOLDER_TERRAIN[b as TerrainId] && !!PLACEHOLDER_RELIEF.forest : a in PLACEHOLDER_RELIEF;
    case 'defences':
      return !!PLACEHOLDER_WALLS[Number(key)];
    case 'settlements':
      return !!TRIBES[a as TribeId]?.color;
    case 'units': {
      const def = UNIT_TYPES[a as UnitTypeId];
      return !!def && !!PLACEHOLDER_UNITS[def.kind] && (b ?? 'none') in PLACEHOLDER_ROLES;
    }
    case 'braves':
      return true;
    case 'buildings':
      return !!BUILDINGS[a as BuildingKind]?.levels[Number(b) - 1];
    case 'goods':
      return !!PRODUCT_NAMES[key as ProductId];
    case 'fathers':
      return !!FATHERS[key as FatherId] && !!CATEGORY_COLORS[FATHERS[key as FatherId].category];
    default:
      // bonus, rumour, roads, colonies, overlays, backdrops: one generic shape each.
      return true;
  }
}
