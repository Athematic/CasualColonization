/**
 * Stored rivers on every grid (docs/design/hex-maps.md H3, H11, step 2): `parseRivers` joins
 * waypoints by the grid's lines, so every river step links two neighbours on the grid the map is
 * read on, and a stored square map can be read on hexes (`storedMapOn`) with the rivers that no
 * longer fit listed instead of thrown.
 */
import { describe, expect, it } from 'vitest';
import {
  HEX_FLAT,
  HEX_POINTY,
  parseRivers,
  parseStoredMap,
  riverLinked,
  riverOffsets,
  RIVER_DIRS,
  SQUARE,
  STORED_MAPS,
  storedMapOn,
  TERRAIN,
  type GameMap,
  type Grid,
  type Tile,
} from '../src/index.js';

const isWater = (t: Tile | undefined) => !!t && TERRAIN[t.t].water;

/**
 * Every river bit points at a neighbour on the map in the grid's bit order; between two land tiles
 * the link is set both ways (`riverLinked` on the grid); every river system reaches water.
 * Returns the number of river tiles.
 */
function checkRivers(map: GameMap, grid: Grid): number {
  const { width, height, tiles } = map;
  const n = grid.directions.length;
  let count = 0;
  const mouthOf = new Map<number, boolean>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t.rv && !t.rd) continue;
    count++;
    const x = i % width;
    const y = (i - x) / width;
    expect(isWater(t), `river on water at ${x},${y}`).toBe(false);
    expect(t.rd, `river without a course at ${x},${y}`).toBeGreaterThan(0);
    expect(t.rd! >> n, `bits beyond the grid's ${n} directions at ${x},${y}`).toBe(0);
    const o = riverOffsets(grid, x, y);
    for (let d = 0; d < n; d++) {
      if (!(t.rd! & (1 << d))) continue;
      const nx = x + o[2 * d];
      const ny = y + o[2 * d + 1];
      expect(grid.distance(x, y, nx, ny), `step from ${x},${y}`).toBe(1);
      expect(grid.inBounds(map, nx, ny), `river runs off the map at ${x},${y}`).toBe(true);
      expect(nx >= 0 && ny >= 0 && nx < width && ny < height).toBe(true);
      const nb = tiles[ny * width + nx];
      if (!isWater(nb)) expect(riverLinked(map, x, y, nx, ny, grid), `one-way link ${x},${y} → ${nx},${ny}`).toBe(true);
    }
  }
  // Every connected river system has a mouth.
  for (let i = 0; i < tiles.length; i++) {
    if (!tiles[i].rv || mouthOf.has(i)) continue;
    const system = [i];
    const seen = new Set([i]);
    let mouth = false;
    for (let k = 0; k < system.length; k++) {
      const j = system[k];
      const x = j % width;
      const y = (j - x) / width;
      const o = riverOffsets(grid, x, y);
      for (let d = 0; d < n; d++) {
        if (!(tiles[j].rd! & (1 << d))) continue;
        const m = (y + o[2 * d + 1]) * width + x + o[2 * d];
        if (isWater(tiles[m])) mouth = true;
        else if (!seen.has(m)) {
          seen.add(m);
          system.push(m);
        }
      }
    }
    for (const j of system) mouthOf.set(j, mouth);
    expect(mouth, `river at ${i % width},${Math.floor(i / width)} never reaches water`).toBe(true);
  }
  return count;
}

const GRIDS = [
  ['squares', SQUARE],
  ['pointy hexes', HEX_POINTY],
  ['flat hexes', HEX_FLAT],
] as const;

/** A map of plains with a border of ocean. */
function plainsMap(width: number, height: number): GameMap {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) tiles.push({ t: x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'ocean' : 'plains' });
  return { width, height, tiles };
}

describe.each(GRIDS)('stored rivers on %s', (_name, grid) => {
  it('join waypoints by the grid’s lines: every step links neighbours, both ways', () => {
    const map = plainsMap(20, 16);
    // A main river with bends in every direction, and a tributary joining it.
    parseRivers(map, 'Main: m 3,3 9,4 M 12,9 15,8 19,8\nSide: m 4,13 8,12 12,9', 'test', grid);
    const main = map.tiles[8 * 20 + 15];
    expect(main.rv).toBe(2);
    // The main river's course is its waypoints joined by the grid's lines.
    const course = [
      ...grid.line(3, 3, 9, 4),
      ...grid.line(9, 4, 12, 9).slice(1),
      ...grid.line(12, 9, 15, 8).slice(1),
      ...grid.line(15, 8, 19, 8).slice(1),
    ];
    for (let i = 0; i + 1 < course.length; i++) {
      const a = course[i];
      const b = course[i + 1];
      expect(grid.distance(a.x, a.y, b.x, b.y)).toBe(1);
      if (!isWater(map.tiles[b.y * 20 + b.x])) expect(riverLinked(map, a.x, a.y, b.x, b.y, grid), `${a.x},${a.y} → ${b.x},${b.y}`).toBe(true);
    }
    expect(checkRivers(map, grid)).toBeGreaterThan(20);
  });

  it('reject courses that run over water, stop inland or cross another river, or list them when asked', () => {
    const base = { id: 'test', name: 'Test', description: '' };
    const rows = '\n......\n.pppp.\n.pppp.\n.pppp.\n......\n';
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 1,1 1,2' }, grid)).toThrow(/neither water nor a river/);
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 1,1 5,1 5,3' }, grid)).toThrow(/is water/);
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 2,1 2,4\nB: m 4,1 1,3 0,3' }, grid)).toThrow(/meets another river/);
    const { map, problems } = storedMapOn({ ...base, rows, rivers: 'A: m 2,1 2,4\nB: m 1,1 1,2\nC: m 4,2 5,2' }, grid);
    expect(problems).toEqual(['test: river "B": ends at 1,2, which is neither water nor a river.']);
    // The river that fits is read; the one that does not is left out whole.
    expect(map.tiles[1 * 6 + 1].rv).toBeUndefined();
    expect(map.tiles[2 * 6 + 4].rv).toBe(1);
    checkRivers(map, grid);
  });
});

describe('stored square maps read on hexes (the first step of converting them, H11)', () => {
  it('read the same on squares as the game reads them', () => {
    for (const def of STORED_MAPS) {
      const { map, problems } = storedMapOn(def, SQUARE);
      expect(problems, def.id).toEqual([]);
      expect(map).toEqual(parseStoredMap(def));
    }
  });

  it.each([
    ['pointy', HEX_POINTY],
    ['flat', HEX_FLAT],
  ] as const)('on %s hexes keep their terrain, and every river step links hex neighbours', (_name, grid) => {
    let fitted = 0;
    for (const def of STORED_MAPS) {
      const square = parseStoredMap(def);
      const { map, problems } = storedMapOn(def, grid);
      // A text line is a row of tiles on every grid: the terrain is the same, tile for tile.
      expect(map.width, def.id).toBe(square.width);
      expect(map.height, def.id).toBe(square.height);
      expect(map.tiles.map((t) => `${t.t}${t.f ? 'f' : ''}`), def.id).toEqual(square.tiles.map((t) => `${t.t}${t.f ? 'f' : ''}`));
      for (const p of problems) expect(p, def.id).toMatch(new RegExp(`^${def.id}: river "[^"]+": `));
      if (!problems.length) fitted++;
      const rivers = checkRivers(map, grid);
      // Most rivers fit as they are; the review pass fixes the rest in the hex copy.
      expect(rivers, def.id).toBeGreaterThan(20);
    }
    // At least one of the maps reads on hexes with every river intact.
    expect(fitted).toBeGreaterThan(0);
  });

  it('the square bit order is RIVER_DIRS', () => {
    expect(riverOffsets(SQUARE, 3, 4)).toEqual(RIVER_DIRS.flat());
  });
});
