# Writing a graphical style plugin

A style decides how the game looks. It is a plain object implementing `StylePlugin` from `@cc/render-api`:

```ts
import type { StylePlugin } from '@cc/render-api';

export const myStyle: StylePlugin = {
  id: 'my-style',
  name: 'My Style',
  description: 'One sentence shown in the style picker.',
  theme: { '--paper': '#fff', '--ink': '#000', /* … all StyleTheme keys … */ },
  stylesheets: [], // optional, e.g. a web font
  createMapRenderer: (canvas) => new MyMapRenderer(canvas),
  drawIcon: (ctx, icon, size) => { /* unit, product, building or tile icon */ },
  tileColor: (tile) => '#7ab', // minimap colour
};
```

Register it in `apps/web/src/styles.ts`:

```ts
registerStyle(myStyle);
```

It then shows up in the new-game screen and in the in-game *Game* menu.

## The map renderer

`createMapRenderer(canvas, hooks?)` returns an object with `render(scene)` and `dispose()`. The optional `hooks` (`MapLayerHooks`, see [Layer hooks](#layer-hooks)) let a sprite style paint some of your layers; a renderer may ignore them. The shell calls `render` whenever something changes, and passes a `Scene`:

| Field | Meaning |
| --- | --- |
| `state` | The full, read-only `GameState`. Never mutate it. |
| `viewer` | The nation whose knowledge is shown. Draw only tiles it has explored. |
| `camera` | `{ x, y, zoom }`: the tile at the centre of the view and the size of a tile in CSS pixels. |
| `width`, `height`, `pixelRatio` | Viewport size. Size the canvas backing store to `width × pixelRatio`. |
| `visible` | One byte per tile: 1 when the viewer can see it now. Hide foreign units elsewhere. |
| `selectedUnitId`, `hover`, `path` | Interaction feedback to draw. |
| `pathTurns` | Optional. Turns of movement the selected unit needs to reach the end of `path`. When it is above 1, draw it as a small counter badge on the target tile. Older renderers can ignore it. |
| `labels` | `false` in close-up views (the colony screen), where captions should be hidden. |

Helpers in `@cc/render-api` take care of the bookkeeping: `tileToScreen`, `screenToTile`, `visibleRange`, `isTileExplored`, `isTileVisible`, `unitStacks` (one unit to draw per tile, honouring selection and visibility), `nationColor` and `hash2` (deterministic scatter for decorations).

The shell does all hit-testing with `screenToTile`. A renderer must therefore use the same square grid: tile `(x, y)` covers `tileToScreen(x, y)` to `tileToScreen(x + 1, y + 1)`. Inside that square you can draw anything. Sprites may overflow into neighbouring tiles.

## Icons and theme

`drawIcon(ctx, icon, size)` draws into a `size × size` box at the origin. The shell caches each icon as an image. Icons appear in the side panel, the colony screen and Europe.

The `theme` values become CSS custom properties on the page while the style is active, so panels and buttons match the map.

A style that loads images in the background can implement the optional `onAssetsChanged(listener)`: the shell then drops its cached icons and redraws whenever more assets have arrived.

### Interface CSS

`theme` covers the shell's colours, fonts, line width and corner radius. A style that wants a different interface beyond that (framed panels, painted buttons, no hand-drawn look at all) can also provide `css` (a string) and `cssUrls` (stylesheet files). The shell adds them while the style is active and removes them when another style is chosen. `stylesheets` (web fonts) stay loaded. Scope the rules to the style, for example `:root[data-style="my-style"] .panel { … }`. The shell sets `data-style` on the root element.

## Rules for styles

- Do not import anything from the web shell. Depend only on `@cc/engine` (for types and rule tables) and `@cc/render-api`.
- Do not change the game state, and do not keep game state of your own between frames. A renderer may cache drawings.
- Keep everything procedural, or ship your own original assets.

`packages/style-schematic` is a short, complete example. `packages/style-ligne-claire` is the full default style. `packages/style-sprites` builds styles from bitmap sprite packs (below).

## Layer hooks

`MapLayerHooks` (in `@cc/render-api`) name the layers of a map frame: `water`, `land` (with a `shape()` callback that traces the renderer's own outline of the tile), `shore`, `plowed`, `road`, `relief` (hills, mountains, forest), `bonus`, `rumour`, `settlement`, `colony` and `unit`, plus `beginFrame`. A renderer that supports them offers each piece to its hook first. A hook returns `true` when it drew the piece, and `false` to let the renderer draw it as usual. Everything else (coastline ink, rivers, fog, captions, pennants, routes, badges) stays with the renderer. `LigneClaireMapRenderer` supports all of them. The schematic renderer ignores them.

## Sprite packs

`@cc/style-sprites` turns a **sprite pack** into a style:

```ts
import { createSpriteStyle } from '@cc/style-sprites';
import ligneClaire from '@cc/style-ligne-claire';

registerStyle(createSpriteStyle(myPack, ligneClaire));
```

A `SpritePack` is data (`packages/style-sprites/src/pack.ts`):

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description` | As for any style. |
| `theme`, `stylesheets` | A theme and fonts, or `'inherit'` to take the fallback style's. |
| `source` | `base`: the folder holding the pipeline's `manifest.json` (relative to the page, or a full URL). Also `manifest`, the query parameter and localStorage key that override the folder (default `?sprites=`), and optionally `sizes` to restrict the pixel and smooth sizes used. |
| `mapping` | Game concepts to sprite ids: units by type and role, terrain (base, plowed, water under land, per-terrain overrides), forest, hills and mountains, bonus resources by terrain, rumours, road pieces, coast bands, colonies by size, stockade and fort, settlements by tribe and capital, buildings by level, goods, and the nation overlays (pennant, flag, mission). |
| `rules` | How each kind of sprite sits on a tile: its size relative to the tile, where its anchor (the ground point from the manifest) goes, the bonus marker box, the walls, the colony flag, the mission marker and the unit icon pennant. |
| `procedural` | Layers to leave to the fallback even when sprites exist (`water`, `land`, `shore`, `roads`, `relief`, `bonus`, `rumour`, `settlements`, `colonies`, `units`, `icons`). Rivers, the coastline's ink, fog, captions and markers always come from the fallback. |

Ids are templates. `{type}`, `{role}`, `{terrain}`, `{tribe}`, `{building}`, `{level}` and `{product}` become the engine ids in kebab-case (`expertFurTrapper` becomes `expert-fur-trapper`). A slot holds one template, a list tried in order, or `null` (always procedural). `DEFAULT_MAPPING` is the scheme of [SPRITE_PROMPTS.md](SPRITE_PROMPTS.md) section 5:

| Game state | Sprite ids tried |
| --- | --- |
| Colonist, no role | `units/{type}__none` |
| Colonist in a role | `units/{type}__{role}`, then `units/free-colonist__{role}` |
| Ship, wagon train, artillery, treasure | `units/{type}__none` (e.g. `units/man-of-war__none`) |
| Land tile | plowed: `terrain/{terrain}__plowed` first; then `terrain/{terrain}` |
| Water tile, water under land | `terrain/ocean` or `terrain/high-seas`; `terrain/ocean` under land |
| Forest, hills, mountains | `decor/forest__{terrain}`, `decor/hills`, `decor/mountains` |
| Bonus resource | on forest `decor/bonus__game`; else by terrain: fish, wheat, oasis, tobacco, cotton, sugar, ore, silver |
| Lost City Rumour | `decor/ruins` |
| Road | `decor/road__hub`, `decor/road__spoke` and `decor/road__spoke-diagonal`, turned in quarter steps |
| Shore | `terrain/coast__edge`, `__inner` and `__outer`, turned in quarter steps |
| Colony | `colonies/colony__small` (0 to 3 colonists), `__medium` (4 to 7), `__large` (8 or more); walls `colonies/stockade` (level 1) and `colonies/fort` (level 2), split at the manifest's `split` line into a back and a front part |
| Settlement | `settlements/{tribe}`; a capital tries `settlements/{tribe}__capital` first |
| Building icon | `buildings/{building}__{level}`, then the lower levels |
| Goods icon | `goods/{product}` |

Sprites are nation-neutral. Ownership stays visible through the fallback's pennant and stack badge on units, a flag in the owner's colour on colonies, the tinted `overlays/mission` on settlements with a mission, and the tinted `overlays/pennant` on the icons of ships, soldiers and artillery.

**Falling back.** Nothing waits for the network. The style fetches the manifest when it is first used, and each image the first time it is needed at a size. Until it arrives, or when it never does (offline, a missing file, a refused CORS request, the single-file build), the fallback draws that piece, and views redraw as images come in. An id missing from the manifest falls back for that one sprite only.

**Sizes.** For a box of `d` CSS px the style needs `n = d × devicePixelRatio` device pixels. Above the largest pixel size it takes the smallest smooth size at or above `n` and draws it with high-quality smoothing. In the pixel range it draws a pixel size at a whole-number scale (nearest-neighbour, on whole device pixels) when that fills at least 85% of the box. Tiles, which must fill their square, use the pixel size at or above `n`, nearest-neighbour.

**Extending a pack.** `extendPack(pack, overrides)` merges overrides into a pack: objects key by key, anything else replaces. A future scenario can bring its own pack this way, for example Australia-specific units and terrain over the standard art, with everything it does not mention unchanged:

```ts
const australia = extendPack(ligneClairePaintedPack, {
  id: 'ligne-claire-painted-australia',
  name: 'Ligne claire (painted, Australia)',
  mapping: {
    terrain: { types: { savannah: ['terrain/outback', 'terrain/savannah'] } },
    units: { types: { freeColonist: 'units/settler__none' } },
    settlements: { tribes: { arawak: { camp: 'settlements/yolngu' } } },
  },
});
```

### Ligne claire (painted)

The first pack, `packages/style-sprites/packs/ligne-claire-painted.ts`, uses the default mapping and rules, with Ligne claire as the fallback and its theme and fonts. Its sprites live in `assets/runtime/` next to the page (https://casual.spence.dk/assets/runtime/ on the server). Point it elsewhere with `?sprites=https://casual.spence.dk/assets/runtime/` (remembered; `?sprites=default` forgets it, `?sprites=off` draws everything procedurally). Loading from another origin needs `Access-Control-Allow-Origin: *` on the server's `/assets/runtime/`. Without it the browser refuses the images and the style falls back to Ligne claire.

### Interface CSS in a pack

A pack can restyle the interface too, so a sprite style is not tied to the fallback's hand-drawn look:

- `css`: inline CSS.
- `cssFiles`: stylesheet files. A relative path such as `pack.css` is loaded from the sprite folder, next to the sprites, so `url(ui/panel-border@128.png)` inside it finds the pack's own UI art. Absolute URLs are used as given.
- `fallbackCss: false`: drops the fallback style's own interface CSS. The fallback's theme variables still apply unless the pack sets `theme`.

For example, a pack can frame panels with its `ui/panel-border` sprite:

```css
:root[data-style="my-pack"] .card { border: 24px solid transparent; border-image: url(ui/panel-border@128.png) 40 round; }
```

The map itself still falls back to the procedural style for any sprite the pack lacks.

### Adding a sprite pack

1. **Art.** Write prompts in the manner of [SPRITE_PROMPTS.md](SPRITE_PROMPTS.md) and generate 1024 px masters with `tools/image-gen`. Keep the standard ids where you can; a new id just needs a mapping entry.
2. **Runtime sprites.** Run `tools/sprite-pipeline` over the masters, from a folder or from the server (`node tools/sprite-pipeline/build.mjs --in https://casual.spence.dk/assets/sprites/`). It writes `out/manifest.json` and every size (pixel art at 16, 24 and 32 px, smooth from 48 px up). Check its contact sheet, `out/index.html`.
3. **Upload** `out/`, without `index.html` and `_sheet/`, to the server: `https://casual.spence.dk/assets/runtime/` for the standard pack, or a folder of its own for another. To ship only some sizes, `node scripts/copy-runtime.mjs <dir> --from tools/sprite-pipeline/out --sizes 16,24,32,48,64,96,128,192` writes a trimmed copy, manifest included, to `<dir>/assets/runtime/`.
4. **Pack.** Add a file under `packages/style-sprites/packs/` with `source.base` pointing at the folder, the mapping and rules that differ from the defaults, and `createSpriteStyle(pack, fallback)`. Register the style in `apps/web/src/styles.ts`.
5. **Release.** `npm run release` builds `site/` and, when a runtime set is available locally (`tools/sprite-pipeline/out`, or the folder in `CC_RUNTIME_DIR`), copies it into `site/assets/runtime/`. That folder is gitignored: the images go to the server, not into git.
