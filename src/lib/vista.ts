import * as THREE from 'three';

/**
 * The camera's angles (the choreography's `yaw`, `pitch`, `roll`) to sit on the side `dir` of the
 * focus (era units), with `up` pointing up on screen. The scene turns about the focus and the camera
 * looks down −z, so these are the Euler angles (YXZ) of the turn that brings `dir` to +z and `up`
 * towards +y. Angles are interpolated one by one: yaw and roll are unwrapped near `ref` so they never
 * jump by a whole turn.
 */
export function vista(dir: THREE.Vector3, up: THREE.Vector3, ref = { yaw: 0, roll: 0 }, roll = 0) {
  const z = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z).transpose();
  const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
  const near = (a: number, r: number) => a + Math.round((r - a) / (Math.PI * 2)) * Math.PI * 2;
  return { yaw: near(e.y, ref.yaw), pitch: e.x, roll: near(e.z + roll, ref.roll) };
}

/** Travel offsets (`<id>.fx/fy/fz`) that put an era's focus at `v` (its units). */
export const viajeA = (id: string, v: THREE.Vector3) => ({ [`${id}.fx`]: v.x, [`${id}.fy`]: v.y, [`${id}.fz`]: v.z });
