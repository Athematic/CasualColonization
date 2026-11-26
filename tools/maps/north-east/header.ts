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
