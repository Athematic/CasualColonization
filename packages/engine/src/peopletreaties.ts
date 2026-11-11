/**
 * Treaties with native peoples (Beta 2, docs/design/native-partners.md): step 1 builds the trade
 * treaty (`people-trade`, N4). A treaty binds one nation and one people (N1); its parties are read
 * through treaties.ts's helpers, so that a people played as a nation later keeps the same treaties.
 *
 * - **Unlocking (N3):** the nation's standing with the people (natives.ts `peopleRelation`): years
 *   of good relations and gold traded, against hidden thresholds drawn per pair from a seeded
 *   stream of their own (`peoplePairRandom`), never stored and never touching `GameState.rng`.
 *   Contact (a scout's visit, a mission or a trade) writes the standing; without it no treaty.
 * - **The people decides (N8):** a nation proposes (`proposePeopleTreaty`) and the people answers
 *   at once by simple seeded rules: never while one of its settlements is angry with the nation or
 *   within `landYears` of land taken from it, otherwise at `accept` times its temperament. A people
 *   offers a treaty itself through a brave visiting a colony to trade (braves.ts), a turn-start
 *   notice (`NativeDemand` of kind 'treaty') for a person, answered at once by a computer player.
 * - **Effects (N4):** better prices both ways, more goods gathered, more trade visits, faster calm,
 *   and trade routes may stop at a partner's settlement (routes.ts). All numbers scenario data.
 * - **Land use (N5, step 2):** a lease. With a trade treaty, a nation may lease the people's land
 *   next to its colonies (`Tile.use`) for a yearly rent per tile set when the lease is made
 *   (`LandUseTerms`); its colonies work the tiles while the land stays the people's, whose
 *   settlements still gather from them at half rate, and those colonies press half as hard on the
 *   people. The rent is paid each year; a nation that cannot pay loses the lease (it lapses, no
 *   breach). Buying a leased tile stays possible; taking one breaks faith.
 * - **Breaking faith (N8):** taking a partner's land, attacking it or inciting it ends every
 *   treaty with that people, raises tension across it, and sets waiting and hostility. A people
 *   ends its treaties itself when one of its settlements turns angry, or with war.
 *
 * Everything is switched by the scenario's `mechanics.peopleTreaties` (the kinds in play); with it
 * off nothing here runs, writes or draws, so games play as before.
 */
import { fail } from './errors.js';
import { hasSubmitted } from './braves.js';
import { noteHistory } from './history.js';
import { bestJob } from './colony.js';
import { addTension, goodRelations, landPrice, nativeLandClosedTo, nativeLandOwner, peopleRelation, peopleRelationOf, peopleThreshold, settlementName, tensionOf } from './natives.js';
import { message, player, tileAt, tileWorkedBy, unitName, unitPosition, workArea } from './queries.js';
import { peoplePairRandom } from './relations.js';
import { isCompanyIdent, TRIBES, type NationId, type TribeId } from './rules/nations.js';
import { cooperationOf, LEVEL_COOPERATION } from './alliances.js';
import { calendarOf, mechanicsOf, nationOf, nativeRulesOf, peopleOf, scenarioOf, turnAfterYears, yearValue } from './scenarios/index.js';
import type { PeopleTreatyRules, Scenario, TemperamentRules, YearsAround } from './scenarios/types.js';
import { track } from './telemetry.js';
import { addTreaty, endTreaty, nationParty, peopleParty, peopleTreatyBetween, treatiesWithPeople, treatyNations, treatyPeoples } from './treaties.js';
import type { Colony, GameState, LandUseTerms, PeopleTreatyKind, Settlement, Treaty, TreatyEnd } from './types.js';
import { colonyList, setUnitLoc, unitList } from './unitindex.js';

/** The engine's rules for treaties with peoples; a scenario's `peopleTreaties` is merged over them. */
export const PEOPLE_TREATY_RULES: PeopleTreatyRules = {
  trade: {
    // Favoured Nation needs 8–12 years of peace; a people about as long of good relations, and some trade.
    years: { base: 8, spread: 3 },
    volume: { min: 100, max: 400 },
    sell: 1.2,
    buy: 0.8,
    gather: 1.25,
    braveTrade: 2,
    tensionFall: 2,
  },
  landUse: {
    // Some years more than the trade treaty's, drawn on their own.
    years: { base: 12, spread: 4 },
    rent: 0.05,
    gather: 0.5,
    pressure: 0.5,
  },
  accept: 0.8,
  offer: 0.3,
  landYears: 20,
  breachTension: 200,
  // As leaving an alliance (alliances.ts ALLIANCE_RULES).
  waitingYears: { base: 15, spread: 3 },
  hostilityYears: { base: 25, spread: 5 },
  temperaments: {
    open: { accept: 1.2, offer: 1.5, thresholds: 0.75 },
    guarded: { accept: 0.7, offer: 0.5, thresholds: 1.25 },
    proud: { accept: 0.5, offer: 0.25, thresholds: 1 },
  },
};

const NO_TEMPERAMENT: TemperamentRules = { accept: 1, offer: 1, thresholds: 1 };

const RULES = new WeakMap<Scenario, PeopleTreatyRules>();

/** The game's rules for treaties with peoples: the scenario's `peopleTreaties` over PEOPLE_TREATY_RULES, the tables field by field. */
export function peopleTreatyRules(s: GameState): PeopleTreatyRules {
  const scenario = scenarioOf(s);
  let rules = RULES.get(scenario);
  if (!rules) {
    const over = scenario.peopleTreaties;
    if (!over) rules = PEOPLE_TREATY_RULES;
    else {
      const temperaments = { ...PEOPLE_TREATY_RULES.temperaments };
      for (const k of Object.keys(over.temperaments ?? {}) as (keyof typeof temperaments)[]) temperaments[k] = { ...temperaments[k], ...over.temperaments![k] };
      rules = { ...PEOPLE_TREATY_RULES, ...over, trade: { ...PEOPLE_TREATY_RULES.trade, ...over.trade }, landUse: { ...PEOPLE_TREATY_RULES.landUse, ...over.landUse }, temperaments };
    }
    RULES.set(scenario, rules);
  }
  return rules;
}

/** Whether the scenario has treaties of this kind with peoples (`mechanics.peopleTreaties`). */
export function peopleTreatyOn(s: GameState, kind: PeopleTreatyKind = 'people-trade'): boolean {
  return !!mechanicsOf(s).peopleTreaties?.includes(kind);
}

/** Whether the scenario has treaties of any kind with peoples. */
export function peopleTreatiesOn(s: GameState): boolean {
  return !!mechanicsOf(s).peopleTreaties?.length;
}

/** Whether a nation can make treaties with peoples: a European nation, neither the Crown nor a company. */
function treatyNation(nation: NationId): boolean {
  return nation !== 'crown' && !isCompanyIdent(nation);
}

/** The trade treaty in force between a nation and a people, if any. */
export function peopleTradeTreaty(s: GameState, nation: NationId, people: TribeId): Treaty | undefined {
  return s.treaties ? peopleTreatyBetween(s, 'people-trade', nation, people) : undefined;
}

/** Whether a nation and a people have a trade treaty in force. */
export function hasPeopleTrade(s: GameState, nation: NationId, people: TribeId): boolean {
  return !!peopleTradeTreaty(s, nation, people);
}

/** Whether a people has a trade treaty in force with any nation. */
export function peopleTrades(s: GameState, people: TribeId): boolean {
  const list = s.treaties;
  if (!list) return false;
  for (const t of list) if (!t.end && t.kind === 'people-trade' && treatyPeoples(t).includes(people)) return true;
  return false;
}

/** The peoples a nation has a trade treaty with, in the order the treaties were made. */
export function tradePartnerPeoples(s: GameState, nation: NationId): TribeId[] {
  const out: TribeId[] = [];
  for (const t of s.treaties ?? []) if (!t.end && t.kind === 'people-trade' && treatyNations(t).includes(nation)) out.push(...treatyPeoples(t));
  return out;
}

// ---------------------------------------------------------------------------
// Effects of a trade treaty (N4). Each is 1 (or 0) without a treaty, so nothing changes then.

/** What a people's settlement pays a nation for goods, against the usual. */
export function peopleSellFactor(s: GameState, nation: NationId | undefined, people: TribeId): number {
  return nation && hasPeopleTrade(s, nation, people) ? peopleTreatyRules(s).trade.sell : 1;
}

/** What a people's goods cost a nation, against the usual. */
export function peopleBuyFactor(s: GameState, nation: NationId, people: TribeId): number {
  return hasPeopleTrade(s, nation, people) ? peopleTreatyRules(s).trade.buy : 1;
}

/** What a people's settlements gather for sale, against the usual: more while it trades by treaty with anyone. */
export function peopleGatherFactor(s: GameState, people: TribeId): number {
  return peopleTrades(s, people) ? peopleTreatyRules(s).trade.gather : 1;
}

/** How much more often a people's braves come to trade at a nation's colonies. */
export function peopleBraveTradeFactor(s: GameState, nation: NationId, people: TribeId): number {
  return hasPeopleTrade(s, nation, people) ? peopleTreatyRules(s).trade.braveTrade : 1;
}

/** Tension that falls each round towards a nation beyond the usual drift. */
export function peopleTensionFall(s: GameState, nation: NationId, people: TribeId): number {
  return hasPeopleTrade(s, nation, people) ? peopleTreatyRules(s).trade.tensionFall : 0;
}

// ---------------------------------------------------------------------------
// Standing, unlocking and the people's mind

/** The people's temperament rules (none: the rules as they are). */
export function temperamentOf(s: GameState, people: TribeId): TemperamentRules {
  const t = peopleOf(s, people).temperament;
  return t ? peopleTreatyRules(s).temperaments[t] : NO_TEMPERAMENT;
}

/**
 * Contact with a people (a scout's visit, a mission; trade writes it too): writes the nation's
 * standing with the people, so treaties can follow. Only while the scenario has treaties with
 * peoples, so other games keep their save text.
 */
export function notePeopleContact(s: GameState, nation: NationId, people: TribeId): void {
  if (!peopleTreatiesOn(s) || !treatyNation(nation)) return;
  peopleRelation(s, nation, people);
}

/** Whether a nation has had contact with a people (its standing is written). */
export function inContact(s: GameState, nation: NationId, people: TribeId): boolean {
  return !!peopleRelationOf(s, nation, people);
}

/** The hidden thresholds that unlock a trade treaty between a nation and a people (drawn, never stored). */
export function peopleTradeThresholds(s: GameState, nation: NationId, people: TribeId): { years: number; volume: number } {
  const rules = peopleTreatyRules(s).trade;
  const scale = temperamentOf(s, people).thresholds;
  const years = peopleThreshold(s, nation, people, 'trade years', rules.years);
  const volume = rules.volume.min + Math.floor(peoplePairRandom(s, nation, people, 'trade volume') * (rules.volume.max - rules.volume.min + 1));
  return { years: Math.round(years * scale), volume: Math.round(volume * scale) };
}

function yearsOfGood(s: GameState, nation: NationId, people: TribeId): number {
  const since = peopleRelationOf(s, nation, people)?.goodSince;
  if (since === undefined) return 0;
  const cal = calendarOf(s);
  return yearValue(s.turn, cal) - yearValue(since, cal);
}

/** Whether the years of good relations and the trade with a people both reach the hidden thresholds for a trade treaty. */
export function peopleTradeUnlocked(s: GameState, nation: NationId, people: TribeId): boolean {
  const rel = peopleRelationOf(s, nation, people);
  if (!rel) return false;
  const need = peopleTradeThresholds(s, nation, people);
  return yearsOfGood(s, nation, people) >= need.years && rel.volume >= need.volume;
}

/** Whether the waiting after a broken treaty still lasts: no new treaty before it ends. */
export function peopleWaiting(s: GameState, nation: NationId, people: TribeId): boolean {
  const until = peopleRelationOf(s, nation, people)?.waitUntil;
  return until !== undefined && s.turn < until;
}

/** Whether the people still treats the nation as hostile after a broken treaty: no gifts, trade visits or offers. */
export function peopleHostile(s: GameState, nation: NationId, people: TribeId): boolean {
  const until = peopleRelationOf(s, nation, people)?.hostileUntil;
  return until !== undefined && s.turn < until;
}

function settlementsOf(s: GameState, people: TribeId): Settlement[] {
  const out: Settlement[] = [];
  for (const id in s.settlements) if (s.settlements[id].tribe === people) out.push(s.settlements[id]);
  return out;
}

function peopleName(people: TribeId): string {
  return TRIBES[people].name;
}

const KIND_TEXT: Record<PeopleTreatyKind, string> = { 'people-trade': 'a trade treaty', 'land-use': 'a land use treaty', exchange: 'a cultural exchange', defence: 'a mutual defence pact' };

/** "a trade treaty", for messages. */
export function peopleTreatyText(kind: PeopleTreatyKind): string {
  return KIND_TEXT[kind];
}

/** A treaty offer from the people waiting for the nation's answer, if any (a turn-start notice). */
function pendingOffer(s: GameState, nation: NationId, people: TribeId): boolean {
  for (const d of s.nativeDemands ?? []) if (d.kind === 'treaty' && d.nation === nation && s.settlements[d.settlementId]?.tribe === people) return true;
  return false;
}

/**
 * Why `nation` cannot propose a treaty of `kind` to `people` now, or null: what the nation can
 * know before asking. The people's own reasons to say no come with its answer (`peopleRefusal`).
 * Like Favoured Nation's, the hidden thresholds are in here, shown only in words.
 */
export function peopleTreatyProblem(s: GameState, nation: NationId, people: TribeId, kind: PeopleTreatyKind = 'people-trade'): string | null {
  if (!peopleTreatiesOn(s)) return 'There are no treaties with native peoples in this scenario.';
  if (!peopleTreatyOn(s, kind)) return `There is no ${KIND_TEXT[kind].replace(/^an? /, '')} with native peoples in this scenario.`;
  if (kind !== 'people-trade' && kind !== 'land-use') return `${KIND_TEXT[kind][0].toUpperCase()}${KIND_TEXT[kind].slice(1)} is not made yet.`;
  if (!treatyNation(nation) || !s.players.some((p) => p.id === nation)) return 'Treaties with native peoples are made by European nations.';
  const name = peopleName(people);
  const tribe = s.tribes.find((t) => t.id === people);
  if (!tribe || !settlementsOf(s, people).length) return `The ${name} have no settlements left.`;
  if (!inContact(s, nation, people)) return `You have not met the ${name} yet: a scout's visit, a mission or trade comes first.`;
  if (tribe.stance[nation] === 'war') return `You are at war with the ${name}.`;
  if (hasSubmitted(s, people, nation)) return `The ${name} submitted to you; they make no treaties with you.`;
  if (peopleTreatyBetween(s, kind, nation, people)) return `You already have ${KIND_TEXT[kind]} with the ${name}.`;
  if (pendingOffer(s, nation, people)) return `The ${name} are waiting for your answer to their own offer.`;
  if (peopleWaiting(s, nation, people) || peopleHostile(s, nation, people)) return `The ${name} do not trust you again yet.`;
  if (kind === 'land-use') return landUseProblem(s, nation, people);
  if (!peopleTradeUnlocked(s, nation, people)) return `The ${name} do not know you well enough yet: it takes more years of good relations${peopleTreatyRules(s).trade.volume.max > 0 ? ' and more trade with them' : ''}.`;
  return null;
}

/** The people's own reasons to refuse a treaty with a nation now, or null (N8): an angry settlement, land taken lately. */
export function peopleRefusal(s: GameState, nation: NationId, people: TribeId): string | null {
  const name = peopleName(people);
  const angry = nativeRulesOf(s).tension.angry;
  const st = settlementsOf(s, people).find((o) => tensionOf(o, nation) >= angry);
  if (st) return `The ${name} refuse: the ${settlementName(s, st)} is angry with you.`;
  const took = peopleRelationOf(s, nation, people)?.tookLand;
  if (took !== undefined && s.turn < turnAfterYears(took, peopleTreatyRules(s).landYears, calendarOf(s))) return `The ${name} refuse: they have not forgotten the land you took from them.`;
  return null;
}

/** A nation proposes a treaty to a people, which answers at once (N8, N13). */
export function proposePeopleTreaty(s: GameState, nation: NationId, people: TribeId, kind: PeopleTreatyKind = 'people-trade'): string {
  const problem = peopleTreatyProblem(s, nation, people, kind);
  if (problem) fail(problem);
  track(nation, 'cmd:proposePeopleTreaty');
  const refusal = peopleRefusal(s, nation, people);
  const chance = peopleTreatyRules(s).accept * temperamentOf(s, people).accept;
  if (refusal || peoplePairRandom(s, nation, people, `answer ${kind} ${s.turn}`) >= chance) {
    track(nation, 'natives:people treaty refused');
    const text = refusal ?? `The ${peopleName(people)} thank you, but are not ready for ${KIND_TEXT[kind]} with ${nationOf(s, nation).name}.`;
    message(s, text, nation);
    return text;
  }
  return makePeopleTreaty(s, nation, people, kind);
}

/** Makes a treaty between a nation and a people, in force from now. */
export function makePeopleTreaty(s: GameState, nation: NationId, people: TribeId, kind: PeopleTreatyKind = 'people-trade'): string {
  if (kind === 'land-use') return makeLease(s, nation, people);
  if (!peopleTreatyBetween(s, kind, nation, people)) addTreaty(s, kind, [nationParty(nation), peopleParty(people)]);
  track(nation, 'natives:people treaty made');
  const name = peopleName(people);
  const text = kind === 'people-trade'
    ? `${nationOf(s, nation).name} and the ${name} have made a trade treaty: better prices both ways, more goods for sale, more visits to trade, and trade routes may call at their settlements.`
    : `${nationOf(s, nation).name} and the ${name} have made ${KIND_TEXT[kind]}.`;
  message(s, text, nation);
  noteHistory(s, 'tribe', [nation], `${nationOf(s, nation).name} and the ${name} make ${KIND_TEXT[kind]}.`);
  return text;
}

/**
 * A computer player's answer to a people's offer: the scenario's `acceptPeopleOffer` times its
 * level's share (N11), drawn from the pair's own stream.
 */
export function aiAcceptsPeopleOffer(s: GameState, nation: NationId, people: TribeId): boolean {
  const p = player(s, nation);
  const chance = cooperationOf(s).acceptPeopleOffer * LEVEL_COOPERATION[p.ai ?? 'naive'].peopleAccept;
  return chance > 0 && peoplePairRandom(s, nation, people, `accept offer ${s.turn}`) < chance;
}

/**
 * Whether a people offers a nation a trade treaty, on a brave's trade visit to one of its colonies
 * (braves.ts): free to make one (as `peopleTreatyProblem`), nothing against it (`peopleRefusal`),
 * and a seeded chance, `offer` times its temperament.
 */
export function peopleWouldOffer(s: GameState, st: Settlement, nation: NationId): boolean {
  if (!peopleTreatyOn(s, 'people-trade') || !treatyNation(nation)) return false;
  if (peopleTreatyProblem(s, nation, st.tribe, 'people-trade') || peopleRefusal(s, nation, st.tribe)) return false;
  const chance = peopleTreatyRules(s).offer * temperamentOf(s, st.tribe).offer;
  return peoplePairRandom(s, nation, st.tribe, `offer ${s.turn} ${st.id}`) < chance;
}

/** The answer to a people's offer (a person's from the briefing, or a computer player's at once). */
export function answerPeopleOffer(s: GameState, nation: NationId, people: TribeId, kind: PeopleTreatyKind, accept: boolean): string {
  const name = peopleName(people);
  if (!accept) {
    track(nation, 'natives:people offer declined');
    const text = `You decline the ${name} offer of ${KIND_TEXT[kind]}.`;
    message(s, text, nation);
    return text;
  }
  // Check again: things may have changed while the brave waited.
  const problem = peopleTreatyProblem(s, nation, people, kind);
  if (problem) {
    const text = `The ${name} offer no longer stands. ${problem}`;
    message(s, text, nation);
    return text;
  }
  track(nation, 'natives:people offer accepted');
  return makePeopleTreaty(s, nation, people, kind);
}

// ---------------------------------------------------------------------------
// Land use: a lease (N5)

/** The land use treaty in force between a nation and a people, if any. */
export function landUseTreaty(s: GameState, nation: NationId, people: TribeId): Treaty | undefined {
  return s.treaties ? peopleTreatyBetween(s, 'land-use', nation, people) : undefined;
}

/** Whether a nation leases land from a people. */
export function hasLandUse(s: GameState, nation: NationId, people: TribeId): boolean {
  return !!landUseTreaty(s, nation, people);
}

/** Whether any land use treaty is in force in the game (a quick check for hot paths). */
export function anyLandUse(s: GameState): boolean {
  const list = s.treaties;
  if (!list) return false;
  for (const t of list) if (!t.end && t.kind === 'land-use') return true;
  return false;
}

/** The terms of a land use treaty: the rent per tile and when the next is due. */
export function leaseTerms(t: Treaty): LandUseTerms | undefined {
  return t.terms?.kind === 'land-use' ? t.terms : undefined;
}

/** The hidden years of good relations a nation needs with a people before it may lease its land (drawn, never stored). */
export function landUseThreshold(s: GameState, nation: NationId, people: TribeId): number {
  const years = peopleThreshold(s, nation, people, 'land years', peopleTreatyRules(s).landUse.years);
  return Math.round(years * temperamentOf(s, people).thresholds);
}

/** Whether a nation's years of good relations with a people reach the hidden threshold for land use. */
export function landUseUnlocked(s: GameState, nation: NationId, people: TribeId): boolean {
  return !!peopleRelationOf(s, nation, people) && yearsOfGood(s, nation, people) >= landUseThreshold(s, nation, people);
}

/** A tile of a people's land, with the settlement whose land it is. */
export interface LandTile {
  x: number;
  y: number;
  st: Settlement;
}

/**
 * The tiles of a people's land a nation's colonies could lease: next to one of its colonies (its
 * work area), the people's (`nativeLandOwner`: not bought or taken), and not leased to another
 * nation. In the order of the colonies and their work areas, each tile once.
 */
export function leasableTiles(s: GameState, nation: NationId, people: TribeId): LandTile[] {
  const out: LandTile[] = [];
  const seen = new Set<number>();
  const w = s.map.width;
  for (const c of colonyList(s)) {
    if (c.owner !== nation) continue;
    for (const p of workArea(s, c.x, c.y)) {
      const i = p.y * w + p.x;
      if (seen.has(i)) continue;
      seen.add(i);
      const st = nativeLandOwner(s, p.x, p.y);
      if (!st || st.tribe !== people) continue;
      const use = tileAt(s, p.x, p.y)!.use;
      if (use && use !== nation) continue;
      out.push({ x: p.x, y: p.y, st });
    }
  }
  return out;
}

/** The tiles a nation leases from a people now (`Tile.use`, beside its colonies), with the settlement whose land each is. */
export function leasedTiles(s: GameState, nation: NationId, people: TribeId): LandTile[] {
  if (!hasLandUse(s, nation, people)) return [];
  return leasableTiles(s, nation, people).filter((p) => tileAt(s, p.x, p.y)!.use === nation);
}

/**
 * The yearly rent per tile a people would ask of a nation for these tiles now: the scenario's
 * `landUse.rent` share of their average price (`landPrice`: the settlement's kind, a capital,
 * tension, Peter Minuit), at least 1 gold.
 */
export function leaseRent(s: GameState, nation: NationId, tiles: readonly { x: number; y: number }[]): number {
  if (!tiles.length) return 0;
  let sum = 0;
  for (const p of tiles) sum += landPrice(s, nation, p.x, p.y);
  return Math.max(1, Math.round((peopleTreatyRules(s).landUse.rent * sum) / tiles.length));
}

/** What stands in the way of a lease, beyond the checks every treaty with a people shares (`peopleTreatyProblem`). */
function landUseProblem(s: GameState, nation: NationId, people: TribeId): string | null {
  const name = peopleName(people);
  if (!hasPeopleTrade(s, nation, people)) return `Land use needs a trade treaty with the ${name} first.`;
  if (!landUseUnlocked(s, nation, people)) return `The ${name} do not know you well enough to lend you land yet: it takes more years of good relations.`;
  const tiles = leasableTiles(s, nation, people);
  if (!tiles.length) return `None of the land of the ${name} lies beside your colonies.`;
  const first = leaseRent(s, nation, tiles) * tiles.length;
  if (player(s, nation).gold < first) return `The first year's rent for ${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'} is ${first} gold.`;
  return null;
}

/** Pays a year's rent to the settlements whose land the tiles are, each tile's to its own. Returns the gold paid. */
function payRent(s: GameState, nation: NationId, tiles: readonly LandTile[], rent: number): number {
  const total = rent * tiles.length;
  player(s, nation).gold -= total;
  for (const p of tiles) p.st.gold += rent;
  if (total > 0) track(nation, 'natives:rent paid', total);
  return total;
}

/** Makes a lease: the rent per tile is set now and the first year's paid, and the people's land beside the nation's colonies is leased. */
function makeLease(s: GameState, nation: NationId, people: TribeId): string {
  const tiles = leasableTiles(s, nation, people);
  const rent = leaseRent(s, nation, tiles);
  const paid = payRent(s, nation, tiles, rent);
  addTreaty(s, 'land-use', [nationParty(nation), peopleParty(people)], { kind: 'land-use', rent, due: turnAfterYears(s.turn, 1, calendarOf(s)) });
  for (const p of tiles) tileAt(s, p.x, p.y)!.use = nation;
  track(nation, 'natives:people treaty made');
  track(nation, 'natives:lease made');
  const name = peopleName(people);
  const n = `${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'}`;
  const text = `${nationOf(s, nation).name} and the ${name} agree on land use: your colonies may work ${n} of their land beside them for ${rent} gold a tile a year (${paid} gold paid for the first year). The land stays theirs.`;
  message(s, text, nation);
  noteHistory(s, 'tribe', [nation], `${nationOf(s, nation).name} and the ${name} make ${KIND_TEXT['land-use']}.`);
  return text;
}

/**
 * Moves the workers off tiles their colony may no longer work (a lease ended or shrank): each takes
 * the best job left in its colony, or waits at the colony's gate if there is none.
 */
function evictWorkers(s: GameState, tiles: readonly { x: number; y: number }[]): void {
  for (const p of tiles) {
    const u = tileWorkedBy(s, p.x, p.y);
    if (!u || u.loc.kind !== 'colony') continue;
    const owner = nativeLandClosedTo(s, u.owner, p.x, p.y);
    if (!owner) continue;
    const colony = s.colonies[u.loc.colonyId];
    // The tile is closed to the colony now, so the best job is elsewhere.
    const job = bestJob(s, colony, u);
    if (job) setUnitLoc(s, u, { kind: 'colony', colonyId: colony.id, job });
    else {
      setUnitLoc(s, u, { kind: 'map', x: colony.x, y: colony.y });
      u.moves = 0;
    }
    message(s, `${unitName(u)} in ${colony.name} may no longer work the land of the ${peopleName(owner.tribe)} and finds other work.`, u.owner, colony);
  }
}

/**
 * The tiles a nation's lease with a people marks: leased to it, and the people's land or nobody's
 * (bought since, or its settlement gone). Scans the map: only when a lease ends or on rent day.
 */
function tilesUsedBy(s: GameState, nation: NationId, people: TribeId): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const { width, tiles } = s.map;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].use !== nation) continue;
    const x = i % width;
    const y = (i - x) / width;
    const st = nativeLandOwner(s, x, y);
    if (!st || st.tribe === people) out.push({ x, y });
  }
  return out;
}

/** A lease ended: its tiles are the people's alone again, and whoever worked them finds other work. */
function releaseLease(s: GameState, nation: NationId, people: TribeId): void {
  const tiles = tilesUsedBy(s, nation, people);
  for (const p of tiles) delete tileAt(s, p.x, p.y)!.use;
  evictWorkers(s, tiles);
}

/**
 * Rent day, once a year from the making: the lease covers the people's land beside the nation's
 * colonies now (tiles beside a new colony join, tiles no longer beside one leave), and the rent is
 * paid for each tile at the rate set when the lease was made. A nation that cannot pay loses the
 * lease: the people ends it (it lapses), with no breach of faith.
 */
function rentDay(s: GameState, t: Treaty, terms: LandUseTerms, nation: NationId, people: TribeId): void {
  const name = peopleName(people);
  const tiles = leasableTiles(s, nation, people);
  const due = terms.rent * tiles.length;
  if (player(s, nation).gold < due) {
    endTreaty(s, t, 'lapsed', peopleParty(people));
    track(nation, 'natives:people treaty ended');
    track(nation, 'natives:lease lapsed');
    releaseLease(s, nation, people);
    message(s, `${nationOf(s, nation).name} cannot pay the ${due} gold rent for the land of the ${name}: the lease has lapsed, and the land is theirs alone again.`, nation);
    noteHistory(s, 'cancel', [nation], `The ${name} take back the land they lent ${nationOf(s, nation).name}, its rent unpaid.`, { secret: true });
    return;
  }
  const keep = new Set(tiles.map((p) => p.y * s.map.width + p.x));
  const gone = tilesUsedBy(s, nation, people).filter((p) => !keep.has(p.y * s.map.width + p.x));
  for (const p of gone) delete tileAt(s, p.x, p.y)!.use;
  evictWorkers(s, gone);
  for (const p of tiles) tileAt(s, p.x, p.y)!.use = nation;
  payRent(s, nation, tiles, terms.rent);
  terms.due = turnAfterYears(terms.due, 1, calendarOf(s));
}

/** The benefits of a lease, in one line, from the game's numbers. */
export function landUseBenefits(s: GameState): string {
  const r = peopleTreatyRules(s).landUse;
  const gather = r.gather === 0.5 ? 'half as much' : `${Math.round(r.gather * 100)}% as much`;
  const press = r.pressure === 0.5 ? 'half as hard' : `${Math.round(r.pressure * 100)}% as hard`;
  return `your colonies may work their land beside them for a yearly rent in gold, set when the lease is made; the land stays theirs, they still gather ${gather} from it, and your colonies beside it press ${press} on them`;
}

/**
 * The peoples each colony leases land from beside it (for processNatives: such a colony presses
 * `landUse.pressure` times as hard on that people's settlements), by index in `colonies`. Empty
 * while no lease is in force, so the pressure is as before.
 */
export function leasedFromBeside(s: GameState, colonies: readonly Colony[]): Map<number, Set<TribeId>> {
  const out = new Map<number, Set<TribeId>>();
  if (!anyLandUse(s)) return out;
  for (let i = 0; i < colonies.length; i++) {
    const c = colonies[i];
    for (const p of workArea(s, c.x, c.y)) {
      if (tileAt(s, p.x, p.y)!.use !== c.owner) continue;
      const st = nativeLandOwner(s, p.x, p.y);
      if (!st || !hasLandUse(s, c.owner, st.tribe)) continue;
      let set = out.get(i);
      if (!set) out.set(i, (set = new Set()));
      set.add(st.tribe);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ending: breaking faith (N8), and the people's own ending

/** A whole number of years from base − spread to base + spread, from a seeded number in [0, 1). */
function around(r: number, v: YearsAround): number {
  return v.base - v.spread + Math.floor(r * (2 * v.spread + 1));
}

const BREACH_TEXT = { land: 'taking their land', attack: 'attacking them', incite: 'paying them to make war for it' } as const;

/**
 * A nation breaks faith with a people it holds treaties with (taking its land, attacking it,
 * inciting it, N8): every treaty with the people ends, each of its settlements grows angrier, and
 * the people makes no new treaty for the waiting years and treats the nation as hostile for longer
 * (drawn from the pair's own stream). Nothing happens without a treaty in force.
 */
export function breakFaith(s: GameState, nation: NationId, people: TribeId, why: keyof typeof BREACH_TEXT): void {
  const treaties = treatiesWithPeople(s, nation, people);
  if (!treaties.length) return;
  const rules = peopleTreatyRules(s);
  for (const t of treaties) {
    endTreaty(s, t, 'broken', nation);
    track(nation, 'natives:people treaty ended');
    if (t.kind === 'land-use') releaseLease(s, nation, people);
  }
  track(nation, 'natives:faith broken');
  for (const st of settlementsOf(s, people)) addTension(st, nation, rules.breachTension);
  const rel = peopleRelation(s, nation, people);
  rel.breaks = (rel.breaks ?? 0) + 1;
  const cal = calendarOf(s);
  rel.waitUntil = Math.max(rel.waitUntil ?? 0, turnAfterYears(s.turn, around(peoplePairRandom(s, nation, people, `break wait ${rel.breaks}`), rules.waitingYears), cal));
  rel.hostileUntil = Math.max(rel.hostileUntil ?? 0, turnAfterYears(s.turn, around(peoplePairRandom(s, nation, people, `break hostility ${rel.breaks}`), rules.hostilityYears), cal));
  delete rel.goodSince;
  if (s.nativeDemands) s.nativeDemands = s.nativeDemands.filter((d) => !(d.kind === 'treaty' && d.nation === nation && s.settlements[d.settlementId]?.tribe === people));
  pruneSettlementStops(s, nation, people);
  const name = peopleName(people);
  message(s, `${nationOf(s, nation).name} has broken faith with the ${name} by ${BREACH_TEXT[why]}. Every treaty with them is over, and they will not soon trust ${nationOf(s, nation).name} again.`, nation);
  noteHistory(s, 'cancel', [nation], `${nationOf(s, nation).name} breaks faith with the ${name} by ${BREACH_TEXT[why]}; its treaties with them end.`);
}

/** The people ends a treaty (it turned angry, went to war, or has no settlements left). */
function peopleEnds(s: GameState, t: Treaty, nation: NationId, people: TribeId, why: TreatyEnd['why']): void {
  endTreaty(s, t, why, why === 'lapsed' ? undefined : peopleParty(people));
  track(nation, 'natives:people treaty ended');
  if (t.kind === 'land-use') releaseLease(s, nation, people);
  pruneSettlementStops(s, nation, people);
  const name = peopleName(people);
  const reason = why === 'war' ? 'with the war' : why === 'lapsed' ? 'with their last settlement' : 'in anger';
  message(s, `The ${name} have ended their ${treatyNameOf(t)} with ${nationOf(s, nation).name} ${reason}.`, nation);
  noteHistory(s, 'cancel', [nation], `The ${name} end their ${treatyNameOf(t)} with ${nationOf(s, nation).name} ${reason}.`, { secret: true });
}

function treatyNameOf(t: Treaty): string {
  return KIND_TEXT[t.kind as PeopleTreatyKind].replace(/^an? /, '');
}

/**
 * Once a round, after the braves (natives.ts processNatives): a people ends its treaties with a
 * nation it is at war with, or when one of its settlements has turned angry with it; a treaty
 * with a people that has no settlements left lapses. Only treaties in force are looked at.
 */
export function processPeopleTreaties(s: GameState): void {
  const list = s.treaties;
  if (!list) return;
  const angry = nativeRulesOf(s).tension.angry;
  for (const t of list) {
    if (t.end) continue;
    const people = treatyPeoples(t)[0];
    if (!people) continue;
    const nation = treatyNations(t)[0];
    const tribe = s.tribes.find((o) => o.id === people);
    const settlements = settlementsOf(s, people);
    if (!tribe || !settlements.length) peopleEnds(s, t, nation, people, 'lapsed');
    else if (tribe.stance[nation] === 'war') peopleEnds(s, t, nation, people, 'war');
    else if (settlements.some((st) => tensionOf(st, nation) >= angry)) peopleEnds(s, t, nation, people, 'cancelled');
    else if (t.kind === 'land-use' && !hasPeopleTrade(s, nation, people)) peopleEnds(s, t, nation, people, 'cancelled');
    else if (t.kind === 'land-use' && t.terms?.kind === 'land-use' && s.turn >= t.terms.due) rentDay(s, t, t.terms, nation, people);
  }
}

/** Notes land a nation took from a people (N8: no new treaty for `landYears`); only while treaties with peoples are in play. */
export function noteLandTaken(s: GameState, nation: NationId, people: TribeId): void {
  if (!peopleTreatiesOn(s) || !treatyNation(nation)) return;
  peopleRelation(s, nation, people).tookLand = s.turn;
}

// ---------------------------------------------------------------------------
// Trade route stops at a partner's settlement (N4)

/** Whether a nation's trade routes may stop at a settlement: it belongs to a people at peace with it, with a trade treaty. */
export function settlementStopOpen(s: GameState, nation: NationId, settlementId: string): boolean {
  const st = s.settlements[settlementId];
  if (!st || !hasPeopleTrade(s, nation, st.tribe)) return false;
  return s.tribes.find((t) => t.id === st.tribe)?.stance[nation] !== 'war';
}

/** Settlements a nation's routes may stop at: those of its trade partners among the peoples. */
export function partnerSettlements(s: GameState, nation: NationId): Settlement[] {
  if (!s.treaties) return [];
  return Object.values(s.settlements).filter((st) => settlementStopOpen(s, nation, st.id));
}

/**
 * Drops every stop at a people's settlements from a nation's trade routes (its treaty ended). A
 * route left with fewer than two stops lets its units go, and they wait for orders.
 */
export function pruneSettlementStops(s: GameState, nation: NationId, people: TribeId): void {
  for (const route of Object.values(s.routes ?? {})) {
    if (route.owner !== nation) continue;
    const keep = route.stops.filter((st) => s.settlements[st.at]?.tribe !== people);
    if (keep.length === route.stops.length) continue;
    route.stops = keep;
    for (const u of unitList(s)) {
      if (u.route?.id !== route.id) continue;
      if (keep.length < 2) {
        delete u.route;
        delete u.dest;
        message(s, `${unitName(u)} leaves the ${route.name} route, which no longer has two stops, and waits for orders.`, u.owner, unitPosition(s, u));
      } else {
        u.route.stop = u.route.stop % keep.length;
        delete u.dest;
      }
    }
    message(s, `The ${route.name} route no longer calls at the settlements of the ${peopleName(people)}.`, nation);
  }
}

// ---------------------------------------------------------------------------
// Words for the interface (N13)

/**
 * How a people stands towards a nation, in words, never the hidden numbers: "No contact yet",
 * "At war", "Distrusts you" (hostile after a broken treaty), "Remembers the broken treaty"
 * (waiting), "Partners in trade", or by how near the thresholds are: "Barely knows you",
 * "Getting to know you", "Thinks well of you", "Trusts you". Not "wary", a mood word.
 */
export function peopleStanding(s: GameState, nation: NationId, people: TribeId): string {
  const rel = peopleRelationOf(s, nation, people);
  if (!rel) return 'No contact yet';
  if (s.tribes.find((t) => t.id === people)?.stance[nation] === 'war') return 'At war';
  if (peopleHostile(s, nation, people)) return 'Distrusts you';
  if (peopleWaiting(s, nation, people)) return 'Remembers the broken treaty';
  if (hasPeopleTrade(s, nation, people)) return 'Partners in trade';
  const need = peopleTradeThresholds(s, nation, people);
  const share = Math.min(need.years ? yearsOfGood(s, nation, people) / need.years : 1, need.volume ? rel.volume / need.volume : 1);
  if (!goodRelations(s, nation, people) || share < 0.3) return 'Barely knows you';
  if (share < 0.7) return 'Getting to know you';
  if (share < 1) return 'Thinks well of you';
  return 'Trusts you';
}

/** The benefits of a trade treaty with a people, in one line, from the game's numbers. */
export function peopleTradeBenefits(s: GameState): string {
  const r = peopleTreatyRules(s).trade;
  const pct = (x: number) => `${Math.round(Math.abs(x - 1) * 100)}%`;
  return `they pay ${pct(r.sell)} more for your goods and ask ${pct(r.buy)} less for theirs, gather ${pct(r.gather)} more for sale, come to trade ${r.braveTrade === 2 ? 'twice' : `${r.braveTrade} times`} as often, calm faster, and your trade routes may call at their settlements`;
}
