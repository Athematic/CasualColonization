import { attack, declareWar, defencePower } from './combat.js';
import { fail, RuleError } from './errors.js';
import { newPlayer } from './game.js';
import { findPath, setDestination } from './movement.js';
import { sonsOfLiberty } from './production.js';
import {
  colonyAt,
  colonyWorkers,
  createUnit,
  distance,
  isCoastal,
  isShip,
  isWater,
  message,
  neighbours,
  player,
  settlementAt,
  tileAt,
  unitPosition,
  unitsAt,
} from './queries.js';
import { NATIONS, type NationId } from './rules/nations.js';
import { finalScores } from './score.js';
import type { Colony, GameState, Player, Unit } from './types.js';

/** Share of all colonists, across every colony, who support independence. */
export function rebelShare(s: GameState, nation: NationId): number {
  let pop = 0;
  let rebels = 0;
  for (const c of Object.values(s.colonies)) {
    if (c.owner !== nation) continue;
    const n = colonyWorkers(s, c).length;
    pop += n;
    rebels += (n * sonsOfLiberty(s, c)) / 100;
  }
  return pop ? Math.round((rebels / pop) * 100) : 0;
}

export const DECLARE_AT = 50;

export function canDeclareIndependence(s: GameState, nation: NationId): string | null {
  const p = player(s, nation);
  if (p.independence !== 'none') return 'Independence has already been declared.';
  if (!Object.values(s.colonies).some((c) => c.owner === nation)) return 'You have no colonies.';
  const share = rebelShare(s, nation);
  if (share < DECLARE_AT) return `Only ${share}% of colonists support independence; ${DECLARE_AT}% are needed.`;
  return null;
}

function ensureCrown(s: GameState): Player {
  let crown = s.players.find((p) => p.id === 'crown');
  if (!crown) {
    crown = newPlayer(s, 'crown', false, { x: s.map.width - 2, y: Math.floor(s.map.height / 2) });
    crown.explored.fill(1);
    crown.gold = 0;
    s.players.push(crown);
  }
  return crown;
}

export function declareIndependence(s: GameState, nation: NationId): string {
  const reason = canDeclareIndependence(s, nation);
  if (reason) fail(reason);
  const p = player(s, nation);
  const colonies = Object.values(s.colonies).filter((c) => c.owner === nation);
  p.independence = 'declared';
  p.tax = 0;
  p.boycotts = {};
  p.pendingTax = null;
  p.coloniesAtDeclaration = colonies.length;
  const n = colonies.length;
  p.ref = { regulars: 4 + 2 * n, dragoons: 2 + n, artillery: 1 + Math.floor(n / 2), menOfWar: 2 };
  ensureCrown(s);
  declareWar(s, nation, 'crown');

  // Everything left in Europe is confiscated.
  for (const u of Object.values(s.units)) {
    if (u.owner !== nation) continue;
    const inEurope = u.loc.kind === 'europe' || (u.loc.kind === 'sailing' && u.loc.to === 'europe');
    const aboardInEurope = u.loc.kind === 'carrier' && s.units[u.loc.carrierId]?.loc.kind === 'europe';
    if (inEurope || aboardInEurope) delete s.units[u.id];
  }
  // Veterans, and half the soldiers of committed colonies, form the Continental Army.
  let continentals = 0;
  for (const u of Object.values(s.units)) {
    if (u.owner !== nation || (u.role !== 'soldier' && u.role !== 'dragoon')) continue;
    const pos = unitPosition(s, u);
    const colony = pos && colonyAt(s, pos.x, pos.y);
    const committed = colony && sonsOfLiberty(s, colony) >= 50;
    if (u.type === 'veteranSoldier' || (committed && continentals % 2 === 0)) {
      u.type = 'continentalSoldier';
      continentals++;
    } else if (committed) continentals++;
  }
  const text = `${NATIONS[nation].name}'s colonies have declared independence! The Crown sends ${p.ref.regulars} regulars, ${p.ref.dragoons} dragoons and ${p.ref.artillery} artillery to crush the rebellion.`;
  message(s, text);
  return text;
}

function colonyStrength(s: GameState, c: Colony): number {
  return unitsAt(s, c.x, c.y)
    .filter((u) => u.owner === c.owner && !isShip(u))
    .reduce((sum, u) => sum + defencePower(s, u), 0);
}

function landingTiles(s: GameState, c: Colony): { x: number; y: number }[] {
  const near = neighbours(s, c.x, c.y);
  const ring = near.flatMap((p) => neighbours(s, p.x, p.y)).filter((p) => distance(p.x, p.y, c.x, c.y) === 2);
  const free = (list: { x: number; y: number }[]) => list.filter((p) => {
    const t = tileAt(s, p.x, p.y)!;
    if (isWater(t) || colonyAt(s, p.x, p.y) || settlementAt(s, p.x, p.y)) return false;
    return unitsAt(s, p.x, p.y).every((u) => u.owner === 'crown');
  });
  const first = free(near);
  return first.length ? first : [...new Map(free(ring).map((p) => [`${p.x},${p.y}`, p])).values()];
}

/** Lands the next wave of the Royal Expeditionary Force next to the weakest coastal rebel colony. */
function landWave(s: GameState, p: Player): void {
  const ref = p.ref;
  if (ref.regulars + ref.dragoons + ref.artillery + ref.menOfWar === 0) return;
  const targets = Object.values(s.colonies)
    .filter((c) => c.owner === p.id && isCoastal(s, c.x, c.y))
    .sort((a, b) => colonyStrength(s, a) - colonyStrength(s, b));
  const all = targets.length ? targets : Object.values(s.colonies).filter((c) => c.owner === p.id);
  for (const target of all) {
    const tiles = landingTiles(s, target);
    if (!tiles.length) continue;
    let landed = 0;
    while (landed < 6 && ref.regulars + ref.dragoons + ref.artillery > 0) {
      const at = tiles[landed % tiles.length];
      let u: Unit;
      if (ref.artillery > 0 && landed % 3 === 2) {
        u = createUnit(s, 'crown', 'artillery', { kind: 'map', ...at });
        ref.artillery--;
      } else if (ref.dragoons > 0 && (landed % 2 === 1 || ref.regulars === 0)) {
        u = createUnit(s, 'crown', 'kingsRegular', { kind: 'map', ...at });
        u.role = 'dragoon';
        ref.dragoons--;
      } else if (ref.regulars > 0) {
        u = createUnit(s, 'crown', 'kingsRegular', { kind: 'map', ...at });
        u.role = 'soldier';
        ref.regulars--;
      } else {
        u = createUnit(s, 'crown', 'artillery', { kind: 'map', ...at });
        ref.artillery--;
      }
      u.against = p.id;
      landed++;
    }
    const sea = neighbours(s, target.x, target.y).find((q) => isWater(tileAt(s, q.x, q.y)));
    while (sea && ref.menOfWar > 0) {
      const ship = createUnit(s, 'crown', 'manOfWar', { kind: 'map', ...sea });
      ship.against = p.id;
      ref.menOfWar--;
    }
    if (landed) message(s, `Royal troops land outside ${target.name}!`, p.id, target);
    return;
  }
}

function checkOutcome(s: GameState, p: Player): void {
  const ref = p.ref;
  const royalsLeft = Object.values(s.units).some((u) => u.owner === 'crown' && u.against === p.id && !isShip(u));
  if (ref.regulars + ref.dragoons + ref.artillery === 0 && !royalsLeft) {
    p.independence = 'won';
    for (const u of Object.values(s.units)) if (u.owner === 'crown' && u.against === p.id) delete s.units[u.id];
    const text = `${NATIONS[p.id].name} has won the War of Independence! A new nation is born.`;
    message(s, text);
    if (!s.gameOver) s.gameOver = { turn: s.turn, reason: text, winner: p.id, scores: finalScores(s) };
    return;
  }
  const held = Object.values(s.colonies).filter((c) => c.owner === p.id).length;
  const lost = Object.values(s.colonies).filter((c) => c.owner === 'crown' && c.takenFrom === p.id).length;
  if (lost > 0 && held <= Math.floor((p.coloniesAtDeclaration ?? 1) / 2)) {
    p.independence = 'lost';
    const text = `The rebellion in ${NATIONS[p.id].name}'s colonies has been crushed.`;
    message(s, text);
    const humansLeft = s.players.some((o) => o.human && o.independence !== 'lost');
    if (!humansLeft && !s.gameOver) s.gameOver = { turn: s.turn, reason: text, scores: finalScores(s) };
  }
}

/** Once per round, for every nation at war with the Crown. */
export function processIndependence(s: GameState): void {
  for (const p of s.players) {
    if (p.independence !== 'declared') continue;
    landWave(s, p);
    checkOutcome(s, p);
  }
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
  }
}

/** The Crown's troops march on the nearest rebel colony and attack it. */
export function runCrown(s: GameState): void {
  for (const u of Object.values(s.units)) {
    if (u.owner !== 'crown' || !s.units[u.id] || u.loc.kind !== 'map') continue;
    safely(() => crownUnit(s, u));
  }
}

function crownUnit(s: GameState, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const enemy = (o: { owner: NationId }) => o.owner === u.against;
  if (isShip(u)) {
    const prey = neighbours(s, pos.x, pos.y).flatMap((q) => unitsAt(s, q.x, q.y)).find((o) => enemy(o) && isShip(o));
    if (prey && u.moves > 0) attack(s, u.id, { unitId: prey.id });
    return;
  }
  const colonies = Object.values(s.colonies).filter(enemy);
  if (!colonies.length) return;
  const target = colonies.sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))[0];
  if (distance(target.x, target.y, pos.x, pos.y) === 1) {
    attack(s, u.id, { colonyId: target.id });
    return;
  }
  // Clear rebels out of the way first.
  const blocker = neighbours(s, pos.x, pos.y).flatMap((q) => unitsAt(s, q.x, q.y)).find((o) => enemy(o) && !isShip(o));
  if (blocker) {
    attack(s, u.id, { unitId: blocker.id });
    return;
  }
  const approach = neighbours(s, target.x, target.y)
    .filter((q) => !isWater(tileAt(s, q.x, q.y)) && !colonyAt(s, q.x, q.y) && !settlementAt(s, q.x, q.y))
    .map((q) => ({ q, path: findPath(s, u, q.x, q.y) }))
    .filter((r) => r.path)
    .sort((a, b) => a.path!.length - b.path!.length)[0];
  if (!approach) return;
  setDestination(s, u.id, approach.q);
  const now = unitPosition(s, u);
  if (now && u.moves > 0 && distance(now.x, now.y, target.x, target.y) === 1) attack(s, u.id, { colonyId: target.id });
}
