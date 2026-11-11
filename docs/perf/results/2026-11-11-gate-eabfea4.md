# Gate: eabfea4 (best after round 2)

- Commit `eabfea4`: MAC_WORKER: M10, round 2 accepted. Engine code is round 2's `8cc9e99` merged into the best; `claude/0.10-candidate` points at this same commit, so there is no candidate to gate.
- Re-baseline after the merge. Mac worker (M2, 8 cores, 16 GB, mains power), Node v24.10.0, npm 11.6.0. Load average before: 1.59 (below 3); after: 2.46. Command: `npm run perf:gate -- --runs 5 --years 1700,1750,1850:keep --save ~/cc-perf/best.json`.

```
perf gate at eabfea4: verifying...
  americas: same
    same       seed 7, 150 rounds: f331f0772419d4e4
    same       seed 1492, 150 rounds: 2f417c347defbf72
    same       seed 123456, 150 rounds: e3c120443d34c2da
    same       seed 2024, to 1700: d1464d262ec0ed51
  caribbean: same
    same       caribbean: seed 7, 150 rounds: 310dfc202a7254e7
    same       caribbean: seed 1492, 150 rounds: c17b1f0f7001dbc6
    same       caribbean: seed 123456, 150 rounds: 87ee88f5631e0489
    same       caribbean: seed 2024, to 1700: 457354515fce8c5c
  to 1700: median 1.6 s, spread 0.1 s, runs 1.6 1.6 1.6 1.6 1.7
  to 1750: median 2.2 s, spread 0.0 s, runs 2.2 2.2 2.2 2.2 2.2
  to 1850:keep: median 7.5 s, spread 0.2 s, runs 7.7 7.5 7.5 7.5 7.5
verdict: MEASURED
```

Matches round 2's candidate gate on `8cc9e99` (1.7 / 2.2 / 7.3 s) within noise, apart from the full game at 7.5 s (spread 0.2 s) against 7.3 s then, with one slower run (7.7 s).
