/**
 * Temporary production modifiers set by events. Imports only types, so production.ts can use it
 * without import cycles. With no event state (events never used) nothing changes.
 */
import type { ProductId } from '../rules/goods.js';
import type { Colony, GameState } from '../types.js';

/** Production change in percent for one product of a colony from the events running now (0 when none). */
export function eventProductionPct(s: GameState, colony: Colony, product: ProductId): number {
  const mods = s.events?.mods;
  if (!mods?.length) return 0;
  let pct = 0;
  for (const m of mods) {
    if (m.nation !== colony.owner || s.turn >= m.until) continue;
    if (m.colony && m.colony !== colony.id) continue;
    if (m.products && !m.products.includes(product)) continue;
    pct += m.pct;
  }
  return Math.max(-100, pct);
}

/** Applies the running modifiers to a colony's gross production (in place). */
export function applyEventModifiers(s: GameState, colony: Colony, produced: Record<ProductId, number>): void {
  if (!s.events?.mods.length) return;
  for (const key of Object.keys(produced) as ProductId[]) {
    if (!produced[key]) continue;
    const pct = eventProductionPct(s, colony, key);
    if (pct) produced[key] = Math.max(0, Math.round(produced[key] * (1 + pct / 100)));
  }
}
