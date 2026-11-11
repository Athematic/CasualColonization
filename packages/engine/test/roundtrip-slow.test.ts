import { describe, expect, it } from 'vitest';
import { SLOW, compare, webConfig } from './roundtrip.js';

describe('save and load do not change a game: longer games', () => {
  it.skipIf(!SLOW)('250 rounds (CC_SLOW_TESTS=1)', () => {
    for (const scenario of ['americas', 'caribbean']) for (const seed of [1492, 99]) expect(compare(webConfig(seed, scenario, true), 250), `${scenario} ${seed}`).toBeNull();
  }, 1_200_000);
});
