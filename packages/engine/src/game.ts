import { applyCommand, type Command, type CommandResult } from './commands.js';
import { initialMarket, randomImmigrant } from './europe.js';
import { placeOnMap } from './movement.js';
import { createUnit, message, reveal } from './queries.js';
import { NATIONS, TRIBE_ORDER, type NationId } from './rules/nations.js';
import { DEFAULT_DIFFICULTY, DIFFICULTY, resolveDifficulty } from './rules/difficulty.js';
import { beginPlayerTurn, runAiUntilHuman } from './turn.js';
import type { GameConfig, GameState, Player } from './types.js';
import { offerFathers } from './fathers.js';
import { createWorld } from './world.js';
import { entryPoints } from './mapgen.js';

export const SAVE_VERSION = 2;

export function createGame(config: GameConfig): GameState {
  if (config.nations.length < 1 || config.nations.length > 8) throw new Error('Between 1 and 8 nations can take part.');
  if (new Set(config.nations).size !== config.nations.length) throw new Error('Each nation can only take part once.');
  for (const h of config.humans) if (!config.nations.includes(h)) throw new Error(`${h} is not taking part.`);

  const rngHolder = { rng: config.seed | 0 };
  const world = createWorld(rngHolder, config);
  const s: GameState = {
    version: SAVE_VERSION,
    config,
    turn: 0,
    current: 0,
    rng: rngHolder.rng,
    nextId: 1,
    map: world.map,
    players: [],
    units: {},
    colonies: {},
    tribes: TRIBE_ORDER.map((id) => ({ id, stance: {} })),
    settlements: Object.fromEntries(world.settlements.map((st) => [st.id, st])),
    messages: [],
    difficulty: resolveDifficulty(config.difficulty),
  };

  const entries = entryPoints(s.map, config.nations.length, world.entryRows, world.entrySide);
  config.nations.forEach((nation, i) => {
    const entry = entries[i];
    const p = newPlayer(s, nation, config.humans.includes(nation), entry);
    if (!p.human) p.ai = config.ai?.[nation] ?? 'naive';
    // The difficulty sets the economics of the people's nations, also while the computer plays
    // them during a head start; other computer players stay at Conquistador (see rules/difficulty.ts).
    if (p.human || config.headStart?.humans.includes(nation) || config.difficultyForAll) {
      p.difficulty = s.difficulty;
      const rules = DIFFICULTY[s.difficulty!];
      p.gold = rules.startingGold;
      p.crossesRequired = Math.round(p.crossesRequired * rules.crosses);
    }
    s.players.push(p);
    p.recruitPool = [randomImmigrant(s), randomImmigrant(s), randomImmigrant(s)];
    offerFathers(s, p);
    reveal(s, nation, entry.x, entry.y, 1);
    startingUnits(s, nation, entry);
    const heading = world.entrySide === 'west' ? 'east' : 'west';
    message(s, `Your Majesty's expedition for ${NATIONS[nation].name} has reached the New World. Sail ${heading} to find land!`, nation, entry);
  });

  beginPlayerTurn(s, s.players[0]);
  runAiUntilHuman(s);
  return s;
}

export function newPlayer(s: GameState, nation: NationId, human: boolean, entry: { x: number; y: number }): Player {
  return {
    id: nation,
    human,
    gold: 1000,
    tax: 0,
    market: initialMarket(),
    crosses: 0,
    crossesRequired: 30,
    recruitPool: [],
    recruited: 0,
    explored: new Array(s.map.width * s.map.height).fill(0),
    entry,
    stance: {},
    coloniesFounded: 0,
    bells: 0,
    fathers: [],
    fatherOffer: {},
    currentFather: null,
    fatherBells: 0,
    boycotts: {},
    pendingTax: null,
    independence: 'none',
    ref: { regulars: 0, dragoons: 0, artillery: 0, menOfWar: 0 },
    warSince: {},
  };
}

function startingUnits(s: GameState, nation: NationId, at: { x: number; y: number }): void {
  const ship = createUnit(s, nation, 'caravel', { kind: 'map', x: at.x, y: at.y });
  placeOnMap(s, ship, at.x, at.y);
  const aboard = { kind: 'carrier' as const, carrierId: ship.id };
  const soldier = createUnit(s, nation, 'veteranSoldier', aboard);
  soldier.role = 'soldier';
  const pioneer = createUnit(s, nation, 'hardyPioneer', aboard);
  pioneer.role = 'pioneer';
  pioneer.tools = 60;
  for (const u of [soldier, pioneer]) u.state = 'sentry';
  if (nation === 'sweden') createUnit(s, nation, 'expertLumberjack', { kind: 'europe' });
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): GameState {
  return migrate(JSON.parse(json));
}

/** Brings saves from older versions up to date. */
export function migrate(raw: { version: number }): GameState {
  const s = raw as GameState;
  if (raw.version === 1) {
    for (const p of s.players) {
      const fresh = newPlayer(s, p.id, p.human, p.entry);
      for (const [k, v] of Object.entries(fresh)) if (!(k in p)) (p as unknown as Record<string, unknown>)[k] = v;
      offerFathers(s, p);
    }
    for (const c of Object.values(s.colonies)) {
      c.exports = c.exports ?? {};
      c.buildings.schoolhouse = c.buildings.schoolhouse ?? 0;
      c.buildings.customHouse = c.buildings.customHouse ?? 0;
    }
    for (const st of Object.values(s.settlements)) st.tension = st.tension ?? {};
    s.version = 2;
  }
  if (s.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${s.version}.`);
  // Saves from before difficulty levels played by the standard rules.
  s.difficulty = s.difficulty ?? DEFAULT_DIFFICULTY;
  return s;
}

type Listener = (state: GameState) => void;

/** Owns a game state, applies commands and notifies listeners (renderers, UI) of changes. */
export class Game {
  private listeners = new Set<Listener>();

  constructor(public state: GameState) {}

  static create(config: GameConfig): Game {
    return new Game(createGame(config));
  }

  dispatch(cmd: Command): CommandResult {
    const result = applyCommand(this.state, cmd);
    if (result.ok) this.emit();
    return result;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  get current(): Player {
    return this.state.players[this.state.current];
  }
}
