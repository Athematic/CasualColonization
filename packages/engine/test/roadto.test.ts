import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGame,
  createUnit,
  deserialize,
  endTurn,
  serialize,
  tileAt,
  unitPosition,
  type GameState,
  type Unit,
  removeUnit,
} from '../src/index.js';
import { unitsAwaitingOrders } from '../src/turn.js';

const Y = 10;
const X0 = 6;

/** A one-tile-wide land strip (plains) from X0 to X0+len-1 on row Y, surrounded by ocean, with a pioneer at its west end. */
function strip(len = 5, seed = 7): { s: GameState; u: Unit } {
  const s = createGame({ seed, mapSize: 'small', nations: ['england'], humans: ['england'] });
  s.players[0].explored.fill(1);
  for (let y = Y - 2; y <= Y + 2; y++) {
    for (let x = X0 - 2; x <= X0 + len + 1; x++) {
      const i = y * s.map.width + x;
      s.map.tiles[i] = y === Y && x >= X0 && x < X0 + len ? { t: 'plains' } : { t: 'ocean' };
    }
  }
  for (const k of Object.keys(s.units)) removeUnit(s, k);
  const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: X0, y: Y });
  u.role = 'pioneer';
  u.tools = 100;
  u.moves = 3;
  return { s, u };
}

const road = (s: GameState, x: number) => !!tileAt(s, x, Y)!.r;
const turn = (s: GameState, n = 1) => {
  for (let i = 0; i < n; i++) endTurn(s);
};

describe('Road to…', () => {
  it('builds a road along a 4-tile path over several turns, skipping a tile that has one', () => {
    const { s, u } = strip();
    tileAt(s, X0 + 2, Y)!.r = true;
    applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 4, y: Y });
    expect(u.work?.kind).toBe('road');
    expect(u.roadTo).toEqual({ x: X0 + 4, y: Y });
    expect(unitsAwaitingOrders(s, 'england')).not.toContain(u.id);
    let turns = 0;
    while (u.roadTo && turns++ < 40) turn(s);
    expect(u.roadTo).toBeUndefined();
    for (let x = X0; x <= X0 + 4; x++) expect(road(s, x), `road at ${x}`).toBe(true);
    expect(unitPosition(s, u)).toEqual({ x: X0 + 4, y: Y });
    // Four tiles to build at 3 turns each; each step onto a roadless tile uses the turn's moves.
    expect(turns).toBeLessThanOrEqual(16);
    expect(u.tools).toBe(100 - 4 * 20);
    expect(s.messages.some((m) => m.text.startsWith('Road finished'))).toBe(true);
  });

  it('keeps going over a road tile in the same turn', () => {
    const { s, u } = strip();
    for (let x = X0; x <= X0 + 3; x++) tileAt(s, x, Y)!.r = true;
    applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 4, y: Y });
    // Three cheap road steps use the whole turn; next turn it steps onto the roadless target and starts building there the turn after.
    expect(unitPosition(s, u)).toEqual({ x: X0 + 3, y: Y });
    turn(s);
    expect(unitPosition(s, u)).toEqual({ x: X0 + 4, y: Y });
    turn(s);
    expect(u.work?.kind).toBe('road');
  });

  it('only pioneers with tools may take the order', () => {
    const { s, u } = strip();
    u.role = 'none';
    expect(applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 3, y: Y }).ok).toBe(false);
    u.role = 'pioneer';
    u.tools = 0;
    expect(applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 3, y: Y }).ok).toBe(false);
    u.tools = 100;
    expect(applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 3, y: Y - 1 }).ok).toBe(false);
    expect(u.roadTo).toBeUndefined();
  });

  it('stops with a report when the tools run out', () => {
    const { s, u } = strip();
    u.tools = 20;
    applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 4, y: Y });
    turn(s, 4);
    expect(u.roadTo).toBeUndefined();
    expect(u.role).toBe('none');
    expect(road(s, X0)).toBe(true);
    expect(road(s, X0 + 1)).toBe(false);
    expect(s.messages.some((m) => m.text.includes('used up all of their tools') || m.text.includes('out of tools'))).toBe(true);
  });

  it('stops when the way is blocked', () => {
    const { s, u } = strip();
    for (let x = X0; x <= X0 + 1; x++) tileAt(s, x, Y)!.r = true;
    applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 4, y: Y });
    // A foreign unit steps onto the path.
    createUnit(s, 'france', 'freeColonist', { kind: 'map', x: X0 + 3, y: Y });
    turn(s, 4);
    expect(u.roadTo).toBeUndefined();
    expect(s.messages.some((m) => m.text.includes('stops building the road'))).toBe(true);
  });

  it('clearOrders cancels it', () => {
    const { s, u } = strip();
    applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 4, y: Y });
    applyCommand(s, { type: 'clearOrders', unitId: u.id });
    expect(u.roadTo).toBeUndefined();
    expect(u.work).toBeUndefined();
  });

  it('is deterministic and survives a save', () => {
    const run = () => {
      const { s, u } = strip();
      applyCommand(s, { type: 'roadTo', unitId: u.id, x: X0 + 4, y: Y });
      turn(s, 4);
      return s;
    };
    const a = run();
    expect(serialize(run())).toBe(serialize(a));
    const loaded = deserialize(serialize(a));
    const id = Object.keys(loaded.units)[0];
    expect(loaded.units[id].roadTo).toEqual({ x: X0 + 4, y: Y });
    turn(loaded, 20);
    expect(road(loaded, X0 + 4)).toBe(true);
  });

  it('loads old saves with no roadTo field', () => {
    const { s } = strip();
    const loaded = deserialize(serialize(s));
    const u = Object.values(loaded.units)[0];
    expect(u.roadTo).toBeUndefined();
    expect(applyCommand(loaded, { type: 'roadTo', unitId: u.id, x: X0 + 2, y: Y }).ok).toBe(true);
  });
});
