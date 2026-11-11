/**
 * Treaties between European nations (docs/design/cooperation.md, step 0 and C9): one record shape
 * for every agreement, with its kind, parties, start and end. Trade agreements and Favoured Nation
 * status are treaties; their rules stay in relations.ts.
 *
 * `GameState.treaties` is written only when the first treaty is made, and keeps past treaties
 * (with `end` set) after those in force, in the order they were made. Lookups scan the list, which
 * stays short (a few dozen treaties in a long game).
 */
import type { NationId } from './rules/nations.js';
import { calendarOf, formatDate, nationOf } from './scenarios/index.js';
import type { GameState, Treaty, TreatyEnd, TreatyKind, TreatyTerms } from './types.js';

/** Whether a nation is a party to the treaty. */
export function bound(t: Treaty, nation: NationId): boolean {
  for (const p of t.parties) if (p.kind === 'nation' && p.id === nation) return true;
  return false;
}

/** The nations that are parties to the treaty. */
export function treatyNations(t: Treaty): NationId[] {
  return t.parties.filter((p) => p.kind === 'nation').map((p) => p.id);
}

/** Every treaty, in force and past, in the order made. */
export function allTreaties(s: GameState): readonly Treaty[] {
  return s.treaties ?? [];
}

/** Whether a treaty is in force. */
export function inForce(t: Treaty): boolean {
  return !t.end;
}

/** The treaty of this kind in force between two nations, if any. */
export function treatyBetween(s: GameState, kind: TreatyKind, a: NationId, b: NationId): Treaty | undefined {
  const list = s.treaties;
  if (!list) return undefined;
  for (const t of list) if (!t.end && t.kind === kind && bound(t, a) && bound(t, b)) return t;
  return undefined;
}

/** The treaties in force that bind a nation (all of them without `nation`), in the order made. */
export function treatiesInForce(s: GameState, nation?: NationId): Treaty[] {
  return allTreaties(s).filter((t) => !t.end && (!nation || bound(t, nation)));
}

/** Makes a treaty in force from now. */
export function addTreaty(s: GameState, kind: TreatyKind, parties: NationId[], terms?: TreatyTerms): Treaty {
  const list = (s.treaties = s.treaties ?? []);
  const t: Treaty = { id: `t${list.length + 1}`, kind, parties: parties.map((id) => ({ kind: 'nation', id })), start: s.turn };
  if (terms) t.terms = terms;
  list.push(t);
  return t;
}

/** Ends a treaty now. */
export function endTreaty(s: GameState, t: Treaty, why: TreatyEnd['why'], by?: NationId): void {
  t.end = by ? { turn: s.turn, why, by } : { turn: s.turn, why };
}

const TREATY_NAME: Record<TreatyKind, string> = { trade: 'Trade agreement', favoured: 'Favoured Nation status', alliance: 'Alliance', confederation: 'Confederation' };

/** The treaty's name for the diplomacy screen ("Trade agreement"). */
export function treatyName(t: Treaty): string {
  return TREATY_NAME[t.kind];
}

/** One line for the diplomacy screen: its parties, when it was made and, for a past treaty, how it ended. */
export function describeTreaty(s: GameState, t: Treaty): string {
  const cal = calendarOf(s);
  const names = treatyNations(t).map((n) => nationOf(s, n).name);
  const who = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
  if (!t.end) return `${who}, since ${formatDate(t.start, cal)}`;
  const how = t.end.why === 'war' ? 'ended by war' : t.end.why === 'lapsed' ? 'lapsed' : t.end.why === 'left' ? 'left' : t.end.why === 'concluded' ? 'its war over' : 'cancelled';
  return `${who}, ${formatDate(t.start, cal)} to ${formatDate(t.end.turn, cal)}, ${how}${t.end.by && t.end.why !== 'lapsed' ? ` by ${nationOf(s, t.end.by).name}` : ''}`;
}
