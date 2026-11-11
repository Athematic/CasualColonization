// Times a head start, the way the web game's New game → "Take over in 1700" → "Skip ahead" plays it,
// with no browser: 4 nations on a generated medium map, one player's nation played by the
// Creative computer and three Competent computer players, events and the colony charter on.
// Prints the total time, a breakdown per phase of the turn pipeline (packages/engine/src/perf.ts)
// and a hash of the final saved state, which must not change when the engine only gets faster.
//
// Usage: npm run bench -- [--seed 2024] [--year 1700] [--scenario id] [--keep-playing] [--quiet]
//        npm run bench -- --verify [--write] [--scenario id]
// npm test runs a shorter golden-hash test (packages/engine/test/golden.test.ts) in CI.
// --verify plays 150 rounds on three more seeds and compares the state hashes with
// scripts/bench-hashes.json (the benchmark game's hash too); --write stores them instead.
// --scenario plays the same games in another registered scenario (the first four nations of its
// default set, its default map, its calendar); its hashes are stored under "<id>: ..." keys, so
// the Americas' keys stay as they are. Without it the games are the Americas', as before.
// A game that ends before its turn (the bench plays without play-on, so a won War of
// Independence ends it, as in the game to 1750) says so, with the reason, after its final state.
// For a CPU profile: node --cpu-prof scripts/.bench.mjs (after one `npm run bench`).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createGame, DEFAULT_SCENARIO, getScenario, handOver, headStartConfig, listScenarios, nationSet, newGameOptions, perfReport, playUntil, registerScenario, serialize, setPerf, turnOfYear as calendarTurn, type GameConfig, type GameState } from '../packages/engine/src/index.ts';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const scenarioId = opt('scenario', DEFAULT_SCENARIO);
const chosen = getScenario(scenarioId);
if (!chosen) throw new Error(`Unknown scenario "${scenarioId}". Use ${listScenarios().map((sc) => sc.id).join(', ')}.`);
// --keep-playing (timing only): the same scenario and rules, but the only way the game ends is the
// calendar: a War of Independence is fought as usual, and when it is won or lost the game goes on
// (the nation plays on, independent or not), so every timing game runs to its year with all of its
// work. It plays other games than the recorded ones, so it can't be combined with --verify.
const keepPlaying = args.includes('--keep-playing');
if (keepPlaying && args.includes('--verify')) throw new Error('--keep-playing is for timing; --verify checks the recorded games.');
if (keepPlaying) registerScenario({ ...chosen, id: `${chosen.id}-keep-playing`, name: `${chosen.name} (keep playing)`, hidden: true, victory: [{ id: 'time' }] });
const scenario = keepPlaying ? getScenario(`${chosen.id}-keep-playing`)! : chosen;
const americas = scenario.id === DEFAULT_SCENARIO;

/** The first turn of a year in the scenario's calendar (packages/engine/src/scenarios/calendar.ts). */
const turnOfYear = (year: number) => calendarTurn(year, scenario.calendar);

/** The New game screen's defaults, with the first nation as the player (England in the Americas). */
function webConfig(seed: number): GameConfig {
  const [first, ...rest] = nationSet(scenario!, undefined).slice(0, 4).map((e) => e.id);
  const map = newGameOptions(scenario!).defaultMap;
  return {
    seed,
    mapSize: 'medium',
    ...(map ? { map } : {}),
    nations: [first, ...rest],
    humans: [first],
    ai: Object.fromEntries(rest.map((n) => [n, 'competent'])),
    difficulty: 'conquistador',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    // Written only outside the Americas, so the Americas' games (and hashes) are as before.
    ...(americas ? {} : { scenario: scenario!.id }),
  };
}

/** A hash file key: the Americas' keys as before, another scenario's prefixed with its id. */
const key = (k: string) => (americas ? k : `${scenario.id}: ${k}`);

const hash = (s: GameState) => createHash('sha256').update(serialize(s)).digest('hex').slice(0, 16);

/**
 * Why a game stopped before the turn it was played to, or '' when it got there. The bench plays
 * without play-on, so a game ends at its first victory (a won War of Independence, the last year).
 */
function endedEarly(s: GameState, turn: number): string {
  const over = s.gameOver;
  if (!over || s.turn > turn) return '';
  const winner = over.winner ? ` (winner: ${over.winner})` : '';
  return `Game over at turn ${over.turn}, before turn ${turn}${winner}: ${over.reason}`;
}

/** Plays a head start to the turn and hands over, as skipAhead in apps/web/src/main.ts does. */
function headStart(seed: number, turn: number): GameState {
  const s = createGame(headStartConfig(webConfig(seed), turn));
  playUntil(s, turn);
  handOver(s);
  return s;
}

const HASH_FILE = new URL('./bench-hashes.json', import.meta.url);
const BENCH_SEED = 2024;
const VERIFY_SEEDS = [7, 1492, 123456];
const VERIFY_ROUNDS = 150;
/** The benchmark game's year: 1700 in the Americas; elsewhere a head-start year of the scenario's calendar near the same share of it. */
const BENCH_YEAR = americas ? 1700 : (scenario.calendar.headStartYears[Math.floor(scenario.calendar.headStartYears.length / 2)] ?? scenario.calendar.end.year);

if (args.includes('--verify')) {
  const hashes: Record<string, string> = {};
  for (const seed of VERIFY_SEEDS) {
    const t = performance.now();
    const s = headStart(seed, VERIFY_ROUNDS);
    hashes[key(`seed ${seed}, ${VERIFY_ROUNDS} rounds`)] = hash(s);
    const early = endedEarly(s, VERIFY_ROUNDS);
    console.error(`  seed ${seed}: ${((performance.now() - t) / 1000).toFixed(1)}s${early ? ` (${early})` : ''}`);
  }
  const t = performance.now();
  // The benchmark game: to 1700 in the Americas, or the same share of another scenario's calendar.
  const bench = headStart(BENCH_SEED, turnOfYear(BENCH_YEAR));
  hashes[key(`seed ${BENCH_SEED}, to ${BENCH_YEAR}`)] = hash(bench);
  const early = endedEarly(bench, turnOfYear(BENCH_YEAR));
  console.error(`  seed ${BENCH_SEED} to ${BENCH_YEAR}: ${((performance.now() - t) / 1000).toFixed(1)}s${early ? ` (${early})` : ''}`);
  const stored = JSON.parse(readFileSync(HASH_FILE, 'utf8')) as Record<string, string>;
  if (args.includes('--write')) {
    // Other scenarios' hashes stay; this scenario's are replaced.
    writeFileSync(HASH_FILE, `${JSON.stringify({ ...stored, ...hashes }, null, 2)}\n`);
    console.log(`Stored ${Object.keys(hashes).length} hashes in scripts/bench-hashes.json.`);
  } else {
    let ok = true;
    for (const [k, v] of Object.entries(hashes)) {
      const same = stored[k] === v;
      ok &&= same;
      console.log(`${same ? 'same     ' : 'DIFFERENT'}  ${k}: ${v}${same ? '' : ` (stored ${stored[k] ?? 'none'})`}`);
    }
    if (!ok) process.exitCode = 1;
  }
} else {
  const seed = Number(opt('seed', String(BENCH_SEED)));
  const year = Number(opt('year', String(BENCH_YEAR)));
  const turn = turnOfYear(year);
  setPerf(true);
  const t0 = performance.now();
  const s = createGame(headStartConfig(webConfig(seed), turn));
  const created = performance.now() - t0;
  playUntil(s, turn);
  handOver(s);
  const total = performance.now() - t0;
  setPerf(false);
  const t1 = performance.now();
  const h = hash(s);
  const hashMs = performance.now() - t1;
  console.log(`Head start to ${year} (turn ${turn}), seed ${seed}${americas ? '' : `, ${scenario.name}`}: ${(total / 1000).toFixed(1)}s (new game ${created.toFixed(0)} ms)`);
  console.log(`Final state: turn ${s.turn}, ${Object.keys(s.colonies).length} colonies, ${Object.keys(s.units).length} units, hash ${h} (${(serialize(s).length / 1e6).toFixed(1)} MB, hashed in ${hashMs.toFixed(0)} ms)`);
  const early = endedEarly(s, turn);
  if (early) console.log(early);
  console.log('');
  if (!args.includes('--quiet')) {
    console.log('Phase                                      seconds   share    calls   ms/call');
    for (const [name, p] of perfReport()) {
      console.log(`${name.padEnd(40)} ${(p.ms / 1000).toFixed(2).padStart(9)} ${((p.ms / total) * 100).toFixed(1).padStart(6)}% ${String(p.calls).padStart(8)} ${(p.ms / p.calls).toFixed(2).padStart(9)}`);
    }
    console.log('\n"natives > braves" is part of "natives (incl. braves)".');
  }
}
