import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@cc/engine';
import { createLayerHooks } from '../src/layers.js';
import { completePack, DEFAULT_RULES } from '../src/pack.js';
import { SpriteIds } from '../src/ids.js';
import { DEFAULT_TRANSITION_ORDER, transitionPieces, type TransitionPieces } from '../src/transitions.js';

const ORDER = DEFAULT_TRANSITION_ORDER;
const ALL: TransitionPieces = { edge: true, inner: true, outer: true };
/** Neighbours clockwise from north (N, NE, E, SE, S, SW, W, NW); gaps are water or off the map. */
const N = (...t: (TerrainId | undefined)[]) => Array.from({ length: 8 }, (_, i) => t[i]);

describe('terrain transition selection', () => {
  const has = () => ALL;

  it('gives a lower terrain an edge from a higher neighbour, turned towards it', () => {
    expect(transitionPieces(ORDER, 'plains', N('grassland'), has)).toEqual([{ terrain: 'grassland', piece: 'edge', turns: 0 }]);
    expect(transitionPieces(ORDER, 'plains', N(undefined, undefined, 'grassland'), has)).toEqual([{ terrain: 'grassland', piece: 'edge', turns: 1 }]);
  });

  it('gives nothing to the higher terrain, to equal terrain or to unranked ones', () => {
    expect(transitionPieces(ORDER, 'grassland', N('plains', 'desert', 'plains'), has)).toEqual([]);
    expect(transitionPieces(ORDER, 'plains', N('plains', 'plains'), has)).toEqual([]);
    expect(transitionPieces(ORDER, 'hills', N('grassland'), has)).toEqual([]);
    expect(transitionPieces(ORDER, 'plains', N('hills', 'mountains'), has)).toEqual([]);
  });

  it('uses the inner piece for two adjacent sides, the outer piece for a lone corner', () => {
    expect(transitionPieces(ORDER, 'desert', N('plains', undefined, undefined, undefined, undefined, undefined, 'plains'), has)).toEqual([
      { terrain: 'plains', piece: 'inner', turns: 0 },
    ]);
    expect(transitionPieces(ORDER, 'desert', N(undefined, undefined, undefined, 'plains'), has)).toEqual([{ terrain: 'plains', piece: 'outer', turns: 2 }]);
  });

  it('draws lower-ranked bleeders first, so higher ones overlap them', () => {
    const got = transitionPieces(ORDER, 'desert', N('grassland', undefined, 'plains'), has);
    expect(got.map((p) => p.terrain)).toEqual(['plains', 'grassland']);
  });

  it('falls back piece by piece: no inner means two edges, no outer means nothing, no edge means the hard boundary', () => {
    const noInner = () => ({ edge: true, inner: false, outer: true });
    expect(transitionPieces(ORDER, 'desert', N('plains', undefined, undefined, undefined, undefined, undefined, 'plains'), noInner)).toEqual([
      { terrain: 'plains', piece: 'edge', turns: 0 },
      { terrain: 'plains', piece: 'edge', turns: 3 },
    ]);
    const noOuter = () => ({ edge: true, inner: true, outer: false });
    expect(transitionPieces(ORDER, 'desert', N(undefined, 'plains'), noOuter)).toEqual([]);
    expect(transitionPieces(ORDER, 'desert', N('plains'), () => undefined)).toEqual([]);
    // Only the terrains that have art bleed.
    const onlyGrass = (t: TerrainId) => (t === 'grassland' ? ALL : undefined);
    expect(transitionPieces(ORDER, 'desert', N('plains', undefined, 'grassland'), onlyGrass).map((p) => p.terrain)).toEqual(['grassland']);
  });
});

describe('terrain transition corners', () => {
  const has = () => ALL;
  const G = 'grassland' as const;
  /** Pieces for a desert tile whose neighbours are grassland at the given indices (N=0, NE=1 ... NW=7). */
  const at = (...idx: number[]) => {
    const n: (TerrainId | undefined)[] = Array(8).fill(undefined);
    for (const i of idx) n[i] = G;
    return transitionPieces(ORDER, 'desert', n, has).map((p) => `${p.piece}${p.turns}`);
  };

  it('turns an inner corner right for all four orientations (N+W, E+N, S+E, W+S)', () => {
    expect(at(0, 6)).toEqual(['inner0']);
    expect(at(2, 0)).toEqual(['inner1']);
    expect(at(4, 2)).toEqual(['inner2']);
    expect(at(6, 4)).toEqual(['inner3']);
  });

  it('puts an outer corner on a lone diagonal, for all four diagonals', () => {
    expect(at(7)).toEqual(['outer0']);
    expect(at(1)).toEqual(['outer1']);
    expect(at(3)).toEqual(['outer2']);
    expect(at(5)).toEqual(['outer3']);
  });

  it('covers an L-shaped concave corner with one inner piece and no edges, with or without its diagonal', () => {
    expect(at(0, 6)).toEqual(['inner0']);
    expect(at(0, 6, 7)).toEqual(['inner0']);
  });

  it('gives a U-shaped inlet (three sides) two inner pieces and no edge', () => {
    expect(at(0, 2, 6)).toEqual(['inner0', 'inner1']);
    expect(at(2, 4, 0)).toEqual(['inner1', 'inner2']);
    expect(at(4, 6, 2)).toEqual(['inner2', 'inner3']);
    expect(at(6, 0, 4)).toEqual(['inner0', 'inner3']);
  });

  it('gives a single-tile hole (four sides) four inner pieces', () => {
    expect(at(0, 2, 4, 6)).toEqual(['inner0', 'inner1', 'inner2', 'inner3']);
  });

  it('gives opposite sides two edges and a straight run one edge', () => {
    expect(at(0, 4)).toEqual(['edge0', 'edge2']);
    expect(at(0, 1, 7)).toEqual(['edge0']);
  });

  it('gives a tile with high terrain only on its diagonals four outer corners', () => {
    expect(at(1, 3, 5, 7)).toEqual(['outer0', 'outer1', 'outer2', 'outer3']);
  });

  it('gives an edge plus an outer corner where a band runs on and turns away', () => {
    expect(at(0, 3)).toEqual(['edge0', 'outer2']);
  });
});

describe('transition layer', () => {
  const pack = (transitions: 'none' | 'overlay') =>
    completePack({ id: 't', name: 'T', description: '', source: { base: 'x/' }, rules: { ...DEFAULT_RULES, transitions } });

  /** A 3x3 map of plains with a grassland tile east of the centre. */
  const state = () => {
    const tiles = Array.from({ length: 9 }, () => ({ t: 'plains' }));
    tiles[5] = { t: 'grassland' };
    return { map: { width: 3, height: 3, tiles }, colonies: {} } as never;
  };

  const run = (mode: 'none' | 'overlay', available: (id: string) => boolean) => {
    const p = pack(mode);
    const calls: { ids: string[]; rotate?: number }[] = [];
    const painter = {
      pick: (ids: string | readonly string[]) => (available([ids].flat()[0]) ? ({ id: [ids].flat()[0] } as never) : undefined),
      square: (_c: unknown, ids: string | readonly string[], _x: number, _y: number, _z: number, _d: number, o?: { rotate?: number }) => {
        calls.push({ ids: [ids].flat(), rotate: o?.rotate });
        return true;
      },
    };
    const hooks = createLayerHooks(p, new SpriteIds(p.mapping), painter as never, '#000');
    hooks.beginFrame?.({} as never, { pixelRatio: 1 } as never);
    const tile = { tile: { t: 'plains' }, x: 1, y: 1, px: 0, py: 0 };
    hooks.land!({} as never, tile as never, 64, () => undefined, state());
    return calls;
  };

  const art = (id: string) => id.startsWith('terrain/plains') || id.startsWith('terrain/blend__grassland');

  it("'none' draws only the ground, even when the pieces exist", () => {
    expect(run('none', art)).toEqual([{ ids: ['terrain/plains'], rotate: undefined }]);
  });

  it("'overlay' adds the neighbour's band, turned east", () => {
    expect(run('overlay', art)).toEqual([
      { ids: ['terrain/plains'], rotate: undefined },
      { ids: ['terrain/blend__grassland__edge'], rotate: 1 },
    ]);
  });

  it("'overlay' without the pieces looks exactly like 'none'", () => {
    expect(run('overlay', (id) => id === 'terrain/plains')).toEqual(run('none', art));
  });

  it("'overlay' hides the straight border line on an edge that has a band, 'none' does not", () => {
    const hooks = (mode: 'none' | 'overlay', available: (id: string) => boolean) => {
      const p = pack(mode);
      const painter = { pick: (ids: string | readonly string[]) => (available([ids].flat()[0]) ? ({ id: [ids].flat()[0] } as never) : undefined) };
      return createLayerHooks(p, new SpriteIds(p.mapping), painter as never, '#000');
    };
    expect(hooks('none', art).hideBorder).toBeUndefined();
    const hide = hooks('overlay', art).hideBorder!;
    // (1,1) plains next to (2,1) grassland.
    expect(hide(1, 1, 2, 1, 64, state())).toBe(true);
    expect(hide(2, 1, 1, 1, 64, state())).toBe(true);
    expect(hide(0, 1, 1, 1, 64, state())).toBe(false);
    // No art for the bleeding terrain: the border stays.
    expect(hooks('overlay', (id) => id === 'terrain/plains').hideBorder!(1, 1, 2, 1, 64, state())).toBe(false);
  });

  it('is off by default', () => {
    expect(DEFAULT_RULES.transitions).toBe('none');
  });
});
