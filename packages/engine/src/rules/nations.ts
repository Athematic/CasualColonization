import type { GoodId } from './goods.js';
import type { UnitTypeId } from './units.js';

export type NationId = 'england' | 'france' | 'netherlands' | 'spain' | 'portugal' | 'sweden' | 'denmark' | 'russia';

export interface NationDef {
  id: NationId;
  name: string;
  adjective: string;
  color: string;
  bonus: string;
  colonyNames: string[];
}

export const NATIONS: Record<NationId, NationDef> = {
  england: {
    id: 'england', name: 'England', adjective: 'English', color: '#c8202e',
    bonus: 'Immigration: fewer crosses needed for new colonists.',
    colonyNames: ['Jamestown', 'Plymouth', 'Roanoke', 'Boston', 'Providence', 'Hartford', 'New Haven', 'Salem', 'Charleston', 'Baltimore', 'Savannah', 'Albany'],
  },
  france: {
    id: 'france', name: 'France', adjective: 'French', color: '#1f4fa3',
    bonus: 'Cooperation: native settlements give better gifts and teach more readily.',
    colonyNames: ['Québec', 'Montréal', 'Trois-Rivières', 'Port Royal', 'Louisbourg', 'Détroit', 'Biloxi', 'Nouvelle-Orléans', 'Mobile', 'Kaskaskia', 'Vincennes', 'Tadoussac'],
  },
  netherlands: {
    id: 'netherlands', name: 'the Netherlands', adjective: 'Dutch', color: '#e8820c',
    bonus: 'Trade: market prices recover twice as fast.',
    colonyNames: ['Nieuw Amsterdam', 'Fort Oranje', 'Beverwijck', 'Nieuw Haarlem', 'Breuckelen', 'Vlissingen', 'Wiltwijck', 'Swaanendael', 'Fort Nassau', 'Nieuw Utrecht', 'Bergen', 'Rensselaerswijck'],
  },
  spain: {
    id: 'spain', name: 'Spain', adjective: 'Spanish', color: '#e6b800',
    bonus: 'Conquest: +50% offence against native settlements.',
    colonyNames: ['Isabela', 'Santo Domingo', 'San Juan', 'La Habana', 'Veracruz', 'San Agustín', 'Santa Fe', 'Cartagena', 'Panamá', 'Campeche', 'Mérida', 'Pensacola'],
  },
  portugal: {
    id: 'portugal', name: 'Portugal', adjective: 'Portuguese', color: '#0f7a3c',
    bonus: 'Seafaring: ships gain one extra move.',
    colonyNames: ['Salvador', 'São Vicente', 'Olinda', 'Recife', 'Rio de Janeiro', 'Belém', 'São Luís', 'Santos', 'Natal', 'Vitória', 'Porto Seguro', 'Ilhéus'],
  },
  sweden: {
    id: 'sweden', name: 'Sweden', adjective: 'Swedish', color: '#3d8fd1',
    bonus: 'Expertise: colonists start with an expert lumberjack.',
    colonyNames: ['Fort Christina', 'Nya Göteborg', 'Fort Nya Elfsborg', 'Upland', 'Finland', 'Kristinehamn', 'Mölndal', 'Nya Vasa', 'Sveaborg', 'Torne', 'Nya Uppsala', 'Kalmar'],
  },
  denmark: {
    id: 'denmark', name: 'Denmark', adjective: 'Danish', color: '#b0306a',
    bonus: 'Endurance: colonies need less food to grow.',
    colonyNames: ['Christiansted', 'Frederiksted', 'Charlotte Amalie', 'Godthåb', 'Christianshåb', 'Frederikshåb', 'Holsteinsborg', 'Jakobshavn', 'Egedesminde', 'Julianehåb', 'Sukkertoppen', 'Upernavik'],
  },
  russia: {
    id: 'russia', name: 'Russia', adjective: 'Russian', color: '#5a3d8a',
    bonus: 'Frontier: scouts and dragoons see further.',
    colonyNames: ['Novo-Arkhangelsk', 'Fort Ross', 'Kodiak', 'Pavlovsk', 'Mikhailovsk', 'Nikolaevsk', 'Konstantinovsk', 'Alexandrovsk', 'Unalaska', 'Kenai', 'Bodega', 'Kolmakov'],
  },
};

export const NATION_ORDER: NationId[] = ['england', 'france', 'netherlands', 'spain', 'portugal', 'sweden', 'denmark', 'russia'];

export type TribeId = 'iroquois' | 'cherokee' | 'sioux' | 'apache' | 'aztec' | 'arawak' | 'tupi' | 'inca';

export interface TribeDef {
  id: TribeId;
  name: string;
  color: string;
  settlement: 'camp' | 'village' | 'city';
  skills: UnitTypeId[];
  wants: GoodId[];
}

export const TRIBES: Record<TribeId, TribeDef> = {
  iroquois: { id: 'iroquois', name: 'Iroquois', color: '#7a4b2a', settlement: 'village', skills: ['expertFarmer', 'expertFurTrapper', 'masterTobaccoPlanter', 'expertFisherman'], wants: ['muskets', 'cloth', 'tools'] },
  cherokee: { id: 'cherokee', name: 'Cherokee', color: '#2f7d6a', settlement: 'village', skills: ['masterTobaccoPlanter', 'expertFarmer', 'masterCottonPlanter', 'expertFurTrapper'], wants: ['cloth', 'tradeGoods', 'horses'] },
  sioux: { id: 'sioux', name: 'Sioux', color: '#a8452b', settlement: 'camp', skills: ['expertFurTrapper', 'seasonedScout', 'masterFurTrader'], wants: ['horses', 'muskets', 'tradeGoods'] },
  apache: { id: 'apache', name: 'Apache', color: '#c0702f', settlement: 'camp', skills: ['expertFurTrapper', 'seasonedScout', 'masterCottonPlanter'], wants: ['horses', 'rum', 'tradeGoods'] },
  aztec: { id: 'aztec', name: 'Aztec', color: '#3b6e2a', settlement: 'city', skills: ['expertOreMiner', 'expertSilverMiner', 'masterCottonPlanter', 'masterSugarPlanter'], wants: ['cloth', 'cigars', 'tools'] },
  arawak: { id: 'arawak', name: 'Arawak', color: '#c99a1e', settlement: 'village', skills: ['masterSugarPlanter', 'expertFisherman', 'masterCottonPlanter'], wants: ['tradeGoods', 'cloth', 'rum'] },
  tupi: { id: 'tupi', name: 'Tupi', color: '#6a8f2a', settlement: 'camp', skills: ['masterSugarPlanter', 'expertFisherman', 'expertLumberjack'], wants: ['tradeGoods', 'tools', 'coats'] },
  inca: { id: 'inca', name: 'Inca', color: '#8a2f5a', settlement: 'city', skills: ['expertSilverMiner', 'expertOreMiner', 'masterWeaver', 'expertFarmer'], wants: ['cloth', 'coats', 'muskets'] },
};

/** North to south. */
export const TRIBE_ORDER: TribeId[] = ['iroquois', 'cherokee', 'sioux', 'apache', 'aztec', 'arawak', 'tupi', 'inca'];
