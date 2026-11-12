import {
  AI_LEVEL_INFO,
  calendarOf,
  canFoundColony,
  canImprove,
  canUseRoutes,
  charterCost,
  colonyAt,
  colonyWorkers,
  describeSeed,
  DIFFICULTY,
  councilText,
  CouncilText,
  FATHERS,
  formatDate,
  GOOD_DEFS,
  goodsOf,
  isShip,
  maxMoves,
  nationOf,
  nationTitle,
  nextFatherCost,
  portName,
  rebelShare,
  recruitPrice,
  resolveDifficulty,
  routeStopName,
  score,
  serialize,
  term,
  Term,
  tileAt,
  tileDescription,
  UNIT_TYPES,
  unitName,
  unitPosition,
  unitsAboard,
  unitsAwaitingOrders,
  type GameState,
  type PlayerId,
  type Unit,
  colonyOpenTo,
  FOREIGN_KEEP,
  isPeoplePlayer,
  kindOfId,
  pairAtWar,
  pairPrice,
  sideName,
  townTeaches,
  gridOf,
  settlementName,
  playingPeople,
  type Colony,
  type GoodId,
  type Settlement,
} from '@cc/engine';
import { riverCourse, traceStrand } from '@cc/render-api';
import type { App } from '../app.js';
import { clear, h } from '../dom.js';
import { downloadSave, saveManual } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';
import { shareDialog } from './share.js';
import { townLand } from './town.js';

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
    // A playing people (native-nations.md T1, T22) has no home port, Crown, taxes or immigration.
    const people = isPeoplePlayer(me);

    this.body.append(
      h('div', { class: 'title-row' },
        h('h1', null, 'Casual Colonization'),
        h('span', { class: 'flag', style: `background:${nationOf(app.state, app.viewer).color}`, title: nationOf(app.state, app.viewer).name })),
      h('div', { class: 'stats' },
        h('div', null, h('strong', null, formatDate(s.turn, calendarOf(s))), ' · ', nationTitle(app.state, app.viewer)),
        people
          ? h('div', { title: 'A people’s gold is only what Europeans pay in trade, and buys only their goods.' }, `Gold ${me.gold.toLocaleString()} (from trade)`)
          : h('div', null, `Gold ${me.gold.toLocaleString()} · Tax ${me.tax}%`),
        people ? null : h('div', { class: 'muted' }, `Crosses ${me.crosses}/${me.crossesRequired} · Recruit ${recruitPrice(s, me)}`),
        h('div', { class: 'muted' },
          h('button', { class: 'link', onclick: () => void app.chooseFather() },
            me.currentFather
              ? `${CouncilText(s, me.id, 'councilShort')}: ${FATHERS[me.currentFather].name} ${me.fatherBells}/${nextFatherCost(s, me)}`
              : !Object.values(me.fatherOffer ?? {}).some(Boolean) && me.fathers.length
                ? `${CouncilText(s, me.id, 'councilShort')}: every seat is filled (${me.fathers.length} ${councilText(s, me.id, 'members')})`
                : `${CouncilText(s, me.id, 'councilShort')}: choose a ${councilText(s, me.id, 'member')} (${me.fatherBells} ${councilText(s, me.id, 'product')})`),
          ' · ',
          h('button', { class: 'link', title: `The ${councilText(s, me.id, 'councilShort')} hall (K)`, onclick: () => app.openCongress() }, 'Hall')),
        me.independence === 'declared' ? h('div', null, h('span', { class: 'pill bad' }, `${Term(app.state, 'independenceWar')}`)) : null,
        me.independence === 'won' ? h('div', null, h('span', { class: 'pill good' }, 'Independent')) : null,
        Object.values(me.stance).includes('war') && me.independence !== 'declared' ? h('div', null, h('span', { class: 'pill bad' }, 'At war')) : null,
      ),
    );

    this.body.append(this.unitCard(app.selectedUnit()));

    this.body.append(
      h('div', { class: 'row wrap nav-row' },
        people ? null : h('button', { class: 'btn', onclick: () => app.openEurope(), title: `${Term(app.state, 'homeland')} (E)` }, `${Term(app.state, 'homeland')}`),
        h('button', { class: 'btn', onclick: () => app.openDiplomacy(), title: 'Foreign affairs (D)' }, 'Affairs'),
        h('button', { class: 'btn', onclick: () => app.openRoutes(), title: 'Trade routes (T)' }, 'Routes'),
        h('button', { class: 'btn', onclick: () => app.openProgress(), title: 'Progress graphs (H)' }, 'Progress'),
        h('button', { class: 'btn', onclick: () => app.openReports(), title: 'Advisor reports (A, or F1–F8)' }, 'Reports'),
        h('button', { class: 'btn', onclick: () => app.selectNext(), title: 'Next unit (W)', disabled: !awaiting }, `Next unit${awaiting ? ` (${awaiting})` : ''}`),
        // Claimed land and the land's health on the map (native-nations.md T5, T10), where the game has them.
        s.land || people
          ? h('button', { class: `btn${app.overlay ? ' active' : ''}`, 'aria-pressed': app.overlay ? 'true' : 'false', onclick: () => app.toggleOverlay(), title: 'Show who claims the land and its health (L)' }, app.overlay ? 'Hide land' : 'Land')
          : null,
      ),
      h('button', {
        class: `btn primary end-turn${myTurn && !awaiting ? ' pulse' : ''}`,
        // The panel is rebuilt on refresh; keep the pulse in phase with the clock so it does not restart.
        style: `animation-delay:-${Math.round(performance.now() % 1400)}ms`,
        onclick: () => void app.endTurn(),
        disabled: !myTurn,
        title: 'End turn (Enter)',
      }, app.busy ? 'Computer players moving…' : 'End turn'),
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
    const watch = h('select', { 'aria-label': 'Whose view to show', onchange: (e: Event) => app.setWatch((e.target as HTMLSelectElement).value as PlayerId | 'all') },
      h('option', { value: 'all', selected: app.watch === 'all' || undefined }, 'Everything'),
      rows.map((r) => h('option', { value: r.p.id, selected: app.watch === r.p.id || undefined }, `${nationTitle(app.state, r.p.id)}'s view`)));
    const head = s.config.headStart;
    const speeds = (head ? [[1000, 'Slow'], [500, 'Normal'], [250, 'Fast']] : [[1200, 'Slow'], [400, 'Normal'], [80, 'Fast'], [0, 'Fastest']]) as [number, string][];
    const speed = h('select', { 'aria-label': 'Autoplay speed', onchange: (e: Event) => { app.speed = Number((e.target as HTMLSelectElement).value); if (app.autoplay) app.setAutoplay(true); } },
      speeds.map(([ms, label]) => h('option', { value: ms, selected: app.speed === ms || undefined }, label)));
    const over = s.gameOver;
    const progress = head ? Math.min(100, Math.round((s.turn / head.turn) * 100)) : 0;
    return h('div', { class: 'card observer' },
      h('div', { class: 'title-row' }, h('h1', null, 'Casual Colonization'), h('span', { class: 'pill' }, head ? 'Head start' : 'Observer'), s.cheated ? h('span', { class: 'pill warn', title: 'Cheats have been used in this game' }, 'Cheated') : null),
      h('div', { class: 'stats' }, h('strong', null, formatDate(s.turn, calendarOf(s))), over ? ` · ${over.reason}` : ''),
      head ? h('div', null,
        h('p', { class: 'small' }, `The computer plays ${head.humans.map((n) => nationTitle(app.state, n)).join(' and ')} for you until ${formatDate(head.turn, calendarOf(s))}.`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': progress, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${progress}%` })),
        h('button', { class: 'btn small', onclick: () => void app.takeOver() }, 'Take over now')) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: !!over, onclick: () => app.setAutoplay(!app.autoplay), title: 'Space' }, app.autoplay ? 'Pause' : 'Play'),
        h('button', { class: 'btn', disabled: !!over || app.autoplay || app.busy, onclick: () => void app.observeTurns(1), title: 'Enter' }, '+1 turn'),
        h('button', { class: 'btn', disabled: !!over || app.autoplay || app.busy, onclick: () => void app.observeTurns(10) }, '+10'),
        h('button', { class: 'btn', onclick: () => app.openProgress(), title: 'Progress graphs (H)' }, 'Graphs'),
        h('button', { class: 'btn', onclick: () => app.openReports(), title: 'Advisor reports (A, or F1–F8)' }, 'Reports')),
      h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', null, 'Speed'), speed), h('label', { class: 'field' }, h('span', null, 'Show'), watch)),
      h('table', { class: 'table scoreboard' },
        h('tr', null, h('th', null, 'Nation'), h('th', null, 'Level'), h('th', { title: 'Colonies' }, 'Col'), h('th', { title: 'Colonists' }, 'Pop'), h('th', { title: 'Sons of Liberty' }, 'SoL'), h('th', null, 'Score')),
        rows.map((r) => h('tr', { class: app.watch === r.p.id ? 'watched' : undefined, onclick: () => app.setWatch(app.watch === r.p.id ? 'all' : r.p.id) },
          h('td', null, h('span', { class: 'flag', style: `background:${nationOf(app.state, r.p.id).color}` }), ' ', nationTitle(app.state, r.p.id), r.p.independence === 'declared' ? ' ⚔' : r.p.independence === 'won' ? ' ★' : ''),
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
    const cargo = goodsOf(s).filter((g) => (u.cargo?.[g] ?? 0) > 0);
    const route = u.route && s.routes?.[u.route.id];
    const orders = u.repair ? `Under repair (${u.repair} turns)` : route ? `Trade route: ${route.name}${route.stops.length ? `, next ${routeStopName(s, route.stops[u.route!.stop % route.stops.length], route.owner)}` : ''}` : u.roadTo ? `Building a road to ${u.roadTo.x},${u.roadTo.y}` : u.work ? `Working (${u.work.kind}, ${u.work.turnsLeft} turns)` : u.dest ? ('europe' in u.dest ? (u.dest.port ? `Sailing for ${portName(app.state, u.dest.port)}` : `Sailing for ${term(app.state, 'homeland')}`) : `Going to ${u.dest.x},${u.dest.y}`) : u.state === 'fortified' ? 'Fortified' : u.state === 'sentry' ? 'Sentry' : 'Awaiting orders';
    const mine = u.owner === app.viewer;
    const can = (fn: () => string | null) => mine && app.isMyTurn() && fn() === null;
    const terrain = tile?.f ? 'clear' : 'plow';
    const actions: HTMLElement[] = [];
    const btn = (label: string, key: string, onclick: () => void, enabled = true) =>
      actions.push(h('button', { class: 'btn small', onclick, disabled: !enabled, title: key ? `Shortcut: ${key}` : undefined }, label, key ? h('kbd', null, key) : null));
    if (mine && u.loc.kind === 'map') {
      const peopleUnit = kindOfId(u.owner) === 'people';
      if (def.kind === 'colonist') btn(peopleUnit ? 'Found town' : charterCost(s, u.owner) > 0 ? `Found colony (${charterCost(s, u.owner)} gold)` : 'Found colony', 'B', () => void app.foundColony(), can(() => canFoundColony(s, u)));
      // A people claims unclaimed land next to its own, near its towns (T5).
      if (peopleUnit && pos && tile && tile.claim !== u.owner && !isShip(u)) btn('Claim this land', '', () => { if (app.dispatch({ type: 'claimLand', x: pos.x, y: pos.y })) app.requestRender(); }, mine && app.isMyTurn() && !tile.claim);
      if (u.role === 'pioneer') {
        btn(terrain === 'clear' ? 'Clear forest' : 'Plow', 'P', () => app.improve(), can(() => canImprove(s, u, terrain)));
        btn('Build road', 'R', () => app.buildRoad(), can(() => canImprove(s, u, 'road')));
        btn('Road to…', 'Shift+R', () => app.startRoadTo(), mine && app.isMyTurn() && u.tools > 0);
      }
      btn('Go to…', 'G', () => {
        app.gotoMode = true;
        toast('Click where the unit should go.');
      });
      if (canUseRoutes(u)) btn(u.route ? 'Change route…' : 'Trade route…', 'T', () => app.openRoutes(u.id));
      if (isShip(u) && kindOfId(u.owner) !== 'people') btn(`Sail to ${term(app.state, 'homeland')}`, '', () => app.unitCommand('gotoEurope'));
      if (u.type === 'treasure') btn('Ship treasure home', '', () => { if (app.dispatch({ type: 'cashTreasure', unitId: u.id })) app.afterUnitAction(); });
      if (u.type === 'damagedArtillery') btn('Repair (colony armory)', '', () => { if (app.dispatch({ type: 'repairArtillery', unitId: u.id })) app.afterUnitAction(); });
      btn('Fortify', 'F', () => app.unitCommand('fortify'), !isShip(u));
      btn('Sentry', 'S', () => app.unitCommand('sentry'));
      btn('Skip', 'Space', () => app.unitCommand('skip'));
      if (u.state !== 'active' || u.dest || u.roadTo || u.work || u.route) btn('Clear orders', '', () => app.unitCommand('clearOrders'));
      const colony = pos && colonyAt(s, pos.x, pos.y);
      if (colony && colony.owner === app.viewer) btn(kindOfId(colony.owner) === 'people' ? 'Open town' : 'Open colony', '', () => app.openColony(colony.id));
      btn('Disband', '', () => app.unitCommand('disband'));
    }
    // A carrier in an ally's colony trades with it (open colonies, the engine's alliances).
    const allied = mine && u.loc.kind === 'map' && pos ? colonyAt(s, pos.x, pos.y) : undefined;
    const trade = allied && allied.owner !== app.viewer && colonyOpenTo(s, allied.owner, u.owner) && def.cargo > 0
      ? h('div', { class: 'allied-trade' },
          h('div', { class: 'muted small' }, `Trade with ${allied.name} (${nationOf(s, allied.owner).adjective} ally)`),
          h('div', { class: 'actions' },
            cargo.map((g) => h('button', { class: 'btn small', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'sellInColony', carrierId: u.id, good: g, amount: u.cargo![g]! }) }, `Sell ${GOOD_DEFS[g].name}`)),
            goodsOf(s).filter((g) => allied.goods[g] > FOREIGN_KEEP).map((g) => h('button', { class: 'btn small', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'buyInColony', carrierId: u.id, good: g, amount: 100 }) }, `Buy ${GOOD_DEFS[g].name}`))))
      : null;
    if (mine && u.loc.kind === 'carrier') {
      btn('Wake up', '', () => app.unitCommand('activate'));
    }
    return h(
      'div',
      { class: 'card unit-card' },
      h('div', { class: 'unit-head' },
        icon({ kind: 'unit', type: u.type, role: u.role, color: nationOf(app.state, u.owner).color }, 56, unitName(u)),
        h('div', null,
          h('div', { class: 'unit-name' }, unitName(u)),
          h('div', { class: 'muted' }, `Moves ${movesText(u, s)}${u.role === 'pioneer' ? ` · Tools ${u.tools}` : ''}`),
          h('div', { class: 'muted' }, orders),
          tile ? h('div', { class: 'muted' }, tileDescription(tile)) : null,
          (() => {
            // The land's health where the unit stands (native-nations.md T10).
            const land = pos && townLand(s, pos.x, pos.y);
            return land?.words ? h('div', { class: 'muted small' }, `${land.region}: ${land.words} (${land.health})${land.hard ? ', a hard year' : ''}`) : null;
          })())),
      aboard.length || cargo.length
        ? h('div', { class: 'cargo' },
            aboard.map((p) => h('button', { class: 'chip', title: `Select ${unitName(p)}`, onclick: () => app.select(p.id) }, icon({ kind: 'unit', type: p.type, role: p.role, color: nationOf(app.state, p.owner).color }, 28), unitName(p))),
            cargo.map((g) => h('span', { class: 'chip' }, icon({ kind: 'product', product: g }, 22), `${u.cargo![g]} ${GOOD_DEFS[g].name}`)))
        : null,
      actions.length ? h('div', { class: 'actions' }, actions) : null,
      trade,
      mine && u.loc.kind === 'map' && pos ? this.peopleDealings(u, pos) : null,
    );
  }

  /**
   * What a unit can do beside the other side's towns, colonies and settlements (native-nations.md
   * T10, T11; Beta 3 step 4's commands): a carrier trades for gold between a European nation and a
   * playing people, a people's carrier barters with another people, and a nation's colonist learns
   * at a people's town under a cultural exchange.
   */
  private peopleDealings(u: Unit, pos: { x: number; y: number }): HTMLElement | null {
    const app = this.app;
    const s = app.state;
    const grid = gridOf(s);
    const near = <T extends { x: number; y: number }>(list: T[]) => list.filter((c) => grid.distance(c.x, c.y, pos.x, pos.y) === 1);
    const myKind = kindOfId(u.owner);
    const def = UNIT_TYPES[u.type];
    const rows: HTMLElement[] = [];
    const go = !app.isMyTurn();
    const cargo = goodsOf(s).filter((g) => (u.cargo?.[g] ?? 0) > 0);
    const name = (g: GoodId) => GOOD_DEFS[g].name.toLowerCase();
    if (def.cargo > 0) {
      for (const c of near(Object.values(s.colonies)) as Colony[]) {
        const other = c.owner;
        // Trade for gold: a European nation and a playing people, either side's carrier.
        if ((myKind === 'people') !== (kindOfId(other) === 'people') && (myKind === 'people' || playingPeople(s, other))) {
          if (pairAtWar(s, u.owner, other)) continue;
          const sell = cargo.map((g) => h('button', { class: 'btn small', disabled: go, title: `${Math.round(pairPrice(s, u.owner, other, g, u.owner) * 10) / 10} gold a unit`, onclick: () => app.dispatch({ type: 'tradeWithPeople', unitId: u.id, colonyId: c.id, good: g, amount: u.cargo![g]!, load: false }) }, `Sell ${name(g)}`));
          const buy = goodsOf(s).filter((g) => c.goods[g] > 0).map((g) => h('button', { class: 'btn small', disabled: go, title: `${Math.round(pairPrice(s, other, u.owner, g, u.owner) * 10) / 10} gold a unit`, onclick: () => app.dispatch({ type: 'tradeWithPeople', unitId: u.id, colonyId: c.id, good: g, amount: 100, load: true }) }, `Buy ${name(g)}`));
          if (sell.length || buy.length) rows.push(h('div', { class: 'allied-trade' }, h('div', { class: 'muted small' }, `Trade at ${c.name} (${sideName(s, other)})`), h('div', { class: 'actions' }, sell, buy)));
        } else if (myKind === 'people' && kindOfId(other) === 'people' && other !== u.owner) {
          rows.push(this.barterRow(u, { colonyId: c.id }, c.name, c.goods, other));
        }
      }
      if (myKind === 'people') {
        for (const st of near(Object.values(s.settlements)) as Settlement[]) rows.push(this.barterRow(u, { settlementId: st.id }, settlementName(s, st), st.goods ?? {}, st.tribe));
      }
    }
    // Learning at a people's town under a cultural exchange (T11).
    if (myKind !== 'people' && def.kind === 'colonist' && def.skill === 0 && u.role === 'none') {
      for (const c of near(Object.values(s.colonies)) as Colony[]) {
        if (kindOfId(c.owner) !== 'people') continue;
        const skill = townTeaches(s, c, u.owner);
        if (skill) rows.push(h('div', { class: 'allied-trade' }, h('button', { class: 'btn small', disabled: go || u.moves <= 0, onclick: () => app.dispatch({ type: 'learnAtTown', unitId: u.id, colonyId: c.id }) && app.afterUnitAction() }, `Learn at ${c.name} (${UNIT_TYPES[skill].name.toLowerCase()})`)));
      }
    }
    return rows.length ? h('div', null, rows) : null;
  }

  /** Barter between peoples (T11): goods aboard for goods of the same worth the other side can spare. */
  private barterRow(u: Unit, at: { colonyId?: string; settlementId?: string }, where: string, stock: Partial<Record<GoodId, number>>, other: string): HTMLElement {
    const app = this.app;
    const s = app.state;
    const cargo = goodsOf(s).filter((g) => (u.cargo?.[g] ?? 0) > 0);
    const wanted = goodsOf(s).filter((g) => (stock[g] ?? 0) > 0);
    const buttons = cargo.flatMap((give) => wanted.filter((take) => take !== give).map((take) =>
      h('button', { class: 'btn small', disabled: !app.isMyTurn() || pairAtWar(s, u.owner, other as never), onclick: () => app.dispatch({ type: 'barter', unitId: u.id, ...at, give, amount: u.cargo![give]!, take }) },
        `${GOOD_DEFS[give].name} for ${GOOD_DEFS[take].name.toLowerCase()}`)));
    return h('div', { class: 'allied-trade' },
      h('div', { class: 'muted small' }, `Barter at ${where}${buttons.length ? '' : ': bring goods to give, and they must have goods to spare'}`),
      buttons.length ? h('div', { class: 'actions' }, buttons) : null);
  }

  private reports(): HTMLElement {
    const app = this.app;
    const s = app.state;
    const mine = s.messages.filter((m) => (!m.to || m.to === app.viewer) && m.turn >= s.turn - 1).slice(-12).reverse();
    const details = h('details', { class: 'card reports', open: this.reportsOpen || undefined },
      h('summary', null, `News (${mine.length})`),
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
        app.observer ? null : h('button', { class: 'btn small', disabled: !app.isMyTurn() || !!app.state.gameOver, title: 'End the game now with your current score', onclick: () => void app.retire() }, 'Retire…'),
        h('button', { class: 'btn small', onclick: () => app.openReports(), title: 'Advisor reports (A, or F1–F8)' }, 'Reports…'),
        h('button', { class: 'btn small', onclick: () => app.openCheats(), title: 'Cheats for testing (Ctrl+Shift+C)' }, 'Cheats…')),
      this.difficultyLine(),
      this.seedLine(),
      this.eventSwitches(),
      app.state.cheated ? h('p', null, h('span', { class: 'pill warn' }, 'Cheats used')) : null,
      h('p', { class: 'muted small' }, `Arrows / numpad move · B found colony · P plow · R road · F fortify · G go to · E ${term(app.state, 'homeland')} · D foreign affairs · H progress graphs · A or F1–F8 reports · T trade routes · Enter end turn · Right-click or Shift-click to send a unit.`));
    details.addEventListener('toggle', () => (this.menuOpen = details.open));
    return details;
  }

  /** Switches for historical and random events; each change is a `setEvents` command, so it replays. */
  private eventSwitches(): HTMLElement {
    const app = this.app;
    const cfg = app.state.config;
    const toggle = (label: string, note: string, on: boolean, cmd: (on: boolean) => { historical?: boolean; random?: boolean }) =>
      h('label', { class: 'check small', title: note },
        h('input', { type: 'checkbox', checked: on || undefined, onchange: (e: Event) => { app.dispatch({ type: 'setEvents', ...cmd((e.target as HTMLInputElement).checked) }); app.requestRender(); } }),
        ' ', label);
    return h('div', { class: 'row wrap event-switches' },
      toggle('Historical events', `Dated events from the period: wars in ${term(app.state, 'homeland')}, the Great Frost, famous voyages, financial bubbles.`, !!cfg.historicalEvents, (on) => ({ historical: on })),
      toggle('Random events', 'Storms, fires, bumper harvests, gold fever, pirates and other surprises.', !!cfg.randomEvents, (on) => ({ random: on })));
  }

  /** The seed (with its phrase) and a button that copies a game code for sharing. */
  private seedLine(): HTMLElement {
    const config = this.app.state.config;
    return h('p', { class: 'small seed-line' },
      'Seed: ', h('strong', { id: 'game-seed-shown' }, describeSeed(config)), ' ',
      h('button', { class: 'btn small', title: 'A QR code, link and short code that open the New game screen with this game\'s seed and choices filled in.', onclick: () => void shareDialog(this.app.state.config) }, 'Share game…'));
  }

  private difficultyLine(): HTMLElement {
    const level = DIFFICULTY[resolveDifficulty(this.app.state.difficulty)];
    return h('p', { class: 'small', title: level.description }, 'Difficulty: ', h('strong', null, level.name));
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
      for (const st of riverCourse(s, i % s.map.width, Math.floor(i / s.map.width)).strands) traceStrand(ctx, st, cx, cy, scale, true);
      ctx.stroke();
    }
    for (const col of Object.values(s.colonies)) {
      if (!this.app.knows(col.y * s.map.width + col.x)) continue;
      ctx.fillStyle = nationOf(this.app.state, col.owner).color;
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
