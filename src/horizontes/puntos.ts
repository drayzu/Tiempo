// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';

/**
 * The library's own points: the same particle of light as the series' engines (Destino's
 * `materia`, Espacio's `points`, Tiempo's `materia`), so a body looks the same in any of them
 * without an adapter.
 *
 * - Size is physical: a point is `size` local units across, scaled with its object. Below the
 *   minimum it keeps the minimum and dims by the area it lost, so a body keeps its surface
 *   brightness at any distance and nothing flickers.
 * - Light only (additive), a soft gaussian disc.
 * - Unlike the engines' particles, these test depth: a body's dim photograph underneath (and any
 *   solid in front) hides what is behind it, and the log depth buffer is honoured when the
 *   renderer uses one.
 *
 * The body writes its own GLSL (`cuerpo`) on `p` (position), `em` (light) and `sz` (size), with
 * `color`, `size`, `seed` and `aKind` as attributes.
 */

export interface DatosPuntos {
  position: Float32Array;
  color: Float32Array;
  size: Float32Array;
  seed: Float32Array;
  aKind: Float32Array;
}

export interface Puntos {
  points: THREE.Points;
  u: Record<string, THREE.IUniform> & {
    uFocal: THREE.IUniform<number>;
    uMinPx: THREE.IUniform<number>;
    uMaxPx: THREE.IUniform<number>;
    uGain: THREE.IUniform<number>;
  };
}

/** What every body needs each frame to draw its points the right size. */
export interface Vista {
  /** The camera's focal length in device pixels: (height / 2) / tan(fov / 2). */
  focal: number;
  /** The device pixel ratio the canvas renders at. */
  dpr: number;
}

const VERT = (pre: string, cuerpo: string) => /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 color;
  attribute float size, seed, aKind;
  uniform float uFocal, uMinPx, uMaxPx, uGain;
  varying vec3 vEm;
  ${pre}
  void main() {
    vec3 p = position;
    vec3 em = color;
    float sz = size;
    ${cuerpo}
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
    float esc = length(modelViewMatrix[0].xyz);
    float s = sz * esc * uFocal / max(-mv.z, 1e-14);
    gl_PointSize = clamp(s, uMinPx, uMaxPx);
    vEm = em * uGain * min(1.0, (s * s) / (uMinPx * uMinPx));
    // Nothing to draw: off screen, so it costs no fill.
    if (vEm.r + vEm.g + vEm.b < 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;

const FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec3 vEm;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5;
    gl_FragColor = vec4(vEm * exp(-dot(c, c) * 14.0), 1.0);
  }`;

export function geometria(d: DatosPuntos, extra: Record<string, [Float32Array, number]> = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(d.color, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(d.size, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(d.seed, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(d.aKind, 1));
  for (const [k, [a, n]] of Object.entries(extra)) geo.setAttribute(k, new THREE.BufferAttribute(a, n));
  return geo;
}

export function puntos(geo: THREE.BufferGeometry, o: { pre?: string; cuerpo: string; uniforms?: Record<string, THREE.IUniform> }): Puntos {
  const u = { uFocal: { value: 1000 }, uMinPx: { value: 1.3 }, uMaxPx: { value: 24 }, uGain: { value: 1 }, ...(o.uniforms ?? {}) };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT(o.pre ?? '', o.cuerpo),
    fragmentShader: FRAG,
    uniforms: u,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, u: mat.uniforms as Puntos['u'] };
}

/** Per frame: the focal length and pixel ratio (and how present the body is). */
export function enfocar(n: Puntos, v: Vista, gain = 1) {
  n.u.uFocal.value = v.focal;
  n.u.uMinPx.value = 1.3 * v.dpr;
  n.u.uMaxPx.value = 24 * v.dpr;
  n.u.uGain.value = gain;
}
