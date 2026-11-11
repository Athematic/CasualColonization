p = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/docs/SCENARIOS.md'
s = open(p).read()
def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)

rep("""Two scenarios exist: **the Americas, 1492–1850** (`packages/engine/src/scenarios/americas.ts`, the original game) and **the Caribbean, 1650–1750** (`caribbean.ts`, the proof that the framework works). Australia and Vinland are planned.""",
    """Three scenarios exist: **the Americas, 1492–1850** (`packages/engine/src/scenarios/americas.ts`, the original game), **the Caribbean, 1650–1750** (`caribbean.ts`, the proof that the framework works) and **the North-east, 1000–1850** (`north-east.ts`, Beta 3: native peoples as nations on a stored map of the North-east, one turn a year from 1000, the Europeans arriving one by one from 1497; registered hidden until the New game screen can offer a people, Beta 3 step 10; [design/native-nations.md](design/native-nations.md), section 13). Australia and Vinland are planned.""")

rep("""- `stored`: the stored maps the scenario offers (`maps/index.ts`), each as `{ id, peoples }`. `peoples` lists the regions (`{ tribe, region: [x0, y0, x1, y1], count }`) where the scenario's peoples live on that map. The same map can serve two scenarios with different peoples.""",
    """- `stored`: the stored maps the scenario offers (`maps/index.ts`), each as `{ id, peoples }`. `peoples` lists the regions (`{ tribe, region: [x0, y0, x1, y1], count }`) where the scenario's peoples live on that map. The same map can serve two scenarios with different peoples. A region may say when its people comes to it or is no longer found there (`from`, `until`, years; `peoplemoves.ts`): a region whose `from` is after the game's first year is left out at setup and placed at the start of that year, and at the start of an `until` year the region's settlements of that people leave the map, unless the people plays (its towns are its player's). The North-east uses them for the Dorset (until 1350), the Inuit (from 1400) and the St. Lawrence Iroquoians (until 1580). An entry may also give the land-health `renewal` of each of the map's regions (below) and a nation's own entry point (`entries`: `{ england: [x, y] }`, a water tile), which replaces the spacing along the arrival edge for that nation.""")

rep("""- `grid`: the shape of the tiles, see [The map grid](#the-map-grid). Optional; squares when absent.
""", """- `grid`: the shape of the tiles, see [The map grid](#the-map-grid). Optional; squares when absent.

A stored map may draw **regions** of its own (`StoredMap.regions`: a second grid of the same size, one character per tile, and the list of regions with their `char`, `id` and `name`; every tile in one, water included). Where the game's stored map has them, hard years, land health and epidemics are drawn by them (`land.ts` `regionOf`, `regionName`, `regionRenewal`; `GameState.land.map`) instead of squares of `landHealth.regionSize`, and each region renews the furs and game the scenario's map entry gives it (`StoredMapEntry.renewal`, by region id; missing means `landHealth.renewal`). The North-east map has fifty.
""")

rep("""The arena (`packages/engine/src/arena.ts`) and `npm run tournament` play a scenario with `--scenario <id>`;""",
    """The arena (`packages/engine/src/arena.ts`) and `npm run tournament` play a scenario with `--scenario <id>`; a scenario with no generated map plays on its default stored map. Where the scenario has playable peoples, they all play at the computer people's level (`ArenaOptions.peoples`; `--peoples id,id` for some of them, `--peoples none` for none), each game line lists them, the colonies and the game's time, and the run prints the peoples' table: per people its games, how often it was still in the game at the end, its towns, people, council and score, and its wins by way; then the winners' ways per game, the military victory's share, the conditions continuity and a good life failed on, the Europeans' colonies and the time a game took (`formatPeoples`). A nation that had not arrived when a game stopped has no row. For the North-east: `npm run tournament -- --scenario north-east --games 24 --turns 851 --play-on --events`.""")

# Computer players: dates
rep("""- `islands`: the land is islands,""", """- `dates` (Beta 3 step 8): the computer players' turn thresholds are the Americas' dates: `aiTurn` reads a threshold as the Americas' year of that turn and gives the turn of the same year in this scenario's calendar, so a game that starts long before the Europeans arrive (the North-east, from 1000) keeps their plans to the Americas' years. `pace` is then not read.
- `islands`: the land is islands,""")
open(p, 'w').write(s)
