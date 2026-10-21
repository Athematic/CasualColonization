// Plays computer-only games and compares AI levels.
// Usage: npm run tournament -- [--games 8] [--turns 300] [--size medium] [--levels naive,competent,combative,creative] [--seed 1000] [--map id] [--features] [--json]
// --features also counts how often each level uses each game feature and prints a table of
// features against levels, flagging the ones the advanced levels never or hardly use.
import { AI_LEVELS, formatArena, formatFeatures, runArena, type AiLevel, type MapSize } from '../packages/engine/src/index.ts';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const levels = opt('levels', AI_LEVELS.join(',')).split(',') as AiLevel[];
for (const l of levels) if (!AI_LEVELS.includes(l)) throw new Error(`Unknown level "${l}". Use ${AI_LEVELS.join(', ')}.`);
const features = args.includes('--features');
const options = {
  games: Number(opt('games', '8')),
  turns: Number(opt('turns', '300')),
  mapSize: opt('size', 'medium') as MapSize,
  levels,
  firstSeed: Number(opt('seed', '1000')),
  map: args.includes('--map') ? opt('map', '') : undefined,
  features,
};

const started = Date.now();
console.error(`Playing ${options.games} games of ${options.turns} turns: ${levels.join(' vs ')} on a ${options.mapSize} map...`);
const result = runArena(options, (rows, g) => {
  const line = rows.map((r) => `${r.level}:${r.score}`).join('  ');
  console.error(`  game ${g + 1}/${options.games} (seed ${rows[0].seed}): ${line}`);
});
if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`\n${formatArena(result.summary)}\n`);
  if (features) {
    // Columns in the order the levels were listed, so tables from different runs line up.
    const byLevel = [...new Set(levels)].map((level) => ({ level, features: result.summary.find((r) => r.level === level)?.features ?? {} }));
    console.log(`Feature use, average per nation per game:\n\n${formatFeatures(byLevel)}\n`);
  }
}
console.error(`Done in ${Math.round((Date.now() - started) / 1000)}s.`);
