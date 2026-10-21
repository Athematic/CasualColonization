/**
 * Progress statistics: one compact snapshot per European nation at the end of every round,
 * for the Progress Graphs. Snapshots are recorded by the turn pipeline, so head starts and
 * computer-only games record too. Older saves have no history and start recording on load.
 */
import { sonsOfLiberty } from './production.js';
import { GOODS, type GoodId } from './rules/goods.js';
import type { NationId } from './rules/nations.js';
import { TERRAIN } from './rules/terrain.js';
import { ROLES, UNIT_TYPES } from './rules/units.js';
import { score } from './score.js';
import type { GameState, StatsHistory } from './types.js';

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

export const STAT_INFO: Record<StatKey, { name: string; description: string; perTurn?: boolean; percent?: boolean }> = {
  score: { name: 'Score', description: 'Score as it would be counted at the end of the game.' },
  gold: { name: 'Gold', description: 'Gold in the treasury.' },
  colonies: { name: 'Colonies', description: 'Colonies held.' },
  population: { name: 'Colonists', description: 'Colonists living and working in colonies.' },
  rebels: { name: 'Rebels', description: 'Share of colonists who support independence.', percent: true },
  bells: { name: 'Liberty bells', description: 'Liberty bells rung since the start of the game.' },
  crosses: { name: 'Crosses', description: 'Crosses produced per turn.', perTurn: true },
  fathers: { name: 'Founding Fathers', description: 'Members of the Continental Congress.' },
  military: { name: 'Military strength', description: 'Combined attack strength of soldiers, dragoons and artillery.' },
  ships: { name: 'Ships', description: 'Ships in the fleet.' },
  holds: { name: 'Naval tonnage', description: 'Cargo holds across the whole fleet.' },
  production: { name: 'Goods produced', description: 'Goods produced per turn in all colonies (food excluded).', perTurn: true },
  trade: { name: 'Trade income', description: 'Gold earned per turn by selling goods in Europe, through custom houses and to natives.', perTurn: true },
  tax: { name: 'Tax rate', description: 'The Crown’s tax rate.', percent: true },
  tension: { name: 'Native tension', description: 'Average tension of the native settlements met (0 content, 1000 furious).' },
  explored: { name: 'Land explored', description: 'Share of the New World’s land explored.', percent: true },
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
    for (const [nation, flat] of Object.entries(st.data) as [NationId, number[]][]) {
      const rows = decode(flat, st.keys.length, st.turns.length);
      st.data[nation] = encode(rows.map((row) => map.map((j) => (j < 0 ? 0 : row[j]))));
    }
    st.keys = [...STAT_KEYS];
  }
  return st;
}

type Flow = 'trade' | 'production' | 'crosses';

function note(s: GameState, nation: NationId, flow: Flow, amount: number): void {
  if (amount <= 0) return;
  const acc = (ensureStats(s).flows ??= {});
  const row = (acc[nation] ??= {});
  row[flow] = (row[flow] ?? 0) + amount;
}

/** Notes gold a nation earned by trade; counted into the next snapshot. */
export function noteTrade(s: GameState, nation: NationId, gold: number): void {
  note(s, nation, 'trade', gold);
}

/** Notes a colony's production for the turn (goods except food, and crosses). */
export function noteProduction(s: GameState, nation: NationId, produced: Partial<Record<GoodId | 'crosses', number>>): void {
  let goods = 0;
  for (const g of GOODS) if (g !== 'food') goods += produced[g] ?? 0;
  note(s, nation, 'production', goods);
  note(s, nation, 'crosses', produced.crosses ?? 0);
}

/** Figures shared by every nation's snapshot, gathered in one pass over the units. */
export interface StatsCensus {
  land: number;
  pop: Map<string, number>;
  forces: Map<NationId, { military: number; ships: number; holds: number }>;
}

function census(s: GameState): StatsCensus {
  let land = 0;
  for (const t of s.map.tiles) if (!TERRAIN[t.t].water) land++;
  const pop = new Map<string, number>();
  const forces = new Map<NationId, { military: number; ships: number; holds: number }>();
  for (const id in s.units) {
    const u = s.units[id];
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
export function statsSnapshot(s: GameState, nation: NationId, c: StatsCensus = census(s)): Record<StatKey, number> {
  const p = s.players.find((x) => x.id === nation)!;
  let colonies = 0;
  let population = 0;
  let rebels = 0;
  for (const col of Object.values(s.colonies)) {
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
    const prev = new Array(width).fill(0);
    for (let i = 0; i < flat.length; i++) prev[i % width] += flat[i];
    STAT_KEYS.forEach((k, j) => flat.push(row[k] - prev[j]));
  }
  st.turns.push(s.turn);
  delete st.flows;
  if (st.turns.length > MAX_SNAPSHOTS) thin(st);
}

function thin(st: StatsHistory): void {
  const keep = (_: unknown, i: number) => i % 2 === 0 || i === st.turns.length - 1;
  for (const [nation, flat] of Object.entries(st.data) as [NationId, number[]][]) {
    st.data[nation] = encode(decode(flat, STAT_KEYS.length, st.turns.length).filter(keep));
  }
  st.turns = st.turns.filter(keep);
}

export interface StatsSeries {
  /** Turn of each snapshot (see formatDate). */
  turns: number[];
  /** Nations with a history, in turn order. */
  nations: NationId[];
  /** Values per nation and statistic, aligned with turns. */
  series: Partial<Record<NationId, Record<StatKey, number[]>>>;
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
