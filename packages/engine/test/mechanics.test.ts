/**
 * The scenario's mechanics switches (docs/design/scenario-framework.md, step 5). For each switch a
 * test-only scenario turns it off, and the test checks the mechanic is gone for people (commands
 * refused, nothing happens) and for computer players (their profile drops the plan, and a whole
 * computer game with everything off never uses any of it, in mechanics-game.test.ts, a file of its
 * own so it runs in parallel with these). The Americas have everything on; golden.test.ts checks
 * they play as before.
 */
import { describe, expect, it } from 'vitest';
import {
  AMERICAS,
  applyCommand,
  canBuild,
  canDeclareIndependence,
  charterCost,
  colonySiteProblem,
  createGame,
  createUnit,
  DEMAND,
  describeMove,
  gridOf,
  favouredProblem,
  foundColony,
  isWater,
  makeTradeAgreement,
  mechanicsOf,
  player,
  processCrown,
  runCustomHouse,
  sellToMarket,
  settlementAt,
  tileAt,
  type Colony,
  type GameState,
  type NationId,
} from '../src/index.js';
import { inScenario } from '../src/ai/index.js';
import { creativeProfile } from '../src/ai/creative.js';
import { buildingTies } from '../src/ai/logistics.js';
import { AI_PROFILES } from '../src/ai/profiles.js';
import './mechanics-variants.js';

// The test-only scenarios (test-no-taxes … test-all-off) are registered by mechanics-variants.ts.

function game(scenario?: string, opts: { nations?: NationId[]; humans?: NationId[]; charter?: boolean } = {}): GameState {
  const nations = opts.nations ?? ['england', 'france'];
  const humans = opts.humans ?? ['england'];
  const ai = Object.fromEntries(nations.filter((n) => !humans.includes(n)).map((n) => [n, 'competent' as const]));
  return createGame({
    seed: 5, mapSize: 'small', nations, humans, ai,
    ...(opts.charter ? { colonyCharter: true } : {}),
    ...(scenario ? { scenario } : {}),
  });
}

/** Founds a colony for a nation on the first free site (inland unless `coastal`). */
function colony(s: GameState, owner: NationId, name = 'Testtown'): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y)) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains') continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      return foundColony(s, u.id, name);
    }
  }
  throw new Error('no site');
}

describe('the Americas have every mechanic on', () => {
  it('lists them all', () => {
    const m = mechanicsOf(game());
    expect(m).toBe(AMERICAS.mechanics);
    for (const [key, on] of Object.entries(m)) expect(on, key).toBeTruthy();
    expect(m.charter).toEqual({ base: 100, cap: 2000 });
  });

  it('computer players keep their profiles as they are', () => {
    const s = game();
    for (const prof of Object.values(AI_PROFILES)) expect(inScenario(s, prof)).toBe(prof);
  });
});

describe('the Crown', () => {
  /** Sells furs in england's home port until the tax moves or a raise waits, at most `n` times. */
  function sellUntilRaise(s: GameState, nation: NationId = 'england', n = 400): number {
    const p = player(s, nation);
    let draws = 0;
    for (let i = 0; i < n && p.tax === 0 && !p.pendingTax; i++) {
      const rng = s.rng;
      sellToMarket(s, p, 'furs', 100);
      if (s.rng !== rng) draws++;
    }
    return draws;
  }

  it('taxes off: sales never raise the tax and draw no random number', () => {
    const s = game('test-no-taxes');
    expect(sellUntilRaise(s)).toBe(0);
    expect(player(s, 'england').tax).toBe(0);
    expect(player(s, 'england').pendingTax).toBeNull();
    const t = game();
    expect(sellUntilRaise(t)).toBeGreaterThan(0);
    expect(player(t, 'england').pendingTax).not.toBeNull();
  });

  it('boycotts off: a raise simply applies, for people and computers, and cannot be refused', () => {
    for (const nation of ['england', 'france'] as NationId[]) {
      const s = game('test-no-boycotts');
      sellUntilRaise(s, nation);
      expect(player(s, nation).pendingTax).toBeNull();
      expect(player(s, nation).tax).toBeGreaterThan(0);
      const t = game();
      sellUntilRaise(t, nation);
      expect(player(t, nation).pendingTax).not.toBeNull();
    }
    const s = game('test-no-boycotts');
    player(s, 'england').pendingTax = { rate: 5, good: 'furs' };
    expect(applyCommand(s, { type: 'answerTax', accept: false }).ok).toBe(false);
    expect(player(s, 'england').boycotts.furs).toBeUndefined();
    expect(applyCommand(s, { type: 'answerTax', accept: true }).ok).toBe(true);
    expect(player(s, 'england').tax).toBe(5);
  });

  /** Plays Crown rounds; returns the turns on which england was asked for gold. */
  function demandsOver(s: GameState, n: number): number {
    colony(s, 'england');
    s.turn = DEMAND.from;
    let demands = 0;
    for (let i = 0; i < n; i++) {
      const p = player(s, 'england');
      p.gold = 5000;
      processCrown(s);
      if (p.pendingDemand) {
        demands++;
        delete p.pendingDemand;
      }
      s.turn++;
    }
    return demands;
  }

  it('demands off: the King never asks for gold', () => {
    expect(demandsOver(game(), 1500)).toBeGreaterThan(0);
    expect(demandsOver(game('test-no-demands'), 1500)).toBe(0);
  });

  it('royal wars off: the King never declares war for the nation', () => {
    const wars = (scenario?: string) => {
      const nations: NationId[] = ['england', 'france', 'spain'];
      const s = game(scenario, { nations, humans: nations });
      for (const id of nations) colony(s, id, `${id} town`);
      s.turn = 60;
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        processCrown(s);
        s.turn++;
        for (const p of s.players) {
          for (const [other, stance] of Object.entries(p.stance)) {
            if (stance !== 'war') continue;
            n++;
            p.stance[other] = 'peace';
            player(s, other as NationId).stance[p.id] = 'peace';
          }
        }
      }
      return n;
    };
    expect(wars()).toBeGreaterThan(0);
    expect(wars('test-no-royal-wars')).toBe(0);
  });

  it('REF off: the force does not grow, and a refused demand adds no regulars', () => {
    const grow = (scenario?: string) => {
      const s = game(scenario);
      colony(s, 'england');
      const p = player(s, 'england');
      const before = { ...p.ref };
      for (let i = 0; i < 300; i++) {
        p.bells += 50;
        processCrown(s);
        delete p.pendingDemand;
        s.turn++;
      }
      return { s, p, grew: JSON.stringify(p.ref) !== JSON.stringify(before) };
    };
    expect(grow().grew).toBe(true);
    const { s, p, grew } = grow('test-no-ref');
    expect(grew).toBe(false);
    p.gold = 5000;
    p.pendingDemand = { gold: 500, colony: null, turn: s.turn };
    const regulars = p.ref.regulars;
    const r = applyCommand(s, { type: 'answerDemand', pay: false });
    expect(r.ok).toBe(true);
    expect(r.ok && r.text).not.toContain('Royal Expeditionary Force');
    expect(p.ref.regulars).toBe(regulars);
  });
});

describe('independence', () => {
  it('off: no declaration, whatever the rebels, and no computer player plans one', () => {
    const s = game('test-no-independence');
    colony(s, 'england');
    expect(canDeclareIndependence(s, 'england')).toMatch(/no declaring independence/);
    expect(applyCommand(s, { type: 'declareIndependence' }).ok).toBe(false);
    expect(player(s, 'england').independence).toBe('none');
    for (const prof of Object.values(AI_PROFILES)) expect(inScenario(s, prof).independence).toBeNull();
    // Creative takes up an independence plan from turn 160 in the Americas; not here.
    const creative = (t: GameState) => {
      t.turn = 200;
      const p = player(t, 'france');
      p.ai = 'creative';
      return creativeProfile(t, p, inScenario(t, AI_PROFILES.creative));
    };
    expect(creative(game()).independence).not.toBeNull();
    expect(creative(s).independence).toBeNull();
    expect(player(s, 'france').aiMemory?.focus).not.toBe('independence');
  });
});

describe('Favoured Nation', () => {
  it('off: no proposals between people, and computer players do not build ties for it', () => {
    const humans: NationId[] = ['england', 'france'];
    const t = game(undefined, { humans });
    makeTradeAgreement(t, 'england', 'france');
    expect(favouredProblem(t, 'england', 'france')).toBeNull();
    const s = game('test-no-favoured', { humans });
    makeTradeAgreement(s, 'england', 'france');
    expect(favouredProblem(s, 'england', 'france')).toMatch(/no Favoured Nation/);
    expect(applyCommand(s, { type: 'proposeFavoured', nation: 'france' }).ok).toBe(false);
    expect(s.relations[Object.keys(s.relations)[0]].favoured).toBeFalsy();
    expect(buildingTies(t, player(t, 'england'), 'france')).toBe(true);
    expect(buildingTies(s, player(s, 'england'), 'france')).toBe(false);
  });
});

describe('the colony charter', () => {
  it('off: founding is free even when the game uses the charter', () => {
    const t = game(undefined, { charter: true });
    colony(t, 'england');
    expect(charterCost(t, 'england')).toBe(100);
    const s = game('test-no-charter', { charter: true });
    colony(s, 'england');
    expect(charterCost(s, 'england')).toBe(0);
  });
});

describe('the custom house', () => {
  function withHouse(scenario?: string): { s: GameState; c: Colony } {
    const s = game(scenario);
    const c = colony(s, 'england');
    for (let i = 0; i < 3; i++) createUnit(s, 'england', 'freeColonist', { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
    player(s, 'england').fathers.push('peterStuyvesant');
    return { s, c };
  }

  it('off: it cannot be built, even with Stuyvesant, and sells nothing', () => {
    const on = withHouse();
    expect(canBuild(on.s, on.c, { kind: 'building', id: 'customHouse' })).toBe(true);
    const off = withHouse('test-no-custom-house');
    expect(canBuild(off.s, off.c, { kind: 'building', id: 'customHouse' })).toBe(false);
    expect(applyCommand(off.s, { type: 'setBuild', colonyId: off.c.id, target: { kind: 'building', id: 'customHouse' } }).ok).toBe(false);
    for (const { c } of [on, off]) {
      c.buildings.customHouse = 1;
      c.exports.furs = true;
      c.goods.furs = 200;
    }
    runCustomHouse(on.s, on.c.id);
    runCustomHouse(off.s, off.c.id);
    expect(on.c.goods.furs).toBe(50);
    expect(off.c.goods.furs).toBe(200);
  });
});

describe('missions', () => {
  it('off: a missionary can neither found nor denounce one, and computer players send none', () => {
    const actions = (scenario?: string) => {
      const s = game(scenario);
      const st = Object.values(s.settlements)[0];
      for (const d of gridOf(s).directions) {
        const x = st.x - d.dx;
        const y = st.y - d.dy;
        const t = tileAt(s, x, y);
        if (!t || isWater(t) || settlementAt(s, x, y)) continue;
        const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        u.role = 'missionary';
        u.moves = 3;
        const move = describeMove(s, u.id, d.id);
        const result = applyCommand(s, { type: 'mission', unitId: u.id, settlementId: st.id });
        return { move, ok: result.ok, s };
      }
      throw new Error('no land next to the settlement');
    };
    const on = actions();
    expect(on.move.kind === 'settlement' && on.move.actions).toContain('mission');
    expect(on.ok).toBe(true);
    const off = actions('test-no-missions');
    expect(off.move.kind === 'settlement' && off.move.actions).not.toContain('mission');
    expect(off.ok).toBe(false);
    expect(Object.values(off.s.settlements).some((st) => st.mission)).toBe(false);
    for (const prof of Object.values(AI_PROFILES)) expect(inScenario(off.s, prof).missions).toBe(false);
  });
});
