# Design note: Scenario framework (0.9)

## Decisions taken provisionally (pending Simon)

Simon was away when work started and said the open questions roll into 0.9. Steps 0–2 follow the recommendations of section 9 where they touch them; each can still be changed.

- **Q2 (nations per scenario or global):** global identities, per-scenario roles. `NationEntry` (scenarios/types.ts) holds the bonus text, colony names and home port with its character; name, adjective and colour stay in `NATIONS`.
- **Q3 (saves across scenario versions):** a missing `config.scenario` means the Americas and a missing `scenarioVersion` means 1. Loading refuses an unknown scenario and a newer version with a clear message (`SaveVersionError`); an older version loads only through the scenario's `migrate`. The Americas stay at version 1.
- **Q4 (calendar per scenario):** yes, as eras of 1, 2 or 4 turns a year with named seasons (`scenarios/calendar.ts`). The Americas: 1492–1600 one turn a year, then spring and autumn until autumn 1850 (turn 609). Every year and turn rule (the old `yearOf`, `formatDate`, `yearValue`, `turnAfterYears`, `LAST_YEAR` and the three `turnOfYear` copies) now reads the game's calendar. Scaling the computer players' turn thresholds by `ai.pace` is not done yet (see below).
- **Q7 (files and mods later):** the `Scenario` is JSON-shaped except `migrate`.
- **Q8 (no hidden global):** a registry of scenarios plus `scenarioOf(s)`, which reads `s.config.scenario`. There is no "current scenario" variable.
- **Q9 (real rivals for the Americas):** yes, England, France, the Netherlands and Spain; alternative history (all eight) is the default. `config.rivals: 'real'` limits a new game to that set.
- **Q10 (port character):** built in 0.8 with the shape of `NationEntry.port`; the Americas' entries point at `PORT_CHARACTER` as it is.

Implementation choices that differ from the sketch below:
- Step 3 keeps the AI goods lists as four ordered lists on the scenario (`ai.goods.trade`, `export`, `road`, `farm`) rather than tags on `GoodDef`: the lists' orders differ (the trade list starts with silver), and the order decides ties. The four identical export lists (`EXPORT_GOODS`, `EXPORTS`, two `SELLABLE`) became one.
- Step 3's unit selection is one list, `Scenario.units`; Europe's offers, colony builds and immigrants are the catalogue's lists (`TRAINABLE`, `PURCHASABLE`, `COLONY_BUILDS`, `IMMIGRANT_WEIGHTS`) cut down to it (`unitsOf`), not separate scenario lists. A scenario that needs other weights or offers adds them when it needs them.
- A colony report (`colonyReport`) still has a zero for every catalogue good; only the goods in play reach warehouses, markets and cargo. Game codes stay as they were for alternative history and carry "real" as an optional last field for real rivals, since `rivals` changes which nation can intervene in a war of independence.
- The Americas list all four stored maps, the Australia map included: it is a preview played with the Americas' rules until the Australia scenario exists, and leaving it out would change what the New game screen offers.
- Step 2 does not yet add `ai.pace`, `aiTurn` or the council's late-offer turn: the turn thresholds stay as they are, for a later step. Found in step 2 (all compare `s.turn`, tuned for a 609-turn game from 1492):
  - `ai/creative.ts`: `PLAN_FROM.turn` 160, explore before turn 30, independence focus with enough rebels after turn 100, liberty after turn 90, war 60 turns after the last, independence `minTurn` 140 (its profile).
  - `ai/advanced.ts`: scout bought before turn 100, statesman after 30, artillery after 80, preacher before 160, raids on natives after 40, wars after turn 50 and 40 turns after the last, war weariness after 15 turns.
  - `ai/foreign.ts`: wars after turn 50 and 40 turns after the last. `ai/fleet.ts`: privateers from turn 60. `ai/logistics.ts`: `FOREIGN_WAGON_FROM` 80.
  - `ai/profiles.ts`: independence `minTurn` 200 (Competent) and 170 (Combative); `adopt.turn` 240, read by `ai/plan.ts`.
  - `fathers.ts` `offerFathers`: political fathers likelier after turn 120.
  - Durations in turns (cooldowns, `TRIANGLE_PATIENCE`, `INCITE_EVERY`, `WAR_WEARINESS`, `INTERVENTION.minTurns`) are lengths, not dates; whether they scale with the pace is for the same step to decide.

Status: **design**, to be agreed with Simon before work starts; steps 0, 1, 2 and 3 of the plan are done (section 8). Builds on [scenarios.md](scenarios.md) (agreed in principle), [australia.md](australia.md), [events.md](events.md) and [favoured-nation.md](favoured-nation.md).

This note turns "the Americas become the first scenario" into a plan: what is hard-wired today, what a scenario looks like as code and data, how it is stored, how we keep games identical while we move things, and what to build first. The questions that need a decision are collected at the end.

## 1. Goal and non-goals

**Goal.** After 0.9 every game is played in a *scenario*: a package of data (plus a few small, named functions) that the engine reads instead of its fixed tables. The engine keeps the mechanics; the scenario says which nations, peoples, goods, units, buildings, council members, events, calendar, map, mechanics and ways to win are in play.

- **The Americas, 1492–1850** becomes the first scenario **with no gameplay change**: the same seed and the same commands give a bit-identical game, checked by the bench hashes (`scripts/bench-hashes.json`) and by a new golden-hash test that runs in CI.
- A **small second scenario** proves the framework: it must use a different calendar, nation set, council, event set, mechanics switches and victory model, with little or no new art (proposal in section 7).
- The **New game screen** offers the scenario and the rivals choice (the two disabled "planned" selects become real).

**Non-goals for 0.9.**
- Australia and Vinland content (maps, Aboriginal nations and Country, wool and gold, convicts, Federation, the Thing, survival). They come in "Scenarios (content)" and only need to register their content and a few new rules (section 7).
- New mechanics: convict transport, seasonal movement, Federation, drought. 0.9 only leaves the extension points for them.
- Translation into other languages. 0.9 only moves the scenario's *terms* ("Europe", "the New World", "Continental Congress") into data (section 3.13).
- Loading scenarios from files or mods. Scenarios are TypeScript modules compiled into the game; the data is kept JSON-shaped so files can come later (question Q7).
- Rebalancing the Americas. Port character (0.8) and the scenario framework only meet in the data shape (Q10).

## 2. Inventory: what is hard-wired to the Americas

Found by reading the engine, the web shell and the style packages (`grep` for the tables named in the brief, years, "Europe", "New World", nation and father ids). Sizes as in the roadmap: **S** hours, **M** a day, **L** several days. "Stays" means the code stays in the engine and only reads a value from the scenario, or does not change at all.

"Stays" in the counts below means the rows sized "–". Column "becomes": **catalogue** = a definition keyed by a globally unique id that every scenario can use (see 3.1); **selection** = the scenario lists which catalogue entries are in play and in what order; **data** = a value or table on the scenario; **hook** = a modifier at a named hook point (section 4); **registry** = a named function the scenario refers to by id; **text** = a term in the scenario's text table.

### 2.1 Calendar and pacing (7)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 1 | `queries.ts` `yearOf`, `formatDate` | 1492 + turn until turn 108 (1600), then spring and autumn | data: `calendar.eras`; `yearOf(turn, cal = AMERICAS_CALENDAR)` so callers migrate one by one | S |
| 2 | `relations.ts` `yearValue`, `turnAfterYears` | Same rule again, as fractional years (Favoured Nation peace years) | data: derived from the same calendar | S |
| 3 | `score.ts` `LAST_YEAR`, `checkTimeLimit` | Ends after autumn 1850, "the age of colonization is over" | data: `calendar.end`; victory rule `time` (text from scenario) | S |
| 4 | `apps/web` `newgame.ts` `HEAD_START_YEARS`, `turnOfYear`, "At the beginning (1492)"; `progress.ts:272`; `scripts/bench.ts` | A second copy of the 1492/1600 rule in three places | data: `calendar.headStartYears`; one `turnOfYear(cal, year)` in the engine | S |
| 5 | `fathers.ts` `offerFathers` | Political fathers likelier after turn 120 | data: `council.offer.lateTurn` | S |
| 6 | AI turn thresholds: `ai/advanced.ts` (turns 30, 40, 50, 80, 100, 160), `ai/creative.ts` (`PLAN_FROM`, 30, 90, 100), `ai/foreign.ts` (50), `ai/fleet.ts` (60), `ai/profiles.ts` (`minTurn` 200, `adopt.turn` 240) | Tuned for a 609-turn game that starts in 1492 | data: `ai.pace` (1 for the Americas); a helper `aiTurn(s, 120)` returns `round(120 × pace)` | S |
| 7 | `stats.ts` `MAX_SNAPSHOTS` comment "past 1850" | Comment only | stays | – |

### 2.2 Nations (10)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 8 | `rules/nations.ts` `NationId`, `NATIONS` | Eight European nations plus `crown`: name, adjective, colour, bonus text, colony names | catalogue (identity: name, adjective, colour); the bonus, colony names and port move to the scenario's nation entry | M |
| 9 | `NATION_ORDER` in `arena.ts` (rotation `g % 8`), web `newgame.ts` | Fixed list of eight | selection: `nations.sets.alternative` / `.real`; the arena rotates over the scenario's set | S |
| 10 | `HOME_PORTS` (`europe.ts` `portName`, web) | London, La Rochelle, Amsterdam… | data: `NationEntry.port.name` | S |
| 11 | Port character (0.8 item, planned) | Not built yet | data: `NationEntry.port.market` (starting prices, demand, ship prices) | S (shape only) |
| 12 | `rules/colonyNames.ts` `COLONY_NAMES` | One list per nation | data: `NationEntry.colonyNames`, defaulting to the catalogue's | S |
| 13 | Nation bonuses as `if (owner === 'x')` at 8 sites: `production.ts:14` Denmark, `natives.ts:76` France, `europe.ts:327` England, `europe.ts:452` Netherlands, `combat.ts:438` Spain, `queries.ts:104` Portugal, `queries.ts:227` Russia, `game.ts:121` Sweden | Code | hook: `NationEntry.bonus` is a list of modifiers (section 4) plus its text | M |
| 14 | `game.ts` `createGame`: 1–8 nations | Fixed limit | data: `nations.max` | S |
| 15 | `game.ts` `newPlayer`, `startingUnits` | 1,000 gold, 30 crosses, caravel with a veteran soldier and a hardy pioneer (60 tools) | data: `start` (gold, crosses, units with roles and tools) | S |
| 16 | `game.ts:74` | "Your Majesty's expedition… has reached the New World. Sail west" | text | S |
| 17 | `crown` as a pseudo-nation (86 references in 29 files) | The REF's player | stays (engine id); its name and adjective come from text | – |

### 2.3 Peoples (8)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 18 | `rules/nations.ts` `TribeId`, `TRIBES` (9 engine files, `render-api` `tribeColor`, Ligne claire, sprite ids) | Eight tribes: name, colour, settlement kind, skills, wants | catalogue `PEOPLES` (same fields plus `lifeway`, section 3.6) | M |
| 19 | `TRIBE_ORDER` (`game.ts` `s.tribes`, `mapgen.ts` bands) | North to south | selection: `peoples.ids` | S |
| 20 | Settlement kinds `camp`/`village`/`city` and their tables: `rules/natives.ts` (`BRAVES_PER_SETTLEMENT`, `BRAVE_RESPAWN`, `PRODUCE_RATE`, `PRODUCE_CAP`, `INCITE_PRICE`, `CITY_SILVER`), `mapgen.ts` `newSettlement` size and gold, `combat.ts:466` treasure, `natives.ts:209` land price | Three kinds, values spread over four files | catalogue `SETTLEMENT_KINDS` (one row per kind with all its numbers); a scenario may add kinds | M |
| 21 | `rules/natives.ts` `NATIVE_PRODUCE` | Furs, sugar, tobacco, cotton, silver | data: `peoples.produce` | S |
| 22 | Brave, tension, demand, surrender, mission and incite constants (`rules/natives.ts`) | Already one file "so a scenario can later adjust them" | data: `peoples.rules` (partial override) | S |
| 23 | Burial grounds, surrender, missions, converts (`rumours.ts`, `natives.ts`, `combat.ts`) | Always on | data: `mechanics` switches | S |
| 24 | Ligne claire `sprites.ts:205` | Draws a settlement by `def.settlement` | stays (keyed by kind; a new kind falls back to `village`) | S |
| 25 | Text: "dug up the hatchet", "swear eternal vengeance" (`natives.ts`, `rumours.ts`) | English idiom of the period | text (a few keys); stays as is for the Americas | S |

### 2.4 Map (6)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 26 | `mapgen.ts` `generateMap` | Continent centred at 45% of the width; latitude climate bands; terrain thresholds; forest above 0.47; high seas on the two east columns; `MAP_SIZES` | data: `map.generator` (`GeneratorSettings`, Americas defaults are today's constants) | M |
| 27 | `mapgen.ts` `placeSettlements` | Tribes in north-to-south bands of `TRIBE_ORDER`; one settlement per 34 candidate tiles, at least 8 | data: `map.generator.peoples` (bands or regions; density) | S |
| 28 | `mapgen.ts` `sprinkleExtras` | Bonus 5% (6% coastal ocean), rumours 3%, none on arctic | data: `map.generator.extras` (shared with stored maps) | S |
| 29 | `maps/index.ts` `STORED_MAPS`, `StoredMap.tribes` | One global list; the Australia map places `tupi`, `apache`, `sioux` as placeholders | data: `map.stored` lists the scenario's maps; each map's regions name the scenario's peoples | S |
| 30 | Arrival side: `GeneratedWorld.entrySide` is not kept in the state; `independence.ts:58` always puts the Crown on the **east** edge | The REF arrives from the east even on the Australia map | data: map's `entrySide`; derive it from `p.entry` for the Crown (Americas unchanged; see Q12) | S |
| 31 | `maps/index.ts` `CHARS` legend | 13 fixed terrain letters | catalogue: `TerrainDef.char`, so new terrains can be drawn in stored maps | S |

### 2.5 Goods, terrain, units, buildings (9)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 32 | `rules/goods.ts` `GOODS` tuple, `GoodId`; iterated in 18 engine files and 5 web files (`emptyGoods`, `initialMarket`, reports, AI) | Sixteen goods, fixed order | catalogue `GOOD_DEFS` + selection `goods` (the order of the list is the order of keys in the state) | M |
| 33 | `PRODUCT_NAMES` | "Liberty Bells", "Crosses" | text | S |
| 34 | `rules/terrain.ts` `TERRAIN`, `TerrainId` | Thirteen terrains; yields name goods | catalogue; scenario may override yields (`terrain.yields`) and lists the terrains it uses (yields of goods not in play are ignored) | S–M |
| 35 | `rules/units.ts` `UNIT_TYPES`, `IMMIGRANT_WEIGHTS`, `TRAINABLE`, `PURCHASABLE`, `COLONY_BUILDS` | Fixed | catalogue + selection `units.available`, data `units.immigrants`, `units.trainable`, `units.purchasable` | M |
| 36 | Unit ids the engine's logic names: `treasure`, `nativeConvert`, `freeColonist`, `pettyCriminal`, `indenturedServant`, `kingsRegular`, `continentalSoldier`, `veteranSoldier`, `artillery`/`damagedArtillery`, `caravel`, `manOfWar`, `frigate`, `privateer` (about 58 references outside `rules/`) | Code | stays: these are mechanic **slots**; a scenario can rename them in text or point a slot to another unit (`units.slots`, e.g. `startingShip: 'knarr'` for Vinland) | S |
| 37 | `rules/buildings.ts` `BUILDINGS`, `BuildingKind`; `customHouse.requiresFather: 'peterStuyvesant'` | Fifteen buildings, three production chains on colonial goods | catalogue + selection `buildings`; `requiresFather` becomes a council modifier `unlockBuilding` | S–M |
| 38 | AI goods lists: `ai/logistics.ts` `TRADE_GOODS`, `ai/roads.ts` `ROAD_GOODS`, `ai/foreign.ts` `EXPORT_GOODS`, `ai/fleet.ts` `EXPORTS`, `ai/naive.ts` and `ai/advanced.ts` `SELLABLE`, `ai/advanced.ts:813` farm goods | Six hand-kept lists | catalogue tags on `GoodDef` (`ai: { export, farm, road }`), filtered by the scenario's goods, in the same order as today | S |
| 39 | `rules/mines.ts` | Ore and silver mines run out | stays (keyed by good) | – |
| 40 | `combat.ts` treasure from cities, `hernanCortes` | Conquest yields gold | data on the settlement kind (row 20) | S |

### 2.6 Council (Founding Fathers) (7)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 41 | `rules/fathers.ts` `FatherId`, `FATHERS`, `FATHER_CATEGORIES`, `fatherCost` | 25 fathers in 5 categories; cost formula | catalogue of council members; selection `council.members`, `council.categories`; `council.cost` (registry id, Americas `classic`) | S |
| 42 | `fathers.ts` `AI_PREFERENCE` | 13 ids | data: `council.aiPreference` | S |
| 43 | `fathers.ts` `joinCongress` switch | 7 one-off effects (Pocahontas, John Paul Jones, La Salle, Coronado, Bolívar, Las Casas, Fugger) | data: `onJoin` effects (the events' `Effect` union plus a few new kinds, section 4) | M |
| 44 | `hasFather` at 25 sites (`production.ts` 5, `combat.ts` 6, `europe.ts` 4, `natives.ts` 3, `colony.ts` 2, `rumours.ts` 1, `diplomacy.ts` 1, and `queries.ts` `ownerHasFather` 2) plus `colony.ts:402` `requiresFather` | Passive effects as code | hook: the member's `modifiers` (section 4) | M–L |
| 45 | Messages "joins the Continental Congress" (`fathers.ts`), web `congress.ts`, `reports.ts` | "Continental Congress", "Founding Father" | text: `council.name`, `council.memberTitle` | S |
| 46 | `render-api` father icons (`drawFatherCameo`, `drawFatherFigure`, `fatherInitials`), sprite ids `fathers/{father}`, `fathers/{father}__head` | Keyed by `FatherId` | stays (ids are global, so new members get their own sprite ids; procedural cameo when missing) | – |
| 47 | Congress hall backdrop `ui/congress-hall` | One hall | data: `art.backdrops['congress-hall']` per scenario (the Thing for Vinland) | S |

### 2.7 Home port and Europe (5)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 48 | `europe.ts` `SAIL_TURNS = 3` | Three turns each way | data: `homeland.sailTurns` | S |
| 49 | Unit locations `{ kind: 'europe' }` and `{ kind: 'sailing', to: 'europe' \| 'america' }` (28 places), `sailToAmerica` command | Saved in the state | stays: internal ids meaning "home" and "the colonies"; renaming them would break saves and hashes | – |
| 50 | Immigration: crosses, recruit pool, `IMMIGRANT_WEIGHTS`, religious unrest | Fixed | data: `homeland.immigration` (and the convict mechanic later) | S |
| 51 | "Europe" in about 108 engine strings and 50 web strings; "Sail to the New World", "to the New World" | English text | text: `homeland.name`, `colonies.name` terms | M |
| 52 | Taxes, boycotts, custom house | Always on | data: `mechanics` switches | S |

### 2.8 The Crown, independence and victory (9)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 53 | `crown.ts` `REF_GROWTH`, `REF_ON_REFUSAL`, demands, royal wars | Always on | data: `mechanics.crown` (`ref`, `demands`, `royalWars`, numbers) | S |
| 54 | `independence.ts` `DECLARE_AT`, `royalForce`, the REF's units, `declareIndependence`, "War of Independence", "Continental Army" | One way to win | registry: victory rule `independence-war` with its data | M |
| 55 | `rebellion.ts` `MERCENARIES` (Hessian, Swiss, Brunswick…), `INTERVENTION`, Tories | Americas flavour and numbers | data: `mechanics.independence` | S |
| 56 | `ai/royal.ts` | The Crown's AI | stays | – |
| 57 | `score.ts` `SCORE_WEIGHTS` | One table (already "so a scenario can override them") | data: `score` (partial override) | S |
| 58 | `score.ts` `finalScores`, game-over texts in `independence.ts` and `score.ts` | Highest score wins at the end | registry: victory rule `time`; texts from the scenario | S |
| 59 | `rules/difficulty.ts` `DIFFICULTY`, `COLONY_CHARTER` | Five levels; charter 100 × colonies, cap 2,000 | data: `difficulty` (partial override per level), `mechanics.charter` | S |
| 60 | Favoured Nation (`relations.ts`), `GameConfig.noFavoured` | On unless switched off for tournaments | data: `mechanics.favoured` | S |
| 61 | `cheats.ts` | Engine commands | stays | – |

### 2.9 Rumours and events (4)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 62 | `rumours.ts` `resolveRumour` | Eight outcomes with weights; "ruins of a lost civilisation", "Fountain of Youth", "survivors of a lost colony"; de Soto | data: `rumours` table (outcome id, weight formula inputs, text) with handlers in a registry; de Soto becomes a hook | S–M |
| 63 | `events/index.ts` `SETS`, `registerEventSet`, `config.eventSet` | Already a registry; `americas` default | data: `events` names the set; `config.eventSet` stays for tests | S |
| 64 | `events/americas.ts` | Years and `nation === 'france'` | stays (content of the Americas set) | – |
| 65 | `stats.ts` "Share of the New World's land explored" | Text | text | S |

### 2.10 Computer players, tools and tests (4)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 66 | `arena.ts`, `scripts/tournament.ts` | Rotates over 8 nations, Americas only | `--scenario <id>`; rotation over the scenario's set | S |
| 67 | `scripts/bench.ts` and `bench-hashes.json` | Seeds 7, 1492, 123456 and 2024 (to 1700) | stays for the Americas; `--scenario` adds hashes per scenario | S |
| 68 | `packages/engine/test/*` (27 files) | Americas only | stay as the Americas suite; plus a per-scenario conformance suite (section 5) | M |
| 69 | AI profiles (`ai/profiles.ts`) | Nation-agnostic, tuned for the Americas | stays; `ai.pace` and the goods tags (rows 6, 38) are enough for 0.9 | – |

### 2.11 Web shell, art and text (8)

| # | Where | Today | Becomes | Size |
| --- | --- | --- | --- | --- |
| 70 | `newgame.ts` | Disabled "Scenario" and "Rivals" selects; nation slots from `NATION_ORDER`; "Alpha 0.2: a clone of the classic game of colonising the New World" | real selects; slots from the scenario's chosen set; text from the scenario | M |
| 71 | `landing.ts` `COVERS` (A–K), eyebrow "A game of the New World, 1492–1850", heading, bullet list | Americas only | data: `art.covers`, `text.landing`; the title screen shows covers of every scenario, or the last one played (section 6) | S |
| 72 | `app.ts` "Map of the New World", `main.ts` "Preparing the New World…" | Text | text | S |
| 73 | `europe.ts` ("Europe — Port of …", "Sail to the New World"), `routes.ts`, `diplomacy.ts` (declaration text), `reports.ts` (Congress tab, REF), `congress.ts` | Text | text | M |
| 74 | `turnstart.ts:22` regexes on engine messages (`/has arrived in (Europe\|the New World)/`) | Matches English message text | stays working through the term table; better: messages carry a `kind` (later, with localisation) | S |
| 75 | `style-sprites` `DEFAULT_MAPPING`: `settlements/{tribe}`, `fathers/{father}`, `units/{type}__{role}` | Global ids | stays; a scenario may name a pack made with `extendPack` (`art.pack`) | S |
| 76 | `render-api` `tribeColor`, `nationColor` | Read the global tables | stays (catalogue ids are global) | – |
| 77 | `docs/SPRITE_PROMPTS.md`, `docs/BOX_ART_PROMPTS.md` | Americas sections | content: one section per scenario | – |

### 2.12 Counts

| Area | Items | To change | Stays |
| --- | --- | --- | --- |
| Calendar and pacing | 7 | 6 | 1 |
| Nations | 10 | 9 | 1 |
| Peoples | 8 | 8 | 0 |
| Map | 6 | 6 | 0 |
| Goods, terrain, units, buildings | 9 | 8 | 1 |
| Council | 7 | 6 | 1 |
| Home port and Europe | 5 | 4 | 1 |
| Crown, independence, victory | 9 | 7 | 2 |
| Rumours and events | 4 | 3 | 1 |
| AI, tools and tests | 4 | 3 | 1 |
| Web shell, art and text | 8 | 6 | 2 |
| **Total** | **77** | **66** | **11** |

The heavy items are the father and nation effects (rows 13, 43, 44: about 40 code sites become hooks), the goods iteration (row 32: 23 files) and the text terms (rows 51, 73: about 160 strings). Everything else is moving a constant into a table.

## 3. The Scenario definition

### 3.1 Catalogue and selection, not a hidden "current scenario"

Two ways to make the tables scenario-dependent were considered:
- **A module-level "current scenario"** that `createGame` and `deserialize` set. Little churn, but a hidden global: two games in one process (tests, the arena, the web shell's preview) would fight over it, and a forgotten reset changes a game silently.
- **Pass the scenario everywhere** (`rules(s).tribes[id]`). Explicit, but hundreds of call sites.

**Proposal: a global catalogue plus a per-game selection.**
- Every definition (nation identity, people, good, terrain, unit type, building, council member, settlement kind) lives in one **catalogue** keyed by a **globally unique id**. The Americas' 25 fathers keep their ids; Vinland's Leif Eriksson is `leifEriksson`; Australia's wool is `wool`. Lookups by id (`TRIBES[id]`, `FATHERS[id]`, `GOOD_DEFS[id]`, `tribeColor(id)`) keep working without the state, which is most of the code.
- What differs between games is **which** entries are in play, in what order, and with what scenario-specific values. That needs the state, and is read through one function, `scenarioOf(s)`, which looks the scenario up in a registry by `s.config.scenario`.
- So only the code that *enumerates* (all goods, all tribes, all fathers on offer), *chooses* (bonuses, port, calendar, map, victory), or reads a value that a scenario changes goes through `scenarioOf(s)`. The inventory above marks those.
- A scenario that needs a different *definition* of an existing entry (for example a different England bonus in another scenario) puts it on its own entry for that id (`NationEntry`), not in the catalogue.

Id types stay TypeScript unions in 0.9 (adding a nation means adding to `NationId`), which keeps type checking on every id. Loading scenarios from files later would widen them to checked strings (Q7).

### 3.2 Interface sketch

```ts
/** packages/engine/src/scenario/types.ts */
export interface Scenario {
  id: ScenarioId;                 // 'americas'
  /** Bumped when a change to this scenario's data would change a saved game's play (section 3.14). */
  version: number;
  name: string;                   // 'The Americas, 1492–1850'
  description: string;

  calendar: Calendar;
  map: ScenarioMap;
  homeland: Homeland;
  nations: ScenarioNations;
  peoples: ScenarioPeoples;

  goods: GoodId[];                // order = order of keys in markets and warehouses
  terrain?: { ids?: TerrainId[]; yields?: Partial<Record<TerrainId, TerrainYieldOverride>> };
  units: ScenarioUnits;
  buildings: BuildingKind[];

  council: Council;
  events: string;                 // id of a registered event set
  rumours: RumourTable;
  victory: VictoryConfig;
  mechanics: Mechanics;
  difficulty?: Partial<Record<DifficultyId, Partial<DifficultyRules>>>;
  score?: Partial<ScoreWeights>;
  start: StartingKit;
  ai?: { pace?: number };         // 1 = the Americas' pacing
  art: ScenarioArt;
  text: ScenarioText;
}
```

The pieces, with the Americas' values in comments:

```ts
export interface Calendar {
  /** Consecutive eras; each runs until the next one's first year. */
  eras: { from: number; turnsPerYear: 1 | 2 | 4; seasons?: string[] }[];
      // [{ from: 1492, turnsPerYear: 1 }, { from: 1600, turnsPerYear: 2, seasons: ['Spring', 'Autumn'] }]
  /** The game ends after this turn (the time rule of section 3.11). */
  end: { year: number; season?: string };          // { year: 1850, season: 'Autumn' }
  headStartYears: number[];                         // [1550, 1600, 1650, 1700, 1750, 1800]
}

export interface ScenarioMap {
  /** Stored map ids this scenario offers (each map's peoples regions name this scenario's peoples). */
  stored: string[];                                 // ['north-america', 'south-america', 'americas']
  /** Settings for a generated map; absent means stored maps only. */
  generator?: GeneratorSettings;                    // AMERICAS_GENERATOR: today's constants
  default: 'generated' | string;
}

export interface GeneratorSettings {
  sizes: Record<MapSize, { width: number; height: number }>;
  land: { centreX: number; spreadX: number; spreadY: number; threshold: number; margin: [number, number, number, number] };
  climate: { latitude: 'centre-warm' | 'north-cold' | 'south-cold'; bands: ClimateBand[] };
  forest: number;                                   // 0.47
  entrySide: 'east' | 'west';
  highSeasColumns: number;                          // 2
  extras: { bonus: number; coastalBonus: number; rumours: number };
  peoples: { placement: 'bands' | 'regions'; perTiles: number; min: number };
  rivers: boolean;
}

export interface Homeland {
  /** Shown name of the home side: 'Europe', 'Greenland', 'Britain'. Internal ids stay 'europe'/'america'. */
  name: string;
  sailTurns: number;                                // 3
  /** Later: way ports such as Cape Town (Australia). Not in 0.9. */
  stopovers?: never;
  immigration: { crossesStart: number; crossesStep: number; weights: [UnitTypeId, number][] };
}

export interface ScenarioNations {
  /** Alternative history is always offered; real rivals when the scenario has them. */
  sets: { alternative: NationEntry[]; real?: NationEntry[] };
  default: 'alternative' | 'real';
  max: number;                                      // 8
}

export interface NationEntry {
  id: NationId;
  /** The bonus: shown text and its modifiers (section 4). */
  bonus: { text: string; modifiers: Modifier[] };
  colonyNames?: string[];                           // default: the catalogue's
  port: { name: string; market?: PortCharacter };   // 'London'; port character (0.8) goes here
  start?: Partial<StartingKit>;                     // Sweden's expert lumberjack on the docks
}

export interface ScenarioPeoples {
  ids: PeopleId[];                                  // north to south for band placement
  produce: GoodId[];                                // NATIVE_PRODUCE
  rules?: Partial<NativeRules>;                     // the constants of rules/natives.ts
  settlementKinds?: SettlementKindId[];             // camp, village, city
}

/** Catalogue entry (today's TribeDef, generalised). */
export interface PeopleDef {
  id: PeopleId; name: string; color: string;
  settlement: SettlementKindId;
  skills: UnitTypeId[]; wants: GoodId[];
  /** How the people live on the land. 'settled' is the only lifeway the engine runs in 0.9. */
  lifeway: 'settled' | { kind: string; params?: Record<string, unknown> };
}

export interface SettlementKindDef {               // one row instead of six tables
  id: SettlementKindId; size: number; braves: number; respawn: number;
  produceRate: number; produceCap: number; incitePrice: number;
  treasure: { base: number; spread: number }; landPriceFactor: number; silverFactor: number;
  drawAs: 'camp' | 'village' | 'city';              // what the procedural styles draw
}

export interface ScenarioUnits {
  available: UnitTypeId[];
  trainable: UnitTypeId[];
  purchasable: UnitTypeId[];
  /** The units the engine's mechanics name; the Americas' values are today's ids. */
  slots: { startingShip: UnitTypeId; treasure: UnitTypeId; convert: UnitTypeId; royalRegular: UnitTypeId;
           continental: UnitTypeId; royalShip: UnitTypeId /* … */ };
}

export interface Council {
  name: string;                                     // 'Continental Congress'
  memberTitle: string;                              // 'Founding Father'
  categories: FatherCategory[];
  members: FatherId[];                              // ids in the global catalogue
  cost: string;                                     // registry id: 'classic' = fatherCost
  offer: { lateTurn: number; lateBonus: Partial<Record<FatherCategory, number>> };  // 120, { political: 2 }
  aiPreference: FatherId[];
}

/** Catalogue entry (today's FatherDef, with its effects as data). */
export interface CouncilMemberDef {
  id: FatherId; name: string; category: FatherCategory; weight: number;
  effect: string;                                   // shown text
  modifiers?: Modifier[];                           // passive, section 4
  onJoin?: Effect[];                                // once, section 4
}

export interface VictoryConfig {
  /** Rules checked each round, by registry id, with their data. */
  rules: { id: 'time' | 'independence-war' | string; params?: Record<string, unknown> }[];
      // [{ id: 'independence-war', params: { declareAt: 50 } }, { id: 'time' }]
}

export interface Mechanics {
  charter: false | { base: number; cap: number };   // { base: 100, cap: 2000 }
  crown: { taxes: boolean; boycotts: boolean; demands: boolean; royalWars: boolean; ref: false | RefRules };
  independence: false | { mercenaries: MercenaryRules | false; intervention: InterventionRules | false; tories: boolean };
  favoured: boolean;
  customHouse: boolean;
  missions: boolean; burialGrounds: boolean; surrender: boolean;
  convicts?: false;                                 // the mechanic comes with the Scenarios content
}

export interface ScenarioArt {
  covers: { src: string; small: string; alt: string }[];
  pack?: string;                                    // a sprite pack made with extendPack; absent = the player's style
  backdrops?: { 'congress-hall'?: string };
}

/** Terms used in engine messages and the web shell. Values are English; see Q6 on localisation. */
export interface ScenarioText {
  homeland: string; colonies: string; colonyLand: string;   // 'Europe', 'colonies', 'the New World'
  crown: string; king: string; ref: string;                 // 'the Crown', 'the King', 'Royal Expeditionary Force'
  independenceWar: string; army: string;                    // 'War of Independence', 'Continental Army'
  landing: { eyebrow: string; heading: string; bullets: string[] };
  arrival: string; timeUp: string;                          // message templates with {nation}, {heading}, {year}
}
```

### 3.3 The Americas scenario

`scenarios/americas.ts` builds the `Scenario` from the existing tables, so in step 1 nothing moves: `goods: [...GOODS]`, `council.members: Object.keys(FATHERS)`, `calendar` as above, `generator: AMERICAS_GENERATOR` (today's constants), `victory.rules: [independence-war, time]`, `events: 'americas'`, every mechanic on, `ai.pace: 1`. Later steps move each table's *home* into the catalogue and the scenario, but the values never change.

- **Real rivals** for the Americas: England, France, the Netherlands and Spain (the original's four). **Alternative history**: all eight, as today, and the default.

### 3.4 Registry

```ts
registerScenario(americas);          // scenario/index.ts, at module load, like registerEventSet
scenarioOf(s): Scenario              // s.config.scenario ?? 'americas'; throws a SaveVersionError-like error if unknown
listScenarios(): Scenario[]          // the New game screen
```

### 3.5 Nations

As in 3.1: the identity (name, adjective, colour) is in the catalogue, and everything that is a *game* fact (the bonus, the home port and its market, colony names, extra starting units) is on the scenario's `NationEntry`. The two sets (`real`, `alternative`) are lists of entries; the New game screen offers the chosen set. `GameConfig` gets `rivals?: 'real' | 'alternative'` (missing: the scenario's default), which only filters the choice of nations on the setup screen. The engine checks that every configured nation is in the chosen set.

### 3.6 Peoples

Today's `TribeDef` becomes `PeopleDef` with one extra field, `lifeway`. In 0.9 the only lifeway is `'settled'` (fixed settlements, today's behaviour). Australia's Country and seasonal movement are a later lifeway, registered by id with its own per-round function (`peopleBehaviours['seasonal']`), so the engine's native code calls the lifeway's handlers instead of assuming settlements never move. Settlement kinds become one table (row 20), so a scenario can add a "seasonal camp" kind with its own numbers without touching the code.

`Settlement.tribe` and `Tribe.id` keep their names in the state (renaming would change every save and hash); `TribeId` becomes an alias of `PeopleId`.

### 3.7 Goods, terrain, units, buildings

The scenario lists the ids it uses from the catalogue and may add catalogue entries of its own. The engine iterates `scenarioOf(s).goods` instead of `GOODS` (23 files), in the same order, so the Americas' state has the same keys in the same order. Goods not in play never appear in markets, warehouses or yields. A conformance test (section 5) checks the references: every skill, want, yield, building input and output, immigrant and event good is in play.

### 3.8 Council

The council is the scenario's selection of members from the catalogue, its name, its categories, its offer rules, its cost rule and the computer players' preference. Members carry their effects as data (section 4). Portraits stay keyed by member id, so each scenario's figures get their own sprites (`fathers/leif-eriksson`) and the procedural cameo until then.

### 3.9 Events

`events` names a registered set (`registerEventSet`, already in place). `config.eventSet` stays for tests and overrides the scenario's set when given.

### 3.10 Rumours

The outcomes become a table of `{ id, weight: { base, scout?, expert?, deSoto?: 0 }, good | bad | neutral, text }` read in today's order, with the outcome's action in a registry (`gold`, `reveal`, `colonist`, `immigrants`, `lost`, `burial`). The weights are the same numbers in the same order, so `weightedPick` draws the same outcome. Vinland can drop the Fountain of Youth; Australia can rename the ruins.

### 3.11 Victory

A victory rule is a registered function `check(s): GameOver | null` plus its data, run in the order listed at the end of each round (where `checkTimeLimit` and the independence check run today).
- `time`: the game ends after `calendar.end`; highest score wins (today's `checkTimeLimit`).
- `independence-war`: today's declaration, REF and war; winning ends the game with +`score.independence`.
- Later: `federation` (Australia, after the cooperation betas), `survival` (Vinland: a colony of at least N colonists still standing at year X; Q5), `prosperity`.

### 3.12 Difficulty, charter, score, mechanics

Partial overrides merged over the engine's defaults when the game is created: `difficulty[level]` over `DIFFICULTY[level]`, `score` over `SCORE_WEIGHTS`, `mechanics.charter` over `COLONY_CHARTER`. The Americas override nothing. The switches in `mechanics` turn whole systems off by skipping their per-round function (the Crown's REF growth, demands, royal wars, favoured-nation proposals). A system that is off must draw no random numbers, as events already do when switched off.

### 3.13 Text and terms

The scenario's `text` holds the **terms** that differ between settings ("Europe", "the New World", "Continental Congress", "the King", "War of Independence", "Continental Army") and a few whole templates (the arrival message, the end-of-time message, the landing page). Engine messages that use those words get them through `term(s, 'homeland')`. For the Americas every resulting string must be **byte-identical** to today's, because messages and history entries are part of the saved state and the hash. Full localisation (message ids and parameters, other languages) is a separate project (Q6).

### 3.14 How a scenario is stored in a game

```ts
interface GameConfig {
  /** Scenario id; missing means 'americas', so existing saves and the bench hashes stay valid. */
  scenario?: string;
  /** The scenario's version when the game was created; missing means 1. */
  scenarioVersion?: number;
  /** Which nation set the setup screen offered; missing means the scenario's default. */
  rivals?: 'real' | 'alternative';
  // … existing fields
}
```

- **Missing means the Americas.** New Americas games do not write the fields either, so the serialised state, and so every hash, is unchanged. The same pattern as `eventSet`, `historicalEvents` and `colonyCharter`.
- **Loading** (`migrate` in `game.ts`): an unknown scenario fails with a clear message ("This save is from the scenario X, which this version of the game does not have"). A save whose `scenarioVersion` is newer than the registered scenario fails like a newer save format does. An older version loads only if the scenario has a `migrate(from, state)` step for it, otherwise it fails with a message naming the scenario. `SAVE_VERSION` stays 3: the new config fields are optional.
- **When the version goes up:** only when old saves would play wrongly with the new data, for example a removed good or member, a changed calendar, or a renamed id. Tuning numbers does not bump it (a loaded game simply continues under the new numbers, as it does today after an engine update). Q3.
- The scenario's data is **not** copied into the save. It stays small, and a bug fix in the scenario reaches loaded games.

## 4. Effects and rules that are code today

Functions do not serialise. The rule: **the state only ever holds ids and numbers; behaviour lives in registries keyed by id, as pure functions of the state.** This is already how events work (`EventDef.target` and `when` are functions; the state names the set and the event ids).

### 4.1 Modifiers at hook points (passive effects)

A modifier is plain data:

```ts
type Modifier =
  | { hook: 'goodOutput'; good: GoodId; factor: number }                       // Henry Hudson: furs × 2
  | { hook: 'manufactureCapacity'; factor: number; except?: BuildingKind[] }   // Adam Smith: × 1.5, not the carpenter
  | { hook: 'bellsPct'; add: number | 'tax' }                                 // Jefferson +10, Paine + the tax rate
  | { hook: 'crossesFactor'; factor: number }                                  // Penn × 1.5
  | { hook: 'sailTurns'; add: number }                                         // Magellan −1
  | { hook: 'shipMoves'; add: number }                                         // Magellan, Portugal +1
  | { hook: 'landSight'; add: number; roles?: RoleId[] }                       // de Soto; Russia (scouts, dragoons)
  | { hook: 'rumourNoBad' }                                                    // de Soto
  | { hook: 'priceRecovery'; factor?: number; base?: number }                  // de Witt × 2; the Netherlands 0.2
  | { hook: 'noPoorImmigrants' }                                               // Brewster
  | { hook: 'crossesStep'; base: number }                                      // England 12 instead of 20
  | { hook: 'growthFood'; base: number }                                       // Denmark 160 instead of 200
  | { hook: 'nativeGifts'; add: number }                                       // France +0.15
  | { hook: 'offenceVsSettlements'; factor: number }                           // Spain × 1.5
  | { hook: 'unitPower'; unit: UnitTypeId; factor: number }                    // Drake: privateers × 1.5
  | { hook: 'armedFromStock' }                                                 // Revere
  | { hook: 'alwaysPromote' }                                                  // Washington
  | { hook: 'conquestTreasure'; bonus: boolean; freeTransport: boolean }       // Cortés
  | { hook: 'conquestConverts' }                                               // Sepúlveda
  | { hook: 'conversionFactor'; factor: number }                               // Brébeuf × 2
  | { hook: 'convertsBecome'; unit: UnitTypeId }                               // Las Casas
  | { hook: 'freeLand' }                                                       // Minuit
  | { hook: 'europeansAcceptPeace' }                                           // Franklin
  | { hook: 'autoStockade'; minColonists: number }                             // La Salle
  | { hook: 'unlockBuilding'; building: BuildingKind };                        // Stuyvesant: custom house
```

The list is exactly the effects that exist today (25 fathers and 8 nation bonuses), so 0.9 adds no new mechanics; a new scenario adds hooks only when it needs a new kind of effect. The engine reads them with `modifiers(s, nation, 'goodOutput')`, which collects the nation's bonus and its council members' modifiers (and, later, the events' temporary modifiers, which already exist in their own shape and could join this lookup).

**Rules that keep games identical:**
- A hook reproduces today's arithmetic in today's order: `base` replaces a constant, then `factor`s multiply in a fixed order (nation, then council, then difficulty), then `add`s. Where today's code does `(p.id === 'netherlands' ? 0.2 : 0.1) * (deWitt ? 2 : 1) * difficulty`, the hook computes `base * factor * difficulty` with the same operands.
- A lookup never draws a random number, and keeps today's short-circuits: `!hasFather(s, u.owner, 'georgeWashington') && random(s) >= 0.2` must still draw only when the nation lacks the effect.
- **Speed:** `hasFather` sits in hot loops (production). The modifiers per nation are worked out once and cached outside the state (a `WeakMap` keyed by the player object, refreshed when `fathers.length` changes or the game is loaded). `npm run bench` must not get slower by more than 2%.

### 4.2 One-off effects (on joining)

`onJoin` uses the events' tagged `Effect` union (`events/effects.ts`), which already has gold, goods, a unit on the docks (John Paul Jones' frigate) and tension. The rest need a few new effect kinds, also usable by events: `peaceWithAllPeoples` (Pocahontas), `revealAroundColonies` (Coronado), `libertyInColonies` (Bolívar), `convertUnits` (Las Casas), `liftBoycotts` (Fugger), `stockadeInColonies` (La Salle). Each is applied in today's order, so the state changes the same way.

### 4.3 Other registries

| Registry | Key | Used for |
| --- | --- | --- |
| `scenarios` | scenario id | `scenarioOf(s)` |
| `eventSets` (exists) | set id | events |
| `victoryRules` | rule id | `time`, `independence-war`; later `federation`, `survival` |
| `councilCost` | rule id | `classic` (today's `fatherCost`) |
| `rumourActions` | outcome id | today's eight outcomes |
| `peopleBehaviours` | lifeway id | `settled` (today); later `seasonal` (Australia) |
| `effects` (exists in `events/effects.ts`) | effect kind | events and council `onJoin` |

All are filled at module load by the engine or by the scenario module. Mods (Q7) could only combine registered ids, which keeps them safe and deterministic.

## 5. Determinism and testing

**The bar for the Americas: bit-identical games.**
- `npm run bench -- --verify` compares the state hash of four games (seeds 7, 1492 and 123456 for 150 rounds; seed 2024 to 1700) with `scripts/bench-hashes.json`. Every step of section 8 must pass it unchanged; no step re-records hashes.
- CI does not run the bench today. **Step 0** adds a fast **golden-hash test** to `npm test`: two short games (a generated map and the stored `americas` map; 4 nations; events and the charter on; 60 rounds), whose serialised-state hashes are fixtures. That way every pull request in 0.9 is checked, not only those where someone remembers the bench.
- The Americas test suite (27 files) runs unchanged. Tests that build states by hand keep working because a missing `config.scenario` means the Americas.

**Per-scenario suites.**
- A **conformance test** runs over every registered scenario: every id it names exists in the catalogue; goods references are closed (skills, wants, yields, building inputs and outputs, immigrants, event goods, `peoples.produce`); the calendar is increasing and its end lies after the start; each stored map parses and its people regions name the scenario's peoples; each nation set has at least one nation and at most `max`; council categories are not empty; every registry id resolves.
- A **smoke game** per scenario: a 4-nation computer game for the scenario's whole length (or 150 rounds) without errors, checking that no state key names a good or people outside the scenario, plus a golden hash for it.
- A scenario's own tests (its events, its victory rule) live next to it: `packages/engine/test/scenarios/<id>.test.ts`.

**Tournaments per scenario.** `npm run tournament -- --scenario <id>` (arena rotation over that scenario's nation set). The tables in the README stay the Americas reference; each scenario gets its own reference run when it ships. The bench gets `--scenario` too, with its own hash entries.

## 6. User interface

- **New game screen:** the disabled "Scenario" select becomes real, listing `listScenarios()` with the name and one-line description. Changing it resets the nation slots to the scenario's default set, the map list to its stored maps (plus "Random (generated)" when it has a generator), the head-start years to its calendar, and the event switches' descriptions to its set. Scenarios still to come (Australia, Vinland) stay in the list as disabled options with the "Planned · Scenarios" badge, as today.
- **Rivals:** the second planned select becomes real and appears only when the scenario has a real set. "Real rivals (as in history)" limits the nation choices to that set; "Alternative history (any nations)" is the default.
- **Victory:** the third planned select ("Independence by war", "Federation"…) shows the scenario's victory rules read-only in 0.9 (one choice per scenario).
- **Title and landing:** covers come from the scenarios' `art.covers`; the title screen picks at random among all covers of the available scenarios, or among the last-played scenario's when there is one (remembered per browser). The landing copy ("A game of the New World, 1492–1850") comes from the scenario that is shown, or is made general ("Found colonies across the sea…") once there is more than one scenario.
- **In game:** the Europe screen, routes, diplomacy, reports and the Congress screen take their terms from the scenario. The Congress hall uses `art.backdrops['congress-hall']` and the council's name.
- **Styles:** a scenario may name a sprite pack made with `extendPack` (`art.pack`); the game then uses it when the player's chosen style is its base pack, and otherwise falls back to the procedural art for ids the player's style lacks.

## 7. A proof scenario for 0.9, and what comes after

### 7.1 Proposal: "The Caribbean, 1650–1750: the lesser powers"

A short game in the Caribbean in the age of the chartered companies, when small states also founded colonies: the Duchy of Courland held Tobago, Brandenburg-Prussia St Thomas, the Knights of Malta St Kitts and St Croix, Scotland tried Darien. It exercises every part of the framework with little new art:

| Framework part | How the proof scenario uses it | Art needed |
| --- | --- | --- |
| Calendar | 1650–1750 in spring and autumn turns (200 turns); head starts at 1675, 1700, 1725 | none |
| Map | Generated with new settings: warmer climate band, more sea and smaller islands (a higher land threshold), arrival from the east | none |
| Nations | Real rivals: England, France, the Netherlands, Spain, Denmark. Alternative history adds Courland, Brandenburg, Scotland and the Knights of Malta, with their own colours, bonuses (built from existing hooks), home ports (Libau, Emden, Leith, Valletta) and colony names | none (sprites are nation-neutral; colours only) |
| Peoples | A subset: Arawak and Tupi from the catalogue, plus one new people, the Kalinago (Island Caribs), researched and written with the same care as the Americas set | none (procedural settlement by kind) |
| Goods and buildings | A subset: no furs, coats, fur trader building or fur experts (tropical islands) | none |
| Council | About 15 of the existing fathers that fit the period, plus two or three new members whose effects reuse existing hooks | procedural cameos |
| Events | A small set: some Americas events in the window (the Great Frost, the bubbles) and two or three new ones (the Port Royal earthquake of 1692, the Darien scheme's collapse in 1699, a great hurricane) | none |
| Victory | The `time` rule only; the REF and independence are switched off (mechanics), taxes and royal demands stay | none |
| Score, difficulty, charter | Wealth and trade weigh more; the charter is dearer (crowded islands) | none |
| AI | `ai.pace` about 0.35, so plans fit 200 turns | none |
| Landing | One cover can wait; the scenario shows the Americas covers until it has its own (BOX_ART_PROMPTS section L) | optional |

Size: **M** for the content, once the framework exists. Alternatives are in Q1.

### 7.2 Australia and Vinland afterwards

With the framework in place, each later scenario is a module with content, plus a few registered rules where it needs something the engine does not do yet:

| Scenario | Content only (data) | New rules it registers |
| --- | --- | --- |
| **Australia, 1788–1901** | Calendar (1788–1901); the stored Australia map (exists) with its Aboriginal nations as peoples, from reputable sources; Britain plus rivals and an alternative-history set; wool, wheat, timber, whale oil, gold; sheep runs; the Legislative Council members; events (First Fleet, Rum Rebellion, Blue Mountains, gold rush, Eureka, droughts); covers L–M | Convict transport (the shared mechanic, its own roadmap item); the `seasonal` lifeway for Country; drought as a modifier; the `federation` victory rule (after the cooperation betas); way ports (Cape Town) on `homeland.stopovers` |
| **Vinland, around 1000** | Calendar (seasons around 1000–1030); a small map or generator preset (Newfoundland, Labrador); Greenland as the homeland with a long, risky route; Norse units through `units.slots` (the knarr as the starting ship); iron and timber; the Thing as the council; saga events; covers N–O | The `survival` victory rule; winter as a seasonal modifier |

## 8. Phased implementation plan

Every step keeps the Americas games identical (bench hashes and the golden-hash test unchanged) and all tests green, and can be merged on its own into the 0.9 branch.

| Step | What | Size | Status |
| --- | --- | --- | --- |
| 0 | **Guard rails.** The golden-hash test in `npm test`; `bench -- --verify` documented as required for every 0.9 pull request | S | done: `packages/engine/test/golden.test.ts` (re-record with `npm run test:golden:write`); README, Performance |
| 1 | **Skeleton.** `scenario/` with the `Scenario` type, the registry, `scenarioOf(s)`, and an Americas scenario that only points at today's tables; `config.scenario`, `scenarioVersion` and `rivals` (optional); loading checks; the conformance test | M | done: `packages/engine/src/scenarios/` (`types.ts`, `americas.ts`, registry in `index.ts`); checks in `createGame` and `migrate`; `test/scenarios.test.ts` |
| 2 | **Calendar.** `yearOf`, `formatDate`, `yearValue`, `turnAfterYears`, `LAST_YEAR` and the three `turnOfYear` copies read the calendar; `ai.pace` with `aiTurn`; `offerFathers`' late turn | S–M | done for the calendar: `packages/engine/src/scenarios/calendar.ts`, `Scenario.calendar`, `calendarOf(s)`; the engine, the web game (New game, Progress and every date shown) and the bench use it; `test/calendar.test.ts`. `ai.pace`, `aiTurn` and the late-offer turn moved to a later step (thresholds listed at the top) |
| 3 | **Selections.** Goods (23 files), peoples order, nation sets (arena, web), terrain and units lists, buildings, council members, AI goods tags; nation entries with port name, colony names and starting kit; port character's data shape | M–L | done for the selections: `Scenario.units`, `.buildings` and `.ai.goods`; helpers `goodsOf`, `peoplesOf`, `nativeProduceOf`, `buildingsOf`, `unitsOf`, `councilOf`, `aiGoodsOf` (`scenarios/index.ts`) read by the engine, the AI, the arena (`scenario`, `rivals`; tournament `--scenario`, `--rivals`) and the web game; the New game screen's Rivals select works; `test/selections.test.ts` plays a scenario without cigars and the Aztec. Left for later steps: terrain lists (step 6), stored maps' peoples (step 6), nation entries' colony names, port name and starting kit read by the engine (step 4 with the bonuses) |
| 4 | **Effects as data.** The modifier hooks and their cache; 8 nation bonuses and 25 fathers' passive effects; `onJoin` effects; `unlockBuilding`. The step most likely to break identity, so it lands in two or three pull requests (production and Europe; combat and natives; the rest) | L | |
| 5 | **Mechanics and victory.** Switches for the Crown, REF, independence, favoured nation, charter, custom house, missions; the victory registry with `time` and `independence-war`; score and difficulty overrides; rumour table | M | |
| 6 | **Map and peoples.** Generator settings; stored maps per scenario; arrival side for the Crown; settlement-kind table; `PeopleDef` with `lifeway` | M | |
| 7 | **Terms and UI.** The text table and `term()`; the New game screen's Scenario and Rivals selects; landing and covers per scenario; Congress hall per scenario; `--scenario` for the arena, tournament and bench | M | |
| 8 | **Proof scenario.** Content of section 7.1, its tests, a tournament reference and bench hashes; a short design-note update | M | |
| 9 | **Docs.** README (scenarios), STYLE_PLUGINS (scenario packs), events.md and scenarios.md updated; ROADMAP status | S | |

Total: about **XL** (roughly two weeks of agent work in the project's sizes: one L, five M, three S, plus the proof content). The roadmap's current L for the framework is too low; Q11.

**Risks.**
- **Identity breaks quietly.** A reordered multiplication, a new key in the state, or a lookup that draws a random number changes hashes. Mitigation: step 0, small pull requests, the rule that a step never re-records hashes.
- **Speed.** Scenario lookups in hot loops (production, path search, AI scoring). Mitigation: the modifier cache, `scenarioOf` as a cheap field read, the bench timing in every pull request.
- **Hidden Americas assumptions** not in the inventory (an AI heuristic that expects furs, a test that expects eight tribes). Mitigation: the proof scenario drops goods and adds a people on purpose, and its smoke game finds what is left.
- **Type churn.** Widening `GoodId` or `TribeId` to strings would touch many files; keeping unions (section 3.1) avoids it in 0.9.
- **The proof scenario's computer players** are tuned for the Americas and may play a 200-turn island game badly. Acceptable for a proof; measured by a tournament, not fixed in 0.9.
- **Scope creep** into Australia content (convicts, Country). The non-goals hold it back.
- **Content care.** New peoples (the Kalinago) and later Aboriginal nations need research and respectful text, as `australia.md` says; that work is part of the content items, not the framework.

## 9. Open questions for Simon

| # | Question | Recommendation |
| --- | --- | --- |
| Q1 | **Which proof scenario?** (a) The Caribbean, 1650–1750: the lesser powers (section 7.1); (b) the Americas rules with an alternative-history nation set on the existing Australia map; (c) a short "Americas from 1600" variant | **(a).** It tests the calendar, a goods subset, a new people, a council subset, mechanics switches and a different victory with no art. (b) is cheaper but would put American tribes in Australia, which the care section of `australia.md` rules out; (c) tests too little. |
| Q2 | **Nations per scenario or global?** | **Global identities, per-scenario roles.** Name, adjective and colour are global (England is England everywhere); bonus, home port and port character, colony names and starting kit are per scenario. A scenario that wants a different identity (Britain in 1788) uses a new id. |
| Q3 | **Saves across scenario versions.** | Refuse unknown scenarios and newer versions with a clear message; older versions only through an explicit `migrate` step. Bump a scenario's version only when old saves would play wrongly (removed or renamed ids, a changed calendar), not for tuning. The Americas stay at version 1 through 0.9. |
| Q4 | **May the calendar differ per scenario?** | **Yes**, as eras of 1, 2 or 4 turns a year with named seasons, which reproduces 1492/1600 exactly and allows seasons for Vinland. The computer players' turn thresholds scale with `ai.pace`. |
| Q5 | **Is Vinland's victory "survival by a year"?** | **Yes, with a size:** at least one colony of N or more colonists still standing in year X (for example 1030), with the score breaking ties. Decide N and X with the content. |
| Q6 | **Localisation now or later?** | **Later.** 0.9 moves only the scenario's terms into data (`term(s, key)`), keeping English strings byte-identical. Real localisation needs message ids in the state and is its own project. |
| Q7 | **Load scenarios from files or mods later?** | **Later, and only as data.** Keep every scenario field JSON-shaped except references to registry ids, so a JSON scenario could combine registered rules, hooks and effects but not run its own code. Not before Beta. |
| Q8 | **Hidden "current scenario" global, or the state everywhere?** | **Neither:** a global catalogue with unique ids, plus `scenarioOf(s)` only where the code enumerates or chooses (section 3.1). |
| Q9 | **Should the Americas get the real-rivals option in 0.9?** | **Yes:** England, France, the Netherlands and Spain. Cheap, and it makes the Rivals select real on the first scenario. Alternative history (all eight) stays the default. |
| Q10 | **Port character (0.8, planned): build it in 0.8 or in 0.9?** | Build it in **0.8** as a `PORT_CHARACTER` table keyed by nation with the shape of `NationEntry.port.market`; step 3 moves it onto the nation entries. It changes games, so it must land *before* step 0 records the golden hashes, or re-record them once on purpose. |
| Q11 | **Size.** The roadmap says L for the framework. | Make it **XL** (the framework) plus **M** (the proof scenario), as one release. |
| Q12 | **The Crown arrives on the east edge even on west-entry maps** (`independence.ts:58`). Fix in 0.9? | **Yes**, in step 6: derive the side from the nation's entry. It changes only games on the Australia map, which are a preview today. |
| Q13 | **Do the unit "slots" (treasure, convert, regulars, the starting ship) stay engine concepts?** | **Yes.** A scenario points a slot at a unit type and renames it in text; the mechanics stay in the engine. |
| Q14 | **Title screen with several scenarios:** random covers from all scenarios, or the last-played one? | Covers of the **last-played** scenario when there is one, otherwise all. Landing copy becomes general once there are two scenarios. |
| Q15 | **Should Australia and Vinland stay visible as disabled "planned" options** in the Scenario select during 0.9? | **Yes**, as today, so players see where the game is going. |


## Added after the 0.8 measurements

- **Arena play-on:** a won or lost War of Independence ends the game for every nation, so tournaments stop at the first one (all games so far ended before turn 380, about 1736). The victory rules in step 5 should let the arena continue for the other nations (an option, not the default for people's games), so computer players can be measured to the end year.
