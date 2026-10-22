/**
 * Sprite-based styles: a style is a *sprite pack* (data: where the runtime sprites are, how game
 * concepts map to sprite ids, how they sit on a tile) drawn over a procedural *fallback* style,
 * which also draws whatever the pack lacks. See docs/STYLE_PLUGINS.md, "Sprite packs".
 *
 *   import { createSpriteStyle } from '@cc/style-sprites';
 *   registerStyle(createSpriteStyle(myPack, ligneClaire));
 *
 * The packs that ship with the game are in ../packs.
 */
export { createSpriteStyle, packCssUrls, type SpriteStyleOptions } from './style.js';
export {
  completePack,
  DEFAULT_MAPPING,
  DEFAULT_RULES,
  extendPack,
  mergeDeep,
  type DrawRules,
  type IdSlot,
  type PackLayer,
  type PackOverrides,
  type Placement,
  type SpriteMapping,
  type SpritePack,
  type SpriteSource,
} from './pack.js';
export { fill, kebab, SpriteIds } from './ids.js';
export { chooseSize, type SizeChoice, type SizeSet } from './sizes.js';
export { SpriteStore, type SpriteManifest, type StoreEnv } from './store.js';
export { DEFAULT_SPRITE_BASE, spriteBase } from './source.js';
