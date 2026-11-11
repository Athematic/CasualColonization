/**
 * The War of Independence, 0.7 extras from the original game: mercenary companies that offer
 * their services to the rebels, a foreign power that intervenes once the rebellion has lasted and
 * holds, and Tories who resist the cause after the declaration.
 *
 * - **Mercenaries.** At the declaration, and now and then during the war, a foreign company
 *   (Hessians, Swiss, …) offers veteran soldiers, veteran dragoons and artillery for gold, sized to
 *   what the treasury can pay. People answer in the turn-start briefing, computer players on their
 *   turn (ai/royal.ts); an offer left unanswered for a round lapses.
 * - **Foreign intervention.** Modelled on the later versions of the original game, where a rival
 *   power steps in once the rebels have rung enough liberty bells after the declaration: once the
 *   war has lasted INTERVENTION.minTurns, the rebels have rung INTERVENTION.bells (times the
 *   difficulty's `interventionBells`) since the declaration, and they still hold
 *   INTERVENTION.hold of their colonies, a European power sends a force (soldiers, dragoons,
 *   artillery and men-of-war; INTERVENTION.share of the Royal Expeditionary Force that sailed).
 *   It prefers a nation that was the rebels' Favoured Nation, then a trade partner or the nation
 *   the rebels' King last made war on; otherwise a European power not in the game sends it. The
 *   force lands in the most threatened rebel colony, belongs to the rebels but takes no orders:
 *   it fights the Crown on its own (`runAllies`) and goes home when the war ends.
 * - **Tories.** After the declaration a colony whose Sons of Liberty are below
 *   TORY_COLONY_BELOW is a Tory colony: its workers produce one less (production.ts), its
 *   soldiers may desert, a colony with almost no rebels and no troops may go over to the Crown,
 *   and royal landings prefer Tory colonies and bring more troops ashore there (independence.ts).
 *
 * Every random draw comes from a seeded stream per nation and purpose (`pairRandom`), never from
 * `GameState.rng`, so none of this shifts any other random outcome.
 */
import { gridOf } from './grid.js';
import { attack, chooseDefender, defencePower, offencePower } from './combat.js';
import { fail, RuleError } from './errors.js';
import { noteHistory } from './history.js';
import { setDestination } from './movement.js';
import { sonsOfLiberty, TORY_COLONY_BELOW } from './production.js';
import {
  colonyAt,
  colonyWorkers,
  createUnit,
  isCoastal,
  isShip,
  isWater,
  message,
  neighbours,
  player,
  tileAt,
  unitPosition,
  unitsAt,
} from './queries.js';
import { hasTradeAgreement, isFavoured, pairRandom } from './relations.js';
import { type NationId } from './rules/nations.js';
import { difficultyOf, nationOf, nationSet, scenarioOf, term, Term, type ScenarioLike } from './scenarios/index.js';
import { track } from './telemetry.js';
import type { Colony, GameState, MercenaryOffer, Player, Unit } from './types.js';
import { removeUnit } from './unitindex.js';

/** A seeded draw for this nation and purpose. */
const draw = (s: GameState, nation: NationId, purpose: string) => pairRandom(s, nation, 'crown', `rebellion ${purpose}`);

/** The turn of the declaration, or the current turn for a position without one. */
const declaredOn = (s: GameState, p: Player) => p.refAtDeclaration?.turn ?? s.turn;

function rebellionOf(p: Player): NonNullable<Player['rebellion']> {
  return (p.rebellion ??= { bells: p.bells, offers: 0 });
}

/** Called by `declareIndependence` before Favoured Nation status lapses: records the friends and starts the bookkeeping. */
export function startRebellion(s: GameState, p: Player): void {
  const friends = s.players.filter((o) => o.id !== p.id && o.id !== 'crown' && isFavoured(s, p.id, o.id)).map((o) => o.id);
  p.rebellion = { bells: p.bells, offers: 0, ...(friends.length ? { friends } : {}) };
}

// ---------------------------------------------------------------------------
// Mercenaries

/**
 * Mercenary companies. A company has 2–4 veteran soldiers, 1–2 veteran dragoons and 0–2
 * artillery (seeded), at PRICE gold each times the difficulty's `mercenaryPrice` (0.7 Discoverer
 * to 1.3 Viceroy), rounded to 100. A company the treasury cannot pay shrinks (artillery leave
 * first, then dragoons, then soldiers); none comes when not even one soldier can be paid. One
 * offer comes at the declaration; during the war, from WAR.from turns after it, each round has a
 * WAR.chance (doubled once a colony is lost) of another, at most WAR.max of them, WAR.gap turns
 * apart.
 */
export const MERCENARIES = {
  names: ['Hessian', 'Swiss', 'Brunswick', 'Waldeck', 'Irish', 'Scottish'],
  price: { soldier: 1200, dragoon: 1600, artillery: 900 },
  war: { from: 3, chance: 0.05, max: 2, gap: 15 },
};

type Company = Pick<MercenaryOffer, 'soldiers' | 'dragoons' | 'artillery'>;

const companySize = (c: Company) => c.soldiers + c.dragoons + c.artillery;

function companyPrice(s: GameState, p: Player, c: Company): number {
  const { price } = MERCENARIES;
  const gold = c.soldiers * price.soldier + c.dragoons * price.dragoon + c.artillery * price.artillery;
  return Math.round((gold * difficultyOf(s, p).mercenaryPrice) / 100) * 100;
}

/**
 * The company that would offer its services to a nation on `turn` (default now), sized to what it
 * can pay, or null. Seeded, so the computer players can weigh it before declaring.
 */
export function mercenaryCompany(s: GameState, nation: NationId, turn = s.turn): MercenaryOffer | null {
  const p = player(s, nation);
  const r = (what: string) => draw(s, nation, `mercenaries ${what} ${turn}`);
  const c: Company = { soldiers: 2 + Math.floor(r('soldiers') * 3), dragoons: 1 + Math.floor(r('dragoons') * 2), artillery: Math.floor(r('artillery') * 3) };
  while (companySize(c) > 0 && companyPrice(s, p, c) > p.gold) {
    if (c.artillery) c.artillery--;
    else if (c.dragoons) c.dragoons--;
    else c.soldiers--;
  }
  if (!companySize(c)) return null;
  const name = MERCENARIES.names[Math.floor(r('name') * MERCENARIES.names.length)];
  return { name, ...c, price: companyPrice(s, p, c), turn };
}

/** "3 veteran soldiers, 1 veteran dragoon and 2 artillery". */
export function describeCompany(c: Company): string {
  const parts: string[] = [];
  if (c.soldiers) parts.push(`${c.soldiers} veteran ${c.soldiers === 1 ? 'soldier' : 'soldiers'}`);
  if (c.dragoons) parts.push(`${c.dragoons} veteran ${c.dragoons === 1 ? 'dragoon' : 'dragoons'}`);
  if (c.artillery) parts.push(`${c.artillery} artillery`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? 'nobody';
}

/** A mercenary company offers its services, if the nation can pay for one. Returns whether it did. */
export function offerMercenaries(s: GameState, nation: NationId): boolean {
  const p = player(s, nation);
  const offer = mercenaryCompany(s, nation);
  if (!offer) return false;
  p.mercenaryOffer = offer;
  const r = rebellionOf(p);
  r.offers++;
  r.lastOffer = s.turn;
  track(nation, 'rebellion:mercenaries offered');
  message(s, `A company of ${offer.name} mercenaries offers to fight for independence: ${describeCompany(offer)} for ${offer.price} gold.`, nation);
  return true;
}

/** Where hired mercenaries come ashore: the weakest coastal colony (any colony if none is coastal). */
function weakestColony(s: GameState, nation: NationId): Colony | undefined {
  const own = Object.values(s.colonies).filter((c) => c.owner === nation);
  const coastal = own.filter((c) => isCoastal(s, c.x, c.y));
  const strength = (c: Colony) => unitsAt(s, c.x, c.y).filter((u) => u.owner === nation && !isShip(u)).reduce((n, u) => n + defencePower(s, u), 0);
  return (coastal.length ? coastal : own).sort((a, b) => strength(a) - strength(b) || a.id.localeCompare(b.id))[0];
}

/** Creates soldiers, dragoons and artillery for a nation on a tile. */
function raise(s: GameState, nation: NationId, at: { x: number; y: number }, c: Company, mark: (u: Unit) => void): Unit[] {
  const out: Unit[] = [];
  const add = (type: 'veteranSoldier' | 'artillery', role: 'soldier' | 'dragoon' | 'none') => {
    const u = createUnit(s, nation, type, { kind: 'map', x: at.x, y: at.y });
    u.role = role;
    mark(u);
    out.push(u);
  };
  for (let i = 0; i < c.soldiers; i++) add('veteranSoldier', 'soldier');
  for (let i = 0; i < c.dragoons; i++) add('veteranSoldier', 'dragoon');
  for (let i = 0; i < c.artillery; i++) add('artillery', 'none');
  return out;
}

/** Hires (or turns away) the mercenary company that offers its services. */
export function answerMercenaries(s: GameState, nation: NationId, hire: boolean): string {
  const p = player(s, nation);
  const offer = p.mercenaryOffer;
  if (!offer) fail('No mercenaries are offering their services.');
  if (hire && p.gold < offer.price) fail(`The ${offer.name} mercenaries ask ${offer.price} gold; the treasury holds ${p.gold}.`);
  track(nation, 'cmd:answerMercenaries');
  delete p.mercenaryOffer;
  if (!hire) {
    track(nation, 'rebellion:mercenaries refused');
    noteHistory(s, 'independence', [nation], `${nationOf(s, nation).name} turns away a company of ${offer.name} mercenaries.`, { secret: true });
    const text = `You turn the ${offer.name} mercenaries away.`;
    message(s, text, nation);
    return text;
  }
  const colony = weakestColony(s, nation);
  if (!colony) fail('There is no colony for the mercenaries to join.');
  p.gold -= offer.price;
  raise(s, nation, colony, offer, (u) => {
    u.mercenary = true;
    u.state = 'fortified';
  });
  track(nation, 'rebellion:mercenaries hired', companySize(offer));
  noteHistory(s, 'independence', [nation], `${nationOf(s, nation).name} hires ${offer.name} mercenaries: ${describeCompany(offer)} for ${offer.price} gold.`, { at: colony });
  const text = `The ${offer.name} mercenaries (${describeCompany(offer)}) join the garrison of ${colony.name} for ${offer.price} gold.`;
  message(s, text, nation, colony);
  return text;
}

function mercenaryRound(s: GameState, p: Player, lostColony: boolean): void {
  const offer = p.mercenaryOffer;
  if (offer && s.turn > offer.turn + 1) {
    delete p.mercenaryOffer;
    track(p.id, 'rebellion:mercenaries refused');
    message(s, `With no answer, the ${offer.name} mercenaries take service elsewhere.`, p.id);
  }
  if (p.mercenaryOffer) return;
  const r = rebellionOf(p);
  const { war } = MERCENARIES;
  if (s.turn - declaredOn(s, p) < war.from || r.offers >= war.max + 1) return;
  if (s.turn - (r.lastOffer ?? -Infinity) < war.gap) return;
  if (draw(s, p.id, `mercenaries ${s.turn}`) >= war.chance * (lostColony ? 2 : 1)) return;
  offerMercenaries(s, p.id);
}

// ---------------------------------------------------------------------------
// Foreign intervention

/**
 * When and how a foreign power intervenes: see the module comment. `bells` is times the
 * difficulty's `interventionBells` (0.6 Discoverer to 1.5 Viceroy).
 */
export const INTERVENTION = { minTurns: 8, bells: 500, hold: 2 / 3, share: 0.4, minLand: 6, menOfWar: 2 };

/** Liberty bells a nation's rebels must ring after the declaration before a power intervenes. */
export function interventionBells(s: GameState, p: Player): number {
  return Math.round(INTERVENTION.bells * difficultyOf(s, p).interventionBells);
}

/** The force a power would send: INTERVENTION.share of the land units of the REF that sailed (at least minLand), half soldiers, a quarter each dragoons and artillery. */
export function interventionForce(p: Player): Company & { menOfWar: number } {
  const ref = p.refAtDeclaration?.force ?? p.ref;
  const land = Math.max(INTERVENTION.minLand, Math.round((ref.regulars + ref.dragoons + ref.artillery) * INTERVENTION.share));
  const dragoons = Math.round(land / 4);
  const artillery = Math.round(land / 4);
  return { soldiers: land - dragoons - artillery, dragoons, artillery, menOfWar: INTERVENTION.menOfWar };
}

/** How far a rebellion is from foreign intervention, for the reports. */
export function interventionStatus(s: GameState, nation: NationId): { turns: number; minTurns: number; bells: number; needBells: number; held: number; needHeld: number; came?: { by: NationId | 'foreign'; turn: number; land: number } } | null {
  const p = player(s, nation);
  if (p.independence !== 'declared' && !p.rebellion?.intervention) return null;
  const r = p.rebellion ?? { bells: p.bells, offers: 0 };
  return {
    turns: s.turn - declaredOn(s, p),
    minTurns: INTERVENTION.minTurns,
    bells: Math.max(0, p.bells - r.bells),
    needBells: interventionBells(s, p),
    held: Object.values(s.colonies).filter((c) => c.owner === nation).length,
    needHeld: Math.ceil((p.coloniesAtDeclaration ?? 1) * INTERVENTION.hold),
    ...(r.intervention ? { came: r.intervention } : {}),
  };
}

/** "France", or "A European power" for a force from no particular nation. */
export function powerName(s: ScenarioLike, by: NationId | 'foreign'): string {
  return by === 'foreign' ? term(s, 'foreignPower') : nationOf(s, by).name;
}

/**
 * The power that intervenes: a nation in the game that was the rebels' Favoured Nation (weight 4),
 * a trade partner or the nation the rebels' King last made war on (2), at peace with the rebels
 * and loyal to its own Crown; otherwise a European nation not in the game; otherwise "foreign".
 */
export function interventionPower(s: GameState, nation: NationId): NationId | 'foreign' {
  const p = player(s, nation);
  const friends = p.rebellion?.friends ?? [];
  const candidates: { id: NationId; weight: number }[] = [];
  for (const o of s.players) {
    if (o.id === nation || o.id === 'crown' || o.independence !== 'none' || p.stance[o.id] === 'war') continue;
    if (!Object.values(s.colonies).some((c) => c.owner === o.id)) continue;
    const weight = friends.includes(o.id) ? 4 : hasTradeAgreement(s, nation, o.id) || p.royal?.warOn === o.id ? 2 : 0;
    if (weight) candidates.push({ id: o.id, weight });
  }
  const r = draw(s, nation, `intervention power ${s.turn}`);
  const total = candidates.reduce((n, c) => n + c.weight, 0);
  if (total) {
    let x = r * total;
    return (candidates.find((c) => (x -= c.weight) < 0) ?? candidates[candidates.length - 1]).id;
  }
  const absent = nationSet(scenarioOf(s), s.config.rivals).map((e) => e.id).filter((n) => !s.players.some((o) => o.id === n));
  return absent.length ? absent[Math.floor(r * absent.length)] : 'foreign';
}

/** Royal land units within two tiles of a colony: how threatened it is. */
function threat(s: GameState, c: Colony): number {
  const grid = gridOf(s);
  let n = 0;
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'crown' || isShip(u) || u.loc.kind !== 'map') continue;
    if (grid.distance(u.loc.x, u.loc.y, c.x, c.y) <= 2) n++;
  }
  return n;
}

/** Sends the intervention force now, whatever the conditions (used by `processRebellion` once they are met). */
export function intervene(s: GameState, nation: NationId): void {
  const p = player(s, nation);
  const r = rebellionOf(p);
  if (r.intervention) return;
  const own = Object.values(s.colonies).filter((c) => c.owner === nation);
  const coastal = own.filter((c) => isCoastal(s, c.x, c.y));
  const target = (coastal.length ? coastal : own).sort((a, b) => threat(s, b) - threat(s, a) || a.id.localeCompare(b.id))[0];
  if (!target) return;
  const by = interventionPower(s, nation);
  const force = interventionForce(p);
  raise(s, nation, target, force, (u) => (u.ally = by));
  const sea = neighbours(s, target.x, target.y).find((q) => isWater(tileAt(s, q.x, q.y)));
  if (sea) {
    for (let i = 0; i < force.menOfWar; i++) createUnit(s, nation, 'manOfWar', { kind: 'map', ...sea }).ally = by;
  }
  const land = companySize(force);
  r.intervention = { by, turn: s.turn, land };
  track(nation, 'rebellion:intervention');
  const ships = sea ? ` and ${force.menOfWar} men-of-war` : '';
  const text = `${powerName(s, by)} intervenes in the ${term(s, 'independenceWar')}! An intervention force of ${describeCompany(force).replace(/veteran /g, '')}${ships} lands at ${target.name} to fight ${term(s, 'crown')} beside the rebels of ${nationOf(s, nation).name}.`;
  message(s, text, undefined, target);
  noteHistory(s, 'independence', by === 'foreign' || !s.players.some((o) => o.id === by) ? [nation] : [nation, by], text, { at: target });
}

function interventionRound(s: GameState, p: Player): void {
  const status = interventionStatus(s, p.id);
  if (!status || status.came) return;
  if (status.turns < status.minTurns || status.bells < status.needBells || status.held < status.needHeld) return;
  intervene(s, p.id);
}

/** When the war ends, the intervention force sails home. */
export function alliesGoHome(s: GameState, nation: NationId): void {
  const allies = Object.values(s.units).filter((u) => u.owner === nation && u.ally);
  for (const u of allies) removeUnit(s, u.id);
  if (allies.length) message(s, `The ${term(s, 'independenceWar')} is over: the intervention force sails home.`, nation);
}

// ---------------------------------------------------------------------------
// The intervention force in the field

function safely(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
  }
}

/** Odds of an attack by `u` on the tile at `q` (its best defender there). */
function odds(s: GameState, u: Unit, q: { x: number; y: number }, enemy: NationId): { odds: number; target?: Unit } {
  const target = chooseDefender(s, unitsAt(s, q.x, q.y).filter((o) => o.owner === enemy && !isShip(o)));
  if (!target) return { odds: 0 };
  const off = offencePower(s, u);
  return { odds: off / (off + defencePower(s, target)), target };
}

/** Attack odds an intervention unit takes on. */
export const ALLY_ATTACK_ODDS = 0.5;

/**
 * The intervention force's turn (it takes no orders): men-of-war attack royal ships next to them;
 * land units attack royal troops in the open next to them at ALLY_ATTACK_ODDS or better, else
 * march to the rebel colony most threatened by royal troops, and fortify there.
 */
export function runAllies(s: GameState, p: Player): void {
  if (p.independence !== 'declared') return;
  for (const u of Object.values(s.units)) {
    if (u.owner !== p.id || !u.ally || !s.units[u.id] || u.loc.kind !== 'map' || u.moves <= 0) continue;
    safely(() => allyTurn(s, p, u));
  }
}

function allyTurn(s: GameState, p: Player, u: Unit): void {
  const grid = gridOf(s);
  const pos = unitPosition(s, u)!;
  if (isShip(u)) {
    const prey = neighbours(s, pos.x, pos.y).flatMap((q) => unitsAt(s, q.x, q.y)).find((o) => o.owner === 'crown' && isShip(o));
    if (prey) attack(s, u.id, { unitId: prey.id });
    return;
  }
  const best = neighbours(s, pos.x, pos.y)
    .filter((q) => !colonyAt(s, q.x, q.y))
    .map((q) => odds(s, u, q, 'crown'))
    .filter((o) => o.target)
    .sort((a, b) => b.odds - a.odds)[0];
  if (best && best.odds >= ALLY_ATTACK_ODDS) {
    attack(s, u.id, { unitId: best.target!.id });
    return;
  }
  const own = Object.values(s.colonies).filter((c) => c.owner === p.id);
  const here = colonyAt(s, pos.x, pos.y);
  const goal = own
    .map((c) => ({ c, threat: threat(s, c) }))
    .sort((a, b) => b.threat - a.threat || grid.distance(a.c.x, a.c.y, pos.x, pos.y) - grid.distance(b.c.x, b.c.y, pos.x, pos.y) || a.c.id.localeCompare(b.c.id))[0];
  const stay = here && here.owner === p.id && (!goal || goal.threat === 0 || threat(s, here) >= goal.threat);
  if (stay || !goal) {
    if (here) u.state = 'fortified';
    return;
  }
  setDestination(s, u.id, { x: goal.c.x, y: goal.c.y });
}

// ---------------------------------------------------------------------------
// Tories

/**
 * Tory unrest after the declaration, once per round for each Tory colony (Sons of Liberty below
 * TORY_COLONY_BELOW): with DESERT a soldier, dragoon or artillery there (not a Continental, a
 * mercenary or the intervention force) deserts; a colony with Sons of Liberty below DEFECT_BELOW
 * and no rebel units at its gates goes over to the Crown with DEFECT.
 */
export const TORIES = { desert: 0.08, defectBelow: 10, defect: 0.1 };

/** Royal land units that come ashore in one wave next to a Tory colony (WAVE elsewhere, independence.ts). */
export const TORY_LANDING = 8;

/** Whether a colony of a nation at war with its Crown resists the cause. */
export function isToryColony(s: GameState, c: Colony): boolean {
  const p = s.players.find((o) => o.id === c.owner);
  if (p?.independence !== 'declared') return false;
  const pop = colonyWorkers(s, c).length;
  return pop > 0 && sonsOfLiberty(s, c, pop) < TORY_COLONY_BELOW;
}

function defect(s: GameState, p: Player, c: Colony): void {
  c.owner = 'crown';
  c.takenFrom = p.id;
  c.build = null;
  for (const w of colonyWorkers(s, c)) {
    w.owner = 'crown';
    delete w.teach;
  }
  track(p.id, 'rebellion:colony defected');
  const text = `${Term(s, 'loyalists')} in ${c.name} open the gates to ${term(s, 'crown')}: the colony declares for ${term(s, 'king')}!`;
  message(s, text, undefined, c);
  noteHistory(s, 'independence', [p.id], `${Term(s, 'loyalists')} in ${c.name} declare for ${term(s, 'king')}; ${nationOf(s, p.id).name} loses the colony.`, { at: c });
}

function toryRound(s: GameState, p: Player): void {
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== p.id || !isToryColony(s, c)) continue;
    const r = draw(s, p.id, `tories ${c.id} ${s.turn}`);
    const atGates = unitsAt(s, c.x, c.y).filter((u) => u.owner === p.id);
    if (!atGates.length && sonsOfLiberty(s, c) < TORIES.defectBelow) {
      if (r < TORIES.defect) defect(s, p, c);
      continue;
    }
    if (r >= TORIES.desert) continue;
    const deserter = atGates
      .filter((u) => (u.role === 'soldier' || u.role === 'dragoon') && !u.mercenary && !u.ally && u.type !== 'continentalSoldier')
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!deserter) continue;
    removeUnit(s, deserter.id);
    track(p.id, 'rebellion:desertion');
    message(s, `${Term(s, 'loyalist')} sentiment in ${c.name}: a ${deserter.role} deserts to ${term(s, 'crown')}.`, p.id, c);
    noteHistory(s, 'independence', [p.id], `${Term(s, 'loyalist')} sentiment in ${c.name}: troops desert.`, { secret: true, at: c });
  }
}

// ---------------------------------------------------------------------------

/** Once per round for a nation at war with its Crown (from `processIndependence`). */
export function processRebellion(s: GameState, p: Player): void {
  if (p.independence !== 'declared') return;
  rebellionOf(p);
  const lost = Object.values(s.colonies).some((c) => c.owner === 'crown' && c.takenFrom === p.id);
  toryRound(s, p);
  mercenaryRound(s, p, lost);
  interventionRound(s, p);
}

/** Mercenaries and the intervention force fighting for a nation, and how far the intervention is, for the Military report. */
export function warSupport(s: GameState, nation: NationId): { mercenaries: Unit[]; allies: Unit[]; intervention: ReturnType<typeof interventionStatus> } {
  const own = Object.values(s.units).filter((u) => u.owner === nation);
  return { mercenaries: own.filter((u) => u.mercenary), allies: own.filter((u) => u.ally), intervention: interventionStatus(s, nation) };
}
