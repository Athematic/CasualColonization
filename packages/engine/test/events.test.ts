import { describe, expect, it } from 'vitest';
import {
  aiEventChoice,
  applyCommand,
  applyEffects,
  colonyReport,
  colonySiteProblem,
  createGame,
  createUnit,
  deserialize,
  eventDef,
  eventDefs,
  eventProductionPct,
  fireEvent,
  foundColony,
  HISTORICAL_EVENTS,
  isWater,
  neighbours,
  pendingEvents,
  processEvents,
  RANDOM_EVENT_RATE,
  RANDOM_EVENTS,
  serialize,
  setFeatureSink,
  tileAt,
  yearOf,
  type AiLevel,
  type Colony,
  type GameConfig,
  type GameState,
  type NationId,
  type Player,
} from '../src/index.js';

function game(opts: Partial<GameConfig> & { level?: AiLevel } = {}): GameState {
  const nations = opts.nations ?? ['england', 'france', 'spain'];
  const humans = opts.humans ?? ['england'];
  const ai = Object.fromEntries(nations.filter((n) => !humans.includes(n)).map((n) => [n, opts.level ?? ('competent' as AiLevel)]));
  const { level: _level, ...config } = opts;
  return createGame({ seed: 11, mapSize: 'small', ...config, nations, humans, ai });
}

const nation = (s: GameState, id: NationId): Player => s.players.find((p) => p.id === id)!;

/** Founds a colony with `pop` colonists for a nation on the first free coastal site. */
function colony(s: GameState, owner: NationId, pop = 1): Colony {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 2; x < s.map.width - 2; x++) {
      if (colonySiteProblem(s, x, y)) continue;
      const t = tileAt(s, x, y)!;
      if (t.t === 'hills' || t.t === 'mountains' || !neighbours(s, x, y).some((n) => isWater(tileAt(s, n.x, n.y)))) continue;
      const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
      u.moves = 3;
      const c = foundColony(s, u.id);
      for (let i = 1; i < pop; i++) {
        const w = createUnit(s, owner, 'freeColonist', { kind: 'map', x, y });
        applyJob(s, w.id, c.id);
      }
      return c;
    }
  }
  throw new Error('no site');
}

/** Puts a colonist to work in a colony through the command (it picks a job). */
function applyJob(s: GameState, unitId: string, colonyId: string): void {
  const owner = s.units[unitId].owner;
  const current = s.current;
  s.current = s.players.findIndex((p) => p.id === owner);
  const r = applyCommand(s, { type: 'assignJob', unitId, colonyId });
  s.current = current;
  if (!r.ok) throw new Error(r.error);
}

/** Counts events fired (by id) through the telemetry sink while `fn` runs. */
function countEvents(fn: () => void): Record<string, number> {
  const counts: Record<string, number> = {};
  const prev = setFeatureSink((_, f) => {
    if (f.startsWith('event:') && !f.startsWith('event:choice')) counts[f.slice(6)] = (counts[f.slice(6)] ?? 0) + 1;
  });
  try {
    fn();
  } finally {
    setFeatureSink(prev);
  }
  return counts;
}

function play(s: GameState, turns: number): void {
  let guard = turns * 3 + 10;
  const end = s.turn + turns;
  while (s.turn < end && !s.gameOver && guard-- > 0) applyCommand(s, { type: 'endTurn' });
}

describe('event switches and determinism', () => {
  it('stores and draws nothing with events off', () => {
    const a = game({ humans: [] });
    const b = game({ humans: [], historicalEvents: false, randomEvents: false });
    play(a, 60);
    play(b, 60);
    expect(a.events).toBeUndefined();
    expect((a.history ?? []).some((h) => h.kind === 'event')).toBe(false);
    // Explicitly off is the same game as never mentioned (only the config differs).
    expect(serialize({ ...b, config: a.config })).toBe(serialize(a));
  });

  it('plays the same game twice with events on, and events do happen', () => {
    const run = () => {
      const s = game({ humans: [], historicalEvents: true, randomEvents: true });
      const counts = countEvents(() => play(s, 60));
      return { json: serialize(s), counts };
    };
    const a = run();
    const b = run();
    expect(a.json).toBe(b.json);
    expect(a.counts.circumnavigation).toBeGreaterThan(0);
    expect(Object.keys(a.counts).length).toBeGreaterThan(1);
  });

  it('a save with a pending event and modifiers survives a reload', () => {
    const s = game({ randomEvents: true });
    const c = colony(s, 'england', 3);
    fireEvent(s, eventDef(s, 'fever')!, 'england', { nation: 'england', colony: c.id });
    fireEvent(s, eventDef(s, 'bumper-harvest')!, 'england', { nation: 'england', colony: c.id });
    const copy = deserialize(serialize(s));
    expect(copy.events).toEqual(s.events);
    expect(pendingEvents(copy, 'england')).toHaveLength(1);
  });

  it('every event has a unique id and the starter set is complete', () => {
    const ids = eventDefs(game()).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(HISTORICAL_EVENTS.filter((d) => !d.hidden).length).toBeGreaterThanOrEqual(8);
    expect(RANDOM_EVENTS.length).toBeGreaterThanOrEqual(12);
    expect(RANDOM_EVENTS.filter((d) => d.choices?.length).length).toBeGreaterThanOrEqual(5);
  });
});

describe('historical events', () => {
  it('fire once, inside their window, for the nations they concern', () => {
    const s = game({ humans: [], historicalEvents: true });
    for (const n of ['england', 'france', 'spain'] as NationId[]) colony(s, n, 2);
    const fired: Record<string, number[]> = {};
    const prev = setFeatureSink((_, f) => {
      if (!f.startsWith('event:') || f.startsWith('event:choice')) return;
      (fired[f.slice(6)] ??= []).push(s.turn);
    });
    try {
      for (let t = 0; t < 560; t++) {
        s.turn = t;
        processEvents(s);
      }
    } finally {
      setFeatureSink(prev);
    }
    for (const def of HISTORICAL_EVENTS) {
      const turns = fired[def.id] ?? [];
      expect(turns.length, def.id).toBeGreaterThan(0);
      // Once: every nation on the same turn.
      expect(new Set(turns).size, def.id).toBe(1);
      if (def.years) {
        const year = yearOf(turns[0]).year;
        expect(year, def.id).toBeGreaterThanOrEqual(def.years[0]);
        expect(year, def.id).toBeLessThanOrEqual(def.years[1]);
      }
    }
    // France forbade the Huguenots to leave: it gets no offer.
    expect(s.messages.some((m) => m.to === 'france' && /Huguenot/.test(m.text))).toBe(false);
    // The bubble bursts four turns after it starts.
    expect(fired['bubble-burst'][0] - fired.bubble[0]).toBe(4);
    // Public history, once per event.
    expect((s.history ?? []).filter((h) => h.kind === 'event' && /The Great Frost/.test(h.text))).toHaveLength(1);
  });

  it('are not drawn when only random events are on', () => {
    const s = game({ humans: [], randomEvents: true });
    colony(s, 'england', 2);
    const counts = countEvents(() => {
      for (let t = 0; t < 400; t++) {
        s.turn = t;
        processEvents(s);
      }
    });
    for (const def of HISTORICAL_EVENTS) expect(counts[def.id], def.id).toBeUndefined();
  });
});

describe('random events', () => {
  it('happen about RANDOM_EVENT_RATE times per nation and round', () => {
    const s = game({ humans: [], randomEvents: true });
    for (const n of ['england', 'france', 'spain'] as NationId[]) {
      const c = colony(s, n, 3);
      c.goods.horses = 60;
    }
    const rounds = 1500;
    const counts = countEvents(() => {
      for (let i = 0; i < rounds; i++) {
        s.turn = 200 + i;
        processEvents(s);
      }
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const expected = rounds * 3 * RANDOM_EVENT_RATE;
    expect(total).toBeGreaterThan(expected * 0.75);
    expect(total).toBeLessThan(expected * 1.25);
    // Several kinds turn up, none dominating.
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...Object.values(counts))).toBeLessThan(total * 0.35);
  });

  it('respect the cooldown for the same nation', () => {
    const s = game({ humans: [], randomEvents: true });
    colony(s, 'england', 3);
    const last: Record<string, number> = {};
    let gap = Infinity;
    const prev = setFeatureSink((n, f) => {
      if (!f.startsWith('event:') || f.startsWith('event:choice')) return;
      const key = `${f}|${n}`;
      if (last[key] !== undefined) gap = Math.min(gap, s.turn - last[key]);
      last[key] = s.turn;
    });
    try {
      for (let i = 0; i < 1500; i++) {
        s.turn = 200 + i;
        processEvents(s);
      }
    } finally {
      setFeatureSink(prev);
    }
    expect(gap).toBeGreaterThanOrEqual(40);
  });
});

describe('effects', () => {
  const setup = () => {
    const s = game({ randomEvents: true });
    const c = colony(s, 'england', 3);
    return { s, c, p: nation(s, 'england'), v: { nation: 'england' as NationId, colony: c.id } };
  };
  const r = () => 0.1;

  it('gold, goods, prices, crosses and tax', () => {
    const { s, c, p, v } = setup();
    const gold = p.gold;
    applyEffects(s, 'test', [{ kind: 'gold', amount: 100 }], v, r);
    expect(p.gold).toBe(gold + 100);
    applyEffects(s, 'test', [{ kind: 'gold', amount: -1e9 }], v, r);
    expect(p.gold).toBe(0);
    applyEffects(s, 'test', [{ kind: 'goods', good: 'tools', amount: 40 }], v, r);
    expect(c.goods.tools).toBe(40);
    applyEffects(s, 'test', [{ kind: 'loseGoods', good: 'tools', pct: 25 }], v, r);
    expect(c.goods.tools).toBe(30);
    const price = p.market.muskets.price;
    applyEffects(s, 'test', [{ kind: 'price', good: 'muskets', delta: 3 }], v, r);
    expect(p.market.muskets.price).toBe(price + 3);
    const crosses = p.crosses;
    applyEffects(s, 'test', [{ kind: 'crosses', amount: 12 }], v, r);
    expect(p.crosses).toBe(crosses + 12);
    const tax = p.tax;
    applyEffects(s, 'test', [{ kind: 'tax', delta: 3 }], v, r);
    expect(p.tax).toBe(tax + 3);
  });

  it('units, ships, buildings, tension and land', () => {
    const { s, c, v } = setup();
    const units = Object.keys(s.units).length;
    applyEffects(s, 'test', [{ kind: 'unit', type: 'expertFarmer', where: 'colony' }, { kind: 'unit', type: 'masterWeaver', where: 'europe' }], v, r);
    expect(Object.keys(s.units).length).toBe(units + 2);
    expect(Object.values(s.units).some((u) => u.type === 'masterWeaver' && u.loc.kind === 'europe')).toBe(true);

    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    ship.cargo = { furs: 100 };
    applyEffects(s, 'test', [{ kind: 'damageShip', turns: 2, cargoPct: 30 }], { ...v, ship: ship.id }, r);
    expect(ship.repair).toBe(2);
    expect(ship.cargo.furs).toBe(70);

    c.buildings.docks = 2;
    applyEffects(s, 'test', [{ kind: 'damageBuilding' }], { ...v, building: 'docks' }, r);
    expect(c.buildings.docks).toBe(1);
    applyEffects(s, 'test', [{ kind: 'damageBuilding' }], { ...v, building: 'docks' }, r);
    expect(c.buildings.docks).toBe(1); // never below its first level

    const st = Object.values(s.settlements)[0];
    const before = st.tension.england ?? 0;
    applyEffects(s, 'test', [{ kind: 'tension', amount: 100 }], { ...v, tribe: st.tribe }, r);
    expect(st.tension.england).toBe(before + 100);

    const bonuses = () => neighbours(s, c.x, c.y).filter((n) => tileAt(s, n.x, n.y)?.b).length;
    const had = bonuses();
    applyEffects(s, 'test', [{ kind: 'bonusResource' }], v, r);
    expect(bonuses()).toBe(had + 1);
  });

  it('chances use the event stream; follow-ups fire later', () => {
    const { s, c, v } = setup();
    c.goods.furs = 100;
    expect(applyEffects(s, 'test', [{ kind: 'chance', p: 0.5, text: 'yes', elseText: 'no', effects: [{ kind: 'loseGoods', good: 'furs', pct: 50 }] }], v, () => 0.9)).toEqual(['no']);
    expect(c.goods.furs).toBe(100);
    expect(applyEffects(s, 'test', [{ kind: 'chance', p: 0.5, text: 'yes', effects: [{ kind: 'loseGoods', good: 'furs', pct: 50 }] }], v, () => 0.1)).toEqual(['yes']);
    expect(c.goods.furs).toBe(50);
    applyEffects(s, 'test', [{ kind: 'followUp', event: 'bubble-burst', turns: 2 }], v, r);
    s.config.historicalEvents = true;
    const t = s.turn;
    const counts = countEvents(() => {
      for (let i = 0; i < 3; i++) {
        s.turn = t + i;
        processEvents(s);
      }
    });
    expect(counts['bubble-burst']).toBe(1);
  });

  it('a production modifier changes output while it runs, then expires with a message', () => {
    const { s, c, v } = setup();
    const food = colonyReport(s, c).produced.food;
    applyEffects(s, 'fever', [{ kind: 'production', pct: -30, turns: 3 }], v, r);
    const start = s.turn;
    // Set during a turn (a person's answer), it applies from this turn on, for 3 turns.
    expect(eventProductionPct(s, c, 'food')).toBe(-30);
    expect(colonyReport(s, c).produced.food).toBe(Math.round(food * 0.7));
    // Other nations' colonies are untouched; a nation-wide modifier reaches every colony.
    expect(eventProductionPct(s, c, 'bells')).toBe(-30);
    applyEffects(s, 'enlightenment', [{ kind: 'production', products: ['bells'], pct: 25, turns: 2, scope: 'nation' }], { nation: 'england' }, r);
    expect(eventProductionPct(s, c, 'bells')).toBe(-5);
    const other = colony(s, 'france', 2);
    expect(eventProductionPct(s, other, 'food')).toBe(0);
    s.turn = start + 2;
    expect(eventProductionPct(s, c, 'food')).toBe(-30);
    processEvents(s);
    expect(s.messages.some((m) => m.text === `${c.name} has recovered from the fever.`)).toBe(true);
    expect(s.events!.mods.some((m) => m.source === 'fever')).toBe(false);
    s.turn = start + 3;
    expect(eventProductionPct(s, c, 'food')).toBe(0);
    expect(colonyReport(s, c).produced.food).toBe(food);
  });
});

describe('choices', () => {
  it('people answer in the briefing, with the answerEvent command', () => {
    const s = game({ randomEvents: true });
    const c = colony(s, 'england', 3);
    c.goods.horses = 100;
    const p = nation(s, 'england');
    p.gold = 1000;
    expect(fireEvent(s, eventDef(s, 'wolves')!, 'england', { nation: 'england', colony: c.id })).toBe(true);
    const [pending] = pendingEvents(s, 'england');
    expect(pending.event).toBe('wolves');
    expect(applyCommand(s, { type: 'answerEvent', eventId: pending.id, choice: 5 }).ok).toBe(false);
    const res = applyCommand(s, { type: 'answerEvent', eventId: pending.id, choice: 0 });
    expect(res.ok).toBe(true);
    expect(p.gold).toBe(940);
    expect(c.goods.horses).toBe(90);
    expect(pendingEvents(s, 'england')).toHaveLength(0);
    expect((s.history ?? []).some((h) => h.kind === 'event' && h.secret && /Wolves at/.test(h.text))).toBe(true);
  });

  it('a choice that cannot be paid for is refused', () => {
    const s = game({ randomEvents: true });
    const c = colony(s, 'england', 3);
    c.goods.horses = 100;
    nation(s, 'england').gold = 10;
    fireEvent(s, eventDef(s, 'wolves')!, 'england', { nation: 'england', colony: c.id });
    const [pending] = pendingEvents(s, 'england');
    expect(applyCommand(s, { type: 'answerEvent', eventId: pending.id, choice: 0 }).ok).toBe(false);
  });

  it('an unanswered choice takes the default after a round', () => {
    const s = game({ randomEvents: true });
    const c = colony(s, 'england', 3);
    c.goods.horses = 100;
    fireEvent(s, eventDef(s, 'wolves')!, 'england', { nation: 'england', colony: c.id });
    processEvents(s);
    expect(pendingEvents(s, 'england')).toHaveLength(1);
    s.turn++;
    processEvents(s);
    expect(pendingEvents(s, 'england')).toHaveLength(0);
    expect(c.goods.horses).toBe(60);
    expect(s.messages.some((m) => /no answer was given/.test(m.text))).toBe(true);
  });

  it('Naive takes the first choice it can afford; advanced levels the one worth most', () => {
    const s = game({ humans: [], randomEvents: true });
    const c = colony(s, 'france', 3);
    const france = nation(s, 'france');
    const def = eventDef(s, 'wolves')!;
    const v = { nation: 'france' as NationId, colony: c.id, cost: 60 };
    france.gold = 1000;
    // A big herd is worth guarding; a small one is not worth 60 gold.
    c.goods.horses = 400;
    france.ai = 'naive';
    expect(aiEventChoice(s, france, def, v)).toBe(0);
    france.ai = 'competent';
    expect(aiEventChoice(s, france, def, v)).toBe(0);
    c.goods.horses = 12;
    expect(aiEventChoice(s, france, def, v)).toBe(1);
    france.ai = 'naive';
    expect(aiEventChoice(s, france, def, v)).toBe(0);
    france.gold = 0;
    expect(aiEventChoice(s, france, def, v)).toBe(1);
  });

  it('computer players answer at once, and the outcome is reported', () => {
    const s = game({ humans: [], randomEvents: true, level: 'creative' });
    const c = colony(s, 'france', 3);
    c.goods.silver = 100;
    nation(s, 'france').gold = 1000;
    fireEvent(s, eventDef(s, 'pirates')!, 'france');
    expect(pendingEvents(s, 'france')).toHaveLength(0);
    expect(s.messages.some((m) => m.to === 'france' && /Pirates off .*: Hire guards/.test(m.text))).toBe(true);
    expect(c.goods.silver).toBe(100);
  });
});

describe('toggling during a game', () => {
  it('the setEvents command switches events on and off, deterministically', () => {
    const run = () => {
      const s = game();
      colony(s, 'england', 3);
      play(s, 5);
      const res = applyCommand(s, { type: 'setEvents', historical: true, random: true });
      expect(res.ok).toBe(true);
      expect(s.config.historicalEvents).toBe(true);
      expect(s.config.randomEvents).toBe(true);
      play(s, 40);
      applyCommand(s, { type: 'setEvents', random: false });
      expect(s.config.randomEvents).toBe(false);
      expect(s.config.historicalEvents).toBe(true);
      return s;
    };
    const a = run();
    const b = run();
    expect(serialize(a)).toBe(serialize(b));
    expect(a.messages.some((m) => m.text === 'Historical events are now on. Random events are now on.')).toBe(true);
    expect(a.events).toBeDefined();
    // With random events off again, none are drawn.
    const counts = countEvents(() => {
      for (let i = 0; i < 300; i++) {
        a.turn = 300 + i;
        processEvents(a);
      }
    });
    for (const def of RANDOM_EVENTS) expect(counts[def.id], def.id).toBeUndefined();
    expect(applyCommand(a, { type: 'setEvents' }).ok).toBe(false);
  });
});
