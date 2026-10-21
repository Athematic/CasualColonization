import { COLONY_NAMES } from './colonyNames.js';
import type { GoodId } from './goods.js';
import type { UnitTypeId } from './units.js';

export type NationId = 'england' | 'france' | 'netherlands' | 'spain' | 'portugal' | 'sweden' | 'denmark' | 'russia' | 'crown';

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
} as Record<NationId, NationDef>;

/** The Royal Expeditionary Force; joins the game only when a colony declares independence. */
NATIONS.crown = {
  id: 'crown', name: 'the Crown', adjective: 'Royal', color: '#6d1f3a',
  bonus: 'Sent to crush rebellions.',
  colonyNames: ['Royal Colony'],
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
