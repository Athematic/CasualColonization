import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  coloniesOverview,
  colonyOverview,
  congressOverview,
  createGame,
  declareWar,
  deserialize,
  historyFor,
  joinCongress,
  landForces,
  ledgerFor,
  makePeace,
  MAX_HISTORY,
  nativesOverview,
  navalOverview,
  noteGoods,
  noteHistory,
  player,
  religionOverview,
  royalForces,
  runCustomHouse,
  sellToMarket,
  serialize,
  tradeOverview,
  warehouseCapacity,
  type GameConfig,
  type GameState,
} from '../src/index.js';

const observed: GameConfig = {
  seed: 11,
  mapSize: 'small',
  nations: ['england', 'france', 'spain', 'netherlands'],
  humans: [],
  ai: { england: 'competent', france: 'combative', spain: 'naive', netherlands: 'creative' },
};

function play(config: GameConfig, turns: number): GameState {
  const s = createGame(config);
  while (s.turn < turns && !s.gameOver) applyCommand(s, { type: 'endTurn' });
  return s;
}

describe('history', () => {
  it('records colonies founded during a game, secret to their founder', () => {
    const s = play(observed, 40);
    const founded = (s.history ?? []).filter((e) => e.kind === 'colony');
    expect(founded.length).toBeGreaterThan(0);
    for (const e of founded) {
      expect(e.secret).toBe(true);
      expect(e.nations).toHaveLength(1);
      expect(e.at).toBeDefined();
    }
    // Each nation sees its own foundings and none of the others'.
    const mine = historyFor(s, 'england').filter((e) => e.kind === 'colony');
    expect(mine.every((e) => e.nations[0] === 'england')).toBe(true);
    expect(mine.length).toBe(founded.filter((e) => e.nations[0] === 'england').length);
    // Observers see everything, in order.
    const all = historyFor(s);
    expect(all.length).toBe(s.history!.length);
    for (let i = 1; i < all.length; i++) expect(all[i].turn).toBeGreaterThanOrEqual(all[i - 1].turn);
  });

  it('records public events from the existing event points', () => {
    const s = createGame(observed);
    declareWar(s, 'england', 'france');
    makePeace(s, 'england', 'france');
    joinCongress(s, player(s, 'spain'), 'adamSmith');
    const kinds = historyFor(s, 'netherlands').map((e) => e.kind);
    expect(kinds).toEqual(['war', 'peace', 'father']);
    expect(s.history![0].text).toContain('England declares war on France');
    expect(s.history![0].nations).toEqual(['england', 'france']);
    // Wars with the Crown are not European wars.
    declareWar(s, 'spain', 'crown');
    expect(s.history!.filter((e) => e.kind === 'war')).toHaveLength(1);
  });

  it('is capped, dropping the oldest entries', () => {
    const s = createGame(observed);
    for (let i = 0; i < MAX_HISTORY + 25; i++) noteHistory(s, 'treasure', ['england'], `Event ${i}`);
    expect(s.history).toHaveLength(MAX_HISTORY);
    expect(s.history![0].text).toBe('Event 25');
    expect(s.history!.at(-1)!.text).toBe(`Event ${MAX_HISTORY + 24}`);
  });

  it('survives saving and loading, and older saves start without one', () => {
    const s = play(observed, 20);
    const loaded = deserialize(serialize(s));
    expect(loaded.history).toEqual(s.history);
    delete loaded.history;
    expect(historyFor(loaded, 'england')).toEqual([]);
    noteHistory(loaded, 'peace', ['england', 'crown'], 'x');
    expect(loaded.history![0].nations).toEqual(['england']);
  });

  it('does not change how a game plays', () => {
    const a = play(observed, 30);
    const b = createGame(observed);
    while (b.turn < 30) {
      applyCommand(b, { type: 'endTurn' });
      delete b.history;
      delete b.ledger;
    }
    expect(b.rng).toBe(a.rng);
    expect(Object.keys(b.colonies)).toEqual(Object.keys(a.colonies));
  });
});

describe('ledger', () => {
  it('counts goods sold this turn, last turn and over the game', () => {
    const s = createGame(observed);
    noteGoods(s, 'england', 'europe', 'furs', 100);
    noteGoods(s, 'england', 'route', 'furs', 40);
    expect(ledgerFor(s, 'england').now.europe.furs).toBe(100);
    s.turn++;
    noteGoods(s, 'england', 'europe', 'furs', 50);
    let l = ledgerFor(s, 'england');
    expect(l.total.europe.furs).toBe(150);
    expect(l.now.europe.furs).toBe(50);
    expect(l.last.europe.furs).toBe(100);
    expect(l.total.route.furs).toBe(40);
    // A quiet turn: this turn is empty and last turn's figures are the ones from the turn before.
    s.turn++;
    l = ledgerFor(s, 'england');
    expect(l.now.europe.furs).toBeUndefined();
    expect(l.last.europe.furs).toBe(50);
    s.turn += 2;
    expect(ledgerFor(s, 'england').last.europe.furs).toBeUndefined();
    expect(ledgerFor(s, 'france').total.europe).toEqual({});
  });

  it('is fed by market and custom house sales', () => {
    const s = createGame(observed);
    const p = player(s, 'england');
    sellToMarket(s, p, 'sugar', 100);
    expect(ledgerFor(s, 'england').total.europe.sugar).toBe(100);
    const sim = play(observed, 60);
    const anyTrade = sim.config.nations.some((n) => Object.keys(ledgerFor(sim, n).total.europe).length > 0);
    expect(anyTrade).toBe(true);
    const col = Object.values(sim.colonies)[0];
    const owner = player(sim, col.owner);
    owner.boycotts = {};
    col.buildings.customHouse = 1;
    col.exports = { furs: true };
    col.goods.furs = 150;
    const before = ledgerFor(sim, col.owner).total;
    const europe = before.europe.furs ?? 0;
    const custom = before.custom.furs ?? 0;
    runCustomHouse(sim, col.id);
    const after = ledgerFor(sim, col.owner).total;
    expect(after.custom.furs).toBe(custom + 100);
    expect(after.europe.furs).toBe(europe + 100);
  });
});

describe('report queries', () => {
  const s = play(observed, 70);
  const nation = observed.nations
    .map((n) => ({ n, c: Object.values(s.colonies).filter((c) => c.owner === n).length }))
    .sort((a, b) => b.c - a.c)[0].n;

  it('summarises every colony', () => {
    const rows = coloniesOverview(s, nation);
    expect(rows.length).toBe(Object.values(s.colonies).filter((c) => c.owner === nation).length);
    for (const r of rows) {
      expect(r.population).toBeGreaterThan(0);
      expect(r.sol).toBeGreaterThanOrEqual(0);
      expect(r.sol).toBeLessThanOrEqual(100);
      expect(r.capacity).toBe(warehouseCapacity(r.colony));
      if (r.build && r.build.turns !== null) expect(r.build.turns).toBeGreaterThanOrEqual(1);
      for (const w of r.warehouse) expect(w.good).not.toBe('food');
    }
  });

  it('flags goods about to spoil', () => {
    const c = Object.values(s.colonies).find((x) => x.owner === nation)!;
    const copy = deserialize(serialize(s));
    const col = copy.colonies[c.id];
    col.goods.furs = warehouseCapacity(col) + 30;
    const o = colonyOverview(copy, col);
    expect(o.atRisk).toContain('furs');
    expect(o.warehouse.find((w) => w.good === 'furs')!.spoil).toBeGreaterThanOrEqual(30);
  });

  it('shows trade per good with the home port first', () => {
    const rows = tradeOverview(s, nation);
    expect(rows).toHaveLength(16);
    for (const r of rows) {
      expect(r.prices[0].port).toBe(nation);
      expect(r.prices[0].buy).toBeGreaterThan(r.prices[0].sell);
    }
  });

  it('lists land forces, ships and the Royal forces', () => {
    const land = landForces(s, nation);
    expect(land.every((f) => f.unit.owner === nation && f.unit.loc.kind !== 'colony')).toBe(true);
    const ships = navalOverview(s, nation);
    expect(ships.length).toBeGreaterThan(0);
    for (const sh of ships) expect(sh.used).toBeLessThanOrEqual(sh.holds);
    const ref = royalForces(s, nation)!;
    expect(ref.regulars).toBeGreaterThanOrEqual(0);
    expect(ref.landed).toBe(0);
  });

  it('counts crosses and missions only in known settlements', () => {
    const r = religionOverview(s, nation);
    expect(r.crossesRequired).toBe(player(s, nation).crossesRequired);
    if (r.crossesPerTurn > 0) expect(r.turnsToImmigrant).toBeGreaterThanOrEqual(1);
    const known = new Set(nativesOverview(s, nation).flatMap((t) => t.settlements.map((st) => st.settlement.id)));
    const own = Object.values(s.settlements).filter((st) => st.mission === nation && known.has(st.id)).length;
    expect(r.missions.reduce((n, m) => n + m.own, 0)).toBe(own);
  });

  it('respects fog of war for natives', () => {
    const p = player(s, nation);
    const tribes = nativesOverview(s, nation);
    for (const t of tribes) {
      for (const st of t.settlements) {
        expect(p.explored[st.settlement.y * s.map.width + st.settlement.x]).toBe(1);
        if (!st.visited) {
          expect(st.skill).toBeUndefined();
          expect(st.wants).toBeUndefined();
        } else expect(st.wants!.length).toBeGreaterThan(0);
      }
    }
    // A nation that has explored nothing knows no one.
    const blind = deserialize(serialize(s));
    player(blind, nation).explored.fill(0);
    expect(nativesOverview(blind, nation)).toEqual([]);
    expect(religionOverview(blind, nation).missions).toEqual([]);
  });

  it('summarises the Continental Congress', () => {
    const c = congressOverview(s, nation);
    const p = player(s, nation);
    expect(c.fathers).toEqual(p.fathers);
    expect(c.fatherBells).toBe(p.fatherBells);
    expect(c.colonies.length).toBe(coloniesOverview(s, nation).length);
    if (c.current && c.bellsPerTurn > 0) expect(c.turnsToFather).toBeGreaterThanOrEqual(1);
  });
});
