export type FatherCategory = 'trade' | 'exploration' | 'military' | 'political' | 'religious';

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
  | 'bartolomeDeLasCasas';

export interface FatherDef {
  id: FatherId;
  name: string;
  category: FatherCategory;
  effect: string;
  /** Relative chance of being offered; some fathers only become likely later. */
  weight: number;
}

const f = (id: FatherId, name: string, category: FatherCategory, effect: string, weight = 5): FatherDef => ({ id, name, category, effect, weight });

export const FATHERS: Record<FatherId, FatherDef> = {
  adamSmith: f('adamSmith', 'Adam Smith', 'trade', 'Manufacturing buildings produce 50% more.'),
  jakobFugger: f('jakobFugger', 'Jakob Fugger', 'trade', 'All boycotts are lifted without paying arrears.', 3),
  peterMinuit: f('peterMinuit', 'Peter Minuit', 'trade', 'Natives ask nothing for their land.'),
  peterStuyvesant: f('peterStuyvesant', 'Peter Stuyvesant', 'trade', 'Colonies may build a Custom House.', 6),
  janDeWitt: f('janDeWitt', 'Jan de Witt', 'trade', 'Market prices recover twice as fast.'),
  ferdinandMagellan: f('ferdinandMagellan', 'Ferdinand Magellan', 'exploration', 'Ships gain a move and reach Europe a turn sooner.'),
  franciscoDeCoronado: f('franciscoDeCoronado', 'Francisco de Coronado', 'exploration', 'The surroundings of every existing colony are revealed.'),
  hernandoDeSoto: f('hernandoDeSoto', 'Hernando de Soto', 'exploration', 'Land units see further, and rumours are always worth exploring.'),
  henryHudson: f('henryHudson', 'Henry Hudson', 'exploration', 'Fur trapping produces 100% more.'),
  laSalle: f('laSalle', 'René-Robert de La Salle', 'exploration', 'Every colony of three or more gets a free stockade.'),
  hernanCortes: f('hernanCortes', 'Hernán Cortés', 'military', 'Conquered settlements yield more treasure, and the Crown carries it free of charge.'),
  georgeWashington: f('georgeWashington', 'George Washington', 'military', 'Soldiers and dragoons who win a battle become veterans.'),
  paulRevere: f('paulRevere', 'Paul Revere', 'military', 'Colonists take up stored muskets when a colony without soldiers is attacked.'),
  francisDrake: f('francisDrake', 'Francis Drake', 'military', 'Privateers fight 50% harder.'),
  johnPaulJones: f('johnPaulJones', 'John Paul Jones', 'military', 'A frigate joins your fleet.', 3),
  thomasJefferson: f('thomasJefferson', 'Thomas Jefferson', 'political', 'Liberty bell production rises by 10%.', 7),
  pocahontas: f('pocahontas', 'Pocahontas', 'political', 'All native tension disappears and every tribe makes peace.', 4),
  thomasPaine: f('thomasPaine', 'Thomas Paine', 'political', 'Liberty bell production rises by the current tax rate.'),
  simonBolivar: f('simonBolivar', 'Simón Bolívar', 'political', 'Sons of Liberty membership rises by 20% in every colony.', 3),
  benjaminFranklin: f('benjaminFranklin', 'Benjamin Franklin', 'political', 'Other European nations always accept peace.'),
  williamBrewster: f('williamBrewster', 'William Brewster', 'religious', 'Criminals and servants no longer arrive as immigrants.', 7),
  williamPenn: f('williamPenn', 'William Penn', 'religious', 'Cross production rises by 50%.'),
  jeanDeBrebeuf: f('jeanDeBrebeuf', 'Jean de Brébeuf', 'religious', 'Missions convert natives twice as often.'),
  juanDeSepulveda: f('juanDeSepulveda', 'Juan Ginés de Sepúlveda', 'religious', 'Conquering a settlement brings converts.'),
  bartolomeDeLasCasas: f('bartolomeDeLasCasas', 'Bartolomé de las Casas', 'religious', 'All native converts become free colonists.', 3),
};

export const FATHER_CATEGORIES: FatherCategory[] = ['trade', 'exploration', 'military', 'political', 'religious'];

/** Liberty bells needed for the next father, given how many have joined. */
export function fatherCost(joined: number, nations: number): number {
  return Math.round((60 + 50 * joined + 12 * joined * joined) * (0.85 + nations * 0.03));
}
