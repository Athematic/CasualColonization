/**
 * Beta 3, step 5 (docs/design/native-nations.md T13): knowledge of the land as a trait of the people
 * nation type. A playing people's land units pay at most the river cost on its own and unclaimed
 * land, except on plowed tiles; a road still wins; another player's land is not known. The path
 * search uses the same costs. A scenario may switch the trait off (`nationTypes.people.knowsLand`).
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  PEOPLE_BUILDINGS,
  PEOPLE_UNIT_TYPES,
  RIVER_MOVE_COST,
  ROAD_MOVE_COST,
  braveStepCost,
  colonyAt,
  createGame,
  createUnit,
  findPath,
  knownLand,
  knowsLand,
  moveCost,
  registerScenario,
  settlementAt,
  tileAt,
  unitsAt,
  type GameConfig,
  type GameState,
  type Scenario,
  type Tile,
  type Unit,
} from '../src/index.js';

const LAND_GAME: Scenario = {
  ...AMERICAS,
  id: 'test-knows-land',
  name: 'Knowledge of the land test',
  hidden: true,
  peoples: { ...AMERICAS.peoples, playable: [{ id: 'iroquois', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga'] }] },
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
};
registerScenario(LAND_GAME);

/** The same game with the trait switched off on the people's nation type. */
const UNKNOWING_GAME: Scenario = {
  ...LAND_GAME,
  id: 'test-knows-land-off',
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people', knowsLand: false } },
};
registerScenario(UNKNOWING_GAME);

function game(scenario = LAND_GAME.id): GameState {
  const config: GameConfig = {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'competent', france: 'combative', netherlands: 'creative' },
    peoples: ['iroquois'],
    scenario,
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
  };
  return createGame(config);
}

/** A new land unit of the people or of a nation, on a tile. */
const landUnit = (s: GameState, owner: 'iroquois' | 'england', x: number, y: number): Unit =>
  createUnit(s, owner, owner === 'iroquois' ? 'townsperson' : 'freeColonist', { kind: 'map', x, y });

/** A clean block of land, `w` tiles wide and three rows high, with nothing on it; its middle row's west end. */
function clearBlock(s: GameState, w: number): { x: number; y: number } {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - w - 3; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) {
        for (let dx = -1; dx <= w && ok; dx++) {
          const t = tileAt(s, x + dx, y + dy)!;
          if (t.t === 'ocean' || t.t === 'highSeas' || t.t === 'arctic' || colonyAt(s, x + dx, y + dy) || settlementAt(s, x + dx, y + dy) || unitsAt(s, x + dx, y + dy).length) ok = false;
          if (Object.values(s.braves ?? {}).some((b) => b.x === x + dx && b.y === y + dy)) ok = false;
        }
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('No clean block of land on this map.');
}

/** Makes a tile plain: the terrain given, no forest, river, road, plowing or claim. */
function plain(t: Tile, terrain: Tile['t'], over: Partial<Tile> = {}): void {
  t.t = terrain;
  delete t.f;
  delete t.rv;
  delete t.r;
  delete t.p;
  delete t.claim;
  delete t.use;
  Object.assign(t, over);
}

describe('knowledge of the land (T13)', () => {
  it('is a trait of a playing people only, switched off by the scenario', () => {
    const s = game();
    expect(knowsLand(s, 'iroquois')).toBe(true);
    for (const id of ['england', 'france', 'netherlands', 'crown', 'hudsonsBay'] as const) expect(knowsLand(s, id), id).toBe(false);
    expect(knowsLand(game(UNKNOWING_GAME.id), 'iroquois')).toBe(false);
  });

  it('costs at most the river cost on own and unclaimed land, not on plowed land or another player\'s', () => {
    const s = game();
    const { x, y } = clearBlock(s, 2);
    const people = landUnit(s, 'iroquois', x, y);
    const nation = landUnit(s, 'england', x, y);
    const from = tileAt(s, x, y)!;
    const to = tileAt(s, x + 1, y)!;
    plain(from, 'plains');
    const cost = (u: Unit) => moveCost(s, u, x, y, x + 1, y);

    // Unclaimed forest and mountains: river cost for the people, full cost for a nation.
    plain(to, 'plains', { f: true });
    expect(cost(people)).toBe(RIVER_MOVE_COST);
    expect(cost(nation)).toBe(6);
    plain(to, 'mountains');
    expect(cost(people)).toBe(RIVER_MOVE_COST);
    expect(cost(nation)).toBe(9);
    plain(to, 'plains');
    expect(cost(people)).toBe(RIVER_MOVE_COST);
    expect(cost(nation)).toBe(3);

    // Its own claimed land, also where leased to a nation (the claim stays the people's).
    plain(to, 'hills', { claim: 'iroquois' });
    expect(cost(people)).toBe(RIVER_MOVE_COST);
    plain(to, 'hills', { claim: 'iroquois', use: 'england' });
    expect(cost(people)).toBe(RIVER_MOVE_COST);
    expect(knownLand(to, 'iroquois')).toBe(true);

    // Plowed land is lost to it, own or unclaimed.
    plain(to, 'plains', { p: true });
    expect(knownLand(to, 'iroquois')).toBe(false);
    expect(cost(people)).toBe(3);
    plain(to, 'plains', { p: true, claim: 'iroquois' });
    expect(cost(people)).toBe(3);

    // Someone else's claimed land: a nation's, or another people's.
    plain(to, 'plains', { f: true, claim: 'england' });
    expect(cost(people)).toBe(6);
    plain(to, 'plains', { f: true, claim: 'cherokee' });
    expect(cost(people)).toBe(6);

    // A road still wins where it is as cheap or cheaper, on anyone's land, plowed or not.
    plain(from, 'plains', { r: true });
    plain(to, 'plains', { f: true, r: true, claim: 'england', p: true });
    expect(cost(people)).toBe(ROAD_MOVE_COST);
    expect(cost(nation)).toBe(ROAD_MOVE_COST);
    // The trait is judged by the tile entered: leaving plowed land onto known land is cheap.
    plain(from, 'plains', { p: true });
    plain(to, 'mountains');
    expect(cost(people)).toBe(RIVER_MOVE_COST);
  });

  it('is off where the scenario switches it off', () => {
    const s = game(UNKNOWING_GAME.id);
    const { x, y } = clearBlock(s, 2);
    const people = landUnit(s, 'iroquois', x, y);
    plain(tileAt(s, x, y)!, 'plains');
    plain(tileAt(s, x + 1, y)!, 'plains', { f: true, claim: 'iroquois' });
    expect(moveCost(s, people, x, y, x + 1, y)).toBe(6);
  });

  it('leaves the braves of peoples nobody plays as Beta 2 had them', () => {
    const s = game();
    const { x, y } = clearBlock(s, 2);
    plain(tileAt(s, x, y)!, 'plains');
    plain(tileAt(s, x + 1, y)!, 'plains', { f: true });
    expect(braveStepCost(s, x, y, x + 1, y, false)).toBe(6);
    expect(braveStepCost(s, x, y, x + 1, y, true)).toBe(RIVER_MOVE_COST);
  });

  it('is what the path search costs', () => {
    // A strip four steps long: the middle row unclaimed mountains, the rows beside it a nation's plains.
    // A people's unit goes straight over the mountains (4 move points); a nation's goes around them.
    for (const [id, knows] of [[LAND_GAME.id, true], [UNKNOWING_GAME.id, false]] as const) {
      const s = game(id);
      const { x, y } = clearBlock(s, 5);
      for (let dx = -1; dx <= 5; dx++) {
        for (const dy of [-2, -1, 1, 2]) plain(tileAt(s, x + dx, y + dy)!, 'plains', { claim: 'england' });
        plain(tileAt(s, x + dx, y)!, dx >= 1 && dx <= 3 ? 'mountains' : 'plains', dx === -1 || dx === 5 ? { claim: 'england' } : {});
      }
      for (const owner of ['iroquois', 'england'] as const) {
        const u = landUnit(s, owner, x, y);
        const path = findPath(s, u, x + 4, y)!;
        expect(path, owner).not.toBeNull();
        let at = { x, y };
        let total = 0;
        for (const step of path) {
          total += moveCost(s, u, at.x, at.y, step.x, step.y);
          at = step;
        }
        const straight = path.every((p) => p.y === y);
        if (owner === 'iroquois' && knows) {
          expect(straight).toBe(true);
          expect(total).toBe(4 * RIVER_MOVE_COST);
        } else {
          // Around the mountains on the plains beside them: never over all three.
          expect(path.filter((p) => p.y === y && p.x > x && p.x < x + 4).length).toBeLessThan(3);
          expect(total).toBeLessThan(9 * 3);
        }
      }
    }
  });
});
