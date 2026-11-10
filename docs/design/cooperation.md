# Design note: Cooperation between Europeans (Beta 1)

Status: **agreed in outline** (November 2026); steps 0–2 built (section 6). Simon decided all of C1–C11 on 10 November 2026: as recommended, except C9 (the clean-up happens now) and C11 (lower targets). This note builds on [favoured-nation.md](favoured-nation.md), the first step towards cooperation, and on the 0.9 scenario framework ([scenario-framework.md](scenario-framework.md)): every new rule here is scenario data or a mechanics switch from the start. Beta 2, native peoples as partners, gets its own note but should reuse the shapes chosen here (question C9).

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
| 3 | Chartered companies: `kind: 'company'` players, shares, dividends, company AI, founding by shareholders | L | |
| 4 | Joint expeditions (small) and shared bells | S–M | |
| 5 | Confederation: declaring independence together | M | |
| 6 | Tuning with tournaments on the Mac (alliances, companies, `concord` share), docs | M | |

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

