/**
 * The hidden hex test scenarios (docs/design/hex-maps.md, step 1): the Americas' rules on a
 * generated map of hexagons, one per orientation, for tests, tournaments and the speed check before
 * Vinland exists. Not on the New game screen (`hidden`), and no stored maps: a hex map is generated.
 *
 * Their colonies reach a second ring of tiles from five colonists (H7's proposal for Vinland), so
 * the larger work area and the job search on 18 tiles are played too.
 */
import { AMERICAS } from './americas.js';
import type { Scenario } from './types.js';

function hexTest(id: string, orientation: 'pointy' | 'flat'): Scenario {
  return {
    ...AMERICAS,
    id,
    version: 1,
    name: `Hex test (${orientation}-top)`,
    description: `The Americas' rules on a generated map of ${orientation}-top hexagons, for tests.`,
    hidden: true,
    map: {
      ...AMERICAS.map,
      grid: 'hex',
      hex: { orientation },
      workArea: { rings: [{}, { size: 5 }] },
      stored: [],
      default: 'generated',
    },
  };
}

/** Pointy-top hexes in offset rows (Vinland's proposed layout). */
export const HEX_TEST = hexTest('hex-test', 'pointy');

/** Flat-top hexes in offset columns. */
export const HEX_TEST_FLAT = hexTest('hex-test-flat', 'flat');
