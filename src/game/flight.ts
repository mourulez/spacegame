import * as THREE from 'three';
import { STEP } from '../core/loop';
import { BASE_PITCH } from './camera-rig';
import { CAMERA_FOLLOW, PLAY_SLOPE, SHIP_BOX } from './play-area';

export const SPEED = 100; // world units per second along the rail

/**
 * The rail: a designed closed loop the flight follows, in world space, above
 * the cloud deck (y = 0). Its curves turn the camera, and its climbs and dives
 * pitch it. The bank its curves call for goes mostly to the ship; the camera
 * takes only a share, so the horizon stays steady. The player never changes
 * the heading, so aiming never moves what is being aimed at.
 */
const RAIL = new THREE.CatmullRomCurve3(figureEight(), true, 'centripetal');
RAIL.arcLengthDivisions = 2000; // even speed along the whole loop
RAIL.updateArcLengths();
const RAIL_LENGTH = RAIL.getLength();
const TANGENT_SPAN = 2 / RAIL_LENGTH; // sample spacing (as a fraction of the loop) for the direction of travel

/** The rail banks the flight into its turns: roll per rad/s of turn rate. */
const BANK_PER_TURN = 2.2;
const MAX_RAIL_BANK = THREE.MathUtils.degToRad(35);
const RAIL_BANK_EASE = 1 - Math.exp(-3 * STEP);
/** Share of the rail's bank the camera takes. The ship takes the rest, so at rest it banks into the curves over a nearly level horizon. */
const VIEW_BANK_SHARE = 0.25;

/*
 * The camera rides the rail, following the ship around its box for
 * CAMERA_FOLLOW of the way, by moving only (see SHIP_BOX). Enemies and their
 * bullets live along the rail itself (see CombatFrame), so the ship's moves
 * count in full against them.
 */
const LEAN_ROLL = THREE.MathUtils.degToRad(7); // with the ship at a side edge, on top of the camera's share of the rail's bank
/** How fast the camera drifts back onto the rail once the ship is gone. */
const FOLLOW_EASE = 1 - Math.exp(-3 * STEP);
const LEAN_ROLL_EASE = 1 - Math.exp(-3.5 * STEP);

/** How fast the flight comes to a halt when the player dies, and gets going again: about half a second. */
const SPEED_EASE = 1 - Math.exp(-6 * STEP);
/** While halted, the view turns only once its target leaves this share of the play area, and just enough to keep it there. */
const KEEP_IN_VIEW = 0.6;
const KEEP_YAW = Math.atan(PLAY_SLOPE.x * KEEP_IN_VIEW);
const KEEP_PITCH = Math.atan(PLAY_SLOPE.y * KEEP_IN_VIEW);
const LOOK_EASE = 1 - Math.exp(-5 * STEP);

const scratchEuler = new THREE.Euler();
const scratchQuat = new THREE.Quaternion();
const scratchVec = new THREE.Vector3();

/**
 * The player's flight: along the rail at a constant speed, coming to a halt
 * when the player goes down. The camera rig rides on `pos`, so the horizon
 * moves because the camera really turns, pitches and rolls. The ship flies
 * with the rail's direction and bank (`railAttitude`, `bank`), plus its own.
 */
export class Flight {
  /** The camera: on the rail, plus its share of the ship's place in the box. */
  readonly pos = new THREE.Vector3();
  /** The rail itself, for the current step: where the combat frame is. */
  readonly railPos = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private distance = 0; // along the rail
  /** Current speed along the rail: SPEED, or easing to a halt and back. */
  private speed = SPEED;
  private halted = false;

  // The rail's own direction and bank: also the combat frame's orientation.
  private railYaw = 0;
  private railPitch = 0;
  private railBank = 0;
  private railYawRate = 0;

  private leanRoll = 0;
  // The camera's offset from the rail, across the view (x right, y up), in world units.
  private readonly follow = new THREE.Vector2();
  // Extra turn of the view, beyond the rail's heading and slope, to keep something in view (see keepInView).
  private lookYaw = 0;
  private lookPitch = 0;

  // Final attitude, current and previous step.
  private yaw = 0;
  private prevYaw = 0;
  private pitch = 0;
  private prevPitch = 0;
  private roll = 0;
  private prevRoll = 0;

  // Scratch vectors.
  private readonly railPoint = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly behind = new THREE.Vector3();
  private readonly local = new THREE.Vector3();

  constructor() {
    this.sampleRail();
    this.railYaw = this.headingOfRail();
    this.place();
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevRoll = this.roll;
  }

  /** How fast the rail is turning, in rad/s, positive to the left. */
  get turnRate(): number {
    return this.railYawRate;
  }

  /** The rail's bank, for the ship to fly with. Positive to the left. */
  get bank(): number {
    return this.railBank;
  }

  /** The flight's velocity, in world units per second, for the current step. */
  velocity(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -this.speed).applyQuaternion(this.railAttitude(scratchQuat));
  }

  /** Ease to a halt along the rail (true), or back up to speed (false). */
  halt(halted: boolean) {
    this.halted = halted;
  }

  /**
   * `ship`: the ship's place in its box (see SHIP_BOX), for the camera to
   * follow and lean with, or null once it is gone.
   */
  step(ship: THREE.Vector2 | null) {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevRoll = this.roll;

    // Along the rail.
    this.speed += ((this.halted ? 0 : SPEED) - this.speed) * SPEED_EASE;
    this.distance += this.speed * STEP;
    this.sampleRail();
    const turn = wrapAngle(this.headingOfRail() - this.railYaw); // keeps the yaw continuous
    this.railYaw += turn;
    this.railYawRate = turn / STEP;
    const bank = THREE.MathUtils.clamp(this.railYawRate * BANK_PER_TURN, -MAX_RAIL_BANK, MAX_RAIL_BANK);
    this.railBank += (bank - this.railBank) * RAIL_BANK_EASE;

    // Rigidly with the ship while it flies, so it never leaves the ship area on screen.
    if (ship) {
      this.follow.copy(ship).multiplyScalar(CAMERA_FOLLOW);
    } else {
      this.follow.multiplyScalar(1 - FOLLOW_EASE);
    }
    // Right is negative roll (three.js rotations are counterclockwise).
    const side = ship ? ship.x / SHIP_BOX.halfWidth : 0;
    this.leanRoll += (-side * LEAN_ROLL - this.leanRoll) * LEAN_ROLL_EASE;
    this.place();
  }

  /**
   * Turn the view beyond the rail's heading and slope just enough to keep
   * `target` (world space) in view, or ease back to the rail when null.
   * Call after the step.
   */
  keepInView(target: THREE.Vector3 | null) {
    let yaw = 0;
    let pitch = 0;
    if (target) {
      // Where the target is, seen from the camera along the rail (without the extra turn or the roll).
      scratchQuat.setFromEuler(scratchEuler.set(this.railPitch + BASE_PITCH, this.railYaw, 0, 'YXZ')).invert();
      const local = this.local.subVectors(target, this.pos).applyQuaternion(scratchQuat);
      const angleYaw = Math.atan2(-local.x, -local.z);
      const anglePitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
      yaw = angleYaw - THREE.MathUtils.clamp(angleYaw, -KEEP_YAW, KEEP_YAW);
      pitch = anglePitch - THREE.MathUtils.clamp(anglePitch, -KEEP_PITCH, KEEP_PITCH);
    }
    this.lookYaw += (yaw - this.lookYaw) * LOOK_EASE;
    this.lookPitch += (pitch - this.lookPitch) * LOOK_EASE;
    this.place();
  }

  /** Current orientation, pitched an extra `pitchOffset`, as a quaternion. */
  attitude(out: THREE.Quaternion, pitchOffset: number): THREE.Quaternion {
    return out.setFromEuler(scratchEuler.set(this.pitch + pitchOffset, this.yaw, this.roll, 'YXZ'));
  }

  /** The rail's direction alone, without bank or the player's moves: the combat frame's orientation. */
  railAttitude(out: THREE.Quaternion): THREE.Quaternion {
    return out.setFromEuler(scratchEuler.set(this.railPitch, this.railYaw, 0, 'YXZ'));
  }

  /** Put `object` at the interpolated position and attitude, pitched an extra `pitchOffset`. */
  apply(object: THREE.Object3D, alpha: number, pitchOffset: number) {
    const lerp = THREE.MathUtils.lerp;
    object.position.lerpVectors(this.prevPos, this.pos, alpha);
    object.rotation.set(
      lerp(this.prevPitch, this.pitch, alpha) + pitchOffset,
      lerp(this.prevYaw, this.yaw, alpha),
      lerp(this.prevRoll, this.roll, alpha),
      'YXZ', // heading, then pitch, then roll around the nose
    );
  }

  /** Rail point and direction of travel at the current distance. */
  private sampleRail() {
    const u = fract(this.distance / RAIL_LENGTH);
    RAIL.getPointAt(u, this.railPoint);
    RAIL.getPointAt(fract(u + TANGENT_SPAN), this.ahead);
    RAIL.getPointAt(fract(u - TANGENT_SPAN), this.behind);
    this.ahead.sub(this.behind).normalize(); // direction of travel
    this.railPitch = Math.asin(this.ahead.y);
  }

  private headingOfRail(): number {
    return Math.atan2(-this.ahead.x, -this.ahead.z);
  }

  /** The camera's position and attitude, from the rail, the view's extra turn and its share of the ship's place. */
  private place() {
    this.railPos.copy(this.railPoint);
    this.yaw = this.railYaw + this.lookYaw;
    this.pitch = this.railPitch + this.lookPitch;
    this.roll = this.railBank * VIEW_BANK_SHARE + this.leanRoll;
    const across = scratchVec.set(this.follow.x, this.follow.y, 0).applyQuaternion(this.attitude(scratchQuat, BASE_PITCH));
    this.pos.copy(this.railPoint).add(across);
  }
}

/** `count` points evenly spaced along the whole rail loop, for laying out scenery around it. */
export function railPoints(count: number): THREE.Vector3[] {
  return RAIL.getSpacedPoints(count).slice(0, count); // the last point repeats the first
}

function fract(x: number) {
  return x - Math.floor(x);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Test route: a figure eight, so it turns right and left equally (a simple
 * loop would bank the same way all the time), climbing and diving in long
 * waves. It crosses itself in the middle, where the run starts, straight
 * toward the painted sun (-Z). Lobes are long and narrow for turns of about
 * 500 units radius at their ends.
 */
function figureEight(): THREE.Vector3[] {
  const WIDTH = 400; // half width of each lobe
  const LENGTH = 1280; // from the crossing to the end of each lobe
  const POINTS = 96; // enough to follow the climbs and dives smoothly
  const WAVES = 7; // climbs and dives around the loop
  // Heights 8 to 38: the lowest keeps the camera well above the clouds.
  const HEIGHT = 23;
  const SWELL = 15;
  // The eight crosses diagonally; rotate it so the start heads straight to -Z.
  const angle = Math.atan2(2 * WIDTH, LENGTH);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < POINTS; i++) {
    const t = (i / POINTS) * Math.PI * 2;
    const x = WIDTH * Math.sin(2 * t);
    const z = -LENGTH * Math.sin(t);
    points.push(new THREE.Vector3(x * cos + z * sin, HEIGHT + SWELL * Math.sin(WAVES * t), -x * sin + z * cos));
  }
  return points;
}

