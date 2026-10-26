import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { vista, viajeA } from '../lib/vista';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { crearAgujero } from '../engine/agujero';
import { nota } from '../engine/placa';
import { CUASAR_EN_RED } from './galaxias';

/**
 * Un cuásar (≈ 1 billion years). 1 unit = 10¹⁶ m (about a light-year).
 *
 * In a knot of the web next to ours, a young galaxy holds a black hole of a billion suns, and gas
 * falls into it: before it falls, the gas heats in a disk that outshines the whole galaxy. From afar,
 * the quasar is a blinding point with two thin jets longer than its galaxy. The camera dives ten
 * orders of magnitude, through the clumpy young galaxy and the whirl of gas that feeds the hole, to
 * the edge of the disk: the hole is ray traced (`agujero.ts`), its shadow ringed by light, the far
 * side of the disk bent up over it and under it, the side that comes towards us brighter and bluer.
 * Then it rides a jet out, ten orders of magnitude back, and turns home. (Quasars this bright are
 * seen less than 800 million years after the beginning; the image of a shadow: the Event Horizon
 * Telescope, M87* in 2019 and Sagittarius A* in 2022.)
 *
 * The inflow and the jets are scale-free: their points are spread evenly in the logarithm of the
 * distance and stream in (or out) by decades, so at every zoom there is gas falling or jets flowing.
 */

const LT = (years: number) => Math.log10(years * YEAR);
const U = 16;
/** The hole's horizon (10⁹ suns: 2,95 × 10¹² m), in units. */
const RS = 2.95e12 / 10 ** U;
const LOG_RS = Math.log10(RS);
const LOG_OUT = 3.4;
const LOG_JET = 5.3;
/** The disk's (and the jets') axis, and the plane's basis. */
const NRM = new THREE.Vector3(0.22, 1, 0.12).normalize();
const E1 = new THREE.Vector3(1, 0, 0).addScaledVector(NRM, -NRM.x).normalize();
const E2 = new THREE.Vector3().crossVectors(NRM, E1).normalize();
/** The host galaxy's own plane. */
const GN = new THREE.Vector3(-0.45, 1, 0.35).normalize();
const G1 = new THREE.Vector3(0, 0, 1).addScaledVector(GN, -GN.z).normalize();
const G2 = new THREE.Vector3().crossVectors(GN, G1).normalize();
/** Our own knot (where the Milky Way will be), in this era's units: home. */
export const CASA_DESDE_CUASAR = CUASAR_EN_RED.clone().multiplyScalar(-(10 ** (21.5 - U)));

const MOVE = /* glsl */ `
  if (aKind < 0.5) {
    em *= uGal;
  } else if (aKind < 1.5) {
    // Gas falling in, by decades: from the galaxy down to the disk, winding as it goes.
    float u = fract(position.x + uFlow);
    float lr = mix(${LOG_OUT.toFixed(2)}, ${(LOG_RS + 0.9).toFixed(3)}, u);
    float r = pow(10.0, lr);
    float ang = position.y - lr * 2.4 + uTime * 0.22;
    p = (cos(ang) * uE1 + sin(ang) * uE2) * r + uN * position.z * r * 0.07;
    float hot = smoothstep(-0.5, ${(LOG_RS + 1.4).toFixed(3)}, lr);
    em = mix(vec3(0.75, 0.32, 0.14), vec3(1.0, 0.8, 0.6), hot) * length(em) * (0.6 + 1.2 * hot) * 0.14;
    sz = r * 0.014 * (0.4 + seed);
    em *= smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.85, 1.0, u)) * uInflow;
  } else if (aKind < 2.5) {
    // The jets: streaming out of the poles by decades, narrow, with bright knots.
    float u = fract(position.x + uFlow * 1.7);
    float ls = mix(${(LOG_RS + 0.6).toFixed(3)}, ${LOG_JET.toFixed(2)}, u);
    float s = pow(10.0, ls);
    vec3 perp = cos(position.z) * uE1 + sin(position.z) * uE2;
    p = uN * position.y * s + perp * s * (0.012 + 0.03 * seed) * sqrt(fract(seed * 7.3));
    float knot = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(ls * 7.0 - uTime * 0.8), 3.0);
    em *= uJet * knot * smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.8, 1.0, u)) * 0.22;
    sz = s * 0.006 * (0.5 + seed);
  } else {
    // The quasar from afar: one blinding point.
    em *= uCore;
  }
`;

export function cuasar(): EraModule {
  return {
    spec: {
      id: 'cuasar',
      acto: 'Oscuridad y amanecer',
      certeza: 'O',
      name: 'Un cuásar',
      fact: 'Un agujero negro de mil millones de soles se traga gas. Antes de caer, el gas brilla más que su galaxia entera.',
      ficha: ['cuásares a menos de 800 millones de años del inicio (z ≈ 7,5)', 'agujeros negros de ~10⁹ masas solares', 'sombras fotografiadas: M87* (2019) y Sagitario A* (2022), Event Horizon Telescope'],
      label: 'cuásar',
      unitExp: U,
      frame: 1e6,
      anchor: CUASAR_EN_RED.clone(),
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      fadeE: [-10, -9, 2, 3.2],
      tint: 0xbfd2ff,
      notes: [
        { at: E1.clone().multiplyScalar(RS * 9).toArray(), text: 'disco de acreción', when: 'cua.cerca' },
        { at: NRM.clone().multiplyScalar(RS * 40).toArray(), text: 'chorro, casi a la velocidad de la luz', when: 'cua.cerca' },
      ],
      generate() {
        const r = rng(2111);
        const b = materiaBuilder(2112);
        // The host galaxy (kind 0): young, clumpy, dusty; ~30 000 light-years across.
        const RG = 15000;
        const onG = (a: number, s: number, h: number) => G1.clone().multiplyScalar(Math.cos(a) * s).addScaledVector(G2, Math.sin(a) * s).addScaledVector(GN, h);
        for (let k = 0; k < 34000; k++) {
          const s = -RG * 0.35 * Math.log(1 - r() * 0.99);
          const a = r() * Math.PI * 2 + Math.log(1 + s / 2000) * 1.6;
          const v = onG(a, s, gauss(r) * 600);
          b.push(v.x, v.y, v.z, r() < 0.4 ? 0xbcd2ff : 0xffe2c0, 110, 0.05, { kind: 0 });
        }
        for (let c = 0; c < 26; c++) {
          const at = onG(r() * Math.PI * 2, RG * (0.15 + 0.7 * r()), gauss(r) * 300);
          const n = 120 + Math.floor(r() * 300);
          for (let k = 0; k < n; k++) b.push(at.x + gauss(r) * 700, at.y + gauss(r) * 400, at.z + gauss(r) * 700, r() < 0.5 ? 0xff7a9a : 0xcfe0ff, 140, 0.16, { kind: 0 });
        }
        for (let k = 0; k < 9000; k++) {
          const s = RG * (0.1 + 0.8 * Math.pow(r(), 0.8));
          const v = onG(r() * Math.PI * 2, s, gauss(r) * 250);
          b.push(v.x, v.y, v.z, 0x2a1e18, 400, 0.04, { kind: 0, ink: 0.85 });
        }
        // The inflow (kind 1): phase, angle, height in `position`.
        for (let k = 0; k < 30000; k++) b.push(r(), (k % 2) * Math.PI + gauss(r) * (r() < 0.7 ? 0.35 : 1.6), gauss(r), r() < 0.3 ? 0xffd0a0 : 0xffa070, 1, 0.5 + r() * 0.5, { kind: 1 });
        // The jets (kind 2): phase, side, angle about the axis.
        for (let k = 0; k < 24000; k++) b.push(r(), k % 2 ? 1 : -1, r() * Math.PI * 2, r() < 0.7 ? 0xbcd6ff : 0xe8f0ff, 1, 0.7 + r() * 0.6, { kind: 2 });
        // The quasar's point (kind 3).
        for (let k = 0; k < 30; k++) b.push(gauss(r) * RS, gauss(r) * RS, gauss(r) * RS, 0xe8f0ff, RS * 4, 14, { kind: 3, star: true });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = {
          uFlow: { value: 0 },
          uGal: { value: 1 },
          uInflow: { value: 1 },
          uJet: { value: 1 },
          uCore: { value: 1 },
          uN: { value: NRM.clone() },
          uE1: { value: E1.clone() },
          uE2: { value: E2.clone() },
        };
        const cloud = materia(data.main as MateriaData, { pre: 'uniform float uFlow, uGal, uInflow, uJet, uCore;\nuniform vec3 uN, uE1, uE2;', move: MOVE, uniforms: uni });
        cloud.u.uNear.value = 1;
        cloud.u.uInk.value = 0.6;
        const hole = crearAgujero();
        hole.u.uDiskIn.value = 3;
        hole.u.uDiskOut.value = 22;
        hole.u.uDiskT.value = 18000;
        hole.u.uBand.value = 1;
        hole.u.uStars.value = 0.9;
        hole.u.uSkyTint.value.setRGB(0.95, 0.9, 0.85);
        const object = new THREE.Group();
        object.add(hole.mesh, cloud.points);
        const center = new THREE.Vector3();
        const nW = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sky = new THREE.Matrix3();
        const toGal = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeBasis(G1, GN, G2).transpose());
        const rot = new THREE.Matrix3();
        const tmp = new THREE.Vector3();
        let cerca = 0;
        return {
          object,
          clouds: [cloud],
          update(f) {
            const e = f.e;
            uni.uFlow.value = f.tl.get('cua.flow', f.p) + f.time * 0.02;
            // From afar a point; up close, what it is made of.
            uni.uCore.value = smoothstep(16.6, 18.2, e) * (0.35 + 0.65 * smoothstep(19, 21, e));
            uni.uGal.value = smoothstep(16.5, 18, e);
            uni.uInflow.value = 0.8;
            uni.uJet.value = 1 + 2.5 * smoothstep(19.5, 21.5, e);
            cloud.u.uMaxPx.value = 30 * f.dpr;
            object.updateMatrixWorld();
            center.setFromMatrixPosition(object.matrixWorld);
            const scale = tmp.setFromMatrixColumn(object.matrixWorld, 0).length();
            object.getWorldQuaternion(q);
            nW.copy(NRM).applyQuaternion(q);
            rot.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert()));
            sky.multiplyMatrices(toGal, rot);
            hole.update({ camera: f.camera, center, normal: nW, rs: RS * scale, sky, time: f.time, alpha: f.alpha });
            // The disk lights up as it resolves; from afar the point stands for it.
            hole.u.uDiskL.value = 1.1 * smoothstep(17, 15.6, e);
            hole.u.uStars.value = 0.9 * smoothstep(17.5, 15.5, e);
            hole.u.uBand.value = smoothstep(17.5, 15.5, e);
            cerca = smoothstep(15, 14.3, e);
          },
          proton: () => CASA_DESDE_CUASAR,
          // Through the young galaxy the view is full of light: a shade behind the words.
          velo: (f) => smoothstep(20.8, 19.9, f.e) * smoothstep(17.0, 18.0, f.e) * 0.8,
          placa(g, f, on, toScreen) {
            if (!on || cerca < 0.5 || f.alpha < 0.5) return;
            const { u } = f;
            const c = toScreen(tmp.set(0, 0, 0));
            if (c.z < 1) nota(g, u, c.x, c.y, 'horizonte: 2,95 × 10¹² m (20 UA)', -70, 52, 0, f.alpha * cerca);
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'cua.flow': 0, 'cua.cerca': 0 });
      // From our knot to the next: a blinding point with two jets longer than its galaxy.
      const side = new THREE.Vector3().crossVectors(NRM, new THREE.Vector3(0.3, 0.2, 1)).normalize();
      const v0 = vista(side.clone().addScaledVector(NRM, 0.25), NRM, { yaw: 0.8, roll: 0 });
      tl.to(3.4, { era: era.index, e: 21.7, lt: LT(1.04e9), fondo: 1, horno: 0, fov: 52, ...v0, bloom: 0.5, umbral: 0.2 });
      tl.label('cuasar');
      tl.caption(4.4, 'Un cuásar', 'En una galaxia vecina, un agujero negro de mil millones de soles se traga gas. Antes de caer, el gas brilla más que la galaxia entera.');
      // Down ten orders of magnitude: the galaxy, the whirl of gas, the disk.
      const v1 = vista(side.clone().addScaledVector(NRM, 0.5).applyAxisAngle(NRM, 0.6), NRM, v0);
      tl.to(2.6, { e: 19.9, lt: LT(1.045e9), 'cua.flow': 0.4, ...v1 });
      tl.to(2.6, { e: 17.4, 'cua.flow': 0.8, ...vista(side.clone().addScaledVector(NRM, 0.3).applyAxisAngle(NRM, 1.4), NRM, v1), fov: 56 });
      const v3 = vista(side.clone().addScaledVector(NRM, 0.2).applyAxisAngle(NRM, 2.2), NRM, v1);
      tl.to(2.4, { e: 15.0, 'cua.flow': 1.2, ...v3 });
      // The edge: light bends over and under the shadow; the camera circles, close.
      tl.caption(5.2, 'El borde', 'Cerca del agujero la luz se curva: la cara de atrás del disco asoma por arriba y por abajo. Al centro, una sombra de la que nada sale.');
      const v4 = vista(side.clone().addScaledVector(NRM, 0.14).applyAxisAngle(NRM, 2.9), NRM, v3);
      tl.to(2.4, { e: 14.05, 'cua.flow': 1.5, 'cua.cerca': 1, ...v4, fov: 50, bloom: 0.42, umbral: 0.3 });
      const v5 = vista(side.clone().addScaledVector(NRM, 0.45).applyAxisAngle(NRM, 4.2), NRM, v4);
      tl.to(2.8, { e: 13.95, lt: LT(1.0451e9), 'cua.flow': 1.8, ...v5 });
      // Out along a jet, ten orders of magnitude, nearly at the speed of light.
      tl.caption(4.6, 'Chorros', 'Parte del gas no cae: sale disparado por los polos, casi a la velocidad de la luz, más lejos que toda la galaxia.');
      const up = vista(NRM.clone().multiplyScalar(-1).addScaledVector(side, 0.35), side, v5);
      tl.to(1.6, { e: 14.6, ...up, 'cua.cerca': 0, ...viajeA('cuasar', NRM.clone().multiplyScalar(10 ** (14.6 - U) * 1.2)) });
      // (the focus rides the jet a little ahead of the camera, at the scale of the view: keys every
      // ¾ of a decade, so the exponential flight is followed closely)
      for (let k = 1; k <= 8; k++) {
        const ek = 14.6 + k * 0.78;
        tl.to(0.42, { e: ek, lt: LT(1.045e9 + k * 0.0015e9), 'cua.flow': 1.8 + k * 0.08, roll: up.roll + 0.07 * k, ...viajeA('cuasar', NRM.clone().multiplyScalar(Math.min(10 ** (ek - U) * 1.2, 1.5e5))) });
      }
    },
  };
}
