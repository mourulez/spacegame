import * as THREE from 'three';
import { STEP } from '../core/loop';
import type { Flight } from './flight';
import { SHIP_AREA, SHIP_DISTANCE, SHIP_REST_Y } from './play-area';
import { mergeParts, mirrorX, outlineGeometry, outlineMaterial, toonRamp } from './toon';

// The ship's spring toward its steering: critically damped, so it settles smoothly without overshooting.
const FREQ = 9; // rad/s
// Roll into sideways moves: about 35 degrees at the keyboard's full sideways speed.
const BANK_PER_SPEED = 0.18; // radians of roll per ship-area half width per second of lateral speed
const BANK_PER_OFFSET = 0.2; // extra roll at the side edges; the camera already banks with the turn
const MAX_BANK = THREE.MathUtils.degToRad(45); // the rail's bank and the player's together
const BANK_EASE = 1 - Math.exp(-10 * STEP);
const OUTLINE_WIDTH = 0.022; // world units
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
/** Where the shots leave from, in the ship's own space: just ahead of the nose. */
const MUZZLE = new THREE.Vector3(0, 0, -1.4);
const FLASH_STEPS = 6; // how long a hit flashes the ship white
const FLASH_COLOR = new THREE.Color(0xffffff);
const NO_EMISSIVE = new THREE.Color(0x000000);

// Falling after death: under gravity, losing its forward speed to drag, spinning around its nose.
const GRAVITY = 15; // world units per second, per second
const FALL_DRAG = Math.exp(-1.5 * STEP); // per step, on horizontal speed only
const FALL_SPIN = 7; // rad/s
const FALL_NOSE_EASE = 1 - Math.exp(-4 * STEP); // how fast the nose turns to follow its fall

/**
 * The player's ship, in the camera rig's space. It follows its own steering
 * around the ship area (steer). Its nose always points exactly at
 * the reticle; it banks into the rail's curves (the part of the bank the
 * camera does not take) and into its own sideways moves. When it dies it
 * leaves the rig for world space and falls (die, fall).
 * Cel shaded: toon materials with a three-tone ramp plus an
 * inverted-hull outline. Four draw calls in total.
 */
export class Ship {
  readonly object = new THREE.Group();
  // Simulation state for the current and previous step; render() interpolates between them.
  private readonly pos = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly prevQuat = new THREE.Quaternion();
  private roll = 0; // radians, positive to the left
  private readonly vel = new THREE.Vector2(); // across its plane, world units/s
  private flash = 0; // steps of hit flash left
  /** Whether it is falling in world space after its death. */
  falling = false;
  private readonly fallVel = new THREE.Vector3();
  private spin = 0;
  private readonly materials: THREE.MeshToonMaterial[];

  // Scratch objects, reused every step.
  private readonly look = new THREE.Matrix4();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly fallQuat = new THREE.Quaternion();
  private readonly scratch = new THREE.Vector3();

  constructor() {
    const ramp = toonRamp();
    const { hull, trim, glow } = buildGeometry();
    const hullMaterial = new THREE.MeshToonMaterial({ color: 0xe4e9f0, gradientMap: ramp });
    const trimMaterial = new THREE.MeshToonMaterial({ color: 0x34405c, gradientMap: ramp });
    this.materials = [hullMaterial, trimMaterial];
    const hullMesh = new THREE.Mesh(hull, hullMaterial);
    const trimMesh = new THREE.Mesh(trim, trimMaterial);
    const glowMesh = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ color: 0xffb04a, toneMapped: false }));
    const outline = new THREE.Mesh(outlineGeometry([hull, trim]), outlineMaterial(0x0c1222, OUTLINE_WIDTH));
    this.object.add(hullMesh, trimMesh, glowMesh, outline);
  }

  /** Jump to rest, low in the middle of the ship area, ready to fly. */
  rest(reticle: THREE.Vector3) {
    this.falling = false;
    this.flash = 0;
    this.vel.set(0, 0);
    this.pos.set(0, SHIP_REST_Y, -SHIP_DISTANCE);
    this.roll = 0;
    this.aim(reticle);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  /**
   * Follow `target` (its steering, on its plane) with a
   * critically damped spring, so it settles without overshooting; bank with
   * the rail (`restRoll`), into sideways moves and toward the side it is on.
   */
  steer(target: THREE.Vector2, reticle: THREE.Vector3, restRoll: number) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (this.flash > 0) this.flash--;

    const k = FREQ * FREQ;
    const c = 2 * FREQ;
    this.vel.x += (k * (target.x - this.pos.x) - c * this.vel.x) * STEP;
    this.vel.y += (k * (target.y - this.pos.y) - c * this.vel.y) * STEP;
    this.pos.x += this.vel.x * STEP;
    this.pos.y += this.vel.y * STEP;
    // Never out of its area, whatever the step.
    const { halfWidth, halfHeight } = SHIP_AREA;
    if (Math.abs(this.pos.x) > halfWidth) {
      this.pos.x = Math.sign(this.pos.x) * halfWidth;
      this.vel.x = 0;
    }
    if (Math.abs(this.pos.y) > halfHeight) {
      this.pos.y = Math.sign(this.pos.y) * halfHeight;
      this.vel.y = 0;
    }

    const bank = restRoll - (this.vel.x / halfWidth) * BANK_PER_SPEED - this.side * BANK_PER_OFFSET;
    this.roll += (THREE.MathUtils.clamp(bank, -MAX_BANK, MAX_BANK) - this.roll) * BANK_EASE;

    this.aim(reticle);
  }

  /** How far to the side of its area it is, -1 (left edge) to 1 (right edge). */
  get side(): number {
    return this.pos.x / SHIP_AREA.halfWidth;
  }

  /** Its center for the current step, in rig space (world space once falling). */
  center(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos);
  }

  /** Flash white: it was hit. */
  hit() {
    this.flash = FLASH_STEPS;
  }

  /**
   * Leave the rig for world space, keeping its place, attitude and velocity:
   * the flight's along the rail plus its own across the screen. `view` is the
   * rig's attitude (see Flight.attitude). The caller moves `object` to the scene.
   */
  die(flight: Flight, view: THREE.Quaternion) {
    this.fallVel.set(this.vel.x, this.vel.y, 0).applyQuaternion(view).add(flight.velocity(this.scratch));
    this.pos.applyQuaternion(view).add(flight.pos);
    this.quat.premultiply(view);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.falling = true;
    this.flash = 0;
    this.spin = 0;
  }

  /** Fall: carry on forward while slowing down, drop under gravity, nose down along the fall and spin. */
  fall() {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.fallVel.x *= FALL_DRAG;
    this.fallVel.z *= FALL_DRAG;
    this.fallVel.y -= GRAVITY * STEP;
    this.pos.addScaledVector(this.fallVel, STEP);

    this.spin += FALL_SPIN * STEP;
    this.scratch.addVectors(this.pos, this.fallVel);
    this.fallQuat.setFromRotationMatrix(this.look.lookAt(this.pos, this.scratch, UP));
    this.fallQuat.multiply(this.rollQuat.setFromAxisAngle(FORWARD, this.spin));
    this.quat.slerp(this.fallQuat, FALL_NOSE_EASE);
  }

  /** Where shots leave from, for the current step, in rig space. */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(MUZZLE).applyQuaternion(this.quat).add(this.pos);
  }

  render(alpha: number) {
    this.object.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
    const emissive = this.flash > 0 ? FLASH_COLOR : NO_EMISSIVE;
    for (const material of this.materials) material.emissive.copy(emissive);
  }

  /** Nose (-Z) exactly toward the reticle, then roll around the nose, which keeps it pointing there. */
  private aim(reticle: THREE.Vector3) {
    this.quat.setFromRotationMatrix(this.look.lookAt(this.pos, reticle, UP));
    this.quat.multiply(this.rollQuat.setFromAxisAngle(FORWARD, this.roll));
  }
}

/** Low-poly fighter, nose toward -Z, about 2.2 units long and 2 wide. */
function buildGeometry() {
  const hull: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const NOSE_TO_MINUS_Z = -Math.PI / 2; // rotateX: a +Y-pointing primitive then points to -Z

  // Fuselage and nose, slightly flattened.
  hull.push(
    new THREE.CylinderGeometry(0.16, 0.24, 1.3, 8).rotateX(NOSE_TO_MINUS_Z).scale(1.15, 0.8, 1).translate(0, 0, 0.15),
    new THREE.ConeGeometry(0.16, 0.8, 8).rotateX(NOSE_TO_MINUS_Z).scale(1.15, 0.8, 1).translate(0, 0, -0.9),
  );

  // Canopy.
  trim.push(new THREE.SphereGeometry(0.14, 10, 6).scale(1, 0.75, 2.6).translate(0, 0.12, -0.42));

  // Swept wings, drawn in the XZ plane (shape y = world z), with slight anhedral.
  for (const side of [1, -1]) {
    const shape = new THREE.Shape([
      new THREE.Vector2(0.15, -0.35),
      new THREE.Vector2(1.05, 0.45),
      new THREE.Vector2(1.1, 0.65),
      new THREE.Vector2(0.15, 0.72),
    ]);
    const wing = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false })
      .rotateX(Math.PI / 2) // shape y -> z, extrusion -> -y
      .translate(0, 0.03, 0)
      .rotateZ(-0.06)
      .translate(0, -0.05, 0);
    if (side < 0) mirrorX(wing);
    hull.push(wing);

    // Dark leading-edge stripe near the wingtip.
    const stripe = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0.75, 0.15),
        new THREE.Vector2(1.05, 0.45),
        new THREE.Vector2(1.08, 0.56),
        new THREE.Vector2(0.75, 0.3),
      ]),
      { depth: 0.07, bevelEnabled: false },
    )
      .rotateX(Math.PI / 2)
      .translate(0, 0.035, 0)
      .rotateZ(-0.06)
      .translate(0, -0.05, 0);
    if (side < 0) mirrorX(stripe);
    trim.push(stripe);

    // Tail fin, canted outward. Drawn in the ZY plane (shape x = world z).
    const fin = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0.3, 0),
        new THREE.Vector2(0.78, 0),
        new THREE.Vector2(0.82, 0.45),
        new THREE.Vector2(0.62, 0.45),
      ]),
      { depth: 0.04, bevelEnabled: false },
    )
      .rotateY(-Math.PI / 2) // shape x -> z, extrusion -> -x
      .translate(0.02, 0, 0)
      .rotateZ(-side * 0.35)
      .translate(side * 0.2, 0.08, 0);
    trim.push(fin);

    // Engine nacelle and its exhaust glow.
    trim.push(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 8).rotateX(NOSE_TO_MINUS_Z).translate(side * 0.14, -0.02, 0.76));
    glow.push(new THREE.CircleGeometry(0.095, 10).translate(side * 0.14, -0.02, 1.012));
  }

  return { hull: mergeParts(hull), trim: mergeParts(trim), glow: mergeParts(glow) };
}
