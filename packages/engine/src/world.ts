import { generateMap, type EntrySide, type GeneratedWorld } from './mapgen.js';
import { storedMap, storedWorld } from './maps/index.js';
import { scenarioOf } from './scenarios/index.js';
import type { GameConfig } from './types.js';

type WorldConfig = Pick<GameConfig, 'map' | 'mapSize' | 'scenario'>;

/**
 * The world for a new game: a stored map when the config names one, otherwise a generated map,
 * both as the game's scenario makes them (its generator settings, its peoples on its stored maps).
 */
export function createWorld(rng: { rng: number }, config: WorldConfig): GeneratedWorld {
  const scenario = scenarioOf({ config });
  return config.map ? storedWorld(rng, config.map, scenario) : generateMap(rng, config.mapSize, scenario);
}

/** The edge a game's map has its arrival high seas on: the stored map's, or the scenario generator's. */
export function entrySideOf(s: { config: WorldConfig }): EntrySide {
  if (s.config.map) return storedMap(s.config.map).entrySide ?? 'east';
  return scenarioOf(s).map.generator?.entrySide ?? 'east';
}

/** The edge the Crown's forces sail in from (Scenario.map.crown): the map's arrival edge, or a fixed one. */
export function crownSideOf(s: { config: WorldConfig }): EntrySide {
  const side = scenarioOf(s).map.crown;
  return side === 'entry' ? entrySideOf(s) : side;
}
