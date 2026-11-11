R = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/src/'
def patch(f, pairs):
    p = R + f
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (f, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

patch('game.ts', [("import { checkSavedScenario, checkScenarioConfig, difficultyOf, goodsOf, nationOf, peoplesOf, portMarketOf, term } from './scenarios/index.js';",
                   "import { checkSavedScenario, checkScenarioConfig, difficultyOf, goodsOf, nationOf, peoplesOf, portMarketOf, scenarioOf, term } from './scenarios/index.js';")])
patch('scenarios/north-east.ts', [("""    stored: [{ id: 'north-east', peoples: NORTH_EAST_PEOPLES, renewal: NORTH_EAST_RENEWAL }],""",
"""    stored: [{ id: 'north-east', peoples: NORTH_EAST_PEOPLES, renewal: NORTH_EAST_RENEWAL, entries: ENTRIES }],""")
, ("""/** The order the nations arrived in.""", """/**
 * Where each nation's ships arrive (T18), on the Atlantic high seas off the coasts its fleets made
 * for: Portugal's off the Avalon, where the fishing fleets came to the Grand Banks; France's and
 * Spain's at the Atlantic mouth of the Strait of Belle Isle, Cartier's way into the Gulf and the
 * Basque whalers' grounds; England's off the Gulf of Maine, between Nova Scotia and New England
 * (Cabot's own landfall of 1497 was further north, on Newfoundland or Cape Breton: it is debated);
 * the Netherlands' off New York Bay and the Hudson. Tiles of the map (maps/north-east.ts).
 */
const ENTRIES: Partial<Record<NationId, [number, number]>> = {
  england: [40, 64],
  portugal: [80, 44],
  france: [72, 25],
  spain: [73, 22],
  netherlands: [31, 72],
};

/** The order the nations arrived in.""")])
