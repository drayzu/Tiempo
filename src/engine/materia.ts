import * as THREE from 'three';
import { rng } from '../lib/math';

/**
 * Matter: Potencias' particles of light, plus what Tiempo needs.
 *
 * - Light and ink. Early on the universe is brighter than its matter (a glowing fog, a star's
 *   flood), so a particle can also hide what lies behind it. Each point has light it gives
 *   (emission) and light it blocks (ink); drawn premultiplied, the same point is a spark on black
 *   and a speck against the fire.
 * - Physical size, as in Potencias: below the minimum a point keeps it and dims by the area it lost;
 *   light sources (`star`) keep their light below a pixel.
 * - Reordering: every point travels from `aFrom` to `position` as `uAssemble` goes 0 → 1, after its
 *   own `aDelay`. Nothing is created: the same matter rearranges.
 * - Reveal: a point appears once `uReveal` passes its `aDelay`.
 * - Fog: `uFog` is the distance light travels, in the cloud's own units. Farther points dissolve into
 *   the background (the opaque early universe); 0 turns it off.
 * - Near fade (`uNear`): in a volume the camera flies through, points about to touch the lens fade
 *   instead of swelling into a fog of discs. First person depends on it.
 * - Stand-ins (`flag`) can be hidden or made to glow (`uFlagAlpha`).
 * - Scenes add their own motion and light in GLSL (`move`, on `p`, `em`, `occ`, `sz`).
 */

const VERT = (pre: string, move: string) => /* glsl */ `
  attribute vec3 color;
  attribute vec3 aFrom;
  attribute float size, seed, drift, flag, aDelay, aStar, aKind, aInk;
  uniform float uTime, uFocal, uMinPx, uMaxPx, uSizeUnit, uAlpha, uFlagAlpha, uGain, uInk;
  uniform float uAssemble, uReveal, uSpread, uFlyFade, uFog, uFogNear, uCamDist, uNear;
  varying vec3 vEm;
  varying float vOcc;
  ${pre}
  void main() {
    float k = clamp(uAssemble * (1.0 + uSpread) - aDelay * uSpread, 0.0, 1.0);
    k = k * k * (3.0 - 2.0 * k);
    vec3 p = mix(aFrom, position, k);
    p += drift * vec3(sin(uTime * 1.3 + seed * 17.0), cos(uTime * 1.1 + seed * 23.0), sin(uTime * 0.9 + seed * 31.0));
    vec3 em = color;
    float occ = aInk;
    float sz = size;
    ${move}
    float scale = length(modelMatrix[0].xyz);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 1e-6);
    float s = sz * uSizeUnit * scale * uFocal / depth;
    gl_PointSize = clamp(s, uMinPx, uMaxPx);
    float dim = mix(min(1.0, (s * s) / (uMinPx * uMinPx)), 1.0, aStar);
    float shown = smoothstep(aDelay, aDelay + 0.04, uReveal * 1.04);
    float arrive = mix(1.0, smoothstep(0.0, 0.35, k), uFlyFade);
    if (uNear > 0.0 && uCamDist > 0.0) arrive *= mix(1.0, smoothstep(0.08, 0.35, -mv.z / uCamDist), uNear);
    float fog = uFog > 0.0 ? exp(-max(depth / scale - uFogNear, 0.0) / uFog) : 1.0;
    float a = uAlpha * mix(1.0, uFlagAlpha, flag) * shown * arrive * fog;
    vEm = em * uGain * dim * a;
    vOcc = clamp(occ * uInk * min(dim, 1.0) * a, 0.0, 1.0);
    // Nothing to draw: park it off screen so it costs no fill.
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
  drift: Float32Array;
  flag: Float32Array;
  aDelay: Float32Array;
  aStar: Float32Array;
  aKind: Float32Array;
}

const ITEM: Record<keyof MateriaData, number> = { position: 3, aFrom: 3, color: 3, aInk: 1, size: 1, seed: 1, drift: 1, flag: 1, aDelay: 1, aStar: 1, aKind: 1 };

export interface MateriaOpts {
  /** World units per unit of `size`. */
  sizeUnit?: number;
  gain?: number;
  /** GLSL declarations (uniforms, attributes, functions). */
  pre?: string;
  /** GLSL run on `p` (position), `em` (emission), `occ` (ink) and `sz` (size), after reordering. */
  move?: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Extra per-point attributes: name -> [array, item size]. */
  extra?: Record<string, [Float32Array, number]>;
}

export interface MateriaU {
  uTime: THREE.IUniform<number>;
  uFocal: THREE.IUniform<number>;
  uMinPx: THREE.IUniform<number>;
  uMaxPx: THREE.IUniform<number>;
  uSizeUnit: THREE.IUniform<number>;
  uAlpha: THREE.IUniform<number>;
  uFlagAlpha: THREE.IUniform<number>;
  uGain: THREE.IUniform<number>;
  uInk: THREE.IUniform<number>;
  uAssemble: THREE.IUniform<number>;
  uReveal: THREE.IUniform<number>;
  uSpread: THREE.IUniform<number>;
  uFlyFade: THREE.IUniform<number>;
  uFog: THREE.IUniform<number>;
  uFogNear: THREE.IUniform<number>;
  uCamDist: THREE.IUniform<number>;
  uNear: THREE.IUniform<number>;
}

export interface Materia {
  points: THREE.Points;
  u: MateriaU & Record<string, THREE.IUniform>;
}

/** Wraps generated data into a cloud (cheap: no per-point work). */
export function materia(data: MateriaData, o: MateriaOpts = {}): Materia {
  const geo = new THREE.BufferGeometry();
  for (const key of Object.keys(ITEM) as (keyof MateriaData)[]) geo.setAttribute(key, new THREE.BufferAttribute(data[key], ITEM[key]));
  for (const [k, [arr, n]] of Object.entries(o.extra ?? {})) geo.setAttribute(k, new THREE.BufferAttribute(arr, n));
  const u: MateriaU = {
    uTime: { value: 0 },
    uFocal: { value: 1000 },
    uMinPx: { value: 1.6 },
    uMaxPx: { value: 24 },
    uSizeUnit: { value: o.sizeUnit ?? 1 },
    uAlpha: { value: 1 },
    uFlagAlpha: { value: 1 },
    uGain: { value: o.gain ?? 1 },
    uInk: { value: 0 },
    uAssemble: { value: 1 },
    uReveal: { value: 1 },
    uSpread: { value: 1.2 },
    uFlyFade: { value: 0 },
    uFog: { value: 0 },
    uFogNear: { value: 0 },
    uCamDist: { value: 0 },
    uNear: { value: 0 },
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
  return { points, u: mat.uniforms as MateriaU & Record<string, THREE.IUniform> };
}

export interface PushOpts {
  /** Where the point starts before reordering. Defaults to its own place. */
  from?: [number, number, number];
  /** 0..1: when it reorders / appears. */
  delay?: number;
  /** Free for the cloud's own shader (a role, a group). */
  kind?: number;
  /** How much light it blocks (0..1). */
  ink?: number;
  /** A stand-in a world can hide or make glow. */
  flag?: boolean;
  /** A light source: stays visible below a pixel. */
  star?: boolean;
  /** Ambient wander (units). */
  drift?: number;
}

/** Collects points; `data()` hands them over as typed arrays (transferable from a worker). */
export function materiaBuilder(seed: number) {
  const r = rng(seed);
  const pos: number[] = [];
  const from: number[] = [];
  const col: number[] = [];
  const ink: number[] = [];
  const size: number[] = [];
  const seeds: number[] = [];
  const drift: number[] = [];
  const flags: number[] = [];
  const delay: number[] = [];
  const star: number[] = [];
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
    /** `light` scales the colour with ±20 % natural variation; `s` the size with ±35 %. */
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
      drift.push(o.drift ?? 0);
      flags.push(o.flag ? 1 : 0);
      delay.push(o.delay ?? 0);
      star.push(o.star ? 1 : 0);
      kind.push(o.kind ?? 0);
    },
    data(): MateriaData {
      const f = (a: number[]) => new Float32Array(a);
      return {
        position: f(pos),
        aFrom: f(from),
        color: f(col),
        aInk: f(ink),
        size: f(size),
        seed: f(seeds),
        drift: f(drift),
        flag: f(flags),
        aDelay: f(delay),
        aStar: f(star),
        aKind: f(kind),
      };
    },
  };
}
