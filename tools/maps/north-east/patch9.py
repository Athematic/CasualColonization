T = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/test/scenarios/north-east.test.ts'
A = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/src/arena.ts'
def patch(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

patch(T, [
    ("""    // "Wars after turn 50" of the Americas is 1542; turn 120 (1600 and 10 turns of spring and autumn) is 1605.""",
     """    // "Wars after turn 50" of the Americas is 1542; its turn 120 (1600 and twelve turns of spring and autumn) is 1606."""),
    ("    expect(aiTurn(s, 120)).toBe(605);", "    expect(aiTurn(s, 120)).toBe(606);"),
    ("""    // A second pass in the same year places nobody twice.
    processPeopleMoves(s);
    expect(count('inuit')).toBe(4);
""", ""),
    ("""      { games: 1, turns: 40, mapSize""", """      { games: 1, turns: 60, mapSize"""),
    ("""    const rows = playArenaRound(""", """    // Stopped in 1060, long before the Europeans arrive: they have no rows, the peoples are reported.
    const rows = playArenaRound("""),
    ("""    expect(rows[1].peoplesGame).toBeUndefined();
""", """    expect(rows).toHaveLength(1);
"""),
    ("""    play(s, 540);
    expect(formatDate(s.turn, calendarOf(s))).toBe('1540');""", """    play(s, turnOfYear(1540, calendarOf(s)) - s.turn);
    expect(formatDate(s.turn, calendarOf(s))).toBe('1540');"""),
])
patch(A, [("""  const entries = line.map((l) => {
    const standingThen""", """  // A nation that had not arrived when the game stopped (arrivals.ts) has no standing to report.
  const entries = line.filter((l) => s.players.some((p) => p.id === l.nation)).map((l) => {
    const standingThen""")])
