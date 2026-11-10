# Design note: Cooperation between Europeans (Beta 1)

Status: **agreed in outline** (November 2026). Simon decided all of C1–C11 on 10 November 2026: as recommended, except C9 (the clean-up happens now) and C11 (lower targets). This note builds on [favoured-nation.md](favoured-nation.md), the first step towards cooperation, and on the 0.9 scenario framework ([scenario-framework.md](scenario-framework.md)): every new rule here is scenario data or a mechanics switch from the start. Beta 2, native peoples as partners, gets its own note but should reuse the shapes chosen here (question C9).

## 1. Goal

The original game rewards a European nation for going it alone: trade with the Crown, fight your neighbours, win your independence by yourself. Beta 1 makes **working with other European nations a real strategy**, as worthwhile as war, and in some scenarios the way to win:
- Nations can make **alliances** with obligations and benefits beyond Favoured Nation.
- They can run **joint ventures**: shared expeditions, chartered companies and shared colonies.
- There is a **cooperative way to win**, so a game can end with more than one winner.

The computer players must use all of this well enough that a person meets it in every game, not just once in a while.

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
| C11 (decided: lower targets) | **How much should the AI cooperate?** | In computer-only tournaments: **at least one alliance in about 1 of 4 games, at least one company in about 1 of 10 games, and a `concord` victory about once in 30–40 games** (Simon). Joint independence (confederation) is rarer still: about once in 30–50 games even with every nation at Creative, because it is mainly for people. A person allied with a computer nation can propose it, and the computer nation's answer follows its usual readiness for independence. Tuned lightly with tournaments on the Mac. |

## 5. Phased plan (sizes as in the roadmap)

Each step keeps the existing games identical where the new switches are off (golden and bench hashes for the Americas' current rules), or re-records them in one deliberate commit when a switch turns on in a scenario.

| Step | What | Size |
| --- | --- | --- |
| 0 | `Treaty` record and the diplomacy screen's treaty list; trade agreements and FN shown through it (data unchanged) | M |
| 1 | Alliances: unlocking, proposing, the defensive pact, open colonies, shared sight, leaving; computer rules | L |
| 2 | Victory: `winners`, `concord`; game-over screen, arena and tournament tables | M |
| 3 | Chartered companies: `kind: 'company'` players, shares, dividends, company AI, founding by shareholders | L |
| 4 | Joint expeditions (small) and shared bells | S–M |
| 5 | Confederation: declaring independence together | M |
| 6 | Tuning with tournaments on the Mac (alliances, companies, `concord` share), docs | M |

Total: about **XL**, like 0.9.
