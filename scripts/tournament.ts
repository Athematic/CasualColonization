// Plays computer-only games and compares AI levels.
// Usage: npm run tournament -- [--games 8] [--turns 300] [--size medium] [--levels naive,competent,combative,creative] [--seed 1000] [--map id] [--json]
import { AI_LEVELS, formatArena, runArena, type AiLevel, type MapSize } from '../packages/engine/src/index.ts';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const levels = opt('levels', AI_LEVELS.join(',')).split(',') as AiLevel[];
for (const l of levels) if (!AI_LEVELS.includes(l)) throw new Error(`Unknown level "${l}". Use ${AI_LEVELS.join(', ')}.`);
const options = {
  games: Number(opt('games', '8')),
  turns: Number(opt('turns', '300')),
  mapSize: opt('size', 'medium') as MapSize,
  levels,
  firstSeed: Number(opt('seed', '1000')),
  map: args.includes('--map') ? opt('map', '') : undefined,
};

const started = Date.now();
console.error(`Playing ${options.games} games of ${options.turns} turns: ${levels.join(' vs ')} on a ${options.mapSize} map...`);
const result = runArena(options, (rows, g) => {
  const line = rows.map((r) => `${r.level}:${r.score}`).join('  ');
  console.error(`  game ${g + 1}/${options.games} (seed ${rows[0].seed}): ${line}`);
});
if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
else console.log(`\n${formatArena(result.summary)}\n`);
console.error(`Done in ${Math.round((Date.now() - started) / 1000)}s.`);
