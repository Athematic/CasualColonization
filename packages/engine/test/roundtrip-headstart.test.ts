import { describe, expect, it } from 'vitest';
import { compare, webConfig } from './roundtrip.js';

describe('save and load do not change a game: head starts', () => {
  it('americas head start to 30, seed 3', () => {
    expect(compare(webConfig(3, 'americas', true), 10, 30)).toBeNull();
  }, 120_000);
  it('caribbean head start to 20, seed 5', () => {
    expect(compare(webConfig(5, 'caribbean', true), 10, 20)).toBeNull();
  }, 120_000);
});
