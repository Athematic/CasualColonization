# Sprite prompts: ligne claire bitmap art

This document is the complete prompt set for generating bitmap sprite art for Casual Colonization with OpenAI's image models. The look it aims for is *ligne claire*, the clean-line style of the classic Franco-Belgian adventure album, in the tradition of Hergé and Edgar P. Jacobs: even black outlines, flat bright colour, precise ships and buildings, simplified but believable people.

The style descriptions below never name artists, characters or albums. Image models may ignore or refuse named-artist requests, and we must not reproduce copyrighted characters, so the look is pinned with concrete visual traits only. Never add names such as Tintin, Snowy, Haddock, Blake or Mortimer to any prompt, and never ask for real logos, trademarks or national coats of arms.

The prompts are written for a future `ligne-claire-bitmap` style plugin (see [STYLE_PLUGINS.md](STYLE_PLUGINS.md)). It would load these PNGs instead of drawing procedurally, and fall back to the procedural `ligne-claire` drawing for anything missing. The colours come from `packages/style-ligne-claire/src/palette.ts`, so bitmap art and the existing procedural art sit together without clashing.

Contents:

1. [Goal and how to use this document](#1-goal-and-how-to-use-this-document)
2. [Master style block](#2-master-style-block)
3. [Design decisions](#3-design-decisions)
4. [Per-asset prompts](#4-per-asset-prompts)
5. [Output specs and folder layout](#5-output-specs-and-folder-layout)
6. [Batch generation scripts](#6-batch-generation-scripts)
7. [QA checklist and fixing drift](#7-qa-checklist-and-fixing-drift)

---

## 1. Goal and how to use this document

### Model and settings

| Setting | Value | Why |
| --- | --- | --- |
| Model | `gpt-image-1`, or a newer model in the same family if your account has one | Native transparent backgrounds, an edit endpoint that accepts reference images, and good instruction following for long style blocks. |
| Endpoint | `images.generate` for the style bible; `images.edit` with the style bible as a reference for everything else | The edit endpoint is how you keep a series consistent; see below. |
| `size` | `1024x1024` for almost everything; `1536x1024` for the style bible, the title emblem and the caption frame | Square masters downscale cleanly to the square runtime sizes. |
| `background` | `"transparent"` for sprites, icons and overlays; `"opaque"` for base terrain tiles | Terrain tiles must be full-bleed; everything else is composited on the map. |
| `output_format` | `"png"` | Transparency needs PNG (or WebP). |
| `quality` | `"high"` for final masters; `"medium"` or `"low"` while exploring | High quality gives cleaner, more even outlines. Low is roughly ten times cheaper and is fine for trying prompts. |
| `n` | 1 (2 to 4 while exploring) | Generate a few, keep the best, discard the rest. |
| `input_fidelity` | `"high"` on edits, where supported | Makes the model stick more closely to the reference sheet's line and colour. |

DALL·E 3 also works in a pinch, but it is a poor fit here. It has no transparent background, no reference images, and it rewrites your prompt, which causes style drift. If you have to use it, ask for a flat `#f5eedc` background and key that colour out afterwards.

Neither model takes a seed. The same prompt gives a different picture every time, and you cannot regenerate an old image exactly, so **commit every approved master** (see section 5). Consistency comes from the shared style text, from reference images and from post-processing, not from seeds.

Approximate cost (check current pricing): a 1024×1024 image costs about $0.17 at high quality, $0.04 at medium and $0.01 at low. The whole set below is about 300 images. With retakes, budget around $80 at high quality.

### One asset per call, or sprite sheets?

**One asset per call** (recommended for the final art)

- Pros: every file is framed, named and sized exactly as the game loads it, with a clean transparent background, and you can redo one asset without touching the others.
- Cons: more calls, and each call drifts slightly in line weight and scale, which the style bible, the anchors and the normalising step (section 6) correct.

**Sprite sheets** (several subjects in one image)

- Pros: within one sheet, line weight, palette and scale are very consistent, and it takes fewer calls.
- Cons: the model does not keep to a grid. Cells come out at uneven sizes and positions, and subjects overlap or get cropped. Each subject only gets part of the resolution (a 3×2 grid on 1536×1024 gives about 450 px per cell), labels and numbers creep in, and you have to slice the sheet by hand or by script.

**Recommendation:** use sheets for exploration and for the style bible, and one call per asset for the final masters. One useful middle way is a 3×2 sheet holding the six role variants of one colonist type. It keeps the same face and coat across roles, at the price of slicing it afterwards. Section 6 notes where that fits.

### Keeping a series consistent

1. **Paste the master style block into every prompt.** The script does this automatically: final prompt = master block + category block + `SUBJECT:` line.
2. **Generate a style bible first.** Section 4.1 has the prompt. It is one sheet with a dozen representative subjects (a colonist, a soldier, a rider, two ships, a house, trees, a hill, a mountain, a crate, a barrel) and a row of palette swatches. Make 4 to 8 attempts and pick the best. Fix any flaws with an edit or in a paint program. This sheet is now the visual contract for everything else.
3. **Use the bible as a reference image.** Generate every other asset with `images.edit`, passing the bible (and optionally a category anchor, below) as `image`. Each prompt then opens with an instruction to copy only the style of the reference and draw a new single subject. `gpt-image-1` accepts several reference images per call.
4. **Approve one anchor per category.** Once the first unit (`free-colonist__none`), the first ship (`frigate__none`), the first terrain tile, the first good and the first building look right, copy each one to `art/anchors/<category>.png`. The script then adds it as a second reference for that category. Siblings inherit its exact scale and line weight.
5. **Normalise after generation.** The script trims the transparent border and fits each subject into a fixed box per category (section 5). This corrects most scale drift automatically.
6. **Review in batches**, using the QA checklist in section 7, and regenerate or edit outliers right away, before they become the reference for later work.

---

## 2. Master style block

Paste this, unchanged, at the top of every prompt. The build script in section 6 reads it from this fenced block, so keep the `master` tag on the fence.

```master
STYLE: clean-line European comic illustration ("ligne claire") as in a classic 1950s adventure comic album, adapted for a strategy-game sprite.

LINE: Every shape is enclosed by one continuous, unbroken outline in near-black ink (#1b1a17). All lines have the same constant weight, bold enough to survive heavy downscaling: about 2.5 to 3 percent of the image width (roughly 24 to 32 pixels on a 1024-pixel image). No tapering, no thick-and-thin brush lines, no sketchy, doubled or broken lines. Interior detail lines are few and use the same weight.

COLOUR: Flat, solid colour fills only, bright and clear like printed comic colours. No gradients, no airbrush, no soft shading, no surface texture, no hatching, no cross-hatching, no stippling, no halftone dots. At most one flat, hard-edged shadow tone (the same hue about 15 percent darker) on surfaces turned away from the light; most shapes have none. No cast shadows, no glow, no rim light. A rare small flat white glint on metal or glass is allowed.

DRAWING: Clean, legible, iconic silhouettes that read clearly when shrunk to 32 pixels. Objects, vehicles, ships, buildings and weapons are drawn precisely, with realistic proportions, like a carefully researched technical illustration: correct rigging and sails, planking, roof lines, wheel spokes, gun carriages. Human figures are slightly simplified but realistically proportioned (about seven heads tall, not chibi, not exaggerated), with simple dot eyes, small noses and calm expressions. Setting: the Americas and the Atlantic, 1600 to 1780.

VIEW: Orthographic projection, no perspective convergence. Free-standing subjects are seen from a high three-quarter front view: the viewer is to the south looking north, raised about 30 degrees above the horizon, so the front faces and a sliver of the top surfaces (roofs, decks, saddles, crate lids) are visible. People, animals, vehicles and ships face three-quarter to the right. Light comes from the upper left.

PALETTE (use these exact colours wherever they apply): ink outline #1b1a17; paper #f5eedc; white #fffdf6; skin #f3c9a0; roof red #d23c2a; slate-blue roof #3a6fb0; cream wall #fbf3df; wood #a8743f; dark wood and tree trunks #8a5a32; light timber #c8955a; stone #b9b2a6; sail canvas #fffaf0; ship hull #9a5b2e; iron #9aa0a6; gunmetal #55585c; gold #ffd23f; highlight yellow #ffd84a; bay horse #9b6a3e; road earth #b9844c; shallow water #8ed0ec; deep water #64b2df; wave lines #3a80b4; foliage greens #58a548, #3d8a4c, #78b84e, #4fa042, #5d9b5c, #3c7e50, #93ad5e, #3b7a60. Keep saturation and brightness close to these; no muddy, greyed or neon colours.

FRAMING: Exactly one subject, centred horizontally, entirely inside the frame with an empty margin of at least 6 percent on every side; nothing cropped, nothing touching the image edges. Free-standing subjects stand on an invisible ground line at 88 percent of the image height. Transparent background unless told otherwise: no ground plane, no scenery, no backdrop, no frame or border.

DO NOT INCLUDE: any text, letters, numbers, labels, captions, signatures, logos, coats of arms, watermarks; photorealism; 3D render, CGI, clay or plastic look; gradients, airbrush, painterly or watercolour texture, thick brush strokes; hatching or cross-hatching; anime, manga, pixel-art or flat corporate vector style; drop shadows; motion lines; extra subjects; any recognisable existing comic character.
```

When an asset is generated with a reference image (the normal case), the script prepends this short preamble:

> The attached image(s) are a style reference sheet. Copy their line weight, flat colouring, palette, viewpoint and level of detail exactly, but draw only the single new subject described below, not anything from the sheet.

---

## 3. Design decisions

### Viewpoint and lighting

The map is a top-down grid of square tiles (`tileToScreen` in `packages/render-api`). The existing procedural style already mixes two views, and the bitmap art keeps that split:

- **Ground surfaces** (base terrain, plowed fields, roads, coast bands) are **strictly top-down orthographic**, so they tile on the square grid.
- **Everything standing on the ground** (units, ships, trees, hills, mountains, ruins, colonies, settlements, building icons) uses the **high three-quarter front view**: seen from the south, about 30° above the horizon, parallel projection. This is the classic strategy-game convention. It reads well on a top-down map, sprites can overlap the tile above them (the renderer already paints row by row), and silhouettes stay recognisable.
- People, animals, vehicles and ships **face three-quarter right**. A renderer may mirror a sprite horizontally for units moving west. Because nothing has lettering, mirroring is safe.
- **Light comes from the upper left.** Ligne claire uses almost no shading. At most there is one flat, darker tone on faces turned away from the light, as on the procedural hills, and there are never cast shadows. The renderer already draws its own selection ellipse under units.

### Nation ownership: neutral sprites plus a tinted pennant

**Decision:** every unit, ship and colony sprite is **nation-neutral**. Ownership is shown by small **overlay sprites** (a pennant, a colony flag and a mission marker), generated once with pure white cloth and tinted to the nation colour at runtime.

Why:

- **Asset count.** Colonists × roles alone is 161 sprites. Baking in nation colours would multiply that by 9 nations (8 plus the Crown), giving about 1,450 images, each drifting a little.
- **Colour accuracy.** Image models only approximate hex codes. Nine nation colours that must match exactly (`NATIONS[*].color`: England `#c8202e`, France `#1f4fa3`, Netherlands `#e8820c`, Spain `#e6b800`, Portugal `#0f7a3c`, Sweden `#3d8fd1`, Denmark `#b0306a`, Russia `#5a3d8a`, Crown `#6d1f3a`) are far more reliable as a runtime tint than as generated paint.
- **It is how the game already reads.** The procedural renderer already draws an owner-coloured pennant beside each unit stack, with a state letter or stack count. Bitmap units slot straight into that.
- **Independence and the Crown are already distinct.** King's Regulars (red coats) and Continental soldiers (blue and buff) only ever belong to one side, so their uniforms are baked into the sprite.

Tinting is exact and simple. The pennant's cloth is drawn in white (`#fffdf6`), so a multiply blend keeps the ink black and turns the cloth into exactly the nation colour:

```ts
// Tint a white-cloth overlay to a nation colour, keeping the ink outline.
function tinted(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; // restore the original alpha
  g.drawImage(img, 0, 0);
  return c; // cache per (overlay, nation)
}
```

Ship sprites leave the masthead bare, and colony sprites have an empty flagpole. The renderer draws the tinted pennant or flag at a fixed anchor (masthead at about 50% x, 14% y; colony flagpole top at about 60% x, 22% y; check these against the approved anchors). The privateer is the one exception: it flies no colours, which is the point of a privateer.

### Sizes

The camera zoom runs from **20 to 128 CSS px per tile** (`apps/web/src/app.ts`). Icons are drawn at **18 to 72 CSS px** (goods at 18 to 30, units at 28 to 72, building icons at about 40). With a device pixel ratio of 2, that means up to 256 device px per tile and 144 px per icon.

- Generate **1024×1024 masters** and keep them in `art/masters/`.
- Ship map sprites (units, terrain, decorations, colonies, settlements, overlays) at **256 px**, plus pre-scaled **@128, @64 and @32** copies. Icons (goods, buildings) ship at **128 px** plus **@64 and @32**. Browsers downscale large bitmaps badly, and an ink line that is 6 px at 256 px vanishes when the canvas squeezes it to 20 px. Pre-scaling with a good filter, and picking the nearest size at draw time, keeps the line visible.
- At the very smallest sizes (tiles under about 28 px, icons under 20 px), the procedural `ligne-claire` drawing is often crisper than any bitmap. A bitmap plugin can fall back to it there.

### Terrain: full-bleed tiles with procedural coastlines (no blob transition sets)

**Decision:** base tiles are **opaque, full-bleed squares of flat colour**, with a few small motifs (grass tufts, wave strokes, pebbles) kept **at least 12% away from every edge**. Because each edge is pure flat colour, any tile sits seamlessly next to a copy of itself, with no seam fixing. Where two terrain types meet, the change is a hard, flat colour boundary, which is exactly the ligne claire look. The renderer keeps drawing its faint 18%-ink border there, as it does now.

**Coastlines stay procedural.** The current renderer clips land to a rounded `landPath` and strokes an even ink coastline (`coastPath`). Keep that: clip the bitmap land tile to the same path and stroke the same line on top. A vector stroke matches the outline weight at every zoom level. A bitmap transition set would need 47 "blob" pieces per terrain pair, about 600 images that the model cannot draw consistently.

**Optional coast bands.** For a little more richness, three small transparent overlays (sections 4.5 and 4.6) add a band of paler shallow water along the shoreline. They are drawn on water tiles under the procedural coastline and rotated in 90° steps. They are cheap and safe to skip.

Forest is an **overlay** (a clump of trees drawn over the base tile), not a separate base tile. That matches the engine (`tile.f` on a base terrain) and the current renderer.

---

## 4. Per-asset prompts

### How the tables work

Each table row is one PNG to generate:

| Column | Meaning |
| --- | --- |
| File | Path without extension, relative to `art/masters/` and to the plugin's `assets/` folder. Names are the engine ids in kebab-case (`freeColonist` becomes `free-colonist`, `manOfWar` becomes `man-of-war`), with `__` before a variant (role, level, size). |
| Size | The `size` to request. |
| BG | The `background` to request. |
| Prompt | The subject line, appended after the master block and the category block of its section. |

The build script (section 6) parses every row of the form ``| `file` | WxH | transparent-or-opaque | prompt |`` and uses the nearest `category` block above it. Keep prompts on one line and free of the `|` character.

### 4.1 Style bible

```category bible
FORMAT: A single model sheet on a flat paper-coloured (#f5eedc) background, laid out as a loose grid of separate subjects with generous space between them, all drawn at the same scale and with the same line weight. No grid lines, no labels, no numbers. This sheet will be used as the style reference for an entire game's art.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `bible/style-bible` | 1536x1024 | opaque | Top row, left to right: a colonist in a plain brown coat and broad-brimmed hat; a soldier in a grey coat with white cross-belts, tricorn and shouldered musket; a rider on a bay horse; a small two-masted caravel with lateen sails; a three-masted frigate with square sails and a row of gun ports. Middle row: a cream timber house with a red gabled roof; a round deciduous tree; a conifer; a pair of grassy hills in two flat tones; a rocky mountain with a white snow cap. Bottom row: a wooden crate, a barrel with iron hoops, a sheaf of wheat, a flintlock musket lying diagonally, then a row of twelve plain square colour swatches in #1b1a17, #fffdf6, #f3c9a0, #d23c2a, #3a6fb0, #fbf3df, #a8743f, #b9b2a6, #9a5b2e, #ffd23f, #8ed0ec, #58a548, each with an ink outline. |

### 4.2 Units: colonists and their roles

```category units
FORMAT: A single game unit sprite. Full figure, three-quarter view facing right, standing on the invisible ground line at 88 percent of the image height. A standing figure is about 74 percent of the image height tall (head top near 14 percent). A mounted figure (horse and rider) is about 80 percent of the image width wide and 76 percent of the image height tall. No nation colours, flags, cockades or badges unless described: ownership is added later by the game. Every colonist type has its own clothing colour so that types stay distinguishable when small.
```

There are 27 colonist types, and each can take any of the six roles (`none`, `soldier`, `dragoon`, `pioneer`, `scout`, `missionary`). The one exception is the native convert, which the engine forbids from becoming a missionary (`colony.ts`). That makes 161 sprites. Every row below is built from two parts, so a new expert can be added the same way:

- **Figure:** who it is, their clothing and hat, and the tool they carry only when unequipped (role `none`). The clothing colours are the per-type coat colours from `COATS` in `sprites.ts`.
- **Role:** pose and equipment. The role dominates the silhouette (musket, horse, spade, telescope, cross), while the clothing keeps the type recognisable. Militia (non-soldier types under arms) keep their own clothes and add a tricorn and a cross-belt. The three uniformed types (veteran, Continental, King's Regular) keep their uniform in every role.

| Role | Pose and equipment |
| --- | --- |
| `none` | Standing, relaxed working pose, holding the trade tool. |
| `soldier` | At attention, flintlock with fixed bayonet at shoulder arms. Militia add a black tricorn, a white cross-belt and a cartridge box. |
| `dragoon` | Mounted on a bay horse walking right, sabre raised, carbine slung. Militia add a tricorn and cross-belts. |
| `pioneer` | Striding, spade and pickaxe over the shoulder, rope and saw on a back pack. |
| `scout` | Mounted on a bay horse trotting right, holding a brass telescope, with saddlebags. |
| `missionary` | Standing calmly in a long black cassock-like coat and wide black hat, with a staff cross and a book. |

#### freeColonist

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/free-colonist__none` | 1024x1024 | transparent | a free colonist, a sturdy young man, full body, standing in a relaxed working pose. Clothing: plain brown coat (#7c6a4f), off-white shirt, dark brown breeches, grey stockings, buckled shoes, broad-brimmed dark brown felt hat (#4a3a28). Carries a small cloth bundle tied to a walking staff over one shoulder. |
| `units/free-colonist__soldier` | 1024x1024 | transparent | a free colonist, a sturdy young man, serving as a militia soldier, full body, standing at attention. Own civilian clothing: plain brown coat (#7c6a4f), off-white shirt, dark brown breeches, grey stockings, buckled shoes; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/free-colonist__dragoon` | 1024x1024 | transparent | a free colonist, a sturdy young man, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: plain brown coat (#7c6a4f), off-white shirt, dark brown breeches, grey stockings, buckled shoes; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/free-colonist__pioneer` | 1024x1024 | transparent | a free colonist, a sturdy young man, working as a pioneer, full body, striding forward. Clothing: plain brown coat (#7c6a4f), off-white shirt, dark brown breeches, grey stockings, buckled shoes, broad-brimmed dark brown felt hat (#4a3a28). A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/free-colonist__scout` | 1024x1024 | transparent | a free colonist, a sturdy young man, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: plain brown coat (#7c6a4f), off-white shirt, dark brown breeches, grey stockings, buckled shoes, broad-brimmed dark brown felt hat (#4a3a28). Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/free-colonist__missionary` | 1024x1024 | transparent | a free colonist, a sturdy young man, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a free colonist. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### indenturedServant

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/indentured-servant__none` | 1024x1024 | transparent | an indentured servant, a young labourer, full body, standing in a relaxed working pose. Clothing: faded beige-grey work smock (#9a8c74) with rolled sleeves, patched breeches, bare legs below the knee, simple linen cap, no hat brim. Carries a wooden bucket in one hand. |
| `units/indentured-servant__soldier` | 1024x1024 | transparent | an indentured servant, a young labourer, serving as a militia soldier, full body, standing at attention. Own civilian clothing: faded beige-grey work smock (#9a8c74) with rolled sleeves, patched breeches, bare legs below the knee; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/indentured-servant__dragoon` | 1024x1024 | transparent | an indentured servant, a young labourer, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: faded beige-grey work smock (#9a8c74) with rolled sleeves, patched breeches, bare legs below the knee; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/indentured-servant__pioneer` | 1024x1024 | transparent | an indentured servant, a young labourer, working as a pioneer, full body, striding forward. Clothing: faded beige-grey work smock (#9a8c74) with rolled sleeves, patched breeches, bare legs below the knee, simple linen cap, no hat brim. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/indentured-servant__scout` | 1024x1024 | transparent | an indentured servant, a young labourer, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: faded beige-grey work smock (#9a8c74) with rolled sleeves, patched breeches, bare legs below the knee, simple linen cap, no hat brim. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/indentured-servant__missionary` | 1024x1024 | transparent | an indentured servant, a young labourer, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an indentured servant. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### pettyCriminal

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/petty-criminal__none` | 1024x1024 | transparent | a petty criminal, a thin unshaven man, full body, standing in a relaxed working pose. Clothing: ill-fitting patched grey coat (#8d8d86) with a torn sleeve, rope belt, scuffed breeches, bare head with untidy hair. Carries his hands in his pockets, shoulders hunched. |
| `units/petty-criminal__soldier` | 1024x1024 | transparent | a petty criminal, a thin unshaven man, serving as a militia soldier, full body, standing at attention. Own civilian clothing: ill-fitting patched grey coat (#8d8d86) with a torn sleeve, rope belt, scuffed breeches; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/petty-criminal__dragoon` | 1024x1024 | transparent | a petty criminal, a thin unshaven man, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: ill-fitting patched grey coat (#8d8d86) with a torn sleeve, rope belt, scuffed breeches; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/petty-criminal__pioneer` | 1024x1024 | transparent | a petty criminal, a thin unshaven man, working as a pioneer, full body, striding forward. Clothing: ill-fitting patched grey coat (#8d8d86) with a torn sleeve, rope belt, scuffed breeches, bare head with untidy hair. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/petty-criminal__scout` | 1024x1024 | transparent | a petty criminal, a thin unshaven man, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: ill-fitting patched grey coat (#8d8d86) with a torn sleeve, rope belt, scuffed breeches, bare head with untidy hair. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/petty-criminal__missionary` | 1024x1024 | transparent | a petty criminal, a thin unshaven man, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a petty criminal. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### expertFarmer

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/expert-farmer__none` | 1024x1024 | transparent | an expert farmer, full body, standing in a relaxed working pose. Clothing: green waistcoat (#5e9c3d) over a white shirt with rolled sleeves, brown breeches, wide straw hat (#ecdc8e). Carries a wooden pitchfork and a sheaf of golden wheat (#f2c43a). |
| `units/expert-farmer__soldier` | 1024x1024 | transparent | an expert farmer serving as a militia soldier, full body, standing at attention. Own civilian clothing: green waistcoat (#5e9c3d) over a white shirt with rolled sleeves, brown breeches; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/expert-farmer__dragoon` | 1024x1024 | transparent | an expert farmer serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: green waistcoat (#5e9c3d) over a white shirt with rolled sleeves, brown breeches; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/expert-farmer__pioneer` | 1024x1024 | transparent | an expert farmer working as a pioneer, full body, striding forward. Clothing: green waistcoat (#5e9c3d) over a white shirt with rolled sleeves, brown breeches, wide straw hat (#ecdc8e). A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/expert-farmer__scout` | 1024x1024 | transparent | an expert farmer as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: green waistcoat (#5e9c3d) over a white shirt with rolled sleeves, brown breeches, wide straw hat (#ecdc8e). Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/expert-farmer__missionary` | 1024x1024 | transparent | an expert farmer serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an expert farmer. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### expertFisherman

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/expert-fisherman__none` | 1024x1024 | transparent | an expert fisherman, full body, standing in a relaxed working pose. Clothing: blue knitted smock (#3f7ca8), canvas trousers rolled to the calf, knitted cap. Carries a folded fishing net over one shoulder and a single silver fish in one hand. |
| `units/expert-fisherman__soldier` | 1024x1024 | transparent | an expert fisherman serving as a militia soldier, full body, standing at attention. Own civilian clothing: blue knitted smock (#3f7ca8), canvas trousers rolled to the calf; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/expert-fisherman__dragoon` | 1024x1024 | transparent | an expert fisherman serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: blue knitted smock (#3f7ca8), canvas trousers rolled to the calf; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/expert-fisherman__pioneer` | 1024x1024 | transparent | an expert fisherman working as a pioneer, full body, striding forward. Clothing: blue knitted smock (#3f7ca8), canvas trousers rolled to the calf, knitted cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/expert-fisherman__scout` | 1024x1024 | transparent | an expert fisherman as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: blue knitted smock (#3f7ca8), canvas trousers rolled to the calf, knitted cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/expert-fisherman__missionary` | 1024x1024 | transparent | an expert fisherman serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an expert fisherman. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### expertFurTrapper

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/expert-fur-trapper__none` | 1024x1024 | transparent | an expert fur trapper, full body, standing in a relaxed working pose. Clothing: fringed buckskin hunting coat (#8a5a32), leather leggings, round fur cap. Carries a steel leg-hold trap on a chain and two pelts slung over the shoulder. |
| `units/expert-fur-trapper__soldier` | 1024x1024 | transparent | an expert fur trapper serving as a militia soldier, full body, standing at attention. Own civilian clothing: fringed buckskin hunting coat (#8a5a32), leather leggings; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/expert-fur-trapper__dragoon` | 1024x1024 | transparent | an expert fur trapper serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: fringed buckskin hunting coat (#8a5a32), leather leggings; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/expert-fur-trapper__pioneer` | 1024x1024 | transparent | an expert fur trapper working as a pioneer, full body, striding forward. Clothing: fringed buckskin hunting coat (#8a5a32), leather leggings, round fur cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/expert-fur-trapper__scout` | 1024x1024 | transparent | an expert fur trapper as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: fringed buckskin hunting coat (#8a5a32), leather leggings, round fur cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/expert-fur-trapper__missionary` | 1024x1024 | transparent | an expert fur trapper serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an expert fur trapper. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### expertSilverMiner

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/expert-silver-miner__none` | 1024x1024 | transparent | an expert silver miner, full body, standing in a relaxed working pose. Clothing: blue-grey work coat (#9aa3ad), leather apron, leather miner's hood. Carries a short pick and a gleaming lump of silver ore (#dfe4ea), a small iron lantern at the belt. |
| `units/expert-silver-miner__soldier` | 1024x1024 | transparent | an expert silver miner serving as a militia soldier, full body, standing at attention. Own civilian clothing: blue-grey work coat (#9aa3ad), leather apron; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/expert-silver-miner__dragoon` | 1024x1024 | transparent | an expert silver miner serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: blue-grey work coat (#9aa3ad), leather apron; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/expert-silver-miner__pioneer` | 1024x1024 | transparent | an expert silver miner working as a pioneer, full body, striding forward. Clothing: blue-grey work coat (#9aa3ad), leather apron, leather miner's hood. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/expert-silver-miner__scout` | 1024x1024 | transparent | an expert silver miner as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: blue-grey work coat (#9aa3ad), leather apron, leather miner's hood. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/expert-silver-miner__missionary` | 1024x1024 | transparent | an expert silver miner serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an expert silver miner. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### expertLumberjack

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/expert-lumberjack__none` | 1024x1024 | transparent | an expert lumberjack, broad-shouldered, full body, standing in a relaxed working pose. Clothing: red wool shirt (#b0402c), braces, heavy brown trousers, knitted cap. Carries a long felling axe resting on one shoulder. |
| `units/expert-lumberjack__soldier` | 1024x1024 | transparent | an expert lumberjack, broad-shouldered, serving as a militia soldier, full body, standing at attention. Own civilian clothing: red wool shirt (#b0402c), braces, heavy brown trousers; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/expert-lumberjack__dragoon` | 1024x1024 | transparent | an expert lumberjack, broad-shouldered, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: red wool shirt (#b0402c), braces, heavy brown trousers; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/expert-lumberjack__pioneer` | 1024x1024 | transparent | an expert lumberjack, broad-shouldered, working as a pioneer, full body, striding forward. Clothing: red wool shirt (#b0402c), braces, heavy brown trousers, knitted cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/expert-lumberjack__scout` | 1024x1024 | transparent | an expert lumberjack, broad-shouldered, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: red wool shirt (#b0402c), braces, heavy brown trousers, knitted cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/expert-lumberjack__missionary` | 1024x1024 | transparent | an expert lumberjack, broad-shouldered, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an expert lumberjack. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### expertOreMiner

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/expert-ore-miner__none` | 1024x1024 | transparent | an expert ore miner, full body, standing in a relaxed working pose. Clothing: dark grey work smock (#6a6a6a), heavy boots, leather cap. Carries a pickaxe and a wicker basket of grey ore (#8d8f94). |
| `units/expert-ore-miner__soldier` | 1024x1024 | transparent | an expert ore miner serving as a militia soldier, full body, standing at attention. Own civilian clothing: dark grey work smock (#6a6a6a), heavy boots; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/expert-ore-miner__dragoon` | 1024x1024 | transparent | an expert ore miner serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: dark grey work smock (#6a6a6a), heavy boots; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/expert-ore-miner__pioneer` | 1024x1024 | transparent | an expert ore miner working as a pioneer, full body, striding forward. Clothing: dark grey work smock (#6a6a6a), heavy boots, leather cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/expert-ore-miner__scout` | 1024x1024 | transparent | an expert ore miner as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: dark grey work smock (#6a6a6a), heavy boots, leather cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/expert-ore-miner__missionary` | 1024x1024 | transparent | an expert ore miner serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an expert ore miner. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterSugarPlanter

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-sugar-planter__none` | 1024x1024 | transparent | a master sugar planter, full body, standing in a relaxed working pose. Clothing: light cream linen coat (#e8e0c8), white shirt, wide straw hat. Carries a bundle of green sugar cane stalks under one arm and a cane knife. |
| `units/master-sugar-planter__soldier` | 1024x1024 | transparent | a master sugar planter serving as a militia soldier, full body, standing at attention. Own civilian clothing: light cream linen coat (#e8e0c8), white shirt; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-sugar-planter__dragoon` | 1024x1024 | transparent | a master sugar planter serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: light cream linen coat (#e8e0c8), white shirt; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-sugar-planter__pioneer` | 1024x1024 | transparent | a master sugar planter working as a pioneer, full body, striding forward. Clothing: light cream linen coat (#e8e0c8), white shirt, wide straw hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-sugar-planter__scout` | 1024x1024 | transparent | a master sugar planter as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: light cream linen coat (#e8e0c8), white shirt, wide straw hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-sugar-planter__missionary` | 1024x1024 | transparent | a master sugar planter serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master sugar planter. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterCottonPlanter

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-cotton-planter__none` | 1024x1024 | transparent | a master cotton planter, full body, standing in a relaxed working pose. Clothing: white linen coat (#f2efe6), pale waistcoat, wide straw hat. Carries a woven basket brimming with white cotton bolls. |
| `units/master-cotton-planter__soldier` | 1024x1024 | transparent | a master cotton planter serving as a militia soldier, full body, standing at attention. Own civilian clothing: white linen coat (#f2efe6), pale waistcoat; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-cotton-planter__dragoon` | 1024x1024 | transparent | a master cotton planter serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: white linen coat (#f2efe6), pale waistcoat; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-cotton-planter__pioneer` | 1024x1024 | transparent | a master cotton planter working as a pioneer, full body, striding forward. Clothing: white linen coat (#f2efe6), pale waistcoat, wide straw hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-cotton-planter__scout` | 1024x1024 | transparent | a master cotton planter as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: white linen coat (#f2efe6), pale waistcoat, wide straw hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-cotton-planter__missionary` | 1024x1024 | transparent | a master cotton planter serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master cotton planter. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterTobaccoPlanter

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-tobacco-planter__none` | 1024x1024 | transparent | a master tobacco planter, full body, standing in a relaxed working pose. Clothing: tan coat (#a2733d), cream waistcoat, broad-brimmed brown hat. Carries a hanging bundle of large olive-gold tobacco leaves (#9a8a3a). |
| `units/master-tobacco-planter__soldier` | 1024x1024 | transparent | a master tobacco planter serving as a militia soldier, full body, standing at attention. Own civilian clothing: tan coat (#a2733d), cream waistcoat; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-tobacco-planter__dragoon` | 1024x1024 | transparent | a master tobacco planter serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: tan coat (#a2733d), cream waistcoat; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-tobacco-planter__pioneer` | 1024x1024 | transparent | a master tobacco planter working as a pioneer, full body, striding forward. Clothing: tan coat (#a2733d), cream waistcoat, broad-brimmed brown hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-tobacco-planter__scout` | 1024x1024 | transparent | a master tobacco planter as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: tan coat (#a2733d), cream waistcoat, broad-brimmed brown hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-tobacco-planter__missionary` | 1024x1024 | transparent | a master tobacco planter serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master tobacco planter. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterCarpenter

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-carpenter__none` | 1024x1024 | transparent | a master carpenter, full body, standing in a relaxed working pose. Clothing: ochre waistcoat (#c08a3e) over a white shirt, long leather apron, brown cap. Carries a wooden mallet and a large carpenter's square. |
| `units/master-carpenter__soldier` | 1024x1024 | transparent | a master carpenter serving as a militia soldier, full body, standing at attention. Own civilian clothing: ochre waistcoat (#c08a3e) over a white shirt, long leather apron; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-carpenter__dragoon` | 1024x1024 | transparent | a master carpenter serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: ochre waistcoat (#c08a3e) over a white shirt, long leather apron; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-carpenter__pioneer` | 1024x1024 | transparent | a master carpenter working as a pioneer, full body, striding forward. Clothing: ochre waistcoat (#c08a3e) over a white shirt, long leather apron, brown cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-carpenter__scout` | 1024x1024 | transparent | a master carpenter as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: ochre waistcoat (#c08a3e) over a white shirt, long leather apron, brown cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-carpenter__missionary` | 1024x1024 | transparent | a master carpenter serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master carpenter. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterBlacksmith

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-blacksmith__none` | 1024x1024 | transparent | a master blacksmith, muscular, full body, standing in a relaxed working pose. Clothing: charcoal shirt (#3f3f3f) with rolled sleeves, heavy leather apron, bare forearms. Carries a smith's hammer and a pair of iron tongs holding a horseshoe. |
| `units/master-blacksmith__soldier` | 1024x1024 | transparent | a master blacksmith, muscular, serving as a militia soldier, full body, standing at attention. Own civilian clothing: charcoal shirt (#3f3f3f) with rolled sleeves, heavy leather apron, bare forearms; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-blacksmith__dragoon` | 1024x1024 | transparent | a master blacksmith, muscular, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: charcoal shirt (#3f3f3f) with rolled sleeves, heavy leather apron, bare forearms; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-blacksmith__pioneer` | 1024x1024 | transparent | a master blacksmith, muscular, working as a pioneer, full body, striding forward. Clothing: charcoal shirt (#3f3f3f) with rolled sleeves, heavy leather apron, bare forearms. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-blacksmith__scout` | 1024x1024 | transparent | a master blacksmith, muscular, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: charcoal shirt (#3f3f3f) with rolled sleeves, heavy leather apron, bare forearms. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-blacksmith__missionary` | 1024x1024 | transparent | a master blacksmith, muscular, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master blacksmith. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterGunsmith

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-gunsmith__none` | 1024x1024 | transparent | a master gunsmith, full body, standing in a relaxed working pose. Clothing: olive coat (#4e5a3a), leather apron, small round spectacles, brown hat. Carries a flintlock musket held across the body for inspection and a small file. |
| `units/master-gunsmith__soldier` | 1024x1024 | transparent | a master gunsmith serving as a militia soldier, full body, standing at attention. Own civilian clothing: olive coat (#4e5a3a), leather apron, small round spectacles; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-gunsmith__dragoon` | 1024x1024 | transparent | a master gunsmith serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: olive coat (#4e5a3a), leather apron, small round spectacles; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-gunsmith__pioneer` | 1024x1024 | transparent | a master gunsmith working as a pioneer, full body, striding forward. Clothing: olive coat (#4e5a3a), leather apron, small round spectacles, brown hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-gunsmith__scout` | 1024x1024 | transparent | a master gunsmith as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: olive coat (#4e5a3a), leather apron, small round spectacles, brown hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-gunsmith__missionary` | 1024x1024 | transparent | a master gunsmith serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master gunsmith. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterDistiller

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-distiller__none` | 1024x1024 | transparent | a master distiller, full body, standing in a relaxed working pose. Clothing: russet coat (#7a3e22), white apron, brown cap. Carries a small wooden cask under one arm and a copper ladle. |
| `units/master-distiller__soldier` | 1024x1024 | transparent | a master distiller serving as a militia soldier, full body, standing at attention. Own civilian clothing: russet coat (#7a3e22), white apron; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-distiller__dragoon` | 1024x1024 | transparent | a master distiller serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: russet coat (#7a3e22), white apron; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-distiller__pioneer` | 1024x1024 | transparent | a master distiller working as a pioneer, full body, striding forward. Clothing: russet coat (#7a3e22), white apron, brown cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-distiller__scout` | 1024x1024 | transparent | a master distiller as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: russet coat (#7a3e22), white apron, brown cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-distiller__missionary` | 1024x1024 | transparent | a master distiller serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master distiller. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterTobacconist

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-tobacconist__none` | 1024x1024 | transparent | a master tobacconist, full body, standing in a relaxed working pose. Clothing: brown waistcoat (#6b4a2a), white shirt, neat cravat, brown hat. Carries a tied bundle of brown cigars with red bands (#d23c2a). |
| `units/master-tobacconist__soldier` | 1024x1024 | transparent | a master tobacconist serving as a militia soldier, full body, standing at attention. Own civilian clothing: brown waistcoat (#6b4a2a), white shirt, neat cravat; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-tobacconist__dragoon` | 1024x1024 | transparent | a master tobacconist serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: brown waistcoat (#6b4a2a), white shirt, neat cravat; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-tobacconist__pioneer` | 1024x1024 | transparent | a master tobacconist working as a pioneer, full body, striding forward. Clothing: brown waistcoat (#6b4a2a), white shirt, neat cravat, brown hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-tobacconist__scout` | 1024x1024 | transparent | a master tobacconist as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: brown waistcoat (#6b4a2a), white shirt, neat cravat, brown hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-tobacconist__missionary` | 1024x1024 | transparent | a master tobacconist serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master tobacconist. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterWeaver

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-weaver__none` | 1024x1024 | transparent | a master weaver, a woman, full body, standing in a relaxed working pose. Clothing: rose bodice and long skirt (#b33b6a), white apron, white linen cap. Carries a rolled bolt of red cloth (#c8384a) and a wooden shuttle. |
| `units/master-weaver__soldier` | 1024x1024 | transparent | a master weaver, a woman, serving as a militia soldier, full body, standing at attention. Own civilian clothing: rose bodice and long skirt (#b33b6a), white apron; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-weaver__dragoon` | 1024x1024 | transparent | a master weaver, a woman, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: rose bodice and long skirt (#b33b6a), white apron; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-weaver__pioneer` | 1024x1024 | transparent | a master weaver, a woman, working as a pioneer, full body, striding forward. Clothing: rose bodice and long skirt (#b33b6a), white apron, white linen cap. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-weaver__scout` | 1024x1024 | transparent | a master weaver, a woman, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: rose bodice and long skirt (#b33b6a), white apron, white linen cap. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-weaver__missionary` | 1024x1024 | transparent | a master weaver, a woman, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master weaver. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### masterFurTrader

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/master-fur-trader__none` | 1024x1024 | transparent | a master fur trader, full body, standing in a relaxed working pose. Clothing: long dark brown frock coat (#6c4a32) with a fur collar, tall beaver-felt hat. Carries a stack of tied pelts and a small ledger book. |
| `units/master-fur-trader__soldier` | 1024x1024 | transparent | a master fur trader serving as a militia soldier, full body, standing at attention. Own civilian clothing: long dark brown frock coat (#6c4a32) with a fur collar; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/master-fur-trader__dragoon` | 1024x1024 | transparent | a master fur trader serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: long dark brown frock coat (#6c4a32) with a fur collar; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/master-fur-trader__pioneer` | 1024x1024 | transparent | a master fur trader working as a pioneer, full body, striding forward. Clothing: long dark brown frock coat (#6c4a32) with a fur collar, tall beaver-felt hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/master-fur-trader__scout` | 1024x1024 | transparent | a master fur trader as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: long dark brown frock coat (#6c4a32) with a fur collar, tall beaver-felt hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/master-fur-trader__missionary` | 1024x1024 | transparent | a master fur trader serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a master fur trader. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### elderStatesman

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/elder-statesman__none` | 1024x1024 | transparent | an elder statesman, grey-haired with a queue, full body, standing in a relaxed working pose. Clothing: navy frock coat (#2c3f7a), white cravat, cream waistcoat, white stockings, black hat. Carries a rolled parchment document in one hand and a quill in the other. |
| `units/elder-statesman__soldier` | 1024x1024 | transparent | an elder statesman, grey-haired with a queue, serving as a militia soldier, full body, standing at attention. Own civilian clothing: navy frock coat (#2c3f7a), white cravat, cream waistcoat, white stockings; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/elder-statesman__dragoon` | 1024x1024 | transparent | an elder statesman, grey-haired with a queue, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: navy frock coat (#2c3f7a), white cravat, cream waistcoat, white stockings; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/elder-statesman__pioneer` | 1024x1024 | transparent | an elder statesman, grey-haired with a queue, working as a pioneer, full body, striding forward. Clothing: navy frock coat (#2c3f7a), white cravat, cream waistcoat, white stockings, black hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/elder-statesman__scout` | 1024x1024 | transparent | an elder statesman, grey-haired with a queue, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: navy frock coat (#2c3f7a), white cravat, cream waistcoat, white stockings, black hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/elder-statesman__missionary` | 1024x1024 | transparent | an elder statesman, grey-haired with a queue, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match an elder statesman. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### firebrandPreacher

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/firebrand-preacher__none` | 1024x1024 | transparent | a firebrand preacher, stern and lean, full body, standing in a relaxed working pose. Clothing: black frock coat (#2a2a2a), white preaching bands at the collar, wide-brimmed black hat. Carries an open book held high in one hand, the other hand raised in mid-sermon. |
| `units/firebrand-preacher__soldier` | 1024x1024 | transparent | a firebrand preacher, stern and lean, serving as a militia soldier, full body, standing at attention. Own civilian clothing: black frock coat (#2a2a2a), white preaching bands at the collar; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/firebrand-preacher__dragoon` | 1024x1024 | transparent | a firebrand preacher, stern and lean, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: black frock coat (#2a2a2a), white preaching bands at the collar; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/firebrand-preacher__pioneer` | 1024x1024 | transparent | a firebrand preacher, stern and lean, working as a pioneer, full body, striding forward. Clothing: black frock coat (#2a2a2a), white preaching bands at the collar, wide-brimmed black hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/firebrand-preacher__scout` | 1024x1024 | transparent | a firebrand preacher, stern and lean, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: black frock coat (#2a2a2a), white preaching bands at the collar, wide-brimmed black hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/firebrand-preacher__missionary` | 1024x1024 | transparent | a firebrand preacher, stern and lean, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a firebrand preacher. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### hardyPioneer

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/hardy-pioneer__none` | 1024x1024 | transparent | a hardy pioneer, weathered and strong, full body, standing in a relaxed working pose. Clothing: brown work coat (#9a6a3a) with rolled sleeves, leather breeches, tall boots, brown wide hat. Carries a long-handled spade over one shoulder and a hatchet at the belt. |
| `units/hardy-pioneer__soldier` | 1024x1024 | transparent | a hardy pioneer, weathered and strong, serving as a militia soldier, full body, standing at attention. Own civilian clothing: brown work coat (#9a6a3a) with rolled sleeves, leather breeches, tall boots; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/hardy-pioneer__dragoon` | 1024x1024 | transparent | a hardy pioneer, weathered and strong, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: brown work coat (#9a6a3a) with rolled sleeves, leather breeches, tall boots; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/hardy-pioneer__pioneer` | 1024x1024 | transparent | a hardy pioneer, weathered and strong, working as a pioneer, full body, striding forward. Clothing: brown work coat (#9a6a3a) with rolled sleeves, leather breeches, tall boots, brown wide hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/hardy-pioneer__scout` | 1024x1024 | transparent | a hardy pioneer, weathered and strong, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: brown work coat (#9a6a3a) with rolled sleeves, leather breeches, tall boots, brown wide hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/hardy-pioneer__missionary` | 1024x1024 | transparent | a hardy pioneer, weathered and strong, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a hardy pioneer. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### seasonedScout

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/seasoned-scout__none` | 1024x1024 | transparent | a seasoned scout, lean and watchful, full body, standing in a relaxed working pose. Clothing: fringed tan hunting frock (#8f6b3b), leather leggings, low-crowned leather hat. Carries a brass telescope held at the side. |
| `units/seasoned-scout__soldier` | 1024x1024 | transparent | a seasoned scout, lean and watchful, serving as a militia soldier, full body, standing at attention. Own civilian clothing: fringed tan hunting frock (#8f6b3b), leather leggings; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/seasoned-scout__dragoon` | 1024x1024 | transparent | a seasoned scout, lean and watchful, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: fringed tan hunting frock (#8f6b3b), leather leggings; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/seasoned-scout__pioneer` | 1024x1024 | transparent | a seasoned scout, lean and watchful, working as a pioneer, full body, striding forward. Clothing: fringed tan hunting frock (#8f6b3b), leather leggings, low-crowned leather hat. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/seasoned-scout__scout` | 1024x1024 | transparent | a seasoned scout, lean and watchful, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: fringed tan hunting frock (#8f6b3b), leather leggings, low-crowned leather hat. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/seasoned-scout__missionary` | 1024x1024 | transparent | a seasoned scout, lean and watchful, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a seasoned scout. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### veteranSoldier

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/veteran-soldier__none` | 1024x1024 | transparent | a veteran soldier, moustached and stern, full body, standing in a relaxed working pose. Clothing: weathered grey campaign coat (#5b5b5b) with darker cuffs, buff waistcoat, white cross-belts, black gaiters, black tricorn hat. Carries a flintlock musket held at order arms, butt on the ground. |
| `units/veteran-soldier__soldier` | 1024x1024 | transparent | a veteran soldier, moustached and stern, full body, standing at attention. Clothing: weathered grey campaign coat (#5b5b5b) with darker cuffs, buff waistcoat, white cross-belts, black gaiters, black tricorn hat. A flintlock musket with fixed bayonet held upright at shoulder arms. |
| `units/veteran-soldier__dragoon` | 1024x1024 | transparent | a veteran soldier, moustached and stern, as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider clothing: weathered grey campaign coat (#5b5b5b) with darker cuffs, buff waistcoat, white cross-belts, black gaiters, black tricorn hat. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/veteran-soldier__pioneer` | 1024x1024 | transparent | a veteran soldier, moustached and stern, working as a pioneer, full body, striding forward. Clothing: weathered grey campaign coat (#5b5b5b) with darker cuffs, buff waistcoat, white cross-belts, black gaiters, black tricorn hat, cross-belts removed, coat unbuttoned. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/veteran-soldier__scout` | 1024x1024 | transparent | a veteran soldier, moustached and stern, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: weathered grey campaign coat (#5b5b5b) with darker cuffs, buff waistcoat, white cross-belts, black gaiters, black tricorn hat, without cross-belts. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/veteran-soldier__missionary` | 1024x1024 | transparent | a veteran soldier, moustached and stern, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a veteran soldier. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### continentalSoldier

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/continental-soldier__none` | 1024x1024 | transparent | a Continental Army soldier, full body, standing in a relaxed working pose. Clothing: dark blue regimental coat (#2c4f8a) with buff facings and buff waistcoat, white cross-belts, white breeches, black gaiters, black tricorn hat with a small cockade. Carries a flintlock musket held at order arms, butt on the ground. |
| `units/continental-soldier__soldier` | 1024x1024 | transparent | a Continental Army soldier, full body, standing at attention. Clothing: dark blue regimental coat (#2c4f8a) with buff facings and buff waistcoat, white cross-belts, white breeches, black gaiters, black tricorn hat with a small cockade. A flintlock musket with fixed bayonet held upright at shoulder arms. |
| `units/continental-soldier__dragoon` | 1024x1024 | transparent | a Continental Army soldier as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider clothing: dark blue regimental coat (#2c4f8a) with buff facings and buff waistcoat, white cross-belts, white breeches, black gaiters, black tricorn hat with a small cockade. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/continental-soldier__pioneer` | 1024x1024 | transparent | a Continental Army soldier working as a pioneer, full body, striding forward. Clothing: dark blue regimental coat (#2c4f8a) with buff facings and buff waistcoat, white cross-belts, white breeches, black gaiters, black tricorn hat with a small cockade, cross-belts removed, coat unbuttoned. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/continental-soldier__scout` | 1024x1024 | transparent | a Continental Army soldier as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: dark blue regimental coat (#2c4f8a) with buff facings and buff waistcoat, white cross-belts, white breeches, black gaiters, black tricorn hat with a small cockade, without cross-belts. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/continental-soldier__missionary` | 1024x1024 | transparent | a Continental Army soldier serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a Continental Army soldier. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### kingsRegular

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/kings-regular__none` | 1024x1024 | transparent | a royal regular infantryman, disciplined, full body, standing in a relaxed working pose. Clothing: red regimental coat (#b52a2a) with dark blue facings, white waistcoat and breeches, white cross-belts, black gaiters, black tricorn hat with white lace edging. Carries a flintlock musket held at order arms, butt on the ground. |
| `units/kings-regular__soldier` | 1024x1024 | transparent | a royal regular infantryman, disciplined, full body, standing at attention. Clothing: red regimental coat (#b52a2a) with dark blue facings, white waistcoat and breeches, white cross-belts, black gaiters, black tricorn hat with white lace edging. A flintlock musket with fixed bayonet held upright at shoulder arms. |
| `units/kings-regular__dragoon` | 1024x1024 | transparent | a royal regular infantryman, disciplined, as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider clothing: red regimental coat (#b52a2a) with dark blue facings, white waistcoat and breeches, white cross-belts, black gaiters, black tricorn hat with white lace edging. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/kings-regular__pioneer` | 1024x1024 | transparent | a royal regular infantryman, disciplined, working as a pioneer, full body, striding forward. Clothing: red regimental coat (#b52a2a) with dark blue facings, white waistcoat and breeches, white cross-belts, black gaiters, black tricorn hat with white lace edging, cross-belts removed, coat unbuttoned. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/kings-regular__scout` | 1024x1024 | transparent | a royal regular infantryman, disciplined, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: red regimental coat (#b52a2a) with dark blue facings, white waistcoat and breeches, white cross-belts, black gaiters, black tricorn hat with white lace edging, without cross-belts. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |
| `units/kings-regular__missionary` | 1024x1024 | transparent | a royal regular infantryman, disciplined, serving as a missionary, full body, standing calmly. Wears a long plain black cassock-like coat and a wide black hat; the face and build still match a royal regular infantryman. Holds a tall simple wooden cross on a staff in one hand and a small book in the other. |

#### nativeConvert

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/native-convert__none` | 1024x1024 | transparent | an Indigenous man of the eastern woodlands who lives at a mission, calm and dignified, full body, standing in a relaxed working pose. Clothing: plain off-white linen shirt, ochre-brown deerskin leggings and moccasins (#c08a4a), a woven red-and-cream finger-woven sash, long black hair tied back, no headdress. Carries a wooden hoe resting on one shoulder. |
| `units/native-convert__soldier` | 1024x1024 | transparent | an Indigenous man of the eastern woodlands who lives at a mission, calm and dignified, serving as a militia soldier, full body, standing at attention. Own civilian clothing: plain off-white linen shirt, ochre-brown deerskin leggings and moccasins (#c08a4a), a woven red-and-cream finger-woven sash, long black hair tied back, no headdress; a black tricorn hat, plus a white leather cross-belt with a black cartridge box. A flintlock musket with fixed bayonet held upright at shoulder arms. No trade tools. |
| `units/native-convert__dragoon` | 1024x1024 | transparent | an Indigenous man of the eastern woodlands who lives at a mission, calm and dignified, serving as a mounted dragoon, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view walking to the right. Rider wears own civilian clothing: plain off-white linen shirt, ochre-brown deerskin leggings and moccasins (#c08a4a), a woven red-and-cream finger-woven sash, long black hair tied back, no headdress; a black tricorn hat and white cross-belts. Sabre raised, a short carbine slung on the back, plain saddle cloth. |
| `units/native-convert__pioneer` | 1024x1024 | transparent | an Indigenous man of the eastern woodlands who lives at a mission, calm and dignified, working as a pioneer, full body, striding forward. Clothing: plain off-white linen shirt, ochre-brown deerskin leggings and moccasins (#c08a4a), a woven red-and-cream finger-woven sash, long black hair tied back, no headdress. A long-handled spade and a pickaxe over one shoulder, a coil of rope and a saw strapped to a small back pack. No musket. |
| `units/native-convert__scout` | 1024x1024 | transparent | an Indigenous man of the eastern woodlands who lives at a mission, calm and dignified, as a mounted scout, riding a bay horse (#9b6a3e) with dark mane, horse in three-quarter side view trotting to the right. Rider clothing: plain off-white linen shirt, ochre-brown deerskin leggings and moccasins (#c08a4a), a woven red-and-cream finger-woven sash, long black hair tied back, no headdress. Holds a brass telescope, leather saddlebags behind the saddle. No sabre. |

### 4.3 Units: vehicles, artillery and treasure

These units only have role `none`. Files keep the `__none` suffix so the loader can always look up `units/<type>__<role>`.

```category vehicles
FORMAT: A single game unit sprite: a vehicle or gun in three-quarter view facing right, wheels resting on the invisible ground line at 88 percent of the image height, about 84 percent of the image width wide. Drawn precisely, like a technical illustration of an eighteenth-century vehicle. No nation colours, flags or markings.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/wagon-train__none` | 1024x1024 | transparent | A covered wagon train: a sturdy four-wheeled farm wagon with a cream canvas cover (#fbf3df) stretched over hoops, wooden body (#a8743f), spoked wheels in light timber (#c8955a), a few crates and a barrel visible at the open back, pulled by one bay draught horse (#9b6a3e) in harness. |
| `units/artillery__none` | 1024x1024 | transparent | A field artillery piece: a long gunmetal-grey cannon barrel (#55585c) mounted on a two-wheeled wooden gun carriage (#a8743f) with a long trail resting on the ground, large spoked wheels, a ramrod and sponge leaning against the carriage, and a small pyramid of iron cannonballs beside it. Barrel raised slightly, pointing right. |
| `units/treasure__none` | 1024x1024 | transparent | A treasure train: a heavy low four-wheeled cart (#a8743f) with iron-bound wheels carrying a large open treasure chest (#c58a3e lid, iron straps) overflowing with gold coins (#ffd23f) and a few silver ingots (#dfe4ea), a gold coin or two on the cart bed, pulled by one bay draught horse (#9b6a3e). |

### 4.4 Units: ships

All ships use role `none`. Ship sprites are drawn on the water tile, so they include a short flat waterline but no sea.

```category ships
FORMAT: A single sailing ship sprite in three-quarter side view, bow pointing right, sails set and filled by a wind from the left. The hull sits on a short, flat, wavy waterline stroke in wave blue (#3a80b4) at 82 percent of the image height; no other water, no sea background. The ship is drawn with the precision of a naval draughtsman: correct masts, yards, standing rigging as simple single lines, planked hull (#9a5b2e) with a darker wale, sails in canvas white (#fffaf0). The masthead is left bare: NO flag, pennant, ensign, cross or national emblem anywhere, the game adds the owner's pennant later. Ship length (bow to stern, including bowsprit) follows the size class given, as a share of the image width, so ships stay in scale with each other.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `units/caravel__none` | 1024x1024 | transparent | A small Portuguese-style caravel, size class 64 percent of image width: two masts with large triangular lateen sails, a raised sterncastle, a slender low hull, no gun ports. |
| `units/merchantman__none` | 1024x1024 | transparent | A merchantman, size class 76 percent of image width: a broad, deep-bellied cargo ship with three masts of square sails, a plain hull with no gun ports, a cargo hatch and a few barrels on deck, a small boat lashed amidships. |
| `units/galleon__none` | 1024x1024 | transparent | A Spanish-style galleon, size class 84 percent of image width: tall stepped sterncastle with gallery windows and gilded trim (#ffd23f), forecastle, three masts plus a small lateen mizzen, square sails, a row of closed gun ports, a long beakhead. |
| `units/privateer__none` | 1024x1024 | transparent | A privateer, size class 76 percent of image width: a sleek, fast two-masted brig with raked masts, dark grey sails (#5a5a5a), a black-painted hull with a narrow ochre stripe, a row of six open gun ports with muzzles showing. Flies no colours at all. |
| `units/frigate__none` | 1024x1024 | transparent | A frigate, size class 84 percent of image width: a sleek three-masted warship with full square rig and jibs, a single continuous gun deck with a row of open gun ports and black cannon muzzles, a yellow-ochre stripe along the gun deck (#ffd84a) on the brown hull, a modest flat stern. |
| `units/man-of-war__none` | 1024x1024 | transparent | A ship of the line (man-of-war), size class 90 percent of image width: a massive, tall three-masted warship with full square rig, two stacked gun decks each with a long row of open gun ports and black muzzles, ochre stripes (#ffd84a) between the decks, an ornate stern with gallery windows, a large figurehead under the bowsprit. |

### 4.5 Ownership overlays

Draw these with **white cloth** so the game can tint them exactly to each nation's colour (section 3).

```category overlays
FORMAT: A small game overlay marker drawn large and centred, filling about 70 percent of the image. All cloth is pure flat white (#fffdf6) with the ink outline so the game can recolour it; no other colour on the cloth, no emblem, no stripes, no text.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `overlays/pennant` | 1024x1024 | transparent | A short swallow-tailed pennant fluttering to the right from a thin vertical wooden staff (#a8743f), the cloth occupying the upper half of the staff, seen flat from the side. |
| `overlays/flag` | 1024x1024 | transparent | A rectangular flag on its own, waving gently to the right with two soft folds, attached along its left edge to a short section of pole; no pole below the flag. |
| `overlays/mission` | 1024x1024 | transparent | A mission marker: a simple wooden cross on a post (#8a5a32) planted in a small mound of earth, with a small rectangular white pennant tied to the post below the crossbar. |

### 4.6 Goods and products

Goods and products appear in the colony screen, cargo chips, the Europe market and the yield badges. They are drawn as small as 18 px, so they need the simplest silhouettes in the game.

```category goods
FORMAT: A single game resource icon: one object (or a tight bundle) in three-quarter view, centred, filling about 80 percent of the image. Even bolder outline than usual (about 4 percent of the image width) and very few interior lines, because the icon is shown at 18 to 56 pixels. Strong, simple, instantly recognisable silhouette.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `goods/food` | 1024x1024 | transparent | Food: a ripe ear of maize with golden-yellow kernels (#f2c43a), its green husk leaves (#6aa84f) peeled back, lying diagonally. |
| `goods/sugar` | 1024x1024 | transparent | Sugar: a conical white sugarloaf (#fffdf6) standing upright, its base wrapped in a band of blue paper (#3a6fb0) tied with string. |
| `goods/tobacco` | 1024x1024 | transparent | Tobacco: one large cured tobacco leaf in olive-gold (#9a8a3a) with a clear central vein and a few side veins, curving gently. |
| `goods/cotton` | 1024x1024 | transparent | Cotton: a cluster of three fluffy white cotton bolls (#fffdf6) bursting from dry brown bracts on a short twig. |
| `goods/furs` | 1024x1024 | transparent | Furs: a stretched beaver pelt in warm brown (#9b6a3e), roughly oval, laced onto a round willow hoop (#c8955a). |
| `goods/lumber` | 1024x1024 | transparent | Lumber: a small pyramid stack of three sawn logs seen end-on, light timber (#c8955a) with simple growth rings and bark edges (#8a5a32). |
| `goods/ore` | 1024x1024 | transparent | Ore: a chunky faceted lump of grey iron ore (#8d8f94) with two flat darker facets and a few small rust-coloured flecks. |
| `goods/silver` | 1024x1024 | transparent | Silver: two stacked trapezoidal silver ingots (#dfe4ea) with crisp bevelled edges and a small flat white glint. |
| `goods/horses` | 1024x1024 | transparent | Horses: the head and neck of a bay horse (#9b6a3e) in profile facing right, dark mane, white blaze, wearing a simple rope halter. |
| `goods/rum` | 1024x1024 | transparent | Rum: a wooden barrel (#a2683a) standing upright with two dark iron hoops and a small cork bung on its side. |
| `goods/cigars` | 1024x1024 | transparent | Cigars: a tied bundle of five brown cigars (#7a4a28) lying diagonally, held by a red paper band (#d23c2a). |
| `goods/cloth` | 1024x1024 | transparent | Cloth: a bolt of red woven cloth (#c8384a) lying on its side, the end partly unrolled to show the pink underside (#e8a0aa). |
| `goods/coats` | 1024x1024 | transparent | Coats: a long blue winter coat (#3a5a9a) laid out flat and seen from the front, with a pale fur collar and fur cuffs, a row of brass buttons (#ffd23f). |
| `goods/trade-goods` | 1024x1024 | transparent | Trade goods: an open wooden crate (#c8955a) with rope handles, showing a brass kettle, a string of blue and red glass beads and a folded blanket peeking out. |
| `goods/tools` | 1024x1024 | transparent | Tools: an iron-headed hammer and a hand saw crossed in an X, iron parts in #9aa0a6, wooden handles in #a8743f. |
| `goods/muskets` | 1024x1024 | transparent | Muskets: a single flintlock musket lying diagonally from lower left to upper right, walnut stock (#a8743f), steel barrel and lock (#7a7f86), a brass butt plate. |
| `goods/hammers` | 1024x1024 | transparent | Hammers (construction work): a single carpenter's claw hammer standing diagonally, grey head (#7a7f86) and long wooden handle (#a8743f), resting on a short plank (#c8955a). |
| `goods/bells` | 1024x1024 | transparent | Liberty bells: a large brass bell (#e8b830) hanging from a short wooden yoke, its clapper (#c8955a) visible at the mouth, a thin hairline crack up one side; no inscription. |
| `goods/crosses` | 1024x1024 | transparent | Crosses: a plain Latin cross in white (#fffdf6), upright and symmetrical, with a slightly broader base, no figure, no ornament. |

### 4.7 Terrain base tiles

```category terrain
FORMAT: A seamless square map tile seen from DIRECTLY ABOVE (orthographic top-down, no horizon, no perspective). The whole image is filled edge to edge with the single flat base colour given; no outline, frame or border around the tile. A few small flat motifs in the motif colour are scattered over the middle of the tile and keep at least 12 percent of the image width away from every edge, so the edges are pure base colour and the tile repeats seamlessly. Motifs are simple flat shapes with the thin ink outline or, for very small marks, just a flat darker stroke. Calm and sparse: the tile is a background that units and trees are drawn over.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `terrain/ocean` | 1024x1024 | opaque | Ocean (coastal water). Base colour #8ed0ec. Motifs: two or three short double-arched wave crests drawn as single strokes in #3a80b4, no fill, like small seagull-shaped ripples. |
| `terrain/high-seas` | 1024x1024 | opaque | High seas (deep ocean). Base colour #64b2df. Motifs: three longer, gentle swell lines in #3a80b4 and one small white whitecap curl (#fffdf6). |
| `terrain/plains` | 1024x1024 | opaque | Plains. Base colour #cfe39a. Motifs: six to eight tiny grass tufts of three short blades each in #b6c888 and two tiny pale yellow wildflowers (#ffd84a). |
| `terrain/grassland` | 1024x1024 | opaque | Grassland. Base colour #a6d878. Motifs: eight small grass tufts in #92be6a, slightly taller and denser than plains. |
| `terrain/prairie` | 1024x1024 | opaque | Prairie. Base colour #ecdc8e. Motifs: several tall, thin curved grass stems in clumps in #d0c27d, all leaning slightly to the right as if in a breeze. |
| `terrain/savannah` | 1024x1024 | opaque | Savannah. Base colour #e4cd6e. Motifs: four round low grass clumps in #c9b461 and a few dry stalks. |
| `terrain/marsh` | 1024x1024 | opaque | Marsh. Base colour #aac592. Motifs: two small irregular pools of water (#8ed0ec) with ink outlines, clusters of upright reeds in #96ad80 at their rims, one or two brown cattail heads (#8a5a32). |
| `terrain/swamp` | 1024x1024 | opaque | Swamp. Base colour #8fb482. Motifs: three dark murky pools (#7e9e72 edged with #3a80b4 ripples), floating round lily pads in #5d9b5c, a few drooping reeds. |
| `terrain/desert` | 1024x1024 | opaque | Desert. Base colour #f4e3ae. Motifs: three long, gently curved dune ripple lines in #d7c899 and a few small pebbles (#b9b2a6). |
| `terrain/tundra` | 1024x1024 | opaque | Tundra. Base colour #d5dcc8. Motifs: a few low lichen patches in #bbc2b0, three small grey stones (#b9b2a6) and two tiny white snow patches (#fffdf6). |
| `terrain/arctic` | 1024x1024 | opaque | Arctic ice and snow. Base colour #f8fbff. Motifs: two thin angular crack lines in pale blue-grey (#dfe2e6) and one small pale blue (#8ed0ec) icy patch with a white glint. |
| `terrain/hills` | 1024x1024 | opaque | Hill country ground (the hills themselves are drawn on top separately). Base colour #dcc28c. Motifs: a few short grass tufts in #c2ab7b and three small stones (#b9b2a6). |
| `terrain/mountains` | 1024x1024 | opaque | Mountain ground: bare rocky soil (the peaks are drawn on top separately). Base colour #cdb89c. Motifs: several angular scattered rocks and scree in #b4a289 and #b9b2a6. |

**Plowed fields** (`tile.p`). The engine allows plowing on every land type except hills, mountains and arctic. The field is inset with an 8% plain border, like the current procedural furrows, so the tile stays seamless.

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `terrain/plains__plowed` | 1024x1024 | opaque | Plowed plains. Base colour #cfe39a over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field: neat parallel diagonal furrow rows (lower left to upper right) in #aaba7e, with thin young green sprout dashes (#58a548) along the ridges. |
| `terrain/grassland__plowed` | 1024x1024 | opaque | Plowed grassland. Base colour #a6d878 over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #88b162, with small tobacco seedlings (#3d8a4c) along the ridges. |
| `terrain/prairie__plowed` | 1024x1024 | opaque | Plowed prairie. Base colour #ecdc8e over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #c2b474, with tiny cotton seedlings (#78b84e) along the ridges. |
| `terrain/savannah__plowed` | 1024x1024 | opaque | Plowed savannah. Base colour #e4cd6e over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #bba85a, with short young sugar cane shoots (#4fa042) along the ridges. |
| `terrain/marsh__plowed` | 1024x1024 | opaque | Drained and plowed marsh. Base colour #aac592 over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #8ba278 with one straight narrow drainage ditch of water (#8ed0ec) along one side of the field. |
| `terrain/swamp__plowed` | 1024x1024 | opaque | Drained and plowed swamp. Base colour #8fb482 over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #75946b with two straight narrow drainage ditches of water (#8ed0ec). |
| `terrain/desert__plowed` | 1024x1024 | opaque | Irrigated and plowed desert. Base colour #f4e3ae over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #c8ba8f with one straight irrigation channel of water (#8ed0ec) across the middle. |
| `terrain/tundra__plowed` | 1024x1024 | opaque | Plowed tundra. Base colour #d5dcc8 over the whole tile. Inside it, leaving a plain border of 8 percent on every side, a square plowed field of neat parallel diagonal furrow rows in #afb4a4 with sparse hardy green sprouts (#3b7a60). |

### 4.8 Coast bands and roads (optional top-down overlays)

These are optional. The procedural coastline and roads already work well, and the vector versions stay sharper at small zoom. Generate these only if you want painted coasts and roads.

```category ground-overlays
FORMAT: A transparent square overlay for a top-down map tile, seen from DIRECTLY ABOVE (orthographic). Everything not described is fully transparent. Shapes are flat colour with the ink outline only where stated. Any part that reaches a tile edge must be cut perfectly straight along that edge and centred exactly as described, so neighbouring tiles join without gaps.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `terrain/coast__edge` | 1024x1024 | transparent | Shallow-water band for a water tile with land to the NORTH: a straight band of pale shallow water in flat #b0def2 running the full width along the TOP edge, about 22 percent of the tile deep; its lower boundary is a gentle, softly wavy line drawn as a thin stroke in #3a80b4. The rest is transparent. |
| `terrain/coast__inner` | 1024x1024 | transparent | Shallow-water band for a water tile with land to the NORTH and the WEST: an L-shaped band of pale shallow water in flat #b0def2 running along the full TOP edge and the full LEFT edge, about 22 percent of the tile deep, the inner corner smoothly rounded; its inner boundary is a gentle wavy thin stroke in #3a80b4. The rest is transparent. |
| `terrain/coast__outer` | 1024x1024 | transparent | Shallow-water patch for a water tile with land only diagonally to the NORTH-WEST: a quarter-disc of pale shallow water in flat #b0def2 filling the TOP-LEFT corner, radius about 30 percent of the tile, its curved boundary a gentle wavy thin stroke in #3a80b4. The rest is transparent. |
| `decor/road__hub` | 1024x1024 | transparent | Road junction: a small round patch of packed earth road (#b9844c) at the exact centre of the tile, diameter 18 percent of the tile, with an even ink outline and two or three tiny pebbles. |
| `decor/road__spoke` | 1024x1024 | transparent | Dirt road segment from the exact centre of the tile to the exact middle of the TOP edge, gently meandering on the way like a country track: two soft S-bends that swing no more than 8 percent of the tile to either side of the straight line, never a straight ruler line, but both ends exactly on the centre and on the middle of the top edge, running straight up for the last 4 percent at each end so neighbouring pieces join. Width 14 percent of the tile throughout, flat earth colour #b9844c with ink edges on both sides, two faint cart ruts in #a8743f following the bends; the top end is cut flat at the edge, the bottom end is rounded at the centre. |
| `decor/road__spoke-diagonal` | 1024x1024 | transparent | Dirt road segment from the exact centre of the tile to the exact TOP-LEFT corner, gently meandering on the way like a country track: two soft S-bends that swing no more than 8 percent of the tile to either side of the straight diagonal, never a straight ruler line, but both ends exactly on the centre and on the corner, running straight along the diagonal for the last 4 percent at each end so neighbouring pieces join. Width 14 percent of the tile throughout, flat earth colour #b9844c with ink edges on both sides, two faint cart ruts in #a8743f following the bends; the corner end is cut off cleanly at the image corner, the centre end is rounded. |

The renderer rotates `coast__*` and `road__spoke*` in 90° steps to cover all directions, using the same neighbour tests as `coastPath` and `drawRoads`.

### 4.9 Landscape decorations

```category decor
FORMAT: A landscape decoration drawn ON a map tile, in the high three-quarter front view (seen from the south, 30 degrees up). The image represents one square tile: the decoration's base sits within the lower 90 percent of the image and may rise toward the top edge, but nothing touches the image edges. Transparent background, no ground plane except where described. Flat colours, even ink outlines, light from the upper left, at most one flat darker tone on the right-hand side of a volume.
```

**Forests** (`tile.f`). There is one clump per terrain that can carry forest. The tree shapes and colours come from `FOREST` in `palette.ts`, and the forest names from `TERRAIN[*].forest.name`.

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `decor/forest__plains` | 1024x1024 | transparent | Mixed forest: a clump of five trees spread over the tile, mostly round-crowned deciduous trees with flat green crowns (#58a548) on short brown trunks (#8a5a32), plus one slim conifer (#3d8a4c); back trees higher in the image and partly hidden behind front trees. |
| `decor/forest__grassland` | 1024x1024 | transparent | Conifer forest: a clump of five tall evergreen conifers with stacked, tiered triangular crowns in deep green (#3d8a4c) and short brown trunks (#8a5a32), staggered in depth, the tallest at the back. |
| `decor/forest__prairie` | 1024x1024 | transparent | Broadleaf forest: a clump of four broad, generous oak-like trees with big rounded, slightly lobed crowns in fresh green (#78b84e) on sturdy brown trunks (#8a5a32), staggered in depth. |
| `decor/forest__savannah` | 1024x1024 | transparent | Tropical forest: a clump of four palm trees with curved slender trunks (#8a5a32) and large arching fronds in green (#4fa042), with two low broad-leaved bushes at their feet. |
| `decor/forest__marsh` | 1024x1024 | transparent | Wetland forest: a clump of four round-crowned swamp trees in muted green (#5d9b5c) with slightly flared trunk bases (#8a5a32) standing among reeds, a small pool of water (#8ed0ec) between them. |
| `decor/forest__swamp` | 1024x1024 | transparent | Rain forest: a dense clump of tall jungle trees with layered dark green crowns (#3c7e50), two palms with arching fronds, hanging vines and large broad leaves in the undergrowth. |
| `decor/forest__desert` | 1024x1024 | transparent | Scrub forest: five low, rounded desert shrubs in dull sage green (#93ad5e), one small twisted mesquite-like tree and a single upright cactus with two arms, spread sparsely over the tile. |
| `decor/forest__tundra` | 1024x1024 | transparent | Boreal forest: a clump of six narrow, spire-shaped spruces in dark blue-green (#3b7a60) with short trunks, a few white snow patches (#fffdf6) on the lower boughs. |

**Relief, ruins and resources**

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `decor/hills` | 1024x1024 | transparent | Two rounded grassy hills side by side, the left one larger and slightly behind, filled in flat ochre tones #cab281 (left) and #bba577 (right), each with a few short grass tufts and a small rock; low and wide, together spanning about 88 percent of the image width. |
| `decor/mountains` | 1024x1024 | transparent | Two steep rocky mountain peaks, the left one taller and in front, in flat tones #c1ad93 (left) and #a89780 (right), each with a crisp white snow cap (#fffdf6) with a zigzag lower edge, a few flat-tone rock ledges, together spanning about 88 percent of the image width. |
| `decor/ruins` | 1024x1024 | transparent | Lost city ruins: the remains of an ancient overgrown stone structure, two broken weathered stone pillars of different heights (#b9b2a6), a fallen lintel slab, a crumbling low wall, green vines (#58a548) creeping over the stones, a mysterious and inviting feel. No symbols, no text, no question mark. |
| `decor/bonus__fish` | 1024x1024 | transparent | Fish bonus marker (for ocean tiles): three silver-blue fish (#9aa3ad) leaping in an arc out of a small splash of white foam, centred. |
| `decor/bonus__wheat` | 1024x1024 | transparent | Food bonus marker (for plains): a tall upright sheaf of golden wheat (#f2c43a) tied with a band of straw, centred. |
| `decor/bonus__oasis` | 1024x1024 | transparent | Food bonus marker (for desert): a small oasis, a round pool of clear water (#8ed0ec) with an ink rim and two short date palms (#4fa042) beside it. |
| `decor/bonus__tobacco` | 1024x1024 | transparent | Tobacco bonus marker (for grassland): a single flowering tobacco plant with large broad leaves (#3d8a4c) and a few small pink trumpet flowers on top. |
| `decor/bonus__cotton` | 1024x1024 | transparent | Cotton bonus marker (for prairie): a single cotton bush with dark green leaves (#5d9b5c) and five open white cotton bolls (#fffdf6). |
| `decor/bonus__sugar` | 1024x1024 | transparent | Sugar bonus marker (for savannah and swamp): a tight stand of five tall green sugar cane stalks (#4fa042) with jointed stems and long narrow leaves. |
| `decor/bonus__ore` | 1024x1024 | transparent | Ore bonus marker (for marsh, tundra and hills): a rocky outcrop of dark grey stones (#8d8f94) with a few rust-red mineral veins and a small wooden pick leaning against it. |
| `decor/bonus__silver` | 1024x1024 | transparent | Silver bonus marker (for mountains): a jagged rock outcrop (#b9b2a6) with bright silver crystalline veins and nuggets (#dfe4ea) glinting with small flat white highlights. |
| `decor/bonus__game` | 1024x1024 | transparent | Fur bonus marker (for any forested tile): a beaver (#9b6a3e) sitting upright beside a small gnawed tree stump, seen in three-quarter view facing right. |

Bonus marker by tile. This follows `TERRAIN[*].bonusGood`; a forested tile's bonus is always furs (`production.ts`).

| Tile | Marker |
| --- | --- |
| any forested tile | `bonus__game` |
| ocean | `bonus__fish` |
| plains | `bonus__wheat` |
| desert | `bonus__oasis` |
| grassland | `bonus__tobacco` |
| prairie | `bonus__cotton` |
| savannah, swamp | `bonus__sugar` |
| marsh, tundra, hills | `bonus__ore` |
| mountains | `bonus__silver` |
| high seas, arctic | none (the map generator places no bonus there) |

### 4.10 Colonies, stockade and fort

The colony sprites are nation-neutral, with an empty flagpole for the tinted `overlays/flag`. The three sizes follow the house-count thresholds in `colonySprite`: 1 to 3 colonists is small, 4 to 7 is medium, 8 or more is large.

```category colonies
FORMAT: A European colonial settlement drawn on one map tile, in the high three-quarter front view. The settlement sits on a small, irregular, flat patch of trodden earth (#e0cfa4) with an ink outline, about 80 percent of the image width, its front edge on the ground line at 88 percent of the image height. Houses are cream clapboard or timber-frame walls (#fbf3df), red-tiled or red-shingled gabled roofs (#d23c2a), small dark windows, wooden doors (#a8743f). A tall plain wooden flagpole stands slightly right of centre with NO flag on it (the game adds the flag). No nation colours, no people, no text or signs.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `colonies/colony__small` | 1024x1024 | transparent | A small new colony: two simple one-storey timber cottages with red gabled roofs side by side, a woodpile, a small vegetable plot fenced with split rails, a single path. |
| `colonies/colony__medium` | 1024x1024 | transparent | A growing colony town: three houses (one two-storey) with red roofs, a small white chapel with a tiny bell-cote, a well with a little roof, a barn, a short dirt lane between them. |
| `colonies/colony__large` | 1024x1024 | transparent | A prosperous colonial town: five closely grouped buildings including two two-storey houses, a white church with a slender steeple, a brick warehouse with a slate-blue roof (#3a6fb0), and a market square with a well; the tallest building at the back, the composition fuller and denser than a small town. |

**Defence overlays.** Each is generated whole and then **split horizontally at 58% of its height** into `__back` (the top part, drawn behind the houses) and `__front` (the bottom part, drawn in front). The split step is in the script. The enclosure is drawn empty, with transparent space inside, so the colony sprite fits within it.

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `colonies/stockade` | 1024x1024 | transparent | A wooden stockade enclosure, completely EMPTY inside (transparent interior, no buildings): a rectangular palisade of sharpened vertical logs (#a8743f) seen in high three-quarter view, the back wall across the upper middle of the image and the front wall low across the bottom near the ground line at 88 percent, side walls receding between them, a gate of planks in the middle of the front wall, two small square log watchtowers at the front corners. The enclosure spans about 92 percent of the image width. |
| `colonies/fort` | 1024x1024 | transparent | A stone fort enclosure, completely EMPTY inside (transparent interior, no buildings): a rectangular curtain wall of grey dressed stone (#b9b2a6) seen in high three-quarter view, the back wall across the upper middle of the image and the front wall low across the bottom near the ground line at 88 percent, with four pointed corner bastions, each with a dark cannon embrasure and a black cannon muzzle, an arched gate with heavy wooden doors (#8a5a32) in the front wall. The enclosure spans about 94 percent of the image width. |

### 4.11 Native settlements

There is one regular and one capital sprite per tribe. The settlement type (`camp`, `village` or `city`) and the accent colour come from `TRIBES` in `rules/nations.ts`. A capital is a larger, more important version of the same place; it replaces the procedural capital flag.

Respect rules, which apply to every prompt in this section and are repeated in its category block:

- Show **architecture, landscape and the material culture of daily life**, grounded in the historical record for the 16th to 18th century: materials, building forms, gardens and crafts.
- **No people** in the settlement sprites. That avoids caricatured faces and keeps the sprites legible.
- No war paint, brandished weapons, scalps, skulls, sacrifice scenes, generic "feathered headdress" shorthand, totem poles outside the Pacific Northwest, or mixing of unrelated cultures. Each tribe gets its own architecture, not a generic "Indian village".
- The tribe's accent colour appears only as painted bands, woven textiles or door hangings, as a plausible dyed or painted material.

```category settlements
FORMAT: An Indigenous American settlement drawn on one map tile, in the high three-quarter front view, sitting on a small irregular patch of ground (#e0cfa4 or a green clearing as fits the region) with an ink outline, about 84 percent of the image width, its front edge on the ground line at 88 percent of the image height. Historically accurate architecture and materials for the people named, drawn with the same care and precision as a European town, dignified and peaceful. No people, no weapons, no war paint, no skulls, no generic feathered-headdress imagery, no mixing of other cultures, no text. The accent colour given appears only on painted bands, woven mats or hanging textiles.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `settlements/iroquois` | 1024x1024 | transparent | A Haudenosaunee (Iroquois) village: three long barrel-roofed longhouses covered with overlapping elm-bark panels (#c99a5b) with smoke holes along the ridge, end doors hung with mats in accent brown (#7a4b2a), a palisade of upright posts behind them, rows of maize, beans and squash in front. |
| `settlements/iroquois__capital` | 1024x1024 | transparent | A large palisaded Haudenosaunee (Iroquois) town: five bark-covered longhouses including one notably longer council longhouse in the centre, a double palisade of upright posts with a raised walkway, a large maize field in front, door mats in accent brown (#7a4b2a). |
| `settlements/cherokee` | 1024x1024 | transparent | A Cherokee town: three rectangular wattle-and-daub houses with pale clay walls (#e0cfa4) and gabled bark or thatch roofs, one round winter house with a conical earth-and-bark roof, small garden plots of maize and beans, door hangings in accent teal (#2f7d6a). |
| `settlements/cherokee__capital` | 1024x1024 | transparent | A principal Cherokee town: a large round council house (townhouse) with a conical roof standing on a low flat-topped earthen mound in the centre, an open summer pavilion beside it, four wattle-and-daub houses around a plaza, accent teal (#2f7d6a) painted bands on the posts. |
| `settlements/sioux` | 1024x1024 | transparent | A Lakota (Sioux) camp on open grassland: three tall buffalo-hide tipis (#ecd7a6) with crossed lodge poles at the top and smoke flaps, simple painted horizontal bands and a geometric border in accent red-brown (#a8452b), a wooden meat-drying rack, a small cooking fire ring of stones. |
| `settlements/sioux__capital` | 1024x1024 | transparent | A large Lakota (Sioux) camp circle: six hide tipis (#ecd7a6) arranged in an arc around an open centre with one larger council tipi, painted geometric bands in accent red-brown (#a8452b), drying racks with hides stretched on frames. |
| `settlements/apache` | 1024x1024 | transparent | An Apache camp in dry country: three dome-shaped wickiups built from bent saplings covered with brush, bear grass and a few hide panels (#c99a5b), one with a woven blanket over the doorway in accent orange-brown (#c0702f), a cooking fire ring, desert scrub and a yucca plant. |
| `settlements/apache__capital` | 1024x1024 | transparent | A large Apache encampment: five brush-and-hide wickiups (#c99a5b) and one hide tipi grouped around a central open ground, a ramada (flat brush shade roof on four posts), woven baskets, blankets in accent orange-brown (#c0702f) over the doorways. |
| `settlements/aztec` | 1024x1024 | transparent | A Mexica (Aztec) city district: whitewashed flat-roofed adobe and stone houses (#fbf3df) with dark doorways around a plaza, a small stepped temple platform with one stair and a shrine on top, a stone-lined canal with a chinampa garden plot along the front edge, painted bands in accent green (#3b6e2a) on the shrine. |
| `settlements/aztec__capital` | 1024x1024 | transparent | A great Mexica (Aztec) city centre: a tall stepped pyramid with a double staircase and twin shrines on top, roofed with steep wooden roofs, in white stucco (#fbf3df) with painted bands in accent green (#3b6e2a), flat-roofed whitewashed palaces and houses around a paved plaza, a canal with a canoe. |
| `settlements/arawak` | 1024x1024 | transparent | A Taíno (Arawak) Caribbean village: four round bohío houses with cane walls and tall conical palm-thatch roofs (#c99a5b), a cotton hammock strung between two posts, a dugout canoe drawn up on a strip of sand, palm trees, woven mats in accent gold (#c99a1e). |
| `settlements/arawak__capital` | 1024x1024 | transparent | A principal Taíno (Arawak) village: a large rectangular caney (chief's house) with a pitched palm-thatch roof in the centre, five round bohío huts around it, a rectangular ceremonial ball court (batey) lined with upright stones in front, woven mats in accent gold (#c99a1e). |
| `settlements/tupi` | 1024x1024 | transparent | A Tupi village in a forest clearing: three very long communal houses with rounded arched roofs entirely thatched with palm leaves down to the ground (#c99a5b), a small entrance in each end, arranged around a central open plaza, a low palisade of poles, manioc garden plants, a woven mat in accent olive (#6a8f2a). |
| `settlements/tupi__capital` | 1024x1024 | transparent | A large Tupi village: five long palm-thatched communal houses around a broad central plaza, enclosed by a double palisade of poles, manioc gardens, hammocks visible in a doorway, woven mats in accent olive (#6a8f2a). |
| `settlements/inca` | 1024x1024 | transparent | An Andean (Inca) town on a mountainside: houses of precisely fitted grey ashlar stone blocks (#b9b2a6) with trapezoidal doorways and niches, steep thatched roofs of golden ichu grass (#ecd7a6), stone agricultural terraces with green crops stepping down the slope, textiles in accent plum (#8a2f5a) hung at a doorway. |
| `settlements/inca__capital` | 1024x1024 | transparent | A great Inca city: a large temple and palace compound of perfectly fitted grey ashlar stone (#b9b2a6) with trapezoidal doorways and windows, steep thatched roofs, a broad stone stairway, several tiers of agricultural terraces below, woven textiles in accent plum (#8a2f5a) hung at the main gate. |

### 4.12 Building icons

There is one icon per building kind and level, following `BUILDINGS` in `rules/buildings.ts` (30 icons). They appear in the colony screen's building list. The style progression is consistent across buildings:

- **Level 1** is a humble timber building with a red roof (`#d23c2a`).
- **Level 2** is larger, of brick or stone, with a slate-blue roof (`#3a6fb0`), matching the procedural `house()` icon's level-2 colour.
- **Level 3** is grand, two-storey or more, of dressed stone, with the slate-blue roof.

```category buildings
FORMAT: A single colonial building icon in the high three-quarter front view, the whole building visible, sitting on a small flat oval of trodden earth (#e0cfa4) with an ink outline, centred, filling about 84 percent of the image width, its base on the ground line at 88 percent of the image height. Bolder outline (about 4 percent of the image width) and simplified detail, because the icon is shown at about 40 pixels. Hanging trade signs, if any, show a simple pictogram, never letters. No people, no flags, no text.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `buildings/town-hall__1` | 1024x1024 | transparent | Town Hall: a modest two-storey timber meeting hall with cream clapboard walls (#fbf3df), a red roof, symmetrical windows, a central double door at the top of three steps, and a small white cupola on the ridge holding a bell (#e8b830). |
| `buildings/carpenter__1` | 1024x1024 | transparent | Carpenter's House: a small timber workshop with a red roof and a wide open front, a sawhorse with a plank and a stack of boards (#c8955a) outside. |
| `buildings/carpenter__2` | 1024x1024 | transparent | Lumber Mill: a larger two-storey timber sawmill with a slate-blue roof, a big wooden waterwheel turning on its side in a short millrace (#8ed0ec), a pile of logs and stacked sawn planks in front. |
| `buildings/blacksmith__1` | 1024x1024 | transparent | Blacksmith's House: a small stone-and-timber smithy with a red roof, a stone chimney with a small flat grey smoke puff, an anvil on a stump by the open door, a horseshoe over the door. |
| `buildings/blacksmith__2` | 1024x1024 | transparent | Blacksmith's Shop: a larger brick smithy (#b0402c bricks shown as flat colour, few joints) with a slate-blue roof, two chimneys, wide open double doors showing a flat orange-yellow forge glow (#ffd84a), iron bars stacked outside. |
| `buildings/tobacconist__1` | 1024x1024 | transparent | Tobacconist's House: a small timber cottage with a red roof, bunches of large tobacco leaves (#9a8a3a) hanging to dry under the eaves, a small barrel by the door. |
| `buildings/tobacconist__2` | 1024x1024 | transparent | Tobacconist's Shop: a tall brick-and-timber shop with a slate-blue roof, a hanging sign showing a cigar pictogram, louvered drying slats in the upper storey, crates stacked by the door. |
| `buildings/weaver__1` | 1024x1024 | transparent | Weaver's House: a small timber cottage with a red roof, a wooden handloom visible through the open door, skeins of yarn hanging on a rail outside. |
| `buildings/weaver__2` | 1024x1024 | transparent | Weaver's Shop: a long two-storey brick workshop with a slate-blue roof and a row of large windows, bolts of red cloth (#c8384a) stacked by the door, a hanging sign showing a shuttle pictogram. |
| `buildings/distiller__1` | 1024x1024 | transparent | Distiller's House: a small stone house with a red roof, a copper pot still (#c58a3e) with a coiled pipe standing in a lean-to beside it, two barrels. |
| `buildings/distiller__2` | 1024x1024 | transparent | Distiller's Shop: a larger brick distillery with a slate-blue roof, a tall brick chimney, a pyramid of rum barrels (#a2683a) beside the loading door. |
| `buildings/fur-trader__1` | 1024x1024 | transparent | Fur Trader's House: a small log cabin (#a8743f) with a red-shingled roof, two pelts stretched on round hoops hanging on the front wall, a bench by the door. |
| `buildings/fur-trader__2` | 1024x1024 | transparent | Fur Trading Post: a large two-storey log trading post with a slate-blue roof and a covered front porch, stacked bales of furs (#9b6a3e) on the porch, a canoe resting on trestles beside it. |
| `buildings/armory__1` | 1024x1024 | transparent | Armory: a squat, solid stone building (#b9b2a6) with a red roof, a heavy iron-strapped wooden door, small barred windows, a rack of muskets just inside the open door. |
| `buildings/armory__2` | 1024x1024 | transparent | Magazine: a fortified stone powder magazine with thick buttressed walls and a low vaulted slate-blue roof, a lightning rod, a heavy door, a neat pyramid of cannonballs (#55585c) and a powder keg beside it. |
| `buildings/church__1` | 1024x1024 | transparent | Chapel: a small white timber chapel (#fffdf6) with a red roof, a tiny open bell-cote on the front gable holding one bell, a plain cross on top, one arched window. |
| `buildings/church__2` | 1024x1024 | transparent | Church: a white church with a slate-blue roof, a tall square tower topped by a slender steeple and a plain cross, tall arched windows, double front doors at the top of steps. |
| `buildings/docks__1` | 1024x1024 | transparent | Docks: a simple timber wharf on wooden piles standing in a patch of water (#8ed0ec) with a few wave strokes (#3a80b4), mooring bollards, a coil of rope and two crates on the planks. |
| `buildings/docks__2` | 1024x1024 | transparent | Drydock: a stone-lined dry dock basin with stepped sides (#b9b2a6), a small ship's hull (#9a5b2e) propped on wooden shores inside it, wooden lock gates at the water end (#8ed0ec), a slate-blue roofed tool shed beside it. |
| `buildings/docks__3` | 1024x1024 | transparent | Shipyard: a slipway on the water's edge with the large ribbed frame of an unfinished ship's hull, a tall wooden crane with a pulley, stacks of timber, a long slate-blue roofed shipwright's shed. |
| `buildings/warehouse__1` | 1024x1024 | transparent | Warehouse: a wide wooden barn-like storehouse with a red roof and big double doors standing open, crates, sacks and barrels stacked inside and outside. |
| `buildings/warehouse__2` | 1024x1024 | transparent | Warehouse Expansion: a larger two-storey brick warehouse with a slate-blue roof, a hoist beam with a pulley and rope above the loft door, a crate swinging from the hook, more barrels and crates in front. |
| `buildings/stockade__1` | 1024x1024 | transparent | Stockade: a short straight section of palisade wall made of sharpened vertical logs (#a8743f) with a plank gate in the middle and one small log watchtower at the right end. |
| `buildings/stockade__2` | 1024x1024 | transparent | Fort: a section of grey dressed-stone curtain wall (#b9b2a6) ending in a pointed corner bastion with a cannon muzzle in its embrasure, an arched gate with heavy wooden doors. |
| `buildings/printing-press__1` | 1024x1024 | transparent | Printing Press: a small timber shop with a red roof, a large wooden screw printing press visible through the wide front window, stacks of blank paper by the door, a hanging sign showing a quill pictogram. |
| `buildings/printing-press__2` | 1024x1024 | transparent | Newspaper: a two-storey brick newspaper office with a slate-blue roof, a printing press in the ground-floor window, blank broadsheets pinned in a display board by the door (no lettering, just blank pale rectangles), a hanging sign showing a quill pictogram. |
| `buildings/schoolhouse__1` | 1024x1024 | transparent | Schoolhouse: a one-room timber schoolhouse with a red roof, a small bell-cote with a bell on the front gable, three windows along the side, a little fenced yard. |
| `buildings/schoolhouse__2` | 1024x1024 | transparent | College: a symmetrical two-storey brick college building with a slate-blue roof, rows of white-framed windows, a central door with a fanlight, and a white cupola on the ridge. |
| `buildings/schoolhouse__3` | 1024x1024 | transparent | University: a grand three-storey stone university hall (#b9b2a6 and #fbf3df) with a classical portico of four columns under a triangular pediment, a slate-blue roof and a central dome. |
| `buildings/custom-house__1` | 1024x1024 | transparent | Custom House: a dignified stone custom house with a slate-blue roof, a small columned porch, a bare flagpole on the roof, crates and barrels lined up on a short quay in front. |

### 4.13 UI pieces

```category ui
FORMAT: A user-interface graphic for a comic-styled game, flat colours and the same even ink outline as all the game art, transparent background outside the shape. No text, letters or numbers anywhere; any space meant for text is left perfectly empty and flat.
```

| File | Size | BG | Prompt |
| --- | --- | --- | --- |
| `ui/caption-frame` | 1536x1024 | transparent | A comic speech-caption frame designed for nine-slice scaling: a wide rounded rectangle filling about 90 percent of the image width and 60 percent of its height, flat white fill (#fffdf6), one even ink outline, all four corners identical with a modest radius, perfectly straight edges between them, and a short pointed speech tail at the bottom centre. The interior is completely empty. |
| `ui/panel-border` | 1024x1024 | transparent | A square decorative panel frame designed for nine-slice scaling: a flat cream panel (#fffaf0) with an even ink outline, an inner second thin ink rule set in from the edge, and four identical small corner ornaments shaped like a stylised compass point and a rope knot, straight plain edges between the corners. The interior is completely empty and flat. |
| `ui/title-emblem` | 1536x1024 | transparent | A title emblem with no lettering: a three-masted sailing ship under full sail (canvas white sails, brown hull) in front of a large compass rose (#ffd23f and #3a6fb0 points), behind which lies a partly unrolled old map of a coastline (#f5eedc with #8ed0ec sea), all encircled by a ring of rope; below it, a wide blank ribbon banner in red (#d23c2a) with its centre left completely empty for a title to be added later. |

The game sets its own text in HTML over `caption-frame` and `title-emblem`. The procedural caption in `renderer.ts` stays the better choice on the map itself, because it resizes to the text. Use `caption-frame` for dialogs and the title screen.

---

## 5. Output specs and folder layout

### Sizes per category

| Category | Request (`size`) | Runtime files | Drawn in game at | Normalise box (share of width × height, anchor) |
| --- | --- | --- | --- | --- |
| Style bible | 1536×1024 | none (reference only) | n/a | n/a |
| Units: people and mounted | 1024×1024 | 256, @128, @64, @32 | map: 0.86 × tile (17–110 px), 0.62 × tile inside colonies; icons: 28–72 px | standing 0.60 × 0.74, mounted 0.80 × 0.76; bottom at 0.88 |
| Units: vehicles | 1024×1024 | 256, @128, @64, @32 | as units | 0.84 × 0.70, bottom at 0.88 |
| Units: ships | 1024×1024 | 256, @128, @64, @32 | as units; Europe screen 40 px; new-game 72 px | width by class (0.64 / 0.76 / 0.84 / 0.90), waterline at 0.82 |
| Overlays | 1024×1024 | 128, @64, @32 | pennant about 0.24 × tile; flag about 0.3 × tile | 0.70 × 0.70, centred |
| Goods and products | 1024×1024 | 128, @64, @32 | 18–30 px (colony and cargo), up to 56 px | 0.80 × 0.80, centred |
| Terrain base tiles | 1024×1024 opaque | 256, @128, @64, @32 | 20–128 px per tile | none (full-bleed) |
| Coast and road overlays | 1024×1024 | 256, @128, @64, @32 | 20–128 px per tile | none (edge-aligned) |
| Decorations | 1024×1024 | 256, @128, @64, @32 | 0.7–0.95 × tile | 0.88 × 0.80, bottom at 0.90 |
| Colonies | 1024×1024 | 256, @128, @64, @32 | 0.95 × tile | 0.80 × 0.80, bottom at 0.88 |
| Stockade and fort | 1024×1024 | `__back` and `__front`, 256 and smaller | 0.95 × tile | none (keep aligned with colonies) |
| Native settlements | 1024×1024 | 256, @128, @64, @32 | 0.9 × tile | 0.84 × 0.80, bottom at 0.88 |
| Building icons | 1024×1024 | 128, @64, @32 | about 40 px | 0.84 × 0.80, bottom at 0.88 |
| UI | 1536×1024 or 1024×1024 | full size and half size | CSS `border-image`, title screen | none |

Normalising means trimming the transparent margin, scaling uniformly so the subject fits the box, and placing it on a fresh transparent square with its bottom on the anchor line. That makes every colonist the same height and every frigate the same length, whatever the model drew. Skip it for full-bleed and edge-aligned art.

### File names

- Names are engine ids in kebab-case: `id.replace(/[A-Z]/g, c => '-' + c.toLowerCase())`. Variants follow `__`.
- Units: `units/<unit-type>__<role>.png`. Every unit type has `__none`; colonists also have `__soldier`, `__dragoon`, `__pioneer`, `__scout` and `__missionary` (none for `native-convert__missionary`).
- Goods: `goods/<product-id>.png`, including `hammers`, `bells` and `crosses`.
- Terrain: `terrain/<terrain-id>.png`, `terrain/<terrain-id>__plowed.png`, `terrain/coast__edge|inner|outer.png`.
- Decorations: `decor/forest__<terrain-id>.png`, `decor/hills.png`, `decor/mountains.png`, `decor/ruins.png`, `decor/bonus__<kind>.png`, `decor/road__hub|spoke|spoke-diagonal.png`.
- Colonies: `colonies/colony__small|medium|large.png`, `colonies/stockade__back|front.png`, `colonies/fort__back|front.png`.
- Settlements: `settlements/<tribe-id>.png`, `settlements/<tribe-id>__capital.png`.
- Buildings: `buildings/<building-kind>__<level>.png`, with levels starting at 1 as in `BUILDINGS[kind].levels`.
- Pre-scaled copies get an `@<px>` suffix: `units/free-colonist__soldier@64.png`.
- Extra variants, for less repetition on the map, get a `__v2` or `__v3` suffix: `terrain/plains__v2.png`, `decor/forest__plains__v2.png`. The plugin picks one with `hash2(x, y)`.

### Folder layout

```
art/                                   source art; commit it (Git LFS recommended), it is not shipped
  manifest.json                        built from this document by build-manifest.mjs
  anchors/<category>.png               approved anchor per category, used as an extra reference
  masters/<file>.png                   1024 px masters straight from the API, e.g. masters/units/free-colonist__none.png
  masters/bible/style-bible.png
  rejects/                             discarded takes, handy for comparing drift
packages/style-ligne-claire-bitmap/
  assets/
    units/free-colonist__none.png      256 px
    units/free-colonist__none@128.png
    units/free-colonist__none@64.png
    units/free-colonist__none@32.png
    units/caravel__none.png ...
    overlays/pennant.png ...           128 px
    goods/food.png ...                 128 px
    terrain/ocean.png, terrain/plains__plowed.png, terrain/coast__edge.png ...
    decor/forest__tundra.png, decor/bonus__fish.png, decor/road__spoke.png ...
    colonies/colony__small.png, colonies/stockade__back.png ...
    settlements/inca__capital.png ...
    buildings/schoolhouse__3.png ...   128 px
    ui/panel-border.png ...
  src/                                 the plugin: loads assets, falls back to @cc/style-ligne-claire
```

Loader rule of thumb: for a unit, try `units/<type>__<role>`, then `units/<type>__none`, then the procedural sprite. Pick the smallest pre-scaled copy that is at least the drawn size × `pixelRatio`.

---

## 6. Batch generation scripts

These are outlines; run them from the repo root with Node 20 or later. They need two packages, which you install only where you generate art (they are not game dependencies): `npm i -D openai sharp`. The API key comes **only** from the `OPENAI_API_KEY` environment variable (`export OPENAI_API_KEY=...`); never write it into a file or commit it.

### 6.1 Build the manifest from this document

This document is the single source of truth. The builder reads the master block, every `category` block and every prompt row, and writes `art/manifest.json` as a list of `{ id, size, background, category, prompt }` entries.

```js
// scripts/sprites/build-manifest.mjs
import fs from 'node:fs';

const md = fs.readFileSync('docs/SPRITE_PROMPTS.md', 'utf8');
const lines = md.split('\n');
const master = md.match(/```master\n([\s\S]*?)\n```/)[1].trim();
const blocks = {};
const items = [];
let category = null;

for (let i = 0; i < lines.length; i++) {
  const open = lines[i].match(/^```category ([a-z-]+)$/);
  if (open) {
    const body = [];
    while (!lines[++i].startsWith('```')) body.push(lines[i]);
    category = open[1];
    blocks[category] = body.join('\n').trim();
    continue;
  }
  const row = lines[i].match(/^\| `([a-z0-9/_@-]+)` \| (\d+x\d+) \| (transparent|opaque) \| (.+) \|$/);
  if (row) items.push({ id: row[1], size: row[2], background: row[3], category, prompt: row[4].trim() });
}

const ids = new Set();
for (const it of items) {
  if (ids.has(it.id)) throw new Error(`duplicate id ${it.id}`);
  ids.add(it.id);
}
fs.mkdirSync('art', { recursive: true });
fs.writeFileSync('art/manifest.json', JSON.stringify({ master, blocks, items }, null, 2));
console.log(`${items.length} prompts in ${Object.keys(blocks).length} categories`);
```

### 6.2 Generate masters, skipping existing files

```js
// scripts/sprites/generate.mjs
// Usage: node scripts/sprites/generate.mjs [id-prefix] [--variants 2]
//   e.g. node scripts/sprites/generate.mjs bible/        (first, without a reference)
//        STYLE_REF=art/masters/bible/style-bible.png node scripts/sprites/generate.mjs units/
import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';

if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY in the environment.');
const client = new OpenAI(); // reads OPENAI_API_KEY itself

const MODEL = process.env.IMAGE_MODEL ?? 'gpt-image-1';
const QUALITY = process.env.QUALITY ?? 'high';
const STYLE_REF = process.env.STYLE_REF; // the approved style bible
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const OUT = 'art/masters';
const REF_PREAMBLE =
  'The attached image(s) are a style reference sheet. Copy their line weight, flat colouring, palette, viewpoint and level of detail exactly, but draw only the single new subject described below, not anything from the sheet.';

const args = process.argv.slice(2);
const prefix = args.find((a) => !a.startsWith('--')) ?? '';
const variants = Number(args[args.indexOf('--variants') + 1] || 1);
const { master, blocks, items } = JSON.parse(await fs.readFile('art/manifest.json', 'utf8'));

const exists = (f) => fs.access(f).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function refs(category) {
  const files = [];
  if (STYLE_REF && category !== 'bible') files.push(STYLE_REF);
  const anchor = `art/anchors/${category}.png`;
  if (category !== 'bible' && (await exists(anchor))) files.push(anchor);
  return Promise.all(files.map(async (f) => toFile(await fs.readFile(f), path.basename(f), { type: 'image/png' })));
}

async function generate(item) {
  const images = await refs(item.category);
  const prompt = [images.length ? REF_PREAMBLE : '', master, blocks[item.category] ?? '', `SUBJECT: ${item.prompt}`]
    .filter(Boolean)
    .join('\n\n');
  const params = { model: MODEL, prompt, size: item.size, quality: QUALITY, background: item.background, output_format: 'png', n: 1 };
  for (let attempt = 1; ; attempt++) {
    try {
      const res = images.length
        ? await client.images.edit({ ...params, image: images, input_fidelity: 'high' })
        : await client.images.generate(params);
      return Buffer.from(res.data[0].b64_json, 'base64');
    } catch (err) {
      const retry = err.status === 429 || err.status >= 500;
      if (!retry || attempt >= 5) throw err;
      await sleep(2 ** attempt * 2000);
    }
  }
}

const jobs = [];
for (const item of items.filter((it) => it.id.startsWith(prefix))) {
  for (let v = 1; v <= variants; v++) {
    const file = path.join(OUT, `${item.id}${v > 1 ? `__v${v}` : ''}.png`);
    jobs.push({ item, file });
  }
}

let done = 0;
async function worker() {
  while (jobs.length) {
    const { item, file } = jobs.shift();
    if (await exists(file)) { console.log(`skip  ${file}`); continue; }
    try {
      const png = await generate(item);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, png);
      console.log(`ok    ${file} (${++done})`);
    } catch (err) {
      console.error(`FAIL  ${file}: ${err.status ?? ''} ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
```

Notes:

- **Skip existing:** delete a master (or move it to `art/rejects/`) to regenerate it, and the next run fills the gap.
- **Order of work:** run `bible/` first without `STYLE_REF`, then approve and fix the sheet. After that, for each category: generate the first asset, approve it, copy it to `art/anchors/<category>.png`, then generate the rest.
- **Content filter:** a refusal comes back as an HTTP 400 and is logged, not retried. Reword the row (usually a weapon or historical-conflict phrase) and run again.
- **Role sheets (optional):** to keep one colonist's face identical across roles, ask for a 3×2 sheet of the six roles at `1536x1024` (`background: transparent`), slice it into six cells, and pass the cells through the same derive step. Use the prompts of one `#### <type>` table joined as "top-left: …, top-middle: …".

### 6.3 Derive runtime files

The derive step normalises, splits the defence overlays, pre-scales, and writes into the plugin's `assets/` folder.

```js
// scripts/sprites/derive.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'art/masters';
const DST = 'packages/style-ligne-claire-bitmap/assets';

// [width share, height share, bottom anchor] per category; null = keep as generated.
const BOX = {
  units: [0.6, 0.74, 0.88], vehicles: [0.84, 0.7, 0.88], ships: null, overlays: [0.7, 0.7, 0.85],
  goods: [0.8, 0.8, 0.9], terrain: null, 'ground-overlays': null, decor: [0.88, 0.8, 0.9],
  colonies: [0.8, 0.8, 0.88], settlements: [0.84, 0.8, 0.88], buildings: [0.84, 0.8, 0.88], ui: null,
};
const SIZES = { icon: [128, 64, 32], map: [256, 128, 64, 32] };
const { items } = JSON.parse(await fs.readFile('art/manifest.json', 'utf8'));

async function normalise(buf, box) {
  if (!box) return buf;
  const [bw, bh, bottom] = box;
  const S = 1024;
  const trimmed = await sharp(buf).trim().toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const k = Math.min((bw * S) / width, (bh * S) / height);
  const w = Math.round(width * k), h = Math.round(height * k);
  const subject = await sharp(trimmed.data).resize(w, h, { kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: subject, left: Math.round((S - w) / 2), top: Math.round(bottom * S - h) }])
    .png().toBuffer();
}

async function write(id, buf, sizes) {
  for (const [i, px] of sizes.entries()) {
    const file = path.join(DST, `${id}${i ? `@${px}` : ''}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await sharp(buf).resize(px, px, { kernel: 'lanczos3', fit: 'fill' }).png({ compressionLevel: 9 }).toFile(file);
  }
}

for (const item of items) {
  if (item.category === 'bible') continue;
  const src = path.join(SRC, `${item.id}.png`);
  const buf = await fs.readFile(src).catch(() => null);
  if (!buf) continue;
  if (item.category === 'ui') { await fs.mkdir(path.dirname(path.join(DST, item.id)), { recursive: true }); await fs.copyFile(src, path.join(DST, `${item.id}.png`)); continue; }
  const sizes = ['goods', 'buildings', 'overlays'].includes(item.category) ? SIZES.icon : SIZES.map;
  const mounted = /__(dragoon|scout)$/.test(item.id);
  const box = item.category === 'units' && mounted ? [0.8, 0.76, 0.88] : BOX[item.category];
  const norm = await normalise(buf, box);
  if (item.id === 'colonies/stockade' || item.id === 'colonies/fort') {
    const cut = Math.round(1024 * 0.58);
    const back = await sharp(norm).extract({ left: 0, top: 0, width: 1024, height: cut }).extend({ bottom: 1024 - cut, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const front = await sharp(norm).extract({ left: 0, top: cut, width: 1024, height: 1024 - cut }).extend({ top: cut, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await write(`${item.id}__back`, back, sizes);
    await write(`${item.id}__front`, front, sizes);
    continue;
  }
  await write(item.id, norm, sizes);
}
```

Ships are left unnormalised on purpose, because their size class is part of the prompt. Normalise them by hand with the class width if the model ignores it (see the QA section).

---

## 7. QA checklist and fixing drift

Review each batch on a contact sheet: all sprites of a category side by side at 256 px, and again at 32 px over the matching terrain colour. `sharp` or ImageMagick `montage` will build one.

### Checklist

- [ ] **Line weight:** outlines are near-black, unbroken and the same thickness across the sheet. No sprite looks noticeably thinner, thicker or brushier than the anchor. Interior lines match the outline weight.
- [ ] **Palette:** fills are flat. Sample a few pixels: roofs read `#d23c2a`, hulls `#9a5b2e`, sails `#fffaf0`, terrain bases within a few units of their hex. Nothing is greyed, muddy or neon, and there are no gradients or soft shading.
- [ ] **No hatching, texture or cast shadows:** zoom to 200% and look for cross-hatching, paper texture, noise and soft drop shadows.
- [ ] **Scale:** after normalising, standing colonists line up head to foot, horses match each other, and ship lengths follow the class order caravel < merchantman = privateer < galleon = frigate < man-of-war. Colonies grow small < medium < large.
- [ ] **Viewpoint:** the same high three-quarter angle everywhere, subjects facing right, light from the upper left. Terrain tiles are strictly top-down, with no horizon and no tilted perspective.
- [ ] **Framing:** margins are clear, nothing is cropped, and the ground line sits at 88%.
- [ ] **Transparency:** the background is truly transparent (check the alpha channel), with no white or grey halo. Opaque terrain tiles have no transparent pixels.
- [ ] **Seamless tiles:** tile each terrain 3×3 (`montage -tile 3x3`) and look for visible seams. Motifs stay clear of the edges.
- [ ] **Legibility at 32 px:** every unit's role is identifiable (musket, horse, spade, telescope, cross). Goods are distinguishable at 18 px (tools vs hammers, cloth vs coats, ore vs silver). Building levels are distinguishable by roof colour and size.
- [ ] **Nation neutrality:** no flags, cockades in nation colours, crosses on sails or coats of arms. The only colours on overlays are white cloth and ink.
- [ ] **No text:** no letters, numbers, signatures or pseudo-writing on signs, banners, maps or broadsheets.
- [ ] **Respect:** native settlements show the right culture's architecture, with no people, weapons or stereotypes. Native convert sprites are dignified and plainly dressed.
- [ ] **Anachronisms:** no top hats, uniforms after the 1780s or steamships.

### Fixing drift

- **Regenerate first** if an asset is far off. It is cheap, and nothing anchors to a bad image.
- **Edit with a reference** for near misses: call `images.edit` with the faulty master plus the anchor, and a short instruction such as *"Redraw this exact subject, unchanged in pose and composition, but with the outline weight and flat colouring of the second image; remove all shading gradients."* Use `input_fidelity: "high"` to keep the composition.
- **Masked edits** for local faults (a stray flag, a lettered sign, a smudge): pass a `mask` PNG whose transparent area marks the region to repaint, with *"replace with plain cream wall"* or similar.
- **Line too thin after downscaling:** regenerate with "outline about 4 percent of the image width". Alternatively, thicken it in post: dilate the near-black pixels by 1 px at 256 px, for example with `sharp().convolve` or ImageMagick `-morphology Dilate`, applied only to pixels darker than `#3a3a3a`.
- **Palette drift:** before deriving, snap colours to the palette. Quantise each master to the nearest palette entry (plus the ink and its anti-aliasing steps). Only do this to masters with clean flat fills, or edges get jaggy. A milder fix is a per-sprite hue and saturation adjustment.
- **Scale drift:** the derive step's normalising box handles most of it. For ships, crop by hand to the class width.
- **Style creep across a long run:** never use a recently generated asset as the anchor unless it has been approved. Re-anchor every category to the same bible, not to each other.
- **When nothing works at small sizes:** let the plugin fall back to the procedural `ligne-claire` sprite below a size threshold. It was designed for 20 px tiles.
