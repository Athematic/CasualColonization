/**
 * The scenario registry (docs/design/scenario-framework.md, sections 3.4 and 3.14). Scenarios
 * are registered at module load, like event sets. A game names its scenario in
 * `config.scenario`; a missing id means the Americas, so older saves and games built without it
 * are unchanged. There is no "current scenario": code that needs one reads `scenarioOf(s)` (Q8).
 */
import { SaveVersionError } from '../errors.js';
import type { BuildingKind } from '../rules/buildings.js';
import type { FatherCategory, FatherId } from '../rules/fathers.js';
import type { GoodId } from '../rules/goods.js';
import type { NationId, TribeId } from '../rules/nations.js';
import { COLONY_BUILDS, IMMIGRANT_WEIGHTS, PURCHASABLE, TRAINABLE, type UnitTypeId } from '../rules/units.js';
import type { GameConfig, GameState } from '../types.js';
import { AMERICAS } from './americas.js';
import type { Calendar } from './calendar.js';
import type { NationEntry, Rivals, Scenario, ScenarioAi } from './types.js';

export * from './types.js';
export * from './calendar.js';
export { AMERICAS } from './americas.js';

/** The scenario of games that do not name one. */
export const DEFAULT_SCENARIO = 'americas';

const SCENARIOS = new Map<string, Scenario>();

/** Registers a scenario, replacing one with the same id. */
export function registerScenario(scenario: Scenario): void {
  SCENARIOS.set(scenario.id, scenario);
}

/** The registered scenario with this id, if any. */
export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.get(id);
}

/** Every registered scenario, in the order registered (the New game screen's list). */
export function listScenarios(): Scenario[] {
  return [...SCENARIOS.values()];
}

/** The scenario a game is played in. Throws for an id this version does not have. */
export function scenarioOf(s: { config: Pick<GameConfig, 'scenario'> }): Scenario {
  const id = s.config.scenario ?? DEFAULT_SCENARIO;
  const scenario = SCENARIOS.get(id);
  if (!scenario) throw new Error(`Unknown scenario "${id}".`);
  return scenario;
}

/** The calendar a game is played by (scenarios/calendar.ts). */
export function calendarOf(s: { config: Pick<GameConfig, 'scenario'> }): Calendar {
  return scenarioOf(s).calendar;
}

// ---- Selections: what is in play (step 3) ----
// The engine iterates these instead of the catalogue's global lists. Each keeps the catalogue's
// order where the scenario does not set one, so the Americas iterate exactly as before.

type HasScenario = { config: Pick<GameConfig, 'scenario'> };

/** Goods in play, in the order of keys in markets and warehouses. */
export function goodsOf(s: HasScenario): readonly GoodId[] {
  return scenarioOf(s).goods;
}

/** Peoples in play, north to south. */
export function peoplesOf(s: HasScenario): readonly TribeId[] {
  return scenarioOf(s).peoples.ids;
}

/** Goods native settlements produce for trade. */
export function nativeProduceOf(s: HasScenario): readonly GoodId[] {
  return scenarioOf(s).peoples.produce;
}

/** Buildings in play, in production order. */
export function buildingsOf(s: HasScenario): readonly BuildingKind[] {
  return scenarioOf(s).buildings;
}

/** The scenario's council categories and members (catalogue order). */
export function councilOf(s: HasScenario): { categories: readonly FatherCategory[]; members: readonly FatherId[] } {
  return scenarioOf(s).council;
}

/** The computer players' goods lists. */
export function aiGoodsOf(s: HasScenario): ScenarioAi['goods'] {
  return scenarioOf(s).ai.goods;
}

/** The catalogue's unit lists cut down to a scenario's units, worked out once per scenario. */
interface UnitSelection {
  units: ReadonlySet<UnitTypeId>;
  /** Colonists that can be trained in Europe. */
  trainable: readonly UnitTypeId[];
  /** Ships and artillery that can be bought in Europe. */
  purchasable: readonly UnitTypeId[];
  /** Units a colony can build. */
  colonyBuilds: readonly UnitTypeId[];
  /** The weighted pool of immigrants. */
  immigrants: readonly [UnitTypeId, number][];
}

const UNIT_SELECTIONS = new WeakMap<Scenario, UnitSelection>();

/** Unit types in play and the offers made from them (Europe, colony builds, immigrants). */
export function unitsOf(s: HasScenario): UnitSelection {
  const scenario = scenarioOf(s);
  let sel = UNIT_SELECTIONS.get(scenario);
  if (!sel) {
    const units = new Set(scenario.units);
    sel = {
      units,
      trainable: TRAINABLE.filter((t) => units.has(t)),
      purchasable: PURCHASABLE.filter((t) => units.has(t)),
      colonyBuilds: (Object.keys(COLONY_BUILDS) as UnitTypeId[]).filter((t) => units.has(t)),
      immigrants: IMMIGRANT_WEIGHTS.filter(([t]) => units.has(t)),
    };
    UNIT_SELECTIONS.set(scenario, sel);
  }
  return sel;
}

/** The nations a game's setup may choose from: the chosen set, or the scenario's default. */
export function nationSet(scenario: Scenario, rivals: Rivals | undefined): NationEntry[] {
  const which = rivals ?? scenario.nations.default;
  const set = which === 'real' ? scenario.nations.sets.real : scenario.nations.sets.alternative;
  if (!set) throw new Error(`${scenario.name} has no real rivals; play it with alternative history.`);
  return set;
}

/** The scenario's entry for a nation in the game's chosen set, if it is there. */
export function nationEntry(scenario: Scenario, rivals: Rivals | undefined, nation: NationId): NationEntry | undefined {
  return nationSet(scenario, rivals).find((e) => e.id === nation);
}

/**
 * Checks a new game's settings against its scenario: the scenario exists, the number of nations
 * fits and each nation is in the chosen set. Throws an Error with a message for the player.
 */
export function checkScenarioConfig(config: GameConfig): Scenario {
  const scenario = scenarioOf({ config });
  const { max } = scenario.nations;
  if (config.nations.length < 1 || config.nations.length > max) throw new Error(`Between 1 and ${max} nations can take part.`);
  const set = nationSet(scenario, config.rivals);
  for (const nation of config.nations) {
    if (!set.some((e) => e.id === nation)) throw new Error(`${nation} is not one of the nations of ${scenario.name}.`);
  }
  return scenario;
}

/**
 * Checks a loaded save's scenario (Q3): an unknown scenario or a newer version of it is refused;
 * an older version loads only through the scenario's `migrate`, which updates the state. Throws SaveVersionError, whose
 * message the web game shows.
 */
export function checkSavedScenario(s: GameState): Scenario {
  const id = s.config.scenario ?? DEFAULT_SCENARIO;
  const scenario = SCENARIOS.get(id);
  if (!scenario) throw new SaveVersionError(`This save is from the scenario "${id}", which this version of the game does not have.`);
  const version = s.config.scenarioVersion ?? 1;
  if (version > scenario.version) {
    throw new SaveVersionError(`This save is from a newer version of ${scenario.name} (version ${version}; this game has version ${scenario.version}).`);
  }
  if (version < scenario.version) {
    if (!scenario.migrate) throw new SaveVersionError(`This save is from an older version of ${scenario.name} (version ${version}), which can't be loaded.`);
    scenario.migrate(version, s);
    s.config.scenarioVersion = scenario.version;
  }
  return scenario;
}

registerScenario(AMERICAS);
