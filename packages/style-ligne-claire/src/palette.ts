import type { TerrainId } from '@cc/engine';

/**
 * Ligne claire: one even, unbroken ink line around every shape, flat bright colour
 * fields, no hatching and almost no shading.
 */
export const INK = '#1b1a17';
export const PAPER = '#f5eedc';
export const PAPER_WASH = 'rgba(245, 238, 220, 0.34)';
export const WHITE = '#fffdf6';
export const SKIN = '#f3c9a0';

export const LAND: Record<TerrainId, string> = {
  ocean: '#8ed0ec',
  highSeas: '#64b2df',
  plains: '#cfe39a',
  grassland: '#a6d878',
  prairie: '#ecdc8e',
  savannah: '#e4cd6e',
  marsh: '#aac592',
  swamp: '#8fb482',
  desert: '#f4e3ae',
  tundra: '#d5dcc8',
  arctic: '#f8fbff',
  hills: '#dcc28c',
  mountains: '#cdb89c',
};

export const WAVE = '#3a80b4';

export type TreeShape = 'round' | 'conifer' | 'palm' | 'bush';

export const FOREST: Partial<Record<TerrainId, { color: string; shape: TreeShape }>> = {
  plains: { color: '#58a548', shape: 'round' },
  grassland: { color: '#3d8a4c', shape: 'conifer' },
  prairie: { color: '#78b84e', shape: 'round' },
  savannah: { color: '#4fa042', shape: 'palm' },
  marsh: { color: '#5d9b5c', shape: 'round' },
  swamp: { color: '#3c7e50', shape: 'palm' },
  desert: { color: '#93ad5e', shape: 'bush' },
  tundra: { color: '#3b7a60', shape: 'conifer' },
};

export const ROAD = '#b9844c';
/** River water: the sea's colour, so a river opens into the sea at its mouth. */
export const RIVER = '#8ed0ec';
export const TRUNK = '#8a5a32';
export const ROOF = '#d23c2a';
export const WALL = '#fbf3df';
export const WOOD = '#a8743f';
export const STONE = '#b9b2a6';
export const SAIL = '#fffaf0';
export const HULL = '#9a5b2e';
export const HIGHLIGHT = '#ffd84a';

/** Lighten or darken a hex colour by a factor (-1..1). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
