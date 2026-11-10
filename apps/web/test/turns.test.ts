/**
 * The engine worker's jobs (apps/web/src/turns/jobs.ts) give the same games as the engine played
 * directly, also when the state is structured-cloned before every job, as it is on its way to and
 * from the worker. The browser side (worker vs. main thread vs. bench hash) is checked by a
 * Playwright run; see the 0.10 notes.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, handOver, headStartConfig, playUntil, serialize, type GameConfig, type GameState, type NationId } from '@cc/engine';
import { runJob, type Job, type JobResult } from '../src/turns/jobs.js';

const config = (seed: number, humans: NationId[]): GameConfig => {
  const nations: NationId[] = ['england', 'france', 'netherlands', 'spain'];
  return {
    seed,
    mapSize: 'medium',
    nations,
    humans,
    ai: Object.fromEntries(nations.filter((n) => !humans.includes(n)).map((n) => [n, 'competent'])),
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
  };
};

/** Runs a job as the worker does: on a structured clone, to the end. */
function inWorker(job: Job): JobResult {
  const it = runJob(structuredClone(job));
  for (;;) {
    const step = it.next();
    if (step.done) return structuredClone(step.value);
  }
}

describe('turn jobs', () => {
  it('a head start in a job is the head start played directly', () => {
    const cfg = headStartConfig(config(31, ['england']), 40);
    const direct = createGame(cfg);
    playUntil(direct, 40);
    handOver(direct);
    const { state } = inWorker({ type: 'headStart', config: cfg, turn: 40 });
    expect(serialize(state)).toBe(serialize(direct));
  });

  it('ends of turn on a cloned state give the same game, and the message marks line up', () => {
    const direct = createGame(config(5, ['england']));
    let viaJobs: GameState = structuredClone(direct);
    for (let i = 0; i < 25; i++) {
      // The person does nothing but end the turn.
      expect(applyCommand(direct, { type: 'endTurn' }).ok).toBe(true);
      const before = viaJobs.messages;
      const done = inWorker({ type: 'endTurn', state: viaJobs });
      expect(done.result?.ok).toBe(true);
      // The last message seen before the job is found again at its index minus the dropped count.
      const last = before[before.length - 1];
      const at = before.length - 1 - (done.dropped ?? 0);
      if (last && at >= 0) expect(done.state.messages[at]).toEqual(last);
      viaJobs = done.state;
      expect(serialize(viaJobs)).toBe(serialize(direct));
    }
    expect(direct.turn).toBeGreaterThan(20);
  });

  it('observer rounds stop at the head-start turn and match direct play', () => {
    const cfg = headStartConfig(config(77, ['france']), 12);
    const direct = createGame(cfg);
    playUntil(direct, 12);
    let s = createGame(cfg);
    while (s.turn < 12) s = inWorker({ type: 'rounds', state: s, rounds: 5, stopAt: 12 }).state;
    expect(s.turn).toBe(12);
    expect(serialize(s)).toBe(serialize(direct));
  });
});
