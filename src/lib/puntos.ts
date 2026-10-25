import * as THREE from 'three';
import { rng } from './math';

/** Additive points of light that breathe, drift and twinkle. Shared by every particle world. */
export const POINT_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float seed;
  attribute float drift;
  uniform float uTime, uPR, uScale, uTwinkle;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vec3 p = position;
    float t = uTime;
    p.xy *= 1.0 + 0.007 * sin(t * 0.8 + length(p.xy) * 3.0);
    p += drift * vec3(sin(t * 0.9 + seed * 17.0), cos(t * 0.7 + seed * 23.0), sin(t * 0.5 + seed * 31.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Points never shrink below ~1.6 px: smaller ones dim by their lost area instead,
    // so far-away particles fade smoothly rather than hopping between pixels.
    float sz = size * uPR * uScale / -mv.z;
    float minSz = 1.6 * uPR;
    float px = max(sz, minSz);
    gl_PointSize = min(px, 48.0);
    gl_Position = projectionMatrix * mv;
    vColor = color * min(1.0, (sz * sz) / (minSz * minSz));
    // Opt-in shimmer (off by default: across thousands of points it reads as static).
    vTw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(t * (0.6 + fract(seed * 7.0)) + seed * 40.0));
  }
`;

export const POINT_FRAG = /* glsl */ `
  uniform float uGain;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * a * a * vTw * uGain, 1.0);
  }
`;

export function pointBuilder(seed: number) {
  const r = rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const size: number[] = [];
  const seeds: number[] = [];
  const drift: number[] = [];
  const flags: number[] = [];
  const c = new THREE.Color();

  const geometry = () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
    geo.setAttribute('drift', new THREE.Float32BufferAttribute(drift, 1));
    geo.setAttribute('flag', new THREE.Float32BufferAttribute(flags, 1));
    return geo;
  };

  return {
    r,
    onSphere(): [number, number, number] {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      return [Math.cos(a) * s, Math.sin(a) * s, u];
    },
    /** `flag` marks points a world may hide on demand (e.g. the stand-in for a nested world). */
    push(x: number, y: number, z: number, hex: number, s: number, d: number, light = 1, flag = 0) {
      pos.push(x, y, z);
      c.setHex(hex).multiplyScalar(light * (0.75 + r() * 0.5));
      col.push(c.r, c.g, c.b);
      size.push(s * (0.6 + r() * 0.8));
      seeds.push(r());
      drift.push(d);
      flags.push(flag);
    },
    geometry,
    build(pixelRatio: number) {
      const geo = geometry();
      const mat = new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio }, uScale: { value: 3.2 }, uGain: { value: 1 }, uTwinkle: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      return { points, mat };
    },
  };
}

/** Ken Perlin's improved noise, for placing points on the CPU. */
export function perlin3(seed: number) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const base = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  const grad = (h: number, x: number, y: number, z: number) => {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  const noise = (x: number, y: number, z: number) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      w,
      lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
      lerp(
        v,
        lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1)),
      ),
    );
  };
  return (x: number, y: number, z: number, octaves = 5) => {
    let v = 0;
    let a = 0.5;
    for (let i = 0; i < octaves; i++) {
      v += a * noise(x, y, z);
      x = x * 2.03 + 1.7;
      y = y * 2.03 + 9.2;
      z = z * 2.03 + 3.1;
      a *= 0.5;
    }
    return v;
  };
}
