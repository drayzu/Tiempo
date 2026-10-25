import * as THREE from 'three';
import { rng } from '../../src/lib/math';

/**
 * Matter: Potencias' particles of light, plus one thing Tiempo needs. Early on the universe is
 * brighter than its matter (a glowing fog), so a particle can also *hide* what is behind it: each
 * one has light it gives (emission) and light it blocks (ink). Drawn premultiplied, the same point
 * is a spark on black and a speck against the fire.
 *
 * - Size is physical, as in Potencias: below the minimum a point keeps it and dims by area.
 * - `uK` moves every point from `aFrom` to `position` (staggered by `aDelay`): the same matter,
 *   reordered.
 * - `uFog`: the distance light travels (scene units). Farther points dissolve into the background;
 *   0 turns it off.
 * - Scenes add their own motion and light with GLSL (`move`, run on `p`, `em`, `occ`, `sz`).
 */

const VERT = (pre: string, move: string) => /* glsl */ `
  attribute vec3 color;
  attribute vec3 aFrom;
  attribute float size, seed, aDelay, aKind, aInk;
  uniform float uTime, uFocal, uMinPx, uMaxPx, uSizeUnit, uGain, uInk, uK, uSpread, uFog, uFogNear;
  varying vec3 vEm;
  varying float vOcc;
  ${pre}
  void main() {
    float k = clamp(uK * (1.0 + uSpread) - aDelay * uSpread, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 p = mix(aFrom, position, k);
    vec3 em = color;
    float occ = aInk;
    float sz = size;
    ${move}
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 1e-4);
    float s = sz * uSizeUnit * uFocal / depth;
    gl_PointSize = clamp(s, uMinPx, uMaxPx);
    float dim = min(1.0, (s * s) / (uMinPx * uMinPx));
    float fog = uFog > 0.0 ? exp(-max(depth - uFogNear, 0.0) / uFog) : 1.0;
    vEm = em * uGain * dim * fog;
    vOcc = clamp(occ * uInk * dim * fog, 0.0, 1.0);
    if (vEm.r + vEm.g + vEm.b + vOcc < 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vEm;
  varying float vOcc;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float f = exp(-dot(c, c) * 14.0);
    gl_FragColor = vec4(vEm * f, vOcc * f);
  }
`;

export interface MateriaData {
  position: Float32Array;
  aFrom: Float32Array;
  color: Float32Array;
  aInk: Float32Array;
  size: Float32Array;
  seed: Float32Array;
  aDelay: Float32Array;
  aKind: Float32Array;
}

const ITEM: Record<keyof MateriaData, number> = { position: 3, aFrom: 3, color: 3, aInk: 1, size: 1, seed: 1, aDelay: 1, aKind: 1 };

export interface MateriaOpts {
  sizeUnit?: number;
  /** GLSL declarations (uniforms, attributes, functions). */
  pre?: string;
  /** GLSL run on `p` (position), `em` (emission), `occ` (ink), `sz` (size), after assembly. */
  move?: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Extra per-point attributes: name -> [array, item size]. */
  extra?: Record<string, [Float32Array, number]>;
}

export type Nube = ReturnType<typeof materia>;

export function materia(data: MateriaData, o: MateriaOpts = {}) {
  const geo = new THREE.BufferGeometry();
  for (const key of Object.keys(ITEM) as (keyof MateriaData)[]) geo.setAttribute(key, new THREE.BufferAttribute(data[key], ITEM[key]));
  for (const [k, [arr, n]] of Object.entries(o.extra ?? {})) geo.setAttribute(k, new THREE.BufferAttribute(arr, n));
  const u = {
    uTime: { value: 0 },
    uFocal: { value: 1000 },
    uMinPx: { value: 1.6 },
    uMaxPx: { value: 24 },
    uSizeUnit: { value: o.sizeUnit ?? 1 },
    uGain: { value: 1 },
    uInk: { value: 0 },
    uK: { value: 1 },
    uSpread: { value: 1.2 },
    uFog: { value: 0 },
    uFogNear: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT(o.pre ?? '', o.move ?? ''),
    fragmentShader: FRAG,
    uniforms: { ...u, ...(o.uniforms ?? {}) },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, u: mat.uniforms as typeof u & Record<string, THREE.IUniform> };
}

/** Per frame: the camera's focal length in pixels and the device pixel ratio. */
export function enfocar(n: Nube, focal: number, dpr: number, time: number) {
  n.u.uFocal.value = focal;
  n.u.uMinPx.value = 1.6 * dpr;
  n.u.uMaxPx.value = 24 * dpr;
  n.u.uTime.value = time;
}

export interface PushOpts {
  from?: [number, number, number];
  delay?: number;
  kind?: number;
  /** How much light it blocks (0..1). */
  ink?: number;
}

/** Collects points; `data()` hands them over as typed arrays. */
export function materiaBuilder(seed: number) {
  const r = rng(seed);
  const pos: number[] = [];
  const from: number[] = [];
  const col: number[] = [];
  const ink: number[] = [];
  const size: number[] = [];
  const seeds: number[] = [];
  const delay: number[] = [];
  const kind: number[] = [];
  const c = new THREE.Color();
  return {
    r,
    get count() {
      return pos.length / 3;
    },
    onSphere(): [number, number, number] {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      return [Math.cos(a) * s, Math.sin(a) * s, u];
    },
    /** `light` scales the colour with ±20 % variation; `s` the size with ±35 %. */
    push(x: number, y: number, z: number, hex: number | THREE.Color, s: number, light = 1, o: PushOpts = {}) {
      pos.push(x, y, z);
      const f = o.from ?? [x, y, z];
      from.push(f[0], f[1], f[2]);
      if (typeof hex === 'number') c.setHex(hex);
      else c.copy(hex);
      c.multiplyScalar(light * (0.8 + r() * 0.4));
      col.push(c.r, c.g, c.b);
      ink.push(o.ink ?? 0);
      size.push(s * (0.65 + r() * 0.7));
      seeds.push(r());
      delay.push(o.delay ?? 0);
      kind.push(o.kind ?? 0);
    },
    data(): MateriaData {
      const f = (a: number[]) => new Float32Array(a);
      return { position: f(pos), aFrom: f(from), color: f(col), aInk: f(ink), size: f(size), seed: f(seeds), aDelay: f(delay), aKind: f(kind) };
    },
  };
}
