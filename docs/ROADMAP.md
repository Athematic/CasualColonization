# Roadmap

The one plan for Casual Colonization. We decide the priorities here together. New ideas first land in [CHANGE_SUGGESTIONS.md](CHANGE_SUGGESTIONS.md) (the inbox). Once discussed, an idea moves into a release below, goes to **Parked**, or is **Rejected** with a reason.

**How it works**
- One release at a time, each with a theme.
- **Branches:**
  - `main` is what is released: what runs on https://casual.spence.dk/.
  - Each release is built on its own branch, made from `main` and named after the release, for example `claude/0.6-living-world`. Agents work in isolated copies and merge into it.
  - Side projects (tools and so on) get their own short branch.
- **Pull requests:** a release (or side project) reaches `main` through a pull request. CI runs on it, Simon reviews and merges. `site/` is rebuilt (`npm run release`) in that pull request.
- **Tags:** none for now. Simon decides when to copy `site/` to the server.
- Anything bigger than M gets a short design note in [docs/design/](design/) before it is built.
- Changes to the computer players come with tournament numbers (`npm run tournament`, `--features` for the feature-use audit), so "smarter" is measured.
- Status: `idea` → `design` → `planned` → `in progress` → `done`.
- Sizes: **S** = hours, **M** = a day, **L** = several days, **XL** = a release on its own.
- Priority: **P1** is needed for the release, **P2** is wanted, **P3** goes in only if time allows.

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

## 0.6: A living world

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

## 0.7: The classic game, part 2 (in progress)

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

## 0.8: Polish and leftovers

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
| Speed-ups that change outcomes (each 10–20%: follow a found route for the whole turn, sharper path estimate, re-plan colony workers less often, keep colony reports per computer turn); renderer performance pass | M | P3 | idea |

## 0.9: Scenario framework

Done before Beta, so the cooperation rules are scenario data from the start. See [design/scenarios.md](design/scenarios.md), and the detailed design for this release, [design/scenario-framework.md](design/scenario-framework.md) (status: design, to be agreed): an inventory of everything hard-wired to the Americas, the `Scenario` definition, games kept bit-identical, a proof scenario and a phased plan.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Scenario framework: map, nations, peoples, goods, units, Congress figures, era, events and victory as a data package; the Americas become the first scenario | L | P1 | design ([scenario-framework.md](design/scenario-framework.md); proposed size XL) |
| Each scenario offers a dedicated map or a generated one, and real rivals or alternative history | M | P1 | design (same note) |
| Proof scenario that exercises the framework with little new art (proposed: The Caribbean, 1650–1750: the lesser powers) | M | P1 | design (same note, section 7) |

## Beta 1–2: Cooperation

Builds on 0.4.
- Alliances and joint ventures between European nations; shared colonies.
- Native peoples as partners: trade agreements, cultural exchange, shared land use, mutual defence.
- New victory paths built around prosperity and cooperation.

Each beta gets design notes first.

## Scenarios (content)

Scenario content, built on the 0.9 framework.

Design: [design/scenarios.md](design/scenarios.md) and [design/australia.md](design/australia.md). Comes after the cooperation betas, so Federation can be a peaceful way to win.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Convict transport mechanic (Australia; late game for British colonies in the Americas) | M | P2 | idea, agreed |
| Australia map (geography preview with the current rules; ships arrive from the west) | M | P2 | done |
| Australia, 1788–1901: map, Aboriginal nations and Country, wool, wheat, gold and whaling, convict colonists, the long sea route, drought, Federation | XL | P1 | idea |
| Vinland, around 1000: Norse survival from Greenland with scarce resources and a fragile supply line | L | P3 | idea |
| Specialised councils per scenario: each scenario has its own Founding Fathers counterpart (Australia: Legislative Council and Federation figures; Vinland: the Thing, with saga figures), with effects suited to the scenario and portraits in the same cameo prompt style (see design/scenarios.md, Specialised councils) | M | P1 | idea |

## Later

- Interface redesign: one or two side branches that try a redesigned interface (panels, menus, screens) with a front-end design approach, compared side by side before choosing (Simon's idea).
- More sprites in the interface: buttons, panel frames, icons and screen headers from the art set, through sprite pack interface CSS (Simon's idea).

- More graphical styles as plugins. Sprite-based styles are packs of data (art, mapping from the game to sprite ids, draw rules) loaded by one generic sprite style plugin. Ligne claire (painted) is the first pack, and scenarios can bring their own.
  - Done: packs and styles can bring their own interface CSS (`css`, `cssFiles`, `fallbackCss: false`).
  - Next: packs that use no hand-drawn graphics at all. A pack option (for example `fallback: 'placeholder'`) draws a plain placeholder (a flat tile colour, or a simple silhouette per category) instead of the procedural drawing for missing sprites. Packs can also supply sprite versions of the layers that are always procedural today: rivers (pieces per direction and size), coastline ink, fog edges, colony and unit flags, captions and badges. Plus a check that lists which ids a pack is missing.
- A map editor in the game.
- Network play (the deterministic engine already supports replays).

## Agentic sprite pack generator

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Players write one prompt describing an art style and context (for example "science fiction", "mixed genders", "use a blue skin tone"). An agent turns it into a full sprite pack automatically: it writes the style bible and per-asset prompts, generates the full and thumbnail images, checks them (transparency, line weight, consistency) and redoes failures, runs the sprite pipeline and publishes a pack definition the game can load. Builds on tools/image-gen, tools/sprite-pipeline and sprite packs (including interface CSS). Needs a cost cap and a preview before the full run | XL | P3 | idea |

## Long-term ambition

- **Play on past 1850 in the Civilization II style:** tech trees, new diplomacy, new units. This is a project in itself and only starts when the list above runs dry.

## Parked

None yet.

## Rejected

| Idea | Why |
| --- | --- |
| New ship types in the Europe shop | The original ships are enough for now (decided October 2026) |
