/**
 * The Treaty record (docs/design/cooperation.md, step 0 and C9): trade agreements and Favoured
 * Nation status are treaties, kept after they end.
 */
import { describe, expect, it } from 'vitest';
import {
  allTreaties,
  cancelFavoured,
  cancelTrade,
  createGame,
  describeTreaty,
  deserialize,
  hasTradeAgreement,
  isFavoured,
  lapseFavoured,
  makeFavoured,
  makeTradeAgreement,
  onWar,
  serialize,
  treatiesInForce,
  treatyBetween,
  treatyNations,
  type GameState,
} from '../src/index.js';

function game(humans: ('england' | 'france' | 'spain')[] = ['england', 'france']): GameState {
  return createGame({ seed: 3, mapSize: 'small', nations: ['england', 'france', 'spain'], humans });
}

describe('treaties', () => {
  it('are not written until the first one is made', () => {
    const s = game();
    expect(s.treaties).toBeUndefined();
    expect(JSON.parse(serialize(s)).treaties).toBeUndefined();
  });

  it('record trade agreements and Favoured Nation status, with their parties and start', () => {
    const s = game();
    s.turn = 40;
    makeTradeAgreement(s, 'france', 'england');
    const trade = treatyBetween(s, 'trade', 'england', 'france')!;
    expect(trade).toMatchObject({ id: 't1', kind: 'trade', start: 40, parties: [{ kind: 'nation', id: 'england' }, { kind: 'nation', id: 'france' }] });
    expect(trade.end).toBeUndefined();
    s.turn = 50;
    makeFavoured(s, 'england', 'france');
    // Favoured Nation keeps the existing trade agreement and adds its own treaty.
    expect(allTreaties(s).map((t) => t.kind)).toEqual(['trade', 'favoured']);
    expect(isFavoured(s, 'france', 'england')).toBe(true);
    expect(describeTreaty(s, treatyBetween(s, 'favoured', 'england', 'france')!)).toMatch(/^England and France, since /);
  });

  it('keep past treaties with how they ended, and allow many instances over a game', () => {
    const s = game();
    makeFavoured(s, 'england', 'france'); // two people: no thresholds; brings a trade agreement with it
    expect(allTreaties(s).map((t) => t.kind)).toEqual(['trade', 'favoured']);
    s.turn = 10;
    cancelFavoured(s, 'france', 'england');
    expect(treatiesInForce(s)).toEqual([]);
    expect(allTreaties(s).every((t) => t.end?.why === 'cancelled' && t.end.by === 'france' && t.end.turn === 10)).toBe(true);
    expect(describeTreaty(s, allTreaties(s)[1])).toMatch(/cancelled by France$/);
    // Two people can agree again at once: new treaties, the old ones stay as they were.
    makeTradeAgreement(s, 'england', 'france');
    makeTradeAgreement(s, 'england', 'spain');
    s.turn = 12;
    cancelTrade(s, 'england', 'france');
    expect(allTreaties(s).map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(hasTradeAgreement(s, 'england', 'france')).toBe(false);
    expect(hasTradeAgreement(s, 'spain', 'england')).toBe(true);
    expect(treatiesInForce(s, 'england').map((t) => treatyNations(t))).toEqual([['england', 'spain']]);
    expect(treatiesInForce(s, 'france')).toEqual([]);
  });

  it('end by war, and Favoured Nation lapses at independence while the trade agreement stays', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    makeTradeAgreement(s, 'england', 'spain');
    lapseFavoured(s, 'england');
    expect(isFavoured(s, 'england', 'france')).toBe(false);
    expect(hasTradeAgreement(s, 'england', 'france')).toBe(true);
    expect(allTreaties(s)[1].end).toEqual({ turn: s.turn, why: 'lapsed' });
    onWar(s, 'spain', 'england');
    expect(allTreaties(s)[2].end).toEqual({ turn: s.turn, why: 'war', by: 'spain' });
  });

  it('survive saving and loading', () => {
    const s = game();
    makeFavoured(s, 'england', 'france');
    const t = deserialize(serialize(s));
    expect(t.treaties).toEqual(s.treaties);
    expect(isFavoured(t, 'england', 'france')).toBe(true);
  });
});
