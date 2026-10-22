/**
 * The Crown before independence (Alpha 0.5): the Royal Expeditionary Force it builds up over the
 * game, its demands for gold, and the wars it drags its nation into. Runs once per round for
 * every European nation that has not declared independence (turn.ts). During and after a War of
 * Independence none of this happens.
 *
 * Every random draw comes from a seeded stream per nation and purpose (`pairRandom` with the
 * Crown), never from `GameState.rng`, so these events shift no other random outcome.
 */
import { declareWar } from './combat.js';
import { fail } from './errors.js';
import { royalForce } from './independence.js';
import { message, player } from './queries.js';
import { hasTradeAgreement, isFavoured, pairRandom } from './relations.js';
import { difficultyRules } from './rules/difficulty.js';
import { GOOD_DEFS, GOODS, type GoodId } from './rules/goods.js';
import { NATIONS, type NationId } from './rules/nations.js';
import { track } from './telemetry.js';
import type { Colony, GameState, Player } from './types.js';

// ---------------------------------------------------------------------------
// The Royal Expeditionary Force

/**
 * How the Royal Expeditionary Force grows. Each round the Crown gains growth points, multiplied by
 * the nation's `refGrowth` (rules/difficulty.ts): PER_COLONY for each colony the nation holds, and
 * PER_BELL for each liberty bell its colonies rang since the last round (the King reacts to
 * liberty). Each point is one land unit; once BATCH points have gathered, the whole points are
 * spent on units, so the King adds a few at a time. The mix follows the old declaration formula
 * (two regulars and one dragoon for each half artillery, see `royalForce`), and every
 * LAND_PER_SHIP land units added bring a man-of-war. Tuned so that the force at a typical
 * declaration is in the same range as the old formula sized at the declaration (see
 * docs/AI_FEATURE_AUDIT.md, "The Crown").
 */
export const REF_GROWTH = { perColony: 0.012, perBell: 0.0032, batch: 3, landPerShip: 12 };

/** Land units the King adds when a demand for gold is refused. */
export const REF_ON_REFUSAL = 2;

type Force = Player['ref'];

/** Land units in a force (regulars, dragoons and artillery). */
export function landForce(f: Force): number {
  return f.regulars + f.dragoons + f.artillery;
}

/** "12 regulars, 6 dragoons, 3 artillery and 2 men-of-war". */
export function describeForce(f: Force): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return `${n(f.regulars, 'regular', 'regulars')}, ${n(f.dragoons, 'dragoon', 'dragoons')}, ${f.artillery} artillery and ${n(f.menOfWar, 'man-of-war', 'men-of-war')}`;
}

/** The force the Crown holds at the start of a game: the fixed part of the old formula, scaled by `refBase`. */
export function initCrown(s: GameState, p: Player): void {
  const colonies = Object.values(s.colonies).filter((c) => c.owner === p.id).length;
  // A save from before the REF grew catches up with the old formula for its colonies.
  p.ref = royalForce(p, colonies);
  p.royal = { bells: p.bells, points: 0, added: 0 };
}

/** Adds `n` land units to a nation's REF, keeping the mix of the old formula. Returns what was added. */
export function addToForce(p: Player, n: number): Force {
  const added: Force = { regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 };
  const crown = (p.royal = p.royal ?? { bells: p.bells, points: 0, added: 0 });
  const weights: [keyof Force, number][] = [['regulars', 2], ['dragoons', 1], ['artillery', 0.5]];
  for (let i = 0; i < n; i++) {
    // The kind furthest below its share of the force comes next.
    const [kind] = weights.map(([k, w]) => [k, p.ref[k] / w] as const).sort((a, b) => a[1] - b[1])[0];
    p.ref[kind]++;
    added[kind]++;
    const before = Math.floor((crown.added ?? 0) / REF_GROWTH.landPerShip);
    crown.added = (crown.added ?? 0) + 1;
    if (Math.floor(crown.added / REF_GROWTH.landPerShip) > before) {
      p.ref.menOfWar++;
      added.menOfWar++;
    }
  }
  return added;
}

/** One round of the Crown's build-up for a nation: growth points from its colonies and new bells. */
function growForce(s: GameState, p: Player, colonies: number): void {
  if (!p.royal) initCrown(s, p);
  const crown = p.royal!;
  const bells = Math.max(0, p.bells - crown.bells);
  crown.bells = p.bells;
  crown.points += difficultyRules(p).refGrowth * (REF_GROWTH.perColony * colonies + REF_GROWTH.perBell * bells);
  if (crown.points < REF_GROWTH.batch) return;
  const n = Math.floor(crown.points);
  crown.points -= n;
  const added = addToForce(p, n);
  track(p.id, 'crown:ref units added', n);
  message(s, `The King adds ${listForce(added)} to the Royal Expeditionary Force. Royal forces: ${describeForce(p.ref)}.`, p.id);
}

/** Only the kinds that are there: "2 regulars and 1 dragoon". */
function listForce(f: Force): string {
  const parts: string[] = [];
  if (f.regulars) parts.push(`${f.regulars} ${f.regulars === 1 ? 'regular' : 'regulars'}`);
  if (f.dragoons) parts.push(`${f.dragoons} ${f.dragoons === 1 ? 'dragoon' : 'dragoons'}`);
  if (f.artillery) parts.push(`${f.artillery} artillery`);
  if (f.menOfWar) parts.push(`${f.menOfWar} ${f.menOfWar === 1 ? 'man-of-war' : 'men-of-war'}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? 'nothing';
}

// ---------------------------------------------------------------------------
// Royal demands for gold

/**
 * Royal demands. From turn FROM, each round a nation with at least MIN_GOLD has a CHANCE (times
 * the difficulty's `demandChance`) that the King demands a share of its treasury: SHARE.min to
 * SHARE.max (seeded), times `demandSize`, rounded to 10 gold. People answer in the turn-start
 * briefing; computer players at the start of their turn. Refusing has a price, as in the
 * original: the Crown seizes every good but food in the warehouse of the colony with the most
 * valuable stock, and the King adds REF_ON_REFUSAL regulars to the Royal Expeditionary Force.
 */
export const DEMAND = { from: 40, chance: 0.015, minGold: 400, share: { min: 0.1, max: 0.3 } };

/** The colony whose goods the Crown would seize: the one with the most valuable stock (at home sell prices, food left out). */
export function seizureColony(s: GameState, nation: NationId): { colony: Colony; value: number } | null {
  const p = player(s, nation);
  let best: { colony: Colony; value: number } | null = null;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== nation) continue;
    const value = GOODS.reduce((n, g) => (g === 'food' ? n : n + c.goods[g] * p.market[g].price), 0);
    if (!best || value > best.value) best = { colony: c, value };
  }
  return best;
}

function maybeDemand(s: GameState, p: Player, colonies: number): void {
  const rules = difficultyRules(p);
  if (s.turn < DEMAND.from || !colonies || p.pendingDemand || p.gold < DEMAND.minGold) return;
  if (pairRandom(s, p.id, 'crown', `demand ${s.turn}`) >= DEMAND.chance * rules.demandChance) return;
  const r = pairRandom(s, p.id, 'crown', `demand size ${s.turn}`);
  const share = (DEMAND.share.min + r * (DEMAND.share.max - DEMAND.share.min)) * rules.demandSize;
  const gold = Math.max(100, Math.round((p.gold * share) / 10) * 10);
  const seize = seizureColony(s, p.id);
  p.pendingDemand = { gold, colony: seize?.colony.id ?? null, turn: s.turn };
  track(p.id, 'crown:demand made');
  message(s, `His Majesty demands ${gold} gold from the treasury of ${NATIONS[p.id].name}.`, p.id);
}

/** What refusing the pending demand would cost: the goods seized, and the regulars added. */
export function demandPenalty(s: GameState, nation: NationId): { colony: Colony | null; value: number } {
  const p = player(s, nation);
  const named = p.pendingDemand?.colony ? s.colonies[p.pendingDemand.colony] : undefined;
  if (named && named.owner === nation) {
    const value = GOODS.reduce((n, g) => (g === 'food' ? n : n + named.goods[g] * p.market[g].price), 0);
    return { colony: named, value };
  }
  const best = seizureColony(s, nation);
  return { colony: best?.colony ?? null, value: best?.value ?? 0 };
}

/** Pays or refuses the King's pending demand for gold. */
export function answerDemand(s: GameState, nation: NationId, pay: boolean): string {
  const p = player(s, nation);
  const demand = p.pendingDemand;
  if (!demand) fail('The King has demanded nothing.');
  if (pay && p.gold < demand.gold) fail(`The King demands ${demand.gold} gold; the treasury holds ${p.gold}.`);
  track(nation, 'cmd:answerDemand');
  if (pay) {
    delete p.pendingDemand;
    p.gold -= demand.gold;
    track(nation, 'crown:demand paid');
    const text = `You pay the King ${demand.gold} gold.`;
    message(s, text, nation);
    return text;
  }
  const { colony } = demandPenalty(s, nation);
  delete p.pendingDemand;
  track(nation, 'crown:demand refused');
  const seized: string[] = [];
  if (colony) {
    for (const g of GOODS) {
      if (g === 'food' || colony.goods[g] <= 0) continue;
      seized.push(`${colony.goods[g]} ${GOOD_DEFS[g as GoodId].name.toLowerCase()}`);
      colony.goods[g] = 0;
    }
  }
  p.ref.regulars += REF_ON_REFUSAL;
  const goods = colony && seized.length ? ` Royal officials seize the goods in ${colony.name}: ${seized.join(', ')}.` : '';
  const text = `You refuse the King's demand for ${demand.gold} gold.${goods} The King sends ${REF_ON_REFUSAL} more regulars to the Royal Expeditionary Force.`;
  message(s, text, nation, colony ?? undefined);
  return text;
}

// ---------------------------------------------------------------------------
// Royal wars

/**
 * Royal wars. From turn FROM, each round a nation at peace with every European nation, and with
 * no royal war in the last COOLDOWN turns, has a CHANCE (times `royalWarChance`) that its King
 * declares war on another European nation. Never on a Favoured Nation, never for or on a nation
 * that has declared independence; a trade partner is picked PARTNER_WEIGHT times as rarely as
 * other nations. Peace is made later as usual.
 */
export const ROYAL_WAR = { from: 60, chance: 0.002, cooldown: 60, partnerWeight: 0.25 };

/** The nations a nation's King may declare war on, with their weights. */
export function royalWarTargets(s: GameState, nation: NationId): { nation: NationId; weight: number }[] {
  const p = player(s, nation);
  if (p.independence !== 'none') return [];
  const out: { nation: NationId; weight: number }[] = [];
  for (const o of s.players) {
    if (o.id === nation || o.id === 'crown' || o.independence !== 'none') continue;
    if (p.stance[o.id] === 'war' || isFavoured(s, nation, o.id)) continue;
    if (!Object.values(s.colonies).some((c) => c.owner === o.id)) continue;
    out.push({ nation: o.id, weight: hasTradeAgreement(s, nation, o.id) ? ROYAL_WAR.partnerWeight : 1 });
  }
  return out;
}

/** The King declares war on another European nation for this nation. */
export function royalWar(s: GameState, nation: NationId, target: NationId): void {
  const p = player(s, nation);
  if (p.independence !== 'none' || player(s, target).independence !== 'none') fail('The King declares no wars for or on independent nations.');
  if (isFavoured(s, nation, target)) fail('The King declares no war on a Favoured Nation.');
  declareWar(s, nation, target);
  const crown = (p.royal = p.royal ?? { bells: p.bells, points: 0, added: 0 });
  crown.lastWar = s.turn;
  crown.warOn = target;
  track(nation, 'crown:royal war');
  message(s, `The King has declared war on ${NATIONS[target].name}! Your colonies are at war with ${NATIONS[target].name}, whether you want it or not. Peace can be made later, as usual.`, nation);
  message(s, `The King of ${NATIONS[nation].name} has declared war on ${NATIONS[target].name}.`, target);
}

function maybeRoyalWar(s: GameState, p: Player, colonies: number): void {
  if (s.turn < ROYAL_WAR.from || !colonies) return;
  if (Object.entries(p.stance).some(([o, st]) => st === 'war' && o !== 'crown')) return;
  if (s.turn - (p.royal?.lastWar ?? -Infinity) < ROYAL_WAR.cooldown) return;
  if (pairRandom(s, p.id, 'crown', `war ${s.turn}`) >= ROYAL_WAR.chance * difficultyRules(p).royalWarChance) return;
  const targets = royalWarTargets(s, p.id);
  const total = targets.reduce((n, t) => n + t.weight, 0);
  if (!total) return;
  let r = pairRandom(s, p.id, 'crown', `war target ${s.turn}`) * total;
  const pick = targets.find((t) => (r -= t.weight) < 0) ?? targets[targets.length - 1];
  royalWar(s, p.id, pick.nation);
}

// ---------------------------------------------------------------------------

/** Once per round: the Crown's build-up, demands and wars for every nation still loyal to it. */
export function processCrown(s: GameState): void {
  for (const p of s.players) {
    if (p.id === 'crown' || p.independence !== 'none') continue;
    const colonies = Object.values(s.colonies).filter((c) => c.owner === p.id).length;
    growForce(s, p, colonies);
    // A demand not answered within a round counts as refused.
    if (p.pendingDemand && s.turn > p.pendingDemand.turn + 1) answerDemand(s, p.id, false);
    maybeDemand(s, p, colonies);
    maybeRoyalWar(s, p, colonies);
  }
}
