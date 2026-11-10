/**
 * Terrain variants: a base id like `terrain/plains` may come with `terrain/plains__v2`,
 * `terrain/plains__v3` ... in the manifest (takes of the same art, see tools/image-gen `-Variants`).
 * Each tile gets one of them, chosen from its position and the map seed alone: no Math.random, no
 * state, so the choice is the same every frame, zoom level, reload and device.
 *
 * Modes (rules.variants):
 *  - 'off':            always the base sprite.
 *  - 'hash':           `hash(x, y, seed, n) % n`.
 *  - 'hash-no-repeat': like 'hash', but a tile never has the same variant as its west or north
 *                      neighbour whenever there are two or more variants. The rule only looks at
 *                      positions, not terrain, so it holds for same-terrain neighbours too.
 *
 * How 'hash-no-repeat' stays position-only: each tile belongs to one of M = min(n, 3) classes,
 * class(x, y) = (X(x) + Y(y)) mod M, where X and Y are running sums of per-column / per-row hashed
 * steps in 1..M-1. A step is never 0 mod M, so a tile's class differs from its west neighbour's
 * (X steps) and its north neighbour's (Y steps). The classes own disjoint variants (variant i is in
 * class i mod M) and a tile picks, by hash, among its own class's variants. With 2 variants this is
 * a checkerboard; with 3 a warped lattice; with 4+ the choice within a class adds real scatter.
 * The running sums are cached per seed, so a lookup is O(1) after the first.
 */

export type VariantMode = 'off' | 'hash' | 'hash-no-repeat';

export const VARIANT_MODES: readonly VariantMode[] = ['off', 'hash', 'hash-no-repeat'];

/** How many `__vN` takes are looked for at most. */
export const MAX_VARIANTS = 16;

export interface VariantContext {
  mode: VariantMode;
  /** Map seed (any integer; 0 when unknown). */
  seed: number;
  x: number;
  y: number;
  /** Whether the manifest has this sprite id. */
  has(id: string): boolean;
}

/** 32-bit integer hash of four numbers (murmur-style finaliser). */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35) ^ Math.imul(d | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

const AXIS_X = 0x51ed;
const AXIS_Y = 0xa3c9;
const walks = new Map<string, number[]>();

/** Running sum (mod m) of hashed steps in 1..m-1 up to index i, along one axis. */
function walk(axis: number, seed: number, m: number, i: number): number {
  const key = `${axis}:${seed}:${m}`;
  let sums = walks.get(key);
  if (!sums) {
    sums = [0];
    walks.set(key, sums);
  }
  while (sums.length <= i) {
    const k = sums.length;
    sums.push((sums[k - 1] + 1 + (hash4(k, axis, seed, m) % (m - 1))) % m);
  }
  return sums[i];
}

/** Index (0..n-1) of the variant of tile (x, y) among n >= 1 variants. Pure in its arguments. */
export function variantIndex(mode: VariantMode, n: number, x: number, y: number, seed: number): number {
  if (mode === 'off' || n <= 1) return 0;
  const h = hash4(x, y, seed, n);
  if (mode === 'hash') return h % n;
  // Off-map (negative) positions share the pattern of their absolute value.
  const m = Math.min(n, 3);
  const cls = (walk(AXIS_X, seed, m, Math.abs(x)) + walk(AXIS_Y, seed, m, Math.abs(y))) % m;
  const inClass = Math.ceil((n - cls) / m);
  return cls + m * ((h >>> 3) % inClass);
}

/** The ids present in the manifest among `base`, `base__v2` ... (the base first). */
export function variantSet(base: string, has: (id: string) => boolean): string[] {
  const out: string[] = [];
  if (has(base)) out.push(base);
  for (let v = 2; v <= MAX_VARIANTS; v++) if (has(`${base}__v${v}`)) out.push(`${base}__v${v}`);
  return out;
}

/**
 * Candidates with variants: every id that has more than one take is preceded by the tile's take,
 * so a take that is missing or not loaded falls back to the base sprite. Ids with a single take
 * (or none) stay as they are.
 */
export function withVariants(candidates: readonly string[], ctx: VariantContext | undefined): string[] {
  if (!ctx || ctx.mode === 'off') return [...candidates];
  const out: string[] = [];
  for (const id of candidates) {
    const set = variantSet(id, ctx.has);
    if (set.length > 1) out.push(set[variantIndex(ctx.mode, set.length, ctx.x, ctx.y, ctx.seed)]);
    out.push(id);
  }
  return [...new Set(out)];
}

/** Whether `id` is `base` or one of its takes. */
export function isTakeOf(id: string, base: string): boolean {
  return id === base || (id.startsWith(base + '__v') && /^\d+$/.test(id.slice(base.length + 3)));
}
