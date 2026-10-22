// One sprite, end to end: prepare the master once, then render any size in
// either mode.

import { CORE_PALETTE, EXTRA_PALETTE, Palette } from './color.mjs';
import { cleanAlpha, encodePng, loadPng, savePng } from './image.mjs';
import { distanceTo, inkLineWidth, inkMask } from './ink.mjs';
import { classify, placement } from './normalise.mjs';
import { CATEGORY_PIXEL } from './config.mjs';
import { analyseHiRes, findExtraColors, gridToRgba8, reduce } from './pixel.mjs';
import { renderSmooth } from './smooth.mjs';

export function basePalette(name, chromaWeight = 1) {
  const o = { chromaWeight };
  if (name === 'core') return new Palette(CORE_PALETTE, o);
  if (name === 'extended') return new Palette([...CORE_PALETTE, ...EXTRA_PALETTE], o);
  if (Array.isArray(name)) return new Palette(name, o);
  throw new Error(`Unknown palette "${name}" (core | extended)`);
}

/** Load and analyse a master. Returns null for non-sprites (the style bible). */
export async function prepare(id, file, settings) {
  const { category, layout } = classify(id);
  if (!layout) return null;
  const master = cleanAlpha(await loadPng(file), settings.alphaLo, settings.alphaHi);
  const place = placement(master, layout, { coreFrac: settings.coreFrac });
  const mask = inkMask(master, { tol: settings.pixel.inkTol });
  const ink = { width: inkLineWidth(mask, master.w, master.h), dist: distanceTo(mask, master.w, master.h) };
  let transparent = false;
  for (let i = 3; i < master.data.length; i += 4) if (master.data[i] < 1) { transparent = true; break; }
  return { id, category, layout, master, place, ink, transparent, extras: new Map() };
}

/** Per-sprite palette for a pixel setting (extras are found once, at the largest pixel size). */
export function spritePalette(sp, pixelOpts, refSize) {
  const base = basePalette(pixelOpts.palette, pixelOpts.chromaWeight);
  if (!pixelOpts.extraColors) return { palette: base, extras: [] };
  const key = JSON.stringify([pixelOpts.palette, pixelOpts.extraColors, pixelOpts.extraTol, pixelOpts.extraMinShare, pixelOpts.chromaWeight, refSize, pixelOpts.simplify, pixelOpts.inkMinPx]);
  let extras = sp.extras.get(key);
  if (!extras) {
    const hi = analyseHiRes(sp.master, sp.ink, sp.place, refSize * pixelOpts.factor, refSize, pixelOpts);
    extras = findExtraColors(hi, base, { maxExtras: pixelOpts.extraColors, tol: pixelOpts.extraTol, minShare: pixelOpts.extraMinShare });
    sp.extras.set(key, extras);
  }
  return { palette: base.with(extras), extras };
}

/** Render a size as a PNG buffer. mode: 'smooth' | 'pixel'. */
export async function renderPng(sp, size, mode, settings, refSize = 32) {
  if (mode === 'smooth') {
    return savePng(renderSmooth(sp.master, sp.ink, sp.place, size, settings.smooth));
  }
  const pixel = { ...settings.pixel, ...(CATEGORY_PIXEL[sp.category] ?? {}) };
  const { palette } = spritePalette(sp, pixel, refSize);
  const hi = analyseHiRes(sp.master, sp.ink, sp.place, size * pixel.factor, size, pixel);
  const { px } = reduce(hi, size, palette, pixel);
  return encodePng(size, size, gridToRgba8(px));
}
