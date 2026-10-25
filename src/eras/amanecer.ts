import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { bbColor } from '../lib/cuerpo-negro';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../lib/glsl';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { ACCENT, ink, nota } from '../engine/placa';

/**
 * La primera estrella (≈ 60 to 250 million years). 1 unit ≈ 10¹⁹·⁵ m (about 10 000 light-years
 * comoving). Phase-0 study, style chosen: Brasa as the base, the Horno flood when the star lights.
 *
 * The dark ages: nothing shines (the universe's glow is ≈ 60 K, infrared). Dark matter, which does
 * not shine, draws an invisible web (plate: dashed lines) and the gas falls into it. In a knot the
 * gas gathers and heats; a first star lights: about a hundred suns, so hot it shines blue (surface
 * ≈ 100 000 K). Its light floods everything for a moment, then ionises a bubble (glowing pink along
 * the line of sight, brightest at its irregular front) and pushes the gas out into a shell. After
 * about three million years it explodes and seeds the gas with the first heavy atoms; the gas
 * recombines and goes dark again. In other knots other first stars light up: the cosmic dawn.
 * Our proton falls in with the gas; the bubble pushes it out: it does not end in the star.
 */

const LT = (years: number) => Math.log10(years * YEAR);
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
  while (nodes.length < 18) {
    const v = new THREE.Vector3((r() * 2 - 1) * 16, (r() * 2 - 1) * 10, (r() * 2 - 1) * 16);
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
const OURS_WEB = (() => {
  const [, b] = WEB.edges.find(([a]) => a === 0)!;
  const dir = WEB.nodes[b].clone().normalize();
  return { on: dir.clone().multiplyScalar(2.6), core: dir.clone().multiplyScalar(0.95) };
})();
const OTHERS = WEB.nodes.slice(1).filter((n) => n.z < 2).slice(0, 7);

/** The ionisation front is not a sphere: denser directions hold it back. */
const FRONT_GLSL = /* glsl */ `
  float front(vec3 dir) {
    return 1.0 + 0.17 * snoise(dir * 1.6 + 3.0) + 0.07 * snoise(dir * 4.2 - 1.0);
  }
`;

const GAS_MOVE = /* glsl */ `
  if (aKind > 0.5 && aKind < 1.5) {
    float kc = clamp(uC * 1.7 - aDelay2 * 0.7, 0.0, 1.0);
    kc = kc * kc * (3.0 - 2.0 * kc);
    p = mix(p, aCore, kc);
    em *= 1.0 + kc * uHeat * 2.5;
    em = mix(em, uHot, kc * uHeat);
  }
  if (aKind < 1.5) {
    vec3 rel = p - uStar;
    float r = length(rel);
    float Rn = uR * front(rel / max(r, 1e-4));
    float inside = (1.0 - smoothstep(Rn * 0.8, Rn * 1.02, r)) * step(0.001, uR);
    float rn = mix(r, Rn * (0.88 + 0.14 * seed), inside * 0.9);
    p = uStar + normalize(rel + 1e-4) * rn;
    // Ionised while the star feeds it; once it dies the gas recombines and goes dark again.
    em = mix(em, uIon, inside * uIonK);
    em *= 1.0 + 1.6 * inside * uIonK;
    occ *= 1.0 - 0.6 * inside;
  } else if (aKind < 2.5) {
    float v = 0.35 + 0.65 * seed;
    p = uStar + (position - uStar) * (uSN * v * 3.4 + 0.02);
    em *= step(0.001, uSN) * (1.0 + 4.0 * (1.0 - smoothstep(0.0, 0.25, uSN))) * (1.0 - 0.5 * uSN);
    occ = 0.0;
  } else {
    float on = aKind < 3.5 ? uOn : smoothstep(aDelay, aDelay + 0.08, uOthers);
    em *= on;
    sz *= mix(1.0, 1.6, on);
    occ = 0.0;
  }
`;

/** The star's light and its bubble, drawn at the back of the scene (it sits in camera space). */
const GLOW_VERT = /* glsl */ `
  uniform float uTanHalf, uAspect;
  varying vec3 vDir;
  void main() {
    vec2 s = (uv * 2.0 - 1.0) * vec2(uAspect * uTanHalf, uTanHalf);
    vDir = vec3(s, -1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const GLOW_FRAG = /* glsl */ `
  uniform vec3 uCam, uStarPos, uIon, uStarCol;
  uniform float uR, uStarL, uScatter, uFlashL, uBubble;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  ${FRONT_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.0);
    vec3 oc = uCam - uStarPos;
    float b = dot(oc, d);
    float RB = uR * 1.3;
    float h = b * b - (dot(oc, oc) - RB * RB);
    if (h > 0.0 && uR > 0.0 && uBubble > 0.001) {
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
        float clump = 0.55 + 0.45 * snoise(q / uR * 4.0 + 7.0);
        acc += (inside * 0.45 + shell * 1.3) * clump * dt / uR;
      }
      col += uIon * acc * uBubble;
    }
    vec3 sd = normalize(uStarPos - uCam);
    float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
    col += uStarCol * uStarL / pow(1.0 + pow(ang / uScatter, 2.0), 1.4);
    col += vec3(1.0, 0.96, 0.9) * uFlashL / (1.0 + pow(ang / 0.5, 2.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function amanecer(): EraModule {
  return {
    spec: {
      id: 'amanecer',
      acto: 'Oscuridad y amanecer',
      certeza: 'T',
      name: 'La edad oscura',
      fact: 'Nada brilla. La materia oscura, que no se ve, arma una red, y el gas cae en ella.',
      label: 'primera estrella',
      unitExp: 19.5,
      frame: 12,
      frameCenter: new THREE.Vector3(),
      fade: [0.6, 0.5],
      tint: 0x8fa4c8,
      notes: [{ at: WEB.nodes[WEB.edges[3][0]].clone().lerp(WEB.nodes[WEB.edges[3][1]], 0.5).toArray(), text: 'materia oscura: no brilla' }],
      generate() {
        const r = rng(412);
        const gb = materiaBuilder(413);
        const aCore: number[] = [];
        const aDelay2: number[] = [];
        const push = (x: number, y: number, z: number) => {
          const from: [number, number, number] = [x + gauss(r) * 1.4, y + gauss(r) * 1.4, z + gauss(r) * 1.4];
          const d = Math.hypot(x, y, z);
          const caught = d < CATCH;
          gb.push(x, y, z, 0x9fb3d6, 0.036, 0.42, { from, delay: r() * 0.7, kind: caught ? 1 : 0, ink: 1 });
          if (caught) {
            const s = 0.12 + 0.25 * (d / CATCH);
            aCore.push(gauss(r) * s, gauss(r) * s, gauss(r) * s);
          } else aCore.push(x, y, z);
          aDelay2.push(d / CATCH);
        };
        const lens = WEB.edges.map(([a, b]) => WEB.nodes[a].distanceTo(WEB.nodes[b]));
        const total = lens.reduce((x, y) => x + y, 0);
        for (let k = 0; k < 34000; k++) {
          const q = r();
          if (q < 0.7) {
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
          } else push((r() * 2 - 1) * 18, (r() * 2 - 1) * 11, (r() * 2 - 1) * 18);
        }
        // The first heavy atoms (kind 2): carbon, oxygen, iron, in Potencias' colours.
        for (let k = 0; k < 2600; k++) {
          const [x, y, z] = gb.onSphere();
          const q = r();
          const hex = q < 0.4 ? 0xd9ccff : q < 0.8 ? 0xff4a4a : 0xffa040;
          const rr = 0.35 + 0.65 * Math.pow(r(), 0.5);
          gb.push(x * rr, y * rr, z * rr, hex, 0.028, 1.1, { kind: 2 });
          aCore.push(0, 0, 0);
          aDelay2.push(0);
        }
        // The star (kind 3) and the other first stars (kind 4).
        const starCol = new THREE.Color().setRGB(0.32, 0.45, 1).lerp(new THREE.Color(1, 1, 1), 0.35);
        for (let k = 0; k < 40; k++) {
          gb.push(gauss(r) * 0.02, gauss(r) * 0.02, gauss(r) * 0.02, starCol, 0.16, 6, { kind: 3, star: true });
          aCore.push(0, 0, 0);
          aDelay2.push(0);
        }
        OTHERS.forEach((n, i) => {
          for (let k = 0; k < 12; k++) {
            gb.push(n.x + gauss(r) * 0.03, n.y + gauss(r) * 0.03, n.z + gauss(r) * 0.03, starCol, 0.08, 2.6, { kind: 4, delay: (i / OTHERS.length) * 0.85, star: true });
            aCore.push(n.x, n.y, n.z);
            aDelay2.push(0);
          }
        });
        // Dark matter: the web's lines.
        const wp: number[] = [];
        for (const [a, b] of WEB.edges) wp.push(...WEB.nodes[a].toArray(), ...WEB.nodes[b].toArray());
        return { gas: gb.data(), aCore: new Float32Array(aCore), aDelay2: new Float32Array(aDelay2), web: new Float32Array(wp) };
      },
      assemble(data) {
        const uni = {
          uC: { value: 0 },
          uHeat: { value: 0 },
          uR: { value: 0 },
          uSN: { value: 0 },
          uOn: { value: 0 },
          uOthers: { value: 0 },
          uIonK: { value: 1 },
          uStar: { value: new THREE.Vector3() },
          uIon: { value: new THREE.Color(0xff6f8f).multiplyScalar(0.5) },
          uHot: { value: new THREE.Color(0xff9a5a) },
        };
        const gas = materia(data.gas as MateriaData, {
          pre: `attribute vec3 aCore;\nattribute float aDelay2;\nuniform float uC, uHeat, uR, uSN, uOn, uOthers, uIonK;\nuniform vec3 uStar, uIon, uHot;\n${NOISE_GLSL}\n${SIMPLEX3_GLSL}\n${FRONT_GLSL}`,
          move: GAS_MOVE,
          uniforms: uni,
          extra: { aCore: [data.aCore as Float32Array, 3], aDelay2: [data.aDelay2 as Float32Array, 1] },
        });
        gas.u.uMaxPx.value = 60;
        gas.u.uNear.value = 1;

        const wgeo = new THREE.BufferGeometry();
        wgeo.setAttribute('position', new THREE.BufferAttribute(data.web as Float32Array, 3));
        const wmat = new THREE.LineDashedMaterial({ color: 0x8fa4c8, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
        const web = new THREE.LineSegments(wgeo, wmat);
        web.computeLineDistances();
        web.frustumCulled = false;

        const sc = bbColor(T_STAR);
        const gu = {
          uTanHalf: { value: 0.47 },
          uAspect: { value: 16 / 9 },
          uCam: { value: new THREE.Vector3() },
          uStarPos: { value: new THREE.Vector3() },
          uIon: { value: new THREE.Color(0xff5f86) },
          uStarCol: { value: new THREE.Color(sc.r, sc.g, sc.b) },
          uR: { value: 0 },
          uStarL: { value: 0 },
          uScatter: { value: 0.06 },
          uFlashL: { value: 0 },
          uBubble: { value: 0 },
        };
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: gu, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        glow.frustumCulled = false;
        glow.renderOrder = -50;

        const object = new THREE.Group();
        object.add(glow, web, gas.points);
        const tmp = new THREE.Vector3();
        const ours = new THREE.Vector3();
        const star = new THREE.Vector3();
        const st = { on: 0, sn: 0, R: 0, flash: 0, light: 0 };
        return {
          object,
          clouds: [gas],
          update(f) {
            const g = (k: string) => f.tl.get(`ama.${k}`, f.p);
            const k1 = g('web');
            const col = g('col');
            const on = g('star');
            const R = g('R');
            const sn = g('sn');
            const oth = g('others');
            const flood = g('flood');
            gas.u.uAssemble.value = k1;
            uni.uC.value = col;
            uni.uHeat.value = smoothstep(0.4, 1, col) * (1 - on);
            uni.uR.value = R;
            uni.uSN.value = sn;
            uni.uOn.value = on * (1 + 0.6 * (1 - smoothstep(0, 0.15, R)));
            uni.uOthers.value = oth;
            const flash = sn > 0 ? Math.exp(-Math.pow((sn - 0.06) / 0.07, 2)) : 0;
            const ionK = on + (1 - on) * (sn > 0 ? 1 - smoothstep(0.05, 0.9, sn) * 0.94 : 0);
            uni.uIonK.value = ionK;

            // The glow sits in camera space: the star and the camera in world units.
            const cam = f.camera;
            gu.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
            gu.uAspect.value = cam.aspect;
            gu.uCam.value.copy(cam.position);
            object.updateMatrixWorld();
            gu.uStarPos.value.copy(star).applyMatrix4(object.matrixWorld);
            const scale = tmp.setFromMatrixColumn(object.matrixWorld, 0).length();
            gu.uR.value = R * scale * (sn > 0 ? 1 - 0.55 * smoothstep(0.2, 1, sn) : 1);
            // The flood (Horno): the star's light fills the screen for a moment; then a bright point.
            const starL = on * (0.26 + 0.22 * flood) * (1 + 0.8 * (1 - smoothstep(0, 0.3, R)));
            gu.uStarL.value = starL * f.alpha;
            gu.uScatter.value = 0.06 + 0.5 * flood;
            gu.uFlashL.value = flash * (1.0 + 0.4 * flood) * f.alpha;
            gu.uBubble.value = (0.42 + 0.45 * flood) * ionK * f.alpha;
            // Against the flood, the gas is a silhouette.
            const light = Math.min(1, flood * (starL / 0.45) + flash);
            gas.u.uInk.value = 0.95 * smoothstep(0.05, 0.5, light);
            gas.u.uGain.value = 1 - 0.85 * smoothstep(0.1, 0.6, light);
            wmat.opacity = 0.22 * smoothstep(0.05, 0.6, k1) * (1 - 0.6 * light) * f.alpha;

            // Our proton: along its filament, near the knot; then the bubble pushes it out to the shell.
            ours.copy(OURS_WEB.on).multiplyScalar(1.25).lerp(OURS_WEB.on, smoothstep(0, 1, k1));
            ours.lerp(OURS_WEB.core, smoothstep(0.1, 0.9, col) * 0.85);
            const d = ours.length();
            const inside = 1 - smoothstep(R * 0.8, R * 1.02, d);
            ours.setLength(d + (R * 0.95 - d) * inside * 0.95);
            Object.assign(st, { on, sn, R, flash, light });
          },
          proton: () => ours,
          tinta: (f) => smoothstep(0.35, 0.8, Math.min(1, f.tl.get('ama.flood', f.p) * f.tl.get('ama.star', f.p) * 0.9 + st.flash)),
          placa(g, f, on, toScreen) {
            if (!on || f.alpha < 0.4) return;
            const { u } = f;
            const sp = toScreen(star);
            if (st.on > 0.05 && sp.z < 1) nota(g, u, sp.x + 14 * u, sp.y - 14 * u, 'población III · ~100 soles · ~100 000 K', 60, -60, 0, st.on);
            const ring = (R: number, label: string, a: number, dash: number[]) => {
              if (R <= 0.02 || a <= 0.01 || sp.z > 1) return;
              const e = toScreen(tmp.copy(star).add(new THREE.Vector3(R, 0, 0)));
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
            ring(st.sn * 0.55 * 3.4 * 0.9, 'onda de la supernova: carbono, oxígeno, hierro', st.sn > 0 ? 1 - smoothstep(0.7, 1, st.sn) * 0.5 : 0, [1.5, 3.5]);
            void ACCENT;
          },
        };
      },
    },
    choreo(tl, era) {
      // From the dark ages' smooth gas, zooming out to the web where the first knots form.
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'ama.web': 0, 'ama.col': 0, 'ama.star': 0, 'ama.R': 0, 'ama.sn': 0, 'ama.others': 0, 'ama.flood': 0 });
      tl.to(3.4, { era: era.index, e: era.home + 0.12, lt: LT(6e7), fondo: 1, horno: 0, fov: 50, yaw: 0.2, pitch: 0.1, roll: 0 });
      tl.label('amanecer');
      tl.caption(6.6, 'La edad oscura', 'Nada brilla. La materia oscura, que no se ve, arma una red, y el gas cae en ella.');
      tl.to(4.2, { lt: LT(1.1e8), 'ama.web': 1, yaw: 0.05, pitch: 0.05 });
      // Into the knot, first person: the camera follows the gas in.
      tl.to(2.4, { lt: LT(1.5e8), 'ama.col': 1, e: era.home - 0.22, 'amanecer.fx': 0.4, 'amanecer.fy': 0.25, yaw: 0, pitch: 0 });
      tl.caption(4.6, 'La primera estrella', 'Cien veces el Sol, tan caliente que brilla azul. Vivirá unos tres millones de años.');
      // It lights: its light floods everything (Horno), then settles into a bright point in its bubble.
      tl.to(0.7, { lt: LT(1.5003e8), 'ama.star': 1, 'ama.flood': 1, bloom: 0.3, umbral: 0.6 });
      tl.to(3.6, { lt: LT(1.525e8), 'ama.R': 3.4, 'ama.flood': 0.15, e: era.home - 0.05, roll: 0.06, bloom: 0.6, umbral: 0.15 });
      tl.caption(3.8, 'Muere joven', 'Estalla y siembra el gas con los primeros átomos pesados: carbono, oxígeno, hierro.');
      tl.to(0.5, { lt: LT(1.5255e8), 'ama.star': 0, 'ama.sn': 0.12, 'ama.flood': 0.6 });
      tl.to(3.2, { lt: LT(1.6e8), 'ama.sn': 1, 'ama.R': 3.9, 'ama.flood': 0, e: era.home + 0.05, 'amanecer.fx': 0, 'amanecer.fy': 0, roll: 0 });
      tl.caption(3.8, 'El amanecer', 'En otros nudos de la red se encienden otras: el universo vuelve a tener luz propia.');
      tl.to(3.6, { lt: LT(2.5e8), 'ama.others': 1, e: era.home + 0.2, yaw: -0.35, pitch: 0.12 });
    },
  };
}
