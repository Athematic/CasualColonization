import { describe, expect, it } from 'vitest';
import { SpriteIds } from '../src/ids.js';
import { completePack, DEFAULT_MAPPING, DEFAULT_RULES } from '../src/pack.js';
import { isTakeOf, variantIndex, variantSet, withVariants, type VariantContext, type VariantMode } from '../src/variants.js';

const manifestOf = (...list: string[]) => (id: string) => list.includes(id);
const takes = (base: string, n: number) => [base, ...Array.from({ length: n - 1 }, (_, i) => `${base}__v${i + 2}`)];

describe('variant index', () => {
  it('is deterministic in position and seed, and in range', () => {
    for (const mode of ['hash', 'hash-no-repeat'] as VariantMode[]) {
      for (let n = 1; n <= 6; n++) {
        for (let i = 0; i < 200; i++) {
          const x = (i * 7) % 41;
          const y = (i * 13) % 37;
          const a = variantIndex(mode, n, x, y, 1234);
          expect(variantIndex(mode, n, x, y, 1234)).toBe(a);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(n);
        }
      }
    }
  });

  it('does not depend on the order of lookups', () => {
    const forward: number[] = [];
    for (let x = 0; x < 30; x++) forward.push(variantIndex('hash-no-repeat', 3, x, 17, 77));
    const backward: number[] = [];
    for (let x = 29; x >= 0; x--) backward.unshift(variantIndex('hash-no-repeat', 3, x, 17, 77));
    expect(backward).toEqual(forward);
  });

  it('depends on the seed', () => {
    let differ = 0;
    for (let i = 0; i < 100; i++) if (variantIndex('hash', 4, i, 3, 1) !== variantIndex('hash', 4, i, 3, 2)) differ++;
    expect(differ).toBeGreaterThan(30);
  });

  it('single variant or off: always the base', () => {
    for (let i = 0; i < 50; i++) {
      expect(variantIndex('hash-no-repeat', 1, i, i * 3, 9)).toBe(0);
      expect(variantIndex('off', 5, i, i * 3, 9)).toBe(0);
    }
  });

  it('hash-no-repeat never repeats the west or north neighbour, for 2 to 8 variants and several seeds', () => {
    for (const seed of [0, 7, 99991, 2 ** 31 + 5]) {
      for (let n = 2; n <= 8; n++) {
        const used = new Set<number>();
        for (let y = 0; y < 48; y++) {
          for (let x = 0; x < 64; x++) {
            const v = variantIndex('hash-no-repeat', n, x, y, seed);
            used.add(v);
            if (x > 0) expect(v).not.toBe(variantIndex('hash-no-repeat', n, x - 1, y, seed));
            if (y > 0) expect(v).not.toBe(variantIndex('hash-no-repeat', n, x, y - 1, seed));
          }
        }
        expect(used.size).toBe(n);
      }
    }
  });

  it('plain hash spreads the variants roughly evenly', () => {
    const count = [0, 0, 0];
    for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) count[variantIndex('hash', 3, x, y, 5)]++;
    for (const c of count) expect(c).toBeGreaterThan(1000);
  });
});

describe('variant candidates', () => {
  const ctx = (has: (id: string) => boolean, x = 3, y = 4, mode: VariantMode = 'hash-no-repeat'): VariantContext => ({ mode, seed: 42, x, y, has });

  it('finds the takes in the manifest', () => {
    expect(variantSet('terrain/plains', manifestOf(...takes('terrain/plains', 3)))).toEqual(['terrain/plains', 'terrain/plains__v2', 'terrain/plains__v3']);
    expect(variantSet('terrain/plains', manifestOf('terrain/plains'))).toEqual(['terrain/plains']);
    expect(variantSet('terrain/plains', manifestOf())).toEqual([]);
    expect(isTakeOf('terrain/plains__v2', 'terrain/plains')).toBe(true);
    expect(isTakeOf('terrain/plains__plowed', 'terrain/plains')).toBe(false);
  });

  it('single variant, no manifest or off: unchanged', () => {
    expect(withVariants(['terrain/plains'], ctx(manifestOf('terrain/plains')))).toEqual(['terrain/plains']);
    expect(withVariants(['terrain/plains'], ctx(manifestOf()))).toEqual(['terrain/plains']);
    expect(withVariants(['terrain/plains'], undefined)).toEqual(['terrain/plains']);
    expect(withVariants(['terrain/plains'], ctx(manifestOf(...takes('terrain/plains', 3)), 3, 4, 'off'))).toEqual(['terrain/plains']);
  });

  it('puts the chosen take first and falls back to the base id', () => {
    const has = manifestOf(...takes('terrain/plains', 3));
    const seen = new Set<string>();
    for (let x = 0; x < 20; x++) {
      const list = withVariants(['terrain/plains'], ctx(has, x, 0));
      expect(list.length).toBeLessThanOrEqual(2);
      expect(list[list.length - 1]).toBe('terrain/plains');
      expect(isTakeOf(list[0], 'terrain/plains')).toBe(true);
      seen.add(list[0]);
    }
    expect(seen.size).toBe(3);
  });

  it('works with a base that is missing and with gaps', () => {
    const list = withVariants(['terrain/plains'], ctx(manifestOf('terrain/plains__v2', 'terrain/plains__v4')));
    expect(['terrain/plains__v2', 'terrain/plains__v4']).toContain(list[0]);
    expect(list[list.length - 1]).toBe('terrain/plains');
  });
});

describe('ids with variants', () => {
  const ids = new SpriteIds(DEFAULT_MAPPING);
  const all = [
    ...takes('terrain/plains', 3),
    ...takes('terrain/prairie', 4),
    ...takes('terrain/plains__plowed', 2),
    ...takes('decor/forest__plains', 2),
    ...takes('decor/hills', 3),
    'decor/mountains',
    ...takes('terrain/ocean', 2),
  ];
  const vc = (x: number, y: number): VariantContext => ({ mode: 'hash-no-repeat', seed: 1, x, y, has: manifestOf(...all) });

  it('varies ground, plowed ground, forest, hills and water; single-take sprites and transitions stay single', () => {
    const g = ids.terrain({ t: 'plains' }, vc(2, 5));
    expect(g[g.length - 1]).toBe('terrain/plains');
    expect(g.every((id) => isTakeOf(id, 'terrain/plains'))).toBe(true);
    const p = ids.terrain({ t: 'plains', p: true }, vc(2, 5));
    expect(p.some((id) => isTakeOf(id, 'terrain/plains__plowed') && id !== 'terrain/plains__plowed')).toBe(true);
    expect(p[p.length - 1]).toBe('terrain/plains');
    expect(ids.relief({ t: 'plains', f: true }, vc(2, 5))?.ids.at(-1)).toBe('decor/forest__plains');
    expect(ids.relief({ t: 'hills' }, vc(2, 5))?.ids).toHaveLength(2);
    expect(ids.relief({ t: 'mountains' }, vc(2, 5))?.ids).toEqual(['decor/mountains']);
    expect(ids.water('ocean', vc(2, 5))).toHaveLength(2);
    expect(ids.water('plains', vc(2, 5))).toEqual(['terrain/ocean']);
    expect(ids.transition('plains').edge).toEqual(['terrain/blend__plains__edge']);
    // Without a context nothing changes.
    expect(ids.terrain({ t: 'plains' })).toEqual(['terrain/plains']);
  });

  it('over a random map no same-terrain west or north neighbours share a take', () => {
    const kinds = ['plains', 'prairie'] as const;
    let s = 12345;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const W = 50;
    const H = 40;
    const map = Array.from({ length: W * H }, () => kinds[rnd() < 0.7 ? 0 : 1]);
    const pick = (x: number, y: number) => ids.terrain({ t: map[y * W + x] }, vc(x, y))[0];
    let pairs = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x > 0 && map[y * W + x] === map[y * W + x - 1]) {
          pairs++;
          expect(pick(x, y)).not.toBe(pick(x - 1, y));
        }
        if (y > 0 && map[y * W + x] === map[(y - 1) * W + x]) {
          pairs++;
          expect(pick(x, y)).not.toBe(pick(x, y - 1));
        }
      }
    }
    expect(pairs).toBeGreaterThan(1000);
  });

  it('the pack rule defaults to hash-no-repeat and can be set', () => {
    expect(DEFAULT_RULES.variants).toBe('hash-no-repeat');
    expect(completePack({ id: 'x', name: 'x', description: 'x', source: { base: './' }, rules: { ...DEFAULT_RULES, variants: 'off' } }).rules.variants).toBe('off');
  });
});
