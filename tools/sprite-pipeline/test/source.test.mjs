import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { idsFromImageGenManifest, idsFromPromptsDoc, resolveIds, syncRemote } from '../lib/source.mjs';
import { figurePng } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

/** A tiny static server for /assets/sprites/<id>.png with ETag or Last-Modified (or neither). */
async function server(files, { validators = 'etag', blockUa = null } = {}) {
  const log = [];
  const srv = http.createServer((req, res) => {
    const m = req.url.match(/^\/assets\/sprites\/(.+)\.png$/);
    const body = m && files[decodeURIComponent(m[1])];
    log.push(`${req.method} ${req.url} ${req.headers['if-none-match'] ?? ''}${req.headers['if-modified-since'] ?? ''}`);
    if (blockUa && blockUa.test(req.headers['user-agent'] ?? '')) { res.writeHead(455); res.end(); return; }
    if (!body) { res.writeHead(404); res.end(); return; }
    const etag = `"${body.length}-${body[body.length - 20]}"`;
    const lm = new Date(1.7e12 + body.length * 1000).toUTCString();
    const h = { 'content-type': 'image/png', 'content-length': body.length };
    if (validators === 'etag') h.etag = etag;
    if (validators === 'lm') h['last-modified'] = lm;
    if ((validators === 'etag' && req.headers['if-none-match'] === etag) || (validators === 'lm' && req.headers['if-modified-since'] === lm)) {
      res.writeHead(304); res.end(); return;
    }
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/assets/sprites/`, log, close: () => new Promise((r) => srv.close(r)) };
}

for (const validators of ['etag', 'lm', 'none']) {
  test(`syncRemote downloads once, then skips unchanged files (${validators})`, async () => {
    const png = await figurePng();
    const files = { 'units/a__none': png, 'units/b__none': png };
    const s = await server(files, { validators });
    const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-cache-'));
    try {
      const ids = ['units/a__none', 'units/b__none', 'units/missing__none'];
      const first = await syncRemote(s.url, ids, cache);
      assert.deepEqual(first.fetched, ['units/a__none', 'units/b__none']);
      assert.deepEqual(first.missing, ['units/missing__none']);
      assert.deepEqual(await fs.readFile(path.join(cache, 'units/a__none.png')), png);
      const second = await syncRemote(s.url, ids.slice(0, 2), cache);
      assert.deepEqual(second.fetched, []);
      assert.deepEqual(second.cached, ['units/a__none', 'units/b__none']);
      // a changed file is fetched again
      files['units/a__none'] = Buffer.concat([png, Buffer.from('changed')]);
      const third = await syncRemote(s.url, ids.slice(0, 2), cache);
      assert.deepEqual(third.fetched, ['units/a__none']);
    } finally {
      await s.close();
      await fs.rm(cache, { recursive: true, force: true });
    }
  });
}

test('a 455 from the firewall falls back to a browser User-Agent, unless one was given', async () => {
  const png = await figurePng();
  const s = await server({ 'units/a__none': png }, { blockUa: /compatible;|^custom/ });
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-cache-'));
  try {
    const logs = [];
    const r = await syncRemote(s.url, ['units/a__none'], cache, { log: (m) => logs.push(m) });
    assert.deepEqual(r.fetched, ['units/a__none']);
    assert.ok(logs.some((l) => l.includes('retrying with a browser User-Agent')));
    await fs.rm(cache, { recursive: true, force: true });
    const logs2 = [];
    const r2 = await syncRemote(s.url, ['units/a__none'], cache, { log: (m) => logs2.push(m), userAgent: 'custom/1.0' });
    assert.deepEqual(r2.missing, ['units/a__none']);
    assert.equal(r2.blocked, 1);
    assert.ok(logs2.some((l) => l.includes("blocked by the server's firewall (ModSecurity)")));
  } finally {
    await s.close();
    await fs.rm(cache, { recursive: true, force: true });
  }
});

test('ids come from the image-gen manifest (done sprite jobs only)', () => {
  const ids = idsFromImageGenManifest({
    jobs: {
      'sprites/units/b__none': { doc: 'sprites', id: 'units/b__none', status: 'done' },
      'sprites/units/a__none': { doc: 'sprites', id: 'units/a__none', status: 'done' },
      'sprites/units/c__none': { doc: 'sprites', id: 'units/c__none', status: 'failed' },
      'boxart/front-a': { doc: 'boxart', id: 'front-a', status: 'done' },
    },
  });
  assert.deepEqual(ids, ['units/a__none', 'units/b__none']);
});

test('ids come from the job tables of docs/SPRITE_PROMPTS.md', async () => {
  const md = await fs.readFile(path.join(HERE, '../../../docs/SPRITE_PROMPTS.md'), 'utf8');
  const ids = idsFromPromptsDoc(md);
  assert.ok(ids.includes('units/expert-lumberjack__dragoon'));
  assert.ok(ids.includes('bible/style-bible'));
  assert.ok(ids.length > 250);
  assert.equal(new Set(ids).size, ids.length);
});

test('an --ids file wins over the manifest and the doc', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-ids-'));
  await fs.writeFile(path.join(dir, 'ids.txt'), '# comment\nunits/a__none\n\nunits/b__none.png  # trailing\n');
  const r = await resolveIds({ idsFile: path.join(dir, 'ids.txt'), imageGenManifest: '/nonexistent', promptsDoc: '/nonexistent' });
  assert.deepEqual(r.ids, ['units/a__none', 'units/b__none']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('build.mjs accepts a base URL for --in and processes the downloaded masters', async () => {
  const png = await figurePng();
  const s = await server({ 'units/test__none': png });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprite-remote-'));
  try {
    await fs.writeFile(path.join(dir, 'ids.txt'), 'units/test__none\n');
    const args = [path.join(HERE, '../build.mjs'), '--in', s.url, '--ids', path.join(dir, 'ids.txt'), '--cache', path.join(dir, 'cache'), '--out', path.join(dir, 'out'), '--no-sheet'];
    const { stdout } = await run(process.execPath, args);
    assert.match(stdout, /1 downloaded/);
    const m = JSON.parse(await fs.readFile(path.join(dir, 'out/manifest.json'), 'utf8'));
    assert.ok(m.sprites['units/test__none'].files['32']);
    const again = await run(process.execPath, args);
    assert.match(again.stdout, /0 downloaded, 1 unchanged/);
  } finally {
    await s.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
