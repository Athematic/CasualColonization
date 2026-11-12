import { independenceQuestion, leagueProposalFor, sideName, councilText, CouncilText, aBrave, peopleTradeBenefits, allianceOf, calendarOf, demandPenalty, demandText, describeCompany, eventChoices, eventTitle, FATHERS, formatDate, GOOD_DEFS, nationOf, nationTitle, nextFatherCost, pendingDemands, pendingEvents, REF_ON_REFUSAL, term, Term, peopleName, withTerms, type FatherId, type GameMessage, type Relation } from '@cc/engine';
import { icon } from '../styles.js';
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
  // A people's births (native-nations.md T10).
  /^A child has been born in /,
  /spoiled in .*warehouse/,
  /has built an? /,
  /has completed the/,
  /more tools to finish/,
  /custom house in .* sold goods/,
  /has been taught to be/,
  /has been repaired\./,
  // The scenario's terms ("Europe", "the New World", the council's name) are left out, so these match in every scenario.
  /has arrived in /,
  /^Religious unrest in /,
  /Clearing the forest brought/,
  /has used up all of their tools/,
  /convert has joined/,
  /as a gift\./,
  /has been founded\./,
  /has joined the .+ of /,
  /You decide in the turn-start briefing\.$/,
];

/**
 * The kind of a notable message the peoples' game brings (native-nations.md T12, T18, T10), for a
 * tag beside it in the briefing: an epidemic, an arrival from across the sea, a hard year or hunger.
 */
export function noticeKind(m: GameMessage): { id: string; label: string } | null {
  if (/^An epidemic has reached /.test(m.text)) return { id: 'epidemic', label: 'Epidemic' };
  if (/^Ships of .+ have reached /.test(m.text)) return { id: 'arrival', label: 'Arrival' };
  if (/^A hard year around /.test(m.text)) return { id: 'hard-year', label: 'Hard year' };
  if (/^Hunger in |is hungry for a second year|stores have run out/.test(m.text)) return { id: 'hunger', label: 'Hunger' };
  return null;
}

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
  // A War of Independence won while at war with a people (victory.ts, native-nations.md T14).
  const question = independenceQuestion(app.state, me.id);
  if (question) {
    list.push({
      id: 'independence',
      required: true,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, question),
          h('div', { class: 'decision-actions' },
            h('button', {
              class: 'btn primary',
              onclick: () => {
                if (!app.dispatch({ type: 'answerIndependence', keepPlaying: false }, true)) return;
                done('The victory stands.');
                void app.showGameOver();
              },
            }, 'End with the victory'),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerIndependence', keepPlaying: true }, true) && done('You keep playing: peace or war is yours to choose.') }, 'Keep playing'))),
    });
  }
  const tax = me.pendingTax;
  if (tax) {
    const good = GOOD_DEFS[tax.good].name.toLowerCase();
    list.push({
      id: 'tax',
      required: true,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `${Term(app.state, 'majesty')} raises the tax rate from ${me.tax}% to ${tax.rate}%. If you refuse, colonists will dump their ${good} in protest and ${good} will be boycotted in ${term(app.state, 'homeland')} until you pay the arrears.`),
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
          h('p', null, `${Term(app.state, 'majesty')} demands ${demand.gold.toLocaleString()} gold from your treasury (${me.gold.toLocaleString()} gold). If you refuse, ${colony ? `royal officials will seize the goods in ${colony.name}'s warehouse (all but food) and ` : ''}${term(app.state, 'king')} will send ${REF_ON_REFUSAL} more regulars to the ${term(app.state, 'ref')}.`),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', disabled: short, title: short ? 'The treasury cannot pay this much.' : undefined, onclick: () => app.dispatch({ type: 'answerDemand', pay: true }, true) && done(`Paid ${demand.gold.toLocaleString()} gold to ${term(app.state, 'king')}.`) }, `Pay ${demand.gold.toLocaleString()} gold`),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerDemand', pay: false }, true) && done(colony ? `Refused: the goods in ${colony.name} were seized.` : 'Refused.') }, 'Refuse'))),
    });
  }
  // A mercenary company offers its services during the War of Independence (rebellion.ts).
  const company = me.mercenaryOffer;
  if (company) {
    const short = me.gold < company.price;
    list.push({
      id: 'mercenaries',
      required: true,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `A company of ${company.name} mercenaries offers to fight for independence: ${describeCompany(company)}, for ${company.price.toLocaleString()} gold (your treasury: ${me.gold.toLocaleString()} gold). They would join the garrison of your weakest coastal colony. If you turn them away, they take service elsewhere.`),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', disabled: short, title: short ? 'The treasury cannot pay this much.' : undefined, onclick: () => app.dispatch({ type: 'answerMercenaries', hire: true }, true) && done(`Hired the ${company.name} mercenaries for ${company.price.toLocaleString()} gold.`) }, `Hire for ${company.price.toLocaleString()} gold`),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerMercenaries', hire: false }, true) && done('Turned the mercenaries away.') }, 'Turn them away'))),
    });
  }
  // Native braves at the colonies: demands for tribute (to answer now) and goods for sale.
  for (const d of pendingDemands(app.state, me.id)) {
    const st = app.state.settlements[d.settlementId];
    const colony = app.state.colonies[d.colonyId];
    if (!st || !colony) continue;
    const tribe = peopleName(app.state, st.tribe);
    const what = demandText(d);
    if (d.kind === 'treaty') {
      // A people's own offer of a treaty (native-partners.md N8, N13).
      list.push({
        id: `native-${d.id}`,
        title: `The ${tribe} offer a trade treaty`,
        required: false,
        render: (done) =>
          h('div', { class: 'decision-body' },
            h('p', null, `${aBrave(tribe)} at ${colony.name} brings an offer from the ${tribe}: a trade treaty. With it, ${peopleTradeBenefits(app.state)}. Taking their land, attacking them or paying them to make war would break faith.`),
            h('div', { class: 'decision-actions' },
              h('button', { class: 'btn primary', onclick: () => app.dispatch({ type: 'answerNativeDemand', demandId: d.id, accept: true }, true) && done(`Made a trade treaty with the ${tribe}.`) }, 'Accept the treaty'),
              h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerNativeDemand', demandId: d.id, accept: false }, true) && done('Declined.') }, 'Decline'))),
      });
    } else if (d.kind === 'demand') {
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
  // Historical and random events that ask for a choice (events/ in the engine).
  for (const ev of pendingEvents(app.state, me.id)) {
    const choices = eventChoices(app.state, ev);
    list.push({
      id: `event-${ev.id}`,
      title: eventTitle(app.state, ev),
      required: true,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, ev.text),
          h('div', { class: 'decision-actions' },
            choices.map((c, i) =>
              h('button', {
                class: i === 0 ? 'btn primary' : 'btn',
                disabled: !c.available,
                title: c.available ? undefined : 'The treasury cannot pay for this.',
                onclick: () => {
                  if (!app.dispatch({ type: 'answerEvent', eventId: ev.id, choice: i }, true)) return;
                  // The outcome is the newest message to this nation.
                  const said = [...app.state.messages].reverse().find((m) => m.to === me.id)?.text ?? `${c.label}.`;
                  const title = `${eventTitle(app.state, ev)}: `;
                  done(said.startsWith(title) ? said.slice(title.length) : said);
                },
              }, c.label)))),
    });
  }
  // Proposals from other nations: a trade agreement or Favoured Nation status.
  for (const rel of Object.values(app.state.relations ?? {}) as Relation[]) {
    const p = rel.proposal;
    if (!p || p.from === me.id || (rel.a !== me.id && rel.b !== me.id)) continue;
    const from = p.from;
    const name = nationOf(app.state, from).name;
    const text = p.kind === 'trade'
      ? `${nationTitle(app.state, from)} proposes a trade agreement. Your trade routes may then call at each other's colonies: goods unloaded there are sold to the colony at its owner's home-market prices, and its surplus can be bought.`
      : p.kind === 'confederation'
      ? `${nationTitle(app.state, from)} proposes that you declare independence together, now. Both of you break with ${term(app.state, 'homeland')}, and each Crown sends its ${term(app.state, 'ref')}; the war is fought and won, or lost, together.`
      : p.kind === 'expedition'
      ? `${nationTitle(app.state, from)} proposes a joint expedition: each of you pays half, and the gold its seasoned scout finds in ruins and lost cities is shared.`
      : p.kind === 'alliance'
      ? `${nationTitle(app.state, from)} proposes ${allianceOf(app.state, from) ? 'that you join its alliance' : 'an alliance'}. An attack on one ally is war with all of them; allied units may enter, garrison and trade in each other's colonies; and allies share what they see. Leaving later costs more than cancelling Favoured Nation.`
      : `${nationTitle(app.state, from)} proposes Favoured Nation status. Your ships may then trade, and buy merchant ships, in each other's home ports, and computer players never declare war on a Favoured Nation. Either side can cancel later, but goods near the other side's colonies are then seized and the trade routes between you end.`;
    list.push({
      id: `proposal-${from}`,
      title: p.kind === 'trade' ? `A trade agreement with ${name}` : p.kind === 'alliance' ? `An alliance with ${name}` : p.kind === 'expedition' ? `A joint expedition with ${name}` : p.kind === 'confederation' ? `Independence together with ${name}` : `Favoured Nation status with ${name}`,
      required: false,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, text, ' You can also answer later in Foreign Affairs.'),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', onclick: () => app.dispatch({ type: 'answerProposal', nation: from, accept: true }, true) && done(p.kind === 'trade' ? `Agreed: you now trade with ${name}.` : p.kind === 'alliance' ? `Agreed: ${name} is now your ally.` : p.kind === 'expedition' ? `Agreed: the expedition sets out.` : p.kind === 'confederation' ? `Agreed: independence is declared.` : `Agreed: ${name} is now a Favoured Nation.`) }, 'Accept'),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerProposal', nation: from, accept: false }, true) && done('Turned down.') }, 'Turn down'))),
    });
  }
  // A league of peoples proposed to a playing people (peopleleague.ts, native-nations.md T14).
  const league = leagueProposalFor(app.state, me.id);
  if (league) {
    const by = sideName(app.state, league.by).replace(/^the /, 'The ');
    const others = [league.by, ...league.peoples].filter((id) => id !== me.id).map((id) => sideName(app.state, id)).join(', ');
    list.push({
      id: 'league',
      title: 'A league of peoples',
      required: false,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `${by} propose ${league.league ? 'that you join their league' : `a league with ${others}`}: its peoples keep the peace among themselves and settle their common affairs together. You can also answer later in Foreign Affairs.`),
          h('div', { class: 'decision-actions' },
            h('button', { class: 'btn primary', onclick: () => app.dispatch({ type: 'answerLeague', by: league.by, accept: true }, true) && done('Agreed.') }, 'Accept'),
            h('button', { class: 'btn', onclick: () => app.dispatch({ type: 'answerLeague', by: league.by, accept: false }, true) && done('Turned down.') }, 'Turn down'))),
    });
  }
  const offer = Object.values(me.fatherOffer) as FatherId[];
  // The Congress's bells are liberty bells; a people's council names its own product (counsel).
  const productWords = (id: typeof me.id) => (councilText(app.state, id, 'product') === 'bells' ? 'liberty bells' : councilText(app.state, id, 'product'));
  if (offer.length && (opts.father || (!me.currentFather && (me.fatherBells > 0 || me.fathers.length > 0)))) {
    list.push({
      id: 'father',
      required: false,
      render: (done) =>
        h('div', { class: 'decision-body' },
          h('p', null, `Choose the next ${councilText(app.state, me.id, 'member')} to join ${councilText(app.state, me.id, 'councilShort')}. ${me.fatherBells}/${nextFatherCost(app.state, me)} ${productWords(me.id)} collected.${me.currentFather ? ` ${councilText(app.state, me.id, 'councilShort')} currently works towards ${FATHERS[me.currentFather].name}.` : ''} You can also decide later.`),
          h('div', { class: 'decision-actions father-choices' },
            offer.map((id) =>
              h('button', {
                class: id === me.currentFather ? 'btn father primary' : 'btn father',
                onclick: () => app.dispatch({ type: 'chooseFather', father: id }, true) && done(`${CouncilText(app.state, me.id, 'councilShort')} will work towards ${FATHERS[id].name}.`),
              },
              icon({ kind: 'father', id, category: FATHERS[id].category, variant: 'figure' }, 160, FATHERS[id].name),
              h('span', { class: 'father-text' },
                h('span', { class: 'father-name' }, FATHERS[id].name, h('span', { class: 'muted small' }, ` · ${FATHERS[id].category}`)),
                h('span', { class: 'father-effect' }, FATHERS[id].effect)))))),
    });
  }
  return list;
}

/** Decision headings; `{…}` are the scenario's terms. */
const TITLES: Record<string, string> = { independence: 'The {independenceWar} is won', tax: '{Crown} raises taxes', demand: '{King} demands gold', mercenaries: 'Mercenaries offer their services', father: '{council}' };

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
      h('h2', { id: 'turn-modal-title' }, opts.heading ?? `${formatDate(app.state.turn, calendarOf(app.state))}: ${nationTitle(app.state, app.viewer)}`),
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
                h('h4', null, d.title ?? (TITLES[d.id] ? withTerms(app.state, TITLES[d.id]) : d.id), d.required && !d.answered ? h('span', { class: 'pill bad' }, 'Answer needed') : null),
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
            h('ul', { class: 'notices' }, news.notable.map((m) => {
              const kind = noticeKind(m);
              return h('li', { 'data-kind': kind?.id }, kind ? h('span', { class: `pill notice-${kind.id}` }, kind.label) : null, kind ? ' ' : null, m.text, m.at
                ? h('button', { class: 'btn tiny', title: 'Show on the map', onclick: () => { app.centerOn(m.at!.x, m.at!.y); close(); } }, 'Show')
                : null);
            }))));
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
