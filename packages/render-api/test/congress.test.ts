import { describe, expect, it } from 'vitest';
import { CONGRESS_HALL_ASPECT, HALL_BODY, HALL_OVERLAP, HALL_ROWS, hallSpotBox, layoutCongressHall } from '../src/index.js';

describe('Continental Congress hall layout', () => {
  for (const n of [0, 1, 5, 12, 25]) {
    it(`places ${n} fathers inside the frame in join order`, () => {
      const spots = layoutCongressHall(n);
      expect(spots).toHaveLength(n);
      expect(spots.map((s) => s.index)).toEqual([...Array(n).keys()]);
      for (const s of spots) {
        const b = hallSpotBox(s, CONGRESS_HALL_ASPECT * 1000, 1000);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(CONGRESS_HALL_ASPECT * 1000 + 1e-6);
        expect(b.y + b.h).toBeLessThanOrEqual(1000 + 1e-6);
      }
    });
  }

  it('keeps bodies in a row apart (within the overlap tolerance) and rows from the front backwards', () => {
    for (const n of [12, 25]) {
      const spots = layoutCongressHall(n);
      for (let r = 0; r < HALL_ROWS.length; r++) {
        const row = spots.filter((s) => s.row === r).sort((a, b) => a.x - b.x);
        for (let i = 1; i < row.length; i++) {
          const body = row[i]!.w * HALL_BODY;
          expect(row[i]!.x - row[i - 1]!.x).toBeGreaterThanOrEqual(body * (1 - HALL_OVERLAP) - 1e-9);
        }
      }
      // Join order: earlier fathers are in the same or a nearer row; within a row, left to right.
      for (let i = 1; i < n; i++) {
        const a = spots[i - 1]!;
        const b = spots[i]!;
        expect(b.row).toBeGreaterThanOrEqual(a.row);
        if (b.row === a.row) expect(b.x).toBeGreaterThan(a.x);
      }
      // Rows behind are slightly smaller.
      const sizes = [...new Set(spots.map((s) => s.h))];
      expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    }
  });

  it('uses one row for a few fathers and three for a full Congress', () => {
    expect(new Set(layoutCongressHall(5).map((s) => s.row)).size).toBe(1);
    expect(new Set(layoutCongressHall(25).map((s) => s.row)).size).toBe(3);
    // The seat for the next father is the last spot of the longer layout.
    expect(layoutCongressHall(6)).toHaveLength(6);
  });
});
