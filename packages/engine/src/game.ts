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
import { initRelations } from './relations.js';
import { initCrown } from './crown.js';
import { entryPoints } from './mapgen.js';

/** Version of the save format. 3 is Alpha 0.4 (Favoured Nation); older saves are not converted. */
export const SAVE_VERSION = 3;

/** Shown when a save from before Alpha 0.4 is loaded. */
export const OLD_SAVE_MESSAGE = "Saves from before version 0.4 can't be loaded.";

/** Thrown by deserialize for a save in a format this version cannot read. */
export class SaveVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveVersionError';
  }
}

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
    relations: {},
  };
  initRelations(s);

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
    initCrown(s, p);
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

/**
 * Checks a loaded save. Alpha 0.4 changed the state for Favoured Nation, and older saves are not
 * converted (agreed in docs/design/favoured-nation.md): they fail with OLD_SAVE_MESSAGE.
 */
export function migrate(raw: { version: number }): GameState {
  const s = raw as GameState;
  if (!s || typeof s.version !== 'number') throw new SaveVersionError('That file is not a Casual Colonization save.');
  if (s.version < SAVE_VERSION) throw new SaveVersionError(OLD_SAVE_MESSAGE);
  if (s.version !== SAVE_VERSION) throw new SaveVersionError(`This save is from a newer version of the game (format ${s.version}).`);
  // Saves from before difficulty levels played by the standard rules.
  s.difficulty = s.difficulty ?? DEFAULT_DIFFICULTY;
  s.relations = s.relations ?? {};
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
