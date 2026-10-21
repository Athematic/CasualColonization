import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGame,
  deserialize,
  handOver,
  headStartConfig,
  playUntil,
  recordStats,
  serialize,
  STAT_KEYS,
  statsHistory,
  statsSnapshot,
  type GameConfig,
} from '../src/index.js';

const observed: GameConfig = {
  seed: 11,
  mapSize: 'small',
  nations: ['england', 'france', 'spain', 'netherlands'],
  humans: [],
  ai: { england: 'competent', france: 'combative', spain: 'naive', netherlands: 'creative' },
};

function play(config: GameConfig, turns: number) {
  const s = createGame(config);
  while (s.turn < turns && !s.gameOver) applyCommand(s, { type: 'endTurn' });
  return s;
}

describe('progress statistics', () => {
  it('records one snapshot per nation every turn of a computer-only game', () => {
    const s = play(observed, 40);
    const h = statsHistory(s);
    // Every finished turn has a snapshot, in order.
    const n = s.turn;
    expect(n).toBeGreaterThanOrEqual(40);
    expect(h.turns).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(h.nations).toEqual(observed.nations);
    for (const nation of observed.nations) {
      const rows = h.series[nation]!;
      for (const k of STAT_KEYS) expect(rows[k]).toHaveLength(n);
      expect(rows.gold[0]).toBeGreaterThan(0);
      expect(rows.explored[n - 1]).toBeGreaterThan(rows.explored[0]);
      expect(rows.score.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
    // Someone has founded a colony and put people to work by 1532.
    expect(observed.nations.some((nation) => h.series[nation]!.colonies[n - 1] > 0 && h.series[nation]!.population[n - 1] > 0)).toBe(true);
    expect(s.stats!.data.england).toHaveLength(n * STAT_KEYS.length);
  });

  it('is deterministic and survives saving and loading', () => {
    const a = play(observed, 25);
    const b = play(observed, 25);
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
    const loaded = deserialize(serialize(a));
    for (let i = 0; i < 5; i++) {
      applyCommand(loaded, { type: 'endTurn' });
      applyCommand(b, { type: 'endTurn' });
    }
    expect(JSON.stringify(loaded.stats)).toBe(JSON.stringify(b.stats));
    expect(statsHistory(loaded).turns).toEqual(Array.from({ length: loaded.turn }, (_, i) => i));
  });

  it('starts recording from load for saves without history', () => {
    const s = play(observed, 10);
    delete s.stats;
    const loaded = deserialize(serialize(s));
    expect(statsHistory(loaded).turns).toEqual([]);
    const from = loaded.turn;
    applyCommand(loaded, { type: 'endTurn' });
    const turns = statsHistory(loaded).turns;
    expect(turns[0]).toBe(from);
    expect(turns).toEqual(Array.from({ length: loaded.turn - from }, (_, i) => from + i));
  });

  it('records head starts, and keeps recording after hand-over', () => {
    const s = createGame(headStartConfig({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: ['england'] }, 30));
    playUntil(s, 30);
    const at = s.turn;
    expect(statsHistory(s).turns).toHaveLength(at);
    handOver(s);
    applyCommand(s, { type: 'endTurn' });
    const h = statsHistory(s);
    expect(s.turn).toBe(at + 1);
    expect(h.turns).toHaveLength(at + 1);
    expect(h.turns[at]).toBe(at);
    expect(h.series.england!.gold).toHaveLength(at + 1);
  });

  it('decodes to the values that were recorded', () => {
    const s = play(observed, 30);
    const expected = Object.fromEntries(observed.nations.map((n) => [n, statsSnapshot(s, n)]));
    recordStats(s);
    const h = statsHistory(s);
    expect(h.turns[h.turns.length - 1]).toBe(s.turn);
    for (const n of observed.nations) for (const k of STAT_KEYS) expect(h.series[n]![k].at(-1)).toBe(expected[n][k]);
  });

  it('keeps known statistics when a save has another layout', () => {
    const s = play(observed, 12);
    const before = statsHistory(s);
    const gold = before.series.england!.gold;
    const fathers = before.series.england!.fathers;
    // An older layout with only two statistics, in another order.
    const flat: number[] = [];
    gold.forEach((g, i) => flat.push(i ? fathers[i] - fathers[i - 1] : fathers[i], i ? g - gold[i - 1] : g));
    s.stats = { keys: ['fathers', 'gold'], turns: before.turns, data: { england: flat } };
    expect(statsHistory(s).series.england!.gold).toEqual(gold);
    applyCommand(s, { type: 'endTurn' });
    const after = statsHistory(s);
    expect(after.series.england!.gold.slice(0, gold.length)).toEqual(gold);
    expect(after.series.england!.score.slice(0, gold.length).every((v) => v === 0)).toBe(true);
    expect(after.series.france!.gold.slice(0, gold.length).every((v) => v === 0)).toBe(true);
    expect(after.turns.length).toBeGreaterThan(gold.length);
  });

  it('stays compact', () => {
    const s = play({ ...observed, nations: ['england', 'france', 'spain', 'netherlands', 'portugal', 'sweden', 'denmark', 'russia'], ai: {} }, 40);
    const bytes = JSON.stringify(s.stats).length;
    const perNationTurn = bytes / (8 * s.stats!.turns.length);
    // A full 360-turn, 8-nation game must stay well under 300 KB.
    expect(perNationTurn).toBeLessThan(50);
    expect(perNationTurn * 8 * 360).toBeLessThan(150_000);
  });
});
