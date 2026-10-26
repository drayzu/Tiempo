import * as THREE from 'three';
import { bbColor } from '../lib/cuerpo-negro';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../lib/glsl';

/**
 * A black hole, ray traced: each pixel's ray is bent by the hole's gravity (Schwarzschild, the
 * photon orbit equation x'' = −3/2 h² x / r⁵ in units of the horizon's radius) and either falls in
 * (the shadow), crosses the accretion disk (thin, in its plane) or escapes to the sky (lensed stars).
 * So the far side of the disk shows above and below the hole, the photon ring outlines the shadow,
 * and the side of the disk coming towards us is brighter and bluer (Doppler beaming and the
 * gravitational redshift, from the disk's orbital speed).
 *
 * Without a disk, an evaporating hole glows by its Hawking radiation: the light comes from near the
 * horizon, so it looks like a glowing disc the size of the shadow, edged by the photon ring.
 *
 * Drawn in camera space (the camera never turns; the scene does), premultiplied: what the hole or the
 * disk covers is hidden, the light is added. Rays that never come near are only nudged (weak
 * deflection, 2 R/b), so the sky is lensed everywhere at little cost.
 */

const VERT = /* glsl */ `
  uniform float uTanHalf, uAspect;
  varying vec3 vDir;
  void main() {
    vec2 s = (uv * 2.0 - 1.0) * vec2(uAspect * uTanHalf, uTanHalf);
    vDir = vec3(s, -1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uCam, uBH, uN, uHawkCol, uSkyTint;
  uniform float uRs, uDiskIn, uDiskOut, uDiskL, uDiskT, uStars, uHawk, uTime, uAlpha, uSpin, uBand;
  uniform mat3 uSky;
  uniform sampler2D uBB;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  vec3 bb(float T) {
    float u = clamp((log(max(T, 1.0)) / log(10.0) - 3.0) / 2.5, 0.0, 1.0);
    return texture2D(uBB, vec2(u, 0.5)).rgb;
  }
  vec3 sky(vec3 dir) {
    vec3 sd = uSky * dir;
    vec2 ll = vec2(atan(sd.z, sd.x), asin(clamp(sd.y, -1.0, 1.0)));
    float s = starField(ll * 80.0, 0.09, 0.0) + 0.6 * starField(ll * 190.0 + 5.0, 0.07, 0.0) + 0.35 * starField(ll * 420.0 + 9.0, 0.06, 0.0);
    // A band of unresolved stars (a galaxy around us), soft and mottled.
    float band = exp(-pow(sd.y / 0.18, 2.0)) * (0.6 + 0.4 * snoise(sd * 6.0)) * uBand;
    return uSkyTint * (s * uStars + band * 0.05);
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 x = (uCam - uBH) / uRs;
    vec3 v = d;
    vec3 col = vec3(0.0);
    float cover = 0.0;
    const float R0 = 36.0;
    float bq = dot(x, v);
    float cq = dot(x, x) - R0 * R0;
    float hq = bq * bq - cq;
    if (cq > 0.0 && (hq < 0.0 || bq > 0.0)) {
      // Far from the hole: only nudged towards it (weak deflection).
      vec3 L = cross(x, v);
      float b = length(L);
      vec3 toward = normalize(cross(v, L));
      v = normalize(v - toward * (2.0 / max(b, 1.0)));
      gl_FragColor = vec4(sky(v) * uAlpha, 0.0);
      return;
    }
    if (cq > 0.0) x += v * (-bq - sqrt(hq));
    vec3 Lh = cross(x, v);
    float h2 = dot(Lh, Lh);
    float rmin = 1e9;
    bool done = false;
    for (int i = 0; i < 160; i++) {
      float r = length(x);
      rmin = min(rmin, r);
      if (r < 1.0) {
        // Into the hole: dark, or (evaporating) glowing with Hawking radiation, brightest towards
        // the edge of the shadow (b ≈ 2,6 R), where the light has skimmed the photon sphere longest.
        float bb = sqrt(h2);
        col += uHawkCol * uHawk * (0.25 + 0.75 * pow(smoothstep(0.5, 2.6, bb), 2.0));
        cover = 1.0;
        done = true;
        break;
      }
      if (r > R0 + 2.0 && dot(x, v) > 0.0) break;
      float dt = clamp(0.07 * (r - 0.75), 0.012, 2.5);
      vec3 acc = -1.5 * h2 * x / pow(r, 5.0);
      vec3 vn = v + acc * dt;
      vec3 xn = x + vn * dt;
      // The disk: where the ray crosses its plane between the inner and outer edges.
      float y0 = dot(x, uN);
      float y1 = dot(xn, uN);
      if (uDiskL > 0.0 && y0 * y1 < 0.0) {
        vec3 p = mix(x, xn, y0 / (y0 - y1));
        float rr = length(p);
        if (rr > uDiskIn && rr < uDiskOut) {
          // Temperature of a thin disk; turbulence wound by its own (Keplerian) turning.
          float T = uDiskT * pow(rr / uDiskIn, -0.75) * pow(max(1.0 - sqrt(uDiskIn / rr), 0.0), 0.25) * 1.9;
          vec3 phiHat = normalize(cross(uN, p));
          float beta = min(sqrt(0.5 / max(rr - 1.0, 0.05)), 0.95);
          float gamma = 1.0 / sqrt(1.0 - beta * beta);
          vec3 k = -normalize(vn);
          float D = 1.0 / (gamma * (1.0 - beta * dot(phiHat, k)));
          float g = D * sqrt(max(1.0 - 1.0 / rr, 0.0));
          vec3 e1 = normalize(cross(uN, vec3(0.31, 0.83, 0.47)));
          vec3 e2 = cross(uN, e1);
          float ang = atan(dot(p, e2), dot(p, e1));
          float spin = uTime * uSpin * pow(rr, -1.5) * 6.0;
          float swirl = 0.6 + 0.4 * snoise(vec3(rr * 1.4, cos(ang - spin) * 2.2, sin(ang - spin) * 2.2)) + 0.25 * snoise(vec3(rr * 5.0, cos(ang - spin) * 6.0, sin(ang - spin) * 6.0));
          float edge = smoothstep(uDiskOut, uDiskOut * 0.6, rr);
          float I = uDiskL * pow(g, 4.0) * pow(T / uDiskT, 4.0) * swirl * edge;
          col += bb(T * g) * I;
          cover = max(cover, smoothstep(0.0, 0.08, I) * edge);
          if (cover > 0.98) { done = true; break; }
        }
      }
      x = xn;
      v = vn;
    }
    // The photon ring: light that skimmed the photon sphere (1.5 R) on its way; and the glow of an
    // evaporating hole spilling a little beyond its shadow.
    float ring = exp(-pow((rmin - 1.5) / 0.05, 2.0));
    float bo = sqrt(h2);
    col += uHawkCol * uHawk * (ring * 2.5 + 0.35 * exp(-max(bo - 2.6, 0.0) / 0.9) * (1.0 - cover)) + vec3(1.0, 0.85, 0.7) * uDiskL * ring * 0.08;
    if (!done) col += sky(normalize(v)) * (1.0 - cover);
    gl_FragColor = vec4(col * uAlpha, cover * uAlpha);
  }
`;

export interface AgujeroFrame {
  camera: THREE.PerspectiveCamera;
  /** The hole's centre and the disk's normal, in world space; its horizon radius in world units. */
  center: THREE.Vector3;
  normal: THREE.Vector3;
  rs: number;
  /** The sky's turn (world → sky). */
  sky: THREE.Matrix3;
  time: number;
  alpha: number;
}

export function crearAgujero() {
  // A blackbody ramp, 10³ to 10⁵·⁵ K, each colour normalised to its brightest channel.
  const n = 256;
  const ramp = new Uint8Array(n * 4);
  const c = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < n; i++) {
    bbColor(Math.pow(10, 3 + (2.5 * i) / (n - 1)), c);
    const m = Math.max(c.r, c.g, c.b, 1e-6);
    ramp.set([Math.round((255 * c.r) / m), Math.round((255 * c.g) / m), Math.round((255 * c.b) / m), 255], i * 4);
  }
  const tex = new THREE.DataTexture(ramp, n, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const u = {
    uTanHalf: { value: 0.5 },
    uAspect: { value: 16 / 9 },
    uCam: { value: new THREE.Vector3() },
    uBH: { value: new THREE.Vector3() },
    uN: { value: new THREE.Vector3(0, 1, 0) },
    uRs: { value: 1 },
    uDiskIn: { value: 3 },
    uDiskOut: { value: 18 },
    uDiskL: { value: 1 },
    uDiskT: { value: 12000 },
    uStars: { value: 1 },
    uBand: { value: 0 },
    uSkyTint: { value: new THREE.Color(0.85, 0.9, 1.0) },
    uHawk: { value: 0 },
    uHawkCol: { value: new THREE.Color(1, 0.4, 0.2) },
    uTime: { value: 0 },
    uSpin: { value: 0.4 },
    uAlpha: { value: 1 },
    uSky: { value: new THREE.Matrix3() },
    uBB: { value: tex },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: u,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -30;
  return {
    mesh,
    u,
    update(f: AgujeroFrame) {
      u.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(f.camera.fov / 2));
      u.uAspect.value = f.camera.aspect;
      u.uCam.value.copy(f.camera.position);
      u.uBH.value.copy(f.center);
      u.uN.value.copy(f.normal).normalize();
      u.uRs.value = f.rs;
      u.uSky.value.copy(f.sky);
      u.uTime.value = f.time;
      u.uAlpha.value = f.alpha;
      mesh.visible = f.alpha > 0.002;
    },
  };
}
