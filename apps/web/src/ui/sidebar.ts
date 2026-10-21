import {
  canFoundColony,
  canImprove,
  colonyAt,
  formatDate,
  GOOD_DEFS,
  GOODS,
  isShip,
  maxMoves,
  NATIONS,
  recruitPrice,
  serialize,
  tileAt,
  tileName,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAwaitingOrders,
  UNIT_TYPES,
  type Unit,
} from '@cc/engine';
import type { App } from '../app.js';
import { clear, h } from '../dom.js';
import { downloadSave, saveManual } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';

function movesText(u: Unit): string {
  const m = u.moves / 3;
  const whole = Math.floor(m);
  const thirds = u.moves % 3;
  const frac = thirds === 1 ? '⅓' : thirds === 2 ? '⅔' : '';
  return `${whole || !frac ? whole : ''}${frac}/${maxMoves(u) / 3}`;
}

export class Sidebar {
  el: HTMLElement;
  private body: HTMLElement;
  private minimap: HTMLCanvasElement;
  private reportsOpen = false;
  private menuOpen = false;

  constructor(private app: App) {
    this.minimap = h('canvas', { class: 'minimap', 'aria-label': 'Minimap; click to move the view' });
    this.minimap.addEventListener('click', (e) => {
      const r = this.minimap.getBoundingClientRect();
      const s = this.app.state;
      this.app.centerOn(((e.clientX - r.left) / r.width) * s.map.width - 0.5, ((e.clientY - r.top) / r.height) * s.map.height - 0.5);
    });
    this.body = h('div', { class: 'sidebar-body' });
    const toggle = h('button', { class: 'btn sidebar-toggle', 'aria-label': 'Show or hide the side panel', onclick: () => this.el.classList.toggle('collapsed') }, '☰');
    this.el = h('aside', { class: 'sidebar' }, toggle, this.body, this.minimap);
  }

  showReports(): void {
    this.reportsOpen = true;
  }

  refresh(): void {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    clear(this.body);
    const myTurn = app.isMyTurn();
    const awaiting = unitsAwaitingOrders(s, app.viewer).length;

    this.body.append(
      h('div', { class: 'title-row' },
        h('h1', null, 'Casual Colonization'),
        h('span', { class: 'flag', style: `background:${NATIONS[app.viewer].color}`, title: NATIONS[app.viewer].name })),
      h('div', { class: 'stats' },
        h('div', null, h('strong', null, formatDate(s.turn)), ' · ', NATIONS[app.viewer].name),
        h('div', null, `Gold ${me.gold.toLocaleString()} · Tax ${me.tax}%`),
        h('div', { class: 'muted' }, `Crosses ${me.crosses}/${me.crossesRequired} · Recruit ${recruitPrice(me)}`),
      ),
    );

    this.body.append(this.unitCard(app.selectedUnit()));

    this.body.append(
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => app.openEurope(), title: 'Europe (E)' }, 'Europe'),
        h('button', { class: 'btn', onclick: () => app.selectNext(), title: 'Next unit (W)', disabled: !awaiting }, `Next unit${awaiting ? ` (${awaiting})` : ''}`),
      ),
      h('button', { class: `btn primary end-turn${myTurn && !awaiting ? ' pulse' : ''}`, onclick: () => void app.endTurn(), disabled: !myTurn, title: 'End turn (Enter)' }, 'End turn'),
    );

    this.body.append(this.reports(), this.menu());
    this.drawMinimap();
  }

  private unitCard(u: Unit | undefined): HTMLElement {
    const app = this.app;
    const s = app.state;
    if (!u) {
      return h('div', { class: 'card unit-card empty' }, h('p', { class: 'muted' }, 'No unit selected. Click one of your units, or a colony to manage it.'));
    }
    const pos = unitPosition(s, u);
    const tile = pos && tileAt(s, pos.x, pos.y);
    const def = UNIT_TYPES[u.type];
    const aboard = unitsAboard(s, u);
    const cargo = GOODS.filter((g) => (u.cargo?.[g] ?? 0) > 0);
    const orders = u.work ? `Working (${u.work.kind}, ${u.work.turnsLeft} turns)` : u.dest ? ('europe' in u.dest ? 'Sailing for Europe' : `Going to ${u.dest.x},${u.dest.y}`) : u.state === 'fortified' ? 'Fortified' : u.state === 'sentry' ? 'Sentry' : 'Awaiting orders';
    const mine = u.owner === app.viewer;
    const can = (fn: () => string | null) => mine && app.isMyTurn() && fn() === null;
    const terrain = tile?.f ? 'clear' : 'plow';
    const actions: HTMLElement[] = [];
    const btn = (label: string, key: string, onclick: () => void, enabled = true) =>
      actions.push(h('button', { class: 'btn small', onclick, disabled: !enabled, title: key ? `Shortcut: ${key}` : undefined }, label, key ? h('kbd', null, key) : null));
    if (mine && u.loc.kind === 'map') {
      if (def.kind === 'colonist') btn('Found colony', 'B', () => void app.foundColony(), can(() => canFoundColony(s, u)));
      if (u.role === 'pioneer') {
        btn(terrain === 'clear' ? 'Clear forest' : 'Plow', 'P', () => app.improve(), can(() => canImprove(s, u, terrain)));
        btn('Build road', 'R', () => app.buildRoad(), can(() => canImprove(s, u, 'road')));
      }
      btn('Go to…', 'G', () => {
        app.gotoMode = true;
        toast('Click where the unit should go.');
      });
      if (isShip(u)) btn('Sail to Europe', '', () => app.unitCommand('gotoEurope'));
      btn('Fortify', 'F', () => app.unitCommand('fortify'), !isShip(u));
      btn('Sentry', 'S', () => app.unitCommand('sentry'));
      btn('Skip', 'Space', () => app.unitCommand('skip'));
      if (u.state !== 'active' || u.dest || u.work) btn('Clear orders', '', () => app.unitCommand('clearOrders'));
      const colony = pos && colonyAt(s, pos.x, pos.y);
      if (colony && colony.owner === app.viewer) btn('Open colony', '', () => app.openColony(colony.id));
      btn('Disband', '', () => app.unitCommand('disband'));
    }
    if (mine && u.loc.kind === 'carrier') {
      btn('Wake up', '', () => app.unitCommand('activate'));
    }
    return h(
      'div',
      { class: 'card unit-card' },
      h('div', { class: 'unit-head' },
        icon({ kind: 'unit', type: u.type, role: u.role, nation: u.owner }, 56, unitName(u)),
        h('div', null,
          h('div', { class: 'unit-name' }, unitName(u)),
          h('div', { class: 'muted' }, `Moves ${movesText(u)}${u.role === 'pioneer' ? ` · Tools ${u.tools}` : ''}`),
          h('div', { class: 'muted' }, orders),
          tile ? h('div', { class: 'muted' }, `${tileName(tile)}${tile.p ? ', plowed' : ''}${tile.r ? ', road' : ''}`) : null)),
      aboard.length || cargo.length
        ? h('div', { class: 'cargo' },
            aboard.map((p) => h('button', { class: 'chip', title: `Select ${unitName(p)}`, onclick: () => app.select(p.id) }, icon({ kind: 'unit', type: p.type, role: p.role, nation: p.owner }, 28), unitName(p))),
            cargo.map((g) => h('span', { class: 'chip' }, icon({ kind: 'product', product: g }, 22), `${u.cargo![g]} ${GOOD_DEFS[g].name}`)))
        : null,
      actions.length ? h('div', { class: 'actions' }, actions) : null,
    );
  }

  private reports(): HTMLElement {
    const app = this.app;
    const s = app.state;
    const mine = s.messages.filter((m) => (!m.to || m.to === app.viewer) && m.turn >= s.turn - 1).slice(-12).reverse();
    const details = h('details', { class: 'card reports', open: this.reportsOpen || undefined },
      h('summary', null, `Reports (${mine.length})`),
      h('ul', null, mine.map((m) => h('li', null,
        m.at ? h('button', { class: 'link', onclick: () => app.centerOn(m.at!.x, m.at!.y) }, m.text) : m.text))));
    details.addEventListener('toggle', () => (this.reportsOpen = details.open));
    return details;
  }

  private menu(): HTMLElement {
    const app = this.app;
    const select = h('select', { 'aria-label': 'Graphics style', onchange: (e: Event) => setStyle((e.target as HTMLSelectElement).value) },
      availableStyles().map((st) => h('option', { value: st.id, selected: st.id === activeStyle().id || undefined }, st.name)));
    const details = h('details', { class: 'card menu', open: this.menuOpen || undefined },
      h('summary', null, 'Game'),
      h('label', { class: 'field' }, h('span', null, 'Graphics style'), select),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', onclick: () => toast(saveManual(serialize(app.state)) ? 'Game saved in this browser.' : 'Could not save here.') }, 'Save'),
        h('button', { class: 'btn small', onclick: () => downloadSave(serialize(app.state), `casual-colonization-${app.state.turn}.json`) }, 'Export save'),
        h('button', { class: 'btn small', onclick: () => app.exitToMenu() }, 'Main menu')),
      h('p', { class: 'muted small' }, 'Arrows / numpad move · B found colony · P plow · R road · F fortify · G go to · E Europe · Enter end turn · Right-click or Shift-click to send a unit.'));
    details.addEventListener('toggle', () => (this.menuOpen = details.open));
    return details;
  }

  drawMinimap(): void {
    const s = this.app.state;
    const style = activeStyle();
    const scale = 3;
    const c = this.minimap;
    if (c.width !== s.map.width * scale) {
      c.width = s.map.width * scale;
      c.height = s.map.height * scale;
    }
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = style.theme['--paper'];
    ctx.fillRect(0, 0, c.width, c.height);
    const me = this.app.me;
    for (let y = 0; y < s.map.height; y++) {
      for (let x = 0; x < s.map.width; x++) {
        const i = y * s.map.width + x;
        if (!me.explored[i]) continue;
        ctx.fillStyle = style.tileColor(s.map.tiles[i]);
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    for (const col of Object.values(s.colonies)) {
      if (!me.explored[col.y * s.map.width + col.x]) continue;
      ctx.fillStyle = NATIONS[col.owner].color;
      ctx.fillRect(col.x * scale - 1, col.y * scale - 1, scale + 2, scale + 2);
    }
    const r = this.app.mapWrap.getBoundingClientRect();
    const cam = this.app.camera;
    const w = (r.width / cam.zoom) * scale;
    const hgt = (r.height / cam.zoom) * scale;
    ctx.strokeStyle = style.theme['--ink'];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cam.x * scale - w / 2, cam.y * scale - hgt / 2, w, hgt);
  }
}
