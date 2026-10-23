# Changes to come

This file is the inbox for new ideas. Once we have discussed an idea, it moves to [ROADMAP.md](ROADMAP.md), which says where each one went.

## Tweaks

- Update tiles with tessellation (https://www.sandromaglione.com/articles/how-to-create-a-pixel-art-tileset-complete-guide + https://www.sandromaglione.com/articles/pixel-art-game-tileset-made-easier)
- Consider adding one ore two branches for UI redesigns using Anthopics frontend-design skills
- Consider adding more sprites to the UI
- Terrain tesselation
- Terrain variants (generate several sprite variants and either randomize or random+prevent-same-neighbors)

### AI intelligence too low

- I started a game where the computer played for me for almost the maximum amount of turns. The computer mostly seemed to make good calls, but when i took over 9 of the last 12 reports where about wares spoiling in various colonies. A smart agent (really anyone above naive) should be able to buy more ships or set up trading with other nations or indigineous peoples to prevent spoiled wares.
- Computer controlled nations tends to build colonies with only on terrain tile between them, often they almost make a grid. Agents should prefer at least 2 tiles between cities (tiles should not be shared between colonies, so if one colony harvests a tile, other cities cannot). The smarter the computer is, the more it should consider yield and terrain bonuses to optimize colony locations (one colony that can grow to max size is much better that many small colonies in the endgame (but many small colonies might be advantagious early on - a few tournaments might get some data to work from).

## Missing features

Compared with the gameplay of the original game, as described in the Wikipedia article. Everything not listed here is already in the alpha: Europe and the market, immigration, colonies and production chains, schools, the Continental Congress, natives (learning, trade, missions, land, tension, raids), Lost City Rumours, treasure, custom houses, boycotts, the War of Independence and scoring.

### Native peoples
- **Visible native units.** Braves that wander between settlements, visit colonies (bringing gifts or trading), demand tribute when angry and attack as units, instead of raids being abstract events.
- **Armed and mounted braves.** Natives who get muskets and horses through trade or capture fight harder, as in the original.
- **Buying from natives.** Wagon trains and ships can buy goods from settlements (furs, silver, cotton) as well as sell to them, at prices that change with what the tribe has.
- **Burial grounds.** A rumour outcome: disturbing a burial ground turns the tribe against you permanently.
- **Surrender of a tribe.** Destroying a tribe's capital can make the remaining settlements submit.
- **Missionary actions.** Missionaries can denounce another nation's mission, or incite a tribe against a rival nation.

### The Crown
- **Royal demands.** The king occasionally demands a sum of gold; refusing costs goods or goodwill.
- **Royal wars.** The Crown drags its colonies into wars with other European nations, whether or not the player wants war.
- **A growing Royal Expeditionary Force.** In the original, the king adds troops to the REF throughout the game, more as liberty grows, and the player can watch it build up. Here it is sized once, at the declaration.
- **Mercenaries.** During the war of independence, foreign mercenaries offer their services for gold.
- **Foreign intervention.** A rival European power sends a force to help a rebellion that is holding out (known as the intervention force in later versions).
- **Tories after the declaration.** Colonies with few rebels can resist or desert the cause.

### Economy and logistics
- **Rivers.** Minor and major rivers are missing entirely. Moving along a river costs the same as a road. River tiles produce more (major rivers more than minor ones), and they make good colony sites. Rivers are fixed features that cannot be built or removed. The map generator, the stored maps (the Mississippi, St. Lawrence, Amazon, Río de la Plata and others), movement, production, both graphical styles and the computer players' choice of colony sites all need updating.
- **Trade routes.** Standing orders for ships and wagon trains to load and unload goods between colonies and Europe automatically. This is the original game's answer to warehouses overflowing, and it also helps the computer players.
- **Wagon trains in use.** Wagon trains can be built, but neither people nor the computer have much reason to use them without trade routes.
- **Running out of resources.** Silver and ore deposits run out after heavy mining.
- **Trading with other Europeans.** Selling goods to another nation's colony (Jan de Witt's original effect).

### Military
- **Damaged artillery.** Artillery that loses a fight is damaged first, and destroyed only on a second loss.
- **Ambush bonus.** Attackers in woods and hills get a terrain bonus against units in the open.
- **Fortress level.** The third stockade level (fortress), and coastal forts firing on enemy ships.
- **Capturing equipment.** A winning unit can take horses or muskets from the loser.

### Game setup and information
- **Difficulty levels.** The original has five (Discoverer to Viceroy). They affect prices, taxes, native tension, the size of the REF and the computer players.
- **Advisor reports.** Colony, trade, military, naval, religious and native overviews, plus a Continental Congress report and a history of past events.
- **Abandoning a colony,** and **retiring** to end the game early with your current score.
- **Map editor** for making new stored maps in the game.

## New Features

- Allow nations to buy more ships at their home port, include all the options from the original game and one or two more.

- Add a Cheat menu with at least these options: "Add 10.000 gold to treasury", "Double all selling prices in home port", "Force peace between all nations", "Double all terrain yields".

- Allow Nations to achieve "Favoured Nation" state with other nations (computer controlled players never declare war against favoured nations and nations can trade and buy ships (except war ships) in the home port of other favoured nations to achieve better prices. Having access to more than one european port should allow for "Triangle Trading" by the smartest AIs (if the prices support it). Ask if you are unsure how this would work.

- Add tracking of various aspects of progress and add an option to view Progress Graphs comparing the nations over time (after a game ends, show this screen)

- Add historical events: open to interpretation (can be turned off in the "Game" menu).

- Add random events: open to interpretation, take inspiration from SIM City games (can be turned off in the "Game" menu).

- Add Roads (inspiration from Civilization II).

## Major Releases

- Allow longer games: after the current end year, the game changes to become a Civilization II clone, adding tech trees, diplomacy, new unit types etc.
