/**
 * The "Ways to win" report (Beta 3 step 10): the scenario's ways to win in the order they are
 * judged, and where the player stands on each: for a playing people continuity, a good life, a
 * league of peoples and the military victory (native-nations.md T14), for a nation independence
 * and the end year. Then the player's score, line by line: a people's own lines (people, homeland,
 * the land, stores, treaties, trust, council) or a nation's.
 */
import {
  calendarOf,
  continuityStanding,
  europeansDefeated,
  formatDate,
  getVictory,
  goodLifeStanding,
  isPeoplePlayer,
  leagueMembers,
  leagueOf,
  lastTurn,
  orderedVictory,
  scoreBreakdown,
  sideName,
  yearOf,
  type ContinuityCondition,
  type GoodLifeCondition,
} from '@cc/engine';
import { h, type Child } from '../dom.js';
import type { ReportContext } from './reports.js';

const CONTINUITY_WORDS: Record<ContinuityCondition, string> = {
  town: 'no town stands on your homeland',
  homeland: 'too little of your homeland is kept',
  land: 'the land of your homeland is not whole enough',
  people: 'your people are fewer than at the start',
  submitted: 'you have submitted to a nation',
  'towns taken': 'a town of yours is held by another',
  council: 'your council has too few members',
};

const GOOD_LIFE_WORDS: Record<GoodLifeCondition, string> = {
  stores: 'a town holds less than its reserve of food',
  hunger: 'a town went hungry too recently',
  land: 'the land of your homeland is not whole enough',
  peace: 'you have been at war too recently',
  faith: 'you broke a treaty too recently',
  treaties: 'too few of those you have met hold a treaty with you',
};

/** A sentence from a list of reasons. */
function because(list: string[]): string {
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Where the viewer stands on one way to win, in words; null when there is nothing to say. */
function standing(ctx: ReportContext, id: string, params: Record<string, unknown>): { ok: boolean; text: string } | null {
  const s = ctx.app.state;
  const me = s.players.find((p) => p.id === ctx.nation);
  if (!me) return null;
  const people = isPeoplePlayer(me);
  switch (id) {
    case 'continuity': {
      if (!people) return null;
      const c = continuityStanding(s, me.id, params);
      const detail = `${Math.round(c.kept * 100)}% of your homeland kept; ${c.people} people against ${c.start} at the start.`;
      return c.fails.length ? { ok: false, text: `Not yet: ${because(c.fails.map((f) => CONTINUITY_WORDS[f]))}. ${detail}` } : { ok: true, text: `You would win this way now. ${detail}` };
    }
    case 'good-life': {
      if (!people) return null;
      const g = goodLifeStanding(s, me.id, params);
      const detail = `Treaties with ${g.partners} of the ${g.met} nations and peoples you have met (${g.needed} needed).`;
      return g.fails.length ? { ok: false, text: `Not yet: ${because(g.fails.map((f) => GOOD_LIFE_WORDS[f]))}. ${detail}` } : { ok: true, text: `You would win this way now. ${detail}` };
    }
    case 'confederacy': {
      if (!people) return null;
      const league = leagueOf(s, me.id);
      if (!league) return { ok: false, text: 'You belong to no league of peoples. Foreign affairs is where one is proposed.' };
      const members = leagueMembers(league);
      const years = yearOf(s.turn, calendarOf(s)).year - yearOf(league.start, calendarOf(s)).year;
      return { ok: members.length >= Number(params.members ?? 3), text: `In a league with ${members.filter((m) => m !== me.id).map((m) => sideName(s, m)).join(', ')} for ${years} year${years === 1 ? '' : 's'}.` };
    }
    case 'military': {
      if (!people) return null;
      if (s.arrivals?.length) return { ok: false, text: 'Not every European nation has arrived yet.' };
      return europeansDefeated(s) ? { ok: true, text: 'No European nation holds a colony or land units on the map.' } : { ok: false, text: 'European nations still hold colonies or land units on the map.' };
    }
    case 'independence-war':
      return people ? { ok: false, text: 'For the European nations only.' } : me.independence === 'won' ? { ok: true, text: 'Won.' } : null;
    case 'time':
      return people ? { ok: false, text: 'Judges the European nations by score; a people does not win by score.' } : null;
    default:
      return people ? { ok: false, text: 'For the European nations.' } : null;
  }
}

export function victoryTab(ctx: ReportContext): Child[] {
  const s = ctx.app.state;
  const me = s.players.find((p) => p.id === ctx.nation);
  const end = formatDate(lastTurn(calendarOf(s)), calendarOf(s));
  const rows = orderedVictory(s).map((rule) => {
    const kind = getVictory(rule.id);
    const st = standing(ctx, rule.id, rule.params ?? {});
    return h('li', { class: 'victory-way', 'data-way': rule.id },
      h('strong', null, kind?.name ?? rule.id),
      kind?.immediate ? h('span', { class: 'muted small' }, ' (ends the game at once)') : null,
      st ? h('div', { class: st.ok ? 'good-text small' : 'muted small' }, st.text) : null);
  });
  const breakdown = me ? scoreBreakdown(s, me) : undefined;
  return [
    h('section', { class: 'card report-card' },
      h('h3', null, 'Ways to win'),
      h('p', { class: 'muted small' }, `Judged in this order. The game ends in ${end}, unless a way that ends it at once comes first; at the end every player is judged once, by the first way that names it, and several can win together.`),
      h('ol', { class: 'victory-ways' }, rows)),
    breakdown
      ? h('section', { class: 'card report-card' },
          h('h3', null, me && isPeoplePlayer(me) ? 'Your score (compared among peoples)' : 'Your score'),
          h('table', { class: 'table report-table' },
            h('tbody', null,
              breakdown.lines.map((l) => h('tr', null, h('td', null, l.label), h('td', { class: 'num muted' }, `${l.value} ${l.unit}`), h('td', { class: 'num' }, String(l.points)))),
              h('tr', null, h('th', null, 'Total'), h('td', null), h('th', { class: 'num' }, String(breakdown.total))))))
      : null,
  ];
}
