import { declareWar } from './combat.js';
import { fail } from './errors.js';
import { hasFather } from './fathers.js';
import { message, player } from './queries.js';
import { NATIONS, type NationId } from './rules/nations.js';
import type { GameState } from './types.js';

/** Turns of war after which a computer nation is willing to talk peace. */
export const WAR_WEARINESS = 6;

export function startWar(s: GameState, nation: NationId, other: NationId): string {
  if (nation === other) fail('A nation cannot fight itself.');
  if (other === 'crown') fail('Declare independence to fight the Crown.');
  const p = player(s, nation);
  if (p.stance[other] === 'war') fail(`You are already at war with ${NATIONS[other].name}.`);
  declareWar(s, nation, other);
  return `You are now at war with ${NATIONS[other].name}.`;
}

/** Offers peace. People always accept (they share the device); computer nations accept once tired of war. */
export function proposePeace(s: GameState, nation: NationId, other: NationId): string {
  const p = player(s, nation);
  const o = player(s, other);
  if (p.stance[other] !== 'war') fail(`You are not at war with ${NATIONS[other].name}.`);
  if (other === 'crown') fail('The Crown does not negotiate with rebels.');
  const tired = s.turn - (p.warSince[other] ?? s.turn) >= WAR_WEARINESS;
  if (!o.human && !tired && !hasFather(s, nation, 'benjaminFranklin')) {
    return `${NATIONS[other].name} refuses to make peace for now.`;
  }
  makePeace(s, nation, other);
  return `${NATIONS[nation].name} and ${NATIONS[other].name} have made peace.`;
}

export function makePeace(s: GameState, a: NationId, b: NationId): void {
  const pa = player(s, a);
  const pb = player(s, b);
  pa.stance[b] = 'peace';
  pb.stance[a] = 'peace';
  delete pa.warSince[b];
  delete pb.warSince[a];
  message(s, `${NATIONS[a].name} and ${NATIONS[b].name} have made peace.`);
}

/** Computer nations tired of fighting each other settle their wars. */
export function aiPeace(s: GameState, nation: NationId): void {
  const p = player(s, nation);
  for (const [other, stance] of Object.entries(p.stance)) {
    if (stance !== 'war' || other === 'crown') continue;
    const o = s.players.find((x) => x.id === other);
    if (!o || o.human) continue;
    if (s.turn - (p.warSince[other] ?? s.turn) >= WAR_WEARINESS * 2) makePeace(s, nation, other as NationId);
  }
}
