import { formatDate, type GameState } from '@cc/engine';
import cover from '../assets/cover-landfall.webp';
import coverSmall from '../assets/cover-landfall-small.webp';
import { h } from '../dom.js';
import { loadAuto } from '../save.js';

export interface LandingActions {
  resume: (state: GameState) => void;
  quickGame: () => void;
  newGame: () => void;
  watch: () => void;
  load: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The title, lettered like an adventure-album cover: cream "CASUAL" over golden "COLONIZATION". */
function titleLettering(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1024 300');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Casual Colonization');
  svg.classList.add('cover-title');
  const word = (text: string, x: number, y: number, size: number, fill: string, stroke: number, spacing: number) => {
    const t = document.createElementNS(SVG_NS, 'text');
    t.textContent = text;
    for (const [k, v] of Object.entries({ x, y, 'font-size': size, fill, 'stroke-width': stroke, 'letter-spacing': spacing })) t.setAttribute(k, String(v));
    svg.appendChild(t);
  };
  word('CASUAL', 512, 112, 82, '#fffdf6', 12, 14);
  word('COLONIZATION', 520, 246, 138, '#3a6fb0', 0, 4);
  word('COLONIZATION', 512, 238, 138, '#ffd23f', 14, 4);
  return svg;
}

export function landingScreen(host: HTMLElement, actions: LandingActions): HTMLElement {
  const saved = loadAuto();
  const img = h('img', {
    class: 'cover-image',
    src: cover,
    srcset: `${coverSmall} 512w, ${cover} 1024w`,
    sizes: '(max-width: 760px) 100vw, 46vw',
    alt: 'Colonists come ashore from a longboat on a wild coast; a caravel lies at anchor, a scout on horseback points inland, and longhouses stand by a river under snow-capped mountains.',
    width: 1024,
    height: 1536,
  });
  const el = h('main', { class: 'landing' },
    h('figure', { class: 'cover' }, img, titleLettering()),
    h('section', { class: 'landing-panel' },
      h('p', { class: 'eyebrow' }, 'A game of the New World, 1492–1850'),
      h('h1', { class: 'landing-heading' }, 'Found colonies. Trade with Europe. Win your independence.'),
      h('p', { class: 'landing-pitch' },
        'Sail west, land your first colonists and build a nation: work the land, run the market, meet the native peoples, bring Founding Fathers into Congress, and decide when to break with the Crown. Play against up to seven nations, each led by a person or a computer.'),
      h('div', { class: 'landing-actions' },
        saved ? h('button', { class: 'btn primary big', onclick: () => actions.resume(saved) }, `Continue (${formatDate(saved.turn)})`) : null,
        h('button', { class: `btn big${saved ? '' : ' primary'}`, onclick: actions.quickGame, title: 'England against three Competent computer nations on a random map' }, 'Quick game'),
        h('button', { class: 'btn big', onclick: actions.newGame }, 'New game…'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', onclick: actions.watch }, 'Watch the computers play'),
          h('button', { class: 'btn', onclick: actions.load }, 'Load from file'))),
      h('ul', { class: 'landing-features' },
        h('li', null, 'Generated worlds, or hand-made maps of the Americas'),
        h('li', null, 'Four computer personalities, from Naive to Creative'),
        h('li', null, 'Head starts: jump in at 1600, 1700 or later'),
        h('li', null, 'Hot-seat play for friends on one device')),
      h('p', { class: 'muted small' }, 'Alpha · Ligne claire edition')));
  host.appendChild(el);
  return el;
}
