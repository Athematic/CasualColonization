// Default settings. Every value can be overridden from the command line (see
// build.mjs --help) or, for the tuning section of the contact sheet, per variant.

export const DEFAULT_SIZES = [16, 24, 32, 48, 64, 96, 128];
export const DEFAULT_PIXEL_MAX = 32;

export const DEFAULTS = {
  // Master clean-up and normalising.
  alphaLo: 0.16, // alpha below this is the model's faint glow: dropped
  alphaHi: 0.6, // alpha above this is fully opaque
  coreFrac: 0.18, // rows/columns thinner than this share of the widest are "protrusions"

  smooth: {
    kernel: 'mitchell', // 'mitchell' | 'lanczos3' | 'box'
    sharpen: 0.35, // unsharp-mask amount, 0 = off
    sharpenSigma: 0.6, // in output pixels
    inkMinPx: 0.7, // thicken the ink so lines are at least this many output px wide
    inkMaxGrowPx: 0.3, // ...but never grow a line by more than this per side
    inkGrow: 'both', // 'both': the outer outline may grow outwards too; 'inside': never grows the silhouette
  },

  pixel: {
    factor: 4, // pre-simplify at this multiple of the target size
    simplify: 1, // median passes at that size (0 = off)
    inkMinPx: 0, // thicken ink to this many target px before reducing (0 = off)
    inkMaxGrowPx: 0.5,
    inkGrow: 'both',
    inkTol: 0.12, // OKLab distance from #1b1a17 that still counts as ink
    alphaThreshold: 0.5, // block coverage needed for an opaque pixel
    thinLine: 0.22, // ...or this much for a 1-px ridge (thin staffs, crossbars, blades); 0 = off
    inkLine: 0.3, // ...or this much ink coverage (keeps thin props like a musket)
    inkKeep: 0.45, // ink share of an opaque block on the silhouette edge that makes the pixel ink
    inkKeepInterior: 0.65, // ...and inside the silhouette (higher: only solid ink areas and bold lines)
    interiorInk: true, // keep ink lines inside the silhouette
    paletteSnap: true, // false = keep the averaged colour (no palette)
    palette: 'extended', // 'core' (12 bible swatches) | 'extended' (+ metal, dark wood, dark green)
    chromaWeight: 2, // weight of hue/chroma vs lightness in the nearest-colour search (1 = plain OKLab)
    extraColors: 3, // per-sprite extra colours for large areas far from the palette (0 = off)
    extraTol: 0.07, // OKLab distance that counts as "far from the palette"
    extraMinShare: 0.04, // ...and the share of the sprite such an area must cover
    reduce: 'mean', // 'mean' (area average, then quantise) | 'mode' (majority palette colour)
    dither: false, // ordered 4x4 Bayer dithering between the two nearest colours
    ditherStrength: 1,
    outline: 4, // 4 | 8 | 'none': neighbourhood for the 1-px outline outside the silhouette
    thin: 'auto', // 1-px props: 'auto' (dark/mid colours kept bare, light ones outlined) | 'keep' | 'ink' | 'outline'
    cleanup: true, // orphan-pixel cleanup
  },
};

/** Variants rendered in the "tuning" section of the contact sheet. */
export const TUNING_VARIANTS = [
  { key: 'default', label: 'Default', pixel: {} },
  { key: 'no-snap', label: 'No palette snap', pixel: { paletteSnap: false } },
  { key: 'core', label: 'Core 12 only, no extras', pixel: { palette: 'core', extraColors: 0 } },
  { key: 'outline8', label: 'Outline 8-neighbour', pixel: { outline: 8 } },
  { key: 'thin-ink', label: 'Thin props as ink', pixel: { thin: 'ink' } },
  { key: 'thin-outline', label: 'Thin props outlined', pixel: { thin: 'outline' } },
  { key: 'no-outline', label: 'No redrawn outline', pixel: { outline: 'none' } },
  { key: 'no-interior', label: 'No interior ink', pixel: { interiorInk: false } },
  { key: 'plain-oklab', label: 'Plain OKLab distance', pixel: { chromaWeight: 1 } },
  { key: 'mode', label: 'Majority colour', pixel: { reduce: 'mode' } },
  { key: 'dither', label: 'Ordered dither', pixel: { dither: true } },
  { key: 'ink-grow', label: 'Ink grown to 0.5 px', pixel: { inkMinPx: 0.5 } },
  { key: 'no-simplify', label: 'No pre-simplify', pixel: { simplify: 0 } },
];

/** Sprites used for the tuning section when present (role props that must survive). */
export const TUNING_SPRITES = [
  'units/expert-lumberjack__none', // axe
  'units/expert-ore-miner__soldier', // musket
  'units/master-sugar-planter__missionary', // cross
  'units/master-sugar-planter__scout', // horse, telescope
];

export function mergeSettings(base, over = {}) {
  return {
    ...base,
    ...over,
    smooth: { ...base.smooth, ...(over.smooth ?? {}) },
    pixel: { ...base.pixel, ...(over.pixel ?? {}) },
  };
}
