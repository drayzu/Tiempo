import * as THREE from 'three';
import { materiaBuilder } from '../engine/materia';

/**
 * An infinite zoom: a field of points that looks the same at every scale, for the eras that cross
 * many orders of magnitude with nothing of a single size to show (inflation stretching its
 * wrinkles; the cooling gas between atoms and the cosmic web).
 *
 * Layers of the same pattern sit a fixed number of decades apart, around the camera. As `zoom`
 * grows (in decades) every layer grows; the largest fades out as it passes the camera and comes back
 * as the smallest, so the zoom never ends and never repeats visibly. Positions are relative to the
 * camera (turning with the scene, so the view can still look around), not to the era's units.
 */

const VERT = /* glsl */ `
  attribute vec3 color;
  attribute float aLayer, size, seed;
  uniform float uZoom, uSpacing, uLayers, uFocal, uMinPx, uMaxPx, uAlpha, uTime, uWobble, uFreeze, uContrast;
  uniform vec3 uCam;
  uniform mat3 uRot;
  varying vec3 vEm;
  void main() {
    // Where this layer is in its cycle (0 smallest .. uLayers largest).
    float cyc = mod(aLayer + uZoom / uSpacing, uLayers);
    float scale = pow(10.0, (cyc - uLayers * 0.5) * uSpacing);
    // Small wrinkles still ripple; once larger than the horizon they freeze.
    float live = 1.0 - smoothstep(uFreeze - 0.8, uFreeze + 0.8, cyc);
    vec3 q = position;
    q += uWobble * live * 0.06 * vec3(sin(uTime * 3.0 + seed * 40.0), cos(uTime * 2.6 + seed * 31.0), sin(uTime * 2.2 + seed * 17.0));
    vec3 w = uCam + uRot * (q * scale);
    vec4 mv = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 1e-6);
    float s = size * scale * uFocal / depth;
    gl_PointSize = clamp(s, uMinPx, uMaxPx);
    float dim = min(1.0, (s * s) / (uMinPx * uMinPx));
    float fade = sin(3.14159 * cyc / uLayers);
    // Contrast: 0 an even mist, 1 the pattern itself (seed < contrast keeps a point bright).
    float clump = mix(0.35, 1.0, step(seed, uContrast));
    vEm = color * dim * fade * fade * uAlpha * clump;
    if (vEm.r + vEm.g + vEm.b < 1e-4 || mv.z > -1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vEm;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    gl_FragColor = vec4(vEm * exp(-dot(c, c) * 14.0), 1.0);
  }
`;

export interface InfinitoOpts {
  seed: number;
  layers?: number;
  /** Decades between layers. */
  spacing?: number;
  perLayer: number;
  /** Fills one layer's pattern in a unit ball around the camera; return false to reject a point. */
  point(r: () => number, out: { x: number; y: number; z: number; hex: number; size: number; light: number }): boolean;
}

export function infinitoData(o: InfinitoOpts) {
  const K = o.layers ?? 8;
  const b = materiaBuilder(o.seed);
  const layer: number[] = [];
  const pt = { x: 0, y: 0, z: 0, hex: 0, size: 0, light: 0 };
  for (let k = 0; k < K; k++) {
    let made = 0;
    let tries = 0;
    while (made < o.perLayer && tries++ < o.perLayer * 40) {
      if (!o.point(b.r, pt)) continue;
      b.push(pt.x, pt.y, pt.z, pt.hex, pt.size, pt.light);
      layer.push(k);
      made++;
    }
  }
  return { field: b.data(), layer: new Float32Array(layer), K };
}

export function infinito(data: ReturnType<typeof infinitoData>, spacing = 0.5) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.field.position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.field.color, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(data.field.size, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(data.field.seed, 1));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(data.layer, 1));
  const u = {
    uZoom: { value: 0 },
    uSpacing: { value: spacing },
    uLayers: { value: data.K },
    uFocal: { value: 1000 },
    uMinPx: { value: 1.6 },
    uMaxPx: { value: 30 },
    uAlpha: { value: 1 },
    uTime: { value: 0 },
    uWobble: { value: 0 },
    uFreeze: { value: 99 },
    uContrast: { value: 1 },
    uCam: { value: new THREE.Vector3() },
    uRot: { value: new THREE.Matrix3() },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  points.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  return {
    points,
    u,
    /** Per frame: the camera, the scene's turn (the era group's world rotation), and the zoom in decades. */
    update(camera: THREE.Camera, group: THREE.Object3D, focal: number, dpr: number, time: number, alpha: number, zoom: number) {
      u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
      // The scene turns about the focus; the field turns with it, around the camera.
      m4.extractRotation(group.matrixWorld);
      u.uRot.value.setFromMatrix4(m4);
      u.uFocal.value = focal;
      u.uMinPx.value = 1.6 * dpr;
      u.uMaxPx.value = 30 * dpr;
      u.uTime.value = time;
      u.uAlpha.value = alpha;
      u.uZoom.value = zoom;
    },
  };
}

/**
 * The same endless zoom, drawn as plate lines: layers of a wrinkled lattice (Planck's foam, stretched)
 * facing the camera, each a fixed number of decades larger than the last. Small layers still churn;
 * once larger than `uFreeze` (in layers) they hold still.
 */
const LINE_VERT = /* glsl */ `
  attribute float aLayer, aLight;
  uniform float uZoom, uSpacing, uLayers, uAlpha, uTime, uFreeze;
  uniform vec3 uCam;
  uniform mat3 uRot;
  varying float vA;
  void main() {
    float cyc = mod(aLayer + uZoom / uSpacing, uLayers);
    float scale = pow(10.0, (cyc - uLayers * 0.5) * uSpacing);
    float live = 1.0 - smoothstep(uFreeze - 0.8, uFreeze + 0.8, cyc);
    vec2 xy = position.xy;
    float t = uTime * 0.6 * live + aLayer * 7.0;
    xy += 0.05 * vec2(sin(xy.y * 5.0 + t), cos(xy.x * 5.0 - t * 0.8));
    float zz = 0.12 * sin(xy.x * 3.0 + aLayer) * cos(xy.y * 2.6 - aLayer * 0.7) + 0.06 * live * sin(xy.x * 9.0 + xy.y * 7.0 + t * 1.6);
    float a = aLayer * 0.61;
    vec2 rxy = vec2(cos(a) * xy.x - sin(a) * xy.y, sin(a) * xy.x + cos(a) * xy.y);
    vec3 q = vec3(rxy, -1.0 + zz) * scale;
    vec4 mv = viewMatrix * vec4(uCam + uRot * q, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = sin(3.14159 * cyc / uLayers);
    float edge = 1.0 - smoothstep(0.8, 1.45, length(position.xy));
    vA = fade * fade * edge * aLight * uAlpha;
  }
`;
const LINE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    gl_FragColor = vec4(uColor * vA, 1.0);
  }
`;

export function infinitoLineas(o: { layers?: number; spacing?: number; lines?: number; segments?: number; color: number; light?: number }) {
  const K = o.layers ?? 8;
  const N = o.lines ?? 34;
  const S = o.segments ?? 120;
  const pos: number[] = [];
  const layer: number[] = [];
  const light: number[] = [];
  const ext = 1.45;
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < N; i++) {
      const c = -ext + (2 * ext * i) / (N - 1);
      for (let j = 0; j < S; j++) {
        const a = -ext + (2 * ext * j) / S;
        const b = -ext + (2 * ext * (j + 1)) / S;
        pos.push(a, c, 0, b, c, 0, c, a, 0, c, b, 0);
        for (let m = 0; m < 4; m++) {
          layer.push(k);
          light.push(i % 5 === 0 ? 1 : 0.45);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
  geo.setAttribute('aLight', new THREE.Float32BufferAttribute(light, 1));
  const u = {
    uZoom: { value: 0 },
    uSpacing: { value: o.spacing ?? 0.5 },
    uLayers: { value: K },
    uAlpha: { value: 1 },
    uTime: { value: 0 },
    uFreeze: { value: 99 },
    uCam: { value: new THREE.Vector3() },
    uRot: { value: new THREE.Matrix3() },
    uColor: { value: new THREE.Color(o.color).multiplyScalar(o.light ?? 0.3) },
  };
  const lines = new THREE.LineSegments(
    geo,
    new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: u, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  lines.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  return {
    lines,
    u,
    update(camera: THREE.Camera, group: THREE.Object3D, time: number, alpha: number, zoom: number) {
      u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
      m4.extractRotation(group.matrixWorld);
      u.uRot.value.setFromMatrix4(m4);
      u.uTime.value = time;
      u.uAlpha.value = alpha;
      u.uZoom.value = zoom;
    },
  };
}
