p = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/scripts/tournament.ts'
s = open(p).read()
a = """  if (peoples.length) (options as ArenaOptions).peoples = peoples;
"""
b = """  if (peoples.length) (options as ArenaOptions).peoples = peoples;
  // A scenario with no generated maps (the North-east) plays on its default stored map.
  if (!options.map && !scenario.map.generator) options.map = scenario.map.default;
"""
assert a in s
s = s.replace(a, b)
open(p, 'w').write(s)
