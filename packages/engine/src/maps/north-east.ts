import type { StoredMap, TribeRegion } from './index.js';

/**
 * The North-east of North America (Beta 3 step 8; docs/design/native-nations.md T19, section 13):
 * Newfoundland and Labrador, the Gulf and the valley of the St. Lawrence, the Maritimes, New England,
 * the Hudson valley, the Great Lakes from Lake Huron to Lake Ontario, and the east coasts of James
 * Bay and Hudson Bay. The North-east scenario's map (scenarios/north-east.ts); Beta 4 converts it to
 * hexes for Vinland (docs/design/hex-maps.md H11). The legend is in index.ts.
 *
 * Drawn from real coordinates, not by eye. Projection: equirectangular, 0.25° of latitude per row
 * and 0.25° / cos 49.25° (about 0.383°) of longitude per column, so a tile is about 28 km across at
 * the map's middle latitude (33 km in the south, 22 km in the north). Bounds: 82° W to about 49.8° W
 * (84 columns), 58.5° N to 40° N (74 rows); the tile at column x, row y covers longitude
 * -82 + 0.383x to -82 + 0.383(x + 1) and latitude 58.5 - 0.25y down to 58.5 - 0.25(y + 1)
 * (`northEastTile` below). Land is the Natural Earth 1:10m land and minor islands, less its natural
 * lakes (the modern reservoirs, such as Smallwood and Manicouagan, are left out), sampled 25 times
 * per tile (land where at least 40% of a tile is land), with every island of 150 km² or more kept as
 * at least one tile. Then corrections by hand where the sampling broke a shape: the St. Lawrence
 * estuary kept open as water up to the Île d'Orléans below Stadacona (Quebec), as Cartier sailed it;
 * the Strait of Belle Isle, the narrows of Lake Melville at Rigolet and Long Island Sound kept open;
 * Lake Champlain, Lake Simcoe, Lake Nipissing and Lake Mistassini, narrower than a tile, kept as
 * water; Cape Cod, St. John's and Upper New York Bay where the sampling lost them.
 *
 * No strait or isthmus meets only at a corner (hex-maps.md H11): wherever two land tiles touched
 * only diagonally across water, the tile whose land share was nearest the threshold was changed,
 * so every strait is open along an edge and every land bridge is joined along an edge; the map
 * test checks it. Rivers are waypoints (`parseRivers`), drawn from the atlas courses.
 *
 * Terrain follows the real geography at this scale: mixed forest (plains) from the St. Lawrence
 * valley and Huronia south, with broadleaf forest (prairie) south of 42° N, and open land in the
 * valleys and around the Iroquoian towns, where maize, beans and squash grew; conifer forest
 * (grassland) on the Canadian Shield south of 48.6° N, in the Maritimes, the Gaspé and northern
 * New England; boreal forest (tundra) beyond, in Newfoundland and in Labrador, opening into tundra
 * north of the tree line on the Labrador coast and towards Hudson Bay. Mountains: the Torngats,
 * the Chic-Chocs, the White Mountains, the Adirondacks, the Catskills, Katahdin, Gros Morne and the
 * Long Range, the Green Mountains' heights, Mont Tremblant and the Mealy Mountains; hills around
 * them, on the Laurentian and Labrador plateaus, the Allegheny plateau and the ridges of
 * Pennsylvania. Marsh: the Tantramar, the Montezuma marshes, Lac Saint-Pierre, Missisquoi Bay, the
 * shores of Rupert Bay, the Hackensack meadows and Rhode Island's Great Swamp.
 *
 * Compromises at this scale: Cape Breton is joined to the Nova Scotia peninsula (the Strait of Canso
 * is about a kilometre wide), Long Island to the mainland at its western end and Martha's Vineyard to
 * Cape Cod; above Quebec the St. Lawrence is a major river, not water (ships stop at Stadacona, as
 * Cartier's did; Hochelaga was reached by boat); Lake Ontario and Lake Erie are lakes, joined to the
 * sea only by rivers; Hudson Bay and James Bay are seas of their own, reached through Hudson
 * Strait, off the map; the Susquehanna and the Delaware, which leave the map to the south, are left
 * out. Ocean three or more tiles from land on the Atlantic side is the high seas, not in the Gulf of
 * St. Lawrence or the bays.
 *
 * The regions (`regions`) are the land health's (T10): fifty, each the land nearest a named centre
 * on the same land mass, its waters with it. Their renewal rates are the scenario's
 * (`NORTH_EAST_RENEWAL`).
 *
 * Ships arrive from the east, on the Atlantic high seas.
 */
export const northEast: StoredMap = {
  id: 'north-east',
  name: 'The North-east',
  description:
    'The North-east of North America drawn from real coordinates: Newfoundland and Labrador, the Gulf and the valley of the St. Lawrence, the Maritimes, New England, the Hudson, the Great Lakes from Lake Huron to Lake Ontario, and James Bay. Expeditions arrive from the east.',
  entryRows: [16, 64],
  // Main rivers first, tributaries after the river they join. Format: parseRivers in rivers.ts.
  rivers: `
    St. Lawrence: 14,57 M 15,57 15,56 16,56 16,55 17,55 17,54 18,54 18,53 20,53 20,52 22,52 22,50 23,50 23,49 24,49 24,48 25,48 25,47 27,47 27,46 28,46 28,45 29,45
    Ottawa: 6,44 6,45 7,45 7,47 8,47 8,48 M 9,48 9,49 11,49 11,50 13,50 13,51 15,51 15,52 17,52 17,51 20,51 20,52
    Saguenay: 27,40 M 30,40 30,41 32,41
    Saint-Maurice: 21,42 22,42 22,43 23,43 23,44 24,44 24,48
    Richelieu: 22,54 22,53 23,53 23,50
    Hudson: 20,57 20,58 21,58 21,63 M 21,69 20,69 20,71 21,71
    Mohawk: 17,61 18,61 18,62 21,62
    Connecticut: 27,53 27,54 26,54 26,56 25,56 25,60 24,60 24,65 M 24,68 25,68 25,69
    Merrimack: 27,59 27,63 28,63 28,62 29,62
    Kennebec: 32,51 32,52 31,52 31,55 32,55 32,57 31,57 31,59
    Penobscot: 33,50 34,50 34,58
    Saint John: 33,47 33,46 34,46 34,45 35,45 35,44 36,44 36,45 37,45 M 37,49 39,49 39,50 40,50 40,51 41,51 41,53
    Miramichi: 40,47 41,47 41,46 43,46 43,45 44,45
    Restigouche: 38,43 39,43 39,42 42,42
    Exploits: 66,39 66,38 69,38 69,37 70,37 70,36
    Humber: 64,36 64,37 61,37
    Churchill: 45,20 M 52,20 52,21 55,21 55,20 57,20 57,19
    Natashquan: 52,27 52,33
    Moisie: 40,26 40,28 41,28 41,33
    Manicouagan: 34,28 34,32 35,32 35,37 36,37
    Péribonka: 28,31 28,37 27,37 27,38 26,38 26,39 25,39
    Niagara: 7,62 7,60
    Grand: 4,58 4,61 5,61 5,63
    French: 5,49 3,49 3,50 2,50
    Trent: 9,55 9,56 10,56 10,57 11,57 11,58
    Genesee: 10,65 10,62 11,62 11,60
    Oswego: 15,61 14,61 14,59
    Eastmain: 21,25 8,25
    Rupert: 22,29 20,29 20,28 5,28
    La Grande: 21,19 13,19 13,18 7,18
    Gatineau: 15,45 15,46 16,46 16,52
  `,
  rows: `
..........tthttttTttttttttthttthTttTTt.tthhtTt^^^^h...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
............tttTtttTtttttttttThtTttttTttttttTtt^^^h....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.............ThtttTtthttttTttttTttTttTthttttThthhthh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.............tttttTtTtttthtTtTtttttttttTTThtthtTtthht...~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..............tTThtThtttTttttThtTTTTtTtttTtTThThhtThh...~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..............thththtTtttttTttTtttttTTTttTttThhhhtthhT..~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..............tttTTtttTTTTttttTtTTThttthttttTTThhhThhh..~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..............TtTtThtTtttttTtttTTtttTTtttTTTtTtttthhTh...~~~~~~~~~~~~~~~~~~~~~~~~~~~
.......TT.....hTtThTttTttTttTTTTTTtttTTTTTTTtTTTtThhhh...~~~~~~~~~~~~~~~~~~~~~~~~~~~
......Tt......TTTTT..TtTTTTtTTTTTTTTTtTTtTTTTTTThTTTtTT....~~~~~~~~~~~~~~~~~~~~~~~~~
.............ttTTTTtTTTTTTTtTTTTTTTTTTTTTTtTtTTTThTTTTT....~~~~~~~~~~~~~~~~~~~~~~~~~
............tTTTThTTTTTTTThTtTtTTTTTThTTTTTTTTTTTTTTTThhT.....~~~~~~~~~~~~~~~~~~~~~~
...........ThtthTTTTtTTtTTtTTThThTTthTTTTTTTTTTTTTttTTTTT........~~~~~~~~~~~~~~~~~~~
..........TtTTtTThThhTT..TTTTTTTTTTTTTTTTTTTThTTTTTTTttTTThT......~~~~~~~~~~~~~~~~~~
......TTTTTTThtTTTTTtTTTTTtTthTTTTTtTTTTTTTTThTTThTtTTTTTTTTh.T...~~~~~~~~~~~~~~~~~~
......TTttTtTTTTTTTTTTTTTTThTTTTTTtTTThTTTTTtTTTtTtTThTTtTTTTTTT..~~~~~~~~~~~~~~~~~~
.......TTThTTTtTTTTTThTTT.TTTTttTTTTTTTTTTTTttTTTTtTTTthtTTTTT.....~~~~~~~~~~~~~~~~~
.......thhTTThTTTThTTTTTTtTTTTTTTTTTTTTTTTTtTTTTtTTTTTTTTTTT...h.....~~~~~~~~~~~~~~~
........tTTTTTTTTttThTTThhTThhTTTttTTTTTTTTTTTThtTTTTTTTTT...TTTT.....~~~~~~~~~~~~~~
........TTThTTTTTTTTTTTTTTThTTTTTthTThTttTThThTTThtTThttT..TtTTTTTT....~~~~~~~~~~~~~
........ThtTTTTThTTtTTTTTtTTTTTTTThTTTTTTTTThTTTTTTTTTTTTthhhhTTTTTT...~~~~~~~~~~~~~
TTT.....ttTTTTTTTTTTTTTTTTTTTTTTTThhTTTTTTtTTTTTTTTTTTTTTThThhtTTthTT..~~~~~~~~~~~~~
.TT.....ThhhTTttThTTtThTTTTtTTTtTTTTTTTTTTtTTTTTTthTTTtTTTTTTTtTTTTT...~~~~~~~~~~~~~
........TTTTThTTTTtTTThTTtThThhTtTtTTtTThTTTTTTTTTTTTTThTtTTTTTTTTtT...~~~~~~~~~~~~~
T........TTTTTTTTThTTttTThhThhhhhTTTTTTTThTTTTTTTTTTTTTTTTThTTTTTTTTT..~~~~~~~~~~~~~
TT....T..ThThhTTtTtTTTTTtTThthhhTTTTTTTTThTTTTTTTThTTTTTTTTTTTTTTTTTT..~~~~~~~~~~~~~
TtT.....TTThTThhtTTTTTTTTTTTTTTTTTTTTtTTTTTTTTtTThTThTtthTTTTTTTtTTh...~~~~~~~~~~~~~
TtTT....MTTTTTTtTTTTthTTTTTtTTTTTThtTTTtTtTTTTTTThTttTTTThTTTTTTTT.....~~~~~~~~~~~~~
TtTT..TmmTThhTTTTTTTTTTTTTThTThTTTTthTTTTTTTTTTTTTTTTTTtTTtTThh....hT..~~~~~~~~~~~~~
tThTTtTmhtTTTTTTTTtTTT...TTTTTTTTTTtTTTttTTTTTTTTtThTTTTTTTTT.....TTT..~~~~~~~~~~~~~
ThtTTTTTtTTTTTTTTThTh...hTTTtTTThThTTTTTTTtThtTtTTTTTTTTTTTT.....Thh...~~~~~~~~~~~~~
TTTTTtTTTTTTTThtTtTTT..TTTThTTTTTTTtTTTTThTTTTTTTTTTThTThTT.....ThT....~~~~~~~~~~~~~
ThTtTtTtTTTTTTTTTTTtT.TTTTTTThTTTTTTTTTTThtTTTtTTTTTthThTh......Tht....~~~~~~~~~~~~~
htTTTtTTTTThTtTTTTTT..ThhhTTtTTtTTTTtTTT.......................TTh.........~~~~~~~~~
TTTTTTtTTTTTThTTTTTTTTThtTTTtTTTTTTTThT.......TT...............thh.th.......~~~~~~~~
hTttTtTTTTTTTTtTTTTTtTTTTtTTtTTTtTTTTTT........TTTT............^htTt...tT...~~~~~~~~
ThTTThtTTTTTTtTTTTTThTTTTTTTTTTTTTTTTT..........ThTT..........h^hTThTT.TTt..~~~~~~~~
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTThTTTT....hhhhh......hT.........hhTTTTTThThT..~~~~~~~~
TTTTTTThttTTTTTTTTTTTTTTTTTTTTTTTTT...hh^^^hhh...............hThTTTttTTTTT...~~~~~~~
TTTTtTTTTTTTTTThTTTtTTTTT.TTTTTtTT..TThhhhhThh...............thTTTTtTtTTtT...~~~~~~~
tTTTThTTTTThTtGGGgGhGGhhGGGGhGhgG..GGGGGGhhhhh...............hhTTTTTTTTtTTT..~~~~~~~
ttttTTThTTTTTTGGGGGhGGGGGGgGGGGG..GGGGGhGhGGG...............htThTtTThtTTTT.....~~~~~
tTtTTTtTThTTTTGGGGGhGGGGhhGhgGh..GhGGhGGGG..GG.............ThTTtTTtTTTttTtT....~~~~~
ThTTthTTThTTTTGGGGhGGGGGGGhhGhh.GGGGGGGGhGGGG..............hTT.hTTT.tTTT.tt.T..~~~~~
GGgGhgGhGgGGGGGGGGGhGGGggGhGhh..GGgGGGGhhhhgG.......G................TTT.tTTt..~~~~~
GgGGGGGGgGGGGGggGGGGGGhGhGhhh..GGhGGGGGGhhGg........................tT...TTT...~~~~~
GgGGGGGGGGGGgGhGGGGGGhGhhhgpPPgGGGGGGGGGGGGGG.h........GG.....~~~..tT.....Th...~~~~~
GGGGGGGGGGGGGGGGGGhhhhGgGPPPPPGgGGGGGGGGGGGGG.GGG......hG.....~~~.............~~~~~~
GGGGGGGGGGGGGGGGhhhhhhgPPpPpPPGGGGGGGGGGGGGGG...GGGG..GG......~~~......~......~~~~~~
GGGGG..GGGGGGGGGGhhGGpppPPPPPPGGGhhGGGGGGGGGGGG..GG...GGGG..~~~~~~~~~~~~~~~~~~~~~~~~
G..GGGGGhhhGGGGGGGGGPPPPPPPPpPGGGh^hGGGGGGgGGGMG.....GGGGG..~~~~~~~~~~~~~~~~~~~~~~~~
G...GGGGhhGGGGGGGPPPPPppPPPpPPGGGhhGGGGGGgGGGGGGGGGGGGGG....~~~~~~~~~~~~~~~~~~~~~~~~
....GGGGGhhGGPPPPPPPPpPPPPPPhhPGGGGGGGGGGGG..GGGGGGGGGg.....~~~~~~~~~~~~~~~~~~~~~~~~
.G...GGGgPPPPPPPPPPPPPPphPPPhPhGGGggGGGGG....GGGGGGGGG....~~~~~~~~~~~~~~~~~~~~~~~~~~
.....PPPPPPpPPPPPPPPPP.PPppppPhhGGGGGGG....GGGGGGGG......~~~~~~~~~~~~~~~~~~~~~~~~~~~
..PP.PpPPpPPpPPPPpPhhh.phPPhPPPPgGGGGgGG..gGGGGGG.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.pPPPP.PPPpPPPPPPPhhhp.phPh^phPPPgGg.....GGGGG.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.PPPPPpPPPPPPP.PPPhh^^.phPP^PhPPPgG......GGgGG.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.pPpPPPPP......PPPhPPhhhhPPhhPPP.........GGGG...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.PPPPPP........PPPPhhPPhhPPPPPP...........GG....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.PPpPp...PP...PPPPPPPpPhPPpPPP.................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PPPpPPpPPPPPpPppPPPPPPPPPPPPPP................~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PPPpPPPPPPpppPPPpPppPPPhPPPPP...........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
PPPP...PPPpppPppPPPPPPhPPppPP...........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
P.....PPhhhhhPPPPpPPhpphPpppP.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.....PhhhhhPhhPPhhP^^hhPPPpPPP....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
...RRRRRRRRRRRrhRhRhhRRRRRRrrR.R..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.RRRRRRRRRRRRRRRRRRRRRrRRRrRRrRR..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RrRRRRRRRRRRRrRRRhRRhhRrRRR..R.R..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RrRRRRRRRRRrRRRRrhRrrR............~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RrRRRRRRRRRRrhhhhhRrRRrRR.........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RRRRRRrRRRhhhhRrrrRRR.........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RRRRrRRRRhhRRhRRRRRRR.........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
RRRRRRRRRRhRRRRRRRRRR.........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
`,
  regions: {
    rows: `
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaadffffffffffffffffffffffffffffffffffffffffffffffffffff
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaadddfffffffffffffffffffffffffffffffffffffffffffffffffff
aaaaaaaaaaaaaaaaaaaaaaaaaaaaadddddffffffffffffffffffffffffffffffffffffffffffffffffff
aaaaaaaaaaaaaaaaaaaaaaaaaaaadddddddfffffffffffffffffffffffffffffffffffffffffffffffff
aaaaaaaaaaaaaaaaaaaaaaaaaaaddddddddfffffffffffffffffffffffffffffffffffffffffffffffff
aaaaaaaaaaaaaaaaaaaaaaaaaaddddddddddffffffffffffffffffffffffffffffffffffffffffffffff
aaaaaaaaaaaaaaaaaaaaaaaaaadddddddddddfffffffffffffffffffffffffgggggggggggggggggggggg
aaaaaaaaaaaaaaaaaaaaaaaaadddddddddddddffffffffffffffffffffffffgggggggggggggggggggggg
aaaaaaaaaaaaaaaaaaaaaaaaddddddddddddddfffffffffffffffggggggggggggggggggggggggggggggg
aaaaaaaaaaaaaaaaaaaaaaaddddddddddddddddeffffffffffgggggggggggggggggggggggggggggggggg
aaaaaaaaaaaaaaaaaaaaaadddddddddddddddddeeeeffffggggggggggggggggggggggggggggggggggggg
aaaaaaaaaaaaaaaaaaaaaaddddddddddddddddeeeeeeeggggggggggggggggggggggggggggggggggggggg
bbbbbbbbaaaaaaaaaaaaadddddddddddddddddeeeeeeeegggggggggggggggggggggggggggggggggggggg
bbbbbbbbaaaaaaaaaaaadddddddddddddddddeeeeeeeeeeggggggggggggggggggggggggggggggggggggg
bbbbbbbbaaaaaaaaaaaddddddddddddddddddeeeeeeeeeeegggggggggggggggggggggggggggggggggggg
bbbbbbbbbbbbaaaaaaaddddddddddddddddddeeeeeeeeeeeegggggggggggghhhhhhhhhhhhhhhhhhhhhhh
bbbbbbbbbbbbbbbbaaddddddddddddddddddeeeeeeeeeeeeeggggggghhhhhhhhhhiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbddddddddddddddddddeeeeeeeeeeeeeeghhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbddddddddddddddddddeeeeeeeeeeeeeehhhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbbddddddddddddddddeeeeeeeeeeeeeeehhhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbbbdddddddddddddddeeeeeeeeeeeeeeehhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbbccddddddddddddddeeeeeeeeeeeeeeehhhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbcccccdddddddddddeeeeeeeeeeeeeeeehhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbbccccccccddddddddeeeeeeeeeeeeeeeehhhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbbcccccccccccddddddeeeeeeeeeeeeeeeehhhhhhhhhiiiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbbccccccccccccccddkkkkeeeeeeeeeeeeejjjjhhhhhhiiiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbcccccccccccccccckkkkkkkkeeeeeeeejjjjjjjjjjhhiiiiiiiiiiiiiiiiiiiiiiiii
bbbbbbbbbbbbbbbccccccccccccccckkkkkkkkkkkkeeeejjjjjjjjjjjjjiiiiiiiiiAAAAAAAAAAAAAAAA
bbbbbbbbbbbbbbcccccccccccccccckkkkkkkkkkkkkkkjjjjjjjjjjjjjjjiiiiiiAAAAAAAAAAAAAAAAAA
bbbbbbbbbbbbbccccccccccccccccckkkkkkkkkkkkkkkjjjjjjjjjjjjjjjjiiiiAAAAAAAAAAAAAAAAAAA
bbbbbbbbbbbbbcccccccccccccccclkkkkkkkkkkkkkkkjjjjjjjjjjjjjjjjiiAAAAAAAAAAAAAAAAAAAAA
mmmmbbbbbbbbccccccccccccccccllkkkkkkkkkkkkkkkjjjjjjjjjjjjjjjjiAAAAAAAAABBBBBBBBBBBBB
mmmmmmmmmmmmccccccccccccccllllkkkkkkkkkkkkkkksjjjjjjjjjjjjjjjAAAAAAAAAABBBBBBBBBBBBB
mmmmmmmmmmmmcccccccccccccllllllkkkkkkkkkkkkkksjjjjjjjjjjjjjjAAAAAAABBBBBBBBBBBBBBBBB
mmmmmmmmmmmmmccccccccccclllllllkkkkkkkkkkkkkkttttttjjjjjjjjjzzzzzAABBBBBBBBBBBBBBBBB
mmmmmmmmmmmmmmccccccccllllllllllkkkkkkkkkssssttttttttjjjjjjzzzzzzBBBBBBBBBBBBBBBBBBB
mmmmmmmmmmmmmmmcccccclllllllllllkkkkkkkksssssstttttttttjjjzzzzzzzzBBBBBBBBBBBBBBBBBB
mmmmmmmmmmmmmmmmccccllllllllllllkkkkkkkssssssssttttttttttjzzzzzzzzBBBBBBBBBBBBBBBBBB
mmmmmmmmmmmmmmmmpppplllllllllllllkkkkkkssssssssstttttttttzzzzzzzzzBBBBBBBBBBBBBBBBBB
mmmmmmmmmmmmmmmppppppplllllllllllkkkkkssssssssssttttttttzzzzzzzzzzBBBBBBBCCCCCCCCCCC
mmmmmmmmmmmmmmnnppppppplllllllqqqkkkksssssssssssstttttttzzzzzzzzzzBBBBBBCCCCCCCCCCCC
mmmmmmmmmmmmnnnnppppppppllllqqqqqqquusssssssssssstttyyyzzzzzzzzzzzzBBBCCCCCCCCCCCCCC
mmmmmmmmmmmnnnnnpppppppppqqqqqqqqquuuuusssssssssssyyyyyzzzzzzzzzzzzBBCCCCCCCCCCCCCCC
mmmmmmmmmmnnnnnnpppppppppqqqqqqqqquuuuuvvvvvvssssyyyyyyxzzzzzzzzzzzBCCCCCCCCCCCCCCCC
MMMmmmmmnnnnnnnnpppppppppqqqqqqqqquuuuuuvvvvvvvvyyyyyyyxxzzzzzzzzzzBCCCCCCCCCCCCCCCC
MMMMMMmnnnnnnnnnnppppppppqqqqqqqqquuuuuuvvvvvvyyyyyyyyxxxxzzzzzzzzzCCCCCCCCCCCCCCCCC
MMMMMMMnnnnnnnnnoppppppppqqqqqqqquuuuuuuuvvvvvyyyyyyyxxxxxxzzzzzzCCCCCCCCCCCCCCCCCCC
MMMMMMMnnnnnnnnooopppppppqqqqqqqquuuuuuuuvvvvvyyyyyyyxxxxxxxzzzzzCCCCCCCCCCCCCCCCCCC
MMMMMMMMnnnnnnoooooorrrrrrqqqqqqquuuuuuuuvvvvvyyyyyyyxxxxxxxxzzzzCCCCCCCCCCCCCCCCCCC
MMMMMMMMMnnnnnoooooorrrrrrrqqqqqDDuuuuuuuuvvvwwwyyyyyxxxxxxxxxxzzCCCCCCCCCCCCCCCCCCC
MMMMMMMMMnnnnooooooorrrrrrrrEEEEDDDDuuuuuuvvwwwwwyyxxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
MMMMMMMMMXXnoooooooorrrrrrrEEEEEDDDDDuuuuuwwwwwwwwwxxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
MMMMMMMLLXXXoooooooorrrrrrrEEEEEDDDDDDDuuwwwwwwwwwwxxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
MMMMMLLLLXXXXooooooorrrrrFFEEEEEDDDDDDDDuwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
MMLLLLLLLXXXXXooooGGGFrFFFFEEEEEDDDDDDDDuwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
LLLLLLLLLXXXXXXoGGGGGFFFFFFEEEEEEDDDDDDDDwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
LLLLLLLLXXXXXXXGGGGGGFFFFFFEEEEEEDDDDDDDwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKLLLLLXXXXXXXGGGGGGGGFFFQQEEEEEDDDDDDDwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKKLLXXXXXXGGGGGGGGFFFFQQQQEEEDDDDDDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKKKLXJJXXXIIGGGGGGFFFQQQQQQEEDDDDDDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKKKJJJJJIIIIIHHHHHHFQQQQQQQEEDDDDDDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKKKJJJJJIIIIIHHHHHNNQQQQQQQQQDDDDDDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKKKJJJJJIIIIIHHHHNNNPQQQRQQQQDDDDDDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKKKJJJJJIIIIIHHHHNNPPPRRRRRRRRDDDDDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKKKWWJJJJJIIIIIHHHNNNPPPRRRRRTTTTTTTDwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KKKWWWWWJJJJIIIIIHHNNNNPPPPRRRRTTTTTTTTwwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
KWWWWWWWJJJJIIIIIIONNNNPPPSSSTTTTTTTTTTTwwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWWJJVVVVVVOOOOOOPPSSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWWJVVVVVVVOOOOOOUUUSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWWVVVVVVVVOOOOOOUUUSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWWVVVVVVVVVOOOOUUUUSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWWVVVVVVVVVOOOOUUUUSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWVVVVVVVVVVOOOOUUUUSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
WWWWWWWWVVVVVVVVVVOOOOOUUUSSSTTTTTTTTTTTTwwwwwwwwwwwxxxxxxxxxxxxzCCCCCCCCCCCCCCCCCCC
`,
    list: [
      { char: 'a', id: 'hudson-coast', name: 'The east coast of Hudson Bay' },
      { char: 'b', id: 'james-bay', name: 'The east coast of James Bay' },
      { char: 'c', id: 'mistassini', name: 'Lake Mistassini and the Rupert' },
      { char: 'd', id: 'caniapiscau', name: 'The Caniapiscau uplands' },
      { char: 'e', id: 'labrador-plateau', name: 'The Labrador plateau' },
      { char: 'f', id: 'labrador-north', name: 'The northern Labrador coast' },
      { char: 'g', id: 'labrador-central', name: 'The central Labrador coast' },
      { char: 'h', id: 'lake-melville', name: 'Lake Melville and the Churchill' },
      { char: 'i', id: 'labrador-south', name: 'The southern Labrador coast' },
      { char: 'j', id: 'mingan', name: 'The Mingan coast' },
      { char: 'k', id: 'manicouagan', name: 'The Manicouagan coast' },
      { char: 'l', id: 'saguenay', name: 'The Saguenay and Lac Saint-Jean' },
      { char: 'm', id: 'abitibi', name: 'Abitibi and Lake Timiskaming' },
      { char: 'n', id: 'upper-ottawa', name: 'The upper Ottawa' },
      { char: 'o', id: 'ottawa', name: 'The lower Ottawa' },
      { char: 'p', id: 'saint-maurice', name: 'The Saint-Maurice and the Laurentians' },
      { char: 'q', id: 'stadacona', name: 'Quebec and the estuary' },
      { char: 'r', id: 'hochelaga', name: 'The Montreal plain' },
      { char: 's', id: 'gaspe', name: 'Gaspé' },
      { char: 't', id: 'anticosti', name: 'Anticosti' },
      { char: 'u', id: 'wolastoq', name: 'The Saint John valley' },
      { char: 'v', id: 'miramichi', name: 'The Miramichi and Chaleur Bay' },
      { char: 'w', id: 'nova-scotia', name: 'The Nova Scotia peninsula' },
      { char: 'x', id: 'cape-breton', name: "Cape Breton Island (Unama'ki)" },
      { char: 'y', id: 'pei', name: 'Prince Edward Island (Epekwitk)' },
      { char: 'z', id: 'newfoundland-west', name: 'Western Newfoundland' },
      { char: 'A', id: 'newfoundland-north', name: 'The Great Northern Peninsula' },
      { char: 'B', id: 'exploits', name: 'The Exploits and Notre Dame Bay' },
      { char: 'C', id: 'avalon', name: 'The Avalon and the south coast' },
      { char: 'D', id: 'penobscot', name: 'The Penobscot and the Maine coast' },
      { char: 'E', id: 'kennebec', name: 'The Kennebec and the White Mountains' },
      { char: 'F', id: 'champlain', name: 'Lake Champlain and the Green Mountains' },
      { char: 'G', id: 'adirondacks', name: 'The Adirondacks' },
      { char: 'H', id: 'mohawk', name: 'The Mohawk valley' },
      { char: 'I', id: 'finger-lakes', name: 'The Finger Lakes' },
      { char: 'J', id: 'genesee', name: 'The Genesee' },
      { char: 'K', id: 'niagara', name: 'Niagara and the Grand River' },
      { char: 'L', id: 'huronia', name: 'Huronia and Lake Simcoe' },
      { char: 'M', id: 'georgian-bay', name: 'Georgian Bay and Lake Nipissing' },
      { char: 'N', id: 'upper-hudson', name: 'The upper Hudson' },
      { char: 'O', id: 'lower-hudson', name: 'The lower Hudson' },
      { char: 'P', id: 'connecticut', name: 'The Connecticut valley' },
      { char: 'Q', id: 'merrimack', name: 'The Merrimack' },
      { char: 'R', id: 'massachusetts-bay', name: 'Massachusetts Bay' },
      { char: 'S', id: 'narragansett', name: 'Narragansett Bay' },
      { char: 'T', id: 'cape-cod', name: 'Cape Cod and the islands' },
      { char: 'U', id: 'long-island', name: 'Long Island' },
      { char: 'V', id: 'susquehanna', name: 'The upper Susquehanna' },
      { char: 'W', id: 'lake-erie', name: 'The shore of Lake Erie' },
      { char: 'X', id: 'ontario-north', name: 'The north shore of Lake Ontario' },
    ],
  },
};

/** The projection above: the tile at a longitude and latitude (degrees, west and south negative). */
export function northEastTile(lon: number, lat: number): { x: number; y: number } {
  const degreesPerRow = 0.25;
  const degreesPerColumn = degreesPerRow / Math.cos((49.25 * Math.PI) / 180);
  return { x: Math.floor((lon + 82) / degreesPerColumn), y: Math.floor((58.5 - lat) / degreesPerRow) };
}

/**
 * Where the North-east scenario's peoples live on this map (native-nations.md T20; section 13 has
 * the sources). Regions are [x0, y0, x1, y1] in tiles (inclusive), drawn from the homelands the
 * sources give for the 16th and early 17th centuries, the earliest that written sources describe;
 * the scenario spaces settlements 2 tiles apart. `from` and `until` are the years a people comes to
 * a region or is no longer found there (peoplemoves.ts). Drafted for Simon's review.
 */
export const NORTH_EAST_PEOPLES: TribeRegion[] = [
  // The Dorset on the northern Labrador coast and the east coast of Hudson Bay, until the 14th century.
  { tribe: 'dorset', region: [45, 0, 54, 10], count: 2, until: 1350 },
  { tribe: 'dorset', region: [9, 0, 15, 12], count: 1, until: 1350 },
  // The Inuit, whose Thule ancestors reached the northern Labrador coast and Nunavik's shores in the 15th century.
  { tribe: 'inuit', region: [45, 0, 54, 10], count: 3, from: 1400 },
  { tribe: 'inuit', region: [9, 0, 15, 12], count: 1, from: 1400 },
  // The Eeyou along the rivers east of James Bay.
  { tribe: 'eeyou', region: [6, 14, 22, 30], count: 3 },
  // The Innu of Nitassinan: the Saguenay and Tadoussac, the north shore of the Gulf, the Labrador interior.
  { tribe: 'innu', region: [26, 36, 32, 42], count: 1 },
  { tribe: 'innu', region: [32, 27, 62, 36], count: 3 },
  { tribe: 'innu', region: [36, 15, 60, 27], count: 2 },
  // The Beothuk of Newfoundland, from the Exploits valley to the coasts.
  { tribe: 'beothuk', region: [63, 34, 74, 43], count: 3 },
  // The Algonquin along the Ottawa and its tributaries.
  { tribe: 'algonquin', region: [7, 43, 17, 52], count: 3 },
  // The Mi'kmaq of Mi'kma'ki: Nova Scotia, Cape Breton, Prince Edward Island, eastern New Brunswick and the Gaspé.
  { tribe: 'mikmaq', region: [41, 51, 54, 59], count: 2 },
  { tribe: 'mikmaq', region: [53, 46, 57, 51], count: 1 },
  { tribe: 'mikmaq', region: [39, 37, 46, 49], count: 2 },
  // The Wolastoqiyik along the Saint John.
  { tribe: 'wolastoqiyik', region: [34, 44, 41, 52], count: 2 },
  // The Penobscot on their river and bay.
  { tribe: 'penobscot', region: [31, 49, 38, 57], count: 2 },
  // The Abenaki of the Connecticut and Lake Champlain valleys.
  { tribe: 'abenaki', region: [22, 53, 28, 62], count: 2 },
  // The Wendat towns between Georgian Bay and Lake Simcoe.
  { tribe: 'wendat', region: [3, 54, 8, 58], count: 3 },
  // The St. Lawrence Iroquoians at Stadacona, Hochelaga and up the river, until their towns are gone.
  { tribe: 'stLawrenceIroquoians', region: [26, 45, 29, 47], count: 1, until: 1580 },
  { tribe: 'stLawrenceIroquoians', region: [20, 50, 23, 52], count: 1, until: 1580 },
  { tribe: 'stLawrenceIroquoians', region: [14, 54, 19, 58], count: 1, until: 1580 },
  // The Attawandaron between the Grand River and the Niagara.
  { tribe: 'attawandaron', region: [3, 59, 7, 63], count: 2 },
  // The Haudenosaunee, a town for each of the Five Nations, east to west: the Mohawk, the Oneida, the Onondaga, the Cayuga and the Seneca.
  { tribe: 'haudenosaunee', region: [18, 61, 21, 63], count: 1 },
  { tribe: 'haudenosaunee', region: [16, 61, 17, 63], count: 1 },
  { tribe: 'haudenosaunee', region: [14, 61, 15, 63], count: 1 },
  { tribe: 'haudenosaunee', region: [13, 61, 14, 63], count: 1 },
  { tribe: 'haudenosaunee', region: [10, 61, 13, 64], count: 1 },
  // The Mohican of the upper Hudson.
  { tribe: 'mohican', region: [20, 62, 22, 66], count: 2 },
  // The Massachusett of Massachusetts Bay.
  { tribe: 'massachusett', region: [27, 63, 29, 66], count: 1 },
  // The Wampanoag of Cape Cod, the islands and the east of Narragansett Bay.
  { tribe: 'wampanoag', region: [28, 66, 31, 68], count: 2 },
  // The Narragansett west of their bay.
  { tribe: 'narragansett', region: [26, 66, 27, 68], count: 1 },
  // The Munsee of the lower Hudson and Manhattan.
  { tribe: 'munsee', region: [18, 67, 21, 72], count: 2 },
];

/**
 * Land health (native-nations.md T10): furs and game each region gives back in a year without
 * wearing, by region id. Worked out from each region's land: 0.6 a tile of the mixed and broadleaf
 * forests of the south, 0.5 of conifer forest and marsh, 0.4 of the boreal forest and hills, 0.25
 * of open tundra, 0.1 of mountains; so beaver country renews faster than the barrens. Drafted for
 * Simon's review.
 */
export const NORTH_EAST_RENEWAL: Record<string, number> = {
  'hudson-coast': 64,
  'james-bay': 70,
  'mistassini': 69,
  'caniapiscau': 116,
  'labrador-plateau': 82,
  'labrador-north': 56,
  'labrador-central': 32,
  'lake-melville': 37,
  'labrador-south': 31,
  'mingan': 38,
  'manicouagan': 54,
  'saguenay': 35,
  'abitibi': 65,
  'upper-ottawa': 33,
  'ottawa': 27,
  'saint-maurice': 35,
  'stadacona': 32,
  'hochelaga': 23,
  'gaspe': 18,
  'anticosti': 5,
  'wolastoq': 35,
  'miramichi': 15,
  'nova-scotia': 30,
  'cape-breton': 13,
  'pei': 5,
  'newfoundland-west': 18,
  'newfoundland-north': 7,
  'exploits': 17,
  'avalon': 13,
  'penobscot': 22,
  'kennebec': 23,
  'champlain': 15,
  'adirondacks': 17,
  'mohawk': 14,
  'finger-lakes': 20,
  'genesee': 18,
  'niagara': 22,
  'huronia': 17,
  'georgian-bay': 27,
  'upper-hudson': 8,
  'lower-hudson': 18,
  'connecticut': 9,
  'merrimack': 15,
  'massachusetts-bay': 6,
  'narragansett': 5,
  'cape-cod': 4,
  'long-island': 4,
  'susquehanna': 33,
  'lake-erie': 41,
  'ontario-north': 20,
};
