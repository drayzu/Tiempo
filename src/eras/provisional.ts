import * as THREE from 'three';
import type { Timeline } from '../engine/timeline';
import type { Certeza, Era, EraContent, EraModule } from '../engine/eras';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';

/**
 * Provisional eras: the skeleton of the journey (phase 1), so the whole time axis runs end to end
 * with the real engine. Each is a cloud of points in a simple shape, its name and sentence, its
 * stretch of time and a slow camera. They say so on screen; phases 2 to 4 replace them one by one.
 */

export type Builder = ReturnType<typeof materiaBuilder>;

export interface Reloj {
  /** 0: since the beginning (track `lt`); 1: back from now (`lb`); 3: ahead (`ah`); 4: before time. */
  reloj: number;
  from: number;
  to: number;
}

export interface ProvisionalOpts {
  id: string;
  acto: string;
  certeza: Certeza;
  name: string;
  fact: string;
  label: string;
  unitExp: number;
  frame: number;
  anchor?: [number, number, number];
  frameCenter?: [number, number, number];
  tint: number;
  /** Its card on the plate. */
  ficha?: string[];
  /** Fills the cloud (local units). */
  forma: (b: Builder) => void;
  /** Where our proton is (local units), if it is here. */
  proton?: [number, number, number];
  /** Beats arriving from the previous era, and staying. */
  arrive: number;
  stay: number;
  reloj: Reloj;
  /** Background gain (0 for eras drawn as plates) and full-bleed light. */
  fondo?: number;
  horno?: number;
  /** Scale exponent offsets from home: at the end of the arrival, and at the end of the stay. */
  e?: [number, number];
  fov?: number;
  /** The camera's turn over the stay (yaw, pitch). */
  turn?: [number, number];
  /** The cloud slowly turns (radians per second), as a sign of life. */
  spin?: number;
  sizeUnit?: number;
  /** Visibility by scale (see EraSpec.fadeE). */
  fadeE?: [number, number, number, number];
}

export function provisional(o: ProvisionalOpts): EraModule {
  const track = o.reloj.reloj === 1 ? 'lb' : o.reloj.reloj === 3 ? 'ah' : 'lt';
  return {
    spec: {
      id: o.id,
      acto: o.acto,
      certeza: o.certeza,
      name: o.name,
      fact: o.fact,
      ficha: o.ficha,
      label: o.label,
      unitExp: o.unitExp,
      frame: o.frame,
      anchor: o.anchor ? new THREE.Vector3(...o.anchor) : undefined,
      frameCenter: new THREE.Vector3(...(o.frameCenter ?? [0, 0, 0])),
      tint: o.tint,
      fadeE: o.fadeE,
      generate() {
        const b = materiaBuilder(o.id.length * 131 + o.unitExp * 7);
        o.forma(b);
        return { main: b.data() };
      },
      assemble(data): EraContent {
        const cloud = materia(data.main as MateriaData, { sizeUnit: o.sizeUnit ?? 1 });
        cloud.u.uNear.value = 1;
        const object = new THREE.Group();
        object.add(cloud.points);
        const ours = o.proton ? new THREE.Vector3(...o.proton) : null;
        return {
          object,
          clouds: [cloud],
          update(f) {
            if (o.spin) object.rotation.y = f.time * o.spin;
            object.updateMatrix();
          },
          proton: () => (ours ? ours.clone().applyEuler(object.rotation) : null),
        };
      },
    },
    choreo(tl: Timeline, era: Era) {
      const [e0, e1] = o.e ?? [0, 0.15];
      const [yaw, pitch] = o.turn ?? [0.25, 0.05];
      const clock = { reloj: o.reloj.reloj, [track]: o.reloj.from };
      if (era.index === 0) tl.set({ era: 0, e: era.home + e0, fov: o.fov ?? 50, fondo: o.fondo ?? 1, horno: o.horno ?? 0, ...clock });
      else {
        // The clock switches mode at the start of the arrival (a step, never a blend between modes);
        // an era without a sky drops it at once (else the clock's way back through hot times would
        // light it up on the way).
        tl.with(0.02, { reloj: o.reloj.reloj, ...(o.fondo === 0 ? { fondo: 0 } : {}) });
        tl.to(o.arrive, { era: era.index, e: era.home + e0, fov: o.fov ?? 50, fondo: o.fondo ?? 1, horno: o.horno ?? 0, yaw: 0, pitch: 0, roll: 0, [track]: o.reloj.from });
      }
      tl.label(era.id);
      tl.to(o.stay, { e: era.home + e1, [track]: o.reloj.to, yaw, pitch });
    },
  };
}

/** Marks a module's era as provisional (the page says so on screen). */
export function marcar(m: EraModule): EraModule {
  return { ...m, spec: Object.assign(m.spec, { provisional: true }) };
}
