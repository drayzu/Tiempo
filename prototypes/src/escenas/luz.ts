import * as THREE from 'three';
import { Timeline } from '../../../src/engine/timeline';
import { clamp, smoothstep } from '../../../src/lib/math';
import { YEAR, redshift, temperature } from '../../../src/lib/cosmo';
import { bbColor, bbVisible, planck, wienPeak } from '../../../src/lib/cuerpo-negro';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../../../src/lib/glsl';
import { enfocar, materia, materiaBuilder } from '../materia';
import { pantalla, trazos } from '../pantalla';
import { ACCENT, FONT, ink, nota, proyectar, rotulo, viajeDe } from '../placa';
import type { Escena, Frame, Instancia } from '../tipos';
import type { Stage } from '../stage';

/**
 * «Se hace la luz» (≈ 380 000 years). The camera stays where we will be; time passes over it.
 *
 * Before: a plasma of protons, helium and free electrons. Light cannot travel: each photon hits an
 * electron after a tiny step (a random walk, drawn as tangled trails). The background is the
 * radiation itself, at the universe's temperature: white hot, then orange.
 * Then: the electrons fall onto the protons (each capture gives off a photon: a spark). With no free
 * electrons left the fog clears in a cosmic instant and the light flies straight: the oldest light.
 * After: that glow cools, orange, red, infrared; at about three million years it can no longer be
 * seen. Our proton (accent) catches its electron in the middle of it all.
 *
 * Everything follows one clock (`lt`, log10 of seconds): temperature, the fraction of free electrons
 * x_e (a logistic fit around z ≈ 1 180, to be checked against RECFAST), and the light's mean free path.
 */

const LT = (years: number) => Math.log10(years * YEAR);

/** Free-electron fraction at redshift z (fit; to verify). */
const freeFraction = (z: number) => 2e-4 + (1 - 2e-4) / (1 + Math.exp(-(z - 1180) / 60));

/** Scene units travelled by light between collisions (shown, not to scale). */
const meanFreePath = (z: number, xe: number) => (0.07 / xe) * Math.pow(1100 / (1 + z), 3);

const OURS = new THREE.Vector3(0.38, -0.22, -4.2);
const OUR_DELAY = 0.55;
/** Labelled examples for the plate (style C). */
const EX_P = new THREE.Vector3(-1.25, 0.62, -5.4);
const EX_HE = new THREE.Vector3(1.45, 0.82, -6.2);
const EX_E = new THREE.Vector3(-0.6, -0.95, -4.9);

const NEAR = 1.4;
const FAR = 28;

/** The waves of sound in the plasma (baryon acoustic oscillations): a few centres. */
const SOUND_GLSL = /* glsl */ `
  uniform float uWaveT, uSound;
  float sound(vec3 p) {
    float w = 0.0;
    w += sin(5.0 * length(p - vec3(-1.5, 0.8, -7.0)) - uWaveT * 2.2) * exp(-length(p - vec3(-1.5, 0.8, -7.0)) / 5.0);
    w += sin(5.0 * length(p - vec3(2.6, -1.1, -10.0)) - uWaveT * 2.2) * exp(-length(p - vec3(2.6, -1.1, -10.0)) / 5.0);
    w += sin(5.0 * length(p - vec3(0.3, 1.9, -15.0)) - uWaveT * 2.2) * exp(-length(p - vec3(0.3, 1.9, -15.0)) / 5.0);
    w += sin(5.0 * length(p - vec3(-3.5, -2.0, -12.0)) - uWaveT * 2.2) * exp(-length(p - vec3(-3.5, -2.0, -12.0)) / 5.0);
    return w;
  }
`;

/** An electron's wander around its proton while free (shared with the plate, which mirrors it). */
const WANDER_GLSL = /* glsl */ `
  vec3 wander(float s, float t) {
    return vec3(
      sin(t * 7.1 + s * 91.0) + 0.5 * sin(t * 12.7 + s * 37.0),
      cos(t * 8.3 + s * 53.0) + 0.5 * sin(t * 10.9 + s * 71.0),
      sin(t * 6.7 + s * 29.0) + 0.5 * cos(t * 13.1 + s * 17.0)
    ) * 0.06;
  }
`;
const wander = (s: number, t: number, out: THREE.Vector3) =>
  out.set(
    Math.sin(t * 7.1 + s * 91) + 0.5 * Math.sin(t * 12.7 + s * 37),
    Math.cos(t * 8.3 + s * 53) + 0.5 * Math.sin(t * 10.9 + s * 71),
    Math.sin(t * 6.7 + s * 29) + 0.5 * Math.cos(t * 13.1 + s * 17),
  ).multiplyScalar(0.06);

/** Electrons: kind 1 (their proton is `position`); `aDelay` is when, along recombination, each is caught. */
const ELECTRON_MOVE = /* glsl */ `
  if (aKind > 0.5 && aKind < 1.5) {
    float k = smoothstep(aDelay, aDelay + 0.05, uBound);
    vec3 w = wander(seed, uTime) * (1.0 + 0.8 * seed);
    // Caught: it spirals down onto its proton and stays as the atom's soft glow.
    float a = seed * 40.0 + k * 9.0 + uTime * 3.0;
    vec3 orbit = vec3(cos(a), sin(a), sin(a * 0.7)) * 0.012;
    float fall = (1.0 - k) * (1.0 - k);
    p += w * fall + orbit * (1.0 - fall);
    // The photon it gives off when caught.
    float flash = exp(-pow((k - 0.8) / 0.12, 2.0)) * uFlash;
    em = mix(em, uAtom, k) * (1.0 + flash * 9.0);
    sz *= mix(1.0, 1.5, k);
    occ *= mix(1.0, 0.5, k);
  } else if (aKind > 2.5) {
    // Our proton's electron: caught on its own cue.
    float k = smoothstep(0.0, 1.0, uOurs);
    vec3 w = wander(seed, uTime) * 2.2;
    float a = uTime * 2.4 + k * 10.0;
    vec3 orbit = vec3(cos(a), sin(a) * 0.8, sin(a * 0.6)) * 0.02;
    float fall = (1.0 - k) * (1.0 - k);
    p += w * fall + orbit * (1.0 - fall);
    float flash = exp(-pow((k - 0.85) / 0.1, 2.0));
    em = mix(em, uAtom * 1.4, k) * (1.0 + flash * 14.0);
    sz *= mix(1.0, 2.2, k);
  } else {
    // Nuclei barely move (forty times slower than electrons at the same temperature).
    p += wander(seed + 0.37, uTime * 0.12) * 0.12;
  }
  em *= 1.0 + uSound * 0.35 * sound(p);
  // Matter shows by the light that fills the universe: as the glow fades, so does it.
  if (aKind < 2.5) em *= uLit;
`;

const ESTILOS = [
  { key: 'A', nombre: 'Horno', nota: 'El fondo es la temperatura, literal: la pantalla entera es la luz del universo. La materia se ve como motas oscuras contra el fuego, y como luz cuando se apaga.' },
  { key: 'B', nombre: 'Brasa', nota: 'La familia de Potencias: fondo negro, partículas de luz y una tinta incandescente del color de la temperatura que se disipa en una pared lejana.' },
  { key: 'C', nombre: 'Lámina', nota: 'La física dibujada: los caminos de la luz (enredados y luego rectos), el alcance de la luz, el espectro que se corre al infrarrojo. El color, apenas un velo.' },
];

// ---------------------------------------------------------------- backgrounds

const FONDO_A = /* glsl */ `
  uniform vec3 uBB;
  uniform float uFogA, uWall, uWaveT, uSound;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    // Inside the fog: the light within a step or two of us, boiling, breathing with the sound.
    float n = snoise(d * 3.0 + vec3(0.0, 0.0, uTime * 0.05)) * 0.6 + snoise(d * 8.0 - vec3(uTime * 0.04)) * 0.3;
    float ac = sin(uWaveT * 2.2 + snoise(d * 1.6) * 4.0);
    float fog = 1.0 + uFogA * (0.13 * n + uSound * 0.07 * ac);
    // Once clear: the last-scattering wall, far away, with its hot and cold spots (exaggerated).
    float w = snoise(d * 4.5) * 0.6 + snoise(d * 11.0) * 0.3 + snoise(d * 26.0) * 0.12;
    float wall = 1.0 + uWall * 0.12 * w;
    gl_FragColor = vec4(uBB * fog * wall, 1.0);
  }
`;

const FONDO_B = /* glsl */ `
  uniform vec3 uBB;
  uniform float uDens, uWall;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    float n1 = snoise(d * 2.0 + vec3(0.0, 0.0, uTime * 0.035));
    float n2 = snoise(d * 5.0 - vec3(uTime * 0.03, 0.0, 0.0) + n1 * 0.4);
    float n3 = snoise(d * 12.0 + n2 * 0.5);
    float m = clamp(0.5 + 0.34 * n1 + 0.22 * n2 + 0.1 * n3, 0.0, 1.0);
    // Dense, clouds of glowing ink with dark gaps; thinning, only wisps remain, then nothing.
    float inkv = smoothstep(mix(0.82, 0.18, uDens), 1.0, m) * (0.35 + 0.65 * m) * smoothstep(0.0, 0.3, uDens);
    float r = length((vUv - 0.5) * vec2(uAspect, 1.0));
    inkv *= mix(1.0, smoothstep(1.15, 0.05, r), 0.55);
    // The far wall: the oldest light, mottled around its true colour.
    float w = snoise(d * 4.5) * 0.6 + snoise(d * 11.0) * 0.3 + snoise(d * 26.0) * 0.12;
    vec3 hot = uBB * vec3(1.25, 0.95, 0.75);
    vec3 cold = uBB * vec3(0.6, 0.75, 1.35);
    vec3 wall = mix(cold, hot, clamp(0.5 + w * 0.9, 0.0, 1.0)) * (0.75 + 0.25 * smoothstep(1.1, 0.2, r));
    gl_FragColor = vec4(uBB * inkv * 1.7 + wall * uWall, 1.0);
  }
`;

const FONDO_C = /* glsl */ `
  uniform vec3 uBB;
  uniform float uL;
  void main() {
    float r = length((vUv - 0.5) * vec2(uAspect, 1.0));
    vec3 col = vec3(0.012, 0.013, 0.018) + uBB * uL * 0.13 * (1.0 - 0.55 * r);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------- the scene

function montar(stage: Stage, estilo: number): Instancia {
  const A = estilo === 0;
  const B = estilo === 1;
  const C = estilo === 2;
  const { root, camera } = stage;

  // Matter, sampled evenly in the volume the camera sees (and a margin around it).
  const mb = materiaBuilder(301);
  const r = mb.r;
  const tanH = Math.tan(THREE.MathUtils.degToRad(20)) * 1.12;
  const tanW = tanH * 2.1;
  const inView = () => {
    const d = Math.cbrt(NEAR ** 3 + r() * (FAR ** 3 - NEAR ** 3));
    return new THREE.Vector3((r() * 2 - 1) * tanW * d, (r() * 2 - 1) * tanH * d, -d);
  };
  const protonCol = C ? 0xd8d2c4 : 0xfff1dc;
  const heCol = C ? 0xe8c070 : 0xffcf6a;
  const eCol = C ? 0x9fc4ff : 0xbfe0ff;
  const atom = new THREE.Color(C ? 0xbfd2ff : 0xd2e2ff);
  const NP = C ? 7000 : A ? 9000 : 11000;
  const pSize = C ? 0.016 : A ? 0.034 : 0.02;
  const inkK = A ? 1 : 0;
  // Protons, each with its electron.
  const addProton = (v: THREE.Vector3, delay: number) => {
    mb.push(v.x, v.y, v.z, protonCol, pSize, C ? 0.9 : 0.75, { ink: 0.9 * inkK, kind: 0 });
    mb.push(v.x, v.y, v.z, eCol, pSize * 0.55, C ? 0.9 : 1.1, { ink: 0.5 * inkK, kind: 1, delay });
  };
  addProton(EX_P, 0.35);
  addProton(EX_E.clone().add(new THREE.Vector3(0.05, 0, 0)), 0.92);
  for (let i = 0; i < NP; i++) addProton(inView(), r());
  // Helium (about one atom in twelve), already neutral: it caught its electrons earlier.
  const addHe = (v: THREE.Vector3) => mb.push(v.x, v.y, v.z, heCol, pSize * 1.35, C ? 0.9 : 0.85, { ink: inkK, kind: 2 });
  addHe(EX_HE);
  for (let i = 0; i < NP / 12; i++) addHe(inView());
  const matter = materia(mb.data(), {
    pre: `${SOUND_GLSL}\n${WANDER_GLSL}\nuniform float uBound, uOurs, uFlash;\nuniform vec3 uAtom, uLit;`,
    move: ELECTRON_MOVE,
    uniforms: { uBound: { value: 0 }, uOurs: { value: 0 }, uFlash: { value: B ? 1 : A ? 0.5 : 0.6 }, uAtom: { value: atom }, uLit: { value: new THREE.Vector3(1, 1, 1) }, uWaveT: { value: 0 }, uSound: { value: 0 } },
  });
  matter.u.uFogNear.value = A ? 1.5 : 2.2;
  root.add(matter.points);

  // Our proton and its electron (the accent never dissolves in the fog).
  const ob = materiaBuilder(302);
  ob.push(OURS.x, OURS.y, OURS.z, new THREE.Color(ACCENT), 0.034, 2.2, { kind: 0, ink: 0.9 });
  ob.push(OURS.x, OURS.y, OURS.z, new THREE.Color(0xd6e6ff), 0.016, 1.6, { kind: 3 });
  const ours = materia(ob.data(), {
    pre: `${SOUND_GLSL}\n${WANDER_GLSL}\nuniform float uBound, uOurs, uFlash;\nuniform vec3 uAtom, uLit;`,
    move: ELECTRON_MOVE,
    uniforms: { uBound: { value: 0 }, uOurs: { value: 0 }, uFlash: { value: 1 }, uAtom: { value: new THREE.Color(0xc8dcff) }, uLit: { value: new THREE.Vector3(1, 1, 1) }, uWaveT: { value: 0 }, uSound: { value: 0 } },
  });
  ours.u.uMaxPx.value = 40;
  root.add(ours.points);

  // Photons: random walks while the fog lasts, straight lines after.
  const NPH = A ? 0 : B ? 240 : 110;
  const LEN = 32;
  const tr = trazos(Math.max(NPH, 1), LEN);
  if (NPH) root.add(tr.lines);
  const ph = Array.from({ length: NPH }, () => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(), next: 0, trail: new Float32Array(LEN * 3), head: 0 }));
  const rnd = Math.random;
  const randomDir = (v: THREE.Vector3) => {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    return v.set(Math.cos(a) * s, Math.sin(a) * s, z);
  };
  const spawn = (o: (typeof ph)[number]) => {
    const d = 2.2 + Math.pow(rnd(), 1.6) * 14;
    o.pos.set((rnd() * 2 - 1) * tanW * d * 0.95, (rnd() * 2 - 1) * tanH * d * 0.95, -d);
    randomDir(o.dir);
    for (let k = 0; k < LEN; k++) o.trail.set([o.pos.x, o.pos.y, o.pos.z], k * 3);
    o.next = 0;
  };
  ph.forEach(spawn);
  const trailP = new Float32Array(LEN * 3);
  const trailC = new Float32Array(LEN * 3);

  // The background.
  const fondo = pantalla(A ? FONDO_A : B ? FONDO_B : FONDO_C, {
    uBB: { value: new THREE.Vector3() },
    uFogA: { value: 1 },
    uWall: { value: 0 },
    uDens: { value: 1 },
    uL: { value: 1 },
    uWaveT: { value: 0 },
    uSound: { value: 0 },
  });
  root.add(fondo.mesh);

  if (A) {
    stage.finish.uniforms.uVignette.value = 0.3;
  }
  if (C) {
    stage.bloom.strength = 0.35;
  }

  // The choreography: one clock, and the camera leaning in to our proton for its moment.
  const tl = new Timeline({ lt: LT(1.2e5), cam: 0 });
  tl.set({ lt: LT(1.2e5), cam: 0 });
  tl.caption(4.6, 'La niebla', 'Todo es un plasma incandescente: la luz choca con los electrones libres y no puede avanzar.');
  tl.to(4.4, { lt: LT(2.9e5) });
  tl.caption(4.8, 'Se hace la luz', 'Los electrones caen en los protones: nace el hidrógeno, y la luz por fin puede viajar.');
  tl.with(2.2, { cam: 0.62 });
  tl.to(4.6, { lt: LT(4.7e5) });
  tl.caption(5.6, 'El universo deja de brillar', 'Esa luz se enfría: naranja, rojo, infrarrojo. Hacia los tres millones de años ya no se ve. Hoy es el fondo de microondas.');
  tl.with(2.6, { cam: 0 });
  tl.to(5.6, { lt: LT(4.2e6) });
  tl.wait(0.5);

  const bb = { r: 0, g: 0, b: 0 };
  const uBB = fondo.u.uBB.value as THREE.Vector3;
  let waveT = 0;
  let state = { T: 3000, vis: 1, xe: 1, mfp: 0.01, clear: 0, bgL: 1 };
  const tmp = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  return {
    tl,
    viaje: (f) => viajeDe(f.tl.get('lt', f.p)),
    update(f: Frame) {
      const lt = f.tl.get('lt', f.p);
      const t = Math.pow(10, lt);
      const z = redshift(t);
      const T = temperature(t);
      const xe = freeFraction(z);
      const mfp = meanFreePath(z, xe);
      const vis = bbVisible(T);
      bbColor(T, bb);
      // How clear the fog is: 0 while light is trapped within a few steps, 1 once it flies free.
      const clear = smoothstep(Math.log10(0.4), Math.log10(30), Math.log10(mfp));
      // The sound only rings in the plasma; it freezes when the light lets go.
      waveT += f.dt * (1 - clear);

      // Camera: where we are, leaning in towards our proton for its moment.
      const cam = f.tl.get('cam', f.p);
      camPos.copy(OURS).multiplyScalar(cam * 0.9);
      camera.position.copy(camPos);
      camera.lookAt(tmp.copy(OURS).multiplyScalar(0.3 + 0.7 * cam).add(new THREE.Vector3(0, 0, -6 * (1 - cam))));
      camera.fov = 40;
      camera.updateProjectionMatrix();

      // Background brightness: what an eye adapted to the dark would see.
      let bgL = 0;
      if (A) {
        bgL = Math.pow(vis, 1.25);
        const k = 0.02 + 1.2 * Math.pow(bgL, 1.1);
        uBB.set(bb.r * k, bb.g * k, bb.b * k);
        fondo.u.uFogA.value = 1 - clear;
        fondo.u.uWall.value = clear;
        stage.bloom.threshold = 0.6 + 1.6 * bgL;
        stage.bloom.strength = 0.18 + 0.5 * (1 - bgL);
      } else if (B) {
        bgL = vis * 0.35;
        const k = 0.55 * Math.pow(vis, 1.2);
        uBB.set(bb.r * k, bb.g * k, bb.b * k);
        fondo.u.uDens.value = 1 - clear;
        fondo.u.uWall.value = 0.42 * smoothstep(0.1, 0.8, clear);
      } else {
        uBB.set(bb.r, bb.g, bb.b);
        fondo.u.uL.value = Math.pow(vis, 1.1);
      }
      fondo.u.uWaveT.value = waveT;
      fondo.u.uSound.value = 1 - clear;

      for (const n of [matter, ours]) {
        enfocar(n, f.focal, f.dpr, f.time);
        n.u.uBound.value = 1 - xe;
        n.u.uWaveT.value = waveT;
        n.u.uSound.value = (B ? 1 : A ? 0.6 : 0) * (1 - clear);
      }
      // Against bright light our proton keeps a dark core, so its blue still reads.
      ours.u.uInk.value = A ? bgL : B ? 0.7 * vis : 0;
      // Our electron is caught when recombination is halfway through it.
      ours.u.uOurs.value = smoothstep(OUR_DELAY - 0.05, OUR_DELAY + 0.06, 1 - xe);
      if (A) {
        // Against the fire, matter is a speck; in the dark, a spark. Far specks dissolve in the fog.
        matter.u.uInk.value = 0.95 * smoothstep(0.05, 0.4, bgL);
        matter.u.uGain.value = 1 - smoothstep(0.15, 0.6, bgL);
        matter.u.uFog.value = clear > 0.98 ? 0 : 3 + 80 * Math.pow(clear, 2);
        (matter.u.uLit.value as THREE.Vector3).set(bb.r, bb.g, bb.b).multiplyScalar(0.9 * Math.pow(vis, 0.7));
      } else if (B) {
        matter.u.uGain.value = 1;
        matter.u.uFog.value = clear > 0.98 ? 0 : 1.4 + 60 * Math.pow(clear, 2);
        (matter.u.uLit.value as THREE.Vector3).setScalar(0.06 + 0.94 * Math.pow(vis, 0.9));
      } else {
        matter.u.uGain.value = 0.9;
      }

      // Photons.
      if (NPH) {
        const step = 2.3 * f.dt;
        // In the fog the trapped light is the glow itself (B); its paths show once they fly free.
        const light = C ? 0.42 : 1.2 * Math.pow(vis, 0.8) * smoothstep(0.35, 0.95, clear);
        const cr = C ? 0.9 * light : bb.r * light;
        const cg = C ? 0.88 * light : bb.g * light;
        const cb = C ? 0.82 * light : bb.b * light;
        const m = Math.max(mfp, 0.012);
        for (const o of ph) {
          let left = step;
          let hops = 0;
          while (left > 1e-6 && hops < 10) {
            if (o.next <= 0) {
              randomDir(o.dir);
              o.next = -m * Math.log(1 - rnd() * 0.999);
              hops++;
            }
            const s = Math.min(left, o.next);
            o.pos.addScaledVector(o.dir, s);
            o.next -= s;
            left -= s;
          }
          if (left > 1e-6) o.pos.add(randomDir(tmp).multiplyScalar(m * Math.sqrt(left / m) * 0.6));
          const d = -o.pos.z;
          if (d < 1.2 || d > 20 || Math.abs(o.pos.x) > tanW * d * 1.05 || Math.abs(o.pos.y) > tanH * d * 1.05) spawn(o);
          o.head = (o.head + 1) % LEN;
          o.trail.set([o.pos.x, o.pos.y, o.pos.z], o.head * 3);
        }
        for (const [i, o] of ph.entries()) {
          for (let k = 0; k < LEN; k++) {
            const src = ((o.head - k + LEN) % LEN) * 3;
            trailP[k * 3] = o.trail[src];
            trailP[k * 3 + 1] = o.trail[src + 1];
            trailP[k * 3 + 2] = o.trail[src + 2];
            const fade = Math.pow(1 - k / (LEN - 1), 1.5);
            trailC[k * 3] = cr * fade;
            trailC[k * 3 + 1] = cg * fade;
            trailC[k * 3 + 2] = cb * fade;
          }
          tr.strip(i, trailP, trailC);
        }
        tr.commit();
      }
      state = { T, vis, xe, mfp, clear, bgL };
    },
    tinta: () => (A ? smoothstep(0.42, 0.62, state.bgL) : 0),
    placa(g, f) {
      const { u, W, H, camera: cam } = f;
      const inkT = A ? smoothstep(0.42, 0.62, state.bgL) : 0;
      const pr = proyectar(OURS, cam, W, H);
      // Our proton: a fine ring, and its name while the moment lasts.
      const cap = f.tl.captionAt(f.p);
      const ringA = C ? 1 : 0.85;
      g.save();
      g.strokeStyle = ACCENT;
      g.globalAlpha = ringA * 0.8;
      g.lineWidth = Math.max(1, u);
      g.beginPath();
      g.arc(pr.x, pr.y, 13 * u, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      const named = C ? 1 : cap?.name === 'Se hace la luz' ? 1 : 0;
      nota(g, u, pr.x + 9 * u, pr.y - 9 * u, state.xe > 1 - OUR_DELAY ? 'nuestro protón' : 'nuestro protón + su electrón: hidrógeno', 34, -30, inkT, named, ACCENT);

      if (!C) return;
      // Graph-paper marks.
      g.save();
      g.strokeStyle = 'rgba(236,231,219,0.07)';
      g.lineWidth = 1;
      const step = 64 * u;
      for (let x = step / 2; x < W; x += step)
        for (let y = step / 2; y < H; y += step) {
          g.beginPath();
          g.moveTo(x - 3 * u, y);
          g.lineTo(x + 3 * u, y);
          g.moveTo(x, y - 3 * u);
          g.lineTo(x, y + 3 * u);
          g.stroke();
        }
      g.restore();

      // How far light gets: a circle around our proton whose radius is the mean free path.
      const R = Math.min(state.mfp, 60);
      const edge = proyectar(tmp.copy(OURS).add(new THREE.Vector3(R, 0, 0)), cam, W, H);
      const rpx = Math.abs(edge.x - pr.x);
      if (rpx > 2 && rpx < W * 1.5) {
        g.save();
        g.setLineDash([4 * u, 4 * u]);
        g.strokeStyle = ink(0, 0.55);
        g.lineWidth = Math.max(1, u);
        g.beginPath();
        g.arc(pr.x, pr.y, Math.max(rpx, 16 * u), 0, Math.PI * 2);
        g.stroke();
        g.restore();
        const ang = -2.3;
        const ex = pr.x + Math.cos(ang) * Math.max(rpx, 16 * u);
        const ey = pr.y + Math.sin(ang) * Math.max(rpx, 16 * u);
        if (ey > 40 * u && ex > 40 * u) nota(g, u, ex, ey, state.clear < 0.5 ? 'lo que alcanza a viajar la luz' : 'la luz ya viaja sin chocar', -40, -26, 0, 1 - smoothstep(0.85, 1, state.clear) * 0.4);
      }
      // Named examples.
      const pp = proyectar(EX_P, cam, W, H);
      nota(g, u, pp.x, pp.y, state.xe > 0.65 ? 'protón' : 'hidrógeno', -44, -22, 0, 0.9);
      const hp = proyectar(EX_HE, cam, W, H);
      nota(g, u, hp.x, hp.y, 'helio', 40, -20, 0, 0.9);
      const ep = proyectar(tmp.copy(EX_E).add(new THREE.Vector3(0.05, 0, 0)), cam, W, H);
      nota(g, u, ep.x, ep.y, state.xe > 0.1 ? 'electrón libre' : 'hidrógeno', -46, 24, 0, 0.9);
      if (ph.length) {
        const o = ph[7];
        const hp2 = proyectar(o.pos, cam, W, H);
        if (hp2.z < 1 && hp2.x > 60 * u && hp2.x < W - 200 * u && hp2.y > 80 * u && hp2.y < H - 260 * u) nota(g, u, hp2.x, hp2.y, 'fotón', 30, 26, 0, 0.85);
      }

      // The spectrum of the universe's light, its peak sliding out of the visible.
      espectro(g, f, state.T);
    },
    dispose() {},
  };
}

/** A small plate figure: the blackbody spectrum at T, the visible band, and where its peak is. */
function espectro(g: CanvasRenderingContext2D, f: Frame, T: number) {
  const { u, W, H } = f;
  const w = 300 * u;
  const h = 92 * u;
  const x0 = W - 170 * u - w;
  const y0 = H - 46 * u;
  const lmin = Math.log10(100);
  const lmax = Math.log10(30000);
  const X = (nm: number) => x0 + ((Math.log10(nm) - lmin) / (lmax - lmin)) * w;
  const peak = wienPeak(T);
  const bmax = planck(peak, T);
  g.save();
  // Visible band.
  const grad = g.createLinearGradient(X(380), 0, X(750), 0);
  ['#6b2cff', '#2a5bff', '#22c4ff', '#3cff7a', '#e8ff3c', '#ffb02a', '#ff3b2a'].forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
  g.fillStyle = grad;
  g.globalAlpha = 0.75;
  g.fillRect(X(380), y0 + 4 * u, X(750) - X(380), 3 * u);
  g.globalAlpha = 1;
  // Axis.
  g.strokeStyle = ink(0, 0.45);
  g.lineWidth = Math.max(1, u);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x0 + w, y0);
  g.stroke();
  // The curve.
  g.beginPath();
  for (let k = 0; k <= 120; k++) {
    const nm = Math.pow(10, lmin + ((lmax - lmin) * k) / 120);
    const v = planck(nm, T) / bmax;
    g.lineTo(X(nm), y0 - v * h);
  }
  g.strokeStyle = ink(0, 0.9);
  g.stroke();
  // Its part inside the visible, filled with the colour it makes.
  const c = bbColor(T);
  const gam = (x: number) => Math.round(255 * Math.pow(x, 1 / 2.2));
  g.beginPath();
  g.moveTo(X(380), y0);
  for (let nm = 380; nm <= 750; nm += 5) g.lineTo(X(nm), y0 - (planck(nm, T) / bmax) * h);
  g.lineTo(X(750), y0);
  g.closePath();
  g.fillStyle = `rgba(${gam(c.r)},${gam(c.g)},${gam(c.b)},0.55)`;
  g.fill();
  // The peak.
  const px = X(clamp(peak, 100, 30000));
  g.setLineDash([2 * u, 3 * u]);
  g.strokeStyle = ACCENT;
  g.beginPath();
  g.moveTo(px, y0);
  g.lineTo(px, y0 - h - 6 * u);
  g.stroke();
  g.setLineDash([]);
  g.font = FONT.mono(9.5 * u);
  g.letterSpacing = `${1 * u}px`;
  g.fillStyle = ink(0, 0.7);
  g.textAlign = 'left';
  g.fillText('LA LUZ DEL UNIVERSO, POR COLOR', x0, y0 - h - 12 * u);
  const peakTxt = peak < 1000 ? `${Math.round(peak)} nm` : `${(peak / 1000).toFixed(1).replace('.', ',')} µm`;
  const zone = peak < 380 ? 'ultravioleta' : peak < 750 ? 'visible' : 'infrarrojo';
  g.fillStyle = ACCENT;
  g.textAlign = px > x0 + w * 0.6 ? 'right' : 'left';
  g.fillText(`pico: ${peakTxt} · ${zone}`.toUpperCase(), px + (px > x0 + w * 0.6 ? -6 : 6) * u, y0 - h + 2 * u);
  rotulo(g, u, (X(380) + X(750)) / 2, y0 + 17 * u, 'visible', 9, 0, 0.6);
  g.restore();
}

export const luz: Escena = { id: 'luz', nombre: 'Se hace la luz', estilos: ESTILOS, montar };
