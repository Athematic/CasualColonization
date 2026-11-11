import { sellPrice } from './europe.js';
import { sonsOfLiberty } from './production.js';
import { AMERICAS_CALENDAR, buildingsOf, goodsOf, scoreWeightsOf, Term } from './scenarios/index.js';
import { hasTradeAgreement, isFavoured } from './relations.js';
import { BUILDINGS } from './rules/buildings.js';
import { UNIT_TYPES } from './rules/units.js';
import { recentProduction } from './stats.js';
import type { ScoreWeights } from './rules/score.js';
import type { GameState, Player } from './types.js';
import { companyScoreShare, isCompany, sharesIn } from './companies.js';
import { systemsOf } from './playerkind.js';
import { ownedUnitsView, colonyList } from './unitindex.js';
import { bound, partyIsPeople } from './treaties.js';

/** The Americas end after the autumn turn of this year (other scenarios: their calendar's `end`). */
export const LAST_YEAR = AMERICAS_CALENDAR.end.year;

export { SCORE_WEIGHTS, type ScoreWeights } from './rules/score.js';

export type ScoreComponent =
  | 'colonists'
  | 'experts'
  | 'buildings'
  | 'production'
  | 'liberty'
  | 'fathers'
  | 'wealth'
  | 'peace'
  | 'independence'
  /** Treaties with native peoples in force (Beta 2); only while the scenario weighs them. */
  | 'peoples'
  /** Shares in chartered companies (companies.ts): the holder's part of each company's score. Only for shareholders. */
  | 'companies';

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

/**
 * Each component of a nation's score: what is counted and the points it earns. The total is their
 * sum. The weights are the scenario's (SCORE_WEIGHTS with its overrides) unless given.
 */
export function scoreBreakdown(s: GameState, p: Player, w: ScoreWeights = scoreWeightsOf(s)): ScoreBreakdown {
  let colonists = 0;
  let experts = 0;
  const workers = new Map<string, number>();
  for (const u of ownedUnitsView(s, p.id)) {
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
  for (const c of colonyList(s)) {
    if (c.owner !== p.id) continue;
    for (const kind of buildingsOf(s, c.owner)) levels += Math.max(0, (c.buildings[kind] ?? 0) - BUILDINGS[kind].initialLevel);
    const pop = workers.get(c.id) ?? 0;
    const sol = sonsOfLiberty(s, c, pop);
    rebels += Math.round((pop * sol) / 100);
    if (pop > 0 && sol >= 50) halfColonies++;
    if (pop > 0 && sol >= 100) fullColonies++;
    for (const g of goodsOf(s)) if (g !== 'food') goods += (c.goods[g] ?? 0) * sellPrice(p, g);
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
    line('fathers', Term(s, 'members'), p.fathers.length, 'fathers', p.fathers.length * w.father),
    line('wealth', 'Wealth', wealth, 'gold and goods', wealth * w.wealth),
    line('peace', 'Peace and cooperation', agreements + tribes, 'agreements and tribes', agreements * w.tradeAgreement + favoured * w.favoured + tribes * w.peacefulTribe),
    line('independence', 'Independence won', p.independence === 'won' ? 1 : 0, 'won', p.independence === 'won' ? w.independence : 0),
  ];
  if (w.peopleTreaty) {
    let treaties = 0;
    for (const t of s.treaties ?? []) if (!t.end && bound(t, p.id) && t.parties.some(partyIsPeople)) treaties++;
    lines.push(line('peoples', 'Treaties with native peoples', treaties, 'treaties', treaties * w.peopleTreaty));
  }
  // A company cannot win: its score counts for its shareholders, by their shares.
  if (s.players.length > s.config.nations.length && systemsOf(p).ranked) {
    let held = 0;
    let points = 0;
    for (const co of s.players) {
      if (!isCompany(co)) continue;
      const share = sharesIn(co, p.id);
      if (!share.held) continue;
      held += share.held;
      points += companyScoreShare(co, p.id, scoreBreakdown(s, co, w).total);
    }
    if (held) lines.push(line('companies', 'Shares in companies', held, 'shares', points));
  }
  return { lines, total: lines.reduce((sum, l) => sum + l.points, 0) };
}

export function score(s: GameState, p: Player, w: ScoreWeights = scoreWeightsOf(s)): number {
  return scoreBreakdown(s, p, w).total;
}

/**
 * Every European nation's score at the end: its score now, or, for a nation finished in arena
 * play-on (victory.ts), the score it had when its War of Independence ended.
 */
export function finalScores(s: GameState): Partial<Record<Player['id'], number>> {
  const out: Partial<Record<Player['id'], number>> = {};
  for (const p of s.players) if (systemsOf(p).ranked) out[p.id] = p.finished ? p.finished.score : score(s, p);
  return out;
}
