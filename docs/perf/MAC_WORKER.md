# 0.10 measurement jobs for the Mac worker

These are the measurement jobs for 0.10, Faster turns. They run on Simon's MacBook (Apple M2, 8 cores, 16 GB), the "CasualColonization worker", so every timing in 0.10 comes from the same machine. The code changes are made in a cloud session on branch `claude/0.10-faster-turns`. The Mac session only measures and reports.

If you are the Claude session on the Mac, read this whole file, then do the job Simon names (start with job 1 if he names none).

**If you are the 10-minute polling loop: follow the section "Automation: the polling loop" at the end of this file, on every pull.** That section decides what to run:
- it re-measures the best (`claude/0.10-faster-turns`) when its code changes;
- it gates each new commit on `claude/0.10-candidate` against the best;
- it reports.

Job 4 is the gate that the loop runs; on its own, job 4 doesn't tell you when to run it. Watch **both** branches. A new commit on `claude/0.10-candidate` is the most common reason to run, even when `claude/0.10-faster-turns` hasn't changed.

**How we talk (asymmetric):** the Mac sends to the cloud session with the session messaging tool, as it does now. The cloud session does **not** message the Mac, because each such message needs Simon to approve it. The cloud session talks to the Mac only through this file:
- on each pull, read the "Messages to the Mac" section below;
- act on any entry newer than the last one you acknowledged;
- quote the entry's id in your next report to confirm it.

Don't wait for a message reply from the cloud session. If you get none, carry on with the loop.

## Messages to the Mac

Newest last. Each entry has an id; acknowledge it in your next report.

- **M1 (2026-11-10):** confirmed, `session_01Vgy9QYBpiHxzmYr17Ez8zF` is the right address for your reports. Both gate results arrived. The NEUTRAL on identical code (3.0%, inside the noise) was the calibration we wanted. Keep the loop running. Real candidates will appear on `claude/0.10-candidate` as the speed-up branches finish.
- **M2 (2026-11-10):** candidate `86f92bb` is on `claude/0.10-candidate`. It is round 1 and keeps outcomes bit-identical:
  - unit and colony indexes;
  - faster path search;
  - plain loops;
  - parallel tournaments (`--jobs`);
  - split test files;
  - the bench now says why a game ended early.

  The cloud measured about 2.6× faster to 1700. Gate it as usual. For this candidate only, also do the following for both the best and the candidate, and put the numbers in the report:
  - time `npm test` 3 times;
  - time `npm run tournament -- --games 8 --turns 609 --play-on --events --seed 1000` once (its default `--jobs` is now cores − 1);
  - check that its tables are identical to the baseline's 318 s run.

What to expect next: the best changed with the Caribbean map merge (`e7744eb`), so measure it first. The candidate is currently the same commit, so its gate should come out NEUTRAL; that run shows how noisy the Mac is. Real candidates follow as the speed-up branches finish.

## Rules for every job

- **Measure only.** Don't change code, tests, `scripts/bench-hashes.json` or snapshots. Never run `npm run bench -- --write` or `npm run test:golden:write`.
- **Same conditions each time.** The Mac is on mains power. Close heavy apps (browsers with many tabs, video calls, builds). Run one measurement at a time, never two in parallel.
- **Repeat timings.** Run each timing 3 times and report the median and the spread. The first run after `npm install` or a fresh build is a warm-up and is not counted.
- **Record the setup:** the commit (`git rev-parse --short HEAD`), the Node and npm versions, and the date and time.
- **Results go on a branch of their own.** Write them to `docs/perf/results/<YYYY-MM-DD>-<job>-<commit>.md`. Commit them to branch `claude/0.10-mac-results`: create it from the measured commit the first time, then merge new results into it. Push that branch, and never push to `claude/0.10-faster-turns`. Commit messages end with a line `Measured on the Mac worker`.
- **Report back.** Send the summary table and the results file's path to the cloud session `session_01Vgy9QYBpiHxzmYr17Ez8zF` (the session that wrote this file) with the session messaging tool, if you have it. If you don't, tell Simon the results branch is pushed.
- **When something fails** (a test, `bench --verify` not "same", a crash), stop that job. Report the exact command and the last 40 lines of output. Don't try to fix it.

## Job 0: set up (once, and again after `package-lock.json` changes)

```sh
git fetch origin claude/0.10-faster-turns
git checkout --detach origin/claude/0.10-faster-turns   # or the commit the job names
npm ci
node --version; npm --version
npm run bench -- --verify     # must print "same" for every game; this is also the warm-up
```

## Job 1: baseline (before any 0.10 change)

Measure commit `origin/claude/0.10-faster-turns` as it is when the job starts. Until the first speed-up lands, that is 0.9's code.

1. **Head starts.** Use the bench's game, seed 2024, played by computer players. Run each 3 times and report the median and spread of the seconds it prints:
   ```sh
   npm run bench -- --year 1600 --quiet
   npm run bench -- --year 1700 --quiet
   npm run bench -- --year 1750 --quiet
   npm run bench -- --scenario caribbean --year 1725 --quiet
   ```
   Check the bench script's printed usage if `--year` or `--quiet` behave differently than expected, and say so.
2. **Determinism check:** `npm run bench -- --verify` and `npm run bench -- --verify --scenario caribbean`. Every line must say "same".
3. **CPU profile of a head start to 1700.** Profile one run and list the 30 functions with the most self time: name, file:line, self ms and percentage. Write the list into the results file. Don't commit the `.cpuprofile` file itself; it's large.
   ```sh
   npm run bench -- --year 1700 --quiet          # builds scripts/.bench.mjs
   node --cpu-prof --cpu-prof-dir=/tmp/cc-prof scripts/.bench.mjs --year 1700 --quiet
   ```
   Summarise it with a short Node script that reads the `.cpuprofile` JSON and adds up `timeDeltas` per node `callFrame` (functionName, url, lineNumber). Put that script in `/tmp`, not in the repo.
4. **Test suite.** Run `time npm test` 3 times. Report the wall time and vitest's own duration line. Also report the 10 slowest test files (`npx vitest run --reporter=verbose` gives the durations per file, or use the JSON reporter).
5. **Tournaments.** These are the reference for "the computer players play as well as before". Run each once, timed:
   ```sh
   time npm run tournament -- --games 8 --turns 609 --play-on --events --seed 1000
   time npm run tournament -- --scenario caribbean --games 8 --turns 202 --events --seed 1000
   ```
   Copy each tournament's full summary tables into the results file: scores, wins, colonies per level, relations and trade, and the Crown table.

**Results file:** start with a summary table with one row per measurement (median, spread). Then give the profile list, the slowest test files and the tournament tables. End with anything unusual: noise between runs, warnings, a run that was much slower.

## Job 2: measure a change

Simon or the cloud session names a commit, usually the head of `claude/0.10-faster-turns` after a speed-up. Do job 0 on that commit, then repeat job 1's steps 1–4 on it. Add a column comparing it with the baseline (seconds and percentage).

Since the first round of 0.10, `npm run tournament` plays its games in parallel (the cores less one); add `--jobs 1` to time it serially as in job 1, and report both when a tournament is timed.

A speed-up that changes game outcomes re-records the hashes on the branch. Its commit message says so, and `bench --verify` then has to be "same" against the new hashes. If the job says the change alters outcomes, also run step 5's tournaments and set their tables side by side with the baseline's.

## Job 3: release check (at the end of 0.10)

Do job 2 on the release candidate commit with all five steps, and compare with the baseline. The 0.10 target for a head start to 1700 is set from job 1's numbers and recorded in `docs/ROADMAP.md`.

## Job 4: hill-climbing gate (each candidate speed-up)

0.10 works by hill climbing: there is a current best commit, and candidate speed-ups from several branches are tried on top of it one at a time. A candidate is kept only if it passes the verification and is measurably faster. The gate is `npm run perf:gate` (`scripts/perf-gate.mjs`):

- **Verification:** `bench --verify` for the Americas and the Caribbean must print "same" everywhere, and every timed run must end in the same state. If not, the candidate is rejected whatever its speed.
- **Score:** the median of `--runs` timed head starts (default 5, after one warm-up), for each year in `--years` (default 1700).
- **Verdict against `--baseline`:** ACCEPT only when every year is faster by more than the noise (2%, or the larger spread of the two runs). NEUTRAL when within the noise, REJECT when slower.

```sh
npm ci
npm run perf:gate -- --runs 5 --years 1700,1750 --save /tmp/best.json   # on the current best commit
git checkout --detach <candidate>
npm ci                                                                  # only if package-lock.json changed
npm run perf:gate -- --runs 5 --years 1700,1750 --baseline /tmp/best.json --save /tmp/cand.json
```

Report each candidate's verdict line and the "against" line. Copy an accepted candidate's JSON over `/tmp/best.json` so it becomes the baseline for the next candidate. Both sides must be measured on the Mac in the same sitting: the cloud container's timings vary by about 10% between identical runs, so they can't decide a close call.

## Automation: the polling loop

Simon's Mac pulls every 10 minutes. This section says what to do on each pull, so it runs without anyone watching. Re-read this file from `origin/claude/0.10-faster-turns` on every pull, because it may change.

**Two branches are watched:**
- `claude/0.10-faster-turns` is **the current best**. It only moves when a candidate has been accepted (or for docs).
- `claude/0.10-candidate` is **the next candidate**: the current best plus one speed-up. The cloud session force-pushes it for every new candidate.

**On each pull:**
1. **New best:** if `claude/0.10-faster-turns` has a new commit, check whether any file outside `docs/` changed since the last commit you measured. If so, run the gate on it (job 4, `--runs 5 --years 1700,1750`) and `--save ~/cc-perf/best.json`. Keep `~/cc-perf/` outside the repo. If only docs changed, do nothing.
2. **New candidate:** if `claude/0.10-candidate` points at a commit you haven't gated, do two things in the same sitting:
   - re-measure the best into `best.json`, unless that was done in the last hour;
   - run `npm run perf:gate -- --runs 5 --years 1700,1750 --baseline ~/cc-perf/best.json --save ~/cc-perf/cand-<commit>.json`.
3. **Tournaments:** only when the candidate's commit message contains `[outcomes]`. That marks a speed-up that changes games and re-records the hashes. Also run job 1 step 5's two tournaments on both the best and the candidate.
4. **Record:** write each result to `docs/perf/results/<date>-gate-<commit>.md`. Include the verdict line, the "against" line, the per-run times, and the commit's subject line. Commit to `claude/0.10-mac-results` and push.
5. **Report:** message the cloud session `session_01Vgy9QYBpiHxzmYr17Ez8zF` with one line per result, in the form `<commit> <verdict> <the against line>`.

**Ground rules:**
- Never run two jobs at once.
- If a job is still running at the next pull, skip that pull.
- If the Mac is busy with Simon's own work (load average above 3 before a run), wait for the next pull and say so in the report. Don't measure on a busy machine.
- Never push to `claude/0.10-faster-turns` or `claude/0.10-candidate`.
