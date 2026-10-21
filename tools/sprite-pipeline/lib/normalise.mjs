// Normalising: trim to the subject, then place it on a square canvas with a
// consistent scale, padding and baseline per category.
//
// The result is not an image but a transform from master pixels to "unit"
// canvas coordinates (0..1 on both axes). Every output size is then rendered
// straight from the master with that transform, so there is only ever one
// resampling step per output file.

/** Alpha bounding box {x0, y0, x1, y1} (x1/y1 exclusive) of pixels with alpha >= t, or null. */
export function alphaBBox(img, t = 0.5) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  const d = img.data;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (d[(y * img.w + x) * 4 + 3] >= t) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * The "core" box: like the bounding box, but ignoring thin protrusions such as
 * a raised musket, a sabre or a staff. A row (column) belongs to the core when
 * its opaque pixel count is at least `frac` of the widest row (tallest column).
 * Scaling by the core keeps a soldier with a shouldered musket the same body
 * size as a colonist with nothing over his head.
 */
export function coreBBox(img, t = 0.5, frac = 0.18) {
  const rows = new Float64Array(img.h), cols = new Float64Array(img.w);
  const d = img.data;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (d[(y * img.w + x) * 4 + 3] >= t) { rows[y]++; cols[x]++; }
    }
  }
  const span = (arr) => {
    let max = 0;
    for (const v of arr) if (v > max) max = v;
    if (max === 0) return null;
    let a = 0, b = arr.length - 1;
    while (arr[a] < frac * max) a++;
    while (arr[b] < frac * max) b--;
    return [a, b + 1];
  };
  const ys = span(rows), xs = span(cols);
  if (!ys || !xs) return null;
  return { x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1] };
}

/**
 * Layout rules per category, in unit canvas coordinates (0..1).
 *  fit:     which core dimension sets the scale: 'height', 'width' or 'contain' (both boxes).
 *  w, h:    target core width / height (the per-category scale reference).
 *  anchor:  'bottom' puts the bottom of the full bbox on `base`; 'center' centres the full bbox.
 *  base:    baseline (feet, wheels, waterline) for bottom-anchored layouts.
 *  margin:  minimum free border; the subject is shrunk if a protrusion would cross it.
 *           It is at least 1/16 so the 1-px pixel-art outline still fits at 16 px.
 * Horizontally, bottom-anchored subjects are centred on their core (so a
 * musket or sabre sticking out does not push the body off-centre).
 */
export const LAYOUTS = {
  standing: { fit: 'height', h: 0.8, anchor: 'bottom', base: 0.94, margin: 0.065 },
  mounted: { fit: 'contain', w: 0.86, h: 0.8, anchor: 'bottom', base: 0.94, margin: 0.065 },
  vehicle: { fit: 'contain', w: 0.86, h: 0.7, anchor: 'bottom', base: 0.92, margin: 0.065 },
  ship: { fit: 'contain', w: 0.88, h: 0.86, anchor: 'bottom', base: 0.93, margin: 0.065 },
  good: { fit: 'contain', w: 0.84, h: 0.84, anchor: 'center', margin: 0.065 },
  overlay: { fit: 'contain', w: 0.84, h: 0.84, anchor: 'center', margin: 0.065 },
  building: { fit: 'contain', w: 0.86, h: 0.84, anchor: 'bottom', base: 0.93, margin: 0.065 },
  decor: { fit: 'contain', w: 0.88, h: 0.84, anchor: 'bottom', base: 0.93, margin: 0.065 },
  // Full-bleed or edge-aligned art: scaled to the canvas as is.
  fullbleed: { fit: 'none' },
};

const VEHICLES = new Set(['wagon-train', 'artillery', 'damaged-artillery', 'treasure']);
const SHIPS = new Set(['caravel', 'merchantman', 'galleon', 'privateer', 'frigate', 'man-of-war']);

/** Category (top folder) and layout name for a sprite id such as "units/expert-lumberjack__dragoon". */
export function classify(id) {
  const [category, name = ''] = id.split('/');
  const [type, role] = name.split('__');
  let layout;
  switch (category) {
    case 'units':
      if (SHIPS.has(type)) layout = 'ship';
      else if (VEHICLES.has(type)) layout = 'vehicle';
      else if (role === 'dragoon' || role === 'scout') layout = 'mounted';
      else layout = 'standing';
      break;
    case 'goods': layout = 'good'; break;
    case 'overlays': layout = 'overlay'; break;
    case 'buildings':
    case 'colonies':
    case 'settlements': layout = 'building'; break;
    case 'decor': layout = name.startsWith('road__') ? 'fullbleed' : 'decor'; break;
    case 'terrain':
    case 'ui': layout = 'fullbleed'; break;
    case 'bible': layout = null; break; // reference sheet, not a sprite
    default: layout = 'good';
  }
  return { category, layout };
}

/**
 * Ground overlays drawn edge to edge on a tile: they must be transparent outside their shape, or
 * they would hide the tile underneath. (The image model sometimes returns them opaque.)
 */
export function isGroundOverlay(id) {
  return /^terrain\/coast__/.test(id) || /^decor\/road__/.test(id);
}

/**
 * Enclosures generated whole (the colony stockade and fort) are drawn in two parts, the back wall
 * behind the houses and the front wall in front. They split at this share of the master's height
 * (docs/SPRITE_PROMPTS.md, section 4.10).
 */
export const SPLIT_SPRITES = { 'colonies/stockade': 0.58, 'colonies/fort': 0.58 };

/**
 * Compute the master -> unit-canvas transform for a layout.
 * Returns { scale, ox, oy } with unit = master * scale + o, plus the boxes used.
 */
export function placement(img, layoutName, opts = {}) {
  const L = { ...LAYOUTS[layoutName], ...(opts.override ?? {}) };
  const t = opts.alphaThreshold ?? 0.5;
  if (L.fit === 'none') {
    // Full-bleed art keeps its geometry: a square master fills the square exactly (terrain tiles,
    // coast bands and roads must line up with the tile edges); a non-square one (UI pieces) is
    // scaled to fit and centred, never trimmed.
    const scale = 1 / Math.max(img.w, img.h);
    return { scale, ox: (1 - img.w * scale) / 2, oy: (1 - img.h * scale) / 2, bbox: null, core: null, layout: L };
  }
  const bbox = alphaBBox(img, t);
  if (!bbox) throw new Error('empty image (nothing above the alpha threshold)');
  const core = coreBBox(img, t, opts.coreFrac ?? 0.18) ?? bbox;
  const cw = core.x1 - core.x0, ch = core.y1 - core.y0;
  let s;
  if (L.fit === 'height') s = L.h / ch;
  else if (L.fit === 'width') s = L.w / cw;
  else s = Math.min(L.w / cw, L.h / ch);

  const m = L.margin ?? 0;
  const bw = bbox.x1 - bbox.x0, bh = bbox.y1 - bbox.y0;
  const cx = (L.anchor === 'center' ? (bbox.x0 + bbox.x1) : (core.x0 + core.x1)) / 2;
  // Shrink until the full bbox (protrusions included) fits inside the margins.
  for (let guard = 0; guard < 40; guard++) {
    const left = 0.5 - (cx - bbox.x0) * s, right = 0.5 + (bbox.x1 - cx) * s;
    const top = L.anchor === 'center' ? 0.5 - (bh * s) / 2 : L.base - bh * s;
    const fits = left >= m - 1e-9 && right <= 1 - m + 1e-9 && top >= m - 1e-9;
    if (fits) break;
    const k = Math.min(
      (0.5 - m) / Math.max(1e-9, (cx - bbox.x0) * s),
      (0.5 - m) / Math.max(1e-9, (bbox.x1 - cx) * s),
      L.anchor === 'center' ? (1 - 2 * m) / (bh * s) : (L.base - m) / (bh * s),
    );
    s *= Math.min(0.999, k);
  }
  const ox = 0.5 - cx * s;
  const oy = L.anchor === 'center' ? 0.5 - ((bbox.y0 + bbox.y1) / 2) * s : L.base - bbox.y1 * s;
  return { scale: s, ox, oy, bbox, core, layout: L };
}

/** Transform scaled to an N-pixel canvas, in the form `resample` wants. */
export function transformFor(p, n) {
  return { scale: p.scale * n, offsetX: p.ox * n, offsetY: p.oy * n };
}
