/** Which coast-style pieces a tile needs from its neighbours; shared by coast bands and terrain transitions. */

/**
 * Which quarter-turned coast pieces a water tile needs, from its eight neighbours (`land[i]` for
 * DIRS[i]). Pieces point north (edge), north and west (inner) or north-west (outer) unturned.
 */
export function coastPieces(land: readonly boolean[], hasInner: boolean): { piece: 'edge' | 'inner' | 'outer'; turns: number }[] {
  const out: { piece: 'edge' | 'inner' | 'outer'; turns: number }[] = [];
  const side = (k: number) => land[(2 * k) % 8];
  const corner = (k: number) => land[(2 * k + 7) % 8];
  const covered = [false, false, false, false];
  if (hasInner) {
    for (let k = 0; k < 4; k++) {
      const prev = (k + 3) % 4;
      if (side(k) && side(prev)) {
        out.push({ piece: 'inner', turns: k });
        covered[k] = covered[prev] = true;
      }
    }
  }
  for (let k = 0; k < 4; k++) if (side(k) && !covered[k]) out.push({ piece: 'edge', turns: k });
  for (let k = 0; k < 4; k++) if (corner(k) && !side(k) && !side((k + 3) % 4)) out.push({ piece: 'outer', turns: k });
  return out;
}
