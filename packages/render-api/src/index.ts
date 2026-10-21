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
  unitPosition,
  type BuildingKind,
  type GameState,
  type GoodId,
  type NationId,
  type ProductId,
  type RoleId,
  type Tile,
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
  /** Optional stylesheet URLs (for example web fonts) the style wants loaded. */
  stylesheets?: string[];
  createMapRenderer(canvas: HTMLCanvasElement): MapRenderer;
  /** Draws an icon centred in a size×size box at the origin of the context. */
  drawIcon(ctx: CanvasRenderingContext2D, icon: IconRequest, size: number): void;
  /** Flat colour for a tile, used by the minimap. */
  tileColor(tile: Tile): string;
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
