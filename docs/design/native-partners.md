# Design note: Native peoples as partners (Beta 2)

Status: **decided** (11 November 2026); **step 0 built** (section 8); **step 1 built** (section 9); **step 2 built** (section 10); **step 3 built** (section 11); **step 4 built** (section 12); **step 5 built** (section 14). Simon agreed to every recommendation N1–N14 and to the five fixes of today's native rules in step 0 (section 5). He added one direction for N1: native peoples are to become a **nation type of their own** later (section 4, after the table), so the people party must be built to grow into that. Builds on Beta 1, [cooperation.md](cooperation.md) (built), and reuses its shapes: the `Treaty` record, scenario data and mechanics switches for every new rule, computer behaviour per level at seeded chances with targets a scenario can change, and `gameOver.winners`. The 0.9 scenario framework ([scenario-framework.md](scenario-framework.md), [SCENARIOS.md](../SCENARIOS.md)) applies throughout. Australia ([australia.md](australia.md)) is the scenario that will lean on this most, so the shapes chosen here must serve it later.

## 1. Goal

Today a native people is something a European nation manages: it trades with them, learns from them, buys or takes their land, keeps their anger down with gifts, and fights them when it fails. Beta 2 makes **a people a partner**, with agreements that bind both sides:
- **Trade agreements** with a people.
- **Shared land use**: land worked by a colony while it stays the people's.
- **Cultural exchange**: learning both ways, renewed over the years.
- **Mutual defence**: a people and a nation defend each other.
- A **way to win by prosperity and cooperation**, next to `concord`.

Peoples decide for themselves, by simple seeded rules, and can refuse or end an agreement. Computer nations use the agreements at rates measured in tournaments, which scenarios can change.

**Non-goals** (N14 lists them as a decision):
- Natives as full players (colonies, Crown, independence).
- Native peoples' diplomacy with each other, wars between peoples.
- Australia's content: Country as a moving lifeway, its peoples, Federation. Beta 2 only keeps the shapes open for it.
- Rebalancing war against natives. Taking land and burning settlements stay as they are; partnership must compete on its own merits.

## 2. What exists today (0.5–Beta 1)

The natives work came in 0.5 (see the roadmap's 0.5 table and [AI_FEATURE_AUDIT.md](../AI_FEATURE_AUDIT.md), "Natives: visible braves (0.5)"). There is no separate "shipped" document; the roadmap's done rows are the record.

**State** (`packages/engine/src/types.ts`):
- `Tribe` (one per people in play, `GameState.tribes`): `stance` per nation (war or peace), `burial` (nations that desecrated a burial ground, at war for good) and `submitted` (nations the tribe surrendered to). No other per-people record.
- `Settlement` (`GameState.settlements`): `tension` per nation (0–1000), `mission` and `missionExpert`, `skill` (taught once, then `null`), `visited` (scouts that spoke with the chief), `gold`, `goods` (stock for sale, and muskets and horses for its braves), `defenders`, `braveTimer`.
- `Brave` (`GameState.braves`): belongs to a settlement, not a player. `NativeDemand` (`GameState.nativeDemands`): a brave's demand for tribute or offer of goods, waiting for a person's answer.
- `Tile.claim`: the nation that bought or took the tile from the natives.

**Peoples are scenario data** (`ScenarioPeoples` in `scenarios/types.ts`): `ids`, `produce`, `settlements` (the settlement kind for each `Lifeway`: `nomadic`, `agricultural`, `urban`) and `overrides` of a people's skills and wants. `PeopleDef` (`rules/nations.ts`) is name, colour, lifeway, skills and wants. `SettlementKindDef` (`rules/natives.ts`) holds every number that depends on the kind (braves, respawn, produce, incite and land prices, treasure).

**Tension** (`natives.ts`):
- `processNatives`, once a round: each settlement's tension towards each nation rises with the colonies within 3 tiles (3 plus half their workers each, times the difficulty's `nativeTension`) and falls by 4 (9 with that nation's mission).
- A tribe goes to war with a nation when **any one** settlement reaches `TENSION.war` (800) or the nation desecrated a burial ground; it makes peace once **every** settlement is below 250.
- Raised by: founding a colony nearby (`onColonyFounded`: 150 within 2 tiles, 80 within 3), taking land (`takeLand`: 250, and 60 at the people's other settlements), attacking (`combat.ts` `attackSettlement`: 300 and 150; `hostile` declares war), killing braves (`braves.ts` `killBrave`), refused demands, inciting.
- Lowered by: selling (−15) and buying (−10) at a settlement, buying land (−20), gifts to the whole people (`giftToTribe`), missions (−100 at founding), met demands.

**What a nation can do with a settlement** (`natives.ts`):
- `speakToChief` (scout, once per settlement): land revealed, a gift (`nativeGifts` modifier), or nothing.
- `learnSkill`: one unskilled colonist per settlement, ever. Petty criminals only for France (hard-coded, see the oddities below).
- `tradeWithSettlement` and `buyFromSettlement` (wagon train or ship, one sale and one purchase a turn); prices from `nativeOffer` and `braves.ts` `nativeUnitPrice`.
- `buyLand` and `takeLand` on `nativeLandOwner` tiles, priced by `landPrice` (kind, capital, tension; Peter Minuit's `landPrice` modifier; free from a people that submitted).
- `establishMission`, `denounceMission`, `inciteTribe` (`mechanics.missions`); converts join the nearest colony (`conversionChance`, `convertType`).
- Attack and burn (`combat.ts`); a burned capital may make the rest of the people submit (`surrender`).

**Braves** (`braves.ts`, rules in `rules/natives.ts`): wander, bring gifts, come to trade, demand tribute when uneasy, attack when angry or at war (`BRAVE_CHANCES`, `TENSION`), arm and mount from the settlement's stock.

**Computer players:**
- `ai/advanced.ts`: `acquireLand` (profile `land`: Competent and Creative buy, Combative takes), scouts speak to chiefs, colonists learn skills (`learnFromNatives`), missionaries found missions, `diplomacy` gives gifts when a people is over 450 (profile `gifts`, not Combative).
- `ai/natives.ts`: wagon trains buy goods (`buyFromNatives`); Combative incites (`maybeIncite`, once in 40 turns).
- `ai/logistics.ts` `nativeTrade`: wagon trains sell to settlements when they have no route.
- Naive does none of this. Chartered companies (`COMPANY_PROFILE`) found no missions.

**Elsewhere:**
- Score (`score.ts`, `rules/score.ts`): the "Peace and cooperation" line counts each settlement a nation's scout has visited whose tension is below 200, at `peacefulTribe` (1) point each.
- Foreign Affairs (`apps/web/src/ui/diplomacy.ts`): a "Native peoples" card (settlements, mood by average tension, missions, gifts of 100 or 500). Trading is `apps/web/src/ui/natives.ts`.
- Events: the `tension` and `peaceWithPeoples` (Pocahontas) effects (`events/effects.ts`).
- **Treaties** (`treaties.ts`, Beta 1): `TreatyParty = { kind: 'nation'; id }`, shaped so a people can be a party later. `bound` and `treatyNations` already skip parties of other kinds. Kinds: `trade`, `favoured`, `alliance`, `confederation`.
- **Victory** (`victory.ts`): kinds `time`, `concord`, `independence-war`; `gameOver.winners: NationId[]`.
- Peoples play no part in the War of Independence, the Crown, alliances or concord. `addTension` ignores the Crown.

**The Caribbean** (`scenarios/caribbean.ts`): the same native rules. Three peoples (Arawak, Kalinago, Tupi), camps and villages only (no cities, so no silver), produce cotton and tobacco, the Tupi want cloth (`overrides`), missions on. France's bonus there cites the French treaty with the Kalinago (1660): a natural first test of a treaty with a people.

**Australia** ([australia.md](australia.md)): hundreds of Aboriginal nations, no permanent towns, land as Country, seasonal movement; the framework plans a `seasonal` lifeway with its own behaviour ([scenario-framework.md](scenario-framework.md), 3.6). So a partner must be **a people, not a settlement**, land must not depend only on being next to a settlement, and every list in the interface must cope with many small peoples.

**Oddities found while reading** (worth fixing in step 0 or noting):
1. **Native land is only the eight tiles next to a settlement** (`nativeLandOwner`, distance 1), while colonies press on tension from 3 tiles away. Most land belongs to nobody, so "shared land" has little to share unless land reaches further (N6).
2. **Mood labels disagree with the rules.** `tensionLabel` says uneasy from 200, angry from 400, furious from 700; braves demand from 300 (`TENSION.uneasy`), attack as angry from 600 and go to war at 800. A player told "angry" at 450 sees no attacks; "furious" comes before war.
3. **Companies are not neutral to natives.** `processNatives` counts every player but the Crown, nothing in `braves.ts` spares company colonies, and `inciteTribe` accepts a company as its target (it checks only `s.players`). Beta 1 made companies neutral towards nations only.
4. **Native rules are still code.** The framework's row 22 planned `peoples.rules` (the constants of `rules/natives.ts`) and row 23 switches for burial grounds and surrender; neither exists. Only `mechanics.missions` does.
5. **France's teaching exception is hard-coded** (`learnSkill`: `u.owner !== 'france'`), a leftover of the framework's row 13; the Caribbean's French bonus text ("teach more readily") relies on it.
6. Pocahontas (`peaceWithPeoples`) makes peace with a people whose burial ground was desecrated; `processNatives` puts it back at war the next round.
7. `peacefulTribe` counts settlements, not peoples, and only those a scout has visited.

## 3. Proposal in brief

1. **A people is a treaty party** (`{ kind: 'people', id: TribeId }`); natives stay as they are, not players. Each treaty with a people is between **one nation and one people**.
2. **Standing with a people**: a new record per nation and people, like `Relation`: years of good relations, trade with that people, waiting and hostility after a broken treaty, a pending proposal. Hidden seeded thresholds unlock each treaty, as Favoured Nation does.
3. **Four treaty kinds**, a ladder: **trade** first; **land use** and **exchange** need trade; **defence** needs trade and one of the others.
   - **Trade:** better prices, more goods, braves visit to trade, route stops at the people's settlements, tension falls faster.
   - **Land use:** the people's land near a colony is worked for a yearly rent, without buying it; colonies on it press less on tension.
   - **Exchange:** settlements teach again every few decades and teach a second skill; scouts are welcome again; the people's settlements gather more.
   - **Defence:** an attack on one is war with the other; braves defend the partner's colonies near their land, the partner's units may garrison next to settlements.
4. **Peoples decide by simple rules** in the engine: answers and endings by tension, standing and seeded chances; a people offers trade itself now and then through a visiting brave.
5. **Breaking faith costs:** taking a partner's land, attacking it, or inciting against it ends every treaty with that people, raises tension across it, and sets waiting and hostility, as cancelling Favoured Nation does.
6. **A new victory kind, `prosperity`**, checked at the end year: a nation at peace with the peoples it knows, with treaties with enough of them, and a score near the best, wins (with others who qualify). Concord comes first in the victory order.
7. **Computer nations** per level, at seeded chances in `Scenario.ai.cooperation`; target rates are engine defaults that scenarios change.
8. **Scenario data:** `mechanics.peopleTreaties` (the kinds in play), `Scenario.peopleTreaties` (thresholds, effects, penalties), `peoples.rules` (today's native constants), victory `prosperity`. The Americas and the Caribbean switch them on, after one deliberate re-recording.

## 4. Decisions needed (with recommendations)

**(structural)** marks decisions that shape the saved state or the engine's data model; changing them later means a large rewrite. N1, N3 and N6 are the expensive ones; N10 (who is in `winners`) too, to a lesser degree.

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| N1 **(structural)** | **How is a people a treaty party, and do natives become `Player`s?** | (a) Natives become `Player`s with `kind: 'people'`, like companies. (b) They stay `Tribe` and `Settlement`; a people is a party `{ kind: 'people', id: TribeId }`. (c) Each settlement is a party. Also: reuse the European kinds (`trade`) with a people party, or new kinds. | **(b), with new treaty kinds** (`people-trade`, `land-use`, `exchange`, `defence`), always one nation and one people. Natives have no markets, Crown, colonies or units of a player's kind, so (a) would touch everything keyed on players; a whole people suits Australia's many small nations, where (c) would not. New kinds keep the many `kind === 'trade'` call sites that assume two nations safe. |
| N2 | **Which treaties, in what order?** | (a) All four open at once. (b) A ladder: trade → land use or exchange → defence. (c) Only trade and defence in Beta 2. | **(b), all four kinds.** It is the European ladder's shape (peace → trade → Favoured Nation → alliance), easy to explain, and gives computer players a natural order. Defence with **one** nation at a time (or members of one alliance, N9); the others with any number of nations. |
| N3 **(structural)** | **What unlocks a treaty, and where is it kept?** | (a) Tension alone (below "content"). (b) A new standing record per nation and people: years of good relations (at peace, average tension below content) and gold traded with that people, against hidden seeded thresholds, as Favoured Nation. (c) A visible "trust" score. | **(b).** `GameState.peopleRelations` keyed by nation and people (`goodSince`, `volume`, `waitUntil`, `hostileUntil`, `breaks`, `proposal`), thresholds drawn per pair from the seed, never stored, shown in words only. Tension moves too fast to carry a treaty; years and trade reward a long partnership. The record is new state, so get it right now. |
| N4 | **What does a trade treaty do?** | (a) Prices only. (b) Prices, goods and visits. (c) (b) plus trade routes that stop at the people's settlements. | **(c).** Sales pay 20% more and purchases cost 20% less, settlements gather 25% more for sale, braves come to trade twice as often, tension falls by 2 more a round, and a route may stop at a partner settlement (sell and buy as a wagon train does now). All numbers scenario data. Route stops are what makes it worth more than today's ad-hoc trading. |
| N5 | **What does land use do?** | (a) Lease: tiles of the people's land next to a colony may be worked for a yearly rent (gold or goods), and stay theirs; the settlement still gathers from them at half rate; colonies on leased land press half as much on tension. (b) A cheaper purchase. (c) A share of the colony's produce on that land. | **(a), rent in gold, set when made.** It is real sharing, not a discount on buying, and gives Australia's sheep runs and Country a model later. A `Tile.use` field names the nation while the lease holds (the treaty keeps the rent and the people). Buying a leased tile stays possible at the usual price; taking one breaks the treaty (N8). |
| N6 **(structural)** | **How far does a people's land reach?** | (a) As today: the eight tiles next to a settlement. (b) Scenario data: a radius per settlement kind (Americas still 1). (c) A per-tile owner people (Country), set by the map. | **(b) now, with (c) kept open.** `SettlementKindDef.landRadius` (default 1, so the Americas play as today unless Simon wants more), read only through `nativeLandOwner`. Australia will need (c): a per-tile people on its stored map, which `nativeLandOwner` can read without the rest of Beta 2 changing. Expensive to change later because land is read in buying, working, pressure, the AI's sites and the renderer. |
| N7 | **What do cultural exchange and mutual defence do?** | Exchange: renewed teaching, a second skill, scouts welcome again, the people gather more; or also missions' converts redirected. Defence: (a) full pact, both ways; (b) the people's braves defend only; (c) the nation defends only. | **Exchange:** a settlement teaches again 25 ± 5 years after it last did (from its people's skills), scouts may speak with each chief again once a decade, settlements gather 25% more; missions stay as they are. **Defence (a), defensive only (as C4):** a European attack on the people is war with its partner; an attack on the partner's colony within `VISIT_RANGE` of a settlement brings its braves (the tribe goes to war with the attacker); the partner's units may stand next to settlements without raising tension; nobody can incite the people against its partner. |
| N8 | **How do peoples decide?** | (a) Accept whatever is offered once unlocked. (b) Simple seeded rules in the engine: accept by standing and tension, refuse while any settlement is angry, after land was taken within 20 years, or while a rival holds their defence treaty; end treaties when a settlement turns angry or a breach happens; offer trade themselves. (c) A full AI profile for peoples. | **(b), with an optional temperament per people as scenario data** (`peoples.overrides[id].temperament`: open, wary, proud; default the same for all). Peoples are not players (N1), so their rules live in `natives.ts` beside tension. A people's own offer arrives through a visiting brave as a turn-start notice, reusing the `NativeDemand` shape. Breaking faith (taking a partner's land, attacking it, inciting against it) ends every treaty with that people, adds 200 tension across it, and sets waiting (15 ± 3 years) and hostility (25 ± 5), as leaving an alliance does. |
| N9 | **How does it meet the existing rules?** Land purchase, missions, tension, the War of Independence, Beta 1 alliances. | Alliances: (a) a people may join a European alliance as a member; (b) treaties stay bilateral, alliances only follow from the rules; (c) a people's defence partner's allies are bound too. Independence: (a) peoples stay out; (b) a defence partner's braves defend against the King's troops near their land; (c) the Crown courts peoples against the rebels. | **Alliances (b):** no people in a European alliance in Beta 2. It falls out of the rules anyway: attacking a people allied with your ally is war with your ally, which is leaving the alliance. **Independence (b)**, behind a switch (`peopleTreaties` includes `defence`): partners defend partners. The Crown's own native allies (historically real) are a later note. Land: buying stays; taking land from a partner is a breach (N8). Missions: unchanged, but a firebrand's denouncing works as now. Submitted peoples (after a capital burns) can make no treaties with that nation. |
| N10 **(structural, smaller)** | **The new victory path, and how it combines with concord.** | (a) Only score weights (treaties with peoples count more). (b) A new kind `prosperity`: at the end year, a nation at peace with every people it has met for the last 30 years, which never burned a settlement, with treaties with at least half of them and a score at least 0.8 of the best, wins; every nation that qualifies wins together. (c) (b), with the partner peoples named among the winners. | **(b), plus score lines; peoples named but not in `winners`.** Kinds stay in the scenario's order: the Americas `[independence-war, concord, prosperity, time]`, the Caribbean `[concord, prosperity, time]`; concord first, so an alliance that also qualifies wins as an alliance. `gameOver.partners?: TribeId[]` lets the game-over screen say "with the Kalinago and the Arawak"; `winners` stays `NationId[]`, so no screen or arena code breaks. Score: a `peopleTreaty` weight per treaty in force (scenario data). Australia's Federation can later be another kind that reads the same treaties. |
| N11 | **Computer European nations, per level.** | Shares of `Scenario.ai.cooperation` chances, as Beta 1. | **Creative** seeks every kind and is the main partner (share 1). **Competent** makes trade and land use (it buys land today), exchange at 0.6, defence at 0.5. **Combative** makes trade where it pays, no land use (it takes land), exchange or defence pact (Simon, 11 November 2026: with no land use or exchange it cannot reach a pact, and that is accepted, section 13); it still breaks faith when its `land: 'take'` rule says so, which is the honest cost. **Naive** only accepts trade offered by a people. New `Cooperation` fields: `proposePeopleTrade`, `proposeLandUse`, `proposeExchange`, `proposeDefence`, `acceptPeopleOffer`; new `LEVEL_COOPERATION` columns. |
| N12 | **Target rates in computer-only games** (engine defaults; each scenario can change them, Simon's Beta 1 rule). | Higher or lower than below. | **Americas, four levels:** a trade treaty with a people in almost every game (Creative and Competent with 1–3 peoples each); land use in about half the games; exchange in about half; a defence pact in about 1 game in 4; a breach in about 1 game in 3 (mostly Combative); `prosperity` won about once in 20–30 games. The Caribbean raises trade and defence (the 1660 Kalinago treaty) through its own `ai.cooperation` and `peopleTreaties`. Measured with `npm run tournament -- --play-on --events`, tuned in step 6. |
| N13 | **Interface.** | Where to propose and see treaties. | **Foreign Affairs:** the "Native peoples" card gets a row per people with its treaties, its standing in words ("trusts you", "wary"), and a Propose menu (only after contact: a scout's visit, a mission or a trade); the Treaties card lists treaties with peoples beside the European ones. **Settlement screen** (a unit next to it, `apps/web/src/ui/natives.ts`): shows the treaty, its benefits and rent, and the "teach again in n years" date. Answers come at once; a people's own offers come in the turn-start briefing. The rows must stay usable with dozens of peoples (Australia): sort by contact, collapse those not met. Also fix the mood labels to the real thresholds (oddity 2). |
| N14 | **Explicitly out of scope.** | Confirm the list. | Natives as players; peoples' diplomacy and wars with each other; peoples founding settlements or growing; peoples in European alliances or in `winners`; the Crown's native alliances; hostile treaty kinds (tribute, protectorate) and changes to surrender; Australia's moving lifeway and Country map (only the shapes in N1, N6, N10); network play. |

**Simon's direction on N1: native peoples as a nation type later.** Beyond Beta 2 (roadmap, Later), native peoples become a nation type of their own: playable, with their own units, buildings and council members, and no Home Port. That could be a whole new way to play, for example starting as a native people around the year 1000, with the Europeans arriving later. Beta 2 does not build it, but it must not stand in its way:
- **One id for a people everywhere.** The `TribeId` used in `{ kind: 'people', id }` is the id the people would keep as a nation of that type; no second id or mapping is introduced.
- **`TreatyParty` stays a union keyed by `kind`,** and treaty code reads parties through small helpers (`partyIsPeople`, `peopleOf`, `nationsOf`), not by assuming "nations are players, peoples are not". When a people becomes a player, those helpers change, not every call site.
- **Treaty kinds describe what is agreed, not who agrees.** The effects of `people-trade`, `land-use`, `exchange` and `defence` read the people's settlements and land through `natives.ts` functions, so a people played as a nation can keep the same treaties.
- **People rules live together** (`natives.ts`, `peoples.rules`, the people relation record), so they can move behind a player of the new type without being untangled from European code.
- **Out of scope for Beta 2 stays as N14 says** (natives as players), but the design work for the nation type gets its own note when it is planned.

Part of step 0 (Simon agreed): move the native constants into `peoples.rules` (framework row 22), add switches for burial grounds and surrender (row 23), and fix five oddities of today's rules (section 2): native land's reach becomes scenario data (`landRadius`, N6; the Americas stay at 1 unless step 6's tournaments argue otherwise), the mood labels match the real thresholds, companies are spared native hostility and inciting, France's teaching becomes a modifier, and Pocahontas's peace holds with a people whose burial ground was desecrated.

## 5. Phased plan (sizes as in the roadmap)

Each step keeps existing games identical while the switches are off (golden and bench hashes), and re-records them in one deliberate commit when a scenario switches one on, with a tournament before and after.

| Step | What | Size | Prio |
| --- | --- | --- | --- |
| 0 | `TreatyParty` with `people`, read through party helpers (Simon's nation-type direction, section 4); `peopleRelations` (N3); `peoples.rules`, burial and surrender switches, and the five fixes (land reach, mood labels, companies spared, France's teaching as a modifier, Pocahontas's peace); `landRadius` (N6); Foreign Affairs lists treaties with peoples | M | P1 |
| 1 | Trade treaty with a people: unlocking, proposals, the people's answers and own offers, prices and goods, route stops at settlements; breaking faith (N8) | L | P1 |
| 2 | Land use: leases, rent, `Tile.use`, tension from leased land, the renderer marks leased tiles | M–L | P1 |
| 3 | Cultural exchange: renewed teaching, second skill, scouts welcome again | M | P2 |
| 4 | Mutual defence: the pact, braves defending partners (also against the King's troops), garrisons next to settlements | L | P2 |
| 5 | Victory `prosperity`, `gameOver.partners`, score lines; game-over screen, arena and tournament tables | M | P1 |
| 6 | Computer nations per level (N11), tuning against N12 in the Americas and the Caribbean, docs (SCENARIOS.md) | M–L | P1 |

Total: about **XL**, like Beta 1.

## 6. Notes for Australia

What Beta 2 leaves ready, without building Australia's content:
- A people is a party without needing a fixed settlement (N1), so a people living in seasonal camps can hold treaties.
- Land reaches through one function (`nativeLandOwner`, N6), so a stored map can give each tile its people (Country) later.
- Land use (N5) is the model for pastoral leases and access to water; its rent and effects are scenario data.
- `prosperity` (N10) and the treaty records are what a Federation victory can read.
- The interface (N13) is built for many small peoples.

The care asked for in [australia.md](australia.md) applies here too: the text must treat peoples as nations that choose, not as obstacles or resources.

## 7. Questions for Simon (answered: all recommendations agreed, 11 November 2026)

1. **N1** A people is a treaty party `{ kind: 'people', id }` with new treaty kinds; natives stay as tribes and settlements, not players. Agree?
2. **N2** Four kinds as a ladder (trade → land use or exchange → defence); defence with one nation at a time?
3. **N3** A new standing record per nation and people, with hidden seeded thresholds (years of good relations, trade), as Favoured Nation?
4. **N4** Trade treaty: better prices, more goods, more trade visits, and trade routes that stop at settlements?
5. **N5** Land use as a lease with yearly rent; the land stays the people's and is gathered from at half rate?
6. **N6** Native land's reach as scenario data per settlement kind (Americas stays at 1), Country per tile later?
7. **N7** Exchange: settlements teach again every 25 ± 5 years; defence: a two-way defensive pact with braves defending the partner?
8. **N8** Peoples decide by simple seeded rules in the engine, with an optional temperament; breaking faith ends all treaties with that people?
9. **N9** No peoples in European alliances; defence partners' braves fight the King's troops near their land; the Crown's own native allies later?
10. **N10** A `prosperity` victory after concord in the order; partner peoples named on the game-over screen but not in `winners`?
11. **N11** Creative seeks all kinds, Competent trade and land, Combative trade and defence for war, Naive only accepts?
12. **N12** Targets: trade in almost every game, land use and exchange in about half, defence in 1 of 4, `prosperity` once in 20–30; scenarios change them?
13. **N13** Propose from Foreign Affairs' Native peoples card; treaty details on the settlement screen; offers in the turn-start briefing?
14. **N14** Out of scope as listed; and the clean-ups (native constants as scenario data, France's teaching as a modifier, companies spared by natives) in step 0?

## 8. Implementation (step 0, November 2026)

Built on branch `beta2/step0`. Code: `treaties.ts` (party helpers), `types.ts` (`TreatyParty`, `PeopleTreatyKind`, `PeopleRelation`, `GameState.peopleRelations`), `natives.ts` (the standing record, `nativeLandOwner`, `tensionLabel`, the companies), `rules/natives.ts` (`NATIVE_RULES`, `landRadius`), `scenarios/index.ts` (`nativeRulesOf`, `landReachOf`), `scenarios/types.ts` (`peoples.rules`, the two switches), `braves.ts`, `rumours.ts`, `combat.ts`, `relations.ts` (`peoplePairRandom`), `events/effects.ts`, `rules/modifiers.ts` and `rules/nations.ts`; in the web game `ui/diplomacy.ts`, `ui/reports.ts`, `ui/natives.ts` and `app.ts`. Tests: `test/native-partners.test.ts` (28 tests: the party helpers, the record, the rules and switches, land's reach and each fix); the switches also have test variants in `test/mechanics-variants.ts`.

### What was built

- **A people as a treaty party (N1).** `TreatyParty` is `{ kind: 'nation'; id: NationId } | { kind: 'people'; id: TribeId }`. Treaty code reads parties only through helpers in `treaties.ts`: `partyIsNation`, `partyIsPeople`, `nationParty`, `peopleParty`, `sameParty`, `partyName` ("the Arawak"), `bound` and `boundPeople`, `treatyNations` and `treatyPeoples`, `withPeople`. `alliances.ts` no longer builds parties by hand. `addTreaty` takes nation ids or parties. The four kinds of N1 are in `TreatyKind` with their names (Trade treaty, Land use, Cultural exchange, Mutual defence); none is made yet. Foreign Affairs lists a treaty with a people like any other ("France and the Arawak, since 1680"); its "Between other nations" fold reads "Between others" once a people is among them.
- **Standing with a people (N3).** `GameState.peopleRelations`, keyed `"nation|people"` (`peopleRelationKey`), each a `PeopleRelation`: `nation`, `people`, `goodSince`, `volume`, `waitUntil`, `hostileUntil`, `breaks`, `proposal` (`{ kind: PeopleTreatyKind; from: 'nation' | 'people'; turn }`). It is written on a nation's first trade with the people (`notePeopleTrade`: sales and purchases at settlements and with visiting braves, the gold both ways) and absent until then; never for the Crown or a company. `goodSince` is the turn the current run of good relations began (at peace, the people's settlements below `content` on average, `goodRelations`), checked once a round after the braves for the records already written; `yearsOfGoodRelations` reads it. Hidden thresholds are drawn per pair from a seeded stream of their own (`peoplePairRandom` in `relations.ts`, `peopleThreshold` in `natives.ts`), never stored, never touching `GameState.rng`. Nothing reads the record yet; step 1 does.
- **`peoples.rules` (framework row 22).** The constants of `rules/natives.ts` are one table, `NATIVE_RULES` (braves, `braveChances`, `tension` thresholds, demands, prices, `burialRadius`, surrender, missions, inciting); a scenario overrides any part (`NativeRulesOverride`, the two tables field by field) and the engine reads `nativeRulesOf(s)`, cached per scenario. The Americas and the Caribbean use the engine's values. The few native numbers written inline in `natives.ts` (tension from founding, taking land, trading and gifts; peace below 250) stay code for now.
- **Switches (row 23):** `mechanics.burialGrounds` (off: the outcome is never drawn) and `mechanics.surrender` (off: a burned capital brings no surrender), both on in the Americas and the Caribbean. Scenarios now have fifteen switches.
- **Land's reach (N6, fix a):** `SettlementKindDef.landRadius` (absent: 1), read only by `nativeLandOwner`: a tile is the land of the nearest settlement whose kind reaches it, the first in the settlements' order on a tie. The furthest reach of a scenario is worked out once (`landReachIn`), so at radius 1 the function costs what it did. The Americas and the Caribbean stay at 1.
- **Mood labels (fix b):** `tensionLabel(t, thresholds)` now changes word where the braves change what they do: content (below 200: gifts and trade visits), wary (200–299), uneasy (300–599: demands), angry (600–799: attacks), furious (800 on: war). `tensionSeverity` gives the pill colour (warning from demands, bad from attacks). Foreign Affairs, the Natives report, the settlement dialog and the trading screen use them instead of their own copies of the numbers.
- **Companies spared (fix c):** `addTension` ignores companies as it ignores the Crown; `processNatives` leaves them out (no pressure, no drift, no war); braves never demand from, raid or attack a company's colony or units, even of a people at war with it (they still bring gifts and trade); `inciteTribe` refuses a company as target; a company's explorers find no burial grounds. `COMPANY_IDS` and `isCompanyIdent` moved to `rules/nations.ts`.
- **France's teaching (fix d):** a new hook, `nativesTeach { units }`; France carries `{ hook: 'nativesTeach', units: ['pettyCriminal'] }` in its bonus in both scenarios, so the Caribbean's "teach more readily" stays true. `learnSkill` no longer names France.
- **Pocahontas (fix e):** `peaceWithPeoples` also forgives the nation's desecrated burial grounds (it leaves the people's `burial` list), so the peace holds. Other nations' grievances stay. Telemetry: `natives:burial ground forgiven`.

### Choices made while building (for Simon)

1. **The mood words are five, with "wary" new** for 200–299 (no more gifts, no demands yet). N13's standing words should then avoid "wary" (for example "trusts you", "distrusts you").
2. **Companies find no burial grounds**, as part of being spared; otherwise a company scout could still put a people at war with it for good.
3. **The record is written on the first trade only.** A scout's visit or a mission (N13's other contacts) write nothing in step 0; step 1 can write it on those too when proposals need it.
4. **`TreatyEnd.by` is still a `NationId`.** When a people ends a treaty (step 1), it needs a party (or a `byPeople` field); no saved game has a people treaty yet, so that is cheap to change then.
5. **Forgiving the burial ground is the whole of fix e.** It turned out to matter more than expected (below): computer nations at war with a people for good value Pocahontas highly and pick her, and until now her peace lasted one round.

### Measurements

Every refactor was checked bit-identical (`npm run bench -- --verify`, with and without `--scenario caribbean`: "same"). Fixes c and e and the record changed games or saves, each in its own commit marked `[outcomes]`. The record changes no game: with `peopleRelations` left out of the hash, all eight bench games were "same"; with it, every bench and golden hash was re-recorded once. Fix c re-recorded the Caribbean's bench game seed 1492 (it has a company). Fixes b and e change no bench or golden game. Bench times are unchanged.

Tournaments, `npm run tournament -- --turns 609 --play-on --events --seed 1000` (the Caribbean `--turns 202 --events`), before step 0 → after. The 24-game Americas run after step 0 ran with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`, clean, with the same results as without.

| Run | Games changed | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 games | 12 of 24 | 723.1 → 681.0 | 499.8 → 509.4 | 471.5 → 486.4 | 243.0 → 242.5 |
| Americas, 48 games | 21 of 48 | 694.0 → 671.1 | 472.3 → 492.3 | 441.4 → 432.7 | 255.4 → 253.3 |
| Caribbean, 16 games | 1 of 16 | 97.0 → 96.8 | 104.7 → 104.7 | 122.1 → 121.6 | 61.3 → 60.9 |

- **Fix e is most of it.** Bisecting the commits on two changed games puts the change at fix e. In the 24 Americas games every burial ground disturbed was later forgiven (0.3, 0.1 and 0.2 per Competent, Combative and Creative nation and game). Combative loses about 20–40 points on average, within the noise of the games that change (a changed game moves by about 200 points either way); it still wins most games (15 of 24, 29 of 48). No level is clearly weaker.
- **Fix c:** 2 of the 3 Americas games with a company changed (24 games; 6 → 7 company games in 48), and 1 of the Caribbean's 8. Companies left alone by the braves pay more dividends: Americas 176 → 988 gold a game (24 games) and 618 → 1,144 (48 games); the Caribbean 318 → 322.
- Alliances: 8 of 24 Americas games with one, as before; concord 2 → 3 of 24; no confederation either way.

## 9. Implementation (step 1, November 2026)

Built on branch `beta2/step1`. Code: `peopletreaties.ts` (new: the rules, unlocking, proposals and answers, offers, effects, breaking faith, the people's own ending, route stops, the standing words), with hooks in `natives.ts` (prices, tension, contact, land taken, inciting, the round), `braves.ts` (gathering, prices, trade visits, the people's offers), `combat.ts` (attacks), `routes.ts` (settlement stops), `treaties.ts` (`peopleTreatyBetween`, `treatiesWithPeople`, `treatyEndedBy`), `commands.ts` (`proposePeopleTreaty`), `ai/natives.ts` and `ai/foreign.ts` (computer nations), `alliances.ts` (`COOPERATION`, `LEVEL_COOPERATION`), `arena.ts` and `scripts/tournament.ts` (counts); scenario data in `scenarios/types.ts` (`Mechanics.peopleTreaties`, `Scenario.peopleTreaties`, `PeopleTreatyRules`, `Cooperation.proposePeopleTrade` and `acceptPeopleOffer`), `rules/nations.ts` (`Temperament`), `americas.ts` and `caribbean.ts`; in the web game `ui/diplomacy.ts`, `ui/natives.ts`, `ui/turnstart.ts`, `ui/routes.ts`, `app.ts` and `style.css`. Tests: `test/people-trade.test.ts` (22 tests: the switch in both scenarios, unlocking, contact, proposals and answers, temperament and scenario numbers, offers to a person and to a computer, each effect, route stops, the three breaches, the people's own ending, route stops dropped, a computer game, the switch off).

### What was built

- **The trade treaty** (`people-trade`, N1, N4): a `Treaty` between `nationParty(nation)` and `peopleParty(people)`, read through the party helpers. Switched by `mechanics.peopleTreaties` (the kinds in play); with it off nothing runs, writes or draws, and every bench game stayed "same" until the switching commit.
- **Unlocking (N3):** contact first (the standing record), then years of good relations (8 ± 3) and gold traded with the people (100–400), hidden, drawn per pair from `peoplePairRandom` (`peopleTradeThresholds`), scaled by the people's temperament, never stored.
- **Contact (step 0's note 3):** with the switch on, the record is also written by a scout's visit to a chief, a mission founded, and a brave come to trade at a colony; still never for the Crown or a company, and not at all with the switch off.
- **Proposals and answers (N8):** `proposePeopleTreaty` checks what the nation can know (`peopleTreatyProblem`: contact, peace, not submitted, no treaty or pending offer, no waiting or hostility, unlocked; shown in words), then the people answers at once: it refuses while one of its settlements is angry with the nation, or within `landYears` (20) of land taken from it (`PeopleRelation.tookLand`, a new optional field, written only with the switch on), and otherwise accepts at `accept` (0.8) times its temperament, drawn per pair and turn (the same turn gives the same answer).
- **The people's offers:** a brave come to trade at a colony brings its people's offer when the treaty is unlocked and nothing stands against it, at `offer` (0.3) times the temperament. For a person it is a `NativeDemand` of kind `'treaty'` (`treaty: 'people-trade'`, `amount` 0): the brave waits as for a demand, the turn-start briefing shows it, and the same `answerNativeDemand` command accepts or declines it; unanswered, it is declined. A computer nation answers at once.
- **Temperament (N8):** `peoples.overrides[id].temperament`, `open`, `guarded` or `proud`, multiplying the chances to accept and to offer and the thresholds (`PeopleTreatyRules.temperaments`). No people has one in the Americas or the Caribbean.
- **Effects (N4),** every number in `Scenario.peopleTreaties.trade`: settlements pay 1.2 times as much for the partner's goods (`nativeOffer` now takes the nation) and ask 0.8 times as much for theirs (`nativeUnitPrice`); a people with any trade treaty gathers 1.25 times as much (`settlementProduce`); its braves set out to trade at the partner's colonies twice as often; tension towards the partner falls 2 more a round. Each is a factor of exactly 1 (or 0) without a treaty, so the arithmetic is unchanged then.
- **Route stops:** a route may stop at a settlement of a people the owner has a trade treaty with and is at peace with (the route editor lists them by people). The unit stops next to it and, as a wagon train does there, sells the listed good the settlement pays most for (up to 100) and buys the listed good it has most of; the deal ends its moves for the turn. When the treaty ends, the stops at that people's settlements are dropped, as stops at a former partner's colonies are.
- **Breaking faith (N8):** taking a partner's land (`takeLand`), attacking its braves or settlements (`combat.ts`, wherever the people turns hostile) or inciting it (`inciteTribe`) ends every treaty with the people (`why: 'broken'`, by the nation), adds 200 tension at each of its settlements, and sets waiting (15 ± 3 years) and hostility (25 ± 5), drawn per pair and breach (`breaks`). While hostile, the people's braves bring no gifts and come to no trade, and it makes no offers.
- **The people ends a treaty:** once a round, after the braves, when one of its settlements has turned angry with the partner (`why: 'cancelled'`), with war (`'war'`), or when it has no settlements left (`'lapsed'`). No waiting or hostility follows.
- **`TreatyEnd.by` is a party** (step 0's note 4): `NationId | TreatyParty`, a nation saved by its bare id as before (so saved European treaties keep their text), a people as `{ kind: 'people', id }`; read with `treatyEndedBy`. `describeTreaty` names either ("cancelled by the Apache", "broken by England").
- **Standing in words (N13, step 0's note 1):** `peopleStanding`: "No contact yet", "At war", "Distrusts you" (hostile), "Remembers the broken treaty" (waiting), "Partners in trade", or by the nearer of the two thresholds "Barely knows you", "Getting to know you", "Thinks well of you", "Trusts you". None of them is a mood word.
- **Computer nations (N11):** on their foreign review (every five turns), Creative, Competent and Combative propose to each people they may make a treaty with and that would not refuse them, at `proposePeopleTrade` (0.5) times the level's share (`LEVEL_COOPERATION.people`: Creative 1, Competent 0.8, Combative 0.5 and only with 300 gold traded with that people, Naive 0). They accept a people's offer at `acceptPeopleOffer` (0.9) times `peopleAccept` (Creative and Competent 1, Combative 0.7, Naive 0.8). All drawn from the pair's own stream. Combative no longer incites a partner; its `land: 'take'` rule still takes a partner's land, and so breaks faith.
- **Interface (N13):** Foreign Affairs' "Native peoples" card has a row per people met, with Standing and Treaties columns and a Propose button once in contact (its title says why not, in words); partners come first, then peoples in contact, and peoples only seen are folded into "Seen, not yet met"; the table scrolls. The trading dialog shows the treaty, since when, and its benefits (or the standing); the turn-start briefing shows a people's offer; the route editor offers partner settlements.
- **Tournaments:** the line per game counts people treaties made, ended and breaches; the summary adds "Treaties with peoples: n of N games with one, made per game (by level), ended, breaches, in force at the end".
- **The Caribbean's own numbers:** its colonies hardly trade at settlements (computer nations had traded no gold with most peoples they had met), so a trade treaty there needs only years of good relations (`trade.volume` 0–0, as its alliances need no trade); its peoples offer at 0.5 a visit and computer nations propose at 0.8.

### Choices made while building (for Simon)

1. **"Inciting against it" is read as inciting the partner itself** (paying it to make war on another nation). Today a nation can only incite a people against a nation, never against a people, so the other reading has nothing to hook on. Easy to change.
2. **Temperaments are `open`, `guarded` and `proud`,** not N8's "open, wary, proud", since "wary" is now a mood word (200–299).
3. **A brave come to trade is contact**, beside a scout's visit, a mission and a trade. Without it few Caribbean peoples were ever in contact with a computer nation.
4. **A nation cannot end a trade treaty with a people on its own**, except by breaking faith; only the people ends one (anger, war). A plain cancellation, as for a trade agreement between nations, would be a small addition if wanted.
5. **The pending offer is the `NativeDemand`;** `PeopleRelation.proposal` stays unwritten (nation proposals are answered at once, as N13 says). The field is kept for later kinds.
6. **A people ending a treaty in anger sets no waiting or hostility;** only breaking faith does.
7. **Land taken without paying keeps new treaties away for 20 years whether or not there was a treaty** (N8's refusal), and is a breach only with one.
8. **Computer nations do not yet build trade routes to partner settlements;** the rule is there for people, and for step 6.

### Measurements

Every commit before the switching one kept the bench games "same" (`npm run bench -- --verify`, with and without `--scenario caribbean`). The switching commit (`[outcomes]`) re-recorded the bench hashes, the golden hashes and the Caribbean game's snapshot; the commits after it kept them.

Tournaments, `npm run tournament -- --turns 609 --play-on --events` (the Caribbean `--turns 202`), switch off → on, average score:

| Run | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: |
| Americas, 24 games, seed 1000 | 681.0 → 624.5 | 509.4 → 502.5 | 486.4 → 507.1 | 242.5 → 246.2 |
| Americas, 48 games, seed 1000 | 671.1 → 605.3 | 492.3 → 478.5 | 432.7 → 454.6 | 253.3 → 267.2 |
| Americas, 24 games, seed 2000 | 661.8 → 674.2 | 448.2 → 454.6 | 437.4 → 438.7 | 254.5 → 234.4 |
| Caribbean, 16 games, seed 1000 | 96.8 → 99.9 | 104.7 → 104.0 | 121.6 → 124.6 | 60.9 → 63.2 |

Treaties with peoples, with the switch on:

| Run | Games with one | Made per game (Creative, Competent, Combative, Naive) | Ended per game | Games with a breach | In force at the end |
| --- | ---: | --- | ---: | ---: | ---: |
| Americas, 24 games, seed 1000 | 24 of 24 | 5.1 (2.1, 1.9, 0.7, 0.4) | 2.8 | 4 of 24 | 2.3 |
| Americas, 48 games, seed 1000 | 46 of 48 | 4.7 (1.8, 1.6, 0.8, 0.5) | 2.7 | 10 of 48 | 2.0 |
| Americas, 24 games, seed 2000 | 23 of 24 | 5.3 (1.8, 2.2, 1.0, 0.3) | 2.5 | 8 of 24 | 2.8 |
| Caribbean, 16 games | 16 of 16 | 3.1 (1.4, 1.1, 0.3, 0.4) | 0.6 | 2 of 16 | 2.5 |

- **Against N12:** a trade treaty with a people in almost every Americas four-level game (93 of 96 games over the three runs), Creative and Competent with about two each (N12: 1–3). A breach in about one game in five (N12 aims at one in three for all kinds together; most come from Combative's land taking). About half the treaties made end before the game does, nearly all by the people in anger; Creative and Competent then often make another.
- **Combative** lost 57–66 points on the seed-1000 runs and gained 12 on seed 2000; on seed 1000 almost all of the drop is its independence line (fewer wars won), the line that varies most between games. No level is clearly weaker or stronger; a changed game moves by about 200 points either way, and with the switch on nearly every game changes. Step 6 tunes against N12 with larger samples.
- Alliances, concord and companies move within their noise (Americas 24 games: an alliance in 8 → 9 games, concord 3 → 2; the Caribbean: companies in 8 → 11 of 16).
- The 24-game Americas run with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean, every game line the same as without the checks. A Playwright smoke of the built web game with Google Fonts blocked (a head start to 1700 in the Americas and the Caribbean, Foreign Affairs opened) had no page errors; the Native peoples card showed a partner first ("Partners in trade", "Trade treaty") and Propose buttons with their reasons.

## 10. Implementation (step 2, November 2026)

Built on branch `beta2/step2`. Code: `peopletreaties.ts` (the lease: unlocking, the tiles, rent, rent day and lapse, release, the words), with hooks in `natives.ts` (`nativeLandClosedTo`, buying and taking leased land, the pressure in `processNatives`), `braves.ts` (gathering), `colony.ts` (`colonyOccupancy` and `validateJob` open leased tiles to the lessee's colonies), `ai/natives.ts` (`leaseLand`), `ai/advanced.ts` (no buying of land already leased), `alliances.ts` (`proposeLandUse`, `LEVEL_COOPERATION.land`), `arena.ts` and `scripts/tournament.ts` (counts); state in `types.ts` (`Tile.use`, `LandUseTerms` in `TreatyTerms`); scenario data in `scenarios/types.ts` (`PeopleLandUseRules`, `Cooperation.proposeLandUse`), `americas.ts` and `caribbean.ts`; in the web game `ui/diplomacy.ts`, `ui/natives.ts`, `ui/colony.ts`, `app.ts` and `style.css`; in the renderers `style-ligne-claire` (and so the sprite style) and `style-schematic`. Tests: `test/land-use.test.ts` (17 tests: the switch, unlocking on the ladder and its own draw, land and rent needed, the answer and the first year's rent, refusal, working a leased tile and only the lessee, rent day, lapse with workers moved, rent day taking in and letting go of land, half gathering, half pressure, buying against taking, the people's own ending, the levels, a computer game that leases and works the land with a plain JSON save, the switch off).

### What was built

- **The lease** (`land-use`, N5): a `Treaty` between `nationParty(nation)` and `peopleParty(people)` with terms `{ kind: 'land-use', rent, due }`. It covers the people's land beside the nation's colonies (each colony's work area; `nativeLandOwner`, so not bought or taken; not leased to another nation): each such tile carries `Tile.use = nation`, absent otherwise. The land stays the people's: `nativeLandOwner` still names its settlement.
- **Unlocking (N2, N3):** a trade treaty with the people first (the ladder), then years of good relations against a hidden threshold of its own (`landUse.years`, 12 ± 4), drawn per pair from `peoplePairRandom` (`'land years'`) and scaled by the temperament. Then the shared checks (contact, peace, not submitted, no waiting or hostility), land of the people beside a colony, and the first year's rent in hand. All shown in words (`peopleTreatyProblem(s, nation, people, 'land-use')`).
- **Answers (N8):** as for a trade treaty: refused while a settlement is angry or within `landYears` of land taken, otherwise at `accept` times the temperament.
- **Rent:** per tile a year, `landUse.rent` (0.05) times the average `landPrice` of the tiles when the lease is made (kind, capital, tension, Peter Minuit), at least 1 gold; kept in the terms. The first year is paid at once; each tile's rent goes to the settlement whose land it is. On rent day (a year after the making, then yearly) the lease takes in the people's land beside new colonies and lets go of tiles no colony of the nation is beside (workers there find other work), and the nation pays for the tiles it has then. A message names the rent paid.
- **Lapse:** a nation that cannot pay on rent day loses the lease: `why: 'lapsed'`, ended by the people (saved as `by`, not shown, as for every lapsed treaty), no breach, no waiting; the tiles go back and their workers take the best job left in their colony (or wait at the gate).
- **Working:** `nativeLandClosedTo(s, nation, x, y)` is native land not leased to that nation; colonies read it in `colonyOccupancy` and `validateJob`, so a leased tile is open to the lessee's colonies (the computer players' job search included, through the occupancy) and closed to everyone else's.
- **Gathering:** a settlement gathers `landUse.gather` (0.5) times as much from a leased tile.
- **Tension:** a colony with land leased from a people in its work area presses `landUse.pressure` (0.5) times as hard on that people's settlements (`leasedFromBeside`, worked out once a round, empty without a lease).
- **Buying and taking:** a leased tile can be bought at the usual price; it leaves the lease (`Tile.use` cleared) and the rest holds. Taking one is a breach (step 1's `breakFaith`): every treaty with the people ends, the other leased tiles go back. The taken tile is the taker's first, so its worker stays.
- **Endings:** any end of a lease (breach, the people's anger or war, lapse) releases its tiles. A lease without a trade treaty in force ends too (in practice they end together).
- **Computer nations (N11):** on the foreign review, a nation with a trade treaty proposes land use at `proposeLandUse` (0.5) times `LEVEL_COOPERATION.land` (Creative 1, Competent 0.8, Combative and Naive 0), only with three years' rent and 300 gold in hand, drawn from the pair's own stream. `acquireLand` no longer buys tiles leased to the nation.
- **Interface (N13):** Foreign Affairs' Native peoples card shows "Land use (n tiles, r gold a tile a year)" and, beside a trade treaty, a "Lease land" button with its reason in the title; a note explains leases. The settlement dialog and the trading dialog show the lease, its tiles, rent and next rent day. On the colony screen a leased tile is marked (`.cell.leased`), worked like the colony's own, and clicking native land offers "Lease their land beside your colonies" next to buying and taking. The map marks leased tiles with a faint dashed frame in the lessee's colour (read from `Tile.use`, which the render API's `LayerTile` already carries: no new field).
- **Tournaments:** the per-game line adds "leases n (lapsed m)"; the summary adds "Land use: n of N games with a lease, made per game (by level), lapsed, gold of rent per game". Leases also count among "people treaties" made and ended.

### Choices made while building (for Simon)

1. **One lease per nation and people covers all their land beside its colonies,** not tiles chosen one by one; new colonies' land joins on the next rent day, not at once.
2. **Rent is per tile, its rate set when the lease is made** (a twentieth of the land's price then); the yearly total follows the tiles leased. So buying a leased tile lowers the rent, and a lease whose tiles were all bought stays in force at no rent.
3. **A lapse sets no waiting:** the nation may ask again as soon as it can pay. Computer nations lapse fairly often (0.4 a game, a third of their leases): they keep no rent reserve after the lease is made. A reserve would be a step 6 tuning.
4. **Peoples do not offer leases themselves;** only trade treaties come through a visiting brave. The nation asks for land.
5. **"Colonies on leased land press half as hard"** is read as: a colony with at least one tile leased from that people beside it presses half on each of that people's settlements within reach.
6. **Leased tiles are drawn for every viewer** (treaties are public, as claims are).
7. **The tournament counts** of people treaties now include leases, so "made per game" rose in both scenarios.

### Measurements

Every commit before the switching one kept the bench games "same" (`npm run bench -- --verify`, with and without `--scenario caribbean`). The switching commit (`[outcomes]`) re-recorded 3 of 4 Americas bench hashes and 1 of 4 Caribbean ones, one golden hash and the Caribbean game's snapshot.

Tournaments, `npm run tournament -- --turns 609 --play-on --events --seed 1000` (the Caribbean `--turns 202`), land use off → on, average score:

| Run | Games changed | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 games | 14 of 24 | 624.5 → 617.8 | 502.5 → 514.9 | 507.1 → 494.9 | 246.2 → 249.8 |
| Americas, 48 games | 31 of 48 | 605.3 → 580.1 | 478.5 → 483.0 | 454.6 → 448.4 | 267.2 → 263.5 |
| Caribbean, 16 games | 10 of 16 | 99.9 → 94.6 | 104.0 → 107.3 | 124.6 → 121.3 | 63.2 → 62.8 |

Leases, with the switch on:

| Run | Games with a lease | Made per game (Creative, Competent) | Lapsed per game | Rent per game |
| --- | ---: | --- | ---: | ---: |
| Americas, 24 games | 14 of 24 | 1.1 (0.7, 0.5) | 0.4 | 4,190 gold |
| Americas, 48 games | 31 of 48 | 1.1 (0.6, 0.5) | 0.4 | 3,478 gold |
| Caribbean, 16 games | 11 of 16 | 1.3 (0.9, 0.4) | 0.2 | 1,088 gold |

- **Against N12:** land use in about half the Americas four-level games: 14 of 24 and 31 of 48 (58% and 65%), with the engine's numbers, untuned. Only Creative and Competent lease, as N11 says.
- **Scores** move within the noise of the games that change (a changed game moves by about 200 points either way); Combative lost 25 points on 48 games and 7 on 24. In a probe game the computer colonies worked about a third of their leased tiles: they work them where the job search values them.
- The 24-game Americas run with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean, every game line the same as without the checks. A Playwright smoke of the built web game with Google Fonts blocked (a head start to 1700 in the Americas and the Caribbean, a lease set up in the state, Foreign Affairs and a colony screen opened) had no page errors; the Native peoples card showed "Land use (3 tiles, 7 gold a tile a year)" and a "Lease land" button with its reason, and the colony screen three leased cells.

## 11. Implementation (step 3, November 2026)

Built on branch `beta2/step3`. Code: `peopletreaties.ts` (the exchange: unlocking, renewed teaching, the chief's welcome, gathering, the words), with hooks in `natives.ts` (`learnSkill`, `speakToChief`), `relations.ts` (`settlementRandom`), `ai/natives.ts` (`seekExchange`, `sendLearner`), `ai/advanced.ts` (scouts and wandering colonists read `chiefWelcomes` and `settlementTeaches`), `ai/foreign.ts`, `alliances.ts` (`proposeExchange`, `LEVEL_COOPERATION.exchange`), `reports.ts` (the Natives report shows a renewed skill), `arena.ts` and `scripts/tournament.ts` (counts); state in `types.ts` (`Settlement.taughtAt`, `Settlement.spokeAt`); scenario data in `scenarios/types.ts` (`PeopleExchangeRules`, `Cooperation.proposeExchange`), `americas.ts` and `caribbean.ts`; in the web game `ui/diplomacy.ts`, `ui/natives.ts` and `app.ts`. Tests: `test/exchange.test.ts` (14 tests: the switch, the ladder and its own threshold, answers and refusal, the benefits text, teaching once without an exchange, teaching a partner again only and only after 25 ± 5 years, the drawn skill, teaching ending with the exchange, the chief's welcome once a decade and only for a partner, gathering, the endings with the trade treaty and by breaking faith, the levels, a computer game that makes exchanges and learns again with a plain JSON save, the switch off).

### What was built

- **The exchange** (`exchange`, N7): a `Treaty` between `nationParty(nation)` and `peopleParty(people)`, no terms. Switched by `mechanics.peopleTreaties` including `exchange`; with it off nothing runs, writes or draws, and every bench game stayed "same" until the switching commit.
- **Unlocking (N2, N3):** a trade treaty with the people first, then years of good relations against a hidden threshold of its own (`exchange.years`, 12 ± 4), drawn per pair (`'exchange years'`) and scaled by the temperament; then the shared checks (`peopleTreatyProblem(s, nation, people, 'exchange')`), in words.
- **Answers and endings (N8):** as step 1's: refused while a settlement is angry or within `landYears` of land taken, otherwise at `accept` times the temperament. The people ends an exchange with war, an angry settlement, its last settlement gone, or when the trade treaty it stands on ends (as land use); breaking faith ends it with the rest. Peoples do not offer exchanges themselves.
- **Renewed teaching:** a settlement notes the turn it last taught (`Settlement.taughtAt`, written by `learnSkill` only while the scenario has exchanges). Once its first skill is taught, it teaches a nation with an exchange with its people again `exchange.teachYears` (25 ± 5) after it last taught (`teachAgainTurn`), a skill drawn from its people's skills (`renewedSkill`). Both draws are per settlement and teaching, from a seeded stream of the settlement's own (`settlementRandom`), never `GameState.rng`, never stored. `settlementTeaches(s, st, nation)` is what `learnSkill`, the computer players, the settlement dialog and the Natives report read; without an exchange it is `st.skill`, as before. Only the partner learns again; others find nothing to teach. Teaching again sets `taughtAt`, so the next renewal is a generation later.
- **Scouts welcome again:** `Settlement.spokeAt` notes each nation's last visit (only while the scenario has exchanges). A partner's scout may speak with a chief again `exchange.speakYears` (10) after its last visit (`chiefWelcomes`, `chiefAgainTurn`), with the usual outcomes (tales of the land, a gift, or nothing); a scout that comes too soon hears when it will be welcome.
- **Gathering:** a people with an exchange with anyone gathers `exchange.gather` (1.25) times as much for sale, on top of the trade treaty's (`peopleGatherFactor`).
- **Missions** are unchanged.
- **Computer nations (N11):** Creative seeks exchanges (`LEVEL_COOPERATION.exchange` 1), Competent at 0.6, Combative and Naive never propose. Whether a nation seeks an exchange with a trade partner is drawn **once per pair** (`proposeExchange` 0.3 times the share), and only for a people with a settlement within six tiles of one of its colonies; one that seeks it proposes on each foreign review until the people agrees. A nation with an exchange sends one colonist a review (the least skilled free colonist of the nearest colony with more than three, within six tiles) to a settlement that teaches it again; that colonist, like any colonist on the map, walks there and learns (`colonistTurn`), and the scouts' rounds include chiefs that welcome them again.
- **Interface (N13):** Foreign Affairs' Native peoples card shows "Cultural exchange" among the treaties and, beside a trade treaty, a "Propose exchange" button with its reason in the title; a note explains exchanges. The settlement dialog and the trading dialog show the exchange, since when, "It teaches again in n years (date)" or the skill it teaches again, and when the chief welcomes the scouts again; "Live among the natives" offers the renewed skill; "Speak with the chief" reads "again (welcome under your cultural exchange)" or "(welcome again in n years)".
- **Tournaments:** the per-game line adds "exchanges n (ended m, taught again k)"; the summary adds "Cultural exchange: n of N games with one, made per game (by level), ended, colonists taught again per game". Exchanges also count among "people treaties" made and ended.

### Choices made while building (for Simon)

1. **No second skill.** Section 3 and step 3 in section 5 say a settlement "teaches a second skill"; N7's recommendation (what was decided) lists renewed teaching, scouts, gathering and missions, not a second skill. Built as N7. A renewed teaching draws from the people's skills, so it may well be another skill than the first; a true second skill at once would be a small addition (another draw when the exchange is made).
2. **Renewed teaching is for the partner only;** other nations still find "nothing to teach" once the first skill is taught. The renewal date belongs to the settlement (drawn per settlement and teaching), so two partners of one people share it, and whichever learns first resets it.
3. **Computer nations seek an exchange once per pair, not per review.** Proposed on each review at 0.5, an exchange came in 43 of 48 Americas games; even 0.03 a review gave 36 of 48 (a pair has about a hundred reviews). Drawn once per pair at 0.3 it comes in about half (23 of 48), as N12 asks. `proposeExchange` therefore means "the chance a nation seeks one with a given partner", unlike the other `propose…` chances, which are per review.
4. **The exchange's own threshold is 12 ± 4 years,** as land use's; N3 leaves the number open. Raising it to 20 ± 5 lowered the rate only a little (40 of 48 at 0.1 a review).
5. **Peoples do not offer exchanges** (as with leases); only trade treaties come through a visiting brave.
6. **Computer nations send a colonist out to learn** (`sendLearner`), beyond the existing rule that a colonist on the map learns from a settlement within eight tiles; one learner a review for the whole nation.
7. **The new fields are written whenever the switch is on,** also without an exchange in force, so a settlement that taught before the exchange was made still renews; that is why every bench hash changed at the switching commit while only games with an exchange play differently.

**Decided by Simon (11 November 2026), after reviewing step 3:**
- Renewed teaching stays at 25 ± 5 years for now; its strength (about ten free experts per exchange per Americas game) is to be tuned in step 6 (on step 6's to-do list, section 12).
- Computer nations decide once per partner whether to seek an exchange (`proposeExchange` as a per-partner chance): agreed.

### Measurements

Every commit before the switching one kept the bench games "same" (`npm run bench -- --verify`, with and without `--scenario caribbean`). The switching commit (`[outcomes]`) re-recorded all eight bench hashes, both golden hashes and the Caribbean game's snapshot (the new fields are written in every game); in the tournaments only games where an exchange was made play differently.

Tournaments, `npm run tournament -- --turns 609 --play-on --events --seed 1000` (the Caribbean `--turns 202 --events`), exchange off → on, average score:

| Run | Games changed | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 games | 14 of 24 | 617.8 → 597.6 | 514.9 → 548.8 | 494.9 → 521.8 | 249.8 → 249.1 |
| Americas, 48 games | 23 of 48 | 580.1 → 600.7 | 483.0 → 505.1 | 448.4 → 474.9 | 263.5 → 260.4 |
| Caribbean, 16 games | 8 of 16 | 94.6 → 96.9 | 107.3 → 109.9 | 121.2 → 122.4 | 62.8 → 63.3 |

Exchanges, with the switch on:

| Run | Games with one | Made per game (Creative, Competent) | Ended per game | Colonists taught again per game |
| --- | ---: | --- | ---: | ---: |
| Americas, 24 games | 14 of 24 | 0.9 (0.2, 0.7) | 0.5 | 9.6 |
| Americas, 48 games | 23 of 48 | 0.8 (0.3, 0.4) | 0.4 | 8.0 |
| Caribbean, 16 games | 8 of 16 | 0.8 (0.5, 0.3) | 0 | 2.6 |

- **Against N12:** an exchange in about half the Americas four-level games (23 of 48, 48%; 14 of 24), only by Creative and Competent.
- **Scores:** Creative and Competent gain 22–34 points on average (renewed teachings are free experts: about ten per exchange over an Americas game, unevenly: one game with two exchanges had 48); Combative and Naive move within the noise of the games that change (a changed game moves by about 200 points either way). With exchanges sought on every review (43 of 48 games, 35 teachings a game), Competent gained 81 points on 48 games, which is why the per-pair draw matters; step 6 may want to weigh renewed teaching against N12 again.
- The 24-game Americas run with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean, every game line the same as without the checks (and the same as the first 24 games of the 48-game run). A Playwright smoke of the built web game with Google Fonts blocked (a head start to 1700 in the Americas and the Caribbean, an exchange set up in the state, Foreign Affairs and two settlement dialogs opened) had no page errors; the Native peoples card showed "Cultural exchange" and a "Propose exchange" button with its benefits, one settlement "It teaches again: … become an Expert Fisherman" with "Speak with the chief again", another "It teaches again in 25 years (Autumn 1725)" and "welcome again in 9 years".

## 12. Implementation (step 4, November 2026)

Built on branch `beta2/step4`. Code: `peopletreaties.ts` (the pact: unlocking, one partner per people, the ladder's ending, `callToDefence`, `defenceEnemy`, `defendedByFriend`, the words), with hooks in `combat.ts` (`hostile`: an attack on the people is war with its partner; `attack`: an attack on the partner's colony calls the people; computer players never attack a people defended by a friend), `braves.ts` (braves set out against the partner's enemies and the King's troops; a disarmed King's regular is destroyed, as in combat), `natives.ts` (`inciteTribe`), `ai/natives.ts` (`seekDefence`, inciting), `ai/common.ts` and `ai/advanced.ts` (no fights or raids that would start a war with a friend, or raids on a people defended by a nation at peace), `alliances.ts` (`proposeDefence`, `LEVEL_COOPERATION.defence`), `arena.ts` and `scripts/tournament.ts` (counts); state in `types.ts` (`BraveTask` `attack` gains `defend`); scenario data in `scenarios/types.ts` (`PeopleDefenceRules`, `Cooperation.proposeDefence`), `americas.ts` and `caribbean.ts`; in the web game `ui/diplomacy.ts`, `ui/natives.ts` and `app.ts`. Tests: `test/defence.test.ts` (16 tests: the switch, the ladder and its own threshold, the pact made and described, one nation at a time, a submitted people, the ladder's ending, war on the people drawing in the partner, an ally attacking the partner's people leaving the alliance, a computer player held back by its ally's pact, braves defending a colony with the people going to war, braves against the King's troops after independence, no inciting against the partner, a partner's soldiers next to a settlement, the levels, a computer game that makes pacts with a plain JSON save, the switch off).

### What was built

- **The pact** (`defence`, N7): a `Treaty` between `nationParty(nation)` and `peopleParty(people)`, no terms. Switched by `mechanics.peopleTreaties` including `defence`; with it off nothing runs, writes or draws, and every bench game stayed "same" until the switching commit.
- **Unlocking (N2, N3):** a trade treaty and one of land use or a cultural exchange with the people first, then years of good relations against a hidden threshold of its own (`defence.years`, 16 ± 4, `'defence years'`), scaled by the temperament; then the shared checks (`peopleTreatyProblem(s, nation, people, 'defence')`; a submitted people makes none with that nation). A people keeps a pact with **one nation at a time** (`defencePartner`): another nation is told "The Arawak already have a mutual defence pact with England."
- **Answers and endings (N8):** as step 1's: refused while a settlement is angry or within `landYears` of land taken, otherwise at `accept` times the temperament. The people ends the pact with war, an angry settlement or its last settlement gone; it ends with the trade treaty, or when both land use and the exchange have ended (the ladder); breaking faith ends it with the rest. Peoples do not offer pacts themselves.
- **War on the people (N7):** a European nation's attack on the people's braves or settlements (`combat.ts` `hostile`) is war with its partner, declared by the attacker through `declareWar`, after the attacker's own treaties with the people have ended (breaking faith). A broadcast message and a History entry say the partner "stands by its pact".
- **The alliance rule falls out (N9):** an ally of the partner that attacks the people declares war on its ally, and `onWar` makes that leaving the alliance (Favoured Nation cancelled, waiting and hostility), as for any war on an ally. Tested. Computer players, as Beta 1's rule for nations, never attack a people whose partner is their Favoured Nation or ally or whose war would bring in a friend (`defendedByFriend`), and do not raid a settlement of a people defended by a nation they are at peace with.
- **Braves defend the partner's colony:** an attack on the partner's colony within `visitRange` (6) of one of the people's settlements (`callToDefence`, from `attack`) puts the people at war with the attacker (every settlement gains `defence.tension`, 300, towards it, so the war lasts until it has calmed), and sends the idle or wandering braves of those settlements against the attacking unit (`BraveTask` `attack` with `defend: partner`). Braves at home also set out, at `defence.defend` (0.5, on the brave's usual roll, so no new draw), against a unit in the open within `defence.near` (2) tiles of a partner's colony in their reach, of a nation the people and the partner are both at war with (`defenceEnemy`). A people that submitted to the attacker stays out; privateers and companies call no one.
- **Independence (N9):** once the partner has declared independence, its partner peoples' braves set out against the King's troops near its colonies in their reach, and are called when the Crown attacks such a colony; the people does not go to war with the Crown itself (a people's stance towards the Crown is never written). A King's regular disarmed by a brave is destroyed, as in combat.
- **No inciting against the partner:** `inciteTribe` refuses ("they are bound to it by a mutual defence pact"); Combative's `maybeIncite` does not pick the partner.
- **Garrisons next to settlements:** today no rule raises tension for units standing next to a settlement (only colonies within three tiles press), so the clause holds as it is; a test pins it.
- **Notices:** the partner gets messages, shown as news in the turn-start briefing: "3 Arawak braves come to defend Jamestown against the French", "The Arawak take up arms against France for its attack on Jamestown, as their pact with you binds them", "The Arawak fight for you: …", and the broadcast that it stands by its pact.
- **Computer nations (N11):** whether a nation seeks a pact with a trade partner is drawn **once per pair** (`proposeDefence` 0.3 times `LEVEL_COOPERATION.defence`), as step 3 found that per-review chances overshoot; one that seeks it proposes on each review until the people agrees. Creative (1) and Competent (0.5) seek it with a people that has a settlement within six tiles of their colonies; Combative (1) with a people that has one within six tiles of an enemy's colony (a nation it is at war with, or its war target), and, since it makes no land use or exchange of its own, asks such a people for a cultural exchange first; Naive never proposes.
- **Interface (N13):** Foreign Affairs' Native peoples card shows "Mutual defence" among the treaties and, beside a trade treaty with land use or an exchange, a "Propose defence" button with its reason or benefits in the title; a note explains the pact. The settlement dialog and the trading dialog show the pact and since when, or the nation the people is bound to.
- **Tournaments:** the per-game line adds "defence pacts n (ended m, fights k, wars w)" (fights: brave attacks for a partner; wars: the partner drawn in by an attack on its people, or the people going to war for an attack on the partner's colony); the summary adds "Mutual defence: n of N games with a pact, made per game (by level), ended, fights and wars per game". Pacts also count among "people treaties" made and ended.
- **The Caribbean's own numbers:** after the French treaty with the Kalinago (1660), a pact needs 10 ± 3 years of good relations and computer nations seek it at 0.6.

### Choices made while building (for Simon)

1. **Combative and the ladder.** N11 gives Combative defence pacts with peoples near its enemies but no land use or exchange, while N2's ladder needs one of them. Built so Combative asks such a people for an exchange first, only on the way to a pact. In the tournaments Combative still made none: it seldom has a trade treaty (it needs 300 gold traded with the people), a people near its enemies, the per-pair draw and the years all at once. If Combative pacts matter, step 6 could let defence stand on trade alone for Combative, or lower its trade threshold. **Simon (11 November 2026): accepted as it is, Combative makes no defence pacts.** The exchange asked for on the way is removed with Combative's share (section 13).
2. **One nation at a time,** not "or members of one alliance" (N2's parenthesis): N9 keeps peoples out of alliances, and the step's scope says one nation.
3. **"An attack on the people"** is an attack by a European unit on its braves or settlements (where the people turns hostile, as for breaking faith), also when the people was already at war with the attacker: a nation whose colonies the people's braves raid cannot hunt those braves in the open without war with the partner (beating off a raid from a colony is no attack). Computer players still fight such braves unless the partner is a friend; that is most of the "wars brought by pacts".
4. **The people goes to war with the attacker of the partner's colony** (as N7 says), adding 300 tension so that the war does not end the next round (a people makes peace once every settlement is below 250); that also ends its treaties with the attacker.
5. **Against the King's troops the braves fight without a war of the people's own:** the people has no stance towards the Crown, and its defence ends when the troops leave.
6. **Braves walk greedily** (as today): a brave whose only step closer is a colony tile cannot get round it, so some calls end without a fight (0.3 fights per Americas game). A path search for braves would change every game; left for later. **Simon (11 November 2026): braves get proper path finding, and braves moving to defend move as if following a river** (section 13).
7. **The partner's units next to settlements:** nothing to waive today (see above); if a later rule makes armed units near a settlement raise tension, it should spare a defence partner.

### Measurements

Every commit before the switching one kept the bench games "same" (`npm run bench -- --verify`, with and without `--scenario caribbean`). The switching commit (`[outcomes]`) re-recorded 1 of 4 Americas bench hashes (seed 7) and the generated-map golden hash; the Caribbean's bench games and snapshot did not change. Only games where a pact was made, or a computer player was held back from a fight, play differently.

Tournaments, `npm run tournament -- --turns 609 --play-on --events --seed 1000` (the Caribbean `--turns 202 --events`), defence off → on, average score:

| Run | Games changed | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 games | 4 of 24 | 597.6 → 580.3 | 548.8 → 549.3 | 521.8 → 523.8 | 249.1 → 250.0 |
| Americas, 48 games | 10 of 48 | 600.7 → 583.8 | 505.1 → 506.1 | 474.9 → 468.2 | 260.4 → 261.9 |
| Caribbean, 16 games | 4 of 16 | 96.9 → 96.2 | 109.9 → 109.3 | 122.4 → 121.2 | 63.3 → 63.1 |

Mutual defence, with the switch on:

| Run | Games with a pact | Made per game (Creative, Competent) | Ended per game | Braves' fights per game | Wars brought per game |
| --- | ---: | --- | ---: | ---: | ---: |
| Americas, 24 games | 7 of 24 | 0.4 (0.2, 0.2) | 0.1 | 0.3 | 0.3 |
| Americas, 48 games | 12 of 48 | 0.3 (0.2, 0.1) | 0.1 | 0.3 | 0.6 |
| Caribbean, 16 games | 9 of 16 | 0.8 (0.5, 0.3) | 0.2 | 0 | 0.5 |

- **Against N12:** a defence pact in 12 of 48 Americas four-level games (1 in 4, the target) and 7 of 24, with the engine's numbers, untuned; the Caribbean's own data makes them more common (9 of 16). Only Creative and Competent made pacts (choice 1).
- **Scores** move within the noise of the games that change (a changed game moves by about 200 points either way); Combative lost 17 points on both Americas runs, from the few games where pacts brought wars (two games had 8 and 11, most of them Combative fighting braves of a people at war with it).
- The 24-game Americas run with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean, every game line and the summary the same as without the checks (and the same as the first 24 games of the 48-game run). A Playwright smoke of the built web game with Google Fonts blocked (a new game in the Americas and in the Caribbean, a pact and the rungs below it set up in the state, Foreign Affairs opened) had no page errors; the Native peoples card showed "Mutual defence" and a "Propose defence" button with its benefits ("an attack on them is war with you, their braves come to defend your colonies near their land, also against royal troops once you declare independence, and nobody can turn them against you"; in the Caribbean without the clause on royal troops).

### To do in step 6

- Renewed teaching's strength: about ten free experts per exchange per Americas game (Simon, section 11).
- ~~Combative and the ladder (choice 1).~~ Decided: Combative makes no defence pacts (section 13).
- ~~Braves' walking round colonies (choice 6).~~ Done: braves' paths and defence speed (section 13).
- The `prosperity` rates (section 14): the Caribbean's (15 of 16 games, always naming the top scorer), and the Americas' (5 of 96, a little above one in 20–30, but every win Competent's: Creative, the main partner in N11, never qualified; the treaties condition fails most, so computer nations seeking treaties with more of the peoples they meet is the lever, not loosening the rule).

## 13. Braves' paths and defence speed (Simon's decisions, 11 November 2026)

Built on branch `beta2/braves-paths`, from step 4. Simon decided three things on step 4's choices:

1. **Combative makes no defence pacts:** accepted as it is (choice 1).
2. **Braves get proper path finding** (choice 6): they get stuck behind colonies no more.
3. **Braves moving to defend always move as if following a river, because the native peoples know the land so well;** where the tile already gives a better bonus (a road, or a better river), the best wins. It applies whenever braves move to defend: their own people's land as well as a partner's colony, not raids, visits, trade or demands.

Code: `braves.ts` (`braveRoute`, `walk`, `walkTo`, `braveDefending`, `braveStepCost`), `ai/natives.ts` (`seekDefence`), `alliances.ts` (`LEVEL_COOPERATION.combative.defence`). Tests: `test/brave-paths.test.ts` (7 tests: a brave goes round a colony and the soldiers beside it to get home, and to a unit it then attacks; a brave with no way gives its task up; what counts as defence; a defending brave's step costs the river cost on open land, forest and mountains and the road cost on a road; defending braves cover three plains tiles a round where raiding and visiting ones cover one; a brave of a people at war sets out against an enemy by its settlement as a defender); `test/defence.test.ts` checks Combative's share of 0.

### What was built

- **Combative (1):** the only thing step 4 added for Combative's sake was asking a people near its enemies for a cultural exchange as a step towards a pact. With no pact to reach it is pointless, so it is gone: `seekDefence` has no Combative branch and `LEVEL_COOPERATION.combative.defence` is 0 (Creative 1, Competent 0.5, Combative and Naive never propose). N11 says so. Combative still makes trade treaties where they pay. The bench games did not change, but the exchanges Combative asked for did happen now and then: 2 of 48 Americas tournament games play differently (Combative +17 points on average over the 48), none of the Caribbean's.
- **Paths (2):** every brave movement with a target follows `braveRoute`: visits with gifts, trade and demands, raids on colonies, attacks on units (defence of the people's land and of a partner), and going home. Wandering stays a random walk near the settlement. `braveRoute` is an A* search like `findPath` (a binary heap ordered by estimate, then by insertion, and stamped buffers reused between searches, so it is deterministic), but for braves: it keeps the tiles a brave could enter before (land; no colony, no European land unit, no settlement but its own home; braves never board ships) and the braves' own step costs (a road 1, a forest 6, other land its terrain's cost: braves ignore rivers and need a road only on the tile they enter, as before), and it searches only within the settlement's visiting range (6) and three tiles more. Its goal is a tile next to the target (a colony or a unit, which braves cannot enter), or the home tile. A brave searches once a round and walks the route as far as its move points go (it can always make one step): nothing it may not enter moves while it walks, so a cached route would save little. A brave with no route to its task's target gives the task up and goes home (it used to stand there for good); one with no route home stays where it is.
- **Defence speed (3):** `braveDefending` is a brave set against an enemy unit, which braves do only in defence: against an enemy in the open within three tiles of their settlement while the people is at war with its nation (`nearbyEnemy`, the people's own land; there is no other response of braves to threats against their own settlements today), and against a partner's enemies near its colonies or attacking them (step 4, `task.defend`). Its step costs at most `RIVER_MOVE_COST` (1, the same as a road), in the route search too; a road, or anything cheaper, still wins. A brave on foot (3 move points) so covers three tiles a round instead of one on open land, a mounted one (12) twelve instead of four. The rationale is in the code where the bonus is applied. Raids, visits, gifts, trade and demands move as before. No notice or tooltip mentions the braves' speed, so no text changed ("N Arawak braves come to defend Jamestown" stays).

### Choices made while building (for Simon)

1. **Braves keep their own step costs.** Units pay a river step only along a linked river and a road step only from road to road; braves pay a road's cost on any road tile they enter and never get a river's. The task kept "the same rules", so only defence gained the river cost. If braves should follow rivers like units, that is a one-line change in `braveStepCost` (and another round of re-recorded hashes).
2. **Own-land defence is `nearbyEnemy`** (an enemy unit within three tiles of the settlement, the people at war with its nation). Braves do not answer an attack on their own settlement today (the settlement's defenders fight it, its braves do not come home); a call to arms like `callToDefence` for a people's own settlements would be new behaviour.
3. **No route, no task.** A brave sent to a colony it cannot reach (another island, a colony walled in by units) gives up and goes home; the next roll may send it again, so a settlement whose nearest colony is out of reach keeps trying. Choosing only reachable colonies would be a further change.
4. **A bounded search.** Routes stay within nine tiles of the brave's settlement (or a tile further than the brave stands), so the search is small and a brave never strays far to go round an obstacle.

### Measurements

Three commits, each `[outcomes]`: Combative's share (the bench games, golden hashes and Caribbean snapshot unchanged), the paths (all 8 bench hashes, the golden hashes and the Caribbean snapshot re-recorded) and the defence speed (3 of 8 bench hashes: Americas seed 7, Caribbean seed 1492 and to 1700; the generated-map golden hash; the Caribbean snapshot). In the Caribbean snapshot game a chartered company is now founded, so `caribbean-game.test.ts` checks the line's nations, not the company, for colonies and Founding Fathers.

Tournaments, `npm run tournament -- --turns 609 --play-on --events --seed 1000` (the Caribbean `--scenario caribbean --turns 202`), with `--features` for the counts, which plays the same games. Average score, Combative / Competent / Creative / Naive:

| Run | Before (step 4) | Combative's share | + paths | + defence speed (all) | Games changed |
| --- | --- | --- | --- | --- | ---: |
| Americas, 48 games | 583.8 / 506.1 / 468.2 / 261.9 | 601.3 / 515.6 / 465.1 / 261.3 | 653.4 / 471.9 / 433.4 / 260.8 | 648.8 / 483.3 / 428.5 / 263.6 | 48 of 48 |
| Americas, 24 games | 580.3 / 549.3 / 523.8 / 250.0 | | 647.0 / 414.6 / 441.3 / 239.7 | 628.4 / 428.7 / 464.6 / 245.8 | 24 of 24 |
| Americas, 48 games, seed 2000 | 716.4 / 426.8 / 380.4 / 243.0 | | | 651.3 / 450.8 / 406.9 / 249.3 | 48 of 48 |
| Caribbean, 16 games | 96.2 / 109.3 / 121.2 / 63.1 | the same (0 changed) | 99.1 / 104.6 / 128.3 / 59.6 | 99.7 / 103.6 / 127.3 / 59.6 | 16 of 16 |

Natives, per game (the four levels' per-nation averages added up), before → after (both changes):

| Run | Brave attacks on colonies (raids) | Brave attacks on units | Units killed by braves | Colonists killed in raids | Peoples going to war | Defence fights for a partner | Demands | Gifts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Americas, 48 games | 333 → 352 (+6%) | 11.3 → 20.3 | 5.1 → 9.1 | 12.1 → 12.7 | 10.7 → 10.8 | 0.3 → 1.1 | 44.5 → 45.5 | 72 → 82 |
| Americas, 48 games, seed 2000 | 333 → 359 (+8%) | 13.4 → 17.5 | 5.4 → 8.6 | 12.4 → 13.8 | 10.9 → 10.1 | 0.6 → 1.2 | 37.9 → 45.1 | 67 → 75 |
| Caribbean, 16 games | 19.2 → 23.8 (+24%) | 1.7 → 0.7 | 0.9 → 0.5 | 0.7 → 1.4 | 1.1 → 1.2 | 0 → 0 | 4.6 → 5.6 | 12.0 → 14.1 |

With the paths alone (seed 1000): raids 356, attacks on units 17.3, defence fights 0.8 a game; the Caribbean's raids 23.8. Mutual defence pacts: 12 → 14 of 48 games (seed 1000), 11 → 16 (seed 2000), 9 → 8 of 16 in the Caribbean.

- **More braves reach their targets.** Raids on colonies rise by 6–8% in the Americas and by a quarter in the Caribbean (its islands and coasts left many braves stuck); gifts and sales to visiting braves rise by 10–30%, demands by 2–20%. Brave attacks on units in the open nearly double in the Americas (most of them on Combative's units, the level that fights peoples), and defence fights for a partner go from 0.3 to 1.1 a game (step 4 measured 0.3), helped by the defence speed. Wars with peoples do not rise, and colonists killed in raids hardly do: the natives are not overwhelming.
- **Scores move within the noise.** Every game changes, and a changed game moves by about 200 points either way: on seed 1000 Combative gains 65 and Competent and Creative lose 23 and 40 (paired standard errors 35–46 points), on seed 2000 the other way round (Combative −65, Competent +24, Creative +27). The 24-game run's Competent −121 is its first half of the 48 (the second half: +75). No level is clearly weaker.
- The 24-game Americas run with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean, every game line and the summary the same as without the checks (and the same games as the first 24 of the 48-game run).
- **Time:** a CPU profile of a full game (`node --cpu-prof scripts/.bench.mjs --year 1850 --keep-playing`, seed 2024) puts the braves' walks at about 100 ms of 12 s (0.8%; the greedy walk took 9 ms), so no route is cached between rounds. `npm run perf:gate -- --runs 3` against the branch base: to 1700 3.3 → 2.9 s, to 1750 4.6 → 2.8 s, to 1850 8.3 → 6.9 s, but these are other games now (the 1750 game ends differently) on a noisy machine, so read them only as "not slower".

## 14. Implementation (step 5, November 2026)

Built on branch `beta2/step5`. Code: `prosperity.ts` (new: the rule's defaults, the records, "met", each nation's standing against the rule, the winners and their partners), `victory.ts` (the `prosperity` kind), hooks in `natives.ts` (a people making peace), `combat.ts` (a burned settlement, a surrender), `events/effects.ts` (Pocahontas's peace), `score.ts` and `rules/score.ts` (`peopleTreaty`, the "Treaties with native peoples" line), `arena.ts` and `scripts/tournament.ts` (prosperity wins and the conditions missed), `scenarios/terms.ts` and `caribbean.ts` (`gameOver.prosperity`), `stats.ts` (the score's description); state in `types.ts` (`Tribe.warEnded`, `Tribe.burned`, `gameOver.partners`); in the web game `ui/progress.ts` (the game-over screen, the score breakdown) and `ui/newgame.ts`. Tests: `test/prosperity.test.ts` (18 tests: the scenarios' lists and weights, the arena's line, a winner and its partners, each of the four conditions, a vanished people, the params, the end year only, "met", winning together, concord first, nobody qualifying, a saved game-over, the two records and that they are written only where the scenario plays for prosperity, the score line).

### What was built

- **The kind `prosperity` (N10),** checked after a round once the calendar's last turn has come, after `concord` in the scenario's order: every European nation (not the Crown, not a company; a nation finished in play-on counts with its frozen score) that meets all four conditions wins. `params`, over `PROSPERITY` in the engine:
  - **peace** (`peaceYears`, 30): at peace now with every people it has met, and no war with any of them ended within the last 30 years (years by the calendar, `yearValue`);
  - **never burned** a native settlement, of any people;
  - **treaties** (`treatyShare`, 0.5): a treaty of any people kind in force with at least half (rounded up, and at least one) of the peoples it has met that are still on the map; several kinds with one people count once;
  - **score** (`scoreShare`, 0.8): at least 0.8 of the best final score.
- **"Met"** is read from what the game already records: the nation's standing with the people is written (`peopleRelations`: a trade, a scout's visit, a mission, a brave come to trade), or it has fought the people (at war now, a war that ended, a settlement burned). A people a nation never dealt with in either way does not count.
- **Two records**, plain JSON, absent until first written and written only in a scenario that lists `prosperity`: `Tribe.warEnded` (per nation, the turn its last war with the people ended: the people making peace in `processNatives`, a surrender, Pocahontas's peace) and `Tribe.burned` (nations that burned one of its settlements). Neither existed: `goodSince` is stricter than peace (the settlements must be content on average), and burning was only telemetry and a capped History entry.
- **`gameOver.partners`**: the peoples the winners hold treaties with, in the order the first treaty with each was made; `winners` stays `NationId[]`, best score first. The reason reads "The year 1850 has come and the age of colonization is over. In peace and partnership with the Iroquois and the Cherokee, England wins by prosperity." (several winners "win together"; the Caribbean opens with its own sentence about the chartered companies).
- **Score:** `SCORE_WEIGHTS.peopleTreaty`, points per treaty with a people in force (each kind counts); the line "Treaties with native peoples" appears while the weight is not 0. The engine's weight is 3, as a trade agreement's; the Caribbean's 5, as its trade agreements'.
- **Game-over screen:** "England (you) wins, with the Iroquois and the Cherokee." The score breakdown now matches lines by their key, so a line only some nations have (shares in companies) no longer shifts the others. The New game screen lists "winning by prosperity in partnership with the native peoples".
- **Arena and tournament:** `ArenaEntry.prosperity` marks a prosperity winner (a game-over with partners; `concord` is no longer set for a shared prosperity win), and, where the scenario plays for prosperity, `ArenaEntry.prosperityFails` lists the conditions each nation failed at the end, whether or not the game ended that way. Each game line names the prosperity winners and the nations that missed it on one condition only; the summary adds "Prosperity: n of N games won by prosperity (levels); at the end q of M nations qualified; failing each condition: …; failing only that one: …". The score-by-component table has a `peoples` column.

### Choices made while building (for Simon)

1. **"Met" includes fighting** (above), so a nation cannot escape the peace condition by never trading with the people it fights.
2. **A people gone from the map** (every settlement burned or taken by others) no longer counts among those a nation needs treaties with, but a war with it within 30 years still breaks the peace.
3. **At least one treaty is needed,** even by a nation that met nobody; "half of none" would otherwise let a nation that never met a people win by prosperity.
4. **Half is rounded up** (3 peoples met: 2 treaties).
5. **Peace is measured from the end of the last war,** whoever started it; a war that ended before the record existed (a game saved before this step) is not known.
6. **The records are written only where the scenario plays for prosperity,** so other scenarios' saves keep their text; a game of the Americas saved before step 5 starts its records when loaded.
7. **The score weight counts treaties, not peoples:** a nation with all four kinds with one people gets 12 points in the Americas. Per treaty is what N10 says; per partner people would weigh broad partnership over deep.
8. **Weights:** 3 in the Americas (a trade agreement's), 5 in the Caribbean (its trade agreements'). They raised Creative and Competent by about 6–7 points in the Americas and 10–12 in the Caribbean.

### Measurements

Measured on the base with braves' paths (section 13). The code commits kept every bench game "same" (`npm run bench -- --verify`, with and without `--scenario caribbean`; checked again on the merged base with the switch off). The switching commit (`[outcomes]`, and again the merge) re-recorded all eight bench hashes, both golden hashes and the Caribbean game's snapshot: the score is in each round's statistics. No game plays differently (computer players never read the score): the per-game lines before and after are the same but for the scores and the victory, so the changes below are the weight and the new ending. The Caribbean test game now ends with the Netherlands and England winning together by prosperity, with the Arawak and the Kalinago.

Tournaments, `npm run tournament -- --turns 609 --play-on --events --seed 1000` (the Caribbean `--turns 202 --events`), prosperity off → on, average score (wins):

| Run | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: |
| Americas, 24 games | 628.4 → 629.5 (16 → 16) | 428.7 → 435.5 (5 → 5) | 464.6 → 472.1 (5 → 5) | 245.8 → 246.6 (1 → 1) |
| Americas, 48 games | 648.8 → 649.7 (33 → 33) | 483.3 → 489.8 (10 → 10) | 428.5 → 434.6 (7 → 7) | 263.6 → 264.1 (2 → 2) |
| Americas, 96 games | 639.6 → 640.7 (61 → 59) | 509.3 → 516.0 (23 → 25) | 428.6 → 434.9 (15 → 15) | 257.5 → 258.0 (3 → 3) |
| Caribbean, 16 games | 99.7 → 100.3 (2 → 1) | 103.6 → 113.9 (5 → 7) | 127.3 → 139.2 (9 → 12) | 59.6 → 61.8 (0 → 1) |

The prosperity victory, and how close the nations came at the end (every nation is judged, whatever ended the game, on the scores the game ended with):

| Run | Games won by prosperity | Nations qualifying | Failing peace | burned | treaties | score | Failing only peace | only treaties | only score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 games | 0 | 0 of 96 | 87 | 4 | 90 | 59 | 2 | 3 | 0 |
| Americas, 48 games | 2 (Competent both) | 2 of 192 | 167 | 8 | 183 | 119 | 2 | 4 | 1 |
| Americas, 96 games | 5 (Competent each time) | 5 of 384 | 326 | 15 | 359 | 238 | 4 | 14 | 6 |
| Caribbean, 16 games | 15 (Creative 11, Competent 8, Naive 1; 5 shared) | 20 of 64 | 17 | 0 | 29 | 38 | 1 | 1 | 13 |

- **Against N12 (Americas):** 5 of 96 four-level games, about one in 19 (0 of 24 and 2 of 48 on the smaller runs), just above "about once in 20–30", untuned. Every win was Competent's; in three of the five it had the best score anyway, in two (seeds 1072 and 1085) it took the win from Combative (574 against 625, 797 against 863). Treaties are the binding condition: 93% of nations fail it and 85% fail peace (a war with some people met within the last 30 years), mostly together; 14 nations missed on treaties alone (8 Competent, 5 Creative, 1 Combative), 6 on score alone and 4 on peace alone; nobody on burning alone. Nations hold 3.5 treaties with peoples per game at the end, all nations together. Concord is unchanged (6 of 96; 3 of 24; 4 of 48): no alliance that won together would have needed prosperity.
- **The Caribbean:** prosperity ends 15 of 16 games, and in every one the best score is among the winners: with three peoples, few wars and treaties with most peoples met, the rule there names the top scorer, adds a co-winner in 5 games, and took 1 of Combative's 2 time wins. On the base before braves' paths, stricter `params` hardly moved it (16 games each: `scoreShare` 0.95, 14 of 16; `treatyShare` 1, 14; both, 13). N12 sets no Caribbean target; step 6 should decide whether the Caribbean keeps `prosperity` and on what terms (for example treaties beyond trade, or a share of all the scenario's peoples rather than of those met).
- **Score:** the weight adds about 6–7 points to Creative and Competent in the Americas and 10–12 in the Caribbean, 1 or less to Combative and Naive.
- The 24-game Americas run with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean, every game line and the summary the same as without the checks. A Playwright smoke of the built web game with Google Fonts blocked (a new game in the Americas and in the Caribbean, the person's nation given contact and a trade treaty with two peoples and the best score, the turn set one round before the end, the last turn ended so the engine decides) had no page errors; the game-over screen read "… In peace and partnership with the Iroquois and the Cherokee, England wins by prosperity." and "England (you) wins, with the Iroquois and the Cherokee." (the Caribbean: Courland with the Arawak and the Kalinago), the breakdown showed "Treaties with native peoples", and the New game screen listed the victory.
