/**
 * The Americas, 1492–1850: the first scenario, built from today's tables so that nothing about
 * a game changes (docs/design/scenario-framework.md, section 3.3). Later steps move each table's
 * home here; the values stay the same, which test/scenarios.test.ts checks.
 *
 * Imports only the leaf rule tables, so any engine module can import the registry.
 */
import { BUILDING_ORDER } from '../rules/buildings.js';
import { DIFFICULTY } from '../rules/difficulty.js';
import { FATHER_CATEGORIES, FATHERS, type FatherId } from '../rules/fathers.js';
import { GOODS } from '../rules/goods.js';
import type { Modifier } from '../rules/modifiers.js';
import { NATION_ORDER, NATIONS, TRIBE_ORDER, type NationId } from '../rules/nations.js';
import { NATIVE_PRODUCE } from '../rules/natives.js';
import { PORT_CHARACTER } from '../rules/ports.js';
import { SCORE_WEIGHTS } from '../rules/score.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import { AMERICAS_CALENDAR } from './calendar.js';
import type { NationEntry, Scenario } from './types.js';

/** What each nation's bonus does (its text is NATIONS[id].bonus), read at the engine's hook points (rules/modifiers.ts). */
const BONUSES: Partial<Record<NationId, Modifier[]>> = {
  england: [{ hook: 'crossesStep', set: 12 }],
  france: [{ hook: 'nativeGifts', add: 0.15 }],
  netherlands: [{ hook: 'priceRecovery', set: 0.2 }],
  spain: [{ hook: 'offenceVsSettlements', mul: 1.5 }],
  portugal: [{ hook: 'shipMoves', add: 1 }],
  sweden: [{ hook: 'startingDocks', units: ['expertLumberjack'] }],
  denmark: [{ hook: 'foodToGrow', set: 160 }],
  russia: [{ hook: 'sight', add: 1, roles: ['scout', 'dragoon'] }],
};

function entry(id: NationId): NationEntry {
  const def = NATIONS[id];
  return { id, bonus: { text: def.bonus, modifiers: BONUSES[id] ?? [] }, colonyNames: def.colonyNames, port: PORT_CHARACTER[id]! };
}

/** The original game's four rivals (Q9). */
const REAL_RIVALS: NationId[] = ['england', 'france', 'netherlands', 'spain'];

export const AMERICAS: Scenario = {
  id: 'americas',
  version: 1,
  name: 'The Americas, 1492–1850',
  description: 'Found colonies in the New World, trade with Europe and the native peoples, and win independence from the Crown.',
  calendar: AMERICAS_CALENDAR,
  map: {
    // The Australia map is a geography preview played with the Americas' rules until its scenario exists.
    stored: ['north-america', 'south-america', 'americas', 'australia'],
    generated: true,
    default: 'generated',
  },
  nations: {
    sets: { alternative: NATION_ORDER.map(entry), real: REAL_RIVALS.map(entry) },
    default: 'alternative',
    max: 8,
  },
  peoples: { ids: [...TRIBE_ORDER], produce: [...NATIVE_PRODUCE] },
  goods: [...GOODS],
  units: Object.keys(UNIT_TYPES) as UnitTypeId[],
  buildings: [...BUILDING_ORDER],
  council: { categories: [...FATHER_CATEGORIES], members: Object.keys(FATHERS) as FatherId[] },
  events: 'americas',
  ai: {
    goods: {
      trade: ['silver', 'furs', 'sugar', 'tobacco', 'cotton', 'ore', 'rum', 'cigars', 'cloth', 'coats', 'horses'],
      export: ['sugar', 'tobacco', 'cotton', 'furs', 'ore', 'silver', 'rum', 'cigars', 'cloth', 'coats'],
      road: ['lumber', 'ore', 'silver', 'furs'],
      farm: ['food', 'sugar', 'tobacco', 'cotton'],
    },
  },
  // The engine's own tables: the Americas override nothing.
  difficulty: DIFFICULTY,
  score: SCORE_WEIGHTS,
};
