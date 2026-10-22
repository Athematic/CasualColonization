// Ink handling: find the near-black ligne claire outline in a master, measure
// its width, and thicken it before downscaling so it survives at small sizes.

import { INK, SRGB_TO_LINEAR, hexToOklab, hexToRgb, linearToOklab, oklabDist } from './color.mjs';

export const INK_LAB = hexToOklab(INK);
export const INK_LIN = hexToRgb(INK).map((v) => SRGB_TO_LINEAR[v]);

/** OKLab of a premultiplied pixel (unpremultiplies first). */
export function pixelLab(d, i) {
  const a = d[i + 3];
  if (a <= 0) return [0, 0, 0];
  return linearToOklab(d[i] / a, d[i + 1] / a, d[i + 2] / a);
}

/** True when a colour (OKLab) counts as ink. */
export function isInkLab(lab, tol = 0.12) {
  if (oklabDist(lab, INK_LAB) < tol) return true;
  // Anything darker than the ink itself (pure black) with little colour is ink too.
  return lab[0] < INK_LAB[0] && Math.hypot(lab[1], lab[2]) < 0.06;
}

/** Uint8 mask of ink pixels (alpha above `minAlpha` and colour near ink). */
export function inkMask(img, { tol = 0.12, minAlpha = 0.25 } = {}) {
  const m = new Uint8Array(img.w * img.h);
  const d = img.data;
  for (let p = 0; p < img.w * img.h; p++) {
    const i = p * 4;
    if (d[i + 3] >= minAlpha && isInkLab(pixelLab(d, i), tol)) m[p] = 1;
  }
  return m;
}

/**
 * Typical ink line width in pixels: 2 x area / perimeter of the ink mask
 * (for a long stroke of width w, area ~ L*w and perimeter ~ 2L).
 */
export function inkLineWidth(mask, w, h) {
  let area = 0, edge = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      area++;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
        !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) edge++;
    }
  }
  return edge ? (2 * area) / edge : 0;
}

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Euclidean distance from every pixel to the nearest set pixel of `mask`. */
export function distanceTo(mask, w, h) {
  const INF = 1e20;
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]);
  }
  return g;
}

/**
 * Paint ink over every pixel within `r` master pixels of existing ink.
 * mode 'both' lets the outer outline grow outwards too (thin props such as a
 * musket get bolder); 'inside' only recolours pixels that are already opaque.
 */
export function thickenInk(img, dist, r, mode = 'both') {
  if (r <= 0) return img;
  const out = img.clone();
  const d = out.data;
  for (let p = 0; p < img.w * img.h; p++) {
    let c = r + 0.5 - dist[p];
    if (c <= 0) continue;
    if (c > 1) c = 1;
    const i = p * 4;
    if (mode === 'inside') {
      const a = d[i + 3];
      if (a <= 0) continue;
      for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - c) + INK_LIN[k] * a * c;
    } else {
      for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - c) + INK_LIN[k] * c;
      d[i + 3] = d[i + 3] * (1 - c) + c;
    }
  }
  return out;
}

/**
 * How far to grow the ink (in master pixels) so a line of `srcWidth` master
 * pixels is at least `minPx` output pixels wide at `pxPerSrc` output pixels
 * per master pixel. Capped at `maxPx` output pixels of growth per side.
 */
export function growRadius(srcWidth, pxPerSrc, minPx, maxPx = 0.5) {
  const want = minPx / pxPerSrc; // wanted width in master pixels
  const grow = (want - srcWidth) / 2;
  return Math.max(0, Math.min(grow, maxPx / pxPerSrc));
}
