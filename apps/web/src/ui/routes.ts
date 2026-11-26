import {
  canUseRoutes,
  describeStop,
  EUROPE_STOP,
  foreignStopColonies,
  GOOD_DEFS,
  goodsOf,
  isCoastal,
  isForeignStop,
  isSettlementStop,
  isShip,
  MAX_ROUTE_STOPS,
  nationOf,
  partnerSettlements,
  peopleTreatyOn,
  portName,
  portOf,
  portsFor,
  portSummary,
  ROUTE_NAME_MAX,
  routeProblem,
  routesOf,
  routeStopName,
  routeUnits,
  settlementName,
  stopPort,
  term,
  Term,
  peopleName,
  unitName,
  unitPosition,
  type GoodId,
  type RouteCargo,
  type RouteStop,
  type TradeRoute,
  type Unit,
} from '@cc/engine';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { icon } from '../styles.js';
import { confirmDialog } from './dialogs.js';

/** Where a unit on a route is: its position, or Europe / at sea. */
function whereIs(app: App, u: Unit): string {
  const s = app.state;
  if (u.loc.kind === 'europe') return portOf(u) === u.owner ? `in ${term(app.state, 'homeland')}` : `in ${portName(app.state, portOf(u))}`;
  if (u.loc.kind === 'sailing') return u.loc.to === 'europe' ? `sailing to ${term(app.state, 'homeland')}` : `sailing to ${term(app.state, 'colonyLand')}`;
  const pos = unitPosition(s, u);
  const colony = pos && Object.values(s.colonies).find((c) => c.x === pos.x && c.y === pos.y);
  return colony ? `in ${colony.name}` : pos ? `at ${pos.x},${pos.y}` : '';
}

/** Trade routes: list, create, edit stops and cargo, assign ships and wagon trains. */
export class RoutesScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private routeId?: string;

  /** `unitId`: a ship or wagon train to assign, when opened from the unit panel. */
  constructor(private app: App, private unitId?: string) {
    this.body = h('div', { class: 'screen-body' });
    this.el = h('section', { class: 'screen routes-screen', role: 'dialog', 'aria-label': 'Trade routes' }, this.body);
    const u = unitId ? app.state.units[unitId] : undefined;
    this.routeId = u?.route?.id;
  }

  private get mine(): TradeRoute[] {
    return routesOf(this.app.state, this.app.viewer);
  }

  refresh(): void {
    const app = this.app;
    const routes = this.mine;
    if (this.routeId && !routes.some((r) => r.id === this.routeId)) this.routeId = undefined;
    if (!this.routeId) this.routeId = routes[0]?.id;
    const route = routes.find((r) => r.id === this.routeId);
    const unit = this.unitId ? app.state.units[this.unitId] : undefined;
    clear(this.body);
    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, 'Trade routes'),
        unit ? h('span', { class: 'muted' }, `For ${unitName(unit)}${unit.route ? `, now on ${app.state.routes?.[unit.route.id]?.name ?? 'a route'}` : ''}`) : null,
        h('button', { class: 'btn close', onclick: () => app.closeScreen(), 'aria-label': 'Close trade routes' }, 'Close')),
      h('div', { class: 'routes-grid' }, this.list(routes, unit), route ? this.editor(route, unit) : this.help()),
    );
  }

  private list(routes: TradeRoute[], unit: Unit | undefined): HTMLElement {
    const s = this.app.state;
    return h('div', { class: 'card route-list' },
      h('h3', null, 'Your routes'),
      routes.length
        ? h('ul', { class: 'route-items' }, routes.map((r) => {
            const units = routeUnits(s, r.id);
            const problem = unit ? routeProblem(s, unit, r) : null;
            return h('li', { class: r.id === this.routeId ? 'selected' : undefined },
              h('button', { class: 'link route-name', onclick: () => this.pick(r.id) }, r.name),
              h('div', { class: 'muted small' }, r.stops.map((st) => routeStopName(s, st, r.owner)).join(' → ') || 'No stops yet'),
              h('div', { class: 'muted small' }, units.length ? `${units.length} unit${units.length > 1 ? 's' : ''}: ${units.map(unitName).join(', ')}` : 'No units assigned'),
              unit && unit.route?.id !== r.id
                ? h('button', { class: 'btn tiny', disabled: !!problem || !this.app.isMyTurn(), title: problem ?? undefined, onclick: () => this.assign(unit.id, r.id) }, `Assign ${unitName(unit)}`)
                : null);
          }))
        : h('p', { class: 'muted small' }, 'No trade routes yet.'),
      h('button', { class: 'btn small primary', disabled: !this.app.isMyTurn(), onclick: () => this.create() }, 'New route'));
  }

  private help(): HTMLElement {
    return h('div', { class: 'card' },
      h('h3', null, 'How trade routes work'),
      h('p', { class: 'small' }, `A route is a round trip of stops: your colonies, and ${term(this.app.state, 'homeland')} for ships. At each stop a ship or wagon train first unloads, then loads, the goods you choose. Units on a route move by themselves at the start of each of your turns and never wait for orders.`),
      h('p', { class: 'small' }, `Goods unloaded in ${term(this.app.state, 'homeland')} are sold at market prices, less tax; boycotted goods stay aboard. A ${term(this.app.state, 'homeland')} stop can call at a Favoured Nation partner’s port instead of your own, at its prices and tax. Unloading in a colony stops when its warehouse is full, so nothing spoils.`),
      h('p', { class: 'small' }, 'With a trade agreement (Foreign Affairs), a route can also call at the other nation’s colonies, marked with its flag. The ship or wagon train stops next to the colony: unloading sells goods to it at its nation’s home-market prices, as far as its warehouse has room and its treasury can pay; loading buys what it has above 50 of each good.'),
      peopleTreatyOn(this.app.state) ? h('p', { class: 'small' }, 'With a trade treaty with a native people (Foreign Affairs), a route can call at its settlements too: the unit stops next to the settlement and sells one good and buys one, as a wagon train trading there does.') : null);
  }

  private editor(route: TradeRoute, unit: Unit | undefined): HTMLElement {
    const s = this.app.state;
    const my = this.app.isMyTurn();
    const name = h('input', { type: 'text', value: route.name, maxlength: ROUTE_NAME_MAX, 'aria-label': 'Route name', disabled: !my,
      onchange: (e: Event) => this.edit(route, { name: (e.target as HTMLInputElement).value }) }) as HTMLInputElement;
    const units = routeUnits(s, route.id);
    const colonies = Object.values(s.colonies).filter((c) => c.owner === this.app.viewer).sort((a, b) => a.name.localeCompare(b.name));
    const foreign = foreignStopColonies(s, this.app.viewer).sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name));
    // Settlements of peoples with a trade treaty (native-partners.md N4), by people.
    const partners = partnerSettlements(s, this.app.viewer);
    const free = Object.values(s.units).filter((u) => u.owner === this.app.viewer && canUseRoutes(u) && u.route?.id !== route.id && (u.loc.kind === 'map' || u.loc.kind === 'europe' || u.loc.kind === 'sailing'));
    return h('div', { class: 'card route-editor' },
      h('div', { class: 'row wrap' },
        h('label', { class: 'field grow' }, h('span', null, 'Name'), name),
        h('button', { class: 'btn small', disabled: !my, onclick: () => void this.remove(route) }, 'Delete route')),
      h('h3', null, 'Stops'),
      h('ol', { class: 'stops' }, route.stops.map((stop, i) => this.stopRow(route, stop, i))),
      h('div', { class: 'row wrap' },
        h('select', { 'aria-label': 'Add a stop', disabled: !my || route.stops.length >= MAX_ROUTE_STOPS, onchange: (e: Event) => {
          const at = (e.target as HTMLSelectElement).value;
          if (at) this.setStops(route, [...route.stops, { at, load: [], unload: [] }]);
        } },
          h('option', { value: '' }, route.stops.length >= MAX_ROUTE_STOPS ? 'No more stops' : 'Add a stop…'),
          colonies.map((c) => h('option', { value: c.id }, `${c.name}${isCoastal(s, c.x, c.y) ? '' : ' (inland)'}`)),
          h('option', { value: EUROPE_STOP }, `${Term(this.app.state, 'homeland')} (ships only)`),
          [...new Set(foreign.map((c) => c.owner))].map((owner) => h('optgroup', { label: `${nationOf(this.app.state, owner).adjective} colonies (trade agreement)` },
            foreign.filter((c) => c.owner === owner).map((c) => h('option', { value: c.id }, `⚑ ${c.name} (${nationOf(this.app.state, owner).adjective})${isCoastal(s, c.x, c.y) ? '' : ' (inland)'}`)))),
          [...new Set(partners.map((st) => st.tribe))].map((people) => h('optgroup', { label: `${peopleName(s, people)} settlements (trade treaty)` },
            partners.filter((st) => st.tribe === people).map((st) => h('option', { value: st.id }, `${settlementName(s, st)}${isCoastal(s, st.x, st.y) ? '' : ' (inland)'}`)))))),
      h('h3', null, 'Units on this route'),
      units.length
        ? h('ul', { class: 'route-units' }, units.map((u) => h('li', null,
            icon({ kind: 'unit', type: u.type, role: u.role, color: nationOf(this.app.state, u.owner).color }, 28),
            h('button', { class: 'link', onclick: () => this.show(u) }, unitName(u)),
            h('span', { class: 'muted small' }, ` ${whereIs(this.app, u)}, next: ${route.stops.length ? routeStopName(s, route.stops[u.route!.stop % route.stops.length], route.owner) : '—'}`),
            h('button', { class: 'btn tiny', disabled: !my, onclick: () => this.app.dispatch({ type: 'unassignRoute', unitId: u.id }) }, 'Take off'))))
        : h('p', { class: 'muted small' }, route.stops.length < 2 ? 'Add at least two stops, then assign a ship or wagon train.' : 'No units follow this route yet.'),
      free.length ? h('div', { class: 'row wrap assign' },
        h('span', { class: 'muted small' }, 'Assign:'),
        free.map((u) => {
          const problem = routeProblem(s, u, route);
          return h('button', { class: `chip${u.id === unit?.id ? ' selected' : ''}`, disabled: !!problem || !my, title: problem ?? `Put ${unitName(u)} on this route`, onclick: () => this.assign(u.id, route.id) },
            icon({ kind: 'unit', type: u.type, role: u.role, color: nationOf(this.app.state, u.owner).color }, 24), `${unitName(u)}${u.route ? ' (on another route)' : ''}`);
        })) : null);
  }

  private stopRow(route: TradeRoute, stop: RouteStop, i: number): HTMLElement {
    const s = this.app.state;
    const my = this.app.isMyTurn();
    const europe = stop.at === EUROPE_STOP;
    const move = (d: number) => {
      const stops = [...route.stops];
      const j = i + d;
      if (j < 0 || j >= stops.length) return;
      [stops[i], stops[j]] = [stops[j], stops[i]];
      this.setStops(route, stops);
    };
    const update = (change: Partial<RouteStop>) => this.setStops(route, route.stops.map((st, k) => (k === i ? { ...st, ...change } : st)));
    const settlement = isSettlementStop(s, stop) ? s.settlements[stop.at] : undefined;
    const foreign = isForeignStop(s, stop, route.owner) || !!settlement;
    const owner = foreign && !settlement ? s.colonies[stop.at].owner : undefined;
    return h('li', { class: `stop${foreign ? ' foreign' : ''}` },
      h('div', { class: 'stop-head' },
        h('strong', null, owner ? h('span', { class: 'foreign-flag', style: `background:${nationOf(this.app.state, owner).color}`, title: `${nationOf(this.app.state, owner).adjective} colony` }) : null, routeStopName(s, stop, route.owner)),
        h('span', { class: 'muted small' }, describeStop(stop)),
        h('span', { class: 'stop-tools' },
          h('button', { class: 'btn tiny', disabled: !my || i === 0, 'aria-label': 'Move stop up', onclick: () => move(-1) }, '↑'),
          h('button', { class: 'btn tiny', disabled: !my || i === route.stops.length - 1, 'aria-label': 'Move stop down', onclick: () => move(1) }, '↓'),
          h('button', { class: 'btn tiny', disabled: !my, 'aria-label': 'Remove stop', onclick: () => this.setStops(route, route.stops.filter((_, k) => k !== i)) }, '✕'))),
      settlement
        ? h('div', { class: 'muted small' }, `Trading stop (trade treaty with the ${peopleName(s, settlement.tribe)}): as a wagon train does there, one good is sold (the listed one they pay most for, up to 100) and one bought (the listed one they have most of), at the treaty's prices. The deal ends the unit's moves for the turn.`)
        : foreign ? h('div', { class: 'muted small' }, `Trading stop: goods unloaded are sold to the colony, goods loaded are bought from it, at ${nationOf(this.app.state, owner!).adjective} prices.`) : null,
      europe ? this.portPicker(route, stop, (port) => update({ port })) : null,
      this.cargoRules(foreign ? 'Sell' : 'Unload', stop.unload, europe ? null : 'up to', europe ? 'sold' : 'fill', (unload) => update({ unload })),
      this.cargoRules(foreign ? 'Buy' : 'Load', stop.load, europe ? 'buy to' : 'keep', europe ? '100' : foreign ? '50' : '0', (load) => update({ load })),
      europe ? h('label', { class: 'small passengers' },
        h('input', { type: 'checkbox', checked: !!stop.passengers, disabled: !my, onchange: (e: Event) => update({ passengers: (e.target as HTMLInputElement).checked || undefined }) }),
        ' Take colonists waiting on the docks (they go ashore at the next colony; home port only)') : null);
  }

  /** For a Europe stop: the home port it calls at, the route owner's own or a Favoured Nation partner's. */
  private portPicker(route: TradeRoute, stop: RouteStop, set: (port: RouteStop['port']) => void): HTMLElement {
    const s = this.app.state;
    const owner = route.owner;
    const ports = portsFor(s, owner);
    const current = stopPort(s, owner, stop);
    return h('div', { class: 'small route-port' },
      h('label', null, 'Port ',
        h('select', { 'aria-label': `Port in ${term(this.app.state, 'homeland')}`, disabled: !this.app.isMyTurn() || ports.length < 2, onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value as RouteStop['port'];
          set(v === owner ? undefined : v);
        } }, ports.map((port) => h('option', { value: port, selected: port === current }, `${portName(this.app.state, port)}${port === owner ? ' (home)' : ` (${nationOf(this.app.state, port).adjective}, Favoured Nation)`}`)))),
      h('span', { class: 'muted' }, ` ${portSummary(current, goodsOf(s))}.${current !== owner ? ` Sold and bought at ${nationOf(this.app.state, current).adjective} prices and tax; colonists board only at home. If the partnership ends, the stop falls back to ${portName(this.app.state, owner)}.` : ''}`));
  }

  /** One list of cargo rules with an amount each, and a picker to add more. */
  private cargoRules(label: string, rules: RouteCargo[], amountLabel: string | null, placeholder: string, set: (rules: RouteCargo[]) => void): HTMLElement {
    const my = this.app.isMyTurn();
    const used = new Set(rules.map((r) => r.good));
    const titles: Record<string, string> = {
      keep: 'Units left in the colony warehouse (empty: load everything)',
      'up to': 'Fill the colony warehouse up to this amount (empty: up to its capacity)',
      'buy to': `Buy in ${term(this.app.state, 'homeland')} until this many are aboard (empty: 100)`,
    };
    return h('div', { class: 'cargo-rules' },
      h('span', { class: 'muted small rule-label' }, label),
      rules.map((r, k) => h('span', { class: 'chip rule' },
        icon({ kind: 'product', product: r.good }, 20, GOOD_DEFS[r.good].name),
        GOOD_DEFS[r.good].name,
        amountLabel ? h('label', { class: 'rule-amount', title: titles[amountLabel] },
          h('span', { class: 'muted small' }, amountLabel),
          h('input', { type: 'number', min: 0, max: 10000, step: 10, value: r.amount ?? '', placeholder, disabled: !my, 'aria-label': `${label} ${GOOD_DEFS[r.good].name}: ${amountLabel}`,
            onchange: (e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              set(rules.map((o, j) => (j === k ? (v === '' ? { good: o.good } : { good: o.good, amount: Math.max(0, Math.floor(Number(v))) }) : o)));
            } })) : null,
        h('button', { class: 'btn tiny', disabled: !my, 'aria-label': `Stop ${label.toLowerCase()}ing ${GOOD_DEFS[r.good].name}`, onclick: () => set(rules.filter((_, j) => j !== k)) }, '✕'))),
      h('select', { 'aria-label': `${label} a good`, disabled: !my || used.size === goodsOf(this.app.state).length, onchange: (e: Event) => {
        const g = (e.target as HTMLSelectElement).value as GoodId;
        if (g) set([...rules, { good: g }]);
      } },
        h('option', { value: '' }, '+ good'),
        goodsOf(this.app.state).filter((g) => !used.has(g)).map((g) => h('option', { value: g }, GOOD_DEFS[g].name))));
  }

  private pick(routeId: string): void {
    this.routeId = routeId;
    this.app.requestRender();
  }

  private show(u: Unit): void {
    const pos = unitPosition(this.app.state, u);
    this.app.closeScreen();
    this.app.select(u.id);
    if (pos) this.app.centerOn(pos.x, pos.y);
  }

  private create(): void {
    const s = this.app.state;
    const unit = this.unitId ? s.units[this.unitId] : undefined;
    const n = this.mine.length + 1;
    // Start from where the unit is, so a new route is quick to finish.
    const pos = unit && unitPosition(s, unit);
    const here = pos && Object.values(s.colonies).find((c) => c.x === pos.x && c.y === pos.y && c.owner === this.app.viewer);
    const stops: RouteStop[] = here ? [{ at: here.id, load: [], unload: [] }] : [];
    if (unit && isShip(unit) && here) stops.push({ at: EUROPE_STOP, load: [], unload: [] });
    const result = this.app.game.dispatch({ type: 'createRoute', name: here ? `${here.name} route` : `Route ${n}`, stops });
    if (!result.ok) return void this.app.dispatch({ type: 'createRoute', name: `Route ${n}`, stops: [] });
    this.routeId = result.id;
    this.app.requestRender();
  }

  private edit(route: TradeRoute, changes: { name?: string; stops?: RouteStop[] }): void {
    this.app.dispatch({ type: 'editRoute', routeId: route.id, ...changes });
  }

  private setStops(route: TradeRoute, stops: RouteStop[]): void {
    this.edit(route, { stops });
  }

  private assign(unitId: string, routeId: string): void {
    this.routeId = routeId;
    this.app.dispatch({ type: 'assignRoute', unitId, routeId });
  }

  private async remove(route: TradeRoute): Promise<void> {
    const units = routeUnits(this.app.state, route.id).length;
    const ok = await confirmDialog('Delete route?', `Delete the ${route.name} route?${units ? ` Its ${units} unit${units > 1 ? 's' : ''} will wait for orders.` : ''}`, 'Delete', 'Keep');
    if (ok) this.app.dispatch({ type: 'deleteRoute', routeId: route.id });
  }
}
