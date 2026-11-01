import './style.css';
import { Game } from './game/game';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

new Game(canvas, ui).start();
