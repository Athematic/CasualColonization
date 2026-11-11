/**
 * Founding chartered companies, buying shares and paying dividends (companies.ts has the rules
 * and queries; docs/design/cooperation.md, step 3).
 */
import { companiesOn, companyCharters, companyRules, isCompany, isNation, sharesIn } from './companies.js';
import { fail } from './errors.js';
import { randomImmigrant } from './europe.js';
import { newPlayer } from './game.js';
import { noteHistory } from './history.js';
import { placeOnMap } from './movement.js';
import { colonyWorkers, createUnit, message, player } from './queries.js';
import type { NationId } from './rules/nations.js';
import { calendarOf, nationOf, nationTitle, term, yearOf } from './scenarios/index.js';
import { track } from './telemetry.js';
import type { GameState, Player } from './types.js';
import { ownedUnitsView } from './unitindex.js';

/** Why `nation` cannot found the company now, or null. */
export function foundProblem(s: GameState, nation: NationId, id: NationId): string | null {
  if (!companiesOn(s)) return 'There are no chartered companies in this scenario.';
  const entry = companyCharters(s).find((c) => c.id === id);
  if (!entry) return 'There is no such company.';
  if (s.players.some((p) => p.id === id)) return `${nationTitle(s, id)} has already been founded.`;
  const p = player(s, nation);
  if (!isNation(p)) return 'Only a nation can found a company.';
  if (p.independence !== 'none') return `Companies are chartered by a Crown; ${nationOf(s, nation).name} has declared independence.`;
  // The nations that historically chartered it; when none of them takes part, any nation may.
  const founders = entry.founders.filter((n) => s.players.some((o) => o.id === n));
  if (founders.length && !founders.includes(nation)) return `Only ${founders.map((n) => nationOf(s, n).name).join(' or ')} may charter ${entry.name}.`;
  if (entry.from !== undefined && yearOf(s.turn, calendarOf(s)).year < entry.from) return `${nationTitle(s, id)} cannot be chartered before ${entry.from}.`;
  const capital = companyRules(s).capital;
  if (p.gold < capital) return `Founding ${entry.name} needs ${capital} gold.`;
  return null;
}

/**
 * `nation` founds a company: it pays the capital, which is the company's treasury, and holds the
 * founding shares. The company arrives with a caravel, two colonists and a soldier at the founder's
 * point of arrival, knows what the founder has explored, and settles on its own.
 */
export function foundCompany(s: GameState, nation: NationId, id: NationId): string {
  const problem = foundProblem(s, nation, id);
  if (problem) fail(problem);
  const rules = companyRules(s);
  const founder = player(s, nation);
  const entry = companyCharters(s).find((c) => c.id === id)!;
  founder.gold -= rules.capital;
  const co = newPlayer(s, id, false, { ...founder.entry });
  co.kind = 'company';
  co.ai = 'competent';
  co.gold = rules.capital;
  co.company = { shares: { [nation]: rules.foundingShares }, founder: nation, founded: s.turn, lastDividend: s.turn, paid: 0 };
  co.explored = [...founder.explored];
  s.players.push(co);
  co.recruitPool = [randomImmigrant(s, id), randomImmigrant(s, id), randomImmigrant(s, id)];
  const { x, y } = co.entry;
  const ship = createUnit(s, id, 'caravel', { kind: 'map', x, y });
  placeOnMap(s, ship, x, y);
  const aboard = () => ({ kind: 'carrier' as const, carrierId: ship.id });
  const soldier = createUnit(s, id, 'veteranSoldier', aboard());
  soldier.role = 'soldier';
  for (let i = 0; i < 2; i++) createUnit(s, id, 'freeColonist', aboard());
  for (const u of ownedUnitsView(s, id)) if (u.loc.kind === 'carrier') u.state = 'sentry';
  track(nation, 'company:founded');
  const text = `${nationTitle(s, nation)} charters ${entry.name} with ${rules.capital} gold. Its first ship sails for ${term(s, 'colonyLand')}.`;
  message(s, text);
  noteHistory(s, 'company', [nation, id], `${nationTitle(s, nation)} charters ${entry.name}.`);
  return text;
}

/**
 * The price of one new share: the company's worth (its gold, and 100 gold for each of its
 * colonists) per share, and at least `sharePrice`.
 */
export function sharePrice(s: GameState, co: Player): number {
  const { total } = sharesIn(co, co.id);
  let colonists = 0;
  for (const c of Object.values(s.colonies)) if (c.owner === co.id) colonists += colonyWorkers(s, c).length;
  const worth = Math.max(0, co.gold) + 100 * colonists;
  return Math.max(companyRules(s).sharePrice, total ? Math.round(worth / total) : 0);
}

/** Why `nation` cannot buy `count` shares in the company now, or null. */
export function sharesProblem(s: GameState, nation: NationId, id: NationId, count: number): string | null {
  if (!companiesOn(s)) return 'There are no chartered companies in this scenario.';
  const co = s.players.find((p) => p.id === id);
  if (!co || !isCompany(co)) return 'There is no such company.';
  const p = player(s, nation);
  if (!isNation(p)) return 'Only a nation can buy shares.';
  if (!Number.isInteger(count) || count < 1 || count > 20) return 'Buy between 1 and 20 shares at a time.';
  const cost = sharePrice(s, co) * count;
  if (p.gold < cost) return `${count} share${count > 1 ? 's' : ''} cost ${cost} gold.`;
  return null;
}

/** `nation` buys new shares in a company; the gold goes into the company's treasury. */
export function buyShares(s: GameState, nation: NationId, id: NationId, count: number): string {
  const problem = sharesProblem(s, nation, id, count);
  if (problem) fail(problem);
  const co = player(s, id);
  const cost = sharePrice(s, co) * count;
  player(s, nation).gold -= cost;
  co.gold += cost;
  const shares = co.company!.shares;
  shares[nation] = (shares[nation] ?? 0) + count;
  track(nation, 'company:shares bought', count);
  const text = `${nationTitle(s, nation)} buys ${count} share${count > 1 ? 's' : ''} in ${nationOf(s, id).name} for ${cost} gold.`;
  message(s, text, nation);
  if (nation !== co.company!.founder) message(s, text, co.company!.founder);
  return text;
}

/**
 * Once per round: each company due a dividend pays `payout` of its gold above `reserve` to its
 * shareholders, in proportion to their shares (whole gold, the remainder stays with the company).
 * A shareholder that is no longer taking part gets nothing.
 */
export function processCompanies(s: GameState): void {
  const rules = companyRules(s);
  for (const co of s.players) {
    const book = co.company;
    if (!book || s.turn - book.lastDividend < rules.dividendEvery) continue;
    book.lastDividend = s.turn;
    const pool = Math.floor(Math.max(0, co.gold - rules.reserve) * rules.payout);
    if (pool <= 0) continue;
    const { total } = sharesIn(co, co.id);
    let paid = 0;
    for (const [nation, n] of Object.entries(book.shares) as [NationId, number][]) {
      const holder = s.players.find((p) => p.id === nation);
      if (!holder || !n) continue;
      const gold = Math.floor((pool * n) / total);
      if (gold <= 0) continue;
      holder.gold += gold;
      paid += gold;
      track(nation, 'company:dividend', gold);
      message(s, `${nationTitle(s, co.id)} pays a dividend: ${gold} gold for your ${n} share${n > 1 ? 's' : ''}.`, nation);
    }
    co.gold -= paid;
    book.paid += paid;
  }
}

