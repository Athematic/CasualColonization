/** Deterministic mulberry32 generator whose state lives in the game state, so saves replay identically. */
export function random(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: { rng: number }, n: number): number {
  return Math.floor(random(s) * n);
}

export function pick<T>(s: { rng: number }, items: readonly T[]): T {
  return items[randInt(s, items.length)];
}

export function weightedPick<T>(s: { rng: number }, items: readonly [T, number][]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = random(s) * total;
  for (const [item, w] of items) {
    r -= w;
    if (r < 0) return item;
  }
  return items[items.length - 1][0];
}
