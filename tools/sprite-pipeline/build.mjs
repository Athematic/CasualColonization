#!/usr/bin/env node
// Sprite pipeline: sprite masters -> per-size runtime sprites.
//   node tools/sprite-pipeline/build.mjs [--in DIR|URL] [--out DIR] [--sizes 16,24,...] [--pixel-max 32]
//   node tools/sprite-pipeline/build.mjs --in .../edited/bold --grid-in .../edited/pixel-32
//   node tools/sprite-pipeline/build.mjs --in .../edited/pixel-32 --grid 32
// See README.md in this folder.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { DEFAULTS, DEFAULT_PIXEL_MAX, DEFAULT_SIZES, TUNING_SPRITES, TUNING_VARIANTS, mergeSettings } from './lib/config.mjs';
import { GRID_DEFAULTS, gridSizeFromDir, placeGrid, snapGrid, spriteColors, upscale } from './lib/grid.mjs';
import { encodePng } from './lib/image.mjs';
import { LAYOUTS, classify } from './lib/normalise.mjs';
import { basePalette, prepare, renderPng, spritePalette } from './lib/process.mjs';
import { contactSheet } from './lib/sheet.mjs';
import { DEFAULT_USER_AGENT, hasProxyEnv, isUrl, listLocalIds, resolveIds, syncRemote } from './lib/source.mjs';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ORIGINAL_MASTERS = path.join(REPO, 'tools/image-gen/output/sprites');

const HELP = `Sprite pipeline: masters -> runtime sprites, manifest and contact sheet.

Usage: node tools/sprite-pipeline/build.mjs [options]

  --in DIR|URL        masters: a folder, or a base URL with the same layout
                      (default tools/image-gen/output/sprites). Edit-Images.ps1 redraws work too:
                      --in tools/image-gen/output/edited/bold
  --grid-in DIR       a folder of pixel-grid redraws (Edit-Images.ps1 -Mode pixel), e.g.
                      tools/image-gen/output/edited/pixel-32; repeatable. The grid size comes from the
                      folder name (pixel-N) or --grid. That size is snapped from the grid instead of
                      reduced from --in; the other sizes come from --in as usual
  --grid N            with --grid-in: the grid size for folders not named pixel-N. Without --grid-in:
                      grid-only run, --in is the pixel-grid folder and only the N x N sprites are made
  --upscales LIST     integer upscales written next to each grid sprite (default 2,4; "" = none)
  --grid-place MODE   layout (default): move the grid sprite by whole pixels onto its category's
                      baseline and centre; none: keep it where the model drew it
  --compare-in DIR    original masters for the comparison section of the contact sheet (default
                      tools/image-gen/output/sprites when --in or --grid-in points elsewhere)
  --no-compare        no comparison section
  --ids FILE          ids to fetch for a URL source (one per line, or a JSON array);
                      default: tools/image-gen/output/manifest.json, else docs/SPRITE_PROMPTS.md
  --cache DIR         download cache for a URL source (default tools/sprite-pipeline/cache)
  --user-agent UA     User-Agent for downloads (default "${DEFAULT_USER_AGENT}",
                      falling back to a browser string if the server's firewall answers 455)
  --out DIR           output folder (default tools/sprite-pipeline/out)
  --sizes LIST        output sizes in px (default ${DEFAULT_SIZES.join(',')})
  --pixel-max N       sizes <= N get the pixel-art treatment, larger ones the smooth one (default ${DEFAULT_PIXEL_MAX})
  --only LIST         only ids containing one of these comma-separated substrings
  --palette NAME      core | extended (default ${DEFAULTS.pixel.palette}); also used to snap grid cells
  --extra-colors N    per-sprite extra pixel colours, 0 = off (default ${DEFAULTS.pixel.extraColors})
  --outline N         4 | 8 | none (default ${DEFAULTS.pixel.outline})
  --dither            ordered dithering in pixel sizes (default off)
  --no-snap           pixel sizes and grid cells keep their averaged colours instead of snapping to the palette
  --sharpen X         unsharp amount for smooth sizes (default ${DEFAULTS.smooth.sharpen})
  --settings FILE     JSON with overrides, e.g. {"pixel": {"inkKeep": 0.5}, "grid": {"minFidelity": 0.85}}
  --no-sheet          skip the contact sheet (index.html and _sheet/)
  --no-tuning         skip the tuning section of the contact sheet
  -h, --help
`;

function parse() {
  const { values } = parseArgs({
    options: {
      in: { type: 'string' }, ids: { type: 'string' }, 'user-agent': { type: 'string' }, cache: { type: 'string' }, out: { type: 'string' },
      sizes: { type: 'string' }, 'pixel-max': { type: 'string' }, only: { type: 'string' },
      palette: { type: 'string' }, 'extra-colors': { type: 'string' }, outline: { type: 'string' },
      dither: { type: 'boolean' }, 'no-snap': { type: 'boolean' }, sharpen: { type: 'string' },
      settings: { type: 'string' }, 'no-sheet': { type: 'boolean' }, 'no-tuning': { type: 'boolean' },
      grid: { type: 'string' }, 'grid-in': { type: 'string', multiple: true }, upscales: { type: 'string' },
      'grid-place': { type: 'string' }, 'compare-in': { type: 'string' }, 'no-compare': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { process.stdout.write(HELP); process.exit(0); }
  return values;
}

const num = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name}: not a number: ${v}`);
  return n;
};

const exists = (f) => fs.access(f).then(() => true, () => false);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const label = (dir) => (path.relative(REPO, dir).startsWith('..') ? dir : path.relative(REPO, dir).split(path.sep).join('/'));

async function main() {
  const a = parse();
  // Node's fetch() ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node 22.21+):
  // behind a proxy, run ourselves again with it set.
  if (a.in && isUrl(a.in) && hasProxyEnv() && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    process.exit(r.status ?? 1);
  }
  const t0 = Date.now();
  const outDir = path.resolve(a.out ?? path.join(HERE, 'out'));
  const over = a.settings ? JSON.parse(await fs.readFile(a.settings, 'utf8')) : {};
  const px = {};
  if (a.palette) px.palette = a.palette;
  if (a['extra-colors'] !== undefined) px.extraColors = num(a['extra-colors'], 'extra-colors');
  if (a.outline) px.outline = a.outline === 'none' ? 'none' : num(a.outline, 'outline');
  if (a.dither) px.dither = true;
  if (a['no-snap']) px.paletteSnap = false;
  const settings = mergeSettings(mergeSettings(DEFAULTS, over), {
    pixel: px,
    smooth: a.sharpen !== undefined ? { sharpen: num(a.sharpen, 'sharpen') } : {},
  });

  // ---- grid sources (pixel-grid redraws)
  const gridOpt = a.grid !== undefined ? num(a.grid, 'grid') : null;
  const gridIns = a['grid-in'] ?? [];
  const gridOnly = gridOpt !== null && gridIns.length === 0;
  const input = a.in ?? ORIGINAL_MASTERS;
  if (gridOnly && isUrl(input)) throw new Error('--grid without --grid-in needs a local --in folder of pixel-grid redraws');
  const gridSources = (gridOnly ? [input] : gridIns).map((d) => {
    const n = gridOnly ? gridOpt : (gridSizeFromDir(path.resolve(d)) ?? gridOpt);
    if (!Number.isInteger(n) || n < 4 || n > 256) throw new Error(`--grid-in ${d}: no grid size (name the folder pixel-N or pass --grid N)`);
    return { dir: path.resolve(d), n };
  });
  const gridSettings = { ...GRID_DEFAULTS, ...(over.grid ?? {}) };
  const upscales = (a.upscales ?? '2,4').split(',').map((s) => s.trim()).filter(Boolean).map((s) => num(s, 'upscales'));
  const gridPlace = a['grid-place'] ?? 'layout';
  if (!['layout', 'none'].includes(gridPlace)) throw new Error('--grid-place: layout | none');
  const gridPalette = settings.pixel.paletteSnap ? basePalette(settings.pixel.palette, settings.pixel.chromaWeight) : null;

  // ---- sizes: none from the masters in a grid-only run
  const sizes = gridOnly ? [] : (a.sizes ? a.sizes.split(',').map((s) => num(s, 'sizes')) : DEFAULT_SIZES).sort((x, y) => x - y);
  const pixelMax = a['pixel-max'] !== undefined ? num(a['pixel-max'], 'pixel-max') : DEFAULT_PIXEL_MAX;
  const pixelSizes = sizes.filter((n) => n <= pixelMax);
  const smoothSizes = sizes.filter((n) => n > pixelMax);
  const refSize = pixelSizes.length ? pixelSizes[pixelSizes.length - 1] : 32;
  const gridSizes = [...new Set(gridSources.map((g) => g.n))].sort((x, y) => x - y);

  // ---- source
  let srcDir = null, ids = [], sourceLabel;
  if (gridOnly) {
    sourceLabel = `${label(path.resolve(input))} (pixel grid ${gridOpt})`;
  } else if (isUrl(input)) {
    const { ids: wanted, from } = await resolveIds({
      idsFile: a.ids,
      imageGenManifest: path.join(REPO, 'tools/image-gen/output/manifest.json'),
      promptsDoc: path.join(REPO, 'docs/SPRITE_PROMPTS.md'),
    });
    srcDir = path.resolve(a.cache ?? path.join(HERE, 'cache'));
    console.log(`Fetching ${wanted.length} ids (from ${path.relative(process.cwd(), from).startsWith('..') ? from : path.relative(process.cwd(), from)}) from ${input} into ${srcDir}`);
    const st = await syncRemote(input, wanted, srcDir, { log: console.log, userAgent: a['user-agent'] });
    console.log(`  ${st.fetched.length} downloaded, ${st.cached.length} unchanged, ${st.missing.length} missing`);
    if (st.blocked) console.log(`  ${st.blocked} requests were blocked by the server's firewall (HTTP 455): try --user-agent "<a browser User-Agent>"`);
    const missing = new Set(st.missing);
    ids = wanted.filter((id) => !missing.has(id));
    sourceLabel = input;
  } else {
    srcDir = path.resolve(input);
    ids = await listLocalIds(srcDir);
    sourceLabel = label(srcDir);
  }
  // Edit-Images.ps1 writes edited/<mode>/<category>/<id>.png: the root itself is not a master folder.
  const modeDirIds = (list) => list.filter((id) => /^(bold|pixel-\d+)\//.test(id));
  for (const [dir, list] of [[srcDir, ids], ...await Promise.all(gridSources.map(async (g) => [g.dir, await listLocalIds(g.dir)]))]) {
    if (dir && modeDirIds(list).length) {
      throw new Error(`${dir} looks like the Edit-Images.ps1 output root (it holds bold/ and pixel-N/ folders): `
        + `point --in at ${path.join(dir, 'bold')} for the smooth sizes, and use --grid-in ${path.join(dir, 'pixel-32')} for a pixel grid`);
    }
  }
  const mainSet = new Set(ids);
  for (const g of gridSources) {
    g.ids = new Set(await listLocalIds(g.dir));
    for (const id of [...g.ids].sort()) if (!mainSet.has(id) && !ids.includes(id)) ids.push(id);
  }
  if (a.only) {
    const keys = a.only.split(',').map((s) => s.trim()).filter(Boolean);
    ids = ids.filter((id) => keys.some((k) => id.includes(k)));
  }

  // ---- comparison source: the original masters, when the input is something else (redraws)
  let compareDir = null;
  if (!a['no-compare'] && !(a['no-sheet'])) {
    if (a['compare-in']) compareDir = path.resolve(a['compare-in']);
    else if ((gridSources.length || (srcDir && srcDir !== path.resolve(ORIGINAL_MASTERS))) && !isUrl(input) && await exists(ORIGINAL_MASTERS)) {
      if (!srcDir || path.resolve(srcDir) !== path.resolve(ORIGINAL_MASTERS)) compareDir = ORIGINAL_MASTERS;
    }
  }
  const compareSizes = gridOnly ? [16, 24, 32, 48] : [...pixelSizes, ...smoothSizes.slice(0, 1)];

  // ---- clean previous output (only what we wrote before)
  const oldManifest = await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (oldManifest?.sprites) {
    for (const sp of Object.values(oldManifest.sprites)) {
      for (const f of Object.values(sp.files ?? {})) await fs.rm(path.join(outDir, f.file), { force: true });
      for (const g of Object.values(sp.grid ?? {})) for (const f of Object.values(g.upscales ?? {})) await fs.rm(path.join(outDir, f), { force: true });
    }
  }
  await fs.rm(path.join(outDir, '_sheet'), { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const write = async (rel, buf) => {
    const f = path.join(outDir, rel);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, buf);
  };

  const manifest = {
    format: 'casual-colonization-sprites',
    version: 1,
    sizes: [...new Set([...sizes, ...gridSizes])].sort((x, y) => x - y),
    pixelMax,
    pixelSizes,
    smoothSizes,
    gridSizes,
    settings: gridSources.length ? { ...settings, grid: gridSettings } : settings,
    sprites: {},
  };
  const sheet = [];
  const tuning = [];
  const compare = [];
  const report = [];
  const tuningIds = new Set(TUNING_SPRITES);
  const boundary = [...pixelSizes.slice(-2), ...smoothSizes.slice(0, 1)];
  const sheetOn = !a['no-sheet'];
  const inLabel = srcDir ? path.basename(srcDir) : '';
  const inName = inLabel === 'bold' ? 'bold redraw' : inLabel === 'sprites' ? 'masters' : inLabel;

  for (const id of ids) {
    const t1 = Date.now();
    const { category, layout } = classify(id);
    if (!layout) { console.log(`- ${id}: reference sheet, skipped`); continue; }
    const L = LAYOUTS[layout];
    const inMain = mainSet.has(id) && !gridOnly;
    const file = inMain ? path.join(srcDir, `${id}.png`) : null;
    const sp = inMain ? await prepare(id, file, settings) : null;
    const bytes = inMain ? await fs.readFile(file) : null;
    const { extras } = sp && pixelSizes.length ? spritePalette(sp, settings.pixel, refSize) : { extras: [] };
    const entry = {
      category,
      layout,
      source: inMain ? { file: `${id}.png`, sha256: sha256(bytes) } : null,
      anchor: L.anchor === 'bottom' ? { x: 0.5, y: L.base } : { x: 0.5, y: 0.5 },
      pixelColors: extras,
      files: {},
    };
    const row = { id, layout, extras, list: [], compare: {} };
    const grids = gridSources.filter((g) => g.ids.has(id));
    const gridN = new Set(grids.map((g) => g.n));

    // sizes from the masters (the size of a grid redraw comes from the grid instead)
    if (sp) {
      for (const n of sizes) {
        if (gridN.has(n)) continue;
        const mode = n <= pixelMax ? 'pixel' : 'smooth';
        const rel = `${id}@${n}.png`;
        await write(rel, await renderPng(sp, n, mode, settings, refSize));
        entry.files[n] = { file: rel, mode };
      }
    }

    // pixel-grid redraws -> exact n x n
    const notes = [];
    for (const g of grids) {
      const gfile = path.join(g.dir, `${id}.png`);
      const gbytes = await fs.readFile(gfile);
      const { data, info } = await sharp(gbytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const r = snapGrid(data, info.width, info.height, g.n, { ...gridSettings, palette: gridPalette });
      const placed = gridPlace === 'layout' ? placeGrid(r.rgba, g.n, layout) : { rgba: r.rgba, dx: 0, dy: 0 };
      const rel = `${id}@${g.n}.png`;
      await write(rel, await encodePng(g.n, g.n, placed.rgba));
      const ups = {};
      for (const k of upscales) {
        const urel = `${id}@${g.n}x${k}.png`;
        await write(urel, await encodePng(g.n * k, g.n * k, upscale(placed.rgba, g.n, k)));
        ups[k] = urel;
      }
      entry.files[g.n] = { file: rel, mode: 'grid', fidelity: r.fidelity };
      entry.grid ??= {};
      entry.grid[g.n] = {
        source: { dir: label(g.dir), file: `${id}.png`, sha256: sha256(gbytes), width: info.width, height: info.height },
        fidelity: r.fidelity, contentCells: r.contentCells, badCells: r.badCells,
        offset: r.offset, align: r.align, detected: r.detected, shift: { dx: placed.dx, dy: placed.dy },
        colors: spriteColors(placed.rgba).length,
        flagged: r.flagged, reasons: r.reasons, upscales: ups,
      };
      report.push({ id, n: g.n, fidelity: r.fidelity, badCells: r.badCells, contentCells: r.contentCells, detected: r.detected, flagged: r.flagged, reasons: r.reasons, bad: r.bad.slice(0, 50) });
      notes.push(`grid ${g.n}: fidelity ${r.fidelity.toFixed(3)}${r.flagged ? ' FLAGGED (' + r.reasons.join('; ') + ')' : ''}`);
    }
    // files in size order
    entry.files = Object.fromEntries(Object.entries(entry.files).sort((x, y) => Number(x[0]) - Number(y[0])));
    manifest.sprites[id] = entry;

    if (sheetOn) {
      if (inMain) {
        const orig = `_sheet/orig/${id}.png`;
        await write(orig, await sharp(bytes).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
        row.orig = orig;
      } else if (grids.length) {
        const orig = `_sheet/orig/${id}.png`;
        await write(orig, await sharp(path.join(grids[0].dir, `${id}.png`)).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
        row.orig = orig;
      }
      for (const [n, f] of Object.entries(entry.files)) {
        row.list.push({ n: Number(n), mode: f.mode, file: f.file, note: f.mode === 'grid' ? `fidelity ${f.fidelity.toFixed(3)}${entry.grid[n].flagged ? ' · flagged' : ''}` : '', bad: f.mode === 'grid' && entry.grid[n].flagged });
      }
      if (sp) {
        for (const n of boundary) {
          row.compare[n] = {};
          for (const mode of ['smooth', 'pixel']) {
            const runtime = entry.files[n]?.mode === mode;
            const rel = runtime ? entry.files[n].file : `_sheet/compare/${id}@${n}.${mode}.png`;
            if (!runtime) await write(rel, await renderPng(sp, n, mode, settings, refSize));
            row.compare[n][mode] = rel;
          }
        }
      }
      sheet.push(row);

      // original masters -> pipeline | this input -> pipeline | pixel grid(s)
      if (compareDir && await exists(path.join(compareDir, `${id}.png`))) {
        const osp = await prepare(id, path.join(compareDir, `${id}.png`), settings);
        if (osp) {
          const oref = Math.max(...compareSizes.filter((n) => n <= pixelMax), 0) || 32;
          const cols = [];
          const ofiles = {};
          for (const n of compareSizes) {
            const mode = n <= pixelMax ? 'pixel' : 'smooth';
            const rel = `_sheet/compare-orig/${id}@${n}.png`;
            await write(rel, await renderPng(osp, n, mode, settings, oref));
            ofiles[n] = { file: rel, mode };
          }
          cols.push({ label: 'original → pipeline', files: ofiles });
          if (sp) {
            const ifiles = {};
            for (const n of compareSizes) {
              const mode = n <= pixelMax ? 'pixel' : 'smooth';
              let rel = entry.files[n]?.mode === mode ? entry.files[n].file : null;
              if (!rel) { rel = `_sheet/compare-in/${id}@${n}.png`; await write(rel, await renderPng(sp, n, mode, settings, refSize)); }
              ifiles[n] = { file: rel, mode };
            }
            cols.push({ label: `${inName} → pipeline`, files: ifiles });
          }
          for (const g of grids) {
            const gr = entry.grid[g.n];
            cols.push({ label: `pixel grid ${g.n}`, files: { [g.n]: { file: entry.files[g.n].file, mode: 'grid' } }, note: `fidelity ${gr.fidelity.toFixed(3)}${gr.flagged ? ' · flagged' : ''}`, bad: gr.flagged });
          }
          compare.push({ id, cols });
        }
      }

      if (sp && !a['no-tuning'] && tuningIds.has(id)) {
        const t = { id, variants: [] };
        for (const v of TUNING_VARIANTS) {
          const s = mergeSettings(settings, { pixel: v.pixel });
          const files = {};
          for (const n of [16, 24, 32]) {
            const rel = `_sheet/tuning/${v.key}/${id}@${n}.png`;
            await write(rel, await renderPng(sp, n, 'pixel', s, 32));
            files[n] = rel;
          }
          t.variants.push({ label: v.label, files });
        }
        tuning.push(t);
      }
    }
    console.log(`- ${id} (${layout}) ${Date.now() - t1} ms${extras.length ? `, extra colours ${extras.join(' ')}` : ''}${notes.length ? ', ' + notes.join(', ') : ''}`);
  }

  await write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  const flagged = report.filter((r) => r.flagged);
  if (report.length && sheetOn) {
    await write('_sheet/grid-report.json', JSON.stringify({ settings: gridSettings, sprites: report, flagged: flagged.map(({ id, n, fidelity, reasons }) => ({ id, n, fidelity, reasons })) }, null, 2) + '\n');
  }
  if (sheetOn) {
    tuning.sort((x, y) => TUNING_SPRITES.indexOf(x.id) - TUNING_SPRITES.indexOf(y.id));
    await write('index.html', contactSheet({
      sprites: sheet, pixelSizes, smoothSizes, boundary, tuning, tuningSizes: [16, 24, 32], settings: manifest.settings, sourceLabel,
      compare, compareLabel: compareDir ? label(compareDir) : null, gridReport: report, gridSettings,
    }));
  }
  console.log(`Wrote ${Object.keys(manifest.sprites).length} sprites (sizes ${manifest.sizes.join(', ')}) to ${outDir} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (report.length) {
    const mean = report.reduce((s, r) => s + r.fidelity, 0) / report.length;
    console.log(`Grid fidelity: ${report.length} grid sprites, mean ${mean.toFixed(3)}, ${flagged.length} flagged (below ${gridSettings.minFidelity} or more than ${Math.round(gridSettings.maxBadShare * 100)}% non-uniform cells).`);
    for (const f of flagged) console.log(`  flagged: ${f.id} @${f.n}: ${f.reasons.join('; ')}`);
    for (const n of [...new Set(flagged.map((f) => f.n))]) {
      const list = flagged.filter((f) => f.n === n).map((f) => `'${f.id}'`).join(',');
      console.log(`  redo them with: pwsh ./tools/image-gen/Edit-Images.ps1 -Mode pixel -Grid ${n} -Only ${list} -Force`);
    }
  }
  if (sheetOn) console.log(`Contact sheet: ${path.join(outDir, 'index.html')}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
