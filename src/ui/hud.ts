/** DOM overlay: FPS counter. */
export class Hud {
  private readonly fps = document.createElement('div');
  private frames = 0;
  private elapsed = 0;

  constructor(root: HTMLElement) {
    this.fps.className = 'hud-fps';
    root.append(this.fps);
  }

  update(dt: number) {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.elapsed)} fps`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }
}
