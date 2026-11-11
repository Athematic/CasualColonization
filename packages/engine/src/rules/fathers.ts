import type { Effect } from '../events/types.js';
import type { Modifier } from './modifiers.js';
import type { PlayerId } from './nations.js';

/**
 * A council's categories are open (native-nations.md T8): each council names its own (scenarios/types.ts
 * `Council.categories`). The Continental Congress's five are `CongressCategory`.
 */
export type FatherCategory = string;

/** The Continental Congress's five categories (the Americas and the Caribbean). */
export type CongressCategory = 'trade' | 'exploration' | 'military' | 'political' | 'religious';

export type FatherId =
  | 'adamSmith'
  | 'jakobFugger'
  | 'peterMinuit'
  | 'peterStuyvesant'
  | 'janDeWitt'
  | 'ferdinandMagellan'
  | 'franciscoDeCoronado'
  | 'hernandoDeSoto'
  | 'henryHudson'
  | 'laSalle'
  | 'hernanCortes'
  | 'georgeWashington'
  | 'paulRevere'
  | 'francisDrake'
  | 'johnPaulJones'
  | 'thomasJefferson'
  | 'pocahontas'
  | 'thomasPaine'
  | 'simonBolivar'
  | 'benjaminFranklin'
  | 'williamBrewster'
  | 'williamPenn'
  | 'jeanDeBrebeuf'
  | 'juanDeSepulveda'
  | 'bartolomeDeLasCasas'
  // The Caribbean, 1650–1750 (scenarios/caribbean.ts).
  | 'henryMorgan'
  | 'williamDampier'
  | 'mariaSibyllaMerian';

export interface FatherDef {
  id: FatherId;
  name: string;
  category: FatherCategory;
  effect: string;
  /** Relative chance of being offered; some fathers only become likely later. */
  weight: number;
  /** What the effect does while the father is in the council, read at the engine's hook points (rules/modifiers.ts). */
  modifiers?: Modifier[];
  /** Applied once, in order, when the father joins (the events' effects, events/effects.ts). */
  onJoin?: Effect[];
  /** The name is plural, a collective figure ("The Clan Mothers join the Council"). */
  plural?: boolean;
  /** Offered only to these players (a named person of one people sits only in that people's council). Absent: anyone. */
  peoples?: PlayerId[];
  /**
   * How the member is shown: `emblem` draws a neutral emblem with its initials, never a face (native-nations.md
   * T9: no invented likenesses). Absent: a portrait (the sprite pack's, else the procedural figure).
   */
  portrait?: 'emblem';
  /** Where the member is documented (a work and its publisher), for the catalogue's readers. */
  source?: string;
}

const f = (id: FatherId, name: string, category: FatherCategory, effect: string, weight = 5, more: Partial<FatherDef> = {}): FatherDef => ({ id, name, category, effect, weight, ...more });

export const FATHERS = {
  adamSmith: f('adamSmith', 'Adam Smith', 'trade', 'Manufacturing buildings produce 50% more.', 5, {
    modifiers: [{ hook: 'manufactureCapacity', mul: 1.5, except: ['carpenter'] }],
  }),
  jakobFugger: f('jakobFugger', 'Jakob Fugger', 'trade', 'All boycotts are lifted without paying arrears.', 3, {
    onJoin: [{ kind: 'liftBoycotts' }],
  }),
  peterMinuit: f('peterMinuit', 'Peter Minuit', 'trade', 'Natives ask nothing for their land.', 5, {
    modifiers: [{ hook: 'landPrice', set: 0 }],
  }),
  peterStuyvesant: f('peterStuyvesant', 'Peter Stuyvesant', 'trade', 'Colonies may build a Custom House.', 6, {
    modifiers: [{ hook: 'unlockBuilding', building: 'customHouse' }],
  }),
  janDeWitt: f('janDeWitt', 'Jan de Witt', 'trade', 'Market prices recover twice as fast.', 5, {
    modifiers: [{ hook: 'priceRecovery', mul: 2 }],
  }),
  ferdinandMagellan: f('ferdinandMagellan', 'Ferdinand Magellan', 'exploration', 'Ships gain a move and reach Europe a turn sooner.', 5, {
    modifiers: [{ hook: 'shipMoves', add: 1 }, { hook: 'sailTurns', add: -1 }],
  }),
  franciscoDeCoronado: f('franciscoDeCoronado', 'Francisco de Coronado', 'exploration', 'The surroundings of every existing colony are revealed.', 5, {
    onJoin: [{ kind: 'revealColonies', radius: 3 }],
  }),
  hernandoDeSoto: f('hernandoDeSoto', 'Hernando de Soto', 'exploration', 'Land units see further, and rumours are always worth exploring.', 5, {
    modifiers: [
      { hook: 'sight', add: 1, land: true },
      { hook: 'rumourOutcome', outcome: 'nothing', mul: 0 },
      { hook: 'rumourOutcome', outcome: 'lost', mul: 0 },
    ],
  }),
  henryHudson: f('henryHudson', 'Henry Hudson', 'exploration', 'Fur trapping produces 100% more.', 5, {
    modifiers: [{ hook: 'tileYield', good: 'furs', mul: 2 }],
  }),
  laSalle: f('laSalle', 'René-Robert de La Salle', 'exploration', 'Every colony of three or more gets a free stockade.', 5, {
    modifiers: [{ hook: 'autoStockade', minColonists: 3 }],
    onJoin: [{ kind: 'stockades', minColonists: 3 }],
  }),
  hernanCortes: f('hernanCortes', 'Hernán Cortés', 'military', 'Conquered settlements yield more treasure, and the Crown carries it free of charge.', 5, {
    modifiers: [{ hook: 'conquestTreasure', mul: 1.5 }, { hook: 'treasureFee', set: 0 }],
  }),
  georgeWashington: f('georgeWashington', 'George Washington', 'military', 'Soldiers and dragoons who win a battle become veterans.', 5, {
    modifiers: [{ hook: 'alwaysPromote' }],
  }),
  paulRevere: f('paulRevere', 'Paul Revere', 'military', 'Colonists take up stored muskets when a colony without soldiers is attacked.', 5, {
    modifiers: [{ hook: 'armedFromStock', muskets: 50 }],
  }),
  francisDrake: f('francisDrake', 'Francis Drake', 'military', 'Privateers fight 50% harder.', 5, {
    modifiers: [{ hook: 'unitOffence', unit: 'privateer', mul: 1.5 }],
  }),
  johnPaulJones: f('johnPaulJones', 'John Paul Jones', 'military', 'A frigate joins your fleet.', 3, {
    onJoin: [{ kind: 'unit', type: 'frigate', where: 'europe', always: true }],
  }),
  thomasJefferson: f('thomasJefferson', 'Thomas Jefferson', 'political', 'Liberty bell production rises by 10%.', 7, {
    modifiers: [{ hook: 'bellsBonus', add: 10 }],
  }),
  pocahontas: f('pocahontas', 'Pocahontas', 'political', 'All native tension disappears and every tribe makes peace.', 4, {
    onJoin: [{ kind: 'peaceWithPeoples' }],
  }),
  thomasPaine: f('thomasPaine', 'Thomas Paine', 'political', 'Liberty bell production rises by the current tax rate.', 5, {
    modifiers: [{ hook: 'bellsBonus', add: 'tax' }],
  }),
  simonBolivar: f('simonBolivar', 'Simón Bolívar', 'political', 'Sons of Liberty membership rises by 20% in every colony.', 3, {
    onJoin: [{ kind: 'liberty', share: 0.2 }],
  }),
  benjaminFranklin: f('benjaminFranklin', 'Benjamin Franklin', 'political', 'Other European nations always accept peace.', 5, {
    modifiers: [{ hook: 'peaceAccepted' }],
  }),
  williamBrewster: f('williamBrewster', 'William Brewster', 'religious', 'Criminals and servants no longer arrive as immigrants.', 7, {
    modifiers: [{ hook: 'immigrantsExcluded', units: ['pettyCriminal', 'indenturedServant'] }, { hook: 'chooseImmigrant' }],
  }),
  williamPenn: f('williamPenn', 'William Penn', 'religious', 'Cross production rises by 50%.', 5, {
    modifiers: [{ hook: 'buildingOutput', building: 'church', mul: 1.5 }],
  }),
  jeanDeBrebeuf: f('jeanDeBrebeuf', 'Jean de Brébeuf', 'religious', 'Missions convert natives twice as often.', 5, {
    modifiers: [{ hook: 'conversionChance', mul: 2 }],
  }),
  juanDeSepulveda: f('juanDeSepulveda', 'Juan Ginés de Sepúlveda', 'religious', 'Conquering a settlement brings converts.', 5, {
    modifiers: [{ hook: 'conquestConverts', unit: 'nativeConvert', min: 1, spread: 2 }],
  }),
  bartolomeDeLasCasas: f('bartolomeDeLasCasas', 'Bartolomé de las Casas', 'religious', 'All native converts become free colonists.', 3, {
    modifiers: [{ hook: 'convertsBecome', unit: 'freeColonist' }],
    onJoin: [{ kind: 'convertUnits', from: 'nativeConvert', to: 'freeColonist' }],
  }),
} as Record<FatherId, FatherDef>;

/**
 * Members of the Caribbean's council (scenarios/caribbean.ts), real people of the region and the
 * period whose effects reuse the hooks above. Not in the Americas' Continental Congress.
 */
Object.assign(FATHERS, {
  // Henry Morgan (c. 1635–1688), Welsh privateer sailing from Port Royal under commissions from the
  // governor of Jamaica: Portobelo (1668), Maracaibo (1669), Panama (1671); later Lieutenant
  // Governor of Jamaica.
  henryMorgan: f('henryMorgan', 'Henry Morgan', 'military', 'Privateers fight 50% harder.', 5, {
    modifiers: [{ hook: 'unitOffence', unit: 'privateer', mul: 1.5 }],
  }),
  // William Dampier (1651–1715), English buccaneer, navigator and naturalist; his "New Voyage Round
  // the World" (1697) and "Discourse of Winds" (1699) charted the trade winds, currents and storms.
  williamDampier: f('williamDampier', 'William Dampier', 'exploration', 'Ships gain one extra move.', 5, {
    modifiers: [{ hook: 'shipMoves', add: 1 }],
  }),
  // Maria Sibylla Merian (1647–1717), German naturalist and artist, who sailed to Dutch Suriname
  // in 1699 to study its plants and insects and published "Metamorphosis insectorum Surinamensium" (1705).
  mariaSibyllaMerian: f('mariaSibyllaMerian', 'Maria Sibylla Merian', 'exploration', 'Scouts see one tile further, and rumours bring travellers\' accounts of the land twice as often.', 5, {
    modifiers: [
      { hook: 'sight', add: 1, roles: ['scout'] },
      { hook: 'rumourOutcome', outcome: 'tales', mul: 2 },
    ],
  }),
} satisfies Partial<Record<FatherId, FatherDef>>);

/** The Americas' Continental Congress: the 25 Founding Fathers, in catalogue order. */
export const AMERICAS_FATHERS: FatherId[] = [
  'adamSmith', 'jakobFugger', 'peterMinuit', 'peterStuyvesant', 'janDeWitt', 'ferdinandMagellan', 'franciscoDeCoronado',
  'hernandoDeSoto', 'henryHudson', 'laSalle', 'hernanCortes', 'georgeWashington', 'paulRevere', 'francisDrake',
  'johnPaulJones', 'thomasJefferson', 'pocahontas', 'thomasPaine', 'simonBolivar', 'benjaminFranklin',
  'williamBrewster', 'williamPenn', 'jeanDeBrebeuf', 'juanDeSepulveda', 'bartolomeDeLasCasas',
];

export const FATHER_CATEGORIES: CongressCategory[] = ['trade', 'exploration', 'military', 'political', 'religious'];

/**
 * The order computer players choose the Congress's candidates in; a candidate not on the list is
 * taken only when nothing on it is offered (the first offered).
 */
export const CONGRESS_AI_PREFERENCE: FatherId[] = [
  'thomasJefferson', 'williamBrewster', 'peterStuyvesant', 'pocahontas', 'thomasPaine', 'williamPenn', 'adamSmith',
  'simonBolivar', 'hernandoDeSoto', 'ferdinandMagellan', 'laSalle', 'paulRevere', 'georgeWashington',
];

/**
 * What the next member of a council costs in its product: `(base + step × joined + square ×
 * joined²) × (0.85 + 0.03 × nations)`, rounded. The Congress's rule is 60, 50, 12.
 */
export interface CouncilCost {
  base: number;
  step: number;
  square: number;
}

/** The Continental Congress's cost rule. */
export const CONGRESS_COST: CouncilCost = { base: 60, step: 50, square: 12 };

/** Liberty bells needed for the next father, given how many have joined (a council's own cost rule, else the Congress's). */
export function fatherCost(joined: number, nations: number, rule: CouncilCost = CONGRESS_COST): number {
  return Math.round((rule.base + rule.step * joined + rule.square * joined * joined) * (0.85 + nations * 0.03));
}
