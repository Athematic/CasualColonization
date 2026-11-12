/**
 * Passive effects as data (docs/design/scenario-framework.md, section 4.1). A modifier names a
 * hook point in the engine and carries plain numbers; council members (rules/fathers.ts) and the
 * nations' bonuses (the scenario's NationEntry) declare them, and the engine reads them with
 * `modifiers(s, nation, hook)` (scenarios/modifiers.ts) where it used to check a father or a
 * nation id.
 *
 * Each hook says how its modifiers combine. `set` replaces the engine's constant (the last one
 * wins), `mul` factors multiply in turn and `add`s add, always in the order the modifiers are
 * collected: the nation's bonus first, then the council members in the council's order. Every
 * hook reproduces the arithmetic and rounding the engine had before, so the Americas play
 * exactly as they did.
 */
import type { BuildingKind } from './buildings.js';
import type { GoodId } from './goods.js';
import type { WayId } from './peoples.js';
import type { RoleId, UnitTypeId } from './units.js';

/** The outcomes of a Lost City Rumour (rumours.ts). */
export type RumourOutcome = 'nothing' | 'tales' | 'smallTreasure' | 'colonist' | 'treasure' | 'fountain' | 'lost' | 'burial';

export type Modifier =
  // ---- Production (production.ts) ----
  /** A worked tile's yield of a good, multiplied (Henry Hudson: furs × 2). */
  | { hook: 'tileYield'; good: GoodId; mul: number }
  /** Buildings that turn an input into an output work this much harder, rounded (Adam Smith: × 1.5, not the carpenter). */
  | { hook: 'manufactureCapacity'; mul: number; except?: BuildingKind[] }
  /** A building's output, multiplied and rounded (William Penn: the church × 1.5). */
  | { hook: 'buildingOutput'; building: BuildingKind; mul: number }
  /** Percent added to the town hall's bells: a number, or the nation's tax rate (Jefferson +10, Paine + tax). */
  | { hook: 'bellsBonus'; add: number | 'tax' }
  /** Food a colony needs to grow (default 200; Denmark 160). */
  | { hook: 'foodToGrow'; set: number }
  /** A colony of at least this many colonists gets a stockade at the end of its turn (La Salle). */
  | { hook: 'autoStockade'; minColonists: number }
  /** A building that needs a council member may be built (Peter Stuyvesant: the custom house). */
  | { hook: 'unlockBuilding'; building: BuildingKind }

  // ---- A people's economy (native-nations.md T10; peopleeconomy.ts, land.ts) ----
  /** A worked tile's yield got by one way (rules/peoples.ts `wayOf`), multiplied and rounded (the Weir Builders: fishing × 1.5). */
  | { hook: 'wayYield'; way: WayId; mul: number }
  /** Food each of a people's towns can keep in store, added (the Keepers of the Stores: +100). */
  | { hook: 'townStore'; add: number }
  /** Turns an elder needs to teach a skill of the people's ways, added (the Elders: −1). */
  | { hook: 'teachTurns'; add: number }
  /** Health a region where the people has a town regains in a year it is not over-hunted, added (the Hunt Leaders: +5). */
  | { hook: 'landRecovery'; add: number }

  // ---- Europe (europe.ts, queries.ts) ----
  /** Turns to sail between Europe and the map, added (Magellan −1). */
  | { hook: 'sailTurns'; add: number }
  /** Moves of ships, added (Magellan +1, Portugal +1). */
  | { hook: 'shipMoves'; add: number }
  /** Market recovery chance: `set` replaces the base 0.1 (the Netherlands 0.2), `mul` multiplies it (Jan de Witt × 2). */
  | { hook: 'priceRecovery'; set?: number; mul?: number }
  /** Crosses added to the next immigrant's price before the difficulty (default 20; England 12). */
  | { hook: 'crossesStep'; set: number }
  /** Unit types that never arrive as immigrants (William Brewster: criminals and servants). */
  | { hook: 'immigrantsExcluded'; units: UnitTypeId[] }
  /** The most skilled candidate in the recruit pool arrives instead of a random one (William Brewster). */
  | { hook: 'chooseImmigrant' }
  /** Units waiting on the docks in Europe when the game starts (Sweden: an expert lumberjack). */
  | { hook: 'startingDocks'; units: UnitTypeId[] }

  // ---- Exploration (queries.ts, rumours.ts) ----
  /** Sight radius, added: for units in one of `roles`, or for land units with `land` (Russia: scouts and dragoons; de Soto: land units). */
  | { hook: 'sight'; add: number; roles?: RoleId[]; land?: boolean }
  /** A rumour outcome's weight, multiplied (Hernando de Soto: no tall tales and no lost expeditions, × 0). */
  | { hook: 'rumourOutcome'; outcome: RumourOutcome; mul: number }

  // ---- Natives (natives.ts) ----
  /** The price natives ask for land (Peter Minuit: 0). */
  | { hook: 'landPrice'; set: number }
  /** Added to the chance a chief gives a gift (France +0.15). */
  | { hook: 'nativeGifts'; add: number }
  /** Unit types native settlements teach although they otherwise refuse to (France: petty criminals). */
  | { hook: 'nativesTeach'; units: UnitTypeId[] }
  /** A mission's chance to win a convert, multiplied (Jean de Brébeuf × 2). */
  | { hook: 'conversionChance'; mul: number }
  /** What a mission's converts become (Bartolomé de las Casas: free colonists). */
  | { hook: 'convertsBecome'; unit: UnitTypeId }

  // ---- Combat (combat.ts) ----
  /** A unit type's offence, multiplied (Francis Drake: privateers × 1.5). */
  | { hook: 'unitOffence'; unit: UnitTypeId; mul: number }
  /** Offence against native settlements, multiplied (Spain × 1.5). */
  | { hook: 'offenceVsSettlements'; mul: number }
  /** Unarmed colonists defend as soldiers when the colony holds this many muskets (Paul Revere: 50). */
  | { hook: 'armedFromStock'; muskets: number }
  /** Armed colonists who win a battle are always promoted (George Washington); a people's townsperson always becomes a warrior (the War Leaders). */
  | { hook: 'alwaysPromote' }
  /** Treasure from a burned city or capital, multiplied and rounded (Hernán Cortés × 1.5). */
  | { hook: 'conquestTreasure'; mul: number }
  /** The Crown's fee for carrying treasure (default half; Hernán Cortés: 0). */
  | { hook: 'treasureFee'; set: number }
  /** A burned settlement yields `min` plus up to `spread` − 1 units (Juan de Sepúlveda: 1–2 converts). */
  | { hook: 'conquestConverts'; unit: UnitTypeId; min: number; spread: number }

  // ---- Diplomacy (diplomacy.ts) ----
  /** Other European nations always accept peace (Benjamin Franklin). */
  | { hook: 'peaceAccepted' };

export type Hook = Modifier['hook'];

/** The modifiers of one hook, typed. */
export type ModifierOf<H extends Hook> = Extract<Modifier, { hook: H }>;
