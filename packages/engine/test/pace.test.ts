/**
 * The computer players' pace (docs/design/scenario-framework.md, row 6): turn thresholds tuned for
 * the Americas' 609 turns are scaled by `Scenario.ai.pace` with `aiTurn`. At pace 1 they are the
 * turns themselves, so the Americas play as before (golden.test.ts checks whole games).
 */
import { describe, expect, it } from 'vitest';
import { AMERICAS, aiTurn, createGame, registerScenario, type GameState } from '../src/index.js';
import { warshipWanted, type FleetReport } from '../src/ai/fleet.js';
import { AI_PROFILES } from '../src/ai/profiles.js';
import { offerFathers } from '../src/fathers.js';

registerScenario({ ...AMERICAS, id: 'test-pace', name: 'Pace test', hidden: true, ai: { ...AMERICAS.ai, pace: 0.35 } });
registerScenario({ ...AMERICAS, id: 'test-pace-unset', name: 'Pace test (unset)', hidden: true, ai: { goods: AMERICAS.ai.goods } });

/** Every turn threshold the computer players and the council read (the list at the top of the design note). */
const THRESHOLDS = [30, 40, 50, 60, 80, 90, 100, 120, 140, 160, 170, 200, 240, Infinity];

const game = (scenario?: string): GameState =>
  createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'combative', france: 'combative' }, ...(scenario ? { scenario } : {}) });

describe('ai pace', () => {
  it('gives the Americas their own thresholds (pace 1), and the same when a scenario leaves it out', () => {
    expect(AMERICAS.ai.pace).toBe(1);
    const s = game();
    const unset = game('test-pace-unset');
    for (const t of THRESHOLDS) {
      expect(aiTurn(s, t)).toBe(t);
      expect(aiTurn(unset, t)).toBe(t);
    }
  });

  it('scales the thresholds and rounds them at another pace', () => {
    const s = game('test-pace');
    expect(THRESHOLDS.map((t) => aiTurn(s, t))).toEqual([11, 14, 18, 21, 28, 31, 35, 42, 49, 56, 59, 70, 84, Infinity]);
  });

  it('moves what the computer players do: privateers from turn 60 in the Americas, from turn 21 at pace 0.35', () => {
    const report: FleetReport = { cargoShips: 1, holds: 2, warships: 0, galleons: 0, waiting: 0, coastal: 1, treasure: 0 };
    const prof = AI_PROFILES.combative;
    for (const [scenario, from] of [[undefined, 60], ['test-pace', 21]] as const) {
      const s = game(scenario);
      const p = s.players[0];
      s.turn = from - 1;
      expect(warshipWanted(s, p, prof, report, 50_000)).toBeNull();
      s.turn = from;
      expect(warshipWanted(s, p, prof, report, 50_000)).toBe('privateer');
    }
  });

  it('brings the council’s late offers forward with the pace', () => {
    // Political members get +2 weight after the late turn, which changes how often Jefferson is
    // drawn among them; the same seeds give the same draws on either side of the late turn.
    const games = { americas: game(), paced: game('test-pace') };
    const politicalShare = (which: keyof typeof games, turn: number) => {
      const s = games[which];
      let political = 0;
      for (let seed = 0; seed < 400; seed++) {
        s.rng = seed * 7919 + 1;
        s.turn = turn;
        offerFathers(s, s.players[0]);
        if (s.players[0].fatherOffer.political === 'thomasJefferson') political++;
      }
      return political;
    };
    // Turn 60: late at pace 0.35 (after turn 42), early in the Americas (before 120).
    expect(politicalShare('paced', 60)).toBe(politicalShare('americas', 130));
    expect(politicalShare('americas', 60)).toBe(politicalShare('paced', 30));
    expect(politicalShare('americas', 60)).not.toBe(politicalShare('americas', 130));
  });
});
