import { fail } from './errors.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { applyEffects } from './events/effects.js';
import { message, player } from './queries.js';
import { random, weightedPick } from './rng.js';
import { FATHERS, fatherCost, type FatherCategory, type FatherId } from './rules/fathers.js';
import { aiTurn, councilOf, nationOf, scenarioOf, term } from './scenarios/index.js';
import { memberEffects } from './scenarios/modifiers.js';
import type { GameState, Player } from './types.js';

export function hasFather(s: GameState, nation: Player['id'], id: FatherId): boolean {
  return s.players.find((p) => p.id === nation)?.fathers.includes(id) ?? false;
}

export function nextFatherCost(s: GameState, p: Player): number {
  return fatherCost(p.fathers.length, s.config.nations.length);
}

/** Draws one candidate per category of the scenario's council from the members who have not joined yet. */
export function offerFathers(s: GameState, p: Player): void {
  const offer: Partial<Record<FatherCategory, FatherId>> = {};
  // Political members grow likelier late in the game (turn 120 of the Americas, scaled by the pace).
  const lateGame = s.turn > aiTurn(s, 120);
  const council = councilOf(s);
  for (const cat of council.categories) {
    const pool = council.members.map((id) => FATHERS[id]).filter((f) => f.category === cat && !p.fathers.includes(f.id));
    if (!pool.length) continue;
    offer[cat] = weightedPick(s, pool.map((f) => [f.id, f.weight + (lateGame && f.category === 'political' ? 2 : 0)] as [FatherId, number]));
  }
  p.fatherOffer = offer;
}

export function chooseFather(s: GameState, nation: Player['id'], id: FatherId): void {
  const p = player(s, nation);
  if (!Object.values(p.fatherOffer).includes(id)) fail(`${FATHERS[id].name} is not among the candidates.`);
  p.currentFather = id;
  track(nation, 'cmd:chooseFather');
}

/** AI players pick a father by simple preference. */
const AI_PREFERENCE: FatherId[] = [
  'thomasJefferson', 'williamBrewster', 'peterStuyvesant', 'pocahontas', 'thomasPaine', 'williamPenn', 'adamSmith',
  'simonBolivar', 'hernandoDeSoto', 'ferdinandMagellan', 'laSalle', 'paulRevere', 'georgeWashington',
];

/** Collects liberty bells for the Continental Congress; called once per turn for each player. */
export function processCongress(s: GameState, p: Player): void {
  if (!p.currentFather) {
    const offered = Object.values(p.fatherOffer) as FatherId[];
    if (!offered.length) return;
    if (p.human) return;
    p.currentFather = AI_PREFERENCE.find((f) => offered.includes(f)) ?? offered[0];
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
  message(s, `${def.name} joins the ${term(s, 'council')} of ${nationOf(s, p.id).name}. ${def.effect}`, p.id);
  noteHistory(s, 'father', [p.id], `${def.name} joins the ${term(s, 'council')} of ${nationOf(s, p.id).name}.`);
  for (const other of s.players) {
    if (other.id !== p.id) message(s, `${def.name} has joined the ${term(s, 'council')} of ${nationOf(s, p.id).name}.`, other.id);
  }
  // The member's one-off effects, in order (none of today's draws a random number).
  const onJoin = memberEffects(scenarioOf(s), id).onJoin;
  if (onJoin?.length) applyEffects(s, `father:${id}`, onJoin, { nation: p.id }, () => random(s));
  offerFathers(s, p);
}
