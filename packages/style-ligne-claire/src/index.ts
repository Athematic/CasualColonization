import { TERRAIN, type Tile } from '@cc/engine';
import type { IconRequest, StylePlugin } from '@cc/render-api';
import { INK, LAND, PAPER } from './palette.js';
import { LigneClaireMapRenderer, lineWidthFor } from './renderer.js';
import { FONT, house, productIcon, unitSprite } from './sprites.js';

function drawIcon(ctx: CanvasRenderingContext2D, icon: IconRequest, size: number): void {
  const lw = lineWidthFor(size) * 1.1;
  const c = size / 2;
  switch (icon.kind) {
    case 'unit':
      unitSprite(ctx, c, c + size * 0.04, size * 0.92, icon.type, icon.role, icon.nation, lw);
      break;
    case 'product':
      productIcon(ctx, c, c, size, icon.product, lw);
      break;
    case 'building':
      house(ctx, c, size * 0.86, size * 0.62, lw, icon.level > 1 ? '#3a6fb0' : undefined);
      break;
    case 'tile':
      ctx.fillStyle = tileColor(icon.tile);
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(lw / 2, lw / 2, size - lw, size - lw);
      break;
  }
}

function tileColor(tile: Tile): string {
  if (tile.f && !TERRAIN[tile.t].water) return '#5f9f4c';
  return LAND[tile.t];
}

export const ligneClaire: StylePlugin = {
  id: 'ligne-claire',
  name: 'Ligne claire',
  description: 'Clean, even ink lines and flat, bright colours in the tradition of the Franco-Belgian comic.',
  stylesheets: ['https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Fredoka:wght@700&display=swap'],
  theme: {
    '--paper': PAPER,
    '--ink': INK,
    '--panel': '#fffaf0',
    '--panel-ink': INK,
    '--accent': '#d23c2a',
    '--accent-ink': '#fffaf0',
    '--muted': '#6b665c',
    '--line': INK,
    '--font': FONT,
    '--heading-font': FONT,
    '--line-width': '2px',
    '--radius': '10px',
  },
  createMapRenderer: (canvas) => new LigneClaireMapRenderer(canvas),
  drawIcon,
  tileColor,
};

export default ligneClaire;
