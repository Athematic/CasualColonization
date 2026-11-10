import { sellPrice } from './europe.js';
import { sonsOfLiberty } from './production.js';
import { yearOf } from './queries.js';
import { hasTradeAgreement, isFavoured } from './relations.js';
import { BUILDINGS, type BuildingKind } from './rules/buildings.js';
import { GOODS } from './rules/goods.js';
import { UNIT_TYPES } from './rules/units.js';
import { recentProduction } from './stats.js';
import type { GameState, Player } from './types.js';

/** The game ends after the autumn turn of this year. */
export const LAST_YEAR = 1850;

/**
 * Score weights, in one table so a scenario can override them (pass a modified copy to
 * `scoreBreakdown` / `score`). Each component is `round(value * weight)`; the total is the sum of
 * the rounded components, so a breakdown always adds up.
 *
 * Calibration (0.7): a few big, developed colonies must score at least as high as many tiny ones,
 * so headcount carries a low weight and development (experts at work, buildings, production,
 * liberty) carries more. Games saved before 0.7 keep the numbers of the old formula in their
 * Progress history (which counted colonists, rebels, fathers and gold only); new turns record
 * the new formula.
 */
export const SCORE_WEIGHTS = {
  /** Per colonist, anywhere (colonies, ships, Europe). Was 1 before 0.7. */
  colonist: 0.5,
  /** Per expert colonist who works in their speciality (an expert farmer on a food tile, an expert weaver at the weaver). */
  expert: 2,
  /** Per building level above what a new colony starts with. */
  building: 1.5,
  /** Per unit of goods (food excluded) produced per turn, averaged over the last `productionTurns` turns. */
  production: 0.25,
  /** Turns averaged for the production component. */
  productionTurns: 10,
  /** Per rebel colonist (colonists times Sons of Liberty share). Was up to 2 per colonist before 0.7. */
  rebel: 1,
  /** Per colony with at least half its colonists in the Sons of Liberty. */
  libertyHalf: 3,
  /** Extra per colony where every colonist is (100%). */
  libertyFull: 3,
  /** Per Founding Father. */
  father: 5,
  /** Per gold piece, counting the treasury and the goods in warehouses at home sell prices (food excluded). */
  wealth: 1 / 800,
  /** Per active trade agreement (a Favoured Nation partnership is an agreement too). */
  tradeAgreement: 3,
  /** Extra per Favoured Nation partnership. */
  favoured: 4,
  /** Per native settlement the nation has met whose tension is below `tensionBelow`. */
  peacefulTribe: 1,
  /** Tension (0 content, 1000 furious) under which a settlement counts as at peace. */
  tensionBelow: 200,
  /** Flat bonus for winning independence. */
  independence: 250,
};

export type ScoreWeights = typeof SCORE_WEIGHTS;

export type ScoreComponent =
  | 'colonists'
  | 'experts'
  | 'buildings'
  | 'production'
  | 'liberty'
  | 'fathers'
  | 'wealth'
  | 'peace'
  | 'independence';

export interface ScoreLine {
  key: ScoreComponent;
  label: string;
  /** What is counted (colonists, levels, goods per turn, ...). */
  value: number;
  /** What `value` is, for display. */
  unit: string;
  points: number;
}

export interface ScoreBreakdown {
  lines: ScoreLine[];
  total: number;
}

/** Each component of a nation's score: what is counted and the points it earns. The total is their sum. */
export function scoreBreakdown(s: GameState, p: Player, w: ScoreWeights = SCORE_WEIGHTS): ScoreBreakdown {
  let colonists = 0;
  let experts = 0;
  const workers = new Map<string, number>();
  for (const id in s.units) {
    const u = s.units[id];
    if (u.owner !== p.id) continue;
    const def = UNIT_TYPES[u.type];
    if (def.kind !== 'colonist') continue;
    colonists++;
    if (u.loc.kind !== 'colony') continue;
    workers.set(u.loc.colonyId, (workers.get(u.loc.colonyId) ?? 0) + 1);
    if (!def.expertFor) continue;
    const job = u.loc.job;
    if (job.kind === 'tile' ? job.good === def.expertFor : BUILDINGS[job.building].output === def.expertFor) experts++;
  }

  let levels = 0;
  let rebels = 0;
  let halfColonies = 0;
  let fullColonies = 0;
  let goods = 0;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== p.id) continue;
    for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) levels += Math.max(0, (c.buildings[kind] ?? 0) - BUILDINGS[kind].initialLevel);
    const pop = workers.get(c.id) ?? 0;
    const sol = sonsOfLiberty(s, c, pop);
    rebels += Math.round((pop * sol) / 100);
    if (pop > 0 && sol >= 50) halfColonies++;
    if (pop > 0 && sol >= 100) fullColonies++;
    for (const g of GOODS) if (g !== 'food') goods += (c.goods[g] ?? 0) * sellPrice(p, g);
  }

  let agreements = 0;
  let favoured = 0;
  for (const o of s.players) {
    if (o.id === p.id) continue;
    if (hasTradeAgreement(s, p.id, o.id)) agreements++;
    if (isFavoured(s, p.id, o.id)) favoured++;
  }
  let tribes = 0;
  for (const st of Object.values(s.settlements)) if (st.visited.includes(p.id) && (st.tension[p.id] ?? 0) < w.tensionBelow) tribes++;

  const production = recentProduction(s, p.id, w.productionTurns);
  const wealth = p.gold + goods;

  const line = (key: ScoreComponent, label: string, value: number, unit: string, points: number): ScoreLine => ({
    key, label, value: Math.round(value), unit, points: Math.round(points),
  });
  const lines: ScoreLine[] = [
    line('colonists', 'Colonists', colonists, 'colonists', colonists * w.colonist),
    line('experts', 'Experts at work', experts, 'experts', experts * w.expert),
    line('buildings', 'Buildings', levels, 'building levels', levels * w.building),
    line('production', 'Production', production, 'goods per turn', production * w.production),
    line('liberty', 'Liberty', rebels, 'rebel colonists', rebels * w.rebel + halfColonies * w.libertyHalf + fullColonies * w.libertyFull),
    line('fathers', 'Founding Fathers', p.fathers.length, 'fathers', p.fathers.length * w.father),
    line('wealth', 'Wealth', wealth, 'gold and goods', wealth * w.wealth),
    line('peace', 'Peace and cooperation', agreements + tribes, 'agreements and tribes', agreements * w.tradeAgreement + favoured * w.favoured + tribes * w.peacefulTribe),
    line('independence', 'Independence won', p.independence === 'won' ? 1 : 0, 'won', p.independence === 'won' ? w.independence : 0),
  ];
  return { lines, total: lines.reduce((sum, l) => sum + l.points, 0) };
}

export function score(s: GameState, p: Player, w: ScoreWeights = SCORE_WEIGHTS): number {
  return scoreBreakdown(s, p, w).total;
}

export function finalScores(s: GameState): Partial<Record<Player['id'], number>> {
  const out: Partial<Record<Player['id'], number>> = {};
  for (const p of s.players) if (p.id !== 'crown') out[p.id] = score(s, p);
  return out;
}

/** Ends the game when time runs out. */
export function checkTimeLimit(s: GameState): void {
  if (s.gameOver) return;
  const { year, season } = yearOf(s.turn);
  if (year < LAST_YEAR || (year === LAST_YEAR && season !== 'autumn')) return;
  const scores = finalScores(s);
  const winner = (Object.entries(scores) as [Player['id'], number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  s.gameOver = { turn: s.turn, reason: `The year ${LAST_YEAR} has come and the age of colonization is over.`, winner, scores };
}
