# Writing a scenario

A scenario is the world a game is played in: its years, map, nations, peoples, goods, council, events and ways to win. The engine provides the mechanics (colonies, production, markets, movement, diplomacy, combat). The scenario provides the data and a few small named rules.

Two scenarios exist: **the Americas, 1492–1850** (`packages/engine/src/scenarios/americas.ts`, the original game) and **the Caribbean, 1650–1750** (`caribbean.ts`, the proof that the framework works). Australia and Vinland are planned. The reasons for the design, and what each step of the 0.9 work built, are in [design/scenario-framework.md](design/scenario-framework.md); the plans for the later scenarios are in [design/scenarios.md](design/scenarios.md).

A scenario is a TypeScript module that exports a `Scenario` (`scenarios/types.ts`). It is JSON-shaped, except the optional `migrate` function, so files could be loaded later. Definitions that have an id (goods, units, buildings, terrains, peoples, council members) stay in the shared catalogue under `packages/engine/src/rules/`. A scenario only picks which are in play and in what order. There is no "current scenario" variable: the engine reads the game's scenario with `scenarioOf(s)`, which looks up `s.config.scenario` (missing means the Americas).

## The Americas must not change

Every change to the engine must leave the Americas bit-identical. Before you open a pull request:

```sh
npm test                       # includes the golden-hash test
npm run bench -- --verify      # must say "same" for every game
```

If a change is meant to change games, re-record with `npm run test:golden:write` and `npm run bench -- --verify --write`, and say so in the commit message.

## The `Scenario` fields

| Field | What it says |
| --- | --- |
| `id`, `name`, `description` | The id is stored in saves and game codes and never changes. Name and description are shown on the New game screen. |
| `version` | Bump it only when old saves would play wrongly (a removed or renamed id, a changed calendar), not for tuning. The Americas are version 1. A save of a newer version, or of an unknown scenario, is refused with a message (`SaveVersionError`). A save of an older version loads only through `migrate`. |
| `hidden` | Leaves the scenario out of the New game screen. It still loads and plays. Test scenarios use it. |
| `calendar` | See [Calendar](#calendar). |
| `map` | See [Map settings](#map-settings-and-settlement-kinds). |
| `terrain` | The terrains in play. The generator and the stored maps may use only these (the conformance test checks it). `ocean` and `highSeas` must be on the list. |
| `nations` | See [Nations](#nations). |
| `peoples` | The indigenous peoples in play (`ids`, north to south, the order of the generator's bands), the goods their settlements `produce`, the `settlements` table (one settlement kind for each lifeway), `overrides` for a people's skills, wants or treaty `temperament` (`open`, `guarded`, `proud`) in this scenario only, and `rules`, changes to the engine's native rules. See [Native rules](#native-rules). |
| `goods` | Goods in play. The order is the order of keys in markets and warehouses. |
| `units` | Unit types in play. Europe offers, colonies build and immigrants arrive only from this list. The engine's named slots (treasure, the King's regulars, the starting ship) must be on it. |
| `buildings` | Buildings in play, in production order (tools are made before the armory uses them). |
| `council` | The scenario's council (the Americas: the Continental Congress). `categories`, `members` (ids from the catalogue's `FATHERS`) and optional `effects` that replace a member's effects in this scenario. |
| `ai` | What the computer players need to know: `pace`, `islands` and four goods lists. See [Computer players](#computer-players). |
| `events` | The id of a registered event set. See [Events](#events). |
| `mechanics` | Sixteen switches. See [Mechanics switches](#mechanics-switches). |
| `alliances` | Optional overrides of the alliance rules (`ALLIANCE_RULES` in `alliances.ts`): `requires` (the rung an alliance builds on, `'favoured'` or only `'trade'`), `peaceYears` and `volume` (the hidden thresholds that unlock it), `longPeace` (the years of peace with a trade agreement after which "old friends" may ally without the rung or the trade, 150 ± 30), `waitingYears` and `hostilityYears` after leaving one, `sharedBells` (the share of each ally's bells that helps the others' Congress, 0.1) and `expeditionCost` (a joint expedition, 1,200 gold, half each). See [Alliances](#alliances). |
| `peopleTreaties` | Optional overrides of the rules for treaties with native peoples (`PEOPLE_TREATY_RULES` in `peopletreaties.ts`), the tables field by field. See [Treaties with peoples](#treaties-with-peoples). |
| `companyRules` | Optional overrides of the chartered companies' rules (`COMPANY_RULES` in `companies.ts`): `capital` (2,000), `foundingShares` (20), `sharePrice` (the least, 100), `dividendEvery` (10 turns), `reserve` (800) and `payout` (0.5 of the gold above the reserve). See [Chartered companies](#chartered-companies). |
| `victory` | The ways the game can end, in the order they are checked. See [Victory](#victory). |
| `rumours` | The outcomes of a Lost City Rumour and their odds, in the order they are drawn. The Caribbean reuses the Americas' table. |
| `difficulty`, `score` | Optional overrides, merged over the engine's `DIFFICULTY` table and `SCORE_WEIGHTS`. Fields and levels you leave out keep the engine's values. `score.peopleTreaty` (engine 3; the Caribbean 5) counts each treaty with a people in force, any kind, as the "Treaties with native peoples" line; 0 leaves the line out. |
| `text` | Terms that differ from the Americas'. See [Terms](#terms-and-term). |
| `art` | `covers` and `councilHall`. See [Art](#art). |
| `migrate` | Converts a save from an older `version`. |

## Registering a scenario

1. Write `packages/engine/src/scenarios/<id>.ts` exporting the `Scenario`. Like `americas.ts` and `caribbean.ts`, import only the leaf rule tables (`rules/*`), so any engine module can import the registry.
2. In `scenarios/index.ts`, export it (`export { MYSCENARIO } from './<id>.js';`) and call `registerScenario(MYSCENARIO)` at the bottom, after the others.
3. If it names a new event set, register it in `events/index.ts` (see [Events](#events)).
4. Add any catalogue entries it needs (a new people in `TRIBES`, new council members in `FATHERS`, new nation ids in `NationId` and `NATION_IDS`). Keep the existing entries' order: game codes store a nation as its index in `NATION_IDS`.
5. Record its bench hashes (see [Bench hashes](#bench-hashes)) and add a test file under `packages/engine/test/scenarios/`.

`playableScenarios()` lists the registered scenarios that are not `hidden`, and the New game screen's Scenario select is built from it. `newGameOptions(scenario)` (`setup.ts`) gives the screen everything else: the nation sets, the maximum number of nations, whether a generated map is offered, the stored maps, the map sizes, the first year and head-start years, the charter, and the names of the ways to win. So a new scenario needs no changes to the screen. Australia and Vinland are shown there as disabled choices (`PLANNED_SCENARIOS` in `apps/web/src/ui/newgame.ts`); remove an entry when its scenario is registered.

## The conformance tests

`packages/engine/test/scenarios.test.ts` runs a `conformance: <id>` block for every registered scenario, so a new scenario is checked as soon as it is registered. It checks that:

- every goods, peoples, council, unit, building and terrain id is in the catalogue and appears once, and the stored maps and the event set exist;
- the generator and every stored map use only the scenario's terrains, and every stored map places only the scenario's peoples;
- the nation sets fit `nations.max`, have no repeated or `crown` ids, and every entry has a name, adjective, colour, port and colony names;
- every people's lifeway has a settlement kind, and goods references are closed: the goods natives produce and want, the goods and units that buildings, experts and the AI lists need are all in play, and a people's overrides name only its own people;
- the council has members in its categories;
- the mechanics are consistent: independence needs the REF, boycotts need taxes, a charter has a positive base, the REF needs the King's regulars, artillery and men-of-war, the custom house needs its building;
- the rumour table has odds, and free colonists are in play if a rumour can give them.

Other tests to copy from: `test/scenarios/caribbean.test.ts` (a full computer game with a golden hash, the events in their windows, the new members and bonuses), `test/pace.test.ts`, `test/terms.test.ts`, `test/scenario-maps.test.ts`, `test/mechanics.test.ts`, `test/victory.test.ts`.

## Calendar

`Scenario.calendar` (`scenarios/calendar.ts`) is a list of `eras`. Each era has a first year (`from`), `turnsPerYear` (1, 2 or 4) and, above one, a `seasons` list with one id per turn. An era runs until the next one starts. `end` is the last year and, if the era has seasons, the season after which the game ends. `headStartYears` are the years a head start can jump to.

The Americas play one turn a year from 1492 and spring and autumn from 1600 to autumn 1850 (turn 609). The Caribbean plays spring and autumn from 1650 to autumn 1750 (202 turns).

Every year and turn rule reads the calendar through `calendarOf(s)`: `yearOf`, `formatDate`, `turnOfYear`, `yearValue`, `turnAfterYears`, `firstYear`, `lastTurn`. Do not write your own year arithmetic.

## Terms and `term()`

`Scenario.text` is a partial table of terms. Words such as `homeland` ("Europe"), `colonyLand` ("the New World"), `crown`, `king`, `majesty`, `ref`, `council`, `member`, `loyalist` and `foreignPower`, and whole templates: the arrival message, the eight `rumour.*` outcomes and their history lines, `gameOver.time`, `gameOver.playOn`, `gameOver.won`, `gameOver.lost`, the `landing.*` lines of the title screen and `newGame.tagline`. The keys you leave out are the Americas' (`AMERICAS_TEXT` in `scenarios/terms.ts`, the full list).

Read a term with `term(s, key, vars)`, where `s` is a game or a scenario. Templates use `{name}` placeholders, filled from `vars` first and then from the scenario's own terms, so `{homeland}` follows the scenario. `{Name}` capitalises the first letter. `Term(...)` returns the capitalised term. `withTerms(s, text)` fills a free-standing text.

The Americas' terms are today's exact strings: messages are part of the saved state and the golden hashes, so any string built from a term must stay byte-identical for the Americas. Some text stays in code: the catalogue's own texts (the fathers' effects, unit names such as "King's Regular"), the cheats' notes, and internal ids. Full translation is a separate project.

## Nations

`Scenario.nations`:

- `sets.alternative`: the nations of alternative history, always offered. `sets.real`: the nations that were there, when the scenario has them. `default` says which is chosen first. A set is a list of `NationEntry`, in the order the seats are filled on the New game screen, and in the arena's rotation.
- `max`: the most nations in one game.
- `crown`: the Crown as a player (it owns the REF), a `NationEntry` of its own. Its bonus and colony names are not used.

A `NationEntry` makes a nation wholly the scenario's own: `id` (a `NationId`), `name`, `adjective` and `color`, a `bonus` (`text` and `modifiers`, see [Modifiers](#modifiers-and-hooks)), `colonyNames` and `port` (`PortEntry`: `name` and an optional `market` character with factors for starting `prices`, `depth`, `recovery` and `ships`). A scenario that wants Britain in 1788 defines it; it need not agree with England in the Americas.

Read nations through `nationOf(s, id)`, `nationTitle(s, id)`, `portMarketOf(s, id)` and `nationSet(scenario, rivals)`; the catalogue's `NATIONS` holds only the Americas' values. A nation id beyond the Americas' eight is added to `NationId` and to the end of `NATION_IDS` (the Caribbean added `courland`, `brandenburg`, `scotland` and `malta`).

## Modifiers and hooks

A bonus or a council member's effect is a list of `Modifier`s (`rules/modifiers.ts`), each naming a hook. The engine asks at the hook point instead of checking a nation or a father. Read them with `modifiers(s, nation, hook)` and `hasModifier` (`scenarios/modifiers.ts`): first the nation's bonus, then its council members in the council's order. A lookup never draws a random number, and the lists are cached per player.

The hooks:

| Area | Hooks |
| --- | --- |
| Production | `tileYield`, `manufactureCapacity`, `buildingOutput`, `bellsBonus`, `foodToGrow`, `autoStockade`, `unlockBuilding` |
| Europe | `sailTurns`, `shipMoves`, `priceRecovery`, `crossesStep`, `immigrantsExcluded`, `chooseImmigrant`, `startingDocks` |
| Exploration | `sight`, `rumourOutcome` |
| Natives | `landPrice`, `nativeGifts`, `nativesTeach`, `conversionChance`, `convertsBecome` |
| Combat | `unitOffence`, `offenceVsSettlements`, `armedFromStock`, `alwaysPromote`, `conquestTreasure`, `treasureFee`, `conquestConverts` |
| Diplomacy | `peaceAccepted` |

The helpers `mulOf`, `addOf` and `setOr` combine the numbers a hook returns. A new hook is added to the `Modifier` union and read where the rule runs, with the engine's old constant as its default, so the Americas stay identical.

A council member's catalogue entry (`FATHERS`) carries its `modifiers` and `onJoin` effects. `Council.effects` replaces them per member for a scenario. `onJoin` is a list of the events' `Effect`s (see [Events](#events)), applied once when the member joins.

## Mechanics switches

`Scenario.mechanics` has sixteen switches. A system that is off is skipped where it would run, draws no random numbers, has its commands refused with a reason, is left out of the computer players' plans and is hidden in the web game.

| Switch | Meaning |
| --- | --- |
| `taxes` | The Crown raises the tax rate after sales in the home port. |
| `boycotts` | A refused tax raise boycotts the good. Off: every raise applies. |
| `demands` | The King demands gold. |
| `royalWars` | The King drags the colonies into wars. |
| `ref` | The Crown builds a Royal Expeditionary Force. Independence needs it. |
| `independence` | Nations may declare independence and fight the war. |
| `favoured` | Favoured Nation status. Trade agreements stay either way. |
| `charter` | `false`, or the colony charter's `{ base, cap }`. It applies when the game uses the charter (`GameConfig.colonyCharter`). |
| `customHouse` | The custom house can be built. |
| `missions` | Missions and denouncing. |
| `burialGrounds` | A Lost City Rumour on tribal land may be a desecrated burial ground: the people goes to war with the nation for good. Off: the outcome is never drawn. |
| `surrender` | When a people's capital is burned, its other settlements may submit to the attacker (peace, tribute, free land). Off: they fight on. |
| `alliances` | Alliances between European nations: the rung after Favoured Nation, with a defensive pact, open colonies, shared sight and bells, and joint expeditions. Absent means off. See [Alliances](#alliances). |
| `companies` | Chartered companies from `nations.companies`: nations found them, buy shares and receive dividends. Absent means off. See [Chartered companies](#chartered-companies). |
| `confederation` | Allies may declare independence together and fight one war. Needs `alliances` and `independence`. Absent means off. |
| `peopleTreaties` | The kinds of treaty with native peoples in play (`'people-trade'`, the trade treaty, `'land-use'`, a lease, `'exchange'`, a cultural exchange, and `'defence'`, a mutual defence pact). Absent or empty means none. See [Treaties with peoples](#treaties-with-peoples). |

The numbers of the Crown and the war (REF growth, demands, royal wars, mercenaries, intervention) are still code.

## Victory

`Scenario.victory` is a list of `{ id, params? }`. The kinds are registered in `victory.ts` with `registerVictory({ id, name, check })`; `check(s, moment, params)` returns a game-over result or null. `checkVictory(s, moment)` asks the scenario's kinds in order at two moments, the end of a round (`time`) and the end of a nation's War of Independence (`independence-war`); the first kind that ends the game decides the reason and the winner. The kinds that exist:

- `time`: the game ends after the calendar's last turn; the highest score wins.
- `independence-war`: winning the war ends the game with that winner; losing it ends the game once no person is left to play. With `GameConfig.playOn` the nation is finished instead and the others play on.

- `concord`: at the end of the calendar, an alliance whose members together hold more than `params.share` of the total score (default 0.7, `CONCORD_SHARE`) wins together; its members are the winners, ranked by their own score. List it before `time`.
- `prosperity` (`prosperity.ts`, [design/native-partners.md](design/native-partners.md) N10): at the end of the calendar, every nation that is at peace with each people it has met and has been for the last `params.peaceYears` (30) years, never burned a native settlement, holds treaties with a people (any kind) with at least `params.treatyShare` (0.5, rounded up, at least one) of the peoples it has met that are still on the map, and has at least `params.scoreShare` (0.8) of the best score wins; the winners are ranked by score, and `gameOver.partners` names the peoples they hold treaties with (shown on the game-over screen, "England wins, with the Kalinago and the Arawak"; peoples are never winners). A nation has **met** a people once its standing with it is written (`GameState.peopleRelations`: a trade, a scout's visit, a mission, a brave come to trade) or once it has fought it (at war, a war ended, a settlement burned). The rule keeps two records, written only in a scenario that lists it: `Tribe.warEnded` (the turn each nation's last war with the people ended) and `Tribe.burned` (the nations that burned one of its settlements). List it after `concord` (an alliance that also qualifies wins as an alliance) and before `time`; the defaults are `PROSPERITY`.

`gameOver.winners` lists every winner, best first (several after `concord` or `prosperity`, none when nobody won); `gameOver.winner` is the first of them. A kind may return `winners`; otherwise they are its `winner`.

A kind is a pure function of the state. The Americas use `[independence-war, concord, prosperity, time]`, the Caribbean `[concord, prosperity, time]`. `newGameOptions` shows the names on the New game screen. A new kind (Federation, survival) is registered in `victory.ts`; its texts come from `gameOver.*` terms.

## Computer players

`Scenario.ai`:

- `pace` (absent means 1): how fast the game's arc runs against the Americas' 609 turns. The computer players' turn thresholds (when to explore, arm, start wars, plan independence) and the council's late-offer turn are scaled with `aiTurn(s, turn)`. Durations in turns (cooldowns, patience, war weariness) are not scaled, because a turn is the same half-year in every scenario that has seasons. The Caribbean uses 0.35.
- `islands`: the land is islands, so when no good site is within walking distance the advanced levels send a settler by ship to another island.
- `cooperation`: how readily the computer players cooperate, merged over `COOPERATION` in `alliances.ts`: `proposeAlliance` (0.5) and `acceptAlliance` (0.8), chances per review (every five turns) for the most cooperative level (Creative; the others take a share, Naive never proposes); `proposeLongPeace` (0.001), the chance of proposing to old friends (`alliances.longPeace`) where the usual way is not open; `joinWar` (0.8), how good a target an ally's enemy must be before a computer ally joins the war; `foundCompany` (0.03) and `buyShares` (0.1), for nations with gold to spare, which means `foundMargin` (0.5) of the capital again or `sharesMargin` (1,500 gold) beyond the price, on top of the nation's reserve; `jointExpedition` (0.05); `proposePeopleTrade` (0.5), the chance per review of proposing a trade treaty to a people it may make one with, and `acceptPeopleOffer` (0.9), of accepting a people's own offer (levels take `LEVEL_COOPERATION`'s `people` and `peopleAccept` shares: Creative 1 and 1, Competent 0.8 and 1, Combative 0.5 and 0.7 and only with a people it has traded 300 gold with, Naive 0 and 0.8); `proposeLandUse` (0.5), the chance per review of proposing land use to a trade partner whose land lies beside its colonies, with three years' rent and 300 gold in hand (the `land` share: Creative 1, Competent 0.8, Combative and Naive 0); `proposeExchange` (0.3), the chance, drawn once per nation and trade partner with a settlement within six tiles of its colonies, that the nation seeks a cultural exchange with that people, after which it proposes on each review until the people agrees (the `exchange` share: Creative 1, Competent 0.6, Combative and Naive 0); `proposeDefence` (0.3), likewise drawn once per nation and trade partner, that the nation seeks a mutual defence pact with that people (the `defence` share: Creative 1 and Competent 0.5, with a people that has a settlement within six tiles of their colonies; Combative and Naive 0); `confederation` (0.6), for a nation ready to declare independence: to propose to an ally, or to wait up to 20 turns for one with an independence plan; and `confederationReadiness` (0.65), the share of its usual margin over the Royal Expeditionary Force a Creative nation wants when it declares together with an ally. The Caribbean raises the company rates, lowers the margins (0 and 500), lowers the alliance proposals and raises `proposePeopleTrade` to 0.8 and `proposeDefence` to 0.6. The defaults aim at the targets in [design/cooperation.md](design/cooperation.md), C11 (measured in its section 8): an alliance in about one computer-only game in four, a company in about one in ten, a `concord` victory about once in 30–40 and a confederation about once in 30–50 even with every nation Creative. A scenario that wants more cooperation raises them (and may lower the thresholds in `Scenario.alliances`, or concord's `share`).
- `goods`: four ordered lists, `trade`, `export`, `road` and `farm`. The order decides ties, so keep it deliberate. Name only goods in play.

## The arena and the tournament

The arena (`packages/engine/src/arena.ts`) and `npm run tournament` play a scenario with `--scenario <id>`; nations rotate over the scenario's chosen set (`--rivals real|alternative`). Give `--turns` the length of the calendar (202 for the Caribbean), or the game ends early. `--play-on` lets the other nations finish the calendar after a War of Independence. Where the scenario plays for `prosperity`, each game line names the prosperity winners and the nations that missed it on one condition only, and the summary's "Prosperity:" sentence counts the games won that way and, over all nations at the end, how many failed each condition (`ArenaEntry.prosperityFails`). Record a tournament reference in the design note when you add a scenario, as the Caribbean's is in [design/scenario-framework.md](design/scenario-framework.md), section 7.1.

## Alliances

With `mechanics.alliances` on, two nations that are each other's Favoured Nation can ally once they have had more years of peace and more trade between them (hidden thresholds drawn per pair from the seed, `Scenario.alliances`), and two with a trade agreement after a much longer peace (`longPeace`, "old friends"). An alliance is a treaty (`GameState.treaties`, `treaties.ts`) with two or more members: war on one member is war with all of them, allied units may enter, garrison and trade in each other's colonies, and allies share their sight. Leaving costs more than cancelling Favoured Nation. Two people can ally and leave at any time. The rules and their reasons are in [design/cooperation.md](design/cooperation.md), section 6. With the switch off nothing of it runs, the commands are refused and the web game hides the buttons; with it on, the `concord` victory can end the game with an alliance as the winners.

## Chartered companies

With `mechanics.companies` on, `Scenario.nations.companies` lists the companies nations may found: each a `CompanyEntry`, a `NationEntry` (name, adjective, colour, colony names, port) with `founders`, the nations that may charter it (any nation when none of them takes part), and `from`, the first year. Company ids are `CompanyId`s (`rules/nations.ts`), never in `GameConfig.nations`. A founded company is a player of its own (`Player.kind: 'company'`), played by its own simple computer profile, with no Crown, taxes, Congress or independence, neutral in every war; its score counts for its shareholders by their shares, and it can never win. The Americas offer the Hudson's Bay Company, the West India Company and the Mississippi Company; the Caribbean the Darien Company, the West India Company and the Courland Company (`scenarios/companies.ts`).

## Map settings and settlement kinds

`Scenario.map`:

- `stored`: the stored maps the scenario offers (`maps/index.ts`), each as `{ id, peoples }`. `peoples` lists the regions (`{ tribe, region: [x0, y0, x1, y1], count }`) where the scenario's peoples live on that map. The same map can serve two scenarios with different peoples.
- `generator`: `GeneratorSettings` for a generated map: sizes, noise octaves, how land thins out from a centre, the climate (temperature zones, coldest first, each with elevation bands then moisture bands), forest, high seas, the arrival edge (`entrySide`) and the density of settlements. Absent when the scenario has stored maps only. The Americas' values are `AMERICAS_GENERATOR`; the Caribbean's `CARIBBEAN_GENERATOR` builds islands with finer land noise and a higher threshold. The Caribbean also has a stored map, `maps/caribbean.ts` (100 × 62 tiles, drawn from real coordinates; its projection and bounds are in the file's comment), which is its default; the generated archipelago stays on offer as "Random (generated)". A stored map that only one scenario offers is not listed in the Americas, so their New game screen is unchanged.
- `default`: `'generated'` or a stored map's id. The scenario must have what it names.
- `extras`: the chance per tile of bonus resources, coastal bonus resources and Lost City Rumours, and the terrains without rumours.
- `settlements`: terrains without settlements (`avoid`) and the least `spacing` in tiles.
- `crown`: `'entry'` (the Crown's forces sail in from the map's arrival edge) or a fixed edge.
- `grid`: the shape of the tiles, see [The map grid](#the-map-grid). Optional; squares when absent.

Settlement kinds are rows of `SETTLEMENT_KINDS` (`rules/natives.ts`): `camp`, `village` and `city`, each with its size, braves, respawn time, production rate and cap, incite and land prices, treasure and `landRadius`. A people has a `lifeway` (`nomadic`, `agricultural` or `urban`), and `Scenario.peoples.settlements` gives each lifeway the row it lives in. Every people in play needs its lifeway there. A scenario may write a row of its own.

`landRadius` is how far a settlement's land reaches, in tiles (absent means 1: the eight tiles around it, as in the Americas and the Caribbean). A tile within reach of several settlements is the nearest one's. Only `nativeLandOwner` (`natives.ts`) reads it, so buying and taking land, working it, the colony screen and the computer players all follow it.

## Native rules

`Scenario.peoples.rules` changes the engine's native rules (`NATIVE_RULES` in `rules/natives.ts`); fields you leave out keep the engine's values, and the two tables can be changed field by field. The engine reads them with `nativeRulesOf(s)`. The Americas and the Caribbean use the engine's values.

| Field | What it says (engine value) |
| --- | --- |
| `capitalExtraBraves`, `maxBraves`, `firstBraveAfter` | Braves a capital keeps out beyond its kind's (1), the most braves on the map (80), and the rounds before a new settlement sends out its first (4). |
| `braveEquipment` | Muskets or horses a brave takes from its settlement's stock to arm or mount itself (50). |
| `wanderRadius`, `visitRange`, `wanderTurns` | How far from home a brave wanders (4), the furthest colony it visits or attacks (6), and the rounds it wanders (4). A brave with a target finds its way there (`braveRoute`, within `visitRange` and three tiles more of its settlement, round colonies, European units and other settlements); one with no way gives up and goes home. Braves step as units do (`landStepCost`): a road's cost from road to road, a river's along a river, else the forest's or the terrain's. A brave moving to defend (against an enemy unit near its settlement while its people is at war, or a partner's enemy under a defence pact) moves as if following a river, because the native peoples know the land so well: no step costs it more than a river step. A person is told so once per people, on first meeting it (the first of its settlements seen, or the first of its braves to come to the nation's colonies or units; `Tribe.met`, written only for nations a person plays). |
| `braveChances` | Chances per round that an idle brave sets out: `attackAtWar` 0.3, `attackAngry` 0.1, `demand` 0.06, `gift` 0.03, `trade` 0.06, `wander` 0.35 (attacks and demands times the difficulty's `raidChance`). |
| `tension` | The thresholds the braves and the people act on: `content` 200 (gifts and trade visits below it), `uneasy` 300 (demands), `angry` 600 (attacks), `war` 800. The mood words (`tensionLabel`: content, wary, uneasy, angry, furious) follow them. |
| `demandWait`, `demandMetTension`, `demandRefusedTension` | Rounds a brave waits for a person's answer (2), and the tension change when a demand is met (−60) or refused (+100). |
| `braveKilledTension` | Tension a settlement gains when one of its braves is killed (150; a third at the people's other settlements). |
| `buyPriceFactor`, `buyPricePlenty` | A settlement's price for its goods: the good's starting price times 0.5, more when tense, times 0.8 when it holds plenty. |
| `burialRadius` | How far tribal land reaches for burial grounds (2), with `mechanics.burialGrounds`. The outcome's weight is in the rumour table. |
| `surrenderChance`, `surrenderTribute` | With `mechanics.surrender`: the chance a people submits when its capital burns (0.6), and the share of each settlement's gold it pays (0.5). |
| `denounceChance`, `denounceExpert`, `denounceFailDeath` | Denouncing a rival's mission: the chance (0.4), what a firebrand preacher adds or a rival's one takes away (0.2), and the chance a failed missionary is killed (0.5). |
| `inciteTension`, `inciteTensionOthers` | Tension towards the target of inciting at this settlement (350) and the people's others (150). |

Chartered companies (`Player.kind: 'company'`) stand outside all of this: the peoples feel no tension towards them, their braves never demand from or attack a company, nobody can incite a people against one, and its explorers find no burial grounds.

**Standing with a people** (`GameState.peopleRelations`, `natives.ts`): a record per nation and people, written on the nation's first trade with that people, with the gold traded both ways (`volume`) and the turn the current run of good relations began (`goodSince`: at peace, the people's settlements content on average). With `mechanics.peopleTreaties` it is also written on contact: a scout's visit, a mission or a brave come to trade. Treaties with peoples unlock on it, against hidden thresholds drawn per pair from the seed (`peopleThreshold`), never stored. See [design/native-partners.md](design/native-partners.md).

## Treaties with peoples

With `mechanics.peopleTreaties` naming `'people-trade'`, a nation and a native people can make a **trade treaty** (`peopletreaties.ts`): a treaty in `GameState.treaties` between one nation and one people (`{ kind: 'people', id }`). It unlocks once the nation is in contact with the people (its standing is written), and its years of good relations and the gold traded with the people reach hidden thresholds drawn per pair. A nation proposes it (the `proposePeopleTreaty` command, Foreign Affairs) and the people answers at once: never while one of its settlements is angry with the nation or within `landYears` of land taken from it, otherwise at `accept` times its temperament. A people offers one itself through a brave come to trade at a colony (`offer`): a turn-start notice for a person (a `NativeDemand` of kind `'treaty'`), answered at once by a computer player. Submitted peoples make no treaties with the nation they submitted to.

A treaty in force: the people's settlements pay `sell` times as much for the partner's goods and ask `buy` times as much for theirs, gather `gather` times as much for sale (while the people trades by treaty with anyone), send their braves to trade `braveTrade` times as often, and calm `tensionFall` more a round towards the partner; the partner's trade routes may stop at the people's settlements (one sale and one purchase there, as a wagon train makes). Taking a partner's land, attacking it, or paying it to make war (inciting) **breaks faith**: every treaty with that people ends, each of its settlements gains `breachTension` towards the nation, and the people makes no new treaty for `waitingYears` and treats the nation as hostile (no gifts or trade visits, no offers) for `hostilityYears`. A people ends its treaties itself when one of its settlements turns angry with the partner, or with war.

With `'land-use'` too, a trade partner can lease the people's land: a **land use** treaty (a lease). It needs a trade treaty with the people (the ladder) and more years of good relations, drawn per pair on their own (`landUse.years`). The nation proposes it (`proposePeopleTreaty` with `kind: 'land-use'`, Foreign Affairs' "Lease land", or the colony screen on a tile of native land); the people answers as for a trade treaty. The lease covers the people's land beside the nation's colonies (`nativeLandOwner`, not bought or taken, not leased to another nation), each tile marked with the nation in `Tile.use`; the land stays the people's. The rent per tile a year is set when the lease is made, `landUse.rent` times the tiles' average price (`landPrice`), at least 1 gold, and kept in the treaty's terms (`LandUseTerms`: `rent`, and `due`, the next rent day); the first year is paid at once, to the settlements whose land it is. On each rent day the lease takes in the people's land beside new colonies and lets go of land no colony of the nation is beside, and the nation pays for the tiles; a nation that cannot pay loses the lease (it lapses, ended by the people, no breach). The nation's colonies work leased tiles as their own; the people's settlements still gather `landUse.gather` times as much from them, and a colony with leased land beside it presses `landUse.pressure` times as hard on that people's tension. A leased tile can still be bought at the usual price (it leaves the lease); taking one breaks faith. When a lease ends, its tiles go back and their workers find other work in their colony. Computer nations: Creative and Competent lease from trade partners whose land lies beside their colonies (`ai.cooperation.proposeLandUse`), Combative takes land instead and Naive never proposes.

With `'exchange'`, a trade partner can agree on a **cultural exchange** (N7). It needs a trade treaty with the people (the ladder) and years of good relations drawn per pair on their own (`exchange.years`); the nation proposes it (`kind: 'exchange'`, Foreign Affairs' "Propose exchange") and the people answers as for a trade treaty. While it holds, each of the people's settlements that has taught teaches the partner again `exchange.teachYears` after it last taught (`Settlement.taughtAt`; the skill is drawn from the people's skills, per settlement and teaching, from a seeded stream of its own); its chiefs welcome the partner's scouts again `exchange.speakYears` after their last visit (`Settlement.spokeAt`), with a gift, tales of the land or nothing as on a first visit; and the people gathers `exchange.gather` times as much for sale (while it has an exchange with anyone, on top of the trade treaty's). Missions are unchanged. `taughtAt` and `spokeAt` are written only while the scenario has exchanges. An exchange ends with the trade treaty it stands on, when a settlement turns angry, with war, or by breaking faith. Computer nations: Creative seeks exchanges and Competent at a share; a nation with one sends a free colonist out to learn where a settlement near its colonies teaches again, and its scouts and wandering colonists use the renewed visits.

With `'defence'`, a people and a nation can make a **mutual defence pact** (N7, N9), the top of the ladder: it needs a trade treaty and land use or a cultural exchange with the people, and years of good relations drawn per pair on their own (`defence.years`); a people keeps a pact with one nation at a time. The nation proposes it (`kind: 'defence'`, Foreign Affairs' "Propose defence"); the people answers as for a trade treaty. The pact is defensive only: a European attack on the people (on its braves or settlements) is war with its partner, declared by the attacker (so an ally of the partner that attacks the people leaves its alliance, as for any war on an ally); an attack on the partner's colony within `peoples.rules.visitRange` of one of the people's settlements puts the people at war with the attacker (each of its settlements gains `defence.tension` towards it) and sends those settlements' idle braves against the attacking unit; braves at home also set out, at `defence.defend`, against units of the partner's enemies (nations both are at war with) within `defence.near` tiles of the partner's colonies in their reach, and, once the partner has declared independence, against the King's troops sent against it (without a war of the people's own with the Crown). Nobody can incite the people against its partner, and computer players never attack a people defended by their Favoured Nation or ally, nor raid one defended by a nation they are at peace with. The pact ends with the trade treaty, with the last of land use and the exchange, when a settlement turns angry, with war, or by breaking faith. `Brave.task.defend` names the partner a brave sets out for; it is written only under a pact. Braves moving to defend move as fast as along a river (see the native rules above).

`Scenario.peopleTreaties` changes the engine's numbers, the tables field by field:

| Field | What it says (engine value) |
| --- | --- |
| `trade.years`, `trade.volume` | The hidden thresholds: years of good relations (8 ± 3) and gold traded with the people (100–400), drawn per pair. |
| `trade.sell`, `trade.buy`, `trade.gather`, `trade.braveTrade`, `trade.tensionFall` | The effects: 1.2, 0.8, 1.25, 2 and 2. |
| `landUse.years` | The hidden threshold for land use: years of good relations (12 ± 4), drawn per pair, apart from the trade treaty's. |
| `landUse.rent`, `landUse.gather`, `landUse.pressure` | The yearly rent per tile as a share of its price when the lease is made (0.05), what a settlement still gathers from a leased tile (0.5), and how hard a colony with leased land beside it presses on that people (0.5). |
| `exchange.years` | The hidden threshold for a cultural exchange: years of good relations (12 ± 4), drawn per pair, apart from the other kinds'. |
| `exchange.teachYears`, `exchange.speakYears`, `exchange.gather` | Years after a settlement last taught before it teaches a partner again (25 ± 5, drawn per settlement and teaching), years before a chief welcomes a partner's scouts again (10), and what the people gathers while it has an exchange (1.25). |
| `defence.years` | The hidden threshold for a mutual defence pact: years of good relations (16 ± 4), drawn per pair, apart from the other kinds'. |
| `defence.tension`, `defence.defend`, `defence.near` | Tension each of the people's settlements gains towards a nation whose attack on the partner's colony brings them into the war (300), the chance a brave at home sets out against the partner's enemy near its colony (0.5), and how near the colony that enemy must stand (2 tiles). |
| `accept`, `offer` | The people's chance to accept a proposal it is free to accept (0.8), and to offer a treaty on a brave's trade visit (0.3). |
| `landYears` | Years after land was taken from a people during which it refuses new treaties (20). |
| `breachTension`, `waitingYears`, `hostilityYears` | What breaking faith costs: 200 tension at each settlement, waiting 15 ± 3 years, hostility 25 ± 5. |
| `temperaments` | `open` (accept × 1.2, offer × 1.5, thresholds × 0.75), `guarded` (0.7, 0.5, 1.25) and `proud` (0.5, 0.25, 1); a people without one (`peoples.overrides[id].temperament`) uses neither. |

The Americas and the Caribbean switch on all four kinds. The Caribbean needs no gold traded (`trade.volume` 0–0: its colonies hardly trade at settlements), its peoples offer at 0.5, and, after the French treaty with the Kalinago (1660), a defence pact comes sooner (`defence.years` 10 ± 3) and is sought more readily (`ai.cooperation.proposeDefence` 0.6). Measured in [design/native-partners.md](design/native-partners.md), sections 9–12. The treaties also count towards the `prosperity` victory and, at `score.peopleTreaty` each, the score (see [Victory](#victory)).

## The map grid

`Scenario.map.grid` names the grid the scenario's maps use. `'square'` is the only grid so far, and a scenario that leaves `grid` out plays on squares, so no scenario needs to set it yet. Hexagons are planned as a later option (see "Hex maps as a scenario option" in [ROADMAP.md](ROADMAP.md)).

The grid (`packages/engine/src/grid.ts`) is the one place that knows which tiles are next to which: the directions a unit can move in, the distance between two tiles, the tiles within a distance, and a colony's work area. Engine code asks the game's grid, `gridOf(s)` (or `gridIn(scenario)` while a map is being made), instead of looping over a square of tiles itself (`test/grid.test.ts` checks the square grid against the loops it replaced, orders included). The map stays a rectangle of rows (`y * width + x`) on every grid, so bounds checks and whole-map passes do not go through the grid. Rivers' direction masks, the movement keys and the colony screen's 3 × 3 layout are square-only for now.

## Events

`Scenario.events` names an event set. Sets are registered in `events/index.ts` (`registerEventSet(id, defs)`, or added to the `SETS` table with the others); the Americas' is `events/americas.ts` and the Caribbean's `events/caribbean.ts`. `hasEventSet` is checked by the conformance test. Events are `EventDef`s as described in [design/events.md](design/events.md): historical events with a window of years, random events with weights, targets, effects and choices. A scenario's historical windows use its own calendar's years. Events are off in tournaments unless `--events` is given.

## Bench hashes

`npm run bench -- --scenario <id>` plays the bench games in another scenario: the first four nations of its default set, its default map and calendar, to a middle head-start year. Its hashes are stored in `scripts/bench-hashes.json` under keys that start with `<id>: `, so the Americas' keys stay as they are. Record them with `npm run bench -- --verify --write --scenario <id>`, and check them in later runs with `npm run bench -- --verify --scenario <id>`. The golden test for a scenario's computer game goes in its own test file with a snapshot.

## Art

`Scenario.art` is optional:

- `covers`: the title screen's covers, by id (`apps/web/src/ui/landing.ts`, `COVERS`). Absent or empty: the Americas' covers. The title screen shows the covers and text of the autosaved game's scenario, else those of every playable scenario.
- `councilHall`: the sprite id of the council hall's backdrop (the Americas: `ui/congress-hall`). A style without it falls back to its own hall, then to the procedural one.

New peoples, council members and units need sprite prompts in `docs/SPRITE_PROMPTS.md`; the covers' prompts are in `docs/BOX_ART_PROMPTS.md`. Until the art exists the styles draw their procedural versions. See [STYLE_PLUGINS.md](STYLE_PLUGINS.md).

## Checklist

What the Caribbean needed, in the order it was done. Use it for the next scenario.

1. **Design.** Write the scenario's proposal (calendar, map, nations, peoples, goods, council, events, mechanics, victory) in a design note, and have it agreed before the content is written.
2. **Calendar.** Eras, seasons, end, head-start years.
3. **Catalogue.** Add what is new and shared: peoples (with a lifeway, skills and wants), council members with existing hooks, nation ids. Add the new peoples' and members' prompts to `SPRITE_PROMPTS.md`.
4. **Selections.** Goods, units, buildings, terrains, peoples (north to south), council members. Drop what makes no sense (the Caribbean has no furs).
5. **Nations.** Both sets if there are real rivals; bonuses from existing hooks; ports with a character; colony names that start with the places actually founded.
6. **Map.** Generator settings or stored maps with the scenario's peoples; extras; settlement spacing; the Crown's edge.
7. **Mechanics and victory.** The ten switches, the victory kinds, charter, score and difficulty overrides.
8. **Events.** A set in `events/<id>.ts`, registered, with a test that each historical event fires in its window.
9. **Computer players.** `ai.pace`, `ai.islands` if needed, the four goods lists.
10. **Terms and art.** The terms the scenario changes, its covers and council hall if it has them.
11. **Register** the scenario (`scenarios/index.ts`) and run the conformance tests.
12. **Test.** A full computer game with its golden hash, no goods outside the scenario, every nation founding colonies, and tests for the new bonuses and members.
13. **Measure.** A tournament with `--scenario <id> --turns <the calendar's length> --events`, written up beside the scenario's design.
14. **Bench hashes** for the scenario, and `npm run bench -- --verify` and `npm test` green for the Americas.
15. **Docs.** Update the design note's status, the roadmap and the README's scenario list. Open questions for the maintainer (historical liberties, stretches in the council) go at the end of the design note.
