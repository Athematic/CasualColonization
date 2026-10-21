import { BUILDINGS, WAREHOUSE_CAPACITY } from './rules/buildings.js';
import { GOODS, type GoodId } from './rules/goods.js';
import type { NationId } from './rules/nations.js';
import { FOREST_DEFENCE, TERRAIN, type TerrainDef } from './rules/terrain.js';
import { ROLES, UNIT_TYPES, type UnitTypeDef } from './rules/units.js';
import type { Colony, GameState, Player, Settlement, Tile, Unit, UnitLocation } from './types.js';
import type { UnitTypeId } from './rules/units.js';

export const DIRECTIONS = [
  { id: 'n', dx: 0, dy: -1 },
  { id: 'ne', dx: 1, dy: -1 },
  { id: 'e', dx: 1, dy: 0 },
  { id: 'se', dx: 1, dy: 1 },
  { id: 's', dx: 0, dy: 1 },
  { id: 'sw', dx: -1, dy: 1 },
  { id: 'w', dx: -1, dy: 0 },
  { id: 'nw', dx: -1, dy: -1 },
] as const;

export type Direction = (typeof DIRECTIONS)[number]['id'];

export function dirOffset(dir: Direction): { dx: number; dy: number } {
  const d = DIRECTIONS.find((d) => d.id === dir);
  if (!d) throw new Error(`Unknown direction ${dir}`);
  return d;
}

export function inBounds(s: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.map.width && y < s.map.height;
}

export function tileAt(s: GameState, x: number, y: number): Tile | undefined {
  return inBounds(s, x, y) ? s.map.tiles[y * s.map.width + x] : undefined;
}

export function terrainOf(tile: Tile): TerrainDef {
  return TERRAIN[tile.t];
}

export function isWater(tile: Tile | undefined): boolean {
  return !!tile && TERRAIN[tile.t].water;
}

export function tileName(tile: Tile): string {
  const def = TERRAIN[tile.t];
  return tile.f && def.forest ? def.forest.name : def.name;
}

export function tileDefence(tile: Tile): number {
  return tile.f ? FOREST_DEFENCE : TERRAIN[tile.t].defence;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function neighbours(s: GameState, x: number, y: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const d of DIRECTIONS) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (inBounds(s, nx, ny)) out.push({ x: nx, y: ny });
  }
  return out;
}

export function isCoastal(s: GameState, x: number, y: number): boolean {
  return neighbours(s, x, y).some((p) => isWater(tileAt(s, p.x, p.y)));
}

export function player(s: GameState, id: NationId): Player {
  const p = s.players.find((p) => p.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

export function currentPlayer(s: GameState): Player {
  return s.players[s.current];
}

export function unitDef(u: Unit): UnitTypeDef {
  return UNIT_TYPES[u.type];
}

export function isShip(u: Unit): boolean {
  return UNIT_TYPES[u.type].kind === 'ship';
}

export function isCarrier(u: Unit): boolean {
  return UNIT_TYPES[u.type].cargo > 0;
}

export function maxMoves(u: Unit): number {
  const def = UNIT_TYPES[u.type];
  let moves = ROLES[u.role].moves ?? def.moves;
  if (def.kind === 'ship' && u.owner === 'portugal') moves += 1;
  return moves * 3;
}

export function unitName(u: Unit): string {
  const def = UNIT_TYPES[u.type];
  if (u.role === 'none') return def.name;
  const role = ROLES[u.role].name;
  if (u.type === 'veteranSoldier' && u.role === 'dragoon') return 'Veteran Dragoon';
  if (def.expertRole === u.role) return def.name;
  if (u.type === 'freeColonist') return role;
  return `${role} (${def.name})`;
}

/** Map position of a unit, following carriers. Undefined when in Europe, at sea between continents or working in a colony building. */
export function unitPosition(s: GameState, u: Unit): { x: number; y: number } | undefined {
  switch (u.loc.kind) {
    case 'map':
      return { x: u.loc.x, y: u.loc.y };
    case 'carrier': {
      const c = s.units[u.loc.carrierId];
      return c ? unitPosition(s, c) : undefined;
    }
    case 'colony': {
      const col = s.colonies[u.loc.colonyId];
      return col ? { x: col.x, y: col.y } : undefined;
    }
    default:
      return undefined;
  }
}

export function unitsAt(s: GameState, x: number, y: number): Unit[] {
  return Object.values(s.units).filter((u) => u.loc.kind === 'map' && u.loc.x === x && u.loc.y === y);
}

export function colonyAt(s: GameState, x: number, y: number): Colony | undefined {
  return Object.values(s.colonies).find((c) => c.x === x && c.y === y);
}

export function settlementAt(s: GameState, x: number, y: number): Settlement | undefined {
  return Object.values(s.settlements).find((c) => c.x === x && c.y === y);
}

export function unitsAboard(s: GameState, carrier: Unit): Unit[] {
  return Object.values(s.units).filter((u) => u.loc.kind === 'carrier' && u.loc.carrierId === carrier.id);
}

export function colonyWorkers(s: GameState, colony: Colony): Unit[] {
  return Object.values(s.units).filter((u) => u.loc.kind === 'colony' && u.loc.colonyId === colony.id);
}

export function colonyPopulation(s: GameState, colony: Colony): number {
  return colonyWorkers(s, colony).length;
}

export function cargoUsed(s: GameState, carrier: Unit): number {
  let used = unitsAboard(s, carrier).length;
  for (const g of GOODS) {
    const amount = carrier.cargo?.[g] ?? 0;
    if (amount > 0) used += Math.ceil(amount / 100);
  }
  return used;
}

export function cargoFree(s: GameState, carrier: Unit): number {
  return UNIT_TYPES[carrier.type].cargo - cargoUsed(s, carrier);
}

/** How many more units of a good fit on the carrier (topping up a partial slot is free). */
export function cargoRoomFor(s: GameState, carrier: Unit, good: GoodId): number {
  const have = carrier.cargo?.[good] ?? 0;
  const partial = have > 0 ? (100 - (have % 100)) % 100 : 0;
  return cargoFree(s, carrier) * 100 + partial;
}

export function warehouseCapacity(colony: Colony): number {
  return WAREHOUSE_CAPACITY[colony.buildings.warehouse] ?? 100;
}

export function isExplored(s: GameState, nation: NationId, x: number, y: number): boolean {
  if (!inBounds(s, x, y)) return false;
  return player(s, nation).explored[y * s.map.width + x] === 1;
}

export function sightRadius(u: Unit): number {
  const def = UNIT_TYPES[u.type];
  let r = 1;
  if (u.role === 'scout') r = 2;
  if (def.kind === 'ship' && def.offence > 0) r = 2;
  if (u.owner === 'russia' && (u.role === 'scout' || u.role === 'dragoon')) r += 1;
  return r;
}

export function reveal(s: GameState, nation: NationId, x: number, y: number, radius: number): void {
  const p = player(s, nation);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(s, nx, ny)) p.explored[ny * s.map.width + nx] = 1;
    }
  }
}

/** True if the tile is worked by any colony's colonist. */
export function tileWorkedBy(s: GameState, x: number, y: number): Unit | undefined {
  return Object.values(s.units).find(
    (u) => u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && u.loc.job.x === x && u.loc.job.y === y,
  );
}

export function colonyOwningTile(s: GameState, x: number, y: number): Colony | undefined {
  return Object.values(s.colonies).find((c) => distance(c.x, c.y, x, y) <= 1);
}

export function buildingWorkers(s: GameState, colony: Colony, kind: keyof typeof BUILDINGS): Unit[] {
  return colonyWorkers(s, colony).filter((u) => u.loc.kind === 'colony' && u.loc.job.kind === 'building' && u.loc.job.building === kind);
}

export function message(s: GameState, text: string, to?: NationId, at?: { x: number; y: number }): void {
  s.messages.push({ turn: s.turn, to, text, at });
  if (s.messages.length > 400) s.messages.splice(0, s.messages.length - 400);
}

export function newId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

export function yearOf(turn: number): { year: number; season: 'spring' | 'autumn' | null } {
  if (turn < 108) return { year: 1492 + turn, season: null };
  const t = turn - 108;
  return { year: 1600 + Math.floor(t / 2), season: t % 2 === 0 ? 'spring' : 'autumn' };
}

export function formatDate(turn: number): string {
  const { year, season } = yearOf(turn);
  return season ? `${season === 'spring' ? 'Spring' : 'Autumn'} ${year}` : `${year}`;
}

export function createUnit(s: GameState, owner: NationId, type: UnitTypeId, loc: UnitLocation): Unit {
  const u: Unit = { id: newId(s, 'u'), owner, type, role: 'none', tools: 0, loc, moves: 0, state: 'active' };
  s.units[u.id] = u;
  return u;
}
