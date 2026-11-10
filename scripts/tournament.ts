// Plays computer-only games and compares AI levels.
// Usage: npm run tournament -- [--games 8] [--turns 300] [--size medium] [--levels naive,competent,combative,creative] [--seed 1000] [--map id] [--difficulty conquistador] [--features] [--no-favoured] [--events] [--no-charter] [--scenario id] [--rivals real|alternative] [--play-on] [--json]
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
import { AI_LEVELS, DIFFICULTY_LEVELS, formatArena, formatCrown, formatEvents, formatFeatures, formatRelations, formatScoreSplit, formatRelationsLine, runArena, type AiLevel, type DifficultyId, type MapSize, type Rivals } from '../packages/engine/src/index.ts';

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

const started = Date.now();
console.error(`Playing ${options.games} games of ${options.turns} turns: ${levels.join(' vs ')} on a ${options.mapSize} map${difficulty ? ` at ${difficulty}` : ''}${options.noFavoured ? ', without Favoured Nation proposals' : ''}${options.events ? ', with events' : ''}${options.noCharter ? ', without the colony charter' : ''}${options.rivals === 'real' ? ', real rivals' : ''}${options.playOn ? ', playing on after independence' : ''}...`);
const result = runArena(options, (rows, g) => {
  const line = rows.map((r) => `${r.level}:${r.score}`).join('  ');
  const half = (k: 'agreements' | 'favoured') => rows.reduce((n, r) => n + (r.relations?.[k] ?? 0), 0) / 2;
  const wars = rows.reduce((n, r) => n + (r.relations?.wars ?? 0), 0);
  const royal = rows.reduce((n, r) => n + (r.relations?.royalWars ?? 0), 0);
  const declared = rows.filter((r) => r.declared !== undefined).map((r) => `${r.level} ${r.independence}`).join(', ');
  const last = Math.max(...rows.map((r) => r.lastTurn ?? 0));
  console.error(`  game ${g + 1}/${options.games} (seed ${rows[0].seed}, to turn ${last}): ${line}  | agreements ${half('agreements')}, favoured ${half('favoured')}, wars ${wars} (royal ${royal})${declared ? `, independence: ${declared}` : ''}`);
});
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
