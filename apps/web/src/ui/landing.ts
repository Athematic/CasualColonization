import { AMERICAS, calendarOf, formatDate, getScenario, playableScenarios, term, type GameState, type Scenario } from '@cc/engine';
import colony from '../assets/cover-colony.webp';
import colonySmall from '../assets/cover-colony-small.webp';
import landfall from '../assets/cover-landfall.webp';
import landfallSmall from '../assets/cover-landfall-small.webp';
import liberty from '../assets/cover-liberty.webp';
import libertySmall from '../assets/cover-liberty-small.webp';
import map from '../assets/cover-map.webp';
import mapSmall from '../assets/cover-map-small.webp';
import trade from '../assets/cover-trade.webp';
import tradeSmall from '../assets/cover-trade-small.webp';
import coverWinter from '../assets/cover-winter.webp';
import coverWinterSmall from '../assets/cover-winter-small.webp';
import coverRiver from '../assets/cover-river.webp';
import coverRiverSmall from '../assets/cover-river-small.webp';
import coverFeast from '../assets/cover-feast.webp';
import coverFeastSmall from '../assets/cover-feast-small.webp';
import coverHarbours from '../assets/cover-harbours.webp';
import coverHarboursSmall from '../assets/cover-harbours-small.webp';
import coverSilver from '../assets/cover-silver.webp';
import coverSilverSmall from '../assets/cover-silver-small.webp';
import coverLostCity from '../assets/cover-lostcity.webp';
import coverLostCitySmall from '../assets/cover-lostcity-small.webp';
import { h } from '../dom.js';
import { loadAuto } from '../save.js';

export interface LandingActions {
  resume: (state: GameState) => void;
  quickGame: () => void;
  newGame: () => void;
  watch: () => void;
  load: () => void;
}

/**
 * Every front cover by id (docs/BOX_ART_PROMPTS.md, section 3, A–K: the Americas'). A scenario names its covers by
 * these ids (`Scenario.art.covers`); the title screen shows one at random.
 */
const COVERS: { id: string; src: string; small: string; alt: string }[] = [
  { id: 'landfall', src: landfall, small: landfallSmall, alt: 'Colonists come ashore from a longboat on a wild coast; a caravel lies at anchor, a scout on horseback points inland, and longhouses stand by a river under snow-capped mountains.' },
  { id: 'trade', src: trade, small: tradeSmall, alt: 'By a river, a colonist in a blue coat and a native trader kneel on a mat and shake hands over cloth, an axe, furs, maize and tobacco; canoes, a ship and a village lie beyond.' },
  { id: 'colony', src: colony, small: colonySmall, alt: 'A busy colony harbour: a ship unloads barrels and cotton onto the quay, colonists carry crates, and a town of red-roofed houses, a church and a hilltop fort rises behind.' },
  { id: 'map', src: map, small: mapSmall, alt: 'In a ship\'s cabin lit by a lantern, a captain and a young sailor with a telescope study a hand-drawn map of the coast, with compass and dividers, while a ship sails past the windows.' },
  { id: 'liberty', src: liberty, small: libertySmall, alt: 'Townspeople, farmers, soldiers and native neighbours cheer and throw their hats as a new blue and white flag is raised beside a ringing bell tower above a harbour full of ships.' },
  { id: 'winter', src: coverWinter, small: coverWinterSmall, alt: 'In a snowy forest clearing, colonists greet Wendat visitors on snowshoes who bring a toboggan of corn, fish and furs; log cabins and a palisade stand behind, chimney smoke rising into a pale winter sky.' },
  { id: 'river', src: coverRiver, small: coverRiverSmall, alt: 'A birch-bark canoe with voyageurs, a mapmaker and an Anishinaabe guide pointing ahead glides down a wide river past a trading post on a bluff, under towering summer clouds.' },
  { id: 'feast', src: coverFeast, small: coverFeastSmall, alt: 'At a long harvest table under autumn trees, colonists of two nations and their Lenape hosts share turkey, corn and pumpkins while an elder and two governors raise their cups.' },
  { id: 'harbours', src: coverHarbours, small: coverHarboursSmall, alt: 'Two merchant ships with blue and green pennants lie at a stone quay in a European port; two merchants shake hands over a crate of furs while porters load coffee, tobacco and casks.' },
  { id: 'silver', src: coverSilver, small: coverSilverSmall, alt: 'A mule train led by Quechua drivers and a Spanish officer winds down a mountain road in the Andes past green terraces, a llama in front, a white town and snowy peaks beyond.' },
  { id: 'lostcity', src: coverLostCity, small: coverLostCitySmall, alt: 'A Tupi guide holds back vines to show a European scout and a young cartographer the overgrown stone stairways of a ruined city in the rainforest, with parrots and a waterfall.' },
];

/**
 * The scenarios the title screen shows (Q14): the one of the autosaved game when there is one, else
 * every scenario people can choose.
 */
function shownScenarios(saved: GameState | undefined): Scenario[] {
  const last = saved && getScenario(saved.config.scenario ?? 'americas');
  return last ? [last] : playableScenarios();
}

/** The covers of those scenarios (a scenario without covers of its own shows the Americas'). */
export function coversFor(scenarios: Scenario[]): typeof COVERS {
  const ids = new Set(scenarios.flatMap((sc) => (sc.art?.covers?.length ? sc.art.covers : AMERICAS.art?.covers ?? [])));
  const covers = COVERS.filter((c) => ids.has(c.id));
  return covers.length ? covers : COVERS;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The title, lettered like an adventure-album cover: cream "CASUAL" over golden "COLONIZATION". */
function titleLettering(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1024 300');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Casual Colonization');
  svg.classList.add('cover-title');
  const word = (text: string, x: number, y: number, size: number, fill: string, stroke: number, spacing: number, fit?: number) => {
    const t = document.createElementNS(SVG_NS, 'text');
    t.textContent = text;
    for (const [k, v] of Object.entries({ x, y, 'font-size': size, fill, 'stroke-width': stroke, 'letter-spacing': spacing })) t.setAttribute(k, String(v));
    // Squeeze long words into the cover's width whatever the font's real letter widths are.
    if (fit) {
      t.setAttribute('textLength', String(fit));
      t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    svg.appendChild(t);
  };
  word('CASUAL', 512, 112, 82, '#fffdf6', 12, 14);
  word('COLONIZATION', 520, 246, 138, '#3a6fb0', 0, 4, 920);
  word('COLONIZATION', 512, 238, 138, '#ffd23f', 14, 4, 920);
  return svg;
}

export function landingScreen(host: HTMLElement, actions: LandingActions): HTMLElement {
  const loaded = loadAuto();
  const saved = loaded?.state;
  const scenarios = shownScenarios(saved);
  const covers = coversFor(scenarios);
  // The text of the one scenario shown; with several, the Americas' (the default terms) until there is a general text.
  const text: Scenario = scenarios.length === 1 ? scenarios[0] : AMERICAS;
  let shown = Math.floor(Math.random() * covers.length);
  const cover = covers[shown];
  const img = h('img', {
    class: 'cover-image',
    src: cover.src,
    srcset: `${cover.small} 512w, ${cover.src} 1024w`,
    sizes: '(max-width: 760px) 100vw, 46vw',
    alt: cover.alt,
    width: 1024,
    height: 1536,
  });
  /** Shows the next cover in turn (the first one is picked at random on load). */
  const nextCover = () => {
    shown = (shown + 1) % covers.length;
    const next = covers[shown];
    img.setAttribute('srcset', `${next.small} 512w, ${next.src} 1024w`);
    img.setAttribute('src', next.src);
    img.setAttribute('alt', next.alt);
  };
  const el = h('main', { class: 'landing' },
    h('figure', {
      class: 'cover',
      role: 'button',
      tabindex: 0,
      title: 'Show another cover',
      'aria-label': 'Show another cover',
      onclick: () => nextCover(),
      onkeydown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        nextCover();
      },
    }, img, titleLettering()),
    h('section', { class: 'landing-panel' },
      h('p', { class: 'eyebrow' }, term(text, 'landing.eyebrow')),
      h('h1', { class: 'landing-heading' }, term(text, 'landing.heading')),
      h('p', { class: 'landing-pitch' }, term(text, 'landing.pitch')),
      h('div', { class: 'landing-actions' },
        saved ? h('button', { class: 'btn primary big', onclick: () => actions.resume(saved) }, `Continue (${formatDate(saved.turn, calendarOf(saved))})`) : null,
        loaded?.error ? h('p', { class: 'save-error', role: 'status' }, `Your autosaved game can't be continued: ${loaded.error}`) : null,
        h('button', { class: `btn big${saved ? '' : ' primary'}`, onclick: actions.quickGame, title: 'England against three Competent computer nations on a random map' }, 'Quick game'),
        h('button', { class: 'btn big', onclick: actions.newGame }, 'New game…'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', onclick: actions.watch }, 'Watch the computers play'),
          h('button', { class: 'btn', onclick: actions.load }, 'Load from file'))),
      h('ul', { class: 'landing-features' },
        h('li', null, term(text, 'landing.maps')),
        h('li', null, 'Four computer personalities, from Naive to Creative'),
        h('li', null, 'Head starts: jump in at 1600, 1700 or later'),
        h('li', null, 'Hot-seat play for friends on one device')),
      h('p', { class: 'muted small' }, 'Alpha · Ligne claire edition')));
  host.appendChild(el);
  return el;
}
