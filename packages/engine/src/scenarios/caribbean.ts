/**
 * The Caribbean, 1650–1750: the lesser powers (docs/design/scenario-framework.md, section 7.1).
 * The proof scenario of the framework: a short game in the age of the chartered companies, when
 * small states also founded colonies in the West Indies. The Duchy of Courland held Tobago, the
 * Elector of Brandenburg leased land on St Thomas, the Knights of Malta owned St Kitts and St Croix,
 * and Scotland tried to found a colony at Darien.
 *
 * It uses every part of the framework with no new art: its own calendar (spring and autumn turns,
 * 1650–1750), a stored map of the Caribbean drawn from real coordinates (maps/caribbean.ts) or a
 * generated archipelago, its own nations with bonuses built from the existing hooks,
 * three peoples (one of them new to the catalogue, the Kalinago), the goods without furs and coats,
 * a council of the period with three new members, its own event set (events/caribbean.ts), the
 * Crown's taxes and demands without the REF or independence, the `time` victory alone, its own
 * score weights and charter, a faster pace for the computer players, and its own terms.
 *
 * Imports only the leaf rule tables, like the Americas, so any engine module can import the registry.
 */
import { BUILDING_ORDER } from '../rules/buildings.js';
import { FATHER_CATEGORIES, type FatherId } from '../rules/fathers.js';
import { GOODS, type GoodId } from '../rules/goods.js';
import { NATIONS, type CompanyId, type NationId } from '../rules/nations.js';
import { SETTLEMENT_KINDS } from '../rules/natives.js';
import type { PortEntry } from '../rules/ports.js';
import type { TerrainId } from '../rules/terrain.js';
import { UNIT_TYPES, type UnitTypeId } from '../rules/units.js';
import { CARIBBEAN_PEOPLES } from '../maps/caribbean.js';
import { AMERICAS, AMERICAS_GENERATOR } from './americas.js';
import type { Calendar } from './calendar.js';
import type { GeneratorSettings, NationEntry, Scenario } from './types.js';
import { COURLAND_COMPANY, DARIEN, WEST_INDIA } from './companies.js';

const without = <T>(list: readonly T[], ...drop: T[]): T[] => list.filter((x) => !drop.includes(x));

/** A hundred years in spring and autumn turns: 202 turns, from spring 1650 to autumn 1750. */
export const CARIBBEAN_CALENDAR: Calendar = {
  eras: [{ from: 1650, turnsPerYear: 2, seasons: ['spring', 'autumn'] }],
  end: { year: 1750, season: 'autumn' },
  headStartYears: [1675, 1700, 1725],
};

/**
 * The generated West Indies: many small islands spread over a warm sea, a few larger ones, and a
 * coast of the mainland here and there; Europe lies across the high seas to the east. No tundra or
 * arctic: the cooler rows at the top and bottom are plains and grassland, the middle savannah,
 * swamp and dry scrub (desert), with hills and mountains on the larger islands.
 */
export const CARIBBEAN_GENERATOR: GeneratorSettings = {
  sizes: AMERICAS_GENERATOR.sizes,
  // Finer land noise than the Americas' continent (9, 4, 2): islands rather than one land mass.
  noise: { land: [4, 2], heat: [7, 3], wet: [5, 3], elevation: [4, 2], wood: [4, 2] },
  land: {
    centre: [0.47, 0.5],
    // Spread wider and thinning out more gently than the Americas' (0.3, 0.47; 0.55): islands across the whole sea.
    spread: [0.5, 0.55],
    falloff: { x: 0.9, y: 0.6, strength: 0.35 },
    // A higher threshold than the Americas' 0.33: more sea and smaller islands (about a sixth to a fifth of the map is land).
    threshold: 0.56,
    margin: { west: 2, east: 5, north: 2, south: 2 },
  },
  climate: {
    heatNoise: 0.35,
    // A warmer world: the coolest rows are as warm as the Americas' temperate middle.
    warmth: 0.35,
    // No polar rows: the top and bottom rows stay sea through the margins.
    poles: { rows: 0, terrain: 'plains' },
    zones: [
      {
        below: 0.75,
        heights: [{ above: 0.74, terrain: 'mountains' }, { above: 0.67, terrain: 'hills' }],
        moisture: [{ below: 0.3, terrain: 'prairie' }, { below: 0.5, terrain: 'plains' }, { below: 0.68, terrain: 'grassland' }, { terrain: 'marsh' }],
      },
      {
        heights: [{ above: 0.74, terrain: 'mountains' }, { above: 0.67, terrain: 'hills' }],
        moisture: [{ below: 0.26, terrain: 'desert' }, { below: 0.62, terrain: 'savannah' }, { terrain: 'swamp' }],
      },
    ],
  },
  forest: 0.5,
  highSeas: { distance: 3, columns: 2 },
  entrySide: 'east',
  // Less land than the Americas: one settlement per fewer tiles, but fewer in all.
  peoples: { perTiles: 22, min: 6, edgeRows: 2 },
};

/** The home ports and their markets in this century. Factors as in rules/ports.ts: 10–30%, no furs or coats. */
const PORTS: Record<Exclude<NationId, 'portugal' | 'sweden' | 'russia' | 'crown' | CompanyId>, PortEntry> = {
  // London: the great sugar and tobacco market, protected by the duties on foreign sugar.
  england: { name: 'London', market: { prices: { sugar: 1.15, tobacco: 1.2, silver: 0.9 }, depth: { cotton: 1.5, tools: 1.5 } } },
  // La Rochelle: the sugar of the Antilles; France banned colonial rum in 1713 to protect its brandy.
  france: { name: 'La Rochelle', market: { prices: { sugar: 1.15, cotton: 1.1, rum: 0.75 }, depth: { sugar: 1.25 } } },
  // Amsterdam: the entrepôt of trade goods, with the sugar refineries of Holland.
  netherlands: { name: 'Amsterdam', market: { prices: { tobacco: 1.2, cloth: 0.9 }, depth: { tradeGoods: 2, sugar: 1.5 } } },
  // Seville, the port of the treasure fleets (until Cádiz took over in 1717): silver, and its royal tobacco factory.
  spain: { name: 'Seville', market: { prices: { silver: 1.15, tobacco: 1.15, cloth: 1.2, sugar: 0.9 }, depth: { silver: 1.25 }, recovery: 0.8, ships: 1.1 } },
  // Copenhagen: sugar for the Baltic, and Danish guns.
  denmark: { name: 'Copenhagen', market: { prices: { sugar: 1.2, cloth: 0.9 }, depth: { muskets: 1.5 }, ships: 0.9 } },
  // Libau: the Duke's ironworks and the shipyards of Windau.
  courland: { name: 'Libau', market: { prices: { tools: 0.85, muskets: 0.9, sugar: 0.9 }, depth: { tools: 1.5 }, ships: 0.85 } },
  // Emden: the Brandenburg company's port on the North Sea; Huguenot weavers in Brandenburg.
  brandenburg: { name: 'Emden', market: { prices: { cloth: 0.85, tobacco: 1.1 }, depth: { cloth: 1.5 } } },
  // Leith: the port of Edinburgh, selling Scottish linen and buying tobacco.
  scotland: { name: 'Leith', market: { prices: { tobacco: 1.2, cloth: 0.9, sugar: 0.9 }, depth: { cloth: 1.5 } } },
  // Valletta: the Order's harbour in the Mediterranean, where Maltese cotton was spun; ships dear.
  malta: { name: 'Valletta', market: { prices: { sugar: 1.1, silver: 1.1 }, depth: { cotton: 1.5, muskets: 1.25 }, recovery: 0.9, ships: 1.1 } },
};

/**
 * The nations: the real rivals, who held colonies in the West Indies through the century, and four
 * lesser powers that also founded or bought colonies there. Colony names start with places they
 * founded or named in the region, then continue in the style of their colonists.
 */
const N = {
  england: {
    id: 'england',
    name: 'England',
    adjective: 'English',
    color: NATIONS.england.color,
    // Indentured servants and transported prisoners filled Barbados and Jamaica.
    bonus: { text: 'Immigration: fewer crosses needed for new colonists.', modifiers: [{ hook: 'crossesStep', set: 12 }] },
    colonyNames: [
      'Bridgetown', 'Port Royal', 'Spanish Town', 'Kingston', "St. John's", 'Charlestown', 'Plymouth', 'Speightstown', 'Holetown',
      'Oistins', 'Falmouth', 'Old Road', 'Sandy Point', 'Nassau', 'Belize', 'Port Antonio', 'Port Morant', 'Savanna-la-Mar',
      'Lucea', 'Montego Bay', 'Black River', 'Parham', 'English Harbour', 'The Valley', 'Road Town', 'Bluefields', 'Port Maria',
      "St. Ann's Bay", 'Old Harbour', 'Passage Fort', 'Morant Bay',
      // In the style of the English islands.
      'New Bristol', 'Port Charles', 'Queenstown', 'Williamstown', 'Annesborough', 'Georgetown', 'Hanover', 'Port Rupert',
    ],
    port: PORTS.england,
  },
  france: {
    id: 'france',
    name: 'France',
    adjective: 'French',
    color: NATIONS.france.color,
    // The French made treaties with the Kalinago (1660) and traded with them throughout the century.
    bonus: { text: 'Cooperation: native settlements give better gifts and teach more readily.', modifiers: [{ hook: 'nativeGifts', add: 0.15 }] },
    colonyNames: [
      'Saint-Pierre', 'Fort-Royal', 'Basse-Terre', 'Cap-Français', 'Port-de-Paix', 'Léogâne', 'Petit-Goâve', 'Saint-Louis',
      'Les Cayes', 'Port-au-Prince', 'Cayenne', 'Marigot', 'Grand-Bourg', 'Le Carbet', 'La Trinité', 'Le Marin', 'Sainte-Anne',
      'Capesterre', 'Le Moule', 'Sainte-Rose', 'Jacmel', 'Saint-Marc', 'Fort-Dauphin', 'Jérémie', 'Gonaïves', 'Le Lamentin',
      'Le Prêcheur', 'Case-Pilote', 'Basseterre',
      // In the style of the French islands.
      'Port-Louis', 'Saint-Charles', 'Fort-Saint-Jean', 'Bourbon', 'Port-Colbert', 'Sainte-Marie', 'Port-Dauphin',
    ],
    port: PORTS.france,
  },
  netherlands: {
    id: 'netherlands',
    name: 'the Netherlands',
    adjective: 'Dutch',
    color: NATIONS.netherlands.color,
    // Curaçao and St Eustatius were the free markets of the Caribbean.
    bonus: { text: 'Trade: market prices recover twice as fast.', modifiers: [{ hook: 'priceRecovery', set: 0.2 }] },
    colonyNames: [
      'Willemstad', 'Oranjestad', 'Paramaribo', 'Fort Zeelandia', 'Nieuw Vlissingen', 'Lampsinsberg', 'Nieuw Walcheren',
      'Kralendijk', 'The Bottom', 'Fort Nassau', 'Kijkoveral', 'Fort Amsterdam', 'Nieuw Middelburg', 'Fort Sommelsdijk',
      'Jodensavanne', 'Fort Oranje', 'Nieuw Amsterdam',
      // In the style of the Dutch colonies.
      'Nieuw Haarlem', 'Nieuw Leiden', 'Delftshaven', 'Nieuw Hoorn', 'Veere', 'Zierikzee', 'Nieuw Enkhuizen', 'Fort Willem',
    ],
    port: PORTS.netherlands,
  },
  spain: {
    id: 'spain',
    name: 'Spain',
    adjective: 'Spanish',
    color: NATIONS.spain.color,
    // The great fortresses of Havana, San Juan, Cartagena and Portobelo held the Spanish Main.
    bonus: { text: 'Fortified ports: every colony of four or more colonists gets a free stockade.', modifiers: [{ hook: 'autoStockade', minColonists: 4 }] },
    colonyNames: [
      'Havana', 'Santo Domingo', 'San Juan', 'Cartagena', 'Portobelo', 'Santiago de Cuba', 'Veracruz', 'Maracaibo', 'Campeche',
      'San José de Oruña', 'Cumaná', 'La Guaira', 'Santa Marta', 'Baracoa', 'Puerto Plata', 'Trinidad', 'Bayamo', 'Matanzas',
      'Puerto Príncipe', 'Coro', 'Caracas', 'Nombre de Dios', 'Panamá', 'Río Hacha', 'Sancti Spíritus', 'San Germán', 'Arecibo',
      'Pensacola', 'San Agustín', 'Higüey', 'Azua',
      // In the style of the Spanish towns.
      'San Felipe', 'Santa Cruz', 'San Carlos', 'Nuestra Señora del Carmen', 'San Fernando',
    ],
    port: PORTS.spain,
  },
  denmark: {
    id: 'denmark',
    name: 'Denmark',
    adjective: 'Danish',
    color: NATIONS.denmark.color,
    // Denmark–Norway kept out of most of the century's wars, and St Thomas grew rich as a neutral port.
    bonus: { text: 'Neutrality: other European nations always accept peace.', modifiers: [{ hook: 'peaceAccepted' }] },
    colonyNames: [
      'Charlotte Amalie', 'Christiansted', 'Fort Christian', 'Coral Bay', 'Cruz Bay', 'Frederiksvaern', 'Christiansvaern', 'Bassin',
      'Taphus',
      // In the style of the Danish islands.
      'Frederiksted', 'Nyhavn', 'Kronborg', 'Sophienborg', 'Frederiksberg', 'Christianshavn', 'Frederiksholm', 'Louisenhoj',
      'Prinsensgade', 'Dronningens Kvarter',
    ],
    port: PORTS.denmark,
  },
  courland: {
    id: 'courland',
    name: 'Courland',
    adjective: 'Courlander',
    // A colour of its own among the red, blue, orange, yellow and magenta of the great powers.
    color: '#2e8b57',
    // Duke Jacob Kettler built a fleet at Windau and sent it to Tobago (1654) and the Gambia.
    bonus: { text: 'Shipyards: a second caravel waits in the home port from the start.', modifiers: [{ hook: 'startingDocks', units: ['caravel'] }] },
    colonyNames: [
      // Tobago, "New Courland", 1654–1659 and again in the 1660s and 1680s.
      'Jacobusstadt', 'Fort Jacobus', 'Neu-Kurland', 'Great Courland Bay', 'Little Courland Bay',
      // In the style of the duchy's towns.
      'Neu-Mitau', 'Neu-Libau', 'Neu-Windau', 'Goldingen', 'Bauske', 'Tuckum', 'Doblen', 'Hasenpoth', 'Friedrichstadt',
      'Sankt Andreas', 'Jakobsfort', 'Neu-Goldingen', 'Talsen', 'Frauenburg', 'Grobin', 'Pilten', 'Kandau', 'Zabeln', 'Neuenburg',
    ],
    port: PORTS.courland,
  },
  brandenburg: {
    id: 'brandenburg',
    name: 'Brandenburg',
    adjective: 'Brandenburg',
    // The black and white of Brandenburg-Prussia.
    color: '#4a4a4a',
    // The Edict of Potsdam (1685) welcomed Huguenot craftsmen to Brandenburg.
    bonus: { text: 'Refuge: the most skilled candidate in the recruit pool is always the next immigrant.', modifiers: [{ hook: 'chooseImmigrant' }] },
    colonyNames: [
      // The Brandenburg African Company's lease on St Thomas (1685) and its attempts on Crab Island and Peter Island.
      'Brandenburgery', 'Krabbeninsel', 'Sankt Peter',
      // In the style of the Elector's towns.
      'Neu-Brandenburg', 'Friedrichsburg', 'Neu-Emden', 'Neu-Berlin', 'Kurfürstenhafen', 'Neu-Cölln', 'Charlottenburg', 'Oranienburg',
      'Neu-Ruppin', 'Spandau', 'Küstrin', 'Neu-Potsdam', 'Neu-Halle', 'Friedrichswerder', 'Dorotheenstadt', 'Neu-Kleve', 'Neu-Minden',
      'Neu-Magdeburg', 'Neu-Stettin',
    ],
    port: PORTS.brandenburg,
  },
  scotland: {
    id: 'scotland',
    name: 'Scotland',
    adjective: 'Scottish',
    // The saltire's blue, lighter than France's.
    color: '#5aa9e6',
    // Scots soldiers served in the armies of Sweden, the Netherlands and France throughout the century.
    bonus: { text: 'Soldiers of fortune: soldiers and dragoons who win a battle become veterans.', modifiers: [{ hook: 'alwaysPromote' }] },
    colonyNames: [
      // The Company of Scotland's colony at Darien, 1698–1700.
      'New Edinburgh', 'Fort St. Andrew', 'New Caledonia', 'Caledonia Bay',
      // In the style of Scottish towns.
      'New Leith', 'New Perth', 'New Aberdeen', 'New Dundee', 'New Stirling', 'Inverness', 'Port Glasgow', 'New St. Andrews',
      'Fort William', 'Kirkcaldy', 'Dunfermline', 'Montrose', 'Arbroath', 'Ayr', 'Dumfries', 'Linlithgow', 'New Paisley', 'Greenock',
    ],
    port: PORTS.scotland,
  },
  malta: {
    id: 'malta',
    // The Knights of Malta: the Sovereign Military Order of St John, a state of its own. Named as
    // the Order, so sentences read "the Order of Malta has…".
    name: 'the Order of Malta',
    adjective: 'Maltese',
    // A colour of its own: the Order's red and white are England's and nobody's.
    color: '#6a3d9a',
    // A religious order of knights, hospitallers since the crusades.
    bonus: { text: 'Hospitallers: churches produce 50% more crosses.', modifiers: [{ hook: 'buildingOutput', building: 'church', mul: 1.5 }] },
    colonyNames: [
      // St Kitts, St Barthélemy, St Croix and St Martin, owned by the Order 1651–1665 under the governor Phillippe de Longvilliers de Poincy.
      'Basseterre', 'Le Carénage', 'Bassin', 'Marigot', 'La Montagne',
      // In the style of the Order's towns and Grand Masters.
      'Città Nuova', 'Vittoriosa', 'Senglea', 'Cospicua', 'Notabile', 'Floriana', 'San Giovanni', "Sant'Elmo", "Sant'Angelo",
      'Fort Lascaris', 'Verdala', 'Wignacourt', 'Saint-Christophe', 'Poincy', 'Città Cotonera', 'San Salvatore', 'Santa Maria',
    ],
    port: PORTS.malta,
  },
} satisfies Partial<Record<NationId, NationEntry>>;

/** The real rivals: the powers that held colonies in the West Indies through the century. */
const REAL: NationEntry[] = [N.england, N.france, N.netherlands, N.spain, N.denmark];
/**
 * Alternative history, the default: the lesser powers take turns with the great ones, so the New
 * game screen's first seats (and the bench's four nations) are Courland, England, Brandenburg and
 * France, and a person plays Courland unless they choose otherwise.
 */
const ALTERNATIVE: NationEntry[] = [N.courland, N.england, N.brandenburg, N.france, N.scotland, N.netherlands, N.malta, N.spain, N.denmark];

/**
 * The council: fourteen of the Founding Fathers whose lives or work belong to the period or to the
 * West Indies, and three new members of the region and the period (rules/fathers.ts), in catalogue
 * order. Left out: the conquistadors and explorers of the sixteenth century, the revolutionaries
 * of the 1770s who stand for independence (off here), Henry Hudson (furs), Jakob Fugger.
 */
const COUNCIL: FatherId[] = [
  'adamSmith', 'peterMinuit', 'peterStuyvesant', 'janDeWitt', 'laSalle', 'georgeWashington', 'paulRevere', 'thomasJefferson',
  'thomasPaine', 'benjaminFranklin', 'williamBrewster', 'williamPenn', 'jeanDeBrebeuf', 'bartolomeDeLasCasas',
  'henryMorgan', 'williamDampier', 'mariaSibyllaMerian',
];

/** Islands without furs: no furs or coats, no fur trapper or fur trader. */
const GOODS_IN_PLAY: GoodId[] = without(GOODS, 'furs', 'coats');

/** Terrains of the warm generator: no tundra or arctic. */
const TERRAINS: TerrainId[] = ['ocean', 'highSeas', 'plains', 'grassland', 'prairie', 'savannah', 'marsh', 'swamp', 'desert', 'hills', 'mountains'];

export const CARIBBEAN: Scenario = {
  id: 'caribbean',
  version: 1,
  name: 'The Caribbean, 1650–1750',
  description: 'The lesser powers: Courland, Brandenburg, Scotland and the Knights of Malta try their luck among the sugar islands beside England, France, the Netherlands, Spain and Denmark. A hundred years, no independence: the richest nation wins.',
  calendar: CARIBBEAN_CALENDAR,
  map: {
    // The real map by default; the generated archipelago stays on offer as "Random (generated)".
    stored: [{ id: 'caribbean', peoples: CARIBBEAN_PEOPLES }],
    generator: CARIBBEAN_GENERATOR,
    default: 'caribbean',
    extras: { bonus: 0.05, coastalBonus: 0.08, rumours: 0.03, noRumours: [] },
    settlements: { avoid: ['mountains'], spacing: 3 },
    crown: 'entry',
  },
  terrain: TERRAINS,
  nations: {
    sets: { alternative: ALTERNATIVE, real: REAL },
    default: 'alternative',
    max: ALTERNATIVE.length,
    crown: { ...AMERICAS.nations.crown },
    // The companies of the Caribbean century: the Darien scheme, the Dutch WIC, Courland's Tobago.
    companies: [DARIEN, WEST_INDIA, COURLAND_COMPANY],
  },
  peoples: {
    // North to south: the Arawak of the Greater Antilles, the Kalinago of the Lesser Antilles, the
    // Tupi on the mainland coast.
    ids: ['arawak', 'kalinago', 'tupi'],
    // What the islands' peoples grew and sold to ships: cotton (their hammocks) and tobacco.
    produce: ['cotton', 'tobacco'],
    settlements: { nomadic: SETTLEMENT_KINDS.camp, agricultural: SETTLEMENT_KINDS.village },
    // The Tupi want cloth instead of coats in the tropics.
    overrides: { tupi: { wants: ['tradeGoods', 'tools', 'cloth'] } },
  },
  goods: GOODS_IN_PLAY,
  units: without(Object.keys(UNIT_TYPES) as UnitTypeId[], 'expertFurTrapper', 'masterFurTrader'),
  buildings: without(BUILDING_ORDER, 'furTrader'),
  council: { categories: [...FATHER_CATEGORIES], members: COUNCIL },
  events: 'caribbean',
  ai: {
    // 202 turns instead of 609: the computer players' plans come about three times sooner.
    pace: 0.35,
    // Settlers sail to other islands when theirs is full.
    islands: true,
    cooperation: { proposeAlliance: 0.03, foundCompany: 0.12, buyShares: 0.25, foundMargin: 0, sharesMargin: 500 },
    goods: {
      trade: ['silver', 'sugar', 'tobacco', 'cotton', 'ore', 'rum', 'cigars', 'cloth', 'horses'],
      export: ['sugar', 'tobacco', 'cotton', 'ore', 'silver', 'rum', 'cigars', 'cloth'],
      road: ['lumber', 'ore', 'silver'],
      farm: ['food', 'sugar', 'tobacco', 'cotton'],
    },
  },
  // The Crown taxes and demands, and drags its colonies into Europe's wars, but sends no army:
  // nobody declares independence in this century.
  mechanics: {
    taxes: true,
    boycotts: true,
    demands: true,
    royalWars: true,
    ref: false,
    independence: false,
    favoured: true,
    // Crowded islands: a dearer charter than the Americas' (100 a colony, at most 2,000).
    charter: { base: 150, cap: 3000 },
    customHouse: true,
    missions: true,
    alliances: true,
    companies: true,
  },
  // A century of trading companies and small powers: alliances need only a trade agreement (no
  // Favoured Nation forms between the computer players here) and half a century of peace, and
  // companies are cheaper and founded more readily than in the Americas.
  alliances: { requires: 'trade', peaceYears: { base: 50, spread: 10 }, volume: { min: 0, max: 0 } },
  companyRules: { capital: 1000, reserve: 400 },
  victory: [{ id: 'concord' }, { id: 'time' }],
  rumours: AMERICAS.rumours,
  // A century of trade: wealth and trade agreements weigh more than in the Americas (1/800, 3, 4).
  score: { wealth: 1 / 500, tradeAgreement: 5, favoured: 6 },
  text: {
    colonyLand: 'the West Indies',
    council: 'Colonial Council',
    councilShort: 'Council',
    member: 'Councillor',
    members: 'Councillors',
    'rumour.colonist': 'You find castaways from a shipwreck; they join you as free colonists.',
    'rumour.treasure': 'You find a cache hidden by buccaneers and recover {gold} gold!',
    'rumour.treasure.history': 'Explorers find a cache hidden by buccaneers and recover {gold} gold.',
    'gameOver.time': 'The year {year} has come, and the age of the chartered companies is over.',
    'landing.eyebrow': 'A game of the West Indies, 1650–1750',
    'landing.heading': 'Found colonies. Trade sugar and tobacco. Outlast the great powers.',
    'landing.pitch':
      'Sail to the West Indies for Courland, Brandenburg, Scotland or the Knights of Malta, or for one of the great powers: settle the islands, meet the Arawak, the Kalinago and the Tupi, bring the people of the age into your council, and grow the richest colonies in a hundred years.',
    'landing.maps': 'The real West Indies, or generated archipelagos of small islands in a warm sea',
    'newGame.tagline': 'The lesser powers in the age of the chartered companies.',
  },
  // The Americas' covers and council hall until the scenario has its own (BOX_ART_PROMPTS section L).
};
