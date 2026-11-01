/** Virtual joystick state, in CSS pixels relative to the viewport. */
export interface Stick {
  active: boolean;
  originX: number;
  originY: number;
  /** Knob offset from origin, clamped to STICK_RADIUS. */
  dx: number;
  dy: number;
}

export const STICK_RADIUS = 60;

const KEY_AXES: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * Unifies keyboard (desktop) and a floating touch joystick (mobile/tablet).
 * The joystick uses Pointer Events, so it can also be tested on desktop by
 * dragging with the mouse.
 */
export class Input {
  readonly stick: Stick = { active: false, originX: 0, originY: 0, dx: 0, dy: 0 };
  private readonly keys = new Set<string>();
  private pointerId: number | null = null;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code in KEY_AXES) {
        this.keys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Movement axis, each component in [-1, 1], y pointing up. */
  axis(): { x: number; y: number } {
    if (this.stick.active) {
      return { x: this.stick.dx / STICK_RADIUS, y: -this.stick.dy / STICK_RADIUS };
    }
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const [kx, ky] = KEY_AXES[code];
      x += kx;
      y += ky;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.target.setPointerCapture(e.pointerId);
    Object.assign(this.stick, { active: true, originX: e.clientX, originY: e.clientY, dx: 0, dy: 0 });
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    let dx = e.clientX - this.stick.originX;
    let dy = e.clientY - this.stick.originY;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.stick.dx = dx;
    this.stick.dy = dy;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.stick.active = false;
  };
}
