/**
 * Optional timing of the turn pipeline, for `npm run bench`. Off by default: each phase then
 * costs one boolean check. Like telemetry.ts, it never touches the game state, so turning it on
 * cannot change a game.
 */

/** Total time and calls of one phase. */
export interface PerfPhase {
  ms: number;
  calls: number;
}

let enabled = false;
const phases = new Map<string, PerfPhase>();

/** Turns timing on or off; turning it on clears earlier totals. */
export function setPerf(on: boolean): void {
  enabled = on;
  if (on) phases.clear();
}

/** The start time of a phase, or 0 when timing is off. */
export function perfStart(): number {
  return enabled ? performance.now() : 0;
}

/** Adds the time since `start` to a phase. */
export function perfEnd(name: string, start: number): void {
  if (!enabled) return;
  const p = phases.get(name);
  const ms = performance.now() - start;
  if (p) {
    p.ms += ms;
    p.calls++;
  } else phases.set(name, { ms, calls: 1 });
}

/** The totals so far, slowest first. */
export function perfReport(): [string, PerfPhase][] {
  return [...phases.entries()].sort((a, b) => b[1].ms - a[1].ms);
}
