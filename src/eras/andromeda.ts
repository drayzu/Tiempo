import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { rotulo } from '../engine/placa';

/**
 * Andrómeda, un cielo con una sola galaxia, la última estrella (≈ 4 billion to 100 trillion years
 * ahead). 1 unit = 10²¹ m (about 106 000 light-years).
 *
 * Andromeda comes closer; they pass, flinging out tails of stars, come back and merge into one
 * elliptical galaxy (recent studies give about even odds of a merger within ten billion years: the
 * plate says so). Meanwhile every other galaxy redshifts and crosses our horizon: a single galaxy in
 * an empty sky (an astronomer then could not learn there was a Big Bang). Then the stars go out,
 * the largest first, the smallest red dwarfs last, until the last one, near 10¹⁴ years.
 */

const D0 = new THREE.Vector3(-0.62, 0.28, -0.73).normalize().multiplyScalar(23.7);
const OURS = new THREE.Vector3(0.252, 0.01, 0.02);

/** M31's place relative to us along the merger (k 0..1): approach, a first pass, apart, back, one. */
function andromedaAt(k: number, out: THREE.Vector3) {
  const env =
    k < 0.4 ? 1 - 0.92 * smoothstep(0, 0.4, k) : k < 0.6 ? 0.08 + 0.27 * smoothstep(0.4, 0.6, k) : k < 0.82 ? 0.35 - 0.3 * smoothstep(0.6, 0.82, k) : 0.05 * (1 - smoothstep(0.82, 1, k));
  const ang = k * 3.4;
  out.copy(D0).applyAxisAngle(new THREE.Vector3(0.2, 1, 0.1).normalize(), ang).multiplyScalar(env);
  return out;
}

const MOVE = /* glsl */ `
  // Stars of the Milky Way (kind 0) and of Andromeda (kind 1), around their own centres, flung into
  // tails at each close pass, then settling into one elliptical galaxy (aFrom holds that place).
  if (aKind < 1.5) {
    vec3 c = aKind < 0.5 ? uMW : uM31;
    vec3 v = aKind < 0.5 ? uVMW : uVM31;
    float rr = length(position);
    vec3 star = c + uRotA * position;
    if (aKind > 0.5) star = c + uRotB * position;
    star += v * uTide * pow(rr / 1.2, 2.0) * (0.6 + 0.8 * seed);
    float merged = smoothstep(0.82, 1.0, uK);
    p = mix(star, aFrom, merged);
    em *= 1.0 - 0.45 * merged;
    // The stars age and go out: the blue (massive) first, the red dwarfs last (aDelay).
    float gone = smoothstep(aDelay - 0.04, aDelay, uLast);
    em = mix(em, vec3(1.0, 0.45, 0.3) * length(em) * 0.8, smoothstep(0.0, 0.7, uLast));
    em *= 1.0 - gone;
  } else if (aKind < 2.5) {
    // Other galaxies: redder and fainter as they cross our horizon.
    em = mix(em, vec3(0.9, 0.3, 0.2) * length(em), uSky) * (1.0 - smoothstep(aDelay * 0.7, aDelay * 0.7 + 0.3, uSky));
  } else {
    // The very last star.
    em *= smoothstep(0.85, 0.9, uLast) * (1.0 - smoothstep(0.985, 1.0, uLast));
  }
`;

function spiral(b: ReturnType<typeof materiaBuilder>, r: () => number, n: number, R: number, kind: number, light: number) {
  for (let k = 0; k < n; k++) {
    const s = -R * 0.3 * Math.log(1 - r() * 0.995);
    if (s > R * 1.4) continue;
    const arm = k % 2;
    const onArm = r() < 0.55;
    const th = onArm ? arm * Math.PI + Math.log(Math.max(s, 0.05) / 0.05) * 2.2 + gauss(r) * 0.25 : r() * Math.PI * 2;
    const pos = new THREE.Vector3(Math.cos(th) * s, gauss(r) * 0.02 * R, Math.sin(th) * s);
    // Its place in the elliptical galaxy they become.
    const e = new THREE.Vector3(gauss(r), gauss(r) * 0.7, gauss(r) * 0.85).multiplyScalar(0.85 * Math.pow(r(), 0.6) + 0.06);
    const young = onArm && r() < 0.4;
    // When it goes out: massive blue ones early, sun-like later, red dwarfs at the very end.
    const life = young ? r() * 0.25 : 0.25 + Math.pow(r(), 0.6) * 0.6;
    // (not light sources: far away they dim by area, so a galaxy reads as its shape, not a glare)
    b.push(pos.x, pos.y, pos.z, young ? 0xb8ccff : s < R * 0.2 ? 0xffd8a0 : 0xffe6c8, 0.014, light * (young ? 1.4 : 1) * (s < R * 0.15 ? 0.5 : 1), { kind, from: e.toArray() as [number, number, number], delay: life });
  }
}

export function andromeda(conUltima = true): EraModule {
  return {
    spec: {
      id: 'andromeda',
      acto: 'El futuro cercano',
      certeza: 'T',
      name: 'Andrómeda',
      fact: 'Andrómeda viene hacia nosotros. Quizá choquemos.',
      ficha: ['a 2,5 millones de años luz, acercándose a ~110 km/s', 'fusión: ~50 % en 10 000 millones de años (Sawala et al., 2025)', 'las demás galaxias cruzan el horizonte hacia 10¹¹ años'],
      label: 'Andrómeda',
      unitExp: 21,
      frame: 20,
      anchor: new THREE.Vector3(-2.52e9, 0, 0),
      frameCenter: new THREE.Vector3(),
      fade: [0.6, 0.5],
      fadeE: [-4.5, -3.5, 4, 5.5],
      tint: 0xffe2b0,
      notes: [{ at: [0, 0.6, 0], text: 'Vía Láctea' }],
      generate() {
        const r = rng(1311);
        const b = materiaBuilder(1312);
        spiral(b, r, 30000, 0.5, 0, 0.5);
        spiral(b, r, 36000, 0.75, 1, 0.5);
        // Other galaxies, all around, near and far.
        for (let k = 0; k < 420; k++) {
          const [x, y, z] = b.onSphere();
          const d = 40 + r() * 260;
          for (let j = 0; j < 6; j++) b.push(x * d + gauss(r) * 0.2, y * d + gauss(r) * 0.2, z * d + gauss(r) * 0.2, r() < 0.5 ? 0xbcd2ff : 0xffe2b0, 0.25, 0.6, { kind: 2, delay: r(), star: true });
        }
        // The last red dwarf.
        b.push(0.18, 0.05, 0.1, 0xff5a3a, 0.02, 1.5, { kind: 3, star: true });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = {
          uK: { value: 0 },
          uMW: { value: new THREE.Vector3() },
          uM31: { value: new THREE.Vector3() },
          uVMW: { value: new THREE.Vector3() },
          uVM31: { value: new THREE.Vector3() },
          uTide: { value: 0 },
          uSky: { value: 0 },
          uLast: { value: 0 },
          uRotA: { value: new THREE.Matrix3() },
          uRotB: { value: new THREE.Matrix3() },
        };
        // The two disks' tilts.
        uni.uRotA.value.setFromMatrix4(new THREE.Matrix4().makeRotationX(0.25));
        uni.uRotB.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.1, 0.4, 0.6)));
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK, uTide, uSky, uLast;\nuniform vec3 uMW, uM31, uVMW, uVM31;\nuniform mat3 uRotA, uRotB;',
          move: MOVE,
          uniforms: uni,
        });
        cloud.u.uMaxPx.value = 30;
        const object = new THREE.Group();
        object.add(cloud.points);
        const a = new THREE.Vector3();
        const a2 = new THREE.Vector3();
        const ours = new THREE.Vector3();
        let shown = { k: 0, sky: 0, last: 0 };
        return {
          object,
          clouds: [cloud],
          update(f) {
            const k = f.tl.get('and.k', f.p);
            const sky = f.tl.get('and.sky', f.p);
            const last = f.tl.get('and.last', f.p);
            andromedaAt(k, a);
            andromedaAt(Math.min(k + 0.01, 1), a2);
            // The heavier Andromeda moves less: the centre of mass stays near the middle.
            const mw = a.clone().multiplyScalar(-0.45);
            const m31 = a.clone().multiplyScalar(0.55);
            uni.uMW.value.copy(mw);
            uni.uM31.value.copy(m31);
            const vel = a2.clone().sub(a).normalize();
            uni.uVMW.value.copy(vel).multiplyScalar(-1);
            uni.uVM31.value.copy(vel);
            uni.uTide.value = 0.5 * (Math.exp(-Math.pow((k - 0.42) / 0.06, 2)) + Math.exp(-Math.pow((k - 0.82) / 0.05, 2))) + 0.35 * smoothstep(0.42, 0.55, k) * (1 - smoothstep(0.8, 0.95, k));
            uni.uK.value = k;
            uni.uSky.value = sky;
            uni.uLast.value = last;
            ours.copy(OURS).add(mw);
            shown = { k, sky, last };
          },
          proton: () => ours,
          placa(g, f) {
            // Honest about the collision: even odds.
            const a1 = smoothstep(0.05, 0.15, shown.k) * (1 - smoothstep(0.45, 0.6, shown.k)) * f.alpha;
            rotulo(g, f.u, f.W / 2, f.H * 0.1, 'probabilidad de fusión ≈ 50 % en 10 000 millones de años (Sawala et al., 2025)', 9.5, 0, a1 * 0.8, false);
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'and.k': 0, 'and.sky': 0, 'and.last': 0 });
      // From the white dwarf out to the galaxies: Andromeda coming.
      tl.to(3.4, { era: era.index, e: era.home + 0.25, ah: 9.6, fondo: 1, horno: 0, fov: 54, yaw: 0.3, pitch: 0.35, roll: 0, bloom: 0.45, umbral: 0.3 });
      tl.label('andromeda');
      tl.to(5.2, { 'and.k': 0.62, ah: 9.85, e: era.home - 0.45, yaw: 0.8, pitch: 0.5 });
      tl.to(3.6, { 'and.k': 1, ah: 10.2, e: era.home - 0.6, yaw: 1.3, pitch: 0.4 });
      // The fork: from here on, physics is not sure (the page offers the endings).
      tl.label('bifurcacion');
      // The other endings come sooner (some twenty billion years): the clock holds while one is chosen.
      if (!conUltima) {
        tl.to(4.2, { ah: 10.2, e: era.home + 0.5, yaw: 1.5, pitch: 0.3 });
        return;
      }
      tl.caption(4.2, 'Un cielo con una sola galaxia', 'Las demás galaxias se alejan cada vez más rápido y cruzan el horizonte. Un astrónomo del futuro no podría saber que hubo un Big Bang.');
      tl.to(4.2, { 'and.sky': 1, ah: 11.4, e: era.home + 1.1, yaw: 1.6, pitch: 0.2 });
      // The last star belongs to the cold ending.
      tl.caption(4.6, 'La última estrella', 'Las estrellas se apagan una a una, las más grandes primero. Hacia los 10¹⁴ años se apaga la última enana roja.');
      tl.to(4.6, { 'and.last': 1, ah: 14, e: era.home - 0.7, yaw: 1.9, pitch: 0.45, silencio: 0.25 });
    },
  };
}
