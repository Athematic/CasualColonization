import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  colonyReport,
  colonySiteProblem,
  createGame,
  createUnit,
  deserialize,
  distance,
  foundColony,
  isWater,
  migrate,
  nativeLandOwner,
  neighbours,
  nextFatherCost,
  processNatives,
  rebelShare,
  serialize,
  tileAt,
  type Colony,
  type GameState,
} from '../src/index.js';

function game(seed = 42): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans: ['england'] });
}

/** Founds an English colony on the first good site, optionally next to native land. */
function colony(s: GameState, nearNatives = false): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y)) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains') continue;
      const native = neighbours(s, x, y).some((n) => nativeLandOwner(s, n.x, n.y));
      if (native !== nearNatives) continue;
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id, 'Testtown');
    }
  }
  throw new Error('no site');
}

function addWorker(s: GameState, c: Colony, type: Parameters<typeof createUnit>[2]) {
  const u = createUnit(s, 'england', type, { kind: 'map', x: c.x, y: c.y });
  const r = applyCommand(s, { type: 'assignJob', unitId: u.id, colonyId: c.id });
  if (!r.ok) throw new Error(r.error);
  return u;
}

function endTurns(s: GameState, n: number) {
  for (let i = 0; i < n; i++) applyCommand(s, { type: 'endTurn' });
}

describe('founding fathers', () => {
  it('offers one candidate per category and joins once enough bells are rung', () => {
    const s = game();
    const p = s.players[0];
    expect(Object.keys(p.fatherOffer).sort()).toEqual(['exploration', 'military', 'political', 'religious', 'trade']);
    const pick = p.fatherOffer.political!;
    expect(applyCommand(s, { type: 'chooseFather', father: pick }).ok).toBe(true);
    colony(s);
    p.fatherBells = nextFatherCost(s, p);
    endTurns(s, 1);
    expect(p.fathers).toContain(pick);
    expect(p.currentFather).toBeNull();
  });

  it('lets computer players choose fathers by themselves', () => {
    const s = game();
    const ai = s.players[1];
    ai.fatherBells = 10_000;
    endTurns(s, 1);
    expect(ai.fathers.length).toBe(1);
  });

  it('applies Thomas Jefferson to liberty bell production', () => {
    const s = game();
    const c = colony(s);
    for (let i = 0; i < 3; i++) {
      const u = addWorker(s, c, 'elderStatesman');
      applyCommand(s, { type: 'assignJob', unitId: u.id, colonyId: c.id, job: { kind: 'building', building: 'townHall' } });
    }
    const before = colonyReport(s, c).produced.bells;
    s.players[0].fathers.push('thomasJefferson');
    expect(colonyReport(s, c).produced.bells).toBeGreaterThan(before);
  });
});

describe('schools', () => {
  it('turns a servant into a free colonist under an expert teacher', () => {
    const s = game();
    const c = colony(s);
    c.buildings.schoolhouse = 1;
    c.goods.food = 100;
    const teacher = createUnit(s, 'england', 'expertFarmer', { kind: 'map', x: c.x, y: c.y });
    expect(applyCommand(s, { type: 'assignJob', unitId: teacher.id, colonyId: c.id, job: { kind: 'building', building: 'schoolhouse' } }).ok).toBe(true);
    const student = addWorker(s, c, 'indenturedServant');
    endTurns(s, 4);
    expect(s.units[student.id].type).toBe('freeColonist');
  });

  it('only lets a university hold the most advanced teachers', () => {
    const s = game();
    const c = colony(s);
    c.buildings.schoolhouse = 1;
    const statesman = createUnit(s, 'england', 'elderStatesman', { kind: 'map', x: c.x, y: c.y });
    const r = applyCommand(s, { type: 'assignJob', unitId: statesman.id, colonyId: c.id, job: { kind: 'building', building: 'schoolhouse' } });
    expect(r.ok).toBe(false);
  });
});

describe('natives', () => {
  it('requires native land to be bought or taken before it is worked', () => {
    const s = game();
    const c = colony(s, true);
    const tile = neighbours(s, c.x, c.y).find((n) => nativeLandOwner(s, n.x, n.y))!;
    const owner = nativeLandOwner(s, tile.x, tile.y)!;
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
    const job = { kind: 'tile' as const, x: tile.x, y: tile.y, good: 'food' as const };
    const refused = applyCommand(s, { type: 'assignJob', unitId: u.id, colonyId: c.id, job });
    expect(refused).toEqual({ ok: false, error: expect.stringMatching(/belongs to the/) });
    const tension = owner.tension.england ?? 0;
    expect(applyCommand(s, { type: 'takeLand', x: tile.x, y: tile.y }).ok).toBe(true);
    expect(owner.tension.england).toBeGreaterThan(tension);
    expect(nativeLandOwner(s, tile.x, tile.y)).toBeUndefined();
  });

  it('turns furious tribes hostile and lets them raid', () => {
    const s = game();
    const c = colony(s);
    const st = Object.values(s.settlements).sort((a, b) => distance(a.x, a.y, c.x, c.y) - distance(b.x, b.y, c.x, c.y))[0];
    st.x = c.x + 3 < s.map.width ? c.x + 3 : c.x - 3;
    st.tension.england = 1000;
    c.goods.furs = 100;
    for (let i = 0; i < 40; i++) processNatives(s);
    expect(s.tribes.find((t) => t.id === st.tribe)!.stance.england).toBe('war');
    expect(s.messages.some((m) => /raid/.test(m.text))).toBe(true);
  });

  it('founds a mission with a missionary', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const spot = neighbours(s, st.x, st.y).find((n) => !isWater(tileAt(s, n.x, n.y)))!;
    const m = createUnit(s, 'england', 'firebrandPreacher', { kind: 'map', ...spot });
    m.role = 'missionary';
    m.moves = 3;
    const r = applyCommand(s, { type: 'mission', unitId: m.id, settlementId: st.id });
    expect(r.ok).toBe(true);
    expect(st.mission).toBe('england');
    expect(s.units[m.id]).toBeUndefined();
  });
});

describe('taxes and trade', () => {
  it('boycotts a good when a tax raise is refused, until arrears are paid', () => {
    const s = game();
    const p = s.players[0];
    const c = colony(s);
    c.goods.furs = 80;
    p.pendingTax = { rate: 5, good: 'furs' };
    expect(applyCommand(s, { type: 'answerTax', accept: false }).ok).toBe(true);
    expect(p.boycotts.furs).toBe(true);
    expect(c.goods.furs).toBe(0);
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    ship.loc = { kind: 'europe' };
    ship.cargo = { furs: 100 };
    expect(applyCommand(s, { type: 'sellGoods', carrierId: ship.id, good: 'furs', amount: 100 }).ok).toBe(false);
    p.gold = 10_000;
    expect(applyCommand(s, { type: 'payArrears', good: 'furs' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'sellGoods', carrierId: ship.id, good: 'furs', amount: 100 }).ok).toBe(true);
  });

  it('sells exports through a custom house', () => {
    const s = game();
    const p = s.players[0];
    const c = colony(s);
    c.buildings.customHouse = 1;
    c.goods.cloth = 90;
    applyCommand(s, { type: 'setExport', colonyId: c.id, good: 'cloth', on: true });
    const gold = p.gold;
    endTurns(s, 1);
    expect(c.goods.cloth).toBeLessThanOrEqual(55);
    expect(p.gold).toBeGreaterThan(gold);
  });
});

describe('treasure', () => {
  it('comes from burned cities and can be shipped home by the Crown for half', () => {
    const s = game(7);
    const c = colony(s);
    const p = s.players[0];
    const t = createUnit(s, 'england', 'treasure', { kind: 'map', x: c.x, y: c.y });
    t.treasure = 1000;
    const coastal = neighbours(s, c.x, c.y).some((n) => isWater(tileAt(s, n.x, n.y)));
    const gold = p.gold;
    const r = applyCommand(s, { type: 'cashTreasure', unitId: t.id });
    expect(r.ok).toBe(coastal);
    if (coastal) expect(p.gold).toBe(gold + 500);
  });
});

describe('war of independence', () => {
  it('needs half the colonists to be rebels', () => {
    const s = game();
    colony(s);
    expect(applyCommand(s, { type: 'declareIndependence' }).ok).toBe(false);
  });

  it('brings the Royal Expeditionary Force and resolves the war', () => {
    const s = game();
    const c = colony(s);
    for (let i = 0; i < 3; i++) {
      const soldier = createUnit(s, 'england', 'veteranSoldier', { kind: 'map', x: c.x, y: c.y });
      soldier.role = 'soldier';
      soldier.state = 'fortified';
    }
    c.buildings.stockade = 2;
    c.goods.muskets = 300;
    c.liberty = 10_000;
    expect(rebelShare(s, 'england')).toBe(100);
    const r = applyCommand(s, { type: 'declareIndependence' });
    expect(r.ok).toBe(true);
    expect(s.players.some((p) => p.id === 'crown')).toBe(true);
    const p = s.players[0];
    expect(p.independence).toBe('declared');
    let landed = false;
    for (let i = 0; i < 60 && p.independence === 'declared'; i++) {
      endTurns(s, 1);
      landed ||= Object.values(s.units).some((u) => u.owner === 'crown');
    }
    expect(landed).toBe(true);
    expect(['won', 'lost']).toContain(p.independence);
    expect(s.gameOver).toBeDefined();
    deserialize(serialize(s));
  });
});

describe('game end and saves', () => {
  it('ends in 1850 with scores', () => {
    const s = game();
    colony(s);
    s.turn = 108 + 2 * (1850 - 1600);
    endTurns(s, 1);
    expect(s.gameOver?.scores.england).toBeGreaterThan(0);
  });

  it('upgrades Alpha 0.1 saves', () => {
    const s = game();
    const old = JSON.parse(serialize(s));
    old.version = 1;
    for (const p of old.players) {
      for (const k of ['fathers', 'fatherOffer', 'currentFather', 'fatherBells', 'boycotts', 'pendingTax', 'independence', 'ref', 'warSince']) delete p[k];
    }
    for (const st of Object.values(old.settlements) as Record<string, unknown>[]) delete st.tension;
    const upgraded = migrate(old);
    expect(upgraded.version).toBe(2);
    expect(upgraded.players[0].fathers).toEqual([]);
    expect(Object.keys(upgraded.players[0].fatherOffer).length).toBe(5);
  });
});
