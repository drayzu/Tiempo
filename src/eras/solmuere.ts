import * as THREE from 'three';
import { gauss, rng, smoothstep } from '../lib/math';
import { bbColor } from '../lib/cuerpo-negro';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { NORTE, SOL_DESDE_TIERRA } from './ahora';

/**
 * El Sol se apaga (from now to about 8 billion years ahead). 1 unit = 10¹¹ m (two thirds of an AU).
 *
 * The camera draws back from the Earth to the inner planets. The Sun brightens; in about a billion
 * years the Earth's oceans boil away and its water escapes into space (our proton with it). In about
 * five billion the Sun swells into a red giant (its surface a slow boil of huge convection cells)
 * that swallows Mercury and Venus, maybe the Earth. Then it lets go of its outer layers in a
 * planetary nebula (blue-green inside, red at its edges) and what is left is a white dwarf the size
 * of the Earth, cooling for billions of years. (Figures to verify; see ESTADO.md.)
 */

const AU = 1.496;
/** The Earth, in this era's units, where it is now (opposite the Sun's direction). */
const TIERRA = SOL_DESDE_TIERRA.clone().multiplyScalar(-1e6 / 1e11);
const E1 = TIERRA.clone().normalize();
const E2 = new THREE.Vector3().crossVectors(NORTE, E1).normalize();
const N3 = new THREE.Vector3().crossVectors(E1, E2).normalize();
const onPlane = (r: number, ang: number) => E1.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(E2, Math.sin(ang) * r);
const PLANETS = [
  { name: 'Mercurio', r: 0.387 * AU, ang: 2.1, hex: 0xb8b0a8, size: 0.02 },
  { name: 'Venus', r: 0.723 * AU, ang: -1.2, hex: 0xffe2b0, size: 0.03 },
  { name: 'la Tierra', r: AU, ang: 0, hex: 0x6fa8ff, size: 0.03 },
  { name: 'Marte', r: 1.524 * AU, ang: 0.9, hex: 0xff8a5a, size: 0.024 },
  { name: 'Júpiter', r: 5.2 * AU, ang: -2.4, hex: 0xffd8a8, size: 0.06 },
];

const MOVE = /* glsl */ `
  if (aKind < 0.5) {
    // The Sun: a ball of points whose radius is its size now; a slow boil of cells on its surface.
    vec3 dir = normalize(position + 1e-5);
    float cell = 0.6 + 0.4 * sin(dot(dir, vec3(7.1, 5.3, 6.7)) * uCells + uTime * 0.3 + seed * 2.0);
    p = dir * uSunR * (0.94 + 0.06 * seed);
    em = uSunCol * uSunL * 0.6 * mix(1.0, cell, uBoil);
    // (sized so the points just cover the sphere)
    sz *= max(uSunR * 0.07, 0.004);
    em *= 1.0 - uNeb;
  } else if (aKind < 1.5) {
    // The planetary nebula: an hourglass shell, blue-green inside, red at its edges.
    vec3 dir = normalize(position + 1e-5);
    float lobe = 1.0 + 0.7 * pow(abs(dot(dir, uAxis)), 2.0);
    p = position * uNebR * lobe * (0.86 + 0.22 * seed);
    em *= uNebGlow;
    sz *= max(uNebR * 0.16, 0.02);
  } else if (aKind < 2.5) {
    // The white dwarf.
    em *= uNeb;
  } else if (aKind < 3.5) {
    // Planets: swallowed if the giant reaches them; the Earth turns from blue to dry rock.
    float r = length(position);
    float swallowed = smoothstep(uSunR * 0.98, uSunR * 0.9, r);
    em *= 1.0 - swallowed;
    if (aDelay > 0.5) em = mix(em, vec3(0.75, 0.5, 0.35) * length(em), uDry);
    // Orbits widen as the Sun loses mass.
    p *= 1.0 + 0.25 * uNeb;
  }
`;

export function solMuere(): EraModule {
  return {
    spec: {
      id: 'futuro',
      acto: 'El futuro cercano',
      certeza: 'T',
      name: 'El Sol se apaga',
      fact: 'El Sol brillará cada vez más, se hinchará y se apagará: le quedan unos cinco mil millones de años.',
      label: 'el Sol se apaga',
      unitExp: 11,
      frame: 8,
      anchor: SOL_DESDE_TIERRA.clone(),
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      fadeE: [-2.6, -1.8, 4.5, 6],
      tint: 0xff8a5a,
      notes: PLANETS.map((pl) => ({ at: onPlane(pl.r, pl.ang).toArray(), text: pl.name })),
      generate() {
        const r = rng(1211);
        const b = materiaBuilder(1212);
        // The Sun (kind 0).
        for (let k = 0; k < 16000; k++) {
          const [x, y, z] = b.onSphere();
          b.push(x, y, z, 0xffffff, 1, 1, { kind: 0 });
        }
        // The nebula (kind 1): an inner blue-green shell and an outer red one (oxygen; hydrogen and
        // nitrogen), soft splats that blend into a glow.
        for (let k = 0; k < 14000; k++) {
          const [x, y, z] = b.onSphere();
          const outer = r() < 0.58;
          const s = outer ? 1 : 0.62;
          b.push(x * s, y * s, z * s, outer ? 0xff5a4a : 0x6fe0d6, 1, outer ? 0.07 : 0.06, { kind: 1 });
        }
        // The white dwarf (kind 2).
        for (let k = 0; k < 20; k++) b.push(gauss(r) * 0.0005, gauss(r) * 0.0005, gauss(r) * 0.0005, 0xdfe8ff, 0.03, 2, { kind: 2, star: true });
        // The planets (kind 3; the Earth marked by aDelay), and their orbits as faint dotted rings.
        PLANETS.forEach((pl) => {
          const at = onPlane(pl.r, pl.ang);
          for (let k = 0; k < 30; k++) b.push(at.x + gauss(r) * pl.size * 0.2, at.y + gauss(r) * pl.size * 0.2, at.z + gauss(r) * pl.size * 0.2, pl.hex, pl.size, 1.6, { kind: 3, delay: pl.name === 'la Tierra' ? 1 : 0, star: true });
          const n = Math.round(260 * Math.sqrt(pl.r));
          for (let k = 0; k < n; k++) {
            const o = onPlane(pl.r, (k / n) * Math.PI * 2);
            b.push(o.x, o.y, o.z, 0xece7db, 0.008, 0.18, { kind: 3 });
          }
        });
        return { main: b.data() };
      },
      assemble(data) {
        const sunCol = new THREE.Color();
        const uni = {
          uSunR: { value: 0.007 },
          uSunL: { value: 1 },
          uSunCol: { value: sunCol },
          uBoil: { value: 0 },
          uCells: { value: 3 },
          uNeb: { value: 0 },
          uNebR: { value: 0 },
          uNebGlow: { value: 0 },
          uDry: { value: 0 },
          uAxis: { value: N3.clone().applyAxisAngle(E1, 0.5) },
        };
        const cloud = materia(data.main as MateriaData, {
          pre: 'uniform float uSunR, uSunL, uBoil, uCells, uNeb, uNebR, uNebGlow, uDry;\nuniform vec3 uSunCol, uAxis;',
          move: MOVE,
          uniforms: uni,
        });
        cloud.u.uMaxPx.value = 60;
        const object = new THREE.Group();
        object.add(cloud.points);
        const bb = { r: 0, g: 0, b: 0 };
        const ours = new THREE.Vector3();
        return {
          object,
          clouds: [cloud],
          update(f) {
            const g = (k: string) => f.tl.get(`sm.${k}`, f.p);
            const giant = g('giant');
            const neb = g('neb');
            const dry = g('dry');
            // Radius: 1 solar radius (0.007 units) to about 1.1 AU at the tip of the giant branch.
            uni.uSunR.value = 0.007 * Math.pow(1.1 * AU / 0.007, Math.pow(giant, 1.6)) * (1 - 0.9 * neb);
            // Temperature: a little hotter as it brightens, then a cool red giant (≈ 3 000 K).
            const T = (5772 + 300 * dry) * (1 - giant) + 3100 * giant;
            bbColor(T, bb);
            sunCol.setRGB(bb.r, bb.g, bb.b);
            uni.uSunL.value = (1.2 + 0.4 * dry) * (1 - 0.82 * giant) + 0.08;
            uni.uBoil.value = smoothstep(0.2, 0.7, giant);
            uni.uCells.value = 3 + 2 * giant;
            uni.uNeb.value = neb;
            uni.uNebR.value = (1.1 * AU) * Math.pow(30, neb) * smoothstep(0, 0.05, neb);
            uni.uNebGlow.value = smoothstep(0, 0.15, neb) * (1 - 0.6 * smoothstep(0.6, 1, neb));
            uni.uDry.value = dry;
            // Our proton leaves the Earth with its water and drifts out, then rides the nebula's wind.
            ours.copy(TIERRA).multiplyScalar(1 + 0.6 * smoothstep(0.3, 1, dry) + 1.5 * neb);
            ours.addScaledVector(N3, 0.25 * smoothstep(0.3, 1, dry));
          },
          proton: () => ours,
        };
      },
    },
    choreo(tl, era) {
      // From the Earth, drawing back to see the inner planets and the Sun.
      tl.with(0.02, { reloj: 3 });
      tl.set({ 'sm.dry': 0, 'sm.giant': 0, 'sm.neb': 0 });
      tl.to(3.0, { era: era.index, e: era.home - 0.1, ah: 8.0, fondo: 1, horno: 0, fov: 52, yaw: 0.25, pitch: 0.55, roll: 0, bloom: 0.55, umbral: 0.2 });
      tl.label('futuro');
      tl.caption(3.6, 'La Tierra pierde sus océanos', 'El Sol brilla cada vez más. En unos mil millones de años el agua de la Tierra se evapora y escapa al espacio. Nuestro protón se va con ella.');
      tl.to(3.6, { 'sm.dry': 1, ah: 9.1, yaw: 0.45 });
      tl.caption(4.0, 'Gigante roja', 'En unos cinco mil millones de años el Sol se hincha hasta casi la órbita de la Tierra y se traga a Mercurio y a Venus. Quizá también a la Tierra.');
      tl.to(4.0, { 'sm.giant': 1, ah: 9.88, e: era.home + 0.25, yaw: 0.8, pitch: 0.4 });
      tl.caption(4.0, 'Nebulosa planetaria', 'Suelta sus capas en una nube de colores. Queda una enana blanca del tamaño de la Tierra, que se enfriará durante billones de años.');
      tl.to(4.0, { 'sm.neb': 1, ah: 9.92, e: era.home + 1.7, yaw: 1.2, pitch: 0.3 });
    },
  };
}
