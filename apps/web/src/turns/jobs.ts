/**
 * The heavy work of a turn, written once and run either in a Web Worker (worker.ts) or, where
 * workers are unavailable, on the main thread in small slices (runner.ts). Each job is a
 * generator: it yields progress between rounds and returns the resulting state. Nothing here
 * touches the page, so the same code runs in Node (apps/web/test/turns.test.ts).
 */
import { applyCommand, createGame, handOver, playUntil, type CommandResult, type GameConfig, type GameState } from '@cc/engine';

export type Job =
  /** A head start played without drawing the map: create the game, play to `turn`, hand over. */
  | { type: 'headStart'; config: GameConfig; turn: number }
  /** The person ends their turn: the computer players move until a person is up again. */
  | { type: 'endTurn'; state: GameState }
  /** Whole rounds of an all-computer game (observer mode, a watched head start), stopping at `stopAt`. */
  | { type: 'rounds'; state: GameState; rounds: number; stopAt?: number };

export interface Progress {
  /** The turn the game has reached. */
  turn: number;
  /** The turn the job plays to (head starts), if known. */
  target?: number;
  /** During an end of turn: nations that have finished moving since it began (the person's own first). */
  moved?: number;
}

export interface JobResult {
  state: GameState;
  /** The end-of-turn command's own result (endTurn only). */
  result?: CommandResult;
  /**
   * How many of the messages the job started with have been dropped from the front of the capped
   * log, so the page can find its own markers in the returned (cloned) log.
   */
  dropped?: number;
}

/** Counts the messages dropped from the front of the log while `play` runs. */
function* tracked(s: GameState, play: Generator<Progress, JobResult, void>): Generator<Progress, JobResult, void> {
  // The log is spliced in place, so take its length now.
  const n = s.messages.length;
  const last = s.messages[n - 1];
  const r = yield* play;
  const at = last ? r.state.messages.lastIndexOf(last) : -1;
  r.dropped = !last ? 0 : at < 0 ? n : n - 1 - at;
  return r;
}

export function runJob(job: Job): Generator<Progress, JobResult, void> {
  return job.type === 'headStart' ? play(job) : tracked(job.state, play(job));
}

function* play(job: Job): Generator<Progress, JobResult, void> {
  switch (job.type) {
    case 'headStart': {
      const state = createGame(job.config);
      yield { turn: state.turn, target: job.turn };
      while (!playUntil(state, job.turn, 1)) yield { turn: state.turn, target: job.turn };
      handOver(state);
      return { state };
    }
    case 'endTurn': {
      const result = applyCommand(job.state, { type: 'endTurn' });
      return { state: job.state, result };
    }
    case 'rounds': {
      const s = job.state;
      for (let i = 0; i < job.rounds && !s.gameOver; i++) {
        if (job.stopAt !== undefined && s.turn >= job.stopAt) break;
        applyCommand(s, { type: 'endTurn' });
        if (i + 1 < job.rounds) yield { turn: s.turn, target: job.stopAt };
      }
      return { state: s };
    }
  }
}

/** Messages from the worker. */
export type WorkerReply =
  | { id: number; kind: 'progress'; progress: Progress }
  | { id: number; kind: 'done'; done: JobResult; workMs: number }
  | { id: number; kind: 'error'; message: string };

/** Messages to the worker. */
export interface WorkerRequest {
  id: number;
  job: Job;
}
