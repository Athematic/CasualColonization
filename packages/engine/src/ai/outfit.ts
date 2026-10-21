/**
 * Buying specialists in Europe. Trained experts arrive as plain colonists, so a hardy pioneer,
 * seasoned scout or veteran soldier is only useful once it has been given its tools, horses or
 * muskets. Without that the computer kept buying the same specialist over and over, because it
 * never saw a pioneer, scout or soldier arrive.
 */
import { buyPrice, equipInEurope, train, trainPrice } from '../europe.js';
import type { GoodId } from '../rules/goods.js';
import { PIONEER_MAX_TOOLS, ROLES, UNIT_TYPES, type RoleId, type UnitTypeId } from '../rules/units.js';
import type { GameState, Player, Unit } from '../types.js';
import { safely } from './common.js';

/** Gold needed to give a colonist a role in Europe. */
export function outfitPrice(p: Player, role: RoleId): number {
  if (role === 'pioneer') return PIONEER_MAX_TOOLS * buyPrice(p, 'tools');
  let cost = 0;
  for (const [g, n] of Object.entries(ROLES[role].goods)) cost += (n ?? 0) * buyPrice(p, g as GoodId);
  return cost;
}

/** Price of a unit bought in Europe together with the equipment its speciality needs. */
export function equippedPrice(p: Player, type: UnitTypeId): number {
  const def = UNIT_TYPES[type];
  return trainPrice(p, type) + (def.expertRole ? outfitPrice(p, def.expertRole) : 0);
}

/** Trains a unit in Europe and equips it for its speciality. Returns the unit. */
export function trainEquipped(s: GameState, p: Player, type: UnitTypeId): Unit {
  const u = train(s, p.id, type);
  const role = UNIT_TYPES[type].expertRole;
  if (role && p.gold >= outfitPrice(p, role)) safely(() => equipInEurope(s, u.id, role));
  return u;
}
