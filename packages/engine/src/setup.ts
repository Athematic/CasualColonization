/**
 * What the New game screen offers for a scenario (docs/design/scenario-framework.md, section 6):
 * its nations, maps, map sizes, start years, charter and ways to win, all read from the scenario.
 * The web game (apps/web/src/ui/newgame.ts) draws its choices from this, so they can be tested
 * without a browser.
 */
import { STORED_MAPS, type StoredMap } from './maps/index.js';
import { TRIBES, type NationId, type TribeId } from './rules/nations.js';
import { firstYear, turnOfYear } from './scenarios/calendar.js';
import { nationEntry, nationSet, playablePeoples, scenarioOf, type Rivals, type Scenario, peopleIn } from './scenarios/index.js';
import type { GameConfig, MapSize } from './types.js';
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
  /**
   * The peoples setup may play as nations (native-nations.md T4), in the scenario's order, with
   * their names ("the Haudenosaunee") and colours; empty in the Americas and the Caribbean.
   */
  peoples: { id: TribeId; name: string; color: string; lifeway: string }[];
  /**
   * True when no nation is there at the start (every nation arrives later, T18): a game is then
   * a people's game, and the screen offers a people to play first.
   */
  peoplesFirst: boolean;
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
    peoples: playablePeoples(scenario).map((pp) => ({
      id: pp.id,
      name: pp.name ?? peopleIn(scenario, pp.id).name,
      color: TRIBES[pp.id].color,
      lifeway: LIFEWAY_WORDS[TRIBES[pp.id].lifeway] ?? '',
    })),
    peoplesFirst: !!playablePeoples(scenario).length && ids('alternative').every((id) => (arrivalYear(scenario, 'alternative', id) ?? 0) > firstYear(cal)),
  };
}

/** A people's way of life in words, for the New game screen. */
const LIFEWAY_WORDS: Record<string, string> = {
  nomadic: 'Hunting and fishing camps',
  agricultural: 'Farming towns',
  urban: 'Cities',
};

/** The year a nation of the chosen set arrives (native-nations.md T18), or undefined when it is there from the start. */
export function arrivalYear(scenario: Scenario, rivals: Rivals | undefined, nation: NationId): number | undefined {
  const year = nationEntry(scenario, rivals, nation)?.arrives;
  return year !== undefined && year > firstYear(scenario.calendar) ? year : undefined;
}

/**
 * The turn a new game hands over to its persons when they play only nations that arrive later
 * (native-nations.md T16 and T18, section 11 choice 8): the turn before the first of their
 * arrivals, so the computer plays the years before as a head start (in the engine worker, with a
 * progress bar) rather than inside `createGame`, and the nation arrives as the person's in its
 * year (`handOver` leaves a nation still to come to arrive with its person). 0 when a person plays
 * a people, or a nation there from the start.
 */
export function arrivalStartTurn(config: GameConfig): number {
  const humans = config.humans;
  if (!humans.length) return 0;
  const scenario = scenarioOf({ config });
  let first = Infinity;
  for (const id of humans) {
    if (!config.nations.includes(id as NationId)) return 0;
    const year = arrivalYear(scenario, config.rivals, id as NationId);
    if (year === undefined) return 0;
    first = Math.min(first, turnOfYear(year, scenario.calendar));
  }
  return Number.isFinite(first) ? Math.max(0, first - 1) : 0;
}
