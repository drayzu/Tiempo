import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';

/**
 * El plasma de quarks → los quarks quedan presos (≈ 10⁻¹¹ to 10⁻⁵ s). 1 unit = 0.1 fm, as
 * Potencias' proton.
 *
 * The universe is a soup of free quarks (red, green and blue: their colour charge) and gluons, at
 * trillions of degrees. The camera flies through it, first person. When it cools below about 2 × 10¹²
 * K the quarks are caught in threes (and in pairs): each trio's colours add up to white, and the soup
 * drains of colour in a few instants; the gluons become the tubes that hold them. One of those trios
 * is our proton: the camera has been flying towards it, and circles it as it is born.
 * («Nadie ha visto un quark solo», in Potencias, is the same proton pulled apart.)
 */

const QUARK = [0xff4a5e, 0x4aff9a, 0x4a8cff];
const GLUON = 0xffe6b0;
const WHITE = 0xfff1dc;
/** A nucleon's three quarks, as in Potencias' proton (units). */
const LEGS = [new THREE.Vector3(3.3, 0.6, 0.5), new THREE.Vector3(-2.1, 2.5, -0.4), new THREE.Vector3(-1.4, -2.9, 0.3)].map((v) => v.multiplyScalar(0.75));
/** Our proton, where the flight ends. */
const OURS = new THREE.Vector3(0.6, -0.4, -46);
const HALF = 42;

/**
 * Quarks (kind 0): free they roam around their trio's centre (`aFrom` is the centre, `position` the
 * bound place), shaking fast; bound they sit on their leg of the Y and their colour drains to white.
 * Gluons (kind 1): free they hop between quarks; bound they line a leg of the Y (`aDelay2` along it).
 * Each trio is caught at its own instant (`aDelay`, nearer our proton a little earlier).
 */
const MOVE = /* glsl */ `
  float kb = smoothstep(aDelay, aDelay + 0.12, uBind);
  vec3 jit = vec3(sin(uTime * 9.1 + seed * 91.0), cos(uTime * 8.3 + seed * 53.0), sin(uTime * 10.7 + seed * 29.0));
  if (aKind < 0.5) {
    vec3 roam = aRoam + jit * 0.9 + vec3(sin(uTime * 1.3 + seed * 17.0), cos(uTime * 1.1 + seed * 23.0), sin(uTime * 0.9 + seed * 31.0)) * 2.5;
    p = mix(aFrom + roam, position + jit * 0.08, kb);
    // Each trio adds up to white; our proton, seen close, keeps its three colours at the tips of its Y.
    float ours = step(0.5, sz);
    em = mix(em, uWhite * 0.55, kb * uDrain * (1.0 - 0.8 * ours)) * (1.0 + ours * 1.5);
    sz *= mix(1.0, 0.8, kb) * (1.0 + ours * 0.6);
  } else {
    vec3 hop = aRoam * fract(uTime * 0.7 + seed * 5.0);
    vec3 tube = mix(aFrom, position, aDelay2) + jit * 0.12;
    p = mix(aFrom + hop + jit * 0.6, tube, kb);
    em *= mix(0.9 + 0.6 * sin(uTime * 6.0 + seed * 40.0), 0.5, kb);
  }
`;

export function quarks(): EraModule {
  return {
    spec: {
      id: 'quarks',
      acto: 'El primer segundo',
      certeza: 'T',
      name: 'El plasma de quarks',
      fact: 'Quarks y gluones sueltos a billones de grados: ni siquiera existen los protones.',
      ficha: ['plasma de quarks y gluones: sobre 2 × 10¹² K', 'se recrea en choques de núcleos en el LHC y en RHIC', 'los protones se forman hacia 10⁻⁵ s'],
      label: 'quarks',
      unitExp: -16,
      frame: 30,
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      tint: 0xff9ac0,
      fadeE: [-4, -2, 3, 4.5],
      notes: [
        { at: OURS.clone().add(LEGS[0]).toArray(), text: 'quark up', when: 'qrk.bound' },
        { at: OURS.clone().add(LEGS[1]).toArray(), text: 'quark up', when: 'qrk.bound' },
        { at: OURS.clone().add(LEGS[2]).toArray(), text: 'quark down', when: 'qrk.bound' },
      ],
      generate() {
        const r = rng(501);
        const b = materiaBuilder(502);
        const roam: number[] = [];
        const along: number[] = [];
        const trio = (c: THREE.Vector3, delay: number, light: number, size = 1, gluons = 3) => {
          // Three quarks, one of each colour.
          LEGS.forEach((leg, j) => {
            b.push(c.x + leg.x, c.y + leg.y, c.z + leg.z, QUARK[j], 0.32 * size, light * 0.7, { from: [c.x, c.y, c.z], delay, kind: 0 });
            roam.push(gauss(r) * 4, gauss(r) * 4, gauss(r) * 4);
            along.push(0);
          });
          // Gluons: free they hop; bound they line the three legs of the Y.
          for (let k = 0; k < gluons; k++) {
            const leg = LEGS[k % 3];
            b.push(c.x + leg.x, c.y + leg.y, c.z + leg.z, GLUON, 0.2 * Math.sqrt(size), light * 0.4, { from: [c.x, c.y, c.z], delay, kind: 1 });
            roam.push(gauss(r) * 5, gauss(r) * 5, gauss(r) * 5);
            along.push(r());
          }
        };
        // Our proton first (bound a little before the rest, as the camera arrives): larger, with its
        // flux tubes drawn densely, so its Y reads when the camera circles it.
        trio(OURS, 0.08, 1.6, 2.6, 150);
        // The soup: trios everywhere along the flight, denser around its path.
        for (let i = 0; i < 9000; i++) {
          const z = (r() * 2 - 1) * HALF - 18;
          const c = new THREE.Vector3((r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF * 0.7, z);
          if (c.distanceTo(OURS) < 9) continue;
          trio(c, 0.12 + r() * 0.5 + Math.min(c.distanceTo(OURS) / 200, 0.25), 0.9);
        }
        return { main: b.data(), roam: new Float32Array(roam), along: new Float32Array(along) };
      },
      assemble(data) {
        const uni = { uBind: { value: 0 }, uDrain: { value: 1 }, uWhite: { value: new THREE.Color(WHITE) } };
        const soup = materia(data.main as MateriaData, {
          sizeUnit: 1,
          pre: 'attribute vec3 aRoam;\nattribute float aDelay2;\nuniform float uBind, uDrain;\nuniform vec3 uWhite;',
          move: MOVE,
          uniforms: uni,
          extra: { aRoam: [data.roam as Float32Array, 3], aDelay2: [data.along as Float32Array, 1] },
        });
        soup.u.uNear.value = 1;
        soup.u.uMaxPx.value = 40;
        // The plasma is opaque: near is sharp, far dissolves into its glow (and the flight has depth).
        soup.u.uFog.value = 18;
        soup.u.uFogNear.value = 6;
        const object = new THREE.Group();
        object.add(soup.points);
        let bound = 0;
        return {
          object,
          clouds: [soup],
          update(f) {
            bound = f.tl.get('qrk.bind', f.p);
            uni.uBind.value = bound;
          },
          // Our proton exists once its quarks are caught.
          proton: () => (bound > 0.12 ? OURS : null),
        };
      },
    },
    choreo(tl, era) {
      // Reheating: out of the cold dark of inflation, a flash, and the universe is full of hot matter.
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'qrk.bind': 0, 'qrk.bound': 0 });
      tl.to(1.7, { era: era.index - 0.35, fondo: 1.5, horno: 0.55, lt: -20 });
      tl.to(1.5, { era: era.index, e: era.home - 0.1, lt: -11, fondo: 0.5, horno: 0, fov: 64, yaw: 0, pitch: 0, roll: 0, bloom: 0.5, umbral: 0.25 });
      tl.label('quarks');
      // First person through the soup, weaving.
      tl.to(2.6, { lt: -8.5, 'quarks.fz': -16, yaw: 0.18, pitch: -0.06, roll: 0.05 });
      tl.to(2.6, { lt: -6.2, 'quarks.fz': -32, 'quarks.fx': 0.3, yaw: -0.12, pitch: 0.05, roll: -0.04 });
      // The universe cools below two trillion degrees: the quarks are caught. The camera slows and
      // comes to our proton, circling it as it forms.
      tl.caption(6.4, 'Los quarks quedan presos', 'De a tres, sus colores se suman en blanco: nacen los protones y los neutrones. Uno de ellos es nuestro protón.');
      tl.to(2.0, { lt: -5.45, 'quarks.fx': OURS.x, 'quarks.fy': OURS.y, 'quarks.fz': OURS.z + 4, e: era.home - 0.5, yaw: 0, pitch: 0, roll: 0, 'qrk.bind': 0.1 });
      tl.to(2.6, { lt: -5.1, 'quarks.fz': OURS.z, e: era.home - 0.78, yaw: 0.9, pitch: 0.2, 'qrk.bind': 0.75, 'qrk.bound': 1 });
      tl.to(1.8, { lt: -4.8, e: era.home - 0.4, yaw: 1.5, pitch: 0.12, 'qrk.bind': 1 });
    },
  };
}
