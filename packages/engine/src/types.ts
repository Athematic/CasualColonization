import type { AiLevel, AiMemory } from './ai/profiles.js';
import type { CheatId } from './cheats.js';
import type { EventsState } from './events/types.js';
import type { BuildingKind } from './rules/buildings.js';
import type { DifficultyId } from './rules/difficulty.js';
import type { FatherCategory, FatherId } from './rules/fathers.js';
import type { GoodId } from './rules/goods.js';
import type { NationId, PlayerId, TribeId } from './rules/nations.js';
import type { TerrainId } from './rules/terrain.js';
import type { RoleId, UnitTypeId } from './rules/units.js';

export type MapSize = 'small' | 'medium' | 'large';

export interface GameConfig {
  seed: number;
  /** The text the seed was made from (seedFromPhrase), kept for display; the seed number is what counts. */
  seedPhrase?: string;
  mapSize: MapSize;
  /** Id of a stored map (see STORED_MAPS); absent means a generated map. `mapSize` is then ignored. */
  map?: string;
  /** European nations taking part, in turn order. Between 1 and 8. */
  nations: NationId[];
  /**
   * Native peoples playing as nations (native-nations.md T3, T4), from the scenario's
   * `peoples.playable`; they take their turns after the nations, in this order. Missing means none:
   * every people stays settlements under Beta 2's rules.
   */
  peoples?: TribeId[];
  /** Nations (and peoples) controlled by people (hot-seat); the rest are AI. May be empty to let computers play each other. */
  humans: PlayerId[];
  /** Level of each computer nation; missing means Naive. */
  ai?: Partial<Record<PlayerId, AiLevel>>;
  /** While a head start runs: the people's nations, played by the computer until hand-over. */
  headStart?: { humans: PlayerId[]; level: AiLevel; turn: number };
  /** Difficulty level (see rules/difficulty.ts); missing means Conquistador, the standard rules. */
  difficulty?: DifficultyId;
  /** Give computer players the chosen difficulty's economics too (tournaments); by default only people get it. */
  difficultyForAll?: boolean;
  /**
   * Computer players propose no trade agreements and no Favoured Nation status (they still answer
   * people's proposals). For tournaments that measure what the feature brings (`--no-favoured`).
   */
  noFavoured?: boolean;
  /** Dated events from the period (events/, docs/design/events.md). Missing means off; the web game switches it on. */
  historicalEvents?: boolean;
  /** Random events in the Sim City spirit (storms, fires, bumper harvests). Missing means off. */
  randomEvents?: boolean;
  /** Id of the registered event set (events/index.ts); missing means 'americas'. Scenarios will set it. */
  eventSet?: string;
  /**
   * Colony charter: founding a colony after the first costs gold paid to the Crown (see
   * COLONY_CHARTER in rules/difficulty.ts and charterCost). Missing means off, so older saves and
   * games built without it are unchanged; the web game and tournaments switch it on.
   */
  colonyCharter?: boolean;
  /**
   * Id of the registered scenario (scenarios/index.ts); missing means 'americas', so older saves
   * and the golden hashes stay valid. New Americas games do not write it.
   */
  scenario?: string;
  /** The scenario's version when the game was created; missing means 1. */
  scenarioVersion?: number;
  /** Which nation set the setup offered (real rivals or alternative history); missing means the scenario's default. */
  rivals?: 'real' | 'alternative';
  /**
   * Arena play-on (tournaments, `--play-on`): a War of Independence won or lost does not end the
   * game; the nation is finished (`Player.finished`) and the others play on to the end of the
   * calendar (victory.ts). Missing means off; the New game screen never sets it.
   */
  playOn?: boolean;
}

export interface Tile {
  t: TerrainId;
  /** Forested. */
  f?: boolean;
  /** Plowed. */
  p?: boolean;
  /** Road. */
  r?: boolean;
  /** Bonus resource. */
  b?: boolean;
  /** Lost City Rumour. */
  lcr?: boolean;
  /** River: 1 minor, 2 major. A fixed map feature on land; absent means no river. See rivers.ts. */
  rv?: 1 | 2;
  /**
   * Where the river runs: one bit per neighbour in the square grid's direction order (n 1, ne 2, e 4, se 8, s 16,
   * sw 32, w 64, nw 128). A bit towards a water tile is the river's mouth.
   */
  rd?: number;
  /** Worked out: the silver here has been mined thin (see mines.ts, rules/mines.ts). */
  d?: boolean;
  /** European nation that bought or took this land from the natives. */
  claim?: PlayerId;
  /**
   * European nation that leases this tile of a people's land while a land use treaty holds (Beta 2,
   * native-partners.md N5, peopletreaties.ts): its colonies next to the tile may work it, and the
   * land stays the people's (`nativeLandOwner` still names its settlement). Absent when unleased.
   */
  use?: PlayerId;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[];
}

export interface MarketEntry {
  /** Sell price; buy price is price + spread. */
  price: number;
  /** Net units sold since the last price change (negative = bought). */
  volume: number;
}

export type Stance = 'peace' | 'war';

export interface Player {
  id: PlayerId;
  /**
   * A chartered company (companies.ts) or a native people played as a nation (native-nations.md
   * T1) rather than a European nation; missing means a nation (or the Crown). Read through
   * `playerKind` and the systems table (playerkind.ts).
   */
  kind?: 'company' | 'people';
  /** A company's shareholders and bookkeeping; only on a company. */
  company?: CompanyBook;
  human: boolean;
  /** Computer level, for nations not played by people. */
  ai?: AiLevel;
  aiMemory?: AiMemory;
  gold: number;
  /** Tax rate in percent. */
  tax: number;
  market: Record<GoodId, MarketEntry>;
  crosses: number;
  crossesRequired: number;
  recruitPool: UnitTypeId[];
  recruited: number;
  /** One byte per tile: 1 when explored. */
  explored: number[];
  /** Where ships sailing from Europe arrive. */
  entry: { x: number; y: number };
  stance: Partial<Record<string, Stance>>;
  coloniesFounded: number;
  bells: number;
  /** Members of the Continental Congress. */
  fathers: FatherId[];
  /** One candidate per category to choose the next father from. */
  fatherOffer: Partial<Record<FatherCategory, FatherId>>;
  currentFather: FatherId | null;
  /** Bells collected towards the current father. */
  fatherBells: number;
  /** Goods the player may not trade in Europe until arrears are paid. */
  boycotts: Partial<Record<GoodId, boolean>>;
  /** A tax raise waiting for the player to accept or refuse. */
  pendingTax: { rate: number; good: GoodId } | null;
  independence: 'none' | 'declared' | 'won' | 'lost';
  /**
   * Arena play-on only (`GameConfig.playOn`, victory.ts): the nation's War of Independence is over
   * and it takes no more turns. Its score and the score's parts are kept as they were then.
   */
  finished?: { turn: number; score: number; parts: Record<string, number> };
  /**
   * The Royal Expeditionary Force: before independence, the force the Crown has built up so far
   * (it grows during the game, see crown.ts); after the declaration, what is still to land.
   */
  ref: { regulars: number; dragoons: number; artillery: number; menOfWar: number };
  /**
   * The Crown's bookkeeping for this nation (crown.ts): liberty bells already reacted to, growth
   * points not yet spent on units, land units added over the game, and the turn and target of the last royal
   * war. Missing in saves from before 0.5 (filled in, with the old formula's force, on the next round).
   */
  royal?: { bells: number; points: number; added?: number; lastWar?: number; warOn?: PlayerId };
  /** A demand for gold from the King, waiting to be paid or refused; `colony` is where goods would be seized. */
  pendingDemand?: { gold: number; colony: string | null; turn: number };
  /** The turn of the declaration of independence, the Royal Expeditionary Force then, and the old formula's size then (for measurements). */
  refAtDeclaration?: { turn: number; force: { regulars: number; dragoons: number; artillery: number; menOfWar: number }; formula: number };
  /** Turn on which each war started, keyed by nation id. */
  warSince: Partial<Record<string, number>>;
  /** Colonies held when independence was declared. */
  coloniesAtDeclaration?: number;
  /**
   * A mercenary company offering its services to rebels (rebellion.ts), waiting to be hired or
   * turned away; it leaves if unanswered for a round.
   */
  mercenaryOffer?: MercenaryOffer;
  /**
   * The War of Independence after the declaration (rebellion.ts): liberty bells rung by then,
   * the nations that were Favoured Nations then, mercenary offers made (and the last one's
   * turn), and the foreign intervention once it has come. Missing before the declaration.
   */
  rebellion?: {
    bells: number;
    friends?: PlayerId[];
    offers: number;
    lastOffer?: number;
    intervention?: { by: PlayerId | 'foreign'; turn: number; land: number };
  };
  /** Units of goods lost to full warehouses over the game; missing means none. */
  goodsSpoiled?: number;
  /** Difficulty whose economics this nation plays at; missing means Conquistador (computer players). */
  difficulty?: DifficultyId;
  /**
   * Shared bells (alliances.ts): the nation's bells already counted for its allies' Congress, and
   * the remainder (in hundredths of a bell) not yet given. Written once the nation has allies.
   */
  allyBells?: { seen: number; carry: number };
}

/** A chartered company's shareholders and bookkeeping (companies.ts). */
export interface CompanyBook {
  /** Shares held, by nation. */
  shares: Partial<Record<PlayerId, number>>;
  /** The nation that founded it, and the turn. */
  founder: PlayerId;
  founded: number;
  /** Turn of the last dividend, and the gold paid out in dividends so far. */
  lastDividend: number;
  paid: number;
}

/** A mercenary company's offer to rebels: veteran soldiers, veteran dragoons and artillery for gold. */
export interface MercenaryOffer {
  /** Where the company comes from ("Hessian", "Swiss", …). */
  name: string;
  soldiers: number;
  dragoons: number;
  artillery: number;
  price: number;
  turn: number;
}

// Jobs and locations are read-only where units are indexed by them (unitindex.ts): a unit moves
// only through setUnitLoc, which gives it a new location object. Only a port and the turns left at
// sea, which no index uses, change in place.
export type Job =
  | { readonly kind: 'tile'; readonly x: number; readonly y: number; readonly good: GoodId }
  | { readonly kind: 'building'; readonly building: BuildingKind };

export type UnitLocation =
  | { readonly kind: 'map'; readonly x: number; readonly y: number }
  | { readonly kind: 'colony'; readonly colonyId: string; readonly job: Job }
  | { readonly kind: 'carrier'; readonly carrierId: string }
  /** In a home port in Europe. `port` is a Favoured Nation partner whose port the ship visits; missing means the owner's own. */
  | { readonly kind: 'europe'; port?: PlayerId }
  | { readonly kind: 'sailing'; readonly to: 'europe' | 'america'; turnsLeft: number; port?: PlayerId };

export type UnitState = 'active' | 'fortified' | 'sentry';

export type ImprovementKind = 'plow' | 'road' | 'clear';

export interface Unit {
  id: string;
  /** Who owns the unit. Read-only: change it with setUnitOwner (unitindex.ts), which keeps the unit index up to date. */
  readonly owner: PlayerId;
  type: UnitTypeId;
  role: RoleId;
  /** Tools carried by a pioneer. */
  tools: number;
  /** Where the unit is. Read-only: change it with setUnitLoc (unitindex.ts), which keeps the unit index up to date. */
  readonly loc: UnitLocation;
  /** Move points left this turn (3 per move). */
  moves: number;
  state: UnitState;
  work?: { kind: ImprovementKind; turnsLeft: number };
  /** Teaching progress in turns, for a teacher in a school. */
  teach?: number;
  /** Gold carried by a treasure train. */
  treasure?: number;
  /** Turns left until a damaged ship is repaired. */
  repair?: number;
  /** For Royal troops: the rebel nation they were sent against. */
  against?: PlayerId;
  /** A joint expedition's scout (alliances.ts): the ally that paid half, and gets half of what it finds. */
  joint?: PlayerId;
  /** A mercenary hired during the War of Independence (rebellion.ts). */
  mercenary?: true;
  /**
   * A unit of a foreign intervention force (rebellion.ts): owned by the rebels it helps, it fights
   * the Crown on its own and takes no orders; the value is the power that sent it.
   */
  ally?: PlayerId | 'foreign';
  /** Where the unit is going; for Europe, `port` is a Favoured Nation partner's port (missing: its own). */
  dest?: { x: number; y: number } | { europe: true; port?: PlayerId };
  /** "Road to…": a pioneer roads each tile on the way to this one, then steps on (see `continueRoadTo`). Missing in older saves. */
  roadTo?: { x: number; y: number };
  cargo?: Partial<Record<GoodId, number>>;
  /** The trade route a ship or wagon train follows, and the index of the stop it is heading for. */
  route?: { id: string; stop: number };
  /** Trade with a native settlement this turn: one sale and one purchase per visit. */
  trade?: { at: string; turn: number; sold?: boolean; bought?: boolean };
}

/** What a carrier loads or unloads of one good at a trade route stop. */
export interface RouteCargo {
  good: GoodId;
  /**
   * Loading in a colony: units left in the warehouse (default 0). Loading in Europe: units to
   * have aboard after buying (default 100). Unloading in a colony: fill the warehouse up to this
   * (default its capacity, so nothing spoils). Unloading in Europe: ignored, all of it is sold.
   */
  amount?: number;
}

/** One stop of a trade route: a colony (own, or a trade partner's), or Europe for ships. */
export interface RouteStop {
  /** Colony id, or 'europe': a home port in Europe. */
  at: string;
  /**
   * For a Europe stop: the home port it calls at, a Favoured Nation partner's. Missing means the
   * owner's own. When the partnership ends the stop falls back to the home port.
   */
  port?: PlayerId;
  load: RouteCargo[];
  unload: RouteCargo[];
  /** In Europe: take aboard the colonists waiting on the docks. They go ashore at the next colony stop. */
  passengers?: boolean;
}

/** A named, ordered round trip that ships and wagon trains follow on their own. */
export interface TradeRoute {
  id: string;
  owner: PlayerId;
  name: string;
  stops: RouteStop[];
}

export type BuildTarget = { kind: 'building'; id: BuildingKind } | { kind: 'unit'; id: UnitTypeId };

export interface Colony {
  id: string;
  owner: PlayerId;
  name: string;
  /** A colony never moves (colonies are indexed by tile in unitindex.ts). */
  readonly x: number;
  readonly y: number;
  goods: Record<GoodId, number>;
  buildings: Record<BuildingKind, number>;
  build: BuildTarget | null;
  hammers: number;
  liberty: number;
  founded: number;
  /** Goods the custom house exports. */
  exports: Partial<Record<GoodId, boolean>>;
  /** For a colony the Crown has retaken: who held it before. */
  takenFrom?: PlayerId;
  /**
   * A playing people's town that has gone hungry (native-nations.md T10, peopleeconomy.ts): the
   * turn its run of hungry years began and the last turn it went hungry. Missing when it has not.
   */
  hunger?: { since: number; last: number };
  /** The last turn a playing people's town was attacked (no birth that year, T10). Missing when never. */
  foughtAt?: number;
  /**
   * An epidemic (native-nations.md T12, epidemics.ts): no birth or growth in the town or colony
   * before this turn. Written only while the scenario has `mechanics.epidemics`; missing when well.
   */
  sickUntil?: number;
  /**
   * A playing people's town under a cultural exchange (Beta 3 step 4): the turn it last taught a
   * colonist of each partner nation. Written only by a people player's exchange; missing when never.
   */
  taughtAt?: Partial<Record<PlayerId, number>>;
}

/**
 * The land's regions (land.ts). A region is a square of `size` tiles (the map cut in `cols`
 * columns) until step 8's map brings regions of its own; arrays are indexed by region.
 */
export interface LandState {
  size: number;
  cols: number;
  /** Health per region, 0–100, starting at 100; only with land health. */
  health?: number[];
  /** Furs and game taken in each region so far this year; only with land health. */
  taken?: number[];
  /** The regions having a hard year this year, in order; only with hard years. */
  hard?: number[];
}

export interface Tribe {
  id: TribeId;
  /** Per-European-nation stance; tribes become hostile when attacked. */
  stance: Partial<Record<PlayerId, Stance>>;
  /** Nations that disturbed one of the tribe's burial grounds: at war with them for good. Missing means none. */
  burial?: PlayerId[];
  /** Nations the tribe submitted to after losing its capital (see natives.ts). Missing means none. */
  submitted?: PlayerId[];
  /**
   * The turn the tribe's last war with each nation ended (the `prosperity` victory, prosperity.ts).
   * Written only while the scenario plays for `prosperity`; missing means no war has ended.
   */
  warEnded?: Partial<Record<PlayerId, number>>;
  /**
   * Nations that burned one of the tribe's settlements (the `prosperity` victory). Written only
   * while the scenario plays for `prosperity`; missing means none.
   */
  burned?: PlayerId[];
  /**
   * Nations whose person has been told of the first meeting with the people (queries.ts,
   * `meetPeople`); written only for nations a person plays. Missing means none.
   */
  met?: PlayerId[];
}

/**
 * A native brave on the map (see braves.ts). Braves belong to a settlement, not to a player:
 * they wander, visit colonies with gifts, trade or demands, attack when angry and go home.
 */
export interface Brave {
  id: string;
  tribe: TribeId;
  /** Id of the home settlement. */
  home: string;
  x: number;
  y: number;
  /** Carries muskets (bought or captured). */
  armed?: boolean;
  /** Rides horses (bought or captured). */
  mounted?: boolean;
  /** What the brave is doing; missing means it is at or going home. */
  task?: BraveTask;
  /** Goods carried as a gift or for sale. */
  goods?: { good: GoodId; amount: number };
}

export type BraveTask =
  | { kind: 'wander'; turns: number }
  | { kind: 'visit'; colonyId: string; purpose: 'gift' | 'trade' | 'demand' }
  /** Waiting next to a colony for the answer to a demand. */
  | { kind: 'wait'; demandId: string; turns: number }
  /** `defend`: the partner nation whose colony the brave sets out to defend under a mutual defence pact (N7, written only then). */
  | { kind: 'attack'; colonyId?: string; unitId?: string; defend?: PlayerId };

/**
 * A brave's demand for tribute, or offer of goods for sale, waiting for a person to answer it in
 * the turn-start briefing. Computer players answer at once and never leave one waiting.
 */
export interface NativeDemand {
  id: string;
  /**
   * A demand for tribute, an offer of goods for sale, or (Beta 2, native-partners.md N8) the
   * people's offer of a treaty (`treaty` names its kind; no goods, `amount` 0).
   */
  kind: 'demand' | 'offer' | 'treaty';
  nation: PlayerId;
  colonyId: string;
  settlementId: string;
  braveId: string;
  /** The goods asked for (or offered); missing means gold. */
  good?: GoodId;
  amount: number;
  /** For an offer: the price asked in gold. */
  price?: number;
  /** For a treaty offer: the kind of treaty the people offers. */
  treaty?: PeopleTreatyKind;
  turn: number;
}

export interface Settlement {
  id: string;
  tribe: TribeId;
  x: number;
  y: number;
  capital: boolean;
  /** Skill taught to one colonist; null once taught (a cultural exchange may teach its partner again, `taughtAt`). */
  skill: UnitTypeId | null;
  /** Nations whose scouts have spoken with the chief. */
  visited: PlayerId[];
  /**
   * Turn the settlement last taught a colonist (Beta 2, native-partners.md N7: a cultural exchange
   * makes it teach its partner again some 25 years later). Written only while the scenario has
   * cultural exchange (`mechanics.peopleTreaties` includes `exchange`); absent otherwise.
   */
  taughtAt?: number;
  /**
   * Times the settlement has taught again under a cultural exchange (Beta 2 step 6: at most the
   * scenario's `exchange.renewals`). Written only when it does; absent before.
   */
  renewed?: number;
  /**
   * Turn each nation's scout last spoke with the chief (N7: a cultural exchange welcomes the
   * partner's scouts again once a decade). Written only while the scenario has cultural exchange.
   */
  spokeAt?: Partial<Record<PlayerId, number>>;
  defenders: number;
  gold: number;
  /** 0 (content) to 1000 (furious), per European nation. */
  tension: Partial<Record<PlayerId, number>>;
  /** Nation that runs a mission here. */
  mission?: PlayerId;
  missionExpert?: boolean;
  /** Goods the settlement has for sale, and muskets and horses it holds for its braves. Missing means none. */
  goods?: Partial<Record<GoodId, number>>;
  /** Rounds until the settlement can send out a new brave; missing means it can now. */
  braveTimer?: number;
}

export interface GameMessage {
  turn: number;
  /** Nation this message is for; absent means everyone. */
  to?: PlayerId;
  text: string;
  at?: { x: number; y: number };
}

export type ProposalKind = 'trade' | 'favoured' | 'alliance' | 'expedition' | 'confederation';

/**
 * Relations between two European nations (see relations.ts and docs/design/favoured-nation.md).
 * Turn numbers, not years; the thresholds are hidden from players. The agreements themselves (a
 * trade agreement, Favoured Nation status) are treaties (`GameState.treaties`, treaties.ts).
 */
export interface Relation {
  /** The pair, in the order of `GameConfig.nations`. */
  a: PlayerId;
  b: PlayerId;
  /** Turn the current run of peace began: game start, the last peace treaty, or the last cancellation. */
  peaceSince: number;
  /** Hidden: years of continuous peace needed for Favoured Nation (8–12, from the seed). */
  peaceNeeded: number;
  /** Hidden: active trade routes between the two needed for Favoured Nation (2–4, from the seed). */
  routesNeeded: number;
  /** Gold that has changed hands at each other's colonies, both ways, over the game. */
  volume: number;
  /** After a cancellation: no new agreements or foreign stops before this turn. */
  waitUntil?: number;
  /** After a cancellation: computer players on both sides treat the other as a target until this turn. */
  hostileUntil?: number;
  /** Cancellations so far; seeds the next waiting and hostility draws. */
  cancels?: number;
  /** A proposal waiting for the other side (a person) to answer. */
  proposal?: { kind: ProposalKind; from: PlayerId; turn: number };
}

/**
 * A nation's standing with one native people (native-partners.md N3), as `Relation` is between two
 * nations: the years of good relations and the trade that unlock treaties with the people (against
 * hidden thresholds drawn per pair from the seed, never stored), and the waiting and hostility
 * after a broken treaty. Turn numbers, not years. Written lazily (natives.ts `peopleRelation`) when
 * the nation first trades with the people; step 0 keeps `goodSince` and `volume`, the treaties of
 * later steps the rest.
 */
export interface PeopleRelation {
  nation: PlayerId;
  people: TribeId;
  /**
   * Turn the current run of good relations began (at peace with the people, its settlements
   * content on average); missing while relations are not good. Checked once a round.
   */
  goodSince?: number;
  /** Gold that has changed hands in trade with the people's settlements and braves, both ways, over the game. */
  volume: number;
  /** After a broken treaty: the people makes no new treaty with the nation before this turn. */
  waitUntil?: number;
  /** After a broken treaty: the people treats the nation as hostile until this turn. */
  hostileUntil?: number;
  /** Treaties with the people broken so far; seeds the next waiting and hostility draws. */
  breaks?: number;
  /** A proposal waiting for an answer: made by the nation to the people, or offered by the people. */
  proposal?: {
    kind: PeopleTreatyKind;
    from: 'nation' | 'people';
    turn: number;
    /**
     * The player who proposed, in a pair with a playing people (native-nations.md T11, Beta 3 step
     * 4): its answer waits for the person on the other side. Missing in Beta 2's pairs.
     */
    by?: PlayerId;
  };
  /**
   * Turn the nation last took land from the people (without paying for it) (step 1, N8: the people
   * refuses new treaties for `PeopleTreatyRules.landYears` after). Written only while the
   * scenario has treaties with peoples.
   */
  tookLand?: number;
}

/**
 * The kinds of treaty: between European nations (docs/design/cooperation.md, C9) a trade
 * agreement, Favoured Nation status, an alliance and a confederation; between one nation and one
 * native people (docs/design/native-partners.md, N1) the `PeopleTreatyKind`s. A kind says what is
 * agreed, not who agrees, so code that reads European kinds (`'trade'`) never meets a people.
 */
export type TreatyKind = 'trade' | 'favoured' | 'alliance' | 'confederation' | PeopleTreatyKind;

/**
 * Treaties between a nation and a native people (Beta 2, N1–N7): a trade treaty, land use,
 * cultural exchange and mutual defence. Step 1 makes the trade treaty (peopletreaties.ts); the
 * others are only named.
 */
export type PeopleTreatyKind = 'people-trade' | 'land-use' | 'exchange' | 'defence';

/** How a treaty ended. */
export interface TreatyEnd {
  turn: number;
  /**
   * Cancelled by one side, ended by a war between the parties, lapsed (Favoured Nation at a
   * declaration of independence; a treaty with a people that has no settlements left), left: an
   * alliance's last members but one left it, or broken: a nation broke faith with a people (N8).
   */
  why: 'cancelled' | 'war' | 'lapsed' | 'left' | 'concluded' | 'broken';
  /**
   * The party that ended it, when one did: a nation by its bare id (as every treaty between
   * nations is saved), a people as a party (`{ kind: 'people', id }`). Read with treaties.ts
   * `treatyEndedBy`.
   */
  by?: PlayerId | TreatyParty;
}

/**
 * A party to a treaty: a European nation, or a native people (Beta 2, native-partners.md N1), by
 * the people's one id (`TribeId`), the id it would keep as a nation of its own later. Read parties
 * through the helpers in treaties.ts (`partyIsNation`, `partyIsPeople`, `treatyNations`,
 * `treatyPeoples`), never by assuming that every party is a player.
 */
export type TreatyParty = { kind: 'nation'; id: PlayerId } | { kind: 'people'; id: TribeId };

/**
 * A treaty (treaties.ts). Treaties are kept after they end, with `end` set, so the diplomacy
 * screen can show the past ones; at most one treaty of a kind is in force between two nations.
 */
export interface Treaty {
  /** 't1', 't2', … in the order the treaties were made. */
  id: string;
  kind: TreatyKind;
  /** Who is bound by it: for a trade agreement and Favoured Nation, the pair in the order of `GameConfig.nations`. */
  parties: TreatyParty[];
  /** Turn it was made. */
  start: number;
  /** Missing while it is in force. */
  end?: TreatyEnd;
  /** What the parties agreed beyond the kind's rules; missing for trade agreements and Favoured Nation. */
  terms?: TreatyTerms;
  /** Members that left an alliance (`parties` holds the members now), with the turn. Missing means none. */
  left?: { party: TreatyParty; turn: number }[];
}

/**
 * The terms of a treaty, by kind. A union, so other kinds of treaty can bring their own terms.
 */
export type TreatyTerms = AllianceTerms | LandUseTerms;

/**
 * What a land use treaty with a people binds the nation to (Beta 2, native-partners.md N5,
 * peopletreaties.ts): a yearly rent in gold for each tile it leases, set when the lease is made.
 * The tiles themselves carry the lease (`Tile.use`).
 */
export interface LandUseTerms {
  kind: 'land-use';
  /** Gold a year for each tile leased, set when the lease was made. */
  rent: number;
  /** Turn the next year's rent is due (the first year's is paid when the lease is made). */
  due: number;
}

/** What an alliance binds its members to (alliances.ts reads them; ALLIANCE_TERMS are the standard ones). */
export interface AllianceTerms {
  kind: 'alliance';
  /** An attack on one member is war with all of them. */
  defensive: boolean;
  /** Members' units may enter, garrison and trade in each other's colonies. */
  openColonies: boolean;
  /** Members see what each other's units and colonies see. */
  sharedSight: boolean;
}

/**
 * The whole game, as saved. Invariant: a save and load (serialize, then deserialize) gives a state
 * that plays exactly as this one, and saves to the same text. To keep it so, the state is a plain
 * JSON tree:
 * - no object or array appears twice in it (an object held in two places stays one object while
 *   playing, but becomes two after a load, so changing one would no longer change the other):
 *   store a copy, or an id, never an object the state already holds;
 * - only JSON values: no Map, Set, Date, class instance, function, NaN, Infinity or -0;
 * - `undefined` only where an absent key means the same (JSON drops it);
 * - nothing decided by the order of a record's keys unless that order survives JSON (it does:
 *   JSON.parse adds keys in the saved order, so integer-like keys are the only catch).
 * Caches beside the state (unitindex.ts) are rebuilt from a loaded state in the same order.
 * test/roundtrip.test.ts plays games with a save and load after every round and checks this.
 */
export interface GameState {
  version: 3;
  config: GameConfig;
  turn: number;
  /** Index into players of the nation whose turn it is. */
  current: number;
  rng: number;
  nextId: number;
  map: GameMap;
  players: Player[];
  /** Read-only record: add and remove units with addUnit and removeUnit (unitindex.ts), which keep the unit index up to date. */
  units: { readonly [id: string]: Unit };
  /** Read-only record: add and remove colonies with addColony and removeColony (unitindex.ts). */
  colonies: { readonly [id: string]: Colony };
  tribes: Tribe[];
  settlements: Record<string, Settlement>;
  messages: GameMessage[];
  /** The game's difficulty level, resolved from the config; missing (older saves) means Conquistador. */
  difficulty?: DifficultyId;
  /** Relations between each pair of European nations, keyed by relationKey(a, b). */
  relations: Record<string, Relation>;
  /** Treaties between European nations, in force and past, in the order made (treaties.ts). Missing until the first one. */
  treaties?: Treaty[];
  /**
   * Each nation's standing with each native people (natives.ts, native-partners.md N3), keyed by
   * `peopleRelationKey(nation, people)` ("france|arawak"). Written lazily, when a nation first
   * trades with a people; missing until then.
   */
  peopleRelations?: Record<string, PeopleRelation>;
  /** Trade routes by id; missing means none. */
  routes?: Record<string, TradeRoute>;
  /** Native braves on the map, by id. Missing (older saves) means none yet; settlements send them out. */
  braves?: Record<string, Brave>;
  /** Native demands and offers waiting for a person's answer. Missing means none. */
  nativeDemands?: NativeDemand[];
  gameOver?: {
    turn: number;
    reason: string;
    /** The first winner, for code that knows one winner only; missing when nobody won. */
    winner?: PlayerId;
    scores: Partial<Record<PlayerId, number>>;
    /** The person ended the game early (leaving.ts). */
    retired?: boolean;
    /**
     * Every winner, best first (C3): one nation, or the members of an alliance that won together
     * (`concord`, victory.ts), ranked by their own score; empty when nobody won.
     */
    winners: PlayerId[];
    /**
     * The native peoples the winners are partners of (the `prosperity` victory, native-partners.md
     * N10): named on the game-over screen, not winners themselves. Missing for other endings.
     */
    partners?: TribeId[];
  };
  /**
   * The land's regions (native-nations.md T10, land.ts), while the scenario has hard years or land
   * health: missing otherwise (the Americas and the Caribbean).
   */
  land?: LandState;
  /** Silver and ore dug so far from mining tiles, by "x,y" (see mines.ts). Missing means none. */
  mined?: Record<string, number>;
  /** Set the first time a cheat is used and never cleared. Missing means the game is not cheated. */
  cheated?: { turn: number; cheats: CheatId[] };
  /** Game-wide modifiers set by cheats. Missing fields mean the normal rules. */
  modifiers?: {
    /** Multiplier on terrain yields (missing means 1). */
    yieldMultiplier?: number;
    /** Nations whose view shows the whole map without fog. */
    reveal?: PlayerId[];
  };
  /** Progress statistics, one snapshot per round (see stats.ts). Missing in older saves. */
  stats?: StatsHistory;
  /** Notable events for the History report, oldest first and capped (see history.ts). Missing in older saves. */
  history?: HistoryEntry[];
  /** Goods sold and delivered per nation, for the Trade report (see history.ts). Missing in older saves. */
  ledger?: Partial<Record<PlayerId, Ledger>>;
  /** The event framework's state: fired events, temporary modifiers, pending choices (events/). Missing until first used. */
  events?: EventsState;
}

export type HistoryKind =
  | 'colony'
  | 'captured'
  | 'father'
  | 'war'
  | 'peace'
  | 'trade'
  | 'favoured'
  /** Alliances made, joined and left (alliances.ts). */
  | 'alliance'
  /** Chartered companies founded (companies.ts). */
  | 'company'
  | 'cancel'
  | 'treasure'
  | 'burned'
  | 'independence'
  | 'tribe'
  /** The King's demands for gold (paid or refused) and the wars he declares (crown.ts). */
  | 'crown'
  /** Historical and random events (events/). */
  | 'event';

/** One event in the game's history (see history.ts). */
export interface HistoryEntry {
  turn: number;
  kind: HistoryKind;
  /** The nations concerned; the first is the one that acted. */
  nations: PlayerId[];
  text: string;
  /** Known only to the nations concerned; otherwise every nation heard of it. */
  secret?: boolean;
  at?: { x: number; y: number };
}

/** Units of each good, by channel: sold in a home port, by custom houses, unloaded by routes, sold to partners' colonies. */
export interface GoodsTally {
  europe: Partial<Record<GoodId, number>>;
  custom: Partial<Record<GoodId, number>>;
  route: Partial<Record<GoodId, number>>;
  foreign: Partial<Record<GoodId, number>>;
  /** Sold to native settlements, and bought from them (by wagon trains, ships and from visiting braves). Missing means none. */
  natives?: Partial<Record<GoodId, number>>;
  fromNatives?: Partial<Record<GoodId, number>>;
}

export interface Ledger {
  total: GoodsTally;
  /** Turn `now` counts. */
  turn: number;
  now: GoodsTally;
  last: GoodsTally;
}

/**
 * Compact per-round statistics: `data[nation]` holds `keys.length` numbers per entry of `turns`,
 * each the change since the nation's previous entry (the first entry as is). Read it with statsHistory.
 */
export interface StatsHistory {
  keys: string[];
  turns: number[];
  data: Partial<Record<PlayerId, number[]>>;
  /** Trade income, goods produced and crosses since the last snapshot. */
  flows?: Partial<Record<PlayerId, { trade?: number; production?: number; crosses?: number }>>;
}
