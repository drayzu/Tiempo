import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { bbColor } from '../lib/cuerpo-negro';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../lib/glsl';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { nota } from '../engine/placa';
import { rocas, rocasData, type RocasData } from '../engine/rocas';
import { NORTE, SOL_DESDE_TIERRA } from './ahora';
import { infinito, infinitoData } from './infinito';
import { vista } from '../lib/vista';

/**
 * La Tierra se forma (≈ 4 570 to 4 200 million years ago). 1 unit = 1 000 km, as «Ahora».
 *
 * Out of the Sun's disk, first person: the dust has stuck into pebbles, the pebbles into rocks that
 * collide and gather. The camera flies through the swarm (one of those rocks carries our proton, in
 * a little ice) to the young Earth, a ball of molten rock that every impact heats again. Then Theia,
 * a planet the size of Mars, hits it at an angle: both melt, and a long arm of molten rock is thrown
 * out, wraps around the Earth into a ring and, outside the Roche limit, gathers into the Moon in very
 * little time, some fifteen times closer than today (Canup 2004; Kegerreis et al. 2022). The camera
 * dives into the ring as the Moon forms ahead of it. The Earth cools, its steam falls as rain and the
 * oceans are born; time speeds up again, the days blur into bands (a long exposure) and the Moon
 * draws back, a ring of light: the look «Ahora» starts from.
 *
 * Everything is placed in a local frame: y is the Earth's axis (`NORTE`, as in «Ahora»), x the Sun's
 * direction in the equator's plane. Hidden faces are hidden by depth: spheres that only write depth
 * sit inside the Earth, Theia and the Moon, and the points of this era test against them.
 */

const LB = (years: number) => Math.log10(years);
const R = 6.371;
const RT = 3.39;
const RM = 1.737;
/** The Roche limit (fluid body, the Moon's density): inside it no moon can gather. */
const ROCHE = 2.9 * R;
const MOON_R0 = 3.8 * R;

// The local frame (x: the Sun's direction in the equator, y: the axis, z: x × y).
const N = NORTE.clone().normalize();
const S = SOL_DESDE_TIERRA.clone().normalize();
const E1 = S.clone().addScaledVector(N, -S.dot(N)).normalize();
const E2 = new THREE.Vector3().crossVectors(E1, N).normalize();
const BASIS = new THREE.Matrix4().makeBasis(E1, N, E2);
const Q_LOCAL = new THREE.Quaternion().setFromRotationMatrix(BASIS);
const toEra = (v: THREE.Vector3) => v.clone().applyQuaternion(Q_LOCAL);
/** The Sun, in the local frame. */
const SUN_L = new THREE.Vector3(Math.sqrt(1 - S.dot(N) ** 2), S.dot(N), 0);

// The impact, seen from VD (local): Theia crosses the screen from the left (−W) and hits the near-left
// limb at about 45°; its arm wraps counterclockwise about the axis (A → B).
const VD = new THREE.Vector3(0.55, 0.36, 0.75).normalize();
const A = new THREE.Vector3(VD.x, 0, VD.z).normalize();
const W = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), A).normalize();
const B = W.clone();
const C_DIR = A.clone().multiplyScalar(0.66).addScaledVector(W, -0.75).normalize();
const PHI_C = Math.atan2(C_DIR.dot(B), C_DIR.dot(A));
const CONTACT = C_DIR.clone().multiplyScalar(R + RT);
/** Where the Moon gathers, on the ring (angle about the axis, from A towards B). */
const PHI_M = PHI_C + 2.6;

/** Our proton's rock, out in the swarm ahead of the camera; it falls in when `sweep` reaches it. */
const OUR_ROCK = new THREE.Vector3(18, 12, 132);
/** The way in: the camera comes down this line to the young Earth. */
const PATH = new THREE.Vector3(0, 0.06, 1);
const OUR_FALL = 0.46;

/** The camera on the side `dir` (local) of the focus, the axis up on screen (see `vista`). */
const vistaL = (dir: THREE.Vector3, ref = { yaw: 0, roll: 0 }, roll = 0) => vista(toEra(dir), N, ref, roll);
/** A travel offset (era units) for a focus at `v` (local). */
const viaje = (v: THREE.Vector3) => {
  const t = toEra(v);
  return { 'tierra.fx': t.x, 'tierra.fy': t.y, 'tierra.fz': t.z };
};

const GLSL_PRE = /* glsl */ `
  uniform vec3 uSunL, uHit, uTheiaC, uRingA, uRingB, uMoonC;
  uniform float uRadius, uRot, uBlur, uMelt, uHeat, uShock, uWaveT, uSea, uCloud, uSweep, uImp;
  uniform float uOrbit, uMoon, uMoonK, uMoonMelt, uMoonBlur, uMoonTh, uMoonD, uCool, uRain, uPhiC, uTheiaK;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  vec3 ringAt(float r, float phi, float h) {
    return r * (cos(phi) * uRingA + sin(phi) * uRingB) + vec3(0.0, h, 0.0);
  }
  // Molten rock: a dark crust broken by glowing cracks (the zero lines of a noise field).
  float cracks(vec3 q, float wide) {
    return 1.0 - smoothstep(0.0, wide, abs(snoise(q)));
  }
`;

const MOVE = /* glsl */ `
  if (aKind < 0.5) {
    // Rocks of the swarm (lit on their sunward side when built). Those near enough fall in: they heat
    // as they come down and vanish on the surface in a flash.
    float k = smoothstep(aDelay, aDelay + 0.07, uSweep);
    p = position + aFrom * k * k;
    float hit = exp(-pow((k - 0.96) / 0.03, 2.0));
    float gone = 1.0 - smoothstep(0.975, 0.995, k);
    em = (em * (1.0 - smoothstep(0.93, 1.0, k)) + vec3(1.0, 0.62, 0.3) * (smoothstep(0.8, 0.97, k) * 0.3 + hit * 3.0) * step(0.001, k)) * gone;
    sz *= 1.0 + hit * 2.0;
  } else if (aKind < 1.5) {
    // (unused)
    em = vec3(0.0);
  } else if (aKind < 2.5) {
    // The Earth's surface. The pattern turns under a fixed Sun; fast, the days blur into bands.
    vec3 n0 = normalize(position);
    float spin = uRot + (seed - 0.5) * 6.2832 * uBlur;
    vec3 nr = rotY(n0, -spin);
    float ang = acos(clamp(dot(n0, uHit), -1.0, 1.0));
    float bulge = uShock * exp(-ang * ang / 0.18);
    float wave = uShock * 0.035 * sin(ang * 7.0 - uWaveT * 9.0) * exp(-ang * 0.8);
    p = n0 * uRadius * (1.0 + bulge * 0.22 + wave);
    float h = fbm3lo(nr * 1.7 + 4.0);
    float cr = max(cracks(nr * 3.2 + vec3(0.0, uWaveT * 0.04, 0.0), 0.05 + 0.08 * uMelt), 0.55 * cracks(nr * 9.0 + 2.0, 0.04 + 0.05 * uMelt));
    vec3 magma = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.6, 0.2), cr);
    float glow = uMelt * (0.05 + 0.75 * cr * cr) * (0.85 + 0.3 * snoise(nr * 9.0));
    // The impact: white heat at the contact, the whole planet glowing after it.
    float hot = uHeat * (0.2 + 0.55 * exp(-ang * ang / 0.5));
    // Cooled: dark basalt, then the oceans rise (where the ground is lowest first).
    float sea = smoothstep(-0.02, 0.02, mix(-0.7, 0.32, uSea) - h);
    vec3 ground = mix(vec3(0.13, 0.11, 0.1), vec3(0.24, 0.2, 0.16), smoothstep(-0.1, 0.4, h));
    vec3 ocean = vec3(0.03, 0.11, 0.3) * (0.85 + 0.3 * smoothstep(-0.7, 0.0, h));
    vec3 crust = mix(ground, ocean, sea * step(0.001, uSea));
    float lit = smoothstep(-0.06, 0.32, dot(n0, uSunL));
    em = crust * (0.02 + 0.98 * lit) * (1.0 - 0.75 * uMelt) + magma * glow + vec3(1.0, 0.7, 0.4) * hot;
    em *= (0.85 + 0.3 * seed) * 0.8;
  } else if (aKind < 3.5) {
    // Clouds of the young Earth: steam, then rain clouds, turning a little faster than the ground.
    vec3 n0 = normalize(position);
    float spin = uRot * 1.07 + (seed - 0.5) * 6.2832 * uBlur;
    vec3 nr = rotY(n0, -spin);
    float c = smoothstep(0.05, 0.45, fbm3lo(nr * 2.6 + vec3(uWaveT * 0.02, 0.0, 0.0)) + 0.1 * uCloud);
    p = n0 * uRadius * 1.018;
    float lit = smoothstep(-0.1, 0.35, dot(n0, uSunL));
    em = vec3(0.86, 0.88, 0.9) * c * uCloud * (0.03 + 0.97 * lit) * 0.4;
  } else if (aKind < 4.5) {
    // Theia: grey-brown, cratered, lit by the Sun; at the impact it flattens into the Earth, white-hot.
    vec3 n0 = normalize(position);
    float m = smoothstep(0.1, 0.32, uImp);
    vec3 own = uTheiaC + n0 * ${RT.toFixed(2)} * (1.0 - 0.25 * m);
    vec3 onEarth = normalize(uHit + n0 * 1.1) * uRadius * 1.01;
    p = mix(own, onEarth, m * m);
    float crater = 0.7 + 0.3 * smoothstep(-0.3, 0.5, snoise(n0 * 5.0 + 11.0));
    float lit = smoothstep(-0.06, 0.32, dot(n0, uSunL));
    em = vec3(0.5, 0.44, 0.38) * crater * (0.02 + 0.98 * lit);
    em = mix(em, vec3(1.0, 0.8, 0.55) * 0.7, smoothstep(0.0, 0.4, m)) * (1.0 - smoothstep(0.75, 1.0, m));
    em *= uTheiaK * step(uImp, 0.999);
  } else if (aKind < 5.5) {
    // Debris: thrown out from the contact as a spiral arm, then a ring that shears around the Earth.
    // Outside the Roche limit it gathers into the Moon; inside, it rains back.
    float rf = position.x;
    float launch = 0.13 + aDelay * 0.13;
    float s = clamp((uImp - launch) / 0.32, 0.0, 1.0);
    float se = 1.0 - (1.0 - s) * (1.0 - s);
    float rr = mix(uRadius * 1.02, rf, se);
    float phi = uPhiC + 0.4 * aDelay + se * (1.3 + 0.9 * (1.0 - aDelay)) + uOrbit * pow(${R.toFixed(3)} / rr, 1.5) * 2.4;
    float hh = position.z * mix(2.0, 1.0, se) * (rr / ${R.toFixed(3)});
    p = ringAt(rr, phi, hh);
    // Inside the Roche limit: back onto the Earth.
    float inner = step(rf, ${ROCHE.toFixed(2)});
    float kr = inner * smoothstep(seed * 0.5, seed * 0.5 + 0.4, uRain);
    p = mix(p, normalize(p) * uRadius, kr * kr);
    // Outside: into the Moon.
    float kg = (1.0 - inner) * smoothstep(seed * 0.7, seed * 0.7 + 0.3, uMoon);
    p = mix(p, uMoonC + aFrom * ${(RM * 1.1).toFixed(2)} * (1.0 + 2.5 * (1.0 - kg)), kg);
    vec3 hotC = vec3(1.0, 0.6, 0.26) * 0.42;
    vec3 warm = vec3(0.92, 0.26, 0.05) * 0.42;
    vec3 cold = vec3(0.2, 0.08, 0.05) * 0.5;
    float b = length(em) * (seed > 0.93 ? 2.2 : 0.7);
    em = (uCool < 0.5 ? mix(hotC, warm, uCool * 2.0) : mix(warm, cold, uCool * 2.0 - 1.0)) * b;
    em *= step(0.0001, s) * (1.0 - smoothstep(0.85, 1.0, max(kr, kg))) * (1.0 + 1.5 * kg * (1.0 - kg));
    sz *= mix(1.6, 1.0, se);
  } else {
    // The Moon: molten as it gathers, then grey with dark seas; fast, a ring along its orbit.
    vec3 n0 = normalize(position);
    float th = uMoonTh + (seed - 0.5) * 6.2832 * uMoonBlur;
    vec3 c = ringAt(uMoonD, th, 0.0);
    p = c + n0 * ${RM.toFixed(3)} * mix(0.45 + 0.55 * uMoonK, 0.25, uMoonBlur);
    float mare = smoothstep(0.1, 0.35, snoise(n0 * 2.2 + 3.0));
    vec3 grey = vec3(0.62, 0.6, 0.57) * (1.0 - 0.45 * mare);
    float lit = smoothstep(-0.05, 0.25, dot(n0, uSunL));
    float cr = cracks(n0 * 4.0, 0.12);
    em = grey * mix(0.02 + 0.98 * lit, 0.35, uMoonBlur) * (1.0 - 0.7 * uMoonMelt) + mix(vec3(0.8, 0.15, 0.03), vec3(1.0, 0.6, 0.25), cr) * uMoonMelt * (0.2 + 1.3 * cr);
    em *= uMoonK;
    sz *= mix(1.0, 14.0, uMoonBlur);
  }
`;

/** The Sun's glare, the impact's flash and the stars, at the back of the scene (in camera space). */
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
  uniform vec3 uSunW, uSunCol, uFlashW, uFlashCol, uEarthW;
  uniform float uEarthR, uSunK, uFlash, uFlood, uStars, uTime;
  uniform mat3 uSky;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  float behindEarth(vec3 d) {
    // uEarthW: the direction to the Earth; uEarthR: the sine of its angular radius (0: not there).
    float c = sqrt(max(0.0, 1.0 - uEarthR * uEarthR));
    return step(1e-4, uEarthR) * smoothstep(c - 0.0015, c + 0.0015, dot(d, uEarthW));
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.0);
    // Stars, fixed to the sky (they turn with the scene).
    vec3 sd = uSky * d;
    vec2 ll = vec2(atan(sd.z, sd.x), asin(clamp(sd.y, -1.0, 1.0)));
    col += vec3(0.85, 0.9, 1.0) * (starField(ll * 70.0, 0.07, 0.0) + 0.6 * starField(ll * 160.0 + 3.0, 0.05, 0.0)) * uStars;
    float shade = 1.0 - behindEarth(d);
    col *= shade;
    // The young Sun: a blinding core and a broad glare (eclipsed by the Earth).
    float a = acos(clamp(dot(d, uSunW), -1.0, 1.0));
    float sunVis = 1.0 - behindEarth(uSunW);
    col += uSunCol * uSunK * (0.9 / pow(1.0 + pow(a / 0.012, 2.0), 1.5) * shade + 0.05 / (1.0 + pow(a / 0.2, 2.0)) * sunVis);
    // The impact: a white flash at the contact, flooding the view for an instant.
    float f = acos(clamp(dot(d, uFlashW), -1.0, 1.0));
    col += uFlashCol * uFlash * (1.1 / (1.0 + pow(f / 0.03, 2.0)) + 0.22 / (1.0 + pow(f / 0.16, 2.0)));
    col += uFlashCol * uFlood * 0.16;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function tierra(): EraModule {
  return {
    spec: {
      id: 'tierra',
      acto: 'Nosotros',
      certeza: 'T',
      name: 'La Tierra se forma',
      fact: 'Rocas que chocan y se juntan.',
      ficha: ['la Tierra: hace ~4 540 millones de años, en decenas de millones de años', 'Tea, del tamaño de Marte: la hipótesis del gran impacto', 'océanos hace ~4 400 millones de años (circones de Jack Hills)'],
      label: 'la Tierra',
      unitExp: 6,
      frame: 19,
      // Where the Earth forms in the Sun's disk (1 AU, in that era's 10¹³ m units).
      anchor: new THREE.Vector3(1.496e11 / 1e13, 0, 0),
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.5],
      fadeE: [-3, -2, 5.8, 6.8],
      tint: 0xffb070,
      generate() {
        const r = rng(1811);
        const b = materiaBuilder(1812);
        const sun = SUN_L;
        const tmp = new THREE.Vector3();
        const rock = (c: THREE.Vector3, rr: number, base: THREE.Color, delay: number, light: number) => {
          const fall = c.clone().normalize().multiplyScalar(R * 0.96).sub(c);
          // A lumpy rock: points on a squashed, dented sphere, lit on the side facing the Sun.
          const n = rr > 1 ? 34 : rr > 0.4 ? 16 : 7;
          const sq = new THREE.Vector3(1 + 0.3 * r(), 0.7 + 0.25 * r(), 0.85 + 0.3 * r());
          for (let k = 0; k < n; k++) {
            const [x, y, z] = b.onSphere();
            tmp.set(x, y, z);
            const lit = 0.03 + 0.97 * smoothstep(-0.1, 0.7, tmp.dot(sun));
            const col = base.clone().multiplyScalar(lit);
            const dent = 0.62 * (0.85 + 0.3 * r());
            b.push(c.x + x * rr * dent * sq.x, c.y + y * rr * dent * sq.y, c.z + z * rr * dent * sq.z, col, rr * (n > 7 ? 0.5 : 0.75), light, { kind: 0, delay, from: fall.toArray() as [number, number, number] });
          }
        };
        // Rocks (kind 0): log-uniform in distance, flattened to the disk; the near ones fall in.
        const rockCol = [new THREE.Color(0.62, 0.55, 0.48), new THREE.Color(0.5, 0.46, 0.44), new THREE.Color(0.7, 0.62, 0.5), new THREE.Color(0.75, 0.82, 0.9)];
        for (let k = 0; k < 6500; k++) {
          const d = 14 * Math.exp(r() * Math.log(3200 / 14));
          const th = r() * Math.PI * 2;
          const c = new THREE.Vector3(Math.cos(th) * d, gauss(r) * d * 0.22, Math.sin(th) * d);
          const rr = 0.06 + 1.6 * Math.pow(r(), 5) + (d > 600 ? 1.2 * r() : 0);
          const delay = d < 300 && rr < 0.5 ? 0.02 + ((d - 14) / 300) * 0.88 + r() * 0.04 : 3;
          rock(c, rr, rockCol[Math.floor(r() * 4)], delay, 0.9);
        }
        // Along the camera's way in, a denser lane of rocks.
        for (let k = 0; k < 2600; k++) {
          const t = Math.pow(r(), 1.6);
          const c = new THREE.Vector3(gauss(r) * 30, gauss(r) * 18, 40 + t * 3200).add(new THREE.Vector3(gauss(r), gauss(r) * 0.6, 0).multiplyScalar(10 + t * 260));
          const rr = 0.05 + (0.6 + t * 4) * Math.pow(r(), 4);
          const d = c.length();
          rock(c, rr, rockCol[Math.floor(r() * 4)], d < 300 && rr < 0.5 ? 0.02 + ((d - 14) / 300) * 0.88 : 3, 0.9);
        }
        // Our proton's rock: a little icy.
        rock(OUR_ROCK, 0.55, new THREE.Color(0.8, 0.88, 1.0), OUR_FALL, 1.1);
        // (kind 1 unused)
        // The Earth's surface (kind 2): a Fibonacci sphere, jittered.
        const NE = 150000;
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < NE; i++) {
          const y = 1 - (2 * (i + 0.2 + 0.6 * r())) / NE;
          const s = Math.sqrt(Math.max(0, 1 - y * y));
          const a = i * golden + (r() - 0.5) * 0.02;
          b.push(Math.cos(a) * s, y, Math.sin(a) * s, 0xffffff, 0.085, 1, { kind: 2 });
        }
        // Clouds (kind 3).
        for (let i = 0; i < 26000; i++) {
          const [x, y, z] = b.onSphere();
          b.push(x, y, z, 0xffffff, 0.16, 1, { kind: 3 });
        }
        // Theia (kind 4).
        for (let i = 0; i < 22000; i++) {
          const [x, y, z] = b.onSphere();
          b.push(x, y, z, 0xffffff, 0.085, 1, { kind: 4 });
        }
        // Debris (kind 5): final orbit radius, and a height, in `position`; where in the Moon, in `aFrom`.
        for (let i = 0; i < 40000; i++) {
          const rf = R * (1.25 + Math.pow(r(), 0.8) * 4.6);
          const [mx, my, mz] = b.onSphere();
          const q = Math.cbrt(r());
          b.push(rf, 0, gauss(r) * 0.35, 0xffffff, 0.09 + 0.12 * r(), 0.5 + r() * 0.5, { kind: 5, delay: Math.pow(r(), 0.7), from: [mx * q, my * q, mz * q] });
        }
        // The Moon (kind 6).
        for (let i = 0; i < 9000; i++) {
          const [x, y, z] = b.onSphere();
          b.push(x, y, z, 0xffffff, 0.06, 1, { kind: 6 });
        }
        // Dust of the disk on the way in (an endless zoom: the same rubble at every scale).
        let left = 0;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        const rubble = infinitoData({
          seed: 1813,
          layers: 7,
          spacing: 0.6,
          perLayer: 2600,
          point(rr, o) {
            if (left <= 0) {
              cx = rr() * 2 - 1;
              cy = (rr() * 2 - 1) * 0.5;
              cz = rr() * 2 - 1;
              left = 3 + Math.floor(rr() * 18);
            }
            left--;
            const x = cx + gauss(rr) * 0.04;
            const y = cy + gauss(rr) * 0.04;
            const z = cz + gauss(rr) * 0.04;
            const d = Math.hypot(x, y, z);
            if (d > 1 || d < 0.08) return false;
            const ice = rr() < 0.12;
            Object.assign(o, { x, y, z, hex: ice ? 0xcfe0ff : rr() < 0.5 ? 0xc89a70 : 0x9a8a7a, size: 0.009 + 0.012 * rr(), light: ice ? 1.6 : 0.95 });
            return true;
          },
        });
        // Solid rocks along the camera's way in: farther out, farther from its path and larger, so they
        // pass the camera at an even pace (the way in is a zoom: its speed grows with the distance).
        const path = PATH.clone().normalize();
        const side1 = new THREE.Vector3(1, 0, 0).cross(path).normalize();
        const side2 = path.clone().cross(side1).normalize();
        const solid = rocasData(1814, 900, (rr, o) => {
          const s = 55 * Math.exp(rr() * Math.log(3400 / 55));
          const off = s * (0.018 + 0.2 * Math.pow(rr(), 1.5));
          const a = rr() * Math.PI * 2;
          const c = path.clone().multiplyScalar(s).addScaledVector(side1, Math.cos(a) * off).addScaledVector(side2, Math.sin(a) * off * 0.7);
          const col = rockCol[Math.floor(rr() * 4)];
          Object.assign(o, { x: c.x, y: c.y, z: c.z, radius: Math.min(0.06 + s * (0.0006 + 0.0035 * Math.pow(rr(), 2)), 2.8), r: col.r * 0.55, g: col.g * 0.55, b: col.b * 0.55 });
          return true;
        });
        return { main: b.data(), rubble, solid };
      },
      assemble(data) {
        const uni = {
          uSunL: { value: SUN_L.clone() },
          uHit: { value: C_DIR.clone() },
          uTheiaC: { value: new THREE.Vector3() },
          uRingA: { value: A.clone() },
          uRingB: { value: B.clone() },
          uMoonC: { value: new THREE.Vector3() },
          uRadius: { value: R },
          uRot: { value: 0 },
          uBlur: { value: 0 },
          uMelt: { value: 1 },
          uHeat: { value: 0 },
          uShock: { value: 0 },
          uWaveT: { value: 0 },
          uSea: { value: 0 },
          uCloud: { value: 0 },
          uSweep: { value: 0 },
          uImp: { value: 0 },
          uOrbit: { value: 0 },
          uMoon: { value: 0 },
          uMoonK: { value: 0 },
          uMoonMelt: { value: 1 },
          uMoonBlur: { value: 0 },
          uMoonTh: { value: PHI_M },
          uMoonD: { value: MOON_R0 },
          uCool: { value: 0 },
          uRain: { value: 0 },
          uPhiC: { value: PHI_C },
          uTheiaK: { value: 0 },
        };
        const cloud = materia(data.main as MateriaData, { pre: GLSL_PRE, move: MOVE, uniforms: uni });
        cloud.u.uMaxPx.value = 64;
        cloud.u.uNear.value = 1;
        const mat = cloud.points.material as THREE.ShaderMaterial;
        mat.depthTest = true;
        const rubble = infinito(data.rubble as ReturnType<typeof infinitoData>, 0.6);
        const solid = rocas(data.solid as RocasData);

        // Depth-only spheres: what is behind the Earth, Theia or the Moon stays hidden.
        const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
        const occ = (r0: number) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(r0, 48, 32), occMat);
          m.renderOrder = -20;
          return m;
        };
        const earthOcc = occ(1);
        const theiaOcc = occ(1);
        const moonOcc = occ(1);

        // The atmosphere's rim: rock vapour (orange) while molten, blue once the oceans form.
        const rimCol = new THREE.Color();
        const sunEra = { value: toEra(SUN_L) };
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(1, 96, 64),
          new THREE.ShaderMaterial({
            uniforms: { uSun: sunEra, uAlpha: { value: 1 }, uCol: { value: rimCol }, uNight: { value: 0 } },
            vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
            fragmentShader: 'uniform vec3 uSun, uCol; uniform float uAlpha, uNight; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); float day = max(smoothstep(-0.25, 0.4, dot(vN, uSun)), uNight); gl_FragColor = vec4(uCol * rim * day * uAlpha, 1.0); }',
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );

        const sc = bbColor(5600);
        const gu = {
          uTanHalf: { value: 0.5 },
          uAspect: { value: 16 / 9 },
          uSunW: { value: new THREE.Vector3() },
          uSunCol: { value: new THREE.Color(sc.r, sc.g, sc.b) },
          uFlashW: { value: new THREE.Vector3(0, 0, -1) },
          uFlashCol: { value: new THREE.Color(1.0, 0.86, 0.66) },
          uEarthW: { value: new THREE.Vector3() },
          uEarthR: { value: 0 },
          uSunK: { value: 1 },
          uFlash: { value: 0 },
          uFlood: { value: 0 },
          uStars: { value: 0 },
          uTime: { value: 0 },
          uSky: { value: new THREE.Matrix3() },
        };
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: gu, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        glow.frustumCulled = false;
        glow.renderOrder = -50;

        const local = new THREE.Group();
        local.quaternion.copy(Q_LOCAL);
        local.add(earthOcc, theiaOcc, moonOcc, solid.object, atmo, cloud.points);
        const object = new THREE.Group();
        object.add(glow, rubble.points, local);

        const ours = new THREE.Vector3();
        const ourLocal = new THREE.Vector3();
        const theia = new THREE.Vector3();
        const moonC = new THREE.Vector3();
        const w = new THREE.Vector3();
        const tmpV = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const m3 = new THREE.Matrix3();
        const m4 = new THREE.Matrix4();
        let prevL = Math.pow(10, 9.66);
        let waveT = 0;
        const st = { imp: 0, moon: 0, sea: 0 };
        return {
          object,
          clouds: [cloud],
          update(f) {
            const g = (k: string) => f.tl.get(`tie.${k}`, f.p);
            const lb = f.tl.get('lb', f.p);
            const L = Math.pow(10, lb);
            // How fast time runs on screen decides what blurs (days, the Moon's months).
            const rate = Math.abs(L - prevL) / Math.max(f.dt, 1e-3);
            prevL = L;
            const blur = smoothstep(0.4, 4, rate * 365.25);
            const imp = g('imp');
            const grow = g('grow');
            const radius = R * grow;
            uni.uRadius.value = radius;
            uni.uRot.value = g('rot') + f.time * 0.06 * (1 - blur);
            uni.uBlur.value = blur;
            uni.uMelt.value = g('melt');
            const heat = g('heat');
            uni.uHeat.value = heat;
            uni.uShock.value = g('shock');
            waveT += f.dt * (0.4 + 2 * heat);
            uni.uWaveT.value = waveT;
            uni.uSea.value = g('sea');
            uni.uCloud.value = g('cloud');
            uni.uSweep.value = g('sweep');
            uni.uImp.value = imp;
            uni.uOrbit.value = g('orbit') + f.time * 0.05 * smoothstep(0.4, 0.6, imp);
            const moon = g('moon');
            uni.uMoon.value = moon;
            uni.uRain.value = g('rain');
            uni.uCool.value = g('cool');
            // Theia: from the left, faster and faster, to the contact; then into the Earth.
            const approach = smoothstep(0, 0.1, imp);
            theia.copy(CONTACT).addScaledVector(W, -70 * Math.pow(1 - approach, 1.15));
            uni.uTheiaC.value.copy(theia);
            uni.uTheiaK.value = g('theia');
            // The Moon: where the debris gathers, on its orbit; it draws back, and smears into a ring.
            const moonD = g('moonD');
            const moonTh = PHI_M + g('orbit') * 0.12 + f.time * 0.02 * smoothstep(0.5, 1, moon);
            uni.uMoonD.value = moonD;
            uni.uMoonTh.value = moonTh;
            moonC.copy(A).multiplyScalar(Math.cos(moonTh) * moonD).addScaledVector(B, Math.sin(moonTh) * moonD);
            uni.uMoonC.value.copy(moonC);
            const moonK = smoothstep(0.15, 0.85, moon);
            uni.uMoonK.value = moonK;
            uni.uMoonMelt.value = 1 - g('cool');
            const moonBlur = smoothstep(0.3, 3, (rate * 365.25) / 27.3);
            uni.uMoonBlur.value = moonBlur;
            cloud.u.uAlpha.value = f.alpha * smoothstep(11.2, 10.2, f.e);

            // The depth-only spheres follow what they hide.
            earthOcc.scale.setScalar(radius * 0.985);
            earthOcc.visible = grow > 0.05;
            theiaOcc.position.copy(theia);
            theiaOcc.scale.setScalar(RT * 0.97 * (1 - smoothstep(0.1, 0.2, imp)));
            theiaOcc.visible = imp > 0 && imp < 0.2;
            moonOcc.position.copy(moonC);
            moonOcc.scale.setScalar(RM * 0.97 * (0.45 + 0.55 * moonK));
            moonOcc.visible = moonK > 0.6 && moonBlur < 0.3;
            atmo.scale.setScalar(radius * 1.03);
            const melt = g('melt');
            rimCol.setRGB(1.0, 0.45, 0.15).multiplyScalar(0.55 * Math.max(melt, heat)).lerp(new THREE.Color(0.35, 0.6, 1.0).multiplyScalar(0.5), g('sea'));
            const am = atmo.material as THREE.ShaderMaterial;
            am.uniforms.uAlpha.value = f.alpha * smoothstep(10.6, 9.6, f.e);
            am.uniforms.uNight.value = Math.max(melt, heat) * 0.6;

            // The dust of the disk, streaming past on the way in.
            rubble.update(f.camera, object, f.focal, f.dpr, f.time, f.alpha * smoothstep(13.2, 12.2, f.e) * (1 - smoothstep(10.4, 9.5, f.e)), -f.e * 1.25);

            // The glow: in camera space (the camera never turns; the scene does).
            const cam = f.camera;
            gu.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
            gu.uAspect.value = cam.aspect;
            object.updateMatrixWorld();
            local.getWorldQuaternion(q);
            sunEra.value.copy(SUN_L).applyQuaternion(q);
            gu.uSunW.value.copy(sunEra.value);
            solid.update(sunEra.value, f.time, f.focal, f.alpha * smoothstep(11, 10.2, f.e));
            cloud.u.uMaxPx.value = 48 * f.dpr;
            m4.extractRotation(local.matrixWorld);
            m3.setFromMatrix4(m4).transpose();
            gu.uSky.value.copy(m3);
            w.set(0, 0, 0).applyMatrix4(local.matrixWorld).sub(cam.position);
            const scale = tmpV.setFromMatrixColumn(local.matrixWorld, 0).length();
            const dist = w.length();
            gu.uEarthW.value.copy(w).divideScalar(Math.max(dist, 1e-9)).multiplyScalar(1);
            // (in directions: the Earth's angular radius, as a sine, against the unit vector)
            gu.uEarthR.value = grow > 0.05 && dist > radius * scale ? (radius * scale) / dist : 0;
            const flash = g('flash');
            w.copy(CONTACT).multiplyScalar(0.62).applyMatrix4(local.matrixWorld).sub(cam.position).normalize();
            gu.uFlashW.value.copy(w);
            gu.uFlash.value = flash * 1.5 * f.alpha;
            gu.uFlood.value = g('flood') * f.alpha;
            gu.uSunK.value = f.alpha * 0.9;
            gu.uStars.value = f.alpha * 0.6;

            // Our proton: on its rock, down onto the Earth, then on the turning surface.
            const kf = smoothstep(OUR_FALL, OUR_FALL + 0.07, g('sweep'));
            if (kf < 1) {
              const fall = OUR_ROCK.clone().normalize().multiplyScalar(R * 0.96).sub(OUR_ROCK);
              ourLocal.copy(OUR_ROCK).addScaledVector(fall, kf * kf);
            } else {
              // (where it landed; the ground turns under it, the point stays facing the same way)
              ourLocal.copy(OUR_ROCK).setLength(radius * 1.01);
            }
            ours.copy(ourLocal).applyQuaternion(Q_LOCAL);
            Object.assign(st, { imp, moon, sea: g('sea') });
          },
          proton: () => ours,
          placa(g, f, on, toScreen) {
            if (!on || f.alpha < 0.4) return;
            const { u } = f;
            const at = (v: THREE.Vector3) => toScreen(toEra(v));
            if (st.imp > 0.01 && st.imp < 0.12) {
              const t = at(theia);
              if (t.z < 1) nota(g, u, t.x, t.y, 'Tea · del tamaño de Marte', -70, -50, 0, f.alpha);
            }
            if (st.moon > 0.4 && st.sea < 0.2) {
              const m = at(moonC);
              if (m.z < 1) nota(g, u, m.x, m.y, 'la Luna · a ~25 000 km (hoy, 384 000)', 60, -46, 0, f.alpha);
            }
            if (st.imp > 0.5 && st.moon < 0.3) {
              const p0 = at(A.clone().multiplyScalar(ROCHE * Math.cos(1.2)).addScaledVector(B, ROCHE * Math.sin(1.2)));
              if (p0.z < 1) nota(g, u, p0.x, p0.y, 'límite de Roche: adentro no se forma una luna', 50, 40, 0, f.alpha);
            }
          },
        };
      },
    },
    choreo(tl, era) {
      const lbAgo = (gyr: number) => LB(gyr * 1e9);
      tl.with(0.02, { reloj: 1 });
      tl.set({ lb: lbAgo(4.548), 'tie.grow': 0.55, 'tie.sweep': 0, 'tie.melt': 1, 'tie.heat': 0, 'tie.shock': 0, 'tie.sea': 0, 'tie.cloud': 0, 'tie.imp': 0, 'tie.orbit': 0, 'tie.moon': 0, 'tie.moonD': MOON_R0, 'tie.cool': 0, 'tie.rain': 0, 'tie.flash': 0, 'tie.flood': 0, 'tie.rot': 0, 'tie.theia': 0 });
      // Into the disk, falling through its dust, to the swarm of rocks.
      const v0 = vistaL(PATH, { yaw: 0, roll: 1.2 });
      tl.to(3.6, { era: era.index, e: 9.5, lb: lbAgo(4.545), fondo: 1, horno: 0, fov: 62, ...v0, bloom: 0.42, umbral: 0.3, ...viaje(PATH.clone().multiplyScalar(500)) });
      tl.label('tierra');
      tl.caption(4.6, 'Polvo, piedras, planetas', 'El polvo se pega en piedras, y las piedras en rocas que chocan. Una trae tu protón, en un poco de hielo.');
      // Through the swarm, first person, towards the young Earth.
      const v1 = vistaL(new THREE.Vector3(0.05, 0.1, 1), v0);
      tl.to(4.6, { e: 8.0, lb: lbAgo(4.53), 'tie.grow': 0.85, 'tie.sweep': 0.62, ...v1, roll: v1.roll + 0.12, ...viaje(PATH.clone().multiplyScalar(26)) });
      // The young Earth: molten. Time almost stands still; the camera circles it.
      tl.caption(4.4, 'La Tierra, al rojo', 'Cada choque la calienta. La Tierra es un océano de roca fundida.');
      const v2 = vistaL(new THREE.Vector3(0.45, 0.32, 0.85), v1);
      tl.to(2.4, { e: 7.5, lb: lbAgo(4.512), 'tie.grow': 1, 'tie.sweep': 0.97, ...v2, ...viaje(new THREE.Vector3(0, 0, 0)) });
      const v3 = vistaL(VD, v2);
      tl.to(2.0, { e: 7.62, lb: lbAgo(4.5101), 'tie.sweep': 1, 'tie.rot': 0.5, ...v3 });
      // Theia: it comes from the left and hits at an angle; the flash, the arm of molten rock.
      tl.caption(6.0, 'Tea', 'Un planeta del tamaño de Marte choca con la Tierra.');
      const focusD = CONTACT.clone().multiplyScalar(0.4).addScaledVector(W, -18);
      tl.with(0.9, { 'tie.theia': 1 });
      tl.to(2.8, { e: 7.95, lb: lbAgo(4.51), 'tie.imp': 0.1, 'tie.rot': 0.62, ...viaje(focusD), fov: 56 });
      tl.to(0.35, { 'tie.imp': 0.16, 'tie.flash': 1, 'tie.flood': 0.55, 'tie.heat': 1, 'tie.shock': 1, fov: 66, bloom: 0.3, umbral: 0.5, ...viaje(CONTACT.clone().multiplyScalar(0.3)) });
      tl.to(1.4, { 'tie.imp': 0.36, 'tie.flash': 0.25, 'tie.flood': 0, 'tie.shock': 0.4, e: 7.98, fov: 58, bloom: 0.42, umbral: 0.3, ...viaje(new THREE.Vector3(0, 0, 0)) });
      tl.to(1.5, { 'tie.imp': 0.62, 'tie.flash': 0, 'tie.shock': 0, 'tie.heat': 0.6, 'tie.orbit': 0.6, 'tie.cool': 0.25, 'tie.rot': 1.2, e: 8.05, ...vistaL(new THREE.Vector3(0.35, 0.7, 0.62), v3) });
      // Into the ring, first person: the Moon gathers ahead.
      tl.caption(5.0, 'Nace la Luna', 'De los restos nace la Luna, mucho más cerca que hoy.');
      const ringCam = A.clone().multiplyScalar(Math.cos(PHI_M - 1.3)).addScaledVector(B, Math.sin(PHI_M - 1.3)).multiplyScalar(MOON_R0 * 1.05);
      const toMoon = A.clone().multiplyScalar(Math.cos(PHI_M + 0.25)).addScaledVector(B, Math.sin(PHI_M + 0.25)).multiplyScalar(MOON_R0 * 0.95);
      const vRing = vistaL(ringCam.clone().sub(toMoon).setY(3.5), v3);
      tl.to(2.4, { 'tie.imp': 0.9, 'tie.orbit': 2.4, 'tie.rain': 0.6, 'tie.heat': 0.3, 'tie.rot': 2.0, 'tie.moon': 0.12, 'tie.cool': 0.38, e: 7.4, bloom: 0.32, umbral: 0.4, ...vRing, ...viaje(toMoon.clone().lerp(ringCam, 0.35)) });
      tl.to(2.6, { 'tie.imp': 1, 'tie.orbit': 4.2, 'tie.rain': 1, 'tie.heat': 0, 'tie.moon': 0.8, 'tie.cool': 0.5, bloom: 0.42, umbral: 0.3, 'tie.rot': 2.8, lb: lbAgo(4.5099), e: 7.25, ...vistaL(ringCam.clone().sub(toMoon).setY(5).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), vRing), ...viaje(toMoon) });
      // It cools, it rains: the oceans. Time runs again (the days blur into bands, the Moon into a
      // ring of light that draws back); the camera pulls out to where «Ahora» begins.
      tl.caption(6.2, 'Llueve', 'La Tierra se enfría, llueve y nacen los océanos. Tu protón cae con la lluvia.');
      tl.to(2.8, { 'tie.moon': 1, 'tie.melt': 0.25, 'tie.cool': 1, 'tie.cloud': 1, 'tie.sea': 0.4, 'tie.moonD': MOON_R0 * 2.0, lb: lbAgo(4.47), e: 7.65, ...vistaL(new THREE.Vector3(0.6, 0.35, 0.72), vRing), ...viaje(new THREE.Vector3(0, 0, 0)) });
      tl.to(3.4, { 'tie.melt': 0, 'tie.sea': 1, 'tie.cloud': 0.8, 'tie.moonD': 150, lb: lbAgo(4.25), e: 8.3, yaw: -1.1, pitch: 0.42, roll: 0.05, fov: 50 });
    },
  };
}
