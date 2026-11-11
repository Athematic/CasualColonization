/**
 * Beta 3, step 6 (docs/design/native-nations.md T18): European nations arrive one by one. A nation
 * whose scenario entry has `arrives` (a year) is not in the game until its year: no player, units,
 * colonies, turns or diplomacy; then its expedition arrives at its entry point and it plays. Head
 * starts work across arrivals, and the game saves and loads across one. Scenarios without
 * `arrives` are unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  PEOPLE_BUILDINGS,
  PEOPLE_UNIT_TYPES,
  applyCommand,
  createGame,
  deserialize,
  handOver,
  headStartConfig,
  nationsPresent,
  playUntil,
  registerScenario,
  serialize,
  turnOfYear,
  yetToArrive,
  type GameConfig,
  type GameState,
  type NationEntry,
  type Scenario,
} from '../src/index.js';
import { colonyList, unitList } from '../src/unitindex.js';

/** The Americas (from 1492) with France arriving in 1500 and the Netherlands in 1505, and a playable people. */
const ARRIVALS: Partial<Record<string, number>> = { france: 1500, netherlands: 1505 };
const withArrivals = (e: NationEntry): NationEntry => (ARRIVALS[e.id] ? { ...e, arrives: ARRIVALS[e.id] } : e);
const ARRIVALS_GAME: Scenario = {
  ...AMERICAS,
  id: 'test-arrivals',
  name: 'Arrivals test',
  hidden: true,
  nations: { ...AMERICAS.nations, sets: { alternative: AMERICAS.nations.sets.alternative.map(withArrivals) } },
  peoples: { ...AMERICAS.peoples, playable: [{ id: 'iroquois', name: 'the Haudenosaunee', adjective: 'Haudenosaunee', townNames: ['Onondaga'] }] },
  nationTypes: { people: { units: [...PEOPLE_UNIT_TYPES], buildings: [...PEOPLE_BUILDINGS] } },
};
registerScenario(ARRIVALS_GAME);

/** England arriving after the game ends. */
const TOO_LATE: Scenario = {
  ...ARRIVALS_GAME,
  id: 'test-arrivals-too-late',
  nations: { ...AMERICAS.nations, sets: { alternative: AMERICAS.nations.sets.alternative.map((e) => (e.id === 'england' ? { ...e, arrives: 1900 } : e)) } },
};
registerScenario(TOO_LATE);

const FRANCE = turnOfYear(1500);
const NETHERLANDS = turnOfYear(1505);

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 4242,
    mapSize: 'medium',
    nations: ['england', 'france', 'netherlands'],
    humans: [],
    ai: { england: 'competent', france: 'creative', netherlands: 'combative' },
    peoples: ['iroquois'],
    scenario: ARRIVALS_GAME.id,
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
    ...over,
  };
}

function play(s: GameState, rounds: number): GameState {
  const until = s.turn + rounds;
  let guard = rounds * (s.players.length + 4);
  while (s.turn < until && !s.gameOver && guard-- > 0) {
    const r = applyCommand(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.error);
  }
  return s;
}

/** Plays rounds until the turn (a game with no person has played its first round at setup). */
function playTo(s: GameState, turn: number): GameState {
  return play(s, turn - s.turn);
}

const ids = (s: GameState) => s.players.map((p) => p.id);

/** Nothing of a nation yet to arrive anywhere in the game. */
function expectAbsent(s: GameState, nation: string): void {
  expect(ids(s)).not.toContain(nation);
  expect(yetToArrive(s, nation as 'france')).toBe(true);
  expect(unitList(s).filter((u) => u.owner === nation)).toEqual([]);
  expect(colonyList(s).filter((c) => c.owner === nation)).toEqual([]);
  expect(s.map.tiles.some((t) => t.claim === nation || t.use === nation)).toBe(false);
  expect(s.messages.filter((m) => m.to === nation)).toEqual([]);
  expect(Object.keys(s.relations).filter((k) => k.split('|').includes(nation))).toEqual([]);
  expect(Object.keys(s.peopleRelations ?? {}).filter((k) => k.split('|').includes(nation))).toEqual([]);
  expect((s.treaties ?? []).filter((t) => t.parties.some((p) => p.kind === 'nation' && p.id === nation))).toEqual([]);
  for (const p of s.players) expect(p.stance[nation as 'france'], p.id).toBeUndefined();
  for (const t of s.tribes) expect(t.stance[nation as 'france']).toBeUndefined();
  for (const st of Object.values(s.settlements)) expect(st.tension[nation as 'france']).toBeUndefined();
}

describe('arrivals (T18)', () => {
  it('leaves a nation out of the game until its year', () => {
    const s = createGame(config());
    expect(FRANCE).toBe(8);
    expect(NETHERLANDS).toBe(13);
    expect(ids(s)).toEqual(['england', 'iroquois']);
    expect(s.arrivals?.map((a) => [a.nation, a.turn])).toEqual([['france', FRANCE], ['netherlands', NETHERLANDS]]);
    expect(nationsPresent(s)).toBe(1);
    expectAbsent(s, 'france');
    expectAbsent(s, 'netherlands');
    playTo(s, FRANCE - 1);
    expect(s.turn).toBe(FRANCE - 1);
    expectAbsent(s, 'france');
    expectAbsent(s, 'netherlands');
  }, 60_000);

  it('brings it in with its starting units at its entry point, in its place in the turn order, and it plays', () => {
    const s = createGame(config());
    const entry = s.arrivals!.find((a) => a.nation === 'france')!.entry;
    playTo(s, FRANCE);
    expect(s.turn).toBe(FRANCE);
    expect(ids(s)).toEqual(['england', 'france', 'iroquois']);
    expect(yetToArrive(s, 'france')).toBe(false);
    expect(nationsPresent(s)).toBe(2);
    expectAbsent(s, 'netherlands');
    const france = s.players.find((p) => p.id === 'france')!;
    expect(france.ai).toBe('creative');
    expect(france.human).toBe(false);
    expect(france.entry).toEqual(entry);
    expect(france.gold).toBe(1000);
    expect(france.recruitPool.length).toBe(3);
    // Its expedition, as at the start of a game, at the entry point (or open water next to it).
    const units = unitList(s).filter((u) => u.owner === 'france');
    expect(units.map((u) => u.type).sort()).toEqual(['caravel', 'hardyPioneer', 'veteranSoldier']);
    // Its own arrival message, and news of it to everyone else.
    expect(s.messages.some((m) => m.to === 'france' && m.turn === FRANCE && /expedition for France/.test(m.text))).toBe(true);
    expect(s.messages.filter((m) => m.turn === FRANCE && /Ships of France have reached/.test(m.text)).map((m) => m.to)).toEqual(['england', 'iroquois']);
    // Its relations with the nations already there start in its year, at peace.
    expect(s.relations['england|france']?.peaceSince ?? s.relations['france|england']?.peaceSince).toBe(FRANCE);

    // It plays: its expedition sets out, and it founds colonies in time.
    play(s, 1);
    expect(unitList(s).find((u) => u.owner === 'france' && u.type === 'caravel')!.loc).not.toEqual({ kind: 'map', x: entry.x, y: entry.y });
    playTo(s, NETHERLANDS);
    expect(ids(s)).toEqual(['england', 'france', 'netherlands', 'iroquois']);
    expect(s.arrivals).toBeUndefined();
    play(s, 40);
    expect(colonyList(s).some((c) => c.owner === 'france')).toBe(true);
    expect(colonyList(s).some((c) => c.owner === 'netherlands')).toBe(true);
    expect(s.gameOver).toBeUndefined();
  }, 120_000);

  it('saves and loads across an arrival', () => {
    const s = playTo(createGame(config()), FRANCE - 2);
    const json = serialize(s);
    const loaded = deserialize(json);
    expect(serialize(loaded)).toBe(json);
    play(s, 20);
    play(loaded, 20);
    expect(ids(loaded)).toEqual(['england', 'france', 'netherlands', 'iroquois']);
    expect(serialize(loaded)).toBe(serialize(s));
  }, 120_000);

  it('gives a person their nation when it arrives, the computer playing on until then', () => {
    const s = createGame(config({ humans: ['france'] }));
    expect(s.turn).toBe(FRANCE);
    expect(s.players[s.current].id).toBe('france');
    const france = s.players.find((p) => p.id === 'france')!;
    expect(france.human).toBe(true);
    expect(france.ai).toBeUndefined();
    expect(france.difficulty).toBe(s.difficulty);
    for (let i = 0; i < 10; i++) {
      const r = applyCommand(s, { type: 'endTurn' });
      expect(r.ok, r.ok ? '' : r.error).toBe(true);
      expect(s.players[s.current].id).toBe('france');
    }
    expect(s.turn).toBe(FRANCE + 10);
  }, 60_000);

  it('plays a head start across an arrival: the person\'s nation arrives under the computer and is handed over', () => {
    const turn = 20;
    const s = createGame(headStartConfig(config({ humans: ['france'] }), turn));
    expect(ids(s)).not.toContain('france');
    expect(playUntil(s, turn)).toBe(true);
    expect(ids(s)).toEqual(['england', 'france', 'netherlands', 'iroquois']);
    const france = s.players.find((p) => p.id === 'france')!;
    expect(france.ai).toBe('creative');
    // The head start's difficulty is the person's (game.ts), from its arrival.
    expect(france.difficulty).toBe(s.difficulty);
    handOver(s);
    expect(france.human).toBe(true);
    expect(s.players[s.current].id).toBe('france');
    expect(s.turn - turn).toBeLessThanOrEqual(1);
  }, 60_000);

  it('plays a head start that ends before the person\'s nation arrives on until it does', () => {
    const turn = 5;
    const s = createGame(headStartConfig(config({ humans: ['netherlands'] }), turn));
    expect(playUntil(s, turn)).toBe(true);
    expect(s.turn).toBe(turn);
    handOver(s);
    expect(s.turn).toBe(NETHERLANDS);
    expect(s.players[s.current].id).toBe('netherlands');
    const netherlands = s.players.find((p) => p.id === 'netherlands')!;
    expect(netherlands.human).toBe(true);
    expect(netherlands.ai).toBeUndefined();
    expect(s.config.headStart).toBeUndefined();
  }, 60_000);

  it('refuses a nation arriving after the game ends, and a game with nobody in it at the start', () => {
    expect(() => createGame(config({ scenario: TOO_LATE.id }))).toThrow(/would arrive in 1900, after the game ends/);
    expect(() => createGame(config({ nations: ['france', 'netherlands'], peoples: [] }))).toThrow(/Nobody is in the game in 1492/);
    // A people in the game from the start is enough: the nations arrive to it.
    const s = createGame(config({ nations: ['france', 'netherlands'], ai: { france: 'naive', netherlands: 'naive' } }));
    expect(ids(s)).toEqual(['iroquois']);
    playTo(s, FRANCE);
    expect(ids(s)).toEqual(['france', 'iroquois']);
  }, 60_000);

  it('writes nothing in games without arrivals', () => {
    const s = createGame({ ...config(), scenario: undefined, peoples: undefined });
    expect('arrivals' in s).toBe(false);
    expect(ids(s)).toEqual(['england', 'france', 'netherlands']);
  });
});
