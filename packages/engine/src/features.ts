/**
 * Feature-usage audit for the arena: which parts of the game each computer level uses, and
 * which it leaves alone. The counts come from the engine's telemetry hooks (see telemetry.ts),
 * plus a few end-of-game measurements of the nation's position.
 */
import { AI_LEVEL_INFO, type AiLevel } from './ai/profiles.js';
import { colonyAt, distance, isShip } from './queries.js';
import { BUILDINGS, BUILDING_ORDER } from './rules/buildings.js';
import { COLONY_BUILDS, PURCHASABLE, TRAINABLE, UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import type { GameState } from './types.js';

export type FeatureCounts = Record<string, number>;

/** How a feature is read in the audit. */
type FeatureKind =
  /** A feature a good player uses: zero use is a gap. */
  | 'use'
  /** Something that happens to a nation (raids, starvation); zero is fine. */
  | 'event'
  /** Changed directly by the AI code rather than through an engine function, so not observable. */
  | 'direct'
  /** End-of-game measurement, not a count of actions. */
  | 'state';

const COMMANDS = [
  'move', 'goto', 'gotoEurope', 'clearOrders', 'foundColony', 'attack', 'speak', 'learn', 'tradeNatives', 'fortify', 'sentry',
  'activate', 'skip', 'improve', 'assignJob', 'leaveColony', 'equip', 'board', 'unboard', 'loadGoods', 'unloadGoods', 'setBuild',
  'hurry', 'sellGoods', 'buyGoods', 'recruit', 'train', 'sailToEurope', 'sailToAmerica', 'disband', 'chooseFather', 'buyLand',
  'takeLand', 'mission', 'cashTreasure', 'answerTax', 'payArrears', 'setExport', 'declareWar', 'proposePeace', 'giftTribe',
  'declareIndependence', 'createRoute', 'assignRoute', 'proposeTrade', 'proposeFavoured', 'answerProposal', 'cancelTrade',
  'cancelFavoured', 'endTurn',
];
/** Commands the AI performs by changing the state itself, or that only people need. */
const DIRECT = new Set(['answerProposal', 'clearOrders', 'fortify', 'sentry', 'activate', 'skip', 'loadGoods', 'unloadGoods', 'disband', 'setExport', 'chooseFather']);

/** Every feature the audit lists, in display order, whether used or not. */
export const FEATURE_CATALOG: { id: string; kind: FeatureKind }[] = [
  ...COMMANDS.map((c) => ({ id: `cmd:${c}`, kind: (DIRECT.has(c) ? 'direct' : 'use') as FeatureKind })),
  ...['road built', 'plowed', 'forest cleared'].map((f) => ({ id: `land:${f}`, kind: 'use' as const })),
  ...['pioneer', 'soldier', 'dragoon', 'scout', 'missionary'].map((r) => ({ id: `equip:${r}`, kind: 'use' as const })),
  ...BUILDING_ORDER.flatMap((k) => BUILDINGS[k].levels.filter((l) => l.hammers > 0).map((l) => ({ id: `built:${l.name}`, kind: 'use' as const }))),
  ...(Object.keys(COLONY_BUILDS) as UnitTypeId[]).map((t) => ({ id: `built unit:${UNIT_TYPES[t].name}`, kind: 'use' as const })),
  ...PURCHASABLE.map((t) => ({ id: `bought unit:${UNIT_TYPES[t].name}`, kind: 'use' as const })),
  ...TRAINABLE.map((t) => ({ id: `trained expert:${UNIT_TYPES[t].name}`, kind: 'use' as const })),
  ...['tools', 'muskets', 'horses', 'trade goods', 'cloth', 'rum', 'cigars', 'coats'].map((g) => ({ id: `europe:bought ${g}`, kind: 'use' as const })),
  { id: 'europe:immigrant (crosses)', kind: 'use' },
  { id: 'school:colonist taught', kind: 'use' },
  { id: 'trade:custom house sales', kind: 'use' },
  { id: 'natives:sold by wagon train', kind: 'use' },
  { id: 'route:goods delivered to a colony', kind: 'use' },
  { id: 'route:goods sold in Europe', kind: 'use' },
  { id: 'route:colonists carried', kind: 'use' },
  { id: 'natives:sold by ship', kind: 'use' },
  { id: 'natives:mission founded', kind: 'use' },
  { id: 'natives:convert joined', kind: 'use' },
  { id: 'wagon:moves', kind: 'use' },
  { id: 'explore:rumour explored', kind: 'use' },
  { id: 'treasure:found', kind: 'use' },
  { id: 'treasure:shipped by galleon', kind: 'use' },
  { id: 'fathers:joined', kind: 'use' },
  { id: 'tax:raise accepted', kind: 'event' },
  { id: 'tax:refused (boycott)', kind: 'use' },
  { id: 'diplomacy:war started', kind: 'use' },
  { id: 'diplomacy:peace made', kind: 'use' },
  { id: 'diplomacy:proposal turned down', kind: 'event' },
  { id: 'diplomacy:trade agreement made', kind: 'use' },
  { id: 'diplomacy:favoured nation made', kind: 'use' },
  { id: 'diplomacy:favoured nation cancelled', kind: 'event' },
  { id: 'diplomacy:favoured nation cancelled over natives', kind: 'event' },
  { id: 'diplomacy:favoured nation cancelled for war', kind: 'event' },
  { id: 'diplomacy:war on a trade partner', kind: 'event' },
  { id: 'diplomacy:war on a Favoured Nation', kind: 'event' },
  { id: 'diplomacy:goods seized', kind: 'event' },
  { id: 'trade:foreign stop sales', kind: 'use' },
  { id: 'trade:foreign stop purchases', kind: 'use' },
  { id: 'europe:partner port sales', kind: 'use' },
  { id: 'europe:partner port purchases', kind: 'use' },
  { id: 'europe:partner port ship bought', kind: 'use' },
  { id: 'europe:sailed to a partner port', kind: 'use' },
  { id: 'route:foreign route created', kind: 'use' },
  { id: 'trade:triangle goods bought', kind: 'use' },
  { id: 'trade:triangle trade', kind: 'use' },
  { id: 'combat:privateer attack', kind: 'use' },
  { id: 'combat:settlement burned', kind: 'use' },
  { id: 'combat:colony captured', kind: 'use' },
  { id: 'independence:won', kind: 'use' },
  { id: 'colony:colonist born', kind: 'event' },
  { id: 'colony:colonist starved', kind: 'event' },
  { id: 'colony:goods spoiled', kind: 'event' },
  { id: 'combat:colony lost', kind: 'event' },
  { id: 'natives:raid suffered', kind: 'event' },
  { id: 'natives:tribe went to war', kind: 'event' },
  { id: 'natives:missionary killed', kind: 'event' },
  { id: 'explore:expedition lost', kind: 'event' },
  { id: 'independence:lost', kind: 'event' },
  ...['road tiles by colonies', 'colonies linked by road', 'ships', 'cargo holds', 'warships', 'wagon trains', 'artillery'].map((f) => ({ id: `end:${f}`, kind: 'state' as const })),
];

/** End-of-game measurements of a nation's position, merged into its feature counts. */
export function endStateFeatures(s: GameState, nation: string): FeatureCounts {
  const out: FeatureCounts = {};
  const colonies = Object.values(s.colonies).filter((c) => c.owner === nation);
  const w = s.map.width;
  const near = new Set<number>();
  for (const c of colonies) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= s.map.height || colonyAt(s, x, y)) continue;
        if (s.map.tiles[y * w + x].r) near.add(y * w + x);
      }
    }
  }
  out['end:road tiles by colonies'] = near.size;
  out['end:colonies linked by road'] = colonies.filter((c) => colonies.some((o) => o !== c && distance(o.x, o.y, c.x, c.y) <= 6 && roadLinked(s, c, o))).length;
  for (const u of Object.values(s.units)) {
    if (u.owner !== nation) continue;
    const def = UNIT_TYPES[u.type];
    if (isShip(u)) {
      out['end:ships'] = (out['end:ships'] ?? 0) + 1;
      out['end:cargo holds'] = (out['end:cargo holds'] ?? 0) + def.cargo;
      if (def.offence > 0) out['end:warships'] = (out['end:warships'] ?? 0) + 1;
    }
    if (def.kind === 'wagon') out['end:wagon trains'] = (out['end:wagon trains'] ?? 0) + 1;
    if (def.kind === 'artillery') out['end:artillery'] = (out['end:artillery'] ?? 0) + 1;
  }
  return out;
}

/** Whether a continuous road (colony tiles count as road) joins two colonies. */
function roadLinked(s: GameState, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const w = s.map.width;
  const road = (x: number, y: number) => !!s.map.tiles[y * w + x]?.r;
  const seen = new Set([a.y * w + a.x]);
  const queue = [a];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === b.x && p.y === b.y) return true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= s.map.height) continue;
        const i = y * w + x;
        if (seen.has(i) || !road(x, y) || distance(x, y, a.x, a.y) > 8) continue;
        seen.add(i);
        queue.push({ x, y });
      }
    }
  }
  return false;
}

const ADVANCED: AiLevel[] = ['competent', 'combative', 'creative'];

/** Below this average per game a feature counts as near-unused. */
export const NEAR_ZERO = 0.5;

/**
 * A Markdown table of features against levels (average uses per nation per game). The last
 * column flags features an advanced level never or hardly uses.
 */
export function formatFeatures(byLevel: { level: AiLevel; features: FeatureCounts }[]): string {
  const levels = byLevel.map((r) => r.level);
  const known = new Set(FEATURE_CATALOG.map((f) => f.id));
  const extra = [...new Set(byLevel.flatMap((r) => Object.keys(r.features)))].filter((id) => !known.has(id)).sort();
  const rows = [...FEATURE_CATALOG, ...extra.map((id) => ({ id, kind: 'use' as FeatureKind }))];
  const head = `| Feature | ${levels.map((l) => AI_LEVEL_INFO[l].name).join(' | ')} | Gap |`;
  const rule = `| --- | ${levels.map(() => '---:').join(' | ')} | --- |`;
  const lines = rows.map(({ id, kind }) => {
    const values = byLevel.map((r) => r.features[id] ?? 0);
    const cells = values.map((v) => (v === 0 ? '0' : v < 10 ? v.toFixed(1) : String(Math.round(v))));
    let gap = '';
    if (kind === 'use') {
      const never = byLevel.filter((r, i) => ADVANCED.includes(r.level) && values[i] === 0).map((r) => AI_LEVEL_INFO[r.level].name);
      const rare = byLevel.filter((r, i) => ADVANCED.includes(r.level) && values[i] > 0 && values[i] < NEAR_ZERO).map((r) => AI_LEVEL_INFO[r.level].name);
      if (never.length) gap = `**never: ${never.join(', ')}**`;
      if (rare.length) gap += `${gap ? '; ' : ''}rare: ${rare.join(', ')}`;
    } else if (kind === 'direct') gap = '(not observable)';
    else if (kind === 'event') gap = '(event)';
    else gap = '(end state)';
    return `| ${id} | ${cells.join(' | ')} | ${gap} |`;
  });
  return [head, rule, ...lines].join('\n');
}
