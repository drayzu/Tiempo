// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';
import { planeta, type Marco, type PlanetaOpts } from './planeta';
import { negro } from './mapas';
import { anillos, sombraDeAnillos } from './anillos';
import { sol, type SolOpts, type EstiloSol } from './sol';

/**
 * The bodies of the Solar System, ready to use: each one's map, air, relief and haze, as the
 * series draws them. `base` is where the maps are served from (e.g. `${import.meta.env.BASE_URL}texturas/`).
 * Anything can be overridden (`puntos`, `giro`, `superficie`…).
 *
 * Real figures for the caller (radius in km, flattening, axial tilt in degrees, a day in hours) are
 * in `DATOS`; the bodies are built in radii, north up, without their tilt.
 */
export const DATOS = {
  sol: { radioKm: 695700, inclinacion: 7.25, diaH: 609.1 },
  mercurio: { radioKm: 2439.7, inclinacion: 0.03, diaH: 1407.6 },
  venus: { radioKm: 6051.8, inclinacion: 177.4, diaH: -5832.5 },
  tierra: { radioKm: 6371.0, inclinacion: 23.44, diaH: 23.934 },
  luna: { radioKm: 1737.4, inclinacion: 6.68, diaH: 655.7 },
  marte: { radioKm: 3389.5, inclinacion: 25.19, diaH: 24.623 },
  jupiter: { radioKm: 69911, achatado: 0.06487, inclinacion: 3.13, diaH: 9.925 },
  saturno: { radioKm: 58232, achatado: 0.09796, inclinacion: 26.73, diaH: 10.656 },
  urano: { radioKm: 25362, achatado: 0.02293, inclinacion: 97.77, diaH: -17.24 },
  neptuno: { radioKm: 24622, achatado: 0.01708, inclinacion: 28.32, diaH: 16.11 },
} as const;

type Extra = Partial<PlanetaOpts>;
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

export const tierra = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_earth_daymap.jpg', nubes: base + '2k_earth_clouds.jpg', aire: 1, mar: true, halo: { color: C(0.35, 0.58, 1.0) }, puntos: 520000, semilla: 4, fondoR: 0.997, ...o });

export const luna = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_moon.jpg', aire: 0, relieve: true, puntos: 320000, semilla: 51, tinte: C(0.8, 0.78, 0.76), fondoR: 0.995, ...o });

export const mercurio = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_mercury.jpg', aire: 0, relieve: true, puntos: 420000, semilla: 5, tinte: C(1.15, 1.115, 1.058), fondoR: 0.994, ...o });

/**
 * Bright clouds (Venus, the giants) reflect most of the light: their maps are dimmed so they sit
 * with the rocky planets instead of burning out.
 */
export const venus = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_venus_atmosphere.jpg', aire: 1, halo: { color: C(1.0, 0.85, 0.62), r: 1.025 }, puntos: 300000, semilla: 22, tinte: C(0.5, 0.48, 0.46), ...o });

export const marte = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_mars.jpg', aire: 0.3, halo: { color: C(0.85, 0.5, 0.35), r: 1.02 }, puntos: 360000, semilla: 16, ...o });

export const jupiter = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_jupiter.jpg', aire: 1, halo: { color: C(1.0, 0.86, 0.66), r: 1.02 }, puntos: 480000, semilla: 31, tinte: C(0.55, 0.54, 0.52), achatado: DATOS.jupiter.achatado, ...o });

export const urano = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_uranus.jpg', aire: 1, halo: { color: C(0.6, 0.92, 1.0), r: 1.025 }, puntos: 300000, semilla: 41, tinte: C(0.42, 0.42, 0.42), achatado: DATOS.urano.achatado, ...o });

export const neptuno = (base: string, o: Extra = {}) =>
  planeta({ mapa: base + '2k_neptune.jpg', aire: 1, halo: { color: C(0.45, 0.62, 1.0), r: 1.025 }, puntos: 300000, semilla: 43, tinte: C(0.75, 0.75, 0.75), achatado: DATOS.neptuno.achatado, ...o });

/** Saturn's rings: the profile strip runs from 1.16 to 2.34 radii (the C ring's inner edge to the F ring). */
export const ANILLOS_SATURNO = { r0: 1.16, r1: 2.34 };

/**
 * Saturn and its rings: the rings in its equatorial plane, its shadow on them, theirs on it.
 * `update` takes the same frame as any body.
 */
export function saturno(base: string, o: Extra & { puntosAnillos?: number } = {}) {
  const { r0, r1 } = ANILLOS_SATURNO;
  const uAnillo = { value: negro() as THREE.Texture };
  const uConAnillo = { value: 0 };
  const ring = anillos({ mapa: base + '2k_saturn_ring_alpha.png', r0, r1, puntos: o.puntosAnillos ?? 600000 });
  const p = planeta({
    mapa: base + '2k_saturn.jpg',
    aire: 1,
    halo: { color: C(1.0, 0.88, 0.66), r: 1.02 },
    puntos: 460000,
    semilla: 37,
    tinte: C(0.6, 0.58, 0.55),
    achatado: DATOS.saturno.achatado,
    superficie: {
      pre: 'uniform sampler2D uAnillo; uniform float uConAnillo;',
      glsl: `if (uConAnillo > 0.5) { ${sombraDeAnillos(r0, r1)} }`,
      uniforms: { uAnillo, uConAnillo },
    },
    ...o,
  });
  // The rings go in the planet's group (its tilt), not in its flattened, turning body.
  p.group.add(ring.group);
  const base0 = p.update;
  return Object.assign(p, {
    anillos: ring,
    listo: Promise.all([p.listo, ring.listo]).then(() => {
      if (ring.tira) uAnillo.value = ring.tira;
      uConAnillo.value = 1;
    }),
    update(m: Marco) {
      base0(m);
      ring.update(m, { sol: m.sol.clone().normalize(), camara: m.camara });
    },
  });
}

export { sol, type SolOpts, type EstiloSol };
