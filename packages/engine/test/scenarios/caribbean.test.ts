/**
 * The Caribbean, 1650–1750 (scenarios/caribbean.ts; docs/design/scenario-framework.md, section 7.1
 * and step 8): the proof scenario's own tests. The conformance checks run over it in
 * test/scenarios.test.ts; here: its data, its new council members and its nations' bonuses. A
 * full computer game with every nation (its golden hash, its events in their windows) is in
 * caribbean-game.test.ts, a file of its own so it runs in parallel with these.
 */
import { describe, expect, it } from 'vitest';
import {
  CARIBBEAN,
  CARIBBEAN_CALENDAR,
  createGame,
  createUnit,
  decodeGameCode,
  encodeGameCode,
  getScenario,
  lastTurn,
  maxMoves,
  modifiers,
  nationOf,
  newGameOptions,
  offencePower,
  peopleOf,
  playableScenarios,
  player,
  sightRadius,
  settingsFromConfig,
  term,
  TRIBES,
  yearOf,
  type FatherId,
  type GameState,
  type NationId,
} from '../../src/index.js';
import { rumourOdds } from '../../src/rumours.js';

const ALL: NationId[] = ['england', 'france', 'netherlands', 'spain', 'denmark', 'courland', 'brandenburg', 'scotland', 'malta'];

function game(nations: NationId[] = ['courland', 'england'], seed = 11): GameState {
  return createGame({ seed, mapSize: 'small', nations, humans: [nations[0]], scenario: 'caribbean' });
}

const join = (s: GameState, id: FatherId, nation: NationId): void => void player(s, nation).fathers.push(id);

describe('the Caribbean scenario', () => {
  it('is registered and offered on the New game screen', () => {
    expect(getScenario('caribbean')).toBe(CARIBBEAN);
    expect(playableScenarios().map((sc) => sc.id)).toEqual(expect.arrayContaining(['americas', 'caribbean']));
    const o = newGameOptions(CARIBBEAN);
    expect(o.generated).toBe(true);
    expect(o.maps.map((m) => m.id)).toEqual(['caribbean']);
    expect(o.defaultMap).toBe('caribbean');
    expect(o.firstYear).toBe(1650);
    expect(o.startYears.map((y) => y.year)).toEqual([1675, 1700, 1725]);
    expect(o.victory).toEqual(['Highest score when time runs out']);
    expect(o.nations.real).toEqual(['england', 'france', 'netherlands', 'spain', 'denmark']);
    expect(o.nations.alternative).toEqual(['courland', 'england', 'brandenburg', 'france', 'scotland', 'netherlands', 'malta', 'spain', 'denmark']);
    expect(o.maxNations).toBe(9);
  });

  it('runs from spring 1650 to autumn 1750 in 202 turns', () => {
    expect(lastTurn(CARIBBEAN_CALENDAR)).toBe(201);
    expect(yearOf(0, CARIBBEAN_CALENDAR)).toEqual({ year: 1650, season: 'spring' });
    expect(yearOf(201, CARIBBEAN_CALENDAR)).toEqual({ year: 1750, season: 'autumn' });
  });

  it('has no furs: no furs or coats, no fur trader, no fur experts', () => {
    for (const g of ['furs', 'coats'] as const) expect(CARIBBEAN.goods).not.toContain(g);
    expect(CARIBBEAN.buildings).not.toContain('furTrader');
    for (const u of ['expertFurTrapper', 'masterFurTrader'] as const) expect(CARIBBEAN.units).not.toContain(u);
    const s = game();
    for (const t of CARIBBEAN.peoples.ids) for (const g of peopleOf(s, t).wants) expect(CARIBBEAN.goods).toContain(g);
    // The Tupi's coats become cloth here; the catalogue keeps the Americas' wants.
    expect(peopleOf(s, 'tupi').wants).toEqual(['tradeGoods', 'tools', 'cloth']);
    expect(TRIBES.tupi.wants).toContain('coats');
  });

  it('switches off the REF and independence, keeps taxes and demands, and wins by time alone', () => {
    const m = CARIBBEAN.mechanics;
    expect([m.ref, m.independence]).toEqual([false, false]);
    expect([m.taxes, m.demands]).toEqual([true, true]);
    expect(CARIBBEAN.victory).toEqual([{ id: 'time' }]);
    expect(m.charter && m.charter.base).toBeGreaterThan(100);
    expect(CARIBBEAN.score?.wealth).toBeGreaterThan(1 / 800);
    expect(CARIBBEAN.ai.pace).toBe(0.35);
  });

  it('names its nations, colours, ports and terms', () => {
    const s = game(ALL);
    const colours = ALL.map((n) => nationOf(s, n).color);
    expect(new Set(colours).size).toBe(ALL.length);
    expect(ALL.map((n) => nationOf(s, n).port.name)).toEqual(['London', 'La Rochelle', 'Amsterdam', 'Seville', 'Copenhagen', 'Libau', 'Emden', 'Leith', 'Valletta']);
    expect(nationOf(s, 'malta').name).toBe('the Order of Malta');
    expect(nationOf(s, 'courland').colonyNames[0]).toBe('Jacobusstadt');
    expect(nationOf(s, 'scotland').colonyNames[0]).toBe('New Edinburgh');
    expect(term(s, 'colonyLand')).toBe('the West Indies');
    expect(term(s, 'council')).toBe('Colonial Council');
    expect(s.messages.some((m) => m.text.includes('Courland has reached the West Indies'))).toBe(true);
  });

  it('shares games with all nine nations in a game code', () => {
    const settings = settingsFromConfig({ seed: 5, mapSize: 'medium', nations: ALL, humans: ['malta'], scenario: 'caribbean' });
    const decoded = decodeGameCode(encodeGameCode(settings));
    expect(decoded.ok && decoded.settings).toEqual(settings);
    expect(settings.nations.map((n) => n.nation)).toEqual(ALL);
  });
});

describe('the Caribbean council', () => {
  it('has fourteen Founding Fathers of the period and three new members', () => {
    expect(CARIBBEAN.council.members).toHaveLength(17);
    for (const id of ['henryMorgan', 'williamDampier', 'mariaSibyllaMerian'] as const) expect(CARIBBEAN.council.members).toContain(id);
    for (const id of ['henryHudson', 'hernanCortes', 'simonBolivar', 'pocahontas'] as const) expect(CARIBBEAN.council.members).not.toContain(id);
  });

  it('Henry Morgan: privateers × 1.5', () => {
    const s = game();
    const privateer = createUnit(s, 'courland', 'privateer', { kind: 'europe' });
    const frigate = createUnit(s, 'courland', 'frigate', { kind: 'europe' });
    const [p, f] = [offencePower(s, privateer), offencePower(s, frigate)];
    join(s, 'henryMorgan', 'courland');
    expect(offencePower(s, privateer)).toBe(p * 1.5);
    expect(offencePower(s, frigate)).toBe(f);
  });

  it('William Dampier: ships gain a move', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    const soldier = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'veteranSoldier')!;
    const [moves, land] = [maxMoves(ship, s), maxMoves(soldier, s)];
    join(s, 'williamDampier', 'england');
    expect(maxMoves(ship, s)).toBe(moves + 3);
    expect(maxMoves(soldier, s)).toBe(land);
  });

  it('Maria Sibylla Merian: scouts see further, and travellers\' accounts are twice as likely', () => {
    const s = game();
    const ship = Object.values(s.units).find((u) => u.owner === 'england' && u.type === 'caravel')!;
    const scout = createUnit(s, 'england', 'freeColonist', { kind: 'map', x: ship.loc.kind === 'map' ? ship.loc.x : 1, y: ship.loc.kind === 'map' ? ship.loc.y : 1 });
    scout.role = 'scout';
    const colonist = createUnit(s, 'england', 'freeColonist', { kind: 'europe' });
    const [scoutSight, sight, shipSight] = [sightRadius(scout, s), sightRadius(colonist, s), sightRadius(ship, s)];
    const tales = new Map(rumourOdds(s, scout, undefined)).get('tales')!;
    join(s, 'mariaSibyllaMerian', 'england');
    expect(sightRadius(scout, s)).toBe(scoutSight + 1);
    expect(sightRadius(colonist, s)).toBe(sight);
    expect(sightRadius(ship, s)).toBe(shipSight);
    expect(new Map(rumourOdds(s, scout, undefined)).get('tales')).toBe(tales * 2);
  });
});

describe('the lesser powers\' bonuses', () => {
  it('Courland: a second caravel in Libau from the start', () => {
    const s = game(['courland', 'england']);
    const caravels = (n: NationId) => Object.values(s.units).filter((u) => u.owner === n && u.type === 'caravel');
    expect(caravels('courland')).toHaveLength(2);
    expect(caravels('courland').filter((u) => u.loc.kind === 'europe')).toHaveLength(1);
    expect(caravels('england')).toHaveLength(1);
  });

  it('read their modifiers at the existing hooks', () => {
    const s = game(ALL);
    expect(modifiers(s, 'brandenburg', 'chooseImmigrant')).toHaveLength(1);
    expect(modifiers(s, 'scotland', 'alwaysPromote')).toHaveLength(1);
    expect(modifiers(s, 'malta', 'buildingOutput')).toEqual([{ hook: 'buildingOutput', building: 'church', mul: 1.5 }]);
    expect(modifiers(s, 'spain', 'autoStockade')).toEqual([{ hook: 'autoStockade', minColonists: 4 }]);
    expect(modifiers(s, 'denmark', 'peaceAccepted')).toHaveLength(1);
    expect(modifiers(s, 'england', 'crossesStep')).toEqual([{ hook: 'crossesStep', set: 12 }]);
    // The Americas' Denmark keeps its own bonus.
    expect(modifiers(createGame({ seed: 1, mapSize: 'small', nations: ['denmark'], humans: ['denmark'] }), 'denmark', 'foodToGrow')).toHaveLength(1);
  });
});
