// Pixel-grid redraws -> exact N x N sprites.
//
// tools/image-gen/Edit-Images.ps1 -Mode pixel asks the image model to draw a sprite as true pixel
// art on an exact N x N grid, each cell a flat square of (image size / N) px. The model cannot
// output a 32 px image, so the grid comes back enlarged to about 1024 px. This module reads it
// back: it finds the grid phase, takes the dominant colour of each cell (the mode, not the mean,
// so a stray edge or noise does not muddy it), decides alpha by majority, and measures how
// uniform every cell really is. That "grid fidelity" tells a clean generation from one whose
// blocks are smeared, anti-aliased or drawn on a different grid, so bad takes can be redone.

import { hexToRgb, linearToOklab, SRGB_TO_LINEAR } from './color.mjs';
import { coreBBox, LAYOUTS } from './normalise.mjs';

export const GRID_DEFAULTS = {
  inset: 0.2, // ignore this share of the cell on every side (soft block edges)
  colorTol: 40, // RGB distance that still counts as "the same colour" inside a cell
  alphaCut: 128, // alpha >= this is opaque
  badCell: 0.8, // a content cell whose agreeing share is below this is "bad"
  minFidelity: 0.9, // flag the image when the mean fidelity of the content cells is below this
  maxBadShare: 0.1, // ...or when more than this share of the content cells is bad
  snapTol: 0.1, // OKLab distance (palette metric) within which a cell snaps to the palette colour
  phase: true, // search the grid phase (offset), otherwise assume the grid starts at 0,0
  detect: true, // also estimate the cell count the image was really drawn with
};

/**
 * Edge-strength profiles along x and y: prof.x[i] is the colour change between columns i-1 and i,
 * summed over all rows (premultiplied RGB plus alpha, so the background counts as a colour).
 */
export function edgeProfiles(rgba, w, h) {
  const px = new Float64Array(w + 1), py = new Float64Array(h + 1);
  const v = (i) => {
    const a = rgba[i + 3];
    return [rgba[i] * a / 255, rgba[i + 1] * a / 255, rgba[i + 2] * a / 255, a];
  };
  const diff = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3]);
  for (let y = 0; y < h; y++) {
    let prev = v(y * w * 4);
    for (let x = 1; x < w; x++) {
      const cur = v((y * w + x) * 4);
      px[x] += diff(cur, prev);
      if (y > 0) py[y] += diff(cur, v(((y - 1) * w + x) * 4));
      prev = cur;
    }
    if (y > 0) py[y] += diff(v(y * w * 4), v((y - 1) * w * 4));
  }
  return { x: px, y: py };
}

/**
 * Share of the edge energy that lies within +-1 px of the lines of an n-cell grid with the given
 * offset, and that offset. With `search`, offsets from -cell/2 to +cell/2 are tried in half-pixel steps.
 */
export function alignGrid(profile, len, n, search = true) {
  const cell = len / n;
  let total = 0;
  for (let i = 1; i < len; i++) total += profile[i];
  if (total <= 0) return { offset: 0, align: 1, cell };
  // s1: energy within +-1 px of the lines (robust to soft edges); s0: exactly on them (the tie-break)
  const score = (o, win) => {
    let s = 0;
    const used = new Set();
    for (let k = 0; k <= n; k++) {
      const c = Math.round(o + k * cell);
      for (let d = -win; d <= win; d++) {
        const p = c + d;
        if (p >= 1 && p < len && !used.has(p)) { used.add(p); s += profile[p]; }
      }
    }
    return s;
  };
  const cands = [{ o: 0, s1: score(0, 1), s0: score(0, 0) }];
  if (search) {
    // whole-pixel steps for whole-pixel cells (so x.5 offsets do not alias), else half pixels
    const step = Number.isInteger(cell) ? 1 : 0.5;
    for (let o = -Math.floor(cell / 2 / step) * step; o < cell / 2; o += step) {
      if (o !== 0) cands.push({ o, s1: score(o, 1), s0: score(o, 0) });
    }
  }
  const max1 = Math.max(...cands.map((c) => c.s1));
  let best = null;
  for (const c of cands) {
    if (c.s1 < max1 * (1 - 1e-6)) continue;
    if (!best || c.s0 > best.s0 + 1e-9 || (Math.abs(c.s0 - best.s0) <= 1e-9 && Math.abs(c.o) < Math.abs(best.o))) best = c;
  }
  return { offset: best.o, align: best.s1 / total, cell };
}

/**
 * The cell count the image looks like it was drawn with: the smallest n in [lo, hi] whose grid
 * lines (best phase) catch at least 92% of the best alignment found. Finer multiples of the true
 * grid align just as well, hence "smallest".
 */
export function estimateCells(profile, len, lo, hi) {
  const res = [];
  for (let n = lo; n <= hi; n++) res.push({ n, ...alignGrid(profile, len, n, true) });
  const max = Math.max(...res.map((r) => r.align));
  return res.find((r) => r.align >= 0.92 * max) ?? res[0];
}

const pack = (r, g, b) => (r << 16) | (g << 8) | b;
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const oklabOfRgb = (r, g, b) => linearToOklab(SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b]);

/**
 * Snap an enlarged pixel-grid image to an exact n x n sprite.
 * @param rgba   8-bit straight-alpha RGBA bytes, w x h
 * @param opts   GRID_DEFAULTS overrides, plus `palette` (a Palette from color.mjs, or null for none)
 * @returns {{ n, rgba: Buffer (n*n*4), fidelity, contentCells, badCells, bad: [[x,y,share]],
 *             offset: {x, y}, align: {x, y}, detected: {x, y} | null, flagged, reasons }}
 */
export function snapGrid(rgba, w, h, n, opts = {}) {
  const o = { ...GRID_DEFAULTS, ...opts };
  const prof = edgeProfiles(rgba, w, h);
  const gx = alignGrid(prof.x, w, n, o.phase), gy = alignGrid(prof.y, h, n, o.phase);
  const out = Buffer.alloc(n * n * 4);
  const shares = [];
  const bad = [];
  const tol2 = o.colorTol * o.colorTol;
  for (let cy = 0; cy < n; cy++) {
    const y0 = gy.offset + cy * gy.cell;
    const ya = Math.max(0, Math.floor(y0 + o.inset * gy.cell)), yb = Math.min(h, Math.ceil(y0 + (1 - o.inset) * gy.cell));
    for (let cx = 0; cx < n; cx++) {
      const x0 = gx.offset + cx * gx.cell;
      const xa = Math.max(0, Math.floor(x0 + o.inset * gx.cell)), xb = Math.min(w, Math.ceil(x0 + (1 - o.inset) * gx.cell));
      let total = 0, opaque = 0;
      const buckets = new Map();
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * w + x) * 4;
          total++;
          if (rgba[i + 3] < o.alphaCut) continue;
          opaque++;
          const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
          buckets.set(k, (buckets.get(k) ?? 0) + 1);
        }
      }
      const oi = (cy * n + cx) * 4;
      if (total === 0 || opaque * 2 <= total) {
        // transparent by majority (a cell entirely outside the image counts as transparent)
        if (opaque > 0) { shares.push((total - opaque) / total); if ((total - opaque) / total < o.badCell) bad.push([cx, cy, (total - opaque) / total]); }
        continue;
      }
      // mode bucket, then the mean of the pixels close to that bucket's mean
      let bk = -1, bc = -1;
      for (const [k, c] of buckets) if (c > bc || (c === bc && k < bk)) { bk = k; bc = c; }
      let sr = 0, sg = 0, sb = 0, sn = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * w + x) * 4;
          if (rgba[i + 3] < o.alphaCut) continue;
          const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
          if (k === bk) { sr += rgba[i]; sg += rgba[i + 1]; sb += rgba[i + 2]; sn++; }
        }
      }
      let mr = sr / sn, mg = sg / sn, mb = sb / sn;
      let agree = 0; sr = sg = sb = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * w + x) * 4;
          if (rgba[i + 3] < o.alphaCut) continue;
          const dr = rgba[i] - mr, dg = rgba[i + 1] - mg, db = rgba[i + 2] - mb;
          if (dr * dr + dg * dg + db * db <= tol2) { agree++; sr += rgba[i]; sg += rgba[i + 1]; sb += rgba[i + 2]; }
        }
      }
      mr = sr / agree; mg = sg / agree; mb = sb / agree;
      let rgb = [Math.round(mr), Math.round(mg), Math.round(mb)];
      if (o.palette) {
        const { index, dist } = o.palette.nearest(oklabOfRgb(...rgb));
        if (dist <= o.snapTol) rgb = hexToRgb(o.palette.hex[index]);
      }
      out[oi] = rgb[0]; out[oi + 1] = rgb[1]; out[oi + 2] = rgb[2]; out[oi + 3] = 255;
      const share = agree / total;
      shares.push(share);
      if (share < o.badCell) bad.push([cx, cy, Math.round(share * 1000) / 1000]);
    }
  }
  const contentCells = shares.length;
  const fidelity = contentCells ? shares.reduce((a, b) => a + b, 0) / contentCells : 1;
  let detected = null;
  if (o.detect) {
    const lo = Math.max(4, Math.floor(n / 2)), hi = n * 2;
    detected = { x: estimateCells(prof.x, w, lo, hi).n, y: estimateCells(prof.y, h, lo, hi).n };
  }
  const reasons = [];
  if (fidelity < o.minFidelity) reasons.push(`mean cell fidelity ${fidelity.toFixed(3)} < ${o.minFidelity}`);
  if (contentCells && bad.length / contentCells > o.maxBadShare) reasons.push(`${bad.length} of ${contentCells} cells are not uniform`);
  if (detected && (detected.x !== n || detected.y !== n) && reasons.length) reasons.push(`the image looks like a ${detected.x}x${detected.y} grid, not ${n}x${n}`);
  if (contentCells === 0) reasons.push('no opaque cells');
  return {
    n,
    rgba: out,
    fidelity: Math.round(fidelity * 10000) / 10000,
    contentCells,
    badCells: bad.length,
    bad,
    offset: { x: gx.offset, y: gy.offset },
    align: { x: Math.round(gx.align * 1000) / 1000, y: Math.round(gy.align * 1000) / 1000 },
    detected,
    flagged: reasons.length > 0,
    reasons,
  };
}

/**
 * Integer translation of an n x n sprite so it sits where the pipeline's layout puts sprites of its
 * category (feet / wheels / waterline on the baseline, centred on the core). No resampling, so the
 * pixel grid is untouched. Shifts are clamped so no opaque cell leaves the canvas.
 */
export function placeGrid(rgba, n, layoutName) {
  const L = LAYOUTS[layoutName];
  if (!L || L.fit === 'none') return { rgba, dx: 0, dy: 0 };
  const img = { w: n, h: n, data: new Float32Array(n * n * 4) };
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let i = 0; i < n * n; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    img.data[i * 4 + 3] = 1;
    const x = i % n, y = (i / n) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { rgba, dx: 0, dy: 0 };
  const core = coreBBox(img, 0.5, 0.18) ?? { x0, x1: x1 + 1 };
  const cx = L.anchor === 'center' ? (x0 + x1 + 1) / 2 : (core.x0 + core.x1) / 2;
  let dx = Math.round(n / 2 - cx);
  let dy = L.anchor === 'center' ? Math.round(n / 2 - (y0 + y1 + 1) / 2) : Math.round(L.base * n) - (y1 + 1);
  dx = Math.max(-x0, Math.min(n - 1 - x1, dx));
  dy = Math.max(-y0, Math.min(n - 1 - y1, dy));
  if (!dx && !dy) return { rgba, dx, dy };
  const out = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= n || sy >= n) continue;
      rgba.copy(out, (y * n + x) * 4, (sy * n + sx) * 4, (sy * n + sx) * 4 + 4);
    }
  }
  return { rgba: out, dx, dy };
}

/** Nearest-neighbour integer upscale of an n x n RGBA sprite. */
export function upscale(rgba, n, k) {
  const m = n * k;
  const out = Buffer.alloc(m * m * 4);
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      const s = (((y / k) | 0) * n + ((x / k) | 0)) * 4;
      rgba.copy(out, (y * m + x) * 4, s, s + 4);
    }
  }
  return out;
}

/** Distinct opaque colours of a sprite, as hex, most used first. */
export function spriteColors(rgba) {
  const counts = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const k = pack(rgba[i], rgba[i + 1], rgba[i + 2]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([k]) => hex((k >> 16) & 255, (k >> 8) & 255, k & 255));
}

/** "pixel-32" -> 32 (the folder names Edit-Images.ps1 writes), else null. */
export function gridSizeFromDir(dir) {
  const m = /pixel-(\d+)[\\/]*$/.exec(String(dir));
  return m ? Number(m[1]) : null;
}

