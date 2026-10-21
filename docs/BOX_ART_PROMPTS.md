# Box cover art prompts

Prompts for generating cover art for **Casual Colonization** with OpenAI's image models. They follow the same *ligne claire* style as [SPRITE_PROMPTS.md](SPRITE_PROMPTS.md): even black outlines, flat bright colour, precisely drawn ships and buildings, believable people. The difference is scale. A sprite is one small subject; a cover is one large, carefully composed scene in the manner of a classic Franco-Belgian adventure album cover, with room left for the title.

As in the sprite prompts, the style is described only through visual traits. No prompt names an artist, a comic, a character, another game or its designer. Keep it that way when you edit them; see [Names to keep out](#names-to-keep-out).

## 1. How to use this document

### Model and settings

| Setting | Value | Why |
| --- | --- | --- |
| Model | `gpt-image-1`, or a newer model in the same family | Follows long style blocks well, renders short titles reasonably, and accepts reference images. |
| Endpoint | `images.generate`; or `images.edit` with the sprite style bible as a reference | Using the style bible (`art/masters/bible/style-bible.png`, see the sprite prompts) keeps the cover consistent with in-game art. |
| `size` | `1024x1536` (portrait) for the front and back cover; `1536x1024` for the wide banner; `1024x1024` for the icon | Portrait 2:3 is close to a game box or album cover. |
| `background` | `"opaque"` | Covers are full-bleed. |
| `quality` | `"high"` for finals; `"low"` while trying concepts | Low is roughly ten times cheaper and enough to judge a composition. |
| `n` | 3 or 4 while exploring, then 1 | Covers vary a lot from run to run; generate several and pick. |

Upscale the chosen 1024×1536 image for print (an AI upscaler, or regenerate at a larger size if your model supports it). A box front at 300 dpi needs roughly 2400×3300 px.

### Recommended workflow

1. **Explore at low quality.** Run each front-cover concept in section 3 three or four times, without the title. Pick the strongest composition.
2. **Lock the style.** Regenerate the chosen concept at high quality with `images.edit`, passing the sprite style bible as the reference image, so the cover's colours and line match the game.
3. **Add the title in layout, not in the image.** Leave the title band empty, as the prompts ask, and set the title on top in a layout tool or SVG (section 6). This gives crisp, correctly spelled lettering at any size. If you do want the model to letter the title, use the optional prompt in section 6 and check the spelling closely.
4. **Make the rest of the set from the chosen front.** Pass the approved front cover as a reference image when generating the back cover, banner and icon, so the whole box reads as one design.

## 2. Cover style block

Paste this block, unchanged, at the start of every cover prompt, then add the concept text after it.

```cover
STYLE: A painted-looking but strictly flat, clean-line European adventure-album cover illustration ("ligne claire"), 1950s printing look, for a strategy game about founding colonies in the Americas between 1500 and 1800.

LINE: Every shape is enclosed by one continuous, unbroken outline in near-black ink (#1b1a17), the same constant weight throughout, thinner for distant objects only. No tapering brush lines, no sketchy or doubled lines, no cross-hatching.

COLOUR: Flat, solid colour fields, bright and clear like a printed comic album. Large flat sky in clear blue fading to pale near the horizon in two or three flat bands at most (no airbrushed gradient). Clouds are simple flat white shapes with clean ink outlines. At most one flat, hard-edged shadow tone per surface. No airbrush, no texture, no halftone dots, no glow, no lens effects.

DRAWING: Ships, buildings, tools and costumes drawn with the precision of a researched technical illustration: correct rigging, sails, planking, timber framing, period clothing of the 16th to 18th centuries. People are realistically proportioned and slightly simplified, with calm, alert, adventurous expressions; dot eyes, small noses. Clear, iconic silhouettes that still read when the cover is shrunk to a thumbnail.

COMPOSITION: One single, dramatic, easy-to-read moment. A clear foreground, middle ground and background, with the main figures large in the lower half and a deep, open landscape behind them. Strong diagonals from the ship or the land lead the eye into the picture. Leave the TOP 22 PERCENT of the image as calm, uncluttered sky for the game title: no figures, masts, birds or important detail there. Keep important detail out of the outer 5 percent on every side (it may be trimmed in print).

PALETTE: ink #1b1a17; paper cream #f5eedc; white #fffdf6; skin #f3c9a0; roof red #d23c2a; slate blue #3a6fb0; cream wall #fbf3df; wood #a8743f; dark wood #8a5a32; stone #b9b2a6; sail canvas #fffaf0; ship hull #9a5b2e; gold #ffd23f; shallow sea #8ed0ec; deep sea #64b2df; wave lines #3a80b4; greens #58a548, #3d8a4c, #78b84e; plains #cfe39a; sand #f4e3ae. Sky in clear blues close to #8ed0ec and #64b2df. Saturated but not neon.

PEOPLE AND CULTURES: Indigenous peoples are shown with dignity, as equals and hosts, in historically grounded dress and architecture for the region named in the concept. No caricature, no stereotyped poses, no "savage" imagery, no feathered war-bonnet clichés unless the region calls for it. European nations are suggested only by coat colours and plain coloured pennants, never real flags, coats of arms or royal emblems.

DO NOT INCLUDE: any text, letters, numbers, logos, publisher marks, signatures or watermarks (the title is added later); any recognisable existing comic character, game character or real person; photorealism, 3D render or CGI look; painterly or watercolour texture; gradients beyond two or three flat sky bands; anime or manga style; violence, blood or weapons pointed at anyone.
```

## 3. Front cover concepts

Each concept is a self-contained prompt to append to the style block. Generate them all at low quality first. Concept B fits the game's planned direction (cooperation rather than conquest) best.

### A. Landfall

```text
FRONT COVER, portrait. Morning on a wild Atlantic coast of North America. In the left middle ground, a small two-masted caravel with triangular sails rides at anchor in clear blue water, sails half furled, a plain red pennant at the masthead. In the foreground a wooden longboat has just grounded on a pale sand beach: a colonist in a brown coat and broad-brimmed hat steps onto the sand carrying a wooden crate, a soldier in a grey coat with white cross-belts and a tricorn steadies the boat, and a pioneer with a spade and a bundle of tools looks inland. A scout on a bay horse already stands on a low rise at the right, pointing towards the interior. Behind them, the land opens into green meadows, a river mouth, mixed forest of round deciduous trees and dark conifers, and blue-grey hills and distant snow-capped mountains on the horizon. Far off on the river bank, a small group of Haudenosaunee longhouses with smoke rising, and two people standing at the water's edge watching the newcomers calmly. Gulls are allowed only below the title band. Light from the upper left, a fresh breeze filling the anchored ship's loose sails.
```

### B. Trade at the river (cooperation)

```text
FRONT COVER, portrait. A sunny riverbank clearing on the edge of a great forest. In the foreground, two traders kneel facing each other across a woven mat as equals: a European colonist in a blue coat and tricorn offers a bolt of red cloth and an iron axe head; a Cherokee man in a cloth turban and long hunting shirt offers a bundle of beaver furs and a basket of tobacco leaves. Both smile; a handshake is about to happen. Around them, crates, a barrel and a sack of corn. Behind the European, a flat-bottomed river boat is pulled up on the bank with two more colonists unloading. Behind the Cherokee trader, a small town of wattle-and-daub houses with thatched roofs on a gentle mound, people working in green corn fields. In the far background, a broad river winds towards blue hills, and on it the sails of a merchant ship heading upstream. Mood: welcome, curiosity and opportunity.
```

### C. The growing colony

```text
FRONT COVER, portrait. A busy colonial harbour town at its first prosperous stage, seen from a slightly raised viewpoint on the water. In the foreground, the stern and side of a large three-masted merchant ship moored at a timber wharf, sails furled, crew swinging a cargo net of barrels ashore. On the wharf, colonists roll barrels of sugar and rum, carry bales of cotton and stack crates; a merchant in a cream waistcoat checks a ledger (with no readable writing). Behind, a town of cream timber houses with red and slate-blue roofs climbs a gentle hill: a carpenter's workshop with stacked lumber, a church tower, a wooden stockade along the hilltop, and a town hall with a bell in its cupola. Plowed fields, orchards and forest beyond, then hills. A plain blue pennant flies from a pole on the stockade. Warm, busy, optimistic.
```

### D. The explorer's map

```text
FRONT COVER, portrait. Interior of a ship's great cabin in the stern of a sailing ship. In the foreground, a large wooden chart table under a hanging brass lantern: on it, a hand-drawn parchment map of an unknown coastline with a compass rose, ships and sea creatures drawn on it as simple pictures (no words or letters on the map), a pair of brass dividers, a brass compass, a quill and inkpot, an hourglass. A captain in a long blue coat leans over the map, one finger on the coast, a young navigator holds a telescope beside him, both looking out of the window, excited. Through the row of square stern windows behind them, a bright view of a green coast with mountains and a river mouth, a second ship sailing alongside. The cabin is warm brown wood; the view outside is bright blue and green, drawing the eye.
```

### E. Liberty

```text
FRONT COVER, portrait. Late afternoon on the hilltop of a mature colony. In the foreground, a crowd of colonists of all trades (a farmer with a pitchfork, a blacksmith in a leather apron, a weaver, a preacher in black, a fisherman, a militiaman in a blue coat) gathers around a town crier standing on the steps of a timber town hall; above them, a large bronze liberty bell hangs in an open wooden belfry and is being rung. Hats are thrown in the air; a new plain flag in blue and white, with no symbols, is being raised on a tall pole. Below the hill, a wide view: the colony's red roofs, a harbour with ships, fields and forest stretching to distant mountains under a big clear sky. Mood: hope and independence, not war.
```

## 4. Back cover

The back of a box usually carries a short description, a few screenshots and feature bullets. Generate the art with empty areas for those, then lay out text and real screenshots on top.

```text
BACK COVER, portrait. A comic-album style back page: a cream paper background (#f5eedc) with a thin ink border. Across the upper half, a row of three small rectangular comic panels with ink frames and white gutters, each a small scene: (1) a caravel sailing west across a blue sea; (2) colonists building a timber house beside a forest; (3) a European trader and a native trader shaking hands beside a canoe. Below the panels, a large empty cream area for text, framed by a simple ink rule. In the lower right corner, a small vignette of a scout on a horse on a hill, looking at a distant valley. Absolutely no text, letters or numbers in any panel or area.
```

Use a matching variant for a **spine strip** by cropping the front cover's sky and a small figure (the scout on the hill works well), then adding the title vertically in layout.

## 5. Store banner and icon

```text
WIDE BANNER, landscape 3:2, for a game store page. The same scene and style as the attached front cover (use it as the reference), recomposed wide: the ship on the left third, the main figures in the centre, the landscape opening to the right. Keep the LEFT 40 PERCENT of the sky calm and empty for the title. No text.
```

```text
APP ICON, square. A single bold emblem on a flat deep-sea blue (#64b2df) background with a thick ink circle border: a small two-masted caravel with triangular sails, seen three-quarter from the right, on three stylised wave lines, with a plain red pennant. Large, simple, readable at 32 pixels. No text.
```

## 6. Title lettering

**Recommended: set it yourself.** Use a bold, rounded, slightly condensed display face with a thick ink outline and a flat colour fill, in the manner of classic adventure-album titles. A good free option is a heavy grotesque or rounded sans from Google Fonts, set in cream (#fffdf6) or gold (#ffd23f) with a 3–4 % ink outline (#1b1a17) and a small offset flat shadow in deep blue (#3a6fb0). Put "CASUAL" smaller above "COLONIZATION", centred in the empty sky band. An SVG keeps it sharp at print size:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 300">
  <style>
    .t { font-family: 'Fredoka', 'Arial Rounded MT Bold', sans-serif; font-weight: 700; paint-order: stroke; stroke: #1b1a17; stroke-linejoin: round; text-anchor: middle; }
  </style>
  <text class="t" x="512" y="105" font-size="78" fill="#fffdf6" stroke-width="10" letter-spacing="10">CASUAL</text>
  <text class="t" x="518" y="232" font-size="132" fill="#3a6fb0" stroke-width="0" letter-spacing="4">COLONIZATION</text>
  <text class="t" x="512" y="226" font-size="132" fill="#ffd23f" stroke-width="12" letter-spacing="4">COLONIZATION</text>
</svg>
```

**Optional: let the model letter it.** Append this to a front-cover prompt instead of the "no text" rule (remove `any text, letters` from the DO NOT INCLUDE line for this one run):

```text
TITLE: In the empty sky band at the top, the game title in bold, rounded, hand-lettered comic-album capitals with a thick black outline: the small word "CASUAL" in cream above the large word "COLONIZATION" in golden yellow with a flat dark-blue drop shadow. Spell it exactly C-A-S-U-A-L and C-O-L-O-N-I-Z-A-T-I-O-N. No other text anywhere.
```

Check every letter. Image models still misspell, so regenerate or fix it in layout when they do.

## Names to keep out

Do not put any of these in a prompt, file name or caption: the name of the original game's designer or publisher, the names of other strategy games or their studios, the names of comic artists, comic albums or comic characters, or any real flag, coat of arms or trademark. The visual traits above give the look without them, and naming them risks refusals, imitation of protected characters, and confusion about who made this game.

Also avoid recreating the composition of a specific famous cover. Describe your own scene, as the concepts above do.

## 7. Checking the result

- **Title band:** is the top fifth clear enough for the title, with nothing important under it?
- **Line and colour:** even ink line everywhere, flat fills, no airbrushed gradients, palette close to the game's?
- **Thumbnail test:** shrink it to 200 px wide. Is the scene still readable?
- **People:** are Indigenous people shown with dignity and in dress that fits the region? No caricature?
- **No stray text:** no fake letters on maps, ledgers, signs or flags; no logos or signatures in the corners?
- **Print safety:** nothing important in the outer 5 % on any side?

To fix one detail without losing the rest, use `images.edit` with a mask over that area and a short prompt describing only the change.
