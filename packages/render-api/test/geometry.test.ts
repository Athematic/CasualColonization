import { describe, expect, it } from 'vitest';
import { screenToTile, tileToScreen } from '../src/index.js';

describe('square grid geometry', () => {
  const view = { camera: { x: 10.5, y: 20.5, zoom: 48 }, width: 800, height: 600 };

  it('puts the camera tile in the middle of the view', () => {
    expect(screenToTile(view, 400, 300)).toEqual({ x: 10, y: 20 });
  });

  it('round-trips tile corners', () => {
    for (const [x, y] of [[0, 0], [10, 20], [17, 3]]) {
      const p = tileToScreen(view, x, y);
      expect(screenToTile(view, p.x + 1, p.y + 1)).toEqual({ x, y });
    }
  });
});
