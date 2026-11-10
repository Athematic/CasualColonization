// The 0.10 hill-climbing gate: is a candidate both correct and faster?
//
// Usage: node scripts/perf-gate.mjs [--runs 5] [--years 1700,1750] [--save base.json] [--baseline base.json]
//
// 1. Verification (must pass, or the candidate is rejected): `npm run bench -- --verify` for the
//    Americas and for the Caribbean print "same" on every line, so games are bit-identical to the
//    recorded hashes. A candidate that changes outcomes on purpose re-records the hashes in its own
//    commit; the gate then checks against those.
// 2. Score: each head start (seed 2024, computer players) is timed --runs times after one warm-up;
//    the median and the spread (max - min) are reported, with the final state hash of every run
//    (all runs of one year must end in the same state).
// 3. With --baseline, the verdict: ACCEPT when every year's median is faster than the baseline's by
//    more than the noise (2% or the larger of the two spreads, whichever is more), NEUTRAL when within
//    the noise, REJECT when slower or when verification fails. --save writes this run as a baseline.
//
// Run it on one machine for both sides (the Mac worker for official numbers): timings from two
// machines don't compare. Hill climbing: keep the current best as the baseline, try a candidate on
// top of it, keep it on ACCEPT (it becomes the new baseline), drop it otherwise.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const runs = Number(opt('runs', '5'));
const years = opt('years', '1700').split(',').map(Number);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function verify(scenarioArgs) {
  const r = spawnSync(npm, ['run', '--silent', 'bench', '--', '--verify', ...scenarioArgs], { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter((l) => /^(same|DIFFERENT)/.test(l));
  return { ok: r.status === 0 && lines.length > 0 && lines.every((l) => l.startsWith('same')), lines };
}

function timeOnce(year) {
  const out = execFileSync('node', ['scripts/.bench.mjs', '--year', String(year), '--quiet'], { encoding: 'utf8' });
  const sec = Number(/: ([\d.]+)s \(new game/.exec(out)?.[1]);
  const hash = /hash ([0-9a-f]+)/.exec(out)?.[1];
  return { sec, hash };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

console.log(`perf gate at ${commit}: verifying...`);
const checks = { americas: verify([]), caribbean: verify(['--scenario', 'caribbean']) };
for (const [name, c] of Object.entries(checks)) console.log(`  ${name}: ${c.ok ? 'same' : 'FAILED'}\n    ${c.lines.join('\n    ')}`);
const verified = Object.values(checks).every((c) => c.ok);

const result = { commit, runs, verified, years: {} };
if (verified) {
  for (const year of years) {
    timeOnce(year); // warm-up, not counted
    const samples = Array.from({ length: runs }, () => timeOnce(year));
    const secs = samples.map((s) => s.sec);
    const hashes = [...new Set(samples.map((s) => s.hash))];
    result.years[year] = { median: median(secs), spread: Math.max(...secs) - Math.min(...secs), secs, hash: hashes.join(',') };
    console.log(`  to ${year}: median ${median(secs).toFixed(1)} s, spread ${(Math.max(...secs) - Math.min(...secs)).toFixed(1)} s, runs ${secs.join(' ')}${hashes.length > 1 ? ' — RUNS ENDED IN DIFFERENT STATES' : ''}`);
    if (hashes.length > 1) result.verified = false;
  }
}

let verdict = result.verified ? 'MEASURED' : 'REJECT (verification failed)';
const basePath = opt('baseline', '');
if (basePath && result.verified) {
  const base = JSON.parse(readFileSync(basePath, 'utf8'));
  const parts = [];
  let faster = 0;
  let slower = 0;
  for (const year of years) {
    const a = base.years[year];
    const b = result.years[year];
    if (!a) continue;
    const noise = Math.max(0.02 * a.median, a.spread, b.spread);
    const gain = a.median - b.median;
    parts.push(`to ${year}: ${a.median.toFixed(1)} → ${b.median.toFixed(1)} s (${((-gain / a.median) * 100).toFixed(1)}%, noise ±${noise.toFixed(1)} s)`);
    if (gain > noise) faster++;
    else if (-gain > noise) slower++;
  }
  verdict = slower ? 'REJECT (slower)' : faster === years.length ? 'ACCEPT' : 'NEUTRAL (within noise)';
  console.log(`  against ${base.commit}: ${parts.join('; ')}`);
}
result.verdict = verdict;
console.log(`verdict: ${verdict}`);
const savePath = opt('save', '');
if (savePath) writeFileSync(savePath, `${JSON.stringify(result, null, 2)}\n`);
if (verdict.startsWith('REJECT')) process.exitCode = 1;
