import { STICK_RADIUS, type Stick } from '../core/input';

/** DOM overlay: FPS counter and the touch joystick visual. */
export class Hud {
  private readonly fps = document.createElement('div');
  private readonly stickBase = document.createElement('div');
  private readonly stickKnob = document.createElement('div');
  private frames = 0;
  private elapsed = 0;

  constructor(root: HTMLElement) {
    this.fps.className = 'hud-fps';
    this.stickBase.className = 'stick-base';
    this.stickKnob.className = 'stick-knob';
    this.stickBase.style.width = this.stickBase.style.height = `${STICK_RADIUS * 2}px`;
    root.append(this.fps, this.stickBase, this.stickKnob);
  }

  update(dt: number, stick: Stick) {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.elapsed)} fps`;
      this.frames = 0;
      this.elapsed = 0;
    }

    const display = stick.active ? 'block' : 'none';
    this.stickBase.style.display = this.stickKnob.style.display = display;
    if (stick.active) {
      this.stickBase.style.left = `${stick.originX}px`;
      this.stickBase.style.top = `${stick.originY}px`;
      this.stickKnob.style.left = `${stick.originX + stick.dx}px`;
      this.stickKnob.style.top = `${stick.originY + stick.dy}px`;
    }
  }
}
