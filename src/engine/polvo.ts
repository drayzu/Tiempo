import * as THREE from 'three';

/**
 * Scale dust: faint motes in screen space that stream with the zoom (outward when growing,
 * inward when shrinking), one decade of radius per cycle. It keeps the journey feeling alive
 * between worlds and makes the speed of the zoom legible.
 */
export function createScaleDust(pixelRatio: number, count = 2400) {
  const dir = new Float32Array(count);
  const r0 = new Float32Array(count);
  const phase = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    dir[i] = Math.random() * Math.PI * 2;
    r0[i] = 0.15 + Math.random() * 0.85;
    phase[i] = Math.random();
    size[i] = 0.8 + Math.random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 1));
  geo.setAttribute('aR0', new THREE.BufferAttribute(r0, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const uniforms = {
    uE: { value: 0 },
    uAspect: { value: 1 },
    uPR: { value: pixelRatio },
    uGain: { value: 0 },
    uColor: { value: new THREE.Color() },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aDir, aR0, aPhase, aSize;
        uniform float uE, uAspect, uPR;
        varying float vA;
        void main() {
          float s = fract(aPhase + uE * 0.55);
          float R = aR0 * exp((1.0 - s) * 3.2) * 0.06;
          vec2 pos = vec2(cos(aDir), sin(aDir)) * R;
          pos.x /= uAspect;
          gl_Position = vec4(pos, 0.0, 1.0);
          gl_PointSize = aSize * uPR * (0.6 + (1.0 - s) * 2.4);
          vA = sin(3.14159 * s);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uGain;
        uniform vec3 uColor;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          gl_FragColor = vec4(uColor * exp(-dot(c, c) * 16.0) * vA * uGain, 1.0);
        }
      `,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 10;
  return {
    points,
    update(e: number, zoomSpeed: number, aspect: number, tint: THREE.Color) {
      uniforms.uE.value = e;
      uniforms.uAspect.value = aspect;
      uniforms.uGain.value = 0.05 + Math.min(Math.abs(zoomSpeed), 3) * 0.12;
      uniforms.uColor.value.copy(tint);
    },
  };
}
