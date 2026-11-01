import * as THREE from 'three';
import { Input } from '../core/input';
import { FixedLoop } from '../core/loop';
import { Hud } from '../ui/hud';
import { CameraRig } from './camera-rig';
import { CombatFrame } from './combat-frame';
import { ENEMY_RADIUS, Enemies } from './enemies';
import { Explosions, HIT_BURST, KILL_BURST } from './explosions';
import { Flight } from './flight';
import { Reticle } from './reticle';
import { Ship } from './ship';
import { Shots, segmentHitsSphere } from './shots';
import { Sky } from './sky';

const MAX_PIXEL_RATIO = 2; // high-DPI phones would otherwise render 3x+

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig = new CameraRig();
  private readonly combat = new CombatFrame();
  private readonly loop: FixedLoop;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly flight = new Flight();
  private readonly sky = new Sky();
  private readonly reticle = new Reticle();
  private readonly ship = new Ship();
  private readonly enemies = new Enemies();
  private readonly shots = new Shots();
  private readonly explosions = new Explosions();

  // Scratch values, reused every step.
  private readonly pointer = { x: 0, y: 0 };
  private readonly drag = { x: 0, y: 0 };
  private readonly aim = new THREE.Vector2();
  private readonly rigToCombat = new THREE.Quaternion();
  private readonly muzzle = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement, ui: HTMLElement) {
    // At 2x pixel density and up, edges are fine without MSAA, which is costly on phones.
    const antialias = window.devicePixelRatio < 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });

    this.input = new Input(canvas);
    this.hud = new Hud(ui);
    this.loop = new FixedLoop({
      step: () => this.step(),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    this.scene.add(new THREE.AmbientLight(0xdfeaff, 1.1));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.2);
    sun.position.set(-3, 6, 4);
    this.scene.add(sun);

    this.rig.object.add(this.ship.object, this.reticle.object);
    this.combat.object.add(this.enemies.object, this.shots.object, this.explosions.object);
    this.scene.add(this.sky.object, this.rig.object, this.combat.object);
    this.ship.snap(this.reticle.pos);
    this.combat.snap(this.flight);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  start() {
    this.renderer.setAnimationLoop((time) => this.loop.frame(time));
  }

  private step() {
    const aim = this.input.takePointer(this.pointer) ? this.rig.aimPoint(this.pointer, this.aim) : null;
    this.input.takeDrag(this.drag);
    this.reticle.step(this.input.axis(), this.drag, aim);
    this.ship.step(this.reticle.pos);
    this.flight.step(this.reticle.pos);
    this.combat.step(this.flight);

    // Auto-fire from the ship's nose toward the reticle, both taken into combat space.
    this.combat.fromRig(this.flight, this.rigToCombat);
    this.ship.muzzle(this.muzzle).applyQuaternion(this.rigToCombat);
    this.target.copy(this.reticle.pos).applyQuaternion(this.rigToCombat);
    this.shots.step(this.muzzle, this.target);

    this.enemies.step(this.combat.yawRate);
    this.collide();
    this.explosions.step();
  }

  private collide() {
    for (const shot of this.shots.list) {
      if (!shot.active) continue;
      for (const enemy of this.enemies.list) {
        if (!this.enemies.isLive(enemy)) continue;
        if (!segmentHitsSphere(shot.prevPos, shot.pos, enemy.pos, ENEMY_RADIUS)) continue;
        shot.active = false;
        const killed = this.enemies.hit(enemy);
        this.explosions.spawn(killed ? enemy.pos : shot.pos, killed ? KILL_BURST : HIT_BURST);
        break;
      }
    }
  }

  private render(alpha: number, frameDt: number) {
    this.reticle.render(alpha);
    this.ship.render(alpha);
    this.rig.render(alpha, this.flight);
    this.combat.render(alpha);
    this.enemies.render(alpha);
    this.shots.render(alpha);
    this.explosions.render(alpha);
    this.sky.update(this.rig.object.position);
    this.hud.update(frameDt);
    this.renderer.render(this.scene, this.rig.camera);
  }

  private resize = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.rig.fit(width / height);
  };
}
