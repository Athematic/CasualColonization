/**
 * The scenario definition (docs/design/scenario-framework.md, section 3). A scenario is a package
 * of data the engine reads instead of its fixed tables. This is the 0.9 skeleton: it holds what
 * today's tables already say for the Americas; the optional fields are filled by later steps of
 * the plan (section 8) as the engine starts reading them.
 *
 * Definitions keyed by id (nations, peoples, goods, council members) stay in the global catalogue
 * (rules/*); a scenario only selects which are in play, in what order, with its own game facts
 * (section 3.1). Everything here is JSON-shaped except `migrate`.
 */
import type { BuildingKind } from '../rules/buildings.js';
import type { DifficultyId, DifficultyRules } from '../rules/difficulty.js';
import type { FatherCategory, FatherId } from '../rules/fathers.js';
import type { GoodId } from '../rules/goods.js';
import type { Modifier, RumourOutcome } from '../rules/modifiers.js';
import type { Effect } from '../events/types.js';
import type { Lifeway, NationId, PeopleDef, TribeId } from '../rules/nations.js';
import type { SettlementKindDef } from '../rules/natives.js';
import type { PortEntry } from '../rules/ports.js';
import type { ScoreWeights } from '../rules/score.js';
import type { UnitTypeId } from '../rules/units.js';
import type { EntrySide } from '../mapgen.js';
import type { TerrainId } from '../rules/terrain.js';
import type { GameState, MapSize } from '../types.js';
import type { Calendar } from './calendar.js';
import type { ScenarioText } from './terms.js';

export type ScenarioId = string;

/** Which nation set a game's setup offered: as in history, or any nations. */
export type Rivals = 'real' | 'alternative';

export interface Scenario {
  id: ScenarioId;
  /**
   * Bumped only when a change to this scenario's data would make old saves play wrongly (a removed
   * or renamed id, a changed calendar), not for tuning (section 3.14, Q3).
   */
  version: number;
  name: string;
  description: string;
  /**
   * Left out of the New game screen's Scenario select (test scenarios and works in progress). A
   * hidden scenario still loads and plays.
   */
  hidden?: boolean;

  /** How turns map to years, when the game ends and where head starts can jump to. */
  calendar: Calendar;
  map: ScenarioMap;
  /** Terrains in play (rules/terrain.ts): the generator and the scenario's stored maps use only these. */
  terrain: readonly TerrainId[];
  nations: ScenarioNations;
  peoples: ScenarioPeoples;
  /** Goods in play; the order is the order of keys in markets and warehouses. */
  goods: readonly GoodId[];
  /**
   * Unit types in play, in catalogue order. Only units on this list are offered in Europe, built
   * in colonies or arrive as immigrants; the engine's named slots (treasure, the REF's units, the
   * starting ship) are expected to be on it.
   */
  units: readonly UnitTypeId[];
  /**
   * Buildings in play, in catalogue order (the order production runs in: tools are made before
   * the armory uses them). Colonies only have these.
   */
  buildings: readonly BuildingKind[];
  council: Council;
  /** What the computer players need to know about the scenario's content. */
  ai: ScenarioAi;
  /** Id of a registered event set (events/index.ts). `config.eventSet` overrides it (tests). */
  events: string;
  /** Which of the engine's systems are in play (step 5). */
  mechanics: Mechanics;
  /**
   * How the game can end, checked in this order (victory.ts registers the kinds). The first rule
   * that ends the game decides the reason and the winner.
   */
  victory: VictoryRule[];
  /** The outcomes of a Lost City Rumour and their odds, in the order they are drawn (rumours.ts). */
  rumours: RumourEntry[];
  /** Overrides merged over the engine's DIFFICULTY per level; absent levels and fields keep the engine's values. */
  difficulty?: Partial<Record<DifficultyId, Partial<DifficultyRules>>>;
  /** Overrides merged over the engine's SCORE_WEIGHTS; absent fields keep the engine's values. */
  score?: Partial<ScoreWeights>;
  /**
   * The scenario's terms (scenarios/terms.ts): the words and templates it changes; the others are
   * the Americas'. Read with `term(s, key)`.
   */
  text?: ScenarioText;
  /** The scenario's pictures in the web game; absent ones are the Americas'. */
  art?: ScenarioArt;

  /**
   * Converts a save made with an older version of this scenario. Without it such saves are
   * refused (Q3). Must leave the state as if the game had been created with `version`.
   */
  migrate?: (from: number, s: GameState) => void;
}

/**
 * Switches for the engine's systems (docs/design/scenario-framework.md, section 3.12). A system
 * that is off is skipped where it would run, its commands are refused with a reason, the computer
 * players do not try it, and the web game hides its buttons. A system that is off draws no random
 * numbers. The Americas switch everything on.
 */
export interface Mechanics {
  /** The Crown raises the tax rate after sales in the home port (europe.ts). */
  taxes: boolean;
  /** A tax raise may be refused, boycotting the good until arrears are paid. Off: every raise simply applies. */
  boycotts: boolean;
  /** The King demands gold from the treasury (crown.ts). */
  demands: boolean;
  /** The King drags the nation into wars with other European nations (crown.ts). */
  royalWars: boolean;
  /**
   * The Crown builds up a Royal Expeditionary Force during the game (crown.ts), and adds regulars
   * when a demand is refused. `independence` needs it.
   */
  ref: boolean;
  /** Nations may declare independence and fight the War of Independence (independence.ts, rebellion.ts). */
  independence: boolean;
  /** Favoured Nation status between European nations (relations.ts). Trade agreements stay either way. */
  favoured: boolean;
  /**
   * The colony charter's price (rules/difficulty.ts COLONY_CHARTER: `base` gold per colony held, at
   * most `cap`), when the game uses the rule (`GameConfig.colonyCharter`); false: never a charter.
   */
  charter: false | { base: number; cap: number };
  /** The custom house can be built, and sells a colony's exports (europe.ts). */
  customHouse: boolean;
  /** Missionaries found missions among the natives and denounce rivals' missions (natives.ts). */
  missions: boolean;
}

/** One way the game can end: a registered victory kind (victory.ts) and its data. */
export interface VictoryRule {
  /** 'time', 'independence-war', or another registered kind. */
  id: string;
  params?: Record<string, unknown>;
}

/**
 * One outcome of a Lost City Rumour with its odds (rumours.ts). The weight is `weight` (or `scout`
 * for a unit in the scout role, `expert` for a seasoned scout), times the explorer's
 * `rumourOutcome` modifiers (Hernando de Soto), times the difficulty multiplier named by `difficulty`.
 */
export interface RumourEntry {
  outcome: RumourOutcome;
  weight: number;
  /** Weight for a unit in the scout role, instead of `weight`. */
  scout?: number;
  /** Weight for a seasoned scout, instead of `scout` and `weight`. */
  expert?: number;
  /** The difficulty rule that scales this outcome's odds (rules/difficulty.ts). */
  difficulty?: 'rumourGood' | 'rumourBad' | 'burialGrounds';
  /** Only on tribal land (a burial ground); otherwise left out of the draw. */
  tribal?: boolean;
}

export interface ScenarioMap {
  /** The stored maps this scenario offers (maps/index.ts), each with the scenario's peoples on it. */
  stored: StoredMapEntry[];
  /** How a generated map is made; absent when the scenario has stored maps only. */
  generator?: GeneratorSettings;
  /** 'generated', or the id of a stored map. */
  default: 'generated' | string;
  /** Bonus resources and Lost City Rumours, on generated and stored maps alike. */
  extras: MapExtras;
  /** Where native settlements may stand, on generated and stored maps alike. */
  settlements: {
    /** Land terrains no settlement is placed on. */
    avoid: TerrainId[];
    /** Least distance between two settlements, in tiles (the larger of the two axes). */
    spacing: number;
  };
  /**
   * The edge the Crown's forces sail in from when a nation declares independence: the map's
   * arrival edge ('entry', where the nations' expeditions arrive), or a fixed edge.
   */
  crown: 'entry' | EntrySide;
}

/** A stored map in a scenario, and where the scenario's peoples live on it. */
export interface StoredMapEntry {
  /** The id of a stored map (maps/index.ts STORED_MAPS). */
  id: string;
  /** Each people's regions and the number of settlements in each; only the scenario's peoples. */
  peoples: PeopleRegion[];
}

/** Where a people lives on a stored map: an inclusive tile rectangle and the number of settlements in it. */
export interface PeopleRegion {
  tribe: TribeId;
  /** [x0, y0, x1, y1], inclusive. */
  region: [number, number, number, number];
  count: number;
}

/** Bonus resources and Lost City Rumours scattered over a new map: the chance per tile. */
export interface MapExtras {
  /** A bonus resource on a land tile whose terrain has a bonus good. */
  bonus: number;
  /** A bonus resource (fish) on ocean next to land. */
  coastalBonus: number;
  /** A Lost City Rumour on a land tile. */
  rumours: number;
  /** Land terrains without rumours. */
  noRumours: TerrainId[];
}

/**
 * How mapgen.ts generates a world (docs/design/scenario-framework.md, row 26). Land is noise with a
 * falloff away from a centre; the climate is a temperature (warm in the middle rows, cold at the
 * poles, plus noise) that picks a zone, and within a zone the elevation and then the moisture pick
 * the terrain. The Americas' values are the generator's old constants.
 */
export interface GeneratorSettings {
  /** Width and height for each size on the New game screen. */
  sizes: Record<MapSize, { width: number; height: number }>;
  /** Cell sizes of each noise field's octaves, in tiles. */
  noise: { land: number[]; heat: number[]; wet: number[]; elevation: number[]; wood: number[] };
  land: {
    /** The continent's centre, as shares of the width and height. */
    centre: [number, number];
    /** How far land reaches from the centre, as shares of the width and height. */
    spread: [number, number];
    /** How fast land thins out: weights of the horizontal (squared) and vertical (fourth power) distance, and the overall strength. */
    falloff: { x: number; y: number; strength: number };
    /** Noise above this (after the falloff) is land. */
    threshold: number;
    /** Columns and rows along each edge that stay sea. */
    margin: { west: number; east: number; north: number; south: number };
  };
  climate: {
    /** How much the heat noise moves the temperature. */
    heatNoise: number;
    /** Added to every tile's temperature (positive: a warmer world). */
    warmth: number;
    /** Rows at the top and bottom edge that are always this terrain. */
    poles: { rows: number; terrain: TerrainId };
    /** Temperature zones, coldest first; the last has no `below`. */
    zones: ClimateZone[];
  };
  /** Wood noise above this puts forest on a terrain that can carry it. */
  forest: number;
  highSeas: {
    /** Ocean this many tiles or more from land is high seas. */
    distance: number;
    /** Columns along the arrival edge that are always high seas. */
    columns: number;
  };
  /** The edge European expeditions arrive at, and where Europe lies. */
  entrySide: EntrySide;
  /** Native settlements: the scenario's peoples in bands from north to south. */
  peoples: {
    /** One settlement per this many land tiles where settlements may stand. */
    perTiles: number;
    /** At least this many settlements. */
    min: number;
    /** Rows along the top and bottom edge without settlements. */
    edgeRows: number;
  };
}

/** One temperature zone of the generator's climate. */
export interface ClimateZone {
  /** The zone holds tiles colder than this; absent for the warmest zone. */
  below?: number;
  /** Checked first: elevation above `above` gives `terrain`, in order. */
  heights?: { above: number; terrain: TerrainId }[];
  /** Then moisture below `below` gives `terrain`, in order; the last has no `below`. */
  moisture: { below?: number; terrain: TerrainId }[];
}

/** Pictures the web game shows for a scenario (docs/design/scenario-framework.md, section 6). */
export interface ScenarioArt {
  /**
   * The title screen's covers, by the web game's cover ids (apps/web/src/ui/landing.ts COVERS:
   * 'landfall', 'trade'…). Absent or empty: the Americas' covers.
   */
  covers?: string[];
  /**
   * The sprite id of the council hall's backdrop (the Americas: 'ui/congress-hall'). A style that
   * lacks it falls back to its own hall, then to the procedural one.
   */
  councilHall?: string;
}

export interface ScenarioNations {
  /** Alternative history (any nations) is always offered; real rivals when the scenario has them. */
  sets: { alternative: NationEntry[]; real?: NationEntry[] };
  default: Rivals;
  /** Most nations in one game. */
  max: number;
  /**
   * The Crown as a player (the Royal Expeditionary Force's owner): its name, adjective, colour and
   * port. Its bonus and colony names are not used.
   */
  crown: NationEntry;
}

/** How a nation is named and shown: per scenario (Q2), read with `nationOf(s, id)`. */
export interface NationIdentity {
  /** "England", "the Netherlands" (lower-case article: `nationTitle` capitalises). */
  name: string;
  /** "English", "Dutch". */
  adjective: string;
  /** Its flag colour on the map and in tables, as a CSS colour. */
  color: string;
}

/**
 * A nation in this scenario (Q2: nations are wholly per scenario): its identity and its game facts.
 * The engine and the web game read it through `nationOf(s, id)`; the catalogue's NATIONS only
 * supplies the Americas' values.
 */
export interface NationEntry extends NationIdentity {
  id: NationId;
  /** The bonus: its shown text and the modifiers that make it work (rules/modifiers.ts). */
  bonus: { text: string; modifiers?: Modifier[] };
  colonyNames: string[];
  /** The home port and its character (rules/ports.ts). */
  port: PortEntry;
}

export interface ScenarioPeoples {
  /** Peoples in play, north to south (the generator's band order). */
  ids: TribeId[];
  /** Goods native settlements produce for trade. */
  produce: GoodId[];
  /**
   * The settlement-kind table: the kind of settlement each lifeway lives in, with its numbers
   * (rules/natives.ts SETTLEMENT_KINDS, or a scenario's own row). Every people in play needs its
   * lifeway here.
   */
  settlements: Partial<Record<Lifeway, SettlementKindDef>>;
  /**
   * A people's skills or wants as they are in this scenario, where they differ from the catalogue
   * (TRIBES): goods and experts not in play (the Tupi want no coats in the Caribbean). Read with
   * `peopleOf(s, id)`.
   */
  overrides?: Partial<Record<TribeId, Partial<Pick<PeopleDef, 'skills' | 'wants'>>>>;
}

/** The scenario's council (the Americas: the Continental Congress's Founding Fathers). */
export interface Council {
  categories: FatherCategory[];
  /** Ids in the global catalogue (FATHERS), in catalogue order. */
  members: FatherId[];
  /**
   * Members whose effects differ in this scenario from the catalogue's (FATHERS). A member not
   * listed here has the catalogue's modifiers and joining effects.
   */
  effects?: Partial<Record<FatherId, MemberEffects>>;
}

/** What a council member does: passive modifiers while in the council, and effects once on joining. */
export interface MemberEffects {
  /** Read at the engine's hook points (rules/modifiers.ts, scenarios/modifiers.ts). */
  modifiers?: Modifier[];
  /** Applied once, in order, when the member joins (the events' effects, events/effects.ts). */
  onJoin?: Effect[];
}

/**
 * The computer players' hand-kept goods lists (docs/design/scenario-framework.md, row 38). Each
 * list's order is the order the AI considers the goods in, which decides ties, so the Americas
 * keep today's order. Only goods in play may be named.
 */
export interface ScenarioAi {
  /**
   * How fast the game's arc runs for the computer players, against the Americas' 609 turns from
   * 1492 (1). Their turn thresholds (when to explore, arm, start wars, take up an independence
   * plan) and the council's late-offer turn are scaled by it with `aiTurn(s, turn)`; lengths in
   * turns (cooldowns, patience, war weariness) are not. Absent means 1.
   */
  pace?: number;
  /**
   * The land is islands: when no good site lies within walking distance, the advanced computer
   * players send a settler by ship to a site on another island (ai/advanced.ts). Absent: settlers
   * walk, as on the Americas' continents.
   */
  islands?: boolean;
  goods: {
    /** Goods ships move between colonies and sell (ai/logistics.ts), most valuable first. */
    trade: GoodId[];
    /** Cash crops and finished goods worth shipping to a port (naive, advanced, fleet and foreign trade). */
    export: GoodId[];
    /** Goods whose worked tiles a pioneer gives a road (ai/roads.ts). */
    road: GoodId[];
    /** Goods whose tiles a pioneer ploughs or clears rather than gives a road (ai/advanced.ts). */
    farm: GoodId[];
  };
}
