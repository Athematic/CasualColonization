import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY,
  DIFFICULTY_LEVELS,
  RIVER_DEFENCE,
  RIVER_DIRS,
  colonySiteProblem,
  createGame,
  createUnit,
  defencePower,
  foundColony,
  hurryPrice,
  chooseDefender,
  riverCrossing,
  riverLinked,
  isWater,
  tileAt,
  type GameState,
} from '../src/index.js';
import { cargoShipWanted, fleetReport } from '../src/ai/fleet.js';

function game(): GameState {
  return createGame({ seed: 7, mapSize: 'small', nations: ['england', 'france'], humans: ['england'] });
}

/** Two adjacent plains tiles (a west of b), free of rivers, forest and colonies. */
function pair(s: GameState): { a: { x: number; y: number }; b: { x: number; y: number } } {
  for (let y = 3; y < s.map.height - 3; y++)
    for (let x = 3; x < s.map.width - 4; x++) {
      const ta = tileAt(s, x, y)!;
      const tb = tileAt(s, x + 1, y)!;
      if (isWater(ta) || isWater(tb) || ta.rv || tb.rv) continue;
      for (const t of [ta, tb]) {
        t.t = 'plains';
        delete t.f;
      }
      return { a: { x, y }, b: { x: x + 1, y } };
    }
  throw new Error('no ground');
}

describe('river defence', () => {
  it('a unit on a river tile defends 25% better against an attacker across the river', () => {
    const s = game();
    const { a, b } = pair(s);
    const tb = tileAt(s, b.x, b.y)!;
    tb.rv = 1;
    tb.rd = 1 << 0; // the river runs north, not towards a
    const guard = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: b.x, y: b.y });
    guard.role = 'soldier';
    const plain = defencePower(s, guard);
    expect(riverCrossing(s, a, b)).toBe(true);
    expect(defencePower(s, guard, a)).toBeCloseTo(plain * (1 + RIVER_DEFENCE / 100));
    expect(RIVER_DEFENCE).toBe(25);
    // The defender choice sees it too.
    expect(chooseDefender(s, [guard], a)).toBe(guard);
  });

  it('no bonus when the attacker stands on a river tile the river links to the defender', () => {
    const s = game();
    const { a, b } = pair(s);
    const ta = tileAt(s, a.x, a.y)!;
    const tb = tileAt(s, b.x, b.y)!;
    ta.rv = tb.rv = 1;
    ta.rd = 1 << RIVER_DIRS.findIndex(([dx, dy]) => dx === 1 && dy === 0);
    tb.rd = 1 << RIVER_DIRS.findIndex(([dx, dy]) => dx === -1 && dy === 0);
    expect(riverLinked(s.map, a.x, a.y, b.x, b.y)).toBe(true);
    const guard = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: b.x, y: b.y });
    expect(riverCrossing(s, a, b)).toBe(false);
    expect(defencePower(s, guard, a)).toBe(defencePower(s, guard));
    // A river tile of its own, not linked to the defender's, is across the river.
    ta.rd = 1 << 0;
    expect(defencePower(s, guard, a)).toBeGreaterThan(defencePower(s, guard));
  });

  it('no bonus without a river, without an attacker position, or inside a colony', () => {
    const s = game();
    const { a, b } = pair(s);
    const guard = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: b.x, y: b.y });
    expect(defencePower(s, guard, a)).toBe(defencePower(s, guard));
    const tb = tileAt(s, b.x, b.y)!;
    tb.rv = 1;
    tb.rd = 1;
    expect(defencePower(s, guard)).toBe(defencePower(s, guard, undefined));
    // Colony tiles use their own defence rules.
    for (let y = 3; y < s.map.height - 3; y++)
      for (let x = 3; x < s.map.width - 3; x++) {
        if (colonySiteProblem(s, x, y)) continue;
        const t = tileAt(s, x, y)!;
        const u = createUnit(s, 'france', 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        foundColony(s, u.id, 'Fluvia');
        t.rv = 1;
        t.rd = 1;
        const far = { x: x + 1, y };
        expect(defencePower(s, u, far)).toBe(defencePower(s, u));
        return;
      }
  });
});

describe('hurry price and difficulty', () => {
  function colonyWithBuild(s: GameState) {
    for (let y = 3; y < s.map.height - 3; y++)
      for (let x = 3; x < s.map.width - 3; x++) {
        if (colonySiteProblem(s, x, y)) continue;
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        const c = foundColony(s, u.id, 'Priceton');
        c.build = { kind: 'building', id: 'stockade' };
        c.hammers = 0;
        return c;
      }
    throw new Error('no site');
  }

  it('scales with the level and is unchanged at Conquistador', () => {
    const s = game();
    const c = colonyWithBuild(s);
    const p = s.players.find((q) => q.id === 'england')!;
    expect(DIFFICULTY.conquistador.hurryCost).toBe(1);
    p.difficulty = 'conquistador';
    const base = hurryPrice(s, c);
    expect(base).toBeGreaterThan(0);
    p.difficulty = undefined;
    expect(hurryPrice(s, c)).toBe(base);
    const prices = DIFFICULTY_LEVELS.map((level) => {
      p.difficulty = level;
      return hurryPrice(s, c);
    });
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
    p.difficulty = 'discoverer';
    expect(hurryPrice(s, c)).toBe(Math.round(base * 0.7));
    p.difficulty = 'viceroy';
    expect(hurryPrice(s, c)).toBe(Math.round(base * 1.3));
  });
});

describe('computer ship buying', () => {
  it('uses the price function it is given, and the base prices without one', () => {
    const s = game();
    const p = s.players.find((q) => q.id === 'france')!;
    const r = { ...fleetReport(s, p), coastal: 4, waiting: 20, holds: 0, cargoShips: 0, galleons: 0, treasure: 0 };
    expect(cargoShipWanted(r, 1200)).toBe('caravel');
    expect(cargoShipWanted(r, 1200, () => 9999)).toBeNull();
    expect(cargoShipWanted(r, 1200, () => 100)).toBe('merchantman');
  });
});

describe('Cooper Creek', () => {
  it('runs into Lake Eyre on the Australia map', () => {
    const s = createGame({ seed: 3, mapSize: 'medium', map: 'australia', nations: ['england'], humans: ['england'] });
    const lake = tileAt(s, 49, 43)!;
    expect(isWater(lake)).toBe(true);
    const mouth = tileAt(s, 50, 43)!;
    expect(mouth.rv).toBeTruthy();
    expect(mouth.rd! & (1 << RIVER_DIRS.findIndex(([dx, dy]) => dx === -1 && dy === 0))).not.toBe(0);
    expect(tileAt(s, 58, 36)!.rv).toBeTruthy();
  });
});
