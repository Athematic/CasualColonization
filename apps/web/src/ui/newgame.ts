import {
  AI_LEVEL_INFO,
  AI_LEVELS,
  COLONY_CHARTER,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  DIFFICULTY_LEVELS,
  MAP_SIZES,
  NATION_ORDER,
  NATIONS,
  STORED_MAPS,
  parseStoredMap,
  calendarOf,
  firstYear,
  formatDate,
  nationTitle,
  scenarioOf,
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
} from '@cc/engine';
import { clear, h } from '../dom.js';
import { loadAuto, loadManual, pickSaveFile } from '../save.js';
import { activeStyle, availableStyles, icon, setStyle } from '../styles.js';
import { toast } from './dialogs.js';

interface Slot {
  nation: NationId;
  /** A person, or the level of a computer player. */
  controller: 'human' | AiLevel;
}

/** The calendar of new games: the default scenario's, until the Scenario select is real. */
const CALENDAR = scenarioOf({ config: {} }).calendar;

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
  { label: 'Favoured Nation', release: '0.4', note: 'Years of peace and shared trade routes let two nations trade and buy ships in each other\'s home ports.' },
  { label: 'A market for every home port', release: '0.4', note: 'Each nation\'s port has its own prices and taxes, which makes triangle trading possible.' },
  { label: 'Visible native braves', release: '0.5', note: 'Braves wander, visit, trade, demand tribute and fight as units on the map.' },
  { label: 'A growing royal army', release: '0.5', note: 'The king builds up the Royal Expeditionary Force during the game, and you can watch it grow.' },
  { label: 'Convict transport', release: 'Scenarios', note: 'The Crown sends convicts as colonists; lobby for free settlers instead.' },
  { label: 'Play on past the end year', release: 'Long term', note: 'After the last year, the game continues in the style of Civilization II.' },
];

export function newGameScreen(
  host: HTMLElement,
  start: (config: GameConfig, head?: { turn: number; watch: boolean }) => void,
  resume: (state: GameState) => void,
  back?: () => void,
  /** A game code from a share link: fills in the screen (nothing starts by itself). */
  initialCode?: string,
): HTMLElement {
  let count = 4;
  const slots: Slot[] = NATION_ORDER.map((nation, i) => ({ nation, controller: i === 0 ? 'human' : 'competent' }));
  let mapSize: MapSize = 'medium';
  /** Stored map id; empty for a generated map. */
  let map = '';
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

  /** Restores the New game choices from a game code. Returns false (and says why) when it is not one. */
  const applyCode = (text: string): boolean => {
    const r = decodeGameCode(text);
    if (!r.ok) {
      codeNote = r.error;
      return false;
    }
    const c = r.settings;
    const rest = NATION_ORDER.filter((n) => !c.nations.some((x) => x.nation === n)).map((nation): Slot => ({ nation, controller: 'competent' }));
    slots.splice(0, slots.length, ...c.nations.map((x): Slot => ({ nation: x.nation, controller: x.controller })), ...rest);
    count = c.nations.length;
    mapSize = c.mapSize;
    map = c.map ?? '';
    difficulty = c.difficulty;
    historicalEvents = c.historicalEvents;
    randomEvents = c.randomEvents;
    colonyCharter = c.colonyCharter;
    headYear = CALENDAR.headStartYears.find((y) => turnOfYear(y, CALENDAR) === c.headStartTurn) ?? 0;
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
    el.append(
      h('div', { class: 'menu-card' },
        h('div', { class: 'menu-title' },
          icon({ kind: 'unit', type: 'caravel', role: 'none', nation: chosen.find((s) => s.controller === 'human')?.nation ?? 'england' }, 72),
          back ? h('button', { class: 'btn small back', onclick: back, 'aria-label': 'Back to the title screen' }, '←') : null,
          h('div', null, h('h1', null, 'Casual Colonization'), h('p', { class: 'muted' }, 'Alpha 0.2: a clone of the classic game of colonising the New World.'))),
        auto || manual
          ? h('div', { class: 'row wrap' },
              auto ? h('button', { class: 'btn primary', onclick: () => resume(auto) }, `Continue (${formatDate(auto.turn, calendarOf(auto))})`) : null,
              manual ? h('button', { class: 'btn', onclick: () => resume(manual) }, `Load saved game (${formatDate(manual.turn, calendarOf(manual))})`) : null)
          : null,
        unreadable.map((text) => h('p', { class: 'save-error', role: 'status' }, text)),
        h('h2', null, 'New game'),
        h('div', { class: 'row wrap' },
          plannedSelect('Scenario', 'Scenarios', ['The Americas, 1492–1850', 'Australia, 1788–1901', 'Vinland, around 1000'],
            'Each scenario brings its own map, peoples, goods, events and way to win.'),
          plannedSelect('Rivals', 'Scenarios', ['Alternative history (any nations)', 'Real rivals (as in history)']),
          plannedSelect('Victory', 'Beta', ['Independence by war', 'Federation by negotiation', 'Prosperity and cooperation', 'Survival'])),
        h('label', { class: 'field' },
          h('span', null, `European nations: ${count}`),
          h('input', { type: 'range', min: 1, max: 8, value: count, 'aria-label': 'Number of European nations', oninput: (e: Event) => { count = Number((e.target as HTMLInputElement).value); render(); } })),
        h('div', { class: 'slots-table' }, chosen.map((slot, i) => {
          const taken = new Set(chosen.filter((_, j) => j !== i).map((s) => s.nation));
          return h('div', { class: 'slot-row' },
            h('span', { class: 'flag', style: `background:${NATIONS[slot.nation].color}` }),
            h('select', { 'aria-label': `Nation ${i + 1}`, onchange: (e: Event) => { slot.nation = (e.target as HTMLSelectElement).value as NationId; render(); } },
              NATION_ORDER.filter((n) => !taken.has(n)).map((n) => h('option', { value: n, selected: n === slot.nation || undefined }, nationTitle(n)))),
            h('select', { 'aria-label': `Controller of nation ${i + 1}`, title: slot.controller === 'human' ? undefined : AI_LEVEL_INFO[slot.controller].description, onchange: (e: Event) => { slot.controller = (e.target as HTMLSelectElement).value as Slot['controller']; render(); } },
              h('option', { value: 'human', selected: slot.controller === 'human' || undefined }, 'Player'),
              AI_LEVELS.map((level) => h('option', { value: level, selected: slot.controller === level || undefined, title: AI_LEVEL_INFO[level].description }, `Computer: ${AI_LEVEL_INFO[level].name}`))),
            h('span', { class: 'muted small bonus' }, NATIONS[slot.nation].bonus));
        })),
        h('div', { class: 'row wrap' },
          h('label', { class: 'field', title: `${DIFFICULTY[difficulty].description} Applies to the players; computer players use the standard (Conquistador) economics.` },
            h('span', null, 'Difficulty'),
            h('select', { 'aria-label': 'Difficulty', onchange: (e: Event) => { difficulty = (e.target as HTMLSelectElement).value as DifficultyId; render(); } },
              DIFFICULTY_LEVELS.map((d) => h('option', { value: d, selected: d === difficulty || undefined, title: DIFFICULTY[d].description },
                `${DIFFICULTY[d].name}${d === DEFAULT_DIFFICULTY ? ' (standard)' : ''}`)))),
          plannedSelect('Players', 'Later', ['On this device (hot seat)', 'Online'])),
        humans > 1 ? h('p', { class: 'muted small' }, 'Several players take turns on this device (hot seat).') : null,
        humans === 0 ? h('p', { class: 'muted small' }, 'No players: you watch the computer nations play each other, with a live scoreboard.') : null,
        h('div', { class: 'row wrap' },
          h('label', { class: 'field' }, h('span', null, 'Map'),
            h('select', { onchange: (e: Event) => { map = (e.target as HTMLSelectElement).value; render(); } },
              h('option', { value: '', selected: !map || undefined }, 'Random (generated)'),
              STORED_MAPS.map((m) => h('option', { value: m.id, selected: m.id === map || undefined, title: m.description }, m.name)))),
          h('label', { class: 'field' }, h('span', null, 'Map size'),
            map
              ? h('select', { disabled: true, title: 'Stored maps have a fixed size.' }, h('option', null, storedMapSize(map)))
              : h('select', { onchange: (e: Event) => (mapSize = (e.target as HTMLSelectElement).value as MapSize) },
                  (Object.keys(MAP_SIZES) as MapSize[]).map((m) => h('option', { value: m, selected: m === mapSize || undefined }, `${m[0].toUpperCase()}${m.slice(1)} (${MAP_SIZES[m].width}×${MAP_SIZES[m].height})`)))),
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
          h('label', { class: 'rule-option', title: `Every colony after the first needs a charter from the Crown: ${COLONY_CHARTER.base} gold for each colony the nation already has, at most ${COLONY_CHARTER.cap}, scaled by difficulty. Free after the declaration of independence.` },
            h('input', { type: 'checkbox', checked: colonyCharter || undefined, 'aria-label': 'Colony charter (founding costs gold)', onchange: (e: Event) => (colonyCharter = (e.target as HTMLInputElement).checked) }),
            h('span', null, h('b', null, 'Colony charter (founding costs gold)'), h('br'), h('span', { class: 'muted small' }, 'The Crown charges for each new colony after the first.')))),
        h('details', { class: 'planned-options' },
          h('summary', null, 'Rules and options ', planned('coming')),
          h('p', { class: 'muted small' }, 'On the roadmap and not playable yet. Hover or tap for details.'),
          h('div', { class: 'planned-grid' }, PLANNED_OPTIONS.map((o) =>
            h('label', { class: 'planned-option', title: o.note },
              h('input', { type: 'checkbox', disabled: true }),
              h('span', null, h('b', null, o.label), ' ', planned(o.release), h('br'), h('span', { class: 'muted small' }, o.note)))))),
        h('div', { class: 'row wrap' },
          humans > 0
            ? h('label', { class: 'field' }, h('span', null, 'Start'),
                h('select', { 'aria-label': 'Start year', onchange: (e: Event) => { headYear = Number((e.target as HTMLSelectElement).value); render(); } },
                  h('option', { value: 0, selected: !headYear || undefined }, `At the beginning (${firstYear(CALENDAR)})`),
                  CALENDAR.headStartYears.map((y) => h('option', { value: y, selected: headYear === y || undefined }, `Take over in ${y} (turn ${turnOfYear(y, CALENDAR)})`))))
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
              colonyCharter,
            }, humans > 0 && headYear ? { turn: turnOfYear(headYear, CALENDAR), watch: watchHeadStart } : undefined),
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
