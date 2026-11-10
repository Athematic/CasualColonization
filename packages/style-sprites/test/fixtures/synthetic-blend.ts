/**
 * Synthetic stand-ins for the terrain tiles and transition pieces, drawn with canvas 2D, for demos
 * and manual checks before the real art exists (browser only; the unit tests need no pixels).
 * The geometry is in synthetic-geometry.ts and follows docs/SPRITE_PROMPTS.md section 4.8a: flat bands
 * with no outline, 20% deep, an unturned piece pointing north / north-west.
 */
import type { DrawableSprite } from '../../src/store.js';
import { BAND, FILLET, bandDepth } from './synthetic-geometry.js';

export const SYNTHETIC_COLOURS: Record<string, { base: string; line: string }> = {
  desert: { base: '#f4e3ae', line: '#d7c899' },
  tundra: { base: '#d5dcc8', line: '#bbc2b0' },
  savannah: { base: '#e4cd6e', line: '#c9b461' },
  plains: { base: '#cfe39a', line: '#b6c888' },
  prairie: { base: '#ecdc8e', line: '#d0c27d' },
  grassland: { base: '#a6d878', line: '#92be6a' },
  ocean: { base: '#8ed0ec', line: '#3a80b4' },
};

const S = 128;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return [c, c.getContext('2d')!];
}

/** The flat ground tile with a few motifs well inside the edges. */
export function groundTile(base: string, line: string): HTMLCanvasElement {
  const [c, g] = canvas();
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (const [x, y] of [[40, 44], [84, 52], [58, 86], [90, 94], [34, 80]]) {
    g.beginPath();
    g.moveTo(x - 4, y);
    g.lineTo(x, y - 7);
    g.lineTo(x + 4, y);
    g.stroke();
  }
  return c;
}

/** A filled shape from the pure geometry: `path` traces it in unit coordinates scaled to the canvas. */
function fillShape(base: string, trace: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const [c, g] = canvas();
  g.fillStyle = base;
  g.beginPath();
  trace(g);
  g.fill();
  return c;
}

/** The band along the top (turned = the same band along the left), one point per pixel column. */
function band(g: CanvasRenderingContext2D, turned: boolean): void {
  g.save();
  if (turned) {
    g.translate(0, S);
    g.rotate(-Math.PI / 2);
  }
  g.moveTo(-1, -1);
  g.lineTo(S + 1, -1);
  for (let i = S; i >= 0; i--) g.lineTo(i, bandDepth(i / S) * S);
  g.lineTo(-1, BAND * S);
  g.closePath();
  g.restore();
}

function edgePiece(base: string): HTMLCanvasElement {
  return fillShape(base, (g) => band(g, false));
}

function innerPiece(base: string): HTMLCanvasElement {
  return fillShape(base, (g) => {
    band(g, false);
    band(g, true);
    // The fillet: the square in the concave corner minus the disc tangent to both boundaries
    // (it starts a pixel inside the bands, so there is no seam).
    const d = BAND * S;
    const r = FILLET * S;
    g.moveTo(d - 1, d - 1);
    g.lineTo(d + r, d - 1);
    g.lineTo(d + r, d);
    g.arc(d + r, d + r, r, -Math.PI / 2, Math.PI, true);
    g.lineTo(d - 1, d + r);
    g.closePath();
  });
}

function outerPiece(base: string): HTMLCanvasElement {
  return fillShape(base, (g) => {
    g.moveTo(0, 0);
    g.arc(0, 0, BAND * S, 0, Math.PI / 2);
    g.closePath();
  });
}

/** A SpriteStore stand-in serving `terrain/<t>` and `terrain/blend__<t>__edge|inner|outer` for the given terrains. */
export function syntheticStore(terrains: readonly string[], blendTerrains: readonly string[]) {
  const images = new Map<string, HTMLCanvasElement>();
  for (const t of terrains) images.set(`terrain/${t}`, groundTile(SYNTHETIC_COLOURS[t].base, SYNTHETIC_COLOURS[t].line));
  for (const t of blendTerrains) {
    const { base } = SYNTHETIC_COLOURS[t];
    images.set(`terrain/blend__${t}__edge`, edgePiece(base));
    images.set(`terrain/blend__${t}__inner`, innerPiece(base));
    images.set(`terrain/blend__${t}__outer`, outerPiece(base));
  }
  return {
    get(ids: string | readonly string[], size: number): DrawableSprite | undefined {
      for (const id of [ids].flat()) {
        const image = images.get(id);
        if (image) return { id, image, choice: { size: S, mode: 'smooth', draw: size, smoothing: true }, sprite: { category: 'terrain', layout: 'fullbleed', files: {} } };
      }
      return undefined;
    },
  };
}
