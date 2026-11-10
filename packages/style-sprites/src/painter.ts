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

  /**
   * Draws a (not necessarily square) sprite into the box (x, y, w, h) keeping its proportions: contained and centred,
   * or `cover` to fill the box exactly (cropping the overflow). `square` crops a centred square from the top of the image,
   * starting `top` of its height down and `side` of its height wide: the head of a full-length figure.
   */
  fitted(ctx: PaintContext, ids: string | readonly string[], x: number, y: number, w: number, h: number, dpr: number, opts: { cover?: boolean; head?: { top: number; side: number } } = {}): boolean {
    const d = this.pick(ids, Math.max(w, h), dpr, opts.cover);
    if (!d) return false;
    const img = d.image;
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    if (opts.head && !d.id.endsWith('__head')) {
      sh = Math.min(img.height, img.height * opts.head.side);
      sw = Math.min(img.width, sh);
      sx = (img.width - sw) / 2;
      sy = Math.min(img.height - sh, img.height * opts.head.top);
    }
    const k = opts.cover ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * k;
    const dh = sh * k;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (opts.cover) {
      // Only the part inside the box: clip through the source rectangle instead of a clip path.
      const vw = Math.min(sw, w / k);
      const vh = Math.min(sh, h / k);
      ctx.drawImage(img, sx + (sw - vw) / 2, sy + (sh - vh) / 2, vw, vh, x, y, vw * k, vh * k);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    ctx.restore();
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
