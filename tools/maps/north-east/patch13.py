p = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/docs/ROADMAP.md'
s = open(p).read()
def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)
rep("""Status: `in progress`; every decision made (Simon, 11 November 2026). Steps 1–7 built (the nation type, economy and growth, the council system, diplomacy from the people's side with trade for gold and epidemics, knowledge of the land, arrivals, victory and score; see the note's sections 7–12).""",
    """Status: `in progress`; every decision made (Simon, 11 November 2026). Steps 1–8 built (the nation type, economy and growth, the council system, diplomacy from the people's side with trade for gold and epidemics, knowledge of the land, arrivals, victory and score, the North-east scenario; see the note's sections 7–13).""")
rep("""

## Beta 4: Hex maps""", """

Step 8 is built (L, P1, done; branch `beta3/step8`): the North-east, 1000–1850, registered hidden until the New game screen can offer a people (step 10). A stored map on squares drawn from Natural Earth data (84 by 74 tiles, 82° W to 49.8° W and 40° N to 58.5° N: Newfoundland and Labrador, the Gulf and the St. Lawrence, the Maritimes, New England, the Hudson, the Great Lakes to Lake Huron, James Bay), with no corner-only straits or isthmuses for Beta 4's hexes, thirty-one rivers as waypoints and fifty land-health regions with their renewal rates; a geography test against real coordinates. Nineteen peoples researched with sources (the Dorset and the Thule's Inuit descendants, the Eeyou, the Innu, the Beothuk, the Algonquin, the Mi'kmaq, the Wolastoqiyik, the Penobscot, the Abenaki, the Wendat, the St. Lawrence Iroquoians, the Attawandaron, the Haudenosaunee, the Mohican, the Massachusett, the Wampanoag, the Narragansett and the Munsee), archaeological names marked, peoples who come (the Inuit, 1400) or leave (the Dorset, the St. Lawrence Iroquoians); the Haudenosaunee, the Wendat, the Mi'kmaq and the Innu playable, with their own values and two named council members (Membertou, Kondiaronk). One turn a year with head starts, the Europeans arriving one by one (England 1497, Portugal 1500, France 1534, Spain's Basque whalers 1536, the Netherlands 1614) each at its own entry point, the decided victory list, hard years, land health and epidemics on, its own events. All of its history drafted for Simon's review. Tournaments play the playing peoples (`--peoples`); in 24 computer games to 1850 no military win, every people survived and won by continuity, the Europeans stayed small (step 9 tunes both). The Americas and the Caribbean stay bit-identical (bench, golden and a 24-game tournament; section 13 of the note).

## Beta 4: Hex maps""")
open(p, 'w').write(s)
