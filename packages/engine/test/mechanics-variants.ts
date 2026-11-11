/**
 * Test-only copies of the Americas with mechanics switched off, registered on import, for
 * mechanics.test.ts and mechanics-game.test.ts.
 */
import { AMERICAS, registerScenario, type Mechanics, type Scenario } from '../src/index.js';

/** A copy of the Americas with some mechanics off (and no independence victory without independence). */
function variant(id: string, off: Partial<Mechanics>): Scenario {
  const mechanics = { ...AMERICAS.mechanics, ...off };
  const scenario: Scenario = {
    ...AMERICAS,
    id,
    name: id,
    mechanics,
    victory: mechanics.independence ? AMERICAS.victory : [{ id: 'time' }],
  };
  registerScenario(scenario);
  return scenario;
}

variant('test-no-taxes', { taxes: false });
variant('test-no-boycotts', { boycotts: false });
variant('test-no-demands', { demands: false });
variant('test-no-royal-wars', { royalWars: false });
variant('test-no-ref', { ref: false });
variant('test-no-independence', { independence: false });
variant('test-no-favoured', { favoured: false });
variant('test-no-charter', { charter: false });
variant('test-no-custom-house', { customHouse: false });
variant('test-no-missions', { missions: false });
variant('test-all-off', {
  taxes: false, boycotts: false, demands: false, royalWars: false, ref: false,
  independence: false, favoured: false, charter: false, customHouse: false, missions: false, alliances: false, companies: false,
});
