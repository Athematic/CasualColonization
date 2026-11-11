/**
 * What events do: applying effects, and valuing them in gold for the computer players.
 */
import { addTension } from '../natives.js';
import { colonyWorkers, createUnit, isWater, player, reveal, tileAt, workArea } from '../queries.js';
import { placeOnMap } from '../movement.js';
import { colonyReport } from '../production.js';
import { BUILDINGS, BUILDING_ORDER, type BuildingKind } from '../rules/buildings.js';
import type { GoodId, ProductId } from '../rules/goods.js';
import { portPriceBand } from '../rules/ports.js';
import { TERRAIN } from '../rules/terrain.js';
import { UNIT_TYPES } from '../rules/units.js';
import type { Colony, GameState } from '../types.js';
import type { Effect, EventVars, EventsState, GoodRef, Num } from './types.js';
import { difficultyOf, goodsOf, portMarketOf } from '../scenarios/index.js';

/** What a point of tax is worth to a nation over the rest of a game, in gold (measured against 30-turn outcomes in docs/design/events.md). */
export const TAX_POINT_VALUE = 150;

let roundEnd = false;

/** Runs `fn` as part of the end of a round (processEvents), when this turn's production is done. */
export function atRoundEnd(fn: () => void): void {
  const was = roundEnd;
  roundEnd = true;
  try {
    fn();
  } finally {
    roundEnd = was;
  }
}

export function eventsState(s: GameState): EventsState {
  return (s.events ??= { fired: {}, mods: [], pending: [], queue: [], seq: 0 });
}

export function num(n: Num | undefined, v: EventVars): number {
  if (n === undefined) return 0;
  if (typeof n === 'number') return n;
  return (n === '$cost' ? v.cost : v.amount) ?? 0;
}

function goodOf(g: GoodRef, v: EventVars): GoodId | undefined {
  return g === '$good' ? v.good : g;
}

function colonyOf(s: GameState, v: EventVars): Colony | undefined {
  const c = v.colony ? s.colonies[v.colony] : undefined;
  return c && c.owner === v.nation ? c : undefined;
}

/** Applies effects for a nation. Returns sentences to add to the event's message (from chances). */
export function applyEffects(s: GameState, eventId: string, effects: Effect[], v: EventVars, r: () => number): string[] {
  const out: string[] = [];
  for (const e of effects) {
    const said = applyEffect(s, eventId, e, v, r);
    if (said) out.push(said);
  }
  return out;
}

function applyEffect(s: GameState, eventId: string, e: Effect, v: EventVars, r: () => number): string | void {
  const p = player(s, v.nation);
  const colony = colonyOf(s, v);
  switch (e.kind) {
    case 'gold':
      p.gold = Math.max(0, p.gold + num(e.amount, v));
      return;
    case 'goods': {
      const g = goodOf(e.good, v);
      if (colony && g) colony.goods[g] = Math.max(0, colony.goods[g] + num(e.amount, v));
      return;
    }
    case 'loseGoods': {
      const g = goodOf(e.good, v);
      if (colony && g) colony.goods[g] -= Math.round((colony.goods[g] * e.pct) / 100);
      return;
    }
    case 'production': {
      const nationWide = e.scope === 'nation';
      if (!nationWide && !colony) return;
      const ev = eventsState(s);
      // A modifier runs for `turns` rounds of production: from the next turn when the event fires
      // at the end of a round (every colony has produced this turn), from now when a person
      // answers during their turn.
      ev.mods.push({
        nation: v.nation,
        ...(nationWide ? {} : { colony: colony!.id }),
        ...(e.products ? { products: [...e.products] } : {}),
        pct: e.pct,
        until: s.turn + (roundEnd ? 1 : 0) + e.turns,
        source: eventId,
      });
      return;
    }
    case 'tension': {
      if (!v.tribe) return;
      for (const st of Object.values(s.settlements)) if (st.tribe === v.tribe) addTension(st, v.nation, e.amount);
      return;
    }
    case 'price': {
      const g = goodOf(e.good, v);
      if (!g) return;
      const m = p.market[g];
      const band = portPriceBand(portMarketOf(s, p.id), g);
      const change = e.delta ?? Math.round((m.price * (e.pct ?? 0)) / 100);
      m.price = Math.max(band.min, Math.min(band.max * 2, m.price + change));
      return;
    }
    case 'crosses':
      p.crosses = Math.max(0, p.crosses + num(e.amount, v));
      return;
    case 'tax':
      p.tax = Math.max(0, Math.min(difficultyOf(s, p).taxCeiling, p.tax + e.delta));
      return;
    case 'unit': {
      const type = e.type ?? v.unit;
      if (!type) return;
      if (e.where === 'europe') {
        if (p.independence === 'none' || e.always) createUnit(s, v.nation, type, { kind: 'europe' });
        return;
      }
      if (!colony) return;
      const u = createUnit(s, v.nation, type, { kind: 'map', x: colony.x, y: colony.y });
      placeOnMap(s, u, colony.x, colony.y);
      return;
    }
    case 'damageShip': {
      const ship = v.ship ? s.units[v.ship] : undefined;
      if (!ship || ship.owner !== v.nation) return;
      ship.repair = Math.max(ship.repair ?? 0, e.turns);
      ship.moves = 0;
      delete ship.dest;
      if (ship.cargo) {
        for (const g of Object.keys(ship.cargo) as GoodId[]) ship.cargo[g] = (ship.cargo[g] ?? 0) - Math.round(((ship.cargo[g] ?? 0) * e.cargoPct) / 100);
      }
      return;
    }
    case 'damageBuilding': {
      if (!colony) return;
      const b = v.building;
      if (b && colony.buildings[b] > Math.max(1, BUILDINGS[b].initialLevel)) colony.buildings[b]--;
      else colony.hammers = Math.floor(colony.hammers / 2);
      return;
    }
    case 'bonusResource': {
      if (!colony) return;
      const spots = workArea(s, colony.x, colony.y).filter(({ x, y }) => {
        const t = tileAt(s, x, y);
        return t && !isWater(t) && !t.b && !t.f && TERRAIN[t.t].bonusGood;
      });
      if (!spots.length) return;
      const at = spots[Math.floor(r() * spots.length)];
      tileAt(s, at.x, at.y)!.b = true;
      return;
    }
    case 'chance': {
      if (r() < e.p) return [e.text, ...applyEffects(s, eventId, e.effects, v, r)].filter(Boolean).join(' ');
      return e.elseText;
    }
    case 'followUp':
      eventsState(s).queue.push({ event: e.event, turn: s.turn + e.turns, vars: { ...v } });
      return;
    case 'peaceWithPeoples':
      for (const st of Object.values(s.settlements)) st.tension[p.id] = 0;
      for (const t of s.tribes) {
        t.stance[p.id] = 'peace';
        // The peace holds even with a people whose burial ground was desecrated: the grievance is
        // forgiven, or processNatives would put the people back at war next round (fix e).
        if (t.burial?.includes(p.id)) {
          const rest = t.burial.filter((n) => n !== p.id);
          if (rest.length) t.burial = rest;
          else delete t.burial;
        }
      }
      return;
    case 'stockades':
      for (const c of ownColonies(s, p.id)) if (colonyWorkers(s, c).length >= e.minColonists && c.buildings.stockade === 0) c.buildings.stockade = 1;
      return;
    case 'revealColonies':
      for (const c of Object.values(s.colonies)) reveal(s, p.id, c.x, c.y, e.radius);
      return;
    case 'liberty':
      // 200 bells make one colonist a Son of Liberty (production.ts, sonsOfLiberty).
      for (const c of ownColonies(s, p.id)) c.liberty += Math.round(200 * colonyWorkers(s, c).length * e.share);
      return;
    case 'convertUnits':
      for (const u of Object.values(s.units)) if (u.owner === p.id && u.type === e.from) u.type = e.to;
      return;
    case 'liftBoycotts':
      p.boycotts = {};
      return;
  }
}

/** Rough gold value of one round of a colony's production of the given products (all when missing). */
function productionValue(s: GameState, colony: Colony, products?: ProductId[]): number {
  const p = player(s, colony.owner);
  const report = colonyReport(s, colony);
  let value = 0;
  for (const [k, n] of Object.entries(report.produced) as [ProductId, number][]) {
    if (!n || (products && !products.includes(k))) continue;
    // Hammers, bells and crosses are worth about what a unit of trade goods is.
    const price = (goodsOf(s) as readonly string[]).includes(k) ? p.market[k as GoodId].price : 2;
    value += n * price;
  }
  return value;
}

/**
 * What natives' tension is worth to a nation, as a cost that grows steeply as a tribe nears
 * anger and war (TENSION.angry 600, TENSION.war 800): from a content tribe 80 points cost about
 * 120 gold, on an already angry one several hundred. Positive for tension taken off.
 */
export function tensionCost(tension: number): number {
  return 1.5 * tension + 0.01 * Math.max(0, tension - 300) ** 2;
}

/** The gold value of changing the tension of the event's tribe towards the nation by `amount`. */
export function tensionValue(s: GameState, v: EventVars, amount: number): number {
  const towards = Object.values(s.settlements).filter((st) => st.tribe === v.tribe).map((st) => st.tension[v.nation] ?? 0);
  if (!towards.length) return -amount * 1.5;
  const mean = towards.reduce((n, t) => n + t, 0) / towards.length;
  const after = Math.max(0, Math.min(1000, mean + amount));
  return tensionCost(mean) - tensionCost(after);
}

/**
 * The value of effects to the nation, in gold: how the advanced computer players compare choices.
 * Rough on purpose: a few round numbers that put the effects in a sensible order.
 */
export function valueEffects(s: GameState, effects: Effect[], v: EventVars): number {
  const p = player(s, v.nation);
  const colony = colonyOf(s, v);
  let total = 0;
  for (const e of effects) {
    switch (e.kind) {
      case 'gold':
        total += num(e.amount, v);
        break;
      case 'goods': {
        const g = goodOf(e.good, v);
        if (g) total += num(e.amount, v) * p.market[g].price;
        break;
      }
      case 'loseGoods': {
        const g = goodOf(e.good, v);
        if (g && colony) total -= Math.round((colony.goods[g] * e.pct) / 100) * p.market[g].price;
        break;
      }
      case 'production': {
        const cols = e.scope === 'nation' ? Object.values(s.colonies).filter((c) => c.owner === v.nation) : colony ? [colony] : [];
        for (const c of cols) total += (productionValue(s, c, e.products) * e.pct * e.turns) / 100;
        break;
      }
      case 'tension':
        total += tensionValue(s, v, e.amount);
        break;
      case 'price': {
        const g = goodOf(e.good, v);
        if (!g) break;
        const stock = Object.values(s.colonies).reduce((n, c) => (c.owner === v.nation ? n + c.goods[g] : n), 0);
        const change = e.delta ?? (p.market[g].price * (e.pct ?? 0)) / 100;
        total += stock * change * 0.5;
        break;
      }
      case 'crosses':
        total += num(e.amount, v) * 4;
        break;
      case 'tax':
        // A tax point lasts for the rest of the game and takes a share of every sale in Europe.
        total -= e.delta * TAX_POINT_VALUE;
        break;
      case 'unit': {
        const type = e.type ?? v.unit;
        if (type) total += UNIT_TYPES[type].price ?? 600;
        break;
      }
      case 'damageShip':
        total -= 100 * e.turns;
        break;
      case 'damageBuilding':
        total -= v.building ? BUILDINGS[v.building].levels[Math.max(0, (colony?.buildings[v.building] ?? 1) - 1)].hammers * 4 : 100;
        break;
      case 'bonusResource':
        total += 300;
        break;
      case 'chance':
        total += e.p * valueEffects(s, e.effects, v);
        break;
      case 'followUp':
        break;
      // Council members' effects: rough values, for completeness (computer players choose members by preference).
      case 'peaceWithPeoples':
        for (const st of Object.values(s.settlements)) total += tensionCost(st.tension[v.nation] ?? 0) / 10;
        break;
      case 'stockades':
        total += ownColonies(s, v.nation).filter((c) => c.buildings.stockade === 0 && colonyWorkers(s, c).length >= e.minColonists).length * BUILDINGS.stockade.levels[0].hammers * 4;
        break;
      case 'revealColonies':
        break;
      case 'liberty':
        total += ownColonies(s, v.nation).reduce((n, c) => n + colonyWorkers(s, c).length, 0) * e.share * 400;
        break;
      case 'convertUnits':
        total += Object.values(s.units).filter((u) => u.owner === v.nation && u.type === e.from).length * Math.max(0, (UNIT_TYPES[e.to].price ?? 0) - (UNIT_TYPES[e.from].price ?? 0));
        break;
      case 'liftBoycotts':
        total += Object.keys(p.boycotts).length * 500;
        break;
    }
  }
  return total;
}

/** The highest-level building of a colony above its starting level: what a fire damages. */
export function damageableBuilding(colony: Colony): BuildingKind | undefined {
  let best: BuildingKind | undefined;
  for (const b of BUILDING_ORDER) {
    if (b === 'stockade' || b === 'townHall') continue;
    if ((colony.buildings[b] ?? 0) <= Math.max(1, BUILDINGS[b].initialLevel)) continue;
    if (!best || colony.buildings[b] > colony.buildings[best]) best = b;
  }
  return best;
}

function ownColonies(s: GameState, nation: string): Colony[] {
  return Object.values(s.colonies).filter((c) => c.owner === nation);
}

/** Colonists working in a colony. */
export function population(s: GameState, colony: Colony): number {
  return colonyWorkers(s, colony).length;
}
