import * as THREE from 'three';

/**
 * The background: a screen shader that knows where each pixel looks (`dir`, a unit vector in the
 * scene), so what it draws sits at infinity and turns with the camera, like a sky. In Tiempo the
 * background is the radiation that fills the universe: its colour is its temperature.
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

/** Every background in use, so the page can keep them facing where the camera looks. */
export const FONDOS: Pantalla[] = [];

export interface Pantalla {
  mesh: THREE.Mesh;
  u: Record<string, THREE.IUniform>;
  /** Per frame, after the camera moves. */
  seguir(camera: THREE.PerspectiveCamera): void;
}

/**
 * `frag` declares its own uniforms and has `vUv` (0..1) and `vDir` (unnormalised view direction);
 * `uTime`, `uAspect` and `uRes` (device px) are provided.
 */
export function pantalla(frag: string, uniforms: Record<string, THREE.IUniform> = {}): Pantalla {
  const u: Record<string, THREE.IUniform> = {
    uCamRot: { value: new THREE.Matrix3() },
    uTanHalf: { value: 0.36 },
    uAspect: { value: 16 / 9 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    ...uniforms,
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAspect;
      uniform vec2 uRes;
      varying vec2 vUv;
      varying vec3 vDir;
      ${frag}
    `,
    uniforms: u,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  const m4 = new THREE.Matrix4();
  const out: Pantalla = {
    mesh,
    u,
    seguir(camera) {
      (u.uCamRot.value as THREE.Matrix3).setFromMatrix4(m4.extractRotation(camera.matrixWorld));
      u.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      u.uAspect.value = camera.aspect;
    },
  };
  FONDOS.push(out);
  return out;
}

/**
 * Trails: line strips drawn as segments with a colour per vertex (additive), for paths of light.
 * `n` strips of `len` points; `set(i, k, x, y, z, r, g, b)` writes point k of strip i.
 */
export function trazos(n: number, len: number) {
  const segs = n * (len - 1);
  const pos = new Float32Array(segs * 6);
  const col = new Float32Array(segs * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return {
    lines,
    /** Writes a whole strip from flat arrays of points and colours (len * 3 each). */
    strip(i: number, p: ArrayLike<number>, c: ArrayLike<number>) {
      let o = i * (len - 1) * 6;
      for (let k = 0; k < len - 1; k++) {
        for (let j = 0; j < 2; j++) {
          const q = (k + j) * 3;
          pos[o] = p[q];
          pos[o + 1] = p[q + 1];
          pos[o + 2] = p[q + 2];
          col[o] = c[q];
          col[o + 1] = c[q + 1];
          col[o + 2] = c[q + 2];
          o += 3;
        }
      }
    },
    commit() {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
