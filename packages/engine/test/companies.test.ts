/**
 * Chartered companies (docs/design/cooperation.md, Beta 1 step 3): founding, shares, dividends,
 * their place in the score, their neutrality, their own computer play and the computer nations'
 * rules.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_PROFILES,
  AMERICAS,
  applyCommand,
  companies,
  COMPANY_RULES,
  createGame,
  deserialize,
  finalScores,
  foundCompany,
  foundProblem,
  player,
  processCompanies,
  registerScenario,
  scoreBreakdown,
  serialize,
  sharePrice,
  sharesIn,
  startWar,
  type GameState,
  type NationId,
  type Scenario,
} from '../src/index.js';
import { foreignAffairs } from '../src/ai/foreign.js';

const WITH: Scenario = { ...AMERICAS, id: 'test-companies', name: 'test-companies', hidden: true, mechanics: { ...AMERICAS.mechanics, companies: true } };
const EAGER: Scenario = { ...WITH, id: 'test-companies-eager', name: 'test-companies-eager', ai: { ...AMERICAS.ai, cooperation: { foundCompany: 1, buyShares: 1 } } };
registerScenario(WITH);
registerScenario(EAGER);

function game(opts: { humans?: NationId[]; scenario?: string; nations?: NationId[]; seed?: number } = {}): GameState {
  const nations = opts.nations ?? ['england', 'france', 'spain'];
  const s = createGame({
    seed: opts.seed ?? 5,
    mapSize: 'small',
    nations,
    humans: opts.humans ?? nations,
    ai: Object.fromEntries(nations.map((n) => [n, 'creative'])),
    scenario: opts.scenario ?? 'test-companies',
  });
  for (const p of s.players) p.gold = 10_000;
  return s;
}

function ok(s: GameState, nation: NationId, cmd: Parameters<typeof applyCommand>[1]) {
  s.current = s.players.findIndex((p) => p.id === nation);
  const r = applyCommand(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('chartered companies: founding and shares', () => {
  it('are refused when the scenario has none', () => {
    const s = game({ scenario: 'americas' });
    s.config.scenario = undefined;
    expect(foundProblem(s, 'england', 'hudsonsBay')).toMatch(/no chartered companies/);
  });

  it('are founded by a nation that pays the capital, and arrive with a ship and colonists', () => {
    const s = game();
    s.turn = 300;
    ok(s, 'england', { type: 'foundCompany', company: 'hudsonsBay' });
    const co = player(s, 'hudsonsBay');
    expect(co.kind).toBe('company');
    expect(co.gold).toBe(COMPANY_RULES.capital);
    expect(player(s, 'england').gold).toBe(10_000 - COMPANY_RULES.capital);
    expect(sharesIn(co, 'england')).toEqual({ held: COMPANY_RULES.foundingShares, total: COMPANY_RULES.foundingShares });
    const units = Object.values(s.units).filter((u) => u.owner === 'hudsonsBay');
    expect(units.map((u) => u.type).sort()).toEqual(['caravel', 'freeColonist', 'freeColonist', 'veteranSoldier']);
    expect(companies(s).map((p) => p.id)).toEqual(['hudsonsBay']);
    expect(foundProblem(s, 'france', 'hudsonsBay')).toMatch(/already been founded/);
  });

  it('may be chartered only by their historical founders when one takes part, and not too early', () => {
    const s = game();
    s.turn = 300;
    expect(foundProblem(s, 'france', 'hudsonsBay')).toMatch(/Only England/);
    const t = game({ nations: ['france', 'spain'] });
    t.turn = 300;
    expect(foundProblem(t, 'spain', 'hudsonsBay')).toBeNull();
    t.turn = 100; // 1592, before the charter of 1670
    expect(foundProblem(t, 'spain', 'hudsonsBay')).toMatch(/before 1670/);
  });

  it('sell new shares at their worth per share, the gold going to the company', () => {
    const s = game();
    s.turn = 300;
    foundCompany(s, 'england', 'hudsonsBay');
    const co = player(s, 'hudsonsBay');
    const price = sharePrice(s, co);
    expect(price).toBe(Math.max(COMPANY_RULES.sharePrice, Math.round(co.gold / COMPANY_RULES.foundingShares)));
    ok(s, 'france', { type: 'buyShares', company: 'hudsonsBay', count: 5 });
    expect(player(s, 'france').gold).toBe(10_000 - price * 5);
    expect(co.gold).toBe(COMPANY_RULES.capital + price * 5);
    expect(sharesIn(co, 'france')).toEqual({ held: 5, total: 25 });
  });

  it('pay dividends to the shareholders in proportion to their shares', () => {
    const s = game();
    s.turn = 300;
    foundCompany(s, 'england', 'hudsonsBay');
    const co = player(s, 'hudsonsBay');
    co.company!.shares = { england: 30, france: 10 };
    co.gold = COMPANY_RULES.reserve + 4000;
    const [en, fr] = [player(s, 'england').gold, player(s, 'france').gold];
    processCompanies(s);
    expect(player(s, 'england').gold).toBe(en); // not due yet
    s.turn += COMPANY_RULES.dividendEvery;
    processCompanies(s);
    const pool = 4000 * COMPANY_RULES.payout;
    expect(player(s, 'england').gold - en).toBe(pool * 0.75);
    expect(player(s, 'france').gold - fr).toBe(pool * 0.25);
    expect(co.gold).toBe(COMPANY_RULES.reserve + 4000 - pool);
    expect(co.company!.paid).toBe(pool);
  });
});

describe('chartered companies: score, neutrality, play', () => {
  it('cannot win: their score counts for their shareholders', () => {
    const s = game();
    s.turn = 300;
    foundCompany(s, 'england', 'hudsonsBay');
    const co = player(s, 'hudsonsBay');
    co.company!.shares = { england: 10, france: 30 };
    co.gold = 40_000;
    const coScore = scoreBreakdown(s, co).total;
    expect(coScore).toBeGreaterThan(0);
    const scores = finalScores(s);
    expect(scores.hudsonsBay).toBeUndefined();
    const line = scoreBreakdown(s, player(s, 'france')).lines.find((l) => l.key === 'companies')!;
    expect(line.points).toBe(Math.round((coScore * 30) / 40));
    expect(scoreBreakdown(s, player(s, 'spain')).lines.some((l) => l.key === 'companies')).toBe(false);
  });

  it('are neutral, and have no Crown: no war, no taxes, no Congress, no independence', () => {
    const s = game();
    s.turn = 300;
    foundCompany(s, 'england', 'hudsonsBay');
    expect(() => startWar(s, 'france', 'hudsonsBay')).toThrow(/companies/);
    const co = player(s, 'hudsonsBay');
    expect(co.royal).toBeUndefined();
    expect(Object.keys(co.fatherOffer)).toEqual([]);
  });

  it('play their own turns, settle, and survive saving and loading', () => {
    const s = createGame({ seed: 9, mapSize: 'small', nations: ['england', 'france'], humans: [], ai: { england: 'competent', france: 'competent' }, scenario: 'test-companies' });
    for (const p of s.players) p.gold = 10_000;
    while (s.turn < 260) applyCommand(s, { type: 'endTurn' });
    player(s, 'england').gold += COMPANY_RULES.capital;
    foundCompany(s, 'england', 'hudsonsBay');
    let t = deserialize(serialize(s));
    for (let r = 0; r < 40; r++) {
      applyCommand(s, { type: 'endTurn' });
      applyCommand(t, { type: 'endTurn' });
      t = deserialize(serialize(t));
    }
    expect(serialize(t)).toBe(serialize(s));
    const co = player(s, 'hudsonsBay');
    expect(co.pendingTax).toBeNull();
    expect(co.tax).toBe(0);
    expect(Object.values(s.colonies).some((c) => c.owner === 'hudsonsBay')).toBe(true);
  }, 60_000);
});

describe('chartered companies: computer nations', () => {
  function review(s: GameState, nation: NationId): void {
    const i = s.config.nations.indexOf(nation);
    while ((s.turn + i) % 5 !== 0) s.turn++;
    foreignAffairs(s, player(s, nation), AI_PROFILES.creative, 0, 0);
  }

  it('found a company and buy shares, more readily in a scenario that raises the rates', () => {
    let eager = 0;
    let usual = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const scenario of ['test-companies', 'test-companies-eager']) {
        const s = game({ humans: [], scenario, seed });
        s.turn = 300;
        review(s, 'england');
        if (companies(s).length) {
          if (scenario === 'test-companies') usual++;
          else eager++;
        }
      }
    }
    expect(eager).toBe(20);
    expect(usual).toBeLessThan(eager);
    const s = game({ humans: [], scenario: 'test-companies-eager' });
    s.turn = 300;
    review(s, 'england');
    s.turn++;
    // France charters a company of its own first: the West India Company (no Dutch in this game,
    // so any nation may), the first on the scenario's list it may charter.
    review(s, 'france');
    expect(companies(s).map((p) => p.id)).toEqual(['hudsonsBay', 'westIndia']);
    expect(player(s, 'westIndia').company!.founder).toBe('france');
    // Then the Mississippi Company, and then it buys shares in England's.
    for (let i = 0; i < 2; i++) {
      s.turn++;
      review(s, 'france');
    }
    expect(companies(s).map((p) => p.id)).toEqual(['hudsonsBay', 'westIndia', 'mississippi']);
    expect(sharesIn(player(s, 'hudsonsBay'), 'france').held).toBe(5);
  });
});
