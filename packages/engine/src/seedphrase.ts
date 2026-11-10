/**
 * Seed phrases and game codes.
 *
 * A game is easy to share by name: "Peters Game" is hashed to the seed number. The same phrase
 * gives the same world only with the same settings (map, nations, difficulty, options) and game
 * version, so a game code can carry those settings too.
 */
import { AI_LEVELS, type AiLevel } from './ai/profiles.js';
import { DIFFICULTY_LEVELS, type DifficultyId } from './rules/difficulty.js';
import { NATION_IDS, type NationId } from './rules/nations.js';
import { DEFAULT_SCENARIO, getScenario } from './scenarios/index.js';
import type { GameConfig, MapSize } from './types.js';

/** Version written into game codes. Bump when a change makes the same code produce another game. */
export const GAME_VERSION = '0.8';

/**
 * The text a phrase is hashed from: Unicode NFC, whitespace runs collapsed to one space, trimmed,
 * and lower-cased, so "Peters  game" and " peters Game " are the same phrase as "Peters Game".
 * (Case is deliberately ignored: people share names by voice and chat.)
 */
export function normalizePhrase(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase().normalize('NFC');
}

/** FNV-1a (32 bit) over the UTF-8 bytes of the text. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** True for text that is only a (possibly negative) whole number, which stays that number. */
export function isSeedNumber(text: string): boolean {
  return /^-?\d{1,15}$/.test(text.trim());
}

/**
 * The seed for what a person typed. Pure and stable: a future change must not alter these numbers,
 * or shared games break (the tests pin some values).
 *
 * - Text that is only a whole number stays that number, so existing seeds keep working.
 * - Anything else is normalised (see normalizePhrase), hashed with 32-bit FNV-1a over its UTF-8
 *   bytes, and cut to 31 bits, giving a number from 0 to 2147483647.
 */
export function seedFromPhrase(text: string): number {
  if (isSeedNumber(text)) return Number(text.trim());
  return fnv1a(normalizePhrase(text)) & 0x7fffffff;
}

/** What the Game seed field holds: the seed, and the phrase when text was typed. */
export function parseSeedInput(text: string): { seed: number; seedPhrase?: string } {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (isSeedNumber(trimmed)) return { seed: Number(trimmed) };
  return { seed: seedFromPhrase(trimmed), seedPhrase: trimmed };
}

/** "Peters Game (1234567)", or just the number. */
export function describeSeed(config: Pick<GameConfig, 'seed' | 'seedPhrase'>): string {
  return config.seedPhrase ? `${config.seedPhrase} (${config.seed})` : String(config.seed);
}

// ---------------------------------------------------------------------------------------------
// Game codes

/** The New game choices a code carries. */
export interface GameCodeSettings {
  seed: number;
  seedPhrase?: string;
  /** Stored map id; absent for a generated map. */
  map?: string;
  mapSize: MapSize;
  nations: { nation: NationId; controller: 'human' | AiLevel }[];
  difficulty: DifficultyId;
  historicalEvents: boolean;
  randomEvents: boolean;
  colonyCharter: boolean;
  /** Turn on which the people take over (head start); absent for a start at the beginning. */
  headStartTurn?: number;
  /** 'real' when the game was set up with the scenario's real rivals; absent for alternative history. */
  rivals?: 'real';
  /** The scenario's id; absent for the Americas (DEFAULT_SCENARIO), so their codes are as before. */
  scenario?: string;
}

const PREFIX = 'CC1';
const SEP = '~';
const SIZES: MapSize[] = ['small', 'medium', 'large'];

/** The settings of a game's config, as a code carries them. */
export function settingsFromConfig(config: GameConfig): GameCodeSettings {
  return {
    seed: config.seed,
    ...(config.seedPhrase ? { seedPhrase: config.seedPhrase } : {}),
    ...(config.map ? { map: config.map } : {}),
    mapSize: config.mapSize,
    nations: config.nations.map((nation) => ({
      nation,
      controller: config.humans.includes(nation) || config.headStart?.humans.includes(nation) ? 'human' : (config.ai?.[nation] ?? 'naive'),
    })),
    difficulty: config.difficulty ?? 'conquistador',
    historicalEvents: !!config.historicalEvents,
    randomEvents: !!config.randomEvents,
    colonyCharter: !!config.colonyCharter,
    ...(config.headStart ? { headStartTurn: config.headStart.turn } : {}),
    ...(config.rivals === 'real' ? { rivals: 'real' as const } : {}),
    ...(config.scenario && config.scenario !== DEFAULT_SCENARIO ? { scenario: config.scenario } : {}),
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * A compact, URL-safe code: `CC1~<game version>~<payload>`. The payload is base64url of a short
 * JSON array: [seed, phrase|0, map|0, size index, [[nation index, "h" or AI level]...],
 * difficulty index, flags (1 historical, 2 random, 4 charter), head start turn|0], followed by
 * "real" only for a game with real rivals, and then the scenario's id only for a game outside the
 * Americas (with 0 in the rivals' place for alternative history), so Americas codes are as before.
 */
export function encodeGameCode(settings: GameCodeSettings): string {
  const payload = [
    settings.seed,
    settings.seedPhrase ?? 0,
    settings.map ?? 0,
    SIZES.indexOf(settings.mapSize),
    settings.nations.map((n) => [NATION_IDS.indexOf(n.nation as (typeof NATION_IDS)[number]), n.controller === 'human' ? 'h' : n.controller]),
    DIFFICULTY_LEVELS.indexOf(settings.difficulty),
    (settings.historicalEvents ? 1 : 0) | (settings.randomEvents ? 2 : 0) | (settings.colonyCharter ? 4 : 0),
    settings.headStartTurn ?? 0,
    ...(settings.scenario && settings.scenario !== DEFAULT_SCENARIO ? [settings.rivals === 'real' ? 'real' : 0, settings.scenario] : settings.rivals === 'real' ? ['real'] : []),
  ];
  return `${PREFIX}${SEP}${GAME_VERSION}${SEP}${toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

export type DecodedGameCode = { ok: true; settings: GameCodeSettings; version: string; versionWarning?: string } | { ok: false; error: string };

/** True when text looks like a game code (so the seed field can tell it from a phrase). */
export function looksLikeGameCode(text: string): boolean {
  return text.trim().startsWith(`${PREFIX}${SEP}`);
}

/** Reads a code. A code from another game version still decodes, with a non-blocking warning. */
export function decodeGameCode(code: string): DecodedGameCode {
  const bad: DecodedGameCode = { ok: false, error: 'That is not a game code.' };
  const parts = code.trim().split(SEP);
  if (parts.length !== 3 || parts[0] !== PREFIX) return bad;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[2]))) as unknown[];
    const [seed, phrase, map, size, nations, diff, flags, head, rivals, scenario] = p;
    const mapSize = SIZES[size as number];
    const difficulty = DIFFICULTY_LEVELS[diff as number];
    if (typeof seed !== 'number' || !Number.isFinite(seed) || !mapSize || !difficulty || !Array.isArray(nations) || nations.length < 1 || nations.length > NATION_IDS.length || typeof flags !== 'number') return bad;
    if (scenario !== undefined && typeof scenario !== 'string') return bad;
    if (typeof scenario === 'string' && !getScenario(scenario)) return { ok: false, error: `This code is for the scenario "${scenario}", which this version of the game does not have.` };
    const list: GameCodeSettings['nations'] = [];
    for (const n of nations as [number, string][]) {
      const nation = NATION_IDS[n[0]];
      const controller = n[1] === 'h' ? 'human' : (AI_LEVELS as string[]).includes(n[1]) ? (n[1] as AiLevel) : undefined;
      if (!nation || !controller || list.some((x) => x.nation === nation)) return bad;
      list.push({ nation, controller });
    }
    const settings: GameCodeSettings = {
      seed,
      ...(typeof phrase === 'string' ? { seedPhrase: phrase } : {}),
      ...(typeof map === 'string' ? { map } : {}),
      mapSize,
      nations: list,
      difficulty,
      historicalEvents: !!(flags & 1),
      randomEvents: !!(flags & 2),
      colonyCharter: !!(flags & 4),
      ...(typeof head === 'number' && head > 0 ? { headStartTurn: head } : {}),
      ...(rivals === 'real' ? { rivals: 'real' as const } : {}),
      ...(typeof scenario === 'string' && scenario !== DEFAULT_SCENARIO ? { scenario } : {}),
    };
    const version = parts[1];
    return {
      ok: true,
      settings,
      version,
      ...(version !== GAME_VERSION ? { versionWarning: `This code is from game version ${version}; you have ${GAME_VERSION}. It may produce a different game.` } : {}),
    };
  } catch {
    return bad;
  }
}

// ---------------------------------------------------------------------------------------------
// Share links

/** The query parameter that carries a game code in a share link. */
export const SHARE_PARAM = 'game';

/** The link for a game: the page address (origin and path, no query) plus `?game=<code>`. */
export function gameLink(base: string, settings: GameCodeSettings): string {
  return `${base}?${SHARE_PARAM}=${encodeURIComponent(encodeGameCode(settings))}`;
}

/** The game code in a location's query string ("?game=..."), or null. */
export function gameCodeFromSearch(search: string): string | null {
  const code = new URLSearchParams(search).get(SHARE_PARAM);
  return code && looksLikeGameCode(code) ? code : null;
}

/** The query string without the game parameter ("" when nothing else is left), for history.replaceState. */
export function searchWithoutGameCode(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SHARE_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/**
 * Everything the share dialog shows: the link, the short code, and the QR code made from exactly
 * the link (the encoder is given the link string and nothing else).
 */
export function buildShare<Qr>(settings: GameCodeSettings, base: string, qr: (text: string) => Qr): { link: string; code: string; qr: Qr } {
  const link = gameLink(base, settings);
  return { link, code: encodeGameCode(settings), qr: qr(link) };
}
