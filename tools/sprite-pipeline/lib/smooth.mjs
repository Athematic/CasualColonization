// Smooth sizes (48 px and up): one high-quality downscale from the master in
// linear light with premultiplied alpha, optional ink thickening first, and a
// light unsharp mask afterwards.

import { FImage, resample } from './image.mjs';
import { linearToSrgb } from './color.mjs';
import { growRadius, thickenInk } from './ink.mjs';
import { transformFor } from './normalise.mjs';

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Unsharp mask on a premultiplied linear image. Works on gamma-encoded,
 * premultiplied values (closer to perceived contrast); alpha is sharpened too
 * so edges stay crisp. `sigma` in output pixels, `amount` 0..1.
 */
export function unsharp(img, amount = 0.4, sigma = 0.6) {
  if (amount <= 0) return img;
  const { w, h } = img;
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  // gamma-premultiplied copy
  const g = new Float32Array(w * h * 4);
  const d = img.data;
  for (let p = 0; p < w * h; p++) {
    const a = d[p * 4 + 3];
    g[p * 4 + 3] = a;
    if (a > 0) for (let c = 0; c < 3; c++) g[p * 4 + c] = linearToSrgb(d[p * 4 + c] / a) * a;
  }
  const blurAxis = (src, horizontal) => {
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          let s = 0;
          for (let i = -r; i <= r; i++) {
            const xx = horizontal ? x + i : x, yy = horizontal ? y : y + i;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; // transparent outside
            s += src[(yy * w + xx) * 4 + c] * k[i + r];
          }
          out[(y * w + x) * 4 + c] = s;
        }
      }
    }
    return out;
  };
  const b = blurAxis(blurAxis(g, true), false);
  const out = new FImage(w, h);
  const o = out.data;
  for (let p = 0; p < w * h; p++) {
    let a = g[p * 4 + 3] + amount * (g[p * 4 + 3] - b[p * 4 + 3]);
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a < 1 / 512) continue;
    o[p * 4 + 3] = a;
    for (let c = 0; c < 3; c++) {
      let v = g[p * 4 + c] + amount * (g[p * 4 + c] - b[p * 4 + c]);
      v = v < 0 ? 0 : v > a ? a : v;
      o[p * 4 + c] = srgbToLinear(v / a) * a;
    }
  }
  return out;
}

/**
 * Render one smooth size.
 * @param master   cleaned master (FImage)
 * @param ink      { dist, width } from the ink analysis of the master
 * @param place    placement() result
 * @param n        output size in pixels
 */
export function renderSmooth(master, ink, place, n, opts) {
  const pxPerSrc = place.scale * n;
  let src = master;
  if (opts.inkMinPx > 0 && ink && ink.width > 0) {
    const r = growRadius(ink.width, pxPerSrc, opts.inkMinPx, opts.inkMaxGrowPx);
    if (r > 0.25) src = thickenInk(master, ink.dist, r, opts.inkGrow);
  }
  const img = resample(src, n, n, { ...transformFor(place, n), kernel: opts.kernel });
  return unsharp(img, opts.sharpen, opts.sharpenSigma);
}
