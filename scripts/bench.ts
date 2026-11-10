// Times a head start, the way the web game's New game → "Take over in 1700" → "Skip ahead" plays it,
// with no browser: 4 nations on a generated medium map, one player's nation played by the
// Creative computer and three Competent computer players, events and the colony charter on.
// Prints the total time, a breakdown per phase of the turn pipeline (packages/engine/src/perf.ts)
// and a hash of the final saved state, which must not change when the engine only gets faster.
//
// Usage: npm run bench -- [--seed 2024] [--year 1700] [--quiet]
//        npm run bench -- --verify [--write]
// npm test runs a shorter golden-hash test (packages/engine/test/golden.test.ts) in CI.
// --verify plays 150 rounds on three more seeds and compares the state hashes with
// scripts/bench-hashes.json (the benchmark game's hash too); --write stores them instead.
// For a CPU profile: node --cpu-prof scripts/.bench.mjs (after one `npm run bench`).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createGame, handOver, headStartConfig, perfReport, playUntil, serialize, setPerf, type GameConfig, type GameState } from '../packages/engine/src/index.ts';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

/** The web game's turn for a year (apps/web/src/ui/newgame.ts). */
const turnOfYear = (year: number) => (year <= 1600 ? year - 1492 : 108 + (year - 1600) * 2);

/** The New game screen's defaults, with England as the player. */
function webConfig(seed: number): GameConfig {
  return {
    seed,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands', 'spain'],
    humans: ['england'],
    ai: { france: 'competent', netherlands: 'competent', spain: 'competent' },
    difficulty: 'conquistador',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
  };
}

const hash = (s: GameState) => createHash('sha256').update(serialize(s)).digest('hex').slice(0, 16);

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

if (args.includes('--verify')) {
  const hashes: Record<string, string> = {};
  for (const seed of VERIFY_SEEDS) {
    const t = performance.now();
    hashes[`seed ${seed}, ${VERIFY_ROUNDS} rounds`] = hash(headStart(seed, VERIFY_ROUNDS));
    console.error(`  seed ${seed}: ${((performance.now() - t) / 1000).toFixed(1)}s`);
  }
  const t = performance.now();
  hashes[`seed ${BENCH_SEED}, to 1700`] = hash(headStart(BENCH_SEED, turnOfYear(1700)));
  console.error(`  seed ${BENCH_SEED} to 1700: ${((performance.now() - t) / 1000).toFixed(1)}s`);
  if (args.includes('--write')) {
    writeFileSync(HASH_FILE, `${JSON.stringify(hashes, null, 2)}\n`);
    console.log(`Stored ${Object.keys(hashes).length} hashes in scripts/bench-hashes.json.`);
  } else {
    const stored = JSON.parse(readFileSync(HASH_FILE, 'utf8')) as Record<string, string>;
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
  const year = Number(opt('year', '1700'));
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
  console.log(`Head start to ${year} (turn ${turn}), seed ${seed}: ${(total / 1000).toFixed(1)}s (new game ${created.toFixed(0)} ms)`);
  console.log(`Final state: turn ${s.turn}, ${Object.keys(s.colonies).length} colonies, ${Object.keys(s.units).length} units, hash ${h} (${(serialize(s).length / 1e6).toFixed(1)} MB, hashed in ${hashMs.toFixed(0)} ms)\n`);
  if (!args.includes('--quiet')) {
    console.log('Phase                                      seconds   share    calls   ms/call');
    for (const [name, p] of perfReport()) {
      console.log(`${name.padEnd(40)} ${(p.ms / 1000).toFixed(2).padStart(9)} ${((p.ms / total) * 100).toFixed(1).padStart(6)}% ${String(p.calls).padStart(8)} ${(p.ms / p.calls).toFixed(2).padStart(9)}`);
    }
    console.log('\n"natives > braves" is part of "natives (incl. braves)".');
  }
}
