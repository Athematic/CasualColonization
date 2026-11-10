/**
 * Peoples and their settlements as scenario data (docs/design/scenario-framework.md, step 6): each
 * people has a lifeway, and the scenario's settlement-kind table gives each lifeway its kind of
 * settlement with every number that depends on it. A test-only scenario with other kinds shows the
 * table drives the game; the Americas reproduce the old per-kind tables (golden.test.ts checks
 * their games are unchanged).
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  attack,
  createGame,
  createUnit,
  incitePrice,
  isWater,
  landPrice,
  listScenarios,
  maxBraves,
  nativeLandOwner,
  neighbours,
  registerScenario,
  SETTLEMENT_KINDS,
  settlementAt,
  settlementKindOf,
  settlementName,
  settlementProduce,
  tileAt,
  TRIBES,
  type GameState,
  type Scenario,
  type SettlementKindDef,
} from '../src/index.js';

/** A settlement kind no Americas people lives in: big, many braves, dear, with treasure everywhere. */
const FORT: SettlementKindDef = {
  id: 'fort',
  name: 'fort',
  look: 'city',
  size: 6,
  braves: 5,
  respawn: 3,
  produceRate: 1,
  produceCap: 40,
  gather: { furs: 10 },
  incitePrice: 1000,
  landPrice: { base: 500, capital: 0 },
  treasure: { base: 9000, spread: 1 },
};

/** The Americas, but nomadic peoples live in forts and urban peoples in camps. */
const FORTS: Scenario = {
  ...AMERICAS,
  id: 'test-forts',
  name: 'Test: forts and camps',
  peoples: { ...AMERICAS.peoples, settlements: { nomadic: FORT, agricultural: SETTLEMENT_KINDS.village, urban: SETTLEMENT_KINDS.camp } },
};
registerScenario(FORTS);

const config = (scenario?: string) => ({ seed: 11, mapSize: 'small' as const, nations: ['england' as const], humans: ['england' as const], ...(scenario ? { scenario } : {}) });

const ofLifeway = (s: GameState, lifeway: string) => Object.values(s.settlements).filter((st) => TRIBES[st.tribe].lifeway === lifeway);

describe('lifeways and the settlement-kind table', () => {
  it('the Americas: nomadic peoples in camps, agricultural in villages, urban in cities, as before', () => {
    const kind = (t: keyof typeof TRIBES) => AMERICAS.peoples.settlements[TRIBES[t].lifeway]!.id;
    expect(['sioux', 'apache', 'tupi'].map((t) => kind(t as never))).toEqual(['camp', 'camp', 'camp']);
    expect(['iroquois', 'cherokee', 'arawak'].map((t) => kind(t as never))).toEqual(['village', 'village', 'village']);
    expect(['aztec', 'inca'].map((t) => kind(t as never))).toEqual(['city', 'city']);
    // The old tables, row by row.
    const { camp, village, city } = SETTLEMENT_KINDS;
    expect([camp.braves, village.braves, city.braves]).toEqual([1, 2, 2]);
    expect([camp.respawn, village.respawn, city.respawn]).toEqual([12, 10, 8]);
    expect([camp.produceRate, village.produceRate, city.produceRate]).toEqual([0.12, 0.16, 0.2]);
    expect([camp.produceCap, village.produceCap, city.produceCap]).toEqual([100, 150, 200]);
    expect([camp.incitePrice, village.incitePrice, city.incitePrice]).toEqual([300, 450, 700]);
    expect([camp.size, village.size, city.size]).toEqual([1, 2, 3]);
  });

  it('every scenario has a kind for the lifeway of each of its peoples', () => {
    for (const sc of listScenarios()) for (const t of sc.peoples.ids) expect(sc.peoples.settlements[TRIBES[t].lifeway]).toBeDefined();
  });

  it('a scenario’s table decides size, braves, names, prices and produce', () => {
    const americas = createGame(config());
    const forts = createGame(config('test-forts'));
    expect(ofLifeway(forts, 'nomadic').length).toBeGreaterThan(0);
    for (const st of ofLifeway(americas, 'nomadic')) {
      expect(settlementKindOf(americas, st).id).toBe('camp');
      expect(st.defenders).toBeLessThanOrEqual(1 + 2 + 1);
    }
    for (const st of ofLifeway(forts, 'nomadic')) {
      expect(settlementKindOf(forts, st)).toBe(FORT);
      // size 6, +2 for a capital, +0–1.
      expect(st.defenders).toBeGreaterThanOrEqual(6);
      expect(maxBraves(forts, st)).toBe(st.capital ? 6 : 5);
      expect(incitePrice(forts, st)).toBe(st.capital ? 1500 : 1000);
      if (!st.capital) expect(settlementName(forts, st)).toBe(`${TRIBES[st.tribe].name} fort`);
    }
    for (const st of ofLifeway(forts, 'urban')) expect(settlementKindOf(forts, st).id).toBe('camp');
  });

  it('the land price and the goods gathered follow the kind', () => {
    const s = createGame(config('test-forts'));
    const st = ofLifeway(s, 'nomadic')[0];
    const tile = neighbours(s, st.x, st.y).find((p) => nativeLandOwner(s, p.x, p.y)?.id === st.id)!;
    expect(landPrice(s, 'england', tile.x, tile.y)).toBe(Math.round(500 * (1 + (st.tension.england ?? 0) / 500)));
    // Every fur yield counts ten times, and the whole of it is gathered.
    const camp = { ...s, config: { ...s.config, scenario: undefined } } as GameState;
    const furs = settlementProduce(camp, st).furs ?? 0;
    if (furs) expect(settlementProduce(s, st).furs).toBeGreaterThan(furs * 10);
  });

  it('burning a settlement finds the kind’s treasure', () => {
    const s = createGame(config('test-forts'));
    const st = ofLifeway(s, 'nomadic').find((x) => !x.capital)!;
    st.defenders = 1;
    const at = neighbours(s, st.x, st.y).find((p) => !isWater(tileAt(s, p.x, p.y)!) && !settlementAt(s, p.x, p.y))!;
    for (let i = 0; i < 50 && s.settlements[st.id]; i++) {
      const u = createUnit(s, 'england', 'veteranSoldier', { kind: 'map', x: at.x, y: at.y });
      u.role = 'soldier';
      u.moves = 3;
      attack(s, u.id, { settlementId: st.id });
    }
    expect(s.settlements[st.id]).toBeUndefined();
    // A camp that is not a capital hides no treasure; this kind always does.
    const treasure = Object.values(s.units).find((x) => x.type === 'treasure' && x.owner === 'england');
    expect(treasure?.treasure).toBe(9000);
  });
});
