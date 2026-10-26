import * as THREE from 'three';
import { smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import type { EraModule } from '../engine/eras';
import { infinito, infinitoData } from './infinito';

/**
 * El gas se enfría (≈ 4 to 60 million years): the bridge from the atoms, a millimetre apart, to the
 * cosmic web, some twenty orders of magnitude larger. Nothing shines any more; the camera draws back
 * through cold gas that looks the same at every scale it crosses, an even mist at first, and the
 * wrinkles inflation left grow under gravity into clumps and threads: by the end, the web where the
 * first stars will light. Our proton stays at the centre of it all.
 */

const LT = (years: number) => Math.log10(years * YEAR);
const SPACING = 0.6;

export function gas(): EraModule {
  return {
    spec: {
      id: 'gas',
      acto: 'Oscuridad y amanecer',
      certeza: 'O',
      name: 'El gas se enfría',
      fact: 'Ya no hay luz que ver. El gas, frío y casi uniforme, guarda arrugas diminutas: la gravedad las agranda.',
      ficha: ['la edad oscura: de 380 000 a ~100 millones de años', 'la materia oscura es ~85 % de toda la materia', 'el gas se enfría de ~3 000 K a ~10 K'],
      label: 'gas frío',
      unitExp: 8,
      frame: 30,
      frameCenter: new THREE.Vector3(),
      fade: [0.4, 0.6],
      fadeE: [-14, -12, 12, 14],
      tint: 0x6f86b0,
      generate() {
        const mist = infinitoData({
          seed: 901,
          layers: 7,
          spacing: SPACING,
          perLayer: 3500,
          point(r, o) {
            const x = r() * 2 - 1;
            const y = r() * 2 - 1;
            const z = r() * 2 - 1;
            const d = Math.hypot(x, y, z);
            if (d > 1 || d < 0.1) return false;
            Object.assign(o, { x, y, z, hex: 0x8ea6c8, size: 0.004, light: 0.36 });
            return true;
          },
        });
        // Threads and clumps: points near the ridges of a field of sines (a web at every scale).
        const web = infinitoData({
          seed: 902,
          layers: 7,
          spacing: SPACING,
          perLayer: 6000,
          point(r, o) {
            const x = r() * 2 - 1;
            const y = r() * 2 - 1;
            const z = r() * 2 - 1;
            const d = Math.hypot(x, y, z);
            if (d > 1 || d < 0.1) return false;
            const a = Math.sin(x * 6.3 + Math.sin(z * 2.1) * 1.4);
            const b = Math.sin(y * 5.7 + Math.sin(x * 2.4) * 1.4);
            const c = Math.sin(z * 6.9 + Math.sin(y * 1.9) * 1.4);
            // Near where two of the three are small: threads; where all three: knots.
            const t = Math.min(Math.abs(a) + Math.abs(b), Math.abs(b) + Math.abs(c), Math.abs(c) + Math.abs(a));
            if (t > 0.3) return false;
            const knot = Math.abs(a) + Math.abs(b) + Math.abs(c) < 0.45;
            Object.assign(o, { x, y, z, hex: knot ? 0xc8d4f0 : 0x9fb3d6, size: knot ? 0.006 : 0.0042, light: knot ? 0.6 : 0.34 });
            return true;
          },
        });
        return { mist, web };
      },
      assemble(data) {
        const mist = infinito(data.mist as ReturnType<typeof infinitoData>, SPACING);
        const web = infinito(data.web as ReturnType<typeof infinitoData>, SPACING);
        const object = new THREE.Group();
        object.add(mist.points, web.points);
        const center = new THREE.Vector3();
        return {
          object,
          clouds: [],
          update(f) {
            // Drawing back: the field shrinks by the decades the view grows.
            const zoom = -f.e;
            // The wrinkles grow with time: from an even mist to threads and knots.
            const c = smoothstep(LT(5e6), LT(5.5e7), f.lt);
            mist.update(f.camera, object, f.focal, f.dpr, f.time, f.alpha * (1 - 0.75 * c), zoom);
            web.update(f.camera, object, f.focal, f.dpr, f.time, f.alpha * (0.15 + 0.85 * c), zoom);
          },
          proton: () => center,
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      // Out of the fading glow, drawing back twenty orders of magnitude while the gas clumps.
      tl.to(2.2, { era: era.index, e: 2, lt: LT(5e6), fondo: 1, horno: 0, fov: 62, yaw: -0.25, pitch: 0.08, roll: 0 });
      tl.label('gas');
      tl.to(3.2, { e: 9, lt: LT(1.6e7), yaw: 0.15, pitch: 0.16, roll: 0.05 });
      tl.to(3.2, { e: 16.5, lt: LT(4.5e7), yaw: 0.4, pitch: 0.05, roll: -0.04 });
    },
  };
}
