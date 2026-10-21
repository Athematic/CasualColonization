/**
 * Drawing runtime sprites into a 2D context, in CSS pixels on a context already scaled by the
 * device pixel ratio. Every method returns false when it drew nothing (sprite missing or not yet
 * loaded), so the caller can draw the procedural version instead.
 */
import type { DrawableSprite, SpriteImage, SpriteStore } from './store.js';

/** The subset of CanvasRenderingContext2D the painter uses (keeps it testable without a DOM). */
export type PaintContext = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'translate' | 'rotate' | 'scale' | 'drawImage' | 'imageSmoothingEnabled' | 'imageSmoothingQuality'
>;

export interface SquareOptions {
  /** Full-bleed tile: must cover the box exactly. */
  fill?: boolean;
  /** Quarter turns clockwise (0..3). */
  rotate?: number;
  /** Only the part above (back) or below (front) the sprite's split line. */
  part?: 'back' | 'front';
  /** Mirror horizontally. */
  mirror?: boolean;
  /** Extra CSS px drawn on the right and bottom (full-bleed tiles overlap a little: no seams). */
  bleed?: number;
}

export class Painter {
  private tints = new Map<string, SpriteImage>();

  constructor(readonly store: SpriteStore) {}

  /** The sprite for a box of `size` CSS px at this pixel ratio, if it can be drawn now. */
  pick(ids: string | readonly string[], size: number, dpr: number, fill = false): DrawableSprite | undefined {
    return this.store.get(ids, size * dpr, fill);
  }

  /** Draws the sprite square into the box (x, y, size), centred when drawn a little smaller. */
  square(ctx: PaintContext, ids: string | readonly string[], x: number, y: number, size: number, dpr: number, opts: SquareOptions = {}): boolean {
    const d = this.pick(ids, size, dpr, opts.fill);
    if (!d) return false;
    this.drawSquare(ctx, d, d.image, x, y, size, dpr, opts);
    return true;
  }

  /**
   * Draws a sprite square of `size` CSS px so that its ground anchor (from the manifest; centre
   * when it has none) lands on (ax, ay).
   */
  anchored(ctx: PaintContext, ids: string | readonly string[], ax: number, ay: number, size: number, dpr: number, opts: SquareOptions = {}): boolean {
    const d = this.pick(ids, size, dpr);
    if (!d) return false;
    const a = d.sprite.anchor ?? { x: 0.5, y: 0.5 };
    this.drawSquare(ctx, d, d.image, ax - a.x * size, ay - a.y * size, size, dpr, { ...opts, anchor: a });
    return true;
  }

  /** A white-cloth overlay (pennant, flag, mission) tinted to a colour, keeping its ink. */
  tinted(ctx: PaintContext, ids: string | readonly string[], x: number, y: number, size: number, dpr: number, color: string): boolean {
    const d = this.pick(ids, size, dpr);
    if (!d) return false;
    const key = `${d.id}@${d.choice.size}|${color}`;
    let img = this.tints.get(key);
    if (!img) {
      img = tint(d.image, color) ?? undefined;
      if (!img) return false;
      this.tints.set(key, img);
    }
    this.drawSquare(ctx, d, img, x, y, size, dpr, {});
    return true;
  }

  private drawSquare(
    ctx: PaintContext,
    d: DrawableSprite,
    img: SpriteImage,
    x: number,
    y: number,
    size: number,
    dpr: number,
    opts: SquareOptions & { anchor?: { x: number; y: number } },
  ): void {
    const { choice } = d;
    const bleed = opts.bleed ?? 0;
    const dw = choice.draw / dpr + bleed;
    size += bleed;
    // A pixel size drawn at a whole-number scale may be a little smaller than the box: keep it
    // centred (or on its anchor), on whole device pixels so the pixels stay square.
    const ax = opts.anchor?.x ?? 0.5;
    const ay = opts.anchor?.y ?? 0.5;
    let dx = x + (size - dw) * ax;
    let dy = y + (size - dw) * ay;
    if (!choice.smoothing) {
      dx = Math.round(dx * dpr) / dpr;
      dy = Math.round(dy * dpr) / dpr;
    }
    let sy = 0;
    let sh = img.height;
    let oy = 0;
    let dh = dw;
    if (opts.part) {
      const split = d.sprite.split ?? 0.58;
      if (opts.part === 'back') {
        sh = Math.round(img.height * split);
      } else {
        sy = Math.round(img.height * split);
        sh = img.height - sy;
        oy = (sy / img.height) * dw;
      }
      dh = (sh / img.height) * dw;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = choice.smoothing;
    if (choice.smoothing) ctx.imageSmoothingQuality = 'high';
    const turns = ((opts.rotate ?? 0) % 4 + 4) % 4;
    if (turns || opts.mirror) {
      ctx.translate(dx + dw / 2, dy + dw / 2);
      if (turns) ctx.rotate((turns * Math.PI) / 2);
      if (opts.mirror) ctx.scale(-1, 1);
      ctx.drawImage(img, 0, sy, img.width, sh, -dw / 2, -dw / 2 + oy, dw, dh);
    } else {
      ctx.drawImage(img, 0, sy, img.width, sh, dx, dy + oy, dw, dh);
    }
    ctx.restore();
  }
}

/** Multiply a white-cloth image by a colour, then restore its alpha. Null without a DOM. */
export function tint(img: SpriteImage, color: string): SpriteImage | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  return c;
}
