import { createUnit, distance, message, player, reveal, tileAt, unitPosition } from './queries.js';
import { track } from './telemetry.js';
import { randInt, weightedPick } from './rng.js';
import { randomImmigrant } from './europe.js';
import { hasFather } from './fathers.js';
import { difficultyRules } from './rules/difficulty.js';
import { NATIONS, TRIBES } from './rules/nations.js';
import { BURIAL_RADIUS, BURIAL_WEIGHT } from './rules/natives.js';
import type { GameState, Settlement, Unit } from './types.js';

type Outcome = 'nothing' | 'tales' | 'smallTreasure' | 'colonist' | 'treasure' | 'fountain' | 'lost' | 'burial';

/** The settlement whose tribal land a tile is (within BURIAL_RADIUS, not bought or taken), if any. */
export function tribalLandOwner(s: GameState, x: number, y: number): Settlement | undefined {
  if (tileAt(s, x, y)?.claim) return undefined;
  let best: Settlement | undefined;
  for (const st of Object.values(s.settlements)) {
    const d = distance(st.x, st.y, x, y);
    if (d <= BURIAL_RADIUS && (!best || d < distance(best.x, best.y, x, y))) best = st;
  }
  return best;
}

/** Explores a Lost City Rumour with the unit that stepped onto it. */
export function resolveRumour(s: GameState, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const scout = u.role === 'scout';
  const expert = u.type === 'seasonedScout';
  const deSoto = hasFather(s, u.owner, 'hernandoDeSoto');
  const p = player(s, u.owner);
  // Harder levels make the bad results likelier and the best ones rarer.
  const { rumourBad: bad, rumourGood: good, burialGrounds } = difficultyRules(p);
  // Only on tribal land can a rumour turn out to be a burial ground (listed last, so rumours elsewhere draw as before).
  const tribal = u.owner === 'crown' ? undefined : tribalLandOwner(s, pos.x, pos.y);
  const outcome = weightedPick<Outcome>(s, [
    ['nothing', (deSoto ? 0 : 30) * bad],
    ['tales', 14],
    ['smallTreasure', 26],
    ['colonist', 10 * good],
    ['treasure', (scout ? 10 : 5) * good],
    ['fountain', (scout ? 4 : 2) * good],
    ['lost', (expert || deSoto ? 0 : scout ? 3 : 6) * bad],
    ...(tribal ? [['burial', BURIAL_WEIGHT * burialGrounds] as [Outcome, number]] : []),
  ]);
  track(u.owner, 'explore:rumour explored');
  if (outcome === 'lost') track(u.owner, 'explore:expedition lost');
  switch (outcome) {
    case 'nothing':
      message(s, 'The rumour proves to be nothing more than tall tales.', u.owner, pos);
      break;
    case 'tales':
      reveal(s, u.owner, pos.x, pos.y, 6);
      message(s, 'You meet travellers who describe the lands around you.', u.owner, pos);
      break;
    case 'smallTreasure': {
      const gold = (50 + randInt(s, 150)) * (expert ? 2 : 1);
      p.gold += gold;
      message(s, `You find a small trinket cache worth ${gold} gold.`, u.owner, pos);
      break;
    }
    case 'colonist':
      createUnit(s, u.owner, 'freeColonist', { kind: 'map', x: pos.x, y: pos.y });
      message(s, 'You find survivors of a lost colony; they join you as free colonists.', u.owner, pos);
      break;
    case 'treasure': {
      const gold = 300 + randInt(s, 700);
      p.gold += gold;
      message(s, `You discover the ruins of a lost civilisation and recover ${gold} gold!`, u.owner, pos);
      break;
    }
    case 'fountain':
      for (let i = 0; i < 4; i++) createUnit(s, u.owner, randomImmigrant(s, u.owner), { kind: 'europe' });
      message(s, 'You have found the Fountain of Youth! Four new colonists wait on the docks in Europe.', u.owner, pos);
      break;
    case 'lost':
      delete s.units[u.id];
      message(s, 'The expedition vanishes without a trace.', u.owner, pos);
      break;
    case 'burial': {
      // The tribe is furious for good and at war until it is destroyed (see processNatives).
      const tribeId = tribal!.tribe;
      const tribe = s.tribes.find((t) => t.id === tribeId)!;
      tribe.burial = [...(tribe.burial ?? []).filter((n) => n !== u.owner), u.owner];
      if (tribe.submitted) tribe.submitted = tribe.submitted.filter((n) => n !== u.owner);
      tribe.stance[u.owner] = 'war';
      for (const st of Object.values(s.settlements)) if (st.tribe === tribeId) st.tension[u.owner] = 1000;
      track(u.owner, 'natives:burial ground disturbed');
      track(u.owner, 'natives:tribe went to war');
      message(s, `You have disturbed a ${TRIBES[tribeId].name} burial ground! The ${TRIBES[tribeId].name} swear eternal vengeance on ${NATIONS[u.owner].name}.`, u.owner, pos);
      break;
    }
  }
}
