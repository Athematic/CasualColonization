import type { StoredMap } from './index.js';
import { northEast } from './north-east.js';

/**
 * The North-east on pointy-top hexagons (Beta 4 step 4; docs/design/hex-maps.md H11, H21).
 *
 * Converted from Beta 3's square North-east map (`north-east.ts`, 84×74) and audited with
 * `scripts/convert-hex-map.ts`:
 *   - All 15 water components (Strait of Belle Isle, St. Lawrence estuary, Lake Melville narrows,
 *     Long Island Sound, Great Lakes, etc.) and all 9 land components stay intact on HEX_POINTY
 *     with zero splits and zero merges.
 *   - 30 of 31 rivers fit as-is on HEX_POINTY; the Kennebec was given an explicit waypoint at
 *     31,58 so its final step stays on land instead of clipping water at 32,58.
 *
 * Kept as its own stored map so Beta 3's square North-east game stays bit-identical.
 */
export const northEastHex: StoredMap = {
  ...northEast,
  id: 'north-east-hex',
  name: 'The North-east (hex)',
  description:
    'Pointy-top hex copy of the North-east map: Newfoundland and Labrador, the Gulf and valley of the St. Lawrence, the Maritimes, New England, and the eastern Great Lakes.',
  rivers: northEast.rivers!.replace(
    'Kennebec: 32,51 32,52 31,52 31,55 32,55 32,57 31,57 31,59',
    'Kennebec: 32,51 32,52 31,52 31,55 32,55 32,57 31,57 31,58 31,59',
  ),
};
