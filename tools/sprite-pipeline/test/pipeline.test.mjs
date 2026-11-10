import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { CORE_PALETTE, EXTRA_PALETTE, Palette, hexToOklab, hexToRgb } from '../lib/color.mjs';
import { cleanAlpha, encodePng, fromRgba8, resample, toRgba8 } from '../lib/image.mjs';
import { SPLIT_SPRITES, alphaBBox, classify, coreBBox, headPlacement, isGroundOverlay, placement, transformFor } from '../lib/normalise.mjs';
import { FImage } from '../lib/image.mjs';
import { INK_PACKED, TRANSPARENT, addOutline, cleanupOrphans, renderPixel, ridge } from '../lib/pixel.mjs';
import { renderPng, spritePalette } from '../lib/process.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { figureImage, figurePng, paint } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const pack = (hex) => { const [r, g, b] = hexToRgb(hex); return (r << 16) | (g << 8) | b; };

// ------------------------------------------------------------------ normalise

test('alphaBBox ignores the faint glow once alpha is cleaned', () => {
  const img = cleanAlpha(figureImage({ staff: false }));
  assert.deepEqual(alphaBBox(img), { x0: 100, y0: 60, x1: 150, y1: 220 });
});

test('coreBBox leaves out a thin protrusion (staff above the head)', () => {
  const img = cleanAlpha(figureImage({ staff: true }));
  const bbox = alphaBBox(img), core = coreBBox(img);
  assert.equal(bbox.y0, 30); // the staff top
  assert.equal(core.y0, 60); // the head top
  assert.equal(core.y1, 220);
});

test('standing figures share scale and baseline whatever size or position the model drew', () => {
  const N = 100;
  const a = cleanAlpha(figureImage({ top: 60, bottom: 220, left: 100, right: 150, staff: false }));
  const b = cleanAlpha(figureImage({ top: 120, bottom: 200, left: 30, right: 80, staff: false })); // half as tall, off-centre
  const boxes = [a, b].map((img) => {
    const p = placement(img, 'standing');
    const out = resample(img, N, N, { ...transformFor(p, N), kernel: 'box' });
    return alphaBBox(out);
  });
  for (const bb of boxes) {
    assert.equal(bb.y1, 94, 'feet on the 0.94 baseline');
    assert.equal(bb.y1 - bb.y0, 80, 'core height 0.80 of the canvas');
  }
  // centred horizontally
  for (const bb of boxes) assert.ok(Math.abs((bb.x0 + bb.x1) / 2 - 50) <= 1);
});

test('a protrusion does not shrink the body, but is kept inside the margin', () => {
  const N = 100;
  const plain = placement(cleanAlpha(figureImage({ staff: false })), 'standing');
  const staffed = placement(cleanAlpha(figureImage({ staff: true, staffAbove: 10 })), 'standing');
  assert.equal(staffed.scale, plain.scale);
  // a long staff would leave the canvas: the whole figure shrinks to fit
  const tall = placement(cleanAlpha(figureImage({ staff: true, staffAbove: 30 })), 'standing');
  assert.ok(tall.scale < plain.scale);
  const img = cleanAlpha(figureImage({ staff: true, top: 40, bottom: 220 }));
  const p = placement(img, 'standing');
  const bb = alphaBBox(resample(img, N, N, { ...transformFor(p, N), kernel: 'box' }));
  assert.ok(bb.y0 >= Math.floor(0.065 * N), `staff top ${bb.y0} inside the margin`);
  assert.equal(bb.y1, 94);
});

test('goods are centred', () => {
  const N = 100;
  const img = cleanAlpha(figureImage({ staff: false, top: 20, bottom: 120, left: 10, right: 60 }));
  const p = placement(img, 'good');
  const bb = alphaBBox(resample(img, N, N, { ...transformFor(p, N), kernel: 'box' }));
  assert.ok(Math.abs((bb.y0 + bb.y1) / 2 - 50) <= 1);
  assert.ok(Math.abs((bb.x0 + bb.x1) / 2 - 50) <= 1);
  assert.equal(bb.y1 - bb.y0, 84);
});

test('full-bleed art keeps its geometry: square fills the square, wide art is centred', () => {
  const sq = placement(new FImage(400, 400), 'fullbleed');
  assert.deepEqual([sq.scale * 400, sq.ox, sq.oy], [1, 0, 0]);
  const wide = placement(new FImage(600, 400), 'fullbleed');
  assert.equal(wide.scale * 600, 1);
  assert.equal(wide.ox, 0);
  assert.ok(Math.abs(wide.oy - (1 - 400 / 600) / 2) < 1e-9);
});

test('ground overlays and enclosure splits are recognised by id', () => {
  assert.ok(isGroundOverlay('terrain/coast__edge'));
  assert.ok(isGroundOverlay('decor/road__spoke'));
  assert.ok(!isGroundOverlay('terrain/plains'));
  assert.ok(!isGroundOverlay('decor/forest__plains'));
  assert.equal(SPLIT_SPRITES['colonies/stockade'], 0.58);
});

test('classify picks the layout from the id', () => {
  assert.equal(classify('units/expert-lumberjack__none').layout, 'standing');
  assert.equal(classify('units/expert-lumberjack__dragoon').layout, 'mounted');
  assert.equal(classify('units/master-sugar-planter__scout').layout, 'mounted');
  assert.equal(classify('units/frigate__none').layout, 'ship');
  assert.equal(classify('units/artillery__none').layout, 'vehicle');
  assert.equal(classify('goods/furs').layout, 'good');
  assert.equal(classify('bible/style-bible').layout, null);
});

// A Founding Father master on a 2:3 canvas: a head (or hat) from `top`, a body below it, feet at `feet`,
// centred on `cx`, ink-outlined like the masters; `hat` adds a wider block on top of the head.
function fatherImage({ w = 200, h = 300, top = 36, feet = 276, cx = 100, hat = 0 } = {}) {
  const H = feet - top, headH = Math.round(H * 0.14), hw = Math.round(H * 0.06), bw = Math.round(H * 0.12);
  return fromRgba8(w, h, paint(w, h, (x, y) => {
    const inHat = hat > 0 && y >= top && y < top + hat && Math.abs(x + 0.5 - cx) < hw + 6;
    const inHead = y >= top + hat && y < top + hat + headH && Math.abs(x + 0.5 - cx) < hw;
    const inBody = y >= top + hat + headH && y < feet && Math.abs(x + 0.5 - cx) < bw;
    if (!inHat && !inHead && !inBody) return null;
    const ink = [27, 26, 23, 255];
    if (inHat) return ink;
    const half = inHead ? hw : bw;
    if (Math.abs(x + 0.5 - cx) > half - 3 || y >= feet - 3 || y < top + hat + 3) return ink;
    return inHead ? [243, 201, 160, 255] : [168, 116, 63, 255];
  }));
}

test('Founding Father figures: 2:3 canvas, feet on 0.92, the master scale kept (a hat adds height)', () => {
  assert.deepEqual(classify('fathers/adam-smith'), { category: 'fathers', layout: 'figure' });
  assert.equal(classify('fathers/bartolome-de-las-casas').layout, 'figure');
  const H = 150, W = 100;
  const render = (img) => {
    const p = placement(img, 'figure');
    return { p, bb: alphaBBox(resample(img, W, H, { ...transformFor(p, H), kernel: 'box' })) };
  };
  // drawn to the prompt (crown at 0.12, feet at 0.92): kept as drawn
  const plain = render(fatherImage());
  assert.ok(Math.abs(plain.p.scale - 1 / 300) < 1e-12, 'the master frame sets the scale');
  assert.equal(plain.bb.y1, 138, 'feet on the 0.92 baseline');
  assert.equal(plain.bb.y1 - plain.bb.y0, 120, 'crown to soles 0.80 of the height');
  // a tall hat: the same scale, the figure is just taller
  const hatted = render(fatherImage({ top: 24, hat: 12 }));
  assert.equal(hatted.p.scale, plain.p.scale, 'a hat does not shrink the person');
  assert.equal(hatted.bb.y1, 138);
  assert.equal(hatted.bb.y0, 12);
  // drawn far too small and off-centre (model drift): scaled up to hMin, feet on the baseline, centred
  const small = render(fatherImage({ top: 150, feet: 290, cx: 60 }));
  assert.equal(small.bb.y1, 138);
  assert.ok(Math.abs(small.bb.y1 - small.bb.y0 - 0.74 * H) <= 1, `height ${small.bb.y1 - small.bb.y0} is hMin`);
  for (const { bb } of [plain, hatted, small]) assert.ok(Math.abs((bb.x0 + bb.x1) / 2 - W / 2) <= 1, 'centred');
});

test('Founding Father head crop: a square of the top 30% of the figure, centred on the head', () => {
  const img = fatherImage({ cx: 90 });
  const p = headPlacement(img);
  const H = 240; // crown 36 to feet 276
  assert.ok(Math.abs(p.crop.x1 - p.crop.x0 - 0.3 * H) < 0.2 && Math.abs(p.crop.y1 - p.crop.y0 - 0.3 * H) < 0.2, 'square, 0.3 of the figure');
  assert.ok(Math.abs((p.crop.x0 + p.crop.x1) / 2 - 90) < 0.2, 'centred on the head');
  assert.ok(Math.abs(p.crop.y0 - (36 - 0.02 * H)) < 0.2, 'a little room above the head');
  const N = 100;
  const bb = alphaBBox(resample(img, N, N, { ...transformFor(p, N), kernel: 'box' }));
  assert.ok(bb.y0 >= 5 && bb.y0 <= 8, `head top ${bb.y0} near the top`);
  assert.equal(bb.y1, N, 'the shoulders run out at the bottom edge');
  assert.ok(Math.abs((bb.x0 + bb.x1) / 2 - 50) <= 1, 'centred');
});

// ------------------------------------------------------------------ palette

test('palette quantisation picks the nearest palette colour', () => {
  const pal = new Palette([...CORE_PALETTE, ...EXTRA_PALETTE]);
  for (const hex of pal.hex) assert.equal(pal.hex[pal.nearest(hexToOklab(hex)).index], hex);
  assert.equal(pal.hex[pal.nearest(hexToOklab('#cc4030')).index], '#d23c2a'); // a slightly off red
  assert.equal(pal.hex[pal.nearest(hexToOklab('#3570b8')).index], '#3a6fb0'); // slightly off blue
  assert.equal(pal.hex[pal.nearest(hexToOklab('#000000')).index], '#1b1a17'); // black -> ink
  assert.equal(pal.hex[pal.nearest(hexToOklab('#ffffff')).index], '#fffdf6');
  // brute force: no entry is closer than the one returned
  const probe = hexToOklab('#7a9a40');
  const { index, dist } = pal.nearest(probe);
  for (let i = 0; i < pal.size; i++) assert.ok(pal.dist(probe, pal.lab[i]) >= dist - 1e-12, `entry ${i} closer than ${index}`);
});

test('chroma weighting keeps a warm off-white from snapping to skin', () => {
  const plain = new Palette(CORE_PALETTE, { chromaWeight: 1 });
  const weighted = new Palette(CORE_PALETTE, { chromaWeight: 2 });
  const coat = hexToOklab('#e8d8c8');
  assert.equal(plain.hex[plain.nearest(coat).index], '#f3c9a0');
  assert.equal(weighted.hex[weighted.nearest(coat).index], '#fbf3df');
});

test('pixel sprites use only palette colours (plus the sprite extras) and binary alpha', async () => {
  const img = cleanAlpha(figureImage({ staff: true }));
  const place = placement(img, 'standing');
  const fake = { master: img, place, ink: null, extras: new Map() };
  const { palette } = spritePalette(fake, DEFAULTS.pixel, 32);
  const allowed = new Set(palette.hex.map(pack));
  for (const n of [16, 24, 32]) {
    const { px } = renderPixel(img, null, place, n, palette, DEFAULTS.pixel);
    let opaque = 0;
    for (const v of px) {
      if (v === TRANSPARENT) continue;
      opaque++;
      assert.ok(allowed.has(v), `colour #${v.toString(16)} not in palette`);
    }
    assert.ok(opaque > n, 'something was drawn');
  }
});

// ------------------------------------------------------------------ alpha, outline, orphans

test('alpha is binarised: every pixel is fully opaque or fully transparent', async () => {
  const img = cleanAlpha(figureImage({ staff: true }));
  const place = placement(img, 'standing');
  const fake = { master: img, place, ink: null, extras: new Map() };
  for (const n of [16, 24, 32]) {
    const png = await renderPng(fake, n, 'pixel', DEFAULTS, 32);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    for (let i = 3; i < data.length; i += 4) assert.ok(data[i] === 0 || data[i] === 255, `alpha ${data[i]}`);
  }
});

function grid(T, cells) {
  const px = new Int32Array(T * T).fill(TRANSPARENT);
  for (const [x, y, v] of cells) px[y * T + x] = v;
  return px;
}
const count = (px, v) => px.reduce((n, p) => n + (p === v ? 1 : 0), 0);

test('outline pass: 4- and 8-neighbourhood rings around a 3x3 block', () => {
  const red = pack('#d23c2a');
  const block = [];
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) block.push([x, y, red]);
  const g4 = addOutline(grid(9, block), 9, 4);
  assert.equal(count(g4, INK_PACKED), 12);
  assert.equal(g4[2 * 9 + 2], TRANSPARENT, '4-neighbourhood leaves the corners out');
  const g8 = addOutline(grid(9, block), 9, 8);
  assert.equal(count(g8, INK_PACKED), 16);
  assert.equal(g8[2 * 9 + 2], INK_PACKED);
  assert.equal(count(g8, red), 9, 'the body is untouched');
});

test('outline pass: ink is not outlined again, thin props stay 1 px', () => {
  const red = pack('#d23c2a'), grey = pack('#9aa0a6');
  // an ink pixel on its own gets no outline
  assert.equal(count(addOutline(grid(5, [[2, 2, INK_PACKED]]), 5, 4), INK_PACKED), 1);
  // a vertical 1-px grey staff next to a 2x2 body: the staff is not wrapped
  const g = addOutline(grid(8, [[1, 1, grey], [1, 2, grey], [1, 3, grey], [1, 4, grey], [4, 3, red], [5, 3, red], [4, 4, red], [5, 4, red]]), 8, 4, 'keep');
  assert.equal(g[1 * 8 + 0], TRANSPARENT, 'no ink left of the staff');
  assert.equal(g[1 * 8 + 2], TRANSPARENT, 'no ink right of the staff');
  assert.equal(count(g, grey), 4);
  assert.equal(count(g, INK_PACKED), 8, 'the 2x2 body gets its 8-pixel ring');
  const gi = addOutline(grid(8, [[1, 1, grey], [1, 2, grey], [1, 3, grey]]), 8, 4, 'ink');
  assert.equal(count(gi, INK_PACKED), 3, "thin: 'ink' turns the staff into ink");
  // 'auto': a mid-grey staff stays bare, a pale 1-px leg is outlined
  const white = pack('#fffdf6');
  assert.equal(count(addOutline(grid(8, [[1, 1, grey], [1, 2, grey], [1, 3, grey]]), 8, 4, 'auto'), INK_PACKED), 0);
  assert.equal(count(addOutline(grid(8, [[1, 1, white], [1, 2, white], [1, 3, white]]), 8, 4, 'auto'), INK_PACKED), 8);
});

test('orphan cleanup drops lone pixels, fills 1-px holes, keeps lone ink', () => {
  const red = pack('#d23c2a'), blue = pack('#3a6fb0');
  const cells = [[0, 0, red]]; // isolated
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) cells.push([x, y, red]);
  const px = grid(10, cells);
  px[4 * 10 + 4] = TRANSPARENT; // hole
  px[5 * 10 + 5] = blue; // speckle
  px[5 * 10 + 4] = INK_PACKED; // an eye
  cleanupOrphans(px, 10);
  assert.equal(px[0], TRANSPARENT);
  assert.equal(px[4 * 10 + 4], red);
  assert.equal(px[5 * 10 + 5], red);
  assert.equal(px[5 * 10 + 4], INK_PACKED);
});

test('ridge keeps 1-px and straddling thin lines but not soft edges', () => {
  assert.equal(ridge(0.3, 0, 0, 0, 0), true); // 1-px line
  assert.equal(ridge(0.3, 0, 0.05, 0.25, 0), true); // stronger half of a 2-px straddle
  assert.equal(ridge(0.25, 0, 0.05, 0.3, 0), false); // weaker half
  assert.equal(ridge(0.3, 1, 1, 0, 0), false); // silhouette edge
});

// ------------------------------------------------------------------ end to end

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-pipeline-'));
  await fs.mkdir(path.join(dir, 'in/units'), { recursive: true });
  await fs.writeFile(path.join(dir, 'in/units/test-colonist__none.png'), await figurePng({ staff: true }));
  await fs.writeFile(path.join(dir, 'in/units/test-colonist__dragoon.png'), await figurePng({ staff: false, left: 40, right: 220, top: 90, bottom: 210 }));
  return dir;
}

async function hashes(dir) {
  const out = {};
  async function walk(rel) {
    for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) await walk(r);
      else out[r] = crypto.createHash('sha256').update(await fs.readFile(path.join(dir, r))).digest('hex');
    }
  }
  await walk('');
  return out;
}

test('deterministic: the same input gives byte-identical PNGs, manifest and sheet', async () => {
  const dir = await fixture();
  const build = path.join(HERE, '..', 'build.mjs');
  for (const o of ['out1', 'out2']) await run(process.execPath, [build, '--in', path.join(dir, 'in'), '--out', path.join(dir, o)]);
  const [a, b] = [await hashes(path.join(dir, 'out1')), await hashes(path.join(dir, 'out2'))];
  assert.ok(Object.keys(a).length >= 2 * 7 + 2, 'all sizes, manifest and sheet written');
  assert.deepEqual(a, b);
  const m = JSON.parse(await fs.readFile(path.join(dir, 'out1/manifest.json'), 'utf8'));
  const s = m.sprites['units/test-colonist__none'];
  assert.equal(s.files['24'].mode, 'pixel');
  assert.equal(s.files['48'].mode, 'smooth');
  assert.equal(s.files['48'].file, 'units/test-colonist__none@48.png');
  assert.deepEqual(s.anchor, { x: 0.5, y: 0.94 });
  await fs.rm(dir, { recursive: true, force: true });
});

test('--pixel-max moves the boundary', async () => {
  const dir = await fixture();
  const build = path.join(HERE, '..', 'build.mjs');
  await run(process.execPath, [build, '--in', path.join(dir, 'in'), '--out', path.join(dir, 'o'), '--sizes', '24,32,64', '--pixel-max', '24', '--no-sheet']);
  const m = JSON.parse(await fs.readFile(path.join(dir, 'o/manifest.json'), 'utf8'));
  const f = m.sprites['units/test-colonist__none'].files;
  assert.deepEqual(Object.keys(f), ['24', '32', '64']);
  assert.equal(f['24'].mode, 'pixel');
  assert.equal(f['32'].mode, 'smooth');
  await fs.rm(dir, { recursive: true, force: true });
});

test('Founding Fathers: full figures (2:3, by height) and head crops in the manifest; UI copied as is', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-pipeline-'));
  await fs.mkdir(path.join(dir, 'in/fathers'), { recursive: true });
  await fs.mkdir(path.join(dir, 'in/ui'), { recursive: true });
  await fs.writeFile(path.join(dir, 'in/fathers/test-father.png'), await encodePng(200, 300, toRgba8(fatherImage())));
  const hall = await encodePng(300, 200, paint(300, 200, (x, y) => (y < 120 ? [168, 116, 63, 255] : [200, 149, 90, 255])));
  await fs.writeFile(path.join(dir, 'in/ui/test-hall.png'), hall);
  const build = path.join(HERE, '..', 'build.mjs');
  await run(process.execPath, [build, '--in', path.join(dir, 'in'), '--out', path.join(dir, 'o'), '--sizes', '16,32,64']);
  const m = JSON.parse(await fs.readFile(path.join(dir, 'o/manifest.json'), 'utf8'));
  const fig = m.sprites['fathers/test-father'];
  assert.equal(fig.layout, 'figure');
  assert.equal(fig.head, 'fathers/test-father__head');
  assert.deepEqual(fig.anchor, { x: 0.5, y: 0.92 });
  assert.deepEqual(Object.keys(fig.files), ['144', '192', '288', '384']);
  for (const [h, f] of Object.entries(fig.files)) {
    assert.equal(f.file, `fathers/test-father@${h}.png`);
    const meta = await sharp(path.join(dir, 'o', f.file)).metadata();
    assert.deepEqual([meta.width, meta.height], [Number(h) * 2 / 3, Number(h)], '2:3 canvas');
    assert.deepEqual([f.width, f.height], [meta.width, meta.height]);
  }
  const { data, info } = await sharp(path.join(dir, 'o/fathers/test-father@384.png')).raw().toBuffer({ resolveWithObject: true });
  let feet = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] >= 128) feet = Math.max(feet, Math.floor((i - 3) / 4 / info.width) + 1);
  assert.ok(Math.abs(feet - 0.92 * 384) <= 1, `feet at ${feet}`);
  const head = m.sprites['fathers/test-father__head'];
  assert.equal(head.layout, 'head');
  assert.equal(head.from, 'fathers/test-father');
  assert.deepEqual(head.source, fig.source);
  assert.ok(head.crop.x1 > head.crop.x0);
  assert.deepEqual(Object.keys(head.files), ['16', '32', '64']);
  assert.equal(head.files['16'].mode, 'pixel');
  assert.equal(head.files['64'].mode, 'smooth');
  for (const n of [16, 32, 64]) {
    const meta = await sharp(path.join(dir, 'o', `fathers/test-father__head@${n}.png`)).metadata();
    assert.deepEqual([meta.width, meta.height], [n, n]);
  }
  const ui = m.sprites['ui/test-hall'];
  assert.equal(ui.layout, 'fullbleed');
  assert.deepEqual(ui.full, { file: 'ui/test-hall.png', width: 300, height: 200 });
  assert.deepEqual(await fs.readFile(path.join(dir, 'o/ui/test-hall.png')), hall, 'the UI master copied unchanged');
  const sheet = await fs.readFile(path.join(dir, 'o/index.html'), 'utf8');
  assert.ok(sheet.includes('width="256" height="384"'), 'the contact sheet shows the figure at 2:3');
  // a second run removes what the first wrote before writing again (the UI copy included)
  await fs.rm(path.join(dir, 'in/ui/test-hall.png'));
  await run(process.execPath, [build, '--in', path.join(dir, 'in'), '--out', path.join(dir, 'o'), '--sizes', '16,32,64', '--no-sheet']);
  await assert.rejects(fs.access(path.join(dir, 'o/ui/test-hall.png')));
  await fs.rm(dir, { recursive: true, force: true });
});
