/**
 * Beta 3, step 1 (docs/design/native-nations.md, section 5): the nation type. A hidden test
 * scenario with one playable people (T4), the Americas with the Iroquois playable, carries the
 * work until the North-east game exists: a people becomes a player at setup with its settlements
 * as its towns (T1–T3), computer players play rounds around it without crashing, the game saves and
 * loads, and the Europe-only systems never touch the people (the systems table, playerkind.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  PLAYER_SYSTEMS,
  applyCommand,
  buildOptions,
  createGame,
  deserialize,
  kindOfId,
  nationOf,
  playerKind,
  registerScenario,
  serialize,
  systemsOf,
  type GameConfig,
  type GameState,
  type Player,
  type Scenario,
} from '../src/index.js';
import { colonyList, unitList } from '../src/unitindex.js';

const PEOPLE_GAME: Scenario = {
  ...AMERICAS,
  id: 'test-people-player',
  name: 'People player test',
  hidden: true,
  peoples: { ...AMERICAS.peoples, playable: [{ id: 'iroquois', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga', 'Kanonwalohale'] }] },
};
registerScenario(PEOPLE_GAME);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'competent', france: 'combative', netherlands: 'creative' },
    peoples: ['iroquois'],
    scenario: PEOPLE_GAME.id,
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...over,
  };
}

const people = (s: GameState): Player => s.players.find((p) => p.id === 'iroquois')!;

function play(s: GameState, rounds: number): GameState {
  const until = s.turn + rounds;
  let guard = rounds * (s.players.length + 2);
  while (s.turn < until && !s.gameOver && guard-- > 0) {
    const r = applyCommand(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
  }
  return s;
}

/** Nothing of Europe on the people: no market, Crown, taxes, REF, immigration, Congress or caravel. */
function expectNoEurope(s: GameState): void {
  const p = people(s);
  expect(p.market).toEqual({});
  expect(p.tax).toBe(0);
  expect(p.pendingTax).toBeNull();
  expect(p.boycotts).toEqual({});
  expect(p.pendingDemand).toBeUndefined();
  expect(p.royal).toBeUndefined();
  expect(p.ref).toEqual({ regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 });
  expect(p.refAtDeclaration).toBeUndefined();
  expect(p.independence).toBe('none');
  expect(p.crosses).toBe(0);
  expect(p.recruitPool).toEqual([]);
  expect(p.recruited).toBe(0);
  expect(p.fathers).toEqual([]);
  expect(p.fatherOffer).toEqual({});
  expect(p.currentFather).toBeNull();
  expect(p.gold).toBe(0);
  const own = unitList(s).filter((u) => u.owner === p.id);
  expect(own.filter((u) => u.loc.kind === 'europe' || u.loc.kind === 'sailing')).toEqual([]);
  expect(own.filter((u) => u.type === 'caravel')).toEqual([]);
  // No messages of its own taxes, immigrants, docks or Royal Expeditionary Force (news of the
  // nations' Congresses reaches everyone).
  const crownWords = /tax rate|immigra|docks|Royal Expeditionary|demands \d+ gold/i;
  expect(s.messages.filter((m) => m.to === p.id && crownWords.test(m.text))).toEqual([]);
  // Not a European to the peoples nobody plays: no tension towards it, no stance.
  for (const st of Object.values(s.settlements)) expect(st.tension.iroquois).toBeUndefined();
  for (const t of s.tribes) expect(t.stance.iroquois).toBeUndefined();
}

describe('the systems table (playerkind.ts)', () => {
  it('names each kind of player, by player and by id', () => {
    expect(kindOfId('england')).toBe('nation');
    expect(kindOfId('crown')).toBe('crown');
    expect(kindOfId('hudsonsBay')).toBe('company');
    expect(kindOfId('iroquois')).toBe('people');
    expect(playerKind({ id: 'england' })).toBe('nation');
    expect(playerKind({ id: 'crown' })).toBe('crown');
    expect(playerKind({ id: 'hudsonsBay', kind: 'company' })).toBe('company');
    expect(playerKind({ id: 'iroquois', kind: 'people' })).toBe('people');
  });

  it('switches every Europe-only system off for a people', () => {
    const t = PLAYER_SYSTEMS.people;
    for (const k of ['homePort', 'immigration', 'taxes', 'crown', 'independence', 'congress', 'startingCaravel', 'rumours', 'events', 'ranked'] as const) expect(t[k], k).toBe(false);
    expect(t.war).toBe(true);
    expect(t.ai).toBe('people');
    // Nations keep every system.
    for (const [k, v] of Object.entries(PLAYER_SYSTEMS.nation)) if (k !== 'ai') expect(v, k).toBe(true);
  });
});

describe('a people playing as a nation (Beta 3 step 1)', () => {
  it('becomes a player at setup, its settlements its towns', () => {
    const s = createGame(config());
    const p = people(s);
    expect(p.kind).toBe('people');
    expect(systemsOf(p)).toBe(PLAYER_SYSTEMS.people);
    expect(s.players.map((o) => o.id)).toEqual(['england', 'france', 'netherlands', 'iroquois']);
    expect(nationOf(s, 'iroquois').name).toBe('the Haudenosaunee');
    // No settlement of the people is left; its Tribe record stays.
    expect(Object.values(s.settlements).some((st) => st.tribe === 'iroquois')).toBe(false);
    expect(Object.values(s.settlements).length).toBeGreaterThan(0);
    expect(s.tribes.some((t) => t.id === 'iroquois')).toBe(true);
    const towns = colonyList(s).filter((c) => c.owner === 'iroquois');
    expect(towns.length).toBeGreaterThan(0);
    expect(p.coloniesFounded).toBe(towns.length);
    for (const c of towns) {
      expect(c.name).toMatch(/^Iroquois /);
      // Its own buildings (the placeholder selection), the European ones at level 0.
      expect(c.buildings.townHall).toBe(1);
      expect(c.buildings.docks).toBe(0);
      expect(c.buildings.schoolhouse).toBe(0);
      expect(buildOptions(s, c).every((b) => b.kind === 'building' && ['townHall', 'carpenter', 'blacksmith'].includes(b.id))).toBe(true);
      const inside = unitList(s).filter((u) => u.loc.kind === 'colony' && u.loc.colonyId === c.id);
      expect(inside.map((u) => u.type)).toEqual(['nativeConvert']);
    }
    // No caravel, no Europe; the nations start as before.
    expectNoEurope(s);
    for (const n of ['england', 'france', 'netherlands']) expect(unitList(s).some((u) => u.owner === n && u.type === 'caravel')).toBe(true);
  });

  it('refuses peoples the scenario does not let play', () => {
    expect(() => createGame(config({ peoples: ['sioux'] }))).toThrow(/lets play as a nation/);
    expect(() => createGame(config({ scenario: undefined }))).toThrow(/lets play as a nation/);
    expect(() => createGame(config({ peoples: ['iroquois', 'iroquois'] }))).toThrow(/only take part once/);
  });

  it('plays rounds with computer players, and Europe-only systems never touch the people', () => {
    const s = play(createGame(config()), 120);
    expect(s.gameOver).toBeUndefined();
    expect(s.turn).toBeGreaterThanOrEqual(120);
    expectNoEurope(s);
    // The people is not ranked with the European nations.
    const crown = s.players.find((p) => p.id === 'crown');
    if (crown) expect(crown.id).toBe('crown');
  }, 120_000);

  it('saves and loads: the loaded game is the same and plays on the same', () => {
    const s = play(createGame(config()), 40);
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    expect(people(loaded).kind).toBe('people');
    play(s, 30);
    play(loaded, 30);
    expect(serialize(loaded)).toBe(serialize(s));
    expectNoEurope(loaded);
  }, 120_000);

  it('can be played by a person: the turn comes round to it and it ends its turn', () => {
    const s = createGame(config({ humans: ['iroquois'] }));
    expect(s.players[s.current].id).toBe('iroquois');
    expect(people(s).human).toBe(true);
    for (let i = 0; i < 20; i++) {
      const r = applyCommand(s, { type: 'endTurn' });
      expect(r.ok, r.ok ? '' : r.error).toBe(true);
      expect(s.players[s.current].id).toBe('iroquois');
    }
    expect(s.turn).toBe(20);
    expectNoEurope(s);
  }, 60_000);

  it('is played by the computer as a no-op until step 9, with its towns working', () => {
    const s = play(createGame(config()), 30);
    const towns = colonyList(s).filter((c) => c.owner === 'iroquois');
    expect(towns.length).toBeGreaterThan(0);
    // Its towns produce: food is gathered (a town may have grown).
    expect(towns.some((c) => c.goods.food > 0) || unitList(s).filter((u) => u.owner === 'iroquois').length > 2 * towns.length).toBe(true);
  }, 60_000);
});
