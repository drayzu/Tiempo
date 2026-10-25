import type * as THREE from 'three';
import type { Timeline } from '../../src/engine/timeline';
import type { Stage } from './stage';

/** One frame of a study scene. */
export interface Frame {
  /** Ambient seconds (still with reduced motion). */
  time: number;
  dt: number;
  /** Progress through the moment, in beats. */
  p: number;
  tl: Timeline;
  /** Canvas size in device pixels, and the plate's unit (px per layout unit). */
  W: number;
  H: number;
  u: number;
  /** Device pixel ratio, and the camera's focal length in device pixels. */
  dpr: number;
  focal: number;
  camera: THREE.PerspectiveCamera;
}

/** What the three clocks read. */
export interface Lectura {
  /** Seconds since the beginning. */
  t: number;
  /** Years before now, when the axis counts back from today (the time zoom), else null. */
  ago: number | null;
  /** Years after now, when the axis counts forward from today, else null. */
  ahead: number | null;
  /** At now: the real clock. */
  now: boolean;
}

export interface Instancia {
  tl: Timeline;
  update(f: Frame): void;
  /** Draws its share of the plate (labels, diagrams) on the 2D layer, in device pixels. */
  placa?(g: CanvasRenderingContext2D, f: Frame): void;
  /** The interface ink over this frame: 0 light ink (dark film) .. 1 dark ink (bright film). */
  tinta?(f: Frame): number;
  /** Overrides the default reading (time from the `lt` track). */
  lectura?(f: Frame): Lectura;
  /** Where on the whole journey (0..1) this frame sits, for the cone. */
  viaje(f: Frame): number;
  dispose(): void;
}

export interface Estilo {
  key: string;
  nombre: string;
  /** One line on what the style is. */
  nota: string;
}

export interface Escena {
  id: string;
  nombre: string;
  estilos: Estilo[];
  montar(stage: Stage, estilo: number): Instancia;
}
