/**
 * Port character (rules/ports.ts): each home port's own prices, depth of market and ship prices;
 * and trade routes whose Europe stop calls at a Favoured Nation partner's port.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  cancelFavoured,
  colonySiteProblem,
  createGame,
  createUnit,
  foundColony,
  GOOD_DEFS,
  GOODS,
  HOME_PORTS,
  isCoastal,
  makeFavoured,
  marketElasticity,
  NATION_ORDER,
  PORT_CHARACTER,
  portBasePrice,
  portSummary,
  recoverMarkets,
  runRoute,
  sellToMarket,
  stopPort,
  tileAt,
  trainPrice,
  type Colony,
  type GameState,
  type GoodId,
  type NationId,
  type PortEntry,
  type RouteStop,
} from '../src/index.js';
import { routePort } from '../src/ai/logistics.js';

function game(nations = NATION_ORDER.slice(0, 4)): GameState {
  const s = createGame({ seed: 42, mapSize: 'small', nations, humans: ['england'], ai: { france: 'competent' } });
  for (const p of s.players) p.explored.fill(1);
  return s;
}

function coastalColony(s: GameState): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) continue;
      const t = tileAt(s, x, y)!.t;
      if (t === 'hills' || t === 'mountains') continue;
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id, 'Plymouth');
    }
  }
  throw new Error('no site');
}

describe('port character', () => {
  it('gives each home port its own starting prices', () => {
    const s = game(NATION_ORDER);
    const market = (n: string) => s.players.find((p) => p.id === n)!.market;
    expect(market('netherlands').tobacco.price).toBe(GOOD_DEFS.tobacco.price + 1);
    expect(market('netherlands').cloth.price).toBe(GOOD_DEFS.cloth.price - 1);
    expect(market('france').coats.price).toBe(GOOD_DEFS.coats.price + 2);
    expect(market('spain').silver.price).toBe(GOOD_DEFS.silver.price + 3);
    expect(market('england').tobacco.price).toBe(GOOD_DEFS.tobacco.price + 1);
    for (const p of s.players) for (const g of GOODS) expect(p.market[g].price).toBe(portBasePrice(p.id, g));
  });

  it('keeps the differences moderate, in the shape of the scenario nation entry', () => {
    for (const [nation, entry] of Object.entries(PORT_CHARACTER) as [NationId, PortEntry][]) {
      expect(entry.name).toBe(HOME_PORTS[nation as keyof typeof HOME_PORTS]);
      const c = entry.market ?? {};
      for (const [g, f] of Object.entries(c.prices ?? {}) as [GoodId, number][]) {
        // Factors within 30%; at most about 30% of the price in gold, and never more than 1 gold on the cheap goods.
        expect(Math.abs(f - 1)).toBeLessThanOrEqual(0.3);
        const d = portBasePrice(nation, g) - GOOD_DEFS[g].price;
        expect(d).not.toBe(0);
        expect(Math.abs(d)).toBeLessThanOrEqual(Math.max(1, Math.round(GOOD_DEFS[g].price * 0.3)));
      }
      for (const m of Object.values(c.depth ?? {})) expect(m).toBeGreaterThanOrEqual(0.5), expect(m).toBeLessThanOrEqual(2);
      expect(c.ships ?? 1).toBeGreaterThanOrEqual(0.85);
      expect(c.ships ?? 1).toBeLessThanOrEqual(1.15);
      expect(c.recovery ?? 1).toBeGreaterThanOrEqual(0.75);
      expect(c.recovery ?? 1).toBeLessThanOrEqual(1.25);
    }
  });

  it('prices ships by port: cheap in Lisbon, dear in Seville', () => {
    const s = game(['england', 'spain', 'portugal']);
    const [en, es, pt] = s.players;
    expect(trainPrice(s, pt, 'merchantman')).toBeLessThan(trainPrice(s, en, 'merchantman'));
    expect(trainPrice(s, es, 'merchantman')).toBeGreaterThan(trainPrice(s, en, 'merchantman'));
    // Colonists and artillery cost the same everywhere.
    expect(trainPrice(s, pt, 'artillery')).toBe(trainPrice(s, en, 'artillery'));
    expect(trainPrice(s, pt, 'expertFarmer')).toBe(trainPrice(s, en, 'expertFarmer'));
  });

  it('a deep market moves its price more slowly, and prices drift back to the port’s own', () => {
    const s = game(['england', 'netherlands']);
    const [en, nl] = s.players;
    expect(marketElasticity(s, nl, 'tradeGoods')).toBe(2 * marketElasticity(s, en, 'tradeGoods'));
    // Buying a deep market's goods raises its price half as often.
    sellToMarket(s, nl, 'tradeGoods', -marketElasticity(s, en, 'tradeGoods') * 2);
    sellToMarket(s, en, 'tradeGoods', -marketElasticity(s, en, 'tradeGoods') * 2);
    expect(nl.market.tradeGoods.price - portBasePrice('netherlands', 'tradeGoods')).toBe(1);
    expect(en.market.tradeGoods.price - portBasePrice('england', 'tradeGoods')).toBe(2);
    // Recovery heads for the port's own resting price.
    nl.market.tobacco.price = 1;
    for (let i = 0; i < 300; i++) recoverMarkets(s);
    expect(nl.market.tobacco.price).toBe(portBasePrice('netherlands', 'tobacco'));
  });

  it('describes each port in a short line', () => {
    expect(portSummary('netherlands')).toBe('Amsterdam: tobacco and furs fetch more; plenty of trade goods; sugar and cloth fetch less');
    expect(portSummary('portugal')).toMatch(/^Lisbon: .*cheap ships/);
    expect(portSummary('england')).toMatch(/plenty of tools/);
    expect(portSummary('crown')).toBe('London');
    for (const n of NATION_ORDER) expect(portSummary(n).length).toBeLessThan(130);
  });
});

describe('routes calling at a partner’s port', () => {
  function setup() {
    const s = game(['england', 'france']);
    const port = coastalColony(s);
    const [en, fr] = s.players;
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    for (const u of Object.values(s.units)) if (u.loc.kind === 'carrier') delete s.units[u.id];
    return { s, port, en, fr, ship };
  }
  const stops = (port: Colony, europe: Partial<RouteStop> = {}): RouteStop[] => [
    { at: port.id, load: [{ good: 'furs' }], unload: [] },
    { at: 'europe', load: [{ good: 'tools', amount: 50 }], unload: [{ good: 'furs' }], passengers: true, ...europe },
  ];

  it('may name a Favoured Nation partner’s port, and only then', () => {
    const { s, port } = setup();
    expect(applyCommand(s, { type: 'createRoute', name: 'To La Rochelle', stops: stops(port, { port: 'france' }) }).ok).toBe(false);
    makeFavoured(s, 'england', 'france');
    const r = applyCommand(s, { type: 'createRoute', name: 'To La Rochelle', stops: stops(port, { port: 'france' }) }) as { ok: true; id?: string };
    expect(r.ok).toBe(true);
    expect(s.routes![r.id!].stops[1].port).toBe('france');
    // Naming the home port stores nothing.
    const home = applyCommand(s, { type: 'createRoute', name: 'Home', stops: stops(port, { port: 'england' }) }) as { ok: true; id?: string };
    expect(s.routes![home.id!].stops[1].port).toBeUndefined();
  });

  it('sells and buys at the partner’s market and tax; colonists board only at home', () => {
    const { s, port, en, fr, ship } = setup();
    makeFavoured(s, 'england', 'france');
    en.tax = 0;
    fr.tax = 20;
    en.boycotts.furs = true;
    const r = applyCommand(s, { type: 'createRoute', name: 'Furs to France', stops: stops(port, { port: 'france' }) }) as { ok: true; id?: string };
    ship.loc = { kind: 'europe' };
    ship.moves = 12;
    ship.cargo = { furs: 100 };
    const colonist = createUnit(s, 'england', 'expertFarmer', { kind: 'europe' });
    expect(applyCommand(s, { type: 'assignRoute', unitId: ship.id, routeId: r.id! }).ok).toBe(true);
    // In the home port it is not at the stop: it sails out to go round to La Rochelle.
    expect(ship.loc.kind).toBe('sailing');
    expect(ship.cargo).toEqual({ furs: 100 });
    // Arriving in La Rochelle.
    ship.loc = { kind: 'europe', port: 'france' };
    ship.route!.stop = 1;
    const furs = fr.market.furs.price;
    const tools = fr.market.tools.price + 1;
    const englishFurs = { ...en.market.furs };
    const gold = en.gold;
    runRoute(s, ship);
    // The English boycott does not apply in the French port.
    expect(en.gold).toBe(gold + 100 * furs - Math.floor((100 * furs * 20) / 100) - 50 * tools);
    expect(en.market.furs).toEqual(englishFurs);
    expect(ship.cargo).toEqual({ tools: 50 });
    expect(colonist.loc).toEqual({ kind: 'europe' });
    expect(s.messages.some((m) => /in La Rochelle/.test(m.text))).toBe(true);
  });

  it('falls back to the home port, with a report, when the partnership ends', () => {
    const { s, port } = setup();
    makeFavoured(s, 'england', 'france');
    const r = applyCommand(s, { type: 'createRoute', name: 'Furs to France', stops: stops(port, { port: 'france' }) }) as { ok: true; id?: string };
    const route = s.routes![r.id!];
    expect(stopPort(s, 'england', route.stops[1])).toBe('france');
    cancelFavoured(s, 'france', 'england');
    expect(route.stops[1].port).toBeUndefined();
    expect(stopPort(s, 'england', route.stops[1])).toBe('england');
    expect(s.messages.some((m) => /Furs to France route now calls at London: La Rochelle is closed/.test(m.text))).toBe(true);
  });

  it('the computer sends a route to a partner’s port when its goods fetch clearly more there', () => {
    const { s, port, en, fr } = setup();
    makeFavoured(s, 'england', 'france');
    port.goods.furs = 300;
    en.tax = 0;
    fr.tax = 0;
    en.market.furs.price = 4;
    fr.market.furs.price = 4;
    const list = stops(port);
    expect(routePort(s, en, list)).toBe('england');
    fr.market.furs.price = 6;
    expect(routePort(s, en, list)).toBe('france');
    // A route already going there stays while the partner pays as well as home.
    fr.market.furs.price = 4;
    expect(routePort(s, en, list, 'france')).toBe('france');
    expect(routePort(s, en, list)).toBe('england');
  });
});
