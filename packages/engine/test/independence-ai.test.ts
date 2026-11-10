import { describe, expect, it } from 'vitest';
import {
  assignJob,
  colonyReport,
  colonySiteProblem,
  createGame,
  createUnit,
  distance,
  foundColony,
  isCoastal,
  tileAt,
  type Colony,
  type GameState,
  type Player,
} from '../src/index.js';
import { runAi } from '../src/ai/index.js';
import { creativeProfile, PLAN_FROM } from '../src/ai/creative.js';
import { adoptsPlan, ARM_BELOW, BOOST_MARGIN, CURB_MARGIN, planTurn } from '../src/ai/plan.js';
import { AI_PROFILES, type AiLevel } from '../src/ai/profiles.js';
import { colonyDefences, HOLD_ALONE, rebelPower, refPower, weakColonies } from '../src/ai/royal.js';

const england = (s: GameState): Player => s.players.find((p) => p.id === 'england')!;

/** England played by the computer at `level`, against a Naive France, on a small map. */
function game(level: AiLevel = 'competent'): GameState {
  return createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: level, france: 'naive' } });
}

/**
 * A colony for England on the first free coastal site at least 6 tiles from the colonies in `avoid`,
 * with `workers` colonists (every one a rebel unless `liberty` says otherwise) and a stockade.
 */
function colony(s: GameState, opts: { workers?: number; liberty?: number; avoid?: Colony[]; stockade?: number } = {}): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) continue;
      if ((opts.avoid ?? []).some((c) => distance(x, y, c.x, c.y) < 6)) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains') continue;
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      const c = foundColony(s, u.id);
      for (let i = 1; i < (opts.workers ?? 4); i++) {
        const w = createUnit(s, 'england', 'freeColonist', { kind: 'map', x, y });
        assignJob(s, w.id, c.id);
      }
      c.liberty = opts.liberty ?? 100_000;
      c.buildings.stockade = opts.stockade ?? 1;
      return c;
    }
  }
  throw new Error('no site');
}

function veterans(s: GameState, c: Colony, n: number): void {
  for (let i = 0; i < n; i++) {
    const u = createUnit(s, 'england', 'veteranSoldier', { kind: 'map', x: c.x, y: c.y });
    u.role = 'soldier';
    u.state = 'fortified';
  }
}

describe('the independence plan', () => {
  it('is adopted from mid-game, remembered, and by Combative only once its army is strong', () => {
    const s = game();
    const p = england(s);
    const competent = AI_PROFILES.competent;
    const adopt = competent.independence!.adopt!;
    s.turn = 100;
    expect(adoptsPlan(s, p, competent, adopt.share - 1)).toBe(false);
    expect(adoptsPlan(s, p, competent, adopt.share)).toBe(true);
    expect(p.aiMemory?.independencePlan).toBe(100);
    // Once adopted it stays, whatever the share does.
    expect(adoptsPlan(s, p, competent, 0)).toBe(true);
    // From its turn on, whatever the share.
    const later = game();
    later.turn = adopt.turn;
    expect(adoptsPlan(later, england(later), competent, 0)).toBe(true);

    // Combative: the share is not enough without an army.
    const combative = AI_PROFILES.combative;
    const weak = game('combative');
    colony(weak);
    weak.turn = 250;
    expect(adoptsPlan(weak, england(weak), combative, 60)).toBe(false);
    const strong = game('combative');
    veterans(strong, colony(strong), 12);
    strong.turn = 250;
    expect(adoptsPlan(strong, england(strong), combative, 60)).toBe(true);
  });

  it('is Creative’s focus from its rebel share or its turn', () => {
    const s = game('creative');
    const p = england(s);
    s.turn = 120;
    creativeProfile(s, p, AI_PROFILES.creative);
    expect(p.aiMemory?.focus).not.toBe('independence');
    s.turn = PLAN_FROM.turn;
    p.aiMemory!.reviewed = -100;
    const prof = creativeProfile(s, p, AI_PROFILES.creative);
    expect(p.aiMemory?.focus).toBe('independence');
    expect(prof.independence?.adopt).toEqual(PLAN_FROM);
  });

  it('arms only when the defence is short and the rebels are close to a majority, and rings more bells until they are a safe one', () => {
    const s = game();
    const p = england(s);
    const prof = AI_PROFILES.competent;
    const min = prof.independence!.minShare;
    s.turn = 300;
    const short = () => true;
    expect(planTurn(s, p, prof, min - ARM_BELOW - 1, short).arming).toBe(false);
    const close = planTurn(s, p, prof, min - ARM_BELOW, short);
    expect(close).toMatchObject({ adopted: true, arming: true, boost: true, curb: false });
    expect(planTurn(s, p, prof, min - ARM_BELOW, () => false).arming).toBe(false);
    expect(planTurn(s, p, prof, min + BOOST_MARGIN, short).boost).toBe(false);
    // Only once the rebels are a safe majority, and only while arming, are the bells curbed.
    expect(planTurn(s, p, prof, min + CURB_MARGIN, short).curb).toBe(true);
    expect(planTurn(s, p, prof, min + CURB_MARGIN, () => false).curb).toBe(false);
  });

  it('counts muskets in store as militia, and horses only where dragoons can use them', () => {
    const s = game();
    const p = england(s);
    const c = colony(s);
    veterans(s, c, 1);
    const power = () => colonyDefences(s, p)[0].power;
    const base = power();
    c.goods.horses = 100;
    expect(power()).toBe(base);
    c.goods.muskets = 100;
    const armed = power();
    expect(armed).toBeGreaterThan(base);
    for (const u of Object.values(s.units)) if (u.role === 'soldier') u.role = 'dragoon';
    expect(power()).toBeGreaterThan(armed);
  });

  it('mounts its soldiers on the horses in store while arming', () => {
    const s = game();
    const p = england(s);
    const c = colony(s);
    const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: c.x, y: c.y });
    u.role = 'soldier';
    u.state = 'fortified';
    c.goods.horses = 100;
    s.turn = 250;
    runAi(s, p);
    expect(s.units[u.id].role).toBe('dragoon');
    expect(c.goods.horses).toBe(50);
  });
});

describe('the declaration', () => {
  it('waits while its own defence could not hold until the intervention comes', () => {
    const ratio = AI_PROFILES.competent.independence!.ratio;
    // A garrison that beats the ratio only with the help it expects, not on its own.
    const setup = (n: number) => {
      const s = game();
      veterans(s, colony(s), n);
      s.turn = 250;
      england(s).gold = 0;
      return s;
    };
    let n = 1;
    for (; n < 40; n++) {
      const s = setup(n);
      if (rebelPower(s, england(s)) >= refPower(england(s)) * Math.max(HOLD_ALONE, ratio)) break;
    }
    const short = setup(n - 1);
    expect(rebelPower(short, england(short))).toBeLessThan(refPower(england(short)) * Math.max(HOLD_ALONE, ratio));
    runAi(short, england(short));
    expect(england(short).independence).toBe('none');
    const ready = setup(n);
    runAi(ready, england(ready));
    expect(england(ready).independence).toBe('declared');
  });

  it('waits while a third of its colonies would fall at once, however strong the rest', () => {
    const play = (spread: boolean) => {
      const s = game();
      const a = colony(s);
      const b = colony(s, { avoid: [a] });
      const c = colony(s, { avoid: [a, b] });
      if (spread) for (const x of [a, b, c]) veterans(s, x, 3);
      else veterans(s, a, 9);
      s.turn = 250;
      england(s).gold = 0;
      return s;
    };
    const lopsided = play(false);
    const p = england(lopsided);
    expect(rebelPower(lopsided, p)).toBeGreaterThan(refPower(p) * AI_PROFILES.competent.independence!.ratio);
    expect(weakColonies(lopsided, p).length).toBe(2);
    runAi(lopsided, p);
    expect(p.independence).toBe('none');
    const spread = play(true);
    runAi(spread, england(spread));
    expect(england(spread).independence).toBe('declared');
  });

  it('gives up a tiny outpost that could not hold before declaring', () => {
    const s = game();
    const a = colony(s);
    const b = colony(s, { avoid: [a] });
    const c = colony(s, { avoid: [a, b] });
    const outpost = colony(s, { avoid: [a, b, c], workers: 2, stockade: 0 });
    for (const x of [a, b, c]) veterans(s, x, 3);
    s.turn = 250;
    england(s).gold = 0;
    runAi(s, england(s));
    expect(s.colonies[outpost.id]).toBeUndefined();
    expect(england(s).independence).toBe('declared');
    expect(england(s).coloniesAtDeclaration).toBe(3);
  });
});

describe('buildings', () => {
  it('puts the docks first, and under an independence plan a stockade first', () => {
    const peace = game();
    const c = colony(peace, { liberty: 0, stockade: 0 });
    peace.turn = 60;
    runAi(peace, england(peace));
    expect(c.build).toEqual({ kind: 'building', id: 'docks' });

    const planning = game();
    const d = colony(planning, { stockade: 0 });
    planning.turn = 250;
    runAi(planning, england(planning));
    expect(england(planning).aiMemory?.independencePlan).toBe(250);
    expect(d.build).toEqual({ kind: 'building', id: 'stockade' });
  });

  it('puts a colonist to work as a carpenter on a building in a colony of four', () => {
    const s = game();
    const c = colony(s, { liberty: 0, stockade: 0, workers: 6 });
    c.goods.lumber = 100;
    s.turn = 60;
    // No gold for a colony charter: nobody leaves to found one.
    england(s).gold = 0;
    for (let i = 0; i < 3; i++) runAi(s, england(s));
    expect(c.build?.kind).toBe('building');
    expect(colonyReport(s, c).produced.hammers).toBeGreaterThan(0);
  });
});
