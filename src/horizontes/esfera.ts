// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';
import { geometria, type DatosPuntos } from './puntos';
import { azar, pausa } from './mapas';

/**
 * The lattices a body's points sit on.
 *
 * - `fibonacci`: points over the whole sphere, each nudged within its cell (else the lattice's
 *   spirals show as hatching), sized so the sphere stays as covered (and as bright) whatever the
 *   count: `4.76 / √N` radii, ±35 %.
 * - The patch (clipmaps for points): level L has a spacing of S0 / 2^L radians and a window of
 *   2·NV × 2·NV cells round the ground under the camera. Every point sits in a fixed cell of a
 *   latitude–longitude lattice of its level, so moving the camera never makes them slide; the
 *   window only moves by whole cells, fading at its edge, and each level leaves a hole where the
 *   next, finer one is on. The camera's height picks the level: about 0.45 % of the height between
 *   points on the ground. One geometry serves every body.
 */

export const S0 = 0.0049;
export const NIVELES = 9;
export const NV = 80;
/** Point size per point count: the sphere stays covered. */
export const tamañoPara = (n: number) => 4.76 / Math.sqrt(n);
/** The angle between neighbouring points, for `n` over the sphere. */
export const pasoPara = (n: number) => Math.sqrt((4 * Math.PI) / n);

/**
 * `n` points over the unit sphere. `color(x, y, z, out)` fills each one's linear colour and returns
 * its kind (0 by default); `extra(i, x, y, z, out)` can fill extra per-point floats (`porPunto` of them).
 */
export async function fibonacci(
  n: number,
  seed: number,
  color: (x: number, y: number, z: number, out: number[]) => number,
  extra?: { porPunto: number; llenar: (x: number, y: number, z: number, out: Float32Array, i: number) => void },
) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const seeds = new Float32Array(n);
  const kind = new Float32Array(n);
  const ex = extra ? new Float32Array(n * extra.porPunto) : null;
  const r = azar(seed);
  const gauss = () => (r() + r() + r() + r() - 2) * 0.866;
  const S = tamañoPara(n);
  const J = pasoPara(n) * 0.35;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (i % 40000 === 0) await pausa();
    const y0 = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y0 * y0);
    const a = i * ga + (gauss() * J) / Math.max(rr, 0.05);
    const y = Math.max(-1, Math.min(1, y0 + gauss() * J * rr));
    const r2 = Math.sqrt(1 - y * y);
    const x = Math.cos(a) * r2;
    const z = Math.sin(a) * r2;
    kind[i] = color(x, y, z, c);
    const v = 0.8 + r() * 0.4;
    pos.set([x, y, z], i * 3);
    col.set([c[0] * v, c[1] * v, c[2] * v], i * 3);
    size[i] = S * (0.65 + r() * 0.7);
    seeds[i] = r();
    if (ex && extra) extra.llenar(x, y, z, ex, i * extra.porPunto);
  }
  const datos: DatosPuntos = { position: pos, color: col, size, seed: seeds, aKind: kind };
  return { datos, extra: ex };
}

let geoParche: THREE.BufferGeometry | null = null;
/** The patch's lattice (cell offsets i, j and level L as the position): one for every body. */
export function geometriaParche() {
  if (geoParche) return geoParche;
  const n = NIVELES * (2 * NV) * (2 * NV);
  const pos = new Float32Array(n * 3);
  let k = 0;
  for (let L = 1; L <= NIVELES; L++)
    for (let j = -NV; j < NV; j++)
      for (let i = -NV; i < NV; i++) {
        pos.set([i, j, L], k * 3);
        k++;
      }
  geoParche = geometria({ position: pos, color: new Float32Array(n * 3).fill(1), size: new Float32Array(n).fill(1), seed: new Float32Array(n), aKind: new Float32Array(n) });
  return geoParche;
}

const f = (x: number) => x.toFixed(6);

/** The patch's uniforms (shared with the global points, which step aside where it is on). */
export const PARCHE_PRE = /* glsl */ `uniform float uFocoLat, uFocoLon, uNivel;`;

/**
 * GLSL for the patch, before the body's colour: from the lattice cell, `n` (the point's direction),
 * `la`, `lo`, `uv`, `hp` (a hash of the point), `paso` (its spacing) and `p`.
 */
export const PARCHE_INICIO = /* glsl */ `
  float L = position.z;
  float sp = ${f(S0)} / exp2(L);
  float row = floor(uFocoLat / sp) + position.y;
  float lat = (row + 0.5) * sp;
  float nLon = max(1.0, floor(6.2831853 * cos(lat) / sp));
  float dl = 6.2831853 / nLon;
  float col = floor(uFocoLon / dl) + position.x;
  vec3 cell = vec3(row, mod(col, nLon), L);
  float la = lat + (h3(cell) - 0.5) * sp * 0.8;
  float lo = (col + 0.5 + (h3(cell + 1.7) - 0.5) * 0.8) * dl;
  vec3 n = dirDe(la, lo);
  p = n;
  vec2 uv = uvLL(la, lo);
  float hp = h3(cell + 3.1);
  float paso = sp;`;

/** GLSL for the patch, after the body's colour (`em`): which levels are on, the size, the horizon. */
export const PARCHE_FIN = /* glsl */ `
  // The finest level the camera's height asks for; fading at the window's edge; a hole where the
  // next, finer level takes over; nothing past the poles.
  float on = clamp(uNivel - L + 1.0, 0.0, 1.0);
  float dc = max(abs(position.x + 0.5), abs(position.y + 0.5)) / ${f(NV)};
  on *= 1.0 - smoothstep(0.7, 1.0, dc);
  float ang = acos(clamp(dot(n, dirDe(uFocoLat, uFocoLon)), -1.0, 1.0));
  on *= mix(1.0, smoothstep(0.7, 0.95, ang / (${f(NV)} * sp * 0.5)), clamp(uNivel - L, 0.0, 1.0));
  on *= step(abs(lat), 1.5707);
  em *= on;
  sz = sp * 0.8;
  if (dot(n, uCamL - n) < 0.0 || on < 0.002) em *= 0.0;`;

/** GLSL for the global points: they step aside where the patch's first level is on; the horizon. */
export const GLOBAL_FIN = /* glsl */ `
  float angF = acos(clamp(dot(normalize(p), dirDe(uFocoLat, uFocoLon)), -1.0, 1.0));
  em *= mix(1.0, smoothstep(0.7, 0.95, angF / ${f(NV * S0 * 0.5)}), clamp(uNivel, 0.0, 1.0));
  if (dot(normalize(p), uCamL - p) < 0.0) em *= 0.0;`;

/** Per frame: where the patch is and which level it reaches, from the camera (body radii, body frame). */
export function seguir(u: { uFocoLat: { value: number }; uFocoLon: { value: number }; uNivel: { value: number } }, cam: THREE.Vector3) {
  const l = cam.length();
  u.uFocoLat.value = Math.asin(Math.max(-1, Math.min(1, cam.y / l)));
  u.uFocoLon.value = Math.atan2(-cam.z, cam.x);
  const h = Math.max(l - 1, 1e-6);
  u.uNivel.value = Math.max(0, Math.min(NIVELES, Math.log2(S0 / (h * 0.0045))));
  return u.uNivel.value;
}
