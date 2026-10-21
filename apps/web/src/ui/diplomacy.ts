import {
  AI_LEVEL_INFO,
  canDeclareIndependence,
  colonyWorkers,
  FATHERS,
  NATIONS,
  nationTitle,
  nextFatherCost,
  rebelShare,
  tensionLabel,
  TRIBES,
  type NationId,
  type TribeId,
} from '@cc/engine';
import type { App, Screen } from '../app.js';
import { clear, h } from '../dom.js';
import { confirmDialog } from './dialogs.js';

/** Foreign affairs, Continental Congress and the road to independence on one screen. */
export class DiplomacyScreen implements Screen {
  el: HTMLElement;
  private body: HTMLElement;

  constructor(private app: App) {
    this.body = h('div', { class: 'screen-body' });
    this.el = h('section', { class: 'screen diplomacy-screen', role: 'dialog', 'aria-label': 'Foreign affairs' }, this.body);
  }

  refresh(): void {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    clear(this.body);

    const nations = s.players.filter((p) => p.id !== me.id && p.id !== 'crown');
    const europe = h('div', { class: 'card' },
      h('h3', null, 'European nations'),
      nations.length ? h('table', { class: 'table' },
        h('tr', null, h('th', null, 'Nation'), h('th', null, 'Colonies'), h('th', null, 'Colonists'), h('th', null, 'Relations'), h('th', null, '')),
        nations.map((p) => {
          const colonies = Object.values(s.colonies).filter((c) => c.owner === p.id);
          const pop = colonies.reduce((n, c) => n + colonyWorkers(s, c).length, 0);
          const war = me.stance[p.id] === 'war';
          return h('tr', null,
            h('td', null, h('span', { class: 'flag', style: `background:${NATIONS[p.id].color}` }), ' ', nationTitle(p.id), p.human ? ' (player)' : ` (${AI_LEVEL_INFO[p.ai ?? 'naive'].name})`),
            h('td', null, String(colonies.length)),
            h('td', null, String(pop)),
            h('td', null, h('span', { class: `pill ${war ? 'bad' : 'good'}` }, war ? 'At war' : 'At peace')),
            h('td', null, war
              ? h('button', { class: 'btn tiny', onclick: () => app.dispatch({ type: 'proposePeace', nation: p.id }) }, 'Propose peace')
              : h('button', { class: 'btn tiny', onclick: () => this.war(p.id) }, 'Declare war')));
        }))
        : h('p', { class: 'muted small' }, 'You are the only European nation in the New World.'));

    const tribes = s.tribes
      .map((t) => {
        const settlements = Object.values(s.settlements).filter((st) => st.tribe === t.id);
        const met = settlements.some((st) => me.explored[st.y * s.map.width + st.x]);
        const tension = settlements.length ? Math.round(settlements.reduce((n, st) => n + (st.tension[me.id] ?? 0), 0) / settlements.length) : 0;
        const missions = settlements.filter((st) => st.mission === me.id).length;
        return { t, settlements, met, tension, missions };
      })
      .filter((r) => r.met);
    const natives = h('div', { class: 'card' },
      h('h3', null, 'Native peoples'),
      tribes.length ? h('table', { class: 'table' },
        h('tr', null, h('th', null, 'Tribe'), h('th', null, 'Settlements'), h('th', null, 'Mood'), h('th', null, 'Missions'), h('th', null, 'Gift')),
        tribes.map(({ t, settlements, tension, missions }) => {
          const war = t.stance[me.id] === 'war';
          const mood = war ? 'at war' : tensionLabel(tension);
          return h('tr', null,
            h('td', null, h('span', { class: 'flag', style: `background:${TRIBES[t.id].color}` }), ' ', TRIBES[t.id].name),
            h('td', null, String(settlements.length)),
            h('td', null, h('span', { class: `pill ${war || tension >= 700 ? 'bad' : tension >= 400 ? 'warn' : 'good'}` }, mood)),
            h('td', null, String(missions)),
            h('td', null, h('div', { class: 'row' }, [100, 500].map((gold) =>
              h('button', { class: 'btn tiny', disabled: me.gold < gold, onclick: () => this.gift(t.id, gold) }, String(gold))))));
        }))
        : h('p', { class: 'muted small' }, 'You have not met any native peoples yet.'),
      h('p', { class: 'muted small' }, 'Colonies near native land raise tension, especially as they grow. Trade, gifts and missions calm it; furious tribes raid.'));

    const cost = nextFatherCost(s, me);
    const congress = h('div', { class: 'card' },
      h('h3', null, 'Continental Congress'),
      h('p', null, me.currentFather
        ? `Next: ${FATHERS[me.currentFather].name}, ${me.fatherBells}/${cost} liberty bells.`
        : `${me.fatherBells}/${cost} liberty bells collected. No candidate chosen yet.`),
      h('button', { class: 'btn small', onclick: () => void app.chooseFather() }, me.currentFather ? 'Change candidate' : 'Choose candidate'),
      me.fathers.length
        ? h('ul', { class: 'fathers' }, me.fathers.map((id) => h('li', null, h('strong', null, FATHERS[id].name), ` (${FATHERS[id].category}): ${FATHERS[id].effect}`)))
        : h('p', { class: 'muted small' }, 'No Founding Fathers have joined yet.'));

    const share = rebelShare(s, me.id);
    const blocked = canDeclareIndependence(s, me.id);
    let independence: HTMLElement;
    if (me.independence === 'declared') {
      const ref = me.ref;
      independence = h('div', { class: 'card' },
        h('h3', null, 'War of Independence'),
        h('p', null, `Still to land: ${ref.regulars} regulars, ${ref.dragoons} dragoons, ${ref.artillery} artillery, ${ref.menOfWar} men-of-war.`),
        h('p', { class: 'muted small' }, 'Defeat every Royal unit to win. If the Crown retakes half your colonies, the rebellion fails.'));
    } else if (me.independence === 'won' || me.independence === 'lost') {
      independence = h('div', { class: 'card' }, h('h3', null, 'War of Independence'), h('p', null, me.independence === 'won' ? 'You are a free nation.' : 'The rebellion was crushed.'));
    } else {
      independence = h('div', { class: 'card' },
        h('h3', null, 'Independence'),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': share, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${share}%` })),
        h('p', null, `${share}% of your colonists support independence; 50% are needed to declare it.`),
        h('button', { class: 'btn small primary', disabled: !!blocked, title: blocked ?? undefined, onclick: () => this.declare() }, 'Declare independence'));
    }

    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, 'Foreign affairs'),
        h('span', { class: 'muted' }, `Gold ${me.gold.toLocaleString()}`),
        h('button', { class: 'btn close', onclick: () => app.closeScreen(), 'aria-label': 'Close foreign affairs' }, 'Close')),
      h('div', { class: 'diplomacy-grid' }, europe, natives, congress, independence),
    );
  }

  private async war(nation: NationId): Promise<void> {
    if (await confirmDialog('Declare war?', `Declare war on ${NATIONS[nation].name}? Their colonies and ships become fair game, and yours too.`, 'Declare war', 'Stay at peace')) {
      this.app.dispatch({ type: 'declareWar', nation });
    }
  }

  private gift(tribe: TribeId, gold: number): void {
    this.app.dispatch({ type: 'giftTribe', tribe, gold });
  }

  private async declare(): Promise<void> {
    const ok = await confirmDialog(
      'Declare independence?',
      'Trade with Europe ends and everything there is lost. The Crown will send its Royal Expeditionary Force. Veteran soldiers join the Continental Army. There is no going back.',
      'Declare independence',
      'Not yet',
    );
    if (ok) this.app.dispatch({ type: 'declareIndependence' });
  }
}
