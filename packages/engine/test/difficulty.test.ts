import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buyPrice,
  createGame,
  createUnit,
  deserialize,
  DIFFICULTY,
  DIFFICULTY_LEVELS,
  difficultyRules,
  GOOD_DEFS,
  handOver,
  headStartConfig,
  isWater,
  onColonyFounded,
  playUntil,
  recruitPrice,
  resolveDifficulty,
  royalForce,
  sellToMarket,
  serialize,
  tileAt,
  trainPrice,
  UNIT_TYPES,
  type DifficultyId,
  type GameConfig,
  type GameState,
  type Player,
} from '../src/index.js';
import { resolveRumour } from '../src/rumours.js';

const config = (difficulty?: DifficultyId, extra: Partial<GameConfig> = {}): GameConfig => ({
  seed: 7,
  mapSize: 'small',
  nations: ['england', 'france'],
  humans: ['england'],
  ai: { france: 'competent' },
  ...(difficulty ? { difficulty } : {}),
  ...extra,
});

const nation = (s: GameState, id: Player['id']) => s.players.find((p) => p.id === id)!;

/** A copy of the state without the difficulty fields, to compare games with and without them. */
function withoutDifficulty(s: GameState): unknown {
  const copy = JSON.parse(serialize(s));
  delete copy.difficulty;
  delete copy.config.difficulty;
  delete copy.config.difficultyForAll;
  for (const p of copy.players) delete p.difficulty;
  return copy;
}

describe('difficulty levels', () => {
  it('resolves every level, and falls back to Conquistador', () => {
    expect(DIFFICULTY_LEVELS).toEqual(['discoverer', 'explorer', 'conquistador', 'governor', 'viceroy']);
    for (const level of DIFFICULTY_LEVELS) {
      expect(resolveDifficulty(level)).toBe(level);
      const s = createGame(config(level));
      expect(s.difficulty).toBe(level);
      expect(nation(s, 'england').difficulty).toBe(level);
      expect(nation(s, 'england').gold).toBe(DIFFICULTY[level].startingGold);
      expect(difficultyRules(nation(s, 'england'))).toBe(DIFFICULTY[level]);
      // Computer players keep Conquistador economics.
      expect(nation(s, 'france').difficulty).toBeUndefined();
      expect(nation(s, 'france').gold).toBe(1000);
      expect(difficultyRules(nation(s, 'france'))).toBe(DIFFICULTY.conquistador);
    }
    expect(resolveDifficulty(undefined)).toBe('conquistador');
    expect(resolveDifficulty('impossible')).toBe('conquistador');
    expect(createGame(config()).difficulty).toBe('conquistador');
  });

  it('makes Conquistador the rules from before difficulty levels', () => {
    const r = DIFFICULTY.conquistador;
    for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && k !== 'startingGold' && k !== 'taxCeiling') expect(v, k).toBe(1);
    expect(r.startingGold).toBe(1000);
    expect(r.taxCeiling).toBe(70);

    const s = createGame(config('conquistador'));
    const p = nation(s, 'england');
    expect(p.crossesRequired).toBe(30);
    for (const g of Object.keys(GOOD_DEFS) as (keyof typeof GOOD_DEFS)[]) expect(buyPrice(p, g)).toBe(p.market[g].price + GOOD_DEFS[g].spread);
    expect(trainPrice(p, 'expertFarmer')).toBe(UNIT_TYPES.expertFarmer.price);
    expect(recruitPrice(p)).toBe(Math.max(80, Math.round(300 * (1 - Math.min(1, p.crosses / 30) * 0.6))));
    for (let n = 0; n < 20; n++) {
      expect(royalForce(p, n)).toEqual({ regulars: 4 + 2 * n, dragoons: 2 + n, artillery: 1 + Math.floor(n / 2), menOfWar: 2 });
    }
  });

  it('plays a game at Conquistador exactly as a game without a difficulty', () => {
    const cfg: GameConfig = { seed: 11, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: [], ai: { england: 'creative', france: 'competent', spain: 'naive' } };
    const legacy = createGame(cfg);
    const chosen = createGame({ ...cfg, difficulty: 'conquistador', difficultyForAll: true });
    for (const s of [legacy, chosen]) while (s.turn < 60 && !s.gameOver) applyCommand(s, { type: 'endTurn' });
    expect(withoutDifficulty(chosen)).toEqual(withoutDifficulty(legacy));
  });

  it('raises prices and costs for people on harder levels', () => {
    const s = createGame(config('viceroy'));
    const human = nation(s, 'england');
    const ai = nation(s, 'france');
    expect(buyPrice(human, 'food') - human.market.food.price).toBeGreaterThan(buyPrice(ai, 'food') - ai.market.food.price);
    expect(buyPrice(human, 'silver') - human.market.silver.price).toBeGreaterThan(GOOD_DEFS.silver.spread);
    expect(trainPrice(human, 'expertFarmer')).toBeGreaterThan(trainPrice(ai, 'expertFarmer'));
    expect(recruitPrice(human)).toBeGreaterThan(recruitPrice(ai));
    expect(human.crossesRequired).toBeGreaterThan(ai.crossesRequired);
    const easy = nation(createGame(config('discoverer')), 'england');
    expect(recruitPrice(easy)).toBeLessThan(recruitPrice(ai));
    expect(trainPrice(easy, 'expertFarmer')).toBeLessThan(trainPrice(ai, 'expertFarmer'));
  });

  it('makes prices fall faster when people sell on harder levels', () => {
    const fall = (level: DifficultyId) => {
      const s = createGame(config(level));
      const p = nation(s, 'england');
      const before = p.market.silver.price;
      sellToMarket(s, p, 'silver', 1000);
      return before - p.market.silver.price;
    };
    expect(fall('viceroy')).toBeGreaterThan(fall('conquistador'));
    expect(fall('conquistador')).toBeGreaterThan(fall('discoverer'));
  });

  it('raises taxes more often, further and higher on harder levels', () => {
    const raises = (level: DifficultyId) => {
      const s = createGame(config(level));
      s.turn = 200;
      const p = nation(s, 'england');
      let count = 0;
      let total = 0;
      for (let i = 0; i < 3000; i++) {
        p.tax = 10;
        p.pendingTax = null;
        sellToMarket(s, p, 'silver', 10);
        p.market.silver.price = GOOD_DEFS.silver.price;
        if (p.pendingTax) {
          count++;
          total += (p.pendingTax as { rate: number }).rate - 10;
        }
      }
      return { count, size: total / count };
    };
    const easy = raises('discoverer');
    const normal = raises('conquistador');
    const hard = raises('viceroy');
    expect(hard.count).toBeGreaterThan(normal.count);
    expect(normal.count).toBeGreaterThan(easy.count);
    expect(hard.size).toBeGreaterThan(normal.size);
    expect(normal.size).toBeGreaterThan(easy.size);

    // The ceiling: 70% stops the Crown at Conquistador but not at Viceroy.
    const ceiling = (level: DifficultyId) => {
      const s = createGame(config(level));
      s.turn = 200;
      const p = nation(s, 'england');
      for (let i = 0; i < 500 && !p.pendingTax; i++) {
        p.tax = 72;
        sellToMarket(s, p, 'silver', 10);
      }
      return p.pendingTax;
    };
    expect(ceiling('conquistador')).toBeNull();
    expect(ceiling('viceroy')?.rate).toBeLessThanOrEqual(80);
    expect(ceiling('viceroy')?.rate).toBeGreaterThan(72);
  });

  it('angers the natives more on harder levels, for people only', () => {
    const s = createGame(config('viceroy'));
    const st = Object.values(s.settlements)[0];
    onColonyFounded(s, { owner: 'england', x: st.x + 1, y: st.y });
    onColonyFounded(s, { owner: 'france', x: st.x + 1, y: st.y });
    expect(st.tension.france).toBe(150);
    expect(st.tension.england).toBe(Math.round(150 * DIFFICULTY.viceroy.nativeTension));
    const calm = createGame(config('discoverer'));
    const st2 = Object.values(calm.settlements)[0];
    onColonyFounded(calm, { owner: 'england', x: st2.x + 1, y: st2.y });
    expect(st2.tension.england).toBeLessThan(150);
  });

  it('sends a bigger Royal Expeditionary Force against people on harder levels', () => {
    const s = createGame(config('viceroy'));
    const hard = royalForce(nation(s, 'england'), 8);
    const normal = royalForce(nation(s, 'france'), 8);
    const easy = royalForce(nation(createGame(config('discoverer')), 'england'), 8);
    const size = (r: typeof hard) => r.regulars + r.dragoons + r.artillery;
    expect(size(hard)).toBeGreaterThan(size(normal));
    expect(size(normal)).toBeGreaterThan(size(easy));
    // It also grows faster with each colony.
    expect(size(royalForce(nation(s, 'england'), 9)) - size(hard)).toBeGreaterThan(size(royalForce(nation(s, 'france'), 9)) - size(normal));
  });

  it('loses more expeditions to Lost City Rumours on harder levels', () => {
    const lost = (level: DifficultyId) => {
      const s = createGame(config(level));
      let at = { x: 0, y: 0 };
      for (let i = 0; i < s.map.tiles.length; i++) {
        const x = i % s.map.width;
        const y = Math.floor(i / s.map.width);
        if (!isWater(tileAt(s, x, y)!)) {
          at = { x, y };
          break;
        }
      }
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', ...at });
        resolveRumour(s, u);
        if (!s.units[u.id]) n++;
        else delete s.units[u.id];
      }
      return n;
    };
    expect(lost('viceroy')).toBeGreaterThan(lost('conquistador'));
    expect(lost('conquistador')).toBeGreaterThan(lost('discoverer'));
  });

  it('applies the people’s difficulty to their nation during a head start', () => {
    const s = createGame(headStartConfig(config('governor'), 20));
    const england = nation(s, 'england');
    expect(england.human).toBe(false);
    expect(england.difficulty).toBe('governor');
    expect(nation(s, 'france').difficulty).toBeUndefined();
    playUntil(s, 20);
    handOver(s);
    expect(england.human).toBe(true);
    expect(england.difficulty).toBe('governor');
    expect(s.difficulty).toBe('governor');
  });

  it('loads saves without a difficulty as Conquistador', () => {
    const s = createGame(config('viceroy'));
    const raw = JSON.parse(serialize(s));
    delete raw.difficulty;
    delete raw.config.difficulty;
    for (const p of raw.players) delete p.difficulty;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.version).toBe(2);
    expect(loaded.difficulty).toBe('conquistador');
    for (const p of loaded.players) expect(difficultyRules(p)).toBe(DIFFICULTY.conquistador);
    // A save with a difficulty keeps it.
    expect(deserialize(serialize(s)).difficulty).toBe('viceroy');
  });
});
