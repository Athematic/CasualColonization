import { COLONY_NAMES } from './colonyNames.js';
import type { GoodId } from './goods.js';
import type { UnitTypeId } from './units.js';

/** The Americas' eight nations, whose catalogue entries (NATIONS) are the Americas' values. */
export type AmericasNationId = 'england' | 'france' | 'netherlands' | 'spain' | 'portugal' | 'sweden' | 'denmark' | 'russia';

/**
 * Every nation id a scenario may use (Q2: a scenario's `NationEntry` says all about the nation).
 * The lesser powers of the Caribbean, 1650–1750 (scenarios/caribbean.ts) have no catalogue entry.
 */
export type NationId = AmericasNationId | 'courland' | 'brandenburg' | 'scotland' | 'malta' | 'crown' | CompanyId;

/**
 * Chartered companies (docs/design/cooperation.md, step 3): players of their own (`Player.kind`
 * 'company'), founded during a game by nations, named by a scenario's `nations.companies`. They are
 * never in `GameConfig.nations`, so they are not in NATION_IDS (game codes).
 */
export type CompanyId = 'hudsonsBay' | 'westIndia' | 'mississippi' | 'darien' | 'courlandCompany';

/** Every company id, for the rules that need no game at hand (relations, native tension). */
export const COMPANY_IDS: ReadonlySet<PlayerId> = new Set<CompanyId>(['hudsonsBay', 'westIndia', 'mississippi', 'darien', 'courlandCompany']);

/** Whether a nation id names a chartered company (companies.ts `isCompanyId` asks the game instead). */
export function isCompanyIdent(id: NationId): id is CompanyId {
  return COMPANY_IDS.has(id);
}

/**
 * Every nation id but the Crown, in a fixed order that never changes: game codes store a nation as
 * its index here (seedphrase.ts). The Americas' eight come first, as NATION_ORDER.
 */
export const NATION_IDS: Exclude<NationId, 'crown'>[] = ['england', 'france', 'netherlands', 'spain', 'portugal', 'sweden', 'denmark', 'russia', 'courland', 'brandenburg', 'scotland', 'malta'];

export interface NationDef {
  id: NationId;
  name: string;
  adjective: string;
  color: string;
  bonus: string;
  colonyNames: string[];
}

export const NATIONS = {
  england: {
    id: 'england', name: 'England', adjective: 'English', color: '#c8202e',
    bonus: 'Immigration: fewer crosses needed for new colonists.',
    colonyNames: COLONY_NAMES.england,
  },
  france: {
    id: 'france', name: 'France', adjective: 'French', color: '#1f4fa3',
    bonus: 'Cooperation: native settlements give better gifts and teach more readily.',
    colonyNames: COLONY_NAMES.france,
  },
  netherlands: {
    id: 'netherlands', name: 'the Netherlands', adjective: 'Dutch', color: '#e8820c',
    bonus: 'Trade: market prices recover twice as fast.',
    colonyNames: COLONY_NAMES.netherlands,
  },
  spain: {
    id: 'spain', name: 'Spain', adjective: 'Spanish', color: '#e6b800',
    bonus: 'Conquest: +50% offence against native settlements.',
    colonyNames: COLONY_NAMES.spain,
  },
  portugal: {
    id: 'portugal', name: 'Portugal', adjective: 'Portuguese', color: '#0f7a3c',
    bonus: 'Seafaring: ships gain one extra move.',
    colonyNames: COLONY_NAMES.portugal,
  },
  sweden: {
    id: 'sweden', name: 'Sweden', adjective: 'Swedish', color: '#3d8fd1',
    bonus: 'Expertise: an expert lumberjack waits on the docks in Europe from the start.',
    colonyNames: COLONY_NAMES.sweden,
  },
  denmark: {
    id: 'denmark', name: 'Denmark', adjective: 'Danish', color: '#b0306a',
    bonus: 'Endurance: colonies need less food to grow.',
    colonyNames: COLONY_NAMES.denmark,
  },
  russia: {
    id: 'russia', name: 'Russia', adjective: 'Russian', color: '#5a3d8a',
    bonus: 'Frontier: scouts and dragoons see further.',
    colonyNames: COLONY_NAMES.russia,
  },
} as Record<AmericasNationId | 'crown', NationDef>;

/** The Royal Expeditionary Force; joins the game only when a colony declares independence. */
NATIONS.crown = {
  id: 'crown', name: 'the Crown', adjective: 'Royal', color: '#6d1f3a',
  bonus: 'Sent to crush rebellions.',
  colonyNames: ['Royal Colony'],
};

/** Each nation's home port in Europe, where its ships trade (and, for Favoured Nations, its partners' ships). */
export const HOME_PORTS: Record<AmericasNationId | 'crown', string> = {
  england: 'London', france: 'La Rochelle', netherlands: 'Amsterdam', spain: 'Seville',
  portugal: 'Lisbon', sweden: 'Gothenburg', denmark: 'Copenhagen', russia: 'Saint Petersburg', crown: 'London',
};

export const NATION_ORDER: AmericasNationId[] = ['england', 'france', 'netherlands', 'spain', 'portugal', 'sweden', 'denmark', 'russia'];

/**
 * Any player's id (native-nations.md T1): a nation (the Crown and companies included) or a native
 * people played as a nation, which keeps its own people id. The ids never overlap.
 */
export type PlayerId = NationId | TribeId;

export type TribeId =
  | 'iroquois'
  | 'cherokee'
  | 'sioux'
  | 'apache'
  | 'aztec'
  | 'arawak'
  | 'tupi'
  | 'inca'
  | 'kalinago'
  // The North-east, 1000–1850 (scenarios/north-east.ts; native-nations.md T20, section 13).
  | NorthEastPeopleId;

/** The peoples of the North-east scenario (native-nations.md T20), north to south. */
export type NorthEastPeopleId =
  | 'dorset'
  | 'inuit'
  | 'eeyou'
  | 'innu'
  | 'beothuk'
  | 'algonquin'
  | 'mikmaq'
  | 'wolastoqiyik'
  | 'penobscot'
  | 'abenaki'
  | 'wendat'
  | 'stLawrenceIroquoians'
  | 'attawandaron'
  | 'haudenosaunee'
  | 'mohican'
  | 'massachusett'
  | 'wampanoag'
  | 'narragansett'
  | 'munsee';

/**
 * How a people lives on the land. A scenario's settlement-kind table (`Scenario.peoples.settlements`)
 * says which kind of settlement each lifeway builds, with all its numbers (rules/natives.ts
 * SETTLEMENT_KINDS); the Americas: nomadic peoples live in camps, agricultural ones in villages,
 * urban ones in cities.
 */
export type Lifeway = 'nomadic' | 'agricultural' | 'urban';

/** A people of the catalogue (docs/design/scenario-framework.md, section 3.6). */
export interface PeopleDef {
  id: TribeId;
  name: string;
  color: string;
  lifeway: Lifeway;
  skills: UnitTypeId[];
  wants: GoodId[];
  /**
   * How the people meets proposals of treaties (native-partners.md N8): open, guarded or proud
   * (peopletreaties.ts, `PeopleTreatyRules.temperaments`). Missing means none: the rules as they are.
   * Scenario data (`peoples.overrides`); the catalogue gives none.
   */
  temperament?: Temperament;
  /**
   * Years of food a playing people's towns keep as their reserve (native-nations.md T10; the
   * engine's `PeopleEconomy.storeYears` when missing). Scenario data (`peoples.overrides`).
   */
  storeYears?: number;
}

/** A people's temperament towards treaties (N8). Not "wary", which is a mood word (tensionLabel). */
export type Temperament = 'open' | 'guarded' | 'proud';

/** The engine's older name for a people; the state keeps `tribe` ids. */
export type TribeDef = PeopleDef;

export const TRIBES: Record<TribeId, PeopleDef> = {
  iroquois: { id: 'iroquois', name: 'Iroquois', color: '#7a4b2a', lifeway: 'agricultural', skills: ['expertFarmer', 'expertFurTrapper', 'masterTobaccoPlanter', 'expertFisherman'], wants: ['muskets', 'cloth', 'tools'] },
  cherokee: { id: 'cherokee', name: 'Cherokee', color: '#2f7d6a', lifeway: 'agricultural', skills: ['masterTobaccoPlanter', 'expertFarmer', 'masterCottonPlanter', 'expertFurTrapper'], wants: ['cloth', 'tradeGoods', 'horses'] },
  sioux: { id: 'sioux', name: 'Sioux', color: '#a8452b', lifeway: 'nomadic', skills: ['expertFurTrapper', 'seasonedScout', 'masterFurTrader'], wants: ['horses', 'muskets', 'tradeGoods'] },
  apache: { id: 'apache', name: 'Apache', color: '#c0702f', lifeway: 'nomadic', skills: ['expertFurTrapper', 'seasonedScout', 'masterCottonPlanter'], wants: ['horses', 'rum', 'tradeGoods'] },
  aztec: { id: 'aztec', name: 'Aztec', color: '#3b6e2a', lifeway: 'urban', skills: ['expertOreMiner', 'expertSilverMiner', 'masterCottonPlanter', 'masterSugarPlanter'], wants: ['cloth', 'cigars', 'tools'] },
  arawak: { id: 'arawak', name: 'Arawak', color: '#c99a1e', lifeway: 'agricultural', skills: ['masterSugarPlanter', 'expertFisherman', 'masterCottonPlanter'], wants: ['tradeGoods', 'cloth', 'rum'] },
  tupi: { id: 'tupi', name: 'Tupi', color: '#6a8f2a', lifeway: 'nomadic', skills: ['masterSugarPlanter', 'expertFisherman', 'expertLumberjack'], wants: ['tradeGoods', 'tools', 'coats'] },
  inca: { id: 'inca', name: 'Inca', color: '#8a2f5a', lifeway: 'urban', skills: ['expertSilverMiner', 'expertOreMiner', 'masterWeaver', 'expertFarmer'], wants: ['cloth', 'coats', 'muskets'] },
  /**
   * The Kalinago (the "Island Caribs" of European writers), of the Lesser Antilles: Dominica, St
   * Vincent, St Lucia, Grenada, Martinique and Guadeloupe (the Caribbean, 1650–1750). They spoke an
   * Arawakan language, Island Carib, and lived in villages of family houses around a large men's
   * house (the karbet); they grew cassava, cotton, tobacco and peppers in cleared gardens, fished
   * and travelled between the islands in large dugout canoes, and were known for their cotton
   * hammocks. They traded with every European visitor for iron tools, knives and, later, guns, and
   * resisted settlement of their islands for well over a century: the treaty of 1660 with England
   * and France left Dominica and St Vincent to them. Their descendants live today in the Kalinago
   * Territory on Dominica; the Garifuna descend from Kalinago and Africans of St Vincent. Their
   * colour is the red of roucou (annatto), with which they painted themselves. Not in the Americas' set.
   */
  kalinago: { id: 'kalinago', name: 'Kalinago', color: '#a64b2a', lifeway: 'agricultural', skills: ['expertFisherman', 'masterCottonPlanter', 'masterTobaccoPlanter', 'seasonedScout'], wants: ['tools', 'muskets', 'tradeGoods'] },
  // The North-east, 1000–1850 (native-nations.md T20; the research, its sources and what is drafted
  // for Simon's review are in section 13 of the note). Not in the Americas' or the Caribbean's sets.
  // Lifeways are today's fixed-settlement ones: the seasonal round many of these peoples lived
  // (Australia's `seasonal` lifeway, later) is drawn as camps. Skills are what a European colonist
  // may learn among them; wants are what they sought in trade (iron tools, kettles and cloth, later
  // muskets). Drafted for Simon's review, like everything of this scenario.
  /**
   * The Dorset: an archaeologists' name (from Cape Dorset, where the culture was first described);
   * Inuit tradition remembers a people before them as the Tuniit. Around 1000 they lived on the
   * northern Labrador coast and in Nunavik, hunting seals and walrus from the sea ice; they are no
   * longer found in Labrador after about the 14th century (the scenario's `until`).
   */
  dorset: { id: 'dorset', name: 'Dorset', color: '#8c8a7a', lifeway: 'nomadic', skills: ['expertFisherman', 'seasonedScout'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /**
   * The Inuit of Labrador and Nunavik, whose ancestors (the archaeologists' Thule culture) came east
   * across the Arctic and reached the northern Labrador coast in the 15th century (the scenario's
   * `from`): sea-mammal hunters with kayaks and the large umiak, wintering in sod houses.
   */
  inuit: { id: 'inuit', name: 'Inuit', color: '#5b7f95', lifeway: 'nomadic', skills: ['expertFisherman', 'seasonedScout', 'expertFurTrapper'], wants: ['tools', 'tradeGoods', 'muskets'] },
  /** The Eeyou (James Bay Cree) of Eeyou Istchee, hunters of the rivers and lakes east of James Bay. */
  eeyou: { id: 'eeyou', name: 'Eeyou', color: '#6e8b3d', lifeway: 'nomadic', skills: ['expertFurTrapper', 'seasonedScout', 'expertFisherman'], wants: ['tools', 'muskets', 'tradeGoods'] },
  /**
   * The Innu (once called Montagnais and Naskapi by Europeans) of Nitassinan, the Quebec–Labrador
   * peninsula from the north shore of the Gulf to the interior: caribou and moose hunters who came
   * to the coast in summer. Tadoussac at the Saguenay's mouth was their great trading place.
   */
  innu: { id: 'innu', name: 'Innu', color: '#9a6b3f', lifeway: 'nomadic', skills: ['expertFurTrapper', 'seasonedScout', 'masterFurTrader'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /**
   * The Beothuk of Newfoundland (whose ancestors archaeologists call the Little Passage culture):
   * they moved between the coast in summer and the Exploits valley in winter, and kept away from
   * the European fishing stations. The last known Beothuk, Shanawdithit, died in 1829.
   */
  beothuk: { id: 'beothuk', name: 'Beothuk', color: '#b5532f', lifeway: 'nomadic', skills: ['expertFisherman', 'expertFurTrapper'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /**
   * The Algonquin of the Ottawa valley (Anishinaabeg, as they call themselves with their Ojibwe and
   * Odawa kin): hunters and traders who held the river route to the interior; the Kichesipirini of
   * Morrison Island took tolls from those who passed.
   */
  algonquin: { id: 'algonquin', name: 'Algonquin', color: '#4f7a5a', lifeway: 'nomadic', skills: ['expertFurTrapper', 'masterFurTrader', 'seasonedScout'], wants: ['tools', 'tradeGoods', 'muskets'] },
  /**
   * The Mi'kmaq of Mi'kma'ki: Nova Scotia, Cape Breton (Unama'ki), Prince Edward Island (Epekwitk),
   * eastern New Brunswick and the Gaspé. Fishing and shellfish on the coast in the warm months,
   * moose and caribou inland in winter; skilled in sea-going canoes. Among the first to trade with
   * European fishermen in the 16th century.
   */
  mikmaq: { id: 'mikmaq', name: "Mi'kmaq", color: '#2f6f8f', lifeway: 'nomadic', skills: ['expertFisherman', 'expertFurTrapper', 'seasonedScout'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /** The Wolastoqiyik ("people of the beautiful river", the Saint John; Maliseet to the English). */
  wolastoqiyik: { id: 'wolastoqiyik', name: 'Wolastoqiyik', color: '#3f7f7a', lifeway: 'nomadic', skills: ['expertFurTrapper', 'expertFisherman', 'expertFarmer'], wants: ['tools', 'tradeGoods', 'muskets'] },
  /** The Penobscot (Penawahpskewi), Eastern Abenaki of the Penobscot River and Penobscot Bay. */
  penobscot: { id: 'penobscot', name: 'Penobscot', color: '#557a8f', lifeway: 'nomadic', skills: ['expertFisherman', 'expertFurTrapper'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /** The Western Abenaki (Alnôbak) of the Connecticut and Lake Champlain valleys, hunters who also grew maize. */
  abenaki: { id: 'abenaki', name: 'Abenaki', color: '#6b8f4e', lifeway: 'agricultural', skills: ['expertFurTrapper', 'expertFarmer', 'seasonedScout'], wants: ['tools', 'muskets', 'tradeGoods'] },
  /**
   * The Wendat (Huron to the French), a confederacy of four nations in towns of longhouses between
   * Georgian Bay and Lake Simcoe: farmers of maize, beans and squash and the great traders of the
   * region, exchanging corn for furs with the Algonquian peoples to the north. Dispersed by war with
   * the Haudenosaunee in 1649; the Wendat of Wendake near Quebec and the Wyandot descend from them.
   */
  wendat: { id: 'wendat', name: 'Wendat', color: '#a0522d', lifeway: 'agricultural', skills: ['expertFarmer', 'masterFurTrader', 'masterTobaccoPlanter'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /**
   * The St. Lawrence Iroquoians: a scholars' name; their own is not known. Farmers in palisaded towns
   * from Lake Ontario to the estuary, among them Stadacona (Quebec) and Hochelaga (Montreal), where
   * Cartier came in 1535. By Champlain's voyage of 1603 their towns were gone; why is still debated
   * (war, disease, peoples moving away). They leave in the scenario's `until` year.
   */
  stLawrenceIroquoians: { id: 'stLawrenceIroquoians', name: 'St. Lawrence Iroquoians', color: '#8a5a44', lifeway: 'agricultural', skills: ['expertFarmer', 'expertFisherman', 'masterTobaccoPlanter'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /**
   * The Attawandaron: the Wendat name for them; the French called them the Neutral, for they kept out
   * of the wars between the Wendat and the Haudenosaunee. A confederacy of farming towns between the
   * Grand River and the Niagara, dispersed in the 1650s.
   */
  attawandaron: { id: 'attawandaron', name: 'Attawandaron', color: '#b07a3a', lifeway: 'agricultural', skills: ['expertFarmer', 'masterTobaccoPlanter', 'expertFurTrapper'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /**
   * The Haudenosaunee ("people of the longhouse"; the Iroquois to Europeans), the Mohawk, Oneida,
   * Onondaga, Cayuga and Seneca of today's upstate New York, joined in their League; the Tuscarora
   * joined in the 1720s. A catalogue entry of its own beside the Americas' "Iroquois", so that
   * sentences name them as they name themselves without changing the Americas' games.
   */
  haudenosaunee: { id: 'haudenosaunee', name: 'Haudenosaunee', color: '#7a4b2a', lifeway: 'agricultural', skills: ['expertFarmer', 'expertFurTrapper', 'masterTobaccoPlanter', 'expertFisherman'], wants: ['muskets', 'cloth', 'tools'] },
  /** The Mohican (Muhheaconneok) of the upper Hudson valley; the Stockbridge-Munsee Community descends from them. */
  mohican: { id: 'mohican', name: 'Mohican', color: '#7f6a3a', lifeway: 'agricultural', skills: ['expertFurTrapper', 'expertFarmer', 'expertFisherman'], wants: ['tools', 'tradeGoods', 'muskets'] },
  /** The Massachusett of Massachusetts Bay, farming and fishing peoples of the coast. */
  massachusett: { id: 'massachusett', name: 'Massachusett', color: '#a3763d', lifeway: 'agricultural', skills: ['expertFarmer', 'expertFisherman'], wants: ['tools', 'tradeGoods', 'cloth'] },
  /** The Wampanoag (Wôpanâak) of Cape Cod, the islands and the land east of Narragansett Bay. */
  wampanoag: { id: 'wampanoag', name: 'Wampanoag', color: '#9c5b3b', lifeway: 'agricultural', skills: ['expertFisherman', 'expertFarmer'], wants: ['tools', 'cloth', 'tradeGoods'] },
  /** The Narragansett of the west shore of Narragansett Bay, one of the most numerous peoples of southern New England. */
  narragansett: { id: 'narragansett', name: 'Narragansett', color: '#7d4f2f', lifeway: 'agricultural', skills: ['expertFarmer', 'expertFisherman', 'masterFurTrader'], wants: ['tools', 'cloth', 'tradeGoods'] },
  /** The Munsee, the northern Lenape of the lower Hudson, Manhattan and the Delaware's upper reaches. */
  munsee: { id: 'munsee', name: 'Munsee', color: '#6f5a3a', lifeway: 'agricultural', skills: ['expertFarmer', 'expertFisherman', 'expertFurTrapper'], wants: ['tools', 'tradeGoods', 'cloth'] },
};

/** North to south. */
export const TRIBE_ORDER: TribeId[] = ['iroquois', 'cherokee', 'sioux', 'apache', 'aztec', 'arawak', 'tupi', 'inca'];
