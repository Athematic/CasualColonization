import { applyCommand, type Command, type CommandResult } from './commands.js';
import { initialMarket, randomImmigrant } from './europe.js';
import { placeOnMap } from './movement.js';
import { createUnit, message, reveal } from './queries.js';
import type { PlayerId } from './rules/nations.js';
import { DEFAULT_DIFFICULTY, resolveDifficulty } from './rules/difficulty.js';
import { beginPlayerTurn, runAiUntilHuman } from './turn.js';
import type { GameConfig, GameState, Player } from './types.js';
import { offerFathers } from './fathers.js';
import { createWorld } from './world.js';
import { initRelations } from './relations.js';
import { initCrown } from './crown.js';
import { entryPoints } from './mapgen.js';
import { checkSavedScenario, checkScenarioConfig, difficultyOf, goodsOf, nationOf, peoplesOf, portMarketOf, term } from './scenarios/index.js';
import { modifiers } from './scenarios/modifiers.js';
import { systemsOf, systemsOfId } from './playerkind.js';
import { addPeoplePlayer } from './peopleplayer.js';

/** Version of the save format. 3 is Alpha 0.4 (Favoured Nation); older saves are not converted. */
export const SAVE_VERSION = 3;

/** Shown when a save from before Alpha 0.4 is loaded. */
export const OLD_SAVE_MESSAGE = "Saves from before version 0.4 can't be loaded.";

import { SaveVersionError } from './errors.js';

export { SaveVersionError };

export function createGame(config: GameConfig): GameState {
  const scenario = checkScenarioConfig(config);
  // A game in another scenario records the version it was made with (section 3.14); the Americas
  // (version 1, the default) write nothing, so their saves and hashes stay as they were.
  if (config.scenario && config.scenarioVersion === undefined && scenario.version !== 1) config = { ...config, scenarioVersion: scenario.version };
  if (new Set(config.nations).size !== config.nations.length) throw new Error('Each nation can only take part once.');
  for (const h of config.humans) if (!(config.nations as readonly PlayerId[]).includes(h) && !(config.peoples as readonly PlayerId[] | undefined)?.includes(h)) throw new Error(`${h} is not taking part.`);

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
    tribes: peoplesOf({ config }).map((id) => ({ id, stance: {} })),
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
      const rules = difficultyOf(s, { difficulty: s.difficulty });
      p.gold = rules.startingGold;
      p.crossesRequired = Math.round(p.crossesRequired * rules.crosses);
    }
    initCrown(s, p);
    s.players.push(p);
    p.recruitPool = [randomImmigrant(s), randomImmigrant(s), randomImmigrant(s)];
    offerFathers(s, p);
    reveal(s, nation, entry.x, entry.y, 1);
    if (systemsOf(p).startingCaravel) startingUnits(s, nation, entry);
    const heading = world.entrySide === 'west' ? 'east' : 'west';
    message(s, term(s, 'arrival', { nation: nationOf(s, nation).name, heading }), nation, entry);
  });

  // Peoples playing as nations (native-nations.md T3, T4) take their turns after the nations.
  for (const people of config.peoples ?? []) addPeoplePlayer(s, people, config.humans.includes(people));

  beginPlayerTurn(s, s.players[0]);
  runAiUntilHuman(s);
  return s;
}

export function newPlayer(s: GameState, nation: PlayerId, human: boolean, entry: { x: number; y: number }): Player {
  return {
    id: nation,
    human,
    gold: 1000,
    tax: 0,
    // A playing people has no home port, so no market (playerkind.ts `homePort`): an empty record.
    market: systemsOfId(nation).homePort ? initialMarket(portMarketOf(s, nation), goodsOf(s)) : ({} as Player['market']),
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

function startingUnits(s: GameState, nation: PlayerId, at: { x: number; y: number }): void {
  const ship = createUnit(s, nation, 'caravel', { kind: 'map', x: at.x, y: at.y });
  placeOnMap(s, ship, at.x, at.y);
  const aboard = () => ({ kind: 'carrier' as const, carrierId: ship.id });
  const soldier = createUnit(s, nation, 'veteranSoldier', aboard());
  soldier.role = 'soldier';
  const pioneer = createUnit(s, nation, 'hardyPioneer', aboard());
  pioneer.role = 'pioneer';
  pioneer.tools = 60;
  for (const u of [soldier, pioneer]) u.state = 'sentry';
  for (const m of modifiers(s, nation, 'startingDocks')) for (const type of m.units) createUnit(s, nation, type, { kind: 'europe' });
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): GameState {
  return migrate(JSON.parse(json));
}

/**
 * Checks a loaded save. Alpha 0.4 changed the state for Favoured Nation, and older saves are not
 * converted (agreed in docs/design/favoured-nation.md): they fail with OLD_SAVE_MESSAGE. Saves
 * from a scenario this version does not have, or from a newer version of it, fail too.
 */
export function migrate(raw: { version: number }): GameState {
  const s = raw as GameState;
  if (!s || typeof s.version !== 'number') throw new SaveVersionError('That file is not a Casual Colonization save.');
  if (s.version < SAVE_VERSION) throw new SaveVersionError(OLD_SAVE_MESSAGE);
  if (s.version !== SAVE_VERSION) throw new SaveVersionError(`This save is from a newer version of the game (format ${s.version}).`);
  // Saves from before difficulty levels played by the standard rules.
  s.difficulty = s.difficulty ?? DEFAULT_DIFFICULTY;
  s.relations = s.relations ?? {};
  // A missing scenario means the Americas; an unknown one or a newer version is refused.
  checkSavedScenario(s);
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
