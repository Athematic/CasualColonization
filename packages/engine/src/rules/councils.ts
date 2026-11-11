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

/** Councils the engine supplies when a scenario does not define them, by id. */
export const ENGINE_COUNCILS: Readonly<Record<string, Council>> = {};
