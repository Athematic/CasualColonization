/**
 * Ligne claire (painted): the first sprite pack. The painted ligne claire art from
 * docs/SPRITE_PROMPTS.md, generated with tools/image-gen, processed by tools/sprite-pipeline and
 * served from assets/runtime/ (https://casual.spence.dk/assets/runtime/). Ligne claire draws
 * everything the pack lacks, and the rivers, coastline, fog, captions and markers.
 *
 * It uses the default id scheme and draw rules unchanged; a pack for other art, or a scenario's
 * variant of this one (see extendPack), only lists what differs.
 */
import ligneClaire from '@cc/style-ligne-claire';
import { createSpriteStyle } from '../src/style.js';
import { DEFAULT_MAPPING, DEFAULT_RULES, type SpritePack } from '../src/pack.js';

export const ligneClairePaintedPack: SpritePack = {
  id: 'ligne-claire-painted',
  name: 'Ligne claire (painted)',
  description: 'Ligne claire with painted sprites for the land, units, towns and goods. Where a picture is missing or offline, the drawn style fills in.',
  theme: 'inherit',
  stylesheets: 'inherit',
  source: {
    base: 'assets/runtime/',
    manifest: 'manifest.json',
    queryParam: 'sprites',
    storageKey: 'cc.sprites',
  },
  mapping: DEFAULT_MAPPING,
  rules: DEFAULT_RULES,
  // Everything with art is painted. (Rivers have no sprites and always stay procedural.)
  procedural: [],
};

export const ligneClairePainted = createSpriteStyle(ligneClairePaintedPack, ligneClaire);
export default ligneClairePainted;
