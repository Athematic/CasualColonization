/**
 * Target selectors: small functions that pick what an event is about for one nation (a colony, a
 * ship, a neighbouring tribe…), or return null when the nation has nothing to target. Every
 * random pick uses the event stream `r`, never `GameState.rng`.
 */
import { colonyAt, colonyWorkers, distance, isCoastal, isShip, isWater, player, tileAt } from '../queries.js';
import type { GoodId } from '../rules/goods.js';
import type { NationId } from '../rules/nations.js';
import type { Colony, GameState } from '../types.js';
import type { EventVars, TargetSelector } from './types.js';

function pickOne<T>(items: T[], r: () => number): T | undefined {
  return items.length ? items[Math.floor(r() * items.length)] : undefined;
}

export function coloniesOf(s: GameState, nation: NationId): Colony[] {
  return Object.values(s.colonies).filter((c) => c.owner === nation);
}

/** The nation itself, while it is loyal to the Crown (Europe still trades with it). */
export const loyalNation: TargetSelector = (s, nation) => (player(s, nation).independence === 'none' ? { nation } : null);

/** The nation, once it holds at least one colony. */
export const settledNation: TargetSelector = (s, nation) => (coloniesOf(s, nation).length ? { nation } : null);

/** One of the nation's colonies matching the filter, picked at random. */
export function colony(opts: { minPop?: number; coastal?: boolean; good?: { id: GoodId; min: number }; filter?: (s: GameState, c: Colony) => boolean } = {}): TargetSelector {
  return (s, nation, r) => {
    const list = coloniesOf(s, nation).filter((c) =>
      (!opts.minPop || colonyWorkers(s, c).length >= opts.minPop) &&
      (!opts.coastal || isCoastal(s, c.x, c.y)) &&
      (!opts.good || c.goods[opts.good.id] >= opts.good.min) &&
      (!opts.filter || opts.filter(s, c)));
    const c = pickOne(list, r);
    return c ? { nation, colony: c.id } : null;
  };
}

/** One of the nation's ships on open water (not in a colony), picked at random. */
export const shipAtSea: TargetSelector = (s, nation, r) => {
  const ships = Object.values(s.units).filter((u) => {
    if (u.owner !== nation || !isShip(u) || u.loc.kind !== 'map' || u.repair) return false;
    return isWater(tileAt(s, u.loc.x, u.loc.y)) && !colonyAt(s, u.loc.x, u.loc.y);
  });
  const ship = pickOne(ships, r);
  return ship ? { nation, ship: ship.id } : null;
};

/**
 * A colony with a settlement of a tribe at peace with the nation within `range` tiles: the
 * colony, the tribe and its nearest settlement.
 */
export function tribeNear(range = 6): TargetSelector {
  return (s, nation, r) => {
    const options: EventVars[] = [];
    for (const c of coloniesOf(s, nation)) {
      let best: { id: string; d: number } | undefined;
      for (const st of Object.values(s.settlements)) {
        const tribe = s.tribes.find((t) => t.id === st.tribe);
        if (tribe?.stance[nation] === 'war') continue;
        const d = distance(c.x, c.y, st.x, st.y);
        if (d <= range && (!best || d < best.d)) best = { id: st.id, d };
      }
      if (best) options.push({ nation, colony: c.id, settlement: best.id, tribe: s.settlements[best.id].tribe });
    }
    return pickOne(options, r) ?? null;
  };
}
