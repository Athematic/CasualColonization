import { generateMap, type GeneratedWorld } from './mapgen.js';
import { storedWorld } from './maps/index.js';
import { scenarioOf } from './scenarios/index.js';
import type { GameConfig } from './types.js';

/** The world for a new game: a stored map when the config names one, otherwise a generated map. */
export function createWorld(rng: { rng: number }, config: Pick<GameConfig, 'map' | 'mapSize' | 'scenario'>): GeneratedWorld {
  const scenario = scenarioOf({ config });
  return config.map ? storedWorld(rng, config.map, scenario) : generateMap(rng, config.mapSize, scenario);
}
