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
