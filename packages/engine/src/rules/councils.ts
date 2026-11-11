/**
 * Councils (docs/design/native-nations.md T8; Beta 3 step 3). A scenario keys its councils by id
 * (`Scenario.councils`) and each nation type names its own (`nationTypes`): the European nations
 * sit the Continental Congress (`congress`), a playing people its people's council (`people`).
 * The members are the global catalogue's (rules/fathers.ts FATHERS), with open categories.
 */
import type { Council } from '../scenarios/types.js';
import { CONGRESS_AI_PREFERENCE, FATHER_CATEGORIES, type FatherId } from './fathers.js';

/**
 * The Continental Congress with the given members: the five categories, political members likelier
 * after turn 120 (scaled by the scenario's pace), the computer players' preference and the cost
 * rule as the engine has always had them.
 */
export function congress(members: readonly FatherId[]): Council {
  return {
    categories: [...FATHER_CATEGORIES],
    members: [...members],
    late: { category: 'political', turn: 120, add: 2 },
    aiPreference: [...CONGRESS_AI_PREFERENCE],
  };
}

/**
 * A playing people's council (native-nations.md T8, T9; Beta 3 step 3), the engine's when a scenario
 * defines no `people` council. **Drafted for Simon's review.** Five categories for the people's
 * economy (T10): the household (births and stores), the land (gardens, fishing, hunting and the
 * land's health), knowledge (teaching and crafts), defence and peace. Its product is the council
 * house's (bells in the engine), called counsel; its members cost what the Congress's do.
 */
export const PEOPLE_COUNCIL: Council = {
  categories: ['household', 'land', 'knowledge', 'defence', 'peace'],
  members: [
    'clanMothers', 'keepersOfTheStores', 'keepersOfTheFields', 'huntLeaders', 'weirBuilders', 'elders', 'toolmakers',
    'canoeBuilders', 'runners', 'warLeaders', 'speakers', 'garakontie', 'thayendanegea',
  ],
  text: { council: 'Council', councilShort: 'Council', member: 'council member', members: 'council members', product: 'counsel' },
  // A computer people fills its stores and keeps its land first (T10).
  aiPreference: ['keepersOfTheStores', 'clanMothers', 'huntLeaders', 'keepersOfTheFields', 'elders', 'speakers', 'weirBuilders', 'warLeaders'],
  // No hall picture of its own yet: the web game draws a plain council house (step 10 brings art).
  hall: 'ui/council-house',
};

/** Councils the engine supplies when a scenario does not define them, by id. */
export const ENGINE_COUNCILS: Readonly<Record<string, Council>> = { people: PEOPLE_COUNCIL };
