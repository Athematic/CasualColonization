import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  AMERICAS_CALENDAR,
  applyCommand,
  calendarOf,
  createGame,
  firstYear,
  formatDate,
  lastTurn,
  LAST_YEAR,
  listScenarios,
  registerScenario,
  turnAfterYears,
  turnOfYear,
  yearOf,
  yearValue,
  type Calendar,
  type Scenario,
} from '../src/index.js';

// The rules as they were written before the calendar module (queries.ts, relations.ts, the web
// game's New game and Progress screens, scripts/bench.ts), kept here to prove nothing changed.
const old = {
  yearOf: (turn: number) => (turn < 108 ? { year: 1492 + turn, season: null } : { year: 1600 + Math.floor((turn - 108) / 2), season: (turn - 108) % 2 === 0 ? 'spring' : 'autumn' }),
  formatDate: (turn: number) => {
    const { year, season } = old.yearOf(turn);
    return season ? `${season === 'spring' ? 'Spring' : 'Autumn'} ${year}` : `${year}`;
  },
  yearValue: (turn: number) => (turn < 108 ? 1492 + turn : 1600 + (turn - 108) / 2),
  turnOfYear: (year: number) => (year <= 1600 ? year - 1492 : 108 + (year - 1600) * 2),
  progressTurn: (yr: number) => (yr < 1600 ? yr - 1492 : 108 + (yr - 1600) * 2),
};

describe('the Americas calendar', () => {
  it('gives the same dates as the old rules for every turn of a game and beyond', () => {
    for (let turn = 0; turn <= 800; turn++) {
      expect(yearOf(turn, AMERICAS_CALENDAR)).toEqual(old.yearOf(turn));
      expect(formatDate(turn, AMERICAS_CALENDAR)).toBe(old.formatDate(turn));
      expect(Object.is(yearValue(turn, AMERICAS_CALENDAR), old.yearValue(turn))).toBe(true);
    }
    for (let year = 1492; year <= 1900; year++) {
      expect(turnOfYear(year, AMERICAS_CALENDAR)).toBe(old.turnOfYear(year));
      expect(turnOfYear(year, AMERICAS_CALENDAR)).toBe(old.progressTurn(year));
    }
  });

  it('knows its start, end and head starts', () => {
    expect(firstYear(AMERICAS_CALENDAR)).toBe(1492);
    expect(formatDate(0)).toBe('1492');
    expect(formatDate(108)).toBe('Spring 1600');
    expect(formatDate(109)).toBe('Autumn 1600');
    expect(lastTurn(AMERICAS_CALENDAR)).toBe(609);
    expect(formatDate(609)).toBe('Autumn 1850');
    expect(LAST_YEAR).toBe(1850);
    expect(AMERICAS_CALENDAR.headStartYears.map((y) => turnOfYear(y))).toEqual([58, 108, 208, 308, 408, 508]);
    expect(AMERICAS.calendar).toBe(AMERICAS_CALENDAR);
    expect(calendarOf({ config: {} })).toBe(AMERICAS_CALENDAR);
  });

  it('counts years for Favoured Nation as before', () => {
    expect(yearValue(turnAfterYears(0, 10))).toBe(1502);
    expect(yearValue(turnAfterYears(110, 10)) - yearValue(110)).toBe(10);
    expect(turnAfterYears(100, 10)).toBe(112);
  });
});

describe('other calendars', () => {
  // Seasons around the year 1000, then a turn a year, then two.
  const cal: Calendar = {
    eras: [
      { from: 1000, turnsPerYear: 4, seasons: ['spring', 'summer', 'autumn', 'winter'] },
      { from: 1010, turnsPerYear: 1 },
      { from: 1020, turnsPerYear: 2, seasons: ['spring', 'autumn'] },
    ],
    end: { year: 1030 },
    headStartYears: [1010],
  };

  it('maps turns to years through every era', () => {
    expect(formatDate(0, cal)).toBe('Spring 1000');
    expect(formatDate(3, cal)).toBe('Winter 1000');
    expect(formatDate(39, cal)).toBe('Winter 1009');
    expect(formatDate(40, cal)).toBe('1010');
    expect(formatDate(49, cal)).toBe('1019');
    expect(formatDate(50, cal)).toBe('Spring 1020');
    expect(turnOfYear(1005, cal)).toBe(20);
    expect(turnOfYear(1015, cal)).toBe(45);
    expect(turnOfYear(1021, cal)).toBe(52);
    expect(yearValue(2, cal)).toBe(1000.5);
    expect(yearValue(51, cal)).toBe(1020.5);
    expect(turnAfterYears(0, 12, cal)).toBe(42);
    // No season given: the game ends after the year's last turn.
    expect(lastTurn(cal)).toBe(71);
    expect(formatDate(71, cal)).toBe('Autumn 1030');
    for (let turn = 0; turn < 80; turn++) expect(turnOfYear(yearOf(turn, cal).year, cal)).toBeLessThanOrEqual(turn);
  });

  it('ends a game after the scenario’s last turn', () => {
    const short: Scenario = { ...AMERICAS, id: 'test-short', name: 'Short', calendar: { eras: [{ from: 1700, turnsPerYear: 1 }], end: { year: 1702 }, headStartYears: [] } };
    registerScenario(short);
    const s = createGame({ seed: 5, mapSize: 'small', nations: ['england'], humans: ['england'], scenario: 'test-short' });
    while (!s.gameOver && s.turn < 10) applyCommand(s, { type: 'endTurn' });
    expect(s.turn).toBe(2);
    expect(s.gameOver?.reason).toBe('The year 1702 has come and the age of colonization is over.');
    expect(s.messages.some((m) => m.text === '1701 begins.')).toBe(true);
  });
});

describe.each(listScenarios().map((sc) => [sc.id, sc] as const))('calendar conformance: %s', (_id, sc: Scenario) => {
  it('has increasing eras, seasons for every turn of a year and an end after the start', () => {
    const { eras, end, headStartYears } = sc.calendar;
    expect(eras.length).toBeGreaterThan(0);
    for (let i = 1; i < eras.length; i++) expect(eras[i].from).toBeGreaterThan(eras[i - 1].from);
    for (const era of eras) if (era.turnsPerYear > 1) expect(era.seasons).toHaveLength(era.turnsPerYear);
    expect(end.year).toBeGreaterThanOrEqual(eras[0].from);
    if (end.season) expect(eras.some((e) => e.seasons?.includes(end.season!))).toBe(true);
    for (let i = 0; i < headStartYears.length; i++) {
      expect(headStartYears[i]).toBeGreaterThan(i ? headStartYears[i - 1] : eras[0].from);
      expect(turnOfYear(headStartYears[i], sc.calendar)).toBeLessThan(lastTurn(sc.calendar));
    }
  });
});
