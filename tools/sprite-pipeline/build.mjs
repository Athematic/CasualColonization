#!/usr/bin/env node
// Sprite pipeline: sprite masters -> per-size runtime sprites.
//   node tools/sprite-pipeline/build.mjs [--in DIR|URL] [--out DIR] [--sizes 16,24,...] [--pixel-max 32]
// See README.md in this folder.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { DEFAULTS, DEFAULT_PIXEL_MAX, DEFAULT_SIZES, TUNING_SPRITES, TUNING_VARIANTS, mergeSettings } from './lib/config.mjs';
import { prepare, renderPng, spritePalette } from './lib/process.mjs';
import { contactSheet } from './lib/sheet.mjs';
import { DEFAULT_USER_AGENT, hasProxyEnv, isUrl, listLocalIds, resolveIds, syncRemote } from './lib/source.mjs';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const HELP = `Sprite pipeline: masters -> runtime sprites, manifest and contact sheet.

Usage: node tools/sprite-pipeline/build.mjs [options]

  --in DIR|URL        masters: a folder, or a base URL with the same layout
                      (default tools/image-gen/output/sprites)
  --ids FILE          ids to fetch for a URL source (one per line, or a JSON array);
                      default: tools/image-gen/output/manifest.json, else docs/SPRITE_PROMPTS.md
  --cache DIR         download cache for a URL source (default tools/sprite-pipeline/cache)
  --user-agent UA     User-Agent for downloads (default "${DEFAULT_USER_AGENT}",
                      falling back to a browser string if the server's firewall answers 455)
  --out DIR           output folder (default tools/sprite-pipeline/out)
  --sizes LIST        output sizes in px (default ${DEFAULT_SIZES.join(',')})
  --pixel-max N       sizes <= N get the pixel-art treatment, larger ones the smooth one (default ${DEFAULT_PIXEL_MAX})
  --only LIST         only ids containing one of these comma-separated substrings
  --palette NAME      core | extended (default ${DEFAULTS.pixel.palette})
  --extra-colors N    per-sprite extra pixel colours, 0 = off (default ${DEFAULTS.pixel.extraColors})
  --outline N         4 | 8 | none (default ${DEFAULTS.pixel.outline})
  --dither            ordered dithering in pixel sizes (default off)
  --no-snap           pixel sizes keep averaged colours instead of snapping to the palette
  --sharpen X         unsharp amount for smooth sizes (default ${DEFAULTS.smooth.sharpen})
  --settings FILE     JSON with overrides, e.g. {"pixel": {"inkKeep": 0.5}, "smooth": {"sharpen": 0.2}}
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
  const sizes = (a.sizes ? a.sizes.split(',').map((s) => num(s, 'sizes')) : DEFAULT_SIZES).sort((x, y) => x - y);
  const pixelMax = a['pixel-max'] !== undefined ? num(a['pixel-max'], 'pixel-max') : DEFAULT_PIXEL_MAX;
  const pixelSizes = sizes.filter((n) => n <= pixelMax);
  const smoothSizes = sizes.filter((n) => n > pixelMax);
  const refSize = pixelSizes.length ? pixelSizes[pixelSizes.length - 1] : 32;

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

  // ---- source
  const input = a.in ?? path.join(REPO, 'tools/image-gen/output/sprites');
  let srcDir, ids, sourceLabel;
  if (isUrl(input)) {
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
    sourceLabel = path.relative(REPO, srcDir) || srcDir;
  }
  if (a.only) {
    const keys = a.only.split(',').map((s) => s.trim()).filter(Boolean);
    ids = ids.filter((id) => keys.some((k) => id.includes(k)));
  }

  // ---- clean previous output (only what we wrote before)
  const oldManifest = await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (oldManifest?.sprites) {
    for (const sp of Object.values(oldManifest.sprites)) {
      for (const f of Object.values(sp.files ?? {})) await fs.rm(path.join(outDir, f.file), { force: true });
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
    sizes,
    pixelMax,
    pixelSizes,
    smoothSizes,
    settings,
    sprites: {},
  };
  const sheet = [];
  const tuning = [];
  const tuningIds = new Set(TUNING_SPRITES);
  const boundary = [...pixelSizes.slice(-2), ...smoothSizes.slice(0, 1)];
  const sheetOn = !a['no-sheet'];

  for (const id of ids) {
    const file = path.join(srcDir, `${id}.png`);
    const t1 = Date.now();
    const sp = await prepare(id, file, settings);
    if (!sp) { console.log(`- ${id}: reference sheet, skipped`); continue; }
    const bytes = await fs.readFile(file);
    const { extras } = pixelSizes.length ? spritePalette(sp, settings.pixel, refSize) : { extras: [] };
    const L = sp.place.layout;
    const entry = {
      category: sp.category,
      layout: sp.layout,
      source: { file: `${id}.png`, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
      anchor: L.anchor === 'bottom' ? { x: 0.5, y: L.base } : { x: 0.5, y: 0.5 },
      pixelColors: extras,
      files: {},
    };
    const row = { id, layout: sp.layout, extras, files: {}, compare: {} };
    for (const n of sizes) {
      const mode = n <= pixelMax ? 'pixel' : 'smooth';
      const rel = `${id}@${n}.png`;
      await write(rel, await renderPng(sp, n, mode, settings, refSize));
      entry.files[n] = { file: rel, mode };
      row.files[n] = rel;
    }
    manifest.sprites[id] = entry;

    if (sheetOn) {
      const orig = `_sheet/orig/${id}.png`;
      await write(orig, await sharp(bytes).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
      row.orig = orig;
      for (const n of boundary) {
        row.compare[n] = {};
        for (const mode of ['smooth', 'pixel']) {
          const runtime = (n <= pixelMax ? 'pixel' : 'smooth') === mode;
          const rel = runtime ? row.files[n] : `_sheet/compare/${id}@${n}.${mode}.png`;
          if (!runtime) await write(rel, await renderPng(sp, n, mode, settings, refSize));
          row.compare[n][mode] = rel;
        }
      }
      sheet.push(row);
      if (!a['no-tuning'] && tuningIds.has(id)) {
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
    console.log(`- ${id} (${sp.layout}) ${Date.now() - t1} ms${extras.length ? `, extra colours ${extras.join(' ')}` : ''}`);
  }

  await write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  if (sheetOn) {
    tuning.sort((x, y) => TUNING_SPRITES.indexOf(x.id) - TUNING_SPRITES.indexOf(y.id));
    await write('index.html', contactSheet({
      sprites: sheet, pixelSizes, smoothSizes, boundary, tuning, tuningSizes: [16, 24, 32], settings, sourceLabel,
    }));
  }
  console.log(`Wrote ${Object.keys(manifest.sprites).length} sprites x ${sizes.length} sizes to ${outDir} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (sheetOn) console.log(`Contact sheet: ${path.join(outDir, 'index.html')}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
