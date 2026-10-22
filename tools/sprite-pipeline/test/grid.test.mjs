import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { CORE_PALETTE, EXTRA_PALETTE, Palette, hexToRgb } from '../lib/color.mjs';
import { encodePng } from '../lib/image.mjs';
import { alignGrid, edgeProfiles, gridSizeFromDir, placeGrid, snapGrid, spriteColors, upscale } from '../lib/grid.mjs';
import { figurePng } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const PALETTE = new Palette([...CORE_PALETTE, ...EXTRA_PALETTE], { chromaWeight: 2 });

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A little n x n pixel-art figure in palette colours on a transparent background: ink outline,
 * a body whose cells take varied palette colours (so every cell's colour matters), a skin head.
 */
function spriteGrid(n = 32, seed = 1) {
  const r = rng(seed);
  const cols = ['#d23c2a', '#3a6fb0', '#a8743f', '#ffd23f', '#58a548', '#fffdf6'];
  const out = Buffer.alloc(n * n * 4);
  const set = (x, y, hex) => { const [R, G, B] = hexToRgb(hex); out.set([R, G, B, 255], (y * n + x) * 4); };
  const s = n / 32;
  const bx0 = Math.round(10 * s), bx1 = Math.round(22 * s), by0 = Math.round(12 * s), by1 = Math.round(30 * s);
  const hx0 = Math.round(13 * s), hx1 = Math.round(19 * s), hy0 = Math.round(4 * s), hy1 = Math.round(12 * s);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inB = x >= bx0 && x < bx1 && y >= by0 && y < by1;
      const inH = x >= hx0 && x < hx1 && y >= hy0 && y < hy1;
      if (!inB && !inH) continue;
      const edge = inB ? (x === bx0 || x === bx1 - 1 || y === by1 - 1 || (y === by0 && !(x >= hx0 && x < hx1))) : (x === hx0 || x === hx1 - 1 || y === hy0);
      set(x, y, edge ? '#1b1a17' : inH ? '#f3c9a0' : cols[Math.floor(r() * cols.length)]);
    }
  }
  return out;
}

/** Enlarge an n x n sprite to `size` px as a model would draw it: cell (i) covers [off + i*cell, off + (i+1)*cell). */
function enlarge(grid, n, size, { offset = 0, noise = 0, soft = 0, seed = 7 } = {}) {
  const r = rng(seed);
  const cell = size / n;
  const out = Buffer.alloc(size * size * 4);
  const at = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return [0, 0, 0, 0];
    const i = (cy * n + cx) * 4;
    return [grid[i], grid[i + 1], grid[i + 2], grid[i + 3]];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5 - offset) / cell, fy = (y + 0.5 - offset) / cell;
      const cx = Math.floor(fx), cy = Math.floor(fy);
      let c = at(cx, cy);
      if (soft > 0) {
        // anti-aliased block edges: blend with the neighbour within `soft` px of a cell boundary
        const dx = (fx - cx) * cell, dy = (fy - cy) * cell;
        const nx = dx < soft ? cx - 1 : dx > cell - soft ? cx + 1 : cx;
        const ny = dy < soft ? cy - 1 : dy > cell - soft ? cy + 1 : cy;
        if (nx !== cx || ny !== cy) {
          const d = at(nx, ny);
          c = c.map((v, k) => Math.round((v + d[k]) / 2));
        }
      }
      if (noise > 0 && c[3] > 0) c = c.map((v, k) => (k === 3 ? v : Math.max(0, Math.min(255, v + Math.round((r() * 2 - 1) * noise)))));
      out.set(c, (y * size + x) * 4);
    }
  }
  return out;
}

const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const diffCount = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) d++; return d; };

test('perfect grid: exact N x N recovery, fidelity 1, not flagged', () => {
  const n = 32, g = spriteGrid(n);
  const big = enlarge(g, n, 1024);
  const r = snapGrid(big, 1024, 1024, n, { palette: PALETTE });
  assert.equal(r.fidelity, 1);
  assert.equal(r.badCells, 0);
  assert.equal(r.flagged, false, r.reasons.join('; '));
  assert.deepEqual(r.offset, { x: 0, y: 0 });
  assert.deepEqual(r.detected, { x: 32, y: 32 });
  assert.equal(diffCount(r.rgba, g), 0, 'every cell recovered');
});

test('grid sizes 16 and 24 (non-integer-free 1008 px for 24)', () => {
  for (const [n, size] of [[16, 1024], [24, 1008]]) {
    const g = spriteGrid(n, n);
    const r = snapGrid(enlarge(g, n, size), size, size, n, { palette: PALETTE });
    assert.equal(diffCount(r.rgba, g), 0, `${n}: exact`);
    assert.equal(r.fidelity, 1);
  }
});

test('slightly noisy grid with soft block edges: exact recovery, high fidelity', () => {
  const n = 32, g = spriteGrid(n, 3);
  const big = enlarge(g, n, 1024, { noise: 10, soft: 3 });
  const r = snapGrid(big, 1024, 1024, n, { palette: PALETTE });
  assert.equal(diffCount(r.rgba, g), 0, 'noise and soft edges do not change a cell');
  assert.ok(r.fidelity > 0.97, `fidelity ${r.fidelity}`);
  assert.equal(r.flagged, false, r.reasons.join('; '));
});

test('the dominant colour wins over a minority (mode, not mean)', () => {
  // one 32-px cell: 70% red, 30% blue in a stripe; the mean would be purple
  const n = 1, size = 32;
  const img = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) img.set(x < 22 ? [210, 60, 42, 255] : [58, 111, 176, 255], (y * size + x) * 4);
  const r = snapGrid(img, size, size, n, { palette: null, phase: false, detect: false, inset: 0 });
  assert.deepEqual([...r.rgba], [210, 60, 42, 255]);
  assert.ok(r.fidelity < 0.8 && r.badCells === 1, 'the mixed cell is reported');
});

test('alpha by majority', () => {
  const size = 40;
  const img = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (y < 14) img.set([210, 60, 42, 255], (y * size + x) * 4); // 35% opaque
  const r = snapGrid(img, size, size, 1, { palette: null, phase: false, detect: false, inset: 0 });
  assert.equal(r.rgba[3], 0, 'mostly transparent cell is transparent');
});

test('a grid offset by a few pixels is found by the phase search', () => {
  const n = 32, g = spriteGrid(n, 5);
  const big = enlarge(g, n, 1024, { offset: 12 });
  const r = snapGrid(big, 1024, 1024, n, { palette: PALETTE });
  assert.equal(r.offset.x, 12);
  assert.equal(r.offset.y, 12);
  assert.equal(diffCount(r.rgba, g), 0);
  assert.equal(r.flagged, false);
  const blind = snapGrid(big, 1024, 1024, n, { palette: PALETTE, phase: false });
  assert.ok(blind.fidelity < r.fidelity, 'without the search the fidelity drops');
});

test('misaligned grid (drawn with 29 cells, read as 32): low fidelity, flagged, true count detected', () => {
  const m = 29, n = 32;
  const r0 = rng(11);
  const cols = [...CORE_PALETTE.slice(1), ...EXTRA_PALETTE];
  const g = Buffer.alloc(m * m * 4);
  for (let i = 0; i < m * m; i++) g.set([...hexToRgb(cols[Math.floor(r0() * cols.length)]), 255], i * 4);
  const big = enlarge(g, m, 1024);
  const r = snapGrid(big, 1024, 1024, n, { palette: PALETTE });
  assert.ok(r.fidelity < 0.85, `fidelity ${r.fidelity}`);
  assert.equal(r.flagged, true);
  assert.ok(r.badCells > 0.2 * r.contentCells, `${r.badCells} bad of ${r.contentCells}`);
  assert.deepEqual(r.detected, { x: 29, y: 29 });
  assert.match(r.reasons.join('; '), /looks like a 29x29 grid/);
});

test('a smooth (not pixel-art) image scores low', async () => {
  const png = await figurePng({ size: 256 });
  const { data, info } = await sharp(png).blur(6).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = snapGrid(data, info.width, info.height, 32, { palette: PALETTE });
  assert.ok(r.fidelity < 0.95, `fidelity ${r.fidelity}`);
  assert.equal(r.flagged, true);
});

test('alignGrid and edge profiles see the block edges', () => {
  const n = 16, g = spriteGrid(n, 2);
  const big = enlarge(g, n, 256);
  const p = edgeProfiles(big, 256, 256);
  const a = alignGrid(p.x, 256, n, true);
  assert.equal(a.offset, 0);
  assert.equal(a.align, 1);
});

test('placeGrid moves a standing figure onto the baseline without resampling; upscale is nearest-neighbour', () => {
  const n = 32;
  const g = spriteGrid(n, 9); // feet at row 29 (bottom = 30)
  // move it up by 3 rows and left by 3 columns
  const moved = Buffer.alloc(g.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sy = y + 3, sx = x + 3;
    if (sy < n && sx < n) g.copy(moved, (y * n + x) * 4, (sy * n + sx) * 4, (sy * n + sx) * 4 + 4);
  }
  const p = placeGrid(moved, n, 'standing');
  assert.equal(p.dy, 3, 'bottom back on round(0.94 * 32) = 30');
  assert.equal(p.dx, 3, 'centred on the core');
  assert.equal(diffCount(p.rgba, g), 0);
  assert.equal(placeGrid(g, n, 'fullbleed').dx, 0);
  const up = upscale(g, n, 3);
  assert.equal(up.length, 96 * 96 * 4);
  assert.deepEqual([...up.subarray((50 * 96 + 50) * 4, (50 * 96 + 50) * 4 + 4)], [...g.subarray((16 * n + 16) * 4, (16 * n + 16) * 4 + 4)]);
  assert.ok(spriteColors(g).includes('#1b1a17'));
  assert.equal(gridSizeFromDir('tools/image-gen/output/edited/pixel-24'), 24);
  assert.equal(gridSizeFromDir('x/bold'), null);
});

// ------------------------------------------------------------------ build.mjs with --grid / --grid-in

async function editedFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-grid-'));
  const n = 32;
  for (const d of ['orig/units', 'bold/units', 'pixel-32/units']) await fs.mkdir(path.join(dir, d), { recursive: true });
  await fs.writeFile(path.join(dir, 'orig/units/test-colonist__none.png'), await figurePng({ staff: true }));
  await fs.writeFile(path.join(dir, 'bold/units/test-colonist__none.png'), await figurePng({ staff: true }));
  const g = spriteGrid(n, 4);
  await fs.writeFile(path.join(dir, 'pixel-32/units/test-colonist__none.png'), await encodePng(1024, 1024, enlarge(g, n, 1024, { noise: 6 })));
  // a bad generation: drawn on a 27-cell grid
  const m = 27, r0 = rng(3), bad = Buffer.alloc(m * m * 4);
  for (let i = 0; i < m * m; i++) bad.set([...hexToRgb(CORE_PALETTE[1 + Math.floor(r0() * 11)]), 255], i * 4);
  await fs.writeFile(path.join(dir, 'pixel-32/units/test-colonist__soldier.png'), await encodePng(1024, 1024, enlarge(bad, m, 1024)));
  return { dir, grid: g };
}

test('build --grid N: grid-only run writes the exact N x N sprite, upscales and a fidelity report', async () => {
  const { dir, grid } = await editedFixture();
  const build = path.join(HERE, '..', 'build.mjs');
  const { stdout } = await run(process.execPath, [build, '--in', path.join(dir, 'pixel-32'), '--grid', '32', '--out', path.join(dir, 'o'), '--upscales', '2,4']);
  const m = JSON.parse(await fs.readFile(path.join(dir, 'o/manifest.json'), 'utf8'));
  const s = m.sprites['units/test-colonist__none'];
  assert.deepEqual(Object.keys(s.files), ['32']);
  assert.equal(s.files['32'].mode, 'grid');
  assert.equal(s.files['32'].file, 'units/test-colonist__none@32.png');
  assert.ok(s.grid['32'].fidelity > 0.95);
  assert.equal(s.grid['32'].flagged, false);
  assert.deepEqual(Object.keys(s.grid['32'].upscales), ['2', '4']);
  const { data, info } = await sharp(path.join(dir, 'o/units/test-colonist__none@32.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 32);
  assert.equal(diffCount(data, grid), 0, 'exact sprite (already on the baseline, so no shift)');
  const up = await sharp(path.join(dir, 'o/units/test-colonist__none@32x4.png')).metadata();
  assert.equal(up.width, 128);
  const bad = m.sprites['units/test-colonist__soldier'];
  assert.equal(bad.grid['32'].flagged, true);
  assert.match(stdout, /grid fidelity/i);
  assert.match(stdout, /Edit-Images\.ps1 .*-Only 'units\/test-colonist__soldier'.*-Force/);
  const rep = JSON.parse(await fs.readFile(path.join(dir, 'o/_sheet/grid-report.json'), 'utf8'));
  assert.deepEqual(rep.flagged.map((f) => f.id), ['units/test-colonist__soldier']);
  const html = await fs.readFile(path.join(dir, 'o/index.html'), 'utf8');
  assert.match(html, /grid fidelity/i);
  await fs.rm(dir, { recursive: true, force: true });
});

test('build --in bold --grid-in pixel-32 --compare-in orig: one runtime set, three-way comparison sheet', async () => {
  const { dir } = await editedFixture();
  const build = path.join(HERE, '..', 'build.mjs');
  await run(process.execPath, [build, '--in', path.join(dir, 'bold'), '--grid-in', path.join(dir, 'pixel-32'), '--compare-in', path.join(dir, 'orig'),
    '--out', path.join(dir, 'o'), '--sizes', '16,24,32,48', '--no-tuning']);
  const m = JSON.parse(await fs.readFile(path.join(dir, 'o/manifest.json'), 'utf8'));
  const s = m.sprites['units/test-colonist__none'];
  assert.deepEqual(Object.keys(s.files), ['16', '24', '32', '48']);
  assert.equal(s.files['16'].mode, 'pixel');
  assert.equal(s.files['32'].mode, 'grid', 'the grid snap replaces the pipeline pixel size');
  assert.equal(s.files['48'].mode, 'smooth');
  assert.ok(m.sprites['units/test-colonist__soldier'], 'a sprite only in the grid folder still gets its grid size');
  assert.deepEqual(Object.keys(m.sprites['units/test-colonist__soldier'].files), ['32']);
  const html = await fs.readFile(path.join(dir, 'o/index.html'), 'utf8');
  assert.match(html, /id="compare"/);
  assert.match(html, /original → pipeline/);
  assert.match(html, /bold redraw → pipeline/);
  assert.match(html, /pixel grid 32/);
  await fs.access(path.join(dir, 'o/_sheet/compare-orig/units/test-colonist__none@24.png'));
  await fs.rm(dir, { recursive: true, force: true });
});

test('build refuses the edited root folder with a helpful message', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-grid-'));
  await fs.mkdir(path.join(dir, 'edited/bold/units'), { recursive: true });
  await fs.writeFile(path.join(dir, 'edited/bold/units/a__none.png'), await figurePng({}));
  const build = path.join(HERE, '..', 'build.mjs');
  await assert.rejects(run(process.execPath, [build, '--in', path.join(dir, 'edited'), '--out', path.join(dir, 'o')]), /point --in at .*edited[\\/]bold/);
  await fs.rm(dir, { recursive: true, force: true });
});
