import type { StoredMap } from './index.js';

/** North America. The legend is in index.ts. */
export const northAmerica: StoredMap = {
  id: 'north-america',
  name: 'North America',
  description: 'From the Arctic islands to Panama, with the Caribbean. Six tribes, from the Iroquois to the Arawak.',
  entryRows: [14, 60],
  tribes: [
    { tribe: 'iroquois', region: [42, 24, 55, 33], count: 7 },
    { tribe: 'cherokee', region: [33, 34, 47, 45], count: 7 },
    { tribe: 'sioux', region: [21, 16, 34, 34], count: 10 },
    { tribe: 'apache', region: [12, 35, 28, 48], count: 8 },
    { tribe: 'aztec', region: [21, 52, 36, 63], count: 6 },
    { tribe: 'arawak', region: [39, 52, 60, 59], count: 4 },
    { tribe: 'arawak', region: [44, 48, 50, 55], count: 1 },
    { tribe: 'arawak', region: [46, 65, 61, 71], count: 3 },
  ],
  rows: `
............................................~~...............~~~~~~~~~~~
tTTTTTTTT.ttttttttttaaaaaaaaaaaaaaaaaaaaaa.......aa.aaaaaaa..~~~~~~~~~~~
TTTTTTTT..Tttttttttttttttttttaaaaaaaaaa.........aaaaaa.aaa...~~~~~~~~~~~
TTTTTTTTTTTttttTTttttttttttttttttaaaa.aaa....aaaaaaaaaa......~~~~~~~~~~~
^^^hTTTTTTTTTTTTTTttttttttttttttttaaa.aaaa.......aaaaaaa....~~~~~~~~~~~~
^^^^hTTTTTTTTTTTTTTtttttttttttttttt....a..........aaaaaa..~~~~~~~~~~~~~~
^^^^hhTTTTTTTTTTTTTTTTTtttttttttt.......a....a......aaa...~~~~~~~~~~~~~~
^^^^^hTTTTTTTT..TTTTTTTTTTtttttt.............ttttt.........~~~~~~~~~~~~~
^^^^^^hTTTTTTTTTTTTTTTTTTTTtttt....~~~.......tttttta.......~~~~~~~~~~~~~
G^^^^^^TTTTTTTTTTTTTTTTTTTTTttt....~~~~~~~~..ttttttt....t...~~~~~~~~~~~~
Gh^^^^^^hTTTTTTTTTTTTTTTTTTTTTT....~~~~~~~~..ttttttt...hh....~~~~~~~~~~~
GGh^^^^^^TTTTTTTTTTTTTTTTTTTTTTTT......~~~~..ttttttthhhhht...~~~~~~~~~~~
hGGG^^^^^^TTTTTTTTTTTTTTTTttTTmmm........~~...ttttttthhhhhh...~~~~~~~~~~
^^hGG^^^^^^TTTTTTTTTTTTTTTtTTTMmmmmmM.........TTTTTTtthhhhh.....~~~~~~~~
^^^hGGh^^^^^hpTTTTtTTTTTTTTTTTTMMMmMmMm.......TTTTTTttthhhht....~~~~~~~~
.^^^hGGh^^^^^hTTpptTTTTpppTTTTTmmmmmmMmMm...mTTTTTTTTTThThTTTT....~~~~~~
.h^^^GGGh^^^^TpppppTTTpppppTTTTMTTMMmMmmmm..mTTTTTTTTTTTTTTTTT....~~~~~~
..G^^hGGG^^^^^pppppppppppppp.pTMTTTTMMMmMm..mTTTTTTTTTTTTTTTTTTT..~~~~~~
...hh^hGGh^^^^^ppppppppppppP.pTmTTTTTTMMmm..mTTTTTTtTTTTTTTTTTTT..~~~~~~
...GG^^hGGh^^^^pppppppppppppPpMMTTTTTTTMMmm.mTTTTTTtTTTTTTTTTTT...~~~~~~
~..GGG^^hGh^^^^hppppppppppPpppMMTmmmmMmTTTTmmTTTTTTTTTtTTTTTT.T....~~~~~
~...GGh^^GGh^^^hppppPpPPpPpPppTTTtmmmmTTTTTTTTTTTTTTTT...T....TT....~~~~
~....GG.^^GGp^^^^hppppppppppppGGGgGTTTTTTTTTTTTTTTTTT.tT.....tTTT...~~~~
~~....Gh^^ppp^^^^^pppppppppppGgGGGGG..GGGGGGGGGGGGGTTTGG.....TTTTT..~~~~
~~~...Gh^^pppp^^^^hppppppppppGgGGG.....GGGGGGGGGGGGGGGGG.........G..~~~~
~~~~...h^^pppp^^^^^hpppppppppPpPPPPPPPGGGGGGGgGGGGGGhhGG.G.G........~~~~
~~~~...h^^pppPp^^^^hppppppppppPPPPPpp..p...GggGGGGhhhhgGGGG...~.....~~~~
~~~~...h^^pppppp^^^^pPPpppppppPPPPPpp.Ppp.PGGGGPhhhhhh.GPP....~~~~~~~~~~
~~~~..Gh^Gpppppp^^^^hpppppppppppppPpp.PPP.PPP.Phhhhh...P.....~~~~~~~~~~~
~~~~..GG^Gpppdpph^^^^hPppppppppppPPpp.PPPPPPPPhhhhP.........~~~~~~~~~~~~
~~~~..GG^GpphddPh^^^^hPppppppppppPppp.PPP..PPhhhhPP.......~~~~~~~~~~~~~~
~~~~..hh^Gpppddddh^^^^hppppppppppPPppPPPPPpPhhhhhP...~~~~~~~~~~~~~~~~~~~
~~~~..hh^^pppdddddh^^^PprrpppppPpPpppgpPPPpphhhMm....~~~~~~~~~~~~~~~~~~~
~~~~...h^^ppPdddddhh^^hrrrrrrPpPPPPppGGgggghhhhM....~~~~~~~~~~~~~~~~~~~~
~~~~...hh^^pddddddph^^hhrrrrrPPpPPpPpGgggghhhhMM...~~~~~~~~~~~~~~~~~~~~~
~~~~~...h^^pddddddddh^^hrrrrrPPPppppPpGgghhhhgM...~~~~~~~~~~~~~~~~~~~~~~
~~~~~...hp^^hdhddddd^^^hdrrrrRRGhhppppgGghhhhGM...~~~~~~~~~~~~~~~~~~~~~~
~~~~~~...p^^dddhdddd^^^hrrrrrRrhhhGGGGgghhhhGGM..~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~...hp^ddddhddd^^^drrrrrrRGhggGGghhhhhGGMM..~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~...dddddddddd^^^rrrrrrRRRGGGGGhhhhrrrMM...~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~....dddddddddd^hhddrrrRrrrrRRrRhhrrrMM....~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~....dddddddddddddddrrrrRRRRRRRrrrRmm....~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~....ddddddddddddddDDRRrRRRRRRRRrMm....~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~...d..ddd^dddddddDdDRrrRrRMmMrrM....~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~..dd.Dd^^ddddddddddMMmmmmm.mmmM...~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~...d.ddd^^dddddddDdM...m......mM..~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~....d.dd^^dddddddds...........Mm....~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~...d..dd^Dddddhhd........~~..MM.....~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~..dd.dd^^dDd^^dd...~~~~~~~..SwWW.s.~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~...d..d^^ddd^^Dd..~~~~~~~~...Ww.....~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~....d..d^^ddh^dh..~~~~~~~~...W....s.~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~...d..ph^ddd^hd..~~~~~~~.......S...~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~...d..p^hdd^^p..~~~~~~..........s.~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~.......^^pph^p..~~.......SSSSS.....~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~......^pppp^h...~......SSSSSSS.......~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~..ppppph^......SSS......SSSS.s.....~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~..s^hhss^s.....SS........hhh.SS.......~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~...^^^^^^h....SSs...~~.......^^^S.....~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~....SSSsSSw.wWSsS..~~~~..hS.ShhhS.hh.....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~....hhhhsSwWWWSs.....~..S....s..........~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~.....ShhhSSSSSs.....................s..~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~......S..^^SSSSSW.............~~~..s..~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~........^^^hWWWW..~~~~~~~~~~~~~.....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~.......S^^^WWW..~~~~~.....~~~..s..~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.....W^^WW..~~~~........~~....~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.....S^WW..~~.....s........s..~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....W^W..~~....hsss.........~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...W^W......s^^ss^^^..^hm..~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~...^^......s^^.^^^^^^^h....~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....^hSSSWWss^^^^^hhhhM....~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~....SS..SWWh^^^hsssssMmM..~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.........................~~~~~~~~~
`,
};
