/**
 * The calendar: how turns map to years (docs/design/scenario-framework.md, section 3.2 and Q4).
 * A scenario's calendar is a list of eras, each with a number of turns a year and, above one,
 * named seasons; each era runs until the next one's first year. The Americas play one turn a
 * year from 1492 and two (spring and autumn) from 1600, until autumn 1850.
 *
 * Every year and turn rule of the game is here, so the engine, the web game and the scripts share
 * it. Callers pass the game's calendar (`calendarOf(s)` in scenarios/index.ts); the default is
 * the Americas', for code without a game (tests, tools).
 *
 * A leaf module: it imports nothing, so any module can use it.
 */

export interface Era {
  /** First year of the era. */
  from: number;
  turnsPerYear: 1 | 2 | 4;
  /** Season ids in the year's order, one per turn, when there is more than one turn a year ('spring'). */
  seasons?: string[];
}

export interface Calendar {
  /** Consecutive eras, in increasing years. */
  eras: Era[];
  /** The game ends after this turn: the year, and its season when the era has seasons. */
  end: { year: number; season?: string };
  /** Years a head start can jump to. */
  headStartYears: number[];
}

export const AMERICAS_CALENDAR: Calendar = {
  eras: [
    { from: 1492, turnsPerYear: 1 },
    { from: 1600, turnsPerYear: 2, seasons: ['spring', 'autumn'] },
  ],
  end: { year: 1850, season: 'autumn' },
  headStartYears: [1550, 1600, 1650, 1700, 1750, 1800],
};

export interface GameDate {
  year: number;
  /** The season id, or null in an era of one turn a year. */
  season: string | null;
}

/** First turn of each era, worked out once per calendar. */
const STARTS = new WeakMap<Calendar, number[]>();

function eraStarts(cal: Calendar): number[] {
  let starts = STARTS.get(cal);
  if (!starts) {
    starts = [0];
    for (let i = 1; i < cal.eras.length; i++) {
      const prev = cal.eras[i - 1];
      starts.push(starts[i - 1] + (cal.eras[i].from - prev.from) * prev.turnsPerYear);
    }
    STARTS.set(cal, starts);
  }
  return starts;
}

/** Index of the era a turn falls in (the first era for turns before it). */
function eraOfTurn(cal: Calendar, turn: number): number {
  const starts = eraStarts(cal);
  let i = starts.length - 1;
  while (i > 0 && turn < starts[i]) i--;
  return i;
}

/** Index of the era a year falls in (the first era for years before it). */
function eraOfYear(cal: Calendar, year: number): number {
  let i = cal.eras.length - 1;
  while (i > 0 && year < cal.eras[i].from) i--;
  return i;
}

/** The year and season of a turn. */
export function yearOf(turn: number, cal: Calendar = AMERICAS_CALENDAR): GameDate {
  const i = eraOfTurn(cal, turn);
  const era = cal.eras[i];
  const t = turn - eraStarts(cal)[i];
  if (era.turnsPerYear === 1) return { year: era.from + t, season: null };
  return { year: era.from + Math.floor(t / era.turnsPerYear), season: era.seasons?.[t % era.turnsPerYear] ?? null };
}

/** A turn's date as shown: "1550", "Spring 1600". */
export function formatDate(turn: number, cal: Calendar = AMERICAS_CALENDAR): string {
  const { year, season } = yearOf(turn, cal);
  return season ? `${season[0].toUpperCase()}${season.slice(1)} ${year}` : `${year}`;
}

/** The first turn of a year. */
export function turnOfYear(year: number, cal: Calendar = AMERICAS_CALENDAR): number {
  const i = eraOfYear(cal, year);
  const era = cal.eras[i];
  return eraStarts(cal)[i] + (year - era.from) * era.turnsPerYear;
}

/** The game year of a turn as a number, with later turns of a year as fractions (autumn 1600 is 1600.5). */
export function yearValue(turn: number, cal: Calendar = AMERICAS_CALENDAR): number {
  const i = eraOfTurn(cal, turn);
  const era = cal.eras[i];
  const t = turn - eraStarts(cal)[i];
  return era.turnsPerYear === 1 ? era.from + t : era.from + t / era.turnsPerYear;
}

/** The first turn at least `years` years after `turn`. */
export function turnAfterYears(turn: number, years: number, cal: Calendar = AMERICAS_CALENDAR): number {
  const goal = yearValue(turn, cal) + years;
  let t = turn;
  while (yearValue(t, cal) < goal) t++;
  return t;
}

/** The first year of the calendar (the year of turn 0). */
export function firstYear(cal: Calendar = AMERICAS_CALENDAR): number {
  return cal.eras[0].from;
}

/** The last turn of the game: the game ends after it. */
export function lastTurn(cal: Calendar = AMERICAS_CALENDAR): number {
  const { year, season } = cal.end;
  const era = cal.eras[eraOfYear(cal, year)];
  const first = turnOfYear(year, cal);
  if (era.turnsPerYear === 1) return first;
  const index = season ? era.seasons?.indexOf(season) ?? -1 : -1;
  return first + (index >= 0 ? index : era.turnsPerYear - 1);
}
