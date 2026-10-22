import { describe, expect, it } from 'vitest';
import {
  addToForce,
  applyCommand,
  colonySiteProblem,
  createGame,
  createUnit,
  declareIndependence,
  DEMAND,
  deserialize,
  foundColony,
  landForce,
  makeFavoured,
  makeTradeAgreement,
  processCrown,
  REF_ON_REFUSAL,
  royalForce,
  royalWar,
  royalWarTargets,
  serialize,
  tileAt,
  type Colony,
  type DifficultyId,
  type GameState,
  type NationId,
  type Player,
} from '../src/index.js';
import { payDemand, rebelPower, refPower } from '../src/ai/royal.js';
import { AI_PROFILES } from '../src/ai/profiles.js';

function game(opts: { difficulty?: DifficultyId; nations?: NationId[]; humans?: NationId[] } = {}): GameState {
  const nations = opts.nations ?? ['england', 'france'];
  const humans = opts.humans ?? ['england'];
  const ai = Object.fromEntries(nations.filter((n) => !humans.includes(n)).map((n) => [n, 'competent' as const]));
  return createGame({ seed: 5, mapSize: 'small', nations, humans, ai, ...(opts.difficulty ? { difficulty: opts.difficulty } : {}) });
}

const nation = (s: GameState, id: NationId): Player => s.players.find((p) => p.id === id)!;

/** Founds a colony for a nation on the first free site. */
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

/** Copies of a colony record, to give a nation many colonies cheaply (the Crown only counts them). */
function moreColonies(s: GameState, c: Colony, n: number): void {
  for (let i = 0; i < n; i++) s.colonies[`fake${i}`] = { ...c, id: `fake${i}`, goods: { ...c.goods } };
}

/** Plays the Crown's part of `rounds` rounds, with `bells` new liberty bells per round for england. */
function rounds(s: GameState, n: number, bells = 0, onRound?: (turn: number) => void): void {
  for (let i = 0; i < n; i++) {
    nation(s, 'england').bells += bells;
    onRound?.(s.turn);
    processCrown(s);
    s.turn++;
  }
}

describe('Royal Expeditionary Force', () => {
  it('starts with the fixed part of the old formula', () => {
    const s = game();
    expect(nation(s, 'england').ref).toEqual(royalForce(nation(s, 'england'), 0));
    expect(landForce(nation(s, 'england').ref)).toBe(7);
  });

  it('grows over time, and faster with more liberty bells', () => {
    const s = game();
    moreColonies(s, colony(s, 'england'), 9);
    const quiet = deserialize(serialize(s));
    const start = landForce(nation(s, 'england').ref);
    rounds(quiet, 100);
    rounds(s, 100, 60);
    const calm = landForce(nation(quiet, 'england').ref);
    const loud = landForce(nation(s, 'england').ref);
    expect(calm).toBeGreaterThan(start);
    expect(loud).toBeGreaterThan(calm + 10);
    // The King tells the player when he adds units.
    expect(s.messages.some((m) => m.to === 'england' && /The King adds .* to the Royal Expeditionary Force\. Royal forces: /.test(m.text))).toBe(true);
    // The mix follows the old formula: about two regulars and one dragoon to each half artillery.
    const ref = nation(s, 'england').ref;
    expect(ref.regulars).toBeGreaterThan(ref.dragoons);
    expect(ref.dragoons).toBeGreaterThan(ref.artillery);
    expect(ref.menOfWar).toBeGreaterThan(2);
  });

  it('grows faster on harder levels', () => {
    const grown = (difficulty: DifficultyId) => {
      const s = game({ difficulty });
      moreColonies(s, colony(s, 'england'), 9);
      rounds(s, 120, 40);
      return landForce(nation(s, 'england').ref);
    };
    expect(grown('viceroy')).toBeGreaterThan(grown('conquistador'));
    expect(grown('conquistador')).toBeGreaterThan(grown('discoverer'));
  });

  it('reaches about the old formula at a typical declaration', () => {
    // A typical nation: colonies grow to 15 by turn 150, and 6,000 bells are rung by turn 220,
    // more each turn as liberty spreads. The old formula sized the force at the declaration.
    const s = game();
    const first = colony(s, 'england');
    let bells = 0;
    rounds(s, 220, 0, (turn) => {
      const want = Math.min(15, Math.floor(turn / 10));
      for (let i = Object.values(s.colonies).filter((c) => c.owner === 'england').length; i < want; i++) moreColonies(s, first, i);
      const total = Math.round(6000 * (turn / 220) ** 2);
      nation(s, 'england').bells += total - bells;
      bells = total;
    });
    const p = nation(s, 'england');
    const old = landForce(royalForce(p, 15));
    const now = landForce(p.ref);
    expect(now / old).toBeGreaterThan(0.7);
    expect(now / old).toBeLessThan(1.3);
  });

  it('sends the accumulated force at the declaration', () => {
    const s = game();
    const c = colony(s, 'england');
    addToForce(nation(s, 'england'), 20);
    const force = { ...nation(s, 'england').ref };
    c.liberty = 10_000;
    const text = declareIndependence(s, 'england');
    expect(nation(s, 'england').ref).toEqual(force);
    expect(text).toContain(`${force.regulars} regulars`);
    expect(nation(s, 'england').refAtDeclaration?.force).toEqual(force);
    // The Crown builds up no more, and demands and declares nothing, once war with it has begun.
    rounds(s, 300, 100);
    expect(nation(s, 'england').ref).toEqual(force);
    expect(nation(s, 'england').pendingDemand).toBeUndefined();
  });
});

describe('royal demands', () => {
  /** Plays Crown rounds from turn DEMAND.from until the King demands gold from england. */
  function untilDemand(s: GameState): void {
    s.turn = Math.max(s.turn, DEMAND.from);
    for (let i = 0; i < 3000 && !nation(s, 'england').pendingDemand; i++) {
      nation(s, 'england').gold = 5000;
      processCrown(s);
      s.turn++;
    }
    expect(nation(s, 'england').pendingDemand).toBeDefined();
  }

  it('demands a share of the treasury, at a seeded rate, and paying costs the gold', () => {
    const s = game();
    colony(s, 'england');
    untilDemand(s);
    const p = nation(s, 'england');
    const demand = p.pendingDemand!;
    expect(demand.gold).toBeGreaterThanOrEqual(500 * 0.95);
    expect(demand.gold).toBeLessThanOrEqual(1500);
    expect(s.messages.some((m) => m.to === 'england' && m.text.includes(`demands ${demand.gold} gold`))).toBe(true);
    expect(applyCommand(s, { type: 'answerDemand', pay: true }).ok).toBe(true);
    expect(p.gold).toBe(5000 - demand.gold);
    expect(p.pendingDemand).toBeUndefined();
    expect(applyCommand(s, { type: 'answerDemand', pay: true }).ok).toBe(false);
  });

  it('seizes the goods of the richest colony and adds regulars when refused', () => {
    const s = game();
    const poor = colony(s, 'england', 'Poortown');
    poor.goods.furs = 10;
    const rich = colony(s, 'england', 'Richtown');
    rich.goods.furs = 90;
    rich.goods.tools = 40;
    rich.goods.food = 30;
    untilDemand(s);
    const p = nation(s, 'england');
    const regulars = p.ref.regulars;
    const r = applyCommand(s, { type: 'answerDemand', pay: false });
    expect(r.ok && r.text).toContain('Richtown');
    expect(rich.goods.furs).toBe(0);
    expect(rich.goods.tools).toBe(0);
    expect(rich.goods.food).toBe(30);
    expect(poor.goods.furs).toBe(10);
    expect(p.ref.regulars).toBe(regulars + REF_ON_REFUSAL);
    expect(p.gold).toBe(5000);
  });

  it('cannot be paid without the gold, and lapses into a refusal when left unanswered', () => {
    const s = game();
    colony(s, 'england');
    untilDemand(s);
    const p = nation(s, 'england');
    p.gold = 10;
    expect(applyCommand(s, { type: 'answerDemand', pay: true }).ok).toBe(false);
    const regulars = p.ref.regulars;
    rounds(s, 3);
    expect(p.pendingDemand === undefined || p.pendingDemand.turn >= s.turn - 2).toBe(true);
    expect(p.ref.regulars).toBeGreaterThanOrEqual(regulars + REF_ON_REFUSAL);
  });

  it('is decided sensibly by computer players', () => {
    const s = game();
    const c = colony(s, 'england');
    const p = nation(s, 'england');
    const prof = AI_PROFILES.competent;
    p.gold = 10_000;
    // Cheap: paid whatever refusing would cost.
    p.pendingDemand = { gold: 1000, colony: c.id, turn: s.turn };
    expect(payDemand(s, p, prof, false)).toBe(true);
    // Dear, with almost nothing to seize: refused.
    p.pendingDemand = { gold: 2500, colony: c.id, turn: s.turn };
    expect(payDemand(s, p, prof, false)).toBe(false);
    // Dear, but a warehouse full of goods would be seized: paid.
    c.goods.silver = 200;
    c.goods.furs = 200;
    expect(payDemand(s, p, prof, false)).toBe(true);
    // More than the treasury holds: refused. Naive pays whenever it can.
    p.pendingDemand = { gold: 20_000, colony: c.id, turn: s.turn };
    expect(payDemand(s, p, prof, false)).toBe(false);
    p.pendingDemand = { gold: 9000, colony: c.id, turn: s.turn };
    expect(payDemand(s, p, null, false)).toBe(true);
  });

  it('is answered by a computer player on its turn', () => {
    const s = createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'competent', france: 'naive' } });
    for (const id of ['england', 'france'] as NationId[]) {
      nation(s, id).gold = 5000;
      nation(s, id).pendingDemand = { gold: 300, colony: null, turn: s.turn };
    }
    applyCommand(s, { type: 'endTurn' });
    for (const id of ['england', 'france'] as NationId[]) {
      expect(nation(s, id).pendingDemand).toBeUndefined();
      expect(nation(s, id).gold).toBeLessThan(5000);
    }
  });
});

describe('royal wars', () => {
  it('are never declared on a Favoured Nation or for or on an independent nation, and prefer non-partners', () => {
    const s = game({ nations: ['england', 'france', 'spain', 'netherlands'], humans: ['england'] });
    for (const id of ['england', 'france', 'spain', 'netherlands'] as NationId[]) colony(s, id, `${id} town`);
    makeFavoured(s, 'england', 'france');
    makeTradeAgreement(s, 'england', 'spain');
    const targets = royalWarTargets(s, 'england');
    expect(targets.map((t) => t.nation).sort()).toEqual(['netherlands', 'spain']);
    expect(targets.find((t) => t.nation === 'spain')!.weight).toBeLessThan(targets.find((t) => t.nation === 'netherlands')!.weight);
    expect(() => royalWar(s, 'england', 'france')).toThrow();
    nation(s, 'netherlands').independence = 'declared';
    expect(royalWarTargets(s, 'england').map((t) => t.nation)).toEqual(['spain']);
    expect(royalWarTargets(s, 'netherlands')).toEqual([]);
    expect(() => royalWar(s, 'england', 'netherlands')).toThrow();
  });

  it('drag a nation into war now and then, never with its Favoured Nation, and peace can be made', () => {
    const s = game({ nations: ['england', 'france', 'spain'], humans: ['england', 'france', 'spain'] });
    for (const id of ['england', 'france', 'spain'] as NationId[]) colony(s, id, `${id} town`);
    makeFavoured(s, 'england', 'france');
    s.turn = 60;
    let wars = 0;
    for (let i = 0; i < 4000; i++) {
      processCrown(s);
      s.turn++;
      expect(nation(s, 'england').stance.france).not.toBe('war');
      for (const p of s.players) {
        for (const [other, stance] of Object.entries(p.stance)) {
          if (stance !== 'war') continue;
          wars++;
          // Peace is made as usual (people always agree).
          s.current = s.players.indexOf(p);
          expect(applyCommand(s, { type: 'proposePeace', nation: other as NationId }).ok).toBe(true);
        }
      }
    }
    expect(wars).toBeGreaterThan(0);
    expect(s.messages.some((m) => /^The King has declared war on (Spain|England|France)!/.test(m.text))).toBe(true);
  });

  it('are rarer on easier levels', () => {
    const count = (difficulty: DifficultyId) => {
      const s = game({ nations: ['england', 'france'], humans: ['england', 'france'], difficulty });
      for (const id of ['england', 'france'] as NationId[]) colony(s, id, `${id} town`);
      s.turn = 60;
      let n = 0;
      for (let i = 0; i < 6000; i++) {
        processCrown(s);
        s.turn++;
        if (nation(s, 'england').stance.france === 'war') {
          n++;
          s.current = 0;
          applyCommand(s, { type: 'proposePeace', nation: 'france' });
        }
      }
      return n;
    };
    expect(count('viceroy')).toBeGreaterThan(count('discoverer'));
  });
});

describe('computer players and independence', () => {
  /** A Competent England with one fortified colony, every colonist a rebel, and `soldiers` veterans in it. */
  function ready(soldiers: number): GameState {
    const s = createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'competent', france: 'naive' } });
    const c = colony(s, 'england');
    for (let i = 0; i < 3; i++) createUnit(s, 'england', 'freeColonist', { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
    c.buildings.stockade = 1;
    c.liberty = 100_000;
    for (let i = 0; i < soldiers; i++) {
      const u = createUnit(s, 'england', 'veteranSoldier', { kind: 'map', x: c.x, y: c.y });
      u.role = 'soldier';
      u.state = 'fortified';
    }
    s.turn = 250;
    return s;
  }

  it('declares only when the defence can plausibly beat the force the Crown has built up', () => {
    const weak = ready(2);
    expect(rebelPower(weak, nation(weak, 'england'))).toBeLessThan(refPower(nation(weak, 'england')) * AI_PROFILES.competent.independence!.ratio);
    applyCommand(weak, { type: 'endTurn' });
    expect(nation(weak, 'england').independence).toBe('none');
    const strong = ready(12);
    expect(rebelPower(strong, nation(strong, 'england'))).toBeGreaterThan(refPower(nation(strong, 'england')) * AI_PROFILES.competent.independence!.ratio);
    applyCommand(strong, { type: 'endTurn' });
    expect(nation(strong, 'england').independence).not.toBe('none');
  });
});

describe('determinism', () => {
  it('plays the same game twice with the Crown active', () => {
    const play = () => {
      const s = createGame({ seed: 21, mapSize: 'small', nations: ['england', 'france', 'spain'], humans: [], ai: { england: 'creative', france: 'combative', spain: 'naive' } });
      while (s.turn < 120 && !s.gameOver) applyCommand(s, { type: 'endTurn' });
      return s;
    };
    const a = play();
    const b = play();
    expect(serialize(a)).toBe(serialize(b));
    expect(landForce(nation(a, 'england').ref)).toBeGreaterThan(7);
  }, 60_000);
});

