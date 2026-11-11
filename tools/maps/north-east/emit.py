"""Step 5: writes packages/engine/src/maps/north-east.ts from the steps before."""
import json, math, sys
D = '/tmp/claude-0/-home-user-CasualColonization/b9a40597-a79c-5e47-82fb-9e655e0414a5/scratchpad/ne/'
OUT = sys.argv[1]
rows = json.load(open(D + 'terrain.json'))['rows']
reg = json.load(open(D + 'regions.json'))
rivers = open(D + 'rivers.txt').read().rstrip('\n')
H, W = len(rows), len(rows[0])
COL = 0.25 / math.cos(math.radians(49.25))


def tile(lon, lat):
    return int(math.floor((lon + 82) / COL)), int(math.floor((58.5 - lat) / 0.25))


def rect(w, s, e, n):
    x0, y0 = tile(w, n)
    x1, y1 = tile(e, s)
    return [max(0, x0), max(0, y0), min(W - 1, x1), min(H - 1, y1)]


# (people, comment, west, south, east, north, count, from, until)
PEOPLES = [
    ('dorset', 'The Dorset on the northern Labrador coast and the east coast of Hudson Bay, until the 14th century.', None),
    ('dorset', None, (-64.6, 56.0, -61.0, 58.5, 2, None, 1350)),
    ('dorset', None, (-78.5, 55.5, -76.0, 58.5, 1, None, 1350)),
    ('inuit', "The Inuit, whose Thule ancestors reached the northern Labrador coast and Nunavik's shores in the 15th century.", None),
    ('inuit', None, (-64.6, 55.8, -61.0, 58.5, 3, 1400, None)),
    ('inuit', None, (-78.5, 55.5, -76.0, 58.5, 1, 1400, None)),
    ('eeyou', 'The Eeyou along the rivers east of James Bay.', None),
    ('eeyou', None, (-79.6, 51.0, -73.5, 55.0, 3, None, None)),
    ('innu', 'The Innu of Nitassinan: the Saguenay and Tadoussac, the north shore of the Gulf, the Labrador interior.', None),
    ('innu', None, (-72.0, 48.0, -69.4, 49.4, 1, None, None)),
    ('innu', None, (-69.4, 49.4, -58.0, 51.6, 3, None, None)),
    ('innu', None, (-68.0, 51.6, -59.0, 54.6, 2, None, None)),
    ('beothuk', 'The Beothuk of Newfoundland, from the Exploits valley to the coasts.', None),
    ('beothuk', None, (-57.6, 47.6, -53.3, 50.0, 3, None, None)),
    ('algonquin', 'The Algonquin along the Ottawa and its tributaries.', None),
    ('algonquin', None, (-79.3, 45.4, -75.3, 47.6, 3, None, None)),
    ('mikmaq', "The Mi'kmaq of Mi'kma'ki: Nova Scotia, Cape Breton, Prince Edward Island, eastern New Brunswick and the Gaspé.", None),
    ('mikmaq', None, (-66.0, 43.6, -61.0, 45.6, 2, None, None)),
    ('mikmaq', None, (-61.6, 45.6, -59.8, 47.0, 1, None, None)),
    ('mikmaq', None, (-66.8, 46.2, -64.2, 49.2, 2, None, None)),
    ('wolastoqiyik', 'The Wolastoqiyik along the Saint John.', None),
    ('wolastoqiyik', None, (-68.6, 45.4, -66.2, 47.4, 2, None, None)),
    ('penobscot', 'The Penobscot on their river and bay.', None),
    ('penobscot', None, (-69.8, 44.2, -67.4, 46.2, 2, None, None)),
    ('abenaki', 'The Abenaki of the Connecticut and Lake Champlain valleys.', None),
    ('abenaki', None, (-73.2, 43.0, -71.0, 45.2, 2, None, None)),
    ('wendat', 'The Wendat towns between Georgian Bay and Lake Simcoe.', None),
    ('wendat', None, (-80.6, 44.0, -78.8, 45.0, 3, None, None)),
    ('stLawrenceIroquoians', 'The St. Lawrence Iroquoians at Stadacona, Hochelaga and up the river, until their towns are gone.', None),
    ('stLawrenceIroquoians', None, (-71.7, 46.6, -70.6, 47.2, 1, None, 1580)),
    ('stLawrenceIroquoians', None, (-74.2, 45.3, -73.0, 45.9, 1, None, 1580)),
    ('stLawrenceIroquoians', None, (-76.3, 44.0, -74.6, 44.9, 1, None, 1580)),
    ('attawandaron', 'The Attawandaron between the Grand River and the Niagara.', None),
    ('attawandaron', None, (-80.8, 42.7, -79.2, 43.7, 2, None, None)),
    ('haudenosaunee', 'The Haudenosaunee, a town for each of the Five Nations, east to west: the Mohawk, the Oneida, the Onondaga, the Cayuga and the Seneca.', None),
    ('haudenosaunee', None, (-74.9, 42.7, -73.9, 43.1, 1, None, None)),
    ('haudenosaunee', None, (-75.8, 42.7, -75.3, 43.2, 1, None, None)),
    ('haudenosaunee', None, (-76.3, 42.7, -75.9, 43.2, 1, None, None)),
    ('haudenosaunee', None, (-76.9, 42.6, -76.4, 43.1, 1, None, None)),
    ('haudenosaunee', None, (-77.8, 42.5, -77.0, 43.1, 1, None, None)),
    ('mohican', 'The Mohican of the upper Hudson.', None),
    ('mohican', None, (-74.1, 41.9, -73.2, 43.0, 2, None, None)),
    ('massachusett', 'The Massachusett of Massachusetts Bay.', None),
    ('massachusett', None, (-71.5, 42.0, -70.8, 42.7, 1, None, None)),
    ('wampanoag', 'The Wampanoag of Cape Cod, the islands and the east of Narragansett Bay.', None),
    ('wampanoag', None, (-71.2, 41.3, -69.9, 41.95, 2, None, None)),
    ('narragansett', 'The Narragansett west of their bay.', None),
    ('narragansett', None, (-71.9, 41.3, -71.3, 42.0, 1, None, None)),
    ('munsee', 'The Munsee of the lower Hudson and Manhattan.', None),
    ('munsee', None, (-74.8, 40.4, -73.6, 41.6, 2, None, None)),
]

people_lines = []
for tribe, comment, data in PEOPLES:
    if comment:
        people_lines.append('  // ' + comment)
        continue
    w, s, e, n, count, frm, until = data
    r = rect(w, s, e, n)
    extra = ''
    if frm:
        extra += ', from: %d' % frm
    if until:
        extra += ', until: %d' % until
    people_lines.append("  { tribe: '%s', region: [%d, %d, %d, %d], count: %d%s }," % (tribe, r[0], r[1], r[2], r[3], count, extra))

region_list = '\n'.join("      { char: '%s', id: '%s', name: %s }," % (r['char'], r['id'], json.dumps(r['name'], ensure_ascii=False).replace('"', "'") if "'" not in r['name'] else json.dumps(r['name'], ensure_ascii=False)) for r in reg['regions'])
renewal = '\n'.join("  '%s': %d," % (r['id'], r['renewal']) for r in reg['regions'])

HEADER = open(D + 'header.ts').read()
body = HEADER + '''export const northEast: StoredMap = {
  id: 'north-east',
  name: 'The North-east',
  description:
    'The North-east of North America drawn from real coordinates: Newfoundland and Labrador, the Gulf and the valley of the St. Lawrence, the Maritimes, New England, the Hudson, the Great Lakes from Lake Huron to Lake Ontario, and James Bay. Expeditions arrive from the east.',
  entryRows: [16, 64],
  // Main rivers first, tributaries after the river they join. Format: parseRivers in rivers.ts.
  rivers: `
%s
  `,
  rows: `
%s
`,
  regions: {
    rows: `
%s
`,
    list: [
%s
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
%s
];

/**
 * Land health (native-nations.md T10): furs and game each region gives back in a year without
 * wearing, by region id. Worked out from each region's land: 0.6 a tile of the mixed and broadleaf
 * forests of the south, 0.5 of conifer forest and marsh, 0.4 of the boreal forest and hills, 0.25
 * of open tundra, 0.1 of mountains; so beaver country renews faster than the barrens. Drafted for
 * Simon's review.
 */
export const NORTH_EAST_RENEWAL: Record<string, number> = {
%s
};
''' % (rivers, '\n'.join(rows), '\n'.join(reg['rows']), region_list, '\n'.join(people_lines), renewal)
open(OUT, 'w').write(body)
print('written', OUT)
