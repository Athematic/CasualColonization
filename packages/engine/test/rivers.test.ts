import { describe, expect, it } from 'vitest';
import {
  baseTileYield,
  centreProduction,
  createGame,
  createUnit,
  createWorld,
  deserialize,
  findPath,
  foundColony,
  moveCost,
  parseRivers,
  parseStoredMap,
  RIVER_DIRS,
  RIVER_YIELD_BONUS,
  riverLinked,
  serialize,
  siteScore,
  STORED_MAPS,
  TERRAIN,
  type GameMap,
  type GameState,
  type Tile,
} from '../src/index.js';
import { roadTargets } from '../src/ai/roads.js';

const isWater = (t: Tile | undefined) => !!t && TERRAIN[t.t].water;

/** Every river tile is land, links point both ways between land tiles, and each river reaches water. */
function checkRivers(map: GameMap): { tiles: number; major: number; mouths: number } {
  const { width, height, tiles } = map;
  let mouths = 0;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t.rv && !t.rd) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    expect(isWater(t), `river on water at ${x},${y}`).toBe(false);
    expect([1, 2]).toContain(t.rv);
    expect(t.rd, `river without a course at ${x},${y}`).toBeGreaterThan(0);
    RIVER_DIRS.forEach(([dx, dy], d) => {
      if (!(t.rd! & (1 << d))) return;
      const n = tiles[(y + dy) * width + x + dx];
      expect(n, `river runs off the map at ${x},${y}`).toBeDefined();
      if (isWater(n)) mouths++;
      else expect(riverLinked(map, x, y, x + dx, y + dy), `one-way link at ${x},${y}`).toBe(true);
    });
  }
  // Every connected river system has a mouth.
  const seen = new Set<number>();
  for (let i = 0; i < tiles.length; i++) {
    if (!tiles[i].rv || seen.has(i)) continue;
    const stack = [i];
    seen.add(i);
    let mouth = false;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % width;
      const y = Math.floor(j / width);
      RIVER_DIRS.forEach(([dx, dy], d) => {
        if (!(tiles[j].rd! & (1 << d))) return;
        const k = (y + dy) * width + x + dx;
        if (isWater(tiles[k])) mouth = true;
        else if (!seen.has(k)) {
          seen.add(k);
          stack.push(k);
        }
      });
    }
    expect(mouth, `river at ${i % width},${Math.floor(i / width)} never reaches water`).toBe(true);
  }
  void height;
  return { tiles: tiles.filter((t) => t.rv).length, major: tiles.filter((t) => t.rv === 2).length, mouths };
}

/** A small game on a uniform forest map, where a step costs 6 move points (two moves) off roads and rivers. */
function forestGame(): GameState {
  const s = createGame({ seed: 5, mapSize: 'small', nations: ['england'], humans: ['england'] });
  for (const t of s.map.tiles) {
    for (const k of Object.keys(t)) delete (t as unknown as Record<string, unknown>)[k];
    Object.assign(t, { t: 'plains', f: true });
  }
  s.settlements = {};
  for (const u of Object.values(s.units)) if (u.loc.kind === 'map') delete s.units[u.id];
  s.players[0].explored.fill(1);
  return s;
}

/** A river along row y from x0 to x1 (inclusive), minor unless said otherwise. */
function riverRow(s: GameState, y: number, x0: number, x1: number, size: 1 | 2 = 1): void {
  const text = `Test: ${size === 2 ? 'M' : 'm'} ${x0},${y} ${x1 + 1},${y}`;
  s.map.tiles[y * s.map.width + x1 + 1] = { t: 'ocean' };
  parseRivers(s.map, text);
}

describe('rivers', () => {
  it('move like a road along the river, and only along it', () => {
    const s = forestGame();
    riverRow(s, 10, 5, 12);
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 5, y: 10 });
    expect(moveCost(s, u, 5, 10, 6, 10)).toBe(1);
    // Onto the river from the side, or between river tiles the river does not link: full cost.
    expect(moveCost(s, u, 5, 11, 5, 10)).toBe(6);
    expect(moveCost(s, u, 5, 10, 6, 11)).toBe(6);
    riverRow(s, 11, 5, 9);
    expect(moveCost(s, u, 5, 10, 6, 11)).toBe(6);
    expect(moveCost(s, u, 5, 10, 5, 11)).toBe(6);
    // Road and river together are no faster than either.
    s.map.tiles[10 * s.map.width + 5].r = true;
    s.map.tiles[10 * s.map.width + 6].r = true;
    expect(moveCost(s, u, 5, 10, 6, 10)).toBe(1);
    // Pathfinding uses the river: the river route costs a third of the forest route.
    u.moves = 3;
    const path = findPath(s, u, 12, 10)!;
    expect(path.map((p) => p.y)).toEqual([10, 10, 10, 10, 10, 10, 10]);
    const cost = path.reduce((sum, p, i) => sum + moveCost(s, u, i ? path[i - 1].x : 5, i ? path[i - 1].y : 10, p.x, p.y), 0);
    expect(cost).toBe(7);
  });

  it('leave the computer players no reason to build roads along them', () => {
    const s = forestGame();
    riverRow(s, 10, 4, 14);
    for (const x of [5, 10]) {
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y: 10 });
      u.moves = 3;
      foundColony(s, u.id, `C${x}`);
    }
    // The river joins the two colonies at road speed: no road wanted between them.
    expect(roadTargets(s, s.players[0]).filter((t) => t.y === 10 && t.x > 5 && t.x < 10)).toEqual([]);
    // Without the river the same link needs a road.
    const dry = forestGame();
    for (const x of [5, 10]) {
      const u = createUnit(dry, 'england', 'freeColonist', { kind: 'map', x, y: 10 });
      u.moves = 3;
      foundColony(dry, u.id, `C${x}`);
    }
    expect(roadTargets(dry, dry.players[0]).length).toBeGreaterThanOrEqual(4);
  });

  it('raise the yield of the goods a tile already gives, and a colony centre on a river', () => {
    const plains: Tile = { t: 'plains' };
    expect(baseTileYield({ ...plains, rv: 1 }, 'food')).toBe(baseTileYield(plains, 'food') + 1);
    expect(baseTileYield({ ...plains, rv: 2 }, 'food')).toBe(baseTileYield(plains, 'food') + 2);
    expect(baseTileYield({ ...plains, rv: 2 }, 'cotton')).toBe(baseTileYield(plains, 'cotton') + 2);
    // Nothing from nothing: plains give no ore, river or not.
    expect(baseTileYield({ ...plains, rv: 2 }, 'ore')).toBe(0);
    const forest: Tile = { t: 'plains', f: true };
    expect(baseTileYield({ ...forest, rv: 1 }, 'furs')).toBe(baseTileYield(forest, 'furs') + 1);
    expect(baseTileYield({ ...forest, rv: 2 }, 'lumber')).toBe(baseTileYield(forest, 'lumber') + 2);
    expect(baseTileYield({ t: 'mountains', rv: 2 }, 'silver')).toBe(1 + RIVER_YIELD_BONUS[2].silver!);
    // A bonus resource doubles the land's yield; the river adds on top.
    expect(baseTileYield({ t: 'plains', b: true, rv: 1 }, 'food')).toBe(baseTileYield({ t: 'plains', b: true }, 'food') + 1);

    const s = forestGame();
    for (const t of s.map.tiles) delete t.f;
    const a = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 4, y: 4 });
    a.moves = 3;
    const dry = centreProduction(s, foundColony(s, a.id, 'Dry'));
    riverRow(s, 10, 6, 9, 2);
    const b = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 7, y: 10 });
    b.moves = 3;
    const wet = centreProduction(s, foundColony(s, b.id, 'Wet'));
    expect(wet.food).toBe(dry.food! + 2);
    expect(wet.cotton).toBe(dry.cotton! + 2);
    // The computer players prefer a site on the river.
    const before = siteScore(s, 20, 30);
    riverRow(s, 30, 15, 24);
    expect(siteScore(s, 20, 30)).toBeGreaterThan(before);
  });

  it('are generated from the seed, deterministically, and always reach the sea or a lake', () => {
    for (const mapSize of ['small', 'medium', 'large'] as const) {
      for (const seed of [1, 2, 3, 42]) {
        const a = createWorld({ rng: seed }, { mapSize });
        const b = createWorld({ rng: seed }, { mapSize });
        expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
        const { tiles, major, mouths } = checkRivers(a.map);
        const land = a.map.tiles.filter((t) => !isWater(t)).length;
        expect(tiles).toBeGreaterThan(land * 0.03);
        expect(tiles).toBeLessThan(land * 0.2);
        expect(mouths).toBeGreaterThanOrEqual(2);
        if (mapSize !== 'small') expect(major).toBeGreaterThan(0);
        // Rivers rise in high or wet land: every spring (a tile with one link) is inland.
        expect(a.map.tiles.some((t) => t.rv && t.rd && (t.rd & (t.rd - 1)) === 0)).toBe(true);
      }
    }
    // Rivers do not move anything else the seed makes.
    const strip = (m: GameMap) => JSON.stringify(m.tiles.map(({ rv, rd, ...t }) => (void rv, void rd, t)));
    const world = createWorld({ rng: 7 }, { mapSize: 'medium' });
    const other = createWorld({ rng: 7 }, { mapSize: 'medium' });
    for (const t of other.map.tiles) {
      delete t.rv;
      delete t.rd;
    }
    expect(strip(world.map)).toBe(strip(other.map));
  });

  it('on the stored maps parse, stay on land and end at the coast or a lake', () => {
    for (const def of STORED_MAPS) {
      expect(def.rivers, def.id).toBeTruthy();
      const { tiles, major } = checkRivers(parseStoredMap(def));
      expect(tiles, def.id).toBeGreaterThan(20);
      expect(major, def.id).toBeGreaterThan(5);
    }
  });

  it('reject stored-map courses that run over water, stop inland or cross another river', () => {
    const base = { id: 'test', name: 'Test', description: '', tribes: [] };
    const rows = '\n....\n.pp.\n.pp.\n....\n';
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 1,1 1,2' })).toThrow(/neither water nor a river/);
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 1,1 3,1 3,3' })).toThrow(/is water/);
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 1,1 1,3\nB: m 2,2 1,2 0,2' })).toThrow(/meets another river/);
    expect(() => parseStoredMap({ ...base, rows, rivers: 'A: m 1,1 x' })).toThrow(/cannot read/);
    const map = parseStoredMap({ ...base, rows, rivers: 'A: M 1,1 1,3\nB: m 2,2 1,2' });
    expect(map.tiles[1 * 4 + 1]).toMatchObject({ rv: 2 });
    expect(map.tiles[2 * 4 + 2]).toMatchObject({ rv: 1 });
    // The tributary does not shrink the main river where it joins.
    expect(map.tiles[2 * 4 + 1].rv).toBe(2);
    checkRivers(map);
  });

  it('are absent from saves made before them, which still load', () => {
    const s = createGame({ seed: 9, mapSize: 'small', nations: ['england'], humans: ['england'] });
    const old = JSON.parse(serialize(s));
    for (const t of old.map.tiles) {
      delete t.rv;
      delete t.rd;
    }
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.map.tiles.some((t) => t.rv)).toBe(false);
    const u = Object.values(loaded.units).find((x) => x.loc.kind === 'carrier' || x.loc.kind === 'map')!;
    expect(u).toBeDefined();
    // And saves made with rivers keep them.
    expect(deserialize(serialize(s)).map.tiles.filter((t) => t.rv).length).toBe(s.map.tiles.filter((t) => t.rv).length);
  });
});
