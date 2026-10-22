import { createUnit, message, player, reveal, unitPosition } from './queries.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { randInt, weightedPick } from './rng.js';
import { randomImmigrant } from './europe.js';
import { hasFather } from './fathers.js';
import { difficultyRules } from './rules/difficulty.js';
import type { GameState, Unit } from './types.js';

type Outcome = 'nothing' | 'tales' | 'smallTreasure' | 'colonist' | 'treasure' | 'fountain' | 'lost';

/** Explores a Lost City Rumour with the unit that stepped onto it. */
export function resolveRumour(s: GameState, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const scout = u.role === 'scout';
  const expert = u.type === 'seasonedScout';
  const deSoto = hasFather(s, u.owner, 'hernandoDeSoto');
  const p = player(s, u.owner);
  // Harder levels make the bad results likelier and the best ones rarer.
  const { rumourBad: bad, rumourGood: good } = difficultyRules(p);
  const outcome = weightedPick<Outcome>(s, [
    ['nothing', (deSoto ? 0 : 30) * bad],
    ['tales', 14],
    ['smallTreasure', 26],
    ['colonist', 10 * good],
    ['treasure', (scout ? 10 : 5) * good],
    ['fountain', (scout ? 4 : 2) * good],
    ['lost', (expert || deSoto ? 0 : scout ? 3 : 6) * bad],
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
      noteHistory(s, 'treasure', [u.owner], `Explorers find the ruins of a lost civilisation and recover ${gold} gold.`, { secret: true, at: pos });
      break;
    }
    case 'fountain':
      for (let i = 0; i < 4; i++) createUnit(s, u.owner, randomImmigrant(s, u.owner), { kind: 'europe' });
      message(s, 'You have found the Fountain of Youth! Four new colonists wait on the docks in Europe.', u.owner, pos);
      noteHistory(s, 'treasure', [u.owner], 'Explorers find the Fountain of Youth: four colonists come from Europe.', { secret: true, at: pos });
      break;
    case 'lost':
      delete s.units[u.id];
      message(s, 'The expedition vanishes without a trace.', u.owner, pos);
      break;
  }
}
