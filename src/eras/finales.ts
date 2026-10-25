import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { rotulo } from '../engine/placa';

/**
 * The other endings, chosen at the fork («De aquí en adelante, la física no está segura»). The
 * default (the cold, the most likely) is in `final.ts`. These depend on what dark energy does, or on
 * whether our vacuum is stable; each is drawn honestly as a possibility.
 *
 * - El Gran Desgarro: if dark energy keeps growing, expansion tears everything apart, from the
 *   largest to the smallest: Potencias in reverse (Caldwell, Kamionkowski and Weinberg, 2003: with
 *   w = −1.5, galaxies go some 60 million years before the end, the Solar System three months
 *   before, the Earth half an hour, atoms 10⁻¹⁹ s).
 * - El Gran Colapso: if dark energy weakens (DESI's results of 2024–2025 hint it might), expansion
 *   could stop and reverse: everything falls back, heats up, and returns to the fog of the beginning.
 * - El vacío que decae: if our vacuum is not the most stable one, a bubble of true vacuum could be
 *   born anywhere and grow at almost the speed of light. Nobody would see it coming.
 */

const ripMove = (spread: string) => /* glsl */ `
  float tear = uK * uK * uK;
  ${spread}
`;

/** Galaxies all around, out to some 14 units: small tilted disks with a brighter core (kind 0). */
function campoDeGalaxias(b: ReturnType<typeof materiaBuilder>, r: () => number, n: number) {
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let g = 0; g < n; g++) {
    const [x, y, z] = b.onSphere();
    const d = 0.5 + Math.pow(r(), 0.45) * 14;
    const [ax, ay, az] = b.onSphere();
    u.set(ax, ay, az);
    v.set(-ay, ax, 0.3).cross(u).normalize();
    const w = u.clone().cross(v);
    const R = 0.05 + r() * 0.08;
    const hex = r() < 0.5 ? 0xbcd2ff : 0xffe2b0;
    const delay = r();
    for (let k = 0; k < 16; k++) {
      const s = k < 3 ? gauss(r) * 0.15 * R : Math.abs(gauss(r)) * R;
      const th = r() * 6.283;
      const px = x * d + (v.x * Math.cos(th) + w.x * Math.sin(th)) * s;
      const py = y * d + (v.y * Math.cos(th) + w.y * Math.sin(th)) * s;
      const pz = z * d + (v.z * Math.cos(th) + w.z * Math.sin(th)) * s;
      b.push(px, py, pz, k < 3 ? 0xfff0d8 : hex, k < 3 ? 0.05 : 0.035, k < 3 ? 0.7 : 0.4, { kind: 0, delay });
    }
  }
}

// ---------------------------------------------------------------- the Big Rip: the galaxy

export function ripGalaxia(): EraModule {
  return {
    spec: {
      id: 'rip-galaxia',
      acto: 'El final',
      certeza: 'E',
      name: 'El Gran Desgarro',
      fact: 'Si la energía oscura crece sin freno, la expansión acaba rompiéndolo todo, de lo más grande a lo más pequeño: Potencias al revés.',
      label: 'desgarro',
      unitExp: 21,
      frame: 6,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.55],
      fadeE: [-3, -2, 3, 4.5],
      tint: 0xff8a5a,
      generate() {
        const r = rng(1811);
        const b = materiaBuilder(1812);
        // Milkomeda: the elliptical galaxy the Milky Way and Andromeda became.
        for (let k = 0; k < 52000; k++) {
          const v = new THREE.Vector3(gauss(r), gauss(r) * 0.7, gauss(r) * 0.85).multiplyScalar(0.85 * Math.pow(r(), 0.6) + 0.06);
          const core = v.length() < 0.25;
          b.push(v.x, v.y, v.z, core ? 0xffe2c0 : r() < 0.7 ? 0xffd8b0 : 0xff9a6a, 0.016, core ? 0.05 : 0.28, { kind: 0 });
        }
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK;',
          // Every star pulled away from every other, faster and faster.
          // (the camera sits just outside: the near stars stream past it)
          move: ripMove('p *= 1.0 + tear * 14.0 * (0.4 + seed); em = mix(em, vec3(1.0, 0.5, 0.35) * length(em), smoothstep(0.3, 0.9, uK)) * (1.0 - 0.6 * smoothstep(0.7, 1.0, uK));'),
          uniforms: uni,
        });
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = new THREE.Vector3();
        return {
          object,
          clouds: [cloud],
          update(f) {
            const k = f.tl.get('rip.g', f.p);
            uni.uK.value = k;
            ours.set(0.3, 0.02, 0.1).multiplyScalar(1 + Math.pow(k, 3) * 14 * 0.9);
          },
          proton: () => ours,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'rip.g': 0 });
      tl.to(3.0, { era: era.index, e: era.home - 0.15, ah: 10.3, fov: 58, yaw: 1.8, pitch: 0.3, roll: 0, fondo: 1, horno: 0, bloom: 0.4, umbral: 0.3 });
      tl.label('rip-galaxia');
      tl.caption(4.8, 'Faltan 60 millones de años', 'La galaxia se deshace: sus estrellas se alejan unas de otras cada vez más rápido.');
      tl.to(4.8, { 'rip.g': 1, ah: 10.341, e: era.home - 0.45, yaw: 2.5, pitch: 0.15, roll: 0.25 });
    },
  };
}

// ---------------------------------------------------------------- the Big Rip: a star and its planets

export function ripSistema(): EraModule {
  return {
    spec: {
      id: 'rip-sistema',
      acto: 'El final',
      certeza: 'E',
      name: 'El Gran Desgarro',
      fact: 'Faltan tres meses: los planetas se sueltan de su estrella.',
      label: 'planetas',
      unitExp: 11,
      frame: 8,
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.55],
      fadeE: [-2.4, -1.6, 2.6, 4],
      tint: 0xffd8a8,
      generate() {
        const r = rng(1911);
        const b = materiaBuilder(1912);
        // The star (kind 0), its planets (kind 1, drawn far larger than life) and their orbits (kind 2).
        for (let k = 0; k < 40; k++) b.push(gauss(r) * 0.003, gauss(r) * 0.003, gauss(r) * 0.003, 0xfff2d8, 0.03, 2, { kind: 0, star: true });
        for (let k = 0; k < 900; k++) {
          const [x, y, z] = b.onSphere();
          const R = 0.04 * Math.pow(r(), 2);
          b.push(x * R, y * R, z * R, 0xffe8c0, 0.02, 0.18, { kind: 0 });
        }
        const radii = [0.6, 1.1, 1.5, 2.3, 3.4];
        const sizes = [0.022, 0.034, 0.036, 0.028, 0.07];
        radii.forEach((R, i) => {
          const ang = r() * 6.283;
          const cx = Math.cos(ang) * R;
          const cz = Math.sin(ang) * R;
          for (let k = 0; k < 500; k++) {
            const [x, y, z] = b.onSphere();
            // Lit on the side facing the star.
            const lit = 0.12 + 0.88 * Math.max(0, -(x * Math.cos(ang) + z * Math.sin(ang)));
            const s = sizes[i];
            b.push(cx + x * s, y * s, cz + z * s, [0xb8b0a8, 0xffe2b0, 0x6fa8ff, 0xff8a5a, 0xffd8a8][i], 0.012, 0.9 * lit, { kind: 1, from: [cx, 0, cz] });
          }
          const n = Math.round(240 * Math.sqrt(R));
          for (let k = 0; k < n; k++) {
            const a = (k / n) * 6.283;
            b.push(Math.cos(a) * R, 0, Math.sin(a) * R, 0xece7db, 0.008, 0.3, { kind: 2 });
          }
        });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK;',
          move: ripMove(`
            if (aKind > 0.5 && aKind < 1.5) {
              // Planets let go, spiralling out (and begin to stretch).
              float a = tear * 2.5;
              vec3 c = vec3(cos(a) * aFrom.x - sin(a) * aFrom.z, 0.0, sin(a) * aFrom.x + cos(a) * aFrom.z) * (1.0 + tear * 6.0);
              p = c + (p - aFrom) * (1.0 + tear * 1.5);
            } else if (aKind > 1.5) {
              em *= 1.0 - smoothstep(0.05, 0.4, uK);
            } else {
              p *= 1.0 + smoothstep(0.85, 1.0, uK) * 60.0 * seed;
            }
          `),
          uniforms: uni,
        });
        cloud.u.uMaxPx.value = 30;
        const object = new THREE.Group();
        object.add(cloud.points);
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uK.value = f.tl.get('rip.s', f.p);
          },
          proton: () => null,
        };
      },
    },
    choreo(tl, era) {
      tl.set({ 'rip.s': 0 });
      tl.to(3.0, { era: era.index, e: era.home - 0.35, ah: 10.342, yaw: 0.3, pitch: 0.55, roll: 0 });
      tl.label('rip-sistema');
      tl.caption(3.8, 'Faltan tres meses', 'Los planetas se sueltan de su estrella.');
      tl.to(3.8, { 'rip.s': 1, e: era.home + 0.45, yaw: 0.9, pitch: 0.4, roll: 0.1 });
    },
  };
}

// ---------------------------------------------------------------- the Big Rip: a planet

export function ripPlaneta(): EraModule {
  return {
    spec: {
      id: 'rip-planeta',
      acto: 'El final',
      certeza: 'E',
      name: 'El Gran Desgarro',
      fact: 'Faltan treinta minutos: los planetas se rompen en pedazos.',
      label: 'planeta',
      unitExp: 6,
      frame: 20,
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.55],
      fadeE: [-2.4, -1.6, 2.6, 4],
      tint: 0xb8a090,
      generate() {
        const r = rng(2011);
        const b = materiaBuilder(2012);
        // A rocky planet; each point belongs to a fragment (aFrom holds the fragment's direction).
        const frags = Array.from({ length: 40 }, () => new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize());
        for (let k = 0; k < 40000; k++) {
          const [x, y, z] = b.onSphere();
          const v = new THREE.Vector3(x, y, z);
          let best = 0;
          let bd = -2;
          frags.forEach((f, i) => {
            const d = f.dot(v);
            if (d > bd) {
              bd = d;
              best = i;
            }
          });
          const R = 6.371 * Math.cbrt(0.35 + 0.65 * r());
          const crater = 0.75 + 0.25 * Math.sin(x * 11 + y * 7) * Math.cos(z * 9);
          b.push(x * R, y * R, z * R, r() < 0.5 ? 0x9a8a7a : 0x7a6a5e, 0.09, 0.7 * crater, { kind: 0, from: frags[best].toArray() as [number, number, number] });
        }
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK;',
          move: ripMove('p = position + aFrom * tear * 40.0 * (0.8 + 0.4 * seed); em *= 0.4 + 0.6 * smoothstep(-0.2, 0.6, dot(normalize(position), vec3(0.6, 0.5, 0.6)));'),
          uniforms: uni,
        });
        cloud.u.uNear.value = 1;
        const object = new THREE.Group();
        object.add(cloud.points);
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uK.value = f.tl.get('rip.p', f.p);
          },
          proton: () => null,
        };
      },
    },
    choreo(tl, era) {
      tl.set({ 'rip.p': 0 });
      tl.to(3.0, { era: era.index, e: era.home + 0.1, yaw: 0.2, pitch: 0.2, roll: 0 });
      tl.label('rip-planeta');
      tl.caption(3.6, 'Faltan treinta minutos', 'Los planetas se rompen en pedazos.');
      tl.to(3.6, { 'rip.p': 1, e: era.home + 0.8, yaw: 0.6, roll: 0.1 });
    },
  };
}

// ---------------------------------------------------------------- the Big Rip: an atom

export function ripAtomo(): EraModule {
  return {
    spec: {
      id: 'rip-atomo',
      acto: 'El final',
      certeza: 'E',
      name: 'El Gran Desgarro',
      fact: 'Faltan 10⁻¹⁹ segundos: los átomos se rompen. Después, el espacio mismo.',
      label: 'átomo',
      unitExp: -11,
      frame: 3,
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.6],
      fadeE: [-3, -2, 3, 4.5],
      tint: 0x8fb4ff,
      generate() {
        const r = rng(2111);
        const b = materiaBuilder(2112);
        // The electron cloud (kind 0) and the nucleus (kind 1), torn apart.
        for (let k = 0; k < 14000; k++) {
          const [x, y, z] = b.onSphere();
          const R = -0.5 * Math.log(1 - r() * 0.98);
          b.push(x * R, y * R, z * R, 0x8fd0ff, 0.025, 0.07, { kind: 0 });
        }
        for (let k = 0; k < 200; k++) b.push(gauss(r) * 0.0004, gauss(r) * 0.0004, gauss(r) * 0.0004, k % 2 ? 0xff6a8a : 0xe8e0ff, 0.0012, 0.5, { kind: 1, star: true });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK;',
          move: ripMove(`
            if (aKind < 0.5) p *= 1.0 + tear * 20.0;
            else p *= 1.0 + smoothstep(0.6, 1.0, uK) * 3000.0 * seed;
            em *= 1.0 - smoothstep(0.85, 1.0, uK);
          `),
          uniforms: uni,
        });
        cloud.u.uMaxPx.value = 30;
        const object = new THREE.Group();
        object.add(cloud.points);
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uK.value = f.tl.get('rip.a', f.p);
          },
          proton: () => null,
          placa(g, f) {
            const a = smoothstep(0.9, 1, uni.uK.value) * f.alpha;
            rotulo(g, f.u, f.W / 2, f.H * 0.45, 'el tiempo se acaba', 13, 0, a, false);
          },
        };
      },
    },
    choreo(tl, era) {
      tl.set({ 'rip.a': 0 });
      tl.to(3.0, { era: era.index, e: era.home, yaw: 0, pitch: 0.1, roll: 0, bloom: 0.35, umbral: 0.35 });
      tl.label('rip-atomo');
      tl.caption(3.6, 'Faltan 10⁻¹⁹ segundos', 'Los átomos se rompen. Después, el espacio mismo.');
      tl.to(3.6, { 'rip.a': 1, e: era.home + 0.4, roll: 0.2 });
      tl.with(0.2, { silencio: 1 });
      tl.wait(0.8);
    },
  };
}

// ---------------------------------------------------------------- the Big Crunch

/** The sky's temperature along the crunch (k 0..1, then `fin` 0..1): it lingers in the red and orange. */
function cieloColapso(k: number, fin: number) {
  return 0.43 + 2.6 * smoothstep(0, 0.42, k) + 0.45 * smoothstep(0.45, 0.85, k) + 0.25 * smoothstep(0.85, 1, k) + 0.08 * fin;
}

export function colapso(): EraModule {
  return {
    spec: {
      id: 'colapso',
      acto: 'El final',
      certeza: 'E',
      name: 'El Gran Colapso',
      fact: 'Si la energía oscura se debilita, la expansión podría frenar e invertirse: todo vuelve a caer, y a calentarse.',
      label: 'colapso',
      unitExp: 22,
      frame: 10,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.55],
      fadeE: [-3, -2, 3, 4.5],
      tint: 0xffc890,
      generate() {
        const r = rng(2211);
        const b = materiaBuilder(2212);
        campoDeGalaxias(b, r, 1100);
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK;',
          // Falling in (towards the camera, which falls with them), swelling, blueshifted, brighter;
          // then swallowed one by one by the glowing fog.
          move: `
            float fall = uK * uK;
            p *= 1.0 - 0.97 * fall;
            sz *= 1.0 + 2.5 * fall;
            em = mix(em, vec3(0.62, 0.78, 1.0) * length(em) * 1.7, smoothstep(0.1, 0.6, uK));
            em *= 1.0 - smoothstep(0.6 + 0.2 * aDelay, 0.75 + 0.2 * aDelay, uK);
          `,
          uniforms: uni,
        });
        cloud.u.uNear.value = 1;
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = new THREE.Vector3();
        let k = 0;
        let fin = 0;
        return {
          object,
          clouds: [cloud],
          update(f) {
            k = f.tl.get('col.k', f.p);
            fin = f.tl.get('col.fin', f.p);
            uni.uK.value = k;
            ours.set(0.4, 0.1, 0.2).multiplyScalar(1 - 0.97 * k * k);
          },
          proton: () => (fin < 0.5 ? ours : null),
          lectura: () => {
            // The sky shows the plasma as the eye would (white-hot at most); the thermometer goes on,
            // up to the Planck temperature, the beginning's. Sizes shrink as the temperature rises.
            const cielo = cieloColapso(k, fin);
            const logT = fin > 0 ? cielo + 28 * fin * fin : cielo;
            return { logT, logTCielo: cielo, claro: 1 - smoothstep(0.5, 0.8, k), logSize: Math.max(-35, 26.9 - (logT - 0.43)) };
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'col.k': 0, 'col.fin': 0 });
      tl.to(3.0, { era: era.index, e: era.home - 0.1, ah: 10.22, fov: 56, yaw: 1.6, pitch: 0.3, roll: 0, fondo: 1, horno: 1, bloom: 0.5, umbral: 0.2 });
      tl.label('colapso');
      tl.caption(4.4, 'Todo vuelve a caer', 'Las galaxias dejan de alejarse y regresan, cada vez más rápido. Su luz se corre al azul y el cielo empieza a brillar.');
      tl.to(4.4, { 'col.k': 0.45, ah: 10.27, e: era.home - 0.45, yaw: 2.1, pitch: 0.2, roll: 0.1 });
      tl.caption(4.8, 'De vuelta a la niebla', 'El universo vuelve a ser un plasma incandescente, como antes de la primera luz. ¿Un final, o el comienzo de un rebote?');
      tl.to(4.8, { 'col.k': 1, ah: 10.29, e: era.home - 0.9, yaw: 2.7, pitch: 0.05, roll: 0.3 });
      // Hotter than any star, back to the temperature of the beginning: a flash, and nothing.
      tl.to(1.4, { 'col.fin': 1, bloom: 0.9, e: era.home - 1.2 });
      tl.with(0.2, { silencio: 1 });
      tl.to(0.8, { fondo: 0, bloom: 0.5 });
    },
  };
}

// ---------------------------------------------------------------- vacuum decay

/** Where we look during the decay (the bubble is born ahead, beyond the galaxies). */
const VISTA = new THREE.Euler(0.25, 1.9, 0, 'YXZ');

export function vacio(): EraModule {
  return {
    spec: {
      id: 'vacio',
      acto: 'El final',
      certeza: 'E',
      name: 'El vacío que decae',
      fact: 'Si nuestro vacío no es el más estable, una burbuja de vacío verdadero podría nacer en cualquier punto y crecer casi a la velocidad de la luz.',
      label: 'vacío',
      unitExp: 22,
      frame: 10,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.55],
      fadeE: [-3, -2, 3, 4.5],
      tint: 0xece7db,
      generate() {
        const r = rng(2311);
        const b = materiaBuilder(2312);
        campoDeGalaxias(b, r, 1100);
        // The bubble's wall, drawn for the reader (nobody would see it: it comes at the speed of light).
        for (let k = 0; k < 40000; k++) {
          const [x, y, z] = b.onSphere();
          b.push(x, y, z, k % 7 ? 0xd6ccff : 0xffffff, 0.022, 0.45, { kind: 1 });
        }
        return { main: b.data() };
      },
      assemble(data) {
        const C = new THREE.Vector3(-3.5, 1.2, -13).applyQuaternion(new THREE.Quaternion().setFromEuler(VISTA).invert());
        const uni = { uR: { value: 0 }, uC: { value: C }, uHit: { value: 0 } };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uR, uHit;\nuniform vec3 uC;',
          move: `
            if (aKind < 0.5) {
              // Whatever the wall reaches flares, and is gone.
              float d = length(p - uC) - uR;
              float w = 0.03 * uR + 0.15;
              float flare = exp(-d * d / (w * w));
              em = mix(em, vec3(0.85, 0.8, 1.0) * length(em), flare) * smoothstep(-0.02 * w, 0.02 * w, d) * (1.0 + 5.0 * flare) * (1.0 - step(1.0, uHit));
            } else {
              p = uC + position * uR;
              sz *= max(uR * 0.35, 0.2);
              em *= step(0.01, uR) * (0.75 + 0.25 * sin(uTime * 2.0 + seed * 40.0)) * (1.0 - step(1.0, uHit));
            }
          `,
          uniforms: uni,
        });
        cloud.u.uNear.value = 1;
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = new THREE.Vector3(0.4, 0.1, 0.2);
        const cam = new THREE.Vector3();
        let R = 0;
        let hit = 0;
        return {
          object,
          clouds: [cloud],
          update(f) {
            R = f.tl.get('vac.r', f.p);
            uni.uR.value = R;
            // How far the wall is from us (1: it is here).
            object.worldToLocal(f.camera.getWorldPosition(cam));
            hit = R / Math.max(1e-6, cam.distanceTo(C));
            uni.uHit.value = hit;
          },
          proton: () => (R < ours.distanceTo(C) ? ours : null),
          // When it reaches us: a flash, then the dark of another physics.
          // (cooling like any light: white, orange, red, gone)
          lectura: () => ({ logTCielo: 0.43 + smoothstep(0.9, 1, hit) * (2.45 + 1.15 * (1 - smoothstep(1, 1.8, hit))) }),
          placa(g, f) {
            const a = smoothstep(1, 4, R) * (1 - smoothstep(0.75, 0.9, hit)) * f.alpha;
            rotulo(g, f.u, f.W / 2, f.H * 0.1, 'la pared de la burbuja, dibujada: viaja a la velocidad de la luz y nadie la vería venir', 9.5, 0, a * 0.8, false);
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'vac.r': 0 });
      tl.to(3.0, { era: era.index, e: era.home - 0.2, ah: 10.25, fov: 56, yaw: VISTA.y, pitch: VISTA.x, roll: 0, fondo: 1, horno: 1, bloom: 0.5, umbral: 0.2 });
      tl.label('vacio');
      tl.to(3.4, { 'vac.r': 8, yaw: VISTA.y + 0.04 });
      tl.caption(5.6, 'Sin aviso', 'Dentro, las leyes de la física serían otras. Nada de lo que conocemos podría existir.');
      // (the wall reaches us at about r = 19: the last bell)
      tl.to(1.9, { 'vac.r': 19, yaw: VISTA.y + 0.06, roll: 0.02 });
      tl.with(0.15, { silencio: 1 });
      tl.to(3.7, { 'vac.r': 40, yaw: VISTA.y + 0.08, roll: 0.05 });
      tl.wait(0.8);
    },
  };
}
