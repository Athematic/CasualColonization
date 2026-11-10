import type { StoredMap, TribeRegion } from './index.js';

/**
 * Australia, with Tasmania, the Torres Strait and the southern coast of New Guinea. The legend is in index.ts.
 *
 * A geography-only preview: the game still uses the American rules. European ships came to
 * Australia by way of the Cape of Good Hope, so expeditions arrive on the western high seas.
 *
 * PLACEHOLDER PEOPLES: the engine only knows the eight American tribes, so the Americas scenario
 * places camp-dwelling tribe ids here (AUSTRALIA_PLACEHOLDER_PEOPLES) to keep the map playable. The
 * Australia scenario will list this map with its own peoples, Aboriginal nations and Torres Strait
 * Islanders (see docs/design/australia.md).
 * Settlements are sparse in the deserts and denser along the coasts.
 */
export const australia: StoredMap = {
  id: 'australia',
  name: 'Australia',
  description:
    'A geography-only preview: from the Torres Strait to Tasmania, with the tropical north, the Great Dividing Range, the fertile south-east and the vast dry interior. Expeditions arrive from the west, by way of the Cape of Good Hope. The peoples are placeholders until a scenario adds Aboriginal nations and Torres Strait Islanders.',
  entrySide: 'west',
  entryRows: [18, 60],
  // Main rivers first, tributaries after the river they join. Format: parseRivers in rivers.ts.
  // Cooper Creek runs south-west from the Channel Country to Lake Eyre; the lake's centre (49,43) is a
  // lake tile ('.', water) so the creek can end in it, with marsh around it.
  rivers: `
    Murray: m 65,56 M 60,53 55,51 53,54 52,57 52,58
    Darling: m 66,37 62,42 M 58,47 55,51
    Murrumbidgee: m 65,50 60,50 57,52
    Hawkesbury: m 69,46 73,47 74,47
    Brisbane: m 70,37 72,36 73,36
    Swan: m 16,45 13,46 12,46
    Cooper Creek: m 58,36 54,39 50,43 49,43
    Flinders: m 58,28 55,24 54,22 53,22
    Derwent: m 62,67 63,69 63,70 64,70
  `,
  rows: `
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...wwWW^h^^^^^hhh^^....~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....wWS^^^^^hhhhhh^....~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....MWWh^^^^^^hhhhh.....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....MMSSSSWWWWWSWWSW....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....MSWWWWWWwMWSWSS.....~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....wwwwWWWwM..SSWWS.....~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.......wwWww....SWWS......~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.......www......WSWW.....~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~........~~~~~~.................SWWW....~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.............~~~~.....s..........WWS...~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.................~.....................~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...sw..................s...............~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.......wws............Ss....~~.........~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~..........wsshhSSSMM........SsW...~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~..........wsSshhhssM.........SSW.....~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~...........SssShhhssm.........ssW......~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~......sS....SSSsDSSsSmM........ssW......~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~.....shss..SsDSSSsSsS..........ssSsS....~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~.......shhssssSsSDDSsDDwM.........sSSsSS....~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~......shhhhssSssDSSssDDDmm........sShhWW....~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~......hhhhssssDsDDppDpppsMm......wsDh^WW....~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~....s.shhhsshssssppDppppspDmwM.m..wDps^hWS...~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~.....SsSshsssssssspDDsppDpssspmM..wmpps^^WW....~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~......ssSSssSssssDDppDDDppssssDpMMmMppDDhhWW.....~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~.......sSSsSSssssssssDppsssDsssppppsDDDDpDhhSW.......~~~~~~~~~~~
~~~~~~~~~~~~...........ddddddddddssdDdDDssDpDssssDDssssDpDsshhSW.......~~~~~~~~~~
~~~~~~~~~~~...........DDdddddddddssDddDdDsDppDsssssssssDspssshhss......~~~~~~~~~~
~~~~~~~~~...........DDddddddddddddddddddddDdDDddddddDDssssDpspshhss.....~~~~~~~~~
~~~~~~~~.......DDDDdddDddddDdddddDddddddddddddddDDDdDdddddsdpssphhSs.....~~~~~~~~
~~~~~~~~......DDDDddDDDdddDDDDddDDDDddDddddddddDDDdDDddsdddspssshhSS.....~~~~~~~~
~~~~~~~~...DDdDdDhDdddhdddddddddddddDddDddddDdddDdDDdDDddddDssssDhhSs.....~~~~~~~
~~~~~~~....D.sdDdddddhhdddddddddddddddDDdddDDddddDDDsDDsdddDsDssps^^SS.....~~~~~~
~~~~~~~....DsddDDddDdhhddddddddddDDdddDDDddDDdddddDDdsDssDsssDsssphhSs......~~~~~
~~~~~~~....DDDhhDdddDDDddddddddddDdddddDh^hhhhDDddddDDDDDDDdsDDppps^hss.......~~~
~~~~~~~...DDDDDDdDDDDDdddDddddddddddddDD^hhhhhDdddddDDDDDDDddDDDssss^^SS......~~~
~~~~~~~....DdDDdDDDDdddDdDdddddddddDDdddDDDDDDddddddDsDDDDsdsDrDpgrrr^^gg.....~~~
~~~~~~~......sDddDDdddDDDDdddddddDdDddddddDddddddddDddddDssddddpDDppprr^h.R...~~~
~~~~~~~....D.dDddDDDddDDdDdddddddddDdddddDddddddddddDsdDDDssddppDDgrprhhRgg...~~~
~~~~~~~~..DD.DDDddDdDDDDDDDdDDDDDDdhhhhhhhddddddddddsddddssDDsDpppppphhhgR....~~~
~~~~~~~~...DDDdDDDdddDDDDDdDdddDdddddddddddddddddddddsddddDDDsDDpppgpPPhgg....~~~
~~~~~~~~...DDDdDDDdDdddDDdddddDdddddddddddddDddDDddDddsDsdDDsdDppprprhhhR.g...~~~
~~~~~~~~....DDDdDDddddddddDddddDdddddddddddddDDDDddDdDDsssDDdddDDprrrr^hhRR...~~~
~~~~~~~~....DDDdddDddDDdddDddddDDdddddddddddDdDDmmDdssDdddDdsddpppDprr^hhRR...~~~
~~~~~~~~....gdDdDDDDDDDddDddddDDDddDDDDdddddddddm.DdsdddddsDsDdDpppgrrhPPgg...~~~
~~~~~~~~~....pddDDDDDDDDddddddDdddDdddDDDdddddddmmDDDdddddDDsDdppDpggrhhPpP...~~~
~~~~~~~~~....grdDDDDDDDDddddDdddDDDdddDddDddddddDdddDssdssDDssDpprrgphhPpP....~~~
~~~~~~~~~....gpgDDDddDdddddddddpdppdddppdddDDdDddDddDsdsDDDDDsDDpDrrrhhhpP....~~~
~~~~~~~~~~....pgpDDdDDddddddDpdddpppdpppdddddDDDddhhDDsdDDDsDsDDDDrrrhhhpp....~~~
~~~~~~~~~~....gppDDDDDDDDddDDpdppppd....pDDDDDdDDdhhsdddDDDssDDDDDgpgPPhgR...~~~~
~~~~~~~~~~....grrDDDDDDDdddDDdpp...........rrprpDrhhDpprdDDdsDDDDpggPPPgg....~~~~
~~~~~~~~~~....RrpppppDDDDddDD...............rrrpD.hhDDDrsDDdDrrDpgpphhPRR....~~~~
~~~~~~~~~~....RppgrpprpdDDD..................rpp.p^^DDDrDdDsDrDDpppPhhpp.....~~~~
~~~~~~~~~~...RPPRPPpgpppDD.........~~~~~.....pr..pphDDDDDDsDrpDppphhhPp.....~~~~~
~~~~~~~~~~...RRRRPRp............~~~~~~~~~.....p..p.hDDrDDDspDDprppPPhPR.....~~~~~
~~~~~~~~~~.....PRR............~~~~~~~~~~~~......p..hDDrDDDDpppDpgpPPhPR....~~~~~~
~~~~~~~~~~...................~~~~~~~~~~~~~.........hprDDDDpDDDrhhhhhPp....~~~~~~~
~~~~~~~~~~.............~~~~~~~~~~~~~~~~~~~~.....p...pDDrDDDDDrrhh^^^PR....~~~~~~~
~~~~~~~~~~~~.........~~~~~~~~~~~~~~~~~~~~~~~~.......rrpPhhppggg^h^^^p.....~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~........rrphhPpgpghhhhhp....~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........rPppPPp.gRRRPg.....~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.......ppPp.p.RR.......~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.............P........~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....................~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~......P......g...~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..............~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....GPPgpPg...~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....hGhPgpg...~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..hh^hggP...~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...GhhgP....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....GRgP....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....GR......~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..........~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.......~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
`,
};

/**
 * The Americas scenario's peoples on the Australia map: PLACEHOLDERS (see above) until the Australia
 * scenario places Aboriginal nations and Torres Strait Islanders here.
 */
export const AUSTRALIA_PLACEHOLDER_PEOPLES: TribeRegion[] = [
  // The tropical north: Cape York and the wet tropics, Arnhem Land and the Top End, the Kimberley.
  { tribe: 'tupi', region: [55, 11, 63, 24], count: 4 },
  { tribe: 'tupi', region: [35, 11, 50, 20], count: 4 },
  { tribe: 'tupi', region: [24, 15, 34, 23], count: 3 },
  { tribe: 'tupi', region: [48, 1, 66, 7], count: 2 },
  // The west and the dry interior: the Pilbara and west coast, the south-west, the deserts, the Nullarbor.
  { tribe: 'apache', region: [11, 26, 22, 36], count: 3 },
  { tribe: 'apache', region: [10, 40, 24, 53], count: 4 },
  { tribe: 'apache', region: [25, 24, 52, 46], count: 4 },
  { tribe: 'apache', region: [30, 46, 46, 52], count: 1 },
  // The east and south-east: the Queensland coast, New South Wales, Victoria and South Australia, Tasmania.
  { tribe: 'sioux', region: [58, 25, 75, 40], count: 4 },
  { tribe: 'sioux', region: [58, 41, 74, 56], count: 5 },
  { tribe: 'sioux', region: [44, 49, 65, 61], count: 4 },
  { tribe: 'sioux', region: [59, 64, 67, 70], count: 2 },
];
