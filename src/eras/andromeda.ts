import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { vista, viajeA } from '../lib/vista';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { crearGalaxias } from '../engine/galaxia';
import { rotulo } from '../engine/placa';

/**
 * Andrómeda, un cielo con una sola galaxia, la última estrella (≈ 8 billion to 100 trillion years
 * ahead). 1 unit = 10²¹ m (about 106 000 light-years).
 *
 * The camera stays where the Sun was (its white dwarf now), inside the Milky Way: the galaxy is a band
 * across the sky, split by its dust, and Andromeda a smudge. Andromeda comes closer and grows until
 * it fills the sky; at the first pass its disk sweeps over us and the camera rises out of the galaxy
 * to see the two of them throw out long tails of stars while new stars light up in pink. They swing
 * apart, come back and merge into one elliptical galaxy; the camera goes back in, and the sky is a
 * soft glow all around. (A recent study, Sawala et al. 2025, gives about even odds of a merger within
 * ten billion years, and often later than thought: the plate says so.) Meanwhile every other galaxy
 * redshifts and crosses our horizon: a single galaxy in an empty sky. Then the stars go out, the
 * largest first, the smallest red dwarfs last, until the last one, near 10¹⁴ years.
 *
 * The smooth light of both galaxies is drawn per pixel (`galaxia.ts`), from outside and from inside;
 * the particles draw the stars that stand out and what the tides throw out.
 */

const D0 = new THREE.Vector3(-0.62, 0.28, -0.73).normalize().multiplyScalar(23.7);
const AXIS = new THREE.Vector3(0.2, 1, 0.1).normalize();
const RA = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0));
const RB = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, 0.4, 0.6));
const OURS_LOCAL = new THREE.Vector3(0.252, 0.01, 0.02);
/** Where the Sun's remains are after the merger (in the elliptical). */
const OURS_END = new THREE.Vector3(0.3, 0.05, 0.12);
const RD_MW = 0.1;
const RD_M31 = 0.16;

/** How far apart (fraction of today's distance) along the merger (k 0..1): approach, pass, apart, back, one. */
function sep(k: number) {
  if (k < 0.4) return 1 - 0.975 * Math.pow(smoothstep(0, 0.4, k), 1.2);
  if (k < 0.6) return 0.025 + 0.125 * smoothstep(0.4, 0.6, k);
  if (k < 0.82) return 0.15 - 0.13 * smoothstep(0.6, 0.82, k);
  return 0.02 * (1 - smoothstep(0.82, 1, k));
}
function andromedaAt(k: number, out: THREE.Vector3) {
  return out.copy(D0).applyAxisAngle(AXIS, k * 3.4).multiplyScalar(sep(k));
}
/** The two centres (the heavier Andromeda moves less) and the Sun's place, at k. */
function lugares(k: number) {
  const a = andromedaAt(k, new THREE.Vector3());
  const mw = a.clone().multiplyScalar(-0.45);
  const m31 = a.clone().multiplyScalar(0.55);
  const sun = OURS_LOCAL.clone().applyQuaternion(RA).add(mw).lerp(OURS_END, smoothstep(0.82, 1, k));
  return { a, mw, m31, sun };
}
/** Tidal strength along the merger: at each close pass, and lingering between them. */
const tideAt = (k: number) => 0.5 * (Math.exp(-Math.pow((k - 0.42) / 0.06, 2)) + Math.exp(-Math.pow((k - 0.8) / 0.05, 2))) + 0.35 * smoothstep(0.4, 0.5, k) * (1 - smoothstep(0.78, 0.92, k));

/** The Sun's white dwarf sits where the previous era's origin is: this era's origin, from there. */
const SOL0 = lugares(0).sun;

const MOVE = /* glsl */ `
  // Stars of the Milky Way (kind 0) and of Andromeda (kind 1) around their own centres; at each close
  // pass the tides stretch them towards and away from the other and shear them into curved tails;
  // then they settle into one elliptical galaxy (aFrom holds that place).
  if (aKind < 1.5 || (aKind > 3.5 && aKind < 4.5)) {
    bool mine = aKind < 0.5 || (aKind > 3.5 && aDelay < 0.5);
    vec3 c = mine ? uMW : uM31;
    vec3 o = mine ? uM31 : uMW;
    vec3 n = mine ? uNA : uNB;
    vec3 rel = mine ? uRotA * position : uRotB * position;
    float rr = length(rel);
    vec3 toO = normalize(o - c);
    float side = dot(rel, toO) / max(rr, 1e-4);
    rel += toO * sign(side) * pow(abs(side), 0.7) * rr * rr * uTide * (2.2 + 1.6 * seed);
    // Shear: the outer parts lag behind (they turn slower): curved tails.
    float sh = uTide * rr * 4.0;
    rel = rel * cos(sh) + cross(n, rel) * sin(sh) + n * dot(n, rel) * (1.0 - cos(sh));
    vec3 star = c + rel;
    float merged = smoothstep(0.82, 1.0, uK);
    p = mix(star, aFrom, merged);
    // (in the elliptical they are older and packed: a little larger, so the ball of stars reads)
    em *= 1.0 - 0.6 * merged;
    sz *= 1.0 + 0.7 * merged;
    if (aKind > 3.5) em *= uBurst * (1.0 - merged);
    // The stars age and go out: the blue (massive) first, the red dwarfs last (aDelay).
    float life = aKind > 3.5 ? 0.2 : aDelay;
    float gone = smoothstep(life - 0.04, life, uLast);
    em = mix(em, vec3(1.0, 0.45, 0.3) * length(em) * 0.8, smoothstep(0.0, 0.7, uLast));
    em *= 1.0 - gone;
    // From inside our own galaxy its stars are the sky (drawn smooth): the particles step aside; so do
    // all of them from inside the elliptical.
    if (mine) em *= uMine;
    em *= mix(1.0, uMine, smoothstep(0.8, 0.9, uK));
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
    b.push(pos.x, pos.y, pos.z, young ? 0xb8ccff : s < R * 0.2 ? 0xffd8a0 : 0xffe6c8, 0.012, light * (young ? 1.4 : 1) * (s < R * 0.15 ? 0.4 : 1), { kind, from: e.toArray() as [number, number, number], delay: life });
  }
  // Knots where the collision makes new stars (kind 4): pink, along the arms.
  for (let c = 0; c < 90; c++) {
    const s = R * (0.2 + 0.9 * r());
    const th = (c % 2) * Math.PI + Math.log(Math.max(s, 0.05) / 0.05) * 2.2 + gauss(r) * 0.2;
    const e = new THREE.Vector3(gauss(r), gauss(r) * 0.7, gauss(r) * 0.85).multiplyScalar(0.5);
    for (let k = 0; k < 10; k++) b.push(Math.cos(th) * s + gauss(r) * 0.01, gauss(r) * 0.004, Math.sin(th) * s + gauss(r) * 0.01, 0xff6f9a, 0.02, 0.9, { kind: 4, delay: kind, from: e.toArray() as [number, number, number] });
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
      // The Sun's remains (the previous era's origin) are where the Sun is in our galaxy.
      anchor: SOL0.clone().multiplyScalar(-1e10),
      frameCenter: new THREE.Vector3(),
      fade: [0.6, 0.5],
      fadeE: [-9, -8, 4, 5.5],
      tint: 0xffe2b0,
      // Inside a galaxy the camera must stay in its thin disk: where the Sun is, looking where the
      // choreography's angles look (`and.dentro` 1), or wherever the tracks say (0).
      viaje(tl, p) {
        const w = tl.get('and.dentro', p);
        const track = new THREE.Vector3(tl.get('andromeda.fx', p), tl.get('andromeda.fy', p), tl.get('andromeda.fz', p));
        if (w <= 0) return track;
        const L = lugares(tl.get('and.k', p));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tl.get('pitch', p), tl.get('yaw', p), tl.get('roll', p), 'YXZ')).invert();
        const look = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const camDist = 10 ** (tl.get('e', p) - 21) / 2 / Math.tan(THREE.MathUtils.degToRad(tl.get('fov', p) / 2));
        return track.lerp(L.sun.addScaledVector(look, camDist - 0.003), w);
      },
      generate() {
        const r = rng(1311);
        const b = materiaBuilder(1312);
        spiral(b, r, 30000, 0.5, 0, 0.3);
        spiral(b, r, 36000, 0.75, 1, 0.3);
        // Other galaxies, all around, near and far.
        for (let k = 0; k < 420; k++) {
          const [x, y, z] = b.onSphere();
          const d = 40 + r() * 260;
          for (let j = 0; j < 6; j++) b.push(x * d + gauss(r) * 0.2, y * d + gauss(r) * 0.2, z * d + gauss(r) * 0.2, r() < 0.5 ? 0xbcd2ff : 0xffe2b0, 0.25, 0.6, { kind: 2, delay: r(), star: true });
        }
        // The last red dwarf, near where the Sun was.
        b.push(OURS_END.x + 0.004, OURS_END.y + 0.001, OURS_END.z - 0.003, 0xff5a3a, 0.002, 1.5, { kind: 3, star: true });
        return { main: b.data() };
      },
      assemble(data) {
        const uni = {
          uK: { value: 0 },
          uMW: { value: new THREE.Vector3() },
          uM31: { value: new THREE.Vector3() },
          uNA: { value: new THREE.Vector3(0, 1, 0).applyQuaternion(RA) },
          uNB: { value: new THREE.Vector3(0, 1, 0).applyQuaternion(RB) },
          uTide: { value: 0 },
          uSky: { value: 0 },
          uLast: { value: 0 },
          uBurst: { value: 0 },
          uMine: { value: 1 },
          uRotA: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(RA)) },
          uRotB: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(RB)) },
        };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uK, uTide, uSky, uLast, uBurst, uMine;\nuniform vec3 uMW, uM31, uNA, uNB;\nuniform mat3 uRotA, uRotB;',
          move: MOVE,
          uniforms: uni,
        });
        cloud.u.uNear.value = 1;
        const glow = crearGalaxias();
        const object = new THREE.Group();
        object.add(glow.mesh, cloud.points);
        const q = new THREE.Quaternion();
        const qi = new THREE.Quaternion();
        const v = new THREE.Vector3();
        const w = new THREE.Vector3();
        const sky = new THREE.Matrix3();
        const m4 = new THREE.Matrix4();
        const ours = new THREE.Vector3();
        let shown = { k: 0, sky: 0, last: 0 };
        const xA = new THREE.Vector3(1, 0, 0).applyQuaternion(RA);
        const xB = new THREE.Vector3(1, 0, 0).applyQuaternion(RB);
        return {
          object,
          clouds: [cloud],
          update(f) {
            const k = f.tl.get('and.k', f.p);
            const skyK = f.tl.get('and.sky', f.p);
            const last = f.tl.get('and.last', f.p);
            const L = lugares(k);
            uni.uMW.value.copy(L.mw);
            uni.uM31.value.copy(L.m31);
            const tide = tideAt(k);
            uni.uTide.value = tide;
            uni.uK.value = k;
            uni.uSky.value = skyK;
            uni.uLast.value = last;
            uni.uBurst.value = smoothstep(0.38, 0.46, k) * (1 - smoothstep(0.9, 1, k));
            // Inside our galaxy, its own stars are drawn as the smooth sky.
            uni.uMine.value = smoothstep(20.8, 21.6, f.e);
            cloud.u.uMaxPx.value = 22 * f.dpr;

            // The smooth light, in world space.
            object.updateMatrixWorld();
            const scale = v.setFromMatrixColumn(object.matrixWorld, 0).length();
            object.getWorldQuaternion(q);
            const toW = (p: THREE.Vector3) => w.copy(p).applyMatrix4(object.matrixWorld);
            const dirW = (p: THREE.Vector3) => p.clone().applyQuaternion(q);
            const disks = 1 - smoothstep(0.78, 0.96, k);
            const dying = 1 - smoothstep(0.55, 1, last);
            glow.disco(0, { center: toW(L.mw).clone(), normal: dirW(uni.uNA.value), x: dirW(xA), rd: RD_MW * scale, light: disks * dying, twist: tide * 1.4, dust: 1.3, h: 0.12, phase: 0.6 });
            glow.disco(1, { center: toW(L.m31).clone(), normal: dirW(uni.uNB.value), x: dirW(xB), rd: RD_M31 * scale, light: disks * 0.9 * dying, twist: -tide * 1.4, dust: 1.0, h: 0.08, phase: 2.0 });
            glow.u.uEC.value.copy(toW(new THREE.Vector3()));
            glow.u.uER.value = 0.16 * scale;
            glow.u.uEL.value = smoothstep(0.8, 1, k) * dying * (0.45 + 0.3 * smoothstep(20.8, 21.6, f.e));
            glow.u.uBurst.value = uni.uBurst.value;
            glow.u.uRed.value = smoothstep(0.05, 0.6, last);
            glow.u.uStars.value = dying * 0.8;
            qi.copy(q).multiply(RA).invert();
            sky.setFromMatrix4(m4.makeRotationFromQuaternion(qi));
            glow.u.uSky.value.copy(sky);
            glow.frame(f.camera, f.alpha, f.time);

            ours.copy(L.sun);
            shown = { k, sky: skyK, last };
          },
          proton: () => ours,
          placa(g, f) {
            // Honest about the collision: even odds, and maybe later than once thought.
            const a1 = smoothstep(0.02, 0.1, shown.k) * (1 - smoothstep(0.32, 0.4, shown.k)) * f.alpha;
            rotulo(g, f.u, f.W / 2, f.H * 0.1, 'probabilidad de fusión ≈ 50 % en 10 000 millones de años (Sawala et al., 2025)', 9.5, 0, a1 * 0.8, false);
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'and.k': 0, 'and.sky': 0, 'and.last': 0, 'and.dentro': 1 });
      /** The camera just behind the Sun's place, looking at Andromeda (or past it, by `off`). */
      const desdeAqui = (k: number, e: number, fov: number, ref: { yaw: number; roll: number }, off = new THREE.Vector3()) => {
        const L = lugares(k);
        const look = L.m31.clone().sub(L.sun).normalize().add(off).normalize();
        const camDist = 10 ** (e - 21) / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
        const focus = L.sun.clone().addScaledVector(look, camDist - 0.003);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(RA);
        return { e, fov, ...vista(look.clone().negate(), up, ref), ...viajeA('andromeda', focus) };
      };
      // From the white dwarf out to the galaxy: inside the Milky Way, Andromeda a smudge ahead.
      const a0 = desdeAqui(0, 20.0, 62, { yaw: 1.2, roll: 0 }, new THREE.Vector3(0.12, -0.06, 0));
      tl.to(3.6, { era: era.index, ah: 9.93, fondo: 1, horno: 0, ...a0, bloom: 0.45, umbral: 0.3 });
      tl.label('andromeda');
      tl.caption(6.8, 'Andrómeda se acerca', 'Desde donde estuvo el Sol, la Vía Láctea es una banda en el cielo. Andrómeda, una mancha que crece hasta llenarlo.');
      const a1 = desdeAqui(0.14, 20.0, 64, a0, new THREE.Vector3(0.06, -0.03, 0));
      tl.to(2.4, { 'and.k': 0.14, ah: 9.94, ...a1 });
      const a2 = desdeAqui(0.27, 20.05, 68, a1, new THREE.Vector3(0.02, 0.0, 0));
      tl.to(2.2, { 'and.k': 0.27, ah: 9.95, ...a2 });
      const a3 = desdeAqui(0.35, 20.1, 74, a2, new THREE.Vector3(0.0, 0.08, 0.05));
      tl.to(2.2, { 'and.k': 0.35, ah: 9.958, ...a3 });
      // The first pass: its disk sweeps over us; the camera rises out of the galaxy to see the tides.
      tl.caption(6.6, 'El choque', 'Las estrellas casi nunca chocan: están demasiado lejos unas de otras. Pero las mareas lanzan colas de millones de estrellas, y el gas comprimido enciende estrellas nuevas.');
      const out1 = vista(new THREE.Vector3(0.5, 0.75, 0.45), new THREE.Vector3(0, 1, 0), a3);
      tl.to(1.6, { 'and.k': 0.4, 'and.dentro': 0, ah: 9.962, e: 20.9, fov: 62, ...out1, roll: out1.roll + 0.2, ...viajeA('andromeda', lugares(0.4).mw.clone().lerp(lugares(0.4).sun, 0.5)) });
      tl.to(2.4, { 'and.k': 0.47, ah: 9.968, e: 21.75, fov: 54, ...vista(new THREE.Vector3(0.45, 0.8, 0.4), new THREE.Vector3(0, 1, 0), out1), ...viajeA('andromeda', new THREE.Vector3()) });
      const out2 = vista(new THREE.Vector3(-0.2, 0.6, 0.8), new THREE.Vector3(0, 1, 0), out1);
      tl.to(2.6, { 'and.k': 0.66, ah: 9.98, e: 21.95, ...out2 });
      // They come back and become one: the camera goes back in.
      tl.caption(6.0, 'Una sola galaxia', 'Si chocan, en unos miles de millones de años se funden en una galaxia elíptica. Desde adentro, el cielo es un resplandor por todas partes.');
      tl.to(2.6, { 'and.k': 0.84, ah: 9.99, e: 21.6, ...vista(new THREE.Vector3(-0.6, 0.5, 0.6), new THREE.Vector3(0, 1, 0), out2) });
      const dIn = new THREE.Vector3(0.3, 0.15, -1).normalize();
      const inEnd = vista(dIn, new THREE.Vector3(0, 1, 0), out2);
      const camIn = 10 ** (20.4 - 21) / 2 / Math.tan(THREE.MathUtils.degToRad(33));
      tl.to(3.4, { 'and.k': 1, 'and.dentro': 1, ah: 10.0, e: 20.4, fov: 66, ...inEnd, ...viajeA('andromeda', OURS_END.clone().addScaledVector(dIn, -(camIn - 0.003))) });
      // The fork: from here on, physics is not sure (the page offers the endings).
      tl.label('bifurcacion');
      // The other endings come sooner (some twenty billion years): the clock holds while one is chosen.
      if (!conUltima) {
        tl.to(4.2, { ah: 10.2, e: 21.4, fov: 56, yaw: 1.5, pitch: 0.3, roll: 0, 'and.dentro': 0, ...viajeA('andromeda', new THREE.Vector3()) });
        return;
      }
      // Out again: one galaxy alone, while every other one reddens and crosses the horizon.
      tl.caption(4.4, 'Un cielo con una sola galaxia', 'Las demás galaxias se alejan cada vez más rápido y cruzan el horizonte. Un astrónomo del futuro no podría saber que hubo un Big Bang.');
      tl.to(4.4, { 'and.sky': 1, 'and.dentro': 0, ah: 11.4, e: 21.3, fov: 54, yaw: 1.6, pitch: 0.2, roll: 0, ...viajeA('andromeda', new THREE.Vector3()) });
      // The last star belongs to the cold ending: back in, among the red dwarfs, until the last.
      tl.caption(5.2, 'La última estrella', 'Las estrellas se apagan una a una, las más grandes primero. Hacia los 10¹⁴ años se apaga la última enana roja.');
      tl.to(5.2, { 'and.last': 1, 'and.dentro': 0.5, ah: 14, e: 20.95, fov: 60, yaw: 1.9, pitch: 0.45, silencio: 0.25, ...viajeA('andromeda', OURS_END.clone().multiplyScalar(0.9)) });
    },
  };
}
