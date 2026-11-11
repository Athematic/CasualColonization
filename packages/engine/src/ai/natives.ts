/**
 * Native affairs for the advanced computer levels: buying goods from settlements with wagon
 * trains (see logistics.ts), Combative's missionaries inciting tribes against its enemies, and
 * proposing treaties to peoples (Beta 2, native-partners.md N11).
 */
import { gridOf } from '../grid.js';
import { nativeUnitPrice, settlementForSale } from '../braves.js';
import { sellPrice } from '../europe.js';
import { buyFromSettlement, incitePrice, inciteTribe, peopleRelationOf, tensionOf } from '../natives.js';
import { defencePartner, hasDefence, hasExchange, hasLandUse, hasPeopleTrade, leasableTiles, leaseRent, peopleRefusal, peopleTreatyOn, peopleTreatyProblem, proposePeopleTreaty, settlementTeaches } from '../peopletreaties.js';
import { cooperationOf, LEVEL_COOPERATION } from '../alliances.js';
import { peoplePairRandom } from '../relations.js';
import type { TribeId } from '../rules/nations.js';
import { cargoRoomFor, colonyWorkers, isCoastal } from '../queries.js';
import { nativeRulesOf } from '../scenarios/index.js';
import type { NationId } from '../rules/nations.js';
import type { GameState, Player, Settlement, Unit } from '../types.js';
import { ownColonies, safely } from './common.js';
import type { AiProfile } from './profiles.js';
import { colonyList } from '../unitindex.js';
import { leaveColony } from '../colony.js';
import { UNIT_TYPES } from '../rules/units.js';

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
  // Nobody can incite a people against its partner in a mutual defence pact (N7).
  const partner = s.treaties ? defencePartner(s, st.tribe) : undefined;
  const enemy = (Object.keys(p.stance) as NationId[]).find(
    (n) => n !== 'crown' && n !== partner && p.stance[n] === 'war' && tribe.stance[n] !== 'war' && colonyList(s).some((c) => c.owner === n && grid.distance(c.x, c.y, st.x, st.y) <= 6),
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
 * Naive none: it only accepts a people's own offer). Drawn from the pair's own stream. With a
 * trade partner it also proposes land use and a cultural exchange, and sends a colonist to learn
 * where an exchange has made a settlement teach again.
 */
export function peopleAffairs(s: GameState, p: Player, prof?: AiProfile): void {
  if (!peopleTreatyOn(s, 'people-trade') || p.independence === 'lost') return;
  const chance = cooperationOf(s).proposePeopleTrade * LEVEL_COOPERATION[p.ai ?? 'naive'].people;
  if (chance <= 0) return;
  const combative = p.ai === 'combative';
  let learner = !prof?.learnFromNatives;
  for (const t of s.tribes) {
    const people: TribeId = t.id;
    const rel = peopleRelationOf(s, p.id, people);
    if (!rel) continue;
    if (hasPeopleTrade(s, p.id, people)) {
      leaseLand(s, p, people);
      seekExchange(s, p, people);
      seekDefence(s, p, people);
      if (!learner) learner = sendLearner(s, p, people);
      continue;
    }
    if (combative && rel.volume < COMBATIVE_TREATY_VOLUME) continue;
    if (peopleTreatyProblem(s, p.id, people) || peopleRefusal(s, p.id, people)) continue;
    if (peoplePairRandom(s, p.id, people, `${p.id} propose trade ${s.turn}`) >= chance) continue;
    safely(() => proposePeopleTreaty(s, p.id, people));
  }
}

/** Gold a computer nation keeps beyond a few years' rent before it leases land (N5). */
export const LEASE_RESERVE = 300;
/** Years of rent a computer nation wants in hand, beyond LEASE_RESERVE, before it leases land. */
export const LEASE_YEARS_IN_HAND = 3;

/**
 * Proposes land use (a lease, N5, N11) to a trade partner whose land lies beside the nation's
 * colonies: Creative and Competent only (`LEVEL_COOPERATION.land`; Combative takes land, Naive never
 * proposes), with a few years' rent in hand, at the scenario's `proposeLandUse` times the level's
 * share, drawn from the pair's own stream. Its colonies then work the leased tiles where the job
 * search values them (the tiles are open to them, colony.ts `colonyOccupancy`).
 */
function leaseLand(s: GameState, p: Player, people: TribeId): void {
  if (!peopleTreatyOn(s, 'land-use') || hasLandUse(s, p.id, people)) return;
  const chance = cooperationOf(s).proposeLandUse * LEVEL_COOPERATION[p.ai ?? 'naive'].land;
  if (chance <= 0) return;
  if (peopleTreatyProblem(s, p.id, people, 'land-use') || peopleRefusal(s, p.id, people)) return;
  const tiles = leasableTiles(s, p.id, people);
  if (p.gold < leaseRent(s, p.id, tiles) * tiles.length * LEASE_YEARS_IN_HAND + LEASE_RESERVE) return;
  if (peoplePairRandom(s, p.id, people, `${p.id} propose land ${s.turn}`) >= chance) return;
  safely(() => proposePeopleTreaty(s, p.id, people, 'land-use'));
}

/**
 * Proposes a cultural exchange (N7, N11) to a trade partner with a settlement within LEARNER_RANGE
 * of one of the nation's colonies (where its colonists could learn): Creative seeks it, Competent at
 * a share (`LEVEL_COOPERATION.exchange`), Combative and Naive never propose. Whether it seeks one
 * with a people is drawn once per pair from the pair's own stream, at the scenario's
 * `proposeExchange` times the level's share; a nation that does proposes on each review until the
 * people agrees.
 */
function seekExchange(s: GameState, p: Player, people: TribeId): void {
  if (!peopleTreatyOn(s, 'exchange') || hasExchange(s, p.id, people)) return;
  const chance = cooperationOf(s).proposeExchange * LEVEL_COOPERATION[p.ai ?? 'naive'].exchange;
  if (chance <= 0) return;
  if (peopleTreatyProblem(s, p.id, people, 'exchange') || peopleRefusal(s, p.id, people)) return;
  const grid = gridOf(s);
  const colonies = ownColonies(s, p);
  let near = false;
  for (const id in s.settlements) {
    const st = s.settlements[id];
    if (st.tribe === people && colonies.some((c) => grid.distance(c.x, c.y, st.x, st.y) <= LEARNER_RANGE)) {
      near = true;
      break;
    }
  }
  if (!near) return;
  // Whether the nation wants an exchange with this people at all is drawn once per pair, not per review.
  if (peoplePairRandom(s, p.id, people, `${p.id} seeks exchange`) >= chance) return;
  safely(() => proposePeopleTreaty(s, p.id, people, 'exchange'));
}

/**
 * Seeks a mutual defence pact (N7, N11) with a trade partner: Creative and Competent (at a share,
 * `LEVEL_COOPERATION.defence`) with a people that has a settlement within LEARNER_RANGE of one of
 * their colonies (whose braves could defend them); Combative and Naive never (Simon, 11 November
 * 2026: Combative makes no defence pacts). Whether it seeks a pact with a people is drawn once per
 * pair from the pair's own stream, at the scenario's `proposeDefence` times the level's share (as
 * the exchange: a chance per review overshoots). The pact needs land use or an exchange first (the
 * ladder), which the nation makes on its own.
 */
function seekDefence(s: GameState, p: Player, people: TribeId): void {
  if (!peopleTreatyOn(s, 'defence') || hasDefence(s, p.id, people)) return;
  const chance = cooperationOf(s).proposeDefence * LEVEL_COOPERATION[p.ai ?? 'naive'].defence;
  if (chance <= 0) return;
  const other = defencePartner(s, people);
  if (other && other !== p.id) return;
  const grid = gridOf(s);
  const colonies = ownColonies(s, p);
  if (!colonies.length) return;
  let near = false;
  for (const id in s.settlements) {
    const st = s.settlements[id];
    if (st.tribe === people && colonies.some((c) => grid.distance(c.x, c.y, st.x, st.y) <= LEARNER_RANGE)) {
      near = true;
      break;
    }
  }
  if (!near) return;
  // Whether the nation wants a pact with this people at all is drawn once per pair, not per review.
  if (peoplePairRandom(s, p.id, people, `${p.id} seeks defence`) >= chance) return;
  if (peopleRefusal(s, p.id, people)) return;
  if (peopleTreatyProblem(s, p.id, people, 'defence')) return;
  safely(() => proposePeopleTreaty(s, p.id, people, 'defence'));
}

/** Tiles from one of its colonies within which a computer nation sends a colonist to a settlement that teaches again. */
export const LEARNER_RANGE = 6;
/** Colonists a colony keeps when it sends one out to learn. */
const LEARNER_KEEP = 3;

/**
 * Under a cultural exchange (N7), a settlement of the partner people that teaches again within
 * LEARNER_RANGE of one of the nation's colonies is sent a colonist: the least skilled free one (no
 * criminal, convert or teacher) of the nearest colony with more than LEARNER_KEEP colonists, one a
 * review for the whole nation. The colonist then walks there and learns as any colonist on the map
 * does (advanced.ts colonistTurn), and joins a colony afterwards. Returns whether one was sent.
 */
function sendLearner(s: GameState, p: Player, people: TribeId): boolean {
  if (!peopleTreatyOn(s, 'exchange') || !hasExchange(s, p.id, people)) return false;
  const grid = gridOf(s);
  const colonies = ownColonies(s, p);
  for (const id in s.settlements) {
    const st = s.settlements[id];
    if (st.tribe !== people || st.skill || !settlementTeaches(s, st, p.id)) continue;
    if (tensionOf(st, p.id) >= 400 || !p.explored[st.y * s.map.width + st.x]) continue;
    const from = colonies
      .map((c) => ({ c, d: grid.distance(c.x, c.y, st.x, st.y), workers: colonyWorkers(s, c) }))
      .filter((e) => e.d <= LEARNER_RANGE && e.workers.length > LEARNER_KEEP)
      .sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : 1))[0];
    if (!from) continue;
    const learner = from.workers
      .filter((w) => UNIT_TYPES[w.type].skill <= 0 && w.type !== 'pettyCriminal' && w.type !== 'nativeConvert' && !w.teach)
      .sort((a, b) => UNIT_TYPES[a.type].skill - UNIT_TYPES[b.type].skill || (a.id < b.id ? -1 : 1))[0];
    if (!learner) continue;
    let sent = false;
    safely(() => {
      leaveColony(s, learner.id);
      sent = true;
    });
    return sent;
  }
  return false;
}
