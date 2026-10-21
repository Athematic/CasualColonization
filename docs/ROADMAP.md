# Roadmap

The one plan for Casual Colonization. We decide the priorities here together. New ideas first land in [CHANGE_SUGGESTIONS.md](CHANGE_SUGGESTIONS.md) (the inbox). Once discussed, an idea moves into a release below, goes to **Parked**, or is **Rejected** with a reason.

**How it works**
- One release at a time, each with a theme. A release is merged to `main` when we agree it is done.
- Anything bigger than M gets a short design note in [docs/design/](design/) before it is built.
- Changes to the computer players come with tournament numbers (`npm run tournament`, `--features` for the feature-use audit), so "smarter" is measured.
- Status: `idea` → `design` → `planned` → `in progress` → `done`.
- Sizes: **S** = hours, **M** = a day, **L** = several days, **XL** = a release on its own.
- Priority: **P1** is needed for the release, **P2** is wanted, **P3** goes in only if time allows.

## 0.3: Quality of play (in progress)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Cheat menu with a permanent cheated marker | M | P1 | done |
| Trade routes for ships and wagon trains; computer players stop goods spoiling (warehouses, routes, selling to natives) | L | P1 | done (spoilage −30% for advanced levels) |
| Turn-start modal with every decision and notice; turns-to-arrive badge on the go-to marker; stronger end-turn pulse | M | P1 | done |
| Progress statistics every turn, a Progress Graphs screen, shown when the game ends | M | P1 | done |
| Audit of which features each computer level uses; computer players build roads and buy ships | M | P1 | done (see [AI_FEATURE_AUDIT.md](AI_FEATURE_AUDIT.md)) |
| Next computer-player gaps from the audit: Combative's idle army, missions and native trade, schools and custom houses earlier, buying experts, declaring independence, refusing taxes | M | P2 | planned |
| New game screen previews planned options | S | P3 | done |
| Difficulty follow-ups: scale hurry-buy costs; computer ship buying uses adjusted prices; tune values against the original | S | P3 | idea |
| Rivers (minor and major): road-like movement, production bonus, in generated and stored maps, drawn in both styles, valued by the computer players | M | P1 | done |
| Difficulty levels (prices, taxes, native tension, size of the Royal Expeditionary Force, computer-player strength) | M | P2 | done (five levels in one `DIFFICULTY` table; they apply to the people's nations, computer players keep standard economics and their chosen level) |
| Rivers follow-ups: draw roads along rivers only as bridges, smooth diagonal seams, river defence bonus, Cooper Creek and the Yukon | S | P3 | idea |

## 0.4: Favoured Nation (the first thing the original could not do)

Design: [design/favoured-nation.md](design/favoured-nation.md)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| A market for every nation's home port, with supply and demand like the player's | L | P1 | done (each nation already had its own market; ships in a partner's port trade in, and move, the partner's market) |
| Taxes for every nation: computer nations raise and accept taxes, and boycott | M | P1 | in progress (every nation has a tax rate and computer nations get raises; the port nation's rate applies in its port; computer players refusing raises and boycotting comes with the AI step) |
| Trading with other Europeans: trade routes with stops at a foreign colony, by agreement | M | P1 | done for people (trade agreements, foreign stops that sell to and buy from the colony); computer players only answer proposals so far: in progress |
| Favoured Nation status: unlocked by years of peace plus trade routes, agreed by both sides, refusable by computer players, cancellable with consequences | L | P1 | done in the engine and for people (seeded hidden thresholds, cancellation with seizure, waiting and hostility, independence lapse, hot-seat rules, save format 3); computer players proposing it and building trade routes towards it: in progress |
| Trading and buying ships (not warships) in a favoured nation's home port, at its prices and taxes | M | P1 | done for people (port choice when sailing, a Europe screen per port); computer players choosing ports: in progress |
| Triangle trading by the Creative computer players when prices allow | M | P2 | idea |
| Diplomacy screen shows relations, years of peace, trade volume, and progress towards Favoured Nation | S | P1 | done (in words only, never the hidden thresholds) |

## 0.5: The classic game, part 1 (natives and the Crown)

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Visible native braves: wandering, visiting, trading, demanding, attacking | L | P1 | idea |
| Armed and mounted braves | S | P2 | idea |
| Buying goods from native settlements | S | P1 | idea |
| Burial grounds; surrender of a tribe after its capital falls | S | P2 | idea |
| Missionaries denouncing rival missions and inciting tribes | S | P3 | idea |
| A Royal Expeditionary Force that grows during the game, visible to the player | M | P1 | idea |
| Royal demands for gold; royal wars | M | P1 | idea |
| Advisor reports (colony, trade, military, naval, religion, natives, Congress, history) | M | P1 | idea |

## 0.6: A living world

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Event framework: seeded, toggleable from the Game menu, off in tournaments by default | M | P1 | idea |
| Historical events (a starter set) | M | P1 | idea |
| Random events in the Sim City spirit (a starter set) | M | P1 | idea |
| Roads in the Civilization II style: auto-road along a path, later railroads | M | P3 | idea, needs scoping |

## 0.7: The classic game, part 2

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Mercenaries; foreign intervention force; Tories after the declaration | M | P2 | idea |
| Damaged artillery, ambush bonus, fortresses and coastal forts, capturing equipment | M | P2 | idea |
| Mines running out | S | P3 | idea |
| Abandoning a colony; retiring early | S | P2 | idea |

## Beta 1–2: Cooperation

Builds on 0.4.
- Alliances and joint ventures between European nations; shared colonies.
- Native peoples as partners: trade agreements, cultural exchange, shared land use, mutual defence.
- New victory paths built around prosperity and cooperation.

Each beta gets design notes first.

## Scenarios

Design: [design/scenarios.md](design/scenarios.md) and [design/australia.md](design/australia.md). Comes after the cooperation betas, so Federation can be a peaceful way to win.

| Item | Size | Prio | Status |
| --- | --- | --- | --- |
| Scenario framework: map, nations, peoples, goods, units, Congress figures, era, events and victory as a data package; the Americas become the first scenario | L | P1 | idea, agreed |
| Each scenario offers a dedicated map or a generated one, and real rivals or alternative history | M | P1 | idea, agreed |
| Convict transport mechanic (Australia; late game for British colonies in the Americas) | M | P2 | idea, agreed |
| Australia map (geography preview with the current rules; ships arrive from the west) | M | P2 | done |
| Australia, 1788–1901: map, Aboriginal nations and Country, wool, wheat, gold and whaling, convict colonists, the long sea route, drought, Federation | XL | P1 | idea |
| Vinland, around 1000: Norse survival from Greenland with scarce resources and a fragile supply line | L | P3 | idea |

## Later

- More graphical styles as plugins.
- A map editor in the game.
- Network play (the deterministic engine already supports replays).

## Long-term ambition

- **Play on past 1850 in the Civilization II style:** tech trees, new diplomacy, new units. This is a project in itself and only starts when the list above runs dry.

## Parked

None yet.

## Rejected

| Idea | Why |
| --- | --- |
| New ship types in the Europe shop | The original ships are enough for now (decided October 2026) |
