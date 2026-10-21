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
import type { GameState, MapSize } from './types.js';

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
  /** The game was cheated in (arena games never cheat, but standings can come from any state). */
  cheated?: boolean;
  /** Highest score in its game (ties count for all). */
  won: boolean;
  /** Feature uses, when the arena counts them. */
  features?: FeatureCounts;
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
  };
  const counts = new Map<string, FeatureCounts>();
  const previous = features
    ? setFeatureSink((nation, feature, n) => {
        let c = counts.get(nation);
        if (!c) counts.set(nation, (c = {}));
        c[feature] = (c[feature] ?? 0) + n;
      })
    : null;
  let s: GameState;
  try {
    s = createGame(config);
    let guard = turns * 2 + 10;
    while (s.turn < turns && !s.gameOver && guard-- > 0) applyCommand(s, { type: 'endTurn' });
  } finally {
    if (features) setFeatureSink(previous);
  }
  const entries = line.map((l) => {
    const e = standing(s, seed, l.nation, l.level);
    return features ? { ...e, features: { ...counts.get(l.nation), ...endStateFeatures(s, l.nation) } } : e;
  });
  return { state: s, entries };
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
    ...(isCheated(s) ? { cheated: true } : {}),
  };
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
    const { entries: game } = playArenaGame(seed, line, opts.turns, opts.mapSize, opts.map, opts.features, opts.difficulty);
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
