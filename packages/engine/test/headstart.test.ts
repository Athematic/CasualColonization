import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, handOver, headStartConfig, playUntil, unitsAwaitingOrders } from '../src/index.js';

describe('head start', () => {
  it('lets the computer play the player’s nation, then hands it over', () => {
    const config = headStartConfig({ seed: 21, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: ['england'], ai: { france: 'competent' } }, 60);
    expect(config.humans).toEqual([]);
    expect(config.ai?.england).toBe('creative');
    const s = createGame(config);
    expect(playUntil(s, 60)).toBe(true);
    expect(s.turn).toBeGreaterThanOrEqual(60);
    expect(Object.values(s.colonies).some((c) => c.owner === 'england')).toBe(true);

    handOver(s);
    const england = s.players.find((p) => p.id === 'england')!;
    expect(england.human).toBe(true);
    expect(england.ai).toBeUndefined();
    expect(s.config.headStart).toBeUndefined();
    expect(s.config.humans).toEqual(['england']);
    // It is now the player's turn, and the game waits for them.
    expect(s.players[s.current].id).toBe('england');
    const turn = s.turn;
    expect(applyCommand(s, { type: 'endTurn' }).ok).toBe(true);
    expect(s.turn).toBe(turn + 1);
    expect(s.players[s.current].id).toBe('england');
    expect(Array.isArray(unitsAwaitingOrders(s, 'england'))).toBe(true);
  });

  it('can play in small steps for a progress bar', () => {
    const s = createGame(headStartConfig({ seed: 2, mapSize: 'small', nations: ['france'], humans: ['france'] }, 30));
    let steps = 0;
    while (!playUntil(s, 30, 3)) steps++;
    expect(steps).toBeGreaterThan(3);
    expect(s.turn).toBeGreaterThanOrEqual(30);
  });
});
