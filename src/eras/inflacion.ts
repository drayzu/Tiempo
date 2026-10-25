import * as THREE from 'three';
import { smoothstep } from '../lib/math';
import type { EraModule } from '../engine/eras';
import { infinito, infinitoData, infinitoLineas } from './infinito';

/**
 * Inflación (≈ 10⁻³⁶ to 10⁻³² s). In less time than light takes to cross a proton, space grows about
 * 10²⁶ times (to verify: estimates range widely; at least ~10²⁶). The vacuum's quantum wrinkles,
 * tiny and restless, are stretched to cosmic size and freeze once they are larger than the horizon:
 * they are the seeds of every galaxy. Drawn as plate (it is theory): the lattice of Planck's foam,
 * stretched, in an endless zoom out from the centre; small wrinkles still churn, large ones are still;
 * a few frozen seeds in the accent. The universe is cold and dark while it lasts.
 */

const DECADES = 26;
const SPACING = 0.5;

export function inflacion(): EraModule {
  return {
    spec: {
      id: 'inflacion',
      acto: 'El primer segundo',
      certeza: 'T',
      name: 'Inflación',
      fact: 'En menos tiempo del que la luz tarda en cruzar un protón, el espacio crece unas 10²⁶ veces.',
      label: 'inflación',
      unitExp: -35,
      frame: 10,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.6],
      fadeE: [-30, -28, 30, 32],
      tint: 0xcfd8ff,
      generate() {
        // The seeds: a sparse scatter of frozen fluctuations, in the accent.
        return infinitoData({
          seed: 801,
          layers: 8,
          spacing: SPACING,
          perLayer: 260,
          point(r, o) {
            const x = r() * 2 - 1;
            const y = r() * 2 - 1;
            const z = -0.6 - r() * 0.5;
            Object.assign(o, { x, y, z, hex: 0x8fb4ff, size: 0.008, light: 0.8 });
            return Math.hypot(x, y) < 1.4;
          },
        });
      },
      assemble(data) {
        const seeds = infinito(data as ReturnType<typeof infinitoData>, SPACING);
        const lattice = infinitoLineas({ layers: 8, spacing: SPACING, color: 0xece7db, light: 0.26, lines: 24 });
        const object = new THREE.Group();
        object.add(lattice.lines, seeds.points);
        let k = 0;
        return {
          object,
          clouds: [],
          update(f) {
            k = f.tl.get('inf.k', f.p);
            const zoom = k * DECADES;
            // Wrinkles freeze once larger than the horizon (the outer layers).
            lattice.u.uFreeze.value = 4.6;
            lattice.update(f.camera, object, f.time, f.alpha, zoom);
            seeds.update(f.camera, object, f.focal, f.dpr, f.time, f.alpha * smoothstep(0.05, 0.3, k), zoom);
          },
          proton: () => null,
          // The patch that is now our observable universe grows from 10⁻²⁵ m to a few metres; the
          // temperature falls to almost nothing (it comes back when inflation ends: reheating).
          lectura: () => ({ logSize: -24.7 + 25.95 * smoothstep(0, 1, k), logT: NaN }),
        };
      },
    },
    choreo(tl, era) {
      tl.with(0.02, { reloj: 0 });
      tl.set({ 'inf.k': 0 });
      tl.to(2.4, { era: era.index, e: era.home, lt: -36, fondo: 0, horno: 0, fov: 70, yaw: 0, pitch: 0, roll: 0 });
      tl.label('inflacion');
      tl.to(2.2, { 'inf.k': 0.4, lt: -34.4, roll: 0.12 });
      tl.caption(3.0, 'Las semillas', 'Las arrugas del vacío, estiradas a escala cósmica, quedan congeladas: de ellas nacerán las galaxias.');
      tl.to(3.0, { 'inf.k': 0.88, lt: -32.6, roll: 0.3, yaw: 0.15 });
      tl.to(1.0, { 'inf.k': 1, lt: -32, roll: 0.36 });
    },
  };
}
