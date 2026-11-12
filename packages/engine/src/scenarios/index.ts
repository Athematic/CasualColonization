/**
 * The scenario registry (docs/design/scenario-framework.md, sections 3.4 and 3.14). Scenarios
 * are registered at module load, like event sets. A game names its scenario in
 * `config.scenario`; a missing id means the Americas, so older saves and games built without it
 * are unchanged. There is no "current scenario": code that needs one reads `scenarioOf(s)` (Q8).
 */
import { SaveVersionError } from '../errors.js';
import { BUILDINGS, PEOPLE_BUILDINGS, type BuildingKind } from '../rules/buildings.js';
import { PEOPLE_ECONOMY, type PeopleEconomy } from '../rules/peoples.js';
import { kindOfId, systemsOfId } from '../playerkind.js';
import { ENGINE_COUNCILS } from '../rules/councils.js';
import type { GoodId } from '../rules/goods.js';
import { DEFAULT_DIFFICULTY, DIFFICULTY, DIFFICULTY_LEVELS, type DifficultyId, type DifficultyRules } from '../rules/difficulty.js';
import { TRIBES, type PeopleDef, type PlayerId, type TribeId } from '../rules/nations.js';
import { mergeNativeRules, type NativeRules, type SettlementKindDef } from '../rules/natives.js';
import type { PortCharacter } from '../rules/ports.js';
import { SCORE_WEIGHTS, type ScoreWeights } from '../rules/score.js';
import { COLONY_BUILDS, IMMIGRANT_WEIGHTS, PEOPLE_UNIT_TYPES, PURCHASABLE, TRAINABLE, type UnitTypeId } from '../rules/units.js';
import type { GameConfig, GameState } from '../types.js';
import { AMERICAS } from './americas.js';
import { CARIBBEAN } from './caribbean.js';
import { NORTH_EAST } from './north-east.js';
import { turnOfYear, yearOf, type Calendar } from './calendar.js';
import { AMERICAS_TEXT, capitalise, fillTemplate, type TermKey } from './terms.js';
import type { Council, CouncilId, CouncilTextKey, Mechanics, NationEntry, NationType, NationTypeSelection, PeopleSelection, PlayerEntry, PlayablePeople, Rivals, RumourEntry, Scenario, ScenarioAi } from './types.js';

export * from './types.js';
export * from './calendar.js';
export * from './terms.js';
export { AMERICAS, AMERICAS_GENERATOR } from './americas.js';
export { CARIBBEAN, CARIBBEAN_CALENDAR, CARIBBEAN_GENERATOR } from './caribbean.js';
export { NORTH_EAST, NORTH_EAST_CALENDAR } from './north-east.js';

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

/** Every registered scenario, in the order registered. */
export function listScenarios(): Scenario[] {
  return [...SCENARIOS.values()];
}

/** The scenarios people can choose on the New game screen: the registered ones not `hidden`. */
export function playableScenarios(): Scenario[] {
  return listScenarios().filter((sc) => !sc.hidden);
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

// ---- Terms and nations (step 7) ----

/** A game, or a scenario itself (the New game screen has no game yet). */
export type ScenarioLike = Scenario | { config: Pick<GameConfig, 'scenario' | 'rivals'> };

function asScenario(x: ScenarioLike): Scenario {
  return 'config' in x ? scenarioOf(x) : x;
}

const TERMS = new WeakMap<Scenario, Record<string, string>>();

/** A scenario's whole term table: its own terms over the Americas'. */
export function termsOf(x: ScenarioLike): Readonly<Record<TermKey, string>> {
  const scenario = asScenario(x);
  let table = TERMS.get(scenario);
  if (!table) TERMS.set(scenario, (table = { ...AMERICAS_TEXT, ...scenario.text }));
  return table as Record<TermKey, string>;
}

/**
 * A scenario's term (scenarios/terms.ts), with a template's placeholders filled from `vars` and the
 * scenario's other terms: `term(s, 'homeland')` is "Europe" in the Americas.
 */
export function term(x: ScenarioLike, key: TermKey, vars?: Readonly<Record<string, string | number>>): string {
  const terms = termsOf(x);
  return fillTemplate(terms[key], terms, vars);
}

/** Fills a text's `{term}` placeholders with the scenario's terms (STAT_INFO's descriptions, for one). */
export function withTerms(x: ScenarioLike, text: string): string {
  return fillTemplate(text, termsOf(x));
}

/** A term with a capital first letter, for the start of a sentence ("The Crown"). */
export function Term(x: ScenarioLike, key: TermKey, vars?: Readonly<Record<string, string | number>>): string {
  return capitalise(term(x, key, vars));
}

const NATION_TABLES = new WeakMap<Scenario, Map<string, ReadonlyMap<PlayerId, PlayerEntry>>>();

/**
 * The nations a game knows, by id: its chosen set first (real rivals or alternative history), then
 * the scenario's other set, then the Crown, the companies and the peoples it lets play as nations.
 * Worked out once per scenario and choice.
 */
function nationTable(scenario: Scenario, rivals: Rivals | undefined): ReadonlyMap<PlayerId, PlayerEntry> {
  let byRivals = NATION_TABLES.get(scenario);
  if (!byRivals) NATION_TABLES.set(scenario, (byRivals = new Map()));
  const key = rivals ?? '';
  let table = byRivals.get(key);
  if (!table) {
    const { sets } = scenario.nations;
    const first = (rivals ?? scenario.nations.default) === 'real' && sets.real ? sets.real : sets.alternative;
    const map = new Map<PlayerId, PlayerEntry>();
    for (const e of [...first, ...sets.alternative, ...(sets.real ?? []), scenario.nations.crown, ...(scenario.nations.companies ?? [])]) if (!map.has(e.id)) map.set(e.id, e);
    for (const pp of scenario.peoples.playable ?? []) if (!map.has(pp.id)) map.set(pp.id, peopleEntry(scenario, pp));
    byRivals.set(key, (table = map));
  }
  return table;
}

/** A playing people as a player (native-nations.md T1): its own name and colour, no bonus, no home port. */
function peopleEntry(scenario: Scenario, pp: PlayablePeople): PlayerEntry {
  const def = peopleIn(scenario, pp.id);
  return { id: pp.id, name: pp.name ?? def.name, adjective: pp.adjective ?? def.name, color: def.color, bonus: { text: '' }, colonyNames: pp.townNames, port: { name: '' } };
}

/** The peoples a scenario lets setup play as nations (T4); none in the Americas and the Caribbean. */
export function playablePeoples(scenario: Scenario): readonly PlayablePeople[] {
  return scenario.peoples.playable ?? [];
}

/**
 * The catalogue selection of a nation type (native-nations.md T6, T7, T8): the scenario's
 * `nationTypes.european` for European nations (companies and the Crown use it too), its
 * `nationTypes.people` for a playing people, or the engine's `PEOPLE_SELECTION`.
 */
export function nationTypeIn(scenario: Scenario, type: 'people'): PeopleSelection;
export function nationTypeIn(scenario: Scenario, type: NationType): NationTypeSelection;
export function nationTypeIn(scenario: Scenario, type: NationType): NationTypeSelection {
  return type === 'european' ? scenario.nationTypes.european : (scenario.nationTypes.people ?? PEOPLE_SELECTION);
}

/** A game's catalogue selection for a nation type (`nationTypeIn`). */
export function nationTypeOf(s: HasScenario, type: 'people'): PeopleSelection;
export function nationTypeOf(s: HasScenario, type: NationType): NationTypeSelection;
export function nationTypeOf(s: HasScenario, type: NationType): NationTypeSelection {
  return nationTypeIn(scenarioOf(s), type);
}

/**
 * The unit a colony grows by (colony.ts): a free colonist; in a playing people's town the first unit
 * of the people's selection (the townsperson, T10).
 */
export function bornType(s: HasScenario, owner: PlayerId): UnitTypeId {
  return kindOfId(owner) === 'people' ? nationTypeOf(s, 'people').units[0] : 'freeColonist';
}

/**
 * The engine's selection for a playing people when its scenario names none: the people's own
 * units and buildings of the catalogue (native-nations.md T6, T7; Beta 3 step 2). `units[0]` is the
 * unit a town is peopled and grows with (the townsperson).
 */
export const PEOPLE_SELECTION: PeopleSelection = {
  units: [...PEOPLE_UNIT_TYPES],
  buildings: [...PEOPLE_BUILDINGS],
  council: 'people',
};

const ECONOMIES = new WeakMap<Scenario, PeopleEconomy>();

/** A game's rules for a playing people's stores and gardens: the engine's PEOPLE_ECONOMY with the scenario's `peopleEconomy`. */
export function peopleEconomyOf(s: HasScenario): PeopleEconomy {
  const scenario = scenarioOf(s);
  if (!scenario.peopleEconomy) return PEOPLE_ECONOMY;
  let e = ECONOMIES.get(scenario);
  if (!e) ECONOMIES.set(scenario, (e = { ...PEOPLE_ECONOMY, ...scenario.peopleEconomy }));
  return e;
}

/**
 * A player as its game's scenario has it (Q2): name, adjective, colour, bonus, colony names and
 * home port. The Crown is `scenario.nations.crown`; a playing people has its own entry (T1).
 * Throws for a player the scenario does not have.
 */
export function nationOf(x: ScenarioLike, nation: PlayerId): PlayerEntry {
  const scenario = asScenario(x);
  const e = nationTable(scenario, 'config' in x ? x.config.rivals : undefined).get(nation);
  if (!e) throw new Error(`${nation} is not one of the nations of ${scenario.name}.`);
  return e;
}

const NO_CHARACTER: PortCharacter = {};

/** The character of a nation's home port in its game's scenario (rules/ports.ts); none for the Crown. */
export function portMarketOf(x: ScenarioLike, nation: PlayerId): PortCharacter {
  return nationOf(x, nation).port.market ?? NO_CHARACTER;
}

/** A nation's name for the start of a sentence or a table cell ("The Netherlands"). */
export function nationTitle(x: ScenarioLike, nation: PlayerId): string {
  return capitalise(nationOf(x, nation).name);
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

const PEOPLES = new WeakMap<Scenario, Map<TribeId, PeopleDef>>();

/**
 * A people as its game's scenario has it: the catalogue's entry (TRIBES), with the scenario's own
 * skills or wants where it overrides them. Without overrides it is the catalogue's object itself.
 */
export function peopleOf(s: HasScenario, tribe: TribeId): PeopleDef {
  return peopleIn(scenarioOf(s), tribe);
}

/** A people as a scenario has it (`peopleOf` for a game). */
export function peopleIn(scenario: Scenario, tribe: TribeId): PeopleDef {
  const over = scenario.peoples.overrides?.[tribe];
  if (!over) return TRIBES[tribe];
  let table = PEOPLES.get(scenario);
  if (!table) PEOPLES.set(scenario, (table = new Map()));
  let def = table.get(tribe);
  if (!def) {
    // Its score weights and victory params (T14) are read by score.ts and peoplevictory.ts, not part of the people.
    const { score: _score, victory: _victory, ...own } = over;
    table.set(tribe, (def = { ...TRIBES[tribe], ...own }));
  }
  return def;
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

const LAND_REACH = new WeakMap<Scenario, { max: number; uniform: boolean }>();

/**
 * How far the land of a scenario's settlements reaches (`SettlementKindDef.landRadius`, 1 when
 * absent): the furthest, and whether every kind reaches as far. For natives.ts `nativeLandOwner`.
 */
export function landReachIn(scenario: Scenario): { max: number; uniform: boolean } {
  let reach = LAND_REACH.get(scenario);
  if (!reach) {
    const radii = Object.values(scenario.peoples.settlements).map((k) => k?.landRadius ?? 1);
    const max = Math.max(1, ...radii);
    LAND_REACH.set(scenario, (reach = { max, uniform: radii.every((r) => r === max) }));
  }
  return reach;
}

/** How far a game's native land reaches (`landReachIn`). */
export function landReachOf(s: HasScenario): { max: number; uniform: boolean } {
  return landReachIn(scenarioOf(s));
}

const NATIVE_RULE_TABLES = new WeakMap<Scenario, NativeRules>();

/** The native rules of a scenario: the engine's NATIVE_RULES with its `peoples.rules` merged over them. */
export function nativeRulesIn(scenario: Scenario): NativeRules {
  let rules = NATIVE_RULE_TABLES.get(scenario);
  if (!rules) NATIVE_RULE_TABLES.set(scenario, (rules = mergeNativeRules(scenario.peoples.rules)));
  return rules;
}

/** The native rules of a game (braves, tension thresholds, demands, burial grounds, surrender, missions). */
export function nativeRulesOf(s: HasScenario): NativeRules {
  return nativeRulesIn(scenarioOf(s));
}

/**
 * Buildings in play, in production order: the owner's nation type's (T7), a playing people's own;
 * with no owner, the European nations'.
 */
export function buildingsOf(s: HasScenario, owner?: PlayerId): readonly BuildingKind[] {
  return nationTypeOf(s, owner !== undefined && kindOfId(owner) === 'people' ? 'people' : 'european').buildings;
}

/**
 * A new colony's buildings: each of the owner's buildings at its first level. A playing people's
 * town also lists the European buildings at level 0, so rules that ask for a building it does not
 * have (docks, a stockade, a schoolhouse) read "none".
 */
export function newColonyBuildings(s: HasScenario, owner: PlayerId): Record<BuildingKind, number> {
  const own = buildingsOf(s, owner);
  const european = nationTypeOf(s, 'european').buildings;
  const out: Partial<Record<BuildingKind, number>> = {};
  if (own !== european) for (const k of european) out[k] = 0;
  for (const k of own) out[k] = BUILDINGS[k].initialLevel;
  return out as Record<BuildingKind, number>;
}

/** The id of a nation type's council (native-nations.md T8): its selection's `council`. */
export function councilIdOf(x: ScenarioLike, type: NationType): CouncilId {
  return nationTypeIn(asScenario(x), type).council;
}

/** A council by id: the scenario's, else the engine's (a people's council, rules/councils.ts). */
export function councilById(scenario: Scenario, id: CouncilId): Council | undefined {
  return Object.hasOwn(scenario.councils, id) ? scenario.councils[id] : ENGINE_COUNCILS[id];
}

/**
 * The council a player sits: a nation's (the Congress), a playing people's; none for a company or
 * the Crown (playerkind.ts `council`).
 */
export function councilOf(x: ScenarioLike, player: PlayerId): Council | undefined {
  const type = systemsOfId(player).council;
  return type ? councilById(asScenario(x), councilIdOf(x, type)) : undefined;
}

/**
 * A council's word for itself (`Council.text`), else the scenario's term (`council`,
 * `councilShort`, `member`, `members`); its product is "bells" unless it names its own.
 */
export function councilText(x: ScenarioLike, player: PlayerId, key: CouncilTextKey): string {
  const own = councilOf(x, player)?.text?.[key];
  if (own !== undefined) return own;
  return key === 'product' ? 'bells' : term(x, key);
}

/** `councilText` with a capital first letter. */
export function CouncilText(x: ScenarioLike, player: PlayerId, key: CouncilTextKey): string {
  return capitalise(councilText(x, player, key));
}

/**
 * A turn threshold tuned for the Americas (a date in a 609-turn game from 1492: "wars after turn
 * 50"), scaled by the scenario's `ai.pace` and rounded. At pace 1 it is the turn itself, so the
 * Americas play exactly as before. Lengths in turns ("40 turns after the last war") are not scaled:
 * a turn is half a year in every scenario so far, so a cooldown takes as long in game time.
 */
export function aiTurn(s: HasScenario, turn: number): number {
  const scenario = scenarioOf(s);
  if (scenario.ai.dates) {
    // The Americas' year of that turn, its distance from 1492 stretched where the scenario asks (`ai.stretch`).
    const year = yearOf(turn).year;
    const first = yearOf(0).year;
    const stretch = scenario.ai.stretch ?? 1;
    return turnOfYear(stretch === 1 ? year : Math.round(first + (year - first) * stretch), scenario.calendar);
  }
  const pace = scenario.ai.pace ?? 1;
  return pace === 1 ? turn : Math.round(turn * pace);
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
const PEOPLE_UNIT_SELECTIONS = new WeakMap<Scenario, UnitSelection>();

/**
 * Unit types in play and the offers made from them (Europe, colony builds, immigrants). With an
 * owner that is a playing people: its own selection (T6), what its towns build; nothing from Europe.
 */
export function unitsOf(s: HasScenario, owner?: PlayerId): UnitSelection {
  const scenario = scenarioOf(s);
  if (owner !== undefined && kindOfId(owner) === 'people') {
    let own = PEOPLE_UNIT_SELECTIONS.get(scenario);
    if (!own) {
      const units = new Set(nationTypeOf(s, 'people').units);
      own = { units, trainable: [], purchasable: [], colonyBuilds: (Object.keys(COLONY_BUILDS) as UnitTypeId[]).filter((t) => units.has(t)), immigrants: [] };
      PEOPLE_UNIT_SELECTIONS.set(scenario, own);
    }
    return own;
  }
  let sel = UNIT_SELECTIONS.get(scenario);
  if (!sel) {
    const units = new Set(nationTypeIn(scenario, 'european').units);
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

const PEOPLE_SCORE_TABLES = new WeakMap<Scenario, Map<TribeId, ScoreWeights>>();

/**
 * The score weights for one player: the game's (`scoreWeightsOf`), with a playing people's own
 * (`peoples.overrides[id].score`, native-nations.md T14) over them.
 */
export function scoreWeightsFor(s: HasScenario, id: PlayerId): ScoreWeights {
  const w = scoreWeightsOf(s);
  const scenario = scenarioOf(s);
  const own = scenario.peoples.overrides?.[id as TribeId]?.score;
  if (!own) return w;
  let table = PEOPLE_SCORE_TABLES.get(scenario);
  if (!table) PEOPLE_SCORE_TABLES.set(scenario, (table = new Map()));
  let out = table.get(id as TribeId);
  if (!out) table.set(id as TribeId, (out = { ...w, ...own }));
  return out;
}

/** The nations a game's setup may choose from: the chosen set, or the scenario's default. */
export function nationSet(scenario: Scenario, rivals: Rivals | undefined): NationEntry[] {
  const which = rivals ?? scenario.nations.default;
  const set = which === 'real' ? scenario.nations.sets.real : scenario.nations.sets.alternative;
  if (!set) throw new Error(`${scenario.name} has no real rivals; play it with alternative history.`);
  return set;
}

/** The scenario's entry for a nation in the game's chosen set, if it is there. */
export function nationEntry(scenario: Scenario, rivals: Rivals | undefined, nation: PlayerId): NationEntry | undefined {
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
  // Peoples playing as nations (native-nations.md T4): only those the scenario names as playable.
  const peoples = config.peoples ?? [];
  if (new Set(peoples).size !== peoples.length) throw new Error('Each people can only take part once.');
  for (const people of peoples) {
    if (!playablePeoples(scenario).some((e) => e.id === people)) throw new Error(`${people} is not a people ${scenario.name} lets play as a nation.`);
    if (!scenario.peoples.ids.includes(people)) throw new Error(`${people} is not one of the peoples of ${scenario.name}.`);
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
registerScenario(CARIBBEAN);
registerScenario(NORTH_EAST);
