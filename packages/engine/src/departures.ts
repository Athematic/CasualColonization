/**
 * Departure and thriving checks (Beta 4 step 4; docs/design/hex-maps.md H21).
 *
 * A nation whose scenario entry has `departs` (such as the Norse in Vinland) must establish a
 * thriving foothold by a seeded year within `departs.years`, or withdraw to its homeland.
 *
 * Scenarios without `departs` do nothing and draw no random numbers.
 */
import { colonyReport } from './production.js';
import { colonyWorkers, message } from './queries.js';
import type { PlayerId } from './rules/nations.js';
import { scoreBreakdown } from './score.js';
import { calendarOf, nationEntry, nationOf, scenarioOf, yearValue } from './scenarios/index.js';
import { turnOfYear } from './scenarios/calendar.js';
import type { DepartureRule, ThrivingCriteria } from './scenarios/types.js';
import type { GameState } from './types.js';
import { colonyList, removeUnit, unitList } from './unitindex.js';
import { peoplesAtWarWith } from './victory.js';

export interface ThrivingStatus {
  thriving: boolean;
  settlement: boolean;
  selfSufficient: boolean;
  standing: boolean;
  colonies: number;
  population: number;
  netFood: number;
  netLumber: number;
  foodStored: number;
  treaties: number;
}

/**
 * The seeded year in `rule.years` when `nation` faces its departure check. Deterministic from
 * `s.config.seed` and the nation id, drawing no game RNG.
 */
export function departureYearFor(s: GameState, nation: PlayerId, rule: DepartureRule): number {
  const [lo, hi] = rule.years;
  if (hi <= lo) return lo;
  let h = (s.config.seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < nation.length; i++) h = Math.imul(h ^ nation.charCodeAt(i), 0x85ebca6b) >>> 0;
  return lo + (h % (hi - lo + 1));
}

/**
 * Evaluates whether `id` currently meets the three pillars of `criteria`:
 *   1. Settlement: at least `colonies` colonies OR `population` total colonists.
 *   2. Self-sufficiency: non-negative net food and lumber (or food stores >= max(80, pop * 30)).
 *   3. Standing with peoples: at least `treaties` active treaties with peoples and not at war with all met peoples.
 */
export function isThriving(s: GameState, id: PlayerId, criteria: ThrivingCriteria): ThrivingStatus {
  const cols = colonyList(s).filter((c) => c.owner === id);
  let population = 0;
  let netFood = 0;
  let netLumber = 0;
  let foodStored = 0;
  for (const c of cols) {
    population += colonyWorkers(s, c).length;
    const rep = colonyReport(s, c);
    netFood += rep.net.food;
    netLumber += rep.net.lumber;
    foodStored += c.goods.food ?? 0;
  }
  const settlement = cols.length >= criteria.colonies || population >= criteria.population;
  const selfSufficient =
    !criteria.selfSufficient ||
    (cols.length > 0 && ((netFood >= 0 && netLumber >= 0) || foodStored >= Math.max(80, population * 30)));

  // Active treaties with native peoples (both Beta 2 people-party treaties and Beta 3 playing-people treaties).
  const playingPeopleIds = new Set<string>(s.players.filter((p) => p.kind === 'people').map((p) => p.id));
  let treaties = 0;
  for (const t of s.treaties ?? []) {
    if (t.end) continue;
    const hasMe = t.parties.some((party) => party.kind === 'nation' && party.id === id);
    if (!hasMe) continue;
    const hasPeople = t.parties.some((party) => party.kind === 'people' || playingPeopleIds.has(party.id));
    if (hasPeople) treaties++;
  }
  const wars = peoplesAtWarWith(s, id);
  const metPeoples = new Set<string>();
  for (const tr of s.tribes) {
    if (tr.met?.includes(id)) metPeoples.add(tr.id);
  }
  for (const p of s.players) {
    if (p.kind === 'people') metPeoples.add(p.id);
  }
  const atWarWithAll = metPeoples.size > 0 && wars.length >= metPeoples.size;
  const standing = treaties >= criteria.treaties && !atWarWithAll;

  return {
    thriving: settlement && selfSufficient && standing,
    settlement,
    selfSufficient,
    standing,
    colonies: cols.length,
    population,
    netFood,
    netLumber,
    foodStored,
    treaties,
  };
}

/**
 * At the start of a round (turn.ts `advance`): any nation with `NationEntry.departs` whose
 * seeded departure year has arrived is checked. If thriving, it takes root; otherwise it withdraws
 * to its homeland and finishes.
 */
export function processDepartures(s: GameState): void {
  const sc = scenarioOf(s);
  const cal = calendarOf(s);
  const year = yearValue(s.turn, cal);
  for (const p of s.players) {
    if (p.kind || p.finished || p.thrived || p.departed) continue;
    const entry = nationEntry(sc, s.config.rivals, p.id);
    const rule = entry?.departs;
    if (!rule) continue;
    const checkYear = departureYearFor(s, p.id, rule);
    if (year < checkYear || s.turn < turnOfYear(checkYear, cal)) continue;
    const status = isThriving(s, p.id, rule.thriving);
    const name = nationOf(s, p.id).name;
    if (status.thriving) {
      p.thrived = true;
      for (const other of s.players) {
        message(s, `${name} has taken root in Vinland and will endure.`, other.id);
      }
    } else {
      p.departed = true;
      const bd = scoreBreakdown(s, p);
      p.finished = { turn: s.turn, score: bd.total, parts: Object.fromEntries(bd.lines.map((l) => [l.label, l.points])) };
      // Withdraw all units back to Greenland.
      for (const u of unitList(s).filter((x) => x.owner === p.id)) {
        removeUnit(s, u.id);
      }
      for (const other of s.players) {
        message(s, `Without enough settlers, stores, and peace with the peoples, ${name} withdraws to ${entry.port.name}.`, other.id);
      }
    }
  }
}
