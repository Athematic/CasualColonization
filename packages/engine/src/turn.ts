import { runAi } from './ai/index.js';
import { bombardShips } from './combat.js';
import { perfEnd, perfStart } from './perf.js';
import { track } from './telemetry.js';
import { processColony } from './colony.js';
import { advanceSailing, processImmigration, recoverMarkets } from './europe.js';
import { advanceWork, continueOrders, continueRoadTo, placeOnMap } from './movement.js';
import { processNatives } from './natives.js';
import { processLand } from './land.js';
import { processEpidemics } from './epidemics.js';
import { anyPlayingPeople, processPeopleDiplomacy } from './peoplediplomacy.js';
import { processCongress } from './fathers.js';
import { processCrown } from './crown.js';
import { processCompanies } from './chartered.js';
import { processEvents } from './events/index.js';
import { processIndependence } from './independence.js';
import { runAllies } from './rebellion.js';
import { processRoutes } from './routes.js';
import { maxMoves, message, unitName, unitPosition } from './queries.js';
import { calendarOf, formatDate } from './scenarios/index.js';
import { checkVictory } from './victory.js';
import { processArrivals } from './arrivals.js';
import { processPeopleMoves } from './peoplemoves.js';
import { notePeopleWars } from './peoplevictory.js';
import { recordStats } from './stats.js';
import type { GameState, Player, Unit } from './types.js';
import { indexedUnitsOf, colonyList, unitList } from './unitindex.js';

/** Resets a player's units and carries out standing orders at the start of their turn. */
export function beginPlayerTurn(s: GameState, p: Player): void {
  // A nation finished in arena play-on (victory.ts) takes no more turns.
  if (p.finished) return;
  let t = perfStart();
  bombardShips(s, p.id);
  // The nation's units, as a filtered Object.values would list them (nothing here changes an owner).
  for (const u of indexedUnitsOf(s, p.id)) {
    if (u.owner !== p.id) continue;
    if (u.loc.kind === 'sailing') {
      advanceSailing(s, u);
      const loc = u.loc as Unit['loc'];
      if (loc.kind === 'map') placeOnMap(s, u, loc.x, loc.y);
    }
    u.moves = maxMoves(u, s);
    if (u.repair) {
      u.repair--;
      u.moves = 0;
      if (!u.repair) {
        delete u.repair;
        message(s, `${unitName(u)} has been repaired.`, u.owner, unitPosition(s, u));
      }
    }
    if (u.work) advanceWork(s, u);
  }
  for (const u of indexedUnitsOf(s, p.id)) {
    if (u.owner === p.id && u.dest && !u.route && s.units[u.id]) continueOrders(s, u);
    if (u.owner === p.id && u.roadTo && s.units[u.id]) continueRoadTo(s, u);
  }
  perfEnd('turn start: units and orders', t);
  // Trade routes run here, before the player or the computer gives any orders this turn.
  t = perfStart();
  processRoutes(s, p.id);
  perfEnd('trade routes', t);
  // A foreign intervention force fights the Crown on its own (rebellion.ts).
  t = perfStart();
  runAllies(s, p);
  perfEnd('allies', t);
}

/** Ends the current player's turn, runs AI players, and advances the year when everyone has moved. */
export function endTurn(s: GameState): void {
  finishPlayerTurn(s, s.players[s.current]);
  advance(s);
  runAiUntilHuman(s);
}

/**
 * AI players move until a human is up; with no humans at all, one full round is played. While a
 * person's nation has yet to arrive and no other person is in the game (arrivals.ts), the computer
 * plays on until it arrives, as through a head start.
 */
export function runAiUntilHuman(s: GameState): void {
  let safety = s.players.length;
  let waiting = awaitingPerson(s);
  while (!s.players[s.current].human || s.players[s.current].finished) {
    // Waiting for a person's nation: once it is in, up to a round more reaches its turn.
    if (waiting) {
      waiting = awaitingPerson(s);
      safety = s.players.length;
    }
    if (safety-- <= 0) break;
    const p = s.players[s.current];
    const t = perfStart();
    if (!p.finished) runAi(s, p);
    perfEnd(p.id === 'crown' ? 'ai: crown (after independence)' : `ai: ${p.ai ?? 'naive'}`, t);
    finishPlayerTurn(s, s.players[s.current]);
    advance(s);
  }
}

/** Whether the game waits for a person's nation to arrive, with no other person in it to play. */
function awaitingPerson(s: GameState): boolean {
  return !!s.arrivals && !s.gameOver && s.arrivals.some((a) => s.config.humans.includes(a.nation)) && !s.players.some((p) => p.human && !p.finished);
}

function finishPlayerTurn(s: GameState, p: Player): void {
  if (p.finished) return;
  track(p.id, 'cmd:endTurn');
  let t = perfStart();
  for (const c of colonyList(s)) {
    if (c.owner === p.id) processColony(s, c);
  }
  perfEnd('end of turn: colony production', t);
  t = perfStart();
  processImmigration(s, p);
  processCongress(s, p);
  perfEnd('end of turn: immigration, congress', t);
}

function advance(s: GameState): void {
  s.current++;
  if (s.current >= s.players.length) {
    s.current = 0;
    let t = perfStart();
    processNatives(s);
    perfEnd('natives (incl. braves)', t);
    // Hard years and land health, in scenarios that have them (land.ts).
    if (s.land) processLand(s);
    // Epidemics after contact, in scenarios that have them (epidemics.ts, native-nations.md T12).
    processEpidemics(s);
    // Treaties with a playing people (peoplediplomacy.ts, Beta 3 step 4).
    if (anyPlayingPeople(s)) {
      processPeopleDiplomacy(s);
      // Each playing people's wars, for the good life's peace (peoplevictory.ts, T14).
      notePeopleWars(s);
    }
    t = perfStart();
    recoverMarkets(s);
    perfEnd('markets', t);
    t = perfStart();
    processCrown(s);
    processCompanies(s);
    perfEnd('crown', t);
    t = perfStart();
    processEvents(s);
    perfEnd('events', t);
    t = perfStart();
    processIndependence(s);
    perfEnd('independence', t);
    t = perfStart();
    recordStats(s);
    perfEnd('stats', t);
    s.turn++;
    checkVictory(s, { kind: 'round' });
    message(s, `${formatDate(s.turn, calendarOf(s))} begins.`);
    // Nations arriving this year enter before the round's first turn (arrivals.ts, T18).
    if (s.arrivals) processArrivals(s);
    // Peoples who come to a region or leave it this year, on a stored map that says so (peoplemoves.ts).
    if (s.config.map) processPeopleMoves(s);
  }
  beginPlayerTurn(s, s.players[s.current]);
}

/** Units of a player that still want orders this turn. */
export function unitsAwaitingOrders(s: GameState, nation: Player['id']): string[] {
  return unitList(s)
    .filter((u) => u.owner === nation && !u.ally && u.moves > 0 && u.state === 'active' && !u.work && !u.dest && !u.roadTo && !u.route)
    .filter((u) => u.loc.kind === 'map')
    .map((u) => u.id);
}
