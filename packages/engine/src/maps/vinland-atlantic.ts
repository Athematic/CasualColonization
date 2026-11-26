import type { StoredMap, TribeRegion } from './index.js';

/**
 * The Vinland Atlantic (Beta 4 step 4; docs/design/hex-maps.md H21): an expanded pointy-top hex
 * map extending the North-east north and east to include southwestern Greenland (the Eastern and
 * Western Settlements), Helluland (southern Baffin Island), Markland (Labrador) and Vinland
 * (Newfoundland and the Gulf of St. Lawrence).
 *
 * Built by `tools/maps/vinland/build_vinland_atlantic.py` from the north-eastern 58×52 slice of
 * `north-east.ts` (preserving exact coordinates and rivers for Newfoundland, Labrador and the
 * Gulf), plus southern Baffin Island and southwestern Greenland on the same 0.25° × 0.383° grid.
 */
export const vinlandAtlantic: StoredMap = {
  id: 'vinland-atlantic',
  name: 'Vinland & Greenland (expanded)',
  description:
    'Expanded North Atlantic hex map from southwestern Greenland and Helluland (Baffin Island) across Markland (Labrador) to Newfoundland and the Gulf of St. Lawrence.',
  entryRows: [6, 58],
  rivers: `
    Saguenay: 1,62 M 4,62 4,63 6,63
    Miramichi: 14,69 15,69 15,68 17,68 17,67 18,67
    Restigouche: 12,65 13,65 13,64 16,64
    Exploits: 40,61 40,60 43,60 43,59 44,59 44,58
    Humber: 38,58 38,59 35,59
    Churchill: 19,42 M 26,42 26,43 29,43 29,42 31,42 31,41
    Natashquan: 26,49 26,55
    Moisie: 14,48 14,50 15,50 15,55
    Manicouagan: 8,50 8,54 9,54 9,59 10,59
    Eiríksfjörðr: 64,11 61,11 60,11
  `,
  rows: `
aa^hhtttttttthtttth^aa..~~~~~~~~~~~~~~~~~~~~~~~~~~~..tghh^^aaaaaaaaaaaaaaa^h..~~~~~~
a^^hhtttttttthhttth^a...~~~~~~~~~~~~~~~~~~~~~~~~~~~..tgth^^aaaaaaaaaaaaaa^hh..~~~~~~
a^hhtttttttthhtthh^a....~~~~~~~~~~~~~~~~~~~~~~~~~~~...tghh^^aaaaaaaaaaaaa^ht..~~~~~~
^hhtttttttthhtthh......~~~~~~~~~~~~~~~~~~~~~~~~~~~~...tth^^aaaaaaaaaaaaa^hh...~~~~~~
.hhttttttthhtthh.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...tgh^^aaaaaaaaaaaa^ht...~~~~~~
..httttttthhtthh........~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tth^^aaaaaaaaaaa^hh..~~~~~~~
...ttttttthhtth...hht...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tth^^aaaaaaaaaa^ht..~~~~~~~
....tttttthhth....hh^t..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tgh^^aaaaaaaaa^hh..~~~~~~~
~....ttttthh......htt...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tth^^aaaaaaaa^ht..~~~~~~~
~~.....ttthh........tt..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tgph^^aaaaaa^hh..~~~~~~~
~~~......tth..~~........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...tgphh^^aaaa^ht...~~~~~~~
~~~~~.........~~~~......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...tgpth^^aaa^hh...~~~~~~~
~~~~~~~.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tgpth^^aa^ht..~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tgpth^^^hh...~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tghh^^^h....~~~~~~~~
~~~~~~~~~~~~~~~~.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tgth^^h...~~~~~~~~~
~~~~~~~~~~~~~~..........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....tghh....~~~~~~~~~~
~~~~~~~~~~~~......thh.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....th.....~~~~~~~~~~
~~~~~~~~~~......tthh^h.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~........~~~~~~~~~~~~
~~~~~~~~......ttthhtth^h...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~......~~~~~~~~~~~~~
............ttthTttthh^^h..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..........tthTttTttthh^^h..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
thttthTttTTt.tthhtTt^^^^h...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tttThtTttttTttttttTtt^^^h....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TttttTttTttTthttttThthhthh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tTtTtttttttttTTThtthtTtthht...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tttThtTTTTtTtttTtTThThhtThh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tTttTtttttTTTttTttThhhhtthhT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ttttTtTTThttthttttTTThhhThhh..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tTtttTTtttTTtttTTTtTtttthhTh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ttTTTTTTtttTTTTTTTtTTTtThhhh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TtTTTTTTTTTtTTtTTTTTTThTTTtTT....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TtTTTTTTTTTTTTTTtTtTTTThTTTTT....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
hTtTtTTTTTThTTTTTTTTTTTTTTTThhT.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tTTThThTTthTTTTTTTTTTTTTttTTTTT........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTTTTTTTTTTTTThTTTTTTTttTTThT......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
tTthTTTTTtTTTTTTTTThTTThTtTTTTTTTTh.T...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ThTTTTTTtTTThTTTTTtTTTtTtTThTTtTTTTTTT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTttTTTTTTTTTTTTttTTTTtTTTthtTTTTT.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTTTTTTTTTTTtTTTTtTTTTTTTTTTT...h.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TThhTTTttTTTTTTTTTTTThtTTTTTTTTT...TTTT.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ThTTTTTthTThTttTThThTTThtTThttT..TtTTTTTT....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTThTTTTTTTTThTTTTTTTTTTTTthhhhTTTTTT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTThhTTTTTTtTTTTTTTTTTTTTTThThhtTTthTT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TtTTTtTTTTTTTTTTtTTTTTTthTTTtTTTTTTTtTTTTT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ThThhTtTtTTtTThTTTTTTTTTTTTTThTtTTTTTTTTtT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
hThhhhhTTTTTTTThTTTTTTTTTTTTTTTTThTTTTTTTTT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ThthhhTTTTTTTTThTTTTTTTThTTTTTTTTTTTTTTTTTT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTTTTTtTTTTTTTTtTThTThTtthTTTTTTTtTTh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TtTTTTTThtTTTtTtTTTTTTThTttTTTThTTTTTTTT.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ThTThTTTTthTTTTTTTTTTTTTTTTTTtTTtTThh....hT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTTTtTTTttTTTTTTTTtThTTTTTTTTT.....TTT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTtTTThThTTTTTTTtThtTtTTTTTTTTTTTT.....Thh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
ThTTTTTTTtTTTTThTTTTTTTTTTThTThTT.....ThT....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTThTTTTTTTTTTThtTTTtTTTTTthThTh......Tht....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTtTTtTTTTtTTT.......................TTh.........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTtTTTTTTTThT.......TT...............thh.th.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTtTTTtTTTTTT........TTTT............^htTt...tT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTTTTTT..........ThTT..........h^hTThTT.TTt..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTThTTTT....hhhhh......hT.........hhTTTTTThThT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTTTTT...hh^^^hhh...............hThTTTttTTTTT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TTTTTtTT..TThhhhhThh...............thTTTTtTtTTtT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
GGhGhgG..GGGGGGhhhhh...............hhTTTTTTTTtTTT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
gGGGGG..GGGGGhGhGGG...............htThTtTThtTTTT.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
GhgGh..GhGGhGGGG..GG.............ThTTtTTtTTTttTtT....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
hhGhh.GGGGGGGGhGGGG..............hTT.hTTT.tTTT.tt.T..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
hGhh..GGgGGGGhhhhgG.......G................TTT.tTTt..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
hhh..GGhGGGGGGhhGg........................tT...TTT...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
gpPPgGGGGGGGGGGGGGG.h........GG.......~..tT.....Th...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PPPPGgGGGGGGGGGGGGG.GGG......hG.......~.............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PpPPGGGGGGGGGGGGGGG...GGGG..GG........~......~......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PPPPGGGhhGGGGGGGGGGGG..GG...GGGG......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PPpPGGGh^hGGGGGGgGGGMG.....GGGGG......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PpPPGGGhhGGGGGGgGGGGGGGGGGGGGG........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  `,
};

export const VINLAND_ATLANTIC_PEOPLES: TribeRegion[] = [
  // The Dorset (Tuniit) of Helluland (southern Baffin Island) and northern Labrador.
  { tribe: 'dorset', region: [1, 1, 20, 10], count: 2 },
  { tribe: 'dorset', region: [10, 18, 22, 30], count: 2 },
  // The Innu of Markland (Labrador) and the North Shore of the St. Lawrence.
  { tribe: 'innu', region: [10, 32, 34, 49], count: 3 },
  { tribe: 'innu', region: [8, 50, 26, 56], count: 2 },
  // The Beothuk of Newfoundland (Vinland gateway), from the Exploits valley to the coasts.
  { tribe: 'beothuk', region: [37, 56, 48, 65], count: 3 },
  // The Mi'kmaq of the Gulf of St. Lawrence: Gaspé, eastern New Brunswick, PEI, Cape Breton.
  { tribe: 'mikmaq', region: [13, 59, 20, 71], count: 2 },
  { tribe: 'mikmaq', region: [27, 68, 31, 72], count: 1 },
  // The Wolastoqiyik along the Saint John.
  { tribe: 'wolastoqiyik', region: [8, 66, 15, 72], count: 2 },
  // The St. Lawrence Iroquoians near Stadacona (Quebec).
  { tribe: 'stLawrenceIroquoians', region: [0, 67, 4, 70], count: 1 },
];
