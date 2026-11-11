import { describe, expect, it } from 'vitest';
import { HEX_FLAT, HEX_POINTY, SQUARE } from '@cc/engine';
import { keyDirection } from '../src/keys.js';

// docs/design/hex-maps.md H6: the numpad without the two directions the orientation lacks, arrows
// only where they name a real direction, the four diagonal keys on every grid.
describe('movement keys', () => {
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'PageUp', 'End', 'PageDown', 'Numpad8', 'Numpad2', 'Numpad4', 'Numpad6', 'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3'];
  const dirs = (grid: typeof SQUARE) => Object.fromEntries(keys.map((k) => [k, keyDirection(grid, k, '')]));

  it('move in eight directions on squares', () => {
    expect(dirs(SQUARE)).toEqual({
      ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e', Home: 'nw', PageUp: 'ne', End: 'sw', PageDown: 'se',
      Numpad8: 'n', Numpad2: 's', Numpad4: 'w', Numpad6: 'e', Numpad7: 'nw', Numpad9: 'ne', Numpad1: 'sw', Numpad3: 'se',
    });
  });

  it('leave out north and south on pointy-top hexes', () => {
    expect(dirs(HEX_POINTY)).toEqual({
      ArrowUp: undefined, ArrowDown: undefined, ArrowLeft: 'w', ArrowRight: 'e', Home: 'nw', PageUp: 'ne', End: 'sw', PageDown: 'se',
      Numpad8: undefined, Numpad2: undefined, Numpad4: 'w', Numpad6: 'e', Numpad7: 'nw', Numpad9: 'ne', Numpad1: 'sw', Numpad3: 'se',
    });
  });

  it('leave out east and west on flat-top hexes', () => {
    expect(dirs(HEX_FLAT)).toEqual({
      ArrowUp: 'n', ArrowDown: 's', ArrowLeft: undefined, ArrowRight: undefined, Home: 'nw', PageUp: 'ne', End: 'sw', PageDown: 'se',
      Numpad8: 'n', Numpad2: 's', Numpad4: undefined, Numpad6: undefined, Numpad7: 'nw', Numpad9: 'ne', Numpad1: 'sw', Numpad3: 'se',
    });
  });

  it('read the key when the code is unknown', () => {
    expect(keyDirection(SQUARE, 'Unidentified', 'ArrowUp')).toBe('n');
    expect(keyDirection(SQUARE, 'KeyQ', 'q')).toBeUndefined();
  });
});
