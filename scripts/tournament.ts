// Plays computer-only games and compares AI levels.
// Usage: npm run tournament -- [--games 8] [--turns 300] [--size medium] [--levels naive,competent,combative,creative] [--seed 1000] [--map id] [--difficulty conquistador] [--features] [--no-favoured] [--events] [--no-charter] [--scenario id] [--rivals real|alternative] [--play-on] [--jobs N] [--json]
// --difficulty plays every nation at that level's economics, as if each were a person (computer
// players normally stay at Conquistador). Without it, games use the standard rules (Conquistador).
// --features also counts how often each level uses each game feature and prints a table of
// features against levels, flagging the ones the advanced levels never or hardly use.
// --no-favoured: computer players make no trade or Favoured Nation proposals, to measure what
// Favoured Nation brings. Every run also prints relations and trade between the nations, and the
// Crown: independence, the Royal Expeditionary Force against the old formula, demands and royal wars.
// Games use the colony charter (founding costs gold), as new games do; --no-charter switches it off.
// Nations rotate over the scenario's nation set (--scenario, the Americas by default); --rivals real
// rotates over its real rivals (for the Americas England, France, the Netherlands and Spain).
// --play-on: a War of Independence won or lost does not end the game; that nation is finished with
// the score it had then and the others play on, so every level is measured to --turns (use 609 for
// the Americas' last turn, autumn 1850).
// --jobs N: games played at once, each in a worker thread (default: the machine's cores less one).
// --jobs 1 plays them one after the other in this process, as before. The games are the same either
// way and the results are gathered in game order, so the tables are identical.
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { AI_LEVELS, arenaGames, DEFAULT_SCENARIO, DIFFICULTY_LEVELS, formatArena, getScenario, listScenarios, formatCrown, formatEvents, formatFeatures, formatRelations, formatScoreSplit, formatRelationsLine, playArenaRound, runArena, summarise, type AiLevel, type ArenaEntry, type ArenaOptions, type DifficultyId, type MapSize, type Rivals } from '../packages/engine/src/index.ts';

if (!isMainThread) {
  // A worker: plays the games it is sent (by number) and sends back their rows.
  const opts = workerData as ArenaOptions;
  const games = arenaGames(opts);
  parentPort!.on('message', (g: number | null) => {
    if (g === null) {
      parentPort!.close();
      return;
    }
    parentPort!.postMessage({ g, rows: playArenaRound(opts, games[g]) });
  });
} else {
  await main();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const levels = opt('levels', AI_LEVELS.join(',')).split(',') as AiLevel[];
  for (const l of levels) if (!AI_LEVELS.includes(l)) throw new Error(`Unknown level "${l}". Use ${AI_LEVELS.join(', ')}.`);
  const features = args.includes('--features');
  const difficulty = args.includes('--difficulty') ? (opt('difficulty', '') as DifficultyId) : undefined;
  if (difficulty && !DIFFICULTY_LEVELS.includes(difficulty)) throw new Error(`Unknown difficulty "${difficulty}". Use ${DIFFICULTY_LEVELS.join(', ')}.`);
  const options = {
    games: Number(opt('games', '8')),
    turns: Number(opt('turns', '300')),
    mapSize: opt('size', 'medium') as MapSize,
    levels,
    firstSeed: Number(opt('seed', '1000')),
    map: args.includes('--map') ? opt('map', '') : undefined,
    features,
    difficulty,
    noFavoured: args.includes('--no-favoured'),
    // Historical and random events (docs/design/events.md) are off in tournaments unless asked for.
    events: args.includes('--events'),
    noCharter: args.includes('--no-charter'),
    scenario: args.includes('--scenario') ? opt('scenario', '') : undefined,
    rivals: args.includes('--rivals') ? (opt('rivals', '') as Rivals) : undefined,
    playOn: args.includes('--play-on'),
  };
  if (options.rivals && options.rivals !== 'real' && options.rivals !== 'alternative') throw new Error(`Unknown rivals "${options.rivals}". Use real or alternative.`);
  const scenario = getScenario(options.scenario ?? DEFAULT_SCENARIO);
  if (!scenario) throw new Error(`Unknown scenario "${options.scenario}". Use ${listScenarios().map((sc) => sc.id).join(', ')}.`);

  const started = Date.now();
  console.error(`Playing ${options.games} games of ${options.turns} turns: ${levels.join(' vs ')} on a ${options.mapSize} map${scenario.id === DEFAULT_SCENARIO ? '' : ` in ${scenario.name}`}${difficulty ? ` at ${difficulty}` : ''}${options.noFavoured ? ', without Favoured Nation proposals' : ''}${options.events ? ', with events' : ''}${options.noCharter ? ', without the colony charter' : ''}${options.rivals === 'real' ? ', real rivals' : ''}${options.playOn ? ', playing on after independence' : ''}...`);
  const jobs = Math.max(1, Math.min(options.games, args.includes('--jobs') ? Number(opt('jobs', '1')) : availableParallelism() - 1));
  if (!Number.isInteger(jobs)) throw new Error(`--jobs needs a whole number.`);
  const report = (rows: ArenaEntry[], g: number) => {
    const line = rows.map((r) => `${r.level}:${r.score}`).join('  ');
    const half = (k: 'agreements' | 'favoured') => rows.reduce((n, r) => n + (r.relations?.[k] ?? 0), 0) / 2;
    const wars = rows.reduce((n, r) => n + (r.relations?.wars ?? 0), 0);
    const royal = rows.reduce((n, r) => n + (r.relations?.royalWars ?? 0), 0);
    const declared = rows.filter((r) => r.declared !== undefined).map((r) => `${r.level} ${r.independence}`).join(', ');
    const alliances = rows.reduce((n, r) => n + (r.relations?.alliances ?? 0), 0) / 2;
    const concord = rows.filter((r) => r.concord).map((r) => r.level).join(' + ');
    const confederation = rows.filter((r) => (r.relations?.confederations ?? 0) > 0).map((r) => r.level).join(' + ');
    const companies = rows.reduce((n, r) => n + (r.relations?.companies ?? 0), 0);
    const peopleMade = rows.reduce((n, r) => n + (r.relations?.peopleTreaties ?? 0), 0);
    const peopleEnded = rows.reduce((n, r) => n + (r.relations?.peopleTreatiesEnded ?? 0), 0);
    const breaches = rows.reduce((n, r) => n + (r.relations?.peopleBreaches ?? 0), 0);
    const leases = rows.reduce((n, r) => n + (r.relations?.leases ?? 0), 0);
    const lapsed = rows.reduce((n, r) => n + (r.relations?.leasesLapsed ?? 0), 0);
    const exchanges = rows.reduce((n, r) => n + (r.relations?.exchanges ?? 0), 0);
    const exchangesEnded = rows.reduce((n, r) => n + (r.relations?.exchangesEnded ?? 0), 0);
    const renewed = rows.reduce((n, r) => n + (r.relations?.renewedTeachings ?? 0), 0);
    const last = Math.max(...rows.map((r) => r.lastTurn ?? 0));
    console.error(`  game ${g + 1}/${options.games} (seed ${rows[0].seed}, to turn ${last}): ${line}  | agreements ${half('agreements')}, favoured ${half('favoured')}, wars ${wars} (royal ${royal}), alliances ${alliances}, companies ${companies}, people treaties ${peopleMade} (ended ${peopleEnded}, breaches ${breaches}), leases ${leases} (lapsed ${lapsed}), exchanges ${exchanges} (ended ${exchangesEnded}, taught again ${renewed})${declared ? `, independence: ${declared}` : ''}${confederation ? `, confederation: ${confederation}` : ''}${concord ? `, concord: ${concord}` : ''}`);
  };
  const result = jobs === 1 ? runArena(options, report) : await runParallel(options, jobs, report);
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`\n${formatArena(result.summary)}\n`);
    console.log(`Score by component, average points per nation:\n\n${formatScoreSplit(result.entries)}\n`);
    console.log(`Relations and trade between the Europeans, average per nation per game:\n\n${formatRelations(result.summary)}\n\n${formatRelationsLine(result.entries)}\n`);
    console.log(`The Crown: independence, the Royal Expeditionary Force (land units) against the old formula, demands and royal wars, average per nation per game:\n\n${formatCrown(result.entries)}\n`);
    if (options.events) console.log(`${formatEvents(result.entries)}\n`);
    if (features) {
      // Columns in the order the levels were listed, so tables from different runs line up.
      const byLevel = [...new Set(levels)].map((level) => ({ level, features: result.summary.find((r) => r.level === level)?.features ?? {} }));
      console.log(`Feature use, average per nation per game:\n\n${formatFeatures(byLevel)}\n`);
    }
  }
  console.error(`Done in ${Math.round((Date.now() - started) / 1000)}s.`);
}

/**
 * Plays the games in worker threads, `jobs` at a time, handing out the next game to whichever
 * worker is free. Rows are reported and gathered in game order, as runArena does.
 */
async function runParallel(opts: ArenaOptions, jobs: number, report: (rows: ArenaEntry[], g: number) => void): Promise<{ entries: ArenaEntry[]; summary: ReturnType<typeof summarise> }> {
  const total = arenaGames(opts).length;
  const done: (ArenaEntry[] | undefined)[] = new Array(total);
  const entries: ArenaEntry[] = [];
  let next = 0;
  let reported = 0;
  await new Promise<void>((resolve, reject) => {
    let running = 0;
    for (let w = 0; w < jobs; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: opts });
      running++;
      const feed = () => worker.postMessage(next < total ? next++ : null);
      worker.on('message', ({ g, rows }: { g: number; rows: ArenaEntry[] }) => {
        done[g] = rows;
        while (reported < total && done[reported]) {
          entries.push(...done[reported]!);
          report(done[reported]!, reported);
          reported++;
        }
        feed();
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`A tournament worker stopped with code ${code}.`));
        else if (--running === 0) resolve();
      });
      feed();
    }
  });
  if (reported !== total) throw new Error(`Only ${reported} of ${total} games came back.`);
  return { entries, summary: summarise(entries) };
}
