import './style.css';
import { Game } from './game/game';
import { addFullscreenButton } from './ui/fullscreen';
import { addRotatePrompt } from './ui/rotate-prompt';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

new Game(canvas, ui).start();
addRotatePrompt(ui);
addFullscreenButton(ui);
