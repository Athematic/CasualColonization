/**
 * Which runtime size to draw. The sprite pipeline writes pixel-art sizes (16, 24, 32 by default:
 * flat colours, binary alpha, a 1-px outline) and smooth sizes (48 and up). Pixel art must not be
 * resampled by an odd factor, smooth art should only ever be shrunk a little.
 */

export interface SizeSet {
  pixelSizes: readonly number[];
  smoothSizes: readonly number[];
}

export interface SizeChoice {
  /** Runtime file size in px. */
  size: number;
  mode: 'pixel' | 'smooth';
  /** Size to draw at, in device pixels (may be smaller than asked, for a whole-number pixel scale). */
  draw: number;
  /** Whether to draw with image smoothing (high quality) or nearest-neighbour. */
  smoothing: boolean;
}

/**
 * Picks a size for something `device` device pixels wide (CSS size × devicePixelRatio).
 *
 * - Beyond the largest pixel size: the smallest smooth size at or above it (else the largest),
 *   drawn with high-quality smoothing.
 * - Within the pixel range: a pixel size at a whole-number scale when one fills at least 85% of the
 *   box (`fill: false` only, for sprites that may be drawn a little smaller), drawn nearest-neighbour.
 *   Otherwise the pixel size at or above it, shrunk to fit: nearest-neighbour for full-bleed tiles
 *   (`fill: true`, flat colour, no seams), smoothed for sprites.
 */
export function chooseSize(set: SizeSet, device: number, fill = false): SizeChoice | undefined {
  const pixel = [...set.pixelSizes].sort((a, b) => a - b);
  const smooth = [...set.smoothSizes].sort((a, b) => a - b);
  if (!pixel.length && !smooth.length) return undefined;
  const n = Math.max(1, device);
  const maxPixel = pixel.length ? pixel[pixel.length - 1] : 0;
  if (smooth.length && n > maxPixel) {
    const size = smooth.find((s) => s >= n) ?? smooth[smooth.length - 1];
    return { size, mode: 'smooth', draw: n, smoothing: true };
  }
  const exact = pixel.find((s) => s === n);
  if (exact) return { size: exact, mode: 'pixel', draw: n, smoothing: false };
  if (!fill) {
    let best: { size: number; draw: number } | undefined;
    for (const s of pixel) {
      const k = Math.floor(n / s);
      if (k >= 1 && (!best || s * k >= best.draw)) best = { size: s, draw: s * k };
    }
    if (best && best.draw >= n * 0.85) return { size: best.size, mode: 'pixel', draw: best.draw, smoothing: false };
  }
  const size = pixel.find((s) => s >= n) ?? maxPixel;
  return { size, mode: 'pixel', draw: n, smoothing: !fill };
}
