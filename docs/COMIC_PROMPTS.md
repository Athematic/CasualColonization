# Comic art prompts

Prompt blocks for drawing the interior art of the fifteen twelve-page comics in [`docs/comics/`](comics/README.md), in the same ligne claire album style as the covers ([`BOX_ART_PROMPTS.md`](BOX_ART_PROMPTS.md) section 2). `tools/image-gen/Generate-Images.ps1 -Doc comics` reads the four blocks below, so edit them here.

## 1. Approach

- **Art only, no lettering.** The images contain no text at all: no speech balloons, captions or sound effects. The words stay in the scripts and are set on top in a layout tool, so spelling is exact and the lettering can be redone without redrawing. Every panel therefore leaves calm space (sky, wall, snow, empty ground) where balloons will go.
- **The script is the source.** Each comic's `## Cast` section gives every character's look, and every panel's first paragraph is its visual description. The tool parses them; nothing is copied into this file.
- **Consistency from text alone.** The generations endpoint takes no reference image, so each prompt carries a CAST block with the look of exactly the characters who appear in that page or panel (named in the visual descriptions or speaking in the dialogue), copied from the script. Generate the model sheet (`-ComicUnit cast`) first to see whether the cast reads well, then fix the Cast section of the script if a character drifts.
- **Three units.** `page` (default): one 1024x1536 image per script page, laid out as an album grid. `panel`: one image per panel (1536x1024 for wide, splash or establishing panels, otherwise 1024x1024), for more control at about five times the cost. `cast`: one 1536x1024 character model sheet per comic.
- **Prompt assembly.** Page: comic style block, SETTING line, CAST block, page block, then the panel descriptions in order ("PANEL 1 (wide): ..."). Panel: style, SETTING, CAST, panel block, the description. Cast sheet: style, SETTING, the whole cast, cast block. Dialogue and captions are never sent.
- **Cost.** A full set is 15 cast sheets plus 180 pages (195 images); panel mode is about 900 images. Page mode is the sensible default.

## 2. Comic style block

Pasted, unchanged, at the start of every comic prompt.

```comic
STYLE: A strictly flat, clean-line European adventure-album interior page illustration ("ligne claire"), 1950s printing look, from a comic about founding colonies in the Americas and beyond between the years 1000 and 1800. It must look like one hand-drawn album, with the same characters drawn the same way on every panel and page.

LINE: Every shape is enclosed by one continuous, unbroken outline in near-black ink (#1b1a17), the same constant weight throughout, thinner for distant objects only. No tapering brush lines, no sketchy or doubled lines, no cross-hatching.

COLOUR: Flat, solid colour fields, bright and clear like a printed comic album. Skies in clear blue in two or three flat bands at most (no airbrushed gradient); clouds are simple flat white shapes with clean ink outlines. At most one flat, hard-edged shadow tone per surface. No airbrush, no texture, no halftone dots, no glow, no lens effects.

DRAWING: Ships, buildings, tools and costumes drawn with the precision of a researched technical illustration, correct for the place and period named in the SETTING line. People are realistically proportioned and slightly simplified, with calm, alert, expressive faces; dot eyes, small noses. The same character keeps the same face, hair, clothes and colours in every panel. Clear, iconic silhouettes, readable gestures, backgrounds that stay simple and consistent from panel to panel.

PANELS: Interior comic page. Panels are separated by clean ink panel borders of constant weight on white gutters of equal width; the page itself is white. Each panel is a single clear moment with a readable foreground, middle ground and background. In every panel leave a calm, uncluttered area (sky, wall, snow, water, empty ground) where speech balloons and captions will be added later; keep faces and key action out of it.

PALETTE: ink #1b1a17; paper cream #f5eedc; white #fffdf6; skin #f3c9a0; roof red #d23c2a; slate blue #3a6fb0; cream wall #fbf3df; wood #a8743f; dark wood #8a5a32; stone #b9b2a6; sail canvas #fffaf0; ship hull #9a5b2e; gold #ffd23f; shallow sea #8ed0ec; deep sea #64b2df; wave lines #3a80b4; greens #58a548, #3d8a4c, #78b84e; plains #cfe39a; sand #f4e3ae. Saturated but not neon. Skin tones vary naturally with the people described in the CAST.

PEOPLE AND CULTURES: Indigenous peoples are shown with dignity, as equals and hosts, in historically grounded dress, tools and architecture for the region named in the SETTING line. No caricature, no stereotyped poses, no "savage" imagery, no feathered war-bonnet clichés unless the region calls for it. European nations are suggested only by coat colours and plain coloured pennants, never real flags, coats of arms or royal emblems.

NO LETTERING: Do not draw any text. No speech balloons, thought bubbles, caption boxes, sound-effect words, titles, page numbers, signs with writing, labels or letters of any kind; signs, ledgers, maps and banners show only blank surfaces or abstract marks.

DO NOT INCLUDE: any text, letters, numbers, logos, publisher marks, signatures or watermarks; any recognisable existing comic character, game character or real person; photorealism, 3D render or CGI look; painterly or watercolour texture; gradients beyond two or three flat sky bands; anime or manga style; gore, blood, or weapons pointed at anyone.
```

## 3. Page block

Added after the style, setting and cast, followed by the panel descriptions.

```page
PAGE LAYOUT: One portrait album page (2:3) with {PANEL_COUNT} panels in a classic album grid of horizontal tiers: two to four tiers of one to three panels each, on a white page with equal white gutters and thin ink borders; margins around the grid. Draw the panels in the order given, left to right, then top to bottom, so PANEL 1 is at the top left and the last panel at the bottom right. Panel sizes follow the hints in brackets: "splash" or "wide" panels run the full width of the page and are the tallest or broadest; "small" panels are narrow insets; unmarked panels are medium and share a tier. Every panel must be visible and complete, fully inside its border. Keep the characters in the CAST looking exactly as described in every panel. No text, no balloons, no captions, no panel numbers anywhere: leave a calm area in each panel for lettering.

THE PANELS, IN ORDER:
```

## 4. Panel block

Added after the style, setting and cast when `-ComicUnit panel` draws one panel at a time.

```panel
SINGLE PANEL: One comic panel, drawn full frame as a single picture with a thin ink border and a narrow white margin; not a page, no other panels. Keep the characters in the CAST looking exactly as described. Leave a calm, uncluttered area (sky, wall, snow, water or ground) for lettering added later. No text, no balloons, no captions anywhere.

THE PANEL:
```

## 5. Cast block

Used for the model sheet of each comic (`-ComicUnit cast`), after the style, setting and the full cast.

```cast
CHARACTER MODEL SHEET: Draw every character of the CAST once more as a model sheet for the comic, on a plain cream (#f5eedc) background with no scenery. One row per character, in the order listed: each character full-figure, head to toe, twice in the row, front view on the left and three-quarter view on the right, standing in a relaxed neutral pose with a neutral, friendly face, drawn at the same scale so heights compare correctly. Show every costume item and carried object described. Characters described together as a group or pair get their own figures. Even spacing, no overlaps, nothing cropped. No text of any kind: no names, labels, captions or numbers.
```

## 6. Format of the scripts

The tool reads every `docs/comics/*.md` except `README.md`. A script has a `# Title`, intro paragraphs (`Logline`, `Cover moment`, `Setting`, with a bold label ending in `.` or `:`), a cast list under `## Cast` or a bold `**Cast**` / `**Cast.**` line (bullets `- **Name**, look`, `- **Name**: look`, `- **Name:** look`), then `## PAGE 1` to `## PAGE 12`. In a page a panel starts with `**Panel N.**` or with `N.` at the start of a line; the first paragraph after the marker is the visual description, and the `CAPTION:`, `SFX:` and `NAME:` lines after it are lettering.
