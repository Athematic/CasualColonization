import {
  BUILDING_ORDER,
  BUILDINGS,
  buildOptions,
  buildTargetCost,
  buildingName,
  centreProduction,
  colonyReport,
  colonyWorkers,
  foodToGrow,
  GOOD_DEFS,
  GOODS,
  hurryPrice,
  isCarrier,
  isWater,
  landPrice,
  nativeLandOwner,
  SCHOOL_TEACHERS,
  TEACH_TURNS,
  TRIBES,
  PRODUCT_NAMES,
  ROLES,
  tileAt,
  tileName,
  tileYield,
  unitName,
  unitsAboard,
  unitsAt,
  UNIT_TYPES,
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
import { choose, toast } from './dialogs.js';

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
    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, colony.name),
        h('span', { class: 'muted' }, `Population ${pop} · Sons of Liberty ${report.sonsOfLiberty}% · Food ${colony.goods.food}/${foodToGrow(colony)}`),
        h('button', { class: 'btn close', onclick: () => this.app.closeScreen(), 'aria-label': 'Close colony' }, 'Close')),
      h('p', { class: 'hint' }, this.selected
        ? `Selected: ${unitName(s.units[this.selected])}. Click a field or building to put them to work, or use the buttons below.`
        : 'Click a colonist to select them, then click a field or building to change their work.'),
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
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
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
          cells.push(h('div', { class: 'cell centre', style, title: `${tileName(tile)} (colony square)` },
            h('div', { class: 'yields' }, (Object.entries(out) as [GoodId, number][]).map(([g, n]) => h('span', { class: 'yield' }, icon({ kind: 'product', product: g }, 18), n)))));
          continue;
        }
        const worker = colonyWorkers(s, colony).find((w) => w.loc.kind === 'colony' && w.loc.job.kind === 'tile' && w.loc.job.x === x && w.loc.job.y === y);
        const other = !worker && Object.values(s.units).some((u) => u.loc.kind === 'colony' && u.loc.job.kind === 'tile' && u.loc.job.x === x && u.loc.job.y === y);
        const settlement = Object.values(s.settlements).some((st) => st.x === x && st.y === y);
        const native = nativeLandOwner(s, x, y);
        const job = worker?.loc.kind === 'colony' ? (worker.loc.job as Extract<Job, { kind: 'tile' }>) : undefined;
        cells.push(h('button', {
          class: `cell${worker && worker.id === this.selected ? ' selected' : ''}${other || settlement ? ' taken' : ''}${native ? ' native' : ''}`,
          style,
          title: `${tileName(tile)}${other ? ' (worked by another colony)' : settlement ? ' (native settlement)' : native ? ` (land of the ${TRIBES[native.tribe].name})` : ''}`,
          onclick: () => this.clickTile(colony, x, y, worker),
        },
        worker ? icon({ kind: 'unit', type: worker.type, role: 'none', nation: worker.owner }, 40, unitName(worker)) : null,
        job ? h('span', { class: 'yield' }, icon({ kind: 'product', product: job.good }, 18), workers[worker!.id] ?? 0) : null));
      }
    }
    return h('div', { class: 'card land' }, h('h3', null, 'Fields'), h('div', { class: 'land-wrap', style: `width:${TILE * 3}px;height:${TILE * 3}px` }, this.landCanvas, cells));
  }

  private bestGood(colony: Colony, u: Unit, x: number, y: number): GoodId | undefined {
    const s = this.app.state;
    const report = colonyReport(s, colony);
    const hungry = report.net.food < 2;
    let best: { g: GoodId; v: number } | undefined;
    for (const g of GOODS) {
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
      const goods = GOODS.filter((g) => tileYield(s, colony, x, y, g, worker.type) > 0);
      const next = goods[(goods.indexOf(worker.loc.job.good) + 1) % goods.length];
      if (next) this.dispatch({ type: 'assignJob', unitId: worker.id, colonyId: colony.id, job: { kind: 'tile', x, y, good: next } });
      return;
    }
    if (sel && UNIT_TYPES[sel.type].kind === 'colonist') {
      const native = nativeLandOwner(s, x, y);
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

  /** Native land must be bought or taken before a colonist can work it. */
  private async settleLand(colony: Colony, u: Unit, x: number, y: number): Promise<void> {
    const s = this.app.state;
    const owner = nativeLandOwner(s, x, y)!;
    const tribe = TRIBES[owner.tribe].name;
    const price = landPrice(s, this.app.viewer, x, y);
    const choice = await choose(`Land of the ${tribe}`, `The ${tribe} claim this land.${price ? ` They will sell it for ${price} gold.` : ' Thanks to Peter Minuit, they ask nothing for it.'} Taking it by force will anger them.`, [
      { label: price ? `Buy for ${price} gold` : 'Accept the land', value: 'buy' as const, primary: true, disabled: price > this.app.me.gold },
      { label: 'Take it', value: 'take' as const },
      { label: 'Leave it', value: null },
    ]);
    if (!choice) return;
    const ok = this.app.dispatch({ type: choice === 'buy' ? 'buyLand' : 'takeLand', x, y });
    if (!ok) return;
    const good = this.bestGood(colony, u, x, y);
    if (good) this.dispatch({ type: 'assignJob', unitId: u.id, colonyId: colony.id, job: { kind: 'tile', x, y, good } });
  }

  // ---- Buildings ----

  private buildingsPanel(colony: Colony, report: ReturnType<typeof colonyReport>): HTMLElement {
    const s = this.app.state;
    const cards: HTMLElement[] = [];
    const passive: string[] = [];
    for (const kind of BUILDING_ORDER) {
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
          ? h('span', { class: `slot${w.id === this.selected ? ' selected' : ''}`, onclick: (e: Event) => { e.stopPropagation(); this.toggleSelect(w.id); } }, icon({ kind: 'unit', type: w.type, role: 'none', nation: w.owner }, 36, unitName(w)))
          : h('span', { class: 'slot empty' }));
      }
      const production = out && def.output
        ? h('span', { class: 'yield' }, icon({ kind: 'product', product: def.output }, 18), `${out.output}${out.capacity > out.output ? ` of ${out.capacity}` : ''} ${PRODUCT_NAMES[def.output as ProductId].toLowerCase()}`, def.input && out.output ? h('span', { class: 'muted' }, ` (uses ${out.output} ${GOOD_DEFS[def.input].name.toLowerCase()})`) : null)
        : null;
      const teaching = kind === 'schoolhouse'
        ? h('span', { class: 'muted small' }, here.length
          ? here.map((t) => `${UNIT_TYPES[t.type].name}: ${t.teach ?? 0}/${TEACH_TURNS[(UNIT_TYPES[t.type].teach ?? 1) - 1]} turns`).join(' · ')
          : `Experts teach colonists here (${level === 1 ? 'farming and crafts' : level === 2 ? 'up to trades and soldiering' : 'every skill'}).`)
        : null;
      cards.push(h('button', { class: 'card building', onclick: () => this.clickBuilding(colony, kind) },
        h('div', { class: 'building-name' }, name),
        h('div', { class: 'slots' }, slots),
        production,
        teaching));
    }
    return h('div', { class: 'card buildings' },
      h('h3', null, 'Buildings'),
      h('div', { class: 'building-grid' }, cards),
      passive.length ? h('p', { class: 'muted small' }, `Also: ${passive.join(', ')}. Storage ${warehouseCapacity(colony)} per good.`) : h('p', { class: 'muted small' }, `Storage ${warehouseCapacity(colony)} per good.`));
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
    const summary = h('div', { class: 'summary' },
      (['food', 'hammers', 'bells', 'crosses'] as ProductId[]).map((p) =>
        h('span', { class: 'yield', title: PRODUCT_NAMES[p] }, icon({ kind: 'product', product: p }, 20), p === 'food' ? signed(net.food) : report.produced[p])));

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
        price > 0 ? h('button', { class: 'btn small', disabled: price > this.app.me.gold, onclick: () => this.dispatch({ type: 'hurry', colonyId: colony.id }) }, `Buy now for ${price}`) : null);
    }

    const outside = unitsAt(s, colony.x, colony.y).filter((u) => u.owner === colony.owner && !isCarrier(u));
    const carriers = this.carriers(colony);
    const sel = this.selected ? s.units[this.selected] : undefined;
    const working = sel?.loc.kind === 'colony';
    const selActions: HTMLElement[] = [];
    if (sel) {
      if (working) selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'leaveColony', unitId: sel.id }) }, 'Leave colony'));
      if (sel.loc.kind === 'map' && UNIT_TYPES[sel.type].kind === 'colonist') {
        selActions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'assignJob', unitId: sel.id, colonyId: colony.id }) }, 'Join colony'));
        for (const role of ['soldier', 'dragoon', 'pioneer', 'scout', 'missionary', 'none'] as RoleId[]) {
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
      icon({ kind: 'unit', type: u.type, role: u.role, nation: u.owner }, 32), unitName(u));

    return h('div', { class: 'card side' },
      h('h3', null, 'Production'),
      summary,
      h('label', { class: 'field' }, h('span', null, 'Building'), select),
      progress,
      h('h3', null, 'On the colony square'),
      outside.length ? h('div', { class: 'chips' }, outside.map(chip)) : h('p', { class: 'muted small' }, 'Nobody is waiting outside.'),
      carriers.length ? h('h3', null, 'In port') : null,
      carriers.map((c) => h('div', { class: `carrier${c.id === this.carrier ? ' selected' : ''}` },
        h('button', { class: 'chip', onclick: () => { this.carrier = this.carrier === c.id ? undefined : c.id; this.app.requestRender(); } },
          icon({ kind: 'unit', type: c.type, role: 'none', nation: c.owner }, 36), `${unitName(c)}${c.repair ? ` (repairing, ${c.repair} turns)` : c.id === this.carrier ? ' (loading)' : ''}`),
        h('div', { class: 'chips' },
          unitsAboard(s, c).map(chip),
          GOODS.filter((g) => (c.cargo?.[g] ?? 0) > 0).map((g) => h('button', { class: 'chip', title: 'Unload', onclick: () => this.dispatch({ type: 'unloadGoods', carrierId: c.id, good: g, amount: c.cargo![g]! }) },
            icon({ kind: 'product', product: g }, 22), `${c.cargo![g]} ⤓`))))),
      selActions.length ? h('div', { class: 'actions' }, selActions) : null);
  }

  private warehouse(colony: Colony, net: Record<ProductId, number>): HTMLElement {
    const cap = warehouseCapacity(colony);
    const customs = colony.buildings.customHouse > 0;
    return h('div', { class: 'card warehouse' },
      h('h3', null, this.carrier ? 'Warehouse — click a good to load 100 onto the ship' : 'Warehouse'),
      customs ? h('p', { class: 'muted small' }, 'Custom house: ticked goods above 50 are sold in Europe at the end of each turn.') : null,
      h('div', { class: 'goods' }, GOODS.map((g) => {
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

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

