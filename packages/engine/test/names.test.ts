import { describe, expect, it } from 'vitest';
import { COLONY_NAMES, createGame, createUnit, foundColony, nextColonyName, NATION_ORDER, NATIONS } from '../src/index.js';

describe('colony names', () => {
  it('gives every nation at least 100 distinct names', () => {
    for (const nation of NATION_ORDER) {
      const names = COLONY_NAMES[nation as keyof typeof COLONY_NAMES];
      expect(names.length).toBeGreaterThanOrEqual(100);
      expect(new Set(names).size).toBe(names.length);
      expect(NATIONS[nation].colonyNames).toBe(names);
      for (const n of names) expect(n.trim()).toBe(n);
    }
  });

  it('keeps the historical names first', () => {
    expect(COLONY_NAMES.england.slice(0, 3)).toEqual(['Jamestown', 'Plymouth', 'Roanoke']);
    expect(COLONY_NAMES.sweden[0]).toBe('Fort Christina');
  });

  it('never repeats a name within a game', () => {
    const s = createGame({ seed: 4, mapSize: 'large', nations: ['england', 'france'], humans: ['england'] });
    const seen = new Set<string>();
    let founded = 0;
    for (let y = 2; y < s.map.height - 2 && founded < 40; y += 2) {
      for (let x = 2; x < s.map.width - 2 && founded < 40; x += 2) {
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        try {
          const c = foundColony(s, u.id);
          expect(seen.has(c.name)).toBe(false);
          seen.add(c.name);
          founded++;
        } catch {
          delete s.units[u.id];
        }
      }
    }
    expect(founded).toBeGreaterThan(12);
    expect(nextColonyName(s, 'england')).not.toMatch(/Colony \d/);
  });
});
