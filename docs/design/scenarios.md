# Design note: Scenario framework

Status: **idea, agreed in principle**. To be designed in detail before work starts.

## Goal
Every setting the game can be played in is a **scenario**: a data package the engine loads. The engine provides the mechanics (colonies, production, markets, movement, diplomacy). The scenario provides the world they run in. Today's game becomes the first scenario, *The Americas, 1492–1850*.

## What a scenario defines
- **Era:** start and end year and the length of a turn (years, then seasons).
- **Map:** either a **dedicated custom map** or a **generated one**, with generator settings: continent shape, climate bands, terrain mix, rivers, where the sea route to the home port lies. A scenario can offer both and let the player choose.
- **Nations:**
  - **Real rivals:** the nations that were actually there, with their real home ports.
  - **Alternative history:** a wider choice of nations.

  The player chooses between the two at setup when a scenario offers both. Each nation gets its bonus, colour and colony names.
- **Peoples:** the indigenous peoples, how they live (fixed settlements, seasonal movement, Country), their skills and wants.
- **Goods, terrain, units and buildings:** which of the shared definitions are used, plus additions (wool and sheep runs, whale oil, gold fields).
- **Home port:** distance and route. There can be stopover ports (Cape Town), or a nearby base instead of Europe (Greenland for the Vikings).
- **Congress:** the figures (Founding Fathers or their counterparts) and their effects.
- **Events:** historical and random event sets, using the 0.6 event framework.
- **Mechanics switched on or off:** for example convict transport, the Royal Expeditionary Force, Favoured Nation, custom houses.
- **How to win:** independence by war, Federation by negotiation, survival, prosperity, score.

## Scenario ideas
| Scenario | Focus |
| --- | --- |
| **The Americas, 1492–1850** | The current game. Real rivals or alternative history; dedicated or generated map. |
| **Australia, 1788–1901** | Convicts, distance, drought, wool and gold; Federation by negotiation. See [australia.md](australia.md). |
| **Vinland, around 1000** | Norse settlers sailing from Greenland. Survival with poor resources and a fragile supply line, not competition between nations. Few colonists, long winters, iron and timber scarce, relations with the Skrælings decide the outcome. Winning means a colony that still stands after N years. |

## Convict transport (a shared mechanic)
- **What it is:** the Crown sends convicts as colonists. They are cheap or free labour, but bring unrest and reduce liberty, and they can earn their freedom. You can lobby for free settlers instead.
- **In Australia:** the main source of colonists from 1788.
- **In the Americas:** a limited, late-game version for British colonies. This is historical: under the Transportation Act of 1718, tens of thousands of convicts were sent to the American colonies until 1776.

## Engine work
- Move the hard-coded tables (`TRIBES`, the goods, `NATIONS`, years, Founding Fathers, independence rules, `mapgen` settings) behind a `Scenario` interface.
- Store the scenario's id (and version) in the `GameState`.
- Let a scenario adjust or replace the difficulty table (`DIFFICULTY` in `rules/difficulty.ts`: named multipliers and values per level).
- Show a choice of scenario on the New game screen.
- Run tournaments for each scenario.
- Tests run for every scenario.
