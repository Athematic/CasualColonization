import { describe, expect, it } from 'vitest';
import { roadRoute, roadTargets } from '../src/ai/roads.js';
import { cargoShipWanted, fleetReport } from '../src/ai/fleet.js';
import {
  applyCommand,
  createGame,
  createUnit,
  foundColony,
  formatFeatures,
  player,
  runArena,
  setFeatureSink,
  track,
  type GameState,
} from '../src/index.js';

/** A one-nation computer game with two colonies four tiles apart on open, plowed plains. */
function twoColonies(level: 'competent' | 'creative' = 'competent') {
  const s = createGame({ seed: 11, mapSize: 'small', nations: ['england'], humans: [], ai: { england: level } });
  for (const u of Object.values(s.units)) delete s.units[u.id];
  const w = s.map.width;
  const y = Math.floor(s.map.height / 2);
  const x = Math.floor(w / 2) - 2;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 6; dx++) s.map.tiles[(y + dy) * w + x + dx] = { t: 'plains', p: true };
  }
  for (const st of Object.values(s.settlements)) if (Math.abs(st.x - x - 2) <= 6 && Math.abs(st.y - y) <= 5) delete s.settlements[st.id];
  const settler = (sx: number) => {
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: sx, y });
    u.moves = 3;
    return u.id;
  };
  const a = foundColony(s, settler(x));
  const b = foundColony(s, settler(x + 4));
  return { s, a, b };
}

function roadLinked(s: GameState, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const w = s.map.width;
  const seen = new Set([a.y * w + a.x]);
  const queue = [a];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === b.x && p.y === b.y) return true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = { x: p.x + dx, y: p.y + dy };
        const i = n.y * w + n.x;
        if (!seen.has(i) && s.map.tiles[i]?.r) {
          seen.add(i);
          queue.push(n);
        }
      }
    }
  }
  return false;
}

describe('advanced AI features', () => {
  it('plans a road between two nearby colonies', () => {
    const { s, a, b } = twoColonies();
    const route = roadRoute(s, player(s, 'england'), a, b)!;
    expect(route).toHaveLength(3);
    expect(roadTargets(s, player(s, 'england'))).toEqual(expect.arrayContaining(route));
  });

  it('a competent AI with an idle pioneer builds a road between two colonies', () => {
    const { s, a, b } = twoColonies();
    const pioneer = createUnit(s, 'england', 'hardyPioneer', { kind: 'map', x: a.x, y: a.y });
    pioneer.role = 'pioneer';
    pioneer.tools = 100;
    expect(roadLinked(s, a, b)).toBe(false);
    for (let i = 0; i < 16 && !roadLinked(s, a, b); i++) applyCommand(s, { type: 'endTurn' });
    expect(roadLinked(s, a, b)).toBe(true);
  });

  it('a creative AI re-equips a worn-out hardy pioneer from colony tools', () => {
    const { s, a } = twoColonies('creative');
    const hardy = createUnit(s, 'england', 'hardyPioneer', { kind: 'map', x: a.x, y: a.y });
    applyCommand(s, { type: 'endTurn' });
    expect(hardy.loc.kind).toBe('colony');
    a.goods.tools = 100;
    a.build = null;
    applyCommand(s, { type: 'endTurn' });
    expect(Object.values(s.units).some((u) => u.owner === 'england' && u.role === 'pioneer')).toBe(true);
  });

  it('wants more cargo ships once goods pile up in its ports', () => {
    const { s, a, b } = twoColonies();
    const p = player(s, 'england');
    createUnit(s, 'england', 'caravel', { kind: 'europe' });
    // Make both colonies ports by flooding a tile next to each.
    const w = s.map.width;
    s.map.tiles[(a.y - 1) * w + a.x] = { t: 'ocean' };
    s.map.tiles[(b.y - 1) * w + b.x] = { t: 'ocean' };
    a.goods.furs = 300;
    b.goods.sugar = 300;
    expect(cargoShipWanted(fleetReport(s, p), 1000)).toBeNull();
    expect(cargoShipWanted(fleetReport(s, p), 5000)).toBe('merchantman');
  });
});

describe('feature audit', () => {
  it('counts features only while a sink is installed', () => {
    const seen: string[] = [];
    track('england', 'ignored');
    const prev = setFeatureSink((nation, feature) => seen.push(`${nation}:${feature}`));
    track('england', 'cmd:test');
    setFeatureSink(prev);
    track('england', 'ignored');
    expect(seen).toEqual(['england:cmd:test']);
  });

  it('reports feature use per level in the arena and flags unused ones', () => {
    const { summary, entries } = runArena({ games: 1, turns: 40, mapSize: 'small', levels: ['naive', 'competent'], firstSeed: 7, features: true });
    expect(entries.every((e) => e.features && e.features['cmd:endTurn'] > 0)).toBe(true);
    const table = formatFeatures(summary.map((r) => ({ level: r.level, features: r.features! })));
    expect(table).toContain('| cmd:foundColony |');
    expect(table).toContain('never: Competent');
    // Off by default, and counting changes nothing in the games.
    const plain = runArena({ games: 1, turns: 40, mapSize: 'small', levels: ['naive', 'competent'], firstSeed: 7 });
    expect(plain.entries[0].features).toBeUndefined();
    expect(plain.entries.map((e) => e.score)).toEqual(entries.map((e) => e.score));
  }, 60_000);
});
