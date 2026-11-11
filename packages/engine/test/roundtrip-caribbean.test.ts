import { describe, expect, it } from 'vitest';
import { compare, webConfig } from './roundtrip.js';

describe('save and load do not change a game: the Caribbean', () => {
  it('events, seed 7', () => {
    expect(compare(webConfig(7, 'caribbean', true), 60)).toBeNull();
  }, 120_000);
  it('no events, seed 21', () => {
    expect(compare(webConfig(21, 'caribbean', false), 60)).toBeNull();
  }, 120_000);
});
