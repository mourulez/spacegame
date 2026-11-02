const ROLL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>';

/** DOM overlay: FPS counter, shield bar (bottom left) and barrel roll charge (bottom right). */
export class Hud {
  private readonly fps = document.createElement('div');
  private frames = 0;
  private elapsed = 0;
  private shield: HTMLElement | null = null;
  private shieldCells: HTMLElement[] = [];
  private shieldValue = -1;
  private readonly roll = document.createElement('div');
  private readonly rollFill = document.createElement('div');
  private rollValue = -1; // percent

  constructor(private readonly root: HTMLElement) {
    this.fps.className = 'hud-fps';
    root.append(this.fps);

    this.roll.className = 'hud-roll';
    this.roll.setAttribute('role', 'meter');
    this.roll.setAttribute('aria-label', 'Barrel roll');
    this.roll.setAttribute('aria-valuemin', '0');
    this.roll.setAttribute('aria-valuemax', '100');
    this.roll.innerHTML = ROLL_ICON;
    const track = document.createElement('div');
    track.className = 'hud-roll-track';
    this.rollFill.className = 'hud-roll-fill';
    track.append(this.rollFill);
    this.roll.append(track);
    root.append(this.roll);
    this.setRoll(1);
  }

  /** How ready the barrel roll is, 0 to 1. Touches the DOM only when it changes by a percent. */
  setRoll(charge: number) {
    const value = Math.round(charge * 100);
    if (value === this.rollValue) return;
    this.rollValue = value;
    this.rollFill.style.transform = `scaleX(${value / 100})`;
    this.roll.setAttribute('aria-valuenow', String(value));
    this.roll.dataset.ready = String(value === 100);
    this.roll.classList.toggle('ready', value === 100);
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
