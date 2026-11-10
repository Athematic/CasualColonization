# Tessellated terrain tiles

Status: trial. The sprite-pack option and its tests are in; the art for the trial set is not generated yet.

Simon's idea (CHANGE_SUGGESTIONS.md): update the tiles with tessellation, so terrain edges blend instead of meeting in a hard colour boundary. He linked two articles by Sandro Maglione, "How to create a pixel art tileset: complete guide" and "Pixel art game tileset made easier".

## The articles

The session that wrote this note could not fetch the articles (the host was outside the allowed network), so this summary is from general knowledge of the techniques they cover, not a reading of the pages. Worth checking against them.

- **Autotiling.** A tileset is a small set of pieces that a program picks from by looking at the neighbours, so an artist draws a few dozen pieces instead of every map situation.
- **Blob / 47-tile sets.** Each tile looks at its 8 neighbours. Corners only matter when both adjacent sides are filled, which collapses 256 neighbour patterns to 47 distinct tiles. Best look, most art: every piece must match its neighbours on all four sides.
- **16-tile sets ("marching squares", edge-only).** Look at 4 sides only: 16 pieces. No inner corners, so diagonals look blocky.
- **Dual grid** (the "made easier" idea). Put the drawn tiles on a grid offset by half a tile, so each drawn tile sits on a corner shared by four world cells. Each drawn tile then depends on 4 corner cells, each filled or empty: 2^4 = 16 patterns, and only 6 distinct shapes up to rotation and mirroring (empty, full, one corner, two adjacent corners, two opposite corners, three corners). The artist draws about 5 to 6 pieces per terrain pair, every transition is guaranteed to line up, and world data stays on the plain grid.
- **Wang tiles.** Pieces are chosen by the colours on their edges (or corners) so that any two touching edges match. The 16-piece corner set is a Wang set. Edge-coloured Wang sets scale as colours^4.
- **Tips common to both articles.** Fix the geometry first (where a transition meets the tile edge, how deep it goes), draw the transition shape once and derive the rest by rotation and mirroring, keep the tile edges free of detail so pieces join, and test with a small randomly painted map early.

## What we have today

Square tiles, one opaque full-bleed sprite per land terrain (`terrain/<id>`), a hard flat-colour boundary between terrains with a faint ink border from the fallback renderer. Water gets three overlay pieces (`terrain/coast__edge`, `__inner`, `__outer`), rotated in quarter turns and chosen by `coastPieces(land[8])`. Roads work the same way. The coastline itself is a procedural ink line.

## The options

The game has 11 land terrains (forest is an overlay, not a terrain). Pairs: 55 unordered, 110 ordered.

### (a) Dual grid, 16 pieces (6 distinct shapes) per terrain pair or per terrain-against-lower

Drawn tiles sit half a tile off the world grid. For a pair, 6 shapes. With a priority order (each terrain is drawn against the terrain "below" it, and anything lower shows through) it is one set per terrain: 11 sets of 6 shapes, about 66 images before any variation, where each image must contain *both* terrains' ground and motifs. Problems for us:

- Both ground textures are baked into every piece, so every piece must be generated in the exact style of two terrains and the textures must line up with the base tiles across the half-tile offset. The model cannot guarantee that.
- Ground, relief, bonus markers, plowed fields, roads and the coastline are all drawn per world tile. Shifting terrain to a half-tile grid touches all of them, and the coast would not match the procedural ink line.
- Plowed tiles (`__plowed`) would need their own transitions.
- Per terrain pair (no priority) it is 55 pairs x 6 = 330 images.

### (b) 47-tile blob set per terrain

Best looking, but 47 images per terrain over a lower terrain, 11 x 47 = 517 images, each containing two grounds. SPRITE_PROMPTS.md already ruled it out ("about 600 images that the model cannot draw consistently"). No.

### (c) Edge and corner overlays, per bleeding terrain (recommended)

The same scheme as the coast bands. For every terrain X, 3 transparent pieces: an **edge** (a band along the top), an **inner** corner (a band along the top and the left) and an **outer** corner (a patch in the top-left corner), rotated in quarter turns. The piece is a flat band of X's exact base colour with a thin wavy stroke on its inner boundary. A terrain ranks above or below another; the higher one bleeds onto the lower one, so each pair of neighbouring tiles is handled by exactly one tile (the lower one) and no piece contains two grounds. The base tiles are untouched.

Selection is `coastPieces()` on "which neighbours are a higher-ranked terrain X", one pass per distinct X, lower-ranked X first.

Image count: 3 per bleeding terrain. All 8 ranked land terrains: 24 images, about $0.96 at $0.04. The trial set is 4 terrains: 12 images, about $0.48. With one variant each (`__v2`, for less repetition) and re-rolls for the odd bad piece, plan on twice that: under $2 for the whole terrain set.

Weaknesses: only 3 pieces, so no concave/convex variety beyond the corner rules; the ends of an edge band meet the neighbouring bands at the tile corners, which can leave small notches (visible in the demo, where a band ends at a corner next to a tile of the same terrain). Drawing the band's ends slightly tapered would hide most of it; check once real art exists. Hills, mountains and arctic are left out on purpose: they carry their own relief art.

**Generic variant** (not built): 3 white pieces tinted to the neighbour's colour with the pack's `tinted` painter, 3 images in total, at the cost of the stroke colour and any texture.

## Recommendation

(c), with `rules.transitions: 'overlay'`. It is the cheapest (3 images per terrain), prompts are fixed geometry like the coast and road prompts, nothing but the land hook changes, a missing piece simply leaves today's hard boundary, and it can be added terrain by terrain. Dual grid is the better system for a game built around it from the start, but it would rewrite how ground, plowing and coasts are drawn.

## Prompts

SPRITE_PROMPTS.md section 4.8a, a trial set under the `terrain-blend` category block: for each of savannah, plains, prairie and grassland, `terrain/blend__<terrain>__edge|inner|outer`. Geometry that lets the pieces line up:

- Transparent background, flat fill in exactly the terrain's base colour (so the band merges into a full tile of that terrain on the other side of the edge).
- The band is 20% deep where it meets an image edge, the same at both ends, so neighbouring pieces join without steps; in between the inner boundary wanders within 16 to 25%.
- One thin stroke on the inner boundary in the terrain's motif colour; no ink outline, no motifs.
- Edge points north, inner points north and west, outer is the north-west corner, exactly as the coast pieces.

## Pipeline and pack

- `tools/sprite-pipeline`: `terrain/blend__*` is classified like the coast bands: category `terrain` (so `fullbleed`, geometry kept, no outline redrawn) and a ground overlay (forced transparent outside its shape).
- `packages/style-sprites`:
  - `mapping.transitions { edge, inner, outer }`: templates `terrain/blend__{terrain}__edge` and so on, `{terrain}` being the bleeding terrain.
  - `rules.transitions: 'none' | 'overlay'`, default `'none'`: nothing changes today. `rules.transitionOrder`, lowest first, default desert, tundra, savannah, plains, prairie, grassland, marsh, swamp.
  - `transitions.ts`: `transitionPieces(order, own, neighbours, has)`, the pure selection. `coast.ts` now holds `coastPieces` (shared).
  - `layers.ts`: the `land` hook draws the pieces over the ground, inside the same rounded-corner clip. A terrain without an edge piece in the manifest bleeds nothing; missing inner pieces become two edges; missing outer pieces are skipped. So a half-finished art set degrades gracefully.
- To try it with a pack: `extendPack(ligneClairePaintedPack, { rules: { transitions: 'overlay' } })`.
- `packages/style-sprites/test/fixtures/synthetic-blend.ts` draws stand-in pieces with canvas 2D for demos. The demo image is `docs/design/tessellated-tiles-demo.png` (left: none, right: overlay).

## Left

1. Generate the 12 trial images, run the pipeline, look at real art on a map at several zoom levels.
2. If it works: the other terrains (marsh, swamp, desert, tundra) and a `__v2` variant; then decide whether hills, mountains and arctic should take part.
3. Tune the order, and decide whether the painted pack turns the option on by default.
4. Plowed tiles currently take bands like any other ground; check that the plowed field's 8% border looks right under a band.
