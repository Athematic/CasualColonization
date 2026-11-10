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
import { DEFAULT_DIFFICULTY, DIFFICULTY, DIFFICULTY_LEVELS, type DifficultyId, type DifficultyRules } from '../rules/difficulty.js';
import { TRIBES, type NationId, type TribeId } from '../rules/nations.js';
import type { SettlementKindDef } from '../rules/natives.js';
import { SCORE_WEIGHTS, type ScoreWeights } from '../rules/score.js';
import { COLONY_BUILDS, IMMIGRANT_WEIGHTS, PURCHASABLE, TRAINABLE, type UnitTypeId } from '../rules/units.js';
import type { GameConfig, GameState } from '../types.js';
import { AMERICAS } from './americas.js';
import type { Calendar } from './calendar.js';
import type { Mechanics, NationEntry, Rivals, RumourEntry, Scenario, ScenarioAi } from './types.js';

export * from './types.js';
export * from './calendar.js';
export { AMERICAS, AMERICAS_GENERATOR } from './americas.js';

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

/**
 * The kind of settlement a people lives in, in a scenario: the row its settlement-kind table gives
 * the people's lifeway.
 */
export function settlementKindIn(scenario: Scenario, tribe: TribeId): SettlementKindDef {
  const kind = scenario.peoples.settlements[TRIBES[tribe].lifeway];
  if (!kind) throw new Error(`${scenario.name} has no settlement kind for the ${TRIBES[tribe].lifeway} ${TRIBES[tribe].name}.`);
  return kind;
}

/** The kind of a settlement in its game (camp, village, city…). */
export function settlementKindOf(s: HasScenario, st: { tribe: TribeId }): SettlementKindDef {
  return settlementKindIn(scenarioOf(s), st.tribe);
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

// ---- Mechanics, difficulty, score and rumours (step 5) ----

/** Which of the engine's systems the game's scenario has switched on. */
export function mechanicsOf(s: HasScenario): Mechanics {
  return scenarioOf(s).mechanics;
}

/** The Lost City Rumours' outcomes and odds, in the order they are drawn. */
export function rumoursOf(s: HasScenario): readonly RumourEntry[] {
  return scenarioOf(s).rumours;
}

const DIFFICULTY_TABLES = new WeakMap<Scenario, Record<DifficultyId, DifficultyRules>>();

/** The engine's DIFFICULTY with a scenario's overrides merged over it (the same table when it has none). */
export function difficultyTable(scenario: Scenario): Record<DifficultyId, DifficultyRules> {
  if (!scenario.difficulty) return DIFFICULTY;
  let table = DIFFICULTY_TABLES.get(scenario);
  if (!table) {
    const over = scenario.difficulty;
    table = Object.fromEntries(DIFFICULTY_LEVELS.map((id) => [id, { ...DIFFICULTY[id], ...over[id] }])) as Record<DifficultyId, DifficultyRules>;
    DIFFICULTY_TABLES.set(scenario, table);
  }
  return table;
}

/**
 * The rules a nation plays by in its game: its own difficulty level (Conquistador when it has
 * none), with the scenario's overrides. Replaces rules/difficulty.ts `difficultyRules` wherever
 * the game is at hand.
 */
export function difficultyOf(s: HasScenario, p: { difficulty?: DifficultyId }): DifficultyRules {
  const table = difficultyTable(scenarioOf(s));
  return table[p.difficulty ?? DEFAULT_DIFFICULTY] ?? table[DEFAULT_DIFFICULTY];
}

const SCORE_TABLES = new WeakMap<Scenario, ScoreWeights>();

/** The score weights of a game: the engine's SCORE_WEIGHTS with the scenario's overrides. */
export function scoreWeightsOf(s: HasScenario): ScoreWeights {
  const scenario = scenarioOf(s);
  if (!scenario.score) return SCORE_WEIGHTS;
  let w = SCORE_TABLES.get(scenario);
  if (!w) SCORE_TABLES.set(scenario, (w = { ...SCORE_WEIGHTS, ...scenario.score }));
  return w;
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
  if (config.map) {
    if (!scenario.map.stored.some((e) => e.id === config.map)) throw new Error(`${scenario.name} has no map "${config.map}".`);
  } else if (!scenario.map.generator) {
    throw new Error(`${scenario.name} has no generated maps; choose one of its maps.`);
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
