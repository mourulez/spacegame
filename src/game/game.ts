import * as THREE from 'three';
import { Input } from '../core/input';
import { FixedLoop, STEP } from '../core/loop';
import { Hud } from '../ui/hud';
import { Atmosphere } from './atmosphere';
import { Bullets } from './bullets';
import { BASE_PITCH, CameraRig } from './camera-rig';
import { Clouds } from './clouds';
import { CombatFrame } from './combat-frame';
import { ENEMY_RADIUS, Enemies } from './enemies';
import { DEATH_BURST, Explosions, GLANCE_BURST, HIT_BURST, KILL_BURST, POP_BURST } from './explosions';
import { Flight } from './flight';
import { SHIP_BOX, SHIP_BOX_REST_Y } from './play-area';
import { Reticle } from './reticle';
import { Ship } from './ship';
import { Shots, segmentHitsSphere } from './shots';
import { Sky } from './sky';
import { Steering } from './steering';
import { Trail } from './trail';

const MAX_PIXEL_RATIO = 2; // high-DPI phones would otherwise render 3x+

/** Hits the shield takes before the ship goes down. */
const SHIELD_MAX = 5;
/** Steps from going down to flying again. */
const RESTART_STEPS = Math.round(3 / STEP);
/** World height under which the falling ship is inside the cloud blanket, which would not hide the smoke it left there. */
const TRAIL_FLOOR = -1;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig = new CameraRig();
  private readonly combat = new CombatFrame();
  private readonly loop: FixedLoop;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly flight = new Flight();
  private readonly atmosphere: Atmosphere;
  private readonly sky: Sky;
  private readonly clouds: Clouds;
  private readonly reticle = new Reticle();
  private readonly ship = new Ship();
  private readonly enemies = new Enemies();
  private readonly shots = new Shots();
  private readonly explosions = new Explosions();
  // The ship and the reticle are steered separately; enemies fire back, and the ship has a shield and can go down.
  private readonly shipSteering = new Steering(SHIP_BOX);
  private readonly bullets = new Bullets();
  private readonly trail = new Trail();
  private shield = SHIELD_MAX;
  private dead = false;
  private deadSteps = 0;

  // Scratch values, reused every step.
  private readonly pointer = { x: 0, y: 0 };
  private readonly drag = { x: 0, y: 0 };
  private readonly shipDrag = { x: 0, y: 0 };
  private readonly rollShift = { x: 0, y: 0 };
  private readonly aimAxis = { x: 0, y: 0 };
  private readonly shipAxis = { x: 0, y: 0 };
  private readonly aim = new THREE.Vector2();
  private readonly rigToCombat = new THREE.Quaternion();
  private readonly combatToRig = new THREE.Quaternion();
  private readonly view = new THREE.Quaternion();
  private readonly guns = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly rigOrigin = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly shipCombat = new THREE.Vector3();
  private readonly shipWorld = new THREE.Vector3();
  private readonly drawingBuffer = new THREE.Vector2();

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

    const params = new URLSearchParams(location.search);
    // `?time=0.7` in the URL starts that far into the sunset (0 day, 1 dusk), for checking it without waiting.
    const time = Number(params.get('time') ?? 0);
    this.atmosphere = new Atmosphere(Number.isFinite(time) ? time : 0);
    this.sky = new Sky(this.atmosphere);
    this.scene.add(this.atmosphere.ambient, this.atmosphere.sunLight);
    this.clouds = new Clouds(this.atmosphere);
    this.scene.add(this.clouds.composite);

    this.rig.object.add(this.ship.object, this.reticle.object);
    this.combat.object.add(this.enemies.object, this.bullets.object, this.shots.object, this.explosions.object);
    this.scene.add(this.sky.object, this.rig.object, this.combat.object, this.trail.object);
    this.hud.addShield(SHIELD_MAX);
    this.shipSteering.reset(0, SHIP_BOX_REST_Y);
    this.ship.rest(this.flight);
    this.combat.snap(this.flight);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  start() {
    this.renderer.setAnimationLoop((time) => this.loop.frame(time));
  }

  /** The ship and the reticle each on their own input; the camera rides the rail. */
  private step() {
    const alive = !this.dead;
    // Input is always taken, so nothing piles up while it controls nothing.
    const aim = this.input.takePointer(this.pointer) ? this.rig.aimPoint(this.pointer, this.aim) : null;
    this.input.takeDrag(this.drag);
    this.input.takeShipDrag(this.shipDrag);
    const roll = this.input.takeRoll(this.rollShift);
    if (alive) {
      this.reticle.step(this.input.aimAxis(this.aimAxis), this.drag, aim);
      // A barrel roll that starts carries the ship sideways with it.
      if (roll !== 0 && this.ship.barrelRoll(roll)) this.shipDrag.x += this.rollShift.x;
      this.shipSteering.step(this.input.shipAxis(this.shipAxis), this.shipDrag, null);
    } else {
      this.reticle.hold();
    }

    // The ship in its box, the flight (the camera following it), then the ship's attitude from both.
    if (alive) this.ship.steer(this.shipSteering.pos);
    this.flight.step(alive ? this.ship.box : null);
    if (alive) {
      this.ship.orient(this.flight);
    } else {
      this.ship.fall();
    }
    this.flight.keepInView(alive ? null : this.ship.center(this.shipWorld));
    this.combat.step(this.flight);

    // Auto-fire from the guns on the wings toward the reticle, all taken into combat space.
    this.combat.fromRig(this.flight, this.rigToCombat);
    this.combat.rigOrigin(this.flight, this.rigOrigin);
    this.combatToRig.copy(this.rigToCombat).invert();
    for (let gun = 0; gun < this.guns.length; gun++) this.toCombat(this.ship.muzzle(gun, this.guns[gun]));
    this.toCombat(this.target.copy(this.reticle.pos));
    this.shots.step(this.guns, this.target, alive);

    this.enemies.step(this.combat.yawRate, alive);
    // The ship's moves count in full against enemy fire: the camera stays on the rail.
    const ship = alive ? this.toCombat(this.ship.center(this.shipCombat)) : null;
    const hits = this.bullets.step(this.enemies, ship, this.ship.rolling, this.combatToRig, this.onBulletHit);
    if (hits > 0) this.hitShip(hits);
    this.collide();
    this.explosions.step();
    this.trail.step(this.ship.falling && this.shipWorld.y > TRAIL_FLOOR ? this.shipWorld : null);
    this.rig.step();

    if (this.dead && ++this.deadSteps >= RESTART_STEPS) this.restart();
    this.atmosphere.step();
  }

  /** Take a point from the camera rig's space to combat space, for the current step. */
  private toCombat(point: THREE.Vector3): THREE.Vector3 {
    return point.applyQuaternion(this.rigToCombat).add(this.rigOrigin);
  }

  /** The player's shots against enemy bullets, then enemies. */
  private collide() {
    for (const shot of this.shots.list) {
      if (!shot.active) continue;
      const popped = this.bullets.shootDown(shot.prevPos, shot.pos);
      if (popped) {
        shot.active = false;
        this.explosions.spawn(popped, POP_BURST);
        continue;
      }
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

  private onBulletHit = (at: THREE.Vector3, glanced: boolean) => {
    this.explosions.spawn(at, glanced ? GLANCE_BURST : HIT_BURST);
  };

  private hitShip(hits: number) {
    this.shield = Math.max(0, this.shield - hits);
    this.ship.hit();
    this.rig.shake();
    if (this.shield === 0) this.die();
  }

  /**
   * Shield gone: input stops controlling anything, no more waves come, the
   * flight eases to a halt and the ship falls out of the rig into the world,
   * burning, into the clouds.
   */
  private die() {
    this.dead = true;
    this.deadSteps = 0;
    this.explosions.spawn(this.shipCombat, DEATH_BURST);
    this.flight.halt(true);
    this.ship.die(this.flight, this.flight.attitude(this.view, BASE_PITCH));
    this.ship.center(this.shipWorld);
    this.scene.add(this.ship.object);
    this.reticle.object.visible = false;
  }

  /** Back in the air: full shield, the ship at rest, the flight getting going again. */
  private restart() {
    this.dead = false;
    this.shield = SHIELD_MAX;
    this.flight.halt(false);
    this.bullets.clear();
    this.rig.object.add(this.ship.object);
    this.shipSteering.reset(0, SHIP_BOX_REST_Y);
    this.ship.rest(this.flight);
    this.reticle.object.visible = true;
  }

  private render(alpha: number, frameDt: number) {
    this.reticle.render(alpha);
    this.ship.render(alpha);
    this.rig.render(alpha, this.flight);
    this.combat.render(alpha);
    this.enemies.render(alpha);
    this.shots.render(alpha);
    this.explosions.render(alpha);
    this.bullets.render(alpha);
    this.trail.render(alpha);
    this.hud.setShield(this.shield);
    this.hud.setRoll(this.ship.rollCharge);
    this.sky.update(this.rig.object.position);
    this.hud.update(frameDt);
    this.rig.object.updateMatrixWorld(); // the cloud pass runs before the main render updates it
    this.clouds.render(this.renderer, this.rig.camera);
    this.renderer.render(this.scene, this.rig.camera);
  }

  private resize = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.drawingBuffer);
    this.clouds.setSize(this.drawingBuffer.x, this.drawingBuffer.y);
    this.rig.fit(width / height);
  };
}
