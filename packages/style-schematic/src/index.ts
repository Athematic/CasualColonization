/**
 * A deliberately plain board-game style. It exists to show (and test) that the game
 * shell works with any style plugin, and is a starting point for new styles.
 */
import { NATIONS, TERRAIN, TRIBES, UNIT_TYPES, colonyWorkers, type GameState, type Tile, type TerrainId } from '@cc/engine';
import {
  isTileExplored,
  isTileVisible,
  tileToScreen,
  unitStacks,
  visibleRange,
  type IconRequest,
  type MapRenderer,
  type Scene,
  type StylePlugin,
} from '@cc/render-api';

const COLORS: Record<TerrainId, string> = {
  ocean: '#2d5f8a',
  highSeas: '#1f4766',
  plains: '#8fae5a',
  grassland: '#6f9e4a',
  prairie: '#b8a95a',
  savannah: '#b39a3e',
  marsh: '#6f8a6a',
  swamp: '#557a5a',
  desert: '#c9b27a',
  tundra: '#9aa59a',
  arctic: '#e6eef2',
  hills: '#9a845a',
  mountains: '#7a7068',
};

const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif";

function tileColor(tile: Tile): string {
  const base = COLORS[tile.t];
  return tile.f && !TERRAIN[tile.t].water ? mix(base, '#2f5a2a') : base;
}

function mix(a: string, b: string): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round((((pa >> sh) & 255) + ((pb >> sh) & 255)) / 2);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

const UNIT_LETTERS: Record<string, string> = { ship: '⛵', wagon: 'W', artillery: 'A', treasure: '$' };

function unitLabel(type: keyof typeof UNIT_TYPES, role: string): string {
  const kind = UNIT_TYPES[type].kind;
  if (kind !== 'colonist') return UNIT_LETTERS[kind];
  return { soldier: 'S', dragoon: 'D', pioneer: 'P', scout: 'Sc', missionary: 'M' }[role] ?? 'C';
}

class SchematicRenderer implements MapRenderer {
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  render(scene: Scene): void {
    const { canvas, ctx } = this;
    const dpr = scene.pixelRatio;
    canvas.width = Math.round(scene.width * dpr);
    canvas.height = Math.round(scene.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111418';
    ctx.fillRect(0, 0, scene.width, scene.height);
    const s = scene.state as GameState;
    const z = scene.camera.zoom;
    const r = visibleRange(scene);
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (!isTileExplored(scene, x, y)) continue;
        const p = tileToScreen(scene, x, y);
        const tile = s.map.tiles[y * s.map.width + x];
        ctx.fillStyle = tileColor(tile);
        ctx.fillRect(p.x, p.y, z, z);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, z - 1, z - 1);
        if (tile.lcr) this.text('?', p.x + z / 2, p.y + z / 2, z * 0.5, '#ffe28a');
        if (tile.r) {
          ctx.fillStyle = '#5a4630';
          ctx.fillRect(p.x + z * 0.44, p.y + z * 0.44, z * 0.12, z * 0.12);
        }
        if (!isTileVisible(scene, x, y)) {
          ctx.fillStyle = 'rgba(17,20,24,0.35)';
          ctx.fillRect(p.x, p.y, z, z);
        }
      }
    }
    for (const st of Object.values(s.settlements)) {
      if (!isTileExplored(scene, st.x, st.y)) continue;
      const p = tileToScreen(scene, st.x, st.y);
      ctx.fillStyle = TRIBES[st.tribe].color;
      ctx.beginPath();
      ctx.arc(p.x + z / 2, p.y + z / 2, z * 0.32, 0, Math.PI * 2);
      ctx.fill();
      this.text(st.capital ? '★' : '▲', p.x + z / 2, p.y + z / 2, z * 0.34, '#fff');
    }
    for (const c of Object.values(s.colonies)) {
      if (!isTileExplored(scene, c.x, c.y)) continue;
      const p = tileToScreen(scene, c.x, c.y);
      ctx.fillStyle = NATIONS[c.owner].color;
      ctx.fillRect(p.x + z * 0.12, p.y + z * 0.12, z * 0.76, z * 0.76);
      this.text(String(colonyWorkers(s, c).length), p.x + z / 2, p.y + z / 2, z * 0.4, '#fff');
      if (scene.labels !== false) this.text(c.name, p.x + z / 2, p.y + z * 1.1, Math.max(10, z * 0.22), '#fff');
    }
    for (const stack of unitStacks(scene)) {
      const p = tileToScreen(scene, stack.x, stack.y);
      const selected = stack.top.id === scene.selectedUnitId;
      ctx.fillStyle = NATIONS[stack.top.owner].color;
      ctx.beginPath();
      ctx.arc(p.x + z * 0.5, p.y + z * 0.5, z * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeStyle = selected ? '#ffe28a' : '#000';
      ctx.stroke();
      this.text(unitLabel(stack.top.type, stack.top.role), p.x + z / 2, p.y + z / 2, z * 0.3, '#fff');
      if (stack.count > 1) this.text(String(stack.count), p.x + z * 0.85, p.y + z * 0.18, z * 0.22, '#fff');
    }
    for (const step of scene.path ?? []) {
      const p = tileToScreen(scene, step.x, step.y);
      ctx.fillStyle = '#ffe28a';
      ctx.fillRect(p.x + z * 0.45, p.y + z * 0.45, z * 0.1, z * 0.1);
    }
    if (scene.hover) {
      const p = tileToScreen(scene, scene.hover.x, scene.hover.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + 1.5, p.y + 1.5, z - 3, z - 3);
    }
    const end = scene.path?.[scene.path.length - 1];
    if (end && scene.pathTurns && scene.pathTurns > 1) {
      // Plain counter: turns needed to reach the end of the route.
      const p = tileToScreen(scene, end.x, end.y);
      const r = Math.max(7, z * 0.17);
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath();
      ctx.arc(p.x + z * 0.8, p.y + z * 0.2, r, 0, Math.PI * 2);
      ctx.fill();
      this.text(String(scene.pathTurns), p.x + z * 0.8, p.y + z * 0.2 + 0.5, r * 1.3, '#000');
    }
  }

  private text(t: string, x: number, y: number, size: number, color: string): void {
    const ctx = this.ctx;
    ctx.font = `600 ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  }

  dispose(): void {}
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: IconRequest, size: number): void {
  ctx.font = `600 ${Math.round(size * 0.42)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (icon.kind === 'unit') {
    ctx.fillStyle = NATIONS[icon.nation].color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(unitLabel(icon.type, icon.role), size / 2, size / 2);
  } else if (icon.kind === 'product') {
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillText(icon.product.slice(0, 2).toUpperCase(), size / 2, size / 2);
  } else if (icon.kind === 'building') {
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(size * 0.15, size * 0.3, size * 0.7, size * 0.55);
  } else {
    ctx.fillStyle = tileColor(icon.tile);
    ctx.fillRect(0, 0, size, size);
  }
}

export const schematic: StylePlugin = {
  id: 'schematic',
  name: 'Schematic',
  description: 'A plain, high-contrast board-game look. Also the reference for writing new style plugins.',
  theme: {
    '--paper': '#111418',
    '--ink': '#e9edf1',
    '--panel': '#1c2228',
    '--panel-ink': '#e9edf1',
    '--accent': '#3d8fd1',
    '--accent-ink': '#ffffff',
    '--muted': '#93a1ad',
    '--line': '#3a444e',
    '--font': FONT,
    '--heading-font': FONT,
    '--line-width': '1px',
    '--radius': '4px',
  },
  createMapRenderer: (canvas) => new SchematicRenderer(canvas),
  drawIcon,
  tileColor,
};

export default schematic;
