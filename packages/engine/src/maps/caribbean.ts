import type { StoredMap, TribeRegion } from './index.js';

/**
 * The Caribbean basin, 1650–1750: from the Florida Straits and the Bahamas to the Spanish Main, the
 * Isthmus of Panama and the Guiana coast, from the Yucatán and Central America to the Lesser Antilles
 * and the open Atlantic. The legend is in index.ts.
 *
 * Drawn from real coordinates, not by eye. Projection: equirectangular, 0.35° of latitude per row and
 * 0.35° / cos 17° (about 0.366°) of longitude per column, so a tile is about 39 km across at the map's
 * middle latitude. Bounds: 91.5° W to about 54.9° W (100 columns), 27.5° N to 5.8° N (62 rows); the
 * tile at column x, row y covers longitude -91.5 + 0.366x to -91.5 + 0.366(x + 1) and latitude
 * 27.5 - 0.35y down to 27.5 - 0.35(y + 1) (`caribbeanTile` below). Land is the Natural Earth 1:10m
 * coastline sampled 25 times per tile (land where at least 30% of a tile is land), with every
 * island of 40 km² or more kept as at least one tile; then a few tiles were corrected by hand where
 * the sampling broke a shape (the narrow west of Cuba, Puerto Rico's north coast, Trinidad apart
 * from the Orinoco delta, the strait into Lake Maracaibo). Terrain follows the real geography:
 * the Sierra Maestra, the Cordillera Central of Hispaniola, the Blue Mountains, the highlands of
 * Guatemala and Honduras, the Talamanca, the Sierra Nevada de Santa Marta and the Andes as
 * mountains; the Everglades, the Zapata swamp, the Mosquito Coast, Tabasco, the Darién, the
 * Mompós depression and the Orinoco delta as swamp and marsh; the dry Guajira, Paraguaná, the
 * ABC islands and the low Bahamas as desert and scrub; the llanos as savannah; tropical and rain
 * forest elsewhere. Lake Nicaragua is a lake; Lake Maracaibo opens to the sea.
 *
 * Compromises at this scale: the smallest islands (Saba, St Eustatius, St Barthélemy, the Keys,
 * San Andrés) are left out or share a tile with a neighbour; St Kitts and Nevis are two tiles,
 * most of the Lesser Antilles one each; the two eastern columns are the arrival edge's high seas,
 * which cuts off the coast of Suriname; the Pacific is ocean without high seas, since the route
 * to Europe ran through the Caribbean.
 *
 * Ships arrive from the east, on the Atlantic high seas beyond the Lesser Antilles.
 */
export const caribbean: StoredMap = {
  id: 'caribbean',
  name: 'The Caribbean',
  description:
    'The West Indies drawn from real coordinates: the Bahamas, Cuba, Hispaniola, Jamaica and Puerto Rico, the Lesser Antilles from the Virgin Islands to Trinidad and Tobago, the ABC islands, and the Spanish Main from the Yucatán and the Mosquito Coast to the Isthmus of Panama, the Orinoco and the Guiana coast. Expeditions arrive from the east.',
  entryRows: [4, 50],
  // Main rivers first, tributaries after the river they join. Format: parseRivers in rivers.ts.
  // The San Juan runs from Lake Nicaragua to the Caribbean.
  rivers: `
    Orinoco: m 65,61 68,59 M 68,56 72,56 76,55 79,54 82,54 84,54 85,53
    Magdalena: m 46,61 46,57 M 47,53 46,51 45,49 45,47 45,46
    Apure: m 56,57 62,56 66,56 68,56
    Caroni: m 78,61 78,57 78,54
    Cauca: m 43,61 44,56 45,53 46,51
    Atrato: m 40,61 40,58 39,55 39,54
    Catatumbo: m 51,55 53,53 54,52
    Essequibo: m 89,61 89,60 90,58 91,57
    San Juan: M 18,47 19,47 21,47 22,47
    Coco: m 13,40 16,38 M 19,37 22,35 23,34
    Patuca: m 14,37 17,35 19,33 20,32
    Ulua: m 9,37 9,35 10,33 11,32
    Motagua: m 2,36 5,35 8,33 9,32
    Chagres: m 33,52 31,52 31,51
    Artibonite: m 54,24 52,23 51,23 50,23
    Yaque del Norte: m 56,24 54,22 54,21
    Cauto: m 42,20 40,20 38,19 37,20
  `,
  rows: `
~~~~~~~~~~~~~~~~~~~~~...PpppppP............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~....pPpPpp............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~....ppPpPp....s.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~.....pmmmm........s...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~.....wmmw..............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~......wwm................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~.....mw....................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~............P.P..s........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~...........ss.....D......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~................P........D...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~...................D.......s.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~.......~~~~~~~..........................P...........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~.......~~~~~~.........SsSsSs...........................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~.......~~~~~~......hhhpsSSsSSss..............s..........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~...D.............shhSppspwwSpsSss.p.............d.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..................SsS......wwShhSSssSs...............d....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.......................S...p...hSsSssss.............D.d...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.....DsDsDDss......................SssSSS.........d.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
...DDDDDDsDDs....................s.sssSSspp......d........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
...DsDsssDsDs...~~~~.................pspSphhSs................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
...sSSsSSSSS....~~~~~~~~~..............sSShhhhh.................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
...SSssSSsS.....~~~~~~~~~.............^^^^^SDD....SS..............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..SSSSSSsSS.....~~~~~~~~~......S.................SsShSShhhD..................~~~~~~~~~~~~~~~~~~~~~~~
..sSSSSSSSs....~~~~~~~~~~...s......................ssh^gSshDs....................~~~~~~~~~~~~~~~~~~~
SSsSSSsSSSS...~~~~~~~~~~~.........................ssssS^^^DDSDS..................~~~~~~~~~~~~~~~~~~~
WwwSSsSSSS....~~~~~~~~~~~............s........ShhS.ssshhhsssSsS....SSs...s...........~~~~~~~~~~~~~~~
WWwSSSSsSs....~~~~~~~~~~~.......~...hhhh^......hhhhh^^dS.D....D.S.Shhhs.S....s.......~~~~~~~~~~~~~~~
sSSSSSSSS.....~~~~~~~~~~~~~~~~~~~....SSsss............SS.................D...........~~~~~~~~~~~~~~~
WSSWWWWsS.S........~~~~~~~~~~~~~~.............................................S..p...~~~~~~~~~~~~~~~
WSWWWSWsw..........~~~~~~~~~~~~~~.............................................S..p....~~~~~~~~~~~~~~
SWWSWShhw..............~~~~~~~~~~~...........~~~~~~........~~~~~~~~~~~..........s.....~~~~~~~~~~~~~~
WWSWWSWhh....S.S........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...........~~~~~~~~~~~~~~
WWWSWWWS....S.............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~......SS...~~~~~~~~~~~~~~
sDShSSWWwWSSSSwWWSmm......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..........~~~~~~~~~~~~~
^^^^hhhhWWSWSSSWWSswm.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....S....~~~~~~~~~~~~~
^^^^^^hhhhhhhWWWWWWWmww...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~
s^^^^^^^hhhhhhhSWWsssWm...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....s...~~~~~~~~~~~~~
sDss^^^^^^^^hhhhWWWSsww...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~............~~~~~~~~~
ssSDsD^^^^^^^DhhhSSWSw....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....S.......~~~~~~~~~
....DDDSsS^^^sDhhhWWSw....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~............~~~~~~~~~
.......DssDSSSDShhWWsm....~~~~~~~~~~~~~~~~~~~~~~~~.................~~~~~~~~~~~~...S....s...~~~~~~~~~
..........DSsDsDhhSSsw...~~~~~~~~~~~~~~~~~~~~~~~~..................~~~.......~.............~~~~~~~~~
...........SDSDDhhssSw...~~~~~~~~~~~~~~~~~~~~~~....................~~~.......~.............~~~~~~~~~
............DSsshSSSww...~~~~~~~~~~~~~~~~~~~.........DDS..D..d.d...~~~.......~.............~~~~~~~~~
.............ss..ssSm....~~~~~~~~~~~~~~~~~..........DDds..d........~.....s.......S......~~~~~~~~~~~~
..............DD..sWw....~~~~~~~~~~~~~~~..........SSDD....dDd...........................~~~~~~~~~~~~
...............DD..sw.....~~~~~~~~~~~~~~.......SsSS^DD..DSsdDSS.....................s...~~~~~~~~~~~~
................D^SSWS.....~~~~~~~~~~~~~.....sm^^^s^Ss.ssDsDsSDD.......D...h............~~~~~~~~~~~~
................D^^SWW.................~...ssgms^^S^ss.ssDDDSsSDh^^hhS....SDDSDS.Sh.....~~~~~~~~~~~~
...............DsDs^^wW....................ssgSggs^^sS..sgghhhhSSsSshhhh.hhhhSS..wS.....~~~~~~~~~~~~
................DDDS^^SS...................sgsggSs^sS...SS^hhSSSsSsSSSssSSSSSsSw.......~~~~~~~~~~~~~
...................sS^^^SS......SWhS.......SgsmSs^^SS...S^^ssssSssssssmsssSssmswWwwW......~~~~~~~~~~
.....................DW^^w....WWSDhhw.....sSgmwwSgsssw.S^^^msSSSssssssssSsssmsswWwww........~~~~~~~~
.....................sDs^hhhhWWD...Shh..gSgSSmwwSgsgSww^^^sSsssssmsssssssssmmSswwWwW........~~~~~~~~
......................sDDSsShhDD.DD.Dhh.sssSSsggsSsSss^^^sSSsssssssssssssSsSmSswwWWWWwm......~~~~~~~
..........................SDsSD.....SWWWWSShgggggsg^^^^SsssssSsssmssmssSsssssSsWWWwwWWwwm.....~~~~~~
...........................ssDS.....sSWWWShhsggsss^^^^sssSssmsmsssssssssmssmsssssSsSSSWWw......~~~~~
..........................S..Ss......SWWWSh^sSSgSg^^gSSsmssssmssssssssmssmssSssssshSSWWWww......~~~~
.....................................swWW^^^gsSgss^^SgSSsmssmmmmssshhsSShsSshssSShhhsWWWWmm.......~~
......................................WWW^^^WSWSW^^SWSWWsmsmssmmsmhSsSSSSSsshSShSShsSSSWWWww......~~
......................................WSW^^^^WWSW^^WWWWWssssssmmsshhhhShsSssShhhSssShSShhhhwm.....~~
......................................WWS^^^^SWWS^^SWWSWssmmssssmmhhhSSShSSShSShShSsSSSWSSSWwmmw.w~~
`,
};

/** The projection above: the tile at a longitude and latitude (degrees, west and south negative). */
export function caribbeanTile(lon: number, lat: number): { x: number; y: number } {
  const degreesPerRow = 0.35;
  const degreesPerColumn = degreesPerRow / Math.cos((17 * Math.PI) / 180);
  return { x: Math.floor((lon + 91.5) / degreesPerColumn), y: Math.floor((27.5 - lat) / degreesPerRow) };
}

/**
 * Where the Caribbean scenario's three peoples live on this map, around 1650.
 *
 * The Greater Antilles are nearly empty: the Taíno were destroyed by conquest, forced labour and
 * epidemics within a few decades of 1492, and by 1650 only small communities of their descendants
 * remained, as in the mountains of eastern Cuba, so the Arawak have one settlement there and none
 * on Hispaniola, Jamaica or Puerto Rico. The Lucayans of the Bahamas were gone entirely.
 *
 * The Kalinago (Island Caribs) held the windward islands of the Lesser Antilles; by 1650 the French
 * and English were taking Guadeloupe, Martinique and Grenada, and Dominica and St Vincent were left
 * to them as their last strongholds (the treaty of 1660). Their kin the Kari'na lived on the lower
 * Orinoco and in the Guiana hinterland. The Lokono (Arawak) lived along the Guiana coast and on
 * Trinidad, where the Dutch and the English traded with them.
 *
 * SIMPLIFICATION: the scenario has three peoples, so the Tupi stand in for all the mainland peoples
 * from Florida to Venezuela: the Calusa, the Maya of the Yucatán and the Itzá of the Petén (who
 * held out until 1697), the Lenca and other peoples of the Honduran highlands, the Miskito of the
 * Mosquito Coast, the Bribri and Ngäbe of the Talamanca, the Guna of the Darién, the Wayuu of the
 * Guajira, the Zenú and the peoples of the Magdalena, the Barí of Maracaibo and the peoples of the
 * llanos. Spanish towns already stood on much of the Main by 1650; the game has no colonies before
 * its start, so the mainland peoples hold the land the nations will settle.
 *
 * Regions are [x0, y0, x1, y1] in tiles (inclusive). The scenario spaces settlements 3 tiles apart,
 * so the one-tile islands can each hold one.
 */
export const CARIBBEAN_PEOPLES: TribeRegion[] = [
  // The Kalinago: Dominica, St Vincent and Grenada; the Kari'na of the lower Orinoco and the Guiana hinterland.
  { tribe: 'kalinago', region: [82, 34, 82, 34], count: 1 },
  { tribe: 'kalinago', region: [82, 40, 82, 40], count: 1 },
  { tribe: 'kalinago', region: [81, 43, 81, 44], count: 1 },
  { tribe: 'kalinago', region: [74, 55, 85, 61], count: 2 },
  // The Lokono on the Guiana coast and Trinidad; a remnant of the Taíno in the mountains of eastern Cuba.
  { tribe: 'arawak', region: [86, 55, 97, 61], count: 3 },
  { tribe: 'arawak', region: [81, 48, 82, 49], count: 1 },
  { tribe: 'arawak', region: [43, 19, 47, 21], count: 1 },
  // The Tupi standing in for the mainland peoples, north to south and west to east.
  { tribe: 'tupi', region: [24, 0, 31, 6], count: 1 },
  { tribe: 'tupi', region: [2, 17, 11, 31], count: 3 },
  { tribe: 'tupi', region: [0, 33, 12, 40], count: 2 },
  { tribe: 'tupi', region: [13, 33, 22, 46], count: 3 },
  { tribe: 'tupi', region: [20, 47, 30, 53], count: 2 },
  { tribe: 'tupi', region: [33, 51, 40, 57], count: 2 },
  { tribe: 'tupi', region: [46, 42, 53, 48], count: 2 },
  { tribe: 'tupi', region: [40, 49, 48, 61], count: 2 },
  { tribe: 'tupi', region: [49, 49, 58, 56], count: 1 },
  { tribe: 'tupi', region: [56, 52, 73, 61], count: 3 },
];
