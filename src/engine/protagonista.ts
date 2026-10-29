import * as THREE from 'three';

/**
 * Our proton: the thread of the journey, a point of the accent colour that is never lost. Each era
 * says where it is; this draws it, always a few pixels across (it is the one thing the eye follows),
 * with a soft halo. The plate adds a fine ring around it.
 */

const VERT = /* glsl */ `
  uniform float uPx;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPx;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha, uInk;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    float core = exp(-d2 * 90.0);
    float halo = exp(-d2 * 14.0) * 0.35;
    float f = (core + halo) * uAlpha;
    // A dark core over bright light, so the blue still reads on a full-bleed screen.
    gl_FragColor = vec4(uColor * f, core * uInk * uAlpha);
  }
`;

export const ACCENT = 0x8fb4ff;

export function createProtagonista() {
  const pos = new Float32Array(3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const u = {
    uPx: { value: 16 },
    uColor: { value: new THREE.Color(ACCENT).multiplyScalar(2.2) },
    uAlpha: { value: 0 },
    uInk: { value: 0 },
  };
  const points = new THREE.Points(
    geo,
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
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 50;
  const at = new THREE.Vector3();
  let shown = 0;
  return {
    points,
    /** Where it is (scene units), or null; `ink` (0..1) gives it a dark core over bright light. */
    update(p: THREE.Vector3 | null, dpr: number, ink: number, dt: number) {
      const target = p ? 1 : 0;
      shown += (target - shown) * Math.min(1, dt * 4);
      if (p) {
        at.copy(p);
        pos[0] = p.x;
        pos[1] = p.y;
        pos[2] = p.z;
        geo.attributes.position.needsUpdate = true;
      }
      u.uAlpha.value = shown;
      u.uInk.value = ink;
      u.uPx.value = 15 * dpr;
    },
    get visible() {
      return shown > 0.02;
    },
    get alpha() {
      return shown;
    },
    /** Last known place (scene units). */
    at,
  };
}

/** Infinito's «tú» (infinito/estudios/comun.ts, TU): the series' point for you. */
export const TU = new THREE.Color(0.45, 1.0, 0.85);

/**
 * A lone point drawn like the protagonist (a core, a soft halo, a dark core over bright light), for
 * the opening's «tú» and proton and for you in «Ahora». Its uniforms are set by whoever owns it.
 */
export function createPunto(color: THREE.Color) {
  const u = { uPx: { value: 16 }, uColor: { value: color }, uAlpha: { value: 0 }, uInk: { value: 0 } };
  const points = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
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
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 60;
  return { points, u };
}
