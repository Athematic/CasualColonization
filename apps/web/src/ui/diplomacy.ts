import {
  AI_LEVEL_INFO,
  canDeclareIndependence,
  colonyWorkers,
  describeForce,
  FATHERS,
  favouredProblem,
  hasTradeAgreement,
  HOME_PORTS,
  isFavoured,
  NATIONS,
  nationTitle,
  nextFatherCost,
  rebelShare,
  relation,
  relationsMood,
  routesBetween,
  tensionLabel,
  tradeProblem,
  tradeTies,
  TRIBES,
  type NationId,
  type Player,
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
      nations.length
        ? h('ul', { class: 'nation-relations' }, nations.map((p) => this.nationRow(p)))
        : h('p', { class: 'muted small' }, 'You are the only European nation in the New World.'),
      nations.length ? h('p', { class: 'muted small' }, 'A trade agreement lets your trade routes call at each other’s colonies. After years of peace and enough trade routes between you, Favoured Nations may trade, and buy merchant ships, in each other’s home ports. Cancelling it costs both sides dearly.') : null);

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
        h('p', { class: 'small' }, `Royal forces: ${describeForce(me.ref)}. The Crown adds to them during the game, faster as your colonies ring more liberty bells; all of them sail when you declare.`),
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

  /** One European nation: war or peace, how relations stand (in words, never the hidden numbers), trade and Favoured Nation. */
  private nationRow(p: Player): HTMLElement {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    const colonies = Object.values(s.colonies).filter((c) => c.owner === p.id);
    const pop = colonies.reduce((n, c) => n + colonyWorkers(s, c).length, 0);
    const war = me.stance[p.id] === 'war';
    const independent = p.independence !== 'none' || me.independence !== 'none';
    const rel = relation(s, me.id, p.id);
    const trade = hasTradeAgreement(s, me.id, p.id);
    const favoured = isFavoured(s, me.id, p.id);
    const routes = routesBetween(s, me.id, p.id);
    const mood = relationsMood(s, me.id, p.id);
    const moodClass = war || /hostile/.test(mood) ? 'bad' : /rebuilt|cool/.test(mood) ? 'warn' : 'good';
    const pending = rel.proposal;
    const theirs = pending && pending.from === p.id;
    const kindName = (k: string) => (k === 'trade' ? 'a trade agreement' : 'Favoured Nation status');
    const buttons: (HTMLElement | null)[] = [];
    if (war) buttons.push(h('button', { class: 'btn tiny', onclick: () => app.dispatch({ type: 'proposePeace', nation: p.id }) }, 'Propose peace'));
    else {
      if (!trade) {
        const why = tradeProblem(s, me.id, p.id);
        buttons.push(h('button', { class: 'btn tiny', disabled: !!why, title: why ?? `Offer ${NATIONS[p.id].name} a trade agreement`, onclick: () => app.dispatch({ type: 'proposeTrade', nation: p.id }) }, 'Propose trade agreement'));
      } else if (!favoured) {
        buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.cancelTrade(p.id) }, 'End trade agreement'));
      }
      if (!favoured && !independent) {
        const why = favouredProblem(s, me.id, p.id);
        buttons.push(h('button', { class: 'btn tiny primary', disabled: !!why, title: why ?? `Offer ${NATIONS[p.id].name} Favoured Nation status`, onclick: () => app.dispatch({ type: 'proposeFavoured', nation: p.id }) }, 'Propose Favoured Nation'));
      }
      if (favoured) buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.cancelFavoured(p) }, 'Cancel Favoured Nation'));
      buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.war(p.id) }, 'Declare war'));
    }
    return h('li', { class: 'nation-relation' },
      h('div', { class: 'nation-head' },
        h('strong', null, h('span', { class: 'flag', style: `background:${NATIONS[p.id].color}` }), ' ', nationTitle(p.id)),
        h('span', { class: 'muted small' }, p.human ? 'player' : AI_LEVEL_INFO[p.ai ?? 'naive'].name),
        h('span', { class: `pill ${war ? 'bad' : 'good'}` }, war ? 'At war' : 'At peace'),
        favoured ? h('span', { class: 'pill good favoured' }, '★ Favoured Nation') : null),
      h('div', { class: 'muted small' }, `${colonies.length} ${colonies.length === 1 ? 'colony' : 'colonies'} · ${pop} colonists`),
      h('div', { class: 'relation-facts small' },
        h('span', { class: `pill ${moodClass}` }, mood),
        h('span', null, trade ? 'Trade agreement' : 'No trade agreement'),
        h('span', null, `${routes} trade route${routes === 1 ? '' : 's'} between you`),
        trade ? h('span', { class: 'muted' }, tradeTies(s, me.id, p.id)) : null,
        favoured ? h('span', { class: 'muted' }, `Your ships may use ${HOME_PORTS[p.id]}`) : null),
      pending && !theirs ? h('p', { class: 'muted small' }, `Your proposal of ${kindName(pending.kind)} is waiting for an answer.`) : null,
      theirs ? h('div', { class: 'proposal row wrap' },
        h('span', { class: 'small' }, `${nationTitle(p.id)} proposes ${kindName(pending!.kind)}.`),
        h('button', { class: 'btn tiny primary', onclick: () => app.dispatch({ type: 'answerProposal', nation: p.id, accept: true }) }, 'Accept'),
        h('button', { class: 'btn tiny', onclick: () => app.dispatch({ type: 'answerProposal', nation: p.id, accept: false }) }, 'Turn down')) : null,
      h('div', { class: 'row wrap nation-actions' }, buttons));
  }

  private async cancelTrade(nation: NationId): Promise<void> {
    if (await confirmDialog('End the trade agreement?', `Your trade routes will no longer call at ${NATIONS[nation].adjective} colonies, and theirs not at yours.`, 'End it', 'Keep trading')) {
      this.app.dispatch({ type: 'cancelTrade', nation });
    }
  }

  private async cancelFavoured(p: Player): Promise<void> {
    const people = p.human && this.app.me.human;
    const text = `Cancelling ends the trade agreement and every trade route between you. All goods carried by either side's ships and wagon trains next to the other's colonies are seized.${people ? ' Between two players there is no waiting period: you can agree again at once.' : ` Relations with ${NATIONS[p.id].name} will stay hostile for years, and no new agreement will be possible for a long time.`}`;
    if (await confirmDialog('Cancel Favoured Nation status?', text, 'Cancel it', 'Keep it')) this.app.dispatch({ type: 'cancelFavoured', nation: p.id });
  }

  private async war(nation: NationId): Promise<void> {
    const favoured = isFavoured(this.app.state, this.app.me.id, nation);
    const extra = favoured ? ' This also cancels your Favoured Nation status, with all its consequences.' : hasTradeAgreement(this.app.state, this.app.me.id, nation) ? ' Your trade agreement ends.' : '';
    if (await confirmDialog('Declare war?', `Declare war on ${NATIONS[nation].name}? Their colonies and ships become fair game, and yours too.${extra}`, 'Declare war', 'Stay at peace')) {
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
