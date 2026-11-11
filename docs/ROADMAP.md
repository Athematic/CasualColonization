# Roadmap

The one plan for Casual Colonization. We decide the priorities here together. New ideas first land in [CHANGE_SUGGESTIONS.md](CHANGE_SUGGESTIONS.md) (the inbox). Once discussed, an idea moves into a release below, goes to **Parked**, or is **Rejected** with a reason.

What has already shipped (0.3 to 0.10 and Beta 1) is in [SHIPPED.md](SHIPPED.md).

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

## Open items from shipped releases

Left over from releases that have shipped; the full rows are in [SHIPPED.md](SHIPPED.md).

- Next computer-player gaps from the audit: Combative's idle army, missions and native trade, schools and custom houses earlier, buying experts, declaring independence, refusing taxes (0.3, M, P2, planned).
- Computer players reach a winnable War of Independence (0.5, 0.7; partly done). Left: concentrating troops where the King lands, a stronger Creative economy, longer tournaments (see the audit).
- Railroads (from about 1830, needs a Founding Father or a building): faster than roads, built on top of a road (0.6, M, P3, idea).
- Difficulty: tune the values against the original (0.8).
- Rivers: the Yukon, which waits for a larger North America map (0.8).
- Tessellated terrain tiles: generate the 12 trial images (SPRITE_PROMPTS 4.8a), look at them on a map, then the other terrains ([design/tessellated-tiles.md](design/tessellated-tiles.md); 0.8, trial). Waits for cheaper image generation (see Later).
- The Caribbean's portraits and cover, still to generate (0.9; sprite work waits).
- `npm test` at most 6 s on the Mac worker: it stays at about 9 s, bound by total CPU time; getting under 6 s would mean shorter test games, which weakens them (0.10 target, not met).

## Beta 2: Cooperation

Builds on 0.4.
- Alliances and joint ventures between European nations; shared colonies.
- Native peoples as partners: trade agreements, cultural exchange, shared land use, mutual defence.
- New victory paths built around prosperity and cooperation.

Each beta gets design notes first.

Beta 1, cooperation between Europeans, is built (design in [design/cooperation.md](design/cooperation.md)); its steps are in [SHIPPED.md](SHIPPED.md#beta-1-cooperation-between-europeans).

Beta 2, native peoples as partners: design in [design/native-partners.md](design/native-partners.md) (status: `built`; N1–N14 decided by Simon, 11 November 2026, as recommended, with the five fixes of today's native rules in step 0). Step 0 is built (M, P1, done; branch `beta2/step0`): a people as a treaty party read through party helpers, `peopleRelations`, `peoples.rules`, the `burialGrounds` and `surrender` switches, `landRadius`, and the five fixes (section 8 of the note). Step 1 is built (L, P1, done; branch `beta2/step1`): the trade treaty with a people (`people-trade`): unlocking from the standing record, proposals and the people's seeded answers and own offers, better prices and goods, more trade visits, route stops at partner settlements, breaking faith, computer nations per level, the Native peoples card, switched on in the Americas and the Caribbean (section 9 of the note). Step 2 is built (M–L, P1, done; branch `beta2/step2`): land use (`land-use`), a lease of a trade partner's land beside the nation's colonies for a yearly rent per tile set when it is made (`Tile.use`, `LandUseTerms`): its own hidden years, the rent paid each year or the lease lapses, the people still gathering half from leased land and leased colonies pressing half as hard, buying a leased tile against taking it, Creative and Competent computer nations leasing and working the land, "Lease land" in Foreign Affairs and on the colony screen, leased tiles marked on the map, switched on in the Americas and the Caribbean (section 10 of the note). Step 3 is built (M, P2, done; branch `beta2/step3`): cultural exchange (`exchange`): on a trade treaty and its own hidden years, a settlement teaches the partner again 25 ± 5 years after it last taught (`Settlement.taughtAt`), chiefs welcome the partner's scouts again once a decade (`Settlement.spokeAt`), the people gathers 25% more; Creative and Competent computer nations seek it once per partner (about half of Americas games) and send colonists to learn, "Propose exchange" in Foreign Affairs and "teaches again in n years" in the settlement dialog, switched on in the Americas and the Caribbean (section 11 of the note); Simon kept renewed teaching at 25 ± 5 years, its strength to be tuned in step 6, and agreed to the once-per-partner decision. Step 4 is built (L, P2, done; branch `beta2/step4`): mutual defence (`defence`): on a trade treaty and land use or an exchange and its own hidden years, one nation at a time per people; an attack on the people is war with its partner (an ally of the partner that attacks it leaves the alliance), an attack on the partner's colony near the people brings its braves and puts the people at war with the attacker, braves fight the King's troops near a partner in revolt, and nobody can incite the people against its partner; Creative and Competent computer nations seek it once per partner (a pact in 12 of 48 Americas games, 9 of 16 in the Caribbean with its own numbers), "Propose defence" in Foreign Affairs and the pact in the settlement dialog, switched on in the Americas and the Caribbean (section 12 of the note). Simon's decisions on step 4 are built (branch `beta2/braves-paths`): Combative makes no defence pacts, braves find their way with a path search, and braves moving to defend move as if following a river (section 13 of the note). Step 5 is built (M, P1, done; branch `beta2/step5`): the `prosperity` victory: at the end year every nation at peace with each people it has met for 30 years, that never burned a settlement, with treaties with half the peoples met and 0.8 of the best score wins, its partner peoples named on the game-over screen (`gameOver.partners`); a treaty with a people scores 3 points (5 in the Caribbean); the tournament counts prosperity wins and the conditions nations miss; switched on in the Americas `[independence-war, concord, prosperity, time]` and the Caribbean `[concord, prosperity, time]` (section 14 of the note). In the Americas it came in 5 of 96 four-level games (N12: one in 20–30), always Competent; in the Caribbean in 15 of 16, where it always names the top scorer (Simon: kept as it is). Step 6 is built (M–L, P1, done; branch `beta2/step6`): tuning with 96-game tournaments on two seeds against N12 and Beta 1's C11 (section 15 of the note): a settlement teaches again at most twice under an exchange (`exchange.renewals`; about five free experts per exchange instead of twelve, renewal still every 25 ± 5 years), computer nations keep a year's rent back and lease only with gold to spare (leases lapsing half as often a game), computer wagon trains run routes to partner settlements, Creative gives gifts sooner and pays a partner's tribute, and the confederation numbers are brought back to Beta 1's rate in all-Creative games. Every N12 target is met in 192 four-level Americas games (a trade treaty in 191, land use 49%, exchange 55%, defence 1 in 3.6, a breach 1 in 2.8, prosperity 1 in 21), C11's rates are as in Beta 1, and no level is weaker than before Beta 2.

## Beta 3: Native nations

Status: `planned`; every decision made (Simon, 11 November 2026). A people wins by continuity, a confederacy of peoples, a good life, or by defeating every European nation (T14). Native peoples become a nation type of their own: playable by a person or the computer, with their own units, buildings and council members, and no Home Port. A new way to play: start as a native people in the year 1000 and face the Europeans from 1492, one turn a year to 1850 (about 850 turns), with head starts for a shorter game. Builds on Beta 2, whose people treaty party was built to grow into this. Design: [design/native-nations.md](design/native-nations.md). About XL, larger than Beta 2.

Simon's decisions (11 November 2026): all as recommended except these.
- One turn a year from 1000 to 1850; a shorter game is a head start (T16). No multi-year turns.
- The Norse are not in it: "keep that powder dry for the Vinland scenario" (T17). Vinland, with the Norse, is built in Beta 4 on hexes.
- Growth from the peoples' side (T10, after a rewrite): births from food, stores against winter and hard years, and the health of the land; standing only as Beta 2's standing record read from the people's side; gold only as what Europeans pay in trade. Kin ties and elders passing on knowledge are kept for a separate scenario.
- If every European nation is defeated, the people or peoples win (T14, military victory); in computer-only games 1 in 100 or fewer.
- No save compatibility (T21). The Americas and the Caribbean stay bit-identical (golden and bench hashes) as a testing aid.
- The 1000–1850 game is played on a new North-east map on squares, which Beta 4 turns into hexes for Vinland (T19).

Folded in from elsewhere on this roadmap:
- Specialised councils per scenario (from Scenarios), built as a general council system per nation type and scenario; Australia's Legislative Council and Vinland's Thing use it later.
- Native peoples' knowledge of the land (from Later): the braves' defence movement bonus becomes a trait of the nation type, lost on tilled fields and railroads.
- The framework's lifeway: only today's fixed-settlement lifeways; Australia's seasonal lifeway later.

Not in it: hex maps and Vinland with the Norse (Beta 4), and Australia, which follows Beta 4 on hexes.

Step 1 is built (L, P1, done; branch `beta3/step1`): the nation type. `PlayerId` (a nation's or a people's id) for owners, claims, stances, messages and winners; `kind: 'people'`; `playerKind` and one systems table (`playerkind.ts`) that every company check now reads, bit-identical for the Americas and the Caribbean (bench, golden and a 24-game tournament); the Europe-only systems (market, immigration, taxes, the Crown, the Royal Expeditionary Force, independence, the Congress, the caravel, events and rumours) off for a people; per-type selections of units and buildings (`Scenario.nationTypes.people`, with placeholders until step 2); a people the scenario names as playable turned into a player at setup, its settlements its towns (`GameConfig.peoples`); a hidden test scenario with the Iroquois playable (section 7 of the note).

## Beta 4: Hex maps

Status: `idea, agreed in outline` (Simon, 11 November 2026). A scenario can be played on hexagons. Builds the hex steps listed under Later (step 1, the grid abstraction, was done in 0.10) and proves them on Vinland, with the Norse, built here on Beta 3's North-east map (Beta 3 plays that map on squares, without the Norse). The Americas and the Caribbean stay square. Gets its own design note first. About XL.

Simon's decisions on the outline:
- **Vinland is hex-only** in Beta 4; its square version is dropped.
- **Australia is built on hexes from the start**, so the order is Beta 3 → Beta 4 → Australia.
- **No map editor** in Beta 4, unless it helps make the Vinland and Australia maps; the full editor stays Later.
- **No locally generated hex terrain tiles** in Beta 4: local generation on the Mac may come in Beta 5 or 6. A placeholder sprite pack (flat colours, simple silhouettes, with a missing-ids check) carries the sprite style on hexes until then.
- **Ligne claire is tried on hexes.**

| Step | What | Size | Prio |
| --- | --- | --- | --- |
| 0 | Design note and decisions | S | P1 |
| 1 | Hexagon rules and a hidden test scenario: 6 directions, a work area of 6, movement keys | M | P1 |
| 2 | Rivers and roads on hexes (core: today's river masks are square-only): 6-direction masks, river and road movement for units, the path search and braves, conversion of stored river masks | M | P1 |
| 3 | The schematic style on hexes, with rivers and roads along hex edges; a hex scenario playable | M | P1 |
| 4 | Vinland on hexes: Beta 3's North-east map as offset hexagon rows with a review pass; the Norse (a `norse` nation from Greenland that leaves unless thriving, the Thing as its council; T17 in [design/native-nations.md](design/native-nations.md)); computer players retuned with tournaments; the Mac speed gate on a hex scenario | L | P1 |
| 5 | Placeholder sprite pack and missing-ids check; the sprite style on hexes | M | P2 |
| 6 | Ligne claire on hexes | L | P2 |
| 7 | Railroads along hex edges (optional; they don't exist yet) | M | P3 |

Not in Beta 4: converting the Americas and the Caribbean (later, one scenario at a time, each with tournaments), the interface redesign, locally generated terrain sprites.

## Scenarios (content)

Scenario content, built on the 0.9 framework.

Design: [design/scenarios.md](design/scenarios.md) and [design/australia.md](design/australia.md). Comes after the cooperation betas, so Federation can be a peaceful way to win. Australia follows Beta 3 (native nations), which builds the council system and leaves the shapes for its peoples, and Beta 4, so it is built on hexagons from the start (Simon, 11 November 2026).

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Convict transport mechanic (Australia; late game for British colonies in the Americas) | M | P2 | idea, agreed |
| Australia, 1788–1901: map, Aboriginal nations and Country, wool, wheat, gold and whaling, convict colonists, the long sea route, drought, Federation | XL | P1 | idea |
| Vinland, around 1000: Norse survival from Greenland with scarce resources and a fragile supply line | L | P3 | moved to Beta 4, built on hexes with the Norse (Vinland is hex-only; the Norse wait for it, T17 in [design/native-nations.md](design/native-nations.md)) |
| Before the year 1000: native peoples as full nations before any European arrives, which would rebuild many mechanics. A potential scenario, not part of the core game | XL? | P3 | idea; Simon, 11 November 2026 |
| Specialised councils per scenario: each scenario has its own Founding Fathers counterpart (Australia: Legislative Council and Federation figures; Vinland: the Thing, with saga figures), with effects suited to the scenario and portraits in the same cameo prompt style (see design/scenarios.md, Specialised councils) | M | P1 | moved to Beta 3 (the general council system, T8 in [design/native-nations.md](design/native-nations.md)); the councils' members come with each scenario |

The Australia map (geography preview with the current rules; ships arrive from the west) is done, see [SHIPPED.md](SHIPPED.md#scenarios-content).

## Later

- Triangle trading that actually happens: the computer players never have a free cargo hold for it (all ships run routes), so it needs a route-level triangle or a ship kept free for it, not price tuning.
- Favoured Nation forms about a third as often since the 0.8 fix (partner trade must pay); a ties-building rule that doesn't cost detours would bring it back.
- Interface redesign: one or two side branches that try a redesigned interface (panels, menus, screens) with a front-end design approach, compared side by side before choosing (Simon's idea).
- More sprites in the interface: buttons, panel frames, icons and screen headers from the art set, through sprite pack interface CSS (Simon's idea). Waits for a cheaper way to generate images (locally run diffusion models later), as do the tessellated terrain tiles (the 12 trial pieces).

- More graphical styles as plugins. Sprite-based styles are packs of data (art, mapping from the game to sprite ids, draw rules) loaded by one generic sprite style plugin. Ligne claire (painted) is the first pack, and scenarios can bring their own.
  - Done: packs and styles can bring their own interface CSS (`css`, `cssFiles`, `fallbackCss: false`).
  - Next: packs that use no hand-drawn graphics at all. A pack option (for example `fallback: 'placeholder'`) draws a plain placeholder (a flat tile colour, or a simple silhouette per category) instead of the procedural drawing for missing sprites. Packs can also supply sprite versions of the layers that are always procedural today: rivers (pieces per direction and size), coastline ink, fog edges, colony and unit flags, captions and badges. Plus a check that lists which ids a pack is missing.
- A map editor in the game.
- Hex maps as a scenario option (Simon's idea, November 2026; planned as Beta 4, see above): a scenario chooses square or hexagon tiles; the Americas stay square. Not a rewrite: most rules go through one grid definition, so the work is mostly in drawing and balance. Roughly XL in all, comparable to 0.9:
  1. Grid as an engine abstraction, squares unchanged (M; done in 0.10, see [SHIPPED.md](SHIPPED.md#010-faster-turns-done)).
  2. Hexagon rules and a test scenario on hexes: 6 directions, a colony works 6 tiles instead of 8, no diagonal shortcuts, 6 movement keys (M).
  3. The schematic style draws hexagons (clicking, camera, terrain, coasts, rivers and roads along hex edges), so a hex scenario is playable (M).
  4. Computer players retuned on hexagons, with tournaments (M).
  5. The sprite style on hexagons; terrain sprites regenerated as hexagons (unit, colony and building sprites carry over). Waits for cheaper image generation (L).
  6. Ligne claire on hexagons, or it stays square-only (L).
  Stored maps can be read as offset hexagon rows (alternate rows shifted half a tile) with a review pass per map. A first candidate is a new scenario without square-tuned history, such as Vinland, rather than converting the Americas.
- Native peoples as a nation type (Simon's idea, November 2026): native peoples become playable nations of their own kind, with their own units, buildings and council members and no Home Port. A new way to play: start as a native people around the year 1000, with the Europeans arriving later to complicate matters. Builds on Beta 2, whose people treaty party is designed to grow into this type ([design/native-partners.md](design/native-partners.md), section 4). Needs its own design note. Roughly XL. Moved to Beta 3 (see above).
- Native peoples' knowledge of the land (Simon's idea, November 2026; for discussion in a later session): braves moving to defend move as if following a river from Beta 2 on, because the native peoples know the land so well. Expand on this advantage later, for example braves losing it on tilled fields (plowed land) or on railroads once they appear. Moved to Beta 3 (T13 in [design/native-nations.md](design/native-nations.md)).
- Network play (the deterministic engine already supports replays).
- Converting all Scenarios to use haxagonal tiles

## Generating Sprites locally

Test free image generation running on the Mac to generate sprites.

## More Hill Climbing

Speed rounds continue after 0.10 with the same gate on the Mac (`docs/perf/MAC_WORKER.md`; branches `claude/perf-best` and `claude/perf-candidate`). Round 4 (after Beta 1, November 2026): accepted, bit-identical; colony and unit lists kept by the index, `colonyReport` allocating less, nearest-first neighbour search, native pressure once per turn, running sums for statistics. Mac: to 1700 1.2 → 1.1 s, to 1750 1.7 → 1.5 s, full game 3.5 → 3.0 s (−8%, −12%, −14%). Ideas left from it: cache `pathIndex`'s settlement and brave maps, a land/water mask, explored-land counts per player, a settlement list.

Consider other candidates for Hill Climbing, such as:
- **Using the concept of Deep Modules** to refactor code to be more easy to maintain, while repeated games ensures that nothing breaks.

## Agentic sprite pack generator

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Players write one prompt describing an art style and context (for example "science fiction", "mixed genders", "use a blue skin tone"). An agent turns it into a full sprite pack automatically: it writes the style bible and per-asset prompts, generates the full and thumbnail images, checks them (transparency, line weight, consistency) and redoes failures, runs the sprite pipeline and publishes a pack definition the game can load. Builds on tools/image-gen, tools/sprite-pipeline and sprite packs (including interface CSS). Needs a cost cap and a preview before the full run | XL | P3 | idea |

## Long-term ambition

- **3D modelled game world:** Add a new way to render the games besides the existing graphical styles - a full 3D map, 3D units, etc. use Fable 5.2 for this.
- **Play on past 1850 in the Civilization II style:** tech trees, new diplomacy, new units. This is a project in itself and only starts when the list above runs dry.

## Parked

None yet.

## Rejected

| Idea | Why |
| --- | --- |
| New ship types in the Europe shop | The original ships are enough for now (decided October 2026) |
