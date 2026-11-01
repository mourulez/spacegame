import * as THREE from 'three';

/** Simulation timestep in seconds. Game logic always advances by exactly this amount. */
export const STEP = 1 / 60;

/** Frame times above this are dropped instead of simulated, so a long stall can't trigger a burst of catch-up steps. */
const MAX_FRAME_TIME = 0.25;

export interface LoopHandlers {
  /** Advance the game state by exactly STEP seconds. */
  step(): void;
  /**
   * Draw the current state. `alpha` in [0, 1) is how far real time has moved
   * past the last step, for interpolating between the previous and current
   * state. `frameDt` is the real frame time, for display only (e.g. an FPS counter).
   */
  render(alpha: number, frameDt: number): void;
}

/**
 * Fixed-timestep loop with interpolated rendering. Gameplay is identical on
 * every refresh rate (60/90/120/144 Hz) and unaffected by frame drops.
 */
export class FixedLoop {
  private readonly timer = new THREE.Timer();
  private accumulator = 0;

  constructor(private readonly handlers: LoopHandlers) {
    // Ignore time spent in a hidden tab instead of seeing one huge delta on return.
    this.timer.connect(document);
  }

  frame(time: number) {
    this.timer.update(time);
    const frameDt = Math.min(this.timer.getDelta(), MAX_FRAME_TIME);

    this.accumulator += frameDt;
    while (this.accumulator >= STEP) {
      this.handlers.step();
      this.accumulator -= STEP;
    }
    this.handlers.render(this.accumulator / STEP, frameDt);
  }
}
