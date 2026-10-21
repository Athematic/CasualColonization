# Redraw prompts for Edit-Images.ps1

`Edit-Images.ps1` reads this file. It sends each master to `POST /v1/images/edits` with a prompt built from these blocks. Edit the blocks freely. Every edit changes the prompt hash of the jobs that use the block, so the next run redraws them. The old takes move to `_replaced/`, unless you pass `-KeepChanged`.

Only fenced blocks are read; everything else in this file is notes. The order of the assembled prompt:

1. the `mode` block (`bold` or `pixel`)
2. the `background` block for the job's background (`transparent` or `opaque`, taken from the master's job)
3. every `category` block for the job's prompt-document category (`units`, `vehicles`, `ships`, `goods`, `terrain`, `ground-overlays`, `buildings`, `colonies`, `settlements`, ...), optionally limited to one mode
4. every `match` block whose wildcard matches the sprite id (`units/expert-lumberjack__none`), optionally limited to one mode
5. one `reference` line per attached image: the master always comes first, then the style bible, then the anchor if there is one
6. `SUBJECT OF IMAGE 1 (from its original prompt): ...`, the row text from `docs/SPRITE_PROMPTS.md`

Placeholders you can use in any block: `{N}` (grid cells per side), `{CELL}` (cell size in px), `{WIDTH}`, `{HEIGHT}` (output size), `{OUTLINE}` (3 to 4 percent of the width in px, e.g. "31 to 41"), `{PALETTE}` (the 12 bible colours), and `{INDEX}` (only in `reference` blocks, the image's position).

## Which categories get which modes

The keys are the folder categories under `output/sprites/` (the first part of the id); `boxart` is the cover art. `skip` categories are left out unless you name them with `-Category`. They then get `bold`, plus `pixel` if the master is transparent.

```modes
units: bold, pixel
goods: bold, pixel
buildings: bold, pixel
colonies: bold, pixel
settlements: bold, pixel
terrain: bold          # tiles stay full-bleed and tileable; no pixel grid
decor: skip
overlays: skip
ui: skip
bible: skip
boxart: skip           # covers are not needed small
```

## Mode: bold

The same subject and composition, redrawn so it survives a downscale to 24 to 64 px. The sprite pipeline then does the exact downscale.

```mode bold
Redraw image 1 as a small-size game sprite. It will be shrunk to 24 to 64 pixels, so design it for that size. Keep the same subject, the same pose and composition, the same viewing angle, the same colours, and the same clean-line European comic ("ligne claire") style. Make the image as a whole simpler and bolder.

LINES: one continuous, even, near-black (#1b1a17) outline around every shape. The line is much heavier than in image 1: {OUTLINE} pixels wide on this {WIDTH}-pixel image (3 to 4 percent of the width), with the same weight everywhere. Do not taper it, and draw no hairlines. Leave out interior lines except the few that explain the shape: where the arms and the body meet, the face, one line for a belt or sash, and the edges of a sail. Folds, stitching, planks, wood grain, individual leaves, hair strands and small buttons go.

SHAPES: enlarge the props (tools, weapons, the book, the cross, a telescope, cargo) to about 1.5 times their size in image 1, and hold them clear of the body, with a visible gap of background or of a light colour between the prop and the figure, so each one is a separate, readable silhouette. Merge small parts into larger, simpler shapes. Hands and feet are simple mitten and boot shapes. The face is a skin-coloured shape with two dot eyes at most.

COLOUR: flat fills only, from this palette wherever it fits: {PALETTE}. Keep the distinctive clothing colour of image 1 if it is not in the palette. No shading tones, no gradients, no highlights, no texture, no glow, no drop shadow. Dark areas such as a black hat, coat or boots are drawn in a dark charcoal that is clearly lighter than the outline, so the outline still separates them.

FRAMING: the silhouette fills the frame the way image 1 does (same size, same position, same ground line), so every redraw of the set has the same scale. Leave a margin of at least 5 percent on every side. Nothing is cut off.

DO NOT ADD: text, letters, numbers, a border, a frame, a background scene, a ground plane, a shadow, or anything that is not in image 1.
```

## Mode: pixel

The same subject as true pixel art on an exact grid, so that the sprite pipeline (`--grid N`) can read back the N×N sprite by sampling the cell centres.

```mode pixel
Redraw image 1 as a pixel-art game sprite of exactly {N} by {N} pixels, enlarged to fill this {WIDTH} by {HEIGHT} image. Each pixel of the sprite is one perfectly square, perfectly flat block of {CELL} by {CELL} image pixels, aligned to an invisible {N} by {N} grid that starts exactly at the top-left corner of the image. Each block has a single uniform colour: no anti-aliasing, no blur, no gradients, no dithering, no texture, no noise, no soft edges, no half blocks and no blocks of other sizes. Do not draw grid lines.

Keep the same subject, pose, viewing angle, colours and framing as image 1, simplified the way a skilled pixel artist would draw it at {N} by {N}: a 1-block-wide dark outline (#1b1a17) around the whole silhouette and around the main parts; props (tools, weapons, the cross, a telescope) at least 1 block thick, a little enlarged and held clear of the body; a face of 2 to 4 blocks with at most two dark dot eyes; and no detail smaller than one block.

Use a limited palette of at most 12 colours, taken from this list wherever it fits: {PALETTE}. Keep the distinctive clothing colour of image 1 if it is not in the list. Use no shading at all, or at most one darker block tone per colour. Dark clothing uses a charcoal that is clearly lighter than the outline.

The sprite fills the grid the way image 1 fills its frame, with at least one empty block of margin on every side. No text, no border, no background scene, no shadow.
```

## Background

```background transparent
BACKGROUND: fully transparent: real alpha, everything outside the silhouette (and outside the outline) is transparent. No painted checkerboard, no white or coloured backdrop, no ground shadow, no glow, no halo, no frame.
```

```background opaque
BACKGROUND: an opaque, full-bleed square: the image is filled edge to edge, with no border, frame, vignette or transparent area.
```

## Reference images

```reference master
Image {INDEX} is the original master to redraw. Keep its subject, pose, composition and colours.
```

```reference style
Image {INDEX} is the game's style bible. Use it only for the palette, the line style and the overall look. Do not copy any of its subjects or its layout.
```

```reference anchor
Image {INDEX} is an approved small-size redraw of another sprite in the same category. Match its line weight, how much it simplifies, its prop size and its framing exactly, but draw the subject of image 1, not the subject of this image.
```

## Category notes

These blocks are matched against the prompt-document category (the `category` block a sprite falls under in `docs/SPRITE_PROMPTS.md`). Ships are `ships` and wagons and guns are `vehicles`, although their ids start with `units/`.

```category units
FIGURE: the figure's head, hat and hands are large enough to read; the hat brim, collar, belt and boots each become one simple shape. The role's equipment dominates the silhouette: a musket with bayonet, a horse, a spade and pickaxe, a telescope or a cross, and it must stay clearly visible.
```

```category units pixel
At {N} by {N} the standing figure is about {N} blocks tall minus the margins; the head is about 3 to 4 blocks wide.
```

```category vehicles
VEHICLE: wheels are bold rings with at most four spokes, the body is one block shape, cargo is two or three simple boxes and barrels, and the horse is one clear silhouette with legs separated by gaps.
```

```category ships
SHIP: a bold hull outline with one darker wale band; simplified rigging, at most 3 lines for the masts and stays, no ratlines; sails are large flat white shapes with one outline each; at most one row of gun ports, drawn as simple dark squares. The masthead stays bare, with no flag. Keep the short wave-blue waterline stroke.
```

```category goods
ICON: one object, very bold, filling about 80 percent of the frame, with at most two interior lines. It must be recognisable at 18 pixels.
```

```category terrain
TILE: keep it a seamless, full-bleed top-down tile. The base colour reaches every edge, and no motif comes within 12 percent of an edge, so the tile repeats without seams. Use fewer and larger motifs (two to four), each a simple flat shape with the bold outline or a bold flat stroke. Do not add an outline around the tile.
```

```category ground-overlays
OVERLAY TILE: keep every shape that reaches a tile edge cut perfectly straight along that edge, in the same place as in image 1, so neighbouring tiles still join. Make the boundary line bold and simple.
```

```category buildings
BUILDING: one simple block for the walls and one for the roof, two to four dark windows as plain squares, one door. Leave out shingles, planks and bricks. A trade sign shows a large, simple pictogram.
```

```category colonies
SETTLEMENT: fewer, larger buildings, at most four houses, each a simple wall and roof shape; the flagpole is a bold single line with no flag; the ground patch is one flat shape with the bold outline.
```

```category settlements
SETTLEMENT: fewer, larger structures, each a simple shape in its true form (longhouse, tipi, pueblo block, temple); keep the accent colour on one or two large bands; the ground patch is one flat shape with the bold outline.
```

## Per-sprite notes

Wildcards are matched against the sprite id. Add your own lines here: they change only the sprites they match.

```match units/*__none,units/*__pioneer
The trade tool is the most important part of the figure: draw it large, with its working end (axe head, spade blade, hammer, net, sickle) clearly separated from the head and body.
```

```match units/expert-lumberjack__none
Make the axe head large and clearly separated from the head: a broad, pale grey (#b9b2a6) blade with a bold outline, set against the background, on a long wooden (#a8743f) handle.
```

```match units/*__missionary
Give the missionary a white (#fffdf6) collar and a white sash across the dark cassock, so that the figure does not merge with its outline. The cross is large and pale wood (#a8743f), clearly above the head height and separated from the body; the book is a small white shape.
```

```match units/*__soldier
The musket is a long, bold, dark wood and grey shape with a pale bayonet, held clear of the body; the white cross-belt is one bold white X or diagonal band.
```

```match units/*__dragoon,units/*__scout
The horse is one clear bay-brown silhouette with four separated legs and a dark mane; the rider sits clearly above it. The sabre or telescope is enlarged and pale, set against the background.
```

```match units/*__pioneer
The spade and the pickaxe stick out clearly above the shoulder against the background; the back pack is one simple shape.
```
