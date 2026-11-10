import { describe, expect, it } from 'vitest';
import {
  AMBUSH_BONUS,
  BOMBARD_CHANCE,
  BUILDINGS,
  REPAIR_COST,
  STOCKADE_DEFENCE,
  applyCommand,
  bombardShips,
  bravesOf,
  canBuild,
  colonySiteProblem,
  createGame,
  createUnit,
  defencePower,
  deserialize,
  foundColony,
  isCoastal,
  isWater,
  neighbours,
  offencePower,
  serialize,
  tileAt,
  type Colony,
  type GameState,
  type Unit,
} from '../src/index.js';
import { aiFight } from '../src/ai/common.js';
import { random } from '../src/rng.js';

function game(seed = 7): GameState {
  const s = createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans: ['england'] });
  s.players.find((p) => p.id === 'england')!.stance.france = 'war';
  s.players.find((p) => p.id === 'france')!.stance.england = 'war';
  return s;
}

/** Sets the generator so the next rolls satisfy the given tests (so a fight goes the way a test needs). */
function rig(s: GameState, ...rolls: ((r: number) => boolean)[]): void {
  for (let k = 1; k < 100000; k++) {
    const probe = { rng: k };
    if (rolls.every((ok) => ok(random(probe)))) {
      s.rng = k;
      return;
    }
  }
  throw new Error('no rng state');
}
const low = (r: number) => r < 0.1;
const high = (r: number) => r > 0.9;

type Pos = { x: number; y: number };

/** Two adjacent open plains tiles (a, b), clear of colonies and units, with b east of a. */
function openPair(s: GameState): { a: Pos; b: Pos } {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - 4; x++) {
      const ta = tileAt(s, x, y)!;
      const tb = tileAt(s, x + 1, y)!;
      if (isWater(ta) || isWater(tb)) continue;
      if (Object.values(s.units).some((u) => u.loc.kind === 'map' && Math.abs(u.loc.x - x) < 3 && Math.abs(u.loc.y - y) < 3)) continue;
      if (Object.values(s.colonies).some((c) => Math.abs(c.x - x) < 3 && Math.abs(c.y - y) < 3)) continue;
      for (const t of [ta, tb]) {
        t.t = 'plains';
        delete t.f;
      }
      return { a: { x, y }, b: { x: x + 1, y } };
    }
  }
  throw new Error('no open ground');
}

function unit(s: GameState, owner: 'england' | 'france', type: Parameters<typeof createUnit>[2], at: Pos, role?: Unit['role']): Unit {
  const u = createUnit(s, owner, type, { kind: 'map', x: at.x, y: at.y });
  if (role) u.role = role;
  u.moves = 3;
  return u;
}

function fight(s: GameState, attacker: Unit, defender: Unit): void {
  const r = applyCommand(s, { type: 'attack', unitId: attacker.id, target: { unitId: defender.id } });
  if (!r.ok) throw new Error(r.error);
}

function colonyAtOpenSite(s: GameState, coastal: boolean, owner: 'england' | 'france' = 'england'): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - 3; x++) {
      if (colonySiteProblem(s, x, y) || isCoastal(s, x, y) !== coastal) continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id, 'Fortville');
    }
  }
  throw new Error('no site');
}

describe('damaged artillery', () => {
  it('is weaker than whole artillery', () => {
    const s = game();
    const { a } = openPair(s);
    const whole = unit(s, 'england', 'artillery', a);
    const hurt = unit(s, 'england', 'damagedArtillery', a);
    expect(offencePower(s, hurt)).toBeLessThan(offencePower(s, whole));
    expect(defencePower(s, hurt)).toBeLessThan(defencePower(s, whole));
  });

  it('artillery that loses is damaged, damaged artillery that loses is destroyed', () => {
    const s = game();
    const { a, b } = openPair(s);
    const gun = unit(s, 'england', 'artillery', a);
    const guard = unit(s, 'france', 'veteranSoldier', b, 'soldier');
    rig(s, high);
    fight(s, gun, guard);
    expect(s.units[gun.id].type).toBe('damagedArtillery');
    gun.moves = 3;
    rig(s, high);
    fight(s, gun, guard);
    expect(s.units[gun.id]).toBeUndefined();
  });

  it('artillery that loses on defence is damaged too', () => {
    const s = game();
    const { a, b } = openPair(s);
    const gun = unit(s, 'france', 'artillery', a);
    const raider = unit(s, 'england', 'kingsRegular', b, 'soldier');
    rig(s, low);
    fight(s, raider, gun);
    expect(s.units[gun.id].type).toBe('damagedArtillery');
  });

  it('is repaired in a colony with an armory, for hammers and tools', () => {
    const s = game();
    const c = colonyAtOpenSite(s, false);
    const gun = unit(s, 'england', 'damagedArtillery', c);
    expect(applyCommand(s, { type: 'repairArtillery', unitId: gun.id }).ok).toBe(false); // no armory
    c.buildings.armory = 1;
    expect(applyCommand(s, { type: 'repairArtillery', unitId: gun.id }).ok).toBe(false); // nothing in stock
    c.hammers = REPAIR_COST.hammers + 5;
    c.goods.tools = REPAIR_COST.tools;
    expect(applyCommand(s, { type: 'repairArtillery', unitId: gun.id }).ok).toBe(true);
    expect(s.units[gun.id].type).toBe('artillery');
    expect(c.hammers).toBe(5);
    expect(c.goods.tools).toBe(0);
  });

  it('is repaired in Europe for gold', () => {
    const s = game();
    const gun = createUnit(s, 'england', 'damagedArtillery', { kind: 'europe' });
    const p = s.players.find((q) => q.id === 'england')!;
    p.gold = REPAIR_COST.gold + 10;
    expect(applyCommand(s, { type: 'repairArtillery', unitId: gun.id }).ok).toBe(true);
    expect(p.gold).toBe(10);
    expect(s.units[gun.id].type).toBe('artillery');
  });
});

describe('ambush', () => {
  it('gives an attacker in cover a bonus against a unit in the open', () => {
    const s = game();
    const { a, b } = openPair(s);
    const foe = unit(s, 'france', 'freeColonist', b);
    const soldier = unit(s, 'england', 'freeColonist', a, 'soldier');
    const open = offencePower(s, soldier, foe);
    expect(open).toBe(offencePower(s, soldier));
    const from = tileAt(s, a.x, a.y)!;
    from.t = 'hills';
    expect(offencePower(s, soldier, foe)).toBeCloseTo(open * (1 + AMBUSH_BONUS.hills / 100));
    from.t = 'mountains';
    expect(offencePower(s, soldier, foe)).toBeCloseTo(open * (1 + AMBUSH_BONUS.mountains / 100));
    from.t = 'plains';
    from.f = true;
    expect(offencePower(s, soldier, foe)).toBeCloseTo(open * (1 + AMBUSH_BONUS.forest / 100));
  });

  it('does not apply against a fortified unit or a unit in cover', () => {
    const s = game();
    const { a, b } = openPair(s);
    tileAt(s, a.x, a.y)!.f = true;
    const foe = unit(s, 'france', 'freeColonist', b);
    const soldier = unit(s, 'england', 'freeColonist', a, 'soldier');
    const base = offencePower(s, soldier);
    foe.state = 'fortified';
    expect(offencePower(s, soldier, foe)).toBe(base);
    foe.state = 'active';
    tileAt(s, b.x, b.y)!.t = 'hills';
    expect(offencePower(s, soldier, foe)).toBe(base);
  });
});

describe('fortress', () => {
  it('is the third level of the stockade and needs a fort and eight colonists', () => {
    expect(BUILDINGS.stockade.levels.map((l) => l.name)).toEqual(['Stockade', 'Fort', 'Fortress']);
    expect(BUILDINGS.stockade.levels[2]).toMatchObject({ hammers: 240, tools: 100, minPop: 8 });
    expect(STOCKADE_DEFENCE).toEqual([100, 150, 200]);
    const s = game();
    const c = colonyAtOpenSite(s, false);
    c.buildings.stockade = 2;
    expect(canBuild(s, c, { kind: 'building', id: 'stockade' })).toBe(false); // one colonist
    for (let i = 0; i < 7; i++) {
      const w = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
      expect(applyCommand(s, { type: 'assignJob', unitId: w.id, colonyId: c.id }).ok).toBe(true);
    }
    expect(canBuild(s, c, { kind: 'building', id: 'stockade' })).toBe(true);
    c.buildings.stockade = 3;
    expect(canBuild(s, c, { kind: 'building', id: 'stockade' })).toBe(false); // fully upgraded
  });

  it('defends better than a fort', () => {
    const s = game();
    const c = colonyAtOpenSite(s, false);
    const guard = unit(s, 'england', 'freeColonist', c, 'soldier');
    c.buildings.stockade = 2;
    const fort = defencePower(s, guard);
    c.buildings.stockade = 3;
    expect(defencePower(s, guard)).toBeGreaterThan(fort);
    expect(defencePower(s, guard) / fort).toBeCloseTo(3 / 2.5);
  });

  it('coastal forts bombard adjacent enemy ships at the start of the turn', () => {
    const s = game();
    const c = colonyAtOpenSite(s, true);
    const water = neighbours(s, c.x, c.y).find((n) => isWater(tileAt(s, n.x, n.y)!))!;
    const ship = unit(s, 'france', 'caravel', water);
    const stays = () => ship.loc.kind === 'map' && ship.loc.x === water.x && ship.loc.y === water.y && !ship.repair;
    c.buildings.stockade = 1;
    rig(s, low);
    bombardShips(s, 'england');
    expect(stays()).toBe(true); // a stockade has no guns
    c.buildings.stockade = 2;
    rig(s, (r) => r >= BOMBARD_CHANCE[1] + 0.05);
    bombardShips(s, 'england');
    expect(stays()).toBe(true); // missed
    rig(s, (r) => r < BOMBARD_CHANCE[1] - 0.05);
    bombardShips(s, 'england');
    expect(stays()).toBe(false); // damaged: sent for repairs or sunk
  });

  it('ignores ships of nations at peace', () => {
    const s = game();
    const c = colonyAtOpenSite(s, true);
    c.buildings.stockade = 3;
    s.players.find((p) => p.id === 'england')!.stance.france = 'peace';
    const water = neighbours(s, c.x, c.y).find((n) => isWater(tileAt(s, n.x, n.y)!))!;
    const ship = unit(s, 'france', 'caravel', water);
    rig(s, low);
    bombardShips(s, 'england');
    expect(ship.loc).toMatchObject({ x: water.x, y: water.y });
  });
});

describe('captured equipment', () => {
  it('a soldier who beats a dragoon in the open takes the horses', () => {
    const s = game();
    const { a, b } = openPair(s);
    const me = unit(s, 'england', 'freeColonist', a, 'soldier');
    const foe = unit(s, 'france', 'freeColonist', b, 'dragoon');
    rig(s, low, low);
    fight(s, me, foe);
    expect(foe.role).toBe('soldier');
    expect(s.units[me.id].role).toBe('dragoon');
  });

  it('may leave the horses behind (seeded chance)', () => {
    const s = game();
    const { a, b } = openPair(s);
    const me = unit(s, 'england', 'freeColonist', a, 'soldier');
    const foe = unit(s, 'france', 'freeColonist', b, 'dragoon');
    rig(s, low, high);
    fight(s, me, foe);
    expect(me.role).toBe('soldier');
  });

  it('an unarmed colonist who beats a soldier takes the muskets', () => {
    const s = game();
    const { a, b } = openPair(s);
    const raider = unit(s, 'england', 'freeColonist', a, 'soldier');
    const farmer = unit(s, 'france', 'freeColonist', b);
    rig(s, high, low); // the raider loses
    fight(s, raider, farmer);
    expect(raider.role).toBe('none');
    expect(farmer.role).toBe('soldier');
  });

  it('nothing is taken from a loser inside a colony', () => {
    const s = game();
    const c = colonyAtOpenSite(s, false);
    const raider = unit(s, 'england', 'freeColonist', c, 'soldier');
    const n = neighbours(s, c.x, c.y).find((q) => !isWater(tileAt(s, q.x, q.y)!))!;
    const farmer = unit(s, 'france', 'freeColonist', n);
    rig(s, high, low); // the raider loses
    fight(s, raider, farmer);
    expect(raider.role).toBe('none');
    expect(farmer.role).toBe('none');
  });

  it('a soldier who kills a mounted brave takes its horses', () => {
    const s = game();
    const { a, b } = openPair(s);
    const me = unit(s, 'england', 'freeColonist', a, 'soldier');
    const tribe = s.tribes[0].id;
    bravesOf(s)['b-test'] = { id: 'b-test', tribe, home: 'none', x: b.x, y: b.y, mounted: true };
    rig(s, low, low);
    const r = applyCommand(s, { type: 'attack', unitId: me.id, target: { braveId: 'b-test' } });
    expect(r.ok).toBe(true);
    expect(s.units[me.id].role).toBe('dragoon');
  });
});

describe('computer players and old saves', () => {
  it('keeps damaged artillery out of even fights, whole artillery with an edge', () => {
    const s = game();
    const { a, b } = openPair(s);
    const foe = unit(s, 'england', 'veteranSoldier', b, 'soldier');
    foe.state = 'fortified';
    const hurt = unit(s, 'france', 'damagedArtillery', a);
    const p = s.players.find((q) => q.id === 'france')!;
    expect(aiFight(s, p, hurt)).toBe(false);
    expect(hurt.moves).toBe(3);
    const gun = unit(s, 'france', 'artillery', a);
    expect(aiFight(s, p, gun)).toBe(true);
  });

  it('round-trips a state with damaged artillery, and replays identically', () => {
    const run = () => {
      const s = game();
      const { a, b } = openPair(s);
      const gun = unit(s, 'england', 'artillery', a);
      const guard = unit(s, 'france', 'veteranSoldier', b, 'soldier');
      for (let i = 0; i < 3 && s.units[gun.id] && s.units[guard.id] && s.units[guard.id].owner === 'france'; i++) {
        gun.moves = 3;
        fight(s, gun, guard);
      }
      return serialize(s);
    };
    const first = run();
    expect(run()).toBe(first);
    expect(serialize(deserialize(first))).toBe(first);
  });

  it('loads a state saved before these rules (stockade at most 2) and plays on', () => {
    const s = game();
    const c = colonyAtOpenSite(s, false);
    c.buildings.stockade = 2;
    const loaded = deserialize(serialize(s));
    expect(Object.values(loaded.colonies)[0].buildings.stockade).toBe(2);
    expect(applyCommand(loaded, { type: 'endTurn' }).ok).toBe(true);
  });
});
