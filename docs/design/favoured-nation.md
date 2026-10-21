# Design note: Favoured Nation

Status: **agreed** (October 2026). "Random" below always means drawn from the game seed, so the same seed gives the same values. These values are hidden from players.

## Goal
Peaceful nations that trade with each other can become **Favoured Nations**. They then get access to each other's home ports, so the economy rewards cooperation, which the original game never did. This is the first step towards the cooperation overhaul.

## What we have agreed
- **How it is unlocked:** years of peace plus a number of trade routes between the two nations. Once both are reached, either side can propose it.
- **Agreement:** both sides must agree. A computer player can turn it down.
- **Effect:**
  - Computer players never declare war on a nation they favour.
  - Favoured nations can trade, and buy ships (but not warships), in each other's home ports.
- **Prices and taxes:** each port has its own market, with prices driven by supply and demand in the same way as the player's port today. The **port nation's tax rate applies**, so every nation needs its own taxes, not just people.
- **Cancelling:** either side can cancel. Both suffer: relations turn hostile, the trade routes between them are cancelled, and so on.
- **Triangle trading:** with more than one European port, the smartest computer players buy where goods are cheap and sell where they are dear, when the prices allow it.

## Engine changes this needs
1. **A market per nation.** Prices currently live on the player. Every European nation gets a market. A colony's goods can be sold in its own home port or in a favoured port. A ship has to sail to a particular port, so "Europe" becomes a choice of port when a ship leaves for Europe.
2. **Taxes for every nation.** Computer nations get tax raises from their Crown and decide whether to accept or boycott, as people do.
3. **Trade routes between nations.** A trade route can stop at a foreign colony once that nation agrees to trade there (a trade agreement). Goods sold there pay that colony's prices. Until there are colony markets, a simple valuation such as a share of the port nation's price would do.
4. **Relations.** Track for each pair of nations: years of peace (turns since the last war), the number of active trade routes between them, trade volume, attitude, and favoured status.
5. **Computer players.** They need rules for proposing and accepting Favoured Nation, the "never declare war" rule, and port choice and triangle-trade planning (Creative level).
6. **Saving.** This is a breaking change to the state. `SAVE_VERSION` goes to 3 and **older saves are not converted**: loading one shows a clear message that saves from before 0.4 can't be loaded. This was agreed, since there is a single player so far. Migration code returns once others play.

## Decided details

### 1. Unlocking
- **Years of peace:** 10 years, plus or minus a random 0–2 years, so 8–12 consecutive years since the two nations were last at war.
- **Trade routes:** a random 2–4 active trade routes between the two nations (routes that stop at the other nation's colonies).
- Both thresholds are drawn **for each pair of nations** when the game starts, from the game seed. They stay hidden. The diplomacy screen shows progress only roughly, for example "relations are warming".

### 2. Cancelling
Either side can cancel at any time. Starting values, to be tuned with tournaments:
- **Trade routes between the two nations** are all cancelled at once.
- **Seizure:** all goods within one tile of the other nation's colonies are seized by that nation. This covers goods carried by ships and wagon trains in or next to one of its colonies.
- **Waiting period:** no new trade routes between the two for 10 years, plus or minus a random 0–3 years. Favoured Nation needs a new run of years of peace and routes after that.
- **Hostility:** for 15 years, plus or minus a random 0–5 years, computer players on either side treat the other as a likely target. They weigh attacking over trading, are more likely to declare war, and refuse new agreements. A person's nation gets the same treatment from computer players.
- Both sides suffer, whoever cancels. The exact lengths are random and hidden, so players can't time around them.

### 3. Independence
- **First release:** no special rule. When a nation declares independence, it loses its home port, and with it the Favoured Nation status. This lapse does not count as a cancellation, so no penalties apply (confirmed).
- **Later:** the outcome can depend on the history between the two nations. For example, France might keep its relationship with English colonies that rebel.

### 4. People in a hot-seat game
- Two nations played by people can become favoured nations **at any time**, without the thresholds, if both people agree.
- Either person can revoke it at any time. Goods are still seized when it is revoked. The waiting period and computer hostility do not apply: between two people they can't be enforced, so they can agree again straight away.

## Implementation (step 1, October 2026)

Engine and people's interface are built; the computer players' strategic use (proposing, building routes towards it, choosing ports, triangle trading, refusing taxes) is the next step. Code: `packages/engine/src/relations.ts`, with the port rules in `europe.ts` and foreign stops in `routes.ts`; tests in `packages/engine/test/favoured.test.ts`. Decisions taken while building it, beyond the agreed details above:

- **Seeded values.** The hidden values (years of peace 8–12, routes 2–4, waiting 7–13 years, hostility 10–20 years, all whole years) come from a small dedicated random stream seeded by the game seed, the pair of nations and a purpose (`thresholds`, or `cancel N` for the Nth cancellation). They never draw from `GameState.rng`, so adding the feature did not change any other random outcome. The thresholds are drawn for every pair when the game starts and stored in `GameState.relations` (keyed `a|b`, alphabetical).
- **Years.** Years of peace and the waiting and hostility periods are counted in game years (two turns a year after 1600). A run of peace starts at the game start, at a peace treaty, or at a cancellation (so Favoured Nation needs a new run, as agreed).
- **Attitude** is not a separate number: `relationsMood` derives it from war, favoured status, hostility, the waiting period and the share of the years of peace reached ("Relations are cool / warming / friendly", "A long friendship", "Trust has to be rebuilt", "Relations are hostile"). `tradeTies` describes the routes the same way. The screen never shows the thresholds.
- **Trade volume** is the gold that has changed hands at each other's colonies, both ways, over the game.
- **Active trade routes between two nations** are routes of either nation with at least one stop at the other's colony and at least one ship or wagon train assigned.
- **Trade agreements.** A step before Favoured Nation: needed for foreign stops, and for Favoured Nation (except between two people, where Favoured Nation brings the agreement with it). Computer players accept when at peace, not hostile and not in a waiting period. Ending a plain agreement (`cancelTrade`) drops the foreign stops and has no other consequence; a favoured pair must cancel Favoured Nation instead, which ends both. One proposal per pair can be pending; a person answers it in the turn-start briefing or in Foreign Affairs, and conditions are checked again on acceptance.
- **Foreign stops.** A unit cannot enter a foreign colony, so it serves the stop from a tile next to it: ships from the water next to a coastal colony, wagon trains from the land. Unloaded goods fill the warehouse up to its capacity (or the rule's amount), paid at the owner's home-market sell price with no tax, as far as the owner's treasury allows; when it cannot pay at all the stop is skipped and reported. Loading buys only the surplus above 50 units of each good (or the rule's amount if higher) at the owner's buy price. Neither home market moves. A computer player's colonies take part passively; they do not yet build routes to foreign colonies.
- **Computer players and Favoured Nation.** They accept when at peace, not hostile, and the relationship has paid: at least 300 gold traded between the two, or a peace twice as long as the threshold. One that has picked a colony of the proposer as its war target refuses. They never declare war on, or attack (not even with privateers), a nation they favour, and their privateers also leave trade partners' ships alone.
- **Hostility in war decisions.** A computer player hostile to a nation weighs its colonies 1.6 times as attractive targets, looks further for them (14 tiles instead of 10), and shows at least a small aggression (0.3) towards it even at the peaceful Competent level.
- **Partner ports.** A ship's port is part of its location (`{ kind: 'europe', port }`, and on the way `{ kind: 'sailing', port }`; missing means its own). In a partner's port the market, prices and tax rate are the partner's; sales there never trigger a tax raise from either Crown; neither the partner's boycotts nor the visitor's own apply (a boycott is between a nation's colonies and its own Crown). Treasure landed there pays the partner's tax. Only unarmed ships (caravel, merchantman, galleon) can be bought, at the partner's prices, and only while one of your ships is in that port; a ship bought there starts there. Colonists are recruited, trained, equipped and go ashore only in the home port, and trade routes call only at the home port. When the status ends (cancelled, war, or the partner's independence) ships in, or sailing to, the other's port go to their own.
- **War.** Declaring war ends a trade agreement; on a Favoured Nation it counts as a cancellation by the nation that declares war, with all the consequences.
- **Independence.** The rebel's ships in partners' ports are lost with everything else in Europe; partners' ships in the rebel's port go home. Trade agreements stay.
- **Hot seat.** Between two people no thresholds, waiting period or hostility apply, and agreements can be made again straight away; goods are still seized on revoking.
- **Saves.** `SAVE_VERSION` is 3; `migrate` refuses older saves with a `SaveVersionError` ("Saves from before version 0.4 can't be loaded."), which the title screen, the New game screen and file import show.
- **Telemetry** for the feature audit: `diplomacy:trade agreement made`, `diplomacy:favoured nation made`, `diplomacy:favoured nation cancelled`, `diplomacy:goods seized`, `trade:foreign stop sales` and `purchases` (units), `europe:partner port sales` and `purchases` (units), `europe:partner port ship bought`, and the new commands.

## How we measure it
Run tournaments with and without the feature. They should show more trade, fewer wars between favoured nations, and no drop in score.
