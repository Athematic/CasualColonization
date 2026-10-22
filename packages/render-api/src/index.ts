/**
 * The contract between the game shell and graphical styles.
 *
 * A style plugin turns read-only game state into pixels. It never changes the state
 * and knows nothing about input handling, panels or rules: the shell owns those.
 * Styles can therefore be swapped at any time, even mid-game.
 */
import {
  colonyWorkers,
  inBounds,
  isShip,
  NATIONS,
  sightRadius,
  TRIBES,
  unitPosition,
  type BuildingKind,
  type Colony,
  type GameState,
  type GoodId,
  type NationId,
  type ProductId,
  type RoleId,
  type Settlement,
  type Tile,
  type TribeId,
  type UnitTypeId,
} from '@cc/engine';

export interface Camera {
  /** Tile coordinate at the centre of the view (fractional). */
  x: number;
  y: number;
  /** Size of one tile in CSS pixels. */
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Everything a map renderer needs to draw one frame. */
export interface Scene {
  state: Readonly<GameState>;
  /** The nation whose knowledge of the world is shown. */
  viewer: NationId;
  camera: Camera;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio the canvas backing store uses. */
  pixelRatio: number;
  selectedUnitId?: string;
  hover?: Point;
  /** Planned route of the selected unit. */
  path?: Point[];
  /**
   * Turns of movement the selected unit needs to reach the end of `path`. Optional; when it is
   * above 1, renderers should show it as a small counter badge on the target tile.
   */
  pathTurns?: number;
  /** Tiles currently in sight of the viewer's units and colonies. */
  visible: Uint8Array;
  /** Show the whole map (debug / spectator). */
  revealAll?: boolean;
  /** Draw name captions (default true); close-up views turn them off. */
  labels?: boolean;
}

export interface MapRenderer {
  render(scene: Scene): void;
  dispose(): void;
}

// ---- Layer hooks: letting another style paint some layers of a procedural map ----

/** One explored tile in view, with its top-left corner on screen (CSS px). */
export interface LayerTile {
  x: number;
  y: number;
  px: number;
  py: number;
  tile: Tile;
}

type Ctx2D = CanvasRenderingContext2D;

/**
 * Optional per-layer overrides a map renderer may accept (`createMapRenderer(canvas, hooks)`).
 * A layered renderer calls the hook for a layer first; when it returns true, the layer is done and
 * the renderer's own drawing for it is skipped, otherwise the renderer draws it as usual. This is
 * how a sprite style paints the ground, units and towns over a procedural style and falls back to
 * it for anything it cannot draw (yet). Renderers that do not support hooks simply ignore them.
 * Everything else (coastline ink, rivers, fog, captions, markers) stays with the renderer.
 */
export interface MapLayerHooks {
  /** Once per frame, before any layer. */
  beginFrame?(ctx: Ctx2D, scene: Scene): void;
  /** Water under a tile (land tiles get it too, under their rounded corners), with its details. */
  water?(ctx: Ctx2D, t: LayerTile, z: number): boolean;
  /** The ground of a land tile. `shape` traces the renderer's outline of the tile (rounded towards water) as a path. */
  land?(ctx: Ctx2D, t: LayerTile, z: number, shape: () => void, state: Readonly<GameState>): boolean;
  /** Extra shore detail on the water, under the coastline. */
  shore?(ctx: Ctx2D, tiles: readonly LayerTile[], z: number, state: Readonly<GameState>): void;
  /** Plowed fields on a land tile (true also when `land` already showed them). */
  plowed?(ctx: Ctx2D, t: LayerTile, z: number): boolean;
  road?(ctx: Ctx2D, t: LayerTile, z: number, state: Readonly<GameState>): boolean;
  /** Hills, mountains or forest. */
  relief?(ctx: Ctx2D, t: LayerTile, z: number): boolean;
  bonus?(ctx: Ctx2D, t: LayerTile, z: number): boolean;
  rumour?(ctx: Ctx2D, t: LayerTile, z: number): boolean;
  settlement?(ctx: Ctx2D, settlement: Readonly<Settlement>, px: number, py: number, z: number): boolean;
  colony?(ctx: Ctx2D, colony: Readonly<Colony>, size: number, px: number, py: number, z: number): boolean;
  /** The unit on top of a stack, centred at (x, y) in a box of size s (nation pennants stay with the renderer). */
  unit?(ctx: Ctx2D, stack: MapUnitStack, x: number, y: number, s: number): boolean;
  /** A native brave, centred at (x, y) in a box of size s (the tribe's pennant stays with the renderer). */
  brave?(ctx: Ctx2D, brave: MapBrave, x: number, y: number, s: number): boolean;
}

export type IconRequest =
  | { kind: 'unit'; type: UnitTypeId; role: RoleId; nation: NationId }
  | { kind: 'product'; product: ProductId }
  | { kind: 'building'; building: BuildingKind; level: number }
  | { kind: 'tile'; tile: Tile };

/** CSS custom properties the shell applies while a style is active. */
export interface StyleTheme {
  '--paper': string;
  '--ink': string;
  '--panel': string;
  '--panel-ink': string;
  '--accent': string;
  '--accent-ink': string;
  '--muted': string;
  '--line': string;
  '--font': string;
  '--heading-font': string;
  '--line-width': string;
  '--radius': string;
}

export interface StylePlugin {
  id: string;
  name: string;
  description: string;
  theme: StyleTheme;
  /** Optional stylesheet URLs (for example web fonts) the style wants loaded. They stay loaded. */
  stylesheets?: string[];
  /**
   * Optional CSS that restyles the shell's interface (panels, buttons, dialogs) while this style is
   * active, for styles that want their own look beyond the theme variables. Removed again when
   * another style is chosen. Scope rules to `:root[data-style="<id>"]` to be safe.
   */
  css?: string;
  /** Optional CSS file URLs with the same lifetime as `css`; `url()` inside them resolves against the file. */
  cssUrls?: string[];
  /** `hooks` lets another style paint some layers (see MapLayerHooks); a renderer may ignore it. */
  createMapRenderer(canvas: HTMLCanvasElement, hooks?: MapLayerHooks): MapRenderer;
  /** Draws an icon centred in a size×size box at the origin of the context. */
  drawIcon(ctx: CanvasRenderingContext2D, icon: IconRequest, size: number): void;
  /** Flat colour for a tile, used by the minimap. */
  tileColor(tile: Tile): string;
  /**
   * Optional, for styles that load images in the background. Calls `listener` whenever more of
   * the style's assets have arrived, so the shell can drop cached icons and draw again. Returns an
   * unsubscribe function. Map renderers redraw themselves; this is for `drawIcon` results.
   */
  onAssetsChanged?(listener: () => void): () => void;
}

// ---- Registry ----

const styles = new Map<string, StylePlugin>();

export function registerStyle(plugin: StylePlugin): void {
  styles.set(plugin.id, plugin);
}

export function listStyles(): StylePlugin[] {
  return [...styles.values()];
}

export function getStyle(id: string): StylePlugin | undefined {
  return styles.get(id);
}

// ---- Geometry shared by square-grid renderers ----

export function tileToScreen(scene: Pick<Scene, 'camera' | 'width' | 'height'>, tx: number, ty: number): Point {
  const { camera, width, height } = scene;
  return {
    x: Math.round((tx - camera.x) * camera.zoom + width / 2),
    y: Math.round((ty - camera.y) * camera.zoom + height / 2),
  };
}

export function screenToTile(scene: Pick<Scene, 'camera' | 'width' | 'height'>, sx: number, sy: number): Point {
  const { camera, width, height } = scene;
  return {
    x: Math.floor((sx - width / 2) / camera.zoom + camera.x),
    y: Math.floor((sy - height / 2) / camera.zoom + camera.y),
  };
}

/** Inclusive tile range covering the viewport. */
export function visibleRange(scene: Pick<Scene, 'camera' | 'width' | 'height' | 'state'>) {
  const a = screenToTile(scene, 0, 0);
  const b = screenToTile(scene, scene.width, scene.height);
  return {
    x0: Math.max(0, a.x - 1),
    y0: Math.max(0, a.y - 1),
    x1: Math.min(scene.state.map.width - 1, b.x + 1),
    y1: Math.min(scene.state.map.height - 1, b.y + 1),
  };
}

// ---- Knowledge helpers ----

export function computeVisibility(s: Readonly<GameState>, viewer: NationId): Uint8Array {
  const w = s.map.width;
  const out = new Uint8Array(w * s.map.height);
  const mark = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (inBounds(s as GameState, x + dx, y + dy)) out[(y + dy) * w + x + dx] = 1;
  };
  for (const u of Object.values(s.units)) {
    if (u.owner !== viewer) continue;
    const p = unitPosition(s as GameState, u);
    if (p && u.loc.kind !== 'colony') mark(p.x, p.y, sightRadius(u, s as GameState));
  }
  for (const c of Object.values(s.colonies)) if (c.owner === viewer) mark(c.x, c.y, 2);
  return out;
}

export function isTileExplored(scene: Scene, x: number, y: number): boolean {
  if (scene.revealAll) return true;
  const p = scene.state.players.find((p) => p.id === scene.viewer);
  return !!p && p.explored[y * scene.state.map.width + x] === 1;
}

export function isTileVisible(scene: Scene, x: number, y: number): boolean {
  return scene.revealAll || scene.visible[y * scene.state.map.width + x] === 1;
}

export function nationColor(nation: NationId): string {
  return NATIONS[nation].color;
}

export interface MapUnitStack {
  x: number;
  y: number;
  /** Unit to draw on top: the selected one, else the strongest-looking. */
  top: { id: string; type: UnitTypeId; role: RoleId; owner: NationId; state: string; working: boolean; cargo: number };
  count: number;
}

/** Groups the units a viewer can see into one stack per tile. Units inside colonies and aboard ships are hidden. */
export function unitStacks(scene: Scene): MapUnitStack[] {
  const s = scene.state as GameState;
  const byTile = new Map<number, MapUnitStack>();
  const w = s.map.width;
  for (const u of Object.values(s.units)) {
    if (u.loc.kind !== 'map') continue;
    const { x, y } = u.loc;
    if (u.owner !== scene.viewer && !isTileVisible(scene, x, y)) continue;
    if (!isTileExplored(scene, x, y)) continue;
    const key = y * w + x;
    const cargo = isShip(u) ? Object.values(s.units).filter((o) => o.loc.kind === 'carrier' && o.loc.carrierId === u.id).length : 0;
    const entry = { id: u.id, type: u.type, role: u.role, owner: u.owner, state: u.state, working: !!u.work, cargo };
    const existing = byTile.get(key);
    if (!existing) {
      byTile.set(key, { x, y, top: entry, count: 1 });
      continue;
    }
    existing.count++;
    const prefer = u.id === scene.selectedUnitId || (existing.top.id !== scene.selectedUnitId && isShip(u) && !isShipType(existing.top.type));
    if (prefer) existing.top = entry;
  }
  return [...byTile.values()];
}

/** A native brave as the map shows it: one per tile (the strongest), with how many stand there. */
export interface MapBrave {
  id: string;
  x: number;
  y: number;
  tribe: TribeId;
  armed: boolean;
  mounted: boolean;
  count: number;
}

/**
 * The braves a viewer can see: out on the land (those at home in their settlement are not drawn),
 * on tiles in sight, and not where the viewer's own units or a colony stand.
 */
export function braveMarkers(scene: Scene): MapBrave[] {
  const s = scene.state as GameState;
  const w = s.map.width;
  const byTile = new Map<number, MapBrave>();
  const settlements = new Set(Object.values(s.settlements).map((st) => st.y * w + st.x));
  const colonies = new Set(Object.values(s.colonies).map((c) => c.y * w + c.x));
  for (const b of Object.values(s.braves ?? {})) {
    const key = b.y * w + b.x;
    if (settlements.has(key) || colonies.has(key) || !isTileVisible(scene, b.x, b.y) || !isTileExplored(scene, b.x, b.y)) continue;
    const strength = (o: { armed: boolean; mounted: boolean }) => (o.armed ? 1 : 0) + (o.mounted ? 1 : 0);
    const entry: MapBrave = { id: b.id, x: b.x, y: b.y, tribe: b.tribe, armed: !!b.armed, mounted: !!b.mounted, count: 1 };
    const existing = byTile.get(key);
    if (!existing) byTile.set(key, entry);
    else {
      const count = existing.count + 1;
      byTile.set(key, strength(entry) > strength(existing) ? { ...entry, count } : { ...existing, count });
    }
  }
  return [...byTile.values()];
}

export function tribeColor(tribe: TribeId): string {
  return TRIBES[tribe].color;
}

function isShipType(type: UnitTypeId): boolean {
  return ['caravel', 'merchantman', 'galleon', 'privateer', 'frigate'].includes(type);
}

export function colonySize(s: Readonly<GameState>, colonyId: string): number {
  const c = s.colonies[colonyId];
  return c ? colonyWorkers(s as GameState, c).length : 0;
}

/** Small deterministic hash for scattering decorations. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export type { GoodId };
