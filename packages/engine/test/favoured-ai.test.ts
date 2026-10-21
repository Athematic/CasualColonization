/**
 * The computer players' use of Favoured Nation (0.4 step 2): proposals, trade routes to partners'
 * colonies, port choice, triangle trading, tax decisions and war. See docs/design/favoured-nation.md.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_PROFILES,
  answerProposal,
  colonyReport,
  colonySiteProblem,
  createGame,
  createUnit,
  findPath,
  foundColony,
  hasTradeAgreement,
  isCoastal,
  isFavoured,
  isWater,
  makeFavoured,
  makeTradeAgreement,
  playArenaGame,
  relation,
  routesBetween,
  routesOf,
  sellToMarket,
  setFeatureSink,
  tileAt,
  type AiLevel,
  type Colony,
  type GameState,
  type GoodId,
  type NationId,
} from '../src/index.js';
import { runAi } from '../src/ai/index.js';
import { choosePort, exportShare, foreignAffairs, refusesTax, sellHere, triangleBuy, WAR_AFTER_CANCEL } from '../src/ai/foreign.js';
import { manageLogistics } from '../src/ai/logistics.js';

function game(opts: { seed?: number; humans?: NationId[]; ai?: AiLevel; englandAi?: AiLevel; noFavoured?: boolean; nations?: NationId[] } = {}): GameState {
  const s = createGame({
    seed: opts.seed ?? 42,
    mapSize: 'small',
    nations: opts.nations ?? ['england', 'france'],
    humans: opts.humans ?? ['england'],
    ai: { france: opts.ai ?? 'competent', england: opts.englandAi ?? 'naive', spain: 'naive' },
    ...(opts.noFavoured ? { noFavoured: true } : {}),
  });
  for (const p of s.players) p.explored.fill(1);
  return s;
}

function found(s: GameState, owner: NationId, x: number, y: number, name: string): Colony {
  const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
  u.moves = 3;
  return foundColony(s, u.id, name);
}

/** An English and a French colony 3–5 tiles apart on the same land, both on the coast. */
function neighbours(s: GameState, skip: Colony[] = []): [Colony, Colony] {
  const ok = (x: number, y: number) => {
    if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) return false;
    if (skip.some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < 3)) return false;
    const t = tileAt(s, x, y)!.t;
    return t !== 'hills' && t !== 'mountains';
  };
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (!ok(x, y)) continue;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const bx = x + dx;
          const by = y + dy;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 3 || !ok(bx, by)) continue;
          const probe = createUnit(s, 'england', 'wagonTrain', { kind: 'map', x, y });
          const path = findPath(s, probe, bx, by);
          delete s.units[probe.id];
          if (!path || path.length > 7) continue;
          return [found(s, 'england', x, y, 'Plymouth'), found(s, 'france', bx, by, 'Québec')];
        }
      }
    }
  }
  throw new Error('no sites');
}

function besideLand(s: GameState, c: Colony): { x: number; y: number } {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(s, c.x + dx, c.y + dy);
      if ((dx || dy) && t && !isWater(t)) return { x: c.x + dx, y: c.y + dy };
    }
  }
  throw new Error('no land beside');
}

/** The first turn from `from` on which France (second in turn order) reviews its relations. */
function reviewTurn(from: number): number {
  let t = from;
  while ((t + 1) % 5 !== 0) t++;
  return t;
}

const competent = AI_PROFILES.competent;

/** Records the features a callback reports. */
function counting(fn: () => void): Record<string, number> {
  const seen: Record<string, number> = {};
  const prev = setFeatureSink((_n, f, k) => {
    seen[f] = (seen[f] ?? 0) + k;
  });
  try {
    fn();
  } finally {
    setFeatureSink(prev);
  }
  return seen;
}

describe('computer players propose', () => {
  it('a trade agreement to a nearby nation at peace, and wait after a refusal', () => {
    const s = game();
    neighbours(s);
    const fr = s.players[1];
    s.turn = reviewTurn(4);
    foreignAffairs(s, fr, competent, 0, 0);
    // A person answers in the turn-start briefing.
    expect(relation(s, 'england', 'france').proposal).toMatchObject({ kind: 'trade', from: 'france' });
    answerProposal(s, 'england', 'france', false);
    // The next review comes too soon after the refusal (10–20 turns, seeded).
    s.turn = reviewTurn(s.turn + 1);
    foreignAffairs(s, fr, competent, 0, 0);
    expect(relation(s, 'england', 'france').proposal).toBeUndefined();
    s.turn = reviewTurn(s.turn + 21);
    foreignAffairs(s, fr, competent, 0, 0);
    expect(relation(s, 'england', 'france').proposal?.kind).toBe('trade');
  });

  it('and another computer player answers at once', () => {
    const s = game({ humans: [] });
    neighbours(s);
    s.turn = reviewTurn(4);
    foreignAffairs(s, s.players[1], competent, 0, 0);
    expect(hasTradeAgreement(s, 'england', 'france')).toBe(true);
  });

  it('nothing while hostile after a cancellation, nor with --no-favoured', () => {
    const s = game();
    neighbours(s);
    s.turn = reviewTurn(4);
    relation(s, 'england', 'france').hostileUntil = 1000;
    foreignAffairs(s, s.players[1], competent, 0, 0);
    expect(relation(s, 'england', 'france').proposal).toBeUndefined();

    const off = game({ noFavoured: true });
    neighbours(off);
    off.turn = reviewTurn(4);
    foreignAffairs(off, off.players[1], competent, 0, 0);
    expect(relation(off, 'england', 'france').proposal).toBeUndefined();
  });

  it('Favoured Nation once the thresholds are met', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    makeTradeAgreement(s, 'england', 'france');
    const rel = relation(s, 'england', 'france');
    s.turn = reviewTurn(rel.peaceNeeded + 1);
    foreignAffairs(s, s.players[1], competent, 0, 0);
    // Not yet: no trade routes between them.
    expect(rel.proposal).toBeUndefined();
    for (let i = 0; i < rel.routesNeeded; i++) {
      const w = createUnit(s, 'france', 'wagonTrain', { kind: 'map', x: quebec.x, y: quebec.y });
      const r = { id: `r${i}`, owner: 'france' as NationId, name: `Run ${i}`, stops: [{ at: quebec.id, load: [], unload: [] }, { at: home.id, load: [], unload: [] }] };
      s.routes = { ...s.routes, [r.id]: r };
      w.route = { id: r.id, stop: 0 };
    }
    s.turn = reviewTurn(s.turn + 1);
    foreignAffairs(s, s.players[1], competent, 0, 0);
    expect(rel.proposal).toMatchObject({ kind: 'favoured', from: 'france' });
  });
});

describe('trade routes to partners’ colonies', () => {
  it('a wagon train sells surplus at a partner’s colony when it beats shipping home after tax', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    const fr = s.players[1];
    makeTradeAgreement(s, 'england', 'france');
    s.turn = 100;
    // A rich England buys a good Québec makes and Plymouth does not.
    s.players[0].gold = 5000;
    fr.tax = 30;
    const made = colonyReport(s, quebec).produced;
    const own = colonyReport(s, home).produced;
    const good = (['furs', 'sugar', 'tobacco', 'cotton', 'ore', 'silver', 'lumber'] as GoodId[]).find((g) => made[g] > 0 && own[g] === 0)!;
    expect(good).toBeDefined();
    quebec.goods[good] = 200;
    home.goods[good] = 0;
    const wagon = createUnit(s, 'france', 'wagonTrain', { kind: 'map', x: quebec.x, y: quebec.y });
    wagon.moves = 6;
    const seen = counting(() => manageLogistics(s, fr));
    const route = routesOf(s, 'france').find((r) => r.stops.some((st) => st.at === home.id));
    expect(route).toBeDefined();
    expect(route!.stops.find((st) => st.at === home.id)!.unload.map((r) => r.good)).toContain(good);
    expect(wagon.route?.id).toBe(route!.id);
    expect(seen['route:foreign route created']).toBe(1);
    // It counts towards Favoured Nation.
    expect(routesBetween(s, 'england', 'france')).toBe(1);
  });

  it('not when shipping home pays as well and Favoured Nation is already made', () => {
    const s = game();
    const [home, quebec] = neighbours(s);
    const fr = s.players[1];
    makeFavoured(s, 'england', 'france');
    s.turn = 100;
    s.players[0].gold = 5000;
    for (const g of ['furs', 'sugar', 'tobacco', 'cotton', 'ore', 'silver', 'lumber'] as GoodId[]) quebec.goods[g] = 200;
    const wagon = createUnit(s, 'france', 'wagonTrain', { kind: 'map', x: quebec.x, y: quebec.y });
    wagon.moves = 6;
    manageLogistics(s, fr);
    expect(routesOf(s, 'france').some((r) => r.stops.some((st) => st.at === home.id))).toBe(false);
  });
});

describe('ports', () => {
  it('a ship sails where its cargo fetches more after tax, unless colonists wait at home', () => {
    const s = game();
    neighbours(s);
    const fr = s.players[1];
    const en = s.players[0];
    makeFavoured(s, 'england', 'france');
    const ship = createUnit(s, 'france', 'merchantman', { kind: 'map', x: 0, y: 0 });
    ship.cargo = { cigars: 100 };
    fr.tax = 40;
    en.tax = 0;
    expect(choosePort(s, fr, ship)).toBe('england');
    fr.tax = 0;
    en.tax = 40;
    expect(choosePort(s, fr, ship)).toBe('france');
    // Colonists board only at home: six waiting outweigh the better price.
    fr.tax = 40;
    en.tax = 0;
    for (let i = 0; i < 6; i++) createUnit(s, 'france', 'freeColonist', { kind: 'europe' });
    expect(choosePort(s, fr, ship)).toBe('france');
  });

  it('a ship in a partner’s port sells, buys supplies there and sails back', () => {
    const s = game();
    neighbours(s);
    const fr = s.players[1];
    makeFavoured(s, 'england', 'france');
    fr.gold = 3000;
    const ship = createUnit(s, 'france', 'merchantman', { kind: 'europe', port: 'england' });
    ship.cargo = { sugar: 100 };
    const seen = counting(() => runAi(s, fr));
    expect(seen['europe:partner port sales']).toBe(100);
    expect(ship.cargo.sugar ?? 0).toBe(0);
    expect(ship.loc.kind).toBe('sailing');
  });
});

describe('triangle trading', () => {
  it('Creative buys where a good is cheap and sells it in the port that pays more', () => {
    const s = game({ ai: 'creative' });
    neighbours(s);
    const fr = s.players[1];
    const en = s.players[0];
    makeFavoured(s, 'england', 'france');
    fr.gold = 5000;
    fr.market.cigars.price = 6;
    en.market.cigars.price = 16;
    en.tax = 0;
    const ship = createUnit(s, 'france', 'merchantman', { kind: 'europe' });
    // Competent does not trade like this.
    triangleBuy(s, fr, ship, competent);
    expect(ship.cargo?.cigars ?? 0).toBe(0);
    triangleBuy(s, fr, ship, AI_PROFILES.creative);
    expect(ship.cargo?.cigars).toBe(200);
    expect(fr.aiMemory?.triangle?.[ship.id]).toMatchObject({ good: 'cigars', port: 'england' });
    // It keeps them in the port it bought them in, and heads for the dearer one.
    expect(sellHere(s, fr, ship, 'cigars')).toBe(false);
    ship.loc = { kind: 'map', x: 0, y: 0 };
    expect(choosePort(s, fr, ship)).toBe('england');
    // There it sells them.
    ship.loc = { kind: 'europe', port: 'england' };
    const gold = fr.gold;
    const seen = counting(() => runAi(s, fr));
    expect(seen['trade:triangle trade']).toBe(1);
    expect(ship.cargo?.cigars ?? 0).toBe(0);
    expect(fr.gold).toBeGreaterThan(gold);
  });
});

describe('tax raises', () => {
  /** France with plenty of sugar and tobacco, so furs matter little. */
  function exporter(): GameState {
    const s = game();
    const [, quebec] = neighbours(s);
    quebec.goods.sugar = 1000;
    quebec.goods.tobacco = 1000;
    quebec.goods.furs = 0;
    s.players[1].tax = 10;
    return s;
  }

  it('refuses a large raise on a good that matters little, and accepts a small one', () => {
    const s = exporter();
    const fr = s.players[1];
    expect(exportShare(s, fr, 'furs')).toBeLessThan(0.1);
    fr.pendingTax = { rate: 14, good: 'furs' };
    expect(refusesTax(s, fr, fr.pendingTax)).toBe(true);
    foreignAffairs(s, fr, competent, 0, 0);
    expect(fr.boycotts.furs).toBe(true);
    expect(fr.tax).toBe(10);
    fr.pendingTax = { rate: 11, good: 'furs' };
    foreignAffairs(s, fr, competent, 0, 0);
    expect(fr.tax).toBe(11);
    expect(fr.pendingTax).toBeNull();
    // A raise on its main export is accepted, however large.
    fr.pendingTax = { rate: 15, good: 'sugar' };
    foreignAffairs(s, fr, competent, 0, 0);
    expect(fr.tax).toBe(15);
  });

  it('refuses when a partner’s port takes the good untaxed by its own Crown', () => {
    const s = exporter();
    const fr = s.players[1];
    makeFavoured(s, 'england', 'france');
    expect(refusesTax(s, fr, { rate: 11, good: 'furs' })).toBe(true);
    expect(refusesTax(s, fr, { rate: 11, good: 'tools' })).toBe(false);
  });

  it('Naive accepts every raise at once; the advanced levels decide on their turn', () => {
    for (const level of ['naive', 'competent'] as AiLevel[]) {
      const s = game({ ai: level });
      const fr = s.players[1];
      for (let i = 0; i < 5000 && fr.tax === 0 && !fr.pendingTax; i++) sellToMarket(s, fr, 'sugar', 100);
      if (level === 'naive') {
        expect(fr.tax).toBeGreaterThan(0);
        expect(fr.pendingTax).toBeNull();
      } else {
        expect(fr.tax).toBe(0);
        expect(fr.pendingTax).not.toBeNull();
      }
    }
  });
});

describe('war and Favoured Nation', () => {
  /** France (Combative) with a strong army next to a weak English colony, late enough for wars. */
  function armed(nations?: NationId[]) {
    const s = game({ ai: 'combative', nations });
    const [home, quebec] = neighbours(s);
    s.turn = 120;
    const spot = besideLand(s, home);
    for (let i = 0; i < 8; i++) createUnit(s, 'france', 'artillery', { kind: 'map', ...spot }).moves = 3;
    return { s, home, quebec, fr: s.players[1] };
  }

  it('Combative never attacks a Favoured Nation: it cancels first and declares war only turns later', () => {
    const { s, fr } = armed();
    makeFavoured(s, 'england', 'france');
    let cancelled: number | null = null;
    let seen: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      for (const u of Object.values(s.units)) if (u.owner === 'france') u.moves = 3;
      const favoured = isFavoured(s, 'england', 'france');
      seen = { ...seen, ...counting(() => runAi(s, fr)) };
      // War never comes in the turn the partner was still favoured.
      if (favoured) expect(fr.stance.england).not.toBe('war');
      if (cancelled === null && !isFavoured(s, 'england', 'france')) cancelled = s.turn;
      if (fr.stance.england === 'war') expect(s.turn - cancelled!).toBeGreaterThanOrEqual(WAR_AFTER_CANCEL);
      s.turn++;
    }
    expect(seen['diplomacy:war on a Favoured Nation']).toBeUndefined();
    expect(seen['diplomacy:favoured nation cancelled for war']).toBe(1);
    expect(fr.stance.england).toBe('war');
  });

  it('Combative keeps a Favoured Nation and attacks another nation when it can', () => {
    const { s, fr, quebec } = armed(['england', 'france', 'spain']);
    makeFavoured(s, 'england', 'france');
    // A defenceless Spanish colony near Québec.
    let spain: Colony | null = null;
    for (let r = 2; r <= 6 && !spain; r++) {
      for (let dy = -r; dy <= r && !spain; dy++) {
        for (let dx = -r; dx <= r && !spain; dx++) {
          const x = quebec.x + dx;
          const y = quebec.y + dy;
          if (!tileAt(s, x, y) || colonySiteProblem(s, x, y)) continue;
          spain = found(s, 'spain', x, y, 'Santa Fe');
        }
      }
    }
    expect(spain).not.toBeNull();
    for (let i = 0; i < 3; i++) {
      for (const u of Object.values(s.units)) if (u.owner === 'france') u.moves = 3;
      runAi(s, fr);
      s.turn++;
    }
    expect(fr.stance.spain).toBe('war');
    expect(fr.stance.england).not.toBe('war');
    expect(isFavoured(s, 'england', 'france')).toBe(true);
  });
});

describe('determinism', () => {
  it('the same seed gives the same game, with and without Favoured Nation proposals', () => {
    const line = [
      { nation: 'england' as NationId, level: 'competent' as AiLevel },
      { nation: 'france' as NationId, level: 'creative' as AiLevel },
      { nation: 'spain' as NationId, level: 'combative' as AiLevel },
    ];
    for (const off of [false, true]) {
      const a = playArenaGame(77, line, 90, 'small', undefined, false, undefined, off);
      const b = playArenaGame(77, line, 90, 'small', undefined, false, undefined, off);
      expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
      expect(b.entries).toEqual(a.entries);
    }
  }, 60_000);
});
