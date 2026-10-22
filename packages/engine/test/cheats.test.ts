import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  CHEAT_GOLD,
  colonyReport,
  createGame,
  createUnit,
  deserialize,
  foundColony,
  formatArena,
  GOOD_DEFS,
  isCheated,
  isWater,
  mapRevealed,
  sellToMarket,
  serialize,
  standing,
  startWar,
  summarise,
  tileAt,
  type Command,
  type GameState,
} from '../src/index.js';

function game(humans: ('england' | 'france')[] = ['england']): GameState {
  return createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france', 'spain'], humans, ai: { france: 'competent', spain: 'creative' } });
}

function colonyOn(s: GameState) {
  for (let y = s.map.height / 2; y < s.map.height; y++) {
    for (let x = 0; x < s.map.width; x++) {
      const t = tileAt(s, x, y)!;
      if (isWater(t) || t.t === 'arctic' || t.t === 'mountains') continue;
      if (Object.values(s.settlements).some((st) => Math.abs(st.x - x) <= 2 && Math.abs(st.y - y) <= 2)) continue;
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id);
    }
  }
  throw new Error('no land');
}

const cheat = (s: GameState, c: Omit<Extract<Command, { type: 'cheat' }>, 'type'>) => applyCommand(s, { type: 'cheat', ...c });

describe('cheats', () => {
  it('leaves an honest game unmarked', () => {
    const s = game();
    expect(s.cheated).toBeUndefined();
    expect(s.modifiers).toBeUndefined();
    expect(isCheated(s)).toBe(false);
  });

  it('adds 10,000 gold to the current nation by default, or to a chosen one', () => {
    const s = game();
    const [eng, fra] = s.players;
    const before = [eng.gold, fra.gold];
    expect(cheat(s, { cheat: 'gold' }).ok).toBe(true);
    expect(eng.gold).toBe(before[0] + CHEAT_GOLD);
    expect(cheat(s, { cheat: 'gold', nation: 'france' }).ok).toBe(true);
    expect(fra.gold).toBe(before[1] + CHEAT_GOLD);
  });

  it('marks the game as cheated for good, and the mark survives saves', () => {
    const s = game();
    applyCommand(s, { type: 'endTurn' });
    const turn = s.turn;
    cheat(s, { cheat: 'doubleYields' });
    cheat(s, { cheat: 'gold' });
    cheat(s, { cheat: 'doubleYields' });
    expect(s.cheated).toEqual({ turn, cheats: ['doubleYields', 'gold'] });
    applyCommand(s, { type: 'endTurn' });
    const loaded = deserialize(serialize(s));
    expect(loaded.cheated).toEqual({ turn, cheats: ['doubleYields', 'gold'] });
    expect(isCheated(loaded)).toBe(true);
  });

  it('refuses unknown nations and the Crown without marking the game', () => {
    const s = game();
    expect(cheat(s, { cheat: 'gold', nation: 'russia' }).ok).toBe(false);
    expect(cheat(s, { cheat: 'gold', nation: 'crown' }).ok).toBe(false);
    expect(s.cheated).toBeUndefined();
  });

  it('doubles one nation’s home port prices, which then follow supply and demand', () => {
    const s = game();
    const [eng, fra] = s.players;
    const furs = eng.market.furs.price;
    const muskets = eng.market.muskets.price;
    cheat(s, { cheat: 'doublePrices', nation: 'england' });
    expect(eng.market.furs.price).toBe(furs * 2);
    expect(eng.market.muskets.price).toBe(muskets * 2);
    expect(fra.market.furs.price).toBe(furs);
    // Selling still lowers the price, starting from the doubled level.
    sellToMarket(s, eng, 'furs', GOOD_DEFS.furs.elasticity * 3);
    expect(eng.market.furs.price).toBe(furs * 2 - 3);
    // Buying above the usual maximum does not snap the price back down.
    const high = eng.market.silver.price;
    expect(high).toBeGreaterThan(GOOD_DEFS.silver.maxPrice);
    sellToMarket(s, eng, 'silver', -GOOD_DEFS.silver.elasticity * 2);
    expect(eng.market.silver.price).toBe(high);
  });

  it('forces peace between all European nations but leaves tribes alone', () => {
    const s = game();
    startWar(s, 'england', 'france');
    startWar(s, 'spain', 'france');
    s.tribes[0].stance.england = 'war';
    cheat(s, { cheat: 'peace' });
    for (const p of s.players) for (const stance of Object.values(p.stance)) expect(stance).toBe('peace');
    expect(s.players.every((p) => Object.keys(p.warSince).length === 0)).toBe(true);
    expect(s.tribes[0].stance.england).toBe('war');
  });

  it('doubles terrain yields while switched on, and can be switched off', () => {
    const s = game();
    const colony = colonyOn(s);
    const normal = colonyReport(s, colony).produced;
    cheat(s, { cheat: 'doubleYields' });
    expect(s.modifiers?.yieldMultiplier).toBe(2);
    const doubled = colonyReport(s, colony).produced;
    expect(doubled.food).toBeGreaterThan(normal.food);
    expect(doubled.food).toBeGreaterThanOrEqual(normal.food * 2 - 2);
    cheat(s, { cheat: 'doubleYields', on: false });
    expect(s.modifiers).toBeUndefined();
    expect(colonyReport(s, colony).produced).toEqual(normal);
    expect(s.cheated?.cheats).toEqual(['doubleYields']);
  });

  it('reveals the map for one nation’s view as a toggle', () => {
    const s = game();
    cheat(s, { cheat: 'reveal', nation: 'france' });
    expect(mapRevealed(s, 'france')).toBe(true);
    expect(mapRevealed(s, 'england')).toBe(false);
    cheat(s, { cheat: 'reveal', nation: 'france' });
    expect(mapRevealed(s, 'france')).toBe(false);
    expect(s.modifiers).toBeUndefined();
  });

  it('works in computer-only games and replays deterministically', () => {
    const play = () => {
      const s = createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'competent', france: 'combative' } });
      cheat(s, { cheat: 'gold', nation: 'france' });
      cheat(s, { cheat: 'doubleYields' });
      for (let i = 0; i < 20; i++) applyCommand(s, { type: 'endTurn' });
      cheat(s, { cheat: 'doublePrices', nation: 'england' });
      cheat(s, { cheat: 'peace' });
      for (let i = 0; i < 20; i++) applyCommand(s, { type: 'endTurn' });
      return s;
    };
    const a = play();
    expect(serialize(a)).toBe(serialize(play()));
    expect(a.cheated?.cheats).toEqual(['gold', 'doubleYields', 'doublePrices', 'peace']);
  });

  it('flags cheated games in arena standings and tables', () => {
    const s = game([]);
    const clean = summarise([{ ...standing(s, 42, 'france', 'competent'), game: 0, won: true }]);
    expect(clean[0].cheated).toBe(0);
    expect(formatArena(clean)).not.toContain('heat');
    cheat(s, { cheat: 'gold', nation: 'france' });
    const entry = standing(s, 42, 'france', 'competent');
    expect(entry.cheated).toBe(true);
    const table = formatArena(summarise([{ ...entry, game: 0, won: true }]));
    expect(table).toContain('Competent (1 cheated)');
    expect(table).toContain('Cheats used');
  });
});
