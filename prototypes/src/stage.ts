import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * The studies' stage: Potencias' film (HDR, bloom, ACES, grain and vignette), with the background
 * left to each scene (Tiempo's background is the temperature of the universe, drawn by a screen
 * shader of its own). A fixed size (`?cap=1600x900`) renders captures at that size whatever the
 * window.
 */

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.022 },
    uVignette: { value: 0.55 },
    uFringe: { value: 0.012 },
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

export type Stage = ReturnType<typeof createStage>;

export function createStage(canvas: HTMLCanvasElement, fixed: { w: number; h: number } | null) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!fixed });
  const dpr = fixed ? 1 : Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 400);
  const root = new THREE.Group();
  scene.add(root);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.55, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  const size = new THREE.Vector2();
  function resize() {
    const w = fixed ? fixed.w : innerWidth;
    const h = fixed ? fixed.h : innerHeight;
    size.set(w, h);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    finish.uniforms.uRes.value.set(w * dpr, h * dpr);
  }
  resize();
  if (!fixed) addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    root,
    bloom,
    finish,
    size,
    dpr,
    /** Drawing-buffer size in device pixels. */
    get W() {
      return Math.round(size.x * dpr);
    },
    get H() {
      return Math.round(size.y * dpr);
    },
    /** Back to defaults between scenes. */
    reset() {
      bloom.strength = 0.7;
      bloom.radius = 0.55;
      bloom.threshold = 0.12;
      renderer.toneMappingExposure = 1.1;
      finish.uniforms.uVignette.value = 0.55;
      finish.uniforms.uGrain.value = 0.022;
      camera.position.set(0, 0, 10);
      camera.quaternion.identity();
      camera.fov = 40;
      camera.updateProjectionMatrix();
    },
    render(time: number) {
      finish.uniforms.uTime.value = time;
      composer.render();
    },
  };
}

/** Frees everything under an object (geometries and materials). */
export function liberar(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((y) => y.dispose());
    else mat?.dispose();
  });
  o.removeFromParent();
}
