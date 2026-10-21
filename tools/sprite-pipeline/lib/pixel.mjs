// Pixel sizes (16, 24, 32 px by default): a real pixel-art reduction.
//
//  a. render the master at `factor` x the target size (default 4x) and flatten
//     shading with a median filter (ink is kept apart so lines are not eroded);
//  b. area-average each factor x factor block down to one target pixel,
//     measuring alpha coverage and ink coverage separately;
//  c. quantise colour to the palette (nearest in OKLab), optional ordered dither;
//  d. binarise alpha with a threshold: no semi-transparent pixels;
//  e. remove orphan pixels;
//  f. redraw a crisp 1-px ink outline outside the silhouette (4- or
//     8-neighbourhood), keeping interior ink lines where the source had them.
//
// Output pixels are exact palette colours with alpha 0 or 255.

import { BAYER4, INK, SRGB_TO_LINEAR, hexToRgb, linearToByte, linearToOklab, oklabDist, oklabToLinear, rgbToHex } from './color.mjs';
import { growRadius, isInkLab, thickenInk } from './ink.mjs';
import { resample } from './image.mjs';
import { transformFor } from './normalise.mjs';

const TRANSPARENT = -1;
const pack = ([r, g, b]) => (r << 16) | (g << 8) | b;
export const INK_PACKED = pack(hexToRgb(INK));

/** Median of the values in `arr` (sorts in place). */
function median(arr, n) {
  const a = arr.subarray(0, n).sort();
  return n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

/**
 * Step a: render at `size` px and analyse every pixel.
 * Returns per-pixel alpha, ink flag and (median-flattened) OKLab colour.
 */
export function analyseHiRes(master, ink, place, size, targetPx, opts) {
  let src = master;
  if (opts.inkMinPx > 0 && ink && ink.width > 0) {
    // Thicken ink so a line is at least inkMinPx *target* pixels wide.
    const r = growRadius(ink.width, place.scale * targetPx, opts.inkMinPx, opts.inkMaxGrowPx);
    if (r > 0.25) src = thickenInk(master, ink.dist, r, opts.inkGrow);
  }
  const hi = resample(src, size, size, { ...transformFor(place, size), kernel: 'box' });
  const n = size * size;
  const alpha = new Float32Array(n);
  const isInk = new Uint8Array(n);
  let lab = new Float32Array(n * 3);
  const d = hi.data;
  for (let p = 0; p < n; p++) {
    const a = d[p * 4 + 3];
    alpha[p] = a;
    if (a <= 0.02) continue;
    const c = linearToOklab(d[p * 4] / a, d[p * 4 + 1] / a, d[p * 4 + 2] / a);
    lab[p * 3] = c[0]; lab[p * 3 + 1] = c[1]; lab[p * 3 + 2] = c[2];
    if (isInkLab(c, opts.inkTol)) isInk[p] = 1;
  }
  // Median smoothing of non-ink colour among non-ink neighbours.
  const buf = [new Float32Array(9), new Float32Array(9), new Float32Array(9)];
  for (let pass = 0; pass < opts.simplify; pass++) {
    const next = new Float32Array(lab);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = y * size + x;
        if (alpha[p] < 0.5 || isInk[p]) continue;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            const q = yy * size + xx;
            if (alpha[q] < 0.5 || isInk[q]) continue;
            for (let c = 0; c < 3; c++) buf[c][k] = lab[q * 3 + c];
            k++;
          }
        }
        if (k >= 3) for (let c = 0; c < 3; c++) next[p * 3 + c] = median(buf[c], k);
      }
    }
    lab = next;
  }
  return { size, alpha, isInk, lab };
}

/**
 * Per-sprite extra palette colours: large colour areas that sit far from every
 * palette entry (a weaver's magenta coat, an olive gunsmith). Greedy and
 * histogram-based, so deterministic. Returns hex strings.
 */
export function findExtraColors(hi, palette, { maxExtras = 3, tol = 0.085, minShare = 0.04, radius = 0.05 } = {}) {
  if (maxExtras <= 0) return [];
  const { alpha, isInk, lab } = hi;
  const BIN = 0.02;
  const bins = new Map();
  let total = 0;
  for (let p = 0; p < alpha.length; p++) {
    if (alpha[p] < 0.5 || isInk[p]) continue;
    total++;
    const c = [lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]];
    if (palette.nearest(c).dist <= tol) continue;
    const key = c.map((v) => Math.round(v / BIN)).join(',');
    let b = bins.get(key);
    if (!b) bins.set(key, (b = { key, n: 0, s: [0, 0, 0] }));
    b.n++; b.s[0] += c[0]; b.s[1] += c[1]; b.s[2] += c[2];
  }
  const list = [...bins.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const b of list) b.c = b.s.map((v) => v / b.n);
  const extras = [];
  let pal = palette;
  while (extras.length < maxExtras) {
    let best = null, bestN = 0;
    for (const b of list) {
      if (b.used) continue;
      let n = 0;
      for (const o of list) if (!o.used && oklabDist(b.c, o.c) <= radius) n += o.n;
      if (n > bestN) { bestN = n; best = b; }
    }
    if (!best || bestN < minShare * total) break;
    const s = [0, 0, 0];
    let n = 0;
    for (const o of list) {
      if (o.used || oklabDist(best.c, o.c) > radius) continue;
      for (let c = 0; c < 3; c++) s[c] += o.s[c];
      n += o.n;
    }
    const mean = s.map((v) => v / n);
    const lin = oklabToLinear(...mean);
    const hex = rgbToHex(lin.map(linearToByte));
    extras.push(hex);
    pal = pal.with([hex]);
    // Everything the new colour now covers is no longer "far".
    for (const o of list) if (!o.used && pal.nearest(o.c).dist <= tol) o.used = true;
  }
  return extras;
}

/**
 * Steps b-f. Returns { size, px: Int32Array of packed 0xRRGGBB or -1 }.
 */
export function reduce(hi, targetPx, palette, opts) {
  const f = hi.size / targetPx;
  const T = targetPx, n = T * T;
  const cov = new Float32Array(n), inkCov = new Float32Array(n);
  const mean = new Float32Array(n * 3); // linear rgb of non-ink part
  const hasCol = new Uint8Array(n);
  const modeIdx = new Int32Array(n).fill(-1);
  const votes = new Float64Array(palette.size);
  for (let by = 0; by < T; by++) {
    for (let bx = 0; bx < T; bx++) {
      const t = by * T + bx;
      let sa = 0, si = 0, sc = 0;
      const lin = [0, 0, 0];
      votes.fill(0);
      for (let y = by * f; y < (by + 1) * f; y++) {
        for (let x = bx * f; x < (bx + 1) * f; x++) {
          const p = y * hi.size + x;
          const a = hi.alpha[p];
          sa += a;
          if (a <= 0.02) continue;
          if (hi.isInk[p]) { si += a; continue; }
          const c = [hi.lab[p * 3], hi.lab[p * 3 + 1], hi.lab[p * 3 + 2]];
          const l = oklabToLinear(c[0], c[1], c[2]);
          for (let k = 0; k < 3; k++) lin[k] += l[k] * a;
          sc += a;
          if (opts.reduce === 'mode') votes[palette.nearest(c).index] += a;
        }
      }
      cov[t] = sa / (f * f);
      inkCov[t] = si / (f * f);
      if (sc > 0) {
        hasCol[t] = 1;
        for (let k = 0; k < 3; k++) mean[t * 3 + k] = lin[k] / sc;
        if (opts.reduce === 'mode') {
          let bi = 0;
          for (let i = 1; i < votes.length; i++) if (votes[i] > votes[bi]) bi = i;
          modeIdx[t] = bi;
        }
      }
    }
  }

  // d. binarise alpha. A pixel that is mostly ink counts even below the alpha
  // threshold, so thin props (musket, staff, sabre) survive as 1-px lines.
  const op = new Uint8Array(n);
  // Thin features (a staff, a crossbar, a sabre) cover well under half a
  // pixel. A pixel that is a coverage ridge (both neighbours on one axis much
  // lower) is kept down to `thinLine` coverage.
  const cv = (x, y) => (x < 0 || y < 0 || x >= T || y >= T ? 0 : cov[y * T + x]);
  for (let t = 0; t < n; t++) {
    const c = cov[t];
    let on = c >= opts.alphaThreshold || inkCov[t] >= opts.inkLine;
    if (!on && opts.thinLine > 0 && c >= opts.thinLine) {
      const x = t % T, y = (t / T) | 0;
      on = ridge(c, cv(x - 2, y), cv(x - 1, y), cv(x + 1, y), cv(x + 2, y)) ||
        ridge(c, cv(x, y - 2), cv(x, y - 1), cv(x, y + 1), cv(x, y + 2));
    }
    op[t] = on ? 1 : 0;
  }

  // c. colour per opaque pixel.
  const px = new Int32Array(n).fill(TRANSPARENT);
  const isEdge = (t) => {
    const x = t % T, y = (t / T) | 0;
    return x === 0 || y === 0 || x === T - 1 || y === T - 1 || !op[t - 1] || !op[t + 1] || !op[t - T] || !op[t + T];
  };
  for (let t = 0; t < n; t++) {
    if (!op[t]) continue;
    const inkFrac = inkCov[t] / Math.max(1e-6, cov[t]);
    const edge = isEdge(t);
    const keep = edge ? opts.inkKeep : opts.interiorInk ? opts.inkKeepInterior ?? opts.inkKeep : Infinity;
    const ink = !hasCol[t] || inkFrac >= keep;
    if (ink) { px[t] = INK_PACKED; continue; }
    if (opts.paletteSnap === false) {
      px[t] = pack([0, 1, 2].map((k) => linearToByte(mean[t * 3 + k])));
      continue;
    }
    if (opts.reduce === 'mode' && modeIdx[t] >= 0) { px[t] = pack(hexToRgb(palette.hex[modeIdx[t]])); continue; }
    const lab = linearToOklab(mean[t * 3], mean[t * 3 + 1], mean[t * 3 + 2]);
    let idx;
    if (opts.dither) {
      const { i1, d1, i2, d2 } = palette.nearestTwo(lab);
      const ratio = d1 / Math.max(1e-9, d1 + d2); // 0..0.5
      const th = (BAYER4[(t / T | 0) % 4][(t % T) % 4] + 0.5) / 16;
      idx = d1 > 0.02 && ratio * opts.ditherStrength > th ? i2 : i1;
    } else idx = palette.nearest(lab).index;
    px[t] = pack(hexToRgb(palette.hex[idx]));
  }

  // e. orphan cleanup.
  if (opts.cleanup) cleanupOrphans(px, T);

  // f. outline.
  if (opts.outline !== 'none') addOutline(px, T, opts.outline === 8 || opts.outline === '8' ? 8 : 4, opts.thin ?? 'auto');
  return { size: T, px };
}

/**
 * Is a pixel of coverage c the crest of a thin line across this axis?
 * Either a 1-px ridge (both neighbours much lower), or the stronger half of a
 * line that straddles two pixels (the pair together covers about half a pixel,
 * and what lies beyond the pair is low). Ties go to the left / upper pixel.
 */
export function ridge(c, ll, l, r, rr) {
  const k = 0.6 * c;
  if (l < k && r < k) return true;
  if (r >= k && (c > r || c === r) && l < k && rr < 0.6 * r && c + r >= 0.45) return true;
  if (l >= k && c > l && r < k && ll < 0.6 * l && c + l >= 0.45) return true;
  return false;
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Orphan cleanup on a packed pixel grid (in place):
 *  - an opaque pixel with no opaque 8-neighbour is dropped;
 *  - a 1-px hole whose 4 neighbours are all opaque is filled;
 *  - a non-ink pixel with no same-coloured 8-neighbour, fully surrounded,
 *    takes the most common colour of its 4 neighbours.
 * Single ink pixels are kept: they are eyes, buttons and line ends.
 */
export function cleanupOrphans(px, T) {
  const src = Int32Array.from(px);
  const get = (x, y) => (x < 0 || y < 0 || x >= T || y >= T ? TRANSPARENT : src[y * T + x]);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const t = y * T + x, v = src[t];
      if (v === TRANSPARENT) {
        if (N4.every(([dx, dy]) => get(x + dx, y + dy) !== TRANSPARENT)) px[t] = majority(N4.map(([dx, dy]) => get(x + dx, y + dy)));
        continue;
      }
      if (N8.every(([dx, dy]) => get(x + dx, y + dy) === TRANSPARENT)) { px[t] = TRANSPARENT; continue; }
      if (v === INK_PACKED) continue;
      const n4 = N4.map(([dx, dy]) => get(x + dx, y + dy));
      if (n4.includes(TRANSPARENT)) continue;
      if (N8.some(([dx, dy]) => get(x + dx, y + dy) === v)) continue;
      px[t] = majority(n4);
    }
  }
  return px;
}

/** Most common value; ties go to the non-ink value first seen. */
function majority(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0], bc = -1;
  for (const [v, c] of counts) {
    if (c > bc || (c === bc && best === INK_PACKED && v !== INK_PACKED)) { best = v; bc = c; }
  }
  return best;
}

/**
 * Draw a 1-px ink outline outside the silhouette (in place). A transparent
 * pixel becomes ink when one of its neighbours (4- or 8-neighbourhood) is an
 * opaque non-ink pixel. Ink pixels are not outlined again, so an edge that is
 * already inked is not doubled.
 *
 * thin: how 1-px-wide features (a staff, a musket, a crossbar: an opaque
 * pixel with transparent pixels on both sides along one axis) are treated:
 *  'auto'    like 'keep' for mid and dark colours (wood, metal), but light
 *            ones (skin, cream, white: legs in stockings, a pale sleeve) are
 *            outlined, since a pale 1-px line vanishes against paper or grass;
 *  'keep'    keep their colour and do not outline them (a crisp 1-px prop);
 *  'ink'     turn them into ink, not outlined (a dark 1-px prop);
 *  'outline' outline them like the body (3 px wide with the outline).
 */
export function addOutline(px, T, conn = 4, thin = 'auto', lightL = 0.78) {
  const nb = conn === 8 ? N8 : N4;
  const src = Int32Array.from(px);
  const get = (x, y) => (x < 0 || y < 0 || x >= T || y >= T ? TRANSPARENT : src[y * T + x]);
  const isThin = new Uint8Array(T * T);
  if (thin !== 'outline') {
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const v = src[y * T + x];
        if (v === TRANSPARENT || v === INK_PACKED) continue;
        if (thin === 'auto' && lightness(v) >= lightL) continue;
        if ((get(x - 1, y) === TRANSPARENT && get(x + 1, y) === TRANSPARENT) ||
          (get(x, y - 1) === TRANSPARENT && get(x, y + 1) === TRANSPARENT)) {
          isThin[y * T + x] = 1;
          if (thin === 'ink') px[y * T + x] = INK_PACKED;
        }
      }
    }
  }
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const t = y * T + x;
      if (src[t] !== TRANSPARENT) continue;
      for (const [dx, dy] of nb) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= T || yy >= T) continue;
        const q = yy * T + xx, v = src[q];
        if (v !== TRANSPARENT && v !== INK_PACKED && !isThin[q]) { px[t] = INK_PACKED; break; }
      }
    }
  }
  return px;
}

/** OKLab lightness of a packed colour. */
function lightness(v) {
  return linearToOklab(SRGB_TO_LINEAR[(v >> 16) & 255], SRGB_TO_LINEAR[(v >> 8) & 255], SRGB_TO_LINEAR[v & 255])[0];
}

/** Packed grid -> 8-bit RGBA bytes. */
export function gridToRgba8(px) {
  const out = Buffer.alloc(px.length * 4);
  for (let t = 0; t < px.length; t++) {
    const v = px[t];
    if (v === TRANSPARENT) continue;
    out[t * 4] = (v >> 16) & 255;
    out[t * 4 + 1] = (v >> 8) & 255;
    out[t * 4 + 2] = v & 255;
    out[t * 4 + 3] = 255;
  }
  return out;
}

/** Full pixel render of one size: returns { size, px }. */
export function renderPixel(master, ink, place, targetPx, palette, opts) {
  const hi = analyseHiRes(master, ink, place, targetPx * opts.factor, targetPx, opts);
  return reduce(hi, targetPx, palette, opts);
}

export { TRANSPARENT };
