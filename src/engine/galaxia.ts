import * as THREE from 'three';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../lib/glsl';

/**
 * Galaxies as smooth light, drawn per pixel (camera space; the camera never turns).
 *
 * - A disk galaxy seen from outside: the ray meets its plane; there the disk's light (an exponential
 *   disk wound into two arms, warm inside, bluer outside, pink knots where stars are born) is seen
 *   through its thickness (brighter edge on), a bulge glows around the centre, and dust in the arms
 *   dims what lies behind (the dark lanes of an edge-on galaxy).
 * - The same disk from inside (the camera in its plane, where the Sun is): the light is gathered along
 *   the ray as long as it stays in the disk, so the disk is a band across the sky, brighter towards
 *   the bulge, split by a rift of dust: the Milky Way as seen from here.
 * - An elliptical galaxy: a smooth spheroid of old stars (what the two become).
 * - Stars around, denser towards the band, from inside.
 *
 * Particles draw the stars that stand out and what tides throw out; this draws the light of the
 * hundreds of billions that do not.
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
  uniform vec3 uCam;
  uniform vec3 uC[2], uN[2], uX[2];
  uniform float uRd[2], uL[2], uWind[2], uPhase[2], uDust[2], uTwist[2], uH[2];
  uniform vec3 uEC;
  uniform float uER, uEL, uStars, uBurst, uRed, uAlpha, uTime;
  uniform mat3 uSky;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}

  float arms(float R, float phi, float wind, float phase) {
    float a = 0.5 + 0.5 * cos(2.0 * (phi - wind * log(R + 0.08)) + phase);
    return 0.3 + 0.7 * pow(a, 2.2);
  }
  vec3 starCol(float R) {
    return mix(vec3(1.0, 0.8, 0.58), vec3(0.74, 0.84, 1.0), smoothstep(0.5, 2.4, R));
  }
  // The old light reddens as the stars die (the blue, massive ones first).
  vec3 age(vec3 c) { return mix(c, vec3(1.0, 0.42, 0.22) * dot(c, vec3(0.33)), uRed); }

  // Outside: where the ray meets the plane. Returns light (rgb) and what passes behind (a).
  vec4 surface(int i, vec3 O, vec3 d) {
    vec3 N = uN[i];
    vec3 X = uX[i];
    vec3 Z = cross(X, N);
    float dn = dot(d, N);
    vec3 oc = uC[i] - O;
    float t = dot(oc, N) / (abs(dn) < 1e-5 ? 1e-5 : dn);
    vec3 col = vec3(0.0);
    float T = 1.0;
    // The bulge: light gathered along the ray past the centre (impact parameter b).
    float tc = dot(oc, d);
    float b = length(oc - d * tc) / uRd[i];
    float bul = exp(-b / 0.32) * (1.0 + b / 0.32) * smoothstep(-uRd[i] * 1.5, uRd[i] * 0.5, tc);
    if (t > 0.0) {
      vec3 P = O + d * t - uC[i];
      float x = dot(P, X) / uRd[i];
      float z = dot(P, Z) / uRd[i];
      float R = length(vec2(x, z));
      float phi = atan(z, x) + uTwist[i] * R;
      float proj = 1.0 / max(abs(dn), 0.05);
      float sigma = exp(-R) * smoothstep(7.5, 4.0, R);
      float arm = arms(R, phi, uWind[i], uPhase[i]);
      float knots = smoothstep(0.55, 0.9, snoise(vec3(x * 3.0, z * 3.0, float(i) * 9.0))) * arm * smoothstep(0.6, 1.5, R);
      vec3 lit = starCol(R) * sigma * arm + vec3(1.0, 0.36, 0.5) * knots * sigma * (0.6 + 2.5 * uBurst);
      float tau = uDust[i] * exp(-R / 1.7) * arms(R, phi + 0.45, uWind[i], uPhase[i]) * smoothstep(0.25, 0.9, R) * (0.6 + 0.4 * snoise(vec3(x * 5.0, z * 5.0, 3.0)));
      T = exp(-tau * proj * 0.5);
      col += age(lit) * min(proj, 14.0) * 0.07 * (0.5 + 0.5 * T);
      // The bulge's far half is behind the dust.
      float behind = step(t, tc);
      bul *= mix(1.0, 0.5 + 0.5 * T, behind);
    }
    col += age(vec3(1.0, 0.83, 0.62)) * bul * 0.55;
    return vec4(col * uL[i], T);
  }

  // Inside: the camera in the disk; gather light along the ray while it stays in it.
  vec3 inside(int i, vec3 O, vec3 d, out float wIn) {
    vec3 N = uN[i];
    vec3 X = uX[i];
    vec3 Z = cross(X, N);
    vec3 oc = O - uC[i];
    float Rd = uRd[i];
    float H = uH[i] * Rd;
    float zc = dot(oc, N);
    vec2 xc = vec2(dot(oc, X), dot(oc, Z));
    wIn = smoothstep(7.0 * H, 3.0 * H, abs(zc)) * smoothstep(6.0, 4.5, length(xc) / Rd);
    if (wIn < 0.002) return vec3(0.0);
    float dz = dot(d, N);
    vec2 dxz = vec2(dot(d, X), dot(d, Z));
    float tmax = min(9.0 * Rd, (5.0 * H + abs(zc)) / max(abs(dz), 1e-3));
    vec3 acc = vec3(0.0);
    float T = 1.0;
    const int K = 22;
    for (int k = 0; k < K; k++) {
      float s = (float(k) + 0.5) / float(K);
      float t = tmax * s * s;
      float dt = tmax * 2.0 * s / float(K);
      vec2 p = xc + dxz * t;
      float z = zc + dz * t;
      float R = length(p) / Rd;
      float phi = atan(p.y, p.x) + uTwist[i] * R;
      float arm = arms(R, phi, uWind[i], uPhase[i]);
      float disk = exp(-R) * exp(-abs(z) / H) * arm * smoothstep(7.5, 4.0, R);
      float bul = 0.7 * exp(-length(vec3(p, z * 2.2)) / (0.28 * Rd));
      float dust = uDust[i] * 2.2 * exp(-R / 1.7) * exp(-abs(z) / (0.35 * H)) * arms(R, phi + 0.45, uWind[i], uPhase[i]) * (0.5 + 0.5 * snoise(vec3(p / Rd * 4.0, z / H)));
      vec3 lit = starCol(R) * disk + vec3(1.0, 0.83, 0.62) * bul;
      acc += T * age(lit) * dt / Rd;
      T *= exp(-dust * dt / Rd);
    }
    return acc * uL[i] * 1.25 * wIn;
  }

  // The elliptical: a spheroid of old stars, gathered along the ray from the camera.
  vec3 elliptical(vec3 O, vec3 d) {
    if (uEL <= 0.0) return vec3(0.0);
    vec3 oc = O - uEC;
    float tc = -dot(oc, d);
    float b = length(oc + d * tc) / uER;
    float inside = smoothstep(4.0, 2.0, length(oc) / uER);
    // Along the whole line (outside), or from the camera on (inside).
    float full = exp(-sqrt(b) * 2.2) * 2.0;
    float half_ = full * (0.5 + 0.5 * tanh(tc / uER * 1.5));
    float L = mix(full * step(0.0, tc + uER * 3.0), half_, inside);
    return age(vec3(1.0, 0.84, 0.66)) * L * uEL * 0.45;
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 O = uCam;
    vec3 col = vec3(0.0);
    // Inside our galaxy (galaxy 0), its band and stars.
    float wIn;
    col += inside(0, O, d, wIn);
    vec3 sd = uSky * d;
    vec2 ll = vec2(atan(sd.z, sd.x), asin(clamp(sd.y, -1.0, 1.0)));
    float band = exp(-pow(sd.y / 0.3, 2.0));
    float st = starField(ll * 70.0, 0.05 + 0.1 * band, 0.0) + 0.7 * starField(ll * 160.0 + 3.0, 0.04 + 0.12 * band, 0.0) + 0.45 * starField(ll * 330.0 + 7.0, 0.04 + 0.16 * band, 0.0);
    // (inside the elliptical, its stars are all around too)
    float wE = step(1e-4, uEL) * smoothstep(4.0, 2.0, length(O - uEC) / uER);
    col += age(vec3(0.9, 0.93, 1.0)) * st * uStars * max(wIn * (1.0 - wE), wE * 1.4);
    // Disks from outside, the nearer one in front (its dust dims the farther).
    float t0 = dot(uC[0] - O, d);
    float t1 = dot(uC[1] - O, d);
    vec4 a = surface(0, O, d);
    vec4 b = surface(1, O, d);
    a.rgb *= 1.0 - wIn;
    a.a = mix(a.a, 1.0, wIn);
    if (t0 < t1) col += a.rgb + b.rgb * a.a;
    else col += b.rgb + a.rgb * b.a;
    col += elliptical(O, d);
    gl_FragColor = vec4(col * uAlpha, 1.0);
  }
`;

export interface Disco {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  x: THREE.Vector3;
  /** Scale length (world units) and brightness. */
  rd: number;
  light: number;
  wind?: number;
  phase?: number;
  dust?: number;
  /** Tides: the disk's pattern twisted by this much per scale length. */
  twist?: number;
  /** Thickness in scale lengths. */
  h?: number;
}

export function crearGalaxias() {
  const u = {
    uTanHalf: { value: 0.5 },
    uAspect: { value: 16 / 9 },
    uCam: { value: new THREE.Vector3() },
    uC: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uN: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] },
    uX: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
    uRd: { value: [1, 1] },
    uL: { value: [0, 0] },
    uWind: { value: [2.2, 2.0] },
    uPhase: { value: [0, 1] },
    uDust: { value: [1, 1] },
    uTwist: { value: [0, 0] },
    uH: { value: [0.09, 0.09] },
    uEC: { value: new THREE.Vector3() },
    uER: { value: 1 },
    uEL: { value: 0 },
    uStars: { value: 1 },
    uBurst: { value: 0 },
    uRed: { value: 0 },
    uAlpha: { value: 1 },
    uTime: { value: 0 },
    uSky: { value: new THREE.Matrix3() },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -60;
  return {
    mesh,
    u,
    disco(i: number, g: Disco) {
      u.uC.value[i].copy(g.center);
      u.uN.value[i].copy(g.normal).normalize();
      u.uX.value[i].copy(g.x).normalize();
      u.uRd.value[i] = g.rd;
      u.uL.value[i] = g.light;
      u.uWind.value[i] = g.wind ?? 2.2;
      u.uPhase.value[i] = g.phase ?? 0;
      u.uDust.value[i] = g.dust ?? 1;
      u.uTwist.value[i] = g.twist ?? 0;
      u.uH.value[i] = g.h ?? 0.09;
    },
    frame(camera: THREE.PerspectiveCamera, alpha: number, time: number) {
      u.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      u.uAspect.value = camera.aspect;
      u.uCam.value.copy(camera.position);
      u.uAlpha.value = alpha;
      u.uTime.value = time;
      mesh.visible = alpha > 0.002;
    },
  };
}
