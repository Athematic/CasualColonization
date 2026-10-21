import {
  AI_LEVEL_INFO,
  AI_LEVELS,
  MAP_SIZES,
  NATION_ORDER,
  NATIONS,
  STORED_MAPS,
  parseStoredMap,
  formatDate,
  nationTitle,
  type AiLevel,
  type GameConfig,
  type GameState,
  type MapSize,
  type NationId,
} from '@cc/engine';
import { clear, h } from '../dom.js';
import { loadAuto, loadManual, pickSaveFile } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';

interface Slot {
  nation: NationId;
  /** A person, or the level of a computer player. */
  controller: 'human' | AiLevel;
}

/** Years a head start can jump to, as turns (one per year until 1600, then two). */
const HEAD_START_YEARS = [1550, 1600, 1650, 1700, 1750, 1800];
const turnOfYear = (year: number) => (year <= 1600 ? year - 1492 : 108 + (year - 1600) * 2);

/** "Fixed (W×H)" for a stored map. */
function storedMapSize(id: string): string {
  const def = STORED_MAPS.find((m) => m.id === id);
  if (!def) return 'Fixed';
  const { width, height } = parseStoredMap(def);
  return `Fixed (${width}×${height})`;
}

/** A "Planned" badge naming the roadmap release (docs/ROADMAP.md) that brings the option. */
const planned = (release: string) => h('span', { class: 'planned', title: `Planned for ${release}; see docs/ROADMAP.md` }, `Planned · ${release}`);

/** A disabled select previewing an option from the roadmap. The first choice is what the game does today. */
function plannedSelect(label: string, release: string, choices: string[], note?: string): HTMLElement {
  return h('label', { class: 'field planned-field', title: note },
    h('span', null, label, ' ', planned(release)),
    h('select', { disabled: true, 'aria-label': `${label} (planned)` }, choices.map((c) => h('option', null, c))));
}

/** Rule options from the roadmap, shown as disabled switches. */
const PLANNED_OPTIONS: { label: string; release: string; note: string }[] = [
  { label: 'Historical events', release: '0.6', note: 'Dated events from the period: wars in Europe, plagues, famous voyages.' },
  { label: 'Random events', release: '0.6', note: 'Sim City style surprises: storms, fires, bumper harvests, gold strikes.' },
  { label: 'Favoured Nation', release: '0.4', note: 'Years of peace and shared trade routes let two nations trade and buy ships in each other\'s home ports.' },
  { label: 'A market for every home port', release: '0.4', note: 'Each nation\'s port has its own prices and taxes, which makes triangle trading possible.' },
  { label: 'Visible native braves', release: '0.5', note: 'Braves wander, visit, trade, demand tribute and fight as units on the map.' },
  { label: 'A growing royal army', release: '0.5', note: 'The king builds up the Royal Expeditionary Force during the game, and you can watch it grow.' },
  { label: 'Convict transport', release: 'Scenarios', note: 'The Crown sends convicts as colonists; lobby for free settlers instead.' },
  { label: 'Play on past the end year', release: 'Long term', note: 'After the last year, the game continues in the style of Civilization II.' },
];

export function newGameScreen(
  host: HTMLElement,
  start: (config: GameConfig, head?: { turn: number; watch: boolean }) => void,
  resume: (state: GameState) => void,
  back?: () => void,
): HTMLElement {
  let count = 4;
  const slots: Slot[] = NATION_ORDER.map((nation, i) => ({ nation, controller: i === 0 ? 'human' : 'competent' }));
  let mapSize: MapSize = 'medium';
  /** Stored map id; empty for a generated map. */
  let map = '';
  let seed = Math.floor(Math.random() * 1e9);
  /** Year to take over in; 0 starts at the beginning. */
  let headYear = 0;
  let watchHeadStart = true;

  const el = h('main', { class: 'menu-screen' });
  const render = () => {
    clear(el);
    const auto = loadAuto();
    const manual = loadManual();
    const chosen = slots.slice(0, count);
    const humans = chosen.filter((s) => s.controller === 'human').length;
    el.append(
      h('div', { class: 'menu-card' },
        h('div', { class: 'menu-title' },
          icon({ kind: 'unit', type: 'caravel', role: 'none', nation: chosen.find((s) => s.controller === 'human')?.nation ?? 'england' }, 72),
          back ? h('button', { class: 'btn small back', onclick: back, 'aria-label': 'Back to the title screen' }, '←') : null,
          h('div', null, h('h1', null, 'Casual Colonization'), h('p', { class: 'muted' }, 'Alpha 0.2: a clone of the classic game of colonising the New World.'))),
        auto || manual
          ? h('div', { class: 'row wrap' },
              auto ? h('button', { class: 'btn primary', onclick: () => resume(auto) }, `Continue (${formatDate(auto.turn)})`) : null,
              manual ? h('button', { class: 'btn', onclick: () => resume(manual) }, `Load saved game (${formatDate(manual.turn)})`) : null)
          : null,
        h('h2', null, 'New game'),
        h('div', { class: 'row wrap' },
          plannedSelect('Scenario', 'Scenarios', ['The Americas, 1492–1850', 'Australia, 1788–1901', 'Vinland, around 1000'],
            'Each scenario brings its own map, peoples, goods, events and way to win.'),
          plannedSelect('Rivals', 'Scenarios', ['Alternative history (any nations)', 'Real rivals (as in history)']),
          plannedSelect('Victory', 'Beta', ['Independence by war', 'Federation by negotiation', 'Prosperity and cooperation', 'Survival'])),
        h('label', { class: 'field' },
          h('span', null, `European nations: ${count}`),
          h('input', { type: 'range', min: 1, max: 8, value: count, 'aria-label': 'Number of European nations', oninput: (e: Event) => { count = Number((e.target as HTMLInputElement).value); render(); } })),
        h('div', { class: 'slots-table' }, chosen.map((slot, i) => {
          const taken = new Set(chosen.filter((_, j) => j !== i).map((s) => s.nation));
          return h('div', { class: 'slot-row' },
            h('span', { class: 'flag', style: `background:${NATIONS[slot.nation].color}` }),
            h('select', { 'aria-label': `Nation ${i + 1}`, onchange: (e: Event) => { slot.nation = (e.target as HTMLSelectElement).value as NationId; render(); } },
              NATION_ORDER.filter((n) => !taken.has(n)).map((n) => h('option', { value: n, selected: n === slot.nation || undefined }, nationTitle(n)))),
            h('select', { 'aria-label': `Controller of nation ${i + 1}`, onchange: (e: Event) => { slot.controller = (e.target as HTMLSelectElement).value as Slot['controller']; render(); } },
              h('option', { value: 'human', selected: slot.controller === 'human' || undefined }, 'Player'),
              AI_LEVELS.map((level) => h('option', { value: level, selected: slot.controller === level || undefined, title: AI_LEVEL_INFO[level].description }, `Computer: ${AI_LEVEL_INFO[level].name}`))),
            h('span', { class: 'muted small bonus' }, slot.controller === 'human' ? NATIONS[slot.nation].bonus : `${AI_LEVEL_INFO[slot.controller].description} ${NATIONS[slot.nation].bonus}`));
        })),
        h('div', { class: 'row wrap' },
          plannedSelect('Difficulty', '0.3', ['Conquistador (today\'s rules)', 'Discoverer', 'Explorer', 'Governor', 'Viceroy'],
            'Prices, taxes, native tension, the size of the royal army and how hard the computer players push.'),
          plannedSelect('Players', 'Later', ['On this device (hot seat)', 'Online'])),
        humans > 1 ? h('p', { class: 'muted small' }, 'Several players take turns on this device (hot seat).') : null,
        humans === 0 ? h('p', { class: 'muted small' }, 'No players: you watch the computer nations play each other, with a live scoreboard.') : null,
        h('div', { class: 'row wrap' },
          h('label', { class: 'field' }, h('span', null, 'Map'),
            h('select', { onchange: (e: Event) => { map = (e.target as HTMLSelectElement).value; render(); } },
              h('option', { value: '', selected: !map || undefined }, 'Random (generated)'),
              STORED_MAPS.map((m) => h('option', { value: m.id, selected: m.id === map || undefined, title: m.description }, m.name)))),
          h('label', { class: 'field' }, h('span', null, 'Map size'),
            map
              ? h('select', { disabled: true, title: 'Stored maps have a fixed size.' }, h('option', null, storedMapSize(map)))
              : h('select', { onchange: (e: Event) => (mapSize = (e.target as HTMLSelectElement).value as MapSize) },
                  (Object.keys(MAP_SIZES) as MapSize[]).map((m) => h('option', { value: m, selected: m === mapSize || undefined }, `${m[0].toUpperCase()}${m.slice(1)} (${MAP_SIZES[m].width}×${MAP_SIZES[m].height})`)))),
          h('label', { class: 'field', title: 'Starts the random number generator for the whole game: the generated map, where native settlements, bonus resources and rumours go, and every roll during play. The same seed and the same choices give the same game.' },
            h('span', null, 'Game seed'),
            h('input', { type: 'number', value: seed, onchange: (e: Event) => (seed = Number((e.target as HTMLInputElement).value) || 0) })),
          h('label', { class: 'field' }, h('span', null, 'Graphics style'),
            h('select', { onchange: (e: Event) => { setStyle((e.target as HTMLSelectElement).value); render(); } },
              availableStyles().map((st) => h('option', { value: st.id, selected: st.id === activeStyle().id || undefined }, st.name))))),
        h('p', { class: 'muted small' }, activeStyle().description),
        h('details', { class: 'planned-options' },
          h('summary', null, 'Rules and options ', planned('coming')),
          h('p', { class: 'muted small' }, 'On the roadmap and not playable yet. Hover or tap for details.'),
          h('div', { class: 'planned-grid' }, PLANNED_OPTIONS.map((o) =>
            h('label', { class: 'planned-option', title: o.note },
              h('input', { type: 'checkbox', disabled: true }),
              h('span', null, h('b', null, o.label), ' ', planned(o.release), h('br'), h('span', { class: 'muted small' }, o.note)))))),
        humans > 0
          ? h('div', { class: 'row wrap' },
              h('label', { class: 'field' }, h('span', null, 'Start'),
                h('select', { 'aria-label': 'Start year', onchange: (e: Event) => { headYear = Number((e.target as HTMLSelectElement).value); render(); } },
                  h('option', { value: 0, selected: !headYear || undefined }, 'At the beginning (1492)'),
                  HEAD_START_YEARS.map((y) => h('option', { value: y, selected: headYear === y || undefined }, `Take over in ${y} (turn ${turnOfYear(y)})`)))),
              headYear
                ? h('label', { class: 'field' }, h('span', null, 'Until then'),
                    h('select', { 'aria-label': 'Head start display', onchange: (e: Event) => { watchHeadStart = (e.target as HTMLSelectElement).value === 'watch'; } },
                      h('option', { value: 'watch', selected: watchHeadStart || undefined }, 'Watch the speedrun'),
                      h('option', { value: 'skip', selected: !watchHeadStart || undefined }, 'Skip ahead (faster)')))
                : null)
          : null,
        humans > 0 && headYear
          ? h('p', { class: 'muted small' }, `The strongest computer player runs your nation until ${headYear}, then hands it to you. Everyone else plays at the levels chosen above.`)
          : null,
        h('div', { class: 'row wrap' },
          h('button', {
            class: 'btn primary big',
            onclick: () => start({
              seed,
              mapSize,
              ...(map ? { map } : {}),
              nations: chosen.map((s) => s.nation),
              humans: chosen.filter((s) => s.controller === 'human').map((s) => s.nation),
              ai: Object.fromEntries(chosen.flatMap((s) => (s.controller === 'human' ? [] : [[s.nation, s.controller]]))),
            }, humans > 0 && headYear ? { turn: turnOfYear(headYear), watch: watchHeadStart } : undefined),
          }, humans === 0 ? 'Watch the computers play' : 'Set sail'),
          h('button', {
            class: 'btn',
            onclick: async () => {
              const state = await pickSaveFile();
              if (state) resume(state);
              else toast('That file is not a Casual Colonization save.', 'error');
            },
          }, 'Load from file'))),
    );
  };
  render();
  host.appendChild(el);
  return el;
}
