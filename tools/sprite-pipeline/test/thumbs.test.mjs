// --thumbs-in: the small sizes from the thumbnail masters (Generate-Images.ps1 -Variant thumb), the
// large ones from the full masters, with a fallback to the full master when a thumbnail is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { figurePng } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, '..', 'build.mjs');
const run = promisify(execFile);

/** full/units/{a,b}__none.png and thumbs/units/a__none.png (a different, staff-less drawing); b has no thumbnail. */
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-thumbs-'));
  for (const d of ['full/units', 'thumbs/units']) await fs.mkdir(path.join(dir, d), { recursive: true });
  const full = await figurePng({ staff: true });
  const thumb = await figurePng({ staff: false, left: 80, right: 176, top: 50 });
  await fs.writeFile(path.join(dir, 'full/units/a__none.png'), full);
  await fs.writeFile(path.join(dir, 'full/units/b__none.png'), full);
  await fs.writeFile(path.join(dir, 'thumbs/units/a__none.png'), thumb);
  return { dir, full, thumb };
}

const read = (dir, rel) => fs.readFile(path.join(dir, rel));
const manifest = async (dir) => JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
const SIZES = ['--sizes', '16,24,32,48,64', '--no-tuning'];

test('--thumbs-in: sizes up to --thumb-max from the thumbnail, larger from the full master, fallback without one', async () => {
  const { dir } = await fixture();
  try {
    const o = path.join(dir, 'o');
    const { stdout } = await run(process.execPath, [BUILD, '--in', path.join(dir, 'full'), '--thumbs-in', path.join(dir, 'thumbs'), '--thumb-max', '48', '--out', o, ...SIZES]);
    // reference runs: each master alone through the pipeline
    await run(process.execPath, [BUILD, '--in', path.join(dir, 'full'), '--out', path.join(dir, 'ref-full'), ...SIZES, '--no-sheet']);
    await run(process.execPath, [BUILD, '--in', path.join(dir, 'thumbs'), '--out', path.join(dir, 'ref-thumb'), ...SIZES, '--no-sheet']);

    const m = await manifest(o);
    assert.equal(m.thumbs.maxSize, 48);
    assert.match(m.thumbs.source, /thumbs$/);
    const a = m.sprites['units/a__none'];
    assert.deepEqual(Object.keys(a.files), ['16', '24', '32', '48', '64']);
    for (const n of ['16', '24', '32', '48']) assert.equal(a.files[n].from, 'thumb', `a@${n} from the thumbnail`);
    assert.equal(a.files['64'].from, undefined, 'a@64 from the full master');
    assert.equal(a.files['16'].mode, 'pixel');
    assert.equal(a.files['48'].mode, 'smooth', '48 is still a smooth size, only its source changed');
    assert.equal(a.thumb.file, 'units/a__none.png');
    assert.match(a.thumb.sha256, /^[0-9a-f]{64}$/);
    assert.equal(a.source.file, 'units/a__none.png', 'the full master stays the sprite source');
    for (const n of [16, 24, 32, 48]) {
      assert.deepEqual(await read(o, `units/a__none@${n}.png`), await read(path.join(dir, 'ref-thumb'), `units/a__none@${n}.png`), `a@${n} = thumbnail through the pipeline`);
    }
    assert.notDeepEqual(await read(o, 'units/a__none@16.png'), await read(path.join(dir, 'ref-full'), 'units/a__none@16.png'), 'and not the full master');
    assert.deepEqual(await read(o, 'units/a__none@64.png'), await read(path.join(dir, 'ref-full'), 'units/a__none@64.png'), 'a@64 = full master');

    const b = m.sprites['units/b__none'];
    assert.equal(b.thumb, undefined, 'b has no thumbnail');
    for (const n of ['16', '24', '32', '48', '64']) {
      assert.equal(b.files[n].from, undefined);
      assert.deepEqual(await read(o, `units/b__none@${n}.png`), await read(path.join(dir, 'ref-full'), `units/b__none@${n}.png`), `b@${n} falls back to the full master`);
    }
    assert.match(stdout, /1 sprites made sizes up to 48 from their thumbnail; 1 had none and used the full master/);
    assert.match(stdout, /without a thumbnail: units\/b__none/);

    // contact sheet: full-derived vs thumbnail-derived small sizes
    const html = await fs.readFile(path.join(o, 'index.html'), 'utf8');
    assert.match(html, /id="compare">Full master vs thumbnail/);
    assert.match(html, /full master → pipeline/);
    assert.match(html, /thumbnail → pipeline/);
    assert.match(html, /from thumbnail/);
    await fs.access(path.join(o, '_sheet/compare-in/units/a__none@16.png'));
    await fs.access(path.join(o, '_sheet/thumb-orig/units/a__none.png'));
    assert.deepEqual(await read(o, '_sheet/compare-in/units/a__none@16.png'), await read(path.join(dir, 'ref-full'), 'units/a__none@16.png'), 'the full column is the full master');
    assert.doesNotMatch(html, /_sheet\/compare-thumb\/units\/b__none/, 'no thumbnail column without a thumbnail');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('--thumb-max defaults to --pixel-max; the Generate-Images.ps1 output root is refused', async () => {
  const { dir } = await fixture();
  try {
    const o = path.join(dir, 'o');
    await run(process.execPath, [BUILD, '--in', path.join(dir, 'full'), '--thumbs-in', path.join(dir, 'thumbs'), '--out', o, ...SIZES, '--no-sheet']);
    const a = (await manifest(o)).sprites['units/a__none'];
    assert.deepEqual(['16', '24', '32', '48', '64'].map((n) => a.files[n].from ?? 'full'), ['thumb', 'thumb', 'thumb', 'full', 'full']);
    // output/ itself holds sprites/ and thumbs/
    const root = path.join(dir, 'output');
    await fs.mkdir(path.join(root, 'sprites/units'), { recursive: true });
    await fs.mkdir(path.join(root, 'thumbs/units'), { recursive: true });
    await fs.copyFile(path.join(dir, 'full/units/a__none.png'), path.join(root, 'sprites/units/a__none.png'));
    await fs.copyFile(path.join(dir, 'thumbs/units/a__none.png'), path.join(root, 'thumbs/units/a__none.png'));
    await assert.rejects(run(process.execPath, [BUILD, '--in', path.join(dir, 'full'), '--thumbs-in', root, '--out', o]), /Generate-Images\.ps1 output root.*--thumbs-in .*output[\\/]thumbs/s);
    await assert.rejects(run(process.execPath, [BUILD, '--in', root, '--out', o]), /--in .*output[\\/]sprites/s);
    await assert.rejects(run(process.execPath, [BUILD, '--in', path.join(dir, 'full'), '--thumbs-in', path.join(dir, 'nope'), '--out', o]), /folder not found/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('--thumbs-in URL: thumbnails downloaded into the cache, 404 falls back to the full master', async () => {
  const { dir, thumb } = await fixture();
  const log = [];
  const srv = http.createServer((req, res) => {
    log.push(`${req.method} ${req.url} ${req.headers['user-agent'] ?? ''}`);
    if (req.url === '/assets/thumbs/units/a__none.png') {
      if (req.headers['if-none-match'] === '"t1"') { res.writeHead(304); res.end(); return; }
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': thumb.length, etag: '"t1"' });
      res.end(req.method === 'HEAD' ? undefined : thumb);
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/assets/thumbs/`;
  try {
    const o = path.join(dir, 'o');
    const cache = path.join(dir, 'cache');
    const args = [BUILD, '--in', path.join(dir, 'full'), '--thumbs-in', url, '--cache', cache, '--out', o, ...SIZES, '--no-sheet'];
    const { stdout } = await run(process.execPath, args);
    assert.match(stdout, /1 downloaded, 0 unchanged, 1 missing \(those use the full master\)/);
    assert.deepEqual(await fs.readFile(path.join(cache, '_thumbs/units/a__none.png')), thumb, 'cached under <cache>/_thumbs');
    assert.ok(log.every((l) => /CasualColonization-sprite-pipeline/.test(l)), 'the pipeline User-Agent');
    const m = await manifest(o);
    assert.equal(m.thumbs.source, url);
    assert.equal(m.sprites['units/a__none'].files['16'].from, 'thumb');
    assert.equal(m.sprites['units/b__none'].files['16'].from, undefined);
    const again = await run(process.execPath, args);
    assert.match(again.stdout, /0 downloaded, 1 unchanged, 1 missing/, 'conditional request on the second run');
    assert.ok(log.some((l) => l.startsWith('GET /assets/thumbs/units/a__none.png')));
  } finally {
    await new Promise((r) => srv.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
