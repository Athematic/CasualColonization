/**
 * A computer people's turn (docs/design/native-nations.md T15; Beta 3 step 9), by its profile
 * (ai/profiles.ts `PEOPLE_PROFILES`): Creative trades and makes treaties, Competent balances,
 * Combative defends hard and raids rivals, Naive grows. No profile aims at the military victory:
 * a computer people never attacks a colony, only enemy units beside its towns or on its land.
 *
 * Every turn:
 * - **Peace** with a side it has been at war with for its profile's `peaceAfter` years.
 * - **Proposals** every fifth turn (peoplediplomacy.ts `peopleProposals`).
 * - **Arms** its warriors with the muskets and horses its towns hold (the soldier and dragoon roles).
 * - **Defends** its land: its armed units attack an enemy unit beside them, outside any colony,
 *   with its profile's `margin`; a raiding profile (Combative) also sends the warriors its towns
 *   can spare after such units within reach of its towns.
 * Once a year, on the year's first turn:
 * - **Trade visits** to European colonies (peopletrade.ts `computerTradeVisits`: furs sold, food
 *   sold by Naive, the goods its profile buys) and **barter** with other peoples nearby
 *   (`computerBarter`), whose volume builds the standing that treaties, pacts and leagues need.
 * - **Restraint on the land:** in a region whose health is under its profile's `restraint`, its
 *   hunters are moved to other work (fishing, gardens, crafts, the council) until what it takes
 *   there is within the region's renewal; Naive follows the price and never holds back (T10).
 * - **Food first:** a town that eats more than it gets moves a worker from building work to food.
 * - **Claims** up to its profile's `claims` tiles of unclaimed land next to its own (T5).
 * - **Raids** (Combative): war on a European nation with a colony close to its towns, when it has
 *   warriors to spare and has been at peace for a generation.
 * - **Explores** (Beta 3 step 10b, where the scenario has `mechanics.mapKnowledge`): its runners go
 *   to the edge of what it knows within its profile's reach of its towns; what they see is land it
 *   then knows (T13), and the peoples they meet share their maps (peoplemaps.ts).
 * Its towns' builds and reserve follow the profile too (peopleeconomy.ts `planTownBuild`,
 * `storeYearsOf`); births, elders' teaching and iron tools are the economy's own rules.
 */
import { colonyReport } from '../production.js';
import { equipInColony, jobOptions, townJobValue, assignJob } from '../colony.js';
import { attack, defencePower, offencePower } from '../combat.js';
import { proposePeace, startWar } from '../diplomacy.js';
import { gridOf } from '../grid.js';
import { regionHealth, regionOf, regionRenewal, turnsInYear } from '../land.js';
import { goTo, setDestination } from '../movement.js';
import { claimLand } from '../peopleeconomy.js';
import { pairTreaties, peopleProposals } from '../peoplediplomacy.js';
import { computerBarter, computerTradeVisits } from '../peopletrade.js';
import { kindOfId, systemsOfId } from '../playerkind.js';
import { colonyAt, colonyWorkers, isShip, isWater, neighbours, tileAt } from '../queries.js';
import { wayOf } from '../rules/peoples.js';
import { UNIT_TYPES } from '../rules/units.js';
import { calendarOf, mechanicsOf, peopleEconomyOf, yearOf, yearValue } from '../scenarios/index.js';
import type { Colony, GameState, Job, Player, Unit } from '../types.js';
import { colonyList, ownedUnitsView, unitList } from '../unitindex.js';
import { safely } from './common.js';
import { PEOPLE_PROFILES, type PeopleProfile } from './profiles.js';

/** Plays a computer people's turn at its level. */
export function runPeopleAi(s: GameState, p: Player): void {
  const prof = PEOPLE_PROFILES[p.ai ?? 'naive'];
  seekPeace(s, p, prof);
  const cal = calendarOf(s);
  if (s.turn === 0 || yearOf(s.turn, cal).year !== yearOf(s.turn - 1, cal).year) {
    computerTradeVisits(s, p.id, prof);
    computerBarter(s, p.id, prof.barter);
    restrainHunting(s, p, prof);
    feedTowns(s, p);
    claimAround(s, p, prof);
    if (prof.raids) startRaid(s, p, prof);
  }
  peopleProposals(s, p, prof);
  armWarriors(s, p, prof);
  defend(s, p, prof);
  explore(s, p, prof);
}

// ---------------------------------------------------------------------------
// War and peace

function yearsSince(s: GameState, turn: number): number {
  const cal = calendarOf(s);
  return yearValue(s.turn, cal) - yearValue(turn, cal);
}

/** Seeks peace with each side it has fought for its profile's `peaceAfter` years (the other answers as it answers any offer of peace). */
function seekPeace(s: GameState, p: Player, prof: PeopleProfile): void {
  for (const [other, stance] of Object.entries(p.stance)) {
    if (stance !== 'war' || other === 'crown' || !s.players.some((o) => o.id === other)) continue;
    if (yearsSince(s, p.warSince[other] ?? s.turn) < prof.peaceAfter) continue;
    safely(() => proposePeace(s, p.id, other as Player['id']));
  }
}

/** The armed units a people has standing on the map (warriors and anyone with a soldier's or dragoon's role). */
function armed(s: GameState, p: Player): Unit[] {
  return ownedUnitsView(s, p.id).filter((u) => u.loc.kind === 'map' && !isShip(u) && (UNIT_TYPES[u.type].offence > 0 || u.role === 'soldier' || u.role === 'dragoon'));
}

/**
 * Warriors standing in a town take up the muskets, then the horses, the town holds; a raiding
 * profile (Combative) also arms the townspeople standing idle there (no work left in the town).
 */
function armWarriors(s: GameState, p: Player, prof: PeopleProfile): void {
  const idle = prof.raids ? ownedUnitsView(s, p.id).filter((u) => u.loc.kind === 'map' && u.role === 'none' && UNIT_TYPES[u.type].kind === 'colonist' && UNIT_TYPES[u.type].offence === 0) : [];
  for (const u of [...armed(s, p), ...idle]) {
    if (u.loc.kind !== 'map' || UNIT_TYPES[u.type].kind !== 'colonist') continue;
    const town = colonyAt(s, u.loc.x, u.loc.y);
    if (!town || town.owner !== p.id) continue;
    if (u.role === 'none' && town.goods.muskets >= 50) safely(() => equipInColony(s, u.id, 'soldier'));
    else if (u.role === 'soldier' && town.goods.horses >= 50) safely(() => equipInColony(s, u.id, 'dragoon'));
  }
}

/** An enemy unit on land beside x, y, outside any colony, that `u` beats with the margin; the weakest first. */
function targetBeside(s: GameState, p: Player, u: Unit, x: number, y: number, margin: number): Unit | undefined {
  let best: { t: Unit; ratio: number } | undefined;
  for (const n of neighbours(s, x, y)) {
    if (colonyAt(s, n.x, n.y)) continue;
    for (const t of unitList(s)) {
      if (t.loc.kind !== 'map' || t.loc.x !== n.x || t.loc.y !== n.y || isShip(t) || p.stance[t.owner] !== 'war') continue;
      const ratio = offencePower(s, u, t) / Math.max(0.01, defencePower(s, t));
      if (ratio >= margin && (!best || ratio > best.ratio)) best = { t, ratio };
    }
  }
  return best?.t;
}

/**
 * Its armed units attack an enemy beside them (outside any colony) when they win with the margin.
 * A raiding profile also sends what its towns can spare (all but one armed unit a town) after enemy
 * units within three tiles of its towns, and brings them home when none is left.
 */
function defend(s: GameState, p: Player, prof: PeopleProfile): void {
  if (!Object.values(p.stance).includes('war')) return;
  const grid = gridOf(s);
  const towns = colonyList(s).filter((c) => c.owner === p.id);
  const kept = new Set<string>();
  for (const town of towns) {
    const here = armed(s, p).find((u) => u.loc.kind === 'map' && u.loc.x === town.x && u.loc.y === town.y && !kept.has(u.id));
    if (here) kept.add(here.id);
  }
  for (const u of armed(s, p)) {
    if (u.loc.kind !== 'map' || u.moves <= 0) continue;
    const t = targetBeside(s, p, u, u.loc.x, u.loc.y, prof.margin);
    if (t) {
      safely(() => attack(s, u.id, { unitId: t.id }));
      continue;
    }
    if (!prof.raids || kept.has(u.id)) continue;
    // A raider goes after the nearest enemy unit within three tiles of its towns, or home.
    const { x, y } = u.loc;
    let goal: { x: number; y: number } | undefined;
    let goalD = Infinity;
    for (const e of unitList(s)) {
      if (e.loc.kind !== 'map' || isShip(e) || p.stance[e.owner] !== 'war' || colonyAt(s, e.loc.x, e.loc.y)) continue;
      const ex = e.loc.x;
      const ey = e.loc.y;
      if (!towns.some((c) => grid.distance(c.x, c.y, ex, ey) <= 3)) continue;
      const d = grid.distance(x, y, ex, ey);
      if (d < goalD) {
        goalD = d;
        goal = neighbours(s, ex, ey).find((q) => !isWater(tileAt(s, q.x, q.y)!) && !colonyAt(s, q.x, q.y));
      }
    }
    if (!goal) {
      const home = towns.reduce<Colony | undefined>((b, c) => (!b || grid.distance(c.x, c.y, x, y) < grid.distance(b.x, b.y, x, y) ? c : b), undefined);
      if (home && (home.x !== x || home.y !== y)) safely(() => goTo(s, u, home.x, home.y));
      continue;
    }
    if (goal.x !== x || goal.y !== y) safely(() => goTo(s, u, goal.x, goal.y));
  }
}

/** How close a European colony must stand to one of a raiding people's towns for it to go to war (tiles). */
export const RAID_REACH = 5;

/**
 * A raiding profile (Combative), at peace for a generation (30 years) and with an armed unit for
 * each of its towns, goes to war with the European nation whose colony stands closest to its
 * towns, within `RAID_REACH` tiles, unless a treaty binds the two (it does not break faith to raid).
 */

function startRaid(s: GameState, p: Player, prof: PeopleProfile): void {
  if (!prof.raids || Object.values(p.stance).includes('war')) return;
  if (p.lastWar !== undefined && yearsSince(s, p.lastWar) < 30) return;
  const towns = colonyList(s).filter((c) => c.owner === p.id);
  if (armed(s, p).length < towns.length) return;
  const grid = gridOf(s);
  let rival: Player['id'] | undefined;
  let best = Infinity;
  for (const c of colonyList(s)) {
    if (kindOfId(c.owner) === 'people' || !systemsOfId(c.owner).war || c.owner === 'crown') continue;
    if (pairTreaties(s, p.id, c.owner).length) continue;
    for (const t of towns) {
      const d = grid.distance(c.x, c.y, t.x, t.y);
      if (d <= RAID_REACH && d < best) {
        best = d;
        rival = c.owner;
      }
    }
  }
  if (rival) safely(() => startWar(s, p.id, rival));
}

// ---------------------------------------------------------------------------
// The land and the towns' work

function isHunting(s: GameState, job: Job): boolean {
  if (job.kind !== 'tile') return false;
  const tile = tileAt(s, job.x, job.y);
  return !!tile && wayOf(tile, job.good, peopleEconomyOf(s).gardens) === 'hunting';
}

/** Moves a worker to its best job of another kind (not hunting, and food when `food`); returns whether it moved. */
function moveWorker(s: GameState, town: Colony, u: Unit, keep: (job: Job) => boolean): boolean {
  const report = colonyReport(s, town);
  let best: { job: Job; value: number } | undefined;
  for (const opt of jobOptions(s, town, u)) {
    if (!keep(opt.job)) continue;
    const value = townJobValue(s, town, opt.job, opt.amount, report.net.food, report);
    if (!best || value > best.value) best = { job: opt.job, value };
  }
  if (!best) return false;
  const job = best.job;
  let moved = false;
  safely(() => {
    assignJob(s, u.id, town.id, job);
    moved = true;
  });
  return moved;
}

/**
 * Restraint on the land (T10): in each region whose health is under the profile's `restraint`,
 * its hunters there, least productive first, move to other work until what the people takes there
 * in a year is within the region's renewal.
 */
function restrainHunting(s: GameState, p: Player, prof: PeopleProfile): void {
  const land = s.land;
  if (prof.restraint === null || !land?.health) return;
  const years = turnsInYear(s);
  const byRegion = new Map<number, { u: Unit; town: Colony; take: number }[]>();
  for (const town of colonyList(s)) {
    if (town.owner !== p.id) continue;
    const report = colonyReport(s, town);
    for (const u of colonyWorkers(s, town)) {
      if (u.loc.kind !== 'colony' || !isHunting(s, u.loc.job)) continue;
      const job = u.loc.job as Extract<Job, { kind: 'tile' }>;
      const r = regionOf(land, job.x, job.y);
      const list = byRegion.get(r) ?? [];
      list.push({ u, town, take: (report.workers[u.id] ?? 0) * years });
      byRegion.set(r, list);
    }
  }
  for (const [r, list] of [...byRegion].sort((a, b) => a[0] - b[0])) {
    if (regionHealth(s, r) >= prof.restraint) continue;
    let take = list.reduce((n, e) => n + e.take, 0);
    const renewal = regionRenewal(s, r);
    list.sort((a, b) => a.take - b.take);
    for (const e of list) {
      if (take <= renewal) break;
      if (moveWorker(s, e.town, e.u, (job) => !isHunting(s, job))) take -= e.take;
    }
  }
}

/** A town that eats more than it gets moves a worker from building work to its best food job. */
function feedTowns(s: GameState, p: Player): void {
  for (const town of colonyList(s)) {
    if (town.owner !== p.id) continue;
    const report = colonyReport(s, town);
    if (report.net.food >= 0) continue;
    const worker = colonyWorkers(s, town).find((u) => u.loc.kind === 'colony' && u.loc.job.kind === 'building' && u.type !== 'elder');
    if (worker) moveWorker(s, town, worker, (job) => job.kind === 'tile' && job.good === 'food');
  }
}

/** Claims up to the profile's `claims` tiles of unclaimed land next to its own, beside its towns first (T5). */
function claimAround(s: GameState, p: Player, prof: PeopleProfile): void {
  let left = prof.claims;
  if (left <= 0) return;
  const grid = gridOf(s);
  for (const town of colonyList(s)) {
    if (town.owner !== p.id) continue;
    for (const q of grid.tilesWithin(s.map, town.x, town.y, 2)) {
      if (left <= 0) return;
      const tile = tileAt(s, q.x, q.y);
      if (!tile || tile.claim) continue;
      safely(() => {
        claimLand(s, p.id, q.x, q.y);
        left--;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Exploring (Beta 3 step 10b)

/**
 * Its runners on the map with no orders go to the nearest land tile it has seen beside land it has
 * not, within `mechanics.mapKnowledge.range` times its profile's `explore` tiles of one of its towns,
 * nearest by steps over the land it has seen (a breadth-first search, so an edge across water or
 * behind another's colony is never tried); with nothing left within reach, they go home. Runners
 * already on their way keep going (turn.ts).
 */
function explore(s: GameState, p: Player, prof: PeopleProfile): void {
  const rules = mechanicsOf(s).mapKnowledge;
  if (!rules || !rules.range) return;
  const reach = Math.round(rules.range * prof.explore);
  if (reach <= 0) return;
  const towns = colonyList(s).filter((c) => c.owner === p.id);
  if (!towns.length) return;
  // A runner at home looks again every fifth turn: there is seldom anything new to find.
  const atHome = (u: Unit) => u.loc.kind === 'map' && colonyAt(s, u.loc.x, u.loc.y)?.owner === p.id;
  const runners = ownedUnitsView(s, p.id).filter((u) => u.type === 'runner' && u.loc.kind === 'map' && !u.dest && u.moves > 0 && (s.turn % 5 === 0 || !atHome(u)));
  if (!runners.length) return;
  const grid = gridOf(s);
  const w = s.map.width;
  const h = s.map.height;
  // The land within reach of its towns that it has seen, but settlements and others' colonies: 1 where a runner may go.
  const area = new Uint8Array(w * h);
  for (const town of towns) {
    for (let y = Math.max(0, town.y - reach); y <= Math.min(h - 1, town.y + reach); y++) {
      for (let x = Math.max(0, town.x - reach); x <= Math.min(w - 1, town.x + reach); x++) {
        if (grid.distance(town.x, town.y, x, y) <= reach) area[y * w + x] = 1;
      }
    }
  }
  for (const k in s.settlements) area[s.settlements[k].y * w + s.settlements[k].x] = 0;
  const seen = (i: number) => p.explored[i] === 1;
  const open = (i: number) => {
    if (!area[i] || !seen(i) || isWater(s.map.tiles[i])) return false;
    const x = i % w;
    const c = colonyAt(s, x, (i - x) / w);
    return !c || c.owner === p.id;
  };
  for (const u of runners) {
    if (u.loc.kind !== 'map') continue;
    const { x, y } = u.loc;
    const from = y * w + x;
    // Breadth-first over the open land, nearest first; `prev` leads each tile back to the runner.
    let goal = -1;
    const prev = new Int32Array(w * h).fill(-2);
    prev[from] = -1;
    const queue = [from];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      const qx = i % w;
      const around = neighbours(s, qx, (i - qx) / w);
      if (i !== from && around.some((n) => !seen(n.y * w + n.x))) {
        goal = i;
        break;
      }
      for (const n of around) {
        const j = n.y * w + n.x;
        if (prev[j] !== -2) continue;
        prev[j] = i;
        if (open(j)) queue.push(j);
      }
    }
    let going = false;
    if (goal >= 0) {
      // The route the search found, so no other search is needed (setDestination, continueOrders).
      const path: { x: number; y: number }[] = [];
      for (let i = goal; i !== from; i = prev[i]) path.push({ x: i % w, y: Math.floor(i / w) });
      path.reverse();
      const to = path[path.length - 1];
      safely(() => {
        setDestination(s, u.id, { x: to.x, y: to.y }, path);
        going = true;
      });
    }
    if (going || atHome(u)) continue;
    const home = towns.reduce((b, c) => (grid.distance(c.x, c.y, x, y) < grid.distance(b.x, b.y, x, y) ? c : b));
    safely(() => goTo(s, u, home.x, home.y));
  }
}
