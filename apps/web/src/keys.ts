import type { Direction, Grid } from '@cc/engine';

/**
 * Movement keys: the arrows, Home/PageUp/End/PageDown and the numpad. On hexes only the keys of the
 * grid's six directions move (docs/design/hex-maps.md H6): pointy-top hexes have no n or s (Up,
 * Down, numpad 8 and 2 do nothing), flat-top hexes no e or w (Left, Right, numpad 4 and 6 do
 * nothing); the four diagonals work on both.
 */
const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e',
  Home: 'nw', PageUp: 'ne', End: 'sw', PageDown: 'se',
  Numpad8: 'n', Numpad2: 's', Numpad4: 'w', Numpad6: 'e', Numpad7: 'nw', Numpad9: 'ne', Numpad1: 'sw', Numpad3: 'se',
};

/** The direction a key (its `code`, else its `key`) moves a unit in on this grid, if any. */
export function keyDirection(grid: Grid, code: string, key: string): Direction | undefined {
  const dir = KEY_DIRS[code] ?? KEY_DIRS[key];
  return dir && grid.directions.some((d) => d.id === dir) ? dir : undefined;
}
