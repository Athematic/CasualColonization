# Handover: Beta 4 (hex maps)

For the agent continuing Beta 4 on Simon's machine (12 November 2026). Until now the work was done in a cloud session. Read this file first, then `docs/design/hex-maps.md`.

## Where things stand

- **Branch:** `claude/beta4-hex-maps` (head 78fd2b3 before this file). It is built on the Beta 3 design branch and main as of 11 November.
- **Built:** steps 1, 2–3, 5 and 6. Each has an "Implementation" section at the end of `docs/design/hex-maps.md`, with a list headed "Open for Simon".
  - **Step 1:** `HEX_POINTY` and `HEX_FLAT` in `grid.ts`, `Scenario.map.grid`, `map.hex.orientation` and `map.workArea` (rings with size or building gates), `workarea.ts`, and movement keys per grid.
  - **Steps 2–3:** six-bit river and road masks through tile centres, and stored rivers read on hexes. Hex geometry in `packages/render-api/src/geometry.ts`. On hexes the schematic style, the minimap and the colony screen's hex flower all work.
  - **Step 5:** a placeholder sprite pack (`?style=placeholder`) and a check for missing sprite ids.
  - **Step 6:** Ligne claire on hexes. It looks right, and the painted pack draws hexes through it.
- **Hidden test scenarios:** `?scenario=hex-test` (pointy) and `?scenario=hex-test-flat`.
- **Not built:**
  - **Step 4, Vinland on hexes (the main remaining work):**
    - the conversion tool and a reviewed hex copy of the North-east map;
    - the Norse;
    - retuning the computer players with tournaments;
    - the Mac speed gate.
  - **Step 7, railroads:** optional, P3, and railroads don't exist yet.
- **Decisions:** in section 4 of the note. Simon decided H1–H4, H6–H9, H11 and H17 (hex turns may be up to 25% slower in Beta 4). The rest are recommendations he accepted along with the outline.

## Before starting step 4

1. **Merge main into the branch.** Main now has speed round 5 (PR #23). Merge with a merge commit; don't rebase a pushed branch.
2. **Merge Beta 3.** Step 4 depends on Beta 3's councils (step 3), arrivals (step 6) and the North-east map (step 8). All of these are on `claude/beta3-native-nations`, which a cloud session is still changing:
   - **The data model is being restructured.** The per-type selections (`Scenario.units`, `buildings` and `nationTypes.people`) are moving into one shape for every nation type, and the old fields will be removed.
   - **Step 10 follow-ups:** town names from the scenario, the North-east made visible in the menu, map sharing between peoples, and a Trade tab for a people.
   - **Research:** it moves to `docs/research/north-east-peoples.md`.

   **Ask Simon** whether those changes have landed on `claude/beta3-native-nations` before merging it; otherwise expect to merge again later. The overlapping files are listed in section 5 of the note ("Building beside Beta 3").
3. **Agree Vinland's content with Simon (H21)** before building any of it. H21 says to write a short design section at the start of step 4 covering:
   - the years and the calendar;
   - the map's extent;
   - how "thriving" is measured (the Norse leave unless they thrive);
   - the members of the Thing (the Norse council);
   - which peoples are playable.

   Simon's rule (T17 in `docs/design/native-nations.md`): **everything about the Norse, Greenland and the Vikings stays inside the Vinland scenario**. None of it goes into the main game or the North-east scenario. A pre-1000 scenario is a separate roadmap idea ("Before the year 1000").

## Step 4, as planned (note section 5)

1. **Conversion tool:** turn `packages/engine/src/maps/north-east.ts` (84×74 squares) into a hex copy, `north-east-hex`, in offset rows (H2, H11). Do a review pass, and build a small map review page only if the pass needs one (H20). The square map's generator scripts are in `tools/maps/north-east/` (see its README).
2. **The Vinland scenario on hexes:**
   - The Norse are a `norse` nation that arrives from Greenland and leaves unless thriving. Arrivals use `NationEntry.arrives` and `GameState.arrivals`.
   - The Thing is the Norse council (use Beta 3's council system, `Scenario.councils`).
   - Peoples play as Beta 3 allows.
   - Replace the disabled "Vinland, around 1000" entry in `apps/web/src/ui/newgame.ts` `PLANNED_SCENARIOS`.
3. **Retune the computer players for hexes (H12):**
   - radius constants as scenario data;
   - the job search over 18 tiles (note section 4, "H7 in full", and the speed remarks);
   - the ring-2 size threshold.

   Run tournaments on Vinland and `hex-test`, comparing against ring 1 only.
4. **Mac speed gate (H17):** time Vinland's head start and full game against a square game of the same size, and check the square games are unchanged. A hex turn may be at most 25% slower. Since this machine is the Mac, run it directly; `docs/perf/MAC_WORKER.md` describes the gate (`npm run perf:gate`, the Pareto rule).

Simon's open items from steps 1–6 are in each "Open for Simon" list. Ask him about them, but don't let them block step 4:
- when ring 2 opens;
- the placeholder style appearing in the menu for every game;
- keeping the painted pack on hexes;
- the rounding of coast corners;
- the default style for hex games;
- checking the H6 movement keys;
- overlapping yield badges on the colony tile;
- small ink glitches in Ligne claire.

## Rules for every change

- **Squares stay bit-identical.** Each commit must pass these checks:
  - `npx tsc -b`: clean.
  - `npm test`: passing.
  - `npm run bench -- --verify` and `npm run bench -- --verify --scenario caribbean`: "same" for every game.
  - The golden tests: unchanged.
  - **For larger engine changes,** compare the 24-game tournament against the base: `npm run tournament -- --games 24 --turns 609 --play-on --events --seed 1000`. Also run it with `CC_INDEX_CHECKS=1 CC_AI_CHECKS=1`.
- **Labelling outcome changes:** a commit that changes outcomes on purpose is labelled `[outcomes]` and re-records the hashes. On hexes that's expected, since only the hidden hex scenarios exist so far.
- **State:**
  - State is a plain JSON tree.
  - Indexes are written only through `setUnitLoc`, `addUnit`, `removeUnit` and `setUnitOwner`.
  - Read the lists through `colonyList(s)` and `unitList(s)`.
- **Branches and releases:**
  - Work on `claude/beta4-hex-maps`, or on short step branches from it that you merge back.
  - Nothing goes into main without Simon. Don't open the Beta 4 PR until he asks.
  - `npm run release` (which rebuilds `site/`) runs only in the release PR.
- **Write-ups:**
  - Record each step in a new "Implementation (step N)" section of the note: what was built, the choices made while building, "Open for Simon", and the measurements.
  - Update the Beta 4 status line in `docs/ROADMAP.md`.
  - Write in plain, short English, as the existing notes do.
- **Browser checks:** use Playwright (`require('playwright')`) with no page errors. Use `?scenario=` and `?style=` to reach the hex scenarios and styles.
- **Art:** Simon can generate only **3 OpenAI images a day**. Don't plan art that needs more. Prefer the placeholder pack and Ligne claire.
- **Big decisions:** stop and ask Simon about anything that needs a major rewrite or a big design call.
