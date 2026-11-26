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
  canDeclareIndependence,
  describeTreaty,
  colonyWorkers,
  describeForce,
  councilText,
  CouncilText,
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
  peopleTreatyOn,
  peopleTreatyProblem,
  landUseBenefits,
  defenceBenefits,
  exchangeBenefits,
  leasedTiles,
  leaseTerms,
  peopleTreatyRules,
  tensionLabel,
  tensionSeverity,
  term,
  Term,
  tradeProblem,
  tradeTies,
  treatyName,
  treatiesWithPeople,
  systemsOf,
  TRIBES,
  peopleName,
  withPeople,
  anyPlayingPeople,
  isPeoplePlayer,
  pairAtWar,
  partyBinds,
  pairBenefits,
  pairKinds,
  pairStanding,
  pairTreaties,
  pairTreatyProblem,
  peopleTreatyText,
  sideName,
  standingOf,
  type PeopleTreatyKind,
  type PlayerId,
  type Player,
  type TribeId,
  leaguesOn,
  leagueOf,
  leagueMembers,
  leagueProblem,
  leagueProposalFor,
  formatDate,
  calendarOf,
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

    // A playing people (Beta 3 step 4) has no European relations: its diplomacy is the card of treaties with peoples.
    const people = isPeoplePlayer(me);
    const nations = s.players.filter((p) => p.id !== me.id && systemsOf(p).relations);
    const europe = people ? null : h('div', { class: 'card' },
      h('h3', null, 'European nations'),
      nations.length
        ? h('ul', { class: 'nation-relations' }, nations.map((p) => this.nationRow(p)))
        : h('p', { class: 'muted small' }, `You are the only ${term(app.state, 'homelandAdjective')} nation in ${term(app.state, 'colonyLand')}.`),
      nations.length ? h('p', { class: 'muted small' }, 'A trade agreement lets your trade routes call at each other’s colonies. After years of peace and enough trade routes between you, Favoured Nations may trade, and buy merchant ships, in each other’s home ports. Cancelling it costs both sides dearly.', mechanicsOf(s).alliances ? ' Favoured Nations at peace for many more years, with more trade between them, may ally: an attack on one ally is war with all, allied units may enter each other’s colonies, and allies share what they see.' : '') : null);

    const treaties = this.treatyCard();
    // Companies are chartered by a Crown: a people founds none and holds no shares (native-nations.md T1).
    const companies = people ? null : this.companyCard();

    const natives = people ? null : this.nativesCard();
    const pairs = this.pairCard();

    const cost = nextFatherCost(s, me);
    // The viewer's own council: the Congress, or a people's council naming its own product (native-nations.md T8).
    const product = councilText(app.state, me.id, 'product') === 'bells' ? 'liberty bells' : councilText(app.state, me.id, 'product');
    const congress = h('div', { class: 'card' },
      h('h3', null, CouncilText(app.state, me.id, 'council')),
      h('p', null, me.currentFather
        ? `Next: ${FATHERS[me.currentFather].name}, ${me.fatherBells}/${cost} ${product}.`
        : `${me.fatherBells}/${cost} ${product} collected. No candidate chosen yet.`),
      h('button', { class: 'btn small', onclick: () => void app.chooseFather() }, me.currentFather ? 'Change candidate' : 'Choose candidate'),
      me.fathers.length
        ? h('ul', { class: 'fathers' }, me.fathers.map((id) => h('li', null, h('strong', null, FATHERS[id].name), ` (${FATHERS[id].category}): ${FATHERS[id].effect}`)))
        : h('p', { class: 'muted small' }, `No ${councilText(app.state, me.id, 'members')} have joined yet.`));

    const share = rebelShare(s, me.id);
    const blocked = canDeclareIndependence(s, me.id);
    const mechanics = mechanicsOf(s);
    let independence: HTMLElement | null;
    // A scenario without independence (or without a royal army) shows neither.
    if (!systemsOf(me).independence) {
      independence = null;
    } else if (!mechanics.independence) {
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
      h('div', { class: 'diplomacy-grid' }, europe, pairs, treaties, companies, natives, congress, independence),
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
    // A people that plays (Beta 3) is in the card of native nations, not here.
    const rows = s.tribes
      .filter((t) => !s.players.some((p) => p.id === t.id))
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
      .sort((a, b) => Number(b.inForce.length > 0) - Number(a.inForce.length > 0) || Number(b.contact) - Number(a.contact) || peopleName(s, a.t.id).localeCompare(peopleName(s, b.t.id)));
    const head = () => h('tr', null, h('th', null, 'People'), h('th', null, 'Settlements'), h('th', null, 'Mood'), treaties ? h('th', null, 'Standing') : null, treaties ? h('th', null, 'Treaties') : null, h('th', null, 'Missions'), h('th', null, 'Gift'));
    // Words and colours at the thresholds the braves act on (demands, raids, war).
    const row = ({ t, settlements, tension, missions, contact, inForce }: (typeof rows)[number]) => {
      const war = t.stance[me.id] === 'war';
      const mood = war ? 'at war' : tensionLabel(tension, thresholds);
      const why = treaties ? peopleTreatyProblem(s, me.id, t.id) : null;
      const name = peopleName(s, t.id);
      // Land use (a lease, N5) is the next rung once trade is agreed.
      const landOn = treaties && peopleTreatyOn(s, 'land-use');
      const trading = inForce.some((x) => x.kind === 'people-trade');
      const leasing = inForce.find((x) => x.kind === 'land-use');
      const whyLand = landOn && trading && !leasing ? peopleTreatyProblem(s, me.id, t.id, 'land-use') : null;
      const lease = leasing && leaseTerms(leasing);
      const leaseText = lease ? `Land use (${leasedTiles(s, me.id, t.id).length} tiles, ${lease.rent} gold a tile a year)` : null;
      // A cultural exchange (N7) is the other rung on trade.
      const exchangeOn = treaties && peopleTreatyOn(s, 'exchange');
      const exchanging = inForce.some((x) => x.kind === 'exchange');
      const whyExchange = exchangeOn && trading && !exchanging ? peopleTreatyProblem(s, me.id, t.id, 'exchange') : null;
      // A mutual defence pact (N7) is the top rung: on trade and land use or an exchange.
      const defenceOn = treaties && peopleTreatyOn(s, 'defence');
      const defending = inForce.some((x) => x.kind === 'defence');
      const rung = !!leasing || exchanging;
      const whyDefence = defenceOn && trading && rung && !defending ? peopleTreatyProblem(s, me.id, t.id, 'defence') : null;
      return h('tr', { 'data-people': t.id },
        h('td', null, h('span', { class: 'flag', style: `background:${TRIBES[t.id].color}` }), ' ', name),
        h('td', null, String(settlements.length)),
        h('td', null, h('span', { class: `pill ${war ? 'bad' : tensionSeverity(tension, thresholds)}` }, mood)),
        treaties ? h('td', { class: 'small' }, peopleStanding(s, me.id, t.id)) : null,
        treaties ? h('td', { class: 'small' },
          inForce.length ? inForce.map((x) => (x === leasing && leaseText ? leaseText : treatyName(x))).join(', ') : null,
          !inForce.length && contact && !war
            ? h('button', { class: 'btn tiny', 'data-action': 'propose-people-trade', disabled: !!why || !app.isMyTurn(), title: why ?? `Offer the ${name} a trade treaty: ${peopleTradeBenefits(s)}.`, 'aria-label': `Propose a trade treaty to the ${name}`, onclick: () => app.dispatch({ type: 'proposePeopleTreaty', people: t.id }) }, 'Propose')
            : !inForce.length ? '—' : null,
          landOn && trading && !leasing && !war
            ? [' ', h('button', { class: 'btn tiny', 'data-action': 'propose-land-use', disabled: !!whyLand || !app.isMyTurn(), title: whyLand ?? `Ask the ${name} to lease you their land beside your colonies: ${landUseBenefits(s)}.`, 'aria-label': `Propose land use to the ${name}`, onclick: () => app.dispatch({ type: 'proposePeopleTreaty', people: t.id, kind: 'land-use' }) }, 'Lease land')]
            : null,
          exchangeOn && trading && !exchanging && !war
            ? [' ', h('button', { class: 'btn tiny', 'data-action': 'propose-exchange', disabled: !!whyExchange || !app.isMyTurn(), title: whyExchange ?? `Offer the ${name} a cultural exchange: ${exchangeBenefits(s)}.`, 'aria-label': `Propose a cultural exchange to the ${name}`, onclick: () => app.dispatch({ type: 'proposePeopleTreaty', people: t.id, kind: 'exchange' }) }, 'Propose exchange')]
            : null,
          defenceOn && trading && rung && !defending && !war
            ? [' ', h('button', { class: 'btn tiny', 'data-action': 'propose-defence', disabled: !!whyDefence || !app.isMyTurn(), title: whyDefence ?? `Offer the ${name} a mutual defence pact: ${defenceBenefits(s)}.`, 'aria-label': `Propose a mutual defence pact to the ${name}`, onclick: () => app.dispatch({ type: 'proposePeopleTreaty', people: t.id, kind: 'defence' }) }, 'Propose defence')]
            : null) : null,
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
      treaties ? h('p', { class: 'muted small' }, `After years of good relations${peopleTreatyRules(s).trade.volume.max > 0 ? ' and trade' : ''}, a people you have met (a scout’s visit, a mission or trade) may agree to a trade treaty, or offer one through a visiting brave: ${peopleTradeBenefits(s)}. Taking a partner’s land, attacking it or paying it to make war breaks faith: every treaty with that people ends, and it will not trust you again for many years.`) : null,
      treaties && peopleTreatyOn(s, 'land-use') ? h('p', { class: 'muted small' }, `With a trade treaty and more years of good relations, a people may lease you its land: ${landUseBenefits(s)}. The rent is paid each year; if you cannot pay, the lease lapses. You may still buy a leased tile; taking one breaks faith.`) : null,
      treaties && peopleTreatyOn(s, 'exchange') ? h('p', { class: 'muted small' }, `With a trade treaty and more years of good relations, a people may agree to a cultural exchange: ${exchangeBenefits(s)}. It ends with the trade treaty.`) : null,
      treaties && peopleTreatyOn(s, 'defence') ? h('p', { class: 'muted small' }, `With a trade treaty and land use or a cultural exchange, after still more years of good relations, a people may make a mutual defence pact with you, and with no other nation while it holds: ${defenceBenefits(s)}. Its braves defend only; they do not join your own wars.`) : null);
  }

  /**
   * Diplomacy with a playing people (native-nations.md T11, Beta 3 step 4), in a game where one
   * plays: for a people, every European nation and every other people it has met; for a nation,
   * every playing people. Each row has war or peace, the standing in words from the viewer's side,
   * the treaties in force (each can be ended, breaking faith), a proposal waiting for an answer,
   * and a Propose button per kind with its reason in the title.
   */
  private pairCard(): HTMLElement | null {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    if (!anyPlayingPeople(s) || !peopleTreatiesOn(s)) return null;
    const amPeople = isPeoplePlayer(me);
    const ids: PlayerId[] = [];
    for (const p of s.players) {
      if (p.id === me.id || p.finished) continue;
      if (amPeople ? systemsOf(p).peoples || isPeoplePlayer(p) : isPeoplePlayer(p)) ids.push(p.id);
    }
    if (amPeople) for (const t of s.tribes) if (!ids.includes(t.id) && t.id !== me.id && standingOf(s, me.id, t.id)) ids.push(t.id);
    if (!ids.length) return null;
    const row = (id: PlayerId) => {
      const player = s.players.find((p) => p.id === id);
      const war = pairAtWar(s, me.id, id);
      const inForce = pairTreaties(s, me.id, id);
      const pending = standingOf(s, me.id, id)?.proposal;
      const theirs = pending?.by === id;
      const name = sideName(s, id);
      const buttons: (HTMLElement | null)[] = [];
      if (player) {
        if (war) buttons.push(h('button', { class: 'btn tiny', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'proposePeace', nation: id }) }, 'Propose peace'));
        else buttons.push(h('button', { class: 'btn tiny', disabled: !app.isMyTurn(), onclick: () => void this.war(id) }, 'Declare war'));
      }
      if (!war) {
        for (const kind of pairKinds(s, me.id, id)) {
          if (inForce.some((t) => t.kind === kind)) continue;
          const why = pairTreatyProblem(s, me.id, id, kind);
          buttons.push(h('button', { class: 'btn tiny', 'data-action': `propose-pair-${kind}`, disabled: !!why || !app.isMyTurn(), title: why ?? `Offer ${name} ${peopleTreatyText(kind)}: ${pairBenefits(s, me.id, id, kind)}.`, onclick: () => app.dispatch({ type: 'proposePairTreaty', to: id, kind }) }, `Propose ${peopleTreatyText(kind).replace(/^an? /, '')}`));
        }
      }
      for (const t of inForce) {
        const kind = t.kind as PeopleTreatyKind;
        buttons.push(h('button', { class: 'btn tiny', disabled: !app.isMyTurn(), onclick: () => void this.endPair(id, kind) }, `End ${treatyName(t).toLowerCase()}`));
      }
      return h('li', { class: 'nation-relation', 'data-pair': id },
        h('div', { class: 'nation-head' },
          h('strong', null, h('span', { class: 'flag', style: `background:${player ? nationOf(s, id).color : TRIBES[id as TribeId].color}` }), ' ', name.replace(/^the /, 'The ')),
          h('span', { class: 'muted small' }, player ? (player.human ? 'player' : AI_LEVEL_INFO[player.ai ?? 'naive'].name) : 'not played'),
          h('span', { class: `pill ${war ? 'bad' : 'good'}` }, war ? 'At war' : 'At peace')),
        h('div', { class: 'relation-facts small' },
          h('span', { class: 'pill' }, pairStanding(s, me.id, id)),
          h('span', null, inForce.length ? inForce.map((t) => treatyName(t)).join(', ') : 'No treaties')),
        pending && !theirs ? h('p', { class: 'muted small' }, `Your proposal of ${peopleTreatyText(pending.kind)} is waiting for an answer.`) : null,
        theirs ? h('div', { class: 'proposal row wrap' },
          h('span', { class: 'small' }, `${name.replace(/^the /, 'The ')} propose ${peopleTreatyText(pending!.kind)}.`),
          h('button', { class: 'btn tiny primary', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'answerPairProposal', from: id, accept: true }) }, 'Accept'),
          h('button', { class: 'btn tiny', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'answerPairProposal', from: id, accept: false }) }, 'Turn down')) : null,
        h('div', { class: 'row wrap nation-actions' }, buttons));
    };
    return h('div', { class: 'card pairs' },
      h('h3', null, amPeople ? 'Nations and peoples' : 'Native nations'),
      h('ul', { class: 'nation-relations' }, ids.map(row)),
      amPeople ? this.leagueBlock() : null,
      h('p', { class: 'muted small' }, amPeople
        ? 'After years of good relations and trade, you may make a trade treaty with a European nation, then land use, a cultural exchange and a mutual defence pact; with another people a trade treaty and a mutual defence pact. Ending a treaty, or going to war, breaks faith: trust is slow to come back.'
        : 'A people that plays as a nation makes treaties itself: you propose and it answers, or it proposes to you. Ending a treaty, or going to war, breaks faith.'));
  }

  /**
   * A playing people's league (native-nations.md T14's confederacy, peopleleague.ts): its league and
   * a way to leave it or invite a pact partner, or a proposal of a new league to its pact partners
   * and theirs, and a proposal waiting for its answer.
   */
  private leagueBlock(): HTMLElement | null {
    const app = this.app;
    const s = app.state;
    const me = app.me;
    if (!leaguesOn(s)) return null;
    const pacts = (id: PlayerId): PlayerId[] => {
      const out: PlayerId[] = [];
      for (const t of s.treaties ?? []) {
        if (t.end || t.kind !== 'defence' || !t.parties.some((p) => p.id === id)) continue;
        for (const p of t.parties) if (p.id !== id && p.kind === 'people' && !out.includes(p.id)) out.push(p.id);
      }
      return out;
    };
    const names = (ids: readonly PlayerId[]) => ids.map((id) => sideName(s, id)).join(', ');
    const own = leagueOf(s, me.id);
    const partners = pacts(me.id).filter((id) => !leagueOf(s, id));
    const parts: (HTMLElement | null)[] = [h('h4', null, 'League of peoples')];
    const waiting = leagueProposalFor(s, me.id);
    if (waiting) {
      parts.push(h('div', { class: 'proposal row wrap' },
        h('span', { class: 'small' }, `${sideName(s, waiting.by).replace(/^the /, 'The ')} propose ${waiting.league ? 'that you join their league' : `a league with ${names([waiting.by, ...waiting.peoples].filter((id) => id !== me.id))}`}.`),
        h('button', { class: 'btn tiny primary', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'answerLeague', by: waiting.by, accept: true }) }, 'Accept'),
        h('button', { class: 'btn tiny', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'answerLeague', by: waiting.by, accept: false }) }, 'Turn down')));
    }
    if (own) {
      parts.push(h('p', { class: 'small' }, `In a league with ${names(leagueMembers(own).filter((id) => id !== me.id))} since ${formatDate(own.start, calendarOf(s))}.`));
      const buttons = partners.map((id) => {
        const why = leagueProblem(s, me.id, [id]);
        return h('button', { class: 'btn tiny', disabled: !!why || !app.isMyTurn(), title: why ?? `Invite ${sideName(s, id)} into the league.`, onclick: () => app.dispatch({ type: 'proposeLeague', peoples: [id] }) }, `Invite ${sideName(s, id)}`);
      });
      buttons.push(h('button', { class: 'btn tiny', disabled: !app.isMyTurn(), onclick: () => app.dispatch({ type: 'leaveLeague' }) }, 'Leave the league'));
      parts.push(h('div', { class: 'row wrap nation-actions' }, buttons));
    } else {
      const ask = [...partners];
      for (const id of partners) for (const o of pacts(id)) if (o !== me.id && !ask.includes(o) && !leagueOf(s, o)) ask.push(o);
      const why = ask.length ? leagueProblem(s, me.id, ask) : 'A league is made with the peoples you hold mutual defence pacts with, and theirs: you hold none.';
      parts.push(h('button', { class: 'btn tiny', disabled: !!why || !app.isMyTurn(), title: why ?? `Propose a league with ${names(ask)}.`, onclick: () => app.dispatch({ type: 'proposeLeague', peoples: ask }) }, ask.length ? `Propose a league with ${names(ask)}` : 'Propose a league'));
    }
    parts.push(h('p', { class: 'muted small' }, 'Three or more peoples at peace with each other, each with a mutual defence pact with one of them and in good standing with all, may join in a league. A league that holds for long, its peoples keeping their homelands, wins together at the end.'));
    return h('div', { class: 'league' }, parts);
  }

  private async endPair(other: PlayerId, kind: PeopleTreatyKind): Promise<void> {
    const s = this.app.state;
    if (await confirmDialog(`End ${peopleTreatyText(kind)}?`, `Ending ${peopleTreatyText(kind)} with ${sideName(s, other)} breaks faith: no new treaty between you for years, and they will distrust you for longer.`, 'End it', 'Keep it')) {
      this.app.dispatch({ type: 'endPairTreaty', with: other, kind });
    }
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
    // A playing people is bound as a people party (partyBinds reads either kind).
    const mine = current.filter((t) => partyBinds(t, me));
    const others = current.filter((t) => !partyBinds(t, me));
    const past = all.filter((t) => t.end && partyBinds(t, me)).reverse().slice(0, 8);
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

  private async cancelTrade(nation: PlayerId): Promise<void> {
    if (await confirmDialog('End the trade agreement?', `Your trade routes will no longer call at ${nationOf(this.app.state, nation).adjective} colonies, and theirs not at yours.`, 'End it', 'Keep trading')) {
      this.app.dispatch({ type: 'cancelTrade', nation });
    }
  }

  private async cancelFavoured(p: Player): Promise<void> {
    const people = p.human && this.app.me.human;
    const text = `Cancelling ends the trade agreement and every trade route between you. All goods carried by either side's ships and wagon trains next to the other's colonies are seized.${people ? ' Between two players there is no waiting period: you can agree again at once.' : ` Relations with ${nationOf(this.app.state, p.id).name} will stay hostile for years, and no new agreement will be possible for a long time.`}`;
    if (await confirmDialog('Cancel Favoured Nation status?', text, 'Cancel it', 'Keep it')) this.app.dispatch({ type: 'cancelFavoured', nation: p.id });
  }

  private async confederate(nation: PlayerId): Promise<void> {
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

  private async war(nation: PlayerId): Promise<void> {
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
