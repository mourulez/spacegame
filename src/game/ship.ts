import * as THREE from 'three';
import { STEP } from '../core/loop';
import { SHIP_DISTANCE, SHIP_LIMIT, shipTarget } from './play-area';
import { mergeParts, mirrorX, outlineGeometry, outlineMaterial, toonRamp } from './toon';

// Spring that pulls the ship toward its target: stiff for agility, slightly
// underdamped so fast moves overshoot a little and the ship can cross the reticle.
const SPRING_FREQ = 13; // rad/s
const SPRING_DAMPING = 0.7; // 1 = critically damped
// Marked roll into sideways moves, After Burner style but milder: about 60 degrees
// at the keyboard's full sideways speed (about 11 units/s on the ship's plane).
const BANK_PER_SPEED = 0.095; // radians of roll per world unit/s of lateral speed
const BANK_PER_OFFSET = 0.2; // extra roll at the side edges; the camera already banks with the turn
const MAX_BANK = THREE.MathUtils.degToRad(72); // the rail's bank and the player's together
const BANK_EASE = 1 - Math.exp(-10 * STEP);
const OUTLINE_WIDTH = 0.022; // world units
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const RIGHT = new THREE.Vector3(1, 0, 0);
/** Where the shots leave from, in the ship's own space: just ahead of the nose. */
const MUZZLE = new THREE.Vector3(0, 0, -1.4);

/**
 * The player's ship. It chases the reticle (see shipTarget) and points its
 * nose at it, banked and pitched as the rail calls for at rest (the part of
 * it the camera does not take), plus its own banking into sideways moves.
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
  private readonly vel = new THREE.Vector2(); // world units per second
  private roll = 0; // radians, positive to the left
  private pitch = 0; // radians, positive nose up, on top of pointing at the reticle

  // Scratch objects, reused every step.
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Matrix4();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly pitchQuat = new THREE.Quaternion();

  constructor() {
    const ramp = toonRamp();
    const { hull, trim, glow } = buildGeometry();
    const hullMesh = new THREE.Mesh(hull, new THREE.MeshToonMaterial({ color: 0xe4e9f0, gradientMap: ramp }));
    const trimMesh = new THREE.Mesh(trim, new THREE.MeshToonMaterial({ color: 0x34405c, gradientMap: ramp }));
    const glowMesh = new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ color: 0xffb04a, toneMapped: false }));
    const outline = new THREE.Mesh(outlineGeometry([hull, trim]), outlineMaterial(0x0c1222, OUTLINE_WIDTH));
    this.object.add(hullMesh, trimMesh, glowMesh, outline);
  }

  /** Jump straight to the resting pose for this reticle position, with nothing to interpolate. */
  snap(reticle: THREE.Vector3) {
    shipTarget(reticle, this.pos);
    this.vel.set(0, 0);
    this.roll = 0;
    this.pitch = 0;
    this.aim(reticle);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.render(1);
  }

  /** `restRoll`, `restPitch`: the rail's bank and slope left for the ship (see Flight). */
  step(reticle: THREE.Vector3, restRoll: number, restPitch: number) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);

    // Semi-implicit Euler on a damped spring, in x and y only.
    shipTarget(reticle, this.target);
    const k = SPRING_FREQ * SPRING_FREQ;
    const c = 2 * SPRING_DAMPING * SPRING_FREQ;
    this.vel.x += (k * (this.target.x - this.pos.x) - c * this.vel.x) * STEP;
    this.vel.y += (k * (this.target.y - this.pos.y) - c * this.vel.y) * STEP;
    this.pos.x += this.vel.x * STEP;
    this.pos.y += this.vel.y * STEP;
    // The overshoot must not carry it out of the play area.
    const limitX = SHIP_LIMIT.x * SHIP_DISTANCE;
    const limitY = SHIP_LIMIT.y * SHIP_DISTANCE;
    if (Math.abs(this.pos.x) > limitX) {
      this.pos.x = Math.sign(this.pos.x) * limitX;
      this.vel.x = 0;
    }
    if (Math.abs(this.pos.y) > limitY) {
      this.pos.y = Math.sign(this.pos.y) * limitY;
      this.vel.y = 0;
    }

    // Bank with the rail, plus into lateral movement, and into the turn when held at a side.
    const bank = restRoll - this.vel.x * BANK_PER_SPEED - (this.pos.x / limitX) * BANK_PER_OFFSET;
    this.roll += (THREE.MathUtils.clamp(bank, -MAX_BANK, MAX_BANK) - this.roll) * BANK_EASE;
    this.pitch = restPitch; // the rail's slope changes smoothly already

    this.aim(reticle);
  }

  /** Where shots leave from, for the current step, in rig space. */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(MUZZLE).applyQuaternion(this.quat).add(this.pos);
  }

  render(alpha: number) {
    this.object.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }

  /** Nose (-Z) toward the reticle, pitched with the rail, then roll around the nose. */
  private aim(reticle: THREE.Vector3) {
    this.quat.setFromRotationMatrix(this.look.lookAt(this.pos, reticle, UP));
    this.quat.multiply(this.pitchQuat.setFromAxisAngle(RIGHT, this.pitch));
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
