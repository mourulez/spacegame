import * as THREE from 'three';
import type { Vec2 } from '../core/input';
import { STEP } from '../core/loop';
import type { Area } from './play-area';

const KEY_EASE = 1 - Math.exp(-25 * STEP); // per-step blend toward the key velocity: snappy but still precise for taps
/** Seconds the keyboard takes to cross an area from side to side. */
const KEY_CROSS_TIME = 0.57;
/** Viewport heights of touch drag that cross an area from bottom to top: a swipe of well under half the screen height. */
const DRAG_CROSS = 1 / 2.6;

/**
 * A point steered around a rectangle by the player: the keyboard moves it at
 * a steady speed, a touch drag moves it by a fixed amount per viewport height
 * (like a trackpad, never toward the finger), and the mouse puts it on a spot
 * directly. Speeds and gains scale with the area, so every area feels the same.
 */
export class Steering {
  readonly pos = new THREE.Vector2();
  private readonly vel = new THREE.Vector2();
  private readonly keySpeed: number;
  private readonly dragGain: number;

  constructor(private readonly area: Area) {
    this.keySpeed = (2 * area.halfWidth) / KEY_CROSS_TIME;
    this.dragGain = (2 * area.halfHeight) / DRAG_CROSS;
  }

  /** `axis`: keyboard direction. `drag`: touch drag in viewport heights. `jump`: a point to go to (mouse), or null. */
  step(axis: Vec2, drag: Vec2, jump: THREE.Vector2 | null) {
    this.vel.x += (axis.x * this.keySpeed - this.vel.x) * KEY_EASE;
    this.vel.y += (axis.y * this.keySpeed - this.vel.y) * KEY_EASE;
    if (jump) this.pos.copy(jump);
    this.pos.x += this.vel.x * STEP + drag.x * this.dragGain;
    this.pos.y += this.vel.y * STEP + drag.y * this.dragGain;

    const { halfWidth, halfHeight } = this.area;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -halfWidth, halfWidth);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, -halfHeight, halfHeight);
  }

  /** Put it at (x, y) at rest. */
  reset(x: number, y: number) {
    this.pos.set(x, y);
    this.vel.set(0, 0);
  }
}
