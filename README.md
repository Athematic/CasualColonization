# Casual Colonization

A browser clone of Sid Meier's *Colonization*. The game engine is kept separate from the graphics, so different graphical styles can be added as plugins. The default style is **Ligne claire**: even ink outlines and flat, bright colours, in the tradition of the Franco-Belgian comic.

**Alpha 0.2** focuses on cloning the original game. The planned changes come later and build on this engine:

- the number of European nations is chosen when starting a game (1–8) — *already in the alpha*
- relations with other nations and with indigenous peoples centre on **cooperation rather than combat** — *planned, see [Roadmap](#roadmap)*

## Play

The game opens on a title screen with the cover art (`images/covers/landfall.png`), with Continue, Quick game, New game, Watch the computers play and Load.

```sh
npm install
npm run dev        # http://localhost:5173
```

Or build a static site with `npm run build` (output in `apps/web/dist`), or a single self-contained HTML file with `npm run build:single`. The GitHub Pages workflow builds and publishes it on every push. In *Settings → Pages → Build and deployment*, set **Source** to **GitHub Actions**; "Deploy from a branch" would publish the raw repository files (the README) instead of the built game.

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
| Pan and zoom | Drag, mouse wheel, pinch | `+`, `-`, `C` centres on the unit |

In a colony, click a colonist and then a field or building to put them to work. Click a worker's own field again to switch what it produces.

## What is in the alpha

- **Map**: generated from a seed, or one of four hand-made stored maps (North America, South America, The Americas, and Australia as a geography-only preview with placeholder peoples; see `packages/engine/src/maps/`), with 13 terrain types and their forested variants, hills, mountains, bonus resources and Lost City Rumours. High seas lead to Europe: expeditions arrive from the east, or from the west on the Australia map (via the Cape of Good Hope). Fog of war shows explored land and what your units can currently see.
- **Colonies**: worked fields and buildings with the classic production chains (lumber → hammers, ore → tools → muskets, sugar → rum, and so on). Also food growth and starvation, warehouse limits, horse breeding, a build queue with hurry-buying, and 15 building types with upgrades.
- **Liberty**: Sons of Liberty bonuses and the Tory penalty for colonies with many royalists.
- **Schools**: a schoolhouse, college or university lets experts teach. Criminals become servants, servants become free colonists, and free colonists become experts.
- **Continental Congress**: liberty bells bring 25 Founding Fathers, offered one per category, each with its classic effect (Jefferson, Pocahontas, Brewster, Stuyvesant, Cortés, de Soto and the rest).
- **Units**: 36 unit types, including experts, wagon trains, artillery, treasure trains and six kinds of ship. Colonists can take the soldier, dragoon, pioneer, scout or missionary role. Pioneers plow, clear forest and build roads.
- **Europe**: a market whose prices move with your trading, immigration driven by crosses, recruiting, training experts and buying ships and artillery.
- **Trade routes**: name a round trip of stops (your colonies, and Europe for ships) and say per stop which goods to unload and load, optionally with an amount: how much to leave in the warehouse, how far to fill it, or how much to buy in Europe. Ships and wagon trains on a route move by themselves at the start of each of your turns, before you give orders, and never count as waiting for orders. In Europe they sell at market prices less tax (boycotted goods stay aboard) and can take colonists from the docks. Unloading into a colony stops when its warehouse is full, so nothing spoils. Open the *Routes* screen from the side panel, with `T`, or from a selected ship or wagon train; *Clear orders* takes a unit off its route.
- **Taxes and boycotts**: the Crown raises taxes. Refuse a raise and your colonists dump the goods in the harbour, and that good is boycotted until you pay the arrears. A custom house (with Stuyvesant) sells exports automatically.
- **Natives**: eight tribes with camps, villages and cities. Scouts speak to chiefs, colonists learn skills, wagons and ships trade, missionaries found missions that bring converts, and land next to a settlement has to be bought or taken. Each tribe's tension rises as colonies crowd its land; angry tribes raid colonies and furious ones go to war, while trade, gifts and missions calm them.
- **Combat**: attacks between Europeans and against native settlements, with terrain, fortification and stockade bonuses. Veterans and promotions; soldiers re-arm from colony warehouses; colonies can be captured. Burned cities yield treasure, which a galleon or the Crown (for half) carries to Europe. Ships are damaged and sent for repair at a drydock or in Europe. A shipyard builds ships.
- **Diplomacy**: war and peace with other European nations, which fight back while at war and make peace once war-weary. Gifts to tribes are made from the Foreign Affairs screen.
- **War of Independence**: once half your colonists are rebels, declare independence. Europe closes, veterans form the Continental Army, and the Royal Expeditionary Force lands in waves. Destroy it to win; lose half your colonies and the rebellion fails.
- **Game end**: the game ends with independence or in 1850, with scores.
- **Opponents**: 1–8 European nations, each with a national bonus. Each one is a person (several people take turns on one device, hot seat) or a computer player at one of four levels:
  - **Naive** settles and works the land and ships goods home, but plans nothing ahead.
  - **Competent** runs an efficient economy. It scouts for rumours and chiefs, learns skills from natives, trains experts, keeps colonies staffed and fed, runs a merchant fleet and trade routes (wagon trains from inland colonies to ports, ships from the busiest ports to Europe, surplus sold to natives where no port is near), builds warehouses before goods spoil, buys or calms native land, garrisons with its own militia, and works towards independence.
  - **Combative** has a competent economy behind an aggressive army. It takes native land, raids settlements for treasure, sends privateers after shipping and attacks weak neighbours.
  - **Creative** plays like a person. It reviews the game every few turns and shifts focus between exploring, expanding, developing, liberty, defence, war and independence. It reacts to threats at once and takes openings when a rival leaves a colony undefended.
- **Difficulty**: the original's five levels, Discoverer, Explorer, Conquistador (the standard rules, and the default), Governor and Viceroy, chosen on the New game screen and shown in the Game menu and on the final screen. A level changes starting gold, the gap between buy and sell prices in Europe and how fast prices fall and recover, the cost of recruiting, training and buying in Europe, the crosses needed for each immigrant, how often and how far the Crown raises taxes and its ceiling, how fast native tension grows and how often angry tribes raid, the odds of good and bad Lost City Rumour results, and the size of the Royal Expeditionary Force and how it grows with your colonies. As in the original, it applies to the people's nations (also while the computer plays them during a head start); computer players use the standard economics and keep the level chosen for them. All values are in one table, `DIFFICULTY` in `packages/engine/src/rules/difficulty.ts`.
- **Head start**: start in 1550, 1600, 1650, 1700, 1750 or 1800 instead of 1492. The strongest computer level (Creative) plays your nation until then and hands it over in a developed position. Watch the run as a speedrun on the map (at least 250 ms per turn, following your newest colony), or skip ahead without drawing for a much faster start.
- **Computer-only games**: choose no players to watch the computers play each other in observer mode, with play/pause, speed, stepping, a live scoreboard and a choice of whose view to show.
- **Cheats** (for testing the computer players): *Cheats…* in the Game menu, or `Ctrl+Shift+C`. Add 10,000 gold, double a nation's home-port prices, force peace between all European nations (tribes and the Crown are not affected), double all terrain yields (toggle) and reveal the map in a nation's view (toggle). Each cheat is an engine command, so games stay deterministic. The first use marks the game as cheated for good; the mark is kept in saves and shown on the score screen and in tournament tables.
- **Progress Graphs**: line charts comparing every nation over time: score, gold, colonies, colonists, rebels, liberty bells, crosses, Founding Fathers, military strength, ships and tonnage, goods produced, trade income, tax rate, native tension and land explored. Open them with *Progress* in the side panel (*Graphs* when watching) or `H`; they open by themselves with the final scores when the game ends. Hover or tap for values; click a nation in the legend to hide it, Shift-click or double-click to show only that one. The graphs show all nations whatever you have explored, as the original game's reports did. The engine records one snapshot per nation at the end of every round (`statsHistory(state)` in `packages/engine/src/stats.ts`), stored as small differences: about 36 bytes per nation and turn, so 360 turns of an eight-nation game add about 105 KB to a save and a full game to 1850 (about 600 turns) under 200 KB. Saves made before this feature start recording when loaded.
- **Saving**: an autosave every turn, a manual save slot, and export or import of save files. Saves from Alpha 0.1 are upgraded on load.

### Measuring the computer players

`npm run tournament` plays seeded computer-only games with no browser. It rotates nations and seating so that no level keeps the same advantage, and prints a table of each level's average score, wins, colonies, colonists, gold, Founding Fathers, independence results and goods spoiled in full warehouses. The engine is deterministic, so the same options always give the same result.

```sh
npm run tournament -- --games 8 --turns 330 --size medium --levels naive,competent,combative,creative
npm run tournament -- --games 6 --turns 300 --size medium --features   # feature-usage audit
```

With those options, the current results are as follows. Creative has the best average and plays head starts.

| Level | Wins | Score | Colonies | Colonists | Goods spoiled |
| --- | ---: | ---: | ---: | ---: | ---: |
| Creative | 2 | 476 | 21.0 | 138 | 10,037 |
| Competent | 4 | 460 | 21.1 | 138 | 9,628 |
| Combative | 2 | 417 | 22.5 | 139 | 8,082 |
| Naive | 0 | 208 | 19.8 | 77 | 15,042 |

Add `--difficulty <level>` (`discoverer`, `explorer`, `conquistador`, `governor`, `viceroy`) to play every arena nation at that level's economics, as if each were a person; without it, games use the standard rules (Conquistador), and `--difficulty conquistador` gives exactly the same results.

Add `--features` to also count how often each level uses each game feature (commands, roads, ships bought, buildings, schools, missions, trade, wars and more), with a table that flags features the advanced levels never or hardly use. The findings so far, and the fixes they led to, are in [docs/AI_FEATURE_AUDIT.md](docs/AI_FEATURE_AUDIT.md).

Simplifications in this alpha:
- Native braves are not shown as units; their raids and gifts happen as events.
- An independent nation cannot trade with Europe.

## Architecture

```
packages/
  engine/              Rules and game state. Pure TypeScript, no DOM, deterministic.
  render-api/          The contract between the game shell and graphical styles.
  style-ligne-claire/  Default style plugin.
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

Inspired by *Sid Meier's Colonization* (MicroProse, 1994) and the FreeCol project. All code and graphics here are original. The graphics are drawn procedurally, with no copied assets.
