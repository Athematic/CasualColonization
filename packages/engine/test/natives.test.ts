import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  braveCombat,
  bravesOf,
  colonySiteProblem,
  createGame,
  createUnit,
  describeMove,
  deserialize,
  distance,
  foundColony,
  incitePrice,
  isWater,
  killBrave,
  landPrice,
  maxBraves,
  nativeUnitPrice,
  neighbours,
  pendingDemands,
  processBraves,
  processNatives,
  serialize,
  tileAt,
  type Brave,
  type Colony,
  type GameState,
  type NationId,
  type Settlement,
} from '../src/index.js';
import { resolveRumour, tribalLandOwner } from '../src/rumours.js';

function game(seed = 42, humans: NationId[] = ['england']): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans });
}

const tribeOf = (s: GameState, st: Settlement) => s.tribes.find((t) => t.id === st.tribe)!;

/** A colony for `nation` 2–3 tiles from a settlement, and that settlement. */
function colonyNear(s: GameState, nation: NationId = 'england'): { c: Colony; st: Settlement } {
  for (const st of Object.values(s.settlements)) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = st.x + dx;
        const y = st.y + dy;
        const d = distance(x, y, st.x, st.y);
        if (d < 2 || colonySiteProblem(s, x, y)) continue;
        const u = createUnit(s, nation, 'freeColonist', { kind: 'map', x, y });
        u.moves = 3;
        const c = foundColony(s, u.id, 'Testtown');
        return { c, st };
      }
    }
  }
  throw new Error('no site');
}

/** A land tile next to (x, y) without a colony or settlement. */
function landBeside(s: GameState, x: number, y: number): { x: number; y: number } {
  const n = neighbours(s, x, y).find(
    (p) => !isWater(tileAt(s, p.x, p.y)) && !Object.values(s.colonies).some((c) => c.x === p.x && c.y === p.y) && !Object.values(s.settlements).some((o) => o.x === p.x && o.y === p.y),
  );
  if (!n) throw new Error('no land');
  return n;
}

function brave(s: GameState, st: Settlement, at: { x: number; y: number }, extra: Partial<Brave> = {}): Brave {
  const b: Brave = { id: `bt${Object.keys(bravesOf(s)).length}`, tribe: st.tribe, home: st.id, x: at.x, y: at.y, ...extra };
  bravesOf(s)[b.id] = b;
  return b;
}

describe('braves', () => {
  it('are sent out by settlements, stay few and walk only on land', () => {
    const s = game();
    for (let i = 0; i < 40; i++) processNatives(s);
    const braves = Object.values(s.braves ?? {});
    expect(braves.length).toBeGreaterThan(0);
    for (const st of Object.values(s.settlements)) expect(braves.filter((b) => b.home === st.id).length).toBeLessThanOrEqual(maxBraves(st));
    for (const b of braves) expect(isWater(tileAt(s, b.x, b.y))).toBe(false);
    expect(braves.some((b) => b.x !== s.settlements[b.home].x || b.y !== s.settlements[b.home].y)).toBe(true);
  });

  it('move deterministically', () => {
    const a = game(7, []);
    const b = game(7, []);
    for (let i = 0; i < 30; i++) {
      applyCommand(a, { type: 'endTurn' });
      applyCommand(b, { type: 'endTurn' });
    }
    expect(serialize(a)).toBe(serialize(b));
    expect(Object.keys(a.braves ?? {}).length).toBeGreaterThan(0);
  });

  it('load from saves without braves and start appearing', () => {
    const s = game();
    const old = JSON.parse(serialize(s));
    delete old.braves;
    for (const st of Object.values(old.settlements) as Settlement[]) delete st.braveTimer;
    const loaded = deserialize(JSON.stringify(old));
    processNatives(loaded);
    expect(Object.keys(loaded.braves ?? {}).length).toBeGreaterThan(0);
  });

  it('bring gifts to colonies of tribes that are content', () => {
    const s = game();
    const { c, st } = colonyNear(s);
    st.tension.england = 0;
    const food = c.goods.food;
    brave(s, st, landBeside(s, c.x, c.y), { task: { kind: 'visit', colonyId: c.id, purpose: 'gift' } });
    processBraves(s);
    const gift = s.messages.find((m) => /as a gift/.test(m.text));
    expect(gift).toBeTruthy();
    expect(c.goods.food > food || /bring \d+ (furs|sugar|tobacco|cotton|silver)/.test(gift!.text)).toBe(true);
  });

  it('come to trade: buy wanted goods and offer their own for sale', () => {
    const s = game();
    const { c, st } = colonyNear(s);
    st.tension.england = 0;
    st.gold = 1000;
    for (const g of ['cloth', 'tradeGoods', 'rum', 'cigars', 'coats'] as const) c.goods[g] = 100;
    st.goods = { furs: 80 };
    const gold = s.players[0].gold;
    brave(s, st, landBeside(s, c.x, c.y), { task: { kind: 'visit', colonyId: c.id, purpose: 'trade' } });
    processBraves(s);
    expect(s.players[0].gold).toBeGreaterThan(gold);
    const offer = pendingDemands(s, 'england').find((d) => d.kind === 'offer');
    expect(offer?.good).toBe('furs');
    const before = s.players[0].gold;
    expect(applyCommand(s, { type: 'answerNativeDemand', demandId: offer!.id, accept: true }).ok).toBe(true);
    expect(c.goods.furs).toBe(offer!.amount);
    expect(s.players[0].gold).toBe(before - offer!.price!);
  });

  it('demand tribute from a person, who answers in the briefing', () => {
    const s = game();
    const { c, st } = colonyNear(s);
    st.tension.england = 400;
    c.goods.furs = 120;
    const b = brave(s, st, landBeside(s, c.x, c.y), { task: { kind: 'visit', colonyId: c.id, purpose: 'demand' } });
    processBraves(s);
    const d = pendingDemands(s, 'england')[0];
    expect(d).toMatchObject({ kind: 'demand', good: 'furs', colonyId: c.id });
    expect(b.task?.kind).toBe('wait');
    const tension = st.tension.england!;
    expect(applyCommand(s, { type: 'answerNativeDemand', demandId: d.id, accept: true }).ok).toBe(true);
    expect(c.goods.furs).toBe(120 - d.amount);
    expect(st.tension.england).toBeLessThan(tension);
    expect(pendingDemands(s, 'england')).toHaveLength(0);
    expect(b.task).toBeUndefined();
  });

  it('attack when a demand is refused', () => {
    const s = game();
    const { c, st } = colonyNear(s);
    st.tension.england = 400;
    c.goods.furs = 120;
    brave(s, st, landBeside(s, c.x, c.y), { task: { kind: 'visit', colonyId: c.id, purpose: 'demand' } });
    processBraves(s);
    const d = pendingDemands(s, 'england')[0];
    const tension = st.tension.england!;
    expect(applyCommand(s, { type: 'answerNativeDemand', demandId: d.id, accept: false }).ok).toBe(true);
    expect(st.tension.england).toBeGreaterThan(tension - 31);
    expect(s.messages.some((m) => /refuses the .* demand/.test(m.text))).toBe(true);
    expect(s.messages.some((m) => /beats off an attack|raid|attack/.test(m.text))).toBe(true);
  });

  it('demands on computer players are settled at once', () => {
    const s = game(42, []);
    const { c, st } = colonyNear(s, 'france');
    st.tension.france = 400;
    c.goods.furs = 120;
    brave(s, st, landBeside(s, c.x, c.y), { task: { kind: 'visit', colonyId: c.id, purpose: 'demand' } });
    processBraves(s);
    expect(pendingDemands(s, 'france')).toHaveLength(0);
    expect(s.messages.some((m) => /hands over|refuses the/.test(m.text))).toBe(true);
  });

  it('raid colonies of tribes at war, with the ordinary combat rules', () => {
    const s = game();
    const { c, st } = colonyNear(s);
    tribeOf(s, st).stance.england = 'war';
    st.tension.england = 900;
    for (let i = 0; i < 10; i++) brave(s, st, landBeside(s, c.x, c.y), { task: { kind: 'attack', colonyId: c.id } });
    processBraves(s);
    expect(s.messages.filter((m) => /raid|beats off/.test(m.text)).length).toBeGreaterThan(0);
  });

  it('cost the settlement a brave and raise tension when killed', () => {
    const s = game();
    const { st } = colonyNear(s);
    const b = brave(s, st, landBeside(s, st.x, st.y));
    st.tension.england = 0;
    killBrave(s, b, 'england');
    expect(bravesOf(s)[b.id]).toBeUndefined();
    expect(st.tension.england).toBeGreaterThan(100);
    expect(st.braveTimer).toBeGreaterThan(0);
  });

  it('can be attacked when hostile', () => {
    const s = game();
    const { c, st } = colonyNear(s);
    tribeOf(s, st).stance.england = 'war';
    const spot = landBeside(s, c.x, c.y);
    const b = brave(s, st, spot);
    const soldier = createUnit(s, 'england', 'veteranSoldier', { kind: 'map', x: c.x, y: c.y });
    soldier.role = 'soldier';
    soldier.moves = 3;
    const dir = (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const).find((d) => {
      const o = describeMove(s, soldier.id, d);
      return o.kind === 'attack' && o.braveId === b.id;
    });
    expect(dir).toBeTruthy();
    const r = applyCommand(s, { type: 'attack', unitId: soldier.id, target: { braveId: b.id } });
    expect(r.ok).toBe(true);
    if (/kills/.test(r.ok ? r.text ?? '' : '')) expect(bravesOf(s)[b.id]).toBeUndefined();
  });

  it('take muskets and horses the tribe has bought, and fight harder with them', () => {
    const s = game();
    const { st } = colonyNear(s);
    const spot = landBeside(s, st.x, st.y);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...spot });
    wagon.moves = 6;
    wagon.cargo = { muskets: 100 };
    st.gold = 2000;
    expect(applyCommand(s, { type: 'tradeNatives', unitId: wagon.id, settlementId: st.id, good: 'muskets' }).ok).toBe(true);
    expect(st.goods?.muskets).toBe(100);
    st.goods!.horses = 50;
    const b = brave(s, st, { x: st.x, y: st.y });
    st.braveTimer = 99;
    processBraves(s);
    expect(b.armed).toBe(true);
    expect(b.mounted).toBe(true);
    expect(braveCombat(b)).toEqual({ offence: 3, defence: 3, moves: 4 });
    expect(braveCombat({})).toEqual({ offence: 1, defence: 1, moves: 1 });
  });
});

describe('buying from natives', () => {
  it('lets a wagon train buy a settlement’s goods once per visit, besides one sale', () => {
    const s = game();
    const { st } = colonyNear(s);
    const spot = landBeside(s, st.x, st.y);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...spot });
    wagon.moves = 6;
    wagon.cargo = { cloth: 100 };
    st.goods = { furs: 80, silver: 40 };
    const p = s.players[0];
    p.gold = 5000;
    const price = nativeUnitPrice(st, 'furs', 'england') * 80;
    expect(applyCommand(s, { type: 'buyNatives', unitId: wagon.id, settlementId: st.id, good: 'furs' }).ok).toBe(true);
    expect(wagon.cargo.furs).toBe(80);
    expect(p.gold).toBe(5000 - price);
    expect(st.goods.furs).toBe(0);
    expect(applyCommand(s, { type: 'buyNatives', unitId: wagon.id, settlementId: st.id, good: 'silver' }).ok).toBe(false);
    // The sale is still allowed in the same visit.
    expect(applyCommand(s, { type: 'tradeNatives', unitId: wagon.id, settlementId: st.id, good: 'cloth' }).ok).toBe(true);
    expect(applyCommand(s, { type: 'tradeNatives', unitId: wagon.id, settlementId: st.id }).ok).toBe(false);
  });

  it('asks more when the tribe is tense, and settlements gather goods from their land', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    st.goods = { furs: 10 };
    st.tension.england = 0;
    const calm = nativeUnitPrice(st, 'silver', 'england');
    st.tension.england = 900;
    expect(nativeUnitPrice(st, 'silver', 'england')).toBeGreaterThan(calm);
    for (let i = 0; i < 30; i++) processNatives(s);
    expect(Object.values(s.settlements).some((o) => Object.values(o.goods ?? {}).some((n) => (n ?? 0) > 0))).toBe(true);
  });
});

describe('burial grounds', () => {
  function tribalTile(s: GameState) {
    const st = Object.values(s.settlements)[0];
    return { st, at: landBeside(s, st.x, st.y) };
  }

  it('happen only on tribal land, more often on harder levels', () => {
    const count = (difficulty: 'discoverer' | 'viceroy') => {
      const s = createGame({ seed: 3, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], difficulty });
      const { at } = tribalTile(s);
      let n = 0;
      for (let i = 0; i < 1500; i++) {
        for (const t of s.tribes) delete t.burial;
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', ...at });
        resolveRumour(s, u);
        if (s.tribes.some((t) => t.burial?.length)) n++;
        delete s.units[u.id];
      }
      return n;
    };
    expect(count('viceroy')).toBeGreaterThan(count('discoverer'));
    expect(count('discoverer')).toBeGreaterThan(0);
    const s = game();
    let far: { x: number; y: number } | undefined;
    for (let i = 0; i < s.map.tiles.length && !far; i++) {
      const x = i % s.map.width;
      const y = Math.floor(i / s.map.width);
      if (!isWater(tileAt(s, x, y)) && !tribalLandOwner(s, x, y)) far = { x, y };
    }
    for (let i = 0; i < 500; i++) {
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', ...far! });
      resolveRumour(s, u);
      delete s.units[u.id];
    }
    expect(s.tribes.some((t) => t.burial?.length)).toBe(false);
  });

  it('put the tribe at war for good', () => {
    const s = game();
    const { st, at } = tribalTile(s);
    let guard = 0;
    while (!tribeOf(s, st).burial?.length && guard++ < 5000) {
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', ...at });
      resolveRumour(s, u);
      delete s.units[u.id];
    }
    const tribe = tribeOf(s, st);
    expect(tribe.burial).toEqual(['england']);
    expect(tribe.stance.england).toBe('war');
    for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) o.tension.england = 0;
    for (let i = 0; i < 5; i++) processNatives(s);
    expect(tribe.stance.england).toBe('war');
    expect(st.tension.england).toBeGreaterThanOrEqual(800);
  });
});

describe('surrender', () => {
  it('may follow the burning of a capital: peace, no anger, a tribute and free land', () => {
    let surrendered = 0;
    let fought = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = game(seed);
      const capital = Object.values(s.settlements).find((st) => st.capital && Object.values(s.settlements).some((o) => o.tribe === st.tribe && !o.capital));
      if (!capital) continue;
      capital.defenders = 1;
      const spot = landBeside(s, capital.x, capital.y);
      let guard = 0;
      while (s.settlements[capital.id] && guard++ < 50) {
        const art = createUnit(s, 'england', 'artillery', { kind: 'map', ...spot });
        art.moves = 3;
        applyCommand(s, { type: 'attack', unitId: art.id, target: { settlementId: capital.id } });
      }
      if (s.settlements[capital.id]) continue;
      const tribe = tribeOf(s, capital);
      const rest = Object.values(s.settlements).filter((o) => o.tribe === capital.tribe);
      if (tribe.submitted?.includes('england')) {
        surrendered++;
        expect(tribe.stance.england).toBe('peace');
        for (const o of rest) expect(o.tension.england).toBe(0);
        const tile = landBeside(s, rest[0].x, rest[0].y);
        expect(landPrice(s, 'england', tile.x, tile.y)).toBe(0);
      } else fought++;
    }
    expect(surrendered).toBeGreaterThan(0);
    expect(fought).toBeGreaterThan(0);
  });
});

describe('missionaries', () => {
  function setup() {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const spot = landBeside(s, st.x, st.y);
    const m = createUnit(s, 'england', 'firebrandPreacher', { kind: 'map', ...spot });
    m.role = 'missionary';
    m.moves = 3;
    return { s, st, m };
  }

  it('denounce a rival mission, which may be expelled', () => {
    let expelled = 0;
    for (let i = 0; i < 20; i++) {
      const { s, st, m } = setup();
      s.rng += i * 7919;
      st.mission = 'france';
      const r = applyCommand(s, { type: 'denounce', unitId: m.id, settlementId: st.id });
      expect(r.ok).toBe(true);
      if (!st.mission) expelled++;
    }
    expect(expelled).toBeGreaterThan(0);
    expect(expelled).toBeLessThan(20);
    const { s, st, m } = setup();
    expect(applyCommand(s, { type: 'denounce', unitId: m.id, settlementId: st.id }).ok).toBe(false);
  });

  it('incite a tribe against a rival for gold', () => {
    const { s, st, m } = setup();
    const p = s.players[0];
    p.gold = 5000;
    st.tension.france = 500;
    const price = incitePrice(st);
    const r = applyCommand(s, { type: 'incite', unitId: m.id, settlementId: st.id, nation: 'france' });
    expect(r.ok).toBe(true);
    expect(p.gold).toBe(5000 - price);
    expect(st.tension.france).toBeGreaterThanOrEqual(800);
    expect(tribeOf(s, st).stance.france).toBe('war');
    expect(applyCommand(s, { type: 'incite', unitId: m.id, settlementId: st.id, nation: 'england' }).ok).toBe(false);
  });
});
