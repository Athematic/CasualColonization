/**
 * Vinland, around 1000 (Beta 4 step 4; docs/design/hex-maps.md H21).
 *
 * Tests the hex-only Vinland scenario on both `north-east-hex` and `vinland-atlantic`,
 * the Thing council, the Norse departure/thriving check, and T17 isolation.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  CARIBBEAN,
  createGame,
  departureYearFor,
  deserialize,
  endTurn,
  gridOf,
  HEX_POINTY,
  isThriving,
  NORTH_EAST,
  processDepartures,
  serialize,
  VINLAND,
} from '../../src/index.js';

describe('Vinland, around 1000 (Beta 4 step 4)', () => {
  it('registers as a pointy-top hex scenario with two maps, two work rings, and the 18-member Thing', () => {
    expect(VINLAND.map.grid).toBe('hex');
    expect(VINLAND.map.hex?.orientation).toBe('pointy');
    expect(VINLAND.map.workArea?.rings).toEqual([{}, { size: 5 }]);
    expect(VINLAND.map.stored.map((m) => m.id)).toEqual(['north-east-hex', 'vinland-atlantic']);
    expect(VINLAND.councils.thing.members).toHaveLength(18);
    expect(VINLAND.peoples.playable?.map((p) => p.id)).toEqual(['beothuk', 'innu', 'mikmaq', 'haudenosaunee']);
  });

  it.each(['north-east-hex', 'vinland-atlantic'] as const)('plays 30 rounds on %s with Norse and playing peoples and survives save/load', (mapId) => {
    const s = createGame({
      scenario: 'vinland',
      map: mapId,
      mapSize: 'large',
      seed: 1021,
      nations: ['norse'],
      peoples: ['beothuk', 'innu'],
      humans: [],
      ai: { norse: 'competent', beothuk: 'competent', innu: 'competent' },
    });
    expect(gridOf(s)).toBe(HEX_POINTY);
    expect(s.players.map((p) => p.id)).toEqual(['norse', 'beothuk', 'innu']);
    for (let i = 0; i < 30; i++) endTurn(s);
    const copy = deserialize(serialize(s));
    expect(copy.turn).toBe(s.turn);
    expect(Object.keys(copy.colonies).length).toBe(Object.keys(s.colonies).length);
  });

  it('checks Norse thriving at the seeded departure year and withdraws if not thriving', () => {
    const s = createGame({
      scenario: 'vinland',
      map: 'north-east-hex',
      mapSize: 'large',
      seed: 42,
      nations: ['norse'],
      peoples: ['beothuk'],
      humans: ['norse'],
    });
    const rule = VINLAND.nations.sets.real![0].departs!;
    const y = departureYearFor(s, 'norse', rule);
    expect(y).toBeGreaterThanOrEqual(rule.years[0]);
    expect(y).toBeLessThanOrEqual(rule.years[1]);
    // At turn 0 with no colonies, the Norse are not thriving.
    expect(isThriving(s, 'norse', rule.thriving).thriving).toBe(false);
    // Advance turn counter to the departure year and trigger processDepartures.
    s.turn = (y - 1000) * 2;
    processDepartures(s);
    const norse = s.players.find((p) => p.id === 'norse')!;
    expect(norse.departed).toBe(true);
    expect(norse.finished).toBeDefined();
    expect(Object.values(s.units).filter((u) => u.owner === 'norse')).toHaveLength(0);
  });

  it('keeps everything Norse/Greenland/Viking inside Vinland (T17)', () => {
    for (const sc of [AMERICAS, CARIBBEAN, NORTH_EAST]) {
      const text = JSON.stringify(sc);
      expect(text).not.toMatch(/\bnorse\b|vinland|greenland|viking|brattahl/i);
    }
  });
});
