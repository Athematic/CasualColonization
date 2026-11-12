import {
  abandonProblem,
  buildingName,
  BUILDINGS,
  buildingsOf,
  buildOptions,
  buildTargetCost,
  centreProduction,
  colonyReport,
  colonyWorkers,
  foodToGrow,
  GOOD_DEFS,
  gridOf,
  goodsOf,
  hurryPrice,
  isCarrier,
  isWater,
  landPrice,
  nationOf,
  nativeLandOwner,
  nativeLandClosedTo,
  leasableTiles,
  leaseRent,
  peopleTreatyOn,
  peopleTreatyProblem,
  PRODUCT_NAMES,
  ROLES,
  SCHOOL_TEACHERS,
  TEACH_TURNS,
  term,
  tileAt,
  tileDescription,
  tileYield,
  peopleName,
  UNIT_TYPES,
  unitName,
  unitsAboard,
  unitsAt,
  warehouseCapacity,
  type BuildTarget,
  type BuildingKind,
  type Colony,
  type GoodId,
  type Job,
  type ProductId,
  type RoleId,
  type Unit,
} from '@cc/engine';
import type { MapRenderer } from '@cc/render-api';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { activeStyle, icon } from '../styles.js';
import { choose, confirmDialog, toast } from './dialogs.js';
import { isPeopleTown, townCard, townLand, tradeCard } from './town.js';
import { councilText, storeCapacity } from '@cc/engine';

const TILE = 76;

function targetKey(t: BuildTarget | null): string {
  return t ? `${t.kind}:${t.id}` : '';
}

export class ColonyScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private selected?: string;
  private carrier?: string;
  private landCanvas: HTMLCanvasElement;
  private landRenderer: MapRenderer;
  private styleId: string;

  constructor(
    private app: App,
    private colonyId: string,
  ) {
    this.body = h('div', { class: 'screen-body' });
    this.el = h('section', { class: 'screen colony-screen', role: 'dialog', 'aria-label': 'Colony' }, this.body);
    this.landCanvas = h('canvas', { class: 'colony-land' });
    this.styleId = activeStyle().id;
    this.landRenderer = activeStyle().createMapRenderer(this.landCanvas);
  }

  close(): void {
    this.landRenderer.dispose();
  }

  private get colony(): Colony | undefined {
    return this.app.state.colonies[this.colonyId];
  }

  private dispatch(cmd: Parameters<App['dispatch']>[0]): boolean {
    return this.app.dispatch(cmd, true);
  }

  private async abandon(colony: Colony): Promise<void> {
    const town = isPeopleTown(colony);
    const ok = await confirmDialog(town ? 'Leave the town?' : 'Abandon colony?', `Abandon ${colony.name}? Its ${town ? 'people' : 'colonists'} step out onto the land, but its goods and buildings are lost.`, 'Abandon', 'Keep');
    if (ok) this.dispatch({ type: 'abandonColony', colonyId: colony.id });
  }

  refresh(): void {
    const colony = this.colony;
    if (!colony || (colony.owner !== this.app.viewer && !this.app.observer)) {
      this.app.closeScreen();
      return;
    }
    if (activeStyle().id !== this.styleId) {
      this.landRenderer.dispose();
      this.styleId = activeStyle().id;
      this.landRenderer = activeStyle().createMapRenderer(this.landCanvas);
    }
    const s = this.app.state;
    if (this.selected && !s.units[this.selected]) this.selected = undefined;
    if (this.carrier && !this.carriers(colony).some((c) => c.id === this.carrier)) this.carrier = undefined;
    const report = colonyReport(s, colony);
    clear(this.body);
    const pop = report.population;
    // A playing people's town (native-nations.md T2): its people, food and counsel, no Sons of Liberty.
    const town = isPeopleTown(colony);
    const land = town ? townLand(s, colony.x, colony.y) : undefined;
    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, colony.name),
        h('span', { class: 'muted' }, town
          ? `People ${pop} · Food ${colony.goods.food} · ${councilText(s, colony.owner, 'product').replace(/^./, (c) => c.toUpperCase())} ${report.produced.bells} a turn${land?.words ? ` · Land ${land.words}` : ''}`
          : `Population ${pop} · Sons of Liberty ${report.sonsOfLiberty}% · Food ${colony.goods.food}/${foodToGrow(s, colony)}`),
        colony.owner === this.app.viewer && !this.app.observer
          ? h('button', { class: 'btn small', disabled: !this.app.isMyTurn() || abandonProblem(s, colony.id) !== null, title: abandonProblem(s, colony.id) ?? (town ? 'Leave this small town' : 'Give up this small colony'), onclick: () => void this.abandon(colony) }, 'Abandon')
          : null,
        h('button', { class: 'btn close', onclick: () => this.app.closeScreen(), 'aria-label': 'Close colony' }, 'Close')),
      h('p', { class: 'hint' }, this.selected
        ? `Selected: ${unitName(s.units[this.selected])}. Click a field or building to put them to work, or use the buttons below.`
        : town ? 'Click a person to select them, then click a field or building to change their work.' : 'Click a colonist to select them, then click a field or building to change their work.'),
      h('div', { class: 'colony-grid' },
        this.landPanel(colony, report.workers),
        this.buildingsPanel(colony, report),
        this.sidePanel(colony, report)),
      this.warehouse(colony, report.net),
    );
  }

  // ---- Fields ----

  private landPanel(colony: Colony, workers: Record<string, number>): HTMLElement {
    const s = this.app.state;
    const scene = {
      state: { ...s, units: Object.fromEntries(Object.entries(s.units).filter(([, u]) => u.loc.kind === 'colony')) },
      viewer: this.app.viewer,
      camera: { x: colony.x + 0.5, y: colony.y + 0.5, zoom: TILE },
      width: TILE * 3,
      height: TILE * 3,
      pixelRatio: Math.min(2.5, window.devicePixelRatio || 1),
      visible: new Uint8Array(s.map.width * s.map.height).fill(1),
      labels: false,
    };
    this.landCanvas.style.width = `${TILE * 3}px`;
    this.landCanvas.style.height = `${TILE * 3}px`;
    this.landRenderer.render(scene);

    const cells: HTMLElement[] = [];
    // The colony's tile and its work area, row by row, laid out as the 3 × 3 square they are on squares.
    const grid = gridOf(s);
    const area = grid.withinOffsets(colony.x, colony.y, grid.workRadius);
    for (let k = 0; k < area.length; k += 2) {
      const dx = area[k];
      const dy = area[k + 1];
      const x = colony.x + dx;
      const y = colony.y + dy;
      const tile = tileAt(s, x, y);
      const style = `left:${(dx + 1) * TILE}px;top:${(dy + 1) * TILE}px;width:${TILE}px;height:${TILE}px`;
      if (!tile) {
        cells.push(h('div', { class: 'cell off', style }));
        continue;
      }
      if (dx === 0 && dy === 0) {
        const out = centreProduction(s, colony);
        cells.push(h('div', { class: 'cell centre', style, title: `${tileDescription(tile)} (colony square)` },
          h('div', { class: 'yields' }, (Object.entries(out) as [GoodId, number][]).map(([g, n]) => h('span', { class: 'yield' }, icon({ kind: 'product', product: g }, 18), n)))));
        continue;
      }
      const worker = colonyWorkers(s, colony).find((w) => w.loc.kind === 'colony' && w.loc.job.kind === 'tile' && w.loc.job.x === x && w.loc.job.y === y);
      const other = !worker && Object.values(s.units).some((u) => u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && u.loc.job.x === x && u.loc.job.y === y);
      const settlement = Object.values(s.settlements).some((st) => st.x === x && st.y === y);
      const native = nativeLandOwner(s, x, y);
      // Land leased to the colony's nation (land use, N5) is worked like its own, and stays the people's.
      const leased = !!native && tile.use === colony.owner;
      const job = worker?.loc.kind === 'colony' ? (worker.loc.job as Extract<Job, { kind: 'tile' }>) : undefined;
      cells.push(h('button', {
        class: `cell${worker && worker.id === this.selected ? ' selected' : ''}${other || settlement ? ' taken' : ''}${leased ? ' leased' : native ? ' native' : ''}`,
        style,
        'data-leased': leased ? 'true' : undefined,
        title: `${tileDescription(tile)}${other ? ' (worked by another colony)' : settlement ? ' (native settlement)' : leased ? ` (land of the ${peopleName(s, native!.tribe)}, leased to you)` : native ? ` (land of the ${peopleName(s, native.tribe)})` : ''}`,
        onclick: () => this.clickTile(colony, x, y, worker),
      },
      worker ? icon({ kind: 'unit', type: worker.type, role: 'none', color: nationOf(this.app.state, worker.owner).color }, 40, unitName(worker)) : null,
      job ? h('span', { class: 'yield' }, icon({ kind: 'product', product: job.good }, 18), workers[worker!.id] ?? 0) : null));
    }
    return h('div', { class: 'card land' }, h('h3', null, 'Fields'), h('div', { class: 'land-wrap', style: `width:${TILE * 3}px;height:${TILE * 3}px` }, this.landCanvas, cells));
  }

  private bestGood(colony: Colony, u: Unit, x: number, y: number): GoodId | undefined {
    const s = this.app.state;
    const report = colonyReport(s, colony);
    const hungry = report.net.food < 2;
    let best: { g: GoodId; v: number } | undefined;
    for (const g of goodsOf(s)) {
      const n = tileYield(s, colony, x, y, g, u.type);
      if (n <= 0) continue;
      const expert = UNIT_TYPES[u.type].expertFor === g;
      const v = n * (g === 'food' ? (hungry ? 8 : 3) : GOOD_DEFS[g].price) + (expert ? 100 : 0);
      if (!best || v > best.v) best = { g, v };
    }
    return best?.g;
  }

  private clickTile(colony: Colony, x: number, y: number, worker: Unit | undefined): void {
    const s = this.app.state;
    const sel = this.selected ? s.units[this.selected] : undefined;
    if (sel && worker && sel.id === worker.id && worker.loc.kind === 'colony' && worker.loc.job.kind === 'tile') {
      // Clicking a worker's own field cycles what it produces.
      const goods = goodsOf(s).filter((g) => tileYield(s, colony, x, y, g, worker.type) > 0);
      const next = goods[(goods.indexOf(worker.loc.job.good) + 1) % goods.length];
      if (next) this.dispatch({ type: 'assignJob', unitId: worker.id, colonyId: colony.id, job: { kind: 'tile', x, y, good: next } });
      return;
    }
    if (sel && UNIT_TYPES[sel.type].kind === 'colonist') {
      // Native land not leased to the colony's nation must be bought, taken or leased first.
      const native = nativeLandClosedTo(s, colony.owner, x, y);
      if (native) {
        void this.settleLand(colony, sel, x, y);
        return;
      }
      const good = this.bestGood(colony, sel, x, y);
      if (!good) return toast(isWater(tileAt(s, x, y)) && !colony.buildings.docks ? 'Fishing needs Docks.' : 'This colonist cannot work there.', 'error');
      if (this.dispatch({ type: 'assignJob', unitId: sel.id, colonyId: colony.id, job: { kind: 'tile', x, y, good } })) this.selected = sel.id;
      return;
    }
    this.selected = worker?.id;
    this.app.requestRender();
  }

  /**
   * Native land must be bought or taken before a colonist can work it, or, where the scenario has
   * land use (N5), leased from its people with the rest of their land beside your colonies.
   */
  private async settleLand(colony: Colony, u: Unit, x: number, y: number): Promise<void> {
    const s = this.app.state;
    const owner = nativeLandOwner(s, x, y)!;
    const tribe = peopleName(s, owner.tribe);
    const price = landPrice(s, this.app.viewer, x, y);
    const leasing = peopleTreatyOn(s, 'land-use');
    const whyLease = leasing ? peopleTreatyProblem(s, this.app.viewer, owner.tribe, 'land-use') : null;
    const rent = leasing && !whyLease ? leaseRent(s, this.app.viewer, leasableTiles(s, this.app.viewer, owner.tribe)) : 0;
    const choice = await choose(`Land of the ${tribe}`, `The ${tribe} claim this land.${price ? ` They will sell it for ${price} gold.` : ' Thanks to Peter Minuit, they ask nothing for it.'} Taking it by force will anger them.${leasing ? ' A lease lets your colonies work their land beside them for a yearly rent, and the land stays theirs.' : ''}`, [
      { label: price ? `Buy for ${price} gold` : 'Accept the land', value: 'buy' as const, primary: true, disabled: price > this.app.me.gold },
      ...(leasing ? [{ label: rent ? `Lease their land beside your colonies (${rent} gold a tile a year)` : 'Lease their land beside your colonies', value: 'lease' as const, disabled: !!whyLease || !this.app.isMyTurn(), hint: whyLease ?? undefined }] : []),
      { label: 'Take it', value: 'take' as const },
      { label: 'Leave it', value: null },
    ]);
    if (!choice) return;
    const ok = choice === 'lease'
      ? this.app.dispatch({ type: 'proposePeopleTreaty', people: owner.tribe, kind: 'land-use' })
      : this.app.dispatch({ type: choice === 'buy' ? 'buyLand' : 'takeLand', x, y });
    if (!ok || nativeLandClosedTo(this.app.state, colony.owner, x, y)) return;
    const good = this.bestGood(colony, u, x, y);
    if (good) this.dispatch({ type: 'assignJob', unitId: u.id, colonyId: colony.id, job: { kind: 'tile', x, y, good } });
  }

  // ---- Buildings ----

  private buildingsPanel(colony: Colony, report: ReturnType<typeof colonyReport>): HTMLElement {
    const s = this.app.state;
    const cards: HTMLElement[] = [];
    const passive: string[] = [];
    for (const kind of buildingsOf(s, colony.owner)) {
      const level = colony.buildings[kind];
      if (level === 0) continue;
      const def = BUILDINGS[kind];
      const name = buildingName(kind, level);
      if (def.workplaces === 0) {
        passive.push(name);
        continue;
      }
      const here = colonyWorkers(s, colony).filter((w) => w.loc.kind === 'colony' && w.loc.job.kind === 'building' && w.loc.job.building === kind);
      const out = report.buildings[kind];
      const slots: HTMLElement[] = [];
      const places = kind === 'schoolhouse' ? SCHOOL_TEACHERS[level - 1] : def.workplaces;
      for (let i = 0; i < places; i++) {
        const w = here[i];
        slots.push(w
          ? h('span', { class: `slot${w.id === this.selected ? ' selected' : ''}`, onclick: (e: Event) => { e.stopPropagation(); this.toggleSelect(w.id); } }, icon({ kind: 'unit', type: w.type, role: 'none', color: nationOf(this.app.state, w.owner).color }, 36, unitName(w)))
          : h('span', { class: 'slot empty' }));
      }
      const production = out && def.output
        ? h('span', { class: 'yield' }, icon({ kind: 'product', product: def.output }, 18), `${out.output}${out.capacity > out.output ? ` of ${out.capacity}` : ''} ${productWord(s, colony, def.output as ProductId)}`, def.input && out.output ? h('span', { class: 'muted' }, ` (uses ${out.output} ${GOOD_DEFS[def.input].name.toLowerCase()})`) : null)
        : null;
      const teaching = kind === 'schoolhouse'
        ? h('span', { class: 'muted small' }, here.length
          ? here.map((t) => `${UNIT_TYPES[t.type].name}: ${t.teach ?? 0}/${TEACH_TURNS[(UNIT_TYPES[t.type].teach ?? 1) - 1]} turns`).join(' · ')
          : `Experts teach colonists here (${level === 1 ? 'farming and crafts' : level === 2 ? 'up to trades and soldiering' : 'every skill'}).`)
        : null;
      cards.push(h('button', { class: 'card building', onclick: () => this.clickBuilding(colony, kind) },
        h('div', { class: 'building-name' }, icon({ kind: 'building', building: kind, level }, 28), name),
        h('div', { class: 'slots' }, slots),
        production,
        teaching));
    }
    return h('div', { class: 'card buildings' },
      h('h3', null, 'Buildings'),
      h('div', { class: 'building-grid' }, cards),
      h('p', { class: 'muted small' }, [passive.length ? `Also: ${passive.join(', ')}.` : '', isPeopleTown(colony) ? `Stores keep ${storeCapacity(s, colony)} food and ${warehouseCapacity(colony)} of each other good.` : `Storage ${warehouseCapacity(colony)} per good.`].filter(Boolean).join(' ')));
  }

  private clickBuilding(colony: Colony, kind: BuildingKind): void {
    const sel = this.selected ? this.app.state.units[this.selected] : undefined;
    if (!sel || UNIT_TYPES[sel.type].kind !== 'colonist') return toast('Select a colonist first.', 'error');
    this.dispatch({ type: 'assignJob', unitId: sel.id, colonyId: colony.id, job: { kind: 'building', building: kind } });
  }

  private toggleSelect(id: string): void {
    this.selected = this.selected === id ? undefined : id;
    this.app.requestRender();
  }

  // ---- Production, build queue, units outside ----

  private carriers(colony: Colony): Unit[] {
    return unitsAt(this.app.state, colony.x, colony.y).filter((u) => u.owner === colony.owner && isCarrier(u));
  }

  private sidePanel(colony: Colony, report: ReturnType<typeof colonyReport>): HTMLElement {
    const s = this.app.state;
    const net = report.net;
    const town = isPeopleTown(colony);
    // A people's town has no crosses; its bells are its council's product (counsel, T8).
    const products = (town ? ['food', 'hammers', 'bells'] : ['food', 'hammers', 'bells', 'crosses']) as ProductId[];
    const productName = (p: ProductId) => (town && p === 'bells' ? councilText(s, colony.owner, 'product').replace(/^./, (c) => c.toUpperCase()) : town && p === 'hammers' ? 'Building work' : PRODUCT_NAMES[p]);
    const summary = h('div', { class: 'summary' },
      products.map((p) =>
        h('span', { class: 'yield', title: productName(p) }, icon({ kind: 'product', product: p }, 20), p === 'food' ? signed(net.food) : report.produced[p], town && p !== 'food' ? h('span', { class: 'muted small' }, ` ${productName(p).toLowerCase()}`) : null)));

    const options = buildOptions(s, colony);
    // Keep the current project listed even if the colony no longer qualifies to start it.
    if (colony.build && !options.some((o) => targetKey(o) === targetKey(colony.build))) options.unshift(colony.build);
    const select = h('select', {
      'aria-label': 'Build',
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        const target = options.find((o) => targetKey(o) === v) ?? null;
        this.dispatch({ type: 'setBuild', colonyId: colony.id, target });
      },
    },
    h('option', { value: '' }, 'Nothing'),
    options.map((o) => {
      const cost = buildTargetCost(o, colony);
      return h('option', { value: targetKey(o), selected: targetKey(o) === targetKey(colony.build) || undefined }, `${cost.name} (${cost.hammers}h${cost.tools ? `, ${cost.tools} tools` : ''})`);
    }));
    let progress: HTMLElement | null = null;
    if (colony.build) {
      const cost = buildTargetCost(colony.build, colony);
      const pct = Math.min(100, Math.round((colony.hammers / Math.max(1, cost.hammers)) * 100));
      const price = hurryPrice(s, colony);
      progress = h('div', null,
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${pct}%` })),
        h('div', { class: 'muted small' }, `${colony.hammers}/${cost.hammers} hammers${cost.tools ? ` · ${colony.goods.tools}/${cost.tools} tools` : ''}`),
        price > 0 && !town ? h('button', { class: 'btn small', disabled: price > this.app.me.gold, onclick: () => this.dispatch({ type: 'hurry', colonyId: colony.id }) }, `Buy now for ${price}`) : null);
    }

    const outside = unitsAt(s, colony.x, colony.y).filter((u) => u.owner === colony.owner && !isCarrier(u));
    const carriers = this.carriers(colony);
    const sel = this.selected ? s.units[this.selected] : undefined;
    const working = sel?.loc.kind === 'colony';
    const selActions: HTMLElement[] = [];
    if (sel) {
      if (working) selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'leaveColony', unitId: sel.id }) }, town ? 'Leave the town' : 'Leave colony'));
      if (sel.loc.kind === 'map' && UNIT_TYPES[sel.type].kind === 'colonist') {
        selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'assignJob', unitId: sel.id, colonyId: colony.id }) }, town ? 'Join the town' : 'Join colony'));
        // A people's warriors take up muskets and horses by trade (T6); no pioneers or missionaries.
        for (const role of (town ? ['soldier', 'dragoon', 'scout', 'none'] : ['soldier', 'dragoon', 'pioneer', 'scout', 'missionary', 'none']) as RoleId[]) {
          if (role === sel.role) continue;
          if (role === 'missionary' && colony.buildings.church < 2) continue;
          selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'equip', unitId: sel.id, role }) }, role === 'none' ? 'Unequip' : `Make ${ROLES[role].name.toLowerCase()}`));
        }
      }
      if (sel.type === 'treasure') selActions.push(h('button', { class: 'btn small', onclick: () => this.app.dispatch({ type: 'cashTreasure', unitId: sel.id }) }, 'Ship treasure home'));
      if (sel.loc.kind === 'map' && this.carrier) selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'board', unitId: sel.id, carrierId: this.carrier! }) }, 'Board selected ship'));
      if (sel.loc.kind === 'carrier') selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'unboard', unitId: sel.id }) }, 'Go ashore'));
      if (sel.loc.kind === 'map' || sel.loc.kind === 'carrier') {
        selActions.push(h('button', { class: 'btn small', onclick: () => { this.app.closeScreen(); this.app.select(sel.id); } }, 'Select on map'));
      }
    }

    const chip = (u: Unit) => h('button', { class: `chip${u.id === this.selected ? ' selected' : ''}`, onclick: () => this.toggleSelect(u.id) },
      icon({ kind: 'unit', type: u.type, role: u.role, color: nationOf(this.app.state, u.owner).color }, 32), unitName(u));

    return h('div', { class: 'card side' },
      town ? townCard(this.app, colony) : null,
      h('h3', null, 'Production'),
      summary,
      h('label', { class: 'field' }, h('span', null, 'Building'), select),
      progress,
      h('h3', null, town ? 'In the town' : 'On the colony square'),
      outside.length ? h('div', { class: 'chips' }, outside.map(chip)) : h('p', { class: 'muted small' }, 'Nobody is waiting outside.'),
      carriers.length ? h('h3', null, 'In port') : null,
      carriers.map((c) => h('div', { class: `carrier${c.id === this.carrier ? ' selected' : ''}` },
        h('button', { class: 'chip', onclick: () => { this.carrier = this.carrier === c.id ? undefined : c.id; this.app.requestRender(); } },
          icon({ kind: 'unit', type: c.type, role: 'none', color: nationOf(this.app.state, c.owner).color }, 36), `${unitName(c)}${c.repair ? ` (repairing, ${c.repair} turns)` : c.id === this.carrier ? ' (loading)' : ''}`),
        h('div', { class: 'chips' },
          unitsAboard(s, c).map(chip),
          goodsOf(s).filter((g) => (c.cargo?.[g] ?? 0) > 0).map((g) => h('button', { class: 'chip', title: 'Unload', onclick: () => this.dispatch({ type: 'unloadGoods', carrierId: c.id, good: g, amount: c.cargo![g]! }) },
            icon({ kind: 'product', product: g }, 22), `${c.cargo![g]} ⤓`))))),
      selActions.length ? h('div', { class: 'actions' }, selActions) : null,
      tradeCard(this.app, colony));
  }

  private warehouse(colony: Colony, net: Record<ProductId, number>): HTMLElement {
    const cap = warehouseCapacity(colony);
    const customs = colony.buildings.customHouse > 0;
    return h('div', { class: 'card warehouse' },
      h('h3', null, this.carrier ? 'Warehouse — click a good to load 100 onto the ship' : 'Warehouse'),
      customs ? h('p', { class: 'muted small' }, `Custom house: ticked goods above 50 are sold in ${term(this.app.state, 'homeland')} at the end of each turn.`) : null,
      // A people's town lists food, furs and what it holds: no colonial cash crops it never makes (T10).
      h('div', { class: 'goods' }, goodsOf(this.app.state).filter((g) => !isPeopleTown(colony) || g === 'food' || g === 'furs' || colony.goods[g] > 0 || (net[g] ?? 0) !== 0).map((g) => {
        const amount = colony.goods[g];
        const over = g !== 'food' && amount > cap;
        const exportBox = customs && g !== 'food'
          ? h('label', { class: 'export', title: `Export ${GOOD_DEFS[g].name.toLowerCase()}` },
              h('input', { type: 'checkbox', checked: !!colony.exports[g], onchange: (e: Event) => this.dispatch({ type: 'setExport', colonyId: colony.id, good: g, on: (e.target as HTMLInputElement).checked }) }),
              'sell')
          : null;
        return h('div', { class: 'good-wrap' }, h('button', {
          class: `good${over ? ' over' : ''}`,
          title: GOOD_DEFS[g].name,
          disabled: !this.carrier || amount <= 0,
          onclick: () => this.carrier && this.dispatch({ type: 'loadGoods', carrierId: this.carrier, good: g, amount: Math.min(100, amount) }),
        }, icon({ kind: 'product', product: g }, 28), h('span', { class: 'amount' }, amount), net[g] ? h('span', { class: `delta ${net[g] > 0 ? 'up' : 'down'}` }, signed(net[g])) : null), exportBox);
      })));
  }
}

/** A product's name in a town's or colony's words: a people's bells are its council's counsel, its hammers building work (T8). */
function productWord(s: Parameters<typeof councilText>[0], colony: Colony, p: ProductId): string {
  if (isPeopleTown(colony) && p === 'bells') return councilText(s, colony.owner, 'product');
  if (isPeopleTown(colony) && p === 'hammers') return 'building work';
  return PRODUCT_NAMES[p].toLowerCase();
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

