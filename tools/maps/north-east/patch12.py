D = __import__('os').path.dirname(__import__('os').path.abspath(__file__)) + '/'
p = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/docs/design/native-nations.md'
s = open(p).read()
sec = open(D + 'section13.md').read().replace('(measured: 27 of 27 colonies in one game)', '(measured: 16 of 16 colonies in one game)')
def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)
rep("""**Steps 1–7 are built** (sections 7–12; step 7's people score weights""",
    """**Steps 1–8 are built** (sections 7–13; step 8's North-east scenario is registered hidden until step 10, and all of its history (peoples, homelands, values, council members, arrivals, events) is drafted for Simon's review; step 7's people score weights""")
rep("""| 8 | **The North-east, 1000–1850.** The North-east map on squares with its regions and their renewal rates, its peoples researched with their own values (T19, T20), the arrivals, events (hard years among them), terms, head starts | L | P1 |""",
    """| 8 | **The North-east, 1000–1850.** The North-east map on squares with its regions and their renewal rates, its peoples researched with their own values (T19, T20), the arrivals, events (hard years among them), terms, head starts. **Built** (section 13; registered hidden until step 10) | L | P1 |""")
s = s.rstrip('\n') + '\n' + sec
open(p, 'w').write(s)
