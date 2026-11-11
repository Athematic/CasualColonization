# Design note: Native peoples as partners (Beta 2)

Status: **design draft, decisions open** (November 2026). For Simon to decide N1–N14 (section 4; one line each in section 7). Builds on Beta 1, [cooperation.md](cooperation.md) (built), and reuses its shapes: the `Treaty` record, scenario data and mechanics switches for every new rule, computer behaviour per level at seeded chances with targets a scenario can change, and `gameOver.winners`. The 0.9 scenario framework ([scenario-framework.md](scenario-framework.md), [SCENARIOS.md](../SCENARIOS.md)) applies throughout. Australia ([australia.md](australia.md)) is the scenario that will lean on this most, so the shapes chosen here must serve it later.

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
| N11 | **Computer European nations, per level.** | Shares of `Scenario.ai.cooperation` chances, as Beta 1. | **Creative** seeks every kind and is the main partner (share 1). **Competent** makes trade and land use (it buys land today), exchange at 0.6, defence at 0.5. **Combative** makes trade where it pays and defence pacts with peoples near its enemies (as it incites today), no land use (it takes land) or exchange; it still breaks faith when its `land: 'take'` rule says so, which is the honest cost. **Naive** only accepts trade offered by a people. New `Cooperation` fields: `proposePeopleTrade`, `proposeLandUse`, `proposeExchange`, `proposeDefence`, `acceptPeopleOffer`; new `LEVEL_COOPERATION` columns. |
| N12 | **Target rates in computer-only games** (engine defaults; each scenario can change them, Simon's Beta 1 rule). | Higher or lower than below. | **Americas, four levels:** a trade treaty with a people in almost every game (Creative and Competent with 1–3 peoples each); land use in about half the games; exchange in about half; a defence pact in about 1 game in 4; a breach in about 1 game in 3 (mostly Combative); `prosperity` won about once in 20–30 games. The Caribbean raises trade and defence (the 1660 Kalinago treaty) through its own `ai.cooperation` and `peopleTreaties`. Measured with `npm run tournament -- --play-on --events`, tuned in step 6. |
| N13 | **Interface.** | Where to propose and see treaties. | **Foreign Affairs:** the "Native peoples" card gets a row per people with its treaties, its standing in words ("trusts you", "wary"), and a Propose menu (only after contact: a scout's visit, a mission or a trade); the Treaties card lists treaties with peoples beside the European ones. **Settlement screen** (a unit next to it, `apps/web/src/ui/natives.ts`): shows the treaty, its benefits and rent, and the "teach again in n years" date. Answers come at once; a people's own offers come in the turn-start briefing. The rows must stay usable with dozens of peoples (Australia): sort by contact, collapse those not met. Also fix the mood labels to the real thresholds (oddity 2). |
| N14 | **Explicitly out of scope.** | Confirm the list. | Natives as players; peoples' diplomacy and wars with each other; peoples founding settlements or growing; peoples in European alliances or in `winners`; the Crown's native alliances; hostile treaty kinds (tribute, protectorate) and changes to surrender; Australia's moving lifeway and Country map (only the shapes in N1, N6, N10); network play. |

Not separate decisions, but part of step 0 unless Simon says otherwise: move the native constants into `peoples.rules` (framework row 22), add switches for burial grounds and surrender (row 23), make France's teaching a modifier, spare companies from native hostility and inciting (oddities 3–5).

## 5. Phased plan (sizes as in the roadmap)

Each step keeps existing games identical while the switches are off (golden and bench hashes), and re-records them in one deliberate commit when a scenario switches one on, with a tournament before and after.

| Step | What | Size | Prio |
| --- | --- | --- | --- |
| 0 | `TreatyParty` with `people`; `peopleRelations` (N3); `peoples.rules` and the oddities' fixes; `landRadius` (N6); Foreign Affairs lists treaties with peoples | M | P1 |
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

## 7. Questions for Simon

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
