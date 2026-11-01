import * as THREE from 'three';
import { Input } from '../core/input';
import { Hud } from '../ui/hud';
import { Asteroids } from './asteroids';
import { Ship } from './ship';
import { Starfield } from './starfield';

const CAMERA_Z = 10;
const CAMERA_HEIGHT = 2.5;
const FOV = 60;
const FORWARD_SPEED = 30; // how fast the world streams toward the camera
const MAX_DT = 1 / 20; // avoid huge jumps after tab switches or hitches
const MAX_PIXEL_RATIO = 2; // high-DPI phones would otherwise render 3x+

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
  private readonly timer = new THREE.Timer();
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly ship = new Ship();
  private readonly starfield = new Starfield();
  private readonly asteroids = new Asteroids();

  constructor(private readonly canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });

    this.input = new Input(canvas);
    this.hud = new Hud(ui);

    this.scene.background = new THREE.Color(0x05060f);
    this.scene.fog = new THREE.Fog(0x05060f, 80, 180);
    this.scene.add(new THREE.HemisphereLight(0x9bb8ff, 0x1a1020, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(5, 8, 6);
    this.scene.add(sun);

    // Slightly above and behind so the ship reads as a ship, not a silhouette.
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_Z);
    this.camera.lookAt(0, 0, -CAMERA_Z);
    this.scene.add(this.ship.object, this.starfield.object, this.asteroids.object);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  start() {
    this.renderer.setAnimationLoop(this.frame);
  }

  private frame = (time: number) => {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), MAX_DT);

    this.ship.update(dt, this.input.axis());
    this.starfield.update(dt, FORWARD_SPEED);
    this.asteroids.update(dt, FORWARD_SPEED);
    this.hud.update(dt, this.input.stick);

    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Keep the ship inside what is visible at z=0, which changes with orientation.
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
    this.ship.bounds.set(halfHeight * this.camera.aspect * 0.85, halfHeight * 0.85);
  };
}
