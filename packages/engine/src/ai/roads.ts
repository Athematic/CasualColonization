/**
 * Road building for the advanced computer levels. Once a pioneer has nothing left to plow or
 * clear, it lays roads: first along the worked tiles that a road makes richer (lumber, ore,
 * silver, furs), then along routes joining each colony to its nearest neighbour and inland
 * colonies to the nearest port, so troops, colonists and wagon trains move faster.
 */
import { buildTargetCost, equipInColony, leaveColony } from '../colony.js';
import { canImprove, findPath, setDestination, startImprovement } from '../movement.js';
import { colonyAt, colonyWorkers, distance, isCoastal, isWater, neighbours, settlementAt, tileAt, unitPosition } from '../queries.js';
import { UNIT_TYPES } from '../rules/units.js';
import type { Colony, GameState, Player, Unit } from '../types.js';
import { ownColonies } from './common.js';

/** Colonies further apart than this are not worth joining by road. */
const LINK_RANGE = 6;
/** Goods a road adds one unit of on a worked tile. */
const ROAD_GOODS = new Set(['lumber', 'ore', 'silver', 'furs']);

type Spot = { x: number; y: number };

const planCache = new WeakMap<GameState, Map<string, Spot[]>>();

/** Tiles the nation wants a road on, most useful first. Worked out once per turn. */
export function roadTargets(s: GameState, p: Player): Spot[] {
  let byNation = planCache.get(s);
  if (!byNation) planCache.set(s, (byNation = new Map()));
  const key = `${p.id}:${s.turn}`;
  const cached = byNation.get(key);
  if (cached) return cached;
  for (const k of byNation.keys()) if (k.startsWith(`${p.id}:`)) byNation.delete(k);
  const out: Spot[] = [];
  const seen = new Set<number>();
  const w = s.map.width;
  const add = (t: Spot) => {
    const i = t.y * w + t.x;
    const tile = tileAt(s, t.x, t.y);
    if (!tile || tile.r || isWater(tile) || seen.has(i) || colonyAt(s, t.x, t.y)) return;
    seen.add(i);
    out.push(t);
  };
  const colonies = ownColonies(s, p).sort((a, b) => colonyWorkers(s, b).length - colonyWorkers(s, a).length);
  // Worked tiles where a road raises the yield.
  for (const c of colonies) {
    for (const wk of colonyWorkers(s, c)) if (wk.loc.kind === 'colony' && wk.loc.job.kind === 'tile' && ROAD_GOODS.has(wk.loc.job.good)) add(wk.loc.job);
  }
  // Links between colonies, and from inland colonies to the coast.
  const links = new Set<string>();
  for (const c of colonies) {
    const others = colonies.filter((o) => o !== c).sort((a, b) => distance(a.x, a.y, c.x, c.y) - distance(b.x, b.y, c.x, c.y));
    const partners: Colony[] = [];
    if (others[0] && distance(others[0].x, others[0].y, c.x, c.y) <= LINK_RANGE) partners.push(others[0]);
    if (!isCoastal(s, c.x, c.y)) {
      const port = others.find((o) => isCoastal(s, o.x, o.y) && distance(o.x, o.y, c.x, c.y) <= LINK_RANGE + 2);
      if (port && !partners.includes(port)) partners.push(port);
    }
    for (const o of partners) {
      const id = c.id < o.id ? `${c.id}-${o.id}` : `${o.id}-${c.id}`;
      if (links.has(id)) continue;
      links.add(id);
      for (const t of roadRoute(s, p, c, o) ?? []) add(t);
    }
  }
  byNation.set(key, out);
  return out;
}

/** Cheapest land route between two colonies, preferring existing roads; the tiles in between. */
export function roadRoute(s: GameState, p: Player, from: Spot, to: Spot): Spot[] | null {
  const w = s.map.width;
  const limit = distance(from.x, from.y, to.x, to.y) + 3;
  const start = from.y * w + from.x;
  const goal = to.y * w + to.x;
  const cost = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const open: { i: number; f: number }[] = [{ i: start, f: 0 }];
  const done = new Set<number>();
  while (open.length) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
    const { i } = open.splice(best, 1)[0];
    if (i === goal) break;
    if (done.has(i)) continue;
    done.add(i);
    const x = i % w;
    const y = (i - x) / w;
    for (const n of neighbours(s, x, y)) {
      const j = n.y * w + n.x;
      if (done.has(j) || distance(n.x, n.y, from.x, from.y) > limit || distance(n.x, n.y, to.x, to.y) > limit) continue;
      const tile = tileAt(s, n.x, n.y)!;
      if (isWater(tile) || settlementAt(s, n.x, n.y)) continue;
      const colony = colonyAt(s, n.x, n.y);
      if (colony && j !== goal && colony.owner !== p.id) continue;
      const step = tile.r || colony ? 0.25 : tile.t === 'mountains' ? 3 : 1;
      const c = cost.get(i)! + step;
      if (c < (cost.get(j) ?? Infinity)) {
        cost.set(j, c);
        prev.set(j, i);
        open.push({ i: j, f: c + distance(n.x, n.y, to.x, to.y) * 0.25 });
      }
    }
  }
  if (!prev.has(goal)) return null;
  const path: Spot[] = [];
  for (let cur = prev.get(goal)!; cur !== start; cur = prev.get(cur)!) path.unshift({ x: cur % w, y: Math.floor(cur / w) });
  return path;
}

/** Sends an idle pioneer to lay the most useful road. Returns false when there is none to lay. */
export function buildRoads(s: GameState, p: Player, u: Unit): boolean {
  const pos = unitPosition(s, u);
  if (!pos || u.role !== 'pioneer') return false;
  const here = tileAt(s, pos.x, pos.y)!;
  const targets = roadTargets(s, p);
  // Another pioneer already working or heading there.
  const taken = new Set<number>();
  const w = s.map.width;
  for (const o of Object.values(s.units)) {
    if (o.owner !== p.id || o.id === u.id || o.role !== 'pioneer' || o.loc.kind !== 'map') continue;
    if (o.work) taken.add(o.loc.y * w + o.loc.x);
    if (o.dest && 'x' in o.dest) taken.add(o.dest.y * w + o.dest.x);
  }
  const open = targets.filter((t) => !taken.has(t.y * w + t.x));
  if (!here.r && open.some((t) => t.x === pos.x && t.y === pos.y) && canImprove(s, u, 'road') === null) {
    startImprovement(s, u.id, 'road');
    return true;
  }
  // The first few in order of usefulness, the nearest of those first.
  const shortlist = open.slice(0, 6).sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y));
  for (const t of shortlist.slice(0, 3)) {
    if (!findPath(s, u, t.x, t.y)) continue;
    setDestination(s, u.id, t);
    const now = unitPosition(s, u)!;
    if (now.x === t.x && now.y === t.y && u.moves > 0 && canImprove(s, u, 'road') === null) startImprovement(s, u.id, 'road');
    return true;
  }
  return false;
}

/** Pioneers the nation keeps busy at once. */
export function pioneersWanted(colonies: number): number {
  return colonies === 0 ? 0 : Math.min(3, 1 + Math.floor(colonies / 6));
}

/**
 * Gives a colonist the colony's spare tools and sends them out as a pioneer when the nation
 * is short of pioneers and has land to improve. A hardy pioneer goes first.
 */
export function equipPioneer(s: GameState, p: Player, c: Colony, toolsNeeded: number): boolean {
  const colonies = ownColonies(s, p).length;
  const pioneers = Object.values(s.units).filter((u) => u.owner === p.id && u.role === 'pioneer').length;
  if (pioneers >= pioneersWanted(colonies)) return false;
  if (c.goods.tools - toolsNeeded < 60) return false;
  const workers = colonyWorkers(s, c);
  const hardy = workers.find((u) => u.type === 'hardyPioneer');
  const plain = workers.length >= 5 ? workers.find((u) => UNIT_TYPES[u.type].skill === 0 && u.type !== 'nativeConvert') : undefined;
  const pick = hardy ?? plain;
  if (!pick || (pioneers > 0 && !hardy && !roadTargets(s, p).length)) return false;
  leaveColony(s, pick.id);
  equipInColony(s, pick.id, 'pioneer');
  return true;
}

/** Tools to bring from Europe so a colony can send out another pioneer; 0 when none are short. */
export function pioneerToolsWanted(s: GameState, p: Player): number {
  const colonies = ownColonies(s, p);
  const pioneers = Object.values(s.units).filter((u) => u.owner === p.id && u.role === 'pioneer').length;
  if (pioneers >= pioneersWanted(colonies.length)) return 0;
  const stored = Math.max(0, ...colonies.map((c) => c.goods.tools - (c.build ? buildTargetCost(c.build, c).tools : 0)));
  return stored >= 60 ? 0 : 60;
}
