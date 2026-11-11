/**
 * A playing people's towns: growth without Europe (docs/design/native-nations.md, T10 in full and
 * T5; Beta 3 step 2). Everything here reads or writes only towns of a people playing as a nation
 * (`Player.kind: 'people'`), so games without one (the Americas and the Caribbean) never reach it.
 *
 * **Births from food.** A town grows when its food above its **reserve** reaches `foodToGrow`
 * (production.ts, 200), as a colony grows from its food: more people because fed. The reserve is
 * `storeYears` (1 by default; per people through `peoples.overrides[id].storeYears`) years of its
 * people's food, counted only as far as the town can keep it. A birth is a townsperson (the
 * people's selection's first unit), who joins the town's work at once (a household's new member,
 * not a colonist off a ship), so a computer people's towns grow by these rules without any decision.
 * No birth in a year the town went hungry or was attacked, and none while its longhouses are full
 * (`BuildingDef.housing`).
 *
 * **Stores.** Food beyond what a town puts by towards a birth is its store, up to its store
 * capacity: `PeopleEconomy.storeBase` (50) and what drying racks, a smokehouse and storage pits add
 * (`BuildingDef.store`). Food beyond `foodToGrow` plus the store capacity spoils. Storage pits also
 * keep other goods, as a warehouse does (`BuildingDef.capacity`, queries.ts `warehouseCapacity`).
 *
 * **Hunger.** In a hard year (land.ts) a town eats from its store. A town whose store runs out goes
 * hungry: no birth that year, and after a second hungry year in a row it loses a person (a European
 * colony loses a colonist the first turn its food runs out; a people's store carries it longer).
 *
 * **A people's land (T5).** Its towns' work areas and the land it claims: at setup, and when it
 * founds a town, each town claims the unclaimed land within its people's `landRadius` (`Tile.claim`
 * the people's id), not land of a settlement of a people nobody plays; and a people may claim
 * unclaimed land next to its own (`claimLand`). Other players' colonies do not work a people's
 * claimed land or found colonies on it (leases and sales come with step 4's treaties).
 */
import { bestJob } from './colony.js';
import { fail } from './errors.js';
import { gridOf } from './grid.js';
import { turnsInYear } from './land.js';
import { nativeLandOwner } from './natives.js';
import { kindOfId } from './playerkind.js';
import { foodToGrow, FOOD_PER_COLONIST } from './production.js';
import { colonyAt, colonyWorkers, createUnit, isWater, message, player, settlementAt, tileAt, unitName, unitsAt } from './queries.js';
import { BUILDINGS, type BuildingKind } from './rules/buildings.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import { UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import { wayOf } from './rules/peoples.js';
import { bornType, buildingsOf, calendarOf, nationTypeOf, peopleEconomyOf, peopleOf, scenarioOf, settlementKindIn, yearOf } from './scenarios/index.js';
import { track } from './telemetry.js';
import { addOf, modifiers } from './scenarios/modifiers.js';
import type { Colony, GameState, Job, Unit } from './types.js';
import { colonyList, removeUnit, setUnitLoc } from './unitindex.js';

/** Whether a colony is a playing people's town (its owner is a people, T2). */
export function isPeopleTown(colony: Pick<Colony, 'owner'>): boolean {
  return kindOfId(colony.owner) === 'people';
}

/** Years of food a people's towns keep as their reserve. */
export function storeYearsOf(s: GameState, people: PlayerId): number {
  return peopleOf(s, people as TribeId).storeYears ?? peopleEconomyOf(s).storeYears;
}

/** Food a town's people eat in a year. */
export function yearlyNeed(s: GameState, colony: Colony, pop = colonyWorkers(s, colony).length): number {
  return pop * FOOD_PER_COLONIST * turnsInYear(s);
}

/** Food a town can keep in store: the economy's base and its drying racks', smokehouse's and storage pits'. */
export function storeCapacity(s: GameState, colony: Colony): number {
  // The people's council may keep more (the Keepers of the Stores).
  let n = peopleEconomyOf(s).storeBase + addOf(modifiers(s, colony.owner, 'townStore'));
  for (const k of buildingsOf(s, colony.owner)) {
    const store = BUILDINGS[k].store;
    const level = colony.buildings[k] ?? 0;
    if (store && level > 0) n += store[level - 1];
  }
  return n;
}

/** A town's reserve: `storeYears` years of its people's food, as far as its stores can keep it. */
export function reserveOf(s: GameState, colony: Colony, pop = colonyWorkers(s, colony).length): number {
  return Math.min(storeCapacity(s, colony), Math.ceil(storeYearsOf(s, colony.owner) * yearlyNeed(s, colony, pop)));
}

/** The most food a town keeps: what it puts by towards a birth and its store. */
export function foodCapacity(s: GameState, colony: Colony): number {
  return foodToGrow(s, colony) + storeCapacity(s, colony);
}

/** People a town can house (its longhouses); unlimited for a town without housing buildings. */
export function housingOf(s: GameState, colony: Colony): number {
  let n = 0;
  let any = false;
  for (const k of buildingsOf(s, colony.owner)) {
    const housing = BUILDINGS[k].housing;
    if (!housing) continue;
    any = true;
    const level = colony.buildings[k] ?? 0;
    if (level > 0) n += housing[level - 1];
  }
  return any ? n : Infinity;
}

/** The people a town houses: its workers and its people standing in it (warriors, runners, the newborn without work). */
export function townDwellers(s: GameState, colony: Colony): number {
  let n = colonyWorkers(s, colony).length;
  for (const u of unitsAt(s, colony.x, colony.y)) if (u.owner === colony.owner && u.loc.kind === 'map' && UNIT_TYPES[u.type].kind === 'colonist') n++;
  return n;
}

/** Years of food a town holds (its food over its people's yearly need); Infinity for an empty town. */
export function storeYearsHeld(s: GameState, colony: Colony): number {
  const need = yearlyNeed(s, colony);
  return need > 0 ? Math.max(0, colony.goods.food) / need : Infinity;
}

/** Whether a town went hungry this year. */
export function hungryThisYear(s: GameState, colony: Colony): boolean {
  if (!colony.hunger) return false;
  const cal = calendarOf(s);
  return yearOf(colony.hunger.last, cal).year === yearOf(s.turn, cal).year;
}

/** Whether a town was attacked this year. */
export function foughtThisYear(s: GameState, colony: Colony): boolean {
  if (colony.foughtAt === undefined) return false;
  const cal = calendarOf(s);
  return yearOf(colony.foughtAt, cal).year === yearOf(s.turn, cal).year;
}

/**
 * A people's town's births, hunger and food stores at the end of its owner's turn (colony.ts
 * `processColony`, after the turn's food has been added): in place of a colony's growth and
 * starvation.
 */
export function growPeopleTown(s: GameState, colony: Colony): void {
  const cal = calendarOf(s);
  const year = yearOf(s.turn, cal).year;
  const workers = colonyWorkers(s, colony);
  if (colony.goods.food < 0) {
    colony.goods.food = 0;
    const h = colony.hunger;
    // A run of hungry years goes on while the town went hungry last year or this one.
    const running = h && year - yearOf(h.last, cal).year <= 1;
    const since = running ? h.since : s.turn;
    colony.hunger = { since, last: s.turn };
    track(colony.owner, 'town:hungry');
    if (running && year - yearOf(since, cal).year >= 1) {
      // The second hungry year in a row: the town loses a person, and a new run begins.
      colony.hunger.since = s.turn;
      if (workers.length > 1) {
        const victim = workers[workers.length - 1];
        removeUnit(s, victim.id);
        track(colony.owner, 'town:person lost to hunger');
        message(s, `Hunger in ${colony.name}: a ${unitName(victim).toLowerCase()} has died in the second hungry year.`, colony.owner, colony);
      } else {
        message(s, `${colony.name} is hungry for a second year.`, colony.owner, colony);
      }
    } else if (!running || yearOf(h!.last, cal).year !== year) {
      message(s, `${colony.name}'s stores have run out: no birth this year, and a second hungry year will cost lives.`, colony.owner, colony);
    }
    return;
  }
  // A hunger record more than a year old is over.
  if (colony.hunger && year - yearOf(colony.hunger.last, cal).year > 1) delete colony.hunger;

  const pop = workers.length;
  const toGrow = foodToGrow(s, colony);
  if (
    colony.goods.food >= toGrow + reserveOf(s, colony, pop) &&
    townDwellers(s, colony) < housingOf(s, colony) &&
    !hungryThisYear(s, colony) &&
    !foughtThisYear(s, colony)
  ) {
    colony.goods.food -= toGrow;
    const u = createUnit(s, colony.owner, bornType(s, colony.owner), { kind: 'map', x: colony.x, y: colony.y });
    // A new member of the town joins its work at once.
    const job = bestJob(s, colony, u);
    if (job) setUnitLoc(s, u, { kind: 'colony', colonyId: colony.id, job });
    track(colony.owner, 'colony:colonist born');
    message(s, `A child has been born in ${colony.name}.`, colony.owner, colony);
  }
  const cap = foodCapacity(s, colony);
  if (colony.goods.food > cap) {
    track(colony.owner, 'town:food spoiled', colony.goods.food - cap);
    colony.goods.food = cap;
  }
}

// ---------------------------------------------------------------------------
// Elders teach (T6)

/** The expert a people's worker becomes when an elder teaches it the skill of its work, if any. */
export function skillOfWork(s: GameState, u: Unit): UnitTypeId | undefined {
  if (u.loc.kind !== 'colony') return undefined;
  const job: Job = u.loc.job;
  const units = nationTypeOf(s, 'people').units;
  const has = (t: UnitTypeId) => units.includes(t);
  let want: UnitTypeId | undefined;
  if (job.kind === 'tile') {
    const tile = tileAt(s, job.x, job.y);
    if (!tile) return undefined;
    const way = wayOf(tile, job.good, peopleEconomyOf(s).gardens);
    want = (Object.keys(UNIT_TYPES) as UnitTypeId[]).find((t) => UNIT_TYPES[t].people && (UNIT_TYPES[t].ways?.[way] ?? 1) > 1);
  } else {
    const output = BUILDINGS[job.building].output;
    want = output && output !== 'bells' ? (Object.keys(UNIT_TYPES) as UnitTypeId[]).find((t) => UNIT_TYPES[t].people && UNIT_TYPES[t].expertFor === output) : undefined;
  }
  return want && has(want) && want !== u.type ? want : undefined;
}

/** The building whose places are a town's teaching places (the longhouse), or the schoolhouse for a colony. */
export function schoolOf(s: GameState, colony: Colony): BuildingKind {
  if (!isPeopleTown(colony)) return 'schoolhouse';
  return buildingsOf(s, colony.owner).find((k) => BUILDINGS[k].school) ?? 'schoolhouse';
}

// ---------------------------------------------------------------------------
// A people's land (T5)

/** How far a people's towns claim land: its settlement kind's `landRadius` (1 when absent). */
export function claimRadius(s: GameState, people: PlayerId): number {
  return settlementKindIn(scenarioOf(s), people as TribeId).landRadius ?? 1;
}

/** Whether a tile is free for a people to claim: land nobody holds, not a settlement's land, no town or settlement on it. */
function claimable(s: GameState, x: number, y: number): boolean {
  const tile = tileAt(s, x, y);
  if (!tile || isWater(tile) || tile.claim) return false;
  if (settlementAt(s, x, y) || nativeLandOwner(s, x, y)) return false;
  const c = colonyAt(s, x, y);
  return !c;
}

/** A town claims the unclaimed land within its people's reach (at setup and when founded). Returns the tiles claimed. */
export function claimTownLand(s: GameState, colony: Colony): number {
  let n = 0;
  const own = colonyAt(s, colony.x, colony.y) === colony;
  const centre = tileAt(s, colony.x, colony.y);
  if (own && centre && !centre.claim) {
    centre.claim = colony.owner;
    n++;
  }
  for (const p of gridOf(s).tilesWithin(s.map, colony.x, colony.y, claimRadius(s, colony.owner))) {
    if (!claimable(s, p.x, p.y)) continue;
    tileAt(s, p.x, p.y)!.claim = colony.owner;
    n++;
  }
  return n;
}

/** The playing people whose claimed land a tile is, if that keeps `nation`'s colonies off it. */
export function peopleLandClosedTo(s: GameState, nation: PlayerId, x: number, y: number): PlayerId | undefined {
  const tile = tileAt(s, x, y);
  const claim = tile?.claim;
  if (!claim || claim === nation || tile.use === nation || kindOfId(claim) !== 'people') return undefined;
  return claim;
}

/** Whether a tile is a playing people's own land: claimed by it, or in the work area of one of its towns. */
export function isPeopleLand(s: GameState, people: PlayerId, x: number, y: number): boolean {
  if (tileAt(s, x, y)?.claim === people) return true;
  const grid = gridOf(s);
  return colonyList(s).some((c) => c.owner === people && grid.distance(c.x, c.y, x, y) <= 1);
}

/**
 * A people claims a tile of unclaimed land next to its own land and within reach of one of its
 * towns (its `landRadius` and one more). Nobody else's: not a settlement's land, not claimed.
 */
export function claimLand(s: GameState, people: PlayerId, x: number, y: number): string {
  const p = player(s, people);
  if (kindOfId(p.id) !== 'people') fail('Only a native people claims land this way; nations buy or take it.');
  const tile = tileAt(s, x, y);
  if (!tile) fail('There is no such tile.');
  if (tile.claim === people) fail('This land is already yours.');
  if (!claimable(s, x, y)) fail(tile.claim || nativeLandOwner(s, x, y) || settlementAt(s, x, y) ? 'This land is held by others.' : 'Only land can be claimed.');
  const grid = gridOf(s);
  const reach = claimRadius(s, people) + 1;
  if (!colonyList(s).some((c) => c.owner === people && grid.distance(c.x, c.y, x, y) <= reach)) fail('This land is too far from your towns.');
  if (!grid.neighbours(s.map, x, y).some((q) => isPeopleLand(s, people, q.x, q.y))) fail('You can only claim land next to your own.');
  tile.claim = people;
  track(people, 'cmd:claimLand');
  return 'The land is yours.';
}

// ---------------------------------------------------------------------------
// A town's builds when a computer people plays it (colony automation until step 9)

/** The order a computer people's towns build in when nothing is set: stores, walls, housing, a landing, workshops, the smokehouse. */
const TOWN_PLAN: readonly BuildingKind[] = ['storagePits', 'longhouse', 'palisade', 'canoeLanding', 'workshop', 'dryingRacks'];

/** Picks a computer people's town's next build when it has none (the first of the plan it can build). */
export function planTownBuild(s: GameState, colony: Colony, canBuild: (target: { kind: 'building'; id: BuildingKind }) => boolean): void {
  if (colony.build || player(s, colony.owner).human) return;
  const own = buildingsOf(s, colony.owner);
  for (const id of TOWN_PLAN) {
    if (!own.includes(id)) continue;
    const t = { kind: 'building' as const, id };
    if (canBuild(t)) {
      colony.build = t;
      return;
    }
  }
}
