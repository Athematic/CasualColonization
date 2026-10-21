import {
  arrears,
  buyableInPartnerPort,
  buyPrice,
  player,
  portName,
  portOf,
  portsFor,
  cargoFree,
  GOOD_DEFS,
  GOODS,
  isShip,
  NATIONS,
  PURCHASABLE,
  recruitPrice,
  trainPrice,
  ROLES,
  sellPrice,
  TRAINABLE,
  unitName,
  unitsAboard,
  UNIT_TYPES,
  type GoodId,
  type NationId,
  type Player,
  type RoleId,
  type Unit,
} from '@cc/engine';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { icon } from '../styles.js';

export class EuropeScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private ship?: string;
  private selected?: string;
  private tab: 'recruit' | 'train' | 'purchase' = 'recruit';

  /** The home port on view: the viewer's own, or a Favoured Nation partner's where it has ships. */
  constructor(private app: App, private port?: NationId) {
    this.body = h('div', { class: 'screen-body' });
    this.el = h('section', { class: 'screen europe-screen', role: 'dialog', 'aria-label': 'Europe' }, this.body);
  }

  private dispatch(cmd: Parameters<App['dispatch']>[0]): boolean {
    return this.app.dispatch(cmd);
  }

  refresh(): void {
    const s = this.app.state;
    const me = this.app.me;
    const mine = Object.values(s.units).filter((u) => u.owner === this.app.viewer);
    const viewer = this.app.viewer;
    // Ports to view: home, and partners' ports where the viewer has ships.
    const visited = new Set(mine.filter((u) => u.loc.kind === 'europe' && isShip(u)).map(portOf));
    const views = portsFor(s, viewer).filter((p) => p === viewer || visited.has(p));
    // Opening Europe with no ship at home but ships in a partner's port shows that port first.
    const homeShips = mine.some((u) => u.loc.kind === 'europe' && isShip(u) && portOf(u) === viewer);
    if (!this.port) this.port = homeShips ? viewer : views.find((p) => p !== viewer) ?? viewer;
    if (!views.includes(this.port)) this.port = viewer;
    const port = this.port;
    const home = port === viewer;
    const host = player(s, port);
    const ships = mine.filter((u) => u.loc.kind === 'europe' && isShip(u) && portOf(u) === port);
    const docks = home ? mine.filter((u) => u.loc.kind === 'europe' && !isShip(u)) : [];
    const sailing = mine.filter((u) => u.loc.kind === 'sailing');
    if (!this.ship || !ships.some((x) => x.id === this.ship)) this.ship = ships[0]?.id;
    if (this.selected && !s.units[this.selected]) this.selected = undefined;
    const ship = this.ship ? s.units[this.ship] : undefined;

    clear(this.body);
    if (me.independence !== 'none') {
      this.body.append(
        h('header', { class: 'screen-head' },
          h('h2', null, 'Europe'),
          h('button', { class: 'btn close', onclick: () => this.app.closeScreen(), 'aria-label': 'Close Europe' }, 'Close')),
        h('p', null, me.independence === 'won' ? 'As an independent nation you trade on your own terms; European ports are not part of this alpha yet.' : 'Europe has closed its ports to the rebellious colonies.'));
      return;
    }
    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, `Europe — Port of ${portName(port)}`),
        h('span', { class: 'muted' }, home
          ? `Gold ${me.gold.toLocaleString()} · Tax ${me.tax}% · ${NATIONS[viewer].bonus}`
          : `${NATIONS[port].adjective} home port (Favoured Nation) · Gold ${me.gold.toLocaleString()} · ${NATIONS[port].adjective} tax ${host.tax}%`),
        me.pendingTax ? h('button', { class: 'btn small', onclick: () => void this.app.answerPending() }, 'Answer the tax raise') : null,
        h('button', { class: 'btn close', onclick: () => this.app.closeScreen(), 'aria-label': 'Close Europe' }, 'Close')),
      views.length > 1 ? h('div', { class: 'port-tabs', role: 'tablist', 'aria-label': 'Ports' }, views.map((p) =>
        h('button', { class: `tab${p === port ? ' active' : ''}`, role: 'tab', 'aria-selected': String(p === port), onclick: () => { this.port = p; this.ship = undefined; this.selected = undefined; this.app.requestRender(); } },
          h('span', { class: 'foreign-flag', style: `background:${NATIONS[p].color}` }), portName(p), p === viewer ? ' (home)' : ''))) : '',
      h('div', { class: 'europe-grid' },
        this.market(ship, host),
        h('div', { class: 'card' },
          h('h3', null, 'Ships in port'),
          ships.length ? ships.map((x) => this.shipCard(x)) : h('p', { class: 'muted small' }, 'No ships in port. Send a ship out onto the high seas and choose “Sail to Europe”.'),
          sailing.length ? h('h3', null, 'At sea') : null,
          sailing.map((x) => h('div', { class: 'muted small' }, `${unitName(x)} — ${x.loc.kind === 'sailing' ? `${x.loc.to === 'europe' ? `to ${portName(portOf(x))}` : 'to the New World'}, ${x.loc.turnsLeft} turn${x.loc.turnsLeft === 1 ? '' : 's'}` : ''}`)),
          home ? h('h3', null, 'On the docks') : null,
          home ? (docks.length ? h('div', { class: 'chips' }, docks.map((u) => this.unitChip(u))) : h('p', { class: 'muted small' }, 'Nobody is waiting on the docks.')) : h('p', { class: 'muted small' }, 'Colonists are recruited, trained and go ashore only in your own home port. Here you can trade and buy merchant ships.'),
          this.selectedActions(ship)),
        home ? this.recruitPanel() : this.partnerShipyard(host)),
    );
  }

  /** The market of the port on view: `host` is the port's nation. */
  private market(ship: Unit | undefined, host: Player): HTMLElement {
    const me = this.app.me;
    const home = host.id === me.id;
    return h('div', { class: 'card market' },
      h('h3', null, ship ? `Market — buying for ${unitName(ship)}` : 'Market'),
      h('div', { class: 'goods market-goods' }, GOODS.map((g) => {
        const carried = ship?.cargo?.[g] ?? 0;
        if (home && me.boycotts[g]) {
          const owed = arrears(me, g);
          return h('div', { class: 'good market-good boycott', title: `${GOOD_DEFS[g].name} is boycotted` },
            icon({ kind: 'product', product: g }, 30, GOOD_DEFS[g].name),
            h('span', { class: 'price' }, 'Boycott'),
            h('button', { class: 'btn tiny', disabled: me.gold < owed, title: `Pay ${owed} gold in arrears to trade ${GOOD_DEFS[g].name.toLowerCase()} again`, onclick: () => this.dispatch({ type: 'payArrears', good: g }) }, `Pay ${owed}`));
        }
        return h('div', { class: 'good market-good' },
          icon({ kind: 'product', product: g }, 30, GOOD_DEFS[g].name),
          h('span', { class: 'price' }, `${sellPrice(host, g)}/${buyPrice(host, g)}`),
          h('div', { class: 'row' },
            h('button', { class: 'btn tiny', disabled: !ship || cargoFree(this.app.state, ship) <= 0 && carried % 100 === 0, title: `Buy 100 ${GOOD_DEFS[g].name.toLowerCase()} for ${buyPrice(host, g) * 100}`, onclick: () => this.buy(g) }, 'Buy'),
            h('button', { class: 'btn tiny', disabled: !carried, title: `Sell ${carried}`, onclick: () => this.dispatch({ type: 'sellGoods', carrierId: ship!.id, good: g, amount: carried }) }, 'Sell')));
      })),
      h('p', { class: 'muted small' }, home
        ? 'Prices are sell/buy per unit. Selling a lot lowers the price; taxes are taken from every sale.'
        : `${NATIONS[host.id].adjective} prices, sell/buy per unit, and the ${NATIONS[host.id].adjective} tax rate. Boycotts do not apply here. Selling a lot lowers the price in this market.`));
  }

  /** In a Favoured Nation partner's port: merchant ships at its prices (no warships, artillery or colonists). */
  private partnerShipyard(host: Player): HTMLElement {
    const list = PURCHASABLE.filter(buyableInPartnerPort);
    return h('div', { class: 'card recruit' },
      h('h3', null, `Shipyard of ${portName(host.id)}`),
      h('div', { class: 'offers' }, list.map((type) => this.offer(type, trainPrice(host, type), () => this.dispatch({ type: 'train', unitType: type, port: host.id })))),
      h('p', { class: 'muted small' }, 'Merchant ships only: warships and artillery are not sold to foreigners. A ship bought here starts in this port.'));
  }

  private buy(g: GoodId): void {
    if (!this.ship) return;
    this.dispatch({ type: 'buyGoods', carrierId: this.ship, good: g, amount: 100 });
  }

  private shipCard(ship: Unit): HTMLElement {
    const s = this.app.state;
    const active = ship.id === this.ship;
    return h('div', { class: `carrier${active ? ' selected' : ''}` },
      h('button', { class: 'chip', onclick: () => { this.ship = ship.id; this.app.requestRender(); } },
        icon({ kind: 'unit', type: ship.type, role: 'none', nation: ship.owner }, 40), `${unitName(ship)} (${ship.repair ? `repairing, ${ship.repair} turns` : `${cargoFree(s, ship)} free`})`),
      h('div', { class: 'chips' },
        unitsAboard(s, ship).map((u) => this.unitChip(u)),
        GOODS.filter((g) => (ship.cargo?.[g] ?? 0) > 0).map((g) => h('span', { class: 'chip' }, icon({ kind: 'product', product: g }, 22), ship.cargo![g]))),
      h('button', { class: 'btn small primary', disabled: !!ship.repair, onclick: () => this.dispatch({ type: 'sailToAmerica', unitId: ship.id }) }, 'Sail to the New World'));
  }

  private unitChip(u: Unit): HTMLElement {
    return h('button', { class: `chip${u.id === this.selected ? ' selected' : ''}`, onclick: () => { this.selected = this.selected === u.id ? undefined : u.id; this.app.requestRender(); } },
      icon({ kind: 'unit', type: u.type, role: u.role, nation: u.owner }, 32), unitName(u));
  }

  private selectedActions(ship: Unit | undefined): HTMLElement | null {
    const u = this.selected ? this.app.state.units[this.selected] : undefined;
    if (!u) return null;
    const actions: HTMLElement[] = [];
    if (u.loc.kind === 'europe' && ship && portOf(ship) === u.owner) actions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'board', unitId: u.id, carrierId: ship.id }) }, `Board ${unitName(ship)}`));
    if (u.loc.kind === 'carrier' && ship && portOf(ship) === u.owner) actions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'unboard', unitId: u.id }) }, 'Go ashore'));
    if (u.loc.kind === 'europe' && UNIT_TYPES[u.type].kind === 'colonist') {
      for (const role of ['soldier', 'dragoon', 'pioneer', 'scout', 'missionary', 'none'] as RoleId[]) {
        if (role === u.role) continue;
        const goods = role === 'pioneer' ? { tools: 100 } : ROLES[role].goods;
        const cost = Object.entries(goods).reduce((sum, [g, n]) => sum + (n ?? 0) * buyPrice(this.app.me, g as GoodId), 0);
        actions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'equip', unitId: u.id, role }) }, role === 'none' ? 'Sell equipment' : cost ? `${ROLES[role].name} (${cost})` : ROLES[role].name));
      }
    }
    return h('div', { class: 'actions' }, h('div', { class: 'muted small' }, `Selected: ${unitName(u)}`), actions);
  }

  private recruitPanel(): HTMLElement {
    const me = this.app.me;
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, (['recruit', 'train', 'purchase'] as const).map((t) =>
      h('button', { class: `tab${this.tab === t ? ' active' : ''}`, role: 'tab', 'aria-selected': String(this.tab === t), onclick: () => { this.tab = t; this.app.requestRender(); } }, t[0].toUpperCase() + t.slice(1))));
    let content: HTMLElement;
    if (this.tab === 'recruit') {
      const price = recruitPrice(me);
      content = h('div', { class: 'offers' },
        h('p', { class: 'muted small' }, `Crosses ${me.crosses}/${me.crossesRequired}: when full, the next immigrant comes for free. Recruiting now costs ${price}.`),
        me.recruitPool.map((type, slot) => this.offer(type, price, () => this.dispatch({ type: 'recruit', slot }))));
    } else {
      const list = this.tab === 'train' ? TRAINABLE : PURCHASABLE;
      content = h('div', { class: 'offers' }, list.map((type) => this.offer(type, trainPrice(me, type), () => this.dispatch({ type: 'train', unitType: type }))));
    }
    return h('div', { class: 'card recruit' }, tabs, content);
  }

  private offer(type: keyof typeof UNIT_TYPES, price: number, buy: () => void): HTMLElement {
    return h('div', { class: 'offer' },
      icon({ kind: 'unit', type, role: 'none', nation: this.app.viewer }, 36),
      h('span', null, UNIT_TYPES[type].name),
      h('button', { class: 'btn tiny', disabled: this.app.me.gold < price, onclick: buy }, `${price}`));
  }
}
