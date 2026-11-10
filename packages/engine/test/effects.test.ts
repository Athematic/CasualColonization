/**
 * Effects as data (docs/design/scenario-framework.md, step 4): every Founding Father's passive
 * effect is a modifier read at a named hook point (rules/modifiers.ts). Each test measures a
 * value on a constructed state before and after the father joins and checks it changed exactly
 * as before the move. A test-only scenario then gives a father a different modifier and sees the
 * engine follow the data. That the Americas play bit-identically is golden.test.ts's job.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  assignJob,
  attack,
  canBuild,
  cashTreasure,
  colonyReport,
  colonySiteProblem,
  conversionChance,
  convertType,
  createGame,
  createUnit,
  defencePower,
  deserialize,
  foundColony,
  isCoastal,
  isWater,
  landPrice,
  maxMoves,
  modifiers,
  nativeLandOwner,
  neighbours,
  offencePower,
  player,
  priceRecoveryChance,
  processColony,
  processImmigration,
  promote,
  proposePeace,
  randomImmigrant,
  registerScenario,
  sailTurns,
  serialize,
  sightRadius,
  TERRAIN,
  tileAt,
  tileYield,
  type BuildingKind,
  type Colony,
  type FatherId,
  type GameState,
  type NationId,
  type Scenario,
  type TerrainId,
  type Unit,
  type UnitTypeId,
} from '../src/index.js';
import { rumourOdds } from '../src/rumours.js';
import { random } from '../src/rng.js';

function game(seed = 7, scenario?: string): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], ...(scenario ? { scenario } : {}) });
}

const join = (s: GameState, id: FatherId, nation: NationId = 'england'): void => void player(s, nation).fathers.push(id);
const clone = (s: GameState): GameState => deserialize(serialize(s));

function colonyAt(s: GameState, coastal = false, owner: NationId = 'england'): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - 3; x++) {
      if (colonySiteProblem(s, x, y) || isCoastal(s, x, y) !== coastal) continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id, 'Testville');
    }
  }
  throw new Error('no site');
}

/** Puts new colonists of a type to work in a building of the colony. */
function staff(s: GameState, c: Colony, building: BuildingKind, type: UnitTypeId, n: number): void {
  for (let i = 0; i < n; i++) {
    const u = createUnit(s, c.owner, type, { kind: 'map', x: c.x, y: c.y });
    assignJob(s, u.id, c.id, { kind: 'building', building });
  }
}

function onMap(s: GameState, owner: NationId, type: UnitTypeId, role?: Unit['role']): Unit {
  const at = Object.values(s.colonies).find((c) => c.owner === owner) ?? colonyAt(s, false, owner);
  const u = createUnit(s, owner, type, { kind: 'map', x: at.x + 1, y: at.y });
  if (role) u.role = role;
  return u;
}

/** Sets the generator so the next roll satisfies `ok`. */
function rig(s: GameState, ok: (r: number) => boolean): void {
  for (let k = 1; k < 100000; k++) {
    if (ok(random({ rng: k }))) {
      s.rng = k;
      return;
    }
  }
  throw new Error('no rng state');
}

describe('Founding Fathers as modifiers', () => {
  it('Adam Smith: manufacturing capacity × 1.5 (rounded), not the carpenter', () => {
    const s = game();
    const c = colonyAt(s);
    staff(s, c, 'weaver', 'freeColonist', 2);
    staff(s, c, 'carpenter', 'freeColonist', 1);
    c.goods.cotton = 100;
    c.goods.lumber = 100;
    const before = colonyReport(s, c).buildings;
    join(s, 'adamSmith');
    const after = colonyReport(s, c).buildings;
    expect(after.weaver!.capacity).toBe(Math.round(before.weaver!.capacity * 1.5));
    expect(after.weaver!.capacity).toBeGreaterThan(before.weaver!.capacity);
    expect(after.carpenter!.capacity).toBe(before.carpenter!.capacity);
  });

  it('Thomas Jefferson and Thomas Paine: town hall bells + 10% and + the tax rate', () => {
    const s = game();
    const c = colonyAt(s);
    staff(s, c, 'townHall', 'elderStatesman', 2);
    player(s, 'england').tax = 30;
    const hall = () => colonyReport(s, c).buildings.townHall!;
    const cap = hall().capacity;
    expect(hall().output).toBe(cap);
    join(s, 'thomasJefferson');
    expect(hall().output).toBe(Math.round(cap * 1.1));
    join(s, 'thomasPaine');
    expect(hall().output).toBe(Math.round(cap * (1 + 40 / 100)));
  });

  it('William Penn: church crosses × 1.5 (rounded)', () => {
    const s = game();
    const c = colonyAt(s);
    staff(s, c, 'church', 'firebrandPreacher', 1);
    const before = colonyReport(s, c).buildings.church!.output;
    join(s, 'williamPenn');
    expect(colonyReport(s, c).buildings.church!.output).toBe(Math.round(before * 1.5));
  });

  it('Henry Hudson: furs from a worked tile × 2', () => {
    const s = game();
    const c = colonyAt(s);
    const at = neighbours(s, c.x, c.y).find(({ x, y }) => !isWater(tileAt(s, x, y)!))!;
    const tile = tileAt(s, at.x, at.y)!;
    tile.t = (Object.keys(TERRAIN) as TerrainId[]).find((t) => TERRAIN[t].forest?.yields.furs)!;
    tile.f = true;
    const before = tileYield(s, c, at.x, at.y, 'furs', 'freeColonist', 0);
    expect(before).toBeGreaterThan(0);
    join(s, 'henryHudson');
    expect(tileYield(s, c, at.x, at.y, 'furs', 'freeColonist', 0)).toBe(before * 2);
    expect(tileYield(s, c, at.x, at.y, 'lumber', 'freeColonist', 0)).toBe(tileYield(clone(s), c, at.x, at.y, 'lumber', 'freeColonist', 0));
  });

  it('Peter Minuit: natives ask nothing for land', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const at = neighbours(s, st.x, st.y).find(({ x, y }) => nativeLandOwner(s, x, y))!;
    expect(landPrice(s, 'england', at.x, at.y)).toBeGreaterThan(0);
    join(s, 'peterMinuit');
    expect(landPrice(s, 'england', at.x, at.y)).toBe(0);
  });

  it('Peter Stuyvesant: the custom house can be built', () => {
    const s = game();
    const c = colonyAt(s);
    staff(s, c, 'carpenter', 'freeColonist', 2);
    expect(canBuild(s, c, { kind: 'building', id: 'customHouse' })).toBe(false);
    join(s, 'peterStuyvesant');
    expect(canBuild(s, c, { kind: 'building', id: 'customHouse' })).toBe(true);
  });

  it('Jan de Witt: market recovery chance × 2', () => {
    const s = game();
    const p = player(s, 'england');
    const before = priceRecoveryChance(s, p);
    join(s, 'janDeWitt');
    expect(priceRecoveryChance(s, p)).toBe(before * 2);
  });

  it('Ferdinand Magellan: ships gain a move and sail a turn sooner', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    const soldier = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'veteranSoldier')!;
    const [moves, land, sail] = [maxMoves(ship, s), maxMoves(soldier, s), sailTurns(s, 'england')];
    join(s, 'ferdinandMagellan');
    expect(maxMoves(ship, s)).toBe(moves + 3);
    expect(maxMoves(soldier, s)).toBe(land);
    expect(sailTurns(s, 'england')).toBe(sail - 1);
    expect(sailTurns(s, 'france')).toBe(sail);
  });

  it('Hernando de Soto: land units see further; no tall tales or lost expeditions', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    const colonist = onMap(s, 'england', 'freeColonist');
    const [shipSight, sight] = [sightRadius(ship, s), sightRadius(colonist, s)];
    const odds = new Map(rumourOdds(s, colonist, undefined));
    expect(odds.get('nothing')).toBeGreaterThan(0);
    expect(odds.get('lost')).toBeGreaterThan(0);
    join(s, 'hernandoDeSoto');
    expect(sightRadius(colonist, s)).toBe(sight + 1);
    expect(sightRadius(ship, s)).toBe(shipSight);
    const after = new Map(rumourOdds(s, colonist, undefined));
    expect(after.get('nothing')).toBe(0);
    expect(after.get('lost')).toBe(0);
    for (const o of ['tales', 'smallTreasure', 'colonist', 'treasure', 'fountain'] as const) expect(after.get(o)).toBe(odds.get(o));
  });

  it('La Salle: a colony of three gets a stockade at the end of its turn', () => {
    const s = game();
    const c = colonyAt(s);
    staff(s, c, 'carpenter', 'freeColonist', 2);
    const t = clone(s);
    processColony(t, t.colonies[c.id]);
    expect(t.colonies[c.id].buildings.stockade).toBe(0);
    join(s, 'laSalle');
    processColony(s, c);
    expect(c.buildings.stockade).toBe(1);
  });

  it('Hernán Cortés: the Crown carries treasure free of charge', () => {
    const s = game();
    const c = colonyAt(s, true);
    const cash = (st: GameState): number => {
      const t = createUnit(st, 'england', 'treasure', { kind: 'map', x: c.x, y: c.y });
      t.treasure = 1000;
      const gold = player(st, 'england').gold;
      cashTreasure(st, t.id);
      return player(st, 'england').gold - gold;
    };
    const tax = player(s, 'england').tax;
    expect(cash(clone(s))).toBe(500 - Math.floor((500 * tax) / 100));
    join(s, 'hernanCortes');
    expect(cash(s)).toBe(1000 - Math.floor((1000 * tax) / 100));
  });

  it('Hernán Cortés and Juan de Sepúlveda: burned capitals yield 1.5 × the treasure, and converts', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    st.capital = true;
    st.defenders = 1;
    const at = neighbours(s, st.x, st.y).find(({ x, y }) => !isWater(tileAt(s, x, y)!) && !Object.values(s.settlements).some((o) => o.x === x && o.y === y))!;
    const burn = (base: GameState, fathers: FatherId[]): { treasure: number; converts: number } => {
      for (let k = 1; k < 1000; k++) {
        const t = clone(base);
        for (const f of fathers) join(t, f);
        const u = createUnit(t, 'england', 'veteranSoldier', { kind: 'map', ...at });
        u.role = 'dragoon';
        u.moves = 3;
        t.rng = k;
        attack(t, u.id, { settlementId: st.id });
        if (t.settlements[st.id]) continue;
        const units = Object.values(t.units).filter((x) => x.owner === 'england');
        return { treasure: units.find((x) => x.type === 'treasure')?.treasure ?? 0, converts: units.filter((x) => x.type === 'nativeConvert').length };
      }
      throw new Error('never won');
    };
    const plain = burn(s, []);
    expect(plain.treasure).toBeGreaterThan(0);
    expect(plain.converts).toBe(0);
    // The same seed draws the same base treasure, before the draws for converts.
    const k = burn(s, ['hernanCortes', 'juanDeSepulveda']);
    expect(k.treasure).toBe(Math.round(plain.treasure * 1.5));
    expect(k.converts).toBeGreaterThanOrEqual(1);
    expect(k.converts).toBeLessThanOrEqual(2);
  });

  it('George Washington: winners are always promoted, without a roll', () => {
    const s = game();
    const u = onMap(s, 'england', 'freeColonist', 'soldier');
    rig(s, (r) => r >= 0.2);
    const t = clone(s);
    expect(promote(t, t.units[u.id])).toBe('');
    join(s, 'georgeWashington');
    const rng = s.rng;
    expect(promote(s, u)).toContain('promoted');
    expect(u.type).toBe('veteranSoldier');
    expect(s.rng).toBe(rng);
  });

  it('Paul Revere: unarmed colonists take up 50 stored muskets', () => {
    const s = game();
    const c = colonyAt(s);
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
    c.goods.muskets = 50;
    const before = defencePower(s, u);
    join(s, 'paulRevere');
    expect(defencePower(s, u)).toBeGreaterThan(before);
    c.goods.muskets = 49;
    expect(defencePower(s, u)).toBe(before);
  });

  it('Francis Drake: privateers × 1.5', () => {
    const s = game();
    const privateer = createUnit(s, 'england', 'privateer', { kind: 'europe' });
    const frigate = createUnit(s, 'england', 'frigate', { kind: 'europe' });
    const [p, f] = [offencePower(s, privateer), offencePower(s, frigate)];
    join(s, 'francisDrake');
    expect(offencePower(s, privateer)).toBe(p * 1.5);
    expect(offencePower(s, frigate)).toBe(f);
  });

  it('Benjamin Franklin: other Europeans always accept peace', () => {
    const s = game();
    const [e, f] = [player(s, 'england'), player(s, 'france')];
    e.stance.france = 'war';
    f.stance.england = 'war';
    e.warSince.france = s.turn;
    f.warSince.england = s.turn;
    const t = clone(s);
    expect(proposePeace(t, 'england', 'france')).toContain('refuses');
    join(s, 'benjaminFranklin');
    expect(proposePeace(s, 'england', 'france')).toContain('made peace');
  });

  it('William Brewster: no criminals or servants, and the best of the pool arrives', () => {
    const s = game();
    const poor = (st: GameState) => Array.from({ length: 300 }, () => randomImmigrant(st, 'england')).filter((t) => t === 'pettyCriminal' || t === 'indenturedServant').length;
    expect(poor(clone(s))).toBeGreaterThan(0);
    const p = player(s, 'england');
    p.recruitPool = ['pettyCriminal', 'expertFarmer', 'indenturedServant'];
    p.crosses = p.crossesRequired;
    join(s, 'williamBrewster');
    expect(poor(clone(s))).toBe(0);
    processImmigration(s, p);
    expect(Object.values(s.units).some((u) => u.owner === 'england' && u.type === 'expertFarmer' && u.loc.kind === 'europe')).toBe(true);
  });

  it('Jean de Brébeuf and Bartolomé de las Casas: missions convert twice as often, into free colonists', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const chance = conversionChance(s, st, 'england');
    expect(convertType(s, 'england')).toBe('nativeConvert');
    join(s, 'jeanDeBrebeuf');
    expect(conversionChance(s, st, 'england')).toBe(chance * 2);
    join(s, 'bartolomeDeLasCasas');
    expect(convertType(s, 'england')).toBe('freeColonist');
  });
});

describe('the data drives the behaviour', () => {
  /** The Americas with Henry Hudson doubling ore instead of furs. */
  const HUDSON_ORE: Scenario = {
    ...AMERICAS,
    id: 'test-hudson-ore',
    name: 'Test: Hudson mines ore',
    council: { ...AMERICAS.council, effects: { henryHudson: { modifiers: [{ hook: 'tileYield', good: 'ore', mul: 3 }] } } },
  };
  registerScenario(HUDSON_ORE);

  it('a scenario can give a father a different modifier', () => {
    const s = game(7, HUDSON_ORE.id);
    const c = colonyAt(s);
    const at = neighbours(s, c.x, c.y).find(({ x, y }) => !isWater(tileAt(s, x, y)!))!;
    const tile = tileAt(s, at.x, at.y)!;
    tile.t = (Object.keys(TERRAIN) as TerrainId[]).find((t) => TERRAIN[t].yields.ore && TERRAIN[t].forest?.yields.furs)!;
    const yields = () => {
      delete tile.f;
      const ore = tileYield(s, c, at.x, at.y, 'ore', 'freeColonist', 0);
      tile.f = true;
      return { ore, furs: tileYield(s, c, at.x, at.y, 'furs', 'freeColonist', 0) };
    };
    const before = yields();
    expect(before.ore).toBeGreaterThan(0);
    join(s, 'henryHudson');
    expect(modifiers(s, 'england', 'tileYield')).toEqual([{ hook: 'tileYield', good: 'ore', mul: 3 }]);
    // Ore × 3 where the Americas' Hudson doubles furs (above); furs stay as they were.
    expect(yields()).toEqual({ ore: before.ore * 3, furs: before.furs });
  });
});
