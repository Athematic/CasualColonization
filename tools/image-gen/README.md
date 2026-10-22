# Image generator

`Generate-Images.ps1` makes the game's bitmap art with the OpenAI Images API, straight from the prompt documents:

- [`docs/SPRITE_PROMPTS.md`](../../docs/SPRITE_PROMPTS.md): 294 sprites (style bible, units, ships, goods, terrain, decorations, colonies, settlements, buildings, UI).
- [`docs/BOX_ART_PROMPTS.md`](../../docs/BOX_ART_PROMPTS.md): 18 covers (fifteen front-cover concepts, two of them for the planned Australia scenario and two for Vinland, plus the back cover, wide banner and app icon), plus 15 lettered front covers with `-IncludeTitle`.

It runs on PowerShell 7 or later (`pwsh`) on Windows, macOS and Linux, and needs nothing else.

Each sprite prompt can produce two images:

- the **full** version (`-Variant full`, the default): the prompt from the document, unchanged. All 294 sprite masters and the 8 covers are made (`output/manifest.json` is committed; the images are hosted at `https://casual.spence.dk/assets/sprites/...`).
- the **thumbnail** version (`-Variant thumb`): a separate text-to-image generation of the same subject, with a prompt designed to read at 16 to 48 px: very thick outlines, few lines, oversized props. It goes to `output/thumbs/`. The two versions differ slightly, because they are two drawings. See [Thumbnails](#thumbnails--variant-thumb). **This is the next run to make: `-Variant thumb`.**

`-Variant both` makes both. [`tools/sprite-pipeline`](../sprite-pipeline/README.md) then takes the small sizes from the thumbnails and the large ones from the full masters (`--thumbs-in`).

`Edit-Images.ps1` (redraws through the image **edit** API) is **deprecated and experimental**: it was too expensive, and its results were not good enough (even its "bold" mode left the lines too thin). It and its tests are kept for reference. See [Small-size redraws](#small-size-redraws-edit-imagesps1-deprecated).

## What it does

1. **Builds the job list** the way the docs describe it.
   - Sprites: the `master` block, then the nearest `category` block, then `SUBJECT: <row prompt>`. Size and background come from each table row.
   - Covers: the `cover` style block, then the concept text. Size comes from the concept ("portrait" → 1024x1536, "landscape" → 1536x1024, "square" → 1024x1024). Covers are always opaque.
   - Thumbnails (`-Variant thumb` or `both`): the sprite prompt above, wrapped in the blocks of [`thumb-prompts.md`](thumb-prompts.md). Same size and background as the full job.
2. **Calls** `POST https://api.openai.com/v1/images/generations` once per image, with `model`, `prompt`, `size`, `quality`, `background` (`transparent` or `opaque`, as the row says), `output_format: "png"`, `n: 1` and `moderation`. It decodes the `b64_json` it gets back.
3. **Checks every PNG.** It reads the IHDR colour type and decodes the pixels. A transparent job needs an alpha channel with transparent pixels and no painted grey-and-white checkerboard in the corners; opaque jobs must have no transparent pixels. A job that fails the check is still saved, but it is flagged in the console, the manifest and the contact sheet. `-RedoFlagged` regenerates flagged jobs.
   The three `images/units/*.png` made earlier fail this check: they are RGB with no alpha channel, and the checkerboard is painted on. Asking the API for `background: "transparent"` fixes that. Typing "transparent background" into a chat prompt does not.
4. **Records progress** in `output/manifest.json` and resumes from it: done jobs are skipped. It also writes `output/index.html`, a contact sheet of every image with its id, PNG check and prompt. Images are shown on a dark blue checkerboard, so real transparency shows the blue through and a painted checkerboard stands out.

Output layout:

```
tools/image-gen/output/            (gitignored; change with -OutDir)
  manifest.json
  index.html
  sprites/units/free-colonist__none.png   ...  the doc's file names
  sprites/bible/style-bible.png
  boxart/front-a-landfall.png, boxart/back-cover.png, boxart/wide-banner.png, boxart/app-icon.png
  boxart/front-a-landfall__titled.png       (-IncludeTitle)
  sprites/units/caravel__none__v2.png       (-Variants 2 and more)
  thumbs/units/free-colonist__none.png ...  thumbnails (-Variant thumb or both), the same layout as sprites/
  thumbs/units/caravel__none__v2.png        (-Variant thumb -Variants 2)
  _replaced/...                             older takes of jobs whose prompt changed
```

The sprite masters' intended home is `art/masters/` (SPRITE_PROMPTS.md section 5). Copy the takes you approve from `output/sprites/` into it.

## Install PowerShell 7

**Windows.** Windows PowerShell 5.1 is not enough. Install PowerShell 7 with either command:

```powershell
winget install --id Microsoft.PowerShell --source winget
# or: download the MSI from https://aka.ms/powershell-release?tag=stable
```

Then open "PowerShell 7" (`pwsh`), not "Windows PowerShell".

**macOS** (Homebrew):

```bash
brew install --cask powershell
pwsh --version
```

**Linux:** see <https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-linux>. On Ubuntu, for example, install the `powershell` package from packages.microsoft.com.

## Run it

Run these from the repository root. First look at the plan; neither command needs an API key:

```bash
pwsh ./tools/image-gen/Generate-Images.ps1 -List                            # every job, with counts per doc
pwsh ./tools/image-gen/Generate-Images.ps1 -Only 'bible/*' -DryRun          # print the assembled prompt(s)
```

Then generate. The script prints how many API calls the run will make, with a rough cost, and asks before it starts (skip that with `-Yes`). It then asks for your API key:

```bash
# 1. the style bible first, a few takes at low quality
pwsh ./tools/image-gen/Generate-Images.ps1 -Only 'bible/*' -Quality low -Variants 4
# 2. one category
pwsh ./tools/image-gen/Generate-Images.ps1 -Only 'units/free-colonist*'
# 3. covers: explore cheaply, then the finals
pwsh ./tools/image-gen/Generate-Images.ps1 -Doc boxart -Only 'front-*' -Quality low -Variants 3
pwsh ./tools/image-gen/Generate-Images.ps1 -Doc boxart -Quality high -OutDir ./tools/image-gen/output-final
# everything
pwsh ./tools/image-gen/Generate-Images.ps1
```

On Windows, the same commands work in a `pwsh` window with backslashes:

```powershell
pwsh .\tools\image-gen\Generate-Images.ps1 -List
pwsh .\tools\image-gen\Generate-Images.ps1 -Only 'units/caravel*' -Quality low
```

### Windows execution policy

If Windows refuses with "running scripts is disabled on this system", choose one of these:

```powershell
# for this one run only
pwsh -ExecutionPolicy Bypass -File .\tools\image-gen\Generate-Images.ps1 -List
# or, once, for your user account (lets local scripts run, still requires signatures for downloaded ones)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# if the files came from a downloaded zip, unblock them
Get-ChildItem .\tools\image-gen -Recurse | Unblock-File
```

macOS and Linux have no execution policy.

### The API key

- At startup the script asks for the key with hidden input (`Read-Host -AsSecureString`). It holds the key only as a SecureString in memory, for that one run, and passes it straight to `Invoke-WebRequest -Authentication Bearer -Token`.
- It never writes the key to the manifest, a log, the console or any other file. There is no parameter or file you could pass the key in.
- If `OPENAI_API_KEY` is already set in your shell, the script asks whether to use it. `-UseEnvKey` says yes in advance. The script never stores the key itself.

Get a key at <https://platform.openai.com/api-keys>. GPT image models can require organization verification (Settings → Organization → General) before the first call works.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `-Doc sprites\|boxart\|all` | `all` | Which document(s) to read. |
| `-Only <pattern>[,...]` | | Wildcards matched against the job id (`units/caravel__none`) or key (`sprites/units/caravel__none`). A pattern without `*` or `?` matches anywhere in the id. |
| `-Variant full\|thumb\|both` | `full` | Which version of each sprite: the full image (as before), the [thumbnail](#thumbnails--variant-thumb), or both. Box art and the style bible have no thumbnail. Not the same as `-Variants`. |
| `-ThumbPromptFile` | `thumb-prompts.md` | The thumbnail prompt blocks. Only read for `thumb` and `both`. |
| `-Variants N` | 1 | Takes per prompt (1 to 10). Take 1 is `<id>.png`; the others are `<id>__v2.png` and so on, the doc's naming convention for variants. |
| `-List`, `-DryRun` | | Show the jobs, or the prompts and request parameters, without calling the API. |
| `-Model` | `gpt-image-2.5-flare` | Any GPT image model. See below. |
| `-Quality low\|medium\|high\|xhigh\|max\|auto` | `medium` | The docs suggest `low` for exploring and `high` for finals. `xhigh` and `max` exist only on the gpt-image-2.5 models. |
| `-Moderation auto\|low` | `auto` | The API's moderation level. |
| `-OutDir` | `tools/image-gen/output` | Folder for the PNGs, the manifest and the contact sheet. |
| `-Yes` | | Skip the cost confirmation. |
| `-UseEnvKey` | | Use `OPENAI_API_KEY` without asking. |
| `-KeepChanged` | | Keep done images whose prompt has since changed in the docs, instead of regenerating them. |
| `-Force` | | Regenerate even done jobs. |
| `-SkipFailed` | | Do not retry jobs that failed in an earlier run. |
| `-RedoFlagged` | | Regenerate done jobs that failed the PNG check. |
| `-DocumentOrder` | | Generate sprites in the prompt document's order. By default the sections run in reverse (UI pieces first, colonist units last, since units vary least between runs), with the style bible always first. |
| `-IncludeTitle` | | Also generate `front-*__titled` covers with model-lettered titles (BOX_ART_PROMPTS.md section 6). |
| `-MaxJobs N` | 0 (no limit) | Make at most N API jobs in this run. |
| `-MaxRetries` | 6 | HTTP attempts per job for 429, 5xx and network errors. |
| `-MaxConsecutiveFailures` | 5 | Stop after this many jobs fail in a row. |
| `-ApiBase` | `https://api.openai.com/v1` | API base URL. The tests point it at a local fake server. |
| `-SpriteDoc`, `-BoxArtDoc` | the files in `docs/` | Read other prompt documents. |

## Model and parameters

The parameters were checked against the official OpenAI Python SDK 3.35.1 (published 18 October 2026), whose types are generated from the API spec. See `ImageGenerateParams` and `ImageModel` there, and the API reference at <https://platform.openai.com/docs/api-reference/images/create> and the guide at <https://platform.openai.com/docs/guides/image-generation>.

- **Model:** the default is `gpt-image-2.5-flare`. The SDK documents both `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` (and their `2026-09-08` snapshots) as supporting `opaque` and `transparent` backgrounds. Override it with `-Model`: other models that do transparency are `gpt-image-1.5`, `gpt-image-1` and `gpt-image-1-mini`. On `gpt-image-2`, transparency was only a preview, and third-party reports say it was withdrawn on 30 September 2026, so the script warns before using it for transparent jobs. `dall-e-2` and `dall-e-3` are retired, and the script refuses them.
- **Sizes:** every size in the docs (1024x1024, 1536x1024, 1024x1536) is a standard size that every GPT image model accepts. For other sizes, the gpt-image-2 and 2.5 models take any WxH with both edges divisible by 16 and an aspect ratio between 1:3 and 3:1, up to 3840x2160. The script maps anything else to the nearest standard size by aspect ratio.
- **`response_format`** is not sent: GPT image models always return `b64_json`.
- **Edits:** `Generate-Images.ps1` only calls `images/generations`. The banner prompt mentions "the attached front cover"; that job is noted as having no reference attached. `Edit-Images.ps1` (below) uses `images/edits` with reference images.

## Errors, retries and resuming

| Response | What happens |
| --- | --- |
| `429` rate limit | Waits as long as the server says (`retry-after-ms`, `Retry-After`, or the `x-ratelimit-reset-*` header of an exhausted limit). Without a hint, it backs off exponentially with jitter. Then it retries. |
| `500`, `502`, `503`, `408`, `409`, network error or timeout | Retries with exponential backoff and jitter, up to `-MaxRetries` attempts; then the job is marked failed. |
| `insufficient_quota`, billing limit, `401` bad key, `403` no access | **Stops the run.** It saves the manifest, leaves the job pending and prints the command to resume. |
| `400` `moderation_blocked` or other safety refusals | The job is marked `failed` with the reason. The run goes on. Reword the prompt in the doc and run again. |
| Other `400` (for example an unsupported parameter) | The job is marked failed. After `-MaxConsecutiveFailures` failures in a row, the run stops. |

The manifest records each job's `status` (`pending`, `done`, `failed`, `skipped`), `attempts`, `lastError`, `output`, `promptHash`, model and quality, timestamps, and the PNG `check` result. It is saved after every job, by writing a temp file and moving it over the old one, so Ctrl+C or a crash never leaves it half-written. A job that was cut off stays `pending` and runs next time.

- **Resume:** run the same command again. Done jobs are skipped, and failed jobs are retried unless you pass `-SkipFailed`.
- **Prompt changed:** the hash covers the size, the background and the fully assembled prompt. When you edit a prompt, a category block or the master block in the docs, the affected done jobs run again. The old image moves to `_replaced/`. `-KeepChanged` keeps the old images instead.
- **Deleted an image:** it is generated again on the next run.
- **Existing image not in the manifest:** it is marked `skipped` and kept. `-Force` regenerates it.

Exit codes: `0` everything ok, `1` some jobs failed, `2` the run stopped (quota, key, access or repeated failures), `3` cancelled at the confirmation.

## Cost

Before it starts, the script shows the number of calls and a rough estimate. The estimate uses the prices in SPRITE_PROMPTS.md for 1024×1024: about $0.01 at low quality, $0.04 at medium and $0.17 at high, with about 1.5× that for 1536-pixel sizes. Prices change, so check <https://openai.com/api/pricing/>. The full sprite set (294 images) at high quality comes to roughly $50, before retakes.

## Thumbnails: `-Variant thumb`

The full masters look good at 1024 px, but they do not survive the downscale to 16 to 32 px: their lines are about 2.5 to 3 % of the width, which is under a pixel at 32 px, props are small, and the interior detail turns to noise. A thumbnail is a **second, separate text-to-image generation** of the same subject (`images/generations`, like the full one, with no input image), with a prompt that asks for an icon that reads at 32 px. It is not an edit of the full master, so it is cheap (one ordinary generation) and free to redraw the subject boldly. The two versions differ slightly; the game uses the thumbnail for the small sizes and the full master for the large ones.

### The prompt

[`thumb-prompts.md`](thumb-prompts.md) holds everything that is added, as fenced blocks you can edit. The thumbnail prompt is assembled as:

1. a `lead` block: the line-weight rule, first, because the model weighs the start of a prompt;
2. the full prompt, unchanged: the `master` block, the `category` block and `SUBJECT: ...` from `docs/SPRITE_PROMPTS.md`;
3. the **THUMBNAIL OVERRIDE**, which says it takes precedence over the rules above: the shared `override` block, the `background` block (transparent: real alpha; opaque: full-bleed), the notes for the prompt-doc category (for example ships: "at most 3 thick lines for the masts and stays, no ratlines") and the notes for matching sprite ids (`units/expert-lumberjack__none`: "make the axe head very large and clearly separated from the head"; `units/*__missionary`: "a white collar and a broad white sash across the dark cassock");
4. a `final` block: the line-weight rule again, because the model also weighs the end.

The shared override (`icon`, for every free-standing sprite) asks for an icon for a 32-pixel game sprite: every outline a very thick, uniform, solid near-black (#1b1a17) line of 6 to 8 % of the image (61 to 82 px on 1024), like a road-sign pictogram or a children's sticker; no thin lines anywhere; at most 3 to 5 interior lines, each as thick as the outline; one flat fill per area from the 12 bible colours; a chunky silhouette filling 85 to 90 % of the frame; props 1.5 to 2× their size and held clear of the body; no shading, texture, gradients, glow or small details (faces reduced to 2 or 3 shapes). That is about twice the line weight the `bold` edit mode asked for, which was still too thin.

Terrain tiles and ground overlays (`tile` in the `settings` block) get the `tile` blocks instead: the tile stays full-bleed, opaque and tileable (overlays stay transparent and edge-aligned), with two to four big, flat motifs and few marks, rather than outlines everywhere.

`-DryRun` prints the assembled prompt of every job, override included.

### Jobs, manifest and resume

- **Separate jobs.** Each thumbnail is its own manifest entry, `thumbs/<category>/<id>` (for example `thumbs/units/expert-lumberjack__none`), with its own prompt hash, status, attempts, retries, PNG check and output `thumbs/<category>/<id>.png`. The entry also records `variant: "thumb"` and the `fullKey` of its full version.
- **The full jobs do not change.** `-Variant full` is the default, and the full prompts, keys, paths and hashes are exactly as before, so the 302 done jobs in the committed manifest stay done. A thumbnail run adds entries and never touches the full ones.
- **Resume, per variant.** Run the same command again: done thumbnails are skipped, failed ones retried (`-SkipFailed` skips them), a deleted thumbnail is made again. Editing `thumb-prompts.md` re-queues the thumbnails it affects (the old takes go to `_replaced/thumbs/`), never a full image. Editing a sprite's row or a master or category block in the docs re-queues both versions.
- **Not made:** box art (covers are not needed small; `-Doc boxart -Variant thumb` says so and makes nothing) and the style bible (`skip: bible` in the `settings` block).
- **The PNG checks, the cost confirmation, `-List`, `-DryRun`, `-Only`, `-Doc`, `-Variants`, `-Force`, `-MaxJobs`, the retries and the exit codes** work as for the full jobs. `-Only` matches the id (`units/expert-lumberjack*`) or the key (`thumbs/units/*`).
- **Contact sheet.** `output/index.html` shows the full version and the thumbnail side by side when both files exist (also when the run selected only one of them), each also at 32 and 48 px.

### Cost

293 calls (294 sprites without the style bible; two of them, `ui/caption-frame` and `ui/title-emblem`, are 1536×1024). With the per-image prices above: about **$3.25 at `low`**, **$12.35 at `medium`** and $49 at `high`, before retakes. `low` or `medium` is the recommendation: a thumbnail has no fine detail to lose, and it is only ever shown at 48 px or less. Check <https://openai.com/api/pricing/>.

**Sample first:** the six expert-lumberjack sprites (`__none`, `__soldier`, `__pioneer`, `__missionary`, `__dragoon`, `__scout`) are 6 calls, about $0.25 at medium and $0.07 at low.

### Run it

macOS / Linux, from the repository root:

```bash
pwsh ./tools/image-gen/Generate-Images.ps1 -Variant thumb -List                                    # 293 thumbnail jobs
pwsh ./tools/image-gen/Generate-Images.ps1 -Variant thumb -Only 'units/expert-lumberjack*' -DryRun # the prompts
pwsh ./tools/image-gen/Generate-Images.ps1 -Variant thumb -Only 'units/expert-lumberjack*' -Quality medium
open tools/image-gen/output/index.html
# the whole set, once the sample looks right
pwsh ./tools/image-gen/Generate-Images.ps1 -Variant thumb -Quality medium
```

Windows (a `pwsh` window, PowerShell 7):

```powershell
pwsh .\tools\image-gen\Generate-Images.ps1 -Variant thumb -Only 'units/expert-lumberjack*' -Quality medium
start .\tools\image-gen\output\index.html
pwsh .\tools\image-gen\Generate-Images.ps1 -Variant thumb -Quality medium
```

Then upload `output/thumbs/` next to `sprites/`, as `https://casual.spence.dk/assets/thumbs/units/<id>.png` and so on, and build the runtime set with the small sizes from the thumbnails:

```bash
node tools/sprite-pipeline/build.mjs --in tools/image-gen/output/sprites --thumbs-in tools/image-gen/output/thumbs --thumb-max 48
# or from the server
node tools/sprite-pipeline/build.mjs --in https://casual.spence.dk/assets/sprites/ --thumbs-in https://casual.spence.dk/assets/thumbs/ --thumb-max 48
```

See [the sprite pipeline](../sprite-pipeline/README.md#thumbnails-from-generate-imagesps1--variant-thumb).

## Small-size redraws: `Edit-Images.ps1` (deprecated)

> **Deprecated, experimental.** Too costly (each edit also pays for its input images, 504 calls for the set) and the results were not good enough: `bold` was the best of the two modes, but its lines were still not bold enough. Use [`-Variant thumb`](#thumbnails--variant-thumb) instead. The script and its tests stay, for reference.

The masters look good at 1024 px, but they do not survive the downscale to sprite sizes well. Their ink lines are about 5 px wide on 1024, which is about 0.15 px at 32 px. Props are small, so an axe or a spade becomes a grey blob. Interior detail turns to noise, and dark subjects (a missionary's black cassock) merge with the outline. `Edit-Images.ps1` sends every master to OpenAI's image **edit** endpoint and gets back a version **designed to be small**, in the same style. [`tools/sprite-pipeline`](../sprite-pipeline/README.md) then makes the runtime sizes from that version.

### Why it redraws instead of shrinking

The image models cannot output tiny images. The GPT image models return 1024×1024, 1536×1024 or 1024×1536. The gpt-image-2 and 2.5 models also take other sizes with both edges divisible by 16, within the model's pixel limits, up to 3840×2160. `256x256` and `512x512` are only in the SDK's size list for the retired `dall-e-2`. So the edit API cannot be asked for a 32-px sprite. Even if it could, a model shrinking its own picture is no better than a resampler.

The design splits the work in two:

1. **The edit API redraws.** It gets the master, plus the style bible and optionally an approved example of the category, as input images. It draws the same subject, palette and style again, at the normal output size, simplified and thickened so that it reads at 24 to 64 px.
2. **The sprite pipeline downscales.** It does the exact, deterministic reduction to 16 to 128 px, as it does for the original masters.

### Two redraw modes, to compare

| Mode | What the model is asked for | Then, in the sprite pipeline |
| --- | --- | --- |
| `bold` | The same subject and composition in ligne claire, designed to read at 24 to 64 px. Outlines are 3 to 4 % of the image width (about 31 to 41 px on 1024). Props are about 1.5× larger and held clear of the body. Only the few essential interior lines stay. Flat colours come from the 12 bible colours (#1b1a17, #fffdf6, #f3c9a0, #d23c2a, #3a6fb0, #fbf3df, #a8743f, #b9b2a6, #9a5b2e, #ffd23f, #8ed0ec, #58a548), with no shading, gradient or glow. The silhouette fills the frame like the master. The background is transparent for transparent jobs, and terrain stays full-bleed and tileable. | `--in tools/image-gen/output/edited/bold`: the smooth sizes (48 to 128) and, if you like, the pixel sizes |
| `pixel` | The same subject as true pixel art on an exact N×N grid (`-Grid 32` by default, or 16 or 24). Every cell is a flat square of (output size / N) px, with a limited palette, a 1-cell dark outline and no anti-aliasing. The output size is chosen so the cells are whole pixels: 16 → 1024 (64-px cells), 24 → 1008 (42-px cells), 32 → 1024 (32-px cells). | `--grid-in tools/image-gen/output/edited/pixel-32`: each cell is read back (its dominant colour, alpha by majority) into an exact 32×32 sprite, with a **grid fidelity** score that flags bad generations |

Which categories get which modes is set in the `modes` block of [`edit-prompts.md`](edit-prompts.md). Units, goods, buildings, colonies and settlements get both. Terrain gets only `bold`, and its tiles stay full-bleed with tileable edges. Decor, overlays, ui, the style bible and the box art are skipped by default; name one with `-Category decor` to include it.

### Inputs

- **Masters:** the generator's own output, `tools/image-gen/output/` (`-InDir`). Jobs come from `output/manifest.json`: every entry with status `done`. A master missing on disk is skipped with a warning. The PNGs are not in git, so keep your local copy of `output/sprites/`. If you only have them on the server, download them into that layout first.
- **Subject text:** each master's row prompt from `docs/SPRITE_PROMPTS.md`, so the model knows what it is redrawing.
- **Style reference:** `output/sprites/bible/style-bible.png` is sent as the second image (`-StyleRef PATH`; `-NoStyleRef` sends none).
- **Anchors (optional):** one approved redraw per category and mode, sent as the third image, so the whole set matches it: `<AnchorDir>/<mode>[-N]/<category>.png`. The default `-AnchorDir` is `output/anchors`. Examples are `output/anchors/bold/units.png`, `output/anchors/pixel-32/units.png` and `output/anchors/bold/ships.png`. The category is the prompt-doc category (`ships`, `vehicles`, ...) first, then the folder (`units`).

### The request

`POST {ApiBase}/images/edits` as `multipart/form-data`. The fields were checked against the official OpenAI Python SDK **3.35.1** (`openai/types/image_edit_params.py`, `ImageEditParams`; `openai/resources/images.py` for the multipart encoding). That is the newest version on PyPI as of 21 October 2026, and it was downloaded with `pip download openai` because the platform docs cannot be reached from the build machine.

| Field | Value |
| --- | --- |
| `model` | `-Model`, default `gpt-image-2.5-flare` |
| `prompt` | the assembled prompt (below); the SDK allows up to 32000 characters |
| `image[]` | one file part per input image, master first, then the style bible, then the anchor; `image/png`; the SDK sends a list of images as repeated `image[]` parts, and the API takes up to 16 |
| `size` | the master's size for `bold`; the grid size above for `pixel` |
| `quality` | `-Quality`, default `medium` |
| `background` | `transparent` or `opaque`, taken from the master's job |
| `output_format` | `png` |
| `n` | `1` |
| `input_fidelity` | `high`, only for `gpt-image-1` and `gpt-image-1.5`. The SDK documents it for those two models only (`gpt-image-1-mini` takes only `low`) and says to omit it for `gpt-image-2`. It lists nothing for 2.5, so it is not sent there. Change it with `-InputFidelity high\|low\|omit`. |

`images/edits` has no `moderation` field, so none is sent. `mask` is not used, because the whole image is redrawn.

### Prompts

[`edit-prompts.md`](edit-prompts.md) holds everything the model is told, as fenced blocks you can edit:

- the `bold` and `pixel` templates;
- the transparent and opaque background rules;
- one line per reference image;
- notes per prompt-doc category, for example ships: "bold hull outline, simplified rigging, at most 3 lines for the masts and stays";
- notes per sprite id wildcard, for example `units/expert-lumberjack__none`: "make the axe head large and clearly separated from the head", or `units/*__missionary`: "a white collar and a white sash across the dark cassock".

The assembled prompt is template + background + category notes + sprite notes + reference lines + `SUBJECT OF IMAGE 1: <the row text>`. `-DryRun` prints it for every job.

The prompt hash covers the mode, the grid size, the size, the background, the whole assembled prompt (so every template and note) and the SHA-256 of every input image (master, style bible, anchor). Edit a template, swap the style bible, add an anchor or regenerate a master, and exactly the affected redraws run again. The old ones move to `edited/_replaced/`, unless you pass `-KeepChanged`.

### Output

```text
tools/image-gen/output/edited/
  manifest.json                             same format and rules as the generator's (plus mode, grid, sourceId, references)
  index.html                                contact sheet: original | bold | pixel-32, each also shown small
  bold/units/expert-lumberjack__none.png
  pixel-32/units/expert-lumberjack__none.png
  pixel-16/...                              with -Grid 16
  bold/units/expert-lumberjack__none__v2.png  with -Variants 2
  _replaced/...
```

Resume, retries, `Retry-After`, the quota stop, content-policy failures, the progress bar, the PNG checks (real transparency, painted checkerboard), `-Force`, `-SkipFailed`, `-RedoFlagged`, `-MaxJobs` and the exit codes all work exactly as in `Generate-Images.ps1`. They share the code in `ImageGen.psm1`.

### Cost

Before it starts, the script shows the number of calls, the number of input images and a rough estimate. It asks before it goes on (`-Yes` skips the question).

- **Output image:** the same per-image prices as above: about $0.01 at low quality, $0.04 at medium and $0.17 at high for 1024×1024.
- **Input images:** every input image is billed as image input tokens, so each edit costs more than a generation. High input fidelity uses more tokens. `-InputImageCost` (default $0.03 per input image) is an assumption for the estimate, not a price. Check <https://openai.com/api/pricing/>, and compare with the usage page after a sample run.
- **Full set:** 240 sprites in both modes, plus 24 terrain tiles in `bold`, make 504 calls with 1008 input images (master plus style bible). That is roughly $50 at medium and $115 at high, before retakes. Each extra `-Grid` size adds 240 calls. An anchor adds one input image per call.
- **Sample first:** `-Only 'units/expert-lumberjack*' -Mode bold,pixel` is 12 calls, about $1.20 at medium.

### Run it

macOS / Linux (from the repository root):

```bash
pwsh ./tools/image-gen/Edit-Images.ps1 -List                                            # every edit job
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'units/expert-lumberjack*' -DryRun         # prompts, images, fields
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'units/expert-lumberjack*' -Mode bold,pixel # a small sample
open tools/image-gen/output/edited/index.html
```

Windows (a `pwsh` window, PowerShell 7; see "Windows execution policy" above if scripts are blocked):

```powershell
pwsh .\tools\image-gen\Edit-Images.ps1 -List
pwsh .\tools\image-gen\Edit-Images.ps1 -Only 'units/expert-lumberjack*' -Mode bold,pixel
start .\tools\image-gen\output\edited\index.html
```

More examples:

```bash
# pixel art at 24 and 32 cells, two takes each (grid fidelity varies between takes)
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'goods/*' -Mode pixel -Grid 24,32 -Variants 2
# one category at final quality, with an approved anchor in output/anchors/bold/units.png
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'units/*' -Mode bold -Quality high
# decor is skipped by default; include it
pwsh ./tools/image-gen/Edit-Images.ps1 -Category decor -Mode bold
# compare with an older model that supports input_fidelity=high
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'units/expert-lumberjack__none' -Model gpt-image-1.5 -OutDir ./tools/image-gen/output/edited-1.5
```

### From masters to the game, end to end

1. **Generate** the masters (done): `Generate-Images.ps1` writes `output/sprites/` and `output/manifest.json`.
2. **Redraw** a sample: `Edit-Images.ps1 -Only 'units/expert-lumberjack*' -Mode bold,pixel`. Look at `output/edited/index.html`.
3. **Downscale and compare** in the sprite pipeline:

   ```bash
   node tools/sprite-pipeline/build.mjs --in tools/image-gen/output/edited/bold --grid-in tools/image-gen/output/edited/pixel-32 --only expert-lumberjack
   ```

   This makes one runtime set: 16 and 24 from the bold redraw through the pixel reduction, 32 from the pixel grid (exact cells), and 48 to 128 from the bold redraw through the smooth downscale. Its contact sheet (`tools/sprite-pipeline/out/index.html`) has an **Original vs redraws** section. It shows, for the same sprite and the same sizes, the original master through the pipeline, the bold redraw through the pipeline and the pixel-grid snap side by side, and the grid fidelity of each pixel redraw. `--grid 32 --in tools/image-gen/output/edited/pixel-32` processes only the grids.
4. **Pick anchors:** copy the best redraw of each category to `output/anchors/<mode>[-N]/<category>.png`, for example `output/anchors/bold/units.png`. Every later redraw of that category gets it as a third image. (Adding an anchor re-queues that category's redraws, including the sample. Skip that with `-KeepChanged`.)
5. **Redraw everything,** category by category, at `-Quality high`. The pipeline prints the grid sprites with low fidelity, and the command to redo them (`-Mode pixel -Grid 32 -Only '<id>' -Force`).
6. **Build the runtime set** from the redraws, with the same command as step 3 without `--only`, and upload everything in `tools/sprite-pipeline/out/` except `index.html` and `_sheet/` to <https://casual.spence.dk/assets/runtime/>. See [Uploading to the game server](../sprite-pipeline/README.md#uploading-to-the-game-server).

### Recommended settings

- **Model:** `gpt-image-2.5-flare`, which takes the 1008-px size for 24-cell grids and real transparency. With `gpt-image-1.5` you get `input_fidelity=high`, but only the standard sizes, so 24-cell grids get fractional 42.67-px cells. The snapper copes with that, but the generations are less clean.
- **Quality:** `medium` to explore, `high` for finals. `pixel` mode benefits most from `high`: the cells come out flatter.
- **Grid:** 32, the largest pixel size the game uses. Add 24 if units in colony tiles and 24-px icons matter. 16 is usually better made by the pipeline from the bold redraw.
- **Pixel mode:** use `-Variants 2` and keep the take with the better grid fidelity.
- **Anchors:** worth it as soon as one redraw per category looks right. They do more for consistency across 170 unit sprites than any prompt wording.

### Options

`Edit-Images.ps1` takes the generator's `-Only`, `-Variants`, `-List`, `-DryRun`, `-Model`, `-Quality`, `-ApiBase`, `-Yes`, `-UseEnvKey`, `-KeepChanged`, `-Force`, `-SkipFailed`, `-RedoFlagged`, `-MaxJobs`, `-MaxRetries`, `-MaxConsecutiveFailures` and `-NoContactSheet`, plus:

| Option | Default | Meaning |
| --- | --- | --- |
| `-Mode bold,pixel` | both | Redraw modes. |
| `-Grid 16,24,32` | `32` | Cells per side for `pixel`; each size is its own job and folder (`pixel-32/`). |
| `-Category <list>` | the `modes` block | Folder categories to include. A category marked `skip` there gets `bold`, plus `pixel` if its master is transparent, when it is named here. |
| `-Doc sprites\|boxart\|all` | `sprites` | Which generator documents to take masters from. Box art is skipped unless named with `-Category boxart`. |
| `-InDir` | `tools/image-gen/output` | The generator output: masters and `manifest.json`. |
| `-SourceManifest` | `<InDir>/manifest.json` | The generator manifest. |
| `-OutDir` | `<InDir>/edited` | Where the redraws, their manifest and the contact sheet go. |
| `-StyleRef`, `-NoStyleRef` | `<InDir>/sprites/bible/style-bible.png` | The style reference image. |
| `-AnchorDir` | `<InDir>/anchors` | Approved redraws: `<mode>[-N]/<category>.png`. |
| `-PromptFile` | `edit-prompts.md` | The prompt templates. |
| `-SpriteDoc`, `-BoxArtDoc` | the files in `docs/` | Where the subject text comes from. |
| `-InputFidelity auto\|high\|low\|omit` | `auto` | `auto` sends `high` where the model supports it. |
| `-InputImageCost` | `0.03` | USD per input image, for the estimate only. |

## Tests

The tests need no API key and no network:

```bash
pwsh -NoProfile -NonInteractive -File ./tools/image-gen/tests/Run-Tests.ps1
```

- **Parsing:** 294 sprite jobs and 8 box-art jobs (13 with titles), how prompts are assembled, filters and variants.
- **Thumbnails:** `thumb-prompts.md` parses; `-Variant thumb` gives 293 jobs with their own keys, paths and hashes (no box art, no style bible), `both` gives 595 with each full job followed by its thumbnail and the full hashes unchanged; the prompt starts and ends with the line-weight rule and holds the full prompt unchanged, then the override, the background, category and per-sprite blocks; tiles get the tile blocks; takes pair with full takes. Against a copy of the committed `output/manifest.json`: every one of the 302 full prompt hashes still matches by default, the dry runs write nothing, and a thumbnail run against the fake server adds exactly one entry and leaves every full entry byte for byte as it was. Resume per variant, a deleted thumbnail, an edited `thumb-prompts.md` (only the thumbnail runs again, the old one goes to `_replaced/thumbs/`), `-SkipFailed`, `-Variants`, and the side-by-side contact sheet.
- **Commands:** `-List` and `-DryRun`.
- **PNG checks:** real alpha, missing alpha, all-opaque alpha and painted checkerboards. They also check the real `images/` files: the three unit sprites are flagged as fake transparency.
- **Manifest:** atomic save and recovery from a corrupt file.
- **Fake server runs:** `tests/FakeOpenAI.ps1` is a local `HttpListener` server that imitates `/v1/images/generations` and `/v1/images/edits`. For edits it parses the `multipart/form-data` body, checks that the request carries one or more `image[]` PNG parts with an image content type and no `moderation` field, and records the text fields and the file bytes. Against it, the tests cover success, resume, prompt-hash invalidation, `-KeepChanged`, variants, 429 with `Retry-After` and with `x-ratelimit-reset-requests`, 500 retries, policy refusals, `insufficient_quota` stopping and resuming, a wrong key, repeated failures, `-MaxJobs`, and killing the process mid-run.
- **Edits:** the prompt file, the job list (modes per category, `-Category`, `-Grid`, `-Mode`, `-Only`, a missing master, the style bible and an anchor as references), prompt assembly, `input_fidelity` per model, `-List` and `-DryRun`. Against the fake server, they check the multipart fields and that the master and the style bible arrive byte for byte, in that order. They also cover the outputs, the manifest and the contact sheet, resuming, re-queueing after a template edit, a new style bible, a new master or a deleted output, `-KeepChanged`, 429 and 5xx retries (each attempt sends a fresh multipart body with both images), quota stop and resume, a policy refusal, and a wrong key.
- **Key safety:** the tests check that the key never appears in any file or in the console output.

`-Filter '*429*'` runs a subset of the tests.
