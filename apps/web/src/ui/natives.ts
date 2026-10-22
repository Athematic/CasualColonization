import {
  cargoRoomFor,
  GOOD_DEFS,
  GOODS,
  incitePrice,
  NATIONS,
  nationTitle,
  nativeOffer,
  nativeUnitPrice,
  settlementForSale,
  settlementName,
  tensionLabel,
  TRIBES,
  type GoodId,
  type NationId,
  type Unit,
} from '@cc/engine';
import type { App } from '../app.js';
import { h } from '../dom.js';
import { choose, type Choice } from './dialogs.js';

type Deal = { kind: 'sell' | 'buy'; good: GoodId };

/**
 * Trading with a native settlement: a wagon train or ship next to it may sell one kind of cargo
 * and buy one kind of the settlement's goods each turn. The dialog stays open between the two.
 * Resolves with whether anything was traded.
 */
export async function nativeTradeDialog(app: App, u: Unit, settlementId: string): Promise<boolean> {
  let traded = false;
  for (;;) {
    const s = app.state;
    const st = s.settlements[settlementId];
    const unit = s.units[u.id];
    if (!st || !unit) return traded;
    const visit = unit.trade && unit.trade.at === st.id && unit.trade.turn === s.turn ? unit.trade : undefined;
    const gold = app.me.gold;
    const options: Choice<Deal>[] = [];
    for (const g of GOODS) {
      const n = Math.min(100, unit.cargo?.[g] ?? 0);
      if (n <= 0) continue;
      const offer = nativeOffer(st, g, n);
      options.push({
        label: `Sell ${n} ${GOOD_DEFS[g].name.toLowerCase()} for ${offer} gold`,
        value: { kind: 'sell', good: g },
        disabled: !!visit?.sold || offer <= 0,
        hint: visit?.sold ? 'You have already sold here this turn.' : offer <= 0 ? 'The natives have no gold left.' : undefined,
      });
    }
    for (const r of settlementForSale(st)) {
      const n = Math.min(100, r.amount, cargoRoomFor(s, unit, r.good));
      const each = nativeUnitPrice(st, r.good, unit.owner);
      const price = each * Math.max(1, n);
      options.push({
        label: n > 0 ? `Buy ${n} ${GOOD_DEFS[r.good].name.toLowerCase()} for ${price} gold (${each} each)` : `${r.amount} ${GOOD_DEFS[r.good].name.toLowerCase()} for sale (no room aboard)`,
        value: { kind: 'buy', good: r.good },
        disabled: !!visit?.bought || n <= 0 || gold < price,
        hint: visit?.bought ? 'You have already bought here this turn.' : gold < price ? `You have ${gold} gold.` : undefined,
      });
    }
    const mood = tensionLabel(st.tension[unit.owner] ?? 0);
    const text = h('div', null,
      h('p', null, `The people here are ${mood}. They pay ${st.gold} gold at most, and want ${TRIBES[st.tribe].wants.map((g) => GOOD_DEFS[g].name.toLowerCase()).join(', ')}.`),
      options.length ? null : h('p', { class: 'muted' }, 'You have nothing to sell, and they have nothing for sale.'));
    const choice: Deal | null = await choose<Deal>(`Trade with the ${settlementName(st)}`, text, [...options, { label: traded ? 'Done' : 'Leave', value: null as unknown as Deal }]);
    if (!choice) return traded;
    const ok: boolean = choice.kind === 'sell'
      ? app.dispatch({ type: 'tradeNatives', unitId: unit.id, settlementId, good: choice.good })
      : app.dispatch({ type: 'buyNatives', unitId: unit.id, settlementId, good: choice.good });
    traded ||= ok;
    if (!ok) return traded;
  }
}

/** A missionary incites the settlement's tribe against a rival nation, for gold. */
export async function inciteDialog(app: App, u: Unit, settlementId: string): Promise<boolean> {
  const s = app.state;
  const st = s.settlements[settlementId];
  const price = incitePrice(st);
  const rivals = s.players.filter((p) => p.id !== u.owner && p.id !== 'crown').map((p) => p.id as NationId);
  const nation = await choose(
    'Incite the natives',
    `For ${price} gold the ${TRIBES[st.tribe].name} will turn against a rival nation: their anger with it rises sharply, and they may go to war. You have ${app.me.gold} gold.`,
    [
      ...rivals.map((n) => ({ label: `Against ${nationTitle(n)}`, value: n, disabled: app.me.gold < price || s.tribes.find((t) => t.id === st.tribe)?.stance[n] === 'war', hint: NATIONS[n].name })),
      { label: 'Never mind', value: null as unknown as NationId },
    ],
  );
  if (!nation) return false;
  return app.dispatch({ type: 'incite', unitId: u.id, settlementId, nation });
}
