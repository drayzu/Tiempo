import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { rotulo } from '../engine/placa';

/**
 * Una de cada mil millones (≈ 10⁻⁵ s to a few seconds). 1 unit = 10 fm.
 *
 * Just caught in threes, there are almost as many antiprotons as protons. Matter (warm white) and
 * antimatter (violet) meet in pairs and vanish in flashes of light: their energy goes into the
 * glow, which brightens. A few survive: one in a thousand million in reality (here one in thirty,
 * so they can be seen; the plate says so). Our proton is one of them. Around the first second the
 * same happens to electrons and positrons, and again a few survive: one per proton.
 */

const MATTER = 0xfff1dc;
const ANTI = 0xc9a0ff;
const ELECTRON = 0xbfe0ff;
const POSITRON = 0xffb0d8;
const HALF = 38;

/**
 * Pairs (kind 0 matter, 1 antimatter; kind 3 electron, 4 positron): each travels from its start
 * (`aFrom`) to the meeting point (`position`) as its wave (`uAnn`, `uAnnE`) passes its `aDelay`,
 * flashes, and is gone. Survivors (kind 2 nucleons, kind 5 electrons) stay, drifting.
 */
const MOVE = /* glsl */ `
  float wave = aKind < 1.5 ? uAnn : uAnnE;
  if (aKind < 1.5 || (aKind > 2.5 && aKind < 4.5)) {
    float meet = smoothstep(aDelay, aDelay + 0.07, wave);
    p = mix(aFrom, position, meet * meet);
    float t = wave - (aDelay + 0.07);
    float flash = t > 0.0 ? exp(-pow(t / 0.012, 2.0)) : 0.0;
    float gone = 1.0 - step(0.0, t) * smoothstep(0.0, 0.03, t);
    em = mix(em, vec3(0.85, 0.9, 1.0), step(0.0, t)) * (gone + flash * uFlashK);
    sz *= 1.0 + flash * 2.2;
    sz *= gone + flash;
  } else {
    p += vec3(sin(uTime * 0.7 + seed * 17.0), cos(uTime * 0.6 + seed * 23.0), sin(uTime * 0.5 + seed * 31.0)) * 0.5;
  }
  // Electrons and positrons come forward when their turn comes (before, they would only be haze).
  if (aKind > 2.5) em *= uEVis;
`;

export function aniquilacion(): EraModule {
  return {
    spec: {
      id: 'aniquilacion',
      acto: 'El primer segundo',
      certeza: 'O',
      name: 'Una de cada mil millones',
      fact: 'Materia y antimateria se destruyen en destellos. Sobra una partícula de cada mil millones: de ese sobrante estás hecho.',
      ficha: ['por cada 10⁹ antiprotones había 10⁹ + 1 protones', 'por qué sobró materia sigue sin explicarse', 'electrones y positrones: entre 1 y 10 segundos'],
      label: 'aniquilación',
      unitExp: -14,
      frame: 30,
      anchor: new THREE.Vector3(0.6, -0.4, -46),
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.5],
      fadeE: [-3, -1.6, 2.4, 3.6],
      tint: 0xfff0d0,
      generate() {
        const r = rng(611);
        const b = materiaBuilder(612);
        const pair = (kA: number, kB: number, hexA: number, hexB: number, size: number, light: number, delay: number) => {
          const m: [number, number, number] = [(r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF * 0.7, (r() * 2 - 1) * HALF];
          if (Math.hypot(...m) < 4) return;
          const d = 2.5 + r() * 4;
          const [x, y, z] = b.onSphere();
          b.push(m[0], m[1], m[2], hexA, size, light, { from: [m[0] + x * d, m[1] + y * d, m[2] + z * d], delay, kind: kA });
          b.push(m[0], m[1], m[2], hexB, size, light, { from: [m[0] - x * d, m[1] - y * d, m[2] - z * d], delay, kind: kB });
        };
        // Protons and antiprotons (and their neutron cousins), meeting over the wave.
        for (let k = 0; k < 11000; k++) pair(0, 1, MATTER, ANTI, 0.55, 0.6, r() * 0.86);
        // The survivors: about one in thirty here (one in a thousand million in reality).
        for (let k = 0; k < 500; k++) {
          const v = new THREE.Vector3((r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF * 0.7, (r() * 2 - 1) * HALF);
          if (v.length() < 3) continue;
          b.push(v.x, v.y, v.z, MATTER, 0.6, 0.85, { kind: 2 });
        }
        // Electrons and positrons, their own wave around the first second; one electron per proton survives.
        for (let k = 0; k < 9000; k++) pair(3, 4, ELECTRON, POSITRON, 0.22, 0.75, r() * 0.86);
        for (let k = 0; k < 500; k++) b.push((r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF * 0.7, (r() * 2 - 1) * HALF, ELECTRON, 0.24, 0.8, { kind: 5, drift: 0.3 + gauss(r) * 0.05 });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uAnn: { value: 0 }, uAnnE: { value: 0 }, uFlashK: { value: 5 }, uEVis: { value: 0 } };
        const cloud = materia(data.main as MateriaData, { pre: 'uniform float uAnn, uAnnE, uFlashK, uEVis;', move: MOVE, uniforms: uni });
        cloud.u.uNear.value = 1;
        cloud.u.uMaxPx.value = 60;
        // The plasma is opaque: what is near is sharp, what is far dissolves into its glow.
        cloud.u.uFog.value = 16;
        cloud.u.uFogNear.value = 6;
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = new THREE.Vector3();
        let shown = 0;
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uAnn.value = f.tl.get('ani.p', f.p);
            uni.uAnnE.value = f.tl.get('ani.e', f.p);
            uni.uEVis.value = f.tl.get('ani.ev', f.p);
            cloud.u.uMaxPx.value = 60 * f.dpr;
            shown = smoothstep(0.85, 0.98, uni.uAnn.value);
          },
          proton: () => ours,
          placa(g, f) {
            // Honest about the drawing: the real proportion is a thousand million to one.
            rotulo(g, f.u, f.W / 2, 26 * f.u + 22 * f.u, 'aquí sobrevive 1 de cada 30 · en realidad, 1 de cada 1 000 millones', 9.5, 0, shown * f.alpha * 0.8, false);
          },
        };
      },
    },
    choreo(tl, era) {
      // Pulling back from our new proton into the cascade of flashes; the glow brightens with them.
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'ani.p': 0, 'ani.e': 0, 'ani.ev': 0 });
      tl.to(2.4, { era: era.index, e: era.home - 0.55, lt: -4.6, fondo: 0.35, fov: 62, yaw: 0.3, pitch: 0.1, bloom: 0.45, umbral: 0.3 });
      tl.label('aniquilacion');
      tl.to(4.6, { 'ani.p': 1, lt: -3.6, e: era.home + 0.05, fondo: 0.6, yaw: 0.9, pitch: 0.18, roll: 0.04 });
      tl.to(1.2, { lt: -1.5, fondo: 0.35, yaw: 1.1, roll: 0, 'ani.ev': 1 });
      tl.caption(4.4, 'Los electrones también', 'Después les toca a los electrones. Sobra justo uno por cada protón.');
      tl.to(3.6, { 'ani.e': 1, lt: 0.6, fondo: 0.55, 'aniquilacion.fz': -14, yaw: 0.7, pitch: 0.05 });
      tl.to(0.8, { lt: 1.0, fondo: 0.35 });
    },
  };
}
