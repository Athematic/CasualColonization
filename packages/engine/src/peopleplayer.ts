/**
 * A native people playing as a nation (docs/design/native-nations.md, Beta 3 step 1; T1–T4).
 *
 * At setup (T3: only at setup in Beta 3) each people the game's `config.peoples` names, from the
 * scenario's `peoples.playable` (T4), becomes a player of `kind: 'people'` with its own people id
 * (T1). Its settlements become its towns: colonies it owns (T2), keeping their places and names,
 * each peopled with one unit of the people's selection (T6) at work and one standing in the town for
 * the braves the settlement would have sent out. Its `Tribe` record stays (the treaty party, `met`,
 * `burned`); the settlements' records go. The peoples the game does not play stay settlements under
 * Beta 2's rules.
 *
 * The systems table (playerkind.ts) keeps every Europe-only system away from it: no market, no gold
 * to start (T10: gold only from trade with Europeans), no immigration, Crown, taxes, Royal
 * Expeditionary Force, independence, Congress or caravel. Its computer play is step 9; until then
 * a computer people ends its turn.
 */
import { bestJob } from './colony.js';
import { newPlayer } from './game.js';
import { createUnit, message, newId, reveal, tileAt } from './queries.js';
import type { TribeId } from './rules/nations.js';
import { bornType, difficultyOf, goodsOf, nationOf, newColonyBuildings, playablePeoples, scenarioOf } from './scenarios/index.js';
import { settlementName } from './natives.js';
import { emptyGoods } from './rules/goods.js';
import type { Colony, GameState, Player } from './types.js';
import { addColony, removeUnit, setUnitLoc } from './unitindex.js';

/** Turns a people into a player at setup; returns the player. Throws when the map has none of its settlements. */
export function addPeoplePlayer(s: GameState, id: TribeId, human: boolean): Player {
  const name = nationOf(s, id).name;
  if (!playablePeoples(scenarioOf(s)).some((e) => e.id === id)) throw new Error(`The ${name} cannot play as a nation in this scenario.`);
  // Its capital first, then the others in the order the map made them.
  const settlements = Object.values(s.settlements).filter((st) => st.tribe === id);
  settlements.sort((a, b) => Number(b.capital) - Number(a.capital));
  if (!settlements.length) throw new Error(`The ${name} have no settlements on this map.`);
  const first = settlements[0];
  const p = newPlayer(s, id, human, { x: first.x, y: first.y });
  p.kind = 'people';
  p.gold = 0;
  if (human) p.difficulty = s.difficulty;
  else p.ai = s.config.ai?.[id] ?? 'naive';
  // No Crown, no immigration and no Congress (playerkind.ts): nothing of initCrown, recruitPool or offerFathers.
  p.crossesRequired = 0;
  s.players.push(p);
  // Difficulty is read for the people as for any player (raids, prices); this checks it resolves.
  difficultyOf(s, p);

  const worker = bornType(s, id);
  for (const st of settlements) {
    const colony: Colony = {
      id: newId(s, 'c'),
      owner: id,
      name: settlementName(s, st),
      x: st.x,
      y: st.y,
      goods: emptyGoods(goodsOf(s)),
      buildings: newColonyBuildings(s, id),
      build: null,
      hammers: 0,
      liberty: 0,
      founded: s.turn,
      exports: {},
    };
    // The settlement's braves (none at setup) and its record go: the town takes its place.
    if (s.braves) for (const b of Object.values(s.braves)) if (b.home === st.id) delete s.braves[b.id];
    delete s.settlements[st.id];
    addColony(s, colony);
    const tile = tileAt(s, st.x, st.y)!;
    tile.r = true;
    delete tile.lcr;
    p.coloniesFounded++;
    const u = createUnit(s, id, worker, { kind: 'map', x: st.x, y: st.y });
    const job = bestJob(s, colony, u);
    if (job) setUnitLoc(s, u, { kind: 'colony', colonyId: colony.id, job });
    else removeUnit(s, u.id);
    createUnit(s, id, worker, { kind: 'map', x: st.x, y: st.y });
    reveal(s, id, st.x, st.y, 2);
  }
  message(s, `The ${name} take their place among the nations, with ${settlements.length} town${settlements.length === 1 ? '' : 's'}.`, id, { x: first.x, y: first.y });
  return p;
}
