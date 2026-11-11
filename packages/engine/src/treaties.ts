/**
 * Treaties (docs/design/cooperation.md, step 0 and C9; native-partners.md, N1): one record shape
 * for every agreement, with its kind, parties, start and end. Trade agreements and Favoured Nation
 * status are treaties; their rules stay in relations.ts.
 *
 * A party is a European nation or a native people (`TreatyParty`). Code reads parties only through
 * the helpers below, so that when a people becomes a player of its own (Simon's direction on N1)
 * the helpers change, not every call site. European treaties bind nations only; a treaty with a
 * people binds one nation and one people.
 *
 * `GameState.treaties` is written only when the first treaty is made, and keeps past treaties
 * (with `end` set) after those in force, in the order they were made. Lookups scan the list, which
 * stays short (a few dozen treaties in a long game).
 */
import { TRIBES, type NationId, type TribeId } from './rules/nations.js';
import { calendarOf, formatDate, nationOf } from './scenarios/index.js';
import type { GameState, Treaty, TreatyEnd, TreatyKind, TreatyParty, TreatyTerms } from './types.js';

type NationParty = Extract<TreatyParty, { kind: 'nation' }>;
type PeopleParty = Extract<TreatyParty, { kind: 'people' }>;

/** Whether a party is a European nation. */
export function partyIsNation(p: TreatyParty): p is NationParty {
  return p.kind === 'nation';
}

/** Whether a party is a native people. */
export function partyIsPeople(p: TreatyParty): p is PeopleParty {
  return p.kind === 'people';
}

/** A nation as a party. */
export function nationParty(id: NationId): TreatyParty {
  return { kind: 'nation', id };
}

/** A people as a party. */
export function peopleParty(id: TribeId): TreatyParty {
  return { kind: 'people', id };
}

/** Whether two parties are the same nation or people. */
export function sameParty(a: TreatyParty, b: TreatyParty): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** A party's name: the nation's ("France") or the people's, with its article ("the Kalinago"). */
export function partyName(s: GameState, p: TreatyParty): string {
  return partyIsPeople(p) ? `the ${TRIBES[p.id].name}` : nationOf(s, p.id).name;
}

/** Whether a nation is a party to the treaty. */
export function bound(t: Treaty, nation: NationId): boolean {
  for (const p of t.parties) if (p.kind === 'nation' && p.id === nation) return true;
  return false;
}

/** Whether a people is a party to the treaty. */
export function boundPeople(t: Treaty, people: TribeId): boolean {
  for (const p of t.parties) if (p.kind === 'people' && p.id === people) return true;
  return false;
}

/** The nations that are parties to the treaty, in the order of its parties. */
export function treatyNations(t: Treaty): NationId[] {
  const out: NationId[] = [];
  for (const p of t.parties) if (partyIsNation(p)) out.push(p.id);
  return out;
}

/** The peoples that are parties to the treaty (none for a treaty between European nations). */
export function treatyPeoples(t: Treaty): TribeId[] {
  const out: TribeId[] = [];
  for (const p of t.parties) if (partyIsPeople(p)) out.push(p.id);
  return out;
}

/** Whether a people is among the treaty's parties: a treaty with a people rather than between nations. */
export function withPeople(t: Treaty): boolean {
  return t.parties.some(partyIsPeople);
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

/** Makes a treaty in force from now. A party given as a bare id is a nation. */
export function addTreaty(s: GameState, kind: TreatyKind, parties: readonly (NationId | TreatyParty)[], terms?: TreatyTerms): Treaty {
  const list = (s.treaties = s.treaties ?? []);
  const t: Treaty = { id: `t${list.length + 1}`, kind, parties: parties.map((p) => (typeof p === 'string' ? nationParty(p) : { ...p })), start: s.turn };
  if (terms) t.terms = terms;
  list.push(t);
  return t;
}

/** Ends a treaty now. */
export function endTreaty(s: GameState, t: Treaty, why: TreatyEnd['why'], by?: NationId): void {
  t.end = by ? { turn: s.turn, why, by } : { turn: s.turn, why };
}

const TREATY_NAME: Record<TreatyKind, string> = {
  trade: 'Trade agreement',
  favoured: 'Favoured Nation status',
  alliance: 'Alliance',
  confederation: 'Confederation',
  'people-trade': 'Trade treaty',
  'land-use': 'Land use',
  exchange: 'Cultural exchange',
  defence: 'Mutual defence',
};

/** The treaty's name for the diplomacy screen ("Trade agreement"). */
export function treatyName(t: Treaty): string {
  return TREATY_NAME[t.kind];
}

/** One line for the diplomacy screen: its parties, when it was made and, for a past treaty, how it ended. */
export function describeTreaty(s: GameState, t: Treaty): string {
  const cal = calendarOf(s);
  const names = t.parties.map((p) => partyName(s, p));
  const who = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
  if (!t.end) return `${who}, since ${formatDate(t.start, cal)}`;
  const how = t.end.why === 'war' ? 'ended by war' : t.end.why === 'lapsed' ? 'lapsed' : t.end.why === 'left' ? 'left' : t.end.why === 'concluded' ? 'its war over' : 'cancelled';
  return `${who}, ${formatDate(t.start, cal)} to ${formatDate(t.end.turn, cal)}, ${how}${t.end.by && t.end.why !== 'lapsed' ? ` by ${nationOf(s, t.end.by).name}` : ''}`;
}
