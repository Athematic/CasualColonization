R = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/src/'
def patch(f, pairs):
    p = R + f
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (f, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

patch('scenarios/types.ts', [("""  renewal?: Record<string, number>;
}""", """  renewal?: Record<string, number>;
  /**
   * Where a nation's ships arrive on this map, by nation: a water tile [x, y] (native-nations.md
   * T18, Beta 3 step 8: the North-east's nations each where their expeditions came). A nation not
   * listed takes the map's spacing along its arrival edge, as before.
   */
  entries?: Partial<Record<NationId, [number, number]>>;
}""")])

patch('game.ts', [("""  const entries = entryPoints(s.map, config.nations.length, world.entryRows, world.entrySide);""",
"""  const entries = entryPoints(s.map, config.nations.length, world.entryRows, world.entrySide);
  // A scenario may give a nation its own entry point on a stored map (StoredMapEntry.entries).
  const own = config.map ? scenarioOf(s).map.stored.find((e) => e.id === config.map)?.entries : undefined;
  if (own) config.nations.forEach((nation, i) => {
    const at = own[nation];
    if (at) entries[i] = { x: at[0], y: at[1] };
  });""")])
