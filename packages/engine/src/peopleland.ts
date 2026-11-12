/**
 * A playing people's land, bought or taken by Europeans (docs/design/native-nations.md T5 and
 * section 18; Beta 3, land). T5 decided that a people's land is its towns' work areas and the land
 * it claims (`Tile.claim`), and that a lease or a sale goes through from the seller's side. Beta 2
 * built the lease (a land use treaty, peoplediplomacy.ts) and the buying and taking of land of the
 * peoples nobody plays (natives.ts `buyLand`, `takeLand`); this is the sale and the taking for a
 * playing people, with the scenario's `mechanics.landSales` (off in the Americas and the Caribbean,
 * where no people plays).
 *
 * - **Which land:** a tile the people claims within `reach` tiles of a colony of the nation (its
 *   work area and the land just beyond, where its next colony would stand),
 *   not a town's own tile and not leased to another nation, or the tile a colonist of the
 *   nation stands on to found a colony. Dealing over land is meeting: the standing record is written.
 * - **An offer:** the nation offers gold for the tile (the asking price, `peopleLandPrice`, or more).
 *   A person playing the people answers later (`PeopleRelation.landOffer`, `answerLandOffer`; the
 *   offer lapses after `offerYears`); a computer people answers at once by its profile
 *   (`sellsLand`, `keepsHomeland`). Sold, the tile is the nation's (`Tile.claim`), and the gold the
 *   people's; a lease over it ends there. It no longer counts as the people's homeland (continuity).
 * - **Taking:** the tile is the nation's at once. The nation breaks faith with the people (every
 *   treaty between them ends, Beta 2's waiting and hostility, step 4's `breakPairFaith`) and the
 *   people refuses new treaties for `landYears` (Beta 2's `tookLand`). A computer people goes to war
 *   at its profile's `warOnTaking`; a person decides.
 * - **Computer nations** ask by their level's `land` (ai/profiles.ts, as for the peoples nobody
 *   plays): Competent and Creative offer the asking price when their treasury allows, Combative
 *   takes; each waits `waitYears` after asking a people (or taking from it) before it asks again.
 *   Naive does neither, as for the peoples nobody plays.
 *
 * A people's worker on a tile it no longer holds finds other work in its town. Every decision is
 * drawn from the pair's own seeded stream, never `GameState.rng`.
 */
import { bestJob } from './colony.js';
import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { breakPairFaith, pairAtWar, pairTreaty, playingPeople, sideName, standingOf, standingPair, standingWith, stillThere } from './peoplediplomacy.js';
import { homelandKept } from './peoplevictory.js';
import { kindOfId, systemsOfId } from './playerkind.js';
import { peopleTreatyRules } from './peopletreaties.js';
import { gridOf } from './grid.js';
import { colonyAt, message, player, tileAt, tileWorkedBy, unitName, unitsAt } from './queries.js';
import { UNIT_TYPES } from './rules/units.js';
import { peoplePairRandom } from './relations.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import { calendarOf, mechanicsOf, scenarioOf, settlementKindIn, turnAfterYears } from './scenarios/index.js';
import type { LandSaleRules } from './scenarios/types.js';
import { track } from './telemetry.js';
import type { Colony, GameState, PeopleRelation } from './types.js';
import { colonyList, setUnitLoc } from './unitindex.js';
import { peopleProfileOf, type AiProfile } from './ai/profiles.js';
import { startWar } from './diplomacy.js';

/** The engine's rules for offers and land taken, where the scenario has `mechanics.landSales`. */
export const LAND_SALES: LandSaleRules = { reach: 3, price: 1, accept: 0.6, waitYears: 5, offerYears: 2 };

/** The scenario's rules for a playing people's land, or undefined where Europeans neither buy nor take it. */
export function landSalesOf(s: GameState): LandSaleRules | undefined {
  const own = mechanicsOf(s).landSales;
  return own ? { ...LAND_SALES, ...own } : undefined;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The nation's first colony within `reach` tiles of the tile, if any. */
function nearColony(s: GameState, nation: PlayerId, x: number, y: number, reach: number): Colony | undefined {
  const grid = gridOf(s);
  return colonyList(s).find((c) => c.owner === nation && grid.distance(c.x, c.y, x, y) <= reach);
}

/** Whether a colonist of the nation stands on the tile (on the map, not aboard a ship), to found a colony there. */
function colonistOn(s: GameState, nation: PlayerId, x: number, y: number): boolean {
  for (const u of unitsAt(s, x, y)) if (u.owner === nation && UNIT_TYPES[u.type].kind === 'colonist') return true;
  return false;
}

/** The playing people whose claimed land this tile is, if any. */
export function playingPeopleLand(s: GameState, x: number, y: number): PlayerId | undefined {
  const claim = tileAt(s, x, y)?.claim;
  return claim && kindOfId(claim) === 'people' && playingPeople(s, claim) ? claim : undefined;
}

/**
 * Why `nation` cannot offer for (or take) the tile, or null. Shared by the offer and the taking;
 * `taking` allows a nation at war with the people.
 */
export function landDealProblem(s: GameState, nation: PlayerId, x: number, y: number, taking = false): string | null {
  if (!landSalesOf(s)) return 'Europeans do not buy or take the land of a playing people in this scenario.';
  if (!systemsOfId(nation).peoples) return 'Only a European nation buys or takes a people\'s land.';
  const people = playingPeopleLand(s, x, y);
  if (!people) return 'No playing people claims this land.';
  const tile = tileAt(s, x, y)!;
  if (tile.use && tile.use !== nation) return `This land is leased to ${sideName(s, tile.use)}.`;
  if (colonyAt(s, x, y)) return 'A town stands there.';
  const name = sideName(s, people);
  if (!stillThere(s, nation)) return 'Your nation is not on the map.';
  const reach = landSalesOf(s)!.reach;
  if (!nearColony(s, nation, x, y, reach) && !colonistOn(s, nation, x, y)) return `Only land of ${name} within ${reach} ${reach === 1 ? 'tile' : 'tiles'} of one of your colonies, or where your colonist stands to found one, can be bought or taken.`;
  if (!taking && pairAtWar(s, nation, people)) return `You are at war with ${name}.`;
  return null;
}

/** The gold a people asks for a tile of its land: its land price, dearer as its homeland shrinks. */
export function peopleLandPrice(s: GameState, people: PlayerId): number {
  const rules = landSalesOf(s) ?? LAND_SALES;
  const base = settlementKindIn(scenarioOf(s), people as TribeId).landPrice.base;
  const home = homelandKept(s, people);
  const kept = home.start ? home.kept / home.start : 1;
  return Math.max(1, Math.round(base * rules.price * (2 - kept)));
}

/** A people's worker on a tile it no longer holds goes to other work in its town, or stands in the town. */
function displaceWorker(s: GameState, x: number, y: number, people: PlayerId): void {
  const u = tileWorkedBy(s, x, y);
  if (!u || u.owner !== people || u.loc.kind !== 'colony') return;
  const town = s.colonies[u.loc.colonyId];
  const job = bestJob(s, town, u);
  if (job) setUnitLoc(s, u, { kind: 'colony', colonyId: town.id, job });
  else {
    setUnitLoc(s, u, { kind: 'map', x: town.x, y: town.y });
    u.moves = 0;
  }
  message(s, `${unitName(u)} of ${town.name} no longer works the land that was yours and finds other work.`, people, town);
}

/** The tile changes hands: the nation's from now. */
function transfer(s: GameState, nation: PlayerId, people: PlayerId, x: number, y: number): void {
  const tile = tileAt(s, x, y)!;
  tile.claim = nation;
  delete tile.use;
  displaceWorker(s, x, y, people);
}

/** Whether a computer people sells this tile for this gold (its profile; drawn from the pair's stream). */
function computerSells(s: GameState, people: PlayerId, nation: PlayerId, x: number, y: number, gold: number): boolean {
  const prof = peopleProfileOf(s.players, people);
  const rules = landSalesOf(s)!;
  if (!prof || prof.sellsLand <= 0) return false;
  // Never the land its towns work, never below its profile's share of its homeland.
  if (tileWorkedBy(s, x, y)?.owner === people) return false;
  const home = homelandKept(s, people);
  const onHome = s.homelands?.[people as TribeId]?.tiles.includes(y * s.map.width + x);
  if (onHome && home.start && (home.kept - 1) / home.start < prof.keepsHomeland) return false;
  // Not to a nation that took its land lately (Beta 2's `landYears`).
  const took = standingOf(s, nation, people)?.tookLand;
  if (took !== undefined && s.turn < turnAfterYears(took, peopleTreatyRules(s).landYears, calendarOf(s))) return false;
  const price = peopleLandPrice(s, people);
  const good = pairTreaty(s, 'people-trade', nation, people) ? 1 : 0.5;
  const chance = rules.accept * prof.sellsLand * good * Math.min(2, gold / price);
  const [n, p] = standingPair(nation, people);
  return peoplePairRandom(s, n, p, `land answer ${x} ${y} ${s.turn}`) < chance;
}

/** The sale: gold to the people, the tile to the nation. */
function sell(s: GameState, nation: PlayerId, people: PlayerId, x: number, y: number, gold: number): string {
  player(s, nation).gold -= gold;
  player(s, people).gold += gold;
  transfer(s, nation, people, x, y);
  const rel = standingWith(s, nation, people);
  rel.landSold = (rel.landSold ?? 0) + 1;
  track(nation, 'natives:people land bought');
  const text = `${capital(sideName(s, people))} sell ${sideName(s, nation)} a tile of their land for ${gold} gold.`;
  message(s, text, nation, { x, y });
  message(s, text, people, { x, y });
  noteHistory(s, 'tribe', [nation, people], text, { at: { x, y } });
  return text;
}

/**
 * `nation` offers `gold` (the asking price when missing) for a tile of a playing people's land.
 * A person playing the people answers later; a computer people answers now.
 */
export function offerForLand(s: GameState, nation: PlayerId, x: number, y: number, gold?: number): string {
  const problem = landDealProblem(s, nation, x, y);
  if (problem) fail(problem);
  const people = playingPeopleLand(s, x, y)!;
  const price = peopleLandPrice(s, people);
  const offer = Math.round(gold ?? price);
  if (!(offer > 0)) fail('Offer some gold.');
  if (player(s, nation).gold < offer) fail(`You have ${player(s, nation).gold} gold, less than the ${offer} you would offer.`);
  const rel = standingWith(s, nation, people);
  if (rel.landOffer) fail(`${capital(sideName(s, people))} have not answered your last offer for their land yet.`);
  track(nation, 'cmd:offerForLand');
  if (!player(s, nation).human) rel.landAsked = s.turn;
  if (player(s, people).human) {
    rel.landOffer = { x, y, gold: offer, turn: s.turn };
    message(s, `${capital(sideName(s, nation))} offer ${offer} gold for a tile of your land beside their colony.`, people, { x, y });
    return `Your offer of ${offer} gold has been sent to ${sideName(s, people)}.`;
  }
  if (computerSells(s, people, nation, x, y, offer)) return sell(s, nation, people, x, y, offer);
  track(nation, 'natives:people land refused');
  const text = `${capital(sideName(s, people))} will not sell this land.`;
  message(s, text, nation, { x, y });
  return text;
}

/** The pending offer `nation` made `people`, if any. */
export function landOfferFrom(s: GameState, people: PlayerId, nation: PlayerId): PeopleRelation['landOffer'] {
  return standingOf(s, nation, people)?.landOffer;
}

/** Every offer waiting for this people's answer, with the nation that made it. */
export function landOffersFor(s: GameState, people: PlayerId): { nation: PlayerId; x: number; y: number; gold: number; turn: number }[] {
  const out: { nation: PlayerId; x: number; y: number; gold: number; turn: number }[] = [];
  for (const rel of Object.values(s.peopleRelations ?? {})) if (rel.people === people && rel.landOffer) out.push({ nation: rel.nation, ...rel.landOffer });
  return out;
}

/** The colony beside a tile that an offer is for (for the words). */
export function colonyBeside(s: GameState, nation: PlayerId, x: number, y: number): Colony | undefined {
  return nearColony(s, nation, x, y, landSalesOf(s)?.reach ?? 1);
}

/** A person's people answers `nation`'s offer for its land. */
export function answerLandOffer(s: GameState, people: PlayerId, nation: PlayerId, accept: boolean): string {
  const rel = standingOf(s, nation, people);
  const offer = rel?.landOffer;
  if (!rel || !offer) fail(`${capital(sideName(s, nation))} have made no offer for your land.`);
  delete rel.landOffer;
  track(people, 'cmd:answerLandOffer');
  if (!accept) {
    track(nation, 'natives:people land refused');
    message(s, `${capital(sideName(s, people))} will not sell their land.`, nation, offer);
    return `You keep your land.`;
  }
  const problem = landDealProblem(s, nation, offer.x, offer.y) ?? (playingPeopleLand(s, offer.x, offer.y) !== people ? 'The land is no longer yours.' : null) ?? (player(s, nation).gold < offer.gold ? `${capital(sideName(s, nation))} no longer have the gold.` : null);
  if (problem) {
    const text = `The offer no longer stands. ${problem}`;
    message(s, text, people);
    return text;
  }
  return sell(s, nation, people, offer.x, offer.y, offer.gold);
}

/**
 * `nation` takes a tile of a playing people's land: it is the nation's now, the nation breaks faith
 * with the people, and a computer people may go to war over it (its profile's `warOnTaking`).
 */
export function takePeopleLand(s: GameState, nation: PlayerId, x: number, y: number): string {
  const problem = landDealProblem(s, nation, x, y, true);
  if (problem) fail(problem);
  const people = playingPeopleLand(s, x, y)!;
  track(nation, 'cmd:takePeopleLand');
  track(nation, 'natives:people land taken');
  transfer(s, nation, people, x, y);
  breakPairFaith(s, nation, people, 'land');
  const rel = standingWith(s, nation, people);
  rel.tookLand = s.turn;
  rel.landTaken = (rel.landTaken ?? 0) + 1;
  delete rel.goodSince;
  delete rel.landOffer;
  if (!player(s, nation).human) rel.landAsked = s.turn;
  const text = `${capital(sideName(s, nation))} take a tile of the land of ${sideName(s, people)} beside their colony.`;
  message(s, text, people, { x, y });
  noteHistory(s, 'tribe', [nation, people], text, { at: { x, y } });
  const prof = peopleProfileOf(s.players, people);
  let war = '';
  if (prof && !pairAtWar(s, nation, people) && systemsOfId(people).war) {
    const [n, p] = standingPair(nation, people);
    if (peoplePairRandom(s, n, p, `land war ${s.turn}`) < prof.warOnTaking) {
      startWar(s, people, nation);
      war = ` ${capital(sideName(s, people))} go to war over it.`;
    }
  }
  return `You take the land. ${capital(sideName(s, people))} will not forget it.${war}`;
}

/** Once a round (peoplediplomacy.ts): offers a person left unanswered for `offerYears` lapse. */
export function processLandOffers(s: GameState): void {
  const rules = landSalesOf(s);
  if (!rules || !s.peopleRelations) return;
  for (const rel of Object.values(s.peopleRelations)) {
    const offer = rel.landOffer;
    if (!offer) continue;
    if (s.turn >= turnAfterYears(offer.turn, rules.offerYears, calendarOf(s)) || !stillThere(s, rel.nation) || !playingPeople(s, rel.people)) {
      delete rel.landOffer;
      message(s, `Your offer for the land of ${sideName(s, rel.people)} has lapsed unanswered.`, rel.nation);
    }
  }
}


// ---------------------------------------------------------------------------
// Computer nations (ai/advanced.ts), by their level's `land` (ai/profiles.ts)

/**
 * Whether a computer nation may try for this tile of a playing people's land now: no offer
 * of its own waiting, `waitYears` since it last asked that people (or took from it), not arctic or
 * mountains, and, to buy, not a tile the people's towns work (those only by force) and gold to
 * spare for the asking price. Returns the people, or undefined.
 */
export function computerMayAsk(s: GameState, nation: PlayerId, prof: AiProfile, x: number, y: number, spare: number): PlayerId | undefined {
  const rules = landSalesOf(s);
  if (!rules || prof.land === 'avoid') return undefined;
  const people = playingPeopleLand(s, x, y);
  if (!people) return undefined;
  const tile = tileAt(s, x, y)!;
  const def = tile.f ? 'forest' : tile.t;
  if (def === 'arctic' || def === 'mountains' || tile.use === nation) return undefined;
  const rel = standingOf(s, nation, people);
  if (rel?.landOffer) return undefined;
  if (rel?.landAsked !== undefined && s.turn < turnAfterYears(rel.landAsked, rules.waitYears, calendarOf(s))) return undefined;
  if (prof.land === 'take') return people;
  if (tileWorkedBy(s, x, y)?.owner === people || pairAtWar(s, nation, people)) return undefined;
  return spare >= peopleLandPrice(s, people) ? people : undefined;
}

/** A computer nation offers the asking price for the tile (`buy`) or takes it (`take`); whether the tile is now its own. */
export function computerAcquire(s: GameState, nation: PlayerId, prof: AiProfile, x: number, y: number): boolean {
  if (landDealProblem(s, nation, x, y, prof.land === 'take')) return false;
  if (prof.land === 'take') takePeopleLand(s, nation, x, y);
  else offerForLand(s, nation, x, y, peopleLandPrice(s, playingPeopleLand(s, x, y)!));
  return tileAt(s, x, y)!.claim === nation;
}

/**
 * A computer nation's turn for a playing people's land near a colony (ai/advanced.ts
 * `acquireLand`): it offers for, or takes, the first tile within `reach` it may (`computerMayAsk`),
 * then waits `waitYears` before it asks that people again. Returns whether it did either.
 */
export function computerLandDeal(s: GameState, nation: PlayerId, colony: Colony, prof: AiProfile, spare: number): boolean {
  const rules = landSalesOf(s);
  if (!rules || prof.land === 'avoid') return false;
  for (const q of gridOf(s).tilesWithin(s.map, colony.x, colony.y, rules.reach)) {
    if (!computerMayAsk(s, nation, prof, q.x, q.y, spare) || landDealProblem(s, nation, q.x, q.y, prof.land === 'take')) continue;
    computerAcquire(s, nation, prof, q.x, q.y);
    return true;
  }
  return false;
}
