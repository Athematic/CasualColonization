import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  colonyReport,
  createGame,
  createUnit,
  deserialize,
  findPath,
  foundColony,
  isWater,
  sellGoods,
  serialize,
  tileAt,
  unitsAboard,
  type GameState,
  type Unit,
} from '../src/index.js';

function game(nations = 2, seed = 42): GameState {
  const all = ['england', 'france', 'netherlands', 'spain', 'portugal', 'sweden', 'denmark', 'russia'] as const;
  const list = all.slice(0, nations);
  return createGame({ seed, mapSize: 'small', nations: [...list], humans: [list[0]] });
}

function landTile(s: GameState): { x: number; y: number } {
  for (let y = s.map.height / 2; y < s.map.height; y++) {
    for (let x = 0; x < s.map.width; x++) {
      const t = tileAt(s, x, y)!;
      if (!isWater(t) && t.t !== 'arctic' && t.t !== 'mountains' && !Object.values(s.settlements).some((st) => Math.abs(st.x - x) <= 1 && Math.abs(st.y - y) <= 1)) {
        return { x, y };
      }
    }
  }
  throw new Error('no land');
}

function colonistOf(s: GameState): Unit {
  return createUnit(s, 'england', 'freeColonist', { kind: 'map', x: 0, y: 0 });
}

describe('new game', () => {
  it('is deterministic for a seed', () => {
    expect(serialize(game(3, 7))).toBe(serialize(game(3, 7)));
    expect(serialize(game(3, 7))).not.toBe(serialize(game(3, 8)));
  });

  it('supports any number of nations from 1 to 8', () => {
    for (let n = 1; n <= 8; n++) {
      const s = game(n);
      expect(s.players).toHaveLength(n);
      expect(Object.values(s.units).filter((u) => u.type === 'caravel')).toHaveLength(n);
    }
    expect(() => game(0)).toThrow();
  });

  it('builds a world with land, high seas to the east and native settlements', () => {
    const s = game();
    const land = s.map.tiles.filter((t) => !isWater(t)).length;
    expect(land).toBeGreaterThan(s.map.tiles.length * 0.2);
    for (let y = 0; y < s.map.height; y++) expect(tileAt(s, s.map.width - 1, y)!.t).toBe('highSeas');
    expect(Object.keys(s.settlements).length).toBeGreaterThanOrEqual(8);
  });

  it('starts each nation with a caravel carrying a soldier and a pioneer', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    expect(unitsAboard(s, ship).map((u) => u.type).sort()).toEqual(['hardyPioneer', 'veteranSoldier']);
  });
});

describe('colonies', () => {
  it('can be founded and produce food', () => {
    const s = game();
    const u = colonistOf(s);
    const at = landTile(s);
    u.loc = { kind: 'map', ...at };
    u.moves = 3;
    const colony = foundColony(s, u.id);
    expect(colony.owner).toBe('england');
    const report = colonyReport(s, colony);
    expect(report.population).toBe(1);
    expect(report.produced.food).toBeGreaterThan(0);
    expect(report.produced.bells).toBeGreaterThanOrEqual(1);
  });

  it('does not allow colonies next to each other', () => {
    const s = game();
    const u = colonistOf(s);
    const at = landTile(s);
    u.loc = { kind: 'map', ...at };
    u.moves = 3;
    foundColony(s, u.id);
    const other = Object.values(s.units).find((o) => o.owner === 'england' && o.type === 'hardyPioneer')!;
    other.loc = { kind: 'map', x: at.x + 1, y: at.y };
    other.moves = 3;
    expect(() => foundColony(s, other.id)).toThrow(/Too close/);
  });

  it('grows a new colonist from surplus food', () => {
    const s = game();
    const u = colonistOf(s);
    u.loc = { kind: 'map', ...landTile(s) };
    u.moves = 3;
    const colony = foundColony(s, u.id);
    colony.goods.food = 199;
    const before = Object.keys(s.units).length;
    for (let i = 0; i < 3 && Object.keys(s.units).length === before; i++) applyCommand(s, { type: 'endTurn' });
    expect(Object.keys(s.units).length).toBeGreaterThan(before);
  });
});

describe('europe', () => {
  it('lowers prices as goods are sold and applies tax', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    for (const p of unitsAboard(s, ship)) delete s.units[p.id];
    ship.loc = { kind: 'europe' };
    ship.cargo = { furs: 200 };
    const p = s.players[0];
    p.tax = 10;
    const price = p.market.furs.price;
    const gold = p.gold;
    const net = sellGoods(s, ship.id, 'furs', 200);
    expect(net).toBe(200 * price - Math.floor((200 * price) / 10));
    expect(p.gold).toBe(gold + net);
    expect(p.market.furs.price).toBeLessThan(price);
  });

  it('recruits colonists onto the docks', () => {
    const s = game();
    const r = applyCommand(s, { type: 'recruit', slot: 0 });
    expect(r.ok).toBe(true);
    expect(Object.values(s.units).some((u) => u.loc.kind === 'europe' && u.owner === 'england')).toBe(true);
  });
});

describe('orders', () => {
  it('rejects commands for units of another nation', () => {
    const s = game();
    const foreign = Object.values(s.units).find((u) => u.owner === 'france')!;
    const r = applyCommand(s, { type: 'skip', unitId: foreign.id });
    expect(r).toEqual({ ok: false, error: 'That is not your unit.' });
  });

  it('finds sea routes for ships', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    if (ship.loc.kind !== 'map') throw new Error('ship not on map');
    s.players[0].explored.fill(1);
    const path = findPath(s, ship, ship.loc.x, ship.loc.y + 3);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
  });
});

describe('simulation', () => {
  it('plays 80 turns with eight AI nations without errors', () => {
    const s = createGame({
      seed: 1234,
      mapSize: 'medium',
      nations: ['england', 'france', 'netherlands', 'spain', 'portugal', 'sweden', 'denmark', 'russia'],
      humans: [],
    });
    for (let i = 0; i < 80; i++) applyCommand(s, { type: 'endTurn' });
    expect(s.turn).toBeGreaterThanOrEqual(80);
    const colonies = Object.values(s.colonies);
    expect(colonies.length).toBeGreaterThan(8);
    const pop = Object.values(s.units).filter((u) => u.loc.kind === 'colony').length;
    expect(pop).toBeGreaterThan(colonies.length);
    // The state stays serialisable.
    const copy = deserialize(serialize(s));
    expect(copy.turn).toBe(s.turn);
  });
});

describe('europe round trip', () => {
  it('sails to Europe, recruits, boards and returns to the entry point', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    const entry = { ...s.players[0].entry };
    expect(applyCommand(s, { type: 'sailToEurope', unitId: ship.id })).toEqual({ ok: true, text: undefined });
    for (let i = 0; i < 2; i++) applyCommand(s, { type: 'endTurn' });
    expect(ship.loc.kind).toBe('europe');
    // Passengers stay aboard; send one ashore and recruit another in their place.
    const passenger = unitsAboard(s, ship)[0];
    expect(applyCommand(s, { type: 'unboard', unitId: passenger.id }).ok).toBe(true);
    const recruit = applyCommand(s, { type: 'recruit', slot: 1 });
    expect(recruit.ok).toBe(true);
    const docks = Object.values(s.units).filter((u) => u.owner === 'england' && u.loc.kind === 'europe' && u.type !== 'caravel');
    expect(docks.length).toBe(2);
    const newcomer = docks.find((u) => u.id !== passenger.id)!;
    expect(applyCommand(s, { type: 'board', unitId: newcomer.id, carrierId: ship.id }).ok).toBe(true);
    expect(applyCommand(s, { type: 'board', unitId: passenger.id, carrierId: ship.id })).toEqual({ ok: false, error: 'The ship is full.' });
    expect(applyCommand(s, { type: 'buyGoods', carrierId: ship.id, good: 'tools', amount: 100 }).ok).toBe(false);
    expect(applyCommand(s, { type: 'sailToAmerica', unitId: ship.id }).ok).toBe(true);
    for (let i = 0; i < 2; i++) applyCommand(s, { type: 'endTurn' });
    expect(ship.loc).toEqual({ kind: 'map', ...entry });
    expect(unitsAboard(s, ship)).toHaveLength(2);
  });

  it('only lets ships sail for Europe from the high seas', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    for (let x = 0; x < s.map.width; x++) {
      if (tileAt(s, x, 10)!.t === 'ocean') {
        ship.loc = { kind: 'map', x, y: 10 };
        break;
      }
    }
    const r = applyCommand(s, { type: 'sailToEurope', unitId: ship.id });
    expect(r.ok).toBe(false);
  });
});
