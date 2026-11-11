/**
 * Epidemics after contact (docs/design/native-nations.md, T12; Beta 3 step 4).
 *
 * Epidemics were the largest fact of contact between Europeans and the peoples of the Americas;
 * leaving them out would rewrite history, and putting them in is grim. They are a small, sober set
 * of rules behind a switch, `mechanics.epidemics`, off in the Americas and the Caribbean (where
 * nothing here runs, so those games are unchanged). Simon decided (11 November 2026) that when on
 * they strike European colonies and peoples' towns alike, by the same rules.
 *
 * - **Contact.** A town or colony is exposed once the other side is near: a European colony within
 *   `reach` tiles of a people's town or of a settlement of a people nobody plays, a people's town
 *   within `reach` of a European colony. Nothing strikes before contact.
 * - **When.** At the start of each year, each region (land.ts's regions, or squares of 8 tiles) has
 *   an epidemic with `chance`, drawn from the game seed for that region and year (relations.ts
 *   `regionRandom`, never `GameState.rng`, so an epidemic shifts no other random outcome). It
 *   strikes every exposed town and colony in the region, whoever owns it.
 * - **What.** A town or colony struck loses `loss` people (never its last), and has no births for
 *   `years` years (`Colony.sickUntil`): a people's town no birth from food, a European colony no
 *   new colonist from food. Who dies is drawn from the same seeded stream.
 *
 * The words are plain: an epidemic reaches the town, people die of it, the town recovers. Nothing
 * blames anyone, and nothing is played for effect (australia.md, "Care with the subject").
 */
import { gridOf } from './grid.js';
import { colonyWorkers, message } from './queries.js';
import { kindOfId } from './playerkind.js';
import { regionRandom } from './relations.js';
import { calendarOf, mechanicsOf, turnAfterYears, yearOf } from './scenarios/index.js';
import type { EpidemicRules } from './scenarios/types.js';
import { track } from './telemetry.js';
import type { Colony, GameState } from './types.js';
import { colonyList, removeUnit } from './unitindex.js';

/** The side of a region in tiles when the game has no land state (land.ts uses the same squares). */
const REGION_SIZE = 8;

/** The scenario's epidemic rules, or undefined when it has none (`mechanics.epidemics`). */
export function epidemicRules(s: GameState): EpidemicRules | undefined {
  return mechanicsOf(s).epidemics || undefined;
}

/** Whether a town or colony is still recovering from an epidemic: no births. */
export function isSick(s: GameState, c: Colony): boolean {
  return c.sickUntil !== undefined && s.turn < c.sickUntil;
}

/** Whether a town or colony is a people's (otherwise a European colony). */
function isTown(c: Colony): boolean {
  return kindOfId(c.owner) === 'people';
}

/**
 * The towns and colonies exposed to an epidemic now: a European colony with a people's town or a
 * settlement within `reach`, a people's town with a European colony within `reach`.
 */
export function exposedColonies(s: GameState, rules: EpidemicRules): Colony[] {
  const grid = gridOf(s);
  const all = colonyList(s);
  const towns = all.filter(isTown);
  const colonies = all.filter((c) => !isTown(c));
  const settlements = Object.values(s.settlements);
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => grid.distance(a.x, a.y, b.x, b.y) <= rules.reach;
  return all.filter((c) => (isTown(c) ? colonies.some((o) => near(c, o)) : towns.some((o) => near(c, o)) || settlements.some((o) => near(c, o))));
}

function regionOfTile(s: GameState, x: number, y: number): number {
  const size = s.land?.size ?? REGION_SIZE;
  const cols = s.land?.cols ?? Math.ceil(s.map.width / size);
  return Math.floor(y / size) * cols + Math.floor(x / size);
}

/** The words for an epidemic reaching a town or colony. */
export function epidemicText(c: Colony, lost: number, years: number, town: boolean): string {
  const folk = town ? 'people' : 'colonists';
  const it = town ? 'the town' : 'the colony';
  const deaths = lost === 0 ? `Many of its ${folk} fall ill, and all of them live` : lost === 1 ? `One of its ${folk} has died of it` : `${lost} of its ${folk} have died of it`;
  return `An epidemic has reached ${c.name}. ${deaths}, and ${it} will see no births for ${years} ${years === 1 ? 'year' : 'years'} while it recovers.`;
}

/** Strikes a town or colony: it loses up to `loss` people (never its last) and has no births for `years` years. */
function strike(s: GameState, c: Colony, rules: EpidemicRules, region: number, year: number): void {
  let lost = 0;
  for (let i = 0; i < rules.loss; i++) {
    const workers = colonyWorkers(s, c);
    if (workers.length <= 1) break;
    const victim = workers[Math.floor(regionRandom(s, region, `epidemic who|${year}|${c.id}|${i}`) * workers.length)];
    removeUnit(s, victim.id);
    lost++;
  }
  c.sickUntil = turnAfterYears(s.turn + 1, rules.years, calendarOf(s));
  track(c.owner, isTown(c) ? 'epidemic:town struck' : 'epidemic:colony struck');
  if (lost) track(c.owner, 'epidemic:people lost', lost);
  message(s, epidemicText(c, lost, rules.years, isTown(c)), c.owner, c);
}

/**
 * Once a round, after the land (turn.ts): on the last round of a year, draws the coming year's
 * epidemics region by region and strikes the exposed towns and colonies in each.
 */
export function processEpidemics(s: GameState): void {
  const rules = epidemicRules(s);
  if (!rules) return;
  const cal = calendarOf(s);
  const next = yearOf(s.turn + 1, cal).year;
  if (next === yearOf(s.turn, cal).year) return;
  const byRegion = new Map<number, Colony[]>();
  for (const c of exposedColonies(s, rules)) {
    const r = regionOfTile(s, c.x, c.y);
    const list = byRegion.get(r);
    if (list) list.push(c);
    else byRegion.set(r, [c]);
  }
  for (const [region, list] of [...byRegion].sort((a, b) => a[0] - b[0])) {
    if (regionRandom(s, region, `epidemic|${next}`) >= rules.chance) continue;
    for (const c of list) strike(s, c, rules, region, next);
  }
}
