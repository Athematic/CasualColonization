# Design note: Native nations (Beta 3)

Status: **decided** (11 November 2026): every decision T1–T22 is made. **Steps 1–10 are built** (sections 7–15; step 10's interface plays a people end to end in the web game, with questions for Simon in section 15, answered and built as step 10b in section 16 (the North-east on the New game screen, first towns named by their people, peoples sharing maps and exploring, a people's Trade report, a plan for the peoples' art), with new questions there; after it, the data model was cleaned up (section 17); step 9's computer people profiles and the North-east's tuning are drafted for Simon's review, with an open question on continuity in section 14; step 8's North-east scenario is registered hidden until step 10, and all of its history (peoples, homelands, values, council members, arrivals, events) is drafted for Simon's review; step 7's people score weights and the computer peoples' league rule are drafted for Simon's review; step 2's units, buildings and numbers, step 3's people's council and step 4's prices, effects from the people's side and epidemic numbers and words are drafted for Simon's review). Simon chose "Native nations" as Beta 3. This note proposes the shape. Simon decided T1–T22 in section 4 on 11 November 2026: all as recommended except T16 (option (a), one turn a year), T17 (the Norse wait for the Vinland scenario, Beta 4) and T21 (no save compatibility); T10 and T14 needed more thought and were rewritten from the peoples' own view (section 4, "T10 in full" and "T14 in full"). Simon then decided T10 the same day: growth is births from food, stores and the land's health, standing only as Beta 2's standing record read from the people's side, gold only as what Europeans pay in trade; kin ties and elders passing on knowledge are kept for a separate scenario. T14 stays open (section 6), except the military victory, which Simon decided: if every European nation is defeated, the people or peoples win. Builds on Beta 2, [native-partners.md](native-partners.md) (built), whose people treaty party was made to grow into this ("Simon's direction on N1", section 4 there), on Beta 1, [cooperation.md](cooperation.md) (a non-European player, `kind: 'company'`), and on the 0.9 scenario framework ([scenario-framework.md](scenario-framework.md), [SCENARIOS.md](../SCENARIOS.md)). The care asked for in [australia.md](australia.md) applies to every people, figure and text here. **The history behind it** (the peoples, their ways of life, the council members, the Europeans, the events, terms and regions), with its sources and the items still to be sourced or checked, is in its own file for Simon's review: [research/north-east-peoples.md](../research/north-east-peoples.md). This note keeps the game's decisions and numbers.

## 1. Goal

Today a native people is something the game runs by simple rules for the Europeans to meet: settlements that gather, braves that visit or raid, and since Beta 2 a partner that makes and ends treaties. Beta 3 makes **native peoples a nation type of their own**:
- **Playable**, by a person or by the computer, at the four levels.
- With **their own units, buildings and council members**, and **no Home Port**: no Europe, no Crown, no taxes, no independence.
- **Growth without Europe, as the people would count it:** births from food, stores that carry the people through winter and hard years, and a land kept whole; trade with Europeans and with other peoples (T10).
- **Diplomacy from the people's side:** Beta 2's treaties proposed, kept and broken by the people; wars and peace; treaties between peoples.
- **A new way to play:** start as a native people around the year 1000 and face the Europeans from 1492.

Folded in from the roadmap:
- **Specialised councils per scenario** (Scenarios), built here as a general system: a council per nation type and scenario. Native nations get theirs first; Australia's Legislative Council and Vinland's Thing (Beta 4) reuse it later.
- **Native peoples' knowledge of the land** (Later): the braves' defence movement bonus becomes a trait of the nation type, lost on tilled fields (and on railroads once they exist).
- The framework's **lifeway**: only today's fixed-settlement lifeways in Beta 3; Australia's seasonal lifeway later.

**Non-goals:**
- Hex maps and Vinland (Beta 4). Vinland, with the Norse, is hex-only and is built in Beta 4 (Simon, 11 November 2026). Beta 3's North-east map is drawn so it can move to hexagons and become Vinland's map (T19).
- Australia (after Beta 3). Its peoples need the seasonal lifeway and Country, which this note keeps open but does not build.
- Rebalancing the Americas or the Caribbean. Both stay bit-identical while their peoples are not played (section 4, T21).
- Network play.

## 2. What exists today (Beta 2)

**Players** (`packages/engine/src/types.ts`):
- `Player` has `id: NationId`, an optional `kind?: 'company'` (Beta 1; missing means a nation or the Crown), `human`, `ai`, and a set of fields that only make sense for a European nation: `market` (the home port's prices), `tax`, `crosses`, `crossesRequired`, `recruitPool` (immigration), `entry` (where ships from Europe arrive), `bells`, `fathers`, `fatherOffer`, `currentFather`, `fatherBells` (the Continental Congress), `boycotts`, `pendingTax`, `independence`, `ref` and `royal` (the Royal Expeditionary Force and the Crown's bookkeeping), `pendingDemand`, `refAtDeclaration`.
- `game.ts` `newPlayer` gives every player all of these (1,000 gold, a market from `portMarketOf`, 30 crosses); `startingUnits` gives every nation a caravel with a veteran soldier and a hardy pioneer (the `startingDocks` modifier adds units in Europe).
- `NationId` (`rules/nations.ts`) is a closed union: the Americas' eight, the Caribbean's four lesser powers, `crown` and the five `CompanyId`s. `TribeId` is a separate closed union of nine peoples. `Unit.owner`, `Colony.owner`, `Tile.claim`, `Tile.use`, `Tribe.stance`, `Settlement.tension` and `GameMessage.to` are all typed `NationId`.
- **Companies are the precedent** for a non-European player (`companies.ts`): `isCompany(p)`, `isCompanyId(s, id)`, `isNation(p)` (neither the Crown nor a company), the computer profile `COMPANY_PROFILE` (`ai/profiles.ts`, chosen in `ai/index.ts` `runAi`). What a company skips is checked where each system runs: taxes (`europe.ts`), the Crown (`crown.ts`), independence (`independence.ts` `canDeclareIndependence`), the Congress (`fathers.ts`), alliances (`alliances.ts`), war (`combat.ts`, `diplomacy.ts`), events (`events/index.ts`), score (`score.ts`), natives (`natives.ts`, `braves.ts`, `rumours.ts`, `peopletreaties.ts` with `isCompanyIdent`). About 30 such checks in 20 files, with no single "which systems apply to this player" helper.

**What is keyed on Europe:**
- Home port and market: `europe.ts` (`SAIL_TURNS`, buying, selling, training, recruiting), unit locations `{ kind: 'europe' }` and `{ kind: 'sailing', to: 'europe' | 'america' }`, `NationEntry.port`.
- Immigration: `europe.ts` `processImmigration` (crosses against `crossesRequired`, the recruit pool, `IMMIGRANT_WEIGHTS` in `rules/units.ts`).
- The Crown: `crown.ts` (tax raises, demands, royal wars, the REF's growth), `mechanics.taxes`, `boycotts`, `demands`, `royalWars`, `ref`.
- Independence: `independence.ts`, `rebellion.ts`, `confederation.ts`, `mechanics.independence`, the `independence-war` victory.
- The council: `fathers.ts` (`offerFathers`, `joinCongress`), `rules/fathers.ts` (`FatherId` and `FatherCategory` are closed unions; five categories), one council per scenario (`Scenario.council`: `categories`, `members`, `effects`). Liberty bells pay for members. Pocahontas is a member of the European council.
- The charter (`mechanics.charter`), the custom house, Favoured Nation (home-port access).

**Growth that does not need Europe already exists:** a colony grows when its food reaches `foodToGrow` (`production.ts`, 200, a modifier hook; `colony.ts`). Native converts (`nativeConvert`, the only native unit type in `rules/units.ts`) join colonies.

**Peoples** (section 2 of [native-partners.md](native-partners.md) has the full list):
- `Tribe` (`GameState.tribes`): `stance` per nation, `burial`, `submitted`, `warEnded`, `burned`, `met`. No stance between peoples.
- `Settlement` (`GameState.settlements`): `tension` per nation, `skill`, `taughtAt`, `spokeAt`, `visited`, `mission`, `gold`, `goods`, `defenders`, `braveTimer`. Settlements gather a share of their land's yield (`SettlementKindDef.produceRate`, `produceCap`); they never grow, move or found new ones (N14).
- `Brave` (`GameState.braves`): belongs to a settlement, not a player; tasks `wander`, `visit`, `wait`, `attack` (`braves.ts`). Braves are not `Unit`s.
- `PeopleDef` (`rules/nations.ts`): name, colour, `lifeway`, skills, wants, `temperament`. **The lifeway in code is `nomadic`, `agricultural` or `urban`** (scenario-framework step 6), not the sketch's `settled` or `seasonal` (3.6); each picks a row of the settlement-kind table (`SettlementKindDef` in `rules/natives.ts`: camp, village, city). A seasonal lifeway would be a fourth id with its own behaviour.
- Land: `natives.ts` `nativeLandOwner` (a settlement kind's `landRadius`, default 1).
- `processNatives` runs once a round, after the players (`turn.ts`).
- Beta 2: `TreatyParty` is `{ kind: 'nation' } | { kind: 'people'; id: TribeId }`, read through helpers in `treaties.ts` (`partyIsPeople`, `peopleParty`, `treatyNations`, `treatyPeoples`); `GameState.peopleRelations`; the four people kinds (`people-trade`, `land-use`, `exchange`, `defence`) in `peopletreaties.ts`; the `prosperity` victory (`prosperity.ts`) with `gameOver.partners: TribeId[]`.
- **Knowledge of the land:** `braves.ts` `braveStepCost` caps a defending brave's step at `RIVER_MOVE_COST` (`braveDefending`: a brave set against a unit); everything else steps by `movement.ts` `landStepCost`. `Tile.p` marks plowed land, `Tile.r` a road; there are no railroads.

**Calendar** (`scenarios/calendar.ts`): eras of 1, 2 or 4 turns a year (`Era.turnsPerYear: 1 | 2 | 4`), with named seasons. **No era can have a turn longer than a year**, so 1000–1492 would be 492 turns.

**Catalogues and selections** (`scenarios/types.ts`): `Scenario.units`, `buildings`, `goods`, `council` and `nations.sets` select from global catalogues (`UNIT_TYPES`, `BUILDINGS`, `FATHERS`, `NATIONS`) one list per scenario. Nothing is per nation type. Units arrive through Europe (`TRAINABLE`, `PURCHASABLE`), immigration or colony builds (`COLONY_BUILDS`).

**Score** (`score.ts`, `rules/score.ts` `SCORE_WEIGHTS`): colonists, experts, buildings, production, rebels and liberty, Founding Fathers, wealth, treaties. Several lines assume a European nation.

**Maps:** the stored North America map (`maps/north-america.ts`) and the generated maps; no map of the North-east at the scale its peoples need. The New game screen lists "Vinland, around 1000" as a disabled planned scenario (`apps/web/src/ui/newgame.ts` `PLANNED_SCENARIOS`).

## 3. Proposal in brief

1. **A people can be a player:** `Player.kind: 'people'`, with the people's own `TribeId` as its id (one id everywhere, as Beta 2 promised). A `PlayerId` type covers nations and peoples. One helper, `playerKind(p)` (`nation`, `company`, `people`, `crown`), and a table of which systems apply to each kind replace the scattered company checks.
2. **Chosen at setup.** The New game screen lets a person play a people. The scenario says which peoples are players (by a person or the computer) and which stay as today's settlements under Beta 2's rules.
3. **A playing people's towns are colonies** (`Colony.owner` its id), drawn and named as the people's towns, with its own buildings and jobs. Europeans deal with a playing people as with a nation: proposals it answers, not settlement commands.
4. **Catalogues per nation type:** the scenario's `units`, `buildings` and `council` gain a selection per nation type (`european`, `people`). New catalogue entries for the people's units and buildings, grounded in the history of the region and written with care.
5. **No Europe:** markets, immigration, taxes, the Crown, the REF, independence and the charter are off for the `people` kind. **Growth is the people thriving, not a treasury** (T10, decided): births from food, with food put by in stores against winter and hard years, and the health of the land, which over-harvesting wears down. Standing is Beta 2's standing record read from the people's side, not a new system. Gold is only what Europeans pay in trade. Kin ties and elders passing on knowledge are kept for a separate scenario.
6. **A general council system:** `Scenario.councils` keyed by id, each with its categories, members, product (the bells' counterpart, named by a term) and portraits; each nation type (later each nation entry) names its council. The Continental Congress becomes one council among others, unchanged.
7. **Diplomacy both ways:** a playing people proposes, keeps and breaks Beta 2's treaties with nations; peoples make trade and defence treaties with each other; war and peace between any players.
8. **Knowledge of the land** is a trait of the nation type: its units move at river cost on its own unplowed land, and lose it on plowed tiles (and later railroads).
9. **A people wins its own way** (T14, decided): by **continuity** (still on its homeland, as many as at the start, under its own council, keeping its ways), by a **confederacy** of peoples (the native counterpart to concord) or by **a good life** (fed, at peace, its name and relationships honoured); each a victory kind with scenario params. **Decided:** if every European nation is defeated, the people or peoples win (`military`), only theoretically possible in computer-only games. Score lines follow the same values, not gold and buildings. Europeans' and peoples' wins can stand in one game.
10. **Computer peoples per level,** with a people profile per level and targets as scenario-overridable defaults (`Scenario.ai.peoples`), measured by tournaments.
11. **The scenario "The North-east, 1000–1850"** (working title) on a new stored map of the North-east, on squares: one turn a year, head starts for a shorter game, and the Europeans arriving from 1492 one by one. Beta 4 turns the same map into hexes for Vinland (T19).

## 4. Decisions (with recommendations)

**(structural)** marks decisions that shape the saved state or the engine's data model; changing them later means a large rewrite. T1, T2, T6, T8, T14 and T16 are the expensive ones.

Simon decided on 11 November 2026. Rows marked **Decided** are agreed as recommended; the rows of T16, T17 and T21 record his own decision. T10 and T14 first needed more thought (Simon): their first proposal treated a people as a European colony with relabelled parts (gold as the measure of prosperity, land and towns as the win). Both are rewritten below the table from the peoples' own view of growth and of a win. Simon then **decided T10** in a narrower core (stores and land health; standing as reuse; kin ties and elders deferred). Then he **decided T14** as option (a), with the military victory (no guard rule; independence a win, with a choice to play on when at war with a people; epidemics both ways), and confirmed T19.

| # | Question | Options | Recommendation and decision |
| --- | --- | --- | --- |
| T1 **(structural)** | **How is a people a player?** | (a) `Player.kind: 'people'` with `id: TribeId`; a `PlayerId = NationId \| TribeId` type for owners. (b) A separate `PeoplePlayer` record beside `Player`. (c) New nation ids for played peoples (`iroquoisNation`). | **Decided.** **(a).** It keeps Beta 2's promise of one id per people, reuses everything that works for players (units, colonies, turns, AI), as the company did. `Unit.owner`, `Colony.owner`, `Tile.claim`, `Tile.use`, `GameMessage.to` and the stance and tension maps widen to `PlayerId`; the ids stay strings. Add `playerKind(p)` and one table of systems per kind (`systemsOf(p)`: market, immigration, crown, independence, council id, treaties), and move the 30 company checks onto it first (bit-identical). |
| T2 **(structural)** | **What are a playing people's towns?** | (a) `Colony` records owned by the people, with its own buildings and jobs. (b) `Settlement` records the player controls. (c) Both: a colony for the player, a settlement shadow for European rules. | **Decided.** **(a).** Production, jobs, buildings, growth, defence and the colony screen exist for colonies; settlements only gather. A town is a colony with `look: 'people'` for the renderers and the people's names. Europeans meet it as a player: trade by treaty or at its town like a foreign colony (Beta 1's trade agreements allow routes there), teaching by an exchange it agrees to, land by a lease or sale it agrees to. No tension, no missions, no inciting against a playing people: those are rules for peoples nobody plays. |
| T3 | **How does a people move from tribe to player, and back?** | (a) At setup only. (b) Also during the game (a people "rises" when its standing or towns reach a mark). (c) A player people can fall back to simple rules (a person leaves). | **Decided.** **(a) in Beta 3.** At creation a played people's settlements become its towns and its braves its first units; its `Tribe` record stays (the treaty party, `met`, `burned`). A people that loses every town is out, like a nation. (b) is a fine later idea but doubles the testing; (c) only as today's "computer takes over" (the level plays it). |
| T4 | **Which peoples are players (mixing)?** | (a) All peoples of the scenario. (b) The scenario names playable peoples; setup chooses which play (person or computer); the rest stay settlements under Beta 2's rules. (c) Only the person's people. | **Decided.** **(b).** Simple-rules peoples keep the map full and cheap; a few played peoples give the computer rivals worth meeting. The North-east game's default: the person's people plus one or two computer peoples, the others as settlements. The Americas and the Caribbean list no playable peoples in Beta 3, so they do not change. |
| T5 | **A people's land.** | (a) As today: within `landRadius` of its towns. (b) Its towns' work areas plus claimed tiles (`Tile.claim` by the people). (c) Country per tile from the map. | **Decided.** **(b).** A people claims land as a nation does, with `landRadius` as its start; leases and sales go through Beta 2's land-use treaty from the seller's side. (c) stays open for Australia, through `nativeLandOwner`. |
| T6 **(structural)** | **Units for native nations.** Catalogue per nation type, and which units. | (a) A per-type selection of the shared catalogue (`units: { european, people }`). (b) A separate catalogue. Examples to agree. | **Decided.** **(a),** global ids as today. Proposed for the North-east, all to be checked against sources: **hunter** (food and furs), **fisher**, **gardener** (maize, beans and squash where the climate allows: the St Lawrence valley and south, not Newfoundland), **crafter** (tools, clothing, canoes), **runner/scout**, **warrior** (bow; muskets and horses by trade, as braves arm today), **canoe** (birchbark; the sea-going canoes of the Beothuk's ancestors), **elder** (teaches, as a school's teacher). Experts are learned at home (by elders) or by exchange, not bought. No units built from sacred roles. |
| T7 | **Buildings.** | Same shape as units. | **Decided.** **A per-type selection** of the catalogue. Practical, documented buildings: **longhouse** (housing; growth), **drying racks and smokehouse** (food stores), **storage pits** (winter stores; common archaeologically in the region), **workshop** (tools, clothing), **canoe landing** (the people's docks), **palisade** (stockade, as Haudenosaunee and St Lawrence Iroquoian towns had), **council house** (the council's product). No ceremonial or sacred places as production buildings. |
| T8 **(structural)** | **The council system.** | (a) One council per scenario (today). (b) `Scenario.councils` keyed by id; each nation type names its council; later each nation entry may. (c) Councils per people. | **Decided.** **(b).** A council has `name`, `categories` (open strings, not today's closed five), `members`, `effects`, a product term (the bells' counterpart, for example "counsel"), its hall art and cost rule. `Player.fathers` stays the field (renamed only in text), `FatherId` and `FatherCategory` open up to catalogue strings. The Continental Congress is `councils.congress`, unchanged. Australia's Legislative Council and Vinland's Thing are further councils later. |
| T9 | **Council members for native nations: who, and how shown?** | (a) Named historical individuals. (b) Roles and collective figures (the Clan Mothers, the Elders, the Runners, the Canoe-makers). (c) Both, with rules. | **Decided.** **(c), mostly (b).** Named people only where well documented, appropriate and not sacred to a living tradition (for the North-east from 1600, for example Membertou, Mi'kmaw sachem, d. 1611; for later the Americas, Thayendanegea, Tecumseh, Sequoyah), each catalogue entry with a `source` line. Founding and spiritual figures of living nations (the Peacemaker, Hiawatha) are left out unless the nations' own published accounts support it. Where no likeness exists, the portrait is a figure in period dress seen from a distance or a silhouette, never an invented face presented as real; the prompt says so (SPRITE_PROMPTS gets a section with these rules). Pocahontas stays in the European council for now. |
| T10 | **Economy and growth without Europe.** | Growth: births; stores and hard years; land health; standing; kin ties; elders and knowledge. Money: gold as today; gold only from European trade; barter. | **Decided** (Simon, after the rewrite below). **Births from food, stores and land health** in the core; **standing only as Beta 2's standing record read from the people's side** (reuse, not a new system); **gold only as what Europeans pay in trade**. Kin ties and elders passing on knowledge are deferred to a separate scenario. Details in "T10 in full" below. Goods: food, furs, hides, fish, maize, tools, clothing, canoes; trade goods (iron tools, cloth, kettles) only from Europeans. |
| T11 | **Diplomacy.** | Treaties from the people's side; treaties between peoples; alliances with Europeans. | **Decided.** **All four Beta 2 kinds both ways** (a playing people proposes, accepts, breaks; breaking faith costs it standing with that nation, mirrored). **Between peoples: trade and defence** (the same kinds with two people parties; the party helpers allow it). War and peace between any two players. **No European `alliance` or `concord` with peoples in Beta 3:** defence is the pact; widening alliances is a later note. |
| T12 | **What do Europe-only systems mean for a people? Is there an equivalent pressure?** | (a) None: the Europeans are the pressure. (b) A "pressure" record per people (settlers on its land). (c) Epidemics after contact as events. | **Decided.** **(a) plus (c) behind a switch.** The arriving Europeans, their land hunger and their wars are the pressure, with no new system. Epidemics were the largest fact of contact; leaving them out rewrites history, putting them in is grim. Propose a small event set after contact (fewer births for some years, a town or colony loses people), written soberly, switch `mechanics.epidemics`, on in the North-east game. **Epidemics go both ways when active** (Simon, 11 November 2026): they strike European colonies as well as peoples' towns, by the same rules. |
| T13 | **Knowledge of the land as a trait.** | (a) As today: defending braves only. (b) All units of a people on its own land move at river cost. (c) (b), lost on plowed tiles and railroads. | **Decided.** **(c), for defence and travel on the people's own land and on unclaimed land; lost on plowed tiles (`Tile.p`) and, once they exist, railroads.** A road keeps its own cost (already as cheap). It becomes a modifier hook on the nation type (`knowsLand`), so braves of unplayed peoples keep today's rule unchanged. |
| T14 **(structural)** | **Victory for a native nation.** | (a) Continuity, confederacy and a good life, each a victory kind with scenario params, plus the military victory; people score lines; Europeans and peoples judged side by side. (b) Continuity and the military victory only. (c) The first proposal: `sovereignty`, `prosperity` from the people's side, score. | **Decided** (Simon, 11 November 2026): **(a)**, with the military victory and its details as in "T14 in full": if every European nation is defeated (no colony and no land unit on the map, checked after the last arrival), every playing people still in the game wins together; in computer-only games 1 in 100 or fewer. `gameOver.winners` widens to `PlayerId[]`. Details in "T14 in full" below. |
| T15 | **Computer native nations per level, and targets.** | A profile per level; targets. | **Decided.** **A people profile per level** (`ai/profiles.ts`, as `COMPANY_PROFILE`): Creative trades and makes treaties, Competent balances, Combative defends hard and raids rivals, Naive grows. **Targets (engine defaults, `Scenario.ai.peoples` overrides):** in four-level North-east games, each computer people survives to 1850 in at least 3 games of 4; a people wins by one of T14's peaceful paths in about 1 game of 5 (to revisit once T14 is decided); a people wins by the military victory in 1 game of 100 or fewer (T14, decided); each computer people holds a treaty with a European nation in most games. Measured with `npm run tournament`. |
| T16 **(structural)** | **The calendar before contact.** | (a) One turn a year from 1000 (850 turns to 1850). (b) Turns of several years before 1492 (`Era.yearsPerTurn`). (c) Two games: 1000–1030 and 1492–1850, no years between. | **Decided: (a)** (Simon). One turn a year from 1000 to 1850, about 850 turns; a person who wants a shorter game takes a head start (`calendar.headStartYears`, proposed 1250, 1490, 1600 and 1700). The calendar already does this: no multi-year turns and no `Era.yearsPerTurn`. Growth and gathering rates need no scaling, since every turn is one year, as in the Americas. A head start to 1490 runs about 490 turns of computer play, so the Mac speed gate should cover it. (b) and (c) are dropped. |
| T17 | **The Norse episode.** | The Norse as a computer nation; as a playable nation; as events only. | **Decided: not now** (Simon: "keep that powder dry for the Vinland scenario"). The Norse are not in Beta 3's 1000–1850 game. The Norse episode belongs to the Vinland scenario, which is hex-only (Beta 4 outline), so Vinland, with the Norse, is built in Beta 4 on hexes. The proposal is kept for it: a nation entry `norse` with Greenland as homeland (long, risky route; few colonists), leaving by a seeded year unless thriving (`NationEntry.departs`), its council the Thing (saga figures, scenarios.md). The Norse word for the peoples they met appears only in Norse speech, never as the peoples' name. |
| T18 | **The 1492 arrival.** | All Europeans at once; staggered by year. | **Decided.** **Staggered:** `NationEntry.arrives` (year): for example England 1497 (Cabot), Portugal 1500 (Corte-Real), France 1534 (Cartier), Spain and the Basque whalers in the 1530s–40s, the Netherlands 1610s. A nation not yet arrived takes no turns and is unknown on the map. |
| T19 | **The map.** | Reuse the North America map; a new stored map of the North-east; generated. | **Decided.** **A new stored map** of Newfoundland, Labrador, the Gulf and valley of the St Lawrence, the Maritimes and the eastern Great Lakes, with people regions drawn from documented sources. **Consequence of T17, confirmed by Simon (11 November 2026):** Beta 3's 1000–1850 game is played on this map **on squares**, not on the North America map; Beta 4 turns the same map into hexes for Vinland (its step 4, with a review pass). The peoples (T20) are researched for this region, and the North America map is too coarse for peoples as nations. |
| T20 | **Which peoples, and lifeway.** | Today's catalogue; new peoples. | **Decided.** **New catalogue peoples, researched first:** for around 1000, the ancestors of the Beothuk (archaeologists' "Little Passage" culture), the Dorset (an archaeologists' name; Inuit tradition remembers the Tuniit), the ancestors of the Innu and the Mi'kmaq; the Thule (ancestors of the Inuit) reaching Labrador later; the St Lawrence Iroquoians (met by Cartier, gone by 1600) and the Haudenosaunee. Names as the peoples use them today where that is clear, archaeological names marked as such. **Lifeways: today's fixed-settlement ones** (`nomadic`, `agricultural`); the seasonal round some of these peoples lived is the Australia work's `seasonal` lifeway, later. |
| T21 | **Save compatibility.** | | **Decided: no save compatibility** (Simon: we are still in beta, and no one expects saves to be compatible). Nothing is built only for loading old saves: no `migrate` steps, no promise about the save's shape. **As a testing aid, the Americas and the Caribbean stay bit-identical** (golden and bench hashes) while no people is played, through every step: the id widening is types only, the systems table reproduces each company check, and new fields are optional and written only by a people player, so the hashes keep catching mistakes. |
| T22 | **Interface and art.** | | **Decided.** **Interface:** the New game screen offers "Play a native people" per scenario; no Europe screen for a people; the colony screen serves towns with the people's buildings; the council screen reads the council; Foreign Affairs shows nations and peoples from the people's side. **Art:** schematic and procedural first (towns, units by silhouette, council members as procedural figures); start the local sprite trial on the Mac in parallel, with prompts reviewed for care before any image is made. |

### T10 in full: growth from the people's side (decided)

**Simon's concern.** The first proposal treated a people like a European colony with relabelled parts: gold as the measure of prosperity, kin joining as immigration in other words. This section starts from what growth meant to the peoples: a people does well when it is fed through winter and the hard years, at peace, and living from a land that stays whole. Gold is only what Europeans pay.

**Simon's decision (11 November 2026).** The core game has births from food, **stores** and **land health**. **Standing** stays only in a light form: Beta 2's existing standing record, read from the people's side; it is reuse, not a new system. **Gold** is only what Europeans pay in trade. **Kin ties** and **elders passing on knowledge** are deferred to a separate scenario (below).

**Many nations, many ways.** The peoples of the North-east were many nations with different ways (farming towns beside hunting and fishing peoples; [research, section 1](../research/north-east-peoples.md#1-the-peoples)). So every number here (what a people grows and stores, how hard it hunts, which ways of winning it values) is data per people and per scenario (`peoples.overrides[id]`), not one outlook for all.

**No sacred practices as mechanics.** Gifts, hosting and kept promises may count where Beta 2 already counts them; the ceremonies that went with them (condolence, wampum at councils) are not modelled, named as actions or shown as buttons.

**Births from food.** As today: a town grows when its food above its reserve (below) reaches `foodToGrow` (`colony.ts`, `production.ts`). A town fought over this year has no birth: more people because fed and at peace.

**Stores** (decided). Food and goods put by for winter and hard years: security, not profit, as storage pits and smokehouses were in many towns of the region (T7; [research, section 2](../research/north-east-peoples.md#2-ways-of-life-work-buildings-and-the-land)).
- **State:** nothing new. A town's food and goods (`Colony.goods`). A town's **reserve** is `storeYears` (default 1) years of its people's food need. Food below the reserve is the store; only food above it counts towards a birth. Storage pits, drying racks and smokehouses (T7) raise how much a town can keep, as a warehouse does.
- **Hard years:** a seeded draw per region and year (`hardYears.chance`, default 1 in 8; switch `mechanics.hardYears`, on in the North-east game, off in the Americas and the Caribbean) halves food yields there. A town eats from its store. A town whose store runs out goes hungry: no birth that year, and after a second hungry year in a row it loses a person.
- **Spent on:** eating through hard years; trade with Europeans and other peoples; Beta 2's gifts (below).
- **Computer players:** every people profile fills the reserve before it trades food away; Combative keeps a smaller one (`storeYears` 0.5) and raids more; Naive sells food to Europeans when the price is high and runs short more often.
- **Engine:** reuses `goods`, `foodToGrow` and storage capacity; hard years are a small event kind on the existing events system (`events/`), drawn per region from the seed. European colonies in a region feel hard years too, which is fair and cheap.

**Land health** (decided). Harvesting draws on the land; over-harvesting wears it down, as the fur trade's demand for beaver did to whole regions in the 17th century (the history and its sources: [research, section 2](../research/north-east-peoples.md#2-ways-of-life-work-buildings-and-the-land)).
- **State:** one number per region, 0–100, starting at 100 (`GameState.land?: Record<RegionId, number>`, absent unless the switch `mechanics.landHealth` is on; off in the Americas and the Caribbean, so they stay bit-identical).
- **Drawn down:** each year, furs and game taken in a region (by anyone: a people's hunters and Europeans' trappers alike) beyond its `renewal` (per region, scenario data) lower its health by the excess; while under the renewal, health recovers by `recovery` (default 5) a year.
- **Effect:** fur and game yields in the region are multiplied by its health (floor 0.2). Fish and gardens are not touched in Beta 3; tired garden soils, and towns moving every decade or two as soils and firewood ran out, are a later idea.
- **A real choice:** the people's player sees the health of each region (in words and on a map overlay) beside the price Europeans pay for furs. More hunters now means fewer furs and less game later. **European fur demand is the pressure:** high fur prices at European towns and ships, and Europeans' own trappers in the region.
- **Computer players:** Creative and Competent hold hunters within the renewal once a region's health falls under 70; Combative under 40; Naive follows the price. Computer Europeans are unchanged: they are the pressure.
- **Where it counts:** in score and in T14's continuity and good life.
- **Proposed detail, tunable:** regions are the stored map's people regions (T19); on maps without them, a coarse grid (for example blocks of 8 by 8 tiles). Options considered: (a) per tile (fine but heavy state); (b) per town's land (cheap, but beaver were lost across whole regions, Europeans' land included); (c) per region (proposed). A simpler variant, kept as a fallback, is a yearly fur quota per region with no stored health (furs beyond it are lost).

**Standing** (decided: reuse only). No new resource or currency. Beta 2's per-pair record (`peopleRelations`: `goodSince` for years of good relations, `volume` for trade, `breaks`, `waitUntil`, `hostileUntil`, `tookLand`) is read from the people's side, with its keys widened to `PlayerId` (T1), so a playing people's relation to a nation is the same record. Keeping treaties, trading and years of peace already raise it; breaking faith, taking land and wars already lower it; its words (`peopleStanding`) are shown as in Beta 2. A playing people's treaties unlock from it as Beta 2's do; between two peoples the same record holds, with goods traded counted at their value in gold for `volume`. Gifts stay as Beta 2 has them (`giftTribe`, lowering tension). Context, gifts and alliances among North-eastern peoples: [research, section 3](../research/north-east-peoples.md#3-standing-kin-and-leagues).

**Gold** (decided). Only what Europeans pay in trade. `Player.gold` (starting at 0 for a people) is earned only by selling to Europeans and spent only on buying from them (iron tools, kettles, cloth, muskets). No hurrying builds (`hurryBuild` off by kind), no buying units, no market (T1's systems table), and gold is not in a people's score. Options considered: barter only (simplest model, harder screens); gold as "wealth" (the first proposal, dropped).

**What it reuses and replaces.** Reuses colony food and goods, `foodToGrow`, storage capacity, the events system, `peopleRelations` and `peopleStanding`, `giftTribe`, `Player.gold`. Replaces, for the `people` kind: the market, hurrying, and immigration (`processImmigration` does not run; a people grows by births only). The council's product (T8) pays council members only.

**Deferred to a separate scenario** (Simon, 11 November 2026). Kept here so the ideas are not lost: candidates for the "Before the year 1000" scenario (roadmap, Scenarios) or a later expansion, not Beta 3 mechanics.
- **Kin ties:** marriage and adoption between peoples as relationships (never captives), a record per pair, bringing people (kin joining as the counterpart of immigration, through `crosses` and `crossesRequired`) and allies who answer more surely; the families of a lost town going to kin. Historical ground (peoples joining others, marriages in the fur trade): [research, section 3](../research/north-east-peoples.md#3-standing-kin-and-leagues). Ties with European nations would come later still.
- **Elders passing on knowledge:** elders named by long service, teaching the people's skills, as a measure of growth and a score line. The elder unit of T6 stays a teacher, as a school's teacher is; only this measure of growth is deferred.
- **A fuller standing:** a standing number per pair, earned by gifts and hosting, lost by hoarding while neighbours go hungry.

### T14 in full: winning from the people's side (decided)

**Simon's concern.** The first proposal's `sovereignty` was a European win relabelled: land and towns held, with a score near the best. Here a people wins as a people would count it: it is still here, on its own land, under its own council; or it has joined others in a lasting league; or its people live well and keep faith. Each path is a victory kind with `params` as scenario data; a scenario lists the kinds it plays, and `peoples.overrides[id]` may give one people its own params (one people may hold to its homeland, another to its league). Several playing peoples may win in one game. And, decided: if every European nation is defeated, the people or peoples win.

**Continuity** (`continuity`). At the end year, a playing people wins if all of these hold:
- **On its homeland:** at least one town on its starting homeland (the land it held when the game began, head start included), and at least `homelandShare` (default 0.5) of that land kept: claimed by the people or by no one. Land leased by treaty counts as kept (it stays theirs, Beta 2's land use); land sold or taken does not. Where land health is on, the homeland's regions average at least `landHealth` (default 40).
- **As many people as at the start:** its people (units and town folk) at least `peopleShare` (default 1.0) of the number when the game began. With epidemics on (T12) this is hard, though epidemics strike European colonies too; a scenario may lower it, and tournaments set it.
- **Governed by its own council, keeping its ways:** measured by its council. Not submitted to any nation (`Tribe.submitted`), no town of its own held by another player, and its council has at least `members` (default 1) member. Taking up iron tools, kettles, muskets or horses does not count against it: peoples took what served them, and that is continuity too.

No score condition.

**Confederacy** (`confederacy`). The native counterpart to concord: peoples of the North-east joined in lasting leagues, the Haudenosaunee Confederacy and the Wabanaki Confederacy among them (the history and its sources: [research, section 3](../research/north-east-peoples.md#3-standing-kin-and-leagues)). The founding accounts are the nations' own and are not used (T9).
- **A new treaty kind `league`** between three or more peoples (playing or simple-rules), with several parties as Beta 1's `alliance`: open to peoples at peace with every member, holding a defence pact with at least one, and in good standing (Beta 2's record) with all. Further peoples may join later, as the Tuscarora did. This adds one kind to T11's treaties between peoples.
- **Win at the end year:** a league of at least `members` (default 3) peoples, in force for `years` (default 50), with no war between members while it held, whose members together keep at least `homelandShare` (default 0.5) of their starting homelands. Its playing members win together, ranked by score; its simple-rules members are named as partners (`gameOver.partners`, as for prosperity).
- **Computer players:** Creative seeks a league once it holds pacts; Competent joins one it is offered; Combative and Naive do not lead one. Simple-rules peoples answer by Beta 2's rules (standing, temperament).

**A good life** (`good-life`). Close to Beta 2's prosperity, from the people's side, measured by stores, land health, peace and the standing record, not by score. At the end year:
- **Well fed:** every town holds its reserve (`storeYears`, default 1), and no town went hungry in the last `hungerYears` (default 20).
- **The land kept whole:** where land health is on, its regions average at least `landHealth` (default 60).
- **At peace:** no war with any player or people it has met in the last `peaceYears` (default 30), as prosperity.
- **Faith kept:** no breach of faith on Beta 2's record in the last `faithYears` (default 30), and a treaty with at least `treatyShare` (default 0.5, at least one) of the nations and peoples met.

No score condition. Several peoples can win together.

**Military victory** (`military`): **decided** (Simon). If all Europeans are defeated, the people (or peoples) win. It is meant, in essence, for persons playing peoples; in computer-only games it must be only theoretically possible.
- **Defeated:** a European nation (a nation or a chartered company) has no colony and no land unit on the map. Ships, units at sea and units in Europe do not count. The Crown counts only while its land units are on the map (the Royal Expeditionary Force after a declaration); otherwise it is not a European present.
- **New arrivals:** checked only once every nation in the scenario has arrived (`NationEntry.arrives`, T18); a nation yet to arrive is not defeated. In the North-east game it cannot come before the last arrival (the Netherlands, 1610s).
- **When:** after every round, ending the game at once, as `independence-war` does.
- **Winners:** every playing people still in the game, together, ranked by their part (European units defeated and colonies taken, then score).
- **Options for "defeated", to settle in step 7:** (a) at once, as above (proposed); (b) (a) held for `years` rounds, since a nation might sail back with colonists from Europe; (c) no European unit of any kind on the map, ships included. Proposed: (a), with `years` a param defaulting to 0, so (b) is a number away.
- **Computer-only games: 1 in 100 or fewer.** A target as a scenario-overridable default (`Scenario.ai.peoples.militaryWins`, 0.01, a ceiling), measured by tournaments. How: no people profile aims at it; computer peoples fight to defend their land, answer pacts and raid a rival, and seek peace after `peaceAfter` years of war. No special rule protects a European nation's last colonies: Simon (11 November 2026) found such a guard too artificial, so tournaments first measure how often a military win happens, and a rule is added only if it comes too often.

**Score.** A people's score follows the same values, not gold and buildings. Lines (`SCORE_WEIGHTS` entries for the `people` kind, tunable per scenario and per people through `peoples.overrides[id].score`):
- **people:** per person (units and town folk);
- **homeland kept:** per tile of its starting homeland still kept (as continuity counts it);
- **land health:** the average health of its homeland's regions, times a weight;
- **stores:** per year of reserve held across its towns, capped;
- **standing and treaties:** per treaty in force (Beta 2's `peopleTreaty` weight, read from the people's side), and per nation or people whose standing reads "Trusts you" (Beta 2's words);
- **council:** per council member.

Not counted for a people: gold, buildings, production. Kin ties and elders would be lines in the deferred scenario.

**Order, and how both sides win in one game.** Today the first kind in `Scenario.victory` that ends the game decides it. Proposed for scenarios with playing peoples:
- **Order:** `[military, independence-war, confederacy, concord, prosperity, continuity, good-life, time]`. Immediate kinds first; at the end year, groups before single winners, so a league wins as a league and an alliance as an alliance.
- **Both sides judged:** at the end year every kind is asked and each player is judged once, by the first kind in the order that names it. `gameOver.winners` becomes `PlayerId[]`, with `gameOver.ways?: Partial<Record<PlayerId, string>>` naming each winner's kind. A game can end "France wins by prosperity, with the Wendat; the Haudenosaunee win by continuity."
- **Independence (Simon, 11 November 2026):** a won War of Independence is a win for the new nation. If, when it is won, a person playing that nation is at war with any people, the game asks whether to keep playing. **No:** the War of Independence victory is achieved as usual. **Yes:** play goes on, and it is the player's choice to make peace or fight on; the independence is kept, and the game then ends by the scenario's other kinds or the end year. Computer nations take the win at once. In a game with a playing people the nation is finished with its win recorded (as play-on's `finished` does) and play goes on to the end year, since the peoples still have their own endings to reach.
- **Score is not compared across kinds of player:** concord's share and prosperity's best score read European scores only; `time` names the best-scoring European only if no European won another way, and never names a people. A people's score ranks it among peoples and shows its values; a people does not win by score.

**Options for T14:**

| Option | What | Notes |
| --- | --- | --- |
| (a) | Continuity, confederacy and a good life, plus the military victory; people score lines; both sides judged | **Recommended.** Confederacy only where the scenario has at least three peoples who can join; the North-east game lists all three. |
| (b) | Continuity and the military victory only; people score lines as a ranking | Simplest: no `league` treaty kind, no good-life rule. |
| (c) | The first proposal: `sovereignty`, `prosperity` from the people's side, score | Dropped as a European win relabelled; kept for comparison. |

The coexistence rule has its own options: (a) both sides judged, every winner listed (recommended); (b) as today, the first kind that names anyone ends the game; (c) in a scenario with playing peoples, only the peoples' kinds and `time`.

**Out of scope for Beta 3:** a people rising to player mid-game (T3 b); captives; kin ties, adoption and elders as a measure of growth (T10, kept for a separate scenario); peoples in European alliances or in a European confederation (a league of peoples is T14's confederacy, if chosen); the seasonal lifeway and Country (Australia); hex maps; Vinland (Beta 4, T17); making the Americas' or the Caribbean's peoples playable (a later small step once the North-east game works); network play; the Thing's and the Legislative Council's members (only the system); loading old saves (T21).

**Before the year 1000** is a potential scenario, not part of this game: native peoples as full nations before any European arrives, which would rebuild many mechanics (roadmap, Scenarios; Simon, 11 November 2026).

## 5. Phased plan (sizes as in the roadmap)

Each step keeps the Americas and the Caribbean identical (golden and bench hashes) and adds tests; a hidden test scenario with one playing people carries the work until the North-east game exists. The hashes are a testing aid, not a save promise (T21).

| Step | What | Size | Prio |
| --- | --- | --- | --- |
| 0 | This note; Simon's decisions | S | P1 |
| 1 | **The nation type.** `PlayerId`, `kind: 'people'`, `playerKind` and the systems table (the company checks moved onto it first, bit-identical); Europe-only systems off by kind; per-type selections of units and buildings; a people player at setup with towns as colonies (T1–T4); a hidden test scenario. **Built** (section 7) | L | P1 |
| 2 | **Economy and growth without Europe** (T10). The people's units and buildings (T6, T7), hunting, fishing, gardens and crafts; births from food above a town's reserve; stores and hard years (`mechanics.hardYears`); land health per region (`mechanics.landHealth`); Beta 2's standing record widened to `PlayerId` and read from the people's side; gold only from trade with Europeans, at towns and by treaty; people-to-people trade. **Built** (section 8), except trade and gold, which need the people's side of Beta 2's trade (step 4) | L | P1 |
| 3 | **The council system.** `Scenario.councils`, open categories, the Congress as one council, the people's council with its first members and their sources (T8, T9). **Built** (section 9; the people's council drafted for Simon's review) | M | P1 |
| 4 | **Diplomacy from the people's side.** Beta 2's treaties proposed and broken by a playing people, treaties between peoples, war and peace between any players (T11); epidemics behind a switch if agreed (T12). **Built** (section 10), with step 2's trade and gold | L | P1 |
| 5 | **Knowledge of the land** as a trait (T13). **Built** (section 11) | S | P2 |
| 6 | **Arrivals.** `NationEntry.arrives` (T18). No calendar work: one turn a year with head starts, which the framework already does (T16). **Built** (section 11) | S | P1 |
| 7 | **Victory and score** (T14). Now: the `military` kind (decided), "defeated" as defined, `winners: PlayerId[]`. Once T14 is decided, as recommended: `continuity`, `confederacy` (with the `league` treaty kind), `good-life`, both sides judged at the end year (`gameOver.ways`), people score lines. **Built** (section 12) | M–L | P1 |
| 8 | **The North-east, 1000–1850.** The North-east map on squares with its regions and their renewal rates, its peoples researched with their own values (T19, T20), the arrivals, events (hard years among them), terms, head starts. **Built** (section 13; registered hidden until step 10) | L | P1 |
| 9 | **Computer native nations** per level: stores, restraint on the land, treaties and leagues by profile; measuring how often a military win happens (no guard rule unless it comes too often); tuning against T15 and the military target (1 in 100 or fewer) with tournaments. **Built** (section 14) | L | P1 |
| 10 | **Interface and art.** New game, towns, council, Foreign Affairs from the people's side; procedural art; the Mac sprite trial in parallel (T22). **Built** (section 15), but for the sprite trial | M–L | P1 (art P2) |

Total: well over **XL**, larger than Beta 2 (three L steps more), a little smaller without the calendar work. Steps 1–6 can start now (T10 is decided); step 7's military victory can start now, its other kinds wait for T14; step 8's research can run alongside.

## 6. Questions for Simon

None open: Simon decided T14 (option (a) with the military victory as described) and confirmed T19 (the North-east map on squares, turned into hexes for Vinland in Beta 4) on 11 November 2026.

## 7. Implementation (step 1, November 2026)

Built on branch `beta3/step1`. Code: `playerkind.ts` (new: `PlayerKind`, `playerKind`, `kindOfId`, `PLAYER_SYSTEMS`, `systemsOf`, `systemsOfId`, `isPeoplePlayer`), `peopleplayer.ts` (new: `addPeoplePlayer`), `rules/nations.ts` (`PlayerId`), `types.ts` (`Player.kind`, `GameConfig.peoples`, the widened ids), `scenarios/types.ts` (`PlayerEntry`, `PlayablePeople`, `NationTypeSelection`, `Scenario.nationTypes`, `peoples.playable`), `scenarios/index.ts` (`nationOf` for any player, `playablePeoples`, `nationTypeOf`, `PEOPLE_SELECTION`, `bornType`, `newColonyBuildings`, `buildingsOf` and `unitsOf` by owner, the config check), `game.ts` (`newPlayer`, `createGame`), and the files whose company checks moved (below). Test: `test/people-player.test.ts` (8 tests) with the hidden scenario `test-people-player`.

### What was built

- **One table of systems per kind (T1).** `playerKind(p)` is `nation`, `company`, `crown` or `people`; `kindOfId(id)` reads the same from an id alone, since the four kinds' ids never overlap (`crown`, the company ids, the people ids, the nations). `systemsOf(p)` and `systemsOfId(id)` return the kind's row of `PLAYER_SYSTEMS`:

| System | nation | company | crown | people | Read by |
| --- | :-: | :-: | :-: | :-: | --- |
| `homePort` (market, Europe) | yes | yes | yes¹ | no | `newPlayer` (market), `recoverMarkets`, damaged ships, score's goods |
| `immigration` | yes | yes | no | no | `processImmigration` |
| `taxes` | yes | no | yes² | no | `maybeRaiseTax` |
| `crown` (REF growth, demands, royal wars) | yes | no | no | no | `processCrown`, `royalWarTargets` |
| `independence` | yes | no | no | no | `canDeclareIndependence`, `readyToDeclare` |
| `congress` | yes | no | no | no | `processCongress`, allies' shared bells |
| `startingCaravel` | yes | yes | no | no | `createGame` (`startingUnits`); a company's comes with `foundCompany` |
| `war` | yes | no | yes | yes | `startWar`, `attack`, computer war targets, privateers' prey, a defence pact's attacker |
| `relations` (trade, Favoured Nation) | yes | no | no | no | `europeanPair`, computer proposals, Foreign Affairs' nations |
| `alliances` | yes | no | no | no | `allianceProblem`, the alliance size cap |
| `peoples` (peoples nobody plays treat it as a European) | yes | no | no | no | `addTension`, `processNatives`, inciting, standing, people treaties, burial grounds, braves' enemies and raids, the web incite dialog |
| `visitedByBraves` | yes | yes | no | no | braves' `nearestColony` |
| `rumours` | yes | yes | yes | no | entering a Lost City Rumour's tile |
| `events` | yes | no | no | no | `fireEvent`, world and random events |
| `ranked` (final scores, shares, play-on) | yes | no | no | no | `finalScores`, `score`'s company shares, play-on's end |
| `ai` | level | company | crown | people | `runAi` |

¹ The Crown keeps the market every player was given (its colonies retaken from rebels sell through their custom houses). ² The Crown's colonies retaken from rebels sell through their custom houses and are taxed, as before. Both footnotes reproduce the engine as it was. The first version of the table had the Crown untaxed; bench and golden hashes did not notice, the 24-game tournament did (three games changed), and it was fixed in its own commit.

- **The checks moved.** About 30 company and "European nation" checks in 20 files now read the table, in four commits, each bit-identical; `isCompany`, `isNation` and `companies` in `companies.ts` read `playerKind`. Checks for the Crown's own units and colonies (`u.owner === 'crown'`: the Royal Expeditionary Force, retaken colonies) are identity checks, not system checks, and stay. `isCompanyId` is still exported; the engine no longer uses it.
- **`PlayerId` (T1).** `PlayerId = NationId | TribeId`. `Player.id`, `Unit.owner`, `Colony.owner`, `Tile.claim`, `Tile.use`, `Tribe.stance`, `Settlement.tension`, `GameMessage.to`, `gameOver.winner`, `winners` and `scores`, and the engine's, renderers' and web game's functions that take a player, are `PlayerId`. `GameConfig.nations`, the scenarios' nation sets, `NationEntry.id` and the New game screen stay `NationId`. `nationOf(s, id)` takes any player and returns a `PlayerEntry`; a playing people's entry is built from the people (its colour, the scenario's name and adjective for it, its town names, no bonus, a home port with no name or market).
- **`kind: 'people'` with the Europe-only systems off** (the table): no market (`Player.market` is `{}`), no gold to start (T10), no immigration, Crown, taxes, Royal Expeditionary Force, independence, Congress, caravel, events or rumours. `sellPrice` reads 0 for a player with no market, as a guard.
- **Per-type selections (T6, T7).** `Scenario.nationTypes.people` (`NationTypeSelection`: `units`, `buildings`) is the people's selection from the global catalogues beside the European one (`Scenario.units`, `buildings`); missing means the engine's placeholder `PEOPLE_SELECTION`: the native convert (today's only native unit type) and the town hall, carpenter's and blacksmith's house. `nationTypeOf(s, 'european' | 'people')` reads it. (Since section 17 both selections live in `Scenario.nationTypes`, the European one as `nationTypes.european`.) `buildingsOf(s, owner)` and `unitsOf(s, owner)` give a people's towns its own buildings and builds (nothing from Europe), and `newColonyBuildings` makes a town's buildings: its own at their first level, the European ones at 0, so rules that ask for docks or a stockade read "none". A town grows by `bornType`, the first unit of the people's selection.
- **A people player at setup (T2, T3, T4).** `Scenario.peoples.playable` names the peoples setup may play (`PlayablePeople`: id, name, adjective, town names); `GameConfig.peoples` picks which play (checked against that list); `config.humans` and `config.ai` may name them. `createGame` adds each after the nations (`addPeoplePlayer`): a `kind: 'people'` player with its own id, its settlements turned into towns (colonies it owns, at the settlements' places and with their names, a road on the tile), each with one unit at work and one standing in the town for the braves the settlement would have sent; the settlements' records go, the `Tribe` record stays. Peoples not picked stay settlements under Beta 2's rules. A computer people ends its turn (`ai: 'people'`) until step 9.
- **The hidden test scenario.** `test-people-player` (registered in `test/people-player.test.ts`, like the other hidden test scenarios): the Americas with the Iroquois playable. Tests: the table and the kinds; setup (players in order, towns, buildings, units, settlements gone, the nations' caravels); refused configurations; 120 rounds of three computer nations around a computer people; save and load (the loaded game is the same and plays on the same for 30 rounds); a person playing the people for 20 turns; its towns working. Each checks that no Europe-only system touched the people: no market, taxes, boycotts, demands, Crown bookkeeping, REF, independence, crosses, recruits, Congress members, gold, no unit in Europe or sailing, no caravel, no tax, immigrant or Royal Expeditionary Force message, and no tension or stance towards it from the peoples nobody plays.

### Choices made while building (for Simon)

1. **One selection per nation type, in one place:** `Scenario.nationTypes: { european, people? }`, each a `NationTypeSelection` with the same fields, `units`, `buildings` and `council` (the people's adds `knowsLand`, T13). `european` is required (the Americas, the Caribbean and the North-east give it; companies and the Crown use it too); `people` is given by the North-east and the test scenarios, and absent means the engine's `PEOPLE_SELECTION`. Read with `nationTypeOf(s, type)`. Grouping by nation type rather than by catalogue (T6's sketch, `units: { european, people }`) keeps everything a type uses together, including its council. Step 1 first left the European selection as `Scenario.units` and `buildings` with the people's beside it, so as not to touch the older scenarios' data; that compromise was removed after step 10 (section 17).
2. **Rumours are a system of their own** (not in the plan's list): a people's units walk past Lost City Rumours, whose finds are partly European (immigrants on the docks in Europe).
3. **War is on for a people from step 1** (T11), so computer Europeans may already treat a people's towns as any war target, and its units fight. Nothing tunes that until steps 4 and 9; the tests play it without a crash.
4. **The placeholder units and buildings are today's**: native converts people the towns and are born in them, and a town hall rings bells that become liberty in the town (the council's product comes in step 3). No new catalogue entries were needed for step 1; step 2 adds the people's own.
5. **A generated map may not place a playable people.** Setup then fails with "The Iroquois have no settlements on this map." On medium generated Americas maps this happened on 4 of 8 seeds tried; the test uses a seed where the Iroquois are there. The North-east game's stored map (step 8) places every people; the New game screen does not offer peoples before step 10.
6. **The widening is wide.** Besides the state fields T1 names, every function that takes a player now takes `PlayerId` (a mechanical change, types only). Narrowing back to `NationId` where only nations make sense is cheap if wanted.
7. **Not yet:** land claims by a people's towns (T5), its score lines (step 7: it is not ranked, and its score counts no goods), its standing record (step 2), the interface (step 10: a person playing a people in the web game would still see the European screens). Step 2 built the land claims and the standing record (section 8).

### Measurements

Every commit of the refactor was checked with `npm run bench -- --verify` and `--verify --scenario caribbean` ("same" for all eight games) and the golden tests, unchanged. After the fix of the Crown's taxes, the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) is identical to the base, also with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`. The test scenario passes with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`; two 609-turn games with two playing peoples (the Iroquois and the Sioux) and four computer nations, saved and loaded every 150 turns, end in the same state with and without the checks.

## 8. Implementation (step 2, November 2026)

Built on branch `beta3/step2`. Code: `rules/units.ts` and `rules/buildings.ts` (the people's catalogue entries, `EUROPEAN_UNIT_TYPES`, `PEOPLE_UNIT_TYPES`, `EUROPEAN_BUILDINGS`, `PEOPLE_BUILDINGS`), `rules/peoples.ts` (new: `WayId`, `wayOf`, `PeopleEconomy`, `PEOPLE_ECONOMY`), `peopleeconomy.ts` (new: births, stores, hunger, housing, elders' teaching, a people's land, a computer people's town builds), `land.ts` (new: regions, hard years, land health), `scenarios/types.ts` (`Mechanics.hardYears`, `Mechanics.landHealth`, `Scenario.peopleEconomy`), `rules/nations.ts` (`PeopleDef.storeYears`), `types.ts` (`GameState.land`, `LandState`, `Colony.hunger`, `Colony.foughtAt`), and hooks in `production.ts`, `colony.ts`, `combat.ts`, `queries.ts`, `turn.ts`, `game.ts`, `peopleplayer.ts`, `natives.ts`, `braves.ts`, `europe.ts`, `relations.ts` (`regionRandom`), `commands.ts` (`claimLand`) and `ai/advanced.ts`. Tests: `test/people-player.test.ts` (25 tests, 17 of them new), with the hidden scenario `test-people-player` now selecting the people's units and buildings and switching hard years and land health on.

**Everything in this section's tables (stats, production, numbers) is drafted for Simon's review.** The numbers are a first tuning, to be measured in step 9. The historical notes behind the units and buildings, with their sources and what is still "to be sourced", are in [research, section 2](../research/north-east-peoples.md#2-ways-of-life-work-buildings-and-the-land).

### What was built

- **The people's units and buildings (T6, T7)** as catalogue entries (`people: true`), the default of `Scenario.nationTypes.people` (`PEOPLE_SELECTION`). The Americas and the Caribbean select only the European entries (`EUROPEAN_UNIT_TYPES`, `EUROPEAN_BUILDINGS`), so their selections, colonies and builds are unchanged. No sacred roles or places.
- **Hunting, fishing, gardens and crafts as production.** Food stays one good: fish, game and the gardens' maize, beans and squash are told apart by the way they are got (`wayOf`: `fishing` on water, `gardens` on open land of a garden terrain, `hunting` for furs and for food from forest or from open land where gardens do not grow), and a worker's `ways` multiply the land's yield. Gardens grow on plains, grassland, prairie, savannah and hills (`PEOPLE_ECONOMY.gardens`), not tundra, marsh, swamp or desert: a stand-in for "the St Lawrence valley and south, not Newfoundland" until step 8's map, whose regions can carry it. Crafts are the workshop's work (hammers). A people's town has no Sons of Liberty or Tories (`libertyBonus` 0).
- **Births from food above the town's reserve** (T10, `growPeopleTown`): a town grows when its food above its reserve reaches `foodToGrow` (200). The reserve is `storeYears` (1; `PeopleDef.storeYears` per people) years of its people's food (two a person a turn, times the turns in the year), counted only as far as its stores keep it. The child is a townsperson and joins the town's work at once (`bestJob`), so a computer people's towns grow without any decision. No birth in a year the town went hungry or was attacked (`Colony.foughtAt`, written when a people's town is attacked), and none while its longhouses are full (`housing`; everyone living there counts: workers and its people standing in the town).
- **Stores** (`storeCapacity`, `foodCapacity`): a town keeps `storeBase` (50) and what its drying racks, smokehouse and storage pits add; food beyond `foodToGrow` plus that spoils. Storage pits also keep other goods, as a warehouse does.
- **Hard years** (`mechanics.hardYears: { chance }`, 1 in 8): at the start of each year each region has a hard year, drawn from the game seed for that region and year (`regionRandom`, never `GameState.rng`), and food yields there are halved for everyone, European colonies included. One message per player names its towns or colonies struck.
- **Hunger** (`Colony.hunger`): a town whose food runs out goes hungry (its food stays at 0, no birth that year); a second hungry year in a row costs it a person, and every further one. A European colony's starvation is unchanged.
- **Land health per region** (`mechanics.landHealth: { regionSize, renewal, recovery, floor }`, 8, 40, 5, 0.2): `GameState.land` holds each region's health (0–100, from 100) and what was taken in it this year. Furs and game (the hunting way) taken by anyone count: a people's workers, Europeans' colonies (workers and centre tiles) and the furs the settlements of peoples nobody plays gather. At a year's end a region where more than its renewal was taken loses the excess; one where less was taken regains `recovery`. Fur and game yields there are multiplied by its health (at least `floor`); fish and gardens are untouched. The advanced computer players' job search reads the same yields (`ai/advanced.ts`). Health in words (`healthWords`: whole, thinning, worn, emptied) is there for the interface (step 10).
- **Regions**: until step 8's North-east map brings real regions, the map is cut into squares of `regionSize` tiles, numbered row by row (`regionOf`). Simple, deterministic, on every map; the region is the same for every player, so Europeans' trapping wears a people's land and the reverse. With hard years but no land health, regions are 8 tiles.
- **A people's land (T5)**: once every settlement is a town, each town claims the unclaimed land within its people's `landRadius` and its own tile (`Tile.claim` the people's id), never land of a settlement of a people nobody plays; a town founded later claims the same way. The `claimLand` command claims an unclaimed tile next to its land within `landRadius + 1` of one of its towns. Other players' colonies neither work a people's claimed land (`peopleLandClosedTo`, in the colony's occupancy and `assignJob`) nor found colonies on it (`colonySiteProblem`, which now takes the founder). Leases and sales from the seller's side are step 4.
- **Standing (T10)**: Beta 2's record is read from the people's side as far as step 2 needs it: `goodRelations` for a playing people is "at peace" (it has no settlements to be content), so a record written for a nation and a playing people keeps its `goodSince` as Beta 2's records do. Nothing new is written at setup; trade and treaties from the people's side are step 4.
- **Elders teach (T6)**: an elder works in the longhouse's teaching places (`BuildingDef.school`; `schoolOf`), and after a schoolhouse's four turns teaches the first townsperson whose work has an expert the skill of that work: a hunter's, fisher's, gardener's or crafter's (`teachesWays`, `skillOfWork`). Only elders teach. Elders' long service as a measure of growth stays deferred (T10).
- **Warriors and runners**: a warrior fights with its bow (offence 1, which colonists' roles now take as a floor: `Math.max(role, unit)`, the same for every European colonist), and with muskets and horses by trade it takes the soldier and dragoon roles as a veteran does (×1.5). A people's townsperson who wins a fight may become a warrior (as a European soldier may become a veteran). A runner moves 2 and sees 2 (`UnitTypeDef.sight`).
- **No captives**: where a people plays, a beaten unarmed unit of a people, or one beaten by a people's unit, is lost rather than captured (captives are out of scope for Beta 3). A people's town defended by a warrior is not captured until the warrior is beaten.
- **Computer peoples** still end their turns (step 9), but their towns grow and produce by these rules: births join the work (the town's job values, `townJobValue`: food while short, building work, goods only while there is room), and a computer people's town with nothing to build takes the first it can of a fixed plan (storage pits, longhouses, palisade, canoe landing, workshops, smokehouse). In the test scenario the Haudenosaunee capital grows from 3 at work to 7 by round 150 and 15 by round 300, builds out its longhouses, pits, palisade and canoe landing, and its elder teaches hunters, crafters and a fisher.
- **No Europe**: a people does not hurry builds (gold only from trade, T10) and its boats do not sail to Europe; neither had a guard before.

### The people's units (T6)

| Unit | Kind | Moves | Offence / defence | Skill | Ways and work | How it comes |
| --- | --- | :-: | :-: | :-: | --- | --- |
| Townsperson | colonist | 1 | 0 / 1 | 0 | any work at the land's yield | born in the towns; the selection's first unit |
| Hunter | colonist | 1 | 0 / 1 | 1 | hunting ×2: game (food from forest, or open land where gardens do not grow) and furs | taught by an elder |
| Fisher | colonist | 1 | 0 / 1 | 1 | fishing ×2: food from water (needs a canoe landing) | taught by an elder |
| Gardener | colonist | 1 | 0 / 1 | 1 | gardens ×2: maize, beans and squash on open land where they grow | taught by an elder |
| Crafter | colonist | 1 | 0 / 1 | 1 | the workshop's work ×2 (tools of wood, stone and bone, frames, canoes) | taught by an elder |
| Runner | colonist | 2 | 0 / 1 | 1 | sees 2; a scout's role with horses | at setup (the capital's one) |
| Warrior | colonist | 1 | 1 / 1 (bow) | 1 | the soldier and dragoon roles with muskets and horses by trade, ×1.5 | at setup (each town's one, for the braves); a townsperson who wins a fight |
| Elder | colonist | 1 | 0 / 1 | 1 | teaches in the longhouse (the student's own work); speaks in the council house (its product ×2) | at setup (the capital's one) |
| Birchbark canoe | ship | 4 | 0 / 1 | — | carries one unit or 100 goods | built at a canoe landing: 40 hammers, no tools |

No unit has a price: experts are learned at home (by elders), or by exchange (step 4), never bought. The plain units' ways count 1.

### The people's buildings (T7)

| Building | Levels (hammers, least people) | Starts at | Places | What it does |
| --- | --- | :-: | :-: | --- |
| Longhouse | Longhouse (0, 1); Longhouses (64, 4); Many Longhouses (160, 8) | 1 | 1–3 teaching places | houses 6, 12, 20; elders teach here |
| Drying racks and smokehouse | Drying Racks (0, 1); Smokehouse (64, 3) | 1 | — | keep 50, 150 more food |
| Storage pits | Storage Pits (52, 2); Bark-lined Storage Pits (120, 5) | 0 | — | keep 100, 250 more food and 100, 200 more of other goods |
| Workshop | Workshop (0, 1); Workshops (56, 4) | 1 | 3 | the building work (hammers): 3 a worker, 6 a crafter, doubled with workshops; 1 a turn (2) with nobody in it; no input (crafters gather their own wood, bark and stone) |
| Canoe landing | Canoe Landing (40, 1), on the coast | 0 | — | the town works water tiles and builds canoes (as docks) |
| Palisade | Palisade (64, 3); Double Palisade (120, 6); Triple Palisade (200, 10) | 0 | — | +50 %, +100 %, +150 % defence in the town (a stockade gives 100–200 %); three rows as Hochelaga had in 1535 |
| Council house | Council House (0, 1) | 1 | 3 | 1 bell a turn and 3 a worker (an elder 6): a stand-in for the council's product until step 3 |

No building costs tools: iron tools came only from Europeans. None is a ceremonial or sacred place.

### Choices made while building (for Simon)

1. **A townsperson.** T6 lists no plain unit, but births need one and elders need someone to teach: the townsperson (born in the towns, skill 0). The name is plain and the same for every people; a scenario's terms could rename it.
2. **Food is one good.** Fish, game and the gardens' crops are ways of getting food, not goods of their own; T10's goods list (fish, maize, hides, clothing) is not added to the catalogue. Adding goods would change every scenario's warehouses and markets; telling the ways apart was enough for the rules (hard years, land health, experts).
3. **Clothing.** The workshop makes the building work (hammers) only: a building has one product, and the building work is what a town needs most. Clothing of furs and hides is not a good yet; furs are kept and spoil when the store is full, waiting for trade (step 4). A clothing good, or the European coats renamed, is a question for step 4 or 8.
4. **The workshop has no input** and a free hammer a turn, unlike a carpenter's (lumber): with lumber, a town's first births all went to food and nothing was ever built.
5. **Housing.** The longhouse houses a number of people (6, 12, 20), counting everyone living in the town (warriors and runners too); births stop at it. T7 said "housing; growth" without a rule; this one makes building longhouses the way a town grows past its first size.
6. **Elders teach in the longhouse**, the student learning the skill of its own work, not the elder's. Elders, runners and warriors come at setup (warriors also by winning a fight); no rule yet makes new elders or runners (elders by long service is the deferred measure of T10).
7. **The reserve and the store.** Food below the reserve is the store; the reserve counts only as far as the town can keep it, so a large town without storage still grows. Food beyond `foodToGrow` and the store spoils. Hunger leaves food at 0 (no debt).
8. **Hard years are not an event kind.** The note (T10) put them on the events system, but events are off for a people (the systems table) and draw from `GameState.rng`; a draw per region and year from the seed is independent of play, needs no state beyond this year's list, and strikes towns and colonies alike.
9. **Regions are 8 by 8 squares** (`regionSize`) until the North-east map; renewal 40 furs and game a region a year, recovery 5, floor 0.2. Wear is the excess itself (70 taken against a renewal of 40 costs 30 health).
10. **Settlements' furs count** against the land too (they are "anyone"), scaled by its health; their other goods do not.
11. **No captives** where a people plays: beaten unarmed units are lost instead (out of scope list, section 4). A European capturing a people's town still takes it with its people, as any colony; step 4 or 7 should decide what taking a town means (T14's continuity counts towns held by another player).
12. **A people's claimed land is closed** to other players' colonies (work and founding), as unbought native land is; buying, leasing and taking it from the people's side is step 4.
13. **Computer peoples' towns** take builds from a fixed plan and their births take jobs by a people's job values (`townJobValue`). That is colony automation, not the step 9 profiles; existing workers are not moved.

### Not done yet

- Gold from trade with Europeans at towns and by treaty, and people-to-people trade (section 5 lists them in step 2; they need the people's side of Beta 2's trade and treaties, step 4): a people's gold stays 0, its furs wait. Step 4 built them (section 10).
- The people's score lines (step 7) and the interface: health on a map overlay and in words, stores and hunger on the town screen (step 10).
- Real regions, their renewal rates and where gardens grow on the North-east map (step 8).
- Computer peoples' restraint on the land and their stores by profile (`storeYears` 0.5 for Combative, T10; step 9).

### Measurements

Every commit kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base. The test scenario's tests pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` (the AI checks found the advanced job search missing the land's yields at first; it reads them now).

## 9. Implementation (step 3, November 2026)

Built on branch `beta3/step3`. Code: `rules/councils.ts` (new: `congress(members)`, `PEOPLE_COUNCIL`, `ENGINE_COUNCILS`), `rules/fathers.ts` (open `FatherCategory`, `CongressCategory`, the people's council's catalogue entries, `CONGRESS_AI_PREFERENCE`, `CouncilCost`, `CONGRESS_COST`, `fatherCost` with a rule), `scenarios/types.ts` (`Scenario.councils`, `CouncilId`, `Council` with `text`, `late`, `aiPreference`, `cost` and `hall`, `CouncilTextKey`, `nationTypes.european.council`, `NationTypeSelection.council`), `scenarios/index.ts` (`councilIdOf`, `councilById`, `councilOf(s, player)`, `councilText`, `CouncilText`), `scenarios/modifiers.ts` (a player's own council's members and effects), `fathers.ts` (offers, choices, joining and costs read the player's council), `playerkind.ts` (`council` per kind), `peopleplayer.ts` (a people's first candidates), new hooks in `rules/modifiers.ts` read in `production.ts`, `peopleeconomy.ts`, `colony.ts`, `land.ts` and `combat.ts`, the `makePeace` effect (`events/`), `reports.ts` (plural members' join turns). Interface: `render-api` (`drawCouncilEmblem`, `drawCouncilEmblemStanding`, `drawCouncilHouseBackdrop`, `fatherColor`), `style-sprites` (emblem members never look up a sprite), and the web game's council hall, council report tab, candidate choice, sidebar line and Foreign Affairs card. Tests: `test/people-player.test.ts` (32 tests, 7 of them new), the conformance tests in `test/scenarios.test.ts` (every nation type's council), and the existing tests moved to `councils.congress`.

**The people's council (its categories, members, effects and words) is drafted for Simon's review.** The refactor of the Congress is not: it is bit-identical.

### The system (T8)

- **`Scenario.councils`**, keyed by id, replaces `Scenario.council`. The Americas and the Caribbean have one, `congress`, built by `congress(members)` with exactly today's rules: the five categories, political members +2 weight after turn 120 (scaled by `ai.pace`), the computer players' preference list and the cost rule 60, 50, 12. The Caribbean still calls it the Colonial Council through its terms.
- **Each nation type names its council:** `nationTypes.european.council` (absent: `congress`) and the people's selection's `council` (absent: `people`). Since section 17 every selection names its council (`congress` in the shipped scenarios, `people` in `PEOPLE_SELECTION`), with no default. The systems table (`playerkind.ts`) gives each kind its council type: `european` for nations, `people` for a playing people, none for companies and the Crown (which never had one). `congress` stays in the table for what is the Congress's alone: allies sharing bells (alliances.ts). `councilOf(s, player)` reads it; a council id a scenario does not define is looked up in the engine's `ENGINE_COUNCILS`, as `PEOPLE_SELECTION` stands in for a scenario's people's selection, so the hidden test scenario needs no council data of its own.
- **Open categories:** `FatherCategory` is a string; the Congress's five are `CongressCategory`. `FatherId` stays a union of catalogue ids, so every member is checked by the compiler; a scenario adds members to the catalogue as before.
- **A member** may be `plural` (a collective: "The Elders join the Council of the Haudenosaunee"), limited to `peoples` (offered only to those players), shown as an `emblem` (never a likeness) and carry a `source` line, shown in the hall's tip.
- **A council's words** (`Council.text`: `council`, `councilShort`, `member`, `members`, `product`) are read with `councilText(s, player, key)`; the Congress has none, so it reads the scenario's terms, byte for byte as before (messages and history are in the hashes).
- **Its product stays "bells" in the engine** (`Player.bells`, `fatherBells`, `produced.bells`), and the people's council calls it **counsel**. The council house (step 2) already produced bells as its stand-in; it is now the council's product, with nothing new in the state. A new good was the alternative: it would add a product to every scenario's tables and reports for no change in the rules. A people's towns' bells also add to `Colony.liberty`, which does nothing there (no Sons of Liberty, step 2).
- **Costs:** a council may have its own `cost` rule; the people's council uses the Congress's (the first member about 56 counsel in a three-nation game, the tenth about 1,650).
- **Every player's effects come from its own council**, in that council's order (`scenarios/modifiers.ts`), so a people's members never apply to a nation and the reverse.

### The people's council (T9), drafted for Simon's review

Five categories for the people's economy (T10): **household** (births and stores), **land** (gardens, fishing, hunting and the land's health), **knowledge** (teaching and crafts), **defence** and **peace**. Thirteen members: eleven roles and collective figures, and two named Haudenosaunee leaders offered only to the Haudenosaunee. The Clan Mothers, a Haudenosaunee institution by that name, are also offered only to the Haudenosaunee. Weight 5 each, the named people 3. Every member is drawn as an emblem.

| Member | Category | Effect (hook) |
| --- | --- | --- |
| The Clan Mothers (Haudenosaunee only) | household | A town needs 160 food above its reserve for a birth, not 200 (`foodToGrow` 160) |
| The Keepers of the Stores | household | Every town keeps 100 more food in store (`townStore` +100) |
| The Keepers of the Fields | land | Gardens yield 50% more (`wayYield` gardens ×1.5) |
| The Hunt Leaders | land | Land where its towns stand recovers 5 more health a year when not over-hunted (`landRecovery` +5) |
| The Weir Builders | land | Fishing yields 50% more (`wayYield` fishing ×1.5) |
| The Elders | knowledge | Elders teach a skill in 3 turns, not 4 (`teachTurns` −1) |
| The Toolmakers | knowledge | Workshops produce 50% more (`buildingOutput` workshop ×1.5) |
| The Canoe Builders | knowledge | Canoes gain one move (`shipMoves` +1) |
| The Runners | defence | Land units see one tile further (`sight` +1) |
| The War Leaders | defence | A townsperson who wins a fight always becomes a warrior (`alwaysPromote`) |
| Thayendanegea (Joseph Brant; Haudenosaunee only) | defence | Warriors fight 50% harder (`unitOffence` warrior ×1.5) |
| The Speakers | peace | Players at war with it always accept peace (`peaceAccepted`) |
| Garakontié (Haudenosaunee only) | peace | Every war it is in ends in peace, on joining (`makePeace`) |

Each member's `source` line (in the catalogue, `rules/fathers.ts`, shown in the hall's tip) and its historical ground are in [research, section 4](../research/north-east-peoples.md#4-the-peoples-council), with the roles still "to be sourced".

The words: the **Council** (short: Council), a **council member**, **counsel** for its product; "The Clan Mothers join the Council of the Haudenosaunee." A computer people chooses by a preference that fills its stores and keeps its land first (the Keepers of the Stores, the Clan Mothers, the Hunt Leaders, the Keepers of the Fields, the Elders, the Speakers, the Weir Builders, the War Leaders), otherwise the first offered. In the test scenario a computer Haudenosaunee people has seated one member by round 120 and two by round 150.

Left out on purpose (T9): founding and spiritual figures of living nations (the Peacemaker, Hiawatha, Jigonhsasee), anything ceremonial or sacred as an effect (condolence, wampum, the Thanksgiving Address, the Three Sisters as spiritual beings: the gardens' member is named for the work, the Keepers of the Fields), and invented likenesses. Pocahontas stays in the European council, as T9 decided. No member's effect touches standing or treaties yet: Beta 2's treaties from the people's side are step 4, and the peace members' effects are the existing peace rules.

### The interface (minimal)

The council hall (K) shows the player's own council: the Congress, unchanged for a nation, or for a playing people its council with its own words, as many seats as members it may have, no rebels line, a plain council house backdrop and its members as emblems (a roundel or an upright tablet in the category colour with initials, `render-api`), their source lines in the tip. The council report tab, the candidate choice, the sidebar line and Foreign Affairs' card read the same words; a people's report tab has no Sons of Liberty table. The New game screen still offers no people (step 10), so a person sees the people's council only in a game set up in code.

### Choices made while building (for Simon)

1. **Bells under a people's name** (counsel), not a new good (above).
2. **`FatherId` stays a closed union** of catalogue ids rather than a plain string: categories are open as T8 asked, members stay compiler-checked; a new scenario's members are catalogue entries as the Caribbean's are.
3. **The engine supplies the people's council** (`ENGINE_COUNCILS.people`) when a scenario defines none, as with `PEOPLE_SELECTION`; a scenario's own `councils.people` replaces it (tested). Step 8's North-east game should define its own, with members of its peoples.
4. **One council per nation type, named members limited by `peoples`.** T8 chose councils per nation type, not per people (option (c)); a council shared by all playing peoples cannot seat a Haudenosaunee leader for the Mi'kmaq, so a member names the peoples it may sit for. `PlayablePeople.council` (a council per people) would be a small step if wanted later.
5. **Thirteen members, two named.** Membertou, named in T9, waits for a Mi'kmaw people in the catalogue (step 8). Others considered and left for review: Kondiaronk, Koñwatsiˀtsiaiéñni (Molly Brant) ([research, section 4](../research/north-east-peoples.md#4-the-peoples-council)).
6. **New hooks only where the people's economy needed them** (`wayYield`, `townStore`, `teachTurns`, `landRecovery`); the rest reuse the Congress's hooks (`foodToGrow`, `buildingOutput`, `shipMoves`, `sight`, `alwaysPromote`, `unitOffence`, `peaceAccepted`). `alwaysPromote` now also makes a people's winning townsperson a warrior. `makePeace` is a new joining effect.
7. **The Clan Mothers make births cheaper** (160 food, as Denmark's bonus in the Americas) rather than standing for their political role, which the council itself represents; their part in choosing chiefs is in the catalogue's comment, not an effect.
8. **Several source lines say "to be sourced"** for roles (the Elders, the Toolmakers, the Runners, the Keepers of the Stores' role, resting hunted land): roles need no source to exist, but their historical notes do before release (listed in [research, section 9](../research/north-east-peoples.md#9-open-items-to-be-sourced-or-checked)).

### Measurements

Every commit kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base but for its running time. The test scenario's tests pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`. A Playwright smoke of the built web game with Google Fonts blocked starts an Americas game and opens the Congress hall with no page errors ("Continental Congress", "0/25 Founding Fathers"), and draws emblem members in the hall.

## 10. Implementation (step 4, November 2026)

Built on branch `beta3/step4`. Code: `peoplediplomacy.ts` (new: who is who, the standing record from either side, first contact, proposals and answers, making the treaties, the lease of a people's land, the exchange at a people's towns, mutual defence and war, breaking faith, the round, a computer people's simple rules), `peopletrade.ts` (new: trade for gold, barter, a computer people's trade visits), `epidemics.ts` (new), `scenarios/types.ts` (`Mechanics.epidemics`, `EpidemicRules`), `types.ts` (`Colony.sickUntil`, `Colony.taughtAt`, `PeopleRelation.proposal.by`), and hooks in `combat.ts` (`declareWar`: treaties end and pact partners join; `hostile`: a playing people stands by a people nobody plays), `peopletreaties.ts` (Beta 2's round leaves a playing people's treaties alone; `defencePartner` reads only pacts with a nation), `natives.ts` (`goodRelations` for two peoples; a playing people's carriers do not sell to settlements for gold), `treaties.ts` (`partyName` names a playing people as a player), `colony.ts` and `peopleeconomy.ts` (no births while sick; elders teach a turn sooner under an exchange), `turn.ts` (the round), `ai/index.ts` (a computer people's rules), `commands.ts` (`proposePairTreaty`, `answerPairProposal`, `endPairTreaty`, `tradeWithPeople`, `barter`, `learnAtTown`). Interface: the web game's Foreign Affairs. Tests: `test/people-diplomacy.test.ts` (18 tests, with the hidden scenario `test-people-diplomacy`: the Americas with the Iroquois and the Cherokee playable, epidemics on); `test/people-player.test.ts` (32) now allows gold from European trade.

**The prices, the effects read from the people's side, the computer people's rules and the epidemics' numbers and words are drafted for Simon's review.**

### What was built

- **One treaty, read from either side (T11).** A treaty between a playing people and a nation is Beta 2's record: `nationParty(nation)` and `peopleParty(people)`, so every Beta 2 reader sees it (`peopleTreatyBetween`, Foreign Affairs' treaty list, the score's treaties). Between two peoples it has two people parties. The standing record is Beta 2's `peopleRelations`, one per pair, keyed nation first and two peoples in id order (`standingPair`); `goodRelations` reads a pair of peoples (at peace, the one nobody plays with settlements left). It is written on **first contact**: once either side has seen a town, colony or settlement of the other (`Player.explored`), checked once a round.
- **Proposals and answers, both ways.** `proposePairTreaty(from, to, kind)`: a playing people proposes to a nation or a people, or a nation to a playing people. What the proposer can know is checked first, in words (`pairTreatyProblem`: in contact, at peace, the kind allowed between the two, no such treaty, no proposal waiting, no waiting after a broken treaty, Beta 2's ladder and hidden thresholds). A **person** answers later: the proposal waits on the standing record (`proposal`, its proposer in the new `by`), the turn's messages and Foreign Affairs show it, and `answerPairProposal` accepts or declines (checked again). A **computer nation** answers as it answers a people's offer in Beta 2: `acceptPeopleOffer` (0.9) times its level's `peopleAccept`, times its level's `land`, `exchange` or `defence` share for those kinds (so Combative and Naive make no lease, exchange or pact with a people, as with peoples nobody plays). A **computer people**, or a people nobody plays, answers by Beta 2's rule: never within `landYears` of land taken from it, otherwise at `accept` (0.8) times its temperament. All drawn from the pair's own stream, the same turn giving the same answer.
- **The four kinds from the people's side** (with a European nation):
  - **Trade treaty:** unlocks on the same hidden years of good relations and trade volume as Beta 2's. Its prices go to **the side that comes to trade** (the carrier's owner): `sell` (1.2) times as much for what it sells, `buy` (0.8) times the price of what it buys (below).
  - **Land use:** the nation leases the people's **claimed land** (`Tile.claim`) in its colonies' work areas, not worked by the people's own towns (`peopleLeasableTiles`); `Tile.use` opens it to the nation's colonies (`peopleLandClosedTo` already allowed it). The rent per tile is `landUse.rent` (0.05) times the people's settlement kind's `landPrice.base` (4 gold for a village people), set when made, paid into the **people's gold** for the first year at once and on each rent day; the tiles follow the colonies on rent day; a nation that cannot pay loses the lease (it lapses, no breach), and workers on released tiles find other work.
  - **Cultural exchange:** a colonist of the nation next to one of the people's towns learns one of the people's skills there (`learnAtTown`, drawn per town and teaching), each town teaching each partner again `exchange.teachYears` (25 ± 5) after it last did (`Colony.taughtAt`, written only by this); and while the people has an exchange with anyone, its elders teach a turn sooner.
  - **Mutual defence:** a war declared on either partner is war with the other (`pactDefenders`, in `declareWar`, as an alliance's defensive pact). A people keeps a pact with one nation at a time (Beta 2's rule), and needs land use or an exchange with that nation first (the ladder).
- **Between peoples (T11): trade and defence.** Two playing peoples, or a playing people and a people nobody plays, make a trade treaty (better barter, below) and a mutual defence pact: a war declared on one is war with the other; a people nobody plays goes to war with a European attacker of its partner, its settlements gaining `defence.tension`, and a playing people goes to war with a European that attacks its partner's braves or settlements. The ladder between peoples is trade, then defence. Beta 2's round leaves treaties with a playing people alone; this step's round (`processPeopleDiplomacy`) ends them when a side is gone (lapsed), with war, or when the rung they stand on ends, and keeps the lease's rent day.
- **Breaking faith, mirrored.** Either side may end a treaty (`endPairTreaty`): it ends broken by that side, and as in Beta 2 the pair makes no new treaty for `waitingYears` (15 ± 3) and is distrusted for `hostilityYears` (25 ± 5) (`breaks`, `waitUntil`, `hostileUntil`); a war between the two breaks every treaty between them, by the side that declared it. A treaty with a people nobody plays is still ended only by the people or by breaking faith with it (Beta 2's choice 4).
- **War and peace between any players** (step 1 already allowed it; the systems table's `war`): declaring war, attacks and peace work between a people and a nation and between two peoples. A computer people makes peace with a computer side after `WAR_WEARINESS` × 2 turns of war, as computer nations do; a computer nation accepts a people's peace once tired of war (or always with the Speakers).
- **Trade for gold (T10; step 2's furs).** A carrier (a wagon train, a ship, a birchbark canoe) next to a town or colony of the other side trades there, set going by either owner (`tradeWithPeople`; a people may sell to a European ship next to its town). Prices are Beta 2's settlement prices: a people's goods at `price` × `buyPriceFactor` (furs 2 gold a unit), European goods at `nativeValue` × 2 for the good the people wants most and × 1.5 for its other wants (muskets 6 for the Haudenosaunee, cloth 5, tools 3, rounded). The buyer pays as far as its gold goes; a people's town keeps its reserve of food; the gold counts as the pair's trade volume. A playing people's carriers do not sell to settlements for gold.
- **Barter between peoples.** A playing people's carrier next to another people's town or settlement gives goods for goods of the same `nativeValue` (`barter`), the one who came getting the treaty's `sell` more under a trade treaty; muskets and horses a settlement takes arm its braves. No gold changes hands; the worth counts for the pair's standing.
- **A computer people's simple rules (until step 9):** it makes peace when tired of war; once a year each of its towns takes up to 100 spare furs to the nearest computer nation's colony within its braves' reach (`visitRange`, 6), which buys them when they fetch more in Europe and it can pay, as computer nations buy what Beta 2's braves offer (`computerTradeVisits`); every fifth turn it offers a trade treaty to each side it may make one with, and a pact to a people it trades with, at Beta 2's `offer` (0.3) times its temperament. In a 300-round computer game of the test scenario the Cherokee and the Haudenosaunee sold furs to computer colonies near them (1,264 and 432 gold in hand at the end) and each made a trade treaty with England (1577 and 1661).
- **Standing from the people's side:** `pairStanding(viewer, other)` gives Beta 2's words from either side ("No contact yet", "At war", "Distrusts you", "Remembers the broken treaty", "Partners in trade", "Barely knows you" … "Trusts you").

### Epidemics (T12)

`mechanics.epidemics: { chance, years, loss, reach }`, off in the Americas and the Caribbean, on in the hidden test scenario at the proposed 1/25, 3, 1, 8 (`epidemics.ts`):
- **After contact:** a town or colony is exposed once the other side is near: a European colony within `reach` (8) tiles of a people's town or a settlement of a people nobody plays, a people's town within `reach` of a European colony.
- **When:** at the start of each year each region (land.ts's regions, or squares of 8 tiles) has an epidemic with `chance`, drawn from the game seed for that region and year (`regionRandom`, never `GameState.rng`). It strikes **every exposed town and colony in the region, whoever owns it**: the same rules for both sides (Simon's decision).
- **What:** each loses `loss` (1) people, never its last, the person drawn from the same stream, and has no births for `years` (3) years (`Colony.sickUntil`): a people's town no birth from food, a European colony no new colonist from food.
- **The words**, plain and the same for both sides, one message to the owner:
  - "An epidemic has reached Onondaga. One of its people has died of it; the town will see no births for 3 years while it recovers."
  - "An epidemic has reached Jamestown. One of its colonists has died of it; the colony will see no births for 3 years while it recovers."
  - With more than one dead: "2 of its people have died of it"; with none (a town or colony of one): "Many of its people fall ill, but none die".
  Nothing names a cause or a culprit, no disease is named, and nothing is played for effect (australia.md, "Care with the subject").
- In 300-round computer games of the test scenario, the messages kept at the end showed between 2 and 16 towns and colonies struck, most of them European colonies near settlements: the Americas map has many settlements and few playing peoples' towns. The rate per town is for step 8 and 9 to measure.

### The interface (minimal)

Foreign Affairs gains a card for diplomacy with a playing people. For a **people**: every European nation and every other people it has met, with war or peace, its standing in words from the people's side, the treaties in force (each with an End button, which breaks faith after a confirmation), a proposal waiting for its answer (Accept, Turn down), a Propose button per kind with its reason or benefits in the title, and Declare war or Propose peace. For a **nation**: each playing people the same way, like a nation. A people sees neither the European nations' card nor the Native peoples card (both are a nation's), its own treaties are listed as its own, and it has no independence card; a nation's Native peoples card leaves out the playing peoples. Trade with a people's towns, barter and learning at a town are commands with no screen yet (step 10).

### Choices made while building (for Simon)

1. **Whose prices under a trade treaty.** Beta 2's treaty gave the nation, who always came to trade, better prices both ways (the settlement paid more and asked less). Read from either side, the same deal cannot be better for both, so **the side that comes to trade** (the carrier's owner) gets the treaty's prices: a people that sends its canoes gets 20% more for its furs and pays 20% less; a nation that sends its wagons, the reverse. The alternative is that the people always benefits (a people with a trade treaty gets better prices) and the nation never does, at its colonies or at the people's towns.
2. **Either side sets a deal going,** as Beta 1's foreign stops do: a people may sell furs into a European ship next to its town, the ship's owner paying without being asked, as far as its gold goes; a European wagon at a people's town may buy its furs and sell it goods. Between persons, a confirmation would be the next step.
3. **Prices are Beta 2's settlement prices,** not a market: furs 2 gold a unit to Europeans, European goods at their native value with the people's wants. A people earns little per fur and pays a lot for muskets, as Beta 2's settlements did; the North-east game (step 8) may want its own numbers.
4. **A computer people's trade visits** sell only furs, only to computer nations' colonies within 6 tiles, and the people buys nothing with its gold yet (step 9: muskets for its warriors, tools). Colonies a person plays are left to the person. Computer nations neither come to a people's towns to trade nor propose treaties to it; the people proposes.
5. **The exchange from the people's side** was not specified beyond "both ways": built as Europeans learning the people's skills at its towns (Beta 2's renewed teaching) and the people's elders teaching a turn sooner. The people does not learn European skills: its own units are its own (T6).
6. **The lease of a people's land** covers its claimed tiles beside the nation's colonies not worked by its own towns, at a rent from its settlement kind's land price (4 gold a tile a year); its towns may still work a leased tile left free. The rent is the people's gold, which T10 allows as gold Europeans pay.
7. **Breaking faith works by pair, not by side:** after either side breaks a treaty, neither may propose a new one for the waiting years. Beta 2's record has no "who broke it" field beyond the treaty's end; a side-specific waiting would need one.
8. **Mutual defence with a playing people is war-level, not braves-level:** a war declared on one partner is war with the other, as an alliance's defensive pact; Beta 2's braves called to a colony do not exist for a playing people (it has units and towns). A people's pact draws it into any war declared on its nation partner, where Beta 2's braves defended only near their land.
9. **Peoples nobody plays do not make treaties with each other;** only a playing people makes treaties between peoples (T11 says "playing or simple-rules"; two simple-rules peoples making treaties would change the Americas' and the Caribbean's games).
10. **Epidemics strike by region, on contact by distance.** "After contact" is read per town and colony (the other side within 8 tiles), the draw per region and year, so neighbours share an epidemic, as hard years do. The numbers (1 in 25 a year for a region in contact, one death, three years without births) are a first proposal; the North-east game's tuning and T14's continuity (`peopleShare`) will want them measured. Epidemics could also fade after a century of contact; not built.
11. **No births while sick** for European colonies too ("fewer births for some years"): their food keeps growing, and a birth follows when the sickness ends.

### Measurements

Every commit kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base but for its running time. The new tests and the people-player tests pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`, including 160 rounds of computer play with all four treaty kinds between a people and a nation and a trade treaty and a pact between two peoples, saved and loaded on the way.

## 11. Implementation (steps 5 and 6, November 2026)

Built on branch `beta3/step5-6`. Code: `movement.ts` (`knowsLand`, `knownLand`, `knowingStepCost`; `moveCost` and the path search's `stepCost`), `scenarios/types.ts` (`NationTypeSelection.knowsLand`, `NationEntry.arrives`), `arrivals.ts` (new: `laterArrivals`, `processArrivals`), `presence.ts` (new: `yetToArrive`, `nationsPresent`), `types.ts` (`GameState.arrivals`, `PendingArrival`), `game.ts` (`enterNation`, setup's per-nation code moved into it unchanged), `turn.ts` (arrivals at a round's start; `runAiUntilHuman` waits for a person's nation), `headstart.ts` (`handOver` skips a nation yet to arrive), `relations.ts` (`initRelations` skips it), `combat.ts` and `score.ts` (their "are there companies" shortcut counts the nations present), `scenarios/terms.ts` (`arrival.news`). Tests: `test/knows-land.test.ts` (5 tests, with the hidden scenarios `test-knows-land` and `test-knows-land-off`) and `test/arrivals.test.ts` (8 tests, with the hidden scenarios `test-arrivals` and `test-arrivals-too-late`). The hidden scenarios of steps 1–4 are unchanged.

### Knowledge of the land (T13)

- **A trait of the people nation type**, as scenario data: `nationTypes.people.knowsLand` (missing means on; `false` switches it off for the scenario). `knowsLand(s, owner)` is true only for a playing people's units; European nations, companies and the Crown never know the land.
- **The rule** (`knowingStepCost`, on top of `landStepCost`): a step onto a tile the unit's people knows costs at most `RIVER_MOVE_COST`. A tile is known (`knownLand`) when it is the people's own claimed land (`Tile.claim` its id, also while leased to a nation: the claim stays the people's) or land nobody claims, and it is not plowed (`Tile.p`). Railroads do not exist yet; `knownLand` is the one place to add them, beside `p`. A road, as cheap as a river (both 1), keeps its cost on anyone's land, plowed or not.
- **One cost everywhere:** `moveCost` (moving a unit, and the web game's turn markers) and the path search (`stepCost`, the search context's `knowsLand` worked out once per search) read the same function, so routes are planned on the costs units then pay. Its A* estimate stays admissible (no step costs less than 1).
- **Braves of peoples nobody plays keep Beta 2's rule unchanged** (`braveStepCost`: at most river cost only while defending). A playing people has no braves (its braves became units at setup, step 1).

### Arrivals (T18)

- **`NationEntry.arrives`** (a year): a nation of the game whose entry has it, with a year after the game's first, is **not in the game until the first turn of that year**. It has no player record at all, so it has no units, colonies, claims, turns, relations, treaties, stance or messages, and nothing on the map knows it. `GameState.arrivals` lists the nations to come, first to arrive first (ties in the order chosen), each with the turn it arrives and the entry point setup gave it (the same spacing as if every nation were there from the start). It is written only when some nation arrives later and is removed with the last arrival, so the Americas and the Caribbean are unchanged.
- **Arriving:** at the start of the round of its year (`turn.ts` `advance`, after the year turns and its "begins" message), the nation enters as nations enter at setup (`enterNation`: its player at its computer level or for its person, the difficulty where setup gives it, its Crown, three recruits, its first council candidates, its view of the entry, its caravel with a veteran soldier and a hardy pioneer, and the arrival message). It takes its place in the turn order among the nations in the order chosen, before playing peoples, companies and the Crown, and plays that round. When another player's unit or colony is on its entry point, it arrives on the nearest open water with nobody on it. Its relations with the nations there are made then (the same seeded thresholds), at peace from its year (`peaceSince`). Every other player is told: "Ships of France have reached the New World." (`arrival.news`).
- **Head starts across arrivals:** a nation that arrives during a head start arrives under the computer at the head start's level, with the person's difficulty, and is handed over with the others. A person's nation that has not arrived when a head start ends, or when a game without one begins, is played on to by the computer (`runAiUntilHuman` keeps going while a person's nation is still to come and no other person is in the game), and arrives as the person's (`handOver` leaves it to arrive; `config.humans` already names it).
- **Refused at setup:** a nation that would arrive after the game ends, and a game with nobody in it at the start (every nation arrives later and no people plays).
- **Head starts and the calendar need nothing else** (T16): one turn a year from 1000 and the head-start years are scenario data.

### Choices made while building (for Simon)

1. **Judged by the tile entered**, as terrain costs are: stepping from plowed land onto unplowed own land is cheap, the reverse is not. Judging both ends would be stricter.
2. **"Unclaimed" means no `Tile.claim`.** The land around a settlement of a people nobody plays is not claimed (`nativeLandOwner` works it out from the settlements), so a playing people knows it too. Treating it as another people's land would need a search of the settlements per step in the path search; a claim by another playing people is not known.
3. **Own land leased to a nation stays known** (the claim is the people's). Land a nation's colony claims, plowed or not, is not.
4. **A boolean on the nation type, not a modifier.** T13 called it "a modifier hook on the nation type"; reading modifiers per step in the path search is costly, and nothing (no council member, no bonus) needs to change it during a game. A hook is a small step if wanted.
5. **No player record before arrival** rather than a player flagged absent: every system (turns, the computer players, diplomacy, events, score, Foreign Affairs) already reads `s.players`, so nothing needed a new check. The few readers of `config.nations` for counts or order were checked: the turn order index (`ai/foreign.ts`), the council's cost (`fatherCost` still counts every nation of the game, arrived or not) and the tie-break orders are unchanged; the companies shortcut in `combat.ts` and `score.ts` counts the nations present.
6. **The news of an arrival** goes to every player as one plain message; a people hears it too. The words are a draft.
7. **The arrival draws from the game's random stream** when it happens (recruits, council candidates), as setup does; a game with arrivals is reproducible from its seed as any other.
8. **A person's nation arriving later without a head start** makes `createGame` play the rounds before it itself (about 500 rounds from 1000 to 1497). The New game screen (step 10) should offer such a nation with a head start to its year, or run that play in the worker as head starts are.
9. **Military victory (step 7)** can read "every nation has arrived" as `GameState.arrivals` being absent.

### Measurements

Both commits kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base. The new tests pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`.

## 12. Implementation (step 7, November 2026)

Built on branch `beta3/step7`. Code: `peoplevictory.ts` (new: the params and their defaults, `victoryParams`, the homeland records, `continuityStanding`, `goodLifeStanding`, `confederacyLeagues`, `europeansDefeated`, `militaryWinners`, `notePeopleWars`, `noteDefeat`, `PEOPLE_AI_TARGETS`), `peopleleague.ts` (new: the `league` treaty kind), `victory.ts` (the four kinds, `VICTORY_ORDER`, `orderedVictory`, both sides judged, the independence choice, `waysOf`), `score.ts` (the people's lines, `peopleScores`), `rules/score.ts` (the people's weights), `scenarios/index.ts` (`scoreWeightsFor`), `scenarios/types.ts` (`PeopleOverride.score` and `victory`, `ScenarioAi.peoples`), `scenarios/terms.ts` (`gameOver.judged`, `gameOver.way.*`, `gameOver.military`, `independence.keepPlaying`), `types.ts` (`TreatyKind` `league`, `LeagueProposal`, `gameOver.ways` and `peopleScores`, `GameState.homelands`, `leagueProposals`, `europeansDefeated`, `Player.victory`, `independenceChoice`, `lastWar`, `lastHunger`, `defeats`), hooks in `game.ts` (homelands at setup), `turn.ts` (wars noted once a round), `combat.ts` (a people's part in the war; a people's town taken keeps `takenFrom`), `peoplediplomacy.ts` (a war between members, the leagues' round, a computer people's league), `peopleeconomy.ts` (`lastHunger`), `peopletreaties.ts` (Beta 2's round leaves leagues alone), `commands.ts` (`proposeLeague`, `answerLeague`, `leaveLeague`, `answerIndependence`), `arena.ts` (`ArenaEntry.way`, `formatWays`) and `scripts/tournament.ts` (the winners' ways line). Interface: the turn-start briefing's independence question and league proposal, Foreign Affairs' league block, the final scores with each winner's way and the peoples' scores apart, and the peoples' own score table. Tests: `test/people-victory.test.ts` (19 tests, with the hidden scenarios `test-people-victory` and `test-people-victory-tuned`), and one in `test/arrivals.test.ts` (the military victory waits for arrivals); the hidden scenarios `test-people-player`, `test-people-diplomacy` and `test-arrivals` now list every victory kind in the decided order.

**The people's score weights and the computer peoples' league rule are drafted for Simon's review.** The kinds and their defaults are the note's (T14).

### How each victory works

- **The order.** Where a people plays, the scenario's kinds are judged in `VICTORY_ORDER`, `[military, independence-war, confederacy, concord, prosperity, continuity, good-life, time]`, whatever order the scenario lists them in. Without a playing people nothing changes: the first kind in the scenario's list that ends the game decides it, so the Americas and the Caribbean take the old path, byte for byte.
- **`military`** (after any round, immediate): once every nation has arrived (`GameState.arrivals` absent), every European nation and company with no colony and no land unit on the map (ships, units at sea and in Europe do not count), and the Crown only while its land units are on it. Every playing people still in the game wins together at once, ranked by the colonies it took, then the European units it beat (`Player.defeats`, counted in `attack`), then its score. `years` (0) is the rounds the defeat must hold (option (b) is a number away; `GameState.europeansDefeated` keeps its first round while it runs). No guard for a nation's last colonies (Simon). Computer peoples never aim at it; `ai.peoples.militaryWins` (`PEOPLE_AI_TARGETS`, 0.01) is the ceiling tournaments measure.
- **`independence-war`**: a computer nation that wins its War of Independence takes the win at once. In a game with a playing people the nation is finished with its win recorded (`Player.victory`) and play goes on to the end year, where it is listed among the winners; if persons are in the game and none is left playing, the game ends then, the recorded wins its winners. A **person** whose nation wins while at war with any people (a playing people, or a people nobody plays with settlements left) is asked whether to keep playing (`Player.independenceChoice`; `answerIndependence`; the web game asks in the turn-start briefing): no, the victory as usual (without a playing people the game ends as before; with one, the win is recorded); yes, play goes on, the independence kept, the nation not finished, and the game ends by the other kinds or the end year. Until the person answers, the game goes on.
- **At the end year** every kind is asked and each player judged once, by the first kind that names it: a league wins as a league, an alliance as an alliance, before anyone's single win. `time` names the best-scoring European only if no European won another way (a recorded independence included), and never a people. `gameOver.winners` lists them in the order judged, `gameOver.ways` names each one's way, `gameOver.scores` keeps the Europeans' scores and `gameOver.peopleScores` the peoples'. The reason joins one verdict per way: "The year 1850 has come and the age of colonization is over. The Haudenosaunee win by continuity, still on their homeland; England wins with the highest score."
- **`continuity`**: a playing people with a town on its starting homeland, `homelandShare` (0.5) of it kept, its regions' health at least `landHealth` (40) on average where land health is on, at least `peopleShare` (1) of its people at the start, not submitted, no town of its own held by another player, and `members` (1) council members.
- **`confederacy`**: a league of at least `members` (3) peoples, in force `years` (50), its members together keeping `homelandShare` (0.5) of their homelands. Its playing members win together, ranked by their score; its members nobody plays are named as partners (`gameOver.partners`).
- **`good-life`**: every town holding `storeYears` (1) years of food (as far as its stores keep), no town hungry in `hungerYears` (20), its homeland's health at least `landHealth` (60), no war for `peaceYears` (30), no treaty broken by it in `faithYears` (30), and a treaty with `treatyShare` (0.5, at least one) of the nations and peoples met.
- **Params** come from the victory entry's `params` over the engine's defaults (`CONTINUITY`, `CONFEDERACY`, `GOOD_LIFE`, `MILITARY`), and a people's own over those (`peoples.overrides[id].victory[kind]`).
- **Records**, written only in games with a playing people: `GameState.homelands` at setup (a playing people's claimed land and its people; a people nobody plays its settlements' tiles and land), `Player.lastWar` (each round a playing people is at war), `Player.lastHunger` (a town went hungry), `Player.defeats`, and `Colony.takenFrom` for a people's town taken.
- **`waysOf(s)`** reads `gameOver.ways`, or works the ways out for a game without a playing people (an earlier end is a War of Independence, partners prosperity, several winners concord, otherwise time). The game-over screen and the arena use it; every tournament run prints "Winners' ways".

### The league (T14's confederacy)

`league` is a treaty kind with several people parties, as Beta 1's `alliance` has nations. It exists where `mechanics.peopleTreaties` names `defence` and the scenario plays for `confederacy`. A playing people proposes a new league to two or more peoples, or, as a member, invites a people into its own (`proposeLeague`). A people may join when it belongs to no other league, is at peace with every member, holds a mutual defence pact with at least one of them, and stands well with all: Beta 2's record written, good relations now, no waiting or distrust after a broken treaty. Computer peoples and peoples nobody plays answer at once by Beta 2's rule (`accept` times the temperament, never within `landYears` of land taken), from the pair's own stream; a person answers later (`GameState.leagueProposals`, `answerLeague`), and the league is made when every person invited has said yes, the conditions checked again. A member that declares war on another leaves (combat.ts through `onPairWar`), a member gone from the map leaves, a member may leave by choice (`leaveLeague`), and a league left with one member ends. Beta 2's round of treaties leaves leagues alone. A computer people (until step 9's profiles) proposes, every fifth turn at its `offer` chance, a league to the peoples it holds pacts with and their own pact partners, or invites a pact partner into its league.

### The people's score (drafted for review)

| Line | Weight (`SCORE_WEIGHTS`) | Counts |
| --- | --- | --- |
| People | `peoplePerson` 1 | units and town folk |
| Homeland kept | `peopleHomeland` 0.5 | starting homeland tiles still kept |
| Health of the land | `peopleLandHealth` 0.5 | times the homeland's average health (0–100), only with land health |
| Stores | `peopleStoreYear` 5 | years of food held, town by town, each at most `peopleStoreCap` 2 |
| Treaties | `peopleTreaty` 3 (Beta 2's) | treaties in force, any kind, a league included |
| Trust | `peopleTrust` 5 | nations and peoples whose standing reads "Trusts you" |
| Council | `peopleCouncil` 5 | council members |

No gold, buildings or production. A scenario changes the weights as the others (`Scenario.score`), a people its own (`peoples.overrides[id].score`, `scoreWeightsFor`). A people's score is not in `finalScores`, so concord's share, prosperity's best score and `time` read the Europeans' only; it ranks peoples among themselves (`peopleScores`). In the computer games below the peoples ended with 73 to 235 points (median 130), against Europeans' several hundred.

### Choices made while building (for Simon)

1. **A nation that has never founded a colony is still arriving, not defeated.** At the start every nation's expedition is at sea, with no colony and no land unit on the map: read literally, the military victory would end every game in its first round. A nation counts as defeated only once it has founded a colony (`coloniesFounded`). Units ashore before a first colony keep it present anyway.
2. **The question about independence does not hold up the game.** The person is asked in the turn-start briefing (a required decision); the engine waits on the answer but play goes on meanwhile, as with a tax raise.
3. **"No" in a game with a playing people records the win and ends the game only if no person plays on.** The note's "as usual" read as: the nation is finished with its win, as a computer nation's; a person who plays only that nation has nothing left to play, so the game ends then with the recorded wins (the peoples are not judged). A person who also plays a people plays on.
4. **"Yes" records no win.** The independence is kept (its score's bonus stays), and the nation may still win by another kind or by score at the end.
5. **Good standing for a league** is Beta 2's record with good relations now and no waiting or distrust; two peoples nobody plays keep no record between them and count as in good standing while at peace.
6. **Leaving a league by choice breaks no faith** (no waiting or distrust); declaring war on a member takes the declarer out.
7. **A people's homeland** is a playing people's claimed land at setup, or, for a people nobody plays, its settlements' tiles and land; continuity's "kept" counts tiles claimed by the people or by no one (leased land stays its own), a people nobody plays its settlements' land still.
8. **The peace of a good life** is checked once a round (a war begun and ended within one round is not seen).
9. **No league needs its playing members to agree to a newcomer:** the member that invites speaks for the league, as an alliance's member does.
10. **The tournament prints one line more** ("Winners' ways"); the rest of its output is unchanged.

### Indicative rates (computer-only games; tuning is step 9)

79 computer-only games to 1850 on the hidden test scenarios' setups (three computer nations, England, France and the Netherlands at rotating levels, seeds 5000–5023 and 6000–6047; 41 seeds were skipped because the generated map had no Haudenosaunee or Cherokee settlements): 16 with the Haudenosaunee playing (`test-people-player`'s setup), 47 with the Haudenosaunee and the Cherokee and epidemics (`test-people-diplomacy`'s), 16 with France arriving in 1500 and the Netherlands in 1505 (`test-arrivals`'). 126 peoples played in all.

| Way | Peoples winning that way | Peoples qualifying at the end |
| --- | ---: | ---: |
| `military` | 0 games of 79 | — |
| `confederacy` | 0 | 0 (no pact between two peoples was ever made) |
| `continuity` | 119 of 126 | 119 |
| `good-life` | 6 of 126 (where continuity failed) | 44 |
| none | 1 of 126 | — |

- **Military wins: none in 79 games.** Sampled every tenth turn after the 1590s, never more than one of the three European nations was without a colony (that happened for a while in 4 games). The ceiling (1 in 100) is far from reached; with computer peoples that only defend, it is only theoretical, as decided.
- **Continuity is nearly always met** (119 of 126): computer peoples' towns grow by births, keep their land on the Americas map, and seat a council member early. The only failures were too few people (7, all with epidemics on). The note's target for a peaceful people's win is about 1 game in 5; step 9 (or the North-east scenario's params) should make it harder, for example `peopleShare` above 1, a larger `members`, or a homeland measured against more land.
- **A good life** qualifies 44 of 126 times; it fails mostly on treaties (71: computer peoples make few), then stores and hunger (13 each).
- **Confederacy never**: computer peoples make no pacts between peoples on this map (they are far apart and trade little), so no league forms. The league is tested by hand.
- Europeans in the same games: 67 nations won their War of Independence (recorded, and listed at the end), 21 won by score, 5 by prosperity and 5 by concord (3 games).

### Measurements

Every commit kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base but for the new "Winners' ways" line (concord 2, prosperity 4, time 19). The new tests and the people tests pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`.

## 13. Implementation (step 8, November 2026)

Built on branch `beta3/step8`. Code: `maps/north-east.ts` (new: the map, its regions, `northEastTile`, `NORTH_EAST_PEOPLES`, `NORTH_EAST_RENEWAL`), `scenarios/north-east.ts` (new: `NORTH_EAST`, `NORTH_EAST_CALENDAR`), `events/north-east.ts` (new), `peoplemoves.ts` (new: peoples who come to a region or leave it), `rules/nations.ts` (nineteen peoples, `NorthEastPeopleId`), `rules/fathers.ts` (Membertou, Kondiaronk; the Haudenosaunee-only members also offered to `haudenosaunee`), `maps/index.ts` (`StoredMap.regions`, `MapRegion`, `mapRegionGrid`; a region with a later `from` is left out at setup), `land.ts` (regions from a stored map, `regionName`, `regionRenewal`), `epidemics.ts` (the same regions), `scenarios/types.ts` (`PeopleRegion.from` and `until`, `StoredMapEntry.renewal` and `entries`, `ScenarioAi.dates`, `PeopleOverride.storeYears`), `scenarios/index.ts` (`aiTurn` by dates), `game.ts` (a nation's own entry point), `turn.ts` (the year's people moves), `arena.ts` and `scripts/tournament.ts` (playing peoples, `ArenaPeopleEntry`, `ArenaPeoplesGame`, `peoplesGame`, `formatPeoples`, `--peoples`). Tests: `test/scenarios/north-east-map.test.ts` (10 tests: the geography against real coordinates) and `test/scenarios/north-east.test.ts` (10 tests: the scenario, arrivals and entry points, councils, dates, land regions, people moves, the arena, and a game played by the computer through the first arrivals, saved and loaded); `test/maps.test.ts` leaves a map whose scenario plays peoples to its own tests; the conformance tests cover the scenario.

**Drafted for Simon's review: all of it that is history.** The peoples (their names, lifeways, homelands on the map, the years the Dorset leave and the Inuit come, the St. Lawrence Iroquoians' year), their values (score weights, stores), which are playable, their town names, the two new council members, the nations' arrival years, entry points, ports, bonuses and colony names, the events, the terms, the regions and their renewal rates. The history and its sources, with what is "to be sourced" or "to be checked", are in [research/north-east-peoples.md](../research/north-east-peoples.md); below are the game's data built on it.

### The map

- **Extent and scale:** 82° W to about 49.8° W and 58.5° N to 40° N, on squares, **84 by 74 tiles** (3,368 land tiles): Newfoundland and Labrador to Hebron and the Torngats, the east coasts of Hudson Bay and James Bay, the Gulf and the St. Lawrence, the Maritimes, New England, the Hudson to New York Bay, and the Great Lakes from Lake Huron's east shore to Lake Ontario. Equirectangular, 0.25° of latitude a row and 0.383° of longitude a column: a tile is about 28 km (33 km in the south, 22 km in the north). The full description and every correction are in the map file's comment.
- **Drawn from data:** the Natural Earth 1:10m land, minor islands and lakes (natural lakes only: the modern reservoirs, Smallwood, Manicouagan, Caniapiscau, La Grande and others, are left out; Lac Saint-Jean and Lake Abitibi, natural lakes later raised, are kept), sampled 25 times a tile, land at 40%, every island of 150 km² or more kept. Corrections by hand, each named in the file: the St. Lawrence estuary kept open as water to the Île d'Orléans (ships reach Stadacona, as Cartier's did; above Quebec the river is a major river), the Strait of Belle Isle, Lake Melville's narrows at Rigolet and Long Island Sound kept open, Lakes Champlain, Simcoe, Nipissing and Mistassini kept as water though narrower than a tile, Cape Cod, St. John's and Upper New York Bay restored.
- **No corner-only straits or isthmuses (hex-maps.md H11):** wherever land touched land only at a corner across water, the tile whose land share was nearest the threshold was changed; the map test checks every 2×2 block. Rivers are waypoints (thirty-one rivers: the St. Lawrence, Ottawa, Saguenay, Saint-Maurice, Richelieu, Hudson, Mohawk, Connecticut, Merrimack, Kennebec, Penobscot, Saint John, Miramichi, Restigouche, Exploits, Humber, Churchill, Natashquan, Moisie, Manicouagan, Péribonka, Niagara, Grand, French, Trent, Genesee, Oswego, Eastmain, Rupert, La Grande and Gatineau).
- **Terrain** at this scale (map comment): mixed forest (plains) from the St. Lawrence valley and Huronia south, broadleaf (prairie) south of 42° N, open land in the valleys and around the Iroquoian towns; conifer forest (grassland) on the Shield and in the Maritimes, Gaspé and northern New England; boreal forest (tundra) in Newfoundland, Labrador and the north, open tundra north of the tree line; mountains, hills and marshes where the atlas has them. Mountains and hills were placed from named ranges and peaks (Natural Earth's geography regions and elevation points), not from an elevation grid (none was reachable from here).
- **Compromises:** Cape Breton joined to Nova Scotia (the Strait of Canso is about a kilometre), Long Island to the mainland at its west end, Martha's Vineyard to Cape Cod; Lakes Ontario and Erie joined to the sea only by rivers; Hudson Bay and James Bay seas of their own (Hudson Strait is off the map); the Susquehanna and the Delaware, which leave the map southwards, left out. High seas: open sea three or more tiles from land on the Atlantic side, never in the Gulf or the bays.
- **Regions (land health, hard years, epidemics):** fifty, each the land nearest a named centre on the same land mass, its waters with it (a coast and its fishing share their years): from "The east coast of Hudson Bay" and "The northern Labrador coast" to "Huronia and Lake Simcoe", "The Finger Lakes", "Cape Breton Island (Unama'ki)", "Prince Edward Island (Epekwitk)" and "Long Island" (the list is in the map file and in [research, section 7](../research/north-east-peoples.md#7-regions-and-the-map)). They range from 6 to 314 land tiles. **Renewal rates** (`NORTH_EAST_RENEWAL`, 4 to 116 furs and game a year) follow each region's land: 0.6 a tile of the southern forests, 0.5 of conifer forest and marsh, 0.4 of boreal forest and hills, 0.25 of open tundra, 0.1 of mountains. Drafted for review; step 9 measures them.

### The peoples (T20), drafted for Simon's review

Nineteen peoples in the catalogue, north to south. Names are the peoples' own where well established; archaeological names are marked (their names, notes, homelands and sources: [research, section 1](../research/north-east-peoples.md#1-the-peoples)). Lifeways are today's fixed-settlement ones (T20): the farming peoples in villages, the hunting and fishing peoples in camps (their seasonal round is Australia's later `seasonal` lifeway). Settlements are two tiles apart (about 55 km). **Playable (T4):** the Haudenosaunee, the Wendat, the Mi'kmaq and the Innu, two farming confederacies of the Great Lakes and two peoples of the coast and the north.

| People (id) | Lifeway | On the map (`NORTH_EAST_PEOPLES`) |
| --- | --- | --- |
| Dorset (`dorset`), an archaeologists' name | camps | northern Labrador coast, Nunavik's Hudson Bay coast; **until 1350** |
| Inuit (`inuit`) | camps | the same coasts, **from 1400** |
| Eeyou (`eeyou`) | camps | east of James Bay |
| Innu (`innu`), **playable** | camps (towns) | Saguenay and Tadoussac, the north shore, the Labrador interior |
| Beothuk (`beothuk`) | camps | Newfoundland |
| Algonquin (`algonquin`) | camps | the Ottawa valley |
| Mi'kmaq (`mikmaq`), **playable** | camps (towns) | Nova Scotia, Cape Breton, eastern New Brunswick, Gaspé |
| Wolastoqiyik (`wolastoqiyik`) | camps | the Saint John valley |
| Penobscot (`penobscot`) | camps | the Penobscot |
| Abenaki (`abenaki`) | villages | the Connecticut and Champlain valleys |
| Wendat (`wendat`), **playable** | villages (towns) | Huronia |
| St. Lawrence Iroquoians (`stLawrenceIroquoians`), a scholars' name | villages | Stadacona, Hochelaga, the upper river; **until 1580** |
| Attawandaron (`attawandaron`) | villages | between the Grand River and the Niagara |
| Haudenosaunee (`haudenosaunee`), **playable** | villages (towns) | the Mohawk valley to the Genesee |
| Mohican (`mohican`) | villages | the upper Hudson |
| Massachusett (`massachusett`) | villages | Massachusetts Bay |
| Wampanoag (`wampanoag`) | villages | Cape Cod, the islands, east of Narragansett Bay |
| Narragansett (`narragansett`) | villages | west of Narragansett Bay |
| Munsee (`munsee`) | villages | the lower Hudson and Manhattan |

- **Their own values (T10, T14), per people:** the Haudenosaunee weigh their council and treaties more (`peopleCouncil` 7, `peopleTreaty` 4), the Wendat trust and treaties (`peopleTrust` 7, `peopleTreaty` 4) and keep a larger store (`storeYears` 1.5), the Mi'kmaq and the Innu the land's health and their homeland (`peopleLandHealth` 0.8, `peopleHomeland` 0.7; the Mi'kmaq also `peopleTrust` 6), the Innu stored food less (`peopleStoreYear` 3). A first reading of the sources ([research, section 1](../research/north-east-peoples.md#1-the-peoples)); no temperaments are set.
- **Peoples who come and go** (`PeopleRegion.from` and `until`, `peoplemoves.ts`): the Dorset leave northern Labrador and Nunavik's coast in 1350, the Inuit come in 1400, the St. Lawrence Iroquoians leave in 1580 (why these years, and the fifty-year gap: research, section 1). Nothing names a cause. A playing people never leaves (if the St. Lawrence Iroquoians were playable, they would stay: tested).
- **The Haudenosaunee have a catalogue entry of their own** (`haudenosaunee`), beside the Americas' `iroquois`: sentences read the catalogue's name, and renaming the Americas' entry would change its games' messages. The Clan Mothers, Garakontié and Thayendanegea are offered to both ids. **Superseded by section 18:** one id, `haudenosaunee`, everywhere; the Americas show it as "Iroquois".
- **Town names** for the playable peoples' later towns (`PlayablePeople.townNames`): Haudenosaunee towns of the 17th and 18th centuries, Wendat towns the Jesuits recorded, Mi'kmaw names of places of Mi'kma'ki in use today and Innu communities by their Innu names; the lists are in research, section 1. Using today's community names for towns of earlier centuries is a choice to review.

### The council (T9), drafted for Simon's review

The scenario's people's council is the engine's (section 9) with two named leaders, each offered only to its own people and drawn as an emblem (who they were, and their sources: [research, section 4](../research/north-east-peoples.md#4-the-peoples-council)):
- **Membertou** (Mi'kmaq): *Players at war with you always accept peace* (`peaceAccepted`). His role as a healer and spiritual leader in the French accounts is not used.
- **Kondiaronk** (Wendat): *Every war you are in ends in peace* (`makePeace` on joining).
- The Innu have no named member: no leader of theirs is documented well enough for an effect (Anadabijou was considered and left out). The Congress is the Americas' less Cortés, Coronado, de Soto, Sepúlveda and Bolívar.

### The Europeans (T18), drafted for Simon's review

| Nation | Arrives | Its ships arrive (`StoredMapEntry.entries`) | Port | Bonus |
| --- | :-: | --- | --- | --- |
| England | 1497 | off the Gulf of Maine, between Nova Scotia and New England | Bristol | immigration (as the Americas) |
| Portugal | 1500 | off the Avalon (the Grand Banks) | Lisbon | navigators: ships +1 move |
| France | 1534 | south of Cabot Strait, at the Gulf's mouth | Saint-Malo | cooperation (as the Caribbean) |
| Spain | 1536 | the Atlantic mouth of the Strait of Belle Isle | San Sebastián | a second caravel (the whaling fleets) |
| the Netherlands | 1614 | off New York Bay | Amsterdam | trade (as the Caribbean) |

Who came in each year (Cabot, Corte-Real, Cartier, the Basque whalers, Block), with sources: [research, section 5](../research/north-east-peoples.md#5-the-europeans). Both nation sets are these five (no alternative history yet); the Dutch West India Company (1621) and the Hudson's Bay Company (1670) can be chartered. Colony names start with places each founded or named, then go on in its colonists' style (the lists, and the Basque harbour names still to be checked, in research, section 5). **The entry points are new** (`StoredMapEntry.entries`): with the map's spacing along the east edge, every nation landed off Newfoundland and founded all its colonies on its tundra (measured: 16 of 16 colonies in one game); England's, France's and the Netherlands' own entry points take them to Nova Scotia, New England, the Gulf and the Hudson.

### The scenario

- **Calendar (T16):** one turn a year, 1000 to 1850 (851 turns), head starts to 1250, 1490, 1600 and 1700.
- **Victory:** `[military, independence-war, confederacy, concord, prosperity, continuity, good-life, time]`, every kind with the engine's defaults (step 9 tunes them).
- **Mechanics:** every European system on as in the Americas (taxes, the Crown, the Royal Expeditionary Force, independence, Favoured Nation, the charter, companies, alliances, the confederation), Beta 2's four people treaties, and the peoples' economy: hard years (1 in 8), land health by the map's regions (recovery 5, floor 0.2), epidemics on (T12: 1 in 25, 3 years, 1 person, 8 tiles).
- **Gardens** grow on the map's plains and prairie (`peopleEconomy.gardens`): from the St. Lawrence valley and Huronia south, never in Newfoundland or on the Shield (tested).
- **The computer Europeans keep to the Americas' dates** (`ai.dates`, new): their turn thresholds (explore until, wars after, independence plans) are the Americas' years, so the 500 turns before 1497 do not count as their game.
- **Events** (`events/north-east.ts`): the Americas' historical and random events (Europe's news, the colonies' mishaps) and two of the region's own: the fishing fleets on the Grand Banks (1540–1580, a fisherman stays) and the year without a summer (1816, food −40% for a year). Hard years and epidemics are the region's other hardships, as mechanics. No event makes light of the epidemics, the wars or the loss of land. Their history: [research, section 6](../research/north-east-peoples.md#6-events-and-terms).
- **Terms:** the title screen's lines and tagline. No Norse, Greenland or Vikings anywhere (T17; tested).
- **Hidden, for now:** every European nation arrives after 1000, so a game needs a playing people at its start (setup refuses one without), and the New game screen cannot offer a people until step 10. Registered hidden; `npm run tournament -- --scenario north-east` plays it. A whole computer game takes about 5 seconds, so a head start to 1490 or a person's nation arriving without a head start would not hang the screen once it can start the scenario.

### Choices made while building (for Simon)

1. **Haudenosaunee as a new catalogue id** (above), not a renamed `iroquois` (superseded by section 18: the two are now one id, `haudenosaunee`).
2. **Spacing two tiles** between settlements: with three, the Five Nations had room for three or four towns and the Narragansett none.
3. **`PeopleRegion.from` and `until`** (new) to bring the Inuit and to let the Dorset and the St. Lawrence Iroquoians go; the alternative, leaving the Dorset out and the Inuit there from 1000, rewrites the north's history.
4. **Own entry points per nation on a map** (new, above), since the tournaments showed every colony on Newfoundland's tundra without them.
5. **`ai.dates`** (new) rather than `pace`: the Europeans' arc starts in 1497, not in 1000.
6. **The map's regions as a second text grid** (`StoredMap.regions`), so Beta 4's conversion can carry them with the terrain; the renewal rates are the scenario's, not the map's.
7. **The arena reports only nations that arrived** when a game is stopped early (a nation still to come has no player).
8. **No bench hashes for the North-east yet:** the bench plays nations only; a playing people needs `GameConfig.peoples` there. The scenario's tests compare a saved and loaded game.

### Indicative rates (computer-only games; tuning is step 9)

`npm run tournament -- --scenario north-east --games 24 --turns 851 --play-on --events --seed 3000`: 24 games to 1850, four of the five nations each game at rotating levels, the four playable peoples playing.

| Way | Games in which someone won that way |
| --- | ---: |
| `military` | **0 of 24** (the ceiling is 1 in 100) |
| `independence-war` | 3 |
| `confederacy` | 0 |
| `concord` | 0 |
| `prosperity` | 8 |
| `continuity` | 24 (all 96 peoples) |
| `good-life` | 0 |
| `time` | 13 |

- **Peoples surviving: 96 of 96** (every playing people still on its land in 1850). Towns at the end: the Haudenosaunee 4.9, the Wendat 3.0, the Mi'kmaq 5.0, the Innu 6.0; their people grew from 17 to 87, 11 to 47, 17 to 46 and 20 to 64. Continuity never failed; a good life failed on treaties (47 of 96), stores (28) and hunger (21). As in step 7, continuity is far too easy and nobody leads a league: step 9.
- **European colonies at the end** (per nation and game): England 5.7, Portugal 6.4, France 5.2, Spain 8.1, the Netherlands 6.6; 9 to 18 colonists per nation on average (the Americas' tournament: 69 to 118). The Europeans arrive late (England has 353 turns to 1850, the Americas' nations 609) on poorer land, and computer Europeans are not tuned for it: three won their War of Independence, twelve lost it.
- **Speed:** 5.0 seconds a game on average (3.5 to 8.8), three games at a time on this machine; a game played alone with the AI and index checks took 29 seconds.

### Measurements

Every commit kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base. The new tests pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`, and a full 851-turn North-east game with four computer nations and the four peoples ran with both checks on.

## 14. Implementation (step 9, November 2026)

Built on branch `beta3/step9`. Code: `ai/people.ts` (new: a computer people's turn), `ai/profiles.ts` (`PeopleProfile`, `PEOPLE_PROFILES`, `peopleProfileOf`), `peopletrade.ts` (trade visits that sell food and buy European goods, `computerBarter`), `peoplediplomacy.ts` (`peopleProposals` by profile; a computer people's answers times its profile's `accept`; the old `peopleComputerDiplomacy` replaced), `peopleleague.ts` (a computer people's answer to a league by profile), `peopleeconomy.ts` (`storeYearsOf` by profile, `planTownBuild` from the profile's plan, `useTools`, `TOOLS_PER_TURN`), `colony.ts` (iron tools put to a town's building work; `townJobValue` exported), `scenarios/types.ts` and `scenarios/index.ts` (`ScenarioAi.stretch` in `aiTurn`), `scenarios/north-east.ts` (the tuning below), `arena.ts` (peoples at rotating levels, their end state, the table by level). Tests: `test/people-ai.test.ts` (9 tests, with the hidden scenario `test-people-ai`: the Americas with the Iroquois and the Cherokee playable on a land that renews nothing); `test/people-victory.test.ts` plays its computer peoples at levels that join leagues; `test/scenarios/north-east.test.ts` reads the stretch and the peoples' levels in the arena.

**The profiles and every tuned number are drafted for Simon's review.**

### The profiles (T15)

How levels are assigned: as for nations, `GameConfig.ai[id]` (Naive when absent). Until now no caller set it, so every computer people played the same simple rules; the arena now gives each playing people one of the run's levels, rotating with the games as the nations' levels do, so a four-level tournament plays each level once a game.

| | Naive (grows) | Competent (balances) | Combative (defends, raids) | Creative (trades, treaties) |
| --- | --- | --- | --- | --- |
| Reserve (`stores`, times `storeYears`) | 1 | 1 | 0.5 | 1 |
| Town builds (`plan`, the first it can) | longhouses, pits, workshop, landing, smokehouse, palisade | pits, longhouses, palisade, landing, workshop, smokehouse | palisade, pits, longhouses, workshop, landing, smokehouse | pits, longhouses, landing, workshop, smokehouse, palisade |
| Restraint on the land (`restraint`) | never (follows the price) | hunters held within renewal under health 90 | under 60 | under 90 |
| Trade visits once a year | furs; food to a colony short of it | furs; buys tools, muskets, cloth | furs; buys muskets, horses, tools | furs; buys tools, cloth, trade goods, muskets |
| Barter with other peoples a year (`barter`) | 0 | 1 | 0 | 2 |
| Proposals (`offer` × Beta 2's 0.3), answers (`accept` × 0.8) | 0.5, 1 | 1, 1 | 0.5, 0.7 | 2, 1.2 |
| Treaties proposed to nations | trade | trade, exchange, defence | trade | all four, land use too |
| Trade treaties and pacts with peoples | trade only | both | both | both |
| League (T14) | keeps out | joins one it is offered | keeps out | leads one once it holds pacts |
| War | defends | defends | raids: war on a European whose colony stands within 5 tiles of its towns, with a warrior in every town and 30 years of peace behind it; arms idle townspeople with muskets | defends |
| Peace after (`peaceAfter`, years) | 12 | 8 | 20 | 5 |
| Edge to attack (`margin`) | 1.2 | 1.2 | 0.9 | 1.2 |
| Land claimed a year (`claims`) | 0 | 1 | 2 | 1 |

Common to every level, every turn: warriors standing in a town take up its muskets, then its horses (the soldier and dragoon roles); armed units attack an enemy unit beside them **outside any colony** (no profile ever attacks a colony, so none aims at the military victory). Once a year: the trade visit and barter, restraint, food first (a town that eats more than it gets moves a worker from building work to food), claims, and (Combative) the raid. Elders keep teaching by step 2's rules (the setup's elder stays in the longhouse; no profile choice was needed). Iron tools: a people's town puts up to 4 tools a turn into its building work (`useTools`, for a person's people too: T10's "taken up as they served").

Counted over 8 North-east games while tuning (per people and game): proposals Naive 0.5, Competent 7, Combative 1.3, Creative 13; barter visits Competent 174, Creative 349; tools bought Naive 57, Competent 93, Combative 28, Creative 15 units, muskets Competent 53–113, Combative 81; wars declared by Combative 3.1 a game, each ending in peace; leagues led only by Creative.

### Tuning (North-east scenario data)

| What | Before | After | Why |
| --- | --- | --- | --- |
| `mechanics.epidemics.chance` | 1/25 | 1/75 | At 1 in 25 a year per region in contact, every colony and town was struck about every 25 years. Among settlements everywhere, the Europeans' small colonies lost more colonists to it than they gained by births: with epidemics off the advanced levels reached 33–49 colonists, at 1/25 13–20. Same rules for both sides (Simon's decision); the peoples, at their towns' housing, hardly feel the difference. |
| `ai.stretch` (new) | — (1) | 1.5 | The computer Europeans read the Americas' dates (`ai.dates`), so Creative took up an independence plan from 1626 and Competent from 1666 with a handful of colonists, and lost: their colonies went to the Crown. With 1.5 those plans come in 1693 and 1753 (+4 to +7 colonists for the advanced levels). Read only with `dates`, so the Americas and the Caribbean are untouched. |
| continuity `landHealth` | 40 | 97.5 | Continuity was met by every people in every game (192 of 192). Its other conditions cannot tell peoples apart here: the homeland is always fully kept (a playing people's claimed land is closed to colonies, and leased land counts as kept), people grow from about 17 to 50–90 by births, and the council fills all the seats open to the people by 1850 (13 for the Haudenosaunee, 11 for the Wendat and the Mi'kmaq, 10 for the Innu: `members` would just pick the Haudenosaunee). Only the homeland's land varies, so continuity asks for land all but untouched. |
| good life `landHealth`, `hungerYears`, `treatyShare` | 60, 20, 0.5 | 93, 100, 0.75 | A good life qualified for about 45% of computer peoples once the profiles made treaties; it now asks land kept whole, a century without a hungry year and treaties with three in four of those met. |
| confederacy | defaults | defaults (3 peoples, 50 years) | Leagues now form; at the defaults they win in about 1 game in 10. |
| profiles' `restraint` | T10 drafted 70 (Creative, Competent) and 40 (Combative) | 90 and 60 | At 70 the levels' land ended alike (health 80–85 for all); at 90 Creative and Competent keep 86–87 against Naive's 78–80, so the land conditions reward restraint. |

Tried and dropped: a higher first-landing score and a weight against tundra for the Europeans' site choice (`ai.landing`, `ai.siteTerrain`): their colonies went elsewhere but grew no larger (±2 colonists), so neither was kept. Epidemic reach 4 instead of 8 did about as much as 1/50. Hard years off would add little (+2); land health off +6 (not changed: decided mechanics).

### Rates against the targets

`npm run tournament -- --scenario north-east --games 24 --turns 851 --play-on --events --seed 3000` and `--seed 4000` (48 games, 192 computer peoples, four levels for both sides), before (step 8's code; all peoples then played the same simple rules) and after:

| Target (T15, T14) | Before (seed 3000 / 4000) | After (3000 / 4000) | Together |
| --- | --- | --- | --- |
| A people wins in about 1 game in 5 | 24 of 24 / 24 of 24 (continuity, every people) | 8 of 24 / 2 of 24 | **10 of 48 (21%)** |
| Each computer people survives in ≥ 3 games of 4 | 96 of 96 / 96 of 96 | 96 of 96 / 96 of 96 | **100% for each** |
| Leagues and confederacy sometimes | none / none | confederacy won in 5 games / a league at the end in 1 game | **confederacy 5 of 48 games (about 1 in 10)** |
| Military victory ≤ 1 in 100 | 0 / 0 | 0 / 0 | **0 of 48** (and none in any tournament of this step) |

Ways (after): confederacy 5 games, continuity 3 peoples (Innu 2, Mi'kmaq 1), good life 2 (Innu); by level, Creative 9 of the 10 people wins (all 5 confederacies), Competent 1, Naive and Combative none: T15's "Creative trades and makes treaties" is the level that wins by the peaceful ways. On fresh seeds (5000, 6000; 48 games, with continuity at 97) 15 of 48 games had a people's win, so the rate is noisy around 1 in 4 to 1 in 5. Failing at the end (192 peoples): continuity on land 188; a good life on land 154, treaties 116, hunger 89, stores 69, peace 33.

Peoples by level (after, 48 games each): treaties in force at the end Naive 1.9, Competent 3.7, Combative 1.2, Creative 5.1; land health 79, 87, 81, 87; people 71, 69, 64, 65 (Combative's half reserve costs it people to hunger); gold in hand 2,600, 2,200, 2,200, 2,800 (they now spend on tools, muskets and cloth, but the colonies within reach have little to spare).

### The Europeans in the North-east

Target: a meaningful presence, about twice step 8's, with Competent and Combative at 30 colonists or more by 1850 (the Americas' advanced levels have 50–90 at the same number of turns played; the North-east's nations play 236–353 turns on poorer land). Results (colonists per nation at the end, seeds 3000 / 4000):

| Level | Before | After |
| --- | --- | --- |
| Competent | 18.0 / 18.3 | 33.1 / 33.0 |
| Combative | 17.5 / 19.0 | 32.8 / 30.3 |
| Creative | 13.2 / 15.0 | 24.8 / 26.1 |
| Naive | 9.3 / 10.2 | 12.0 / 12.8 |

Colonies per nation rose from 5.2–8.1 to 6.1–9.7 (each nation), the advanced levels' from 5.5–8.3 to 7.1–10.7. Creative stays below 30: it still declares independence early (5 won, 8 lost in 48 nations) and a lost war leaves its colonies to the Crown. Naive barely moves (it reads no dates and expands slowly on its own).

### Speed

7.0 and 7.2 seconds a game on average (4.9–11.1), three games at a time on this machine, against 4.9 and 5.2 before: the computer peoples' turns (colony reports for restraint and food, the trade visits, proposals) and the Europeans' larger colonies. A North-east tournament with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` (8 games, seed 5000) gives the same tables as without.

### Choices made while building (for Simon)

1. **Continuity is tuned on the land alone (97.5).** In computer-only North-east games the peoples are seldom pressed: their claimed land is closed to colonies (so `homelandShare` never binds), they grow four- to fivefold by births and fill their councils. The only condition that varies is the homeland's land, and it varies mostly by region (the Innu's Labrador stays whole; the Haudenosaunee's never reaches 85). So continuity is won mostly by the Innu and the Mi'kmaq. A continuity that means "still here despite the Europeans" needs pressure on a playing people's land that the game does not have yet: computer Europeans buying or taking a playing people's land (T5's sale from the seller's side was never built), or wars that cost towns. **Open question for Simon:** keep these thresholds (a rare, land-driven continuity), give each people its own (the note allows `peoples.overrides[id].victory`, as step 8 gave each people its own score values), or build the land pressure first and tune again.
2. **The restraint numbers differ from T10's draft** (90 and 60 instead of 70 and 40), so the levels' land differs; T10's "Naive follows the price" is kept.
3. **Epidemics at 1 in 75** rather than the drafted 1 in 25, the same for both sides. Historically epidemics struck the peoples far harder than the colonists; the same-rules decision stands, and the number is the one that lets the Europeans grow.
4. **`ai.stretch`** is a new scenario field rather than per-nation arrival offsets: one number, read only with `dates`.
5. **Raids are wars, with few fights.** Combative goes to war with a European that settles within five tiles of its towns and attacks units next to its warriors; it has few warriors (one a town at setup, more only by muskets or by winning fights), so raids are mostly declared wars that end in peace after 20 years (3 a game). Raids on other peoples were left out, to keep T15's survival target safe.
6. **No new towns.** Every people's towns reach their longhouses' housing by about 1500 and then hold; founding new towns (and claiming more land) would be a natural profile choice, but it would close more land to the Europeans. Not built.
7. **Iron tools** are a rule for every people (4 tools a turn become building work), not only an AI choice; cloth and trade goods are used in barter, muskets and horses to arm warriors.
8. **Barter between peoples** is abstract, as the trade visits are (no canoe or carrier moves), and once a year.
9. **Not measured:** T15's "each computer people holds a treaty with a European nation in most games" (the arena counts treaties of all kinds; the peoples hold 1.2–5.1 at the end).

### Measurements

Every commit kept the Americas and the Caribbean bit-identical: `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games, the golden tests unchanged, and the 24-game Americas tournament (`npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`) identical to the base but for its running time. `npx tsc -b` is clean; `npm test` passes (75 files, 913 tests, 1 skipped); the people tests, the North-east's and the arrivals' pass with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`.

## 15. Implementation (step 10, November 2026)

Built on branch `beta3/step10`. Code: the web game (`apps/web/src/ui/newgame.ts`, `colony.ts`, the new `town.ts` and `victoryreport.ts`, `sidebar.ts`, `diplomacy.ts`, `reports.ts`, `turnstart.ts`, `app.ts`, `main.ts`, `style.css`), the renderers (`render-api` `land.ts`: `drawClaimBorders`, `drawLandOverlay`, `drawLandLabels`, `healthColor`, and `Scene.overlay`; `style-ligne-claire` `peopleTownSprite`, the people's units and the canoe; `style-schematic`; `style-sprites` `ids.unit` and the colony hook), and small engine changes that touch no game in play: `setup.ts` (`NewGameOptions.peoples` and `peoplesFirst`, `arrivalYear`, `arrivalStartTurn`), `seedphrase.ts` (game codes carry the peoples), and two corrections for a people (`charterCost` is 0: there is no Crown to charter its towns; its score line for the council reads the council's name, not "Founding Fathers"). Test: `test/scenarios/north-east-newgame.test.ts` (6 tests).

### What was built

- **New game (T4, T16, T22).** A scenario with playable peoples lists them under "Native peoples", each "Not played (settlements)", "Player" or a computer level, with its way of life ("Farming towns", "Hunting and fishing camps"). In a people's game (every nation arrives after the first year: `peoplesFirst`) the person plays the first people, the second is a Competent rival, the others stay settlements, and every nation is a computer; the start button says "Begin", and is disabled, with a line saying why, when no people plays. Each nation's row says when it arrives ("Arrives in 1497."). The Americas and the Caribbean show nothing new.
- **Late arrivals get a head start (T16, T18; section 11, choice 8).** When the persons play only nations that arrive later, the game starts with a head start to the year before the first of their arrivals (`arrivalStartTurn`): the computer plays the years before in the engine worker with the progress bar ("Skip ahead"), or on the map ("Watch the speedrun", showing everything until the nation is there), and the nation arrives in its year as the person's (`handOver` leaves a nation still to come to arrive with its person; tested). The Start choice then reads "On arrival (1497)" and offers only the later head-start years. A watched head start for a nation not yet there no longer looks up its missing player.
- **`?scenario=north-east`** opens the New game screen with that scenario chosen, also while it is registered hidden. Game codes carry the peoples and their controllers (after the scenario's id, so Americas and Caribbean codes are as before).
- **The town screen (T2, T10).** A people's town has its own header (people, food, counsel a turn, the land in words) and a "The town" card: stores (food, the turn's change, the reserve, what the stores keep, a bar with the reserve marked, years of food held), growth (how far the next birth is, or what holds it back: hunger, an epidemic until a year, fighting this year, full longhouses), housing, and the land (its region, its health in words and as a number, a hard year). Production reads food, building work and counsel (no crosses, no Sons of Liberty). The buildings are the people's own (`buildingsOf(s, owner)`; before this a town showed no buildings at all), their output in the same words; the build list is the people's; there is no "Buy now", and a line says why ("Nothing is bought for gold at home…"); the warehouse lists food, furs and what the town holds; the roles offered are the warrior's muskets and horses and the scout's, no pioneer or missionary.
- **Trade, barter and learning (T10, T11; step 4's commands).** On the town or colony screen, "Trade beside the town" lists the other side's carriers next to it (a European wagon train or ship by a people's town, a people's canoe by a colony), with Sell and Buy buttons per good at the deal's price. The unit card does the same from the carrier's side, offers barter at another people's town or settlement, and offers a nation's colonist "Learn at …" at a people's town under a cultural exchange.
- **The sidebar for a people (T1, T22).** Gold "from trade"; no tax, crosses, recruits or home port button (E says a people has no home port); "Found town"; "Claim this land" (T5); no "Sail to Europe" for a canoe; the region's health under the unit's tile; the council line says "every seat is filled" once it is.
- **Claimed land and the land's health on the map (T5, T10).** Every style draws a playing people's claimed land with a border in its colour (dashed in Ligne claire, whose roads are lines of a similar brown). The "Land" button (L) shows the land overlay: tiles tinted by their region's health (green, yellow-green, amber, red), region edges, and each region's name, health in words and a hard year as labels over everything; with the overlay on, every claim's border shows. The map's hover text adds who claims a tile and its region's health.
- **Foreign Affairs (T11, T14).** Step 4's and step 7's cards (nations and peoples from the people's side, the treaties, the league of peoples) were already there; a people no longer sees the chartered companies card (a people charters none).
- **Epidemics, arrivals, hard years and hunger as news (T12, T18, T10).** The turn-start briefing tags them ("Epidemic", "Arrival", "Hard year", "Hunger"); a child born in a town is routine news.
- **The new victories (T14).** A new report, "Victory" (Ways to win), lists the scenario's ways to win in the order they are judged and where the player stands on each: for a people continuity and a good life, with the conditions it fails in words, its league, and the military victory (waiting for every arrival, or Europeans still present); for a nation its independence. Under it, the player's score line by line (a people's own lines, "compared among peoples"). The game-over screen (step 7) already names each winner's way and lists the peoples' scores apart, and the independence question (step 7: "End with the victory" or "Keep playing", asked when at war with any people) is in the briefing.
- **Reports in a people's words.** A people sees "Towns", "Peoples" and its council's name for the Colonies, Natives and Congress tabs, and no Trade tab (the home port's market: it crashed for a people) or Religion tab.
- **Art (T22), placeholder level and procedural.** Ligne claire: a people's town as its people's homes (bark longhouses for a farming people, wigwams for a people of camps), more of them as it grows, a palisade of one to three rows, a pennant in the people's colour; the people's units by silhouette in their people's colour, with a feather and what their work needs (a bow, a fish spear, a hoe, an axe, an elder's staff and white hair, a runner's strap; a musket and a horse by trade); a birchbark canoe with a paddler; the people's buildings as longhouse icons. Schematic: a round-cornered town with a roof line and dashed palisade rings, letters for the people's units (T, H, Fi, G, Cr, R, W, E, Ca). Ligne claire painted: a people's town uses its people's settlement sprite when the pack has one, else Ligne claire's town; a people's unit never borrows a European colonist's or soldier's sprite (unmapped, it is drawn procedurally). No likeness of a person, nothing sacred.

### Checks

`npx tsc -b` clean; `npm test` passes (76 files, 919 tests, 1 skipped); `npm run bench -- --verify` and `--verify --scenario caribbean` "same" for all eight games; the golden tests unchanged; `npm run build` works. Played in Chromium with Playwright on the dev server (Google Fonts blocked): a North-east game as the Haudenosaunee from 1000, after a head start to 1490 (through England's and Portugal's arrivals) and to 1700, and as England (the automatic head start to 1497); the town, Foreign Affairs, the council, every report tab, the land overlay, trade routes and progress opened in the Schematic, Ligne claire and Ligne claire painted styles, and furs sold to an English wagon train placed beside a town (100 furs for 200 gold); no page errors.

### Choices made while building (for Simon)

1. **The North-east stays hidden** (`hidden: true`), reachable by `?scenario=north-east`. I would unhide it once you have reviewed its drafted history (section 13): the screens now play it end to end.
2. **The arrival head start hands over the year before the arrival**, so the nation enters as the person's and the person plays its first turn; handing over on the arrival turn let the computer play that first turn.
3. **A people pays no colony charter** (an engine rule that no game in play reaches: computer peoples found no towns). Before, founding a second town asked 500 gold of a people with no Crown.
4. **The people's score line for its council** reads the council's name; the Americas' and the Caribbean's lines are unchanged.
5. **The land overlay is shared code in `render-api`**, called by both procedural styles, rather than each style's own drawing; a style may draw its own instead.
6. **Trade buttons sell or buy up to 100** of a good, as far as the engine allows (the hold's room, the buyer's gold, a town's reserve of food); a full hold shows the engine's message.

### Questions for Simon

1. **Unhide the North-east?** Recommended once its history is reviewed (above).
2. **The first towns' names.** A people's first towns keep their settlements' names (step 1, "keeping their places and names"), and in the North-east every settlement is "Haudenosaunee village" or "Haudenosaunee capital"; the playable peoples' `townNames` (Onondaga, Ossossané, Kjipuktuk …) go only to towns founded later. Should the first towns take those names? It is a setup change for the North-east (the hidden test scenario's tests expect the settlement names).
3. **A people taken over after a head start knows little of the map**: computer peoples do not explore, so in 1700 the Haudenosaunee know their homeland and have "no contact yet" with nations a few tiles away. A runner exploring, or a people knowing its region at setup, would be a change to step 9's profiles or to setup.
4. **The computer seats every council member during a head start** (13 of 13 by 1500), so a person taking over a people has no council choices left; fine if the council is meant to fill, otherwise a cost rule for the people's council.
5. **Sprites.** T22's local sprite trial on the Mac, and prompts for the people's towns, units and council (to be reviewed for care before any image is made, T9), are not started; the painted pack draws the people's towns and units with Ligne claire's procedural art.
6. **Reports a people does not see**: Trade and Religion are hidden for a people. A people's own trade report (furs sold, goods bought, prices at the colonies near it) would be a small addition if wanted.

## 16. Implementation (step 10b, November 2026): Simon's answers to section 15

Built on branch `beta3/step10b`. Simon answered section 15's six questions: (1) unhide the North-east; (2) the first towns take the scenario's town names; (3) "add some incentives to explore (we already made a gameplay mechanic based on how well they know the land) and have peoples share maps when they meet, unless they are hostile/combative or at war with existing allies"; (4) the council filled after a head start stays as it is; (5) art: only three free images a day, so a short prioritised plan and no images made; (6) a people's trade report, as a Trade tab.

Code: `scenarios/north-east.ts` (no longer `hidden`; `mechanics.mapKnowledge`), `peopleplayer.ts` (the first towns' names), `scenarios/types.ts` (`Mechanics.mapKnowledge`, `MapKnowledgeRules`), `movement.ts` (`knownLand`'s `seen`, `landSeen`, the search context's `seen`), `peoplemaps.ts` (new: `shareMaps`, `mapSharingBar`, `alliesOfSide`), `peoplediplomacy.ts` (calls `shareMaps` after the round's first contacts), `types.ts` (`PeopleRelation.maps`; `GoodsTally.toNations`, `toNationsGold`, `fromNations`, `fromNationsGold`, `barterGiven`, `barterTaken`), `ai/profiles.ts` (`PeopleProfile.shareMaps`, `explore`), `ai/people.ts` (`explore`), `peopletrade.ts` (every sale, purchase and barter goes into the people's ledger), `reports.ts` (`peopleTradeOverview`), the web game's `ui/reports.ts` (the people's Trade tab), and two small corrections a person playing a people saw on the first turn (`queries.ts` `meetPeople`: a people no longer "meets" itself; `peopleplayer.ts`: "The Haudenosaunee take their place…", not "The the Haudenosaunee…"). Tests: `test/map-knowledge.test.ts` (new, 6 tests, with the hidden scenarios `test-map-knowledge` and `test-map-knowledge-home`); the trade test in `test/people-diplomacy.test.ts` reads the report; `test/scenarios/north-east-newgame.test.ts` checks the towns' names; `test/scenarios/north-east.test.ts` checks that the scenario is offered; `test/people-player.test.ts` checks the hidden scenario's names. `Scenario.units`, `buildings` and `nationTypes` and sections 8, 9 and 13 are untouched.

### What was built

- **The North-east on the New game screen** (answer 1): the scenario is no longer `hidden`, so the Scenario list offers "The North-east, 1000–1850" after the Americas and the Caribbean. `?scenario=north-east` still opens it.
- **First towns named by their people** (answer 2): a playing people's settlements become towns named from its `townNames` in order, the capital first (Onondaga, Ganondagan, Kanonwalohale, Tiononderoge and Canajoharie for the Haudenosaunee; Ossossané… for the Wendat; Kjipuktuk… for the Mi'kmaq; Uashat… for the Innu). Towns founded later take the next names (`nextColonyName` counts from `coloniesFounded`). If a people has more settlements than names, the extra towns keep their settlements' names.
- **Knowing the land means having seen it** (answer 3, the incentive to explore): with `mechanics.mapKnowledge.seen`, T13's rule (step 5) reads "land nobody claims" as "land nobody claims **that the people has explored**". A people always knows its own claimed land. So exploring, and every map shared, widens where its units move as along a river. The rule is the same for persons and the computer. `moveCost` and the path search read the same `seen` (the people's `explored`), so routes are planned on the costs units pay.
- **Peoples share maps when they meet** (answer 3, `peoplemaps.ts`): once a round, after the round's first contacts, each playing people shares with each people it has met. (The standing record of step 4 is written when one side has seen the other's towns.)
  - **Two playing peoples** each give the other everything they have explored.
  - **A people nobody plays** has no map in the game, so it gives the playing people its homeland: the land within `share.homeland` tiles (3) of its settlements.
  - **When they don't** (`mapSharingBar`): while the two are at war; while the other side holds it hostile after a broken treaty (`hostileUntil`); while either is a Combative computer people (`PeopleProfile.shareMaps` false, "keeps its maps"); or while either is at war with one of the other's allies (partners in a mutual defence pact, a league or an alliance).
  - **How often:** a pair kept apart shares as soon as it may. It shares again every `share.every` years (50 in the North-east) while it may. The turn is kept on the pair's record (`PeopleRelation.maps`).
  - **What a person is told:** "You and the Wendat share what you know of the land: 68 tiles added to your map." or "The Mohican share what they know of their land: 29 tiles added to your map."
  - European nations neither give nor get maps (question 2 below).
- **Computer peoples explore** (answer 3, `ai/people.ts` `explore`): setup gives each people one runner, at its capital.
  - **Where it goes:** to the nearest land tile its people has seen beside land it has not, within `mapKnowledge.range` (12) times its profile's `explore` of one of its towns. The profiles' `explore`: Naive 0.5, Competent 1, Combative 0.75, Creative 1.5 (Creative goes farthest to meet partners).
  - **How it finds it:** a breadth-first search over the land the people has seen, so an edge across water or behind another's colony is never tried. The route it finds is the route given, so no other path search is needed.
  - **When it is done:** with nothing left in reach, it goes home and looks again every fifth turn.
  - **What it brings:** what it sees is land its people now knows, and the peoples it meets share their maps. A people taken over after a head start therefore knows its region and its neighbours (step 10's third question). In a computer game on seed 3000, around 1500 the Haudenosaunee know 1,217 of the map's 6,216 tiles, with the Wendat's map shared; without `mapKnowledge` they know 79.
- **A people's Trade report** (answer 6): a people has a Trade tab again, in its own words ("Trade with the Europeans and the peoples").
  - **The figures:** its gold (only from trade), the furs sold and the gold they brought, the gold from sales and the gold spent on goods, and the goods it wants most.
  - **The table, one row per good:** what is in its towns; what it sold to and bought from European nations, with the gold each way; last turn's deals; and what it gave and took in barter with other peoples.
  - **The prices, one row per European nation whose colonies it knows of, nearest first:** the nearest colony (a link to the map) and how far it is, "near" when within a trade visit's reach, a "treaty" or "war" tag, what the nation pays for a unit of the people's furs, food, tobacco and coats, and what a unit of tools, muskets, horses, cloth and trade goods costs the people (the goods it wants most in green). These are the prices `pairPrice` gives when the people come to trade.
  - **The ledger** is written by every deal (`tradeWithPeople`, `barter`, the computer's trade visits and barter), so a head start's trade shows too.

### Map sharing and the Americas

Map sharing runs only inside `processPeopleDiplomacy`, which runs only when a people plays, and only with `mechanics.mapKnowledge`. The Americas and the Caribbean have neither, so peoples nobody plays never share with anyone there. `npm run bench -- --verify` and `--verify --scenario caribbean` say "same" for every game, and the golden tests are unchanged.

### Rates (North-east, step 9's targets)

Run with `npm run tournament -- --scenario north-east --games 24 --turns 851 --play-on --events --seed 3000` and `--seed 4000`: the base (step 10's code) run again on this machine, then this step's code.

| Target (T15, T14) | Base (3000 / 4000) | Step 10b (3000 / 4000) | Together |
| --- | --- | --- | --- |
| A people wins in about 1 game in 5 | 8 / 2 games | 5 / 7 games | **12 of 48 (25%)**; base 10 of 48 |
| Each computer people survives in ≥ 3 games of 4 | 96 of 96 / 96 of 96 | 96 of 96 / 96 of 96 | **100% for each** |
| Leagues and confederacy sometimes | confederacy 5 / 0 games | confederacy 3 / 3 games | **6 of 48 games** |
| Military victory ≤ 1 in 100 | 0 / 0 | 0 / 0 | **0 of 48** |

Ways (step 10b): confederacy in 6 games, each won by a Creative people (the Haudenosaunee 4, the Mi'kmaq 2); continuity for 7 peoples (the Innu 5, the Mi'kmaq 2; by level Creative 4, Competent 2, Combative 1); a good life for none (2 in the base).

**One effect to weigh: a good life is now out of reach.** It fails on treaties for 96 of 96 peoples at both seeds (base: 58 of 96). Its `treatyShare` (0.75) is a share of the nations and peoples a people has **met**. A shared map counts as a meeting, because the standing record is written once a people has seen the other's towns, and a shared map shows them. So peoples now meet many more peoples than they make treaties with. The overall win rate still holds, because continuity and the confederacy make up for it. It is not retuned: that is a decision for Simon (question 1 below).

The Europeans' colonists per nation at the end (seeds 3000 / 4000; base in brackets): Competent 32.2 / 34.2 (33.1 / 33.0), Combative 33.2 / 34.6 (32.8 / 30.3), Creative 28.4 / 25.2 (24.8 / 26.1), Naive 14.0 / 13.0 (12.0 / 12.8). Colonies per nation are 5.0–11.0, as before.

Speed: 14.1 and 13.5 seconds a game, against the base's 13.5 and 15.7 on the same machine, three games at a time. A first version of the runners' exploring searched a path to each of the four nearest edges every turn and took 25 seconds a game. The breadth-first search, which hands over its own route, fixed that.

### Art for the peoples: a plan for three images a day (answer 5)

**How the art works now** (SPRITE_PROMPTS.md section 3, `tools/image-gen`, `tools/sprite-pipeline`, `packages/style-sprites`):
- Each sprite id has one 1024 px master, made from a prompt row. Masters are nation-neutral; a white-cloth pennant, tinted at run time, shows the owner.
- The pipeline makes every runtime size from the master. A separate `-Variant thumb` generation reads better at 16–48 px, but costs another image.
- The painted pack (`ligne-claire-painted`) maps engine ids to sprite ids (`DEFAULT_MAPPING`; a pack can override it with `extendPack`). A people's town uses `settlements/{tribe}` when the pack has that sprite. A people's unit uses a sprite only through an explicit mapping; unmapped, Ligne claire draws it (step 10). Anything missing falls back to Ligne claire.
- T9 and T22 apply: every new prompt is reviewed for care before an image is made. No likeness of a person, no invented face presented as real, nothing sacred or ceremonial, and the council stays emblems.

**Reused, no image needed** (one mapping line each, in the pack):
- **Haudenosaunee and Wendat towns**, and the settlements of the St. Lawrence Iroquoians and the Attawandaron: `settlements/iroquois` and `settlements/iroquois__capital`. They show bark longhouses, palisades and maize fields, the same building tradition.
- **The warrior and its roles:** `units/brave__none` (bow), `brave__armed` (the soldier role, muskets by trade), and `brave__mounted` and `brave__armed-mounted` (the scout and dragoon roles, horses by trade). The eastern-woodlands dress fits. The paint horse reads as Plains, so it should become a plain horse the next time these sprites are redrawn.
- **Goods, terrain, rivers, coasts and decorations:** everything the North-east needs is among the existing 294 sprites.
- **Ownership:** the existing tinted pennant, so no per-people recolours.

**Essential to test the look: three images, one day.**
1. **`settlements/mikmaq`** (also used as its `__capital`): a camp of birchbark wigwams by a river mouth, with canoes drawn up and drying racks, and no people.
   - Why: the "hunting and fishing camps" way of life has no art at all, and it is the commonest on this map.
   - Covers: the Mi'kmaq and the Innu as towns (mapped), and as settlements the Wolastoqiyik, the Penobscot, the Abenaki, the Algonquin and the Eeyou. The Beothuk's mamateeks are close enough for a test, flagged as an approximation.
2. **`units/townsperson__none`**: a woman or man of the North-east before contact, in deerskin and fur, carrying a burden basket on a tumpline. Full figure seen from a distance, with no face detail.
   - Why: it is the most common unit in every town, and it sets the look of a people's figures beside the European colonists.
   - Covers, by mapping until each has its own sprite: the townsperson, gardener, hunter, fisher, crafter, runner and elder. A procedural tool badge from Ligne claire on top would tell them apart; that is a small code change, not an image.
3. **`units/birchbark-canoe__none`**: a birchbark canoe with one paddler, in side view, with a bare stern pole for the pennant.
   - Why: it is the people's only ship, seen on every lake, river and coast, and its procedural drawing is the weakest of the people's art.
   - Covers: the canoe.

**Next, one day each, in order:**
- Day 2:
  - (4) `ui/council-house`: the inside of a bark council longhouse, empty, with fires down the middle, as the council screen's backdrop (procedural now).
  - (5) `units/elder__none`: white hair, a staff, a blanket.
  - (6) `units/gardener__none`: with a hoe.
- Day 3: (7–9) the three day-one sprites again as `-Variant thumb`, because the small sizes are where full masters fail.
- Then: the camps of the Inuit and Dorset in the north (skin tents), and a hunter and a fisher of their own.

**Derived, no image:**
- Building icons for the people's buildings, cropped from the settlement masters: one longhouse from `settlements/iroquois` for the longhouse and the council house, one wigwam from `settlements/mikmaq`, and the palisade from `iroquois__capital`.
- A small town as a crop of the regular sprite (one or two homes), where Ligne claire shows growth.
- A capital as the regular sprite under Ligne claire's palisade rows, when there is no `__capital` sprite.

The prompts for images 1–3 still need to be written into SPRITE_PROMPTS.md, as a new section 4.11b, "Playing peoples", with its own category block that repeats section 4.11's respect rules. Simon reviews them before the first image is generated. They are not in that file yet, so a full `Generate-Images.ps1` run cannot make them by accident.

### Checks

- `npx tsc -b` is clean, and `npm test` passes (77 files).
- `npm run bench -- --verify` and `--verify --scenario caribbean` say "same", and the golden tests are unchanged.
- Played in Chromium with Playwright on the dev server, at device scale 2, with Google Fonts blocked:
  - The New game screen lists the North-east.
  - "Begin" as the Haudenosaunee from 1000 gives the towns Onondaga, Ganondagan, Kanonwalohale, Tiononderoge and Canajoharie.
  - On the first turn the news says "You and the Wendat share what you know of the land: 68 tiles added to your map." and "The Mohican share what they know of their land…".
  - The Trade tab shows the report: empty in 1001, and after a head start to 1600, the barter of the head start's years and England's prices at Plymouth.
  - No page errors.

### Choices made while building (for Simon)

1. **A people nobody plays shares only its homeland** (3 tiles around its settlements), because it has no map in the game. Two playing peoples share everything they know.
2. **Peoples share again every 50 years**, not only once, so neighbours who met early keep learning what the other found. Leaving out `every` means once.
3. **"Allies" are partners in a mutual defence pact, a league or an alliance.** A trade treaty does not make allies.
4. **"Hostile" means war, or step 4's hostility after a broken treaty.** A people's temperament (open, guarded or proud) does not stop sharing.
5. **The seen rule applies to persons too:** a person's people moves swiftly only on land it has explored or been shown. It is scenario data (`mapKnowledge.seen`).
6. **Only one runner explores**, the one setup gives; a computer people builds no new runners for it. The profiles' reach is the only difference between levels.
7. **The Trade report counts from this step.** Games saved before it start counting when loaded (the ledger is optional state, as for the Europeans' Trade report).

### Questions for Simon

1. **A good life and the peoples met.** Sharing maps makes peoples "meet", because their standing record is written when they see each other's towns. So a good life's "treaties with three in four of those met" now fails everywhere (96 of 96). Which do you want?
   - (a) Count as met only the peoples whose units or towns a people has seen itself. This needs a second record, because `explored` cannot tell a shared tile from a seen one.
   - (b) Lower `treatyShare` for the North-east. The overall win rate holds without it.
   - (c) Keep it as it is.
2. **Maps between peoples and Europeans.** Peoples drew maps for Europeans, and the explorers' maps owed much to them. Should a people at peace with a nation, under a trade treaty or a cultural exchange, share its homeland with that nation, perhaps as part of the exchange? Not built: your answer named peoples, and it would change what the Europeans know of the map.
3. **New runners.** Should a computer people build a new runner when its own is lost, or keep a second one at Creative, to keep exploring?

## 17. Clean-up after step 10: the data model (November 2026)

Built on branch `beta3/datamodel`, bit-identical (bench, golden tests and the 24-game Americas tournament unchanged).

- **Every nation type's selection in one place** (Simon: the older data restructured rather than worked around). `Scenario.units` and `Scenario.buildings` are gone; each scenario gives `nationTypes.european` (`units`, `buildings`, `council`), and the North-east also `nationTypes.people`. `NationTypeSelection.council` is required, so the defaults `congress` and `people` are written in the data rather than in `councilIdOf`. Section 7, choice 1, has the shape and why.
- **Unused helpers removed:** `isCompanyId` (companies.ts) and `isCompanyIdent` (rules/nations.ts), left exported after step 1 moved every company check onto the systems table.
- **The research in its own file:** the history drafted for Simon's review (sections 8, 9 and 13, and the sourced context in T10 and T14) moved to [research/north-east-peoples.md](../research/north-east-peoples.md), with its sources gathered and the items still to be sourced or checked listed; this note keeps the game's data and decisions and links to it.

**Other compromises of the same kind, looked for and left** (each would change the Americas' or the Caribbean's saved state or games, which the bench and golden hashes guard, or reaches into work in progress):
1. **Two catalogue ids for one people**, `iroquois` (the Americas) and `haudenosaunee` (the North-east), section 13: renaming the Americas' entry, or giving the North-east the `iroquois` id with its own name, changes the Americas' messages and history (in the hashes) or every North-east save, game code and test; the council members offered to both ids would then need one. Worth doing with Simon's review of the names, as its own step. **Done in section 18.**
2. **`TreatyEnd.by` keeps a nation as its bare id** beside a people's party (`PlayerId | TreatyParty`, Beta 2 step 0's choice 4), so treaties between nations save as before; one shape for both is a change to every saved treaty's end, so to the hashes.
3. **Two ways of judging victory** (section 12): without a playing people the scenario's own order, as before; with one, `VICTORY_ORDER` and both sides judged. One path for all could end some Americas and Caribbean games differently (the order of kinds and the end-year judging differ), so it is a rules change for Simon, not a clean-up.
4. **Peoples nobody plays make no treaties with each other** (section 10, choice 9): allowing it changes the Americas' and the Caribbean's games.
5. **The Congress's words come from the scenario's terms**, not from `Council.text` (section 9): the same words fill message templates (`{council}`, `{member}`) across the engine, so moving them would leave two copies; left as the European nation type's vocabulary.
