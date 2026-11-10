# 0.10 round 2: speed-ups that may change outcomes

Branch `perf/outcomes`, on top of `claude/0.10-candidate` (`e3c5428`: round 1 and the AI planning
speed-ups). Measured in the cloud container (4 cores, shared with other sessions: load average 3 to
9 during the runs, so timings are rough; the Mac worker's gate decides).

## What was kept

Four commits. All four turned out to leave every measured game unchanged, so no hashes are
re-recorded and no commit carries `[outcomes]`:

| Commit | Change | Games |
| --- | --- | --- |
| goTo / setDestination with a found path | the AI's "find a route, then go there" searches once | identical by construction |
| follow a found route | continueOrders walks the route it found for the whole move; searches again only when the next step is blocked | not identical by construction (a fresh search may break a tie differently), identical in every game measured |
| aiColonyReport | colony reports kept for the rest of a computer player's turn, checked against workers' jobs, goods, buildings, liberty, tax, fathers, independence, events | identical by construction |
| site scores per nation-turn | siteScore / keenSiteScore kept by tile while bestColonySite searches | identical by construction |

Checked for each: `bench --verify` for the Americas and the Caribbean "same" (8 games), the golden
and Caribbean golden tests unchanged, and the two reference tournaments (Americas 8 × 609 turns
play-on, Caribbean 8 × 202, seed 1000) print exactly the baseline's tables.

Head starts (seed 2024; interleaved runs, median of 3, wall seconds as the bench prints them;
CPU is the process's user + system time):

| Build | to 1700 wall | to 1700 CPU | to 1750 wall | to 1750 CPU |
| --- | ---: | ---: | ---: | ---: |
| candidate `e3c5428` | 4.1 | 6.4 | 6.1 | 9.0 |
| + goTo | 3.9 | 6.5 | 5.6 | 8.7 |
| + follow the route | 3.9 | 6.3 | 6.2 | 8.3 |
| + aiColonyReport | 3.7 | 6.3 | 5.9 | 7.6 |
| + site scores | 3.7 | 6.2 | 6.0 | 7.9 |

An earlier, quieter pair of runs gave goTo 3.9 → 3.8 s and following the route 3.8 → 3.4 s
to 1700. Overall about 10% to 1700 and 10–15% (CPU) to 1750.

## What was rejected: re-planning colony workers less often

`optimiseWorkers` is the largest single AI cost (about 16% of a head start to 1700). The tried
change skipped its job search in a colony where the last search moved no one, while the workers,
their jobs, the buildings, the build target and the arming/curbing mode were unchanged, for up to
N turns (the starvation check still ran every turn). Variant A: N = 4 always. Variant B: N = 2,
and never while arming, following an independence plan, or at war. Both made a head start about
25% faster (77 rounds from the same saved turn-231 state: 2.3 s → 1.4–1.8 s).

Both made the advanced levels clearly weaker, with more lost Wars of Independence. Americas,
`--games 8 --turns 609 --play-on --events`, seeds 1000, 2000 and 3000 pooled (24 games):

Variant A (N = 4):

| Level | Score before | Score after | Δ | Wins | Colonies | Colonists | Indep. won/lost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Creative | 488.0 | 429.3 | -12.0% | 3 → 2 | 6.9 → 6.9 | 74.4 → 71.5 | 13/2 → 8/5 |
| Combative | 710.1 | 654.0 | -7.9% | 15 → 18 | 16.6 → 14.1 | 149.6 → 133.8 | 4/1 → 5/4 |
| Competent | 469.5 | 386.2 | -17.7% | 5 → 3 | 6.4 → 5.9 | 83.5 → 71.9 | 9/5 → 7/8 |
| Naive | 287.3 | 286.6 | -0.2% | 1 → 1 | 13.0 → 13.0 | 89.5 → 91.6 | 0/0 → 0/0 |

Variant B (N = 2, peacetime only):

| Level | Score before | Score after | Δ | Wins | Colonies | Colonists | Indep. won/lost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Creative | 488.0 | 385.0 | -21.1% | 3 → 4 | 6.9 → 6.0 | 74.4 → 64.9 | 13/2 → 7/9 |
| Combative | 710.1 | 638.7 | -10.1% | 15 → 16 | 16.6 → 13.0 | 149.6 → 125.9 | 4/1 → 8/1 |
| Competent | 469.5 | 381.1 | -18.8% | 5 → 3 | 6.4 → 5.7 | 83.5 → 73.6 | 9/5 → 5/8 |
| Naive | 287.3 | 266.0 | -7.4% | 1 → 1 | 13.0 → 12.4 | 89.5 → 82.3 | 0/0 → 0/0 |

In the Caribbean (`--games 8 --turns 202 --events`, seeds 1000 and 2000, 16 games) neither
variant mattered (Variant A: Creative -4.9%, the others +5–6%; Variant B: Creative +0.3%,
Combative +7.3%, Competent -1.0%, Naive -0.2%, Combative and Competent swapping places), but the
Americas results rule both out.

How noisy 8 games are: the unchanged code, seeds 1000–1007 against 2000–2007, differs per level
by -34% to +8% (Competent 526.8 against 348.8), and 16 games against seeds 3000–3007 by -22% to
+22%. A 5% bound per level can only be judged on many more games than 8; 24 were used here, and
both variants lost on all three advanced levels.

Not tried: colonyDefences and expansionCheck per turn (under 1% of a head start since the AI
planning round).
