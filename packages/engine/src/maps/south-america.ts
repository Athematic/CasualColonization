import type { StoredMap } from './index.js';

/** South America. The legend is in index.ts. */
export const southAmerica: StoredMap = {
  id: 'south-america',
  name: 'South America',
  description: 'From the Caribbean coast to Tierra del Fuego: the Andes, the Amazon and the pampas. Arawak, Tupi and Inca.',
  entryRows: [4, 56],
  tribes: [
    { tribe: 'arawak', region: [9, 1, 33, 11], count: 6 },
    { tribe: 'tupi', region: [33, 18, 52, 45], count: 10 },
    { tribe: 'tupi', region: [19, 14, 33, 27], count: 6 },
    { tribe: 'inca', region: [5, 13, 21, 53], count: 10 },
  ],
  // Main rivers first, tributaries after the river they join. Format: parseRivers in rivers.ts.
  rivers: `
    Amazon: m 6,19 M 12,17 20,16 28,15 35,14 36,14
    Negro: m 13,10 17,13 21,15 21,16
    Madeira: m 17,28 20,22 M 23,18 24,17 24,16
    Xingu: m 31,27 31,16 31,15
    Tocantins: m 37,30 37,19 38,16 38,15 39,15
    Orinoco: m 24,11 17,10 M 15,8 20,6 26,6 27,6
    Magdalena: m 11,12 10,9 M 9,6 9,3 8,3
    Parana: m 38,33 34,38 M 29,43 28,48 28,53 29,53
    Paraguay: m 28,31 27,36 28,41 29,43
    Uruguay: m 37,40 33,46 32,50 32,51 32,52
    Sao Francisco: m 41,38 40,32 M 42,29 46,29 47,29
    Rio Negro: m 15,56 20,57 24,57 25,57
  `,
  rows: `
....~~~~...........~~~~...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
hW..~~~......sss........s..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
^W........s^^ssSs....s......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
^^.......Ss^^hh^^^^^^^^^m.s.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.^h..WW..ss^^^^^^^^^^^^sM....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
..hSs..Wssss^^^^sssssssmSS....~~~~~~~~~~~~~~~~~~~~~~~~~~~~
....s..SWhW^^^^ssssssssssSS.......~~~~~~~~~~~~~~~~~~~~~~~~
........^^^^^^sssssshhhhhSSS........~~~~~~~~~~~~~~~~~~~~~~
~~......^h^^hhssssshhhhhhhhhSSSS.....~~~~~~~~~~~~~~~~~~~~~
~~~~~...^^^^ssssssshhhhhhhhhhSSSSS...~~~~~~~~~~~~~~~~~~~~~
~~~~....^^^WssssssssshhhhhhhhSSSSSS...~~~~~~~~~~~~~~~~~~~~
~~~~...^^^WWWssssssWWWWSSSShhSSSSSS...~~~~~~~~~~~~~~~~~~~~
~~~...S^^^WWWssWWWWWWWWWWSssSSSSSSSS..~~~~~~~~~~~~~~~~~~~~
~~....S^^WWWWWWWWWWWWWWWWWwSSSSSSSWW.....~~~~~~~~~~~~~~~~~
~~...sh^hWWWWWWWWwwWWWWWWWWWwWWWWWWW.......~~~~~~~~~~~~~~~
~~..ss^^WWWWWWWWWWwWWWWWWWWWWWWWWWWWWWW......~~~~~~~~~~~~~
~~..sh^^WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW........~~~~~~~~~
~~...h^hWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWs........~~~~~~~
~~...h^WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWsSSSdddd......~~~~~
~~..dh^WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWssSSddddDD....~~~~~
~~..d^^^WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWssssddDDdDdd...~~~~
~~..dh^^WWWWWWWWWWWWWWWWWWWWWWWWWwwwWWWssssdDDDDDDd...~~~~
~~...h^^hWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWsssddDDDDddSS..~~~~
~~....^^hWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWsssdDdddDDDSS..~~~~
~~~...^^^hWWWWWWWWWWWWWWwWWWWWWWWWWWWWssssDDdddDDDS...~~~~
~~~~...^^^WWWWWWWWWWWWWWWWWWWWwWWWWWWWssssDDddDDDSS...~~~~
~~~~...h^^WWWWWWWWSSSSWWWWWWWWWsssWWWWssssDhhddDSS...~~~~~
~~~~~...^^^hSSSWWSSSSSSWWWssssssssssssssssDhhddSS....~~~~~
~~~~~...d^^^hSSSSSSDddSSSsssssssssssssssssDhhdSS....~~~~~~
~~~~~~...d^^^hdSSSddddDSSssssssssSssssssssshhSS....~~~~~~~
~~~~~~...dd^^^hDDdhdddDDhsSSsssssSsssssssshhsSS...~~~~~~~~
~~~~~~~...dd^^^ddh^hdDDDDssMmmmmsssssssssshhsSS..~~~~~~~~~
~~~~~~~.....^^^hdh^^ddDDDssmmMmMssssssssshhhsSS..~~~~~~~~~
~~~~~~~~.....^^^dd^^DDDdDssmmMmMSsssssssshhhssS..~~~~~~~~~
~~~~~~~~~~....^^^dh^^dDDDdssmMMssssssssssshhSSS..~~~~~~~~~
~~~~~~~~~~~....^^hd^^dddDdssMMMSssssssssshhhShS..~~~~~~~~~
~~~~~~~~~~~~...^^^dh^ddddDDsMMMsssssssssshhShh...~~~~~~~~~
~~~~~~~~~~~~~..^^hd^^ddDDDssmMmsssssssssshhShh...~~~~~~~~~
~~~~~~~~~~~~~..d^^d^^dddDDDDggGGGggGGggSSShhh...~~~~~~~~~~
~~~~~~~~~~~~~..d^^d^^hdhDDDdggGGgGGgGSSShhhh....~~~~~~~~~~
~~~~~~~~~~~~~..h^^d^^ddhddDdgggGggGGSSShh......~~~~~~~~~~~
~~~~~~~~~~~~~..d^^dh^dddDDDDggGGGGGSSSh.......~~~~~~~~~~~~
~~~~~~~~~~~~...h^^d^^dddDDDDggGGGgGGhh.....~~~~~~~~~~~~~~~
~~~~~~~~~~~~...h^^ddddddDdDDDgGGgGgGh....~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~..Dd^^dddddrrrDDDgGggggggg..~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~..d^^^ddDdrrrrrDDgGGggggg...~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~..d^^^dddrrrrrrrggGgggggg...~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~..h^^dddDrrrrrrrgggggggg...~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~..^^hddddrrrrrrrggggggg....~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~..^^^ddddrrrrrrrgggggg....~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~...h^hddddrrrrrrpgggggg...~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~...^^^ddddpprrrppggggg...~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~...p^^hddddpppppppgggg....~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~...p^^hddddpppppppg......~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~..Gh^^Dddddpppppppp.....~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~..G^^^dDddddppppppp..~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~..G^^hddddddpppppp...~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~...Gh^hhddddppdd......~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~...G^^hddddddd.......~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~..G^^^^ddddddd....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~..g^^^dddddd....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~..G^^^dddddd....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~...^^^ddddd...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~...G^^^ddddd...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~...^^^^dddd...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~..G^^^dddd....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~...^^^dddddd..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~..h^^^ddddd...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~..h^^^httt....~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~..^^^^ttt....~~......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~..^^^^tt....~~~......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~...^^^^tT...~~~..tt..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~....^^^hT....~~......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~...^^^^TT...~~......~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~....^hTtt..~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~...........~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
`,
};
