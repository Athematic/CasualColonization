/**
 * The Americas, 1492–1850: the first scenario, built from today's tables so that nothing about
 * a game changes (docs/design/scenario-framework.md, section 3.3). Later steps move each table's
 * home here; the values stay the same, which test/scenarios.test.ts checks.
 *
 * Imports only the leaf rule tables, so any engine module can import the registry.
 */
import { BUILDING_ORDER } from '../rules/buildings.js';
import { COLONY_CHARTER } from '../rules/difficulty.js';
import { FATHER_CATEGORIES, FATHERS, type FatherId } from '../rules/fathers.js';
import { GOODS } from '../rules/goods.js';
import type { Modifier } from '../rules/modifiers.js';
import { NATION_ORDER, NATIONS, TRIBE_ORDER, type NationId } from '../rules/nations.js';
import { BURIAL_WEIGHT, NATIVE_PRODUCE, SETTLEMENT_KINDS } from '../rules/natives.js';
import { PORT_CHARACTER } from '../rules/ports.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import { AMERICAS_CALENDAR } from './calendar.js';
import type { NationEntry, RumourEntry, Scenario } from './types.js';

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

/**
 * The Lost City Rumours' outcomes and odds, in the order they are drawn (rumours.ts). A scout finds
 * treasure and the Fountain of Youth twice as often and is lost half as often; a seasoned scout is
 * never lost. The burial ground is listed last, so rumours off tribal land draw as before it existed.
 */
const AMERICAS_RUMOURS: RumourEntry[] = [
  { outcome: 'nothing', weight: 30, difficulty: 'rumourBad' },
  { outcome: 'tales', weight: 14 },
  { outcome: 'smallTreasure', weight: 26 },
  { outcome: 'colonist', weight: 10, difficulty: 'rumourGood' },
  { outcome: 'treasure', weight: 5, scout: 10, difficulty: 'rumourGood' },
  { outcome: 'fountain', weight: 2, scout: 4, difficulty: 'rumourGood' },
  { outcome: 'lost', weight: 6, scout: 3, expert: 0, difficulty: 'rumourBad' },
  { outcome: 'burial', weight: BURIAL_WEIGHT, difficulty: 'burialGrounds', tribal: true },
];

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
  peoples: {
    ids: [...TRIBE_ORDER],
    produce: [...NATIVE_PRODUCE],
    settlements: { nomadic: SETTLEMENT_KINDS.camp, agricultural: SETTLEMENT_KINDS.village, urban: SETTLEMENT_KINDS.city },
  },
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
  // Every system the engine has is on (section 3.12).
  mechanics: {
    taxes: true,
    boycotts: true,
    demands: true,
    royalWars: true,
    ref: true,
    independence: true,
    favoured: true,
    charter: COLONY_CHARTER,
    customHouse: true,
    missions: true,
  },
  // Winning the War of Independence ends the game; otherwise it ends after autumn 1850.
  victory: [{ id: 'independence-war' }, { id: 'time' }],
  rumours: AMERICAS_RUMOURS,
  // No `difficulty` or `score`: the Americas play by the engine's own DIFFICULTY and SCORE_WEIGHTS.
};
