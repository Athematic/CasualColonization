# Casual Colonization

A browser clone of Sid Meier's *Colonization*. The game engine is kept separate from the graphics, so different graphical styles can be added as plugins. The default style is **Ligne claire**: even ink outlines and flat, bright colours, in the tradition of the Franco-Belgian comic.

**Alpha 0.1** focuses on cloning the original game. The planned changes come later and build on this engine:

- the number of European nations is chosen when starting a game (1–8) — *already in Alpha 0.1*
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

## What is in Alpha 0.1

- **Map**: generated from a seed, with 13 terrain types and their forested variants, hills, mountains, bonus resources and Lost City Rumours. High seas to the east lead to Europe. Fog of war shows explored land and what your units can currently see.
- **Colonies**: worked fields and buildings with the classic production chains (lumber → hammers, ore → tools → muskets, sugar → rum, and so on). Also food growth and starvation, warehouse limits, horse breeding, Sons of Liberty bonuses, a build queue with hurry-buying, and 13 building types with upgrades.
- **Units**: 31 unit types, including experts, wagon trains, artillery and five kinds of ship. Colonists can take the soldier, dragoon, pioneer or scout role. Pioneers plow, clear forest and build roads.
- **Europe**: a market whose prices move with your trading, tax raises, immigration driven by crosses, recruiting, training experts and buying ships and artillery.
- **Natives**: eight tribes with camps, villages and cities. Scouts can speak to the chief, colonists can learn a skill, and wagon trains or ships can trade.
- **Combat** (classic rules): attacks between Europeans and against native settlements, with terrain, fortification and stockade bonuses, and colony capture.
- **Opponents**: 1–8 European nations, each with a national bonus. Any of them can be computer players, or human players taking turns on one device (hot seat).
- **Saving**: an autosave every turn, a manual save slot, and export or import of save files.

Not yet in the alpha: Founding Fathers, schoolhouses, custom houses, native units and raids, diplomacy and peace treaties, the war of independence, and a victory condition.

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
npm test           # engine rules, an 80-turn simulation with eight AI nations, geometry
npm run build
```

## Roadmap

1. **Alpha (now)**: a faithful clone of the core game, with a configurable number of nations.
2. **Alpha+**: Founding Fathers, schoolhouses, native units, tension and raids, peace treaties, custom houses, and better AI.
3. **Beta: Cooperation overhaul**:
   - replace conquest with alliances, joint ventures and shared colonies between European nations;
   - make indigenous peoples partners: trade agreements, cultural exchange, shared land use and mutual defence;
   - set new victory paths around prosperity and cooperation instead of independence by war.
4. More graphical styles as plugins.

## Credits

Inspired by *Sid Meier's Colonization* (MicroProse, 1994) and the FreeCol project. All code and graphics here are original. The graphics are drawn procedurally, with no copied assets.
