/**
 * The New game screen's choices for the North-east (Beta 3 step 10; native-nations.md T4, T16, T18,
 * section 15): the playable peoples it offers, a people's game with no nation at the start, the
 * arrival year of each nation, a person's late-arriving nation started at its arrival by a head
 * start that hands it over then, and game codes that carry the peoples.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  arrivalStartTurn,
  arrivalYear,
  charterCost,
  createGame,
  decodeGameCode,
  encodeGameCode,
  handOver,
  headStartConfig,
  newGameOptions,
  NORTH_EAST,
  player,
  playUntil,
  settingsFromConfig,
  turnOfYear,
  type GameConfig,
} from '../../src/index.js';

function config(over: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 1000,
    mapSize: 'medium',
    map: 'north-east',
    nations: ['england', 'portugal'],
    humans: ['haudenosaunee'],
    ai: { england: 'competent', portugal: 'competent', wendat: 'creative' },
    peoples: ['haudenosaunee', 'wendat'],
    scenario: 'north-east',
    rivals: 'real',
    colonyCharter: true,
    ...over,
  };
}

describe('New game options for the North-east', () => {
  it('offers its four playable peoples, and a people first: no nation is there at the start', () => {
    const o = newGameOptions(NORTH_EAST);
    expect(o.peoples.map((p) => p.id)).toEqual(['haudenosaunee', 'wendat', 'mikmaq', 'innu']);
    expect(o.peoples[0]).toMatchObject({ name: 'the Haudenosaunee', lifeway: 'Farming towns' });
    expect(o.peoplesFirst).toBe(true);
    // The Americas offer no people and have nations from the start.
    const a = newGameOptions(AMERICAS);
    expect(a.peoples).toEqual([]);
    expect(a.peoplesFirst).toBe(false);
  });

  it('knows when each nation arrives', () => {
    expect(arrivalYear(NORTH_EAST, 'real', 'england')).toBe(1497);
    expect(arrivalYear(NORTH_EAST, 'real', 'netherlands')).toBe(1614);
    expect(arrivalYear(AMERICAS, undefined, 'england')).toBeUndefined();
  });

  it('starts a person who plays only late-arriving nations at the first arrival', () => {
    expect(arrivalStartTurn(config())).toBe(0);
    expect(arrivalStartTurn(config({ humans: ['portugal'], ai: { england: 'competent', haudenosaunee: 'competent', wendat: 'creative' } }))).toBe(turnOfYear(1500, NORTH_EAST.calendar) - 1);
    expect(arrivalStartTurn(config({ humans: ['portugal', 'england'] }))).toBe(turnOfYear(1497, NORTH_EAST.calendar) - 1);
    // A person who also plays a people starts at the beginning.
    expect(arrivalStartTurn(config({ humans: ['england', 'haudenosaunee'] }))).toBe(0);
    expect(arrivalStartTurn({ ...config(), scenario: undefined, map: undefined, peoples: undefined, rivals: undefined, humans: ['england'] })).toBe(0);
  });

  it('hands a late-arriving nation to its person on arrival, after a head start', () => {
    const c = config({ nations: ['england'], humans: ['england'], ai: { haudenosaunee: 'competent', wendat: 'creative' } });
    const turn = arrivalStartTurn(c);
    // The head start plays to the year before; England arrives in 1497 as the person's.
    expect(turn).toBe(turnOfYear(1497, NORTH_EAST.calendar) - 1);
    const s = createGame(headStartConfig(c, turn));
    playUntil(s, turn);
    expect(s.players.some((p) => p.id === 'england')).toBe(false);
    handOver(s);
    const england = player(s, 'england');
    expect(england.human).toBe(true);
    expect(england.ai).toBeUndefined();
    expect(s.players[s.current].id).toBe('england');
    expect(s.turn).toBe(turn + 1);
  }, 60000);

  it('carries the peoples in a game code', () => {
    const c = config({ headStart: undefined });
    const settings = settingsFromConfig(c);
    expect(settings.peoples).toEqual([
      { people: 'haudenosaunee', controller: 'human' },
      { people: 'wendat', controller: 'creative' },
    ]);
    const back = decodeGameCode(encodeGameCode(settings));
    expect(back.ok && back.settings).toEqual(settings);
  });

  it('charges a people no colony charter', () => {
    const s = createGame(config());
    expect(charterCost(s, 'haudenosaunee')).toBe(0);
  });
});
