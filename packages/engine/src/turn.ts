import { runAi } from './ai.js';
import { processColony } from './colony.js';
import { advanceSailing, processImmigration, recoverMarkets } from './europe.js';
import { advanceWork, continueOrders, placeOnMap } from './movement.js';
import { processNatives } from './natives.js';
import { formatDate, maxMoves, message } from './queries.js';
import type { GameState, Player, Unit } from './types.js';

/** Resets a player's units and carries out standing orders at the start of their turn. */
export function beginPlayerTurn(s: GameState, p: Player): void {
  for (const u of Object.values(s.units)) {
    if (u.owner !== p.id) continue;
    if (u.loc.kind === 'sailing') {
      advanceSailing(s, u);
      const loc = u.loc as Unit['loc'];
      if (loc.kind === 'map') placeOnMap(s, u, loc.x, loc.y);
    }
    u.moves = maxMoves(u);
    if (u.work) advanceWork(s, u);
  }
  for (const u of Object.values(s.units)) {
    if (u.owner === p.id && u.dest && s.units[u.id]) continueOrders(s, u);
  }
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
    runAi(s, s.players[s.current]);
    finishPlayerTurn(s, s.players[s.current]);
    advance(s);
  }
}

function finishPlayerTurn(s: GameState, p: Player): void {
  for (const c of Object.values(s.colonies)) {
    if (c.owner === p.id) processColony(s, c);
  }
  processImmigration(s, p);
}

function advance(s: GameState): void {
  s.current++;
  if (s.current >= s.players.length) {
    s.current = 0;
    processNatives(s);
    recoverMarkets(s);
    s.turn++;
    message(s, `${formatDate(s.turn)} begins.`);
  }
  beginPlayerTurn(s, s.players[s.current]);
}

/** Units of a player that still want orders this turn. */
export function unitsAwaitingOrders(s: GameState, nation: Player['id']): string[] {
  return Object.values(s.units)
    .filter((u) => u.owner === nation && u.moves > 0 && u.state === 'active' && !u.work && !u.dest)
    .filter((u) => u.loc.kind === 'map')
    .map((u) => u.id);
}
