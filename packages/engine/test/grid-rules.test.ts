/**
 * Key rules on every grid (docs/design/hex-maps.md H18): the same tests on squares (the Americas)
 * and on hexes in both orientations (the hidden hex test scenarios). Movement in every direction,
 * the path search, roads and rivers, generated maps and their rivers, and the colony's work area
 * with its second ring and gates.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  applyCommand,
  assignJob,
  colonyWorkArea,
  createGame,
  createUnit,
  describeMove,
  findPath,
  foundColony,
  gridOf,
  jobOptions,
  moveCost,
  moveUnit,
  openRings,
  processColony,
  registerScenario,
  removeUnit,
  RIVER_MOVE_COST,
  riverLinked,
  ROAD_MOVE_COST,
  TERRAIN,
  type Colony,
  type GameState,
  type Job,
} from '../src/index.js';
import { linkRiver } from '../src/rivers.js';
import { unitList } from '../src/unitindex.js';

// A square scenario whose colonies reach a second ring once they have docks: the building gate,
// and two rings on squares.
registerScenario({ ...AMERICAS, id: 'test-square-two-rings', hidden: true, map: { ...AMERICAS.map, workArea: { rings: [{}, { building: 'docks' }] } } });

const GRIDS = [
  ['squares', 'americas'],
  ['pointy hexes', 'hex-test'],
  ['flat hexes', 'hex-test-flat'],
] as const;

/** A small game on open plains with no units or settlements, all explored. */
function openGame(scenario: string): GameState {
  const s = createGame({ seed: 5, mapSize: 'small', nations: ['england'], humans: ['england'], ...(scenario === 'americas' ? {} : { scenario }) });
  for (const t of s.map.tiles) {
    for (const k of Object.keys(t)) delete (t as unknown as Record<string, unknown>)[k];
    Object.assign(t, { t: 'plains' });
  }
  s.settlements = {};
  for (const u of unitList(s)) removeUnit(s, u.id);
  s.players[0].explored.fill(1);
  return s;
}

describe.each(GRIDS)('rules on %s', (_name, scenario) => {
  it('moves a unit one step in each of the grid’s directions', () => {
    const s = openGame(scenario);
    const grid = gridOf(s);
    for (const [x, y] of [[8, 8], [9, 9], [8, 9], [9, 8]] as const) {
      for (const d of grid.directions) {
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        expect(describeMove(s, u.id, d.id).kind).toBe('move');
        moveUnit(s, u.id, d.id);
        expect(u.loc).toMatchObject({ kind: 'map', ...grid.step(x, y, d.id) });
        removeUnit(s, u.id);
      }
    }
  });

  it('finds paths as long as the distance on open land, and follows them', () => {
    const s = openGame(scenario);
    const grid = gridOf(s);
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 10, y: 10 });
    for (const [tx, ty] of [[14, 10], [10, 15], [5, 4], [16, 3], [11, 11]] as const) {
      const path = findPath(s, u, tx, ty)!;
      expect(path).toHaveLength(grid.distance(10, 10, tx, ty));
      expect(path[path.length - 1]).toEqual({ x: tx, y: ty });
      let at = { x: 10, y: 10 };
      for (const p of path) {
        expect(grid.distance(at.x, at.y, p.x, p.y)).toBe(1);
        at = p;
      }
    }
    u.moves = 3;
    applyCommand(s, { type: 'goto', unitId: u.id, x: 13, y: 13 });
    for (let i = 0; i < 6 && (u.loc.kind !== 'map' || u.loc.x !== 13 || u.loc.y !== 13); i++) applyCommand(s, { type: 'endTurn' });
    expect(u.loc).toMatchObject({ kind: 'map', x: 13, y: 13 });
  });

  it('moves along roads and rivers at road speed, and across a river at the land’s', () => {
    const s = openGame(scenario);
    const grid = gridOf(s);
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 4, y: 4 });
    const land = TERRAIN.plains.moveCost;
    // A road along a line.
    const road = grid.line(4, 4, 12, 9);
    for (const p of road) s.map.tiles[p.y * s.map.width + p.x].r = true;
    for (let i = 1; i < road.length; i++) expect(moveCost(s, u, road[i - 1].x, road[i - 1].y, road[i].x, road[i].y)).toBe(ROAD_MOVE_COST);
    // A river along another line, into the sea.
    const river = grid.line(3, 14, 14, 16);
    const mouth = river[river.length - 1];
    s.map.tiles[mouth.y * s.map.width + mouth.x] = { t: 'ocean' };
    for (let i = 1; i < river.length; i++) linkRiver(s.map, river[i - 1].x, river[i - 1].y, river[i].x, river[i].y, 1, grid);
    for (let i = 1; i < river.length - 1; i++) {
      const [a, b] = [river[i - 1], river[i]];
      expect(riverLinked(s.map, a.x, a.y, b.x, b.y, grid)).toBe(true);
      expect(riverLinked(s.map, b.x, b.y, a.x, a.y, grid)).toBe(true);
      expect(moveCost(s, u, a.x, a.y, b.x, b.y)).toBe(RIVER_MOVE_COST);
      expect(moveCost(s, u, b.x, b.y, a.x, a.y)).toBe(RIVER_MOVE_COST);
    }
    // Each river tile's mask has one bit per link, among the grid's directions only.
    const n = grid.directions.length;
    for (let i = 0; i < river.length - 1; i++) {
      const rd = s.map.tiles[river[i].y * s.map.width + river[i].x].rd!;
      expect(rd >> n).toBe(0);
      expect(rd.toString(2).replace(/0/g, '')).toHaveLength(i === 0 ? 1 : 2);
    }
    // Two river tiles side by side that the river does not link: crossing costs the land's.
    const a = river[2];
    const side = grid.neighbours(s.map, a.x, a.y).find((p) => s.map.tiles[p.y * s.map.width + p.x].rv && !riverLinked(s.map, a.x, a.y, p.x, p.y, grid));
    if (side) expect(moveCost(s, u, a.x, a.y, side.x, side.y)).toBe(land);
    const off = grid.neighbours(s.map, a.x, a.y).find((p) => !s.map.tiles[p.y * s.map.width + p.x].rv)!;
    expect(moveCost(s, u, a.x, a.y, off.x, off.y)).toBe(land);
  });

  it('generates maps whose rivers link both ways along the grid and reach water', () => {
    const s = createGame({ seed: 77, mapSize: 'medium', nations: ['england'], humans: ['england'], ...(scenario === 'americas' ? {} : { scenario }) });
    const grid = gridOf(s);
    const { width, tiles } = s.map;
    const water = (i: number) => TERRAIN[tiles[i].t].water;
    let rivers = 0;
    let mouths = 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (!t.rv) continue;
      rivers++;
      const x = i % width;
      const y = (i - x) / width;
      expect(water(i)).toBe(false);
      expect(t.rd! >> grid.directions.length).toBe(0);
      const near = grid.neighbourOffsets(x, y);
      for (let d = 0; d < grid.directions.length; d++) {
        if (!(t.rd! & (1 << d))) continue;
        const j = (y + near[2 * d + 1]) * width + x + near[2 * d];
        if (water(j)) mouths++;
        else expect(riverLinked(s.map, x, y, x + near[2 * d], y + near[2 * d + 1], grid)).toBe(true);
      }
    }
    expect(rivers).toBeGreaterThan(20);
    expect(mouths).toBeGreaterThan(2);
  });
});

/** A colony on open plains at 10, 10, with `size` colonists working where they like. */
function colonyOf(scenario: string, size: number): { s: GameState; c: Colony } {
  const s = openGame(scenario);
  const founder = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 10, y: 10 });
  founder.moves = 3;
  const c = foundColony(s, founder.id);
  for (let i = 1; i < size; i++) {
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 10, y: 10 });
    assignJob(s, u.id, c.id);
  }
  return { s, c };
}

/** The tiles the colony's jobs offer a newcomer, and the tiles its colonists work. */
const tileJobs = (s: GameState, c: Colony) => {
  const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
  const out = new Set(jobOptions(s, c, u).flatMap((o) => (o.job.kind === 'tile' ? [`${o.job.x},${o.job.y}`] : [])));
  removeUnit(s, u.id);
  for (const w of unitList(s)) if (w.loc.kind === 'colony' && w.loc.job.kind === 'tile') out.add(`${w.loc.job.x},${w.loc.job.y}`);
  return out;
};

describe('the colony work area', () => {
  it.each(GRIDS)('is the first ring on %s while the colony is small', (_name, scenario) => {
    const { s, c } = colonyOf(scenario, 4);
    const grid = gridOf(s);
    expect(openRings(s, c)).toBe(1);
    expect(colonyWorkArea(s, c)).toEqual(grid.workArea(s.map, c.x, c.y));
    expect(tileJobs(s, c).size).toBe(grid.directions.length);
  });

  it.each([['pointy', 'hex-test'], ['flat', 'hex-test-flat']] as const)('on %s hexes opens its second ring at five colonists, and closes it again', (_o, scenario) => {
    const { s, c } = colonyOf(scenario, 4);
    const grid = gridOf(s);
    const outer = grid.ring(s.map, c.x, c.y, 2)[0];
    const job: Job = { kind: 'tile', x: outer.x, y: outer.y, good: 'food' };
    const extra = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
    // At four colonists the second ring is closed (the fifth is still at the gate).
    expect(() => assignJob(s, extra.id, c.id, job)).toThrow(/outside the colony's work area/);
    assignJob(s, extra.id, c.id, { kind: 'building', building: 'townHall' });
    expect(openRings(s, c)).toBe(2);
    expect(colonyWorkArea(s, c)).toHaveLength(18);
    expect(tileJobs(s, c).size).toBe(18);
    assignJob(s, extra.id, c.id, job);
    expect(extra.loc).toMatchObject({ kind: 'colony', job });
    // A colonist leaves: the ring closes and the outer worker takes other work before the colony produces.
    const leaver = unitList(s).find((w) => w.loc.kind === 'colony' && w.id !== extra.id)!;
    removeUnit(s, leaver.id);
    expect(openRings(s, c)).toBe(1);
    processColony(s, c);
    expect(extra.loc.kind === 'colony' && extra.loc.job.kind === 'tile' ? grid.distance(c.x, c.y, extra.loc.job.x, extra.loc.job.y) : 1).toBe(1);
    expect(s.messages.some((m) => /can no longer work so far out/.test(m.text))).toBe(true);
  });

  it('opens a second ring on squares with a building gate', () => {
    const { s, c } = colonyOf('test-square-two-rings', 2);
    expect(openRings(s, c)).toBe(1);
    expect(colonyWorkArea(s, c)).toHaveLength(8);
    c.buildings.docks = 1;
    expect(openRings(s, c)).toBe(2);
    expect(colonyWorkArea(s, c)).toHaveLength(24);
  });
});
