/**
 * Vinland, around 1000 (Beta 4 step 4; docs/design/hex-maps.md H21).
 *
 * Tests the hex-only Vinland scenario on both `north-east-hex` and `vinland-atlantic`,
 * the Thing council, the Norse departure/thriving check, thriving end-year victory,
 * map-filtered playable peoples, full 201-turn completion, and T17 isolation.
 */
import { describe, expect, it } from 'vitest';
import {
  addColony,
  AMERICAS,
  CARIBBEAN,
  checkVictory,
  createGame,
  createUnit,
  departureYearFor,
  deserialize,
  emptyGoods,
  endTurn,
  europeansDefeated,
  goodsOf,
  gridOf,
  HEX_POINTY,
  isThriving,
  lastTurn,
  newColonyBuildings,
  NORTH_EAST,
  orderedVictory,
  peopleRelationKey,
  playablePeoplesForMap,
  processDepartures,
  serialize,
  setUnitLoc,
  term,
  VINLAND,
  VINLAND_CALENDAR,
} from '../../src/index.js';
import type { Colony, GameState } from '../../src/index.js';

function addTestColony(s: GameState, id: string, owner: 'norse', x: number, y: number, food = 100): Colony {
  const goods = emptyGoods(goodsOf(s));
  goods.food = food;
  const colony: Colony = {
    id,
    owner,
    name: `Test-${id}`,
    x,
    y,
    goods,
    buildings: newColonyBuildings(s, owner),
    build: null,
    hammers: 0,
    liberty: 0,
    founded: s.turn,
    exports: {},
  };
  addColony(s, colony);
  const p = s.players.find((o) => o.id === owner)!;
  p.coloniesFounded++;
  const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
  setUnitLoc(s, u, { kind: 'colony', colonyId: colony.id, job: { kind: 'building', building: 'townHall' } });
  return colony;
}

describe('Vinland, around 1000 (Beta 4 step 4)', () => {
  it('registers as a pointy-top hex scenario with two maps, two work rings, and the 18-member Thing', () => {
    expect(VINLAND.map.grid).toBe('hex');
    expect(VINLAND.map.hex?.orientation).toBe('pointy');
    expect(VINLAND.map.workArea?.rings).toEqual([{}, { size: 5 }]);
    expect(VINLAND.map.stored.map((m) => m.id)).toEqual(['north-east-hex', 'vinland-atlantic']);
    expect(VINLAND.councils.thing.members).toHaveLength(18);
    expect(VINLAND.peoples.playable?.map((p) => p.id)).toEqual(['beothuk', 'innu', 'mikmaq', 'haudenosaunee']);
  });

  it('uses Vinland-appropriate Scenario.text terms instead of Europe / New World / Crown defaults', () => {
    const s = createGame({
      scenario: 'vinland',
      map: 'north-east-hex',
      mapSize: 'large',
      seed: 1000,
      nations: ['norse'],
      peoples: ['beothuk'],
      humans: ['norse'],
    });
    expect(term(s, 'homeland')).toBe('Greenland');
    expect(term(s, 'homelandAdjective')).toBe('Norse');
    expect(term(s, 'colonyLand')).toBe('Vinland');
    const arrival = term(s, 'arrival', { nation: 'the Norse', heading: 'west' });
    expect(arrival).toContain('Vinland');
    expect(arrival).toContain('Greenland');
    expect(arrival).not.toMatch(/Majesty|New World|Europe/);
  });

  it.each(['north-east-hex', 'vinland-atlantic'] as const)('plays 30 rounds on %s with Norse and playing peoples and survives save/load', (mapId) => {
    const s = createGame({
      scenario: 'vinland',
      map: mapId,
      mapSize: 'large',
      seed: 1021,
      nations: ['norse'],
      peoples: ['beothuk', 'innu'],
      humans: [],
      ai: { norse: 'competent', beothuk: 'competent', innu: 'competent' },
    });
    expect(gridOf(s)).toBe(HEX_POINTY);
    expect(s.players.map((p) => p.id)).toEqual(['norse', 'beothuk', 'innu']);
    for (let i = 0; i < 30; i++) endTurn(s);
    const copy = deserialize(serialize(s));
    expect(copy.turn).toBe(s.turn);
    expect(Object.keys(copy.colonies).length).toBe(Object.keys(s.colonies).length);
  });

  it('filters playable peoples by map and starts games with each playable people on both maps', () => {
    const nePeoples = playablePeoplesForMap(VINLAND, 'north-east-hex').map((p) => p.id);
    expect(nePeoples).toEqual(['beothuk', 'innu', 'mikmaq', 'haudenosaunee']);
    for (const people of nePeoples) {
      const s = createGame({
        scenario: 'vinland',
        map: 'north-east-hex',
        mapSize: 'large',
        seed: 7,
        nations: ['norse'],
        peoples: [people],
        humans: [people],
      });
      expect(s.players.some((p) => p.id === people && p.kind === 'people')).toBe(true);
    }

    const atlPeoples = playablePeoplesForMap(VINLAND, 'vinland-atlantic').map((p) => p.id);
    expect(atlPeoples).toEqual(['beothuk', 'innu', 'mikmaq']);
    for (const people of atlPeoples) {
      const s = createGame({
        scenario: 'vinland',
        map: 'vinland-atlantic',
        mapSize: 'large',
        seed: 7,
        nations: ['norse'],
        peoples: [people],
        humans: [people],
      });
      expect(s.players.some((p) => p.id === people && p.kind === 'people')).toBe(true);
    }

    expect(() =>
      createGame({
        scenario: 'vinland',
        map: 'vinland-atlantic',
        mapSize: 'large',
        seed: 7,
        nations: ['norse'],
        peoples: ['haudenosaunee'],
        humans: ['haudenosaunee'],
      }),
    ).toThrow(/does not live on the map "vinland-atlantic"/);
  });

  it('judges end-year thriving victory alongside a playing people without crashing and prefers thriving over prosperity', () => {
    const s = createGame({
      scenario: 'vinland',
      map: 'north-east-hex',
      mapSize: 'large',
      seed: 99,
      nations: ['norse'],
      peoples: ['beothuk'],
      humans: ['norse'],
    });
    const order = orderedVictory(s).map((r) => r.id);
    expect(order.indexOf('thriving')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('thriving')).toBeLessThan(order.indexOf('prosperity'));

    // Give Norse 2 self-sufficient colonies and an active treaty with the Beothuk.
    addTestColony(s, 'c_test_1', 'norse', 66, 28, 120);
    addTestColony(s, 'c_test_2', 'norse', 68, 30, 120);
    s.treaties = [
      {
        id: 't_test_1',
        kind: 'people-trade',
        parties: [
          { kind: 'nation', id: 'norse' },
          { kind: 'people', id: 'beothuk' },
        ],
        start: 0,
      },
    ];
    const rule = VINLAND.nations.sets.real![0].departs!;
    expect(isThriving(s, 'norse', rule.thriving).thriving).toBe(true);

    s.turn = lastTurn(VINLAND_CALENDAR);
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver).toBeDefined();
    expect(s.gameOver?.ways?.norse).toBe('thriving');
    expect(s.gameOver?.winners).toContain('norse');
    expect(s.gameOver?.reason).toContain('Vinland');
  });

  it('removes colonies, units, leases, and ends solo-human game when Norse departs', () => {
    const s = createGame({
      scenario: 'vinland',
      map: 'north-east-hex',
      mapSize: 'large',
      seed: 42,
      nations: ['norse'],
      peoples: ['beothuk'],
      humans: ['norse'],
    });
    const rule = VINLAND.nations.sets.real![0].departs!;
    const y = departureYearFor(s, 'norse', rule);
    expect(y).toBeGreaterThanOrEqual(rule.years[0]);
    expect(y).toBeLessThanOrEqual(rule.years[1]);

    // Give Norse one colony (below thriving threshold) plus a leased and a claimed tile.
    addTestColony(s, 'c_norse_1', 'norse', 66, 28, 20);
    const leasedIdx = 28 * s.map.width + 67;
    const claimedIdx = 29 * s.map.width + 66;
    s.map.tiles[leasedIdx].use = 'norse';
    s.map.tiles[claimedIdx].claim = 'norse';
    expect(isThriving(s, 'norse', rule.thriving).thriving).toBe(false);

    // Advance turn counter to the departure year and trigger processDepartures.
    s.turn = (y - 1000) * 2;
    processDepartures(s);
    const norse = s.players.find((p) => p.id === 'norse')!;
    expect(norse.departed).toBe(true);
    expect(norse.finished).toBeDefined();
    // Score breakdown parts must be keyed by l.key (e.g. 'colonists'), not l.label ('Colonists').
    expect('colonists' in norse.finished!.parts).toBe(true);
    expect('Colonists' in norse.finished!.parts).toBe(false);
    // All Norse colonies, units, leases, and claims must be cleaned up.
    expect(Object.values(s.colonies).filter((c) => c.owner === 'norse')).toHaveLength(0);
    expect(Object.values(s.units).filter((u) => u.owner === 'norse')).toHaveLength(0);
    expect(s.map.tiles[leasedIdx].use).toBeUndefined();
    expect(s.map.tiles[claimedIdx].claim).toBeUndefined();
    expect(europeansDefeated(s)).toBe(true);
    // Solo-human departure ends the game cleanly instead of stranding the player.
    expect(s.gameOver).toBeDefined();
    expect(s.gameOver?.reason).toContain('withdraws to Brattahlíð');
  });

  it('counts contacted non-playing tribes for AI Norse thriving checks even without Tribe.met', () => {
    const s = createGame({
      scenario: 'vinland',
      map: 'north-east-hex',
      mapSize: 'large',
      seed: 123,
      nations: ['norse'],
      peoples: [],
      humans: [],
      ai: { norse: 'competent' },
    });
    const rule = VINLAND.nations.sets.real![0].departs!;
    addTestColony(s, 'c_ai_1', 'norse', 66, 28, 120);
    addTestColony(s, 'c_ai_2', 'norse', 68, 30, 120);
    s.treaties = [
      {
        id: 't_ai_1',
        kind: 'people-trade',
        parties: [
          { kind: 'nation', id: 'norse' },
          { kind: 'people', id: 'innu' },
        ],
        start: 0,
      },
    ];
    // Mark Beothuk at war with AI Norse (tr.met is undefined for AI).
    const beothuk = s.tribes.find((t) => t.id === 'beothuk')!;
    expect(beothuk.met).toBeUndefined();
    beothuk.stance.norse = 'war';
    expect(isThriving(s, 'norse', rule.thriving).standing).toBe(false);

    // Contact Innu peacefully via peopleRelations: Norse is no longer at war with all met peoples.
    s.peopleRelations = { [peopleRelationKey('norse', 'innu')]: { nation: 'norse', people: 'innu', volume: 50 } };
    expect(isThriving(s, 'norse', rule.thriving).standing).toBe(true);
  });

  it('completes a full 201-turn Vinland game cleanly', () => {
    const s = createGame({
      scenario: 'vinland',
      map: 'north-east-hex',
      mapSize: 'large',
      seed: 1021,
      nations: ['norse'],
      peoples: ['beothuk', 'innu'],
      humans: [],
      ai: { norse: 'competent', beothuk: 'competent', innu: 'competent' },
    });
    const end = lastTurn(VINLAND_CALENDAR);
    expect(end).toBe(201);
    for (let i = 0; i <= end + 2 && !s.gameOver; i++) {
      endTurn(s);
    }
    expect(s.gameOver).toBeDefined();
    expect(s.turn).toBeLessThanOrEqual(end);
  }, 60_000);

  it('keeps everything Norse/Greenland/Viking inside Vinland (T17)', () => {
    for (const sc of [AMERICAS, CARIBBEAN, NORTH_EAST]) {
      const text = JSON.stringify(sc);
      expect(text).not.toMatch(/\bnorse\b|vinland|greenland|viking|brattahl/i);
    }
  });
});
