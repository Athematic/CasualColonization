/**
 * Beta 3, land 2 (docs/design/native-nations.md section 19, Simon's answers to section 18): the pull
 * of a playing people's farmland on the computer Europeans' choice of sites, who buys and who takes
 * (each level's way), a computer people's trust grown in peace, meetings in person (a good life
 * counts only those as met), and a computer people's new runner. The Americas with the Haudenosaunee
 * playable, `mechanics.landSales` (with a pull) and `mechanics.mapKnowledge` on, carries it.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_PROFILES,
  AMERICAS,
  LAND_SALES,
  NORTH_EAST,
  PEOPLE_BUILDINGS,
  PEOPLE_UNIT_TYPES,
  PULL_FADE,
  calendarOf,
  colonyAt,
  computerLandDeal,
  computerTakes,
  createGame,
  createUnit,
  deserialize,
  farmlandPull,
  goodLifeStanding,
  landOffersFor,
  landTrust,
  makePairTreaty,
  newColonyBuildings,
  noteMeetings,
  offerForLand,
  registerScenario,
  runPeopleAi,
  serialize,
  settlementAt,
  standingOf,
  standingWith,
  TERRAIN,
  tileAt,
  turnAfterYears,
  turnOfYear,
  type Colony,
  type GameConfig,
  type GameState,
  type Scenario,
} from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { addColony, colonyList, removeUnit, setUnitLoc } from '../src/unitindex.js';

const BASE: Scenario = {
  ...AMERICAS,
  id: 'test-people-land-pressure',
  name: 'People land pressure test',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    playable: [{ id: 'haudenosaunee', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] }],
  },
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
  mechanics: { ...AMERICAS.mechanics, landSales: {} },
  victory: [{ id: 'military' }, { id: 'independence-war' }, { id: 'confederacy' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'continuity' }, { id: 'good-life' }, { id: 'time' }],
};
registerScenario(BASE);
/** The same with a pull and with peoples knowing the land (runners explore, meetings in person count). */
const PRESSED: Scenario = { ...BASE, id: 'test-people-land-pressed', mechanics: { ...BASE.mechanics, landSales: { pull: 0.5 }, mapKnowledge: { seen: false, share: false, range: 8 } } };
registerScenario(PRESSED);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'creative', france: 'combative', netherlands: 'competent' },
    peoples: ['haudenosaunee'],
    scenario: BASE.id,
    ...over,
  };
}

const town = (s: GameState): Colony => colonyList(s).find((c) => c.owner === 'haudenosaunee')!;
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** A free land tile at exactly `d` tiles from (x, y). */
function landAt(s: GameState, x: number, y: number, d: number): { x: number; y: number } {
  const grid = gridOf(s);
  for (const p of grid.tilesWithin(s.map, x, y, d)) {
    if (grid.distance(p.x, p.y, x, y) !== d) continue;
    const t = tileAt(s, p.x, p.y)!;
    if (TERRAIN[t.t].water || t.t === 'mountains' || t.t === 'arctic' || colonyAt(s, p.x, p.y) || settlementAt(s, p.x, p.y)) continue;
    return p;
  }
  throw new Error('no free land');
}

/** A nation's colony three tiles from the Haudenosaunee capital, with one worker. */
function colonyNear(s: GameState, owner: string): Colony {
  const t = town(s);
  const at = landAt(s, t.x, t.y, 3);
  const c: Colony = { id: `c-test-${owner}`, owner: owner as never, name: 'Testtown', x: at.x, y: at.y, goods: Object.fromEntries(Object.keys(t.goods).map((g) => [g, 0])) as Colony['goods'], buildings: newColonyBuildings(s, owner as never), build: null, hammers: 0, liberty: 0, founded: s.turn, exports: {} };
  addColony(s, c);
  const u = createUnit(s, owner as never, 'freeColonist', { kind: 'map', x: c.x, y: c.y });
  setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
  return c;
}

/** A tile of the people's homeland within the rules' reach of the colony, not a town's or a worked one. */
function homelandTile(s: GameState, c: Colony): { x: number; y: number } {
  const home = new Set(s.homelands?.haudenosaunee?.tiles ?? []);
  for (const p of gridOf(s).tilesWithin(s.map, c.x, c.y, LAND_SALES.reach)) {
    const t = tileAt(s, p.x, p.y)!;
    if (t.claim !== 'haudenosaunee' || !home.has(p.y * s.map.width + p.x) || colonyAt(s, p.x, p.y) || TERRAIN[t.t].water || t.t === 'mountains') continue;
    return p;
  }
  throw new Error('no homeland tile near the colony');
}

describe('who buys, who takes, and trust grown in peace', () => {
  it('a computer people is wary at first, more willing with a trade treaty and after years of good relations', () => {
    const s = createGame(config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent', haudenosaunee: 'naive' } }));
    const rel = standingWith(s, 'england', 'haudenosaunee');
    delete rel.goodSince;
    expect(landTrust(s, 'haudenosaunee', 'england')).toBeCloseTo(LAND_SALES.wary);
    makePairTreaty(s, 'england', 'haudenosaunee', 'people-trade');
    const withTreaty = landTrust(s, 'haudenosaunee', 'england');
    expect(withTreaty).toBeGreaterThan(LAND_SALES.wary);
    rel.goodSince = s.turn;
    s.turn = turnAfterYears(rel.goodSince, LAND_SALES.peaceYears / 2, calendarOf(s));
    expect(landTrust(s, 'haudenosaunee', 'england')).toBeGreaterThan(withTreaty);
    s.turn = turnAfterYears(rel.goodSince, LAND_SALES.peaceYears, calendarOf(s));
    expect(landTrust(s, 'haudenosaunee', 'england')).toBeCloseTo(1);
  });

  it('Combative takes; Creative never does; Competent only from 1750, after three refusals, and rarely', () => {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    const cal = calendarOf(s);
    expect(computerTakes(s, 'france', AI_PROFILES.combative, 'haudenosaunee')).toBe(true);
    s.turn = turnOfYear(1800, cal);
    for (let i = 0; i < 50; i++, s.turn++) expect(computerTakes(s, 'england', AI_PROFILES.creative, 'haudenosaunee')).toBe(false);
    const rel = standingWith(s, 'netherlands', 'haudenosaunee');
    rel.landRefused = 5;
    s.turn = turnOfYear(1700, cal);
    for (let i = 0; i < 20; i++, s.turn++) expect(computerTakes(s, 'netherlands', AI_PROFILES.competent, 'haudenosaunee')).toBe(false);
    rel.landRefused = 2;
    s.turn = turnOfYear(1800, cal);
    for (let i = 0; i < 50; i++, s.turn++) expect(computerTakes(s, 'netherlands', AI_PROFILES.competent, 'haudenosaunee')).toBe(false);
    rel.landRefused = 3;
    let takes = 0;
    for (let i = 0; i < 400; i++, s.turn++) if (computerTakes(s, 'netherlands', AI_PROFILES.competent, 'haudenosaunee')) takes++;
    expect(takes).toBeGreaterThan(0);
    expect(takes).toBeLessThan(60);
  });

  it('a refused offer is counted on the pair’s record', () => {
    const s = createGame(config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent', haudenosaunee: 'combative' } }));
    const c = colonyNear(s, 'england');
    const q = homelandTile(s, c);
    player(s, 'england').gold = 10_000;
    expect(offerForLand(s, 'england', q.x, q.y)).toMatch(/will not sell/);
    expect(standingOf(s, 'england', 'haudenosaunee')!.landRefused).toBe(1);
  });

  it('a Creative nation offers rather than takes, late in the game too', () => {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    const c = colonyNear(s, 'england');
    player(s, 'england').gold = 5000;
    s.turn = turnOfYear(1820, calendarOf(s));
    expect(computerLandDeal(s, 'england', c, AI_PROFILES.creative, 5000)).toBe(true);
    expect(landOffersFor(s, 'haudenosaunee').map((o) => o.nation)).toEqual(['england']);
    expect(standingOf(s, 'england', 'haudenosaunee')!.landTaken).toBeUndefined();
  });
});

describe('the pull of a people’s farmland', () => {
  it('none without the scenario’s `pull`; with it, a site beside a playing people’s land is worth more', () => {
    expect(farmlandPull(createGame(config()), 'england')).toBeUndefined();
    const ne = NORTH_EAST.mechanics.landSales;
    expect(ne && ne.pull).toBeGreaterThan(0);
    const s = createGame(config({ scenario: PRESSED.id }));
    const pull = farmlandPull(s, 'england')!;
    const t = town(s);
    const near = landAt(s, t.x, t.y, 3);
    expect(pull(near.x, near.y)).toBeGreaterThan(0);
    // Beyond the fade from every claimed tile: nothing.
    const grid = gridOf(s);
    const claimed = s.map.tiles.flatMap((tile, i) => (tile.claim === 'haudenosaunee' ? [i] : []));
    const far = s.map.tiles.findIndex((tile, i) => !TERRAIN[tile.t].water && claimed.every((k) => grid.distance(i % s.map.width, Math.floor(i / s.map.width), k % s.map.width, Math.floor(k / s.map.width)) > LAND_SALES.reach + PULL_FADE));
    expect(pull(far % s.map.width, Math.floor(far / s.map.width))).toBe(0);
  });
});

describe('meetings in person', () => {
  it('a standing record alone (a shared map) is no meeting; a unit within sight is; a good life counts only meetings', () => {
    const s = createGame(config({ scenario: PRESSED.id, humans: ['haudenosaunee'] }));
    const rel = standingWith(s, 'england', 'haudenosaunee');
    noteMeetings(s);
    expect(rel.metInPerson).toBeUndefined();
    expect(goodLifeStanding(s, 'haudenosaunee').met).toBe(0);
    const t = town(s);
    const at = landAt(s, t.x, t.y, 2);
    createUnit(s, 'england', 'freeColonist', { kind: 'map', x: at.x, y: at.y });
    noteMeetings(s);
    expect(rel.metInPerson).toBe(s.turn);
    expect(goodLifeStanding(s, 'haudenosaunee').met).toBe(1);
    // Without map knowledge in the scenario, every side with a standing record counts, as before.
    const old = createGame(config({ humans: ['haudenosaunee'] }));
    standingWith(old, 'england', 'haudenosaunee');
    expect(goodLifeStanding(old, 'haudenosaunee').met).toBe(1);
  });

  it('the new records survive a save and load', () => {
    const s = createGame(config({ scenario: PRESSED.id }));
    const rel = standingWith(s, 'england', 'haudenosaunee');
    rel.metInPerson = 3;
    rel.landRefused = 2;
    const back = deserialize(serialize(s));
    expect(standingOf(back, 'england', 'haudenosaunee')).toMatchObject({ metInPerson: 3, landRefused: 2 });
    expect(serialize(back)).toBe(serialize(s));
  });
});

describe('a new runner', () => {
  it('a computer people that lost its runner sends a new one from a town with food to spare, where runners explore', () => {
    const ai = { england: 'creative', france: 'combative', netherlands: 'competent', haudenosaunee: 'competent' } as const;
    for (const [scenario, expected] of [[PRESSED.id, 1], [BASE.id, 0]] as const) {
      const s = createGame(config({ scenario, ai }));
      const runners = () => Object.values(s.units).filter((u) => u.owner === 'haudenosaunee' && u.type === 'runner');
      for (const u of runners()) removeUnit(s, u.id);
      for (const c of colonyList(s)) if (c.owner === 'haudenosaunee') c.goods.food = 500;
      s.turn = 0;
      runPeopleAi(s, player(s, 'haudenosaunee'));
      expect(runners(), scenario).toHaveLength(expected);
    }
  });
});
