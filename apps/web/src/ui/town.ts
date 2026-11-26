/**
 * A playing people's town on the colony screen (native-nations.md T2, T10, T22; Beta 3 step 10):
 * its stores and reserve, growth and what holds it back, housing, the land's health in its region,
 * and trade for gold with European carriers beside it. The colony screen (colony.ts) draws the
 * fields, buildings and warehouse as for a colony, with the people's own buildings and words.
 */
import {
  calendarOf,
  colonyReport,
  colonyWorkers,
  foodCapacity,
  foodToGrow,
  formatDate,
  GOOD_DEFS,
  goodsOf,
  gridOf,
  healthWords,
  housingOf,
  hungryThisYear,
  foughtThisYear,
  isCarrier,
  isHardYear,
  isPeopleTown,
  isSick,
  kindOfId,
  nationOf,
  pairAtWar,
  pairPrice,
  regionHealth,
  regionName,
  regionOf,
  reserveOf,
  sideName,
  storeCapacity,
  storeYearsHeld,
  townDwellers,
  unitName,
  unitPosition,
  type Colony,
  type GameState,
  type GoodId,
  type Unit,
} from '@cc/engine';
import type { App } from '../app.js';
import { h } from '../dom.js';
import { icon } from '../styles.js';

export { isPeopleTown };

/** The land around a town in words: its region, the region's health and a hard year (T10). */
export function townLand(s: GameState, x: number, y: number): { region: string; health?: number; words?: string; hard: boolean } | undefined {
  const land = s.land;
  if (!land) return undefined;
  const region = regionOf(land, x, y);
  const health = land.health ? regionHealth(s, region) : undefined;
  return { region: regionName(s, region), health, words: health === undefined ? undefined : healthWords(health), hard: isHardYear(s, region) };
}

/** Why a town has no birth now, or how far it is from the next one. */
export function growthLine(s: GameState, c: Colony): { text: string; held: boolean } {
  const cal = calendarOf(s);
  if (hungryThisYear(s, c)) return { text: 'Hungry this year: its store ran out, so no child is born. A second hungry year costs a person.', held: true };
  if (isSick(s, c)) return { text: `Recovering from an epidemic: no births until ${formatDate(c.sickUntil!, cal)}.`, held: true };
  if (foughtThisYear(s, c)) return { text: 'Attacked this year: no child is born in a year of fighting.', held: true };
  const housing = housingOf(s, c);
  const dwellers = townDwellers(s, c);
  if (dwellers >= housing) return { text: `The longhouses are full (${dwellers} of ${housing}): build more longhouses for the town to grow.`, held: true };
  const reserve = reserveOf(s, c);
  const above = Math.max(0, c.goods.food - reserve);
  return { text: `A child is born when the food above the reserve reaches ${foodToGrow(s, c)}: now ${above}.`, held: false };
}

/** The town card: people, stores, growth, housing and land. */
export function townCard(app: App, c: Colony): HTMLElement {
  const s = app.state;
  const pop = colonyWorkers(s, c).length;
  const reserve = reserveOf(s, c);
  const years = storeYearsHeld(s, c);
  const housing = housingOf(s, c);
  const dwellers = townDwellers(s, c);
  const land = townLand(s, c.x, c.y);
  const growth = growthLine(s, c);
  const net = colonyReport(s, c).net.food;
  const pct = (n: number, of: number) => Math.max(0, Math.min(100, Math.round((n / Math.max(1, of)) * 100)));
  return h('div', { class: 'town-card', 'data-town': c.id },
    h('h3', null, 'The town'),
    h('div', { class: 'town-line', title: 'Food below the reserve is the store that carries the town through winter and hard years; only food above it counts towards a birth.' },
      h('span', null, h('b', null, 'Stores '), `${c.goods.food} food (${net >= 0 ? '+' : ''}${net} a turn) · reserve ${reserve} · keeps up to ${storeCapacity(s, c)}`),
      h('div', { class: 'bar store-bar', role: 'meter', 'aria-label': 'Food against the reserve', 'aria-valuenow': c.goods.food, 'aria-valuemin': 0, 'aria-valuemax': foodCapacity(s, c) },
        h('span', { class: c.goods.food < reserve ? 'short' : undefined, style: `width:${pct(c.goods.food, foodCapacity(s, c))}%` }),
        h('i', { class: 'mark', style: `left:${pct(reserve, foodCapacity(s, c))}%`, title: `Reserve: ${reserve}` })),
      h('span', { class: 'muted small' }, Number.isFinite(years) ? `${Math.floor(years * 10) / 10} years of food for its ${pop} ${pop === 1 ? 'person' : 'people'} at work.` : '')),
    h('p', { class: `town-line${growth.held ? ' held' : ''}` }, h('b', null, 'Growth '), growth.text),
    h('p', { class: 'town-line' }, h('b', null, 'Housing '), Number.isFinite(housing) ? `${dwellers} of ${housing} live in its longhouses.` : `${dwellers} live here.`),
    land
      ? h('p', { class: 'town-line', title: 'Furs and game taken in a region beyond what it renews wear its health down; fur and game yields there follow its health. Fish and gardens are not touched.' },
          h('b', null, 'Land '),
          land.region,
          land.words ? `: ${land.words} (health ${land.health})` : '',
          land.hard ? h('span', { class: 'pill warn' }, 'Hard year: food yields halved') : null)
      : null,
    h('p', { class: 'muted small' }, 'Nothing is bought for gold at home: buildings are made by the town’s own work, experts are taught by elders. Gold comes from trade with Europeans and buys their goods.'));
}

/** European carriers next to a town (or a people's carriers next to a colony): who can trade there. */
export function carriersBeside(s: GameState, c: Colony): Unit[] {
  const grid = gridOf(s);
  return Object.values(s.units).filter((u) => {
    if (u.owner === c.owner || u.loc.kind !== 'map' || !isCarrier(u)) return false;
    // Trade for gold is between a European nation and a playing people (peopletrade.ts).
    if ((kindOfId(u.owner) === 'people') === (kindOfId(c.owner) === 'people')) return false;
    const p = unitPosition(s, u);
    return !!p && grid.distance(p.x, p.y, c.x, c.y) === 1;
  });
}

/**
 * Trade for gold at a town or colony between a European nation and a playing people (T10, step 4's
 * `tradeWithPeople`), set going by the viewer: sell from the warehouse into a carrier beside it, or
 * buy what the carrier holds. Prices are each side's, with a trade treaty's better prices for the
 * side whose carrier came.
 */
export function tradeCard(app: App, c: Colony): HTMLElement | null {
  const s = app.state;
  const carriers = carriersBeside(s, c);
  if (!carriers.length) return null;
  return h('div', { class: 'card trade-card' },
    h('h3', null, 'Trade beside the town'),
    carriers.map((u) => {
      const other = u.owner;
      const war = pairAtWar(s, other, c.owner);
      const sells = goodsOf(s).filter((g) => (c.goods[g] ?? 0) > 0 && (g !== 'food' || c.goods.food > reserveOf(s, c)));
      const buys = goodsOf(s).filter((g) => (u.cargo?.[g] ?? 0) > 0);
      const deal = (g: GoodId, load: boolean) => {
        const seller = load ? c.owner : other;
        const buyer = load ? other : c.owner;
        const price = Math.round(pairPrice(s, seller, buyer, g, other) * 10) / 10;
        const n = load ? (g === 'food' ? c.goods.food - reserveOf(s, c) : c.goods[g]) : u.cargo![g]!;
        return h('button', {
          class: 'btn small',
          disabled: war || !app.isMyTurn(),
          title: `${price} gold a unit`,
          onclick: () => app.dispatch({ type: 'tradeWithPeople', unitId: u.id, colonyId: c.id, good: g, amount: Math.min(100, n), load }),
        }, icon({ kind: 'product', product: g }, 18), `${load ? 'Sell' : 'Buy'} ${GOOD_DEFS[g].name.toLowerCase()} (${price})`);
      };
      return h('div', { class: 'trade-row' },
        h('div', { class: 'muted small' },
          h('span', { class: 'flag', style: `background:${nationOf(s, other).color}` }), ' ',
          `${unitName(u)} of ${sideName(s, other)}`,
          war ? ' (at war: no trade)' : ''),
        h('div', { class: 'actions' }, sells.map((g) => deal(g, true)), buys.map((g) => deal(g, false))));
    }));
}
