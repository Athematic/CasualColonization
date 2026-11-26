/**
 * Arrivals (native-nations.md T18, Beta 3 step 6): a European nation whose scenario entry has
 * `arrives` (a year) is not in the game until the first turn of that year. Until then it has no
 * player record, so no units, colonies, turns or diplomacy, and nothing on the map knows it; its
 * entry point is given at setup as if it were there from the start. At the start of its year's
 * first round it enters as nations enter at setup (game.ts `enterNation`: its expedition at its
 * entry point, its computer level or its person), in its place in the turn order among the
 * nations, and plays that round.
 *
 * Scenarios without `arrives` write nothing (`GameState.arrivals` stays missing), so the Americas
 * and the Caribbean are unchanged.
 */
import { enterNation } from './game.js';
import { gridOf } from './grid.js';
import { message, unitsAt } from './queries.js';
import { relation } from './relations.js';
import type { NationId, PlayerId } from './rules/nations.js';
import { TERRAIN } from './rules/terrain.js';
import { calendarOf, formatDate, nationEntry, nationOf, scenarioOf, term } from './scenarios/index.js';
import { lastTurn, turnOfYear } from './scenarios/calendar.js';
import type { GameState, PendingArrival } from './types.js';
import { yetToArrive } from './presence.js';
import { colonyTiles } from './unitindex.js';

/**
 * The nations of a new game that arrive after its first turn, first to arrive first (ties in the
 * order chosen), with the entry points setup gave them; undefined when every nation is there from
 * the start. Throws for a nation that would arrive after the game ends, or when nobody at all would
 * be in the game at its start.
 */
export function laterArrivals(s: GameState, entries: readonly { x: number; y: number }[]): PendingArrival[] | undefined {
  const scenario = scenarioOf(s);
  const cal = calendarOf(s);
  const list: PendingArrival[] = [];
  s.config.nations.forEach((nation, i) => {
    const year = nationEntry(scenario, s.config.rivals, nation)?.arrives;
    if (year === undefined) return;
    const turn = turnOfYear(year, cal);
    if (turn <= s.turn) return;
    if (turn > lastTurn(cal)) throw new Error(`${nationOf(s, nation).name} would arrive in ${year}, after the game ends.`);
    list.push({ nation, turn, entry: { x: entries[i].x, y: entries[i].y } });
  });
  if (!list.length) return undefined;
  if (list.length === s.config.nations.length && !s.config.peoples?.length) {
    throw new Error(`Nobody is in the game in ${formatDate(s.turn, cal)}: every nation arrives later and no people plays.`);
  }
  // Array.prototype.sort is stable: ties keep the order chosen.
  return list.sort((a, b) => a.turn - b.turn);
}

/**
 * At the start of a round (turn.ts `advance`, after the year turns): the nations whose year has
 * come enter the game, each in its place among the nations, before the round's first turn. Their
 * relations with the nations already there start now, at peace. Everyone else hears of it.
 */
export function processArrivals(s: GameState): void {
  const pending = s.arrivals;
  if (!pending) return;
  const due = pending.filter((a) => a.turn <= s.turn);
  if (!due.length) return;
  const left = pending.filter((a) => a.turn > s.turn);
  if (left.length) s.arrivals = left;
  else delete s.arrivals;
  for (const a of due) {
    for (const other of s.config.nations) {
      if (other === a.nation || yetToArrive(s, other) || !s.players.some((p) => p.id === other)) continue;
      relation(s, a.nation, other).peaceSince = s.turn;
    }
    const entry = freeEntry(s, a.entry, a.nation);
    const heading = entry.x < s.map.width / 2 ? 'east' : 'west';
    for (const p of s.players) message(s, term(s, 'arrival.news', { nation: nationOf(s, a.nation).name }), p.id);
    enterNation(s, a.nation, entry, heading, turnOrderPlace(s, a.nation));
  }
}

/**
 * Where an arriving nation takes its turns: among the nations in the order chosen, before any
 * later nation and before the players who come after the nations (playing peoples, companies, the
 * Crown). Arrivals happen at a round's start (`s.current` 0), so the round plays it in its place.
 */
function turnOrderPlace(s: GameState, nation: NationId): number {
  const order: readonly PlayerId[] = s.config.nations;
  const mine = order.indexOf(nation);
  const at = s.players.findIndex((p) => {
    const i = order.indexOf(p.id);
    return i < 0 || i > mine;
  });
  return at < 0 ? s.players.length : at;
}

/**
 * Its entry point, or when another player's unit or colony is there the nearest open water with
 * nobody on it (rings outwards, row by row), so the expedition never shares a tile with strangers.
 */
function freeEntry(s: GameState, entry: { x: number; y: number }, nation: NationId): { x: number; y: number } {
  const colonies = colonyTiles(s);
  const w = s.map.width;
  const open = (x: number, y: number) => {
    const t = s.map.tiles[y * w + x];
    return !!t && TERRAIN[t.t].water && !colonies.has(y * w + x) && unitsAt(s, x, y).every((u) => u.owner === nation);
  };
  if (open(entry.x, entry.y)) return entry;
  const grid = gridOf(s);
  for (let r = 1; r <= 6; r++) {
    const spot = grid.tilesWithin(s.map, entry.x, entry.y, r).find((p) => grid.distance(p.x, p.y, entry.x, entry.y) === r && open(p.x, p.y));
    if (spot) return { x: spot.x, y: spot.y };
  }
  return entry;
}
