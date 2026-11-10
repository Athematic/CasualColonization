/** Starts the engine worker from its own file next to the page (the normal build). */
import EngineWorker from './worker.ts?worker';

export const spawnEngineWorker = (): Worker => new EngineWorker({ name: 'engine' });
