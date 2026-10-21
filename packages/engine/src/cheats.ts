/**
 * Cheats, mainly for testing computer players in unusual situations. Each one is a Command, so it is
 * deterministic and replayable. Any use marks the game as cheated for good (`GameState.cheated`).
 */
import { fail } from './errors.js';
import { message, player } from './queries.js';
import { GOODS } from './rules/goods.js';
import { NATIONS, type NationId } from './rules/nations.js';
import type { GameState } from './types.js';

export type CheatId = 'gold' | 'doublePrices' | 'peace' | 'doubleYields' | 'reveal';

export interface CheatInfo {
  name: string;
  /** Acts on one chosen nation. */
  perNation: boolean;
  /** Can be switched on and off again. */
  toggle: boolean;
  note: string;
}

export const CHEATS: Record<CheatId, CheatInfo> = {
  gold: { name: 'Add 10,000 gold to treasury', perNation: true, toggle: false, note: 'Gives the chosen nation 10,000 gold.' },
  doublePrices: {
    name: 'Double all selling prices in home port',
    perNation: true,
    toggle: false,
    note: "Doubles every price in the chosen nation's European market. Prices then move with trade and drift back as usual.",
  },
  peace: {
    name: 'Force peace between all nations',
    perNation: false,
    toggle: false,
    note: 'Ends every war between European nations. Native tribes and the Crown are not affected.',
  },
  doubleYields: { name: 'Double all terrain yields', perNation: false, toggle: true, note: 'Every worked tile and colony centre yields twice as much, for all nations.' },
  reveal: { name: 'Reveal map', perNation: true, toggle: true, note: "Shows the whole map without fog in the chosen nation's view. Changes only what is drawn." },
};

export const CHEAT_IDS = Object.keys(CHEATS) as CheatId[];

export const CHEAT_GOLD = 10_000;

/** Whether any cheat has been used in this game. */
export function isCheated(s: GameState): boolean {
  return !!s.cheated;
}

/** Multiplier on terrain yields: 1 unless the double-yields cheat is on. */
export function yieldMultiplier(s: GameState): number {
  return s.modifiers?.yieldMultiplier ?? 1;
}

/** Whether the reveal-map cheat is on for a nation's view. */
export function mapRevealed(s: GameState, nation: NationId): boolean {
  return !!s.modifiers?.reveal?.includes(nation);
}

function markCheated(s: GameState, cheat: CheatId): void {
  if (!s.cheated) s.cheated = { turn: s.turn, cheats: [] };
  if (!s.cheated.cheats.includes(cheat)) s.cheated.cheats.push(cheat);
}

/**
 * Applies a cheat. `nation` is the nation a per-nation cheat acts on. For a toggle, `on` sets it;
 * leaving it out flips it.
 */
export function applyCheat(s: GameState, cheat: CheatId, nation: NationId, on?: boolean): string {
  const def = CHEATS[cheat];
  if (!def) fail(`Unknown cheat ${cheat}.`);
  if (def.perNation) {
    if (nation === 'crown') fail('Cheats cannot be used for the Crown.');
    if (!s.players.some((p) => p.id === nation)) fail(`${nation} is not taking part.`);
  }
  let text: string;
  switch (cheat) {
    case 'gold':
      player(s, nation).gold += CHEAT_GOLD;
      text = `${NATIONS[nation].name} receives ${CHEAT_GOLD.toLocaleString('en')} gold.`;
      break;
    case 'doublePrices':
      for (const g of GOODS) player(s, nation).market[g].price *= 2;
      text = `Prices in the ${NATIONS[nation].adjective} home port have doubled.`;
      break;
    case 'peace': {
      const europeans = s.players.filter((x) => x.id !== 'crown');
      for (const a of europeans) {
        for (const b of europeans) {
          if (a === b || a.stance[b.id] !== 'war') continue;
          a.stance[b.id] = 'peace';
          delete a.warSince[b.id];
        }
      }
      text = 'All European nations are at peace.';
      break;
    }
    case 'doubleYields': {
      const enable = on ?? yieldMultiplier(s) === 1;
      const mods = (s.modifiers = s.modifiers ?? {});
      if (enable) mods.yieldMultiplier = 2;
      else delete mods.yieldMultiplier;
      text = enable ? 'Terrain yields are doubled.' : 'Terrain yields are back to normal.';
      break;
    }
    case 'reveal': {
      const mods = (s.modifiers = s.modifiers ?? {});
      const list = (mods.reveal ?? []).filter((n) => n !== nation);
      const enable = on ?? !mapRevealed(s, nation);
      if (enable) list.push(nation);
      if (list.length) mods.reveal = list;
      else delete mods.reveal;
      text = enable ? `The whole map is revealed to ${NATIONS[nation].name}.` : `${NATIONS[nation].name} sees only what it has explored again.`;
      break;
    }
    default:
      fail(`Unknown cheat ${cheat as string}.`);
  }
  if (s.modifiers && !Object.keys(s.modifiers).length) delete s.modifiers;
  markCheated(s, cheat);
  message(s, `Cheat: ${text}`);
  return text;
}
