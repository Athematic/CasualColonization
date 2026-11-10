/**
 * Terrain transitions ("tessellation"): where two land terrains meet, the higher-ranked terrain
 * bleeds a band onto its lower-ranked neighbour, with the same three quarter-turnable pieces the
 * coast bands use (edge, inner corner, outer corner). This file is the pure selection logic; the
 * drawing is in layers.ts. See docs/design/tessellated-tiles.md.
 */
import type { TerrainId } from '@cc/engine';
import { coastPieces } from './coast.js';

/** How a pack treats terrain borders: 'none' keeps today's hard flat-colour boundary. */
export type TransitionMode = 'none' | 'overlay';

/**
 * Terrains from the lowest (drawn under, receives bands) to the highest (bleeds onto the others).
 * Terrains not listed take no part. Water is never listed: coasts have their own bands.
 */
export const DEFAULT_TRANSITION_ORDER: readonly TerrainId[] = [
  'desert',
  'tundra',
  'savannah',
  'plains',
  'prairie',
  'grassland',
  'marsh',
  'swamp',
];

export interface TransitionPieces {
  edge: boolean;
  inner: boolean;
  outer: boolean;
}

export interface TransitionPiece {
  /** The neighbouring terrain whose art the piece is cut from. */
  terrain: TerrainId;
  piece: 'edge' | 'inner' | 'outer';
  /** Quarter turns clockwise from the unturned piece (north edge / north-west corner). */
  turns: number;
}

/**
 * The pieces a land tile of terrain `own` receives, from its eight neighbours (`nbr[i]` is the
 * terrain at DIRS[i], undefined for water or off the map). Lower-ranked neighbours bleed first, so
 * the higher ones overlap them; the result is in drawing order. A terrain without an `edge`
 * piece (`has` returns undefined or edge false) contributes nothing, and the tile keeps today's
 * hard boundary there.
 */
export function transitionPieces(
  order: readonly TerrainId[],
  own: TerrainId,
  nbr: readonly (TerrainId | undefined)[],
  has: (t: TerrainId) => TransitionPieces | undefined,
): TransitionPiece[] {
  const rank = order.indexOf(own);
  if (rank < 0) return [];
  const seen = new Set<TerrainId>();
  for (const t of nbr) if (t && t !== own && order.indexOf(t) > rank) seen.add(t);
  const out: TransitionPiece[] = [];
  for (const t of [...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    const p = has(t);
    if (!p?.edge) continue;
    for (const c of coastPieces(
      nbr.map((n) => n === t),
      p.inner,
    )) {
      if (c.piece === 'outer' && !p.outer) continue;
      out.push({ terrain: t, piece: c.piece, turns: c.turns });
    }
  }
  return out;
}
