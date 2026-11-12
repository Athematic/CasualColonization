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
import type { CouncilCost, FatherCategory, FatherId } from '../rules/fathers.js';
import type { GoodId } from '../rules/goods.js';
import type { PeopleEconomy } from '../rules/peoples.js';
import type { Modifier, RumourOutcome } from '../rules/modifiers.js';
import type { Effect } from '../events/types.js';
import type { CompanyId, Lifeway, NationId, PeopleDef, PlayerId, Temperament, TribeId } from '../rules/nations.js';
import type { NativeRulesOverride, SettlementKindDef } from '../rules/natives.js';
import type { PortEntry } from '../rules/ports.js';
import type { ScoreWeights } from '../rules/score.js';
import type { UnitTypeId } from '../rules/units.js';
import type { EntrySide } from '../mapgen.js';
import type { GridKind } from '../grid.js';
import type { TerrainId } from '../rules/terrain.js';
import type { GameState, MapSize, PeopleTreatyKind } from '../types.js';
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
   * What each nation type uses from the global catalogues (native-nations.md T6, T7, T8): its unit
   * types, its buildings and its council. `european` is the European nations' selection (companies
   * and the Crown use it too); `people` is a playing people's, left out where the engine's
   * `PEOPLE_SELECTION` serves (scenarios/index.ts `nationTypeOf`).
   */
  nationTypes: NationTypes;
  /**
   * A playing people's stores and gardens (native-nations.md T10; rules/peoples.ts), merged over
   * the engine's PEOPLE_ECONOMY. Absent fields keep the engine's values.
   */
  peopleEconomy?: Partial<PeopleEconomy>;
  /**
   * The scenario's councils, keyed by id (native-nations.md T8): the Americas' Continental Congress
   * is `congress`. Each nation type names its council (`nationTypes`). A people's council the
   * scenario does not define is the engine's `PEOPLE_COUNCIL` (rules/councils.ts).
   */
  councils: Record<CouncilId, Council>;
  /** What the computer players need to know about the scenario's content. */
  ai: ScenarioAi;
  /** Id of a registered event set (events/index.ts). `config.eventSet` overrides it (tests). */
  events: string;
  /** Which of the engine's systems are in play (step 5). */
  mechanics: Mechanics;
  /**
   * Alliance rules merged over the engine's ALLIANCE_RULES (alliances.ts): the hidden thresholds
   * that unlock an alliance and the penalties for leaving one. Absent fields keep the engine's values.
   */
  alliances?: Partial<AllianceRules>;
  /** Chartered company rules merged over the engine's COMPANY_RULES (companies.ts). */
  companyRules?: Partial<CompanyRules>;
  /**
   * Rules for treaties with native peoples (peopletreaties.ts, native-partners.md N3, N4, N8),
   * merged over the engine's PEOPLE_TREATY_RULES, the tables field by field. Only read while
   * `mechanics.peopleTreaties` names a kind.
   */
  peopleTreaties?: PeopleTreatyRulesOverride;
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
  /**
   * A Lost City Rumour on tribal land may be a desecrated burial ground: the people goes to war
   * with the nation for good (rumours.ts, natives.ts). Off: the outcome is never drawn.
   */
  burialGrounds: boolean;
  /**
   * When a people's capital is burned, its other settlements may submit to the attacker
   * (combat.ts `surrender`, natives.ts `hasSubmitted`). Off: they fight on.
   */
  surrender: boolean;
  /**
   * Alliances between European nations (alliances.ts, docs/design/cooperation.md): the rung after
   * Favoured Nation, with a defensive pact, open colonies and shared sight. Absent means off.
   */
  alliances?: boolean;
  /**
   * Chartered companies (companies.ts): nations found companies from the scenario's
   * `nations.companies`, buy shares and receive dividends. Absent means off.
   */
  companies?: boolean;
  /**
   * Allies may declare independence together, as one confederation (confederation.ts); needs
   * `alliances` and `independence`. Absent means off.
   */
  confederation?: boolean;
  /**
   * Treaties between a nation and a native people (peopletreaties.ts, docs/design/native-partners.md):
   * the kinds in play. Absent or empty means none (Beta 2 step 1 builds `people-trade`, step 2
   * `land-use`, step 3 `exchange`, step 4 `defence`).
   */
  peopleTreaties?: PeopleTreatyKind[];
  /**
   * Hard years (native-nations.md T10): each year, each region (land.ts) has a hard year with
   * this chance, drawn from the game seed; food yields there are halved for everyone. Absent or
   * false means off (the Americas and the Caribbean).
   */
  hardYears?: false | HardYearRules;
  /**
   * Land health per region (T10, land.ts): furs and game taken beyond a region's renewal wear it
   * down, and its fur and game yields scale with its health. Absent or false means off.
   */
  landHealth?: false | LandHealthRules;
  /**
   * Epidemics after contact (native-nations.md T12, epidemics.ts): in each region each year, once
   * Europeans and a people have met there, an epidemic with this chance, drawn from the game seed;
   * it strikes every town and colony in the region alike. Absent or false means off (the Americas
   * and the Caribbean).
   */
  epidemics?: false | EpidemicRules;
  /**
   * Knowledge of the land, explored and shared (native-nations.md section 16, Beta 3 step 10b): a
   * playing people knows unclaimed land (T13) only once it has seen it, peoples share their maps
   * when they meet, and computer peoples send their runners to explore. Absent or false means off
   * (the Americas and the Caribbean).
   */
  mapKnowledge?: false | MapKnowledgeRules;
}

/** Knowledge of the land (`Mechanics.mapKnowledge`). */
export interface MapKnowledgeRules {
  /**
   * A playing people knows land nobody claims (moves on it as along a river, T13, movement.ts
   * `knownLand`) only once it has explored it; its own claimed land it always knows.
   */
  seen: boolean;
  /**
   * Peoples share their maps when they meet (peoplemaps.ts): two playing peoples each give the other
   * all they have explored, and a people nobody plays gives a playing people its homeland, the land
   * within `homeland` tiles of its settlements. Not while either side is at war with the other or
   * holds it hostile, is a Combative computer people (its profile's `shareMaps`), or is at war with
   * one of the other's allies (a mutual defence pact, a league). Again every `every` years while
   * they may (absent: once). False: no sharing.
   */
  share: false | { homeland: number; every?: number };
  /**
   * How far from its towns a computer people's runners explore, in tiles, times its profile's
   * `explore` (ai/people.ts); 0 keeps them home.
   */
  range: number;
}

/** Epidemics (`Mechanics.epidemics`). */
export interface EpidemicRules {
  /** Chance of an epidemic in a region in contact, each year (1 in 25). */
  chance: number;
  /** Years without births in a town or colony an epidemic struck (3). */
  years: number;
  /** People a town or colony an epidemic struck loses, never its last (1). */
  loss: number;
  /**
   * How near a European colony and a people's town (or a settlement of a people nobody plays) must
   * be for a region to be in contact, in tiles (8): an epidemic strikes only where the two have met.
   */
  reach: number;
}

/** Hard years (`Mechanics.hardYears`). */
export interface HardYearRules {
  /** Chance of a hard year in each region each year (1 in 8). */
  chance: number;
}

/** Land health (`Mechanics.landHealth`). */
export interface LandHealthRules {
  /**
   * Side of a region in tiles, on maps without regions of their own: the map is cut into squares
   * of this size (8). Step 8's stored map brings real regions.
   */
  regionSize: number;
  /** Furs and game a region renews in a year: what can be taken without wearing it (40). */
  renewal: number;
  /** Health a region regains in a year while less than its renewal is taken (5). */
  recovery: number;
  /** The lowest share of fur and game yields a worn region still gives (0.2). */
  floor: number;
}

/** A whole number of years from `base − spread` to `base + spread`, drawn from the game seed. */
export interface YearsAround {
  base: number;
  spread: number;
}

/** The rules for alliances that a scenario can change (alliances.ts ALLIANCE_RULES has the engine's). */
export interface AllianceRules {
  /** Hidden: years of continuous peace two Favoured Nations need before they can ally, drawn per pair. */
  peaceYears: YearsAround;
  /** Hidden: gold that must have changed hands at each other's colonies, drawn per pair from `min` to `max`. */
  volume: { min: number; max: number };
  /** After leaving: no new agreements between the leaver and each former ally for these years. */
  waitingYears: YearsAround;
  /** After leaving: computer players on both sides treat the other as a target for these years. */
  hostilityYears: YearsAround;
  /**
   * The rung an alliance builds on: Favoured Nation (the engine's), or only a trade agreement, for
   * a scenario where Favoured Nation is rare. Leaving then ends the trade agreement.
   */
  requires: 'favoured' | 'trade';
  /**
   * Hidden: years of unbroken peace with a trade agreement after which two nations may ally without
   * the rung in `requires` and without the trade in `volume` ("old friends"), drawn per pair. Absent:
   * no such way. The computer players propose on this path at `Cooperation.proposeLongPeace`.
   */
  longPeace?: YearsAround;
  /** Share of each member's liberty bells that also counts for every other member's Congress (C5). */
  sharedBells: number;
  /** Gold a joint expedition costs, paid half by each of the two allies. */
  expeditionCost: number;
}

/** What a trade treaty with a people (`people-trade`, N4) needs and does. */
export interface PeopleTradeRules {
  /** Hidden: years of good relations (at peace, settlements content on average) the pair needs, drawn per pair. */
  years: YearsAround;
  /** Hidden: gold that must have changed hands in trade with the people, drawn per pair from `min` to `max`. */
  volume: { min: number; max: number };
  /** What the people's settlements pay for goods sold to them, against the usual (1.2: 20% more). */
  sell: number;
  /** What their goods cost the partner, against the usual (0.8: 20% less). */
  buy: number;
  /** What the people's settlements gather for sale while they have a trade treaty with anyone (1.25). */
  gather: number;
  /** How much more often the people's braves come to the partner's colonies to trade (2: twice). */
  braveTrade: number;
  /** Tension that falls each round, towards the partner, on top of the usual drift (2). */
  tensionFall: number;
}

/**
 * What a land use treaty with a people (`land-use`, a lease, N5) needs and does. It needs a trade
 * treaty with the people first (the ladder, N2).
 */
export interface PeopleLandUseRules {
  /** Hidden: years of good relations the pair needs, drawn per pair (on its own, apart from the trade treaty's). */
  years: YearsAround;
  /**
   * The yearly rent for each tile, as a share of the tile's price when the lease is made (0.05: a
   * twentieth of what buying it would cost, at least 1 gold). Set then, kept while the lease holds.
   */
  rent: number;
  /** What a settlement still gathers from a leased tile, against the usual (0.5: half). */
  gather: number;
  /** How hard a colony with leased land next to it presses on the people's settlements, against the usual (0.5: half). */
  pressure: number;
}

/**
 * What a cultural exchange with a people (`exchange`, N7) needs and does. It needs a trade treaty
 * with the people first (the ladder, N2).
 */
export interface PeopleExchangeRules {
  /** Hidden: years of good relations the pair needs, drawn per pair (on its own, apart from the other kinds'). */
  years: YearsAround;
  /** Years after a settlement last taught before it teaches a partner again (from its people's skills), drawn per settlement and teaching. */
  teachYears: YearsAround;
  /**
   * Times each settlement teaches again under exchanges, at most, after its first skill (tuned in
   * step 6: without a cap an exchange brought about ten free experts in an Americas game).
   */
  renewals: number;
  /** Years after a partner's scout last spoke with a chief before the chief welcomes the partner's scouts again. */
  speakYears: number;
  /** What the people's settlements gather for sale while they have a cultural exchange with anyone, against the usual (1.25: 25% more). */
  gather: number;
}

/**
 * What a mutual defence pact with a people (`defence`, N7, N9) needs and does. It needs a trade
 * treaty and one of land use or a cultural exchange first (the ladder, N2), and a people keeps a
 * pact with one nation at a time.
 */
export interface PeopleDefenceRules {
  /** Hidden: years of good relations the pair needs, drawn per pair (on its own, apart from the other kinds'). */
  years: YearsAround;
  /**
   * Tension each of the people's settlements gains towards a nation whose attack on the partner's
   * colony near their land brings them into the war, so the war lasts until it has calmed.
   */
  tension: number;
  /**
   * Chance that a brave at home sets out against an enemy of the partner standing near one of the
   * partner's colonies within the settlement's reach (the partner's enemies the people is at war
   * with, and the King's troops against a partner that declared independence).
   */
  defend: number;
  /** Tiles from one of the partner's colonies within which an enemy unit is "near" it. */
  near: number;
}

/** How a people's temperament (`peoples.overrides[id].temperament`) shifts its answers and offers. */
export interface TemperamentRules {
  /** Times the chance to accept a proposal. */
  accept: number;
  /** Times the chance to offer a treaty itself. */
  offer: number;
  /** Times the hidden thresholds (years and gold) that unlock a treaty. */
  thresholds: number;
}

/**
 * The rules for treaties with native peoples a scenario can change (peopletreaties.ts
 * PEOPLE_TREATY_RULES has the engine's): unlocking, the people's answers and offers (N8), each
 * kind's effects (N4) and what breaking faith costs.
 */
export interface PeopleTreatyRules {
  trade: PeopleTradeRules;
  landUse: PeopleLandUseRules;
  exchange: PeopleExchangeRules;
  defence: PeopleDefenceRules;
  /** Chance that a people accepts a treaty it is free to accept (unlocked, nothing against it). */
  accept: number;
  /** Chance, on a brave's trade visit to a nation's colony, that its people offers an unlocked treaty itself. */
  offer: number;
  /** Years after a nation took land from a people (without paying) during which the people refuses new treaties. */
  landYears: number;
  /** Tension each of the people's settlements gains towards a nation that breaks faith. */
  breachTension: number;
  /** After breaking faith: no new treaty with the people for these years. */
  waitingYears: YearsAround;
  /** After breaking faith: the people treats the nation as hostile (no gifts or trade visits, no offers) for these years. */
  hostilityYears: YearsAround;
  /** The peoples' temperaments; a people without one answers with no change. */
  temperaments: Record<Temperament, TemperamentRules>;
}

/** A scenario's changes to PEOPLE_TREATY_RULES: any field, and any part of the tables. */
export type PeopleTreatyRulesOverride = Partial<Omit<PeopleTreatyRules, 'trade' | 'landUse' | 'exchange' | 'defence' | 'temperaments'>> & {
  trade?: Partial<PeopleTradeRules>;
  landUse?: Partial<PeopleLandUseRules>;
  exchange?: Partial<PeopleExchangeRules>;
  defence?: Partial<PeopleDefenceRules>;
  temperaments?: Partial<Record<Temperament, Partial<TemperamentRules>>>;
};

/**
 * How readily the computer players cooperate (alliances.ts COOPERATION has the engine's values,
 * tuned for the targets in docs/design/cooperation.md, C11). Each is a chance per review (every
 * five turns) for the most cooperative level; the other levels take a share of it.
 */
export interface Cooperation {
  /** Chance that a nation proposes an alliance to a Favoured Nation partner once the alliance is unlocked. */
  proposeAlliance: number;
  /** Chance that a nation proposes an alliance to an old friend (`AllianceRules.longPeace`) where the usual way is not open. */
  proposeLongPeace: number;
  /** Chance that a nation accepts an alliance proposed to it. */
  acceptAlliance: number;
  /** How good a target an ally's enemy must be before a computer ally joins the war (1: as good as one it would attack alone). */
  joinWar: number;
  /** Chance per review that a nation with the gold founds a company it may charter. */
  foundCompany: number;
  /** Chance per review that a nation with gold to spare buys shares in a company. */
  buyShares: number;
  /** Gold a computer nation wants beyond a company's capital and its own reserve before it founds one, as a share of the capital (0.5). */
  foundMargin: number;
  /** Gold a computer nation wants beyond the price of five shares and its own reserve before it buys them (1,500). */
  sharesMargin: number;
  /** Chance per review that a nation with allies and gold to spare proposes a joint expedition. */
  jointExpedition: number;
  /** Chance per review that a nation ready for independence proposes to an ally that is ready too to declare together. */
  confederation: number;
  /**
   * The share of its usual margin over the Royal Expeditionary Force a computer nation wants when it
   * declares together with an ally rather than alone (1: the same; it still faces its own REF).
   */
  confederationReadiness: number;
  /**
   * Chance per review that a nation proposes a trade treaty to a people it may make one with
   * (native-partners.md N11; Combative only where the trade pays).
   */
  proposePeopleTrade: number;
  /** Chance that a nation accepts a treaty a people offers it through a visiting brave. */
  acceptPeopleOffer: number;
  /**
   * Chance per review that a nation proposes a land use treaty (a lease, N5) to a trade partner
   * whose land next to its colonies it would work (N11: Creative and Competent; Combative takes
   * land instead, Naive never proposes).
   */
  proposeLandUse: number;
  /**
   * Chance per review that a nation proposes a cultural exchange (N7) to a trade partner (N11:
   * Creative seeks it, Competent at a share; Combative and Naive do not propose).
   */
  proposeExchange: number;
  /**
   * Chance that a nation seeks a mutual defence pact (N7, N9) with a partner people near its colonies
   * (N11: Creative seeks it, Competent at a share, Combative with peoples near its enemies, Naive
   * does not propose). Like `proposeExchange`, drawn once per nation and people, not per review.
   */
  proposeDefence: number;
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
  /**
   * The tiles' shape (grid.ts): which tiles are next to which, distances and the colony's work
   * area. Squares when absent, and the only grid so far.
   */
  grid?: GridKind;
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
  /**
   * Land health (native-nations.md T10): furs and game each of the map's regions (`StoredMap.regions`,
   * by id) gives back in a year without wearing. A region not listed has `landHealth.renewal`.
   */
  renewal?: Record<string, number>;
  /**
   * Where a nation's ships arrive on this map, by nation: a water tile [x, y] (native-nations.md
   * T18, Beta 3 step 8: the North-east's nations each where their expeditions came). A nation not
   * listed takes the map's spacing along its arrival edge, as before.
   */
  entries?: Partial<Record<NationId, [number, number]>>;
}

/** Where a people lives on a stored map: an inclusive tile rectangle and the number of settlements in it. */
export interface PeopleRegion {
  tribe: TribeId;
  /** [x0, y0, x1, y1], inclusive. */
  region: [number, number, number, number];
  count: number;
  /**
   * The year the people comes to this region (native-nations.md T20: the Inuit reaching Labrador),
   * if after the game's first: its settlements are placed at the start of that year
   * (peoplemoves.ts). Missing means from the start.
   */
  from?: number;
  /**
   * The year the people is no longer found in this region (the Dorset in Labrador, the St. Lawrence
   * Iroquoians): at the start of that year its settlements there leave the map, unless the people
   * plays (its towns are its player's). Missing means it stays.
   */
  until?: number;
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
  /**
   * Chartered companies nations may found in this scenario (companies.ts, with
   * `mechanics.companies`): each a company player's name, colour, colony names and port. Absent
   * means none.
   */
  companies?: CompanyEntry[];
}

/** A chartered company a scenario offers: how it is shown, and who may found it, from when. */
export interface CompanyEntry extends NationEntry {
  id: CompanyId;
  /** The nations that may found it (charter it); any nation may buy shares once it exists. Empty: any nation. */
  founders: NationId[];
  /** The first year it may be founded. */
  from?: number;
}

/** The rules for chartered companies a scenario can change (companies.ts COMPANY_RULES has the engine's). */
export interface CompanyRules {
  /** Gold a nation pays to found a company: the company's first treasury. */
  capital: number;
  /** Shares the founder gets for it. */
  foundingShares: number;
  /** Least price of a share; above it the price follows the company's worth per share. */
  sharePrice: number;
  /** Turns between dividends. */
  dividendEvery: number;
  /** Gold a company keeps before it pays dividends. */
  reserve: number;
  /** Share of the gold above the reserve paid out at each dividend. */
  payout: number;
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
export interface NationEntry extends PlayerEntry {
  id: NationId;
  /**
   * The year the nation arrives (native-nations.md T18; arrivals.ts): until its first turn of that
   * year it is not in the game (no player, units, colonies, turns or diplomacy); then its expedition
   * arrives at its entry point, as at the start. Missing, or a year the game starts in or before,
   * means it is there from the start. Not read for companies (they have `from`) or the Crown.
   */
  arrives?: number;
}

/**
 * Any player as `nationOf(s, id)` shows it: a nation's entry, or a playing people's (native-nations.md
 * T1: a people keeps its own id). A people has no home port: its `port` has no name or market and is
 * never used (playerkind.ts `homePort`).
 */
export interface PlayerEntry extends NationIdentity {
  id: PlayerId;
  /** The bonus: its shown text and the modifiers that make it work (rules/modifiers.ts). */
  bonus: { text: string; modifiers?: Modifier[] };
  colonyNames: string[];
  /** The home port and its character (rules/ports.ts). */
  port: PortEntry;
}

/** A council's id in `Scenario.councils`. */
export type CouncilId = string;

/**
 * The nation types (native-nations.md T1, T6): `european` for European nations, chartered companies
 * and the Crown; `people` for a playing people.
 */
export type NationType = 'european' | 'people';

/** Each nation type's selection from the global catalogues (`Scenario.nationTypes`). */
export interface NationTypes {
  european: NationTypeSelection;
  /** Missing: the engine's `PEOPLE_SELECTION` (the catalogue's people's entries, the `people` council). */
  people?: PeopleSelection;
}

/** What one nation type uses from the global catalogues (native-nations.md T6, T7, T8). */
export interface NationTypeSelection {
  /**
   * Unit types in play for the type, in catalogue order. For the European nations only these are
   * offered in Europe, built in colonies or arrive as immigrants, and the engine's named slots
   * (treasure, the REF's units, the starting ship) are expected among them. For a playing people:
   * what its towns build and its braves become; the first is the unit its towns grow by.
   */
  units: readonly UnitTypeId[];
  /**
   * Buildings in play for the type, in catalogue order (the order production runs in: tools are
   * made before the armory uses them). Its colonies or towns have only these.
   */
  buildings: readonly BuildingKind[];
  /** Its council in `Scenario.councils` (T8); an id the scenario does not define is the engine's (`ENGINE_COUNCILS`). */
  council: CouncilId;
}

/** A playing people's selection: what it uses from the catalogues, and its traits. */
export interface PeopleSelection extends NationTypeSelection {
  /**
   * Knowledge of the land (native-nations.md T13): its land units move at most at river cost on its
   * own and unclaimed land, except on plowed tiles (movement.ts, `knowsLand`). Missing means on;
   * false switches it off for the scenario.
   */
  knowsLand?: boolean;
}

/**
 * A people the scenario lets setup play as a nation (native-nations.md T3, T4): `GameConfig.peoples`
 * picks which of them play; the others stay settlements under Beta 2's rules. Its settlements
 * become its towns (colonies) and its braves its first units.
 */
export interface PlayablePeople {
  id: TribeId;
  /** Its name as a player, in sentences ("the Haudenosaunee"); missing means the people's name. */
  name?: string;
  /** Missing means the people's name. */
  adjective?: string;
  /** Names for the towns it founds after its first (which keep their settlements' names). */
  townNames: string[];
}

/**
 * A people's own data in a scenario (`peoples.overrides[id]`): its name (the Americas call the
 * Haudenosaunee the Iroquois), skills, wants and temperament where they differ from the catalogue,
 * the key its seeded streams hash (`seedKey`), and, as a playing people (native-nations.md T14), its own
 * score weights over the scenario's (`score`) and its own params for the peoples' victory kinds
 * (`victory`, by kind id: `continuity`, `good-life`), over the scenario's victory entry.
 */
export type PeopleOverride = Partial<Pick<PeopleDef, 'name' | 'skills' | 'wants' | 'temperament' | 'storeYears' | 'seedKey'>> & {
  score?: Partial<ScoreWeights>;
  /**
   * Its own thresholds for the peoples' ways that judge one people at a time (native-nations.md
   * T14, section 18), over the scenario's victory entry's `params`, which are over the engine's
   * defaults (peoplevictory.ts `CONTINUITY`, `GOOD_LIFE`). A confederacy is judged as a league, so it has none here.
   */
  victory?: PeopleVictoryOverride;
};

/** Continuity's thresholds (native-nations.md T14): the engine's defaults are peoplevictory.ts `CONTINUITY`. */
export interface ContinuityParams {
  /** Share of its starting homeland kept (claimed by it or by no one; leased land counts as kept). */
  homelandShare: number;
  /** Average health (0–100) of its homeland's regions, where land health is on. */
  landHealth: number;
  /** Its people now against its people at the start. */
  peopleShare: number;
  /** Council members. */
  members: number;
}

/** A good life's thresholds (T14): the engine's defaults are peoplevictory.ts `GOOD_LIFE`. */
export interface GoodLifeParams {
  storeYears: number;
  hungerYears: number;
  landHealth: number;
  peaceYears: number;
  faithYears: number;
  treatyShare: number;
}

/** A people's own thresholds, by victory kind (`peoples.overrides[id].victory`). */
export interface PeopleVictoryOverride {
  continuity?: Partial<ContinuityParams>;
  'good-life'?: Partial<GoodLifeParams>;
}

export interface ScenarioPeoples {
  /** Peoples in play, north to south (the generator's band order). */
  ids: TribeId[];
  /**
   * Peoples setup may play as nations (native-nations.md T4), each also in `ids`. Missing means
   * none: the Americas and the Caribbean list none in Beta 3.
   */
  playable?: PlayablePeople[];

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
   * (TRIBES): goods and experts not in play (the Tupi want no coats in the Caribbean), and its
   * temperament towards treaties (N8). Read with `peopleOf(s, id)`.
   */
  overrides?: Partial<Record<TribeId, PeopleOverride>>;
  /**
   * Changes to the engine's native rules (rules/natives.ts NATIVE_RULES): braves, tension
   * thresholds, demands, prices, burial grounds, surrender, missions and inciting. Absent fields
   * keep the engine's values. Read with `nativeRulesOf(s)`.
   */
  rules?: NativeRulesOverride;
}

/**
 * A council (native-nations.md T8; the Americas: the Continental Congress's Founding Fathers). Its
 * product pays for its members: liberty bells in the engine (`Player.bells`, `fatherBells`), named
 * by the council's `text.product`.
 */
export interface Council {
  /** Its categories, open strings: one candidate of each is offered at a time, in this order. */
  categories: FatherCategory[];
  /** Ids in the global catalogue (FATHERS), in catalogue order. */
  members: FatherId[];
  /**
   * Members whose effects differ in this scenario from the catalogue's (FATHERS). A member not
   * listed here has the catalogue's modifiers and joining effects.
   */
  effects?: Partial<Record<FatherId, MemberEffects>>;
  /**
   * Its words where they differ from the scenario's terms (`council`, `councilShort`, `member`,
   * `members`, `product`): the Congress uses the scenario's terms, a people's council its own.
   */
  text?: Partial<Record<CouncilTextKey, string>>;
  /** Members of a category become likelier late in the game (the Congress: political +2 after turn 120, scaled by `aiTurn`). */
  late?: { category: FatherCategory; turn: number; add: number };
  /** The order computer players choose candidates in (missing: the Congress's, `CONGRESS_AI_PREFERENCE`). */
  aiPreference?: FatherId[];
  /** What the next member costs (missing: the Congress's rule, `CONGRESS_COST`). */
  cost?: CouncilCost;
  /** The sprite id of its hall's backdrop; missing: the scenario's `art.councilHall`. */
  hall?: string;
}

/** The words a council may name for itself (`councilText`). */
export type CouncilTextKey = 'council' | 'councilShort' | 'member' | 'members' | 'product';

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
   * The thresholds are dates (Beta 3 step 8): a threshold tuned for the Americas is read as the
   * Americas' year of that turn, and becomes the turn of the same year in this scenario's calendar
   * (`aiTurn`), whatever its first year. For a game that starts long before the Europeans arrive
   * (the North-east, from 1000), so their plans keep to the Americas' dates. `pace` is then not read.
   */
  dates?: boolean;
  /**
   * With `dates`: how much later than in the Americas the computer Europeans' plans come, as a
   * stretch of the years since 1492 (absent: 1). Where they arrive late on poor land and take a turn
   * a year (the North-east), an arc tuned for the Americas' half-year turns from 1492 has them reach
   * for independence before their colonies are grown; 1.5 reads the Americas' 1666 as 1753.
   */
  stretch?: number;
  /**
   * The land is islands: when no good site lies within walking distance, the advanced computer
   * players send a settler by ship to a site on another island (ai/advanced.ts). Absent: settlers
   * walk, as on the Americas' continents.
   */
  islands?: boolean;
  /**
   * Targets for computer peoples (native-nations.md T15, peoplevictory.ts PEOPLE_AI_TARGETS), as
   * scenario-overridable defaults measured by tournaments: `militaryWins`, the ceiling on the
   * share of computer-only games won by the military victory (0.01). Absent fields keep the engine's.
   */
  peoples?: { militaryWins?: number };
  /** How readily the computer players cooperate; absent fields keep the engine's values (alliances.ts COOPERATION). */
  cooperation?: Partial<Cooperation>;
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
