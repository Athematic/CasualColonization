/**
 * Confederation (docs/design/cooperation.md, Beta 1 step 5; C7): allied nations whose colonies
 * declare independence together. They declare on the same turn, as one confederation (a treaty of
 * kind 'confederation'); each faces its own Royal Expeditionary Force, but the war is one:
 * independence.ts counts it won once every member's royal troops are beaten, and lost once the
 * members together hold half the colonies they held or fewer, and the outcome is the same for all
 * of them. A won war makes all members the winners (victory.ts), best score first.
 *
 * It is mainly for people (Simon): a person allied with a computer nation proposes it, and the
 * computer nation answers by its usual readiness for independence (the judge the computer players
 * register, ai/index.ts). Computer nations start one only rarely: both must be ready on the same
 * review, and then at the scenario's `ai.cooperation.confederation` chance.
 *
 * Switched by `mechanics.confederation` (with `alliances` and `independence`).
 */
import { alliancesOn, isAllied } from './alliances.js';
import { noteHistory } from './history.js';
import { canDeclareIndependence, declareIndependence } from './independence.js';
import { message } from './queries.js';
import { proposeKind, registerProposalKind } from './relations.js';
import type { NationId } from './rules/nations.js';
import { mechanicsOf, nationOf, nationTitle } from './scenarios/index.js';
import { track } from './telemetry.js';
import { addTreaty, bound, endTreaty, treatyNations } from './treaties.js';
import type { GameState, Treaty } from './types.js';

/**
 * Whether a computer nation is ready to declare independence now (set by the computer players);
 * `together`: as an ally's partner in a confederation, which asks a smaller margin than declaring alone.
 */
type Judge = (s: GameState, nation: NationId, together: boolean) => boolean;
let judge: Judge = () => false;

/** The computer players register their readiness for independence here (ai/index.ts). Returns the previous judge. */
export function setConfederationJudge(fn: Judge): Judge {
  const previous = judge;
  judge = fn;
  return previous;
}

/** Whether a computer nation would declare independence now: alone, or `together` with an ally. */
export function readyForIndependence(s: GameState, nation: NationId, together = false): boolean {
  return judge(s, nation, together);
}

/** Whether the scenario lets allies declare together. */
export function confederationOn(s: GameState): boolean {
  const m = mechanicsOf(s);
  return !!m.confederation && !!m.independence && alliancesOn(s);
}

/** The confederation a nation belongs to, if any (in force while its war lasts). */
export function confederationOf(s: GameState, nation: NationId): Treaty | undefined {
  for (const t of s.treaties ?? []) if (!t.end && t.kind === 'confederation' && bound(t, nation)) return t;
  return undefined;
}

/** Why `from` cannot propose to its ally `to` that they declare independence together, or null. */
export function confederationProblem(s: GameState, from: NationId, to: NationId): string | null {
  if (!confederationOn(s)) return 'Allies cannot declare independence together in this scenario.';
  if (!isAllied(s, from, to)) return 'Only allies can declare independence together.';
  for (const n of [from, to]) {
    const why = canDeclareIndependence(s, n);
    if (why) return n === from ? why : `${nationTitle(s, n)} cannot declare yet: ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
  }
  const pending = s.relations[[from, to].sort().join('|')]?.proposal;
  if (pending) return pending.from === from ? `${nationTitle(s, to)} has not answered your last proposal yet.` : `${nationTitle(s, to)} is waiting for your answer to its proposal.`;
  return null;
}

/** A computer nation joins when it would declare independence now anyway. */
export function aiAcceptsConfederation(s: GameState, ai: NationId, from: NationId): boolean {
  return isAllied(s, ai, from) && readyForIndependence(s, ai, true);
}

/** `a` and `b` declare independence together, as one confederation. */
export function makeConfederation(s: GameState, a: NationId, b: NationId): string {
  const t = addTreaty(s, 'confederation', [a, b]);
  track(a, 'independence:confederation');
  track(b, 'independence:confederation');
  for (const n of treatyNations(t)) declareIndependence(s, n);
  const text = `${nationTitle(s, a)} and ${nationOf(s, b).name} declare independence together: their colonies form one confederation and fight the Crown's armies side by side.`;
  message(s, text);
  noteHistory(s, 'independence', [a, b], text);
  return text;
}

/** The war of a confederation is over: the treaty has done its work. */
export function concludeConfederation(s: GameState, t: Treaty): void {
  endTreaty(s, t, 'concluded');
}

/** Proposes to an ally that both declare independence now, together (answered with answerProposal). */
export function proposeConfederation(s: GameState, from: NationId, to: NationId): string {
  return proposeKind(s, 'confederation', from, to);
}

registerProposalKind('confederation', {
  problem: (s, a, b) => confederationProblem(s, a, b),
  accepts: (s, a, b) => aiAcceptsConfederation(s, a, b),
  make: (s, a, b) => makeConfederation(s, a, b),
});
