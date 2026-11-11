p = '/home/user/CasualColonization/.claude/worktrees/agent-a6bf0b8e558ac5fa7/packages/engine/src/arena.ts'
s = open(p).read()
s = s.replace("import { nationSet, playablePeoples, scenarioOf, type Rivals } from './scenarios/index.js';", "import { nationSet, scenarioOf, type Rivals } from './scenarios/index.js';")
anchor = """/**
 * A Markdown table of the `prosperity` victory per level"""
assert anchor in s
add = '''/**
 * The playing peoples over a run (only in games with playing peoples, `ArenaOptions.peoples`): per
 * people its games, how often it was still in the game at the end, its towns, people and score,
 * and its wins by way; then the winners' ways per game (each way counted once a game), how many
 * games the military victory ended, the conditions continuity and a good life failed on, the
 * Europeans' colonies and each game's time. Empty without playing peoples.
 */
export function formatPeoples(entries: ArenaEntry[]): string {
  const played = entries.flatMap((e) => (e.peoplesGame ? [e.peoplesGame] : []));
  if (!played.length) return '';
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const f1 = (n: number) => n.toFixed(1);
  const ids = [...new Set(played.flatMap((one) => one.peoples.map((p) => p.people)))];
  const kinds = ['military', 'confederacy', 'continuity', 'good-life'];
  const rows = ids.map((id) => {
    const list = played.flatMap((one) => one.peoples.filter((p) => p.people === id));
    const wins = kinds.map((k) => list.filter((p) => p.way === k).length);
    return `| ${id} | ${list.length} | ${list.filter((p) => p.towns > 0).length} | ${f1(avg(list.map((p) => p.towns)))} | ${f1(avg(list.map((p) => p.start)))} → ${f1(avg(list.map((p) => p.population)))} | ${f1(avg(list.map((p) => p.members)))} | ${Math.round(avg(list.map((p) => p.score)))} | ${wins.join(' | ')} |`;
  });
  const table = [`| People | Games | Survived | Towns | People (start → end) | Council | Score | ${kinds.join(' | ')} |`, `| --- |${' ---: |'.repeat(6 + kinds.length)}`, ...rows].join('\\n');
  const n = played.length;
  const wayGames = new Map<string, number>();
  for (const one of played) for (const w of new Set(Object.values(one.ways))) if (w) wayGames.set(w, (wayGames.get(w) ?? 0) + 1);
  const order = [...VICTORY_ORDER, 'retired'];
  const ways = [...wayGames.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((w) => `${w} ${wayGames.get(w)}`).join(', ') || 'none';
  const military = wayGames.get('military') ?? 0;
  const tally = (key: 'continuityFails' | 'goodLifeFails') => {
    const m = new Map<string, number>();
    for (const one of played) for (const p of one.peoples) for (const c of p[key]) m.set(c, (m.get(c) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}`).join(', ') || 'none';
  };
  const total = played.reduce((k, one) => k + one.peoples.length, 0);
  const survived = played.reduce((k, one) => k + one.peoples.filter((p) => p.towns > 0).length, 0);
  const nations = [...new Set(played.flatMap((one) => Object.keys(one.colonies)))] as PlayerId[];
  const colonies = nations
    .map((id) => {
      const list = played.flatMap((one) => (one.colonies[id] ? [one.colonies[id]!] : []));
      return `${id} ${f1(avg(list.map((c) => c.now)))} (founded ${f1(avg(list.map((c) => c.founded)))}, ${list.filter((c) => c.now > 0).length} of ${list.length} games with one)`;
    })
    .join('; ');
  const ms = played.map((one) => one.ms);
  return [
    `Playing peoples: ${total} played in ${n} games, ${survived} still in the game at the end (${Math.round((100 * survived) / Math.max(1, total))}%).`,
    '',
    table,
    '',
    `Winners' ways per game (games in which someone won that way): ${ways}. Military victory: ${military} of ${n} games (${f1((100 * military) / n)} in 100).`,
    `Continuity failed at the end on: ${tally('continuityFails')}. A good life failed on: ${tally('goodLifeFails')}.`,
    `European colonies at the end, per nation and game: ${colonies}.`,
    `Speed: ${f1(avg(ms) / 1000)} s a game on average (${f1(Math.min(...ms) / 1000)}–${f1(Math.max(...ms) / 1000)} s).`,
  ].join('\\n');
}

'''
s = s.replace(anchor, add + anchor)
open(p, 'w').write(s)
