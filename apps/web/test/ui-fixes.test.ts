import { describe, expect, it } from 'vitest';
import { createGame, getScenario, gridOf, newGameOptions, type Colony } from '@cc/engine';
import { closedWorkAreaMessage } from '../src/ui/colony.js';
import { playablePeoplesForMap } from '../src/ui/newgame.js';

describe('closedWorkAreaMessage', () => {
  it('reports the ring gate for a closed ring-2 tile on hex maps and null for open ring-1 tiles', () => {
    const state = createGame({
      seed: 1,
      mapSize: 'medium',
      scenario: 'vinland',
      map: 'north-east-hex',
      nations: ['norse'],
      humans: ['norse'],
    });
    const grid = gridOf(state);
    // Construct a minimal size-1 colony in the middle of the map (openRings = 1, workReach = 2).
    const cx = Math.floor(state.map.width / 2);
    const cy = Math.floor(state.map.height / 2);
    const colony = {
      id: 'c-test',
      name: 'Test',
      owner: 'norse',
      x: cx,
      y: cy,
      buildings: { docks: 0 },
      goods: {},
    } as unknown as Colony;

    const ring1Offsets = grid.withinOffsets(cx, cy, 1);
    const ring2Offsets = grid.withinOffsets(cx, cy, 2);
    let r1: [number, number] | undefined;
    let r2: [number, number] | undefined;
    for (let k = 0; k < ring1Offsets.length; k += 2) {
      const x = cx + ring1Offsets[k];
      const y = cy + ring1Offsets[k + 1];
      if (grid.distance(cx, cy, x, y) === 1) { r1 = [x, y]; break; }
    }
    for (let k = 0; k < ring2Offsets.length; k += 2) {
      const x = cx + ring2Offsets[k];
      const y = cy + ring2Offsets[k + 1];
      if (grid.distance(cx, cy, x, y) === 2) { r2 = [x, y]; break; }
    }

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(closedWorkAreaMessage(state, colony, r1![0], r1![1])).toBeNull();
    expect(closedWorkAreaMessage(state, colony, r2![0], r2![1])).toBe('Ring 2 opens at size 5.');
    expect(closedWorkAreaMessage(state, colony, cx, cy)).toBe("That tile is outside the colony's work area.");
  });
});

describe('playablePeoplesForMap', () => {
  it('filters out playable peoples absent from the selected stored map', () => {
    const vinland = getScenario('vinland')!;
    const options = newGameOptions(vinland);

    const onNorthEast = playablePeoplesForMap(vinland, options.peoples, 'north-east-hex').map((p) => p.id);
    const onAtlantic = playablePeoplesForMap(vinland, options.peoples, 'vinland-atlantic').map((p) => p.id);
    const onGenerated = playablePeoplesForMap(vinland, options.peoples, '').map((p) => p.id);

    expect(onNorthEast).toContain('haudenosaunee');
    expect(onAtlantic).not.toContain('haudenosaunee');
    expect(onAtlantic.length).toBeGreaterThan(0);
    expect(onGenerated).toEqual(options.peoples.map((p) => p.id));
  });
});
