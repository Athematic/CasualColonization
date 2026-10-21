import { createGame, deserialize, formatDate, Game, handOver, headStartConfig, playUntil, serialize, type GameConfig, type GameState } from '@cc/engine';
import { h } from './dom.js';
import { App } from './app.js';
import { savedStyle, setStyle } from './styles.js';
import './style.css';
import { landingScreen } from './ui/landing.js';
import { newGameScreen } from './ui/newgame.js';
import { pickSaveFile } from './save.js';
import { toast } from './ui/dialogs.js';

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
    newGame: showMenu,
    quickGame: () =>
      startGame({ seed: randomSeed(), mapSize: 'medium', nations: ['england', 'france', 'netherlands', 'spain'], humans: ['england'], ai: { france: 'competent', netherlands: 'competent', spain: 'competent' } }),
    watch: () =>
      startGame({ seed: randomSeed(), mapSize: 'medium', nations: ['england', 'france', 'netherlands', 'spain'], humans: [], ai: { england: 'naive', france: 'competent', netherlands: 'combative', spain: 'creative' } }),
    load: async () => {
      const loaded = await pickSaveFile();
      if (loaded?.state) resumeGame(loaded.state);
      else if (loaded) toast(loaded.error, 'error');
    },
  });
}

/** The new-game settings screen. */
function showMenu(): void {
  leaveGame();
  newGameScreen(host, startGame, resumeGame, showLanding);
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
  skipAhead(createGame(auto), head.turn);
}

/** Plays the head start without drawing the map, a few rounds at a time so the page stays responsive. */
function skipAhead(state: GameState, turn: number): void {
  let cancelled = false;
  const bar = h('span', { style: 'width:0%' });
  const label = h('p', null, 'Preparing the New World…');
  host.replaceChildren(
    h('main', { class: 'menu-screen' },
      h('div', { class: 'menu-card' },
        h('h1', null, 'Head start'),
        h('p', { class: 'muted' }, `The computer is playing your nation until ${formatDate(turn)}.`),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Head start progress' }, bar),
        label,
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { cancelled = true; showLanding(); } }, 'Cancel')))),
  );
  const step = () => {
    if (cancelled) return;
    const done = playUntil(state, turn, 3);
    bar.style.width = `${Math.min(100, Math.round((state.turn / turn) * 100))}%`;
    label.textContent = `${formatDate(state.turn)} of ${formatDate(turn)}`;
    if (!done) {
      setTimeout(step, 0);
      return;
    }
    handOver(state);
    resumeGame(state);
  };
  setTimeout(step, 30);
}

function resumeGame(state: GameState): void {
  run(new Game(state));
}

function run(game: Game): void {
  host.replaceChildren();
  app = new App(host, game, showLanding);
}

// Debug handle for the browser console and automated play-tests.
(window as unknown as { cc: object }).cc = { get app() { return app; } };

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
