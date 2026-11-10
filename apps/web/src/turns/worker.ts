/**
 * The engine worker: plays computer turns and head starts off the main thread, so the page never
 * freezes. It keeps no game of its own: each job brings its state (a structured clone of the
 * page's), and the result goes back the same way. The page stays the one source of truth.
 */
import { setFeatureSink } from '@cc/engine';
import { runJob, type WorkerReply, type WorkerRequest } from './jobs.js';

// Typed by hand: the project compiles against the DOM library, not the worker one.
const scope = self as unknown as { postMessage(reply: WorkerReply): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };
const post = (reply: WorkerReply) => scope.postMessage(reply);

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, job } = e.data;
  const started = performance.now();
  try {
    // During an end of turn, report each nation as it finishes (the engine counts 'cmd:endTurn'
    // for every nation whose turn ends). The sink only observes; it never touches the state.
    let moved = 0;
    if (job.type === 'endTurn') {
      setFeatureSink((_nation, feature) => {
        if (feature === 'cmd:endTurn') post({ id, kind: 'progress', progress: { turn: job.state.turn, moved: ++moved } });
      });
    }
    const it = runJob(job);
    for (;;) {
      const step = it.next();
      if (step.done) {
        post({ id, kind: 'done', done: step.value, workMs: performance.now() - started });
        break;
      }
      post({ id, kind: 'progress', progress: step.value });
    }
  } catch (err) {
    post({ id, kind: 'error', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) });
  } finally {
    setFeatureSink(null);
  }
};

// Tells the page the worker has loaded (an inlined worker can be refused by a strict host).
post({ id: 0, kind: 'progress', progress: { turn: 0 } });
