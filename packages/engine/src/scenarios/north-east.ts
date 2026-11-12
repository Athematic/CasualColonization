/**
 * The North-east, 1000–1850 (Beta 3 step 8; docs/design/native-nations.md, T16–T20 and section 13).
 * Native peoples as nations that choose: the peoples of Newfoundland and Labrador, the St. Lawrence,
 * the Great Lakes, the Maritimes and New England, some of them played (by a person or the computer)
 * and the others as settlements under Beta 2's rules, one turn a year from 1000, with the European
 * nations arriving one by one from 1497. No Norse, Greenland or Vikings: they belong to the Vinland
 * scenario (Beta 4, T17).
 *
 * Everything here that is history (the peoples, their homelands and values, the council's new
 * members, the arrivals, the events, the words) is drafted for Simon's review, with its sources in
 * the note (section 13). The numbers are a first tuning; computer players are step 9.
 *
 * A scenario of the New game screen since Beta 3 step 10b (Simon's decision; registered hidden until
 * then): the screen offers its peoples (every European nation arrives after 1000, so a game needs a
 * playing people at its start, arrivals.ts), and `?scenario=north-east` opens it.
 *
 * Imports only the leaf rule tables, like the Americas and the Caribbean, so any engine module can
 * import the registry.
 */
import { EUROPEAN_BUILDINGS, PEOPLE_BUILDINGS } from '../rules/buildings.js';
import { COLONY_CHARTER } from '../rules/difficulty.js';
import { AMERICAS_FATHERS, type FatherId } from '../rules/fathers.js';
import { congress, PEOPLE_COUNCIL } from '../rules/councils.js';
import { GOODS } from '../rules/goods.js';
import { NATIONS, type NationId, type NorthEastPeopleId } from '../rules/nations.js';
import { SETTLEMENT_KINDS } from '../rules/natives.js';
import type { PortEntry } from '../rules/ports.js';
import type { TerrainId } from '../rules/terrain.js';
import { EUROPEAN_UNIT_TYPES, PEOPLE_UNIT_TYPES } from '../rules/units.js';
import { NORTH_EAST_PEOPLES, NORTH_EAST_RENEWAL } from '../maps/north-east.js';
import { AMERICAS } from './americas.js';
import type { Calendar } from './calendar.js';
import type { NationEntry, PeopleOverride, PlayablePeople, Scenario } from './types.js';
import { HUDSONS_BAY, WEST_INDIA } from './companies.js';

const without = <T>(list: readonly T[], ...drop: T[]): T[] => list.filter((x) => !drop.includes(x));

/**
 * One turn a year from 1000 to 1850 (T16, Simon's decision): 851 turns. A head start jumps to 1250,
 * 1490 (on the eve of the first arrival), 1600 or 1700, the computer playing the years before.
 */
export const NORTH_EAST_CALENDAR: Calendar = {
  eras: [{ from: 1000, turnsPerYear: 1 }],
  end: { year: 1850 },
  headStartYears: [1250, 1490, 1600, 1700],
};

/** The home ports. Furs fetched most in France and the Netherlands; fish is not a good of the game. */
const PORTS: Record<'england' | 'portugal' | 'france' | 'spain' | 'netherlands', PortEntry> = {
  // Bristol: John Cabot sailed from it in 1497, and its merchants fished off Newfoundland.
  england: { name: 'Bristol', market: { prices: { tobacco: 1.2, furs: 1.1 }, depth: { cloth: 1.5, tools: 1.5 } } },
  // Lisbon: the Corte-Real brothers sailed from Portugal to the Terra Nova in 1500–1502.
  portugal: { name: 'Lisbon', market: { prices: { sugar: 1.2, furs: 0.9 }, ships: 0.85 } },
  // Saint-Malo: Jacques Cartier's port; the fur trade later ran through La Rochelle and Rouen.
  france: { name: 'Saint-Malo', market: { prices: { furs: 1.25, coats: 1.2 }, depth: { furs: 1.25 } } },
  // San Sebastián: the Basque whaling and fishing ports of Gipuzkoa sent their ships to Labrador.
  spain: { name: 'San Sebastián', market: { prices: { silver: 1.1, cloth: 1.2, furs: 0.9 }, depth: { tools: 1.25 }, ships: 0.9 } },
  // Amsterdam: beaver for the hat-makers of Europe, and trade goods for the peoples.
  netherlands: { name: 'Amsterdam', market: { prices: { furs: 1.25, tobacco: 1.2 }, depth: { tradeGoods: 2 } } },
};

/**
 * The nations, each arriving in the year its first expedition reached the region (T18): England
 * with John Cabot (1497), Portugal with Gaspar Corte-Real (1500), France with Jacques Cartier
 * (1534), Spain with the Basque whalers of the Strait of Belle Isle (from 1536), and the
 * Netherlands with Adriaen Block and Fort Nassau on the upper Hudson (1614). Colony names start with
 * the places each founded or named in the region, then go on in its colonists' style.
 */
const N = {
  england: {
    id: 'england',
    name: 'England',
    adjective: 'English',
    color: NATIONS.england.color,
    arrives: 1497,
    // The Puritan migration to New England, the 1630s.
    bonus: { text: 'Immigration: fewer crosses needed for new colonists.', modifiers: [{ hook: 'crossesStep', set: 12 }] },
    colonyNames: [
      "St. John's", 'Cupids', 'Ferryland', 'Plymouth', 'Boston', 'Salem', 'Portsmouth', 'Pemaquid', 'Hartford', 'Providence',
      'Newport', 'New Haven', 'Harbour Grace', 'Carbonear', 'Trinity', 'Bonavista', 'Placentia', 'Annapolis Royal', 'Halifax',
      'Lunenburg', 'Albany', 'Oswego', 'Falmouth', 'Kittery', 'York', 'Gloucester', 'Marblehead', 'Springfield', 'Northampton',
      'Deerfield', 'Kingston', 'Saint John', 'Fredericton', 'Charlottetown',
      // In the style of the English colonies.
      'New Bristol', 'Port Charles', 'Williamsburg', 'Queenstown', 'Georgetown', 'Hanover',
    ],
    port: PORTS.england,
  },
  portugal: {
    id: 'portugal',
    name: 'Portugal',
    adjective: 'Portuguese',
    color: NATIONS.portugal.color,
    arrives: 1500,
    // The Portuguese cod fishery on the Grand Banks (the bacalhau) and their pilots' charts.
    bonus: { text: 'Navigators: ships gain one extra move.', modifiers: [{ hook: 'shipMoves', add: 1 }] },
    colonyNames: [
      // Names the Portuguese gave the coasts, and João Álvares Fagundes's settlement attempt of the 1520s.
      'Terra Nova', 'Bacalhau', 'Fogo', 'Cabo Raso', 'Baía da Concepção', 'Porto Novo', 'Santa Cruz', 'Terra do Lavrador',
      // In the style of the towns of Portugal and the Azores, where the settlers came from.
      'Nova Viana', 'Nova Lisboa', 'Angra Nova', 'Aveiro Novo', 'São João', 'São Miguel', 'Ponta Delgada Nova', 'Porto Seguro',
      'Vila Nova', 'Santa Maria', 'São Jorge', 'Nova Braga', 'Faial', 'Porto Santo', 'Nova Coimbra', 'Corte Real',
    ],
    port: PORTS.portugal,
  },
  france: {
    id: 'france',
    name: 'France',
    adjective: 'French',
    color: NATIONS.france.color,
    arrives: 1534,
    // Alliances and trade with the Innu, the Algonquin and the Wendat from Champlain's time.
    bonus: { text: 'Cooperation: native settlements give better gifts and teach more readily.', modifiers: [{ hook: 'nativeGifts', add: 0.15 }, { hook: 'nativesTeach', units: ['pettyCriminal'] }] },
    colonyNames: [
      'Québec', 'Port-Royal', 'Tadoussac', 'Trois-Rivières', 'Ville-Marie', 'Plaisance', 'Louisbourg', 'Sainte-Croix',
      'Charlesbourg-Royal', 'Fort Frontenac', 'Fort Niagara', 'Fort Saint-Frédéric', 'Fort Carillon', 'Beaubassin', 'Grand-Pré',
      'Sorel', 'Chambly', 'Pentagouët', 'Port-la-Joye', 'Gaspé', 'Beauport', 'Lachine', 'La Prairie', 'Boucherville',
      'Port-Toulouse', 'Sillery', 'Fort Rouillé', 'Baie-Saint-Paul', 'Kamouraska', 'Rivière-Ouelle',
      // In the style of New France.
      'Saint-Charles', 'Sainte-Anne', 'Port-Dauphin', 'Fort Saint-Louis', 'Saint-Ours', 'Varennes',
    ],
    port: PORTS.france,
  },
  spain: {
    id: 'spain',
    name: 'Spain',
    adjective: 'Spanish',
    color: NATIONS.spain.color,
    arrives: 1536,
    // The Basque whaling fleets sailed in numbers each year.
    bonus: { text: 'Whaling fleets: a second caravel waits in the home port from the start.', modifiers: [{ hook: 'startingDocks', units: ['caravel'] }] },
    colonyNames: [
      // The Basque whaling harbours of the Strait of Belle Isle as the Basque records name them (Red Bay
      // was Butus), and Placentia's Basque name: from Barkham's work, to be checked (note, section 13).
      'Butus', 'Plazentzia', 'Gradun', 'Puerto Nuevo', 'Puerto de los Hornos',
      // In the style of the Basque whaling ports of Gipuzkoa and Bizkaia.
      'Donostia Berria', 'Pasaia Berria', 'Orio', 'Getaria', 'Zumaia', 'Mutriku', 'Deba', 'Hondarribia', 'Lekeitio', 'Bermeo',
      'Ondarroa', 'Elantxobe', 'Zarautz', 'Mundaka', 'Plentzia', 'San Juan', 'Santa Ana', 'San Pedro', 'Santiago',
    ],
    port: PORTS.spain,
  },
  netherlands: {
    id: 'netherlands',
    name: 'the Netherlands',
    adjective: 'Dutch',
    color: NATIONS.netherlands.color,
    arrives: 1614,
    // New Netherland's fur trade at Fort Oranje.
    bonus: { text: 'Trade: market prices recover twice as fast.', modifiers: [{ hook: 'priceRecovery', set: 0.2 }] },
    colonyNames: [
      'Fort Nassau', 'Fort Oranje', 'Nieuw Amsterdam', 'Beverwijck', 'Schenectade', 'Wiltwijck', 'Fort Goede Hoop', 'Breuckelen',
      'Nieuw Haarlem', 'Vlissingen', 'Rensselaerswijck', 'Esopus', 'Midwout', 'Amersfoort', 'Boswijck', 'Bergen', 'Pavonia',
      'Nieuw Utrecht', 'Vlackebos', 'Gravesande',
      // In the style of the Dutch colonies.
      'Nieuw Leiden', 'Nieuw Hoorn', 'Fort Willem', 'Nieuw Delft', 'Veere', 'Zierikzee',
    ],
    port: PORTS.netherlands,
  },
} satisfies Partial<Record<NationId, NationEntry>>;

/**
 * Where each nation's ships arrive (T18), on the Atlantic high seas off the coasts its fleets made
 * for: Portugal's off the Avalon, where the fishing fleets came to the Grand Banks; France's and
 * Spain's at the Atlantic mouth of the Strait of Belle Isle, Cartier's way into the Gulf and the
 * Basque whalers' grounds; England's off the Gulf of Maine, between Nova Scotia and New England
 * (Cabot's own landfall of 1497 was further north, on Newfoundland or Cape Breton: it is debated);
 * the Netherlands' off New York Bay and the Hudson. Tiles of the map (maps/north-east.ts).
 */
const ENTRIES: Partial<Record<NationId, [number, number]>> = {
  england: [40, 64],
  portugal: [80, 44],
  france: [62, 47],
  spain: [73, 22],
  netherlands: [31, 72],
};

/** The order the nations arrived in. Both sets are the same five: no alternative history here yet. */
const REAL: NationEntry[] = [N.england, N.portugal, N.france, N.spain, N.netherlands];

/**
 * The Congress: the Americas' Founding Fathers less the conquistadors and the Spanish Main's
 * (Cortés, Coronado, de Soto, Sepúlveda, Bolívar), who belong to other shores.
 */
const COUNCIL: FatherId[] = without(AMERICAS_FATHERS, 'hernanCortes', 'franciscoDeCoronado', 'hernandoDeSoto', 'juanDeSepulveda', 'simonBolivar');

/** The peoples, north to south (T20). Their research and sources: native-nations.md section 13. */
const PEOPLES: NorthEastPeopleId[] = [
  'dorset', 'inuit', 'eeyou', 'innu', 'beothuk', 'algonquin', 'mikmaq', 'wolastoqiyik', 'penobscot', 'abenaki', 'wendat',
  'stLawrenceIroquoians', 'attawandaron', 'haudenosaunee', 'mohican', 'massachusett', 'wampanoag', 'narragansett', 'munsee',
];

/**
 * The peoples setup may play (T4): two farming confederacies of the Great Lakes and two peoples of
 * the coast and the north, so the ways of life the region knew are all playable. Their towns start
 * at their settlements' places and take these names, places the sources record, in order (the
 * capital first; Beta 3 step 10b, Simon's decision); towns founded later take the next ones.
 */
const PLAYABLE: PlayablePeople[] = [
  {
    id: 'haudenosaunee',
    name: 'the Haudenosaunee',
    adjective: 'Haudenosaunee',
    // Towns of the Five Nations recorded in the 17th and 18th centuries.
    townNames: ['Onondaga', 'Ganondagan', 'Kanonwalohale', 'Tiononderoge', 'Canajoharie', 'Kanatsiohareke', 'Goiogouen', 'Tionontoguen', 'Ossernenon', 'Totiakton', 'Oneida Castle', 'Chenussio'],
  },
  {
    id: 'wendat',
    name: 'the Wendat',
    adjective: 'Wendat',
    // Wendat towns of the 1620s–1640s, as the Jesuits recorded them.
    townNames: ['Ossossané', 'Teanaostaiaé', 'Taenhatentaron', 'Cahiagué', 'Ihonatiria', 'Scanonaenrat', 'Contarea', 'Toanché', 'Arontaen'],
  },
  {
    id: 'mikmaq',
    name: "the Mi'kmaq",
    adjective: "Mi'kmaw",
    // Places of Mi'kma'ki by their Mi'kmaw names, used today (Halifax, the Shubenacadie, Pictou, Richibucto, Restigouche, Burnt Church, Cape Breton, Prince Edward Island).
    townNames: ['Kjipuktuk', "Sipekne'katik", 'Piktuk', 'Elsipogtog', 'Listuguj', 'Esgenoôpetitj', "Unama'ki", 'Epekwitk', 'Wagmatcook', 'Eskasoni'],
  },
  {
    id: 'innu',
    name: 'the Innu',
    adjective: 'Innu',
    // Innu communities of Nitassinan by their Innu names (Sept-Îles, Mingan, Natashquan, Sheshatshiu, Mashteuiatsh, Betsiamites, La Romaine, Saint-Augustin, Schefferville, Natuashish).
    townNames: ['Uashat', 'Ekuanitshit', 'Nutashkuan', 'Sheshatshiu', 'Mashteuiatsh', 'Pessamit', 'Unamen Shipu', 'Pakua Shipi', 'Matimekush', 'Natuashish'],
  },
];

/**
 * Each people's own values (T10, T14): what it keeps in store, and the weights of its score where
 * they differ from the scenario's. A first reading of the sources, for Simon's review: the
 * Haudenosaunee's League and council, the Wendat's trade and the corn they kept to trade north,
 * the hunting peoples' land kept whole.
 */
const OVERRIDES: Partial<Record<NorthEastPeopleId, PeopleOverride>> = {
  haudenosaunee: { score: { peopleCouncil: 7, peopleTreaty: 4 } },
  wendat: { storeYears: 1.5, score: { peopleTrust: 7, peopleTreaty: 4 } },
  mikmaq: { score: { peopleLandHealth: 0.8, peopleHomeland: 0.7, peopleTrust: 6 } },
  innu: { score: { peopleLandHealth: 0.8, peopleHomeland: 0.7, peopleStoreYear: 3 } },
};

/** The terrains of the map (no savannah, swamp, desert or arctic). */
const TERRAINS: TerrainId[] = ['ocean', 'highSeas', 'plains', 'grassland', 'prairie', 'marsh', 'tundra', 'hills', 'mountains'];

export const NORTH_EAST: Scenario = {
  id: 'north-east',
  version: 1,
  name: 'The North-east, 1000–1850',
  description:
    "The peoples of the North-east as nations: the Haudenosaunee, the Wendat, the Mi'kmaq and the Innu among their neighbours, from the year 1000, with the Europeans arriving one by one from 1497.",
  calendar: NORTH_EAST_CALENDAR,
  map: {
    stored: [{ id: 'north-east', peoples: NORTH_EAST_PEOPLES, renewal: NORTH_EAST_RENEWAL, entries: ENTRIES }],
    default: 'north-east',
    extras: { bonus: 0.05, coastalBonus: 0.07, rumours: 0.02, noRumours: [] },
    // Settlements two tiles apart (about 55 km at this scale): the peoples of the Great Lakes and
    // southern New England lived close together, and each of the Five Nations has its town.
    settlements: { avoid: ['mountains'], spacing: 2 },
    crown: 'entry',
  },
  terrain: TERRAINS,
  nations: {
    sets: { alternative: REAL, real: REAL },
    default: 'real',
    max: REAL.length,
    crown: { ...AMERICAS.nations.crown },
    // The Dutch West India Company (1621, New Netherland) and the Hudson's Bay Company (1670).
    companies: [WEST_INDIA, HUDSONS_BAY],
  },
  peoples: {
    ids: PEOPLES,
    playable: PLAYABLE,
    // What the peoples' settlements traded: furs, and the Iroquoians' tobacco.
    produce: ['furs', 'tobacco'],
    settlements: { nomadic: SETTLEMENT_KINDS.camp, agricultural: SETTLEMENT_KINDS.village },
    overrides: OVERRIDES,
  },
  goods: [...GOODS],
  units: [...EUROPEAN_UNIT_TYPES],
  buildings: [...EUROPEAN_BUILDINGS],
  nationTypes: { people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
  // Maize, beans and squash grew from the St. Lawrence valley and Huronia south (the map's plains
  // and prairie), not on the Shield, in the Maritimes' conifer forests or in Newfoundland (T6).
  peopleEconomy: { gardens: ['plains', 'prairie'] },
  councils: {
    congress: congress(COUNCIL),
    // The engine's people's council with the region's two named leaders (rules/fathers.ts).
    people: { ...PEOPLE_COUNCIL, members: [...PEOPLE_COUNCIL.members, 'membertou', 'kondiaronk'] },
  },
  events: 'north-east',
  ai: {
    // The computer Europeans keep to the Americas' dates, though the game starts in 1000, and half as
    // late again (Beta 3 step 9): they arrive from 1497 on poor land and play a turn a year, so the
    // Americas' arc (an independence plan from the 1620s–1660s) came before their colonies were grown.
    dates: true,
    stretch: 1.5,
    goods: AMERICAS.ai.goods,
  },
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
    burialGrounds: true,
    surrender: true,
    alliances: true,
    companies: true,
    confederation: true,
    peopleTreaties: ['people-trade', 'land-use', 'exchange', 'defence'],
    // The peoples' economy (T10, T12): hard years, the land's health by region, epidemics after contact.
    hardYears: { chance: 1 / 8 },
    landHealth: { regionSize: 8, renewal: 40, recovery: 5, floor: 0.2 },
    // 1 in 75 a year for a region in contact (step 4 drafted 1 in 25; Beta 3 step 9): at 1 in 25 every
    // colony and town was struck about every 25 years, and the Europeans' small colonies, among
    // settlements everywhere, lost more colonists to it than they gained.
    epidemics: { chance: 1 / 75, years: 3, loss: 1, reach: 8 },
    // Knowledge of the land (Beta 3 step 10b, native-nations.md section 16): a people moves swiftly on
    // unclaimed land it has seen, peoples that meet share their maps (a people nobody plays its land
    // within 3 tiles of its settlements, again every 50 years), and computer peoples' runners explore
    // up to 12 tiles from their towns (times their profile's reach).
    mapKnowledge: { seen: true, share: { homeland: 3, every: 50 }, range: 12 },
  },
  // Both sides judged at the end year, in the decided order (T14). The peoples' peaceful ways are
  // tuned so that a people wins in about 1 game in 5 (T15; Beta 3 step 9, native-nations.md section
  // 14): the computer peoples are seldom pressed off their land here (their claimed land is closed
  // to colonies), so continuity asks for a homeland whose land is all but untouched, and a good life
  // for land kept whole, a century without hunger and treaties with three in four of those met.
  victory: [
    { id: 'military' },
    { id: 'independence-war' },
    { id: 'confederacy' },
    { id: 'concord' },
    { id: 'prosperity' },
    { id: 'continuity', params: { landHealth: 97.5 } },
    { id: 'good-life', params: { landHealth: 93, hungerYears: 100, treatyShare: 0.75 } },
    { id: 'time' },
  ],
  rumours: AMERICAS.rumours,
  text: {
    'landing.eyebrow': 'A game of the North-east, 1000–1850',
    'landing.heading': 'Keep your land, your people and your ways, before and after the ships come.',
    'landing.pitch':
      "Play the Haudenosaunee, the Wendat, the Mi'kmaq or the Innu from the year 1000: grow your towns, keep your stores against hard years and the land whole, make treaties and leagues, and meet the Europeans as they arrive one by one from 1497. Or sail for England, Portugal, France, Spain or the Netherlands.",
    'landing.maps': 'The North-east drawn from real coordinates, from Labrador to the Hudson',
    'newGame.tagline': 'Native peoples as nations, from the year 1000.',
    'gameOver.time': 'The year {year} has come.',
  },
};
