# Shipped

What has shipped, by version, oldest first, with each release's table as it stood when it shipped. What is still ahead, including the few rows left open here, is in [ROADMAP.md](ROADMAP.md).

## 0.3: Quality of play (done)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Cheat menu with a permanent cheated marker | M | P1 | done |
| Trade routes for ships and wagon trains; computer players stop goods spoiling (warehouses, routes, selling to natives) | L | P1 | done (spoilage −30% for advanced levels) |
| Turn-start modal with every decision and notice; turns-to-arrive badge on the go-to marker; stronger end-turn pulse | M | P1 | done |
| Progress statistics every turn, a Progress Graphs screen, shown when the game ends | M | P1 | done |
| Audit of which features each computer level uses; computer players build roads and buy ships | M | P1 | done (see [AI_FEATURE_AUDIT.md](AI_FEATURE_AUDIT.md)) |
| Next computer-player gaps from the audit: Combative's idle army, missions and native trade, schools and custom houses earlier, buying experts, declaring independence, refusing taxes | M | P2 | planned |
| New game screen previews planned options | S | P3 | done |
| Rivers (minor and major): road-like movement, production bonus, in generated and stored maps, drawn in both styles, valued by the computer players | M | P1 | done |
| Difficulty levels (prices, taxes, native tension, size of the Royal Expeditionary Force, computer-player strength) | M | P2 | done (five levels in one `DIFFICULTY` table; they apply to the people's nations, computer players keep standard economics and their chosen level) |

## 0.4: Favoured Nation, the first thing the original could not do (done)

Design: [design/favoured-nation.md](design/favoured-nation.md)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| A market for every nation's home port, with supply and demand like the player's | L | P1 | done (each nation already had its own market; ships in a partner's port trade in, and move, the partner's market) |
| Taxes for every nation: computer nations raise and accept taxes, and boycott | M | P1 | done (every nation has a tax rate and computer nations get raises; the port nation's rate applies in its port; Competent, Combative and Creative refuse raises on minor goods or goods a partner's port takes, and pay arrears when it pays; Naive accepts) |
| Trading with other Europeans: trade routes with stops at a foreign colony, by agreement | M | P1 | done (trade agreements, foreign stops that sell to and buy from the colony; computer players propose agreements to their neighbours and run ship and wagon train routes to partners' colonies that need their goods) |
| Favoured Nation status: unlocked by years of peace plus trade routes, agreed by both sides, refusable by computer players, cancellable with consequences | L | P1 | done (seeded hidden thresholds, cancellation with seizure, waiting and hostility, independence lapse, hot-seat rules, save format 3; computer players build routes towards it, propose it with seeded cooldowns, and cancel it rarely and only for a reason; `--no-favoured` for tournaments) |
| Trading and buying ships (not warships) in a favoured nation's home port, at its prices and taxes | M | P1 | done (port choice when sailing, a Europe screen per port; computer players choose the port by the cargo's price after tax and trade in partners' ports) |
| Triangle trading by the Creative computer players when prices allow | M | P2 | done (buys where a good is cheap and sells it in the port that pays clearly more) |
| Diplomacy screen shows relations, years of peace, trade volume, and progress towards Favoured Nation | S | P1 | done (in words only, never the hidden thresholds) |

## 0.5: The classic game, part 1 (natives and the Crown) (done)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Visible native braves: wandering, visiting, trading, demanding, attacking | L | P1 | done |
| Armed and mounted braves | S | P2 | done |
| Buying goods from native settlements | S | P1 | done |
| Burial grounds; surrender of a tribe after its capital falls | S | P2 | done |
| Missionaries denouncing rival missions and inciting tribes | S | P3 | done |
| A Royal Expeditionary Force that grows during the game, visible to the player | M | P1 | done |
| Royal demands for gold; royal wars | M | P1 | done |
| Advisor reports (colony, trade, military, naval, religion, natives, Congress, history) | M | P1 | done (eight tabs, `A`/`F1`–`F8`; engine keeps a capped history and a goods ledger) |
| Computer players reach a winnable War of Independence (they now only declare when their defence beats the grown royal army, and never get there: staff armories, build artillery, plan earlier) | M | P2 | idea |
| Brave sprites (plain, armed, mounted) in SPRITE_PROMPTS.md | S | P3 | done (prompts in pull request #11) |

## 0.6: A living world (done)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Event framework: seeded, toggleable from the Game menu, off in tournaments by default | M | P1 | done (`events/`, [design note](design/events.md); own seeded stream, `setEvents` command, `--events` for tournaments) |
| Historical events (a starter set) | M | P1 | done (9 events, 1522–1763) |
| Random events in the Sim City spirit (a starter set) | M | P1 | done (12 events, 7 with a choice) |
| Road to…: a pioneer builds a road along a path to a chosen tile (as in Civilization II). Each turn it roads its tile (skipping tiles that already have one), then moves to the next. It stops with a report if its tools run out, the path is blocked or the target becomes unreachable. Path preview before confirming; the computer players use it for their road plans | M | P2 | done for human players (the computer players still plan single tiles and are unchanged) |
| Railroads (from about 1830, needs a Founding Father or a building): faster than roads, built on top of a road | M | P3 | idea (later release) |
| Rivers and roads meander a little instead of running straight between tile centres (drawn, with a fixed wobble per tile, so they don't move between frames) | S | P1 | done (shared curves in `@cc/render-api` `meander.ts`, used by Ligne claire, Schematic and the minimap) |
| Title screen: add the new box covers once generated (F–K for the Americas; L–M and N–O later, with their scenarios) | S | P2 | done for F–K (L–O wait for their scenarios) |
| Computer players space colonies and expand at a measured pace: sites that share work tiles with another colony count those tiles at a quarter, bonus resources, rivers, rich food and the coast are chased; a new colony only once the others average three colonists (2.5 Combative), at most one every 6 turns (4 Combative), with a defender or stockade for each colony beyond the first two, and the charter paid with the reserve kept | M | P1 | done ([audit note](AI_FEATURE_AUDIT.md#colony-spacing-and-pace-06); `ai/common.ts` `siteScore`, `keenSiteScore`, `bestColonySite`; `ai/advanced.ts` `expansionCheck`, `sendSettler`; `AiProfile.expansion`) |
| Colony charter: founding costs gold (100 × colonies held, at most 2,000, times difficulty; free after independence; `GameConfig.colonyCharter`, on in new games and tournaments, `--no-charter`) | S | P1 | done (`charterCost`, `COLONY_CHARTER` and `DifficultyRules.colonyCharter` in `rules/difficulty.ts`) |

## 0.7: The classic game, part 2 (done)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Mercenaries; foreign intervention force; Tories after the declaration | M | P2 | done (computer players' declarations: see the row on a winnable War of Independence below) |
| Damaged artillery, ambush bonus, fortresses and coastal forts, capturing equipment | M | P2 | done |
| Mines running out | S | P3 | done |
| Abandoning a colony; retiring early | S | P2 | done |
| Computer players build more buildings (the scoring review found 0–3.5 building points per nation at turn 200): build plans favour docks, schoolhouses, level-2 workshops and warehouses earlier | S | P2 | done (carpenters valued as builders in colonies of four, shops upgraded from one worker in colonies of six, outright hurrying with spare gold, printing presses, armories, stockades and forts under an independence plan; building points about doubled: Creative 28 → 52.5, Competent 15.5 → 35.5, Combative 16.8 → 38 in 4 games of 330 turns; see the audit, "Independence planning and buildings") |
| Computer players reach a winnable War of Independence | M | P2 | partly done: an independence plan from mid-game (`ai/plan.ts`: liberty, defences, arming with muskets and horses, fewer bells and no new colonies near the declaration), a declaration rule that waits until the defence can hold without the intervention and no third of the colonies is weak (tiny outposts are abandoned first), and a war that holds the colonies, strikes landed troops and reinforces the threatened colony. In 4 games of 330 turns: 1–3 declarations (none before), 3 of 4 wars won in 11–14 turns; Creative declared in 1 of 4 games (lost), short of the goal of half. Left: concentrating troops where the King lands, a stronger Creative economy, longer tournaments (see the audit) |
| Performance pass: profile computer turns and the map renderer; a head start to 1700 currently takes about 100 seconds. Goal: under 30 seconds, with identical game outcomes | M | P1 | done for the computer turns: `npm run bench` (seed 2024, the web head start to 1700) went from 43–46 s to 12–14 s in Node and from 40 s to 14 s in Chromium (Skip ahead), with the same final state hash on four seeds (`npm run bench -- --verify`). Fixed: the worker optimiser's unit scans (one pass per colony, shared until a job changes), the path search (heap, reused buffers, per-search context, the first step reuses the route just found) and array-building lookups. The map renderer was not part of this pass (Skip ahead draws nothing); speed-ups that would change games are listed in the README's Performance section |
| Scoring review: reward well-developed colonies (buildings, experts, production, liberty) and not only headcount, to fit the colony charter and the measured pace | S | P1 | done (`score.ts` `SCORE_WEIGHTS`, `scoreBreakdown`; breakdown table in Progress and on the game-over screen; the arena prints the split per level) |

## 0.8: Polish and leftovers (done)

Closes the smaller items left from earlier releases while the classic game is complete.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Difficulty follow-ups: scale hurry-buy costs; computer ship buying uses adjusted prices; tune values against the original | S | P3 | done except tuning (`hurryCost` in `DIFFICULTY`: 0.7 to 1.3; `ai/fleet.ts` prices ships with `trainPrice`; identical at Conquistador; tuning the numbers against the original is left for later) |
| Rivers follow-ups: draw roads along rivers only as bridges, smooth diagonal seams, river defence bonus, Cooper Creek and the Yukon | S | P3 | done except the Yukon (roads only cross or leave rivers, with plank bridges; river strokes overlap a hair at tile joins; +25% defence across a river; Cooper Creek ends in Lake Eyre, now a lake tile; the Yukon's mouth lies west of the North America map's edge, so it waits for a larger map) |
| Port character: each home port gets its own starting prices, demand and ship prices (for example cheap trade goods in Amsterdam, furs dear in La Rochelle, silver in Seville, cheap ships in Lisbon), so Favoured Nation access and triangle trading pay off. Scenario data per nation | M | P2 | done (`rules/ports.ts`: `PORT_CHARACTER` keyed by nation in the shape of the scenario framework's `NationEntry.port`, with price, depth, recovery and ship-price factors; shown in the Europe screen, the Trade report and the route screen. Triangle trades still almost never happen: the gate is ships, not prices; see the audit, "Port character (0.8)") |
| Find why Creative scores about 14 points less with Favoured Nation on | S | P2 | done (detours and wagon trains spent on trade with partners' colonies that gained nothing while building ties, and wagon trains taken from native trade: Creative −27 ± 14 → +6 ± 17 in 48 games; Favoured Nation now forms less often. See the audit) |
| Trade routes may call at a favoured partner's port, not only the home port | S | P3 | done (`RouteStop.port`; falls back to the home port with a report when the partnership ends; computer ship routes use a partner's port when the route's goods fetch 15% and 150 gold a trip more there) |
| Founding Father portraits in the Continental Congress screen and the father choices (once generated) | S | P2 | done (sprites appear once uploaded) |
| Continental Congress hall: the fathers who have joined as full-length figures in a great hall (`K`), full figures in the father choice, head crops for small icons | M | P2 | done (procedural hall and figures now; `ui/congress-hall`, `fathers/<id>` figures and `__head` crops appear once generated) |
| Wire in the new brave, damaged artillery and fortress sprites (once generated) | S | P2 | done (sprites appear once uploaded) |
| Tune event rates and the computer players' event choices (one tournament with `--events`) | S | P2 | done (random rate 4% → 1.2%, about 10 events per nation per game; war levy and tension valued sensibly; per-event table in `--events` output; [design note](design/events.md)) |
| Tessellated terrain tiles: edge and corner pieces that blend neighbouring terrains, as a sprite-pack feature (Simon's idea, see CHANGE_SUGGESTIONS.md). Design and the `rules.transitions: 'overlay'` pack option are in ([design/tessellated-tiles.md](design/tessellated-tiles.md)), off by default; left: generate the 12 trial images (SPRITE_PROMPTS 4.8a), look at them on a map, then the other terrains | M | P2 | trial |
| Seed phrases: the Game seed field also accepts text ("Peters Game"), hashed to a seed number, so a game is easy to share by name. Numbers keep working; the phrase is shown with the game and in saves. The same phrase gives the same world only with the same settings (map, nations, difficulty, options) and game version, so a share link or code could carry those too | S | P3 | done (seed phrases, game codes, share links and a QR code; Simon's idea) |
| Terrain variants: several sprite variants per terrain (`terrain/<id>__v2` …), chosen per tile from the map position so neighbours rarely repeat (Simon's idea); `rules.variants` | S | P2 | done |

## 0.9: Scenario framework

Done before Beta, so the cooperation rules are scenario data from the start. See [design/scenarios.md](design/scenarios.md), and the detailed design for this release, [design/scenario-framework.md](design/scenario-framework.md) (status: built in 0.9): an inventory of everything hard-wired to the Americas, the `Scenario` definition, games kept bit-identical, a proof scenario and a phased plan.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Scenario framework: map, nations, peoples, goods, units, Congress figures, era, events and victory as a data package; the Americas become the first scenario | L | P1 | done: the `Scenario` type and registry (`packages/engine/src/scenarios/`), with the calendar, selections, effects as modifiers at named hooks, ten mechanics switches, victory kinds, score, difficulty and rumour overrides, map generator settings, settlement kinds, terms, nations wholly per scenario, covers and the council hall per scenario; the Americas stay bit-identical (golden test and `bench -- --verify`). How to write a scenario: [SCENARIOS.md](SCENARIOS.md). Plan steps 0–9 in [scenario-framework.md](design/scenario-framework.md), section 8 |
| Each scenario offers a dedicated map or a generated one, and real rivals or alternative history | M | P1 | done: the New game screen has a Scenario select and a Rivals select (the Americas: real rivals England, France, the Netherlands and Spain; the Caribbean: England, France, the Netherlands, Spain and Denmark) and takes the maps, sizes, nations and start years from the chosen scenario; game codes carry the scenario; the tournament, arena and bench take `--scenario` and `--rivals` |
| Proof scenario that exercises the framework with little new art (proposed: The Caribbean, 1650–1750: the lesser powers) | M | P1 | done: The Caribbean, 1650–1750 is playable from the New game screen: 202 spring and autumn turns, a stored map of the real Caribbean drawn from coordinates (the default) or a generated archipelago, England, France, the Netherlands, Spain and Denmark with Courland, Brandenburg, Scotland and the Order of Malta, the Arawak, the Kalinago (new) and the Tupi, no furs, a Colonial Council of 14 Founding Fathers and three new members (Henry Morgan, William Dampier, Maria Sibylla Merian), its own events (the 1666 hurricane, the Port Royal earthquake, Darien), no REF or independence, victory by score in 1750; tournament reference and bench hashes recorded ([scenario-framework.md](design/scenario-framework.md), section 7.1, "As built"). Portraits and a cover still to generate (sprite work waits, see 0.10) |

## 0.10: Faster turns (done)

**Result on the Mac worker (release check, [results](perf/results/2026-11-11-job3-ef3b681.md)):** head start to 1700 6.6 → 1.2 s, to 1750 10.8 → 1.5 s, full game to 1850 3.8 s; Americas tournament (8 × 609 turns) 318 → 9.4 s; games unchanged (tournament tables identical to the baseline). Also in 0.10: save and load no longer change a game (a determinism fix with a round-trip test), and `bench --keep-playing` for timing full games.

Before Beta 1 (Simon, November 2026): the computer players' turns are slow, and that slows every head start, test run and tournament. Speed-ups may change game outcomes, so the bench and golden hashes are re-recorded once, deliberately, and a tournament before and after (8+ games) shows the computer players play as well as before. Sprite work waits: generating images through the OpenAI API has become too expensive for the expanded sprite set; locally run diffusion models on Simon's MacBook (M2) are an option later.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Profile a computer turn and a head start (to 1600, 1700) and set targets (head start to 1700 well under the current ~12 s). All timings run on the Mac worker (Simon's M2), from the jobs in [perf/MAC_WORKER.md](perf/MAC_WORKER.md) | S | P1 | done: baseline on the Mac worker ([results](perf/results/2026-11-10-job1-2270076.md)): head start to 1600 0.7 s, to 1700 6.6 s, to 1750 10.8 s; Caribbean to 1725 0.7 s; `npm test` 9.2 s; Americas tournament (8 × 609 turns, play-on) 318 s. Targets on the Mac: head start to 1700 at most 3.5 s, `npm test` at most 6 s, the same tournament at most 90 s. Hot spots: `colonyWorkers`, `unitsAt`, `findPath`, `optimiseWorkers` (26% together) |
| Speed-ups that keep outcomes: caches and cheaper queries, checked bit-identical by the golden test and `bench -- --verify` | M | P1 | done, by hill climbing: each candidate was gated on the Mac (`npm run perf:gate`: verification first, then the median of timed games against the current best). Accepted: round 1 (unit and colony indexes, path search), the AI planning round, round 2 (one path search instead of two, routes followed for the whole move, AI report and site-score caches), round 3 (units by owner and near a tile from the index, the colony job search, `colonyReport` grouping, path searches to goals that can't be entered end at once). Games are bit-identical throughout; both tournaments' tables match the baseline exactly |
| Speed-ups that change outcomes (each 10–20%: follow a found route for the whole turn, sharper path estimate, re-plan colony workers less often, keep colony reports per computer turn), hashes re-recorded once, tournament before and after | M | P1 | done: following the route and the report cache turned out bit-identical in every measured game (kept, in round 2); re-planning workers less often was faster but made the advanced levels clearly weaker over 24 games (−8% to −21%), so it was rejected ([note](perf/round2-outcomes.md)) |
| Faster tests and tournaments: the slowest test files and the tournament runner (parallel games where the machine allows) | S | P2 | done for tournaments: games run in worker threads (`--jobs N`; tables identical to a serial run). `npm test` stays at about 9 s on the Mac (target 6 s not met): the suite is bound by total CPU time (about 55 s of tests on 8 cores) after the save/load round-trip test was added, so splitting files made it slower (10.5 s; reverted). Getting under 6 s would mean shorter test games, which weakens them |
| Renderer performance pass (frame time on large maps, sprite pack drawing) | S–M | P2 | done as measurement: computer turns and head starts run in a Web Worker, so the page no longer freezes (head start: about 60 long tasks of up to 0.5 s before, at most one short one after); scrolling holds 60 fps on a large map in all three styles, about 1–1.5 ms of main-thread work per frame, with no single big cost to remove |
| Grid as an engine abstraction: directions, neighbours, distance, "tiles within N" and the colony work area behind one grid definition, squares the default, games bit-identical (golden test and `bench --verify`); the hand-written square loops (about 10 engine files and the colony screen) use it. Step 1 of hex maps (see Later); the Mac benchmark shows it costs no speed | M | P2 | done: `packages/engine/src/grid.ts` (the `Grid` interface and `SQUARE`), `Scenario.map.grid` (squares when absent, see [SCENARIOS.md](SCENARIOS.md#the-map-grid)); games bit-identical; the Mac gate showed no speed cost |

## Beta 1: Cooperation between Europeans

Builds on 0.4. Released on 11 November 2026 (pull request #19).

Beta 1, cooperation between Europeans: design in [design/cooperation.md](design/cooperation.md) (C1–C11 decided by Simon, November 2026). Built: steps 0–6; the choices made while building are in its section 9, confirmed by Simon (concord's share raised to 0.7).

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Step 0: the `Treaty` record (kind, parties, terms, start, end); trade agreements and Favoured Nation moved into it (C9); the treaty list in Foreign Affairs | M | P1 | done: games behaviour-identical, hashes re-recorded for the new state layout only |
| Step 1: alliances (unlocking after Favoured Nation, proposals and invitations, defensive pact, open colonies with garrisons and trade, shared sight, leaving with longer hostility; computer rules per level); `mechanics.alliances`, `Scenario.alliances`, `Scenario.ai.cooperation` | L | P1 | done; on in the Americas and the Caribbean (re-recorded once, `[outcomes]`). Shared bells wait for step 4 |
| Step 2: `gameOver.winners`, the `concord` victory; game-over screen, arena and tournament tables | M | P1 | done: Americas 24 games, an alliance in 5, concord in 1; no alliance in the Caribbean yet (no Favoured Nation forms there) |
| Step 3: chartered companies (`kind: 'company'` players, shares, dividends, company AI) | L | P1 | done: named by the scenario (`nations.companies`), neutral, scores counted for shareholders; on in the Americas and the Caribbean (cheaper and more common there) |
| Step 4: joint expeditions and shared bells | S–M | P2 | done: a tenth of each ally's bells helps the others' Congress; a scout funded half each, gold shared |
| Step 5: confederation, declaring independence together | M | P2 | done: one war for both, won or lost together; computer allies answer by their readiness; on in the Americas |
| Step 6: tuning with tournaments (alliances, companies, concord's share, the Caribbean's cooperation), docs | M | P1 | done (`[outcomes]`): old friends ally after a long peace (`alliances.longPeace`), allies wait to declare together, companies keep a treasury and pay dividends, Caribbean companies come earlier. Americas 24 games: alliance in 8, concord 2, company 3; all-Creative 96 games: alliance in 26, confederation 3; Caribbean 16: company in 8, 318 gold of dividends a game. Decisions made while building in the design note, section 9 (confirmed) |

## Beta 2: Native peoples as partners

Builds on 0.4 and Beta 1. Released on 11 November 2026 (pull request #22). Design: [design/native-partners.md](design/native-partners.md) (status: `built`; N1–N14 decided by Simon, 11 November 2026, as recommended, with the five fixes of today's native rules in step 0). A people becomes a partner, with agreements that bind both sides, and a way to win by prosperity in partnership.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Step 0: a people as a treaty party (party helpers), `peopleRelations`, `peoples.rules`, the `burialGrounds` and `surrender` switches, `landRadius`, and five fixes of today's native rules | M | P1 | done (section 8 of the note) |
| Step 1: the trade treaty with a people (`people-trade`): unlocking from the standing record, proposals and the people's seeded answers and own offers, better prices and goods, more trade visits, route stops at partner settlements, breaking faith, computer nations per level, the Native peoples card | L | P1 | done; on in the Americas and the Caribbean (section 9) |
| Step 2: land use (`land-use`): a lease of a trade partner's land beside the nation's colonies for a yearly rent per tile (`Tile.use`, `LandUseTerms`), the rent paid each year or the lease lapses, leased tiles marked on the map, "Lease land" in Foreign Affairs and on the colony screen | M–L | P1 | done; on in the Americas and the Caribbean (section 10) |
| Step 3: cultural exchange (`exchange`): a settlement teaches the partner again 25 ± 5 years after it last taught, chiefs welcome the partner's scouts again once a decade, the people gathers 25% more | M | P2 | done; on in the Americas and the Caribbean (section 11) |
| Step 4: mutual defence (`defence`): an attack on the people is war with its partner, the people's braves defend the partner's colonies near it and fight the King's troops in a revolt, nobody can incite the people against its partner; then Simon's decisions: Combative makes no defence pacts, braves find their way with a path search and move to defend as if following a river | L | P2 | done: a pact in 12 of 48 Americas games, 9 of 16 in the Caribbean (sections 12 and 13) |
| Step 5: the `prosperity` victory: at the end year, every nation at peace with each people it has met for 30 years, that never burned a settlement, with treaties with half the peoples met and 0.8 of the best score wins; its partner peoples named on the game-over screen | M | P1 | done: the Americas `[independence-war, concord, prosperity, time]`, the Caribbean `[concord, prosperity, time]` (section 14) |
| Step 6: tuning with 96-game tournaments on two seeds against N12 and Beta 1's C11 | M–L | P1 | done (`[outcomes]`): every N12 target met in 192 four-level Americas games (a trade treaty in 191, land use 49%, exchange 55%, defence 1 in 3.6, a breach 1 in 2.8, prosperity 1 in 21); C11's rates as in Beta 1; no level weaker than before (section 15) |

## Beta 3: Native nations

Builds on Beta 2 (whose people treaty party was made to grow into this) and Beta 1 (a non-European player). Released in November 2026. Design: [design/native-nations.md](design/native-nations.md) (status: `built`, released; T1–T22 decided by Simon, 11 November 2026, all as recommended except T16 (one turn a year), T17 (the Norse wait for Vinland, Beta 4) and T21 (no save compatibility); T10 and T14 decided after a rewrite from the peoples' own view). The history behind the North-east, with its sources and the items still to be checked, is in [research/north-east-peoples.md](research/north-east-peoples.md).

A native people becomes a nation type of its own, played by a person or the computer, with its own units, buildings and council and no Home Port. A new scenario, the North-east, 1000–1850: start as a people in the year 1000 and face the Europeans as they arrive from 1497, one turn a year, with head starts for a shorter game. A people wins by continuity, a confederacy of peoples, a good life, or by defeating every European nation. The Americas and the Caribbean play exactly as before (bench and golden hashes; the Americas' hashes re-recorded once for the people id `haudenosaunee`, with proof that the states are byte-identical but for the id).

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Step 1: the nation type: `PlayerId`, `kind: 'people'`, `playerKind` and one systems table (the company checks moved onto it); Europe-only systems off for a people; per-type selections of units and buildings; a people player at setup with its settlements as towns | L | P1 | done (section 7 of the note) |
| Step 2: economy and growth without Europe (T10): the people's units and buildings, hunting, fishing, gardens and crafts, births from food above a town's reserve, stores, housing and hunger, elders teaching, hard years and land health per region (`mechanics.hardYears`, `mechanics.landHealth`), a people's claimed land | L | P1 | done (section 8) |
| Step 3: the council system (T8, T9): `Scenario.councils`, the Continental Congress as one council, a people's council (household, land, knowledge, defence and peace) with collective members and source lines | M | P1 | done (section 9; members drafted for review) |
| Step 4: diplomacy from the people's side (T11, T12): Beta 2's treaties proposed and broken by a playing people, treaties between peoples, war and peace between any players, trade for gold, epidemics behind a switch | L | P1 | done (section 10) |
| Steps 5 and 6: knowledge of the land as a trait of the people nation type (T13); arrivals (`NationEntry.arrives`, T18) | S each | P1, P2 | done (section 11) |
| Step 7: victory and score (T14): `continuity`, `confederacy` with the `league` treaty kind, `good-life` and the military victory, both sides judged at the end year (`gameOver.ways`), the independence keep-playing question, a people's score lines | M–L | P1 | done (section 12) |
| Step 8: the North-east, 1000–1850: a stored 84 by 74 map from Natural Earth data with thirty-one rivers and fifty land-health regions, nineteen peoples researched with sources (the Haudenosaunee, the Wendat, the Mi'kmaq and the Innu playable), the Europeans arriving one by one at their own entry points, its own events | L | P1 | done (section 13; history drafted for review) |
| Step 9: computer peoples per level (stores, restraint on the land, treaties and leagues by profile) and the North-east's tuning against T15 | L | P1 | done (section 14) |
| Step 10 and 10b: the interface: the New game screen offers the scenario's peoples (the North-east on it, a person plays a people by default); the town screen, the council house, Foreign Affairs and a Trade report from the people's side; claimed land's borders and a Land overlay; a Victory report; procedural art for towns and units; peoples sharing maps and exploring | M–L | P1 | done but for the Mac sprite trial (sections 15 and 16) |
| Clean-up: every nation type's selection in one place (`nationTypes`), unused helpers removed, the research in its own file | S | P2 | done (section 17) |
| Land: one id per people (`haudenosaunee`, the Americas still saying "Iroquois" through `peoples.overrides`, `seedKey` keeping their seeded draws), continuity per people, Europeans buying or taking a playing people's land (`mechanics.landSales`; the land dialog for a person) | M | P1 | done (`[outcomes]` for the Americas' hashes only; section 18) |
| Land, second round: the Europeans press on the homelands gently (`landSales.pull`), each level's way with land (Combative takes, Competent and Creative lease and offer first), trust grown in peace, a good life counting the sides met in person, a new runner | M | P1 | done (section 19) |
| Tuning against step 9's targets (48 North-east games, seeds 3000 and 4000) | — | P1 | a people wins in 9 of 48 (19%; target about 1 in 5); every computer people survived (target 3 in 4); confederacy in 5 of 48; no military win (target 1 in 100 or fewer); Europeans still grow (colonists per nation: Competent 30.4, Combative 32.0, Creative 27.2, Naive 12.8) |

## Scenarios (content)

Done outside a numbered release:

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Australia map (geography preview with the current rules; ships arrive from the west) | M | P2 | done |
