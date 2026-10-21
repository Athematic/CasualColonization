import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buyPrice,
  colonySiteProblem,
  createGame,
  createUnit,
  deserialize,
  favouredUnlocked,
  findPath,
  foundColony,
  HOSTILITY_YEARS,
  isCoastal,
  isFavoured,
  isWater,
  isHostile,
  makeFavoured,
  makeTradeAgreement,
  OLD_SAVE_MESSAGE,
  PEACE_YEARS,
  relation,
  relationKey,
  routesBetween,
  sellPrice,
  serialize,
  startWar,
  tileAt,
  turnAfterYears,
  WAITING_YEARS,
  warehouseCapacity,
  yearValue,
  type AiLevel,
  type Colony,
  type GameState,
  type NationId,
  type RouteStop,
} from '../src/index.js';
import { runAi } from '../src/ai/index.js';

function game(opts: { seed?: number; humans?: NationId[]; ai?: AiLevel } = {}): GameState {
  const s = createGame({
    seed: opts.seed ?? 42,
    mapSize: 'small',
    nations: ['england', 'france'],
    humans: opts.humans ?? ['england'],
    ai: { france: opts.ai ?? 'competent' },
  });
  for (const p of s.players) p.explored.fill(1);
  return s;
}

function found(s: GameState, owner: NationId, x: number, y: number, name: string): Colony {
  const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
  u.moves = 3;
  return foundColony(s, u.id, name);
}

/** An English and a French colony 3–5 tiles apart on the same land, both on the coast. */
function neighbours(s: GameState): [Colony, Colony] {
  const ok = (x: number, y: number) => {
    if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) return false;
    const t = tileAt(s, x, y)!.t;
    return t !== 'hills' && t !== 'mountains';
  };
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (!ok(x, y)) continue;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const bx = x + dx;
          const by = y + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 3 || !ok(bx, by)) continue;
          const probe = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x, y });
          const path = findPath(s, probe, bx, by);
          delete s.units[probe.id];
          if (!path || path.length > 7) continue;
          return [found(s, 'england', x, y, 'Plymouth'), found(s, 'france', bx, by, 'Québec')];
        }
      }
    }
  }
  throw new Error('no sites');
}

/** A land tile next to a colony, free of other colonies. */
function besideLand(s: GameState, c: Colony): { x: number; y: number } {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(s, c.x + dx, c.y + dy);
      if ((dx || dy) && t && !isWater(t)) return { x: c.x + dx, y: c.y + dy };
    }
  }
  throw new Error('no land beside');
}

function ok(s: GameState, cmd: Parameters<typeof applyCommand>[1]) {
  const r = applyCommand(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

function route(s: GameState, name: string, stops: RouteStop[]): string {
  return ok(s, { type: 'createRoute', name, stops }).id!;
}

/** Makes the relation ready for Favoured Nation: a long peace and enough active routes. */
function ripen(s: GameState, a: Colony, b: Colony) {
  const rel = relation(s, 'england', 'france');
  rel.peaceSince = 0;
  s.turn = Math.max(s.turn, rel.peaceNeeded + 1);
  rel.volume = 1000;
  for (let i = 0; i < rel.routesNeeded; i++) {
    const id = route(s, `Run ${i}`, [{ at: a.id, load: [], unload: [] }, { at: b.id, load: [], unload: [] }]);
    const w = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: a.x, y: a.y });
    w.route = { id, stop: 0 };
  }
}

describe('relations between European nations', () => {
  it('draws hidden thresholds per pair from the seed, within the agreed ranges', () => {
    const a = game({ seed: 7 });
    const b = game({ seed: 7 });
    expect(a.relations).toEqual(b.relations);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame({ seed, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: [] });
      expect(Object.keys(s.relations).length).toBe(3);
      for (const rel of Object.values(s.relations)) {
        expect(rel.peaceNeeded).toBeGreaterThanOrEqual(PEACE_YEARS.base - PEACE_YEARS.spread);
        expect(rel.peaceNeeded).toBeLessThanOrEqual(PEACE_YEARS.base + PEACE_YEARS.spread);
        expect(rel.routesNeeded).toBeGreaterThanOrEqual(2);
        expect(rel.routesNeeded).toBeLessThanOrEqual(4);
        seen.add(rel.peaceNeeded);
      }
    }
    // The draws vary between seeds.
    expect(seen.size).toBeGreaterThan(2);
  });

  it('uses its own random stream, leaving the game’s random numbers alone', () => {
    const s = game({ seed: 11 });
    const key = relationKey('england', 'france');
    const before = { ...s.relations[key] };
    const rng = s.rng;
    delete s.relations[key];
    expect(relation(s, 'france', 'england')).toEqual(before);
    expect(s.rng).toBe(rng);
  });

  it('counts years of peace in game years', () => {
    expect(yearValue(turnAfterYears(0, 10))).toBe(1502);
    expect(yearValue(turnAfterYears(110, 10)) - yearValue(110)).toBe(10);
  });
});

describe('trade agreements and foreign colony stops', () => {
  it('lets a route sell to and buy from a partner’s colony, moving gold and goods', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    const fr = s.players[1];
    const en = s.players[0];
    // No agreement yet: no stop at a French colony.
    expect(applyCommand(s, { type: 'createRoute', name: 'x', stops: [{ at: home.id, load: [], unload: [] }, { at: quebec.id, load: [], unload: [] }] }).ok).toBe(false);
    const r = ok(s, { type: 'proposeTrade', nation: 'france' });
    expect(r.text).toMatch(/trade agreement/);
    expect(relation(s, 'england', 'france').trade).toBe(true);

    fr.gold = 10_000;
    quebec.goods.furs = 0;
    quebec.goods.sugar = 120;
    const id = route(s, 'Fur run', [
      { at: quebec.id, unload: [{ good: 'furs' }], load: [{ good: 'sugar' }] },
      { at: home.id, unload: [], load: [] },
    ]);
    const spot = besideLand(s, quebec);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...spot });
    wagon.cargo = { furs: 150 };
    wagon.moves = 6;
    const enGold = en.gold;
    const furPrice = sellPrice(fr, 'furs');
    const sugarPrice = buyPrice(fr, 'sugar');
    ok(s, { type: 'assignRoute', unitId: wagon.id, routeId: id });
    // Only what fits in the warehouse is sold, at the French home-market price, with no tax.
    const cap = warehouseCapacity(quebec);
    expect(quebec.goods.furs).toBe(cap);
    expect(wagon.cargo.furs).toBe(150 - cap);
    // Surplus sugar above 50 is bought at the French buy price.
    expect(quebec.goods.sugar).toBe(50);
    expect(wagon.cargo.sugar).toBe(70);
    expect(en.gold).toBe(enGold + cap * furPrice - 70 * sugarPrice);
    expect(fr.gold).toBe(10_000 - cap * furPrice + 70 * sugarPrice);
    expect(relation(s, 'england', 'france').volume).toBe(cap * furPrice + 70 * sugarPrice);
    expect(routesBetween(s, 'england', 'france')).toBe(1);
  });

  it('lets a ship sell at a partner’s coastal colony from the water next to it', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    makeTradeAgreement(s, 'england', 'france');
    s.players[1].gold = 10_000;
    quebec.goods.cloth = 0;
    let water: { x: number; y: number } | undefined;
    for (let dy = -1; dy <= 1 && !water; dy++) for (let dx = -1; dx <= 1 && !water; dx++) if ((dx || dy) && isWater(tileAt(s, quebec.x + dx, quebec.y + dy))) water = { x: quebec.x + dx, y: quebec.y + dy };
    const ship = createUnit(s, 'england', 'caravel', { kind: 'map', ...water! });
    ship.cargo = { cloth: 60 };
    ship.moves = 12;
    const id = route(s, 'Cloth run', [{ at: quebec.id, unload: [{ good: 'cloth' }], load: [] }, { at: home.id, unload: [], load: [] }]);
    const gold = s.players[0].gold;
    const price = sellPrice(s.players[1], 'cloth');
    ok(s, { type: 'assignRoute', unitId: ship.id, routeId: id });
    expect(quebec.goods.cloth).toBe(60);
    expect(s.players[0].gold).toBe(gold + 60 * price);
  });

  it('skips the sale with a report when the colony’s owner cannot pay', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    makeTradeAgreement(s, 'england', 'france');
    s.players[1].gold = 0;
    quebec.goods.furs = 0;
    const id = route(s, 'Fur run', [{ at: quebec.id, unload: [{ good: 'furs' }], load: [] }, { at: home.id, unload: [], load: [] }]);
    const wagon = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...besideLand(s, quebec) });
    wagon.cargo = { furs: 50 };
    wagon.moves = 6;
    const gold = s.players[0].gold;
    ok(s, { type: 'assignRoute', unitId: wagon.id, routeId: id });
    expect(quebec.goods.furs).toBe(0);
    expect(s.players[0].gold).toBe(gold);
    expect(s.messages.some((m) => /could not pay/.test(m.text) && m.to === 'england')).toBe(true);
  });

  it('lets a computer player refuse while hostile, and accept otherwise', () => {
    const s = game();
    const rel = relation(s, 'england', 'france');
    rel.hostileUntil = s.turn + 20;
    expect(ok(s, { type: 'proposeTrade', nation: 'france' }).text).toMatch(/turns down/);
    expect(rel.trade).toBeUndefined();
    delete rel.hostileUntil;
    ok(s, { type: 'proposeTrade', nation: 'france' });
    expect(rel.trade).toBe(true);
  });
});

describe('Favoured Nation', () => {
  it('can only be proposed once years of peace and trade routes reach the thresholds', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    expect(applyCommand(s, { type: 'proposeFavoured', nation: 'france' }).ok).toBe(false);
    ok(s, { type: 'proposeTrade', nation: 'france' });
    const rel = relation(s, 'england', 'france');
    // Long peace but no routes.
    s.turn = rel.peaceNeeded + 2;
    expect(favouredUnlocked(s, 'england', 'france')).toBe(false);
    const r = applyCommand(s, { type: 'proposeFavoured', nation: 'france' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not yet close enough/);
    ripen(s, home, quebec);
    // Routes but too short a peace.
    rel.peaceSince = s.turn - 1;
    expect(favouredUnlocked(s, 'england', 'france')).toBe(false);
    rel.peaceSince = 0;
    expect(favouredUnlocked(s, 'england', 'france')).toBe(true);
    ok(s, { type: 'proposeFavoured', nation: 'france' });
    expect(isFavoured(s, 'england', 'france')).toBe(true);
  });

  it('trades in the partner’s port at its market and tax rate, without its boycotts', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    const en = s.players[0];
    const fr = s.players[1];
    fr.tax = 20;
    en.tax = 0;
    fr.boycotts.furs = true;
    fr.market.furs.price = 9;
    en.market.furs.price = 3;
    const ship = createUnit(s, 'england', 'merchantman', { kind: 'europe', port: 'france' });
    ship.cargo = { furs: 100 };
    const gold = en.gold;
    const volume = fr.market.furs.volume;
    ok(s, { type: 'sellGoods', carrierId: ship.id, good: 'furs', amount: 100 });
    expect(en.gold).toBe(gold + 900 - 180);
    // The French market moves, the English one does not.
    expect(fr.market.furs.price < 9 || fr.market.furs.volume !== volume).toBe(true);
    expect(en.market.furs).toEqual({ price: 3, volume: 0 });
    // Buying uses French prices too.
    const g2 = en.gold;
    const toolPrice = buyPrice(fr, 'tools');
    ok(s, { type: 'buyGoods', carrierId: ship.id, good: 'tools', amount: 100 });
    expect(en.gold).toBe(g2 - 100 * toolPrice);
    // Colonists stay aboard: only the home port takes them ashore or sends recruits.
    const colonist = createUnit(s, 'england', 'freeColonist', { kind: 'carrier', carrierId: ship.id });
    expect(applyCommand(s, { type: 'unboard', unitId: colonist.id }).ok).toBe(false);
  });

  it('sells merchant ships, but no warships or artillery, in the partner’s port', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    s.players[0].gold = 50_000;
    // A ship must be there first.
    expect(applyCommand(s, { type: 'train', unitType: 'caravel', port: 'france' }).ok).toBe(false);
    createUnit(s, 'england', 'caravel', { kind: 'europe', port: 'france' });
    for (const t of ['frigate', 'privateer', 'artillery', 'expertFarmer'] as const) {
      expect(applyCommand(s, { type: 'train', unitType: t, port: 'france' }).ok).toBe(false);
    }
    ok(s, { type: 'train', unitType: 'merchantman', port: 'france' });
    const bought = Object.values(s.units).filter((u) => u.type === 'merchantman' && u.owner === 'england');
    expect(bought.length).toBe(1);
    expect(bought[0].loc).toEqual({ kind: 'europe', port: 'france' });
    // Not a partner: no port.
    expect(applyCommand(s, { type: 'train', unitType: 'merchantman', port: 'spain' }).ok).toBe(false);
  });

  it('lets ships choose the partner’s port when sailing to Europe, and tracks the port', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    const at = s.players[0].entry;
    ship.loc = { kind: 'map', x: at.x, y: at.y };
    ship.moves = 12;
    expect(applyCommand(s, { type: 'sailToEurope', unitId: ship.id, port: 'france' }).ok).toBe(false);
    makeFavoured(s, 'england', 'france');
    ok(s, { type: 'sailToEurope', unitId: ship.id, port: 'france' });
    expect(ship.loc).toMatchObject({ kind: 'sailing', to: 'europe', port: 'france' });
    for (let i = 0; i < 4 && (ship.loc as { kind: string }).kind === 'sailing'; i++) ok(s, { type: 'endTurn' });
    expect(ship.loc).toEqual({ kind: 'europe', port: 'france' });
    expect(s.messages.some((m) => /port of La Rochelle/.test(m.text))).toBe(true);
  });

  it('cancelling seizes goods near the other side’s colonies, ends routes and starts waiting and hostility', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    ok(s, { type: 'proposeTrade', nation: 'france' });
    ripen(s, home, quebec);
    ok(s, { type: 'proposeFavoured', nation: 'france' });
    // An English wagon next to Québec, a French wagon next to Plymouth, an English one far away.
    const near = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...besideLand(s, quebec) });
    near.cargo = { furs: 60 };
    const theirs = createUnit(s, 'france', 'wagonTrain', { kind: 'map', ...besideLand(s, home) });
    theirs.cargo = { sugar: 40 };
    const far = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x: home.x, y: home.y });
    far.cargo = { ore: 30 };
    quebec.goods.furs = 0;
    home.goods.sugar = 0;
    const routed = Object.values(s.units).filter((u) => u.route);
    expect(routed.length).toBeGreaterThan(0);

    const r = ok(s, { type: 'cancelFavoured', nation: 'france' });
    expect(r.text).toMatch(/cancelled/);
    const rel = relation(s, 'england', 'france');
    expect(rel.favoured).toBeUndefined();
    expect(rel.trade).toBeUndefined();
    expect(near.cargo.furs).toBeUndefined();
    expect(quebec.goods.furs).toBe(60);
    expect(theirs.cargo.sugar).toBeUndefined();
    expect(home.goods.sugar).toBe(40);
    expect(far.cargo.ore).toBe(30);
    // Routes lose their French stops; left with one stop, their units wait for orders.
    for (const route of Object.values(s.routes!)) expect(route.stops.every((st) => s.colonies[st.at]?.owner !== 'france')).toBe(true);
    for (const u of routed) expect(u.route).toBeUndefined();
    expect(routesBetween(s, 'england', 'france')).toBe(0);
    // Hidden waiting and hostility within the agreed ranges.
    const years = (t: number) => yearValue(t) - yearValue(s.turn);
    expect(years(rel.waitUntil!)).toBeGreaterThanOrEqual(WAITING_YEARS.base - WAITING_YEARS.spread);
    expect(years(rel.waitUntil!)).toBeLessThan(WAITING_YEARS.base + WAITING_YEARS.spread + 1);
    expect(years(rel.hostileUntil!)).toBeGreaterThanOrEqual(HOSTILITY_YEARS.base - HOSTILITY_YEARS.spread);
    expect(years(rel.hostileUntil!)).toBeLessThan(HOSTILITY_YEARS.base + HOSTILITY_YEARS.spread + 1);
    expect(isHostile(s, 'france', 'england')).toBe(true);
    // No new agreement while waiting; the computer refuses while hostile.
    expect(applyCommand(s, { type: 'proposeTrade', nation: 'france' }).ok).toBe(false);
    rel.waitUntil = s.turn;
    rel.hostileUntil = s.turn + 10;
    expect(ok(s, { type: 'proposeTrade', nation: 'france' }).text).toMatch(/turns down/);
    // No route stops at French colonies either.
    expect(applyCommand(s, { type: 'createRoute', name: 'y', stops: [{ at: home.id, load: [], unload: [] }, { at: quebec.id, load: [], unload: [] }] }).ok).toBe(false);
  });

  it('sends ships in the other side’s port home when cancelled', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    const ship = createUnit(s, 'england', 'caravel', { kind: 'europe', port: 'france' });
    ok(s, { type: 'cancelFavoured', nation: 'france' });
    expect(ship.loc).toEqual({ kind: 'europe' });
  });

  it('lapses without penalties when a partner declares independence', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    makeFavoured(s, 'england', 'france');
    const near = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...besideLand(s, quebec) });
    near.cargo = { furs: 60 };
    const visitor = createUnit(s, 'france', 'caravel', { kind: 'europe', port: 'england' });
    home.liberty = 10_000;
    ok(s, { type: 'declareIndependence' });
    const rel = relation(s, 'england', 'france');
    expect(rel.favoured).toBeUndefined();
    expect(rel.trade).toBe(true);
    expect(rel.waitUntil).toBeUndefined();
    expect(rel.hostileUntil).toBeUndefined();
    expect(near.cargo.furs).toBe(60);
    expect(visitor.loc).toEqual({ kind: 'europe' });
    expect(s.messages.some((m) => /has lapsed/.test(m.text))).toBe(true);
  });

  it('war declared by a person on a partner counts as a cancellation', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    ok(s, { type: 'declareWar', nation: 'france' });
    expect(isFavoured(s, 'england', 'france')).toBe(false);
    expect(isHostile(s, 'england', 'france')).toBe(true);
  });
});

describe('Favoured Nation between two people (hot seat)', () => {
  it('can be agreed at any time, and revoking seizes goods without waiting or hostility', () => {
    const s = game({ humans: ['england', 'france'] });
    const [, quebec] = neighbours(s);
    ok(s, { type: 'proposeFavoured', nation: 'france' });
    const rel = relation(s, 'england', 'france');
    expect(rel.proposal).toEqual({ kind: 'favoured', from: 'england', turn: s.turn });
    expect(isFavoured(s, 'england', 'france')).toBe(false);
    // France answers on its own turn.
    expect(applyCommand(s, { type: 'answerProposal', nation: 'england', accept: true }).ok).toBe(false);
    ok(s, { type: 'endTurn' });
    expect(s.players[s.current].id).toBe('france');
    ok(s, { type: 'answerProposal', nation: 'england', accept: true });
    expect(isFavoured(s, 'england', 'france')).toBe(true);
    expect(rel.trade).toBe(true);

    const near = createUnit(s, 'england', 'wagonTrain', { kind: 'map', ...besideLand(s, quebec) });
    near.cargo = { furs: 60 };
    ok(s, { type: 'cancelFavoured', nation: 'england' });
    expect(near.cargo.furs).toBeUndefined();
    expect(rel.waitUntil).toBeUndefined();
    expect(rel.hostileUntil).toBeUndefined();
    // They can agree again straight away.
    ok(s, { type: 'proposeFavoured', nation: 'england' });
    expect(rel.proposal?.from).toBe('france');
  });

  it('a refused proposal leaves things as they were', () => {
    const s = game({ humans: ['england', 'france'] });
    ok(s, { type: 'proposeTrade', nation: 'france' });
    ok(s, { type: 'endTurn' });
    ok(s, { type: 'answerProposal', nation: 'england', accept: false });
    const rel = relation(s, 'england', 'france');
    expect(rel.trade).toBeUndefined();
    expect(rel.proposal).toBeUndefined();
    expect(s.messages.some((m) => m.to === 'england' && /turns down/.test(m.text))).toBe(true);
  });
});

describe('computer players and Favoured Nation', () => {
  it('never declare war on, or attack, a nation they favour', () => {
    const s = game({ ai: 'combative' });
    const [home] = neighbours(s);
    makeFavoured(s, 'england', 'france');
    expect(() => startWar(s, 'france', 'england')).toThrow(/never declare war/);
    // A strong French army next to a weak English colony, late enough for wars.
    s.turn = 120;
    const spot = besideLand(s, home);
    for (let i = 0; i < 8; i++) {
      const u = createUnit(s, 'france', 'artillery', { kind: 'map', ...spot });
      u.moves = 3;
    }
    const fr = s.players[1];
    for (let i = 0; i < 6; i++) {
      for (const u of Object.values(s.units)) if (u.owner === 'france') u.moves = 3;
      runAi(s, fr);
      expect(fr.stance.england).not.toBe('war');
    }
    expect(home.owner).toBe('england');
  });

  it('treat a nation that broke a Favoured Nation agreement as a likely target', () => {
    const s = game({ ai: 'competent' });
    const [home] = neighbours(s);
    s.turn = 120;
    makeFavoured(s, 'england', 'france');
    ok(s, { type: 'cancelFavoured', nation: 'france' });
    // Even a Competent player, which never starts wars otherwise, attacks a hostile weak neighbour.
    const spot = besideLand(s, home);
    for (let i = 0; i < 8; i++) createUnit(s, 'france', 'artillery', { kind: 'map', ...spot }).moves = 3;
    runAi(s, s.players[1]);
    expect(s.players[1].stance.england).toBe('war');
  });
});

describe('saves', () => {
  it('keep relations and ports, and refuse saves from before 0.4', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    createUnit(s, 'england', 'caravel', { kind: 'europe', port: 'france' });
    const loaded = deserialize(serialize(s));
    expect(loaded.relations).toEqual(s.relations);
    expect(Object.values(loaded.units).some((u) => u.loc.kind === 'europe' && u.loc.port === 'france')).toBe(true);
    const old = JSON.parse(serialize(s));
    old.version = 2;
    expect(() => deserialize(JSON.stringify(old))).toThrow(OLD_SAVE_MESSAGE);
  });
});
