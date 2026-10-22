// Colour maths: sRGB <-> linear light, OKLab, palettes and nearest-colour search.
// Everything here is plain arithmetic, so results are identical on every platform.

/** sRGB byte (0..255) -> linear light (0..1), as a lookup table. */
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0..1) -> sRGB (0..1), unclamped input is clamped. */
export function linearToSrgb(v) {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Linear light (0..1) -> sRGB byte. */
export function linearToByte(v) {
  return Math.round(linearToSrgb(v) * 255);
}

/** Linear-light RGB -> OKLab [L, a, b] (Björn Ottosson, 2020). */
export function linearToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab -> linear-light RGB (may fall slightly outside 0..1). */
export function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Bad colour "${hex}" (expected #rrggbb)`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex);
  return linearToOklab(SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b]);
}

export function oklabToHex(L, a, b) {
  const [r, g, bb] = oklabToLinear(L, a, b);
  return rgbToHex([linearToByte(r), linearToByte(g), linearToByte(bb)]);
}

export function oklabDist(p, q) {
  const dL = p[0] - q[0], da = p[1] - q[1], db = p[2] - q[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** The ink colour every outline uses. */
export const INK = '#1b1a17';

/** The 12 swatches of the style bible (docs/SPRITE_PROMPTS.md, section 4.1). */
export const CORE_PALETTE = [
  '#1b1a17', // ink
  '#fffdf6', // white
  '#f3c9a0', // skin
  '#d23c2a', // roof red
  '#3a6fb0', // slate blue
  '#fbf3df', // cream wall
  '#a8743f', // wood
  '#b9b2a6', // stone
  '#9a5b2e', // ship hull
  '#ffd23f', // gold
  '#8ed0ec', // shallow water
  '#58a548', // foliage green
];

/**
 * A few more colours from the master style block (section 2) that the bible
 * sheet itself uses: metal, dark wood and a dark green. Units need the greys
 * for barrels, blades and boots; without them metal snaps to stone or ink.
 */
export const EXTRA_PALETTE = [
  '#55585c', // gunmetal
  '#9aa0a6', // iron
  '#8a5a32', // dark wood, tree trunks
  '#3d8a4c', // dark foliage
];

/** A palette prepared for nearest-colour search in OKLab. */
export class Palette {
  /**
   * @param hexes        colours
   * @param chromaWeight weight of the a/b (hue and chroma) axes against L in the
   *                     distance. 1 = plain OKLab; 2 keeps a warm off-white coat
   *                     from snapping to skin, a common pixel-art preference for
   *                     hue over lightness.
   */
  constructor(hexes, { chromaWeight = 1 } = {}) {
    this.chromaWeight = chromaWeight;
    const seen = new Set();
    this.hex = [];
    for (const h of hexes) {
      const k = h.toLowerCase();
      if (!seen.has(k)) { seen.add(k); this.hex.push(k); }
    }
    this.lab = this.hex.map(hexToOklab);
    this.lin = this.hex.map((h) => hexToRgb(h).map((v) => SRGB_TO_LINEAR[v]));
    this.inkIndex = this.hex.indexOf(INK);
  }

  get size() {
    return this.hex.length;
  }

  /** Index of the nearest entry and its distance; ties go to the lower index. */
  dist(p, q) {
    const w = this.chromaWeight;
    const dL = p[0] - q[0], da = (p[1] - q[1]) * w, db = (p[2] - q[2]) * w;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  nearest(lab) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.lab.length; i++) {
      const d = this.dist(lab, this.lab[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { index: best, dist: bestD };
  }

  /** Nearest and second-nearest entries (for ordered dithering). */
  nearestTwo(lab) {
    let i1 = 0, d1 = Infinity, i2 = 0, d2 = Infinity;
    for (let i = 0; i < this.lab.length; i++) {
      const d = this.dist(lab, this.lab[i]);
      if (d < d1) { i2 = i1; d2 = d1; i1 = i; d1 = d; } else if (d < d2) { i2 = i; d2 = d; }
    }
    return { i1, d1, i2, d2 };
  }

  with(extraHexes) {
    return new Palette([...this.hex, ...extraHexes], { chromaWeight: this.chromaWeight });
  }
}

/** 4x4 Bayer matrix, values 0..15. */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
