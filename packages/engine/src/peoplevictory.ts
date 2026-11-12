/**
 * Winning from the people's side (docs/design/native-nations.md, T14 and "T14 in full"; Beta 3
 * step 7). Three peaceful ways, judged at the end year, and the military victory:
 * - **Continuity** (`continuity`): still on its homeland (a town on it, `homelandShare` of it kept,
 *   its regions' health at least `landHealth` where land health is on), as many people as at the
 *   start (`peopleShare`), governed by its own council (not submitted, no town of its own held by
 *   another player, at least `members` council members).
 * - **Confederacy** (`confederacy`): a league of at least `members` peoples (peopleleague.ts), in
 *   force for `years`, its members keeping `homelandShare` of their homelands together. Its playing
 *   members win together; the members nobody plays are named as partners.
 * - **A good life** (`good-life`): every town holding `storeYears` of food, no town hungry for
 *   `hungerYears`, the homeland's health at least `landHealth`, no war for `peaceYears`, no breach
 *   of faith for `faithYears`, and a treaty with `treatyShare` of the nations and peoples met.
 * - **Military** (`military`): once every nation has arrived, every European nation and company
 *   has no colony and no land unit on the map (the Crown counts only while its land units are on
 *   it) for `years` rounds (0: at once): every playing people still in the game wins together.
 *
 * The params are scenario data (the victory entry's `params`), with each people's own over them
 * (`peoples.overrides[id].victory[kind]`). Every rule reads the state only and draws no random
 * numbers. The records they need (`GameState.homelands`, `Player.lastWar`, `lastHunger`,
 * `defeats`) are written only in games with a playing people.
 */
import { kindOfId, playerKind } from './playerkind.js';
import { playingPeople, standingOf, stillThere } from './peoplediplomacy.js';
import { leagueMembers, leagues } from './peopleleague.js';
import { storeCapacity, yearlyNeed } from './peopleeconomy.js';
import { nativeLandOwner } from './natives.js';
import { regionHealth, regionOf } from './land.js';
import type { PlayerId, TribeId } from './rules/nations.js';
import { UNIT_TYPES } from './rules/units.js';
import { calendarOf, mechanicsOf, scenarioOf, yearValue } from './scenarios/index.js';
import type { ContinuityParams, GoodLifeParams } from './scenarios/types.js';
import { treatyEndedBy } from './treaties.js';
import type { Colony, GameState, Player } from './types.js';
import { colonyList, unitList } from './unitindex.js';

// ---------------------------------------------------------------------------
// Params

/** Continuity's defaults (T14). */
export const CONTINUITY: ContinuityParams = { homelandShare: 0.5, landHealth: 40, peopleShare: 1, members: 1 };
/** Confederacy's defaults (T14). */
export const CONFEDERACY = { members: 3, years: 50, homelandShare: 0.5 };
/** A good life's defaults (T14). */
export const GOOD_LIFE: GoodLifeParams = { storeYears: 1, hungerYears: 20, landHealth: 60, peaceYears: 30, faithYears: 30, treatyShare: 0.5 };
/** The military victory's defaults (T14): the rounds every European must stay defeated (0: at once). */
export const MILITARY = { years: 0 };

/**
 * The computer players' targets for peoples (T15), as scenario-overridable defaults
 * (`Scenario.ai.peoples`): measured by tournaments, not enforced by any rule. `militaryWins`: the
 * share of computer-only games won by the military victory, a ceiling (T14: 1 in 100 or fewer).
 */
export const PEOPLE_AI_TARGETS = { militaryWins: 0.01 };

/** The scenario's people targets over the engine's. */
export function peopleAiTargets(s: GameState): typeof PEOPLE_AI_TARGETS {
  return { ...PEOPLE_AI_TARGETS, ...scenarioOf(s).ai.peoples };
}

/**
 * A victory kind's numbers: its defaults, the scenario's `params` over them, and, for one people,
 * that people's own (`peoples.overrides[id].victory[kind]`) over those.
 */
export function victoryParams<T extends { [K in keyof T]: number }>(s: GameState, kind: string, defaults: T, params: Record<string, unknown> = {}, people?: PlayerId): T {
  const own = people ? (scenarioOf(s).peoples.overrides?.[people as TribeId]?.victory as Record<string, Record<string, number | undefined> | undefined> | undefined)?.[kind] : undefined;
  const out = { ...defaults } as Record<string, number>;
  for (const src of [params, own ?? {}]) for (const k in defaults) if (typeof src[k] === 'number') out[k] = src[k] as number;
  return out as T;
}

/** Whole years from `turn` to now. */
function yearsSince(s: GameState, turn: number): number {
  const cal = calendarOf(s);
  return yearValue(s.turn, cal) - yearValue(turn, cal);
}

// ---------------------------------------------------------------------------
// What each people held at the start

/** A people's people: its colonists anywhere (at work in its towns, standing in them, on the map). */
export function peopleCount(s: GameState, id: PlayerId): number {
  let n = 0;
  for (const u of unitList(s)) if (u.owner === id && UNIT_TYPES[u.type].kind === 'colonist') n++;
  return n;
}

/**
 * Records each people's homeland and, for a playing people, its people at setup (game.ts), in
 * games with a playing people only: a playing people's claimed land, the land of the settlements of
 * a people nobody plays (their own tiles and `nativeLandOwner`'s).
 */
export function recordHomelands(s: GameState): void {
  if (!s.players.some((p) => p.kind === 'people')) return;
  const out: NonNullable<GameState['homelands']> = {};
  const { width, tiles } = s.map;
  const owner = (i: number): TribeId | undefined => {
    const t = tiles[i];
    if (t.claim) return s.players.some((p) => p.id === t.claim && p.kind === 'people') ? (t.claim as TribeId) : undefined;
    const x = i % width;
    const y = (i - x) / width;
    for (const k in s.settlements) if (s.settlements[k].x === x && s.settlements[k].y === y) return s.settlements[k].tribe;
    return nativeLandOwner(s, x, y)?.tribe;
  };
  for (let i = 0; i < tiles.length; i++) {
    const id = owner(i);
    if (id) (out[id] ??= { tiles: [] }).tiles.push(i);
  }
  for (const p of s.players) if (p.kind === 'people') (out[p.id as TribeId] ??= { tiles: [] }).people = peopleCount(s, p.id);
  s.homelands = out;
}

/** Whether a tile of a people's homeland is still kept: for a playing people claimed by it or by no one (leased land stays its own); for a people nobody plays, still its settlements' land. */
function keeps(s: GameState, id: PlayerId, i: number): boolean {
  const t = s.map.tiles[i];
  if (playingPeople(s, id)) return !t.claim || t.claim === id;
  if (t.claim) return false;
  const x = i % s.map.width;
  const y = (i - x) / s.map.width;
  for (const k in s.settlements) if (s.settlements[k].x === x && s.settlements[k].y === y) return s.settlements[k].tribe === id;
  return nativeLandOwner(s, x, y)?.tribe === id;
}

/** A people's homeland now: its tiles at the start, and how many it still keeps. */
export function homelandKept(s: GameState, id: PlayerId): { start: number; kept: number } {
  const home = s.homelands?.[id as TribeId]?.tiles ?? [];
  let kept = 0;
  for (const i of home) if (keeps(s, id, i)) kept++;
  return { start: home.length, kept };
}

/** The average health of the regions of a people's homeland (100 without land health). */
export function homelandHealth(s: GameState, id: PlayerId): number {
  const land = s.land;
  if (!land?.health || !mechanicsOf(s).landHealth) return 100;
  const home = s.homelands?.[id as TribeId]?.tiles ?? [];
  const regions = new Set<number>();
  for (const i of home) regions.add(regionOf(land, i % s.map.width, Math.floor(i / s.map.width)));
  if (!regions.size) return 100;
  let sum = 0;
  for (const r of regions) sum += regionHealth(s, r);
  return sum / regions.size;
}

function towns(s: GameState, id: PlayerId): Colony[] {
  return colonyList(s).filter((c) => c.owner === id);
}

/** Whether a people is at war now with any player or people. */
export function atWarNow(s: GameState, id: PlayerId): boolean {
  const p = s.players.find((o) => o.id === id);
  if (p && Object.values(p.stance).includes('war')) return true;
  for (const o of s.players) if (o.stance[id] === 'war') return true;
  for (const t of s.tribes) if (t.stance[id] === 'war') return true;
  return false;
}

/** Once a round, in a game with a playing people (turn.ts): each playing people at war notes the turn (`Player.lastWar`). */
export function notePeopleWars(s: GameState): void {
  for (const p of s.players) if (p.kind === 'people' && atWarNow(s, p.id)) p.lastWar = s.turn;
}

/** A playing people's unit beat a European's, or took a colony (combat.ts): its part in a military victory. */
export function noteDefeat(s: GameState, winner: PlayerId, loser: PlayerId, colony: boolean): void {
  const p = s.players.find((o) => o.id === winner);
  if (!p || p.kind !== 'people' || kindOfId(loser) === 'people') return;
  const d = (p.defeats ??= { units: 0, colonies: 0 });
  if (colony) d.colonies++;
  else d.units++;
}

// ---------------------------------------------------------------------------
// Continuity

export type ContinuityCondition = 'town' | 'homeland' | 'land' | 'people' | 'submitted' | 'towns taken' | 'council';

/** How a playing people stands against continuity now; `fails` is empty when it qualifies. */
export function continuityStanding(s: GameState, id: PlayerId, params: Record<string, unknown> = {}): { fails: ContinuityCondition[]; kept: number; people: number; start: number } {
  const w = victoryParams(s, 'continuity', CONTINUITY, params, id);
  const p = s.players.find((o) => o.id === id)!;
  const fails: ContinuityCondition[] = [];
  const home = new Set(s.homelands?.[id as TribeId]?.tiles ?? []);
  const width = s.map.width;
  if (!towns(s, id).some((c) => home.has(c.y * width + c.x))) fails.push('town');
  const land = homelandKept(s, id);
  const kept = land.start ? land.kept / land.start : 0;
  if (kept < w.homelandShare) fails.push('homeland');
  if (homelandHealth(s, id) < w.landHealth) fails.push('land');
  const people = peopleCount(s, id);
  const start = s.homelands?.[id as TribeId]?.people ?? 0;
  if (people < w.peopleShare * start) fails.push('people');
  if (s.tribes.find((t) => t.id === id)?.submitted?.length) fails.push('submitted');
  if (colonyList(s).some((c) => c.takenFrom === id && c.owner !== id)) fails.push('towns taken');
  if (p.fathers.length < w.members) fails.push('council');
  return { fails, kept, people, start };
}

// ---------------------------------------------------------------------------
// A good life

export type GoodLifeCondition = 'stores' | 'hunger' | 'land' | 'peace' | 'faith' | 'treaties';

/** The nations and peoples a people has met (a standing record written) that are still on the map. */
export function sidesMet(s: GameState, id: PlayerId): PlayerId[] {
  const out: PlayerId[] = [];
  for (const p of s.players) if (p.id !== id && playerKind(p) !== 'crown' && standingOf(s, id, p.id) && stillThere(s, p.id)) out.push(p.id);
  for (const t of s.tribes) if (t.id !== id && !out.includes(t.id) && standingOf(s, id, t.id) && stillThere(s, t.id)) out.push(t.id);
  return out;
}

/** The sides a people holds a treaty with now (any kind, a league included). */
function treatySides(s: GameState, id: PlayerId): Set<PlayerId> {
  const out = new Set<PlayerId>();
  for (const t of s.treaties ?? []) {
    if (t.end || !t.parties.some((p) => p.id === id)) continue;
    for (const p of t.parties) if (p.id !== id) out.add(p.id);
  }
  return out;
}

/** How a playing people stands against a good life now; `fails` is empty when it qualifies. */
export function goodLifeStanding(s: GameState, id: PlayerId, params: Record<string, unknown> = {}): { fails: GoodLifeCondition[]; met: number; partners: number; needed: number } {
  const w = victoryParams(s, 'good-life', GOOD_LIFE, params, id);
  const p = s.players.find((o) => o.id === id)!;
  const fails: GoodLifeCondition[] = [];
  const own = towns(s, id);
  if (!own.length || own.some((c) => c.goods.food < Math.min(storeCapacity(s, c), Math.ceil(w.storeYears * yearlyNeed(s, c))))) fails.push('stores');
  if (p.lastHunger !== undefined && yearsSince(s, p.lastHunger) < w.hungerYears) fails.push('hunger');
  if (homelandHealth(s, id) < w.landHealth) fails.push('land');
  if (atWarNow(s, id) || (p.lastWar !== undefined && yearsSince(s, p.lastWar) < w.peaceYears)) fails.push('peace');
  const broke = (s.treaties ?? []).some((t) => t.end?.why === 'broken' && treatyEndedBy(t)?.id === id && yearsSince(s, t.end.turn) < w.faithYears);
  if (broke) fails.push('faith');
  const met = sidesMet(s, id);
  const sides = treatySides(s, id);
  const partners = met.filter((o) => sides.has(o)).length;
  const needed = Math.max(1, Math.ceil(w.treatyShare * met.length - 1e-9));
  if (partners < needed) fails.push('treaties');
  return { fails, met: met.length, partners, needed };
}

// ---------------------------------------------------------------------------
// Confederacy

/** The leagues that win by confederacy now, each with its playing members and its members nobody plays. */
export function confederacyLeagues(s: GameState, params: Record<string, unknown> = {}): { winners: PlayerId[]; partners: TribeId[] }[] {
  const w = victoryParams(s, 'confederacy', CONFEDERACY, params);
  const out: { winners: PlayerId[]; partners: TribeId[] }[] = [];
  for (const t of leagues(s)) {
    const members = leagueMembers(t);
    if (members.length < w.members || yearsSince(s, t.start) < w.years) continue;
    let start = 0;
    let kept = 0;
    for (const m of members) {
      const h = homelandKept(s, m);
      start += h.start;
      kept += h.kept;
    }
    if (!start || kept / start < w.homelandShare) continue;
    const winners = members.filter((m) => playingPeople(s, m) && stillThere(s, m));
    if (!winners.length) continue;
    out.push({ winners, partners: members.filter((m) => !playingPeople(s, m)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The military victory

/**
 * Whether a European (a nation, a company or the Crown) is still present on the map: a colony or a
 * land unit there (the Crown: land units only). A nation that has never founded a colony is still
 * arriving (its first expedition at sea or exploring), not defeated.
 */
export function europeanPresent(s: GameState, p: Player): boolean {
  const kind = playerKind(p);
  if (kind === 'nation' && !p.coloniesFounded) return true;
  if (kind !== 'crown' && colonyList(s).some((c) => c.owner === p.id)) return true;
  for (const u of unitList(s)) {
    if (u.owner !== p.id || UNIT_TYPES[u.type].kind === 'ship') continue;
    if (u.loc.kind === 'map' || u.loc.kind === 'colony') return true;
  }
  return false;
}

/**
 * Whether every European is defeated now (T14): every nation has arrived, a playing people is in
 * the game, and no nation, company or Crown is present on the map.
 */
export function europeansDefeated(s: GameState): boolean {
  if (s.arrivals) return false;
  let peoples = false;
  let europeans = false;
  for (const p of s.players) {
    const kind = playerKind(p);
    if (kind === 'people') {
      if (stillThere(s, p.id)) peoples = true;
      continue;
    }
    if (kind !== 'crown') europeans = true;
    if (europeanPresent(s, p)) return false;
  }
  return peoples && europeans;
}

/** The playing peoples still in the game, ranked by their part in the war (colonies taken, then European units beaten), then by score. */
export function militaryWinners(s: GameState, scores: Partial<Record<PlayerId, number>>): PlayerId[] {
  const list = s.players.filter((p) => p.kind === 'people' && stillThere(s, p.id));
  return list
    .sort((a, b) => (b.defeats?.colonies ?? 0) - (a.defeats?.colonies ?? 0) || (b.defeats?.units ?? 0) - (a.defeats?.units ?? 0) || (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
    .map((p) => p.id);
}
