import * as THREE from 'three';
import { STEP } from '../core/loop';
import type { Enemies } from './enemies';
import { AIM_SLOPE, SHIP_HIT_RADIUS } from './play-area';
import { segmentHitsSphere } from './shots';
import { outlineGeometry } from './toon';

/*
 * Enemy fire, in combat space (see CombatFrame): few, slow, round bullets,
 * each aimed at where the ship was when it was fired, in a straight line.
 * A bullet turns red when it is about to hit the ship where the ship is now,
 * so moving out of its path turns it back. Once past the ship it fades away.
 * The player's shots destroy them, but not the red ones: those must be
 * dodged. Otherwise the stream of shots leaving the nose, right where every
 * bullet that would hit ends up, shields the ship on its own. A ship in a
 * barrel roll glances them off.
 */

const MAX_BULLETS = 8;
const RADIUS = 0.5;
/** Seconds a bullet takes to reach where the ship was: slow enough to read and dodge. */
const FLIGHT_TIME = 1.75;
const LIFETIME = Math.round(4 / STEP); // steps
const FIRE_INTERVAL = Math.round(1.1 / STEP); // steps between bullets, from the whole formation
/** An enemy fires only once it has been on its path this long, so it is seen before it shoots. */
const MIN_AGE = 0.8; // seconds
/** And only from this far ahead (combat -z), and from inside the aim area on screen. */
const RANGE = { near: 25, far: 120 } as const;
/** Behind the camera it can no longer hit anything. */
const GONE_Z = 5;
/** Steps a bullet takes to fade away once past the ship. */
const FADE_STEPS = 15;
/** Reach of a hit on the ship: its hit sphere plus the bullet. */
const HIT_REACH = SHIP_HIT_RADIUS + RADIUS;
/**
 * A bullet turns red when it will pass within HIT_REACH of the ship in under
 * WARN_TIME seconds, and stays red until it would miss by more than
 * WARN_OUT: a little hysteresis, so it never flickers.
 */
const WARN_TIME = 0.6;
const WARN_OUT = HIT_REACH * 1.25;
/** A glanced-off bullet leaves this much faster than it came. */
const GLANCE_SPEEDUP = 1.3;
/** Reach of the player's shots against a bullet: generous, so aiming at one is enough. */
const SHOT_REACH = RADIUS + 0.7;
const COLOR = new THREE.Color(0xb46cff);
const WARN_COLOR = new THREE.Color(0xff2626);
const OUTLINE_COLOR = new THREE.Color(0x1a0a24);
const OUTLINE_WIDTH = 0.09;

interface Bullet {
  active: boolean;
  warn: boolean;
  fade: number; // steps of fading left once past the ship; 0 while live
  life: number; // steps left
  readonly pos: THREE.Vector3;
  readonly prevPos: THREE.Vector3;
  readonly vel: THREE.Vector3;
}

export class Bullets {
  readonly object = new THREE.Group();
  private readonly list: Bullet[] = [];
  private readonly meshes: THREE.InstancedMesh[];
  // Per instance: warning (0 or 1) and opacity.
  private readonly state = new Float32Array(MAX_BULLETS * 2);
  private readonly stateAttr: THREE.InstancedBufferAttribute;
  private cooldown = FIRE_INTERVAL;
  private nextShooter = 0;

  // Scratch objects.
  private readonly toShip = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly onScreen = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly drawPos = new THREE.Vector3();
  private readonly drawScale = new THREE.Vector3();
  private readonly noRotation = new THREE.Quaternion();

  constructor() {
    // A low-poly ball with a dark outline, in the same cel language as the ships.
    // Both meshes share the per-instance state, and fade out together.
    this.stateAttr = new THREE.InstancedBufferAttribute(this.state, 2);
    this.stateAttr.setUsage(THREE.DynamicDrawUsage);
    const ball = new THREE.IcosahedronGeometry(RADIUS, 1);
    const outline = outlineGeometry([ball]);
    ball.setAttribute('bulletState', this.stateAttr);
    outline.setAttribute('bulletState', this.stateAttr);
    const body = new THREE.InstancedMesh(ball, bulletMaterial(0, THREE.FrontSide), MAX_BULLETS);
    const rim = new THREE.InstancedMesh(outline, bulletMaterial(OUTLINE_WIDTH, THREE.BackSide), MAX_BULLETS);
    this.meshes = [rim, body];
    this.meshes.forEach((mesh, i) => {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = i * 0.5; // rim first; both before the reticle
    });
    this.object.add(...this.meshes);

    for (let i = 0; i < MAX_BULLETS; i++) {
      this.list.push({
        active: false,
        warn: false,
        fade: 0,
        life: 0,
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }
  }

  /**
   * Move the bullets. When `ship` is given (its center, in combat space),
   * also hit it, calling `onHit` with each bullet that reaches it, update
   * the warnings, start fading the ones past it, and fire a new one when due.
   * A `shielded` ship (rolling) glances bullets off instead of taking them;
   * `onHit` is told which. `toRig` takes combat space to the camera rig's, to
   * tell which enemies are on screen. Returns how many bullets hit the ship.
   */
  step(
    enemies: Enemies,
    ship: THREE.Vector3 | null,
    shielded: boolean,
    toRig: THREE.Quaternion,
    onHit: (at: THREE.Vector3, glanced: boolean) => void,
  ): number {
    let hits = 0;
    for (const b of this.list) {
      if (!b.active) continue;
      b.prevPos.copy(b.pos);
      b.pos.addScaledVector(b.vel, STEP);
      if (--b.life <= 0 || b.pos.z > GONE_Z || (b.fade > 0 && --b.fade === 0)) {
        b.active = false;
        continue;
      }
      if (!ship || b.fade > 0) continue;

      if (segmentHitsSphere(b.prevPos, b.pos, ship, HIT_REACH)) {
        if (shielded) {
          // Bounce off the ship's hit sphere, and fade away: it can no longer hit.
          this.normal.subVectors(b.prevPos, ship).normalize();
          b.vel.addScaledVector(this.normal, -2 * b.vel.dot(this.normal)).multiplyScalar(GLANCE_SPEEDUP);
          b.pos.copy(b.prevPos);
          b.warn = false;
          b.fade = FADE_STEPS;
          onHit(b.pos, true);
        } else {
          b.active = false;
          onHit(b.pos, false);
          hits++;
        }
        continue;
      }

      this.toShip.subVectors(ship, b.pos);
      const along = this.toShip.dot(b.vel);
      if (along <= 0) {
        // Past the ship: it can no longer hit.
        b.warn = false;
        b.fade = FADE_STEPS;
        continue;
      }
      // Its closest approach to the ship where it is now: how far, and in how many seconds.
      const time = along / b.vel.lengthSq();
      const miss = this.toShip.addScaledVector(b.vel, -time).length();
      b.warn = b.warn ? miss < WARN_OUT : miss < HIT_REACH && time < WARN_TIME;
    }

    if (ship && --this.cooldown <= 0) {
      this.cooldown = FIRE_INTERVAL;
      this.fire(enemies, ship, toRig);
    }
    return hits;
  }

  /**
   * If the shot that moved from `a` to `b` this step hit a bullet that can be
   * shot down (neither red nor fading), destroy it and return where it was; else null.
   */
  shootDown(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 | null {
    for (const bullet of this.list) {
      if (!bullet.active || bullet.warn || bullet.fade > 0) continue;
      if (!segmentHitsSphere(a, b, bullet.pos, SHOT_REACH)) continue;
      bullet.active = false;
      return bullet.pos;
    }
    return null;
  }

  /** Remove every bullet. */
  clear() {
    for (const b of this.list) b.active = false;
  }

  render(alpha: number) {
    let n = 0;
    for (const b of this.list) {
      if (!b.active) continue;
      // Fading: from fully there to gone, shrinking a little on the way.
      const opacity = b.fade > 0 ? Math.max(0, (b.fade - alpha) / FADE_STEPS) : 1;
      this.drawPos.lerpVectors(b.prevPos, b.pos, alpha);
      this.drawScale.setScalar(0.6 + 0.4 * opacity);
      this.matrix.compose(this.drawPos, this.noRotation, this.drawScale);
      for (const mesh of this.meshes) mesh.setMatrixAt(n, this.matrix);
      this.state[n * 2] = b.warn ? 1 : 0;
      this.state[n * 2 + 1] = opacity;
      n++;
    }
    for (const mesh of this.meshes) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.stateAttr.needsUpdate = true;
  }

  /** Fire from the next enemy in turn that is on screen, in range and has been seen for a while. */
  private fire(enemies: Enemies, ship: THREE.Vector3, toRig: THREE.Quaternion) {
    const bullet = this.list.find((b) => !b.active);
    if (!bullet) return;
    const count = enemies.list.length;
    for (let i = 0; i < count; i++) {
      const index = (this.nextShooter + i) % count;
      const e = enemies.list[index];
      if (!enemies.isLive(e) || e.t < MIN_AGE) continue;
      const p = this.onScreen.copy(e.pos).applyQuaternion(toRig);
      const ahead = -p.z;
      if (ahead < RANGE.near || ahead > RANGE.far) continue;
      if (Math.abs(p.x) > AIM_SLOPE.x * ahead || Math.abs(p.y) > AIM_SLOPE.y * ahead) continue;

      bullet.active = true;
      bullet.warn = false;
      bullet.fade = 0;
      bullet.life = LIFETIME;
      bullet.pos.copy(e.pos);
      bullet.prevPos.copy(e.pos);
      bullet.vel.subVectors(ship, e.pos).divideScalar(FLIGHT_TIME);
      this.nextShooter = (index + 1) % count;
      return;
    }
  }
}

/**
 * Flat color from the per-instance state (warning, opacity). With `width`,
 * an inverted-hull outline instead: back faces only, inflated along the normal.
 */
function bulletMaterial(width: number, side: THREE.Side): THREE.ShaderMaterial {
  const outline = width > 0;
  return new THREE.ShaderMaterial({
    side,
    transparent: true, // to fade away; drawn opaque until then
    uniforms: {
      color: { value: outline ? OUTLINE_COLOR : COLOR },
      warnColor: { value: outline ? OUTLINE_COLOR : WARN_COLOR },
      width: { value: width },
    },
    vertexShader: /* glsl */ `
      uniform float width;
      attribute vec2 bulletState;
      varying vec2 vState;
      void main() {
        vState = bulletState;
        vec4 p = instanceMatrix * vec4(position + normal * width, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 warnColor;
      varying vec2 vState;
      void main() {
        gl_FragColor = vec4(mix(color, warnColor, vState.x), vState.y);
        #include <colorspace_fragment>
      }
    `,
  });
}
