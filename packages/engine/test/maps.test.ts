import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGame,
  isWater,
  NATION_ORDER,
  parseStoredMap,
  serialize,
  STORED_MAPS,
  storedMap,
  TERRAIN,
  type GameState,
  type StoredMap,
} from '../src/index.js';

function play(def: StoredMap, nations: number, seed = 7, humans = 1): GameState {
  const list = NATION_ORDER.slice(0, nations);
  return createGame({ seed, mapSize: 'small', map: def.id, nations: list, humans: list.slice(0, humans) });
}

describe('stored maps', () => {
  it('lists each map once with a name and description', () => {
    expect(STORED_MAPS.map((m) => m.id)).toEqual(['north-america', 'south-america', 'americas']);
    for (const def of STORED_MAPS) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(storedMap(def.id)).toBe(def);
    }
    expect(() => storedMap('atlantis')).toThrow();
  });

  it('rejects unknown terrain and ragged rows', () => {
    const base = { id: 'test', name: 'Test', description: '', tribes: [] };
    expect(parseStoredMap({ ...base, rows: '\n~p\n~P\n' })).toEqual({ width: 2, height: 2, tiles: [{ t: 'highSeas' }, { t: 'plains' }, { t: 'highSeas' }, { t: 'plains', f: true }] });
    expect(() => parseStoredMap({ ...base, rows: '~p\n~' })).toThrow(/row 1/);
    expect(() => parseStoredMap({ ...base, rows: '~x' })).toThrow(/unknown terrain/);
    expect(() => parseStoredMap({ ...base, rows: '~H' })).toThrow(/unknown terrain/);
  });

  for (const def of STORED_MAPS) {
    describe(def.name, () => {
      const map = parseStoredMap(def);

      it('parses with consistent rows at about the large size or bigger', () => {
        const lines = def.rows.trim().split('\n');
        expect(new Set(lines.map((l) => l.length)).size).toBe(1);
        expect(map.tiles).toHaveLength(map.width * map.height);
        expect(map.width * map.height).toBeGreaterThanOrEqual(58 * 72 * 0.95);
        const land = map.tiles.filter((t) => !TERRAIN[t.t].water).length;
        expect(land).toBeGreaterThan(map.tiles.length * 0.2);
      });

      it('has high seas along the east edge and in deep water', () => {
        for (let y = 0; y < map.height; y++) {
          for (let x = map.width - 2; x < map.width; x++) expect(map.tiles[y * map.width + x].t).toBe('highSeas');
        }
        const deep = map.tiles.filter((t) => t.t === 'highSeas').length;
        expect(deep).toBeGreaterThan(map.height * 6);
      });

      it('has region rectangles inside the map, with land in them', () => {
        for (const { region: [x0, y0, x1, y1] } of def.tribes) {
          expect(x0).toBeGreaterThanOrEqual(0);
          expect(y0).toBeGreaterThanOrEqual(0);
          expect(x1).toBeLessThan(map.width);
          expect(y1).toBeLessThan(map.height);
          expect(x0).toBeLessThanOrEqual(x1);
          expect(y0).toBeLessThanOrEqual(y1);
        }
        if (def.entryRows) {
          expect(def.entryRows[0]).toBeGreaterThanOrEqual(0);
          expect(def.entryRows[1]).toBeLessThan(map.height);
        }
      });

      it('places settlements for every tribe it claims, spaced apart', () => {
        for (const seed of [1, 2, 3]) {
          const s = play(def, 8, seed, 0);
          const settlements = Object.values(s.settlements);
          for (const tribe of new Set(def.tribes.map((r) => r.tribe))) {
            const own = settlements.filter((st) => st.tribe === tribe);
            expect(own.length, `${tribe} with seed ${seed}`).toBeGreaterThan(0);
            expect(own.filter((st) => st.capital)).toHaveLength(1);
          }
          for (const a of settlements) {
            const tile = s.map.tiles[a.y * s.map.width + a.x];
            expect(isWater(tile)).toBe(false);
            expect(['arctic', 'mountains']).not.toContain(tile.t);
            expect(tile.lcr).toBeUndefined();
            for (const b of settlements) {
              if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(4);
            }
            for (const p of s.players) expect(Math.max(Math.abs(a.x - p.entry.x), Math.abs(a.y - p.entry.y))).toBeGreaterThanOrEqual(2);
          }
          expect(settlements.length).toBeGreaterThanOrEqual(def.tribes.reduce((n, r) => n + r.count, 0) * 0.6);
        }
      });

      it('starts games with 1 and 8 nations on the east-edge high seas', () => {
        for (const n of [1, 8]) {
          const s = play(def, n);
          expect(s.map.width).toBe(map.width);
          expect(s.map.height).toBe(map.height);
          expect(s.players).toHaveLength(n);
          const rows = new Set(s.players.map((p) => p.entry.y));
          expect(rows.size).toBe(n);
          for (const p of s.players) {
            expect(s.map.tiles[p.entry.y * s.map.width + p.entry.x].t).toBe('highSeas');
            expect(p.entry.x).toBe(map.width - 2);
          }
        }
        // The terrain comes from the map, the extras from the seed.
        const a = play(def, 2, 1);
        const b = play(def, 2, 2);
        expect(a.map.tiles.map((t) => t.t)).toEqual(b.map.tiles.map((t) => t.t));
        expect(serialize(a)).not.toBe(serialize(b));
        expect(serialize(play(def, 2, 1))).toBe(serialize(a));
        expect(a.map.tiles.some((t) => t.b)).toBe(true);
        expect(a.map.tiles.some((t) => t.lcr)).toBe(true);
      });

      it('plays 30 AI-only turns and colonies get founded', () => {
        const s = play(def, 8, 99, 0);
        for (let i = 0; i < 30; i++) applyCommand(s, { type: 'endTurn' });
        expect(s.turn).toBeGreaterThanOrEqual(30);
        expect(Object.keys(s.colonies).length).toBeGreaterThan(0);
      });
    });
  }
});
