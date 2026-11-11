p = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/scripts/tournament.ts'
s = open(p).read()
def rep(a, b):
    global s
    assert a in s, a[:80]
    s = s.replace(a, b)
rep("// Usage: npm run tournament -- [--games 8] [--turns 300] [--size medium] [--levels naive,competent,combative,creative] [--seed 1000] [--map id] [--difficulty conquistador] [--features] [--no-favoured] [--events] [--no-charter] [--scenario id] [--rivals real|alternative] [--play-on] [--jobs N] [--json]",
    "// Usage: npm run tournament -- [--games 8] [--turns 300] [--size medium] [--levels naive,competent,combative,creative] [--seed 1000] [--map id] [--difficulty conquistador] [--features] [--no-favoured] [--events] [--no-charter] [--scenario id] [--rivals real|alternative] [--play-on] [--peoples id,id|none] [--jobs N] [--json]")
rep("""// --jobs N: games played at once""", """// --peoples: native peoples playing as nations, all at the computer people's level (native-nations.md
// T4); by default every playable people of the scenario (the North-east's four), none in the
// Americas and the Caribbean, which have none. "none" plays without them. With peoples the run also
// prints the peoples' table, the winners' ways per game, the Europeans' colonies and each game's time.
// --jobs N: games played at once""")
rep("import { AI_LEVELS, arenaGames, DEFAULT_SCENARIO, DIFFICULTY_LEVELS, formatArena, getScenario, listScenarios, formatCrown, formatEvents, formatFeatures, formatProsperity, formatRelations, formatScoreSplit, formatRelationsLine, formatWays, playArenaRound, runArena, summarise, type AiLevel, type ArenaEntry, type ArenaOptions, type DifficultyId, type MapSize, type Rivals } from '../packages/engine/src/index.ts';",
    "import { AI_LEVELS, arenaGames, DEFAULT_SCENARIO, DIFFICULTY_LEVELS, formatArena, getScenario, listScenarios, formatCrown, formatEvents, formatFeatures, formatPeoples, formatProsperity, formatRelations, formatScoreSplit, formatRelationsLine, formatWays, playablePeoples, playArenaRound, runArena, summarise, type AiLevel, type ArenaEntry, type ArenaOptions, type DifficultyId, type MapSize, type Rivals, type TribeId } from '../packages/engine/src/index.ts';")
rep("""  const scenario = getScenario(options.scenario ?? DEFAULT_SCENARIO);
  if (!scenario) throw new Error(`Unknown scenario "${options.scenario}". Use ${listScenarios().map((sc) => sc.id).join(', ')}.`);
""", """  const scenario = getScenario(options.scenario ?? DEFAULT_SCENARIO);
  if (!scenario) throw new Error(`Unknown scenario "${options.scenario}". Use ${listScenarios().map((sc) => sc.id).join(', ')}.`);
  // Playing peoples: the scenario's playable ones unless --peoples names others (or none).
  const playable = playablePeoples(scenario).map((pp) => pp.id);
  const peopleArg = args.includes('--peoples') ? opt('peoples', '') : undefined;
  const peoples = (peopleArg === undefined ? playable : peopleArg === 'none' ? [] : (peopleArg.split(',') as TribeId[])) as TribeId[];
  for (const pp of peoples) if (!playable.includes(pp)) throw new Error(`${scenario.name} has no playable people "${pp}". Use ${playable.join(', ') || 'none'}.`);
  if (peoples.length) (options as ArenaOptions).peoples = peoples;
""")
rep("""${options.playOn ? ', playing on after independence' : ''}...`);""", """${options.playOn ? ', playing on after independence' : ''}${peoples.length ? `, with ${peoples.join(', ')} playing` : ''}...`);""")
rep("""    const last = Math.max(...rows.map((r) => r.lastTurn ?? 0));""", """    const last = Math.max(...rows.map((r) => r.lastTurn ?? 0));
    const pg = rows[0].peoplesGame;
    const peopleLine = pg ? `  | peoples: ${pg.peoples.map((pp) => `${pp.people} ${pp.towns ? `${pp.towns} towns` : 'out'}${pp.way ? ` (${pp.way})` : ''}`).join(', ')}; colonies: ${Object.entries(pg.colonies).map(([id, c]) => `${id} ${c!.now}`).join(', ')}; ways: ${[...new Set(Object.values(pg.ways))].join(', ') || 'none'}; ${(pg.ms / 1000).toFixed(1)} s` : '';""")
rep("""${near ? `, prosperity missed on one condition: ${near}` : ''}`);
  };""", """${near ? `, prosperity missed on one condition: ${near}` : ''}${peopleLine}`);
  };""")
rep("""    console.log(`${formatWays(result.entries)}\\n`);""", """    console.log(`${formatWays(result.entries)}\\n`);
    const peopleTable = formatPeoples(result.entries);
    if (peopleTable) console.log(`${peopleTable}\\n`);""")
open(p, 'w').write(s)
