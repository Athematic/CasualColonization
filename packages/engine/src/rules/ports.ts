/**
 * Port character: each nation's home port in Europe has its own starting prices, depth of market
 * and ship prices, so that Favoured Nation access to a partner's port and triangle trading pay
 * off. The differences are kept moderate (about 10–30% on the goods they touch), and they come on
 * top of the nations' own bonuses (the Dutch market still recovers twice as fast).
 *
 * The table has the shape of the scenario framework's `NationEntry.port` (docs/design/
 * scenario-framework.md, Q10): `{ name, market }` per nation, so 0.9 can move each entry onto the
 * scenario's nation entries as it is. Today's table is the Americas'.
 */
import { GOOD_DEFS, GOODS, type GoodId } from './goods.js';
import { HOME_PORTS, type NationId } from './nations.js';

export interface PortCharacter {
  /**
   * Factor on a good's starting sell price (rounded to whole gold). The price's floor and ceiling
   * move by the same number of gold, and prices drift back to it.
   */
  prices?: Partial<Record<GoodId, number>>;
  /** Factor on the units traded before the price moves one step: above 1, a deep market whose price moves slowly. */
  depth?: Partial<Record<GoodId, number>>;
  /** Factor on the chance each turn that a price drifts back towards its starting value. */
  recovery?: number;
  /** Factor on the price of ships bought there. */
  ships?: number;
}

/** A nation's home port: its name and its character (the shape of `NationEntry.port`). */
export interface PortEntry {
  name: string;
  market?: PortCharacter;
}

/**
 * The Americas' home ports. Historically flavoured: Amsterdam the entrepôt of trade goods and
 * the great tobacco and fur market; La Rochelle the fur port; Seville the silver fleet's port,
 * with dear cloth; Lisbon cheap ships and a sugar trade; London the tobacco market with steady
 * demand for cotton and plenty of tools; the Baltic ports iron, muskets, coats and furs. With
 * today's prices the factors move a good by 1–3 gold.
 */
export const PORT_CHARACTER: Partial<Record<NationId, PortEntry>> = {
  england: { name: HOME_PORTS.england, market: { prices: { tobacco: 1.25, cigars: 1.1, silver: 0.9 }, depth: { cotton: 1.5, tools: 1.5 } } },
  france: { name: HOME_PORTS.france, market: { prices: { furs: 1.25, coats: 1.2, silver: 0.9 }, depth: { furs: 1.25 } } },
  netherlands: { name: HOME_PORTS.netherlands, market: { prices: { tobacco: 1.25, furs: 1.25, cloth: 0.9, sugar: 0.75 }, depth: { tradeGoods: 2 } } },
  spain: { name: HOME_PORTS.spain, market: { prices: { silver: 1.15, sugar: 1.25, cloth: 1.2, furs: 0.75 }, depth: { silver: 1.25 }, recovery: 0.8, ships: 1.1 } },
  portugal: { name: HOME_PORTS.portugal, market: { prices: { sugar: 1.25, rum: 1.1, tobacco: 0.75 }, ships: 0.85 } },
  sweden: { name: HOME_PORTS.sweden, market: { prices: { furs: 1.25, coats: 1.1, sugar: 0.75 }, depth: { tools: 1.5, muskets: 1.5 }, ships: 0.9 } },
  denmark: { name: HOME_PORTS.denmark, market: { prices: { sugar: 1.25, coats: 1.1, cloth: 0.9 }, depth: { muskets: 1.5 }, ships: 0.9 } },
  russia: { name: HOME_PORTS.russia, market: { prices: { coats: 1.2, cloth: 1.1, silver: 0.9, tobacco: 0.75 }, depth: { furs: 1.25, tools: 1.5, muskets: 1.5 } } },
};

const NONE: PortCharacter = {};

/** A home port's character; none for a port without an entry (the Crown). */
export function portCharacter(port: NationId): PortCharacter {
  return PORT_CHARACTER[port]?.market ?? NONE;
}

/** Whole gold a port's character adds to (or takes from) a good's starting price. */
export function portPriceShift(port: NationId, good: GoodId): number {
  const f = portCharacter(port).prices?.[good];
  if (f === undefined) return 0;
  const def = GOOD_DEFS[good];
  return Math.max(def.minPrice, Math.round(def.price * f)) - def.price;
}

/** A good's starting (and resting) sell price in a port. */
export function portBasePrice(port: NationId, good: GoodId): number {
  return GOOD_DEFS[good].price + portPriceShift(port, good);
}

/** The lowest and highest sell price of a good in a port. */
export function portPriceBand(port: NationId, good: GoodId): { min: number; max: number } {
  const def = GOOD_DEFS[good];
  const d = portPriceShift(port, good);
  return { min: Math.max(1, def.minPrice + Math.min(0, d)), max: Math.max(def.minPrice + 1, def.maxPrice + d) };
}

/** Multiplier on the units traded before a good's price moves in a port. */
export function portDepth(port: NationId, good: GoodId): number {
  return portCharacter(port).depth?.[good] ?? 1;
}

/** Goods colonists mostly buy in Europe rather than sell. */
const SUPPLIES: GoodId[] = ['tradeGoods', 'tools', 'muskets', 'horses', 'lumber', 'food'];

function list(goods: GoodId[]): string {
  const names = goods.map((g) => GOOD_DEFS[g].name.toLowerCase());
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A short description of a port's character, e.g. "tobacco and furs fetch more; sugar fetches less". Empty when it has none. */
export function portCharacterText(port: NationId, goods: readonly GoodId[] = GOODS): string {
  const c = portCharacter(port);
  const prices = goods.map((g) => [g, portPriceShift(port, g)] as [GoodId, number]).filter(([, d]) => d !== 0);
  const depth = Object.entries(c.depth ?? {}) as [GoodId, number][];
  const parts: string[] = [];
  const more = prices.filter(([g, d]) => d > 0 && !SUPPLIES.includes(g)).map(([g]) => g);
  const dear = prices.filter(([g, d]) => d > 0 && SUPPLIES.includes(g)).map(([g]) => g);
  const cheap = prices.filter(([g, d]) => d < 0 && SUPPLIES.includes(g)).map(([g]) => g);
  const less = prices.filter(([g, d]) => d < 0 && !SUPPLIES.includes(g)).map(([g]) => g);
  const plenty = depth.filter(([g, m]) => m > 1 && SUPPLIES.includes(g)).map(([g]) => g);
  const steady = depth.filter(([g, m]) => m > 1 && !SUPPLIES.includes(g) && !more.includes(g)).map(([g]) => g);
  // "silver fetches", "furs fetch", "tobacco and furs fetch".
  const fetch = (goods: GoodId[]) => (goods.length > 1 || GOOD_DEFS[goods[0]].name.endsWith('s') ? 'fetch' : 'fetches');
  if (more.length) parts.push(`${list(more)} ${fetch(more)} more`);
  if (steady.length) parts.push(`steady demand for ${list(steady)}`);
  if (plenty.length) parts.push(`plenty of ${list(plenty)}`);
  if (dear.length) parts.push(`${list(dear)} dear`);
  if (cheap.length) parts.push(`${list(cheap)} cheap`);
  if (less.length) parts.push(`${list(less)} ${fetch(less)} less`);
  if ((c.ships ?? 1) < 1) parts.push('cheap ships');
  if ((c.ships ?? 1) > 1) parts.push('dear ships');
  if ((c.recovery ?? 1) < 1) parts.push('prices slow to recover');
  if ((c.recovery ?? 1) > 1) parts.push('prices quick to recover');
  return parts.join('; ');
}

/** "Amsterdam: tobacco and furs fetch more; plenty of trade goods; sugar and cloth fetch less". */
export function portSummary(port: NationId, goods: readonly GoodId[] = GOODS): string {
  const name = PORT_CHARACTER[port]?.name ?? HOME_PORTS[port];
  const text = portCharacterText(port, goods);
  return text ? `${name}: ${text}` : name;
}
