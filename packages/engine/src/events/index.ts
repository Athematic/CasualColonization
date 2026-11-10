/**
 * The event framework (0.6, docs/design/events.md): historical and random events, defined as
 * data in event sets (see americas.ts), drawn once per round from their own seeded stream.
 *
 * Every draw comes from `eventRandom` (the game seed hashed with a purpose string), never from
 * `GameState.rng`. With both kinds of event off nothing is drawn and nothing is stored, so such a
 * game is identical to one played without the framework.
 */
import { fail } from '../errors.js';
import { noteHistory } from '../history.js';
import { random } from '../rng.js';
import { formatDate, message, nationTitle, player, unitName, yearOf } from '../queries.js';
import { buildingName } from '../rules/buildings.js';
import { GOOD_DEFS } from '../rules/goods.js';
import { NATIONS, TRIBES, type NationId } from '../rules/nations.js';
import { UNIT_TYPES } from '../rules/units.js';
import { track } from '../telemetry.js';
import type { GameState, Player } from '../types.js';
import { AMERICAS_EVENTS } from './americas.js';
import { applyEffects, atRoundEnd, eventsState, num, valueEffects } from './effects.js';
import type { EventChoice, EventDef, EventKind, EventVars, PendingEvent } from './types.js';

export * from './types.js';
export { eventProductionPct } from './modifiers.js';
export { HISTORICAL_EVENTS, RANDOM_EVENTS, AMERICAS_EVENTS } from './americas.js';
export { applyEffects, valueEffects } from './effects.js';

/** Chance per round that a nation has a random event (if one has a target). */
export const RANDOM_EVENT_RATE = 0.04;
/** Default turns before a random event can strike the same nation again. */
export const RANDOM_COOLDOWN = 40;

// ---------------------------------------------------------------------------
// Registry

const SETS: Record<string, EventDef[]> = { americas: AMERICAS_EVENTS };

/** Registers an event set (a scenario's), replacing one with the same id. */
export function registerEventSet(id: string, defs: EventDef[]): void {
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) throw new Error(`Event ${d.id} is defined twice.`);
    ids.add(d.id);
  }
  SETS[id] = defs;
}

/** The events of the game's set. */
export function eventDefs(s: GameState): EventDef[] {
  return SETS[s.config.eventSet ?? 'americas'] ?? AMERICAS_EVENTS;
}

export function eventDef(s: GameState, id: string): EventDef | undefined {
  return eventDefs(s).find((d) => d.id === id);
}

// ---------------------------------------------------------------------------
// The event stream

const SALT = 0x3e7e_9a15;

/** A seeded stream for one purpose, independent of `GameState.rng` and of every other purpose. */
export function eventStream(s: GameState, purpose: string): () => number {
  let h = 0x811c9dc5 ^ SALT;
  for (const ch of purpose) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  const holder = { rng: (h ^ Math.imul(s.config.seed | 0, 0x9e3779b1)) | 0 };
  random(holder);
  return () => random(holder);
}

/** One seeded number in [0, 1) for a purpose. */
export function eventRandom(s: GameState, purpose: string): number {
  return eventStream(s, purpose)();
}

// ---------------------------------------------------------------------------
// Text

/** Fills the placeholders of an event text: {nation}, {Nation}, {colony}, {tribe}, {good}, {building}, {ship}, {unit}, {amount}, {cost}, {year}. */
export function eventText(s: GameState, text: string, v: EventVars): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) => {
    switch (key) {
      case 'nation':
        return NATIONS[v.nation].name;
      case 'Nation':
        return nationTitle(v.nation);
      case 'colony':
        return (v.colony && s.colonies[v.colony]?.name) || 'the colony';
      case 'tribe':
        return v.tribe ? TRIBES[v.tribe].name : 'the natives';
      case 'good':
        return v.good ? GOOD_DEFS[v.good].name.toLowerCase() : 'goods';
      case 'building': {
        const c = v.colony ? s.colonies[v.colony] : undefined;
        return v.building ? buildingName(v.building, c?.buildings[v.building] ?? 1) : 'building';
      }
      case 'ship': {
        const u = v.ship ? s.units[v.ship] : undefined;
        return u ? unitName(u) : 'ship';
      }
      case 'unit':
        return v.unit ? UNIT_TYPES[v.unit].name : 'colonist';
      case 'amount':
        return String(v.amount ?? 0);
      case 'cost':
        return String(v.cost ?? 0);
      case 'year':
        return String(yearOf(s.turn).year);
      default:
        return all;
    }
  });
}

/** Where on the map the event happened: its colony or ship. */
function eventPlace(s: GameState, v: EventVars): { x: number; y: number } | undefined {
  const c = v.colony ? s.colonies[v.colony] : undefined;
  if (c) return { x: c.x, y: c.y };
  const u = v.ship ? s.units[v.ship] : undefined;
  return u?.loc.kind === 'map' ? { x: u.loc.x, y: u.loc.y } : undefined;
}

// ---------------------------------------------------------------------------
// Switching

export function eventsEnabled(s: GameState, kind: EventKind): boolean {
  return kind === 'historical' ? !!s.config.historicalEvents : !!s.config.randomEvents;
}

/** Switches historical and/or random events on or off during a game (the `setEvents` command). */
export function setEvents(s: GameState, opts: { historical?: boolean; random?: boolean }): string {
  if (opts.historical === undefined && opts.random === undefined) fail('Say which events to switch.');
  const said: string[] = [];
  if (opts.historical !== undefined) {
    s.config.historicalEvents = opts.historical;
    said.push(`Historical events are now ${opts.historical ? 'on' : 'off'}.`);
  }
  if (opts.random !== undefined) {
    s.config.randomEvents = opts.random;
    said.push(`Random events are now ${opts.random ? 'on' : 'off'}.`);
  }
  const text = said.join(' ');
  message(s, text);
  return text;
}

// ---------------------------------------------------------------------------
// Choices

/** A choice's cost in gold for these variables. */
export function choiceCost(c: EventChoice, v: EventVars): number {
  return num(c.cost, v);
}

/** Whether the nation can take a choice now (it can pay for it). */
export function choiceAvailable(s: GameState, c: EventChoice, v: EventVars): boolean {
  return player(s, v.nation).gold >= choiceCost(c, v);
}

/** The pending event choices for a nation, oldest first. */
export function pendingEvents(s: GameState, nation: NationId): PendingEvent[] {
  return (s.events?.pending ?? []).filter((p) => p.vars.nation === nation);
}

/** The labels of a pending event's choices, with placeholders filled, and whether each can be taken. */
export function eventChoices(s: GameState, pending: PendingEvent): { label: string; available: boolean }[] {
  const def = eventDef(s, pending.event);
  return (def?.choices ?? []).map((c) => ({ label: eventText(s, c.label, pending.vars), available: choiceAvailable(s, c, pending.vars) }));
}

/** The title of a pending event, with placeholders filled. */
export function eventTitle(s: GameState, pending: PendingEvent): string {
  const def = eventDef(s, pending.event);
  return def ? eventText(s, def.title, pending.vars) : pending.event;
}

/**
 * The choice a computer player makes: Naive takes the first it can afford; the other levels the
 * one worth most in gold (its `ai` score, or the value of its effects less its cost).
 */
export function aiEventChoice(s: GameState, p: Player, def: EventDef, v: EventVars): number {
  const choices = def.choices ?? [];
  const open = choices.map((c, i) => [c, i] as const).filter(([c]) => choiceAvailable(s, c, v));
  if (!open.length) return fallbackChoice(s, def, v);
  if ((p.ai ?? 'naive') === 'naive') return open[0][1];
  let best = open[0][1];
  let bestValue = -Infinity;
  for (const [c, i] of open) {
    const value = c.ai ? c.ai(s, v) : valueEffects(s, c.effects, v) - choiceCost(c, v);
    if (value > bestValue) {
      bestValue = value;
      best = i;
    }
  }
  return best;
}

/** The choice taken for a person who left it unanswered: the default if affordable, else the first affordable one. */
function fallbackChoice(s: GameState, def: EventDef, v: EventVars): number {
  const choices = def.choices ?? [];
  const d = def.defaultChoice ?? choices.length - 1;
  if (choices[d] && choiceAvailable(s, choices[d], v)) return d;
  const i = choices.findIndex((c) => choiceAvailable(s, c, v));
  return i >= 0 ? i : d;
}

/** Carries out a choice: pays its cost, applies its effects and reports the outcome. */
function resolveChoice(s: GameState, def: EventDef, v: EventVars, index: number, how: 'person' | 'computer' | 'default'): string {
  const choice = def.choices![index];
  const cost = Math.min(choiceCost(choice, v), player(s, v.nation).gold);
  player(s, v.nation).gold -= cost;
  const r = eventStream(s, `choice ${def.id} ${v.nation} ${s.turn}`);
  const extra = applyEffects(s, def.id, choice.effects, v, r);
  const result = [choice.result ? eventText(s, choice.result, v) : '', ...extra.map((t) => eventText(s, t, v))].filter(Boolean).join(' ');
  const label = eventText(s, choice.label, v);
  const text = `${eventText(s, def.title, v)}: ${how === 'default' ? 'no answer was given, so: ' : ''}${label}. ${result}`.trim();
  track(v.nation, `event:choice ${def.id} ${index}`);
  message(s, text, v.nation, eventPlace(s, v));
  if (def.kind === 'random') noteHistory(s, 'event', [v.nation], text, { secret: true, at: eventPlace(s, v) });
  return result || `${label}.`;
}

/** A person answers a pending event (the `answerEvent` command). */
export function answerEvent(s: GameState, nation: NationId, pendingId: string, choice: number): string {
  const ev = s.events;
  const i = ev?.pending.findIndex((p) => p.id === pendingId && p.vars.nation === nation) ?? -1;
  if (!ev || i < 0) fail('There is no such event waiting for an answer.');
  const pending = ev.pending[i];
  const def = eventDef(s, pending.event);
  if (!def?.choices?.[choice]) fail('There is no such choice.');
  if (!choiceAvailable(s, def.choices[choice], pending.vars)) fail(`You cannot afford that: it costs ${choiceCost(def.choices[choice], pending.vars)} gold.`);
  ev.pending.splice(i, 1);
  return resolveChoice(s, def, pending.vars, choice, 'person');
}

// ---------------------------------------------------------------------------
// Firing

/**
 * Fires an event for one nation: picks its target (unless given), applies its effects and either
 * resolves its choice (computer players) or leaves it pending (people). Returns whether it fired.
 */
export function fireEvent(s: GameState, def: EventDef, nation: NationId, given?: EventVars): boolean {
  const p = s.players.find((x) => x.id === nation);
  if (!p || nation === 'crown') return false;
  const r = eventStream(s, `fire ${def.id} ${nation} ${s.turn}`);
  const v = given ? { ...given } : def.target(s, nation, r);
  if (!v) return false;
  if (def.when && !def.when(s, v)) return false;
  if (def.prepare && def.prepare(s, v, r) === false) return false;
  const ev = eventsState(s);
  if (def.kind === 'random') ev.fired[`${def.id}|${nation}`] = s.turn;
  else if (ev.fired[def.id] !== s.turn) {
    // A world event: noted once in the public history, however many nations it touches.
    ev.fired[def.id] = s.turn;
    noteHistory(s, 'event', [], `${eventText(s, def.title, v)} (${formatDate(s.turn)}).`);
  }
  track(nation, `event:${def.id}`);
  const extra = applyEffects(s, def.id, def.effects ?? [], v, r);
  const text = [eventText(s, def.text, v), ...extra.map((t) => eventText(s, t, v))].join(' ');
  const at = eventPlace(s, v);
  if (!def.choices?.length) {
    message(s, `${eventText(s, def.title, v)}: ${text}`, nation, at);
    if (def.kind === 'random') noteHistory(s, 'event', [nation], `${eventText(s, def.title, v)}: ${text}`, { secret: true, at });
    return true;
  }
  if (p.human) {
    const id = `ev${++ev.seq}`;
    ev.pending.push({ id, event: def.id, turn: s.turn, vars: v, text });
    message(s, `${eventText(s, def.title, v)}: ${text} You decide in the turn-start briefing.`, nation, at);
  } else {
    message(s, `${eventText(s, def.title, v)}: ${text}`, nation, at);
    resolveChoice(s, def, v, aiEventChoice(s, p, def, v), 'computer');
  }
  return true;
}

/** Fires a historical (world) event for every nation still taking part. */
function fireWorld(s: GameState, def: EventDef): void {
  for (const p of s.players) fireEvent(s, def, p.id);
  // Marked as fired even if no nation had a target, so it stays once-only.
  eventsState(s).fired[def.id] = s.turn;
}

/** Historical events in their window: each fires once, at the latest in the window's last round. */
function drawHistorical(s: GameState): void {
  const year = yearOf(s.turn).year;
  const nextYear = yearOf(s.turn + 1).year;
  for (const def of eventDefs(s)) {
    if (def.kind !== 'historical' || def.hidden || !def.years) continue;
    if (s.events?.fired[def.id] !== undefined) continue;
    const [from, to] = def.years;
    if (year < from || year > to) continue;
    const last = nextYear > to;
    if (last || eventRandom(s, `historical ${def.id} ${s.turn}`) < (def.chance ?? 0.2)) fireWorld(s, def);
  }
}

/** Random events: each nation with a colony has RANDOM_EVENT_RATE chance of one, picked by weight. */
function drawRandom(s: GameState): void {
  const defs = eventDefs(s).filter((d) => d.kind === 'random' && !d.hidden);
  for (const p of s.players) {
    if (p.id === 'crown' || !Object.values(s.colonies).some((c) => c.owner === p.id)) continue;
    if (eventRandom(s, `random ${s.turn} ${p.id}`) >= RANDOM_EVENT_RATE) continue;
    const options: { def: EventDef; vars: EventVars; weight: number }[] = [];
    for (const def of defs) {
      const last = s.events?.fired[`${def.id}|${p.id}`];
      if (last !== undefined && s.turn - last < (def.cooldown ?? RANDOM_COOLDOWN)) continue;
      const vars = def.target(s, p.id, eventStream(s, `target ${def.id} ${p.id} ${s.turn}`));
      if (!vars || (def.when && !def.when(s, vars))) continue;
      options.push({ def, vars, weight: def.weight ?? 1 });
    }
    const total = options.reduce((n, o) => n + o.weight, 0);
    if (!total) continue;
    let x = eventRandom(s, `random pick ${s.turn} ${p.id}`) * total;
    const pick = options.find((o) => (x -= o.weight) < 0) ?? options[options.length - 1];
    fireEvent(s, pick.def, p.id, pick.vars);
  }
}

/**
 * Once per round, at its end: modifiers that run out, choices left unanswered, follow-ups due,
 * then new historical and random events if they are switched on.
 */
export function processEvents(s: GameState): void {
  atRoundEnd(() => roundEndEvents(s));
}

function roundEndEvents(s: GameState): void {
  const ev = s.events;
  if (ev) {
    // Modifiers that applied for the last time this round.
    const ending = ev.mods.filter((m) => m.until <= s.turn + 1);
    if (ending.length) {
      ev.mods = ev.mods.filter((m) => m.until > s.turn + 1);
      const said = new Set<string>();
      for (const m of ending) {
        const def = eventDef(s, m.source);
        if (!def?.endText) continue;
        const text = eventText(s, def.endText, { nation: m.nation, colony: m.colony });
        if (said.has(`${m.nation}|${text}`)) continue;
        said.add(`${m.nation}|${text}`);
        message(s, text, m.nation);
      }
    }
    // A choice left unanswered for a round takes the default.
    for (const pending of ev.pending.filter((p) => p.turn < s.turn)) {
      ev.pending.splice(ev.pending.indexOf(pending), 1);
      const def = eventDef(s, pending.event);
      if (def?.choices?.length) resolveChoice(s, def, pending.vars, fallbackChoice(s, def, pending.vars), 'default');
    }
    // Follow-ups that are due (dropped if their kind has been switched off).
    const due = ev.queue.filter((q) => q.turn <= s.turn);
    if (due.length) {
      ev.queue = ev.queue.filter((q) => q.turn > s.turn);
      for (const q of due) {
        const def = eventDef(s, q.event);
        if (!def || !eventsEnabled(s, def.kind)) continue;
        // The follow-up picks its own target for the nation (it may have changed since).
        if (q.vars) fireEvent(s, def, q.vars.nation);
        else fireWorld(s, def);
      }
    }
  }
  if (s.config.historicalEvents) drawHistorical(s);
  if (s.config.randomEvents) drawRandom(s);
}
