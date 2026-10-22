// Copies the runtime sprite set (the output of tools/sprite-pipeline) into a built site, so the
// "Ligne claire (painted)" style finds it at assets/runtime/ next to index.html.
//
// Usage: node scripts/copy-runtime.mjs <site dir> [--from <runtime dir>]
//   <site dir>   the built site, e.g. site (npm run release) or apps/web/dist
//   --from DIR   the pipeline output; default $CC_RUNTIME_DIR, else tools/sprite-pipeline/out
//   --sizes LIST only these sizes, e.g. 16,24,32,48,64,96,128 (default: all); the copied
//                manifest lists only those, so the style never asks for a size that is not there
//
// Copies manifest.json and every file it lists (nothing else: not the contact sheet). When there is
// no runtime set it says so and exits without error: the style then loads the sprites from the
// server, or draws procedurally. The copied images are gitignored; upload them to the server
// (https://casual.spence.dk/assets/runtime/) rather than committing them.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = resolve(option('--from') ?? (process.env.CC_RUNTIME_DIR || 'tools/sprite-pipeline/out'));
const only = option('--sizes')?.split(',').map(Number);
const site = args.find((a, i) => !a.startsWith('--') && !['--from', '--sizes'].includes(args[i - 1]));
if (!site) {
  console.error('Usage: node scripts/copy-runtime.mjs <site dir> [--from <runtime dir>]');
  process.exit(1);
}
const manifestFile = join(from, 'manifest.json');
if (!existsSync(manifestFile)) {
  console.log(`No runtime sprite set at ${from} (no manifest.json); skipped. The painted style will load sprites from the server or draw procedurally.`);
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const dest = resolve(site, 'assets/runtime');
let files = 0;
let bytes = 0;
const copy = (rel) => {
  const src = join(from, rel);
  if (!existsSync(src)) return;
  const out = join(dest, rel);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(src, out);
  files++;
  bytes += statSync(src).size;
};
const keep = (n) => !only || only.includes(Number(n));
for (const sprite of Object.values(manifest.sprites ?? {})) {
  for (const [n, f] of Object.entries(sprite.files ?? {})) {
    if (keep(n)) copy(f.file);
    else delete sprite.files[n];
  }
}
for (const k of ['sizes', 'pixelSizes', 'smoothSizes']) if (Array.isArray(manifest[k])) manifest[k] = manifest[k].filter(keep);
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
files++;
console.log(`Copied the runtime sprite set (${files} files, ${(bytes / 1048576).toFixed(1)} MB) from ${from} to ${dest}`);
