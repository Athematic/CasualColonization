import { calendarOf, congressOverview, FATHERS, formatDate, nationOf, scenarioOf, term, Term, type FatherId, type NationId } from '@cc/engine';
import { CONGRESS_HALL_ASPECT, hallPaintOrder, hallSpotBox, layoutCongressHall } from '@cc/render-api';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { activeStyle, drawHallBackdrop, icon } from '../styles.js';

/**
 * The Continental Congress hall: the nation's Founding Fathers standing together in a great hall, in the order they
 * joined (front row first, then the raised rows behind), with an empty seat for the father being sought. The hall is
 * a 3:2 picture at least HALL_MIN_WIDTH wide, which scrolls sideways inside its frame on a phone.
 */

const HALL_MIN_WIDTH = 720;

export class CongressScreen implements Screen {
  el: HTMLElement;
  private frame: HTMLElement;
  private stage: HTMLElement;
  private head: HTMLElement;
  private caption: HTMLElement;
  private tip: HTMLElement;
  private selected: FatherId | null = null;
  private drawnKey = '';
  private width = 0;
  private ro: ResizeObserver;

  constructor(private app: App) {
    this.stage = h('div', { class: 'hall-stage' });
    this.frame = h('div', { class: 'hall-frame', tabindex: 0, role: 'group', 'aria-label': `${Term(app.state, 'council')} hall` }, this.stage);
    this.head = h('div', null);
    this.caption = h('div', { class: 'hall-caption' });
    this.tip = h('div', { class: 'hall-tip', role: 'status', hidden: true });
    this.el = h('section', { class: 'screen congress-screen', role: 'dialog', 'aria-label': `${Term(app.state, 'council')}` }, this.head, this.frame, this.caption);
    this.ro = new ResizeObserver(() => {
      const w = Math.max(HALL_MIN_WIDTH, Math.floor(this.frame.clientWidth));
      if (this.frame.clientWidth && w !== this.width) {
        this.width = w;
        this.build();
      }
    });
    this.ro.observe(this.frame);
  }

  close(): void {
    this.ro.disconnect();
  }

  private nation(): NationId {
    const app = this.app;
    if (!app.observer) return app.viewer;
    if (app.watch !== 'all') return app.watch;
    return app.state.players.find((p) => p.id !== 'crown')!.id;
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() === 'k' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.app.closeScreen();
      return true;
    }
    return false;
  }

  refresh(): void {
    const s = this.app.state;
    const p = s.players.find((q) => q.id === this.nation())!;
    const key = `${this.width}|${s.turn}|${p.fathers.length}|${p.currentFather ?? ''}|${p.fatherBells}|${this.nation()}|${activeStyle().id}`;
    if (key === this.drawnKey) return;
    this.build();
  }

  private build(): void {
    const app = this.app;
    const nation = this.nation();
    const c = congressOverview(app.state, nation);
    const W = this.width || HALL_MIN_WIDTH;
    const H = Math.round(W / CONGRESS_HALL_ASPECT);
    const p = app.state.players.find((q) => q.id === nation)!;
    this.drawnKey = `${this.width}|${app.state.turn}|${c.fathers.length}|${c.current ?? ''}|${c.fatherBells}|${nation}|${activeStyle().id}`;

    // The stage: the backdrop, then the figures from the back row to the front.
    clear(this.stage);
    this.stage.style.width = `${W}px`;
    this.stage.style.height = `${H}px`;
    const canvas = h('canvas', { class: 'hall-bg', 'aria-hidden': 'true' });
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    drawHallBackdrop(canvas, W, H, scenarioOf(app.state).art?.councilHall);
    this.stage.append(canvas);

    const seeking = c.fathers.length < 25;
    const spots = layoutCongressHall(c.fathers.length + (seeking ? 1 : 0));
    for (const spot of hallPaintOrder(spots)) {
      const box = hallSpotBox(spot, W, H);
      const z = String(Math.round(spot.feetY * 100));
      const hitX = box.x + box.w * 0.25;
      const hit = `left:${hitX}px;top:${box.y}px;width:${box.w * 0.5}px;height:${box.h}px;z-index:${z}`;
      const imgStyle = `left:${-box.w * 0.25}px`;
      if (spot.index < c.fathers.length) {
        const id = c.fathers[spot.index]!;
        const def = FATHERS[id];
        const img = icon({ kind: 'father', id, category: def.category, variant: 'figure' }, Math.round(box.h), def.name);
        img.style.cssText = imgStyle;
        const b = h('button', {
          class: `hall-father${this.selected === id ? ' selected' : ''}`,
          style: hit,
          'aria-label': `${def.name}, ${def.category}`,
          onmouseenter: () => this.show(id, b),
          onfocus: () => this.show(id, b),
          onmouseleave: () => this.hide(id),
          onblur: () => this.hide(id),
          onclick: () => (this.selected === id ? this.hide(id, true) : this.show(id, b, true)),
        }, img);
        this.stage.append(b);
      } else {
        const cur = c.current ? FATHERS[c.current] : null;
        const pct = c.fatherCost > 0 ? Math.min(100, Math.round((c.fatherBells / c.fatherCost) * 100)) : 0;
        const seat = h('div', { class: 'hall-seat', style: hit, title: cur ? `${cur.name} is expected: ${c.fatherBells} of ${c.fatherCost} bells` : `Seat waiting for the next ${term(app.state, 'member')}` },
          h('span', { class: 'hall-seat-label' }, 'Seat waiting'),
          h('span', { class: 'hall-seat-bar' }, h('span', { style: `width:${pct}%` })),
          h('span', { class: 'hall-seat-bells' }, `${c.fatherBells}/${c.fatherCost}`));
        this.stage.append(seat);
      }
    }
    this.stage.append(this.tip);
    this.tip.hidden = true;
    if (this.selected && c.fathers.includes(this.selected)) {
      const btn = this.stage.querySelector<HTMLElement>('.hall-father.selected');
      if (btn) this.show(this.selected, btn, true);
    } else this.selected = null;

    // The caption bar.
    const cur = c.current ? FATHERS[c.current] : null;
    const mine = nation === app.viewer && app.isMyTurn();
    clear(this.head);
    this.head.append(
      h('header', { class: 'screen-head' },
        h('h2', null, `${Term(app.state, 'council')}`),
        h('span', { class: 'muted' }, `${nationOf(app.state, nation).name} · ${formatDate(app.state.turn, calendarOf(app.state))}`),
        h('button', { class: 'btn close', onclick: () => app.closeScreen(), 'aria-label': `Close the ${term(app.state, 'councilShort')} hall` }, 'Close')));
    clear(this.caption);
    this.caption.append(
      h('div', { class: 'hall-stats' },
        h('span', null, h('strong', null, `${c.fathers.length}/25`), ` ${term(app.state, 'members')}`),
        h('span', null, h('strong', null, c.bells.toLocaleString()), ` bells (${c.bellsPerTurn} per turn)`),
        h('span', null, h('strong', null, `${c.rebels}%`), p.independence === 'none' ? ' rebels (50% to declare)' : ' rebels'),
        h('span', { class: 'hall-next' },
          cur
            ? [h('strong', null, 'Next: '), `${cur.name} (${cur.category}) · ${c.fatherBells}/${c.fatherCost} bells${c.turnsToFather ? `, about ${c.turnsToFather} turn${c.turnsToFather === 1 ? '' : 's'}` : ''}`]
            : seeking
              ? [h('strong', null, 'Next: '), `no ${term(app.state, 'member')} chosen `, mine ? h('button', { class: 'btn small', onclick: () => { app.closeScreen(); void app.chooseFather(); } }, 'Choose one') : null]
              : [h('strong', null, `The ${term(app.state, 'councilShort')} is complete.`)])),
      h('p', { class: 'muted small' }, c.fathers.length ? 'Fathers stand in the order they joined, front row first. Hover or tap one to read about him. Press K or Escape to close the hall.' : `No ${term(app.state, 'member')} has joined yet; the first takes the empty seat.`),
    );
  }

  private show(id: FatherId, anchor: HTMLElement, pin = false): void {
    if (pin) {
      this.selected = id;
      for (const el of this.stage.querySelectorAll('.hall-father')) el.classList.toggle('selected', el === anchor);
    } else if (this.selected && this.selected !== id) {
      return;
    }
    const def = FATHERS[id];
    const joined = congressOverview(this.app.state, this.nation()).joined[id];
    const tip = this.tip;
    clear(tip);
    tip.append(
      h('strong', null, def.name),
      h('span', { class: 'muted small' }, ` ${def.category}`),
      h('div', { class: 'small' }, def.effect),
      h('div', { class: 'small muted' }, joined !== undefined ? `Joined in ${formatDate(joined, calendarOf(this.app.state))}` : 'Joined: date not recorded'));
    tip.hidden = false;
    // Above the figure's head when there is room, else below its feet; kept inside the stage.
    const sw = this.stage.clientWidth;
    const tw = tip.offsetWidth || 240;
    const left = Math.max(4, Math.min(sw - tw - 4, anchor.offsetLeft + anchor.offsetWidth / 2 - tw / 2));
    const above = anchor.offsetTop - tip.offsetHeight - 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= 4 ? above : Math.min(this.stage.clientHeight - tip.offsetHeight - 4, anchor.offsetTop + anchor.offsetHeight * 0.3)}px`;
  }

  private hide(id: FatherId, unpin = false): void {
    if (unpin) {
      this.selected = null;
      for (const el of this.stage.querySelectorAll('.hall-father')) el.classList.remove('selected');
    } else if (this.selected) {
      return;
    }
    void id;
    this.tip.hidden = true;
  }
}
