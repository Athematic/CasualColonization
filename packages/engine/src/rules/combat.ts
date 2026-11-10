/**
 * Combat details from the original game (0.7). All numbers in one place.
 *
 * | Rule                      | Value |
 * | ------------------------- | ----- |
 * | Stockade / fort / fortress defence | +100% / +150% / +200% (rules/buildings.ts STOCKADE_DEFENCE) |
 * | Fortress                  | needs a fort and 8 colonists; 240 hammers, 100 tools |
 * | Damaged artillery         | attack 3, defence 2 (artillery: 5 and 3) |
 * | Repair, in a colony       | needs an armory; 80 hammers and 20 tools from the warehouse |
 * | Repair, in Europe         | 150 gold |
 * | Ambush: attacker in forest | +25% attack against a unit in the open |
 * | Ambush: attacker on hills | +25% |
 * | Ambush: attacker on mountains | +50% |
 * | Coastal bombardment       | fort 30%, fortress 50% per adjacent enemy ship, at the start of the owner's turn |
 * | Captured equipment        | the winner takes the loser's horses or muskets in the open with a 50% chance |
 */
export const AMBUSH_BONUS = { forest: 25, hills: 25, mountains: 50 } as const;

/** Per fort level (index 0 = stockade): the chance a coastal colony damages an adjacent enemy ship. */
export const BOMBARD_CHANCE = [0, 0.3, 0.5];

export const REPAIR_COST = { hammers: 80, tools: 20, gold: 150 };

/** Chance that a winner without equipment picks up the loser's horses or muskets. */
export const CAPTURE_CHANCE = 0.5;
