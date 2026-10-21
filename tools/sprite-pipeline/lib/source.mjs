// Where the masters come from: a local folder, or a web server with the same
// layout as tools/image-gen/output/sprites (e.g.
// https://casual.spence.dk/assets/sprites/units/<id>.png). Remote masters are
// downloaded into a local cache and only fetched again when they changed.

import fs from 'node:fs/promises';
import path from 'node:path';

export const isUrl = (s) => /^https?:\/\//i.test(s);

/** Sent by default: browser-like enough for ModSecurity's default rules, and says who we are. */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; CasualColonization-sprite-pipeline/1.0)';
/** Fallback when the server's firewall rejects the default (HTTP 455 from casual.spence.dk's IIS/ModSecurity). */
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const BLOCKED = new Set([455]);

/** Recursively list "<category>/<name>" ids of PNG files under a folder. */
export async function listLocalIds(dir) {
  const ids = [];
  async function walk(rel) {
    const entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!e.name.startsWith('_') && !e.name.startsWith('.')) await walk(r); }
      else if (e.name.toLowerCase().endsWith('.png')) ids.push(r.slice(0, -4));
    }
  }
  await walk('');
  return ids;
}

/**
 * Sprite ids for a remote source, in order of preference:
 *  1. an --ids file: one id per line ("units/free-colonist__none"), # comments allowed,
 *     or a JSON array of ids;
 *  2. tools/image-gen/output/manifest.json: every sprite job with status "done";
 *  3. the job list in docs/SPRITE_PROMPTS.md (every `| \`id\` | WxH | ... |` row).
 */
export async function resolveIds({ idsFile, imageGenManifest, promptsDoc }) {
  if (idsFile) {
    const text = await fs.readFile(idsFile, 'utf8');
    const t = text.trim();
    const ids = t.startsWith('[') ? JSON.parse(t) : t.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
    return { ids: ids.map((id) => id.replace(/\.png$/i, '')), from: idsFile };
  }
  const manifest = await fs.readFile(imageGenManifest, 'utf8').then(JSON.parse).catch(() => null);
  if (manifest?.jobs) {
    const ids = idsFromImageGenManifest(manifest);
    if (ids.length) return { ids, from: imageGenManifest };
  }
  const doc = await fs.readFile(promptsDoc, 'utf8');
  return { ids: idsFromPromptsDoc(doc), from: promptsDoc };
}

export function idsFromImageGenManifest(manifest) {
  return Object.values(manifest.jobs)
    .filter((j) => j && j.doc === 'sprites' && j.status === 'done' && j.id)
    .map((j) => j.id)
    .sort();
}

export function idsFromPromptsDoc(md) {
  const ids = [];
  for (const m of md.matchAll(/^\|\s*`([a-z0-9-]+\/[a-z0-9_-]+)`\s*\|\s*\d+x\d+\s*\|/gim)) ids.push(m[1]);
  return ids;
}

/**
 * Make sure every id is in the cache folder, downloading what is missing or
 * changed. Conditional GET with the stored ETag / Last-Modified; a server
 * without either is re-checked with a HEAD request and compared by size.
 * Returns { dir, fetched, cached, missing }.
 */
export async function syncRemote(baseUrl, ids, cacheDir, { log = () => {}, fetchImpl = fetch, userAgent } = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  // An explicit --user-agent is always used as is; otherwise start with the
  // descriptive default and switch to a browser string if the firewall objects.
  let ua = userAgent || DEFAULT_USER_AGENT;
  const canFallBack = !userAgent;
  const get = async (url, init = {}) => {
    let res = await fetchImpl(url, { ...init, headers: { ...(init.headers ?? {}), 'User-Agent': ua } });
    if (BLOCKED.has(res.status) && canFallBack && ua !== BROWSER_USER_AGENT) {
      log(`  HTTP ${res.status} with User-Agent "${ua}": retrying with a browser User-Agent`);
      ua = BROWSER_USER_AGENT;
      res = await fetchImpl(url, { ...init, headers: { ...(init.headers ?? {}), 'User-Agent': ua } });
    }
    return res;
  };
  const indexFile = path.join(cacheDir, 'cache-index.json');
  const index = await fs.readFile(indexFile, 'utf8').then(JSON.parse).catch(() => ({}));
  const stats = { dir: cacheDir, fetched: [], cached: [], missing: [], blocked: 0 };
  for (const id of ids) {
    const url = new URL(`${id}.png`, base).href;
    const file = path.join(cacheDir, `${id}.png`);
    const have = await fs.stat(file).catch(() => null);
    const entry = index[id];
    const headers = {};
    if (have && entry?.url === url) {
      if (entry.etag) headers['If-None-Match'] = entry.etag;
      if (entry.lastModified) headers['If-Modified-Since'] = entry.lastModified;
    }
    let res;
    try {
      if (have && entry?.url === url && !entry.etag && !entry.lastModified) {
        // No validators: compare the size with a HEAD request.
        const head = await get(url, { method: 'HEAD' });
        const len = Number(head.headers.get('content-length'));
        if (head.ok && len && len === have.size) { stats.cached.push(id); continue; }
      }
      res = await get(url, { headers });
    } catch (err) {
      if (have) { log(`  ! ${id}: ${err.message}; using the cached copy`); stats.cached.push(id); continue; }
      log(`  ! ${id}: ${err.cause?.code ?? err.message}${err.cause?.code === 'ENOTFOUND' && hasProxyEnv() ? ' (a proxy is set: run with NODE_USE_ENV_PROXY=1, Node 22.21 or later)' : ''}`);
      stats.missing.push(id);
      continue;
    }
    if (res.status === 304 && have) { stats.cached.push(id); continue; }
    if (!res.ok) {
      const why = BLOCKED.has(res.status)
        ? `HTTP ${res.status}: blocked by the server's firewall (ModSecurity); try --user-agent "<a browser User-Agent>"`
        : `HTTP ${res.status}`;
      log(`  ! ${id}: ${why}${have ? '; using the cached copy' : ''}`);
      if (BLOCKED.has(res.status)) stats.blocked++;
      (have ? stats.cached : stats.missing).push(id);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.part', buf);
    await fs.rename(file + '.part', file);
    index[id] = { url, etag: res.headers.get('etag') ?? null, lastModified: res.headers.get('last-modified') ?? null, size: buf.length };
    stats.fetched.push(id);
  }
  await fs.mkdir(cacheDir, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(index).sort().map((k) => [k, index[k]]));
  await fs.writeFile(indexFile, JSON.stringify(sorted, null, 2) + '\n');
  return stats;
}

export function hasProxyEnv(env = process.env) {
  return Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy);
}
