/**
 * The Americas, 1492–1850: the first scenario, built from today's tables so that nothing about
 * a game changes (docs/design/scenario-framework.md, section 3.3). Later steps move each table's
 * home here; the values stay the same, which test/scenarios.test.ts checks.
 *
 * Imports only the leaf rule tables, so any engine module can import the registry.
 */
import { BUILDING_ORDER } from '../rules/buildings.js';
import { COLONY_CHARTER } from '../rules/difficulty.js';
import { AMERICAS_FATHERS, FATHER_CATEGORIES } from '../rules/fathers.js';
import { GOODS } from '../rules/goods.js';
import type { Modifier } from '../rules/modifiers.js';
import { HOME_PORTS, NATION_ORDER, NATIONS, TRIBE_ORDER, type AmericasNationId, type NationId } from '../rules/nations.js';
import { BURIAL_WEIGHT, NATIVE_PRODUCE, SETTLEMENT_KINDS } from '../rules/natives.js';
import { PORT_CHARACTER } from '../rules/ports.js';
import { TERRAIN, type TerrainId } from '../rules/terrain.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import { AMERICAS_PEOPLES } from '../maps/americas.js';
import { AUSTRALIA_PLACEHOLDER_PEOPLES } from '../maps/australia.js';
import { NORTH_AMERICA_PEOPLES } from '../maps/north-america.js';
import { SOUTH_AMERICA_PEOPLES } from '../maps/south-america.js';
import { AMERICAS_CALENDAR } from './calendar.js';
import { AMERICAS_TEXT } from './terms.js';
import type { GeneratorSettings, NationEntry, RumourEntry, Scenario } from './types.js';
import { HUDSONS_BAY, MISSISSIPPI, WEST_INDIA } from './companies.js';

/**
 * The generated New World (mapgen.ts): one continent a little west of the middle, with Europe across
 * the eastern high seas; cold at the top and bottom, warm in the middle rows.
 */
export const AMERICAS_GENERATOR: GeneratorSettings = {
  sizes: {
    small: { width: 36, height: 44 },
    medium: { width: 46, height: 58 },
    large: { width: 58, height: 72 },
  },
  noise: { land: [9, 4, 2], heat: [7, 3], wet: [6, 3], elevation: [5, 2], wood: [4, 2] },
  land: {
    centre: [0.45, 0.5],
    spread: [0.3, 0.47],
    falloff: { x: 0.9, y: 0.6, strength: 0.55 },
    threshold: 0.33,
    margin: { west: 3, east: 5, north: 1, south: 1 },
  },
  climate: {
    heatNoise: 0.35,
    warmth: 0,
    poles: { rows: 2, terrain: 'arctic' },
    zones: [
      { below: 0.1, moisture: [{ terrain: 'arctic' }] },
      { below: 0.25, heights: [{ above: 0.68, terrain: 'hills' }], moisture: [{ terrain: 'tundra' }] },
      {
        below: 0.62,
        heights: [{ above: 0.74, terrain: 'mountains' }, { above: 0.64, terrain: 'hills' }],
        moisture: [{ below: 0.36, terrain: 'prairie' }, { below: 0.52, terrain: 'plains' }, { below: 0.68, terrain: 'grassland' }, { terrain: 'marsh' }],
      },
      {
        heights: [{ above: 0.74, terrain: 'mountains' }, { above: 0.64, terrain: 'hills' }],
        moisture: [{ below: 0.33, terrain: 'desert' }, { below: 0.6, terrain: 'savannah' }, { terrain: 'swamp' }],
      },
    ],
  },
  forest: 0.47,
  highSeas: { distance: 2, columns: 2 },
  entrySide: 'east',
  peoples: { perTiles: 34, min: 8, edgeRows: 2 },
};

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

/** A nation of the Americas: the catalogue's identity, bonus and colony names (NATIONS) and port (PORT_CHARACTER). */
function entry(id: AmericasNationId | 'crown'): NationEntry {
  const def = NATIONS[id];
  return {
    id,
    name: def.name,
    adjective: def.adjective,
    color: def.color,
    bonus: { text: def.bonus, modifiers: BONUSES[id] ?? [] },
    colonyNames: def.colonyNames,
    port: PORT_CHARACTER[id] ?? { name: HOME_PORTS[id] },
  };
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
const REAL_RIVALS: AmericasNationId[] = ['england', 'france', 'netherlands', 'spain'];

export const AMERICAS: Scenario = {
  id: 'americas',
  version: 1,
  name: 'The Americas, 1492–1850',
  description: 'Found colonies in the New World, trade with Europe and the native peoples, and win independence from the Crown.',
  calendar: AMERICAS_CALENDAR,
  map: {
    // The Australia map is a geography preview played with the Americas' rules until its scenario exists.
    stored: [
      { id: 'north-america', peoples: NORTH_AMERICA_PEOPLES },
      { id: 'south-america', peoples: SOUTH_AMERICA_PEOPLES },
      { id: 'americas', peoples: AMERICAS_PEOPLES },
      { id: 'australia', peoples: AUSTRALIA_PLACEHOLDER_PEOPLES },
    ],
    generator: AMERICAS_GENERATOR,
    default: 'generated',
    extras: { bonus: 0.05, coastalBonus: 0.06, rumours: 0.03, noRumours: ['arctic'] },
    settlements: { avoid: ['arctic', 'mountains'], spacing: 4 },
    // The Crown sails in where the nations arrive: from the east, or the west on the Australia map (Q12).
    crown: 'entry',
  },
  terrain: Object.keys(TERRAIN) as TerrainId[],
  nations: {
    sets: { alternative: NATION_ORDER.map(entry), real: REAL_RIVALS.map(entry) },
    default: 'alternative',
    max: 8,
    crown: entry('crown'),
    // Chartered companies (companies.ts), with `mechanics.companies`.
    companies: [HUDSONS_BAY, WEST_INDIA, MISSISSIPPI],
  },
  peoples: {
    ids: [...TRIBE_ORDER],
    produce: [...NATIVE_PRODUCE],
    settlements: { nomadic: SETTLEMENT_KINDS.camp, agricultural: SETTLEMENT_KINDS.village, urban: SETTLEMENT_KINDS.city },
  },
  goods: [...GOODS],
  units: Object.keys(UNIT_TYPES) as UnitTypeId[],
  buildings: [...BUILDING_ORDER],
  council: { categories: [...FATHER_CATEGORIES], members: [...AMERICAS_FATHERS] },
  events: 'americas',
  ai: {
    // The pace the computer players' turn thresholds were tuned for (scenarios/index.ts aiTurn).
    pace: 1,
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
    alliances: true,
    companies: true,
    confederation: true,
  },
  // Winning the War of Independence ends the game; otherwise it ends after autumn 1850, won by an
  // alliance holding most of the score together, or else by the highest score.
  victory: [{ id: 'independence-war' }, { id: 'concord' }, { id: 'time' }],
  rumours: AMERICAS_RUMOURS,
  // No `difficulty` or `score`: the Americas play by the engine's own DIFFICULTY and SCORE_WEIGHTS.
  // The Americas' terms are the defaults every scenario starts from (scenarios/terms.ts).
  text: AMERICAS_TEXT,
  art: {
    covers: ['landfall', 'trade', 'colony', 'map', 'liberty', 'winter', 'river', 'feast', 'harbours', 'silver', 'lostcity'],
    councilHall: 'ui/congress-hall',
  },
};
