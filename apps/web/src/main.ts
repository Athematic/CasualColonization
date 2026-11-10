import { calendarOf, term, deserialize, gameCodeFromSearch, searchWithoutGameCode, formatDate, Game, headStartConfig, serialize, type GameConfig, type GameState } from '@cc/engine';
import { h } from './dom.js';
import { App } from './app.js';
import { savedStyle, setStyle } from './styles.js';
import './style.css';
import { landingScreen } from './ui/landing.js';
import { newGameScreen } from './ui/newgame.js';
import { pickSaveFile } from './save.js';
import { toast } from './ui/dialogs.js';
import { JobCancelled, turnRunner } from './turns/runner.js';

const host = document.getElementById('app')!;
let app: App | null = null;

function leaveGame(): void {
  app?.destroy();
  app = null;
  host.replaceChildren();
}

/** The title screen with the cover art. */
function showLanding(): void {
  leaveGame();
  const randomSeed = () => Math.floor(Math.random() * 1e9);
  landingScreen(host, {
    resume: resumeGame,
    newGame: () => showMenu(),
    quickGame: () =>
      startGame({ seed: randomSeed(), mapSize: 'medium', nations: ['england', 'france', 'netherlands', 'spain'], humans: ['england'], ai: { france: 'competent', netherlands: 'competent', spain: 'competent' }, historicalEvents: true, randomEvents: true, colonyCharter: true }),
    watch: () =>
      startGame({ seed: randomSeed(), mapSize: 'medium', nations: ['england', 'france', 'netherlands', 'spain'], humans: [], ai: { england: 'naive', france: 'competent', netherlands: 'combative', spain: 'creative' }, colonyCharter: true }),
    load: async () => {
      const loaded = await pickSaveFile();
      if (loaded?.state) resumeGame(loaded.state);
      else if (loaded) toast(loaded.error, 'error');
    },
  });
}

/** The new-game settings screen. */
function showMenu(code?: string): void {
  leaveGame();
  newGameScreen(host, startGame, resumeGame, showLanding, code);
}

export interface HeadStart {
  /** Turn on which the player takes over. */
  turn: number;
  /** Show the speedrun on the map, or skip straight to the hand-over. */
  watch: boolean;
}

function startGame(config: GameConfig, head?: HeadStart): void {
  if (!head || head.turn <= 0 || !config.humans.length) {
    run(Game.create(config));
    return;
  }
  const auto = headStartConfig(config, head.turn);
  if (head.watch) {
    run(Game.create(auto));
    return;
  }
  skipAhead(auto, head.turn);
}

/**
 * Plays the head start without drawing the map: in the engine worker when there is one (the page
 * stays responsive), otherwise on the page a slice at a time.
 */
function skipAhead(config: GameConfig, turn: number): void {
  let cancelled = false;
  const cal = calendarOf({ config });
  const bar = h('span', { style: 'width:0%' });
  const meter = h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Head start progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, bar);
  const label = h('p', { 'aria-live': 'polite' }, `Preparing ${term({ config }, 'colonyLand')}…`);
  const started = performance.now();
  host.replaceChildren(
    h('main', { class: 'menu-screen' },
      h('div', { class: 'menu-card' },
        h('h1', null, 'Head start'),
        h('p', { class: 'muted' }, `The computer is playing your nation until ${formatDate(turn, cal)}.`),
        meter,
        label,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { cancelled = true; turnRunner.cancel(); showLanding(); } }, 'Cancel')))),
  );
  let shown = -1;
  turnRunner
    .run({ type: 'headStart', config, turn }, (p) => {
      if (cancelled || p.turn === shown) return;
      shown = p.turn;
      // Later turns take longer (more colonies and units): by the square of the turn, the bar moves
      // about evenly in time (on the bench, 1600 is 11% of the way to 1700 in time, and 12% squared).
      const pct = Math.min(100, Math.round((p.turn / turn) ** 2 * 100));
      bar.style.width = `${pct}%`;
      meter.setAttribute('aria-valuenow', String(pct));
      label.textContent = `${formatDate(p.turn, cal)} of ${formatDate(turn, cal)} · turn ${p.turn} of ${turn}`;
    })
    .then(({ state }) => {
      if (cancelled) return;
      lastHeadStartMs = performance.now() - started;
      resumeGame(state);
    })
    .catch((err) => {
      if (cancelled || err instanceof JobCancelled) return;
      console.error(err);
      toast('The head start failed. Please try again.', 'error');
      showMenu();
    });
}

/** How long the last skipped head start took (for play-tests and the debug handle). */
let lastHeadStartMs = 0;

function resumeGame(state: GameState): void {
  run(new Game(state));
}

function run(game: Game): void {
  host.replaceChildren();
  app = new App(host, game, showLanding);
}

// Debug handle for the browser console and automated play-tests.
(window as unknown as { cc: object }).cc = {
  get app() { return app; },
  /** Whether computer turns run in the engine worker, how long the last skipped head start took, and the last job's timing. */
  get turns() { return { worker: turnRunner.usesWorker, lastHeadStartMs, lastJob: turnRunner.last }; },
};

interface HotHook {
  data?: { save?: string | null };
  ready?: (start: (data: HotHook['data']) => void) => void;
  snapshot?: (take: () => HotHook['data']) => void;
}

// When hosted somewhere that hot-swaps new versions (a claude.ai artifact), keep the game in progress.
const hot = (window as unknown as { claude?: { hot?: HotHook } }).claude?.hot;
hot?.snapshot?.(() => ({ save: app ? serialize(app.game.state) : null }));

function boot(data: HotHook['data']): void {
  setStyle(savedStyle());
  // A share link (?game=<code>) opens the New game screen filled in; nothing starts by itself, so an autosave is never replaced by surprise.
  const shared = gameCodeFromSearch(location.search);
  if (shared) {
    const rest = searchWithoutGameCode(location.search);
    history.replaceState(null, '', `${location.pathname}${rest}${location.hash}`);
    showMenu(shared);
    return;
  }
  if (data?.save) {
    try {
      resumeGame(deserialize(data.save));
      return;
    } catch {
      // Fall through to the title screen if the snapshot cannot be read.
    }
  }
  showLanding();
}

if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
