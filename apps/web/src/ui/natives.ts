import {
  calendarOf,
  cargoRoomFor,
  formatDate,
  peopleStanding,
  peopleTradeBenefits,
  peopleTradeTreaty,
  peopleTreatiesOn,
  landUseTreaty,
  leasedTiles,
  chiefAgainTurn,
  defenceBenefits,
  defencePartner,
  defenceTreaty,
  exchangeTreaty,
  settlementTeaches,
  teachAgainTurn,
  UNIT_TYPES,
  yearValue,
  type GameState,
  type Settlement,
  leaseTerms,
  GOOD_DEFS,
  goodsOf,
  incitePrice,
  nationOf,
  nationTitle,
  nativeOffer,
  nativeUnitPrice,
  peopleOf,
  settlementForSale,
  settlementName,
  nativeRulesOf,
  tensionLabel,
  TRIBES,
  type GoodId,
  type NationId,
  type TribeId,
  type Unit,
} from '@cc/engine';
import type { App } from '../app.js';
import { h } from '../dom.js';
import { choose, type Choice } from './dialogs.js';

type Deal = { kind: 'sell' | 'buy'; good: GoodId };

/**
 * The nation's lease of a people's land (land use, N5), in one paragraph: since when, the tiles
 * beside its colonies, the rent set when it was made and when the next is due. Null without one.
 */
export function leaseLine(app: App, nation: NationId, people: TribeId): HTMLElement | null {
  const s = app.state;
  const t = landUseTreaty(s, nation, people);
  const terms = t && leaseTerms(t);
  if (!t || !terms) return null;
  const cal = calendarOf(s);
  const n = leasedTiles(s, nation, people).length;
  return h('p', { class: 'small', 'data-lease': t.id },
    `Land use with the ${TRIBES[people].name} since ${formatDate(t.start, cal)}: your colonies work ${n} ${n === 1 ? 'tile' : 'tiles'} of their land for ${terms.rent} gold a tile a year (${terms.rent * n} gold, next due ${formatDate(terms.due, cal)}). The land stays theirs.`);
}

/** Whole years from now to a turn, at least 1. */
function yearsUntil(s: GameState, turn: number): number {
  const cal = calendarOf(s);
  return Math.max(1, Math.ceil(yearValue(turn, cal) - yearValue(s.turn, cal)));
}

function yearsText(n: number): string {
  return `${n} ${n === 1 ? 'year' : 'years'}`;
}

/**
 * When a settlement teaches the nation again under a cultural exchange (N7), in words: "teaches
 * again in n years", or the skill it teaches now. Null without an exchange with its people.
 */
export function teachingLine(s: GameState, nation: NationId, st: Settlement): string | null {
  if (!exchangeTreaty(s, nation, st.tribe)) return null;
  const skill = settlementTeaches(s, st, nation);
  if (!skill) {
    const at = teachAgainTurn(s, st);
    return at === undefined ? 'It has nothing to teach now.' : `It teaches again in ${yearsText(yearsUntil(s, at))} (${formatDate(at, calendarOf(s))}).`;
  }
  const name = UNIT_TYPES[skill].name;
  return st.skill ? `It still teaches its first skill (${name.toLowerCase()}).` : `It teaches again: a colonist may live among them and become ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}.`;
}

/**
 * The nation's cultural exchange with a settlement's people (N7), in one paragraph: since when,
 * when the settlement teaches again and when its chief welcomes the nation's scouts again. Null
 * without one.
 */
export function exchangeLine(app: App, nation: NationId, st: Settlement): HTMLElement | null {
  const s = app.state;
  const t = exchangeTreaty(s, nation, st.tribe);
  if (!t) return null;
  const chief = chiefAgainTurn(s, st, nation);
  const chiefText = chief === undefined ? '' : chief <= s.turn ? ' Its chief welcomes your scouts again.' : ` Its chief welcomes your scouts again in ${yearsText(yearsUntil(s, chief))}.`;
  return h('p', { class: 'small', 'data-exchange': t.id },
    `Cultural exchange with the ${TRIBES[st.tribe].name} since ${formatDate(t.start, calendarOf(s))}. ${teachingLine(s, nation, st)}${chiefText}`);
}

/**
 * The mutual defence pact of a settlement's people (N7), in one paragraph: the nation's own pact,
 * since when and what it does, or the nation the people is bound to instead. Null without one.
 */
export function defenceLine(app: App, nation: NationId, st: Settlement): HTMLElement | null {
  const s = app.state;
  const name = TRIBES[st.tribe].name;
  const t = defenceTreaty(s, nation, st.tribe);
  if (t) return h('p', { class: 'small', 'data-defence': t.id }, `Mutual defence pact with the ${name} since ${formatDate(t.start, calendarOf(s))}: ${defenceBenefits(s)}.`);
  const other = defencePartner(s, st.tribe);
  return other ? h('p', { class: 'small', 'data-defence': other }, `The ${name} have a mutual defence pact with ${nationOf(s, other).name}: an attack on them is war with ${nationOf(s, other).name}.`) : null;
}

/** The label of "Speak with the chief" for a scout: again under a cultural exchange, or when the chief has spoken already. */
export function speakLabel(s: GameState, nation: NationId, st: Settlement): string {
  if (!st.visited.includes(nation)) return 'Speak with the chief';
  const at = chiefAgainTurn(s, st, nation);
  if (at === undefined) return 'Speak with the chief (he has spoken with your scouts)';
  return at <= s.turn ? 'Speak with the chief again (welcome under your cultural exchange)' : `Speak with the chief (welcome again in ${yearsText(yearsUntil(s, at))})`;
}

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
    for (const g of goodsOf(s)) {
      const n = Math.min(100, unit.cargo?.[g] ?? 0);
      if (n <= 0) continue;
      const offer = nativeOffer(s, st, g, n, unit.owner);
      options.push({
        label: `Sell ${n} ${GOOD_DEFS[g].name.toLowerCase()} for ${offer} gold`,
        value: { kind: 'sell', good: g },
        disabled: !!visit?.sold || offer <= 0,
        hint: visit?.sold ? 'You have already sold here this turn.' : offer <= 0 ? 'The natives have no gold left.' : undefined,
      });
    }
    for (const r of settlementForSale(s, st).filter((o) => o.amount >= 10)) {
      const n = Math.min(100, r.amount, cargoRoomFor(s, unit, r.good));
      const each = nativeUnitPrice(s, st, r.good, unit.owner);
      const price = each * Math.max(1, n);
      options.push({
        label: n > 0 ? `Buy ${n} ${GOOD_DEFS[r.good].name.toLowerCase()} for ${price} gold (${each} each)` : `${r.amount} ${GOOD_DEFS[r.good].name.toLowerCase()} for sale (no room aboard)`,
        value: { kind: 'buy', good: r.good },
        disabled: !!visit?.bought || n <= 0 || gold < price,
        hint: visit?.bought ? 'You have already bought here this turn.' : gold < price ? `You have ${gold} gold.` : undefined,
      });
    }
    const mood = tensionLabel(st.tension[unit.owner] ?? 0, nativeRulesOf(s).tension);
    // The treaty with the settlement's people, its benefits, and how the people stands (N13).
    const treaty = peopleTradeTreaty(s, unit.owner, st.tribe);
    const standing = peopleTreatiesOn(s) && !treaty ? peopleStanding(s, unit.owner, st.tribe) : null;
    const text = h('div', null,
      h('p', null, `The people here are ${mood}. They pay ${st.gold} gold at most, and want ${peopleOf(s, st.tribe).wants.map((g) => GOOD_DEFS[g].name.toLowerCase()).join(', ')}.`),
      treaty ? h('p', { class: 'small', 'data-treaty': treaty.id }, `Trade treaty with the ${TRIBES[st.tribe].name} since ${formatDate(treaty.start, calendarOf(s))}: ${peopleTradeBenefits(s)}.`) : null,
      standing ? h('p', { class: 'muted small' }, `The ${TRIBES[st.tribe].name}: ${standing.toLowerCase()}. No trade treaty yet (Foreign Affairs).`) : null,
      leaseLine(app, unit.owner, st.tribe),
      exchangeLine(app, unit.owner, st),
      defenceLine(app, unit.owner, st),
      options.length ? null : h('p', { class: 'muted' }, 'You have nothing to sell, and they have nothing for sale.'));
    const choice: Deal | null = await choose<Deal>(`Trade with the ${settlementName(s, st)}`, text, [...options, { label: traded ? 'Done' : 'Leave', value: null as unknown as Deal }]);
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
  const price = incitePrice(s, st);
  const rivals = s.players.filter((p) => p.id !== u.owner && p.id !== 'crown' && p.kind !== 'company').map((p) => p.id as NationId);
  const nation = await choose(
    'Incite the natives',
    `For ${price} gold the ${TRIBES[st.tribe].name} will turn against a rival nation: their anger with it rises sharply, and they may go to war. You have ${app.me.gold} gold.`,
    [
      ...rivals.map((n) => ({ label: `Against ${nationTitle(app.state, n)}`, value: n, disabled: app.me.gold < price || s.tribes.find((t) => t.id === st.tribe)?.stance[n] === 'war', hint: nationOf(app.state, n).name })),
      { label: 'Never mind', value: null as unknown as NationId },
    ],
  );
  if (!nation) return false;
  return app.dispatch({ type: 'incite', unitId: u.id, settlementId, nation });
}
