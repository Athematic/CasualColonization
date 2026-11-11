# Design note: Cooperation between Europeans (Beta 1)

Status: **built** (November 2026): steps 0–5 (sections 6 and 7) and step 6, the tuning (section 8). Some choices made while building it are provisional and listed for Simon in section 9. Simon decided all of C1–C11 on 10 November 2026: as recommended, except C9 (the clean-up happens now) and C11 (lower targets). This note builds on [favoured-nation.md](favoured-nation.md), the first step towards cooperation, and on the 0.9 scenario framework ([scenario-framework.md](scenario-framework.md)): every new rule here is scenario data or a mechanics switch from the start. Beta 2, native peoples as partners, gets its own note but should reuse the shapes chosen here (question C9).

## 1. Goal

The original game rewards a European nation for going it alone: trade with the Crown, fight your neighbours, win your independence by yourself. Beta 1 makes **working with other European nations a real strategy**, as worthwhile as war, and in some scenarios the way to win:
- Nations can make **alliances** with obligations and benefits beyond Favoured Nation.
- They can run **joint ventures**: shared expeditions, chartered companies and shared colonies.
- There is a **cooperative way to win**, so a game can end with more than one winner.

The computer players must use all of this convincingly when it suits them, at the rates in C11. Cooperation is mostly something people start, and computer nations answer it sensibly.

**Non-goals:**
- Native peoples as partners (Beta 2).
- Federation for Australia (a scenario's content, built on this; see [australia.md](australia.md)).
- Network play.
- Rebalancing war. War stays as it is; cooperation has to compete with it on its own merits.

## 2. What exists today (0.4–0.9)

- **Relations per pair:**
  - stances: war or peace;
  - years of peace;
  - trade agreements, which allow routes to the partner's colonies;
  - trade volume and attitude;
  - Favoured Nation status: home-port access, no war from computer players, and intervention in a War of Independence.
- **Diplomacy commands:**
  - `declareWar` and `proposePeace`;
  - `proposeTrade` and `cancelTrade`;
  - `proposeFavoured` and `cancelFavoured`;
  - `answerProposal`.
- **Computer players** propose and accept trade and Favoured Nation, and the levels differ in how warlike they are.
- **Victory kinds** come from a registry (`victory.ts`), but `gameOver` names **one** `winner`.
- **Play-on** (`GameConfig.playOn`) already lets a game go on when one nation finishes.

So the ladder today is **peace → trade agreement → Favoured Nation**. Beta 1 extends it upward and sideways.

## 3. Proposal in brief

1. **Alliance** is the next rung after Favoured Nation, and its unlocking reuses the FN rules:
   - **Entry:** you must already be each other's Favoured Nation, with more years of peace and trade.
   - **What it adds:**
     - a defensive pact: an attack on one is war with both;
     - open colonies: allied units can enter, garrison and trade in allied colonies;
     - shared sight;
     - shared Founding Father bells, at a small fraction (to tune).
   - **Leaving:** worse than cancelling Favoured Nation. It is the same cascade plus a longer hostility.
2. **Joint ventures**, three kinds, each a small, separate mechanic:
   - **Joint expedition:** two allies fund a shared scout or treasure train and split what it finds (rumours, treasure).
   - **Chartered company:** several nations buy shares in a company that founds and runs **its own colonies**. It is a third party, like the VOC, the Hudson's Bay Company or the Darien Company. Profits are paid out as dividends in proportion to shares; the company's score counts for its shareholders.
   - **Shared colony (condominium):** see C1. Proposed: only through a company, not as a colony with two owners.
3. **Cooperative victory** (`concord`): by the scenario's end year, an alliance (or a group of Favoured Nations, see C6) that together holds a share of the score above a threshold wins together. Its members share the win, ranked by their own score. It sits next to `independence-war` and `time` in the victory registry.
4. **Independence with allies:** colonies of allied nations may declare together, as a confederation. They then fight the REFs together, and their winning counts for both. This is mostly for people to start (Simon, 10 November 2026). In games of computer players alone it should be exceedingly rare: even with every nation at Creative level, about once in 30–50 games.
5. **Computer players:** each level gets an attitude to alliances and companies. The cooperative levels (Creative, and a new trait for some of them) seek them out; Combative uses alliances for war.
6. **Scenario data:**
   - Mechanics switches `alliances`, `companies`, `condominiums` and `confederation`, plus victory kind `concord`.
   - The Americas get all of them on (with play-on rules unchanged).
   - The Caribbean is a natural home for companies; see C10.

## 4. Decisions needed (with recommendations)

The ones marked **(structural)** shape the engine's data model; getting them wrong later means a large rewrite. Simon decided all three on the recommendations: shared colonies through a company (a third party), a company is a `Player` with `kind: 'company'`, and `gameOver.winners`. C4–C11 are decided too; see the table.

| # | Question | Recommendation |
| --- | --- | --- |
| C1 **(structural, decided)** | **Shared colonies: two owners, or a third party?** A colony with two owners touches everything keyed on `colony.owner`: production, taxes, bells, sight, combat, AI, rendering and score, in more than 100 places. A company that owns the colony keeps one owner per colony. The company is a new kind of player-like entity, played by simple rules, and its shareholders get dividends and a say. | **Company (third party).** Shared access within an alliance covers the rest: allies' units can work and garrison each other's colonies without owning them. |
| C2 **(structural, decided)** | **What is a company in the engine?** A full `Player` (with markets, units, colonies, and AI driven by a "company" profile), or a lighter record that owns colonies and ships but is moved by its majority shareholder? | **A `Player` with `kind: 'company'`.** It has no Crown, no taxes and no independence; it is driven by its own simple AI profile; and it has shareholders. It reuses everything that already works for nations, which is less new code than a second kind of owner. |
| C3 **(structural, decided)** | **More than one winner.** `gameOver.winner` is one nation. `concord` needs a list. | **`winners: NationId[]`** next to `winner`, which stays as the first winner for old code. All screens and the arena read `winners`. |
| C4 (decided) | **What does an alliance oblige?** A defensive pact only, or also joining offensive wars? | **Defensive only.** An ally may join an offensive war but doesn't have to. Computer allies join when they gain. Decided. Offensive pacts and other variations are for a later note. |
| C5 (decided) | **Shared bells and Founding Fathers.** Should allies help each other's Congress? | **Yes, a small share (for example 10%) of each ally's bells,** to make alliances visible in the mid game. Fathers stay per nation. Decided. Later: nations whose colonies have enough bells might work together in the New World even while their European crowns are hostile. |
| C6 (decided) | **Who can win together?** Only formal alliances, or any group of Favoured Nations? | **Alliances only.** They are explicit and visible, and computer players can plan for them. |
| C7 (decided) | **Can an alliance include the Crown's enemies during independence?** Allies of a rebel are also at war with that rebel's Crown? | **Yes, if they declare together (confederation).** Otherwise an ally may send help (today's intervention), not more. |
| C8 (decided) | **People in hot-seat games.** | As with Favoured Nation: two people can ally at any time and break it without the computer hostility. |
| C9 (decided: clean up now) | **Shapes shared with Beta 2.** Should agreements be one general "treaty" record (kind, parties, terms, start, end) used for European alliances now and for native treaties in Beta 2? | **Yes: a `Treaty` record with typed terms, and the clean-up happens now** (Simon). Trade agreements and Favoured Nation move into treaties (kinds `trade`, `favoured`, `alliance`), replacing their separate state fields, so the record is tested with several kinds and many instances from the start. No save migration is needed: per Q3, pre-0.9 saves aren't supported. |
| C10 (decided) | **Which scenario shows cooperation off best?** | The Caribbean, with the Darien Company, the Dutch WIC and Courland's companies. The Americas get the full set. Each scenario chooses with the mechanics switches. |
| C11 (decided: lower targets) | **How much should the AI cooperate?** | In computer-only tournaments: **at least one alliance in about 1 of 4 games, at least one company in about 1 of 10 games, and a `concord` victory about once in 30–40 games** (Simon). Joint independence (confederation) is rarer still: about once in 30–50 games even with every nation at Creative, because it is mainly for people. A person allied with a computer nation can propose it, and the computer nation's answer follows its usual readiness for independence. These are the **engine defaults**. Each scenario can change them (Simon): the alliance thresholds, the computer players' readiness to propose and accept, and `concord`'s score share are scenario data, for example `Scenario.ai.cooperation` next to `ai.pace`. Some scenarios will make cooperation much more common. Tuned lightly with tournaments on the Mac. |

## 5. Phased plan (sizes as in the roadmap)

Each step keeps the existing games identical where the new switches are off (golden and bench hashes for the Americas' current rules), or re-records them in one deliberate commit when a switch turns on in a scenario.

| Step | What | Size | Status |
| --- | --- | --- | --- |
| 0 | `Treaty` record and the diplomacy screen's treaty list; trade agreements and FN moved into it (C9) | M | done |
| 1 | Alliances: unlocking, proposing, the defensive pact, open colonies, shared sight, leaving; computer rules | L | done (shared bells wait for step 4) |
| 2 | Victory: `winners`, `concord`; game-over screen, arena and tournament tables | M | done |
| 3 | Chartered companies: `kind: 'company'` players, shares, dividends, company AI, founding by shareholders | L | done |
| 4 | Joint expeditions (small) and shared bells | S–M | done |
| 5 | Confederation: declaring independence together | M | done |
| 6 | Tuning with tournaments (alliances, companies, `concord` share), docs | M | done (section 8) |

Total: about **XL**, like 0.9.

## 6. Implementation (steps 0–2, November 2026)

Code: `packages/engine/src/treaties.ts` (the record), `alliances.ts` (the rules), with hooks in `relations.ts` (proposals, war), `combat.ts` (the pact, garrisons, captured colonies), `movement.ts` (entering allied colonies, path search), `queries.ts` (shared sight), `crown.ts` (royal wars), `victory.ts` (`concord`, `winners`), `ai/foreign.ts` (computer players) and `arena.ts`; the web game's Foreign Affairs, turn-start briefing, unit panel, History report and game-over screen. Tests: `test/treaties.test.ts`, `test/alliances.test.ts` (unlocking, proposals, the pact, open colonies, shared sight, leaving, concord, the computer players, switches off). Choices made while building it:

### The Treaty record (step 0, C9)

- `GameState.treaties: Treaty[]`, written when the first treaty is made, in the order made, kept after a treaty ends. A `Treaty` is `{ id: 't1', kind, parties, start, end?, terms?, left? }`: `kind` is `'trade' | 'favoured' | 'alliance'`; `parties` are `{ kind: 'nation', id }` so other kinds of party (Beta 2's peoples) fit later; `end` is `{ turn, why: 'cancelled' | 'war' | 'lapsed' | 'left', by? }`; `terms` is a union keyed by `kind` (today only `AllianceTerms`: `defensive`, `openColonies`, `sharedSight`); `left` lists members that left an alliance.
- Trade agreements and Favoured Nation status became treaties, replacing `Relation.trade` and `Relation.favoured` (Simon's C9). Favoured Nation keeps a trade treaty of its own beside it, as the flags did: lapsing at independence ends only the `favoured` treaty, cancelling or war ends both. `Relation` keeps the pair's history (peace, hidden thresholds, volume, waiting, hostility, proposal). The move was checked behaviour-identical: five long games played with the old and the new engine end in the same state once the treaties are projected back onto the flags; only the hashes of the serialised state were re-recorded.
- The diplomacy screen lists your treaties in force, those between other nations (public) and your past ones.

### Alliances (step 1)

- **One alliance per nation, two or more members.** A member invites a nation that belongs to none (the same `proposeAlliance` command); every member must be at peace with it and not hostile. Leaving takes a member out (`left`); an alliance with one member left ends.
- **Unlocking**, as Favoured Nation: each other's Favoured Nation, plus years of peace (18 ± 4) and gold traded at each other's colonies (250–750), drawn per pair from seeded streams of their own (`allianceThresholds`), never stored, never shown; the screen says only that relations are not close enough. Between two people: any time, no Favoured Nation needed (C8).
- **Defensive pact** (C4): `declareWar(a, b)` brings every ally of `b` into the war with `a`, as if `a` had declared it (so Favoured Nation with them is cancelled by `a`). Not against the Crown: an ally's War of Independence stays its own (C7). No duty to join an ally's own war.
- **Open colonies:** allied units may enter and stay in each other's colonies (also in path searches, and allied units never block each other). A garrison defends: an enemy attacking the colony meets the strongest of the owner's and its allies' land units. When the colony falls, allied units at war with the attacker are taken with it; others (the Crown's attack on a rebel) are sent out. Carriers sell to and buy from an allied colony (`sellInColony`, `buyInColony`) at a foreign stop's terms; unloading for free stays limited to one's own colonies. Units cannot work in an ally's colony (C1 leaves that open).
- **Shared sight:** `reveal` reveals for allies too, explored maps are merged when allying, and the renderer's fog counts allies' units and colonies.
- **Leaving** (or war on an ally, which counts as leaving): Favoured Nation is cancelled with each former ally, with the full cascade (trade ended, routes cut, goods seized), units leave each other's colonies, and a waiting period of 15 ± 3 years and hostility of 25 ± 5 years follow (cancelling Favoured Nation: 10 ± 3 and 15 ± 5). Between two people only the cascade. Favoured Nation with an ally cannot be cancelled on its own: leave the alliance instead.
- **Computer players** (`ai/foreign.ts`, every five turns): Naive never proposes; the others propose to an unlocked Favoured Nation partner at a seeded chance, `ai.cooperation.proposeAlliance` (0.5) times the level's share (Creative 1, Competent 0.6, Combative 0.5, and Combative only when the partner is at war or it has a war target of its own: it wants allies for war). They accept at `acceptAlliance` (0.8) times the level's share (Creative 1, Competent 0.8, Combative 0.7, Naive 0.5), never from a nation (or its allies) they are hostile to or plan war on. They join an ally's war when an enemy colony near their own is at least `joinWar` (0.8) times the target they would attack alone. They never start a war on an ally or on a friend's ally (nor does the King), and leave an alliance for war only for a target three times as good as their level of war, and not in its first 40 turns (a first version let a Combative nation leave its ally after ten years; the hostility that followed cost the ally its independence).
- **Scenario data:** `mechanics.alliances` (absent: off), `Scenario.alliances` (thresholds and leaving penalties over `ALLIANCE_RULES`), `Scenario.ai.cooperation` (over `COOPERATION`). The Americas and the Caribbean switch alliances on with the defaults.
- Telemetry: `diplomacy:alliance made`, `joined`, `left`, `left for war`, `ally defended`, `war on an ally`, `joined an ally's war`, `trade:allied colony sales` and `purchases`.

### Victory (step 2, C3, C6)

- `gameOver.winners: NationId[]`, best first, written for every ending (empty when nobody wins or the person retires); `winner` stays the first. A victory kind may return `winners`; otherwise they are its `winner`.
- `concord`: at the end of the calendar, the alliance whose members hold more than `params.share` of the total score (default 0.65) wins together, members ranked by their own score; with a share below one half the larger of two qualifying alliances wins. The Americas list `[independence-war, concord, time]`, the Caribbean `[concord, time]`.
- The game-over screen names every winner ("… win together"); the arena's `won` reads `winners` (the best score only for a game stopped early, so ties no longer count twice) and marks `concord`; the tournament prints alliances and concord per game, alliance columns in the relations table, and a line "Alliances: n of N games with an alliance … won together".

### Measurements

Americas, `npm run tournament -- --games 8 --turns 609 --play-on --events --seed 1000`: an alliance in 3 of 8 games, no concord win; 24 games (seeds 1000–1023): an alliance in 5 of 24, concord in 1 of 24 (Combative and Creative). Average scores per level over the 24 games, without alliances → with: Combative 714.8 → 708.0, Competent 507.8 → 492.2, Creative 468.1 → 468.0, Naive 242.6 → 243.7. Games without an alliance play exactly as before, so the differences come from five games; most of Competent's drop is one game (seed 1004) where Competent, allied with Combative, later declared independence and lost (847 → 452) after the game had diverged. With 0.55 as concord's share, one game in eight ended in concord.

The Caribbean (8 × 202 turns): no alliance, because no Favoured Nation forms between computer players there (none did before either: little trade between their colonies). The switch is on for people; computer cooperation in the Caribbean needs Favoured Nation tuned for it, or a scenario `ai.cooperation`/`alliances` that does not wait for it (a question for step 6).

## 7. Implementation (steps 3–5, November 2026)

Built on the 0.10 base (merged first, with its save/load rule: the state is a plain JSON tree; `test/roundtrip.test.ts`, and a company game saved and loaded every round in `test/companies.test.ts`). Code: `companies.ts` (rules and queries, imported widely) and `chartered.ts` (founding, shares, dividends), `scenarios/companies.ts` (the companies' data), `confederation.ts`, shared bells and joint expeditions in `alliances.ts`; hooks in `score.ts`, `crown.ts`, `europe.ts`, `fathers.ts`, `events/`, `independence.ts`, `victory.ts`, `combat.ts`, `diplomacy.ts`, `rumours.ts` and `ai/` (`foreign.ts`, `advanced.ts`, `index.ts`, `profiles.ts`). Tests: `test/companies.test.ts`, `test/alliances.test.ts`.

### Chartered companies (step 3, C1, C2)

- **A company is a `Player` with `kind: 'company'`** and a `CompanyBook` (`shares` by nation, `founder`, `founded`, `lastDividend`, `paid`). Its name, colour, colony names and port are scenario data (`Scenario.nations.companies`, `CompanyEntry` with `founders` and `from`); its id is a `CompanyId`. It joins `s.players` when founded, so a game without companies is untouched. Decision taken here: companies are named by the scenario, not created freely, which keeps ids, names and colours stable and saves simple.
- **Founding** (`foundCompany`): a founder nation pays `capital` (2,000), which becomes the company's treasury and buys it `foundingShares` (20). A company may be chartered only by its historical founders (England for the Hudson's Bay Company, the Netherlands for the West India Company, France for the Mississippi Company; Scotland, the Netherlands, Courland in the Caribbean) when one of them takes part, otherwise by any nation, and not before its year. It arrives with a caravel, two colonists and a soldier at the founder's point of arrival and knows what the founder had explored.
- **Shares** (`buyShares`): new shares at the company's worth per share (its gold and 100 per colonist), at least `sharePrice`; the gold goes into the company's treasury. **Dividends** every `dividendEvery` turns: `payout` of the gold above `reserve`, by shares.
- **No Crown:** no taxes, boycotts, demands, royal wars, Royal Expeditionary Force, independence, Congress or events. **Neutral:** nobody declares war on it or attacks its units (privateers included), it attacks nobody and makes no agreements. Natives treat it as any European.
- **It cannot win:** `finalScores` leaves it out; each shareholder's score gets a `companies` line, its share of each company's score.
- **Its own profile** (`COMPANY_PROFILE`): a Competent economy with few colonies, no war, missions, schools, liberty or independence.
- **Computer nations** found and buy at seeded chances per review, `ai.cooperation.foundCompany` (0.03) and `buyShares` (0.1) times the level's share (Creative 1, Competent 0.7, Combative 0.4, Naive 0), with half as much again as the capital, or the price of five shares and 1,500 more, above their reserve.
- **The Caribbean** (C10) makes them more common: capital 1,000, reserve 400, `foundCompany` 0.12, `buyShares` 0.25.

### Shared bells and joint expeditions (step 4, C5)

- **Shared bells:** a tenth (`alliances.sharedBells`) of the liberty bells each ally rings counts also towards the others' next Congress member (their `fatherBells`); liberty itself and Founding Fathers stay per nation. Whole bells; the remainder is carried in hundredths in `Player.allyBells`, written once a nation has allies. Bells rung before the alliance are not shared.
- **Joint expeditions:** an ally proposes one (`proposeExpedition`); each pays half of `alliances.expeditionCost` (1,200), and a mounted seasoned scout (marked `Unit.joint` with the partner) waits on the proposer's docks. Half of the gold it finds in Lost City Rumours goes to the partner. A computer ally accepts when it can pay and keep 1,000 gold; computer nations with allies propose at `ai.cooperation.jointExpedition` (0.05) while rumours are left. In tournaments they are rare: alliances form late, when few rumours are left.

### Confederation (step 5, C7)

- Two allies declare independence on the same turn (`proposeConfederation`, a treaty of kind `confederation`). Each faces its own Royal Expeditionary Force, but the war is one: won once every member's royal troops are beaten, lost once the members together hold half their colonies or fewer; the same outcome for all, and a won war makes all of them the winners.
- A computer ally answers by its usual readiness for independence (`readyToDeclare`, the checks of its own declaration), registered from the computer players as a judge (`setConfederationJudge`), so the engine does not import them. Computer nations propose only when ready themselves and an ally can declare too, at `ai.cooperation.confederation` (0.3, 0.6 since step 6) per review. Step 6 added waiting for an ally and a smaller margin for Creative (section 8).
- `mechanics.confederation`: on in the Americas; the Caribbean has no independence.

### Alliances, revisited

- **Blocs:** an alliance holds at most half the nations taking part (at least two), and `concord` needs at least one nation outside the alliance. Found in the Caribbean, where a first tuning ended with all four nations in one alliance "winning together".
- **`alliances.requires`:** the rung an alliance builds on, `'favoured'` (the engine's) or only `'trade'`. The Caribbean uses `'trade'`, with 50 ± 10 years of peace and a lower proposing rate (0.03): no Favoured Nation forms between its computer players (their colonies hardly trade), and Favoured Nation's own thresholds are code, not scenario data, so they stay as they are.

### Measurements (steps 3–5)

Tournaments with play-on and events (`npm run tournament -- --play-on --events`), after each step:

| Run | Alliance in | Concord | Company in | Joint expeditions | Confederation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 × 609 turns, the four levels, seed 1000 | 5 of 24 | 1 of 24 | 3 of 24 | 0 | 0 |
| Americas, 24 × 609 turns, every nation Creative, seed 2000 | 0 of 24 | 0 | 1 of 24 | 0 | 0 |
| Caribbean, 16 × 202 turns, the four levels, seed 1000 | 7 of 16 | 1 of 16 | 4 of 16 | 0 | (no independence) |

- Average scores per level, Americas (24 games), before steps 3–5 → after: Combative 708.0 → 717.4, Competent 492.2 → 483.5, Creative 468.0 → 471.1, Naive 243.7 → 242.0. Caribbean (16 games, before the Caribbean's own values → after): Creative 117.9 → 121.4, Competent 102.8 → 104.8, Combative 96.2 → 93.6, Naive 59.1 → 60.1. No level is clearly weaker.
- Companies: about 1 game in 8 in the Americas (target about 1 in 10), 1 in 4 in the Caribbean, where they are meant to be more common. They stay small (one or two colonies) and pay little in dividends (114 gold a game in the Americas, 3 in the Caribbean).
- Shared bells: about 470 bells a game in the Americas' alliance games, 90 in the Caribbean's.
- Joint expeditions: none. Computer alliances form late (after 18 years of peace on top of Favoured Nation), when hardly any Lost City Rumours are left; people can use them from the start.
- Confederation: none in 48 Americas games. It needs an alliance and both allies ready to declare on the same review; with every nation Creative no alliance formed at all (Creative pairs rarely reach Favoured Nation, 0.5 per nation and game). So it is rarer than C11's 1 in 30–50 games; raising `ai.cooperation.confederation` cannot help where there are no alliances, and the Mac tuning (step 6) should look at it together with the alliance rates.
- Every all-Creative independence war in those games was fought alone, as before: the switch changes nothing until allies are ready together.

Step 6 (section 8) found why and changed it.

## 8. Tuning (step 6, November 2026)

Measured with the 0.10 base merged in (grid abstraction and round 3, both bit-identical: every game without an alliance or a company plays exactly as on the 0.10 base, and a 24-game Americas tournament with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1` ran clean; after the tuning, so did the four games with a confederation below and 16 Caribbean games, 8 of them with companies). The tournaments are fast now (24 Americas games in about 80 s), so they ran in the cloud, with larger samples where 24 games could not tell the rates apart. Every run: `npm run tournament -- --play-on --events`.

### What was wrong

- **No alliance between Creative nations.** In all-Creative games most pairs had a trade agreement and a century or more of peace, but almost never the active trade routes between them that Favoured Nation needs (2–4), nor the trade at each other's colonies an alliance needs (250–750 gold): Creative nations hardly trade with each other's colonies, so the ladder stopped at the trade agreement. (Over 96 all-Creative games, 8 had an alliance; the 24 of step 5 had none.)
- **No confederation, ever.** A computer nation declares independence alone on the first turn it is ready, so declaring together needed both allies to become ready on the same review. Traced in all-Creative games: the second ally was usually short of its margin over its own Royal Expeditionary Force, or of the defence it wants to hold until the intervention comes.
- **Companies paid almost nothing.** A company's computer player spent its treasury down to its profile's 300 gold, below the dividend reserve (800, the Caribbean 400), so there was rarely gold above the reserve to pay out (3 gold a game in the Caribbean). And Caribbean nations rarely held the 1,800 gold the computer wanted before founding one (capital and half again, plus its reserve), so companies came at turns 117–179 of 202.

### What changed

- **Old friends** (`AllianceRules.longPeace`, engine default 150 ± 30 years, hidden, drawn per pair): two nations with a trade agreement and that many years of unbroken peace may ally without Favoured Nation and without the trade volume. Computer players propose on this path only at `Cooperation.proposeLongPeace` (0.001 per review, times the level's share), the usual way stays at `proposeAlliance`. The first such pairs ally in the late 1600s. The Caribbean's century never reaches it. People see the button once they have a trade agreement; the refusal reads "You must be each other's Favoured Nation first, or keep the peace much longer."
- **Declaring together** (`ai/foreign.ts`, `declareWithAlly`): a computer nation ready to declare first declares together with an ally that is ready to declare with it; otherwise, at `Cooperation.confederation` (0.3 → 0.6) times its level's share, drawn once, it waits up to 20 turns (`ALLY_WAIT_TURNS`) for an ally that has taken up an independence plan.
- **Readiness together** (`Cooperation.confederationReadiness`, 0.65): a Creative nation answering a confederation, or checked as the ally while the other waits, wants that share of its usual margin over its Royal Expeditionary Force and of the defence to hold until the intervention (`LEVEL_COOPERATION.together`: Creative 1, the others 0). The other levels answer by their usual readiness: with the smaller margin for every level, four-level Americas games had a confederation in 7 of 48 (mostly Competent with Combative), and four of those seven wars were lost. A proposer must still be ready to declare alone.
- **Companies keep a treasury**: a company's computer player keeps 1.5 times the dividend reserve before it spends (`COMPANY_KEEP` in `ai/index.ts`).
- **Founding and buying margins are scenario data**: `Cooperation.foundMargin` (0.5 of the capital) and `sharesMargin` (1,500 gold), the old values. The Caribbean uses 0 and 500, so its nations found companies once they have the capital and their reserve.
- The tournament's line per game names a confederation's members.

### Measurements (step 6)

Before (steps 0–5 with the 0.10 base merged) → after. Alliance, concord, company and confederation columns count games.

| Run | Alliance in | Concord | Confederation | Company in | Dividends a game |
| --- | ---: | ---: | ---: | ---: | ---: |
| Americas, 24 × 609 turns, the four levels, seed 1000 | 5 → 8 of 24 | 1 → 2 | 0 → 0 | 3 → 3 | 114 → 176 |
| Americas, 48 games, seed 1000 | 13 → 18 of 48 | 3 → 4 | 0 → 1 | 6 → 6 | 228 → 618 |
| Americas, every nation Creative, 24 games, seed 2000 | 0 → 5 of 24 | 0 → 0 | 0 → 0 | 1 → 1 | 16 → 216 |
| Americas, every nation Creative, 96 games, seed 2000 | 8 → 26 of 96 | 2 → 3 | 0 → 3 | 11 → 11 | 97 → 457 |
| Caribbean, 16 × 202 turns, the four levels, seed 1000 | 7 → 6 of 16 | 1 → 2 | (no independence) | 4 → 8 | 3 → 318 |
| Caribbean, 32 games | 12 → 11 of 32 | 3 → 4 | | 10 → 19 | 14 → 483 |

Average scores per level, before → after:

| Run | Combative | Competent | Creative | Naive |
| --- | ---: | ---: | ---: | ---: |
| Americas, 24 games | 717.4 → 723.1 | 483.5 → 499.8 | 471.1 → 471.5 | 242.0 → 243.0 |
| Americas, 48 games | 692.0 → 694.0 | 456.1 → 472.3 | 442.0 → 441.4 | 256.5 → 255.4 |
| Americas, all Creative, 96 games | | | 410.1 → 407.3 | |
| Caribbean, 16 games | 93.6 → 97.0 | 104.8 → 104.7 | 121.4 → 122.1 | 60.1 → 61.3 |

- **Against C11:** an alliance in about one Americas game in three (8 of 24, 18 of 48: a little above one in four); concord in 2 of 24 and 4 of 48 (about one in 12, above the target of one in 30–40, as before the tuning: 3 of 48); a company in one game in eight (unchanged); a confederation in 3 of 96 all-Creative games (one in 32, within the target of one in 30–50) and 1 of 48 four-level games.
- **No level is clearly weaker.** Creative's average in all-Creative games moved by less than its noise (about 8 points over 96 games); a game that changes at all changes by about 200 points either way, so 24 games say little about a level's average.
- **Companies:** in the Caribbean a company is now a sound investment. One founded at turn 34 paid its founder 1,762 gold in dividends on its 1,000 and was worth 20 points at the end; late ones (after turn 150) paid back 200–430 gold and 5–8 points (at 400 gold a point, the capital is worth 2.5). In the Americas, companies still come late (the founding chance and the companies' years are unchanged, to keep them in about one game in ten), and pay more in gold and a little less in score, because they grow more slowly while keeping a treasury.
- **Joint expeditions:** still none between computer players; alliances form after most Lost City Rumours are found.
- **Concord** stays at 0.65 of the total score: it is already above C11's rate in the Americas, and the alliance rate is a little above too, so raising it to 0.7 is the obvious next step if Simon wants fewer shared wins. Left for him to decide (section 9).

## 9. For Simon: provisional decisions to confirm

Choices made while building Beta 1 that the decisions C1–C11 did not settle. Each is easy to change.

1. **Alliances can have more than two members** (one alliance per nation; a member invites a nation that belongs to none).
2. **An alliance holds at most half of the nations taking part** (at least two), so it is a bloc, not the whole table.
3. **Concord needs a nation outside the alliance**, and is checked only **at the end year** (the calendar's end), not earlier.
4. **Concord's share** stays at 0.65; the tournaments give a shared win in about one Americas game in 12, more than C11's one in 30–40. 0.7 would bring it closer.
5. **An alliance survives independence:** a nation that has won its independence keeps its allies, and can still make an alliance.
6. **Allies garrison and trade in each other's colonies but don't work in them** (C1 left it open).
7. **Favoured Nation with an ally ends only by leaving the alliance**, not on its own.
8. **Companies are named by the scenario** (`nations.companies`), not created freely; ids, names and colours stay stable.
9. **Shares can't be sold**, only bought (new shares, at the company's worth per share).
10. **Companies can't join alliances**, make agreements or go to war; nobody makes war on them.
11. **Old friends** (new in step 6): a trade agreement and 150 ± 30 years of peace open an alliance without Favoured Nation; computer players rarely take that way. It is how alliances form between Creative nations, which hardly trade with each other's colonies.
12. **Declaring together** (new in step 6): a computer nation ready for independence may wait up to 20 turns for an ally with an independence plan, and a Creative ally declares together with a smaller margin over its own Royal Expeditionary Force (0.65 of its usual one). The other levels answer by their usual readiness, as C11 says.
13. **A company's computer player keeps 1.5 times the dividend reserve** before it spends, so that it pays dividends rather than growing as fast as it can.

