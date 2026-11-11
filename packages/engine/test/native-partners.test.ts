/**
 * Beta 2, step 0 (docs/design/native-partners.md, section 5): a people as a treaty party, read
 * through the party helpers; the standing record per nation and people (N3); native rules as
 * scenario data (`peoples.rules`) with switches for burial grounds and surrender; land's reach per
 * settlement kind (N6); and the five fixes of today's native rules.
 */
import { describe, expect, it } from 'vitest';
import './mechanics-variants.js';
import {
  addTreaty,
  AMERICAS,
  applyCommand,
  buyLand,
  CARIBBEAN,
  gridOf,
  landPrice,
  joinCongress,
  learnSkill,
  modifiers,
  nationOf,
  nativeLandOwner,
  UNIT_TYPES,
  player,
  createUnit,
  isWater,
  NATIVE_RULES,
  nativeRulesIn,
  nativeRulesOf,
  neighbours,
  processNatives,
  registerScenario,
  removeUnit,
  takeLand,
  tensionLabel,
  tensionSeverity,
  tileAt,
  type Scenario,
  type Settlement,
  allTreaties,
  bound,
  boundPeople,
  createGame,
  describeTreaty,
  deserialize,
  endTreaty,
  nationParty,
  partyIsNation,
  partyIsPeople,
  partyName,
  peopleParty,
  sameParty,
  serialize,
  treatyName,
  treatyNations,
  treatyPeoples,
  withPeople,
  type GameState,
  type NationId,
} from '../src/index.js';
import { resolveRumour } from '../src/rumours.js';

function game(seed = 42, humans: NationId[] = ['england']): GameState {
  return createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans });
}

describe('a people as a treaty party (N1)', () => {
  it('reads parties through the helpers', () => {
    const nation = nationParty('france');
    const people = peopleParty('arawak');
    expect(partyIsNation(nation)).toBe(true);
    expect(partyIsPeople(nation)).toBe(false);
    expect(partyIsPeople(people)).toBe(true);
    expect(partyIsNation(people)).toBe(false);
    expect(sameParty(people, peopleParty('arawak'))).toBe(true);
    expect(sameParty(people, peopleParty('sioux'))).toBe(false);
    const s = game();
    expect(partyName(s, nation)).toBe('France');
    expect(partyName(s, people)).toBe('the Arawak');
  });

  it('binds one nation and one people, and European treaty code skips the people', () => {
    const s = game();
    s.turn = 30;
    const t = addTreaty(s, 'people-trade', [nationParty('france'), peopleParty('arawak')]);
    expect(t).toMatchObject({ id: 't1', kind: 'people-trade', parties: [{ kind: 'nation', id: 'france' }, { kind: 'people', id: 'arawak' }] });
    expect(treatyNations(t)).toEqual(['france']);
    expect(treatyPeoples(t)).toEqual(['arawak']);
    expect(bound(t, 'france')).toBe(true);
    expect(bound(t, 'england')).toBe(false);
    expect(boundPeople(t, 'arawak')).toBe(true);
    expect(boundPeople(t, 'sioux')).toBe(false);
    expect(withPeople(t)).toBe(true);
    expect(treatyName(t)).toBe('Trade treaty');
    expect(describeTreaty(s, t)).toMatch(/^France and the Arawak, since /);
    // A European treaty still takes bare nation ids, and has no people.
    const trade = addTreaty(s, 'trade', ['england', 'france']);
    expect(withPeople(trade)).toBe(false);
    expect(treatyPeoples(trade)).toEqual([]);
    s.turn = 40;
    endTreaty(s, t, 'cancelled', 'france');
    expect(describeTreaty(s, t)).toMatch(/^France and the Arawak, .* to .*, cancelled by France$/);
    // The record stays a plain JSON tree.
    const back = deserialize(serialize(s));
    expect(allTreaties(back)).toEqual(allTreaties(s));
    expect(serialize(back)).toBe(serialize(s));
  });

  it('names every kind of treaty with a people', () => {
    const s = game();
    const names = (['people-trade', 'land-use', 'exchange', 'defence'] as const).map((k) => treatyName(addTreaty(s, k, [nationParty('england'), peopleParty('sioux')])));
    expect(names).toEqual(['Trade treaty', 'Land use', 'Cultural exchange', 'Mutual defence']);
  });
});

function landBeside(s: GameState, x: number, y: number): { x: number; y: number } {
  const n = neighbours(s, x, y).find(
    (p) => !isWater(tileAt(s, p.x, p.y)) && !Object.values(s.colonies).some((c) => c.x === p.x && c.y === p.y) && !Object.values(s.settlements).some((o) => o.x === p.x && o.y === p.y),
  );
  if (!n) throw new Error('no land');
  return n;
}

const tribeOf = (s: GameState, st: Settlement) => s.tribes.find((t) => t.id === st.tribe)!;

/** A hidden copy of the Americas with other native rules, for these tests. */
const RULES_SCENARIO: Scenario = {
  ...AMERICAS,
  id: 'test-native-rules',
  name: 'test-native-rules',
  hidden: true,
  peoples: { ...AMERICAS.peoples, rules: { tension: { war: 500 }, braveChances: { gift: 0.5 }, firstBraveAfter: 9 } },
};
registerScenario(RULES_SCENARIO);

describe('native rules as scenario data (peoples.rules)', () => {
  it('are the engine defaults in the Americas and the Caribbean', () => {
    expect(nativeRulesOf(game())).toBe(NATIVE_RULES);
    expect(nativeRulesIn(CARIBBEAN)).toBe(NATIVE_RULES);
    expect(NATIVE_RULES.tension).toEqual({ content: 200, uneasy: 300, angry: 600, war: 800 });
  });

  it('merge a scenario override over the defaults, the tables field by field', () => {
    const rules = nativeRulesIn(RULES_SCENARIO);
    expect(rules.tension).toEqual({ ...NATIVE_RULES.tension, war: 500 });
    expect(rules.braveChances).toEqual({ ...NATIVE_RULES.braveChances, gift: 0.5 });
    expect(rules.firstBraveAfter).toBe(9);
    expect(rules.maxBraves).toBe(NATIVE_RULES.maxBraves);
  });

  it('are what the engine reads: a new map, and war at the scenario threshold', () => {
    const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], scenario: 'test-native-rules' });
    for (const st of Object.values(s.settlements)) expect(st.braveTimer).toBe(9);
    const st = Object.values(s.settlements)[0];
    st.tension.england = 560;
    processNatives(s);
    expect(tribeOf(s, st).stance.england).toBe('war');
    const americas = game();
    const other = Object.values(americas.settlements)[0];
    other.tension.england = 560;
    processNatives(americas);
    expect(tribeOf(americas, other).stance.england).not.toBe('war');
  });
});

describe('switches for burial grounds and surrender (framework row 23)', () => {
  it('burial grounds: on in the Americas and the Caribbean, never drawn when off', () => {
    expect(AMERICAS.mechanics.burialGrounds).toBe(true);
    expect(CARIBBEAN.mechanics.burialGrounds).toBe(true);
    const s = createGame({ seed: 3, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], difficulty: 'viceroy', scenario: 'test-no-burial-grounds' });
    const st = Object.values(s.settlements)[0];
    const at = landBeside(s, st.x, st.y);
    for (let i = 0; i < 1500; i++) {
      const u = createUnit(s, 'england', 'freeColonist', { kind: 'map', ...at });
      resolveRumour(s, u);
      removeUnit(s, u.id);
    }
    expect(s.tribes.some((t) => t.burial?.length)).toBe(false);
  });

  it('surrender: on in the Americas and the Caribbean; when off, a burned capital never brings it', () => {
    expect(AMERICAS.mechanics.surrender).toBe(true);
    expect(CARIBBEAN.mechanics.surrender).toBe(true);
    let burned = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame({ seed, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], scenario: 'test-no-surrender' });
      const capital = Object.values(s.settlements).find((st) => st.capital && Object.values(s.settlements).some((o) => o.tribe === st.tribe && !o.capital));
      if (!capital) continue;
      capital.defenders = 1;
      const spot = landBeside(s, capital.x, capital.y);
      let guard = 0;
      while (s.settlements[capital.id] && guard++ < 50) {
        const art = createUnit(s, 'england', 'artillery', { kind: 'map', ...spot });
        art.moves = 3;
        applyCommand(s, { type: 'attack', unitId: art.id, target: { settlementId: capital.id } });
      }
      if (s.settlements[capital.id]) continue;
      burned++;
      expect(tribeOf(s, capital).submitted).toBeUndefined();
    }
    expect(burned).toBeGreaterThan(2);
  });
});

/** A hidden copy of the Americas whose every settlement's land reaches two tiles. */
const WIDE: Scenario = {
  ...AMERICAS,
  id: 'test-wide-land',
  name: 'test-wide-land',
  hidden: true,
  peoples: {
    ...AMERICAS.peoples,
    settlements: Object.fromEntries(Object.entries(AMERICAS.peoples.settlements).map(([k, v]) => [k, { ...v, landRadius: 2 }])),
  },
};
registerScenario(WIDE);

describe("native land's reach (N6, fix a)", () => {
  /** A land tile exactly `d` tiles from a settlement and further from every other one. */
  function tileAtDistance(s: GameState, d: number): { st: Settlement; x: number; y: number } {
    const grid = gridOf(s);
    for (const st of Object.values(s.settlements)) {
      for (let i = 0; i < s.map.tiles.length; i++) {
        const x = i % s.map.width;
        const y = Math.floor(i / s.map.width);
        if (grid.distance(st.x, st.y, x, y) !== d || isWater(tileAt(s, x, y))) continue;
        if (Object.values(s.settlements).some((o) => o !== st && grid.distance(o.x, o.y, x, y) <= d)) continue;
        return { st, x, y };
      }
    }
    throw new Error('no tile');
  }

  it('is one tile in the Americas and the Caribbean (landRadius absent)', () => {
    expect(Object.values(AMERICAS.peoples.settlements).every((k) => (k!.landRadius ?? 1) === 1)).toBe(true);
    expect(Object.values(CARIBBEAN.peoples.settlements).every((k) => (k!.landRadius ?? 1) === 1)).toBe(true);
    const s = game();
    const near = tileAtDistance(s, 1);
    expect(nativeLandOwner(s, near.x, near.y)).toBe(near.st);
    const far = tileAtDistance(s, 2);
    expect(nativeLandOwner(s, far.x, far.y)).toBeUndefined();
    expect(landPrice(s, 'england', far.x, far.y)).toBe(0);
  });

  it('follows the settlement kind: with landRadius 2 the second ring is the people\'s, to buy', () => {
    const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], scenario: 'test-wide-land' });
    const far = tileAtDistance(s, 2);
    expect(nativeLandOwner(s, far.x, far.y)).toBe(far.st);
    expect(landPrice(s, 'england', far.x, far.y)).toBeGreaterThan(0);
    const beyond = tileAtDistance(s, 3);
    expect(nativeLandOwner(s, beyond.x, beyond.y)).toBeUndefined();
    // A bought tile is nobody's.
    player(s, 'england').gold = 10_000;
    buyLand(s, 'england', far.x, far.y);
    expect(nativeLandOwner(s, far.x, far.y)).toBeUndefined();
  });

  it('gives a tile within reach of two settlements to the nearer one', () => {
    const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], scenario: 'test-wide-land' });
    const grid = gridOf(s);
    for (let i = 0; i < s.map.tiles.length; i++) {
      const x = i % s.map.width;
      const y = Math.floor(i / s.map.width);
      const owner = nativeLandOwner(s, x, y);
      if (!owner) continue;
      const d = grid.distance(owner.x, owner.y, x, y);
      expect(d).toBeLessThanOrEqual(2);
      expect(Object.values(s.settlements).every((o) => grid.distance(o.x, o.y, x, y) >= d)).toBe(true);
    }
  });
});

describe("France's teaching as a modifier (fix d)", () => {
  /** A petty criminal of `nation` next to a settlement that still teaches. */
  function criminal(s: GameState, nation: NationId) {
    const st = Object.values(s.settlements).find((o) => o.skill)!;
    const u = createUnit(s, nation, 'pettyCriminal', { kind: 'map', ...landBeside(s, st.x, st.y) });
    u.moves = 1;
    return { st, u };
  }

  it('is data: France holds the nativesTeach modifier in both scenarios, and the text still says so', () => {
    for (const scenario of [AMERICAS, CARIBBEAN]) {
      const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['england'], scenario: scenario.id });
      expect(modifiers(s, 'france', 'nativesTeach')).toEqual([{ hook: 'nativesTeach', units: ['pettyCriminal'] }]);
      expect(modifiers(s, 'england', 'nativesTeach')).toEqual([]);
      expect(nationOf(s, 'france').bonus.text).toMatch(/teach more readily/);
    }
  });

  it('lets a French petty criminal learn, and nobody else\'s', () => {
    const s = createGame({ seed: 42, mapSize: 'small', nations: ['england', 'france'], humans: ['england', 'france'] });
    const french = criminal(s, 'france');
    learnSkill(s, french.u.id, french.st.id);
    expect(UNIT_TYPES[s.units[french.u.id].type].skill).toBeGreaterThan(0);
    const english = criminal(s, 'england');
    expect(() => learnSkill(s, english.u.id, english.st.id)).toThrow(/will not teach a petty criminal/);
  });
});

describe('mood labels at the real thresholds (fix b)', () => {
  it('change word where the braves change what they do', () => {
    const { content, uneasy, angry, war } = NATIVE_RULES.tension;
    expect(tensionLabel(0)).toBe('content');
    expect(tensionLabel(content - 1)).toBe('content');
    expect(tensionLabel(content)).toBe('wary');
    expect(tensionLabel(uneasy - 1)).toBe('wary');
    // Demands for tribute from 300.
    expect(tensionLabel(uneasy)).toBe('uneasy');
    expect(tensionLabel(angry - 1)).toBe('uneasy');
    // Attacks from 600.
    expect(tensionLabel(angry)).toBe('angry');
    expect(tensionLabel(war - 1)).toBe('angry');
    // War from 800.
    expect(tensionLabel(war)).toBe('furious');
    expect([tensionSeverity(uneasy - 1), tensionSeverity(uneasy), tensionSeverity(angry)]).toEqual(['good', 'warn', 'bad']);
  });

  it('follow a scenario\'s thresholds', () => {
    const tension = nativeRulesIn(RULES_SCENARIO).tension;
    expect(tensionLabel(550)).toBe('uneasy');
    expect(tensionLabel(550, tension)).toBe('furious');
  });

  it('name the mood in the land-taking message', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const at = landBeside(s, st.x, st.y);
    st.tension.england = 200;
    // Conquistador: 250 more, so 450: braves demand tribute but do not yet attack.
    expect(takeLand(s, 'england', at.x, at.y)).toMatch(/are uneasy\.$/);
  });
});

describe("Pocahontas's peace holds after a desecrated burial ground (fix e)", () => {
  it('forgives the burial ground, so the people stays at peace', () => {
    const s = game();
    const st = Object.values(s.settlements)[0];
    const tribe = tribeOf(s, st);
    tribe.burial = ['england', 'france'];
    tribe.stance.england = 'war';
    tribe.stance.france = 'war';
    for (const o of Object.values(s.settlements)) if (o.tribe === st.tribe) o.tension.england = o.tension.france = 1000;
    joinCongress(s, player(s, 'england'), 'pocahontas');
    expect(tribe.stance.england).toBe('peace');
    expect(tribe.burial).toEqual(['france']);
    for (let i = 0; i < 5; i++) processNatives(s);
    expect(tribe.stance.england).toBe('peace');
    expect(st.tension.england).toBeLessThan(NATIVE_RULES.tension.war);
    // Only the nation that gained Pocahontas is forgiven.
    expect(tribe.stance.france).toBe('war');
  });

  it('leaves no empty burial list behind', () => {
    const s = game();
    const tribe = s.tribes[0];
    tribe.burial = ['england'];
    joinCongress(s, player(s, 'england'), 'pocahontas');
    expect(tribe.burial).toBeUndefined();
    expect(serialize(deserialize(serialize(s)))).toBe(serialize(s));
  });
});
