import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { applyEffects } from './events/effects.js';
import { message, player } from './queries.js';
import { random, weightedPick } from './rng.js';
import { FATHERS, fatherCost, type FatherCategory, type FatherId } from './rules/fathers.js';
import { aiTurn, councilOf, councilText, nationOf } from './scenarios/index.js';
import { memberEffects } from './scenarios/modifiers.js';
import { shareBells } from './alliances.js';
import type { GameState, Player } from './types.js';
import { systemsOf } from './playerkind.js';

export function hasFather(s: GameState, nation: Player['id'], id: FatherId): boolean {
  return s.players.find((p) => p.id === nation)?.fathers.includes(id) ?? false;
}

/** The product (bells) the player's next council member costs, by its council's cost rule. */
export function nextFatherCost(s: GameState, p: Player): number {
  return fatherCost(p.fathers.length, s.config.nations.length, councilOf(s, p.id)?.cost);
}

/**
 * Draws one candidate per category of the player's council (the Congress, or a people's council)
 * from the members who have not joined yet and may sit in it (`FatherDef.peoples`).
 */
export function offerFathers(s: GameState, p: Player): void {
  const offer: Partial<Record<FatherCategory, FatherId>> = {};
  const council = councilOf(s, p.id);
  if (!council) {
    p.fatherOffer = offer;
    return;
  }
  // Members of one category may grow likelier late in the game (the Congress: political members
  // after turn 120 of the Americas, scaled by the pace).
  const late = council.late;
  const lateGame = late ? s.turn > aiTurn(s, late.turn) : false;
  for (const cat of council.categories) {
    const pool = council.members
      .map((id) => FATHERS[id])
      .filter((f) => f.category === cat && !p.fathers.includes(f.id) && (!f.peoples || f.peoples.includes(p.id)));
    if (!pool.length) continue;
    offer[cat] = weightedPick(s, pool.map((f) => [f.id, f.weight + (lateGame && f.category === late!.category ? late!.add : 0)] as [FatherId, number]));
  }
  p.fatherOffer = offer;
}

export function chooseFather(s: GameState, nation: Player['id'], id: FatherId): void {
  const p = player(s, nation);
  if (!Object.values(p.fatherOffer).includes(id)) fail(`${FATHERS[id].name} is not among the candidates.`);
  p.currentFather = id;
  track(nation, 'cmd:chooseFather');
}

/**
 * Collects the council's product (liberty bells) towards the next member: the Continental Congress
 * for a nation, a people's council for a playing people. Called once per turn for each player.
 */
export function processCongress(s: GameState, p: Player): void {
  // A chartered company and the Crown have no council (companies.ts; playerkind.ts `council`).
  if (!systemsOf(p).council) return;
  // Allies' Congresses share a part of each other's bells (alliances.ts, C5).
  if (systemsOf(p).congress && s.treaties) shareBells(s, p.id);
  if (!p.currentFather) {
    const offered = Object.values(p.fatherOffer) as FatherId[];
    if (!offered.length) return;
    if (p.human) return;
    // Computer players pick by the council's simple preference.
    const preference = councilOf(s, p.id)?.aiPreference ?? [];
    p.currentFather = preference.find((f) => offered.includes(f)) ?? offered[0];
  }
  const cost = nextFatherCost(s, p);
  if (p.fatherBells < cost) return;
  p.fatherBells -= cost;
  joinCongress(s, p, p.currentFather);
}

export function joinCongress(s: GameState, p: Player, id: FatherId): void {
  p.fathers.push(id);
  p.currentFather = null;
  track(p.id, 'fathers:joined');
  const def = FATHERS[id];
  const council = councilText(s, p.id, 'council');
  const [joins, hasJoined] = def.plural ? ['join', 'have joined'] : ['joins', 'has joined'];
  message(s, `${def.name} ${joins} the ${council} of ${nationOf(s, p.id).name}. ${def.effect}`, p.id);
  noteHistory(s, 'father', [p.id], `${def.name} ${joins} the ${council} of ${nationOf(s, p.id).name}.`);
  for (const other of s.players) {
    if (other.id !== p.id) message(s, `${def.name} ${hasJoined} the ${council} of ${nationOf(s, p.id).name}.`, other.id);
  }
  // The member's one-off effects, in order (none of today's draws a random number).
  const onJoin = memberEffects(councilOf(s, p.id), id).onJoin;
  if (onJoin?.length) applyEffects(s, `father:${id}`, onJoin, { nation: p.id }, () => random(s));
  offerFathers(s, p);
}
