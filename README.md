# Casual Colonization

A browser clone of Sid Meier's *Colonization*. The game engine is kept separate from the graphics, so different graphical styles can be added as plugins. The default style is **Ligne claire**: even ink outlines and flat, bright colours, in the tradition of the Franco-Belgian comic.

**Alpha 0.2** focuses on cloning the original game. The planned changes come later and build on this engine:

- the number of European nations is chosen when starting a game (1–8) — *already in the alpha*
- relations with other nations and with indigenous peoples centre on **cooperation rather than combat** — *planned, see [Roadmap](#roadmap)*

## Play

```sh
npm install
npm run dev        # http://localhost:5173
```

Or build a static site with `npm run build` (output in `apps/web/dist`), or a single self-contained HTML file with `npm run build:single`. The GitHub Pages workflow publishes it automatically once Pages is enabled for the repository (*Settings → Pages → Source: GitHub Actions*).

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
| Pan and zoom | Drag, mouse wheel, pinch | `+`, `-`, `C` centres on the unit |

In a colony, click a colonist and then a field or building to put them to work. Click a worker's own field again to switch what it produces.

## What is in the alpha

- **Map**: generated from a seed, with 13 terrain types and their forested variants, hills, mountains, bonus resources and Lost City Rumours. High seas to the east lead to Europe. Fog of war shows explored land and what your units can currently see.
- **Colonies**: worked fields and buildings with the classic production chains (lumber → hammers, ore → tools → muskets, sugar → rum, and so on). Also food growth and starvation, warehouse limits, horse breeding, a build queue with hurry-buying, and 15 building types with upgrades.
- **Liberty**: Sons of Liberty bonuses and the Tory penalty for colonies with many royalists.
- **Schools**: a schoolhouse, college or university lets experts teach. Criminals become servants, servants become free colonists, and free colonists become experts.
- **Continental Congress**: liberty bells bring 25 Founding Fathers, offered one per category, each with its classic effect (Jefferson, Pocahontas, Brewster, Stuyvesant, Cortés, de Soto and the rest).
- **Units**: 36 unit types, including experts, wagon trains, artillery, treasure trains and six kinds of ship. Colonists can take the soldier, dragoon, pioneer, scout or missionary role. Pioneers plow, clear forest and build roads.
- **Europe**: a market whose prices move with your trading, immigration driven by crosses, recruiting, training experts and buying ships and artillery.
- **Taxes and boycotts**: the Crown raises taxes. Refuse a raise and your colonists dump the goods in the harbour, and that good is boycotted until you pay the arrears. A custom house (with Stuyvesant) sells exports automatically.
- **Natives**: eight tribes with camps, villages and cities. Scouts speak to chiefs, colonists learn skills, wagons and ships trade, missionaries found missions that bring converts, and land next to a settlement has to be bought or taken. Each tribe's tension rises as colonies crowd its land; angry tribes raid colonies and furious ones go to war, while trade, gifts and missions calm them.
- **Combat**: attacks between Europeans and against native settlements, with terrain, fortification and stockade bonuses. Veterans and promotions; soldiers re-arm from colony warehouses; colonies can be captured. Burned cities yield treasure, which a galleon or the Crown (for half) carries to Europe. Ships are damaged and sent for repair at a drydock or in Europe. A shipyard builds ships.
- **Diplomacy**: war and peace with other European nations, which fight back while at war and make peace once war-weary. Gifts to tribes are made from the Foreign Affairs screen.
- **War of Independence**: once half your colonists are rebels, declare independence. Europe closes, veterans form the Continental Army, and the Royal Expeditionary Force lands in waves. Destroy it to win; lose half your colonies and the rebellion fails.
- **Game end**: the game ends with independence or in 1850, with scores.
- **Opponents**: 1–8 European nations, each with a national bonus. Any of them can be computer players, or human players taking turns on one device (hot seat).
- **Saving**: an autosave every turn, a manual save slot, and export or import of save files. Saves from Alpha 0.1 are upgraded on load.

Simplifications in this alpha:
- Native braves are not shown as units; their raids and gifts happen as events.
- The computer nations never declare independence, and they don't use schools or missions.
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

1. **Alpha (now)**: a faithful clone of the classic game, with a configurable number of nations.
2. **Alpha+**: visible native units, a smarter computer opponent, and balance passes.
3. **Beta: Cooperation overhaul**:
   - replace conquest with alliances, joint ventures and shared colonies between European nations;
   - make indigenous peoples partners: trade agreements, cultural exchange, shared land use and mutual defence;
   - set new victory paths around prosperity and cooperation instead of independence by war.
4. More graphical styles as plugins.

## Credits

Inspired by *Sid Meier's Colonization* (MicroProse, 1994) and the FreeCol project. All code and graphics here are original. The graphics are drawn procedurally, with no copied assets.
