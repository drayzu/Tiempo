import * as THREE from 'three';
import { gauss, rng } from '../lib/math';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';

/**
 * Veinte minutos de cocina (≈ 3 to 20 minutes). 1 unit = 100 fm.
 *
 * Protons (warm white) and neutrons (blue-grey) roam. When the universe is cool enough for deuterium
 * to survive, they pair (a proton and a neutron: a small flash), then the pairs join into helium
 * nuclei (gold, another flash). There were about seven protons for each neutron, and almost every
 * neutron ends up in helium: by mass, a quarter helium and three quarters hydrogen, the mixture still
 * measured in the oldest stars. Our proton is left alone: it will be hydrogen.
 * The camera circles one helium nucleus as it forms, then draws back over the two-tone sea.
 */

const PROTON = 0xfff1dc;
const NEUTRON = 0x9fb0d0;
const HELIUM = 0xffcf6a;
const HALF = 34;
/** The helium nucleus the camera watches form, and our proton beside it. */
const WATCH = new THREE.Vector3(2.2, 0.6, -6);
const OURS = new THREE.Vector3(0, 0, 0);

/**
 * Quartet members (kind 0 proton, 1 neutron): from a free place (`aFrom`) to their pair's centre
 * (`aPair`) as deuterium forms (`uD`), then to the nucleus (`position`) as helium forms (`uHe`), each
 * with a flash. Free protons (kind 2) wander and stay.
 */
const MOVE = /* glsl */ `
  vec3 wob = vec3(sin(uTime * 2.1 + seed * 17.0), cos(uTime * 1.7 + seed * 23.0), sin(uTime * 1.9 + seed * 31.0));
  if (aKind < 1.5) {
    float kd = smoothstep(aDelay, aDelay + 0.08, uD);
    float kh = smoothstep(aDelay, aDelay + 0.08, uHe);
    vec3 free = aFrom + wob * 0.6;
    p = mix(mix(free, aPair + wob * 0.05, kd), position + wob * 0.02, kh);
    float fd = exp(-pow((uD - aDelay - 0.09) / 0.03, 2.0));
    float fh = exp(-pow((uHe - aDelay - 0.09) / 0.03, 2.0));
    em = mix(em, uHelium, kh) * (1.0 + 5.0 * fd + 9.0 * fh);
    sz *= 1.0 + 0.35 * kh + 2.0 * fh;
  } else {
    p += wob * 0.6;
  }
`;

export function nucleos(): EraModule {
  return {
    spec: {
      id: 'nucleos',
      acto: 'La niebla',
      certeza: 'O',
      name: 'Veinte minutos de cocina',
      fact: 'Protones y neutrones se pegan en núcleos de helio. El tuyo queda solo: será hidrógeno.',
      ficha: ['entre 3 y 20 minutos, a ~10⁹ K', '≈ 75 % hidrógeno y ≈ 25 % helio, en masa', 'más trazas de deuterio y de litio'],
      label: 'núcleos',
      unitExp: -13,
      frame: 30,
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      fadeE: [-3, -1.8, 2.2, 3.4],
      tint: 0xffcf6a,
      notes: [
        { at: WATCH.toArray(), text: 'helio: 2 protones + 2 neutrones', when: 'nuc.he' },
        { at: [OURS.x + 0.5, OURS.y + 0.5, OURS.z], text: 'hidrógeno: un protón solo', when: 'nuc.he' },
      ],
      generate() {
        const r = rng(711);
        const b = materiaBuilder(712);
        const pair: number[] = [];
        const nucleus = (c: THREE.Vector3, delay: number, size: number) => {
          // Two deuterons, each a proton and a neutron, meeting at the nucleus.
          for (let d = 0; d < 2; d++) {
            const pc = c.clone().add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(1.6));
            for (let j = 0; j < 2; j++) {
              const off = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(0.09);
              const at = c.clone().add(off);
              const from = pc.clone().add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(1.4));
              b.push(at.x, at.y, at.z, j === 0 ? PROTON : NEUTRON, size, 0.85, { from: from.toArray() as [number, number, number], delay, kind: j });
              pair.push(pc.x, pc.y, pc.z);
            }
          }
        };
        nucleus(WATCH, 0.05, 1.25);
        for (let k = 0; k < 1700; k++) {
          const c = new THREE.Vector3((r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF * 0.7, (r() * 2 - 1) * HALF);
          if (c.distanceTo(WATCH) < 9 || c.length() < 3) continue;
          nucleus(c, 0.08 + r() * 0.75, 0.45);
        }
        // Free protons: about twelve for each helium nucleus.
        for (let k = 0; k < 14000; k++) {
          const v = new THREE.Vector3((r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF * 0.7, (r() * 2 - 1) * HALF);
          if (v.length() < 2.5 || v.distanceTo(WATCH) < 8) continue;
          b.push(v.x, v.y, v.z, PROTON, 0.4, 0.55, { kind: 2 });
          pair.push(0, 0, 0);
        }
        return { main: b.data(), pair: new Float32Array(pair) };
      },
      assemble(data) {
        const uni = { uD: { value: 0 }, uHe: { value: 0 }, uHelium: { value: new THREE.Color(HELIUM).multiplyScalar(1.1) } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'attribute vec3 aPair;\nuniform float uD, uHe;\nuniform vec3 uHelium;',
          move: MOVE,
          uniforms: uni,
          extra: { aPair: [data.pair as Float32Array, 3] },
        });
        cloud.u.uNear.value = 1;
        cloud.u.uMaxPx.value = 48;
        // Still an opaque plasma: near is sharp, far dissolves into the glow.
        cloud.u.uFog.value = 14;
        cloud.u.uFogNear.value = 5;
        const object = new THREE.Group();
        object.add(cloud.points);
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uD.value = f.tl.get('nuc.d', f.p);
            uni.uHe.value = f.tl.get('nuc.he', f.p);
          },
          proton: () => OURS,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'nuc.d': 0, 'nuc.he': 0 });
      tl.to(2.8, { era: era.index, e: era.home - 0.2, lt: 1.4, fondo: 0.35, fov: 60, yaw: -0.2, pitch: 0.1, roll: 0, bloom: 0.45, umbral: 0.3 });
      tl.label('nucleos');
      // The cooking: the camera comes to one nucleus and circles it as it forms.
      tl.to(2.0, { lt: 2.2, 'nucleos.fx': WATCH.x, 'nucleos.fy': WATCH.y, 'nucleos.fz': WATCH.z, e: era.home - 1.05, yaw: 0.2, pitch: 0.05 });
      tl.to(2.4, { lt: 2.5, 'nuc.d': 1, yaw: 0.9, pitch: 0.2, roll: 0.05 });
      tl.to(2.4, { lt: 2.85, 'nuc.he': 1, yaw: 1.6, pitch: 0.1, roll: 0 });
      // Then back over the sea: a quarter helium, three quarters hydrogen.
      tl.caption(3.6, 'Un cuarto de helio', 'Sale un cuarto de helio y casi todo lo demás es hidrógeno. La misma mezcla de las estrellas más viejas.');
      tl.to(3.6, { lt: 3.1, 'nucleos.fx': 0, 'nucleos.fy': 0, 'nucleos.fz': 0, e: era.home + 0.3, yaw: 2.0, pitch: 0.25 });
    },
  };
}
