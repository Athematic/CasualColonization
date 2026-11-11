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

Beta 2, native peoples as partners: design in [design/native-partners.md](design/native-partners.md) (status: `in progress`; N1–N14 decided by Simon, 11 November 2026, as recommended, with the five fixes of today's native rules in step 0). Step 0 is built (M, P1, done; branch `beta2/step0`): a people as a treaty party read through party helpers, `peopleRelations`, `peoples.rules`, the `burialGrounds` and `surrender` switches, `landRadius`, and the five fixes (section 8 of the note). Step 1 is built (L, P1, done; branch `beta2/step1`): the trade treaty with a people (`people-trade`): unlocking from the standing record, proposals and the people's seeded answers and own offers, better prices and goods, more trade visits, route stops at partner settlements, breaking faith, computer nations per level, the Native peoples card, switched on in the Americas and the Caribbean (section 9 of the note). Step 2 is built (M–L, P1, done; branch `beta2/step2`): land use (`land-use`), a lease of a trade partner's land beside the nation's colonies for a yearly rent per tile set when it is made (`Tile.use`, `LandUseTerms`): its own hidden years, the rent paid each year or the lease lapses, the people still gathering half from leased land and leased colonies pressing half as hard, buying a leased tile against taking it, Creative and Competent computer nations leasing and working the land, "Lease land" in Foreign Affairs and on the colony screen, leased tiles marked on the map, switched on in the Americas and the Caribbean (section 10 of the note). Next: step 3, cultural exchange (M, P2), or step 5, the `prosperity` victory (M, P1).

## Scenarios (content)

Scenario content, built on the 0.9 framework.

Design: [design/scenarios.md](design/scenarios.md) and [design/australia.md](design/australia.md). Comes after the cooperation betas, so Federation can be a peaceful way to win.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Convict transport mechanic (Australia; late game for British colonies in the Americas) | M | P2 | idea, agreed |
| Australia, 1788–1901: map, Aboriginal nations and Country, wool, wheat, gold and whaling, convict colonists, the long sea route, drought, Federation | XL | P1 | idea |
| Vinland, around 1000: Norse survival from Greenland with scarce resources and a fragile supply line | L | P3 | idea |
| Specialised councils per scenario: each scenario has its own Founding Fathers counterpart (Australia: Legislative Council and Federation figures; Vinland: the Thing, with saga figures), with effects suited to the scenario and portraits in the same cameo prompt style (see design/scenarios.md, Specialised councils) | M | P1 | idea |

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
- Hex maps as a scenario option (Simon's idea, November 2026): a scenario chooses square or hexagon tiles; the Americas stay square. Not a rewrite: most rules go through one grid definition, so the work is mostly in drawing and balance. Roughly XL in all, comparable to 0.9:
  1. Grid as an engine abstraction, squares unchanged (M; done in 0.10, see [SHIPPED.md](SHIPPED.md#010-faster-turns-done)).
  2. Hexagon rules and a test scenario on hexes: 6 directions, a colony works 6 tiles instead of 8, no diagonal shortcuts, 6 movement keys (M).
  3. The schematic style draws hexagons (clicking, camera, terrain, coasts, rivers and roads along hex edges), so a hex scenario is playable (M).
  4. Computer players retuned on hexagons, with tournaments (M).
  5. The sprite style on hexagons; terrain sprites regenerated as hexagons (unit, colony and building sprites carry over). Waits for cheaper image generation (L).
  6. Ligne claire on hexagons, or it stays square-only (L).
  Stored maps can be read as offset hexagon rows (alternate rows shifted half a tile) with a review pass per map. A first candidate is a new scenario without square-tuned history, such as Vinland, rather than converting the Americas.
- Native peoples as a nation type (Simon's idea, November 2026): native peoples become playable nations of their own kind, with their own units, buildings and council members and no Home Port. A new way to play: start as a native people around the year 1000, with the Europeans arriving later to complicate matters. Builds on Beta 2, whose people treaty party is designed to grow into this type ([design/native-partners.md](design/native-partners.md), section 4). Needs its own design note. Roughly XL.
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
