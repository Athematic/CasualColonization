/**
 * Rivers: fixed map features on land, minor (`rv: 1`) or major (`rv: 2`), that cannot be built
 * or removed. As in the original game (and FreeCol's classic rules):
 *
 * - moving along a river, between two neighbouring tiles the river links, costs 1/3 of a move,
 *   like a road (`RIVER_MOVE_COST`); a road on top adds nothing more;
 * - a river tile yields more of the goods it already produces (`RIVER_YIELD_BONUS` in
 *   production.ts), and a colony built on a river gets the bonus on its centre tile.
 *
 * A tile stores its river's size and a bit mask of the neighbours the river runs to (`rd`, bits in
 * `DIRECTIONS` order). The mask makes the course unambiguous where two rivers run side by side,
 * lets renderers draw smooth curves, and marks the mouth with a bit towards the water.
 */
import { random } from './rng.js';
import { TERRAIN } from './rules/terrain.js';
import type { GameMap, Tile } from './types.js';

/** Neighbour offsets in `DIRECTIONS` order: n, ne, e, se, s, sw, w, nw. */
export const RIVER_DIRS: readonly [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/** The bit for the neighbour at (dx, dy), or -1 when it is not a neighbour. */
export function riverDirIndex(dx: number, dy: number): number {
  return RIVER_DIRS.findIndex(([x, y]) => x === dx && y === dy);
}

const water = (tile: Tile | undefined) => !!tile && TERRAIN[tile.t].water;

/** Does the river link these two neighbouring land tiles? */
export function riverLinked(map: GameMap, fx: number, fy: number, tx: number, ty: number): boolean {
  const from = map.tiles[fy * map.width + fx];
  const to = map.tiles[ty * map.width + tx];
  if (!from?.rv || !to?.rv || !from.rd || !to.rd) return false;
  const d = riverDirIndex(tx - fx, ty - fy);
  return d >= 0 && (from.rd & (1 << d)) !== 0 && (to.rd & (1 << ((d + 4) % 8))) !== 0;
}

export function riverName(tile: Tile): string | undefined {
  return tile.rv === 2 ? 'major river' : tile.rv === 1 ? 'minor river' : undefined;
}

/**
 * Joins two neighbouring tiles by river. Land tiles get the river (the larger size wins where
 * rivers meet); a water tile only receives the mouth bit on the land side.
 */
export function linkRiver(map: GameMap, ax: number, ay: number, bx: number, by: number, size: 1 | 2): void {
  const d = riverDirIndex(bx - ax, by - ay);
  if (d < 0) throw new Error(`River tiles ${ax},${ay} and ${bx},${by} are not neighbours.`);
  const a = map.tiles[ay * map.width + ax];
  const b = map.tiles[by * map.width + bx];
  if (!water(a)) {
    a.rv = Math.max(a.rv ?? 0, size) as 1 | 2;
    a.rd = (a.rd ?? 0) | (1 << d);
  }
  if (!water(b)) {
    b.rv = Math.max(b.rv ?? 0, size) as 1 | 2;
    b.rd = (b.rd ?? 0) | (1 << ((d + 4) % 8));
  }
}

/**
 * Stored-map rivers, one river per line:
 *
 *   Mississippi: m 30,18 31,24 M 32,30 33,41
 *
 * An optional name ends with a colon. Then waypoints `x,y` in tile coordinates, from the source
 * downstream; `m` and `M` switch to minor and major for the stretch that follows (minor at
 * first). Waypoints are joined by straight steps to any of the 8 neighbours. Every tile between
 * the first and the last waypoint must be land. The first waypoint may be a lake the river flows
 * out of; the last waypoint is the water the river flows into, or a tile on
 * a river listed earlier, which this one joins as a tributary. Lines starting with `#` are comments.
 */
export function parseRivers(map: GameMap, text: string, mapId = 'map'): void {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const line of lines) {
    const colon = line.indexOf(':');
    const name = colon >= 0 ? line.slice(0, colon).trim() : line;
    const tokens = (colon >= 0 ? line.slice(colon + 1) : line).trim().split(/\s+/);
    const where = `${mapId}: river "${name}"`;
    let size: 1 | 2 = 1;
    const points: { x: number; y: number; size: 1 | 2 }[] = [];
    for (const tok of tokens) {
      if (tok === 'm' || tok === 'M') {
        size = tok === 'M' ? 2 : 1;
        continue;
      }
      const m = /^(\d+),(\d+)$/.exec(tok);
      if (!m) throw new Error(`${where}: cannot read "${tok}".`);
      const x = Number(m[1]);
      const y = Number(m[2]);
      if (x >= map.width || y >= map.height) throw new Error(`${where}: ${tok} is off the map.`);
      const last = points[points.length - 1];
      if (!last) {
        points.push({ x, y, size });
        continue;
      }
      const steps = Math.max(Math.abs(x - last.x), Math.abs(y - last.y));
      for (let i = 1; i <= steps; i++) {
        points.push({ x: Math.round(last.x + ((x - last.x) * i) / steps), y: Math.round(last.y + ((y - last.y) * i) / steps), size });
      }
    }
    if (points.length < 2) throw new Error(`${where}: needs at least two tiles.`);
    const end = points[points.length - 1];
    const endTile = map.tiles[end.y * map.width + end.x];
    if (!water(endTile) && !endTile.rv) throw new Error(`${where}: ends at ${end.x},${end.y}, which is neither water nor a river.`);
    const crossing = points.slice(0, -1).find((p) => map.tiles[p.y * map.width + p.x].rv);
    if (crossing) throw new Error(`${where}: meets another river at ${crossing.x},${crossing.y} before its end.`);
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      if (i > 0 && water(map.tiles[p.y * map.width + p.x])) throw new Error(`${where}: ${p.x},${p.y} is water.`);
      const q = points[i + 1];
      linkRiver(map, p.x, p.y, q.x, q.y, q === end && !water(endTile) ? Math.min(p.size, endTile.rv!) as 1 | 2 : p.size);
    }
    // A tributary joining a major river does not make the main river smaller.
    if (!water(endTile)) endTile.rv = Math.max(endTile.rv!, points[points.length - 2].size) as 1 | 2;
  }
}

/** River tiles a generated river must reach before it becomes a major river. */
export const MAJOR_RIVER_LENGTH = 9;

/**
 * Generated rivers. `height` is the land's elevation (0..1, from the generator's noise). Water
 * drains from every land tile to the sea along the lowest route (a priority flood from the
 * coast), so every river reaches the sea or a lake. Rivers rise in hills, mountains and wet
 * highlands, follow that drainage downhill and merge where they meet; a river grows into a major
 * river once MAJOR_RIVER_LENGTH river tiles drain through it. Deterministic from `rng`.
 */
export function generateRivers(rng: { rng: number }, map: GameMap, height: (x: number, y: number) => number, wetness: (x: number, y: number) => number): void {
  const { width, height: rows, tiles } = map;
  const n = width * rows;
  const land = (i: number) => !water(tiles[i]);
  // Height for drainage: the elevation noise, with hills and mountains raised and a little jitter.
  const lift = (t: Tile) => (t.t === 'mountains' ? 0.35 : t.t === 'hills' ? 0.18 : 0);
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = height(i % width, Math.floor(i / width)) + lift(tiles[i]) + random(rng) * 0.02;
  // Priority flood from the coast: each land tile drains into the tile it was reached from.
  const down = new Int32Array(n).fill(-1);
  const level = new Float64Array(n).fill(Infinity);
  // A binary heap of [level, tile] pairs; a tile whose level drops is pushed again.
  const heap: [number, number][] = [];
  const less = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (i: number) => {
    heap.push([level[i], i]);
    for (let k = heap.length - 1; k > 0; ) {
      const p = (k - 1) >> 1;
      if (!less(heap[k], heap[p])) break;
      [heap[k], heap[p]] = [heap[p], heap[k]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === k) break;
        [heap[k], heap[m]] = [heap[m], heap[k]];
        k = m;
      }
    }
    return top[1];
  };
  const coastDist = new Int32Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!land(i)) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of RIVER_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
      const j = ny * width + nx;
      // Mouths open onto the water through an edge, not a corner, so they meet the coast cleanly.
      if (!land(j) && (dx === 0 || dy === 0) && tiles[j].t !== 'highSeas') {
        down[i] = j;
        level[i] = h[i];
        coastDist[i] = 1;
        push(i);
        break;
      }
    }
  }
  const done = new Uint8Array(n);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of RIVER_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= rows) continue;
      const j = ny * width + nx;
      if (!land(j) || done[j]) continue;
      // Diagonal steps cost a little more, so courses favour straight runs that draw well.
      const lv = Math.max(h[j], level[i]) + (dx && dy ? 0.004 : 0);
      if (lv < level[j]) {
        level[j] = lv;
        down[j] = i;
        coastDist[j] = coastDist[i] + 1;
        push(j);
      }
    }
  }
  // Sources: hills, mountains and wet highlands well inland, best first, spaced apart.
  const candidates: { i: number; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (!land(i) || t.t === 'arctic' || down[i] < 0 || coastDist[i] < 4) continue;
    const x = i % width;
    const y = (i - x) / width;
    const high = t.t === 'mountains' || t.t === 'hills';
    const wetHigh = h[i] > 0.55 && wetness(x, y) > 0.55;
    if (!high && !wetHigh) continue;
    candidates.push({ i, score: coastDist[i] * 0.15 + wetness(x, y) + random(rng) * 0.8 });
  }
  candidates.sort((a, b) => b.score - a.score || a.i - b.i);
  const landTiles = tiles.filter((t) => !water(t)).length;
  const wanted = Math.max(3, Math.round(landTiles / 95));
  const onRiver = new Uint8Array(n);
  const near = (i: number, r: number) => {
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < rows && onRiver[ny * width + nx]) return true;
      }
    return false;
  };
  const flow = new Int32Array(n);
  const courses: number[][] = [];
  for (const { i: source } of candidates) {
    if (courses.length >= wanted) break;
    if (near(source, 3)) continue;
    const course: number[] = [];
    for (let i = source; i >= 0 && land(i); i = down[i]) {
      course.push(i);
      if (onRiver[i]) break;
    }
    // Too short to matter: skip it.
    const fresh = course.filter((i) => !onRiver[i]).length;
    if (fresh < 4) continue;
    for (const i of course) onRiver[i] = 1;
    courses.push(course);
  }
  // Water flowing through each tile: the river tiles upstream of it, itself included.
  for (const course of courses) {
    let carried = 0;
    let joined = false;
    for (const i of course) {
      if (!joined && flow[i] > 0) joined = true;
      if (!joined) carried++;
      flow[i] += carried;
    }
    // Downstream of a confluence the joining river's water is carried on to the sea.
    if (joined) for (let i = down[course[course.length - 1]]; i >= 0 && land(i); i = down[i]) flow[i] += carried;
  }
  const xy = (i: number) => [i % width, Math.floor(i / width)] as const;
  const sizeAt = (i: number): 1 | 2 => (flow[i] >= MAJOR_RIVER_LENGTH ? 2 : 1);
  for (const course of courses) {
    for (let k = 0; k + 1 < course.length; k++) linkRiver(map, ...xy(course[k]), ...xy(course[k + 1]), sizeAt(course[k]));
    // A river that did not join another runs into the water.
    const last = course[course.length - 1];
    if (!land(down[last])) linkRiver(map, ...xy(last), ...xy(down[last]), sizeAt(last));
  }
}
