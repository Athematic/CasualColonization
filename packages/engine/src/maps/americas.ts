import type { StoredMap } from './index.js';

/** The Americas. The legend is in index.ts. */
export const americas: StoredMap = {
  id: 'americas',
  name: 'The Americas',
  description: 'Both continents, joined by Central America around the Caribbean, with all eight tribes.',
  entryRows: [12, 85],
  tribes: [
    { tribe: 'iroquois', region: [32, 18, 42, 23], count: 4 },
    { tribe: 'cherokee', region: [25, 24, 36, 32], count: 3 },
    { tribe: 'sioux', region: [16, 12, 26, 25], count: 6 },
    { tribe: 'apache', region: [9, 25, 21, 34], count: 4 },
    { tribe: 'aztec', region: [16, 36, 27, 44], count: 3 },
    { tribe: 'arawak', region: [29, 36, 46, 41], count: 3 },
    { tribe: 'arawak', region: [33, 34, 38, 38], count: 1 },
    { tribe: 'arawak', region: [35, 45, 51, 53], count: 4 },
    { tribe: 'tupi', region: [51, 57, 63, 77], count: 7 },
    { tribe: 'tupi', region: [42, 55, 51, 65], count: 4 },
    { tribe: 'inca', region: [33, 54, 43, 83], count: 7 },
  ],
  // Main rivers first, tributaries after the river they join. Format: parseRivers in rivers.ts.
  rivers: `
    Mississippi: m 25,18 26,23 M 26,27 26,31 26,32
    Missouri: m 10,17 16,20 M 21,24 26,26
    Ohio: m 37,21 M 31,24 26,25
    St. Lawrence: M 32,19 33,18 42,18 43,18
    Hudson: m 38,19 39,20 40,20
    Rio Grande: m 15,25 16,30 M 18,32 21,33 22,33
    Colorado: m 11,22 M 10,26 11,30 11,31
    Columbia: m 7,14 6,17 M 5,19 4,19 3,19
    Mackenzie: M 14,11 10,7 7,4 6,3
    Nelson: m 14,15 20,12 24,10 24,9 25,9
    Amazon: m 34,57 M 38,58 46,57 54,56 55,56
    Madeira: m 41,67 44,62 45,58 45,57
    Negro: m 40,53 43,55 46,57
    Xingu: m 51,66 51,57 51,56
    Tocantins: m 56,66 56,57 57,57
    Orinoco: m 45,52 41,51 M 40,50 41,49 46,49 47,49
    Magdalena: m 37,54 37,51 36,50 35,49 34,49 33,49
    Sao Francisco: m 55,74 57,68 M 59,65 60,64 61,64
    Parana: m 53,70 50,75 M 47,79 47,83 48,83
    Paraguay: m 47,68 46,75 46,78 47,79
  `,
  rows: `
...............................................~~~~~~~~~~~~~~~~~~~~
aattTtttttt.t..tta...aaaaaaa.aaa...aa..........~~~~~~~~~~~~~~~~~~~~
TTTTTtttttttttttttaaaaaaaaaaaaaa......a.a.aaa..~~~~~~~~~~~~~~~~~~~~
TTTTTT.ttttttttttttaaaaaaaaaaa.......aaaa..a...~~~~~~~~~~~~~~~~~~~~
^hhTTTTTTtttttttttttttttttaa.aaa...a.aaaaaa....~~~~~~~~~~~~~~~~~~~~
^^hhTTTTTTTTttTTTttttttttt.............aaaa...~~~~~~~~~~~~~~~~~~~~~
^^^hTTTTTT.TTTTTTTttttttt.........taaa........~~~~~~~~~~~~~~~~~~~~~
^^^^GTTTTTTTTTTTTTTTTTTT....~~~~...ttttt.......~~~~~~~~~~~~~~~~~~~~
G^^^^TTTTTTTTTTTTTTTTTTT......~~..tttttt..ht...~~~~~~~~~~~~~~~~~~~~
GGh^^^^TTTTTTTTTTTTTTTTTm..........tttttthhht...~~~~~~~~~~~~~~~~~~~
hGhh^^^^hTTTTTTTTTTTTTTmmmmt.......TTTTTtthhh.....~~~~~~~~~~~~~~~~~
^hhG^^^^^GpTTTTTTTTTpTMMmmmmmm.....TTTTTTtthht.....~~~~~~~~~~~~~~~~
G^^GGhh^^^pTTTTTTTppPTmmmmmmmMmm..TTTTTTTTTTttTT...~~~~~~~~~~~~~~~~
.h^^GGG^^^pTTTppppppp.MmmmmmmmMm..TTTTTTTTTTTTTTT..~~~~~~~~~~~~~~~~
..h^^GG^^^^hpppppppppTMTTTmmmmmMM.TTTTTTTTTTTTTTT...~~~~~~~~~~~~~~~
..Gh^hGG^^^^pppppppppTGGGGTmmMMmmmTTTTTTTTTTTT..T....~~~~~~~~~~~~~~
...Gh^^pp^^^pppppppppGGGGGGGTTTMMMTTTTTTTTT....TTT...~~~~~~~~~~~~~~
....Gh^ppp^^hpppppppppGGPGG..TTTTTTTTTTTTGG....GTTT..~~~~~~~~~~~~~~
~...Gh^ppp^^^^pPPpppppPPPPGG.GGGGGGGGGGGGGg..........~~~~~~~~~~~~~~
~~..Ghhppph^^^hPpppppppPPPPGG.G..GGGGhhhhGGgG........~~~~~~~~~~~~~~
~~..G^hpppph^^hppppppppppPPP.PP.PGGGhhhh..P....~~~~~~~~~~~~~~~~~~~~
~~..Ghhppppp^^^hpppppppPpPpP.PPPPpghhhh........~~~~~~~~~~~~~~~~~~~~
~~..h^^pppddp^^^hPpppppppPppPPPPPphhhpp......~~~~~~~~~~~~~~~~~~~~~~
~~..hh^Gpdddph^^^pppppppppppPppPPhhhP....~~~~~~~~~~~~~~~~~~~~~~~~~~
~~...h^hpdddPPh^^hrrrrppppppggggghhMM....~~~~~~~~~~~~~~~~~~~~~~~~~~
~~...hh^pdddddh^^hrrrrppppppGggghhhM...~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~...h^^dddddd^^hrrrrrphhGgGgGhhGgm...~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~...hp^dddddd^^rrrrrRGGGGGghhhGGMm..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~....ddddddd^^rrdddrGGGRRrhhrMMM...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~.....ddddddddrddddRRRRRRRRrmM.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~...dddhdhDddddddrRRRRRRrrm.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~...d.dh^ddddddDMmMmMMmmmm...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~.....dd^hdddddmS........SM....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~...d.dh^dddhdd.........SM.....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~...d.d^ddd^dd...~~~~..wW.S...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~...d.d^^dd^dd..~~~~....w.sS..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~...d.d^dpp^p..~.........s...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~......^^pp^p........SSss........~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~......pppp^.....S..S..ssS.......~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~...ppss^....SSS.....Shhsss.....~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~..p^^^^h...SS.........S^^s....~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~....hhhsSSSSS......hS.Ss..Sh..~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~......ShSSSSS..................~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~........^^hSSS.............s.~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~.......S^^WW..~.............~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~.....W^W.......W......s..~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~.....hh.....shsss.......~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~...S^S....s^h^^^^^^M...~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~....^SSsss^^^^shhMS....~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~.....W.SWW^^sssShSSS......~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~......^^^hssshhhhSh......~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.....^^ssssshhhhhhhSS...~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^ssssshhhhhhhSSS...~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^hsSssssssSSSSSSS...~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WsSWWWWWsSSSWWSSS....~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..W^WWWWWWWWWWWWWWWWSS......~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..^^WWWWWWWWWWWWWWWWWWWW.......~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WwWWWWWWWWWWWWWWWWWWss.......~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WWWWWWWWWWWWWWWWWWWSSSdss....~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..d^^WWWWWWWWWWWWWWWWWWssSSddsss...~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WWWWWWWWwWWWWWWWWWssssddddd...~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...d^WWWWWWWWWWWWWWWWWWssssddDddS..~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WWWWWWWWWWWWWWWWWssssdddDS...~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WWWSSSWWWWWWWWWWWsssshDdSS...~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^WSSSSSWWWSSsssWWsssshhdS...~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...S^SSDddSSSSSsssssssssshDSS...~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..d^^dDDdhdDDssssssssssshSS...~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...d^^Dd^ddDssssssssssshhSS...~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....d^^d^hdDsmmsssssssshhSS..~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.....^^h^DDsMmmssssssshhSS..~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....^^d^DDDsmmmsssssshSS...~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^d^DDDDDgGGssssshSh...~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^D^dhDDdgGGGggSShhh..~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^d^dDDDDgGGggSShhh...~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^d^DDDDggGGggShh.....~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..d^d^DDDDgGGGGgh......~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..d^ddDDDggGgGgGh....~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^ddddDgggggggg..~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..^^ddrrrggggggg...~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..^^ddrrrrggggg....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^Ddrrrrggggg...~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^dDrrrrgggg...~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^hddrrrpgggg...~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...h^hdDppppg.....~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^hdddpppp.....~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..p^^ddDppppp..~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..G^^ddDppp....~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..G^^ddddd.....~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..G^^ddd.....~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..G^^ddd....~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^dddd..~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^ddd...~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^^ddd...~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^hdd..~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..h^^dd........~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^tt........~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^t......t..~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~..^^ht........~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^Tt.......~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........~~~~~~~~~~~~~~~~~~~~~~~
`,
};
