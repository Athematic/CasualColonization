/**
 * Selections (docs/design/scenario-framework.md, step 3): the engine, the computer players and
 * the arena read what is in play from the game's scenario. A test-only scenario that leaves out
 * one good (cigars, with the tobacconist's house and the master tobacconist that make it) and one
 * people (the Aztec, who want cigars) plays a whole computer game without errors, and nothing it
 * left out turns up in the game. The Americas stay bit-identical (golden.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  buildingsOf,
  buildOptions,
  createGame,
  decodeGameCode,
  emptyGoods,
  encodeGameCode,
  GOODS,
  goodsOf,
  nationSet,
  NATION_ORDER,
  peoplesOf,
  playArenaGame,
  registerScenario,
  runArena,
  scenarioOf,
  serialize,
  settingsFromConfig,
  unitsOf,
  type GameState,
  type GoodId,
  type Scenario,
} from '../src/index.js';

const without = <T,>(list: readonly T[], ...drop: T[]): T[] => list.filter((x) => !drop.includes(x));

/** The Americas without cigars and without the Aztec. */
const NO_CIGARS: Scenario = {
  ...AMERICAS,
  id: 'test-no-cigars',
  name: 'Test: no cigars, no Aztec',
  goods: without(AMERICAS.goods, 'cigars'),
  units: without(AMERICAS.units, 'masterTobacconist'),
  buildings: without(AMERICAS.buildings, 'tobacconist'),
  peoples: { ids: without(AMERICAS.peoples.ids, 'aztec'), produce: AMERICAS.peoples.produce },
  ai: {
    goods: {
      trade: without(AMERICAS.ai.goods.trade, 'cigars'),
      export: without(AMERICAS.ai.goods.export, 'cigars'),
      road: AMERICAS.ai.goods.road,
      farm: AMERICAS.ai.goods.farm,
    },
  },
};
registerScenario(NO_CIGARS);

const keys = (o: object) => Object.keys(o).sort();

/** Every place a good or people left out could appear in a game's state. */
function checkState(s: GameState, sc: Scenario): void {
  const goods = keys(emptyGoods(sc.goods));
  for (const p of s.players) {
    if (p.id === 'crown') continue;
    expect(keys(p.market)).toEqual(goods);
    for (const g of sc.goods) expect(Number.isFinite(p.market[g].price)).toBe(true);
  }
  for (const c of Object.values(s.colonies)) {
    expect(keys(c.goods)).toEqual(goods);
    for (const g of sc.goods) expect(Number.isFinite(c.goods[g])).toBe(true);
    expect(keys(c.buildings)).toEqual([...sc.buildings].sort());
  }
  for (const u of Object.values(s.units)) {
    expect(sc.units).toContain(u.type);
    for (const g of Object.keys(u.cargo ?? {})) expect(sc.goods).toContain(g as GoodId);
  }
  expect(s.tribes.map((t) => t.id)).toEqual(sc.peoples.ids);
  for (const st of Object.values(s.settlements)) {
    expect(sc.peoples.ids).toContain(st.tribe);
    for (const g of Object.keys(st.goods ?? {})) expect(sc.goods).toContain(g as GoodId);
  }
}

describe('selections: the Americas iterate as before', () => {
  it('the helpers return today’s lists in today’s order', () => {
    const s = { config: {} };
    expect(goodsOf(s)).toEqual([...GOODS]);
    expect(peoplesOf(s)).toEqual(AMERICAS.peoples.ids);
    expect(buildingsOf(s)).toEqual(AMERICAS.buildings);
    expect(nationSet(scenarioOf(s), undefined).map((e) => e.id)).toEqual(NATION_ORDER);
    expect(AMERICAS.ai.goods.export).toEqual(['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats']);
  });
});

describe('selections: a scenario without cigars and the Aztec', () => {
  const config = { seed: 11, mapSize: 'small' as const, nations: NATION_ORDER.slice(0, 2), humans: NATION_ORDER.slice(0, 1), scenario: NO_CIGARS.id };

  it('starts a game with only what it has in play', () => {
    const s = createGame(config);
    expect(scenarioOf(s)).toBe(NO_CIGARS);
    checkState(s, NO_CIGARS);
    expect(unitsOf(s).trainable).not.toContain('masterTobacconist');
    expect(unitsOf(s).immigrants.length).toBe(unitsOf({ config: {} }).immigrants.length);
  });

  it('offers no building or unit left out', () => {
    const played = playArenaGame(5, [{ nation: 'england', level: 'competent' }, { nation: 'france', level: 'naive' }], 30, 'small', undefined, false, undefined, false, false, true, { scenario: NO_CIGARS.id });
    const colony = Object.values(played.state.colonies)[0];
    expect(colony).toBeDefined();
    for (const t of buildOptions(played.state, colony)) {
      if (t.kind === 'building') expect(t.id).not.toBe('tobacconist');
      else expect(NO_CIGARS.units).toContain(t.id);
    }
  });

  it('plays 50 rounds of a four-nation computer game without errors, and nothing left out appears', () => {
    const line = [
      { nation: 'england' as const, level: 'creative' as const },
      { nation: 'france' as const, level: 'combative' as const },
      { nation: 'netherlands' as const, level: 'competent' as const },
      { nation: 'spain' as const, level: 'naive' as const },
    ];
    const { state, entries } = playArenaGame(2024, line, 50, 'medium', undefined, false, undefined, false, false, true, { scenario: NO_CIGARS.id });
    expect(state.turn).toBeGreaterThanOrEqual(50);
    expect(entries).toHaveLength(4);
    expect(Object.keys(state.colonies).length).toBeGreaterThan(4);
    checkState(state, NO_CIGARS);
    const saved = serialize(state);
    expect(saved).not.toContain('"cigars"');
    expect(saved).not.toContain('"aztec"');
    expect(saved).not.toContain('tobacconist');
    expect(saved).not.toContain('NaN');
  }, 120_000);
});

describe('nation sets', () => {
  it('the arena rotates over the chosen set: real rivals are the original four', () => {
    const seen = new Set<string>();
    runArena({ games: 4, turns: 2, mapSize: 'small', levels: ['naive', 'naive'], rivals: 'real' }, (rows) => rows.forEach((r) => seen.add(r.nation)));
    expect([...seen].sort()).toEqual(['england', 'france', 'netherlands', 'spain']);
    expect(() => runArena({ games: 1, turns: 1, mapSize: 'small', levels: ['naive', 'naive', 'naive', 'naive', 'naive'], rivals: 'real' })).toThrow('between 1 and 4 nations');
  });

  it('a game code keeps real rivals, and codes of other games are unchanged', () => {
    const base = { seed: 4, mapSize: 'small' as const, nations: NATION_ORDER.slice(0, 2), humans: NATION_ORDER.slice(0, 1) };
    const plain = encodeGameCode(settingsFromConfig(base));
    const real = decodeGameCode(encodeGameCode(settingsFromConfig({ ...base, rivals: 'real' })));
    expect(real.ok && real.settings.rivals).toBe('real');
    const back = decodeGameCode(plain);
    expect(back.ok && 'rivals' in back.settings).toBe(false);
    expect(plain).toBe(encodeGameCode(settingsFromConfig({ ...base, rivals: 'alternative' })));
  });
});
