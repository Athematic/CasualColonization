import { runAi } from './ai/index.js';
import { bombardShips } from './combat.js';
import { perfEnd, perfStart } from './perf.js';
import { track } from './telemetry.js';
import { processColony } from './colony.js';
import { advanceSailing, processImmigration, recoverMarkets } from './europe.js';
import { advanceWork, continueOrders, continueRoadTo, placeOnMap } from './movement.js';
import { processNatives } from './natives.js';
import { processCongress } from './fathers.js';
import { processCrown } from './crown.js';
import { processEvents } from './events/index.js';
import { processIndependence } from './independence.js';
import { runAllies } from './rebellion.js';
import { processRoutes } from './routes.js';
import { maxMoves, message, unitName, unitPosition } from './queries.js';
import { calendarOf, formatDate } from './scenarios/index.js';
import { checkTimeLimit } from './score.js';
import { recordStats } from './stats.js';
import type { GameState, Player, Unit } from './types.js';

/** Resets a player's units and carries out standing orders at the start of their turn. */
export function beginPlayerTurn(s: GameState, p: Player): void {
  let t = perfStart();
  bombardShips(s, p.id);
  for (const u of Object.values(s.units)) {
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
  for (const u of Object.values(s.units)) {
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

/** AI players move until a human is up; with no humans at all, one full round is played. */
export function runAiUntilHuman(s: GameState): void {
  let safety = s.players.length;
  while (!s.players[s.current].human && safety-- > 0) {
    const p = s.players[s.current];
    const t = perfStart();
    runAi(s, p);
    perfEnd(p.id === 'crown' ? 'ai: crown (after independence)' : `ai: ${p.ai ?? 'naive'}`, t);
    finishPlayerTurn(s, s.players[s.current]);
    advance(s);
  }
}

function finishPlayerTurn(s: GameState, p: Player): void {
  track(p.id, 'cmd:endTurn');
  let t = perfStart();
  for (const c of Object.values(s.colonies)) {
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
    t = perfStart();
    recoverMarkets(s);
    perfEnd('markets', t);
    t = perfStart();
    processCrown(s);
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
    checkTimeLimit(s);
    message(s, `${formatDate(s.turn, calendarOf(s))} begins.`);
  }
  beginPlayerTurn(s, s.players[s.current]);
}

/** Units of a player that still want orders this turn. */
export function unitsAwaitingOrders(s: GameState, nation: Player['id']): string[] {
  return Object.values(s.units)
    .filter((u) => u.owner === nation && !u.ally && u.moves > 0 && u.state === 'active' && !u.work && !u.dest && !u.roadTo && !u.route)
    .filter((u) => u.loc.kind === 'map')
    .map((u) => u.id);
}
