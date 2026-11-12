import {
  waysOf,
  braveName,
  bravesAt,
  buildMapIndex,
  calendarOf,
  canFoundColony,
  canImprove,
  canUseRoutes,
  charterCost,
  colonyAt,
  describeMove,
  gridOf,
  findPath,
  formatDate,
  Game,
  handOver,
  IMPROVEMENT_TURNS,
  incitePrice,
  isShip,
  isWater,
  mapRevealed,
  maxMoves,
  moveCost,
  nationOf,
  nationTitle,
  pendingDemands,
  pendingEvents,
  player,
  portName,
  portsFor,
  serialize,
  settlementAt,
  settlementName,
  settlementTeaches,
  nativeRulesOf,
  tensionLabel,
  term,
  tileAt,
  tileDescription,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAt,
  unitsAwaitingOrders,
  type Command,
  type Direction,
  type GameMessage,
  type GameState,
  type PlayerId,
  type SettlementAction,
  type Unit,
  isPeoplePlayer,
} from '@cc/engine';

/** Who claims a tile and its region's health, for the map's hover text (native-nations.md T5, T10). */
function landWords(s: GameState, x: number, y: number): string[] {
  const out: string[] = [];
  const claim = tileAt(s, x, y)?.claim;
  if (claim) out.push(`land of ${nationOf(s, claim).name}`);
  const land = townLand(s, x, y);
  if (land) out.push(`${land.region}${land.words ? `: ${land.words} (${land.health})` : ''}${land.hard ? ', a hard year' : ''}`);
  return out;
}
import { computeVisibility, screenToTile, type Camera, type MapRenderer, type Point, type Scene } from '@cc/render-api';
import { h } from './dom.js';
import { saveAuto } from './save.js';
import { JobCancelled, turnRunner, type Job, type JobResult, type Progress } from './turns/runner.js';
import { activeStyle, onStyleAssetsChanged, onStyleChange } from './styles.js';
import { ColonyScreen } from './ui/colony.js';
import { openCheats } from './ui/cheats.js';
import { choose, confirmDialog, promptDialog, toast } from './ui/dialogs.js';
import { DiplomacyScreen } from './ui/diplomacy.js';
import { EuropeScreen } from './ui/europe.js';
import { CongressScreen } from './ui/congress.js';
import { ProgressScreen } from './ui/progress.js';
import { REPORT_TABS, ReportsScreen } from './ui/reports.js';
import { RoutesScreen } from './ui/routes.js';
import { Sidebar } from './ui/sidebar.js';
import { showTurnStart, sortNews } from './ui/turnstart.js';
import { townLand } from './ui/town.js';
import { defenceLine, exchangeLine, inciteDialog, leaseLine, nativeTradeDialog, speakLabel } from './ui/natives.js';

/**
 * Turns of movement a unit needs to walk a path: the rest of this turn's moves first (or a fresh
 * turn when none are left), then full turns. As in the rules, a step is allowed while any moves remain.
 */
export function pathTurns(s: GameState, u: Unit, path: Point[]): number {
  const start = unitPosition(s, u);
  if (!start || !path.length) return 0;
  const full = Math.max(1, maxMoves(u, s));
  const index = buildMapIndex(s);
  let turns = 1;
  let left = u.moves > 0 ? u.moves : full;
  let from = start;
  for (const step of path) {
    if (left <= 0) {
      turns++;
      left = full;
    }
    left -= moveCost(s, u, from.x, from.y, step.x, step.y, index);
    from = step;
  }
  return turns;
}

/**
 * Turns a "Road to…" order takes along a path, as the engine runs it: a roadless tile is built
 * (3 turns, half for a hardy pioneer) before stepping on, and each step onto a roadless tile uses up
 * the turn's moves. The tile under the unit and the target are both roaded.
 */
export function roadToTurns(s: GameState, u: Unit, path: Point[]): number {
  const start = unitPosition(s, u);
  if (!start) return 0;
  const full = Math.max(1, maxMoves(u, s));
  const index = buildMapIndex(s);
  const build = u.type === 'hardyPioneer' ? Math.ceil(IMPROVEMENT_TURNS.road / 2) : IMPROVEMENT_TURNS.road;
  const roaded = (p: Point) => !!tileAt(s, p.x, p.y)?.r || !!colonyAt(s, p.x, p.y);
  let turns = 1;
  let left = u.moves > 0 ? u.moves : full;
  let at: Point = start;
  const roadHere = () => {
    if (roaded(at)) return;
    if (left <= 0) {
      turns++;
      left = full;
    }
    turns += build;
    left = full;
  };
  for (const step of path) {
    roadHere();
    if (left <= 0) {
      turns++;
      left = full;
    }
    left -= moveCost(s, u, at.x, at.y, step.x, step.y, index);
    at = step;
  }
  roadHere();
  return turns;
}

export interface Screen {
  el: HTMLElement;
  refresh(): void;
  close?(): void;
  /** Keys pressed while the screen is open (Escape always closes it). Returns true when handled. */
  onKey?(e: KeyboardEvent): boolean;
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
  viewer: PlayerId;
  selected?: string;
  hover?: Point;
  gotoMode = false;
  /** Waiting for a click on the tile a pioneer should build a road to. */
  roadToMode = false;
  /** No people play: the computers play each other and the user watches. */
  observer: boolean;
  /** In observer mode, whose view of the world is shown ('all' reveals everything). */
  watch: PlayerId | 'all' = 'all';
  autoplay = false;
  /** The land overlay (claims and the land's health, native-nations.md T5, T10) is shown on the map. */
  overlay = false;
  /** Milliseconds between turns while autoplaying. */
  speed = 400;
  private autoplayTimer = 0;
  private autoplayGen = 0;
  /**
   * Computer turns are being played (in the engine worker): the map still draws and scrolls, but
   * no commands are taken until the new state arrives.
   */
  busy = false;
  /** What the running turn job last reported, for the progress banner. */
  progress?: Progress & { label: string };
  private progressEl: HTMLElement;
  private destroyed = false;
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
    this.canvas = h('canvas', { class: 'map', 'aria-label': `Map of ${term(this.state, 'colonyLand')}` });
    this.mapWrap = h('div', { class: 'map-wrap' }, this.canvas);
    this.sidebar = new Sidebar(this);
    this.screenHost = h('div', { class: 'screen-host' });
    this.progressEl = h('div', { class: 'turn-progress', role: 'status', 'aria-live': 'polite', hidden: true });
    this.mapWrap.appendChild(this.progressEl);
    this.root = h('div', { class: 'game' }, this.mapWrap, this.sidebar.el, this.screenHost);
    // While computer turns run, the page's state is about to be replaced: refuse commands from every
    // screen (some dispatch to the game directly) until it has been.
    const dispatch = game.dispatch.bind(game);
    game.dispatch = (cmd) => (this.busy ? { ok: false, error: 'The computer players are moving. One moment.' } : dispatch(cmd));
    host.appendChild(this.root);
    this.renderer = activeStyle().createMapRenderer(this.canvas);

    this.disposers.push(
      game.subscribe(() => this.requestRender()),
      onStyleChange((style) => {
        this.renderer.dispose();
        this.renderer = style.createMapRenderer(this.canvas);
        this.requestRender();
      }),
      onStyleAssetsChanged(() => this.requestRender()),
    );
    this.bindInput();
    const ro = new ResizeObserver(() => this.requestRender());
    ro.observe(this.mapWrap);
    this.disposers.push(() => ro.disconnect());

    const head = this.state.config.headStart;
    if (head) {
      // A watched head start: follow the nation the player will take over.
      this.speed = HEAD_START_MIN_MS;
      this.camera.zoom = 40;
      // A nation yet to arrive (native-nations.md T18) has no view yet: show everything until it does.
      const present = head.humans.find((id) => this.state.players.some((p) => p.id === id));
      this.setWatch(present ?? 'all');
      this.centerOnStart();
      this.setAutoplay(true);
    } else if (this.observer) {
      this.camera.zoom = 26;
      this.centerOn(this.state.map.width / 2, this.state.map.height / 2);
    } else {
      this.selectNext();
      if (!this.selected) this.centerOnStart();
      // A loaded game may be waiting on a decision.
      setTimeout(() => void this.turnStart(), 0);
    }
    this.requestRender();
  }

  destroy(): void {
    this.destroyed = true;
    // A turn job of this game is no longer wanted.
    if (this.busy) turnRunner.cancel();
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

  private humanViewer(): PlayerId {
    const cur = this.game.current;
    if (cur.human) return cur.id;
    return this.state.players.find((p) => p.human)?.id ?? cur.id;
  }

  isMyTurn(): boolean {
    return !this.busy && !this.observer && this.game.current.id === this.viewer && this.game.current.human;
  }

  /** Whether the shown view knows this tile. */
  knows(index: number): boolean {
    return this.revealAll() || this.me.explored[index] === 1;
  }

  /** Whether the shown view has the whole map: an observer watching everything, or the reveal-map cheat. */
  revealAll(): boolean {
    return (this.observer && this.watch === 'all') || mapRevealed(this.state, this.viewer);
  }

  // ---- Observer mode ----

  setWatch(watch: PlayerId | 'all'): void {
    this.watch = watch;
    this.viewer = watch === 'all' ? this.state.players[0].id : watch;
    this.requestRender();
  }

  /** Plays whole rounds of computer turns (in the engine worker). */
  async observeTurns(n: number): Promise<void> {
    if (this.busy || this.state.gameOver) return;
    const head = this.state.config.headStart;
    const done = await this.runJob({ type: 'rounds', state: this.state, rounds: n, stopAt: head?.turn }, n > 1 ? `Playing ${n} turns` : '');
    if (!done || this.destroyed) return;
    if (this.watch !== 'all') this.follow(this.watch);
    this.requestRender();
    if (head && this.state.turn >= head.turn && !this.state.gameOver) {
      void this.takeOver();
      return;
    }
    if (this.state.gameOver) {
      this.setAutoplay(false);
      void this.showGameOver();
    }
  }

  /** Keeps the watched nation's latest activity in view: its newest colony, or its ships before it has one. */
  private follow(nation: PlayerId): void {
    const newest = Object.values(this.state.colonies)
      .filter((c) => c.owner === nation)
      .sort((a, b) => b.founded - a.founded)[0];
    const ship = Object.values(this.state.units).find((u) => u.owner === nation && isShip(u) && u.loc.kind === 'map');
    const at = newest ?? (ship && unitPosition(this.state, ship));
    if (!at) return;
    // Jump to each new colony; otherwise only move when the action leaves the screen.
    const fresh = !!newest && newest.id !== this.followed;
    if (newest) this.followed = newest.id;
    this.centerOn(at.x, at.y, !fresh);
  }

  private followed?: string;

  /** Ends a head start: the player's nation leaves computer control. */
  async takeOver(): Promise<void> {
    if (!this.state.config.headStart) return;
    this.setAutoplay(false);
    // Let a round in progress finish first: its state replaces the page's.
    while (this.busy) await new Promise((r) => setTimeout(r, 20));
    if (this.destroyed || !this.state.config.headStart) return;
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
    toast(`${formatDate(this.state.turn, calendarOf(this.state))}: ${nations.length > 1 ? 'your nations are' : `${nationTitle(this.state, this.viewer)} is`} yours to command.`);
    void this.turnStart();
  }

  setAutoplay(on: boolean): void {
    this.autoplay = on && !this.state.gameOver;
    clearTimeout(this.autoplayTimer);
    // One chain of ticks: a tick of an earlier call (still waiting for its round) stops when it is in.
    const gen = ++this.autoplayGen;
    const tick = async () => {
      if (!this.autoplay || gen !== this.autoplayGen) return;
      // A round started by hand (+1, +10) is still being played: start when it is in.
      if (this.busy) {
        this.autoplayTimer = window.setTimeout(tick, 50);
        return;
      }
      const started = performance.now();
      await this.observeTurns(1);
      // Each turn is shown for at least `speed` ms, counting the time it took to play.
      if (this.autoplay && gen === this.autoplayGen) this.autoplayTimer = window.setTimeout(tick, Math.max(0, this.speed - (performance.now() - started)));
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
    let pathKind: Scene['pathKind'];
    if (u && u.roadTo) {
      path = findPath(this.state, u, u.roadTo.x, u.roadTo.y) ?? undefined;
      pathKind = 'road';
    } else if (u && this.roadToMode && this.hover && u.role === 'pioneer') {
      path = findPath(this.state, u, this.hover.x, this.hover.y) ?? undefined;
      pathKind = 'road';
    } else if (u && u.dest && 'x' in u.dest) path = findPath(this.state, u, u.dest.x, u.dest.y) ?? undefined;
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
      pathKind,
      pathTurns: u && path?.length ? (pathKind === 'road' ? roadToTurns(this.state, u, path) : pathTurns(this.state, u, path)) : undefined,
      visible: computeVisibility(this.state, this.viewer),
      revealAll: this.revealAll(),
      ...(this.overlay ? { overlay: 'land' as const } : {}),
    };
  }

  /** Shows or hides the land overlay. */
  toggleOverlay(): void {
    this.overlay = !this.overlay;
    this.requestRender();
  }

  private hoverIsFar(): boolean {
    const u = this.selectedUnit();
    const pos = u && unitPosition(this.state, u);
    return !!pos && !!this.hover && gridOf(this.state).distance(pos.x, pos.y, this.hover.x, this.hover.y) > 1;
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
    // After an end of turn, endTurn() itself shows the briefing with the news.
    if (cmd.type !== 'endTurn') void this.answerPending();
    return true;
  }

  private asking = false;

  /** The last message each nation had seen when it ended its turn, to tell what is new since. */
  private lastSeen = new Map<PlayerId, GameMessage>();

  /** Messages for the viewer since it last ended its turn. */
  private newsSinceLastTurn(): GameMessage[] {
    const msgs = this.state.messages;
    const mark = this.lastSeen.get(this.viewer);
    const at = mark ? msgs.indexOf(mark) : -2;
    // The log is capped; if the mark has scrolled out, fall back to the last round.
    const recent = at === -2 ? [] : at === -1 ? msgs.filter((m) => m.turn >= this.state.turn - 1) : msgs.slice(at + 1);
    return recent.filter((m) => !m.to || m.to === this.viewer);
  }

  /**
   * The turn-start briefing: one modal with every pending decision and the turn's news.
   * Nothing is shown when nothing needs attention, nor to observers or during a head start.
   */
  async turnStart(news: GameMessage[] = [], opts: { father?: boolean } = {}): Promise<void> {
    if (this.asking || !this.isMyTurn() || this.state.gameOver) return;
    this.asking = true;
    try {
      await showTurnStart(this, sortNews(news), opts);
    } finally {
      this.asking = false;
    }
    this.requestRender();
  }

  /** Asks about decisions the rules left waiting mid-turn (a tax raise after a sale, a royal demand). */
  async answerPending(): Promise<void> {
    if (this.me.independenceChoice || this.me.pendingTax || this.me.pendingDemand || pendingDemands(this.state, this.me.id).some((d) => d.kind === 'demand' || d.kind === 'treaty') || pendingEvents(this.state, this.me.id).length) await this.turnStart();
  }

  /** Opens the Congress choice in the briefing modal. */
  async chooseFather(): Promise<void> {
    await this.turnStart([], { father: true });
  }

  /** Retire: after a confirmation, ends the game now with the current score. */
  async retire(): Promise<void> {
    const ok = await confirmDialog('Retire?', 'End the game now? Your score is counted as it stands.', 'Retire', 'Keep playing');
    if (ok && this.dispatch({ type: 'retire' })) {
      this.requestRender();
      void this.showGameOver();
    }
  }

  private shownGameOver = false;

  async showGameOver(): Promise<void> {
    const over = this.state.gameOver;
    if (!over || this.shownGameOver) return;
    this.shownGameOver = true;
    // The final scores open on the Progress Graphs, so the whole game can be looked back on.
    this.showScreen(new ProgressScreen(this, { ...over, ways: waysOf(this.state), viewer: this.observer ? undefined : this.viewer, onMenu: () => this.exitToMenu() }));
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
    this.roadToMode = false;
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
        const brave = opt.braveId ? this.state.braves?.[opt.braveId] : undefined;
        const target = opt.colonyId ? this.state.colonies[opt.colonyId]?.name : brave ? `the ${braveName(this.state, brave)}` : 'the enemy unit';
        const ok = await confirmDialog('Attack?', `Attack ${target}? This is an act of war.`, 'Attack', 'Hold back');
        if (ok && this.dispatch({ type: 'attack', unitId: u.id, target: { unitId: opt.targetUnitId, colonyId: opt.colonyId, braveId: opt.braveId } })) this.afterUnitAction();
        return;
      }
      case 'settlement':
        await this.visitSettlement(u, opt.settlementId, opt.actions);
        return;
    }
  }

  private async visitSettlement(u: Unit, settlementId: string, actions: SettlementAction[]): Promise<void> {
    const st = this.state.settlements[settlementId];
    // The skill taught: the settlement's own, or a renewed one under a cultural exchange (N7).
    const skill = settlementTeaches(this.state, st, this.viewer);
    const labels = {
      speak: speakLabel(this.state, this.viewer, st),
      mission: st.mission ? `A ${nationOf(this.state, st.mission).adjective} mission is already here` : 'Establish a mission',
      learn: skill ? `Live among the natives (learn: ${skill.replace(/([A-Z])/g, ' $1').toLowerCase()})` : 'Live among the natives (nothing left to teach)',
      trade: 'Trade: sell and buy goods',
      denounce: st.mission ? `Denounce the ${nationOf(this.state, st.mission).adjective} mission` : 'Denounce a rival mission',
      incite: `Incite the natives against a rival (${incitePrice(this.state, st)} gold)`,
      attack: 'Attack the settlement',
    } as const;
    const mood = tensionLabel(st.tension[this.viewer] ?? 0, nativeRulesOf(this.state).tension);
    // A lease of the people's land (land use, N5) is shown with its rent, a cultural exchange (N7) with when it teaches again.
    const lease = leaseLine(this, this.viewer, st.tribe);
    const exchange = exchangeLine(this, this.viewer, st);
    // A mutual defence pact (N7): the viewer's own, or the nation the people is bound to.
    const defence = defenceLine(this, this.viewer, st);
    const text = lease || exchange || defence ? h('div', null, h('p', null, `The people here are ${mood}. What will you do?`), lease, exchange, defence) : `The people here are ${mood}. What will you do?`;
    const choice = await choose(settlementName(this.state, st), text, [
      ...actions.map((a) => ({ label: labels[a], value: a, disabled: (a === 'learn' && !skill) || (a === 'mission' && !!st.mission) })),
      { label: 'Leave', value: null },
    ]);
    if (!choice) return;
    let ok = false;
    if (choice === 'speak') ok = this.dispatch({ type: 'speak', unitId: u.id, settlementId });
    if (choice === 'learn') ok = this.dispatch({ type: 'learn', unitId: u.id, settlementId });
    if (choice === 'trade') ok = await nativeTradeDialog(this, u, settlementId);
    if (choice === 'mission') ok = this.dispatch({ type: 'mission', unitId: u.id, settlementId });
    if (choice === 'denounce') ok = this.dispatch({ type: 'denounce', unitId: u.id, settlementId });
    if (choice === 'incite') ok = await inciteDialog(this, u, settlementId);
    if (choice === 'attack' && (await confirmDialog('Attack?', `Attack the ${settlementName(this.state, st)}? Its people will never trust you again.`, 'Attack', 'Hold back'))) {
      ok = this.dispatch({ type: 'attack', unitId: u.id, target: { settlementId } });
    }
    if (ok) this.afterUnitAction();
  }

  async foundColony(): Promise<void> {
    const u = this.selectedUnit();
    if (!u) return;
    const reason = canFoundColony(this.state, u);
    if (reason) return toast(reason, 'error');
    const cost = charterCost(this.state, u.owner);
    const town = isPeoplePlayer(this.me);
    const name = await promptDialog(town ? 'Found a town' : cost > 0 ? `Found a colony (charter: ${cost} gold)` : 'Found a colony', town ? 'Name of the new town' : 'Name of the new colony', this.suggestedName());
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
    const names = nationOf(this.state, this.viewer).colonyNames;
    const used = new Set(Object.values(this.state.colonies).map((c) => c.name));
    return names.find((n) => !used.has(n)) ?? `${nationOf(this.state, this.viewer).adjective} Colony`;
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
    if (type === 'gotoEurope' || type === 'sailToEurope') {
      void this.sailForEurope(u, type);
      return;
    }
    if (this.dispatch({ type, unitId: u.id } as Command)) this.afterUnitAction();
  }

  /** Sends a ship to Europe; with Favoured Nation partners, first asks which home port. */
  private async sailForEurope(u: Unit, type: 'gotoEurope' | 'sailToEurope'): Promise<void> {
    const ports = portsFor(this.state, u.owner);
    let port: PlayerId | undefined;
    if (ports.length > 1) {
      const choice = await choose<PlayerId>('Sail to which port?', `${unitName(u)} can sail to your own home port or to a Favoured Nation's. In a partner's port you trade at its prices and tax and can buy merchant ships; colonists are recruited and go ashore only at home.`,
        ports.map((p, i) => ({ label: `${portName(this.state, p)}${i === 0 ? ' (home)' : ` (${nationOf(this.state, p).adjective})`}`, value: p, primary: i === 0 })));
      if (!choice) return;
      port = choice === u.owner ? undefined : choice;
    }
    if (this.dispatch(port ? { type, unitId: u.id, port } : { type, unitId: u.id })) this.afterUnitAction();
  }

  /** Starts picking the tile a pioneer should build a road to. */
  startRoadTo(): void {
    const u = this.selectedUnit();
    if (!u || !this.isMyTurn()) return;
    if (u.role !== 'pioneer' || u.tools <= 0) return toast('Only pioneers with tools can build roads.', 'error');
    this.gotoMode = false;
    this.roadToMode = true;
    toast('Click the tile the road should lead to.');
    this.requestRender();
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
    const mark = this.state.messages[this.state.messages.length - 1];
    if (mark) this.lastSeen.set(before, mark);
    const done = await this.runJob({ type: 'endTurn', state: this.state }, 'Computer players moving');
    if (!done || this.destroyed) return;
    if (done.result && !done.result.ok) toast(done.result.error, 'error');
    const next = this.game.current;
    saveAuto(serialize(this.state));
    if (next.human && next.id !== before) {
      this.viewer = next.id;
      this.selected = undefined;
      await this.handoff(next.id);
    }
    this.selectNext();
    if (!this.selected) this.centerOnStart();
    this.requestRender();
    await this.showGameOver();
    await this.turnStart(this.newsSinceLastTurn());
  }

  /**
   * Runs a turn job (turns/runner.ts) and puts the state it returns in place of the page's. While it
   * runs the page keeps drawing the current state and refuses commands; after a moment a banner
   * shows how far the computer players have got. Returns undefined if it failed or was cancelled.
   */
  private async runJob(job: Job, label: string): Promise<JobResult | undefined> {
    const old = this.state;
    const movers = job.type === 'endTurn' ? this.computerMovers() : 0;
    this.busy = true;
    this.progress = { turn: old.turn, label };
    this.requestRender();
    const show = window.setTimeout(() => this.showProgress(movers), 300);
    try {
      const done = await turnRunner.run(job, (p) => {
        this.progress = { ...p, label };
        if (!this.progressEl.hidden) this.showProgress(movers);
      });
      if (this.destroyed) return undefined;
      this.adoptState(old, done);
      return done;
    } catch (err) {
      if (!(err instanceof JobCancelled) && !this.destroyed) {
        console.error(err);
        toast('The computer players could not finish their turn.', 'error');
      }
      return undefined;
    } finally {
      clearTimeout(show);
      this.busy = false;
      this.progress = undefined;
      this.progressEl.hidden = true;
      if (!this.destroyed) this.requestRender();
    }
  }

  /** Nations that move after the current one before a person is up again (for the progress count). */
  private computerMovers(): number {
    const ps = this.state.players;
    let n = 0;
    for (let i = 1; i <= ps.length; i++) {
      const p = ps[(this.state.current + i) % ps.length];
      if (p.human && !p.finished) break;
      if (!p.finished) n++;
    }
    return n;
  }

  private showProgress(movers: number): void {
    const p = this.progress;
    if (!p || !this.busy) return;
    const cal = calendarOf(this.state);
    let text = `${p.label || 'Playing'}… ${formatDate(p.turn, cal)}`;
    let pct: number | undefined;
    // The first nation to finish is the person's own; then each computer player.
    if (p.moved !== undefined && movers > 0) {
      const done = Math.min(movers, Math.max(0, p.moved - 1));
      text = `${p.label}… ${done} of ${movers} done`;
      pct = (done / movers) * 100;
    } else if (p.target) {
      text += ` of ${formatDate(p.target, cal)}`;
    }
    this.progressEl.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, text));
    if (pct !== undefined) this.progressEl.append(h('span', { class: 'bar' }, h('span', { style: `width:${Math.round(pct)}%` })));
    this.progressEl.hidden = false;
  }

  /**
   * Puts a job's state in place of the page's. In the worker the state is a clone, so the markers
   * that point into the old message log are moved to the same messages in the new one.
   */
  private adoptState(old: GameState, done: JobResult): void {
    if (done.state !== old) {
      const shift = done.dropped ?? 0;
      for (const [nation, mark] of this.lastSeen) {
        const at = old.messages.lastIndexOf(mark) - shift;
        // A mark that has scrolled out of the log stays as it is: not found, the news falls back to the last round.
        if (at >= 0 && done.state.messages[at]) this.lastSeen.set(nation, done.state.messages[at]);
      }
      this.game.state = done.state;
    }
    this.game.emit();
  }

  private handoff(nation: PlayerId): Promise<void> {
    return new Promise((resolve) => {
      const veil = h(
        'div',
        { class: 'handoff' },
        h('div', { class: 'dialog' }, h('h2', null, `${nationTitle(this.state, nation)} to move`), h('p', null, `${formatDate(this.state.turn, calendarOf(this.state))}. Pass the device to the player of ${nationOf(this.state, nation).name}.`),
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

  /** Europe; `port` opens a Favoured Nation partner's port where the viewer has ships. */
  openEurope(port?: PlayerId): void {
    this.showScreen(new EuropeScreen(this, port));
  }

  openDiplomacy(): void {
    this.showScreen(new DiplomacyScreen(this));
  }

  /** Trade routes; with a ship or wagon train, ready to assign it. */
  openRoutes(unitId?: string): void {
    this.showScreen(new RoutesScreen(this, unitId));
  }

  openCheats(): void {
    void openCheats(this);
  }

  /** The Continental Congress hall (the fathers who have joined, standing together). */
  openCongress(): void {
    if (this.screen instanceof CongressScreen) return;
    this.showScreen(new CongressScreen(this));
  }

  openProgress(): void {
    this.showScreen(new ProgressScreen(this));
  }

  /** The advisor reports, on a tab (see REPORT_TABS) or the one last looked at. */
  openReports(tab?: string): void {
    if (this.screen instanceof ReportsScreen) {
      if (tab) this.screen.setTab(tab);
      return;
    }
    this.showScreen(new ReportsScreen(this, tab));
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
          // Tile info on hover: terrain, river, road.
          const tile = tileAt(this.state, t.x, t.y);
          const braves = bravesAt(this.state, t.x, t.y).map((b) => braveName(this.state, b));
          c.title = tile && this.knows(t.y * this.state.map.width + t.x) ? [tileDescription(tile), ...braves, ...landWords(this.state, t.x, t.y)].join(' · ') : '';
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
    const adjacent = !!pos && gridOf(s).distance(pos.x, pos.y, t.x, t.y) === 1;
    if (u && pos && this.roadToMode && this.isMyTurn()) {
      this.roadToMode = false;
      if (this.dispatch({ type: 'roadTo', unitId: u.id, x: t.x, y: t.y }, true)) this.afterUnitAction();
      this.requestRender();
      return;
    }
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
    return gridOf(this.state).directionTowards(a.x, a.y, b.x, b.y)!;
  }

  private onKey(e: KeyboardEvent): void {
    if (document.getElementById('dialog-layer')?.childElementCount || document.querySelector('.handoff')) return;
    const target = e.target as HTMLElement;
    if (target.matches('input, select, textarea')) return;
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault();
      this.openCheats();
      return;
    }
    // F1–F8 open the advisor reports from anywhere, as in the original game.
    const fkey = /^F([1-8])$/.exec(e.key);
    if (fkey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      this.openReports(REPORT_TABS[Number(fkey[1]) - 1].id);
      return;
    }
    if (this.screen) {
      if (e.key === 'Escape') this.closeScreen();
      else if (this.screen.onKey?.(e)) e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.openReports();
      return;
    }
    if (e.key.toLowerCase() === 'k' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.openCongress();
      return;
    }
    if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.openProgress();
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
      r: () => (e.shiftKey ? this.startRoadTo() : this.buildRoad()),
      f: () => this.unitCommand('fortify'),
      s: () => this.unitCommand('sentry'),
      ' ': () => this.unitCommand('skip'),
      w: () => this.selectNext(),
      tab: () => this.selectNext(),
      n: () => this.selectNext(),
      g: () => {
        this.roadToMode = false;
        this.gotoMode = !!this.selected;
        if (this.gotoMode) toast('Click where the unit should go.');
      },
      c: () => {
        const u = this.selectedUnit();
        const p = u && unitPosition(this.state, u);
        if (p) this.centerOn(p.x, p.y);
      },
      e: () => (isPeoplePlayer(this.me) ? toast('A native people has no home port: its trade is with the Europeans who come.') : this.openEurope()),
      l: () => this.toggleOverlay(),
      d: () => this.openDiplomacy(),
      t: () => {
        const u = this.selectedUnit();
        this.openRoutes(u && u.owner === this.viewer && canUseRoutes(u) ? u.id : undefined);
      },
      enter: () => void this.endTurn(),
      escape: () => {
        this.gotoMode = false;
        this.roadToMode = false;
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
