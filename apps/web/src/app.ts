import {
  canFoundColony,
  canImprove,
  colonyAt,
  describeMove,
  DIRECTIONS,
  distance,
  findPath,
  formatDate,
  FATHERS,
  Game,
  GOOD_DEFS,
  handOver,
  nationTitle,
  nextFatherCost,
  tensionLabel,
  isShip,
  isWater,
  NATIONS,
  player,
  settlementAt,
  settlementName,
  serialize,
  tileAt,
  unitPosition,
  unitsAboard,
  unitsAt,
  unitsAwaitingOrders,
  type Command,
  type Direction,
  type NationId,
  type SettlementAction,
  type Unit,
} from '@cc/engine';
import { computeVisibility, screenToTile, type Camera, type MapRenderer, type Point, type Scene } from '@cc/render-api';
import { h } from './dom.js';
import { saveAuto } from './save.js';
import { activeStyle, onStyleChange } from './styles.js';
import { ColonyScreen } from './ui/colony.js';
import { choose, confirmDialog, promptDialog, toast } from './ui/dialogs.js';
import { DiplomacyScreen } from './ui/diplomacy.js';
import { EuropeScreen } from './ui/europe.js';
import { Sidebar } from './ui/sidebar.js';

export interface Screen {
  el: HTMLElement;
  refresh(): void;
  close?(): void;
}

/** A watched head start shows each turn for at least this long. */
export const HEAD_START_MIN_MS = 250;

const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e',
  Home: 'nw', PageUp: 'ne', End: 'sw', PageDown: 'se',
  Numpad8: 'n', Numpad2: 's', Numpad4: 'w', Numpad6: 'e', Numpad7: 'nw', Numpad9: 'ne', Numpad1: 'sw', Numpad3: 'se',
};

export class App {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly mapWrap: HTMLElement;
  private renderer: MapRenderer;
  private sidebar: Sidebar;
  private screen: Screen | null = null;
  private screenHost: HTMLElement;
  private frame = 0;
  private panelsDirty = true;
  camera: Camera = { x: 0, y: 0, zoom: 56 };
  viewer: NationId;
  selected?: string;
  hover?: Point;
  gotoMode = false;
  /** No people play: the computers play each other and the user watches. */
  observer: boolean;
  /** In observer mode, whose view of the world is shown ('all' reveals everything). */
  watch: NationId | 'all' = 'all';
  autoplay = false;
  /** Milliseconds between turns while autoplaying. */
  speed = 400;
  private autoplayTimer = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean; pinch?: number; zoom?: number } | null = null;
  private disposers: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    public game: Game,
    private onExit: () => void,
  ) {
    this.observer = !game.state.players.some((p) => p.human);
    this.viewer = this.humanViewer();
    this.canvas = h('canvas', { class: 'map', 'aria-label': 'Map of the New World' });
    this.mapWrap = h('div', { class: 'map-wrap' }, this.canvas);
    this.sidebar = new Sidebar(this);
    this.screenHost = h('div', { class: 'screen-host' });
    this.root = h('div', { class: 'game' }, this.mapWrap, this.sidebar.el, this.screenHost);
    host.appendChild(this.root);
    this.renderer = activeStyle().createMapRenderer(this.canvas);

    this.disposers.push(
      game.subscribe(() => this.requestRender()),
      onStyleChange((style) => {
        this.renderer.dispose();
        this.renderer = style.createMapRenderer(this.canvas);
        this.requestRender();
      }),
    );
    this.bindInput();
    const ro = new ResizeObserver(() => this.requestRender());
    ro.observe(this.mapWrap);
    this.disposers.push(() => ro.disconnect());

    const head = this.state.config.headStart;
    if (head) {
      // A watched head start: follow the nation the player will take over.
      this.speed = Math.max(this.speed, HEAD_START_MIN_MS);
      this.setWatch(head.humans[0]);
      this.centerOnStart();
      this.setAutoplay(true);
    } else if (this.observer) {
      this.camera.zoom = 26;
      this.centerOn(this.state.map.width / 2, this.state.map.height / 2);
    } else {
      this.selectNext();
      if (!this.selected) this.centerOnStart();
    }
    this.requestRender();
  }

  destroy(): void {
    clearTimeout(this.autoplayTimer);
    for (const d of this.disposers) d();
    this.renderer.dispose();
    this.root.remove();
  }

  get state() {
    return this.game.state;
  }

  get me() {
    return player(this.state, this.viewer);
  }

  private humanViewer(): NationId {
    const cur = this.game.current;
    if (cur.human) return cur.id;
    return this.state.players.find((p) => p.human)?.id ?? cur.id;
  }

  isMyTurn(): boolean {
    return !this.observer && this.game.current.id === this.viewer && this.game.current.human;
  }

  /** Whether the shown view knows this tile. */
  knows(index: number): boolean {
    return (this.observer && this.watch === 'all') || this.me.explored[index] === 1;
  }

  // ---- Observer mode ----

  setWatch(watch: NationId | 'all'): void {
    this.watch = watch;
    this.viewer = watch === 'all' ? this.state.players[0].id : watch;
    this.requestRender();
  }

  /** Plays whole rounds of computer turns. */
  observeTurns(n: number): void {
    const head = this.state.config.headStart;
    for (let i = 0; i < n && !this.state.gameOver; i++) {
      if (head && this.state.turn >= head.turn) break;
      this.game.dispatch({ type: 'endTurn' });
    }
    this.requestRender();
    if (head && this.state.turn >= head.turn && !this.state.gameOver) {
      this.takeOver();
      return;
    }
    if (this.state.gameOver) {
      this.setAutoplay(false);
      void this.showGameOver();
    }
  }

  /** Ends a head start: the player's nation leaves computer control. */
  takeOver(): void {
    if (!this.state.config.headStart) return;
    this.setAutoplay(false);
    const nations = this.state.config.headStart.humans;
    handOver(this.state);
    this.observer = false;
    this.watch = 'all';
    this.viewer = this.humanViewer();
    this.camera.zoom = 56;
    this.selected = undefined;
    this.selectNext();
    if (!this.selected) {
      const home = Object.values(this.state.colonies).find((c) => c.owner === this.viewer);
      if (home) this.centerOn(home.x, home.y);
      else this.centerOnStart();
    }
    saveAuto(serialize(this.state));
    this.game.emit();
    toast(`${formatDate(this.state.turn)}: ${nations.length > 1 ? 'your nations are' : `${nationTitle(this.viewer)} is`} yours to command.`);
    void this.answerPending();
  }

  setAutoplay(on: boolean): void {
    this.autoplay = on && !this.state.gameOver;
    clearTimeout(this.autoplayTimer);
    const tick = () => {
      if (!this.autoplay) return;
      this.observeTurns(1);
      if (this.autoplay) this.autoplayTimer = window.setTimeout(tick, this.speed);
    };
    if (this.autoplay) this.autoplayTimer = window.setTimeout(tick, 0);
    this.requestRender();
  }

  selectedUnit(): Unit | undefined {
    return this.selected ? this.state.units[this.selected] : undefined;
  }

  // ---- Rendering ----

  requestRender(mapOnly = false): void {
    if (!mapOnly) this.panelsDirty = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  scene(): Scene {
    const r = this.mapWrap.getBoundingClientRect();
    const u = this.selectedUnit();
    let path: Point[] | undefined;
    if (u && u.dest && 'x' in u.dest) path = findPath(this.state, u, u.dest.x, u.dest.y) ?? undefined;
    else if (u && this.hover && (this.gotoMode || this.hoverIsFar())) path = findPath(this.state, u, this.hover.x, this.hover.y) ?? undefined;
    return {
      state: this.state,
      viewer: this.viewer,
      camera: this.camera,
      width: r.width,
      height: r.height,
      pixelRatio: Math.min(2.5, window.devicePixelRatio || 1),
      selectedUnitId: this.selected,
      hover: this.hover,
      path,
      visible: computeVisibility(this.state, this.viewer),
      revealAll: this.observer && this.watch === 'all',
    };
  }

  private hoverIsFar(): boolean {
    const u = this.selectedUnit();
    const pos = u && unitPosition(this.state, u);
    return !!pos && !!this.hover && distance(pos.x, pos.y, this.hover.x, this.hover.y) > 1;
  }

  private draw(): void {
    this.clampCamera();
    this.renderer.render(this.scene());
    if (!this.panelsDirty) {
      this.sidebar.drawMinimap();
      return;
    }
    this.panelsDirty = false;
    this.sidebar.refresh();
    this.screen?.refresh();
  }

  private clampCamera(): void {
    const { width, height } = this.state.map;
    this.camera.x = Math.max(0, Math.min(width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(height, this.camera.y));
    this.camera.zoom = Math.max(20, Math.min(128, this.camera.zoom));
  }

  centerOn(x: number, y: number, onlyIfOffscreen = false): void {
    if (onlyIfOffscreen) {
      const r = this.mapWrap.getBoundingClientRect();
      const halfW = r.width / 2 / this.camera.zoom - 1.5;
      const halfH = r.height / 2 / this.camera.zoom - 1.5;
      if (Math.abs(x + 0.5 - this.camera.x) < halfW && Math.abs(y + 0.5 - this.camera.y) < halfH) return;
    }
    this.camera.x = x + 0.5;
    this.camera.y = y + 0.5;
    this.requestRender();
  }

  private centerOnStart(): void {
    const e = this.me.entry;
    this.centerOn(e.x - 3, e.y);
  }

  // ---- Commands ----

  dispatch(cmd: Command, quiet = false): boolean {
    if (!this.isMyTurn()) {
      toast('It is not your turn.', 'error');
      return false;
    }
    const result = this.game.dispatch(cmd);
    if (!result.ok) {
      toast(result.error, 'error');
      return false;
    }
    if (result.text && !quiet) toast(result.text);
    void this.answerPending();
    return true;
  }

  private asking = false;

  /** Asks the player about decisions the rules left waiting: tax raises first. */
  async answerPending(): Promise<void> {
    if (this.asking || !this.isMyTurn()) return;
    const tax = this.me.pendingTax;
    if (!tax) return;
    this.asking = true;
    const good = GOOD_DEFS[tax.good].name.toLowerCase();
    const accept = await choose(
      'The Crown raises taxes',
      `His Majesty raises the tax rate from ${this.me.tax}% to ${tax.rate}%. If you refuse, colonists will dump their ${good} in protest and ${good} will be boycotted in Europe until you pay the arrears.`,
      [
        { label: `Accept ${tax.rate}% tax`, value: true, primary: true },
        { label: `Refuse and hold a ${good} party`, value: false },
      ],
    );
    this.asking = false;
    this.dispatch({ type: 'answerTax', accept: accept !== false });
  }

  async chooseFather(): Promise<void> {
    const offer = Object.values(this.me.fatherOffer);
    if (!offer.length || !this.isMyTurn()) return;
    const choice = await choose(
      'Continental Congress',
      h('p', null, `Choose the next Founding Father to join Congress. ${this.me.fatherBells}/${nextFatherCost(this.state, this.me)} liberty bells collected.`),
      [
        ...offer.map((id) => ({ label: `${FATHERS[id].name} (${FATHERS[id].category}): ${FATHERS[id].effect}`, value: id, primary: id === this.me.currentFather })),
        { label: 'Decide later', value: null },
      ],
    );
    if (choice) this.dispatch({ type: 'chooseFather', father: choice }, true);
  }

  private shownGameOver = false;

  async showGameOver(): Promise<void> {
    const over = this.state.gameOver;
    if (!over || this.shownGameOver) return;
    this.shownGameOver = true;
    const rows = (Object.entries(over.scores) as [NationId, number][]).sort((a, b) => b[1] - a[1]);
    const body = h('div', null,
      h('p', null, over.reason),
      over.winner ? h('p', null, h('strong', null, `${nationTitle(over.winner)} ${over.winner === this.viewer ? '(you) ' : ''}wins.`)) : null,
      h('table', { class: 'scores' }, rows.map(([n, score]) => h('tr', null, h('td', null, nationTitle(n)), h('td', null, String(score))))));
    const again = await choose('The game is over', body, [
      { label: 'Keep playing', value: false },
      { label: 'Main menu', value: true, primary: true },
    ]);
    if (again) this.exitToMenu();
  }

  /** After a unit acts, move on to the next one that needs orders. */
  afterUnitAction(): void {
    const u = this.selectedUnit();
    if (!u || u.owner !== this.viewer || u.moves <= 0 || u.loc.kind !== 'map' || u.work || u.dest) this.selectNext();
    this.requestRender();
  }

  selectNext(): void {
    const ids = unitsAwaitingOrders(this.state, this.viewer);
    if (!ids.length) {
      const u = this.selectedUnit();
      if (!u || u.owner !== this.viewer || u.moves <= 0) this.selected = undefined;
      this.requestRender();
      return;
    }
    const at = this.selected ? ids.indexOf(this.selected) : -1;
    this.select(ids[(at + 1) % ids.length]);
  }

  select(unitId: string | undefined): void {
    this.selected = unitId;
    this.gotoMode = false;
    const u = this.selectedUnit();
    const pos = u && unitPosition(this.state, u);
    if (pos) this.centerOn(pos.x, pos.y, true);
    this.requestRender();
  }

  async step(dir: Direction): Promise<void> {
    const u = this.selectedUnit();
    if (!u) return;
    const opt = describeMove(this.state, u.id, dir);
    switch (opt.kind) {
      case 'blocked':
        toast(opt.reason, 'error');
        return;
      case 'move':
      case 'board':
      case 'disembark':
        if (this.dispatch({ type: 'move', unitId: u.id, dir }, true)) this.afterUnitAction();
        return;
      case 'attack': {
        const target = opt.colonyId ? this.state.colonies[opt.colonyId]?.name : 'the enemy unit';
        const ok = await confirmDialog('Attack?', `Attack ${target}? This is an act of war.`, 'Attack', 'Hold back');
        if (ok && this.dispatch({ type: 'attack', unitId: u.id, target: { unitId: opt.targetUnitId, colonyId: opt.colonyId } })) this.afterUnitAction();
        return;
      }
      case 'settlement':
        await this.visitSettlement(u, opt.settlementId, opt.actions);
        return;
    }
  }

  private async visitSettlement(u: Unit, settlementId: string, actions: SettlementAction[]): Promise<void> {
    const st = this.state.settlements[settlementId];
    const labels = {
      speak: 'Speak with the chief',
      mission: st.mission ? `A ${NATIONS[st.mission].adjective} mission is already here` : 'Establish a mission',
      learn: st.skill ? `Live among the natives (learn: ${st.skill.replace(/([A-Z])/g, ' $1').toLowerCase()})` : 'Live among the natives (nothing left to teach)',
      trade: 'Offer goods for trade',
      attack: 'Attack the settlement',
    } as const;
    const mood = tensionLabel(st.tension[this.viewer] ?? 0);
    const choice = await choose(settlementName(st), `The people here are ${mood}. What will you do?`, [
      ...actions.map((a) => ({ label: labels[a], value: a, disabled: (a === 'learn' && !st.skill) || (a === 'mission' && !!st.mission) })),
      { label: 'Leave', value: null },
    ]);
    if (!choice) return;
    let ok = false;
    if (choice === 'speak') ok = this.dispatch({ type: 'speak', unitId: u.id, settlementId });
    if (choice === 'learn') ok = this.dispatch({ type: 'learn', unitId: u.id, settlementId });
    if (choice === 'trade') ok = this.dispatch({ type: 'tradeNatives', unitId: u.id, settlementId });
    if (choice === 'mission') ok = this.dispatch({ type: 'mission', unitId: u.id, settlementId });
    if (choice === 'attack' && (await confirmDialog('Attack?', `Attack the ${settlementName(st)}? Its people will never trust you again.`, 'Attack', 'Hold back'))) {
      ok = this.dispatch({ type: 'attack', unitId: u.id, target: { settlementId } });
    }
    if (ok) this.afterUnitAction();
  }

  async foundColony(): Promise<void> {
    const u = this.selectedUnit();
    if (!u) return;
    const reason = canFoundColony(this.state, u);
    if (reason) return toast(reason, 'error');
    const name = await promptDialog('Found a colony', 'Name of the new colony', this.suggestedName());
    if (name === null) return;
    if (this.dispatch({ type: 'foundColony', unitId: u.id, name })) {
      const c = colonyAt(this.state, ...(this.posOf(u) as [number, number]));
      this.afterUnitAction();
      if (c) this.openColony(c.id);
    }
  }

  private posOf(u: Unit): [number, number] {
    const p = unitPosition(this.state, u);
    return p ? [p.x, p.y] : [-1, -1];
  }

  private suggestedName(): string {
    const names = NATIONS[this.viewer].colonyNames;
    const used = new Set(Object.values(this.state.colonies).map((c) => c.name));
    return names.find((n) => !used.has(n)) ?? `${NATIONS[this.viewer].adjective} Colony`;
  }

  improve(): void {
    const u = this.selectedUnit();
    if (!u || u.loc.kind !== 'map') return;
    const tile = tileAt(this.state, u.loc.x, u.loc.y)!;
    const kind = tile.f ? 'clear' : 'plow';
    const reason = canImprove(this.state, u, kind);
    if (reason) return toast(reason, 'error');
    if (this.dispatch({ type: 'improve', unitId: u.id, kind })) this.afterUnitAction();
  }

  unitCommand(type: 'fortify' | 'sentry' | 'skip' | 'activate' | 'clearOrders' | 'gotoEurope' | 'sailToEurope' | 'disband'): void {
    const u = this.selectedUnit();
    if (!u) return;
    if (type === 'disband') {
      confirmDialog('Disband unit?', 'The unit and anything it carries will be lost.', 'Disband', 'Keep').then((ok) => {
        if (ok && this.dispatch({ type: 'disband', unitId: u.id })) this.afterUnitAction();
      });
      return;
    }
    if (type === 'activate') {
      this.dispatch({ type: 'activate', unitId: u.id });
      this.requestRender();
      return;
    }
    if (this.dispatch({ type, unitId: u.id } as Command)) this.afterUnitAction();
  }

  buildRoad(): void {
    const u = this.selectedUnit();
    if (!u) return;
    const reason = canImprove(this.state, u, 'road');
    if (reason) return toast(reason, 'error');
    if (this.dispatch({ type: 'improve', unitId: u.id, kind: 'road' })) this.afterUnitAction();
  }

  async endTurn(): Promise<void> {
    if (!this.isMyTurn()) return;
    const waiting = unitsAwaitingOrders(this.state, this.viewer).length;
    if (waiting > 0 && !(await confirmDialog('End turn?', `${waiting} unit${waiting > 1 ? 's' : ''} still ha${waiting > 1 ? 've' : 's'} moves left.`, 'End turn', 'Keep playing'))) return;
    this.closeScreen();
    const before = this.viewer;
    this.dispatch({ type: 'endTurn' }, true);
    const next = this.game.current;
    saveAuto(serialize(this.state));
    if (next.human && next.id !== before) {
      this.viewer = next.id;
      this.selected = undefined;
      await this.handoff(next.id);
    }
    this.selectNext();
    if (!this.selected) this.centerOnStart();
    this.sidebar.showReports();
    this.requestRender();
    await this.showGameOver();
    await this.answerPending();
    if (!this.me.currentFather && Object.keys(this.me.fatherOffer).length && this.me.fatherBells > 0) await this.chooseFather();
  }

  private handoff(nation: NationId): Promise<void> {
    return new Promise((resolve) => {
      const veil = h(
        'div',
        { class: 'handoff' },
        h('div', { class: 'dialog' }, h('h2', null, `${nationTitle(nation)} to move`), h('p', null, `${formatDate(this.state.turn)}. Pass the device to the player of ${NATIONS[nation].name}.`),
          h('button', { class: 'btn primary', onclick: () => { veil.remove(); resolve(); } }, 'Begin turn')),
      );
      document.body.appendChild(veil);
      (veil.querySelector('button') as HTMLButtonElement).focus();
    });
  }

  // ---- Screens ----

  openColony(colonyId: string): void {
    this.showScreen(new ColonyScreen(this, colonyId));
  }

  openEurope(): void {
    this.showScreen(new EuropeScreen(this));
  }

  openDiplomacy(): void {
    this.showScreen(new DiplomacyScreen(this));
  }

  private showScreen(screen: Screen): void {
    this.closeScreen();
    this.screen = screen;
    this.screenHost.appendChild(screen.el);
    this.root.classList.add('has-screen');
    screen.refresh();
  }

  closeScreen(): void {
    if (!this.screen) return;
    this.screen.close?.();
    this.screen.el.remove();
    this.screen = null;
    this.root.classList.remove('has-screen');
    this.requestRender();
    this.canvas.focus();
  }

  exitToMenu(): void {
    this.onExit();
  }

  // ---- Input ----

  private tileAtEvent(e: { clientX: number; clientY: number }): Point {
    const r = this.mapWrap.getBoundingClientRect();
    return screenToTile({ camera: this.camera, width: r.width, height: r.height }, e.clientX - r.left, e.clientY - r.top);
  }

  private bindInput(): void {
    const c = this.canvas;
    c.tabIndex = 0;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { x: e.clientX, y: e.clientY, cx: this.camera.x, cy: this.camera.y, moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.camera.zoom };
      } else {
        this.drag = { x: e.clientX, y: e.clientY, cx: this.camera.x, cy: this.camera.y, moved: false };
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.drag;
      if (d?.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.camera.zoom = d.zoom! * (Math.hypot(a.x - b.x, a.y - b.y) / d.pinch);
        this.requestRender();
        return;
      }
      if (d && this.pointers.size === 1) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true;
        if (d.moved) {
          this.camera.x = d.cx - dx / this.camera.zoom;
          this.camera.y = d.cy - dy / this.camera.zoom;
          this.requestRender(true);
        }
        return;
      }
      if (e.pointerType === 'mouse') {
        const t = this.tileAtEvent(e);
        if (!this.hover || t.x !== this.hover.x || t.y !== this.hover.y) {
          this.hover = t;
          this.requestRender(true);
        }
      }
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) this.drag = null;
      if (d && !d.moved && e.type === 'pointerup') void this.click(this.tileAtEvent(e), e.button === 2 || e.shiftKey);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      this.hover = undefined;
      this.requestRender(true);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const before = this.tileAtEventExact(e);
        this.camera.zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.clampCamera();
        const after = this.tileAtEventExact(e);
        this.camera.x += before.x - after.x;
        this.camera.y += before.y - after.y;
        this.requestRender();
      },
      { passive: false },
    );
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    this.disposers.push(() => window.removeEventListener('keydown', onKey));
  }

  private tileAtEventExact(e: { clientX: number; clientY: number }): Point {
    const r = this.mapWrap.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - r.width / 2) / this.camera.zoom + this.camera.x,
      y: (e.clientY - r.top - r.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  zoomBy(f: number): void {
    this.camera.zoom *= f;
    this.requestRender();
  }

  private async click(t: Point, alt: boolean): Promise<void> {
    const s = this.state;
    if (!tileAt(s, t.x, t.y) || !this.knows(t.y * s.map.width + t.x)) return;
    if (this.observer) {
      const c = colonyAt(s, t.x, t.y);
      if (c) return this.openColony(c.id);
      const here = unitsAt(s, t.x, t.y);
      if (here.length) this.select(here[(here.findIndex((o) => o.id === this.selected) + 1) % here.length].id);
      return;
    }
    const u = this.selectedUnit();
    const pos = u && unitPosition(s, u);
    const adjacent = !!pos && distance(pos.x, pos.y, t.x, t.y) === 1;
    if (u && pos && (alt || this.gotoMode) && this.isMyTurn()) {
      this.gotoMode = false;
      if (this.dispatch({ type: 'goto', unitId: u.id, x: t.x, y: t.y }, true)) this.afterUnitAction();
      return;
    }
    const colony = colonyAt(s, t.x, t.y);
    const mine = unitsAt(s, t.x, t.y).filter((o) => o.owner === this.viewer);
    if (colony && colony.owner === this.viewer) {
      if (u && adjacent && u.moves > 0 && this.isMyTurn()) return this.step(this.dirTo(pos!, t));
      return this.openColony(colony.id);
    }
    if (mine.length) {
      const boarding = u && adjacent && !isShip(u) && isWater(tileAt(s, t.x, t.y)) && u.moves > 0;
      if (boarding && this.isMyTurn()) return this.step(this.dirTo(pos!, t));
      // Clicking a stack cycles through it, ships first so their passengers are reachable.
      const order = [...mine, ...mine.flatMap((m) => unitsAboard(s, m))];
      const at = order.findIndex((o) => o.id === this.selected);
      this.select(order[(at + 1) % order.length].id);
      return;
    }
    if (u && adjacent && this.isMyTurn()) return this.step(this.dirTo(pos!, t));
    if (u && pos && this.isMyTurn() && !settlementAt(s, t.x, t.y)) {
      if (this.dispatch({ type: 'goto', unitId: u.id, x: t.x, y: t.y }, true)) this.afterUnitAction();
    }
  }

  private dirTo(a: Point, b: Point): Direction {
    return DIRECTIONS.find((d) => d.dx === Math.sign(b.x - a.x) && d.dy === Math.sign(b.y - a.y))!.id;
  }

  private onKey(e: KeyboardEvent): void {
    if (document.getElementById('dialog-layer')?.childElementCount || document.querySelector('.handoff')) return;
    const target = e.target as HTMLElement;
    if (target.matches('input, select, textarea')) return;
    if (this.screen) {
      if (e.key === 'Escape') this.closeScreen();
      return;
    }
    if (this.observer) {
      if (e.key === ' ') {
        e.preventDefault();
        this.setAutoplay(!this.autoplay);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.observeTurns(1);
      }
      return;
    }
    const dir = KEY_DIRS[e.code] ?? KEY_DIRS[e.key];
    if (dir && this.selected) {
      e.preventDefault();
      void this.step(dir);
      return;
    }
    const key = e.key.toLowerCase();
    const actions: Record<string, () => void> = {
      b: () => void this.foundColony(),
      p: () => this.improve(),
      r: () => this.buildRoad(),
      f: () => this.unitCommand('fortify'),
      s: () => this.unitCommand('sentry'),
      ' ': () => this.unitCommand('skip'),
      w: () => this.selectNext(),
      tab: () => this.selectNext(),
      n: () => this.selectNext(),
      g: () => {
        this.gotoMode = !!this.selected;
        if (this.gotoMode) toast('Click where the unit should go.');
      },
      c: () => {
        const u = this.selectedUnit();
        const p = u && unitPosition(this.state, u);
        if (p) this.centerOn(p.x, p.y);
      },
      e: () => this.openEurope(),
      d: () => this.openDiplomacy(),
      enter: () => void this.endTurn(),
      escape: () => {
        this.gotoMode = false;
        this.requestRender();
      },
      '+': () => this.zoomBy(1.2),
      '=': () => this.zoomBy(1.2),
      '-': () => this.zoomBy(1 / 1.2),
    };
    const fn = actions[key];
    if (fn && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      fn();
    }
  }
}
