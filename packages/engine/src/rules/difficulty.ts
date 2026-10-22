/**
 * Difficulty levels, as in the original game. Every rule a level changes is a named multiplier
 * or value in DIFFICULTY, so a scenario can later replace or adjust the table.
 *
 * Who it applies to: the level sets the economics of the nations people play (and of those
 * nations while the computer plays them during a head start). Computer players always play at
 * Conquistador economics, whatever level is chosen, and keep the computer level picked for
 * them; as in the original, harder levels mainly make life harder for the people. A game can
 * set `GameConfig.difficultyForAll` to give every nation the chosen economics (tournaments use
 * this to measure how the computer levels cope).
 *
 * Conquistador is the game as it was before difficulty levels existed: every multiplier is 1 and
 * every value matches the old fixed rule, so games and tournaments at that level are unchanged.
 */

export type DifficultyId = 'discoverer' | 'explorer' | 'conquistador' | 'governor' | 'viceroy';

/** From easiest to hardest. */
export const DIFFICULTY_LEVELS: DifficultyId[] = ['discoverer', 'explorer', 'conquistador', 'governor', 'viceroy'];

/** The level of games that do not choose one, and of every computer player. */
export const DEFAULT_DIFFICULTY: DifficultyId = 'conquistador';

export interface DifficultyRules {
  name: string;
  description: string;
  /** Gold in the treasury at the start. */
  startingGold: number;
  /** Multiplier on the gap between the buy and the sell price of every good in Europe. */
  priceSpread: number;
  /** Multiplier on the goods traded before a price moves by one (higher: prices fall slower when selling). */
  priceElasticity: number;
  /** Multiplier on the chance each turn that a price drifts back towards its starting value. */
  priceRecovery: number;
  /** Multiplier on the price of recruiting a colonist from the docks. */
  recruitCost: number;
  /** Multiplier on the price of training experts and buying ships and artillery in Europe. */
  trainCost: number;
  /** Multiplier on the crosses needed for each immigrant (the first and every later one). */
  crosses: number;
  /** Multiplier on the chance that a sale makes the Crown raise taxes. */
  taxChance: number;
  /** Multiplier on the size of each tax raise. */
  taxRaise: number;
  /** Highest tax rate the Crown sets, in percent. */
  taxCeiling: number;
  /** Multiplier on the tension that colonies and land taken add among the natives. */
  nativeTension: number;
  /** Multiplier on the chance that an angry or warring settlement raids a colony. */
  raidChance: number;
  /** Multiplier on the odds of the bad Lost City Rumour results (nothing, expedition lost). */
  rumourBad: number;
  /** Multiplier on the odds of the best Lost City Rumour results (treasure, Fountain of Youth, survivors). */
  rumourGood: number;
  /** Multiplier on the Royal Expeditionary Force the Crown holds at the start of the game. */
  refBase: number;
  /**
   * Multiplier on how fast the Crown adds to the Royal Expeditionary Force during the game, with
   * time (per colony) and with the nation's liberty bells (see crown.ts).
   */
  refGrowth: number;
  /** Multiplier on the chance each round that the King demands gold. */
  demandChance: number;
  /** Multiplier on the share of the treasury the King demands. */
  demandSize: number;
  /** Multiplier on the chance each round that the King drags the nation into a war with another European nation. */
  royalWarChance: number;
}

export const DIFFICULTY: Record<DifficultyId, DifficultyRules> = {
  discoverer: {
    name: 'Discoverer',
    description: 'The gentlest start: more gold, cheap colonists, steady prices, low taxes, patient natives and a small royal army.',
    startingGold: 2000,
    priceSpread: 0.5,
    priceElasticity: 1.5,
    priceRecovery: 2,
    recruitCost: 0.7,
    trainCost: 0.7,
    crosses: 0.7,
    taxChance: 0.5,
    taxRaise: 0.6,
    taxCeiling: 50,
    nativeTension: 0.6,
    raidChance: 0.5,
    rumourBad: 0.5,
    rumourGood: 1.3,
    refBase: 0.5,
    refGrowth: 0.6,
    demandChance: 0.5,
    demandSize: 0.7,
    royalWarChance: 0.5,
  },
  explorer: {
    name: 'Explorer',
    description: 'Easier than the classic rules: a little more gold, kinder prices and taxes, calmer natives, a smaller royal army.',
    startingGold: 1500,
    priceSpread: 0.75,
    priceElasticity: 1.25,
    priceRecovery: 1.5,
    recruitCost: 0.85,
    trainCost: 0.85,
    crosses: 0.85,
    taxChance: 0.75,
    taxRaise: 0.8,
    taxCeiling: 60,
    nativeTension: 0.8,
    raidChance: 0.75,
    rumourBad: 0.75,
    rumourGood: 1.15,
    refBase: 0.75,
    refGrowth: 0.8,
    demandChance: 0.75,
    demandSize: 0.85,
    royalWarChance: 0.75,
  },
  conquistador: {
    name: 'Conquistador',
    description: 'The standard rules: the middle level, as the game has always played.',
    startingGold: 1000,
    priceSpread: 1,
    priceElasticity: 1,
    priceRecovery: 1,
    recruitCost: 1,
    trainCost: 1,
    crosses: 1,
    taxChance: 1,
    taxRaise: 1,
    taxCeiling: 70,
    nativeTension: 1,
    raidChance: 1,
    rumourBad: 1,
    rumourGood: 1,
    refBase: 1,
    refGrowth: 1,
    demandChance: 1,
    demandSize: 1,
    royalWarChance: 1,
  },
  governor: {
    name: 'Governor',
    description: 'Harder: less gold, wider price gaps, dearer colonists, more and bigger tax raises, touchier natives, a larger royal army.',
    startingGold: 600,
    priceSpread: 1.25,
    priceElasticity: 0.85,
    priceRecovery: 0.75,
    recruitCost: 1.15,
    trainCost: 1.15,
    crosses: 1.15,
    taxChance: 1.25,
    taxRaise: 1.25,
    taxCeiling: 75,
    nativeTension: 1.25,
    raidChance: 1.25,
    rumourBad: 1.3,
    rumourGood: 0.9,
    refBase: 1.25,
    refGrowth: 1.25,
    demandChance: 1.25,
    demandSize: 1.15,
    royalWarChance: 1.25,
  },
  viceroy: {
    name: 'Viceroy',
    description: 'The hardest: little gold, a harsh market, costly colonists, a greedy Crown, quick-tempered natives and a huge royal army.',
    startingGold: 300,
    priceSpread: 1.5,
    priceElasticity: 0.7,
    priceRecovery: 0.5,
    recruitCost: 1.3,
    trainCost: 1.3,
    crosses: 1.3,
    taxChance: 1.5,
    taxRaise: 1.5,
    taxCeiling: 80,
    nativeTension: 1.5,
    raidChance: 1.5,
    rumourBad: 1.6,
    rumourGood: 0.8,
    refBase: 1.5,
    refGrowth: 1.5,
    demandChance: 1.5,
    demandSize: 1.3,
    royalWarChance: 1.5,
  },
};

/** A known level, or the default for a missing or unknown one. */
export function resolveDifficulty(id: string | undefined): DifficultyId {
  return id && id in DIFFICULTY ? (id as DifficultyId) : DEFAULT_DIFFICULTY;
}

/** The rules a nation plays by: its own difficulty, or Conquistador when it has none. */
export function difficultyRules(p: { difficulty?: DifficultyId }): DifficultyRules {
  return DIFFICULTY[p.difficulty ?? DEFAULT_DIFFICULTY] ?? DIFFICULTY[DEFAULT_DIFFICULTY];
}
