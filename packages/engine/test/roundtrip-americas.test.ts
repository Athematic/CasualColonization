import { describe, expect, it } from 'vitest';
import { compare, webConfig } from './roundtrip.js';

describe('save and load do not change a game: the Americas', () => {
  it('events, seed 7', () => {
    expect(compare(webConfig(7, 'americas', true), 60)).toBeNull();
  }, 120_000);
  it('no events, seed 21', () => {
    expect(compare(webConfig(21, 'americas', false), 60)).toBeNull();
  }, 120_000);
});
