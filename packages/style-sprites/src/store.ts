/**
 * Loads the runtime sprite set made by tools/sprite-pipeline: `manifest.json` once, then single
 * images lazily, per id and size, the first time something asks for them. Nothing here ever blocks
 * or throws: until the manifest and an image have arrived (or when they never do: offline, a
 * missing file, a CORS refusal) `image()` returns undefined and the caller draws the procedural
 * Ligne claire version instead. Listeners hear about arrivals, batched, so views can redraw.
 */
import { chooseSize, type SizeChoice } from './sizes.js';

export interface ManifestFile {
  file: string;
  mode: 'pixel' | 'smooth';
}

export interface ManifestSprite {
  category: string;
  layout: string;
  /** Ground point as shares of the square. */
  anchor?: { x: number; y: number };
  /** Back/front split line of an enclosure (stockade, fort), share of the square from the top. */
  split?: number;
  source?: { sha256?: string };
  files: Record<string, ManifestFile>;
}

export interface SpriteManifest {
  format?: string;
  sizes: number[];
  pixelSizes: number[];
  smoothSizes: number[];
  sprites: Record<string, ManifestSprite>;
}

/** Anything drawImage accepts that knows its size. */
export type SpriteImage = CanvasImageSource & { width: number; height: number };

export interface StoreEnv {
  fetchJson(url: string): Promise<unknown>;
  loadImage(url: string): Promise<SpriteImage>;
  /** Runs `fn` soon (batching notifications). */
  defer(fn: () => void): void;
}

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'off';

export interface DrawableSprite {
  id: string;
  image: SpriteImage;
  choice: SizeChoice;
  sprite: ManifestSprite;
}

export class SpriteStore {
  status: StoreStatus;
  manifest?: SpriteManifest;
  private images = new Map<string, SpriteImage | 'loading' | 'failed'>();
  private listeners = new Set<() => void>();
  private pending = false;

  /** `base` is the folder holding manifest.json (with a trailing slash); null switches sprites off. */
  constructor(
    readonly base: string | null,
    private env: StoreEnv,
    private opts: { manifest?: string; sizes?: { pixel?: readonly number[]; smooth?: readonly number[] } } = {},
  ) {
    this.status = base === null ? 'off' : 'idle';
  }

  /** Starts loading the manifest (once). Safe to call any number of times. */
  start(): void {
    if (this.status !== 'idle' || this.base === null) return;
    this.status = 'loading';
    this.env
      .fetchJson(this.base + (this.opts.manifest ?? 'manifest.json'))
      .then((json) => {
        const m = json as Partial<SpriteManifest> | null;
        if (!m || typeof m !== 'object' || !m.sprites || typeof m.sprites !== 'object') throw new Error('not a sprite manifest');
        const sizes = (m.sizes ?? []).filter((n) => typeof n === 'number');
        const pixelMax = (m as { pixelMax?: number }).pixelMax ?? 32;
        const only = this.opts.sizes;
        const pick = (list: number[], allowed?: readonly number[]) => (allowed ? list.filter((n) => allowed.includes(n)) : list);
        this.manifest = {
          format: m.format,
          sizes,
          pixelSizes: pick(m.pixelSizes ?? sizes.filter((n) => n <= pixelMax), only?.pixel),
          smoothSizes: pick(m.smoothSizes ?? sizes.filter((n) => n > pixelMax), only?.smooth),
          sprites: m.sprites,
        };
        this.status = 'ready';
        this.notify();
      })
      .catch(() => {
        this.status = 'failed';
      });
  }

  has(id: string): boolean {
    return !!this.manifest?.sprites[id];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * The first candidate that is in the manifest, at the size for `device` device pixels, if its
   * image has loaded. Asks for it otherwise (and for the manifest, before that).
   */
  get(ids: string | readonly string[], device: number, fill = false): DrawableSprite | undefined {
    if (this.status === 'idle') this.start();
    const m = this.manifest;
    if (!m) return undefined;
    for (const id of typeof ids === 'string' ? [ids] : ids) {
      if (!this.has(id)) continue;
      const sprite = m.sprites[id];
      const set = availableSizes(m, sprite);
      const choice = chooseSize(set, device, fill);
      if (!choice) continue;
      const image = this.image(id, sprite, choice.size);
      if (image) return { id, image, choice, sprite };
      // Not loaded yet, or failed: try the next candidate, but only if it has already loaded,
      // so a fallback does not flash in for a moment while the first choice is on its way.
      if (this.images.get(this.key(id, choice.size)) === 'loading') return undefined;
    }
    return undefined;
  }

  private key(id: string, size: number): string {
    return `${id}@${size}`;
  }

  private image(id: string, sprite: ManifestSprite, size: number): SpriteImage | undefined {
    const key = this.key(id, size);
    const have = this.images.get(key);
    if (have === 'failed' || have === 'loading') return undefined;
    if (have) return have;
    const file = sprite.files[size];
    if (!file) {
      this.images.set(key, 'failed');
      return undefined;
    }
    this.images.set(key, 'loading');
    const v = sprite.source?.sha256 ? `?v=${sprite.source.sha256.slice(0, 8)}` : '';
    this.env
      .loadImage(this.base + file.file + v)
      .then((img) => {
        this.images.set(key, img);
        this.notify();
      })
      .catch(() => {
        this.images.set(key, 'failed');
        // A failed first choice lets a fallback candidate in: redraw.
        this.notify();
      });
    return undefined;
  }

  private notify(): void {
    if (this.pending) return;
    this.pending = true;
    this.env.defer(() => {
      this.pending = false;
      for (const fn of this.listeners) fn();
    });
  }
}

/** The sizes this sprite actually has files for. */
function availableSizes(m: SpriteManifest, sprite: ManifestSprite) {
  const has = (n: number) => !!sprite.files[n];
  return { pixelSizes: m.pixelSizes.filter(has), smoothSizes: m.smoothSizes.filter(has) };
}
