/**
 * Native affairs for the advanced computer levels: buying goods from settlements with wagon
 * trains (see logistics.ts), and Combative's missionaries inciting tribes against its enemies.
 */
import { nativeUnitPrice, settlementForSale } from '../braves.js';
import { sellPrice } from '../europe.js';
import { buyFromSettlement, incitePrice, inciteTribe, tensionOf } from '../natives.js';
import { cargoRoomFor, distance, isCoastal } from '../queries.js';
import { TENSION } from '../rules/natives.js';
import type { NationId } from '../rules/nations.js';
import type { GameState, Player, Settlement, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';
import type { AiProfile } from './profiles.js';

/** A purchase must fetch at least this much more in Europe (after tax) than it costs. */
export const NATIVE_BUY_MARGIN = 1.4;
/** Gold kept back when buying from natives. */
const BUY_RESERVE = 400;
/** Combative incites a tribe at most once in this many turns. */
export const INCITE_EVERY = 40;

/**
 * A wagon train next to a settlement buys the goods that pay best in Europe, when they pay at least
 * NATIVE_BUY_MARGIN times their price and the nation can spare the gold. Returns whether it bought.
 */
export function buyFromNatives(s: GameState, p: Player, wagon: Unit, st: Settlement): boolean {
  if (p.independence !== 'none' || !ownColonies(s, p).some((c) => isCoastal(s, c.x, c.y))) return false;
  const net = (g: Parameters<typeof sellPrice>[1]) => sellPrice(p, g) * (1 - p.tax / 100);
  const best = settlementForSale(st)
    .filter((r) => r.amount >= 30 && !p.boycotts[r.good])
    .map((r) => {
      const n = Math.min(100, r.amount, cargoRoomFor(s, wagon, r.good));
      const unit = nativeUnitPrice(st, r.good, p.id);
      return { good: r.good, n, unit, gain: n * (net(r.good) - unit) };
    })
    .filter((r) => r.n >= 30 && net(r.good) >= r.unit * NATIVE_BUY_MARGIN && p.gold >= r.unit * r.n + BUY_RESERVE)
    .sort((a, b) => b.gain - a.gain)[0];
  if (!best) return false;
  let ok = false;
  safely(() => {
    buyFromSettlement(s, wagon.id, st.id, best.good, best.n);
    ok = true;
  });
  return ok;
}

/**
 * Combative only, and sparingly: a missionary next to a settlement pays its tribe to turn on a
 * European enemy with a colony nearby, at most once every INCITE_EVERY turns, with gold to spare.
 */
export function maybeIncite(s: GameState, p: Player, u: Unit, st: Settlement, prof: AiProfile): boolean {
  if (prof.aggression < 1 || prof.adaptive) return false;
  const memory = (p.aiMemory = p.aiMemory ?? {});
  if (memory.lastIncite !== undefined && s.turn - memory.lastIncite < INCITE_EVERY) return false;
  if (tensionOf(st, p.id) >= TENSION.angry) return false;
  const price = incitePrice(st);
  if (p.gold < price + prof.reserve + 1000) return false;
  const tribe = s.tribes.find((t) => t.id === st.tribe)!;
  const enemy = (Object.keys(p.stance) as NationId[]).find(
    (n) => n !== 'crown' && p.stance[n] === 'war' && tribe.stance[n] !== 'war' && Object.values(s.colonies).some((c) => c.owner === n && distance(c.x, c.y, st.x, st.y) <= 6),
  );
  if (!enemy) return false;
  let ok = false;
  safely(() => {
    inciteTribe(s, u.id, st.id, enemy);
    ok = true;
  });
  if (ok) memory.lastIncite = s.turn;
  return ok;
}

