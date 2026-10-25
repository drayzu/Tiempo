import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';

/**
 * La Vía Láctea se arma (≈ 1 to 9 billion years). 1 unit = 10²⁰ m (about 10 600 light-years).
 *
 * Our galaxy grows by swallowing smaller ones: dwarf galaxies fall in, spiralling, and their stars
 * join the disk, which spreads and winds into two arms: young blue stars on the arms, older yellow
 * ones everywhere, a warm bulge, pink clouds where stars are being born, and dark lanes of dust that
 * hide the light behind them. Our proton travels in the gas of the disk, where the Sun will be
 * (about 26 000 light-years from the centre). Around 9 billion years, dark energy takes over and the
 * expansion speeds up (the clocks show it). The camera circles from far above, then comes down over
 * the arm where the Sun will be born.
 */

const LT = (years: number) => Math.log10(years * YEAR);
const SUN = new THREE.Vector3(2.52, 0, 0);
const NS = 7;
const PITCH = 1 / Math.tan((13 * Math.PI) / 180);

/** Where a point of the disk is, for the arm it belongs to: a logarithmic spiral. */
function arm(s: number, k: number, r: () => number) {
  // Four arms (two major, two minor), winding about one and a half turns from the bar to the edge.
  const th = k * (Math.PI / 2) + Math.log(Math.max(s, 0.25) / 0.25) * (1 / PITCH) * 13 + gauss(r) * 0.2;
  return new THREE.Vector3(Math.cos(th) * s, gauss(r) * 0.05 * (1 + s * 0.15), Math.sin(th) * s);
}

const MOVE = /* glsl */ `
  // The disk turns (its pattern), by the choreography.
  float cr = cos(uRot);
  float sr = sin(uRot);
  if (aKind > 2.5) {
    // A satellite's star: with its dwarf galaxy while it falls in, then in its place in the disk.
    vec4 sat = uSat[int(aDelay + 0.5)];
    vec3 inDwarf = sat.xyz + aFrom * mix(1.0, 0.4, sat.w);
    p = mix(inDwarf, vec3(cr * position.x - sr * position.z, position.y, sr * position.x + cr * position.z), smoothstep(0.75, 1.0, sat.w));
  } else {
    p = vec3(cr * p.x - sr * p.z, p.y, sr * p.x + cr * p.z);
    // The disk fills in as the galaxy grows (inside out).
    if (aKind < 1.5) em *= smoothstep(aDelay, aDelay + 0.1, uDisk);
    if (aKind > 1.5) occ *= smoothstep(aDelay, aDelay + 0.1, uDisk);
  }
`;

export function viaLactea(): EraModule {
  return {
    spec: {
      id: 'via-lactea',
      acto: 'Nosotros',
      certeza: 'O',
      name: 'La Vía Láctea se arma',
      fact: 'Nuestra galaxia crece tragándose galaxias más pequeñas. Nuestro protón viaja en el gas del disco.',
      label: 'Vía Láctea',
      unitExp: 20,
      frame: 14,
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      fadeE: [-2.4, -1.4, 3, 4.2],
      tint: 0xffe2b0,
      notes: [
        { at: SUN.toArray(), text: 'aquí nacerá el Sol' },
        { at: [0, 0.3, 0], text: 'bulbo' },
      ],
      generate() {
        const r = rng(1011);
        const b = materiaBuilder(1012);
        // Disk stars (kind 0): exponential disk on two arms, plus an even older disk; delay by radius
        // (the disk grows from the inside out).
        for (let k = 0; k < 34000; k++) {
          const s = -0.85 * Math.log(1 - r() * 0.996) + 0.08;
          if (s > 5.2) continue;
          const onArm = r() < 0.6;
          const v = onArm ? arm(s, r() < 0.7 ? (k % 2) * 2 : 1 + (k % 2) * 2, r) : new THREE.Vector3(Math.cos(r() * 6.283) * s, gauss(r) * 0.06, Math.sin(r() * 6.283) * s);
          if (!onArm) v.set(Math.cos(k * 2.4) * s, gauss(r) * 0.07, Math.sin(k * 2.4) * s);
          const young = onArm && r() < 0.55;
          b.push(v.x, v.y, v.z, young ? 0xb8ccff : 0xffe6c8, young ? 0.03 : 0.024, young ? 0.5 : 0.26, { kind: 0, delay: Math.min(s / 5.2, 1) * 0.8, star: true });
        }
        // The unresolved glow of old stars: a smooth disk, a little brighter on the arms, against which
        // the dust lanes stand out dark.
        for (let k = 0; k < 52000; k++) {
          const s = -0.95 * Math.log(1 - r() * 0.995) + 0.05;
          if (s > 5.5) continue;
          const v = r() < 0.35 ? arm(s, (k % 4), r) : new THREE.Vector3(Math.cos(r() * 6.283) * s, gauss(r) * 0.05, Math.sin(r() * 6.283) * s);
          // (thinner towards the centre, where so many would pile into a glare)
          b.push(v.x, v.y, v.z, 0xffe2c0, 0.05, 0.075 * (0.3 + 0.7 * smoothstep(0.3, 1.8, s)), { kind: 0, delay: Math.min(s / 5.2, 1) * 0.8 });
        }
        // The bulge: warm, dense, a little barred.
        for (let k = 0; k < 6000; k++) {
          const v = new THREE.Vector3(gauss(r) * 0.4, gauss(r) * 0.16, gauss(r) * 0.22);
          b.push(v.x, v.y, v.z, 0xffcf90, 0.026, 0.12, { kind: 0, delay: 0, star: true });
        }
        // Stellar nurseries (kind 1): pink knots along the arms.
        for (let c = 0; c < 140; c++) {
          const s = 0.8 + r() * 4;
          const at = arm(s, (c % 2) * 2, r);
          for (let k = 0; k < 14; k++) b.push(at.x + gauss(r) * 0.06, at.y + gauss(r) * 0.03, at.z + gauss(r) * 0.06, 0xff6f8f, 0.05, 0.55, { kind: 1, delay: Math.min(s / 5.2, 1) * 0.8 });
        }
        // Dust lanes (kind 2): dark, they hide the light behind, along the inner edge of the arms.
        for (let k = 0; k < 9000; k++) {
          const s = 0.5 + Math.pow(r(), 0.8) * 4.2;
          const at = arm(s * 0.96, k % 4, r);
          b.push(at.x, at.y * 0.4, at.z, 0x3a2a20, 0.07, 0.05, { kind: 2, ink: 0.9, delay: Math.min(s / 5.2, 1) * 0.8 });
        }
        // Dwarf galaxies (kind 3): their stars, offsets from their centre (aFrom), and where each will
        // end in the disk (position).
        for (let i = 0; i < NS; i++) {
          for (let k = 0; k < 1700; k++) {
            const s = 0.6 + Math.pow(r(), 0.7) * 4.6;
            const v = r() < 0.6 ? arm(s, k % 2, r) : new THREE.Vector3(Math.cos(r() * 6.283) * s, gauss(r) * 0.06, Math.sin(r() * 6.283) * s);
            const off: [number, number, number] = [gauss(r) * 0.35, gauss(r) * 0.25, gauss(r) * 0.35];
            b.push(v.x, v.y, v.z, r() < 0.5 ? 0xbcd2ff : 0xffe2b0, 0.03, 0.3, { kind: 3, delay: i, from: off, star: true });
          }
        }
        // Globular clusters in the halo.
        for (let k = 0; k < 140; k++) {
          const [x, y, z] = b.onSphere();
          const R = 3 + r() * 8;
          b.push(x * R, y * R * 0.8, z * R, 0xffe6c8, 0.06, 0.8, { kind: 0, delay: 0, star: true });
        }
        return { main: b.data() };
      },
      assemble(data) {
        const sats = Array.from({ length: NS }, () => new THREE.Vector4());
        const uni = { uRot: { value: 0 }, uDisk: { value: 0 }, uSat: { value: sats } };
        const cloud = materia(data.main as MateriaData, { pre: `uniform float uRot, uDisk;\nuniform vec4 uSat[${NS}];`, move: MOVE, uniforms: uni });
        cloud.u.uNear.value = 1;
        cloud.u.uMaxPx.value = 30;
        const object = new THREE.Group();
        object.add(cloud.points);
        const r = rng(1013);
        // Each dwarf: where it starts, how it spirals in, when.
        const orbit = Array.from({ length: NS }, (_, i) => ({ R0: 9 + r() * 9, phi0: r() * 6.283, tilt: (r() - 0.5) * 1.2, delay: 0.04 + (i / NS) * 0.7 }));
        const ours = new THREE.Vector3();
        let rot = 0;
        return {
          object,
          clouds: [cloud],
          update(f) {
            const k = f.tl.get('vl.k', f.p);
            rot = f.tl.get('vl.rot', f.p);
            uni.uRot.value = rot;
            uni.uDisk.value = smoothstep(0, 0.85, k);
            orbit.forEach((o, i) => {
              const m = smoothstep(o.delay, o.delay + 0.28, k);
              const R = o.R0 * (1 - m);
              const phi = o.phi0 + m * 5.5;
              sats[i].set(Math.cos(phi) * R, Math.sin(o.tilt) * R * 0.5, Math.sin(phi) * R, m);
            });
            ours.set(Math.cos(rot) * SUN.x, 0, Math.sin(rot) * SUN.x);
          },
          proton: () => ours,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'vl.k': 0, 'vl.rot': -3.2 });
      // From the web's knot to our galaxy: dwarf galaxies falling into a young, irregular one.
      tl.to(3.0, { era: era.index, e: era.home + 0.45, lt: LT(1.2e9), fondo: 1, horno: 0, fov: 52, yaw: -0.5, pitch: 1.0, roll: 0, bloom: 0.38, umbral: 0.28 });
      tl.label('via-lactea');
      tl.to(3.6, { 'vl.k': 0.45, 'vl.rot': -2.1, lt: LT(3.5e9), e: era.home + 0.15, yaw: 0.1, pitch: 1.2 });
      tl.to(3.6, { 'vl.k': 0.85, 'vl.rot': -1.0, lt: LT(7.5e9), e: era.home - 0.05, yaw: 0.6, pitch: 1.1 });
      tl.caption(3.4, 'La expansión acelera', 'Hace unos cinco mil millones de años la energía oscura toma el mando: desde entonces el universo crece cada vez más rápido.');
      tl.to(3.4, { 'vl.k': 1, 'vl.rot': -0.3, lt: LT(8.9e9), e: era.home - 0.1, yaw: 1.0, pitch: 0.95 });
      // Down over the arm where the Sun will be born.
      tl.to(2.8, { 'vl.rot': 0, lt: LT(9.17e9), 'via-lactea.fx': SUN.x, e: era.home - 0.3, yaw: 1.3, pitch: 1.05 });
    },
  };
}
