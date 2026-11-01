import * as THREE from 'three';
import { Input } from '../core/input';
import { FixedLoop } from '../core/loop';
import { Hud } from '../ui/hud';
import { Asteroids } from './asteroids';
import { PLAY_AREA, PLAY_AREA_MARGIN } from './play-area';
import { Ship } from './ship';
import { Starfield } from './starfield';

const FOV = 60; // vertical, degrees
const CAMERA_TILT = THREE.MathUtils.degToRad(14); // looking slightly down so the ship reads as a ship
const FORWARD_SPEED = 30; // how fast the world streams toward the camera
const MAX_PIXEL_RATIO = 2; // high-DPI phones would otherwise render 3x+

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
  private readonly loop: FixedLoop;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly ship = new Ship();
  private readonly starfield = new Starfield();
  private readonly asteroids = new Asteroids();

  constructor(private readonly canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });

    this.input = new Input(canvas);
    this.hud = new Hud(ui);
    this.loop = new FixedLoop({
      step: () => this.step(),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    this.scene.background = new THREE.Color(0x05060f);
    this.scene.fog = new THREE.Fog(0x05060f, 80, 180);
    this.scene.add(new THREE.HemisphereLight(0x9bb8ff, 0x1a1020, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(5, 8, 6);
    this.scene.add(sun);

    this.scene.add(this.ship.object, this.starfield.object, this.asteroids.object);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  start() {
    this.renderer.setAnimationLoop((time) => this.loop.frame(time));
  }

  private step() {
    this.ship.step(this.input.axis());
    this.starfield.step(FORWARD_SPEED);
    this.asteroids.step(FORWARD_SPEED);
  }

  private render(alpha: number, frameDt: number) {
    this.ship.render(alpha);
    this.starfield.render(alpha);
    this.asteroids.render(alpha);
    this.hud.update(frameDt, this.input.stick);
    this.renderer.render(this.scene, this.camera);
  }

  private resize = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  };

  /**
   * Move the camera just far enough back that the whole play area is visible
   * at the current aspect ratio. The play area never changes; narrow or wide
   * screens only see more scenery around it.
   */
  private fitCamera() {
    const halfWidth = PLAY_AREA.halfWidth + PLAY_AREA_MARGIN;
    const halfHeight = PLAY_AREA.halfHeight + PLAY_AREA_MARGIN;
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const distance = Math.max(halfHeight, halfWidth / this.camera.aspect) / tanHalfFov;
    this.camera.position.set(0, Math.sin(CAMERA_TILT) * distance, Math.cos(CAMERA_TILT) * distance);
    this.camera.lookAt(0, 0, 0);
  }
}
