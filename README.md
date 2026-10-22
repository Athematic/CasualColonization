# Casual Colonization

A browser clone of Sid Meier's *Colonization*. The game engine is kept separate from the graphics, so different graphical styles can be added as plugins. The default style is **Ligne claire**: even ink outlines and flat, bright colours, in the tradition of the Franco-Belgian comic.

**Alpha 0.2** focuses on cloning the original game. The planned changes come later and build on this engine:

- the number of European nations is chosen when starting a game (1–8) — *already in the alpha*
- relations with other nations and with indigenous peoples centre on **cooperation rather than combat** — *planned, see [Roadmap](#roadmap)*

## Play

The game opens on a title screen showing one of the five front covers at random (`docs/BOX_ART_PROMPTS.md`, section 3), with Continue, Quick game, New game, Watch the computers play and Load.

```sh
npm install
npm run dev        # http://localhost:5173
```

Or build a static site with `npm run build` (output in `apps/web/dist`), or a single self-contained HTML file with `npm run build:single`.

**Releases** are built with `npm run release`, which writes the finished site to `site/`. That folder is committed and copied by hand to https://casual.spence.dk/. It uses relative paths, so it works from any folder on the server. There is no automatic GitHub Pages deployment any more.

**Painted sprites** (the *Ligne claire (painted)* style) are not in git. To update them: run the sprite pipeline (`node tools/sprite-pipeline/build.mjs --in https://casual.spence.dk/assets/sprites/`, from the image tool branch), upload its `out/` folder (without `index.html` and `_sheet/`) to https://casual.spence.dk/assets/runtime/, then run `npm run release`. The release also copies a local runtime set into `site/assets/runtime/` (gitignored) when it finds one in `tools/sprite-pipeline/out` or in the folder named by `CC_RUNTIME_DIR`. Without the sprites, the style draws everything as Ligne claire. See [docs/STYLE_PLUGINS.md](docs/STYLE_PLUGINS.md#sprite-packs).

### Controls

| Action | Mouse / touch | Keys |
| --- | --- | --- |
| Select unit | Click it (click again to cycle through a stack) | `W` / `Tab` next unit |
| Move one step | Click a neighbouring tile | Arrows, numpad, `Home`/`PgUp`/`End`/`PgDn` for diagonals |
| Go to a tile | Click a distant tile, right-click, or Shift-click | `G`, then click |
| Found a colony | *Found colony* button | `B` |
| Plow / clear forest, build road | Pioneer buttons | `P`, `R` |
| Fortify, sentry, skip | Unit buttons | `F`, `S`, `Space` |
| Open a colony | Click it | |
| Europe | *Europe* button | `E` |
| End turn | *End turn* | `Enter` |
| Progress graphs | *Progress* | `H` |
| Advisor reports | *Reports* | `A` (last report), `F1`–`F8` (a report); `1`–`8` or `←`/`→` switch while open |
| Pan and zoom | Drag, mouse wheel, pinch | `+`, `-`, `C` centres on the unit |

In a colony, click a colonist and then a field or building to put them to work. Click a worker's own field again to switch what it produces.

## What is in the alpha

- **Map**: generated from a seed, or one of four hand-made stored maps (North America, South America, The Americas, and Australia as a geography-only preview with placeholder peoples; see `packages/engine/src/maps/`), with 13 terrain types and their forested variants, hills, mountains, bonus resources and Lost City Rumours. **Rivers**, minor and major, are fixed features of the land, as in the original game: moving along a river costs 1/3 of a move, like a road (the two do not add up), and a river tile yields more of the goods it already gives: +1 on a minor and +2 on a major river for food, sugar, tobacco, cotton, furs, lumber and ore, and +1 silver on either (one table, `RIVER_YIELD_BONUS` in `production.ts`). A colony built on a river gets the bonus on its centre tile. Generated maps grow rivers from hills, mountains and wet highlands down to the sea or a lake, merging into major rivers once long enough; the stored maps carry the great rivers (the Mississippi with the Missouri and the Ohio, the St. Lawrence, the Amazon and its tributaries, the Orinoco, the Paraná, the Murray–Darling and more), written as courses in tile coordinates (`parseRivers` in `packages/engine/src/rivers.ts`). Computer players favour colony sites on rivers and leave out roads along stretches a river already makes fast. High seas lead to Europe: expeditions arrive from the east, or from the west on the Australia map (via the Cape of Good Hope). Fog of war shows explored land and what your units can currently see.
- **Colonies**: worked fields and buildings with the classic production chains (lumber → hammers, ore → tools → muskets, sugar → rum, and so on). Also food growth and starvation, warehouse limits, horse breeding, a build queue with hurry-buying, and 15 building types with upgrades.
- **Liberty**: Sons of Liberty bonuses and the Tory penalty for colonies with many royalists.
- **Schools**: a schoolhouse, college or university lets experts teach. Criminals become servants, servants become free colonists, and free colonists become experts.
- **Continental Congress**: liberty bells bring 25 Founding Fathers, offered one per category, each with its classic effect (Jefferson, Pocahontas, Brewster, Stuyvesant, Cortés, de Soto and the rest).
- **Units**: 36 unit types, including experts, wagon trains, artillery, treasure trains and six kinds of ship. Colonists can take the soldier, dragoon, pioneer, scout or missionary role. Pioneers plow, clear forest and build roads.
- **Europe**: a market whose prices move with your trading, immigration driven by crosses, recruiting, training experts and buying ships and artillery. Every nation has its own home port, market and tax rate.
- **Trade routes**: name a round trip of stops (your colonies, and Europe for ships) and say per stop which goods to unload and load, optionally with an amount: how much to leave in the warehouse, how far to fill it, or how much to buy in Europe. Ships and wagon trains on a route move by themselves at the start of each of your turns, before you give orders, and never count as waiting for orders. In Europe they sell at market prices less tax (boycotted goods stay aboard) and can take colonists from the docks. Unloading into a colony stops when its warehouse is full, so nothing spoils. Open the *Routes* screen from the side panel, with `T`, or from a selected ship or wagon train; *Clear orders* takes a unit off its route.
- **Taxes and boycotts**: the Crown raises taxes. Refuse a raise and your colonists dump the goods in the harbour, and that good is boycotted until you pay the arrears. A custom house (with Stuyvesant) sells exports automatically.
- **Natives**: eight tribes with camps, villages and cities. Scouts speak to chiefs, colonists learn skills, missionaries found missions that bring converts, and land next to a settlement has to be bought or taken. Each tribe's tension rises as colonies crowd its land; furious tribes go to war, while trade, gifts and missions calm them.
  - **Braves** (Alpha 0.5) are real units on the map, drawn in their tribe's colour. Each settlement keeps one or two out on its land (camps 1, villages and cities 2, a capital one more; at most 80 on the map), replacing them slowly when they are killed (8–12 rounds). They move in the native phase at the end of each round: they wander, bring gifts of food or goods to colonies when content, come to trade (buying goods the tribe wants and offering their own for sale), demand tribute when uneasy (a person answers in the turn-start briefing; computer players pay when the colony could lose the fight, or the tribute is cheap) and attack colonies and units when angry or at war, with the ordinary combat rules: a won raid on a colony without soldiers steals goods or gold, burns the work in progress, damages a building or kills a colonist; armed defenders lose their muskets or horses to the brave. Braves at peace step aside for your units; hostile ones must be fought.
  - **Armed and mounted braves**: muskets and horses sold to a tribe, handed over as tribute or captured in a fight arm and mount its braves (brave 1/1, armed or mounted 2/2, both 3/3; mounted braves move 4).
  - **Trade both ways**: wagon trains and ships next to a settlement may sell one kind of goods and buy one kind of the settlement's goods each turn. Settlements gather furs, sugar, tobacco, cotton and silver (cities mine more) from their land; their price rises with the tribe's tension and falls when they have plenty.
  - **Burial grounds**: a Lost City Rumour within two tiles of a settlement may be a burial ground (odds scaled by difficulty). Disturbing one sets the tribe at war with you for good.
  - **Surrender**: when a tribe's capital burns, its other settlements submit to the attacker with a 60% chance (not after a desecrated burial ground): peace, their anger forgotten, a tribute of half their gold, free land and no more attacks or demands, until you attack them again.
  - **Missionaries** next to a settlement can denounce a rival nation's mission there (40% chance to have it expelled, ±20% for firebrand preachers; a failed attempt may cost the missionary) or pay the tribe (300–1,050 gold) to turn against a rival nation, which may start a war.
- **Combat**: attacks between Europeans and against native settlements, with terrain, fortification and stockade bonuses. Veterans and promotions; soldiers re-arm from colony warehouses; colonies can be captured. Burned cities yield treasure, which a galleon or the Crown (for half) carries to Europe. Ships are damaged and sent for repair at a drydock or in Europe. A shipyard builds ships.
- **Diplomacy**: war and peace with other European nations, which fight back while at war and make peace once war-weary. Gifts to tribes are made from the Foreign Affairs screen.
- **Trade agreements** (Alpha 0.4): propose one to another European nation at peace from Foreign Affairs. Computer players accept unless relations are hostile; a person answers in the turn-start briefing (or in Foreign Affairs). With an agreement, your trade routes can stop at the other nation's colonies, marked with its flag: ships stop on the water next to a coastal colony, wagon trains on the land next to a colony they can reach. Unloading sells goods to the colony, as far as its warehouse has room, and its owner pays its own home-market sell price (no tax) as far as its treasury allows; otherwise the stop is skipped with a report. Loading buys the colony's surplus above 50 of each good at its owner's buy price. Ending a plain agreement drops those stops and costs nothing else.
- **Favoured Nation** (Alpha 0.4, see [the design note](docs/design/favoured-nation.md)): after years of continuous peace and enough active trade routes between two nations (both thresholds are drawn per pair from the game seed and kept hidden; Foreign Affairs only says how relations stand, from "Relations are cool" to "A long friendship"), either side may propose Favoured Nation status. Computer players accept when they are not hostile and the relationship has paid (enough gold traded, or a very long peace), and they never declare war on, or attack, a nation they favour. Favoured Nations' ships may sail to each other's home port: *Sail to Europe* then asks which port, and in a partner's port a ship trades in that nation's market at its tax rate (its boycotts, and your own, do not apply there) and can buy merchant ships, but not warships or artillery, at its prices. Recruiting, training and going ashore stay in your own port. The Europe screen shows which port you are in, with a tab per port where you have ships. Either side can cancel at any time: the trade agreement and every route stop between the two end, all goods carried by either side's ships and wagon trains next to the other side's colonies are seized, and for some (hidden) years no new agreement is possible while computer players on both sides treat the other as a likely target. Declaring war on a Favoured Nation counts as cancelling. A nation that declares independence loses its home port, and with it its Favoured Nation status, without penalties. In a hot-seat game two people can agree to it at any time; revoking it still seizes goods but brings no waiting or hostility.
- **War of Independence**: once half your colonists are rebels, declare independence. Europe closes, veterans form the Continental Army, and the Royal Expeditionary Force lands in waves. Destroy it to win; lose half your colonies and the rebellion fails.
- **Game end**: the game ends with independence or in 1850, with scores.
- **Opponents**: 1–8 European nations, each with a national bonus. Each one is a person (several people take turns on one device, hot seat) or a computer player at one of four levels:
  - **Naive** settles and works the land and ships goods home, but plans nothing ahead.
  - **Competent** runs an efficient economy. It scouts for rumours and chiefs, learns skills from natives, trains experts, keeps colonies staffed and fed, runs a merchant fleet and trade routes (wagon trains from inland colonies to ports, ships from the busiest ports to Europe, surplus sold to natives where no port is near), builds warehouses before goods spoil, buys or calms native land, garrisons with its own militia, and works towards independence.
  - **Combative** has a competent economy behind an aggressive army. It takes native land, raids settlements for treasure, sends privateers after shipping and attacks weak neighbours.
  - **Creative** plays like a person. It reviews the game every few turns and shifts focus between exploring, expanding, developing, liberty, defence, war and independence. It reacts to threats at once and takes openings when a rival leaves a colony undefended.
- **Difficulty**: the original's five levels, Discoverer, Explorer, Conquistador (the standard rules, and the default), Governor and Viceroy, chosen on the New game screen and shown in the Game menu and on the final screen. A level changes starting gold, the gap between buy and sell prices in Europe and how fast prices fall and recover, the cost of recruiting, training and buying in Europe, the crosses needed for each immigrant, how often and how far the Crown raises taxes and its ceiling, how fast native tension grows and how often angry braves attack or demand tribute, the odds of good and bad Lost City Rumour results and of burial grounds, and the size of the Royal Expeditionary Force and how it grows with your colonies. As in the original, it applies to the people's nations (also while the computer plays them during a head start); computer players use the standard economics and keep the level chosen for them. All values are in one table, `DIFFICULTY` in `packages/engine/src/rules/difficulty.ts`.
- **Head start**: start in 1550, 1600, 1650, 1700, 1750 or 1800 instead of 1492. The strongest computer level (Creative) plays your nation until then and hands it over in a developed position. Watch the run as a speedrun on the map (at least 250 ms per turn, following your newest colony), or skip ahead without drawing for a much faster start.
- **Computer-only games**: choose no players to watch the computers play each other in observer mode, with play/pause, speed, stepping, a live scoreboard and a choice of whose view to show.
- **Cheats** (for testing the computer players): *Cheats…* in the Game menu, or `Ctrl+Shift+C`. Add 10,000 gold, double a nation's home-port prices, force peace between all European nations (tribes and the Crown are not affected), double all terrain yields (toggle) and reveal the map in a nation's view (toggle). Each cheat is an engine command, so games stay deterministic. The first use marks the game as cheated for good; the mark is kept in saves and shown on the score screen and in tournament tables.
- **Progress Graphs**: line charts comparing every nation over time: score, gold, colonies, colonists, rebels, liberty bells, crosses, Founding Fathers, military strength, ships and tonnage, goods produced, trade income, tax rate, native tension and land explored. Open them with *Progress* in the side panel (*Graphs* when watching) or `H`; they open by themselves with the final scores when the game ends. Hover or tap for values; click a nation in the legend to hide it, Shift-click or double-click to show only that one. The graphs show all nations whatever you have explored, as the original game's reports did. The engine records one snapshot per nation at the end of every round (`statsHistory(state)` in `packages/engine/src/stats.ts`), stored as small differences: about 36 bytes per nation and turn, so 360 turns of an eight-nation game add about 105 KB to a save and a full game to 1850 (about 600 turns) under 200 KB. Saves made before this feature start recording when loaded.
- **Advisor reports**: the original game's Reports menu on one screen with eight tabs, opened with *Reports* in the side panel or the Game menu, `A`, or `F1`–`F8`. **Colonies**: every colony with population, rebels, food surplus and growth, production per turn, what is being built and turns left, warehouse stock with goods about to spoil in red, and defence; sortable, click a colony to open it. **Trade**: per good, sell and buy prices in your home port and in any Favoured Nation's port, boycotts, tax, stock, units sold in Europe this turn, last turn and this game, custom house sales and exporters, goods delivered by trade routes and sold to partners' colonies. **Military**: land units by place and by type, fortifications per colony, and the Royal Expeditionary Force the Crown holds ready. **Naval**: ships with location, holds, cargo and passengers, orders or route, and repairs. **Religion**: crosses per turn and by colony, progress to the next immigrant, missions per tribe (yours and rivals') and converts. **Natives**: each tribe met and its known settlements with mood and tension, skill taught, wanted goods, mission, whether your scout visited, land claimed around it and distance to your nearest colony. **Continental Congress**: bells, rebels, Sons of Liberty bonus or Tory penalty per colony, the Founding Father being sought with progress, and every member with their effect. **History**: a log of notable events by year (colonies founded and captured, Founding Fathers, wars and peace, trade agreements and Favoured Nation, treasures, burned settlements, independence), filterable. Fog of war: only settlements on explored tiles are listed, and what one teaches and wants only after your scout has spoken with its chief; missions are counted in known settlements only; history shows public events (wars, treaties, Founding Fathers, declarations) for every nation but colonies, captures and treasures only to the nations concerned; rival nations' internals never appear (the Progress Graphs show their headline figures). The engine keeps the history (`historyFor`, at most 800 entries) and a ledger of goods sold (`ledgerFor`) in the save, both in `packages/engine/src/history.ts`; the report queries are in `packages/engine/src/reports.ts`. Saves from before this feature start recording when loaded.
- **Saving**: an autosave every turn, a manual save slot, and export or import of save files. Alpha 0.4 changed the save format (version 3) and does not convert older saves: loading one, from Continue, the saved-game slot or a file, says that saves from before version 0.4 can't be loaded.

### Measuring the computer players

`npm run tournament` plays seeded computer-only games with no browser. It rotates nations and seating so that no level keeps the same advantage, and prints a table of each level's average score, wins, colonies, colonists, gold, Founding Fathers, independence results and goods spoiled in full warehouses. The engine is deterministic, so the same options always give the same result.

```sh
npm run tournament -- --games 8 --turns 330 --size medium --levels naive,competent,combative,creative
npm run tournament -- --games 6 --turns 300 --size medium --features   # feature-usage audit
```

With those options, the current results (0.4, with Favoured Nation) are as follows. Creative has the best average and plays head starts.

| Level | Wins | Score | Colonies | Colonists | Goods spoiled |
| --- | ---: | ---: | ---: | ---: | ---: |
| Creative | 2 | 517 | 23.3 | 154 | 10,537 |
| Combative | 2 | 479 | 22.8 | 155 | 10,107 |
| Competent | 4 | 439 | 19.6 | 132 | 11,644 |
| Naive | 0 | 215 | 20.4 | 80 | 13,383 |

Add `--difficulty <level>` (`discoverer`, `explorer`, `conquistador`, `governor`, `viceroy`) to play every arena nation at that level's economics, as if each were a person; without it, games use the standard rules (Conquistador), and `--difficulty conquistador` gives exactly the same results.

Every run also prints relations and trade between the European nations: proposals, trade agreements and Favoured Nation statuses made and held, cancellations, gold traded at each other's colonies, goods sold at partners' colonies and in partners' ports, triangle trades, wars declared (and how many on trade partners or Favoured Nations) and tax raises refused, per level and per game. Add `--no-favoured` to stop the computer players proposing trade agreements and Favoured Nation, to measure what the feature brings (see the Favoured Nation section of [docs/AI_FEATURE_AUDIT.md](docs/AI_FEATURE_AUDIT.md)).

Add `--features` to also count how often each level uses each game feature (commands, roads, ships bought, buildings, schools, missions, trade, wars and more), with a table that flags features the advanced levels never or hardly use. The findings so far, and the fixes they led to, are in [docs/AI_FEATURE_AUDIT.md](docs/AI_FEATURE_AUDIT.md).

Simplifications in this alpha:
- An independent nation cannot trade with Europe.
- Braves cannot destroy or capture a colony, and they do not cross water.

## Architecture

```
packages/
  engine/              Rules and game state. Pure TypeScript, no DOM, deterministic.
  render-api/          The contract between the game shell and graphical styles.
  style-ligne-claire/  Default style plugin.
  style-sprites/       Styles from bitmap sprite packs over a procedural fallback; packs/ has Ligne claire (painted).
  style-schematic/     Minimal second style; the reference for new plugins.
apps/
  web/                 Browser shell: menus, map input, colony and Europe screens.
```

- The **engine** holds the whole game in one plain, JSON-serialisable `GameState`. Every player action is a `Command` passed to `applyCommand`, which checks it against the rules and applies it. Randomness comes from a seeded generator stored in the state, so the same seed and commands always give the same game. This makes saving, testing, replays and a future networked mode straightforward.
- A **style plugin** implements `StylePlugin` from `@cc/render-api`. It receives read-only state and draws it. It never changes the game, and it knows nothing about input or rules. See [docs/STYLE_PLUGINS.md](docs/STYLE_PLUGINS.md).
- The **web shell** owns input, panels and screens. It uses the active plugin for the map, icons and theme colours, and can switch styles mid-game.

```sh
npm run typecheck
npm test           # rules for every system, an 80-turn eight-nation AI game, a War of Independence, geometry
npm run build
```

## Roadmap

The full plan is in [docs/ROADMAP.md](docs/ROADMAP.md). In short:

1. **Alpha (now)**: a faithful clone of the classic game, with a configurable number of nations.
2. **Alpha+**: visible native units, a smarter computer opponent, and balance passes.
3. **Beta: Cooperation overhaul**:
   - replace conquest with alliances, joint ventures and shared colonies between European nations;
   - make indigenous peoples partners: trade agreements, cultural exchange, shared land use and mutual defence;
   - set new victory paths around prosperity and cooperation instead of independence by war.
4. More graphical styles as plugins.

## Credits

Inspired by *Sid Meier's Colonization* (MicroProse, 1994) and the FreeCol project. All code and graphics here are original. The default graphics are drawn procedurally, with no copied assets. The optional painted sprites were generated for this game from the prompts in docs/SPRITE_PROMPTS.md.
