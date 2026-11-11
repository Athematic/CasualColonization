R = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/test/'
def patch(f, pairs):
    p = R + f
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (f, a[:70])
        s = s.replace(a, b)
    open(p, 'w').write(s)

patch('maps.test.ts', [
    ("expect(STORED_MAPS.map((m) => m.id)).toEqual(['north-america', 'south-america', 'americas', 'australia', 'caribbean']);",
     "expect(STORED_MAPS.map((m) => m.id)).toEqual(['north-america', 'south-america', 'americas', 'australia', 'caribbean', 'north-east']);"),
    ("""      const arrivalX = def.entrySide === 'west' ? 1 : map.width - 2;
""", """      const arrivalX = def.entrySide === 'west' ? 1 : map.width - 2;
      // A map whose scenario plays native peoples, with nations arriving later and entry points of
      // their own (the North-east), is played in its own tests (test/scenarios/north-east*.test.ts).
      const games = !sc.peoples.playable?.length;
"""),
    ("""      it('places settlements for every tribe it claims, spaced apart', () => {""", """      if (games) it('places settlements for every tribe it claims, spaced apart', () => {"""),
    ("""      it('starts games with 1 and 8 nations on the arrival-edge high seas', () => {""", """      if (games) it('starts games with 1 and 8 nations on the arrival-edge high seas', () => {"""),
    ("""      it('sails to Europe from the arrival point and back', () => {""", """      if (games) it('sails to Europe from the arrival point and back', () => {"""),
    ("""      it('plays 30 AI-only turns and colonies get founded', () => {""", """      if (games) it('plays 30 AI-only turns and colonies get founded', () => {"""),
])
patch('scenarios.test.ts', [
    ("""    expect(STORED_MAPS.map((m) => m.id)).toEqual([...AMERICAS.map.stored.map((e) => e.id), 'caribbean']);""",
     """    expect(STORED_MAPS.map((m) => m.id)).toEqual([...AMERICAS.map.stored.map((e) => e.id), 'caribbean', 'north-east']);"""),
    ("""    // Every stored map but the Caribbean's, which belongs to the Caribbean scenario: the Americas'""",
     """    // Every stored map but the Caribbean's and the North-east's, which belong to their scenarios: the Americas'"""),
])
