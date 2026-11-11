/**
 * Peoples who come to a region, or are no longer found there, during the game (native-nations.md
 * T20; Beta 3 step 8): a stored map's people region with `from` (the Inuit, whose Thule ancestors
 * reached the northern Labrador coast in the 15th century) or `until` (the Dorset in Labrador, the
 * St. Lawrence Iroquoians, whose towns were gone by 1603). At the start of that year the region's
 * settlements are placed, or leave the map. Only peoples nobody plays: a playing people's towns are
 * its player's and stay (its own history from then on).
 *
 * A region with `from` after the game's first year is left out at setup (maps/index.ts
 * `storedWorld`). Scenarios whose regions have neither (the Americas, the Caribbean) never get past
 * the first check, so their games are unchanged.
 *
 * Nothing here names a cause: the sources do not agree on why the Dorset or the St. Lawrence
 * Iroquoians are no longer found (section 13 of the note), and the game does not pretend to know.
 */
import { gridOf } from './grid.js';
import { storedMapEntry } from './maps/index.js';
import { settlementGround, newSettlement } from './mapgen.js';
import { newId } from './queries.js';
import { randInt } from './rng.js';
import { calendarOf, nativeRulesIn, peopleIn, scenarioOf, settlementKindIn, yearOf } from './scenarios/index.js';
import type { PeopleRegion } from './scenarios/types.js';
import type { GameState } from './types.js';
import { colonyList } from './unitindex.js';

/** The people regions of the game's stored map that have a `from` or an `until` year. */
export function peopleMoves(s: GameState): PeopleRegion[] {
  const id = s.config.map;
  if (!id) return [];
  const scenario = scenarioOf(s);
  if (!scenario.map.stored.some((e) => e.id === id)) return [];
  return storedMapEntry(scenario, id).peoples.filter((r) => r.from !== undefined || r.until !== undefined);
}

/**
 * At the start of a round (turn.ts `advance`, after the year turns): in the first round of a year,
 * the people regions whose `until` is this year lose their settlements, then those whose `from` is
 * this year get theirs.
 */
export function processPeopleMoves(s: GameState): void {
  const moves = peopleMoves(s);
  if (!moves.length) return;
  const cal = calendarOf(s);
  const year = yearOf(s.turn, cal).year;
  if (s.turn > 0 && yearOf(s.turn - 1, cal).year === year) return;
  const playing = new Set(s.config.peoples ?? []);
  for (const r of moves) if (r.until === year && !playing.has(r.tribe)) leaveRegion(s, r);
  for (const r of moves) if (r.from === year && !playing.has(r.tribe)) settleRegion(s, r);
}

const inside = (r: PeopleRegion, x: number, y: number) => x >= r.region[0] && x <= r.region[2] && y >= r.region[1] && y <= r.region[3];

/** The region's settlements of its people leave the map, with their braves. */
function leaveRegion(s: GameState, r: PeopleRegion): void {
  for (const st of Object.values(s.settlements)) {
    if (st.tribe !== r.tribe || !inside(r, st.x, st.y)) continue;
    if (s.braves) for (const b of Object.values(s.braves)) if (b.home === st.id) delete s.braves[b.id];
    delete s.settlements[st.id];
  }
}

/**
 * Places the region's settlements (its `count`) on open ground in it: not claimed, not where a
 * unit, colony or settlement stands, the scenario's spacing from every settlement and colony. Drawn
 * from the game's stream, as setup's placement is. The people's first settlement on the map is its
 * capital.
 */
function settleRegion(s: GameState, r: PeopleRegion): void {
  const scenario = scenarioOf(s);
  const grid = gridOf(s);
  const { spacing } = scenario.map.settlements;
  const { width, height, tiles } = s.map;
  const occupied = new Set<number>();
  for (const u of Object.values(s.units)) if (u.loc.kind === 'map') occupied.add(u.loc.y * width + u.loc.x);
  const places = [...Object.values(s.settlements), ...colonyList(s)];
  const list: { x: number; y: number }[] = [];
  for (let y = Math.max(1, r.region[1]); y <= Math.min(height - 2, r.region[3]); y++) {
    for (let x = Math.max(0, r.region[0]); x <= Math.min(width - 1, r.region[2]); x++) {
      const t = tiles[y * width + x];
      if (settlementGround(scenario, t.t) && !t.claim && !occupied.has(y * width + x)) list.push({ x, y });
    }
  }
  const people = peopleIn(scenario, r.tribe);
  const kind = settlementKindIn(scenario, r.tribe);
  const firstBrave = nativeRulesIn(scenario).firstBraveAfter;
  let placed = 0;
  while (placed < r.count && list.length) {
    const c = list.splice(randInt(s, list.length), 1)[0];
    if (places.some((p) => grid.distance(p.x, p.y, c.x, c.y) < spacing)) continue;
    const capital = !Object.values(s.settlements).some((st) => st.tribe === r.tribe);
    const st = newSettlement(s, newId(s, 's'), r.tribe, c.x, c.y, capital, kind, people.skills, firstBrave);
    s.settlements[st.id] = st;
    places.push(st);
    delete tiles[c.y * width + c.x].lcr;
    placed++;
  }
}

