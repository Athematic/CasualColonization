# Thumbnail prompts for Generate-Images.ps1 `-Variant thumb`

`Generate-Images.ps1 -Variant thumb` (or `both`) makes a second, separate text-to-image generation of every sprite: the **thumbnail** version, designed to read at 16 to 48 px. It is not an edit of the full master. It is a new generation of the same subject, so the two differ slightly. The full version (`output/sprites/`) is unchanged; the thumbnails go to `output/thumbs/<category>/<id>.png`, with their own manifest entries (`thumbs/<category>/<id>`).

Only the fenced blocks are read; everything else in this file is notes. Edit the blocks freely. Each edit changes the prompt hash of the thumbnail jobs that use the block, so the next `-Variant thumb` run regenerates them (the old takes move to `_replaced/`, unless you pass `-KeepChanged`). The full jobs never read this file.

The order of the assembled thumbnail prompt:

1. the `lead` block (`icon` or `tile`): the line-weight rule, stated first, because the model weighs the start of the prompt;
2. the full prompt, unchanged: the `master` block, the `category` block and `SUBJECT: ...` from `docs/SPRITE_PROMPTS.md`;
3. the **THUMBNAIL OVERRIDE**: the `override` block (`icon` or `tile`), the `background` block for the job's background, every `category` block for the job's prompt-document category, and every `match` block whose wildcard matches the sprite id;
4. the `final` block (`icon` or `tile`): the line-weight rule again, because the model also weighs the end.

Placeholders you can use in any block: `{WIDTH}` and `{HEIGHT}` (the image size), `{OUTLINE}` (6 to 8 percent of the shorter side in px, e.g. "61 to 82" on 1024) and `{PALETTE}` (the 12 bible colours).

## Settings

- `skip`: categories that get no thumbnail (folder category, the first part of the id, or prompt-doc category). Box art never gets one: covers are not needed small.
- `tile`: prompt-doc categories drawn with the `tile` blocks instead of the `icon` blocks: full-bleed or edge-aligned map tiles, where big simple shapes matter more than outlines.

```settings
skip: bible
tile: terrain, ground-overlays
```

## Icon (every free-standing sprite: units, ships, goods, buildings, ...)

```lead icon
THUMBNAIL VERSION. This image is an icon for a 32-pixel game sprite, drawn large. Every outline is a very thick, uniform, solid near-black (#1b1a17) line about 6 to 8 percent of the image's shorter side ({OUTLINE} pixels on this {WIDTH}x{HEIGHT} image), like a road-sign pictogram or a children's sticker. No thin lines anywhere. The THUMBNAIL OVERRIDE at the end of this prompt takes precedence over every rule in between.
```

```override icon
THUMBNAIL OVERRIDE. These rules replace the LINE, COLOUR, DRAWING and FRAMING rules above wherever they disagree, including every line-weight figure given above (the 2.5 to 4 percent ones). Draw the SUBJECT above as a bold icon for a 32-pixel game sprite: the same subject, the same colours and the same three-quarter view facing right, but radically simplified, so that it is still instantly readable when shrunk to 24 to 32 pixels. Precision and technical detail do not matter here; recognition at 32 pixels does.

LINES: every outline is a very thick, uniform, solid near-black (#1b1a17) line about 6 to 8 percent of the image's shorter side ({OUTLINE} pixels on this {WIDTH}x{HEIGHT} image), like a road-sign pictogram or a children's sticker. The same thickness everywhere: no tapering, no thin lines, no hairlines, no sketch lines anywhere. At most 3 to 5 interior lines in the whole image, each as thick as the outline.

SHAPES: a chunky, simplified silhouette that fills 85 to 90 percent of the frame, with a margin of about 5 percent and nothing cut off. Merge small parts into a few large shapes. Props, tools and weapons are oversized, 1.5 to 2 times their natural size, and held clear of the body with a visible gap, so each one is its own silhouette. Hands are simple mitten shapes, feet simple boot shapes. A face is reduced to 2 or 3 shapes: a skin-coloured shape and at most two dot eyes.

COLOUR: one flat fill per area, from this 12-colour palette wherever it fits: {PALETTE}. Keep a distinctive clothing colour from the subject description if it is not in the palette. Dark areas (a black hat, coat, cassock or boots) are a dark charcoal, clearly lighter than the outline, so the outline still separates them.

LEAVE OUT: shading, shadow tones, highlights, glints, texture, gradients, glow, drop shadows, and every small detail: buttons, folds, stitching, buckles, laces, pockets, planks, wood grain, individual leaves, hair strands, rope detail, window panes.
```

```final icon
REMEMBER, THE MOST IMPORTANT RULE: every outline is a very thick, solid near-black line of {OUTLINE} pixels on this {WIDTH}x{HEIGHT} image (6 to 8 percent of the shorter side), the same everywhere, like a road-sign pictogram or a sticker. No thin lines anywhere. At most 3 to 5 interior lines, each as thick as the outline. One flat colour per area, no shading, no texture, no small details. A chunky silhouette filling 85 to 90 percent of the frame, with oversized props held clear of the body.
```

## Tile (terrain base tiles and ground overlays)

```lead tile
THUMBNAIL VERSION of a map tile that is shown at 16 to 32 pixels. Big, simple, flat shapes and only a few bold marks; no thin lines and no small details anywhere. The THUMBNAIL OVERRIDE at the end of this prompt takes precedence over every rule in between.
```

```override tile
THUMBNAIL OVERRIDE. These rules replace the LINE, DRAWING and motif rules above wherever they disagree. The tile is shown at 16 to 32 pixels on the map, so make it radically simpler than a normal tile while keeping its colours and its tile geometry exactly as described: fewer, much larger shapes, and few marks. Do not outline everything: a motif is a flat shape in the motif colour, and where a line or stroke is used it is bold and flat, at least 4 percent of the tile width, never a thin line. No small marks, no scattered dots or specks, no texture, no gradients, no shading, no perspective.
```

```final tile
REMEMBER: few big, flat shapes; no small marks and no thin lines; every stroke at least 4 percent of the tile width; the tile edges exactly as described, so that the tiles join and repeat without seams.
```

## Background

```background transparent
BACKGROUND: fully transparent, with real alpha: everything outside the silhouette and its thick outline is transparent. No painted checkerboard, no white or coloured backdrop, no ground plane, no ground shadow, no glow, no halo, no frame.
```

```background opaque
BACKGROUND: an opaque, full-bleed square: the image is filled edge to edge, with no border, frame, vignette or transparent area.
```

## Category notes

Matched against the prompt-document category (the `category` block a sprite falls under in `docs/SPRITE_PROMPTS.md`). Ships are `ships` and wagons and guns are `vehicles`, although their ids start with `units/`.

```category units
FIGURE: a large head and hat (the head about a fifth of the figure's height); the hat brim, collar, belt and boots each become one simple shape. The role's equipment dominates the silhouette (a musket with bayonet, a horse, a spade and pickaxe, a telescope, a cross, the trade tool): it is drawn oversized and clear of the body, and it must stay clearly visible.
```

```category vehicles
VEHICLE: wheels are thick rings with at most four thick spokes; the body is one block shape; cargo is two or three simple boxes and barrels; a horse is one clear silhouette with its legs separated by gaps.
```

```category ships
SHIP: one bold hull shape with one darker wale band; at most 3 thick lines for the masts and stays, no ratlines and no rope detail; the sails are 2 to 4 large, flat white shapes, each with the thick outline; at most one row of gun ports, drawn as simple dark squares. The masthead stays bare, with no flag. Keep the short wave-blue waterline as one thick stroke.
```

```category goods
ICON: one object (or a tight bundle of two or three), very bold, filling 85 to 90 percent of the frame, with at most two interior lines. It must be recognisable at 18 pixels.
```

```category overlays
MARKER: one simple flat white (#fffdf6) cloth shape with the thick outline; a pole is one thick straight line. No folds, no stripes, no emblem.
```

```category decor
DECORATION: one to three large, simple shapes: a tree is one crown shape on one trunk, a forest two or three such trees, a hill one mound, a mountain one or two peaks with one flat snow or rock shape. No individual leaves, rocks or grass blades.
```

```category buildings
BUILDING: one simple block for the walls and one for the roof, two to four dark windows as plain squares, one door, on one flat earth shape. Leave out shingles, planks and bricks. A trade sign shows one large, simple pictogram.
```

```category colonies
SETTLEMENT: fewer, larger buildings, at most four houses, each a simple wall shape and roof shape; the flagpole is one thick line with no flag; the ground patch is one flat shape with the thick outline.
```

```category settlements
SETTLEMENT: fewer, larger structures, each a simple shape in its true form (longhouse, tipi, pueblo block, temple); the accent colour on one or two large bands; the ground patch is one flat shape with the thick outline.
```

```category ui
UI PIECE: keep the shape and any empty space meant for text exactly as described; a frame or border is one thick flat band; no ornament smaller than the outline width.
```

```category terrain
TILE: keep it a seamless, full-bleed, top-down tile in the base colour given. The base colour reaches every edge, and no motif comes within 12 percent of an edge, so the tile repeats without seams. Use two to four big, simple motifs at most, each a flat shape in the motif colour, at least 15 percent of the tile width across. Do not draw an outline around the tile.
```

```category ground-overlays
OVERLAY TILE: everything not described stays fully transparent. Every shape that reaches a tile edge is cut perfectly straight along that edge and centred exactly as described, so neighbouring tiles join. The boundary is one bold, simple flat stroke; the shapes are large and flat.
```

## Per-sprite notes

Wildcards are matched against the sprite id (`units/expert-lumberjack__none`). Add your own: they change only the sprites they match.

```match units/*__none,units/*__pioneer
The trade tool is the most important part of the figure: draw it about twice its natural size, with its working end (axe head, spade blade, hammer, net, sickle, cutlass) clearly separated from the head and body, set against the background.
```

```match units/expert-lumberjack__none
Make the axe head very large and clearly separated from the head: a broad, pale grey (#b9b2a6) blade with the thick outline, set against the background, on a long wooden (#a8743f) handle.
```

```match units/*__missionary
Give the missionary a white (#fffdf6) collar and a broad white sash across the dark cassock, so that the figure does not merge with its outline. The cross is large and pale wood (#a8743f), clearly above head height and separated from the body; the book is a small white shape.
```

```match units/*__soldier
The musket is a long, bold, dark wood and grey shape with a pale bayonet, held clear of the body; the white cross-belt is one bold white X or diagonal band.
```

```match units/*__dragoon,units/*__scout
The horse is one clear bay-brown silhouette with four separated legs and a dark mane; the rider sits clearly above it. The sabre or telescope is oversized and pale, set against the background.
```

```match units/*__pioneer
The spade and the pickaxe stick out clearly above the shoulder against the background; the back pack is one simple shape.
```
