/**
 * Read-only summaries for the advisor reports (the web shell's Reports screen). Nothing here
 * changes the game. Each helper looks at one nation and, where it matters, only at what that
 * nation knows: settlements it has explored, and its own colonies, units and ships.
 */
import { buildTargetCost } from './colony.js';
import { defencePower } from './combat.js';
import { buyPrice, sellPrice } from './europe.js';
import { nextFatherCost } from './fathers.js';
import { rebelShare } from './independence.js';
import { settlementName, tensionLabel, tensionOf } from './natives.js';
import { colonyReport, foodToGrow, libertyBonus, type ColonyReport } from './production.js';
import { colonyAt, colonyWorkers, distance, isShip, player, unitName, unitPosition, unitsAboard, unitsAt, warehouseCapacity } from './queries.js';
import { favouredPartners } from './relations.js';
import { BUILDINGS } from './rules/buildings.js';
import { FATHERS, type FatherId } from './rules/fathers.js';
import { GOODS, type GoodId } from './rules/goods.js';
import { TRIBES, type NationId, type TribeId } from './rules/nations.js';
import { TERRAIN } from './rules/terrain.js';
import { ROLES, UNIT_TYPES, type UnitTypeId } from './rules/units.js';
import { ledgerFor } from './history.js';
import type { Colony, GameState, Settlement, Unit } from './types.js';

// ---- Colonies ----

export interface WarehouseLine {
  good: GoodId;
  amount: number;
  /** Change by the end of this turn. */
  net: number;
  /** Units that would spoil at the end of this turn (more than the warehouse holds). */
  spoil: number;
}

export interface ColonyOverview {
  colony: Colony;
  report: ColonyReport;
  population: number;
  /** Sons of Liberty membership in percent. */
  sol: number;
  /** Production bonus per worker from liberty, less the Tory penalty. */
  bonus: number;
  food: { stored: number; net: number; toGrow: number; turnsToGrow: number | null; starving: boolean };
  build: { name: string; hammers: number; hammersNeeded: number; tools: number; toolsNeeded: number; turns: number | null; needsTools: boolean } | null;
  capacity: number;
  /** Stored goods except food, largest first. */
  warehouse: WarehouseLine[];
  /** Goods that will spoil at the end of the turn, or are within a turn of it. */
  atRisk: GoodId[];
  defence: { soldiers: number; artillery: number; strength: number; fortification: string | null };
}

/** Turns until a colony's current build is done, or null when it would never finish as things stand. */
export function buildTurns(colony: Colony, report: ColonyReport): number | null {
  if (!colony.build) return null;
  const cost = buildTargetCost(colony.build, colony);
  const hammers = Math.max(0, cost.hammers - colony.hammers);
  const tools = Math.max(0, cost.tools - colony.goods.tools);
  const perTurn = report.produced.hammers;
  let turns = hammers === 0 ? 1 : perTurn > 0 ? Math.ceil(hammers / perTurn) : Infinity;
  if (tools > 0) {
    const toolsPerTurn = report.net.tools;
    turns = Math.max(turns, toolsPerTurn > 0 ? Math.ceil(tools / toolsPerTurn) : Infinity);
  }
  return Number.isFinite(turns) ? turns : null;
}

export function colonyOverview(s: GameState, colony: Colony): ColonyOverview {
  const report = colonyReport(s, colony);
  const population = report.population;
  const cap = warehouseCapacity(colony);
  const warehouse: WarehouseLine[] = GOODS.filter((g) => g !== 'food' && (colony.goods[g] > 0 || report.net[g] > 0))
    .map((g) => ({ good: g, amount: colony.goods[g], net: report.net[g], spoil: Math.max(0, colony.goods[g] + report.net[g] - cap) }))
    .sort((a, b) => b.amount - a.amount);
  // At risk: spoiling this turn, or full enough that one more turn of production spoils it.
  const atRisk = warehouse.filter((w) => w.spoil > 0 || (w.net > 0 && w.amount + 2 * w.net > cap)).map((w) => w.good);
  const toGrow = foodToGrow(colony);
  const netFood = report.net.food;
  const build = colony.build ? buildTargetCost(colony.build, colony) : null;
  const guards = unitsAt(s, colony.x, colony.y).filter((u) => u.owner === colony.owner && !isShip(u));
  const soldiers = guards.filter((u) => u.role === 'soldier' || u.role === 'dragoon').length;
  const artillery = guards.filter((u) => UNIT_TYPES[u.type].kind === 'artillery').length;
  const strength = guards.reduce((best, u) => Math.max(best, defencePower(s, u)), 0);
  const level = colony.buildings.stockade;
  return {
    colony,
    report,
    population,
    sol: report.sonsOfLiberty,
    bonus: libertyBonus(s, colony, population),
    food: {
      stored: colony.goods.food,
      net: netFood,
      toGrow,
      turnsToGrow: netFood > 0 ? Math.max(1, Math.ceil((toGrow - colony.goods.food) / netFood)) : null,
      starving: netFood < 0 && colony.goods.food + netFood < 0,
    },
    build: build && {
      name: build.name,
      hammers: colony.hammers,
      hammersNeeded: build.hammers,
      tools: colony.goods.tools,
      toolsNeeded: build.tools,
      turns: buildTurns(colony, report),
      needsTools: build.tools > colony.goods.tools && report.net.tools <= 0,
    },
    capacity: cap,
    warehouse,
    atRisk,
    defence: { soldiers, artillery, strength: Math.round(strength * 10) / 10, fortification: level > 0 ? BUILDINGS.stockade.levels[level - 1].name : null },
  };
}

/** Every colony of a nation, with its overview, in founding order. */
export function coloniesOverview(s: GameState, nation: NationId): ColonyOverview[] {
  return Object.values(s.colonies)
    .filter((c) => c.owner === nation)
    .sort((a, b) => a.founded - b.founded || a.id.localeCompare(b.id))
    .map((c) => colonyOverview(s, c));
}

// ---- Trade ----

export interface TradeRow {
  good: GoodId;
  /** Sell and buy price in each port the nation may trade in: its own first, then Favoured Nation partners'. */
  prices: { port: NationId; sell: number; buy: number; tax: number }[];
  boycotted: boolean;
  /** Units sold in Europe (custom house sales included), over the game, this turn and last turn. */
  sold: { total: number; now: number; last: number };
  /** Units sold by custom houses over the game. */
  custom: number;
  exportedBy: number;
  /** Units trade routes unloaded in the nation's colonies, over the game. */
  delivered: number;
  /** Units sold at trade partners' colonies, over the game. */
  foreign: number;
  /** Units in the nation's warehouses now. */
  stored: number;
}

export function tradeOverview(s: GameState, nation: NationId): TradeRow[] {
  const p = player(s, nation);
  const ports = [p, ...favouredPartners(s, nation).map((n) => player(s, n))];
  const ledger = ledgerFor(s, nation);
  const colonies = Object.values(s.colonies).filter((c) => c.owner === nation);
  return GOODS.map((g) => ({
    good: g,
    prices: ports.map((q) => ({ port: q.id, sell: sellPrice(q, g), buy: buyPrice(q, g), tax: q.tax })),
    boycotted: !!p.boycotts[g],
    sold: { total: ledger.total.europe[g] ?? 0, now: ledger.now.europe[g] ?? 0, last: ledger.last.europe[g] ?? 0 },
    custom: ledger.total.custom[g] ?? 0,
    exportedBy: colonies.filter((c) => c.buildings.customHouse > 0 && c.exports[g]).length,
    delivered: ledger.total.route[g] ?? 0,
    foreign: ledger.total.foreign[g] ?? 0,
    stored: colonies.reduce((n, c) => n + c.goods[g], 0),
  }));
}

// ---- Military and naval ----

export type ForceKind = 'soldier' | 'dragoon' | 'artillery' | 'scout' | 'pioneer' | 'missionary' | 'colonist' | 'wagon' | 'treasure';

export interface ForceUnit {
  unit: Unit;
  name: string;
  kind: ForceKind;
  /** Where the unit is, in words. */
  where: string;
  /** The colony it stands in, if any. */
  colonyId?: string;
  at?: { x: number; y: number };
}

function forceKind(u: Unit): ForceKind {
  const kind = UNIT_TYPES[u.type].kind;
  if (kind === 'artillery') return 'artillery';
  if (kind === 'wagon') return 'wagon';
  if (kind === 'treasure') return 'treasure';
  if (u.role === 'none') return 'colonist';
  return u.role;
}

function whereIs(s: GameState, u: Unit): { where: string; colonyId?: string; at?: { x: number; y: number } } {
  switch (u.loc.kind) {
    case 'europe':
      return { where: 'In Europe' };
    case 'sailing':
      return { where: u.loc.to === 'europe' ? 'Sailing to Europe' : 'Sailing to the New World' };
    case 'carrier': {
      const ship = s.units[u.loc.carrierId];
      const at = ship && unitPosition(s, ship);
      return { where: ship ? `Aboard the ${unitName(ship)}` : 'Aboard ship', at };
    }
    default: {
      const at = unitPosition(s, u);
      const colony = at && colonyAt(s, at.x, at.y);
      if (colony && colony.owner === u.owner) return { where: colony.name, colonyId: colony.id, at };
      return { where: 'In the field', at };
    }
  }
}

/** A nation's land units outside colony work (soldiers, pioneers, scouts, wagon trains and the rest). */
export function landForces(s: GameState, nation: NationId): ForceUnit[] {
  return Object.values(s.units)
    .filter((u) => u.owner === nation && !isShip(u) && u.loc.kind !== 'colony')
    .map((u) => ({ unit: u, name: unitName(u), kind: forceKind(u), ...whereIs(s, u) }));
}

/** Combined attack strength, as in the Progress Graphs' military statistic. */
export function militaryStrength(units: Unit[]): number {
  return units.reduce((n, u) => n + (UNIT_TYPES[u.type].kind === 'colonist' ? ROLES[u.role].offence : UNIT_TYPES[u.type].offence), 0);
}

/**
 * The Royal Expeditionary Force a nation faces: the troops still waiting in Europe and those
 * already landed against it. Null when the state holds no such figures.
 */
export function royalForces(s: GameState, nation: NationId): { regulars: number; dragoons: number; artillery: number; menOfWar: number; landed: number } | null {
  const ref = player(s, nation).ref as Partial<Record<'regulars' | 'dragoons' | 'artillery' | 'menOfWar', number>> | undefined;
  if (!ref) return null;
  const landed = Object.values(s.units).filter((u) => u.owner === 'crown' && u.against === nation).length;
  return { regulars: ref.regulars ?? 0, dragoons: ref.dragoons ?? 0, artillery: ref.artillery ?? 0, menOfWar: ref.menOfWar ?? 0, landed };
}

export interface ShipOverview {
  unit: Unit;
  name: string;
  where: string;
  at?: { x: number; y: number };
  holds: number;
  used: number;
  cargo: { good: GoodId; amount: number }[];
  passengers: Unit[];
  /** Orders in words: route, destination, repair or none. */
  orders: string;
  repair: number | null;
}

export function navalOverview(s: GameState, nation: NationId): ShipOverview[] {
  return Object.values(s.units)
    .filter((u) => u.owner === nation && isShip(u))
    .map((u) => {
      const passengers = unitsAboard(s, u);
      const cargo = GOODS.filter((g) => (u.cargo?.[g] ?? 0) > 0).map((g) => ({ good: g, amount: u.cargo![g]! }));
      const used = passengers.reduce((n, p) => n + (p.type === 'treasure' ? UNIT_TYPES[u.type].cargo : 1), 0) + cargo.reduce((n, c) => n + Math.ceil(c.amount / 100), 0);
      const route = u.route && s.routes?.[u.route.id];
      let orders = 'No orders';
      if (u.repair) orders = `Under repair, ${u.repair} turn${u.repair > 1 ? 's' : ''} left`;
      else if (route) orders = `Route: ${route.name}`;
      else if (u.loc.kind === 'sailing') orders = `Arrives in ${u.loc.turnsLeft} turn${u.loc.turnsLeft > 1 ? 's' : ''}`;
      else if (u.dest) orders = 'europe' in u.dest ? 'Bound for Europe' : `Going to ${u.dest.x},${u.dest.y}`;
      else if (u.state === 'sentry') orders = 'Sentry';
      const w = whereIs(s, u);
      return { unit: u, name: unitName(u), where: w.where, at: w.at, holds: UNIT_TYPES[u.type].cargo, used, cargo, passengers, orders, repair: u.repair ?? null };
    });
}

// ---- Religion ----

export interface ReligionOverview {
  crossesPerTurn: number;
  crosses: number;
  crossesRequired: number;
  /** Turns until the next immigrant at the current rate, or null when no crosses are made. */
  turnsToImmigrant: number | null;
  /** Crosses per colony, for colonies that make any. */
  colonies: { colony: Colony; crosses: number }[];
  /** Known settlements with a mission, by tribe: own missions and rivals'. */
  missions: { tribe: TribeId; own: number; rival: Partial<Record<NationId, number>> }[];
  converts: number;
  /** Immigration stops after independence is declared. */
  closed: boolean;
}

export function religionOverview(s: GameState, nation: NationId): ReligionOverview {
  const p = player(s, nation);
  const colonies = Object.values(s.colonies)
    .filter((c) => c.owner === nation)
    .map((c) => ({ colony: c, crosses: colonyReport(s, c).produced.crosses }))
    .filter((r) => r.crosses > 0)
    .sort((a, b) => b.crosses - a.crosses);
  const perTurn = colonies.reduce((n, r) => n + r.crosses, 0);
  const left = Math.max(0, p.crossesRequired - p.crosses);
  const byTribe = new Map<TribeId, { tribe: TribeId; own: number; rival: Partial<Record<NationId, number>> }>();
  for (const st of knownSettlementList(s, nation)) {
    if (!st.mission) continue;
    const row = byTribe.get(st.tribe) ?? { tribe: st.tribe, own: 0, rival: {} };
    if (st.mission === nation) row.own++;
    else row.rival[st.mission] = (row.rival[st.mission] ?? 0) + 1;
    byTribe.set(st.tribe, row);
  }
  return {
    crossesPerTurn: perTurn,
    crosses: p.crosses,
    crossesRequired: p.crossesRequired,
    turnsToImmigrant: left === 0 ? 1 : perTurn > 0 ? Math.ceil(left / perTurn) : null,
    colonies,
    missions: [...byTribe.values()],
    converts: Object.values(s.units).filter((u) => u.owner === nation && u.type === 'nativeConvert').length,
    closed: p.independence !== 'none',
  };
}

// ---- Natives ----

function knownSettlementList(s: GameState, nation: NationId): Settlement[] {
  const explored = player(s, nation).explored;
  return Object.values(s.settlements).filter((st) => explored[st.y * s.map.width + st.x] === 1);
}

export interface SettlementOverview {
  settlement: Settlement;
  name: string;
  tension: number;
  mood: string;
  /** Skill taught, once a scout of the nation has visited; undefined when not known yet, null when taught. */
  skill: UnitTypeId | null | undefined;
  /** Goods the settlement wants most, once visited (the settlement's own list if it has one, else its tribe's). */
  wants: GoodId[] | undefined;
  mission?: NationId;
  visited: boolean;
  /** Land around the settlement claimed by the nation, by others, and still native. */
  land: { own: number; others: number; native: number };
  /** Distance to the nation's nearest colony, or null with none. */
  nearestColony: number | null;
}

export interface TribeOverview {
  tribe: TribeId;
  atWar: boolean;
  /** Average tension of the known settlements. */
  tension: number;
  settlements: SettlementOverview[];
  /** Settlements of the tribe the nation knows (the tribe may have more it has not found). */
  known: number;
}

/**
 * The tribes a nation has met and their settlements it knows: those on tiles it has explored.
 * What a settlement teaches and wants is only known after the nation's scout has visited it.
 */
export function nativesOverview(s: GameState, nation: NationId): TribeOverview[] {
  const known = knownSettlementList(s, nation);
  const colonies = Object.values(s.colonies).filter((c) => c.owner === nation);
  const out: TribeOverview[] = [];
  for (const tribe of s.tribes) {
    const mine = known.filter((st) => st.tribe === tribe.id);
    if (!mine.length) continue;
    const settlements = mine.map((st): SettlementOverview => {
      const visited = st.visited.includes(nation);
      const land = { own: 0, others: 0, native: 0 };
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = st.x + dx;
          const y = st.y + dy;
          if (x < 0 || y < 0 || x >= s.map.width || y >= s.map.height) continue;
          const t = s.map.tiles[y * s.map.width + x];
          if (t && !TERRAIN[t.t].water) {
            if (t.claim === nation) land.own++;
            else if (t.claim) land.others++;
            else land.native++;
          }
        }
      }
      const own = (st as Settlement & { wants?: GoodId[] }).wants;
      const t = tensionOf(st, nation);
      return {
        settlement: st,
        name: settlementName(st),
        tension: t,
        mood: tensionLabel(t),
        skill: visited ? st.skill : undefined,
        wants: visited ? (own ?? TRIBES[st.tribe].wants) : undefined,
        mission: st.mission,
        visited,
        land,
        nearestColony: colonies.length ? Math.min(...colonies.map((c) => distance(c.x, c.y, st.x, st.y))) : null,
      };
    });
    out.push({
      tribe: tribe.id,
      atWar: tribe.stance[nation] === 'war',
      tension: Math.round(settlements.reduce((n, r) => n + r.tension, 0) / settlements.length),
      settlements,
      known: settlements.length,
    });
  }
  return out;
}

// ---- Continental Congress ----

export interface CongressOverview {
  bellsPerTurn: number;
  bells: number;
  rebels: number;
  colonies: { colony: Colony; population: number; sol: number; bonus: number; bells: number }[];
  fathers: FatherId[];
  current: FatherId | null;
  fatherBells: number;
  fatherCost: number;
  /** Turns to the next father at the current rate, or null without bells. */
  turnsToFather: number | null;
}

export function congressOverview(s: GameState, nation: NationId): CongressOverview {
  const p = player(s, nation);
  const colonies = Object.values(s.colonies)
    .filter((c) => c.owner === nation)
    .map((c) => {
      const pop = colonyWorkers(s, c).length;
      const report = colonyReport(s, c);
      return { colony: c, population: pop, sol: report.sonsOfLiberty, bonus: libertyBonus(s, c, pop), bells: report.produced.bells };
    })
    .sort((a, b) => b.sol - a.sol || b.population - a.population);
  const perTurn = colonies.reduce((n, c) => n + c.bells, 0);
  const cost = nextFatherCost(s, p);
  const left = Math.max(0, cost - p.fatherBells);
  return {
    bellsPerTurn: perTurn,
    bells: p.bells,
    rebels: rebelShare(s, nation),
    colonies,
    fathers: [...p.fathers],
    current: p.currentFather,
    fatherBells: p.fatherBells,
    fatherCost: cost,
    turnsToFather: !p.currentFather ? null : left === 0 ? 1 : perTurn > 0 ? Math.ceil(left / perTurn) : null,
  };
}

/** A father's name and effect, for lists. */
export function fatherSummary(id: FatherId): { name: string; category: string; effect: string } {
  const f = FATHERS[id];
  return { name: f.name, category: f.category, effect: f.effect };
}
