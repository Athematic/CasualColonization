/**
 * Synthetic stand-ins for the terrain tiles and transition pieces, drawn with canvas 2D, for demos
 * and manual checks before the real art exists (browser only; the unit tests need no pixels).
 * The geometry follows docs/SPRITE_PROMPTS.md section 4.8a: a band 20% deep where it meets the
 * tile edges, an irregular inner boundary within 16-25%, an unturned piece pointing north / north-west.
 */
import type { DrawableSprite } from '../../src/store.js';

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

function bandPath(g: CanvasRenderingContext2D, turnsLeft: boolean): void {
  // Depth along the edge: 20% at both ends, wandering between 16% and 25% in between.
  const depth = (t: number) => S * (0.2 + 0.045 * Math.sin(3 * Math.PI * t) * Math.sin(Math.PI * t) ** 0.5);
  g.save();
  if (turnsLeft) {
    // The band along the left edge: the north band turned a quarter turn anticlockwise.
    g.translate(0, S);
    g.rotate(-Math.PI / 2);
  }
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(S, 0);
  for (let i = S; i >= 0; i -= 4) g.lineTo(i, depth(i / S));
  g.closePath();
  g.restore();
}

function edgePiece(base: string, line: string): HTMLCanvasElement {
  const [c, g] = canvas();
  bandPath(g, false);
  g.fillStyle = base;
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= S; i += 4) {
    const y = S * (0.2 + 0.045 * Math.sin(3 * Math.PI * (i / S)) * Math.sin(Math.PI * (i / S)) ** 0.5);
    if (i === 0) g.moveTo(i, y);
    else g.lineTo(i, y);
  }
  g.stroke();
  return c;
}

function innerPiece(base: string, line: string): HTMLCanvasElement {
  const [c, g] = canvas();
  g.fillStyle = base;
  bandPath(g, false);
  g.fill();
  bandPath(g, true);
  g.fill();
  // Round the inside corner a little.
  g.beginPath();
  g.arc(S * 0.22, S * 0.22, S * 0.09, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(S * 0.2, S);
  g.lineTo(S * 0.2, S * 0.3);
  g.quadraticCurveTo(S * 0.2, S * 0.2, S * 0.3, S * 0.2);
  g.lineTo(S, S * 0.2);
  g.stroke();
  return c;
}

function outerPiece(base: string, line: string): HTMLCanvasElement {
  const [c, g] = canvas();
  g.beginPath();
  g.moveTo(0, 0);
  for (let a = 0; a <= 90; a += 6) {
    const r = S * (0.28 + 0.02 * Math.sin((a / 90) * 3 * Math.PI));
    g.lineTo(r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180));
  }
  g.closePath();
  g.fillStyle = base;
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.stroke();
  return c;
}

/** A SpriteStore stand-in serving `terrain/<t>` and `terrain/blend__<t>__edge|inner|outer` for the given terrains. */
export function syntheticStore(terrains: readonly string[], blendTerrains: readonly string[]) {
  const images = new Map<string, HTMLCanvasElement>();
  for (const t of terrains) images.set(`terrain/${t}`, groundTile(SYNTHETIC_COLOURS[t].base, SYNTHETIC_COLOURS[t].line));
  for (const t of blendTerrains) {
    const { base, line } = SYNTHETIC_COLOURS[t];
    images.set(`terrain/blend__${t}__edge`, edgePiece(base, line));
    images.set(`terrain/blend__${t}__inner`, innerPiece(base, line));
    images.set(`terrain/blend__${t}__outer`, outerPiece(base, line));
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
