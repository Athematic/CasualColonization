/**
 * Records for the advisor reports: a compact chronological history of notable events, and a
 * ledger of goods sold and delivered. Both are optional GameState fields (older saves start
 * recording when loaded) and change nothing in the rules. This module imports only types so
 * that any rule module can call it without import cycles.
 */
import type { GoodId } from './rules/goods.js';
import type { NationId } from './rules/nations.js';
import type { GameState, GoodsTally, HistoryEntry, HistoryKind, Ledger } from './types.js';

/** The oldest entries are dropped beyond this many (about 80 bytes each in a save). */
export const MAX_HISTORY = 800;

/**
 * Appends one event to the game's history. `nations` are the nations it concerns (the first is
 * the one that acted); `secret` limits it to them, otherwise every nation hears of it.
 */
export function noteHistory(
  s: GameState,
  kind: HistoryKind,
  nations: NationId[],
  text: string,
  opts: { secret?: boolean; at?: { x: number; y: number } } = {},
): void {
  const list = (s.history ??= []);
  const entry: HistoryEntry = { turn: s.turn, kind, nations: nations.filter((n) => n !== 'crown'), text };
  if (opts.secret) entry.secret = true;
  if (opts.at) entry.at = { x: opts.at.x, y: opts.at.y };
  list.push(entry);
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
}

/** The history a nation knows of, oldest first; without a nation, everything (observers). */
export function historyFor(s: GameState, nation?: NationId): HistoryEntry[] {
  const list = s.history ?? [];
  if (!nation) return [...list];
  return list.filter((e) => !e.secret || e.nations.includes(nation));
}

export type LedgerChannel = keyof GoodsTally;

function emptyTally(): GoodsTally {
  return { europe: {}, custom: {}, route: {}, foreign: {} };
}

function ledgerOf(s: GameState, nation: NationId): Ledger {
  const all = (s.ledger ??= {});
  const l = (all[nation] ??= { total: emptyTally(), turn: s.turn, now: emptyTally(), last: emptyTally() });
  if (l.turn !== s.turn) {
    // A new turn: what was "this turn" becomes "last turn" if it was the turn just before.
    l.last = l.turn === s.turn - 1 ? l.now : emptyTally();
    l.now = emptyTally();
    l.turn = s.turn;
  }
  return l;
}

/**
 * Notes goods a nation sold or delivered: `europe` for sales in a home port market (custom house
 * sales included), `custom` for the custom house share of those, `route` for goods trade routes
 * unloaded in the nation's own colonies, `foreign` for goods sold at a trade partner's colony.
 */
export function noteGoods(s: GameState, nation: NationId, channel: LedgerChannel, good: GoodId, amount: number): void {
  if (amount <= 0 || nation === 'crown') return;
  const l = ledgerOf(s, nation);
  for (const t of [l.total, l.now]) t[channel][good] = (t[channel][good] ?? 0) + amount;
}

/** A nation's tallies: over the game, this turn and last turn. Empty when nothing was recorded. */
export function ledgerFor(s: GameState, nation: NationId): { total: GoodsTally; now: GoodsTally; last: GoodsTally } {
  const l = s.ledger?.[nation];
  if (!l) return { total: emptyTally(), now: emptyTally(), last: emptyTally() };
  if (l.turn === s.turn) return { total: l.total, now: l.now, last: l.last };
  return { total: l.total, now: emptyTally(), last: l.turn === s.turn - 1 ? l.now : emptyTally() };
}
