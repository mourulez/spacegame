/** DOM overlay: FPS counter and shield bar. */
export class Hud {
  private readonly fps = document.createElement('div');
  private frames = 0;
  private elapsed = 0;
  private shield: HTMLElement | null = null;
  private shieldCells: HTMLElement[] = [];
  private shieldValue = -1;

  constructor(private readonly root: HTMLElement) {
    this.fps.className = 'hud-fps';
    root.append(this.fps);
  }

  /** Show a shield bar of `max` cells. */
  addShield(max: number) {
    this.shield = document.createElement('div');
    this.shield.className = 'hud-shield';
    this.shield.setAttribute('role', 'meter');
    this.shield.setAttribute('aria-label', 'Shield');
    this.shield.setAttribute('aria-valuemin', '0');
    this.shield.setAttribute('aria-valuemax', String(max));
    for (let i = 0; i < max; i++) {
      const cell = document.createElement('div');
      cell.className = 'hud-shield-cell';
      this.shieldCells.push(cell);
    }
    this.shield.append(...this.shieldCells);
    this.root.append(this.shield);
  }

  /** Cells of shield left. Touches the DOM only when it changes. */
  setShield(value: number) {
    if (!this.shield || value === this.shieldValue) return;
    this.shieldValue = value;
    this.shield.setAttribute('aria-valuenow', String(value));
    this.shield.dataset.value = String(value);
    this.shield.classList.toggle('low', value <= 1);
    this.shieldCells.forEach((cell, i) => cell.classList.toggle('full', i < value));
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
