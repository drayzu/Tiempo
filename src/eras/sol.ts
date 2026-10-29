import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { bbColor } from '../lib/cuerpo-negro';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';

/**
 * Nace el Sol (≈ 4 600 million years ago). 1 unit = 10¹³ m (about 67 AU).
 *
 * The camera goes into a molecular cloud in the arm (pink where young stars light it, dark where its
 * dust hides them). A supernova's shell sweeps through it: the cloud now carries carbon, oxygen and
 * iron made in earlier stars (its hydrogen, like our proton, comes from the beginning). A core of the
 * cloud collapses, spinning faster, into a disk around a protostar that throws jets out of its poles;
 * the disk's dust gathers into rings with gaps (as ALMA sees around young stars today); at the centre
 * the Sun lights. Our proton falls in with the gas, to where the Earth will form, and the camera
 * follows it down.
 */

const LT = (years: number) => Math.log10(years * YEAR);
const AU = 1.496e11 / 1e13;
/** The Earth's place in the disk (the next era sits there). */
export const TIERRA_EN_SOL = new THREE.Vector3(AU, 0, 0);
const SN_FROM = new THREE.Vector3(-5200, 900, -1500);
const PROTON_IN_CLOUD = new THREE.Vector3(260, 60, -180);

const MOVE = /* glsl */ `
  if (aKind < 0.5) {
    // The cloud: seen while large; the dust (ink) hides what is behind it.
    em *= uCloud;
    occ *= uCloud;
  } else if (aKind < 1.5) {
    // The supernova's shell, sweeping through.
    vec3 dir = normalize(position);
    p = uSnFrom + dir * uSnR * (0.9 + 0.2 * seed);
    em *= step(0.001, uSnR) * (1.0 - smoothstep(0.75, 1.0, uSnK)) * uCloud;
  } else if (aKind < 2.5) {
    // The collapsing core: from the cloud (aFrom) into the disk (position), turning faster as it falls.
    float k = smoothstep(aDelay * 0.5, 0.5 + aDelay * 0.5, uCol);
    float ang = (1.0 - k) * 5.0 + uTime * 0.25 / max(length(position.xz), 0.2) * k;
    float ca = cos(ang);
    float sa = sin(ang);
    vec3 disk = vec3(ca * position.x - sa * position.z, position.y, sa * position.x + ca * position.z);
    p = mix(aFrom, disk, k);
    // Rings and gaps open in the dust as the planets gather it.
    float rr = length(disk.xz);
    float ring = 0.35 + 0.65 * pow(abs(sin(rr * 9.0 + 0.6)), 3.0);
    em *= mix(1.0, ring, uRings) * (0.25 + 0.75 * k);
  } else if (aKind < 3.5) {
    // Jets from the protostar's poles, streaming out while it grows.
    float t = fract(uTime * 0.18 + seed);
    float side = aDelay < 0.5 ? 1.0 : -1.0;
    p = vec3(position.x * t, side * t * 2.6, position.z * t);
    em *= uJet * (1.0 - t);
  } else {
    // The star at the centre: a protostar's red glow, then the Sun.
    em = uStarCol * (0.35 + 1.1 * uOn) * uStarK;
    sz *= 0.6 + 0.8 * uOn;
  }
`;

export function sol(): EraModule {
  return {
    spec: {
      id: 'sol',
      acto: 'Nosotros',
      certeza: 'O',
      name: 'Nace el Sol',
      fact: 'Una nube de gas y polvo se derrumba en un disco. En el centro se enciende tu estrella.',
      ficha: ['hace 4 567 millones de años (los meteoritos más antiguos)', 'el disco que formó los planetas: ~100 UA', 'la Tierra tardó decenas de millones de años en formarse'],
      label: 'el Sol',
      unitExp: 13,
      frame: 30,
      anchor: new THREE.Vector3(2.52, 0, 0),
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      fadeE: [-2.4, -1.6, 6, 7],
      tint: 0xffd890,
      notes: [{ at: TIERRA_EN_SOL.toArray(), text: 'aquí se forma la Tierra', when: 'sol.on' }],
      generate() {
        const r = rng(1111);
        const b = materiaBuilder(1112);
        // The cloud (kind 0): lumpy, pink where lit, with dark dust.
        let made = 0;
        while (made < 36000) {
          const v = new THREE.Vector3(gauss(r) * 1500, gauss(r) * 900, gauss(r) * 1500);
          const lump = Math.sin(v.x * 0.0021 + Math.sin(v.z * 0.0013) * 2) * Math.cos(v.y * 0.0027 - Math.sin(v.x * 0.001)) + 0.5 * Math.sin(v.z * 0.004 + v.y * 0.002);
          if (r() > 0.25 + 0.75 * Math.max(lump, 0)) continue;
          made++;
          const dust = r() < 0.35;
          b.push(v.x, v.y, v.z, dust ? 0x3a2a26 : r() < 0.7 ? 0xff7a9a : 0xffb0a0, dust ? 140 : 90, dust ? 0.05 : 0.07, { kind: 0, ink: dust ? 0.85 : 0 });
        }
        // Young stars lighting the cloud.
        for (let k = 0; k < 240; k++) b.push(gauss(r) * 1600, gauss(r) * 900, gauss(r) * 1600, r() < 0.7 ? 0xcfe0ff : 0xffe6c8, 20, 2.2, { kind: 0, star: true });
        // The supernova's shell (kind 1): carbon, oxygen, iron.
        for (let k = 0; k < 5000; k++) {
          const [x, y, z] = b.onSphere();
          const q = r();
          b.push(x, y, z, q < 0.4 ? 0xd9ccff : q < 0.8 ? 0xff4a4a : 0xffa040, 60, 0.6, { kind: 1 });
        }
        // The core (kind 2): from the cloud into the disk; delay by radius (the inside falls first).
        for (let k = 0; k < 42000; k++) {
          const s = 0.05 + Math.pow(r(), 1.6) * 2.4;
          const th = r() * Math.PI * 2;
          const pos: [number, number, number] = [Math.cos(th) * s, gauss(r) * 0.02 * s, Math.sin(th) * s];
          const from: [number, number, number] = [gauss(r) * 350, gauss(r) * 250, gauss(r) * 350];
          b.push(pos[0], pos[1], pos[2], s < 0.35 ? 0xffd0a0 : 0xffb070, 0.014, s < 0.35 ? 0.22 : 0.3, { kind: 2, from, delay: Math.min(s / 2.4, 1) });
        }
        // Jets (kind 3).
        for (let k = 0; k < 2600; k++) b.push(gauss(r) * 0.05, 0, gauss(r) * 0.05, 0xbcd8ff, 0.03, 0.8, { kind: 3, delay: k % 2 });
        // The star (kind 4).
        for (let k = 0; k < 24; k++) b.push(gauss(r) * 0.002, gauss(r) * 0.002, gauss(r) * 0.002, 0xffffff, 0.03, 1, { kind: 4, star: true });
        return { main: b.data() };
      },
      assemble(data) {
        const sc = new THREE.Color();
        const uni = {
          uCloud: { value: 1 },
          uSnFrom: { value: SN_FROM.clone() },
          uSnR: { value: 0 },
          uSnK: { value: 0 },
          uCol: { value: 0 },
          uRings: { value: 0 },
          uJet: { value: 0 },
          uOn: { value: 0 },
          uStarK: { value: 0 },
          uStarCol: { value: sc },
        };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uCloud, uSnR, uSnK, uCol, uRings, uJet, uOn, uStarK;\nuniform vec3 uSnFrom, uStarCol;',
          move: MOVE,
          uniforms: uni,
        });
        cloud.u.uNear.value = 1;
        cloud.u.uMaxPx.value = 48;
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = new THREE.Vector3();
        const bb = { r: 0, g: 0, b: 0 };
        return {
          object,
          clouds: [cloud],
          update(f) {
            const g = (k: string) => f.tl.get(`sol.${k}`, f.p);
            const col = g('col');
            const on = g('on');
            const sn = g('sn');
            // The cloud is seen while the view is large; inside the disk's scale it has gone.
            uni.uCloud.value = smoothstep(14.4, 15.6, f.e);
            uni.uSnK.value = sn;
            uni.uSnR.value = sn * 7000;
            uni.uCol.value = col;
            uni.uRings.value = g('rings');
            uni.uJet.value = g('jet');
            uni.uOn.value = on;
            uni.uStarK.value = smoothstep(0.4, 0.9, col);
            // The protostar glows red (≈ 3 000 K), the Sun white-yellow (5 772 K).
            bbColor(3000 + 2772 * on, bb);
            sc.setRGB(bb.r, bb.g, bb.b);
            // Our proton: with the gas of the cloud, then into the disk, to where the Earth forms.
            ours.copy(PROTON_IN_CLOUD).lerp(TIERRA_EN_SOL, smoothstep(0.1, 0.95, col));
          },
          proton: () => ours,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'sol.sn': 0, 'sol.col': 0, 'sol.rings': 0, 'sol.jet': 0, 'sol.on': 0 });
      // Into the cloud in the arm.
      tl.to(3.0, { era: era.index, e: 17.2, lt: LT(9.17e9), fondo: 1, horno: 0, fov: 60, yaw: 0.2, pitch: 0.3, roll: 0, bloom: 0.45, umbral: 0.25 });
      tl.label('sol');
      tl.caption(3.6, 'Restos de estrellas muertas', 'Una estrella que estalla cerca siembra la nube. Todo lo pesado de tu cuerpo se hizo en estrellas así. Tu protón no: viene del principio.');
      tl.to(3.6, { 'sol.sn': 1, lt: LT(9.183e9), e: 16.6, yaw: 0.5, pitch: 0.2 });
      // The core collapses: the camera falls in with it.
      tl.to(3.4, { 'sol.col': 0.55, 'sol.jet': 1, lt: LT(9.186e9), e: 14.2, yaw: 0.35, pitch: 0.55, roll: 0.06 });
      tl.caption(4.2, 'Se enciende el Sol', 'El Sol empieza a brillar. En el polvo que gira alrededor nacen los planetas.');
      // Seen face on (the rings as ALMA sees them), the view turning about its axis.
      tl.to(2.6, { 'sol.col': 1, 'sol.on': 1, 'sol.jet': 0, 'sol.rings': 1, lt: LT(9.19e9), e: 13.6, yaw: 0.1, pitch: 1.3, roll: 0.4, umbral: 0.4 });
      tl.to(1.8, { lt: LT(9.2e9), e: 13.45, yaw: 0.05, pitch: 1.35, roll: 0.9 });
      // Down to where the Earth forms, with our proton.
      tl.to(2.4, { lt: LT(9.24e9), 'sol.fx': TIERRA_EN_SOL.x, e: 12.85, yaw: 0, pitch: 1.2, roll: 1.2, umbral: 0.3 });
    },
  };
}
