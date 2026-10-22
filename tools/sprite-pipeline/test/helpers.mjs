// Synthetic test images, so the tests do not depend on generated art.
import { FImage, encodePng, fromRgba8 } from '../lib/image.mjs';
import { hexToRgb } from '../lib/color.mjs';

/** RGBA8 canvas with a fill function (x, y) -> [r, g, b, a] | null. */
export function paint(w, h, fn) {
  const bytes = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      if (!c) continue;
      bytes.set(c, (y * w + x) * 4);
    }
  }
  return bytes;
}

const rgba = (hex, a = 255) => [...hexToRgb(hex), a];

/**
 * A little ligne claire figure on a 256 canvas: ink-outlined red body, skin
 * head, a thin ink staff sticking up, and a faint dark glow like the image
 * model leaves. `top`/`bottom` move the figure; `staff` adds the protrusion.
 */
export function figureRgba({ size = 256, top = 60, bottom = 220, left = 100, right = 150, staff = true, staffAbove = 30, glow = true } = {}) {
  const ink = rgba('#1b1a17'), red = rgba('#d23c2a'), skin = rgba('#f3c9a0');
  const headH = Math.round((bottom - top) * 0.2);
  const lw = 5;
  return paint(size, size, (x, y) => {
    // staff: 3 px wide, from `staffAbove` px above the head to the feet, right of the body
    if (staff && x >= right + 4 && x < right + 7 && y >= top - staffAbove && y < bottom) return ink;
    const inHead = x >= left + 12 && x < right - 12 && y >= top && y < top + headH;
    const inBody = x >= left && x < right && y >= top + headH && y < bottom;
    if (inHead || inBody) {
      const edge = inHead
        ? x < left + 12 + lw || x >= right - 12 - lw || y < top + lw
        : x < left + lw || x >= right - lw || y >= bottom - lw || (y < top + headH + lw && (x < left + 12 + lw || x >= right - 12 - lw));
      if (edge) return ink;
      return inHead ? skin : red;
    }
    if (glow) return [10, 8, 6, 12]; // the faint glow everywhere else
    return null;
  });
}

export function figureImage(opts) {
  const size = opts?.size ?? 256;
  return fromRgba8(size, size, figureRgba(opts));
}

export async function figurePng(opts) {
  const size = opts?.size ?? 256;
  return encodePng(size, size, figureRgba(opts));
}

export { FImage };
