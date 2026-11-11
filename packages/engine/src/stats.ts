/**
 * Progress statistics: one compact snapshot per European nation at the end of every round,
 * for the Progress Graphs. Snapshots are recorded by the turn pipeline, so head starts and
 * computer-only games record too. Older saves have no history and start recording on load.
 */
import { sonsOfLiberty } from './production.js';
import type { GoodId } from './rules/goods.js';
import type { PlayerId } from './rules/nations.js';
import { TERRAIN } from './rules/terrain.js';
import { ROLES, UNIT_TYPES } from './rules/units.js';
import { score } from './score.js';
import type { GameState, StatsHistory } from './types.js';
import { goodsOf } from './scenarios/index.js';
import { colonyList, unitList } from './unitindex.js';

/** What each snapshot holds, in order. Per-turn values are rates; the rest are levels. */
export const STAT_KEYS = [
  'score',
  'gold',
  'colonies',
  'population',
  'rebels',
  'bells',
  'crosses',
  'fathers',
  'military',
  'ships',
  'holds',
  'production',
  'trade',
  'tax',
  'tension',
  'explored',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** Names and descriptions of the statistics; `{…}` are the scenario's terms (`withTerms(s, text)`). */
export const STAT_INFO: Record<StatKey, { name: string; description: string; perTurn?: boolean; percent?: boolean }> = {
  score: { name: 'Score', description: 'Score as it would be counted at the end of the game: colonists, experts at work, buildings, production, liberty, {members}, wealth, peace and cooperation, and treaties with native peoples where the scenario counts them. Saves from before version 0.7 keep the old formula’s numbers for turns already recorded.' },
  gold: { name: 'Gold', description: 'Gold in the treasury.' },
  colonies: { name: 'Colonies', description: 'Colonies held.' },
  population: { name: 'Colonists', description: 'Colonists living and working in colonies.' },
  rebels: { name: 'Rebels', description: 'Share of colonists who support independence.', percent: true },
  bells: { name: 'Liberty bells', description: 'Liberty bells rung since the start of the game.' },
  crosses: { name: 'Crosses', description: 'Crosses produced per turn.', perTurn: true },
  fathers: { name: '{Members}', description: 'Members of the {council}.' },
  military: { name: 'Military strength', description: 'Combined attack strength of soldiers, dragoons and artillery.' },
  ships: { name: 'Ships', description: 'Ships in the fleet.' },
  holds: { name: 'Naval tonnage', description: 'Cargo holds across the whole fleet.' },
  production: { name: 'Goods produced', description: 'Goods produced per turn in all colonies (food excluded).', perTurn: true },
  trade: { name: 'Trade income', description: 'Gold earned per turn by selling goods in {homeland}, through custom houses and to natives.', perTurn: true },
  tax: { name: 'Tax rate', description: '{Crown}’s tax rate.', percent: true },
  tension: { name: 'Native tension', description: 'Average tension of the native settlements met (0 content, 1000 furious).' },
  explored: { name: 'Land explored', description: 'Share of {colonyLand}’s land explored.', percent: true },
};

/** History is thinned (every other snapshot dropped) beyond this, for games played on past 1850. */
export const MAX_SNAPSHOTS = 800;

function emptyStats(): StatsHistory {
  return { keys: [...STAT_KEYS], turns: [], data: {} };
}

/**
 * Snapshots are stored as differences from the nation's previous snapshot (the first one as
 * is), which keeps most numbers to one or two digits in the save.
 */
function decode(flat: number[], width: number, count: number): number[][] {
  const rows: number[][] = [];
  const last = new Array(width).fill(0);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < width; j++) last[j] += flat[i * width + j] ?? 0;
    rows.push([...last]);
  }
  return rows;
}

function encode(rows: number[][]): number[] {
  const out: number[] = [];
  rows.forEach((row, i) => row.forEach((v, j) => out.push(i ? v - rows[i - 1][j] : v)));
  return out;
}

/** The state's history in the current key layout, created when missing (older saves). */
function ensureStats(s: GameState): StatsHistory {
  const st = (s.stats ??= emptyStats());
  if (st.keys.length !== STAT_KEYS.length || st.keys.some((k, i) => k !== STAT_KEYS[i])) {
    // A save from a version with other metrics: move each known metric to its new column.
    const map = STAT_KEYS.map((k) => st.keys.indexOf(k));
    for (const [nation, flat] of Object.entries(st.data) as [PlayerId, number[]][]) {
      const rows = decode(flat, st.keys.length, st.turns.length);
      st.data[nation] = encode(rows.map((row) => map.map((j) => (j < 0 ? 0 : row[j]))));
    }
    st.keys = [...STAT_KEYS];
  }
  return st;
}

type Flow = 'trade' | 'production' | 'crosses';

function note(s: GameState, nation: PlayerId, flow: Flow, amount: number): void {
  if (amount <= 0) return;
  const acc = (ensureStats(s).flows ??= {});
  const row = (acc[nation] ??= {});
  row[flow] = (row[flow] ?? 0) + amount;
}

/** Notes gold a nation earned by trade; counted into the next snapshot. */
export function noteTrade(s: GameState, nation: PlayerId, gold: number): void {
  note(s, nation, 'trade', gold);
}

/** Notes a colony's production for the turn (goods except food, and crosses). */
export function noteProduction(s: GameState, nation: PlayerId, produced: Partial<Record<GoodId | 'crosses', number>>): void {
  let goods = 0;
  for (const g of goodsOf(s)) if (g !== 'food') goods += produced[g] ?? 0;
  note(s, nation, 'production', goods);
  note(s, nation, 'crosses', produced.crosses ?? 0);
}

/** Figures shared by every nation's snapshot, gathered in one pass over the units. */
export interface StatsCensus {
  land: number;
  pop: Map<string, number>;
  forces: Map<PlayerId, { military: number; ships: number; holds: number }>;
}

function census(s: GameState): StatsCensus {
  let land = 0;
  for (const t of s.map.tiles) if (!TERRAIN[t.t].water) land++;
  const pop = new Map<string, number>();
  const forces = new Map<PlayerId, { military: number; ships: number; holds: number }>();
  for (const u of unitList(s)) {
    if (u.loc.kind === 'colony') pop.set(u.loc.colonyId, (pop.get(u.loc.colonyId) ?? 0) + 1);
    let f = forces.get(u.owner);
    if (!f) forces.set(u.owner, (f = { military: 0, ships: 0, holds: 0 }));
    const def = UNIT_TYPES[u.type];
    if (def.kind === 'ship') {
      f.ships++;
      f.holds += def.cargo;
    } else {
      f.military += def.kind === 'colonist' ? ROLES[u.role].offence : def.offence;
    }
  }
  return { land, pop, forces };
}

/** The current values of every statistic for one nation (flows count since the last snapshot). */
export function statsSnapshot(s: GameState, nation: PlayerId, c: StatsCensus = census(s)): Record<StatKey, number> {
  const p = s.players.find((x) => x.id === nation)!;
  let colonies = 0;
  let population = 0;
  let rebels = 0;
  for (const col of colonyList(s)) {
    if (col.owner !== nation) continue;
    const n = c.pop.get(col.id) ?? 0;
    colonies++;
    population += n;
    rebels += (n * sonsOfLiberty(s, col, n)) / 100;
  }
  let met = 0;
  let tension = 0;
  for (const st of Object.values(s.settlements)) {
    if (p.explored[st.y * s.map.width + st.x] !== 1) continue;
    met++;
    tension += st.tension[nation] ?? 0;
  }
  let explored = 0;
  const tiles = s.map.tiles;
  for (let i = 0; i < tiles.length; i++) if (p.explored[i] === 1 && !TERRAIN[tiles[i].t].water) explored++;
  const forces = c.forces.get(nation) ?? { military: 0, ships: 0, holds: 0 };
  const flows = s.stats?.flows?.[nation] ?? {};
  return {
    score: score(s, p),
    gold: p.gold,
    colonies,
    population,
    rebels: population ? Math.round((rebels / population) * 100) : 0,
    bells: p.bells,
    crosses: flows.crosses ?? 0,
    fathers: p.fathers.length,
    military: Math.round(forces.military),
    ships: forces.ships,
    holds: forces.holds,
    production: flows.production ?? 0,
    trade: flows.trade ?? 0,
    tax: p.tax,
    tension: met ? Math.round(tension / met) : 0,
    explored: c.land ? Math.round((explored / c.land) * 100) : 0,
  };
}

/**
 * Average goods produced per turn (food excluded) over the last `turns` recorded snapshots plus
 * the turn in progress; 0 before anything is recorded. Used by the score.
 */
export function recentProduction(s: GameState, nation: PlayerId, turns: number): number {
  const st = s.stats;
  const j = st ? st.keys.indexOf('production') : -1;
  const samples: number[] = [];
  if (st && j >= 0) {
    const flat = st.data[nation];
    const width = st.keys.length;
    if (flat) {
      let v = 0;
      for (let i = 0; i < st.turns.length; i++) {
        v += flat[i * width + j] ?? 0;
        samples.push(v);
      }
    }
  }
  const now = st?.flows?.[nation]?.production;
  if (now !== undefined) samples.push(now);
  const recent = samples.slice(-turns);
  return recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
}

/**
 * Each nation's column sums (its values at the last snapshot) by history array, as recordStats
 * left them: valid while the array has the length it had then (only recordStats appends to it;
 * thinning, loading and old saves give new arrays). Beside the state, so saves are unchanged.
 */
const columnSums = new WeakMap<number[], { length: number; sums: number[] }>();

/** Records one snapshot per European nation for the current turn. Called once per round. */
export function recordStats(s: GameState): void {
  const st = ensureStats(s);
  if (st.turns[st.turns.length - 1] === s.turn) return;
  const c = census(s);
  const index = st.turns.length;
  const width = STAT_KEYS.length;
  for (const p of s.players) {
    if (p.id === 'crown') continue;
    const row = statsSnapshot(s, p.id, c);
    // A nation without earlier rows (it joined later) is padded with zeros.
    const flat = (st.data[p.id] ??= new Array(index * width).fill(0));
    // The previous values: each column's sum, added up row by row. The sums kept from the last
    // call go on with the same additions in the same order, so they are the very same numbers.
    const known = columnSums.get(flat);
    let prev: number[];
    if (known && known.length === flat.length) prev = known.sums;
    else {
      prev = new Array(width).fill(0);
      for (let i = 0; i < flat.length; i++) prev[i % width] += flat[i];
    }
    const sums = prev.slice();
    STAT_KEYS.forEach((k, j) => {
      const delta = row[k] - prev[j];
      flat.push(delta);
      sums[j] += delta;
    });
    columnSums.set(flat, { length: flat.length, sums });
  }
  st.turns.push(s.turn);
  delete st.flows;
  if (st.turns.length > MAX_SNAPSHOTS) thin(st);
}

function thin(st: StatsHistory): void {
  const keep = (_: unknown, i: number) => i % 2 === 0 || i === st.turns.length - 1;
  for (const [nation, flat] of Object.entries(st.data) as [PlayerId, number[]][]) {
    st.data[nation] = encode(decode(flat, STAT_KEYS.length, st.turns.length).filter(keep));
  }
  st.turns = st.turns.filter(keep);
}

export interface StatsSeries {
  /** Turn of each snapshot (see formatDate). */
  turns: number[];
  /** Nations with a history, in turn order. */
  nations: PlayerId[];
  /** Values per nation and statistic, aligned with turns. */
  series: Partial<Record<PlayerId, Record<StatKey, number[]>>>;
}

/** The recorded history, decoded into one array per nation and statistic. Empty for old saves. */
export function statsHistory(s: GameState): StatsSeries {
  const st = s.stats;
  const out: StatsSeries = { turns: st ? [...st.turns] : [], nations: [], series: {} };
  if (!st) return out;
  for (const p of s.players) {
    const flat = st.data[p.id];
    if (!flat) continue;
    const decoded = decode(flat, st.keys.length, st.turns.length);
    const rows = {} as Record<StatKey, number[]>;
    for (const key of STAT_KEYS) {
      const j = st.keys.indexOf(key);
      rows[key] = decoded.map((row) => (j < 0 ? 0 : row[j]));
    }
    out.nations.push(p.id);
    out.series[p.id] = rows;
  }
  return out;
}
