/**
 * Reads the passive effects that apply to a nation (docs/design/scenario-framework.md, section
 * 4.1): its bonus in the scenario (NationEntry.bonus.modifiers), then its council members'
 * modifiers in the council's order. The engine asks at named hook points (rules/modifiers.ts)
 * instead of checking a father or a nation id.
 *
 * A lookup never draws a random number. The modifiers per player are worked out once and kept
 * outside the state (a WeakMap keyed by the player object), refreshed when the player's list of
 * council members changes, so hot loops such as production stay as fast as the old checks.
 */
import { FATHERS, type FatherId } from '../rules/fathers.js';
import type { Hook, Modifier, ModifierOf } from '../rules/modifiers.js';
import type { PlayerId } from '../rules/nations.js';
import type { GameState, Player } from '../types.js';
import { councilOf, nationEntry, scenarioOf } from './index.js';
import type { Council, MemberEffects } from './types.js';

type ByHook = Partial<Record<Hook, Modifier[]>>;

interface Cached {
  fathers: readonly FatherId[];
  joined: number;
  byHook: ByHook;
}

const CACHE = new WeakMap<Player, Cached>();
const NONE: readonly never[] = [];

/** A council member's effects in a council: the council's own, or the catalogue's. */
export function memberEffects(council: Council | undefined, id: FatherId): MemberEffects {
  return council?.effects?.[id] ?? FATHERS[id] ?? {};
}

function collect(s: GameState, nation: PlayerId, fathers: readonly FatherId[]): ByHook {
  const scenario = scenarioOf(s);
  const all: Modifier[] = [];
  const entry = nation === 'crown' ? undefined : nationEntry(scenario, s.config.rivals, nation);
  if (entry?.bonus.modifiers) all.push(...entry.bonus.modifiers);
  if (fathers.length) {
    // The player's own council (the Congress, or a people's council), in the council's order.
    const council = councilOf(s, nation);
    const members: readonly FatherId[] = council?.members ?? [];
    const ordered = [...members.filter((id) => fathers.includes(id)), ...fathers.filter((id) => !members.includes(id))];
    for (const id of ordered) all.push(...(memberEffects(council, id).modifiers ?? []));
  }
  const byHook: ByHook = {};
  for (const m of all) (byHook[m.hook] ??= []).push(m);
  return byHook;
}

function byHookOf(s: GameState, nation: PlayerId): ByHook {
  const p = s.players.find((q) => q.id === nation);
  if (!p) return collect(s, nation, NONE);
  let c = CACHE.get(p);
  if (!c || c.fathers !== p.fathers || c.joined !== p.fathers.length) {
    c = { fathers: p.fathers, joined: p.fathers.length, byHook: collect(s, nation, p.fathers) };
    CACHE.set(p, c);
  }
  return c.byHook;
}

/** The nation's modifiers at a hook, in order: its bonus, then its council members. */
export function modifiers<H extends Hook>(s: GameState, nation: PlayerId, hook: H): readonly ModifierOf<H>[] {
  return (byHookOf(s, nation)[hook] as ModifierOf<H>[] | undefined) ?? NONE;
}

/** Whether the nation has any modifier at a hook (for hooks that are on or off). */
export function hasModifier(s: GameState, nation: PlayerId, hook: Hook): boolean {
  return modifiers(s, nation, hook).length > 0;
}

/** The product of the `mul` factors (1 when there are none). */
export function mulOf(mods: readonly { mul?: number }[]): number {
  let f = 1;
  for (const m of mods) if (m.mul !== undefined) f *= m.mul;
  return f;
}

/** The sum of numeric `add`s (0 when there are none). */
export function addOf(mods: readonly { add?: number | string }[]): number {
  let n = 0;
  for (const m of mods) if (typeof m.add === 'number') n += m.add;
  return n;
}

/** The last `set` value, or the engine's default. */
export function setOr(mods: readonly { set?: number }[], fallback: number): number {
  let v = fallback;
  for (const m of mods) if (m.set !== undefined) v = m.set;
  return v;
}
