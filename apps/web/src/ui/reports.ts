import {
  calendarOf,
  coloniesOverview,
  congressOverview,
  councilOf,
  councilText,
  CouncilText,
  systemsOfId,
  FATHERS,
  formatDate,
  GOOD_DEFS,
  goodsOf,
  historyFor,
  landForces,
  mechanicsOf,
  militaryStrength,
  nationOf,
  nationTitle,
  withTerms,
  nativesOverview,
  nativeRulesOf,
  tensionLabel,
  tensionSeverity,
  navalOverview,
  player,
  portName,
  portSummary,
  powerName,
  PRODUCT_NAMES,
  religionOverview,
  royalForces,
  term,
  Term,
  tradeOverview,
  peopleTradeOverview,
  TRIBES,
  UNIT_TYPES,
  warSupport,
  yearOf,
  type ColonyOverview,
  type ForceKind,
  type GameState,
  type GoodId,
  type HistoryEntry,
  type HistoryKind,
  type PlayerId,
  type ProductId,
  isPeoplePlayer,
} from '@cc/engine';
import type { App, Screen } from '../app.js';
import { clear, h, type Child } from '../dom.js';
import { activeStyle, icon } from '../styles.js';
import { victoryTab } from './victoryreport.js';

/**
 * The advisor reports, as in the original game's Reports menu: one screen with a tab per
 * advisor. A tab is one entry in REPORT_TABS (a name and a function that returns its cards),
 * so new reports, or new sections in a report, slot in without touching the screen.
 *
 * Fog of war: the reports show the viewer's own colonies, units, ships, trade and Congress in
 * full, and of the rest of the world only what the viewer knows: native settlements on explored
 * tiles, skills and wants only where the viewer's scout has visited, missions only in those known
 * settlements, and history entries that were public or concerned the viewer. Other nations'
 * internals never appear here (the Progress Graphs show their headline figures).
 */

export interface ReportContext {
  app: App;
  /** The nation the reports are about. */
  nation: PlayerId;
  /** True when an observer watches everything: history then shows every nation's events. */
  all: boolean;
  /** Rebuilds the screen, after a sort or filter change. */
  rerender: () => void;
}

export interface ReportTab {
  id: string;
  name: string;
  /** The advisor's title, shown as the tab's heading. */
  title: string;
  render: (ctx: ReportContext) => Child[];
  /** A playing people's own words for the tab: its towns, its council (native-nations.md T2, T8). */
  people?: { name: string; title: string };
  /** Only for some players: a playing people has no home port market or crosses (native-nations.md T1). */
  shown?: (s: GameState, nation: PlayerId) => boolean;
}

/** Whether a report is about a European system a playing people does not have. */
const notPeople = (s: GameState, nation: PlayerId) => !isPeoplePlayer(s.players.find((p) => p.id === nation));

// ---- Shared pieces ----

function goodIcon(g: ProductId, size = 20): HTMLElement {
  return icon({ kind: 'product', product: g }, size, PRODUCT_NAMES[g]);
}

function goodChip(g: GoodId, text: string, cls = ''): HTMLElement {
  return h('span', { class: `report-chip ${cls}`.trim(), title: GOOD_DEFS[g].name }, goodIcon(g, 18), text);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function turns(n: number | null, never = '—'): string {
  return n === null ? never : `${n} turn${n === 1 ? '' : 's'}`;
}

function flag(s: GameState, n: PlayerId): HTMLElement {
  return h('span', { class: 'flag', style: `background:${nationOf(s, n).color}` });
}

function stat(label: string, value: Child, note?: Child): HTMLElement {
  return h('div', { class: 'report-stat' }, h('span', { class: 'report-stat-label' }, label), h('strong', null, value), note ? h('span', { class: 'muted small' }, note) : null);
}

function card(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'card report-card' }, title ? h('h3', null, title) : null, ...children);
}

function bar(value: number, max: number, label: string): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return h('div', { class: 'bar', role: 'progressbar', 'aria-label': label, 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${pct}%` }));
}

/** A table that scrolls sideways inside its card on narrow screens. */
function scroll(table: HTMLElement): HTMLElement {
  return h('div', { class: 'report-scroll' }, table);
}

function empty(text: string): HTMLElement {
  return h('p', { class: 'muted small' }, text);
}

function where(app: App, label: string, at?: { x: number; y: number }): Child {
  if (!at) return label;
  return h('button', { class: 'link', title: 'Show on the map', onclick: () => { app.closeScreen(); app.centerOn(at.x, at.y); } }, label);
}

export interface Column<T> {
  key: string;
  label: string;
  title?: string;
  /** Sort value; columns without one are not sortable. */
  sort?: (row: T) => number | string;
  cell: (row: T) => Child;
  num?: boolean;
}

// Sort choices per table, remembered for the session.
const sorts = new Map<string, { key: string; dir: 1 | -1 }>();

/** A table whose headers sort it, for any list of rows. */
export function sortableTable<T>(id: string, columns: Column<T>[], rows: T[], rerender: () => void, rowClass?: (row: T) => string | undefined): HTMLElement {
  const st = sorts.get(id);
  const col = st && columns.find((c) => c.key === st.key && c.sort);
  const sorted = col
    ? [...rows].sort((a, b) => {
        const va = col.sort!(a);
        const vb = col.sort!(b);
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * st!.dir;
      })
    : rows;
  const head = h('tr', null, columns.map((c) => {
    if (!c.sort) return h('th', { class: c.num ? 'num' : undefined, title: c.title }, c.label);
    const active = st?.key === c.key;
    const arrow = active ? (st!.dir === 1 ? ' ▲' : ' ▼') : '';
    return h('th', { class: c.num ? 'num' : undefined, 'aria-sort': active ? (st!.dir === 1 ? 'ascending' : 'descending') : 'none' },
      h('button', {
        class: 'sort',
        title: c.title ? `${c.title}. Click to sort.` : 'Click to sort',
        onclick: () => {
          // Numbers sort largest first on the first click, names A to Z.
          const first = rows.length && typeof c.sort!(rows[0]) === 'number' ? -1 : 1;
          sorts.set(id, { key: c.key, dir: active ? (st!.dir === 1 ? -1 : 1) : first });
          rerender();
        },
      }, c.label, arrow));
  }));
  return scroll(h('table', { class: 'table report-table' },
    h('thead', null, head),
    h('tbody', null, sorted.map((r) => h('tr', { class: rowClass?.(r) }, columns.map((c) => h('td', { class: c.num ? 'num' : undefined }, c.cell(r))))))));
}

// ---- 1. Colonies ----

const KEY_PRODUCTS: ProductId[] = ['hammers', 'bells', 'crosses'];

function topGoods(o: ColonyOverview, n: number, goods: readonly GoodId[]): GoodId[] {
  return goods
    .filter((g) => g !== 'food' && o.report.produced[g] > 0)
    .sort((a, b) => o.report.produced[b] - o.report.produced[a])
    .slice(0, n);
}

function coloniesTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const rows = coloniesOverview(app.state, nation);
  if (!rows.length) return [card(null, empty('No colonies yet. Found one with a colonist on land (B).'))];
  const totals = rows.reduce((t, r) => ({ pop: t.pop + r.population, risk: t.risk + r.atRisk.length, starving: t.starving + (r.food.starving ? 1 : 0) }), { pop: 0, risk: 0, starving: 0 });
  const mine = nation === app.viewer && !app.observer;
  const cols: Column<ColonyOverview>[] = [
    { key: 'name', label: 'Colony', sort: (r) => r.colony.name, cell: (r) => h('button', { class: 'link strong', title: mine ? 'Open the colony' : 'Look inside', onclick: () => app.openColony(r.colony.id) }, r.colony.name) },
    { key: 'pop', label: 'Pop', title: 'Colonists working in the colony', num: true, sort: (r) => r.population, cell: (r) => String(r.population) },
    { key: 'sol', label: 'Rebels', title: 'Sons of Liberty membership', num: true, sort: (r) => r.sol, cell: (r) => h('span', { class: r.bonus < 0 ? 'bad-text' : r.sol >= 50 ? 'good-text' : undefined, title: r.bonus ? `Production ${signed(r.bonus)} per worker` : undefined }, `${r.sol}%`) },
    { key: 'food', label: 'Food', title: 'Food surplus per turn; turns until a new colonist is born', num: true, sort: (r) => r.food.net,
      cell: (r) => h('span', { class: r.food.net < 0 ? 'bad-text' : undefined }, signed(r.food.net), h('span', { class: 'muted small' }, r.food.turnsToGrow ? ` · grows in ${r.food.turnsToGrow}` : r.food.starving ? ' · starving' : '')) },
    { key: 'make', label: 'Production', title: 'Goods made per turn (top three), hammers, bells and crosses',
      cell: (r) => h('div', { class: 'report-chips' },
        topGoods(r, 3, goodsOf(app.state)).map((g) => goodChip(g, String(r.report.produced[g]))),
        KEY_PRODUCTS.filter((p) => r.report.produced[p] > 0).map((p) => h('span', { class: 'report-chip', title: PRODUCT_NAMES[p] }, goodIcon(p, 18), String(r.report.produced[p])))) },
    { key: 'build', label: 'Building', title: 'What is being built and turns until it is done', sort: (r) => r.build?.turns ?? 9999,
      cell: (r) => r.build
        ? h('span', null, r.build.name, h('span', { class: `small ${r.build.turns === null ? 'bad-text' : 'muted'}` }, ` · ${r.build.turns === null ? (r.build.needsTools ? 'needs tools' : 'no hammers') : turns(r.build.turns)}`))
        : h('span', { class: 'muted' }, 'Nothing') },
    { key: 'store', label: 'Warehouse', title: 'Goods stored; red goods spoil at the end of this turn or the next', sort: (r) => r.atRisk.length * 1000 + (r.warehouse[0]?.amount ?? 0),
      cell: (r) => h('div', { class: 'report-chips' },
        r.warehouse.slice(0, 4).map((w) => goodChip(w.good, `${w.amount}`, r.atRisk.includes(w.good) ? 'risk' : '')),
        r.warehouse.length > 4 ? h('span', { class: 'muted small', title: r.warehouse.slice(4).map((w) => `${w.amount} ${GOOD_DEFS[w.good].name}`).join(', ') }, `+${r.warehouse.length - 4} more`) : null,
        h('span', { class: 'muted small', title: 'Warehouse capacity per good' }, `/ ${r.capacity}`)) },
    { key: 'def', label: 'Defence', title: 'Soldiers and artillery in the colony, its fortification and its best defender’s strength', num: true, sort: (r) => r.defence.strength,
      cell: (r) => {
        const d = r.defence;
        const troops = [d.soldiers ? `${d.soldiers} armed` : '', d.artillery ? `${d.artillery} artillery` : ''].filter(Boolean).join(', ');
        return h('span', null,
          troops ? troops : h('span', { class: 'muted' }, 'no troops'),
          d.fortification ? h('span', { class: 'small' }, ` · ${d.fortification}`) : null,
          d.strength ? h('span', { class: 'muted small' }, ` · ${d.strength}`) : null);
      } },
  ];
  return [
    h('div', { class: 'report-stats' },
      stat('Colonies', rows.length),
      stat('Colonists', totals.pop),
      stat('Goods at risk', totals.risk, totals.risk ? 'highlighted in red' : 'nothing spoils'),
      stat('Starving', totals.starving)),
    card(null,
      sortableTable('colonies', cols, rows, ctx.rerender, (r) => (r.food.starving || r.warehouse.some((w) => w.spoil > 0) ? 'alert' : undefined)),
      h('p', { class: 'muted small' }, 'Click a column to sort, a colony to open it. Production is gross per turn; red goods will spoil in the warehouse at the end of this turn or the next.')),
  ];
}

// ---- 2. Trade ----

function tradeTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const s = app.state;
  const p = player(s, nation);
  const rows = tradeOverview(s, nation);
  const partners = rows[0]?.prices.slice(1).map((x) => x.port) ?? [];
  const closed = p.independence !== 'none';
  const boycotts = rows.filter((r) => r.boycotted).map((r) => r.good);
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: 'good', label: 'Good', sort: (r) => GOOD_DEFS[r.good].name, cell: (r) => h('span', { class: 'report-good' }, goodIcon(r.good), GOOD_DEFS[r.good].name, r.boycotted ? h('span', { class: 'pill bad', title: `Boycotted: pay the arrears in ${term(app.state, 'homeland')} to trade it again` }, 'boycott') : null) },
    { key: 'home', label: portName(app.state, nation), title: `Sell / buy price in ${portName(app.state, nation)}`, num: true, sort: (r) => r.prices[0].sell, cell: (r) => `${r.prices[0].sell} / ${r.prices[0].buy}` },
    ...partners.map((port, i): Column<Row> => ({
      key: `p${port}`, label: portName(app.state, port), title: `Sell / buy price in ${portName(app.state, port)} (${nationOf(app.state, port).adjective}, Favoured Nation, tax ${rows[0].prices[i + 1].tax}%)`, num: true,
      sort: (r) => r.prices[i + 1].sell,
      cell: (r) => h('span', { class: r.prices[i + 1].sell > r.prices[0].sell ? 'good-text' : undefined }, `${r.prices[i + 1].sell} / ${r.prices[i + 1].buy}`),
    })),
    { key: 'stored', label: 'In stock', title: 'Units in all your warehouses', num: true, sort: (r) => r.stored, cell: (r) => (r.stored ? String(r.stored) : '') },
    { key: 'now', label: 'This turn', title: `Units sold in ${term(app.state, 'homeland')} this turn`, num: true, sort: (r) => r.sold.now, cell: (r) => (r.sold.now ? String(r.sold.now) : '') },
    { key: 'last', label: 'Last turn', title: `Units sold in ${term(app.state, 'homeland')} last turn (custom houses sell at the end of a turn)`, num: true, sort: (r) => r.sold.last, cell: (r) => (r.sold.last ? String(r.sold.last) : '') },
    { key: 'total', label: 'This game', title: `Units sold in ${term(app.state, 'homeland')} since records began, custom house sales included`, num: true, sort: (r) => r.sold.total, cell: (r) => (r.sold.total ? String(r.sold.total) : '') },
    { key: 'custom', label: 'Custom house', title: 'Units the custom houses sold this game, and how many colonies export the good', num: true, sort: (r) => r.custom,
      cell: (r) => (r.custom || r.exportedBy ? h('span', null, r.custom ? String(r.custom) : '', r.exportedBy ? h('span', { class: 'muted small' }, ` (${r.exportedBy} export${r.exportedBy > 1 ? '' : 's'})`) : null) : '') },
    { key: 'route', label: 'By routes', title: 'Units trade routes unloaded in your colonies this game', num: true, sort: (r) => r.delivered, cell: (r) => (r.delivered ? String(r.delivered) : '') },
    { key: 'foreign', label: 'To partners', title: 'Units sold at trade partners’ colonies this game', num: true, sort: (r) => r.foreign, cell: (r) => (r.foreign ? String(r.foreign) : '') },
  ];
  return [
    h('div', { class: 'report-stats' },
      stat('Tax rate', `${p.tax}%`, closed ? `${Term(app.state, 'homeland')} is closed to rebels` : `in ${portName(app.state, nation)}`),
      stat('Gold', p.gold.toLocaleString()),
      stat('Boycotts', boycotts.length, boycotts.length ? boycotts.map((g) => GOOD_DEFS[g].name).join(', ') : 'none'),
      stat('Favoured ports', partners.length, partners.length ? partners.map((n) => portName(app.state, n)).join(', ') : 'none')),
    card(null,
      sortableTable('trade', cols, rows, ctx.rerender, (r) => (r.boycotted ? 'boycott' : undefined)),
      h('p', { class: 'muted small' }, `Prices are sell / buy per unit before tax. ${partners.length ? 'Favoured Nation ports are shown at their own prices; green means they pay more than home. ' : ''}Sales are counted from the moment this report was added; games saved before start counting when loaded.`),
      // Each home port has its own character (rules/ports.ts): what it pays more for, what is cheap there.
      [nation, ...partners].map((port) => h('p', { class: 'muted small port-character' }, portSummary(port, goodsOf(app.state)) + '.'))),
  ];
}

// ---- 2b. A people's trade (native-nations.md section 16) ----

/**
 * A playing people's Trade report (Beta 3 step 10b, T10): what it sold to the Europeans and bought
 * from them, with the gold, what it bartered with other peoples, and the prices at the colonies it
 * knows of, nearest first. Its gold comes only from this trade.
 */
function peopleTradeTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const s = app.state;
  const o = peopleTradeOverview(s, nation);
  const rows = o.rows.filter((r) => r.sold.total || r.bought.total || r.given || r.taken || r.stored);
  type Row = (typeof rows)[number];
  const n = (v: number) => (v ? v.toLocaleString() : '');
  const cols: Column<Row>[] = [
    { key: 'good', label: 'Good', sort: (r) => GOOD_DEFS[r.good].name, cell: (r) => h('span', { class: 'report-good' }, goodIcon(r.good), GOOD_DEFS[r.good].name) },
    { key: 'stored', label: 'In the towns', title: 'Units in all your towns now', num: true, sort: (r) => r.stored, cell: (r) => n(r.stored) },
    { key: 'sold', label: 'Sold', title: 'Units sold to European nations this game', num: true, sort: (r) => r.sold.total, cell: (r) => n(r.sold.total) },
    { key: 'soldGold', label: 'Gold in', title: 'Gold the sales brought this game', num: true, sort: (r) => r.sold.gold, cell: (r) => n(r.sold.gold) },
    { key: 'bought', label: 'Bought', title: 'Units bought from European nations this game', num: true, sort: (r) => r.bought.total, cell: (r) => n(r.bought.total) },
    { key: 'boughtGold', label: 'Gold out', title: 'Gold paid for them this game', num: true, sort: (r) => r.bought.gold, cell: (r) => n(r.bought.gold) },
    { key: 'last', label: 'Last turn', title: 'Units sold / bought last turn', num: true, sort: (r) => r.sold.last + r.bought.last, cell: (r) => (r.sold.last || r.bought.last ? `${r.sold.last} / ${r.bought.last}` : '') },
    { key: 'given', label: 'Bartered away', title: 'Units given in barter with other peoples this game', num: true, sort: (r) => r.given, cell: (r) => n(r.given) },
    { key: 'taken', label: 'Bartered for', title: 'Units taken in barter with other peoples this game', num: true, sort: (r) => r.taken, cell: (r) => n(r.taken) },
  ];
  const furs = o.rows.find((r) => r.good === 'furs');
  const goldIn = o.rows.reduce((t, r) => t + r.sold.gold, 0);
  const goldOut = o.rows.reduce((t, r) => t + r.bought.gold, 0);
  const priceCell = (e: { good: GoodId; price: number }, wanted = false) =>
    h('span', { class: `report-chip${wanted ? ' good-text' : ''}`, title: `${GOOD_DEFS[e.good].name}${wanted ? ' (wanted: you pay more)' : ''}` }, goodIcon(e.good, 18), String(e.price));
  return [
    h('div', { class: 'report-stats' },
      stat('Gold', o.gold.toLocaleString(), 'only from trade with the Europeans'),
      stat('Furs sold', (furs?.sold.total ?? 0).toLocaleString(), furs?.sold.gold ? `for ${furs.sold.gold.toLocaleString()} gold` : 'none yet'),
      stat('Gold from sales', goldIn.toLocaleString(), `spent ${goldOut.toLocaleString()} on goods`),
      stat('Wanted most', o.wants.length ? GOOD_DEFS[o.wants[0]].name : '—', o.wants.length > 1 ? `then ${o.wants.slice(1).map((g) => GOOD_DEFS[g].name.toLowerCase()).join(', ')}` : undefined)),
    card('Trade this game',
      rows.length ? sortableTable('people-trade', cols, rows, ctx.rerender) : empty('Nothing sold, bought or bartered yet.'),
      h('p', { class: 'muted small' }, 'A carrier beside a European colony or wagon train sells and buys there; barter with other peoples trades goods for goods. Your computer people also trades on its own once a year.')),
    card('Prices at the colonies you know',
      o.nations.length
        ? scroll(h('table', { class: 'table report-table' },
            h('thead', null, h('tr', null, h('th', null, 'Nation'), h('th', null, 'Nearest colony'), h('th', { class: 'num' }, 'Tiles'), h('th', null, 'They pay you'), h('th', null, 'You pay them'))),
            h('tbody', null, o.nations.map((e) => h('tr', { class: e.atWar ? 'boycott' : undefined },
              h('td', null, flag(s, e.nation), ' ', nationOf(s, e.nation).name, e.treaty ? h('span', { class: 'pill good', title: 'A trade treaty: you get its prices when you come to trade' }, 'treaty') : null, e.atWar ? h('span', { class: 'pill bad' }, 'war') : null),
              h('td', null, where(app, e.colony.name, e.colony)),
              h('td', { class: 'num' }, String(e.distance), e.nearby ? h('span', { class: 'muted small', title: 'Within a trade visit’s reach of one of your towns' }, ' near') : null),
              h('td', null, e.sell.map((x) => priceCell(x))),
              h('td', null, e.buy.map((x) => priceCell(x, o.wants.includes(x.good)))))))))
        : empty('You know of no European colony yet.'),
      h('p', { class: 'muted small' }, 'Gold a unit, when your people come to trade. A trade treaty gives better prices both ways; you pay more for the goods you want most.')),
  ];
}

// ---- 3. Military ----

const FORCE_NAMES: Record<ForceKind, string> = {
  soldier: 'Soldiers', dragoon: 'Dragoons', artillery: 'Artillery', scout: 'Scouts', pioneer: 'Pioneers', missionary: 'Missionaries', colonist: 'Colonists', wagon: 'Wagon trains', treasure: 'Treasure trains',
};

function militaryTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const s = app.state;
  const forces = landForces(s, nation);
  const count = (k: ForceKind) => forces.filter((f) => f.kind === k).length;
  const strength = militaryStrength(forces.map((f) => f.unit));
  const ref = mechanicsOf(s).ref ? royalForces(s, nation) : null;
  const p = player(s, nation);

  // Units by where they are.
  const groups = new Map<string, typeof forces>();
  for (const f of forces) groups.set(f.where, [...(groups.get(f.where) ?? []), f]);
  const order = [...groups.entries()].sort((a, b) => {
    const rank = (k: string, list: typeof forces) => (list[0].colonyId ? 0 : k === 'In the field' ? 1 : 2);
    return rank(a[0], a[1]) - rank(b[0], b[1]) || a[0].localeCompare(b[0]);
  });
  const byPlace = forces.length
    ? scroll(h('table', { class: 'table report-table' },
        h('thead', null, h('tr', null, h('th', null, 'Where'), h('th', null, 'Units'))),
        h('tbody', null, order.map(([place, list]) => h('tr', null,
          h('td', null, list[0].colonyId ? h('button', { class: 'link strong', onclick: () => app.openColony(list[0].colonyId!) }, place) : place),
          h('td', null, h('div', { class: 'report-chips' }, list.map((f) => h('button', {
            class: 'report-chip unit',
            title: `${f.name}${f.unit.state === 'fortified' ? ', fortified' : f.unit.state === 'sentry' ? ', on sentry' : ''}${f.at && !f.colonyId ? ` at ${f.at.x},${f.at.y}` : ''}`,
            onclick: () => {
              if (!f.at) return;
              app.closeScreen();
              if (f.unit.loc.kind === 'map' && f.unit.owner === app.viewer) app.select(f.unit.id);
              else app.centerOn(f.at.x, f.at.y);
            },
          }, icon({ kind: 'unit', type: f.unit.type, role: f.unit.role, color: nationOf(app.state, f.unit.owner).color }, 26), f.unit.state === 'fortified' ? '▪' : '')))))))))
    : empty('No land units outside your colonies.');

  // Units by type and role.
  const types = new Map<string, { name: string; n: number; kind: ForceKind; sample: (typeof forces)[number] }>();
  for (const f of forces) {
    const t = types.get(f.name) ?? { name: f.name, n: 0, kind: f.kind, sample: f };
    t.n++;
    types.set(f.name, t);
  }
  const byType = scroll(h('table', { class: 'table report-table' },
    h('thead', null, h('tr', null, h('th', null, 'Unit'), h('th', null, 'Role'), h('th', { class: 'num' }, 'Count'))),
    h('tbody', null, [...types.values()].sort((a, b) => b.n - a.n).map((t) => h('tr', null,
      h('td', null, h('span', { class: 'report-good' }, icon({ kind: 'unit', type: t.sample.unit.type, role: t.sample.unit.role, color: nationOf(app.state, nation).color }, 24), t.name)),
      h('td', { class: 'muted' }, FORCE_NAMES[t.kind]),
      h('td', { class: 'num' }, String(t.n)))))));

  const colonies = coloniesOverview(s, nation);
  const forts = sortableTable('forts', [
    { key: 'name', label: 'Colony', sort: (r) => r.colony.name, cell: (r) => h('button', { class: 'link', onclick: () => app.openColony(r.colony.id) }, r.colony.name) },
    { key: 'fort', label: 'Fortification', sort: (r) => r.colony.buildings.stockade, cell: (r) => r.defence.fortification ?? h('span', { class: 'muted' }, 'None') },
    { key: 'sold', label: 'Soldiers', num: true, sort: (r) => r.defence.soldiers, cell: (r) => String(r.defence.soldiers) },
    { key: 'art', label: 'Artillery', num: true, sort: (r) => r.defence.artillery, cell: (r) => String(r.defence.artillery) },
    { key: 'str', label: 'Defence', title: 'Strength of the best defender, with terrain, fortification and veteran bonuses', num: true, sort: (r) => r.defence.strength, cell: (r) => String(r.defence.strength) },
    { key: 'muskets', label: 'Muskets', title: 'Muskets in store to re-arm soldiers', num: true, sort: (r) => r.colony.goods.muskets, cell: (r) => String(r.colony.goods.muskets) },
  ], colonies, ctx.rerender, (r) => (r.defence.soldiers + r.defence.artillery === 0 ? 'alert' : undefined));

  const refTotal = ref ? ref.regulars + ref.dragoons + ref.artillery + ref.menOfWar : 0;
  // Mercenaries and the foreign intervention force (rebellion.ts).
  const support = warSupport(s, nation);
  const kinds = (list: typeof support.allies) => {
    const n = (f: (u: (typeof list)[number]) => boolean) => list.filter(f).length;
    const parts = [
      [n((u) => u.role === 'soldier'), 'soldiers'],
      [n((u) => u.role === 'dragoon'), 'dragoons'],
      [n((u) => UNIT_TYPES[u.type].kind === 'artillery'), 'artillery'],
      [n((u) => UNIT_TYPES[u.type].kind === 'ship'), 'men-of-war'],
    ].filter(([k]) => k) as [number, string][];
    return parts.map(([k, what]) => `${k} ${what}`).join(', ');
  };
  const iv = support.intervention;
  const supportCard = support.mercenaries.length || support.allies.length || iv
    ? card('Mercenaries and allies',
      h('p', null, support.mercenaries.length ? `Mercenaries in your service: ${kinds(support.mercenaries)}.` : 'No mercenaries in your service.'),
      iv?.came
        ? h('p', null, `${powerName(s, iv.came.by)} intervened in ${formatDate(iv.came.turn, calendarOf(s))} with ${iv.came.land} land units and men-of-war.${support.allies.length ? ` Still fighting: ${kinds(support.allies)}. They fight ${term(s, 'crown')} on their own and go home when the war ends.` : ' None of them is still fighting.'}`)
        : iv ? h('p', null, `Foreign intervention: a European power will send a force once the war has lasted ${iv.minTurns} turns (now ${iv.turns}), your colonies have rung ${iv.needBells.toLocaleString()} liberty bells since the declaration (now ${iv.bells.toLocaleString()}) and you still hold ${iv.needHeld} colonies (now ${iv.held}).`)
        : null)
    : null;
  return [
    h('div', { class: 'report-stats' },
      stat('Strength', strength, 'combined attack'),
      stat('Soldiers', count('soldier')),
      stat('Dragoons', count('dragoon')),
      stat('Artillery', count('artillery')),
      stat('Other units', forces.length - count('soldier') - count('dragoon') - count('artillery'))),
    ref ? card(`${Term(app.state, 'ref')}`,
      h('p', null, p.independence === 'declared'
        ? `Still to land: ${ref.regulars} regulars, ${ref.dragoons} dragoons, ${ref.artillery} artillery and ${ref.menOfWar} men-of-war. ${ref.landed} royal units are already in ${term(app.state, 'colonyLand')}.`
        : p.independence === 'won' ? `${Term(app.state, 'crown')}’s forces have been defeated.`
        : `${Term(app.state, 'crown')} keeps ${ref.regulars} regulars, ${ref.dragoons} dragoons, ${ref.artillery} artillery and ${ref.menOfWar} men-of-war ready to sail against a rebellion${refTotal ? '' : ' (none yet)'}. ${Term(app.state, 'king')} adds to it during the game, faster as your colonies ring more liberty bells.`),
      h('p', { class: 'muted small' }, `Your own strength above counts soldiers at 2, dragoons at 3 and artillery at 5, as ${term(app.state, 'crown')}’s regulars would.`)) : null,
    supportCard,
    card('By place', byPlace),
    h('div', { class: 'report-columns' }, card('By type', forces.length ? byType : empty('None.')), card('Fortifications', colonies.length ? forts : empty('No colonies.'))),
  ];
}

// ---- 4. Naval ----

function navalTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const ships = navalOverview(app.state, nation);
  if (!ships.length) return [card(null, empty('You have no ships.'))];
  type Row = (typeof ships)[number];
  const holds = ships.reduce((n, sh) => n + sh.holds, 0);
  const used = ships.reduce((n, sh) => n + sh.used, 0);
  const cols: Column<Row>[] = [
    { key: 'ship', label: 'Ship', sort: (r) => r.name, cell: (r) => h('span', { class: 'report-good' }, icon({ kind: 'unit', type: r.unit.type, role: r.unit.role, color: nationOf(app.state, nation).color }, 28), r.name) },
    { key: 'where', label: 'Where', sort: (r) => r.where, cell: (r) => where(app, r.where === 'In the field' ? (r.at ? `At sea ${r.at.x},${r.at.y}` : 'At sea') : r.where, r.at) },
    { key: 'holds', label: 'Holds', title: 'Holds in use / holds', num: true, sort: (r) => r.used, cell: (r) => `${r.used}/${r.holds}` },
    { key: 'cargo', label: 'Cargo', cell: (r) => (r.cargo.length || r.passengers.length
      ? h('div', { class: 'report-chips' },
          r.cargo.map((c) => goodChip(c.good, String(c.amount))),
          r.passengers.map((u) => h('span', { class: 'report-chip unit', title: u.type === 'treasure' ? `Treasure (${u.treasure ?? 0} gold)` : UNIT_TYPES[u.type].name }, icon({ kind: 'unit', type: u.type, role: u.role, color: nationOf(app.state, u.owner).color }, 24))))
      : h('span', { class: 'muted' }, 'Empty')) },
    { key: 'orders', label: 'Orders', sort: (r) => r.orders, cell: (r) => h('span', { class: r.repair ? 'bad-text' : undefined }, r.orders) },
    { key: 'str', label: 'Attack', title: 'Attack strength (warships)', num: true, sort: (r) => UNIT_TYPES[r.unit.type].offence, cell: (r) => (UNIT_TYPES[r.unit.type].offence ? String(UNIT_TYPES[r.unit.type].offence) : '') },
  ];
  const repairing = ships.filter((sh) => sh.repair).length;
  return [
    h('div', { class: 'report-stats' },
      stat('Ships', ships.length),
      stat('Holds', `${used}/${holds}`, 'in use'),
      stat('On routes', ships.filter((sh) => sh.unit.route).length),
      stat('Under repair', repairing)),
    card(null, sortableTable('naval', cols, ships, ctx.rerender, (r) => (r.repair ? 'alert' : undefined)),
      h('p', { class: 'muted small' }, `Damaged ships are repaired at a drydock or in ${term(app.state, 'homeland')}; their cargo was lost in the fight.`)),
  ];
}

// ---- 5. Religion ----

function religionTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const s = app.state;
  const r = religionOverview(s, nation);
  const p = player(s, nation);
  return [
    h('div', { class: 'report-stats' },
      stat('Crosses per turn', r.crossesPerTurn),
      stat('Next immigrant', r.closed ? 'closed' : turns(r.turnsToImmigrant, 'never'), r.closed ? 'no immigrants after the declaration' : `${r.crosses}/${r.crossesRequired} crosses`),
      mechanicsOf(s).missions ? stat('Missions', r.missions.reduce((n, m) => n + m.own, 0)) : null,
      stat('Native converts', r.converts)),
    card('Immigration',
      bar(r.crosses, r.crossesRequired, 'Crosses towards the next immigrant'),
      h('p', { class: 'small' }, `${r.crosses} of ${r.crossesRequired} crosses. `, r.closed ? `${Term(app.state, 'homeland')} sends no one to rebels.` : r.turnsToImmigrant ? `At this rate the next immigrant reaches the docks in about ${turns(r.turnsToImmigrant)}.` : 'Build a church and put a preacher to work to draw immigrants.'),
      p.recruitPool.length && !r.closed ? h('div', null, h('span', { class: 'muted small' }, 'Waiting to emigrate: '), h('div', { class: 'report-chips' }, p.recruitPool.map((t) => h('span', { class: 'report-chip unit', title: UNIT_TYPES[t].name }, icon({ kind: 'unit', type: t, role: 'none', color: nationOf(app.state, nation).color }, 24), UNIT_TYPES[t].name)))) : null),
    h('div', { class: 'report-columns' },
      card('Crosses by colony', r.colonies.length
        ? scroll(h('table', { class: 'table report-table' },
            h('tbody', null, r.colonies.map((c) => h('tr', null,
              h('td', null, h('button', { class: 'link', onclick: () => app.openColony(c.colony.id) }, c.colony.name)),
              h('td', { class: 'num' }, String(c.crosses)))))))
        : empty('No colony makes crosses.')),
      !mechanicsOf(s).missions ? null : card('Missions', r.missions.length
        ? scroll(h('table', { class: 'table report-table' },
            h('thead', null, h('tr', null, h('th', null, 'Tribe'), h('th', { class: 'num' }, 'Yours'), h('th', null, 'Others'))),
            h('tbody', null, r.missions.map((m) => h('tr', null,
              h('td', null, h('span', { class: 'flag', style: `background:${TRIBES[m.tribe].color}` }), ' ', TRIBES[m.tribe].name),
              h('td', { class: 'num' }, String(m.own)),
              h('td', null, (Object.entries(m.rival) as [PlayerId, number][]).map(([n, k]) => h('span', { class: 'report-chip' }, flag(app.state, n), `${nationOf(app.state, n).adjective} ${k}`))))))))
        : empty('No missions among the settlements you know.'),
        h('p', { class: 'muted small' }, 'Missions calm their settlement and now and then send a convert to your nearest colony. Only settlements you have found are counted.'))),
  ];
}

// ---- 6. Natives ----

function nativesTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const tribes = nativesOverview(app.state, nation);
  if (!tribes.length) return [card(null, empty('You have not found any native settlements yet.'))];
  type Row = (typeof tribes)[number]['settlements'][number];
  const thresholds = nativeRulesOf(app.state).tension;
  const moodPill = (t: number, war: boolean) => h('span', { class: `pill ${war ? 'bad' : tensionSeverity(t, thresholds)}`, title: `Tension ${t} of 1000` }, war ? 'at war' : tensionLabel(t, thresholds));
  return [
    h('div', { class: 'report-stats' },
      stat('Tribes met', tribes.length),
      stat('Settlements known', tribes.reduce((n, t) => n + t.known, 0)),
      stat('At war', tribes.filter((t) => t.atWar).length),
      stat('Visited by scouts', tribes.reduce((n, t) => n + t.settlements.filter((x) => x.visited).length, 0))),
    ...tribes.map((t) => {
      const cols: Column<Row>[] = [
        { key: 'name', label: 'Settlement', sort: (r) => r.name, cell: (r) => where(app, r.settlement.capital ? `${r.name} ★` : r.name, r.settlement) },
        { key: 'mood', label: 'Mood', sort: (r) => r.tension, num: true, cell: (r) => h('span', null, moodPill(r.tension, t.atWar), h('span', { class: 'muted small' }, ` ${r.tension}`)) },
        { key: 'skill', label: 'Teaches', sort: (r) => (r.skill === undefined ? 'zz' : r.skill === null ? 'zy' : UNIT_TYPES[r.skill].name),
          cell: (r) => (r.skill === undefined ? h('span', { class: 'muted' }, '?') : r.skill === null ? h('span', { class: 'muted' }, 'Taught') : UNIT_TYPES[r.skill].name) },
        { key: 'wants', label: 'Wants', cell: (r) => (r.wants ? h('div', { class: 'report-chips' }, r.wants.map((g) => goodChip(g, GOOD_DEFS[g].name))) : h('span', { class: 'muted' }, '?')) },
        { key: 'mission', label: 'Mission', sort: (r) => (r.mission ? nationOf(app.state, r.mission).adjective : ''), cell: (r) => (r.mission ? h('span', null, flag(app.state, r.mission), ' ', r.mission === nation ? 'Yours' : nationOf(app.state, r.mission).adjective) : '') },
        { key: 'visited', label: 'Scout', title: 'Has your scout spoken with the chief?', sort: (r) => (r.visited ? 1 : 0), cell: (r) => (r.visited ? '✓' : h('span', { class: 'muted' }, 'no')) },
        { key: 'land', label: 'Land claimed', title: 'Tiles around the settlement claimed by you / by others / still native', sort: (r) => r.land.own + r.land.others,
          cell: (r) => h('span', null, `${r.land.own} / ${r.land.others}`, h('span', { class: 'muted small' }, ` of ${r.land.own + r.land.others + r.land.native}`)) },
        { key: 'near', label: 'Nearest colony', num: true, sort: (r) => r.nearestColony ?? 999, cell: (r) => (r.nearestColony === null ? '' : String(r.nearestColony)) },
      ];
      return card(null,
        h('div', { class: 'report-tribe-head' },
          h('h3', null, h('span', { class: 'flag', style: `background:${TRIBES[t.tribe].color}` }), ' ', TRIBES[t.tribe].name),
          moodPill(t.tension, t.atWar),
          h('span', { class: 'muted small' }, `${t.known} settlement${t.known > 1 ? 's' : ''} known`)),
        sortableTable(`natives-${t.tribe}`, cols, t.settlements, ctx.rerender));
    }),
    h('p', { class: 'muted small' }, 'Only settlements you have found are listed. What a settlement teaches and wants is known once your scout has spoken with its chief. ★ marks a capital.'),
  ];
}

// ---- 7. Continental Congress ----

function congressTab(ctx: ReportContext): Child[] {
  const { app, nation } = ctx;
  const s = app.state;
  const c = congressOverview(s, nation);
  const p = player(s, nation);
  const cur = c.current ? FATHERS[c.current] : null;
  const mine = nation === app.viewer && app.isMyTurn();
  // The player's own council: the Congress, or a people's council with its own words (native-nations.md T8).
  const word = (key: 'councilShort' | 'member' | 'members' | 'product') => councilText(s, nation, key);
  const Word = (key: 'members' | 'product') => CouncilText(s, nation, key);
  const congress = systemsOfId(nation).congress;
  const seats = (councilOf(s, nation)?.members ?? []).filter((id) => !FATHERS[id].peoples || FATHERS[id].peoples!.includes(nation)).length;
  return [
    h('div', { class: 'report-stats' },
      stat(`${Word('product')} per turn`, c.bellsPerTurn),
      stat(congress ? 'Bells rung' : `${Word('product')} given`, c.bells.toLocaleString()),
      congress ? stat('Rebels', `${c.rebels}%`, p.independence === 'none' ? (c.rebels >= 50 ? 'enough to declare independence' : '50% needed to declare') : p.independence === 'declared' ? `at war with ${term(app.state, 'crown')}` : p.independence) : null,
      stat(`${Word('members')}`, `${c.fathers.length}/${seats}`)),
    h('p', null, h('button', { class: 'btn', onclick: () => app.openCongress() }, `Open the ${word('councilShort')} hall`)),
    card(`Next ${word('member')}`,
      cur
        ? h('div', null,
            h('div', { class: 'congress-sought' },
              icon({ kind: 'father', id: c.current!, category: cur.category }, 96, cur.name),
              h('p', null, h('strong', null, cur.name), h('span', { class: 'muted small' }, ` (${cur.category})`), ` — ${cur.effect}`)),
            bar(c.fatherBells, c.fatherCost, `${Word('product')} towards the next ${word('member')}`),
            h('p', { class: 'small' }, `${c.fatherBells} of ${c.fatherCost} ${word('product')} · ${c.turnsToFather ? `joins in about ${turns(c.turnsToFather)}` : congress ? 'no bells are being rung' : `no ${word('product')} is being given`}`))
        : h('p', null, `No candidate chosen (${c.fatherBells} ${word('product')} collected). `, mine ? h('button', { class: 'btn small', onclick: () => { app.closeScreen(); void app.chooseFather(); } }, 'Choose one') : null)),
    !congress ? null : card('Sons of Liberty by colony', c.colonies.length
      ? sortableTable('congress', [
          { key: 'name', label: 'Colony', sort: (r) => r.colony.name, cell: (r) => h('button', { class: 'link', onclick: () => app.openColony(r.colony.id) }, r.colony.name) },
          { key: 'pop', label: 'Pop', num: true, sort: (r) => r.population, cell: (r) => String(r.population) },
          { key: 'sol', label: 'Rebels', num: true, sort: (r) => r.sol, cell: (r) => h('span', null, `${r.sol}%`, h('span', { class: 'report-mini-bar' }, h('span', { style: `width:${r.sol}%` }))) },
          { key: 'tory', label: `${Term(app.state, 'loyalists')}`, num: true, sort: (r) => r.population - Math.round((r.population * r.sol) / 100), cell: (r) => String(r.population - Math.round((r.population * r.sol) / 100)) },
          { key: 'bonus', label: 'Bonus', title: `Production per worker: +1 at 50% rebels, +2 at 100%; too many ${term(app.state, 'loyalists')} cost 1 or 2`, num: true, sort: (r) => r.bonus,
            cell: (r) => h('span', { class: r.bonus > 0 ? 'good-text' : r.bonus < 0 ? 'bad-text' : 'muted' }, r.bonus ? signed(r.bonus) : '0') },
          { key: 'bells', label: 'Bells', num: true, sort: (r) => r.bells, cell: (r) => String(r.bells) },
        ], c.colonies, ctx.rerender)
      : empty('No colonies.')),
    card(`Members of the ${word('councilShort')}`, c.fathers.length
      ? h('ul', { class: 'report-fathers' }, c.fathers.map((id) => h('li', null,
          icon({ kind: 'father', id, category: FATHERS[id].category }, 48, FATHERS[id].name),
          h('div', null, h('strong', null, FATHERS[id].name), h('span', { class: 'muted small' }, ` ${FATHERS[id].category}`), h('div', { class: 'small' }, FATHERS[id].effect)))))
      : empty(`No ${word('members')} have joined yet.`)),
  ];
}

// ---- 8. History ----

const HISTORY_FILTERS: { id: string; name: string; kinds: HistoryKind[] }[] = [
  { id: 'all', name: 'Everything', kinds: [] },
  { id: 'colonies', name: 'Colonies', kinds: ['colony', 'captured'] },
  { id: 'congress', name: '{councilShort}', kinds: ['father', 'independence'] },
  { id: 'diplomacy', name: 'Diplomacy', kinds: ['war', 'peace', 'trade', 'favoured', 'alliance', 'company', 'cancel', 'tribe'] },
  { id: 'treasure', name: 'Treasure and conquest', kinds: ['treasure', 'burned'] },
  { id: 'crown', name: '{Crown}', kinds: ['crown'] },
  { id: 'events', name: 'Events', kinds: ['event'] },
];

const HISTORY_MARKS: Record<HistoryKind, string> = {
  colony: '⌂', captured: '⚑', father: '★', war: '⚔', peace: '☮', trade: '⇄', favoured: '♦', alliance: '⛨', company: '⚓', cancel: '✕', treasure: '◆', burned: '🔥', independence: '✦', tribe: '⚔', crown: '♛', event: '✸',
};

let historyFilter = 'all';
let historyMine = false;
let historyNewest = true;

function historyTab(ctx: ReportContext): Child[] {
  const { app, nation, all } = ctx;
  const s = app.state;
  const filter = HISTORY_FILTERS.find((f) => f.id === historyFilter) ?? HISTORY_FILTERS[0];
  let list: HistoryEntry[] = historyFor(s, all ? undefined : nation);
  if (filter.kinds.length) list = list.filter((e) => filter.kinds.includes(e.kind));
  if (historyMine && !all) list = list.filter((e) => e.nations.includes(nation));
  if (historyNewest) list = [...list].reverse();
  // Group by year.
  const years: { year: number; entries: HistoryEntry[] }[] = [];
  for (const e of list) {
    const y = yearOf(e.turn, calendarOf(s)).year;
    if (years.at(-1)?.year !== y) years.push({ year: y, entries: [] });
    years.at(-1)!.entries.push(e);
  }
  const controls = h('div', { class: 'report-filters', role: 'group', 'aria-label': 'Filter the history' },
    HISTORY_FILTERS.map((f) => h('button', { class: `chip${f.id === filter.id ? ' on' : ''}`, 'aria-pressed': String(f.id === filter.id), onclick: () => { historyFilter = f.id; ctx.rerender(); } }, withTerms(s, f.name))),
    all ? null : h('label', { class: 'small report-check' }, h('input', { type: 'checkbox', checked: historyMine || undefined, onchange: (e: Event) => { historyMine = (e.target as HTMLInputElement).checked; ctx.rerender(); } }), ` Only ${nationOf(app.state, nation).name}`),
    h('button', { class: 'btn tiny', onclick: () => { historyNewest = !historyNewest; ctx.rerender(); } }, historyNewest ? 'Newest first' : 'Oldest first'));
  const started = s.history?.[0]?.turn;
  return [
    card(null, controls,
      years.length
        ? h('ol', { class: 'report-history' }, years.map((y) => h('li', null,
            h('h4', null, String(y.year)),
            h('ul', null, y.entries.map((e) => h('li', { class: `history-${e.kind}` },
              h('span', { class: 'history-mark', 'aria-hidden': 'true' }, HISTORY_MARKS[e.kind]),
              h('span', { class: 'muted small history-date' }, formatDate(e.turn, calendarOf(s))),
              e.nations[0] ? flag(app.state, e.nations[0]) : null,
              e.at ? where(app, e.text, e.at) : h('span', null, e.text)))))))
        : empty('Nothing recorded yet.'),
      h('p', { class: 'muted small' }, `Events are recorded as they happen${started !== undefined && started > 0 ? `, here since ${formatDate(started, calendarOf(s))} (games saved before this report start recording when loaded)` : ''}. You hear of other nations’ wars, treaties, ${term(app.state, 'members')} and declarations; their colonies and treasures stay their own business. The oldest entries are dropped after 800.`)),
  ];
}

export const REPORT_TABS: ReportTab[] = [
  { id: 'colonies', name: 'Colonies', title: 'Colonial advisor', render: coloniesTab, people: { name: 'Towns', title: 'The towns' } },
  // A people's own Trade report: its sales, purchases and barter, and the prices nearby (step 10b).
  { id: 'trade', name: 'Trade', title: 'Trade advisor', render: (ctx) => (notPeople(ctx.app.state, ctx.nation) ? tradeTab(ctx) : peopleTradeTab(ctx)), people: { name: 'Trade', title: 'Trade with the Europeans and the peoples' } },
  { id: 'military', name: 'Military', title: 'Military advisor', render: militaryTab },
  { id: 'naval', name: 'Naval', title: 'Naval advisor', render: navalTab },
  { id: 'religion', name: 'Religion', title: 'Religious advisor', render: religionTab, shown: notPeople },
  { id: 'natives', name: 'Natives', title: 'Indian advisor', render: nativesTab, people: { name: 'Peoples', title: 'The peoples nobody plays' } },
  { id: 'congress', name: '{councilShort}', title: '{council}', render: congressTab },
  { id: 'history', name: 'History', title: 'History of the colonies', render: historyTab, people: { name: 'History', title: 'History' } },
  // The scenario's ways to win and where the player stands (Beta 3 step 10; native-nations.md T14).
  { id: 'victory', name: 'Victory', title: 'Ways to win', render: (ctx) => victoryTab(ctx) },
];

// Remembered for the session.
let lastTab = REPORT_TABS[0].id;
let lastNation: PlayerId | undefined;

export class ReportsScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private tab: string;
  private drawnKey = '';

  constructor(private app: App, tab?: string) {
    this.tab = tab && REPORT_TABS.some((t) => t.id === tab) ? tab : lastTab;
    if (!this.tabs().some((t) => t.id === this.tab)) this.tab = this.tabs()[0].id;
    lastTab = this.tab;
    this.body = h('div', { class: 'screen-body' });
    this.el = h('section', { class: 'screen reports-screen', role: 'dialog', 'aria-label': 'Reports' }, this.body);
  }

  /** A tab's name or title in the words of the player it is about: a people's council is its own (T8). */
  private words(t: ReportTab, key: 'name' | 'title'): string {
    const s = this.app.state;
    const nation = this.nation();
    if (isPeoplePlayer(s.players.find((p) => p.id === nation))) {
      if (t.people) return t.people[key];
      if (t.id === 'congress') return CouncilText(s, nation, key === 'name' ? 'councilShort' : 'council');
    }
    return withTerms(s, t[key]);
  }

  /** The reports shown for the nation they are about. */
  private tabs(): ReportTab[] {
    const nation = this.nation();
    return REPORT_TABS.filter((t) => !t.shown || t.shown(this.app.state, nation));
  }

  /** The nation the reports are about: the player's own, or the one an observer picked. */
  private nation(): PlayerId {
    const app = this.app;
    if (!app.observer) return app.viewer;
    if (app.watch !== 'all') return app.watch;
    const nations = app.state.players.filter((p) => p.id !== 'crown').map((p) => p.id);
    return lastNation && nations.includes(lastNation) ? lastNation : nations[0];
  }

  refresh(): void {
    // Panels refresh on every frame of a watched game; only rebuild when something changed.
    const s = this.app.state;
    const key = `${this.tab}|${s.turn}|${s.current}|${s.messages.length}|${this.nation()}|${this.app.watch}|${activeStyle().id}`;
    if (key === this.drawnKey) return;
    this.build();
  }

  setTab(id: string): void {
    if (!this.tabs().some((t) => t.id === id)) return;
    this.tab = lastTab = id;
    this.build();
  }

  onKey(e: KeyboardEvent): boolean {
    const n = /^Digit([1-9])$/.exec(e.code) ?? /^F([1-9])$/.exec(e.key);
    if (n && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = this.tabs()[Number(n[1]) - 1];
      if (t) this.setTab(t.id);
      return true;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const tabs = this.tabs();
      const i = tabs.findIndex((t) => t.id === this.tab);
      this.setTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].id);
      return true;
    }
    return false;
  }

  private build(): void {
    const app = this.app;
    const s = app.state;
    const nation = this.nation();
    this.drawnKey = `${this.tab}|${s.turn}|${s.current}|${s.messages.length}|${nation}|${app.watch}|${activeStyle().id}`;
    const tabs = this.tabs();
    if (!tabs.some((t) => t.id === this.tab)) this.tab = tabs[0].id;
    const tab = tabs.find((t) => t.id === this.tab)!;
    const scrollTop = this.el.parentElement?.scrollTop ?? 0;
    clear(this.body);
    const ctx: ReportContext = { app, nation, all: app.observer && app.watch === 'all' && tab.id === 'history', rerender: () => this.build() };
    const pick = app.observer && app.watch === 'all'
      ? h('label', { class: 'field report-nation' }, h('span', null, 'Nation'),
          h('select', { onchange: (e: Event) => { lastNation = (e.target as HTMLSelectElement).value as PlayerId; this.build(); } },
            s.players.filter((p) => p.id !== 'crown').map((p) => h('option', { value: p.id, selected: p.id === nation || undefined }, nationTitle(app.state, p.id)))))
      : null;
    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, 'Reports'),
        h('span', { class: 'muted' }, formatDate(s.turn, calendarOf(s)), ' · ', flag(app.state, nation), ' ', nationTitle(app.state, nation)),
        pick,
        h('button', { class: 'btn close', onclick: () => app.closeScreen(), 'aria-label': 'Close reports' }, 'Close')),
      h('nav', { class: 'report-tabs', role: 'tablist', 'aria-label': 'Advisors' },
        tabs.map((t, i) => h('button', {
          class: `tab${t.id === this.tab ? ' active' : ''}`,
          role: 'tab',
          'aria-selected': String(t.id === this.tab),
          title: i < 8 ? `${this.words(t, 'title')} (F${i + 1}, or ${i + 1} while the reports are open)` : `${this.words(t, 'title')} (${i + 1} while the reports are open)`,
          onclick: () => this.setTab(t.id),
        }, h('kbd', null, String(i + 1)), this.words(t, 'name')))),
      h('h3', { class: 'report-title' }, this.words(tab, 'title')),
      h('div', { class: 'report-body', role: 'tabpanel' }, tab.render(ctx)),
    );
    // Keep the scroll position when a sort or filter rebuilds the same tab.
    if (this.el.parentElement) this.el.parentElement.scrollTop = scrollTop;
  }
}
