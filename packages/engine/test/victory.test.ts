/**
 * Victory kinds and arena play-on (docs/design/scenario-framework.md, step 5 and "Added after the
 * 0.8 measurements"). The Americas end the game when a War of Independence is won (or lost with no
 * person left) and after autumn 1850; scenarios choose their kinds; with `playOn` a finished war
 * only finishes that nation and the others play on.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  applyCommand,
  calendarOf,
  colonySiteProblem,
  createGame,
  createUnit,
  foundColony,
  getVictory,
  lastTurn,
  listScenarios,
  player,
  registerScenario,
  serialize,
  setFeatureSink,
  tileAt,
  type GameState,
  type NationId,
  type Scenario,
} from '../src/index.js';

registerScenario({ ...AMERICAS, id: 'test-time-only', name: 'Time only', victory: [{ id: 'time' }] });
registerScenario({ ...AMERICAS, id: 'test-war-only', name: 'War only', victory: [{ id: 'independence-war' }] });

const NATIONS: NationId[] = ['england', 'france', 'spain'];

function game(opts: { scenario?: string; playOn?: boolean; humans?: NationId[] } = {}): GameState {
  return createGame({
    seed: 9,
    mapSize: 'small',
    nations: NATIONS,
    humans: opts.humans ?? [],
    ai: { england: 'competent', france: 'competent', spain: 'competent' },
    ...(opts.scenario ? { scenario: opts.scenario } : {}),
    ...(opts.playOn ? { playOn: true } : {}),
  });
}

function colony(s: GameState, owner: NationId, name: string) {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y)) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains') continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id, name);
    }
  }
  throw new Error('no site');
}

/** A nation in a War of Independence whose royal force is gone: it wins at the end of the round. */
function aboutToWin(s: GameState, nation: NationId): void {
  const p = player(s, nation);
  p.independence = 'declared';
  p.ref = { regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 };
  p.refAtDeclaration = { turn: s.turn, force: { ...p.ref }, formula: 0 };
}

/** A nation in a War of Independence that has lost half its colonies to the Crown: it loses at the end of the round. */
function aboutToLose(s: GameState, nation: NationId): void {
  const p = player(s, nation);
  const a = colony(s, nation, 'Kept');
  const b = colony(s, nation, 'Taken');
  b.owner = 'crown';
  b.takenFrom = nation;
  p.independence = 'declared';
  p.coloniesAtDeclaration = 2;
  p.ref = { regulars: 5, dragoons: 0, artillery: 0, menOfWar: 0 };
  // A royal soldier still on the map, to see it go home in play-on.
  const u = createUnit(s, 'crown', 'kingsRegular', { kind: 'map', x: a.x, y: a.y });
  u.against = nation;
  u.role = 'soldier';
}

/** Plays rounds until `turn` or the game ends; counts the turns each nation ended. */
function playTo(s: GameState, turn: number): Partial<Record<string, number>> {
  const ended: Partial<Record<string, number>> = {};
  const previous = setFeatureSink((nation, feature) => {
    if (feature === 'cmd:endTurn') ended[nation] = (ended[nation] ?? 0) + 1;
  });
  try {
    let guard = 1000;
    while (s.turn < turn && !s.gameOver && guard-- > 0) applyCommand(s, { type: 'endTurn' });
  } finally {
    setFeatureSink(previous);
  }
  return ended;
}

describe('victory kinds', () => {
  it('the Americas: independence by war, then an alliance winning together, then prosperity, then time', () => {
    expect(AMERICAS.victory).toEqual([{ id: 'independence-war' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'time' }]);
    for (const sc of listScenarios()) for (const rule of sc.victory) expect(getVictory(rule.id), rule.id).toBeDefined();
  });

  it('independence-war: winning the war ends the game with the winner', () => {
    const s = game();
    aboutToWin(s, 'england');
    playTo(s, s.turn + 2);
    expect(s.gameOver?.winner).toBe('england');
    expect(s.gameOver?.reason).toBe("England has won the War of Independence! A new nation is born.");
    expect(s.gameOver?.scores.france).toBeGreaterThanOrEqual(0);
  });

  it('independence-war: a lost war ends a game with no person left, not one with a person still playing', () => {
    const s = game();
    aboutToLose(s, 'england');
    playTo(s, s.turn + 2);
    expect(player(s, 'england').independence).toBe('lost');
    expect(s.gameOver?.reason).toBe("The rebellion in England's colonies has been crushed.");
    expect(s.gameOver?.winner).toBeUndefined();
    const t = game({ humans: ['france'] });
    aboutToLose(t, 'england');
    t.current = t.players.findIndex((p) => p.id === 'france');
    playTo(t, t.turn + 2);
    expect(player(t, 'england').independence).toBe('lost');
    expect(t.gameOver).toBeUndefined();
  });

  it('time: the game ends after the calendar’s last turn, highest score first', () => {
    const s = game();
    s.turn = lastTurn(calendarOf(s)) - 1;
    playTo(s, s.turn + 2);
    expect(s.gameOver?.reason).toBe('The year 1850 has come and the age of colonization is over.');
    const scores = s.gameOver!.scores as Record<string, number>;
    expect(scores[s.gameOver!.winner!]).toBe(Math.max(...Object.values(scores)));
  });

  it('a scenario chooses its kinds: without independence-war a won war does not end the game, without time the calendar does not', () => {
    const s = game({ scenario: 'test-time-only' });
    aboutToWin(s, 'england');
    const ended = playTo(s, s.turn + 3);
    expect(player(s, 'england').independence).toBe('won');
    expect(s.gameOver).toBeUndefined();
    expect(player(s, 'england').finished).toBeUndefined();
    expect(ended.england).toBeGreaterThan(0);
    const t = game({ scenario: 'test-war-only' });
    t.turn = lastTurn(calendarOf(t)) - 1;
    playTo(t, t.turn + 2);
    expect(t.gameOver).toBeUndefined();
  });
});

describe('arena play-on', () => {
  it('a won war finishes the nation, which takes no more turns; the others play on', () => {
    const s = game({ playOn: true });
    aboutToWin(s, 'england');
    const start = s.turn;
    const ended = playTo(s, start + 20);
    const p = player(s, 'england');
    expect(p.independence).toBe('won');
    expect(s.gameOver).toBeUndefined();
    expect(s.turn).toBe(start + 20);
    expect(p.finished?.turn).toBe(start);
    // England ended one turn (before its war was won); France and Spain every one.
    expect(ended.england ?? 0).toBeLessThanOrEqual(1);
    expect(ended.france).toBe(20);
    expect(ended.spain).toBe(20);
    expect(p.finished?.score).toBe(Object.values(p.finished!.parts).reduce((a, b) => a + b, 0));
  });

  it('a lost war finishes the nation and sends the Crown’s troops home', () => {
    const s = game({ playOn: true });
    aboutToLose(s, 'england');
    playTo(s, s.turn + 3);
    expect(player(s, 'england').independence).toBe('lost');
    expect(player(s, 'england').finished).toBeDefined();
    expect(s.gameOver).toBeUndefined();
    expect(Object.values(s.units).some((u) => u.owner === 'crown' && u.against === 'england')).toBe(false);
  });

  it('the game ends when every nation is finished, and at the end of time with the finished nations’ scores', () => {
    const s = game({ playOn: true });
    for (const n of NATIONS) aboutToWin(s, n);
    playTo(s, s.turn + 3);
    expect(s.gameOver?.reason).toBe('Every nation has fought its War of Independence.');
    for (const n of NATIONS) expect(s.gameOver?.scores[n]).toBe(player(s, n).finished?.score);

    const t = game({ playOn: true });
    aboutToWin(t, 'england');
    playTo(t, t.turn + 2);
    const frozen = player(t, 'england').finished!.score;
    t.turn = lastTurn(calendarOf(t)) - 1;
    playTo(t, t.turn + 2);
    expect(t.gameOver?.reason).toMatch(/age of colonization is over/);
    expect(t.gameOver?.scores.england).toBe(frozen);
  });

  it('a short arena game reaches further than without it', () => {
    const run = (playOn: boolean) => {
      const s = game({ playOn });
      playTo(s, 3);
      aboutToWin(s, 'spain');
      playTo(s, 40);
      return s;
    };
    const stopped = run(false);
    const on = run(true);
    expect(stopped.gameOver?.winner).toBe('spain');
    expect(stopped.turn).toBeLessThan(6);
    expect(on.gameOver).toBeUndefined();
    expect(on.turn).toBeGreaterThanOrEqual(40);
    expect(Object.values(on.colonies).filter((c) => c.owner === 'france').length).toBeGreaterThan(0);
  });

  it('is not written to the game unless set, so saves and hashes are unchanged', () => {
    const s = game();
    expect('playOn' in s.config).toBe(false);
    expect(serialize(s)).not.toContain('playOn');
    expect(serialize(s)).not.toContain('finished');
  });
});

describe('every registered scenario', () => {
  it('names only registered victory kinds', () => {
    for (const sc of listScenarios() as Scenario[]) {
      expect(sc.victory.length).toBeGreaterThan(0);
      for (const rule of sc.victory) expect(getVictory(rule.id)).toBeDefined();
    }
  });
});
