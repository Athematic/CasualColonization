/**
 * Computer-only games for measuring AI levels against each other. Games are seeded and the
 * engine is deterministic, so a tournament always gives the same result for the same options.
 */
import { AI_LEVEL_INFO, type AiLevel } from './ai/profiles.js';
import { isCheated } from './cheats.js';
import { applyCommand } from './commands.js';
import { endStateFeatures, type FeatureCounts } from './features.js';
import { createGame } from './game.js';
import { colonyWorkers } from './queries.js';
import type { DifficultyId } from './rules/difficulty.js';
import type { NationId } from './rules/nations.js';
import { nationSet, scenarioOf, type Rivals } from './scenarios/index.js';
import { finalScores, scoreBreakdown, type ScoreComponent } from './score.js';
import { prosperityParams, prosperityStanding, type ProsperityCondition } from './prosperity.js';
import { setFeatureSink } from './telemetry.js';
import { royalForce } from './independence.js';
import { isFavoured } from './relations.js';
import { alliesOf } from './alliances.js';
import { bound, withPeople } from './treaties.js';
import type { GameState, MapSize, Player } from './types.js';
import { colonyList } from './unitindex.js';

export interface ArenaOptions {
  games: number;
  /** Stop each game after this turn (the game may end sooner). */
  turns: number;
  mapSize: MapSize;
  /** One nation per entry; list a level twice to field it twice. */
  levels: AiLevel[];
  firstSeed?: number;
  /** Stored map id, if the engine has stored maps. */
  map?: string;
  /** Count how often each nation uses each game feature (see features.ts). Off by default. */
  features?: boolean;
  /**
   * Difficulty level. Arena nations are all computers, which normally play at Conquistador
   * economics, so a level given here applies to every nation (`difficultyForAll`), as if each
   * were a person. Missing means Conquistador, the standard rules.
   */
  difficulty?: DifficultyId;
  /** Computer players make no trade or Favoured Nation proposals (`GameConfig.noFavoured`), to measure what the feature brings. */
  noFavoured?: boolean;
  /** Switch historical and random events on (`--events`); arena games run without them by default. */
  events?: boolean;
  /** Play without the colony charter (`--no-charter`); arena games use it by default, like new games. */
  noCharter?: boolean;
  /** Scenario id (`--scenario`); missing means the Americas. Nations rotate over its chosen set. */
  scenario?: string;
  /** Which of the scenario's nation sets to rotate over (`--rivals real`); missing means its default. */
  rivals?: Rivals;
  /**
   * Play on after a War of Independence (`--play-on`, `GameConfig.playOn`): the nation that won or
   * lost it is finished with the score it had then, and the others play on to `turns` or the end of
   * the calendar. Without it the first war won (or lost by every nation) ends the game.
   */
  playOn?: boolean;
}

/**
 * Relations and trade between the European nations, per nation and game. Counted in every arena
 * game (from a few telemetry events), whether or not the full feature audit runs.
 */
export interface RelationsTally {
  /** Trade agreement and Favoured Nation proposals the nation made. */
  proposals: number;
  /** Trade agreements and Favoured Nation statuses the nation entered. */
  agreements: number;
  favoured: number;
  /** Favoured Nation partners at the end of the game. */
  favouredAtEnd: number;
  /** Favoured Nation statuses the nation cancelled (including by declaring war). */
  cancelled: number;
  /** Gold that changed hands at partners' colonies, over all the nation's relations. */
  volume: number;
  /** Units the nation sold at partners' colonies, and in partners' home ports. */
  foreignStopSales: number;
  partnerPortSales: number;
  /** Triangle trades completed: goods bought in one European port and sold in another. */
  triangles: number;
  /** Wars the nation declared, and how many of them on a trade partner or Favoured Nation. */
  wars: number;
  warsOnPartners: number;
  /** Tax raises the nation refused (boycotting a good). */
  taxRefusals: number;
  /** The King's demands for gold made to the nation, paid and refused (crown.ts). */
  demands: number;
  demandsPaid: number;
  demandsRefused: number;
  /** Wars the King declared for the nation (also counted in `wars`). */
  royalWars: number;
  /** Land units the Crown added to the nation's Royal Expeditionary Force over the game. */
  refAdded: number;
  /** Alliances the nation made or joined, left (including by war on an ally), and its allies at the end. */
  alliances: number;
  alliancesLeft: number;
  alliesAtEnd: number;
  /** Wars the nation joined on an ally's side by choice (the defensive pact's wars are not counted). */
  allyWars: number;
  /** Chartered companies the nation founded, shares it bought, and gold it received in dividends. */
  companies: number;
  shares: number;
  dividends: number;
  /** Joint expeditions the nation took part in, and bells its allies' shared bells gave its Congress. */
  expeditions: number;
  sharedBells: number;
  /** Declarations of independence made together with an ally (confederation.ts). */
  confederations: number;
  /**
   * Treaties with native peoples (peopletreaties.ts): made, ended (by either side, breaches
   * included), the nation's breaches of faith, and treaties in force at the end.
   */
  peopleTreaties: number;
  peopleTreatiesEnded: number;
  peopleBreaches: number;
  peopleTreatiesAtEnd: number;
  /** Land use treaties (leases, step 2): made, lapsed for unpaid rent, and the rent paid in gold. */
  leases: number;
  leasesLapsed: number;
  rent: number;
  /** Cultural exchanges (step 3): made, ended, and colonists taught again by a settlement under one. */
  exchanges: number;
  exchangesEnded: number;
  renewedTeachings: number;
  /**
   * Mutual defence pacts (step 4): made, ended, fights of the people's braves for the partner, and
   * wars the pacts brought (the partner drawn in by an attack on its people, or the people going to
   * war for an attack on the partner's colony), counted for the partner.
   */
  defences: number;
  defencesEnded: number;
  defenceFights: number;
  pactWars: number;
}

const TALLY: Record<string, keyof RelationsTally> = {
  'cmd:proposeTrade': 'proposals',
  'cmd:proposeFavoured': 'proposals',
  'diplomacy:trade agreement made': 'agreements',
  'diplomacy:favoured nation made': 'favoured',
  'diplomacy:favoured nation cancelled': 'cancelled',
  'trade:foreign stop sales': 'foreignStopSales',
  'europe:partner port sales': 'partnerPortSales',
  'trade:triangle trade': 'triangles',
  'diplomacy:war started': 'wars',
  'diplomacy:war on a trade partner': 'warsOnPartners',
  'diplomacy:war on a Favoured Nation': 'warsOnPartners',
  'tax:refused (boycott)': 'taxRefusals',
  'crown:demand made': 'demands',
  'crown:demand paid': 'demandsPaid',
  'crown:demand refused': 'demandsRefused',
  'crown:royal war': 'royalWars',
  'crown:ref units added': 'refAdded',
  'diplomacy:alliance made': 'alliances',
  'diplomacy:alliance joined': 'alliances',
  'diplomacy:alliance left': 'alliancesLeft',
  "diplomacy:joined an ally's war": 'allyWars',
  'company:founded': 'companies',
  'company:shares bought': 'shares',
  'company:dividend': 'dividends',
  'alliance:joint expedition': 'expeditions',
  'alliance:bells received': 'sharedBells',
  'independence:confederation': 'confederations',
  'natives:people treaty made': 'peopleTreaties',
  'natives:people treaty ended': 'peopleTreatiesEnded',
  'natives:faith broken': 'peopleBreaches',
  'natives:lease made': 'leases',
  'natives:lease lapsed': 'leasesLapsed',
  'natives:rent paid': 'rent',
  'natives:exchange made': 'exchanges',
  'natives:exchange ended': 'exchangesEnded',
  'natives:renewed teaching': 'renewedTeachings',
  'natives:defence made': 'defences',
  'natives:defence ended': 'defencesEnded',
  'natives:defence fight': 'defenceFights',
  'natives:pact war': 'pactWars',
};

/** Tally keys that add up the amount reported, not the number of reports. */
const AMOUNTS = new Set<keyof RelationsTally>(['foreignStopSales', 'partnerPortSales', 'refAdded', 'shares', 'dividends', 'sharedBells', 'rent']);

function emptyTally(): RelationsTally {
  return { proposals: 0, agreements: 0, favoured: 0, favouredAtEnd: 0, cancelled: 0, volume: 0, foreignStopSales: 0, partnerPortSales: 0, triangles: 0, wars: 0, warsOnPartners: 0, taxRefusals: 0, demands: 0, demandsPaid: 0, demandsRefused: 0, royalWars: 0, refAdded: 0, alliances: 0, alliancesLeft: 0, alliesAtEnd: 0, allyWars: 0, companies: 0, shares: 0, dividends: 0, expeditions: 0, sharedBells: 0, confederations: 0, peopleTreaties: 0, peopleTreatiesEnded: 0, peopleBreaches: 0, peopleTreatiesAtEnd: 0, leases: 0, leasesLapsed: 0, rent: 0, exchanges: 0, exchangesEnded: 0, renewedTeachings: 0, defences: 0, defencesEnded: 0, defenceFights: 0, pactWars: 0 };
}

/** What one event did to one nation over a game: times it fired, the choices taken (by index) and the computer players' gold value of the outcomes. */
export interface EventTally {
  fired: number;
  choices: Record<number, number>;
  value: number;
}

export interface ArenaEntry {
  game: number;
  seed: number;
  nation: NationId;
  level: AiLevel;
  score: number;
  /** Points per score component (see scoreBreakdown). */
  parts?: Partial<Record<ScoreComponent, number>>;
  colonies: number;
  population: number;
  gold: number;
  fathers: number;
  independence: string;
  /** Units of goods spoiled in full warehouses over the game. */
  spoiled: number;
  /**
   * Land units of the Royal Expeditionary Force: at the declaration for a nation that declared,
   * otherwise at the end; and what the old formula (`royalForce`, sized by colonies) gave then.
   */
  ref?: number;
  refFormula?: number;
  /** Turn of the declaration of independence, if any. */
  declared?: number;
  /** Turns the War of Independence lasted: to its outcome, or to the end of the game if it was still going on. */
  warTurns?: number;
  /** The turn the game stopped at (`turns`, the end of the calendar, or a war that ended it). */
  lastTurn?: number;
  /** In play-on, the turn the nation was finished (its war ended); its score is from then. */
  finished?: number;
  /** The game was cheated in (arena games never cheat, but standings can come from any state). */
  cheated?: boolean;
  /** Won its game: one of `gameOver.winners`, or, for a game stopped before it ended, the highest score (ties count for all). */
  won: boolean;
  /** Won together with its allies (the `concord` victory). */
  concord?: boolean;
  /** Won by prosperity (native-partners.md N10), alone or with others. */
  prosperity?: boolean;
  /**
   * Where the scenario plays for prosperity: the rule's conditions the nation failed at the end
   * (empty when it qualified), whether or not the game ended that way.
   */
  prosperityFails?: ProsperityCondition[];
  /** Feature uses, when the arena counts them. */
  features?: FeatureCounts;
  /** Relations and trade with the other Europeans (arena games always count them). */
  relations?: RelationsTally;
  /** Events that struck the nation, by event id (only with events on). */
  events?: Record<string, EventTally>;
}

export interface ArenaSummary {
  level: AiLevel;
  entries: number;
  wins: number;
  score: number;
  colonies: number;
  population: number;
  gold: number;
  fathers: number;
  independenceWon: number;
  independenceLost: number;
  spoiled: number;
  /** Entries from cheated games. */
  cheated: number;
  /** Average feature uses per nation per game, when counted. */
  features?: FeatureCounts;
  /** Average relations and trade per nation per game. */
  relations?: RelationsTally;
}

/** Plays one computer-only game and reports every nation's standing at the end. */
export function playArenaGame(
  seed: number,
  line: { nation: NationId; level: AiLevel }[],
  turns: number,
  mapSize: MapSize,
  map?: string,
  features = false,
  difficulty?: DifficultyId,
  noFavoured = false,
  events = false,
  charter = true,
  setup: { scenario?: string; rivals?: Rivals; playOn?: boolean } = {},
): { state: GameState; entries: Omit<ArenaEntry, 'game' | 'won'>[] } {
  const ai = Object.fromEntries(line.map((l) => [l.nation, l.level]));
  const config = {
    seed,
    mapSize,
    nations: line.map((l) => l.nation),
    humans: [],
    ai,
    ...(map ? { map } : {}),
    ...(difficulty ? { difficulty, difficultyForAll: true } : {}),
    ...(noFavoured ? { noFavoured: true } : {}),
    ...(events ? { historicalEvents: true, randomEvents: true } : {}),
    ...(charter ? { colonyCharter: true } : {}),
    ...(setup.scenario ? { scenario: setup.scenario } : {}),
    ...(setup.rivals ? { rivals: setup.rivals } : {}),
    ...(setup.playOn ? { playOn: true } : {}),
  };
  const counts = new Map<string, FeatureCounts>();
  const tallies = new Map<string, RelationsTally>();
  const eventTallies = new Map<string, Record<string, EventTally>>();
  // The sink only counts; it never touches the game, so scores do not depend on it.
  const previous = setFeatureSink((nation, feature, n) => {
    if (feature.startsWith('event')) {
      // `event:<id>` a strike, `event:choice <id> <index>` a choice taken, `eventvalue <id>` its gold value.
      const m = /^(event:choice |event:|eventvalue )(\S+)(?: (\d+))?$/.exec(feature);
      if (m) {
        let per = eventTallies.get(nation);
        if (!per) eventTallies.set(nation, (per = {}));
        const tally = (per[m[2]] ??= { fired: 0, choices: {}, value: 0 });
        if (m[1] === 'event:choice ') tally.choices[Number(m[3])] = (tally.choices[Number(m[3])] ?? 0) + n;
        else if (m[1] === 'eventvalue ') tally.value += n;
        else tally.fired += n;
      }
    }
    const key = TALLY[feature];
    if (key) {
      let r = tallies.get(nation);
      if (!r) tallies.set(nation, (r = emptyTally()));
      r[key] += AMOUNTS.has(key) ? n : 1;
    }
    if (!features) return;
    let c = counts.get(nation);
    if (!c) counts.set(nation, (c = {}));
    c[feature] = (c[feature] ?? 0) + n;
  });
  let s: GameState;
  try {
    s = createGame(config);
    let guard = turns * 2 + 10;
    while (s.turn < turns && !s.gameOver && guard-- > 0) applyCommand(s, { type: 'endTurn' });
  } finally {
    setFeatureSink(previous);
  }
  const rule = scenarioOf(s).victory.find((v) => v.id === 'prosperity');
  // Judged on the scores the game ended with (the round's next turn has begun since), as the victory was.
  const finals = rule ? (s.gameOver?.scores ?? finalScores(s)) : undefined;
  const entries = line.map((l) => {
    const fails = rule ? { prosperityFails: prosperityStanding(s, l.nation, finals!, prosperityParams(rule.params)).fails } : {};
    const e = { ...standing(s, seed, l.nation, l.level), relations: endRelations(s, l.nation, tallies.get(l.nation)), ...fails, ...(events ? { events: eventTallies.get(l.nation) ?? {} } : {}) };
    return features ? { ...e, features: { ...counts.get(l.nation), ...endStateFeatures(s, l.nation) } } : e;
  });
  return { state: s, entries };
}

/** A nation's relations tally, completed with the end state: Favoured Nation partners and trade volume. */
function endRelations(s: GameState, nation: NationId, counted?: RelationsTally): RelationsTally {
  const r = { ...(counted ?? emptyTally()) };
  for (const rel of Object.values(s.relations ?? {})) {
    if (rel.a !== nation && rel.b !== nation) continue;
    r.volume += rel.volume;
    if (isFavoured(s, rel.a, rel.b)) r.favouredAtEnd++;
  }
  r.alliesAtEnd = alliesOf(s, nation).length;
  r.peopleTreatiesAtEnd = (s.treaties ?? []).filter((t) => !t.end && withPeople(t) && bound(t, nation)).length;
  return r;
}

export function standing(s: GameState, seed: number, nation: NationId, level: AiLevel): Omit<ArenaEntry, 'game' | 'won'> {
  const p = s.players.find((x) => x.id === nation)!;
  const colonies = colonyList(s).filter((c) => c.owner === nation);
  const breakdown = scoreBreakdown(s, p);
  // A nation finished in play-on stands with the score it had when its war ended.
  return {
    seed,
    nation,
    level,
    score: p.finished?.score ?? breakdown.total,
    parts: p.finished?.parts ?? Object.fromEntries(breakdown.lines.map((l) => [l.key, l.points])),
    colonies: colonies.length,
    population: colonies.reduce((n, c) => n + colonyWorkers(s, c).length, 0),
    gold: p.gold,
    fathers: p.fathers.length,
    independence: p.independence,
    spoiled: p.goodsSpoiled ?? 0,
    ...royalStanding(s, p, colonies.length),
    ...(p.refAtDeclaration ? { warTurns: (p.finished?.turn ?? s.turn) - p.refAtDeclaration.turn } : {}),
    lastTurn: s.turn,
    ...(p.finished ? { finished: p.finished.turn } : {}),
    ...(isCheated(s) ? { cheated: true } : {}),
  };
}

/** The Royal Expeditionary Force a nation faced: at its declaration, or at the end. */
function royalStanding(s: GameState, p: Player, colonies: number): Pick<ArenaEntry, 'ref' | 'refFormula' | 'declared'> {
  if (p.refAtDeclaration) {
    const f = p.refAtDeclaration.force;
    return { ref: f.regulars + f.dragoons + f.artillery, refFormula: p.refAtDeclaration.formula, declared: p.refAtDeclaration.turn };
  }
  const old = royalForce(s, p, colonies);
  return { ref: p.ref.regulars + p.ref.dragoons + p.ref.artillery, refFormula: old.regulars + old.dragoons + old.artillery };
}

/** Plays a series of games, rotating nations and seats so no level keeps the same advantage. */
export function runArena(opts: ArenaOptions, onGame?: (entries: ArenaEntry[], game: number) => void): { entries: ArenaEntry[]; summary: ArenaSummary[] } {
  const entries: ArenaEntry[] = [];
  for (const game of arenaGames(opts)) {
    const rows = playArenaRound(opts, game);
    entries.push(...rows);
    onGame?.(rows, game.game);
  }
  return { entries, summary: summarise(entries) };
}

/** One game of an arena run: its number, seed and nations with their levels. */
export interface ArenaGame {
  game: number;
  seed: number;
  line: { nation: NationId; level: AiLevel }[];
}

/**
 * The games an arena run plays, in order. Each can be played on its own (`playArenaRound`), so a
 * tournament can play them in parallel and gather the rows in this order, as `runArena` does.
 */
export function arenaGames(opts: ArenaOptions): ArenaGame[] {
  const n = opts.levels.length;
  const set = nationSet(scenarioOf({ config: { scenario: opts.scenario } }), opts.rivals).map((e) => e.id);
  if (n < 1 || n > set.length) throw new Error(`An arena game needs between 1 and ${set.length} nations.`);
  const out: ArenaGame[] = [];
  for (let g = 0; g < opts.games; g++) {
    const seed = (opts.firstSeed ?? 1000) + g;
    const k = g % set.length;
    const nations = [...set.slice(k), ...set.slice(0, k)].slice(0, n);
    out.push({ game: g, seed, line: nations.map((nation, i) => ({ nation, level: opts.levels[(i + g) % n] })) });
  }
  return out;
}

/** Plays one game of an arena run and gives its rows, the winners marked. */
export function playArenaRound(opts: ArenaOptions, game: ArenaGame): ArenaEntry[] {
  const setup = { scenario: opts.scenario, rivals: opts.rivals, playOn: opts.playOn };
  const { state, entries } = playArenaGame(game.seed, game.line, opts.turns, opts.mapSize, opts.map, opts.features, opts.difficulty, opts.noFavoured, opts.events, !opts.noCharter, setup);
  const best = Math.max(...entries.map((e) => e.score));
  // A game that ended names its winners (several after a concord victory); one stopped early: the best score.
  // A prosperity victory names the winners' partner peoples; several winners otherwise won together (concord).
  const winners = state.gameOver?.winners;
  const prosperity = !!state.gameOver?.partners?.length;
  const together = !!winners && winners.length > 1 && !prosperity;
  return entries.map((e) => ({
    ...e,
    game: game.game,
    won: winners?.length ? winners.includes(e.nation) : e.score === best,
    ...(together && winners!.includes(e.nation) ? { concord: true } : {}),
    ...(prosperity && winners!.includes(e.nation) ? { prosperity: true } : {}),
  }));
}

export function summarise(entries: ArenaEntry[]): ArenaSummary[] {
  const levels = [...new Set(entries.map((e) => e.level))];
  return levels
    .map((level) => {
      const rows = entries.filter((e) => e.level === level);
      const mean = (f: (e: ArenaEntry) => number) => Math.round((rows.reduce((n, e) => n + f(e), 0) / rows.length) * 10) / 10;
      return {
        level,
        entries: rows.length,
        wins: rows.filter((e) => e.won).length,
        score: mean((e) => e.score),
        colonies: mean((e) => e.colonies),
        population: mean((e) => e.population),
        gold: mean((e) => e.gold),
        fathers: mean((e) => e.fathers),
        independenceWon: rows.filter((e) => e.independence === 'won').length,
        independenceLost: rows.filter((e) => e.independence === 'lost').length,
        spoiled: mean((e) => e.spoiled),
        cheated: rows.filter((e) => e.cheated).length,
        ...(rows.some((e) => e.features) ? { features: averageFeatures(rows) } : {}),
        ...(rows.some((e) => e.relations) ? { relations: averageTally(rows) } : {}),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function averageFeatures(rows: ArenaEntry[]): FeatureCounts {
  const out: FeatureCounts = {};
  for (const e of rows) for (const [k, v] of Object.entries(e.features ?? {})) out[k] = (out[k] ?? 0) + v;
  for (const k of Object.keys(out)) out[k] = Math.round((out[k] / rows.length) * 10) / 10;
  return out;
}

function averageTally(rows: ArenaEntry[]): RelationsTally {
  const out = emptyTally();
  for (const e of rows) for (const k of Object.keys(out) as (keyof RelationsTally)[]) out[k] += e.relations?.[k] ?? 0;
  for (const k of Object.keys(out) as (keyof RelationsTally)[]) out[k] = Math.round((out[k] / rows.length) * 10) / 10;
  return out;
}

/** A Markdown table of relations and trade between the Europeans, per level (average per nation per game). */
export function formatRelations(summary: ArenaSummary[]): string {
  const head = '| Level | Proposals | Agreements | Favoured made | Favoured at end | Cancelled | Alliances made | left | allies at end | Wars joined for allies | Trade volume | Foreign stop sales | Partner port sales | Triangle trades | Wars declared | on partners | Tax refusals |';
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const rows = summary
    .filter((r) => r.relations)
    .map((r) => {
      const t = r.relations!;
      return `| ${AI_LEVEL_INFO[r.level].name} | ${t.proposals} | ${t.agreements} | ${t.favoured} | ${t.favouredAtEnd} | ${t.cancelled} | ${t.alliances} | ${t.alliancesLeft} | ${t.alliesAtEnd} | ${t.allyWars} | ${t.volume} | ${t.foreignStopSales} | ${t.partnerPortSales} | ${t.triangles} | ${t.wars} | ${t.warsOnPartners} | ${t.taxRefusals} |`;
    });
  return [head, rule, ...rows].join('\n');
}

/** One line with the per-game totals of relations between the Europeans. */
export function formatRelationsLine(entries: ArenaEntry[]): string {
  const games = new Set(entries.map((e) => e.game)).size || 1;
  const sum = (k: keyof RelationsTally) => entries.reduce((n, e) => n + (e.relations?.[k] ?? 0), 0);
  const per = (n: number) => Math.round((n / games) * 10) / 10;
  // Agreements and Favoured Nation statuses involve two nations; volume is counted by both.
  return (
    `Per game: ${per(sum('agreements') / 2)} trade agreements, ${per(sum('favoured') / 2)} Favoured Nation pairs made ` +
    `(${per(sum('favouredAtEnd') / 2)} at the end, ${per(sum('cancelled'))} cancelled), ${Math.round(sum('volume') / 2 / games)} gold traded at each other's colonies, ` +
    `${per(sum('foreignStopSales'))} units sold at partners' colonies and ${per(sum('partnerPortSales'))} in partners' ports, ${per(sum('triangles'))} triangle trades, ` +
    `${per(sum('wars'))} wars declared (${per(sum('warsOnPartners'))} on trade partners or Favoured Nations), ${per(sum('taxRefusals'))} tax raises refused. ` +
    allianceLine(entries)
  );
}

/**
 * Treaties with native peoples over a run: games with one made, made, ended and broken per game,
 * in force at the end, and the levels that made them. Empty when none was made.
 */
export function peopleTreatyLine(entries: ArenaEntry[]): string {
  const sum = (k: keyof RelationsTally, list = entries) => list.reduce((n, e) => n + (e.relations?.[k] ?? 0), 0);
  const made = sum('peopleTreaties');
  if (!made && !sum('peopleBreaches')) return '';
  const byGame = new Map<number, ArenaEntry[]>();
  for (const e of entries) byGame.set(e.game, [...(byGame.get(e.game) ?? []), e]);
  const games = byGame.size || 1;
  const withTreaty = [...byGame.values()].filter((g) => g.some((e) => (e.relations?.peopleTreaties ?? 0) > 0)).length;
  const per = (n: number) => Math.round((n / games) * 10) / 10;
  const levels = [...new Set(entries.map((e) => e.level))].map((l) => `${l} ${per(sum('peopleTreaties', entries.filter((e) => e.level === l)))}`).join(', ');
  const leases = sum('leases');
  const withLease = [...byGame.values()].filter((g) => g.some((e) => (e.relations?.leases ?? 0) > 0)).length;
  const leaseLevels = [...new Set(entries.map((e) => e.level))].map((l) => `${l} ${per(sum('leases', entries.filter((e) => e.level === l)))}`).join(', ');
  const land = leases ? `Land use: ${withLease} of ${games} games with a lease, ${per(leases)} made per game (${leaseLevels}), ${per(sum('leasesLapsed'))} lapsed for want of rent, ${Math.round(sum('rent') / games)} gold of rent per game. ` : '';
  const exchanges = sum('exchanges');
  const withExchange = [...byGame.values()].filter((g) => g.some((e) => (e.relations?.exchanges ?? 0) > 0)).length;
  const exchangeLevels = [...new Set(entries.map((e) => e.level))].map((l) => `${l} ${per(sum('exchanges', entries.filter((e) => e.level === l)))}`).join(', ');
  const exchange = exchanges ? `Cultural exchange: ${withExchange} of ${games} games with one, ${per(exchanges)} made per game (${exchangeLevels}), ${per(sum('exchangesEnded'))} ended, ${per(sum('renewedTeachings'))} colonists taught again per game. ` : '';
  const defences = sum('defences');
  const withDefence = [...byGame.values()].filter((g) => g.some((e) => (e.relations?.defences ?? 0) > 0)).length;
  const defenceLevels = [...new Set(entries.map((e) => e.level))].map((l) => `${l} ${per(sum('defences', entries.filter((e) => e.level === l)))}`).join(', ');
  const defence = defences ? `Mutual defence: ${withDefence} of ${games} games with a pact, ${per(defences)} made per game (${defenceLevels}), ${per(sum('defencesEnded'))} ended, ${per(sum('defenceFights'))} fights of braves for a partner and ${per(sum('pactWars'))} wars brought by pacts per game. ` : '';
  return `Treaties with peoples: ${withTreaty} of ${games} games with one, ${per(made)} made per game (${levels}), ${per(sum('peopleTreatiesEnded'))} ended and ${per(sum('peopleBreaches'))} breaches of faith per game, ${per(sum('peopleTreatiesAtEnd'))} in force at the end. ${land}${exchange}${defence}`;
}

/**
 * The `prosperity` victory over a run (only where the scenario plays for it): games won by
 * prosperity and by which levels, and how close the nations came at the end: how many failed each
 * condition, and how many failed that condition alone.
 */
export function prosperityLine(entries: ArenaEntry[]): string {
  const judged = entries.filter((e) => e.prosperityFails);
  if (!judged.length) return '';
  const byGame = new Map<number, ArenaEntry[]>();
  for (const e of entries) byGame.set(e.game, [...(byGame.get(e.game) ?? []), e]);
  const games = byGame.size || 1;
  const won = [...byGame.values()].filter((g) => g.some((e) => e.prosperity));
  const winners = won.map((g) => g.filter((e) => e.prosperity).map((e) => e.level).join(' + ')).join(', ');
  const conditions: ProsperityCondition[] = ['peace', 'burned', 'treaties', 'score'];
  const failing = conditions.map((c) => `${c} ${judged.filter((e) => e.prosperityFails!.includes(c)).length}`).join(', ');
  const alone = conditions.map((c) => `${c} ${judged.filter((e) => e.prosperityFails!.length === 1 && e.prosperityFails![0] === c).length}`).join(', ');
  const qualified = judged.filter((e) => !e.prosperityFails!.length).length;
  return `Prosperity: ${won.length} of ${games} games won by prosperity${winners ? ` (${winners})` : ''}; at the end ${qualified} of ${judged.length} nations qualified; failing each condition: ${failing}; failing only that one: ${alone}. `;
}

/**
 * Alliances and concord over a run: games with at least one alliance made, alliances made and
 * standing at the end per game, and games won together (the `concord` victory).
 */
export function allianceLine(entries: ArenaEntry[]): string {
  const byGame = new Map<number, ArenaEntry[]>();
  for (const e of entries) byGame.set(e.game, [...(byGame.get(e.game) ?? []), e]);
  const games = byGame.size || 1;
  const rows = [...byGame.values()];
  const withAlliance = rows.filter((g) => g.some((e) => (e.relations?.alliances ?? 0) > 0)).length;
  // A new alliance counts for both its founders, a join for the newcomer and the member who invited it.
  const made = entries.reduce((n, e) => n + (e.relations?.alliances ?? 0), 0) / 2;
  const concord = rows.filter((g) => g.some((e) => e.concord)).length;
  const withCompany = rows.filter((g) => g.some((e) => (e.relations?.companies ?? 0) > 0)).length;
  const founded = entries.reduce((n, e) => n + (e.relations?.companies ?? 0), 0);
  const dividends = entries.reduce((n, e) => n + (e.relations?.dividends ?? 0), 0);
  const expeditions = entries.reduce((n, e) => n + (e.relations?.expeditions ?? 0), 0) / 2;
  const bells = entries.reduce((n, e) => n + (e.relations?.sharedBells ?? 0), 0);
  return `Alliances: ${withAlliance} of ${games} games with an alliance, ${Math.round((made / games) * 10) / 10} made per game, ${Math.round((expeditions / games) * 10) / 10} joint expeditions and ${Math.round(bells / games)} shared bells per game; ${concord} of ${games} games won together (concord). ` +
    `Confederations: ${rows.filter((g) => g.some((e) => (e.relations?.confederations ?? 0) > 0)).length} of ${games} games. ` +
    prosperityLine(entries) +
    peopleTreatyLine(entries) +
    `Companies: ${withCompany} of ${games} games with a chartered company, ${Math.round((founded / games) * 10) / 10} founded per game, ${Math.round(dividends / games)} gold of dividends per game.`;
}

/**
 * A Markdown table of the Crown per level: independence declared, won and lost, when, how long the
 * war lasted (to its outcome or the end of the game), the Royal
 * Expeditionary Force at the declaration (or at the end) against the old formula, and the King's
 * demands and wars, as averages per nation per game.
 */
export function formatCrown(entries: ArenaEntry[]): string {
  const head = '| Level | Declared | Won / lost | Turn declared | War turns | REF at declaration | old formula then | REF at end (no declaration) | old formula then | Demands | paid | refused | Royal wars | REF units added |';
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const levels = [...new Set(entries.map((e) => e.level))];
  const avg = (rows: ArenaEntry[], f: (e: ArenaEntry) => number) => (rows.length ? String(Math.round((rows.reduce((n, e) => n + f(e), 0) / rows.length) * 10) / 10) : '–');
  const rows = levels.map((level) => {
    const all = entries.filter((e) => e.level === level);
    const declared = all.filter((e) => e.declared !== undefined);
    const rest = all.filter((e) => e.declared === undefined);
    const t = (k: keyof RelationsTally) => avg(all, (e) => e.relations?.[k] ?? 0);
    return `| ${AI_LEVEL_INFO[level].name} | ${declared.length} | ${all.filter((e) => e.independence === 'won').length} / ${all.filter((e) => e.independence === 'lost').length} | ${avg(declared, (e) => e.declared!)} | ${avg(declared, (e) => e.warTurns ?? 0)} | ${avg(declared, (e) => e.ref ?? 0)} | ${avg(declared, (e) => e.refFormula ?? 0)} | ${avg(rest, (e) => e.ref ?? 0)} | ${avg(rest, (e) => e.refFormula ?? 0)} | ${t('demands')} | ${t('demandsPaid')} | ${t('demandsRefused')} | ${t('royalWars')} | ${t('refAdded')} |`;
  });
  return [head, rule, ...rows].join('\n');
}

/** A Markdown table of the average points per score component for each level. */
export function formatScoreSplit(entries: ArenaEntry[]): string {
  const keys: ScoreComponent[] = ['colonists', 'experts', 'buildings', 'production', 'liberty', 'fathers', 'wealth', 'peace', 'peoples', 'independence', 'companies'];
  const levels = [...new Set(entries.map((e) => e.level))];
  const head = `| Level | ${keys.join(' | ')} | Total |`;
  const rule = `| --- | ${keys.map(() => '---:').join(' | ')} | ---: |`;
  const rows = levels.map((level) => {
    const all = entries.filter((e) => e.level === level);
    const avg = (f: (e: ArenaEntry) => number) => Math.round((all.reduce((n, e) => n + f(e), 0) / all.length) * 10) / 10;
    return `| ${AI_LEVEL_INFO[level].name} | ${keys.map((k) => avg((e) => e.parts?.[k] ?? 0)).join(' | ')} | ${avg((e) => e.score)} |`;
  });
  return [head, rule, ...rows].join('\n');
}

/** A Markdown table of a summary. */
export function formatArena(summary: ArenaSummary[]): string {
  const head = '| Level | Nations | Wins | Score | Colonies | Colonists | Gold | Fathers | Independence won / lost | Goods spoiled |';
  const rule = '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const rows = summary.map((r) =>
    `| ${AI_LEVEL_INFO[r.level].name}${r.cheated ? ` (${r.cheated} cheated)` : ''} | ${r.entries} | ${r.wins} | ${r.score} | ${r.colonies} | ${r.population} | ${r.gold} | ${r.fathers} | ${r.independenceWon} / ${r.independenceLost} | ${r.spoiled} |`,
  );
  const cheated = summary.reduce((n, r) => n + r.cheated, 0);
  const note = cheated ? [`\nCheats used: ${cheated} of these entries come from cheated games.`] : [];
  return [head, rule, ...rows, ...note].join('\n');
}

/**
 * A Markdown table of events (only games with events on): per event, how often it struck a nation
 * per game, the share of its choices taken (by index), and its average gold value per strike and
 * per game in score points (the value is the computer players' own estimate; 400 gold is taken as about one score point, as measured in docs/design/events.md).
 */
export const GOLD_PER_POINT = 400;

export function formatEvents(entries: ArenaEntry[]): string {
  const withEvents = entries.filter((e) => e.events);
  if (!withEvents.length) return '';
  const ids = [...new Set(withEvents.flatMap((e) => Object.keys(e.events!)))].sort();
  const games = withEvents.length;
  const round = (n: number, d = 2) => String(Math.round(n * 10 ** d) / 10 ** d);
  const lines = ids.map((id) => {
    const rows = withEvents.map((e) => e.events![id]).filter(Boolean);
    const fired = rows.reduce((n, r) => n + r.fired, 0);
    const value = rows.reduce((n, r) => n + r.value, 0);
    const choices: Record<number, number> = {};
    for (const r of rows) for (const [i, c] of Object.entries(r.choices)) choices[Number(i)] = (choices[Number(i)] ?? 0) + c;
    const picks = Object.entries(choices).map(([i, c]) => `#${i} ${c}`).join(', ') || '–';
    return { fired, text: `| ${id} | ${round(fired / games)} | ${picks} | ${fired ? Math.round(value / fired) : 0} | ${round(value / games, 1)} | ${round(value / games / GOLD_PER_POINT)} |` };
  });
  const total = lines.reduce((n, l) => n + l.fired, 0);
  const head = '| Event | Per nation per game | Choices taken | Gold value per strike | per nation per game | score points (400 gold = 1) |';
  const rule = '| --- | ---: | --- | ---: | ---: | ---: |';
  return [`Events: ${round(total / games, 1)} per nation per game.`, '', head, rule, ...lines.map((l) => l.text)].join('\n');
}
