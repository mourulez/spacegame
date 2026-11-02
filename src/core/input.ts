const AIM_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const SHIP_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

/** A 2D input value, y pointing up. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Which control a touch drag drives. */
type Zone = 'aim' | 'ship';

interface Drag {
  zone: Zone;
  lastX: number;
  lastY: number;
}

/**
 * Two controls, the ship and the reticle, from three sources:
 * - keyboard: a direction to move in, WASD for the ship and arrows for the
 *   reticle (shipAxis, aimAxis);
 * - mouse: an absolute point on screen to aim at (takePointer);
 * - touch and pen: relative drags, like a trackpad, so the finger never
 *   covers what it moves: in the left half of the screen for the ship, the
 *   right half for the reticle (takeShipDrag, takeDrag). A finger keeps its
 *   half even if it crosses the middle. Nothing is drawn for the zones.
 *
 * Pointer input accumulates between simulation steps and is consumed by the
 * step, so it is applied at a fixed rate whatever the frame or event rate.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly drags = new Map<number, Drag>();
  // Pending drags since the last step, in viewport heights, y pointing up.
  private readonly aimDrag: Vec2 = { x: 0, y: 0 };
  private readonly shipDrag: Vec2 = { x: 0, y: 0 };
  // Latest mouse position in normalized device coordinates, and whether it is new.
  private pointerX = 0;
  private pointerY = 0;
  private pointerMoved = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code in AIM_KEYS || e.code in SHIP_KEYS) {
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

  /** Keyboard direction for the reticle, each component in [-1, 1]. */
  aimAxis(out: Vec2): Vec2 {
    return normalize(this.readKeys(AIM_KEYS, out));
  }

  /** Keyboard direction for the ship, each component in [-1, 1]. */
  shipAxis(out: Vec2): Vec2 {
    return normalize(this.readKeys(SHIP_KEYS, out));
  }

  /** If the mouse moved since the last call, writes its position in normalized device coordinates and returns true. */
  takePointer(out: Vec2): boolean {
    if (!this.pointerMoved) return false;
    this.pointerMoved = false;
    out.x = this.pointerX;
    out.y = this.pointerY;
    return true;
  }

  /** Writes the reticle's touch drag since the last call, in viewport heights (y up), and resets it. */
  takeDrag(out: Vec2) {
    take(this.aimDrag, out);
  }

  /** Writes the ship's touch drag since the last call, in viewport heights (y up), and resets it. */
  takeShipDrag(out: Vec2) {
    take(this.shipDrag, out);
  }

  private readKeys(map: Record<string, [number, number]>, out: Vec2): Vec2 {
    out.x = out.y = 0;
    for (const code of this.keys) {
      const axis = map[code];
      if (!axis) continue;
      out.x += axis[0];
      out.y += axis[1];
    }
    return out;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const rect = this.target.getBoundingClientRect();
    const zone: Zone = e.clientX < rect.left + rect.width / 2 ? 'ship' : 'aim';
    this.drags.set(e.pointerId, { zone, lastX: e.clientX, lastY: e.clientY });
    this.target.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const rect = this.target.getBoundingClientRect();
      this.pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
      this.pointerMoved = true;
      return;
    }
    const drag = this.drags.get(e.pointerId);
    if (!drag) return;
    const height = this.target.clientHeight;
    const pending = drag.zone === 'ship' ? this.shipDrag : this.aimDrag;
    pending.x += (e.clientX - drag.lastX) / height;
    pending.y -= (e.clientY - drag.lastY) / height;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.drags.delete(e.pointerId);
  };
}

function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len > 1) {
    v.x /= len;
    v.y /= len;
  }
  return v;
}

function take(pending: Vec2, out: Vec2) {
  out.x = pending.x;
  out.y = pending.y;
  pending.x = pending.y = 0;
}
