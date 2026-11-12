/**
 * Chartered companies (docs/design/cooperation.md, Beta 1 step 3; C1, C2). A company is a third
 * party, like the Hudson's Bay Company, the Dutch West India Company or the Darien Company: a
 * `Player` with `kind: 'company'` that owns its own colonies and ships, played by its own simple
 * computer profile (ai/index.ts). It has no Crown: no taxes, boycotts, demands, royal wars, Royal
 * Expeditionary Force, independence or Congress. Nobody makes war on it and it makes war on nobody
 * (it trades and settles); natives treat it as any European.
 *
 * A nation founds a company from the scenario's `nations.companies` by paying its capital, which
 * becomes the company's treasury and buys the founder its first shares. Any nation may then buy
 * more shares, at the company's worth per share (and at least `sharePrice`); the gold goes to the
 * company. Every `dividendEvery` turns the company pays out `payout` of its gold above `reserve`
 * to its shareholders in proportion to their shares. A company cannot win: its score counts for
 * its shareholders in proportion to their shares (score.ts).
 *
 * This module holds the light queries (imported widely); founding, shares and dividends are in
 * chartered.ts. Everything here is switched by `mechanics.companies`; the numbers are the scenario's
 * `companyRules` over COMPANY_RULES. Company players exist only once founded, so a game without
 * companies is not touched.
 */
import type { PlayerId } from './rules/nations.js';
import { playerKind } from './playerkind.js';
import { mechanicsOf, scenarioOf } from './scenarios/index.js';
import type { CompanyEntry, CompanyRules } from './scenarios/types.js';
import type { GameState, Player } from './types.js';

/** The engine's company rules; a scenario's `companyRules` is merged over them. */
export const COMPANY_RULES: CompanyRules = {
  capital: 2000,
  foundingShares: 20,
  sharePrice: 100,
  dividendEvery: 10,
  reserve: 800,
  payout: 0.5,
};

/** The game's company rules: the scenario's over the engine's. */
export function companyRules(s: GameState): CompanyRules {
  const own = scenarioOf(s).companyRules;
  return own ? { ...COMPANY_RULES, ...own } : COMPANY_RULES;
}

/** Whether the scenario has chartered companies. */
export function companiesOn(s: GameState): boolean {
  return !!mechanicsOf(s).companies;
}

/** The companies the scenario offers, founded or not. */
export function companyCharters(s: GameState): readonly CompanyEntry[] {
  return companiesOn(s) ? scenarioOf(s).nations.companies ?? [] : [];
}

/** Whether a player is a chartered company. */
export function isCompany(p: Player | undefined): boolean {
  return !!p && playerKind(p) === 'company';
}


/** A European nation: neither the Crown nor a company (nor a playing people). */
export function isNation(p: Player): boolean {
  return playerKind(p) === 'nation';
}

/** The companies taking part (founded so far), in the order founded. */
export function companies(s: GameState): Player[] {
  return s.players.filter(isCompany);
}

/** Shares a nation holds in a company, and all the company's shares. */
export function sharesIn(co: Player, nation: PlayerId): { held: number; total: number } {
  const shares = co.company?.shares ?? {};
  let total = 0;
  for (const n of Object.values(shares)) total += n ?? 0;
  return { held: shares[nation] ?? 0, total };
}

/** A nation's part of a company's score: its share of the shares, times the company's score. */
export function companyScoreShare(co: Player, nation: PlayerId, companyScore: number): number {
  const { held, total } = sharesIn(co, nation);
  return total ? (companyScore * held) / total : 0;
}
