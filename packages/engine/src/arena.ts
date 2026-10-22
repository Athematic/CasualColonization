/**
 * Computer-only games for measuring AI levels against each other. Games are seeded and the
 * engine is deterministic, so a tournament always gives the same result for the same options.
 */
import { AI_LEVEL_INFO, type AiLevel } from './ai/profiles.js';
import { isCheated } from './cheats.js';
import { applyCommand } from './commands.js';
import { endStateFeatures, type FeatureCounts } from './features.js';
import { createGame } from './game.js';
import { colonyWorkers } from './queries.js';
import type { DifficultyId } from './rules/difficulty.js';
import { NATION_ORDER, type NationId } from './rules/nations.js';
import { score } from './score.js';
import { setFeatureSink } from './telemetry.js';
import { royalForce } from './independence.js';
import type { GameState, MapSize, Player } from './types.js';

export interface ArenaOptions {
  games: number;
  /** Stop each game after this turn (the game may end sooner). */
  turns: number;
  mapSize: MapSize;
  /** One nation per entry; list a level twice to field it twice. */
  levels: AiLevel[];
  firstSeed?: number;
  /** Stored map id, if the engine has stored maps. */
  map?: string;
  /** Count how often each nation uses each game feature (see features.ts). Off by default. */
  features?: boolean;
  /**
   * Difficulty level. Arena nations are all computers, which normally play at Conquistador
   * economics, so a level given here applies to every nation (`difficultyForAll`), as if each
   * were a person. Missing means Conquistador, the standard rules.
   */
  difficulty?: DifficultyId;
  /** Computer players make no trade or Favoured Nation proposals (`GameConfig.noFavoured`), to measure what the feature brings. */
  noFavoured?: boolean;
}

/**
 * Relations and trade between the European nations, per nation and game. Counted in every arena
 * game (from a few telemetry events), whether or not the full feature audit runs.
 */
export interface RelationsTally {
  /** Trade agreement and Favoured Nation proposals the nation made. */
  proposals: number;
  /** Trade agreements and Favoured Nation statuses the nation entered. */
  agreements: number;
  favoured: number;
  /** Favoured Nation partners at the end of the game. */
  favouredAtEnd: number;
  /** Favoured Nation statuses the nation cancelled (including by declaring war). */
  cancelled: number;
  /** Gold that changed hands at partners' colonies, over all the nation's relations. */
  volume: number;
  /** Units the nation sold at partners' colonies, and in partners' home ports. */
  foreignStopSales: number;
  partnerPortSales: number;
  /** Triangle trades completed: goods bought in one European port and sold in another. */
  triangles: number;
  /** Wars the nation declared, and how many of them on a trade partner or Favoured Nation. */
  wars: number;
  warsOnPartners: number;
  /** Tax raises the nation refused (boycotting a good). */
  taxRefusals: number;
  /** The King's demands for gold made to the nation, paid and refused (crown.ts). */
  demands: number;
  demandsPaid: number;
  demandsRefused: number;
  /** Wars the King declared for the nation (also counted in `wars`). */
  royalWars: number;
  /** Land units the Crown added to the nation's Royal Expeditionary Force over the game. */
  refAdded: number;
}

const TALLY: Record<string, keyof RelationsTally> = {
  'cmd:proposeTrade': 'proposals',
  'cmd:proposeFavoured': 'proposals',
  'diplomacy:trade agreement made': 'agreements',
  'diplomacy:favoured nation made': 'favoured',
  'diplomacy:favoured nation cancelled': 'cancelled',
  'trade:foreign stop sales': 'foreignStopSales',
  'europe:partner port sales': 'partnerPortSales',
  'trade:triangle trade': 'triangles',
  'diplomacy:war started': 'wars',
  'diplomacy:war on a trade partner': 'warsOnPartners',
  'diplomacy:war on a Favoured Nation': 'warsOnPartners',
  'tax:refused (boycott)': 'taxRefusals',
  'crown:demand made': 'demands',
  'crown:demand paid': 'demandsPaid',
  'crown:demand refused': 'demandsRefused',
  'crown:royal war': 'royalWars',
  'crown:ref units added': 'refAdded',
};

/** Tally keys that add up the amount reported, not the number of reports. */
const AMOUNTS = new Set<keyof RelationsTally>(['foreignStopSales', 'partnerPortSales', 'refAdded']);

function emptyTally(): RelationsTally {
  return { proposals: 0, agreements: 0, favoured: 0, favouredAtEnd: 0, cancelled: 0, volume: 0, foreignStopSales: 0, partnerPortSales: 0, triangles: 0, wars: 0, warsOnPartners: 0, taxRefusals: 0, demands: 0, demandsPaid: 0, demandsRefused: 0, royalWars: 0, refAdded: 0 };
}

export interface ArenaEntry {
  game: number;
  seed: number;
  nation: NationId;
  level: AiLevel;
  score: number;
  colonies: number;
  population: number;
  gold: number;
  fathers: number;
  independence: string;
  /** Units of goods spoiled in full warehouses over the game. */
  spoiled: number;
  /**
   * Land units of the Royal Expeditionary Force: at the declaration for a nation that declared,
   * otherwise at the end; and what the old formula (`royalForce`, sized by colonies) gave then.
   */
  ref?: number;
  refFormula?: number;
  /** Turn of the declaration of independence, if any. */
  declared?: number;
  /** The game was cheated in (arena games never cheat, but standings can come from any state). */
  cheated?: boolean;
  /** Highest score in its game (ties count for all). */
  won: boolean;
  /** Feature uses, when the arena counts them. */
  features?: FeatureCounts;
  /** Relations and trade with the other Europeans (arena games always count them). */
  relations?: RelationsTally;
}

export interface ArenaSummary {
  level: AiLevel;
  entries: number;
  wins: number;
  score: number;
  colonies: number;
  population: number;
  gold: number;
  fathers: number;
  independenceWon: number;
  independenceLost: number;
  spoiled: number;
  /** Entries from cheated games. */
  cheated: number;
  /** Average feature uses per nation per game, when counted. */
  features?: FeatureCounts;
  /** Average relations and trade per nation per game. */
  relations?: RelationsTally;
}

/** Plays one computer-only game and reports every nation's standing at the end. */
export function playArenaGame(
  seed: number,
  line: { nation: NationId; level: AiLevel }[],
  turns: number,
  mapSize: MapSize,
  map?: string,
  features = false,
  difficulty?: DifficultyId,
  noFavoured = false,
): { state: GameState; entries: Omit<ArenaEntry, 'game' | 'won'>[] } {
  const ai = Object.fromEntries(line.map((l) => [l.nation, l.level]));
  const config = {
    seed,
    mapSize,
    nations: line.map((l) => l.nation),
    humans: [],
    ai,
    ...(map ? { map } : {}),
    ...(difficulty ? { difficulty, difficultyForAll: true } : {}),
    ...(noFavoured ? { noFavoured: true } : {}),
  };
  const counts = new Map<string, FeatureCounts>();
  const tallies = new Map<string, RelationsTally>();
  // The sink only counts; it never touches the game, so scores do not depend on it.
  const previous = setFeatureSink((nation, feature, n) => {
    const key = TALLY[feature];
    if (key) {
      let r = tallies.get(nation);
      if (!r) tallies.set(nation, (r = emptyTally()));
      r[key] += AMOUNTS.has(key) ? n : 1;
    }
    if (!features) return;
    let c = counts.get(nation);
    if (!c) counts.set(nation, (c = {}));
    c[feature] = (c[feature] ?? 0) + n;
  });
  let s: GameState;
  try {
    s = createGame(config);
    let guard = turns * 2 + 10;
    while (s.turn < turns && !s.gameOver && guard-- > 0) applyCommand(s, { type: 'endTurn' });
  } finally {
    setFeatureSink(previous);
  }
  const entries = line.map((l) => {
    const e = { ...standing(s, seed, l.nation, l.level), relations: endRelations(s, l.nation, tallies.get(l.nation)) };
    return features ? { ...e, features: { ...counts.get(l.nation), ...endStateFeatures(s, l.nation) } } : e;
  });
  return { state: s, entries };
}

/** A nation's relations tally, completed with the end state: Favoured Nation partners and trade volume. */
function endRelations(s: GameState, nation: NationId, counted?: RelationsTally): RelationsTally {
  const r = { ...(counted ?? emptyTally()) };
  for (const rel of Object.values(s.relations ?? {})) {
    if (rel.a !== nation && rel.b !== nation) continue;
    r.volume += rel.volume;
    if (rel.favoured) r.favouredAtEnd++;
  }
  return r;
}

export function standing(s: GameState, seed: number, nation: NationId, level: AiLevel): Omit<ArenaEntry, 'game' | 'won'> {
  const p = s.players.find((x) => x.id === nation)!;
  const colonies = Object.values(s.colonies).filter((c) => c.owner === nation);
  return {
    seed,
    nation,
    level,
    score: score(s, p),
    colonies: colonies.length,
    population: colonies.reduce((n, c) => n + colonyWorkers(s, c).length, 0),
    gold: p.gold,
    fathers: p.fathers.length,
    independence: p.independence,
    spoiled: p.goodsSpoiled ?? 0,
    ...royalStanding(p, colonies.length),
    ...(isCheated(s) ? { cheated: true } : {}),
  };
}

/** The Royal Expeditionary Force a nation faced: at its declaration, or at the end. */
function royalStanding(p: Player, colonies: number): Pick<ArenaEntry, 'ref' | 'refFormula' | 'declared'> {
  if (p.refAtDeclaration) {
    const f = p.refAtDeclaration.force;
    return { ref: f.regulars + f.dragoons + f.artillery, refFormula: p.refAtDeclaration.formula, declared: p.refAtDeclaration.turn };
  }
  const old = royalForce(p, colonies);
  return { ref: p.ref.regulars + p.ref.dragoons + p.ref.artillery, refFormula: old.regulars + old.dragoons + old.artillery };
}

/** Plays a series of games, rotating nations and seats so no level keeps the same advantage. */
export function runArena(opts: ArenaOptions, onGame?: (entries: ArenaEntry[], game: number) => void): { entries: ArenaEntry[]; summary: ArenaSummary[] } {
  const entries: ArenaEntry[] = [];
  const n = opts.levels.length;
  if (n < 1 || n > 8) throw new Error('An arena game needs between 1 and 8 nations.');
  for (let g = 0; g < opts.games; g++) {
    const seed = (opts.firstSeed ?? 1000) + g;
    const nations = [...NATION_ORDER.slice(g % 8), ...NATION_ORDER.slice(0, g % 8)].slice(0, n);
    const line = nations.map((nation, i) => ({ nation, level: opts.levels[(i + g) % n] }));
    const { entries: game } = playArenaGame(seed, line, opts.turns, opts.mapSize, opts.map, opts.features, opts.difficulty, opts.noFavoured);
    const best = Math.max(...game.map((e) => e.score));
    const rows = game.map((e) => ({ ...e, game: g, won: e.score === best }));
    entries.push(...rows);
    onGame?.(rows, g);
  }
  return { entries, summary: summarise(entries) };
}

export function summarise(entries: ArenaEntry[]): ArenaSummary[] {
  const levels = [...new Set(entries.map((e) => e.level))];
  return levels
    .map((level) => {
      const rows = entries.filter((e) => e.level === level);
      const mean = (f: (e: ArenaEntry) => number) => Math.round((rows.reduce((n, e) => n + f(e), 0) / rows.length) * 10) / 10;
      return {
        level,
        entries: rows.length,
        wins: rows.filter((e) => e.won).length,
        score: mean((e) => e.score),
        colonies: mean((e) => e.colonies),
        population: mean((e) => e.population),
        gold: mean((e) => e.gold),
        fathers: mean((e) => e.fathers),
        independenceWon: rows.filter((e) => e.independence === 'won').length,
        independenceLost: rows.filter((e) => e.independence === 'lost').length,
        spoiled: mean((e) => e.spoiled),
        cheated: rows.filter((e) => e.cheated).length,
        ...(rows.some((e) => e.features) ? { features: averageFeatures(rows) } : {}),
        ...(rows.some((e) => e.relations) ? { relations: averageTally(rows) } : {}),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function averageFeatures(rows: ArenaEntry[]): FeatureCounts {
  const out: FeatureCounts = {};
  for (const e of rows) for (const [k, v] of Object.entries(e.features ?? {})) out[k] = (out[k] ?? 0) + v;
  for (const k of Object.keys(out)) out[k] = Math.round((out[k] / rows.length) * 10) / 10;
  return out;
}

function averageTally(rows: ArenaEntry[]): RelationsTally {
  const out = emptyTally();
  for (const e of rows) for (const k of Object.keys(out) as (keyof RelationsTally)[]) out[k] += e.relations?.[k] ?? 0;
  for (const k of Object.keys(out) as (keyof RelationsTally)[]) out[k] = Math.round((out[k] / rows.length) * 10) / 10;
  return out;
}

/** A Markdown table of relations and trade between the Europeans, per level (average per nation per game). */
export function formatRelations(summary: ArenaSummary[]): string {
  const head = '| Level | Proposals | Agreements | Favoured made | Favoured at end | Cancelled | Trade volume | Foreign stop sales | Partner port sales | Triangle trades | Wars declared | on partners | Tax refusals |';
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const rows = summary
    .filter((r) => r.relations)
    .map((r) => {
      const t = r.relations!;
      return `| ${AI_LEVEL_INFO[r.level].name} | ${t.proposals} | ${t.agreements} | ${t.favoured} | ${t.favouredAtEnd} | ${t.cancelled} | ${t.volume} | ${t.foreignStopSales} | ${t.partnerPortSales} | ${t.triangles} | ${t.wars} | ${t.warsOnPartners} | ${t.taxRefusals} |`;
    });
  return [head, rule, ...rows].join('\n');
}

/** One line with the per-game totals of relations between the Europeans. */
export function formatRelationsLine(entries: ArenaEntry[]): string {
  const games = new Set(entries.map((e) => e.game)).size || 1;
  const sum = (k: keyof RelationsTally) => entries.reduce((n, e) => n + (e.relations?.[k] ?? 0), 0);
  const per = (n: number) => Math.round((n / games) * 10) / 10;
  // Agreements and Favoured Nation statuses involve two nations; volume is counted by both.
  return (
    `Per game: ${per(sum('agreements') / 2)} trade agreements, ${per(sum('favoured') / 2)} Favoured Nation pairs made ` +
    `(${per(sum('favouredAtEnd') / 2)} at the end, ${per(sum('cancelled'))} cancelled), ${Math.round(sum('volume') / 2 / games)} gold traded at each other's colonies, ` +
    `${per(sum('foreignStopSales'))} units sold at partners' colonies and ${per(sum('partnerPortSales'))} in partners' ports, ${per(sum('triangles'))} triangle trades, ` +
    `${per(sum('wars'))} wars declared (${per(sum('warsOnPartners'))} on trade partners or Favoured Nations), ${per(sum('taxRefusals'))} tax raises refused.`
  );
}

/**
 * A Markdown table of the Crown per level: independence declared, won and lost, the Royal
 * Expeditionary Force at the declaration (or at the end) against the old formula, and the King's
 * demands and wars, as averages per nation per game.
 */
export function formatCrown(entries: ArenaEntry[]): string {
  const head = '| Level | Declared | Won / lost | Turn declared | REF at declaration | old formula then | REF at end (no declaration) | old formula then | Demands | paid | refused | Royal wars | REF units added |';
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const levels = [...new Set(entries.map((e) => e.level))];
  const avg = (rows: ArenaEntry[], f: (e: ArenaEntry) => number) => (rows.length ? String(Math.round((rows.reduce((n, e) => n + f(e), 0) / rows.length) * 10) / 10) : '–');
  const rows = levels.map((level) => {
    const all = entries.filter((e) => e.level === level);
    const declared = all.filter((e) => e.declared !== undefined);
    const rest = all.filter((e) => e.declared === undefined);
    const t = (k: keyof RelationsTally) => avg(all, (e) => e.relations?.[k] ?? 0);
    return `| ${AI_LEVEL_INFO[level].name} | ${declared.length} | ${all.filter((e) => e.independence === 'won').length} / ${all.filter((e) => e.independence === 'lost').length} | ${avg(declared, (e) => e.declared!)} | ${avg(declared, (e) => e.ref ?? 0)} | ${avg(declared, (e) => e.refFormula ?? 0)} | ${avg(rest, (e) => e.ref ?? 0)} | ${avg(rest, (e) => e.refFormula ?? 0)} | ${t('demands')} | ${t('demandsPaid')} | ${t('demandsRefused')} | ${t('royalWars')} | ${t('refAdded')} |`;
  });
  return [head, rule, ...rows].join('\n');
}

/** A Markdown table of a summary. */
export function formatArena(summary: ArenaSummary[]): string {
  const head = '| Level | Nations | Wins | Score | Colonies | Colonists | Gold | Fathers | Independence won / lost | Goods spoiled |';
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const rows = summary.map((r) =>
    `| ${AI_LEVEL_INFO[r.level].name}${r.cheated ? ` (${r.cheated} cheated)` : ''} | ${r.entries} | ${r.wins} | ${r.score} | ${r.colonies} | ${r.population} | ${r.gold} | ${r.fathers} | ${r.independenceWon} / ${r.independenceLost} | ${r.spoiled} |`,
  );
  const cheated = summary.reduce((n, r) => n + r.cheated, 0);
  const note = cheated ? [`\nCheats used: ${cheated} of these entries come from cheated games.`] : [];
  return [head, rule, ...rows, ...note].join('\n');
}
