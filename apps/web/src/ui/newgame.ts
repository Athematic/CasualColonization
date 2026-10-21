import { MAP_SIZES, NATION_ORDER, NATIONS, STORED_MAPS, formatDate, nationTitle, type GameConfig, type GameState, type MapSize, type NationId } from '@cc/engine';
import { clear, h } from '../dom.js';
import { loadAuto, loadManual, pickSaveFile } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';

interface Slot {
  nation: NationId;
  human: boolean;
}

export function newGameScreen(host: HTMLElement, start: (config: GameConfig) => void, resume: (state: GameState) => void): HTMLElement {
  let count = 4;
  const slots: Slot[] = NATION_ORDER.map((nation, i) => ({ nation, human: i === 0 }));
  let mapSize: MapSize = 'medium';
  /** Stored map id; empty for a generated map. */
  let map = '';
  let seed = Math.floor(Math.random() * 1e9);

  const el = h('main', { class: 'menu-screen' });
  const render = () => {
    clear(el);
    const auto = loadAuto();
    const manual = loadManual();
    const chosen = slots.slice(0, count);
    const humans = chosen.filter((s) => s.human).length;
    el.append(
      h('div', { class: 'menu-card' },
        h('div', { class: 'menu-title' },
          icon({ kind: 'unit', type: 'caravel', role: 'none', nation: chosen.find((s) => s.human)?.nation ?? 'england' }, 72),
          h('div', null, h('h1', null, 'Casual Colonization'), h('p', { class: 'muted' }, 'Alpha 0.2: a clone of the classic game of colonising the New World.'))),
        auto || manual
          ? h('div', { class: 'row wrap' },
              auto ? h('button', { class: 'btn primary', onclick: () => resume(auto) }, `Continue (${formatDate(auto.turn)})`) : null,
              manual ? h('button', { class: 'btn', onclick: () => resume(manual) }, `Load saved game (${formatDate(manual.turn)})`) : null)
          : null,
        h('h2', null, 'New game'),
        h('label', { class: 'field' },
          h('span', null, `European nations: ${count}`),
          h('input', { type: 'range', min: 1, max: 8, value: count, 'aria-label': 'Number of European nations', oninput: (e: Event) => { count = Number((e.target as HTMLInputElement).value); render(); } })),
        h('div', { class: 'slots-table' }, chosen.map((slot, i) => {
          const taken = new Set(chosen.filter((_, j) => j !== i).map((s) => s.nation));
          return h('div', { class: 'slot-row' },
            h('span', { class: 'flag', style: `background:${NATIONS[slot.nation].color}` }),
            h('select', { 'aria-label': `Nation ${i + 1}`, onchange: (e: Event) => { slot.nation = (e.target as HTMLSelectElement).value as NationId; render(); } },
              NATION_ORDER.filter((n) => !taken.has(n)).map((n) => h('option', { value: n, selected: n === slot.nation || undefined }, nationTitle(n)))),
            h('select', { 'aria-label': `Controller of nation ${i + 1}`, onchange: (e: Event) => { slot.human = (e.target as HTMLSelectElement).value === 'human'; render(); } },
              h('option', { value: 'human', selected: slot.human || undefined }, 'Player'),
              h('option', { value: 'ai', selected: !slot.human || undefined }, 'Computer')),
            h('span', { class: 'muted small bonus' }, NATIONS[slot.nation].bonus));
        })),
        humans > 1 ? h('p', { class: 'muted small' }, 'Several players take turns on this device (hot seat).') : null,
        h('div', { class: 'row wrap' },
          h('label', { class: 'field' }, h('span', null, 'Map'),
            h('select', { onchange: (e: Event) => { map = (e.target as HTMLSelectElement).value; render(); } },
              h('option', { value: '', selected: !map || undefined }, 'Random (generated)'),
              STORED_MAPS.map((m) => h('option', { value: m.id, selected: m.id === map || undefined, title: m.description }, m.name)))),
          h('label', { class: 'field' }, h('span', null, 'Map size'),
            h('select', { disabled: !!map || undefined, title: map ? 'Stored maps have a fixed size.' : undefined, onchange: (e: Event) => (mapSize = (e.target as HTMLSelectElement).value as MapSize) },
              (Object.keys(MAP_SIZES) as MapSize[]).map((m) => h('option', { value: m, selected: m === mapSize || undefined }, `${m[0].toUpperCase()}${m.slice(1)} (${MAP_SIZES[m].width}×${MAP_SIZES[m].height})`)))),
          h('label', { class: 'field' }, h('span', null, 'Map seed'),
            h('input', { type: 'number', value: seed, onchange: (e: Event) => (seed = Number((e.target as HTMLInputElement).value) || 0) })),
          h('label', { class: 'field' }, h('span', null, 'Graphics style'),
            h('select', { onchange: (e: Event) => { setStyle((e.target as HTMLSelectElement).value); render(); } },
              availableStyles().map((st) => h('option', { value: st.id, selected: st.id === activeStyle().id || undefined }, st.name))))),
        h('p', { class: 'muted small' }, activeStyle().description),
        h('div', { class: 'row wrap' },
          h('button', {
            class: 'btn primary big',
            disabled: humans === 0,
            onclick: () => start({ seed, mapSize, ...(map ? { map } : {}), nations: chosen.map((s) => s.nation), humans: chosen.filter((s) => s.human).map((s) => s.nation) }),
          }, humans === 0 ? 'Choose at least one player' : 'Set sail'),
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
