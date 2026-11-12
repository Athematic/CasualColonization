# Performance measurement jobs for the Mac worker

These are the performance measurement jobs (they started in 0.10, Faster turns, and continue in later hill-climbing rounds). They run on Simon's MacBook (Apple M2, 8 cores, 16 GB), the "CasualColonization worker", so every timing in 0.10 comes from the same machine. The code changes are made in a cloud session on branch `claude/perf-best`. The Mac session only measures and reports.

If you are the Claude session on the Mac, read this whole file, then do the job Simon names (start with job 1 if he names none).

**If you are the 10-minute polling loop: follow the section "Automation: the polling loop" at the end of this file, on every pull.** That section decides what to run:
- it re-measures the best (`claude/perf-best`) when its code changes;
- it gates each new commit on `claude/perf-candidate` against the best;
- it reports.

Job 4 is the gate that the loop runs; on its own, job 4 doesn't tell you when to run it. Watch **both** branches. A new commit on `claude/perf-candidate` is the most common reason to run, even when `claude/perf-best` hasn't changed.

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
- **M3 (2026-11-10):** round 1 (`86f92bb`) is accepted and merged into the best, so re-baseline it.
  - There is no need to repeat the candidate's `npm test` and tournament timings: the gate verdict is clear, and the release check (job 3) re-times both on a quiet machine.
  - The next candidate follows on `claude/0.10-candidate`: the computer players' planning speed-ups, on top of round 1.
  - If the load average is above 3, wait for the next pull as the rules say. A wrong verdict costs more than a delay.
- **M4 (2026-11-10):** the gate now times games with independence switched off (`bench --no-independence`, Simon's idea). Until now the "1750" game ended at turn 354, when France won its War of Independence; now every timing game runs to its year. The default years are now `1700,1850`, and 1850 is a full game. Every `--years 1700,1750` in this file now reads `1700,1850`.
  - Old baselines don't compare with the new games, so **re-baseline the best** (this commit) before gating anything.
  - The candidate `claude/0.10-candidate` is being updated to include the new gate, so gate it against the new baseline when it changes.
  - Verification (`bench --verify`) is unchanged: it still checks the recorded games, with independence on.
- **M5 (2026-11-10), replaces M4's choice of years:** Simon pointed out that games without independence make the computer players' work simpler, so they measure it less well. The gate therefore times both kinds:
  - `1700` and `1750` as recorded (the 1750 game includes a War of Independence and ends at turn 354);
  - `1850:noind`, a full game with independence switched off.

  The default is `--years 1700,1750,1850:keep`, and this file's commands now use it. Re-baseline the best at this commit before gating, then gate the candidate when it updates.
- **M6 (2026-11-10), replaces the `:noind` games of M4/M5:** Simon's better idea. The full game no longer switches independence off. `bench --keep-playing` keeps the scenario's rules and only removes the victory by war: wars of independence are fought as usual, a nation that wins plays on as independent, and only the calendar ends the game. The gate's default is now `--years 1700,1750,1850:keep`, and this file's commands use it. Re-baseline the best at this commit, then gate the candidate when it updates.
- **M7 (2026-11-10):** `82a9023` (the AI planning speed-ups) is **accepted** and merged into the best.
  - The gate's rule is now Pareto: ACCEPT when no game is slower beyond its noise and at least one is faster beyond it. Your run showed −9.5% at 1700 and −3.7% at 1750, with 1850 within noise, so it passes the new rule.
  - Re-baseline the best at this commit.
  - Candidates from now on are round 2, which changes outcomes and is marked `[outcomes]`, so run the tournaments for those. Later come a save/load determinism fix and the Beta 1 work.
- **M8 (2026-11-10):** new candidate on `claude/0.10-candidate`: round 2.
  - **What it is:** `goTo` (one path search instead of two), routes followed for the whole move, an AI colony-report cache, and a site-score cache.
  - **No tournaments needed:** it is not marked `[outcomes]`. Following the route is not identical by construction, but every measured game and both seed-1000 tournaments came out identical. `bench --verify` decides.
  - **About noise:** from now on, always re-measure the best in the same sitting just before gating a candidate, whatever the age of `best.json`, so both sides share the same conditions. If the best's spread is above 0.3 s at 1700, re-measure it once more before gating. You don't need to re-baseline `386f403` separately.
- **M9 (2026-11-10):** the best now includes a save/load determinism fix.
  - **Recorded hashes:** the fix changed the save text, so `scripts/bench-hashes.json` and the golden snapshots were re-recorded on purpose. The games themselves are unchanged. Don't compare hashes with older results.
  - **What to do:** re-baseline the best at this commit.
  - **The candidate:** `claude/0.10-candidate` is round 2 rebuilt on this best (all tests and both `bench --verify` pass), so gate it as in M8.
- **M10 (2026-11-11):** round 2 (`8cc9e99`) is **accepted** and merged into the best. The next candidates are round 3 (colony worker planning and path search, bit-identical) and the grid abstraction (bit-identical). Gate them as usual when they appear.
- **M11 (2026-11-11):** a new candidate is on `claude/0.10-candidate`: the grid abstraction (hex maps step 1). It is bit-identical, and its purpose is structure, not speed. Gate it as usual. For this candidate only, **NEUTRAL counts as a pass**: it only has to be no slower. Report the verdict as usual and I'll merge it on NEUTRAL or ACCEPT. Round 3 (speed) comes later and is judged by the normal Pareto rule.
- **M12 (2026-11-11):** the grid abstraction (`db4ca13`) is **accepted** and merged into the best. Re-baseline the best. Round 3 comes next on `claude/0.10-candidate`.
- **M13 (2026-11-11):** round 3 is on `claude/0.10-candidate`. It is bit-identical and covers:
  - units near a tile and units by owner from the unit index;
  - the job search in `optimiseWorkers`;
  - `colonyReport` grouping;
  - `findPath` stopping at once for goals that can't be entered;
  - routes and score read from the owner index.

  The cloud measured −11% to 1700, −24% to 1750 and −36% for the full game. Gate it by the normal Pareto rule.
- **M14 (2026-11-11):** round 3 (`5e02d35`) is **accepted** and merged. 0.10 is close to done. Please run **job 3 (release check)** on the best at this commit, with all five steps of job 1:
  - head starts;
  - both `bench --verify` runs;
  - a CPU profile of the full game (`--year 1850 --keep-playing`) instead of 1700;
  - `npm test` 3 times;
  - both tournaments: Americas `--games 8 --turns 609 --play-on --events --seed 1000`, and Caribbean 8 × 202.

  Compare everything with the job 1 baseline (`2270076`) and with the targets in ROADMAP:
  - head start to 1700 at most 3.5 s;
  - `npm test` at most 6 s;
  - the Americas tournament at most 90 s.

  The tournament tables should match the baseline's: the save/load fix re-recorded hashes, but it didn't change any game. Report any difference in the tables. Wait for a quiet machine (load under 3).
- **M15 (2026-11-11):** thanks for the release check. Two targets are met; `npm test` is the one that isn't, so I split the slowest files: the round trip is now in four files and the job search in two, with no test changed. Please time `npm test` 3 times on the best at this commit (median, wall and vitest's Duration) and list the 5 slowest files. You don't need the gate or tournaments for this one.

- **M16 (2026-11-11):** 0.10 and Beta 1 are merged into `main`. GitHub deleted `claude/0.10-faster-turns` after the merge, so I recreated it at `main` with this message on top; the branch names stay the same so the loop keeps working. Round 4 starts now: it speeds up what Beta 1 (alliances, companies) changed. Two steps:
  1. **New best:** `claude/0.10-faster-turns` is now `main` (0.10 + Beta 1 + docs). Re-measure it into `best.json` (loop step 1).
  2. **Candidate:** `claude/0.10-candidate` is round 4 on top of this best, a stack of six bit-identical commits:
     - colony and unit lists kept by the index instead of walking `s.colonies`/`s.units`;
     - `colonyReport` allocating less;
     - `adjacentTileTowards` searching the nearest neighbours first;
     - `processNatives` working out colony pressure once per native turn;
     - `recordStats` keeping running sums.

     The cloud measured about −15 to −20% on all three games, on a noisy machine. Gate it by the normal Pareto rule; no tournaments (no `[outcomes]`).
- **M17 (2026-11-11):** thanks: round 4 (`527e922`) is **accepted** and is the new best. As Simon asked, the branches get names without "0.10" from now on:
  - the best: `claude/perf-best` (was `claude/0.10-faster-turns`);
  - the candidate: `claude/perf-candidate` (was `claude/0.10-candidate`);
  - your results: `claude/perf-mac-results` (was `claude/0.10-mac-results`; I created it from your `1d63cee`, so push there from now on).

  Both new branches are at the new best (with this message), so there is nothing to gate yet: re-measure the best into `best.json` once, then watch the new names. Read this file from `origin/claude/perf-best` from now on. Please confirm the switch in your next report; I delete the old `claude/0.10-*` branches only after that.

- **M18 (2026-11-12):** Beta 2 is merged into `main`, so the best moves on: `claude/perf-best` is now `main` (Beta 2, with speed round 4) plus this message. Re-measure it into `best.json` (loop step 1). Then gate the candidate.
  - **Candidate:** `claude/perf-candidate` is speed round 5 on top of this best, seven bit-identical commits: land regions so searches for goals on other islands fail at once; `pathIndex` gathering only hostile braves; nearest-first `besideSettlement`; `hostileBraveAt` returning early in peace; `recordStats` reading water once a round; `findPath` and `braveRoute` closing tiles they can't enter; `continueOrders` describing each step once. Gate it by the normal Pareto rule (no `[outcomes]`, no tournaments).
  - **Also, once, in the same sitting:** the gate times only the Americas, and most of this round's gain is in the Caribbean. Please also time the Caribbean full game on both commits, 5 runs each after one warm-up, alternating best and candidate: `node scripts/.bench.mjs --scenario caribbean --year 1750 --keep-playing --quiet` (build it first with `npm run --silent bench -- --scenario caribbean --year 1700 --quiet`, as the gate does). Report the medians and spreads, and check the hash line is the same on both.

- **M19 (2026-11-12):** thanks: round 5 (`c628177`) is **accepted** (full game −12%, Caribbean full game −40%) and is the new best. Both `claude/perf-best` and `claude/perf-candidate` now point at it (with this message), so there is nothing to gate: re-measure the best into `best.json` once on a quiet pull. The next candidate follows when there is one.

- **M20 (2026-11-12):** **paused.** Simon needs the Mac for other work. Run no jobs: no measuring, no gating, no re-measuring the best. If the polling loop is running, stop it (or let it see this message and idle without running anything). Nothing will be sent until Simon says the Mac is free again; a later message will lift the pause.

## Rules for every job

- **Measure only.** Don't change code, tests, `scripts/bench-hashes.json` or snapshots. Never run `npm run bench -- --write` or `npm run test:golden:write`.
- **Same conditions each time.** The Mac is on mains power. Close heavy apps (browsers with many tabs, video calls, builds). Run one measurement at a time, never two in parallel.
- **Repeat timings.** Run each timing 3 times and report the median and the spread. The first run after `npm install` or a fresh build is a warm-up and is not counted.
- **Record the setup:** the commit (`git rev-parse --short HEAD`), the Node and npm versions, and the date and time.
- **Results go on a branch of their own.** Write them to `docs/perf/results/<YYYY-MM-DD>-<job>-<commit>.md`. Commit them to branch `claude/perf-mac-results`: create it from the measured commit the first time, then merge new results into it. Push that branch, and never push to `claude/perf-best`. Commit messages end with a line `Measured on the Mac worker`.
- **Report back.** Send the summary table and the results file's path to the cloud session `session_01Vgy9QYBpiHxzmYr17Ez8zF` (the session that wrote this file) with the session messaging tool, if you have it. If you don't, tell Simon the results branch is pushed.
- **When something fails** (a test, `bench --verify` not "same", a crash), stop that job. Report the exact command and the last 40 lines of output. Don't try to fix it.

## Job 0: set up (once, and again after `package-lock.json` changes)

```sh
git fetch origin claude/perf-best
git checkout --detach origin/claude/perf-best   # or the commit the job names
npm ci
node --version; npm --version
npm run bench -- --verify     # must print "same" for every game; this is also the warm-up
```

## Job 1: baseline (before any 0.10 change)

Measure commit `origin/claude/perf-best` as it is when the job starts. Until the first speed-up lands, that is 0.9's code.

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

Simon or the cloud session names a commit, usually the head of `claude/perf-best` after a speed-up. Do job 0 on that commit, then repeat job 1's steps 1–4 on it. Add a column comparing it with the baseline (seconds and percentage).

Since the first round of 0.10, `npm run tournament` plays its games in parallel (the cores less one); add `--jobs 1` to time it serially as in job 1, and report both when a tournament is timed.

A speed-up that changes game outcomes re-records the hashes on the branch. Its commit message says so, and `bench --verify` then has to be "same" against the new hashes. If the job says the change alters outcomes, also run step 5's tournaments and set their tables side by side with the baseline's.

## Job 3: release check (at the end of 0.10)

Do job 2 on the release candidate commit with all five steps, and compare with the baseline. The 0.10 target for a head start to 1700 is set from job 1's numbers and recorded in `docs/SHIPPED.md` (0.10).

## Job 4: hill-climbing gate (each candidate speed-up)

0.10 works by hill climbing: there is a current best commit, and candidate speed-ups from several branches are tried on top of it one at a time. A candidate is kept only if it passes the verification and is measurably faster. The gate is `npm run perf:gate` (`scripts/perf-gate.mjs`):

- **Verification:** `bench --verify` for the Americas and the Caribbean must print "same" everywhere, and every timed run must end in the same state. If not, the candidate is rejected whatever its speed.
- **Score:** the median of `--runs` timed head starts (default 5, after one warm-up), for each year in `--years` (default 1700).
- **Verdict against `--baseline`:** ACCEPT when no game is slower beyond the noise (2%, or the larger spread of the two runs) and at least one is faster beyond it. NEUTRAL when all are within the noise, REJECT when any is slower.

```sh
npm ci
npm run perf:gate -- --runs 5 --years 1700,1750,1850:keep --save /tmp/best.json   # on the current best commit
git checkout --detach <candidate>
npm ci                                                                  # only if package-lock.json changed
npm run perf:gate -- --runs 5 --years 1700,1750,1850:keep --baseline /tmp/best.json --save /tmp/cand.json
```

Report each candidate's verdict line and the "against" line. Copy an accepted candidate's JSON over `/tmp/best.json` so it becomes the baseline for the next candidate. Both sides must be measured on the Mac in the same sitting: the cloud container's timings vary by about 10% between identical runs, so they can't decide a close call.

## Automation: the polling loop

Simon's Mac pulls every 10 minutes. This section says what to do on each pull, so it runs without anyone watching. Re-read this file from `origin/claude/perf-best` on every pull, because it may change.

**Two branches are watched:**
- `claude/perf-best` is **the current best**. It only moves when a candidate has been accepted (or for docs).
- `claude/perf-candidate` is **the next candidate**: the current best plus one speed-up. The cloud session force-pushes it for every new candidate.

**On each pull:**
1. **New best:** if `claude/perf-best` has a new commit, check whether any file outside `docs/` changed since the last commit you measured. If so, run the gate on it (job 4, `--runs 5 --years 1700,1750,1850:keep`) and `--save ~/cc-perf/best.json`. Keep `~/cc-perf/` outside the repo. If only docs changed, do nothing.
2. **New candidate:** if `claude/perf-candidate` points at a commit you haven't gated, do two things in the same sitting:
   - re-measure the best into `best.json`, unless that was done in the last hour;
   - run `npm run perf:gate -- --runs 5 --years 1700,1750,1850:keep --baseline ~/cc-perf/best.json --save ~/cc-perf/cand-<commit>.json`.
3. **Tournaments:** only when the candidate's commit message contains `[outcomes]`. That marks a speed-up that changes games and re-records the hashes. Also run job 1 step 5's two tournaments on both the best and the candidate.
4. **Record:** write each result to `docs/perf/results/<date>-gate-<commit>.md`. Include the verdict line, the "against" line, the per-run times, and the commit's subject line. Commit to `claude/perf-mac-results` and push.
5. **Report:** message the cloud session `session_01Vgy9QYBpiHxzmYr17Ez8zF` with one line per result, in the form `<commit> <verdict> <the against line>`.

**Ground rules:**
- Never run two jobs at once.
- If a job is still running at the next pull, skip that pull.
- If the Mac is busy with Simon's own work (load average above 3 before a run), wait for the next pull and say so in the report. Don't measure on a busy machine.
- Never push to `claude/perf-best` or `claude/perf-candidate`.
