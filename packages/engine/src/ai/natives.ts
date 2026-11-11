/**
 * Native affairs for the advanced computer levels: buying goods from settlements with wagon
 * trains (see logistics.ts), Combative's missionaries inciting tribes against its enemies, and
 * proposing treaties to peoples (Beta 2, native-partners.md N11).
 */
import { gridOf } from '../grid.js';
import { nativeUnitPrice, settlementForSale } from '../braves.js';
import { sellPrice } from '../europe.js';
import { buyFromSettlement, incitePrice, inciteTribe, peopleRelationOf, tensionOf } from '../natives.js';
import { hasPeopleTrade, peopleRefusal, peopleTreatyOn, peopleTreatyProblem, proposePeopleTreaty } from '../peopletreaties.js';
import { cooperationOf, LEVEL_COOPERATION } from '../alliances.js';
import { peoplePairRandom } from '../relations.js';
import type { TribeId } from '../rules/nations.js';
import { cargoRoomFor, isCoastal } from '../queries.js';
import { nativeRulesOf } from '../scenarios/index.js';
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
  const best = settlementForSale(s, st)
    .filter((r) => r.amount >= 30 && !p.boycotts[r.good])
    .map((r) => {
      const n = Math.min(100, r.amount, cargoRoomFor(s, wagon, r.good));
      const unit = nativeUnitPrice(s, st, r.good, p.id);
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
  const grid = gridOf(s);
  if (prof.aggression < 1 || prof.adaptive) return false;
  const memory = (p.aiMemory = p.aiMemory ?? {});
  if (memory.lastIncite !== undefined && s.turn - memory.lastIncite < INCITE_EVERY) return false;
  if (tensionOf(st, p.id) >= nativeRulesOf(s).tension.angry) return false;
  const price = incitePrice(s, st);
  if (p.gold < price + prof.reserve + 1000) return false;
  // Paying a partner to make war would break faith with it (N8): not worth a treaty.
  if (hasPeopleTrade(s, p.id, st.tribe)) return false;
  const tribe = s.tribes.find((t) => t.id === st.tribe)!;
  const enemy = (Object.keys(p.stance) as NationId[]).find(
    (n) => n !== 'crown' && p.stance[n] === 'war' && tribe.stance[n] !== 'war' && Object.values(s.colonies).some((c) => c.owner === n && grid.distance(c.x, c.y, st.x, st.y) <= 6),
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


/** Gold a Combative nation must have traded with a people before a trade treaty pays it (N11: "where it pays"). */
export const COMBATIVE_TREATY_VOLUME = 300;

/**
 * Proposes trade treaties to peoples (N11), on the nation's review turns: to each people it may
 * make one with (unlocked, as `peopleTreatyProblem` says, and nothing the people holds against it),
 * at a seeded chance, the scenario's `proposePeopleTrade` times the level's share (Creative all of
 * it, Competent most, Combative half and only where it has traded enough with the people to pay,
 * Naive none: it only accepts a people's own offer). Drawn from the pair's own stream.
 */
export function peopleAffairs(s: GameState, p: Player): void {
  if (!peopleTreatyOn(s, 'people-trade') || p.independence === 'lost') return;
  const chance = cooperationOf(s).proposePeopleTrade * LEVEL_COOPERATION[p.ai ?? 'naive'].people;
  if (chance <= 0) return;
  const combative = p.ai === 'combative';
  for (const t of s.tribes) {
    const people: TribeId = t.id;
    const rel = peopleRelationOf(s, p.id, people);
    if (!rel || hasPeopleTrade(s, p.id, people)) continue;
    if (combative && rel.volume < COMBATIVE_TREATY_VOLUME) continue;
    if (peopleTreatyProblem(s, p.id, people) || peopleRefusal(s, p.id, people)) continue;
    if (peoplePairRandom(s, p.id, people, `${p.id} propose trade ${s.turn}`) >= chance) continue;
    safely(() => proposePeopleTreaty(s, p.id, people));
  }
}
