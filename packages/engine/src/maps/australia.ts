import type { StoredMap } from './index.js';

/**
 * Australia, with Tasmania, the Torres Strait and the southern coast of New Guinea. The legend is in index.ts.
 *
 * A geography-only preview: the game still uses the American rules. European ships came to
 * Australia by way of the Cape of Good Hope, so expeditions arrive on the western high seas.
 *
 * PLACEHOLDER PEOPLES: the engine only knows the eight American tribes, so camp-dwelling tribe ids
 * stand in for the peoples of this land to keep the map playable. The future scenario framework
 * replaces them with Aboriginal nations and Torres Strait Islanders (see docs/design/australia.md).
 * Settlements are sparse in the deserts and denser along the coasts.
 */
export const australia: StoredMap = {
  id: 'australia',
  name: 'Australia',
  description:
    'A geography-only preview: from the Torres Strait to Tasmania, with the tropical north, the Great Dividing Range, the fertile south-east and the vast dry interior. Expeditions arrive from the west, by way of the Cape of Good Hope. The peoples are placeholders until a scenario adds Aboriginal nations and Torres Strait Islanders.',
  entrySide: 'west',
  entryRows: [18, 60],
  tribes: [
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
  ],
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
~~~~~~~~....gdDdDDDDDDDddDddddDDDddDDDDdddddddddmmDdsdddddsDsDdDpppgrrhPPgg...~~~
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
