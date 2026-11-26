/**
 * Vinland, around 1000 (Beta 4 step 4; docs/design/hex-maps.md H21; docs/research/vinland.md).
 *
 * The first hex-only scenario: pointy-top hexagons with a growing two-ring work area (opening at
 * size 5). One Norse expedition sails from Brattahlíð in Greenland across a fragile supply line
 * and must build a thriving foothold — settlement, self-sufficiency, and peace/trade with the
 * local peoples — by a seeded year (1030–1045) or withdraw to Greenland.
 *
 * Offers two stored hex maps:
 *   - `north-east-hex` (default): converted pointy-top hex copy of Beta 3's 84×74 North-east map.
 *   - `vinland-atlantic`: expanded North Atlantic map including southwestern Greenland, Helluland
 *     (southern Baffin Island), Markland (Labrador), and Vinland (Newfoundland & Gulf of St. Lawrence).
 *
 * Rule T17: everything about the Norse, Greenland, and the Vikings stays inside this scenario.
 */
import { EUROPEAN_BUILDINGS, PEOPLE_BUILDINGS } from '../rules/buildings.js';
import { PEOPLE_COUNCIL, THING_COUNCIL } from '../rules/councils.js';
import { GOODS } from '../rules/goods.js';
import type { NorthEastPeopleId } from '../rules/nations.js';
import { SETTLEMENT_KINDS } from '../rules/natives.js';
import type { PortEntry } from '../rules/ports.js';
import type { TerrainId } from '../rules/terrain.js';
import { EUROPEAN_UNIT_TYPES, PEOPLE_UNIT_TYPES } from '../rules/units.js';
import { NORTH_EAST_PEOPLES, NORTH_EAST_RENEWAL } from '../maps/north-east.js';
import { VINLAND_ATLANTIC_PEOPLES } from '../maps/vinland-atlantic.js';
import { AMERICAS } from './americas.js';
import type { Calendar } from './calendar.js';
import type { ContinuityParams, NationEntry, PeopleOverride, PlayablePeople, Scenario } from './types.js';

/**
 * Two turns a year (Summer and Winter) from 1000 to 1100: 201 turns, matching the Caribbean's pace.
 * Head starts jump to 1020 (on the eve of L'Anse aux Meadows' AD 1021 woodcutting date) or 1050.
 */
export const VINLAND_CALENDAR: Calendar = {
  eras: [{ from: 1000, turnsPerYear: 2, seasons: ['Summer', 'Winter'] }],
  end: { year: 1100, season: 'Winter' },
  headStartYears: [1020, 1050],
};

/** Brattahlíð in Greenland's Eastern Settlement: scarce settlers, strong demand for timber and furs. */
const BRATTAHLID: PortEntry = {
  name: 'Brattahlíð',
  market: {
    prices: { furs: 1.25, coats: 1.15, lumber: 1.35, tools: 1.2 },
    depth: { furs: 1.2, tools: 0.75, muskets: 0.5 },
    ships: 1.15,
  },
};

const NORSE: NationEntry = {
  id: 'norse',
  name: 'the Norse',
  adjective: 'Norse',
  color: '#8c2d19',
  bonus: {
    text: 'Seafarers of the North Atlantic: ships gain one extra move, and timber yields rise.',
    modifiers: [
      { hook: 'shipMoves', add: 1 },
      { hook: 'tileYield', good: 'lumber', mul: 1.25 },
    ],
  },
  departs: {
    years: [1035, 1050],
    thriving: { colonies: 2, population: 8, selfSufficient: true, treaties: 1 },
  },
  colonyNames: [
    // Attested Vinland saga names first (docs/research/vinland.md).
    'Leifsbúðir', 'Straumfjörðr', 'Hóp', 'Kjalarnes', 'Krossanes', 'Furðustrandir', 'Straumey', 'Bjarney',
    // Old Norse topographic patterns (Greenland / Iceland style).
    'Skógarvík', 'Járnnes', 'Viðarhólmr', 'Laxá', 'Hvítanes', 'Eyjafjörðr', 'Breiðavík', 'Grænabúðir',
    'Sandvík', 'Kaldidalr', 'Vínnes', 'Hrafnsvík',
  ],
  port: BRATTAHLID,
};

const PEOPLES: NorthEastPeopleId[] = [
  'dorset', 'inuit', 'eeyou', 'innu', 'beothuk', 'algonquin', 'mikmaq', 'wolastoqiyik', 'penobscot', 'abenaki', 'wendat',
  'stLawrenceIroquoians', 'attawandaron', 'haudenosaunee', 'mohican', 'massachusett', 'wampanoag', 'narragansett', 'munsee',
];

const PLAYABLE: PlayablePeople[] = [
  {
    id: 'beothuk',
    name: 'the Beothuk',
    adjective: 'Beothuk',
    // Newfoundland places associated with Beothuk camps and the Exploits valley (neutral English/recorded names).
    townNames: ['Exploits', 'Red Indian Lake', 'Boyd’s Cove', 'Notre Dame Bay', 'Trinity Bay', 'Bonavista', 'White Bay', 'Gander'],
  },
  {
    id: 'innu',
    name: 'the Innu',
    adjective: 'Innu',
    townNames: ['Uashat', 'Ekuanitshit', 'Nutashkuan', 'Sheshatshiu', 'Mashteuiatsh', 'Pessamit', 'Unamen Shipu', 'Pakua Shipi', 'Matimekush', 'Natuashish'],
  },
  {
    id: 'mikmaq',
    name: "the Mi'kmaq",
    adjective: "Mi'kmaw",
    townNames: ['Kjipuktuk', "Sipekne'katik", 'Piktuk', 'Elsipogtog', 'Listuguj', 'Esgenoôpetitj', "Unama'ki", 'Epekwitk', 'Wagmatcook', 'Eskasoni'],
  },
  {
    id: 'haudenosaunee',
    name: 'the Haudenosaunee',
    adjective: 'Haudenosaunee',
    townNames: ['Onondaga', 'Ganondagan', 'Kanonwalohale', 'Tiononderoge', 'Canajoharie', 'Kanatsiohareke', 'Goiogouen', 'Tionontoguen', 'Ossernenon', 'Totiakton'],
  },
];

const CONTINUITY_OF = {
  beothuk: { homelandShare: 0.9, landHealth: 95, peopleShare: 2.2 },
  innu: { homelandShare: 0.95, landHealth: 96, peopleShare: 2.2 },
  mikmaq: { homelandShare: 0.95, landHealth: 93, peopleShare: 2.2 },
  haudenosaunee: { homelandShare: 0.95, landHealth: 90, peopleShare: 2.4 },
} satisfies Partial<Record<NorthEastPeopleId, Partial<ContinuityParams>>>;

const OVERRIDES: Partial<Record<NorthEastPeopleId, PeopleOverride>> = {
  beothuk: { score: { peopleLandHealth: 0.8, peopleHomeland: 0.8, peopleTrust: 5 }, victory: { continuity: CONTINUITY_OF.beothuk } },
  innu: { score: { peopleLandHealth: 0.8, peopleHomeland: 0.7, peopleStoreYear: 3 }, victory: { continuity: CONTINUITY_OF.innu } },
  mikmaq: { score: { peopleLandHealth: 0.8, peopleHomeland: 0.7, peopleTrust: 6 }, victory: { continuity: CONTINUITY_OF.mikmaq } },
  haudenosaunee: { score: { peopleCouncil: 7, peopleTreaty: 4 }, victory: { continuity: CONTINUITY_OF.haudenosaunee } },
};

const TERRAINS: TerrainId[] = ['ocean', 'highSeas', 'plains', 'grassland', 'prairie', 'marsh', 'tundra', 'arctic', 'hills', 'mountains'];

export const VINLAND: Scenario = {
  id: 'vinland',
  version: 1,
  name: 'Vinland, around 1000',
  description:
    'Norse voyagers sailing from Greenland to Markland and Vinland on a hexagonal map, beside the Beothuk, Innu, Mi’kmaq and their neighbours. Build a thriving foothold before the Greenland supply line fails, or play a people of the North-east.',
  calendar: VINLAND_CALENDAR,
  map: {
    grid: 'hex',
    hex: { orientation: 'pointy' },
    workArea: { rings: [{}, { size: 5 }] },
    stored: [
      {
        id: 'north-east-hex',
        peoples: NORTH_EAST_PEOPLES,
        renewal: NORTH_EAST_RENEWAL,
        // Off the northern coast of Newfoundland / Strait of Belle Isle.
        entries: { norse: [74, 24] },
      },
      {
        id: 'vinland-atlantic',
        peoples: VINLAND_ATLANTIC_PEOPLES,
        // Off the Strait of Belle Isle between Markland (Labrador) and Vinland (northern Newfoundland).
        entries: { norse: [46, 46] },
      },
    ],
    default: 'north-east-hex',
    extras: { bonus: 0.05, coastalBonus: 0.07, rumours: 0.02, noRumours: ['arctic'] },
    settlements: { avoid: ['mountains', 'arctic'], spacing: 2 },
    crown: 'entry',
  },
  terrain: TERRAINS,
  nations: {
    sets: { alternative: [NORSE], real: [NORSE] },
    default: 'real',
    max: 1,
    crown: { ...AMERICAS.nations.crown },
  },
  peoples: {
    ids: PEOPLES,
    playable: PLAYABLE,
    produce: ['furs', 'tobacco'],
    settlements: { nomadic: SETTLEMENT_KINDS.camp, agricultural: SETTLEMENT_KINDS.village },
    overrides: OVERRIDES,
  },
  goods: [...GOODS],
  nationTypes: {
    european: { units: [...EUROPEAN_UNIT_TYPES], buildings: [...EUROPEAN_BUILDINGS], council: 'thing' },
    people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' },
  },
  peopleEconomy: { gardens: ['plains', 'prairie'] },
  councils: {
    thing: THING_COUNCIL,
    people: PEOPLE_COUNCIL,
  },
  events: 'vinland',
  ai: {
    pace: 0.33,
    islands: true,
    goods: AMERICAS.ai.goods,
  },
  mechanics: {
    taxes: false,
    boycotts: false,
    demands: false,
    royalWars: false,
    ref: false,
    independence: false,
    favoured: false,
    charter: false,
    customHouse: false,
    missions: false,
    burialGrounds: true,
    surrender: false,
    alliances: false,
    companies: false,
    confederation: false,
    peopleTreaties: ['people-trade', 'land-use', 'exchange', 'defence'],
    hardYears: { chance: 1 / 8 },
    landHealth: { regionSize: 8, renewal: 40, recovery: 5, floor: 0.2 },
    mapKnowledge: { seen: true, share: { homeland: 3, every: 50 }, range: 12 },
    landSales: { pull: 0.25 },
  },
  victory: [
    { id: 'thriving' },
    { id: 'military' },
    { id: 'confederacy' },
    { id: 'prosperity' },
    { id: 'continuity', params: { landHealth: 95 } },
    { id: 'good-life', params: { landHealth: 88, hungerYears: 50, treatyShare: 0.4 } },
    { id: 'time' },
  ],
  rumours: AMERICAS.rumours,
  text: {
    'landing.eyebrow': 'Vinland, around 1000',
    'landing.heading': 'Cross the cold sea from Greenland and take root — or hold your homeland.',
    'landing.pitch':
      'Sail west from Brattahlíð on a hexagonal map of Newfoundland, Labrador and the Gulf of St. Lawrence (or an expanded North Atlantic map including Greenland and Helluland). Build a thriving Norse foothold before the supply line fails, or play the Beothuk, Innu, Mi’kmaq or Haudenosaunee.',
    'landing.maps': 'Hexagonal maps of Vinland, Markland, Helluland and southwestern Greenland',
    'newGame.tagline': 'Norse voyages and North-east peoples on hexagons, around 1000.',
    'gameOver.time': 'The year {year} has come.',
  },
};
