import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buyPrice,
  colonySiteProblem,
  createGame,
  createUnit,
  deserialize,
  findPath,
  foundColony,
  handOver,
  headStartConfig,
  isCoastal,
  playUntil,
  runAiUntilHuman,
  runRoute,
  serialize,
  tileAt,
  unitsAwaitingOrders,
  type Colony,
  type GameState,
  type RouteStop,
} from '../src/index.js';

function game(seed = 42, nations: ('england' | 'france')[] = ['england']): GameState {
  const s = createGame({ seed, mapSize: 'small', nations, humans: ['england'] });
  // People only route through land they have seen.
  s.players[0].explored.fill(1);
  return s;
}

function found(s: GameState, x: number, y: number, name: string): Colony {
  const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
  u.moves = 3;
  return foundColony(s, u.id, name);
}

/** Two English colonies 3–6 tiles apart on the same land, the first on the coast. */
function twoColonies(s: GameState): [Colony, Colony] {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains') continue;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const bx = x + dx;
          const by = y + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 3 || colonySiteProblem(s, bx, by)) continue;
          const probe = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x, y });
          const path = findPath(s, probe, bx, by);
          delete s.units[probe.id];
          if (!path || path.length > 8) continue;
          const a = found(s, x, y, 'Port');
          return [a, found(s, bx, by, 'Inland')];
        }
      }
    }
  }
  throw new Error('no sites');
}

function endTurns(s: GameState, n: number) {
  for (let i = 0; i < n; i++) applyCommand(s, { type: 'endTurn' });
}

function create(s: GameState, name: string, stops: RouteStop[]): string {
  const r = applyCommand(s, { type: 'createRoute', name, stops });
  if (!r.ok) throw new Error(r.error);
  expect(r.id).toBeTruthy();
  return r.id!;
}

describe('trade routes', () => {
  it('carries goods by wagon train between colonies without overfilling the warehouse', () => {
    const s = game();
    const [port, inland] = twoColonies(s);
    inland.goods.furs = 80;
    inland.goods.ore = 60;
    port.goods.furs = 0;
    const routeId = create(s, 'Fur road', [
      { at: inland.id, load: [{ good: 'furs' }, { good: 'ore', amount: 50 }], unload: [] },
      { at: port.id, load: [], unload: [{ good: 'furs' }, { good: 'ore' }] },
    ]);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: inland.x, y: inland.y });
    // No moves left this turn, so it waits loaded (a river could take it all the way at once).
    wagon.moves = 0;
    expect(applyCommand(s, { type: 'assignRoute', unitId: wagon.id, routeId }).ok).toBe(true);
    // Loaded on the spot: all furs, and ore above the 50 kept back.
    expect(inland.goods.furs).toBe(0);
    expect(inland.goods.ore).toBe(50);
    expect(wagon.cargo).toEqual({ furs: 80, ore: 10 });
    expect(unitsAwaitingOrders(s, 'england')).not.toContain(wagon.id);

    port.goods.furs = 50;
    for (let i = 0; i < 10 && (wagon.cargo?.furs ?? 0) > 0; i++) endTurns(s, 1);
    // The port's warehouse holds 100: the wagon keeps what does not fit.
    expect(port.goods.furs).toBeGreaterThanOrEqual(100);
    expect(port.goods.ore).toBeGreaterThanOrEqual(10);
    expect(wagon.route?.id).toBe(routeId);
  });

  it('sells in Europe at market prices after tax, buys supplies and brings them home', () => {
    const s = game();
    const [port] = twoColonies(s);
    const p = s.players[0];
    p.tax = 10;
    const ship = Object.values(s.units).find((u) => u.type === 'caravel')!;
    for (const u of Object.values(s.units)) if (u.loc.kind === 'carrier') delete s.units[u.id];
    ship.loc = { kind: 'map', x: port.x, y: port.y };
    ship.moves = 12;
    port.goods.sugar = 100;
    port.goods.tobacco = 30;
    const routeId = create(s, 'Sugar run', [
      { at: port.id, load: [{ good: 'sugar' }, { good: 'tobacco' }], unload: [{ good: 'tools' }] },
      { at: 'europe', load: [{ good: 'tools', amount: 50 }], unload: [{ good: 'sugar' }, { good: 'tobacco' }] },
    ]);
    expect(applyCommand(s, { type: 'assignRoute', unitId: ship.id, routeId }).ok).toBe(true);
    expect(ship.cargo).toEqual({ sugar: 100, tobacco: 30 });
    // Arriving in Europe: sold at today's prices less tax, then tools bought and the ship sent back.
    ship.loc = { kind: 'europe' };
    const sugarPrice = p.market.sugar.price;
    const tobaccoPrice = p.market.tobacco.price;
    const toolsPrice = buyPrice(p, 'tools');
    const gold = p.gold;
    runRoute(s, ship);
    expect(ship.cargo).toEqual({ tools: 50 });
    expect(ship.loc.kind).toBe('sailing');
    const net = (gross: number) => gross - Math.floor((gross * 10) / 100);
    expect(p.gold).toBe(gold + net(100 * sugarPrice) + net(30 * tobaccoPrice) - 50 * toolsPrice);
    for (let i = 0; i < 20 && (ship.cargo?.tools ?? 0) > 0; i++) endTurns(s, 1);
    expect(port.goods.tools).toBeGreaterThanOrEqual(50);
  });

  it('keeps boycotted goods aboard instead of selling them', () => {
    const s = game();
    const [port] = twoColonies(s);
    const p = s.players[0];
    p.boycotts.furs = true;
    const ship = Object.values(s.units).find((u) => u.type === 'caravel')!;
    for (const u of Object.values(s.units)) if (u.loc.kind === 'carrier') delete s.units[u.id];
    ship.loc = { kind: 'europe' };
    ship.cargo = { furs: 100, sugar: 50 };
    const routeId = create(s, 'Home', [
      { at: 'europe', load: [], unload: [{ good: 'furs' }, { good: 'sugar' }] },
      { at: port.id, load: [], unload: [] },
    ]);
    expect(applyCommand(s, { type: 'assignRoute', unitId: ship.id, routeId }).ok).toBe(true);
    expect(ship.cargo).toEqual({ furs: 100 });
    expect(ship.loc.kind).toBe('sailing');
  });

  it('takes colonists from the docks and lands them at the next colony', () => {
    const s = game();
    const [port] = twoColonies(s);
    const ship = Object.values(s.units).find((u) => u.type === 'caravel')!;
    for (const u of Object.values(s.units)) if (u.loc.kind === 'carrier') delete s.units[u.id];
    ship.loc = { kind: 'europe' };
    const colonist = createUnit(s, 'england', 'expertFarmer', { kind: 'europe' });
    const routeId = create(s, 'Ferry', [
      { at: 'europe', load: [], unload: [], passengers: true },
      { at: port.id, load: [], unload: [] },
    ]);
    expect(s.routes![routeId].stops[0].passengers).toBe(true);
    expect(applyCommand(s, { type: 'assignRoute', unitId: ship.id, routeId }).ok).toBe(true);
    expect(colonist.loc).toEqual({ kind: 'carrier', carrierId: ship.id });
    for (let i = 0; i < 20 && colonist.loc.kind === 'carrier'; i++) endTurns(s, 1);
    expect(colonist.loc).toEqual({ kind: 'map', x: port.x, y: port.y });
    expect(unitsAwaitingOrders(s, 'england')).toContain(colonist.id);
  });

  it('checks route commands against the rules', () => {
    const s = game();
    const [port, inland] = twoColonies(s);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: inland.x, y: inland.y });
    const colonist = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: inland.x, y: inland.y });
    const toEurope = create(s, 'Overseas', [
      { at: port.id, load: [], unload: [] },
      { at: 'europe', load: [], unload: [] },
    ]);
    expect(applyCommand(s, { type: 'assignRoute', unitId: wagon.id, routeId: toEurope })).toMatchObject({ ok: false });
    expect(applyCommand(s, { type: 'assignRoute', unitId: colonist.id, routeId: toEurope })).toMatchObject({ ok: false });
    expect(applyCommand(s, { type: 'createRoute', name: '  ', stops: [] })).toMatchObject({ ok: false });
    expect(applyCommand(s, { type: 'createRoute', name: 'Bad', stops: [{ at: 'c9999', load: [], unload: [] }] })).toMatchObject({ ok: false });
    expect(applyCommand(s, { type: 'createRoute', name: 'Bad', stops: [{ at: port.id, load: [{ good: 'gold' as never }], unload: [] }] })).toMatchObject({ ok: false });
    // A ship cannot use an inland colony.
    const land = create(s, 'Land', [
      { at: port.id, load: [], unload: [] },
      { at: inland.id, load: [], unload: [] },
    ]);
    const ship = Object.values(s.units).find((u) => u.type === 'caravel')!;
    expect(applyCommand(s, { type: 'assignRoute', unitId: ship.id, routeId: land })).toMatchObject({ ok: false });
    expect(applyCommand(s, { type: 'assignRoute', unitId: wagon.id, routeId: land }).ok).toBe(true);
    expect(applyCommand(s, { type: 'editRoute', routeId: land, name: 'Old road' }).ok).toBe(true);
    expect(s.routes![land].name).toBe('Old road');
    // Clearing orders takes the wagon off the route; deleting a route frees its units.
    expect(applyCommand(s, { type: 'clearOrders', unitId: wagon.id }).ok).toBe(true);
    expect(wagon.route).toBeUndefined();
    expect(applyCommand(s, { type: 'assignRoute', unitId: wagon.id, routeId: land }).ok).toBe(true);
    expect(applyCommand(s, { type: 'deleteRoute', routeId: land }).ok).toBe(true);
    expect(wagon.route).toBeUndefined();
    expect(s.routes![land]).toBeUndefined();
    // Editing a route so the unit can no longer follow it takes the unit off.
    expect(applyCommand(s, { type: 'assignRoute', unitId: ship.id, routeId: toEurope }).ok).toBe(true);
    expect(applyCommand(s, { type: 'editRoute', routeId: toEurope, stops: [{ at: port.id, load: [], unload: [] }] }).ok).toBe(true);
    expect(ship.route).toBeUndefined();
  });

  it('passes stops it can no longer serve and loads older saves without routes', () => {
    const s = game(42, ['england', 'france']);
    const [port, inland] = twoColonies(s);
    const routeId = create(s, 'Lost', [
      { at: port.id, load: [], unload: [] },
      { at: inland.id, load: [], unload: [] },
    ]);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: inland.x, y: inland.y });
    expect(applyCommand(s, { type: 'assignRoute', unitId: wagon.id, routeId }).ok).toBe(true);
    port.owner = 'france';
    inland.owner = 'france';
    endTurns(s, 1);
    expect(wagon.route).toBeUndefined();

    const old = deserialize(serialize(game(7)));
    delete old.routes;
    for (const u of Object.values(old.units)) delete u.route;
    endTurns(old, 3);
    expect(old.routes).toBeUndefined();
  });

  it('keeps a computer nation’s routes running after a head start hand-over', () => {
    const s = createGame(headStartConfig({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: ['england'] }, 400));
    playUntil(s, 40);
    // Give the computer a route of its own, then hand over.
    s.config.headStart!.turn = s.turn;
    const colonies = Object.values(s.colonies).filter((c) => c.owner === 'england');
    const port = colonies.find((c) => isCoastal(s, c.x, c.y));
    expect(port).toBeTruthy();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    for (const u of Object.values(s.units)) if (u.loc.kind === 'carrier' && u.loc.carrierId === ship.id) delete s.units[u.id];
    s.routes = { ...s.routes, rx: { id: 'rx', owner: 'england', name: 'Computer run', stops: [{ at: port!.id, load: [{ good: 'furs' }], unload: [] }, { at: 'europe', load: [], unload: [{ good: 'furs' }] }] } };
    ship.route = { id: 'rx', stop: 0 };
    handOver(s);
    runAiUntilHuman(s);
    expect(s.players.find((p) => p.id === 'england')!.human).toBe(true);
    expect(s.routes!.rx).toBeTruthy();
    expect(ship.route?.id).toBe('rx');
    const before = JSON.stringify(ship.loc);
    endTurns(s, 4);
    expect(ship.route?.id).toBe('rx');
    expect(JSON.stringify(ship.loc)).not.toBe(before);
  });
});
