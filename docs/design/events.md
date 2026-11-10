# Design note: Events

Status: **done (0.6)**: framework and starter set; rates and computer choices tuned in 0.8 (see Tuning). Engine in `packages/engine/src/events/`.

## Goal
A living world: dated **historical events** from the period, and **random events** in the Sim City spirit (storms, fires, bumper harvests). Both are switched on or off per game, and can be toggled during play. Events are data, so a scenario can later bring its own set (see [scenarios.md](scenarios.md)).

## Model
An **event definition** (`EventDef`, `events/types.ts`) is a plain object:

| Field | Meaning |
| --- | --- |
| `id`, `kind` | Unique id; `'historical'` or `'random'`. |
| `title`, `text` | Shown as news. Placeholders `{nation}`, `{colony}`, `{tribe}`, `{good}`, `{building}`, `{ship}`, `{unit}`, `{amount}`, `{cost}`, `{year}`. |
| `years` | Historical: the window `[from, to]` (inclusive) in which it may fire. |
| `chance` | Historical: chance per round inside the window. It fires at the latest in the window's last round, and only once per game. |
| `weight` | Random: relative weight when a random event is drawn. |
| `cooldown` | Random: turns before the same event can strike the same nation again (default 40). |
| `target` | A selector function: picks the nation's colony, ship, neighbouring tribe… and returns the event's variables, or `null` when the nation has nothing to target (then the event skips it). |
| `when`, `prepare` | Optional small functions: an extra condition; working out amounts and costs. |
| `effects` | Applied at once. |
| `choices` | Optional. Each has a label and effects; a choice with a gold `cost` is offered only when it can be paid. |
| `endText` | Message when a temporary modifier the event set runs out. |

**Effects** are tagged data (`events/effects.ts`): gold, goods in a colony, a production modifier for N turns (a colony or the whole nation; any products, bells included), native tension with a tribe, prices in the home port, crosses (immigration), tax, a unit gained (in a colony or on the docks), a ship laid up with cargo lost, a building damaged, goods lost, a new bonus resource, a chance (a sub-list applied with probability p) and a follow-up event N turns later (it picks its own target again then). Numbers may name a variable (`'$cost'`). A production modifier runs for N rounds of production: from the next turn when the event fires at the end of a round, from the current turn when a person's answer sets it.

**Historical** events are world events: when one fires, every European nation still loyal to the Crown gets its own target and, if the event has choices, its own choice. They are public history. **Random** events strike one nation: each round, each nation has `RANDOM_EVENT_RATE` (1.2% since 0.8, was 4%) chance of one, picked by weight among the events that have a target and are off cooldown. They are that nation's secret history.

## State and determinism
- `GameState.events` (missing until the first event or toggle): turns each event last fired (per nation for random ones), temporary modifiers `{ nation, colony?, products?, pct, until, source }`, pending choices, and scheduled follow-ups. Small: a few entries at any time.
- Every draw comes from a dedicated seeded stream (`eventRandom`: the seed hashed with a purpose string such as `random 140 england`), never `GameState.rng`. With both kinds off nothing is drawn and nothing is stored, so a game is bit-identical to one without the framework (tested).
- Unit ids still come from `nextId`, so only games with events on see different ids.

## Choices
- People answer in the turn-start briefing (`answerEvent` command). A choice not made by the end of the next round falls back to the event's `defaultChoice` (the last choice unless set).
- Computer players answer at once. **Naive** takes the first choice it can afford. **Advanced** levels value each choice's effects in gold (goods at home prices, production lost or gained, tension, units at their price, taxes) and take the best; a choice may give its own `ai` score.

## Switching
- `GameConfig.historicalEvents` and `randomEvents`. Missing means off in the engine, so arena games and tournaments run without events unless `--events` is given. The New game screen and Quick game switch both on.
- During a game: the Game menu toggles each kind with the `setEvents` command (deterministic, replayable). Switching off stops new events; running modifiers expire as usual.

## Content
About 9 historical and 12 random events for the Americas, 1492–1850 (`events/americas.ts`), written to be period-appropriate and respectful: no events that make light of slavery, of the epidemics that devastated Indigenous peoples, or of violence for flavour. A sickness event affects colonists' work for a few turns; no one dies.

## Later
- A scenario supplies its own set (`registerEventSet`); the game state then names the set.
- Chains of events, events between nations, and events that react to the player's own history.

## Tuning (0.8)
Measured with `npm run tournament -- --games 16 --turns 408 --size medium [--events]` (seeds 1000–1015; `--events` now also prints a per-event table: strikes per nation per game, choices taken, the computer players' gold value of the outcomes) and with a paired experiment: from a mid-game state, fire one event for one nation with each choice, play 30 turns, compare score and wealth with the same state without the event (three seeds, two dates, four Competent nations).

**Rate.** At 4% a nation had 19.9 events per game (13 random, 7 historical). Historical events are once per game and fixed by history, so only the random rate moved: `RANDOM_EVENT_RATE` 0.04 → 0.012 gives 9.8 events per nation per game over 408 rounds (about 4 random, 6 historical; a full game to 1850 adds the Age of Reason and the Seven Years' War). Tests keep the rate in 0.006–0.02 and the total in 6–13.

**Size.** Score is mostly colonists, buildings, production and fathers, and gold counts 1/800 point, so events move score little. In the paired experiment the best event (a skilled immigrant) was worth +2.2 points over 30 turns and the worst (a storm) −2.4, both under 1% of a typical 300–400; the gold estimates over a whole game come to 0.1–0.6 points per nation for every event. No event comes near 5% of score, so magnitudes and weights are unchanged. Rough conversion: 400 gold is about one score point.

**Level order and independence** (16 games each, before → with events): Competent 384.9 → 328.6, Creative 332.3 → 378.8, Combative 264.8 → 293.2, Naive 131.2 → 135.8. Independence won/lost: Competent 4/0 → 3/0, Creative 4/3 → 6/2, Combative 0/3 → 1/0, Naive 0/0 → 0/0. Naive stays last by a wide margin and Combative third; Competent and Creative swap, but the swing is the 250-point independence bonus landing in different games (standard error of a level's mean is about 25 points), so events change the results as any butterfly would, not systematically.

**Computer choices** (checked against the paired experiment):
- Fire repair, pirate guards, the festival gifts and the Huguenot passage were each taken by the advanced levels and each measured better than the alternative (fire repair +0.9 points over letting it burn, Huguenot passage +1.4). Wolves and fever showed no measurable difference between the choices, and the computer players take the cheaper one.
- The Seven Years' War levy was the one clear mistake: a +3% tax was valued at 60 gold per point (180) against a levy of about 120, with a bells bonus on top, so advanced levels refused the levy and kept the tax for the rest of the game. A tax point is now `TAX_POINT_VALUE` = 150 gold (a point of a share of every sale in Europe for the rest of the game), so the levy is paid.
- Tension was valued at a flat 1.5 gold per point, so the computer players welcomed prospectors on any tribe's land however angry the tribe. The cost now rises with the tribe's current tension (`tensionCost`: 1.5 per point plus a quadratic term above 300), about 120 gold for 80 points on a content tribe and over 500 on one near anger (600), so a calm tribe is still welcomed and an angry one is not provoked.

