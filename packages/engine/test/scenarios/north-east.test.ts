/**
 * The North-east, 1000–1850 (Beta 3 step 8; native-nations.md T16–T20, section 13): the scenario's
 * data, its arrivals and entry points, the peoples who come to a region or leave it, land health by
 * the map's regions, the computer Europeans keeping to the Americas' dates, the arena with playing
 * peoples, and a game created, played by the computer through the first arrivals, saved and loaded.
 * The map is in north-east-map.test.ts; the conformance tests in test/scenarios.test.ts cover it too.
 */
import { describe, expect, it } from 'vitest';
import {
  aiTurn,
  applyCommand,
  calendarOf,
  createGame,
  deserialize,
  FATHERS,
  formatPeoples,
  formatDate,
  getScenario,
  lastTurn,
  listScenarios,
  NORTH_EAST,
  offerFathers,
  playableScenarios,
  playArenaRound,
  regionCount,
  regionName,
  regionOf,
  regionRenewal,
  serialize,
  storedMapEntry,
  TERRAIN,
  turnOfYear,
  VICTORY_ORDER,
  type GameConfig,
  type GameState,
  type NationId,
} from '../../src/index.js';
import { NORTH_EAST_RENEWAL } from '../../src/maps/north-east.js';
import { processPeopleMoves } from '../../src/peoplemoves.js';
import { colonyList } from '../../src/unitindex.js';

const PEOPLES = ['haudenosaunee', 'wendat', 'mikmaq', 'innu'] as const;

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 1497,
    mapSize: 'medium',
    map: 'north-east',
    nations: ['england', 'portugal', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'creative', portugal: 'competent', france: 'combative', netherlands: 'naive' },
    peoples: [...PEOPLES],
    scenario: 'north-east',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...over,
  };
}

function play(s: GameState, rounds: number): GameState {
  const until = s.turn + rounds;
  let guard = rounds * (s.players.length + 8);
  while (s.turn < until && !s.gameOver && guard-- > 0) {
    const r = applyCommand(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
  }
  return s;
}

describe('the North-east scenario', () => {
  it('is registered, hidden until the New game screen can offer a people', () => {
    expect(getScenario('north-east')).toBe(NORTH_EAST);
    expect(listScenarios()).toContain(NORTH_EAST);
    expect(NORTH_EAST.hidden).toBe(true);
    expect(playableScenarios()).not.toContain(NORTH_EAST);
    // Without a playing people nobody is there in 1000: every nation arrives later.
    expect(() => createGame(config({ peoples: [] }))).toThrow(/Nobody is in the game/);
  });

  it('plays one turn a year from 1000 to 1850, with head starts', () => {
    const cal = NORTH_EAST.calendar;
    expect(lastTurn(cal)).toBe(850);
    expect(formatDate(0, cal)).toBe('1000');
    expect(formatDate(850, cal)).toBe('1850');
    expect(cal.headStartYears).toEqual([1250, 1490, 1600, 1700]);
  });

  it('brings the Europeans one by one, each to its own entry point on the high seas', () => {
    const set = NORTH_EAST.nations.sets.real!;
    expect(set.map((e) => [e.id, e.arrives])).toEqual([
      ['england', 1497],
      ['portugal', 1500],
      ['france', 1534],
      ['spain', 1536],
      ['netherlands', 1614],
    ]);
    const entries = storedMapEntry(NORTH_EAST, 'north-east').entries!;
    const s = createGame(config());
    for (const e of set) {
      const [x, y] = entries[e.id as NationId]!;
      expect(s.map.tiles[y * s.map.width + x].t, e.id).toBe('highSeas');
    }
    // Nobody European is there at the start; the arrivals wait with their own entry points.
    expect(s.players.map((p) => p.id)).toEqual([...PEOPLES]);
    expect(s.arrivals!.map((a) => [a.nation, a.turn, a.entry])).toEqual([
      ['england', 497, { x: 40, y: 64 }],
      ['portugal', 500, { x: 80, y: 44 }],
      ['france', 534, { x: 62, y: 47 }],
      ['netherlands', 614, { x: 31, y: 72 }],
    ]);
  });

  it('judges both sides in the decided order, with every switch of the peoples’ economy on', () => {
    expect(NORTH_EAST.victory.map((v) => v.id)).toEqual([...VICTORY_ORDER]);
    const m = NORTH_EAST.mechanics;
    expect(m.hardYears).toBeTruthy();
    expect(m.landHealth).toBeTruthy();
    expect(m.epidemics).toBeTruthy();
    expect(m.independence).toBe(true);
    // No Norse, Greenland or Vikings anywhere (T17): they wait for Vinland.
    const text = JSON.stringify(NORTH_EAST);
    for (const word of ['Norse', 'Greenland', 'Viking', 'Vinland', 'Leif']) expect(text.includes(word), word).toBe(false);
  });

  it('names its peoples, four of them playable, with members of their own council', () => {
    expect(NORTH_EAST.peoples.ids).toHaveLength(19);
    expect(NORTH_EAST.peoples.playable!.map((p) => p.id)).toEqual([...PEOPLES]);
    expect(NORTH_EAST.peoples.settlements).toHaveProperty('nomadic');
    expect(NORTH_EAST.peoples.settlements).toHaveProperty('agricultural');
    const council = NORTH_EAST.councils.people;
    expect(council.members).toContain('membertou');
    expect(council.members).toContain('kondiaronk');
    expect(FATHERS.membertou.peoples).toEqual(['mikmaq']);
    expect(FATHERS.kondiaronk.peoples).toEqual(['wendat']);
    expect(FATHERS.clanMothers.peoples).toContain('haudenosaunee');
    // Each named member is offered only to its own people.
    const s = createGame(config());
    for (let i = 0; i < 40; i++) {
      for (const p of s.players) {
        offerFathers(s, p);
        const offered = Object.values(p.fatherOffer);
        if (offered.includes('membertou')) expect(p.id).toBe('mikmaq');
        if (offered.includes('kondiaronk')) expect(p.id).toBe('wendat');
        if (offered.includes('thayendanegea') || offered.includes('garakontie')) expect(p.id).toBe('haudenosaunee');
      }
    }
  });

  it('keeps the computer Europeans to the Americas’ dates, half as late again (ai.stretch 1.5)', () => {
    const s = createGame(config());
    // "Wars after turn 50" of the Americas is 1542, 50 years after 1492: here 75 years after, 1567.
    expect(aiTurn(s, 50)).toBe(turnOfYear(1567, calendarOf(s)));
    expect(aiTurn(s, 0)).toBe(492);
    // Its turn 120 (1600 and twelve turns of spring and autumn) is 1606: here 1663.
    expect(aiTurn(s, 120)).toBe(663);
    // Its independence plans from turn 160 and 240 (1626, 1666): here 1693 and 1753.
    expect(aiTurn(s, 160)).toBe(693);
    expect(aiTurn(s, 240)).toBe(753);
  });

  it('wears and renews the land by the map’s own regions', () => {
    const s = createGame(config());
    const land = s.land!;
    expect(land.map).toBe('north-east');
    expect(regionCount(land, s)).toBe(50);
    expect(land.health).toHaveLength(50);
    const onondaga = colonyList(s).find((c) => c.owner === 'haudenosaunee')!;
    const r = regionOf(land, onondaga.x, onondaga.y);
    expect(['finger-lakes', 'mohawk', 'genesee']).toContain(Object.keys(NORTH_EAST_RENEWAL)[r] && regionName(s, r).length ? Object.keys(NORTH_EAST_RENEWAL)[r] : '');
    expect(regionRenewal(s, r)).toBe(NORTH_EAST_RENEWAL[Object.keys(NORTH_EAST_RENEWAL)[r]]);
    // Over-hunting a region wears it by the excess over its own renewal.
    const before = land.health![r];
    land.taken![r] = regionRenewal(s, r) + 25;
    const year = s.turn;
    play(s, 1);
    expect(s.turn).toBe(year + 1);
    expect(land.health![r]).toBeLessThanOrEqual(before - 25 + 1);
  });

  it('lets the Dorset leave northern Labrador, the Inuit come, and the St. Lawrence Iroquoians go unless they play', () => {
    const s = createGame(config());
    const count = (tribe: string) => Object.values(s.settlements).filter((st) => st.tribe === tribe).length;
    expect(count('dorset')).toBe(3);
    expect(count('inuit')).toBe(0);
    expect(count('stLawrenceIroquoians')).toBe(3);
    const at = (year: number) => {
      s.turn = turnOfYear(year, calendarOf(s));
      processPeopleMoves(s);
    };
    at(1349);
    expect(count('dorset')).toBe(3);
    at(1350);
    expect(count('dorset')).toBe(0);
    at(1400);
    expect(count('inuit')).toBe(4);
    expect(Object.values(s.settlements).filter((st) => st.tribe === 'inuit' && st.capital)).toHaveLength(1);
    for (const st of Object.values(s.settlements)) expect(TERRAIN[s.map.tiles[st.y * s.map.width + st.x].t].water).toBe(false);
    // A playing people's towns are its player's: if the St. Lawrence Iroquoians played, they would stay.
    const kept = deserialize(serialize(s));
    kept.config = { ...kept.config, peoples: [...(kept.config.peoples ?? []), 'stLawrenceIroquoians'] };
    kept.turn = turnOfYear(1580, calendarOf(kept));
    processPeopleMoves(kept);
    expect(Object.values(kept.settlements).filter((st) => st.tribe === 'stLawrenceIroquoians')).toHaveLength(3);
    at(1580);
    expect(count('stLawrenceIroquoians')).toBe(0);
  });

  it('plays the arena with its playing peoples and reports them', () => {
    // Stopped in 1500: England has arrived, France has not, so France has no row.
    const rows = playArenaRound(
      { games: 1, turns: 500, mapSize: 'medium', levels: ['creative', 'competent'], scenario: 'north-east', map: 'north-east', peoples: [...PEOPLES] },
      { game: 0, seed: 77, line: [{ nation: 'england', level: 'creative' }, { nation: 'france', level: 'competent' }] },
    );
    const game = rows[0].peoplesGame!;
    expect(game.peoples.map((p) => p.people)).toEqual([...PEOPLES]);
    for (const p of game.peoples) expect(p.towns).toBeGreaterThan(0);
    expect(rows).toHaveLength(1);
    const text = formatPeoples(rows);
    expect(text).toContain('Playing peoples: 4 played in 1 games');
    expect(text).toContain('| haudenosaunee | 1 | 1 |');
    expect(text).toContain('Military victory: 0 of 1 games');
    // Without peoples the arena reports nothing more (the Americas' tournaments).
    expect(formatPeoples(rows.map(({ peoplesGame: _, ...r }) => r))).toBe('');
  });
});

describe('a computer game in the North-east', () => {
  it('plays through the first arrivals, saves and loads, and plays on the same', () => {
    const s = createGame(config());
    play(s, turnOfYear(1540, calendarOf(s)) - s.turn);
    expect(formatDate(s.turn, calendarOf(s))).toBe('1540');
    // England, Portugal and France have arrived and founded colonies; the Netherlands are still to come.
    const present = s.players.map((p) => p.id);
    for (const n of ['england', 'portugal', 'france']) expect(present, n).toContain(n);
    expect(present).not.toContain('netherlands');
    expect(colonyList(s).filter((c) => !(PEOPLES as readonly string[]).includes(c.owner)).length).toBeGreaterThan(0);
    // Every playing people is still on its land, with its council.
    for (const id of PEOPLES) expect(colonyList(s).some((c) => c.owner === id), id).toBe(true);
    // Saved and loaded, the game is the same and plays on the same.
    const loaded = deserialize(serialize(s));
    expect(serialize(loaded)).toBe(serialize(s));
    play(s, 80);
    play(loaded, 80);
    expect(serialize(loaded)).toBe(serialize(s));
    expect(s.players.map((p) => p.id)).toContain('netherlands');
  }, 300_000);
});
