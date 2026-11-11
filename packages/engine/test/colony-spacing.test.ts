import { describe, expect, it } from 'vitest';
import { expansionCheck } from '../src/ai/advanced.js';
import { bestColonySite, keenSiteScore } from '../src/ai/common.js';
import { AI_PROFILES, applyCommand, assignJob, createGame, createUnit, SQUARE, foundColony, siteScore, type GameState, removeUnit } from '../src/index.js';

const ownedColonies = (s: GameState, nation: string) => Object.values(s.colonies).filter((c) => c.owner === nation);

/** A one-nation computer game with a wide stretch of open, plowed plains in the middle and no natives. */
function openPlains(level: 'competent' | 'creative' | 'combative' = 'competent') {
  const s = createGame({ seed: 11, mapSize: 'small', nations: ['england'], humans: [], ai: { england: level } });
  for (const u of Object.values(s.units)) removeUnit(s, u.id);
  for (const st of Object.values(s.settlements)) delete s.settlements[st.id];
  const w = s.map.width;
  const cy = Math.floor(s.map.height / 2);
  const cx = Math.floor(w / 2) - 6;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 14; dx++) s.map.tiles[(cy + dy) * w + cx + dx] = { t: 'plains', p: true };
  }
  return { s, cx, cy };
}

function settle(s: GameState, x: number, y: number) {
  const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
  u.moves = 3;
  return foundColony(s, u.id);
}

function addWorkers(s: GameState, colonyId: string, n: number) {
  const c = s.colonies[colonyId];
  for (let i = 0; i < n; i++) {
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
    assignJob(s, u.id, c.id);
  }
}

describe('computer colony spacing', () => {
  it('values a site three tiles from a colony above an equally good one two tiles away', () => {
    const { s, cx, cy } = openPlains();
    settle(s, cx, cy);
    // Two tiles away the sites share up to three work tiles with the colony; three tiles away none.
    expect(siteScore(s, cx + 3, cy)).toBeGreaterThan(siteScore(s, cx + 2, cy));
    expect(keenSiteScore(s, cx + 3, cy)).toBeGreaterThan(keenSiteScore(s, cx + 2, cy));
    // Standing two tiles from the colony, the search walks one more tile rather than found there.
    const best = bestColonySite(s, cx + 2, cy, { radius: 5, score: (x, y) => keenSiteScore(s, x, y), perTile: 1.1, stay: true });
    expect(SQUARE.distance(best.x, best.y, cx, cy)).toBeGreaterThanOrEqual(3);
    // The rule itself is unchanged: two tiles is still allowed, one is not.
    expect(siteScore(s, cx + 2, cy)).toBeGreaterThan(0);
    expect(siteScore(s, cx + 1, cy)).toBe(-Infinity);
  });

  it('chases a bonus resource over plain land', () => {
    const { s, cx, cy } = openPlains();
    const w = s.map.width;
    // Two sites the same distance from the colonist; one has a bonus resource next to it.
    s.map.tiles[(cy - 3) * w + cx + 1] = { t: 'plains', p: true, b: true };
    expect(keenSiteScore(s, cx, cy - 3)).toBeGreaterThan(keenSiteScore(s, cx, cy + 3) + 4);
    const best = bestColonySite(s, cx, cy, { radius: 4, score: (x, y) => keenSiteScore(s, x, y), perTile: 1.1, stay: true });
    expect(SQUARE.distance(best.x, best.y, cx + 1, cy - 3)).toBeLessThanOrEqual(1);
  });

  it('a competent nation with small colonies does not found another', () => {
    const { s, cx, cy } = openPlains();
    const a = settle(s, cx, cy);
    settle(s, cx + 5, cy);
    const p = s.players.find((o) => o.id === 'england')!;
    for (const c of ownedColonies(s, 'england')) c.founded = s.turn - 40;
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('population');
    // A colonist arriving at a colony joins it instead of setting out.
    const extra = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: a.x, y: a.y });
    extra.moves = 1;
    for (let i = 0; i < 4; i++) applyCommand(s, { type: 'endTurn' });
    expect(ownedColonies(s, 'england')).toHaveLength(2);
  });

  it('founds a new colony, away from the others, once its colonies are established', () => {
    const { s, cx, cy } = openPlains();
    const a = settle(s, cx, cy);
    const b = settle(s, cx + 5, cy);
    addWorkers(s, a.id, 3);
    addWorkers(s, b.id, 3);
    for (const c of ownedColonies(s, 'england')) c.founded = s.turn - 40;
    const p = s.players.find((o) => o.id === 'england')!;
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('ready');
    for (let i = 0; i < 8 && ownedColonies(s, 'england').length < 3; i++) applyCommand(s, { type: 'endTurn' });
    const colonies = ownedColonies(s, 'england');
    expect(colonies).toHaveLength(3);
    const fresh = colonies.find((c) => c.id !== a.id && c.id !== b.id)!;
    expect(Math.min(SQUARE.distance(fresh.x, fresh.y, a.x, a.y), SQUARE.distance(fresh.x, fresh.y, b.x, b.y))).toBeGreaterThanOrEqual(3);
  });

  it('waits a few turns between new colonies', () => {
    const { s, cx, cy } = openPlains();
    const a = settle(s, cx, cy);
    const b = settle(s, cx + 5, cy);
    addWorkers(s, a.id, 3);
    addWorkers(s, b.id, 3);
    a.founded = s.turn - 40;
    b.founded = s.turn - 2;
    const p = s.players.find((o) => o.id === 'england')!;
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('pace');
  });

  it('wants a defender for its outposts before expanding further', () => {
    const { s, cx, cy } = openPlains();
    s.turn = 50; // Late enough to want a fourth colony.
    const colonies = [settle(s, cx - 4, cy - 4), settle(s, cx + 1, cy - 4), settle(s, cx + 6, cy - 4)];
    for (const c of colonies) {
      addWorkers(s, c.id, 3);
      c.founded = s.turn - 40;
    }
    const p = s.players.find((o) => o.id === 'england')!;
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('defence');
    colonies[2].buildings.stockade = 1;
    expect(expansionCheck(s, p, AI_PROFILES.competent)).toBe('ready');
  });
});
