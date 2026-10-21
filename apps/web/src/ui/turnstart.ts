import { FATHERS, formatDate, GOOD_DEFS, nationTitle, nextFatherCost, type FatherId, type GameMessage } from '@cc/engine';
import type { App } from '../app.js';
import { clear, h } from '../dom.js';

/**
 * The turn-start briefing: one centred modal listing every decision the player has to make,
 * then the turn's notable news, with routine reports folded away.
 */

/** Everyday colony and fleet bookkeeping; anything else counts as news. */
const ROUTINE = [
  / begins\.$/,
  /has been born in/,
  /spoiled in .*warehouse/,
  /has built an? /,
  /has completed the/,
  /more tools to finish/,
  /custom house in .* sold goods/,
  /has been taught to be/,
  /has been repaired\./,
  /has arrived in (Europe|the New World)\./,
  /Religious unrest in Europe/,
  /Clearing the forest brought/,
  /has used up all of their tools/,
  /convert has joined/,
  /as a gift\./,
  /has been founded\./,
  /has joined the Continental Congress of/,
];

export function isRoutine(m: GameMessage): boolean {
  return ROUTINE.some((re) => re.test(m.text));
}

export interface TurnNews {
  notable: GameMessage[];
  routine: GameMessage[];
}

export function sortNews(messages: GameMessage[]): TurnNews {
  const notable: GameMessage[] = [];
  const routine: GameMessage[] = [];
  for (const m of messages) (isRoutine(m) ? routine : notable).push(m);
  return { notable, routine };
}

interface Decision {
  id: string;
  /** Must be answered before the turn can go on. */
  required: boolean;
  answered?: string;
  render(done: (summary: string) => void): HTMLElement;
}

/** Decisions the rules are waiting on, most pressing first. */
function decisions(app: App, opts: { father: boolean }): Decision[] {
  const me = app.me;
  const list: Decision[] = [];
  const tax = me.pendingTax;
  if (tax) {
    const good = GOOD_DEFS[tax.good].name.toLowerCase();
    list.push({
      id: 'tax',
      required: true,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `His Majesty raises the tax rate from ${me.tax}% to ${tax.rate}%. If you refuse, colonists will dump their ${good} in protest and ${good} will be boycotted in Europe until you pay the arrears.`),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', onclick: () => app.dispatch({ type: 'answerTax', accept: true }) && done(`Accepted: the tax is now ${tax.rate}%.`) }, `Accept ${tax.rate}% tax`),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerTax', accept: false }) && done(`Refused: ${good} is boycotted.`) }, `Refuse and hold a ${good} party`))),
    });
  }
  const offer = Object.values(me.fatherOffer) as FatherId[];
  if (offer.length && (opts.father || (!me.currentFather && (me.fatherBells > 0 || me.fathers.length > 0)))) {
    list.push({
      id: 'father',
      required: false,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `Choose the next Founding Father to join Congress. ${me.fatherBells}/${nextFatherCost(app.state, me)} liberty bells collected.${me.currentFather ? ` Congress currently works towards ${FATHERS[me.currentFather].name}.` : ''} You can also decide later.`),
          h('div', { class: 'decision-actions father-choices' },
            offer.map((id) =>
              h('button', {
                class: id === me.currentFather ? 'btn father primary' : 'btn father',
                onclick: () => app.dispatch({ type: 'chooseFather', father: id }, true) && done(`Congress will work towards ${FATHERS[id].name}.`),
              },
              h('span', { class: 'father-name' }, FATHERS[id].name, h('span', { class: 'muted small' }, ` · ${FATHERS[id].category}`)),
              h('span', { class: 'father-effect' }, FATHERS[id].effect))))),
    });
  }
  return list;
}

const TITLES: Record<string, string> = { tax: 'The Crown raises taxes', father: 'Continental Congress' };

let open = false;

/** Whether the turn-start modal is showing. */
export function turnModalOpen(): boolean {
  return open;
}

/**
 * Shows the briefing if anything needs the player's attention; resolves when it is closed.
 * Returns at once (no modal) when there is no decision and no notable news.
 */
export function showTurnStart(app: App, news: TurnNews, opts: { father?: boolean; heading?: string } = {}): Promise<void> {
  const todo = decisions(app, { father: !!opts.father });
  if (open || (!todo.length && !news.notable.length)) return Promise.resolve();
  open = true;
  return new Promise((resolve) => {
    let layer = document.getElementById('dialog-layer');
    if (!layer) {
      layer = h('div', { id: 'dialog-layer' });
      document.body.appendChild(layer);
    }
    const blocked = () => todo.some((d) => d.required && !d.answered);
    const close = () => {
      if (blocked()) return;
      open = false;
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      app.requestRender();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!backdrop.isConnected) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        // Keep focus inside the modal.
        const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), summary')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!box.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const body = h('div', { class: 'turn-body' });
    const goOn = h('button', { class: 'btn primary', onclick: close }, 'Continue');
    const box = h('div', { class: 'dialog turn-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'turn-modal-title' },
      h('h2', { id: 'turn-modal-title' }, opts.heading ?? `${formatDate(app.state.turn)}: ${nationTitle(app.viewer)}`),
      body,
      h('div', { class: 'turn-footer' }, goOn));
    const backdrop = h('div', { class: 'backdrop turn-backdrop' }, box);

    const focusNext = () => {
      const target = box.querySelector<HTMLElement>('.decision:not(.answered) .btn.primary, .decision:not(.answered) .btn') ?? goOn;
      target.focus();
    };

    const draw = () => {
      clear(body);
      if (todo.length) {
        body.append(
          h('section', { class: 'turn-section', 'aria-label': 'Decisions' },
            h('h3', null, todo.length > 1 ? 'Decisions' : 'Decision'),
            todo.map((d) =>
              h('div', { class: `decision${d.answered ? ' answered' : ''}${d.required ? ' required' : ''}` },
                h('h4', null, TITLES[d.id] ?? d.id, d.required && !d.answered ? h('span', { class: 'pill bad' }, 'Answer needed') : null),
                d.answered
                  ? h('p', { class: 'answer' }, '✓ ', d.answered)
                  : d.render((summary) => {
                      d.answered = summary;
                      draw();
                      focusNext();
                    })))));
      }
      if (news.notable.length) {
        body.append(
          h('section', { class: 'turn-section', 'aria-label': 'News' },
            h('h3', null, 'This turn'),
            h('ul', { class: 'notices' }, news.notable.map((m) =>
              h('li', null, m.text, m.at
                ? h('button', { class: 'btn tiny', title: 'Show on the map', onclick: () => { app.centerOn(m.at!.x, m.at!.y); close(); } }, 'Show')
                : null)))));
      }
      if (news.routine.length) {
        body.append(
          h('details', { class: 'turn-section reports' },
            h('summary', null, `Reports (${news.routine.length})`),
            h('ul', null, news.routine.map((m) => h('li', null, m.text)))));
      }
      goOn.disabled = blocked();
      goOn.title = blocked() ? 'Answer the Crown first' : 'Continue (Enter)';
    };

    draw();
    layer.appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    focusNext();
  });
}
