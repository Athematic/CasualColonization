import type { BuildingKind } from '../rules/buildings.js';
import type { GoodId } from '../rules/goods.js';
import type { PlayerId } from '../rules/nations.js';
export type AiLevel = 'naive' | 'competent' | 'combative' | 'creative';

export const AI_LEVELS: AiLevel[] = ['naive', 'competent', 'combative', 'creative'];

export const AI_LEVEL_INFO: Record<AiLevel, { name: string; description: string }> = {
  naive: {
    name: 'Naive',
    description: 'Settles and works the land, ships goods home and recruits, but plans nothing ahead.',
  },
  competent: {
    name: 'Competent',
    description: 'Runs an efficient economy: scouts, trains experts, manages colonies and trade, keeps the natives calm and works towards independence.',
  },
  combative: {
    name: 'Combative',
    description: 'A competent economy behind an aggressive army: takes native land, raids settlements, preys on shipping and attacks weak neighbours.',
  },
  creative: {
    name: 'Creative',
    description: 'Plays like a person: reassesses the game every few turns, shifts focus between exploring, growing, liberty, defence and independence, and seizes opportunities.',
  },
};

/** Tunable behaviour shared by every level above Naive. */
export interface AiProfile {
  /** Colonies the nation wants by a given turn. */
  colonyTarget: (turn: number) => number;
  /** Gold kept in reserve before spending. */
  reserve: number;
  scouting: boolean;
  learnFromNatives: boolean;
  /** How native land next to colonies is acquired. */
  land: 'avoid' | 'buy' | 'take';
  /** Weight of liberty bells against other production. */
  liberty: number;
  /** Armed units kept in each colony. */
  garrison: number;
  /** 0 never starts wars; 1 attacks whenever it has the upper hand. */
  aggression: number;
  raidNatives: boolean;
  piracy: boolean;
  missions: boolean;
  schools: boolean;
  gifts: boolean;
  /**
   * With `gifts`: the tension of the worst settlement near its colonies above which the nation
   * gives a people gold (`GIFTS_ABOVE` when absent). Creative, the peoples' main partner, gives sooner.
   */
  giftsAbove?: number;
  /**
   * When to declare independence: not before `minTurn`, with at least `minShare` percent rebels,
   * at least `armyPerColony` armed units per colony, and a defence of at least `ratio` times the
   * Royal Expeditionary Force built up by then (ai/royal.ts). With `arm` the nation also arms for
   * it: garrisons sized against the REF, muskets and horses first, militia, artillery.
   *
   * `adopt` is when the nation takes up an independence plan (ai/plan.ts): once `share` percent of
   * its colonists are rebels, or from `turn`, and, with `strength`, only once its defence (with the
   * help it can expect) is that share of what the declaration needs. A plan, once adopted, raises
   * liberty until the rebels are a safe majority and builds printing presses, armories, stockades
   * and forts; once the rebels are close to a majority it arms.
   */
  independence: {
    minTurn: number;
    minShare: number;
    armyPerColony: number;
    ratio: number;
    arm?: boolean;
    adopt?: { share: number; turn: number; strength?: number };
  } | null;
  /** Re-plans its focus every few turns (Creative). */
  adaptive: boolean;
  /**
   * A new colony is an investment (ai/advanced.ts, expansionReady). Beyond the first colony, a
   * colonist founds one only when the colonies have on average `minPopulation` colonists, the last
   * colony is at least `everyTurns` old, the charter (if the game uses it) leaves `reserve` gold,
   * and the nation can spare a defender: every colony beyond the first `undefended` has an armed
   * unit or a stockade once it is `graceTurns` old, with one more armed unit for the new colony.
   * A colonist with no colony to reach founds one anyway.
   */
  expansion: { minPopulation: number; everyTurns: number; undefended: number; graceTurns: number; settlers: number };
}

const competent: AiProfile = {
  colonyTarget: (turn) => Math.min(24, 3 + Math.floor(turn / 9)),
  reserve: 300,
  scouting: true,
  learnFromNatives: true,
  land: 'buy',
  liberty: 1.4,
  garrison: 1,
  aggression: 0,
  raidNatives: false,
  piracy: false,
  missions: true,
  schools: true,
  gifts: true,
  independence: { minTurn: 200, minShare: 55, armyPerColony: 1, ratio: 1.25, arm: true, adopt: { share: 45, turn: 240 } },
  adaptive: false,
  expansion: { minPopulation: 3, everyTurns: 6, undefended: 2, graceTurns: 20, settlers: 2 },
};

export const AI_PROFILES: Record<Exclude<AiLevel, 'naive'>, AiProfile> = {
  competent,
  combative: {
    ...competent,
    land: 'take',
    liberty: 1.2,
    garrison: 2,
    aggression: 1,
    raidNatives: true,
    piracy: true,
    gifts: false,
    // Takes up an independence plan only once its army is strong: 60% of what the declaration needs;
    // declares only with a clear margin (its declarations at 1.1 were crushed in probe games).
    independence: { minTurn: 170, minShare: 50, armyPerColony: 1.5, ratio: 1.35, arm: true, adopt: { share: 35, turn: Infinity, strength: 0.6 } },
    // Grabs land sooner and faster than the others, but still not with one-man colonies.
    expansion: { minPopulation: 2.5, everyTurns: 4, undefended: 2, graceTurns: 20, settlers: 2 },
  },
  // Creative, the peoples' main partner (native-partners.md N11), calms a people sooner (step 6).
  creative: { ...competent, adaptive: true, giftsAbove: 300 },
};

/**
 * A chartered company's own simple profile (companies.ts): a Competent economy that settles,
 * trades and pays its way, without war, missions, schools, liberty or independence.
 */
export const COMPANY_PROFILE: AiProfile = {
  ...competent,
  colonyTarget: (turn) => Math.min(6, 1 + Math.floor(turn / 40)),
  liberty: 0,
  aggression: 0,
  missions: false,
  schools: false,
  independence: null,
};

/**
 * A computer people's profile at its level (docs/design/native-nations.md T15; Beta 3 step 9):
 * Creative trades and makes treaties, Competent balances, Combative defends hard and raids rivals,
 * Naive grows. Read by ai/people.ts and, for what the rules ask of a computer people (its reserve,
 * its builds, its answers), by the people's modules. Drafted for Simon's review.
 */
export interface PeopleProfile {
  /** The towns' reserve as a share of the people's `storeYears` (T10: Combative keeps half). */
  stores: number;
  /**
   * Land health under which its hunters are held within the region's renewal: Creative and Competent
   * 90, Combative 60 (T10 drafted 70 and 40; with those the levels' land ended alike, step 9); null
   * follows the price and never holds back (Naive).
   */
  restraint: number | null;
  /** Sells food above its towns' reserve to Europeans on its trade visits (T10: Naive). */
  sellsFood: boolean;
  /** European goods it buys with its gold on its trade visits, in order (muskets and horses arm its warriors, tools speed its builds, cloth and trade goods go in barter). */
  buys: GoodId[];
  /** Times Beta 2's `offer` chance for its proposals, and `accept` chance for its answers. */
  offer: number;
  accept: number;
  /** The treaties it proposes to European nations (the ladder still applies). */
  nationKinds: ('people-trade' | 'land-use' | 'exchange' | 'defence')[];
  /** Proposes trade treaties and mutual defence pacts to other peoples. */
  peoplePacts: boolean;
  /** T14: Creative leads a league once it holds pacts; Competent joins one it is offered; Combative and Naive do neither. */
  league: 'lead' | 'join' | 'none';
  /** Barter visits to other peoples' towns and settlements nearby a year (its standing with them grows by what is traded). */
  barter: number;
  /** Goes to war with a European nation that settles on its homeland, and raids its units near its towns (Combative). */
  raids: boolean;
  /** Years of war after which it seeks peace. */
  peaceAfter: number;
  /** Its warriors attack an enemy beside its land only with at least this edge (offence over defence). */
  margin: number;
  /** Tiles of unclaimed land next to its own it claims a year. */
  claims: number;
  /** What its towns build when nothing is set, in order (the first it can). */
  plan: BuildingKind[];
  /**
   * Shares its maps with the peoples it meets (peoplemaps.ts, Beta 3 step 10b, where the scenario's
   * `mechanics.mapKnowledge.share` has it): every profile but Combative.
   */
  shareMaps: boolean;
  /**
   * Times the scenario's `mechanics.mapKnowledge.range`: how far from its towns its runners explore
   * (ai/people.ts `explore`). Creative goes farthest to meet partners, Naive keeps near home.
   */
  explore: number;
  /**
   * Its answer to a European nation's offer for its land (peopleland.ts, native-nations.md section
   * 18): times the scenario's `landSales.accept`; 0 never sells. It never sells a town's tile or a
   * tile its towns work, nor below `keepsHomeland` of its starting homeland.
   */
  sellsLand: number;
  keepsHomeland: number;
  /** Chance it goes to war with a nation that takes its land. */
  warOnTaking: number;
}

const competentPeople: PeopleProfile = {
  stores: 1,
  restraint: 90,
  sellsFood: false,
  buys: ['tools', 'muskets', 'cloth'],
  offer: 1,
  accept: 1,
  nationKinds: ['people-trade', 'exchange', 'defence'],
  peoplePacts: true,
  league: 'join',
  barter: 1,
  raids: false,
  peaceAfter: 8,
  margin: 1.2,
  claims: 1,
  plan: ['storagePits', 'longhouse', 'palisade', 'canoeLanding', 'workshop', 'dryingRacks'],
  shareMaps: true,
  explore: 1,
  sellsLand: 0.5,
  keepsHomeland: 0.8,
  warOnTaking: 0.5,
};

export const PEOPLE_PROFILES: Record<AiLevel, PeopleProfile> = {
  // Grows: housing first, follows the price on the land, sells food when it can, makes few treaties.
  naive: {
    ...competentPeople,
    restraint: null,
    sellsFood: true,
    buys: ['tools'],
    offer: 0.5,
    nationKinds: ['people-trade'],
    peoplePacts: false,
    league: 'none',
    barter: 0,
    peaceAfter: 12,
    claims: 0,
    plan: ['longhouse', 'storagePits', 'workshop', 'canoeLanding', 'dryingRacks', 'palisade'],
    explore: 0.5,
    // Follows the price for its land too, down to half its homeland, and seldom fights for it.
    sellsLand: 1,
    keepsHomeland: 0.5,
    warOnTaking: 0.25,
  },
  competent: competentPeople,
  // Defends hard and raids rivals: walls first, muskets and horses, a smaller store, slow to make peace.
  combative: {
    ...competentPeople,
    stores: 0.5,
    restraint: 60,
    buys: ['muskets', 'horses', 'tools'],
    offer: 0.5,
    accept: 0.7,
    nationKinds: ['people-trade'],
    league: 'none',
    barter: 0,
    raids: true,
    peaceAfter: 20,
    margin: 0.9,
    claims: 2,
    plan: ['palisade', 'storagePits', 'longhouse', 'workshop', 'canoeLanding', 'dryingRacks'],
    shareMaps: false,
    explore: 0.75,
    // Sells none of its land, and fights for what is taken.
    sellsLand: 0,
    keepsHomeland: 1,
    warOnTaking: 1,
  },
  // Trades and makes treaties: every kind with the nations, pacts and a league with the peoples.
  creative: {
    ...competentPeople,
    buys: ['tools', 'cloth', 'tradeGoods', 'muskets'],
    offer: 2,
    accept: 1.2,
    nationKinds: ['people-trade', 'land-use', 'exchange', 'defence'],
    league: 'lead',
    barter: 2,
    peaceAfter: 5,
    plan: ['storagePits', 'longhouse', 'canoeLanding', 'workshop', 'dryingRacks', 'palisade'],
    explore: 1.5,
    // Leases rather than sells (its treaties include land use), and seeks peace rather than war.
    sellsLand: 0.3,
    keepsHomeland: 0.85,
    warOnTaking: 0.25,
  },
};

/** The profile of a people the computer plays (by its level), or undefined for a person's people and any other player. */
export function peopleProfileOf(players: readonly { id: PlayerId; kind?: string; human: boolean; ai?: AiLevel }[], id: PlayerId): PeopleProfile | undefined {
  for (const p of players) if (p.id === id) return p.kind === 'people' && !p.human ? PEOPLE_PROFILES[p.ai ?? 'naive'] : undefined;
  return undefined;
}

/** What a Creative nation is concentrating on at the moment. */
export type AiFocus = 'explore' | 'expand' | 'develop' | 'liberty' | 'independence' | 'defend' | 'war';

/** Long-term memory a computer nation keeps between turns. Plain data, saved with the game. */
export interface AiMemory {
  focus?: AiFocus;
  /** Turn the focus was last reviewed. */
  reviewed?: number;
  personality?: { aggression: number; trade: number; liberty: number };
  /** Colony the army is marching on. */
  warTarget?: string;
  /** Turn the last war was started, to avoid constant warfare. */
  lastWar?: number;
  /** No new proposal of this kind to this nation before the turn given, keyed `trade:france` or `favoured:france`. */
  proposalCooldown?: Record<string, number>;
  /** Goods bought in one European port to sell in another (Creative's triangle trading), by ship id. */
  triangle?: Record<string, { good: GoodId; port: PlayerId; turn: number; net: number }>;
  /** After cancelling Favoured Nation to go to war: the nation, and the first turn war may be declared. */
  warPlan?: { nation: PlayerId; turn: number };
  /** Wagon trains carrying goods bought from natives, and the port each is taking them to. */
  nativeHaul?: Record<string, string>;
  /** Turn a missionary last incited a tribe (Combative). */
  lastIncite?: number;
  /** Colonists sent out to found colonies, by unit id (ai/advanced.ts, sendSettler). */
  settlers?: string[];
  /** Settlers waiting in a coastal colony, or aboard, for a ship to a site on another island, by unit id (`ai.islands`). */
  seaSettlers?: Record<string, { x: number; y: number }>;
  /** Turn the nation adopted its independence plan (ai/plan.ts). */
  independencePlan?: number;
  /** Ready for independence with an ally: the turn it began waiting for the ally to declare together (ai/advanced.ts). */
  allyWait?: number;
}
