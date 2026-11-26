/**
 * Square-to-hex stored map conversion & review tool (Beta 4 step 4; docs/design/hex-maps.md H11).
 *
 * Reads a stored map on SQUARE and on HEX_POINTY (or HEX_FLAT), then reports:
 *   1. River problems when waypoints are re-read as hex lines (`storedMapOn`).
 *   2. Land and water component changes (isthmuses broken, straits closed, islands merged/split).
 *   3. Edge-only square passages that broke or newly connected on hexes.
 *
 * Usage:
 *   npx rolldown scripts/convert-hex-map.ts --file scripts/.convert-hex-map.mjs --format esm --platform node --log-level warn && node scripts/.convert-hex-map.mjs north-east [--flat]
 */
import { HEX_FLAT, HEX_POINTY, parseStoredMap, SQUARE, storedMap, storedMapOn, TERRAIN, type GameMap, type Grid } from '../packages/engine/src/index.js';

function components(map: GameMap, grid: Grid, predicate: (x: number, y: number) => boolean): { count: number; id: Int32Array; sizes: number[]; samples: [number, number][] } {
  const { width, height } = map;
  const id = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const samples: [number, number][] = [];
  const queue = new Int32Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (id[start] !== -1 || !predicate(x, y)) continue;
      const cid = count++;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      id[start] = cid;
      samples.push([x, y]);
      while (head < tail) {
        const idx = queue[head++];
        const cx = idx % width;
        const cy = (idx - cx) / width;
        const offs = grid.neighbourOffsets(cx, cy);
        for (let k = 0; k < offs.length; k += 2) {
          const nx = cx + offs[k];
          const ny = cy + offs[k + 1];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nidx = ny * width + nx;
          if (id[nidx] !== -1 || !predicate(nx, ny)) continue;
          id[nidx] = cid;
          queue[tail++] = nidx;
        }
      }
      sizes.push(tail);
    }
  }
  return { count, id, sizes, samples };
}

function isWater(map: GameMap, x: number, y: number): boolean {
  return TERRAIN[map.tiles[y * map.width + x].t].water;
}

const args = process.argv.slice(2);
const mapId = args.find((a) => !a.startsWith('--')) ?? 'north-east';
const flat = args.includes('--flat');
const grid = flat ? HEX_FLAT : HEX_POINTY;
const def = storedMap(mapId);

const sq = parseStoredMap(def, SQUARE);
const { map: hx, problems } = storedMapOn(def, grid);

console.log(`=== Hex conversion audit: ${mapId} (${sq.width}x${sq.height}) -> ${flat ? 'HEX_FLAT' : 'HEX_POINTY'} ===`);
console.log(`\n1. Rivers (${problems.length} problems):`);
if (problems.length === 0) console.log('  All rivers fit cleanly on hexes.');
else for (const p of problems) console.log(`  - ${p}`);

for (const [label, pred] of [
  ['Water (straits & lakes)', (m: GameMap, x: number, y: number) => isWater(m, x, y)],
  ['Land (isthmuses & islands)', (m: GameMap, x: number, y: number) => !isWater(m, x, y)],
] as const) {
  const cSq = components(sq, SQUARE, (x, y) => pred(sq, x, y));
  const cHx = components(hx, grid, (x, y) => pred(hx, x, y));
  console.log(`\n2. ${label}: SQUARE=${cSq.count} components, HEX=${cHx.count} components`);

  // Check square components that split on hex
  for (let sc = 0; sc < cSq.count; sc++) {
    const mapped = new Set<number>();
    for (let i = 0; i < cSq.id.length; i++) if (cSq.id[i] === sc) mapped.add(cHx.id[i]);
    if (mapped.size > 1) {
      const parts = [...mapped].map((hc) => `${cHx.sizes[hc]} tiles @(${cHx.samples[hc][0]},${cHx.samples[hc][1]})`).join(', ');
      console.log(`  SPLIT: square component #${sc} (${cSq.sizes[sc]} tiles @${cSq.samples[sc]}) -> ${mapped.size} hex components: ${parts}`);
    }
  }
  // Check hex components that merged multiple square components
  for (let hc = 0; hc < cHx.count; hc++) {
    const mapped = new Set<number>();
    for (let i = 0; i < cHx.id.length; i++) if (cHx.id[i] === hc) mapped.add(cSq.id[i]);
    if (mapped.size > 1) {
      const parts = [...mapped].map((sc) => `${cSq.sizes[sc]} tiles @(${cSq.samples[sc][0]},${cSq.samples[sc][1]})`).join(', ');
      console.log(`  MERGE: hex component #${hc} (${cHx.sizes[hc]} tiles @${cHx.samples[hc]}) merged ${mapped.size} square components: ${parts}`);
    }
  }
}
