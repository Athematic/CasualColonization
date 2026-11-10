# AI feature audit

Which game features each computer level uses, and which it leaves alone. The audit came from a report that Creative, playing a nation through a head start from 1492 to 1750, never built a road and never bought a ship, although the engine has both.

## How to run it

```sh
npm run tournament -- --games 6 --turns 300 --size medium --features
```

`--features` installs a counter (`packages/engine/src/telemetry.ts`) while the arena plays. The engine reports every action and outcome to it: commands carried out, buildings and units finished, roads laid, ships bought, rumours explored, Founding Fathers joined, and so on. When the games end, the arena adds a few measurements of each nation's final position: roads next to its colonies, colonies joined by road, ships, cargo holds, warships, wagon trains and artillery. The tournament then prints a table of features against levels, as an average per nation per game. The **Gap** column flags features that an advanced level (Competent, Combative, Creative) never uses, or uses less than 0.5 times a game.

Notes on the method:

- **Commands.** The computer players call engine functions directly rather than going through `applyCommand`. So each command is counted inside the engine function it maps to (`cmd:improve` in `startImprovement`, `cmd:train` in `train`, and so on), and only the commands that have no engine function of their own are counted in `applyCommand`. The AI does fortify, sentry, load and unload goods, set exports, choose Founding Fathers and accept tax raises by changing the state directly. The audit cannot see those, and the table marks them *(not observable)*.
- **Events** (raids suffered, starvation, spoiled goods and so on) are things that happen to a nation. They are listed for context and are never flagged as gaps.
- **Cost.** With the flag off, each hook is a single null check, and counting never touches the game state. The same seeds give the same scores with and without `--features`. A test checks this.
- `cmd:move` counts every step, including steps made on standing orders.

The definitions are in `packages/engine/src/features.ts`.

## Before: what the advanced levels did not use

Six games, 300 turns, medium map, seeds 1000–1005 (the full table is in the appendix):

| Level | Score | Colonies | Colonists | Gold | Fathers |
| --- | ---: | ---: | ---: | ---: | ---: |
| Combative | 313.3 | 23.5 | 116.5 | 539 | 11.7 |
| Creative | 306.0 | 20.5 | 92.0 | 366 | 12.3 |
| Competent | 229.8 | 17.5 | 69.2 | 298 | 10.8 |
| Naive | 183.7 | 19.5 | 69.7 | 1580 | 8.7 |

The audit found these gaps, and the AI code (`ai/advanced.ts`) explains each one:

1. **Experts bought in Europe were never equipped. This was the biggest problem.** `train()` delivers a plain colonist, but the AI only looked for units by *role*. A hardy pioneer arrived without tools and a seasoned scout without horses, so the AI saw no pioneer or scout and bought another one the next time a ship was in Europe. Creative bought 5.7 hardy pioneers and 4.3 seasoned scouts a game (about 9,400 gold), and `equip:pioneer`, `equip:scout` and `cmd:speak` were all **0**. As a result:
   - **No scouting.** Nobody spoke to a chief, and only about 2 rumours were explored in a game.
   - **No land improvement.** The only pioneer was the starting one, whose 60 tools give three jobs. Roads 0–0.3 a game, plowing 1, forest clearing 0.3. When its tools ran out, it joined a colony for good: the AI never re-equipped pioneers from colony tools, and `equip:pioneer` was 0.
   - **No roads between colonies.** Even with tools, `pioneerTurn` only roaded worked lumber and ore tiles, and only in the four nearest colonies.
2. **The fleet never grew.** The AI bought a merchantman only with 2,500 gold above its reserve at the moment a ship sat in Europe, and that check came after spending on scouts, pioneers, soldiers and artillery. Nations ended the game with 1–1.2 ships and about 2 cargo holds for 20 colonies (`bought unit:Merchantman` 0–0.2). No level ever built a ship at a shipyard, bought a galleon, or carried treasure by galleon. Spoilage ran to 6,000–9,000 goods a game.
3. **Creative spent like Combative on an army it never used.** Artillery and armories were gated on `aggression > 0`, and Creative's aggression is always slightly above 0 (personality × 0.5). So Creative bought about 10 artillery a game (5,000 gold), the same as Combative, and never attacked (`cmd:attack` 0).
4. **Combative never fought.** No wars started, no settlements burned and no privateer attacks. Raid orders from `diplomacy()` are overwritten in the same turn by `soldierTurn`, which sends spare troops back to their garrisons. Wars need a 2.5:1 strength ratio against a colony within 10 tiles. The only privateer is bought after everything else, and it never attacks.
5. **Never or almost never used by any advanced level:**
   - **Natives:** missions (needs a level-2 church, built 0–0.2 times; a firebrand preacher is never bought), trade with natives by ship or wagon train (no code for it), dragoons.
   - **Colony development:** schools and teaching (the schoolhouse comes late in the build plan, and colonies average 4–5 colonists), custom house (needs Stuyvesant and comes late in the plan), level-2 production buildings (Weaver's Shop and the like are planned only when two workers already staff the house), wagon trains (never built, so inland colonies cannot export).
   - **Europe:** experts other than scouts and pioneers (farmer, fisherman, statesman, preacher; their purchases come after other spending), paying arrears.
   - **Endgame:** declaring independence (once in six games, by Competent).
   - **Not observable, but by design:** refusing a tax raise. The AI always accepts.

## Fixes

The changes are kept small and in new files, so they merge easily with the trade-route and warehouse work happening in parallel:

- **`ai/outfit.ts`: equipped experts.** `trainEquipped` trains a unit and gives it its speciality's goods in Europe: tools for a hardy pioneer, horses for a scout, muskets for a veteran. The AI's `buyUnit` now budgets for the equipment. A worn-out hardy pioneer is now re-equipped instead of replaced.
- **`ai/roads.ts`: roads and pioneers.**
  - `buildRoads` runs when a pioneer has nothing left to plow or clear. Its plan, `roadTargets`, is worked out once per turn per nation. First come worked lumber, ore, silver and fur tiles, where a road adds +1. Then come routes from each colony to its nearest neighbour within 6 tiles, and from each inland colony to the nearest port. Routes are found by `roadRoute`, an A* search over land that prefers existing roads. Two pioneers never take the same tile.
  - `equipPioneer` sends out a colonist with a colony's spare tools when the nation has fewer pioneers than `pioneersWanted` (1, plus 1 per 6 colonies, at most 3). A hardy pioneer goes first.
  - `pioneerToolsWanted` adds 60 tools to the next Europe shopping list when no colony has spare tools.
  - All advanced levels use this, Creative included.
- **`ai/fleet.ts`: ships.**
  - `buyShips` is now the first purchase in Europe. It buys a merchantman when goods waiting in the ports exceed 1.5× the fleet's holds, or when the fleet has fewer than one hold per coastal colony. The fleet is capped at 1 + one ship per two ports.
  - It buys a galleon when a treasure worth more than a galleon is waiting, or when the nation is rich.
  - Militant nations buy a privateer (Combative) and a frigate while at war.
  - `shipToBuild` puts a ship on the slips in a colony with a shipyard when the fleet is short, one ship at a time across the nation.
- **`advanced.ts`: Creative stops buying an army it does not use.** A `militant(prof)` test (aggression ≥ 0.5) now gates artillery, armories, extra veterans and musket purchases. This means Combative, or Creative while its focus is *war*.

`advanced.ts` itself only gains small hooks: imports, one call each in `manageColony`, `pioneerTurn`, `buildPlan` and `europe()`, and `buyUnit`.

Tests are in `packages/engine/test/ai-features.test.ts`:
- road planning between two colonies;
- a Competent nation with an idle pioneer joins two colonies by road;
- Creative re-equips a worn-out hardy pioneer;
- the fleet wants a merchantman when goods pile up;
- the feature counter only counts while installed;
- the arena reports features and flags gaps without changing scores.

## After: scores

Average score per level over twelve games: 300 turns on a medium map, seeds 1000–1005 and 2000–2005, before and after the fixes, with the same seeds and seating:

| Level | Before (1000–1005) | After (1000–1005) | Before (2000–2005) | After (2000–2005) | Before, all 12 | After, all 12 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Creative | 306.0 | 454.2 | 358.5 | 419.7 | **332.3** | **437.0** (+32%) |
| Combative | 313.3 | 364.5 | 320.8 | 327.5 | **317.1** | **346.0** (+9%) |
| Competent | 229.8 | 332.2 | 275.0 | 320.3 | **252.4** | **326.3** (+29%) |
| Naive | 183.7 | 165.7 | 145.7 | 145.7 | 164.7 | 155.7 |

Naive's code did not change. It loses a little because the advanced nations it plays against are stronger.

The README settings (8 games, 330 turns, medium map) now give Creative 509.5, Competent 434.9, Combative 414.9 and Naive 189.6.

Games are about 40% slower, because nations end with more colonists to manage. A profile shows the time going to the existing worker optimiser (`tileWorkedBy`, `colonyWorkers`, `jobOptions`), not to the new code.

## After: feature use

Seeds 1000–1005, before → after, average per nation per game:

| Feature | Naive | Competent | Combative | Creative |
| --- | ---: | ---: | ---: | ---: |
| cmd:speak | 0 → 0 | 0 → 14 | 0 → 16 | 0 → 15 |
| explore:rumour explored | 1.8 → 0.3 | 2.2 → 6.5 | 2.2 → 4.0 | 2.7 → 7.5 |
| cmd:learn | 0 → 0 | 4.0 → 4.7 | 5.7 → 5.3 | 4.8 → 6.3 |
| cmd:improve | 0 → 0 | 1.7 → 25 | 1.7 → 21 | 1.7 → 22 |
| land:road built | 0 → 0 | 0.3 → 3.8 | 0 → 3.2 | 0.3 → 4.3 |
| land:plowed | 0 → 0 | 1.0 → 15 | 1.5 → 13 | 1.0 → 13 |
| land:forest cleared | 0 → 0 | 0.3 → 5.0 | 0.2 → 4.0 | 0.3 → 4.8 |
| end:road tiles by colonies | 0 → 0.3 | 0.2 → 5.0 | 0.2 → 3.0 | 0.3 → 4.7 |
| end:colonies linked by road | 0 → 0 | 0.3 → 3.7 | 0 → 2.2 | 0 → 3.0 |
| equip:pioneer | 0 → 0 | 0 → 6.7 | 0 → 5.0 | 0 → 5.3 |
| equip:scout | 0 → 0 | 0 → 1.2 | 0 → 1.0 | 0 → 1.5 |
| trained expert:Hardy Pioneer | 0 → 0 | 3.2 → 0 | 3.8 → 0 | 5.7 → 0 |
| trained expert:Seasoned Scout | 0 → 0 | 3.2 → 1.2 | 4.0 → 1.0 | 4.3 → 1.5 |
| bought unit:Merchantman | 0 → 0 | 0 → 1.0 | 0.2 → 0.8 | 0 → 1.0 |
| bought unit:Privateer | 0 → 0 | 0 → 0 | 0 → 0.2 | 0 → 0 |
| end:ships | 1.0 → 1.0 | 0.8 → 2.0 | 1.2 → 2.0 | 1.0 → 2.2 |
| end:cargo holds | 2.0 → 2.0 | 1.7 → 6.0 | 2.7 → 5.7 | 2.0 → 6.7 |
| end:warships | 0 → 0 | 0 → 0 | 0 → 0.2 | 0 → 0.2 |
| bought unit:Artillery | 0 → 0 | 0 → 0 | 9.3 → 10 | 10 → 0 |
| cmd:sellGoods | 10 → 13 | 29 → 51 | 40 → 47 | 48 → 65 |
| cmd:hurry | 0 → 0 | 3.8 → 5.0 | 7.7 → 12 | 3.5 → 8.3 |
| cmd:recruit | 12 → 13 | 9.5 → 16 | 6.7 → 13 | 8.7 → 17 |
| fathers:joined | 8.7 → 8.7 | 11 → 13 | 12 → 13 | 12 → 16 |
| cmd:buyLand | 0 → 0 | 8.2 → 12 | 6.3 → 9.5 | 14 → 15 |
| cmd:giftTribe | 0 → 0 | 11 → 18 | 0 → 0 | 16 → 36 |
| colony:goods spoiled | 14143 → 11593 | 5980 → 10137 | 7381 → 10503 | 8955 → 12502 |

What changed:

- **Every advanced level now scouts.** It speaks to about 15 chiefs a game and explores 4–7 rumours, against about 2 before.
- **Pioneers stay busy.** About 22 improvements a game instead of 2: 13 tiles plowed, 5 forests cleared and 4 roads. At the end of the game, 2–4 colonies are joined to a neighbour by road.
- **No more repeat purchases.** Hardy pioneers bought fell from 3–6 to 0. Seasoned scouts bought fell from 3–4 to 1.
- **The fleet grows.** About one merchantman is bought a game, so nations end with about 2 ships and 6 holds instead of 1 ship and 2 holds. Goods sold in Europe rose by 15–75%.
- **Creative stopped buying artillery** (10 → 0). It recruits twice as many colonists, hurries more builds and joins about 4 more Founding Fathers.
- **Spoilage rose.** Nations produce more, while inland colonies still have no way to ship their goods. The trade-route and warehouse work happening in parallel addresses this.

## Remaining gaps worth tackling next

Ordered by how much they should help:

1. **Wagon trains and inland exports.** No level builds a wagon train, so inland colonies cannot sell anything, and spoilage is the largest waste left (10,000+ goods a game). Trade routes would fix this; that work is happening in parallel.
2. **Fleet size.** It still lags production: about 2 ships for 20 colonies. Shipyards are rarely built (`built:Shipyard` ≈ 0). Docks only reach that level at 8 colonists, and few colonies get that big.
3. **Combative's army is idle.** It buys about 10 artillery a game and attacks nothing. Raid orders set in `diplomacy()` are overwritten by `soldierTurn` in the same turn; the raid force should be exempt from garrison duty while the raid lasts. The war threshold (2.5:1 against a colony within 10 tiles) is almost never met. Either use the army or stop buying it.
4. **Missions are unused** (native trade is used since 0.4 and 0.5; see the natives section below). Missions need a level-2 church, which is almost never built, and a firebrand preacher, which is never bought.
5. **Schools, custom houses and level-2 production buildings are never built.** They sit late in `buildPlan`, behind docks, the printing press and warehouses, in colonies averaging 5–6 colonists. Consider a "core colony" plan for the 2–3 largest colonies.
6. **Few experts are trained in Europe.** Fisherman, farmer, statesman and preacher purchases are checked only after other spending, and only when a ship with room is in Europe.
7. **Independence is almost never declared** (minimum share 50–55%, plus stockade and musket requirements). No level has ever won it in the arena. In 0.5 the decision weighs the Royal Expeditionary Force the Crown has built up (see "The Crown" below): no more doomed declarations, but still none that would win.
8. **Tax refusals.** Done in 0.4: the advanced levels refuse a raise when the boycott costs less (see the Favoured Nation section below).

## Favoured Nation (0.4)

Step 2 of 0.4 taught the Competent, Combative and Creative levels to use the Favoured Nation rules: they propose trade agreements and Favoured Nation, run trade routes to partners' colonies, choose between their home port and partners' ports, refuse tax raises when a boycott costs less, cancel Favoured Nation only rarely, and Creative trades goods between ports (triangle trading). Naive only answers proposals and accepts every tax raise. The rules chosen are in [design/favoured-nation.md](design/favoured-nation.md) ("Computer players"); the code is in `ai/foreign.ts` and `ai/logistics.ts`.

### How it was measured

The tournament now counts relations and trade in every game and prints a second table per level, and a line per game. `--no-favoured` (`GameConfig.noFavoured`) stops the computer players proposing anything, so nobody gets an agreement: the fair comparison for what Favoured Nation brings. Tax decisions are part of the new code in both runs. The step-1 code ("Before") is the third column.

```sh
npm run tournament -- --games 16 --turns 300 --size medium --features
npm run tournament -- --games 16 --turns 300 --size medium --features --no-favoured
```

Sixteen games, 300 turns, medium map, seeds 1000–1015, the same seeds and seating in all three runs. Scores are the average per nation; the last two columns are the average difference per game, with the same seed, and its standard error.

| Level | Before (step 1) | Without proposals | With Favoured Nation | With − without | With − before |
| --- | ---: | ---: | ---: | ---: | ---: |
| Creative | 484.8 | 486.9 | 472.7 | −14.3 ± 6.8 | −12.1 ± 7.1 |
| Combative | 447.3 | 443.5 | 451.7 | +8.2 ± 5.4 | +4.4 ± 9.0 |
| Competent | 418.9 | 426.9 | 426.6 | −0.3 ± 6.5 | +7.6 ± 6.1 |
| Naive | 181.2 | 174.1 | 172.6 | −1.4 ± 4.8 | −8.6 ± 7.0 |

Relations and trade with Favoured Nation, average per nation per game:

| Level | Proposals | Agreements | Favoured made | Favoured at end | Cancelled | Trade volume | Foreign stop sales | Partner port sales | Triangle trades | Wars declared | on partners | Tax refusals |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Creative | 2.7 | 2.6 | 1.2 | 1.2 | 0 | 532 | 79 | 266 | 0.1 | 0 | 0 | 0.5 |
| Combative | 2.6 | 2.8 | 1.1 | 1.1 | 0 | 517 | 71 | 312 | 0 | 0.3 | 0.2 | 0.6 |
| Competent | 1.5 | 2.3 | 1.0 | 1.0 | 0 | 797 | 121 | 209 | 0 | 0 | 0 | 0.4 |
| Naive | 0 | 2.1 | 0.4 | 0.4 | 0 | 389 | 0 | 0 | 0 | 0 | 0 | 0 |

Per game (four nations): 4.9 trade agreements, 1.8 Favoured Nation pairs made and still in place at the end, none cancelled, 1,117 gold traded at each other's colonies, 270 units sold at partners' colonies and 787 in partners' ports, 0.1 triangle trades, 0.25 wars declared (0.19 on trade partners, none on a Favoured Nation), 1.4 tax raises refused. Without proposals: no agreements, 0.19 wars, 0.8 tax raises refused. The step-1 code: 0.06 wars, no refusals (every raise accepted).

What the numbers say:

- **The feature is used.** Every advanced level ends most games with one Favoured Nation partner. Agreements come early, often within the first 50 turns; Favoured Nation follows once routes between the two reach the hidden threshold.
- **No war on a Favoured Nation, ever, and no cancellation** in 16 games. The few wars are Combative's, on nations it had only a trade agreement with (it proposes agreements to all its neighbours, including the weak ones it may attack later; the agreement simply ends with the war).
- **Partners' ports are used about twice a game per nation** (1–1.6 trips), when the cargo fetches clearly more there. Sales there never bring a tax raise, so the advanced levels accept fewer raises (6.0–6.3 a game, against 6.4–7.5 without proposals).
- **Triangle trades are rare** (31 units bought a game by Creative, one completed trade in 16 games): the markets drift back to their starting prices and the nations sell raw goods that sit near their lowest price everywhere, so gaps of 10% after tax seldom appear. (0.8 gave each port its own prices; triangle trades still do not happen, for want of free holds rather than gaps: see "Port character (0.8)".)
- **Tax refusals** went from 0 (step 1) to 0.3–0.6 a game. The first rule (refuse any raise on a good under 10% of exports) refused 1.3–2.5 a game and cost points, so the rule became a break-even one: refuse only when losing the good's sales costs less than 70% of what the raise costs on everything else.
- **Scores.** Combative gains (+8) and Competent is unchanged. Creative loses about 14 points a game (two standard errors). Its losses are not where it trades most: in game 2 (seed 1001) it lost 38 points with no trade at all, so part of it is the games simply taking another course. Earlier versions lost more and were fixed: routes that passed the same goods back and forth between partners and drained their treasuries (every level lost 10–30 points); ships going to partners' ports too readily, so colonists waited and gold sat idle (Creative's gold doubled); wagon trains taken from native trade in the early game. Naive's code did not change; it loses a little against stronger opponents.
- **Runtime** did not grow: 21 min 10 s with Favoured Nation against 21 min 2 s without proposals (+0.7%), two runs side by side on the same machine; the step-1 code took 22 min 35 s when run beside them.

Features still never used: buying a ship in a partner's port (prices are the same for every computer nation, so home is never dearer), and paying arrears (refusals are now rare and only for minor goods).

## Port character (0.8)

0.8 gave each home port its own character (`rules/ports.ts`; see [design/favoured-nation.md](design/favoured-nation.md), "Port character and partner ports for routes"), let trade routes call at a Favoured Nation partner's port, and looked again at why Creative scored less with Favoured Nation on.

### The Creative dip

Measured with `--no-favoured` on the same seeds (408 turns, which is 1750; medium map). Every game in these runs ends before turn 408, so `--turns 608` (1850) gives the same results. Differences are per game, with the same seed, ± one standard error.

| Run | Games | Creative with − without | Its development points (colonists to wealth) | Peace points | Competent | Combative |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.8 before this work | 16 | +19.8 ± 36.8 | −20 | +8.7 | +24.9 ± 32.2 | −79.9 ± 31.3 |
| With port character | 48 | −27.0 ± 13.9 | −25 | +8.2 | +6.1 ± 17.1 | −6.4 ± 16.8 |
| After the fix | 48 | +6.0 ± 16.9 | −2 | +7.7 | +1.3 ± 15.8 | +3.6 ± 14.2 |

The development points (colonists, experts, buildings, production, liberty, fathers, wealth) are the steady part; independence swings of ±250 make the totals noisy. To find the cause, single behaviours were switched off for Creative only (32 games each, seeds 1000–1031, against Favoured Nation on):

| Switched off for Creative | Change |
| --- | ---: |
| Its own proposals (others still propose to it) | +5.2 ± 15.7 |
| Stops at partners' colonies on ship routes | **+24.3 ± 14.0** |
| Wagon trains on routes to partners' colonies, and wagon trains built for them | **+20.9 ± 14.3** |
| Routes calling at a partner's port | −0.4 ± 0.6 |

**Cause.** While building ties towards Favoured Nation, the advanced levels took trade with partners' colonies that gained nothing: ship routes detoured up to six tiles to a partner's colony (a detour scored 10 gold a tile against a 200-gold bonus for ties), and colonies built wagon trains to serve partners while idle wagon trains left native trade, which pays several times what a partner's colony does. With Favoured Nation on, Creative sold a third less in Europe (981 against 1,486 units a game by routes) and its buildings, liberty and colonists fell behind. It hit Creative hardest because it traded most at partners' colonies (250 units a game, against 76–142 for the other advanced levels).

**Fix** (`ai/logistics.ts`): a detour costs 40 gold a tile and ties count 100 gold, so a stop that gains nothing is only worth two tiles; wagon trains trade with partners' colonies only when no settlement nearby buys, and none are built just for ties. Cost: Favoured Nation forms less often, 0.17–0.29 times per advanced nation and game against about 0.6, and trade at partners' colonies falls from 76–250 to 11–35 units a game.

### Triangle trades and partner ports

Triangle trades still did not happen in any run. Prices were not the gate: in 16 games Creative's `triangleBuy` was reached 580 times, 26 of them with a second port open, and only once with a spare hold (its cargo ships run routes, and the one free ship is full of colonists and supplies). Partner-port sales: 90–180 units a game for Creative with port character (80–100 of them by routes calling at a partner's port), before the fix; after it, 45–175 units per advanced nation. No computer ship was bought in a partner's port.

### Tournament: 4 games, 608 turns (1850), seeds 1000–1003

```sh
npm run tournament -- --games 4 --turns 608 --features [--no-favoured]
```

| Level | Before, with | Before, without | After, with | After, without |
| --- | ---: | ---: | ---: | ---: |
| Creative | 283.3 | 308.5 | 288.5 | 309.5 |
| Combative | 231.0 | 217.3 | 370.3 | 303.0 |
| Competent | 394.8 | 241.3 | 316.0 | 215.8 |
| Naive | 168.0 | 142.3 | 178.3 | 166.5 |

Independence won / lost (all levels, 4 games): before 2/2 with, 1/3 without; after 2/2 with, 1/3 without. Per game with Favoured Nation, before → after: 7 → 9 trade agreements, 1 → 0 Favoured Nation pairs, 618 → 119 units sold at partners' colonies, 311 → 0 in partners' ports, no triangle trades either way. Runtime: 56 s → 63 s with, 50 s → 54 s without (the two arms run side by side). Four games are far too few to compare levels (one independence war is worth 250 points); the 48-game runs above are the ones to go by.

## Natives: visible braves (0.5)

0.5 replaced the abstract native raids and gifts with real braves (`braves.ts`, rules in `rules/natives.ts`): each settlement keeps one or two out on its land, and in the native phase they wander, bring gifts, come to trade, demand tribute and attack. It also added buying goods from settlements, armed and mounted braves, burial grounds, surrender after a capital falls, and missionaries denouncing rival missions and inciting tribes.

What the computer players do with it:

- **Tribute.** All levels answer a demand at once (`aiPaysTribute`): they pay when the brave would win a fight against the colony's best defender at least 35% of the time, or when the tribute is worth 120 gold or less; otherwise they refuse and let the garrison fight. Naive decides the same way.
- **Hostile braves.** Soldiers and artillery attack a hostile brave next to them when their offence is at least 2.5 times the brave's defence (`aiFight` in `ai/common.ts`), and routes avoid tiles where hostile braves stand.
- **Buying from natives** (`ai/natives.ts`, called from `logistics.ts`): a wagon train trading with a settlement also buys the goods that pay best, when they fetch at least 1.4 times their price in Europe after tax and 400 gold stay in the treasury, and carries them to the nearest port for the ship routes. Goods offered by visiting braves are bought only for a port with room in its warehouse, at 1.5 times their price, with 800 gold to spare.
- **Incite** is Combative only, at most once every 40 turns, when it is at war with a European nation with a colony within 6 tiles of the settlement, and has the price plus 1,300 gold. Nobody denounces missions (the advanced levels hardly found missions; see below).

### Measured

Eight games, 300 turns, medium map, seeds 1000–1007, the code before 0.5's natives work (with the advisor reports) and after, run side by side on the same machine:

```sh
npm run tournament -- --games 8 --turns 300 --size medium --features
```

| Level | Score before | Score after | Difference per game (± standard error) |
| --- | ---: | ---: | ---: |
| Creative | 451.6 | 449.8 | −1.8 |
| Combative | 414.6 | 392.6 | −22 ± 20 |
| Competent | 365.6 | 346.5 | −19 ± 32 |
| Naive | 183.3 | 183.1 | −0.2 |

Natives, average per nation per game (Naive / Competent / Combative / Creative):

| Measure | Before | After |
| --- | --- | --- |
| Raids suffered (attacks on colonies) | 176 / 27 / 216 / 5.8 | 31 / 18 / 56 / 11 |
| Wars with tribes | 3.5 / 0.4 / 5.0 / 0.4 | 2.6 / 1.5 / 4.3 / 1.3 |
| Colonies lost | 0 / 0.1 / 0 / 0 | 0 / 0.1 / 0 / 0 |
| Colonists killed by braves | – | 1.1 / 0.8 / 1.4 / 0.3 |
| Other units killed by braves | – | 1.1 / 0.9 / 3.1 / 0.5 |
| Braves killed (by the nation's units / defending colonies) | – | 1.3 / 0.3 / 14 / 0.3 and 14 / 7.8 / 34 / 6.8 |
| Sales to settlements (wagon trains) | 0 / 1.1 / 0.8 / 0.9 | 0 / 0.6 / 0.9 / 0.5 |
| Gold from sales to natives (wagons and visiting braves) | (not counted) | 89 / 1,072 / 803 / 372 |
| Goods bought from settlements (units) | – | 0 / 38 / 29 / 13 |
| Gifts received | (not counted) | 6.3 / 12 / 9.1 / 12 |
| Tribute demanded / paid | – | 4.8 / 6.4 / 3.0 / 10 and 4.8 / 6.4 / 2.5 / 9.8 |
| Burial grounds disturbed | – | 0 / 0.4 / 0.1 / 0.3 |

Runtime: 529 s after against 573 s before (−8%), the two runs side by side. Braves cost little (at most 80 on the map, greedy one-step moves, one index per round), and fewer abstract raid rolls and smaller wars make up for it.

What the numbers say:

- **Far fewer raids**, because a raid now needs a brave to walk to the colony and win a real fight: Naive and Combative suffer about a quarter of the attacks they used to. Creative and Competent suffer a few more, mostly from burial grounds (about one game in three), which put a tribe at war for good, and from tribute refused.
- **Combative fights the braves.** It takes native land, so tribes stay angry; its garrisons kill about 14 braves a game and beat off about 34 attacks. It scores about 22 points less, the clearest cost of the change: angry braves now strip its soldiers of muskets and horses (the brave keeps them) and kill pioneers and scouts in the open. Killing braves while already at war adds only a third of the usual tension, so these wars can still end.
- **Competent** scores about 19 points less, within the noise (±32): it pays most tributes (6.4 a game) and earns about 1,000 gold a game selling to natives.
- **Buying from natives is used, modestly** (13–38 units a game): wagon trains only trade with natives when they have no route, which is rare once routes exist.
- **Not seen in the tournament:** incitement (Combative was rarely at war with a European neighbour that had a colony near one of its missionaries), denunciations (no AI code), and surrenders (no level burns a capital in these games).

## The Crown (0.5)

0.5 added the Crown's part of the classic game (`packages/engine/src/crown.ts`, the computer players' side in `ai/royal.ts`; tests in `packages/engine/test/crown.test.ts`).

### Rules and numbers chosen

- **A growing Royal Expeditionary Force.** Each nation's force starts at the fixed part of the old declaration formula (4 regulars, 2 dragoons, 1 artillery, 2 men-of-war, times `refBase`). Each round the Crown gains growth points, times the difficulty's `refGrowth` (0.6 Discoverer, 0.8 Explorer, 1 Conquistador, 1.25 Governor, 1.5 Viceroy; it replaced `refPerColony`): 0.01 per colony held, and 0.0035 per liberty bell rung since the last round (the King reacts to liberty). One point is one land unit; once 3 points have gathered they are spent, so the King adds a few units at a time and says so ("The King adds 2 regulars and 1 dragoon to the Royal Expeditionary Force. Royal forces: …"). The mix keeps the old formula's two regulars and one dragoon to each half artillery, and every 12 land units bring a man-of-war (`REF_GROWTH`). The force is shown in the Europe screen, in Foreign Affairs and on the Military report; at the declaration the whole accumulated force sails (`Player.refAtDeclaration` records it). Saves from before 0.5 catch up with the old formula for their colonies on the next round, so no save break was needed.
- **Royal demands.** From turn 40 (1532), each round a nation with at least 400 gold has a 1.5% chance (times `demandChance`: 0.5 to 1.5) that the King demands 10–30% of the treasury (times `demandSize`: 0.7 to 1.3), seeded. People answer in the turn-start briefing (it blocks until answered, like a tax raise); computer players at the start of their turn. **Refusing**: royal officials seize every good but food in the warehouse of the colony with the most valuable stock (named in the decision), and the King adds 2 regulars to the force. A demand left unanswered for a round counts as refused. We chose seizure over a tax raise because it always hurts, also at the tax ceiling, and the computer players can price it.
- **Royal wars.** From turn 60 (1552), each round a nation at peace with every European nation and with no royal war in the last 60 turns has a 0.2% chance (times `royalWarChance`: 0.5 to 1.5) that its King declares war on another European nation that holds a colony: never a Favoured Nation, never for or on a nation that has declared independence, and a trade partner is picked a quarter as often as others. A message says "The King has declared war on X"; peace is made as usual.
- **Seeded.** All draws use the per-nation stream `pairRandom(s, nation, 'crown', purpose)`, never `GameState.rng`. Nothing happens during or after a War of Independence.
- **History.** Demands paid or refused (seen only by the nation) and royal wars appear in the History report under *The Crown*.

### Computer players

- **Demands**: Naive pays whenever it can. The advanced levels pay a cheap demand (15% of the treasury or less, keeping the reserve), otherwise only when refusing would cost more: the goods seized at home prices after tax, plus 600 gold per regular added for a nation getting ready for independence.
- **Royal wars**: a nation that means to fight (aggression 0.5 or more) and finds an enemy colony within 10 tiles that its spare army beats (the usual war score) marches on it; otherwise it offers peace after 6 turns, when the enemy may be tired of the war. Creative turns to defence while at war, as before.
- **Independence**: the old rule (rebel share, an armed unit per colony, stockades in a third of the colonies, 25 muskets per colony) let Competent declare once in 8 games and lose at once (31 points). The new rule weighs the force actually waiting: *rebel power* (armed units' defence in their colonies, a quarter more for Continentals and the Sons of Liberty bonus, plus 2 per 50 muskets in store) against *REF power* (attack of regulars 4.5, dragoons 6.75 counted half again, artillery 7.5). Forced declarations from a late-game position calibrated it: with ratio 0.9 or less the rebellion was crushed in 6–14 turns, from 1.2–1.35 up it won in 18–32 turns. Competent declares at 1.25, Combative at 1.1, Creative at 1.15 (plus the old share, turn, army and stockade conditions).
- **Creative plans for it**: in its *independence* focus, once its defence is at least half of what it needs, it arms: garrisons sized against the REF (up to 4 per colony), muskets first in every hold but one on each trip to Europe, recruits only with 1,500 gold to spare, militia raised in ports for colonies still short (experts too, veterans first), veterans and artillery bought, artillery built in fortified colonies with an armory, and muskets and tools valued higher in its colonies. Arming earlier, from far behind, and ringing fewer bells to slow the King cost Creative about 100 points a game without a single declaration, so it was dropped.

### Tournament (8 games, 330 turns, medium map, seeds 1000–1007)

Before: `claude/nifty-ptolemy-10e7mv` with the natives work and the advisor reports, without the Crown. After: the same plus the Crown.

| Level | Score before | Score after | Independence declared / won / lost before | after | Demands (paid / refused) | Royal wars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Creative | 522.8 | 528.6 | 0 / 0 / 0 | 0 / 0 / 0 | 1.3 (1.3 / 0) | 0.4 |
| Combative | 465.9 | 492.4 | 0 / 0 / 0 | 0 / 0 / 0 | 2.9 (2.9 / 0) | 0.8 |
| Competent | 411.4 | 415.6 | 1 / 0 / 1 | 0 / 0 / 0 | 2.4 (2.3 / 0) | 0 |
| Naive | 204.9 | 217.0 | 0 / 0 / 0 | 0 / 0 / 0 | 3.8 (3.8 / 0) | 0.3 |

Demands and royal wars are averages per nation per game. Per game: 1.5 royal wars (of 1.8 wars in all, against 0.4 before); about 10 demands, all paid (one was still open when a game ended) (they are 10–30% of treasuries of a few hundred gold, while a warehouse holds far more).

The Royal Expeditionary Force, land units per nation (no nation declared, so at the end of the game, turn 330), against the old formula sized by the colonies then: Naive 71 (old 78), Competent 117 (77), Combative 137 (91), Creative 152 (88). At a typical declaration it is near the old formula: in probe games the advanced levels reached 50% rebels around turns 200–250 with 13–24 colonies and a force of 65–100% of the old formula's (the test *reaches about the old formula at a typical declaration* checks a model nation: 15 colonies, 6,000 bells by turn 220, within 30%). Waiting longer, and ringing more bells, makes it grow well past it, as in the original.

What the numbers say:

- **No doomed declarations** (Competent scored 31 in the game where it declared before, against 90 now), and scores are no lower: +4 to +27 a level, within the noise of 8 games.
- **Still no winning declaration.** Under these rules a computer nation's defence reaches 0.7–0.9 of the REF's power at best (Creative arming, probe games), short of the 1.1–1.25 the war needs. Getting there needs a stronger economy behind the army (armories staffed for muskets, artillery from colonies) or a smaller force; worth revisiting with the 0.7 items (mercenaries, foreign intervention).

### Mercenaries, foreign intervention and Tories (0.7)

The rules are in `packages/engine/src/rebellion.ts` (README, "War of Independence"); tests in `packages/engine/test/rebellion.test.ts`.

- **The decision to declare** (`expectedSupport` in `ai/royal.ts`) now adds to the rebels' defence the mercenary company that would offer its services at the declaration, if the treasury can pay it (a veteran soldier counts 9, a veteran dragoon 13, artillery 11, as fortified in a colony), and 0.6 (`INTERVENTION_TRUST`) of the intervention force when the colonies' bells per turn would bring it within 20 turns of the declaration (`INTERVENTION_HORIZON`). The same support lowers the army wanted for independence and lets Creative start arming from further behind (`armingPays`). Ratios are unchanged (Competent 1.25, Combative 1.1, Creative 1.15 in its independence focus); Naive never declares.
- **Mercenaries**: Naive never hires. The advanced levels hire a company they can pay at the declaration (the decision counted on it), and later offers only while their defence is short of the ratio times the royal troops still to land and ashore.
- **The intervention force** belongs to the rebels but is played by the engine (`runAllies`, at the start of the rebels' turn): it attacks royal troops in the open next to it at even odds or better and otherwise marches to the rebel colony most threatened by royal troops. The rebels' own turn (human or computer) cannot order it.
- **Arena** (2 games, 330 turns, medium map; `npm run tournament -- --games 2 --turns 330 --size medium`): before and after the rules, with the first support weights (intervention share 0.3, trust 0.5), the games were identical: no level declared (Creative and Competent ended with REFs of 61–63 land units, about 390 attack power, against defences short of it). The share was then raised to 0.4 and the trust to 0.6; under the user's cost rule this final setting has not had an arena run yet. (It has since: see "Independence planning and buildings (0.7)" below.) A constructed late-game position (`rebellion.test.ts`) shows Creative declaring once the mercenaries tip the balance, and not without the gold.
- **Demands are almost always paid**, and **royal wars** are now most of the wars between Europeans; Combative uses them (0.8 a game) to attack, the others make peace.
- Royal wars hit trade partners more often than the quarter weight suggests (most nations have agreements with every neighbour); never a Favoured Nation.

## Independence planning and buildings (0.7)

The problem: no computer nation declared independence in any recent tournament, even with mercenaries and foreign intervention counted (at the end of a 330-turn game their Royal Expeditionary Force was 54–63 land units, about 390 attack power, and their defence 0.7–0.9 of what they needed), and the scoring review found 0–3.5 building points per nation at turn 200. Probe games showed why. Creative never left its *expand* focus after 0.6's pacing (its colony target is always ahead of what the pace allows), so it never reached its *liberty* or *independence* focus. Carpenters were worth less than almost any farm or craft job, so whole nations made 0–35 hammers a turn with 50–100 colonists. And the old measure of the defence (the sum over all colonies) had little to do with how the war goes: the King lands next to the weakest coastal colony, wave after wave, and takes colonies one by one.

### What the computer players do now

The code is in `packages/engine/src/ai/plan.ts` (the plan), `ai/royal.ts` (the measures) and `ai/advanced.ts` (buildings, arming, the war); tests in `packages/engine/test/independence-ai.test.ts`.

- **An independence plan from mid-game** (`AiProfile.independence.adopt`, remembered in `AiMemory.independencePlan`). Creative takes it up from 25% rebels (after turn 100) or from turn 160 (`PLAN_FROM`), and then keeps its *independence* focus; Competent from 45% rebels or turn 240; Combative only once its defence, with the help it can expect, is 60% of what the declaration needs. Naive is unchanged and never declares.
- **Liberty**: under the plan bells weigh at least 2 (`PLAN_LIBERTY`; Competent's normal weight is 1.4) until the rebels are 6 points past the share needed, and every colony builds a printing press, later a newspaper. Statesmen are bought only while the rebels still need to grow.
- **Defences**: a stockade first in every colony, an armory, forts in colonies of five, warehouses for muskets and horses; stockades are bought outright with gold above the reserve while arming.
- **Arming**, once the rebels are within 20 points of the share needed (`ARM_BELOW`) and the nation is not ready: muskets and horses in every hold to Europe and delivered first to the weakest coastal colonies; up to two armed units a colony (colonists otherwise stay at work: before the war, muskets in store count as militia); soldiers mount as dragoons on the horses in store; veterans and artillery only once every colony holds 100 muskets (50 muskets defend about as well as a veteran or a gun for a fraction of the price); troops from colonies with more defence than they need march to those with less. Within 5 points of the share needed no colony is founded (each makes the King's force grow and is too small to hold out). Once the rebels are 15 points past the share needed, bells are curbed (weight 0.3) in colonies already past half Sons of Liberty: the King adds troops for every bell, and membership does not fall without new colonists (the original game's tactic).
- **The declaration** waits for three things (`readyToFight`): the defence plus the help expected (mercenaries the treasury can pay, 0.6 of the intervention force if the bells bring it within 20 turns) is `ratio` times the royal force (Creative 1.15, Competent 1.25, Combative 1.35, up from 1.1 after its declarations were crushed in probe games); the defence and the mercenaries alone reach the royal force (`HOLD_ALONE` 1: the intervention comes 8 turns into the war at the earliest, and wars declared on the strength of it were lost in 5–9 turns); and fewer than a third of the colonies are weak (less than half of an even share of the royal force, the mercenaries counted in the weakest coastal colony where they land). Tiny outposts (2 colonists or fewer, no stockade) that would fall at once are abandoned first (at least three colonies are kept): each colony held at the declaration counts towards the half that must be kept. This is the only time a computer player abandons a colony.
- **The defence measure** (`colonyDefences`, `rebelPower`): each armed unit as it would defend fortified after the declaration (veterans become Continentals, half the soldiers of a colony with 50% Sons of Liberty too; the walls; artillery's colony bonus; the rebels' +50% in committed colonies), every 50 muskets in store as a militia soldier, every 50 horses as another life for a dragoon; a colony that would be a Tory colony counts at 6/8 (landings there bring 8 troops instead of 6).
- **The war**: bells weigh at least 2.5 (the intervention needs 500 rung after the declaration); no colony is founded; troops hold their colonies and drop orders given before the war; they strike at royal troops in the open next to their colony at even odds (artillery a quarter better; a soldier or dragoon with a re-arm in store and another defender behind it at 0.8); troops in a colony nobody threatens march to the most threatened colony within 12 tiles, keeping what the colony needs itself (twice that on the coast, where the next landing comes); colonists take up the muskets in store only while their colony has fewer than two armed units, so the muskets re-arm beaten soldiers, Continentals among them.
- **Buildings**: in a colony of four or more with a building in the queue, the first carpenters (up to 6 hammers a turn) are worth 7 a hammer instead of 3.2, and lumber 5 instead of 3 while the woodpile is low: enough to beat most farm and craft jobs, not food when the colony is short. Shops for the colony's goods are upgraded from one worker in colonies of six (two before). A building is hurried outright in a colony of four when the gold above the reserve is three times the price (idle gold scores 1 point per 800, a building level 1.5); a third-built one as before.

### What was tried and dropped

- **Curbing bells at a bare majority** (weight 0.1 from 6 points past the share needed) and **founding no colony once the plan is adopted**: Competent fell from 291 to 203 points in the first 2-game run (rebels and Founding Fathers lost, colonies frozen at turn ~170–240). Kept in the milder forms above.
- **Freezing colonies from the start of arming**: the 4-game run A below; Creative ended with 7.3 colonies and 55 colonists (12.5 and 91 before) and 254.5 points. Moved to 5 points below the share needed (run B).
- **Measures of the defence that only count the weakest colonies** (the half the King must take, or the coastal ones): in forced declarations at 0.06–0.36 of the royal force on that measure some wars were won and others with more lost; it predicted no better than the sum and blocked every declaration, so the sum stayed, with the weak-colony guard.
- **Higher thresholds** (`HOLD_ALONE` 1.2): declarations moved past turn 325 and still lost about half of the time in probe games; 1.0 was kept.

How the war goes is hard to predict from any one number. In about 30 probe declarations (natural and forced, seeds 1000–1011) wars were won from own defence at 0.7–1.5 of the royal force and lost from 0.5–1.3. What decides them: the royal force concentrates its waves on one weak coastal colony after another (a colony meets 10–20 attacks in two turns), troops in strong colonies never fight, and the intervention arrives only if the rebels last 8–10 turns. The guards above remove the clearest losses (spread-out garrisons, tiny outposts, wars that rely on the intervention); the rest is the chance of a war.

### Tuning runs (2 games, 330 turns, medium map)

All seeds 1000–1001 except the fourth (1002–1003). The tuning also used a probe script outside the product (single games to turn 330–390 printing the defence measures and each colony's state during the war, and forcing declarations at chosen turns): about 200 single games in all, more than planned, because the war's outcome had to be measured rather than estimated.

| Run | Change | Creative | Competent | Combative | Naive | Independence |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Before | (baseline) | 345.5 | 291 | 268 | 169.5 | none |
| 1 | plan, curb at +6, colonies frozen from adoption | 351 | 203 | 211 | 155 | Creative won (t300, 12 turns); Combative lost (t310, 8) |
| 2 | no curb or freeze, muskets before veterans | 387.5 | 265 | 247.5 | 147.5 | none |
| 3 | curb at +15 while arming, freeze while arming | 380 | 252.5 | 275.5 | 143.5 | none |
| 4 | Creative plan from 25% / turn 160, arm from 20 below (seeds 1002–1003) | 271 | 197.5 | 268 | 146.5 | Combative lost (t319, 11) |
| 5 | hold-alone rule, weak-colony guard, war behaviour, abandoning outposts | 341 | 282.5 | 170 | 150.5 | Combative lost (t313, 14) |

Combative then got ratio 1.35 and the freeze moved to the start of arming (run A) and then to 5 points below the share needed (run B, the final setting).

### Tournament (4 games, 330 turns, medium map, seeds 1000–1003)

Before = this branch without these changes (`claude/0.7-classic-part-2`), the same command. Run A was the planned final run; run B, with the one change above, is the final setting. A won or lost war ends an arena game for every nation (no person is left playing), so the other nations' scores in those games are counted at that turn: run A's games ended at turns 280, 320 and 329, run B's game 4 at turn 319.

| Level | Score before | A | B | Building points before | A | B | Colonies before | A | B | Declared / won / lost A | B | Turn declared, war turns A | B |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Creative | 321.8 | 254.5 | 298.5 | 28 | 40.8 | 52.5 | 12.5 | 7.3 | 9.3 | 1 / 0 / 1 | 0 / 0 / 0 | 308, 12 | – |
| Competent | 287.3 | 318.8 | 336.3 | 15.5 | 34.3 | 35.5 | 8.5 | 7.3 | 7.8 | 1 / 1 / 0 | 1 / 1 / 0 | 269, 11 | 306, 13 |
| Combative | 269.8 | 245.8 | 240.5 | 16.8 | 22.3 | 38 | 15.3 | 8 | 10.5 | 1 / 1 / 0 | 0 / 0 / 0 | 315, 14 | – |
| Naive | 171 | 148.8 | 152 | 4.3 | 6.8 | 9.3 | 10 | 8.8 | 8.5 | 0 | 0 | – | – |

Royal Expeditionary Force at the end without a declaration (run B): Creative 51 land units, Competent 45, Combative 41, Naive 39 (before: 63, 61, 54 and 43). At the declarations: 34–46 land units.

What the numbers say:

- **Buildings**: about twice the building points for the advanced levels (Creative 28 → 52.5, Competent 15.5 → 35.5, Combative 16.8 → 38). Around turn 210 in the probe games (seeds 1000–1001) Creative had 30–38 building levels and Competent and Combative 8–13, against 0–3 before.
- **Independence**: declarations happen now (none in any tournament before), and the wars that were declared in the final runs lasted 11–14 turns; three of four were won. But Creative, which was meant to declare in half its games, declared in one of four (run A, lost after 12 turns) and in none in run B. Its economy and its liberty are the limits: in seed 1001 it never has the gold to arm (it gives much of its income to calm the natives, and its ships sell rarely), in seed 1000 its rebels stay under half until about turn 320, and elsewhere its rebels reach a majority around turns 270–300, so its declarations fall after turn 300 (probe games to turn 380: turns 313–369), when a 330-turn game leaves little room; and in seeds 1002–1003 another nation's war ended the game first.
- **Scores**: Competent gains (+49 in run B), mostly from its won war (+250 in one game) and buildings; Creative and Combative lose points (−23, −29), mostly in the games cut short by another nation's war, and Combative also from fewer colonies. Naive, unchanged, loses 19 points to the shorter games and the changed neighbours.

Left to do: a war AI that concentrates troops where the royal troops land and strikes them on the beach with dragoons and artillery from neighbouring colonies; a stronger Creative economy (gifts, shipping) so it can afford the army; and longer tournaments (408 turns, to 1850) to judge declarations that come after turn 300.

## Event choices (0.8)

Naive takes the first choice it can afford; Competent, Combative and Creative take the one with the best gold value (`valueEffects`, `events/effects.ts`). Checked against paired runs (an event fired with each choice from the same mid-game state, 30 turns played): fire repair, pirate guards, festival gifts and the Huguenot passage were each the better choice and the advanced levels take them; wolves and fever make no measurable difference. Two valuations were wrong and are fixed: a tax point was worth too little (60, now 150 gold), so the Seven Years' War levy was refused for a lasting tax rise; and native tension was a flat 1.5 per point, so prospectors were welcomed onto the land of an angry tribe (now a cost that grows towards anger, 600, and war, 800). `npm run tournament -- --events` prints the choices taken per event. See [design/events.md](design/events.md#tuning-08).

## Colony spacing and pace (0.6)

Players watching head starts saw computer nations found colonies almost in a grid, two tiles apart (sharing work tiles), and far too eagerly. The rules stay as in the original (any colonist founds; no colony next to another); only the computer players changed, together with a new rule, the colony charter (founding costs gold, see the README).

- **Sites** (`ai/common.ts`): `siteScore` counts a tile next to another colony (any nation's) at 25%, so two tiles apart a site loses up to three tiles and three tiles apart nothing (Naive gets this too). The advanced levels use `keenSiteScore`, which adds 5 for each bonus resource, 1.5 for each river tile and each land tile with 4+ food, and 2 for the coast, on unshared tiles; their later colonies are only sought where the colonist can walk. The first colony is placed exactly as before.
- **Pace** (`ai/advanced.ts` `expansionCheck`, `AiProfile.expansion`): a new colony only once the colonies older than two founding intervals average 3 colonists (Combative 2.5; a lone first colony needs 2), the last one is 6 turns old (Combative 4), every colony beyond the first two that has had 20 turns and 3 colonists is matched by an armed unit or a stockade (such outposts build the stockade first; a nation short of a defender ships 50 muskets for militia), and the charter leaves the reserve (gold is saved for it). When ready, the largest colony sends out its least skilled colonist (`sendSettler`, at most two settlers on the way); a settler on its way only needs the charter in hand and the pace. Otherwise colonists join colonies as before. A colonist with no colony to reach still founds one.

Measured with the same games as `npm run tournament -- --games 2 --turns 200 --size medium` (seeds 1000–1001), plus a measurement script outside the product: colonists per colony, mean distance to the nearest own colony, and the share of colonies with any colony two tiles away. After = these changes with the charter (the default); the last block is the same without the charter (`--no-charter`).

| Level | Score before | after | after, no charter | Colonies before | after | no charter | Colonists/colony before | after | no charter | Nearest own colony before | after | no charter | Colonies 2 tiles from another before | after | no charter |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Creative | 244.5 | 121.5 | 128 | 24 | 8.5 | 11 | 3.31 | 6.35 | 4.68 | 2.04 | 3.00 | 3.23 | 100% | 18% | 36% |
| Competent | 154 | 99 | 73.5 | 23 | 7 | 7.5 | 2.76 | 5.79 | 4.13 | 2.57 | 3.71 | 3.80 | 98% | 21% | 20% |
| Combative | 132 | 67.5 | 112.5 | 22.5 | 8.5 | 15 | 2.64 | 3.53 | 3.60 | 2.02 | 3.24 | 3.03 | 98% | 18% | 47% |
| Naive | 129.5 | 76.5 | 110 | 16.5 | 8.5 | 18 | 3.36 | 3.76 | 2.61 | 2.48 | 3.06 | 2.47 | 91% | 47% | 67% |

What the numbers say:

- **The grid is gone**: almost every colony had another two tiles away; now about a fifth with the charter. Own colonies are 3–4 tiles apart on average, and each holds about twice the people.
- **Scores fall by about half** (all levels). The score counts colonists, and many small colonies grow more of them: every colony works its centre tile for free and adds a food surplus. Fewer, larger colonies are what was asked for, but they cost points at turn 200; the levels keep their order (Creative first). Two games are few: Competent's second game (seed 1001) starts on a poor site and scores 24–76, which drags its average.
- **The charter** mostly hits Naive and Combative (they expanded fastest): 18 → 8.5 and 15 → 8.5 colonies.
- Tuning was done on other seeds (2000–2001), with short probe games; the full tournament was not rerun. Older tournament tables in this file were played without the charter and these pacing rules.

## Appendix: full feature tables (seeds 1000–1005, 6 games, 300 turns, medium)

### Before

| Feature | Naive | Competent | Combative | Creative | Gap |
| --- | ---: | ---: | ---: | ---: | --- |
| cmd:move | 452 | 722 | 1343 | 1286 |  |
| cmd:goto | 229 | 332 | 776 | 731 |  |
| cmd:gotoEurope | 35 | 25 | 26 | 29 |  |
| cmd:clearOrders | 0 | 0 | 0 | 0 | (not observable) |
| cmd:foundColony | 20 | 18 | 24 | 21 |  |
| cmd:attack | 0 | 0.2 | 0 | 0 | **never: Combative, Creative**; rare: Competent |
| cmd:speak | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:learn | 0 | 4.0 | 5.7 | 4.8 |  |
| cmd:tradeNatives | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:fortify | 0 | 0 | 0 | 0 | (not observable) |
| cmd:sentry | 0 | 0 | 0 | 0 | (not observable) |
| cmd:activate | 0 | 0 | 0 | 0 | (not observable) |
| cmd:skip | 0 | 0 | 0 | 0 | (not observable) |
| cmd:improve | 0 | 1.7 | 1.7 | 1.7 |  |
| cmd:assignJob | 60 | 2439 | 3015 | 3035 |  |
| cmd:leaveColony | 0 | 1.2 | 0.7 | 0.7 |  |
| cmd:equip | 0 | 1.2 | 0.7 | 0.7 |  |
| cmd:board | 35 | 35 | 47 | 51 |  |
| cmd:unboard | 33 | 33 | 44 | 48 |  |
| cmd:loadGoods | 0 | 0 | 0 | 0 | (not observable) |
| cmd:unloadGoods | 0 | 0 | 0 | 0 | (not observable) |
| cmd:setBuild | 0 | 39 | 43 | 40 |  |
| cmd:hurry | 0 | 3.8 | 7.7 | 3.5 |  |
| cmd:sellGoods | 10 | 29 | 40 | 48 |  |
| cmd:buyGoods | 0 | 4.5 | 2.5 | 3.0 |  |
| cmd:recruit | 12 | 9.5 | 6.7 | 8.7 |  |
| cmd:train | 0 | 6.3 | 17 | 20 |  |
| cmd:sailToEurope | 35 | 25 | 26 | 29 |  |
| cmd:sailToAmerica | 34 | 25 | 26 | 29 |  |
| cmd:disband | 0 | 0 | 0 | 0 | (not observable) |
| cmd:chooseFather | 0 | 0 | 0 | 0 | (not observable) |
| cmd:buyLand | 0 | 8.2 | 6.3 | 14 |  |
| cmd:takeLand | 0 | 0 | 7.5 | 0 | **never: Competent, Creative** |
| cmd:mission | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:cashTreasure | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:answerTax | 0 | 0 | 0 | 0 | (not observable) |
| cmd:payArrears | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:setExport | 0 | 0 | 0 | 0 | (not observable) |
| cmd:declareWar | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:proposePeace | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:giftTribe | 0 | 11 | 0 | 16 | **never: Combative** |
| cmd:declareIndependence | 0 | 0.2 | 0 | 0 | **never: Combative, Creative**; rare: Competent |
| cmd:endTurn | 293 | 293 | 293 | 293 |  |
| land:road built | 0 | 0.3 | 0 | 0.3 | **never: Combative**; rare: Competent, Creative |
| land:plowed | 0 | 1.0 | 1.5 | 1.0 |  |
| land:forest cleared | 0 | 0.3 | 0.2 | 0.3 | rare: Competent, Combative, Creative |
| equip:pioneer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| equip:soldier | 0 | 1.2 | 0.7 | 0.7 |  |
| equip:dragoon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| equip:scout | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| equip:missionary | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Lumber Mill | 0 | 0.8 | 1.3 | 1.3 |  |
| built:Blacksmith's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Tobacconist's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Weaver's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Distiller's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Fur Trading Post | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Armory | 0 | 0.3 | 0 | 0 | **never: Combative, Creative**; rare: Competent |
| built:Magazine | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Church | 0 | 0.2 | 0 | 0 | **never: Combative, Creative**; rare: Competent |
| built:Docks | 0.8 | 1.2 | 0.7 | 2.0 |  |
| built:Drydock | 0.2 | 0.5 | 0.5 | 0 | **never: Creative** |
| built:Shipyard | 0 | 0.2 | 0 | 0 | **never: Combative, Creative**; rare: Competent |
| built:Warehouse | 0.2 | 1.0 | 0.8 | 1.2 |  |
| built:Warehouse Expansion | 0 | 0.7 | 0.3 | 0.7 | rare: Combative |
| built:Stockade | 0 | 2.0 | 0.7 | 0.5 |  |
| built:Fort | 0 | 1.2 | 2.2 | 1.0 |  |
| built:Printing Press | 0 | 1.7 | 2.2 | 2.0 |  |
| built:Newspaper | 0 | 0.2 | 1.2 | 0.3 | rare: Competent, Creative |
| built:Schoolhouse | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:College | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:University | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Custom House | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Wagon Train | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Artillery | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Caravel | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Merchantman | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Galleon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Privateer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Frigate | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Artillery | 0 | 0 | 9.3 | 10 | **never: Competent** |
| bought unit:Caravel | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Merchantman | 0 | 0 | 0.2 | 0 | **never: Competent, Creative**; rare: Combative |
| bought unit:Galleon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Privateer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Frigate | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Farmer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Fisherman | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Silver Miner | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Lumberjack | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Ore Miner | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Master Carpenter | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Master Blacksmith | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Master Gunsmith | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Elder Statesman | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Firebrand Preacher | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Hardy Pioneer | 0 | 3.2 | 3.8 | 5.7 |  |
| trained expert:Seasoned Scout | 0 | 3.2 | 4.0 | 4.3 |  |
| trained expert:Veteran Soldier | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought tools | 0 | 3.8 | 1.5 | 2.0 |  |
| europe:bought muskets | 0 | 0 | 0.2 | 0 | **never: Competent, Creative**; rare: Combative |
| europe:bought horses | 0 | 0.7 | 0.8 | 1.0 |  |
| europe:bought trade goods | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought cloth | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought rum | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought cigars | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought coats | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:immigrant (crosses) | 24 | 19 | 25 | 24 |  |
| school:colonist taught | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trade:custom house sales | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:sold by wagon train | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:sold by ship | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:mission founded | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:convert joined | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| wagon:moves | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| explore:rumour explored | 1.8 | 2.2 | 2.2 | 2.7 |  |
| treasure:found | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| treasure:shipped by galleon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| fathers:joined | 8.7 | 11 | 12 | 12 |  |
| tax:raise accepted | 0.7 | 3.2 | 4.7 | 4.3 | (event) |
| tax:refused (boycott) | 0 | 0 | 0 | 0 | (not observable) |
| diplomacy:war started | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| diplomacy:peace made | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| combat:privateer attack | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| combat:settlement burned | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| combat:colony captured | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| independence:won | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| colony:colonist born | 43 | 54 | 86 | 68 | (event) |
| colony:colonist starved | 8.3 | 7.5 | 6.8 | 3.8 | (event) |
| colony:goods spoiled | 14143 | 5980 | 7381 | 8955 | (event) |
| combat:colony lost | 0 | 0.2 | 0 | 0 | (event) |
| natives:raid suffered | 137 | 79 | 183 | 52 | (event) |
| natives:tribe went to war | 3.0 | 2.0 | 4.5 | 2.0 | (event) |
| natives:missionary killed | 0 | 0 | 0 | 0 | (event) |
| explore:expedition lost | 0 | 0.2 | 0.3 | 0.2 | (event) |
| independence:lost | 0 | 0.2 | 0 | 0 | (event) |
| end:road tiles by colonies | 0 | 0.2 | 0.2 | 0.3 | (end state) |
| end:colonies linked by road | 0 | 0.3 | 0 | 0 | (end state) |
| end:ships | 1.0 | 0.8 | 1.2 | 1.0 | (end state) |
| end:cargo holds | 2.0 | 1.7 | 2.7 | 2.0 | (end state) |
| end:warships | 0 | 0 | 0 | 0 | (end state) |
| end:wagon trains | 0 | 0 | 0 | 0 | (end state) |
| end:artillery | 0 | 0 | 9.3 | 10 | (end state) |

### After

| Feature | Naive | Competent | Combative | Creative | Gap |
| --- | ---: | ---: | ---: | ---: | --- |
| cmd:move | 606 | 1265 | 1705 | 1849 |  |
| cmd:goto | 323 | 474 | 661 | 665 |  |
| cmd:gotoEurope | 37 | 40 | 30 | 37 |  |
| cmd:clearOrders | 0 | 0 | 0 | 0 | (not observable) |
| cmd:foundColony | 20 | 19 | 23 | 22 |  |
| cmd:attack | 0 | 0 | 4.3 | 0 | **never: Competent, Creative** |
| cmd:speak | 0 | 14 | 16 | 15 |  |
| cmd:learn | 0 | 4.7 | 5.3 | 6.3 |  |
| cmd:tradeNatives | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:fortify | 0 | 0 | 0 | 0 | (not observable) |
| cmd:sentry | 0 | 0 | 0 | 0 | (not observable) |
| cmd:activate | 0 | 0 | 0 | 0 | (not observable) |
| cmd:skip | 0 | 0 | 0 | 0 | (not observable) |
| cmd:improve | 0 | 25 | 21 | 22 |  |
| cmd:assignJob | 56 | 2863 | 3416 | 4134 |  |
| cmd:leaveColony | 0 | 8.7 | 6.8 | 9.5 |  |
| cmd:equip | 0 | 9.8 | 7.8 | 11 |  |
| cmd:board | 38 | 47 | 49 | 51 |  |
| cmd:unboard | 36 | 44 | 46 | 45 |  |
| cmd:loadGoods | 0 | 0 | 0 | 0 | (not observable) |
| cmd:unloadGoods | 0 | 0 | 0 | 0 | (not observable) |
| cmd:setBuild | 0.3 | 37 | 53 | 61 |  |
| cmd:hurry | 0 | 5.0 | 12 | 8.3 |  |
| cmd:sellGoods | 13 | 51 | 47 | 65 |  |
| cmd:buyGoods | 0 | 17 | 12 | 22 |  |
| cmd:recruit | 13 | 16 | 13 | 17 |  |
| cmd:train | 0 | 7.5 | 13 | 5.5 |  |
| cmd:sailToEurope | 37 | 38 | 30 | 37 |  |
| cmd:sailToAmerica | 37 | 38 | 30 | 38 |  |
| cmd:disband | 0 | 0 | 0 | 0 | (not observable) |
| cmd:chooseFather | 0 | 0 | 0 | 0 | (not observable) |
| cmd:buyLand | 0 | 12 | 9.5 | 15 |  |
| cmd:takeLand | 0 | 0 | 5.5 | 0 | **never: Competent, Creative** |
| cmd:mission | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:cashTreasure | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:answerTax | 0 | 0 | 0 | 0 | (not observable) |
| cmd:payArrears | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:setExport | 0 | 0 | 0 | 0 | (not observable) |
| cmd:declareWar | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:proposePeace | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:giftTribe | 0 | 18 | 0 | 36 | **never: Combative** |
| cmd:declareIndependence | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| cmd:endTurn | 301 | 301 | 301 | 301 |  |
| land:road built | 0 | 3.8 | 3.2 | 4.3 |  |
| land:plowed | 0 | 15 | 13 | 13 |  |
| land:forest cleared | 0 | 5.0 | 4.0 | 4.8 |  |
| equip:pioneer | 0 | 6.7 | 5.0 | 5.3 |  |
| equip:soldier | 0 | 2.0 | 1.8 | 4.2 |  |
| equip:dragoon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| equip:scout | 0 | 1.2 | 1.0 | 1.5 |  |
| equip:missionary | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Lumber Mill | 0 | 1.2 | 1.2 | 1.2 |  |
| built:Blacksmith's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Tobacconist's Shop | 0 | 0 | 0 | 0.2 | **never: Competent, Combative**; rare: Creative |
| built:Weaver's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Distiller's Shop | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Fur Trading Post | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Armory | 0 | 0.3 | 0.3 | 0 | **never: Creative**; rare: Competent, Combative |
| built:Magazine | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Church | 0 | 0.2 | 0.2 | 0.3 | rare: Competent, Combative, Creative |
| built:Docks | 0.3 | 0.8 | 0.8 | 2.7 |  |
| built:Drydock | 0 | 0.5 | 0.5 | 0.3 | rare: Creative |
| built:Shipyard | 0 | 0 | 0.2 | 0 | **never: Competent, Creative**; rare: Combative |
| built:Warehouse | 0.3 | 0.3 | 0.8 | 0.7 | rare: Competent |
| built:Warehouse Expansion | 0 | 0.3 | 0.3 | 0.7 | rare: Competent, Combative |
| built:Stockade | 0.2 | 2.7 | 2.3 | 1.5 |  |
| built:Fort | 0 | 1.7 | 3.3 | 3.0 |  |
| built:Printing Press | 0 | 1.7 | 2.0 | 2.7 |  |
| built:Newspaper | 0 | 0.5 | 1.5 | 1.2 |  |
| built:Schoolhouse | 0 | 0 | 0.2 | 0.2 | **never: Competent**; rare: Combative, Creative |
| built:College | 0 | 0 | 0 | 0.2 | **never: Competent, Combative**; rare: Creative |
| built:University | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built:Custom House | 0 | 0 | 0 | 0.2 | **never: Competent, Combative**; rare: Creative |
| built unit:Wagon Train | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Artillery | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Caravel | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Merchantman | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Galleon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Privateer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| built unit:Frigate | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Artillery | 0 | 0 | 10 | 0 | **never: Competent, Creative** |
| bought unit:Caravel | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Merchantman | 0 | 1.0 | 0.8 | 1.0 |  |
| bought unit:Galleon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| bought unit:Privateer | 0 | 0 | 0.2 | 0 | **never: Competent, Creative**; rare: Combative |
| bought unit:Frigate | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Farmer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Fisherman | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Silver Miner | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Lumberjack | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Expert Ore Miner | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Master Carpenter | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Master Blacksmith | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Master Gunsmith | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Elder Statesman | 0 | 4.8 | 0 | 2.2 | **never: Combative** |
| trained expert:Firebrand Preacher | 0 | 0.5 | 0.5 | 0.8 |  |
| trained expert:Hardy Pioneer | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| trained expert:Seasoned Scout | 0 | 1.2 | 1.0 | 1.5 |  |
| trained expert:Veteran Soldier | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought tools | 0 | 15 | 8.0 | 18 |  |
| europe:bought muskets | 0 | 1.5 | 2.7 | 3.2 |  |
| europe:bought horses | 0 | 0.2 | 0.8 | 1.0 | rare: Competent |
| europe:bought trade goods | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought cloth | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought rum | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought cigars | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:bought coats | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| europe:immigrant (crosses) | 25 | 24 | 26 | 29 |  |
| school:colonist taught | 0 | 0 | 0.3 | 1.3 | **never: Competent**; rare: Combative |
| trade:custom house sales | 0 | 0 | 0 | 6.7 | **never: Competent, Combative** |
| natives:sold by wagon train | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:sold by ship | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:mission founded | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| natives:convert joined | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| wagon:moves | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| explore:rumour explored | 0.3 | 6.5 | 4.0 | 7.5 |  |
| treasure:found | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| treasure:shipped by galleon | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| fathers:joined | 8.7 | 13 | 13 | 16 |  |
| tax:raise accepted | 0.7 | 4.0 | 3.2 | 5.8 | (event) |
| tax:refused (boycott) | 0 | 0 | 0 | 0 | (not observable) |
| diplomacy:war started | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| diplomacy:peace made | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| combat:privateer attack | 0 | 0 | 4.3 | 0 | **never: Competent, Creative** |
| combat:settlement burned | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| combat:colony captured | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| independence:won | 0 | 0 | 0 | 0 | **never: Competent, Combative, Creative** |
| colony:colonist born | 38 | 64 | 100 | 89 | (event) |
| colony:colonist starved | 11 | 6.5 | 6.5 | 3.8 | (event) |
| colony:goods spoiled | 11593 | 10137 | 10503 | 12502 | (event) |
| combat:colony lost | 0 | 0 | 0 | 0 | (event) |
| natives:raid suffered | 170 | 31 | 238 | 74 | (event) |
| natives:tribe went to war | 2.7 | 1.3 | 4.8 | 1.7 | (event) |
| natives:missionary killed | 0 | 0 | 0 | 0 | (event) |
| explore:expedition lost | 0 | 0 | 0 | 0 | (event) |
| independence:lost | 0 | 0 | 0 | 0 | (event) |
| end:road tiles by colonies | 0.3 | 5.0 | 3.0 | 4.7 | (end state) |
| end:colonies linked by road | 0 | 3.7 | 2.2 | 3.0 | (end state) |
| end:ships | 1.0 | 2.0 | 2.0 | 2.2 | (end state) |
| end:cargo holds | 2.0 | 6.0 | 5.7 | 6.7 | (end state) |
| end:warships | 0 | 0 | 0.2 | 0.2 | (end state) |
| end:wagon trains | 0 | 0 | 0 | 0 | (end state) |
| end:artillery | 0 | 0 | 10 | 0 | (end state) |
