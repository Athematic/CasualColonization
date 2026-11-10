/**
 * The fixed geometry of the terrain transition pieces (docs/SPRITE_PROMPTS.md section 4.8a), in
 * unit tile coordinates (0..1, y down), pure maths with no canvas so tests can use it too.
 *
 * A bleeding terrain grows a band of depth BAND (20%) along the sides it touches, as if its tile
 * were offset by that depth with rounded convex corners. Hence:
 *  - edge: the band along the top. Its inner boundary is exactly BAND deep from each end up to 30%
 *    along the edge, and wanders within BAND +- WAVE only in the middle 40%; mirror-symmetric,
 *    with zero slope where the wave starts and ends.
 *  - inner: the top band plus the left band (same profile along each), and a quarter-round fillet of
 *    radius FILLET in the concave corner, tangent to both boundaries.
 *  - outer: a quarter disc of radius exactly BAND centred on the corner, so it meets the edge
 *    bands of the neighbouring tiles at BAND depth, tangent to their straight stretches.
 * Pieces carry no outline: the band is a flat colour and its boundary is the colour change.
 */
export const BAND = 0.2;
export const FILLET = 0.1;
export const WAVE = 0.03;
/** Where the wavy stretch of the boundary starts, as a share of the edge (it ends at 1 - this). */
export const STRAIGHT = 0.3;

export type PieceKind = 'edge' | 'inner' | 'outer';

/** Depth of the band's inner boundary at position t (0..1) along the edge. */
export function bandDepth(t: number): number {
  if (t <= STRAIGHT || t >= 1 - STRAIGHT) return BAND;
  const u = (t - STRAIGHT) / (1 - 2 * STRAIGHT);
  return BAND + WAVE * Math.sin(Math.PI * u) ** 2 * Math.cos(2 * Math.PI * u);
}

/** Whether the unturned piece covers the point (u, v) of the tile. */
export function covers(piece: PieceKind, u: number, v: number): boolean {
  if (piece === 'outer') return u * u + v * v < BAND * BAND;
  if (v < bandDepth(u)) return true;
  if (piece === 'edge') return false;
  if (u < bandDepth(v)) return true;
  const c = BAND + FILLET;
  const inCorner = u >= BAND && v >= BAND && u <= c && v <= c;
  return inCorner && (u - c) ** 2 + (v - c) ** 2 >= FILLET * FILLET;
}

/** Whether the piece turned `turns` quarter turns clockwise covers the point (x, y) of the tile. */
export function coversTurned(piece: PieceKind, turns: number, x: number, y: number): boolean {
  let u = x;
  let v = y;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [u, v] = [v, 1 - u];
  return covers(piece, u, v);
}
