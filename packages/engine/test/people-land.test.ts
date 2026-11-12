/**
 * Beta 3, land (docs/design/native-nations.md T5, section 18): European nations offer to buy a
 * playing people's land, or take it (peopleland.ts). A hidden test scenario, the Americas with the
 * Haudenosaunee and the Cherokee playable and `mechanics.landSales` on, carries it: offers answered
 * by a person and by the computer peoples' profiles, land taken with its costs, the computer
 * nations' deals by level, the gate (the Americas and the Caribbean have none), and save and load.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_PROFILES,
  AMERICAS,
  CARIBBEAN,
  LAND_SALES,
  NORTH_EAST,
  PEOPLE_BUILDINGS,
  PEOPLE_UNIT_TYPES,
  answerLandOffer,
  applyCommand,
  colonyAt,
  computerLandDeal,
  continuityStanding,
  createGame,
  createUnit,
  deserialize,
  homelandKept,
  landDealProblem,
  landOffersFor,
  landSalesOf,
  makePairTreaty,
  newColonyBuildings,
  offerForLand,
  pairTreaty,
  peopleLandPrice,
  processPeopleDiplomacy,
  registerScenario,
  serialize,
  settlementAt,
  standingOf,
  standingWith,
  takePeopleLand,
  TERRAIN,
  tileAt,
  tileWorkedBy,
  type Colony,
  type GameConfig,
  type GameState,
  type Scenario,
} from '../src/index.js';
import { gridOf } from '../src/grid.js';
import { addColony, colonyList, setUnitLoc } from '../src/unitindex.js';

const GAME: Scenario = {
  ...AMERICAS,
  id: 'test-people-land',
  name: 'People land test',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    playable: [
      { id: 'haudenosaunee', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] },
      { id: 'cherokee', name: 'the Cherokee', adjective: 'Cherokee', townNames: ['Chota', 'Tellico', 'Echota'] },
    ],
  },
  nationTypes: { ...AMERICAS.nationTypes, people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS], council: 'people' } },
  mechanics: { ...AMERICAS.mechanics, landSales: {} },
  victory: [{ id: 'military' }, { id: 'independence-war' }, { id: 'confederacy' }, { id: 'concord' }, { id: 'prosperity' }, { id: 'continuity' }, { id: 'good-life' }, { id: 'time' }],
};
registerScenario(GAME);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'creative', france: 'combative', netherlands: 'competent' },
    peoples: ['haudenosaunee'],
    scenario: GAME.id,
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...over,
  };
}

const town = (s: GameState, people = 'haudenosaunee'): Colony => colonyList(s).find((c) => c.owner === people)!;
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** A free land tile at exactly `d` tiles from (x, y). */
function landAt(s: GameState, x: number, y: number, d: number, claimedBy?: string): { x: number; y: number } {
  const grid = gridOf(s);
  for (const p of grid.tilesWithin(s.map, x, y, d)) {
    if (grid.distance(p.x, p.y, x, y) !== d) continue;
    const t = tileAt(s, p.x, p.y)!;
    if (TERRAIN[t.t].water || t.t === 'mountains' || t.t === 'arctic' || colonyAt(s, p.x, p.y) || settlementAt(s, p.x, p.y)) continue;
    if (claimedBy && t.claim !== claimedBy) continue;
    return p;
  }
  throw new Error('no free land');
}

/** A nation's colony two tiles from the Haudenosaunee capital, with one worker. */
function colonyNear(s: GameState, owner = 'england'): Colony {
  const t = town(s);
  const at = landAt(s, t.x, t.y, 3);
  const c: Colony = { id: `c-test-${owner}`, owner: owner as never, name: 'Testtown', x: at.x, y: at.y, goods: Object.fromEntries(Object.keys(t.goods).map((g) => [g, 0])) as Colony['goods'], buildings: newColonyBuildings(s, owner as never), build: null, hammers: 0, liberty: 0, founded: s.turn, exports: {} };
  addColony(s, c);
  const u = createUnit(s, owner as never, 'freeColonist', { kind: 'map', x: c.x, y: c.y });
  setUnitLoc(s, u, { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
  return c;
}

/** A tile of the people's homeland near the colony (within the rules' reach), not a town's. */
function homelandTile(s: GameState, c: Colony, people = 'haudenosaunee'): { x: number; y: number } {
  const home = new Set(s.homelands?.[people as 'haudenosaunee']?.tiles ?? []);
  const grid = gridOf(s);
  for (const p of grid.tilesWithin(s.map, c.x, c.y, LAND_SALES.reach)) {
    const t = tileAt(s, p.x, p.y)!;
    if (t.claim !== people || !home.has(p.y * s.map.width + p.x) || colonyAt(s, p.x, p.y) || TERRAIN[t.t].water || t.t === 'mountains') continue;
    return p;
  }
  throw new Error('no homeland tile near the colony');
}

describe('the gate', () => {
  it('the Americas and the Caribbean have no land sales; the North-east has them', () => {
    expect(AMERICAS.mechanics.landSales).toBeUndefined();
    expect(CARIBBEAN.mechanics.landSales).toBeUndefined();
    expect(NORTH_EAST.mechanics.landSales).toBeTruthy();
    const s = createGame({ ...config(), scenario: undefined, peoples: undefined });
    expect(landSalesOf(s)).toBeUndefined();
    expect(landDealProblem(s, 'england', 0, 0)).toMatch(/do not buy or take/);
  });
});

describe('an offer for a playing people’s land (section 18)', () => {
  it('a person playing the people answers: sold, the tile is the nation’s and leaves the homeland', () => {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    const c = colonyNear(s);
    const q = homelandTile(s, c);
    player(s, 'england').gold = 1000;
    const before = homelandKept(s, 'haudenosaunee');
    const price = peopleLandPrice(s, 'haudenosaunee');
    expect(price).toBe(80);
    expect(landDealProblem(s, 'england', q.x, q.y)).toBeNull();
    expect(offerForLand(s, 'england', q.x, q.y)).toMatch(/has been sent/);
    expect(landOffersFor(s, 'haudenosaunee')).toEqual([{ nation: 'england', x: q.x, y: q.y, gold: price, turn: s.turn }]);
    expect(() => offerForLand(s, 'england', q.x, q.y)).toThrow(/not answered/);
    expect(applyCommand(s, { type: 'answerLandOffer', nation: 'england', accept: true }).ok).toBe(true);
    expect(tileAt(s, q.x, q.y)!.claim).toBe('england');
    expect(player(s, 'england').gold).toBe(1000 - price);
    expect(player(s, 'haudenosaunee').gold).toBe(price);
    expect(homelandKept(s, 'haudenosaunee').kept).toBe(before.kept - 1);
    expect(standingOf(s, 'england', 'haudenosaunee')!.landSold).toBe(1);
    expect(landOffersFor(s, 'haudenosaunee')).toEqual([]);
    // The price rises as the homeland shrinks.
    expect(peopleLandPrice(s, 'haudenosaunee')).toBeGreaterThanOrEqual(price);
  });

  it('a refused offer leaves the land; an unanswered one lapses after `offerYears`', () => {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    const c = colonyNear(s);
    const q = homelandTile(s, c);
    player(s, 'england').gold = 1000;
    offerForLand(s, 'england', q.x, q.y, 120);
    expect(answerLandOffer(s, 'haudenosaunee', 'england', false)).toMatch(/keep your land/);
    expect(tileAt(s, q.x, q.y)!.claim).toBe('haudenosaunee');
    expect(player(s, 'england').gold).toBe(1000);
    offerForLand(s, 'england', q.x, q.y, 120);
    s.turn += LAND_SALES.offerYears * 2;
    processPeopleDiplomacy(s);
    expect(landOffersFor(s, 'haudenosaunee')).toEqual([]);
    expect(s.messages.some((m) => m.to === 'england' && /lapsed unanswered/.test(m.text))).toBe(true);
  });

  it('a computer people answers by its profile: Combative never sells, Naive does, and never its worked fields', () => {
    for (const level of ['combative', 'naive'] as const) {
      const s = createGame(config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent', haudenosaunee: level } }));
      const c = colonyNear(s);
      const q = homelandTile(s, c);
      player(s, 'england').gold = 100_000;
      makePairTreaty(s, 'england', 'haudenosaunee', 'people-trade');
      let sold = false;
      for (let i = 0; i < 30 && !sold; i++, s.turn++) sold = /a tile of their land for/.test(offerForLand(s, 'england', q.x, q.y, 160));
      expect(sold, level).toBe(level === 'naive');
      if (sold) expect(tileAt(s, q.x, q.y)!.claim).toBe('england');
    }
    const s = createGame(config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent', haudenosaunee: 'naive' } }));
    const worked = colonyList(s).flatMap((c) => (c.owner === 'haudenosaunee' ? [c] : [])).flatMap((c) => gridOf(s).tilesWithin(s.map, c.x, c.y, 1)).find((p) => tileWorkedBy(s, p.x, p.y)?.owner === 'haudenosaunee');
    expect(worked).toBeDefined();
    player(s, 'england').gold = 100_000;
    // A colonist standing on the worked field may ask for it (to found a colony), but a computer people never sells it.
    createUnit(s, 'england', 'freeColonist', { kind: 'map', x: worked!.x, y: worked!.y });
    for (let i = 0; i < 20; i++, s.turn++) expect(offerForLand(s, 'england', worked!.x, worked!.y, 500)).toMatch(/will not sell/);
  });

  it('only near a colony of the nation, or under its colonist; never a town’s tile', () => {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    const t = town(s);
    const far = landAt(s, t.x, t.y, 1, 'haudenosaunee');
    expect(landDealProblem(s, 'england', far.x, far.y)).toMatch(/within 3 tiles of one of your colonies/);
    createUnit(s, 'england', 'freeColonist', { kind: 'map', x: far.x, y: far.y });
    expect(landDealProblem(s, 'england', far.x, far.y)).toBeNull();
    expect(landDealProblem(s, 'england', t.x, t.y)).toMatch(/town stands there/);
    expect(landDealProblem(s, 'haudenosaunee', far.x, far.y)).toMatch(/Only a European nation/);
  });
});

describe('land taken (section 18)', () => {
  it('the tile is the nation’s, faith is broken, treaties refused for years, and a Combative people goes to war', () => {
    const s = createGame(config({ humans: ['england'], ai: { france: 'combative', netherlands: 'competent', haudenosaunee: 'combative' } }));
    const c = colonyNear(s);
    const q = homelandTile(s, c);
    makePairTreaty(s, 'england', 'haudenosaunee', 'people-trade');
    const text = takePeopleLand(s, 'england', q.x, q.y);
    expect(text).toMatch(/You take the land/);
    expect(text).toMatch(/go to war/);
    expect(tileAt(s, q.x, q.y)!.claim).toBe('england');
    expect(pairTreaty(s, 'people-trade', 'england', 'haudenosaunee')).toBeUndefined();
    const rel = standingOf(s, 'england', 'haudenosaunee')!;
    expect(rel.tookLand).toBe(s.turn);
    expect(rel.landTaken).toBe(1);
    expect(rel.waitUntil).toBeGreaterThan(s.turn);
    expect(player(s, 'haudenosaunee').stance.england).toBe('war');
    // No worker of the people stays on land that is no longer theirs.
    expect(tileWorkedBy(s, q.x, q.y)?.owner).not.toBe('haudenosaunee');
    const home = homelandKept(s, 'haudenosaunee');
    expect(continuityStanding(s, 'haudenosaunee').kept).toBe(home.kept / home.start);
    expect(home.kept).toBeLessThan(home.start);
  });
});

describe('computer nations by level (section 18)', () => {
  it('Combative takes, Competent offers the asking price, and each waits `waitYears` before asking that people again', () => {
    const s = createGame(config({ humans: ['haudenosaunee'] }));
    const c = colonyNear(s, 'france');
    player(s, 'france').gold = 5000;
    expect(computerLandDeal(s, 'france', c, AI_PROFILES.combative, 5000)).toBe(true);
    expect(standingOf(s, 'france', 'haudenosaunee')!.landTaken).toBe(1);
    // Waiting now.
    expect(computerLandDeal(s, 'france', c, AI_PROFILES.combative, 5000)).toBe(false);

    const n = createGame(config({ humans: ['haudenosaunee'] }));
    const d = colonyNear(n, 'netherlands');
    expect(computerLandDeal(n, 'netherlands', d, AI_PROFILES.competent, 0)).toBe(false);
    expect(computerLandDeal(n, 'netherlands', d, AI_PROFILES.competent, 5000)).toBe(true);
    expect(landOffersFor(n, 'haudenosaunee').map((o) => o.nation)).toEqual(['netherlands']);
    expect(standingOf(n, 'netherlands', 'haudenosaunee')!.landAsked).toBe(n.turn);
  });

  it('a game played by the computer with land sales on survives a save and load', () => {
    const s = createGame(config({ ai: { england: 'combative', france: 'competent', netherlands: 'creative', haudenosaunee: 'naive' } }));
    colonyNear(s, 'england');
    const rel = standingWith(s, 'england', 'haudenosaunee');
    rel.landOffer = { x: 1, y: 1, gold: 80, turn: 0 };
    const back = deserialize(serialize(s));
    expect(standingOf(back, 'england', 'haudenosaunee')!.landOffer).toEqual({ x: 1, y: 1, gold: 80, turn: 0 });
    expect(serialize(back)).toBe(serialize(s));
  });
});
