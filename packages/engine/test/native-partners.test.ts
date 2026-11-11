/**
 * Beta 2, step 0 (docs/design/native-partners.md, section 5): a people as a treaty party, read
 * through the party helpers; the standing record per nation and people (N3); native rules as
 * scenario data (`peoples.rules`) with switches for burial grounds and surrender; land's reach per
 * settlement kind (N6); and the five fixes of today's native rules.
 */
import { describe, expect, it } from 'vitest';
import {
  addTreaty,
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
