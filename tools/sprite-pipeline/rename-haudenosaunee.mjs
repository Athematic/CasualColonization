#!/usr/bin/env node
// Renames the Haudenosaunee's settlement sprites from their old id, `settlements/iroquois*`, to
// `settlements/haudenosaunee*` (docs/design/native-nations.md sections 18 and 19), in every local
// copy of the art: the generator's masters, thumbnails and redraws with their manifests, the
// pipeline's runtime set, manifest and download cache, and the runtime copies in the web app and the
// built site. The engine's id became `haudenosaunee` in section 18; the painted pack looks for the
// new name first and falls back to the old one, so the art works before, during and after this.
//
// Usage: node tools/sprite-pipeline/rename-haudenosaunee.mjs [--dry-run] [--root DIR]... [--only-roots]
//   (or: npm run sprites:rename-haudenosaunee -- --dry-run)
//   --dry-run     print what would change, change nothing
//   --root DIR    one more folder to treat (repeatable), e.g. a local mirror of the server's
//                 assets/sprites/, assets/thumbs/ or assets/runtime/
//   --only-roots  treat only the --root folders, not the default ones
//   --prompts     rename the rows in docs/SPRITE_PROMPTS.md even when no local folder was found
//
// In each folder (missing folders are skipped), recursively:
// - files: a name `iroquois<rest>` inside a `settlements` folder (`iroquois.png`,
//   `iroquois__capital@32.png`, ...) becomes `haudenosaunee<rest>`; if the new name already exists
//   with the same bytes the old file is removed, with other bytes both are kept and it is reported;
// - JSON files (manifest.json and the like): every mention of `settlements/iroquois` (an id, a job
//   key such as `sprites/settlements/iroquois`, an output or file path, with / or \\) becomes
//   `settlements/haudenosaunee`, so the generator still counts the masters
//   as done (the prompt hashes do not include the id) and the runtime manifest lists the new files;
// - contact sheets (index.html): the same text replacement, so their images still load;
// - docs/SPRITE_PROMPTS.md (committed): the two rows' ids, so the generator's jobs keep matching its
//   manifest; only when at least one folder was found (not with --only-roots). Commit that change.
// It is idempotent: a second run finds nothing to do. It never touches the server: upload the
// renamed files afterwards (see the README, "Renaming the Haudenosaunee's sprites").
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD = 'iroquois';
const NEW = 'haudenosaunee';
const OLD_ID = `settlements/${OLD}`;
const NEW_ID = `settlements/${NEW}`;

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const extra = args.flatMap((a, i) => (args[i - 1] === '--root' ? [resolve(a)] : []));
for (const [i, a] of args.entries()) {
  if (a.startsWith('--') && !['--dry-run', '--root', '--only-roots', '--prompts'].includes(a)) {
    console.error(`Unknown option ${a}. Usage: node tools/sprite-pipeline/rename-haudenosaunee.mjs [--dry-run] [--root DIR]... [--only-roots] [--prompts]`);
    process.exit(1);
  }
  if (a === '--root' && !args[i + 1]) {
    console.error('--root needs a folder.');
    process.exit(1);
  }
}

/** Every local copy of the sprites (all gitignored, see .gitignore). */
const DEFAULT_ROOTS = [
  'tools/image-gen/output', // masters (sprites/), thumbnails (thumbs/), redraws (edited/), manifest.json, index.html
  'tools/sprite-pipeline/out', // runtime set, manifest.json, contact sheet
  'tools/sprite-pipeline/cache', // masters downloaded from the server
  'apps/web/public/assets/sprites', // runtime copies for the dev server
  'apps/web/public/assets/runtime',
  'apps/web/dist/assets/sprites',
  'site/assets/sprites', // the built site (npm run release)
  'site/assets/runtime',
].map((r) => join(repo, r));
if (process.env.CC_RUNTIME_DIR) DEFAULT_ROOTS.push(resolve(process.env.CC_RUNTIME_DIR));
const roots = [...new Set([...(args.includes('--only-roots') ? [] : DEFAULT_ROOTS), ...extra])];

const show = (p) => (p.startsWith(repo) ? relative(repo, p) : p);
let renamed = 0;
let removed = 0;
let edited = 0;
const conflicts = [];

/** The text with every old id replaced (only as a whole id: `settlements/iroquois` then a non-letter or the end). */
const MENTION = /settlements(\/|\\\\|\\)iroquois(?![a-z])/g;
const swap = (text) => text.replace(MENTION, `settlements$1${NEW}`);

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, visit);
    else visit(p);
  }
}

function renameFile(p) {
  const name = basename(p);
  if (basename(dirname(p)) !== 'settlements' || !name.startsWith(OLD) || /^[a-z]/.test(name.slice(OLD.length))) return;
  const to = join(dirname(p), NEW + name.slice(OLD.length));
  if (existsSync(to)) {
    if (readFileSync(to).equals(readFileSync(p))) {
      console.log(`${dry ? 'would remove' : 'removed'} ${show(p)} (same as ${basename(to)})`);
      if (!dry) rmSync(p);
      removed++;
    } else conflicts.push(`${show(p)} and ${show(to)} both exist with different contents: kept both; remove the one you do not want and run again.`);
    return;
  }
  console.log(`${dry ? 'would rename' : 'renamed'} ${show(p)} -> ${basename(to)}`);
  if (!dry) renameSync(p, to);
  renamed++;
}

function editText(p, any = false) {
  const isJson = p.endsWith('.json');
  if (!any && !isJson && !p.endsWith('.html')) return;
  const text = readFileSync(p, 'utf8');
  const n = (text.match(MENTION) ?? []).length;
  if (!n) return;
  // A plain text replacement keeps the file's own formatting (the generator's manifest is written by
  // PowerShell); the ids only ever appear inside strings, so the JSON stays valid.
  const next = swap(text);
  if (isJson) {
    const keys = (t) => JSON.stringify(Object.keys(JSON.parse(t).jobs ?? JSON.parse(t).sprites ?? {}).length);
    if (keys(next) !== keys(text)) {
      conflicts.push(`${show(p)} would lose an entry (both ${OLD_ID} and ${NEW_ID} keys exist): not changed; remove one and run again.`);
      return;
    }
  }
  console.log(`${dry ? 'would update' : 'updated'} ${show(p)} (${n} mention${n === 1 ? '' : 's'} of ${OLD_ID})`);
  if (!dry) writeFileSync(p, next);
  edited++;
}

console.log(`${dry ? 'Dry run: ' : ''}renaming ${OLD_ID}* to ${NEW_ID}*`);
let seen = 0;
for (const root of roots) {
  if (!existsSync(root)) continue;
  seen++;
  console.log(`- ${show(root)}`);
  // Files first (collected, then renamed), then the manifests and contact sheets that name them.
  const files = [];
  walk(root, (p) => files.push(p));
  for (const p of files) renameFile(p);
  const after = [];
  if (!dry) walk(root, (p) => after.push(p));
  for (const p of dry ? files : after) editText(p);
}
// The prompt rows (committed), so the generator's job keys match the renamed manifest: renamed only
// together with the masters, or the generator would take them for new jobs and make them again.
const prompts = join(repo, 'docs/SPRITE_PROMPTS.md');
if (((seen && !args.includes('--only-roots')) || args.includes('--prompts')) && existsSync(prompts)) {
  console.log('- docs/SPRITE_PROMPTS.md (the prompt rows; commit this change)');
  editText(prompts, true);
}
if (!seen) console.log('None of the folders exists here: nothing to do (the sprites are not on this machine).');
for (const c of conflicts) console.log(`! ${c}`);
console.log(`${dry ? 'Would rename' : 'Renamed'} ${renamed} file${renamed === 1 ? '' : 's'}, ${dry ? 'would remove' : 'removed'} ${removed} duplicate${removed === 1 ? '' : 's'}, ${dry ? 'would update' : 'updated'} ${edited} manifest or sheet file${edited === 1 ? '' : 's'}${conflicts.length ? `; ${conflicts.length} to check (above)` : ''}.`);
if (!dry && renamed + removed + edited === 0 && !conflicts.length && seen) console.log('Nothing to do: already renamed.');
process.exit(conflicts.length ? 2 : 0);
