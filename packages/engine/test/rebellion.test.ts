import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  colonySiteProblem,
  createGame,
  createUnit,
  declareIndependence,
  deserialize,
  foundColony,
  historyFor,
  INTERVENTION,
  interventionForce,
  isCoastal,
  isWater,
  libertyBonus,
  makeFavoured,
  makeTradeAgreement,
  mercenaryCompany,
  processIndependence,
  processRebellion,
  runAllies,
  serialize,
  tileAt,
  tileDefence,
  neighbours,
  TORY_LANDING,
  SQUARE,
  type Colony,
  type GameState,
  type NationId,
  type Player,
  removeUnit,
} from '../src/index.js';
import { canBeatRef, expectedSupport, hireMercenaries, rebelPower, refPower } from '../src/ai/royal.js';
import { AI_PROFILES } from '../src/ai/profiles.js';

const nation = (s: GameState, id: NationId): Player => s.players.find((p) => p.id === id)!;

function game(humans: NationId[] = ['england']): GameState {
  const nations: NationId[] = ['england', 'france'];
  const ai = Object.fromEntries(nations.filter((n) => !humans.includes(n)).map((n) => [n, 'competent' as const]));
  return createGame({ seed: 5, mapSize: 'small', nations, humans, ai });
}

/** Founds a colony for a nation on the first free coastal site (away from `avoid`), with `workers` colonists in it. */
function colony(s: GameState, owner: NationId, opts: { workers?: number; liberty?: number; name?: string; avoid?: Colony } = {}): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y)) continue;
      if (opts.avoid && SQUARE.distance(x, y, opts.avoid.x, opts.avoid.y) < 6) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains') continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      const c = foundColony(s, u.id, opts.name ?? 'Testtown');
      for (let i = 1; i < (opts.workers ?? 3); i++) createUnit(s, owner, 'freeColonist', { kind: 'colony', colonyId: c.id, job: { kind: 'building', building: 'carpenter' } });
      c.liberty = opts.liberty ?? 100_000;
      return c;
    }
  }
  throw new Error('no site');
}

function soldiers(s: GameState, owner: NationId, c: Colony, n: number, type: 'veteranSoldier' | 'freeColonist' = 'veteranSoldier'): void {
  for (let i = 0; i < n; i++) {
    const u = createUnit(s, owner, type, { kind: 'map', x: c.x, y: c.y });
    u.role = 'soldier';
    u.state = 'fortified';
  }
}

/** A human England with one fortified rebel colony and `gold` in the treasury, that has just declared. */
function declared(gold = 20_000, prepare?: (s: GameState) => void): GameState {
  const s = game();
  const c = colony(s, 'england');
  c.buildings.stockade = 1;
  soldiers(s, 'england', c, 3);
  nation(s, 'england').gold = gold;
  prepare?.(s);
  declareIndependence(s, 'england');
  return s;
}

const mercs = (s: GameState) => Object.values(s.units).filter((u) => u.owner === 'england' && u.mercenary);
const allies = (s: GameState) => Object.values(s.units).filter((u) => u.owner === 'england' && u.ally);

describe('mercenaries', () => {
  it('offer a company at the declaration, sized to the treasury and priced by difficulty', () => {
    const s = declared();
    const offer = nation(s, 'england').mercenaryOffer!;
    expect(offer).toBeDefined();
    expect(offer.soldiers).toBeGreaterThanOrEqual(2);
    expect(offer.soldiers).toBeLessThanOrEqual(4);
    expect(offer.dragoons).toBeGreaterThanOrEqual(1);
    expect(offer.price).toBe(offer.soldiers * 1200 + offer.dragoons * 1600 + offer.artillery * 900);
    expect(nation(s, 'england').rebellion?.offers).toBe(1);

    // The same company, dearer on harder levels.
    const at = (difficulty: Player['difficulty']) => {
      const copy = deserialize(serialize(s));
      nation(copy, 'england').difficulty = difficulty;
      return mercenaryCompany(copy, 'england', offer.turn)!;
    };
    expect(at('discoverer').soldiers).toBe(offer.soldiers);
    expect(at('discoverer').price).toBeLessThan(offer.price);
    expect(at('viceroy').price).toBeGreaterThan(offer.price);

    // A poorer treasury gets a smaller company, an empty one none.
    nation(s, 'england').gold = 1300;
    expect(mercenaryCompany(s, 'england')).toMatchObject({ soldiers: 1, dragoons: 0, artillery: 0, price: 1200 });
    nation(s, 'england').gold = 500;
    expect(mercenaryCompany(s, 'england')).toBeNull();
  });

  it('are hired or turned away by a person, and an unanswered offer lapses', () => {
    const s = declared();
    const offer = nation(s, 'england').mercenaryOffer!;
    const size = offer.soldiers + offer.dragoons + offer.artillery;

    const hired = deserialize(serialize(s));
    expect(applyCommand(hired, { type: 'answerMercenaries', hire: true }).ok).toBe(true);
    expect(mercs(hired)).toHaveLength(size);
    expect(nation(hired, 'england').gold).toBe(20_000 - offer.price);
    expect(nation(hired, 'england').mercenaryOffer).toBeUndefined();
    expect(historyFor(hired, 'france').some((e) => e.text.includes('hires'))).toBe(true);

    const refused = deserialize(serialize(s));
    expect(applyCommand(refused, { type: 'answerMercenaries', hire: false }).ok).toBe(true);
    expect(mercs(refused)).toHaveLength(0);
    expect(historyFor(refused, 'england').some((e) => e.text.includes('turns away'))).toBe(true);

    const poor = deserialize(serialize(s));
    nation(poor, 'england').gold = offer.price - 1;
    expect(applyCommand(poor, { type: 'answerMercenaries', hire: true }).ok).toBe(false);
    poor.turn += 2;
    processRebellion(poor, nation(poor, 'england'));
    expect(nation(poor, 'england').mercenaryOffer).toBeUndefined();
    expect(applyCommand(poor, { type: 'answerMercenaries', hire: false }).ok).toBe(false);
  });

  it('are hired by computer players when they help and can be paid, never by Naive', () => {
    const s = declared();
    const p = nation(s, 'england');
    const naive = deserialize(serialize(s));
    hireMercenaries(naive, nation(naive, 'england'), null, 1.2);
    expect(mercs(naive)).toHaveLength(0);

    // At the declaration: the decision to declare counted on them.
    const now = deserialize(serialize(s));
    hireMercenaries(now, nation(now, 'england'), AI_PROFILES.competent, 1.25);
    expect(mercs(now).length).toBeGreaterThan(0);

    // Later in the war: only when the defence is short of the royal troops.
    p.mercenaryOffer = { ...p.mercenaryOffer!, turn: s.turn + 10 };
    const strong = deserialize(serialize(s));
    const c = Object.values(strong.colonies)[0];
    soldiers(strong, 'england', c, 60);
    hireMercenaries(strong, nation(strong, 'england'), AI_PROFILES.competent, 1.25);
    expect(mercs(strong)).toHaveLength(0);
    expect(nation(strong, 'england').mercenaryOffer).toBeUndefined();
    const weak = deserialize(serialize(s));
    hireMercenaries(weak, nation(weak, 'england'), AI_PROFILES.competent, 1.25);
    expect(mercs(weak).length).toBeGreaterThan(0);
  });
});

describe('foreign intervention', () => {
  /** Rounds of the war: `bells` new liberty bells each. */
  function rounds(s: GameState, n: number, bells: number): void {
    for (let i = 0; i < n; i++) {
      s.turn++;
      nation(s, 'england').bells += bells;
      processRebellion(s, nation(s, 'england'));
    }
  }

  it('comes only once the war has lasted, the bells are rung and the colonies hold', () => {
    const s = declared();
    delete nation(s, 'england').mercenaryOffer;
    const need = INTERVENTION.bells;

    const early = deserialize(serialize(s));
    rounds(early, INTERVENTION.minTurns - 1, need);
    expect(allies(early)).toHaveLength(0);

    const quiet = deserialize(serialize(s));
    rounds(quiet, INTERVENTION.minTurns + 5, Math.floor(need / (INTERVENTION.minTurns + 6)));
    expect(allies(quiet)).toHaveLength(0);

    const losing = deserialize(serialize(s));
    nation(losing, 'england').coloniesAtDeclaration = 3;
    rounds(losing, INTERVENTION.minTurns, need);
    expect(allies(losing)).toHaveLength(0);

    rounds(s, INTERVENTION.minTurns, need / INTERVENTION.minTurns);
    const force = interventionForce(nation(s, 'england'));
    expect(allies(s)).toHaveLength(force.soldiers + force.dragoons + force.artillery + force.menOfWar);
    expect(nation(s, 'england').rebellion?.intervention?.turn).toBe(s.turn);
    expect(s.messages.some((m) => m.text.includes('intervenes in the War of Independence') && !m.to)).toBe(true);
    expect(historyFor(s, 'france').some((e) => e.kind === 'independence' && e.text.includes('intervenes'))).toBe(true);
    // Only once.
    rounds(s, 10, need);
    expect(allies(s)).toHaveLength(force.soldiers + force.dragoons + force.artillery + force.menOfWar);
  });

  it("is sent by the rebels' Favoured Nation, else by a power not in the game", () => {
    const friend = declared(20_000, (s) => {
      colony(s, 'france', { avoid: Object.values(s.colonies)[0], name: 'Port Royal' });
      makeTradeAgreement(s, 'england', 'france');
      makeFavoured(s, 'england', 'france');
    });
    expect(nation(friend, 'england').rebellion?.friends).toEqual(['france']);
    friend.turn += INTERVENTION.minTurns;
    nation(friend, 'england').bells += INTERVENTION.bells;
    processRebellion(friend, nation(friend, 'england'));
    expect(nation(friend, 'england').rebellion?.intervention?.by).toBe('france');

    const alone = declared();
    alone.turn += INTERVENTION.minTurns;
    nation(alone, 'england').bells += INTERVENTION.bells;
    processRebellion(alone, nation(alone, 'england'));
    const by = nation(alone, 'england').rebellion?.intervention?.by;
    expect(by).toBeDefined();
    expect(['england', 'france', 'crown']).not.toContain(by);
  });

  it('fights the Crown on its own, takes no orders, and goes home when the war ends', () => {
    const s = declared();
    const p = nation(s, 'england');
    delete p.mercenaryOffer;
    s.turn += INTERVENTION.minTurns;
    p.bells += INTERVENTION.bells;
    processRebellion(s, p);
    const soldier = allies(s).find((u) => u.role === 'soldier')!;
    expect(applyCommand(s, { type: 'fortify', unitId: soldier.id }).ok).toBe(false);

    // A royal artillery in the open next to the colony is attacked.
    const c = Object.values(s.colonies)[0];
    const open = neighbours(s, c.x, c.y)
      .filter((q) => !isWater(tileAt(s, q.x, q.y)) && tileDefence(tileAt(s, q.x, q.y)!) === 0)
      .find((q) => !Object.values(s.units).some((u) => u.loc.kind === 'map' && u.loc.x === q.x && u.loc.y === q.y));
    expect(open).toBeDefined();
    if (open) {
      const gun = createUnit(s, 'crown', 'artillery', { kind: 'map', ...open });
      gun.against = 'england';
      for (const u of allies(s)) u.moves = 3;
      runAllies(s, p);
      expect(!s.units[gun.id] || allies(s).some((u) => u.moves === 0)).toBe(true);
    }

    // The war is won: the force sails home.
    p.ref = { regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 };
    for (const u of Object.values(s.units)) if (u.owner === 'crown') removeUnit(s, u.id);
    processIndependence(s);
    expect(p.independence).toBe('won');
    expect(allies(s)).toHaveLength(0);
  });
});

describe('Tories after the declaration', () => {
  /** England with a large rebel colony and a small Tory colony (no rebels), declared. */
  function torySetup(toryGuards: number): { s: GameState; rebel: Colony; tory: Colony } {
    const s = game();
    const rebel = colony(s, 'england', { workers: 8 });
    rebel.buildings.stockade = 1;
    soldiers(s, 'england', rebel, 3);
    const tory = colony(s, 'england', { workers: 2, liberty: 0, name: 'Loyalton', avoid: rebel });
    // Militia, not veterans: veterans become Continentals at the declaration, and they never desert.
    soldiers(s, 'england', tory, toryGuards, 'freeColonist');
    declareIndependence(s, 'england');
    delete nation(s, 'england').mercenaryOffer;
    return { s, rebel, tory };
  }

  it('cost a Tory colony one unit of production per worker', () => {
    const s = game();
    const rebel = colony(s, 'england', { workers: 8 });
    const tory = colony(s, 'england', { workers: 2, liberty: 0, name: 'Loyalton', avoid: rebel });
    const before = libertyBonus(s, tory);
    const rebelBefore = libertyBonus(s, rebel);
    declareIndependence(s, 'england');
    expect(libertyBonus(s, tory)).toBe(before - 1);
    expect(libertyBonus(s, rebel)).toBe(rebelBefore);
  });

  it('make soldiers desert, and a colony with no rebels may declare for the King', () => {
    const { s, tory } = torySetup(1);
    const guard = Object.values(s.units).find((u) => u.loc.kind === 'map' && u.loc.x === tory.x && u.loc.y === tory.y && u.role === 'soldier')!;
    let deserted = -1;
    for (let i = 0; i < 80 && deserted < 0; i++) {
      s.turn++;
      processRebellion(s, nation(s, 'england'));
      if (!s.units[guard.id]) deserted = s.turn;
    }
    expect(deserted).toBeGreaterThan(0);
    expect(s.messages.some((m) => m.text.includes('deserts to the Crown'))).toBe(true);

    // With nobody left at its gates, the Tory colony may go over to the Crown.
    let defected = -1;
    for (let i = 0; i < 120 && defected < 0; i++) {
      s.turn++;
      processRebellion(s, nation(s, 'england'));
      if (tory.owner === 'crown') defected = s.turn;
    }
    expect(defected).toBeGreaterThan(0);
    expect(tory.takenFrom).toBe('england');
    expect(historyFor(s, 'france').some((e) => e.text.includes('declare for the King'))).toBe(true);
  });

  it('draw royal landings, with more troops ashore', () => {
    const { s, tory } = torySetup(1);
    nation(s, 'england').ref = { regulars: 20, dragoons: 10, artillery: 5, menOfWar: 2 };
    processIndependence(s);
    const near = Object.values(s.units).filter((u) => u.owner === 'crown' && !u.type.startsWith('man') && u.loc.kind === 'map' && SQUARE.distance(u.loc.x, u.loc.y, tory.x, tory.y) <= 2);
    expect(near).toHaveLength(TORY_LANDING);
  });

  it('play out the same twice', () => {
    const run = () => {
      const { s } = torySetup(2);
      for (let i = 0; i < 60; i++) {
        s.turn++;
        processRebellion(s, nation(s, 'england'));
      }
      return serialize(s);
    };
    expect(run()).toBe(run());
  });
});

describe('computer players and the War of Independence', () => {
  /** A Creative England with a fortified rebel colony, `n` veterans in it and `gold`. */
  function ready(n: number, gold: number): GameState {
    const s = createGame({ seed: 5, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'creative', france: 'naive' } });
    const c = colony(s, 'england', { workers: 4 });
    c.buildings.stockade = 1;
    soldiers(s, 'england', c, n);
    nation(s, 'england').gold = gold;
    s.turn = 250;
    return s;
  }

  it('counts mercenaries and the intervention in the decision', () => {
    const s = ready(4, 20_000);
    const p = nation(s, 'england');
    const merc = expectedSupport(s, p);
    expect(merc).toBeGreaterThan(0);
    const saved = INTERVENTION.bells;
    try {
      INTERVENTION.bells = 1;
      expect(expectedSupport(s, p)).toBeGreaterThan(merc);
    } finally {
      INTERVENTION.bells = saved;
    }
    p.gold = 0;
    expect(expectedSupport(s, p)).toBe(0);
  });

  it('Creative declares in a strong position it could not win alone, and hires the mercenaries', () => {
    const ratio = AI_PROFILES.competent.independence!.ratio;
    // The weakest garrison that needs the mercenaries to reach the ratio.
    let n = 1;
    for (; n < 40; n++) {
      const s = ready(n, 20_000);
      const p = nation(s, 'england');
      if (!canBeatRef(s, p, ratio) && canBeatRef(s, p, ratio, expectedSupport(s, p))) break;
    }
    expect(n).toBeLessThan(40);

    const poor = ready(n, 0);
    expect(rebelPower(poor, nation(poor, 'england'))).toBeLessThan(refPower(nation(poor, 'england')) * ratio);
    applyCommand(poor, { type: 'endTurn' });
    expect(nation(poor, 'england').independence).toBe('none');

    const rich = ready(n, 20_000);
    applyCommand(rich, { type: 'endTurn' });
    expect(nation(rich, 'england').independence).toBe('declared');
    expect(mercs(rich).length).toBeGreaterThan(0);
  });

  it('plays a War of Independence the same twice', () => {
    const play = () => {
      const s = ready(12, 20_000);
      for (let i = 0; i < 40 && !s.gameOver; i++) applyCommand(s, { type: 'endTurn' });
      return s;
    };
    const a = play();
    expect(nation(a, 'england').independence).not.toBe('none');
    expect(serialize(a)).toBe(serialize(play()));
  });
});
