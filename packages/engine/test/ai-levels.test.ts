import { describe, expect, it } from 'vitest';
import { AI_LEVELS, applyCommand, createGame, deserialize, formatArena, runArena, serialize } from '../src/index.js';

describe('computer levels', () => {
  it('stores each nation’s level and defaults to Naive', () => {
    const s = createGame({ seed: 3, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: ['england'], ai: { france: 'creative' } });
    expect(s.players.map((p) => p.ai)).toEqual([undefined, 'creative', 'naive']);
    expect(deserialize(serialize(s)).players[1].ai).toBe('creative');
  });

  it('plays games with no people at all, every level side by side', () => {
    const s = createGame({
      seed: 9,
      mapSize: 'small',
      nations: ['england', 'france', 'netherlands', 'spain'],
      humans: [],
      ai: { england: 'naive', france: 'competent', netherlands: 'combative', spain: 'creative' },
    });
    for (let i = 0; i < 60; i++) applyCommand(s, { type: 'endTurn' });
    expect(s.turn).toBeGreaterThanOrEqual(60);
    for (const p of s.players) expect(Object.values(s.colonies).some((c) => c.owner === p.id)).toBe(true);
    expect(s.players.find((p) => p.id === 'spain')!.aiMemory?.focus).toBeDefined();
  });

  it('ranks Competent above Naive in a seeded arena', () => {
    const { summary } = runArena({ games: 2, turns: 140, mapSize: 'small', levels: ['naive', 'competent'], firstSeed: 50 });
    const score = (level: string) => summary.find((r) => r.level === level)!.score;
    expect(score('competent')).toBeGreaterThan(score('naive'));
    expect(formatArena(summary)).toContain('| Competent |');
  }, 120_000);

  it('lists four levels', () => {
    expect(AI_LEVELS).toEqual(['naive', 'competent', 'combative', 'creative']);
  });
});
