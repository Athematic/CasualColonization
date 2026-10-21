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
6. **Saving.** This is a breaking change to the state. It is the moment to bump `SAVE_VERSION` to 3, with a migration that gives each nation the current shared prices.

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
- **First release:** no special rule. When a nation declares independence, it loses its home port, and with it the Favoured Nation status. This lapse does not count as a cancellation, so no penalties apply.
- **Later:** the outcome can depend on the history between the two nations. For example, France might keep its relationship with English colonies that rebel.

### 4. People in a hot-seat game
- Two nations played by people can become favoured nations **at any time**, without the thresholds, if both people agree.
- Either person can revoke it at any time. *Assumption, to confirm:* the cancellation consequences above (seized goods, waiting period) still apply, but not the computer hostility.

## How we measure it
Run tournaments with and without the feature. They should show more trade, fewer wars between favoured nations, and no drop in score.
