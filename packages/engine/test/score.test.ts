import { describe, expect, it } from 'vitest';
import {
  addTreaty,
  BUILDINGS,
  BUILDING_ORDER,
  SCORE_WEIGHTS,
  applyCommand,
  createGame,
  createUnit,
  emptyGoods,
  player,
  score,
  scoreBreakdown,
  statsHistory,
  type Colony,
  type GameState,
  type UnitTypeId,
  setUnitLoc,
  removeUnit,
  removeColony,
  addColony as storeColony,
} from '../src/index.js';

function bare(): GameState {
  const s = createGame({ seed: 11, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'competent', france: 'competent' } });
  for (const u of Object.values(s.units)) removeUnit(s, u.id);
  for (const c of Object.values(s.colonies)) removeColony(s, c.id);
  for (const st of Object.values(s.settlements)) delete s.settlements[st.id];
  const p = player(s, 'england');
  p.gold = 0;
  p.fathers = [];
  return s;
}

/** A colony with `workers` colonists; the first `experts` are expert farmers on food tiles. */
function addColony(s: GameState, n: number, workers: number, experts: number, extraLevels: number): Colony {
  const buildings = Object.fromEntries(BUILDING_ORDER.map((k) => [k, BUILDINGS[k].initialLevel])) as Colony['buildings'];
  let left = extraLevels;
  for (const k of BUILDING_ORDER) {
    while (left > 0 && buildings[k] < BUILDINGS[k].levels.length) {
      buildings[k]++;
      left--;
    }
  }
  const c: Colony = { id: `c${n}`, owner: 'england', name: `Colony ${n}`, x: n, y: 1, goods: emptyGoods(), buildings, build: null, hammers: 0, liberty: 0, founded: 0, exports: {} };
  storeColony(s, c);
  for (let i = 0; i < workers; i++) {
    const type: UnitTypeId = i < experts ? 'expertFarmer' : 'freeColonist';
    createUnit(s, 'england', type, { kind: 'colony', colonyId: c.id, job: { kind: 'tile', x: n, y: 2 + i, good: 'food' } });
  }
  return c;
}

function nationOf(s: GameState, colonies: number, workers: number, experts: number, levels: number, produced: number): number {
  for (let i = 0; i < colonies; i++) addColony(s, i, workers, experts, levels);
  s.stats = { keys: [], turns: [], data: {}, flows: { england: { production: produced } } };
  return score(s, player(s, 'england'));
}

describe('score breakdown', () => {
  it('adds up to the total and names every component', () => {
    const s = bare();
    addColony(s, 0, 6, 2, 5);
    player(s, 'england').gold = 5000;
    player(s, 'england').fathers = ['adamSmith', 'jeffersonn'] as never;
    const b = scoreBreakdown(s, player(s, 'england'));
    expect(b.lines.map((l) => l.key)).toEqual(['colonists', 'experts', 'buildings', 'production', 'liberty', 'fathers', 'wealth', 'peace', 'independence', 'peoples']);
    expect(b.lines.reduce((sum, l) => sum + l.points, 0)).toBe(b.total);
    expect(b.total).toBe(score(s, player(s, 'england')));
    expect(b.lines.find((l) => l.key === 'colonists')).toMatchObject({ value: 6, points: 3 });
    expect(b.lines.find((l) => l.key === 'experts')).toMatchObject({ value: 2, points: 4 });
    expect(b.lines.find((l) => l.key === 'buildings')).toMatchObject({ value: 5 });
    expect(b.lines.find((l) => l.key === 'fathers')?.points).toBe(10);
  });

  it('counts experts only while they work in their speciality', () => {
    const s = bare();
    const c = addColony(s, 0, 2, 2, 0);
    expect(scoreBreakdown(s, player(s, 'england')).lines.find((l) => l.key === 'experts')?.value).toBe(2);
    for (const u of Object.values(s.units)) setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job: { kind: 'tile', x: 0, y: 0, good: 'lumber' } });
    expect(scoreBreakdown(s, player(s, 'england')).lines.find((l) => l.key === 'experts')?.value).toBe(0);
  });

  it('is driven by the weights table', () => {
    const s = bare();
    addColony(s, 0, 4, 1, 3);
    const p = player(s, 'england');
    p.independence = 'won';
    const base = score(s, p);
    expect(base).toBeGreaterThanOrEqual(SCORE_WEIGHTS.independence);
    expect(score(s, p, { ...SCORE_WEIGHTS, independence: 0 })).toBe(base - SCORE_WEIGHTS.independence);
    expect(score(s, p, { ...SCORE_WEIGHTS, colonist: 0, expert: 0, building: 0, production: 0, rebel: 0, father: 0, wealth: 0, independence: 0 })).toBe(0);
    expect(scoreBreakdown(s, p, { ...SCORE_WEIGHTS, building: 10 }).lines.find((l) => l.key === 'buildings')?.points).toBe(30);
  });

  it('rewards trade agreements, Favoured Nation and peaceful tribes', () => {
    const s = bare();
    const p = player(s, 'england');
    const before = score(s, p);
    const rel = s.relations[Object.keys(s.relations)[0]];
    addTreaty(s, 'trade', [rel.a, rel.b]);
    expect(score(s, p)).toBe(before + SCORE_WEIGHTS.tradeAgreement);
    addTreaty(s, 'favoured', [rel.a, rel.b]);
    expect(score(s, p)).toBe(before + SCORE_WEIGHTS.tradeAgreement + SCORE_WEIGHTS.favoured);
  });

  it('puts eight developed colonies at least level with twenty tiny ones', () => {
    // Twenty colonies of three colonists, no buildings, no experts, little production.
    const tiny = nationOf(bare(), 20, 3, 0, 0, 120);
    // Eight colonies of ten colonists: three experts at work, six building levels, solid production.
    const developed = nationOf(bare(), 8, 10, 3, 6, 200);
    expect(developed).toBeGreaterThanOrEqual(tiny);

    // Development counts for at least as much as raw headcount in the developed nation.
    const s = bare();
    for (let i = 0; i < 8; i++) addColony(s, i, 10, 3, 6);
    s.stats = { keys: [], turns: [], data: {}, flows: { england: { production: 200 } } };
    const b = scoreBreakdown(s, player(s, 'england'));
    const points = (k: string) => b.lines.find((l) => l.key === k)!.points;
    expect(points('experts') + points('buildings') + points('production')).toBeGreaterThanOrEqual(points('colonists'));
  });

  it('is deterministic and recorded in the progress history', () => {
    const run = () => {
      const s = createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'competent', france: 'competent' } });
      while (s.turn < 30 && !s.gameOver) applyCommand(s, { type: 'endTurn' });
      return s;
    };
    const a = run();
    const b = run();
    expect(scoreBreakdown(a, player(a, 'england'))).toEqual(scoreBreakdown(b, player(b, 'england')));
    const h = statsHistory(a);
    expect(h.series.england!.score.at(-1)).toBeGreaterThan(0);
    expect(h.series.england!.score).toEqual(statsHistory(b).series.england!.score);
  });
});
