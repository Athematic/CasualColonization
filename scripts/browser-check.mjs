// Plays the bench's head start in a browser and checks it against the engine run in Node: the state
// hash must equal scripts/bench-hashes.json ("seed 2024, to 1700"). Also prints the time to playable,
// main-thread long tasks during the head start and during a few ends of turn, and whether the
// engine worker was used.
//
// Usage: node scripts/browser-check.mjs <url> [--scenario caribbean] [--ends 3]
//   <url>   a served build, e.g. http://localhost:4173/ (npm run build, then npx vite preview in
//           apps/web), the single-file build as file:///.../casual-colonization.html, or either with
//           ?worker=0 to play on the main thread
// Needs Playwright with Chromium: set PLAYWRIGHT to its folder if `playwright` is not installed here
// (e.g. PLAYWRIGHT=/opt/node22/lib/node_modules/playwright).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const url = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!url) {
  console.error('Usage: node scripts/browser-check.mjs <url> [--scenario caribbean] [--ends 3]');
  process.exit(1);
}
const scenario = opt('scenario', 'americas');
const ends = Number(opt('ends', '3'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');
const hashes = JSON.parse(readFileSync(new URL('./bench-hashes.json', import.meta.url), 'utf8'));
const expected = hashes[`${scenario === 'americas' ? '' : `${scenario}: `}seed 2024, to 1700`];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.evaluate(() => {
  window.__longTasks = [];
  new PerformanceObserver((list) => window.__longTasks.push(...list.getEntries().map((e) => e.duration))).observe({ type: 'longtask' });
});
await page.getByRole('button', { name: 'New game…' }).click();
if (scenario !== 'americas') await page.getByLabel('Scenario', { exact: true }).selectOption(scenario);
await page.locator('#game-seed').fill('2024');
await page.locator('#game-seed').dispatchEvent('change');
const start = page.getByLabel('Start year');
const years = await start.locator('option').allTextContents();
await start.selectOption({ label: years.find((y) => y.includes('1700')) });
await page.getByLabel('Head start display').selectOption('skip');
const t0 = Date.now();
await page.getByRole('button', { name: /Set sail/ }).click();
await page.waitForFunction(() => window.cc.app?.isMyTurn(), null, { timeout: 600_000, polling: 20 });
const playable = Date.now() - t0;
const hash = await page.evaluate(async () => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(window.cc.app.state)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
});
const taken = () => page.evaluate(() => window.__longTasks.splice(0));
const sum = (a) => Math.round(a.reduce((x, y) => x + y, 0));
const head = await taken();
const worker = await page.evaluate(() => window.cc.turns?.worker);
console.log(`${scenario}, seed 2024, head start to 1700: playable after ${playable} ms; long tasks ${head.length} (${sum(head)} ms); worker ${worker}`);
console.log(`hash ${hash}, bench ${expected}: ${hash === expected ? 'same' : 'DIFFERENT'}`);

for (let k = 0; k < ends; k++) {
  // A few of the person's own moves first (sentry, some refused), which the worker's copy must replay.
  const turn = await page.evaluate(() => {
    const app = window.cc.app;
    for (const u of Object.values(app.state.units).filter((u) => u.owner === app.viewer && u.moves > 0).slice(0, 6)) app.dispatch({ type: 'sentry', unitId: u.id }, true);
    return app.state.turn;
  });
  const t1 = Date.now();
  await page.evaluate(() => void window.cc.app.endTurn());
  // Answer whatever is asked: the end-turn check, the briefing, decisions (first choice).
  while (!(await page.evaluate((t) => window.cc.app.state.turn > t && window.cc.app.isMyTurn() && !document.querySelector('.dialog'), turn))) {
    const b = page.locator('.dialog button:not([disabled])', { hasText: /^(End turn|Continue|Begin turn)$/ }).first();
    const any = page.locator('.dialog button.primary:not([disabled])').first();
    if (await b.count()) await b.click({ timeout: 1000 }).catch(() => {});
    else if (await any.count()) await any.click({ timeout: 1000 }).catch(() => {});
    else await page.waitForTimeout(20);
    if (Date.now() - t1 > 120_000) throw new Error('An end of turn did not finish.');
  }
  const lt = await taken();
  const { lastJob: job, resyncs } = await page.evaluate(() => window.cc.turns ?? {});
  console.log(`end of turn ${k + 1}: computer turns ${job ? `${Math.round(job.totalMs)} ms (${Math.round(job.workMs)} ms in the ${job.worker ? 'worker' : 'page'})` : '?'}; long tasks ${lt.length} (${sum(lt)} ms, longest ${Math.round(Math.max(0, ...lt))} ms)${resyncs ? `; ${resyncs} resyncs` : ''}`);
}
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
process.exit(hash === expected && !errors.length ? 0 : 1);
