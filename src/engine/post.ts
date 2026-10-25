import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Radial blur towards the centre; strength follows the zoom speed. Runs in linear light. */
const ZoomBlurShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int i = 0; i < 12; i++) {
        float t = float(i) / 11.0;
        float w = 1.0 - t * 0.6;
        acc += texture2D(tDiffuse, 0.5 + c * (1.0 - uStrength * t)).rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, 1.0);
    }
  `,
};

/** Grain, vignette and a touch of lens fringing, after tone mapping. */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.02 },
    uVignette: { value: 0.6 },
    uFringe: { value: 0.014 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uFringe;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      vec2 off = c * dot(c, c) * uFringe;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float v = smoothstep(0.95, 0.2, length(c * vec2(uRes.x / uRes.y, 1.0)));
      col *= mix(1.0, v, uVignette);
      col += (hash(vUv * uRes + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  // Phones and small touch screens: fewer pixels and no multisampling (the soft points do not need
  // it; the fill rate does). The look is the same, the frame much cheaper.
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  const fullDpr = Math.min(window.devicePixelRatio, light ? 1.25 : 1.75);
  // Adaptive quality scales this down when frames run slow (see setQuality).
  let dpr = fullDpr;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.001, 200);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: light ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  const zoomBlur = new ShaderPass(ZoomBlurShader);
  composer.addPass(zoomBlur);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.55, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  // Reduced motion: no radial blur.
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  const size = new THREE.Vector2();
  function resize() {
    size.set(innerWidth, innerHeight);
    renderer.setSize(size.x, size.y, false);
    composer.setSize(size.x, size.y);
    camera.aspect = size.x / size.y;
    camera.updateProjectionMatrix();
    finish.uniforms.uRes.value.set(size.x * dpr, size.y * dpr);
  }
  resize();

  return {
    renderer,
    scene,
    camera,
    bloom,
    size,
    get dpr() {
      return dpr;
    },
    resize,
    /** Renders `k` (0..1) of the full pixel density: fewer pixels when the device is struggling. */
    setQuality(k: number) {
      dpr = fullDpr * k;
      renderer.setPixelRatio(dpr);
      composer.setPixelRatio(dpr);
      resize();
    },
    render(time: number, zoomSpeed: number) {
      zoomBlur.uniforms.uStrength.value = calm.matches ? 0 : Math.min(Math.abs(zoomSpeed) * 0.05, 0.12);
      finish.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
