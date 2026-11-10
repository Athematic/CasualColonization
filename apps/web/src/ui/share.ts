import { buildShare, settingsFromConfig, type GameConfig } from '@cc/engine';
import qrcode from 'qrcode-generator';
import { h } from '../dom.js';
import { choose, toast } from './dialogs.js';

/** The address of this page without query or fragment: where a share link points. */
export function pageBase(): string {
  return `${location.origin}${location.pathname}`;
}

/** The QR code of a text as inline SVG (error correction M, four-module quiet zone, dark on light). Works offline. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied.`);
  } catch {
    window.prompt(`Copy ${what.toLowerCase()}:`, text);
  }
}

/** The "Share game" dialog: QR code of the link, the link, and the short code, each with a Copy button. */
export function shareDialog(config: GameConfig): Promise<unknown> {
  const share = buildShare(settingsFromConfig(config), pageBase(), qrSvg);
  const qr = h('div', { class: 'share-qr', role: 'img', 'aria-label': 'QR code of the game link', style: 'background:#fff;padding:8px;width:240px;height:240px;margin:0 auto;border-radius:4px' });
  qr.innerHTML = share.qr;
  const svg = qr.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '224');
    svg.setAttribute('height', '224');
    svg.style.display = 'block';
  }
  const row = (label: string, value: string, what: string) =>
    h('div', { class: 'field' },
      h('span', null, label),
      h('div', { class: 'row' },
        h('input', { type: 'text', readOnly: true, value, 'aria-label': label, style: 'flex:1;min-width:0', onfocus: (e: Event) => (e.target as HTMLInputElement).select() }),
        h('button', { class: 'btn small', onclick: () => void copy(value, what) }, 'Copy')));
  const body = h('div', { class: 'share-body' },
    h('p', { class: 'muted small' }, 'Scan the code or send the link: it opens the New game screen with every choice filled in (seed, map, nations, difficulty, options). The same code gives the same world in the same game version.'),
    qr,
    row('Link', share.link, 'Link'),
    row('Game code', share.code, 'Game code'));
  return choose('Share this game', body, [{ label: 'Close', value: 'close', primary: true }]);
}
