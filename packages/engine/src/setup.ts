/**
 * What the New game screen offers for a scenario (docs/design/scenario-framework.md, section 6):
 * its nations, maps, map sizes, start years, charter and ways to win, all read from the scenario.
 * The web game (apps/web/src/ui/newgame.ts) draws its choices from this, so they can be tested
 * without a browser.
 */
import { STORED_MAPS, type StoredMap } from './maps/index.js';
import type { NationId } from './rules/nations.js';
import { firstYear, turnOfYear } from './scenarios/calendar.js';
import { nationSet, type Rivals, type Scenario } from './scenarios/index.js';
import type { MapSize } from './types.js';
import { getVictory } from './victory.js';

export interface NewGameOptions {
  /** The nations each choice of rivals offers, in the scenario's order; `real` only when it has them. */
  nations: { alternative: NationId[]; real?: NationId[] };
  /** The rivals chosen at first. */
  rivals: Rivals;
  /** Most nations in one game. */
  maxNations: number;
  /** Whether a generated map ("Random (generated)") is offered: the scenario has a generator. */
  generated: boolean;
  /** The scenario's stored maps, in its order. */
  maps: StoredMap[];
  /** The generator's map sizes; empty without a generator. */
  sizes: { id: MapSize; width: number; height: number }[];
  /** The map chosen at first: '' for a generated map, else a stored map's id. */
  defaultMap: string;
  /** The first year (a start "at the beginning"), and the years a head start can jump to with their turns. */
  firstYear: number;
  startYears: { year: number; turn: number }[];
  /** The colony charter's price when the scenario has one; false hides the option. */
  charter: false | { base: number; cap: number };
  /** The names of the scenario's ways to win, in the order they are checked. */
  victory: string[];
}

export function newGameOptions(scenario: Scenario): NewGameOptions {
  const ids = (r: Rivals) => nationSet(scenario, r).map((e) => e.id);
  const generator = scenario.map.generator;
  const maps = scenario.map.stored.map((e) => STORED_MAPS.find((m) => m.id === e.id)).filter((m): m is StoredMap => !!m);
  const defaultMap = scenario.map.default !== 'generated' ? scenario.map.default : generator ? '' : (maps[0]?.id ?? '');
  const cal = scenario.calendar;
  return {
    nations: { alternative: ids('alternative'), ...(scenario.nations.sets.real ? { real: ids('real') } : {}) },
    rivals: scenario.nations.default,
    maxNations: scenario.nations.max,
    generated: !!generator,
    maps,
    sizes: generator ? (Object.entries(generator.sizes) as [MapSize, { width: number; height: number }][]).map(([id, d]) => ({ id, ...d })) : [],
    defaultMap,
    firstYear: firstYear(cal),
    startYears: cal.headStartYears.map((year) => ({ year, turn: turnOfYear(year, cal) })),
    charter: scenario.mechanics.charter,
    victory: scenario.victory.map((v) => getVictory(v.id)?.name ?? v.id),
  };
}
