/**
 * Score weights, difficulty and the Lost City Rumours as scenario data
 * (docs/design/scenario-framework.md, step 5). The Americas override nothing and keep today's
 * rumour table; test-only scenarios change each and the engine follows the data. That the
 * Americas play bit-identically is golden.test.ts's job.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  colonySiteProblem,
  createGame,
  createUnit,
  DIFFICULTY,
  difficultyOf,
  difficultyTable,
  isCoastal,
  player,
  recruitPrice,
  registerScenario,
  SCORE_WEIGHTS,
  scoreBreakdown,
  scoreWeightsOf,
  BURIAL_WEIGHT,
  type GameState,
  type NationId,
  type Unit,
} from '../src/index.js';
import { resolveRumour, rumourOdds } from '../src/rumours.js';

registerScenario({ ...AMERICAS, id: 'test-score', name: 'Score test', score: { colonist: 10, father: 0 } });
registerScenario({ ...AMERICAS, id: 'test-difficulty', name: 'Difficulty test', difficulty: { conquistador: { startingGold: 4321, recruitCost: 2 } } });
registerScenario({ ...AMERICAS, id: 'test-rumours', name: 'Rumour test', rumours: [{ outcome: 'colonist', weight: 1 }] });
registerScenario({
  ...AMERICAS,
  id: 'test-rumours-soto',
  name: 'Rumour test (de Soto)',
  rumours: [
    { outcome: 'nothing', weight: 50 },
    { outcome: 'treasure', weight: 1, scout: 7, difficulty: 'rumourGood' },
  ],
});

function game(scenario?: string, nations: NationId[] = ['england', 'france']): GameState {
  return createGame({ seed: 7, mapSize: 'small', nations, humans: [nations[0]], ...(scenario ? { scenario } : {}) });
}

function onLand(s: GameState, owner: NationId, type: Unit['type'], role: Unit['role'] = 'none'): Unit {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - 3; x++) {
      if (colonySiteProblem(s, x, y) || isCoastal(s, x, y)) continue;
      const u = createUnit(s, owner, type, { kind: 'map', x, y });
      u.role = role;
      return u;
    }
  }
  throw new Error('no site');
}

describe('score weights', () => {
  it('the Americas use SCORE_WEIGHTS as they are', () => {
    expect(AMERICAS.score).toBeUndefined();
    expect(scoreWeightsOf(game())).toBe(SCORE_WEIGHTS);
  });

  it('a scenario overrides some weights and keeps the rest', () => {
    const s = game('test-score');
    const w = scoreWeightsOf(s);
    expect(w.colonist).toBe(10);
    expect(w.father).toBe(0);
    expect(w.expert).toBe(SCORE_WEIGHTS.expert);
    const p = player(s, 'england');
    p.fathers.push('adamSmith');
    const line = (key: string) => scoreBreakdown(s, p).lines.find((l) => l.key === key)!;
    expect(line('colonists').points).toBe(line('colonists').value * 10);
    expect(line('fathers').points).toBe(0);
    const t = game();
    player(t, 'england').fathers.push('adamSmith');
    expect(scoreBreakdown(t, player(t, 'england')).lines.find((l) => l.key === 'fathers')!.points).toBe(SCORE_WEIGHTS.father);
  });
});

describe('difficulty', () => {
  it('the Americas use DIFFICULTY as it is', () => {
    expect(AMERICAS.difficulty).toBeUndefined();
    expect(difficultyTable(AMERICAS)).toBe(DIFFICULTY);
  });

  it('a scenario overrides one level’s values; other levels and values stay', () => {
    const s = game('test-difficulty');
    const human = player(s, 'england');
    expect(human.gold).toBe(4321);
    expect(difficultyOf(s, human).recruitCost).toBe(2);
    expect(difficultyOf(s, human).trainCost).toBe(DIFFICULTY.conquistador.trainCost);
    expect(difficultyOf(s, { difficulty: 'viceroy' })).toEqual(DIFFICULTY.viceroy);
    const t = game();
    expect(player(t, 'england').gold).toBe(DIFFICULTY.conquistador.startingGold);
    expect(recruitPrice(s, human)).toBeGreaterThan(recruitPrice(t, player(t, 'england')) * 1.9);
  });
});

describe('the rumour table', () => {
  it('the Americas keep today’s odds for every kind of explorer', () => {
    const s = game();
    const rules = difficultyOf(s, player(s, 'england'));
    const old = (scout: boolean, expert: boolean, tribal: boolean) => [
      ['nothing', 30 * rules.rumourBad],
      ['tales', 14],
      ['smallTreasure', 26],
      ['colonist', 10 * rules.rumourGood],
      ['treasure', (scout ? 10 : 5) * rules.rumourGood],
      ['fountain', (scout ? 4 : 2) * rules.rumourGood],
      ['lost', (expert ? 0 : scout ? 3 : 6) * rules.rumourBad],
      ...(tribal ? [['burial', BURIAL_WEIGHT * rules.burialGrounds]] : []),
    ];
    const settlement = Object.values(s.settlements)[0];
    for (const [type, role] of [['freeColonist', 'none'], ['freeColonist', 'scout'], ['seasonedScout', 'scout'], ['seasonedScout', 'none']] as const) {
      const u = onLand(s, 'england', type, role);
      for (const tribal of [false, true]) {
        expect(rumourOdds(s, u, tribal ? settlement : undefined)).toEqual(old(role === 'scout', type === 'seasonedScout', tribal));
      }
    }
  });

  it('a scenario’s own table decides the outcome', () => {
    const s = game('test-rumours');
    const u = onLand(s, 'england', 'freeColonist');
    expect(rumourOdds(s, u, Object.values(s.settlements)[0])).toEqual([['colonist', 1]]);
    const before = Object.values(s.units).filter((o) => o.owner === 'england' && o.type === 'freeColonist').length;
    resolveRumour(s, u);
    expect(Object.values(s.units).filter((o) => o.owner === 'england' && o.type === 'freeColonist').length).toBe(before + 1);
  });

  it('scout weights, difficulty and de Soto’s modifier apply to any table', () => {
    const s = game('test-rumours-soto');
    const colonist = onLand(s, 'england', 'freeColonist');
    const scout = onLand(s, 'england', 'seasonedScout', 'scout');
    expect(rumourOdds(s, colonist, undefined)).toEqual([['nothing', 50], ['treasure', 1]]);
    expect(rumourOdds(s, scout, undefined)).toEqual([['nothing', 50], ['treasure', 7]]);
    player(s, 'england').fathers.push('hernandoDeSoto');
    expect(rumourOdds(s, colonist, undefined)).toEqual([['nothing', 0], ['treasure', 1]]);
  });
});
