/**
 * Runs turn jobs (jobs.ts) in the engine worker, or on the main thread where workers are not
 * available (or a host refuses the inlined one). Either way the result is the same state: the job
 * code is shared, and the engine is deterministic.
 *
 * The page owns the game. A job gets a structured clone of the page's state; while it runs the page
 * keeps drawing the old state (the map can still be scrolled) and accepts no commands; the result
 * replaces the page's state. A structured clone keeps everything a JSON round trip keeps and more
 * (undefined fields, shared references), so a game played through the worker hashes the same as one
 * played directly.
 */
import { spawnEngineWorker } from './spawn.js';
import { runJob, type Job, type JobResult, type Progress, type WorkerReply } from './jobs.js';

export type { Job, JobResult, Progress } from './jobs.js';

/** Thrown (as a rejection) when a job is cancelled. */
export class JobCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/** Timing of the last job, for play-tests and the debug handle (window.cc.turns). */
export interface JobTiming {
  type: Job['type'];
  /** From the request to the result, on the page. */
  totalMs: number;
  /** The job itself, in the worker (equal to totalMs on the main thread). */
  workMs: number;
  worker: boolean;
}

interface Pending {
  id: number;
  started: number;
  job: Job;
  onProgress?: (p: Progress) => void;
  resolve: (r: JobResult) => void;
  reject: (e: unknown) => void;
}

/** Main-thread slices: give the page a frame after this many milliseconds of work. */
const SLICE_MS = 40;

export class TurnRunner {
  private worker: Worker | null = null;
  /** No workers here (or `?worker=0` in the address, for testing): everything runs on the main thread. */
  private noWorker = typeof Worker === 'undefined' || (typeof location !== 'undefined' && /[?&]worker=0(&|$)/.test(location.search));
  private ready = false;
  private pending: Pending | null = null;
  private nextId = 1;
  private cancelMain: (() => void) | null = null;
  /** The last job's timing. */
  last?: JobTiming;

  /** Whether jobs run in a worker (false once it has fallen back to the main thread). */
  get usesWorker(): boolean {
    return !this.noWorker;
  }

  /** Runs one job. Jobs do not overlap: the page waits for one before starting the next. */
  run(job: Job, onProgress?: (p: Progress) => void): Promise<JobResult> {
    if (this.pending || this.cancelMain) return Promise.reject(new Error('A turn job is already running.'));
    const worker = this.noWorker ? null : this.spawn();
    if (!worker) return this.runHere(job, onProgress);
    return new Promise<JobResult>((resolve, reject) => {
      this.pending = { id: this.nextId++, started: performance.now(), job, onProgress, resolve, reject };
      try {
        worker.postMessage({ id: this.pending.id, job });
      } catch (err) {
        // The state could not be cloned (it should always be): play it here instead.
        console.warn('Engine worker: could not send the job, playing it on the page.', err);
        this.pending = null;
        this.runHere(job, onProgress).then(resolve, reject);
      }
    });
  }

  /** Stops the running job (a cancelled head start). Its promise rejects with JobCancelled. */
  cancel(): void {
    this.cancelMain?.();
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    // A worker cannot be interrupted mid-job: replace it.
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    p.reject(new JobCancelled());
  }

  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }

  private spawn(): Worker | null {
    if (this.worker) return this.worker;
    try {
      const w = spawnEngineWorker();
      w.onmessage = (e: MessageEvent<WorkerReply>) => this.receive(e.data);
      w.onerror = (e) => this.fail(e.message || 'the worker failed to load');
      w.onmessageerror = () => this.fail('a message could not be read');
      this.worker = w;
      return w;
    } catch (err) {
      this.noWorker = true;
      console.warn('Engine worker unavailable, playing on the page.', err);
      return null;
    }
  }

  private receive(msg: WorkerReply): void {
    if (msg.id === 0) {
      this.ready = true;
      return;
    }
    const p = this.pending;
    if (!p || msg.id !== p.id) return;
    if (msg.kind === 'progress') p.onProgress?.(msg.progress);
    else if (msg.kind === 'done') {
      this.pending = null;
      this.last = { type: p.job.type, totalMs: performance.now() - p.started, workMs: msg.workMs, worker: true };
      p.resolve(msg.done);
    } else {
      this.pending = null;
      p.reject(new Error(`Engine worker: ${msg.message}`));
    }
  }

  /**
   * The worker failed to load or crashed. If it never started (a host that refuses inlined
   * workers, a blocked script), fall back to the main thread for good and rerun the job there;
   * the job's state is the page's own and was only cloned, so nothing was lost.
   */
  private fail(reason: string): void {
    const p = this.pending;
    const neverStarted = !this.ready;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pending = null;
    if (neverStarted) {
      this.noWorker = true;
      console.warn(`Engine worker unavailable (${reason}), playing on the page.`);
      if (p) this.runHere(p.job, p.onProgress).then(p.resolve, p.reject);
    } else if (p) p.reject(new Error(`Engine worker: ${reason}`));
  }

  /**
   * The fallback: the same job on the main thread, a slice at a time, so the page still draws
   * between rounds. An end of turn is one slice (as before workers). Works on the state in place.
   */
  private runHere(job: Job, onProgress?: (p: Progress) => void): Promise<JobResult> {
    const started = performance.now();
    return new Promise<JobResult>((resolve, reject) => {
      const it = runJob(job);
      let stopped = false;
      this.cancelMain = () => {
        stopped = true;
        this.cancelMain = null;
        reject(new JobCancelled());
      };
      const slice = () => {
        if (stopped) return;
        try {
          const until = performance.now() + SLICE_MS;
          for (;;) {
            const step = it.next();
            if (step.done) {
              this.cancelMain = null;
              const ms = performance.now() - started;
              this.last = { type: job.type, totalMs: ms, workMs: ms, worker: false };
              resolve(step.value);
              return;
            }
            onProgress?.(step.value);
            if (performance.now() >= until) break;
          }
          setTimeout(slice, 0);
        } catch (err) {
          this.cancelMain = null;
          reject(err);
        }
      };
      slice();
    });
  }
}

/** One runner for the page: the worker is started on first use and then kept. */
export const turnRunner = new TurnRunner();
