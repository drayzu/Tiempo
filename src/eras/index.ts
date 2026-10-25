import type { EraModule } from '../engine/eras';
import { planck } from './planck';
import { niebla } from './niebla';
import { amanecer } from './amanecer';
import { ahora } from './ahora';
import { quarks } from './quarks';
import { aniquilacion } from './aniquilacion';
import { nucleos } from './nucleos';
import { antes, inflacion, oscura, galaxias, viaLactea, sol, futuro, final, despues } from './provisionales';

/**
 * The journey, in the order it is lived. Each era sits inside or around the one before it. Shared
 * by the page and the workers that generate the eras, so both know them by the same ids.
 * Phase 1: real eras (Planck, la niebla, la primera estrella, ahora) and provisional ones for the
 * rest of the time axis.
 */
export function crearEras(): EraModule[] {
  return [antes, planck(), inflacion, quarks(), aniquilacion(), nucleos(), niebla(), oscura, amanecer(), galaxias, viaLactea, sol, ahora(), futuro, final, despues];
}
