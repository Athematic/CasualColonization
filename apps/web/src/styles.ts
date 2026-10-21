import { getStyle, listStyles, registerStyle, type IconRequest, type StylePlugin } from '@cc/render-api';
import ligneClaire from '@cc/style-ligne-claire';
import schematic from '@cc/style-schematic';

// Built-in styles. A new style only needs to implement StylePlugin and be registered here.
registerStyle(ligneClaire);
registerStyle(schematic);

export const DEFAULT_STYLE = ligneClaire.id;

let active: StylePlugin = ligneClaire;
const listeners = new Set<(s: StylePlugin) => void>();
const iconCache = new Map<string, string>();

export function activeStyle(): StylePlugin {
  return active;
}

export function availableStyles(): StylePlugin[] {
  return listStyles();
}

export function setStyle(id: string): void {
  const style = getStyle(id) ?? ligneClaire;
  active = style;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(style.theme)) root.style.setProperty(k, v);
  root.dataset.style = style.id;
  for (const href of style.stylesheets ?? []) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  }
  try {
    localStorage.setItem('cc.style', style.id);
  } catch {
    // Storage may be unavailable; the choice just will not persist.
  }
  for (const fn of listeners) fn(style);
  // Canvas text needs the web font; redraw once it has loaded.
  document.fonts?.ready.then(() => {
    iconCache.clear();
    for (const fn of listeners) fn(style);
  });
}

export function savedStyle(): string {
  try {
    return new URLSearchParams(location.search).get('style') ?? localStorage.getItem('cc.style') ?? DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export function onStyleChange(fn: (s: StylePlugin) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** An <img> of an icon drawn by the active style. */
export function icon(req: IconRequest, size = 40, title?: string): HTMLImageElement {
  const key = `${active.id}|${size}|${JSON.stringify(req)}`;
  let url = iconCache.get(key);
  if (!url) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    active.drawIcon(ctx, req, size);
    url = canvas.toDataURL();
    iconCache.set(key, url);
  }
  const img = new Image(size, size);
  img.src = url;
  img.className = 'icon';
  img.alt = title ?? '';
  if (title) img.title = title;
  img.draggable = false;
  return img;
}
