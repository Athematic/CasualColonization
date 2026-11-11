/**
 * Alliances (docs/design/cooperation.md, Beta 1 step 1): unlocking, proposals, the defensive
 * pact, open colonies, shared sight, leaving, and the computer players' rules.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_PROFILES,
  ALLIANCE_RULES,
  AMERICAS,
  allianceOf,
  allianceProblem,
  allianceThresholds,
  alliesOf,
  applyCommand,
  colonySiteProblem,
  createGame,
  createUnit,
  describeMove,
  foundColony,
  HOSTILITY_YEARS,
  isAllied,
  isCoastal,
  isFavoured,
  hasTradeAgreement,
  isWater,
  makeAlliance,
  makeFavoured,
  makeTradeAgreement,
  moveUnit,
  registerScenario,
  relation,
  startWar,
  tileAt,
  turnAfterYears,
  WAITING_YEARS,
  attack,
  confederationOf,
  makeConfederation,
  processIndependence,
  removeUnit,
  player,
  shareBells,
  splitFind,
  calendarOf,
  checkVictory,
  concordWinners,
  lastTurn,
  type Colony,
  type Direction,
  type GameState,
  type NationId,
  type Scenario,
  type Unit,
} from '../src/index.js';
import { foreignAffairs } from '../src/ai/foreign.js';

/** The Americas with alliances on; and a copy whose computer players cooperate eagerly. */
const ALLIED: Scenario = { ...AMERICAS, id: 'test-alliances', name: 'test-alliances', hidden: true, mechanics: { ...AMERICAS.mechanics, alliances: true, confederation: false }, victory: [{ id: 'independence-war' }, { id: 'concord', params: { share: 0.6 } }, { id: 'time' }] };
const EAGER: Scenario = { ...ALLIED, id: 'test-alliances-eager', name: 'test-alliances-eager', ai: { ...AMERICAS.ai, cooperation: { proposeAlliance: 1, acceptAlliance: 1 } } };
const NONE: Scenario = { ...AMERICAS, id: 'test-no-alliances', name: 'test-no-alliances', hidden: true, mechanics: { ...AMERICAS.mechanics, alliances: false } };
const CONFED: Scenario = { ...ALLIED, id: 'test-confederation', name: 'test-confederation', mechanics: { ...ALLIED.mechanics, confederation: true } };
registerScenario(ALLIED);
registerScenario(CONFED);
registerScenario(NONE);
registerScenario(EAGER);

type Seat = 'england' | 'france' | 'spain';

function game(opts: { humans?: NationId[]; scenario?: string; seed?: number; ai?: 'competent' | 'creative' | 'naive' | 'combative'; more?: NationId[] } = {}): GameState {
  const level = opts.ai ?? 'creative';
  const s = createGame({
    seed: opts.seed ?? 42,
    mapSize: 'small',
    nations: ['england', 'france', 'spain', ...(opts.more ?? [])],
    humans: opts.humans ?? ['england', 'france', 'spain'],
    ai: { england: level, france: level, spain: level },
    scenario: opts.scenario ?? 'test-alliances',
  });
  return s;
}

function ok(s: GameState, nation: NationId, cmd: Parameters<typeof applyCommand>[1]) {
  s.current = s.players.findIndex((p) => p.id === nation);
  const r = applyCommand(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

function refused(s: GameState, nation: NationId, cmd: Parameters<typeof applyCommand>[1]): string {
  s.current = s.players.findIndex((p) => p.id === nation);
  const r = applyCommand(s, cmd);
  if (r.ok) throw new Error('expected a refusal');
  return r.error;
}

/** A coastal colony site on flat land with a free land tile and a free water tile beside it. */
function site(s: GameState, skip: { x: number; y: number }[] = []): { x: number; y: number } {
  for (let y = 3; y < s.map.height - 3; y++) {
    for (let x = 3; x < s.map.width - 3; x++) {
      if (colonySiteProblem(s, x, y) || !isCoastal(s, x, y) || skip.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) < 6)) continue;
      const t = tileAt(s, x, y)!.t;
      if (t === 'hills' || t === 'mountains') continue;
      if (!landBeside(s, x, y)) continue;
      return { x, y };
    }
  }
  throw new Error('no site');
}

function landBeside(s: GameState, x: number, y: number): { x: number; y: number } | undefined {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const t = tileAt(s, x + dx, y + dy);
    if ((dx || dy) && t && !isWater(t)) return { x: x + dx, y: y + dy };
  }
  return undefined;
}

function found(s: GameState, owner: NationId, at: { x: number; y: number }, name: string): Colony {
  const u = createUnit(s, owner, 'freeColonist', { kind: 'map', x: at.x, y: at.y });
  u.moves = 3;
  return foundColony(s, u.id, name);
}

function dirTo(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const map: Record<string, Direction> = { '0,-1': 'n', '1,-1': 'ne', '1,0': 'e', '1,1': 'se', '0,1': 's', '-1,1': 'sw', '-1,0': 'w', '-1,-1': 'nw' };
  return map[`${dx},${dy}`];
}

/** Makes two computer nations Favoured Nations whose alliance is unlocked. */
function ripen(s: GameState, a: NationId, b: NationId) {
  makeFavoured(s, a, b);
  const rel = relation(s, a, b);
  rel.peaceSince = 0;
  s.turn = 300;
  rel.volume = ALLIANCE_RULES.volume.max;
}

describe('alliances: unlocking and proposals', () => {
  it('are refused when the scenario has none', () => {
    const s = game({ scenario: 'test-no-alliances' });
    expect(allianceProblem(s, 'england', 'france')).toMatch(/no alliances/);
    expect(refused(s, 'england', { type: 'proposeAlliance', nation: 'france' })).toMatch(/no alliances/);
  });

  it('draw hidden thresholds per pair from the seed, without touching the game’s random numbers', () => {
    const s = game();
    const rng = s.rng;
    const t = allianceThresholds(s, 'england', 'france');
    expect(allianceThresholds(s, 'france', 'england')).toEqual(t);
    expect(s.rng).toBe(rng);
    expect(t.years).toBeGreaterThanOrEqual(ALLIANCE_RULES.peaceYears.base - ALLIANCE_RULES.peaceYears.spread);
    expect(t.years).toBeLessThanOrEqual(ALLIANCE_RULES.peaceYears.base + ALLIANCE_RULES.peaceYears.spread);
    expect(t.volume).toBeGreaterThanOrEqual(ALLIANCE_RULES.volume.min);
    expect(t.volume).toBeLessThanOrEqual(ALLIANCE_RULES.volume.max);
  });

  it('need Favoured Nation, then more years of peace and more trade, between computer players', () => {
    const s = game({ humans: ['england'] });
    expect(allianceProblem(s, 'england', 'france')).toMatch(/Favoured Nation first/);
    makeFavoured(s, 'england', 'france');
    const rel = relation(s, 'england', 'france');
    rel.peaceSince = 280;
    s.turn = 300; // ten years of peace (two turns a year): not enough
    rel.volume = ALLIANCE_RULES.volume.max;
    expect(allianceProblem(s, 'england', 'france')).toMatch(/not yet close enough/);
    rel.peaceSince = 0;
    rel.volume = 0;
    expect(allianceProblem(s, 'england', 'france')).toMatch(/not yet close enough/);
    rel.volume = ALLIANCE_RULES.volume.max;
    expect(allianceProblem(s, 'england', 'france')).toBeNull();
  });

  it('between two people can be made at any time, by proposal and answer', () => {
    // Six nations, so an alliance may hold three (at most half of them).
    const s = game({ more: ['portugal', 'sweden', 'denmark'], humans: ['england', 'france', 'spain', 'portugal'] });
    ok(s, 'england', { type: 'proposeAlliance', nation: 'france' });
    expect(relation(s, 'england', 'france').proposal).toMatchObject({ kind: 'alliance', from: 'england' });
    ok(s, 'france', { type: 'answerProposal', nation: 'england', accept: true });
    expect(isAllied(s, 'england', 'france')).toBe(true);
    const t = allianceOf(s, 'france')!;
    expect(t).toMatchObject({ kind: 'alliance', terms: { kind: 'alliance', defensive: true, openColonies: true, sharedSight: true } });
    // A third nation is invited into the same alliance, not a second one.
    expect(refused(s, 'spain', { type: 'proposeAlliance', nation: 'france' })).toMatch(/another alliance/);
    ok(s, 'france', { type: 'proposeAlliance', nation: 'spain' });
    ok(s, 'spain', { type: 'answerProposal', nation: 'france', accept: true });
    expect(alliesOf(s, 'england').sort()).toEqual(['france', 'spain']);
    expect((s.treaties ?? []).filter((x) => x.kind === 'alliance')).toHaveLength(1);
    // A fourth would make it more than half the nations.
    expect(refused(s, 'france', { type: 'proposeAlliance', nation: 'portugal' })).toMatch(/at most half/);
  });

  it('a computer player accepts an unlocked alliance at the scenario’s rate, and turns one down at none', () => {
    const s = game({ humans: ['england'], scenario: 'test-alliances-eager' });
    ripen(s, 'england', 'france');
    expect(ok(s, 'england', { type: 'proposeAlliance', nation: 'france' }).text).toMatch(/now allies/);
    const none: Scenario = { ...ALLIED, id: 'test-alliances-never', ai: { ...AMERICAS.ai, cooperation: { acceptAlliance: 0 } } };
    registerScenario(none);
    const t = game({ humans: ['england'], scenario: none.id });
    ripen(t, 'england', 'france');
    expect(ok(t, 'england', { type: 'proposeAlliance', nation: 'france' }).text).toMatch(/turns down/);
    expect(isAllied(t, 'england', 'france')).toBe(false);
  });
});

describe('alliances: the defensive pact', () => {
  it('makes war on one ally war with all of them', () => {
    const s = game();
    makeAlliance(s, 'england', 'france');
    ok(s, 'spain', { type: 'declareWar', nation: 'england' });
    expect(s.players.find((p) => p.id === 'spain')!.stance.france).toBe('war');
    expect(s.players.find((p) => p.id === 'france')!.stance.spain).toBe('war');
    expect(isAllied(s, 'england', 'france')).toBe(true);
  });

  it('does not oblige an ally to join its partner’s own war', () => {
    const s = game();
    makeAlliance(s, 'england', 'france');
    ok(s, 'england', { type: 'declareWar', nation: 'spain' });
    expect(s.players.find((p) => p.id === 'france')!.stance.spain).not.toBe('war');
  });

  it('keeps computer players from wars on their allies and on friends’ allies', () => {
    const s = game({ humans: [] });
    makeAlliance(s, 'england', 'france');
    makeFavoured(s, 'spain', 'france');
    expect(() => startWar(s, 'spain', 'england')).toThrow(/ally/);
    expect(() => startWar(s, 'england', 'france')).toThrow(/ally/);
  });
});

describe('alliances: open colonies and shared sight', () => {
  function setup() {
    const s = game();
    for (const p of s.players) p.explored.fill(0);
    const at = site(s);
    const plymouth = found(s, 'england', at, 'Plymouth');
    makeAlliance(s, 'england', 'france');
    const beside = landBeside(s, plymouth.x, plymouth.y)!;
    return { s, plymouth, beside };
  }

  it('lets allied units enter and garrison an ally’s colony, and only an ally’s', () => {
    const { s, plymouth, beside } = setup();
    const soldier = createUnit(s, 'france', 'veteranSoldier', { kind: 'map', x: beside.x, y: beside.y });
    soldier.role = 'soldier';
    soldier.moves = 3;
    const spanish = createUnit(s, 'spain', 'freeColonist', { kind: 'map', x: beside.x, y: beside.y });
    spanish.moves = 3;
    expect(describeMove(s, spanish.id, dirTo(beside, plymouth)).kind).toBe('blocked');
    expect(describeMove(s, soldier.id, dirTo(beside, plymouth)).kind).toBe('move');
    ok(s, 'france', { type: 'move', unitId: soldier.id, dir: dirTo(beside, plymouth) });
    expect(soldier.loc).toMatchObject({ kind: 'map', x: plymouth.x, y: plymouth.y });
    expect(plymouth.owner).toBe('england');
    ok(s, 'france', { type: 'fortify', unitId: soldier.id });
    // The garrison defends the colony: Spain's attack meets the French veterans.
    const attacker = createUnit(s, 'spain', 'freeColonist', { kind: 'map', x: beside.x, y: beside.y });
    attacker.role = 'soldier';
    attacker.moves = 3;
    const before = soldier.role;
    const result = attack(s, attacker.id, { colonyId: plymouth.id });
    expect(s.players.find((p) => p.id === 'spain')!.stance.france).toBe('war');
    expect(result.text).toMatch(/Veteran|veteran|soldier|Soldier/);
    expect(plymouth.owner).toBe('england');
    expect(before).toBe('soldier');
  });

  it('lets an allied wagon train sell to and buy from the colony', () => {
    const { s, plymouth, beside } = setup();
    const wagon = createUnit(s, 'france', 'wagonTrain', { kind: 'map', x: beside.x, y: beside.y });
    wagon.moves = 3;
    wagon.cargo = { tools: 50 };
    moveUnit(s, wagon.id, dirTo(beside, plymouth));
    const en = s.players.find((p) => p.id === 'england')!;
    const fr = s.players.find((p) => p.id === 'france')!;
    en.gold = 5000;
    const [enGold, frGold] = [en.gold, fr.gold];
    const tools = plymouth.goods.tools;
    ok(s, 'france', { type: 'sellInColony', carrierId: wagon.id, good: 'tools', amount: 50 });
    expect(plymouth.goods.tools).toBe(tools + 50);
    expect(wagon.cargo.tools ?? 0).toBe(0);
    expect(fr.gold).toBeGreaterThan(frGold);
    expect(en.gold).toBe(enGold - (fr.gold - frGold));
    plymouth.goods.furs = 150;
    ok(s, 'france', { type: 'buyInColony', carrierId: wagon.id, good: 'furs', amount: 100 });
    expect(wagon.cargo.furs).toBe(100);
    expect(plymouth.goods.furs).toBe(50);
    // Unloading for free into an ally's warehouse stays forbidden.
    expect(refused(s, 'france', { type: 'unloadGoods', carrierId: wagon.id, good: 'furs', amount: 100 })).toMatch(/your colonies/);
  });

  it('shares what allies see, from the alliance on', () => {
    const s = game();
    for (const p of s.players) p.explored.fill(0);
    const en = s.players.find((p) => p.id === 'england')!;
    const fr = s.players.find((p) => p.id === 'france')!;
    en.explored[5] = 1;
    makeAlliance(s, 'england', 'france');
    expect(fr.explored[5]).toBe(1);
    const at = site(s);
    const scout = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: at.x, y: at.y });
    scout.moves = 3;
    const to = landBeside(s, at.x, at.y)!;
    moveUnit(s, scout.id, dirTo(at, to));
    expect(fr.explored[to.y * s.map.width + to.x]).toBe(1);
    expect(s.players.find((p) => p.id === 'spain')!.explored[to.y * s.map.width + to.x]).toBe(0);
  });
});

describe('alliances: leaving', () => {
  it('costs more than cancelling Favoured Nation: the same cascade and a longer hostility', () => {
    const s = game({ humans: ['england'] });
    ripen(s, 'england', 'france');
    makeAlliance(s, 'england', 'france');
    const at = site(s);
    const plymouth = found(s, 'england', at, 'Plymouth');
    const guest = createUnit(s, 'france', 'freeColonist', { kind: 'map', x: plymouth.x, y: plymouth.y });
    ok(s, 'england', { type: 'leaveAlliance' });
    expect(isAllied(s, 'england', 'france')).toBe(false);
    expect(allianceOf(s, 'england')).toBeUndefined();
    expect(isFavoured(s, 'england', 'france')).toBe(false);
    expect(hasTradeAgreement(s, 'england', 'france')).toBe(false);
    const rel = relation(s, 'england', 'france');
    expect(rel.hostileUntil!).toBeGreaterThan(turnAfterYears(s.turn, HOSTILITY_YEARS.base + HOSTILITY_YEARS.spread));
    expect(rel.waitUntil!).toBeGreaterThan(turnAfterYears(s.turn, WAITING_YEARS.base));
    // The French colonist had to leave Plymouth.
    expect(guest.loc).not.toMatchObject({ x: plymouth.x, y: plymouth.y });
    expect(s.treaties!.find((t) => t.kind === 'alliance')!.end).toMatchObject({ why: 'left', by: 'england' });
  });

  it('by war on an ally counts as leaving', () => {
    const s = game();
    makeAlliance(s, 'england', 'france');
    ok(s, 'france', { type: 'declareWar', nation: 'england' });
    expect(isAllied(s, 'england', 'france')).toBe(false);
    expect(s.treaties!.find((t) => t.kind === 'alliance')!.end).toMatchObject({ why: 'war', by: 'france' });
  });

  it('is free between two people, but for the cascade', () => {
    const s = game();
    ok(s, 'england', { type: 'proposeAlliance', nation: 'france' });
    ok(s, 'france', { type: 'answerProposal', nation: 'england', accept: true });
    ok(s, 'france', { type: 'leaveAlliance' });
    const rel = relation(s, 'england', 'france');
    expect(rel.hostileUntil).toBeUndefined();
    expect(rel.waitUntil).toBeUndefined();
    expect(allianceProblem(s, 'england', 'france')).toBeNull();
  });

  it('leaves the rest of a larger alliance standing', () => {
    const s = game();
    makeAlliance(s, 'england', 'france');
    makeAlliance(s, 'england', 'spain');
    ok(s, 'spain', { type: 'leaveAlliance' });
    expect(isAllied(s, 'england', 'france')).toBe(true);
    expect(allianceOf(s, 'england')!.left).toEqual([{ party: { kind: 'nation', id: 'spain' }, turn: s.turn }]);
  });
});

describe('alliances: computer players', () => {
  /** The first turn from `from` on which France (second in turn order) reviews its relations. */
  function reviewTurn(from: number): number {
    let t = from;
    while ((t + 1) % 5 !== 0) t++;
    return t;
  }

  it('propose an unlocked alliance to a Favoured Nation partner, and accept one', () => {
    const s = game({ humans: [], scenario: 'test-alliances-eager' });
    makeTradeAgreement(s, 'england', 'france');
    ripen(s, 'england', 'france');
    s.turn = reviewTurn(300);
    foreignAffairs(s, s.players[1], AI_PROFILES.creative, 0, 0);
    expect(isAllied(s, 'england', 'france')).toBe(true);
  });

  it('ally more often in a scenario that raises the cooperation rates', () => {
    let eager = 0;
    let usual = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const scenario of ['test-alliances', 'test-alliances-eager']) {
        const s = game({ humans: [], scenario, seed, ai: 'competent' });
        ripen(s, 'england', 'france');
        s.turn = reviewTurn(300);
        foreignAffairs(s, s.players[1], AI_PROFILES.competent, 0, 0);
        if (isAllied(s, 'england', 'france')) {
          if (scenario === 'test-alliances') usual++;
          else eager++;
        }
      }
    }
    // Competent accepts 80% of what Creative would, and proposes 60%.
    expect(eager).toBeGreaterThan(usual);
    expect(eager).toBeGreaterThanOrEqual(18);
  });

  it('make no alliances when the scenario has none', () => {
    const s = game({ humans: [], scenario: 'test-alliances-eager' });
    ripen(s, 'england', 'france');
    s.config.scenario = 'test-no-alliances';
    s.turn = reviewTurn(300);
    foreignAffairs(s, s.players[1], AI_PROFILES.creative, 0, 0);
    expect(isAllied(s, 'england', 'france')).toBe(false);
    expect(s.treaties!.some((t) => t.kind === 'alliance')).toBe(false);
  });
});

describe('alliances: shared bells and joint expeditions (step 4)', () => {
  it('count a tenth of each ally’s bells towards the others’ Congress, from the alliance on', () => {
    const s = game();
    const en = player(s, 'england');
    const fr = player(s, 'france');
    const es = player(s, 'spain');
    en.bells = 400; // rung before the alliance: not shared
    makeAlliance(s, 'england', 'france');
    shareBells(s, 'england');
    const before = fr.fatherBells;
    en.bells += 55;
    shareBells(s, 'england');
    expect(fr.fatherBells - before).toBe(5);
    expect(en.allyBells).toEqual({ seen: 455, carry: 50 });
    en.bells += 5;
    shareBells(s, 'england');
    expect(fr.fatherBells - before).toBe(6);
    expect(es.fatherBells).toBe(0);
    expect(fr.bells).toBe(0); // the ally's own liberty is untouched
    // Nations without allies write nothing.
    shareBells(s, 'spain');
    expect(es.allyBells).toBeUndefined();
  });

  it('fund a seasoned scout together and share the gold it finds', () => {
    const s = game();
    const en = player(s, 'england');
    const fr = player(s, 'france');
    expect(refused(s, 'england', { type: 'proposeExpedition', nation: 'france' })).toMatch(/between allies/);
    makeAlliance(s, 'england', 'france');
    en.gold = fr.gold = 2000;
    ok(s, 'england', { type: 'proposeExpedition', nation: 'france' });
    ok(s, 'france', { type: 'answerProposal', nation: 'england', accept: true });
    const half = ALLIANCE_RULES.expeditionCost / 2;
    expect([en.gold, fr.gold]).toEqual([2000 - half, 2000 - half]);
    const scout = Object.values(s.units).find((u) => u.joint === 'france')!;
    expect(scout).toMatchObject({ owner: 'england', type: 'seasonedScout', role: 'scout', loc: { kind: 'europe' } });
    expect(splitFind(s, scout, 301)).toBe(151);
    expect(fr.gold).toBe(2000 - half + 150);
  });

  it('a computer ally joins an expedition when it can pay its half and keep a reserve', () => {
    const s = game({ humans: ['england'] });
    makeAlliance(s, 'england', 'france');
    const fr = player(s, 'france');
    fr.gold = 1000;
    player(s, 'england').gold = 5000;
    expect(ok(s, 'england', { type: 'proposeExpedition', nation: 'france' }).text).toMatch(/turns down/);
    fr.gold = 5000;
    expect(ok(s, 'england', { type: 'proposeExpedition', nation: 'france' }).text).toMatch(/joint expedition/);
  });
});

describe('confederation: declaring independence together (step 5)', () => {
  function rebels(s: GameState) {
    const a = site(s);
    const b = site(s, [a]);
    const plymouth = found(s, 'england', a, 'Plymouth');
    const quebec = found(s, 'france', b, 'Québec');
    plymouth.liberty = 10_000;
    quebec.liberty = 10_000;
    makeAlliance(s, 'england', 'france');
    return { plymouth, quebec };
  }

  it('is refused where the scenario has no confederation, and between nations not allied', () => {
    const s = game();
    rebels(s);
    expect(refused(s, 'england', { type: 'proposeConfederation', nation: 'france' })).toMatch(/cannot declare independence together/);
    const t = game({ scenario: 'test-confederation' });
    expect(refused(t, 'england', { type: 'proposeConfederation', nation: 'spain' })).toMatch(/Only allies/);
  });

  it('makes both allies declare at once, as one confederation', () => {
    const s = game({ scenario: 'test-confederation' });
    rebels(s);
    ok(s, 'england', { type: 'proposeConfederation', nation: 'france' });
    expect(player(s, 'england').independence).toBe('none');
    ok(s, 'france', { type: 'answerProposal', nation: 'england', accept: true });
    expect(player(s, 'england').independence).toBe('declared');
    expect(player(s, 'france').independence).toBe('declared');
    expect(confederationOf(s, 'france')?.kind).toBe('confederation');
    expect(isAllied(s, 'england', 'france')).toBe(true);
  });

  it('wins together once every member’s royal army is beaten, and both are the winners', () => {
    const s = game({ scenario: 'test-confederation' });
    rebels(s);
    makeConfederation(s, 'england', 'france');
    for (const n of ['england', 'france'] as const) player(s, n).ref = { regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 };
    for (const u of Object.values(s.units)) if (u.owner === 'crown') removeUnit(s, u.id);
    processIndependence(s);
    expect(player(s, 'england').independence).toBe('won');
    expect(player(s, 'france').independence).toBe('won');
    expect(s.gameOver?.winners.slice().sort()).toEqual(['england', 'france']);
    expect(confederationOf(s, 'england')).toBeUndefined();
  });

  it('loses together once the members hold half their colonies or fewer', () => {
    const s = game({ scenario: 'test-confederation', humans: ['england', 'france', 'spain'] });
    const { quebec } = rebels(s);
    makeConfederation(s, 'england', 'france');
    // France's only colony falls: the two hold one of their two colonies.
    quebec.owner = 'crown';
    quebec.takenFrom = 'france';
    processIndependence(s);
    expect(player(s, 'england').independence).toBe('lost');
    expect(player(s, 'france').independence).toBe('lost');
  });

  it('a computer ally answers by its own readiness for independence', () => {
    const s = game({ scenario: 'test-confederation', humans: ['england'] });
    rebels(s);
    // France has no army and no stockades: not ready.
    expect(ok(s, 'england', { type: 'proposeConfederation', nation: 'france' }).text).toMatch(/turns down/);
    expect(player(s, 'france').independence).toBe('none');
  });
});

describe('concord: winning together', () => {
  function ending(golds: Partial<Record<Seat, number>>) {
    const s = game();
    for (const p of s.players) p.gold = golds[p.id as Seat] ?? 0;
    s.turn = lastTurn(calendarOf(s));
    return s;
  }

  it('ends the game with every member of an alliance holding enough of the score as winners, best first', () => {
    const s = ending({ england: 400_000, france: 800_000, spain: 600_000 });
    makeAlliance(s, 'england', 'france');
    // England and France hold two thirds of the score, above the scenario's 60%.
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual(['france', 'england']);
    expect(s.gameOver?.winner).toBe('france');
    expect(s.gameOver?.reason).toMatch(/alliance of France and England .* wins together/);
  });

  it('falls back to the highest score when no alliance holds enough', () => {
    const s = ending({ england: 400_000, france: 400_000, spain: 800_000 });
    makeAlliance(s, 'england', 'france');
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual(['spain']);
    expect(s.gameOver?.winner).toBe('spain');
  });

  it('ranks the members of a larger alliance, and needs at least two members', () => {
    const s = ending({});
    makeAlliance(s, 'england', 'france');
    makeAlliance(s, 'england', 'spain');
    expect(concordWinners(s, { england: 10, france: 30, spain: 20, portugal: 5 }, 0.5)).toEqual(['france', 'spain', 'england']);
    expect(concordWinners(s, { england: 10, france: 30, portugal: 5 }, 0.5)).toEqual(['france', 'england']);
    expect(concordWinners(s, { england: 10, france: 0, spain: 0, portugal: 1 }, 0.5)).toEqual(['england', 'france', 'spain']);
    expect(concordWinners(s, { england: 0, france: 0, spain: 0, portugal: 0 }, 0.5)).toBeNull();
    // An alliance of every nation wins nothing: someone must be left outside.
    expect(concordWinners(s, { england: 10, france: 30, spain: 20 }, 0.5)).toBeNull();
  });

  it('a game ended otherwise names its single winner, or none', () => {
    const s = ending({ england: 5000 });
    checkVictory(s, { kind: 'round' });
    expect(s.gameOver?.winners).toEqual([s.gameOver!.winner]);
    const t = game();
    ok(t, 'england', { type: 'retire' });
    expect(t.gameOver?.winners).toEqual([]);
  });
});

void (null as unknown as Unit);
