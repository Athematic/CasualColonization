import { DIFFICULTY, formatDate, NATIONS, resolveDifficulty, nationTitle, STAT_INFO, STAT_KEYS, statsHistory, yearOf, type NationId, type StatKey, type StatsSeries } from '@cc/engine';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { activeStyle } from '../styles.js';

/**
 * Progress Graphs: every European nation's statistics over time, one line per nation.
 *
 * All nations are shown regardless of fog of war, as in the original game's reports: the
 * figures are the kind any court would hear about, and hiding rivals would leave most
 * graphs empty for most of the game.
 */

type Metric = StatKey | 'productionTotal' | 'tradeTotal' | 'crossesTotal';

const METRICS: { id: Metric; name: string; description: string }[] = [
  ...STAT_KEYS.map((k) => ({ id: k as Metric, name: STAT_INFO[k].perTurn ? `${STAT_INFO[k].name} per turn` : STAT_INFO[k].name, description: STAT_INFO[k].description })),
  { id: 'productionTotal', name: 'Goods produced, total', description: 'Goods produced in all colonies since records began (food excluded).' },
  { id: 'tradeTotal', name: 'Trade income, total', description: 'Gold earned by trade since records began.' },
  { id: 'crossesTotal', name: 'Crosses, total', description: 'Crosses produced since records began.' },
];

// Remembered for the session, so reopening the screen shows the same graph.
let lastMetric: Metric = 'score';
const hiddenNations = new Set<NationId>();

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...children: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

function values(hist: StatsSeries, nation: NationId, metric: Metric): number[] {
  const rows = hist.series[nation]!;
  const total = (key: StatKey) => {
    let sum = 0;
    return rows[key].map((v) => (sum += v));
  };
  if (metric === 'productionTotal') return total('production');
  if (metric === 'tradeTotal') return total('trade');
  if (metric === 'crossesTotal') return total('crosses');
  return rows[metric];
}

function isPercent(metric: Metric): boolean {
  return metric in STAT_INFO && !!STAT_INFO[metric as StatKey].percent;
}

function format(metric: Metric, v: number): string {
  return isPercent(metric) ? `${v}%` : v.toLocaleString();
}

/** Round axis steps: 1, 2 or 5 times a power of ten. */
function niceStep(range: number, count: number): number {
  const raw = Math.max(range, 1) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function shortNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${+(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return String(v);
}

/** Is the active style's panel dark? Nation colours are then lifted to keep them readable. */
function darkPanel(): boolean {
  const hex = activeStyle().theme['--panel'] ?? '#ffffff';
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.4;
}

function nationColor(nation: NationId, dark: boolean): string {
  const c = NATIONS[nation].color;
  return dark ? `color-mix(in srgb, ${c} 72%, white)` : c;
}

export interface GameOverInfo {
  reason: string;
  winner?: NationId;
  scores: Partial<Record<NationId, number>>;
  /** The nation of the person looking, if any. */
  viewer?: NationId;
  onMenu: () => void;
}

export class ProgressScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private chartHost: HTMLElement;
  private tooltip: HTMLElement;
  private legend: HTMLElement;
  private metric: Metric = lastMetric;
  private hist: StatsSeries;
  private hover: number | null = null;
  private drawnKey = '';
  private width = 0;
  private ro: ResizeObserver;

  constructor(
    private app: App,
    private over?: GameOverInfo,
  ) {
    this.body = h('div', { class: 'screen-body' });
    this.el = h('section', { class: 'screen progress-screen', role: 'dialog', 'aria-label': 'Progress graphs' }, this.body);
    this.chartHost = h('div', { class: 'progress-chart' });
    this.tooltip = h('div', { class: 'progress-tip', role: 'status', hidden: true });
    this.legend = h('div', { class: 'progress-legend', role: 'group', 'aria-label': 'Nations shown' });
    this.hist = statsHistory(app.state);
    // The final reckoning starts on the score.
    if (over) this.metric = 'score';
    this.ro = new ResizeObserver(() => {
      const w = Math.floor(this.chartHost.clientWidth);
      if (w && w !== this.width) {
        this.width = w;
        this.draw();
      }
    });
    this.ro.observe(this.chartHost);
    this.build();
  }

  close(): void {
    this.ro.disconnect();
  }

  refresh(): void {
    // Panels refresh on every frame of a watched game; only redraw for new data.
    const key = `${this.app.state.stats?.turns.length ?? 0}|${this.app.state.turn}|${activeStyle().id}`;
    if (key === this.drawnKey) return;
    this.hist = statsHistory(this.app.state);
    this.build();
  }

  private build(): void {
    const s = this.app.state;
    this.drawnKey = `${s.stats?.turns.length ?? 0}|${s.turn}|${activeStyle().id}`;
    clear(this.body);
    const select = h('select', { 'aria-label': 'Statistic to show', onchange: (e: Event) => this.setMetric((e.target as HTMLSelectElement).value as Metric) },
      METRICS.map((m) => h('option', { value: m.id, selected: m.id === this.metric || undefined }, m.name)));
    const step = (d: number) => {
      const i = METRICS.findIndex((m) => m.id === this.metric);
      this.setMetric(METRICS[(i + d + METRICS.length) % METRICS.length].id);
    };
    const info = METRICS.find((m) => m.id === this.metric)!;
    const over = this.over;
    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, over ? 'The game is over' : 'Progress'),
        h('span', { class: 'muted' }, formatDate(s.turn)),
        over
          ? h('div', { class: 'row close' },
              h('button', { class: 'btn', onclick: () => this.app.closeScreen() }, 'Keep playing'),
              h('button', { class: 'btn primary', onclick: () => over.onMenu() }, 'Main menu'))
          : h('button', { class: 'btn close', onclick: () => this.app.closeScreen(), 'aria-label': 'Close progress graphs' }, 'Close')),
      ...(over ? [this.gameOverCard(over)] : []),
      h('div', { class: 'progress-controls' },
        h('button', { class: 'btn small', 'aria-label': 'Previous statistic', onclick: () => step(-1) }, '‹'),
        h('label', { class: 'field' }, h('span', null, 'Statistic'), select),
        h('button', { class: 'btn small', 'aria-label': 'Next statistic', onclick: () => step(1) }, '›'),
        h('p', { class: 'muted small progress-desc' }, info.description)),
      h('div', { class: 'card progress-card' }, this.chartHost, this.legend),
      h('p', { class: 'muted small' }, 'All nations are shown, as in the reports of the original game. Figures are recorded at the end of every turn; games saved before this feature start recording when loaded. Tap or hover the graph to read values; tap a nation to hide or show it.'),
    );
    this.draw();
  }

  private gameOverCard(over: GameOverInfo): HTMLElement {
    const rows = (Object.entries(over.scores) as [NationId, number][]).sort((a, b) => b[1] - a[1]);
    const level = DIFFICULTY[resolveDifficulty(this.app.state.difficulty)];
    return h('div', { class: 'card progress-over' },
      h('p', null, over.reason),
      h('p', { class: 'muted small', title: level.description }, `Difficulty: ${level.name}`),
      this.app.state.cheated ? h('p', null, h('span', { class: 'pill warn' }, 'Cheats used'), ` since ${formatDate(this.app.state.cheated.turn)}.`) : null,
      over.winner ? h('p', null, h('strong', null, `${nationTitle(over.winner)} ${over.winner === over.viewer ? '(you) ' : ''}wins.`)) : null,
      h('table', { class: 'scores' }, rows.map(([n, score]) => h('tr', null,
        h('td', null, h('span', { class: 'flag', style: `background:${NATIONS[n].color}` }), ' ', nationTitle(n)),
        h('td', null, String(score))))));
  }

  private setMetric(m: Metric): void {
    this.metric = lastMetric = m;
    this.build();
  }

  private toggle(nation: NationId, only: boolean): void {
    if (only) {
      const alone = this.hist.nations.every((n) => n === nation || hiddenNations.has(n));
      hiddenNations.clear();
      if (!alone) for (const n of this.hist.nations) if (n !== nation) hiddenNations.add(n);
    } else if (hiddenNations.has(nation)) hiddenNations.delete(nation);
    else hiddenNations.add(nation);
    this.draw();
  }

  private draw(): void {
    const hist = this.hist;
    const metric = this.metric;
    const dark = darkPanel();
    clear(this.chartHost);
    clear(this.legend);
    this.tooltip.hidden = true;
    const n = hist.turns.length;
    if (!n) {
      this.chartHost.append(h('p', { class: 'muted progress-empty' }, 'No figures yet. They are recorded at the end of every turn, so come back next turn.'));
      return;
    }
    const W = Math.max(260, this.width || this.chartHost.clientWidth || 600);
    const H = W < 520 ? 240 : 340;
    const m = { l: W < 520 ? 38 : 52, r: 14, t: 12, b: 28 };
    const shown = hist.nations.filter((nn) => !hiddenNations.has(nn));
    const data = new Map(hist.nations.map((nn) => [nn, values(hist, nn, metric)] as const));
    let max = 0;
    let min = 0;
    for (const nn of shown) for (const v of data.get(nn)!) {
      if (v > max) max = v;
      if (v < min) min = v;
    }
    if (isPercent(metric)) max = Math.max(max, 10);
    const yStep = niceStep(max - min, H < 300 ? 4 : 5);
    const yMax = Math.max(yStep, Math.ceil(max / yStep) * yStep);
    const yMin = Math.floor(min / yStep) * yStep;
    const t0 = hist.turns[0];
    const t1 = Math.max(hist.turns[n - 1], t0 + 1);
    const x = (turn: number) => m.l + ((turn - t0) / (t1 - t0)) * (W - m.l - m.r);
    const y = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - m.t - m.b);

    const root = svg('svg', { class: 'progress-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${METRICS.find((mm) => mm.id === metric)!.name} by nation over time` });
    const grid = svg('g', { class: 'grid' });
    for (let v = yMin; v <= yMax + yStep / 2; v += yStep) {
      grid.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'base' : '' }));
      grid.append(svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, isPercent(metric) ? `${v}%` : shortNumber(v)));
    }
    // Years on the time axis, spaced to fit.
    const firstYear = yearOf(t0).year;
    const lastYear = yearOf(t1).year;
    const yearStep = niceStep(lastYear - firstYear, Math.max(2, Math.floor((W - m.l - m.r) / 70)));
    for (let yr = Math.ceil(firstYear / yearStep) * yearStep; yr <= lastYear; yr += yearStep) {
      const turn = yr < 1600 ? yr - 1492 : 108 + (yr - 1600) * 2;
      if (turn < t0 || turn > t1) continue;
      grid.append(svg('line', { x1: x(turn), x2: x(turn), y1: H - m.b, y2: H - m.b + 4, class: 'tick' }));
      grid.append(svg('text', { x: x(turn), y: H - m.b + 17, 'text-anchor': 'middle' }, String(yr)));
    }
    root.append(grid);

    const lines = svg('g', { class: 'lines' });
    for (const nn of shown) {
      const vs = data.get(nn)!;
      const pts = vs.map((v, i) => `${x(hist.turns[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const color = nationColor(nn, dark);
      if (n === 1) {
        lines.append(svg('circle', { cx: x(hist.turns[0]), cy: y(vs[0]), r: 4, fill: color, class: 'dot' }));
        continue;
      }
      // A ring of panel colour keeps crossing lines apart.
      lines.append(svg('polyline', { points: pts, class: 'casing' }));
      lines.append(svg('polyline', { points: pts, class: 'line', style: `stroke:${color}` }));
    }
    root.append(lines);
    const cross = svg('g', { class: 'cross' });
    root.append(cross);
    // A transparent layer catches the pointer anywhere on the plot.
    const hit = svg('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H - m.b, class: 'hit' });
    root.append(hit);

    const showAt = (i: number | null) => {
      this.hover = i;
      clear(cross);
      if (i === null) {
        this.tooltip.hidden = true;
        this.fillLegend(data, n - 1, dark);
        return;
      }
      const tx = x(hist.turns[i]);
      cross.append(svg('line', { x1: tx, x2: tx, y1: m.t, y2: H - m.b, class: 'crosshair' }));
      for (const nn of shown) cross.append(svg('circle', { cx: tx, cy: y(data.get(nn)![i]), r: 4, class: 'dot', style: `fill:${nationColor(nn, dark)}` }));
      clear(this.tooltip);
      const rows = shown.map((nn) => [nn, data.get(nn)![i]] as const).sort((a, b) => b[1] - a[1]);
      this.tooltip.append(
        h('strong', null, formatDate(hist.turns[i])),
        h('table', null, rows.map(([nn, v]) => h('tr', null,
          h('td', null, h('span', { class: 'swatch', style: `background:${nationColor(nn, dark)}` }), nationTitle(nn)),
          h('td', null, format(metric, v))))));
      this.tooltip.hidden = false;
      const left = tx > W / 2;
      this.tooltip.style.left = left ? '' : `${tx + 12}px`;
      this.tooltip.style.right = left ? `${W - tx + 12}px` : '';
      this.fillLegend(data, i, dark);
    };
    const pick = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const turn = t0 + ((px - m.l) / (W - m.l - m.r)) * (t1 - t0);
      let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(hist.turns[i] - turn) < Math.abs(hist.turns[best] - turn)) best = i;
      showAt(best);
    };
    hit.addEventListener('pointermove', pick);
    hit.addEventListener('pointerdown', pick);
    hit.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') showAt(null);
    });
    this.chartHost.append(root, this.tooltip);
    showAt(this.hover !== null && this.hover < n ? this.hover : null);
  }

  private fillLegend(data: Map<NationId, number[]>, i: number, dark: boolean): void {
    clear(this.legend);
    for (const nn of this.hist.nations) {
      const off = hiddenNations.has(nn);
      const v = data.get(nn)![i];
      const btn = h('button', {
        class: `chip legend-item${off ? ' off' : ''}`,
        'aria-pressed': String(!off),
        title: 'Click to hide or show; Shift-click or double-click to show only this nation',
        onclick: (e: MouseEvent) => this.toggle(nn, e.shiftKey),
        ondblclick: () => this.toggle(nn, true),
      },
      h('span', { class: 'swatch', style: `background:${nationColor(nn, dark)}` }),
      nationTitle(nn),
      h('span', { class: 'legend-value' }, format(this.metric, v)));
      this.legend.append(btn);
    }
  }
}
