# Design note: Favoured Nation

Status: **draft**, to be agreed before 0.4 starts.

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

## Open questions
- **Thresholds:** for example, 20 years (40 turns) of peace and 2 active routes. The numbers will be tuned with tournaments.
- What does "hostile" mean in practice after a cancellation? Suggestion: no new agreements for 20 years, and computer players treat the other side as a likely target.
- When a nation declares independence, do its favoured relations continue? An independent nation has lost its home port.
- Can the human players in a hot-seat game become favoured nations with each other? Suggestion: yes, with both people accepting.
- Do natives get anything similar? That belongs to the Beta.

## How we measure it
Run tournaments with and without the feature. They should show more trade, fewer wars between favoured nations, and no drop in score.
