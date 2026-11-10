# Design note: Events

Status: **done (0.6)**: framework and starter set. Engine in `packages/engine/src/events/`.

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

**Historical** events are world events: when one fires, every European nation still loyal to the Crown gets its own target and, if the event has choices, its own choice. They are public history. **Random** events strike one nation: each round, each nation has `RANDOM_EVENT_RATE` (4%) chance of one, picked by weight among the events that have a target and are off cooldown. They are that nation's secret history.

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
