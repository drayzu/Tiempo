import type { EraModule } from '../engine/eras';
import { planck } from './planck';
import { niebla } from './niebla';
import { amanecer } from './amanecer';
import { ahora } from './ahora';
import { quarks } from './quarks';
import { aniquilacion } from './aniquilacion';
import { nucleos } from './nucleos';
import { inflacion } from './inflacion';
import { higgs } from './higgs';
import { gas } from './gas';
import { galaxias } from './galaxias';
import { viaLactea } from './vialactea';
import { sol } from './sol';
import { tierra } from './tierra';
import { solMuere } from './solmuere';
import { andromeda } from './andromeda';
import { degenerada, protones, ultimaLuz, oscuridad } from './final';
import { antes, despues } from './provisionales';

import { ripGalaxia, ripSistema, ripPlaneta, ripAtomo, colapso, vacio } from './finales';

export type Final = 'frio' | 'desgarro' | 'colapso' | 'vacio';
export const FINALES: Final[] = ['frio', 'desgarro', 'colapso', 'vacio'];

/**
 * The journey, in the order it is lived. Each era sits inside or around the one before it. After
 * the fork («De aquí en adelante, la física no está segura») the path depends on the chosen ending;
 * all of them end after time, which draws the cover again (the loop).
 */
export function crearEras(final: Final = 'frio'): EraModule[] {
  const comun = [antes, planck(), inflacion(), higgs(), quarks(), aniquilacion(), nucleos(), niebla(), gas(), amanecer(), galaxias(), viaLactea(), sol(), tierra(), ahora(), solMuere()];
  const ramas: Record<Final, EraModule[]> = {
    frio: [andromeda(true), degenerada(), protones(), ultimaLuz(), oscuridad()],
    desgarro: [andromeda(false), ripGalaxia(), ripSistema(), ripPlaneta(), ripAtomo()],
    colapso: [andromeda(false), colapso()],
    vacio: [andromeda(false), vacio()],
  };
  return [...comun, ...ramas[final], despues];
}

/** Every era of every ending (the workers must know them all). */
export function todasLasEras(): EraModule[] {
  const seen = new Map<string, EraModule>();
  for (const f of FINALES) for (const m of crearEras(f)) if (!seen.has(m.spec.id)) seen.set(m.spec.id, m);
  return [...seen.values()];
}
