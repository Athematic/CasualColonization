/**
 * Beta 4 step 5 (docs/design/hex-maps.md H15): the placeholder fallback, the placeholder pack on squares and
 * hexes, and the missing-ids check run for the shipped packs.
 */
import { describe, expect, it } from 'vitest';
import { AMERICAS, CARIBBEAN, createGame, getScenario, gridOf, headStartConfig, playUntil, TERRAIN, type GameConfig, type GameState, type Scenario } from '@cc/engine';
import { computeVisibility, drawsGrid, type MapLayerHooks, type Scene } from '@cc/render-api';
import schematic from '@cc/style-schematic';
import { ligneClairePaintedPack } from '../packs/ligne-claire-painted.js';
import ligneClairePainted from '../packs/ligne-claire-painted.js';
import placeholder, { placeholderPack } from '../packs/placeholder.js';
import { SpriteIds } from '../src/ids.js';
import { createLayerHooks } from '../src/layers.js';
import { claimedCategories, formatMissing, missingIds } from '../src/missing.js';
import { completePack, type SpritePack } from '../src/pack.js';
import { Painter } from '../src/painter.js';
import { PLACEHOLDER_CATEGORIES, PLACEHOLDER_TERRAIN, placeholderCovers } from '../src/placeholder.js';
import { createSpriteStyle } from '../src/style.js';
import { SpriteStore, type StoreEnv } from '../src/store.js';

/** The painted pack's manifest, when tools/sprite-pipeline has built one here (gitignored); empty otherwise. */
const LOCAL_MANIFEST = import.meta.glob<{ sprites: Record<string, unknown> }>('../../../tools/sprite-pipeline/out/manifest.json', { eager: true, import: 'default' });

/** A 2D context that records the methods called on it (no pixels). */
function recorder(): CanvasRenderingContext2D & { calls: string[] } {
  const target: Record<string | symbol, unknown> = { calls: [] as string[] };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0 });
      return () => {
        (t.calls as string[]).push(String(k));
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

function fakeCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

const NO_NETWORK: StoreEnv = {
  fetchJson: () => Promise.reject(new Error('offline')),
  loadImage: () => Promise.reject(new Error('offline')),
  defer: (fn) => fn(),
};

/** A game with colonies, roads and units, after a short head start (computer players). */
function playedGame(scenario: string): GameState {
  const config: GameConfig = { seed: 5, mapSize: 'medium', nations: ['england', 'france'], humans: [], scenario };
  const s = createGame(headStartConfig(config, 60));
  playUntil(s, 60);
  return s;
}

function sceneOf(s: GameState, zoom = 48): Scene {
  // Centred on the first colony, so towns, roads and units are in view.
  const c = Object.values(s.colonies)[0];
  return {
    state: s,
    viewer: 'england',
    camera: { x: c ? c.x + 0.5 : s.map.width / 2, y: c ? c.y + 0.5 : s.map.height / 2, zoom },
    width: 800,
    height: 600,
    pixelRatio: 1,
    visible: computeVisibility(s, 'england'),
    revealAll: true,
  };
}

/** Hooks that count their calls and draw nothing (so the renderer draws every piece itself). */
function countingHooks(): { hooks: MapLayerHooks; count: Record<string, number> } {
  const count: Record<string, number> = {};
  const hit = (k: string) => () => {
    count[k] = (count[k] ?? 0) + 1;
    return false;
  };
  const hooks: MapLayerHooks = {
    beginFrame: () => void hit('beginFrame')(),
    water: hit('water'),
    land: hit('land'),
    shore: () => void hit('shore')(),
    plowed: hit('plowed'),
    road: hit('road'),
    relief: hit('relief'),
    bonus: hit('bonus'),
    rumour: hit('rumour'),
    settlement: hit('settlement'),
    colony: hit('colony'),
    unit: hit('unit'),
    brave: hit('brave'),
  };
  return { hooks, count };
}

describe('the placeholder pack', () => {
  it('has no images, falls back to placeholders and draws squares and hexes over the schematic style', () => {
    expect(placeholderPack.source.base).toBeNull();
    expect(placeholderPack.fallback).toBe('placeholder');
    expect(placeholder.grids).toEqual(['square', 'hex']);
    expect(drawsGrid(placeholder, 'hex')).toBe(true);
    expect(drawsGrid(placeholder, 'square')).toBe(true);
  });

  it('draws the painted pack on squares and hexes, as its Ligne claire fallback (step 6)', () => {
    expect(ligneClairePainted.grids).toEqual(['square', 'hex']);
    expect(drawsGrid(ligneClairePainted, 'hex')).toBe(true);
    expect(ligneClairePaintedPack.fallback).toBeUndefined();
  });

  it('has a flat colour for every terrain', () => {
    for (const t of Object.keys(TERRAIN)) expect(PLACEHOLDER_TERRAIN[t as keyof typeof TERRAIN]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('the missing-ids check', () => {
  const scenarios: [Scenario, string][] = [
    [AMERICAS, 'square'],
    [CARIBBEAN, 'square'],
    [getScenario('hex-test')!, 'hex'],
    [getScenario('hex-test-flat')!, 'hex'],
  ];

  it.each(scenarios)('the placeholder pack draws everything it claims on %s', (scenario, grid) => {
    const report = missingIds(placeholderPack, scenario, () => false);
    expect(report.grid).toBe(grid);
    // No images: every needed sprite is missing, and every one in a claimed category has a placeholder.
    expect(report.missing.length).toBeGreaterThan(100);
    expect(report.uncovered).toEqual([]);
    for (const m of report.missing) if (claimedCategories(placeholderPack).includes(m.category)) expect(m.placeholder).toBe(true);
    for (const cat of ['terrain', 'relief', 'units', 'braves', 'colonies', 'settlements', 'buildings', 'goods', 'fathers', 'overlays'] as const) {
      expect(report.categories[cat]?.needed).toBeGreaterThan(0);
    }
    // Square-only pieces are not asked for on hexes.
    for (const cat of ['roads', 'coast', 'transitions'] as const) expect(report.categories[cat] === undefined).toBe(grid === 'hex' || cat === 'transitions');
  });

  it('fails a placeholder pack whose shapes miss something it needs', () => {
    // A people without a colour: a scenario listing a people the catalogue lacks stands in for one.
    const odd = { ...AMERICAS, peoples: { ...AMERICAS.peoples, ids: [...AMERICAS.peoples.ids, 'atlanteans'] } } as unknown as Scenario;
    const report = missingIds(placeholderPack, odd, () => false);
    expect(report.uncovered.map((m) => m.key)).toEqual(['atlanteans', 'atlanteans:capital']);
    // A procedural pack is never uncovered: its fallback style draws every piece.
    expect(missingIds(ligneClairePaintedPack, odd, () => false).uncovered).toEqual([]);
    expect(placeholderCovers('units', 'zeppelin:none')).toBe(false);
    expect(placeholderCovers('units', 'freeColonist:balloonist')).toBe(false);
    expect(placeholderCovers('coast', 'edge')).toBe(false);
    expect(placeholderCovers('terrain', 'lava')).toBe(false);
    expect(placeholderCovers('buildings', 'stockade:4')).toBe(false);
    expect(placeholderCovers('buildings', 'stockade:3')).toBe(true);
    expect(PLACEHOLDER_CATEGORIES).not.toContain('coast');
  });

  it('counts a sprite as present when any candidate id is in the manifest', () => {
    const present = new Set(['terrain/plains', 'units/free-colonist__none', 'units/free-colonist__soldier']);
    const report = missingIds(placeholderPack, AMERICAS, (id) => present.has(id));
    const keys = report.missing.map((m) => `${m.category}/${m.key}`);
    expect(keys).not.toContain('terrain/plains');
    expect(keys).not.toContain('units/freeColonist:none');
    // An expert soldier falls back to the free colonist's soldier sprite: present.
    expect(keys).not.toContain('units/expertFarmer:soldier');
    expect(keys).toContain('units/expertFarmer:none');
    expect(keys).toContain('terrain/grassland');
  });

  it('reports, without failing, what the shipped procedural packs lack', () => {
    // The painted art is not in git: the sprite pipeline's local output is read when it is there, else every
    // id counts as missing and the report says what the art must cover.
    const manifest = Object.values(LOCAL_MANIFEST)[0];
    const has = (id: string) => !!manifest?.sprites[id];
    for (const scenario of [AMERICAS, CARIBBEAN]) {
      const report = missingIds(ligneClairePaintedPack, scenario, has);
      console.log(`${formatMissing(report)}${manifest ? '' : '\n  (no manifest at hand: every id counted as missing)'}`);
      expect(report.fallback).toBe('procedural');
      expect(report.uncovered).toEqual([]);
    }
  });
});

describe('placeholder hooks', () => {
  const store = new SpriteStore(null, NO_NETWORK);
  const painter = new Painter(store);
  const hooksFor = (pack: SpritePack) => createLayerHooks(completePack(pack), new SpriteIds(completePack(pack).mapping), painter, '#000');

  it.each(['americas', 'hex-test', 'hex-test-flat'])('draws every layer as a placeholder when sprites are missing (%s)', (scenario) => {
    const s = playedGame(scenario);
    const scene = sceneOf(s);
    const ph = hooksFor(placeholderPack);
    const proc = hooksFor({ ...placeholderPack, fallback: undefined });
    const ctx = recorder();
    ph.beginFrame!(ctx, scene);
    proc.beginFrame!(ctx, scene);
    const land = s.map.tiles.findIndex((t) => !TERRAIN[t.t].water);
    const water = s.map.tiles.findIndex((t) => TERRAIN[t.t].water);
    const tileAt = (i: number) => ({ x: i % s.map.width, y: Math.floor(i / s.map.width), px: 10, py: 10, tile: s.map.tiles[i] });
    const shape = () => ctx.rect(10, 10, 48, 48);
    expect(ph.land!(ctx, tileAt(land), 48, shape, s)).toBe(true);
    expect(ph.water!(ctx, tileAt(water), 48, shape)).toBe(true);
    expect(proc.land!(ctx, tileAt(land), 48, shape, s)).toBe(false);
    expect(proc.water!(ctx, tileAt(water), 48, shape)).toBe(false);
    const colony = Object.values(s.colonies)[0];
    expect(colony).toBeDefined();
    expect(ph.colony!(ctx, colony, 5, 0, 0, 48, s)).toBe(true);
    expect(proc.colony!(ctx, colony, 5, 0, 0, 48, s)).toBe(false);
    const road = s.map.tiles.findIndex((t) => t.r);
    if (road >= 0) {
      expect(ph.road!(ctx, tileAt(road), 48, s)).toBe(true);
      expect(proc.road!(ctx, tileAt(road), 48, s)).toBe(false);
    }
    const st = Object.values(s.settlements)[0];
    expect(ph.settlement!(ctx, st, 0, 0, 48, s)).toBe(true);
    expect(proc.settlement!(ctx, st, 0, 0, 48, s)).toBe(false);
    const unit = Object.values(s.units)[0];
    const stack = { x: 0, y: 0, top: unit, count: 1 } as never;
    expect(ph.unit!(ctx, stack, 20, 20, 40)).toBe(true);
    expect(proc.unit!(ctx, stack, 20, 20, 40)).toBe(false);
    expect(ph.brave!(ctx, { x: 0, y: 0, tribe: st.tribe, armed: true, mounted: false, count: 1 } as never, 20, 20, 40)).toBe(true);
    const forest = s.map.tiles.findIndex((t) => t.f && TERRAIN[t.t].forest);
    expect(ph.relief!(ctx, tileAt(forest), 48)).toBe(true);
    expect(ph.rumour!(ctx, tileAt(land), 48)).toBe(true);
    expect(ph.bonus!(ctx, tileAt(land), 48)).toBe(true);
    // Coast bands are never drawn on hexes; on squares only with their pieces.
    const before = ctx.calls.length;
    ph.shore!(ctx, [tileAt(water)], 48, s);
    if (gridOf(s).kind === 'hex') expect(ctx.calls.length).toBe(before);
  });
});

describe('the schematic renderer with layer hooks', () => {
  it.each(['americas', 'hex-test', 'hex-test-flat'])('offers every layer to its hooks (%s)', (scenario) => {
    const s = playedGame(scenario);
    const scene = sceneOf(s);
    const { hooks, count } = countingHooks();
    const ctx = recorder();
    schematic.createMapRenderer(fakeCanvas(ctx), hooks).render(scene);
    expect(count.beginFrame).toBe(1);
    expect(count.land).toBeGreaterThan(0);
    expect(count.water).toBeGreaterThan(0);
    expect(count.shore).toBe(1);
    expect(count.relief).toBeGreaterThan(0);
    expect(count.colony).toBeGreaterThan(0);
    expect(count.unit).toBeGreaterThan(0);
    // Every hook declined: the renderer drew the pieces itself (fills for the ground, arcs for the units).
    expect(ctx.calls.filter((c) => c === 'fill').length).toBeGreaterThan(count.land);
  });

  it.each(['americas', 'hex-test', 'hex-test-flat'])('renders the placeholder style without errors (%s)', (scenario) => {
    const s = playedGame(scenario);
    const ctx = recorder();
    const r = placeholder.createMapRenderer(fakeCanvas(ctx));
    r.render(sceneOf(s));
    r.render(sceneOf(s, 20));
    r.dispose();
    expect(ctx.calls.length).toBeGreaterThan(1000);
  });

  it('draws the placeholder icons for every kind', () => {
    const ctx = recorder();
    placeholder.drawIcon(ctx, { kind: 'unit', type: 'frigate', role: 'none', color: '#c00' }, 40);
    placeholder.drawIcon(ctx, { kind: 'unit', type: 'expertFarmer', role: 'soldier', color: '#c00' }, 40);
    placeholder.drawIcon(ctx, { kind: 'product', product: 'hammers' }, 40);
    placeholder.drawIcon(ctx, { kind: 'building', building: 'stockade', level: 2 }, 40);
    placeholder.drawIcon(ctx, { kind: 'tile', tile: { t: 'plains', f: true } as never }, 40);
    placeholder.drawIcon(ctx, { kind: 'father', id: AMERICAS.council.members[0], category: 'trade' }, 40);
    expect(placeholder.drawBackdrop!(ctx, 'congress-hall', 300, 200)).toBe(true);
    expect(ctx.calls).toContain('fillText');
  });

  it('keeps a procedural pack over the schematic style drawing the schematic pieces', () => {
    const style = createSpriteStyle({ ...placeholderPack, id: 'proc', fallback: undefined }, schematic, { base: null, env: NO_NETWORK });
    expect(style.grids).toEqual(['square', 'hex']);
    const ctx = recorder();
    style.drawIcon(ctx, { kind: 'product', product: 'hammers' }, 40);
    // The schematic icon: a dark square with two letters.
    expect(ctx.calls).toContain('fillRect');
  });
});
