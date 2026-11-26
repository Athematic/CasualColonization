/**
 * Beta 3, step 7 (docs/design/native-nations.md T14): victory and score for peoples. A hidden test
 * scenario, the Americas with the Iroquois and the Cherokee playable and every victory kind listed
 * in the decided order, carries it: each people's kind met and missed (continuity, a good life,
 * confederacy with the `league` treaty, the military victory), both sides judged at the end year,
 * the independence choice both ways, the people's score lines, and save and load.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  CONTINUITY,
  NORTH_EAST,
  PEOPLE_BUILDINGS,
  PEOPLE_UNIT_TYPES,
  SCORE_WEIGHTS,
  VICTORY_ORDER,
  answerIndependence,
  applyCommand,
  calendarOf,
  checkVictory,
  continuityStanding,
  createGame,
  deserialize,
  europeansDefeated,
  goodLifeStanding,
  homelandKept,
  independenceQuestion,
  lastTurn,
  leagueOf,
  leagueMembers,
  leagueProblem,
  makePairTreaty,
  orderedVictory,
  peopleCount,
  peopleScores,
  proposeLeague,
  registerScenario,
  scoreBreakdown,
  serialize,
  standingWith,
  startWar,
  turnOfYear,
  victoryParams,
  waysOf,
  type GameConfig,
  type GameState,
  type PlayerId,
  type Scenario,
} from '../src/index.js';
import { colonyAt, createUnit, isWater, settlementAt, tileAt } from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { colonyList, removeColony, removeUnit, unitList } from '../src/unitindex.js';

const ALL_KINDS = [{ id: 'military' }, { id: 'independence-war' }, { id: 'confederacy' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'continuity' }, { id: 'good-life' }, { id: 'time' }];

const GAME: Scenario = {
  ...AMERICAS,
  id: 'test-people-victory',
  name: 'People victory test',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    playable: [
      { id: 'haudenosaunee', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] },
      { id: 'cherokee', name: 'the Cherokee', adjective: 'Cherokee', townNames: ['Chota', 'Tellico', 'Echota'] },
    ],
  },
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
  mechanics: { ...AMERICAS.mechanics, hardYears: { chance: 1 / 8 }, landHealth: { regionSize: 8, renewal: 40, recovery: 5, floor: 0.2 } },
  // Listed out of order on purpose: the engine judges in the decided order.
  victory: [...ALL_KINDS].reverse(),
};
registerScenario(GAME);

/** The same with the scenario's own score weights and one people's own, and one people's own victory params. */
const TUNED: Scenario = {
  ...GAME,
  id: 'test-people-victory-tuned',
  score: { peoplePerson: 2 },
  peoples: { ...GAME.peoples, overrides: { ...GAME.peoples.overrides, haudenosaunee: { ...GAME.peoples.overrides?.haudenosaunee, score: { peopleCouncil: 50 }, victory: { 'good-life': { treatyShare: 0 } } } } },
};
registerScenario(TUNED);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    // The computer peoples at levels that join leagues (ai/profiles.ts: Naive, the default, keeps out of them).
    ai: { england: 'creative', france: 'combative', netherlands: 'competent', haudenosaunee: 'creative', cherokee: 'competent' },
    peoples: ['haudenosaunee', 'cherokee'],
    scenario: GAME.id,
    colonyCharter: true,
    ...over,
  };
}

function play(s: GameState, rounds: number): GameState {
  const until = s.turn + rounds;
  let guard = rounds * (s.players.length + 2);
  while (s.turn < until && !s.gameOver && guard-- > 0) {
    const r = applyCommand(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
  }
  return s;
}

const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** Two sides in long good relations with trade well past the thresholds. */
function friends(s: GameState, a: string, b: string): void {
  if (s.turn < 120) s.turn = 120;
  const rel = standingWith(s, a as never, b as never);
  rel.goodSince = 0;
  rel.volume = 5000;
}

/** Judges the game at its end year, as the last round's end does. */
function judgeEnd(s: GameState): NonNullable<GameState['gameOver']> {
  s.turn = lastTurn(calendarOf(s));
  checkVictory(s, { kind: 'round' });
  return s.gameOver!;
}

/** Makes a people pass continuity: a council member, and its towns full of food. */
function settled(s: GameState, id: string): void {
  const p = player(s, id);
  if (!p.fathers.length) p.fathers.push('keepersOfTheStores');
  for (const c of colonyList(s)) if (c.owner === id) c.goods.food = 400;
}

/** Every European gone from the map: no colony, no land unit (ships may stay). */
function clearEuropeans(s: GameState): void {
  for (const p of s.players) if (p.kind !== 'people') p.coloniesFounded = Math.max(1, p.coloniesFounded);
  for (const c of colonyList(s)) if (s.players.find((p) => p.id === c.owner)?.kind !== 'people') removeColony(s, c.id);
  for (const u of unitList(s)) if (s.players.find((p) => p.id === u.owner)?.kind !== 'people' && u.loc.kind !== 'carrier' && u.type !== 'caravel') removeUnit(s, u.id);
}

describe('the victory order and the records (T14)', () => {
  it('judges in the decided order, whatever the scenario lists; records homelands only with a playing people', () => {
    const s = createGame(config());
    expect(VICTORY_ORDER).toEqual(ALL_KINDS.map((k) => k.id));
    expect(orderedVictory(s).map((r) => r.id)).toEqual(VICTORY_ORDER);
    expect(s.homelands?.haudenosaunee?.tiles.length).toBeGreaterThan(5);
    expect(s.homelands?.haudenosaunee?.people).toBe(peopleCount(s, 'haudenosaunee'));
    // Peoples nobody plays have their settlements' land as homeland, and no count of people.
    expect(s.homelands?.sioux?.tiles.length).toBeGreaterThan(0);
    expect(s.homelands?.sioux?.people).toBeUndefined();
    expect(homelandKept(s, 'haudenosaunee')).toEqual({ start: s.homelands!.haudenosaunee!.tiles.length, kept: s.homelands!.haudenosaunee!.tiles.length });
    const americas = createGame({ ...config(), peoples: undefined, scenario: undefined });
    expect(americas.homelands).toBeUndefined();
  });
});

describe('people score lines (T14)', () => {
  it('count people, homeland, the land, stores, treaties, trust and council, not gold or buildings', () => {
    const s = createGame(config());
    const p = player(s, 'haudenosaunee');
    p.gold = 5000;
    const b = scoreBreakdown(s, p);
    expect(b.lines.map((l) => l.key)).toEqual(['people', 'homeland', 'land', 'stores', 'treaties', 'trust', 'council']);
    const line = (k: string) => b.lines.find((l) => l.key === k)!;
    expect(line('people').value).toBe(peopleCount(s, 'haudenosaunee'));
    expect(line('people').points).toBe(Math.round(peopleCount(s, 'haudenosaunee') * SCORE_WEIGHTS.peoplePerson));
    expect(line('homeland').value).toBe(s.homelands!.haudenosaunee!.tiles.length);
    expect(line('land').value).toBe(100);
    expect(b.total).toBe(b.lines.reduce((n, l) => n + l.points, 0));
    // Gold changes nothing.
    p.gold = 0;
    expect(scoreBreakdown(s, p).total).toBe(b.total);
    // A treaty, a side that trusts it, a council member: each counts.
    friends(s, 'haudenosaunee', 'england');
    makePairTreaty(s, 'haudenosaunee', 'england', 'people-trade');
    p.fathers.push('keepersOfTheStores');
    const after = scoreBreakdown(s, p);
    expect(after.lines.find((l) => l.key === 'treaties')!.value).toBe(1);
    expect(after.lines.find((l) => l.key === 'council')!.points).toBe(SCORE_WEIGHTS.peopleCouncil);
    // A people's score is not a European's: not in the final scores, but in the peoples' own.
    expect(Object.keys(peopleScores(s)).sort()).toEqual(['cherokee', 'haudenosaunee']);
  });

  it('take the scenario’s weights and a people’s own', () => {
    const s = createGame(config({ scenario: TUNED.id }));
    const iro = scoreBreakdown(s, player(s, 'haudenosaunee'));
    const che = scoreBreakdown(s, player(s, 'cherokee'));
    expect(iro.lines.find((l) => l.key === 'people')!.points).toBe(2 * peopleCount(s, 'haudenosaunee'));
    player(s, 'haudenosaunee').fathers.push('keepersOfTheStores');
    player(s, 'cherokee').fathers.push('keepersOfTheStores');
    expect(scoreBreakdown(s, player(s, 'haudenosaunee')).lines.find((l) => l.key === 'council')!.points).toBe(50);
    expect(scoreBreakdown(s, player(s, 'cherokee')).lines.find((l) => l.key === 'council')!.points).toBe(SCORE_WEIGHTS.peopleCouncil);
    expect(che.lines.find((l) => l.key === 'people')!.points).toBe(2 * peopleCount(s, 'cherokee'));
  });
});

describe('continuity (T14)', () => {
  it('a people on its homeland, as many as at the start, under its own council wins at the end year', () => {
    const s = createGame(config());
    settled(s, 'haudenosaunee');
    expect(continuityStanding(s, 'haudenosaunee').fails).toEqual([]);
    // The Cherokee have no council member yet.
    expect(continuityStanding(s, 'cherokee').fails).toEqual(['council']);
    const over = judgeEnd(s);
    expect(over.ways?.haudenosaunee).toBe('continuity');
    expect(over.ways?.cherokee).toBeUndefined();
    expect(over.reason).toMatch(/the Haudenosaunee win by continuity/i);
  });

  it('is missed with fewer people, the homeland lost, or a town taken', () => {
    const s = createGame(config());
    settled(s, 'haudenosaunee');
    // One person fewer than at the start.
    const u = unitList(s).find((o) => o.owner === 'haudenosaunee' && o.loc.kind === 'map')!;
    removeUnit(s, u.id);
    const short = continuityStanding(s, 'haudenosaunee');
    expect(short.fails).toEqual(['people']);
    expect(short.people).toBe(short.start - 1);
    expect(short.needed).toBe(short.start);
    // Its homeland claimed by a nation.
    for (const i of s.homelands!.haudenosaunee!.tiles) s.map.tiles[i].claim = 'england';
    expect(continuityStanding(s, 'haudenosaunee').fails).toEqual(expect.arrayContaining(['homeland', 'people']));
    for (const i of s.homelands!.haudenosaunee!.tiles) s.map.tiles[i].claim = 'haudenosaunee';
    // A town of its own held by another player.
    const town = colonyList(s).find((c) => c.owner === 'haudenosaunee')!;
    town.owner = 'england';
    town.takenFrom = 'haudenosaunee';
    expect(continuityStanding(s, 'haudenosaunee').fails).toContain('towns taken');
    expect(judgeEnd(s).ways?.haudenosaunee).toBeUndefined();
  });
});

describe('a good life (T14)', () => {
  it('fed, the land whole, at peace, faith kept and treaties with half of those met: wins', () => {
    const s = createGame(config({ scenario: TUNED.id }));
    settled(s, 'haudenosaunee');
    friends(s, 'haudenosaunee', 'england');
    makePairTreaty(s, 'haudenosaunee', 'england', 'people-trade');
    // The Haudenosaunee's own params ask for one treaty only (treatyShare 0).
    expect(goodLifeStanding(s, 'haudenosaunee').fails).toEqual([]);
    const over = judgeEnd(s);
    // Continuity comes first in the order: each player judged once, by the first kind that names it.
    expect(over.ways?.haudenosaunee).toBe('continuity');
  });

  it('is missed after a hungry year, a recent war or a broken treaty', () => {
    const s = createGame(config({ scenario: TUNED.id }));
    settled(s, 'haudenosaunee');
    friends(s, 'haudenosaunee', 'england');
    makePairTreaty(s, 'haudenosaunee', 'england', 'people-trade');
    const p = player(s, 'haudenosaunee');
    // No council member: continuity is missed, so a good life names it.
    p.fathers = [];
    s.turn = lastTurn(calendarOf(s));
    expect(goodLifeStanding(s, 'haudenosaunee').fails).toEqual([]);
    p.lastHunger = s.turn - 5;
    expect(goodLifeStanding(s, 'haudenosaunee').fails).toEqual(['hunger']);
    delete p.lastHunger;
    p.lastWar = s.turn - 10;
    expect(goodLifeStanding(s, 'haudenosaunee').fails).toEqual(['peace']);
    delete p.lastWar;
    s.land!.health!.fill(30);
    expect(goodLifeStanding(s, 'haudenosaunee').fails).toEqual(['land']);
    s.land!.health!.fill(100);
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver!.ways?.haudenosaunee).toBe('good-life');
    expect(s.gameOver!.reason).toMatch(/the Haudenosaunee win by a good life/i);
  });

  it('is missed by a people that broke faith within the years', () => {
    const s = createGame(config({ humans: ['haudenosaunee'], scenario: TUNED.id }));
    settled(s, 'haudenosaunee');
    friends(s, 'haudenosaunee', 'england');
    makePairTreaty(s, 'haudenosaunee', 'england', 'people-trade');
    applyCommand(s, { type: 'endPairTreaty', with: 'england', kind: 'people-trade' });
    expect(goodLifeStanding(s, 'haudenosaunee').fails).toEqual(expect.arrayContaining(['faith', 'treaties']));
  });
});

describe('confederacy and the league (T14)', () => {
  /** The Haudenosaunee (a person), the Cherokee (the computer) and the Sioux (nobody plays), with pacts and good standing. */
  function threePeoples(): GameState {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    friends(s, 'haudenosaunee', 'cherokee');
    friends(s, 'haudenosaunee', 'sioux');
    friends(s, 'cherokee', 'sioux');
    makePairTreaty(s, 'haudenosaunee', 'cherokee', 'people-trade');
    makePairTreaty(s, 'haudenosaunee', 'cherokee', 'defence');
    makePairTreaty(s, 'haudenosaunee', 'sioux', 'people-trade');
    makePairTreaty(s, 'haudenosaunee', 'sioux', 'defence');
    return s;
  }

  function makeLeagueBy(s: GameState): void {
    for (let i = 0; i < 40 && !leagueOf(s, 'haudenosaunee'); i++) {
      expect(leagueProblem(s, 'haudenosaunee', ['cherokee', 'sioux'])).toBeNull();
      proposeLeague(s, 'haudenosaunee', ['cherokee', 'sioux']);
      s.turn++;
    }
  }

  it('is proposed among peoples at peace, with a pact and in good standing; refused otherwise', () => {
    const s = threePeoples();
    expect(leagueProblem(s, 'haudenosaunee', ['cherokee'])).toMatch(/at least 3 peoples/);
    expect(leagueProblem(s, 'haudenosaunee', ['cherokee', 'england'])).toMatch(/Only peoples/);
    expect(leagueProblem(s, 'haudenosaunee', ['cherokee', 'aztec'])).toMatch(/do not stand well|no mutual defence/);
    makeLeagueBy(s);
    const t = leagueOf(s, 'haudenosaunee')!;
    expect(t.kind).toBe('league');
    expect(leagueMembers(t)).toEqual(['haudenosaunee', 'cherokee', 'sioux']);
    expect(leagueOf(s, 'sioux')).toBe(t);
    expect(leagueProblem(s, 'cherokee', ['aztec'])).toBeTruthy();
  });

  it('a person invited answers later; the league is made when every person said yes', () => {
    const s = createGame(config({ humans: ['cherokee'] }));
    friends(s, 'haudenosaunee', 'cherokee');
    friends(s, 'haudenosaunee', 'sioux');
    friends(s, 'cherokee', 'sioux');
    for (const o of ['cherokee', 'sioux']) {
      makePairTreaty(s, 'haudenosaunee', o as never, 'people-trade');
      makePairTreaty(s, 'haudenosaunee', o as never, 'defence');
    }
    // The Sioux answer by Beta 2's rule: try until they agree.
    for (let i = 0; i < 40 && !s.leagueProposals; i++, s.turn++) proposeLeague(s, 'haudenosaunee', ['cherokee', 'sioux']);
    expect(s.leagueProposals?.[0].waiting).toEqual(['cherokee']);
    expect(leagueOf(s, 'haudenosaunee')).toBeUndefined();
    // The Cherokee's turn: they accept.
    s.current = s.players.findIndex((p) => p.id === 'cherokee');
    expect(applyCommand(s, { type: 'answerLeague', by: 'haudenosaunee', accept: true }).ok).toBe(true);
    expect(s.leagueProposals).toBeUndefined();
    expect(leagueMembers(leagueOf(s, 'cherokee')!)).toEqual(['haudenosaunee', 'cherokee', 'sioux']);
  });

  it('a league that held for 50 years wins at the end year, its members together; too young, it does not', () => {
    const s = threePeoples();
    makeLeagueBy(s);
    const t = leagueOf(s, 'haudenosaunee')!;
    const end = lastTurn(calendarOf(s));
    t.start = end - 30;
    const young = structuredClone(s);
    settled(young, 'haudenosaunee');
    expect(judgeEnd(young).ways?.haudenosaunee).toBe('continuity');
    t.start = turnOfYear(1700);
    settled(s, 'haudenosaunee');
    const over = judgeEnd(s);
    // Groups before single winners: the league wins as a league, though the Haudenosaunee also pass continuity.
    expect(over.ways?.haudenosaunee).toBe('confederacy');
    expect(over.ways?.cherokee).toBe('confederacy');
    expect(over.partners).toContain('sioux');
    expect(over.reason).toMatch(/win as a league of peoples, with the Sioux/);
  });

  it('a war between members takes the one that declared it out; a league left with one member ends', () => {
    const s = threePeoples();
    makeLeagueBy(s);
    startWar(s, 'cherokee', 'haudenosaunee');
    const t = s.treaties!.find((o) => o.kind === 'league')!;
    expect(leagueMembers(t)).toEqual(['haudenosaunee', 'sioux']);
    expect(t.left?.map((l) => l.party.id)).toEqual(['cherokee']);
    expect(t.end).toBeUndefined();
    s.current = s.players.findIndex((p) => p.id === 'haudenosaunee');
    expect(applyCommand(s, { type: 'leaveLeague' }).ok).toBe(true);
    expect(t.end?.why).toBe('left');
    expect(leagueOf(s, 'sioux')).toBeUndefined();
  });
});

describe('the military victory (T14)', () => {
  it('every European without a colony or a land unit: the peoples still in the game win together, at once', () => {
    const s = createGame(config());
    play(s, 1);
    expect(europeansDefeated(s)).toBe(false);
    clearEuropeans(s);
    player(s, 'cherokee').defeats = { units: 3, colonies: 1 };
    expect(europeansDefeated(s)).toBe(true);
    play(s, 1);
    expect(s.gameOver?.ways).toEqual({ cherokee: 'military', haudenosaunee: 'military' });
    // Ranked by their part in the war: the Cherokee took a colony.
    expect(s.gameOver?.winners).toEqual(['cherokee', 'haudenosaunee']);
    expect(s.gameOver?.reason).toMatch(/No European nation holds a colony or an army in the New World any more: The Cherokee and the Haudenosaunee win/);
  });

  it('is missed while one land unit stands, while the Crown’s troops are on the map, and before a nation’s first colony', () => {
    const s = createGame(config());
    play(s, 1);
    // At the start no nation has landed: not defeated, only arriving.
    expect(europeansDefeated(s)).toBe(false);
    clearEuropeans(s);
    const town = colonyList(s).find((c) => c.owner === 'haudenosaunee')!;
    // One English soldier on land.
    const u = createUnitAt(s, 'england', town.x + 3, town.y);
    expect(europeansDefeated(s)).toBe(false);
    removeUnit(s, u.id);
    expect(europeansDefeated(s)).toBe(true);
    // A nation that never founded a colony is still arriving.
    player(s, 'france').coloniesFounded = 0;
    expect(europeansDefeated(s)).toBe(false);
  });
});

/** A unit of `owner` on a free land tile near (x, y). */
function createUnitAt(s: GameState, owner: string, x: number, y: number) {
  for (const q of gridOf(s).tilesWithin(s.map, x, y, 6)) {
    const t = tileAt(s, q.x, q.y);
    if (!t || isWater(t) || colonyAt(s, q.x, q.y) || settlementAt(s, q.x, q.y)) continue;
    return createUnit(s, owner as never, 'veteranSoldier', { kind: 'map', x: q.x, y: q.y });
  }
  throw new Error('no land');
}

describe('both sides judged at the end year (T14)', () => {
  it('a European and a people win in one game, each by its way; time names a European only if none won otherwise', () => {
    const s = createGame(config());
    settled(s, 'haudenosaunee');
    const over = judgeEnd(s);
    const european = over.winners.find((id) => !['haudenosaunee', 'cherokee'].includes(id))!;
    expect(over.ways?.[european]).toBe('time');
    expect(over.ways?.haudenosaunee).toBe('continuity');
    expect(over.winners).toEqual(['haudenosaunee', european]);
    expect(over.reason).toMatch(/the Haudenosaunee win by continuity, still on their homeland; .+ wins with the highest score/i);
    expect(over.peopleScores?.haudenosaunee).toBeGreaterThan(0);
    expect(Object.keys(over.scores).sort()).toEqual(['england', 'france', 'netherlands']);
    expect(waysOf(s)).toBe(over.ways);
  });

  it('a nation that won its War of Independence is finished, its win recorded, and listed at the end; time then names nobody', () => {
    const s = createGame(config());
    checkVictory(s, { kind: 'warEnded', nation: 'england', outcome: 'won', text: 'England has won the War of Independence!' });
    // A computer nation takes the win at once; with a playing people the game goes on.
    expect(s.gameOver).toBeUndefined();
    expect(player(s, 'england').victory).toEqual({ way: 'independence-war', turn: s.turn });
    expect(player(s, 'england').finished).toBeDefined();
    const over = judgeEnd(s);
    expect(over.ways?.england).toBe('independence-war');
    expect(Object.values(over.ways ?? {})).not.toContain('time');
    expect(over.reason).toMatch(/England wins by the War of Independence/);
  });
});

describe('the independence choice (T14, Simon)', () => {
  it('in a game with a playing people: a person at war with a people is asked; no ends with the victory, yes plays on', () => {
    for (const keepPlaying of [false, true]) {
      const s = createGame(config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent' } }));
      startWar(s, 'england', 'haudenosaunee');
      checkVictory(s, { kind: 'warEnded', nation: 'england', outcome: 'won', text: 'England has won the War of Independence!' });
      expect(s.gameOver).toBeUndefined();
      expect(player(s, 'england').independenceChoice).toBeDefined();
      expect(independenceQuestion(s, 'england')).toMatch(/still at war with the Haudenosaunee/);
      s.current = s.players.findIndex((p) => p.id === 'england');
      expect(applyCommand(s, { type: 'answerIndependence', keepPlaying }).ok).toBe(true);
      expect(player(s, 'england').independenceChoice).toBeUndefined();
      if (keepPlaying) {
        expect(s.gameOver).toBeUndefined();
        expect(player(s, 'england').victory).toBeUndefined();
        expect(player(s, 'england').finished).toBeUndefined();
      } else {
        // The person's only nation is finished with its win: no person plays on, so the game ends now.
        expect(s.gameOver?.winners).toEqual(['england']);
        expect(s.gameOver?.ways).toEqual({ england: 'independence-war' });
      }
    }
  });

  it('without a playing people: a person at war with a people nobody plays is asked; no ends the game as before', () => {
    for (const keepPlaying of [false, true]) {
      const s = createGame({ ...config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent' } }), peoples: undefined, scenario: undefined });
      s.tribes.find((t) => t.id === 'sioux')!.stance.england = 'war';
      checkVictory(s, { kind: 'warEnded', nation: 'england', outcome: 'won', text: 'England has won the War of Independence!' });
      expect(s.gameOver).toBeUndefined();
      expect(independenceQuestion(s, 'england')).toMatch(/still at war with the Sioux/);
      answerIndependence(s, 'england', keepPlaying);
      if (keepPlaying) expect(s.gameOver).toBeUndefined();
      else expect(s.gameOver).toMatchObject({ reason: 'England has won the War of Independence!', winner: 'england', winners: ['england'] });
      expect(s.gameOver?.ways).toBeUndefined();
    }
    // A computer nation takes the win at once, at war or not.
    const c = createGame({ ...config(), peoples: undefined, scenario: undefined });
    c.tribes.find((t) => t.id === 'sioux')!.stance.england = 'war';
    checkVictory(c, { kind: 'warEnded', nation: 'england', outcome: 'won', text: 'England has won the War of Independence!' });
    expect(c.gameOver?.winners).toEqual(['england']);
    expect(waysOf(c)).toEqual({ england: 'independence-war' });
  });
});

describe('a game with the peoples’ victories (save and load)', () => {
  it('computer peoples and nations play on; the game saves, loads and plays on the same, a league and the records included', () => {
    const s = createGame(config());
    play(s, 40);
    friends(s, 'haudenosaunee', 'cherokee');
    friends(s, 'haudenosaunee', 'sioux');
    friends(s, 'cherokee', 'sioux');
    for (const o of ['cherokee', 'sioux']) {
      makePairTreaty(s, 'haudenosaunee', o as never, 'people-trade');
      makePairTreaty(s, 'haudenosaunee', o as never, 'defence');
    }
    for (let i = 0; i < 40 && !leagueOf(s, 'haudenosaunee'); i++, s.turn++) proposeLeague(s, 'haudenosaunee', ['cherokee', 'sioux']);
    expect(leagueOf(s, 'haudenosaunee')).toBeDefined();
    play(s, 40);
    expect(s.gameOver).toBeUndefined();
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    play(s, 30);
    play(loaded, 30);
    expect(serialize(loaded)).toBe(serialize(s));
    // Judged at the end year after loading, the same.
    const a = judgeEnd(s);
    const b = judgeEnd(loaded);
    expect(b).toEqual(a);
    expect(serialize(deserialize(serialize(s)))).toBe(serialize(s));
  }, 180_000);
});

describe('continuity per people (native-nations.md section 18)', () => {
  it('a people’s own thresholds over the scenario’s, over the engine’s', () => {
    const s = createGame({ seed: 3000, mapSize: 'medium', nations: ['england'], humans: [], ai: { england: 'competent' }, peoples: ['haudenosaunee', 'innu'], scenario: 'north-east', map: 'north-east', historicalEvents: true, randomEvents: true, colonyCharter: true });
    const params = NORTH_EAST.victory.find((v) => v.id === 'continuity')?.params ?? {};
    for (const id of ['haudenosaunee', 'wendat', 'mikmaq', 'innu'] as PlayerId[]) {
      const own = NORTH_EAST.peoples.overrides?.[id as 'innu']?.victory?.continuity;
      expect(own, id).toBeDefined();
      const w = victoryParams(s, 'continuity', CONTINUITY, params, id);
      for (const [k, v] of Object.entries(own!)) expect(w[k as keyof typeof w], `${id} ${k}`).toBe(v);
    }
    // A people with none of its own reads the scenario's.
    expect(victoryParams(s, 'continuity', CONTINUITY, params, 'abenaki').landHealth).toBe((params as { landHealth?: number }).landHealth ?? CONTINUITY.landHealth);
  });
});
