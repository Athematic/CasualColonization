import {
  AI_LEVEL_INFO,
  allianceOf,
  allianceProblem,
  alliesOf,
  allianceRules,
  allTreaties,
  confederationOn,
  confederationProblem,
  expeditionProblem,
  companyCharters,
  companyRules,
  foundProblem,
  sharePrice,
  sharesIn,
  sharesProblem,
  bound,
  canDeclareIndependence,
  describeTreaty,
  colonyWorkers,
  describeForce,
  FATHERS,
  favouredProblem,
  hasTradeAgreement,
  inContact,
  isAllied,
  isFavoured,
  mechanicsOf,
  nationOf,
  portName,
  nationTitle,
  nextFatherCost,
  rebelShare,
  relation,
  relationsMood,
  routesBetween,
  nativeRulesOf,
  peopleStanding,
  peopleTradeBenefits,
  peopleTreatiesOn,
  peopleTreatyProblem,
  peopleTreatyRules,
  tensionLabel,
  tensionSeverity,
  term,
  Term,
  tradeProblem,
  tradeTies,
  treatyName,
  treatiesWithPeople,
  TRIBES,
  withPeople,
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

    const nations = s.players.filter((p) => p.id !== me.id && p.id !== 'crown' && p.kind !== 'company');
    const europe = h('div', { class: 'card' },
      h('h3', null, 'European nations'),
      nations.length
        ? h('ul', { class: 'nation-relations' }, nations.map((p) => this.nationRow(p)))
        : h('p', { class: 'muted small' }, `You are the only ${term(app.state, 'homelandAdjective')} nation in ${term(app.state, 'colonyLand')}.`),
      nations.length ? h('p', { class: 'muted small' }, 'A trade agreement lets your trade routes call at each other’s colonies. After years of peace and enough trade routes between you, Favoured Nations may trade, and buy merchant ships, in each other’s home ports. Cancelling it costs both sides dearly.', mechanicsOf(s).alliances ? ' Favoured Nations at peace for many more years, with more trade between them, may ally: an attack on one ally is war with all, allied units may enter each other’s colonies, and allies share what they see.' : '') : null);

    const treaties = this.treatyCard();
    const companies = this.companyCard();

    const natives = this.nativesCard();

    const cost = nextFatherCost(s, me);
    const congress = h('div', { class: 'card' },
      h('h3', null, `${Term(app.state, 'council')}`),
      h('p', null, me.currentFather
        ? `Next: ${FATHERS[me.currentFather].name}, ${me.fatherBells}/${cost} liberty bells.`
        : `${me.fatherBells}/${cost} liberty bells collected. No candidate chosen yet.`),
      h('button', { class: 'btn small', onclick: () => void app.chooseFather() }, me.currentFather ? 'Change candidate' : 'Choose candidate'),
      me.fathers.length
        ? h('ul', { class: 'fathers' }, me.fathers.map((id) => h('li', null, h('strong', null, FATHERS[id].name), ` (${FATHERS[id].category}): ${FATHERS[id].effect}`)))
        : h('p', { class: 'muted small' }, `No ${term(app.state, 'members')} have joined yet.`));

    const share = rebelShare(s, me.id);
    const blocked = canDeclareIndependence(s, me.id);
    const mechanics = mechanicsOf(s);
    let independence: HTMLElement | null;
    // A scenario without independence (or without a royal army) shows neither.
    if (!mechanics.independence) {
      independence = mechanics.ref
        ? h('div', { class: 'card' }, h('h3', null, 'Royal forces'), h('p', { class: 'small' }, `Royal forces: ${describeForce(me.ref)}.`))
        : null;
    } else if (me.independence === 'declared') {
      const ref = me.ref;
      independence = h('div', { class: 'card' },
        h('h3', null, `${Term(app.state, 'independenceWar')}`),
        h('p', null, `Still to land: ${ref.regulars} regulars, ${ref.dragoons} dragoons, ${ref.artillery} artillery, ${ref.menOfWar} men-of-war.`),
        h('p', { class: 'muted small' }, `Defeat every Royal unit to win. If ${term(app.state, 'crown')} retakes half your colonies, the rebellion fails.`));
    } else if (me.independence === 'won' || me.independence === 'lost') {
      independence = h('div', { class: 'card' }, h('h3', null, `${Term(app.state, 'independenceWar')}`), h('p', null, me.independence === 'won' ? 'You are a free nation.' : 'The rebellion was crushed.'));
    } else {
      independence = h('div', { class: 'card' },
        h('h3', null, 'Independence'),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': share, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${share}%` })),
        h('p', null, `${share}% of your colonists support independence; 50% are needed to declare it.`),
        h('p', { class: 'small' }, `Royal forces: ${describeForce(me.ref)}. ${Term(app.state, 'crown')} adds to them during the game, faster as your colonies ring more liberty bells; all of them sail when you declare.`),
        h('button', { class: 'btn small primary', disabled: !!blocked, title: blocked ?? undefined, onclick: () => this.declare() }, 'Declare independence'));
    }

    this.body.append(
      h('header', { class: 'screen-head' },
        h('h2', null, 'Foreign affairs'),
        h('span', { class: 'muted' }, `Gold ${me.gold.toLocaleString()}`),
        h('button', { class: 'btn close', onclick: () => app.closeScreen(), 'aria-label': 'Close foreign affairs' }, 'Close')),
      h('div', { class: 'diplomacy-grid' }, europe, treaties, companies, natives, congress, independence),
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
    const kindName = (k: string) => (k === 'trade' ? 'a trade agreement' : k === 'alliance' ? 'an alliance' : k === 'expedition' ? 'a joint expedition' : k === 'confederation' ? 'declaring independence together' : 'Favoured Nation status');
    const allied = isAllied(s, me.id, p.id);
    const theirAllies = alliesOf(s, p.id).filter((n) => n !== me.id);
    const buttons: (HTMLElement | null)[] = [];
    if (war) buttons.push(h('button', { class: 'btn tiny', onclick: () => app.dispatch({ type: 'proposePeace', nation: p.id }) }, 'Propose peace'));
    else {
      if (!trade) {
        const why = tradeProblem(s, me.id, p.id);
        buttons.push(h('button', { class: 'btn tiny', disabled: !!why, title: why ?? `Offer ${nationOf(app.state, p.id).name} a trade agreement`, onclick: () => app.dispatch({ type: 'proposeTrade', nation: p.id }) }, 'Propose trade agreement'));
      } else if (!favoured) {
        buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.cancelTrade(p.id) }, 'End trade agreement'));
      }
      if (!favoured && !independent && mechanicsOf(s).favoured) {
        const why = favouredProblem(s, me.id, p.id);
        buttons.push(h('button', { class: 'btn tiny primary', disabled: !!why, title: why ?? `Offer ${nationOf(app.state, p.id).name} Favoured Nation status`, onclick: () => app.dispatch({ type: 'proposeFavoured', nation: p.id }) }, 'Propose Favoured Nation'));
      }
      if (mechanicsOf(s).alliances && !allied && (favoured || (trade && (allianceRules(s).requires === 'trade' || !!allianceRules(s).longPeace)) || (p.human && me.human))) {
        const why = allianceProblem(s, me.id, p.id);
        const invite = !!allianceOf(s, me.id);
        buttons.push(h('button', { class: 'btn tiny primary', 'data-action': 'propose-alliance', disabled: !!why, title: why ?? `Offer ${nationOf(s, p.id).name} ${invite ? 'a place in your alliance' : 'an alliance'}`, onclick: () => app.dispatch({ type: 'proposeAlliance', nation: p.id }) }, invite ? 'Invite to alliance' : 'Propose alliance'));
      }
      if (allied) {
        const why = expeditionProblem(s, me.id, p.id);
        const cost = allianceRules(s).expeditionCost;
        buttons.push(h('button', { class: 'btn tiny', 'data-action': 'joint-expedition', disabled: !!why, title: why ?? `Fund a seasoned scout together, ${Math.ceil(cost / 2)} gold each, and share the gold it finds`, onclick: () => app.dispatch({ type: 'proposeExpedition', nation: p.id }) }, 'Joint expedition'));
        if (confederationOn(s) && me.independence === 'none' && p.independence === 'none') {
          const no = confederationProblem(s, me.id, p.id);
          buttons.push(h('button', { class: 'btn tiny', 'data-action': 'confederation', disabled: !!no, title: no ?? `Declare independence together with ${nationOf(s, p.id).name}, and fight the Crown's armies side by side`, onclick: () => void this.confederate(p.id) }, 'Declare independence together'));
        }
        buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.leaveAlliance(p) }, 'Leave alliance'));
      }
      else if (favoured) buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.cancelFavoured(p) }, 'Cancel Favoured Nation'));
      buttons.push(h('button', { class: 'btn tiny', onclick: () => void this.war(p.id) }, 'Declare war'));
    }
    return h('li', { class: 'nation-relation' },
      h('div', { class: 'nation-head' },
        h('strong', null, h('span', { class: 'flag', style: `background:${nationOf(app.state, p.id).color}` }), ' ', nationTitle(app.state, p.id)),
        h('span', { class: 'muted small' }, p.human ? 'player' : AI_LEVEL_INFO[p.ai ?? 'naive'].name),
        h('span', { class: `pill ${war ? 'bad' : 'good'}` }, war ? 'At war' : 'At peace'),
        favoured ? h('span', { class: 'pill good favoured' }, '★ Favoured Nation') : null,
        allied ? h('span', { class: 'pill good allied' }, '⛨ Ally') : null),
      h('div', { class: 'muted small' }, `${colonies.length} ${colonies.length === 1 ? 'colony' : 'colonies'} · ${pop} colonists`),
      h('div', { class: 'relation-facts small' },
        h('span', { class: `pill ${moodClass}` }, mood),
        h('span', null, trade ? 'Trade agreement' : 'No trade agreement'),
        h('span', null, `${routes} trade route${routes === 1 ? '' : 's'} between you`),
        trade ? h('span', { class: 'muted' }, tradeTies(s, me.id, p.id)) : null,
        favoured ? h('span', { class: 'muted' }, `Your ships may use ${portName(this.app.state, p.id)}`) : null,
        allied ? h('span', { class: 'muted' }, 'Your units may enter their colonies; you share what you see') : null,
        theirAllies.length ? h('span', { class: 'muted' }, `Allied with ${theirAllies.map((n) => nationOf(s, n).name).join(' and ')}`) : null),
      pending && !theirs ? h('p', { class: 'muted small' }, `Your proposal of ${kindName(pending.kind)} is waiting for an answer.`) : null,
      theirs ? h('div', { class: 'proposal row wrap' },
        h('span', { class: 'small' }, `${nationTitle(app.state, p.id)} proposes ${kindName(pending!.kind)}.`),
        h('button', { class: 'btn tiny primary', onclick: () => app.dispatch({ type: 'answerProposal', nation: p.id, accept: true }) }, 'Accept'),
        h('button', { class: 'btn tiny', onclick: () => app.dispatch({ type: 'answerProposal', nation: p.id, accept: false }) }, 'Turn down')) : null,
      h('div', { class: 'row wrap nation-actions' }, buttons));
  }

  /**
   * Native peoples (native-partners.md N13): a row per people met, with its settlements, mood,
   * missions and gifts and, where the scenario has treaties with peoples, its standing in words,
   * its treaties with you and a Propose action. Peoples in contact (a scout's visit, a mission or
   * trade) come first, partners first among them; peoples only seen are folded away, so the list
   * stays usable with dozens of small peoples.
   */
  private nativesCard(): HTMLElement {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    const treaties = peopleTreatiesOn(s);
    const thresholds = nativeRulesOf(s).tension;
    const rows = s.tribes
      .map((t) => {
        const settlements = Object.values(s.settlements).filter((st) => st.tribe === t.id);
        const contact = inContact(s, me.id, t.id);
        const met = contact || settlements.some((st) => me.explored[st.y * s.map.width + st.x]);
        const tension = settlements.length ? Math.round(settlements.reduce((n, st) => n + (st.tension[me.id] ?? 0), 0) / settlements.length) : 0;
        const missions = settlements.filter((st) => st.mission === me.id).length;
        const inForce = treatiesWithPeople(s, me.id, t.id);
        return { t, settlements, met, tension, missions, contact, inForce };
      })
      .filter((r) => r.met)
      .sort((a, b) => Number(b.inForce.length > 0) - Number(a.inForce.length > 0) || Number(b.contact) - Number(a.contact) || TRIBES[a.t.id].name.localeCompare(TRIBES[b.t.id].name));
    const head = () => h('tr', null, h('th', null, 'People'), h('th', null, 'Settlements'), h('th', null, 'Mood'), treaties ? h('th', null, 'Standing') : null, treaties ? h('th', null, 'Treaties') : null, h('th', null, 'Missions'), h('th', null, 'Gift'));
    // Words and colours at the thresholds the braves act on (demands, raids, war).
    const row = ({ t, settlements, tension, missions, contact, inForce }: (typeof rows)[number]) => {
      const war = t.stance[me.id] === 'war';
      const mood = war ? 'at war' : tensionLabel(tension, thresholds);
      const why = treaties ? peopleTreatyProblem(s, me.id, t.id) : null;
      const name = TRIBES[t.id].name;
      return h('tr', { 'data-people': t.id },
        h('td', null, h('span', { class: 'flag', style: `background:${TRIBES[t.id].color}` }), ' ', name),
        h('td', null, String(settlements.length)),
        h('td', null, h('span', { class: `pill ${war ? 'bad' : tensionSeverity(tension, thresholds)}` }, mood)),
        treaties ? h('td', { class: 'small' }, peopleStanding(s, me.id, t.id)) : null,
        treaties ? h('td', { class: 'small' },
          inForce.length ? inForce.map((x) => treatyName(x)).join(', ') : null,
          !inForce.length && contact && !war
            ? h('button', { class: 'btn tiny', 'data-action': 'propose-people-trade', disabled: !!why || !app.isMyTurn(), title: why ?? `Offer the ${name} a trade treaty: ${peopleTradeBenefits(s)}.`, 'aria-label': `Propose a trade treaty to the ${name}`, onclick: () => app.dispatch({ type: 'proposePeopleTreaty', people: t.id }) }, 'Propose')
            : !inForce.length ? '—' : null) : null,
        h('td', null, String(missions)),
        h('td', null, h('div', { class: 'row' }, [100, 500].map((gold) =>
          h('button', { class: 'btn tiny', disabled: me.gold < gold, onclick: () => this.gift(t.id, gold) }, String(gold))))));
    };
    // With treaties in play, peoples only seen (no contact yet) are folded away.
    const shown = treaties ? rows.filter((r) => r.contact) : rows;
    const folded = treaties ? rows.filter((r) => !r.contact) : [];
    return h('div', { class: 'card natives' },
      h('h3', null, 'Native peoples'),
      shown.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'table' }, head(), shown.map(row))) : null,
      folded.length ? h('details', null, h('summary', { class: 'small' }, `Seen, not yet met (${folded.length})`), h('div', { class: 'table-scroll' }, h('table', { class: 'table' }, head(), folded.map(row)))) : null,
      !rows.length ? h('p', { class: 'muted small' }, 'You have not met any native peoples yet.') : null,
      h('p', { class: 'muted small' }, 'Colonies near native land raise tension, especially as they grow. Trade, gifts and missions calm it; uneasy tribes demand tribute, angry ones raid and furious ones go to war.'),
      treaties ? h('p', { class: 'muted small' }, `After years of good relations${peopleTreatyRules(s).trade.volume.max > 0 ? ' and trade' : ''}, a people you have met (a scout’s visit, a mission or trade) may agree to a trade treaty, or offer one through a visiting brave: ${peopleTradeBenefits(s)}. Taking a partner’s land, attacking it or paying it to make war breaks faith: every treaty with that people ends, and it will not trust you again for many years.`) : null);
  }

  /**
   * Treaties: those in force between any European nations, or between a nation and a native
   * people (they are public), yours first, then your past ones, most recent first. A party is
   * named by `describeTreaty` ("France and the Kalinago").
   */
  private treatyCard(): HTMLElement | null {
    const s = this.app.state;
    const me = this.app.me.id;
    const all = allTreaties(s);
    if (!all.length) return null;
    const current = all.filter((t) => !t.end);
    const mine = current.filter((t) => bound(t, me));
    const others = current.filter((t) => !bound(t, me));
    const past = all.filter((t) => t.end && bound(t, me)).reverse().slice(0, 8);
    const item = (t: (typeof all)[number]) =>
      h('li', { class: `treaty treaty-${t.kind}${t.end ? ' past' : ''}`, 'data-treaty': t.id }, h('strong', null, treatyName(t)), ' ', h('span', { class: 'small' }, describeTreaty(s, t)));
    return h('div', { class: 'card treaties' },
      h('h3', null, 'Treaties'),
      mine.length ? h('ul', { class: 'treaty-list' }, mine.map(item)) : h('p', { class: 'muted small' }, 'You have no treaties in force.'),
      others.length ? h('details', null, h('summary', { class: 'small' }, `${others.some(withPeople) ? 'Between others' : 'Between other nations'} (${others.length})`), h('ul', { class: 'treaty-list' }, others.map(item))) : null,
      past.length ? h('details', null, h('summary', { class: 'small' }, `Your past treaties (${past.length})`), h('ul', { class: 'treaty-list muted' }, past.map(item))) : null);
  }

  /**
   * Chartered companies: those the scenario offers, founded or not, with the shares you hold,
   * the price of a share and the dividends paid; found one, or buy shares.
   */
  private companyCard(): HTMLElement | null {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    const charters = companyCharters(s);
    if (!charters.length) return null;
    const rules = companyRules(s);
    const rows = charters.map((entry) => {
      const co = s.players.find((p) => p.id === entry.id);
      const name = h('strong', null, h('span', { class: 'flag', style: `background:${entry.color}` }), ' ', nationTitle(s, entry.id));
      if (!co) {
        const why = foundProblem(s, me.id, entry.id);
        return h('li', { class: 'company', 'data-company': entry.id }, name, ' ', h('span', { class: 'muted small' }, 'not founded'), ' ',
          h('button', { class: 'btn tiny', 'data-action': 'found-company', disabled: !!why || !app.isMyTurn(), title: why ?? `Charter it for ${rules.capital} gold`, onclick: () => app.dispatch({ type: 'foundCompany', company: entry.id }) }, `Found (${rules.capital} gold)`));
      }
      const { held, total } = sharesIn(co, me.id);
      const price = sharePrice(s, co);
      const colonies = Object.values(s.colonies).filter((c) => c.owner === co.id).length;
      const why = sharesProblem(s, me.id, co.id, 5);
      return h('li', { class: 'company', 'data-company': entry.id }, name, ' ',
        h('span', { class: 'small' }, `${colonies} ${colonies === 1 ? 'colony' : 'colonies'} · you hold ${held} of ${total} shares · ${price} gold a share · ${co.company?.paid ?? 0} gold paid in dividends`), ' ',
        h('button', { class: 'btn tiny', 'data-action': 'buy-shares', disabled: !!why || !app.isMyTurn(), title: why ?? `Buy 5 shares for ${price * 5} gold`, onclick: () => app.dispatch({ type: 'buyShares', company: co.id, count: 5 }) }, 'Buy 5 shares'));
    });
    return h('div', { class: 'card companies' },
      h('h3', null, 'Chartered companies'),
      h('ul', { class: 'treaty-list' }, rows),
      h('p', { class: 'muted small' }, `A company founds and runs colonies of its own, with no ${term(s, 'crown')} and no taxes. Its founder pays ${rules.capital} gold for the first ${rules.foundingShares} shares; anyone may buy more. Every ${rules.dividendEvery} turns it pays out part of its gold to its shareholders, and its score counts for them by their shares. Nobody makes war on a company.`));
  }

  private async cancelTrade(nation: NationId): Promise<void> {
    if (await confirmDialog('End the trade agreement?', `Your trade routes will no longer call at ${nationOf(this.app.state, nation).adjective} colonies, and theirs not at yours.`, 'End it', 'Keep trading')) {
      this.app.dispatch({ type: 'cancelTrade', nation });
    }
  }

  private async cancelFavoured(p: Player): Promise<void> {
    const people = p.human && this.app.me.human;
    const text = `Cancelling ends the trade agreement and every trade route between you. All goods carried by either side's ships and wagon trains next to the other's colonies are seized.${people ? ' Between two players there is no waiting period: you can agree again at once.' : ` Relations with ${nationOf(this.app.state, p.id).name} will stay hostile for years, and no new agreement will be possible for a long time.`}`;
    if (await confirmDialog('Cancel Favoured Nation status?', text, 'Cancel it', 'Keep it')) this.app.dispatch({ type: 'cancelFavoured', nation: p.id });
  }

  private async confederate(nation: NationId): Promise<void> {
    const s = this.app.state;
    const ok = await confirmDialog(
      `Declare independence together with ${nationOf(s, nation).name}?`,
      `If ${nationOf(s, nation).name} agrees, both of you declare at once. Trade with ${term(s, 'homeland')} ends and everything there is lost; each Crown sends its ${term(s, 'ref')}. The war is one: it is won when every royal army is beaten, and lost when together you hold half your colonies or fewer.`,
      'Propose it',
      'Not yet',
    );
    if (ok) this.app.dispatch({ type: 'proposeConfederation', nation });
  }

  private async leaveAlliance(p: Player): Promise<void> {
    const s = this.app.state;
    const people = p.human && this.app.me.human;
    const text = `Leaving the alliance cancels your Favoured Nation status with every ally: trade agreements and trade routes end, and goods next to each other's colonies are seized. Your units in allied colonies must leave.${people ? ' Between two players there is no waiting period.' : ' Relations will stay hostile for longer than after cancelling Favoured Nation, and no new agreement will be possible for many years.'}`;
    if (await confirmDialog(`Leave the alliance with ${nationOf(s, p.id).name}?`, text, 'Leave it', 'Stay allied')) this.app.dispatch({ type: 'leaveAlliance' });
  }

  private async war(nation: NationId): Promise<void> {
    const s = this.app.state;
    const favoured = isFavoured(this.app.state, this.app.me.id, nation);
    const allies = alliesOf(s, nation).filter((n) => n !== this.app.me.id);
    const extra = (isAllied(s, this.app.me.id, nation) ? ' This is war on an ally: you leave the alliance, with all its consequences.' : favoured ? ' This also cancels your Favoured Nation status, with all its consequences.' : hasTradeAgreement(this.app.state, this.app.me.id, nation) ? ' Your trade agreement ends.' : '')
      + (allies.length ? ` Its allies ${allies.map((n) => nationOf(s, n).name).join(' and ')} will be at war with you too.` : '');
    if (await confirmDialog('Declare war?', `Declare war on ${nationOf(this.app.state, nation).name}? Their colonies and ships become fair game, and yours too.${extra}`, 'Declare war', 'Stay at peace')) {
      this.app.dispatch({ type: 'declareWar', nation });
    }
  }

  private gift(tribe: TribeId, gold: number): void {
    this.app.dispatch({ type: 'giftTribe', tribe, gold });
  }

  private async declare(): Promise<void> {
    const ok = await confirmDialog(
      'Declare independence?',
      `Trade with ${term(this.app.state, 'homeland')} ends and everything there is lost. ${Term(this.app.state, 'crown')} will send its ${term(this.app.state, 'ref')}. Veteran soldiers join the ${term(this.app.state, 'army')}. There is no going back.`,
      'Declare independence',
      'Not yet',
    );
    if (ok) this.app.dispatch({ type: 'declareIndependence' });
  }
}
