import * as THREE from 'three';
import { Timeline } from '../../../src/engine/timeline';
import { gauss, rng, smoothstep } from '../../../src/lib/math';
import { YEAR, temperature } from '../../../src/lib/cosmo';
import { bbColor } from '../../../src/lib/cuerpo-negro';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../../../src/lib/glsl';
import { enfocar, materia, materiaBuilder } from '../materia';
import { pantalla } from '../pantalla';
import { ACCENT, FONT, ink, nota, proyectar, rotulo, viajeDe } from '../placa';
import type { Escena, Frame, Instancia } from '../tipos';
import type { Stage } from '../stage';

/**
 * «La primera estrella» (≈ 100 to 200 million years). The dark ages: nothing shines, the
 * universe's glow is long gone (≈ 60 K, infrared). Dark matter, which does not shine, draws an
 * invisible web (plate: dashed lines) and the gas falls into it. In a knot the gas gathers and
 * heats; a first star lights: a hundred suns, so hot it shines blue (surface ≈ 100 000 K). Its light
 * ionises a bubble around it (a glow along the line of sight, brighter at the front) and pushes the
 * gas out into a shell. After about three million years it explodes and seeds the gas with the first
 * heavy atoms. In other knots, other first stars light up: the cosmic dawn.
 *
 * The same gas all along (`uK` gathers it onto the web, `uC` into the knot, the bubble pushes it out).
 * Our proton is in the gas that falls in: the bubble pushes it out, it does not end in the star.
 */

const LT = (years: number) => Math.log10(years * YEAR);

/** Pop III surface temperature, K (order of magnitude; to verify per mass). */
const T_STAR = 1e5;
const CATCH = 4.6;

interface Web {
  nodes: THREE.Vector3[];
  mass: number[];
  edges: [number, number][];
}

function makeWeb(): Web {
  const r = rng(411);
  const nodes = [new THREE.Vector3(0, 0, 0)];
  const mass = [1.6];
  while (nodes.length < 16) {
    const v = new THREE.Vector3((r() * 2 - 1) * 15, (r() * 2 - 1) * 9.5, -18 + r() * 22);
    if (v.z > 3 && Math.abs(v.x) < 6) continue;
    if (nodes.some((n) => n.distanceTo(v) < 4.2)) continue;
    nodes.push(v);
    mass.push(0.5 + r() * 0.9);
  }
  const edges: [number, number][] = [];
  const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: n.distanceTo(m) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d);
    const k = i === 0 ? 4 : 2 + (r() < 0.4 ? 1 : 0);
    for (const { j } of near.slice(0, k)) if (!has(i, j)) edges.push([i, j]);
  });
  return { nodes, mass, edges };
}

const WEB = makeWeb();
/** Where our proton is: on a filament into the knot, and where it settles before the star lights. */
const OURS_WEB = (() => {
  const [, b] = WEB.edges.find(([a]) => a === 0)!;
  const dir = WEB.nodes[b].clone().normalize();
  return { on: dir.clone().multiplyScalar(2.6), core: dir.clone().multiplyScalar(0.95), dir };
})();

const GAS_MOVE = /* glsl */ `
  // Into the knot: gas in the catchment slides along its filament to the core, nearest first.
  if (aKind > 0.5 && aKind < 1.5) {
    float kc = clamp(uC * 1.7 - aDelay2 * 0.7, 0.0, 1.0);
    kc = kc * kc * (3.0 - 2.0 * kc);
    p = mix(p, aCore, kc);
    em *= 1.0 + kc * uHeat * 2.5;
    em = mix(em, uHot, kc * uHeat);
  }
  if (aKind < 1.5) {
    // The bubble: inside the (irregular) front the gas is ionised and pushed out into a shell.
    vec3 rel = p - uStar;
    float r = length(rel);
    float Rn = uR * front(rel / max(r, 1e-4));
    float inside = (1.0 - smoothstep(Rn * 0.8, Rn * 1.02, r)) * step(0.001, uR);
    float rn = mix(r, Rn * (0.88 + 0.14 * seed), inside * 0.9);
    p = uStar + normalize(rel + 1e-4) * rn;
    // Ionised while the star feeds it; once it dies the gas recombines and goes dark again.
    em = mix(em, uIon, inside * uIonK);
    em *= 1.0 + uIonBoost * inside * uIonK;
    occ *= 1.0 - 0.6 * inside;
  } else if (aKind < 2.5) {
    // Debris of the explosion: out from the star at its own speed, the first heavy atoms.
    float v = 0.35 + 0.65 * seed;
    p = uStar + (position - uStar) * (uSN * v * 3.4 + 0.02);
    em *= step(0.001, uSN) * (1.0 + 4.0 * (1.0 - smoothstep(0.0, 0.25, uSN))) * (1.0 - 0.5 * uSN);
    occ = 0.0;
  } else {
    // The star, and the other first stars, by their own light.
    float on = aKind < 3.5 ? uOn : smoothstep(aDelay, aDelay + 0.08, uOthers);
    em *= on;
    sz *= mix(1.0, 1.6, on);
    occ = 0.0;
  }
`;

/** The ionisation front is not a sphere: denser directions hold it back. Radius factor by direction. */
const FRONT_GLSL = /* glsl */ `
  float front(vec3 dir) {
    return 1.0 + 0.17 * snoise(dir * 1.6 + 3.0) + 0.07 * snoise(dir * 4.2 - 1.0);
  }
`;

const ESTILOS = [
  { key: 'A', nombre: 'Horno', nota: 'Negro de verdad mientras nada brilla. Cuando la estrella se enciende, su luz llena la pantalla y el gas se recorta contra ella, como siluetas.' },
  { key: 'B', nombre: 'Brasa', nota: 'Partículas de luz: el gas cae en la red como polvo frío; la estrella es un punto azul cegador y la burbuja que ioniza brilla rosada, como las nebulosas de hoy.' },
  { key: 'C', nombre: 'Lámina', nota: 'La red de materia oscura dibujada, flechas de gas que cae, la estrella con su ficha, el frente de ionización y la onda de la supernova como círculos medidos.' },
];

// Background: black (the universe at ≈ 60 K), plus what the star does to it.
const FONDO = /* glsl */ `
  uniform vec3 uCam, uStarPos, uIon, uStarCol;
  uniform float uR, uStarL, uScatter, uFlashL, uBubble;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  ${FRONT_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.0);
    // The ionised bubble: hydrogen glows (H-alpha) along the line of sight through it, brightest
    // at its irregular front, clumpy inside.
    vec3 oc = uCam - uStarPos;
    float b = dot(oc, d);
    float RB = uR * 1.3;
    float h = b * b - (dot(oc, oc) - RB * RB);
    if (h > 0.0 && uR > 0.0) {
      float t0 = max(-b - sqrt(h), 0.0);
      float t1 = -b + sqrt(h);
      float dt = (t1 - t0) / 18.0;
      float acc = 0.0;
      for (int i = 0; i < 18; i++) {
        vec3 q = uCam + d * (t0 + (float(i) + 0.5) * dt) - uStarPos;
        float rr = length(q);
        float Rn = uR * front(q / max(rr, 1e-4));
        float inside = smoothstep(Rn, Rn * 0.86, rr);
        float shell = exp(-pow((rr - Rn * 0.95) / (0.07 * uR), 2.0));
        float clump = 0.55 + 0.45 * snoise(q * 1.3 + 7.0);
        acc += (inside * 0.45 + shell * 1.3) * clump * dt / uR;
      }
      col += uIon * acc * uBubble;
    }
    // The star's light, scattered: a halo (wide in the full-bleed style).
    vec3 sd = normalize(uStarPos - uCam);
    float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
    col += uStarCol * uStarL / pow(1.0 + pow(ang / uScatter, 2.0), 1.4);
    col += vec3(1.0, 0.96, 0.9) * uFlashL / (1.0 + pow(ang / 0.5, 2.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function montar(stage: Stage, estilo: number): Instancia {
  const A = estilo === 0;
  const B = estilo === 1;
  const C = estilo === 2;
  const { root, camera } = stage;
  const r = rng(412);

  // ---- the gas, gathered by the web
  const gb = materiaBuilder(413);
  const aCore: number[] = [];
  const aDelay2: number[] = [];
  const gasCol = C ? 0xcfcabd : 0x9fb3d6;
  const NG = C ? 9000 : 30000;
  const size = C ? 0.03 : 0.036;
  const light = C ? 0.6 : A ? 0.34 : 0.42;
  const push = (x: number, y: number, z: number) => {
    const from: [number, number, number] = [x + gauss(r) * 1.4, y + gauss(r) * 1.4, z + gauss(r) * 1.4];
    const d = Math.hypot(x, y, z);
    const caught = d < CATCH;
    gb.push(x, y, z, gasCol, size, light, { from, delay: r() * 0.7, kind: caught ? 1 : 0, ink: A ? 1 : 0 });
    if (caught) {
      const s = 0.12 + 0.25 * (d / CATCH);
      aCore.push(gauss(r) * s, gauss(r) * s, gauss(r) * s);
    } else aCore.push(x, y, z);
    aDelay2.push(d / CATCH);
  };
  const lens = WEB.edges.map(([a, b]) => WEB.nodes[a].distanceTo(WEB.nodes[b]));
  const total = lens.reduce((x, y) => x + y, 0);
  for (let k = 0; k < NG; k++) {
    const q = r();
    if (q < 0.7) {
      // Along a filament (thicker in the middle).
      let pick = r() * total;
      let e = 0;
      while (pick > lens[e]) pick -= lens[e++];
      const [a, b] = WEB.edges[e];
      const t = r();
      const P = WEB.nodes[a].clone().lerp(WEB.nodes[b], t);
      const w = 0.12 + 0.16 * Math.sin(Math.PI * t);
      push(P.x + gauss(r) * w, P.y + gauss(r) * w, P.z + gauss(r) * w);
    } else if (q < 0.88) {
      const i = Math.floor(r() * WEB.nodes.length);
      const n = WEB.nodes[i];
      const s = 0.32 * WEB.mass[i];
      push(n.x + gauss(r) * s, n.y + gauss(r) * s, n.z + gauss(r) * s);
    } else {
      push((r() * 2 - 1) * 16, (r() * 2 - 1) * 10, -18 + r() * 24);
    }
  }
  // Debris (kind 2): the first heavy atoms, at the star, with outward directions.
  const elements = [
    { hex: 0xd9ccff, n: 0.4 },
    { hex: 0xff4a4a, n: 0.4 },
    { hex: 0xffa040, n: 0.2 },
  ];
  for (let k = 0; k < (C ? 1200 : 2600); k++) {
    const [x, y, z] = gb.onSphere();
    const q = r();
    const el = q < elements[0].n ? elements[0] : q < elements[0].n + elements[1].n ? elements[1] : elements[2];
    const rr = 0.35 + 0.65 * Math.pow(r(), 0.5);
    gb.push(x * rr, y * rr, z * rr, el.hex, C ? 0.03 : 0.028, C ? 0.9 : 1.1, { kind: 2 });
    aCore.push(0, 0, 0);
    aDelay2.push(0);
  }
  // The star (kind 3) and the other first stars (kind 4) in other knots.
  const starCol = new THREE.Color().setRGB(0.32, 0.45, 1).lerp(new THREE.Color(1, 1, 1), 0.35);
  for (let k = 0; k < 40; k++) {
    gb.push(gauss(r) * 0.02, gauss(r) * 0.02, gauss(r) * 0.02, starCol, 0.16, 6, { kind: 3 });
    aCore.push(0, 0, 0);
    aDelay2.push(0);
  }
  const others = WEB.nodes.slice(1).filter((n) => n.z < -2).slice(0, 6);
  others.forEach((n, i) => {
    for (let k = 0; k < 12; k++) {
      gb.push(n.x + gauss(r) * 0.03, n.y + gauss(r) * 0.03, n.z + gauss(r) * 0.03, starCol, 0.08, 2.6, { kind: 4, delay: (i / others.length) * 0.85 });
      aCore.push(n.x, n.y, n.z);
      aDelay2.push(0);
    }
  });

  const uni = {
    uC: { value: 0 },
    uHeat: { value: 0 },
    uR: { value: 0 },
    uSN: { value: 0 },
    uOn: { value: 0 },
    uOthers: { value: 0 },
    uIonBoost: { value: C ? 0.6 : 1.6 },
    uIonK: { value: 1 },
    uStar: { value: new THREE.Vector3() },
    uIon: { value: new THREE.Color(C ? 0xffb0c0 : 0xff6f8f).multiplyScalar(B ? 0.5 : 0.4) },
    uHot: { value: new THREE.Color(0xff9a5a) },
  };
  const gas = materia(gb.data(), {
    pre: `attribute vec3 aCore;\nattribute float aDelay2;\nuniform float uC, uHeat, uR, uSN, uOn, uOthers, uIonBoost, uIonK;\nuniform vec3 uStar, uIon, uHot;\n${NOISE_GLSL}\n${SIMPLEX3_GLSL}\n${FRONT_GLSL}`,
    move: GAS_MOVE,
    uniforms: uni,
    extra: { aCore: [new Float32Array(aCore), 3], aDelay2: [new Float32Array(aDelay2), 1] },
  });
  gas.u.uMaxPx.value = 60;
  root.add(gas.points);

  // Our proton: one point, moved here (its path is simple enough to follow on this side).
  const ob = materiaBuilder(414);
  ob.push(0, 0, 0, new THREE.Color(ACCENT), 0.07, 2.4, { ink: 0.9 });
  const ours = materia(ob.data());
  ours.u.uMaxPx.value = 40;
  root.add(ours.points);
  const oursPos = ours.points.geometry.attributes.position as THREE.BufferAttribute;

  // ---- dark matter: the web drawn in the plate's dashes (it does not shine)
  const wp: number[] = [];
  for (const [a, b] of WEB.edges) wp.push(...WEB.nodes[a].toArray(), ...WEB.nodes[b].toArray());
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  const wmat = new THREE.LineDashedMaterial({ color: C ? 0xece7db : 0x8fa4c8, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const web = new THREE.LineSegments(wgeo, wmat);
  web.computeLineDistances();
  web.frustumCulled = false;
  root.add(web);

  // ---- background
  const sc = bbColor(T_STAR);
  const fondo = pantalla(FONDO, {
    uCam: { value: new THREE.Vector3() },
    uStarPos: { value: new THREE.Vector3() },
    uIon: { value: new THREE.Color(0xff5f86) },
    uStarCol: { value: new THREE.Color(sc.r, sc.g, sc.b) },
    uR: { value: 0 },
    uStarL: { value: 0 },
    uScatter: { value: A ? 0.55 : 0.06 },
    uFlashL: { value: 0 },
    uBubble: { value: A ? 0.9 : B ? 0.42 : 0.1 },
  });
  root.add(fondo.mesh);
  if (C) stage.bloom.strength = 0.4;
  if (A) stage.finish.uniforms.uVignette.value = 0.35;

  // ---- choreography
  const tl = new Timeline({ lt: LT(5e7), web: 0, col: 0, star: 0, R: 0, sn: 0, cam: 0, others: 0 });
  tl.set({ lt: LT(5e7), web: 0, col: 0, star: 0, R: 0, sn: 0, cam: 0, others: 0 });
  tl.caption(6.6, 'La edad oscura', 'Nada brilla. La materia oscura, que no se ve, arma una red, y el gas cae en ella.');
  tl.to(4.2, { lt: LT(1.1e8), web: 1 });
  tl.to(2.4, { lt: LT(1.5e8), col: 1, cam: 0.5 });
  tl.label('estrella');
  tl.caption(4.6, 'La primera estrella', 'Cien veces el Sol, tan caliente que brilla azul. Vivirá unos tres millones de años.');
  tl.to(0.7, { lt: LT(1.5003e8), star: 1 });
  tl.to(3.6, { lt: LT(1.525e8), R: 3.4 });
  tl.caption(3.8, 'Muere joven', 'Estalla y siembra el gas con los primeros átomos pesados: carbono, oxígeno, hierro.');
  tl.to(0.5, { lt: LT(1.5255e8), star: 0, sn: 0.12 });
  tl.to(3.2, { lt: LT(1.6e8), sn: 1, cam: 0.15, R: 3.9 });
  tl.caption(3.8, 'El amanecer', 'En otros nudos de la red se encienden otras: el universo vuelve a tener luz propia.');
  tl.to(3.6, { lt: LT(2.5e8), others: 1, cam: 0 });
  tl.wait(0.5);

  const tmp = new THREE.Vector3();
  const star = new THREE.Vector3();
  let st = { on: 0, sn: 0, R: 0, flash: 0 };

  return {
    tl,
    viaje: (f) => viajeDe(f.tl.get('lt', f.p)),
    update(f: Frame) {
      const p = f.p;
      const k1 = f.tl.get('web', p);
      const col = f.tl.get('col', p);
      const on = f.tl.get('star', p);
      const R = f.tl.get('R', p);
      const sn = f.tl.get('sn', p);
      const cam = f.tl.get('cam', p);
      const oth = f.tl.get('others', p);

      camera.position.set(0.6 * cam, 0.35 * cam, 13 - 7 * cam);
      camera.lookAt(0, 0, -1.5 * (1 - cam));
      camera.fov = 40;
      camera.updateProjectionMatrix();

      enfocar(gas, f.focal, f.dpr, f.time);
      enfocar(ours, f.focal, f.dpr, f.time);
      gas.u.uK.value = k1;
      uni.uC.value = col;
      uni.uHeat.value = smoothstep(0.4, 1, col) * (1 - on);
      uni.uR.value = R;
      uni.uSN.value = sn;
      uni.uOn.value = on * (1 + 0.6 * (1 - smoothstep(0, 0.15, R)));
      uni.uOthers.value = oth;

      // The star's light on everything around: a flood in the full-bleed style.
      const flash = sn > 0 ? Math.exp(-Math.pow((sn - 0.06) / 0.07, 2)) : 0;
      const starL = on * (A ? 0.7 : B ? 0.5 : 0.12) * (1 + 1.0 * (1 - smoothstep(0, 0.3, R)));
      fondo.u.uStarL.value = starL;
      fondo.u.uFlashL.value = flash * (A ? 2.2 : B ? 1.6 : 0.4);
      fondo.u.uR.value = R * (sn > 0 ? 1 - 0.55 * smoothstep(0.2, 1, sn) : 1);
      (fondo.u.uCam.value as THREE.Vector3).copy(camera.position);
      (fondo.u.uStarPos.value as THREE.Vector3).copy(star);
      // The bubble glows while the star feeds it, and fades (recombines) after.
      const ionK = on + (1 - on) * (sn > 0 ? 1 - smoothstep(0.05, 0.9, sn) * 0.94 : 0);
      uni.uIonK.value = ionK;
      fondo.u.uBubble.value = (A ? 0.9 : B ? 0.42 : 0.1) * ionK;

      // In the full-bleed style, matter is a silhouette against the light.
      const lightAround = Math.min(1, starL / 0.9 + flash);
      if (A) {
        gas.u.uInk.value = 0.95 * smoothstep(0.05, 0.5, lightAround);
        gas.u.uGain.value = 1 - 0.85 * smoothstep(0.1, 0.6, lightAround);
        stage.bloom.strength = 0.5;
        stage.bloom.threshold = 0.25 + 0.8 * lightAround;
      }
      wmat.opacity = (C ? 0.55 : A ? 0.2 : 0.22) * smoothstep(0.05, 0.6, k1) * (1 - 0.6 * lightAround);

      // Our proton: along its filament, near the knot; then the bubble pushes it out to the shell.
      tmp.copy(OURS_WEB.on).multiplyScalar(1.25).lerp(OURS_WEB.on, smoothstep(0, 1, k1));
      tmp.lerp(OURS_WEB.core, smoothstep(0.1, 0.9, col) * 0.85);
      const d = tmp.length();
      const inside = 1 - smoothstep(R * 0.8, R * 1.02, d);
      tmp.setLength(d + (R * 0.95 - d) * inside * 0.95);
      oursPos.setXYZ(0, tmp.x, tmp.y, tmp.z);
      oursPos.needsUpdate = true;
      ours.u.uInk.value = A ? lightAround : 0;
      st = { on, sn, R, flash };
    },
    tinta: () => (A ? smoothstep(0.35, 0.8, Math.min(1, st.on * 0.9 + st.flash)) : 0),
    placa(g, f) {
      const { u, W, H, camera: cam } = f;
      const inkT = A ? smoothstep(0.35, 0.8, Math.min(1, st.on * 0.9 + st.flash)) : 0;
      const op = oursPos;
      const pr = proyectar(tmp.set(op.getX(0), op.getY(0), op.getZ(0)), cam, W, H);
      g.save();
      g.strokeStyle = ACCENT;
      g.globalAlpha = 0.85;
      g.lineWidth = Math.max(1, u);
      g.beginPath();
      g.arc(pr.x, pr.y, 12 * u, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      const cap = f.tl.captionAt(f.p)?.name;
      nota(g, u, pr.x + 8 * u, pr.y + 8 * u, st.R > 0.5 ? 'nuestro protón, empujado por la luz' : 'nuestro protón', 36, 28, inkT, C || cap === 'La edad oscura' || (cap === 'La primera estrella' && st.R > 1.2) ? 0.95 : 0);

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
      const sp = proyectar(star, cam, W, H);
      // Gas falling in: chevrons sliding along the filaments into the knot.
      const col = f.tl.get('col', f.p);
      const fall = smoothstep(0.2, 0.9, f.tl.get('web', f.p)) * (1 - smoothstep(0.85, 1, col)) * (1 - st.on);
      if (fall > 0.01) {
        g.save();
        g.strokeStyle = ink(0, 0.6 * fall);
        g.lineWidth = Math.max(1, u * 1.1);
        for (const [a, b] of WEB.edges) {
          if (a !== 0 && b !== 0) continue;
          const far = WEB.nodes[a === 0 ? b : a];
          for (let k = 0; k < 4; k++) {
            const t = 1 - ((f.time * 0.12 + k / 4) % 1);
            const P = proyectar(tmp.copy(far).multiplyScalar(t * 0.8 + 0.08), cam, W, H);
            const Q = proyectar(tmp.copy(far).multiplyScalar(t * 0.8 + 0.08 - 0.06), cam, W, H);
            const ang = Math.atan2(Q.y - P.y, Q.x - P.x);
            g.beginPath();
            g.moveTo(Q.x + Math.cos(ang + 2.5) * 6 * u, Q.y + Math.sin(ang + 2.5) * 6 * u);
            g.lineTo(Q.x, Q.y);
            g.lineTo(Q.x + Math.cos(ang - 2.5) * 6 * u, Q.y + Math.sin(ang - 2.5) * 6 * u);
            g.stroke();
          }
        }
        g.restore();
      }
      // Dark matter, named.
      const mid = proyectar(tmp.copy(WEB.nodes[WEB.edges[3][0]]).lerp(WEB.nodes[WEB.edges[3][1]], 0.5), cam, W, H);
      if (st.on < 0.5) nota(g, u, mid.x, mid.y, 'materia oscura: no brilla', 40, -30, 0, smoothstep(0.2, 0.7, f.tl.get('web', f.p)));
      // The star's card.
      if (st.on > 0.05) {
        g.save();
        g.globalAlpha = st.on;
        g.strokeStyle = ACCENT;
        g.lineWidth = Math.max(1, u);
        g.beginPath();
        g.arc(sp.x, sp.y, 9 * u, 0, Math.PI * 2);
        g.stroke();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.beginPath();
          g.moveTo(sp.x + Math.cos(a) * 13 * u, sp.y + Math.sin(a) * 13 * u);
          g.lineTo(sp.x + Math.cos(a) * 19 * u, sp.y + Math.sin(a) * 19 * u);
          g.stroke();
        }
        g.restore();
        nota(g, u, sp.x + 14 * u, sp.y - 14 * u, 'población III · ~100 soles · ~100 000 K', 60, -60, 0, st.on);
      }
      // The ionisation front and the blast, as measured circles.
      const ring = (R: number, label: string, a: number, dash: number[]) => {
        if (R <= 0.02 || a <= 0.01) return;
        const e = proyectar(tmp.copy(star).add(new THREE.Vector3(R, 0, 0)), cam, W, H);
        const rp = Math.abs(e.x - sp.x);
        g.save();
        g.globalAlpha = a;
        g.setLineDash(dash.map((x) => x * u));
        g.strokeStyle = ink(0, 0.7);
        g.lineWidth = Math.max(1, u);
        g.beginPath();
        g.arc(sp.x, sp.y, rp, 0, Math.PI * 2);
        g.stroke();
        g.restore();
        nota(g, u, sp.x - rp * 0.72, sp.y + rp * 0.69, label, -50, 30, 0, a);
      };
      ring(st.R, 'frente de ionización', st.on > 0.5 ? 1 : 0.5 * (1 - st.sn), [5, 4]);
      ring(st.sn * 0.55 * 6 * 0.9, 'onda de la supernova: carbono, oxígeno, hierro', st.sn > 0 ? 1 - smoothstep(0.7, 1, st.sn) * 0.5 : 0, [1.5, 3.5]);
      if (f.tl.get('others', f.p) > 0.1) {
        const n = WEB.nodes.slice(1).filter((x) => x.z < -2)[1];
        const op2 = proyectar(n, cam, W, H);
        nota(g, u, op2.x, op2.y, 'otra primera estrella', 36, -26, 0, smoothstep(0.1, 0.4, f.tl.get('others', f.p)));
      }
      rotulo(g, u, W / 2, 40 * u, `fondo del universo: ${Math.round(temperature(Math.pow(10, f.tl.get('lt', f.p))))} K · infrarrojo lejano, negro a la vista`, 9.5, 0, 0.55);
      void FONT;
    },
    dispose() {},
  };
}

export const estrella: Escena = { id: 'estrella', nombre: 'La primera estrella', estilos: ESTILOS, montar };
