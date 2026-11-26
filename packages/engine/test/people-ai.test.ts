/**
 * Beta 3, step 9 (docs/design/native-nations.md, T15, T10, T14): computer peoples per level. A
 * hidden test scenario, the Americas with the Iroquois and the Cherokee playable and a land that
 * renews nothing (so any hunting wears it), carries the profiles' key decisions: the reserve, the
 * builds, iron tools, restraint on the land, buying European goods, barter between peoples, raids
 * and peace, and the answers to leagues.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  PEOPLE_BUILDINGS,
  PEOPLE_PROFILES,
  PEOPLE_UNIT_TYPES,
  TOOLS_PER_TURN,
  colonyAt,
  colonyWorkers,
  computerBarter,
  computerTradeVisits,
  createGame,
  createUnit,
  jobOptions,
  makePairTreaty,
  newColonyBuildings,
  planTownBuild,
  proposeLeague,
  registerScenario,
  runPeopleAi,
  settlementAt,
  standingOf,
  standingWith,
  storeYearsOf,
  TERRAIN,
  tileAt,
  useTools,
  wayOf,
  leagueOf,
  type AiLevel,
  type Colony,
  type GameConfig,
  type GameState,
  type Scenario,
} from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { addColony, colonyList, setUnitLoc } from '../src/unitindex.js';

const GAME: Scenario = {
  ...AMERICAS,
  id: 'test-people-ai',
  name: 'People AI test',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    playable: [
      { id: 'haudenosaunee', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] },
      { id: 'cherokee', name: 'the Cherokee', adjective: 'Cherokee', townNames: ['Chota', 'Tellico', 'Echota'] },
    ],
  },
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
  // A land that renews nothing: any hunting at all is more than it gives back.
  mechanics: { ...AMERICAS.mechanics, landHealth: { regionSize: 8, renewal: 0, recovery: 5, floor: 0.2 } },
  victory: [{ id: 'military' }, { id: 'independence-war' }, { id: 'confederacy' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'continuity' }, { id: 'good-life' }, { id: 'time' }],
};
registerScenario(GAME);

function config(level: AiLevel, over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'creative', france: 'combative', netherlands: 'competent', haudenosaunee: level, cherokee: 'competent' },
    peoples: ['haudenosaunee', 'cherokee'],
    scenario: GAME.id,
    colonyCharter: true,
    ...over,
  };
}

const towns = (s: GameState, people = 'haudenosaunee'): Colony[] => colonyList(s).filter((c) => c.owner === people);
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** An English colony two tiles from the Haudenosaunee capital, with one worker. */
function colonyBeside(s: GameState, owner = 'england'): Colony {
  const t = towns(s)[0];
  const grid = gridOf(s);
  const at = grid.tilesWithin(s.map, t.x, t.y, 2).find((p) => grid.distance(p.x, p.y, t.x, t.y) === 2 && !TERRAIN[tileAt(s, p.x, p.y)!.t].water && !colonyAt(s, p.x, p.y) && !settlementAt(s, p.x, p.y))!;
  const c: Colony = { id: `c-test-${owner}`, owner: owner as never, name: 'Testtown', x: at.x, y: at.y, goods: Object.fromEntries(Object.keys(t.goods).map((g) => [g, 0])) as Colony['goods'], buildings: newColonyBuildings(s, owner as never), build: null, hammers: 0, liberty: 0, founded: s.turn, exports: {} };
  addColony(s, c);
  const u = createUnit(s, owner as never, 'freeColonist', { kind: 'map', x: c.x, y: c.y });
  setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
  return c;
}

/** Puts every worker of the people's towns on a hunting tile where one is free; returns how many hunt. */
function huntEverywhere(s: GameState, people = 'haudenosaunee'): number {
  let n = 0;
  for (const c of towns(s, people)) {
    for (const u of colonyWorkers(s, c)) {
      const opt = jobOptions(s, c, u).find((o) => o.job.kind === 'tile' && wayOf(tileAt(s, o.job.x, o.job.y)!, o.job.good, ['plains', 'grassland', 'prairie', 'savannah', 'hills']) === 'hunting');
      if (!opt) continue;
      setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job: opt.job });
      n++;
    }
  }
  return n;
}

function hunters(s: GameState, people = 'haudenosaunee'): number {
  let n = 0;
  for (const c of towns(s, people)) for (const u of colonyWorkers(s, c)) if (u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && wayOf(tileAt(s, u.loc.job.x, u.loc.job.y)!, u.loc.job.good, ['plains', 'grassland', 'prairie', 'savannah', 'hills']) === 'hunting') n++;
  return n;
}

describe('the people profiles (T15)', () => {
  it('give each level its way: Creative trades and leads leagues, Competent balances, Combative defends and raids, Naive grows', () => {
    const { naive, competent, combative, creative } = PEOPLE_PROFILES;
    expect(combative.stores).toBe(0.5);
    expect([naive.stores, competent.stores, creative.stores]).toEqual([1, 1, 1]);
    expect(naive.restraint).toBeNull();
    expect(combative.restraint!).toBeLessThan(competent.restraint!);
    expect(creative.restraint).toBe(competent.restraint);
    expect(naive.sellsFood && !competent.sellsFood && !combative.sellsFood && !creative.sellsFood).toBe(true);
    expect([naive.league, competent.league, combative.league, creative.league]).toEqual(['none', 'join', 'none', 'lead']);
    expect([naive.raids, competent.raids, combative.raids, creative.raids]).toEqual([false, false, true, false]);
    expect(creative.offer).toBeGreaterThan(competent.offer);
    expect(creative.nationKinds).toContain('land-use');
    expect(combative.buys[0]).toBe('muskets');
    expect(combative.plan[0]).toBe('palisade');
    expect(naive.plan[0]).toBe('longhouse');
    // Peace: the Combative fights longest, the Creative the shortest.
    expect(combative.peaceAfter).toBeGreaterThan(competent.peaceAfter);
    expect(creative.peaceAfter).toBeLessThan(competent.peaceAfter);
  });

  it('a Combative people keeps half the reserve; a person playing it keeps its own', () => {
    const s = createGame(config('combative'));
    expect(storeYearsOf(s, 'haudenosaunee')).toBe(0.5);
    expect(storeYearsOf(s, 'cherokee')).toBe(1);
    const h = createGame(config('combative', { humans: ['haudenosaunee'] }));
    expect(storeYearsOf(h, 'haudenosaunee')).toBe(1);
  });

  it('town builds follow the level’s plan; a person’s towns choose their own', () => {
    for (const [level, first] of [['combative', 'palisade'], ['naive', 'longhouse'], ['creative', 'storagePits']] as const) {
      const s = createGame(config(level));
      const t = towns(s)[0];
      t.build = null;
      planTownBuild(s, t, () => true);
      expect(t.build, level).toEqual({ kind: 'building', id: first });
    }
    const h = createGame(config('creative', { humans: ['haudenosaunee'] }));
    const t = towns(h)[0];
    t.build = null;
    planTownBuild(h, t, () => true);
    expect(t.build).toBeNull();
  });

  it('iron tools speed a town’s building work, a few a turn', () => {
    const s = createGame(config('competent'));
    const t = towns(s)[0];
    t.build = { kind: 'building', id: 'palisade' };
    t.goods.tools = 10;
    t.hammers = 0;
    useTools(t);
    expect(t.hammers).toBe(TOOLS_PER_TURN);
    expect(t.goods.tools).toBe(10 - TOOLS_PER_TURN);
    t.build = null;
    useTools(t);
    expect(t.goods.tools).toBe(10 - TOOLS_PER_TURN);
  });
});

describe('a computer people’s turn', () => {
  it('holds its hunters back where the land is worn (Competent), but not where it is whole, nor when Naive', () => {
    const run = (level: AiLevel, health: number) => {
      const s = createGame(config(level));
      expect(huntEverywhere(s)).toBeGreaterThan(0);
      s.land!.health!.fill(health);
      runPeopleAi(s, player(s, 'haudenosaunee'));
      return hunters(s);
    };
    const s = createGame(config('competent'));
    const all = huntEverywhere(s);
    expect(run('competent', 50)).toBeLessThan(all);
    expect(run('creative', 50)).toBeLessThan(all);
    expect(run('competent', 95)).toBe(all);
    expect(run('naive', 50)).toBe(all);
  });

  it('buys the European goods its profile names at a computer nation’s colony nearby, as far as its gold goes', () => {
    const s = createGame(config('competent'));
    const c = colonyBeside(s);
    c.goods.tools = 200;
    c.goods.muskets = 120;
    player(s, 'haudenosaunee').gold = 1000;
    const england = player(s, 'england').gold;
    const tools = (g: GameState) => towns(g).reduce((n, t) => n + t.goods.tools, 0);
    const before = tools(s);
    computerTradeVisits(s, 'haudenosaunee', PEOPLE_PROFILES.competent);
    expect(tools(s)).toBeGreaterThan(before);
    expect(c.goods.tools).toBeGreaterThanOrEqual(50);
    expect(towns(s).some((t) => t.goods.muskets > 0)).toBe(true);
    expect(player(s, 'haudenosaunee').gold).toBeLessThan(1000);
    expect(player(s, 'england').gold).toBeGreaterThan(england);
    // Without gold it buys nothing (nor does it earn any: England cannot pay for its furs).
    const p = createGame(config('competent'));
    const c2 = colonyBeside(p);
    c2.goods.tools = 200;
    player(p, 'england').gold = 0;
    const had = tools(p);
    computerTradeVisits(p, 'haudenosaunee', PEOPLE_PROFILES.competent);
    expect(tools(p)).toBe(had);
  });

  it('barters with a neighbouring people, which builds their standing', () => {
    const s = createGame(config('creative'));
    const grid = gridOf(s);
    // A settlement of another people three tiles from the Haudenosaunee capital.
    const t = towns(s)[0];
    const near = Object.values(s.settlements).filter((st) => st.tribe !== 'haudenosaunee' && st.tribe !== 'cherokee').sort((a, b) => a.id.localeCompare(b.id))[0];
    const at = grid.tilesWithin(s.map, t.x, t.y, 3).find((q) => grid.distance(q.x, q.y, t.x, t.y) === 3 && !TERRAIN[tileAt(s, q.x, q.y)!.t].water && !colonyAt(s, q.x, q.y) && !settlementAt(s, q.x, q.y))!;
    near.x = at.x;
    near.y = at.y;
    near.goods = { furs: 100 };
    standingWith(s, 'haudenosaunee', near.tribe);
    for (const t of towns(s)) t.goods.cloth = 20;
    computerBarter(s, 'haudenosaunee', 1);
    expect(standingOf(s, 'haudenosaunee', near.tribe)?.volume ?? 0).toBeGreaterThan(0);
  });

  it('Combative goes to war with a European that settles beside its towns, and seeks peace after its years; Competent does not', () => {
    const s = createGame(config('combative'));
    colonyBeside(s);
    runPeopleAi(s, player(s, 'haudenosaunee'));
    expect(player(s, 'haudenosaunee').stance.england).toBe('war');
    // After its profile's years of war it seeks peace, which a computer nation tired of war accepts
    // (the round notes the war: turn.ts notePeopleWars).
    s.turn += 30;
    player(s, 'haudenosaunee').lastWar = s.turn;
    runPeopleAi(s, player(s, 'haudenosaunee'));
    expect(player(s, 'haudenosaunee').stance.england).toBe('peace');

    const c = createGame(config('competent'));
    colonyBeside(c);
    runPeopleAi(c, player(c, 'haudenosaunee'));
    expect(player(c, 'haudenosaunee').stance.england).not.toBe('war');
  });

  it('a Naive or Combative people keeps out of a league; a Competent one may join', () => {
    const answers = (level: AiLevel) => {
      const s = createGame(config('creative', { ai: { england: 'creative', france: 'combative', netherlands: 'competent', haudenosaunee: 'creative', cherokee: level } }));
      if (s.turn < 120) s.turn = 120;
      for (const [a, b] of [['haudenosaunee', 'cherokee'], ['haudenosaunee', 'sioux'], ['cherokee', 'sioux']]) {
        const rel = standingWith(s, a as never, b as never);
        rel.goodSince = 0;
        rel.volume = 5000;
      }
      for (const o of ['cherokee', 'sioux']) {
        makePairTreaty(s, 'haudenosaunee', o as never, 'people-trade');
        makePairTreaty(s, 'haudenosaunee', o as never, 'defence');
      }
      for (let i = 0; i < 40 && !leagueOf(s, 'haudenosaunee'); i++, s.turn++) proposeLeague(s, 'haudenosaunee', ['cherokee', 'sioux']);
      return !!leagueOf(s, 'cherokee');
    };
    expect(answers('competent')).toBe(true);
    expect(answers('naive')).toBe(false);
    expect(answers('combative')).toBe(false);
  });
});
