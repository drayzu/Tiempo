import * as THREE from 'three';
import { rng, smoothstep } from '../lib/math';
import { SIMPLEX3_GLSL, NOISE_GLSL } from '../lib/glsl';
import type { EraModule } from '../engine/eras';

/**
 * The Planck epoch (≈ 10⁻⁴³ s): the same foam Potencias begins with, now seen as a clock. Drawn in
 * the plate's language because it is hypothesis: a lattice of spacetime that churns and blisters,
 * and closed strings vibrating in their own modes (in Tiempo's accent).
 * 1 unit = 10⁻³⁵ m. The camera drifts through the foam, in first person.
 */

const INK = new THREE.Color(0xece7db);
const ACCENT = new THREE.Color(0x8fb4ff);

const GRID_VERT = /* glsl */ `
  uniform float uTime;
  attribute float aLayer;
  attribute float aFade;
  varying float vDepth;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  void main() {
    vec3 p = position;
    float t = uTime * 0.22;
    // Spacetime churns...
    p += vec3(snoise(p * 0.55 + vec3(0.0, 0.0, t)), snoise(p * 0.55 + vec3(11.0, 0.0, t)), snoise(p * 0.55 + vec3(0.0, 23.0, t))) * 0.38;
    // ...and blisters: bubbles of space swell and collapse.
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec3 c = vec3(sin(fi * 2.3 + t * 0.7) * 2.6, cos(fi * 1.7 + t * 0.5) * 1.8, sin(fi * 3.1 + t * 0.3) * 1.2);
      float swell = 0.5 + 0.5 * sin(t * 2.4 + fi * 1.9);
      vec3 q = p - c;
      p += normalize(q + 1e-4) * 0.7 * swell * exp(-dot(q, q) / 0.7);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = (0.55 + 0.45 * aLayer) * aFade;
  }
`;

const LINE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vDepth;
  void main() {
    gl_FragColor = vec4(uColor * uAlpha * vDepth, 1.0);
  }
`;

const PLAIN_VERT = /* glsl */ `
  varying float vDepth;
  void main() {
    vDepth = 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface Loop {
  c: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  n: THREE.Vector3;
  R: number;
  m1: number;
  m2: number;
  w: number;
  ph: number;
}

export function planck(): EraModule {
  return {
    spec: {
      id: 'planck',
      acto: 'El primer segundo',
      certeza: 'E',
      name: 'La época de Planck',
      fact: 'El primer instante que la física puede nombrar. Hipótesis: el espacio burbujea, y quizá todo sean cuerdas vibrando.',
      ficha: ['tiempo de Planck: 5,4 × 10⁻⁴⁴ s', 'longitud de Planck: 1,6 × 10⁻³⁵ m', 'temperatura de Planck: 1,4 × 10³² K'],
      label: 'Planck',
      unitExp: -35,
      frame: 8,
      frameCenter: new THREE.Vector3(),
      fade: [0.6, 0.5],
      tint: 0xece7db,
      // Cheap enough to make on the spot.
      generate: () => ({}),
      assemble() {
        const r = rng(71);
        // The lattice: three layers of lines along x and along y, reaching well past the frame
        // and fading out with distance, so spacetime has no edge (a tile with borders read as a
        // swatch floating in the dark).
        const pos: number[] = [];
        const layer: number[] = [];
        const fade: number[] = [];
        const span = 12;
        const N = 39;
        const SEG = 290;
        const fadeAt = (x: number, y: number) => 1 - smoothstep(3.5, span * 0.92, Math.hypot(x, y));
        for (let l = 0; l < 3; l++) {
          const z = (l - 1) * 1.3;
          const depth = l / 2;
          for (let k = 0; k < N; k++) {
            const c = -span + (2 * span * k) / (N - 1);
            for (let j = 0; j < SEG; j++) {
              const a = -span + (2 * span * j) / SEG;
              const b = -span + (2 * span * (j + 1)) / SEG;
              const fa = fadeAt(a, c);
              const fb = fadeAt(b, c);
              if (fa + fb < 1e-3) continue;
              pos.push(a, c, z, b, c, z);
              pos.push(c, a, z, c, b, z);
              layer.push(depth, depth, depth, depth);
              fade.push(fa, fb, fa, fb);
            }
          }
        }
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        gridGeo.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
        gridGeo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
        const gridU = { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: INK.clone().multiplyScalar(0.32) } };
        const grid = new THREE.LineSegments(
          gridGeo,
          new THREE.ShaderMaterial({ vertexShader: GRID_VERT, fragmentShader: LINE_FRAG, uniforms: gridU, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        grid.frustumCulled = false;

        // Strings: closed loops vibrating in standing-wave modes.
        const loops: Loop[] = [];
        for (let k = 0; k < 8; k++) {
          const n = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
          const u = new THREE.Vector3(1, 0, 0).cross(n).normalize();
          const v = n.clone().cross(u);
          loops.push({
            c: new THREE.Vector3((r() - 0.5) * 6.5, (r() - 0.5) * 4, (r() - 0.5) * 2.4),
            u,
            v,
            n,
            R: 0.25 + r() * 0.45,
            m1: 2 + Math.floor(r() * 5),
            m2: 3 + Math.floor(r() * 4),
            w: 1.2 + r() * 2,
            ph: r() * 6.28,
          });
        }
        const LSEG = 160;
        const strPos = new Float32Array(loops.length * LSEG * 6);
        const strGeo = new THREE.BufferGeometry();
        strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
        const strU = { uAlpha: { value: 0 }, uColor: { value: ACCENT.clone() } };
        const strings = new THREE.LineSegments(
          strGeo,
          new THREE.ShaderMaterial({ vertexShader: PLAIN_VERT, fragmentShader: LINE_FRAG, uniforms: strU, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        strings.frustumCulled = false;
        const pt = new THREE.Vector3();
        const loopPoint = (L: Loop, th: number, t: number, out: THREE.Vector3) => {
          const rad = L.R * (1 + 0.22 * Math.sin(L.m1 * th + L.w * t + L.ph));
          const lift = L.R * 0.35 * Math.sin(L.m2 * th - L.w * 0.8 * t);
          return out
            .copy(L.c)
            .addScaledVector(L.u, rad * Math.cos(th))
            .addScaledVector(L.v, rad * Math.sin(th))
            .addScaledVector(L.n, lift);
        };

        const object = new THREE.Group();
        object.add(grid, strings);
        return {
          object,
          clouds: [],
          update(f) {
            gridU.uTime.value = f.time;
            // Zooming out, the lattice's lines would crowd into a glaring square: let it go early.
            const away = 1 - smoothstep(f.home + 0.2, f.home + 0.95, f.e);
            gridU.uAlpha.value = f.alpha * away;
            strU.uAlpha.value = f.alpha * away;
            let o = 0;
            for (const L of loops) {
              for (let j = 0; j < LSEG; j++) {
                const a = (j / LSEG) * Math.PI * 2;
                const b = ((j + 1) / LSEG) * Math.PI * 2;
                loopPoint(L, a, f.time, pt);
                strPos[o++] = pt.x;
                strPos[o++] = pt.y;
                strPos[o++] = pt.z;
                loopPoint(L, b, f.time, pt);
                strPos[o++] = pt.x;
                strPos[o++] = pt.y;
                strPos[o++] = pt.z;
              }
            }
            strGeo.attributes.position.needsUpdate = true;
          },
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.to(2.4, { era: era.index, e: era.home + 0.05, lt: -43.27, fondo: 0, horno: 0, yaw: -0.3, pitch: 0.15, roll: 0, fov: 50 });
      tl.label('planck');
      // Drift through the foam.
      tl.to(3.2, { e: era.home + 0.2, lt: -42.6, yaw: 0.35, pitch: 0.3, 'planck.fz': -1.6 });
    },
  };
}
