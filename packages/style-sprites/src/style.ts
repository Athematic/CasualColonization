/**
 * createSpriteStyle: a StylePlugin from a sprite pack, drawn over a fallback style.
 *
 * The map is the fallback's own renderer, given MapLayerHooks that paint the pack's sprites into
 * its layers (renderers without hook support just draw themselves). Icons try the pack first and
 * hand anything else to the fallback's drawIcon. Nothing is fetched until the style is used; the
 * manifest and images then load in the background, and views redraw as they arrive.
 */
import { NATIONS, UNIT_TYPES } from '@cc/engine';
import type { IconRequest, MapRenderer, Scene, StylePlugin } from '@cc/render-api';
import { SpriteIds } from './ids.js';
import { createLayerHooks } from './layers.js';
import { completePack, type SpritePack } from './pack.js';
import { Painter } from './painter.js';
import { browserEnv, spriteBase } from './source.js';
import { SpriteStore, type StoreEnv } from './store.js';

export interface SpriteStyleOptions {
  /** Network access (default: the browser's fetch and <img>). */
  env?: StoreEnv;
  /** Sprite folder, overriding the pack's source and any ?sprites= setting; null: procedural only. */
  base?: string | null;
}

/** Device pixels per CSS pixel of a context (the shell scales icon contexts by the pixel ratio). */
function contextScale(ctx: CanvasRenderingContext2D): number {
  try {
    const m = ctx.getTransform();
    return Math.hypot(m.a, m.b) || 1;
  } catch {
    return 1;
  }
}

function resolveBase(pack: SpritePack): string | null {
  let storage: Storage | undefined;
  try {
    storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    storage = undefined;
  }
  if (typeof location === 'undefined') return null;
  return spriteBase(location.search, storage, { base: pack.source.base, param: pack.source.queryParam, storageKey: pack.source.storageKey });
}

/** A pack's CSS files as URLs: relative paths sit in the sprite folder (skipped when sprites are off). */
export function packCssUrls(files: readonly string[] | undefined, base: string | null): string[] {
  const out: string[] = [];
  for (const f of files ?? []) {
    if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(f)) out.push(f);
    else if (base !== null) out.push(base + f);
  }
  return out;
}

export function createSpriteStyle(input: SpritePack, fallback: StylePlugin, opts: SpriteStyleOptions = {}): StylePlugin {
  const pack = completePack(input);
  const ids = new SpriteIds(pack.mapping);
  const theme = pack.theme === 'inherit' ? fallback.theme : pack.theme;
  const ink = theme['--ink'];
  const procedural = new Set(pack.procedural ?? []);
  let painter: Painter | undefined;

  /** Created on first use, so a style that is never chosen loads nothing. */
  const getPainter = (): Painter => {
    if (!painter) {
      const base = opts.base !== undefined ? opts.base : resolveBase(pack);
      painter = new Painter(new SpriteStore(base, opts.env ?? browserEnv(), { manifest: pack.source.manifest, sizes: pack.source.sizes }));
    }
    return painter;
  };

  function createMapRenderer(canvas: HTMLCanvasElement): MapRenderer {
    const p = getPainter();
    p.store.start();
    const inner = fallback.createMapRenderer(canvas, createLayerHooks(pack, ids, p, ink));
    let last: Scene | undefined;
    let frame = 0;
    let disposed = false;
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (fn: () => void) => (fn(), 0);
    const caf = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : () => {};
    // Images arrive after the frame that asked for them: draw the last frame again.
    const unsubscribe = p.store.subscribe(() => {
      if (disposed || !last || frame) return;
      frame = raf(() => {
        frame = 0;
        if (!disposed && last) inner.render(last);
      });
    });
    return {
      render(scene) {
        last = scene;
        if (frame) caf(frame);
        frame = 0;
        inner.render(scene);
      },
      dispose() {
        disposed = true;
        unsubscribe();
        if (frame) caf(frame);
        inner.dispose();
      },
    };
  }

  function drawIcon(ctx: CanvasRenderingContext2D, icon: IconRequest, size: number): void {
    if (!procedural.has('icons') && drawSpriteIcon(ctx, icon, size)) return;
    fallback.drawIcon(ctx, icon, size);
  }

  function drawSpriteIcon(ctx: CanvasRenderingContext2D, icon: IconRequest, size: number): boolean {
    const p = getPainter();
    const dpr = contextScale(ctx);
    switch (icon.kind) {
      case 'unit': {
        const r = pack.rules.unitIcon;
        const box = size * r.scale;
        if (!p.square(ctx, ids.unit(icon.type, icon.role), (size - box) / 2, (size - box) / 2, box, dpr)) return false;
        // Sprites are nation-neutral: the owner's pennant on ships, soldiers and artillery.
        const kind = UNIT_TYPES[icon.type].kind;
        const military = icon.role === 'soldier' || icon.role === 'dragoon';
        const flies = (kind === 'ship' && icon.type !== 'privateer') || (kind === 'colonist' && military) || kind === 'artillery';
        if (flies && r.pennant && size >= r.pennant.minIcon) p.tinted(ctx, ids.overlay('pennant'), 0, 0, size * r.pennant.size, dpr, NATIONS[icon.nation].color);
        return true;
      }
      case 'product':
        return p.square(ctx, ids.good(icon.product), 0, 0, size, dpr);
      case 'building':
        return p.square(ctx, ids.building(icon.building, icon.level), 0, 0, size, dpr);
      case 'tile': {
        if (!p.square(ctx, ids.terrain(icon.tile), 0, 0, size, dpr, { fill: true })) return false;
        const lw = Math.max(1.1, size * 0.035);
        ctx.strokeStyle = ink;
        ctx.lineWidth = lw;
        ctx.strokeRect(lw / 2, lw / 2, size - lw, size - lw);
        return true;
      }
    }
  }

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    theme,
    stylesheets: pack.stylesheets === 'inherit' || pack.stylesheets === undefined ? fallback.stylesheets : pack.stylesheets,
    css: [pack.fallbackCss === false ? undefined : fallback.css, pack.css].filter(Boolean).join('\n') || undefined,
    // A getter: the sprite folder can change with ?sprites= between page loads.
    get cssUrls() {
      const base = opts.base !== undefined ? opts.base : resolveBase(pack);
      return [...(pack.fallbackCss === false ? [] : fallback.cssUrls ?? []), ...packCssUrls(pack.cssFiles, base)];
    },
    createMapRenderer,
    drawIcon,
    tileColor: (tile) => fallback.tileColor(tile),
    onAssetsChanged: (listener) => getPainter().store.subscribe(listener),
  };
}
