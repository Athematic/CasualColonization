/**
 * Where a pack's runtime sprites come from, and the browser side of loading them.
 *
 * The pack names a default folder (the standard pack: `assets/runtime/` next to the page, which
 * is where `npm run release` and the server put them). A query parameter overrides it and is
 * remembered in localStorage (parameter and key are per pack; the defaults are shown):
 *
 *   ?sprites=https://casual.spence.dk/assets/runtime/   load from there (needs CORS when cross-origin)
 *   ?sprites=off                                          procedural drawing only
 *   ?sprites=default                                      forget the override
 */
import type { SpriteImage, StoreEnv } from './store.js';

export const DEFAULT_SPRITE_BASE = 'assets/runtime/';

export interface BaseOptions {
  /** The pack's folder when nothing overrides it. */
  base?: string;
  param?: string;
  storageKey?: string;
}

/** Normalises a configured value: null means off; a folder URL gets its trailing slash. */
export function normaliseBase(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return undefined;
  const v = value.trim();
  if (!v || v === 'default') return undefined;
  if (v === 'off' || v === 'none') return null;
  return v.endsWith('/') ? v : v + '/';
}

/** The configured sprite base: query parameter, then saved setting, then the default. */
export function spriteBase(search: string, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, opts: BaseOptions = {}): string | null {
  const STORAGE_KEY = opts.storageKey ?? 'cc.sprites';
  const DEFAULT = normaliseBase(opts.base ?? DEFAULT_SPRITE_BASE) ?? DEFAULT_SPRITE_BASE;
  const param = new URLSearchParams(search).get(opts.param ?? 'sprites');
  if (param !== null) {
    const base = normaliseBase(param);
    try {
      if (base === undefined) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, base ?? 'off');
    } catch {
      // Storage may be unavailable; the override then lasts for this page only.
    }
    return base === undefined ? DEFAULT : base;
  }
  let saved: string | null = null;
  try {
    saved = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    saved = null;
  }
  const base = normaliseBase(saved);
  return base === undefined ? DEFAULT : base;
}

/** Browser loading: fetch with a timeout for the manifest, CORS-enabled <img> for the images. */
export function browserEnv(timeoutMs = 10_000): StoreEnv {
  return {
    async fetchJson(url) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl?.signal, cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    loadImage(url) {
      return new Promise<SpriteImage>((resolve, reject) => {
        const img = new Image();
        // Anonymous CORS: a server without Access-Control-Allow-Origin makes the load fail (and
        // we fall back) instead of tainting the canvas, which would break the icon cache.
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`could not load ${url}`));
        img.src = url;
      });
    },
    defer(fn) {
      // Batch arrivals: one redraw per burst rather than one per image.
      setTimeout(fn, 60);
    },
  };
}
