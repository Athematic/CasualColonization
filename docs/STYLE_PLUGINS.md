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

`createMapRenderer(canvas)` returns an object with `render(scene)` and `dispose()`. The shell calls `render` whenever something changes, and passes a `Scene`:

| Field | Meaning |
| --- | --- |
| `state` | The full, read-only `GameState`. Never mutate it. |
| `viewer` | The nation whose knowledge is shown. Draw only tiles it has explored. |
| `camera` | `{ x, y, zoom }`: the tile at the centre of the view and the size of a tile in CSS pixels. |
| `width`, `height`, `pixelRatio` | Viewport size. Size the canvas backing store to `width × pixelRatio`. |
| `visible` | One byte per tile: 1 when the viewer can see it now. Hide foreign units elsewhere. |
| `selectedUnitId`, `hover`, `path` | Interaction feedback to draw. |
| `labels` | `false` in close-up views (the colony screen), where captions should be hidden. |

Helpers in `@cc/render-api` take care of the bookkeeping: `tileToScreen`, `screenToTile`, `visibleRange`, `isTileExplored`, `isTileVisible`, `unitStacks` (one unit to draw per tile, honouring selection and visibility), `nationColor` and `hash2` (deterministic scatter for decorations).

The shell does all hit-testing with `screenToTile`. A renderer must therefore use the same square grid: tile `(x, y)` covers `tileToScreen(x, y)` to `tileToScreen(x + 1, y + 1)`. Inside that square you can draw anything. Sprites may overflow into neighbouring tiles.

## Icons and theme

`drawIcon(ctx, icon, size)` draws into a `size × size` box at the origin. The shell caches each icon as an image. Icons appear in the side panel, the colony screen and Europe.

The `theme` values become CSS custom properties on the page while the style is active, so panels and buttons match the map.

## Rules for styles

- Do not import anything from the web shell. Depend only on `@cc/engine` (for types and rule tables) and `@cc/render-api`.
- Do not change the game state, and do not keep game state of your own between frames. A renderer may cache drawings.
- Keep everything procedural, or ship your own original assets.

`packages/style-schematic` is a short, complete example. `packages/style-ligne-claire` is the full default style.
