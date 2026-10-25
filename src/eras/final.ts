import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { rotulo } from '../engine/placa';
import { infinito, infinitoData } from './infinito';

/**
 * El largo final (10¹⁴ to 10¹⁰⁰ years and beyond), the ending physics finds most likely: the
 * universe goes cold. Four eras: the dead stars; whether protons die (and ours with them); the last
 * light, black holes evaporating; the dark, where only the numbers move.
 */

// ---------------------------------------------------------------- the dead stars

const DEAD_MOVE = /* glsl */ `
  if (aKind < 0.5) {
    // White dwarfs cooling: white, yellow, red, black (each at its own pace); the galaxy evaporates,
    // its remains flung out one by one.
    float cool = smoothstep(aDelay * 0.7, aDelay * 0.7 + 0.3, uK);
    vec3 warm = mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.45, 0.25), smoothstep(0.0, 0.6, cool));
    em = warm * length(em) * (1.0 - smoothstep(0.55, 1.0, cool));
    p *= 1.0 + uK * uK * 3.0 * pow(seed, 3.0);
  } else if (aKind < 1.5) {
    // Brown dwarfs that collide: a new red star for a while.
    float t = (uK - aDelay) / 0.05;
    em *= t > 0.0 ? exp(-t) * (1.0 + 6.0 * exp(-t * 8.0)) : 0.0;
  } else {
    // The central black hole's glowing edge (what falls in lights it), growing.
    p *= 1.0 + 0.6 * uK;
    em *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 0.7 + seed * 6.0), 6.0);
  }
`;

export function degenerada(): EraModule {
  return {
    spec: {
      id: 'degenerada',
      acto: 'El largo final',
      certeza: 'T',
      name: 'Las estrellas muertas',
      fact: 'Quedan enanas blancas que se enfrían hasta volverse negras, estrellas de neutrones y agujeros negros. La galaxia se evapora.',
      label: 'restos',
      unitExp: 21,
      frame: 6,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.5],
      fadeE: [-3, -2, 3, 4.5],
      tint: 0x8a6a5a,
      generate() {
        const r = rng(1411);
        const b = materiaBuilder(1412);
        for (let k = 0; k < 9000; k++) {
          const v = new THREE.Vector3(gauss(r), gauss(r) * 0.7, gauss(r) * 0.85).multiplyScalar(0.85 * Math.pow(r(), 0.6) + 0.06);
          b.push(v.x, v.y, v.z, 0xe8eeff, 0.01, 0.9, { kind: 0, delay: r(), star: true });
        }
        for (let k = 0; k < 26; k++) {
          const v = new THREE.Vector3(gauss(r), gauss(r) * 0.7, gauss(r) * 0.85).multiplyScalar(0.6);
          b.push(v.x, v.y, v.z, 0xff6a3a, 0.02, 2.5, { kind: 1, delay: 0.1 + r() * 0.85, star: true });
        }
        for (let k = 0; k < 900; k++) {
          const a = (k / 900) * Math.PI * 2;
          b.push(Math.cos(a) * 0.03, Math.sin(a) * 0.012, Math.sin(a) * 0.03, 0xffd8a0, 0.004, 0.5, { kind: 2 });
        }
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, { pre: 'uniform float uK;', move: DEAD_MOVE, uniforms: uni });
        cloud.u.uMaxPx.value = 20;
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = new THREE.Vector3(0.3, 0.05, 0.12);
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uK.value = f.tl.get('deg.k', f.p);
          },
          proton: () => ours,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'deg.k': 0 });
      tl.to(3.0, { era: era.index, e: era.home + 0.1, ah: 14.6, fondo: 1, horno: 0, fov: 54, yaw: 2.0, pitch: 0.4, roll: 0, bloom: 0.6, umbral: 0.12 });
      tl.label('degenerada');
      tl.to(3.6, { 'deg.k': 0.45, ah: 17, yaw: 2.3 });
      tl.caption(3.4, 'Un fuego raro', 'A veces dos enanas marrones chocan y encienden una estrella nueva, por un rato.');
      tl.to(3.4, { 'deg.k': 0.8, ah: 19.5, yaw: 2.6, pitch: 0.3 });
      tl.to(2.6, { 'deg.k': 1, ah: 22, e: era.home + 0.6, yaw: 2.8 });
    },
  };
}

// ---------------------------------------------------------------- do protons die?

const LEGS = [new THREE.Vector3(3.3, 0.6, 0.5), new THREE.Vector3(-2.1, 2.5, -0.4), new THREE.Vector3(-1.4, -2.9, 0.3)].map((v) => v.multiplyScalar(0.75));
const QCOL = [0xff4a5e, 0x4aff9a, 0x4a8cff];

/**
 * Our proton, seen close once more (Potencias' quark Y), then (if protons decay) it goes: two of its
 * quarks become a pion that turns into two flashes of light, and a positron flies off.
 * kind 0: quarks; 1: gluon tube points (aDelay along the leg); 2: positron; 3: the two flashes.
 */
const PROTON_MOVE = /* glsl */ `
  float d = uDecay;
  if (aKind < 0.5) {
    vec3 jit = vec3(sin(uTime * 2.1 + seed * 91.0), cos(uTime * 1.7 + seed * 53.0), sin(uTime * 1.9 + seed * 29.0)) * 0.08;
    // Two quarks (aDelay 1) draw together into the pion; the third (aDelay 0) becomes the positron's partner.
    vec3 meet = vec3(-1.6, -0.2, 0.0);
    p = mix(position, meet, smoothstep(0.1, 0.45, d) * aDelay) + jit;
    em *= 1.0 - smoothstep(0.45, 0.55, d);
  } else if (aKind < 1.5) {
    em *= 0.6 * (1.0 - smoothstep(0.15, 0.4, d));
  } else if (aKind < 2.5) {
    // The positron: born at the break, flying away.
    float k = smoothstep(0.5, 1.0, d);
    p = position + vec3(1.0, 0.25, 0.1) * k * 30.0;
    em *= step(0.5, d) * (1.0 - smoothstep(0.9, 1.0, d));
  } else {
    // The pion's two flashes of light, opposite ways.
    float k = smoothstep(0.52, 0.8, d);
    p = vec3(-1.6, -0.2, 0.0) + position * k * 40.0;
    em *= step(0.52, d) * exp(-k * 2.5) * 3.0;
  }
`;

export function protones(): EraModule {
  return {
    spec: {
      id: 'protones',
      acto: 'El largo final',
      certeza: 'E',
      name: '¿Mueren los protones?',
      fact: 'Nadie ha visto morir uno: viven más de 10³⁴ años. Si mueren, nuestro protón se irá en un destello.',
      label: 'protones',
      unitExp: -16,
      frame: 30,
      frameCenter: new THREE.Vector3(),
      fade: [0.35, 0.5],
      fadeE: [-4, -2.5, 40, 42],
      tint: 0x8fb4ff,
      generate() {
        const r = rng(1511);
        const b = materiaBuilder(1512);
        LEGS.forEach((leg, j) => {
          for (let k = 0; k < 120; k++) b.push(leg.x + gauss(r) * 0.25, leg.y + gauss(r) * 0.25, leg.z + gauss(r) * 0.25, QCOL[j], 0.5, 0.55, { kind: 0, delay: j === 2 ? 0 : 1 });
          for (let k = 0; k < 220; k++) {
            const t = r();
            b.push(leg.x * t + gauss(r) * 0.1, leg.y * t + gauss(r) * 0.1, leg.z * t + gauss(r) * 0.1, 0xffe6b0, 0.22, 0.4, { kind: 1, delay: t });
          }
        });
        for (let k = 0; k < 160; k++) b.push(LEGS[2].x + gauss(r) * 0.2, LEGS[2].y + gauss(r) * 0.2, LEGS[2].z + gauss(r) * 0.2, 0xffb0d8, 0.4, 0.9, { kind: 2 });
        for (let k = 0; k < 240; k++) {
          const s = k % 2 ? 1 : -1;
          b.push(s * (0.3 + gauss(r) * 0.03), s * (0.75 + gauss(r) * 0.03), gauss(r) * 0.03, 0xe8f0ff, 0.6, 1.2, { kind: 3 });
        }
        // The void around it: almost nothing, at every scale, for the long dive down.
        const vacio = infinitoData({
          seed: 1513,
          layers: 7,
          spacing: 0.7,
          perLayer: 900,
          point(rr, o) {
            const x = rr() * 2 - 1;
            const y = rr() * 2 - 1;
            const z = rr() * 2 - 1;
            if (Math.hypot(x, y, z) > 1) return false;
            Object.assign(o, { x, y, z, hex: 0x8f9ab0, size: 0.004, light: 0.18 });
            return true;
          },
        });
        return { main: b.data(), vacio };
      },
      assemble(data) {
        const uni = { uDecay: { value: 0 } };
        const cloud = materia(data.main as MateriaData, { pre: 'uniform float uDecay;', move: PROTON_MOVE, uniforms: uni });
        cloud.u.uMaxPx.value = 40;
        const vacio = infinito(data.vacio as ReturnType<typeof infinitoData>, 0.7);
        const object = new THREE.Group();
        object.add(vacio.points, cloud.points);
        const ours = new THREE.Vector3();
        let decay = 0;
        let near = 0;
        return {
          object,
          clouds: [cloud],
          update(f) {
            decay = f.tl.get('pro.decay', f.p);
            uni.uDecay.value = decay;
            // The proton's own drawing only near its scale; the void streams by on the way down.
            near = smoothstep(f.home + 3, f.home + 1, f.e);
            cloud.u.uAlpha.value = f.alpha * near;
            vacio.update(f.camera, object, f.focal, f.dpr, f.time, f.alpha * (1 - near * 0.7), -f.e);
          },
          // It exists until it decays (and the camera never loses it before).
          proton: () => (decay < 0.5 ? ours : null),
          placa(g, f) {
            const a = smoothstep(0.85, 0.95, decay) * f.alpha;
            rotulo(g, f.u, f.W / 2, f.H * 0.1, 'si los protones no decaen, el nuestro sigue aquí, para siempre', 9.5, 0, a * 0.75, false);
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'pro.decay': 0 });
      // Down through the emptiness, thirty-seven orders of magnitude, to our proton.
      tl.to(2.6, { era: era.index - 0.4, e: 10, ah: 26, fov: 60, yaw: 0, pitch: 0, roll: 0 });
      tl.to(3.4, { era: era.index, e: era.home - 0.1, ah: 33, roll: 0.2 });
      tl.label('protones');
      tl.to(3.0, { ah: 36, e: era.home - 0.3, yaw: 0.5, pitch: 0.15 });
      // If protons decay, ours goes.
      tl.caption(4.2, 'Adiós', 'Desde la primera millonésima de segundo hasta aquí: unos 10⁴⁰ años. Fue hidrógeno, agua, parte de ti.');
      tl.to(4.2, { 'pro.decay': 1, ah: 40, e: era.home + 0.2, yaw: 0.9, roll: 0.3 });
      tl.wait(1.2);
    },
  };
}

// ---------------------------------------------------------------- the last light

const BH = [
  { at: [2.5, 0.4, -1.2], m: 0.12 },
  { at: [-3.1, -0.6, 0.8], m: 0.2 },
  { at: [1.2, -1.4, 2.2], m: 0.3 },
  { at: [-1.6, 1.3, -2.5], m: 0.42 },
  { at: [3.6, 1.1, 1.8], m: 0.55 },
  { at: [-2.8, -1.5, -1.4], m: 0.68 },
  { at: [0.4, 0.2, 0.3], m: 1.0 },
];

/**
 * Black holes evaporating (Hawking radiation): each a dark disc whose edge glows faintly, hotter and
 * brighter as it shrinks, ending in a flash; the smallest first, the largest last. aDelay is when
 * each ends (its mass).
 */
const BH_MOVE = /* glsl */ `
  vec3 c = aFrom;
  float life = clamp(uK / aDelay, 0.0, 1.0);
  float sc = pow(max(1.0 - life, 0.0), 0.33);
  p = c + (position - c) * sc;
  float glow = 0.12 + 1.5 * pow(life, 6.0);
  float flash = exp(-pow((uK - aDelay) / 0.012, 2.0));
  em = mix(em, vec3(0.85, 0.9, 1.0), smoothstep(0.7, 1.0, life)) * glow * step(uK, aDelay) + vec3(1.0, 0.97, 0.9) * flash * 6.0 * aKind;
  occ *= sc * step(uK, aDelay);
  sz *= mix(1.0, 3.0, flash);
`;

export function ultimaLuz(): EraModule {
  return {
    spec: {
      id: 'ultima-luz',
      acto: 'El largo final',
      certeza: 'T',
      name: 'La última luz',
      fact: 'Solo quedan agujeros negros, que se evaporan muy, muy despacio. El último termina en un destello hacia los 10¹⁰⁰ años.',
      label: 'última luz',
      unitExp: 21,
      frame: 12,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.5],
      fadeE: [-34, -32, 4, 5],
      tint: 0xffd8a0,
      generate() {
        const r = rng(1611);
        const b = materiaBuilder(1612);
        BH.forEach((h) => {
          const c = new THREE.Vector3(...(h.at as [number, number, number]));
          const R = 0.12 + 0.35 * h.m;
          // Its edge: a ring of faint light, tilted.
          const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 1.4, r() * 3, 0));
          for (let k = 0; k < 500; k++) {
            const a = (k / 500) * Math.PI * 2;
            const v = new THREE.Vector3(Math.cos(a) * R, gauss(r) * 0.01, Math.sin(a) * R).applyQuaternion(tilt).add(c);
            b.push(v.x, v.y, v.z, 0xffcf90, 0.03, 0.5, { kind: 1, from: c.toArray() as [number, number, number], delay: h.m });
          }
          // Its dark disc (it hides what is behind).
          for (let k = 0; k < 300; k++) {
            const [x, y, z] = b.onSphere();
            const v = new THREE.Vector3(x, y, z).multiplyScalar(R * 0.75 * Math.cbrt(r())).add(c);
            b.push(v.x, v.y, v.z, 0x000000, 0.1, 0, { kind: 0, from: c.toArray() as [number, number, number], delay: h.m, ink: 1 });
          }
        });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = { uK: { value: 0 } };
        const cloud = materia(data.main as MateriaData, { pre: 'uniform float uK;', move: BH_MOVE, uniforms: uni });
        cloud.u.uInk.value = 1;
        cloud.u.uMaxPx.value = 40;
        const object = new THREE.Group();
        object.add(cloud.points);
        return {
          object,
          clouds: [cloud],
          update(f) {
            uni.uK.value = f.tl.get('luz.k', f.p);
          },
          proton: () => null,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'luz.k': 0 });
      // Back up from where our proton was, to the black holes.
      tl.to(3.4, { era: era.index, e: era.home + 0.2, ah: 60, fov: 56, yaw: 0.2, pitch: 0.25, roll: 0 });
      tl.label('ultima-luz');
      tl.to(3.4, { 'luz.k': 0.56, ah: 80, yaw: 0.6 });
      tl.to(3.0, { 'luz.k': 0.9, ah: 96, 'ultima-luz.fx': 0.4, 'ultima-luz.fy': 0.2, 'ultima-luz.fz': 0.3, e: era.home - 0.4, yaw: 0.9 });
      tl.caption(3.0, 'La última luz', 'El último agujero negro se evapora en un destello. Después, nada vuelve a brillar.');
      tl.to(3.0, { 'luz.k': 1.02, ah: 100, e: era.home - 0.55, yaw: 1.1 });
    },
  };
}

// ---------------------------------------------------------------- the dark

export function oscuridad(): EraModule {
  return {
    spec: {
      id: 'oscuridad',
      acto: 'El largo final',
      certeza: 'T',
      name: 'La oscuridad',
      fact: 'Un universo frío, vacío y en calma. Ya nada cambia: solo los números siguen corriendo.',
      label: 'oscuridad',
      unitExp: 24,
      frame: 10,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.5],
      fadeE: [-20, -18, 20, 22],
      tint: 0x50586a,
      generate() {
        // A few photons and particles, ever farther apart.
        return infinitoData({
          seed: 1711,
          layers: 7,
          spacing: 0.8,
          perLayer: 500,
          point(r, o) {
            const x = r() * 2 - 1;
            const y = r() * 2 - 1;
            const z = r() * 2 - 1;
            if (Math.hypot(x, y, z) > 1) return false;
            Object.assign(o, { x, y, z, hex: r() < 0.5 ? 0x8f6a5a : 0x5a6a8f, size: 0.004, light: 0.12 });
            return true;
          },
        });
      },
      assemble(data) {
        const field = infinito(data as ReturnType<typeof infinitoData>, 0.8);
        const object = new THREE.Group();
        object.add(field.points);
        return {
          object,
          clouds: [],
          update(f) {
            // Everything drifts apart: the field slowly shrinks away.
            field.update(f.camera, object, f.focal, f.dpr, f.time, f.alpha, -f.tl.get('osc.z', f.p));
          },
          proton: () => null,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'osc.z': 0 });
      tl.to(3.0, { era: era.index, e: era.home, ah: 130, fov: 56, yaw: 0, pitch: 0, roll: 0, fondo: 1 });
      tl.label('oscuridad');
      // The numbers are the spectacle: 10¹⁰⁰⁰, 10^(10⁶)…
      tl.to(2.4, { 'osc.z': 3, ah: 1000 });
      tl.to(2.4, { 'osc.z': 6, ah: 1e6 });
      tl.to(2.4, { 'osc.z': 9, ah: 1e10, roll: 0.15 });
    },
  };
}
