# Sprite pipeline

`build.mjs` turns the 1024 px sprite masters made by [`tools/image-gen`](../image-gen/README.md) into **runtime sprites at fixed sizes**, a **manifest** and a **contact sheet**:

- **Smooth sizes** (48, 64, 96, 128 px by default): one high-quality downscale from the master, in linear light with premultiplied alpha (no dark fringes), with the ink outline thickened a little first so it survives, and a light unsharp mask afterwards.
- **Pixel sizes** (16, 24, 32 px by default): a real pixel-art reduction. Flat palette colours, alpha either 0 or 255, a crisp 1-px ink outline, and thin props (musket, staff, cross, sabre) kept as 1-px lines. This is the crisp, readable version of what an SVG `feDisplacementMap` "pixelate" filter tries to do at run time.

Plain downscaling turns the masters to mush at 24 to 32 px. Fixing that once, offline, means the game only ever draws a ready-made bitmap at, or near, its native size.

It is a stand-alone Node script with its own `package.json` (one dependency, [`sharp`](https://sharp.pixelplumbing.com/), used only to decode and encode PNGs). It is not part of the root npm workspaces, so the game build never sees it.

## Install

Node 22 or later, on macOS, Windows or Linux. Install the dependency once, in this folder:

```sh
cd tools/sprite-pipeline
npm install
```

`sharp` ships prebuilt binaries for macOS (Intel and Apple silicon), Windows (x64, arm64) and Linux (glibc and musl), so there is nothing to compile.

## Run

From the repository root (the same command in bash, zsh, PowerShell and cmd):

```sh
node tools/sprite-pipeline/build.mjs
```

That reads `tools/image-gen/output/sprites/`, writes `tools/sprite-pipeline/out/` and prints the path of the contact sheet, `out/index.html`. Open it in a browser. A run over the first batch (21 colonists) takes about 20 seconds.

```text
node tools/sprite-pipeline/build.mjs [--in DIR|URL] [--out DIR] [--sizes 16,24,32,48,64,96,128] [--pixel-max 32]
```

| Option | Meaning |
| --- | --- |
| `--in DIR\|URL` | Masters: a folder laid out like `tools/image-gen/output/sprites` (`units/<id>.png`, `goods/<id>.png`, ...), or a base URL with the same layout (see below). Default `tools/image-gen/output/sprites`. |
| `--ids FILE` | Ids to fetch for a URL source: one per line (`units/free-colonist__none`, `#` comments allowed) or a JSON array. |
| `--cache DIR` | Download cache for a URL source. Default `tools/sprite-pipeline/cache` (gitignored). |
| `--user-agent UA` | User-Agent for downloads. Default `Mozilla/5.0 (compatible; CasualColonization-sprite-pipeline/1.0)`, with an automatic fallback to a browser string when the server's firewall answers HTTP 455. |
| `--out DIR` | Output folder. Default `tools/sprite-pipeline/out` (gitignored). |
| `--sizes LIST` | Output sizes in px. Default `16,24,32,48,64,96,128`. |
| `--pixel-max N` | Sizes up to N get the pixel treatment, larger sizes the smooth one. Default `32`. |
| `--only LIST` | Only ids containing one of these comma-separated substrings, e.g. `--only lumberjack,__scout`. |
| `--palette core\|extended` | Pixel palette: the 12 style-bible swatches, or those plus gunmetal, iron, dark wood and dark green (default). |
| `--extra-colors N` | Up to N extra colours per sprite for large areas far from the palette (default 3, `0` = strict palette). |
| `--outline 4\|8\|none` | Neighbourhood of the redrawn 1-px outline (default 4). |
| `--dither` | Ordered (Bayer 4×4) dithering in pixel sizes. Off by default. |
| `--no-snap` | Pixel sizes keep their averaged colours instead of snapping to the palette. |
| `--sharpen X` | Unsharp-mask amount for smooth sizes (default 0.35, `0` = off). |
| `--settings FILE` | JSON overrides for any setting in [`lib/config.mjs`](lib/config.mjs), e.g. `{"pixel": {"inkKeep": 0.5}, "smooth": {"sharpen": 0.2}}`. |
| `--no-sheet`, `--no-tuning` | Skip the contact sheet, or only its tuning section. |
| `--grid-in DIR` | A folder of pixel-grid redraws from `Edit-Images.ps1 -Mode pixel`, e.g. `tools/image-gen/output/edited/pixel-32`. Repeatable. The grid size N comes from the folder name (`pixel-N`) or `--grid`. Size N is then snapped from the grid instead of reduced from `--in`. See [Redraws](#redraws-from-edit-imagesps1). |
| `--grid N` | With `--grid-in`: the size for folders not named `pixel-N`. Without `--grid-in`, it starts a grid-only run: `--in` is the pixel-grid folder, and only the N×N sprites (and their upscales) are made. |
| `--upscales LIST` | Nearest-neighbour integer upscales written next to every grid sprite (`<id>@32x2.png`, ...). Default `2,4`; `""` for none. |
| `--grid-place layout\|none` | `layout` (default) moves a grid sprite by whole pixels so it sits on its category's baseline and centre, like the normalised masters. `none` keeps it where the model drew it. |
| `--compare-in DIR` | Original masters for the contact sheet's "Original vs redraws" section. Default `tools/image-gen/output/sprites` whenever `--in` or `--grid-in` points somewhere else. |
| `--no-compare` | No comparison section. |

The output is deterministic: the same masters and settings give byte-identical PNGs, manifest and contact sheet on every machine.

## Redraws from `Edit-Images.ps1`

[`tools/image-gen/Edit-Images.ps1`](../image-gen/README.md#small-size-redraws-edit-imagesps1) uses the OpenAI image edit API to redraw every master as a version designed to be small. The image models cannot output tiny images, so the redraws are still about 1024 px, and this pipeline still does the downscale. The redraws keep the generator's layout under `tools/image-gen/output/edited/<mode>[-N]/`, with the same category rules:

```sh
# smooth sizes and 16/24 from the bold redraws, 32 from the pixel grid, with the three-way comparison
node tools/sprite-pipeline/build.mjs --in tools/image-gen/output/edited/bold --grid-in tools/image-gen/output/edited/pixel-32
# only the bold redraws, through the normal pipeline
node tools/sprite-pipeline/build.mjs --in tools/image-gen/output/edited/bold
# only the pixel grids: exact 32x32 sprites, upscales and the fidelity report
node tools/sprite-pipeline/build.mjs --in tools/image-gen/output/edited/pixel-32 --grid 32
```

On Windows, the same commands work with `\` or `/`. Pointing `--in` at `edited/` itself is refused with a hint, because its subfolders are modes, not categories.

**Grid snapping** ([`lib/grid.mjs`](lib/grid.mjs)), for an N-cell grid on a W-px image:

1. **Phase.** The colour change between neighbouring columns (and rows) is summed into an edge profile. The grid offset is the one whose lines, every W/N px, catch the most of it. Whole-pixel steps are tried for whole-pixel cells, half pixels otherwise. A grid the model drew a few pixels off is still read correctly.
2. **Cells.** Only the middle 60 % of each cell is sampled (soft or anti-aliased block edges are ignored). Alpha is decided by majority. The colour is the **dominant** one, not the mean: pixels are bucketed at 4 bits per channel, the largest bucket wins, and the result is the average of the pixels within an RGB distance of 40 of it. A stray edge, a speck or noise does not tint the cell.
3. **Palette.** Each cell colour snaps to the nearest bible colour (the `--palette`, OKLab with the hue weighting the pixel sizes use) when it is within 0.1. `--no-snap` turns this off. A distinctive colour far from every bible colour is kept.
4. **Placement.** The N×N sprite is moved by whole pixels onto its layout's baseline and centred on its core (`--grid-place none` turns this off). There is never any resampling.
5. **Grid fidelity.** A cell's fidelity is the share of its sampled pixels that agree with the chosen colour (or alpha). The sprite's score is the mean over the cells that contain the sprite. A grid sprite is **flagged** when the score is below 0.9, or when more than 10 % of its cells are below 0.8. The pipeline also estimates the cell count the image was really drawn with: a model that drew 29 cells instead of 32 shows up as "looks like a 29x29 grid".

The run prints every flagged sprite, plus the command to redraw them, for example `pwsh ./tools/image-gen/Edit-Images.ps1 -Mode pixel -Grid 32 -Only 'units/expert-lumberjack__none' -Force`. It writes `_sheet/grid-report.json` with the bad cells' coordinates. The thresholds are in `GRID_DEFAULTS` in `lib/grid.mjs`; override them with `--settings`, e.g. `{"grid": {"minFidelity": 0.85, "colorTol": 48}}`. On the synthetic test images, a clean grid scores 1.0, and so does a grid with ±10 noise per channel and 3-px soft edges. A grid drawn with 29 to 36 cells and read as 32 scores 0.73 to 0.77.

**Manifest.** A grid size has `"mode": "grid"` and its `fidelity` in `files`. A `grid` object per size holds the source file and hash, the score, the bad-cell count, the phase, the detected cell count, the placement shift, the flag and its reasons, and the upscale files. Grid sprites are pixel art like the `pixel` sizes, with alpha 0 or 255, and are drawn the same way, at integer scales with smoothing off. A sprite that exists only in a grid folder gets only its grid size.

**Contact sheet.** Every grid size shows its fidelity in the runtime rows. A **Grid fidelity** table lists every grid sprite, worst first. The **Original vs redraws** section shows, for each sprite and at the same sizes (the pixel sizes and the first smooth size), 1:1 on paper and grass and enlarged:

- the original master through this pipeline (`--compare-in`);
- the redraw given as `--in` through this pipeline (labelled "bold redraw" for `edited/bold`);
- each pixel-grid snap, with its fidelity.

### Masters on a web server

The masters are going to live on the game's own server rather than in git, with the same layout as the generator output, e.g. `https://casual.spence.dk/assets/sprites/units/expert-lumberjack__none.png`. Pass the base URL as `--in`:

```sh
node tools/sprite-pipeline/build.mjs --in https://casual.spence.dk/assets/sprites/
```

The list of ids comes from, in this order: `--ids FILE`; `tools/image-gen/output/manifest.json` (every sprite job with status `done`), if you have one locally; otherwise the job tables of [`docs/SPRITE_PROMPTS.md`](../../docs/SPRITE_PROMPTS.md). Ids the server does not have (HTTP 404) are reported and skipped, so the docs' full list works while the art is still being made.

**User-Agent.** casual.spence.dk runs IIS with ModSecurity, which answers **HTTP 455** to some non-browser User-Agents (curl's default, for one). The pipeline sends `Mozilla/5.0 (compatible; CasualColonization-sprite-pipeline/1.0)`, which passes today; if the firewall still answers 455, it retries once with a Chrome User-Agent and keeps that for the rest of the run. If you pass `--user-agent` yourself it is used as is, and a 455 is reported as "blocked by the server's firewall (ModSecurity); try --user-agent".

**Proxies.** Node's built-in `fetch()` only honours `HTTPS_PROXY` / `NO_PROXY` when `NODE_USE_ENV_PROXY=1` is set (Node 22.21 or later). When a proxy variable is set, `build.mjs` restarts itself with that variable, so this needs no action; on an older Node behind a proxy, upgrade Node.

Downloads go to `tools/sprite-pipeline/cache/<id>.png`. The cache remembers each file's `ETag` and `Last-Modified`, and later runs send a conditional request (`If-None-Match` / `If-Modified-Since`), so unchanged files are not downloaded again. A server that sends neither header is checked with a `HEAD` request and compared by size. If the server cannot be reached, the cached copy is used.

## Output

```text
tools/sprite-pipeline/out/
  manifest.json                         sprite id -> files per size (below)
  units/expert-lumberjack__none@16.png  pixel
  units/expert-lumberjack__none@24.png  pixel
  units/expert-lumberjack__none@32.png  pixel
  units/expert-lumberjack__none@48.png  smooth
  units/expert-lumberjack__none@64.png  ...
  units/expert-lumberjack__none@96.png
  units/expert-lumberjack__none@128.png
  ...
  index.html                            contact sheet  } not runtime files,
  _sheet/                               its images     } do not upload
```

Every file is a square RGBA PNG. Pixel files contain only palette colours and alpha 0 or 255. The style bible (`bible/style-bible.png`) is a reference sheet, not a sprite, and is skipped.

### Uploading to the game server

Everything in `out/` except `index.html` and `_sheet/` is the runtime set. Upload it as is, so that ids and paths stay the same, for example to:

```text
https://casual.spence.dk/assets/runtime/manifest.json
https://casual.spence.dk/assets/runtime/units/expert-lumberjack__none@32.png
```

Copy it with whatever deploys the site (FTP, Web Deploy, ...). On Windows, for example, `robocopy tools\sprite-pipeline\out \\server\site\assets\runtime /MIR /XF index.html /XD _sheet`; with rsync, `rsync -av --delete --exclude index.html --exclude _sheet tools/sprite-pipeline/out/ host:/path/to/site/assets/runtime/`. The server must serve `.json` and `.png` (IIS serves both by default).

**CORS: only needed for cross-origin loading.** The server sends no `Access-Control-Allow-Origin` header today. That is fine as long as the game itself is served from the same origin (`https://casual.spence.dk/`). It becomes necessary if the sprites are loaded from another origin: the GitHub Pages build, or the single-file build opened from disk (`file://`, origin `null`). Then, without the header, the browser refuses `fetch()` of the manifest, and a canvas that has drawn a non-CORS image becomes "tainted", which breaks nation tinting and `toDataURL()` (the UI icon cache uses it). In that case send, for `/assets/runtime/`:

```text
Access-Control-Allow-Origin: *
```

IIS (`web.config` in `assets/runtime/`):

```xml
<configuration>
  <system.webServer>
    <httpProtocol>
      <customHeaders>
        <add name="Access-Control-Allow-Origin" value="*" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
```

(nginx: `add_header Access-Control-Allow-Origin "*" always;`; Apache: `Header set Access-Control-Allow-Origin "*"`.) The game must then load images with `img.crossOrigin = 'anonymous'` (or `fetch()` plus `createImageBitmap`). Note that the server's ModSecurity rules apply to players' browsers too; browsers send ordinary User-Agents, so that is not a problem. A long `Cache-Control` is fine for the PNGs if the manifest is revalidated (see `source.sha256` below).

### Manifest format

```jsonc
{
  "format": "casual-colonization-sprites",
  "version": 1,
  "sizes": [16, 24, 32, 48, 64, 96, 128],
  "pixelMax": 32,
  "pixelSizes": [16, 24, 32],
  "smoothSizes": [48, 64, 96, 128],
  "settings": { /* every setting used, for reproducibility */ },
  "sprites": {
    "units/expert-lumberjack__none": {
      "category": "units",
      "layout": "standing",                       // normalising rule, see below
      "source": { "file": "units/expert-lumberjack__none.png", "sha256": "…" },
      "anchor": { "x": 0.5, "y": 0.94 },          // ground point, as a share of the square
      "pixelColors": ["#583c2c", "#9a3121"],      // per-sprite extra colours in the pixel sizes
      "files": {
        "16":  { "file": "units/expert-lumberjack__none@16.png",  "mode": "pixel" },
        "48":  { "file": "units/expert-lumberjack__none@48.png",  "mode": "smooth" }
        // ... one entry per size
      }
    }
  }
}
```

File paths are relative to the manifest. Ids are the engine ids in kebab-case with `__<variant>`, exactly as in `docs/SPRITE_PROMPTS.md` section 5, so the loader rule there still holds: try `units/<type>__<role>`, then `units/<type>__none`, then the procedural sprite. `source.sha256` changes whenever a master changes; it can be used to cache-bust (`?v=<first 8 chars>`).

### How an image-based style plugin will use it (not built yet)

A future `packages/style-ligne-claire-bitmap` plugin (or a runtime option of the existing one) would:

1. `fetch()` the manifest once at start (from the server, or bundled), and load images lazily, falling back to the procedural `@cc/style-ligne-claire` drawing until an image arrives or when an id is missing.
2. For a sprite drawn at `d` CSS px, work in device pixels: `n = d * min(3, devicePixelRatio)`.
   - If `n` is below the first smooth size, use a **pixel** file: the largest pixel size `s <= n` (or the smallest if none is), drawn at an integer scale `k = max(1, floor(n / s))` with `ctx.imageSmoothingEnabled = false`, centred in the `n` box. Pixel art must never be resampled by a non-integer factor.
   - Otherwise use the smallest **smooth** size `>= n` (or the largest available) with `imageSmoothingEnabled = true` and `imageSmoothingQuality = 'high'`. The browser then only shrinks it slightly.
3. Place the square so that its `anchor` lands on the ground point the procedural renderer uses (for units, the bottom of the tile area where the selection ellipse is drawn). All sprites of one layout share scale and baseline, so no per-sprite offsets are needed.
4. Mirror horizontally for units moving west (no sprite contains lettering), and tint the white-cloth overlays (`overlays/*`) per nation as described in `docs/SPRITE_PROMPTS.md` section 3.

## The game's draw sizes, and the default size set

From the game code on `claude/nifty-ptolemy-10e7mv` (`packages/style-ligne-claire/src/renderer.ts`, `src/index.ts`, `apps/web/src/app.ts`, `styles.ts` and the UI screens):

| Where | Size in CSS px | Code |
| --- | --- | --- |
| Map tile | 20 to 128 per tile (zoom), default 56 | `camera.zoom`, clamped 20..128 |
| Unit on the map | 0.86 × tile: **17 to 110**, 48 at the default zoom | `unitSprite(..., z * 0.86)` |
| Unit in a colony tile | 0.62 × tile: 12 to 79 | `inColony ? z * 0.62` |
| Colony / settlement on the map | 0.95 / 0.9 × tile: 19 to 122 | `colonySprite`, `settlementSprite` |
| Unit icons (drawn at 0.92 × icon) | 24 and 28 (routes, cargo chips), 32 and 36 (colony, Europe), 40 (colony buildings, Europe ships), 56 (sidebar), 72 (new game) | `icon({kind: 'unit'}, n)` |
| Goods icons | 18, 20, 22, 28, 30 | `icon({kind: 'product'}, n)` |

Icons are rendered at `min(3, devicePixelRatio)`, the map at the device pixel ratio. So on a standard (1×) screen most small things land between **17 and 40 device px**, and on a 2× screen the same things land between 34 and 80.

- **Pixel 16, 24, 32** covers the 1× range where downscaling fails: the map zoomed out (zoom 20 to 37 gives units of 17 to 32 px), units inside colony tiles, and the 24 to 36 px unit icons. The goods icons (18 to 30 px) will want the same treatment.
- **Smooth 48, 64, 96, 128** covers the default zoom (48 px at 1×, 96 at 2×), the sidebar (56), the new-game caravel (72) and every icon at 2×.
- Above 128: zoom 128 at 2× draws units at 220 device px. Add `--sizes 16,24,32,48,64,96,128,192,256` if close-up zoom on high-DPI screens matters; the masters are 1024 px, so there is plenty of resolution.
- `--pixel-max 24` moves the boundary down, for comparison: the contact sheet's "Boundary" section shows smooth and pixel side by side at 24, 32 and 48.

## Normalising

Each master is trimmed to its alpha bounding box (after removing the faint dark glow the image model leaves around the subject, alpha below about 40/255) and placed on a square canvas by its category's rule ([`lib/normalise.mjs`](lib/normalise.mjs)). Coordinates are shares of the square:

| Layout | Used for | Scale reference | Anchor |
| --- | --- | --- | --- |
| `standing` | colonists in roles none, soldier, pioneer, missionary | core height 0.80 | bottom at 0.94 (feet), centred on the body |
| `mounted` | roles dragoon, scout | core fits 0.86 wide × 0.80 high | bottom at 0.94 (hooves) |
| `vehicle` | wagon train, artillery, treasure | core fits 0.86 × 0.70 | bottom at 0.92 (wheels) |
| `ship` | caravel ... man-of-war | core fits 0.88 × 0.86 | bottom at 0.93 (waterline) |
| `good`, `overlay` | goods, pennant, flag, mission | whole subject fits 0.84 × 0.84 | centred |
| `building` | buildings, colonies, settlements | core fits 0.86 × 0.84 | bottom at 0.93 |
| `decor` | forests, hills, mountains, ruins, bonuses | core fits 0.88 × 0.84 | bottom at 0.93 |
| `fullbleed` | terrain tiles, road overlays, UI | none: scaled to the square as is | |

The **core** is the bounding box without thin protrusions: a row or column belongs to it when it holds at least 18% as many opaque pixels as the widest row or tallest column. So a soldier with a shouldered musket, a missionary with a tall cross and a colonist with nothing above his head all get the same body size, and a raised sabre does not shrink a dragoon. If a protrusion would then cross the 0.065 margin (one pixel at 16 px, room for the outline), the whole subject is shrunk until it fits. Standing and mounted figures end up about the same height, so a rider is drawn smaller than a standing colonist, the usual strategy-game compromise that keeps both readable. Change `LAYOUTS` to rebalance.

Normalising produces a transform, not an image: every output size is rendered straight from the master in one resampling step.

## Pixel reduction, step by step

[`lib/pixel.mjs`](lib/pixel.mjs), for a target of `T` px:

1. **Pre-simplify** at 4 × `T` (area-averaged from the master in linear light), then a 3 × 3 median of the colour (in OKLab) among non-ink pixels, which flattens shading and soft edges without eroding the ink.
2. **Area-average** each 4 × 4 block to one pixel, measuring alpha coverage, ink coverage and the average colour of the non-ink part separately (so a thin black line does not muddy the colour next to it).
3. **Quantise** to the palette, nearest in OKLab with hue and chroma weighted twice as much as lightness (`chromaWeight`), which keeps a warm off-white coat from turning into skin. The palette is the 12 style-bible swatches plus gunmetal, iron, dark wood and dark green, plus up to 3 extra colours per sprite for large areas that sit far from every palette colour (a dark brown coat, a shaded skin tone, a weaver's magenta). Ordered dithering is available and off.
4. **Binarise alpha** at 50% coverage. A pixel that is the crest of a thin line (a staff, a crossbar, a blade: coverage of 22% or more with much less on both sides) is kept too, as is a mostly-ink pixel.
5. **Ink**: a pixel becomes ink when ink covers 45% of it on the silhouette edge, or 65% inside, so solid black areas (hats, boots, a cassock) and bold lines stay, and hairline folds do not.
6. **Clean up** orphans: lone pixels are dropped, 1-px holes are filled, single speckles of a colour take their neighbours' colour. Single ink pixels (eyes, buttons) are kept.
7. **Outline**: every transparent pixel next to a coloured pixel (4-neighbourhood by default) becomes ink. 1-px props in mid and dark colours (wood, metal) are left bare so a musket stays one pixel wide instead of three; pale 1-px parts are outlined so they do not vanish on paper or grass.

All pixel settings, with their defaults, are in [`lib/config.mjs`](lib/config.mjs).

## Contact sheet

`out/index.html` shows, for every sprite: the master; each pixel size at 1:1 on paper and on a grassland map tile, and enlarged 4× with nearest-neighbour so single pixels are visible; each smooth size at 1:1 on both backgrounds. "True device pixels" (on by default) draws the 1:1 images at one image pixel per screen pixel on high-DPI screens, as the game will. Below that:

- **Boundary**: smooth and pixel renders side by side at 24, 32 and 48 px, to judge where the switch-over (`--pixel-max`) belongs.
- **Tuning**: the axe, musket, cross and horse-and-telescope sprites rendered with variants of the pixel settings (palette snap off, core palette only, 8-neighbour outline, thin props as ink or outlined, no outline, no interior ink, plain OKLab distance, majority colour instead of average, dithering, ink grown before reducing, no pre-simplify). Variants live in `TUNING_VARIANTS` in `lib/config.mjs`.
- **Settings**: every value used.

## Tests

```sh
cd tools/sprite-pipeline
npm test
```

`node:test`, on synthetic images (no generated art needed). Grid snapping is tested on a perfect grid (exact N×N recovery, fidelity 1) at 16, 24 (on 1008 px) and 32 cells, and on a noisy grid with soft block edges (still exact, fidelity above 0.97). Other cases: mode beats mean, alpha by majority, a grid offset by 12 px (found by the phase search), a grid drawn with 29 cells (low fidelity, flagged, 29 detected), and a blurred non-pixel image (flagged). Placement, upscales, `--grid` and `--grid-in` runs with `--compare-in`, and the refusal of the `edited/` root are tested as well. The other tests cover normalising (bounding box, core box, baseline and scale, centring, margins), palette quantisation, alpha binarisation, the outline and orphan passes, thin-line detection, byte-identical output across runs, the `--pixel-max` boundary, and the remote source against a local HTTP server (download, conditional re-checks with ETag, Last-Modified or size, the 455 User-Agent fallback, id lists from the image-gen manifest, the docs and `--ids`). The real server was also tested by hand: a first run downloads, a second gets `304 Not Modified` for every file.

## Files

```text
build.mjs          command line, output, manifest
lib/config.mjs     defaults and tuning variants
lib/color.mjs      sRGB/linear, OKLab, palettes
lib/image.mjs      float RGBA image, PNG in/out, alpha clean-up, separable resampler
lib/normalise.mjs  bounding boxes, layouts, placement transform
lib/ink.mjs        ink detection, line width, distance transform, thickening
lib/smooth.mjs     smooth sizes: downscale, unsharp mask
lib/pixel.mjs      pixel sizes: simplify, reduce, quantise, binarise, clean up, outline
lib/grid.mjs       pixel-grid redraws: phase, cell mode, alpha majority, fidelity, placement, upscales
lib/process.mjs    one sprite end to end
lib/source.mjs     local folder or remote server with a download cache
lib/sheet.mjs      contact sheet
test/              node:test suites
```
