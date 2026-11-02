import * as THREE from 'three';
import { STEP } from '../core/loop';
import { AIM_AREA } from './play-area';

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
 * The box around the rail the ship moves in, following the reticle: at rest
 * (reticle centered) the ship is on the rail. The camera follows the ship
 * across the box rigidly, by moving only, for a fixed share of the way, so
 * the ship moves on screen by the rest and everything moves as one, with no
 * lag to catch up on. Enemies and shots ride with the camera (see
 * CombatFrame), so moving never shifts them away from the reticle.
 */
const BOX = { x: 6, y: 4 } as const; // world units either side of the rail, and above and below it
// The ship's spring toward where the reticle puts it in the box: critically damped,
// so it settles smoothly without overshooting.
const SHIP_FREQ = 9; // rad/s
/** Share of the ship's place in the box the camera follows. The rest, at most 1.5 by 1, is what the ship moves on screen. */
const CAMERA_FOLLOW = 0.75;
const LEAN_ROLL = THREE.MathUtils.degToRad(7); // with the reticle at a side edge, on top of the camera's share of the rail's bank
const LEAN_ROLL_EASE = 1 - Math.exp(-3.5 * STEP);
/** Nose angle per climb angle while the camera moves up or down the box, like an angle of attack. */
const ATTITUDE_GAIN = 0.8;

const scratchEuler = new THREE.Euler();

/**
 * The player's flight: along the rail at a constant speed, with the ship
 * moved around the box by the reticle and the camera following it. The
 * camera rig rides on `pos`, so the horizon moves because the camera really
 * turns, pitches and rolls. The ship takes its place on screen from
 * `shipOffset`, and adds the rest of the rail's bank (`restRoll`) to its own.
 */
export class Flight {
  readonly pos = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private distance = 0; // along the rail

  // The rail's own direction and bank: also the combat frame's orientation.
  private railYaw = 0;
  private railPitch = 0;
  private railBank = 0;
  private railYawRate = 0;

  /** The ship relative to the camera, across the screen (x right, y up), in world units. */
  readonly shipOffset = new THREE.Vector2();
  /** The ship's velocity across the box, in world units per second. */
  readonly shipVel = new THREE.Vector2();

  // The ship's place in the box; the camera is at CAMERA_FOLLOW of it.
  private readonly ship = new THREE.Vector2();
  private leanRoll = 0;

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

  /** The rail's bank the camera does not take, for the ship to fly with at rest. Positive to the left. */
  get restRoll(): number {
    return this.railBank * (1 - VIEW_BANK_SHARE);
  }

  /** How far to the side of the box the ship is, -1 (left edge) to 1 (right edge). */
  get shipSide(): number {
    return this.ship.x / BOX.x;
  }

  step(reticle: THREE.Vector3) {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.prevRoll = this.roll;

    // Along the rail.
    this.distance += SPEED * STEP;
    this.sampleRail();
    const turn = wrapAngle(this.headingOfRail() - this.railYaw); // keeps the yaw continuous
    this.railYaw += turn;
    this.railYawRate = turn / STEP;
    const bank = THREE.MathUtils.clamp(this.railYawRate * BANK_PER_TURN, -MAX_RAIL_BANK, MAX_RAIL_BANK);
    this.railBank += (bank - this.railBank) * RAIL_BANK_EASE;

    // The ship across the box, toward where the reticle puts it (semi-implicit Euler on a critically damped spring).
    const aimX = reticle.x / AIM_AREA.halfWidth;
    const aimY = reticle.y / AIM_AREA.halfHeight;
    const k = SHIP_FREQ * SHIP_FREQ;
    const c = 2 * SHIP_FREQ;
    this.shipVel.x += (k * (aimX * BOX.x - this.ship.x) - c * this.shipVel.x) * STEP;
    this.shipVel.y += (k * (aimY * BOX.y - this.ship.y) - c * this.shipVel.y) * STEP;
    this.ship.addScaledVector(this.shipVel, STEP);
    // Never out of the box, whatever the step.
    if (Math.abs(this.ship.x) > BOX.x) {
      this.ship.x = Math.sign(this.ship.x) * BOX.x;
      this.shipVel.x = 0;
    }
    if (Math.abs(this.ship.y) > BOX.y) {
      this.ship.y = Math.sign(this.ship.y) * BOX.y;
      this.shipVel.y = 0;
    }

    this.shipOffset.copy(this.ship).multiplyScalar(1 - CAMERA_FOLLOW);

    // Right is negative roll (three.js rotations are counterclockwise).
    this.leanRoll += (-aimX * LEAN_ROLL - this.leanRoll) * LEAN_ROLL_EASE;

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

  /** The camera's position and attitude, from the rail and its place in the box. */
  private place() {
    const cos = Math.cos(this.railYaw);
    const sin = Math.sin(this.railYaw);
    // Right of the direction of travel is (cos, 0, -sin) for a heading `railYaw`.
    const x = this.ship.x * CAMERA_FOLLOW;
    this.pos.set(this.railPoint.x + cos * x, this.railPoint.y + this.ship.y * CAMERA_FOLLOW, this.railPoint.z - sin * x);
    this.yaw = this.railYaw;
    this.pitch = this.railPitch + Math.atan2(this.shipVel.y * CAMERA_FOLLOW, SPEED) * ATTITUDE_GAIN;
    this.roll = this.railBank * VIEW_BANK_SHARE + this.leanRoll;
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
  // Heights 8 to 38: the lowest, less the camera's 3 down the box, keeps it well above the clouds (y = 5).
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

