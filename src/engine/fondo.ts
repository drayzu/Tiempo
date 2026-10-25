import * as THREE from 'three';
import { smoothstep } from '../lib/math';
import { logTemperature, transparency } from '../lib/cosmo';
import { bbColor, bbVisible } from '../lib/cuerpo-negro';
import { NOISE_GLSL, SIMPLEX3_GLSL } from '../lib/glsl';

/**
 * The background is the temperature of the universe: the radiation that fills it, in the colour of
 * its temperature (Planck's law) and as bright as a dark-adapted eye would see it. Blue-white and
 * blinding at first, then yellow, orange, red; black after about three million years.
 *
 * Two ways of showing it, chosen in the phase-0 study and mixed by the `horno` track:
 * - Brasa (the base): black, with the glow as a living ink between the particles; while the
 *   universe is an opaque fog it fills the view in clouds with dark gaps; when the light breaks free
 *   it thins to wisps and retreats to a distant wall, mottled hot and cold.
 * - Horno (the peaks): the whole screen is the light. Boiling while opaque; once clear, a far wall.
 *
 * Drawn at infinity: each pixel knows where it looks, so the background turns with the camera.
 * While the plasma lasts, its sound waves (baryon acoustic oscillations) make it breathe; they
 * freeze when the light lets go.
 */

const VERT = /* glsl */ `
  uniform mat3 uCamRot;
  uniform float uTanHalf, uAspect;
  varying vec2 vUv;
  varying vec3 vDir;
  void main() {
    vUv = uv;
    vec2 s = (uv * 2.0 - 1.0) * vec2(uAspect * uTanHalf, uTanHalf);
    vDir = uCamRot * vec3(s, -1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uBB, uBBH;
  uniform float uHorno, uDens, uWall, uFogA, uWallH, uWaveT, uSound, uTime, uAspect;
  varying vec2 vUv;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SIMPLEX3_GLSL}
  float wallNoise(vec3 d) {
    return snoise(d * 4.5) * 0.6 + snoise(d * 11.0) * 0.3 + snoise(d * 26.0) * 0.12;
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.0);
    float r = length((vUv - 0.5) * vec2(uAspect, 1.0));
    if (uHorno < 0.999 && (uBB.r + uBB.g + uBB.b) > 1e-5) {
      // Brasa: clouds of glowing ink with dark gaps, thinning to wisps, then a far wall.
      float n1 = snoise(d * 2.0 + vec3(0.0, 0.0, uTime * 0.035));
      float n2 = snoise(d * 5.0 - vec3(uTime * 0.03, 0.0, 0.0) + n1 * 0.4);
      float n3 = snoise(d * 12.0 + n2 * 0.5);
      float m = clamp(0.5 + 0.34 * n1 + 0.22 * n2 + 0.1 * n3, 0.0, 1.0);
      float breathe = 1.0 + uSound * 0.08 * sin(uWaveT * 2.2 + n1 * 4.0);
      float ink = smoothstep(mix(0.82, 0.18, uDens), 1.0, m) * (0.35 + 0.65 * m) * smoothstep(0.0, 0.3, uDens) * breathe;
      ink *= mix(1.0, smoothstep(1.15, 0.05, r), 0.55);
      float w = wallNoise(d);
      vec3 hot = uBB * vec3(1.25, 0.95, 0.75);
      vec3 cold = uBB * vec3(0.6, 0.75, 1.35);
      vec3 wall = mix(cold, hot, clamp(0.5 + w * 0.9, 0.0, 1.0)) * (0.75 + 0.25 * smoothstep(1.1, 0.2, r));
      col = uBB * ink * 1.7 + wall * uWall;
    }
    if (uHorno > 0.001) {
      // Horno: the screen is the light. Boiling inside the fog; once clear, the last-scattering wall.
      float n = snoise(d * 3.0 + vec3(0.0, 0.0, uTime * 0.05)) * 0.6 + snoise(d * 8.0 - vec3(uTime * 0.04)) * 0.3;
      float ac = sin(uWaveT * 2.2 + snoise(d * 1.6) * 4.0);
      float fog = 1.0 + uFogA * (0.13 * n + uSound * 0.07 * ac);
      float wall = 1.0 + uWallH * 0.12 * wallNoise(d);
      col = mix(col, uBBH * fog * wall, uHorno);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createFondo() {
  const u = {
    uCamRot: { value: new THREE.Matrix3() },
    uTanHalf: { value: 0.36 },
    uAspect: { value: 16 / 9 },
    uTime: { value: 0 },
    uBB: { value: new THREE.Vector3() },
    uBBH: { value: new THREE.Vector3() },
    uHorno: { value: 0 },
    uDens: { value: 1 },
    uWall: { value: 0 },
    uFogA: { value: 1 },
    uWallH: { value: 0 },
    uWaveT: { value: 0 },
    uSound: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, depthTest: false, depthWrite: false }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  const m4 = new THREE.Matrix4();
  const bb = { r: 0, g: 0, b: 0 };
  let waveT = 0;
  const state = { T: 0, logT: 0, vis: 0, clear: 0, bgL: 0, tinta: 0, wave: 0 };

  return {
    mesh,
    state,
    /**
     * Per frame. `lt`: log10 of seconds since the beginning; `gain` dims it (0 for eras drawn as a
     * plate: before the time we can speak of a temperature); `horno` mixes in the full-bleed way.
     * `over`: what an era says instead (the crunch heats the sky again, and makes it opaque).
     */
    update(lt: number, dt: number, time: number, camera: THREE.PerspectiveCamera, gain: number, horno: number, over?: { logT?: number; clear?: number }) {
      u.uCamRot.value.setFromMatrix4(m4.extractRotation(camera.matrixWorld));
      u.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      u.uAspect.value = camera.aspect;
      u.uTime.value = time;
      const t = Math.pow(10, lt);
      const logT = over?.logT ?? logTemperature(t);
      const T = Math.pow(10, Math.min(logT, 30));
      const vis = bbVisible(T) * gain;
      const clear = over?.clear ?? transparency(t);
      bbColor(T, bb);
      // Brasa: a modest glow, so the hue survives the tone curve.
      const kb = 0.55 * Math.pow(vis, 1.2);
      u.uBB.value.set(bb.r * kb, bb.g * kb, bb.b * kb);
      u.uDens.value = 1 - clear;
      u.uWall.value = 0.42 * smoothstep(0.1, 0.8, clear);
      // Horno: the screen itself, as bright as the eye would take it.
      const bgL = Math.pow(vis, 1.25);
      const kh = 0.02 * gain * smoothstep(2.4, 3, logT) + 1.2 * Math.pow(bgL, 1.1);
      u.uBBH.value.set(bb.r * kh, bb.g * kh, bb.b * kh);
      u.uFogA.value = 1 - clear;
      u.uWallH.value = clear;
      u.uHorno.value = horno;
      // The plasma's sound rings until the light lets go, then freezes.
      waveT += dt * (1 - clear);
      u.uWaveT.value = waveT;
      state.wave = waveT;
      u.uSound.value = (1 - clear) * smoothstep(-1, 2, lt);
      state.T = T;
      state.logT = logT;
      state.vis = vis;
      state.clear = clear;
      state.bgL = bgL * horno;
      // Over a bright full-bleed screen the interface ink turns dark.
      state.tinta = smoothstep(0.335, 0.35, bgL * horno);
    },
  };
}
