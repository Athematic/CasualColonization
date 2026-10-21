// A small float image type (premultiplied, linear-light RGBA) and a separable
// resampler. All resampling is done here in plain JS rather than in sharp, so
// that it happens in linear light with premultiplied alpha (no dark fringes)
// and gives byte-identical output everywhere. sharp is only used to decode and
// encode PNGs.

import sharp from 'sharp';
import { SRGB_TO_LINEAR, linearToByte } from './color.mjs';

/** RGBA image, Float32, premultiplied alpha, linear-light colour, 0..1. */
export class FImage {
  constructor(w, h, data) {
    this.w = w;
    this.h = h;
    this.data = data ?? new Float32Array(w * h * 4);
  }

  clone() {
    return new FImage(this.w, this.h, new Float32Array(this.data));
  }

  alpha(x, y) {
    return this.data[(y * this.w + x) * 4 + 3];
  }
}

/** Build an FImage from 8-bit straight-alpha sRGB RGBA bytes. */
export function fromRgba8(w, h, bytes) {
  const img = new FImage(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const a = bytes[i * 4 + 3] / 255;
    d[i * 4] = SRGB_TO_LINEAR[bytes[i * 4]] * a;
    d[i * 4 + 1] = SRGB_TO_LINEAR[bytes[i * 4 + 1]] * a;
    d[i * 4 + 2] = SRGB_TO_LINEAR[bytes[i * 4 + 2]] * a;
    d[i * 4 + 3] = a;
  }
  return img;
}

/** FImage -> 8-bit straight-alpha sRGB RGBA bytes. Fully transparent pixels get RGB 0. */
export function toRgba8(img) {
  const out = Buffer.alloc(img.w * img.h * 4);
  const d = img.data;
  for (let i = 0; i < img.w * img.h; i++) {
    const a = Math.min(1, Math.max(0, d[i * 4 + 3]));
    const ab = Math.round(a * 255);
    if (ab === 0) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = linearToByte(d[i * 4 + c] / a);
    out[i * 4 + 3] = ab;
  }
  return out;
}

export async function loadPng(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return fromRgba8(info.width, info.height, data);
}

/** Encode 8-bit RGBA bytes as a PNG. No metadata, fixed settings: same bytes in, same file out. */
export function encodePng(w, h, rgba8) {
  return sharp(rgba8, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

export function savePng(img) {
  return encodePng(img.w, img.h, toRgba8(img));
}

/**
 * Clean the alpha channel of a generated master. The image model leaves a
 * faint dark glow (alpha below about 30/255) around the subject; this ramps
 * alpha from 0 at `lo` to 1 at `hi`, removing the glow and keeping the edge.
 */
export function cleanAlpha(img, lo = 0.16, hi = 0.6) {
  const d = img.data;
  for (let i = 0; i < img.w * img.h; i++) {
    const a = d[i * 4 + 3];
    let na = (a - lo) / (hi - lo);
    na = na <= 0 ? 0 : na >= 1 ? 1 : na;
    if (a > 0) {
      const k = na / a;
      d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k;
    } else {
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0;
    }
    d[i * 4 + 3] = na;
  }
  return img;
}

// ---------------------------------------------------------------- resampling

const KERNELS = {
  // Mitchell-Netravali (B = C = 1/3): little ringing, good for downscaling sprites.
  mitchell: {
    support: 2,
    f(x) {
      x = Math.abs(x);
      const B = 1 / 3, C = 1 / 3;
      if (x < 1) return ((12 - 9 * B - 6 * C) * x ** 3 + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
      if (x < 2) return ((-B - 6 * C) * x ** 3 + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
      return 0;
    },
  },
  lanczos3: {
    support: 3,
    f(x) {
      if (x === 0) return 1;
      if (Math.abs(x) >= 3) return 0;
      const px = Math.PI * x;
      return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
    },
  },
};

/**
 * Weight table for one axis. Destination pixel i covers destination interval
 * [i, i+1]; source coordinate u = (dst - offset) / scale. Taps outside the
 * source are dropped after normalising, so edges fade to transparent.
 */
function weights(srcLen, dstLen, scale, offset, kernel) {
  const table = [];
  for (let i = 0; i < dstLen; i++) {
    const taps = [];
    if (kernel === 'box') {
      // Exact area coverage of the destination pixel's footprint.
      const u0 = (i - offset) / scale, u1 = (i + 1 - offset) / scale;
      const span = u1 - u0;
      for (let s = Math.floor(u0); s < Math.ceil(u1); s++) {
        const w = Math.min(u1, s + 1) - Math.max(u0, s);
        if (w > 0 && s >= 0 && s < srcLen) taps.push([s, w / span]);
      }
    } else {
      const k = KERNELS[kernel];
      if (!k) throw new Error(`Unknown kernel ${kernel}`);
      const fscale = Math.min(1, scale); // widen the kernel when shrinking
      const u = (i + 0.5 - offset) / scale - 0.5;
      const sup = k.support / fscale;
      let sum = 0;
      const all = [];
      for (let s = Math.ceil(u - sup); s <= Math.floor(u + sup); s++) {
        const w = k.f((s - u) * fscale);
        if (w === 0) continue;
        sum += w;
        all.push([s, w]);
      }
      for (const [s, w] of all) if (s >= 0 && s < srcLen) taps.push([s, w / sum]);
    }
    table.push(taps);
  }
  return table;
}

/**
 * Resample `src` into a new dstW x dstH image under the affine map
 * dst = src * scale + offset (per axis). Premultiplied linear-light, so
 * averaging is physically right and transparent pixels add no dark fringe.
 */
export function resample(src, dstW, dstH, { scale, offsetX, offsetY, kernel = 'mitchell' }) {
  const wx = weights(src.w, dstW, scale, offsetX, kernel);
  const wy = weights(src.h, dstH, scale, offsetY, kernel);
  // Only rows that some destination row reads need a horizontal pass.
  const tmp = new Float32Array(dstW * src.h * 4);
  const need = new Uint8Array(src.h);
  for (const taps of wy) for (const [s] of taps) need[s] = 1;
  const sd = src.data;
  for (let y = 0; y < src.h; y++) {
    if (!need[y]) continue;
    const row = y * src.w;
    for (let x = 0; x < dstW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [s, w] of wx[x]) {
        const j = (row + s) * 4;
        r += sd[j] * w; g += sd[j + 1] * w; b += sd[j + 2] * w; a += sd[j + 3] * w;
      }
      const o = (y * dstW + x) * 4;
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
    }
  }
  const out = new FImage(dstW, dstH);
  const od = out.data;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [s, w] of wy[y]) {
        const j = (s * dstW + x) * 4;
        r += tmp[j] * w; g += tmp[j + 1] * w; b += tmp[j + 2] * w; a += tmp[j + 3] * w;
      }
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      const o = (y * dstW + x) * 4;
      // Negative lobes can overshoot: keep colour inside 0..alpha.
      od[o] = r < 0 ? 0 : r > a ? a : r;
      od[o + 1] = g < 0 ? 0 : g > a ? a : g;
      od[o + 2] = b < 0 ? 0 : b > a ? a : b;
      od[o + 3] = a;
    }
  }
  return out;
}
