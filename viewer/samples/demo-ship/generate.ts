/// <reference types="node" />
/*
 * The reference demo's ship (docs/reference/nave-cel-shader.html) as a test
 * asset in the cel asset format (docs/reference/SPEC-cel-shader-movil.md §11):
 * separate named parts, one material with a palette, the look's data baked
 * per vertex, and marker nodes. Run `npm run asset:demo-ship`; it writes
 * three variants next to this file:
 *
 *   demo-ship.glb           high density, normals smoothed by angle (the user's choice)
 *   demo-ship-low.glb       low density
 *   demo-ship-transfer.glb  high density, normals transferred from simple shapes
 *
 * Everything the look needs is in the file, already computed: the viewer and
 * the game draw what comes and compute nothing of their own.
 */
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

type Vec3 = [number, number, number];
type Field = (v: THREE.Vector3) => number;

/* ---------- Format ---------- */

// Palette: one column per zone. Rows: base color, shadow color, outline (and stroke) color.
// Properties per zone go to the material's extras as cel_sw_<column> = [spec, metal, emissive].
const ZONES = {
  hull: { base: 0xe9edf2, shadow: 0xa9b1dc, line: 0x46508a, spec: 0.55, metal: 0 },
  cobalt: { base: 0x2448a8, shadow: 0x9a8fd6, line: 0x0c1850, spec: 0, metal: 0 },
  red: { base: 0xd7263d, shadow: 0xb87ea6, line: 0x5c0a20, spec: 0, metal: 0 },
  metal: { base: 0x9aa4b0, shadow: 0xa3a8d0, line: 0x2c3352, spec: 0.9, metal: 1 },
  canopy: { base: 0x1c2a5c, shadow: 0x9098d0, line: 0x080c22, spec: 0.8, metal: 0 },
  intake: { base: 0x0f1328, shadow: 0x7a7fa8, line: 0x05070f, spec: 0, metal: 0 },
  gun: { base: 0x3b4357, shadow: 0x8c90bc, line: 0x0a0d1a, spec: 0.7, metal: 1 },
};
type Zone = keyof typeof ZONES;
const ZONE_KEYS = Object.keys(ZONES) as Zone[];
const SWATCH = 8; // px per swatch side, so filtering never mixes neighbors

/** Strokes: no stroke where the field is far from 0. */
const NO_LINE = 1e3;

interface Part {
  name: string;
  zone: Zone;
  geometry: THREE.BufferGeometry;
}

/* ---------- Geometry helpers (as in the demo) ---------- */

const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const sstep = THREE.MathUtils.smoothstep;
const posKey = (p: ArrayLike<number>, i: number) => `${Math.round(p[i] * 1e4)}_${Math.round(p[i + 1] * 1e4)}_${Math.round(p[i + 2] * 1e4)}`;

interface Transform {
  pos?: Vec3;
  rot?: Vec3;
  scl?: Vec3;
}

/** Smooth by angle, like Blender's: average the normals at a position only between faces closer than `angle`. */
function creaseNormals(g: THREE.BufferGeometry, angle: number) {
  const p = g.getAttribute('position').array;
  const n = g.getAttribute('normal').array as Float32Array;
  const c = Math.cos(angle);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < p.length; i += 3) {
    const k = posKey(p, i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  }
  const out = new Float32Array(n.length);
  for (const idx of groups.values()) {
    for (const i of idx) {
      let x = 0, y = 0, z = 0;
      for (const j of idx) {
        if (n[i] * n[j] + n[i + 1] * n[j + 1] + n[i + 2] * n[j + 2] >= c) {
          x += n[j];
          y += n[j + 1];
          z += n[j + 2];
        }
      }
      const l = Math.hypot(x, y, z) || 1;
      out[i] = x / l;
      out[i + 1] = y / l;
      out[i + 2] = z / l;
    }
  }
  n.set(out);
}

/** A piece in ship space: transformed, optionally mirrored across x, flat normals, optionally smoothed by angle. */
function part(geo: THREE.BufferGeometry, { pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1] }: Transform = {}, mirror = false, crease = 0) {
  const src = geo.index ? geo.toNonIndexed() : geo.clone();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position'));
  g.applyMatrix4(m4.compose(new THREE.Vector3(...pos), quat.setFromEuler(euler.set(...rot)), new THREE.Vector3(...scl)));
  if (mirror) {
    const a = g.getAttribute('position').array as Float32Array;
    for (let i = 0; i < a.length; i += 3) a[i] = -a[i];
    flipWinding(g);
  }
  g.computeVertexNormals(); // non-indexed: one normal per face, hard edges
  if (crease) creaseNormals(g, crease);
  return g;
}

/** Reverse every triangle (for surfaces seen from inside, like the intake duct). */
function flipWinding(g: THREE.BufferGeometry) {
  const a = g.getAttribute('position').array as Float32Array;
  for (let t = 0; t < a.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const tmp = a[t + 3 + k];
      a[t + 3 + k] = a[t + 6 + k];
      a[t + 6 + k] = tmp;
    }
  }
}

/** A function taking a point in ship space to a piece's local space. */
function toLocal({ pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1] }: Transform = {}, mirror = false) {
  const inv = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl)).invert();
  const w = new THREE.Vector3();
  return (v: THREE.Vector3) => {
    w.copy(v);
    if (mirror) w.x = -w.x;
    return w.applyMatrix4(inv);
  };
}

function shapeGeo(points: [number, number][], depth: number) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

function perVertex(g: THREE.BufferGeometry, fn: Field): Float32Array {
  const p = g.getAttribute('position');
  const out = new Float32Array(p.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) out[i] = fn(v.fromBufferAttribute(p, i));
  return out;
}

/** Stroke: the zero isoline of a field that is linear across each part, so it comes out straight and clean. */
function setLine(g: THREE.BufferGeometry, fn: Field, period = 0) {
  const f = perVertex(g, fn);
  const f2 = new Float32Array(f.length * 2);
  for (let i = 0; i < f.length; i++) {
    f2[i * 2] = f[i];
    f2[i * 2 + 1] = period;
  }
  g.setAttribute('_line', new THREE.BufferAttribute(f2, 2));
}

/** Second stroke, for where one part goes into another: the signed distance to the other part. */
function setLine2(g: THREE.BufferGeometry, fn: Field) {
  g.setAttribute('_line2', new THREE.BufferAttribute(perVertex(g, fn), 1));
}

/* ---------- The ship ---------- */

// Blunt nose: the outer lip curves inward and leaves a front air intake.
const PROFILE: [number, number][] = [[0, -1.75], [0.36, -1.65], [0.48, -0.9], [0.44, 0.2], [0.35, 1.3], [0.27, 2.3], [0.235, 2.9], [0.225, 3.1], [0.2, 3.22], [0.16, 3.26]];
// The intake's inner duct, from the lip to the back.
const DUCT: [number, number][] = [[0.16, 3.26], [0.14, 3.19], [0.125, 3.0], [0.115, 2.8], [0, 2.75]];
// Low = the original mesh; high = the profile interpolated with a spline and more segments on curved parts.
const DENSITY = {
  low: { prof: 0, seg: 12, eng: 10, engH: 6 },
  high: { prof: 28, seg: 32, eng: 24, engH: 14 },
};
function profilePoints(n: number) {
  const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  if (!n) return pts;
  return new THREE.SplineCurve(pts).getPoints(n).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
}

const SMOOTH = THREE.MathUtils.degToRad(55);
const HULL_FLAT = 0.62; // the hull's vertical squash
// Wider body (1.4×) that narrows back to 1× at the nose tip.
const NOSE_Z = -3.26, WIDE_Z = -0.6, WIDE = 1.4;
const widenAt = (z: number) => 1 + (WIDE - 1) * sstep(z, NOSE_Z, WIDE_Z);
// Taller behind the canopy; the nose unchanged.
const heightAt = (z: number) => 1 + 0.4 * sstep(z, -0.5, 0.6);
function thicken(g: THREE.BufferGeometry) {
  const a = g.getAttribute('position').array as Float32Array;
  for (let i = 0; i < a.length; i += 3) a[i + 1] *= heightAt(a[i + 2]);
}
function widen(g: THREE.BufferGeometry) {
  const a = g.getAttribute('position').array as Float32Array;
  for (let i = 0; i < a.length; i += 3) a[i] *= widenAt(a[i + 2]);
}

const CAN: Vec3 = [0, 0.2, -0.15];
const ENG = { x: 0.72, y: -0.04, z: 0.95, len: 2.0, rFront: 0.24, rBack: 0.36 };
const wingT: Transform = { pos: [0.3, 0.12, 0.05], rot: [Math.PI / 2, 0, -0.42] };
const engT: Transform = { pos: [ENG.x, ENG.y, ENG.z], rot: [Math.PI / 2, 0, 0] };
const wingMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...wingT.pos!), new THREE.Quaternion().setFromEuler(new THREE.Euler(...wingT.rot!)), new THREE.Vector3(1, 1, 1));
const onWing = (x: number, y: number, depth: number) => new THREE.Vector3(x, y, depth).applyMatrix4(wingMatrix);

// Swept wings drooping from the nacelles, red tips.
const wingMain = shapeGeo([[0.55, -0.15], [1.75, 1.05], [1.85, 1.62], [0.55, 1.85]], 0.07);
const wingTip = shapeGeo([[1.75, 1.05], [2.2, 1.5], [2.3, 1.82], [1.85, 1.62]], 0.07);

// Flap line: parallel to the main wing's trailing edge, 0.32 toward the leading edge.
const FLAP = (() => {
  const P1 = [0.55, 1.85], P2 = [1.85, 1.62], dx = P2[0] - P1[0], dy = P2[1] - P1[1], l = Math.hypot(dx, dy);
  const nx = dy / l, ny = -dx / l;
  return (q: THREE.Vector3) => (q.x - P1[0]) * nx + (q.y - P1[1]) * ny - 0.32;
})();
function wing(mirror: boolean) {
  const g = part(wingMain, wingT, mirror);
  const local = toLocal(wingT, mirror);
  setLine(g, (v) => FLAP(local(v)));
  return g;
}

// Central dorsal fin on the rear hump: cobalt body, red cap, rudder line.
function dorsal() {
  const T: Transform = { pos: [0.035, 0.34, 0.15] }; // extruded toward -x: centered on x = 0
  const lower = shapeGeo([[0, 0], [1.3, 0], [1.494, 0.62], [0.814, 0.62]], 0.07);
  lower.rotateY(-Math.PI / 2);
  const cap = shapeGeo([[0.814, 0.62], [1.494, 0.62], [1.55, 0.8], [1.05, 0.8]], 0.07);
  cap.rotateY(-Math.PI / 2);
  const fin = part(lower, T);
  const finCap = part(cap, T);
  // Rudder line: parallel to the trailing edge, 0.25 ahead (shape x → z, y → y).
  const P1 = [1.05, 0], d = [0.25, 0.8], l = Math.hypot(d[0], d[1]), n = [d[1] / l, -d[0] / l];
  const rudder = (v: THREE.Vector3) => (v.z - T.pos![2] - P1[0]) * n[0] + (v.y - T.pos![1] - P1[1]) * n[1];
  setLine(fin, rudder);
  setLine(finCap, rudder);
  return { fin, finCap };
}

// Guns under the wings, anchored to a point of the wing.
const GUN = (() => {
  const under = onWing(1.1, 1.0, 0.07); // the wing's underside
  const c = onWing(1.1, 1.0, 0.07 + 0.17); // the pod's center, hanging under the wing
  return { c, under, podLen: 1.0, podR: 0.11, podRFront: 0.075, barrelLen: 0.85, barrelR: 0.042, muzzleLen: 0.14, muzzleR: 0.062 };
})();
const GUN_FRONT = GUN.c.z - GUN.podLen / 2;
const BARREL_FRONT = GUN_FRONT - GUN.barrelLen;

function guns(mirror: boolean): Part[] {
  const G = GUN;
  const side = mirror ? 'l' : 'r';
  const axis: Vec3 = [Math.PI / 2, 0, 0];
  const pod = part(new THREE.CylinderGeometry(G.podR, G.podRFront, G.podLen, 12, 1), { pos: [G.c.x, G.c.y, G.c.z], rot: axis }, mirror, SMOOTH);
  const barrel = part(new THREE.CylinderGeometry(G.barrelR, G.barrelR, G.barrelLen, 10, 1, true), { pos: [G.c.x, G.c.y, GUN_FRONT - G.barrelLen / 2], rot: axis }, mirror, SMOOTH);
  const tip = part(new THREE.CylinderGeometry(G.muzzleR, G.muzzleR, G.muzzleLen, 10, 1), { pos: [G.c.x, G.c.y, BARREL_FRONT - G.muzzleLen / 2 + 0.02], rot: axis }, mirror, SMOOTH);
  const mid = G.under.clone().add(G.c).multiplyScalar(0.5);
  const pylon = part(new THREE.BoxGeometry(0.045, G.under.distanceTo(G.c), 0.55), { pos: [mid.x, mid.y, G.c.z + 0.05], rot: [0, 0, wingT.rot![2]] }, mirror);
  // Strokes with intent: cooling rings on the barrel (periodic) and one joint on the pod.
  setLine(barrel, (v) => v.z - (GUN_FRONT - 0.06), 0.13);
  setLine(pod, (v) => v.z - (GUN_FRONT + 0.32));
  return [
    { name: `gun_pod_${side}`, zone: 'gun', geometry: pod },
    { name: `gun_pylon_${side}`, zone: 'gun', geometry: pylon },
    { name: `gun_barrel_${side}`, zone: 'metal', geometry: barrel },
    { name: `gun_tip_${side}`, zone: 'metal', geometry: tip },
  ];
}

/** Like Blender's normal Data Transfer from a simple shape. */
function transferNormals(g: THREE.BufferGeometry, fn: (v: THREE.Vector3, cur: THREE.Vector3, out: THREE.Vector3) => boolean) {
  const p = g.getAttribute('position').array;
  const n = g.getAttribute('normal').array as Float32Array;
  const v = new THREE.Vector3(), cur = new THREE.Vector3(), out = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]);
    cur.set(n[i], n[i + 1], n[i + 2]);
    if (!fn(v, cur, out) || out.lengthSq() < 1e-10) continue;
    out.normalize();
    n[i] = out.x;
    n[i + 1] = out.y;
    n[i + 2] = out.z;
  }
}
function hullFromCylinder(v: THREE.Vector3, cur: THREE.Vector3, out: THREE.Vector3) {
  if (cur.z > 0.75 || cur.z < -0.6) return false; // the back cap and the nose lip keep theirs
  const w = widenAt(v.z);
  const h = HULL_FLAT * heightAt(v.z);
  out.set(v.x / (w * w), v.y / (h * h), 0).normalize();
  out.z = cur.z * 0.35; // some of the original slope, so the nose isn't flat
  return true;
}
function engineFromCylinder(v: THREE.Vector3, cur: THREE.Vector3, out: THREE.Vector3) {
  if (Math.abs(cur.z) > 0.7) return false; // caps
  out.set(v.x - Math.sign(v.x) * ENG.x, v.y - ENG.y, 0);
  return true;
}

/** Painted shadow: the belly always in shadow, wherever the light comes from. */
function hullShadowBias(g: THREE.BufferGeometry) {
  g.setAttribute(
    '_shadow_bias',
    new THREE.BufferAttribute(
      perVertex(g, (v) => {
        const x = v.x / widenAt(v.z), y = v.y / (HULL_FLAT * heightAt(v.z)), r = Math.hypot(x, y);
        return r > 1e-4 && y / r < -0.3 ? -1.5 : 0;
      }),
      1,
    ),
  );
}

function buildParts(density: keyof typeof DENSITY, normals: 'angle' | 'transfer'): Part[] {
  const d = DENSITY[density];
  const prof = profilePoints(d.prof);
  const hull = part(new THREE.LatheGeometry(prof, d.seg, Math.PI / d.seg), { rot: [-Math.PI / 2, 0, 0] });
  hull.scale(1, HULL_FLAT, 1);
  widen(hull);
  thicken(hull);
  hull.computeVertexNormals();
  creaseNormals(hull, SMOOTH);
  const duct = part(new THREE.LatheGeometry(DUCT.map(([r, y]) => new THREE.Vector2(r, y)), d.seg, Math.PI / d.seg), { rot: [-Math.PI / 2, 0, 0] });
  duct.scale(1, HULL_FLAT, 1);
  widen(duct);
  flipWinding(duct);
  duct.computeVertexNormals();
  creaseNormals(duct, SMOOTH);
  // Faceted canopy: few faces and flat normals, whatever the density.
  const canopy = part(new THREE.SphereGeometry(0.42, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), { pos: CAN, scl: [0.86, 0.56, 1.55] });
  // Extra rings: the hull–engine joint needs vertices.
  const engine = new THREE.CylinderGeometry(ENG.rBack, ENG.rFront, ENG.len, d.eng, d.engH);
  const engineR = part(engine, engT, false, SMOOTH);
  const engineL = part(engine, engT, true, SMOOTH);
  if (normals === 'transfer') {
    transferNormals(hull, hullFromCylinder);
    for (const g of [engineR, engineL]) transferNormals(g, engineFromCylinder);
  }
  hullShadowBias(hull);
  setLine(hull, (v) => v.y); // the hull's equator

  // Hull–engine joint: each part measures how far inside the other a vertex is; the stroke is where it's 0.
  const zs = prof.map((q) => -q.y), rs = prof.map((q) => q.x); // profile: world z = -lathe y
  const hullR = (z: number) => {
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) return rs[i] + (rs[i + 1] - rs[i]) * ((z - z0) / (z1 - z0 || 1));
    }
    return 0;
  };
  const insideHull = (v: THREE.Vector3) => Math.hypot(v.x / widenAt(v.z), v.y / (HULL_FLAT * heightAt(v.z))) - hullR(v.z);
  const zF = ENG.z - ENG.len / 2, zB = ENG.z + ENG.len / 2;
  const insideEngine = (v: THREE.Vector3) => {
    if (v.z < zF || v.z > zB) return NO_LINE;
    const r = ENG.rFront + (ENG.rBack - ENG.rFront) * ((v.z - zF) / ENG.len);
    return Math.hypot(Math.abs(v.x) - ENG.x, v.y - ENG.y) - r;
  };
  setLine2(hull, insideEngine);
  for (const g of [engineR, engineL]) {
    // The caps are flat: no joint stroke across them.
    setLine2(g, (v) => ((Math.abs(v.z - zF) < 1e-4 || Math.abs(v.z - zB) < 1e-4) && Math.abs(insideHull(v)) > 0.05 ? NO_LINE : insideHull(v)));
    setLine(g, (v) => v.z - (zB - 0.35)); // ring at the engine's end
  }

  const { fin, finCap } = dorsal();
  return [
    { name: 'hull', zone: 'hull', geometry: hull },
    { name: 'intake', zone: 'intake', geometry: duct },
    { name: 'canopy', zone: 'canopy', geometry: canopy },
    { name: 'engine_r', zone: 'metal', geometry: engineR },
    { name: 'engine_l', zone: 'metal', geometry: engineL },
    { name: 'wing_r', zone: 'cobalt', geometry: wing(false) },
    { name: 'wing_l', zone: 'cobalt', geometry: wing(true) },
    { name: 'wing_tip_r', zone: 'red', geometry: part(wingTip, wingT) },
    { name: 'wing_tip_l', zone: 'red', geometry: part(wingTip, wingT, true) },
    { name: 'fin', zone: 'cobalt', geometry: fin },
    { name: 'fin_cap', zone: 'red', geometry: finCap },
    ...guns(false),
    ...guns(true),
  ];
}

// Painted outline thickness (1 = 1×), stored halved in the vertex color's red channel (0.5 = 1×).
const taperWing: Field = (v) => 1.25 - 0.7 * sstep(Math.abs(v.x), 0.6, 2.5); // thick at the root, thin at the tip
const taperFin: Field = (v) => 1.2 - 0.65 * sstep(v.y, 0.4, 1.15); // fin: thin at the top
const WIDTH: Record<Zone, Field> = {
  hull: (v) => 1 + 0.35 * sstep(-v.y, -0.05, 0.2), // more weight on the belly
  cobalt: (v) => (Math.abs(v.x) < 0.1 ? taperFin(v) : taperWing(v)),
  red: (v) => (Math.abs(v.x) < 0.1 ? taperFin(v) : taperWing(v)),
  // Engines: more weight at the back; barrels thin.
  metal: (v) => (Math.abs(Math.abs(v.x) - ENG.x) < ENG.rBack + 0.05 ? 1.05 + 0.25 * sstep(v.z, ENG.z - ENG.len / 2, ENG.z + ENG.len / 2) : 0.7),
  canopy: () => 1.0,
  intake: () => 0.8,
  gun: () => 0.85,
};

/**
 * Edge lines: an edge of the part is a line where its shading normals split (a hard edge) or where the part
 * is open. Written per triangle corner as `_edge`: the corner's one-hot + 2 × the flags of the triangle's three
 * edges, edge k being the one opposite corner k. The same rule as tools/blend-export.py.
 */
function setEdges(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position').array;
  const n = g.getAttribute('normal').array;
  const count = p.length / 3;
  const key = (i: number) => posKey(p, i * 3);
  const edgeKey = (i: number, j: number) => [key(i), key(j)].sort().join('|');
  const degenerate = (t: number) => new Set([key(t * 3), key(t * 3 + 1), key(t * 3 + 2)]).size < 3; // zero area: never drawn
  // Every triangle side, by the positions of its ends: [vertex at one end, vertex at the other].
  const sides = new Map<string, [number, number][]>();
  for (let t = 0; t < count / 3; t++) {
    if (degenerate(t)) continue;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + ((k + 1) % 3), j = t * 3 + ((k + 2) % 3);
      const list = sides.get(edgeKey(i, j)) ?? [];
      list.push([i, j]);
      sides.set(edgeKey(i, j), list);
    }
  }
  const sameNormal = (i: number, j: number) => n[i * 3] * n[j * 3] + n[i * 3 + 1] * n[j * 3 + 1] + n[i * 3 + 2] * n[j * 3 + 2] > 0.9999;
  const isLine = (i: number, j: number) => {
    const list = sides.get(edgeKey(i, j))!;
    if (list.length !== 2) return true; // open border, or more than two faces
    const [oi, oj] = list.find(([a]) => a !== i && a !== j)!;
    const [atI, atJ] = key(oi) === key(i) ? [oi, oj] : [oj, oi];
    return !(sameNormal(i, atI) && sameNormal(j, atJ));
  };
  const edge = new Float32Array(count * 3);
  for (let t = 0; t < count / 3; t++) {
    const flags = degenerate(t) ? [0, 0, 0] : [0, 1, 2].map((k) => (isLine(t * 3 + ((k + 1) % 3), t * 3 + ((k + 2) % 3)) ? 1 : 0));
    for (let c = 0; c < 3; c++) for (let j = 0; j < 3; j++) edge[(t * 3 + c) * 3 + j] = (c === j ? 1 : 0) + 2 * flags[j];
  }
  g.setAttribute('_edge', new THREE.BufferAttribute(edge, 3));
}

/** Palette UV (every face of the part inside its zone's column), painted width and edge lines. */
function finishPart({ zone, geometry }: Part) {
  setEdges(geometry);
  const count = geometry.getAttribute('position').count;
  const u = (ZONE_KEYS.indexOf(zone) + 0.5) / ZONE_KEYS.length;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uv[i * 2] = u;
    uv[i * 2 + 1] = 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const width = perVertex(geometry, WIDTH[zone]);
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = width[i] / 2;
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
}

/* ---------- Markers ---------- */

/** An empty node: a name, a transform and extras. */
function marker(name: string, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: THREE.Vector3, extras: Record<string, unknown> = {}) {
  const node = new THREE.Object3D();
  node.name = name;
  node.position.copy(position);
  node.quaternion.copy(quaternion);
  node.scale.copy(scale);
  node.userData = extras;
  return node;
}

const srgb = (hex: number): Vec3 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

function markers(): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  // Emissive strip on the trailing edge of each wing tip: a segment along the marker's local X, from -1 to +1.
  const a = onWing(1.9, 1.64, 0.035), b = onWing(2.27, 1.8, 0.035);
  const mirror = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
  for (const [side, p, q] of [['r', a, b], ['l', mirror(a), mirror(b)]] as const) {
    const dir = q.clone().sub(p);
    out.push(
      marker(`emit_wing_${side}`, p.clone().add(q).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize()), new THREE.Vector3(dir.length() / 2, 1, 1), {
        color: srgb(0xff2414),
        core: 0.08,
        glow: 0.5,
        blink_on: 0.6,
        blink_off: 0.6,
      }),
    );
  }
  // Flag on the nose: the box from -1 to +1 in local space; X = width, Y = up in the image, Z = out of the surface.
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
  out.push(marker('decal_flag', new THREE.Vector3(0, 0.2, -1.5), new THREE.Quaternion().setFromRotationMatrix(basis), new THREE.Vector3(0.18, 0.18, 0.25), { slot: 0 }));
  // Nozzles (local Z = the flame's direction, backward) and muzzles (local Z = forward, where shots go).
  const back = new THREE.Quaternion();
  const forward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const one = new THREE.Vector3(1, 1, 1);
  for (const [side, sx] of [['r', 1], ['l', -1]] as const) {
    out.push(marker(`nozzle_${side}`, new THREE.Vector3(sx * ENG.x, ENG.y, ENG.z + ENG.len / 2), back, one, { radius: 0.3, length: 1.5 }));
    out.push(marker(`muzzle_${side}`, new THREE.Vector3(sx * GUN.c.x, GUN.c.y, BARREL_FRONT - GUN.muzzleLen + 0.02), forward, one));
  }
  return out;
}

/* ---------- Palette PNG ---------- */

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array<ArrayBuffer> {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height); // each row starts with filter type 0
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(Buffer.from(type, 'ascii'), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]));
}

/** Rows from the top: base, shadow, outline. sRGB, like any color image. */
function palettePng(): Uint8Array<ArrayBuffer> {
  const width = ZONE_KEYS.length * SWATCH, height = 3 * SWATCH;
  const rgba = new Uint8Array(width * height * 4);
  ZONE_KEYS.forEach((key, column) => {
    const zone = ZONES[key];
    [zone.base, zone.shadow, zone.line].forEach((hex, row) => {
      for (let y = row * SWATCH; y < (row + 1) * SWATCH; y++) {
        for (let x = column * SWATCH; x < (column + 1) * SWATCH; x++) {
          rgba.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], (y * width + x) * 4);
        }
      }
    });
  });
  return encodePng(width, height, rgba);
}

/* ---------- Export ---------- */

// GLTFExporter reads Blobs with FileReader, which Node doesn't have.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
(globalThis as Record<string, unknown>).FileReader ??= NodeFileReader;

interface Writer {
  json: { images?: object[]; samplers?: object[]; textures?: object[] };
  processBufferViewImage(blob: Blob): Promise<number>;
}

async function exportShip(file: string, density: keyof typeof DENSITY, normals: 'angle' | 'transfer') {
  const material = new THREE.MeshStandardMaterial({ name: 'cel', color: 0xffffff, metalness: 0, roughness: 1 });
  ZONE_KEYS.forEach((key, column) => {
    const zone = ZONES[key];
    material.userData[`cel_sw_${column}`] = [zone.spec, zone.metal, 0];
  });
  const scene = new THREE.Scene();
  for (const p of buildParts(density, normals)) {
    finishPart(p);
    const mesh = new THREE.Mesh(p.geometry, material);
    mesh.name = p.name;
    scene.add(mesh);
  }
  scene.add(...markers());

  const png = palettePng();
  const exporter = new GLTFExporter();
  // The palette as the cel material's base color texture, with nearest filtering.
  exporter.register((writer) => ({
    async writeMaterialAsync(m: THREE.Material, materialDef: { pbrMetallicRoughness?: Record<string, unknown> }) {
      if (m !== material) return;
      const w = writer as unknown as Writer;
      const bufferView = await w.processBufferViewImage(new Blob([png], { type: 'image/png' }));
      const source = (w.json.images ??= []).push({ name: 'palette', mimeType: 'image/png', bufferView }) - 1;
      const sampler = (w.json.samplers ??= []).push({ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }) - 1;
      const index = (w.json.textures ??= []).push({ sampler, source }) - 1;
      (materialDef.pbrMetallicRoughness ??= {}).baseColorTexture = { index };
    },
  }) as never);
  const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
  writeFileSync(new URL(file, import.meta.url), new Uint8Array(glb));
  let triangles = 0;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) triangles += o.geometry.getAttribute('position').count / 3;
  });
  console.log(`${file}: ${triangles} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB`);
}

await exportShip('./demo-ship.glb', 'high', 'angle');
await exportShip('./demo-ship-low.glb', 'low', 'angle');
await exportShip('./demo-ship-transfer.glb', 'high', 'transfer');
