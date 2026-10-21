import {
  arrears,
  buyPrice,
  cargoFree,
  GOOD_DEFS,
  GOODS,
  isShip,
  NATIONS,
  PURCHASABLE,
  recruitPrice,
  ROLES,
  sellPrice,
  TRAINABLE,
  unitName,
  unitsAboard,
  UNIT_TYPES,
  type GoodId,
  type RoleId,
  type Unit,
} from '@cc/engine';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { icon } from '../styles.js';

const PORTS: Record<string, string> = {
  england: 'London', france: 'La Rochelle', netherlands: 'Amsterdam', spain: 'Seville',
  portugal: 'Lisbon', sweden: 'Gothenburg', denmark: 'Copenhagen', russia: 'Saint Petersburg',
};

export class EuropeScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;
  private ship?: string;
  private selected?: string;
  private tab: 'recruit' | 'train' | 'purchase' = 'recruit';

  constructor(private app: App) {
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
    const ships = mine.filter((u) => u.loc.kind === 'europe' && isShip(u));
    const docks = mine.filter((u) => u.loc.kind === 'europe' && !isShip(u));
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
        h('h2', null, `Europe — Port of ${PORTS[this.app.viewer]}`),
        h('span', { class: 'muted' }, `Gold ${me.gold.toLocaleString()} · Tax ${me.tax}% · ${NATIONS[this.app.viewer].bonus}`),
        me.pendingTax ? h('button', { class: 'btn small', onclick: () => void this.app.answerPending() }, 'Answer the tax raise') : null,
        h('button', { class: 'btn close', onclick: () => this.app.closeScreen(), 'aria-label': 'Close Europe' }, 'Close')),
      h('div', { class: 'europe-grid' },
        this.market(ship),
        h('div', { class: 'card' },
          h('h3', null, 'Ships in port'),
          ships.length ? ships.map((x) => this.shipCard(x)) : h('p', { class: 'muted small' }, 'No ships in port. Send a ship east onto the high seas and choose “Sail to Europe”.'),
          sailing.length ? h('h3', null, 'At sea') : null,
          sailing.map((x) => h('div', { class: 'muted small' }, `${unitName(x)} — ${x.loc.kind === 'sailing' ? `${x.loc.to === 'europe' ? 'to Europe' : 'to the New World'}, ${x.loc.turnsLeft} turn${x.loc.turnsLeft === 1 ? '' : 's'}` : ''}`)),
          h('h3', null, 'On the docks'),
          docks.length ? h('div', { class: 'chips' }, docks.map((u) => this.unitChip(u))) : h('p', { class: 'muted small' }, 'Nobody is waiting on the docks.'),
          this.selectedActions(ship)),
        this.recruitPanel()),
    );
  }

  private market(ship: Unit | undefined): HTMLElement {
    const me = this.app.me;
    return h('div', { class: 'card market' },
      h('h3', null, ship ? `Market — buying for ${unitName(ship)}` : 'Market'),
      h('div', { class: 'goods market-goods' }, GOODS.map((g) => {
        const carried = ship?.cargo?.[g] ?? 0;
        if (me.boycotts[g]) {
          const owed = arrears(me, g);
          return h('div', { class: 'good market-good boycott', title: `${GOOD_DEFS[g].name} is boycotted` },
            icon({ kind: 'product', product: g }, 30, GOOD_DEFS[g].name),
            h('span', { class: 'price' }, 'Boycott'),
            h('button', { class: 'btn tiny', disabled: me.gold < owed, title: `Pay ${owed} gold in arrears to trade ${GOOD_DEFS[g].name.toLowerCase()} again`, onclick: () => this.dispatch({ type: 'payArrears', good: g }) }, `Pay ${owed}`));
        }
        return h('div', { class: 'good market-good' },
          icon({ kind: 'product', product: g }, 30, GOOD_DEFS[g].name),
          h('span', { class: 'price' }, `${sellPrice(me, g)}/${buyPrice(me, g)}`),
          h('div', { class: 'row' },
            h('button', { class: 'btn tiny', disabled: !ship || cargoFree(this.app.state, ship) <= 0 && carried % 100 === 0, title: `Buy 100 ${GOOD_DEFS[g].name.toLowerCase()} for ${buyPrice(me, g) * 100}`, onclick: () => this.buy(g) }, 'Buy'),
            h('button', { class: 'btn tiny', disabled: !carried, title: `Sell ${carried}`, onclick: () => this.dispatch({ type: 'sellGoods', carrierId: ship!.id, good: g, amount: carried }) }, 'Sell')));
      })),
      h('p', { class: 'muted small' }, 'Prices are sell/buy per unit. Selling a lot lowers the price; taxes are taken from every sale.'));
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
    if (u.loc.kind === 'europe' && ship) actions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'board', unitId: u.id, carrierId: ship.id }) }, `Board ${unitName(ship)}`));
    if (u.loc.kind === 'carrier') actions.push(h('button', { class: 'btn small', onclick: () => this.dispatch({ type: 'unboard', unitId: u.id }) }, 'Go ashore'));
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
      content = h('div', { class: 'offers' }, list.map((type) => this.offer(type, UNIT_TYPES[type].price!, () => this.dispatch({ type: 'train', unitType: type }))));
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
