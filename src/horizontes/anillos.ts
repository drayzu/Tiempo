// Copia de horizontes-cuerpos (d8c2cda) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';
import { GLSL_COMUN } from './glsl';
import { azar, cargar, lectorTira, pausa } from './mapas';
import { enfocar, geometria, puntos, type Puntos } from './puntos';
import { tamañoPara } from './esfera';
import type { Marco } from './planeta';

/**
 * A planet's rings in points, in its equatorial plane (local XZ, radii), from a profile strip
 * (colour and opacity from the inner edge to the outer one). The points are as dense as the rings
 * are opaque. Lit from the side the Sun is on (dimmer seen from the other), in the planet's shadow
 * where it falls, faint edge on; the planet's photograph hides the half behind it.
 */
export interface AnillosOpts {
  /** The profile strip (RGBA). */
  mapa: string;
  /** Its inner and outer radius (planet radii). */
  r0: number;
  r1: number;
  puntos?: number;
  semilla?: number;
}

export function anillos(o: AnillosOpts) {
  const group = new THREE.Group();
  const u = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uCamL: { value: new THREE.Vector3(0, 0, 5) } };
  const capas: Puntos[] = [];
  let tira: THREE.Texture | null = null;
  const listo = (async () => {
    tira = await cargar(o.mapa, true);
    tira.wrapS = THREE.ClampToEdgeWrapping;
    const leer = lectorTira(tira);
    const N = o.puntos ?? 300000;
    const r = azar(o.semilla ?? 61);
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const seed = new Float32Array(N);
    const S = tamañoPara(N) * 1.1;
    const c = [0, 0, 0, 0];
    let k = 0;
    // As dense as the rings are opaque: uniform over the annulus, kept by opacity.
    for (let tries = 0; k < N && tries < N * 8; tries++) {
      if (tries % 50000 === 0) await pausa();
      const rr = Math.sqrt(o.r0 * o.r0 + r() * (o.r1 * o.r1 - o.r0 * o.r0));
      leer((rr - o.r0) / (o.r1 - o.r0), c);
      if (r() > c[3]) continue;
      const a = r() * Math.PI * 2;
      const v = 0.85 + r() * 0.3;
      pos.set([Math.cos(a) * rr, 0, Math.sin(a) * rr], k * 3);
      col.set([c[0] * v, c[1] * v, c[2] * v], k * 3);
      size[k] = S * (0.65 + r() * 0.7);
      seed[k] = r();
      k++;
    }
    const geo = geometria({ position: pos.slice(0, k * 3), color: col.slice(0, k * 3), size: size.slice(0, k), seed: seed.slice(0, k), aKind: new Float32Array(k) });
    const nube = puntos(geo, {
      pre: /* glsl */ `uniform vec3 uSun, uCamL; ${GLSL_COMUN}`,
      cuerpo: /* glsl */ `{
        // Lit by how high the Sun stands over them; dimmer seen from the unlit side.
        float alto = abs(uSun.y);
        float mismoLado = step(0.0, uSun.y * (uCamL.y - p.y));
        float lit = (0.35 + 0.65 * sqrt(alto)) * mix(0.25, 1.0, mismoLado);
        // The planet's shadow.
        float t = dot(-p, uSun);
        float d = length(p + uSun * t);
        lit *= mix(1.0, 0.02, step(0.0, t) * (1.0 - smoothstep(0.97, 1.01, d)));
        // Edge on they are thin: their points would pile into a glaring line.
        lit *= smoothstep(0.0, 0.18, abs(normalize(uCamL - p).y));
        em = grado(color) * lit * 0.9;
      }`,
      uniforms: u,
    });
    group.add(nube.points);
    capas.push(nube);
  })();
  return {
    group,
    listo,
    /** The profile, once loaded (for the rings' shadow on the planet). */
    get tira() {
      return tira;
    },
    /** Per frame, with the same frame as its planet's (its turning frame: `planeta.local`). */
    update(m: Marco, local: { sol: THREE.Vector3; camara: THREE.Vector3 }) {
      u.uSun.value.copy(local.sol);
      u.uCamL.value.copy(local.camara);
      for (const c of capas) enfocar(c, m, m.presencia ?? 1);
    },
  };
}

/**
 * GLSL for the planet's ground: the rings' shadow on it. Needs `uniform sampler2D uAnillo;` and the
 * rings' radii; uses `n`, `uSun` and `sombra`.
 */
export function sombraDeAnillos(r0: number, r1: number) {
  return /* glsl */ `
    if (abs(uSun.y) > 1e-4) {
      float t = -n.y / uSun.y;
      if (t > 0.0) {
        float r = length((n + uSun * t).xz);
        float s = (r - ${r0.toFixed(4)}) / ${(r1 - r0).toFixed(4)};
        if (s > 0.0 && s < 1.0) sombra *= 1.0 - 0.85 * texture2D(uAnillo, vec2(s, 0.5)).a;
      }
    }`;
}
