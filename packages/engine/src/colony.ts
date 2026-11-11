import { gridOf } from './grid.js';
import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { buildingCapacityPerWorker, centreProduction, colonyReport, foodToGrow, libertyBonus, tileYield, type ColonyReport } from './production.js';
import { kindOfId, systemsOf } from './playerkind.js';
import { noteTaken } from './land.js';
import { claimTownLand, growPeopleTown, isPeopleTown, peopleLandClosedTo, planTownBuild, schoolOf, skillOfWork } from './peopleeconomy.js';
import {
  colonyAt,
  colonyPopulation,
  colonyWorkers,
  createUnit,
  isCoastal,
  isWater,
  maxMoves,
  message,
  workArea,
  newId,
  player,
  reveal,
  settlementAt,
  tileAt,
  tileWorkedBy,
  unitName,
  warehouseCapacity,
} from './queries.js';
import { BUILDINGS, SCHOOL_TEACHERS, TEACH_TURNS } from './rules/buildings.js';
import { GOOD_DEFS, emptyGoods, type GoodId } from './rules/goods.js';
import { TRIBES, type PlayerId } from './rules/nations.js';
import { COLONY_BUILDS, PIONEER_MAX_TOOLS, ROLES, UNIT_TYPES, type RoleId } from './rules/units.js';
import { runCustomHouse } from './europe.js';
import { modifiers } from './scenarios/modifiers.js';
import { noteMining } from './mines.js';
import { noteProduction } from './stats.js';
import { nativeLandClosedTo, onColonyFounded } from './natives.js';
import type { BuildTarget, Colony, GameState, Job, Unit } from './types.js';
import { bornType, buildingsOf, difficultyOf, goodsOf, mechanicsOf, nationOf, newColonyBuildings, unitsOf } from './scenarios/index.js';
import { addColony, setUnitLoc, removeUnit, colonyList } from './unitindex.js';

export function canFoundColony(s: GameState, u: Unit): string | null {
  if (UNIT_TYPES[u.type].kind !== 'colonist') return 'Only colonists can found colonies.';
  if (u.loc.kind !== 'map') return 'The unit must be on land.';
  if (u.moves <= 0) return 'The unit has no moves left this turn.';
  const problem = colonySiteProblem(s, u.loc.x, u.loc.y, u.owner);
  if (problem) return problem;
  const cost = charterCost(s, u.owner);
  if (cost > player(s, u.owner).gold) return `A colony charter costs ${cost} gold.`;
  return null;
}

/**
 * Gold the nation pays the Crown for its next colony under the colony charter rule
 * (`GameConfig.colonyCharter`, the scenario's `mechanics.charter`; the Americas' is COLONY_CHARTER
 * in rules/difficulty.ts): 0 with the rule off or not in the scenario, for the first colony, and
 * once the nation has declared independence (there is no Crown to pay).
 */
export function charterCost(s: GameState, nation: PlayerId): number {
  if (!s.config.colonyCharter) return 0;
  const charter = mechanicsOf(s).charter;
  if (!charter) return 0;
  const p = s.players.find((o) => o.id === nation);
  if (!p || p.independence !== 'none') return 0;
  const held = colonyList(s).filter((c) => c.owner === nation).length;
  if (held === 0) return 0;
  return Math.round(Math.min(charter.cap, charter.base * held) * difficultyOf(s, p).colonyCharter);
}

/**
 * Why a colony cannot stand on this tile, or null if it can. A playing people's claimed land is
 * closed to every founder but that people (`founder`; T5).
 */
export function colonySiteProblem(s: GameState, x: number, y: number, founder?: PlayerId): string | null {
  const grid = gridOf(s);
  const tile = tileAt(s, x, y);
  if (!tile || isWater(tile)) return 'Colonies must be founded on land.';
  if (tile.t === 'arctic') return 'Nothing can grow on arctic land.';
  if (tile.claim && tile.claim !== founder && kindOfId(tile.claim) === 'people') return `This land belongs to ${nationOf(s, tile.claim).name}.`;
  // Most sites have no colony within a tile: the colony index says so without a scan; otherwise
  // the scan names the first colony in record order, as before.
  let near = false;
  const within = grid.withinOffsets(x, y, 1);
  for (let k = 0; k < within.length && !near; k += 2) near = !!colonyAt(s, x + within[k], y + within[k + 1]);
  if (near) {
    for (const id in s.colonies) {
      const c = s.colonies[id];
      if (grid.distance(c.x, c.y, x, y) < 2) return `Too close to ${c.name}.`;
    }
  }
  for (const id in s.settlements) {
    const st = s.settlements[id];
    if (grid.distance(st.x, st.y, x, y) < 2) return 'Too close to a native settlement.';
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
  const names = nationOf(s, nation).colonyNames;
  const used = new Set(colonyList(s).map((c) => c.name));
  for (let i = 0; i < names.length; i++) {
    const n = names[(p.coloniesFounded + i) % names.length];
    if (!used.has(n)) return n;
  }
  return `${nationOf(s, nation).adjective} Colony ${p.coloniesFounded + 1}`;
}

export function foundColony(s: GameState, unitId: string, name?: string): Colony {
  const u = s.units[unitId];
  const reason = canFoundColony(s, u);
  if (reason) fail(reason);
  if (u.loc.kind !== 'map') fail('The unit must be on land.');
  const { x, y } = u.loc;
  const charter = charterCost(s, u.owner);
  if (charter > 0) player(s, u.owner).gold -= charter;
  const buildings = newColonyBuildings(s, u.owner);
  const colony: Colony = {
    id: newId(s, 'c'),
    owner: u.owner,
    name: name?.trim() || nextColonyName(s, u.owner),
    x,
    y,
    goods: emptyGoods(goodsOf(s)),
    buildings,
    build: null,
    hammers: 0,
    liberty: 0,
    founded: s.turn,
    exports: {},
  };
  addColony(s, colony);
  const tile = tileAt(s, x, y)!;
  tile.r = true;
  delete tile.lcr;
  player(s, u.owner).coloniesFounded++;
  stripRole(colony, u);
  const job = bestJob(s, colony, u);
  if (!job) fail('There is no work for this colonist here.');
  setUnitLoc(s, u, { kind: 'colony', colonyId: colony.id, job });
  u.state = 'active';
  delete u.dest;
  delete u.roadTo;
  delete u.work;
  if (isPeopleTown(colony)) {
    // A people's new town claims its land (T5); a computer people's picks its first build.
    claimTownLand(s, colony);
    planTownBuild(s, colony, (t) => canBuild(s, colony, t));
  } else {
    colony.build = isCoastal(s, x, y) ? { kind: 'building', id: 'docks' } : { kind: 'building', id: 'stockade' };
    if (!canBuild(s, colony, colony.build)) colony.build = { kind: 'building', id: 'warehouse' };
  }
  reveal(s, u.owner, x, y, 2);
  onColonyFounded(s, colony);
  track(u.owner, 'cmd:foundColony');
  const paid = charter > 0 ? ` The colony charter cost ${charter} gold.` : '';
  message(s, `${colony.name} has been founded.${paid}`, u.owner, { x, y });
  noteHistory(s, 'colony', [u.owner], `${colony.name} is founded.${paid}`, { secret: true, at: { x, y } });
  return colony;
}

/**
 * Who works around and inside a colony, from the unit indexes (a hot path for the computer
 * players). Valid until a unit changes jobs or moves, or the land around changes.
 */
export interface ColonyOccupancy {
  /** The tiles around the colony, in the grid's `workArea` order. */
  tiles: { x: number; y: number }[];
  /** The unit working each tile around the colony (the first found, as tileWorkedBy), by map index. */
  worked: Map<number, Unit>;
  /** Tiles around the colony nobody can work: a settlement, a colony or native land on them. */
  closed: Set<number>;
  /** Workers in each of the colony's buildings. */
  inBuilding: Map<string, number>;
  /** The colony's population and liberty bonus. */
  pop: number;
  bonus: number;
}

export function colonyOccupancy(s: GameState, colony: Colony): ColonyOccupancy {
  const tiles = workArea(s, colony.x, colony.y);
  const w = s.map.width;
  const closed = new Set<number>();
  const worked = new Map<number, Unit>();
  for (const p of tiles) {
    const i = p.y * w + p.x;
    if (settlementAt(s, p.x, p.y) || colonyAt(s, p.x, p.y) || nativeLandClosedTo(s, colony.owner, p.x, p.y) || peopleLandClosedTo(s, colony.owner, p.x, p.y)) closed.add(i);
    const v = tileWorkedBy(s, p.x, p.y);
    if (v) worked.set(i, v);
  }
  const inBuilding = new Map<string, number>();
  const workers = colonyWorkers(s, colony);
  for (const v of workers) {
    if (v.loc.kind === 'colony' && v.loc.job.kind === 'building') inBuilding.set(v.loc.job.building, (inBuilding.get(v.loc.job.building) ?? 0) + 1);
  }
  const pop = workers.length;
  return { tiles, worked, closed, inBuilding, pop, bonus: libertyBonus(s, colony, pop) };
}

/**
 * All jobs open to a unit in a colony, with the amount it would produce. Pass `occupancy` to reuse
 * one gathered for the colony while nothing has changed.
 */
export function jobOptions(s: GameState, colony: Colony, u: Unit, occupancy = colonyOccupancy(s, colony)): { job: Job; amount: number }[] {
  const out: { job: Job; amount: number }[] = [];
  const { worked, closed, inBuilding, bonus } = occupancy;
  const w = s.map.width;
  for (const p of occupancy.tiles) {
    const i = p.y * w + p.x;
    const worker = worked.get(i);
    if (worker && worker.id !== u.id) continue;
    if (closed.has(i)) continue;
    for (const g of goodsOf(s)) {
      const amount = tileYield(s, colony, p.x, p.y, g, u.type, bonus);
      if (amount > 0) out.push({ job: { kind: 'tile', x: p.x, y: p.y, good: g }, amount });
    }
  }
  // The unit's own place does not count against a building's room.
  const own = u.loc.kind === 'colony' && u.loc.colonyId === colony.id && u.loc.job.kind === 'building' ? u.loc.job.building : null;
  const others = (kind: string) => (inBuilding.get(kind) ?? 0) - (own === kind ? 1 : 0);
  for (const kind of buildingsOf(s, colony.owner)) {
    const def = BUILDINGS[kind];
    if (def.workplaces === 0 || colony.buildings[kind] === 0 || !def.output) continue;
    if (others(kind) >= def.workplaces) continue;
    out.push({ job: { kind: 'building', building: kind }, amount: buildingCapacityPerWorker(s, colony, kind, u.type, bonus) });
  }
  // As canTeachHere.
  const school = schoolOf(s, colony);
  const level = colony.buildings[school];
  const teach = UNIT_TYPES[u.type].teach;
  if (level && teach && teach <= level && others(school) < SCHOOL_TEACHERS[level - 1]) out.push({ job: { kind: 'building', building: school }, amount: 0 });
  return out;
}

/** Whether a colonist could take a teaching place in this colony's school. */
export function canTeachHere(s: GameState, colony: Colony, u: Unit, ignoreId?: string): boolean {
  const school = schoolOf(s, colony);
  const level = colony.buildings[school];
  const teach = UNIT_TYPES[u.type].teach;
  if (!level || !teach || teach > level) return false;
  const teachers = colonyWorkers(s, colony).filter(
    (w) => w.id !== ignoreId && w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === school,
  );
  return teachers.length < SCHOOL_TEACHERS[level - 1];
}

function jobValue(colony: Colony, u: Unit, job: Job, amount: number, foodNet: number, report: ColonyReport): number {
  // Teaching is always a deliberate choice, never an automatic one.
  if (job.kind === 'building' && (job.building === 'schoolhouse' || BUILDINGS[job.building].school)) return -1;
  const product = job.kind === 'tile' ? job.good : BUILDINGS[job.building].output!;
  const expert = UNIT_TYPES[u.type].expertFor === product;
  if (product === 'food') return amount * (foodNet < 2 ? 12 : 3) + (expert ? 20 : 0);
  let value = amount;
  if (product in GOOD_DEFS) value *= GOOD_DEFS[product as GoodId].price;
  if (product === 'hammers') value = amount * 4;
  if (product === 'bells') value = amount * 3;
  if (product === 'crosses') value = amount * 2;
  if (product === 'lumber') {
    value = amount * (report.produced.lumber === 0 ? 4 : 1.5);
  }
  if (job.kind === 'building') {
    const input = BUILDINGS[job.building].input;
    if (input) {
      const supply = colony.goods[input] + report.net[input];
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
    const value = jobValue(colony, u, opt.job, opt.amount, foodNet, report);
    if (!best || value > best.value) best = { job: opt.job, value };
  }
  return best?.job ?? null;
}

function validateJob(s: GameState, colony: Colony, u: Unit, job: Job): void {
  const grid = gridOf(s);
  if (job.kind === 'tile') {
    if (grid.distance(colony.x, colony.y, job.x, job.y) !== 1) fail('That tile is not next to the colony.');
    const worker = tileWorkedBy(s, job.x, job.y);
    if (worker && worker.id !== u.id) fail('Someone already works that tile.');
    if (settlementAt(s, job.x, job.y)) fail('Natives live on that tile.');
    // Native land is worked once bought or taken, or while leased to the colony's nation (N5).
    const owner = nativeLandClosedTo(s, colony.owner, job.x, job.y);
    if (owner) fail(`This land belongs to the ${TRIBES[owner.tribe].name}. ${mechanicsOf(s).peopleTreaties?.includes('land-use') ? 'Buy it, take it or lease it' : 'Buy it or take it'} first.`);
    const people = peopleLandClosedTo(s, colony.owner, job.x, job.y);
    if (people) fail(`This land belongs to ${nationOf(s, people).name}.`);
    if (colonyAt(s, job.x, job.y)) fail('Another colony stands on that tile.');
    if (isWater(tileAt(s, job.x, job.y)) && colony.buildings.docks === 0 && !colony.buildings.canoeLanding) fail(isPeopleTown(colony) ? 'Fishing needs a Canoe Landing.' : 'Fishing needs Docks.');
    if (tileYield(s, colony, job.x, job.y, job.good, u.type) <= 0) fail('That tile produces none of that.');
  } else if (job.building === schoolOf(s, colony)) {
    if (!colony.buildings[job.building]) fail('The colony has no school.');
    const teach = UNIT_TYPES[u.type].teach;
    if (!teach) fail(isPeopleTown(colony) ? 'Only elders teach.' : 'Only experts can teach.');
    if (teach > colony.buildings[job.building]) fail(`Teaching a ${UNIT_TYPES[u.type].name} needs a ${teach === 2 ? 'college' : 'university'}.`);
    if (!canTeachHere(s, colony, u, u.id)) fail('All teaching places are taken.');
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
  if (u.ally) fail('The intervention force does not work in colonies.');
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
  const school = schoolOf(s, colony);
  const wasTeaching = u.loc.kind === 'colony' && u.loc.job.kind === 'building' && u.loc.job.building === school;
  const willTeach = chosen.kind === 'building' && chosen.building === school;
  if (wasTeaching !== willTeach || !willTeach) delete u.teach;
  setUnitLoc(s, u, { kind: 'colony', colonyId, job: chosen });
  u.state = 'active';
  u.moves = 0;
  track(u.owner, 'cmd:assignJob');
  delete u.dest;
  delete u.roadTo;
  delete u.work;
}

export function leaveColony(s: GameState, unitId: string): void {
  const u = s.units[unitId];
  if (u.loc.kind !== 'colony') fail('The unit is not working in a colony.');
  const colony = s.colonies[u.loc.colonyId];
  if (colonyPopulation(s, colony) <= 1) fail('The last colonist cannot leave the colony.');
  setUnitLoc(s, u, { kind: 'map', x: colony.x, y: colony.y });
  u.moves = maxMoves(u, s);
  delete u.teach;
  track(u.owner, 'cmd:leaveColony');
}

/** Equips a unit standing in one of its colonies with a role, using goods from the warehouse. */
export function equipInColony(s: GameState, unitId: string, role: RoleId): void {
  const u = s.units[unitId];
  if (UNIT_TYPES[u.type].kind !== 'colonist') fail('Only colonists can be equipped.');
  if (u.loc.kind !== 'map') fail('The unit must be in the colony square.');
  const colony = colonyAt(s, u.loc.x, u.loc.y);
  if (!colony || colony.owner !== u.owner) fail('The unit must be in one of your colonies.');
  if (role === 'missionary' && colony.buildings.church < 2) fail('Missionaries are commissioned in a colony with a church.');
  if (role === 'missionary' && u.type === 'nativeConvert') fail('Converts cannot become missionaries.');
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
  track(u.owner, 'cmd:equip');
  track(u.owner, `equip:${role}`);
}

export function buildTargetCost(target: BuildTarget, colony: Colony): { hammers: number; tools: number; name: string } {
  if (target.kind === 'unit') {
    const build = COLONY_BUILDS[target.id];
    if (!build) fail('That unit cannot be built in a colony.');
    return { hammers: build.hammers, tools: build.tools, name: UNIT_TYPES[target.id].name };
  }
  const level = colony.buildings[target.id];
  const def = BUILDINGS[target.id];
  const next = def.levels[level];
  if (!next) fail('That building is fully upgraded.');
  return { hammers: next.hammers, tools: next.tools, name: next.name };
}

export function canBuild(s: GameState, colony: Colony, target: BuildTarget): boolean {
  if (target.kind === 'unit') {
    const build = COLONY_BUILDS[target.id];
    if (!build || !unitsOf(s, colony.owner).units.has(target.id)) return false;
    if (build.armory && colony.buildings.armory === 0) return false;
    if (build.needs && !colony.buildings[build.needs]) return false;
    return colony.buildings.docks >= (build.docks ?? 0);
  }
  const def = BUILDINGS[target.id];
  const next = def.levels[colony.buildings[target.id]];
  if (!next) return false;
  if (def.locked && !modifiers(s, colony.owner, 'unlockBuilding').some((m) => m.building === target.id)) return false;
  if (target.id === 'customHouse' && !mechanicsOf(s).customHouse) return false;
  if (def.coastalOnly && !isCoastal(s, colony.x, colony.y)) return false;
  // The population last: counting it takes a look at every unit.
  const pop = colonyPopulation(s, colony) || 1;
  return pop >= next.minPop;
}

export function buildOptions(s: GameState, colony: Colony): BuildTarget[] {
  const out: BuildTarget[] = [];
  for (const kind of buildingsOf(s, colony.owner)) {
    const t: BuildTarget = { kind: 'building', id: kind };
    if (canBuild(s, colony, t)) out.push(t);
  }
  for (const id of unitsOf(s, colony.owner).colonyBuilds) {
    const t: BuildTarget = { kind: 'unit', id };
    if (canBuild(s, colony, t)) out.push(t);
  }
  return out;
}

export function setBuild(s: GameState, colonyId: string, target: BuildTarget | null): void {
  const colony = s.colonies[colonyId];
  if (target && !canBuild(s, colony, target)) fail('That cannot be built here yet.');
  colony.build = target;
  track(colony.owner, 'cmd:setBuild');
}

export function hurryPrice(s: GameState, colony: Colony): number {
  if (!colony.build) return 0;
  const cost = buildTargetCost(colony.build, colony);
  const hammers = Math.max(0, cost.hammers - colony.hammers);
  const tools = Math.max(0, cost.tools - colony.goods.tools);
  const toolPrice = player(s, colony.owner).market.tools.price + GOOD_DEFS.tools.spread;
  return Math.round((hammers * 20 + Math.ceil(tools * toolPrice * 1.5)) * difficultyOf(s, player(s, colony.owner)).hurryCost);
}

/** Pays gold so the current build completes at the end of the turn. */
export function hurryBuild(s: GameState, colonyId: string): void {
  const colony = s.colonies[colonyId];
  if (!colony.build) fail('Nothing is being built.');
  // A people does not buy its builds (T10: gold only for trade with Europeans).
  if (!systemsOf(player(s, colony.owner)).homePort) fail('Your towns build by their own work.');
  const price = hurryPrice(s, colony);
  const p = player(s, colony.owner);
  if (p.gold < price) fail(`You need ${price} gold.`);
  const cost = buildTargetCost(colony.build, colony);
  p.gold -= price;
  track(p.id, 'cmd:hurry');
  colony.hammers = Math.max(colony.hammers, cost.hammers);
  colony.goods.tools = Math.max(colony.goods.tools, cost.tools);
}

/** End-of-turn production, growth, building and storage limits for one colony. */
export function processColony(s: GameState, colony: Colony): void {
  const report = colonyReport(s, colony);
  const p = player(s, colony.owner);
  for (const g of goodsOf(s)) colony.goods[g] += report.net[g];

  // Horses breed when there is spare food.
  if (colony.goods.horses >= 2 && report.net.food > 0) {
    const gain = Math.min(report.net.food, Math.max(1, Math.floor(colony.goods.horses / 25)));
    colony.goods.horses += gain;
  }

  // Land health counts the furs and game taken (land.ts).
  if (s.land?.taken) noteTakenInColony(s, colony, report);
  const town = isPeopleTown(colony);
  if (town) {
    // A people's town: births from food above its reserve, stores and hunger (peopleeconomy.ts).
    growPeopleTown(s, colony);
  } else if (colony.goods.food >= foodToGrow(s, colony)) {
    colony.goods.food -= foodToGrow(s, colony);
    createUnit(s, colony.owner, bornType(s, colony.owner), { kind: 'map', x: colony.x, y: colony.y });
    track(colony.owner, 'colony:colonist born');
    message(s, `A new colonist has been born in ${colony.name}.`, colony.owner, colony);
  } else if (colony.goods.food < 0) {
    colony.goods.food = 0;
    const workers = colonyWorkers(s, colony);
    if (workers.length > 1) {
      const victim = workers[workers.length - 1];
      removeUnit(s, victim.id);
      track(colony.owner, 'colony:colonist starved');
      message(s, `${unitName(victim)} has starved to death in ${colony.name}.`, colony.owner, colony);
    } else {
      message(s, `${colony.name} is starving!`, colony.owner, colony);
    }
  }

  colony.liberty += report.produced.bells;
  p.bells += report.produced.bells;
  p.fatherBells += report.produced.bells;
  p.crosses += report.produced.crosses;
  noteProduction(s, colony.owner, report.produced);
  noteMining(s, colony, report.workers);
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
          track(colony.owner, `built:${cost.name}`);
          message(s, `${colony.name} has completed the ${cost.name}.`, colony.owner, colony);
          if (!canBuild(s, colony, colony.build)) colony.build = null;
        } else {
          createUnit(s, colony.owner, colony.build.id, { kind: 'map', x: colony.x, y: colony.y });
          track(colony.owner, `built unit:${cost.name}`);
          message(s, `${colony.name} has built a ${cost.name}.`, colony.owner, colony);
        }
      }
    }
  }

  processSchool(s, colony);
  if (town) planTownBuild(s, colony, (t) => canBuild(s, colony, t));
  const stockade = modifiers(s, colony.owner, 'autoStockade');
  if (stockade.length && colony.buildings.stockade === 0 && stockade.some((m) => colonyWorkers(s, colony).length >= m.minColonists)) colony.buildings.stockade = 1;
  runCustomHouse(s, colony.id);

  const cap = warehouseCapacity(colony);
  for (const g of goodsOf(s)) {
    if (g === 'food') continue;
    if (colony.goods[g] > cap) {
      track(colony.owner, 'colony:goods spoiled', colony.goods[g] - cap);
      message(s, `${colony.goods[g] - cap} ${GOOD_DEFS[g].name.toLowerCase()} spoiled in ${colony.name}'s warehouse.`, colony.owner, colony);
      p.goodsSpoiled = (p.goodsSpoiled ?? 0) + colony.goods[g] - cap;
      colony.goods[g] = cap;
    }
    if (colony.goods[g] < 0) colony.goods[g] = 0;
  }
}

/**
 * An elder teaches (native-nations.md T6): the first townsperson whose work has an expert (a
 * hunter's, fisher's, gardener's or crafter's) learns it. With nobody to teach, the elder waits.
 */
function teachWays(s: GameState, colony: Colony, teacher: Unit, students: Unit[]): void {
  for (const student of students) {
    if (UNIT_TYPES[student.type].skill > 0) continue;
    const skill = skillOfWork(s, student);
    if (!skill) continue;
    const before = UNIT_TYPES[student.type].name;
    student.type = skill;
    teacher.teach = 0;
    track(colony.owner, 'school:colonist taught');
    message(s, `In ${colony.name}, a ${before.toLowerCase()} has learned from an elder to be a ${UNIT_TYPES[skill].name.toLowerCase()}.`, colony.owner, colony);
    return;
  }
  teacher.teach = TEACH_TURNS[(UNIT_TYPES[teacher.type].teach ?? 1) - 1];
}

/** Counts the furs and game a colony's workers and centre took this turn against their regions' renewal (land.ts). */
function noteTakenInColony(s: GameState, colony: Colony, report: ColonyReport): void {
  for (const u of colonyWorkers(s, colony)) {
    if (u.loc.kind !== 'colony' || u.loc.job.kind !== 'tile') continue;
    const { x, y, good } = u.loc.job;
    const tile = tileAt(s, x, y);
    if (tile) noteTaken(s, tile, x, y, good, report.workers[u.id] ?? 0);
  }
  const centre = tileAt(s, colony.x, colony.y);
  if (centre) noteTaken(s, centre, colony.x, colony.y, 'furs', centreProduction(s, colony).furs ?? 0);
}

/** Teachers train the least skilled colonists: criminals become servants, servants free colonists, free colonists experts. */
function processSchool(s: GameState, colony: Colony): void {
  const school = schoolOf(s, colony);
  if (!colony.buildings[school]) return;
  const workers = colonyWorkers(s, colony);
  const isTeacher = (w: Unit) => w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === school;
  for (const teacher of workers.filter(isTeacher)) {
    const level = UNIT_TYPES[teacher.type].teach ?? 1;
    teacher.teach = (teacher.teach ?? 0) + 1;
    if (teacher.teach < TEACH_TURNS[level - 1]) continue;
    if (UNIT_TYPES[teacher.type].teachesWays) {
      teachWays(s, colony, teacher, workers.filter((w) => !isTeacher(w)));
      continue;
    }
    const student = workers
      .filter((w) => !isTeacher(w) && UNIT_TYPES[w.type].skill <= 0 && w.type !== 'nativeConvert')
      .sort((a, b) => UNIT_TYPES[a.type].skill - UNIT_TYPES[b.type].skill)[0];
    if (!student) {
      teacher.teach = TEACH_TURNS[level - 1];
      continue;
    }
    const before = UNIT_TYPES[student.type].name;
    student.type = student.type === 'pettyCriminal' ? 'indenturedServant' : student.type === 'indenturedServant' ? 'freeColonist' : teacher.type;
    teacher.teach = 0;
    track(colony.owner, 'school:colonist taught');
    message(s, `In ${colony.name}, a ${before} has been taught to be a ${UNIT_TYPES[student.type].name}.`, colony.owner, colony);
  }
}
