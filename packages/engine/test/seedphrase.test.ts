import { describe, expect, it } from 'vitest';
import {
  GAME_VERSION,
  buildShare,
  gameCodeFromSearch,
  gameLink,
  searchWithoutGameCode,
  createGame,
  decodeGameCode,
  describeSeed,
  encodeGameCode,
  looksLikeGameCode,
  normalizePhrase,
  parseSeedInput,
  seedFromPhrase,
  settingsFromConfig,
  type GameCodeSettings,
} from '../src/index.js';

const PETERS = 1460214056;

describe('seedFromPhrase', () => {
  it('is stable: these numbers must never change, or shared games break', () => {
    expect(seedFromPhrase('Peters Game')).toBe(PETERS);
    expect(seedFromPhrase('Casual Colonization')).toBe(1984286077);
    expect(seedFromPhrase('Ålesund')).toBe(719379816);
    // FNV-1a("a") is 0xe40c292c; cut to 31 bits.
    expect(seedFromPhrase('a')).toBe(1678518572);
  });

  it('keeps a pure number as that number', () => {
    expect(seedFromPhrase('1234567')).toBe(1234567);
    expect(seedFromPhrase('  42 ')).toBe(42);
    expect(seedFromPhrase('0')).toBe(0);
    expect(seedFromPhrase('2024')).toBe(2024);
    expect(parseSeedInput('2024')).toEqual({ seed: 2024 });
  });

  it('normalises case, whitespace and Unicode form', () => {
    expect(seedFromPhrase('peters game')).toBe(seedFromPhrase('Peters Game'));
    expect(seedFromPhrase('  Peters \t  GAME\n')).toBe(seedFromPhrase('Peters Game'));
    expect(seedFromPhrase('Café')).toBe(seedFromPhrase('Café'));
    expect(normalizePhrase('  Peters   Game ')).toBe('peters game');
    expect(seedFromPhrase('Peters Game 2')).not.toBe(seedFromPhrase('Peters Game'));
  });

  it('gives a non-negative 31-bit integer', () => {
    for (const t of ['x', 'Peters Game', 'ü', 'a much longer phrase with several words in it']) {
      const n = seedFromPhrase(t);
      expect(Number.isInteger(n) && n >= 0 && n <= 0x7fffffff).toBe(true);
    }
  });

  it('parseSeedInput keeps the phrase for display', () => {
    expect(parseSeedInput('  Peters   Game ')).toEqual({ seed: PETERS, seedPhrase: 'Peters Game' });
    expect(describeSeed({ seed: PETERS, seedPhrase: 'Peters Game' })).toBe(`Peters Game (${PETERS})`);
    expect(describeSeed({ seed: 5 })).toBe('5');
  });

  it('the same phrase makes the same world, and the phrase is kept in the state', () => {
    const base = { mapSize: 'small' as const, nations: ['england' as const], humans: ['england' as const] };
    const a = createGame({ ...base, ...parseSeedInput('Peters Game') });
    const b = createGame({ ...base, ...parseSeedInput('peters game') });
    expect(a.config.seedPhrase).toBe('Peters Game');
    expect(a.map).toEqual(b.map);
    expect(a.rng).toBe(b.rng);
  });
});

describe('game code', () => {
  const settings: GameCodeSettings = {
    seed: PETERS,
    seedPhrase: 'Peters Game ☃',
    map: 'some-map',
    mapSize: 'large',
    nations: [
      { nation: 'netherlands', controller: 'human' },
      { nation: 'spain', controller: 'combative' },
      { nation: 'england', controller: 'creative' },
    ],
    difficulty: 'viceroy',
    historicalEvents: true,
    randomEvents: false,
    colonyCharter: true,
    headStartTurn: 258,
  };

  it('round-trips and is URL-safe', () => {
    const code = encodeGameCode(settings);
    expect(code).toMatch(/^CC1~[\d.]+~[A-Za-z0-9_-]+$/);
    expect(looksLikeGameCode(code)).toBe(true);
    const r = decodeGameCode(code);
    expect(r.ok && r.settings).toEqual(settings);
    expect(r.ok && r.versionWarning).toBeUndefined();
  });

  it('round-trips a plain number seed with no phrase, map or head start', () => {
    const plain: GameCodeSettings = { seed: 7, mapSize: 'small', nations: [{ nation: 'england', controller: 'human' }], difficulty: 'conquistador', historicalEvents: false, randomEvents: false, colonyCharter: false };
    const r = decodeGameCode(encodeGameCode(plain));
    expect(r.ok && r.settings).toEqual(plain);
  });

  it('describes a game config', () => {
    const s = createGame({ seed: 3, seedPhrase: 'x y', mapSize: 'small', nations: ['england', 'france'], humans: ['england'], ai: { france: 'competent' }, difficulty: 'explorer', colonyCharter: true });
    const r = decodeGameCode(encodeGameCode(settingsFromConfig(s.config)));
    expect(r.ok && r.settings).toMatchObject({ seed: 3, seedPhrase: 'x y', difficulty: 'explorer', colonyCharter: true, nations: [{ nation: 'england', controller: 'human' }, { nation: 'france', controller: 'competent' }] });
  });

  it('warns, without refusing, when the version differs', () => {
    const code = encodeGameCode(settings).replace(`~${GAME_VERSION}~`, '~0.1~');
    const r = decodeGameCode(code);
    expect(r.ok).toBe(true);
    expect(r.ok && r.versionWarning).toMatch(/may produce a different game/);
    expect(r.ok && r.settings).toEqual(settings);
  });

  it('refuses nonsense', () => {
    for (const t of ['', 'Peters Game', 'CC1~0.8~', 'CC1~0.8~!!!', 'CC9~0.8~abc', `CC1~0.8~${btoa('[1]')}`]) expect(decodeGameCode(t).ok).toBe(false);
    expect(looksLikeGameCode('Peters Game')).toBe(false);
  });
});

describe('share link', () => {
  const settings: GameCodeSettings = {
    seed: PETERS,
    seedPhrase: 'Peters Game',
    mapSize: 'medium',
    nations: [
      { nation: 'england', controller: 'human' },
      { nation: 'france', controller: 'competent' },
      { nation: 'netherlands', controller: 'combative' },
      { nation: 'spain', controller: 'creative' },
    ],
    difficulty: 'conquistador',
    historicalEvents: true,
    randomEvents: true,
    colonyCharter: true,
  };
  const base = 'https://example.org/casual/';

  it('round-trips settings to a link and back', () => {
    const link = gameLink(base, settings);
    expect(link.startsWith(`${base}?game=`)).toBe(true);
    const code = gameCodeFromSearch(new URL(link).search);
    expect(code).toBe(encodeGameCode(settings));
    const r = decodeGameCode(code!);
    expect(r.ok && r.settings).toEqual(settings);
  });

  it('stays short enough for a comfortable QR code', () => {
    expect(gameLink(base, settings).length).toBeLessThan(220);
  });

  it('clears only the game parameter after reading', () => {
    expect(searchWithoutGameCode('?game=CC1~0.8~abc')).toBe('');
    expect(searchWithoutGameCode('?a=1&game=CC1~0.8~abc&b=2')).toBe('?a=1&b=2');
    expect(gameCodeFromSearch('?game=hello')).toBeNull();
    expect(gameCodeFromSearch('')).toBeNull();
  });

  it('gives the QR encoder exactly the link', () => {
    const seen: string[] = [];
    const share = buildShare(settings, base, (text) => (seen.push(text), 'qr'));
    expect(seen).toEqual([share.link]);
    expect(share.qr).toBe('qr');
    expect(share.code).toBe(encodeGameCode(settings));
  });
});
