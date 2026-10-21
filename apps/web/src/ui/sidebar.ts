import {
  canFoundColony,
  canImprove,
  canUseRoutes,
  routeStopName,
  colonyAt,
  AI_LEVEL_INFO,
  colonyWorkers,
  FATHERS,
  formatDate,
  rebelShare,
  score,
  nextFatherCost,
  GOOD_DEFS,
  GOODS,
  isShip,
  maxMoves,
  NATIONS,
  nationTitle,
  recruitPrice,
  serialize,
  tileAt,
  tileDescription,
  RIVER_DIRS,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAwaitingOrders,
  UNIT_TYPES,
  type GameState,
  type NationId,
  type Unit,
} from '@cc/engine';
import type { App } from '../app.js';
import { clear, h } from '../dom.js';
import { downloadSave, saveManual } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';

function movesText(u: Unit, s: GameState): string {
  const m = u.moves / 3;
  const whole = Math.floor(m);
  const thirds = u.moves % 3;
  const frac = thirds === 1 ? '⅓' : thirds === 2 ? '⅔' : '';
  return `${whole || !frac ? whole : ''}${frac}/${maxMoves(u, s) / 3}`;
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

  refresh(): void {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    clear(this.body);
    if (app.observer) {
      this.body.append(this.observerPanel(), this.unitCard(app.selectedUnit()), this.reports(), this.menu());
      this.drawMinimap();
      return;
    }
    const myTurn = app.isMyTurn();
    const awaiting = unitsAwaitingOrders(s, app.viewer).length;

    this.body.append(
      h('div', { class: 'title-row' },
        h('h1', null, 'Casual Colonization'),
        h('span', { class: 'flag', style: `background:${NATIONS[app.viewer].color}`, title: NATIONS[app.viewer].name })),
      h('div', { class: 'stats' },
        h('div', null, h('strong', null, formatDate(s.turn)), ' · ', nationTitle(app.viewer)),
        h('div', null, `Gold ${me.gold.toLocaleString()} · Tax ${me.tax}%`),
        h('div', { class: 'muted' }, `Crosses ${me.crosses}/${me.crossesRequired} · Recruit ${recruitPrice(me)}`),
        h('div', { class: 'muted' },
          h('button', { class: 'link', onclick: () => void app.chooseFather() },
            me.currentFather ? `Congress: ${FATHERS[me.currentFather].name} ${me.fatherBells}/${nextFatherCost(s, me)}` : `Congress: choose a Founding Father (${me.fatherBells} bells)`)),
        me.independence === 'declared' ? h('div', null, h('span', { class: 'pill bad' }, 'War of Independence')) : null,
        me.independence === 'won' ? h('div', null, h('span', { class: 'pill good' }, 'Independent')) : null,
        Object.values(me.stance).includes('war') && me.independence !== 'declared' ? h('div', null, h('span', { class: 'pill bad' }, 'At war')) : null,
      ),
    );

    this.body.append(this.unitCard(app.selectedUnit()));

    this.body.append(
      h('div', { class: 'row wrap nav-row' },
        h('button', { class: 'btn', onclick: () => app.openEurope(), title: 'Europe (E)' }, 'Europe'),
        h('button', { class: 'btn', onclick: () => app.openDiplomacy(), title: 'Foreign affairs (D)' }, 'Affairs'),
        h('button', { class: 'btn', onclick: () => app.openRoutes(), title: 'Trade routes (T)' }, 'Routes'),
        h('button', { class: 'btn', onclick: () => app.openProgress(), title: 'Progress graphs (H)' }, 'Progress'),
        h('button', { class: 'btn', onclick: () => app.selectNext(), title: 'Next unit (W)', disabled: !awaiting }, `Next unit${awaiting ? ` (${awaiting})` : ''}`),
      ),
      h('button', {
        class: `btn primary end-turn${myTurn && !awaiting ? ' pulse' : ''}`,
        // The panel is rebuilt on refresh; keep the pulse in phase with the clock so it does not restart.
        style: `animation-delay:-${Math.round(performance.now() % 1400)}ms`,
        onclick: () => void app.endTurn(),
        disabled: !myTurn,
        title: 'End turn (Enter)',
      }, 'End turn'),
    );

    this.body.append(this.reports(), this.menu());
    this.drawMinimap();
  }

  /** Controls and a live scoreboard for games played only by computers. */
  private observerPanel(): HTMLElement {
    const app = this.app;
    const s = app.state;
    const rows = s.players
      .filter((p) => p.id !== 'crown')
      .map((p) => {
        const colonies = Object.values(s.colonies).filter((c) => c.owner === p.id);
        return {
          p,
          colonies: colonies.length,
          pop: colonies.reduce((n, c) => n + colonyWorkers(s, c).length, 0),
          rebels: rebelShare(s, p.id),
          score: score(s, p),
        };
      })
      .sort((a, b) => b.score - a.score);
    const watch = h('select', { 'aria-label': 'Whose view to show', onchange: (e: Event) => app.setWatch((e.target as HTMLSelectElement).value as NationId | 'all') },
      h('option', { value: 'all', selected: app.watch === 'all' || undefined }, 'Everything'),
      rows.map((r) => h('option', { value: r.p.id, selected: app.watch === r.p.id || undefined }, `${nationTitle(r.p.id)}'s view`)));
    const head = s.config.headStart;
    const speeds = (head ? [[1000, 'Slow'], [500, 'Normal'], [250, 'Fast']] : [[1200, 'Slow'], [400, 'Normal'], [80, 'Fast'], [0, 'Fastest']]) as [number, string][];
    const speed = h('select', { 'aria-label': 'Autoplay speed', onchange: (e: Event) => { app.speed = Number((e.target as HTMLSelectElement).value); if (app.autoplay) app.setAutoplay(true); } },
      speeds.map(([ms, label]) => h('option', { value: ms, selected: app.speed === ms || undefined }, label)));
    const over = s.gameOver;
    const progress = head ? Math.min(100, Math.round((s.turn / head.turn) * 100)) : 0;
    return h('div', { class: 'card observer' },
      h('div', { class: 'title-row' }, h('h1', null, 'Casual Colonization'), h('span', { class: 'pill' }, head ? 'Head start' : 'Observer'), s.cheated ? h('span', { class: 'pill warn', title: 'Cheats have been used in this game' }, 'Cheated') : null),
      h('div', { class: 'stats' }, h('strong', null, formatDate(s.turn)), over ? ` · ${over.reason}` : ''),
      head ? h('div', null,
        h('p', { class: 'small' }, `The computer plays ${head.humans.map((n) => nationTitle(n)).join(' and ')} for you until ${formatDate(head.turn)}.`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': progress, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${progress}%` })),
        h('button', { class: 'btn small', onclick: () => app.takeOver() }, 'Take over now')) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: !!over, onclick: () => app.setAutoplay(!app.autoplay), title: 'Space' }, app.autoplay ? 'Pause' : 'Play'),
        h('button', { class: 'btn', disabled: !!over || app.autoplay, onclick: () => app.observeTurns(1), title: 'Enter' }, '+1 turn'),
        h('button', { class: 'btn', disabled: !!over || app.autoplay, onclick: () => app.observeTurns(10) }, '+10'),
        h('button', { class: 'btn', onclick: () => app.openProgress(), title: 'Progress graphs (H)' }, 'Graphs')),
      h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', null, 'Speed'), speed), h('label', { class: 'field' }, h('span', null, 'Show'), watch)),
      h('table', { class: 'table scoreboard' },
        h('tr', null, h('th', null, 'Nation'), h('th', null, 'Level'), h('th', { title: 'Colonies' }, 'Col'), h('th', { title: 'Colonists' }, 'Pop'), h('th', { title: 'Sons of Liberty' }, 'SoL'), h('th', null, 'Score')),
        rows.map((r) => h('tr', { class: app.watch === r.p.id ? 'watched' : undefined, onclick: () => app.setWatch(app.watch === r.p.id ? 'all' : r.p.id) },
          h('td', null, h('span', { class: 'flag', style: `background:${NATIONS[r.p.id].color}` }), ' ', nationTitle(r.p.id), r.p.independence === 'declared' ? ' ⚔' : r.p.independence === 'won' ? ' ★' : ''),
          h('td', null, AI_LEVEL_INFO[r.p.ai ?? 'naive'].name, r.p.aiMemory?.focus ? h('span', { class: 'muted small' }, ` (${r.p.aiMemory.focus})`) : null),
          h('td', null, String(r.colonies)),
          h('td', null, String(r.pop)),
          h('td', null, `${r.rebels}%`),
          h('td', null, h('strong', null, String(r.score)))))));
  }

  private unitCard(u: Unit | undefined): HTMLElement {
    const app = this.app;
    const s = app.state;
    if (!u) {
      return h('div', { class: 'card unit-card empty' }, h('p', { class: 'muted' }, this.app.observer
        ? 'Click a unit to inspect it, or a colony to look inside. Space plays or pauses; Enter plays one turn.'
        : 'No unit selected. Click one of your units, or a colony to manage it.'));
    }
    const pos = unitPosition(s, u);
    const tile = pos && tileAt(s, pos.x, pos.y);
    const def = UNIT_TYPES[u.type];
    const aboard = unitsAboard(s, u);
    const cargo = GOODS.filter((g) => (u.cargo?.[g] ?? 0) > 0);
    const route = u.route && s.routes?.[u.route.id];
    const orders = u.repair ? `Under repair (${u.repair} turns)` : route ? `Trade route: ${route.name}${route.stops.length ? `, next ${routeStopName(s, route.stops[u.route!.stop % route.stops.length])}` : ''}` : u.work ? `Working (${u.work.kind}, ${u.work.turnsLeft} turns)` : u.dest ? ('europe' in u.dest ? 'Sailing for Europe' : `Going to ${u.dest.x},${u.dest.y}`) : u.state === 'fortified' ? 'Fortified' : u.state === 'sentry' ? 'Sentry' : 'Awaiting orders';
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
      if (canUseRoutes(u)) btn(u.route ? 'Change route…' : 'Trade route…', 'T', () => app.openRoutes(u.id));
      if (isShip(u)) btn('Sail to Europe', '', () => app.unitCommand('gotoEurope'));
      if (u.type === 'treasure') btn('Ship treasure home', '', () => { if (app.dispatch({ type: 'cashTreasure', unitId: u.id })) app.afterUnitAction(); });
      btn('Fortify', 'F', () => app.unitCommand('fortify'), !isShip(u));
      btn('Sentry', 'S', () => app.unitCommand('sentry'));
      btn('Skip', 'Space', () => app.unitCommand('skip'));
      if (u.state !== 'active' || u.dest || u.work || u.route) btn('Clear orders', '', () => app.unitCommand('clearOrders'));
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
          h('div', { class: 'muted' }, `Moves ${movesText(u, s)}${u.role === 'pioneer' ? ` · Tools ${u.tools}` : ''}`),
          h('div', { class: 'muted' }, orders),
          tile ? h('div', { class: 'muted' }, tileDescription(tile)) : null)),
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
        h('button', { class: 'btn small', onclick: () => app.exitToMenu() }, 'Main menu'),
        h('button', { class: 'btn small', onclick: () => app.openCheats(), title: 'Cheats for testing (Ctrl+Shift+C)' }, 'Cheats…')),
      app.state.cheated ? h('p', null, h('span', { class: 'pill warn' }, 'Cheats used')) : null,
      h('p', { class: 'muted small' }, 'Arrows / numpad move · B found colony · P plow · R road · F fortify · G go to · E Europe · D foreign affairs · H progress graphs · T trade routes · Enter end turn · Right-click or Shift-click to send a unit.'));
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
    for (let y = 0; y < s.map.height; y++) {
      for (let x = 0; x < s.map.width; x++) {
        const i = y * s.map.width + x;
        if (!this.app.knows(i)) continue;
        ctx.fillStyle = style.tileColor(s.map.tiles[i]);
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    // Rivers as thin lines in the style's water colour.
    ctx.strokeStyle = style.tileColor({ t: 'ocean' });
    ctx.lineCap = 'round';
    for (let i = 0; i < s.map.tiles.length; i++) {
      const tile = s.map.tiles[i];
      if (!tile.rv || !tile.rd || !this.app.knows(i)) continue;
      const cx = (i % s.map.width) * scale + scale / 2;
      const cy = Math.floor(i / s.map.width) * scale + scale / 2;
      ctx.lineWidth = tile.rv === 2 ? 1.6 : 1;
      ctx.beginPath();
      RIVER_DIRS.forEach(([dx, dy], d) => {
        if (!(tile.rd! & (1 << d))) return;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (dx * scale) / 2, cy + (dy * scale) / 2);
      });
      ctx.stroke();
    }
    for (const col of Object.values(s.colonies)) {
      if (!this.app.knows(col.y * s.map.width + col.x)) continue;
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
