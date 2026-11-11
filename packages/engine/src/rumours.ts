import { gridOf } from './grid.js';
import { createUnit, message, player, reveal, tileAt, unitPosition } from './queries.js';
import { splitFind } from './alliances.js';
import { noteHistory } from './history.js';
import { track } from './telemetry.js';
import { randInt, weightedPick } from './rng.js';
import { randomImmigrant } from './europe.js';
import { modifiers } from './scenarios/modifiers.js';
import type { RumourOutcome } from './rules/modifiers.js';
import { difficultyOf, mechanicsOf, nationOf, nativeRulesOf, rumoursOf, term } from './scenarios/index.js';
import { TRIBES } from './rules/nations.js';
import { systemsOfId } from './playerkind.js';
import type { GameState, Settlement, Unit } from './types.js';
import { removeUnit } from './unitindex.js';

type Outcome = RumourOutcome;

/** The settlement whose tribal land a tile is (within the native rules' `burialRadius`, not bought or taken), if any. */
export function tribalLandOwner(s: GameState, x: number, y: number): Settlement | undefined {
  const grid = gridOf(s);
  const radius = nativeRulesOf(s).burialRadius;
  if (tileAt(s, x, y)?.claim) return undefined;
  let best: Settlement | undefined;
  for (const st of Object.values(s.settlements)) {
    const d = grid.distance(st.x, st.y, x, y);
    if (d <= radius && (!best || d < grid.distance(best.x, best.y, x, y))) best = st;
  }
  return best;
}

/**
 * The weighted outcomes of a rumour explored by this unit, in the order they are drawn: the
 * scenario's rumour table (Scenario.rumours). `tribal` is the settlement whose land the rumour lies
 * on, if any: only there can it be a burial ground.
 */
export function rumourOdds(s: GameState, u: Unit, tribal: Settlement | undefined): [Outcome, number][] {
  const scout = u.role === 'scout';
  const expert = u.type === 'seasonedScout';
  // Council members and bonuses can make outcomes likelier or impossible (de Soto: × 0 for tall tales and lost expeditions).
  const mods = modifiers(s, u.owner, 'rumourOutcome');
  const f = (o: Outcome): number => {
    let k = 1;
    for (const m of mods) if (m.outcome === o) k *= m.mul;
    return k;
  };
  // Harder levels make the bad results likelier and the best ones rarer.
  const rules = difficultyOf(s, player(s, u.owner));
  const odds: [Outcome, number][] = [];
  for (const e of rumoursOf(s)) {
    if (e.tribal && !tribal) continue;
    const base = expert && e.expert !== undefined ? e.expert : scout && e.scout !== undefined ? e.scout : e.weight;
    let w = base * f(e.outcome);
    if (e.difficulty) w *= rules[e.difficulty];
    odds.push([e.outcome, w]);
  }
  return odds;
}

/** Explores a Lost City Rumour with the unit that stepped onto it. */
export function resolveRumour(s: GameState, u: Unit): void {
  const pos = unitPosition(s, u)!;
  const expert = u.type === 'seasonedScout';
  const p = player(s, u.owner);
  // Only on tribal land can a rumour turn out to be a burial ground, and only with `mechanics.burialGrounds`;
  // never for the Crown, or for a chartered company, which the peoples leave alone (fix c).
  const tribal = !systemsOfId(u.owner).peoples || !mechanicsOf(s).burialGrounds ? undefined : tribalLandOwner(s, pos.x, pos.y);
  const outcome = weightedPick<Outcome>(s, rumourOdds(s, u, tribal));
  track(u.owner, 'explore:rumour explored');
  if (outcome === 'lost') track(u.owner, 'explore:expedition lost');
  switch (outcome) {
    case 'nothing':
      message(s, term(s, 'rumour.nothing'), u.owner, pos);
      break;
    case 'tales':
      reveal(s, u.owner, pos.x, pos.y, 6);
      message(s, term(s, 'rumour.tales'), u.owner, pos);
      break;
    case 'smallTreasure': {
      const gold = (50 + randInt(s, 150)) * (expert ? 2 : 1);
      // A joint expedition shares what it finds (alliances.ts).
      p.gold += u.joint ? splitFind(s, u, gold) : gold;
      message(s, term(s, 'rumour.smallTreasure', { gold }), u.owner, pos);
      break;
    }
    case 'colonist':
      createUnit(s, u.owner, 'freeColonist', { kind: 'map', x: pos.x, y: pos.y });
      message(s, term(s, 'rumour.colonist'), u.owner, pos);
      break;
    case 'treasure': {
      const gold = 300 + randInt(s, 700);
      p.gold += u.joint ? splitFind(s, u, gold) : gold;
      message(s, term(s, 'rumour.treasure', { gold }), u.owner, pos);
      noteHistory(s, 'treasure', [u.owner], term(s, 'rumour.treasure.history', { gold }), { secret: true, at: pos });
      break;
    }
    case 'fountain':
      for (let i = 0; i < 4; i++) createUnit(s, u.owner, randomImmigrant(s, u.owner), { kind: 'europe' });
      message(s, term(s, 'rumour.fountain'), u.owner, pos);
      noteHistory(s, 'treasure', [u.owner], term(s, 'rumour.fountain.history'), { secret: true, at: pos });
      break;
    case 'lost':
      removeUnit(s, u.id);
      message(s, term(s, 'rumour.lost'), u.owner, pos);
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
      const vars = { tribe: TRIBES[tribeId].name, nation: nationOf(s, u.owner).name, adjective: nationOf(s, u.owner).adjective };
      noteHistory(s, 'tribe', [u.owner], term(s, 'rumour.burial.history', vars), { at: pos });
      track(u.owner, 'natives:tribe went to war');
      message(s, term(s, 'rumour.burial', vars), u.owner, pos);
      break;
    }
  }
}
