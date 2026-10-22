import { defencePower } from '../combat.js';
import { rebelShare } from '../independence.js';
import { colonyAt, distance, isShip, unitsAt } from '../queries.js';
import { isFavoured } from '../relations.js';
import { random } from '../rng.js';
import type { GameState, Player } from '../types.js';
import { ownColonies } from './common.js';
import type { AiFocus, AiProfile } from './profiles.js';

/** Turns between strategy reviews. */
const REVIEW_EVERY = 8;

/**
 * The Creative level re-plans like a person would: it looks at the state of the game every
 * few turns, picks one thing to concentrate on, and reacts at once to wars and openings.
 */
export function creativeProfile(s: GameState, p: Player, base: AiProfile): AiProfile {
  const memory = (p.aiMemory = p.aiMemory ?? {});
  if (!memory.personality) {
    memory.personality = { aggression: 0.1 + random(s) * 0.4, trade: 0.7 + random(s) * 0.6, liberty: 1.2 + random(s) * 0.6 };
  }
  const threatened = Object.entries(p.stance).some(([other, stance]) => stance === 'war' && other !== 'crown') && !memory.warTarget;
  if (threatened && memory.focus !== 'defend' && memory.focus !== 'war') memory.focus = 'defend';
  if (!memory.focus || s.turn - (memory.reviewed ?? -REVIEW_EVERY) >= REVIEW_EVERY) {
    memory.focus = chooseFocus(s, p, base);
    memory.reviewed = s.turn;
  }
  return applyFocus(base, memory.focus, memory.personality);
}

function chooseFocus(s: GameState, p: Player, base: AiProfile): AiFocus {
  const colonies = ownColonies(s, p);
  const share = rebelShare(s, p.id);
  const personality = p.aiMemory!.personality!;
  if (Object.entries(p.stance).some(([other, stance]) => stance === 'war' && other !== 'crown')) return p.aiMemory?.warTarget ? 'war' : 'defend';
  if (s.turn < 30) return 'explore';
  if (opening(s, p) && personality.aggression > 0.3 && s.turn - (p.aiMemory?.lastWar ?? -100) > 60) return 'war';
  if (colonies.length < base.colonyTarget(s.turn) - 1) return 'expand';
  if (share >= 40 && s.turn > 140) return 'independence';
  if (s.turn > 90 && share < 40) return 'liberty';
  return 'develop';
}

/** A foreign colony close to ours with nobody armed inside (not a Favoured Nation's). */
function opening(s: GameState, p: Player): boolean {
  const ours = ownColonies(s, p);
  const spare = Object.values(s.units).filter((u) => u.owner === p.id && (u.role === 'soldier' || u.role === 'dragoon')).length - ours.length;
  if (spare < 2) return false;
  return Object.values(s.colonies).some((c) => {
    // A Favoured Nation's colonies are no opening: it will not be attacked.
    if (c.owner === p.id || c.owner === 'crown' || isFavoured(s, p.id, c.owner)) return false;
    if (!ours.some((o) => distance(o.x, o.y, c.x, c.y) <= 7)) return false;
    const armed = unitsAt(s, c.x, c.y).filter((u) => u.owner === c.owner && !isShip(u) && (u.role === 'soldier' || u.role === 'dragoon'));
    return armed.reduce((n, u) => n + defencePower(s, u), 0) === 0 && !!colonyAt(s, c.x, c.y);
  });
}

function applyFocus(base: AiProfile, focus: AiFocus, personality: { aggression: number; trade: number; liberty: number }): AiProfile {
  const prof: AiProfile = { ...base, aggression: personality.aggression * 0.5, liberty: base.liberty * personality.liberty * 0.8 };
  switch (focus) {
    case 'explore':
      return { ...prof, scouting: true, colonyTarget: (t) => base.colonyTarget(t) + 1 };
    case 'expand':
      return { ...prof, colonyTarget: (t) => base.colonyTarget(t) + 2, liberty: prof.liberty * 0.8 };
    case 'develop':
      return prof;
    case 'liberty':
      return { ...prof, liberty: 2.4 * personality.liberty, schools: true };
    case 'independence':
      return { ...prof, liberty: 2, garrison: 2, independence: { minTurn: 140, minShare: 50, armyPerColony: 1, ratio: 1.15, arm: true } };
    case 'defend':
      return { ...prof, garrison: 2, aggression: 0, gifts: true };
    case 'war':
      return { ...prof, aggression: 1, garrison: 1 };
  }
}
