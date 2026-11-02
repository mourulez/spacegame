import * as THREE from 'three';
import { STEP } from '../core/loop';
import { SPEED as FLIGHT_SPEED } from './flight';
import { mergeParts, mirrorX, outlineGeometry, outlineMaterial, toonRamp } from './toon';

/*
 * Enemy waves, in combat space (see CombatFrame): x right, y up, -z ahead.
 * Waves are groups of 3 or 4 ships flying the same path one after another.
 */

const MAX_ENEMIES = 16;
const MODEL_SCALE = 1.5;
export const ENEMY_RADIUS = 3.4; // hit sphere
const HIT_POINTS = 3;
const FLASH_STEPS = 5; // how long a hit flashes the hull white
const WAVE_INTERVAL = 4.2; // seconds between waves
const FIRST_WAVE = 1.5; // seconds
const SPACING = 0.45; // seconds between ships of a wave
const BANK_PER_TURN = 0.45; // roll per rad/s of the ship's own turning
const BANK_PER_FRAME_TURN = 0.8; // roll per rad/s of the rail turning: they bank through its curves too
const MAX_BANK = 1.1;
const BANK_EASE = 1 - Math.exp(-8 * STEP);
const HEADING_EASE = 1 - Math.exp(-10 * STEP);
const PITCH_EASE = 1 - Math.exp(-6 * STEP);
const OUTLINE_WIDTH = 0.07;
const HULL_COLOR = new THREE.Color(0xc23a4a);
const FLASH_COLOR = new THREE.Color(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** A path: position at `t` seconds after the ship starts it, for a wave from `side` (-1 left, 1 right) at height `lane`. False when finished. */
type Path = (t: number, side: number, lane: number, out: THREE.Vector3) => boolean;

/** Crosses the whole view from one side to the other, coming closer in the middle. */
const CROSS_DURATION = 4.2;
const cross: Path = (t, side, lane, out) => {
  const p = t / CROSS_DURATION;
  out.set(side * (60 - 120 * p), lane + 3 * Math.sin(p * Math.PI * 2), -42 + 10 * Math.sin(p * Math.PI));
  return p <= 1;
};

/** Swoops in from one side to close ahead in the middle, then climbs back out the same side. */
const SWOOP_DURATION = 5.5;
const swoop: Path = (t, side, lane, out) => {
  const p = t / SWOOP_DURATION;
  const s = Math.sin(p * Math.PI);
  out.set(side * (60 - 56 * s), lane - 6 + 20 * p * p, -58 + 26 * s);
  return p <= 1;
};

/**
 * Comes from behind on one side, rushes past the player, then holds ahead
 * weaving across the reticle before pulling away and up.
 */
const RUSH = 1.4; // seconds to get from behind to ahead
const PULL_AWAY = 5; // when it leaves
const OVERTAKE_DURATION = 7;
const overtake: Path = (t, side, lane, out) => {
  if (t < RUSH) {
    const u = t / RUSH;
    const eased = 1 - (1 - u) ** 3; // fast from behind, settling ahead
    const s = smooth(u);
    out.set(side * (12 - 6 * s), lane - 3 * (1 - s), 25 - 65 * eased);
  } else {
    const h = t - RUSH;
    const away = t > PULL_AWAY ? ((t - PULL_AWAY) / (OVERTAKE_DURATION - PULL_AWAY)) ** 2 : 0;
    out.set(side * 6 * Math.cos(h * 1.3), lane + 2 * Math.sin(h * 2) + 10 * away, -40 - 4 * Math.sin(h * 1.7) - 140 * away);
  }
  return t <= OVERTAKE_DURATION;
};

/**
 * Bursts up out of the clouds below, well ahead, nose high, climbing steeply
 * to its lane while drifting across, then pulls away up and out. It starts
 * below the cloud blanket wherever the camera is in the corridor (the camera
 * is 3 to 17 above it).
 */
const RISE_DEPTH = -35; // below the camera: inside the clouds, low on screen
const RISE_CLIMB = 2.6; // seconds to climb to the lane
const RISE_DURATION = 6.5;
const rise: Path = (t, side, lane, out) => {
  const p = t / RISE_DURATION;
  const climb = 1 - (1 - Math.min(t / RISE_CLIMB, 1)) ** 3; // fast out of the clouds, settling at the lane
  const away = p > 0.7 ? ((p - 0.7) / 0.3) ** 2 : 0;
  out.set(side * (18 - 30 * smooth(p)), RISE_DEPTH + (lane - RISE_DEPTH) * climb + 25 * away, -110 + 40 * Math.sin(p * Math.PI) - 60 * away);
  return p <= 1;
};

/** The wave script, played in a loop. Sides alternate so every kind comes from both sides. */
const WAVES: { path: Path; side: number; count: number; lane: number }[] = [
  { path: rise, side: -1, count: 4, lane: 2 },
  { path: cross, side: -1, count: 4, lane: 6 },
  { path: overtake, side: 1, count: 3, lane: 4 },
  { path: swoop, side: 1, count: 3, lane: 8 },
  { path: overtake, side: -1, count: 4, lane: 6 },
  { path: cross, side: 1, count: 3, lane: 10 },
  { path: swoop, side: -1, count: 4, lane: 3 },
  { path: rise, side: 1, count: 4, lane: 4 },
];

interface Enemy {
  active: boolean;
  path: Path;
  side: number;
  lane: number;
  t: number; // seconds into its path; negative while waiting its turn in the wave
  hp: number;
  flash: number; // steps of hit flash left
  roll: number;
  heading: number; // direction of travel around y, for banking into its turns
  pitch: number; // nose up while climbing, down while diving
  readonly pos: THREE.Vector3;
  readonly prevPos: THREE.Vector3;
  readonly quat: THREE.Quaternion;
  readonly prevQuat: THREE.Quaternion;
}

export class Enemies {
  readonly object = new THREE.Group();
  readonly list: Enemy[] = [];
  private readonly meshes: THREE.InstancedMesh[];
  private readonly hull: THREE.InstancedMesh;
  private waveTimer = FIRST_WAVE;
  private nextWave = 0;

  // Scratch objects, reused every step and frame.
  private readonly look = new THREE.Matrix4();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly ahead = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly drawPos = new THREE.Vector3();
  private readonly drawQuat = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor() {
    const ramp = toonRamp();
    const { hull, trim, glow } = buildGeometry();
    this.hull = new THREE.InstancedMesh(hull, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp }), MAX_ENEMIES);
    const trimMesh = new THREE.InstancedMesh(trim, new THREE.MeshToonMaterial({ color: 0x2b2438, gradientMap: ramp }), MAX_ENEMIES);
    const glowMesh = new THREE.InstancedMesh(glow, new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false }), MAX_ENEMIES);
    const outline = new THREE.InstancedMesh(outlineGeometry([hull, trim]), outlineMaterial(0x140a14, OUTLINE_WIDTH), MAX_ENEMIES);
    this.meshes = [this.hull, trimMesh, glowMesh, outline];
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // instances move every frame
      mesh.count = 0;
    }
    for (let i = 0; i < MAX_ENEMIES; i++) this.hull.setColorAt(i, HULL_COLOR);
    this.object.add(...this.meshes);

    for (let i = 0; i < MAX_ENEMIES; i++) {
      this.list.push({
        active: false,
        path: cross,
        side: 1,
        lane: 0,
        t: 0,
        hp: 0,
        flash: 0,
        roll: 0,
        heading: 0,
        pitch: 0,
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        prevQuat: new THREE.Quaternion(),
      });
    }
  }

  /** `frameYawRate`: how fast the rail is turning, so the enemies bank with it. */
  step(frameYawRate: number) {
    this.waveTimer -= STEP;
    if (this.waveTimer <= 0) {
      this.waveTimer += WAVE_INTERVAL;
      this.spawnWave(WAVES[this.nextWave]);
      this.nextWave = (this.nextWave + 1) % WAVES.length;
    }

    for (const e of this.list) {
      if (!e.active) continue;
      e.prevPos.copy(e.pos);
      e.prevQuat.copy(e.quat);
      if (e.flash > 0) e.flash--;
      e.t += STEP;
      if (e.t < 0) continue;
      if (!e.path(e.t, e.side, e.lane, e.pos)) {
        e.active = false;
        continue;
      }
      if (e.t < STEP) {
        // First step on the path: nothing to interpolate from or turn from yet.
        e.prevPos.copy(e.pos);
        e.path(e.t + STEP, e.side, e.lane, this.ahead);
        e.heading = Math.atan2(e.pos.x - this.ahead.x, e.pos.z - this.ahead.z + FLIGHT_SPEED * STEP);
      }

      // Turn smoothly toward the direction of travel, banking into the turn and into the rail's.
      // That is the path's motion plus the frame's own: the whole formation flies along the rail too.
      this.ahead.subVectors(e.pos, e.prevPos);
      this.ahead.z -= FLIGHT_SPEED * STEP;
      const moving = e.t >= STEP;
      const travel = moving ? Math.atan2(-this.ahead.x, -this.ahead.z) : e.heading;
      const turn = wrapAngle(travel - e.heading) * HEADING_EASE;
      const turnRate = turn / STEP;
      const heading = (e.heading += turn);
      const bank = THREE.MathUtils.clamp(turnRate * BANK_PER_TURN + frameYawRate * BANK_PER_FRAME_TURN, -MAX_BANK, MAX_BANK);
      e.roll += (bank - e.roll) * BANK_EASE;
      const climb = moving ? Math.atan2(this.ahead.y, Math.hypot(this.ahead.x, this.ahead.z)) : 0;
      e.pitch += (climb - e.pitch) * PITCH_EASE;
      const level = Math.cos(e.pitch);
      this.ahead.set(-Math.sin(heading) * level, Math.sin(e.pitch), -Math.cos(heading) * level).add(e.pos);
      e.quat.setFromRotationMatrix(this.look.lookAt(e.pos, this.ahead, UP));
      e.quat.multiply(this.rollQuat.setFromAxisAngle(FORWARD, e.roll));
      if (e.t < STEP) e.prevQuat.copy(e.quat);
    }
  }

  /** Register a hit. Returns true if it destroyed the enemy. */
  hit(e: Enemy): boolean {
    e.hp--;
    e.flash = FLASH_STEPS;
    if (e.hp > 0) return false;
    e.active = false;
    return true;
  }

  /** Whether an enemy is on its path and can be hit. */
  isLive(e: Enemy): boolean {
    return e.active && e.t >= 0;
  }

  render(alpha: number) {
    let n = 0;
    for (const e of this.list) {
      if (!this.isLive(e)) continue;
      this.drawPos.lerpVectors(e.prevPos, e.pos, alpha);
      this.drawQuat.slerpQuaternions(e.prevQuat, e.quat, alpha);
      this.matrix.compose(this.drawPos, this.drawQuat, this.one);
      for (const mesh of this.meshes) mesh.setMatrixAt(n, this.matrix);
      this.hull.setColorAt(n, e.flash > 0 ? FLASH_COLOR : HULL_COLOR);
      n++;
    }
    for (const mesh of this.meshes) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.hull.instanceColor!.needsUpdate = true;
  }

  private spawnWave(wave: (typeof WAVES)[number]) {
    let spawned = 0;
    for (const e of this.list) {
      if (spawned === wave.count) break;
      if (e.active) continue;
      e.active = true;
      e.path = wave.path;
      e.side = wave.side;
      // Stagger heights a little so the line reads as a formation, not a single file.
      e.lane = wave.lane + (spawned % 2 === 0 ? 0 : 2.5);
      e.t = -spawned * SPACING;
      e.hp = HIT_POINTS;
      e.flash = 0;
      e.roll = 0;
      e.pitch = 0;
      spawned++;
    }
  }
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Low-poly attack drone, nose toward -Z, about 5 units wide. */
function buildGeometry() {
  const hull: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];

  // Angular central body.
  hull.push(new THREE.OctahedronGeometry(1).scale(0.75, 0.45, 1.3));

  // Forward-swept blade wings, drawn in the XZ plane (shape y = world z).
  for (const side of [1, -1]) {
    const wing = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(0.3, 0.45),
        new THREE.Vector2(1.65, -0.65),
        new THREE.Vector2(1.75, -0.3),
        new THREE.Vector2(0.45, 0.95),
      ]),
      { depth: 0.1, bevelEnabled: false },
    )
      .rotateX(Math.PI / 2) // shape y -> z, extrusion -> -y
      .translate(0, 0.05, 0)
      .rotateZ(0.12); // slight dihedral
    trim.push(side < 0 ? mirrorX(wing) : wing);
  }

  // Tail spike.
  trim.push(new THREE.ConeGeometry(0.22, 1.0, 4).rotateX(Math.PI / 2).translate(0, 0, 1.55));

  // Glowing eye at the front.
  glow.push(new THREE.SphereGeometry(0.2, 8, 6).scale(1.3, 0.8, 1).translate(0, 0.16, -0.75));

  const scaled = (parts: THREE.BufferGeometry[]) => mergeParts(parts).scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  return { hull: scaled(hull), trim: scaled(trim), glow: scaled(glow) };
}
