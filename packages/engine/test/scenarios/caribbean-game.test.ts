/**
 * The Caribbean, 1650–1750 (see caribbean.test.ts): a full computer game with every nation, its
 * golden hash and its events in their windows. In a file of its own, as the slowest test, so it
 * runs in parallel with the scenario's other tests.
 */
import { describe, expect, it } from 'vitest';
import { CARIBBEAN_CALENDAR, serialize, yearOf, type AiLevel, type GameState, type NationId } from '../../src/index.js';
import { playArenaGame } from '../../src/arena.js';
import { eventDefs } from '../../src/events/index.js';

const ALL: NationId[] = ['england', 'france', 'netherlands', 'spain', 'denmark', 'courland', 'brandenburg', 'scotland', 'malta'];

describe('a full computer game in the Caribbean', () => {
  const levels: AiLevel[] = ['competent', 'combative', 'creative', 'naive'];
  const line = ALL.map((nation, i) => ({ nation, level: levels[i % levels.length] }));
  let played: GameState | undefined;
  const play = () => (played ??= playArenaGame(2024, line, 300, 'medium', undefined, false, undefined, false, true, true, { scenario: 'caribbean' }).state);

  it('ends in autumn 1750, by prosperity (Denmark, England and the Netherlands together, with the Arawak, the Kalinago and the Tupi), with every nation still loyal', () => {
    const s = play();
    expect(s.gameOver?.turn).toBe(201);
    expect(s.gameOver?.reason).toBe('The year 1750 has come, and the age of the chartered companies is over. In peace and partnership with the Arawak, the Kalinago and the Tupi, Denmark, England and the Netherlands win together by prosperity.');
    expect(s.gameOver?.winners).toEqual(['denmark', 'england', 'netherlands']);
    expect(s.gameOver?.partners).toEqual(['arawak', 'kalinago', 'tupi']);
    expect(s.gameOver?.winner).toBeDefined();
    for (const p of s.players) expect(p.independence).toBe('none');
    expect(s.players.some((p) => p.id === 'crown')).toBe(false);
  }, 120_000);

  it('has no fur goods anywhere in the game', () => {
    const json = serialize(play());
    for (const g of ['furs', 'coats', 'furTrader', 'expertFurTrapper', 'masterFurTrader']) expect(json).not.toContain(`"${g}"`);
  }, 120_000);

  it('every nation takes part: colonies, colonists and trade', () => {
    const s = play();
    // The nations of the line; a chartered company founded during the game has no Founding Fathers.
    for (const p of s.players.filter((o) => ALL.includes(o.id as NationId))) {
      expect(p.coloniesFounded, p.id).toBeGreaterThan(0);
      expect(Object.values(s.colonies).some((c) => c.owner === p.id), p.id).toBe(true);
      expect(p.fathers.length, p.id).toBeGreaterThan(0);
    }
  }, 120_000);

  it('fires its historical events in their windows', () => {
    const s = play();
    const fired = s.events!.fired;
    const year = (id: string) => yearOf(fired[id], CARIBBEAN_CALENDAR).year;
    expect(year('willoughby-hurricane')).toBe(1666);
    expect(year('port-royal-earthquake')).toBe(1692);
    expect([1699, 1700]).toContain(year('darien'));
    expect([1699, 1700]).toContain(year('darien-survivors'));
    expect(year('great-frost')).toBe(1709);
    expect([1719, 1720]).toContain(year('bubble'));
    // The Americas' events after 1750 are not in the set.
    for (const id of ['seven-years-war', 'enlightenment', 'circumnavigation', 'thirty-years-war']) expect(eventDefs(s).some((d) => d.id === id)).toBe(false);
    // Each new event reached a nation (its history entry carries the date).
    const history = (s.history ?? []).map((h) => h.text);
    for (const title of ['The hurricane of 1666', 'The Port Royal earthquake (Spring 1692)', 'The end of Darien', 'Survivors from Darien']) {
      expect(history.some((t) => t.startsWith(title)), title).toBe(true);
    }
  }, 120_000);

  it('plays the same game every time (golden hash)', async () => {
    // As golden.test.ts: the first 16 hex digits of the SHA-256 of the saved state.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialize(play())));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    expect(hash).toMatchSnapshot();
  }, 120_000);
});
