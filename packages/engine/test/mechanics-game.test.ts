/**
 * A whole computer game with every mechanics switch off (see mechanics.test.ts): the computer
 * players never use any of the switched-off mechanics. In a file of its own, as the slowest test,
 * so it runs in parallel with the rest of mechanics.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { playArenaGame, type NationId } from '../src/index.js';
import './mechanics-variants.js';

describe('computer players with every mechanic off', () => {
  it('play a game without using any of them', () => {
    const line = (['competent', 'combative', 'creative', 'naive'] as const).map((level, i) => ({ nation: (['england', 'france', 'spain', 'netherlands'] as NationId[])[i], level }));
    const { state: s } = playArenaGame(11, line, 220, 'small', undefined, false, undefined, false, false, true, { scenario: 'test-all-off' });
    expect(s.turn).toBeGreaterThanOrEqual(220);
    expect(Object.keys(s.colonies).length).toBeGreaterThan(4);
    for (const p of s.players) {
      expect(p.tax, p.id).toBe(0);
      expect(p.pendingTax).toBeNull();
      expect(Object.keys(p.boycotts)).toEqual([]);
      expect(p.pendingDemand).toBeUndefined();
      expect(p.royal?.added ?? 0).toBe(0);
      expect(p.royal?.lastWar).toBeUndefined();
      expect(p.independence).toBe('none');
    }
    expect((s.treaties ?? []).some((t) => t.kind === 'favoured' || t.kind === 'alliance')).toBe(false);
    expect(Object.values(s.settlements).some((st) => st.mission)).toBe(false);
    expect(Object.values(s.colonies).some((c) => c.buildings.customHouse > 0)).toBe(false);
    expect(Object.values(s.units).some((u) => u.role === 'missionary')).toBe(false);
  }, 60_000);
});
