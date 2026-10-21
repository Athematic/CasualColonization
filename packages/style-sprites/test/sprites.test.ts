import { describe, expect, it } from 'vitest';
import type { StylePlugin } from '@cc/render-api';
import { fill, kebab, SpriteIds } from '../src/ids.js';
import { coastPieces, roadTurns } from '../src/layers.js';
import { createSpriteStyle } from '../src/style.js';
import { completePack, DEFAULT_MAPPING, DEFAULT_RULES, extendPack, type SpritePack } from '../src/pack.js';
import { Painter, type PaintContext } from '../src/painter.js';
import { chooseSize } from '../src/sizes.js';
import { normaliseBase, spriteBase, DEFAULT_SPRITE_BASE } from '../src/source.js';
import { SpriteStore, type SpriteImage, type SpriteManifest, type StoreEnv } from '../src/store.js';

const SET = { pixelSizes: [16, 24, 32], smoothSizes: [48, 64, 96, 128] };

describe('size selection', () => {
  it('uses a pixel size 1:1 when the box matches', () => {
    expect(chooseSize(SET, 24)).toEqual({ size: 24, mode: 'pixel', draw: 24, smoothing: false });
    expect(chooseSize(SET, 32, true)).toEqual({ size: 32, mode: 'pixel', draw: 32, smoothing: false });
  });

  it('draws pixel art at a whole-number scale when that nearly fills the box', () => {
    // 26 device px: 24 at 1x fills 92%.
    expect(chooseSize(SET, 26)).toEqual({ size: 24, mode: 'pixel', draw: 24, smoothing: false });
    // 20 device px: 16 at 1x is only 80%, so 24 is shrunk, smoothed.
    expect(chooseSize(SET, 20)).toEqual({ size: 24, mode: 'pixel', draw: 20, smoothing: true });
  });

  it('full-bleed tiles always fill the box, nearest-neighbour', () => {
    expect(chooseSize(SET, 26, true)).toEqual({ size: 32, mode: 'pixel', draw: 26, smoothing: false });
    expect(chooseSize(SET, 10, true)).toEqual({ size: 16, mode: 'pixel', draw: 10, smoothing: false });
  });

  it('above the pixel range picks the nearest smooth size at or above, smoothed', () => {
    expect(chooseSize(SET, 33)).toEqual({ size: 48, mode: 'smooth', draw: 33, smoothing: true });
    expect(chooseSize(SET, 48)).toEqual({ size: 48, mode: 'smooth', draw: 48, smoothing: true });
    expect(chooseSize(SET, 100)).toEqual({ size: 128, mode: 'smooth', draw: 100, smoothing: true });
    // Larger than anything: the largest, scaled up.
    expect(chooseSize(SET, 220)).toEqual({ size: 128, mode: 'smooth', draw: 220, smoothing: true });
  });

  it('works with only one kind of size, and with none', () => {
    expect(chooseSize({ pixelSizes: [], smoothSizes: [64] }, 20)).toMatchObject({ size: 64, mode: 'smooth' });
    expect(chooseSize({ pixelSizes: [16, 32], smoothSizes: [] }, 64)).toEqual({ size: 32, mode: 'pixel', draw: 64, smoothing: false });
    expect(chooseSize({ pixelSizes: [], smoothSizes: [] }, 40)).toBeUndefined();
  });
});

const ids = new SpriteIds(DEFAULT_MAPPING);

describe('sprite ids from game state (default mapping)', () => {
  it('kebab-cases engine ids and fills templates', () => {
    expect(kebab('expertFurTrapper')).toBe('expert-fur-trapper');
    expect(kebab('manOfWar')).toBe('man-of-war');
    expect(fill('units/{type}__{role}', { type: 'hardyPioneer', role: 'scout' })).toEqual(['units/hardy-pioneer__scout']);
    expect(fill(null)).toEqual([]);
  });

  it('maps unit type and role', () => {
    expect(ids.unit('freeColonist', 'none')).toEqual(['units/free-colonist__none']);
    expect(ids.unit('expertFarmer', 'soldier')).toEqual(['units/expert-farmer__soldier', 'units/free-colonist__soldier']);
    expect(ids.unit('freeColonist', 'dragoon')).toEqual(['units/free-colonist__dragoon']);
    expect(ids.unit('caravel', 'none')).toEqual(['units/caravel__none']);
    expect(ids.unit('manOfWar', 'none')).toEqual(['units/man-of-war__none']);
    expect(ids.unit('wagonTrain', 'none')).toEqual(['units/wagon-train__none']);
    expect(ids.unit('artillery', 'none')).toEqual(['units/artillery__none']);
    expect(ids.unit('treasure', 'none')).toEqual(['units/treasure__none']);
  });

  it('maps terrain, plowing, relief and water', () => {
    expect(ids.terrain({ t: 'plains' })).toEqual(['terrain/plains']);
    expect(ids.terrain({ t: 'plains', p: true })).toEqual(['terrain/plains__plowed', 'terrain/plains']);
    expect(ids.terrain({ t: 'highSeas' })).toEqual(['terrain/high-seas']);
    expect(ids.water('highSeas')).toEqual(['terrain/high-seas']);
    expect(ids.water('ocean')).toEqual(['terrain/ocean']);
    expect(ids.water('plains')).toEqual(['terrain/ocean']);
    expect(ids.relief({ t: 'grassland', f: true })).toEqual({ kind: 'forest', ids: ['decor/forest__grassland'] });
    expect(ids.relief({ t: 'grassland' })).toBeUndefined();
    expect(ids.relief({ t: 'hills' })).toEqual({ kind: 'hills', ids: ['decor/hills'] });
    expect(ids.relief({ t: 'mountains' })).toEqual({ kind: 'mountains', ids: ['decor/mountains'] });
    expect(ids.relief({ t: 'arctic', f: true })).toBeUndefined();
  });

  it('maps bonus resources like the engine bonus goods', () => {
    expect(ids.bonus({ t: 'ocean' })).toEqual(['decor/bonus__fish']);
    expect(ids.bonus({ t: 'plains' })).toEqual(['decor/bonus__wheat']);
    expect(ids.bonus({ t: 'plains', f: true })).toEqual(['decor/bonus__game']);
    expect(ids.bonus({ t: 'swamp' })).toEqual(['decor/bonus__sugar']);
    expect(ids.bonus({ t: 'mountains' })).toEqual(['decor/bonus__silver']);
    expect(ids.bonus({ t: 'arctic' })).toEqual([]);
    expect(ids.rumour()).toEqual(['decor/ruins']);
  });

  it('maps colonies, defences, settlements, goods and buildings', () => {
    expect([1, 3, 4, 7, 8, 20].map((n) => ids.colony(n)[0])).toEqual([
      'colonies/colony__small',
      'colonies/colony__small',
      'colonies/colony__medium',
      'colonies/colony__medium',
      'colonies/colony__large',
      'colonies/colony__large',
    ]);
    expect([0, 1, 2].map((n) => ids.defence(n))).toEqual([[], ['colonies/stockade'], ['colonies/fort']]);
    expect(ids.settlement('inca', true)).toEqual(['settlements/inca__capital', 'settlements/inca']);
    expect(ids.settlement('sioux', false)).toEqual(['settlements/sioux']);
    expect(ids.good('tradeGoods')).toEqual(['goods/trade-goods']);
    expect(ids.good('bells')).toEqual(['goods/bells']);
    expect(ids.building('docks', 3)).toEqual(['buildings/docks__3', 'buildings/docks__2', 'buildings/docks__1']);
    expect(ids.building('townHall', 1)).toEqual(['buildings/town-hall__1']);
    expect(ids.building('customHouse', 0)).toEqual(['buildings/custom-house__1']);
  });
});

describe('packs', () => {
  const base: SpritePack = completePack({ id: 'a', name: 'A', description: '', source: { base: 'x/' } });

  it('completes a partial pack from the defaults', () => {
    expect(base.mapping.units.plain).toBe('units/{type}__none');
    expect(base.rules.colony.scale).toBe(DEFAULT_RULES.colony.scale);
    expect(base.theme).toBe('inherit');
  });

  it('extends a pack: a scenario overrides single ids, the rest stays', () => {
    const australia = extendPack(base, {
      id: 'a-australia',
      mapping: {
        terrain: { types: { savannah: ['terrain/outback', 'terrain/savannah'] } },
        units: { types: { freeColonist: 'units/settler__none' }, typeRoles: { nativeConvert: { soldier: null } } },
        settlements: { tribes: { arawak: { camp: 'settlements/yolngu' } } },
        roads: { hub: null },
      },
      rules: { colony: { scale: 1.3 } },
    });
    const a = new SpriteIds(australia.mapping);
    expect(australia.id).toBe('a-australia');
    expect(a.terrain({ t: 'savannah' })).toEqual(['terrain/outback', 'terrain/savannah']);
    expect(a.terrain({ t: 'plains' })).toEqual(['terrain/plains']);
    expect(a.unit('freeColonist', 'none')).toEqual(['units/settler__none']);
    // A role still uses the role templates.
    expect(a.unit('freeColonist', 'soldier')[0]).toBe('units/free-colonist__soldier');
    expect(a.unit('nativeConvert', 'soldier')).toEqual([]);
    expect(a.settlement('arawak', false)).toEqual(['settlements/yolngu']);
    expect(a.settlement('arawak', true)).toEqual(['settlements/arawak__capital', 'settlements/arawak']);
    expect(a.road().hub).toEqual([]);
    expect(australia.rules.colony).toEqual({ ...DEFAULT_RULES.colony, scale: 1.3 });
    // The base pack is untouched.
    expect(new SpriteIds(base.mapping).unit('freeColonist', 'none')).toEqual(['units/free-colonist__none']);
  });
});

describe('layer geometry', () => {
  const L = (...dirs: number[]) => Array.from({ length: 8 }, (_, i) => dirs.includes(i));

  it('picks coast pieces and quarter turns from the neighbours', () => {
    // Land to the north: an edge, unturned.
    expect(coastPieces(L(0), true)).toEqual([{ piece: 'edge', turns: 0 }]);
    // Land to the east: an edge, a quarter turn.
    expect(coastPieces(L(2), true)).toEqual([{ piece: 'edge', turns: 1 }]);
    // North and west: the inner corner, unturned; without an inner piece, two edges.
    expect(coastPieces(L(0, 6), true)).toEqual([{ piece: 'inner', turns: 0 }]);
    expect(coastPieces(L(0, 6), false)).toEqual([
      { piece: 'edge', turns: 0 },
      { piece: 'edge', turns: 3 },
    ]);
    // Only the south-east corner: an outer piece, two turns.
    expect(coastPieces(L(3), true)).toEqual([{ piece: 'outer', turns: 2 }]);
    // A corner next to a land side is covered by the edge.
    expect(coastPieces(L(0, 1), true)).toEqual([{ piece: 'edge', turns: 0 }]);
  });

  it('turns road spokes towards each neighbour', () => {
    expect([0, 2, 4, 6].map(roadTurns)).toEqual([0, 1, 2, 3].map((turns) => ({ diagonal: false, turns })));
    expect([7, 1, 3, 5].map(roadTurns)).toEqual([0, 1, 2, 3].map((turns) => ({ diagonal: true, turns })));
  });
});

describe('sprite source', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('defaults to assets/runtime/ next to the page', () => {
    expect(spriteBase('', memory())).toBe(DEFAULT_SPRITE_BASE);
  });

  it('takes ?sprites= and remembers it until reset', () => {
    const st = memory();
    expect(spriteBase('?sprites=https://casual.spence.dk/assets/runtime', st)).toBe('https://casual.spence.dk/assets/runtime/');
    expect(spriteBase('', st)).toBe('https://casual.spence.dk/assets/runtime/');
    expect(spriteBase('?sprites=off', st)).toBeNull();
    expect(spriteBase('', st)).toBeNull();
    expect(spriteBase('?sprites=default', st)).toBe(DEFAULT_SPRITE_BASE);
    expect(spriteBase('', st)).toBe(DEFAULT_SPRITE_BASE);
  });

  it('normalises values', () => {
    expect(normaliseBase('x/')).toBe('x/');
    expect(normaliseBase(' x ')).toBe('x/');
    expect(normaliseBase('')).toBeUndefined();
    expect(normaliseBase('none')).toBeNull();
  });
});

// ---- Store and painter with a fake network ----

const MANIFEST: SpriteManifest = {
  sizes: [16, 24, 32, 48, 64],
  pixelSizes: [16, 24, 32],
  smoothSizes: [48, 64],
  sprites: {
    'units/free-colonist__none': {
      category: 'units',
      layout: 'standing',
      anchor: { x: 0.5, y: 0.94 },
      files: Object.fromEntries([16, 24, 32, 48, 64].map((n) => [n, { file: `units/free-colonist__none@${n}.png`, mode: n <= 32 ? 'pixel' : 'smooth' }])),
    },
    'units/free-colonist__soldier': {
      category: 'units',
      layout: 'standing',
      files: { 48: { file: 'units/free-colonist__soldier@48.png', mode: 'smooth' } },
    },
  },
};

function fakeEnv(opts: { manifest?: unknown; missing?: string[] } = {}) {
  const requested: string[] = [];
  const pending: (() => void)[] = [];
  const env: StoreEnv = {
    fetchJson: async (url) => {
      requested.push(url);
      if (opts.manifest === undefined) throw new Error('404');
      return opts.manifest;
    },
    loadImage: (url) => {
      requested.push(url);
      return new Promise<SpriteImage>((resolve, reject) => {
        pending.push(() => {
          if (opts.missing?.some((m) => url.includes(m))) reject(new Error('404'));
          else {
            const n = Number(/@(\d+)/.exec(url)?.[1] ?? 1);
            resolve({ width: n, height: n, url } as unknown as SpriteImage);
          }
        });
      });
    },
    defer: (fn) => fn(),
  };
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    while (pending.length) pending.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { env, requested, flush };
}

function fakeCtx() {
  const calls: unknown[][] = [];
  const ctx = {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    drawImage(...args: unknown[]) {
      calls.push([ctx.imageSmoothingEnabled, ...args]);
    },
  };
  return { ctx: ctx as unknown as PaintContext, calls };
}

describe('sprite store and fallback', () => {
  it('draws nothing (so the caller falls back) until the manifest and the image have arrived', async () => {
    const { env, requested, flush } = fakeEnv({ manifest: MANIFEST });
    const store = new SpriteStore('base/', env);
    let notified = 0;
    store.subscribe(() => notified++);
    const painter = new Painter(store);
    const { ctx, calls } = fakeCtx();
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 32, 1)).toBe(false);
    expect(requested).toEqual(['base/manifest.json']);
    await flush();
    expect(store.status).toBe('ready');
    expect(notified).toBe(1);
    // Manifest known, image requested lazily at the right size.
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 32, 1)).toBe(false);
    expect(requested[1]).toBe('base/units/free-colonist__none@32.png');
    await flush();
    expect(notified).toBe(2);
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 32, 1)).toBe(true);
    // Pixel size, nearest-neighbour, drawn 32x32 at the origin.
    expect(calls[0][0]).toBe(false);
    expect(calls[0].slice(-4)).toEqual([0, 0, 32, 32]);
    // A 2x screen wants 64 device px: the smooth file.
    painter.square(ctx, 'units/free-colonist__none', 0, 0, 32, 2);
    expect(requested.at(-1)).toBe('base/units/free-colonist__none@64.png');
  });

  it('falls back when the manifest is missing, and never asks again', async () => {
    const { env, requested, flush } = fakeEnv({});
    const store = new SpriteStore('base/', env);
    const painter = new Painter(store);
    const { ctx } = fakeCtx();
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 32, 1)).toBe(false);
    await flush();
    expect(store.status).toBe('failed');
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 32, 1)).toBe(false);
    expect(requested).toEqual(['base/manifest.json']);
  });

  it('rejects a manifest of the wrong shape', async () => {
    const { env, flush } = fakeEnv({ manifest: { hello: 1 } });
    const store = new SpriteStore('base/', env);
    store.start();
    await flush();
    expect(store.status).toBe('failed');
  });

  it('falls back for ids not in the manifest and for images that fail to load', async () => {
    const { env, requested, flush } = fakeEnv({ manifest: MANIFEST, missing: ['free-colonist__none@48'] });
    const store = new SpriteStore('base/', env);
    const painter = new Painter(store);
    const { ctx } = fakeCtx();
    store.start();
    await flush();
    expect(painter.square(ctx, 'units/caravel__none', 0, 0, 48, 1)).toBe(false);
    expect(requested).toEqual(['base/manifest.json']);
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 48, 1)).toBe(false);
    await flush();
    expect(painter.square(ctx, 'units/free-colonist__none', 0, 0, 48, 1)).toBe(false);
    // The failure is remembered: no second request.
    expect(requested.filter((u) => u.includes('@48')).length).toBe(1);
  });

  it('takes the next candidate when the first is missing', async () => {
    const { env, flush } = fakeEnv({ manifest: MANIFEST });
    const store = new SpriteStore('base/', env);
    store.start();
    await flush();
    store.get(['units/expert-farmer__soldier', 'units/free-colonist__soldier'], 48);
    await flush();
    expect(store.get(['units/expert-farmer__soldier', 'units/free-colonist__soldier'], 48)?.id).toBe('units/free-colonist__soldier');
  });

  it('is off (pure procedural) when switched off', () => {
    const { env, requested } = fakeEnv({ manifest: MANIFEST });
    const store = new SpriteStore(null, env);
    expect(store.get('units/free-colonist__none', 32)).toBeUndefined();
    expect(store.status).toBe('off');
    expect(requested).toEqual([]);
  });
});

describe('createSpriteStyle', () => {
  function fallbackStyle() {
    const calls = { icons: 0, hooks: undefined as unknown, rendered: 0 };
    const plugin: StylePlugin = {
      id: 'fallback',
      name: 'Fallback',
      description: '',
      theme: { '--paper': '#fff', '--ink': '#000', '--panel': '', '--panel-ink': '', '--accent': '', '--accent-ink': '', '--muted': '', '--line': '', '--font': '', '--heading-font': '', '--line-width': '', '--radius': '' },
      stylesheets: ['font.css'],
      createMapRenderer: (_canvas, hooks) => {
        calls.hooks = hooks;
        return { render: () => void calls.rendered++, dispose: () => {} };
      },
      drawIcon: () => void calls.icons++,
      tileColor: () => '#123456',
    };
    return { plugin, calls };
  }

  it('inherits theme and fonts, and hands icons it cannot draw to the fallback', async () => {
    const { plugin, calls } = fallbackStyle();
    const { env, flush } = fakeEnv({});
    const style = createSpriteStyle(completePack({ id: 'p', name: 'P', description: 'd', source: { base: 'x/' } }), plugin, { env, base: 'x/' });
    expect(style.theme).toBe(plugin.theme);
    expect(style.stylesheets).toEqual(['font.css']);
    expect(style.tileColor({ t: 'plains' })).toBe('#123456');
    const ctx = { getTransform: () => ({ a: 2, b: 0 }) } as unknown as CanvasRenderingContext2D;
    style.drawIcon(ctx, { kind: 'product', product: 'furs' }, 20);
    await flush();
    style.drawIcon(ctx, { kind: 'product', product: 'furs' }, 20);
    expect(calls.icons).toBe(2);
  });

  it('draws the map with the fallback renderer and the pack layers as hooks', () => {
    const { plugin, calls } = fallbackStyle();
    const { env } = fakeEnv({ manifest: MANIFEST });
    const style = createSpriteStyle(completePack({ id: 'p', name: 'P', description: 'd', source: { base: 'x/' }, procedural: ['roads'] }), plugin, { env, base: 'x/' });
    const r = style.createMapRenderer({} as HTMLCanvasElement);
    const hooks = calls.hooks as Record<string, unknown>;
    expect(typeof hooks.unit).toBe('function');
    expect(typeof hooks.land).toBe('function');
    // Layers the pack leaves procedural get no hook.
    expect(hooks.road).toBeUndefined();
    r.render({} as never);
    expect(calls.rendered).toBe(1);
    r.dispose();
  });
});
