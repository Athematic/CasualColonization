/**
 * The land's regions: hard years and land health (docs/design/native-nations.md, T10 in full;
 * Beta 3 step 2). Both are switches (`mechanics.hardYears`, `mechanics.landHealth`), off in the
 * Americas and the Caribbean: there `GameState.land` is never written and nothing here runs.
 *
 * **Regions.** Until step 8's North-east map brings regions of its own, the map is cut into
 * squares of `landHealth.regionSize` tiles (8 by default), numbered row by row from the north-west:
 * a simple partition that every map has, deterministic and cheap. A region is the same for every
 * player: the people's towns and the Europeans' colonies in it share its years and its game.
 *
 * **Hard years.** At the start of each year each region has a hard year with `hardYears.chance`
 * (1 in 8), drawn from the game seed for that region and year (relations.ts `regionRandom`; never
 * `GameState.rng`, so a hard year shifts no other random outcome). Food yields there are halved
 * that year, for everyone. Towns eat from their stores (peopleeconomy.ts).
 *
 * **Land health.** One number per region, 0–100, starting at 100. Furs and game (the hunting way,
 * rules/peoples.ts `wayOf`) taken in a region in a year, by anyone (a people's hunters, Europeans'
 * trappers, the settlements of peoples nobody plays), are counted; at the year's end a region where
 * more than its `renewal` was taken loses the excess in health, and one where less was taken
 * regains `recovery`. Fur and game yields there are multiplied by its health (at least `floor`).
 * Fish and gardens are not touched (T10: tired soils are a later idea).
 */
import { regionRandom } from './relations.js';
import { message } from './queries.js';
import { wayOf } from './rules/peoples.js';
import type { GoodId } from './rules/goods.js';
import { calendarOf, mechanicsOf, peopleEconomyOf, turnOfYear, yearOf } from './scenarios/index.js';
import type { Colony, GameState, LandState, Tile } from './types.js';
import { colonyList } from './unitindex.js';

/** The side of a region in tiles when the scenario has hard years but no land health. */
const DEFAULT_REGION_SIZE = 8;

/** The land's regions for a new game, or undefined when the scenario has neither hard years nor land health. */
export function newLandState(s: GameState): LandState | undefined {
  const m = mechanicsOf(s);
  if (!m.hardYears && !m.landHealth) return undefined;
  const size = m.landHealth ? m.landHealth.regionSize : DEFAULT_REGION_SIZE;
  const cols = Math.ceil(s.map.width / size);
  const count = cols * Math.ceil(s.map.height / size);
  const land: LandState = { size, cols };
  if (m.landHealth) {
    land.health = new Array<number>(count).fill(100);
    land.taken = new Array<number>(count).fill(0);
  }
  if (m.hardYears) land.hard = [];
  return land;
}

/** Sets the land up at the start of a game (game.ts): the regions and the first year's hard years. */
export function initLand(s: GameState): void {
  const land = newLandState(s);
  if (!land) return;
  s.land = land;
  drawHardYears(s, yearOf(s.turn, calendarOf(s)).year);
}

/** Number of regions. */
export function regionCount(land: LandState, s: GameState): number {
  return land.cols * Math.ceil(s.map.height / land.size);
}

/** The region a tile lies in. */
export function regionOf(land: LandState, x: number, y: number): number {
  return Math.floor(y / land.size) * land.cols + Math.floor(x / land.size);
}

/** Whether a region has a hard year this year. */
export function isHardYear(s: GameState, region: number): boolean {
  return !!s.land?.hard?.includes(region);
}

/** A region's health, 0–100 (100 without land health). */
export function regionHealth(s: GameState, region: number): number {
  return s.land?.health?.[region] ?? 100;
}

/** The share of fur and game yields a region gives at its health (`floor` at the least). */
export function healthFactor(s: GameState, region: number): number {
  const rules = mechanicsOf(s).landHealth;
  if (!rules) return 1;
  return Math.max(rules.floor, regionHealth(s, region) / 100);
}

/**
 * What a tile's yield of a good becomes this year on the land (`amount`, a worker's or a town
 * centre's): game and furs scaled by the region's health, food halved in a hard year. The amount
 * itself when the game has no land state.
 */
export function landAdjusted(s: GameState, tile: Tile, x: number, y: number, good: GoodId, amount: number): number {
  const land = s.land;
  if (!land || amount <= 0 || (good !== 'food' && good !== 'furs')) return amount;
  const region = regionOf(land, x, y);
  let f = 1;
  if (land.health && wayOf(tile, good, peopleEconomyOf(s).gardens) === 'hunting') f *= healthFactor(s, region);
  if (good === 'food' && land.hard?.includes(region)) f *= 0.5;
  return f === 1 ? amount : Math.round(amount * f);
}

/** Counts furs and game taken at a tile this year (land health only). */
export function noteTaken(s: GameState, tile: Tile, x: number, y: number, good: GoodId, amount: number): void {
  const land = s.land;
  if (!land?.taken || amount <= 0) return;
  if (wayOf(tile, good, peopleEconomyOf(s).gardens) !== 'hunting') return;
  land.taken[regionOf(land, x, y)] += amount;
}

/** Furs a settlement gathers on its land, scaled by its region's health and counted as taken (natives.ts). */
export function settlementFurs(s: GameState, x: number, y: number, amount: number): number {
  const land = s.land;
  if (!land?.taken || amount <= 0) return amount;
  const region = regionOf(land, x, y);
  const n = Math.round(amount * healthFactor(s, region));
  land.taken[region] += n;
  return n;
}

/**
 * Once a round, after the players (turn.ts): on the last round of a year, wears or renews each
 * region's health by what was taken in it, and draws the coming year's hard years.
 */
export function processLand(s: GameState): void {
  const land = s.land;
  if (!land) return;
  const cal = calendarOf(s);
  const year = yearOf(s.turn, cal).year;
  const next = yearOf(s.turn + 1, cal).year;
  if (next === year) return;
  const rules = mechanicsOf(s).landHealth;
  if (rules && land.health && land.taken) {
    for (let r = 0; r < land.health.length; r++) {
      const taken = land.taken[r];
      const h = land.health[r];
      land.health[r] = taken > rules.renewal ? Math.max(0, h - (taken - rules.renewal)) : Math.min(100, h + rules.recovery);
      land.taken[r] = 0;
    }
  }
  drawHardYears(s, next);
}

/** Draws a year's hard years and tells the players with towns or colonies in a hard region. */
function drawHardYears(s: GameState, year: number): void {
  const land = s.land;
  const rules = mechanicsOf(s).hardYears;
  if (!land || !rules) return;
  const hard: number[] = [];
  const count = regionCount(land, s);
  for (let r = 0; r < count; r++) if (regionRandom(s, r, `hard|${year}`) < rules.chance) hard.push(r);
  land.hard = hard;
  if (!hard.length) return;
  // One message per player, naming its towns or colonies in hard regions.
  const struck = new Map<string, Colony[]>();
  for (const c of colonyList(s)) {
    if (!hard.includes(regionOf(land, c.x, c.y))) continue;
    const list = struck.get(c.owner);
    if (list) list.push(c);
    else struck.set(c.owner, [c]);
  }
  for (const [owner, list] of struck) {
    const names = list.map((c) => c.name).join(', ');
    message(s, `A hard year around ${names}: the harvests fail and fish and game are scarce. Food yields there are halved this year.`, owner as Colony['owner'], list[0]);
  }
}

/** Turns in the year a turn falls in (1, 2 or 4). */
export function turnsInYear(s: GameState, turn = s.turn): number {
  const cal = calendarOf(s);
  const year = yearOf(turn, cal).year;
  return turnOfYear(year + 1, cal) - turnOfYear(year, cal);
}

/** The land's health in words, for a region (the people's player sees it, T10). */
export function healthWords(health: number): string {
  if (health >= 90) return 'whole';
  if (health >= 70) return 'thinning';
  if (health >= 40) return 'worn';
  return 'emptied';
}
