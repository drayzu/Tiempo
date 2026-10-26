import * as THREE from 'three';
import { rng, smoothstep } from '../lib/math';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../lib/glsl';
import type { EraModule } from '../engine/eras';
import { nota } from '../engine/placa';

/**
 * Nada pesa → el Higgs se enciende (≈ 10⁻³² to 10⁻¹¹ s). 1 unit = 10⁻¹⁸ m.
 *
 * Inflation ends and its energy turns into particles and light (reheating: the flash). In the
 * Standard Model no elementary particle has mass yet: quarks, leptons, gluons, light, the W, Z and
 * Higgs bosons, all fly at the speed of light. The camera flies through them, first person: streaks
 * in every direction, in their colours (quarks red, green and blue; gluons gold; light white;
 * leptons ice-blue; the heavy bosons violet). At about 10⁻¹² s and 10¹⁵ K the Higgs field takes a
 * value everywhere at once (in the Standard Model a smooth crossover, not bubbles): a faint golden
 * medium. Quarks, leptons and the W and Z gain mass and can no longer go at the speed of light (their
 * streaks shrink into points that jitter); the heavy bosons decay in small flashes; gluons and light
 * stay massless and keep streaking. The quarks the camera then flies through are the plasma's.
 *
 * Every streak is computed on the GPU from its start, direction and the distance travelled, wrapped
 * in a box around the focus, so the flow never runs out.
 */

const N = 7000;
const HALF = 34;
const QCOL = [0xff4a5e, 0x4aff9a, 0x4a8cff];
/** Kinds: 0 quark, 1 lepton, 2 gluon, 3 light, 4 heavy boson. */
const COLOR = (kind: number, r: () => number) => (kind === 0 ? QCOL[Math.floor(r() * 3)] : kind === 1 ? 0xbfd8ff : kind === 2 ? 0xffd88a : kind === 3 ? 0xfff6e8 : 0xc89aff);

const SHARED = /* glsl */ `
  attribute vec3 aP0, aDir, aCol;
  attribute float aKind, aSeed;
  uniform float uS, uMass, uLen, uAlpha, uTime, uHalf;
  uniform vec3 uCenter;
  // The heavy bosons decay once massive, each at its own moment.
  float decayed() { return aKind > 3.5 ? smoothstep(0.35 + 0.45 * aSeed, 0.4 + 0.45 * aSeed, uMass) : 0.0; }
  float massive() { return (aKind < 1.5 || aKind > 3.5) ? 1.0 : 0.0; }
  vec3 head() {
    float m = massive() * uMass;
    // Distance travelled: all at the speed of light until they gain mass; then the massive ones
    // nearly stop (on this scale), jittering.
    float s = uS * mix(1.0, 0.02, m) + aSeed * 97.0;
    vec3 q = aP0 + aDir * s - uCenter;
    q = mod(q + uHalf, 2.0 * uHalf) - uHalf;
    vec3 jit = vec3(sin(uTime * 7.3 + aSeed * 71.0), cos(uTime * 6.1 + aSeed * 37.0), sin(uTime * 8.7 + aSeed * 19.0)) * 0.12 * m;
    return uCenter + q + jit;
  }
`;

const LINE_VERT = /* glsl */ `
  attribute float aEnd;
  varying vec3 vCol;
  ${SHARED}
  void main() {
    float m = massive() * uMass;
    float len = uLen * (1.0 - m) * (0.6 + 0.8 * aSeed);
    vec3 h = head();
    vec3 p = h - aDir * len * (1.0 - aEnd);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // The head is bright, the tail fades; shorter streaks fade out (the point takes over).
    float fade = mix(0.0, 1.0, aEnd) * smoothstep(0.05, 0.4, len / uLen);
    float edge = 1.0 - smoothstep(uHalf * 0.6, uHalf, length(h - uCenter));
    // The plasma is opaque: near streaks are crisp, far ones dissolve into its glow.
    float depth = -mv.z / length(modelMatrix[0].xyz);
    float fog = exp(-max(depth - 3.0, 0.0) / 11.0) * smoothstep(0.6, 2.8, depth);
    vCol = aCol * fade * edge * fog * uAlpha * (1.0 - decayed()) * 1.5;
  }
`;
const LINE_FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() { gl_FragColor = vec4(vCol, 1.0); }
`;

const POINT_VERT = /* glsl */ `
  uniform float uFocal, uMinPx, uSize;
  varying vec3 vCol;
  ${SHARED}
  void main() {
    float m = massive() * uMass;
    vec3 h = head();
    vec4 mv = modelViewMatrix * vec4(h, 1.0);
    gl_Position = projectionMatrix * mv;
    float scale = length(modelMatrix[0].xyz);
    float px = uSize * (0.6 + 0.9 * m) * (aKind > 3.5 ? 1.8 : 1.0) * scale * uFocal / max(-mv.z, 1e-5);
    float d = decayed();
    float flash = d > 0.0 && d < 1.0 ? 8.0 * (1.0 - d) : 0.0;
    gl_PointSize = clamp(px * (1.0 + flash * 0.3), uMinPx, 40.0);
    float dim = min(1.0, px * px / (uMinPx * uMinPx));
    float edge = 1.0 - smoothstep(uHalf * 0.6, uHalf, length(h - uCenter));
    // Near the lens, points thin out (flying through them must not turn into a fog of discs).
    float near = smoothstep(0.4, 2.5, -mv.z / scale);
    float fog = exp(-max(-mv.z / scale - 3.0, 0.0) / 11.0);
    vCol = aCol * (0.55 + 0.9 * m + flash) * dim * edge * near * fog * uAlpha * (1.0 - step(0.999, d));
  }
`;
const POINT_FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    gl_FragColor = vec4(vCol * exp(-dot(c, c) * 14.0), 1.0);
  }
`;

/** The Higgs field: a faint golden medium filling space once it takes its value (camera space). */
const FIELD_VERT = /* glsl */ `
  uniform float uTanHalf, uAspect;
  varying vec3 vDir;
  void main() {
    vec2 s = (uv * 2.0 - 1.0) * vec2(uAspect * uTanHalf, uTanHalf);
    vDir = vec3(s, -1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const FIELD_FRAG = /* glsl */ `
  uniform float uField, uTravel, uTime, uFlash;
  uniform vec3 uGold, uFlashCol;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    // Three depths of the same grain, drifting past as the camera flies (parallax).
    float h = 0.0;
    for (int i = 0; i < 3; i++) {
      float k = float(i);
      vec2 uv = d.xy / max(-d.z, 0.2) * (1.6 + k * 1.3);
      h += (0.55 + 0.45 * snoise(vec3(uv * 3.0, uTravel * (0.05 + k * 0.02) + k * 7.0 + uTime * 0.05))) / (1.0 + k);
    }
    float r = length(d.xy);
    vec3 col = uGold * uField * (0.05 + 0.06 * h) * (0.75 + 0.5 * r);
    // The reheating: the whole view flares as inflation's energy turns into matter, bursting outward.
    float ang = atan(d.y, d.x);
    float rad = length(d.xy) / max(-d.z, 0.2);
    float rays = pow(abs(sin(ang * 11.0 + snoise(vec3(ang * 2.0, uTime * 0.3, 1.0)) * 1.6)), 8.0) + 0.6 * pow(abs(sin(ang * 27.0 + 1.3)), 14.0);
    col += uFlashCol * uFlash * (0.05 + 0.6 * exp(-rad * 2.4) + rays * 1.1 * exp(-rad * 0.45));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function higgs(): EraModule {
  return {
    spec: {
      id: 'higgs',
      acto: 'El primer segundo',
      certeza: 'T',
      name: 'El campo de Higgs',
      fact: 'Antes de que se encienda, nada tiene masa: todo vuela a la velocidad de la luz.',
      ficha: ['transición electrodébil: ~10⁻¹² s, ~10¹⁵ K', 'el bosón de Higgs: descubierto en el LHC en 2012', 'en algún momento antes, la materia le ganó a la antimateria: no se sabe cómo'],
      label: 'Higgs',
      unitExp: -18,
      frame: 30,
      frameCenter: new THREE.Vector3(),
      fade: [0.45, 0.5],
      fadeE: [-18, -16, 3, 4.5],
      tint: 0xffe2a0,
      generate() {
        const r = rng(2011);
        const p0 = new Float32Array(N * 3);
        const dir = new Float32Array(N * 3);
        const col = new Float32Array(N * 3);
        const kind = new Float32Array(N);
        const seed = new Float32Array(N);
        const c = new THREE.Color();
        for (let i = 0; i < N; i++) {
          const q = r();
          // Mostly quarks and gluons (they have the most ways to be), then leptons, light, a few bosons.
          const k = q < 0.38 ? 0 : q < 0.6 ? 2 : q < 0.78 ? 1 : q < 0.95 ? 3 : 4;
          kind[i] = k;
          p0.set([(r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF, (r() * 2 - 1) * HALF], i * 3);
          const u = r() * 2 - 1;
          const a = r() * Math.PI * 2;
          const s = Math.sqrt(1 - u * u);
          dir.set([Math.cos(a) * s, Math.sin(a) * s, u], i * 3);
          c.setHex(COLOR(k, r)).multiplyScalar((k === 3 ? 0.9 : 0.75) * (0.7 + 0.6 * r()));
          col.set([c.r, c.g, c.b], i * 3);
          seed[i] = r();
        }
        return { p0, dir, col, kind, seed };
      },
      assemble(data) {
        const d = data as Record<string, Float32Array>;
        const uni = {
          uS: { value: 0 },
          uMass: { value: 0 },
          uLen: { value: 2.6 },
          uAlpha: { value: 1 },
          uTime: { value: 0 },
          uHalf: { value: HALF },
          uCenter: { value: new THREE.Vector3() },
          uFocal: { value: 1000 },
          uMinPx: { value: 1.6 },
          uSize: { value: 0.16 },
        };
        // Streaks: two vertices per particle (tail, head).
        const lg = new THREE.BufferGeometry();
        const two = (arr: Float32Array, n: number) => {
          const out = new Float32Array(arr.length * 2);
          for (let i = 0; i < arr.length / n; i++) for (let j = 0; j < 2; j++) out.set(arr.subarray(i * n, i * n + n), (i * 2 + j) * n);
          return out;
        };
        const end = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) end[i * 2 + 1] = 1;
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
        lg.setAttribute('aP0', new THREE.BufferAttribute(two(d.p0, 3), 3));
        lg.setAttribute('aDir', new THREE.BufferAttribute(two(d.dir, 3), 3));
        lg.setAttribute('aCol', new THREE.BufferAttribute(two(d.col, 3), 3));
        lg.setAttribute('aKind', new THREE.BufferAttribute(two(d.kind, 1), 1));
        lg.setAttribute('aSeed', new THREE.BufferAttribute(two(d.seed, 1), 1));
        lg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
        const blend = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending };
        const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: uni, ...blend }));
        lines.frustumCulled = false;
        // Heads: one point per particle.
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        pg.setAttribute('aP0', new THREE.BufferAttribute(d.p0, 3));
        pg.setAttribute('aDir', new THREE.BufferAttribute(d.dir, 3));
        pg.setAttribute('aCol', new THREE.BufferAttribute(d.col, 3));
        pg.setAttribute('aKind', new THREE.BufferAttribute(d.kind, 1));
        pg.setAttribute('aSeed', new THREE.BufferAttribute(d.seed, 1));
        const points = new THREE.Points(pg, new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: uni, ...blend }));
        points.frustumCulled = false;

        const fu = {
          uTanHalf: { value: 0.5 },
          uAspect: { value: 16 / 9 },
          uField: { value: 0 },
          uTravel: { value: 0 },
          uTime: { value: 0 },
          uFlash: { value: 0 },
          uGold: { value: new THREE.Color(1.0, 0.78, 0.38) },
          uFlashCol: { value: new THREE.Color(1.0, 0.96, 0.9) },
        };
        const field = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FIELD_VERT, fragmentShader: FIELD_FRAG, uniforms: fu, ...blend }));
        field.frustumCulled = false;
        field.renderOrder = -40;

        const object = new THREE.Group();
        object.add(field, lines, points);
        // A few particles the plate names (their index, and what they are).
        const named = [
          { i: 0, text: 'quark' },
          { i: 0, text: 'gluón' },
          { i: 0, text: 'fotón: la luz' },
          { i: 0, text: 'electrón' },
          { i: 0, text: 'bosón W' },
        ];
        const want = [0, 2, 3, 1, 4];
        named.forEach((n, j) => {
          let best = -1;
          for (let i = 0; i < N; i++) if (d.kind[i] === want[j] && d.seed[i] > 0.85 && (best < 0 || Math.abs(d.p0[i * 3]) + Math.abs(d.p0[i * 3 + 1]) < Math.abs(d.p0[best * 3]) + Math.abs(d.p0[best * 3 + 1]))) best = i;
          n.i = Math.max(best, 0);
        });
        const at = new THREE.Vector3();
        const st = { s: 0, mass: 0, center: new THREE.Vector3() };
        const headOf = (i: number, out: THREE.Vector3) => {
          const k = d.kind[i];
          const m = (k < 1.5 || k > 3.5 ? 1 : 0) * st.mass;
          const s = st.s * (1 + (0.02 - 1) * m) + d.seed[i] * 97;
          const wrap = (x: number) => ((((x + HALF) % (2 * HALF)) + 2 * HALF) % (2 * HALF)) - HALF;
          return out.set(
            st.center.x + wrap(d.p0[i * 3] + d.dir[i * 3] * s - st.center.x),
            st.center.y + wrap(d.p0[i * 3 + 1] + d.dir[i * 3 + 1] * s - st.center.y),
            st.center.z + wrap(d.p0[i * 3 + 2] + d.dir[i * 3 + 2] * s - st.center.z),
          );
        };
        return {
          object,
          clouds: [],
          update(f) {
            const g = (k: string) => f.tl.get(`hig.${k}`, f.p);
            const mass = g('mass');
            // Distance travelled: the flow runs by itself and the scroll pushes it on.
            const s = g('s') + f.time * 6 * (1 - 0.6 * mass);
            uni.uS.value = s;
            uni.uMass.value = mass;
            uni.uTime.value = f.time;
            uni.uAlpha.value = f.alpha;
            uni.uFocal.value = f.focal;
            uni.uMinPx.value = 1.4 * f.dpr;
            // The box follows the focus (where the camera flies).
            uni.uCenter.value.set(f.tl.get('higgs.fx', f.p), f.tl.get('higgs.fy', f.p), f.tl.get('higgs.fz', f.p));
            const cam = f.camera;
            fu.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
            fu.uAspect.value = cam.aspect;
            fu.uField.value = g('field') * f.alpha;
            fu.uTravel.value = -uni.uCenter.value.z;
            fu.uTime.value = f.time;
            fu.uFlash.value = g('flash');
            Object.assign(st, { s, mass });
            st.center.copy(uni.uCenter.value);
          },
          proton: () => null,
          placa(g, f, on, toScreen) {
            if (!on || f.alpha < 0.5) return;
            const { u, W, H } = f;
            named.forEach((n, j) => {
              if (j === 4 && st.mass > 0.4) return;
              const p = toScreen(headOf(n.i, at));
              if (p.z > 1 || p.x < 60 * u || p.x > W - 200 * u || p.y < 60 * u || p.y > H - 260 * u) return;
              nota(g, u, p.x, p.y, n.text, j % 2 ? -50 : 50, -36, 0, f.alpha * 0.9);
            });
          },
        };
      },
    },
    choreo(tl, era) {
      // Reheating: out of the cold dark of inflation, a flash, and the universe is full of hot matter.
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'hig.s': 0, 'hig.mass': 0, 'hig.field': 0, 'hig.flash': 0, 'higgs.fz': 0 });
      tl.caption(3.0, 'El universo se enciende', 'La inflación termina y su energía se vuelve partículas y luz: el universo se llena de fuego.');
      tl.to(0.7, { era: era.index - 0.4, 'hig.flash': 1.1, fondo: 0.35, horno: 0.04, lt: -31, fov: 80 });
      tl.to(0.6, { era: era.index - 0.2, 'hig.flash': 0.4, fondo: 0.3, horno: 0, lt: -30.4 });
      tl.to(1.7, { era: era.index, e: era.home - 0.1, lt: -29, 'hig.flash': 0, fondo: 0.2, horno: 0, fov: 72, yaw: 0, pitch: 0, roll: 0, bloom: 0.55, umbral: 0.18, 'hig.s': 40, 'higgs.fz': -20 });
      tl.label('higgs');
      // First person through particles at the speed of light; the clock races through twenty orders.
      tl.caption(5.4, 'Nada pesa', 'Sin masa, cada partícula vuela a la velocidad de la luz: quarks, electrones, gluones, luz. Así pasa la primera billonésima de segundo.');
      tl.to(2.7, { lt: -21, 'hig.s': 240, 'higgs.fz': -150, 'higgs.fx': 6, yaw: 0.22, pitch: 0.06, roll: 0.12, fov: 76 });
      tl.to(2.7, { lt: -12.4, 'hig.s': 440, 'higgs.fz': -300, 'higgs.fx': -4, yaw: -0.1, pitch: -0.04, roll: -0.08 });
      // The Higgs field takes its value everywhere: the massive ones slow to points; light streaks on.
      tl.caption(4.8, 'El Higgs se enciende', 'A una billonésima de segundo, el campo de Higgs toma un valor en todo el espacio. Las partículas ganan masa y ya no van a la velocidad de la luz. La luz sí.');
      tl.to(2.2, { lt: -11.9, 'hig.mass': 0.55, 'hig.field': 1, 'hig.s': 520, 'higgs.fz': -340, e: era.home - 0.25, fov: 60, yaw: 0.35, pitch: 0.1, roll: 0 });
      tl.to(2.6, { lt: -11.4, 'hig.mass': 1, 'hig.s': 600, 'higgs.fz': -352, e: era.home - 0.35, yaw: 0.6, pitch: 0.16, roll: 0.05 });
    },
  };
}
