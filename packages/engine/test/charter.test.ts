import { describe, expect, it } from 'vitest';
import { expansionCheck } from '../src/ai/advanced.js';
import {
  AI_PROFILES,
  COLONY_CHARTER,
  DIFFICULTY,
  RuleError,
  applyCommand,
  canFoundColony,
  charterCost,
  createGame,
  createUnit,
  foundColony,
  player,
  type GameState,
} from '../src/index.js';

/** A one-nation game on open plains, with or without the colony charter. */
function game(charter: boolean | undefined, ai: 'naive' | 'competent' = 'competent') {
  const s = createGame({ seed: 11, mapSize: 'small', nations: ['england'], humans: [], ai: { england: ai }, ...(charter === undefined ? {} : { colonyCharter: charter }) });
  for (const u of Object.values(s.units)) delete s.units[u.id];
  for (const st of Object.values(s.settlements)) delete s.settlements[st.id];
  const w = s.map.width;
  const cy = Math.floor(s.map.height / 2);
  const cx = Math.floor(w / 2) - 6;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 14; dx++) s.map.tiles[(cy + dy) * w + cx + dx] = { t: 'plains', p: true };
  return { s, cx, cy, p: player(s, 'england') };
}

function settler(s: GameState, x: number, y: number) {
  const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
  u.moves = 3;
  return u;
}

/** Pretends the nation holds `n` colonies (only the count matters for the price). */
function holdColonies(s: GameState, n: number) {
  const first = Object.values(s.colonies)[0];
  for (let i = Object.keys(s.colonies).length; i < n; i++) s.colonies[`fake${i}`] = { ...first, id: `fake${i}`, x: 1, y: i };
}

describe('colony charter', () => {
  it('is free for the first colony, then costs 100 gold per colony held, up to the cap', () => {
    const { s, cx, cy, p } = game(true);
    p.gold = 10_000;
    expect(charterCost(s, 'england')).toBe(0);
    foundColony(s, settler(s, cx, cy).id);
    expect(charterCost(s, 'england')).toBe(100);
    foundColony(s, settler(s, cx + 4, cy).id);
    expect(p.gold).toBe(10_000 - 100);
    expect(charterCost(s, 'england')).toBe(200);
    holdColonies(s, 4);
    expect(charterCost(s, 'england')).toBe(400);
    holdColonies(s, 9);
    expect(charterCost(s, 'england')).toBe(900);
    holdColonies(s, 40);
    expect(charterCost(s, 'england')).toBe(COLONY_CHARTER.cap);
  });

  it('scales with the difficulty of the nation', () => {
    const { s, cx, cy, p } = game(true);
    foundColony(s, settler(s, cx, cy).id);
    holdColonies(s, 4);
    p.difficulty = 'discoverer';
    expect(charterCost(s, 'england')).toBe(200);
    p.difficulty = 'viceroy';
    expect(charterCost(s, 'england')).toBe(600);
    expect(DIFFICULTY.governor.colonyCharter).toBe(1.25);
    expect(DIFFICULTY.explorer.colonyCharter).toBe(0.75);
  });

  it('needs no charter once the nation has declared independence', () => {
    const { s, cx, cy, p } = game(true);
    foundColony(s, settler(s, cx, cy).id);
    p.independence = 'declared';
    expect(charterCost(s, 'england')).toBe(0);
  });

  it('refuses a colony the treasury cannot pay for, and records the price when paid', () => {
    const { s, cx, cy, p } = game(true);
    foundColony(s, settler(s, cx, cy).id);
    p.gold = 50;
    const u = settler(s, cx + 4, cy);
    expect(canFoundColony(s, u)).toBe('A colony charter costs 100 gold.');
    expect(() => foundColony(s, u.id)).toThrow(RuleError);
    expect(() => foundColony(s, u.id)).toThrow('A colony charter costs 100 gold.');
    p.gold = 150;
    const c = foundColony(s, u.id);
    expect(p.gold).toBe(50);
    expect(s.messages.some((m) => m.text.includes(`${c.name} has been founded. The colony charter cost 100 gold.`))).toBe(true);
    expect(s.history!.some((h) => h.text.includes('charter cost 100 gold'))).toBe(true);
  });

  it('is off when the game does not ask for it (older saves and states)', () => {
    const { s, cx, cy, p } = game(undefined);
    expect(s.config.colonyCharter).toBeUndefined();
    foundColony(s, settler(s, cx, cy).id);
    p.gold = 0;
    expect(charterCost(s, 'england')).toBe(0);
    expect(canFoundColony(s, settler(s, cx + 4, cy))).toBeNull();
  });

  it('a naive computer nation founds no colony it cannot pay for', () => {
    const colonies = (charter: boolean) => {
      const { s, cx, cy, p } = game(charter, 'naive');
      foundColony(s, settler(s, cx, cy).id);
      createUnit(s, 'england', 'freeColonist', { kind: 'map', x: cx + 6, y: cy });
      for (let i = 0; i < 3; i++) {
        p.gold = 0;
        applyCommand(s, { type: 'endTurn' });
      }
      return Object.values(s.colonies).filter((c) => c.owner === 'england').length;
    };
    // Naive wants two colonies by now: without the charter the colonist founds the second.
    expect(colonies(false)).toBe(2);
    expect(colonies(true)).toBe(1);
  });

  it('an advanced computer nation waits until it can pay the charter and keep its reserve', () => {
    const { s, cx, cy, p } = game(true);
    s.turn = 30;
    for (const x of [cx, cx + 5]) {
      const c = foundColony(s, settler(s, x, cy).id);
      for (let i = 0; i < 3; i++) {
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
        u.loc = { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'townHall' } };
      }
      c.founded = 0;
    }
    p.gold = AI_PROFILES.competent.reserve + 150;
    expect(charterCost(s, 'england')).toBe(200);
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('gold');
    p.gold = AI_PROFILES.competent.reserve + 200;
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('ready');
  });
});
