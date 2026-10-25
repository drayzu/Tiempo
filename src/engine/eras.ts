import * as THREE from 'three';
import { smoothstep } from '../lib/math';
import type { Materia } from './materia';
import type { Timeline } from './timeline';

/**
 * The eras of the journey, in the order they are lived (not by size, as Potencias' worlds were).
 * Each era has its own units and sits inside or around the one before it (`anchor`, in the
 * previous era's units, and the ratio of their units). The scale can go up (atoms → the cosmic web)
 * or down (the web → a star → the Earth).
 *
 * The choreography decides where we are with one track, `era`: 3 means fully in era 3; 3.4 means
 * 40 % of the way from era 3 into era 4. Both show during that stretch (each era says when it
 * arrives and when it leaves, `fade`).
 *
 * Precision: matrices are composed in double precision relative to the pivot (the era we are
 * leaving), and only for eras near it, so 150 orders of magnitude of size never reach the GPU raw.
 *
 * Built for a long journey: an era builds its particles only when the journey comes near it and
 * frees them once it is far. Building is split in two, as in Potencias: `generate` (heavy, pure, in
 * a worker; it may be async) and `assemble` (cheap, on the main thread).
 */

export type Certeza = 'O' | 'T' | 'E';

export interface EraFrame {
  time: number;
  dt: number;
  /** Scroll progress in beats. */
  p: number;
  tl: Timeline;
  /** log10 of seconds since the beginning, and the temperature of the universe then (K). */
  lt: number;
  T: number;
  /** Current scale exponent (log10 of metres seen vertically), and this era's home. */
  e: number;
  home: number;
  /** This era's visibility, and another's. */
  alpha: number;
  alphaOf(id: string): number;
  /** How far the journey is into this era (0 arriving .. 1 here) and out of it (0 here .. 1 gone). */
  into: number;
  out: number;
  camera: THREE.PerspectiveCamera;
  /** The camera's focal length in device pixels, the device pixel ratio, the canvas size. */
  focal: number;
  dpr: number;
  W: number;
  H: number;
}

/** A note of the plate layer (key I): a point in the era's own units, and its name. */
export interface Note {
  at: [number, number, number];
  text: string;
  /** Only while this track (0..1) is above 0.5, e.g. `'niebla.clear'`. */
  when?: string;
  /** Shown with the plate layer off too. */
  always?: boolean;
}

export type EraData = Record<string, unknown>;

export interface EraContent {
  object: THREE.Object3D;
  clouds: Materia[];
  update?(f: EraFrame): void;
  /** Our proton in this era's units, or null (not born yet, or not shown here). */
  proton?(f: EraFrame): THREE.Vector3 | null;
  /** Drawings of its own on the 2D plate (device px). `on`: the plate layer is on. */
  placa?(g: CanvasRenderingContext2D, f: EraFrame & { u: number }, on: boolean, toScreen: (v: THREE.Vector3) => { x: number; y: number; z: number }): void;
  /** The interface ink it asks for: 0 light (dark film) .. 1 dark (when it floods the screen with light). */
  tinta?(f: EraFrame): number;
}

export interface EraSpec {
  id: string;
  /** Its act (the cone groups eras by act). */
  acto: string;
  certeza: Certeza;
  name: string;
  /** One sentence. */
  fact: string;
  /** Short label for the cone. */
  label: string;
  /** log10 of metres per local unit. */
  unitExp: number;
  /** Local units seen vertically at its home framing. */
  frame: number;
  /** Where its origin sits in the previous era, in the previous era's units. */
  anchor?: THREE.Vector3;
  /** What the camera frames, in local units. */
  frameCenter: THREE.Vector3;
  /** Arriving, fully shown by this fraction of the way in; leaving, starts to fade at this fraction of the way out. */
  fade?: [number, number];
  /**
   * Also by scale, as Potencias' worlds (exponents relative to home): fades in from a to b, out from
   * c to d. An era seen far from its own scale would be blobs or dust. Default [-3.2, -1.8, 2.6, 4].
   */
  fadeE?: [number, number, number, number];
  /** Colour of the time dust while this era is in view. */
  tint: number;
  notes?: Note[];
  generate(): EraData | Promise<EraData>;
  assemble(data: EraData): EraContent;
}

/** An era as a module: its spec, plus its own part of the choreography (it should `label` its id). */
export interface EraModule {
  spec: EraSpec;
  choreo(tl: Timeline, era: Era): void;
}

export interface Era extends EraSpec {
  index: number;
  home: number;
  group: THREE.Group;
  alpha: number;
  into: number;
  out: number;
  content: EraContent | null;
  pending: boolean;
  born: number;
}

const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
/** Eras this many steps from the pivot are placed (and may show). */
const REACH = 3;
/** Content is kept a little beyond that, so turning back doesn't rebuild. */
const KEEP = REACH + 2;
/** An era whose content arrives late fades in over this long, never pops. */
const ARRIVE_MS = 900;

export class Eras {
  readonly list: Era[];
  /** L[i]: era i's units → era i-1's units. */
  private L: THREE.Matrix4[] = [];
  private Linv: THREE.Matrix4[] = [];
  private relP: THREE.Matrix4[];
  private screen = new THREE.Matrix4();
  private shift = new THREE.Matrix4();
  private ca = new THREE.Vector3();
  private cb = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private pa = new THREE.Vector3();
  private pb = new THREE.Vector3();

  /** After `place`: the focus in pivot units, the scene scale, the segment and how far into it. */
  readonly focus = new THREE.Vector3();
  scale = 1;
  segment = 0;
  blend = 0;

  private request?: (id: string) => Promise<EraData>;

  constructor(specs: EraSpec[], root: THREE.Object3D, request?: (id: string) => Promise<EraData>) {
    this.request = request;
    this.list = specs.map((s, index) => {
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.visible = false;
      root.add(group);
      return { ...s, index, home: s.unitExp + Math.log10(s.frame), group, alpha: 0, into: 0, out: 0, content: null, pending: false, born: 0 };
    });
    for (let i = 1; i < this.list.length; i++) {
      const ratio = Math.pow(10, this.list[i].unitExp - this.list[i - 1].unitExp);
      this.L[i] = new THREE.Matrix4().compose(this.list[i].anchor ?? new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(ratio, ratio, ratio));
      this.Linv[i] = this.L[i].clone().invert();
    }
    this.relP = this.list.map(() => new THREE.Matrix4());
  }

  /** Splits the `era` track into the segment (the era being left) and how far into the next. */
  static split(eraT: number, n: number) {
    const a = Math.min(Math.max(Math.floor(eraT), 0), n - 2);
    return { a, w: Math.min(Math.max(eraT - a, 0), 1) };
  }

  /**
   * Places every era for the `era` track and scale exponent `e`. `travel(i)` offsets era i's framing
   * centre (its own units) to fly along or through it; `keep(i)` (0..1) holds an era in view beyond
   * its own fade, negative (-1..0) hides it.
   */
  place(eraT: number, e: number, viewH: number, travel: (i: number) => THREE.Vector3 | null, keep?: (i: number) => number) {
    const E = this.list;
    const n = E.length;
    const { a, w } = Eras.split(eraT, n);
    this.segment = a;
    this.blend = w;

    const lo = Math.max(0, a - REACH);
    const hi = Math.min(n - 1, a + 1 + REACH);
    this.relP[a].identity();
    for (let i = a + 1; i <= hi; i++) this.relP[i].multiplyMatrices(this.relP[i - 1], this.L[i]);
    for (let i = a - 1; i >= lo; i--) this.relP[i].multiplyMatrices(this.relP[i + 1], this.Linv[i + 1]);

    // The focus drifts from the era being left to the one arriving, in the middle of the way.
    const center = (i: number, out: THREE.Vector3) => {
      out.copy(E[i].frameCenter);
      const t = travel(i);
      if (t) out.add(t);
      return out.applyMatrix4(this.relP[i]);
    };
    this.focus.copy(center(a, this.ca)).lerp(center(a + 1, this.cb), smoothstep(0.15, 0.85, w));

    // Screen: pivot units → scene units, the focus at the origin.
    this.scale = viewH * Math.pow(10, E[a].unitExp - e);
    const s = this.scale;
    this.screen.makeScale(s, s, s).multiply(this.shift.makeTranslation(-this.focus.x, -this.focus.y, -this.focus.z));

    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const era = E[i];
      if (Math.abs(i - a) > KEEP && (era.content || era.pending)) this.release(era);
      const [fin, fout] = era.fade ?? [0.55, 0.45];
      era.into = i < a ? 1 : i === a ? 1 : i === a + 1 ? w : 0;
      era.out = i < a ? 1 : i === a ? w : 0;
      let want = i === a ? 1 - smoothstep(fout, 1, w) : i === a + 1 ? smoothstep(0, fin, w) : 0;
      const [ea, eb, ec, ed] = era.fadeE ?? [-3.2, -1.8, 2.6, 4];
      want *= smoothstep(era.home + ea, era.home + eb, e) * (1 - smoothstep(era.home + ec, era.home + ed, e));
      // At the very end of the journey the last era stays.
      if (i === n - 1 && a === n - 2 && w >= 1) want = 1;
      const k = i >= lo && i <= hi ? (keep?.(i) ?? 0) : 0;
      if (k > 0) want = Math.max(want, k);
      else if (k < 0) want *= 1 + k;
      if (want > 0.002 && i >= lo && i <= hi) this.ensure(era);
      era.alpha = era.content ? want * smoothstep(0, ARRIVE_MS, now - era.born) : 0;
      era.group.visible = era.alpha > 0.002;
      if (!era.group.visible) continue;
      era.group.matrix.multiplyMatrices(this.screen, this.relP[i]);
      era.group.matrixWorldNeedsUpdate = true;
    }
  }

  /**
   * Where our proton is, in scene units (null before it exists). Each era says where it is in its
   * own units; across a transition the two answers blend.
   */
  proton(frameOf: (era: Era) => EraFrame, out: THREE.Vector3): THREE.Vector3 | null {
    const a = this.segment;
    const w = this.blend;
    const A = this.list[a];
    const B = this.list[a + 1];
    const pa = A.content?.proton?.(frameOf(A)) ?? null;
    const pb = B?.content?.proton?.(frameOf(B)) ?? null;
    if (!pa && !pb) return null;
    const toPivot = (v: THREE.Vector3, i: number, o: THREE.Vector3) => o.copy(v).applyMatrix4(this.relP[i]);
    if (pa) toPivot(pa, a, this.pa);
    if (pb) toPivot(pb, a + 1, this.pb);
    const k = smoothstep(0.15, 0.85, w);
    if (pa && pb) out.copy(this.pa).lerp(this.pb, k);
    else out.copy(pa ? this.pa : this.pb);
    return out.applyMatrix4(this.screen);
  }

  /** A point of era i (its units) in scene units. */
  toScene(i: number, v: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(v).applyMatrix4(this.relP[i]).applyMatrix4(this.screen);
  }

  /** Builds ahead of time, at most one era per frame, among those the journey is about to need. */
  warm() {
    const a = this.segment;
    for (const i of [a + 1, a, a + 2, a - 1]) {
      const era = this.list[i];
      if (era && !era.content && !era.pending) {
        this.ensure(era);
        return;
      }
    }
  }

  private ensure(era: Era) {
    if (era.content || era.pending) return;
    const t0 = performance.now();
    era.pending = true;
    const local = () => Promise.resolve(era.generate());
    const job = this.request ? this.request(era.id).catch(local) : local();
    job.then(
      (data) => {
        // Released while the worker was busy: drop it.
        if (!era.pending) return;
        era.pending = false;
        this.adopt(era, data, t0);
      },
      (err) => {
        era.pending = false;
        console.error(`[tiempo] ${era.id}:`, err);
      },
    );
  }

  private adopt(era: Era, data: EraData, t0: number) {
    era.content = era.assemble(data);
    era.group.add(era.content.object);
    era.born = performance.now();
    if (DEBUG) console.info(`[tiempo] ${era.id}: ready after ${(performance.now() - t0).toFixed(0)} ms`);
  }

  private release(era: Era) {
    era.pending = false;
    if (!era.content) return;
    era.content.object.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    era.group.remove(era.content.object);
    era.content = null;
  }
}
