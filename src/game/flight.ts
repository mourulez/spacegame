import * as THREE from 'three';
import { STEP } from '../core/loop';
import { AIM_AREA } from './play-area';

export const SPEED = 100; // world units per second along the rail

/**
 * The rail: a designed closed loop the flight follows, in world space, above
 * the cloud deck (y = 0). Its curves turn and bank the camera; its rises and
 * dips tilt it. The player never changes the heading, so aiming never moves
 * what is being aimed at.
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

/*
 * The corridor around the rail the player moves in, following the reticle.
 * This only moves and leans the camera for feel: enemies and shots ride with
 * it (see CombatFrame), so it never shifts them away from the reticle.
 */
const LATERAL_RANGE = 5; // world units either side
const VERTICAL_RANGE = 4; // world units above and below the rail
const CORRIDOR_FREQ = 2.4; // rad/s, critically damped: eases into the edges, never overshoots
const LEAN_ROLL = THREE.MathUtils.degToRad(22); // with the reticle at a side edge, on top of the rail's own bank
const LEAN_ROLL_EASE = 1 - Math.exp(-3.5 * STEP);
/** Nose angle per climb angle while moving up or down the corridor, like an angle of attack. */
const ATTITUDE_GAIN = 1.6;

const scratchEuler = new THREE.Euler();

/**
 * The player's flight: along the rail at a constant speed, moved around the
 * corridor by the reticle. The camera rig rides on it, so the horizon moves
 * because the camera really turns, pitches and rolls.
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

  // Position in the corridor and its velocity.
  private lateral = 0;
  private lateralVel = 0;
  private vertical = 0;
  private verticalVel = 0;
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

    // Around the corridor.
    const aimX = reticle.x / AIM_AREA.halfWidth;
    const aimY = reticle.y / AIM_AREA.halfHeight;
    const k = CORRIDOR_FREQ * CORRIDOR_FREQ;
    const c = 2 * CORRIDOR_FREQ;
    this.lateralVel += (k * (aimX * LATERAL_RANGE - this.lateral) - c * this.lateralVel) * STEP;
    this.lateral += this.lateralVel * STEP;
    this.verticalVel += (k * (aimY * VERTICAL_RANGE - this.vertical) - c * this.verticalVel) * STEP;
    this.vertical += this.verticalVel * STEP;
    // Right is negative roll (three.js rotations are counterclockwise).
    this.leanRoll += (-aimX * LEAN_ROLL - this.leanRoll) * LEAN_ROLL_EASE;

    this.place();
  }

  /** Current orientation, pitched an extra `pitchOffset`, as a quaternion. */
  attitude(out: THREE.Quaternion, pitchOffset: number): THREE.Quaternion {
    return out.setFromEuler(scratchEuler.set(this.pitch + pitchOffset, this.yaw, this.roll, 'YXZ'));
  }

  /** The rail's direction alone, without bank or the player's lean: the combat frame's orientation. */
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

  /** Final position and attitude from the rail and the corridor. */
  private place() {
    const cos = Math.cos(this.railYaw);
    const sin = Math.sin(this.railYaw);
    // Right of the direction of travel is (cos, 0, -sin) for a heading `railYaw`.
    this.pos.set(
      this.railPoint.x + cos * this.lateral,
      this.railPoint.y + this.vertical,
      this.railPoint.z - sin * this.lateral,
    );
    this.yaw = this.railYaw;
    this.pitch = this.railPitch + Math.atan2(this.verticalVel, SPEED) * ATTITUDE_GAIN;
    this.roll = this.railBank + this.leanRoll;
  }
}

function fract(x: number) {
  return x - Math.floor(x);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Test route: a figure eight, so it turns right and left equally (a simple
 * loop would bank the same way all the time), gently rising and dipping. It
 * crosses itself in the middle, where the run starts, straight toward the
 * painted sun (-Z). Lobes are long and narrow for turns of about 500 units
 * radius at their ends.
 */
function figureEight(): THREE.Vector3[] {
  const WIDTH = 400; // half width of each lobe
  const LENGTH = 1280; // from the crossing to the end of each lobe
  const POINTS = 24;
  // The eight crosses diagonally; rotate it so the start heads straight to -Z.
  const angle = Math.atan2(2 * WIDTH, LENGTH);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < POINTS; i++) {
    const t = (i / POINTS) * Math.PI * 2;
    const x = WIDTH * Math.sin(2 * t);
    const z = -LENGTH * Math.sin(t);
    points.push(new THREE.Vector3(x * cos + z * sin, 10 + 3 * Math.sin(3 * t), -x * sin + z * cos));
  }
  return points;
}

