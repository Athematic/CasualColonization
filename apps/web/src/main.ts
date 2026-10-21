import { Game, type GameConfig, type GameState } from '@cc/engine';
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

setStyle(savedStyle());
showMenu();
