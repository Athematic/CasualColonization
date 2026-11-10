import { describe, expect, it } from 'vitest';
import {
  ABANDON_MAX_COLONISTS,
  MINES,
  applyCommand,
  baseTileYield,
  colonyAt,
  createGame,
  createUnit,
  deserialize,
  foundColony,
  processColony,
  serialize,
  tileAt,
  type GameState,
} from '../src/index.js';

/** A one-nation game, human, with open plains and a colony at the centre. */
function setup(human = true) {
  const s = createGame({ seed: 11, mapSize: 'small', nations: ['england', 'france'], humans: human ? ['england'] : [], ai: { england: 'naive', france: 'naive' } });
  for (const u of Object.values(s.units)) delete s.units[u.id];
  for (const st of Object.values(s.settlements)) delete s.settlements[st.id];
  const w = s.map.width;
  const cy = Math.floor(s.map.height / 2);
  const cx = Math.floor(w / 2) - 6;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 14; dx++) s.map.tiles[(cy + dy) * w + cx + dx] = { t: 'plains', p: true };
  s.current = s.players.findIndex((p) => p.id === 'england');
  const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: cx, y: cy });
  u.moves = 3;
  const colony = foundColony(s, u.id);
  return { s, cx, cy, colony, first: u };
}

function addColonist(s: GameState, colonyId: string, type: 'freeColonist' | 'expertSilverMiner' = 'freeColonist') {
  const c = s.colonies[colonyId];
  const u = createUnit(s, 'england', type, { kind: 'map', x: c.x, y: c.y });
  applyCommand(s, { type: 'assignJob', unitId: u.id, colonyId });
  return u;
}

describe('mines running out', () => {
  function mine() {
    const g = setup();
    const { s, cx, cy, colony } = g;
    const m = { x: cx + 1, y: cy };
    s.map.tiles[m.y * s.map.width + m.x] = { t: 'mountains', b: true };
    const miner = addColonist(s, colony.id, 'expertSilverMiner');
    const r = applyCommand(s, { type: 'assignJob', unitId: miner.id, colonyId: colony.id, job: { kind: 'tile', x: m.x, y: m.y, good: 'silver' } });
    expect(r.ok).toBe(true);
    return { ...g, m, miner };
  }

  it('a silver deposit loses its bonus after the limit and says so', () => {
    const { s, colony, m } = mine();
    const tile = tileAt(s, m.x, m.y)!;
    const before = baseTileYield(tile, 'silver');
    let turns = 0;
    while (tile.b && turns++ < 500) processColony(s, colony);
    expect(tile.b).toBeUndefined();
    expect(s.mined![`${m.x},${m.y}`]).toBeGreaterThanOrEqual(MINES.bonusLimit.silver!);
    expect(baseTileYield(tile, 'silver')).toBe(before / 2);
    expect(s.messages.some((x) => x.text.includes('deposit') && x.text.includes('run out'))).toBe(true);
    expect(s.history!.some((h) => h.text.includes('run out'))).toBe(true);
  });

  it('a plain silver mountain is thinned once, halving its yield but never below 1', () => {
    const { s, colony, m } = mine();
    const tile = tileAt(s, m.x, m.y)!;
    delete tile.b;
    tile.r = true;
    tile.rv = 2;
    const before = baseTileYield(tile, 'silver');
    s.mined = { [`${m.x},${m.y}`]: MINES.thinLimit - 1 };
    processColony(s, colony);
    expect(tile.d).toBe(true);
    expect(baseTileYield(tile, 'silver')).toBe(Math.max(1, Math.floor(before / 2)));
    expect(baseTileYield({ t: 'mountains', d: true }, 'silver')).toBe(1);
  });

  it('is deterministic and survives a save', () => {
    const a = mine();
    const b = mine();
    for (let i = 0; i < 30; i++) {
      processColony(a.s, a.colony);
      processColony(b.s, b.colony);
    }
    expect(serialize(a.s)).toBe(serialize(b.s));
    const back = deserialize(serialize(a.s));
    expect(back.mined).toEqual(a.s.mined);
  });

  it('old states without the counter load and run', () => {
    const { s, colony } = setup();
    expect(s.mined).toBeUndefined();
    processColony(s, colony);
    expect(deserialize(serialize(s)).mined).toBeUndefined();
  });
});

describe('abandoning a colony', () => {
  it('puts the colonists on the tile and removes the colony', () => {
    const { s, colony, cx, cy } = setup();
    addColonist(s, colony.id);
    expect(applyCommand(s, { type: 'abandonColony', colonyId: colony.id })).toMatchObject({ ok: true });
    expect(s.colonies[colony.id]).toBeUndefined();
    expect(colonyAt(s, cx, cy)).toBeUndefined();
    const out = Object.values(s.units).filter((u) => u.loc.kind === 'map' && u.loc.x === cx && u.loc.y === cy);
    expect(out).toHaveLength(2);
    expect(out.every((u) => u.moves > 0)).toBe(true);
    expect(s.history!.some((h) => h.text.includes('abandoned'))).toBe(true);
  });

  it('refuses a stockade, a big colony and a foreign colony', () => {
    const { s, colony } = setup();
    colony.buildings.stockade = 1;
    expect(applyCommand(s, { type: 'abandonColony', colonyId: colony.id }).ok).toBe(false);
    colony.buildings.stockade = 0;
    for (let i = 0; i < ABANDON_MAX_COLONISTS; i++) addColonist(s, colony.id);
    const r = applyCommand(s, { type: 'abandonColony', colonyId: colony.id });
    expect(r.ok).toBe(false);
    expect(s.colonies[colony.id]).toBeDefined();
    colony.owner = 'france';
    expect(applyCommand(s, { type: 'abandonColony', colonyId: colony.id }).ok).toBe(false);
  });
});

describe('retiring', () => {
  it('ends the game with the usual scores and the year', () => {
    const { s } = setup();
    const r = applyCommand(s, { type: 'retire' });
    expect(r.ok).toBe(true);
    expect(s.gameOver?.retired).toBe(true);
    expect(s.gameOver?.reason).toBe('Retired in 1492.');
    expect(Object.keys(s.gameOver!.scores).sort()).toEqual(['england', 'france']);
    expect(applyCommand(s, { type: 'retire' }).ok).toBe(false);
  });

  it('is not for the computer', () => {
    const { s } = setup(false);
    expect(applyCommand(s, { type: 'retire' }).ok).toBe(false);
    expect(s.gameOver).toBeUndefined();
  });
});
