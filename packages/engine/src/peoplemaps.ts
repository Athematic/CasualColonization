/**
 * Peoples share their maps when they meet (docs/design/native-nations.md section 16; Beta 3 step
 * 10b, Simon's answer to step 10's third question). Scenario data: `mechanics.mapKnowledge.share`.
 *
 * - **Who:** a playing people and each people it has met (its standing record is written on first
 *   contact, peoplediplomacy.ts). Two playing peoples each give the other all they have explored; a
 *   people nobody plays gives the playing people its homeland, the land within `homeland` tiles of
 *   its settlements (it has no map of its own in the game). European nations neither give nor get.
 * - **Not with an enemy:** not while either side is at war with the other or holds it hostile after
 *   a broken treaty (`hostileUntil`), while either is a computer people whose profile keeps its maps
 *   (Combative, `PeopleProfile.shareMaps`), or while either is at war with one of the other's allies
 *   (its partners in a mutual defence pact or a league). A pair kept apart shares once it may.
 * - **When:** at the round's first contacts (peoplediplomacy.ts `processPeopleDiplomacy`), and again
 *   every `every` years while they may (absent: once). The turn is kept on the pair's standing record
 *   (`PeopleRelation.maps`).
 *
 * With `mechanics.mapKnowledge.seen`, what is shared is also land the people now knows (moves on as
 * along a river, movement.ts `knownLand`). Nothing here runs without a playing people or without
 * the scenario's `mapKnowledge`, so the Americas and the Caribbean are untouched.
 */
import { peopleProfileOf } from './ai/profiles.js';
import { gridOf } from './grid.js';
import { pairAtWar, playingPeople, sideName, standingOf } from './peoplediplomacy.js';
import { message } from './queries.js';
import type { PlayerId } from './rules/nations.js';
import { calendarOf, mechanicsOf, yearValue } from './scenarios/index.js';
import { track } from './telemetry.js';
import type { GameState, Player } from './types.js';

/** Treaty kinds that make two sides allies here: a mutual defence pact, a league, a European alliance. */
const ALLYING = new Set(['defence', 'league', 'alliance']);

/** The sides bound to `id` by a treaty in force that makes them allies. */
export function alliesOfSide(s: GameState, id: PlayerId): PlayerId[] {
  const out: PlayerId[] = [];
  for (const t of s.treaties ?? []) {
    if (t.end || !ALLYING.has(t.kind) || !t.parties.some((p) => p.id === id)) continue;
    for (const p of t.parties) if (p.id !== id && !out.includes(p.id)) out.push(p.id);
  }
  return out;
}

/** Why two sides do not share their maps now, or undefined when they may. */
export function mapSharingBar(s: GameState, a: PlayerId, b: PlayerId): string | undefined {
  if (pairAtWar(s, a, b)) return 'at war';
  const rel = standingOf(s, a, b);
  if (rel?.hostileUntil !== undefined && s.turn < rel.hostileUntil) return 'hostile';
  for (const id of [a, b]) if (peopleProfileOf(s.players, id)?.shareMaps === false) return 'keeps its maps';
  for (const ally of alliesOfSide(s, a)) if (ally !== b && pairAtWar(s, b, ally)) return 'at war with an ally';
  for (const ally of alliesOfSide(s, b)) if (ally !== a && pairAtWar(s, a, ally)) return 'at war with an ally';
  return undefined;
}

/** Marks the tiles (map indices) on `to`'s map; returns how many were new. */
function addToMap(to: Player, tiles: Iterable<number>): number {
  let n = 0;
  for (const i of tiles) {
    if (to.explored[i] === 1) continue;
    to.explored[i] = 1;
    n++;
  }
  return n;
}

function* exploredTiles(p: Player): Iterable<number> {
  const e = p.explored;
  for (let i = 0; i < e.length; i++) if (e[i] === 1) yield i;
}

/** The homeland of a people nobody plays: the tiles within `radius` of its settlements. */
function homelandTiles(s: GameState, people: PlayerId, radius: number): number[] {
  const grid = gridOf(s);
  const w = s.map.width;
  const out = new Set<number>();
  for (const k in s.settlements) {
    const st = s.settlements[k];
    if (st.tribe !== people) continue;
    for (const q of grid.tilesWithin(s.map, st.x, st.y, radius)) out.add(q.y * w + q.x);
  }
  return [...out];
}

function tell(s: GameState, p: Player, text: string, n: number): void {
  track(p.id, 'explore:maps shared');
  if (p.human && n > 0) message(s, `${text} ${n} tile${n === 1 ? '' : 's'} added to your map.`, p.id);
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Once a round, in a game with a playing people and `mechanics.mapKnowledge.share`: each playing
 * people shares maps with each people it has met, where it may and when it is due.
 */
export function shareMaps(s: GameState): void {
  const rules = mechanicsOf(s).mapKnowledge;
  if (!rules || !rules.share) return;
  const { homeland, every } = rules.share;
  const cal = calendarOf(s);
  const done = new Set<string>();
  for (const p of s.players) {
    if (p.kind !== 'people') continue;
    const others: PlayerId[] = [];
    for (const o of s.players) if (o.id !== p.id && o.kind === 'people') others.push(o.id);
    for (const t of s.tribes) if (t.id !== p.id && !others.includes(t.id)) others.push(t.id);
    for (const other of others) {
      const key = p.id < other ? `${p.id} ${other}` : `${other} ${p.id}`;
      if (done.has(key)) continue;
      done.add(key);
      const rel = standingOf(s, p.id, other);
      if (!rel) continue;
      if (rel.maps !== undefined && (every === undefined || yearValue(s.turn, cal) - yearValue(rel.maps, cal) < every)) continue;
      if (mapSharingBar(s, p.id, other)) continue;
      rel.maps = s.turn;
      const q = playingPeople(s, other);
      if (q) {
        // Two playing peoples: each gives the other all it has explored (what each knew before).
        const fromP = [...exploredTiles(p)];
        const fromQ = [...exploredTiles(q)];
        tell(s, p, `You and ${sideName(s, other)} share what you know of the land:`, addToMap(p, fromQ));
        tell(s, q, `You and ${sideName(s, p.id)} share what you know of the land:`, addToMap(q, fromP));
      } else {
        tell(s, p, `${cap(sideName(s, other))} share what they know of their land:`, addToMap(p, homelandTiles(s, other, homeland)));
      }
    }
  }
}
