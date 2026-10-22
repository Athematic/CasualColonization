import { aBrave, demandPenalty, demandText, FATHERS, formatDate, GOOD_DEFS, NATIONS, nationTitle, nextFatherCost, pendingDemands, REF_ON_REFUSAL, TRIBES, type FatherId, type GameMessage, type Relation } from '@cc/engine';
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
  /has arrived in (Europe|the New World)\b/,
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
  /** Heading; missing means TITLES[id]. */
  title?: string;
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
  const demand = me.pendingDemand;
  if (demand) {
    const { colony } = demandPenalty(app.state, me.id);
    const short = me.gold < demand.gold;
    list.push({
      id: 'demand',
      required: true,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `His Majesty demands ${demand.gold.toLocaleString()} gold from your treasury (${me.gold.toLocaleString()} gold). If you refuse, ${colony ? `royal officials will seize the goods in ${colony.name}'s warehouse (all but food) and ` : ''}the King will send ${REF_ON_REFUSAL} more regulars to the Royal Expeditionary Force.`),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', disabled: short, title: short ? 'The treasury cannot pay this much.' : undefined, onclick: () => app.dispatch({ type: 'answerDemand', pay: true }, true) && done(`Paid ${demand.gold.toLocaleString()} gold to the King.`) }, `Pay ${demand.gold.toLocaleString()} gold`),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerDemand', pay: false }, true) && done(colony ? `Refused: the goods in ${colony.name} were seized.` : 'Refused.') }, 'Refuse'))),
    });
  }
  // Native braves at the colonies: demands for tribute (to answer now) and goods for sale.
  for (const d of pendingDemands(app.state, me.id)) {
    const st = app.state.settlements[d.settlementId];
    const colony = app.state.colonies[d.colonyId];
    if (!st || !colony) continue;
    const tribe = TRIBES[st.tribe].name;
    const what = demandText(d);
    if (d.kind === 'demand') {
      list.push({
        id: `native-${d.id}`,
        title: `The ${tribe} demand tribute at ${colony.name}`,
        required: true,
        render: (done) =>
          h('div', { class: 'decision-body' },
            h('p', null, `${aBrave(tribe)} stands outside ${colony.name} and demands ${what}. If you refuse, the ${tribe} grow angrier and the brave attacks the colony.`),
            h('div', { class: 'decision-actions' },
              h('button', { class: 'btn primary', onclick: () => app.dispatch({ type: 'answerNativeDemand', demandId: d.id, accept: true }, true) && done(`Paid ${what}.`) }, `Pay ${what}`),
              h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerNativeDemand', demandId: d.id, accept: false }, true) && done('Refused: the brave attacks.') }, 'Refuse'))),
      });
    } else {
      list.push({
        id: `native-${d.id}`,
        title: `The ${tribe} offer goods at ${colony.name}`,
        required: false,
        render: (done) =>
          h('div', { class: 'decision-body' },
            h('p', null, `${aBrave(tribe)} at ${colony.name} offers ${what} for ${d.price} gold. You have ${me.gold} gold.`),
            h('div', { class: 'decision-actions' },
              h('button', { class: 'btn primary', disabled: me.gold < (d.price ?? 0), onclick: () => app.dispatch({ type: 'answerNativeDemand', demandId: d.id, accept: true }, true) && done(`Bought ${what}.`) }, `Buy for ${d.price} gold`),
              h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerNativeDemand', demandId: d.id, accept: false }, true) && done('Declined.') }, 'Decline'))),
      });
    }
  }
  // Proposals from other nations: a trade agreement or Favoured Nation status.
  for (const rel of Object.values(app.state.relations ?? {}) as Relation[]) {
    const p = rel.proposal;
    if (!p || p.from === me.id || (rel.a !== me.id && rel.b !== me.id)) continue;
    const from = p.from;
    const name = NATIONS[from].name;
    const text = p.kind === 'trade'
      ? `${nationTitle(from)} proposes a trade agreement. Your trade routes may then call at each other's colonies: goods unloaded there are sold to the colony at its owner's home-market prices, and its surplus can be bought.`
      : `${nationTitle(from)} proposes Favoured Nation status. Your ships may then trade, and buy merchant ships, in each other's home ports, and computer players never declare war on a Favoured Nation. Either side can cancel later, but goods near the other side's colonies are then seized and the trade routes between you end.`;
    list.push({
      id: `proposal-${from}`,
      title: p.kind === 'trade' ? `A trade agreement with ${name}` : `Favoured Nation status with ${name}`,
      required: false,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, text, ' You can also answer later in Foreign Affairs.'),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', onclick: () => app.dispatch({ type: 'answerProposal', nation: from, accept: true }, true) && done(p.kind === 'trade' ? `Agreed: you now trade with ${name}.` : `Agreed: ${name} is now a Favoured Nation.`) }, 'Accept'),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerProposal', nation: from, accept: false }, true) && done('Turned down.') }, 'Turn down'))),
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

const TITLES: Record<string, string> = { tax: 'The Crown raises taxes', demand: 'The King demands gold', father: 'Continental Congress' };

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
                h('h4', null, d.title ?? TITLES[d.id] ?? d.id, d.required && !d.answered ? h('span', { class: 'pill bad' }, 'Answer needed') : null),
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
      goOn.title = blocked() ? 'Answer the decisions marked first' : 'Continue (Enter)';
    };

    draw();
    layer.appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    focusNext();
  });
}
