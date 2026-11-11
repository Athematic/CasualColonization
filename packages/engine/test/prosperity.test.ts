/**
 * Beta 2, step 5 (docs/design/native-partners.md, N10): the `prosperity` victory. Each condition
 * (peace with every people met for 30 years, no settlement burned, treaties with half the peoples
 * met, a score near the best), what "met" means, winning together, concord first, the partner
 * peoples named, the records it keeps (only where the scenario plays for it) and the score line.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  CARIBBEAN,
  prosperityLine,
  type ArenaEntry,
  applyCommand,
  calendarOf,
  checkVictory,
  createGame,
  createUnit,
  deserialize,
  neighbours,
  tileAt,
  hasMetPeople,
  isWater,
  lastTurn,
  makeAlliance,
  makePeopleTreaty,
  peopleList,
  peopleRelation,
  processNatives,
  PROSPERITY,
  prosperityStanding,
  prosperityWinners,
  registerScenario,
  SCORE_WEIGHTS,
  scoreBreakdown,
  serialize,
  yearValue,
  finalScores,
  type GameState,
  type NationId,
  type Scenario,
  type Settlement,
  type TribeId,
} from '../src/index.js';

/** The Americas playing for prosperity, after concord (as N10 orders it). */
const PROSPER: Scenario = {
  ...AMERICAS,
  id: 'test-prosperity',
  name: 'test-prosperity',
  hidden: true,
  mechanics: { ...AMERICAS.mechanics, alliances: true, peopleTreaties: ['people-trade', 'land-use', 'exchange', 'defence'] },
  victory: [{ id: 'independence-war' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'time' }],
};
registerScenario(PROSPER);

/** The same without prosperity: its records are never written. */
const PLAIN: Scenario = { ...PROSPER, id: 'test-prosperity-off', name: 'test-prosperity-off', victory: [{ id: 'independence-war' }, { id: 'concord' }, { id: 'time' }] };
registerScenario(PLAIN);

/** Other numbers through `params`. */
const STRICT: Scenario = { ...PROSPER, id: 'test-prosperity-strict', name: 'test-prosperity-strict', victory: [{ id: 'prosperity', params: { peaceYears: 50, treatyShare: 1, scoreShare: 0.95 } }, { id: 'time' }] };
registerScenario(STRICT);

type Seat = 'england' | 'france' | 'spain';

function game(scenario: string = PROSPER.id, seed = 42): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: ['england', 'france', 'spain'], scenario });
}

/** The peoples with settlements on the map, in the game's order. */
function peoples(s: GameState): TribeId[] {
  const living = new Set(Object.values(s.settlements).map((st) => st.tribe));
  return s.tribes.map((t) => t.id).filter((t) => living.has(t));
}

function tribe(s: GameState, id: TribeId) {
  return s.tribes.find((t) => t.id === id)!;
}

/** The last turn of the calendar, every nation's gold set (scores follow it), and no other contact. */
function ending(golds: Partial<Record<Seat, number>>, scenario: string = PROSPER.id): GameState {
  const s = game(scenario);
  for (const p of s.players) p.gold = golds[p.id as Seat] ?? 0;
  s.turn = lastTurn(calendarOf(s));
  return s;
}

/** Contact with each people and a treaty with the first `treaties` of them. */
function partner(s: GameState, nation: NationId, met: TribeId[], treaties: number): void {
  for (const people of met) peopleRelation(s, nation, people);
  for (const people of met.slice(0, treaties)) makePeopleTreaty(s, nation, people);
}

function landBeside(s: GameState, x: number, y: number): { x: number; y: number } {
  const n = neighbours(s, x, y).find(
    (p) => !isWater(tileAt(s, p.x, p.y)) && !Object.values(s.colonies).some((c) => c.x === p.x && c.y === p.y) && !Object.values(s.settlements).some((o) => o.x === p.x && o.y === p.y),
  );
  if (!n) throw new Error('no land beside');
  return n;
}

describe('prosperity: the scenarios', () => {
  it('the Americas and the Caribbean play for it after concord, and weigh treaties with peoples', () => {
    expect(AMERICAS.victory.map((v) => v.id)).toEqual(['independence-war', 'concord', 'prosperity', 'time']);
    expect(CARIBBEAN.victory.map((v) => v.id)).toEqual(['concord', 'prosperity', 'time']);
    expect(SCORE_WEIGHTS.peopleTreaty).toBe(3);
    expect(CARIBBEAN.score?.peopleTreaty).toBe(5);
  });

  it('marks a prosperity win, not a concord one, in the arena line', () => {
    const rows = [
      { game: 0, level: 'creative', prosperity: true, prosperityFails: [] },
      { game: 0, level: 'naive', prosperityFails: ['treaties'] },
      { game: 1, level: 'creative', prosperityFails: ['peace', 'score'] },
      { game: 1, level: 'naive', prosperityFails: ['score'] },
    ] as unknown as ArenaEntry[];
    expect(prosperityLine(rows)).toBe('Prosperity: 1 of 2 games won by prosperity (creative); at the end 1 of 4 nations qualified; failing each condition: peace 1, burned 0, treaties 1, score 2; failing only that one: peace 0, burned 0, treaties 1, score 1. ');
    expect(prosperityLine(rows.map((r) => ({ ...r, prosperityFails: undefined })))).toBe('');
  });
});

describe('prosperity: the conditions', () => {
  it('a nation at peace with the peoples it met, with treaties with half of them and the best score, wins', () => {
    const s = ending({ england: 800_000, france: 100_000, spain: 100_000 });
    const [a, b] = peoples(s);
    partner(s, 'england', [a, b], 1);
    const st = prosperityStanding(s, 'england', finalScores(s));
    expect(st.met).toEqual([a, b]);
    expect(st.partners).toEqual([a]);
    expect(st.needed).toBe(1);
    expect(st.fails).toEqual([]);
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual(['england']);
    expect(s.gameOver?.partners).toEqual([a]);
    expect(s.gameOver?.reason).toMatch(new RegExp(`In peace and partnership with ${peopleList([a])}, England wins by prosperity\\.`));
  });

  it('peace: at war with a people met, or a war ended within 30 years, fails; one ended longer ago does not', () => {
    const s = ending({ england: 800_000 });
    const [a, b] = peoples(s);
    partner(s, 'england', [a, b], 1);
    const scores = finalScores(s);
    tribe(s, b).stance.england = 'war';
    expect(prosperityStanding(s, 'england', scores).fails).toEqual(['peace']);
    tribe(s, b).stance.england = 'peace';
    const cal = calendarOf(s);
    // A war that ended 20 years before the end still counts; one 31 years before does not.
    const back = (years: number) => {
      let turn = s.turn;
      while (yearValue(s.turn, cal) - yearValue(turn, cal) < years) turn--;
      return turn;
    };
    tribe(s, b).warEnded = { england: back(20) };
    expect(prosperityStanding(s, 'england', scores).notAtPeace).toEqual([b]);
    tribe(s, b).warEnded = { england: back(31) };
    expect(prosperityStanding(s, 'england', scores).fails).toEqual([]);
    // Another nation's war is not England's.
    tribe(s, b).warEnded = { france: s.turn };
    expect(prosperityStanding(s, 'england', scores).fails).toEqual([]);
  });

  it('burned: a nation that ever burned a settlement never qualifies, even of a people it has no treaty with', () => {
    const s = ending({ england: 800_000 });
    const [a, b, c] = peoples(s);
    partner(s, 'england', [a], 1);
    tribe(s, c ?? b).burned = ['england'];
    const st = prosperityStanding(s, 'england', finalScores(s));
    expect(st.burned).toBe(true);
    expect(st.fails).toContain('burned');
    // Burning is meeting: the people counts among those met.
    expect(st.met).toContain(c ?? b);
  });

  it('treaties: at least half of the peoples met (rounded up), and at least one', () => {
    const s = ending({ england: 800_000 });
    const list = peoples(s);
    expect(list.length).toBeGreaterThanOrEqual(3);
    const [a, b, c] = list;
    partner(s, 'england', [a, b, c], 1);
    let st = prosperityStanding(s, 'england', finalScores(s));
    expect(st.needed).toBe(2);
    expect(st.fails).toEqual(['treaties']);
    makePeopleTreaty(s, 'england', b, 'people-trade');
    st = prosperityStanding(s, 'england', finalScores(s));
    expect(st.partners).toEqual([a, b]);
    expect(st.fails).toEqual([]);
    // Any kind with a people counts, and several with one people count once.
    makePeopleTreaty(s, 'england', a, 'exchange');
    expect(prosperityStanding(s, 'england', finalScores(s)).partners).toEqual([a, b]);
    // Nobody met: no treaty, no prosperity.
    expect(prosperityStanding(s, 'france', finalScores(s)).fails).toContain('treaties');
    expect(prosperityStanding(s, 'france', finalScores(s)).needed).toBe(1);
  });

  it('treaties: a people met but gone from the map does not count against the nation', () => {
    const s = ending({ england: 800_000 });
    const [a, b] = peoples(s);
    partner(s, 'england', [a, b], 1);
    peopleRelation(s, 'england', peoples(s)[2]);
    expect(prosperityStanding(s, 'england', finalScores(s)).needed).toBe(2);
    const gone = peoples(s)[2];
    for (const st of Object.values(s.settlements)) if (st.tribe === gone) delete s.settlements[st.id];
    expect(prosperityStanding(s, 'england', finalScores(s)).needed).toBe(1);
  });

  it('score: at least 0.8 of the best', () => {
    const s = ending({ england: 600_000, france: 800_000 });
    const [a] = peoples(s);
    partner(s, 'england', [a], 1);
    const scores = finalScores(s);
    const st = prosperityStanding(s, 'england', scores);
    expect(st.scoreShare).toBeCloseTo(scores.england! / scores.france!);
    expect(st.fails).toEqual(scores.england! >= 0.8 * scores.france! ? [] : ['score']);
    s.players.find((p) => p.id === 'england')!.gold = 300_000;
    expect(prosperityStanding(s, 'england', finalScores(s)).fails).toEqual(['score']);
  });

  it('every number is the scenario\'s: the victory entry\'s params', () => {
    expect(PROSPERITY).toEqual({ peaceYears: 30, treatyShare: 0.5, scoreShare: 0.8 });
    const s = ending({ england: 800_000, france: 780_000 }, STRICT.id);
    const [a, b] = peoples(s);
    partner(s, 'england', [a, b], 1);
    checkVictory(s, { kind: 'round' });
    // Half the peoples is not enough here (all of them), so the game falls through to time.
    expect(s.gameOver?.partners).toBeUndefined();
    expect(s.gameOver?.winners).toEqual(['england']);
  });

  it('is checked at the end of the calendar only', () => {
    const s = ending({ england: 800_000 });
    const [a] = peoples(s);
    partner(s, 'england', [a], 1);
    s.turn--;
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver).toBeUndefined();
  });
});

describe('prosperity: met', () => {
  it('a people is met once the standing is written or once the nation has fought it', () => {
    const s = game();
    const [a, b, c] = peoples(s);
    expect(hasMetPeople(s, 'england', tribe(s, a))).toBe(false);
    peopleRelation(s, 'england', a);
    expect(hasMetPeople(s, 'england', tribe(s, a))).toBe(true);
    tribe(s, b).stance.england = 'war';
    expect(hasMetPeople(s, 'england', tribe(s, b))).toBe(true);
    tribe(s, c).warEnded = { england: 3 };
    expect(hasMetPeople(s, 'england', tribe(s, c))).toBe(true);
    expect(hasMetPeople(s, 'france', tribe(s, c))).toBe(false);
  });
});

describe('prosperity: winners', () => {
  it('every nation that qualifies wins together, best first, with all their partners named', () => {
    const s = ending({ england: 700_000, france: 800_000, spain: 100_000 });
    const [a, b, c] = peoples(s);
    partner(s, 'england', [a, b], 1);
    partner(s, 'france', [c], 1);
    makePeopleTreaty(s, 'france', a);
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual(['france', 'england']);
    expect(s.gameOver?.winner).toBe('france');
    // Partners in the order their first treaty was made, each once.
    expect(s.gameOver?.partners).toEqual([a, c]);
    expect(s.gameOver?.reason).toMatch(/France and England win together by prosperity/);
    expect(s.gameOver?.reason).toContain(peopleList([a, c]));
  });

  it('concord comes first: an alliance that also qualifies wins as an alliance', () => {
    const s = ending({ england: 700_000, france: 800_000, spain: 100_000 });
    const [a, b] = peoples(s);
    partner(s, 'england', [a], 1);
    partner(s, 'france', [b], 1);
    expect(prosperityWinners(s, finalScores(s))?.winners).toEqual(['france', 'england']);
    makeAlliance(s, 'england', 'france');
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual(['france', 'england']);
    expect(s.gameOver?.partners).toBeUndefined();
    expect(s.gameOver?.reason).toMatch(/alliance of France and England/);
  });

  it('nobody qualifying falls through to time', () => {
    const s = ending({ england: 800_000 });
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual(['england']);
    expect(s.gameOver?.partners).toBeUndefined();
  });

  it('names the partners in a game-over that survives a save', () => {
    const s = ending({ england: 800_000 });
    const [a, b] = peoples(s);
    partner(s, 'england', [a, b], 2);
    checkVictory(s, { kind: 'round' });
    const back = deserialize(serialize(s));
    expect(back.gameOver?.partners).toEqual([a, b]);
    expect(peopleList([a, b])).toMatch(/^the \S.* and the \S/);
  });
});

describe('prosperity: the records', () => {
  function burnASettlement(s: GameState): Settlement | null {
    const st = Object.values(s.settlements).find((o) => !o.capital) ?? Object.values(s.settlements)[0];
    st.defenders = 1;
    const spot = landBeside(s, st.x, st.y);
    for (let guard = 0; s.settlements[st.id] && guard < 50; guard++) {
      const art = createUnit(s, 'england', 'artillery', { kind: 'map', ...spot });
      art.moves = 3;
      applyCommand(s, { type: 'attack', unitId: art.id, target: { settlementId: st.id } });
    }
    return s.settlements[st.id] ? null : st;
  }

  it('a burned settlement and a war that ends are noted where the scenario plays for prosperity, as plain JSON', () => {
    const s = game();
    const st = burnASettlement(s)!;
    expect(st).not.toBeNull();
    expect(tribe(s, st.tribe).burned).toEqual(['england']);
    expect(prosperityStanding(s, 'england', finalScores(s)).burned).toBe(true);
    // The war the attack began ends once the people's anger has fallen.
    const t = tribe(s, st.tribe);
    expect(t.stance.england).toBe('war');
    delete t.burial;
    for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) o.tension.england = 0;
    processNatives(s);
    expect(t.stance.england).toBe('peace');
    expect(t.warEnded).toEqual({ england: s.turn });
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('nothing is written where the scenario does not play for prosperity', () => {
    const s = game(PLAIN.id);
    const st = burnASettlement(s)!;
    expect(st).not.toBeNull();
    const t = tribe(s, st.tribe);
    expect(t.burned).toBeUndefined();
    for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) o.tension.england = 0;
    processNatives(s);
    expect(t.stance.england).toBe('peace');
    expect(t.warEnded).toBeUndefined();
    expect(Object.keys(t).sort()).toEqual(['id', 'stance', ...(t.submitted ? ['submitted'] : []), ...(t.burial ? ['burial'] : [])].sort());
  });
});

describe('prosperity: the score line', () => {
  it('counts each treaty with a people in force at the `peopleTreaty` weight; no line at weight 0', () => {
    const s = game();
    const [a, b] = peoples(s);
    partner(s, 'england', [a, b], 2);
    makePeopleTreaty(s, 'england', a, 'exchange');
    const p = s.players.find((o) => o.id === 'england')!;
    const weights = { ...SCORE_WEIGHTS, peopleTreaty: 3 };
    const line = scoreBreakdown(s, p, weights).lines.find((l) => l.key === 'peoples');
    expect(line).toMatchObject({ label: 'Treaties with native peoples', value: 3, points: 9 });
    expect(scoreBreakdown(s, p, weights).total - scoreBreakdown(s, p, { ...weights, peopleTreaty: 0 }).total).toBe(9);
    expect(scoreBreakdown(s, p, { ...weights, peopleTreaty: 0 }).lines.some((l) => l.key === 'peoples')).toBe(false);
    // France holds none.
    expect(scoreBreakdown(s, s.players.find((o) => o.id === 'france')!, weights).lines.find((l) => l.key === 'peoples')?.points).toBe(0);
  });
});
