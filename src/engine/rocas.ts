import * as THREE from 'three';
import { rng } from '../lib/math';

/**
 * Rocks: solid, faceted, lit by one sun, slowly tumbling. Points read as dust or as glowing balls;
 * a rock the camera flies past must look like a rock. A few lumpy variants are drawn instanced.
 *
 * They are opaque and write depth (what is behind a rock is hidden). Below a couple of pixels a rock
 * fades to black instead of flickering in and out of the raster; the era fades them with `alpha`.
 */

export interface RocasData {
  /** Per rock: centre (3), radius (1), tumble axis (3), tumble speed (1), colour (3), variant (1). */
  pos: Float32Array;
  radius: Float32Array;
  axis: Float32Array;
  spin: Float32Array;
  tint: Float32Array;
  variant: Float32Array;
}

const VARIANTS = 5;

/** Builds the rocks' data (pure: fine in a worker). `place` fills one rock; return false to skip it. */
export function rocasData(seed: number, n: number, place: (r: () => number, out: { x: number; y: number; z: number; radius: number; r: number; g: number; b: number }) => boolean): RocasData {
  const r = rng(seed);
  const pos: number[] = [];
  const radius: number[] = [];
  const axis: number[] = [];
  const spin: number[] = [];
  const tint: number[] = [];
  const variant: number[] = [];
  const o = { x: 0, y: 0, z: 0, radius: 1, r: 0.5, g: 0.45, b: 0.4 };
  for (let k = 0; k < n * 4 && pos.length / 3 < n; k++) {
    if (!place(r, o)) continue;
    pos.push(o.x, o.y, o.z);
    radius.push(o.radius);
    const u = r() * 2 - 1;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    axis.push(Math.cos(a) * s, Math.sin(a) * s, u);
    spin.push((0.05 + r() * 0.35) * (r() < 0.5 ? -1 : 1));
    const v = 0.8 + r() * 0.4;
    tint.push(o.r * v, o.g * v, o.b * v);
    variant.push(Math.floor(r() * VARIANTS));
  }
  const f = (x: number[]) => new Float32Array(x);
  return { pos: f(pos), radius: f(radius), axis: f(axis), spin: f(spin), tint: f(tint), variant: f(variant) };
}

/** A lumpy, faceted rock of radius ~1. */
function lump(seed: number) {
  const r = rng(seed);
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  // A few random bumps and dents, and an overall squash.
  const bumps = Array.from({ length: 7 }, () => {
    const u = r() * 2 - 1;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return { d: new THREE.Vector3(Math.cos(a) * s, Math.sin(a) * s, u), k: (r() - 0.45) * 0.5, w: 0.5 + r() * 1.2 };
  });
  const sq = new THREE.Vector3(0.75 + r() * 0.5, 0.6 + r() * 0.35, 0.8 + r() * 0.4);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let h = 1;
    for (const b of bumps) h += b.k * Math.exp(-(1 - v.dot(b.d)) * 4 * b.w);
    h += 0.06 * Math.sin(v.x * 9 + seed) * Math.sin(v.y * 7 - seed) * Math.sin(v.z * 8);
    v.multiplyScalar(h).multiply(sq);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  geo.dispose();
  return flat;
}

const VERT = /* glsl */ `
  attribute vec3 aAxis, aTint;
  attribute float aSpin;
  uniform float uTime, uFocal;
  varying vec3 vN;
  varying vec3 vTint;
  varying float vFade;
  vec3 turn(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
  void main() {
    float a = uTime * aSpin;
    vec3 pl = turn(position, aAxis, a);
    vec3 nl = turn(normal, aAxis, a);
    vec4 wp = modelMatrix * instanceMatrix * vec4(pl, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nl);
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    float sc = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
    vec4 c = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vFade = smoothstep(1.2, 3.5, sc * uFocal / max(-c.z, 1e-6)) * step(c.z, 0.0);
    vTint = aTint;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uAlpha, uAmb;
  varying vec3 vN;
  varying vec3 vTint;
  varying float vFade;
  void main() {
    vec3 n = normalize(vN);
    float l = max(dot(n, uSun), 0.0);
    vec3 col = vTint * (uAmb + 1.15 * pow(l, 0.85));
    gl_FragColor = vec4(col * vFade * uAlpha, 1.0);
  }
`;

export function rocas(data: RocasData) {
  const object = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uFocal: { value: 1000 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uAlpha: { value: 1 }, uAmb: { value: 0.02 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const meshes: THREE.InstancedMesh[] = [];
  for (let v = 0; v < VARIANTS; v++) {
    const ids: number[] = [];
    for (let i = 0; i < data.variant.length; i++) if (data.variant[i] === v) ids.push(i);
    if (!ids.length) continue;
    const geo = lump(17 + v * 31);
    const axis = new Float32Array(ids.length * 3);
    const spin = new Float32Array(ids.length);
    const tint = new Float32Array(ids.length * 3);
    const mesh = new THREE.InstancedMesh(geo, mat, ids.length);
    ids.forEach((i, j) => {
      t.set(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]);
      s.setScalar(data.radius[i]);
      mesh.setMatrixAt(j, m.compose(t, q, s));
      axis.set([data.axis[i * 3], data.axis[i * 3 + 1], data.axis[i * 3 + 2]], j * 3);
      spin[j] = data.spin[i];
      tint.set([data.tint[i * 3], data.tint[i * 3 + 1], data.tint[i * 3 + 2]], j * 3);
    });
    geo.setAttribute('aAxis', new THREE.InstancedBufferAttribute(axis, 3));
    geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    mesh.frustumCulled = false;
    meshes.push(mesh);
    object.add(mesh);
  }
  return {
    object,
    uniforms,
    /** `sunWorld`: the sun's direction in world space. */
    update(sunWorld: THREE.Vector3, time: number, focal: number, alpha: number) {
      uniforms.uSun.value.copy(sunWorld).normalize();
      uniforms.uTime.value = time;
      uniforms.uFocal.value = focal;
      uniforms.uAlpha.value = alpha;
      object.visible = alpha > 0.01;
    },
  };
}
