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
 * Aiming input from three sources:
 * - keyboard: a direction to move in (axis);
 * - mouse: an absolute point on screen to aim at (takePointer);
 * - touch and pen: a relative drag, like a trackpad, so the finger never
 *   covers what it aims at (takeDrag).
 * Pointer input accumulates between simulation steps and is consumed by the
 * step, so it is applied at a fixed rate whatever the frame or event rate.
 */
export class Input {
  private readonly keys = new Set<string>();
  private dragPointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  // Pending drag since the last step, in viewport heights, y pointing up.
  private dragX = 0;
  private dragY = 0;
  // Latest mouse position in normalized device coordinates, and whether it is new.
  private pointerX = 0;
  private pointerY = 0;
  private pointerMoved = false;

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

  /** Keyboard direction, each component in [-1, 1], y pointing up. */
  axis(): { x: number; y: number } {
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

  /** If the mouse moved since the last call, writes its position in normalized device coordinates and returns true. */
  takePointer(out: { x: number; y: number }): boolean {
    if (!this.pointerMoved) return false;
    this.pointerMoved = false;
    out.x = this.pointerX;
    out.y = this.pointerY;
    return true;
  }

  /** Writes the touch drag since the last call, in viewport heights (y up), and resets it. */
  takeDrag(out: { x: number; y: number }) {
    out.x = this.dragX;
    out.y = this.dragY;
    this.dragX = this.dragY = 0;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || this.dragPointer !== null) return;
    this.dragPointer = e.pointerId;
    this.target.setPointerCapture(e.pointerId);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const rect = this.target.getBoundingClientRect();
      this.pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
      this.pointerMoved = true;
      return;
    }
    if (e.pointerId !== this.dragPointer) return;
    const height = this.target.clientHeight;
    this.dragX += (e.clientX - this.lastX) / height;
    this.dragY -= (e.clientY - this.lastY) / height;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.dragPointer) this.dragPointer = null;
  };
}
