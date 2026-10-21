import { deserialize, Game, serialize, type GameConfig, type GameState } from '@cc/engine';
import { App } from './app.js';
import { savedStyle, setStyle } from './styles.js';
import './style.css';
import { newGameScreen } from './ui/newgame.js';

const host = document.getElementById('app')!;
let app: App | null = null;

function showMenu(): void {
  app?.destroy();
  app = null;
  host.replaceChildren();
  newGameScreen(host, startGame, resumeGame);
}

function startGame(config: GameConfig): void {
  run(Game.create(config));
}

function resumeGame(state: GameState): void {
  run(new Game(state));
}

function run(game: Game): void {
  host.replaceChildren();
  app = new App(host, game, showMenu);
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
      // Fall through to the menu if the snapshot cannot be read.
    }
  }
  showMenu();
}

if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
