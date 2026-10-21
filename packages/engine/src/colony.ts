import { fail } from './errors.js';
import { buildingCapacityPerWorker, colonyReport, foodToGrow, tileYield } from './production.js';
import {
  colonyAt,
  colonyPopulation,
  colonyWorkers,
  createUnit,
  distance,
  isCoastal,
  isWater,
  maxMoves,
  message,
  neighbours,
  newId,
  player,
  reveal,
  settlementAt,
  tileAt,
  tileWorkedBy,
  unitName,
  warehouseCapacity,
} from './queries.js';
import { BUILDINGS, BUILDING_ORDER, type BuildingKind } from './rules/buildings.js';
import { GOOD_DEFS, GOODS, emptyGoods, type GoodId } from './rules/goods.js';
import { NATIONS } from './rules/nations.js';
import { PIONEER_MAX_TOOLS, ROLES, UNIT_TYPES, type RoleId, type UnitTypeId } from './rules/units.js';
import type { BuildTarget, Colony, GameState, Job, Unit } from './types.js';

export function canFoundColony(s: GameState, u: Unit): string | null {
  if (UNIT_TYPES[u.type].kind !== 'colonist') return 'Only colonists can found colonies.';
  if (u.loc.kind !== 'map') return 'The unit must be on land.';
  if (u.moves <= 0) return 'The unit has no moves left this turn.';
  return colonySiteProblem(s, u.loc.x, u.loc.y);
}

/** Why a colony cannot stand on this tile, or null if it can. */
export function colonySiteProblem(s: GameState, x: number, y: number): string | null {
  const tile = tileAt(s, x, y);
  if (!tile || isWater(tile)) return 'Colonies must be founded on land.';
  if (tile.t === 'arctic') return 'Nothing can grow on arctic land.';
  for (const c of Object.values(s.colonies)) {
    if (distance(c.x, c.y, x, y) < 2) return `Too close to ${c.name}.`;
  }
  for (const st of Object.values(s.settlements)) {
    if (distance(st.x, st.y, x, y) < 2) return 'Too close to a native settlement.';
  }
  return null;
}

export function roleGoods(u: Unit): Partial<Record<GoodId, number>> {
  if (u.role === 'pioneer') return { tools: u.tools };
  return { ...ROLES[u.role].goods };
}

/** Moves a unit's equipment into colony storage and makes it a plain colonist. */
export function stripRole(colony: Colony, u: Unit): void {
  for (const [g, n] of Object.entries(roleGoods(u)) as [GoodId, number][]) colony.goods[g] += n;
  u.role = 'none';
  u.tools = 0;
}

export function nextColonyName(s: GameState, nation: Colony['owner']): string {
  const p = player(s, nation);
  const names = NATIONS[nation].colonyNames;
  const used = new Set(Object.values(s.colonies).map((c) => c.name));
  for (let i = 0; i < names.length; i++) {
    const n = names[(p.coloniesFounded + i) % names.length];
    if (!used.has(n)) return n;
  }
  return `${NATIONS[nation].adjective} Colony ${p.coloniesFounded + 1}`;
}

export function foundColony(s: GameState, unitId: string, name?: string): Colony {
  const u = s.units[unitId];
  const reason = canFoundColony(s, u);
  if (reason) fail(reason);
  if (u.loc.kind !== 'map') fail('The unit must be on land.');
  const { x, y } = u.loc;
  const buildings = Object.fromEntries(BUILDING_ORDER.map((k) => [k, BUILDINGS[k].initialLevel])) as Record<BuildingKind, number>;
  const colony: Colony = {
    id: newId(s, 'c'),
    owner: u.owner,
    name: name?.trim() || nextColonyName(s, u.owner),
    x,
    y,
    goods: emptyGoods(),
    buildings,
    build: null,
    hammers: 0,
    liberty: 0,
    founded: s.turn,
  };
  s.colonies[colony.id] = colony;
  const tile = tileAt(s, x, y)!;
  tile.r = true;
  delete tile.lcr;
  player(s, u.owner).coloniesFounded++;
  stripRole(colony, u);
  const job = bestJob(s, colony, u);
  if (!job) fail('There is no work for this colonist here.');
  u.loc = { kind: 'colony', colonyId: colony.id, job };
  u.state = 'active';
  delete u.dest;
  delete u.work;
  colony.build = isCoastal(s, x, y) ? { kind: 'building', id: 'docks' } : { kind: 'building', id: 'stockade' };
  if (!canBuild(s, colony, colony.build)) colony.build = { kind: 'building', id: 'warehouse' };
  reveal(s, u.owner, x, y, 2);
  message(s, `${colony.name} has been founded.`, u.owner, { x, y });
  return colony;
}

/** All jobs open to a unit in a colony, with the amount it would produce. */
export function jobOptions(s: GameState, colony: Colony, u: Unit): { job: Job; amount: number }[] {
  const out: { job: Job; amount: number }[] = [];
  for (const p of neighbours(s, colony.x, colony.y)) {
    const worker = tileWorkedBy(s, p.x, p.y);
    if (worker && worker.id !== u.id) continue;
    if (settlementAt(s, p.x, p.y) || colonyAt(s, p.x, p.y)) continue;
    for (const g of GOODS) {
      const amount = tileYield(s, colony, p.x, p.y, g, u.type);
      if (amount > 0) out.push({ job: { kind: 'tile', x: p.x, y: p.y, good: g }, amount });
    }
  }
  for (const kind of BUILDING_ORDER) {
    const def = BUILDINGS[kind];
    if (def.workplaces === 0 || colony.buildings[kind] === 0 || !def.output) continue;
    const here = colonyWorkers(s, colony).filter(
      (w) => w.id !== u.id && w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === kind,
    );
    if (here.length >= def.workplaces) continue;
    out.push({ job: { kind: 'building', building: kind }, amount: buildingCapacityPerWorker(s, colony, kind, u.type) });
  }
  return out;
}

function jobValue(s: GameState, colony: Colony, u: Unit, job: Job, amount: number, foodNet: number): number {
  const product = job.kind === 'tile' ? job.good : BUILDINGS[job.building].output!;
  const expert = UNIT_TYPES[u.type].expertFor === product;
  if (product === 'food') return amount * (foodNet < 2 ? 12 : 3) + (expert ? 20 : 0);
  let value = amount;
  if (product in GOOD_DEFS) value *= GOOD_DEFS[product as GoodId].price;
  if (product === 'hammers') value = amount * 4;
  if (product === 'bells') value = amount * 3;
  if (product === 'crosses') value = amount * 2;
  if (product === 'lumber') {
    const lumberMade = colonyReport(s, colony).produced.lumber;
    value = amount * (lumberMade === 0 ? 4 : 1.5);
  }
  if (job.kind === 'building') {
    const input = BUILDINGS[job.building].input;
    if (input) {
      const r = colonyReport(s, colony);
      const supply = colony.goods[input] + r.net[input];
      if (supply < amount) value *= supply <= 0 ? 0.1 : 0.5;
    }
  }
  if (foodNet < 0) value *= 0.3;
  return value + (expert ? 30 : 0);
}

/** Picks a sensible job for a unit joining a colony. */
export function bestJob(s: GameState, colony: Colony, u: Unit): Job | null {
  const report = colonyReport(s, colony);
  const alreadyIn = u.loc.kind === 'colony' && u.loc.colonyId === colony.id;
  const foodNet = report.net.food - (alreadyIn ? 0 : 2);
  let best: { job: Job; value: number } | null = null;
  for (const opt of jobOptions(s, colony, u)) {
    const value = jobValue(s, colony, u, opt.job, opt.amount, foodNet);
    if (!best || value > best.value) best = { job: opt.job, value };
  }
  return best?.job ?? null;
}

function validateJob(s: GameState, colony: Colony, u: Unit, job: Job): void {
  if (job.kind === 'tile') {
    if (distance(colony.x, colony.y, job.x, job.y) !== 1) fail('That tile is not next to the colony.');
    const worker = tileWorkedBy(s, job.x, job.y);
    if (worker && worker.id !== u.id) fail('Someone already works that tile.');
    if (settlementAt(s, job.x, job.y)) fail('Natives live on that tile.');
    if (colonyAt(s, job.x, job.y)) fail('Another colony stands on that tile.');
    if (isWater(tileAt(s, job.x, job.y)) && colony.buildings.docks === 0) fail('Fishing needs Docks.');
    if (tileYield(s, colony, job.x, job.y, job.good, u.type) <= 0) fail('That tile produces none of that.');
  } else {
    const def = BUILDINGS[job.building];
    if (colony.buildings[job.building] === 0 || def.workplaces === 0) fail('Nobody can work there.');
    const here = colonyWorkers(s, colony).filter(
      (w) => w.id !== u.id && w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === job.building,
    );
    if (here.length >= def.workplaces) fail('That building is full.');
  }
}

export function assignJob(s: GameState, unitId: string, colonyId: string, job?: Job): void {
  const u = s.units[unitId];
  const colony = s.colonies[colonyId];
  if (!u || !colony) fail('No such unit or colony.');
  if (colony.owner !== u.owner) fail('That is not your colony.');
  if (UNIT_TYPES[u.type].kind !== 'colonist') fail('Only colonists can work in a colony.');
  const inside = u.loc.kind === 'colony' && u.loc.colonyId === colonyId;
  const atGate = u.loc.kind === 'map' && u.loc.x === colony.x && u.loc.y === colony.y;
  const docked = u.loc.kind === 'carrier' && (() => {
    const c = s.units[(u.loc as { carrierId: string }).carrierId];
    return c?.loc.kind === 'map' && c.loc.x === colony.x && c.loc.y === colony.y;
  })();
  if (!inside && !atGate && !docked) fail('The colonist must be in the colony.');
  const chosen = job ?? bestJob(s, colony, u);
  if (!chosen) fail('There is no work available.');
  validateJob(s, colony, u, chosen);
  if (!inside) stripRole(colony, u);
  u.loc = { kind: 'colony', colonyId, job: chosen };
  u.state = 'active';
  u.moves = 0;
  delete u.dest;
  delete u.work;
}

export function leaveColony(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'colony') fail('The unit is not working in a colony.');
  const colony = s.colonies[u.loc.colonyId];
  if (colonyPopulation(s, colony) <= 1) fail('The last colonist cannot leave the colony.');
  u.loc = { kind: 'map', x: colony.x, y: colony.y };
  u.moves = maxMoves(u);
}

/** Equips a unit standing in one of its colonies with a role, using goods from the warehouse. */
export function equipInColony(s: GameState, unitId: string, role: RoleId): void {
  const u = s.units[unitId];
  if (UNIT_TYPES[u.type].kind !== 'colonist') fail('Only colonists can be equipped.');
  if (u.loc.kind !== 'map') fail('The unit must be in the colony square.');
  const colony = colonyAt(s, u.loc.x, u.loc.y);
  if (!colony || colony.owner !== u.owner) fail('The unit must be in one of your colonies.');
  const before = { ...colony.goods };
  stripRole(colony, u);
  if (role === 'pioneer') {
    const tools = Math.min(PIONEER_MAX_TOOLS, Math.floor(colony.goods.tools / 20) * 20);
    if (tools < 20) {
      colony.goods = before;
      fail('A pioneer needs at least 20 tools.');
    }
    colony.goods.tools -= tools;
    u.tools = tools;
  } else {
    for (const [g, n] of Object.entries(ROLES[role].goods) as [GoodId, number][]) {
      if (colony.goods[g] < n) {
        colony.goods = before;
        u.role = 'none';
        fail(`Not enough ${GOOD_DEFS[g].name.toLowerCase()} (${n} needed).`);
      }
    }
    for (const [g, n] of Object.entries(ROLES[role].goods) as [GoodId, number][]) colony.goods[g] -= n;
  }
  u.role = role;
}

export function buildTargetCost(target: BuildTarget, colony: Colony): { hammers: number; tools: number; name: string } {
  if (target.kind === 'unit') {
    if (target.id === 'wagonTrain') return { hammers: 40, tools: 0, name: 'Wagon Train' };
    if (target.id === 'artillery') return { hammers: 192, tools: 40, name: 'Artillery' };
    fail('That unit cannot be built in a colony.');
  }
  const level = colony.buildings[target.id];
  const def = BUILDINGS[target.id];
  const next = def.levels[level];
  if (!next) fail('That building is fully upgraded.');
  return { hammers: next.hammers, tools: next.tools, name: next.name };
}

export function canBuild(s: GameState, colony: Colony, target: BuildTarget): boolean {
  const pop = colonyPopulation(s, colony) || 1;
  if (target.kind === 'unit') {
    if (target.id === 'wagonTrain') return true;
    if (target.id === 'artillery') return colony.buildings.armory > 0;
    return false;
  }
  const def = BUILDINGS[target.id];
  const next = def.levels[colony.buildings[target.id]];
  if (!next) return false;
  if (def.coastalOnly && !isCoastal(s, colony.x, colony.y)) return false;
  return pop >= next.minPop;
}

export function buildOptions(s: GameState, colony: Colony): BuildTarget[] {
  const out: BuildTarget[] = [];
  for (const kind of BUILDING_ORDER) {
    const t: BuildTarget = { kind: 'building', id: kind };
    if (canBuild(s, colony, t)) out.push(t);
  }
  for (const id of ['wagonTrain', 'artillery'] as UnitTypeId[]) {
    const t: BuildTarget = { kind: 'unit', id };
    if (canBuild(s, colony, t)) out.push(t);
  }
  return out;
}

export function setBuild(s: GameState, colonyId: string, target: BuildTarget | null): void {
  const colony = s.colonies[colonyId];
  if (target && !canBuild(s, colony, target)) fail('That cannot be built here yet.');
  colony.build = target;
}

export function hurryPrice(s: GameState, colony: Colony): number {
  if (!colony.build) return 0;
  const cost = buildTargetCost(colony.build, colony);
  const hammers = Math.max(0, cost.hammers - colony.hammers);
  const tools = Math.max(0, cost.tools - colony.goods.tools);
  const toolPrice = player(s, colony.owner).market.tools.price + GOOD_DEFS.tools.spread;
  return hammers * 20 + Math.ceil(tools * toolPrice * 1.5);
}

/** Pays gold so the current build completes at the end of the turn. */
export function hurryBuild(s: GameState, colonyId: string): void {
  const colony = s.colonies[colonyId];
  if (!colony.build) fail('Nothing is being built.');
  const price = hurryPrice(s, colony);
  const p = player(s, colony.owner);
  if (p.gold < price) fail(`You need ${price} gold.`);
  const cost = buildTargetCost(colony.build, colony);
  p.gold -= price;
  colony.hammers = Math.max(colony.hammers, cost.hammers);
  colony.goods.tools = Math.max(colony.goods.tools, cost.tools);
}

/** End-of-turn production, growth, building and storage limits for one colony. */
export function processColony(s: GameState, colony: Colony): void {
  const report = colonyReport(s, colony);
  const p = player(s, colony.owner);
  for (const g of GOODS) colony.goods[g] += report.net[g];

  // Horses breed when there is spare food.
  if (colony.goods.horses >= 2 && report.net.food > 0) {
    const gain = Math.min(report.net.food, Math.max(1, Math.floor(colony.goods.horses / 25)));
    colony.goods.horses += gain;
  }

  if (colony.goods.food >= foodToGrow(colony)) {
    colony.goods.food -= foodToGrow(colony);
    createUnit(s, colony.owner, 'freeColonist', { kind: 'map', x: colony.x, y: colony.y });
    message(s, `A new colonist has been born in ${colony.name}.`, colony.owner, colony);
  } else if (colony.goods.food < 0) {
    colony.goods.food = 0;
    const workers = colonyWorkers(s, colony);
    if (workers.length > 1) {
      const victim = workers[workers.length - 1];
      delete s.units[victim.id];
      message(s, `${unitName(victim)} has starved to death in ${colony.name}.`, colony.owner, colony);
    } else {
      message(s, `${colony.name} is starving!`, colony.owner, colony);
    }
  }

  colony.liberty += report.produced.bells;
  p.bells += report.produced.bells;
  p.crosses += report.produced.crosses;
  colony.hammers += report.produced.hammers;

  if (colony.build) {
    const cost = buildTargetCost(colony.build, colony);
    if (colony.hammers >= cost.hammers) {
      if (colony.goods.tools < cost.tools) {
        if (colony.hammers - report.produced.hammers < cost.hammers) {
          message(s, `${colony.name} needs ${cost.tools - colony.goods.tools} more tools to finish the ${cost.name}.`, colony.owner, colony);
        }
        colony.hammers = cost.hammers;
      } else {
        colony.goods.tools -= cost.tools;
        colony.hammers -= cost.hammers;
        if (colony.build.kind === 'building') {
          colony.buildings[colony.build.id]++;
          message(s, `${colony.name} has completed the ${cost.name}.`, colony.owner, colony);
          if (!canBuild(s, colony, colony.build)) colony.build = null;
        } else {
          createUnit(s, colony.owner, colony.build.id, { kind: 'map', x: colony.x, y: colony.y });
          message(s, `${colony.name} has built a ${cost.name}.`, colony.owner, colony);
        }
      }
    }
  }

  const cap = warehouseCapacity(colony);
  for (const g of GOODS) {
    if (g === 'food') continue;
    if (colony.goods[g] > cap) {
      message(s, `${colony.goods[g] - cap} ${GOOD_DEFS[g].name.toLowerCase()} spoiled in ${colony.name}'s warehouse.`, colony.owner, colony);
      colony.goods[g] = cap;
    }
    if (colony.goods[g] < 0) colony.goods[g] = 0;
  }
}
