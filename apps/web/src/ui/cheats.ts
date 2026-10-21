import { CHEAT_IDS, CHEATS, formatDate, mapRevealed, nationTitle, yieldMultiplier, type CheatId, type NationId } from '@cc/engine';
import type { App } from '../app.js';
import { clear, h } from '../dom.js';
import { confirmDialog, layer, toast } from './dialogs.js';

/** Opens the Cheats dialog. The first use in a game asks for confirmation, since it marks the game as cheated. */
export async function openCheats(app: App): Promise<void> {
  if (document.querySelector('.cheats-dialog')) return;
  if (!app.state.cheated) {
    const ok = await confirmDialog('Use cheats?', 'Using cheats marks this game as cheated. The mark is permanent and shows on the score screen.', 'Open cheats', 'Cancel');
    if (!ok) return;
  }
  const s = () => app.state;
  const nations = s().players.filter((p) => p.id !== 'crown').map((p) => p.id);
  let target: NationId = nations.includes(app.viewer) ? app.viewer : nations[0];

  const select = h('select', { 'aria-label': 'Nation the cheat acts on', onchange: (e: Event) => { target = (e.target as HTMLSelectElement).value as NationId; render(); } },
    nations.map((n) => h('option', { value: n, selected: n === target || undefined }, `${nationTitle(n)}${s().players.find((p) => p.id === n)?.human ? '' : ' (computer)'}`)));
  const list = h('div', { class: 'dialog-actions' });
  const status = h('p', { class: 'muted small' });

  const isOn = (id: CheatId): boolean => (id === 'doubleYields' ? yieldMultiplier(s()) !== 1 : id === 'reveal' ? mapRevealed(s(), target) : false);

  const run = (id: CheatId) => {
    const def = CHEATS[id];
    const result = app.game.dispatch({ type: 'cheat', cheat: id, ...(def.perNation ? { nation: target } : {}) });
    if (!result.ok) toast(result.error, 'error');
    else if (result.text) toast(result.text);
    app.requestRender();
    render();
  };

  function render(): void {
    clear(list);
    for (const id of CHEAT_IDS) {
      const def = CHEATS[id];
      const label = def.toggle ? `${def.name}: ${isOn(id) ? 'on' : 'off'}` : def.name;
      list.append(h('button', { class: 'btn', title: def.note, onclick: () => run(id) }, label, def.perNation ? h('span', { class: 'muted small' }, ` (${nationTitle(target)})`) : null));
    }
    list.append(h('button', { class: 'btn primary', onclick: close }, 'Close'));
    const c = s().cheated;
    status.textContent = c ? `Cheats used since ${formatDate(c.turn)}: ${c.cheats.map((id) => CHEATS[id].name.toLowerCase()).join(', ')}.` : '';
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  function close(): void {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    app.canvas.focus();
  }

  const box = h('div', { class: 'dialog cheats-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Cheats' },
    h('h2', null, 'Cheats'),
    h('p', { class: 'small' }, 'For testing the computer players. Peace is made between European nations only; native tribes keep their mood.'),
    h('label', { class: 'field' }, h('span', null, 'Nation'), select),
    list,
    status);
  const backdrop = h('div', { class: 'backdrop', onclick: (e: Event) => e.target === backdrop && close() }, box);
  render();
  layer().appendChild(backdrop);
  document.addEventListener('keydown', onKey, true);
  select.focus();
}
