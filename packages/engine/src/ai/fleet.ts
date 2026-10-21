/**
 * Fleet planning for the advanced computer levels: more cargo ships as the colonies produce
 * more than the fleet can carry, a galleon for treasure, warships for aggressive nations, and
 * ships from a colony's own shipyard.
 */
import { train } from '../europe.js';
import { colonyWorkers, isCoastal, isShip } from '../queries.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import type { BuildTarget, Colony, GameState, Player } from '../types.js';
import { ownColonies, safely } from './common.js';
import type { AiProfile } from './profiles.js';

/** Goods the merchant fleet carries to Europe. */
const EXPORTS = ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'] as const;

export interface FleetReport {
  /** Cargo ships, and their holds in units of 100. */
  cargoShips: number;
  holds: number;
  warships: number;
  galleons: number;
  /** Export goods waiting in coastal colonies, in units of 100. */
  waiting: number;
  coastal: number;
  /** Treasure trains waiting for transport, and their total value. */
  treasure: number;
}

export function fleetReport(s: GameState, p: Player): FleetReport {
  const r: FleetReport = { cargoShips: 0, holds: 0, warships: 0, galleons: 0, waiting: 0, coastal: 0, treasure: 0 };
  for (const u of Object.values(s.units)) {
    if (u.owner !== p.id) continue;
    if (u.type === 'treasure') r.treasure += u.treasure ?? 0;
    if (!isShip(u)) continue;
    const def = UNIT_TYPES[u.type];
    if (def.offence > 0) r.warships++;
    else {
      r.cargoShips++;
      r.holds += def.cargo;
      if (u.type === 'galleon') r.galleons++;
    }
  }
  for (const c of ownColonies(s, p)) {
    if (!isCoastal(s, c.x, c.y)) continue;
    r.coastal++;
    for (const g of EXPORTS) if (c.goods[g] >= 50) r.waiting += c.goods[g] / 100;
  }
  return r;
}

/** The cargo ship the nation should buy now, if any. */
export function cargoShipWanted(r: FleetReport, spare: number): UnitTypeId | null {
  if (r.coastal === 0) return null;
  // Room for every coastal colony's harvest, with one ship per two ports at most.
  const short = r.waiting > r.holds * 1.5 || r.holds < Math.ceil(r.coastal / 2) * 2;
  const room = r.cargoShips < 1 + Math.ceil(r.coastal / 2);
  if (!short || !room) return null;
  const galleon = UNIT_TYPES.galleon.price!;
  const merchantman = UNIT_TYPES.merchantman.price!;
  // A galleon pays for itself on a big treasure: the Crown would take half.
  if (r.galleons === 0 && r.treasure >= galleon && spare >= galleon) return 'galleon';
  if (spare >= galleon + 2500 && r.holds >= 4) return 'galleon';
  if (spare >= merchantman + 500) return 'merchantman';
  return null;
}

/** The warship an aggressive nation should buy now, if any. */
export function warshipWanted(s: GameState, p: Player, prof: AiProfile, r: FleetReport, spare: number): UnitTypeId | null {
  if (prof.aggression < 0.5 || s.turn < 60) return null;
  const atWar = Object.entries(p.stance).some(([o, st]) => st === 'war' && o !== 'crown');
  const colonies = ownColonies(s, p).length;
  const wanted = (prof.piracy ? 1 : 0) + (atWar ? 1 : 0) + Math.floor(colonies / 10);
  if (r.warships >= wanted) return null;
  const frigate = UNIT_TYPES.frigate.price!;
  if (atWar && spare >= frigate + 2000) return 'frigate';
  if (prof.piracy && spare >= UNIT_TYPES.privateer.price! + 1500) return 'privateer';
  return null;
}

/** Buys ships in Europe as the economy grows. Call with a ship in port in Europe. */
export function buyShips(s: GameState, p: Player, prof: AiProfile): void {
  const r = fleetReport(s, p);
  const cargo = cargoShipWanted(r, p.gold - prof.reserve);
  if (cargo) safely(() => train(s, p.id, cargo));
  const war = warshipWanted(s, p, prof, fleetReport(s, p), p.gold - prof.reserve);
  if (war) safely(() => train(s, p.id, war));
}

/** A ship for a colony with a shipyard to build, when the fleet is short of one. */
export function shipToBuild(s: GameState, p: Player, c: Colony, prof: AiProfile): BuildTarget | null {
  if (c.buildings.docks < 3 || colonyWorkers(s, c).length < 8) return null;
  // One ship on the slips across the nation at a time.
  if (ownColonies(s, p).some((o) => o.id !== c.id && o.build?.kind === 'unit' && UNIT_TYPES[o.build.id].kind === 'ship')) return null;
  const r = fleetReport(s, p);
  const war = warshipWanted(s, p, prof, r, Infinity);
  if (war) return { kind: 'unit', id: war };
  const cargo = cargoShipWanted(r, Infinity);
  return cargo ? { kind: 'unit', id: cargo === 'galleon' ? 'galleon' : 'merchantman' } : null;
}
