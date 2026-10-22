# Design note: Australia scenario

Status: **idea**. Builds on the [scenario framework](scenarios.md).

## Goal
A second setting: the colonisation of Australia, roughly 1788–1901, instead of the Americas, 1492–1850. The rules stay the same, with different land, peoples, goods, history and ending.

## Why it fits this project
- **Convicts:** they were the main source of colonists. The criminal → servant → free colonist path already exists and becomes the main source of settlers.
- **Peaceful ending:** independence came through **Federation (1901)** by negotiation, not by war. That is a natural winning path for the cooperation overhaul.
- **Different pressures:** the Americas are about fighting over land. Australia is about **distance** (8 months by sea), **water** and a mostly dry interior.

## What changes
| Area | Americas (now) | Australia |
| --- | --- | --- |
| Years | 1492–1850 | 1788–1901 (maybe 1606 for the Dutch prelude) |
| Nations | 8 European nations | Britain dominant; the Netherlands, France and perhaps Spain or Portugal as rivals; alternative history welcome |
| Peoples | 8 tribes with camps, villages and cities | Hundreds of Aboriginal nations with no permanent towns, plus Torres Strait Islanders. Needs a different model of land (Country), seasonal movement and trade, not just settlements |
| Goods | Sugar, tobacco, cotton, furs… | Wool (sheep), wheat, timber (red cedar), whale oil, sealskins, wine, sugar; **the gold rush (1851)** as a turning point |
| Map | High seas to Europe in the east | A very long sea route, perhaps with a way-port such as Cape Town; Tasmania, a fertile coastal strip, a tropical north, a desert interior; few rivers (the Murray–Darling) |
| Terrain and production | Current terrain types | Desert, scrub, savanna and similar; **water and drought** as limits; sheep runs on large areas of land |
| Ending | War of Independence or 1850 | Federation by negotiation (votes, conferences), with a score in 1901 |
| Events | — | First Fleet, the Rum Rebellion, crossing the Blue Mountains, the gold rush, Eureka Stockade, droughts, bushfires, inland exploration |

## Engine work (most of the cost)
Today the rules are hard-coded for the Americas: `TRIBES`, the goods, nations, years, `mapgen`, Founding Fathers and the War of Independence. The real work is to turn these into a **scenario definition**: a data package that provides the map or generator, nations, peoples, goods, units, buildings, Congress figures, era, events and how to win. Once that exists, Australia (and any later setting) is mostly content. The Americas become one scenario.

## Care with the subject
The colonisation of Australia includes frontier wars, massacres, land taken under the "terra nullius" doctrine, and the Stolen Generations. The game must not present the land as empty or Aboriginal peoples as obstacles. Their nations, languages and Country should be shown with respect and based on reputable sources (for example, the AIATSIS map of Indigenous Australia). The cooperation focus helps here, but it needs care in the design and in the text, not only in the rules.

## Decided
- **Rivals:** both. *Real rivals* (Britain, with others only exploring) and *alternative history* (a French Western Australia, a Dutch New Holland and so on) are setup options, as in every scenario.
- **Map:** both. A dedicated map of Australia, or a generated map in an Australian style.
- **Convict transport:** a mechanic in its own right, shared with the Americas, where British colonies get a limited late-game version. See [scenarios.md](scenarios.md#convict-transport-a-shared-mechanic).

## Open questions
- **Placement:** does the scenario come after the cooperation betas, so it can use them?
