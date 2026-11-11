/**
 * Starts the engine worker from code inlined in the page: the single-file build (SINGLE_FILE=1)
 * swaps this module in for spawn.ts (see vite.config.ts), since it has no files beside it.
 */
import EngineWorker from './worker.ts?worker&inline';

export const spawnEngineWorker = (): Worker => new EngineWorker({ name: 'engine' });
