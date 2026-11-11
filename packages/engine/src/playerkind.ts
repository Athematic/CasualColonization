/**
 * Kinds of player and the systems that apply to each (docs/design/native-nations.md, T1; Beta 3
 * step 1). Every check of "is this a company / the Crown / a European nation" that decides whether
 * a system runs for a player reads this table, so a new kind of player (a native people, `kind:
 * 'people'`) switches the Europe-only systems off in one place.
 *
 * The kinds:
 * - `nation`: a European nation (no `Player.kind`, an id other than `crown`).
 * - `company`: a chartered company (`kind: 'company'`, companies.ts; Beta 1).
 * - `crown`: the Crown, which joins the game to fight a War of Independence (`id: 'crown'`).
 * - `people`: a native people played as a nation (`kind: 'people'`, its id its own `TribeId`).
 *
 * The ids of the four kinds never overlap (`crown`, the company ids, the people ids, the nations),
 * so the kind can also be read from an id alone (`kindOfId`), which the rules that have no game at
 * hand use (native tension, relations).
 *
 * The rows for nations, companies and the Crown reproduce the checks the engine made before this
 * table, one by one, so games without a playing people are unchanged (T21's testing aid: the
 * golden and bench hashes). Checks that ask for the Crown's own units or colonies (`u.owner ===
 * 'crown'`: the Royal Expeditionary Force, colonies retaken by royal troops) are not system checks
 * and stay as they are.
 */
import { COMPANY_IDS, TRIBES, type PlayerId } from './rules/nations.js';
import type { Player } from './types.js';

export type PlayerKind = 'nation' | 'company' | 'crown' | 'people';

/** Which of the engine's systems apply to a kind of player. */
export interface PlayerSystems {
  /**
   * A home port in Europe: a market of its own (`Player.market`), buying, selling, training and
   * recruiting there, ships sailing to and from Europe. The Crown keeps the market record every
   * player was given before this table (it never trades).
   */
  homePort: boolean;
  /** Crosses bring immigrants to the docks (europe.ts `processImmigration`); the recruit pool. */
  immigration: boolean;
  /**
   * The Crown raises taxes on sales in Europe (europe.ts, `mechanics.taxes`); boycotts. As before
   * this table, the Crown's own colonies (retaken from rebels) are taxed on what their custom
   * houses sell.
   */
  taxes: boolean;
  /**
   * Under a Crown: the Royal Expeditionary Force grows, the King demands gold and declares royal
   * wars (crown.ts, `mechanics.ref`, `demands`, `royalWars`), and other Kings may declare war on it.
   */
  crown: boolean;
  /** May declare independence (independence.ts, rebellion.ts, confederation.ts). */
  independence: boolean;
  /** Collects liberty bells for the Continental Congress (fathers.ts); allies' shared bells. */
  congress: boolean;
  /** Starts the game with a caravel carrying a soldier and a pioneer (game.ts `startingUnits`); a people starts with its towns (peopleplayer.ts). */
  startingCaravel: boolean;
  /**
   * Makes war and is attacked: declares war, is a war target, its units fight and its ships are
   * prey. Chartered companies are neutral (cooperation.md C2).
   */
  war: boolean;
  /**
   * Relations between European nations (relations.ts): trade agreements, Favoured Nation, hostility,
   * the proposals computer nations make.
   */
  relations: boolean;
  /** Alliances, shared sight, defensive pacts and confederation (alliances.ts, Beta 1). */
  alliances: boolean;
  /**
   * Peoples that nobody plays deal with it as a European: tension, war and submission, braves'
   * raids and demands, burial grounds, missions and inciting, Beta 2's treaties and standing.
   */
  peoples: boolean;
  /** Braves of peoples nobody plays visit its colonies (to trade, bring gifts, demand or raid). */
  visitedByBraves: boolean;
  /**
   * Lost City Rumours: its units entering a rumour's tile explore it (rumours.ts; some finds are
   * European: immigrants on the docks, treasure). A people's units leave rumours alone.
   */
  rumours: boolean;
  /** Historical and random events (events/index.ts). */
  events: boolean;
  /** Ranked among the European nations: final scores, holding shares in companies, play-on. */
  ranked: boolean;
  /** How the computer plays it (ai/index.ts `runAi`). */
  ai: 'level' | 'company' | 'crown' | 'people';
}

/**
 * The systems table. A people (T1, T10): no home port or market, no immigration, no Crown (taxes,
 * demands, royal wars, the Royal Expeditionary Force), no independence, no Congress (its own
 * council comes in step 3), no caravel. War and peace between any players (T11). It is not a
 * European to the peoples nobody plays (T2: no tension, missions or inciting against it), and
 * European relations, alliances, events and ranking are not its (steps 4 and 7 widen what is due).
 */
export const PLAYER_SYSTEMS: Readonly<Record<PlayerKind, Readonly<PlayerSystems>>> = {
  nation: {
    homePort: true, immigration: true, taxes: true, crown: true, independence: true, congress: true, startingCaravel: true,
    war: true, relations: true, alliances: true, peoples: true, visitedByBraves: true, rumours: true, events: true, ranked: true, ai: 'level',
  },
  company: {
    homePort: true, immigration: true, taxes: false, crown: false, independence: false, congress: false, startingCaravel: true,
    war: false, relations: false, alliances: false, peoples: false, visitedByBraves: true, rumours: true, events: false, ranked: false, ai: 'company',
  },
  crown: {
    homePort: true, immigration: false, taxes: true, crown: false, independence: false, congress: false, startingCaravel: false,
    war: true, relations: false, alliances: false, peoples: false, visitedByBraves: false, rumours: true, events: false, ranked: false, ai: 'crown',
  },
  people: {
    homePort: false, immigration: false, taxes: false, crown: false, independence: false, congress: false, startingCaravel: false,
    war: true, relations: false, alliances: false, peoples: false, visitedByBraves: false, rumours: false, events: false, ranked: false, ai: 'people',
  },
};

/** A player's kind. */
export function playerKind(p: Pick<Player, 'id' | 'kind'>): PlayerKind {
  if (p.id === 'crown') return 'crown';
  return p.kind ?? 'nation';
}

/** The kind of the player an id names, from the id alone (the kinds' ids never overlap). */
export function kindOfId(id: PlayerId): PlayerKind {
  if (id === 'crown') return 'crown';
  if (COMPANY_IDS.has(id)) return 'company';
  if (Object.hasOwn(TRIBES, id)) return 'people';
  return 'nation';
}

/** The systems that apply to a player. */
export function systemsOf(p: Pick<Player, 'id' | 'kind'>): Readonly<PlayerSystems> {
  return PLAYER_SYSTEMS[playerKind(p)];
}

/** The systems that apply to the player an id names. */
export function systemsOfId(id: PlayerId): Readonly<PlayerSystems> {
  return PLAYER_SYSTEMS[kindOfId(id)];
}

/** Whether a player is a native people played as a nation (T1). */
export function isPeoplePlayer(p: Pick<Player, 'id' | 'kind'> | undefined): boolean {
  return !!p && playerKind(p) === 'people';
}
