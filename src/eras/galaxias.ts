import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';

/**
 * Las burbujas se tocan (≈ 250 million to 1 billion years). 1 unit ≈ 10²¹·⁵ m comoving (about three
 * million light-years). Reionisation.
 *
 * The web, a hundred times larger than the first star's: neutral gas (blue-grey) along its threads,
 * the first galaxies lighting in its knots (blue-white clumps), each blowing a bubble of ionised gas
 * (pink at its front) that grows until the bubbles touch and merge, like a Swiss cheese, and the
 * universe is transparent again to ultraviolet light. The camera flies along a thread towards the
 * knot where our galaxy will be. (The James Webb telescope sees bright galaxies less than 300 million
 * years after the beginning: earlier than expected.)
 */

const LT = (years: number) => Math.log10(years * YEAR);
const NB = 56;

interface Web {
  nodes: THREE.Vector3[];
  edges: [number, number][];
}

function makeWeb(): Web {
  const r = rng(911);
  const nodes = [new THREE.Vector3(0, 0, 0)];
  while (nodes.length < NB) {
    const v = new THREE.Vector3((r() * 2 - 1) * 30, (r() * 2 - 1) * 20, (r() * 2 - 1) * 30);
    if (nodes.some((n) => n.distanceTo(v) < 6)) continue;
    nodes.push(v);
  }
  const edges: [number, number][] = [];
  const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: n.distanceTo(m) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d);
    for (const { j } of near.slice(0, i === 0 ? 4 : 2 + (r() < 0.4 ? 1 : 0))) if (!has(i, j)) edges.push([i, j]);
  });
  return { nodes, edges };
}
const WEB = makeWeb();
/** Each knot's galaxy: when it lights, how large its bubble grows. */
const GAL = (() => {
  const r = rng(912);
  return WEB.nodes.map((n, i) => ({ at: n, delay: i === 0 ? 0.02 : 0.05 + r() * 0.55, R: 6 + r() * 5 }));
})();
const OURS = new THREE.Vector3(1.4, 0.4, 1.0);

const GAS_MOVE = /* glsl */ `
  if (aKind < 0.5) {
    // Gas: neutral (blue-grey) unless inside a bubble (pink, brightest near the front).
    float ion = 0.0;
    float rim = 0.0;
    for (int i = 0; i < ${NB}; i++) {
      vec4 b = uBub[i];
      if (b.w <= 0.0) continue;
      float d = length(p - b.xyz) / b.w;
      ion = max(ion, 1.0 - smoothstep(0.92, 1.0, d));
      rim = max(rim, exp(-pow((d - 0.96) / 0.05, 2.0)));
    }
    em = mix(em, uIon, ion * uGlow) * (1.0 + rim * 2.5 * uGlow);
  } else if (aKind < 1.5) {
    // Galaxies: they light at their own moment.
    float on = smoothstep(aDelay, aDelay + 0.05, uOn);
    em *= on;
    sz *= 0.4 + 0.6 * on;
  } else {
    // Bubble fronts: points on each bubble's sphere (aDelay holds its index).
    vec4 b = uBub[int(aDelay + 0.5)];
    p = b.xyz + position * b.w;
    em *= step(0.01, b.w) * uGlow;
  }
`;

export function galaxias(): EraModule {
  return {
    spec: {
      id: 'galaxias',
      acto: 'Oscuridad y amanecer',
      certeza: 'O',
      name: 'Las burbujas se tocan',
      fact: 'La luz de las primeras galaxias ioniza burbujas de gas que crecen hasta tocarse y fundirse, como un queso suizo.',
      label: 'galaxias',
      unitExp: 21.5,
      frame: 30,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.5],
      fadeE: [-1.6, -0.9, 2.6, 4],
      tint: 0xa8c4ff,
      generate() {
        const r = rng(913);
        const b = materiaBuilder(914);
        // Neutral gas along the threads and in the knots.
        const lens = WEB.edges.map(([a, c]) => WEB.nodes[a].distanceTo(WEB.nodes[c]));
        const total = lens.reduce((x, y) => x + y, 0);
        for (let k = 0; k < 42000; k++) {
          if (r() < 0.75) {
            let pick = r() * total;
            let e = 0;
            while (pick > lens[e]) pick -= lens[e++];
            const [a, c] = WEB.edges[e];
            const t = r();
            const P = WEB.nodes[a].clone().lerp(WEB.nodes[c], t);
            const w = 0.35 + 0.5 * Math.sin(Math.PI * t);
            b.push(P.x + gauss(r) * w, P.y + gauss(r) * w, P.z + gauss(r) * w, 0x8ea6c8, 0.09, 0.32, { kind: 0, ink: 0.4 });
          } else {
            const n = WEB.nodes[Math.floor(r() * WEB.nodes.length)];
            b.push(n.x + gauss(r) * 1.2, n.y + gauss(r) * 1.2, n.z + gauss(r) * 1.2, 0x8ea6c8, 0.09, 0.32, { kind: 0, ink: 0.4 });
          }
        }
        // The first galaxies: small, blue-white, in the knots.
        GAL.forEach((g, i) => {
          const n = i === 0 ? 160 : 40 + Math.floor(r() * 80);
          for (let k = 0; k < n; k++) {
            const s = 0.12 + 0.25 * Math.pow(r(), 2);
            const hex = r() < 0.75 ? 0xbcd2ff : 0xffe6c8;
            b.push(g.at.x + gauss(r) * s, g.at.y + gauss(r) * s * 0.7, g.at.z + gauss(r) * s, hex, 0.06, 1.2, { kind: 1, delay: g.delay, star: true });
          }
        });
        // The fronts of the bubbles: a sphere of points per galaxy (scaled by the shader).
        GAL.forEach((_, i) => {
          for (let k = 0; k < 520; k++) {
            const [x, y, z] = b.onSphere();
            b.push(x, y, z, 0xff6f8f, 0.16, 0.16, { kind: 2, delay: i });
          }
        });
        return { main: b.data() };
      },
      assemble(data) {
        const bub = Array.from({ length: NB }, () => new THREE.Vector4());
        const uni = { uBub: { value: bub }, uOn: { value: 0 }, uGlow: { value: 1 }, uIon: { value: new THREE.Color(0xff6f8f).multiplyScalar(0.55) } };
        const cloud = materia(data.main as MateriaData, { pre: `uniform vec4 uBub[${NB}];\nuniform float uOn, uGlow;\nuniform vec3 uIon;`, move: GAS_MOVE, uniforms: uni });
        cloud.u.uNear.value = 1;
        cloud.u.uMaxPx.value = 40;
        const object = new THREE.Group();
        object.add(cloud.points);
        return {
          object,
          clouds: [cloud],
          update(f) {
            const k = f.tl.get('gal.k', f.p);
            uni.uOn.value = k;
            // Bubbles grow from each galaxy once it lights; by the end they fill everything.
            GAL.forEach((g, i) => {
              const grow = smoothstep(g.delay + 0.02, g.delay + 0.5, k);
              bub[i].set(g.at.x, g.at.y, g.at.z, g.R * Math.pow(grow, 0.8) * (1 + 0.6 * smoothstep(0.7, 1, k)));
            });
            // Once everything is ionised the glow settles: the gas is transparent again.
            uni.uGlow.value = 1 - 0.65 * smoothstep(0.85, 1, k);
          },
          proton: () => OURS,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'gal.k': 0, 'galaxias.fz': 22, 'galaxias.fx': -6 });
      // Out of the first star's knot, the web a hundred times larger; first person along a thread.
      tl.to(3.0, { era: era.index, e: era.home - 0.3, lt: LT(2.6e8), fondo: 1, horno: 0, fov: 58, yaw: -0.2, pitch: 0.08, roll: 0 });
      tl.label('galaxias');
      tl.caption(3.6, 'Más temprano de lo esperado', 'El telescopio James Webb ve galaxias brillantes a menos de 300 millones de años del inicio: se formaron antes de lo que se creía.');
      tl.to(3.6, { 'gal.k': 0.35, lt: LT(4e8), 'galaxias.fz': 10, 'galaxias.fx': -2, yaw: 0.1, roll: 0.04 });
      tl.to(3.6, { 'gal.k': 0.75, lt: LT(6.5e8), 'galaxias.fz': 3, 'galaxias.fx': 0, yaw: 0.45, pitch: 0.18, roll: -0.03 });
      tl.to(2.8, { 'gal.k': 1, lt: LT(1e9), 'galaxias.fz': 0, e: era.home + 0.25, yaw: 0.8, pitch: 0.25, roll: 0 });
    },
  };
}
