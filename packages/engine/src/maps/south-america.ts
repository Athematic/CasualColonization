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
