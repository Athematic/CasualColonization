/**
 * Placeholder: a sprite pack with no images at all (docs/design/hex-maps.md H15, Beta 4 step 5). Every sprite is
 * "missing", and `fallback: 'placeholder'` draws each as a plain placeholder (src/placeholder.ts): a flat colour per
 * terrain, simple silhouettes for forests, hills, mountains, towns, settlements, units and braves, and labelled
 * shapes for icons. It is drawn over the schematic style, which draws squares and hexes, so this is the sprite
 * style that plays hex maps until hex terrain sprites exist (Beta 5 or 6). The schematic style keeps the rivers,
 * the hex coastline, fog, captions, the route and the badges.
 *
 * It also shows the other end of a pack's range: what a pack with art drawn over `fallback: 'placeholder'`
 * looks like where the art is missing, and the shapes the missing-ids check (src/missing.ts) reports against.
 */
import schematic from '@cc/style-schematic';
import { createSpriteStyle } from '../src/style.js';
import { DEFAULT_MAPPING, DEFAULT_RULES, type SpritePack } from '../src/pack.js';

export const placeholderPack: SpritePack = {
  id: 'placeholder',
  name: 'Placeholder',
  description: 'Flat colours and simple shapes, with no pictures at all. Draws square and hex maps; a stand-in until hex terrain art exists.',
  theme: 'inherit',
  stylesheets: 'inherit',
  // No images: nothing is fetched, and no ?sprites= setting changes that.
  source: { base: null },
  mapping: DEFAULT_MAPPING,
  rules: DEFAULT_RULES,
  procedural: [],
  fallback: 'placeholder',
};

export const placeholder = createSpriteStyle(placeholderPack, schematic);
export default placeholder;
