import {
  AI_LEVEL_INFO,
  AI_LEVELS,
  DEFAULT_DIFFICULTY,
  DEFAULT_SCENARIO,
  DIFFICULTY,
  DIFFICULTY_LEVELS,
  getScenario,
  nationOf,
  newGameOptions,
  playableScenarios,
  STORED_MAPS,
  parseStoredMap,
  calendarOf,
  formatDate,
  nationTitle,
  scenarioOf,
  term,
  Term,
  turnOfYear,
  type AiLevel,
  decodeGameCode,
  looksLikeGameCode,
  parseSeedInput,
  type DifficultyId,
  type GameConfig,
  type GameState,
  type MapSize,
  type NationId,
  type Rivals,
  type Scenario,
} from '@cc/engine';
import { clear, h } from '../dom.js';
import { loadAuto, loadManual, pickSaveFile } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';

/** The query parameter of a testing link that opens the New game screen on a scenario, hidden ones included. */
export const SCENARIO_PARAM = 'scenario';

/** The scenario a testing link names (`?scenario=hex-test`), if this version has it. */
export function scenarioFromSearch(search = typeof location === 'undefined' ? '' : location.search): Scenario | undefined {
  const id = new URLSearchParams(search).get(SCENARIO_PARAM);
  return id ? getScenario(id) : undefined;
}

interface Slot {
  nation: NationId;
  /** A person, or the level of a computer player. */
  controller: 'human' | AiLevel;
}

/** The scenario new games start in until another is chosen: the Americas. */
const DEFAULT = scenarioOf({ config: {} });

/** Scenarios still to come, shown as disabled choices (Q15). */
const PLANNED_SCENARIOS = ['Australia, 1788–1901', 'Vinland, around 1000'];


/** The line under the seed field: the number the text gives, and the phrase it came from. */
function seedLine(text: string): string {
  if (looksLikeGameCode(text)) return 'This looks like a game code: it is applied when you leave the field.';
  const r = parseSeedInput(text);
  return r.seedPhrase ? `Seed number: ${r.seed} (from "${r.seedPhrase}")` : `Seed number: ${r.seed}`;
}

/** "Fixed (W×H)" for a stored map. */
function storedMapSize(id: string): string {
  const def = STORED_MAPS.find((m) => m.id === id);
  if (!def) return 'Fixed';
  const { width, height } = parseStoredMap(def);
  return `Fixed (${width}×${height})`;
}

/** A "Planned" badge naming the roadmap release (docs/ROADMAP.md) that brings the option. */
const planned = (release: string) => h('span', { class: 'planned', title: `Planned for ${release}; see docs/ROADMAP.md` }, `Planned · ${release}`);

/** A disabled select previewing an option from the roadmap. The first choice is what the game does today. */
function plannedSelect(label: string, release: string, choices: string[], note?: string): HTMLElement {
  return h('label', { class: 'field planned-field', title: note },
    h('span', null, label, ' ', planned(release)),
    h('select', { disabled: true, 'aria-label': `${label} (planned)` }, choices.map((c) => h('option', null, c))));
}

/** Rule options from the roadmap, shown as disabled switches. */
const PLANNED_OPTIONS: { label: string; release: string; note: string }[] = [
  { label: 'Native peoples as partners', release: 'Beta 2', note: 'Trade agreements, shared land and mutual defence with the native peoples.' },
  { label: 'Hexagon maps', release: 'Later', note: 'A scenario can choose hexagon tiles instead of squares.' },
];

export function newGameScreen(
  host: HTMLElement,
  start: (config: GameConfig, head?: { turn: number; watch: boolean }) => void,
  resume: (state: GameState) => void,
  back?: () => void,
  /** A game code from a share link: fills in the screen (nothing starts by itself). */
  initialCode?: string,
): HTMLElement {
  /** The chosen scenario: its nations, maps, calendar and switches decide what the screen offers. */
  let scenario: Scenario = DEFAULT;
  /** What the scenario offers (engine setup.ts newGameOptions). */
  let options = newGameOptions(scenario);
  const nationsFor = (r: Rivals): NationId[] => (r === 'real' ? options.nations.real ?? [] : options.nations.alternative);
  let count = 4;
  /** Alternative history (any nations) or real rivals (as in history). */
  let rivals: Rivals = scenario.nations.default;
  const slots: Slot[] = nationsFor(rivals).map((nation, i) => ({ nation, controller: i === 0 ? 'human' : 'competent' }));
  /**
   * Changes the nation set: nations already chosen that are in the new set keep their places, the
   * rest of the set follows; the controllers stay with the seats (the first seat stays the player's).
   */
  const setRivals = (next: Rivals) => {
    rivals = next;
    const set = nationsFor(rivals);
    const kept = slots.slice(0, count).map((s) => s.nation).filter((n) => set.includes(n));
    const order = [...kept, ...set.filter((n) => !kept.includes(n))];
    const controllers = slots.map((s) => s.controller);
    slots.splice(0, slots.length, ...order.map((nation, i): Slot => ({ nation, controller: controllers[i] ?? 'competent' })));
    count = Math.min(count, set.length);
  };
  let mapSize: MapSize = 'medium';
  /** Stored map id; empty for a generated map. */
  let map = options.defaultMap;
  const randomSeed = () => String(Math.floor(Math.random() * 1e9));
  /** What the Game seed field holds: a number, a phrase, or a pasted game code. */
  let seedText = randomSeed();
  /** Notice from the last pasted game code (a version warning, or why it was refused). */
  let codeNote = '';
  /** A game code was applied: the start button says so. */
  let fromCode = false;
  /** Year to take over in; 0 starts at the beginning. */
  let headYear = 0;
  let watchHeadStart = true;
  let difficulty: DifficultyId = DEFAULT_DIFFICULTY;
  let historicalEvents = true;
  let randomEvents = true;
  let colonyCharter = true;

  /**
   * Changes the scenario: its default nation set (the seats keep their controllers), its default
   * map, a size its generator has, and the start at the beginning unless its calendar has the year.
   */
  const setScenario = (next: Scenario) => {
    scenario = next;
    options = newGameOptions(next);
    const set = nationsFor(options.rivals);
    rivals = options.rivals;
    const controllers = slots.map((s) => s.controller);
    slots.splice(0, slots.length, ...set.map((nation, i): Slot => ({ nation, controller: controllers[i] ?? 'competent' })));
    count = Math.max(1, Math.min(count, set.length, options.maxNations));
    map = options.defaultMap;
    const sizes = options.sizes.map((z) => z.id);
    if (sizes.length && !sizes.includes(mapSize)) mapSize = sizes.includes('medium') ? 'medium' : sizes[0];
    if (!options.startYears.some((y) => y.year === headYear)) headYear = 0;
  };

  /** Restores the New game choices from a game code. Returns false (and says why) when it is not one. */
  const applyCode = (text: string): boolean => {
    const r = decodeGameCode(text);
    if (!r.ok) {
      codeNote = r.error;
      return false;
    }
    const c = r.settings;
    const coded = getScenario(c.scenario ?? DEFAULT_SCENARIO);
    if (!coded) {
      codeNote = `This code is for the scenario "${c.scenario}", which this version of the game does not have.`;
      return false;
    }
    scenario = coded;
    options = newGameOptions(coded);
    rivals = c.rivals ?? 'alternative';
    const rest = nationsFor(rivals).filter((n) => !c.nations.some((x) => x.nation === n)).map((nation): Slot => ({ nation, controller: 'competent' }));
    slots.splice(0, slots.length, ...c.nations.map((x): Slot => ({ nation: x.nation, controller: x.controller })), ...rest);
    count = c.nations.length;
    mapSize = c.mapSize;
    map = c.map ?? '';
    difficulty = c.difficulty;
    historicalEvents = c.historicalEvents;
    randomEvents = c.randomEvents;
    colonyCharter = c.colonyCharter;
    headYear = options.startYears.find((y) => y.turn === c.headStartTurn)?.year ?? 0;
    seedText = c.seedPhrase ?? String(c.seed);
    fromCode = true;
    codeNote = r.versionWarning ?? `Game code applied (game version ${r.version}).`;
    return true;
  };

  const pasteCode = async () => {
    let text: string | null = null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = null;
    }
    if (!text || !looksLikeGameCode(text)) text = window.prompt('Paste a game code (from the Game menu, Copy game code):', '') ?? '';
    if (text.trim()) applyCode(text);
    render();
  };

  if (initialCode) applyCode(initialCode);
  else {
    // A testing link (?scenario=<id>) chooses a scenario, hidden ones included (the hex test
    // scenarios, docs/design/hex-maps.md); it is never in the list of scenarios people choose from.
    const linked = scenarioFromSearch();
    if (linked) setScenario(linked);
  }

  const el = h('main', { class: 'menu-screen' });
  // Clearing the screen blurs a focused input, whose change handler may render again; a render
  // that starts while one is running is folded into it.
  let rendering = false;
  let again = false;
  const render = () => {
    if (rendering) {
      again = true;
      return;
    }
    rendering = true;
    try {
      do {
        again = false;
        renderOnce();
      } while (again);
    } finally {
      rendering = false;
    }
  };
  const renderOnce = () => {
    clear(el);
    const autoSave = loadAuto();
    const manualSave = loadManual();
    const auto = autoSave?.state;
    const manual = manualSave?.state;
    // Saves this version cannot read (from before 0.4) are named, not hidden.
    const unreadable = [autoSave?.error && `Your autosaved game can't be continued: ${autoSave.error}`, manualSave?.error && `Your saved game can't be loaded: ${manualSave.error}`].filter(Boolean) as string[];
    const chosen = slots.slice(0, count);
    const humans = chosen.filter((s) => s.controller === 'human').length;
    // What the chosen scenario offers.
    /** The scenario's colony charter, if it has one (the option is hidden otherwise). */
    const CHARTER = options.charter;
    const alwaysOn = [
      scenario.mechanics.favoured ? 'Favoured Nation' : null,
      'a market and prices for every home port',
      'native braves on the map',
      scenario.mechanics.ref ? 'a royal army that grows during the game' : null,
      // Beta 1 (docs/design/cooperation.md), where the scenario has them.
      scenario.mechanics.alliances ? 'alliances (defence, open colonies, shared sight and bells, joint expeditions)' : null,
      scenario.mechanics.companies && scenario.nations.companies?.length ? 'chartered companies' : null,
      scenario.victory.some((v) => v.id === 'concord') ? 'winning together as an alliance' : null,
      scenario.victory.some((v) => v.id === 'prosperity') ? 'winning by prosperity in partnership with the native peoples' : null,
      scenario.mechanics.confederation && scenario.mechanics.independence ? 'declaring independence together' : null,
    ].filter((x): x is string => !!x);
    const scenarios = playableScenarios();
    /** The scenario with the chosen rivals, for the nations' entries in that set. */
    const setup = { config: { scenario: scenario.id, rivals } };
    const firstHuman = chosen.find((s) => s.controller === 'human')?.nation ?? chosen[0]?.nation ?? 'england';
    el.append(
      h('div', { class: 'menu-card' },
        h('div', { class: 'menu-title' },
          icon({ kind: 'unit', type: 'caravel', role: 'none', color: nationOf(scenario, firstHuman).color }, 72),
          back ? h('button', { class: 'btn small back', onclick: back, 'aria-label': 'Back to the title screen' }, '←') : null,
          h('div', null, h('h1', null, 'Casual Colonization'), h('p', { class: 'muted' }, term(scenario, 'newGame.tagline')))),
        auto || manual
          ? h('div', { class: 'row wrap' },
              auto ? h('button', { class: 'btn primary', onclick: () => resume(auto) }, `Continue (${formatDate(auto.turn, calendarOf(auto))})`) : null,
              manual ? h('button', { class: 'btn', onclick: () => resume(manual) }, `Load saved game (${formatDate(manual.turn, calendarOf(manual))})`) : null)
          : null,
        unreadable.map((text) => h('p', { class: 'save-error', role: 'status' }, text)),
        h('h2', null, 'New game'),
        h('div', { class: 'row wrap' },
          h('label', { class: 'field', title: `${scenario.description} Each scenario brings its own map, peoples, goods, events and way to win.` },
            h('span', null, 'Scenario'),
            h('select', { 'aria-label': 'Scenario', onchange: (e: Event) => { const next = getScenario((e.target as HTMLSelectElement).value); if (next) setScenario(next); render(); } },
              scenarios.map((sc) => h('option', { value: sc.id, selected: sc.id === scenario.id || undefined, title: sc.description }, sc.name)),
              // A scenario from a game code that is not offered to people still shows as chosen.
              scenarios.includes(scenario) ? null : h('option', { value: scenario.id, selected: true }, scenario.name),
              PLANNED_SCENARIOS.map((name) => h('option', { disabled: true }, `${name} (planned)`)))),
          scenario.nations.sets.real
            ? h('label', { class: 'field', title: 'Real rivals limits the choice of nations to those that colonised these lands in history; alternative history lets any nations take part.' },
                h('span', null, 'Rivals'),
                h('select', { 'aria-label': 'Rivals', onchange: (e: Event) => { setRivals((e.target as HTMLSelectElement).value as Rivals); render(); } },
                  h('option', { value: 'alternative', selected: rivals === 'alternative' || undefined }, 'Alternative history (any nations)'),
                  h('option', { value: 'real', selected: rivals === 'real' || undefined }, `Real rivals (${nationsFor('real').map((n) => nationOf(scenario, n).name).join(', ')})`)))
            : null,
          // The scenario's ways to win, read-only until there is a choice (section 6).
          h('label', { class: 'field', title: 'How this scenario can be won, checked in this order.' },
            h('span', null, 'Victory'),
            h('select', { disabled: true, 'aria-label': 'Victory' },
              h('option', null, options.victory.map((name, i) => (i ? name[0].toLowerCase() + name.slice(1) : name)).join(', or '))))),
        h('label', { class: 'field' },
          h('span', null, `${Term(scenario, 'homelandAdjective')} nations: ${count}`),
          h('input', { type: 'range', min: 1, max: Math.min(nationsFor(rivals).length, options.maxNations), value: count, 'aria-label': 'Number of nations', oninput: (e: Event) => { count = Number((e.target as HTMLInputElement).value); render(); } })),
        h('div', { class: 'slots-table' }, chosen.map((slot, i) => {
          const taken = new Set(chosen.filter((_, j) => j !== i).map((s) => s.nation));
          return h('div', { class: 'slot-row' },
            h('span', { class: 'flag', style: `background:${nationOf(scenario, slot.nation).color}` }),
            h('select', { 'aria-label': `Nation ${i + 1}`, onchange: (e: Event) => { slot.nation = (e.target as HTMLSelectElement).value as NationId; render(); } },
              nationsFor(rivals).filter((n) => !taken.has(n)).map((n) => h('option', { value: n, selected: n === slot.nation || undefined }, nationTitle(scenario, n)))),
            h('select', { 'aria-label': `Controller of nation ${i + 1}`, title: slot.controller === 'human' ? undefined : AI_LEVEL_INFO[slot.controller].description, onchange: (e: Event) => { slot.controller = (e.target as HTMLSelectElement).value as Slot['controller']; render(); } },
              h('option', { value: 'human', selected: slot.controller === 'human' || undefined }, 'Player'),
              AI_LEVELS.map((level) => h('option', { value: level, selected: slot.controller === level || undefined, title: AI_LEVEL_INFO[level].description }, `Computer: ${AI_LEVEL_INFO[level].name}`))),
            h('span', { class: 'muted small bonus' }, nationOf(setup, slot.nation).bonus.text));
        })),
        h('div', { class: 'row wrap' },
          h('label', { class: 'field', title: `${DIFFICULTY[difficulty].description} Applies to the players; computer players use the standard (Conquistador) economics.` },
            h('span', null, 'Difficulty'),
            h('select', { 'aria-label': 'Difficulty', onchange: (e: Event) => { difficulty = (e.target as HTMLSelectElement).value as DifficultyId; render(); } },
              DIFFICULTY_LEVELS.map((d) => h('option', { value: d, selected: d === difficulty || undefined, title: DIFFICULTY[d].description },
                `${DIFFICULTY[d].name}${d === DEFAULT_DIFFICULTY ? ' (standard)' : ''}`)))),
          plannedSelect('Online play', 'Later', ['Online'], 'Several people can already play on this device (hot seat): set more than one nation to Player.')),
        humans > 1 ? h('p', { class: 'muted small' }, 'Several players take turns on this device (hot seat).') : null,
        humans === 0 ? h('p', { class: 'muted small' }, 'No players: you watch the computer nations play each other, with a live scoreboard.') : null,
        h('div', { class: 'row wrap' },
          h('label', { class: 'field' }, h('span', null, 'Map'),
            h('select', { 'aria-label': 'Map', onchange: (e: Event) => { map = (e.target as HTMLSelectElement).value; render(); } },
              // A generated map only where the scenario has a generator; then its stored maps.
              options.generated ? h('option', { value: '', selected: !map || undefined }, 'Random (generated)') : null,
              options.maps.map((m) => h('option', { value: m.id, selected: m.id === map || undefined, title: m.description }, m.name)))),
          h('label', { class: 'field' }, h('span', null, 'Map size'),
            map
              ? h('select', { disabled: true, title: 'Stored maps have a fixed size.', 'aria-label': 'Map size' }, h('option', null, storedMapSize(map)))
              : h('select', { 'aria-label': 'Map size', onchange: (e: Event) => (mapSize = (e.target as HTMLSelectElement).value as MapSize) },
                  options.sizes.map((d) => h('option', { value: d.id, selected: d.id === mapSize || undefined }, `${d.id[0].toUpperCase()}${d.id.slice(1)} (${d.width}×${d.height})`)))),
          h('label', { class: 'field' }, h('span', null, 'Graphics style'),
            h('select', { onchange: (e: Event) => { setStyle((e.target as HTMLSelectElement).value); render(); } },
              availableStyles().map((st) => h('option', { value: st.id, selected: st.id === activeStyle().id || undefined }, st.name))))),
        h('p', { class: 'muted small' }, activeStyle().description),
        h('div', { class: 'row wrap rule-options' },
          h('label', { class: 'rule-option', title: 'Dated events from the period, each once per game: wars in Europe, the Great Frost, famous voyages, refugees, financial bubbles, the Age of Reason. Can be switched in the Game menu during play.' },
            h('input', { type: 'checkbox', checked: historicalEvents || undefined, 'aria-label': 'Historical events', onchange: (e: Event) => (historicalEvents = (e.target as HTMLInputElement).checked) }),
            h('span', null, h('b', null, 'Historical events'), h('br'), h('span', { class: 'muted small' }, 'Wars in Europe, the Great Frost, famous voyages, bubbles.'))),
          h('label', { class: 'rule-option', title: 'Surprises in the Sim City spirit: storms, fires, bumper harvests, gold fever, pirates, a skilled immigrant. Some ask you to choose. Can be switched in the Game menu during play.' },
            h('input', { type: 'checkbox', checked: randomEvents || undefined, 'aria-label': 'Random events', onchange: (e: Event) => (randomEvents = (e.target as HTMLInputElement).checked) }),
            h('span', null, h('b', null, 'Random events'), h('br'), h('span', { class: 'muted small' }, 'Storms, fires, bumper harvests, pirates.'))),
          // Shown only when the scenario has a charter (mechanics.charter).
          CHARTER ? h('label', { class: 'rule-option', title: `Every colony after the first needs a charter from ${term(scenario, 'crown')}: ${CHARTER.base} gold for each colony the nation already has, at most ${CHARTER.cap}, scaled by difficulty.${scenario.mechanics.independence ? ' Free after the declaration of independence.' : ''}` },
            h('input', { type: 'checkbox', checked: colonyCharter || undefined, 'aria-label': 'Colony charter (founding costs gold)', onchange: (e: Event) => (colonyCharter = (e.target as HTMLInputElement).checked) }),
            h('span', null, h('b', null, 'Colony charter (founding costs gold)'), h('br'), h('span', { class: 'muted small' }, `${Term(scenario, 'crown')} charges for each new colony after the first.`))) : null),
        // Rules that are part of the game now (formerly listed as planned for 0.4 and 0.5), where the scenario has them.
        alwaysOn.length ? h('p', { class: 'muted small' }, `Always part of the game: ${alwaysOn.join(', ')}.`) : null,
        h('details', { class: 'planned-options' },
          h('summary', null, 'Rules and options ', planned('later releases')),
          h('p', { class: 'muted small' }, 'On the roadmap and not playable yet. Hover or tap for details.'),
          h('div', { class: 'planned-grid' }, PLANNED_OPTIONS.map((o) =>
            h('label', { class: 'planned-option', title: o.note },
              h('input', { type: 'checkbox', disabled: true }),
              h('span', null, h('b', null, o.label), ' ', planned(o.release), h('br'), h('span', { class: 'muted small' }, o.note)))))),
        h('div', { class: 'row wrap' },
          humans > 0
            ? h('label', { class: 'field' }, h('span', null, 'Start'),
                h('select', { 'aria-label': 'Start year', onchange: (e: Event) => { headYear = Number((e.target as HTMLSelectElement).value); render(); } },
                  h('option', { value: 0, selected: !headYear || undefined }, `At the beginning (${options.firstYear})`),
                  options.startYears.map((y) => h('option', { value: y.year, selected: headYear === y.year || undefined }, `Take over in ${y.year} (turn ${y.turn})`))))
            : null,
          humans > 0 && headYear
            ? h('label', { class: 'field' }, h('span', null, 'Until then'),
                h('select', { 'aria-label': 'Head start display', onchange: (e: Event) => { watchHeadStart = (e.target as HTMLSelectElement).value === 'watch'; } },
                  h('option', { value: 'watch', selected: watchHeadStart || undefined }, 'Watch the speedrun'),
                  h('option', { value: 'skip', selected: !watchHeadStart || undefined }, 'Skip ahead (faster)')))
            : null,
          h('label', { class: 'field', title: 'Starts the random number generator for the whole game: the generated map, where native settlements, bonus resources and rumours go, and every roll during play. The same seed and the same choices give the same game. A phrase is turned into a number, so a game is easy to share by name; a game code from the Game menu restores all the choices on this screen.' },
            h('span', null, 'Game seed'),
            h('input', {
              type: 'text',
              id: 'game-seed',
              'aria-label': 'Game seed',
              value: seedText,
              placeholder: 'a number or a phrase, e.g. Peters Game',
              autocomplete: 'off',
              spellcheck: false,
              oninput: (e: Event) => {
                seedText = (e.target as HTMLInputElement).value;
                const shown = el.querySelector('#seed-shown');
                if (shown) shown.textContent = seedLine(seedText);
              },
              onchange: (e: Event) => {
                seedText = (e.target as HTMLInputElement).value;
                // Only a pasted game code changes the other fields; a plain seed is already shown.
                if (looksLikeGameCode(seedText)) {
                  applyCode(seedText);
                  render();
                }
              },
            })),
          h('button', { class: 'btn small', id: 'seed-random', title: 'Pick a random seed number', onclick: () => { seedText = randomSeed(); codeNote = ''; render(); } }, 'Random'),
          h('button', { class: 'btn small', id: 'seed-paste', title: 'Restore all these choices from a game code (Game menu, Copy game code)', onclick: () => void pasteCode() }, 'Paste game code')),
        h('p', { class: 'muted small', id: 'seed-shown', 'aria-live': 'polite' }, seedLine(seedText)),
        codeNote ? h('p', { class: codeNote.startsWith('Game code applied') ? 'muted small' : 'save-error', role: 'status' }, codeNote) : null,
        humans > 0 && headYear
          ? h('p', { class: 'muted small' }, `The strongest computer player runs your nation until ${headYear}, then hands it to you. Everyone else plays at the levels chosen above.`)
          : null,
        h('div', { class: 'row wrap' },
          h('button', {
            class: 'btn primary big',
            onclick: () => start({
              ...parseSeedInput(seedText),
              mapSize,
              ...(map ? { map } : {}),
              nations: chosen.map((s) => s.nation),
              humans: chosen.filter((s) => s.controller === 'human').map((s) => s.nation),
              ai: Object.fromEntries(chosen.flatMap((s) => (s.controller === 'human' ? [] : [[s.nation, s.controller]]))),
              difficulty,
              historicalEvents,
              randomEvents,
              // Off where the scenario has no charter (the option is hidden then).
              colonyCharter: colonyCharter && !!options.charter,
              // Only real rivals is written, so alternative-history configs (and their saves and game codes) are as before.
              ...(rivals !== scenario.nations.default ? { rivals } : {}),
              // Likewise the scenario, only outside the Americas.
              ...(scenario.id !== DEFAULT_SCENARIO ? { scenario: scenario.id } : {}),
            }, humans > 0 && headYear ? { turn: turnOfYear(headYear, scenario.calendar), watch: watchHeadStart } : undefined),
          }, fromCode ? 'Start this game' : humans === 0 ? 'Watch the computers play' : 'Set sail'),
          h('button', {
            class: 'btn',
            onclick: async () => {
              const loaded = await pickSaveFile();
              if (loaded?.state) resume(loaded.state);
              else if (loaded) toast(loaded.error, 'error');
            },
          }, 'Load from file'))),
    );
  };
  render();
  host.appendChild(el);
  return el;
}
